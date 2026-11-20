// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { partTitle, topPieces } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, PlanWarning } from '@/model';
import { activeMachine } from '@/plan';
import { createShopTableProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/**
 * Milestone 8's acceptance: the shop table (`?sample=shoptable`), a torsion table over
 * shop cabinets at its two ends with the middle open, comes out complete as one job:
 * every part (the skins and the egg-crate ribs too; no spoilboard) cut once, every
 * feature made, every file parsing and following the post rules, the lists and the
 * checklist building the table, and the project surviving export and import. The same with
 * the ribs cut on the saw.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();

function complete(name: string, saw: boolean) {
  describe(`${name}: complete`, () => {
    const project = createShopTableProject();
    if (saw) (project.context as CasesContext).islands![0]!.top!.settings!.torsion!.ribsBy = 'saw';
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    const lists = buildLists(job, project, shop, L);
    const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';

    it('plans with nothing in the way', () => {
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    });

    it("cuts every part once, the table's too", () => {
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
      const sawn = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.labels));
      for (const part of all) {
        const label = lists.parts.find((p) => p.partId === part.id)!.label;
        expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), partTitle(part)).toHaveLength(onCnc(part.id) ? 1 : 0);
        expect(sawn.filter((l) => l === label), partTitle(part)).toHaveLength(onCnc(part.id) ? 0 : 1);
      }
      const ribs = all.filter((p) => p.role === 'rib');
      expect(ribs.length).toBeGreaterThan(10);
      if (!saw) expect(ribs.every((r) => onCnc(r.id))).toBe(true);
    });

    it('makes every feature', () => {
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

    it('writes files that parse and follow the post rules', async () => {
      for (const file of job.files) {
        const lines = file.text.split('\n');
        expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
        expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });

    it('lists and builds the table', () => {
      expect(lists.hardware.some((h) => h.group === 'Torsion table')).toBe(true);
      const tops = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!;
      expect(tops.steps.some((s) => s.text.startsWith(saw ? 'Lay out the long ribs' : 'Slot the ribs together'))).toBe(true);
    });

    it('survives export and import, and gives the same job again', () => {
      const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
      expect(file.project).toEqual(project);
      expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
    });
  });
}

complete('The shop table, egg-crate ribs', false);
complete('The shop table, sawn ribs', true);

describe('the shop table', () => {
  it('is 84" long and 50" wide over the cabinets at its two ends, its skins each in two pieces, joined on ribs; no spoilboard', () => {
    const project = createShopTableProject();
    const [piece] = topPieces(project, project.materials);
    // Across the front row it is 50"; from end to end, 84".
    expect(L(piece!.x1 - piece!.x0)).toBe('50"');
    expect(L(piece!.zFront - piece!.zBack)).toBe('84"');
    // One table over all four cabinets: the front row's two, and the two back cabinets that face the sides.
    expect([...piece!.cabinetIds, ...piece!.island!.alsoOver]).toHaveLength(4);
    const names = buildJob(project, shop).cabinetParts.map((p) => p.name);
    for (const layer of ['Bottom skin', 'Top skin']) expect(names.filter((n) => n.startsWith(layer))).toEqual([`${layer} 1`, `${layer} 2`]);
    expect(names.some((n) => /spoilboard/i.test(n))).toBe(false);
  });
});
