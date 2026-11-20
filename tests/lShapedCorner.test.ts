// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, lShapedFace, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createBaseCabinetProject, makeLShaped } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** Milestone 6: the L-shaped corner cabinet. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = lowRiderJobShop();
const lShaped = (side: 'left' | 'right' = 'left') => {
  const project = createBaseCabinetProject('frameless');
  makeLShaped(project, 'cabinet-1', side);
  return project;
};

describe('an L-shaped corner cabinet', () => {
  it('starts 36" along each wall with a 24" cut-out, doors only, a single door on each face', () => {
    const project = lShaped();
    const cabinet = cabinetsOf(project)[0]!;
    expect([L(cabinet.size.width.mm), L(cabinet.size.depth.mm), cabinet.adjustableShelves]).toEqual(['36"', '24"', 0]);
    expect(L(lShapedFace(cabinet))).toBe('12"');
    const openings = deriveCabinetOpenings(cabinet, shop.materials);
    expect(openings.map((o) => o.name)).toEqual(['Door opening', 'Door opening, other face']);
    expect(openings[1]!.frame).toEqual({ origin: [0, 0, lShapedFace(cabinet)], xAxis: [0, 0, -1] });
    const doors = buildJob(project, shop).parts;
    expect(doors).toHaveLength(2);
  });

  it("each face's door stands on its face: the second turned square to the first", () => {
    const project = lShaped();
    const [one, two] = buildJob(project, shop).parts;
    expect(one!.placement!.xAxis).toEqual([1, 0, 0]);
    expect(two!.placement!.xAxis).toEqual([0, 0, -1]);
    // The second face's door is in front of the plane x = 0 it closes against, the first in front of z = 0.
    expect(partBox(two!).min[0]).toBeGreaterThan(0);
    expect(partBox(one!).min[2]).toBeGreaterThan(0);
    // They do not run into each other at the corner.
    const a = partBox(one!);
    const b = partBox(two!);
    const lap = [0, 2].map((k) => Math.min(a.max[k]!, b.max[k]!) - Math.max(a.min[k]!, b.min[k]!));
    expect(lap.some((v) => v <= 0)).toBe(true);
  });

  it('has an L bottom and top on the CNC, two backs and two end sides, and no post at the corner for a susan to hit', () => {
    const project = lShaped('right');
    const parts = deriveCabinetParts(project, shop);
    expect(parts.map((p) => p.name)).toEqual(['Bottom', 'Top', 'Back along the run', 'Back along the other wall', 'End side', 'Other end side', 'Toe kick', 'Toe kick, other face', 'Sleeper, along the run', 'Sleeper, along the other wall', 'Sleeper, under the pole']);
    const bottom = parts[0]!;
    const cutout = bottom.features.find((f) => f.kind === 'cutout');
    expect(cutout?.kind === 'cutout' && cutout.outline).toHaveLength(6);
    // 36" square: wider than the LowRider 3 reaches, so on the saw: its angles, then the notch of the L.
    const job = buildJob(project, shop);
    const bottomPlan = job.plan.parts.find((p) => p.partId === job.cabinetParts.find((c) => c.name === 'Bottom')!.id)!;
    expect(bottomPlan.cutOut).toBe('tableSaw');
    expect(bottomPlan.steps.map((s) => s.label)).toEqual(['Angles cut to the outline', 'Inside corner notch']);
  });

  it('puts a lazy susan and the bi-fold hinges on the hardware list', () => {
    const project = lShaped();
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    const corner = lists.hardware.filter((h) => h.group === 'Corner cabinets');
    expect(corner.map((h) => [h.item, h.quantity])).toEqual([
      ['Lazy susan, two pie-cut shelves on a pole, 28" across', 1],
      ['Bi-fold hinges', 2],
    ]);
    expect(len('28"').mm).toBeCloseTo(cabinetsOf(project)[0]!.size.width.mm - len('8"').mm, 6);
  });

  it('stands on its end sides and on sleepers under its bottom; the backs start at the bottom, which fits between them', () => {
    for (const side of ['left', 'right'] as const) {
      const project = lShaped(side);
      const cabinet = cabinetsOf(project)[0]!;
      const parts = deriveCabinetParts(project, shop);
      const named = (name: string) => parts.find((p) => p.name === name)!;
      const top = named('Top');
      const uprights = ['Back along the run', 'Back along the other wall', 'End side', 'Other end side'].map(named);
      const kick = cabinet.toeKick.height.mm;
      // The backs start at the underside of the bottom, off the floor; the end sides stand on it. All reach the top.
      expect(uprights.map((p) => +partBox(p).min[1]!.toFixed(3))).toEqual([kick, kick, 0, 0]);
      for (const p of uprights) expect(partBox(p).max[1]).toBeCloseTo(cabinet.size.height.mm - top.size.thickness, 6);
      // Three sleepers as high as the toe kick, on the floor under the bottom, in from the walls.
      const sleepers = parts.filter((p) => p.name.startsWith('Sleeper'));
      expect(sleepers).toHaveLength(3);
      const under = partBox(named('Bottom'));
      const all = { min: uprights.map(partBox).reduce((m, u) => [Math.min(m[0]!, u.min[0]!), 0, Math.min(m[2]!, u.min[2]!)], [Infinity, 0, Infinity]) };
      for (const p of sleepers) {
        const u = partBox(p);
        expect([u.min[1], u.max[1]]).toEqual([0, kick]);
        for (const axis of [0, 2]) {
          expect(u.min[axis]!).toBeGreaterThanOrEqual(under.min[axis]! - 1e-6);
          expect(u.max[axis]!).toBeLessThanOrEqual(under.max[axis]! + 1e-6);
        }
      }
      expect(all.min[0]).toBeLessThan(under.min[0]! + 1e-6);
      // The end sides are notched for the toe kick, as a cabinet's sides are; the backs are plain.
      const corners = (p: (typeof parts)[number]) => (p.features.find((f) => f.kind === 'cutout') as { outline: unknown[] }).outline.length;
      expect(uprights.map(corners)).toEqual([4, 4, 6, 6]);
      // The bottom is smaller than the top by a back and a side each way, and no upright runs through it.
      const bottom = named('Bottom');
      const [tb, t] = [named('Back along the run').size.thickness, named('End side').size.thickness];
      expect(top.size.width - bottom.size.width).toBeCloseTo(tb + t, 6);
      expect(top.size.height - bottom.size.height).toBeCloseTo(tb + t, 6);
      const b = partBox(bottom);
      for (const p of uprights) {
        const u = partBox(p);
        const lap = [0, 2].map((k) => Math.min(b.max[k]!, u.max[k]!) - Math.max(b.min[k]!, u.min[k]!));
        expect(lap.some((v) => v <= 1e-6)).toBe(true);
      }
    }
  });

  it('gives its bottom and top a counter-clockwise outline on either hand (a clockwise one is a solid inside out)', () => {
    for (const side of ['left', 'right'] as const) {
      const flats = deriveCabinetParts(lShaped(side), shop).filter((p) => p.shaped);
      expect(flats.map((p) => p.name)).toEqual(['Bottom', 'Top']);
      for (const part of flats) {
        const feature = part.features.find((f) => f.kind === 'cutout')!;
        const points = (feature as { outline: { x: number; y: number }[] }).outline;
        const area = points.reduce((sum, p, k) => sum + p.x * points[(k + 1) % points.length]!.y - points[(k + 1) % points.length]!.x * p.y, 0);
        expect(area).toBeGreaterThan(0);
      }
    }
  });
});
