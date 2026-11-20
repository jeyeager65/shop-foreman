// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOOR_HANDLE,
  cabinetsOf,
  deriveDrawerBoxParts,
  deriveParts,
  designsOf,
  doorHandleChoice,
  doorHandleEnd,
  frontBorder,
  starterPattern,
  isHandle,
  setOwnFrontSettings,
  surfaceBelowFace,
} from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { GENERIC_KNOB_ID, GENERIC_PULL_ID, createStarterShop } from '@/libraries';
import type { Feature, Part, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { addWallCabinet, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Handles: knobs and pulls on the fronts, and the holes the CNC drills for them. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const pull = shop.hardware.filter(isHandle).find((h) => h.id === GENERIC_PULL_ID)!;

/** Gives every door and drawer of the project a handle. */
const withHandles = (project: Project, handleId = GENERIC_PULL_ID): Project => {
  for (const d of designsOf(project)) {
    if (d.template === 'drawer') d.handle = { handleId };
    else d.handle = doorHandleChoice(handleId);
  }
  return project;
};
const allParts = (project: Project) => [...deriveParts(project, shop), ...deriveDrawerBoxParts(project, shop)];
const handleHoles = (part: Part) => part.features.flatMap((f) => (f.kind === 'hole' && f.id.startsWith('handle') ? [f] : []));
const part = (parts: Part[], id: string) => parts.find((p) => p.id === id)!;

describe('the handles in the library', () => {
  it('has a generic knob and a generic pull: one hole or two, a size and a spacing', () => {
    const handles = shop.hardware.filter(isHandle);
    expect(handles.filter((h) => h.generic).map((h) => [h.id, h.holes, h.spacing, h.hole.diameter])).toEqual([
      [GENERIC_KNOB_ID, 1, 0, 5],
      [GENERIC_PULL_ID, 2, 96, 5],
    ]);
    // Two holes have a spacing; one, or none (a pull cut into the front itself), has not.
    expect(handles.every((h) => (h.holes === 2 ? h.spacing > 0 : h.spacing === 0))).toBe(true);
    expect(handles.filter((h) => h.holes === 0).every((h) => h.routed)).toBe(true);
    // The hole and the drawn sizes are placeholders.
    expect(handles.filter((h) => !h.routed).every((h) => h.tuneMe.includes('hole') && h.tuneMe.includes('look'))).toBe(true);
  });
});

describe('a door\'s handle', () => {
  const parts = allParts(withHandles(createBaseCabinetProject('frameless')));
  const [left, right] = [part(parts, 'doors-1/door-left'), part(parts, 'doors-1/door-right')];

  it('is upright near the edge the door opens at, measured from its top: two holes through, bored from the back', () => {
    const holes = handleHoles(left);
    expect(holes).toHaveLength(2);
    // The left door is hinged on the left and opens at its right edge.
    for (const h of holes) {
      // A shaker door: on the middle of its 2-1/4" stile.
      expect(h.center.x).toBeCloseTo(left.size.width - 57.15 / 2, 6);
      expect(h.face).toBe('B');
      expect(h.depth).toBe(left.size.thickness);
      expect(h.diameter).toBe(pull.hole.diameter);
      expect(h.hardwareId).toBe(GENERIC_PULL_ID);
    }
    expect(holes.map((h) => left.size.height - h.center.y).sort((a, b) => a - b)).toEqual([expect.closeTo(DEFAULT_DOOR_HANDLE.fromEnd.mm, 6), expect.closeTo(DEFAULT_DOOR_HANDLE.fromEnd.mm + 96, 6)]);
    // The right door is its mirror image.
    expect(handleHoles(right).every((h) => Math.abs(h.center.x - 57.15 / 2) < 1e-6)).toBe(true);
    // A slab door has no stile: 1-1/2" in.
    const slab = part(allParts(withHandles(createShopCabinetProject())), 'doors-1/door-right');
    expect(handleHoles(slab).every((h) => Math.abs(h.center.x - DEFAULT_DOOR_HANDLE.fromEdge.mm) < 1e-6)).toBe(true);
  });

  it('is near the bottom on a wall cabinet, and on the upper doors of a tall one', () => {
    expect([doorHandleEnd('base', 'Doors'), doorHandleEnd('wall', 'Doors'), doorHandleEnd('tall', 'Upper doors'), doorHandleEnd('tall', 'Lower doors'), doorHandleEnd(undefined, 'Vanity doors')]).toEqual(['top', 'bottom', 'bottom', 'top', 'top']);
    const project = createBaseCabinetProject('frameless');
    const wall = addWallCabinet(project, { name: 'Wall cabinet' });
    const doors = allParts(withHandles(project)).filter((p) => p.id.includes('/door') && p.designObjectId !== 'doors-1');
    expect(doors.length).toBeGreaterThan(0);
    expect(cabinetsOf(project).find((c) => c.id === wall.id)!.form).toBe('wall');
    for (const door of doors) expect(handleHoles(door).map((h) => h.center.y).sort((a, b) => a - b)[0]).toBeCloseTo(DEFAULT_DOOR_HANDLE.fromEnd.mm, 6);
  });

  it('a knob is one hole, where the pull\'s nearest hole would be; the offsets move it', () => {
    const project = withHandles(createBaseCabinetProject('frameless'), GENERIC_KNOB_ID);
    const doors = designsOf(project).find((d) => d.template === 'doorSet')!;
    if (doors.template !== 'doorSet') throw new Error('not doors');
    doors.handle!.fromEdge = len('2"');
    doors.handle!.fromEnd = len('4"');
    const door = part(allParts(project), 'doors-1/door-left');
    const holes = handleHoles(door);
    expect(holes).toHaveLength(1);
    expect(holes[0]!.center.x).toBeCloseTo(door.size.width - 50.8, 6);
    expect(holes[0]!.center.y).toBeCloseTo(door.size.height - 101.6, 6);
  });

  it('is the project\'s, and a door set may have its own', () => {
    const project = createBaseCabinetProject('frameless');
    addWallCabinet(project, { name: 'Wall cabinet' });
    const sets = () => designsOf(project).filter((d) => d.template === 'doorSet');
    sets()[0]!.handle = doorHandleChoice(GENERIC_PULL_ID);
    // Set on one, every door set follows.
    expect(sets().map((d) => d.handle?.handleId)).toEqual(sets().map(() => GENERIC_PULL_ID));
    setOwnFrontSettings(project, sets()[1]!.id, true);
    sets()[1]!.handle = doorHandleChoice(GENERIC_KNOB_ID);
    expect(sets().map((d) => d.handle?.handleId)).toEqual([GENERIC_PULL_ID, GENERIC_KNOB_ID, ...sets().slice(2).map(() => GENERIC_PULL_ID)]);
  });

  it('a door too small for it where it is set says so; no handle, no holes', () => {
    const project = withHandles(createBaseCabinetProject('frameless'));
    const doors = designsOf(project).find((d) => d.template === 'doorSet')!;
    if (doors.template !== 'doorSet') throw new Error('not doors');
    doors.handle!.fromEnd = len('60"');
    expect(() => deriveParts(project, shop)).toThrow(/too small for its handle/);
    expect(allParts(createBaseCabinetProject('frameless')).flatMap(handleHoles)).toEqual([]);
  });
});

describe('a drawer\'s handle', () => {
  it('is level and centred on an applied front, bored with the front\'s other work so nothing is flipped for it', () => {
    const project = withHandles(createBaseCabinetProject('frameless'));
    const front = part(allParts(project), 'drawer-1/front');
    const holes = handleHoles(front);
    expect(holes.map((h) => [h.center.x - front.size.width / 2, h.center.y - front.size.height / 2, h.face, h.depth])).toEqual([
      [-48, 0, 'A', front.size.thickness],
      [48, 0, 'A', front.size.thickness],
    ]);
    // The box behind it is not drilled: that is done by hand through the front.
    expect(handleHoles(part(allParts(project), 'drawer-1/box-front'))).toEqual([]);
    // From the top, when the design says so.
    const drawer = designsOf(project).find((d) => d.template === 'drawer')!;
    drawer.handle = { handleId: GENERIC_KNOB_ID, fromTop: len('1-1/2"') };
    const moved = part(allParts(project), 'drawer-1/front');
    expect(handleHoles(moved).map((h) => [h.center.x, moved.size.height - h.center.y])).toEqual([[moved.size.width / 2, expect.closeTo(38.1, 6)]]);
  });

  it('where the front of the box is the front, goes through that, from the inside; a finger pull takes its place', () => {
    const project = withHandles(createShopCabinetProject());
    const front = part(allParts(project), 'drawer-1/box-front');
    const holes = handleHoles(front);
    expect(holes).toHaveLength(2);
    expect(holes.every((h) => h.face === 'A' && h.depth === front.size.thickness && Math.abs(h.center.y - front.size.height / 2) < 1e-6)).toBe(true);
    expect((holes[0]!.center.x + holes[1]!.center.x) / 2).toBeCloseTo(front.size.width / 2, 6);

    for (const d of designsOf(project)) {
      if (d.template === 'drawer') d.shop = { ...d.shop, pull: 'fingerPull' };
      else d.shopPull = 'fingerPull';
    }
    const fingered = allParts(project);
    expect(fingered.flatMap(handleHoles)).toEqual([]);
    expect(part(fingered, 'doors-1/door-left').features.some((f: Feature) => f.id === 'finger-pull')).toBe(true);
  });
});

describe('the surface a handle stands on', () => {
  it('is the recessed panel on a shaker front, the face on its frame and on a slab, and part-way on the bevel between', () => {
    const parts = allParts(withHandles(createBaseCabinetProject('frameless')));
    const front = part(parts, 'drawer-1/front');
    const pocket = front.features.find((f) => f.kind === 'pocket')!;
    if (pocket.kind !== 'pocket') throw new Error('no pocket');
    // The drawer front's pull is centred on it, so both its holes are in the panel: 1/4" down.
    expect(handleHoles(front).map((h) => surfaceBelowFace(front, h.center))).toEqual([pocket.depth, pocket.depth]);
    expect(pocket.depth).toBeCloseTo(6.35, 6);
    // A door's handle is on the middle of its stile: on the face.
    const door = part(parts, 'doors-1/door-left');
    expect(handleHoles(door).map((h) => surfaceBelowFace(door, h.center))).toEqual([0, 0]);
    // Half-way down the bevel, half the depth; on the frame beside it, none.
    const floorX = Math.min(...pocket.outline.map((p) => p.x));
    const frame = 57.15;
    expect(surfaceBelowFace(front, { x: (frame + floorX) / 2, y: front.size.height / 2 })).toBeCloseTo(pocket.depth / 2, 6);
    expect(surfaceBelowFace(front, { x: frame - 1, y: front.size.height / 2 })).toBe(0);
    // A slab front has no recess.
    const slab = part(allParts(withHandles(createShopCabinetProject())), 'doors-1/door-left');
    expect(handleHoles(slab).map((h) => surfaceBelowFace(slab, h.center))).toEqual([0, 0]);
  });
});

describe('the job with handles', () => {
  for (const [name, make] of [
    ['a frameless cabinet', () => createBaseCabinetProject('frameless')],
    ['a face frame cabinet', () => createBaseCabinetProject('faceFrame')],
    ['a shop cabinet', () => createShopCabinetProject()],
  ] as const) {
    it(`${name}: a row for the holes, a bit that fits, no more setups, G-code that parses`, async () => {
      const plain = buildJob(make(), shop);
      const project = withHandles(make());
      const job = buildJob(project, shop);
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      const rows = job.plan.operations.filter((o) => /:holes:handle(@|$)/.test(o.key));
      const shopStyle = name === 'a shop cabinet';
      expect(rows.map((o) => o.key)).toEqual(shopStyle ? ['doors:holes:handle', 'boxes:holes:handle@5'] : ['doors:holes:handle', 'drawerFronts:holes:handle']);
      // Through holes of 5 mm: a bit smaller than the hole helixes them.
      for (const row of rows) {
        expect(row.method).toBe('cnc');
        const bit = shop.tools.find((t) => t.id === row.clearToolId)!;
        expect(bit.shape.kind === 'endMill' && bit.shape.diameter.mm < 5).toBe(true);
      }
      // The holes are bored where the other work is: no sheet is turned over, or set up again, for them.
      expect(job.plan.blanks.map((b) => b.setups.length)).toEqual(plain.plan.blanks.map((b) => b.setups.length));
      expect(job.plan.operations.map((o) => o.key).filter((k) => !/:holes:handle/.test(k))).toEqual(plain.plan.operations.map((o) => o.key));
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });
  }

  it('lists the handles as hardware in place of "fitted by hand", and the checklist says to fit them', () => {
    const lists = (project: Project) => {
      const job = buildJob(project, shop);
      return { job, hardware: buildLists(job, project, shop, L).hardware };
    };
    const before = lists(createShopCabinetProject()).hardware;
    expect(before.filter((h) => /Knob/.test(h.item)).map((h) => [h.group, h.item, h.quantity])).toEqual([
      ['Doors', 'Knobs or pulls', 2],
      ['Drawer', 'Knob or pull', 1],
    ]);
    const project = withHandles(createShopCabinetProject());
    const { job, hardware } = lists(project);
    expect(hardware.filter((h) => /Knob/.test(h.item))).toEqual([]);
    expect(hardware.filter((h) => h.item === pull.name).map((h) => [h.group, h.quantity])).toEqual([
      ['Doors', 2],
      ['Drawer', 1],
    ]);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).flatMap((s) => s.steps.map((step) => step.text));
    expect(steps.filter((t) => /^Fit the handles/.test(t))).toHaveLength(1);
    // Behind an applied front the box is drilled through the front, by hand.
    const framed = withHandles(createBaseCabinetProject('frameless'));
    const framedJob = buildJob(framed, shop);
    const said = buildChecklistSections(framed, framedJob.plan, framedJob.programs, shop.tools, activeMachine(shop)).flatMap((s) => s.steps.map((step) => step.text));
    expect(said.find((t) => /^Fit the handles/.test(t))).toMatch(/drill on through the box front/);
  });
});

/** A handle in the middle of the border, for patterned doors. */
describe('a handle in the middle of the border', () => {
  const patterned = () => {
    const project = withHandles(createBaseCabinetProject('frameless'));
    for (const d of designsOf(project)) {
      const style = { kind: 'slab' as const, pattern: starterPattern('grooves') };
      if (d.template === 'drawer') d.front.style = style;
      else d.style = style;
    }
    return project;
  };
  const fronts = (project: Project) => allParts(project).filter((p) => handleHoles(p).length > 0);

  it('goes by the usual offsets until it is asked for', () => {
    const margin = frontBorder({ kind: 'slab', pattern: starterPattern('grooves') })!;
    expect(margin).toBeCloseTo(len('2-1/4"').mm);
    const door = fronts(patterned()).find((p) => /door/i.test(p.name))!;
    const x = handleHoles(door)[0]!.center.x;
    expect(Math.min(x, door.size.width - x)).toBeCloseTo(DEFAULT_DOOR_HANDLE.fromEdge.mm);
  });

  it("puts a door's handle half the margin in from its opening edge, and a drawer front's half the margin down", () => {
    const project = patterned();
    for (const d of designsOf(project)) d.handle!.inMargin = true;
    const margin = len('2-1/4"').mm;
    const parts = fronts(project);
    const doors = parts.filter((p) => /door/i.test(p.name));
    expect(doors.length).toBe(2);
    for (const door of doors) {
      const holes = handleHoles(door);
      expect(holes).toHaveLength(2);
      for (const h of holes) expect(Math.min(h.center.x, door.size.width - h.center.x)).toBeCloseTo(margin / 2);
    }
    // The two doors' handles are at the edges that meet.
    expect(new Set(doors.map((d) => handleHoles(d)[0]!.center.x < d.size.width / 2)).size).toBe(2);
    const front = parts.find((p) => /front/i.test(p.name))!;
    for (const h of handleHoles(front)) expect(front.size.height - h.center.y).toBeCloseTo(margin / 2);
    // Clear of every line of the pattern.
    for (const part of parts) {
      for (const f of part.features) {
        if (f.kind !== 'slot') continue;
        for (const p of f.path) expect(Math.min(p.x, part.size.width - p.x, p.y, part.size.height - p.y)).toBeGreaterThanOrEqual(margin - 0.01);
      }
    }
  });

  it('is the frame on a shaker front, and nothing on a plain slab', () => {
    const shaker = withHandles(createBaseCabinetProject('frameless'));
    for (const d of designsOf(shaker)) d.handle!.inMargin = true;
    const front = fronts(shaker).find((p) => /front/i.test(p.name))!;
    const drawer = designsOf(shaker).find((d) => d.template === 'drawer')!;
    if (drawer.template !== 'drawer' || drawer.front.style.kind !== 'shaker') throw new Error('the reference drawer front is a shaker');
    for (const h of handleHoles(front)) expect(front.size.height - h.center.y).toBeCloseTo(drawer.front.style.frameWidth.mm / 2);

    const plain = withHandles(createBaseCabinetProject('frameless'));
    for (const d of designsOf(plain)) {
      d.handle!.inMargin = true;
      if (d.template === 'drawer') d.front.style = { kind: 'slab' };
      else d.style = { kind: 'slab' };
    }
    expect(frontBorder({ kind: 'slab' })).toBeUndefined();
    const slab = fronts(plain).find((p) => /front/i.test(p.name))!;
    for (const h of handleHoles(slab)) expect(h.center.y).toBeCloseTo(slab.size.height / 2);
  });
});
