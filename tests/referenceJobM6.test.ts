// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, layOutCabinets, layoutProblems, partBox, partTitle, placeGroups, runPlacementsOf } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import type { CasesContext, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { applyCabinetLayout, createKitchenProject, makeLShaped } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/**
 * Milestone 6's acceptance: the kitchen comes out complete, as one job, and stands in its
 * room. A frameless kitchen in a 12' × 10' room: an L of base runs turning the back-left
 * corner (the back run starts with a blind corner cabinet), a wall run over each. The same
 * kitchen with a diagonal and with an L-shaped corner cabinet in place of the blind one is
 * complete too. Complete means every part is cut once (on a blank or the saw cut list),
 * every feature is made by a row of the plan, with the Kreg jig or on the saw, every file
 * parses and follows the post rules, and the project survives export and import.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = lowRiderJobShop();
const machine = activeMachine(shop);

function withDiagonal(): Project {
  const project = createKitchenProject();
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('36"');
  stored.corner = { kind: 'diagonal', side: 'left' };
  applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');
  return project;
}
function withLShaped(): Project {
  const project = createKitchenProject();
  makeLShaped(project, 'cabinet-1', 'left');
  return project;
}

/** Where every cabinet stands, as the whole-project view lays it out (case depth for the back). */
function places(project: Project) {
  const context = project.context as CasesContext;
  const cabinets = cabinetsOf(project);
  const laid = cabinets.map((c) => ({
    id: c.id,
    width: c.size.width.mm,
    back: c.size.depth.mm,
    form: c.form,
    offFloor: c.form === 'wall' ? c.offFloor?.mm : undefined,
    runId: c.runId,
    name: c.name,
    bottom: c.form === 'wall' ? (c.offFloor?.mm ?? 0) : 0,
    top: (c.form === 'wall' ? (c.offFloor?.mm ?? 0) : 0) + c.size.height.mm,
    ...(c.corner?.kind === 'diagonal' ? { diagonal: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
    ...(c.corner?.kind === 'lShaped' ? { lShaped: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
  }));
  const { placements, aligned } = runPlacementsOf(context.runs, context);
  return { cabinets, at: layOutCabinets(context.room, laid, placements, aligned), problems: layoutProblems(context.room!, placeGroups(laid, placements, aligned), laid, (k) => k) };
}

function complete(name: string, make: () => Project) {
  describe(`${name}: complete`, () => {
    const project = make();
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    const lists = buildLists(job, project, shop, L);
    const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';

    it('plans with nothing in the way', () => {
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    });

    it('cuts every part once: on one blank, or on the saw cut list; shaped parts on the CNC', () => {
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
      expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
      const sawn = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.labels));
      for (const part of all) {
        const label = lists.parts.find((p) => p.partId === part.id)!.label;
        expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), partTitle(part)).toHaveLength(onCnc(part.id) ? 1 : 0);
        expect(sawn.filter((l) => l === label), partTitle(part)).toHaveLength(onCnc(part.id) ? 0 : 1);
        // A shaped part goes to the CNC when it fits, else to the saw with its outline cut by hand.
        if (part.shaped && !onCnc(part.id)) expect(job.plan.parts.find((p) => p.partId === part.id)!.steps.map((s) => s.label)).toContain('Angles cut to the outline');
      }
    });

    it('makes every feature: in a row of the plan, with the Kreg jig, or on the saw', () => {
      const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
      const kregLabels = new Set(lists.kreg.map((k) => k.label));
      const missing: string[] = [];
      for (const part of all) {
        const label = lists.parts.find((p) => p.partId === part.id)!.label;
        for (const feature of part.features) {
          if (planned.has(`${part.id}:${feature.id}`)) continue;
          if (feature.kind === 'cutout' && !onCnc(part.id)) continue;
          if (feature.kind === 'pocketHole' && kregLabels.has(label)) continue;
          missing.push(`${partTitle(part)}: ${feature.id}`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('writes a file for every setup that cuts, each parsing and following the post rules', async () => {
      const cutting = job.plan.blanks.flatMap((b) => b.setups.filter((s) => s.operationKeys.length > 0));
      expect(job.programs).toHaveLength(cutting.length);
      for (const file of job.files) {
        const lines = file.text.split('\n');
        expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
        expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
      expect(job.files.every((f) => f.name.startsWith('kitchen-'))).toBe(true);
      expect(machine.id).toBe('lowrider-3');
    });

    it('stands in its room: every cabinet inside it, nothing in the same place or past a wall', () => {
      const { cabinets, at, problems } = places(project);
      expect(problems).toEqual([]);
      const room = (project.context as CasesContext).room!;
      for (const c of cabinets) {
        const p = at.get(c.id)!;
        expect(p.at[0], c.name).toBeGreaterThanOrEqual(-0.01);
        expect(p.at[0], c.name).toBeLessThanOrEqual(room.length.mm + 0.01);
        expect(p.at[2], c.name).toBeLessThanOrEqual(room.width.mm + 0.01);
      }
      // The wall runs stand over the floor runs, at their height off the floor.
      for (const c of cabinets.filter((x) => x.form === 'wall')) expect(at.get(c.id)!.at[1]).toBeCloseTo(c.offFloor!.mm, 6);
    });

    it('survives export and import, and gives the same job again', () => {
      const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
      expect(file.project).toEqual(project);
      expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
    });
  });
}

complete('The kitchen, blind corner', createKitchenProject);
complete('The kitchen, diagonal corner', withDiagonal);
complete('The kitchen, L-shaped corner', withLShaped);

describe('the kitchen', () => {
  const project = createKitchenProject();

  it('is eight cabinets in four runs, two on each of two walls', () => {
    const context = project.context as CasesContext;
    expect(context.runs.map((r) => [r.name, r.cabinetIds.length, r.placement?.wall ?? `over ${context.runs.find((x) => x.id === r.alignedWith)?.name}`])).toEqual([
      ['Back run', 3, 'back'],
      ['Left run', 2, 'left'],
      ['Wall run, back', 2, 'over Back run'],
      ['Wall run, left', 1, 'over Left run'],
    ]);
  });

  it('turns the corner: the left run faces the right wall and ends over the blind panel', () => {
    const { cabinets, at } = places(project);
    const left = cabinets.filter((c) => c.runId === (project.context as CasesContext).runs[1]!.id);
    expect(left.every((c) => at.get(c.id)!.turn === 90)).toBe(true);
    const job = buildJob(project, shop);
    const panel = job.cabinetParts.find((p) => p.name === 'Blind panel')!;
    // In the room the blind panel runs along the back run's front from near the left wall; the left run's last cabinet's side is over it.
    const last = left.at(-1)!;
    const lastEnd = at.get(last.id)!.at[2] - last.size.width.mm;
    expect(lastEnd).toBeGreaterThan(0);
    expect(partBox(panel).max[0]).toBeGreaterThan(at.get(last.id)!.at[0] - last.size.depth.mm);
  });
});
