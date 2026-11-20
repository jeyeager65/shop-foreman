/**
 * Finger pulls cut on the CNC, for the fronts of a shop-style cabinet: a hand-hold
 * notch in the top edge of a drawer front, and a finger hole through a door near
 * the edge it opens at. The other choice is a pull fitted by hand, which cuts nothing.
 */
import type { Feature, Mm, Polygon } from '@/model';
import { MM_PER_INCH } from '@/units';

/** The hand-hold notch in the top edge of a drawer front, centred. Tune me. */
export const FINGER_NOTCH = { width: 4 * MM_PER_INCH, depth: MM_PER_INCH };
/** The least a drawer front keeps beside the notch and under it. Tune me. */
export const FINGER_NOTCH_MARGIN = { beside: 2 * MM_PER_INCH, under: MM_PER_INCH };
/**
 * The finger hole through a door: its diameter, and its centre from the edge the
 * door opens at and from the door's top. Tune me.
 */
export const FINGER_HOLE = { diameter: 1.25 * MM_PER_INCH, fromEdge: 1.5 * MM_PER_INCH, fromTop: 2 * MM_PER_INCH };

/**
 * The outline of a drawer front with the notch in its top edge. The notch's inside
 * corners are square here; the bit that cuts the outline leaves its own radius in them.
 */
export function fingerNotchOutline(width: Mm, height: Mm): Polygon {
  const n = FINGER_NOTCH;
  if (width < n.width + 2 * FINGER_NOTCH_MARGIN.beside - 1e-6) throw new Error('The drawer front is too narrow for a finger pull.');
  if (height < n.depth + FINGER_NOTCH_MARGIN.under - 1e-6) throw new Error('The drawer front is too low for a finger pull.');
  const x0 = (width - n.width) / 2;
  const x1 = x0 + n.width;
  const floor = height - n.depth;
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: x1, y: height },
    { x: x1, y: floor },
    { x: x0, y: floor },
    { x: x0, y: height },
    { x: 0, y: height },
  ];
}

/**
 * The finger hole of a door hinged on `hingeSide`: through the door, near its top, at
 * the edge away from the hinges. Bored from the back (face B) with the hinge cups, so
 * the door is not flipped for it and its show face lies on the spoilboard.
 */
export function fingerHole(size: { width: Mm; height: Mm; thickness: Mm }, hingeSide: 'left' | 'right'): Feature {
  const h = FINGER_HOLE;
  if (size.width < 2 * h.fromEdge + h.diameter || size.height < 2 * h.fromTop) throw new Error('The door is too small for a finger hole.');
  const x = hingeSide === 'left' ? size.width - h.fromEdge : h.fromEdge;
  return { id: 'finger-pull', kind: 'hole', face: 'B', center: { x, y: size.height - h.fromTop }, diameter: h.diameter, depth: size.thickness };
}
