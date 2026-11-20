import type { Mm, Point, ToolpathStep } from '@/model';

const EPS = 1e-9;

/** Feeds and step sizes for one bit in one material, already limited by the machine. */
export interface Feeds {
  feed: number;
  plunge: number;
  depthPerPass: Mm;
  stepover: Mm;
  /** Left on walls while roughing, then taken off in one full-depth pass. 0: no finishing pass. */
  finish: Mm;
}

/** Collects machine-neutral moves. Z0 is the top of the stock; cuts are negative Z. */
export class Path {
  readonly steps: ToolpathStep[] = [];

  constructor(readonly safeZ: Mm) {}

  rapid(to: { x?: Mm; y?: Mm; z?: Mm }): void {
    this.steps.push({ kind: 'rapid', ...to });
  }

  cut(to: { x?: Mm; y?: Mm; z?: Mm }, feed: number): void {
    this.steps.push({ kind: 'cut', ...to, feed });
  }

  retract(): void {
    this.rapid({ z: this.safeZ });
  }

  /** Lift to safe height, then travel. */
  moveTo(p: Point): void {
    this.retract();
    this.rapid({ x: p.x, y: p.y });
  }

  /** Counter-clockwise full circle starting and ending at (c.x + r, c.y), ending at zEnd. */
  circle(c: Point, r: Mm, zEnd: Mm, zMid: Mm, feed: number): void {
    this.steps.push({ kind: 'arc', dir: 'ccw', x: c.x - r, y: c.y, z: zMid, i: -r, j: 0, feed });
    this.steps.push({ kind: 'arc', dir: 'ccw', x: c.x + r, y: c.y, z: zEnd, i: r, j: 0, feed });
  }
}

/**
 * Z of each pass for a cut `total` deep: equal steps no deeper than `perPass`. `past`: a cut through the stock
 * goes that much further on its last pass (the machine's `throughExtra`), so it takes no pass more than before.
 */
export function depthLevels(total: Mm, perPass: Mm, past: Mm = 0): Mm[] {
  if (total <= EPS) return [];
  const n = Math.max(1, Math.ceil(total / perPass - 1e-6));
  return Array.from({ length: n }, (_, i) => -(total * (i + 1)) / n - (i === n - 1 ? past : 0));
}

export interface Sample extends Point {
  z: Mm;
  /** Distance travelled along the loop since its start, not wrapped. */
  u: Mm;
}

export function perimeter(loop: Point[]): Mm {
  return loop.reduce((sum, p, i) => {
    const q = loop[(i + 1) % loop.length]!;
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
}

/**
 * Laps of a closed loop from loop[0]: ramp down from zFrom to zTo at `slope`
 * (drop per distance) and complete that lap at zTo. The start of the lap is left
 * sloped; with `finish`, the path carries on over that stretch to level it.
 * Without a drop it is one flat lap.
 */
export function rampedLaps(loop: Point[], zFrom: Mm, zTo: Mm, slope: number, finish: boolean): Sample[] {
  const total = perimeter(loop);
  const start = loop[0]!;
  if (total <= EPS) return [{ ...start, z: zFrom, u: 0 }, { ...start, z: zTo, u: 0 }];
  const rampLength = Math.max(0, zFrom - zTo) / slope;
  const laps = rampLength > EPS ? Math.ceil(rampLength / total - 1e-9) : 1;
  const sloped = rampLength - (laps - 1) * total;
  const end = laps * total + (finish && rampLength > EPS ? Math.min(total, sloped) : 0);
  const zAt = (u: Mm) => Math.max(zTo, zFrom - slope * u);
  const samples: Sample[] = [{ ...start, z: zFrom, u: 0 }];
  let u = 0;
  while (u < end - EPS) {
    for (let i = 0; i < loop.length && u < end - EPS; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= EPS) continue;
      const at = (v: Mm): Sample => {
        const t = (v - u) / length;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: zAt(v), u: v };
      };
      if (rampLength > u + EPS && rampLength < u + length - EPS) samples.push(at(rampLength));
      if (end < u + length - EPS) {
        samples.push(at(end));
        u = end;
      } else {
        u += length;
        samples.push({ ...b, z: zAt(u), u });
      }
    }
  }
  return samples;
}

export interface Tabs {
  /** Position of each tab's centre along the loop. */
  centers: Mm[];
  /** Length of the path held at the tab height. */
  flat: Mm;
  /** Length of the slope at each end. */
  ramp: Mm;
  topZ: Mm;
  height: Mm;
}

/** Raise the samples over each tab: sloped up, flat, sloped down. Never deeper than the input. */
export function applyTabs(samples: Sample[], loopLength: Mm, tabs: Tabs): Sample[] {
  const outer = tabs.flat / 2 + tabs.ramp;
  const profile = (u: Mm): Mm => {
    const um = ((u % loopLength) + loopLength) % loopLength;
    let z = -Infinity;
    for (const c of tabs.centers) {
      const raw = Math.abs(um - c);
      const d = Math.min(raw, loopLength - raw);
      if (d <= tabs.flat / 2) z = Math.max(z, tabs.topZ);
      else if (d < outer) z = Math.max(z, tabs.topZ - (tabs.height * (d - tabs.flat / 2)) / tabs.ramp);
    }
    return z;
  };
  const breaks = tabs.centers.flatMap((c) => [c - outer, c - tabs.flat / 2, c + tabs.flat / 2, c + outer]);
  const out: Sample[] = [];
  samples.forEach((b, i) => {
    const a = samples[i - 1];
    if (a && b.u - a.u > EPS) {
      const cuts: Mm[] = [];
      const firstLap = Math.floor(a.u / loopLength) - 1;
      const lastLap = Math.floor(b.u / loopLength) + 1;
      for (let lap = firstLap; lap <= lastLap; lap++) {
        for (const bp of breaks) {
          const u = bp + lap * loopLength;
          if (u > a.u + EPS && u < b.u - EPS) cuts.push(u);
        }
      }
      cuts.sort((p, q) => p - q);
      for (const u of cuts) {
        const t = (u - a.u) / (b.u - a.u);
        const z = a.z + (b.z - a.z) * t;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: Math.max(z, profile(u)), u });
      }
    }
    out.push({ ...b, z: Math.max(b.z, profile(b.u)) });
  });
  return out;
}

/** Cut through the samples; moves that go down use the plunge feed. */
export function cutSamples(path: Path, samples: Sample[], f: Feeds): void {
  samples.forEach((s, i) => {
    const prev = samples[i - 1];
    if (!prev) return;
    if (Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z) <= EPS) return;
    path.cut({ x: s.x, y: s.y, z: s.z }, s.z < prev.z - EPS ? f.plunge : f.feed);
  });
}

/** Seconds to run the steps, and where they end. Unknown start axes cost nothing on the first move. */
export function runTime(
  steps: ToolpathStep[],
  rapidFeed: number,
  from: { x?: Mm; y?: Mm; z?: Mm } = {},
): { seconds: number; end: { x?: Mm; y?: Mm; z?: Mm } } {
  const pos = { ...from };
  let seconds = 0;
  for (const s of steps) {
    if (s.kind !== 'rapid' && s.kind !== 'cut' && s.kind !== 'arc') continue;
    const to = { x: s.x ?? pos.x, y: s.y ?? pos.y, z: s.z ?? pos.z };
    const d = (a?: Mm, b?: Mm) => (a === undefined || b === undefined ? 0 : b - a);
    let length: number;
    if (s.kind === 'arc') {
      const r = Math.hypot(s.i, s.j);
      const cx = (pos.x ?? 0) + s.i;
      const cy = (pos.y ?? 0) + s.j;
      const a0 = Math.atan2((pos.y ?? 0) - cy, (pos.x ?? 0) - cx);
      const a1 = Math.atan2(s.y - cy, s.x - cx);
      let sweep = s.dir === 'ccw' ? a1 - a0 : a0 - a1;
      if (sweep <= 1e-9) sweep += 2 * Math.PI;
      length = Math.hypot(r * sweep, d(pos.z, to.z));
    } else {
      length = Math.hypot(d(pos.x, to.x), d(pos.y, to.y), d(pos.z, to.z));
    }
    seconds += (length / (s.kind === 'rapid' ? rapidFeed : s.feed)) * 60;
    Object.assign(pos, to);
  }
  return { seconds, end: pos };
}
