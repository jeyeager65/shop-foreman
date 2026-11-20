// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { cabinetsOf, deriveCabinetOpenings, isDrawer, mountedDesigns, designsOf } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { PLYWOOD_1_4_ID, PLYWOOD_3_4_ID } from '@/libraries';
import type { PlanWarning, PocketHoleMethod, Project } from '@/model';
import { activeMachine } from '@/plan';
import { applyCabinetLayout, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/**
 * Milestone 3's acceptance: its three reference jobs come out complete.
 *  - The shop cabinet: 24" x 30" x 22-1/2", flat bottom, 3/4" plywood, screws through
 *    the sides, a 1/4" applied back, one adjustable shelf, a drawer with a wide front
 *    over a pair of slab doors, all inset.
 *  - Milestone 2's face frame cabinet as doors only.
 *  - Milestone 2's frameless cabinet as three drawers.
 * Complete means every part is cut once (on a blank or on the saw cut list), every
 * feature is made by a row of the plan or by a named hand tool, and every file
 * parses and follows the post rules.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];

interface Reference {
  name: string;
  make: () => Project;
  pockets: PocketHoleMethod;
  counts: { parts: number; blanks: number; files: number };
}
const references: Reference[] = [
  { name: 'the shop cabinet', make: () => createShopCabinetProject(), pockets: 'kregJig', counts: { parts: 14, blanks: 4, files: 4 } },
  { name: 'the face frame cabinet, doors only', make: () => createBaseCabinetProject('faceFrame', 'doors'), pockets: 'kregJig', counts: { parts: 14, blanks: 3, files: 4 } },
  { name: 'the face frame cabinet, doors only, pocket holes CNC-assisted', make: () => createBaseCabinetProject('faceFrame', 'doors'), pockets: 'cncAssisted', counts: { parts: 14, blanks: 4, files: 5 } },
  { name: 'the frameless cabinet, three drawers', make: () => createBaseCabinetProject('frameless', 'drawers', 3), pockets: 'kregJig', counts: { parts: 25, blanks: 7, files: 7 } },
];

describe.each(references)('milestone 3 reference job: $name', ({ make, pockets, counts }) => {
  const shop = lowRiderJobShop();
  const project = make();
  if (pockets === 'cncAssisted') project.plan.pocketHoles = pockets;
  const job = buildJob(project, shop);
  const all = [...job.parts, ...job.cabinetParts];
  const lists = buildLists(job, project, shop, L);
  const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';

  it('plans with nothing in the way', () => {
    expect(all).toHaveLength(counts.parts);
    expect(job.plan.blanks).toHaveLength(counts.blanks);
    expect(job.files).toHaveLength(counts.files);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });

  it('cuts every part out once: on one blank, or on the saw cut list', () => {
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length);
    for (const part of all) {
      expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), part.name).toHaveLength(onCnc(part.id) ? 1 : 0);
      expect(cut.filter((name) => name === part.name), part.name).toHaveLength(onCnc(part.id) ? 0 : 1);
    }
    const machine = activeMachine(shop);
    const { stock } = job.plan;
    for (const blank of job.plan.blanks) {
      expect(Math.min(blank.size.width, blank.size.height)).toBeLessThanOrEqual(Math.min(stock.width, stock.height) + 0.01);
      expect(Math.max(blank.size.width, blank.size.height)).toBeLessThanOrEqual(Math.max(stock.width, stock.height) + 0.01);
      expect(blank.size.width).toBeLessThanOrEqual(machine.cuttingArea.x.mm + 0.01);
      expect(blank.size.height).toBeLessThanOrEqual(machine.cuttingArea.y.mm + 0.01);
    }
  });

  it('makes every feature: in a row of the plan, with the Kreg jig, or on the saw', () => {
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    const kregParts = new Set(lists.kreg.map((k) => k.part));
    const missing: string[] = [];
    for (const part of all) {
      for (const feature of part.features) {
        if (planned.has(`${part.id}:${feature.id}`)) continue;
        if (feature.kind === 'cutout' && !onCnc(part.id)) continue;
        if (feature.kind === 'pocketHole' && kregParts.has(part.name)) continue;
        missing.push(`${part.name}: ${feature.id}`);
      }
    }
    expect(missing).toEqual([]);
    for (const op of job.plan.operations.filter((o) => o.kind !== 'install')) {
      if (op.method === 'cnc') expect(op.clearToolId, op.label).toBeTruthy();
    }
    // Every row is cut in some setup, or is done by hand.
    const scheduled = new Set(job.plan.blanks.flatMap((b) => b.setups.flatMap((s) => s.operationKeys)));
    for (const op of job.plan.operations) if (op.method === 'cnc' && op.kind !== 'install') expect(scheduled.has(op.key), op.label).toBe(true);
  });

  it('counts every pocket hole once', () => {
    const holes = all.reduce((n, p) => n + p.features.filter((f) => f.kind === 'pocketHole').length, 0);
    const kreg = lists.kreg.reduce((n, k) => n + k.at.length, 0);
    const prepped = pockets === 'cncAssisted' ? (job.plan.pocketHoles?.cncAssisted ?? 0) : 0;
    expect(job.plan.pocketHoles?.count ?? 0).toBe(holes);
    expect(kreg + prepped).toBe(holes);
    expect(lists.hardware.filter((h) => /pocket screws/.test(h.item)).reduce((n, h) => n + (h.quantity ?? 0), 0)).toBe(holes);
  });

  it('writes a file for every setup that cuts, and each one parses and follows the post rules', async () => {
    const cutting = job.plan.blanks.flatMap((b) => b.setups.filter((s) => s.operationKeys.length > 0));
    expect(job.programs).toHaveLength(cutting.length);
    expect(new Set(job.files.map((f) => f.name)).size).toBe(job.files.length);
    for (const [i, file] of job.files.entries()) {
      const lines = file.text.split('\n');
      expect(file.name.endsWith('.gcode')).toBe(true);
      expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
      expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
      expect(lines).toContain('G21 G90 G17 G94');
      const attach = lines.filter((l) => /^M0 \(MSG, .*[Aa]ttach the probe/.test(l)).length;
      const changes = lines.filter((l) => l.startsWith('M0 (MSG, Router OFF. Change to ')).length;
      const probes = lines.filter((l) => l.startsWith('G38.2 Z-80 F180')).length;
      expect(changes, file.name).toBeGreaterThanOrEqual(job.programs[i]!.toolIds.length - 1);
      expect(attach, file.name).toBe(changes + 1);
      expect(probes, file.name).toBe(attach);
      expect(lines.filter((l) => l.startsWith('M0 (MSG, Remove probe. Router ON')).length, file.name).toBe(attach);
      const program = job.programs[i]!;
      const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      const pins = program.setup.pinHoles.length > 0;
      expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + (pins ? activeMachine(shop).flipPins.spoilboardDepth : 0) + THROUGH_EXTRA + 0.011);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });

  it('lists every part with a label, and a checklist step for every file', () => {
    expect(lists.parts).toHaveLength(all.length);
    expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).filter((s) => s.startsWith('Run '))).toHaveLength(job.files.length);
  });
});

describe('the shop cabinet as asked for', () => {
  const shop = lowRiderJobShop();
  const project = createShopCabinetProject();
  const cabinet = cabinetsOf(project)[0]!;
  const job = buildJob(project, shop);
  const lists = buildLists(job, project, shop, L);

  it('is 24" x 30" x 22-1/2" with a flat bottom, through screws and an applied 1/4" back', () => {
    expect([cabinet.size.width, cabinet.size.height, cabinet.size.depth]).toEqual([len('24"'), len('30"'), len('22-1/2"')]);
    expect(cabinet.construction).toBe('shop');
    expect(cabinet.toeKick.off).toBe(true);
    expect(cabinet.joinery.case).toBe('throughScrews');
    expect(cabinet.joinery.back).toBe('applied');
    expect([cabinet.materials.caseId, cabinet.materials.backId]).toEqual([PLYWOOD_3_4_ID, PLYWOOD_1_4_ID]);
    expect(cabinet.adjustableShelves).toBe(1);
    expect(cabinet.shop.gap).toEqual(len('1/8"'));
    expect(deriveCabinetOpenings(cabinet, shop.materials).map((o) => o.use)).toEqual(['drawer', 'doors']);
  });

  it('has the parts of that cabinet and nothing else', () => {
    expect([...job.cabinetParts, ...job.parts].map((p) => p.name)).toEqual([
      'Left side',
      'Right side',
      'Bottom',
      'Front stretcher',
      'Back stretcher',
      'Back',
      'Shelf',
      'Box side, left',
      'Box side, right',
      'Box front',
      'Box back',
      'Box bottom',
      'Left door',
      'Right door',
    ]);
    // No toe kick, no face frame, no applied drawer front, no pocket holes.
    expect(job.plan.pocketHoles).toBeUndefined();
    expect(job.plan.summary.byHand).toEqual([]);
  });

  it('lists what it takes to build it', () => {
    const list = lists.hardware.map((h) => `${h.quantity ?? ''} ${h.unit ?? ''} ${h.item}`.replace(/\s+/g, ' ').trim());
    expect(list).toEqual([
      '4 Blum CLIP top BLUMOTION 110°, inset, soft close, screw-on (71B3750)',
      '4 Hinge mounting plates',
      '8 Mounting plate screws',
      '2 Door stops or catches',
      '2 Knobs or pulls',
      '4 Generic 5 mm shelf pin',
      '16 #8 × 2" wood screws',
      '18 ga brads or staples, about 5/8" long',
      '1 pair Generic side-mount ball-bearing slide, 20"',
      '1 Knob or pull',
      '5 Door gap shims, 1/8" thick',
    ]);
  });
});

describe('switching a cabinet to the shop style and its layout', () => {
  it('re-enters nothing and comes back as it was', () => {
    const shop = lowRiderJobShop();
    const project = createBaseCabinetProject('frameless');
    const cabinet = cabinetsOf(project)[0]!;
    const before = buildJob(project, shop).files.map((f) => f.text);
    cabinet.construction = 'shop';
    cabinet.toeKick.off = true;
    cabinet.joinery.case = 'throughScrews';
    applyCabinetLayout(project, cabinet, 'drawers', 3);
    for (const d of designsOf(project).filter(isDrawer)) d.shop = { front: 'runners' };
    const shopJob = buildJob(project, shop);
    expect(shopJob.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(mountedDesigns(project, shop.materials).filter(isDrawer)).toHaveLength(3);
    // Back to where it started: the same files.
    cabinet.construction = 'frameless';
    delete cabinet.toeKick.off;
    cabinet.joinery.case = 'pocketScrews';
    applyCabinetLayout(project, cabinet, 'drawerOverDoors');
    expect(buildJob(project, shop).files.map((f) => f.text)).toEqual(before);
  });
});
