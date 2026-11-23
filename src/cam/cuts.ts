/**
 * One generator per CAM operation. All work in machine coordinates for the setup:
 * X/Y from the stock's front-left corner, Z0 at the top of the stock.
 * End mills never plunge straight into material: they helix or ramp in.
 */
import { type Rect, insetRect, rectCorners, rectHeight, rectWidth } from '@/geometry/rect';
import { type ArcShape, type BallCentre, type LedgeOpening, POCKET, type PocketShape, type SlotShape, arcFloorAt, arcOpenAt, arcSeatAt, lineAt, onLine, onSeat, seatAt, slotFloorAt, slotLedge, slotOpenAt, slotOpening, slotSeatAt, slotSlopeEnd } from '@/geometry/pocketHole';
import type { Mm, Point } from '@/model';
import { type Feeds, type Path, type Tabs, applyTabs, cutSamples, depthLevels, perimeter, rampedLaps } from './path';

const EPS = 1e-6;
/** Drop per distance travelled when ramping into a cut (about 11 degrees). */
export const RAMP_SLOPE = 0.2;
/** Below this radius there is nothing to widen: the hole is the bit's own size. */
const MIN_HELIX_RADIUS: Mm = 0.01;
/** How far above the stock a peck lifts to clear the chips. */
const PECK_CLEAR: Mm = 1;
/** A peck's return stops this far above where the last one ended. */
const PECK_APPROACH: Mm = 0.5;

/**
 * A hole less than a tenth of the bit wider than the bit leaves no room to helix
 * in: it is peck drilled instead (straight down a pass at a time, lifting clear
 * between passes), then widened to size at the bottom.
 */
export function boresByPecking(holeDiameter: Mm, toolDiameter: Mm): boolean {
  return (holeDiameter - toolDiameter) / 2 < toolDiameter * 0.1;
}

/**
 * Round flat-bottomed hole: helix down at the centre, then widen in rings at each level.
 * With a finish allowance the rings stop short of the wall, and one circle at full
 * depth takes the wall to size. A hole barely bigger than the bit is peck drilled.
 * Used for hinge cups, dowel holes and flip pin holes.
 */
export function bore(path: Path, c: Point, holeDiameter: Mm, toolDiameter: Mm, depth: Mm, f: Feeds, past: Mm = 0): void {
  const rMax = (holeDiameter - toolDiameter) / 2;
  const levels = depthLevels(depth, f.depthPerPass, past);
  if (boresByPecking(holeDiameter, toolDiameter)) {
    path.moveTo(c);
    path.cut({ z: 0 }, f.plunge);
    let zDone = 0;
    for (const z of levels) {
      if (zDone < 0) {
        // Lift clear so the chips leave the hole, then back down to just above the last pass.
        path.rapid({ z: PECK_CLEAR });
        path.cut({ z: zDone + PECK_APPROACH }, f.feed);
      }
      path.cut({ z }, f.plunge);
      zDone = z;
    }
    if (rMax >= MIN_HELIX_RADIUS) {
      path.cut({ x: c.x + rMax, y: c.y }, f.plunge);
      path.circle(c, rMax, zDone, zDone, f.plunge);
    }
    path.retract();
    return;
  }
  const step = f.stepover > EPS ? Math.min(f.stepover, toolDiameter / 2) : toolDiameter * 0.4;
  // Only worth a finishing pass when the hole is clearly bigger than the bit.
  const finish = f.finish > EPS && rMax >= 4 * f.finish;
  const rRough = finish ? rMax - f.finish : rMax;
  const radii: Mm[] = [];
  for (let r = Math.min(step, rRough); r < rRough - EPS; r += step) radii.push(r);
  radii.push(rRough);
  const r0 = radii[0]!;
  const start = { x: c.x + r0, y: c.y };

  path.moveTo(start);
  path.cut({ z: 0 }, f.plunge);
  let zPrev = 0;
  for (const z of levels) {
    if (zPrev < 0) path.cut(start, f.feed);
    path.circle(c, r0, z, (zPrev + z) / 2, f.plunge);
    path.circle(c, r0, z, z, f.feed);
    for (const r of radii.slice(1)) {
      path.cut({ x: c.x + r, y: c.y }, f.feed);
      path.circle(c, r, z, z, f.feed);
    }
    zPrev = z;
  }
  if (finish) {
    path.cut({ x: c.x + rMax, y: c.y }, f.feed);
    path.circle(c, rMax, zPrev, zPrev, f.feed);
  }
  path.retract();
}

/** Tool-centre rings for clearing a rectangle, innermost first. */
function pocketRings(floor: Rect, toolDiameter: Mm, stepover: Mm): Rect[] {
  const step = stepover > EPS ? Math.min(stepover, toolDiameter / 2) : toolDiameter * 0.4;
  const rings: Rect[] = [];
  for (let k = 0; ; k++) {
    const ring = insetRect(floor, toolDiameter / 2 + k * step);
    if (rectWidth(ring) < -EPS || rectHeight(ring) < -EPS) break;
    rings.unshift(ring);
  }
  return rings;
}

/** A ring as a closed loop; a ring squeezed flat becomes a line there and back. */
function ringLoop(ring: Rect): Point[] {
  const flatX = rectWidth(ring) <= EPS;
  const flatY = rectHeight(ring) <= EPS;
  if (flatX || flatY) {
    return [
      { x: ring.x0, y: ring.y0 },
      { x: flatX ? ring.x0 : ring.x1, y: flatY ? ring.y0 : ring.y1 },
    ];
  }
  return rectCorners(ring, 'ccw');
}

/**
 * Clear a rectangular pocket floor in levels: ramp in on the innermost ring,
 * then step outward ring by ring (climb cutting). The last ring is the wall.
 * With a finish allowance the levels stop short of the wall, and one lap at full
 * depth takes it to size. Returns false when the bit doesn't fit.
 */
export function pocket(path: Path, floor: Rect, toolDiameter: Mm, depth: Mm, f: Feeds): boolean {
  const wall = insetRect(floor, toolDiameter / 2);
  if (rectWidth(wall) < -EPS || rectHeight(wall) < -EPS) return false;
  let rings = f.finish > EPS ? pocketRings(insetRect(floor, f.finish), toolDiameter, f.stepover) : [];
  const finish = rings.length > 0;
  if (!finish) rings = pocketRings(floor, toolDiameter, f.stepover);
  if (rings.length === 0) return false;
  const loops = rings.map(ringLoop);
  let zPrev = 0;
  for (const z of depthLevels(depth, f.depthPerPass)) {
    path.moveTo(loops[0]![0]!);
    path.cut({ z: zPrev }, f.plunge);
    cutSamples(path, rampedLaps(loops[0]!, zPrev, z, RAMP_SLOPE, true), f);
    for (const loop of loops.slice(1)) {
      path.cut(loop[0]!, f.feed);
      cutSamples(path, rampedLaps(loop, z, z, RAMP_SLOPE, false), f);
    }
    zPrev = z;
  }
  if (finish) {
    const loop = ringLoop(wall);
    path.cut(loop[0]!, f.feed);
    cutSamples(path, rampedLaps(loop, zPrev, zPrev, RAMP_SLOPE, false), f);
  }
  path.retract();
  return true;
}

/**
 * Finish the floor corners a larger bit left round: an L-shaped pass into each
 * corner, starting and ending where the larger bit has already cleared.
 */
export function cleanupCorners(
  path: Path,
  floor: Rect,
  clearedDiameter: Mm,
  toolDiameter: Mm,
  depth: Mm,
  f: Feeds,
): boolean {
  const ring = insetRect(floor, toolDiameter / 2);
  const leg = clearedDiameter / 2;
  if (rectWidth(ring) < 2 * leg || rectHeight(ring) < 2 * leg) return false;
  const corners = rectCorners(ring, 'ccw');
  const levels = depthLevels(depth, f.depthPerPass);
  corners.forEach((corner, i) => {
    const before = corners[(i + 3) % 4]!;
    const after = corners[(i + 1) % 4]!;
    const toward = (p: Point): Point => {
      const d = Math.hypot(p.x - corner.x, p.y - corner.y);
      return { x: corner.x + ((p.x - corner.x) * leg) / d, y: corner.y + ((p.y - corner.y) * leg) / d };
    };
    const ends = [toward(before), toward(after)];
    path.moveTo(ends[0]!);
    levels.forEach((z, n) => {
      // Both ends are in cleared space, so going down here cuts nothing.
      path.cut({ z }, f.plunge);
      path.cut(corner, f.feed);
      path.cut(ends[(n + 1) % 2]!, f.feed);
    });
    path.retract();
  });
  return true;
}

/**
 * V bevel on the inside of a frame. The tip follows the floor edge at depth, so
 * the cone's side forms the wall up to the frame edge. On the last level the tip
 * climbs each corner diagonally to the frame's corner, which leaves it sharp.
 */
export function vBevel(path: Path, floorEdge: Rect, frameEdge: Rect, depth: Mm, f: Feeds): void {
  const floor = rectCorners(floorEdge, 'ccw');
  const top = rectCorners(frameEdge, 'ccw');
  const start = { x: (floorEdge.x0 + floorEdge.x1) / 2, y: floorEdge.y0 };
  const levels = depthLevels(depth, f.depthPerPass);
  path.moveTo(start);
  path.cut({ z: 0 }, f.plunge);
  levels.forEach((z, n) => {
    const last = n === levels.length - 1;
    path.cut({ z }, f.plunge);
    for (const i of [1, 2, 3, 0]) {
      path.cut({ x: floor[i]!.x, y: floor[i]!.y }, f.feed);
      if (last) {
        path.cut({ x: top[i]!.x, y: top[i]!.y, z: 0 }, f.feed);
        path.cut({ x: floor[i]!.x, y: floor[i]!.y, z }, f.plunge);
      }
    }
    path.cut(start, f.feed);
  });
  path.retract();
}

/**
 * How the holding tabs of a cut-out are placed, so that nobody has to place them by hand. `spread` (shown as
 * "Smart"): the part is looked at whole: near the corners on its long
 * sides, one tab a corner, staggered on a narrow part, and one more only where a side is left with none.
 * `perSide`: evenly along every side long enough, a side's one tab in its middle.
 */
export type TabMethod = 'spread' | 'perSide';

/** A turn sharper than this between two stretches of a loop is a corner; gentler, the loop is a curve there. */
const CORNER_TURN = Math.PI / 6;
/** Smart, a narrow part: a side at least this share of the first one is the side across from it. */
const LONG_SHARE = 0.6;

/** A stretch of a loop between two corners (or the whole of a loop with none): where it starts, and how long it is. */
interface Run {
  from: Mm;
  length: Mm;
  /** Its two ends. */
  a: Point;
  b: Point;
  /** More than one flat: a curve. */
  curved?: boolean;
  /** It starts, or ends, at an inside corner of the outline. */
  insideStart?: boolean;
  insideEnd?: boolean;
  /** It ends at an inside corner of the outline, at one end or both: the shoulder beside a joint's tab, the step of a notch. */
  shoulder?: boolean;
  /** The whole loop, with no corner: a circle, an oval. */
  closed?: boolean;
}

/**
 * A loop's runs: its straight sides, and its curves. A curve is drawn as many short stretches that each turn a
 * little; they are one run, so a tab can stand on a curve (a round shelf, a rounded leaf) clear of the corners at
 * its ends.
 */
function loopRuns(loop: Point[]): Run[] {
  const n = loop.length;
  const lengths = loop.map((a, i) => Math.hypot(loop[(i + 1) % n]!.x - a.x, loop[(i + 1) % n]!.y - a.y));
  const starts: Mm[] = [];
  lengths.reduce((u, l) => (starts.push(u), u + l), 0);
  const total = lengths.reduce((a, b) => a + b, 0);
  const turns = loop.map((p, i) => {
    const [a, b] = [loop[(i + n - 1) % n]!, loop[(i + 1) % n]!];
    return Math.atan2((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x), (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y));
  });
  // The loop turns one way round on the whole; a corner that turns the other way is an inside corner.
  const way = Math.sign(turns.reduce((a, b) => a + b, 0)) || 1;
  const corners = turns.flatMap((t, i) => (Math.abs(t) > CORNER_TURN ? [i] : []));
  if (!corners.length) return [{ from: 0, length: total, a: loop[0]!, b: loop[0]!, curved: true, closed: true }];
  const inside = (i: number) => Math.sign(turns[i]!) !== way;
  return corners.map((i, k) => {
    const next = corners[(k + 1) % corners.length]!;
    const length = next > i ? starts[next]! - starts[i]! : total - starts[i]! + starts[next]!;
    const flats = (next - i + n) % n || n;
    return {
      from: starts[i]!,
      length: corners.length === 1 ? total : length,
      a: loop[i]!,
      b: loop[next]!,
      ...(flats > 1 ? { curved: true } : {}),
      ...(inside(i) ? { insideStart: true } : {}),
      ...(inside(next) ? { insideEnd: true } : {}),
      ...(inside(i) || inside(next) ? { shoulder: true } : {}),
    };
  });
}

/**
 * A side of a part, for the smart method: a run, or (on a part with a joint's tabs) the whole of an edge that has
 * them, from one corner of the part's body to the next, which takes a holding tab only on the end of a joint's tab.
 */
interface Side {
  from: Mm;
  /** Along the loop. */
  length: Mm;
  /** Straight from its one end to its other. */
  span: Mm;
  a: Point;
  b: Point;
  curved?: boolean;
  /** An edge with a joint's tabs: the middles of the tabs' ends that a holding tab fits on, from `from`. */
  spots?: Mm[];
}

/**
 * The sides of a part with a joint's tabs. The shoulders beside the tabs and the tabs' flanks are faces of the
 * joint, and take no holding tab; **a tab's end takes one in its middle where the whole holding tab fits on it**,
 * nearer its corners than `fromCorner`: it is easier to sand off there. An edge with tabs is one side, from body
 * corner to body corner.
 */
function jointedSides(runs: Run[], need: Mm, tabLength: Mm): Side[] {
  const n = runs.length;
  const kind = runs.map((r, i) => {
    if (r.shoulder) return 'joint';
    const [before, after] = [runs[(i + n - 1) % n]!, runs[(i + 1) % n]!];
    return before.shoulder && after.shoulder && r.length < need - EPS ? 'end' : 'plain';
  });
  // An edge's joint stops at a corner of the part's body: an outside corner between two shoulders.
  const breaks = (i: number) => kind[i] === 'plain' || (kind[i] === 'joint' && kind[(i + n - 1) % n] === 'joint' && !runs[i]!.insideStart);
  const start = Math.max(0, runs.findIndex((_, i) => breaks(i)));
  const sides: Side[] = [];
  let chain: number[] = [];
  const flush = () => {
    if (!chain.length) return;
    const [first, last] = [runs[chain[0]!]!, runs[chain[chain.length - 1]!]!];
    let u = 0;
    const spots: Mm[] = [];
    for (const i of chain) {
      if (kind[i] === 'end' && runs[i]!.length >= tabLength - EPS) spots.push(u + runs[i]!.length / 2);
      u += runs[i]!.length;
    }
    sides.push({ from: first.from, length: u, span: Math.hypot(last.b.x - first.a.x, last.b.y - first.a.y), a: first.a, b: last.b, spots });
    chain = [];
  };
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (k > 0 && breaks(i)) flush();
    if (kind[i] === 'plain') sides.push({ ...runs[i]!, span: runs[i]!.length });
    else chain.push(i);
  }
  flush();
  return sides;
}

/**
 * Where the holding tabs are along a loop, as distances along it. **Never near a corner**:
 * a run (a straight side, or a curve) takes a tab only where the whole tab (`tabLength`, its ramps too) is
 * `fromCorner` clear of both its ends, so the short sides of a part and the steps of a notch get none. A part with
 * no run that long is still held: one tab in the middle of each of its two longest runs.
 *
 * `perSide`: evenly along every run that can take one, no more than `maxSpacing` apart, one in the middle of a
 * run shorter than that. On a part with a joint's tabs (`jointed`, `Part.tabbed`) the shoulders beside them take
 * none, and an edge with them is a side like any other, its tabs on the ends of the joint's tabs.
 *
 * `spread` (shown as "Smart"): the part as a whole.
 * - **A tab near each corner, one a corner**: the sides are taken straight ones first, then longest first, and a
 *   side with both its corners still free gets a tab near each end. So a rectangle has four, on its long sides, and
 *   a rounded leaf has them on its straight edge, where they are easier to sand off, not on the curve as well.
 * - **Two tabs on a side may be twice `maxSpacing` apart**; further, and more go evenly between.
 * - **A side left with none gets its own only when it is longer than `maxSpacing`**: one in its middle (more, evenly,
 *   when it is longer than twice that). An edge with a joint's tabs is such a side, and its holding tab goes on the
 *   end of the joint's tab nearest (`jointedSides`).
 * - **A narrow part** (no wider than half `maxSpacing`) is not held twice at the same place: its first long side has
 *   the tabs near its ends, the side across from it one half-way between each two of those.
 * - A loop with no corner has them evenly round it; and a part is held in three places at the least, where it has room.
 */
export function tabCenters(loop: Point[], maxSpacing: Mm, tabLength: Mm = 0, fromCorner: Mm = 0, method: TabMethod = 'perSide', jointed = false): Mm[] {
  const all = loopRuns(loop);
  const total = perimeter(loop);
  const need = tabLength + 2 * fromCorner;
  const mod = (u: Mm) => ((u % total) + total) % total;
  const sorted = (centers: Mm[]) => [...new Set(centers.map((c) => Math.round(mod(c) * 1e6) / 1e6))].sort((a, b) => a - b);
  const smart = method === 'spread';
  /** Smart: two tabs on one side may be this far apart. */
  const far = 2 * maxSpacing;
  // A loop with no corner: evenly round it, three at the least.
  if (all.length === 1 && all[0]!.closed) {
    const n = Math.max(3, Math.ceil(total / (smart ? far : maxSpacing) - EPS));
    return Array.from({ length: n }, (_, k) => ((k + 0.5) * total) / n);
  }
  /** Nothing long enough: the middles of the two longest runs. */
  const twoLongest = (runs: Run[]) => sorted([...runs].sort((a, b) => b.length - a.length).slice(0, 2).map((r) => r.from + r.length / 2));
  if (!smart) {
    // A part with a joint's tabs: the shoulders beside them close on the part they meet, so no holding tab stands
    // there, whatever their length. (They are the runs that end at an inside corner.)
    const free = jointed ? all.filter((r) => !r.shoulder) : all;
    const runs = free.length ? free : all;
    const long = runs.filter((r) => r.length >= need - EPS);
    // An edge with a joint's tabs is a side too: as many as its length asks, each on the end
    // of the joint's tab nearest where it would stand.
    const edges = jointed ? jointedSides(all, need, tabLength).filter((s) => s.spots?.length) : [];
    if (!long.length && !edges.length) return twoLongest(runs);
    return sorted([
      ...long.flatMap((r) => {
        const n = Math.max(1, Math.round(r.length / maxSpacing));
        return Array.from({ length: n }, (_, k) => r.from + ((k + 0.5) * r.length) / n);
      }),
      ...edges.flatMap((s) => {
        const n = Math.max(1, Math.round(s.span / maxSpacing));
        const used: Mm[] = [];
        for (let k = 0; k < n; k++) {
          const ideal = ((k + 0.5) * s.length) / n;
          const spot = s.spots!.filter((d) => !used.includes(d)).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
          if (spot !== undefined) used.push(spot);
        }
        return used.map((d) => s.from + d);
      }),
    ]);
  }

  const sides: Side[] = jointed ? jointedSides(all, need, tabLength) : all.map((r) => ({ ...r, span: r.length }));
  const count = sides.length;
  /** From a side's end to the middle of a tab near it. */
  const inFromEnd = fromCorner + tabLength / 2;
  const fits = (s: Side) => (s.spots ? s.spots.length > 0 : s.length >= need - EPS);
  const twoFit = (s: Side) => !s.spots && s.length >= 2 * inFromEnd + 2 * tabLength - EPS;
  const within = (s: Side, d: Mm) => Math.min(s.length - inFromEnd, Math.max(inFromEnd, d));
  if (!sides.some(fits)) return twoLongest(all.some((r) => !r.shoulder) && jointed ? all.filter((r) => !r.shoulder) : all);
  /** Each side's tabs, as distances from its start. */
  const on: Mm[][] = sides.map(() => []);
  // Straight sides first (a tab is easier to sand off one than off a curve), then the longest.
  const order = sides
    .map((_, i) => i)
    .filter((i) => !sides[i]!.spots && fits(sides[i]!))
    .sort((i, j) => Number(!!sides[i]!.curved) - Number(!!sides[j]!.curved) || sides[j]!.length - sides[i]!.length || i - j);
  // A narrow part: the side across from the first is held between the first one's tabs, not opposite them.
  const first = order[0];
  const across = new Set<number>();
  if (first !== undefined && !sides[first]!.curved && twoFit(sides[first]!)) {
    const { a, b } = sides[first]!;
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const wide = Math.max(...loop.map((p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / chord));
    if (wide <= maxSpacing / 2 + EPS) for (const i of order.slice(1)) if (sides[i]!.length >= LONG_SHARE * sides[first]!.length - EPS) across.add(i);
  }
  // Near each corner, one tab a corner; and more between two on a side that are too far apart.
  const taken = new Set<number>();
  for (const i of order) {
    const s = sides[i]!;
    const [c0, c1] = [i, (i + 1) % count];
    if (across.has(i) || !twoFit(s) || taken.has(c0) || taken.has(c1)) continue;
    taken.add(c0).add(c1);
    const [from, to] = [inFromEnd, s.length - inFromEnd];
    const more = Math.max(0, Math.ceil((to - from) / far - EPS) - 1);
    for (let k = 0; k <= more + 1; k++) on[i]!.push(from + (k * (to - from)) / (more + 1));
  }
  for (const i of across) {
    const [s, lead] = [sides[i]!, sides[first!]!];
    const at = on[first!]!;
    for (let k = 0; k + 1 < at.length; k++) on[i]!.push(within(s, (1 - (at[k]! + at[k + 1]!) / 2 / lead.length) * s.length));
  }
  // A side left with none, and long: its own, in its middle. An edge with a joint's tabs: on the tab's end nearest.
  sides.forEach((s, i) => {
    if (on[i]!.length || !fits(s) || s.span <= maxSpacing + EPS) return;
    const n = Math.max(1, Math.ceil(s.span / far - EPS));
    for (let k = 0; k < n; k++) {
      const ideal = ((k + 0.5) * s.length) / n;
      if (!s.spots) on[i]!.push(within(s, ideal));
      else {
        const spot = s.spots.filter((d) => !on[i]!.includes(d)).sort((p, q) => Math.abs(p - ideal) - Math.abs(q - ideal))[0];
        if (spot !== undefined) on[i]!.push(spot);
      }
    }
  });
  const centers = sides.flatMap((s, i) => on[i]!.map((d) => s.from + d));
  // A part with none yet (too small for two on a side): the middle of its longest side.
  const plain = order.map((i) => sides[i]!);
  if (!centers.length) {
    const s = plain[0] ?? [...sides].filter(fits).sort((p, q) => q.span - p.span)[0]!;
    centers.push(s.from + (s.spots ? [...s.spots].sort((p, q) => Math.abs(p - s.length / 2) - Math.abs(q - s.length / 2))[0]! : s.length / 2));
  }
  // And a part is held in three places at the least, where it has room for them: the widest gap round the loop takes one more.
  const apart = tabLength * 1.5;
  for (let guard = 0; guard < 3 && sorted(centers).length < 3; guard++) {
    const at = sorted(centers);
    const gaps = at.map((c, i) => ({ a: c, length: mod(at[(i + 1) % at.length]! - c) || total })).sort((p, q) => q.length - p.length);
    let best: Mm | undefined;
    for (const gap of gaps) {
      const [lo, hi, mid] = [gap.a + apart, gap.a + gap.length - apart, gap.a + gap.length / 2];
      for (const r of plain) {
        for (const turn of [-total, 0, total]) {
          const [s0, e0] = [Math.max(lo, r.from + inFromEnd + turn), Math.min(hi, r.from + r.length - inFromEnd + turn)];
          if (s0 > e0 + EPS) continue;
          const c = Math.min(e0, Math.max(s0, mid));
          if (best === undefined || Math.abs(c - mid) < Math.abs(best - mid)) best = c;
        }
      }
      if (best !== undefined) break;
    }
    if (best === undefined) break;
    centers.push(best);
  }
  return sorted(centers);
}

/**
 * Follow a closed loop down in levels, ramping into each one. With tabs, the
 * passes that reach below the tab height climb over each tab. With `finish`, the
 * levels are roughing passes and one lap of the finish loop at full depth follows.
 */
export function contour(
  path: Path,
  loop: Point[],
  depth: Mm,
  f: Feeds,
  tabs?: Tabs,
  finish?: { loop: Point[]; tabs?: Tabs },
  past: Mm = 0,
): void {
  const length = perimeter(loop);
  path.moveTo(loop[0]!);
  path.cut({ z: 0 }, f.plunge);
  const levels = depthLevels(depth, f.depthPerPass, past);
  let zPrev = 0;
  levels.forEach((z, n) => {
    // Each level leaves its ramp-in sloped; the next level cuts it, and the last one levels it.
    const laps = rampedLaps(loop, zPrev, z, RAMP_SLOPE, n === levels.length - 1);
    cutSamples(path, tabs && z < tabs.topZ - EPS ? applyTabs(laps, length, tabs) : laps, f);
    zPrev = z;
  });
  if (finish && levels.length > 0) {
    // Loops start at a corner and tabs are never at corners, so this move is at full depth.
    path.cut(finish.loop[0]!, f.feed);
    const lap = rampedLaps(finish.loop, zPrev, zPrev, RAMP_SLOPE, false);
    cutSamples(path, finish.tabs ? applyTabs(lap, perimeter(finish.loop), finish.tabs) : lap, f);
  }
  path.retract();
}

/**
 * Relief in an inside corner so a square part seats in it: from where the bit already
 * stands in the corner, straight toward the corner until its edge reaches it, and back.
 * `inward` points from the corner into the recess, which is already cleared.
 */
export function dogBone(path: Path, corner: Point, inward: { x: 1 | -1; y: 1 | -1 }, toolDiameter: Mm, depth: Mm, f: Feeds, past: Mm = 0): void {
  const r = toolDiameter / 2;
  const k = r / Math.SQRT2;
  const start = { x: corner.x + inward.x * r, y: corner.y + inward.y * r };
  const end = { x: corner.x + inward.x * k, y: corner.y + inward.y * k };
  path.moveTo(start);
  path.cut({ z: 0 }, f.plunge);
  for (const z of depthLevels(depth, f.depthPerPass, past)) {
    // The start is in cleared space, so going down here cuts nothing.
    path.cut({ z }, f.plunge);
    path.cut(end, f.feed);
    path.cut(start, f.feed);
  }
  path.retract();
}

/**
 * An outline's square inside corners (its sides along X and Y), each with the way out of
 * the part diagonally (`inward` for `dogBone`: into the cleared space beside it). Other
 * corners are left out.
 */
export function outlineInsideCorners(outline: Point[]): { corner: Point; inward: { x: 1 | -1; y: 1 | -1 } }[] {
  const area = outline.reduce((sum, p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const ccw = area > 0 ? outline : [...outline].reverse();
  const n = ccw.length;
  const out: { corner: Point; inward: { x: 1 | -1; y: 1 | -1 } }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ccw[(i + n - 1) % n]!;
    const p = ccw[i]!;
    const b = ccw[(i + 1) % n]!;
    const d1 = { x: p.x - a.x, y: p.y - a.y };
    const d2 = { x: b.x - p.x, y: b.y - p.y };
    // Counter-clockwise, a right turn is an inside corner; square only, one side along X and one along Y.
    if (d1.x * d2.y - d1.y * d2.x >= -1e-9) continue;
    const square = (Math.abs(d1.x) < 1e-6) !== (Math.abs(d1.y) < 1e-6) && (Math.abs(d2.x) < 1e-6) !== (Math.abs(d2.y) < 1e-6) && Math.abs(d1.x * d2.x + d1.y * d2.y) < 1e-6;
    if (!square) continue;
    // Out of the part: back along the side coming in, and on along the side going out.
    const sx = Math.sign(d2.x - d1.x);
    const sy = Math.sign(d2.y - d1.y);
    if (sx === 0 || sy === 0) continue;
    out.push({ corner: p, inward: { x: sx as 1 | -1, y: sy as 1 | -1 } });
  }
  return out;
}

/**
 * The path a bit's centre takes around the outside of an outline (a case side with its
 * toe-kick notch; a wooden handle's curve, as short flats), climb cutting. An inside
 * corner of the outline keeps the bit's radius.
 */
export function outsidePath(outline: Point[], offset: Mm): Point[] {
  const area = outline.reduce((sum, p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const ccw = area > 0 ? outline : [...outline].reverse();
  const n = ccw.length;
  /** Outward normal of the side that leaves corner i. */
  const normal = (i: number): Point => {
    const a = ccw[i]!;
    const b = ccw[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    return { x: dy / length, y: -dx / length };
  };
  const moved = ccw.map((p, i) => {
    const before = normal((i + n - 1) % n);
    const after = normal(i);
    // Mitred: where the two sides meet square this is the sum of their normals; where they
    // meet at another angle (a curve made of short flats: a wooden handle) the corner is
    // still the offset away from both. A very sharp corner is not run out to its point.
    const k = offset / Math.max(0.25, 1 + before.x * after.x + before.y * after.y);
    return { x: p.x + k * (before.x + after.x), y: p.y + k * (before.y + after.y) };
  });
  // Clockwise, from the first corner.
  return [moved[0]!, ...moved.slice(1).reverse()];
}

/** How far above the face the pocket-hole lines start and end. */
const POCKET_TOP_CLEAR: Mm = 0.5;

/**
 * The open part of one pocket hole, cut with a ball nose bit (untested). `exit` is where
 * the screw's axis leaves the part's edge and `inward` the unit vector into the part.
 *
 * Roughing: level by level, straight lines along the pocket from the seat to where the
 * ramped floor comes up through that level, ramping into each level along its first line.
 * Finishing: the ball's centre follows lines parallel to the axis round the lower half of
 * the bore, there and back, which leaves the round floor and the rounded foot of the seat;
 * then passes across the seat above the axis, stepping up its slope, so the whole seat is
 * square to the axis. Nothing is cut past the seat: the pilot is drilled from the part's
 * edge and comes out through it (a dimple that marked where a pilot drilled from the pocket
 * started was taken out: it only cut a slot in the seat).
 */
export function pocketChannel(path: Path, exit: Point, inward: Point, shape: PocketShape, f: Feeds): void {
  const { r, orbit, sin, cos, end, thickness } = shape;
  /** A ball centre in the pocket's own frame as the tip's position on the machine. */
  const tip = (c: BallCentre) => ({
    x: exit.x + inward.x * c.u - inward.y * c.y,
    y: exit.y + inward.y * c.u + inward.x * c.y,
    z: c.z - r,
  });

  // Roughing.
  const allow = Math.min(POCKET.roughAllowance, orbit / 2);
  const reach = orbit - allow;
  const half = (y: Mm) => Math.sqrt(Math.max(0, reach * reach - y * y));
  /**
   * The seat end of a roughing line with the ball's centre at height `zc`: on the seat's slope, which
   * leans back toward the edge as it rises, and no further in than where the floor meets the seat.
   */
  const seatEnd = (y: Mm, zc: Mm) => Math.min(end * cos + half(y) * sin, seatAt(shape, zc)) + allow;
  /** The open end at a level: where the floor, still wearing its allowance, comes up through it. */
  const openEnd = (y: Mm, zc: Mm) => ((zc - allow + thickness / 2 + half(y) / cos) * cos) / sin;
  const steps = Math.max(1, Math.ceil(reach / r - 1e-9));
  const ys = reach > EPS ? Array.from({ length: 2 * steps + 1 }, (_, i) => -reach + (reach * i) / steps) : [0];

  let zPrev = 0;
  let at: Mm | undefined; // the line the bit stands on, at its seat end
  let forward = true;
  for (const z of depthLevels(shape.depth - allow, f.depthPerPass)) {
    const zc = z + r;
    const lines = ys.filter((y) => openEnd(y, zc) - seatEnd(y, zc) > 0.5);
    if (lines.length === 0) break;
    if (!forward) lines.reverse();
    forward = !forward;
    const seat = (y: Mm, level: Mm) => tip({ u: seatEnd(y, level + r), y, z: level + r });
    const open = (y: Mm) => tip({ u: openEnd(y, zc), y, z: zc });
    const first = lines[0]!;
    if (at === undefined) {
      path.moveTo(seat(first, 0));
      path.cut({ z: 0 }, f.plunge);
    } else {
      // Along the seat end of the level above, line by line, so the seat is never cut into.
      const between = ys.filter((y) => (y - at!) * (y - first) < -EPS);
      if (first < at) between.reverse();
      for (const y of [...between, first]) path.cut(seat(y, zPrev), f.feed);
    }
    // Down into the level along its first line, then back along it level. The ramp is shallow (a level's
    // depth over the length of the line), so it runs as fast as keeps its downward speed within the plunge
    // feed: at the cutting feed, but for the short lines of the last levels.
    const from = seat(first, zPrev);
    const to = open(first);
    const run = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const drop = Math.abs(to.z - from.z);
    path.cut(to, drop > EPS ? Math.min(f.feed, (f.plunge * run) / drop) : f.feed);
    path.cut(seat(first, z), f.feed);
    let atSeat = true;
    for (const y of lines.slice(1)) {
      path.cut(atSeat ? seat(y, z) : open(y), f.feed);
      path.cut(atSeat ? open(y) : seat(y, z), f.feed);
      atSeat = !atSeat;
    }
    at = lines.at(-1)!;
    if (!atSeat) path.cut(seat(at, z), f.feed);
    zPrev = z;
  }
  if (at !== undefined) path.retract();

  // Finishing: the roughing has cleared the way, so these light cuts run at the cutting feed both ways.
  // The lines are close enough to leave ridges no taller than `floorRidge`: a ball of radius r
  // in a bore of radius R leaves a ridge of about s^2 / 8 * (1/r - 1/R) between lines s apart.
  const R = orbit + r;
  const apart = orbit > EPS ? (Math.sqrt((8 * POCKET.floorRidge) / (1 / r - 1 / R)) * orbit) / R : r;
  const step = Math.min(f.stepover > EPS ? f.stepover : r, apart);
  // An even number of gaps, so one line runs along the very bottom of the bore.
  const n = 2 * Math.max(1, Math.ceil((Math.PI * orbit) / step / 2 - 1e-9));
  const thetas = Array.from({ length: n + 1 }, (_, k) => -Math.PI / 2 + (Math.PI * k) / n);
  const top = (theta: number) => tip(onLine(shape, lineAt(shape, theta, POCKET_TOP_CLEAR), theta));
  const bottom = (theta: number) => tip(onLine(shape, end, theta));
  path.moveTo(top(thetas[0]!));
  path.cut({ z: POCKET_TOP_CLEAR }, f.plunge);
  thetas.forEach((theta, k) => {
    const down = k % 2 === 0;
    if (k > 0) path.cut(down ? top(theta) : bottom(theta), f.feed);
    path.cut(down ? bottom(theta) : top(theta), f.feed);
  });

  // The seat. The lines are odd in number, so the last one ends at the seat, level with the axis, at the
  // far wall. From there the ball goes across the seat and back, a step up its slope each time, to the top
  // of the bore: square to the axis all the way up. On a flat surface lines s apart leave a ridge of about
  // s^2 / 8r. It lifts out from the top of the seat, which leans away from it as it rises.
  let side = 1;
  const passes = Math.max(1, Math.ceil(R / Math.min(step, Math.sqrt(8 * POCKET.ridge * r)) - 1e-9));
  for (let k = 1; k <= passes; k++) {
    const up = (R * k) / passes;
    path.cut(tip(onSeat(shape, up, side * orbit)), f.feed);
    path.cut(tip(onSeat(shape, up, -side * orbit)), f.feed);
    side = -side;
  }
  path.retract();
}

/**
 * The open part of one pocket hole, cut with a flat end mill (untested; `SlotShape`). `exit` is where the
 * screw's axis leaves the part's edge and `inward` the unit vector into the part.
 *
 * With `ledge`, first the ledge round the opening for a printed cover: a shallow rectangle, cleared in
 * lines and then gone round. Roughing: level by level, lines along the slot from where the bit's far edge
 * meets the floor's slope, in to a little short of the seat, ramping into each level along its first line.
 * The floor: down the slope and back up it, line beside line, the bit's far edge on the bore's own floor,
 * which takes off the steps the levels leave. The seat: across it and back with the bit's side against it,
 * a small step down its slope each time; its last steps take the floor down to the seat's foot, level for
 * the bit's width.
 */
/**
 * The ledge round a pocket's opening for a printed cover, cut with a flat end mill (`POCKET.ledge`). It is a
 * band narrower than the bit: once round its edge at each depth cuts it, the bit's inner side over the
 * pocket. (Clearing the whole rectangle, as it first did, cut away what the pocket takes anyway.) It ramps
 * down along one side, then goes right round, level.
 *
 * `open`: the ledge's rectangle (`slotLedge`, `arcLedge`); `r`: the bit's radius.
 *
 * `fill`: round a pocket the ball nose cuts, or a low-angle one. Near its open end that pocket is shallower than
 * the ledge, so the end of the rectangle is cleared level too; a 15 degree flat end mill's own pocket does that as
 * it is cut.
 */
export function pocketLedge(path: Path, exit: Point, inward: Point, open: LedgeOpening, r: Mm, f: Feeds, fill = false): void {
  const at = (u: Mm, y: Mm, z: Mm) => ({ x: exit.x + inward.x * u - inward.y * y, y: exit.y + inward.y * u + inward.x * y, z });
  const [u0, u1, half] = [open.u0 + r, open.u1 - r, open.half - r];
  const corners: [Mm, Mm][] = [[u0, half], [u0, -half], [u1, -half], [u1, half]];
  const corner = (i: number, z: Mm) => at(corners[i % 4]![0], corners[i % 4]![1], z);
  // Where the pocket's floor is as deep as the ledge: from there to the ledge's end is cleared when it is filled.
  const from = Math.max(u0, open.fillFrom - 2 * r);
  const n = Math.max(1, Math.ceil((2 * half) / r - 1e-9));
  path.moveTo(corner(0, 0));
  path.cut({ z: 0 }, f.plunge);
  let zWas = 0;
  let i = 0;
  for (const z of depthLevels(POCKET.ledge.depth, f.depthPerPass)) {
    const start = corner(i, zWas);
    const end = corner(i + 1, z);
    const run = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    path.cut(end, Math.min(f.feed, (f.plunge * run) / Math.max(EPS, Math.abs(end.z - start.z))));
    for (let k = 2; k <= 5; k++) path.cut(corner(i + k, z), f.feed);
    if (fill) {
      // Lines across the end, between the two long sides the bit has just been along.
      const back = corner(i + 5, z);
      path.cut(at(u1, half, z), f.feed);
      for (let k = 1; k < n; k++) {
        const y = half - (2 * half * k) / n;
        path.cut(at(k % 2 ? u1 : from, y, z), f.feed);
        path.cut(at(k % 2 ? from : u1, y, z), f.feed);
      }
      path.cut(back, f.feed);
    }
    i += 1;
    zWas = z;
  }
  path.retract();
}

/**
 * A pocket hole's screw channel, cut open from the face in place of the pilot drilled from the edge: as wide as that
 * pilot (`POCKET.drill`), its walls upright up to the face, its floor along the underside of the screw, which leaves
 * the edge at mid-thickness and climbs at `angleDeg`. It runs from outside the edge (`exit`, along `inward`) to just
 * past the seat (`seat`, along the screw), into the pocket, so the screw lies in it the whole way. A bit narrower than
 * the pilot cuts it in two passes side by side, one to each wall.
 *
 * It is one cut, the bit staying down: each level runs level from outside the edge to where it meets the floor, then
 * up the floor as far as the level above left it (the rest of the floor is already cut). With two passes a level goes
 * in along one wall and back along the other, and steps down outside the edge; with one, the levels go in and back by
 * turns, a level that comes back ramping down the floor into its depth.
 */
export function screwChannel(path: Path, exit: Point, inward: Point, channel: { thickness: Mm; angleDeg: number; seat: Mm }, r: Mm, f: Feeds): void {
  const at = (u: Mm, y: Mm, z: Mm) => ({ x: exit.x + inward.x * u - inward.y * y, y: exit.y + inward.y * u + inward.x * y, z });
  const tan = Math.tan((channel.angleDeg * Math.PI) / 180);
  const half = POCKET.drill / 2;
  /** The floor below the face, `u` in from the edge: under the screw's axis by half the pilot; level outside the edge, never deeper than at it. */
  const floor = (u: Mm) => -(channel.thickness / 2 - Math.max(0, u) * tan + half);
  // From clear of the edge to past the seat, the bit's own radius into the pocket.
  const [u0, u1] = [-(r + 1), channel.seat * Math.cos((channel.angleDeg * Math.PI) / 180) + r + half];
  const sides = 2 * r < POCKET.drill - EPS ? [-(half - r), half - r] : [0];
  /** Where a level meets the floor's slope. */
  const meets = (z: Mm) => Math.min(u1, Math.max(u0, (channel.thickness / 2 + half + z) / tan));
  type Spot = { u: Mm; y: Mm; z: Mm };
  /** One level along one wall, inward: level to the floor, then up it to where the level above came down to it. */
  const line = (y: Mm, z: Mm, zAbove: Mm): Spot[] => {
    const top = meets(zAbove);
    const spots = [{ u: u0, y, z }, { u: meets(z), y, z }, { u: top, y, z: Math.max(z, floor(top)) }];
    return spots.filter((s, i) => i === 0 || Math.hypot(s.u - spots[i - 1]!.u, s.z - spots[i - 1]!.z) > EPS);
  };
  const passes: Spot[][] = [];
  let zAbove = 0;
  depthLevels(-floor(u0), f.depthPerPass).forEach((z, k) => {
    if (sides.length === 2) {
      const [a, b] = k % 2 ? [sides[1]!, sides[0]!] : [sides[0]!, sides[1]!];
      passes.push(line(a, z, zAbove), line(b, z, zAbove).reverse());
    } else {
      passes.push(k % 2 ? line(0, z, zAbove).reverse() : line(0, z, zAbove));
    }
    zAbove = z;
  });
  const first = passes[0]![0]!;
  path.moveTo(at(first.u, first.y, 0));
  path.cut({ z: 0 }, f.plunge);
  let here: Spot = { ...first, z: 0 };
  for (const spot of passes.flat()) {
    // A move down goes as fast as keeps its downward speed within the plunge feed.
    const run = Math.hypot(spot.u - here.u, spot.y - here.y, spot.z - here.z);
    const drop = here.z - spot.z;
    if (run > EPS) path.cut(at(spot.u, spot.y, spot.z), drop > EPS ? Math.min(f.feed, (f.plunge * run) / drop) : f.feed);
    here = spot;
  }
  path.retract();
}

export function pocketSlot(path: Path, exit: Point, inward: Point, slot: SlotShape, f: Feeds, ledge = false): void {
  const { r, reach, depth } = slot;
  const at = (u: Mm, y: Mm, z: Mm) => ({ x: exit.x + inward.x * u - inward.y * y, y: exit.y + inward.y * u + inward.x * y, z });
  /** A move down and along at once goes as fast as keeps its downward speed within the plunge feed. */
  const ramp = (from: { x: Mm; y: Mm; z: Mm }, to: { x: Mm; y: Mm; z: Mm }) => {
    const run = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const drop = Math.abs(to.z - from.z);
    path.cut(to, drop > EPS ? Math.min(f.feed, (f.plunge * run) / drop) : f.feed);
  };
  /** Lines `apart` or closer, from one wall to the other. */
  const lines = (apart: Mm) => {
    const n = reach > EPS ? Math.max(1, Math.ceil((2 * reach) / apart - 1e-9)) : 0;
    return n ? Array.from({ length: n + 1 }, (_, i) => -reach + (2 * reach * i) / n) : [0];
  };
  const open = slotOpening(slot, ledge);
  const ledgeDeep = ledge ? POCKET.ledge.depth : 0;
  /** With a ledge: how far out the bit's centre goes at the ledge's depth, to the ledge's far end. */
  const ledgeEnd = open.u1 - r;

  if (ledge) pocketLedge(path, exit, inward, slotLedge(slot), r, f);

  // Roughing: each level out to where the bit's far edge would meet the floor's slope, and no further. Its
  // lines are half the bit apart, as the ball's are.
  const allow = POCKET.roughAllowance;
  const ys = lines(r);
  const slopeEnd = slotSlopeEnd(slot);
  let zPrev = 0;
  let started = false;
  let forward = true;
  for (const z of depthLevels(depth, f.depthPerPass)) {
    // The slope's passes and the seat's take what is under the slope's end.
    if (z < slopeEnd + allow) break;
    const start = slotSeatAt(slot, z) + r + allow;
    // The bit's far edge stays `allow` above the floor's slope; above a ledge's floor it goes on to the ledge's end.
    const far = ledge && z > -ledgeDeep + EPS ? ledgeEnd : slotOpenAt(slot, z - allow) - r;
    if (far - start < 0.5) break;
    const across = forward ? ys : [...ys].reverse();
    forward = !forward;
    const first = across[0]!;
    if (!started) {
      path.moveTo(at(far, first, 0));
      path.cut({ z: 0 }, f.plunge);
      started = true;
    } else {
      // Over the level above, which reaches further out than this one.
      path.cut(at(far, first, zPrev), f.feed);
    }
    // Down into the level along its first line toward the seat, then back out along it level.
    ramp(at(far, first, zPrev), at(start, first, z));
    path.cut(at(far, first, z), f.feed);
    let out = true;
    for (const y of across.slice(1)) {
      path.cut(at(out ? far : start, y, z), f.feed);
      path.cut(at(out ? start : far, y, z), f.feed);
      out = !out;
    }
    zPrev = z;
  }
  if (started) path.retract();

  // The floor: down the slope and back, the bit's far edge on the bore's own floor. A flat bit leaves no
  // cusps between its lines, only a low ridge from the slope: they are as far apart as keeps that under
  // `floorRidge`, and never quite the bit's width. Going down, a run along the slope keeps its downward
  // speed within the plunge feed; coming up it runs at the cutting feed.
  const tan = slot.sin / slot.cos;
  const rise = Math.min(r, POCKET.floorRidge / tan);
  const apart = Math.min(1.9 * r, 2 * Math.sqrt(Math.max(0, r * r - (r - rise) * (r - rise))));
  const onSlope = (u: Mm, y: Mm) => at(u, y, slotFloorAt(slot, u + r));
  // Its upper end: clear above the face, or with a ledge level at the ledge's floor out to the ledge's end.
  const knee = slotOpenAt(slot, ledge ? -ledgeDeep : POCKET_TOP_CLEAR) - r;
  const top = (y: Mm) => (ledge ? at(ledgeEnd, y, -ledgeDeep) : onSlope(knee, y));
  // Its lower end: the bit's side `allow` short of the seat, at the height the slope has there.
  const bottom = slotSeatAt(slot, slopeEnd) + r + allow;
  const slope = lines(apart);
  path.moveTo(top(slope[0]!));
  path.cut({ z: ledge ? -ledgeDeep : POCKET_TOP_CLEAR }, f.plunge);
  slope.forEach((y, k) => {
    const down = k % 2 === 0;
    if (k > 0) path.cut(down ? top(y) : onSlope(bottom, y), f.feed);
    if (down) {
      if (ledge) path.cut(onSlope(knee, y), f.feed);
      ramp(onSlope(knee, y), onSlope(bottom, y));
    } else {
      path.cut(onSlope(knee, y), f.feed);
      if (ledge) path.cut(top(y), f.feed);
    }
  });
  path.retract();

  // The seat: the bit's side against it at the bit's own depth, a step down its slope each time. Each step
  // stands no more than `ridge` proud of the slope. It starts in the middle, where the roughing has been.
  const steps = Math.max(1, Math.ceil((depth * tan) / POCKET.ridge - 1e-9));
  let side = 1;
  for (let j = 1; j <= steps; j++) {
    const z = -(depth * j) / steps;
    const u = slotSeatAt(slot, z) + r;
    if (j === 1) {
      path.moveTo(at(u, 0, 0));
      path.cut({ z }, f.plunge);
      path.cut(at(u, reach, z), f.feed);
    } else {
      path.cut(at(u, side * reach, z), f.plunge);
    }
    path.cut(at(u, -side * reach, z), f.feed);
    side = -side;
  }
  path.retract();
}

/** How far apart along the pocket the points of a low-angle pocket's arc are. */
const ARC_STEP: Mm = 1;

/**
 * The open part of one low-angle pocket hole, cut with a flat end mill (untested; `ArcShape`). `exit` is
 * where the screw's axis leaves the part's edge and `inward` the unit direction into the part.
 *
 * Roughing: level by level, lines from where the floor's arc comes up to the level to just short of the
 * seat, the bit's far edge kept an allowance above the arc. The floor: down the arc and back, line by line
 * across the slot, the bit's far edge on the arc itself. The seat: the bit's side against it, a step down
 * its slope each time, as the 15 degree slot's is; the last step leaves the floor level at the seat's foot.
 */
export function pocketArc(path: Path, exit: Point, inward: Point, shape: ArcShape, f: Feeds): void {
  const { r, reach, depth } = shape;
  const at = (u: Mm, y: Mm, z: Mm) => ({ x: exit.x + inward.x * u - inward.y * y, y: exit.y + inward.y * u + inward.x * y, z });
  const ramp = (from: { x: Mm; y: Mm; z: Mm }, to: { x: Mm; y: Mm; z: Mm }) => {
    const run = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const drop = Math.abs(to.z - from.z);
    path.cut(to, drop > EPS ? Math.min(f.feed, (f.plunge * run) / drop) : f.feed);
  };
  const lines = (apart: Mm) => {
    const n = reach > EPS ? Math.max(1, Math.ceil((2 * reach) / apart - 1e-9)) : 0;
    return n ? Array.from({ length: n + 1 }, (_, i) => -reach + (2 * reach * i) / n) : [0];
  };
  const allow = POCKET.roughAllowance;
  /** The lowest the bit's bottom may be with its centre `u` in from the edge: its far edge on the arc. */
  const floor = (u: Mm) => arcFloorAt(shape, u + r);
  /** How far in the bit's centre is when its far edge meets the arc at height `z`. */
  const openAt = (z: Mm) => arcOpenAt(shape, z) - r;
  // Just short of the seat's foot, which is as far in as the seat comes at any height.
  const start = shape.foot + r + allow;

  // Roughing.
  const ys = lines(Math.max(r, f.stepover));
  let zPrev = 0;
  let started = false;
  let forward = true;
  for (const z of depthLevels(depth - allow, f.depthPerPass)) {
    const far = openAt(z - allow);
    if (far - start < 0.5) break;
    const across = forward ? ys : [...ys].reverse();
    forward = !forward;
    const first = across[0]!;
    if (!started) {
      path.moveTo(at(far, first, 0));
      path.cut({ z: 0 }, f.plunge);
      started = true;
    } else {
      path.cut(at(far, first, zPrev), f.feed);
    }
    ramp(at(far, first, zPrev), at(start, first, z));
    path.cut(at(far, first, z), f.feed);
    let out = true;
    for (const y of across.slice(1)) {
      path.cut(at(out ? far : start, y, z), f.feed);
      path.cut(at(out ? start : far, y, z), f.feed);
      out = !out;
    }
    zPrev = z;
  }
  if (started) path.retract();

  // The floor: down the arc and back along each line, in short straight moves.
  const top = openAt(0);
  const count = Math.max(2, Math.ceil((top - start) / ARC_STEP));
  const us = Array.from({ length: count + 1 }, (_, i) => top - ((top - start) * i) / count);
  const across = lines(Math.max(EPS, 1.9 * r));
  path.moveTo(at(top, across[0]!, POCKET_TOP_CLEAR));
  path.cut({ z: POCKET_TOP_CLEAR }, f.plunge);
  across.forEach((y, k) => {
    const down = k % 2 === 0;
    const order = down ? us : [...us].reverse();
    if (k > 0) path.cut(at(order[0]!, y, floor(order[0]!)), f.feed);
    let was = at(order[0]!, y, k > 0 ? floor(order[0]!) : POCKET_TOP_CLEAR);
    for (const u of order) {
      const to = at(u, y, floor(u));
      if (down) ramp(was, to);
      else path.cut(to, f.feed);
      was = to;
    }
  });
  path.retract();

  // The seat: the bit's side against it at the bit's own depth, a step down its slope each time.
  const tan = shape.sin / shape.cos;
  const steps = Math.max(1, Math.ceil((depth * tan) / POCKET.ridge - 1e-9));
  let side = 1;
  for (let j = 1; j <= steps; j++) {
    const z = -(depth * j) / steps;
    const u = arcSeatAt(shape, z) + r;
    if (j === 1) {
      path.moveTo(at(u, 0, 0));
      path.cut({ z }, f.plunge);
      if (reach > EPS) path.cut(at(u, reach, z), f.feed);
    } else {
      path.cut(at(u, side * reach, z), f.plunge);
    }
    if (reach > EPS) path.cut(at(u, -side * reach, z), f.feed);
    side = -side;
  }
  path.retract();
}

/** The path a bit's centre takes to cut around the outside of a rectangle (climb cutting). */
export function outsideLoop(outline: Rect, offset: Mm): Point[] {
  return rectCorners(insetRect(outline, -offset), 'cw');
}

/**
 * A groove along a line (`Feature` `slot`): `width` wide about `line`, an open run of points. A bit as wide as the
 * groove goes along the line, there at one level and back at the next; a narrower one goes round it, down one
 * side and back up the other, and along the middle too when the two sides leave a ridge. Returns false when the
 * bit is wider than the groove.
 */
export function slot(path: Path, line: Point[], width: Mm, toolDiameter: Mm, depth: Mm, f: Feeds, from: Mm = 0, depths?: Mm[]): boolean {
  if (toolDiameter > width + EPS || line.length < 2) return false;
  if (depths && depths.length === line.length) {
    // A depth of its own at each point (a ripple): the bit follows the line up and down, there at one level and back
    // at the next, each level that share of every point's depth below where it starts.
    const levels = depthLevels(depth - from, f.depthPerPass).length;
    const order = line.map((_, i) => i);
    path.moveTo(line[0]!);
    for (let k = 1; k <= levels; k++) {
      const z = (i: number) => -(from + (Math.max(depths[i]!, from) - from) * (k / levels));
      path.cut({ z: z(order[0]!) }, f.plunge);
      for (const i of order.slice(1)) path.cut({ x: line[i]!.x, y: line[i]!.y, z: z(i) }, f.feed);
      order.reverse();
    }
    path.retract();
    return true;
  }
  const side = (width - toolDiameter) / 2;
  /** The line moved `by` to its left: each point along the mean of its two segments' normals. */
  const moved = (by: Mm): Point[] =>
    line.map((p, i) => {
      const [a, b] = [line[Math.max(0, i - 1)]!, line[Math.min(line.length - 1, i + 1)]!];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: p.x - ((b.y - a.y) / len) * by, y: p.y + ((b.x - a.x) / len) * by };
    });
  const single = side < 0.05;
  const round = single ? line : [...moved(side), ...moved(-side).reverse()];
  const middle = !single && 2 * side > toolDiameter - EPS;
  path.moveTo(round[0]!);
  let forward = true;
  // `from`: it starts that far below the face (the floor of a panel already cut), and its levels are counted from there.
  for (const level of depthLevels(depth - from, f.depthPerPass)) {
    const z = level - from;
    path.cut({ z }, f.plunge);
    if (single) {
      for (const p of forward ? line.slice(1) : line.slice(0, -1).reverse()) path.cut(p, f.feed);
      forward = !forward;
    } else {
      for (const p of [...round.slice(1), round[0]!]) path.cut(p, f.feed);
      if (middle) {
        for (const p of line) path.cut(p, f.feed);
        path.cut(round[0]!, f.feed);
      }
    }
  }
  path.retract();
  return true;
}
