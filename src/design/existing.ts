/**
 * An existing case: a cabinet that is already there, measured, not designed. Nothing
 * of its case is cut, listed or bought. Everything that stands inside it is derived as in a cabinet made
 * here, so the measurements are turned into the cabinet a made one would be: its outside size, its style
 * and its face frame's widths, such that its inside and its door opening come out as measured. The
 * project's case material stands in for its walls (their real thickness is not measured, and nothing
 * depends on it), and the project's toe kick for what it stands on.
 *
 * This file has the arithmetic only, so `settings.ts` can use it; what needs the case and the openings is
 * in `existingShell.ts`.
 */
import type { CabinetJoinery, ExistingCase, Length, Mm } from '@/model';
import { MM_PER_INCH } from '@/units';

/** The joints of the shell as it is drawn: a back over the rear of the case, a flat back stretcher. Nothing is cut for them. */
export const EXISTING_JOINERY: CabinetJoinery = { case: 'pocketScrews', back: 'applied', backStretcherForm: 'flat' };

/** How far the hinges stand in from the edge of the opening until it is measured. Tune me. */
export const HINGE_STAND_IN: Mm = (5 * MM_PER_INCH) / 8;

/** The made cabinet an existing case stands in as, in mm: its outside size and its face frame's widths. */
export interface ExistingStandIn {
  width: Mm;
  height: Mm;
  depth: Mm;
  stile: Mm;
  rail: Mm;
}

/** How deep a case is taken to be inside when its inside is not measured: only for the picture. Tune me. */
export const ASSUMED_DEPTH: Mm = 21 * MM_PER_INCH;
/** The same for a wall cabinet. Tune me. */
export const ASSUMED_WALL_DEPTH: Mm = 11.25 * MM_PER_INCH;
/** How far a face frame's stile is taken to stand in from the case side when the inside is not measured. Tune me. */
export const ASSUMED_STILE_IN: Mm = (3 * MM_PER_INCH) / 4;

/**
 * The inside of the box, in mm: as measured, or taken from the door opening when it is not: as
 * wide as the opening and a stile's overhang each side behind a face frame, as high as the opening, and
 * `depth` deep. Nothing is made to fit an inside that was not measured.
 */
export function existingInside(existing: ExistingCase, depth: Mm = ASSUMED_DEPTH): { widthFront: Mm; widthBack: Mm; depth: Mm; height: Mm } {
  const m = existing.inside;
  if (m) return { widthFront: m.widthFront.mm, widthBack: m.widthBack.mm, depth: m.depth.mm, height: m.height.mm };
  const width = existing.opening.width.mm + (existing.frame === 'faceFrame' ? 2 * ASSUMED_STILE_IN : 0);
  return { widthFront: width, widthBack: width, depth, height: existing.opening.height.mm };
}

/**
 * What the drawer openings above the lowest opening take of the height: each one's height, and
 * behind a face frame the rail under it.
 */
export function existingAbove(existing: ExistingCase): Mm {
  return (existing.drawers ?? []).reduce((sum, d) => sum + d.height.mm + (existing.frame === 'faceFrame' ? d.rail.mm : 0), 0);
}

/** Whether the front on a row of its layout (counted from the top, from 0) is kept or made new: the drawers first, then the lowest opening. */
export function existingRowFronts(existing: ExistingCase, row: number): 'kept' | 'new' {
  return existing.drawers?.[row]?.fronts ?? existing.fronts;
}

/** Whether anything is made for its fronts at all. */
export const existingMakesFronts = (existing: ExistingCase): boolean => existing.fronts === 'new' || (existing.drawers ?? []).some((d) => d.fronts === 'new');

/** The inside width that is used: the smaller of the front's and the back's. */
export const existingInsideWidth = (existing: ExistingCase): Mm => Math.min(existingInside(existing).widthFront, existingInside(existing).widthBack);

/** The door opening things must pass through: measured behind a face frame; frameless, the inside of the case at the front. */
export function existingOpening(existing: ExistingCase): { width: Mm; height: Mm } {
  const inside = existingInside(existing);
  return existing.frame === 'faceFrame' ? { width: existing.opening.width.mm, height: existing.opening.height.mm } : { width: inside.widthFront, height: inside.height };
}

/**
 * The cabinet the measurements describe. `side` and `back` are the thicknesses of the project's case and
 * back materials, `kick` the height of the project's toe kick. Behind a face frame the floor is level
 * with the bottom of the door opening, and the top rail hangs down from the top of the case to the top of
 * the opening; the stiles take what the opening leaves of the width. A wall cabinet (part E) is the same
 * box with no toe kick (`kick` 0), drawn `assumedDepth` deep inside when its inside is not measured.
 * Drawer openings above the lowest opening make the box that much taller: the inside height is
 * measured in the lowest section, from the floor up to what is over it.
 */
export function existingStandIn(existing: ExistingCase, side: Mm, back: Mm, kick: Mm, assumedDepth: Mm = ASSUMED_DEPTH): ExistingStandIn {
  // A blind corner cabinet's opening is not in the middle: its blind part takes one side, and the stile is what is left on the other.
  const measured = existingInside(existing, assumedDepth);
  const width = Math.min(measured.widthFront, measured.widthBack) + 2 * side;
  const depth = measured.depth + back;
  const inside = measured.height + existingAbove(existing);
  if (existing.frame === 'frameless') return { width, depth, height: kick + side + inside + side, stile: side, rail: side };
  const rail = Math.max(side, measured.height - existing.opening.height.mm + side);
  const stile = existing.blind ? Math.max(0, width - existing.opening.width.mm - (existing.blind.reach.mm + side)) : Math.max(0, (width - existing.opening.width.mm) / 2);
  return { width, depth, height: kick + rail + inside + side, stile, rail };
}

/** What is wrong with the measurements, in words. Nothing when they make sense. */
export function existingProblems(existing: ExistingCase): string[] {
  const found: string[] = [];
  const inside = existing.inside;
  if (inside) {
    const { widthFront, widthBack, depth, height } = inside;
    if ([widthFront, widthBack, depth, height, existing.hingeStandIn].some((l) => !(l.mm >= 0)) || [widthFront, widthBack, depth, height].some((l) => l.mm === 0)) {
      found.push('Every measurement of the inside must be more than nothing.');
    }
  }
  if (existing.frame === 'faceFrame' || !inside) {
    if (!(existing.opening.width.mm > 0) || !(existing.opening.height.mm > 0)) found.push('The door opening must have a width and a height.');
    if (inside && existing.opening.height.mm > inside.height.mm + 0.5) found.push('The door opening is taller than the inside of the cabinet: measure the inside from its floor up to what is over it.');
  }
  for (const [i, d] of (existing.drawers ?? []).entries()) {
    if (!(d.height.mm > 0)) found.push(`Drawer opening ${i + 1} must have a height.`);
    if (existing.frame === 'faceFrame' && !(d.rail.mm >= 0)) found.push(`The rail under drawer opening ${i + 1} cannot be less than nothing.`);
  }
  return found;
}

/** A length in mm as one shown in inches. */
export const shownInInches = (mm: Mm): Length => ({ mm, unit: 'in' });
