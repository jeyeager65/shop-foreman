import { describe, expect, it } from 'vitest';
import { alongLoop, exampleTabs, tabExamples } from '@/cam/tabExamples';
import { createStarterShopProfile } from '@/libraries';
import { bore, contour, outsideLoop, pocket, tabCenters } from '@/cam/cuts';
import { tabbedOutline } from '@/design/tabs';
import { type Feeds, Path, applyTabs, depthLevels, perimeter, rampedLaps, runTime } from '@/cam/path';
import type { ToolpathStep } from '@/model';

const f: Feeds = { feed: 1000, plunge: 300, depthPerPass: 3, stepover: 2, finish: 0 };
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const zs = (steps: ToolpathStep[]) =>
  steps.flatMap((s) => ((s.kind === 'rapid' || s.kind === 'cut' || s.kind === 'arc') && s.z !== undefined ? [s.z] : []));

describe('depthLevels', () => {
  it('splits into equal passes no deeper than the limit', () => {
    expect(depthLevels(6.35, 3.2)).toEqual([-3.175, -6.35]);
    expect(depthLevels(13, 3.2).map((z) => +z.toFixed(3))).toEqual([-2.6, -5.2, -7.8, -10.4, -13]);
    expect(depthLevels(3, 3)).toEqual([-3]);
    expect(depthLevels(0, 3)).toEqual([]);
  });
});

describe('rampedLaps', () => {
  it('ramps in at the slope, completes the lap and levels the ramp', () => {
    const s = rampedLaps(square, 0, -3, 0.2, true);
    expect(s[0]).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(s[1]).toMatchObject({ x: 15, y: 0, z: -3, u: 15 }); // 3 mm down over 15 mm
    expect(s.at(-1)).toMatchObject({ x: 15, y: 0, z: -3, u: 415 });
    expect(Math.min(...s.map((p) => p.z))).toBe(-3);
  });

  it('leaves the ramp for the next level when not finishing', () => {
    expect(rampedLaps(square, 0, -3, 0.2, false).at(-1)).toMatchObject({ x: 0, y: 0, u: 400 });
  });

  it('takes several laps on a loop shorter than the ramp', () => {
    const tiny = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ];
    const s = rampedLaps(tiny, 0, -3, 0.2, true);
    expect(perimeter(tiny)).toBe(10);
    expect(s.at(-1)!.u).toBe(25); // 15 mm ramp = 2 laps, then 5 mm to level the second lap's slope
    for (let i = 1; i < s.length; i++) expect(s[i]!.z).toBeLessThanOrEqual(s[i - 1]!.z);
  });
});

describe('tabs', () => {
  const tabs = { centers: [50], flat: 20, ramp: 5, topZ: -7, height: 3 };

  it('never cuts deeper than the pass and holds the tab height across the flat', () => {
    const flat = rampedLaps(square, -10, -10, 0.2, false);
    const out = applyTabs(flat, 400, tabs);
    for (const s of out) expect(s.z).toBeGreaterThanOrEqual(-10);
    const onTab = out.filter((s) => s.u >= 40 && s.u <= 60);
    expect(onTab.length).toBeGreaterThanOrEqual(2);
    for (const s of onTab) expect(s.z).toBe(-7);
    expect(out.find((s) => s.u === 35)!.z).toBe(-10);
    expect(out.find((s) => s.u === 65)!.z).toBe(-10);
  });

  it('spaces tabs along each side, away from corners', () => {
    expect(tabCenters(square, 300)).toEqual([50, 150, 250, 350]);
    expect(tabCenters(square, 50)).toHaveLength(8);
    // Never near a corner: a side too short for the whole tab clear of both its ends gets none.
    const strip = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 60 }, { x: 0, y: 60 }];
    expect(tabCenters(strip, 300, 27, 25)).toEqual([200, 660]);
    // A tabbed end: the joint's tab and its shoulders are short sides, so only the long sides are held.
    const tabbed = [{ x: 20, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 200 }, { x: 20, y: 200 }, { x: 20, y: 125 }, { x: 0, y: 125 }, { x: 0, y: 75 }, { x: 20, y: 75 }];
    expect(tabCenters(tabbed, 300, 27, 25)).toEqual([200, 500, 800]);
    // A part with no side that long is still held, on its two longest sides.
    const small = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }];
    expect(tabCenters(small, 300, 27, 25)).toEqual([30, 130]);
  });

  it('smart: a tab near each corner on the long sides, one a corner, staggered on a narrow part', () => {
    const near = (got: number[], want: number[]) => expect(got.map((v) => Math.round(v * 10) / 10)).toEqual(want);
    const rect = (w: number, h: number) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    // A door, 380 x 760: four, 38.5 in from the corners on its long sides; its short sides, no longer than the spacing, none.
    near(tabCenters(rect(380, 760), 400, 27, 25, 'spread'), [418.5, 1101.5, 1558.5, 2241.5]);
    // Wider, 600 x 760: its short sides are longer than the spacing, so each has one of its own in its middle.
    near(tabCenters(rect(600, 760), 400, 27, 25, 'spread'), [300, 638.5, 1321.5, 1660, 1998.5, 2681.5]);
    // Two tabs on a side may be twice the spacing apart; further, and more go evenly between.
    const tall = tabCenters(rect(380, 2400), 400, 27, 25, 'spread').filter((c) => c > 380 && c < 2780);
    near(tall, [418.5, 1192.8, 1967.2, 2741.5]);
    // A square: two opposite sides have the corners; the other two, shorter than the spacing, none.
    near(tabCenters(rect(200, 200), 300, 27, 25, 'spread'), [38.5, 161.5, 438.5, 561.5]);
    // One too small for two on a side is held in three places.
    near(tabCenters(square, 300, 27, 25, 'spread'), [50, 150, 250]);
    // A narrow part (the fit test's piece, 300 x 96): one long side near its ends, the other half-way between them.
    near(tabCenters(rect(300, 96), 400, 27, 25, 'spread'), [38.5, 261.5, 546]);
    // A long narrow strip: the far side's tabs are between the near side's, never opposite them.
    const strip = tabCenters(rect(2000, 60), 400, 27, 25, 'spread');
    const front = strip.filter((c) => c < 2000);
    const back = strip.filter((c) => c > 2060).map((c) => 4060 - c).sort((p, q) => p - q);
    expect(front).toHaveLength(4);
    expect(back).toHaveLength(3);
    back.forEach((x, i) => expect(x).toBeCloseTo((front[i]! + front[i + 1]!) / 2));
    // A part too small for two on a side: the middles of its two long sides.
    near(tabCenters(rect(127, 76), 400, 27, 25, 'spread'), [63.5, 266.5]);
    // A circle has no corner: three at the least, evenly round it.
    const circle = Array.from({ length: 72 }, (_, i) => ({ x: 100 * Math.cos((i * Math.PI) / 36), y: 100 * Math.sin((i * Math.PI) / 36) }));
    const round = tabCenters(circle, 300, 27, 25, 'spread');
    expect(round).toHaveLength(3);
    expect(round[1]! - round[0]!).toBeCloseTo(round[2]! - round[1]!);
    expect(tabCenters(circle, 300, 27, 25, 'perSide')).toHaveLength(3);
    // A rounded leaf: a straight edge 600 long and a half circle on it. One tab a corner, on the straight edge,
    // where it is easier to sand off; the curve, a side with none and longer than the spacing, has its own, away
    // from the corners.
    const leaf = [{ x: 0, y: 0 }, { x: 600, y: 0 }, ...Array.from({ length: 59 }, (_, i) => ({ x: 300 + 300 * Math.cos(((i + 1) * Math.PI) / 60), y: 300 * Math.sin(((i + 1) * Math.PI) / 60) }))];
    const held = tabCenters(leaf, 400, 27, 25, 'spread');
    near(held.filter((c) => c < 600), [38.5, 561.5]);
    const arc = held.filter((c) => c > 600);
    expect(arc).toHaveLength(2);
    const end = 600 + Math.PI * 300;
    for (const c of arc) expect(c > 600 + 150 && c < end - 150).toBe(true);
  });

  it("smart: an edge with a joint's tabs is held on the end of a tab, not on its shoulders", () => {
    // 600 x 500 over its tabs, three tabs 50 long standing 20 out of each end.
    const spans = [{ from: 60, to: 110 }, { from: 225, to: 275 }, { from: 390, to: 440 }];
    const ends = { reach: 20, spans };
    const part = tabbedOutline(600, 500, { x0: ends, x1: ends });
    const at = tabCenters(part, 400, 27, 25, 'spread', true).map((c) => alongLoop(part, c, c + 1)[0]!);
    // Near the corners of the front and back edges, and the middle of the middle tab's end at each side.
    expect(at.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).toEqual(['59,0', '542,0', '600,250', '542,500', '59,500', '0,250']);
    // A tab's end too short for the whole holding tab takes none: the edge is then left to its neighbours.
    const short = { reach: 20, spans: [{ from: 240, to: 260 }] };
    const other = tabbedOutline(600, 500, { x0: short, x1: short });
    expect(tabCenters(other, 400, 27, 25, 'spread', true)).toHaveLength(4);
    // A short edge with tabs (a stretcher's end) takes none either.
    const stretcher = tabbedOutline(600, 100, { x0: { reach: 20, spans: [{ from: 25, to: 75 }] }, x1: { reach: 20, spans: [{ from: 25, to: 75 }] } });
    const on = tabCenters(stretcher, 400, 27, 25, 'spread', true).map((c) => alongLoop(stretcher, c, c + 1)[0]!);
    expect(on).toHaveLength(3);
    for (const p of on) expect(Math.abs(p.y) < 1e-6 || Math.abs(p.y - 100) < 1e-6).toBe(true);
  });

  it('cuts through between tabs on the last pass', () => {
    const path = new Path(5);
    contour(path, outsideLoop({ x0: 0, y0: 0, x1: 100, y1: 100 }, 3), 10, f, { ...tabs, centers: [53] });
    expect(Math.min(...zs(path.steps))).toBe(-10);
    expect(path.steps.at(-1)).toEqual({ kind: 'rapid', z: 5 });
  });
});

describe('bore', () => {
  it('helixes down and ends flat at depth with the full diameter', () => {
    const path = new Path(5);
    bore(path, { x: 50, y: 50 }, 35, 6.35, 13, { ...f, depthPerPass: 3.2, stepover: 2.5 });
    const arcs = path.steps.filter((s) => s.kind === 'arc');
    expect(Math.min(...zs(path.steps))).toBeCloseTo(-13, 9);
    expect(Math.max(...arcs.map((a) => Math.hypot(a.i, a.j)))).toBeCloseTo((35 - 6.35) / 2, 9);
    // The only straight Z move is the approach to the surface
    const plunges = path.steps.filter((s) => s.kind === 'cut' && s.x === undefined);
    expect(plunges).toEqual([{ kind: 'cut', z: 0, feed: 300 }]);
  });

  it('goes straight down when the hole is the bit size', () => {
    const path = new Path(5);
    bore(path, { x: 0, y: 0 }, 6.35, 6.35, 6, f);
    expect(path.steps.some((s) => s.kind === 'arc')).toBe(false);
    expect(Math.min(...zs(path.steps))).toBe(-6);
  });
});

describe('pocket', () => {
  it('keeps the bit inside the floor and reaches its edges', () => {
    const path = new Path(5);
    const floor = { x0: 10, y0: 10, x1: 110, y1: 60 };
    expect(pocket(path, floor, 6, 6, f)).toBe(true);
    const cuts = path.steps.filter((s) => s.kind === 'cut' && s.x !== undefined && s.y !== undefined);
    const xs = cuts.map((s) => (s as { x: number }).x);
    const ys = cuts.map((s) => (s as { y: number }).y);
    expect(Math.min(...xs)).toBeCloseTo(13, 9);
    expect(Math.max(...xs)).toBeCloseTo(107, 9);
    expect(Math.min(...ys)).toBeCloseTo(13, 9);
    expect(Math.max(...ys)).toBeCloseTo(57, 9);
    expect(Math.min(...zs(path.steps))).toBe(-6);
  });

  it('refuses a bit that does not fit', () => {
    expect(pocket(new Path(5), { x0: 0, y0: 0, x1: 4, y1: 50 }, 6, 3, f)).toBe(false);
  });
});

describe('runTime', () => {
  it('adds up moves at their feeds, arcs by their length', () => {
    const steps: ToolpathStep[] = [
      { kind: 'rapid', x: 100, y: 0 },
      { kind: 'cut', x: 100, y: 50, feed: 600 },
      { kind: 'arc', dir: 'ccw', x: 80, y: 50, i: -10, j: 0, feed: 600 },
    ];
    const { seconds, end } = runTime(steps, 3000, { x: 0, y: 0, z: 0 });
    expect(seconds).toBeCloseTo(2 + 5 + (Math.PI * 10) / 10, 9);
    expect(end).toEqual({ x: 80, y: 50, z: 0 });
  });
});

describe('full-depth finishing passes', () => {
  const ff: Feeds = { ...f, finish: 0.3 };
  type Move = Extract<ToolpathStep, { kind: 'cut' | 'arc' | 'rapid' }>;
  const moves = (steps: ToolpathStep[]) => steps.filter((s): s is Move => s.kind === 'cut' || s.kind === 'arc' || s.kind === 'rapid');

  it('bore: roughs short of the wall, then one circle at full depth and full size', () => {
    const path = new Path(5);
    bore(path, { x: 50, y: 50 }, 35, 6.35, 13, ff);
    const arcs = moves(path.steps).filter((s) => s.kind === 'arc');
    const rMax = (35 - 6.35) / 2;
    const radius = (s: Move) => (s.kind === 'arc' ? Math.abs(s.i) : 0);
    const full = arcs.filter((s) => Math.abs(radius(s) - rMax) < 1e-6);
    // Two half circles, both at the bottom
    expect(full).toHaveLength(2);
    expect(full.every((s) => s.z === -13)).toBe(true);
    expect(full).toEqual(arcs.slice(-2));
    // Everything before it stays the allowance inside
    expect(Math.max(...arcs.slice(0, -2).map(radius))).toBeCloseTo(rMax - 0.3, 6);
  });

  it('bore: no finishing pass on a hole barely bigger than the bit', () => {
    const rough = new Path(5);
    bore(rough, { x: 0, y: 0 }, 6.45, 6.35, 29, f);
    const finished = new Path(5);
    bore(finished, { x: 0, y: 0 }, 6.45, 6.35, 29, ff);
    expect(finished.steps).toEqual(rough.steps);
  });

  it('pocket: levels stop short of the wall; the last lap runs the wall at full depth', () => {
    const floor = { x0: 0, y0: 0, x1: 80, y1: 60 };
    const path = new Path(5);
    expect(pocket(path, floor, 6, 6, ff)).toBe(true);
    const cuts = moves(path.steps).filter((s) => s.kind === 'cut' && s.x !== undefined);
    const onWall = (s: Move) => [s.x === 3, s.x === 77, s.y === 3, s.y === 57].some(Boolean);
    const wall = cuts.filter(onWall);
    expect(wall.length).toBeGreaterThanOrEqual(4);
    // The wall is only ever cut at the bottom
    expect(wall.every((s) => s.z === undefined || s.z === -6)).toBe(true);
    expect(zs(wall.slice(-4)).every((z) => z === -6)).toBe(true);
    // Roughing reaches to the allowance from the wall
    const rough = cuts.filter((s) => !onWall(s));
    expect(Math.min(...rough.map((s) => s.x!))).toBeCloseTo(3.3, 6);
    expect(Math.max(...rough.map((s) => s.x!))).toBeCloseTo(76.7, 6);
  });

  it('contour: roughs outside the line in levels, then one lap on the line at full depth', () => {
    const outline = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const roughLoop = outsideLoop(outline, 3.3);
    const finalLoop = outsideLoop(outline, 3);
    const path = new Path(5);
    contour(path, roughLoop, 9, ff, undefined, { loop: finalLoop });
    const cuts = moves(path.steps).filter((s) => s.kind === 'cut' && s.x !== undefined);
    const onLine = (s: Move) => [s.x === -3, s.x === 103, s.y === -3, s.y === 103].some(Boolean);
    const final = cuts.filter(onLine);
    // The move onto the line plus the four sides, all at full depth, at the very end
    expect(final).toHaveLength(5);
    expect(final).toEqual(cuts.slice(-5));
    let z = 0;
    for (const s of moves(path.steps)) {
      if (s.z !== undefined) z = s.z;
      if (s.kind === 'cut' && s.x !== undefined && onLine(s)) expect(z).toBe(-9);
    }
    // Without a finish loop the path is unchanged from before
    const plain = new Path(5);
    contour(plain, finalLoop, 9, f);
    expect(moves(plain.steps).filter((s) => s.kind === 'cut' && s.x !== undefined).every(onLine)).toBe(true);
  });
});

describe('the examples that show how holding tabs are placed', () => {
  const tabs = createStarterShopProfile().machines[0]!.tabs;
  const examples = tabExamples();

  it('are a few parts, each held under either way', () => {
    expect(examples.map((e) => e.id)).toEqual(['panel', 'door', 'strip', 'small', 'round', 'leaf', 'tabbed']);
    const counts = (method: 'spread' | 'perSide') => examples.map((e) => exampleTabs(e, tabs, method).centers.length);
    // The examples, one by one, at the starter machine's spacing.
    expect(counts('spread')).toEqual([6, 4, 3, 2, 3, 4, 6]);
    expect(counts('perSide')).toEqual([6, 6, 6, 2, 4, 5, 4]);
    const where = (id: string, method: 'spread' | 'perSide') => {
      const e = examples.find((x) => x.id === id)!;
      return exampleTabs(e, tabs, method).centers.map((c) => alongLoop(e.outline, c, c + 1)[0]!);
    };
    // The long strip: smart, near its ends on one side and in the middle of the other; evenly, pairs across it.
    expect(where('strip', 'spread').map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).toEqual(['39,0', '571,0', '305,102']);
    // The bottom with a joint's tabs: smart, its ends are held too, on the middle tab of each.
    const ends = where('tabbed', 'spread').filter((p) => Math.abs(p.y - 254) < 1e-6).map((p) => Math.round(p.x));
    expect(ends).toEqual([610, 0]);
    // Evenly: one in the middle of the front and of the back, and one on the middle tab of each end.
    expect(where('tabbed', 'perSide').map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).toEqual(['305,0', '610,254', '305,508', '0,254']);
    // The door: near its four corners, on its long sides.
    for (const p of where('door', 'spread')) {
      expect(Math.abs(p.x) < 1e-6 || Math.abs(p.x - 381) < 1e-6).toBe(true);
      expect(p.y < 60 || p.y > 762 - 60).toBe(true);
    }
    // The leaf: one tab a corner, on its straight edge.
    expect(where('leaf', 'spread').filter((p) => Math.abs(p.y) < 1e-6)).toHaveLength(2);
  });

  it('draws a tab as a stretch of the outline, round a curve too', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(alongLoop(square, 40, 60)).toEqual([{ x: 40, y: 0 }, { x: 60, y: 0 }]);
    // Over a corner, and from the end of the loop on past its start.
    expect(alongLoop(square, 90, 110)).toEqual([{ x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }]);
    expect(alongLoop(square, 390, 410)).toEqual([{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }]);
    const leaf = examples.find((e) => e.id === 'leaf')!;
    const made = exampleTabs(leaf, tabs, 'spread');
    expect(made.centers.some((c) => c > 28 * 25.4)).toBe(true);
    for (const c of made.centers) expect(alongLoop(leaf.outline, c - made.length / 2, c + made.length / 2).length).toBeGreaterThanOrEqual(2);
  });
});
