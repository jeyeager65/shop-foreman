/**
 * Recesses (dados, housings, rabbets, grooves) as rectangles: which sides have a wall,
 * and how far the cut runs past the ones that have none. Works in any one frame: the
 * part's own or the machine's, as long as every rectangle given is in the same one.
 */
import type { Mm, Point } from '@/model';
import type { Rect } from './rect';

const EPS = 1e-6;

/** The sides of a recess with no wall: the cut runs out through them. */
export interface OpenSides {
  x0: boolean;
  x1: boolean;
  y0: boolean;
  y1: boolean;
}

/** How far a bit's edge runs past an open side, so the side is cut clean. */
export const RUN_OUT: Mm = 1;

const covers = (a: Rect, b: Rect) => a.x0 <= b.x0 + EPS && a.x1 >= b.x1 - EPS && a.y0 <= b.y0 + EPS && a.y1 >= b.y1 - EPS;

/**
 * A side is open where it lies on the part's edge, or where another recess at least
 * as deep takes over along the whole of it (a housing that ends at the back's rabbet).
 */
export function openSides(rect: Rect, bounds: Rect, neighbours: { rect: Rect; depth: Mm }[], depth: Mm): OpenSides {
  const t = 0.01;
  const strips: Record<keyof OpenSides, Rect> = {
    x0: { x0: rect.x0 - t, x1: rect.x0, y0: rect.y0, y1: rect.y1 },
    x1: { x0: rect.x1, x1: rect.x1 + t, y0: rect.y0, y1: rect.y1 },
    y0: { x0: rect.x0, x1: rect.x1, y0: rect.y0 - t, y1: rect.y0 },
    y1: { x0: rect.x0, x1: rect.x1, y0: rect.y1, y1: rect.y1 + t },
  };
  const takenOver = (side: keyof OpenSides) => neighbours.some((n) => n.depth >= depth - EPS && covers(n.rect, strips[side]));
  return {
    x0: rect.x0 <= bounds.x0 + EPS || takenOver('x0'),
    x1: rect.x1 >= bounds.x1 - EPS || takenOver('x1'),
    y0: rect.y0 <= bounds.y0 + EPS || takenOver('y0'),
    y1: rect.y1 >= bounds.y1 - EPS || takenOver('y1'),
  };
}

/**
 * The widest bit that fits: the distance between two walls that face each other.
 * A recess with an open side that way (a rabbet) takes any bit.
 */
export function widestBit(rect: Rect, open: OpenSides): Mm {
  const across = open.x0 || open.x1 ? Infinity : rect.x1 - rect.x0;
  const along = open.y0 || open.y1 ? Infinity : rect.y1 - rect.y0;
  return Math.min(across, along);
}

/**
 * The floor to clear with a bit of this diameter: the recess, grown past each open
 * side until the bit's centre is clear of the edge, and until the bit fits at all
 * where the recess is narrower than the bit (a rabbet cut with a wide bit).
 */
export function floorToClear(rect: Rect, open: OpenSides, toolDiameter: Mm): Rect {
  const out = toolDiameter / 2 + RUN_OUT;
  const floor = {
    x0: rect.x0 - (open.x0 ? out : 0),
    x1: rect.x1 + (open.x1 ? out : 0),
    y0: rect.y0 - (open.y0 ? out : 0),
    y1: rect.y1 + (open.y1 ? out : 0),
  };
  const shortX = toolDiameter - (floor.x1 - floor.x0);
  if (shortX > 0) {
    if (open.x0 && open.x1) {
      floor.x0 -= shortX / 2;
      floor.x1 += shortX / 2;
    } else if (open.x0) floor.x0 -= shortX;
    else if (open.x1) floor.x1 += shortX;
  }
  const shortY = toolDiameter - (floor.y1 - floor.y0);
  if (shortY > 0) {
    if (open.y0 && open.y1) {
      floor.y0 -= shortY / 2;
      floor.y1 += shortY / 2;
    } else if (open.y0) floor.y0 -= shortY;
    else if (open.y1) floor.y1 += shortY;
  }
  return floor;
}

/** The inside corners: where two walls meet. `inward` points from the corner into the recess. */
export function insideCorners(rect: Rect, open: OpenSides): { corner: Point; inward: { x: 1 | -1; y: 1 | -1 } }[] {
  const found: { corner: Point; inward: { x: 1 | -1; y: 1 | -1 } }[] = [];
  for (const sx of ['x0', 'x1'] as const) {
    for (const sy of ['y0', 'y1'] as const) {
      if (open[sx] || open[sy]) continue;
      found.push({ corner: { x: rect[sx], y: rect[sy] }, inward: { x: sx === 'x0' ? 1 : -1, y: sy === 'y0' ? 1 : -1 } });
    }
  }
  return found;
}
