// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { jigItems } from '@/jigs/catalog';
import {
  HOLD_DOWN,
  HOLD_DOWN_PRINT,
  HOLD_DOWN_STOCK,
  buildHoldDown,
  holdDownFor,
  holdDownHeights,
  holdDownLabel,
  holdDownLabelLines,
  holdDownProblems,
  holdDownProfile,
  holdDownScrew,
  holdDownSeat,
  holdDownSide,
} from '@/jigs/holdDown';
import { createStarterShopProfile } from '@/libraries';

const area = (loop: [number, number][]) => loop.reduce((n, [x, z], i) => n + (x * loop[(i + 1) % loop.length]![1] - loop[(i + 1) % loop.length]![0] * z) / 2, 0);

/** A printed hold-down clamp for one thickness of stock, screwed to the spoilboard. */
describe('a hold-down clamp', () => {
  const h = HOLD_DOWN;
  const back = h.lap + h.length;

  it('stands on a heel under its back end, its lip a little lower than the thinnest stock of its thickness', () => {
    const clamp = holdDownFor('3/4', 0);
    const { under, floorTop, top } = holdDownHeights(clamp);
    expect(under).toBeCloseTo(17.8 - h.bite, 6);
    expect(floorTop).toBe(h.heel.height + h.floor);
    const profile = holdDownProfile(clamp);
    expect(area(profile)).toBeGreaterThan(0);
    // On the spoilboard only at the heel; the rest of the underside is clear of it, and only the lip is over the stock.
    const onBoard = profile.filter(([, z]) => z === 0).map(([x]) => x);
    expect([Math.min(...onBoard), Math.max(...onBoard)]).toEqual([back - h.heel.length, back]);
    expect(profile).toContainEqual([h.lap, h.heel.height]);
    expect(profile.filter(([x]) => x < h.lap).every(([, z]) => z >= under)).toBe(true);
    // The lip is a wedge: thin at its tip, thick at its root, its underside level.
    expect(profile).toContainEqual([0, under + h.lip.tip]);
    expect(profile).toContainEqual([h.lap, top]);
    expect(top - under).toBe(h.lip.root);
    expect(h.lip.root).toBeGreaterThanOrEqual(2 * h.lip.tip);
    // Flat in the middle: behind the wall it is only the floor.
    expect(profile).toContainEqual([h.lap + h.wall, floorTop]);
    expect(profile).toContainEqual([back, floorTop]);
  });

  it('has a triangular side each side, close in to the screw, the corners at the floor filled', () => {
    const clamp = holdDownFor('3/4', 0);
    const { floorTop, top } = holdDownHeights(clamp);
    const side = holdDownSide(clamp);
    expect(area(side)).toBeGreaterThan(area(holdDownProfile(clamp)));
    // The slope: one straight line from the floor's back end to the wall's top.
    const i = side.findIndex(([x, z]) => x === back && z === floorTop);
    expect(side[i + 1]).toEqual([h.lap + h.wall, top]);
    // The flat of the floor takes the screw's head and little more, all along the slot, which stops short of the heel.
    expect(holdDownSeat()).toBeGreaterThanOrEqual(h.head + 1);
    expect(holdDownSeat()).toBeLessThanOrEqual(h.head + 3);
    expect(h.slot.from - h.head / 2).toBeGreaterThan(h.wall);
    expect(h.slot.to + h.head / 2).toBeLessThan(h.length - h.heel.length);
    // Thick where the screw pulls: the floor at least as thick as the sides, the sides thicker than a wall of plain perimeters.
    expect(h.floor).toBeGreaterThanOrEqual(h.side);
    expect(h.side).toBeGreaterThanOrEqual(4);
  });

  it('has its stock engraved in a side, under the slope', () => {
    expect(holdDownLabel(holdDownFor('3/4', 0))).toBe('3/4"');
    expect(holdDownLabel(holdDownFor('other', 22))).toBe('22mm');
    for (const clamp of [holdDownFor('3/4', 0), holdDownFor('1/2', 0), holdDownFor('1/4', 0), holdDownFor('other', 22.5)]) {
      const { floorTop, top } = holdDownHeights(clamp);
      const lines = holdDownLabelLines(clamp);
      expect(lines.length).toBeGreaterThan(3);
      for (const p of lines.flat()) {
        expect(p.x).toBeGreaterThan(h.lap + 1);
        expect(p.x).toBeLessThan(back - h.heel.length);
        expect(p.z).toBeGreaterThan(h.heel.height + 1);
        const slope = top - ((top - floorTop) * Math.max(0, p.x - h.lap - h.wall)) / (h.length - h.wall);
        expect(p.z).toBeLessThan(slope - 1);
      }
    }
  });

  it('is made for every usual stock and for a typed thickness, but not for stock too thin or too thick', () => {
    for (const s of HOLD_DOWN_STOCK) expect(holdDownProblems(holdDownFor(s.id, 0))).toEqual([]);
    expect(holdDownFor('other', 22).thinnest).toBe(22);
    expect(holdDownFor('other', 22).name).toBe('22 mm');
    expect(holdDownProblems(holdDownFor('other', 3))).toHaveLength(1);
    expect(holdDownProblems(holdDownFor('other', 60))).toHaveLength(1);
    expect(holdDownProblems(holdDownFor('3/4', 0, 9))).toHaveLength(1);
  });

  it('takes a short screw, through the floor only', () => {
    const screw = holdDownScrew();
    expect(screw.inches).toBe(0.75);
    expect(screw.into).toBeGreaterThanOrEqual(h.intoSpoilboard);
  });

  it('is a closed solid lying on its side, hollow between its sides', async () => {
    for (const id of ['3/4', '1/4']) {
      const clamp = holdDownFor(id, 0);
      const mesh = await buildHoldDown(clamp);
      const p = mesh.positions;
      const max = [0, 1, 2].map((k) => Math.max(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + k]!)));
      const min = [0, 1, 2].map((k) => Math.min(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + k]!)));
      expect(min.map((v) => Math.abs(+v.toFixed(3)))).toEqual([0, 0, 0]);
      expect(max[0]).toBeCloseTo(back, 3);
      expect(max[1]).toBeCloseTo(holdDownHeights(clamp).top, 3);
      expect(max[2]).toBeCloseTo(h.width, 3);
      // The middle and the two sides, with the filled corners, less the slot and the label.
      const plain = h.width * area(holdDownProfile(clamp)) + 2 * h.side * (area(holdDownSide(clamp)) - area(holdDownProfile(clamp)));
      const fills = h.fill * h.fill * (h.length - h.wall);
      const slot = (h.slot.to - h.slot.from) * clamp.hole * h.floor;
      expect(mesh.volume).toBeLessThan(plain + fills - slot);
      expect(mesh.volume).toBeGreaterThan(plain - slot - 80);
    }
    const clamp = holdDownFor('3/4', 0);
    const mesh = await buildHoldDown(clamp);
    // Not a block: well under its sides' outline pushed out to its width.
    expect(mesh.volume).toBeLessThan(0.75 * h.width * area(holdDownSide(clamp)));
    // Without its label it would be heavier by the engraving.
    expect((await buildHoldDown({ ...clamp, name: 'x' })).volume).toBeGreaterThan(mesh.volume + 1);
  });

  it('is on the jigs page: one clamp, or one for each stock, each with its print settings', async () => {
    const item = jigItems(createStarterShopProfile()).find((i) => i.id === 'hold-down')!;
    expect(item.defaults.stock).toBe('3/4');
    const one = await item.build(item.defaults);
    expect(one).toHaveLength(1);
    expect(one[0]!.print).toEqual(HOLD_DOWN_PRINT);
    const each = { ...item.defaults, stock: 'all' };
    expect((await item.build(each)).map((o) => o.name)).toEqual(HOLD_DOWN_STOCK.map((s) => `Hold-down clamp, ${s.name}`));
    expect(item.fileNameFor!(item.defaults)).toBe('hold-down-clamp-3-4.3mf');
    expect(item.fileNameFor!(each)).toBe('hold-down-clamps.3mf');
    const notes = item.notes!(item.defaults).join(' ');
    expect(notes).toMatch(/3\/4" \(19 mm\) long/);
    expect(notes).toMatch(/3\/4" is engraved in one side/);
    expect(notes).toMatch(/4 walls/);
    expect(item.problems({ ...item.defaults, stock: 'other', thickness: 2 })).toHaveLength(1);
  });
});
