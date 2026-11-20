// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, diagonalPlan, diagonalPlace, frontWidth, inRoom, insetPolygon, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import type { CasesContext } from '@/model';
import { applyCabinetLayout, createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** Milestone 6: the diagonal corner cabinet. */
const shop = lowRiderJobShop();
const diagonal = (construction: 'frameless' | 'faceFrame' = 'frameless') => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('36"');
  stored.corner = { kind: 'diagonal', side: 'left' };
  applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');
  return project;
};

describe('a diagonal corner cabinet', () => {
  it('in plan: its front √2 × (width − depth) across, its backs as long as its width, square in the corner', () => {
    const cabinet = cabinetsOf(diagonal())[0]!;
    const plan = diagonalPlan(cabinet);
    const A = len('36"').mm;
    const d = len('22-1/2"').mm;
    expect(frontWidth(cabinet)).toBeCloseTo(Math.SQRT2 * (A - d), 6);
    const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
    expect(dist(plan.q, plan.r)).toBeCloseTo(A, 6);
    expect(dist(plan.q, plan.l)).toBeCloseTo(A, 6);
    expect(dist(plan.r, plan.fr)).toBeCloseTo(d, 6);
    // The two backs meet square.
    const [u, v] = [[plan.r[0] - plan.q[0], plan.r[1] - plan.q[1]], [plan.l[0] - plan.q[0], plan.l[1] - plan.q[1]]];
    expect(u[0]! * v[0]! + u[1]! * v[1]!).toBeCloseTo(0, 6);
  });

  it('has a five-sided bottom, top and shelf, two backs and two short sides; shaped parts on the CNC when it reaches', () => {
    const project = diagonal();
    const parts = deriveCabinetParts(project, shop);
    expect(parts.map((p) => p.name)).toEqual(['Bottom', 'Top', 'Back, right', 'Back, left', 'Right side', 'Left side', 'Toe kick', 'Sleeper, back right', 'Sleeper, back left', 'Sleeper, middle', 'Shelf']);
    const bottom = parts.find((p) => p.name === 'Bottom')!;
    const cutout = bottom.features.find((f) => f.kind === 'cutout')!;
    expect(cutout.kind === 'cutout' && cutout.outline).toHaveLength(5);
    expect(bottom.shaped).toBe(true);
    // 36" along each wall: the bottom is wider than the LowRider 3 reaches, so it is cut on the saw to its outline.
    const job = buildJob(project, shop);
    const plan = (name: string, j = job) => j.plan.parts.find((p) => p.partId === j.cabinetParts.find((c) => c.name === name)!.id)!;
    expect(plan('Bottom')).toMatchObject({ cutOut: 'tableSaw', options: ['tableSaw'] });
    expect(plan('Bottom').steps.map((s) => s.label)).toEqual(['Angles cut to the outline']);
    // A wall cabinet's, 24" along each wall, fits the machine and a full sheet on hand: the CNC cuts it.
    const wall = diagonal();
    const stored = (wall.context as CasesContext).pieces[0]!;
    stored.size.width = len('24"');
    stored.size.depth = len('12"');
    wall.plan.blank.stock = { width: len('48"'), height: len('96"') };
    const small = buildJob(wall, shop);
    for (const name of ['Bottom', 'Top', 'Shelf']) expect(plan(name, small)).toMatchObject({ cutOut: 'cnc', options: ['cnc'] });
  });

  it("its sides' inside faces stand inside the case, and its door covers its diagonal front", () => {
    const project = diagonal();
    const cabinet = cabinetsOf(project)[0]!;
    const parts = deriveCabinetParts(project, shop);
    const plan = diagonalPlan(cabinet);
    // Every case part is within the plan's outline in x.
    for (const p of parts) {
      const box = partBox(p);
      expect(box.min[0]).toBeGreaterThanOrEqual(plan.l[0] - 0.01);
      expect(box.max[0]).toBeLessThanOrEqual(plan.r[0] + 0.01);
      expect(box.max[2]).toBeLessThanOrEqual(0.01);
    }
    const [opening] = deriveCabinetOpenings(cabinet, shop.materials);
    const t = 18.26;
    expect(opening!.origin.x).toBeCloseTo(t * Math.SQRT2, 1);
    const door = buildJob(project, shop).parts[0]!;
    expect(partBox(door).max[0] - partBox(door).min[0]).toBeGreaterThan(opening!.width / 2 - 1);
  });

  it('stands on its sides, notched for the toe kick, and on sleepers under its bottom; the backs start at the bottom', () => {
    const project = diagonal();
    const cabinet = cabinetsOf(project)[0]!;
    const parts = deriveCabinetParts(project, shop);
    const named = (name: string) => parts.find((p) => p.name === name)!;
    const t = named('Top').size.thickness;
    const kickH = cabinet.toeKick.height.mm;
    expect(['Back, right', 'Back, left', 'Right side', 'Left side'].map((name) => +partBox(named(name)).min[1]!.toFixed(3))).toEqual([kickH, kickH, 0, 0]);
    for (const name of ['Back, right', 'Back, left', 'Right side', 'Left side']) expect(partBox(named(name)).max[1]).toBeCloseTo(cabinet.size.height.mm - t, 6);
    // Three sleepers as high as the toe kick, under the bottom; the middle one runs back from the toe kick board.
    const sleepers = parts.filter((p) => p.name.startsWith('Sleeper'));
    expect(sleepers).toHaveLength(3);
    const under = partBox(named('Bottom'));
    for (const p of sleepers) {
      const u = partBox(p);
      expect([u.min[1], u.max[1]]).toEqual([0, kickH]);
      for (const axis of [0, 2]) {
        expect(u.min[axis]!).toBeGreaterThanOrEqual(under.min[axis]! - 1e-6);
        expect(u.max[axis]!).toBeLessThanOrEqual(under.max[axis]! + 1e-6);
      }
    }
    expect(partBox(named('Sleeper, middle')).max[2]).toBeCloseTo(partBox(named('Toe kick')).min[2]!, 6);
    const corners = (name: string) => (named(name).features.find((f) => f.kind === 'cutout') as { outline: unknown[] }).outline.length;
    expect(['Back, right', 'Back, left', 'Right side', 'Left side'].map(corners)).toEqual([4, 4, 6, 6]);
    // The notch is at the front end of each side: the board's face is the kick's depth behind the diagonal front.
    const kick = cabinet.toeKick.depth.mm * Math.SQRT2;
    const notchX = (name: string) => (named(name).features.find((f) => f.kind === 'cutout') as { outline: { x: number; y: number }[] }).outline.filter((p) => p.y === 0).map((p) => p.x);
    expect(notchX('Left side')[0]).toBeCloseTo(kick, 6);
    expect(notchX('Right side')[1]).toBeCloseTo(named('Right side').size.width - kick, 6);
    // The bottom fits between them: smaller than the top, which lies on them.
    expect(named('Bottom').size.width).toBeLessThan(named('Top').size.width - t);
    // The toe kick board reaches the sides' inside faces.
    const board = partBox(named('Toe kick'));
    const plan = diagonalPlan(cabinet);
    expect(board.min[0]).toBeLessThan(0);
    expect(board.max[0]).toBeGreaterThan(plan.front);
  });

  it('a face frame stands on the diagonal front', () => {
    const project = diagonal('faceFrame');
    const cabinet = cabinetsOf(project)[0]!;
    const rail = deriveCabinetParts(project, shop).find((p) => p.name === 'Top rail')!;
    expect(rail.size.width).toBeCloseTo(frontWidth(cabinet) - 2 * len('1-1/2"').mm, 6);
  });

  it('turned into its corner: its front-left corner on the diagonal, 45° more than its run', () => {
    const cabinet = cabinetsOf(diagonal())[0]!;
    const A = cabinet.size.width.mm;
    const d = cabinet.size.depth.mm;
    const left = diagonalPlace(cabinet, 0, 'left');
    expect(left).toEqual({ local: [d, A], turn: 45 });
    // Its back corner lands in the room's corner.
    const plan = diagonalPlan(cabinet);
    const apex = inRoom([left.local[0], 0, left.local[1]], left.turn, [plan.q[0], 0, plan.q[1]]);
    expect(apex[0]).toBeCloseTo(0, 6);
    expect(apex[2]).toBeCloseTo(0, 6);
    const right = diagonalPlace(cabinet, 1000, 'right');
    const apexR = inRoom([right.local[0], 0, right.local[1]], right.turn, [plan.q[0], 0, plan.q[1]]);
    expect(apexR[0]).toBeCloseTo(1000 + A, 6);
    expect(apexR[2]).toBeCloseTo(0, 6);
  });

  it('insets a polygon edge by edge', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const inner = insetPolygon(square, [1, 2, 3, 4]);
    expect(inner.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6))).toEqual([[4, 1], [8, 1], [8, 7], [4, 7]]);
  });
});
