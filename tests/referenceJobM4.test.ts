// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { baseId, cabinetIdOf, cabinetOpeningsOf, cabinetTags, cabinetsOf, copiesOf, designsOf, mountedDesigns, partTitle, runFit } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import type { CasesContext, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createFaceFrameRunProject, createShopReferenceProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/**
 * Milestone 4's acceptance: its two reference jobs come out complete, each as one job.
 *  - A wall of the shop, seven cabinets in the shop style in 3/4" plywood: a bench run
 *    (A three drawers, B a drawer over doors, C a copy of A, D a tall cabinet with doors
 *    over doors; left end against a wall, 108" to fill), a wall run (E and F, doors
 *    only) and G, a base cabinet with doors, made twice.
 *  - A run of two face frame base cabinets between two walls.
 * Complete means every part of every cabinet and copy is cut once (on a blank or on
 * the saw cut list), every feature is made by a row of the plan, with the Kreg jig or
 * on the saw, and every file parses and follows the post rules.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = lowRiderJobShop();
const machine = activeMachine(shop);

function built(project: Project) {
  const started = performance.now();
  const job = buildJob(project, shop);
  const ms = performance.now() - started;
  const all = [...job.cabinetParts, ...job.parts];
  const lists = buildLists(job, project, shop, L);
  const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, machine);
  const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';
  return { job, ms, all, lists, sections, onCnc };
}

/** What both reference jobs must do: checked for each. */
function complete(name: string, make: () => Project) {
  describe(`${name}: complete`, () => {
    const project = make();
    const { job, all, lists, onCnc } = built(project);

    it('plans with nothing in the way', () => {
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    });

    it('cuts every part of every cabinet and copy once: on one blank, or on the saw cut list', () => {
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
      expect(new Set(all.map(partTitle)).size).toBe(all.length);
      expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
      const sawn = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.labels));
      expect(new Set(sawn).size).toBe(sawn.length);
      for (const part of all) {
        const label = lists.parts.find((p) => p.partId === part.id)!.label;
        expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), partTitle(part)).toHaveLength(onCnc(part.id) ? 1 : 0);
        expect(sawn.filter((l) => l === label), partTitle(part)).toHaveLength(onCnc(part.id) ? 0 : 1);
      }
      // Every blank fits the stock on hand, and the machine across X; along Y it fits or is tiled.
      const { stock } = job.plan;
      for (const blank of job.plan.blanks) {
        expect(Math.min(blank.size.width, blank.size.height)).toBeLessThanOrEqual(Math.min(stock.width, stock.height) + 0.01);
        expect(Math.max(blank.size.width, blank.size.height)).toBeLessThanOrEqual(Math.max(stock.width, stock.height) + 0.01);
        expect(blank.size.width).toBeLessThanOrEqual(machine.cuttingArea.x.mm + 0.01);
        if (blank.size.height > machine.cuttingArea.y.mm + 0.01) expect(blank.setups.every((s) => s.tile)).toBe(true);
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
      for (const op of job.plan.operations.filter((o) => o.kind !== 'install')) if (op.method === 'cnc') expect(op.clearToolId, op.label).toBeTruthy();
      const scheduled = new Set(job.plan.blanks.flatMap((b) => b.setups.flatMap((s) => s.operationKeys)));
      for (const op of job.plan.operations) if (op.method === 'cnc' && op.kind !== 'install') expect(scheduled.has(op.key), op.label).toBe(true);
      expect(lists.byHand).toEqual([]);
    });

    it('counts every pocket hole once', () => {
      const holes = all.reduce((n, p) => n + p.features.filter((f) => f.kind === 'pocketHole').length, 0);
      expect(job.plan.pocketHoles?.count ?? 0).toBe(holes);
      expect(lists.kreg.reduce((n, k) => n + k.at.length, 0)).toBe(holes);
      expect(lists.hardware.filter((h) => /pocket screws/.test(h.item)).reduce((n, h) => n + (h.quantity ?? 0), 0)).toBe(holes);
    });

    it('writes a file for every setup that cuts, and each one parses and follows the post rules', async () => {
      const cutting = job.plan.blanks.flatMap((b) => b.setups.filter((s) => s.operationKeys.length > 0));
      expect(job.programs).toHaveLength(cutting.length);
      expect(new Set(job.files.map((f) => f.name)).size).toBe(job.files.length);
      for (const [i, file] of job.files.entries()) {
        const lines = file.text.split('\n');
        const program = job.programs[i]!;
        expect(file.name.endsWith('.gcode')).toBe(true);
        expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
        expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
        expect(lines).toContain('G21 G90 G17 G94');
        // A probe routine for the first bit and after every bit change.
        const attach = lines.filter((l) => /^M0 \(MSG, .*[Aa]ttach the probe/.test(l)).length;
        const probes = lines.filter((l) => l.startsWith('G38.2 Z-80 F180')).length;
        expect(attach, file.name).toBeGreaterThanOrEqual(program.toolIds.length);
        expect(probes, file.name).toBe(attach);
        // The first setup of a blank sets X0 Y0; a later one keeps it.
        expect(lines.includes('G10 L20 P0 X0 Y0'), file.name).toBe(program.setup.index === 1);
        // Nothing below the stock but the pin holes, and nothing outside the machine's reach.
        const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
        const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
        expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + (program.setup.pinHoles.length > 0 ? machine.flipPins.spoilboardDepth : 0) + THROUGH_EXTRA + 0.011);
        const ys = [...file.text.matchAll(/^G[123] .*?Y(-?[\d.]+)/gm)].map((m) => Number(m[1]));
        expect(Math.min(...ys), file.name).toBeGreaterThanOrEqual(-0.001);
        expect(Math.max(...ys), file.name).toBeLessThanOrEqual(machine.cuttingArea.y.mm);
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });

    it('survives export and import, and gives the same job again', () => {
      const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
      expect(file.project).toEqual(project);
      expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
    });
  });
}

complete('the shop wall', createShopReferenceProject);
complete('the face frame run', createFaceFrameRunProject);

describe('milestone 4 reference job: the shop wall', () => {
  const project = createShopReferenceProject();
  const context = project.context as CasesContext;
  const { job, ms, all, lists, sections } = built(project);
  const cabinets = cabinetsOf(project);
  const tag = (name: string) => [...cabinetTags(project)].find(([id]) => cabinets.find((c) => c.id === id)!.name === name)?.[1];

  it('is seven cabinets, A to G: a bench run of four, a wall run of two and one made twice', () => {
    expect(cabinets.map((c) => [cabinetTags(project).get(c.id), c.name, c.form, L(c.size.width.mm), L(c.size.height.mm), L(c.size.depth.mm), copiesOf(c)])).toEqual([
      ['A', 'Drawers', 'base', '24"', '30"', '22-1/2"', 1],
      ['B', 'Drawer over doors', 'base', '30"', '30"', '22-1/2"', 1],
      ['C', 'Drawers copy', 'base', '24"', '30"', '22-1/2"', 1],
      ['D', 'Tall', 'tall', '24"', '84"', '22-1/2"', 1],
      ['E', 'Wall cabinet', 'wall', '30"', '30"', '12"', 1],
      ['F', 'Wall cabinet copy', 'wall', '30"', '30"', '12"', 1],
      ['G', 'Doors', 'base', '24"', '30"', '22-1/2"', 2],
    ]);
    expect(context.runs.map((r) => [r.name, r.cabinetIds.map((id) => cabinetTags(project).get(id)).join(''), r.ends.left, r.ends.right, r.length ? L(r.length.mm) : undefined])).toEqual([
      ['Bench run', 'ABCD', 'wall', 'open', '108"'],
      ['Wall run', 'EF', 'open', 'open', undefined],
    ]);
    // All follow the project: the shop style, through screws, flat bottoms. None has settings of its own.
    expect(cabinets.every((c) => c.overrides === undefined && c.construction === 'shop' && c.joinery.case === 'throughScrews')).toBe(true);
    expect(designsOf(project).every((d) => d.overrides === undefined)).toBe(true);
    // Every opening has its front.
    const openings = cabinetOpeningsOf(project, shop.materials);
    const mounted = mountedDesigns(project, shop.materials);
    expect(openings).toHaveLength(3 + 2 + 3 + 2 + 1 + 1 + 1);
    expect(openings.every((o) => mounted.filter((d) => d.mounting.openingId === o.id).length === 1)).toBe(true);
  });

  it('the bench run is 102" in 108": a 6" filler at the wall, the sides hidden but the open end and the tall cabinet\'s', () => {
    const bench = context.runs[0]!;
    const fit = runFit(context, bench)!;
    expect([L(fit.width), L(fit.leftOver), fit.fillers.map((f) => [f.end, L(f.width)])]).toEqual(['102"', '6"', [['left', '6"']]]);
    expect(cabinets.slice(0, 4).map((c) => `${c.sides.left}/${c.sides.right}`)).toEqual(['hidden/hidden', 'hidden/hidden', 'hidden/hidden', 'exposed/exposed']);
    expect(cabinets.slice(4, 6).map((c) => `${c.sides.left}/${c.sides.right}`)).toEqual(['exposed/hidden', 'hidden/exposed']);
    const filler = all.find((p) => p.role === 'filler')!;
    expect([partTitle(filler), L(filler.size.width), L(filler.size.height)]).toEqual(['A · Filler, left', '6"', '30"']);
  });

  it('comes out as one job: its parts, blanks and files', () => {
    const count = (letter: string) => all.filter((p) => p.tag === letter).length;
    // A and C alike; D with its fixed shelf, three shelves and four doors; E and F alike; G twice.
    expect({ A: count('A'), B: count('B'), C: count('C'), D: count('D'), E: count('E'), F: count('F'), G: count('G') }).toEqual({ A: 22, B: 14, C: 21, D: 13, E: 11, F: 11, G: 18 });
    expect(all).toHaveLength(110);
    expect(all.filter((p) => p.tag === 'G').map((p) => p.copy)).toEqual([...Array(7).fill(1), ...Array(7).fill(2), 1, 1, 2, 2]);
    expect([job.plan.blanks.length, job.files.length]).toEqual([20, 22]);
    // The parts of different cabinets share blanks.
    const cabinetOf = cabinetIdOf(project);
    expect(job.plan.blanks.filter((b) => new Set(b.partIds.map((id) => cabinetOf(id))).size > 1).length).toBeGreaterThan(5);
  });

  it('tiles the tall cabinet\'s two sides, each on a blank of its own in two setups', () => {
    const tiled = job.plan.blanks.filter((b) => b.setups.some((s) => s.tile));
    expect(tiled.map((b) => b.partIds)).toEqual([[`${cabinets[3]!.id}/side-left`], [`${cabinets[3]!.id}/side-right`]]);
    expect(tiled.every((b) => b.setups.length === 2 && b.setups[1]!.flipBefore !== 'none')).toBe(true);
    expect(job.plan.blanks.filter((b) => !tiled.includes(b)).every((b) => b.setups.length === 1)).toBe(true);
    // The long back is a plain rectangle: the saw.
    expect(job.plan.parts.find((p) => p.partId === `${cabinets[3]!.id}/back`)!.cutOut).toBe('tableSaw');
  });

  it('has one row on the Plan per kind of work, covering the cabinets it is done on', () => {
    expect(job.plan.operations.map((o) => [o.label, o.covers?.join('')])).toEqual([
      ['Doors: hinge cups', 'BDEFG'],
      ['Doors: cutout', 'BDEFG'],
      ['Case: shelf-pin holes', 'BDEFG'],
      ['Case: hinge plate holes', 'BDEFG'],
      ['Case: case screw holes', 'ABCDEFG'],
      ['Case: cutout', 'ABCDEFG'],
      ['Drawer boxes: bottom groove', 'ABC'],
      ['Drawer boxes: dados', 'ABC'],
      ['Drawer boxes: corner rabbets', 'ABC'],
      ['Drawer boxes: cutout', 'ABC'],
      ['Registration holes', undefined],
      ['Hang doors', undefined],
    ]);
    // A choice for a part of G is for both copies.
    expect(job.plan.parts.filter((p) => baseId(p.partId) === `${cabinets[6]!.id}/side-left`).map((p) => p.cutOut)).toEqual(['cnc', 'cnc']);
  });

  it('lists the hardware for the whole job', () => {
    const quantity = (group: string, item: RegExp) => lists.hardware.filter((h) => h.group === group && item.test(h.item)).map((h) => h.quantity);
    // Sixteen doors: three hinges on each of the tall cabinet's four, two on the other ten... and G's four.
    expect(quantity('Doors', /Blum CLIP top/)).toEqual([32]);
    expect(quantity('Doors', /stops or catches/)).toEqual([14]);
    expect(quantity('Drawer', /slide/)).toEqual([7]);
    expect(quantity('Case', /shelf pin/)).toEqual([40]);
    // Three joins in the bench run and one in the wall run, four screws each.
    expect(quantity('Runs', /wood screws/)).toEqual([16]);
    // Two wall cabinets on hanging rails.
    expect(quantity('Hanging', /cabinet screws/)).toEqual([8]);
    expect(job.plan.installKit.reduce((n, j) => n + j.quantity, 0)).toBe(5);
    expect(new Set(lists.hardware.map((h) => `${h.group}|${h.item}|${h.note}`)).size).toBe(lists.hardware.length);
  });

  it('has a checklist section for every cabinet and every run, after the machine', () => {
    const after = sections.slice(sections.findIndex((s) => s.title === 'After the machine'));
    expect(after.map((s) => s.title)).toEqual([
      'After the machine',
      'A · Drawers',
      'B · Drawer over doors',
      'C · Drawers copy',
      'D · Tall',
      'E · Wall cabinet',
      'F · Wall cabinet copy',
      'G · Doors, 2 of them',
      'Run: Bench run',
      'Run: Wall run',
    ]);
    const steps = (title: string) => sections.find((s) => s.title === title)!.steps.map((s) => s.text);
    expect(steps('E · Wall cabinet').some((s) => s.startsWith('Hang the cabinet'))).toBe(true);
    expect(steps('Run: Bench run')).toHaveLength(4);
    expect(steps('Run: Bench run')[2]).toMatch(/^Scribe the filler strip to the wall at the left end/);
    expect(steps('Run: Wall run')[0]).toMatch(/^Hang the cabinets left to right: E · Wall cabinet, F · Wall cabinet copy/);
    // The slide of each tiled blank is a step of its own.
    expect(sections.flatMap((s) => s.steps).filter((s) => /slide the sheet \d+ mm toward the front/.test(s.text))).toHaveLength(2);
    expect(tag('Tall')).toBe('D');
  });

  it('is planned and written in a few seconds', () => {
    // 110 parts on 20 blanks: about 2 s on the machine this was written on. A slow test machine gets room.
    expect(ms).toBeLessThan(20000);
  });
});

describe('milestone 4 reference job: the face frame run', () => {
  const project = createFaceFrameRunProject();
  const context = project.context as CasesContext;
  const { job, all, lists, sections } = built(project);

  it('is two face frame cabinets between two walls, each with its own frame and every side hidden', () => {
    const cabinets = cabinetsOf(project);
    expect(cabinets.map((c) => [cabinetTags(project).get(c.id), c.name, c.construction, `${c.sides.left}/${c.sides.right}`])).toEqual([
      ['A', 'Left', 'faceFrame', 'hidden/hidden'],
      ['B', 'Right', 'faceFrame', 'hidden/hidden'],
    ]);
    for (const letter of ['A', 'B']) {
      expect(all.filter((p) => p.tag === letter && p.role === 'frameStile')).toHaveLength(2);
      expect(all.filter((p) => p.tag === letter && p.role === 'frameRail')).toHaveLength(3);
    }
    // A hidden side takes the frame's pocket holes in its outside face, where they will not show.
    const sides = all.filter((p) => p.role === 'side');
    expect(sides).toHaveLength(4);
    expect(sides.every((p) => p.features.some((f) => f.id.startsWith('frame-pocket')) && p.features.filter((f) => f.id.startsWith('frame-pocket')).every((f) => f.face === 'B'))).toBe(true);
  });

  it('fills the 51" with a 1-1/2" filler at each wall, in the frame\'s material, and joins the two through their stiles', () => {
    const fit = runFit(context, context.runs[0]!)!;
    expect([L(fit.width), L(fit.leftOver)]).toEqual(['48"', '3"']);
    const fillers = all.filter((p) => p.role === 'filler');
    expect(fillers.map((p) => [partTitle(p), L(p.size.width), L(p.size.height), p.materialId])).toEqual([
      ['A · Filler, left', '1-1/2"', '30"', 'solid-wood-3-4'],
      ['B · Filler, right', '1-1/2"', '30"', 'solid-wood-3-4'],
    ]);
    expect(lists.cutList.flatMap((g) => g.rows).some((r) => r.names.includes('Filler, left') || r.names.includes('Filler, right'))).toBe(true);
    expect(lists.hardware.filter((h) => h.group === 'Runs').map((h) => [h.item, h.quantity])).toEqual([['#8 × 2-1/2" trim screws', 4]]);
    const run = sections.at(-1)!;
    expect(run.title).toBe('Run: Between the walls');
    expect(run.steps.map((s) => s.text.split(/[.:]/)[0])).toEqual([
      'Set the cabinets in place left to right',
      'Clamp each pair together, fronts flush, and screw them to each other through their stiles',
      'Scribe the filler strip to the wall at the left end and fasten it to the end cabinet, its face flush with the front',
      'Scribe the filler strip to the wall at the right end and fasten it to the end cabinet, its face flush with the front',
      'Fasten the run to the wall through the back of each cabinet, near the top, into the studs',
    ]);
    expect(job.plan.blanks.length).toBeGreaterThan(0);
  });
});
