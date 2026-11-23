// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { jigItems } from '@/jigs/catalog';
import {
  HOLD_DOWN,
  HOLD_DOWN_PRINT,
  HOLD_DOWN_STOCK,
  buildHoldDown,
  holdDownFloorAt,
  holdDownFor,
  holdDownHeights,
  holdDownLabel,
  holdDownLabelLines,
  holdDownProblems,
  holdDownProfile,
  holdDownRib,
  holdDownRibAt,
  holdDownScrew,
  holdDownSlot,
} from '@/jigs/holdDown';
import { createStarterShopProfile } from '@/libraries';

const area = (loop: [number, number][]) => loop.reduce((n, [x, z], i) => n + (x * loop[(i + 1) % loop.length]![1] - loop[(i + 1) % loop.length]![0] * z) / 2, 0);

/** A printed hold-down clamp for one thickness of stock, screwed to the spoilboard. */
describe('a hold-down clamp', () => {
  it('is a flat strap, its nose a little lower than the thinnest stock sold as its thickness, on a heel at its back', () => {
    const clamp = holdDownFor('3/4', 0);
    const { under, strapTop } = holdDownHeights(clamp);
    expect(under).toBeCloseTo(17.8 - HOLD_DOWN.bite, 6);
    expect(strapTop - under).toBeCloseTo(HOLD_DOWN.strap, 6);
    const profile = holdDownProfile(clamp);
    expect(area(profile)).toBeGreaterThan(0);
    // On the spoilboard only at the heel; from the nose back to the heel nothing is lower than the nose's underside.
    expect(Math.min(...profile.filter(([, z]) => z === 0).map(([x]) => x))).toBeGreaterThan(HOLD_DOWN.length - HOLD_DOWN.heel);
    expect(profile.filter(([x]) => x <= HOLD_DOWN.length - HOLD_DOWN.heel).every(([, z]) => z >= under)).toBe(true);
    // Far from a block: the strap and its heel are under half of the box round them.
    expect(area(profile)).toBeLessThan(0.5 * HOLD_DOWN.length * strapTop);
  });

  it('has a rib up each side: a triangle from nothing at the tip to its peak beside the slot, leaning in to leave a flat floor', () => {
    const clamp = holdDownFor('3/4', 0);
    expect(holdDownRibAt(0)).toBe(0);
    expect(holdDownRibAt(HOLD_DOWN.rib.peak)).toBe(HOLD_DOWN.rib.height);
    expect(holdDownRibAt(HOLD_DOWN.length)).toBeCloseTo(HOLD_DOWN.rib.back, 6);
    expect(holdDownRib(clamp)).toHaveLength(4);
    expect(area(holdDownRib(clamp))).toBeGreaterThan(0);
    // The peak is beside the slot, and the floor between the ribs takes the screw's head all along the slot.
    const [from, to] = holdDownSlot();
    expect(HOLD_DOWN.rib.peak).toBeGreaterThanOrEqual(from);
    expect(HOLD_DOWN.rib.peak).toBeLessThanOrEqual(to);
    for (const x of [from, HOLD_DOWN.rib.peak, to]) expect(holdDownFloorAt(x)).toBeGreaterThanOrEqual(HOLD_DOWN.head + 2);
    expect(to - from).toBe(HOLD_DOWN.slot);
    expect(to + HOLD_DOWN.head / 2).toBeLessThan(HOLD_DOWN.length - HOLD_DOWN.heel);
  });

  it('has its stock engraved in the strap, behind the slot and between the ribs', () => {
    expect(holdDownLabel(holdDownFor('3/4', 0))).toBe('3/4"');
    expect(holdDownLabel(holdDownFor('other', 22))).toBe('22mm');
    for (const clamp of [holdDownFor('3/4', 0), holdDownFor('other', 22.5)]) {
      const lines = holdDownLabelLines(clamp);
      expect(lines.length).toBeGreaterThan(3);
      for (const p of lines.flat()) {
        expect(p.x).toBeGreaterThan(holdDownSlot()[1] + HOLD_DOWN.head / 2);
        expect(p.x).toBeLessThan(HOLD_DOWN.length - 1);
        expect(Math.abs(p.y)).toBeLessThan(holdDownFloorAt(p.x) / 2 - 1);
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

  it('names a screw that reaches into the spoilboard', () => {
    const screw = holdDownScrew(holdDownFor('3/4', 0));
    expect(screw.inches).toBe(1.25);
    expect(screw.into).toBeGreaterThanOrEqual(HOLD_DOWN.intoSpoilboard);
    expect(holdDownScrew(holdDownFor('1/4', 0)).inches).toBe(0.75);
  });

  it('is a closed solid lying on its side, much lighter than a block', async () => {
    const clamp = holdDownFor('3/4', 0);
    const mesh = await buildHoldDown(clamp);
    const p = mesh.positions;
    const max = [0, 1, 2].map((k) => Math.max(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + k]!)));
    const min = [0, 1, 2].map((k) => Math.min(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + k]!)));
    expect(min.map((v) => Math.abs(+v.toFixed(3)))).toEqual([0, 0, 0]);
    expect(max[0]).toBeCloseTo(HOLD_DOWN.length, 3);
    expect(max[1]).toBeCloseTo(holdDownHeights(clamp).top, 3);
    expect(max[2]).toBeCloseTo(HOLD_DOWN.width, 3);
    // The strap and heel less the slot and the label, plus the two ribs; under 40% of the box round it.
    const strap = HOLD_DOWN.width * area(holdDownProfile(clamp));
    expect(mesh.volume).toBeGreaterThan(strap);
    expect(mesh.volume).toBeLessThan(strap + 2 * area(holdDownRib(clamp)) * (HOLD_DOWN.rib.top + HOLD_DOWN.rib.height));
    expect(mesh.volume).toBeLessThan(0.4 * max[0]! * max[1]! * max[2]!);
    // Without its label it would be heavier by the engraving.
    const plain = await buildHoldDown({ ...clamp, name: 'x' });
    expect(plain.volume).toBeGreaterThan(mesh.volume + 1);
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
    expect(notes).toMatch(/1-1\/4" \(31\.8 mm\)/);
    expect(notes).toMatch(/3\/4" is engraved in its top/);
    expect(notes).toMatch(/4 walls/);
    expect(item.problems({ ...item.defaults, stock: 'other', thickness: 2 })).toHaveLength(1);
  });
});
