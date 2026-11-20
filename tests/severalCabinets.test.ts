// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetOpeningsOf, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, designsOf, isDoorSet, isDrawer, mountedDesigns, setOwnSettings } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, PlanWarning } from '@/model';
import { activeMachine } from '@/plan';
import { addCabinet, createBaseCabinetProject, createShopCabinetProject, createShopWallProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/**
 * Milestone 4: a project with several cabinets comes out as one job. The
 * shop wall is three shop cabinets: three drawers (24"), a drawer over doors (30"),
 * three drawers (24").
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('the shop wall: three cabinets in one project', () => {
  const project = createShopWallProject();
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  const lists = buildLists(job, project, shop, L);
  const single = (make: () => ReturnType<typeof createShopCabinetProject>) => {
    const p = make();
    const j = buildJob(p, shop);
    return { job: j, lists: buildLists(j, p, shop, L) };
  };
  const drawers3 = single(() => createShopCabinetProject('drawers', 3));
  const overDoors = single(() => createShopCabinetProject());

  it('holds three cabinets that follow the project, each with its own fronts', () => {
    const cabinets = cabinetsOf(project);
    expect(cabinets.map((c) => [c.id, c.name, L(c.size.width.mm)])).toEqual([
      ['cabinet-1', 'Drawers, left', '24"'],
      ['cabinet-2', 'Drawer over doors', '30"'],
      ['cabinet-3', 'Drawers, right', '24"'],
    ]);
    expect(cabinets.every((c) => c.overrides === undefined && c.construction === 'shop' && c.toeKick.off === true)).toBe(true);
    expect((project.context as CasesContext).pieces.every((c) => !('joinery' in c))).toBe(true);
    const fronts = designsOf(project);
    expect(unique(fronts.map((d) => d.id))).toBe(true);
    const on = (cabinetId: string) => mountedDesigns(project, shop.materials).filter((d) => d.mounting.openingId.startsWith(`${cabinetId}/`)).map((d) => d.template).sort();
    expect([on('cabinet-1'), on('cabinet-2'), on('cabinet-3')]).toEqual([
      ['drawer', 'drawer', 'drawer'],
      ['doorSet', 'drawer'],
      ['drawer', 'drawer', 'drawer'],
    ]);
    // Every opening has one front, and every front an opening.
    const openings = cabinetOpeningsOf(project, shop.materials);
    expect(openings).toHaveLength(8);
    expect(unique(openings.map((o) => o.id))).toBe(true);
    expect(openings.map((o) => fronts.filter((d) => d.mounting.openingId === o.id).length)).toEqual(Array(8).fill(1));
    // Drawers are named within their cabinet.
    expect(fronts.filter(isDrawer).map((d) => d.name)).toEqual(['Drawer 1', 'Drawer 2', 'Drawer 3', 'Drawer', 'Drawer 1', 'Drawer 2', 'Drawer 3']);
  });

  it('derives the parts of every cabinet, each once and under its own id', () => {
    expect(unique(all.map((p) => p.id))).toBe(true);
    const of = (cabinetId: string) => deriveCabinetParts(project, shop).filter((p) => p.designObjectId === cabinetId);
    // An all-drawer case has no shelf; the drawer over doors has one.
    expect([of('cabinet-1').length, of('cabinet-2').length, of('cabinet-3').length]).toEqual([6, 7, 6]);
    expect(deriveDrawerBoxParts(project, shop)).toHaveLength(7 * 5);
    // Shop-style drawers have no front of their own: the fronts are the one pair of doors. (`doors-1` waits, unmounted, on the first cabinet.)
    expect(deriveParts(project, shop).map((p) => p.id)).toEqual(['doors-2/door-left', 'doors-2/door-right']);
    // The same parts as the cabinets have when each is a project of its own.
    expect(all).toHaveLength(2 * (drawers3.job.cabinetParts.length + drawers3.job.parts.length) + overDoors.job.cabinetParts.length + overDoors.job.parts.length);
    // A wider cabinet has a wider bottom; alike cabinets have alike parts.
    const bottom = (id: string) => all.find((p) => p.id === `${id}/bottom`)!.size;
    expect(bottom('cabinet-1')).toEqual(bottom('cabinet-3'));
    expect(bottom('cabinet-2').width - bottom('cabinet-1').width).toBeCloseTo(len('6"').mm, 5);
  });

  it('puts the hardware holes of each cabinet in its own sides', () => {
    const holes = (cabinetId: string, prefix: string) =>
      all.filter((p) => p.designObjectId === cabinetId && p.role === 'side').reduce((n, p) => n + p.features.filter((f) => f.kind === 'hole' && f.id.startsWith(prefix)).length, 0);
    expect([holes('cabinet-1', 'hinge-plate'), holes('cabinet-2', 'hinge-plate'), holes('cabinet-3', 'hinge-plate')]).toEqual([0, 8, 0]);
    expect([holes('cabinet-1', 'shelf-pin'), holes('cabinet-3', 'shelf-pin')]).toEqual([0, 0]);
    expect(holes('cabinet-2', 'shelf-pin')).toBeGreaterThan(0);
  });

  it('plans one job with nothing in the way: every CNC part on one blank, every other on the cut list', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(unique(job.plan.operations.map((o) => o.key))).toBe(true);
    const onBlanks = job.plan.blanks.flatMap((b) => b.partIds);
    expect(unique(onBlanks)).toBe(true);
    const onCnc = all.filter((p) => (job.plan.parts.find((x) => x.partId === p.id)?.cutOut ?? 'cnc') === 'cnc');
    expect([...onBlanks].sort()).toEqual(onCnc.map((p) => p.id).sort());
    const sawn = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.labels));
    expect(unique(sawn)).toBe(true);
    expect(sawn).toHaveLength(all.length - onCnc.length);
    // The parts of different cabinets share blanks: no more of them than the three jobs apart.
    expect(job.plan.blanks.length).toBeLessThanOrEqual(2 * drawers3.job.plan.blanks.length + overDoors.job.plan.blanks.length);
    expect(job.plan.blanks.some((b) => new Set(b.partIds.map((id) => all.find((p) => p.id === id)!.designObjectId)).size > 1)).toBe(true);
    for (const blank of job.plan.blanks) for (const setup of blank.setups) expect(unique(setup.placements.map((p) => p.partId))).toBe(true);
  });

  it('writes G-code that parses, one file per blank and setup with work', async () => {
    expect(job.files).toHaveLength(job.plan.blanks.reduce((n, b) => n + b.setups.filter((s) => s.operationKeys.length > 0).length, 0));
    expect(unique(job.files.map((f) => f.name))).toBe(true);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      expect(file.text).not.toMatch(/\bM0?[35]\b/);
      for (const line of file.text.split('\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(127);
    }
  });

  it('lists every part with a label of its own, and merges alike parts across cabinets on the cut list', () => {
    expect(lists.parts).toHaveLength(all.length);
    expect(unique(lists.parts.map((p) => p.label))).toBe(true);
    // The two 24" cabinets' bottoms are one row.
    const bottoms = lists.cutList.flatMap((g) => g.rows).filter((r) => r.names.includes('Bottom'));
    expect(bottoms.map((r) => r.quantity).sort()).toEqual([1, 2]);
  });

  it("totals the hardware: one line per item, the sum of the cabinets'", () => {
    const rows = lists.hardware;
    expect(unique(rows.map((r) => `${r.group}|${r.item}|${r.unit}|${r.note}`))).toBe(true);
    const quantity = (from: typeof rows, item: RegExp) => from.filter((r) => item.test(r.item)).reduce((n, r) => n + (r.quantity ?? 0), 0);
    for (const item of [/wood screws/, /slide/, /Knob or pull/, /shelf pin/, /Hinge mounting plates/]) {
      expect(quantity(rows, item)).toBe(2 * quantity(drawers3.lists.hardware, item) + quantity(overDoors.lists.hardware, item));
      expect(rows.filter((r) => item.test(r.item))).toHaveLength(1);
    }
    expect(quantity(rows, /slide/)).toBe(7);
    // One install kit hangs every door: as the one cabinet with doors needs it.
    expect(job.plan.installKit).toEqual(overDoors.job.plan.installKit);
  });

  it('builds a checklist and survives export and import', () => {
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).filter((s) => s.startsWith('Run '))).toHaveLength(job.files.length);
    const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
    expect(file.project).toEqual(project);
    expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
  });
});

describe('several cabinets that differ', () => {
  it('adds a cabinet under a free id, with the fronts of its layout', () => {
    const project = createBaseCabinetProject('frameless');
    const added = addCabinet(project, { name: 'Doors', width: len('18"'), layout: 'doors' });
    expect([added.id, added.name, added.size.width, added.size.depth]).toEqual(['cabinet-2', 'Doors', len('18"'), len('22-1/2"')]);
    expect(designsOf(project).map((d) => [d.id, d.mounting.openingId])).toEqual([
      ['doors-1', 'cabinet-1/doors'],
      ['drawer-1', 'cabinet-1/drawer'],
      ['doors-2', 'cabinet-2/doors'],
    ]);
    // Both door sets follow the project: one hinge, one style.
    const [first, second] = designsOf(project).filter(isDoorSet);
    expect(second!.style).toBe(first!.style);
  });

  it('a face frame cabinet beside frameless ones is one job: its drawer follows the doors beside it, not another cabinet\'s', () => {
    const project = createBaseCabinetProject('frameless');
    addCabinet(project, { name: 'Framed', width: len('30"'), layout: 'drawerOverDoors' });
    addCabinet(project, { name: 'Drawers', width: len('18"'), layout: 'drawers', drawers: 2 });
    setOwnSettings(project, 'cabinet-2', 'construction', true);
    cabinetsOf(project)[1]!.construction = 'faceFrame';
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    const framed = (id: string) => all.some((p) => p.designObjectId === id && p.role === 'frameStile');
    expect([framed('cabinet-1'), framed('cabinet-2'), framed('cabinet-3')]).toEqual([false, true, false]);
    // Fronts: a pair of doors and a drawer front on each of the first two, two drawer fronts on the third.
    expect(job.parts.map((p) => p.designObjectId)).toEqual(['doors-1', 'doors-1', 'drawer-1', 'drawer-2', 'doors-2', 'doors-2', 'drawer-3', 'drawer-4']);
    // The framed cabinet's fronts lap its frame by the hinge's overlay; the frameless ones cover the case less the reveal.
    const width = (id: string) => job.parts.find((p) => p.id === id)!.size.width;
    expect(L(width('drawer-2/front'))).toBe('28"');
    expect(L(width('drawer-1/front'))).toBe('23-7/8"');
    expect(L(width('drawer-3/front'))).toBe('17-7/8"');
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(new Set(job.plan.operations.map((o) => o.key)).size).toBe(job.plan.operations.length);
    const lists = buildLists(job, project, shop, L);
    expect(new Set(lists.parts.map((p) => p.label)).size).toBe(lists.parts.length);
    // Slides behind a face frame sit on strips; the frameless cabinets' sit on the case sides.
    // (A line per slide length: a drawer over doors has less depth for its slide than one lower down.)
    const slides = lists.hardware.filter((h) => /slide,/.test(h.item));
    const pairs = (onStrips: boolean) => slides.filter((h) => /strips/.test(h.note ?? '') === onStrips).reduce((n, h) => n + (h.quantity ?? 0), 0);
    expect([pairs(false), pairs(true)]).toEqual([3, 1]);
    expect(new Set(slides.map((h) => `${h.item}|${h.note}`)).size).toBe(slides.length);
  });
});
