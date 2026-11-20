// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GRAIN_STREAKS, MAX_DOOR_OPEN_DEG, ROW_GAP, buildCabinetAssembly, buildProjectAssembly, cabinetIdOf, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, grainStreaks, insetSwingShift, partBox, rowOfCabinets } from '@/design';
import { buildPartMeshes } from '@/geometry/solids';
import { createStarterShop } from '@/libraries';
import type { Part } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject, createShopWallProject } from '@/samples/cabinet';

const shop = createStarterShop();
const parts = deriveCabinetParts(createBaseCabinetProject(), shop);
const part = (key: string) => parts.find((p) => p.id === `cabinet-1/${key}`)!;
const assembly = buildCabinetAssembly(parts);
const placed = (key: string) => assembly.parts.find((p) => p.partId === `cabinet-1/${key}`)!;

type Box = { min: number[]; max: number[] };
const overlap = (a: Box, b: Box) => [0, 1, 2].every((i) => a.min[i]! < b.max[i]! - 1e-6 && b.min[i]! < a.max[i]! - 1e-6);

describe('cabinet part solids', () => {
  it('builds every case part, the sides with their toe-kick notch', async () => {
    const meshes = await buildPartMeshes(parts);
    expect(meshes.map((m) => m.partId)).toEqual(parts.map((p) => p.id));
    const volume = (p: Part) => meshes.find((m) => m.partId === p.id)!.mesh.volume;

    // 3" x 4-1/2" off the corner of a 22-1/2" x 34-1/2" side, and the 3/8" deep rabbet for the back down its rear edge.
    const side = part('side-left');
    const rabbet = part('back').size.thickness * side.size.height * 9.525;
    // The holes for the hinge plates and the shelf pins come out of it too.
    const holes = side.features.reduce((sum, f) => sum + (f.kind === 'hole' ? Math.PI * (f.diameter / 2) ** 2 * f.depth : 0), 0);
    expect(holes).toBeGreaterThan(0);
    const notched = (side.size.width * side.size.height - 76.2 * 114.3) * side.size.thickness - rabbet - holes;
    // The holes are drawn with 96 flats, a hair smaller than round.
    expect(volume(side) / notched).toBeCloseTo(1, 5);
    expect(volume(part('side-right')) / notched).toBeCloseTo(1, 5);

    for (const p of parts.filter((q) => q.role !== 'side')) {
      const full = volume(p) / (p.size.width * p.size.height * p.size.thickness);
      // The bottom and the stretchers lose a little to the pocket holes that screw them to the sides.
      if (p.features.some((f) => f.kind === 'pocketHole')) {
        expect(full, p.id).toBeLessThan(1);
        expect(full, p.id).toBeGreaterThan(0.98);
      } else expect(full, p.id).toBeCloseTo(1, 6);
    }
  });

  it('lands each solid in its part box when placed', async () => {
    const meshes = await buildPartMeshes(parts);
    for (const { partId, mesh } of meshes) {
      const { axes, offset } = assembly.parts.find((p) => p.partId === partId)!;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < mesh.positions.length; v += 3) {
        for (let i = 0; i < 3; i++) {
          const w = offset[i]! + mesh.positions[v]! * axes[0][i]! + mesh.positions[v + 1]! * axes[1][i]! + mesh.positions[v + 2]! * axes[2][i]!;
          min[i] = Math.min(min[i]!, w);
          max[i] = Math.max(max[i]!, w);
        }
      }
      const box = partBox(parts.find((p) => p.id === partId)!);
      for (let i = 0; i < 3; i++) {
        expect(min[i]!, partId).toBeCloseTo(box.min[i]!, 3);
        expect(max[i]!, partId).toBeCloseTo(box.max[i]!, 3);
      }
    }
  });
});

describe('cabinet assembly', () => {
  it('is a right-handed placement, so no solid is turned inside out', () => {
    for (const { axes, partId } of assembly.parts) {
      const [x, y, n] = axes;
      const det = x[0] * (y[1] * n[2] - y[2] * n[1]) - x[1] * (y[0] * n[2] - y[2] * n[0]) + x[2] * (y[0] * n[1] - y[1] * n[0]);
      expect(det, partId).toBeCloseTo(1, 9);
    }
  });

  it('spans the outside of the case', () => {
    expect(assembly.min.map((v) => +v.toFixed(3))).toEqual([0, 0, -571.5]);
    expect(assembly.max.map((v) => +v.toFixed(3))).toEqual([609.6, 876.3, 0]);
    expect(assembly.explodeDistance).toBeCloseTo(0.25 * 876.3, 6);
  });

  it('pulls the parts apart: sides out, back to the rear, stretchers up, toe kick and shelf forward', () => {
    expect(placed('side-left').explode).toEqual([-1, 0, 0]);
    expect(placed('side-right').explode).toEqual([1, 0, 0]);
    expect(placed('back').explode).toEqual([0, 0, -1]);
    expect(placed('stretcher-front').explode).toEqual([0, 1, 0]);
    expect(placed('stretcher-back').explode).toEqual([0, 1, 0]);
    expect(placed('toe-kick').explode).toEqual([0, 0, 1]);
    expect(placed('shelf-1').explode).toEqual([0, 0, 1]);
    expect(placed('bottom').explode).toEqual([0, 0, 0]);
  });

  it('leaves no two parts touching when fully exploded', () => {
    const moved = parts.map((p) => {
      const box = partBox(p);
      const shift = assembly.parts.find((a) => a.partId === p.id)!.explode.map((d) => d * assembly.explodeDistance);
      // Grown by 1 mm, so parts that only touch count as overlapping.
      return { id: p.id, min: box.min.map((v, i) => v + shift[i]! - 1), max: box.max.map((v, i) => v + shift[i]! + 1) };
    });
    for (const a of moved) {
      for (const b of moved) {
        if (a.id < b.id) expect(overlap(a, b), `${a.id} and ${b.id}`).toBe(false);
      }
    }
  });

  it('has nothing to place without parts', () => {
    expect(buildCabinetAssembly([])).toMatchObject({ parts: [], explodeDistance: 0 });
  });
});

describe('doors that open and drawers that pull out', () => {
  const project = createBaseCabinetProject('faceFrame');
  const all = [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)];
  const built = buildCabinetAssembly(all);
  const at = (id: string) => built.parts.find((p) => p.partId === id)!;
  const box = (id: string) => partBox(all.find((p) => p.id === id)!);

  it('hinges each door of a pair on its outer edge, at its back face, and swings them apart', () => {
    const left = at('doors-1/door-left');
    const right = at('doors-1/door-right');
    expect(left.swing!.pivot[0]).toBeCloseTo(box('doors-1/door-left').min[0], 6);
    expect(left.swing!.pivot[2]).toBeCloseTo(box('doors-1/door-left').min[2], 6);
    expect(right.swing!.pivot[0]).toBeCloseTo(box('doors-1/door-right').max[0], 6);
    // About +Y, a negative turn takes the left door's free edge out toward the viewer.
    expect(left.swing!.sign).toBe(-1);
    expect(right.swing!.sign).toBe(1);
  });

  it('pulls the drawer front and its box out together, by the length of the box', () => {
    const side = box('drawer-1/box-side-left');
    const travel = side.max[2] - side.min[2];
    expect(travel).toBeCloseTo(22 * 25.4, 3);
    const moving = built.parts.filter((p) => p.slide);
    expect(moving.map((p) => p.partId).sort()).toEqual(
      all.filter((p) => p.designObjectId === 'drawer-1' && p.role !== 'buildOut').map((p) => p.id).sort(),
    );
    expect(moving).toHaveLength(6);
    for (const p of moving) expect(p.slide).toBeCloseTo(travel, 6);
    expect(at('drawer-1/front').swing).toBeUndefined();
  });

  it('leaves the case, the frame and the strips where they are', () => {
    for (const p of built.parts.filter((x) => x.role && !x.role.startsWith('box'))) {
      expect(p.swing, p.partId).toBeUndefined();
      expect(p.slide, p.partId).toBeUndefined();
    }
  });
});

describe('inset doors that open', () => {
  const project = createShopCabinetProject();
  const all = [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)];
  const built = buildCabinetAssembly(all);
  const door = (key: string) => ({ placed: built.parts.find((p) => p.partId === `doors-1/${key}`)!, part: all.find((p) => p.id === `doors-1/${key}`)! });
  const sideBox = (key: string) => partBox(all.find((p) => p.id === `cabinet-1/${key}`)!);

  it('turn about the hinged edge of their front face and know the gap to the side', () => {
    const { placed: left, part } = door('door-left');
    expect(left.swing!.pivot[2]).toBeCloseTo(0, 6);
    expect(left.swing!.pivot[0]).toBeCloseTo(partBox(part).min[0], 6);
    expect(left.swing!.clear).toEqual({ thickness: part.size.thickness, gap: expect.closeTo(3.175, 3), toward: 1 });
    expect(door('door-right').placed.swing!.clear!.toward).toBe(-1);
    // Doors that overlay the case keep the plain pivot at their back face.
    const frameless = createBaseCabinetProject('frameless');
    const others = buildCabinetAssembly([...deriveCabinetParts(frameless, shop), ...deriveParts(frameless, shop)]);
    expect(others.parts.filter((p) => p.swing).every((p) => !p.swing!.clear)).toBe(true);
  });

  it('never pass through the case side as they open', () => {
    for (const key of ['door-left', 'door-right']) {
      const { placed, part } = door(key);
      const { pivot, sign, clear } = placed.swing!;
      const side = sideBox(key === 'door-left' ? 'side-left' : 'side-right');
      const box = partBox(part);
      for (let deg = 0; deg <= MAX_DOOR_OPEN_DEG; deg += 5) {
        const a = (deg * Math.PI) / 180;
        const shift = clear!.toward * insetSwingShift(clear!, a);
        // The door's four corners seen from above, turned about the pivot and moved across.
        for (const x of [box.min[0], box.max[0]]) {
          for (const z of [box.min[2], box.max[2]]) {
            const dx = x - pivot[0];
            const dz = z - pivot[2];
            const c = Math.cos(sign * a);
            const s = Math.sin(sign * a);
            const at = { x: pivot[0] + dx * c + dz * s + shift, z: pivot[2] - dx * s + dz * c };
            const inSide = at.x > side.min[0] + 0.01 && at.x < side.max[0] - 0.01 && at.z < side.max[2] - 0.01;
            expect(inSide, `${key} at ${deg} degrees`).toBe(false);
          }
        }
      }
    }
  });
});

describe('several cabinets in one view', () => {
  const wall = createShopWallProject();
  const cabinetOf = cabinetIdOf(wall);
  const all = [...deriveCabinetParts(wall, shop), ...deriveDrawerBoxParts(wall, shop), ...deriveParts(wall, shop)];
  const cabinets = cabinetsOf(wall);
  const at = rowOfCabinets(cabinets.map((c) => ({ id: c.id, width: c.size.width.mm })));
  const groups = cabinets.map((c) => ({ id: c.id, at: at.get(c.id)!, parts: all.filter((p) => cabinetOf(p.id) === c.id) }));
  const assembly = buildProjectAssembly(groups);

  it('stand in a row in list order, a gap apart', () => {
    expect([...at.values()]).toEqual([
      [0, 0, 0],
      [24 * 25.4 + ROW_GAP, 0, 0],
      [54 * 25.4 + 2 * ROW_GAP, 0, 0],
    ]);
    expect(assembly.parts).toHaveLength(all.length);
    expect(assembly.min[0]).toBeCloseTo(0, 6);
    expect(assembly.max[0]).toBeCloseTo(78 * 25.4 + 2 * ROW_GAP, 6);
    expect(assembly.max[1]).toBeCloseTo(30 * 25.4, 6);
  });

  it('each is put together as on its own, then set down where it stands', () => {
    for (const group of groups) {
      const alone = buildCabinetAssembly(group.parts);
      const mine = assembly.parts.filter((p) => p.cabinetId === group.id);
      expect(mine.map((p) => p.partId)).toEqual(alone.parts.map((p) => p.partId));
      mine.forEach((p, i) => {
        expect(p.offset[0]).toBeCloseTo(alone.parts[i]!.offset[0] + group.at[0], 6);
        // Its sides still pull off to its own left and right, not the row's.
        expect(p.explode).toEqual(alone.parts[i]!.explode);
        if (p.swing) expect(p.swing.pivot[0]).toBeCloseTo(alone.parts[i]!.swing!.pivot[0] + group.at[0], 6);
      });
    }
    // The middle cabinet's left side pulls left though it stands right of the row's first cabinet.
    expect(assembly.parts.find((p) => p.partId === 'cabinet-2/side-left')!.explode).toEqual([-1, 0, 0]);
    // The row comes apart by a cabinet's size, not the row's length.
    expect(assembly.explodeDistance).toBe(Math.max(...groups.map((g) => buildCabinetAssembly(g.parts).explodeDistance)));
    expect(buildProjectAssembly([]).parts).toEqual([]);
  });
});

describe('the streaks that show a part\'s grain', () => {
  const framed = createBaseCabinetProject('faceFrame');
  const parts = [...deriveCabinetParts(framed, shop), ...deriveParts(framed, shop)];
  const part = (id: string) => parts.find((p) => p.id === id)!;

  it('run along the grain, inside the face: up a side, across a bottom', () => {
    const side = part('cabinet-1/side-left');
    const up = grainStreaks(side);
    expect(side.grain).toBe('height');
    expect(up.length).toBeGreaterThan(20);
    for (const [x0, y0, x1, y1] of up) {
      expect(x1).toBe(x0);
      expect(y1).toBeGreaterThan(y0);
      expect(x0).toBeGreaterThan(0);
      expect(x0).toBeLessThan(side.size.width);
      expect(y0).toBeGreaterThan(0);
      expect(y1).toBeLessThan(side.size.height);
    }
    const bottom = part('cabinet-1/bottom');
    const across = grainStreaks(bottom);
    expect(bottom.grain).toBe('width');
    expect(across.length).toBeGreaterThan(20);
    expect(across.every(([x0, y0, x1, y1]) => y1 === y0 && x1 > x0 && x0 > 0 && x1 < bottom.size.width)).toBe(true);
  });

  it('are uneven, as wood is, and the same every time', () => {
    const side = part('cabinet-1/side-left');
    const streaks = grainStreaks(side);
    // Not evenly spaced lines the length of the part: many lengths, many spacings.
    const lengths = new Set(streaks.map(([, y0, , y1]) => Math.round(y1 - y0)));
    expect(lengths.size).toBeGreaterThan(10);
    expect(Math.max(...streaks.map(([, y0, , y1]) => y1 - y0))).toBeLessThanOrEqual(GRAIN_STREAKS.long[1]!);
    const rows = [...new Set(streaks.map(([x]) => x))].sort((a, b) => a - b);
    const gaps = new Set(rows.slice(1).map((x, i) => Math.round(x - rows[i]!)));
    expect(gaps.size).toBeGreaterThan(4);
    expect(grainStreaks(side)).toEqual(streaks);
  });

  it('keep inside the outline: none in a side\'s toe kick notch', () => {
    const side = part('cabinet-1/side-left');
    const outline = side.features.find((f) => f.kind === 'cutout')!.outline;
    // The notch: the corner of the rectangle the outline leaves out.
    const xs = [...new Set(outline.map((p) => Math.round(p.x * 100) / 100))];
    const ys = [...new Set(outline.map((p) => Math.round(p.y * 100) / 100))];
    expect(xs.length).toBe(3);
    expect(ys.length).toBe(3);
    const corners = new Set(outline.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    const missing = [0, side.size.width].flatMap((x) => [0, side.size.height].map((y) => ({ x, y }))).filter((c) => !corners.has(`${Math.round(c.x)},${Math.round(c.y)}`));
    expect(missing).toHaveLength(1);
    const inner = outline.find((p) => p.x > 1 && p.x < side.size.width - 1 && p.y > 1 && p.y < side.size.height - 1)!;
    const [nx0, nx1] = [Math.min(inner.x, missing[0]!.x), Math.max(inner.x, missing[0]!.x)];
    const [ny0, ny1] = [Math.min(inner.y, missing[0]!.y), Math.max(inner.y, missing[0]!.y)];
    const streaks = grainStreaks(side);
    expect(streaks.some(([x]) => x > nx0 && x < nx1)).toBe(true);
    for (const [x, y0, , y1] of streaks) if (x > nx0 && x < nx1) expect(y1 <= ny0 || y0 >= ny1).toBe(true);
  });

  it('a part with no grain has none', () => {
    // MDF doors have no grain.
    const door = part('doors-1/door-left');
    expect(door.grain).toBeUndefined();
    expect(grainStreaks(door)).toEqual([]);
  });
});
