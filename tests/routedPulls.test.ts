// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deriveDrawerBoxParts, deriveHandleParts, deriveParts, designsOf, doorHandleChoice, isHandle, notchedOutline } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { asRect } from '@/geometry/rect';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { printedHandlesOf } from '@/jigs/printedHandles';
import { STARTER_ROUTED_PULLS, createStarterShop } from '@/libraries';
import type { Part, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Pulls the CNC cuts into the fronts themselves: a finger hole, and a notch in the edge. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const withHandle = (project: Project, handleId: string): Project => {
  for (const d of designsOf(project)) {
    if (d.template === 'drawer') d.handle = { handleId };
    else d.handle = doorHandleChoice(handleId);
  }
  return project;
};
const allParts = (project: Project) => [...deriveParts(project, shop), ...deriveDrawerBoxParts(project, shop)];
const part = (parts: Part[], id: string) => parts.find((p) => p.id === id)!;
const outlineOf = (p: Part) => p.features.find((f) => f.kind === 'cutout')!.outline;
const area = (outline: { x: number; y: number }[]) => outline.reduce((sum, p, i) => sum + p.x * outline[(i + 1) % outline.length]!.y - outline[(i + 1) % outline.length]!.x * p.y, 0) / 2;

describe('the pulls cut into the front, in the library', () => {
  it('are a finger hole, a half-round notch and a square notch: no holes for screws, nothing to fit', () => {
    expect(STARTER_ROUTED_PULLS.map((h) => [h.id, h.routed!.shape, h.holes, +h.routed!.width.toFixed(2), +h.routed!.depth.toFixed(2)])).toEqual([
      ['routed-hole', 'hole', 0, 31.75, 0],
      ['routed-scoop', 'scoop', 0, 63.5, 25.4],
      ['routed-notch', 'notch', 0, 101.6, 25.4],
    ]);
    expect(STARTER_ROUTED_PULLS.every((h) => h.tuneMe.includes('routed'))).toBe(true);
  });
});

describe('an outline with a notch in an edge', () => {
  const size = { width: 300, height: 500 };

  it('a square notch takes its rectangle out of the edge, and the outline still runs counter-clockwise', () => {
    for (const edge of ['top', 'left', 'right'] as const) {
      const outline = notchedOutline(size, edge, 150, 'notch', 100, 25);
      expect(outline).toHaveLength(8);
      expect(area(outline)).toBeCloseTo(300 * 500 - 100 * 25, 6);
    }
    expect(notchedOutline(size, 'top', 150, 'notch', 100, 25).slice(3, 7)).toEqual([
      { x: 200, y: 500 },
      { x: 200, y: 475 },
      { x: 100, y: 475 },
      { x: 100, y: 500 },
    ]);
  });

  it('a half-round notch takes half an ellipse out, deepest in its middle', () => {
    for (const edge of ['top', 'left', 'right'] as const) {
      const outline = notchedOutline(size, edge, 250, 'scoop', 60, 25);
      const taken = 300 * 500 - area(outline);
      // A little less than the true half ellipse: it is made of flats.
      expect(taken).toBeLessThan((Math.PI * 30 * 25) / 2);
      expect(taken).toBeGreaterThan(((Math.PI * 30 * 25) / 2) * 0.98);
    }
    const right = notchedOutline(size, 'right', 250, 'scoop', 60, 25);
    expect(Math.min(...right.filter((p) => p.y > 220 && p.y < 280).map((p) => p.x))).toBeCloseTo(275, 6);
    expect(right.find((p) => Math.abs(p.x - 275) < 1e-6)!.y).toBeCloseTo(250, 6);
  });
});

describe('a pull cut into a door', () => {
  it('a finger hole goes through where a handle would be, bored from the back with the cups', () => {
    const door = part(allParts(withHandle(createBaseCabinetProject('frameless'), 'routed-hole')), 'doors-1/door-left');
    const holes = door.features.flatMap((f) => (f.kind === 'hole' && f.id === 'finger-pull' ? [f] : []));
    expect(holes).toHaveLength(1);
    // On the middle of the shaker door's stile, its centre 3" down.
    expect(holes[0]!.center.x).toBeCloseTo(door.size.width - 57.15 / 2, 6);
    expect(holes[0]!.center.y).toBeCloseTo(door.size.height - 76.2, 6);
    expect([holes[0]!.face, holes[0]!.depth, +holes[0]!.diameter.toFixed(2)]).toEqual(['B', door.size.thickness, 31.75]);
    // No screw holes: nothing is fitted.
    expect(door.features.some((f) => f.id.startsWith('handle'))).toBe(false);
    expect(asRect(outlineOf(door))).toBeTruthy();
  });

  it('a notch is in the edge the door opens at, so a pair\'s two meet; it starts where the handle would', () => {
    const parts = allParts(withHandle(createBaseCabinetProject('frameless'), 'routed-scoop'));
    const [left, right] = [part(parts, 'doors-1/door-left'), part(parts, 'doors-1/door-right')];
    for (const door of [left, right]) {
      expect(asRect(outlineOf(door))).toBeFalsy();
      expect(door.features.some((f) => f.kind === 'hole' && (f.id === 'finger-pull' || f.id.startsWith('handle')))).toBe(false);
      const ys = outlineOf(door).filter((p) => p.x > 1 && p.x < door.size.width - 1).map((p) => p.y);
      // From 3" down to 3" + 2-1/2" down.
      expect(door.size.height - Math.max(...ys)).toBeGreaterThan(76.2 - 1e-6);
      expect(door.size.height - Math.min(...ys)).toBeLessThan(76.2 + 63.5 + 1e-6);
    }
    // The left door is notched in its right edge, the right door in its left.
    expect(Math.min(...outlineOf(left).filter((p) => p.y > 1 && p.y < left.size.height - 1).map((p) => p.x))).toBeCloseTo(left.size.width - 25.4, 6);
    expect(Math.max(...outlineOf(right).filter((p) => p.y > 1 && p.y < right.size.height - 1).map((p) => p.x))).toBeCloseTo(25.4, 6);
  });

  it('a notch too deep for a shaker door\'s stile, or off the end of the door, says so', () => {
    const own = createStarterShop();
    own.hardware.filter(isHandle).find((h) => h.id === 'routed-notch')!.routed!.depth = 60;
    expect(() => deriveParts(withHandle(createBaseCabinetProject('frameless'), 'routed-notch'), own)).toThrow(/too small for the pull cut into it/);
    const project = withHandle(createBaseCabinetProject('frameless'), 'routed-scoop');
    const doors = designsOf(project).find((d) => d.template === 'doorSet')!;
    if (doors.template !== 'doorSet') throw new Error('not doors');
    doors.handle!.fromEnd = len('60"');
    expect(() => deriveParts(project, shop)).toThrow(/too small for the pull cut into it/);
  });
});

describe('a pull cut into a drawer front', () => {
  it('a notch is in the middle of the top edge: of an applied front, and of the front of the box where that is the front', () => {
    const applied = part(allParts(withHandle(createBaseCabinetProject('frameless'), 'routed-notch')), 'drawer-1/front');
    const notch = outlineOf(applied).filter((p) => p.y < applied.size.height - 1 && p.y > 1);
    expect(notch.map((p) => [+(p.x - applied.size.width / 2).toFixed(2), +(applied.size.height - p.y).toFixed(2)])).toEqual([
      [50.8, 25.4],
      [-50.8, 25.4],
    ]);
    const shopFront = part(allParts(withHandle(createShopCabinetProject(), 'routed-scoop')), 'drawer-1/box-front');
    expect(asRect(outlineOf(shopFront))).toBeFalsy();
    expect(Math.min(...outlineOf(shopFront).map((p) => p.y).filter((y) => y > 1))).toBeCloseTo(shopFront.size.height - 25.4, 6);
  });

  it('a finger hole is centred on it', () => {
    const front = part(allParts(withHandle(createShopCabinetProject(), 'routed-hole')), 'drawer-1/box-front');
    const hole = front.features.find((f) => f.id === 'finger-pull');
    expect(hole?.kind === 'hole' && [hole.center.x, hole.center.y, hole.face]).toEqual([front.size.width / 2, front.size.height / 2, 'A']);
  });
});

describe('the job with pulls cut into the fronts', () => {
  for (const [name, make, id] of [
    ['notches in a frameless cabinet\'s shaker fronts', () => createBaseCabinetProject('frameless'), 'routed-scoop'],
    ['square notches in a face frame cabinet\'s fronts', () => createBaseCabinetProject('faceFrame'), 'routed-notch'],
    ['finger holes in a shop cabinet\'s fronts', () => createShopCabinetProject(), 'routed-hole'],
  ] as const) {
    it(`${name}: no more setups, nothing to buy or make, G-code that parses`, async () => {
      const plain = buildJob(make(), shop);
      const project = withHandle(make(), id);
      const job = buildJob(project, shop);
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      expect(job.plan.blanks.map((b) => b.setups.length)).toEqual(plain.plan.blanks.map((b) => b.setups.length));
      // Nothing is fitted: no handle parts, no prints, no hardware, no screw holes.
      expect(deriveHandleParts(project, shop)).toEqual([]);
      expect(printedHandlesOf([...job.parts, ...job.cabinetParts], shop.hardware)).toEqual([]);
      expect(job.plan.operations.some((o) => /:holes:handle/.test(o.key))).toBe(false);
      const hardware = buildLists(job, project, shop, L).hardware;
      expect(hardware.filter((h) => /[Kk]nob|pull|notch|Finger hole/.test(h.item))).toEqual([]);
      // A hole is a row of its own; a notch is cut with the outline, and the checklist says to ease it.
      if (id === 'routed-hole') expect(job.plan.operations.filter((o) => /finger-pull/.test(o.key)).map((o) => o.key)).toEqual(['doors:holes:finger-pull', 'boxes:holes:finger-pull@31.75']);
      const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).flatMap((s) => s.steps.map((step) => step.text));
      expect(steps.filter((t) => /^Ease the edges of the finger pulls/.test(t))).toHaveLength(1);
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });
  }
});
