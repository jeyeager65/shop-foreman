// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DOOR_STANDOFF,
  RUNNER_BACK_CLEARANCE,
  RUNNER_HEIGHT,
  RUNNER_SIDE_CLEARANCE,
  RUNNER_TOP_CLEARANCE,
  cabinetsOf,
  clearDepth,
  deriveCabinetOpenings,
  deriveCabinetParts,
  deriveDrawerBoxParts,
  drawerBox,
  isDrawer,
  designsOf,
  setOwnFrontSettings,
} from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { PLYWOOD_3_4_ID, createStarterShop } from '@/libraries';
import type { Part, PlanWarning, Project, ShopDrawerFront } from '@/model';
import { createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Milestone 3: a shop drawer on wooden runners, with no slides. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const tCase = shop.materials.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness.mm;
const drawersOf = (p: Project) => designsOf(p).filter(isDrawer);

function build(layout: 'drawerOverDoors' | 'drawers', fronts: ShopDrawerFront[]) {
  const project = createShopCabinetProject(layout);
  // Each drawer is made its own way, so each has its own settings.
  drawersOf(project).forEach((d, i) => {
    setOwnFrontSettings(project, d.id, true);
    d.shop = { front: fronts[i] ?? 'runners' };
  });
  const cabinet = cabinetsOf(project)[0]!;
  return { project, cabinet, openings: deriveCabinetOpenings(cabinet, shop.materials), parts: deriveDrawerBoxParts(project, shop) };
}
const of = (parts: Part[], drawer: string, key: string) => parts.find((p) => p.id === `${drawer}/${key}`);
/** A part's extent in the cabinet along an axis (0 x, 1 y, 2 z). */
function extent(p: Part, axis: number): [number, number] {
  const pl = p.placement!;
  const n = [pl.xAxis[1]! * pl.yAxis[2]! - pl.xAxis[2]! * pl.yAxis[1]!, pl.xAxis[2]! * pl.yAxis[0]! - pl.xAxis[0]! * pl.yAxis[2]!, pl.xAxis[0]! * pl.yAxis[1]! - pl.xAxis[1]! * pl.yAxis[0]!];
  const vs = [0, p.size.width].flatMap((x) => [0, p.size.height].flatMap((y) => [0, p.size.thickness].map((z) => pl.origin[axis]! + pl.xAxis[axis]! * x + pl.yAxis[axis]! * y - n[axis]! * z)));
  return [Math.min(...vs), Math.max(...vs)];
}
const overlap = (a: Part, b: Part) => [0, 1, 2].every((i) => Math.min(extent(a, i)[1], extent(b, i)[1]) - Math.max(extent(a, i)[0], extent(b, i)[0]) > 0.05);

describe('a drawer on runners over a pair of doors', () => {
  const { project, cabinet, openings, parts } = build('drawerOverDoors', ['runners']);
  const opening = openings[0]!;
  const box = drawerBox(drawersOf(project)[0]!, project, shop)!;

  it('has no slide and fills the opening', () => {
    expect(box.slide).toBeUndefined();
    expect(box.mount).toBe('runners');
    expect(box.front).toBe('runners');
    expect(box.size.width).toBeCloseTo(opening.width - 2 * RUNNER_SIDE_CLEARANCE, 5);
    expect(box.size.height).toBeCloseTo(opening.height - RUNNER_TOP_CLEARANCE, 5);
    expect(box.size.length).toBeCloseTo(clearDepth(cabinet, shop.materials, opening.origin.y + opening.height) - RUNNER_BACK_CLEARANCE, 5);
    const side = of(parts, 'drawer-1', 'box-side-left')!;
    // It sits on its runners, with its front at the case front.
    expect(extent(side, 1)[0]).toBeCloseTo(opening.origin.y, 5);
    expect(extent(side, 2)[1]).toBeCloseTo(0, 5);
    expect(extent(of(parts, 'drawer-1', 'box-front')!, 2)[1]).toBeCloseTo(0, 5);
    expect(parts.flatMap((p) => p.features).filter((f) => f.id.startsWith('front-screw'))).toEqual([]);
  });

  it('slides on a strip on each case side, with the stretcher over it', () => {
    expect(box.runners).toEqual({ on: 'strips', under: 'stretcher' });
    const left = of(parts, 'drawer-1', 'runner-left')!;
    const right = of(parts, 'drawer-1', 'runner-right')!;
    expect(of(parts, 'drawer-1', 'kicker-left')).toBeUndefined();
    for (const strip of [left, right]) {
      expect(strip.role).toBe('runner');
      expect(strip.materialId).toBe(PLYWOOD_3_4_ID);
      expect(strip.size.height).toBeCloseTo(RUNNER_HEIGHT, 5);
      expect(strip.size.thickness).toBeCloseTo(tCase, 5);
      // Its top is where the box sits; it starts behind the doors and stops at the back.
      expect(extent(strip, 1)[1]).toBeCloseTo(opening.origin.y, 5);
      expect(extent(strip, 2)[1]).toBeCloseTo(-(tCase + DOOR_STANDOFF), 5);
      expect(extent(strip, 2)[0]).toBeCloseTo(-clearDepth(cabinet, shop.materials, opening.origin.y), 5);
    }
    // Against the case sides, under the box sides.
    expect(extent(left, 0)).toEqual([expect.closeTo(tCase, 5), expect.closeTo(2 * tCase, 5)]);
    expect(extent(right, 0)[1]).toBeCloseTo(cabinet.size.width.mm - tCase, 5);
    const side = of(parts, 'drawer-1', 'box-side-left')!;
    expect(extent(side, 0)[0]).toBeGreaterThan(extent(left, 0)[0]);
    expect(extent(side, 0)[1]).toBeLessThan(extent(left, 0)[1]);
  });

  it('lists the strips on the saw cut list and their screws, and no slides', () => {
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    const row = lists.cutList.flatMap((g) => g.rows).find((r) => r.names.includes('Runner, left'))!;
    expect(row.quantity).toBe(2);
    expect(row.saw).not.toBe('cnc');
    const items = lists.hardware.map((h) => `${h.quantity ?? ''} ${h.item}`).join('\n');
    expect(items).toMatch(/6 #8 × 1-1\/4" wood screws/);
    expect(items).toMatch(/Drawer stops/);
    expect(items).not.toMatch(/slide|washer-head/);
    expect(lists.parts.find((p) => p.name === 'Runner, left')!.label).toMatch(/^D\d+$/);
  });
});

describe('three drawers on runners', () => {
  const { project, openings, parts } = build('drawers', ['runners', 'runners', 'runners']);
  const boxes = drawersOf(project).map((d) => drawerBox(d, project, shop)!);

  it('runs the lowest on the case bottom and the others on strips', () => {
    expect(boxes.map((b) => b.runners)).toEqual([
      { on: 'strips', under: 'stretcher' },
      { on: 'strips', under: 'runnersAbove' },
      { on: 'caseBottom', under: 'runnersAbove' },
    ]);
    expect(parts.filter((p) => p.role === 'runner').map((p) => p.name)).toEqual(['Drawer 1 runner, left', 'Drawer 1 runner, right', 'Drawer 2 runner, left', 'Drawer 2 runner, right']);
  });

  it('keeps each box under the runners of the one above', () => {
    expect(boxes[0]!.size.height).toBeCloseTo(openings[0]!.height - RUNNER_TOP_CLEARANCE, 5);
    expect(boxes[1]!.size.height).toBeCloseTo(openings[1]!.height - RUNNER_HEIGHT - RUNNER_TOP_CLEARANCE, 5);
    expect(boxes[2]!.size.height).toBeCloseTo(openings[2]!.height - RUNNER_HEIGHT - RUNNER_TOP_CLEARANCE, 5);
    const all = [...parts, ...deriveCabinetParts(project, shop)];
    const clashes: string[] = [];
    // Nothing of one drawer is inside another part, apart from its own joints.
    all.forEach((a, i) => all.slice(i + 1).forEach((b) => a.designObjectId !== b.designObjectId && overlap(a, b) && clashes.push(`${a.name} / ${b.name}`)));
    expect(clashes).toEqual([]);
  });

  it('refuses a box taller than the room under the strips', () => {
    const p = structuredClone(project);
    drawersOf(p)[1]!.box.height = { mm: openings[1]!.height - 5, unit: 'mm' };
    expect(() => drawerBox(drawersOf(p)[1]!, p, shop)).toThrow(/strips over it/);
  });
});

describe('drawers on runners mixed with drawers on slides', () => {
  const { project, openings, parts } = build('drawers', ['runners', 'wide', 'runners']);
  const boxes = drawersOf(project).map((d) => drawerBox(d, project, shop)!);

  it('gives a runner drawer kickers when the drawer above is on slides', () => {
    expect(boxes[2]!.runners).toEqual({ on: 'caseBottom', under: 'kickers' });
    const kicker = of(parts, 'drawer-3', 'kicker-left')!;
    expect(kicker.name).toBe('Drawer 3 kicker, left');
    expect(extent(kicker, 1)[1]).toBeCloseTo(openings[2]!.origin.y + openings[2]!.height, 5);
    expect(extent(of(parts, 'drawer-3', 'box-side-left')!, 1)[1]).toBeCloseTo(extent(kicker, 1)[0] - RUNNER_TOP_CLEARANCE, 5);
  });

  it('keeps a drawer on slides below the runners of the one above', () => {
    expect(boxes[1]!.slide).toBeDefined();
    const side = of(parts, 'drawer-2', 'box-side-left')!;
    const runner = of(parts, 'drawer-1', 'runner-left')!;
    expect(extent(side, 1)[1]).toBeLessThanOrEqual(extent(runner, 1)[0] - RUNNER_TOP_CLEARANCE + 0.001);
  });

  it('comes out as a complete job', async () => {
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    for (const p of [...job.parts, ...job.cabinetParts]) {
      const onBlank = job.plan.blanks.filter((b) => b.partIds.includes(p.id)).length;
      expect(onBlank + cut.filter((n) => n === p.name).length, p.name).toBe(1);
      for (const f of p.features) if (onBlank || f.kind !== 'cutout') expect(planned.has(`${p.id}:${f.id}`), `${p.name}: ${f.id}`).toBe(true);
    }
    const slides = lists.hardware.filter((h) => /slide,/.test(h.item)).reduce((n, h) => n + (h.quantity ?? 0), 0);
    expect(slides).toBe(1);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  }, 30000);
});
