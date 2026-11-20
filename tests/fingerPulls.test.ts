// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { FINGER_HOLE, FINGER_NOTCH, deriveDrawerBoxParts, deriveParts, doorSetOf, drawerBox, fingerNotchOutline, isDrawer, cabinetsOf, designsOf } from '@/design';
import { asRect } from '@/geometry/rect';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { Feature, Part, PlanWarning, Project, ShopDrawerFront } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/** Milestone 3: finger pulls cut on the CNC, for the fronts of a shop-style cabinet. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const drawerOf = (p: Project) => designsOf(p).find(isDrawer)!;
type Hole = Extract<Feature, { kind: 'hole' }>;
const pullHole = (part: Part) => part.features.find((f): f is Hole => f.kind === 'hole' && f.id === 'finger-pull');
const outlineOf = (part: Part) => {
  const cutout = part.features.find((f) => f.kind === 'cutout')!;
  return cutout.kind === 'cutout' ? cutout.outline : [];
};

function pulled(front: ShopDrawerFront = 'wide') {
  const project = createShopCabinetProject();
  doorSetOf(project).shopPull = 'fingerPull';
  drawerOf(project).shop = { front, pull: 'fingerPull' };
  return project;
}

describe('a finger hole in an inset door', () => {
  const project = pulled();
  const [left, right] = deriveParts(project, shop);

  it('is through the door, near its top, at the edge it opens at', () => {
    const l = pullHole(left!)!;
    const r = pullHole(right!)!;
    expect(l.diameter).toBeCloseTo(FINGER_HOLE.diameter, 5);
    expect(l.depth).toBeCloseTo(left!.size.thickness, 5);
    expect(l.face).toBe('B');
    // The left door is hinged on the left and opens at its right edge; the right door mirrors it.
    expect(l.center.x).toBeCloseTo(left!.size.width - FINGER_HOLE.fromEdge, 5);
    expect(r.center.x).toBeCloseTo(FINGER_HOLE.fromEdge, 5);
    expect(l.center.y).toBeCloseTo(left!.size.height - FINGER_HOLE.fromTop, 5);
    // Well clear of the hinge cups.
    for (const cup of left!.features) if (cup.kind === 'cup') expect(Math.abs(cup.center.x - l.center.x)).toBeGreaterThan(100);
  });

  it('is on a single door at the edge away from its hinges', () => {
    const p = pulled();
    Object.assign(doorSetOf(p).mounting, { doors: 1, hingeSide: 'right' });
    const door = deriveParts(p, shop)[0]!;
    expect(pullHole(door)!.center.x).toBeCloseTo(FINGER_HOLE.fromEdge, 5);
  });

  it('is only for the shop style, and only when chosen', () => {
    expect(deriveParts(createShopCabinetProject(), shop).some((p) => pullHole(p))).toBe(false);
    const framed = createBaseCabinetProject('faceFrame');
    doorSetOf(framed).shopPull = 'fingerPull';
    expect(deriveParts(framed, shop).some((p) => pullHole(p))).toBe(false);
  });
});

describe.each(['wide', 'plain', 'runners'] as ShopDrawerFront[])('a finger notch in a %s drawer front', (front) => {
  const project = pulled(front);
  const part = deriveDrawerBoxParts(project, shop).find((p) => p.role === 'boxFront')!;
  const outline = outlineOf(part);

  it('is a notch in the top edge of the front wall, centred', () => {
    expect(asRect(outline)).toBeFalsy();
    expect(outline).toEqual(fingerNotchOutline(part.size.width, part.size.height));
    const top = part.size.height;
    const floor = outline.filter((p) => Math.abs(p.y - (top - FINGER_NOTCH.depth)) < 0.001).map((p) => p.x);
    expect(Math.max(...floor) - Math.min(...floor)).toBeCloseTo(FINGER_NOTCH.width, 5);
    expect((Math.max(...floor) + Math.min(...floor)) / 2).toBeCloseTo(part.size.width / 2, 5);
    // Every side runs along X or Y, which is what the outline cut can follow.
    outline.forEach((p, i) => {
      const q = outline[(i + 1) % outline.length]!;
      expect(Math.abs(p.x - q.x) < 0.001 || Math.abs(p.y - q.y) < 0.001).toBe(true);
    });
    expect(drawerBox(drawerOf(project), project, shop)!.fingerPull).toBe(true);
  });

  it('stays clear of the joints in the front wall', () => {
    const notch = { x0: (part.size.width - FINGER_NOTCH.width) / 2, x1: (part.size.width + FINGER_NOTCH.width) / 2, y0: part.size.height - FINGER_NOTCH.depth };
    for (const f of part.features) {
      if (f.kind !== 'dado') continue;
      const xs = f.outline.map((p) => p.x);
      const ys = f.outline.map((p) => p.y);
      const beside = Math.max(...xs) < notch.x0 - 5 || Math.min(...xs) > notch.x1 + 5;
      const under = Math.max(...ys) < notch.y0 - 5;
      expect(beside || under, f.id).toBe(true);
    }
  });
});

describe('finger pulls that do not fit', () => {
  it('are refused with a reason', () => {
    expect(() => fingerNotchOutline(150, 150)).toThrow(/too narrow/);
    expect(() => fingerNotchOutline(400, 40)).toThrow(/too low/);
    const p = pulled();
    doorSetOf(p).mounting.doors = 2;
    const cabinet = cabinetsOf(p)[0]!;
    cabinet.size.width = { mm: 220, unit: 'mm' };
    doorSetOf(p).shopPull = 'fingerPull';
    drawerOf(p).shop = { front: 'wide' };
    expect(() => deriveParts(p, shop)).toThrow(/too small for a finger hole/);
  });
});

describe('the shop cabinet with finger pulls, as a job', () => {
  const project = pulled();
  const job = buildJob(project, shop);
  const lists = buildLists(job, project, shop, L);

  it('bores the finger holes from the back, in a row of their own', () => {
    const row = job.plan.operations.find((o) => o.key === 'doors:holes:finger-pull')!;
    expect(row.label).toMatch(/[Ff]inger holes/);
    expect(row.face).toBe('B');
    expect(row.method).toBe('cnc');
    expect(row.clearToolId).toBeTruthy();
    expect(row.machineSeconds).toBeGreaterThan(0);
    const cups = job.plan.operations.find((o) => o.key === 'doors:hingeCup')!;
    expect(cups.source.kind === 'features' && cups.source.refs.some((r) => r.featureId === 'finger-pull')).toBe(false);
    // The doors are cut with their backs up: the holes add no setup.
    const blank = job.plan.blanks.find((b) => b.partIds.includes('doors-1/door-left'))!;
    const without = buildJob(createShopCabinetProject(), shop).plan.blanks.find((b) => b.partIds.includes('doors-1/door-left'))!;
    expect(blank.setups.length).toBe(without.setups.length);
    const setup = blank.setups.find((s) => s.operationKeys.includes(row.key))!;
    expect(setup.operationKeys).toContain('doors:hingeCup');
  });

  it('cuts the notch with the drawer front\'s outline and says so on the parts list', () => {
    const front = lists.parts.find((p) => p.name === 'Box front')!;
    expect(front.cutOut).toBe('cnc');
    expect(front.steps.map((s) => s.label)).toContain('Finger pull notch, cut with the outline');
    expect(job.plan.parts.find((p) => p.partId === 'drawer-1/box-front')!.reason).toMatch(/finger pull notch/);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });

  it('plans every feature and writes files that parse', async () => {
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    for (const p of [...job.parts, ...job.cabinetParts]) {
      const onBlank = job.plan.blanks.some((b) => b.partIds.includes(p.id));
      for (const f of p.features) if (onBlank || f.kind !== 'cutout') expect(planned.has(`${p.id}:${f.id}`), `${p.name}: ${f.id}`).toBe(true);
    }
    for (const [i, file] of job.files.entries()) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      expect(file.text.split('\n').every((l) => new TextEncoder().encode(l).length <= 127)).toBe(true);
      const program = job.programs[i]!;
      const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      if (program.setup.pinHoles.length === 0) expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + THROUGH_EXTRA + 0.011);
    }
    // The file that bores the doors' backs says so on its status lines.
    expect(job.files.some((f) => /MSG, .*[Ff]inger holes/.test(f.text))).toBe(true);
  }, 30000);
});
