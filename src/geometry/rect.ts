import type { Mm, Point, Polygon } from '@/model';

/** Axis-aligned rectangle. */
export interface Rect {
  x0: Mm;
  y0: Mm;
  x1: Mm;
  y1: Mm;
}

const EPS = 1e-6;

/**
 * The polygon as a rectangle, or null if it isn't an axis-aligned one.
 * Milestone 1 parts are all rectangles; general outlines need Manifold's 2D offsets.
 */
export function asRect(polygon: Polygon): Rect | null {
  if (polygon.length !== 4) return null;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const onCorner = (p: Point) =>
    (Math.abs(p.x - r.x0) < EPS || Math.abs(p.x - r.x1) < EPS) &&
    (Math.abs(p.y - r.y0) < EPS || Math.abs(p.y - r.y1) < EPS);
  const distinct = new Set(polygon.map((p) => `${p.x < (r.x0 + r.x1) / 2}/${p.y < (r.y0 + r.y1) / 2}`));
  return polygon.every(onCorner) && distinct.size === 4 ? r : null;
}

export function mustBeRect(polygon: Polygon): Rect {
  const r = asRect(polygon);
  if (!r) throw new Error('Only rectangular outlines are supported so far.');
  return r;
}

/** Shrink by `d` on every side (negative grows). Width or height may go negative. */
export function insetRect(r: Rect, d: Mm): Rect {
  return { x0: r.x0 + d, y0: r.y0 + d, x1: r.x1 - d, y1: r.y1 - d };
}

export const rectWidth = (r: Rect) => r.x1 - r.x0;
export const rectHeight = (r: Rect) => r.y1 - r.y0;

/** Corners, starting front-left. */
export function rectCorners(r: Rect, direction: 'ccw' | 'cw'): Point[] {
  const ccw = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  return direction === 'ccw' ? ccw : [ccw[0]!, ccw[3]!, ccw[2]!, ccw[1]!];
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
}
