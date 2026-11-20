// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  HINGE_MOTION,
  type HingeMount,
  type P2,
  buildCabinetAssembly,
  buildProjectAssembly,
  deriveCabinetParts,
  deriveParts,
  doorPose,
  hingeFamily,
  hingeLinkage,
  hingeShapes,
  partBox,
} from '@/design';
import { BLUM_INSET_HINGE_ID, GENERIC_FRAMELESS_HINGE_ID, GENERIC_HINGE_ID, GENERIC_INSET_HINGE_ID, createStarterShop } from '@/libraries';
import type { Hinge } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';

/**
 * The hinge in the 3D view: a cup hinge as a four-bar linkage, worked out for each
 * hinge of the library from where its door is closed and how far it opens.
 */
const shop = createStarterShop();
const hinge = (id: string) => shop.hardware.find((h): h is Hinge => h.kind === 'hinge' && h.id === id)!;
const T = 19;
/** A typical mount for each family: an overlay door a 2 mm bumper gap off the case, an inset door its gap inside the opening. */
const mountFor = (h: Hinge): HingeMount => {
  const family = hingeFamily(h);
  return { family, closed: family === 'inset' ? [-h.overlay.mm, -T] : [-h.overlay.mm, 2], doorThickness: T, mountThickness: family === 'frame' ? 19 : 18.26 };
};
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** The door's four corners near its hinge and points along its faces, at a pose. */
function doorPoints(corner: P2, deg: number): P2[] {
  const a = (deg * Math.PI) / 180;
  const at = (u: number, v: number): P2 => [corner[0] + u * Math.cos(a) - v * Math.sin(a), corner[1] + u * Math.sin(a) + v * Math.cos(a)];
  return [0, 5, 10, 20, 40, 80].flatMap((u) => [0, T / 2, T].map((v) => at(u, v)));
}

describe('a hinge\'s family', () => {
  it('is what it mounts on: the edge of a face frame, or a plate on the case side with the door over the case or inside it', () => {
    expect([GENERIC_HINGE_ID, GENERIC_FRAMELESS_HINGE_ID, GENERIC_INSET_HINGE_ID, BLUM_INSET_HINGE_ID].map((id) => hingeFamily(hinge(id)))).toEqual(['frame', 'overlay', 'inset', 'inset']);
  });
});

describe.each([GENERIC_HINGE_ID, 'blum-compact-38n-1-2-soft-screw', GENERIC_FRAMELESS_HINGE_ID, GENERIC_INSET_HINGE_ID, BLUM_INSET_HINGE_ID])('the linkage of %s', (id) => {
  const h = hinge(id);
  const mount = mountFor(h);
  const linkage = hingeLinkage(h, mount)!;

  it('carries the door from closed to its opening angle', () => {
    expect(linkage).toBeDefined();
    expect(linkage.openDeg).toBe(h.openingAngleDeg ?? HINGE_MOTION.openDeg);
    expect(linkage.corners).toHaveLength(linkage.openDeg + 1);
    expect(linkage.corners[0]).toEqual(mount.closed);
    expect(doorPose(linkage, 0).corner).toEqual(mount.closed);
    // Past fully open is fully open; between two degrees it is between them.
    expect(doorPose(linkage, 400)).toEqual(doorPose(linkage, linkage.openDeg));
    const [a, b, mid] = [doorPose(linkage, 30).corner, doorPose(linkage, 31).corner, doorPose(linkage, 30.5).corner];
    expect(mid[0]).toBeCloseTo((a[0] + b[0]) / 2, 9);
    expect(mid[1]).toBeCloseTo((a[1] + b[1]) / 2, 9);
  });

  it('is a real linkage: two links of fixed length, all four pivots in the cup with the door closed', () => {
    for (let deg = 0; deg <= linkage.openDeg; deg += 5) {
      const pose = doorPose(linkage, deg);
      for (const i of [0, 1] as const) expect(dist(pose.pivots[i], linkage.fixedPivots[i]), `link ${i + 1} at ${deg}`).toBeCloseTo(linkage.linkLengths[i], 6);
    }
    const centre = h.cup.boreDistance + h.cup.diameter / 2;
    const inCup = ([u, v]: P2) => Math.abs(u - centre) <= h.cup.diameter / 2 && v >= 0 && v <= h.cup.depth;
    expect(linkage.doorPivots.every(inCup)).toBe(true);
    // The fixed pivots, seen from the closed door: its corner is the origin, its width along X.
    expect(linkage.fixedPivots.map((q): P2 => [q[0] - mount.closed[0], q[1] - mount.closed[1]]).every(inCup)).toBe(true);
    expect(linkage.linkLengths.every((l) => l >= 8 && l <= 30)).toBe(true);
  });

  it('moves the door evenly and never into the case', () => {
    for (let deg = 0; deg <= linkage.openDeg; deg++) {
      // The case side (or the stile) is what lies behind the front, on the hinge's side of X = 0.
      for (const p of doorPoints(linkage.corners[deg]!, deg)) expect(p[0] < -0.2 && p[1] < 0, `at ${deg}: ${p}`).toBe(false);
      if (deg > 0) expect(dist(linkage.corners[deg]!, linkage.corners[deg - 1]!)).toBeLessThan(1.5);
    }
  });

  it('ends where such a door ends', () => {
    const open = linkage.openDeg;
    const points = doorPoints(linkage.corners[open]!, open);
    const front: P2 = points[2]!;
    if (mount.family === 'inset') {
      // An inset door opens within its opening: its hinged edge still clear of the side, its back face about its thickness in.
      expect(Math.min(...points.map((p) => p[0]))).toBeGreaterThan(-25);
      expect(linkage.corners[open]![0]).toBeGreaterThan(T - 3);
      expect(linkage.corners[open]![0]).toBeLessThan(T + 12);
    } else {
      // An overlay door stands in front of the case, its front edge close to the line of its closed edge.
      expect(front[1]).toBeGreaterThanOrEqual(HINGE_MOTION.clear - 1e-6);
      expect(Math.abs(front[0] - (mount.closed[0] - HINGE_MOTION.edgeOut))).toBeLessThan(6);
    }
  });
});

describe('customizing a hinge', () => {
  const overlay = hinge(GENERIC_FRAMELESS_HINGE_ID);
  const mount = mountFor(overlay);

  it('follows the overlay or gap of the design, and the door\'s thickness', () => {
    const more = hingeLinkage(overlay, { ...mount, closed: [-19, 2] })!;
    expect(more.corners[0]).toEqual([-19, 2]);
    expect(more.corners.at(-1)![0]).toBeLessThan(hingeLinkage(overlay, mount)!.corners.at(-1)![0]);
    const thin = hingeLinkage(overlay, { ...mount, doorThickness: 16 })!;
    expect(thin).toBeDefined();
    expect(thin.doorPivots.every(([, v]) => v <= 14)).toBe(true);
  });

  it('opens as far as the hinge says, and where its `motion` says', () => {
    expect(hingeLinkage({ ...overlay, openingAngleDeg: 95 }, mount)!.openDeg).toBe(95);
    const front = (h: Hinge) => {
      const l = hingeLinkage(h, mount)!;
      return doorPoints(l.corners.at(-1)!, l.openDeg)[2]!;
    };
    const far = front({ ...overlay, motion: { clear: 8 } });
    expect(far[1]).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(far[1]).toBeGreaterThan(front(overlay)[1]);
  });

  it('uses the real pivots when the library has them', () => {
    const worked = hingeLinkage(overlay, mount)!;
    const given = hingeLinkage({ ...overlay, linkage: { doorPivots: worked.doorPivots, fixedPivots: worked.fixedPivots } }, mount)!;
    expect(given.fixedPivots).toEqual(worked.fixedPivots);
    given.corners.forEach((c, i) => expect(dist(c, worked.corners[i]!)).toBeLessThan(1e-6));
    // Pivots that cannot carry the door: no linkage, and the view falls back to a plain pivot.
    expect(hingeLinkage({ ...overlay, linkage: { doorPivots: [[5, 5], [20, 5]], fixedPivots: [[200, 0], [300, 0]] } }, mount)).toBeUndefined();
  });
});

describe('what a hinge looks like', () => {
  it('a clip hinge: a plate on the case side at its setback, an arm to the head, a cup and its flange on the door, two links', () => {
    const h = hinge(GENERIC_FRAMELESS_HINGE_ID);
    const mount = mountFor(h);
    const linkage = hingeLinkage(h, mount)!;
    const shapes = hingeShapes(h, mount, linkage);
    expect(shapes.cup).toEqual({ centre: h.cup.boreDistance + h.cup.diameter / 2, diameter: h.cup.diameter, depth: h.cup.depth });
    expect(shapes.flange.from).toBeLessThan(shapes.cup.centre - h.cup.diameter / 2);
    expect(shapes.flange.to).toBeGreaterThan(shapes.cup.centre + h.cup.diameter / 2);
    const plate = shapes.fixed.find((b) => b.what === 'plate')!;
    // Centred on the line of its two holes, behind the case front, flat on the side.
    expect((plate.from[1] + plate.to[1]) / 2).toBeCloseTo(-h.plate!.setback, 6);
    expect(plate.height).toBe(h.plate!.spacing + 16);
    expect([plate.from[0], plate.to[0]].every((x) => x > 0 && x < 3)).toBe(true);
    expect(shapes.fixed.filter((b) => b.what === 'arm').length).toBeGreaterThanOrEqual(1);
    expect(shapes.fixed.filter((b) => b.what === 'pin')).toHaveLength(2);
    expect(shapes.links.map((l) => l.fixed)).toEqual(linkage.fixedPivots);
    // The arm ends at the head, between the two fixed pivots.
    const head = shapes.fixed.find((b) => b.what === 'head')!;
    expect([head.from, head.to]).toEqual(linkage.fixedPivots);
  });

  it('an inset hinge\'s plate is set back from the back of the closed door; a frame hinge has a bracket on the stile\'s edge', () => {
    const inset = hinge(BLUM_INSET_HINGE_ID);
    const mount = mountFor(inset);
    const plate = hingeShapes(inset, mount, hingeLinkage(inset, mount)!).fixed.find((b) => b.what === 'plate')!;
    expect((plate.from[1] + plate.to[1]) / 2).toBeCloseTo(-T - inset.plate!.setback, 6);
    const frame = hinge(GENERIC_HINGE_ID);
    const onFrame = mountFor(frame);
    const shapes = hingeShapes(frame, onFrame, hingeLinkage(frame, onFrame)!);
    expect(shapes.fixed.some((b) => b.what === 'plate')).toBe(false);
    const bracket = shapes.fixed.find((b) => b.what === 'bracket')!;
    expect([bracket.from[1], bracket.to[1]]).toEqual([-19, 0]);
  });
});

describe('the hinges of a cabinet\'s doors', () => {
  it.each([
    ['frameless', () => createBaseCabinetProject('frameless'), 'overlay', GENERIC_FRAMELESS_HINGE_ID],
    ['face frame', () => createBaseCabinetProject('faceFrame'), 'frame', 'blum-compact-38n-1-2-soft-screw'],
    ['shop', () => createShopCabinetProject(), 'inset', BLUM_INSET_HINGE_ID],
  ] as const)('a %s cabinet: each door on its hinges, at its cups, on the side or the stile beside it', (_name, make, family, hingeId) => {
    const project = make();
    const parts = [...deriveCabinetParts(project, shop), ...deriveParts(project, shop)];
    const assembly = buildCabinetAssembly(parts, shop.hardware);
    const doors = assembly.parts.filter((p) => p.hinges);
    expect(doors.map((p) => p.partId)).toEqual(['doors-1/door-left', 'doors-1/door-right']);
    for (const placed of doors) {
      const part = parts.find((p) => p.id === placed.partId)!;
      const h = placed.hinges!;
      const left = placed.partId.endsWith('left');
      expect([h.dir, h.mount.family]).toEqual([left ? 1 : -1, family]);
      // One hinge at each cup, at its height.
      const cups = part.features.flatMap((f) => (f.kind === 'cup' ? [f] : []));
      expect(cups.every((c) => c.hardwareId === hingeId)).toBe(true);
      expect(h.heights).toEqual(cups.map((c) => part.placement!.origin[1] + c.center.y));
      // The hinge's plane starts at the inner face of what it is fixed to, at its front.
      const on = partBox(parts.find((p) => p.id === (family === 'frame' ? `cabinet-1/frame-stile-${left ? 'left' : 'right'}` : `cabinet-1/side-${left ? 'left' : 'right'}`))!);
      expect(h.origin).toEqual({ x: left ? on.max[0] : on.min[0], z: on.max[2] });
      // Closed, the door is where the design put it: lapping the side or the stile, or its gap inside the opening.
      const box = partBox(part);
      const edge = left ? box.min[0] : box.max[0];
      expect(h.mount.closed[0]).toBeCloseTo(h.dir * (edge - h.origin.x), 6);
      expect(h.mount.closed[1]).toBeCloseTo(box.min[2] - h.origin.z, 6);
      expect(h.mount.closed[0] < 0).toBe(family !== 'inset');
      expect(h.explode).toEqual(family === 'frame' ? [0, 0, 1] : [-h.dir, 0, 0]);
      // The plain pivot is still there, for a view without the hardware.
      expect(placed.swing).toBeDefined();
    }
    // Without the hardware library there are no hinges, and nothing else changes.
    const plain = buildCabinetAssembly(parts);
    expect(plain.parts.some((p) => p.hinges)).toBe(false);
    expect(assembly.parts.map(({ hinges: _hinges, ...rest }) => rest)).toEqual(plain.parts);
  });

  it('move with their cabinet in the picture of the whole project', () => {
    const project = createShopCabinetProject();
    const parts = [...deriveCabinetParts(project, shop), ...deriveParts(project, shop)];
    const alone = buildCabinetAssembly(parts, shop.hardware).parts.find((p) => p.hinges)!.hinges!;
    const moved = buildProjectAssembly([{ id: 'cabinet-1', at: [1000, 1300, 0], parts }], shop.hardware).parts.find((p) => p.hinges)!.hinges!;
    expect(moved.origin.x).toBe(alone.origin.x + 1000);
    expect(moved.origin.z).toBeCloseTo(alone.origin.z, 9);
    expect(moved.heights).toEqual(alone.heights.map((y) => y + 1300));
    expect(moved.linkage).toBe(alone.linkage);
  });
});

describe('a hinge\'s screws', () => {
  const shapesOf = (h: Hinge) => {
    const mount = mountFor(h);
    return hingeShapes(h, mount, hingeLinkage(h, mount)!);
  };

  it('a screw-on hinge has two through its flange into the door, beside the cup, under the flange', () => {
    const h = hinge(BLUM_INSET_HINGE_ID);
    const shapes = shapesOf(h);
    expect(h.attachment).toBe('screwOn');
    expect(shapes.screws.door).toHaveLength(2);
    const [low, high] = shapes.screws.door;
    expect([low!.up, high!.up]).toEqual([-22.5, 22.5]);
    for (const screw of shapes.screws.door) {
      // Past the cup toward the middle of the door, and on the flange.
      expect(screw.along).toBeGreaterThan(shapes.cup.centre);
      expect(screw.along + shapes.screws.head / 2).toBeLessThanOrEqual(shapes.flange.to);
      expect(Math.abs(screw.up) + shapes.screws.head / 2).toBeLessThanOrEqual(shapes.flange.height / 2);
    }
    // A hinge that does not say how it is fixed is drawn screwed on.
    expect(hinge(GENERIC_FRAMELESS_HINGE_ID).attachment).toBeNull();
    expect(shapesOf(hinge(GENERIC_FRAMELESS_HINGE_ID)).screws.door).toHaveLength(2);
  });

  it('a press-in hinge has none in the door: its dowels hold it', () => {
    const h = hinge('blum-compact-38n-1-2-soft-press');
    expect(h.attachment).toBe('pressIn');
    expect(shapesOf(h).screws.door).toEqual([]);
    // Screwed on, the same hinge has its screws where the dowels were.
    const screwed = shapesOf({ ...h, attachment: 'screwOn' });
    expect(screwed.screws.door.map((s) => [s.along - screwed.cup.centre, s.up])).toEqual([
      [h.dowels!.setback, -h.dowels!.spacing / 2],
      [h.dowels!.setback, h.dowels!.spacing / 2],
    ]);
  });

  it('a mounting plate has two, in the holes the CNC drills in the case side; a frame hinge two into the stile\'s edge', () => {
    const clip = hinge(GENERIC_FRAMELESS_HINGE_ID);
    const onPlate = shapesOf(clip).screws.fixed;
    expect(onPlate.map((s) => [s.at[1], s.up])).toEqual([
      [-clip.plate!.setback, -clip.plate!.spacing / 2],
      [-clip.plate!.setback, clip.plate!.spacing / 2],
    ]);
    // On the plate's face, off the side.
    expect(onPlate.every((s) => s.at[0] > 0 && s.at[0] < 4)).toBe(true);
    const frame = shapesOf(hinge(GENERIC_HINGE_ID)).screws.fixed;
    expect(frame).toHaveLength(2);
    // Half-way through the frame's thickness, one above and one below the centre.
    expect(frame.map((s) => [s.at[1], Math.sign(s.up)])).toEqual([
      [-9.5, -1],
      [-9.5, 1],
    ]);
  });
});
