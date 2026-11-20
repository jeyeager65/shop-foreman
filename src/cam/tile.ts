/**
 * Tiling: a blank longer than the machine's cutting area along Y is cut in two
 * set-ups on the same face, the sheet slid along Y between them and found again on
 * pins. Each set-up cuts a band of the blank. The toolpaths are made for the whole
 * blank as ever; here they are cut down to one band, and moved by the slide.
 *
 * A cut that crosses the edge of the band is stopped there: the bit lifts, and where
 * the path comes back into the band it goes down again at the plunge feed. The two
 * bands overlap a little, so the bit comes down into what the other set-up has cut, or
 * cuts on into it.
 */
import type { Mm, ToolpathStep } from '@/model';

const EPS = 1e-6;
/** An arc that crosses the edge of the band is cut as short straight moves, this many degrees each. */
const ARC_STEP_DEG = 5;

type Position = { x: Mm; y: Mm; z: Mm };

/** Whether the steps cut anything: a pass with only travel left is dropped. */
export const cutsSomething = (steps: ToolpathStep[]): boolean => steps.some((s) => s.kind === 'cut' || s.kind === 'arc');

/**
 * The steps with every cut outside `from`..`to` along Y left out. `safeZ` is where the
 * bit travels; `plunge` the feed it comes down at where a cut starts inside the band
 * that was begun outside it. Coordinates are the blank's.
 */
export function clipToBand(steps: ToolpathStep[], from: Mm, to: Mm, safeZ: Mm, plunge: number): ToolpathStep[] {
  const out: ToolpathStep[] = [];
  // Where the path has the bit, and whether the bit is really there. Before the
  // first move its place is not known: it is wherever the last pass left it.
  let pos: Position = { x: NaN, y: NaN, z: safeZ };
  let there = true;
  const inside = (y: Mm) => Number.isNaN(y) || (y >= from - EPS && y <= to + EPS);
  /** Up to where the bit travels, unless that was the last thing it did. */
  const lift = () => {
    const last = out.at(-1);
    if (!(last?.kind === 'rapid' && last.z === safeZ && last.x === undefined && last.y === undefined)) out.push({ kind: 'rapid', z: safeZ });
  };
  /** The path goes on outside the band: the bit lifts and waits. */
  const leave = () => {
    if (there) lift();
    there = false;
  };
  /** The path is back in the band at `pos`: the bit travels there and comes down. */
  const arrive = () => {
    if (there) return;
    lift();
    out.push({ kind: 'rapid', x: pos.x, y: pos.y });
    if (pos.z < safeZ - EPS) out.push(pos.z >= 0 ? { kind: 'rapid', z: pos.z } : { kind: 'cut', z: pos.z, feed: plunge });
    there = true;
  };
  const cutTo = (to1: Position, feed: number, original?: ToolpathStep) => {
    const p0 = pos;
    // The part of the move inside the band, as shares of its length.
    let [ta, tb] = [0, 1];
    if (!Number.isNaN(p0.y) && Math.abs(to1.y - p0.y) > EPS) {
      const at = (y: Mm) => (y - p0.y) / (to1.y - p0.y);
      const [t0, t1] = [at(from), at(to)].sort((a, b) => a - b) as [number, number];
      [ta, tb] = [Math.max(0, t0), Math.min(1, t1)];
    } else if (!inside(p0.y)) {
      [ta, tb] = [1, 0];
    }
    if (tb - ta < EPS) {
      pos = to1;
      // A move that only touches the edge of the band from outside cuts nothing here.
      if (!inside(to1.y) || !there) leave();
      return;
    }
    const point = (t: number): Position => ({ x: p0.x + (to1.x - p0.x) * t, y: p0.y + (to1.y - p0.y) * t, z: p0.z + (to1.z - p0.z) * t });
    if (ta > EPS) {
      pos = point(ta);
      there = false;
    }
    arrive();
    const end = tb < 1 - EPS ? point(tb) : to1;
    out.push(original && ta <= EPS && tb >= 1 - EPS ? original : { kind: 'cut', x: end.x, y: end.y, z: end.z, feed });
    pos = to1;
    if (tb < 1 - EPS) leave();
  };

  for (const step of steps) {
    if (step.kind === 'rapid') {
      const next = { x: step.x ?? pos.x, y: step.y ?? pos.y, z: step.z ?? pos.z };
      const wasThere = there;
      pos = next;
      if (!inside(next.y)) leave();
      else if (wasThere) out.push(step);
      else arrive();
    } else if (step.kind === 'cut') {
      cutTo({ x: step.x ?? pos.x, y: step.y ?? pos.y, z: step.z ?? pos.z }, step.feed, step);
    } else if (step.kind === 'arc') {
      const start = pos;
      const centre = { x: start.x + step.i, y: start.y + step.j };
      const r = Math.hypot(step.i, step.j);
      const end = { x: step.x, y: step.y, z: step.z ?? start.z };
      if (Number.isNaN(start.y) || (centre.y - r >= from - EPS && centre.y + r <= to + EPS)) {
        // The whole arc is in the band.
        arrive();
        out.push(step);
        pos = end;
      } else if (centre.y + r < from - EPS || centre.y - r > to + EPS) {
        pos = end;
        leave();
      } else {
        const a0 = Math.atan2(start.y - centre.y, start.x - centre.x);
        let sweep = Math.atan2(end.y - centre.y, end.x - centre.x) - a0;
        if (step.dir === 'ccw' && sweep <= EPS) sweep += 2 * Math.PI;
        if (step.dir === 'cw' && sweep >= -EPS) sweep -= 2 * Math.PI;
        const n = Math.max(1, Math.ceil(Math.abs(sweep) / ((ARC_STEP_DEG * Math.PI) / 180)));
        for (let k = 1; k <= n; k++) {
          const a = a0 + (sweep * k) / n;
          cutTo(k === n ? end : { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a), z: start.z + ((end.z - start.z) * k) / n }, step.feed);
        }
      }
    } else {
      out.push(step);
    }
  }
  return out;
}

/** The steps moved along Y: the sheet has been slid, so what was at `y` on the blank is at `y + by` on the machine. */
export function shiftY(steps: ToolpathStep[], by: Mm): ToolpathStep[] {
  return steps.map((step) => ((step.kind === 'rapid' || step.kind === 'cut') && step.y !== undefined ? { ...step, y: step.y + by } : step.kind === 'arc' ? { ...step, y: step.y + by } : step));
}
