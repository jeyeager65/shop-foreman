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
  holdDownSide,
} from '@/jigs/holdDown';
import { createStarterShopProfile } from '@/libraries';

const area = (loop: [number, number][]) => loop.reduce((n, [x, z], i) => n + (x * loop[(i + 1) % loop.length]![1] - loop[(i + 1) % loop.length]![0] * z) / 2, 0);

/** A printed hold-down clamp for one thickness of stock, screwed to the spoilboard. */
describe('a hold-down clamp', () => {
  const h = HOLD_DOWN;

  it('sits flat on the spoilboard, a wall at its front with a lip a little lower than the thinnest stock of its thickness', () => {
    const clamp = holdDownFor('3/4', 0);
    const { under, top, aboveStock } = holdDownHeights(clamp);
    expect(under).toBeCloseTo(17.8 - h.bite, 6);
    expect(top - under).toBeCloseTo(h.lip, 6);
    expect(aboveStock).toBeCloseTo(h.lip - h.bite, 6);
    const profile = holdDownProfile(clamp);
    expect(area(profile)).toBeGreaterThan(0);
    // Its floor is on the spoilboard from the stock's edge to its back end, and nothing but the lip is over the stock.
    const onBoard = profile.filter(([, z]) => z === 0).map(([x]) => x);
    expect([Math.min(...onBoard), Math.max(...onBoard)]).toEqual([h.lap, h.lap + h.length]);
    expect(profile.filter(([x]) => x < h.lap).every(([, z]) => z >= under)).toBe(true);
    // Flat in the middle: behind the wall it is only the floor.
    expect(profile).toContainEqual([h.lap + h.wall, h.floor]);
    expect(profile).toContainEqual([h.lap + h.length, h.floor]);
  });

  it('has a triangular side each side, from the top of the wall down to the back of the floor', () => {
    const clamp = holdDownFor('3/4', 0);
    const { top } = holdDownHeights(clamp);
    const side = holdDownSide(clamp);
    expect(area(side)).toBeGreaterThan(area(holdDownProfile(clamp)));
    // The slope: one straight line from the wall's top to the floor's back end.
    const i = side.findIndex(([x, z]) => x === h.lap + h.length && z === h.floor);
    expect(side[i + 1]).toEqual([h.lap + h.wall, top]);
    // The hollow between the sides takes the screw's head, all along the slot.
    expect(h.width - 2 * h.side).toBeGreaterThanOrEqual(h.head + 4);
    expect(h.slot.from - h.head / 2).toBeGreaterThan(h.wall);
    expect(h.slot.to + h.head / 2).toBeLessThan(h.length);
  });

  it('has its stock engraved in the top of its lip', () => {
    expect(holdDownLabel(holdDownFor('3/4', 0))).toBe('3/4"');
    expect(holdDownLabel(holdDownFor('other', 22))).toBe('22mm');
    for (const clamp of [holdDownFor('3/4', 0), holdDownFor('other', 22.5)]) {
      const lines = holdDownLabelLines(clamp);
      expect(lines.length).toBeGreaterThan(3);
      for (const p of lines.flat()) {
        expect(p.x).toBeGreaterThan(1);
        expect(p.x).toBeLessThan(h.lap + h.wall - 1);
        expect(Math.abs(p.y)).toBeLessThan(h.width / 2 - 1);
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
      expect(max[0]).toBeCloseTo(h.lap + h.length, 3);
      expect(max[1]).toBeCloseTo(holdDownHeights(clamp).top, 3);
      expect(max[2]).toBeCloseTo(h.width, 3);
      // The middle and the two sides, less the slot and the label.
      const whole = h.width * area(holdDownProfile(clamp)) + 2 * h.side * (area(holdDownSide(clamp)) - area(holdDownProfile(clamp)));
      expect(mesh.volume).toBeLessThan(whole - (h.slot.to - h.slot.from) * clamp.hole * h.floor);
      expect(mesh.volume).toBeGreaterThan(whole * 0.9);
    }
    const clamp = holdDownFor('3/4', 0);
    const mesh = await buildHoldDown(clamp);
    // Not a block: well under its sides' outline pushed out to its width.
    expect(mesh.volume).toBeLessThan(0.6 * h.width * area(holdDownSide(clamp)));
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
    expect(notes).toMatch(/3\/4" is engraved in the top of its lip/);
    expect(notes).toMatch(/4 walls/);
    expect(item.problems({ ...item.defaults, stock: 'other', thickness: 2 })).toHaveLength(1);
  });
});
