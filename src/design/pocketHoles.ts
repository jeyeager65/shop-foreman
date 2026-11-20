/**
 * Where pocket-screw holes go. A pocket hole is a Design feature of the part it is
 * drilled in: which face, which edge the screw leaves through, and where along that
 * edge. How it is made (Kreg jig, or CNC-assisted) is Plan's choice.
 */
import type { Feature, Mm, PartEdge } from '@/model';
import { MM_PER_INCH } from '@/units';

/** From the end of a joint to its first pocket hole. Tune me. */
export const POCKET_END_INSET: Mm = 2 * MM_PER_INCH;
/** The most two neighbouring pocket holes are apart. Tune me. */
export const POCKET_MAX_SPACING: Mm = 8 * MM_PER_INCH;
/** A frame rail at least this wide takes two screws at each end; a narrower one takes one. Tune me. */
export const RAIL_TWO_SCREWS_FROM: Mm = MM_PER_INCH;

/**
 * Positions along a joint that runs from `from` to `to`: one hole inset from each
 * end and the rest spaced evenly between them, no further apart than the spacing.
 * A joint too short for two gets one in the middle.
 */
export function pocketPositions(from: Mm, to: Mm): Mm[] {
  const first = from + POCKET_END_INSET;
  const last = to - POCKET_END_INSET;
  if (last - first < 1e-6) return [(from + to) / 2];
  const spaces = Math.max(1, Math.ceil((last - first) / POCKET_MAX_SPACING - 1e-9));
  return Array.from({ length: spaces + 1 }, (_, i) => first + ((last - first) * i) / spaces);
}

/**
 * Positions along a case joint (the end of the bottom or of a stretcher): spaced as
 * `pocketPositions` when the joint is long enough for it, else as across a rail end,
 * so a 4" stretcher end takes two screws and cannot turn on one.
 */
export function jointPositions(from: Mm, to: Mm): Mm[] {
  if (to - from > 2 * POCKET_END_INSET + 1e-6) return pocketPositions(from, to);
  return railEndPositions(to - from).map((p) => from + p);
}

/** Across the end of a face frame rail: two holes at the quarter points, or one in the middle of a narrow rail. */
export function railEndPositions(railWidth: Mm): Mm[] {
  return railWidth >= RAIL_TWO_SCREWS_FROM - 1e-6 ? [railWidth / 4, (3 * railWidth) / 4] : [railWidth / 2];
}

/** One pocket hole per position, in `face`, with the screws leaving through `edge`. Ids are `${key}-1`, `${key}-2`... */
export function pocketRow(key: string, face: 'A' | 'B', edge: PartEdge, positions: Mm[]): Feature[] {
  return positions.map((at, i) => ({ id: `${key}-${i + 1}`, kind: 'pocketHole', face, edge, at }));
}
