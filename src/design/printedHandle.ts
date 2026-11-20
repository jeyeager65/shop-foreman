/**
 * Handles made here: printed (a bar pull, an arch pull and a knob) or cut out of wood
 * on the CNC (a bar pull and an arch pull). Each is worked out from a few sizes so it
 * can be made for any hole spacing. A screw comes through the front from the back into
 * each foot. Printed: into a heat-set insert melted into the plastic (recommended: a
 * metal thread that can be done up tight and undone again), or straight into a hole in
 * the plastic that the screw taps for itself. Wood: into a pilot hole drilled by hand.
 *
 * The shapes are profiles, shared by the picture, the print and the CNC:
 * - a pull's side profile, in the plane of its length (x, centred) and how far it
 *   stands off the front (y, 0 at the front). Printed, it is extruded by the pull's
 *   width and lies on its side, so it needs no supports and its layers run the length
 *   of the bar. Cut on the CNC, it is the part's outline, and the pull is as wide as
 *   its stock is thick;
 * - a knob's half profile (radius, height off the front), turned about its axis: it
 *   is printed head down, its foot and the hole on top.
 */
import type { Handle, Material, Mm, PrintedHandle } from '@/model';

/** Plastic left round a foot's hole, and beyond its end. Tune me. */
export const PRINT_WALL = { round: 2.4, beyond: 2 };
/** The same in wood, which splits: more of it. Tune me. */
export const WOOD_WALL = { round: 5, beyond: 4 };
/** How many flats a curve is made of. */
const CURVE_STEPS = 24;

export type P2 = [number, number];

/** The hole in each foot of a printed handle: for the insert, or for the screw itself. */
export function fasteningHole(printed: PrintedHandle): { diameter: Mm; depth: Mm } {
  return printed.fastening === 'heatSetInsert' ? { diameter: printed.insert.diameter, depth: printed.insert.depth } : printed.pilot;
}

/** What a handle made here is made as: its design, how wide it is, the hole in each foot and what must be left round that. */
export interface MadeHandle {
  how: 'printed' | 'cnc';
  design: 'bar' | 'arch' | 'knob';
  /** Across its length as you look at the front: as set for a print, the stock's thickness for wood. */
  width: Mm;
  hole: { diameter: Mm; depth: Mm };
  /** What goes in the hole, in words. */
  holeFor: 'insert' | 'screw';
  wall: { round: Mm; beyond: Mm };
}

/** Nothing for a bought handle. `materials`: to know how thick a wooden one's stock is (3/4" when not given). */
export function madeHandle(handle: Handle, materials: Material[] = []): MadeHandle | undefined {
  const { printed, cnc } = handle;
  if (printed) {
    return { how: 'printed', design: printed.design, width: printed.width, hole: fasteningHole(printed), holeFor: printed.fastening === 'heatSetInsert' ? 'insert' : 'screw', wall: PRINT_WALL };
  }
  if (cnc) {
    const width = materials.find((m) => m.id === cnc.materialId)?.measuredThickness.mm ?? 19.05;
    return { how: 'cnc', design: cnc.design, width, hole: cnc.pilot, holeFor: 'screw', wall: WOOD_WALL };
  }
  return undefined;
}

/** How wide a foot is, along the pull (a knob's foot: across): at least the hole and what is left round it. */
export function footWidth(handle: Handle): Mm {
  const made = madeHandle(handle);
  const hole = made ? made.hole.diameter + 2 * made.wall.round : 0;
  return Math.max(hole, made?.design === 'knob' ? handle.look.length * 0.45 : handle.look.thickness);
}

/**
 * A handle's sizes as it is made: a bought one's are as given; a bar made here is at
 * least as long as its feet stand, and an arch exactly spans them.
 */
export function handleLook(handle: Handle): Handle['look'] {
  const made = madeHandle(handle);
  if (!made || made.design === 'knob') return handle.look;
  const foot = footWidth(handle);
  const length = made.design === 'arch' ? handle.spacing + 2 * foot : Math.max(handle.look.length, handle.spacing + foot);
  return { ...handle.look, length };
}

/** How far the handle stands off the front, over all. */
export const handleHeight = (handle: Handle): Mm => handle.look.projection + handle.look.thickness;

const tidy = (points: P2[]): P2[] => points.filter((p, i) => Math.hypot(p[0] - points[(i + points.length - 1) % points.length]![0], p[1] - points[(i + points.length - 1) % points.length]![1]) > 1e-6);

/** A made pull's side profile, counter-clockwise. */
export function pullProfile(handle: Handle): P2[] {
  const { projection } = handle.look;
  const top = handleHeight(handle);
  const half = handleLook(handle).length / 2;
  const foot = footWidth(handle);
  const [inner, outer] = [handle.spacing / 2 - foot / 2, handle.spacing / 2 + foot / 2];
  if (madeHandle(handle)?.design === 'arch') {
    // Two half ellipses: over the top from the right foot to the left, and back under it.
    const arc = (a: number, b: number, from: number, to: number): P2[] =>
      Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
        const t = from + ((to - from) * i) / CURVE_STEPS;
        return [a * Math.cos(t), b * Math.sin(t)];
      });
    return tidy([...arc(half, top, 0, Math.PI), ...arc(inner, projection, Math.PI, 0)]);
  }
  // A bar on two legs; the bar may run on past them.
  return tidy([
    [-outer, 0],
    [-inner, 0],
    [-inner, projection],
    [inner, projection],
    [inner, 0],
    [outer, 0],
    [outer, projection],
    [half, projection],
    [half, top],
    [-half, top],
    [-half, projection],
    [-outer, projection],
  ]);
}

/**
 * A printed knob's half profile, from the axis out and back: a foot, a flare out to the
 * head no steeper than a printer bridges, and a head with its top edge eased.
 */
export function knobProfile(handle: Handle): P2[] {
  const { length, projection } = handle.look;
  const top = handleHeight(handle);
  const [foot, head] = [footWidth(handle) / 2, Math.max(length / 2, footWidth(handle) / 2)];
  const ease = Math.min(1.5, handle.look.thickness / 3);
  // The flare rises as far as it goes out (45 degrees), ending where the head begins.
  const flareFrom = Math.max(0, projection - (head - foot));
  return tidy([
    [0, 0],
    [foot, 0],
    [foot, flareFrom],
    [head, projection],
    [head, top - ease],
    [head - ease, top],
    [0, top],
  ]);
}

/** How much of the handle stands over a foot's hole, at the hole's edge nearest the end of the handle. */
function overHole(handle: Handle, made: MadeHandle): Mm {
  if (made.design !== 'arch') return handleHeight(handle);
  const x = handle.spacing / 2 + made.hole.diameter / 2;
  const half = handleLook(handle).length / 2;
  return handleHeight(handle) * Math.sqrt(Math.max(0, 1 - (x / half) ** 2));
}

/** What is wrong with the sizes of a handle made here, in words; nothing when it can be made. */
export function printedHandleProblems(handle: Handle, materials: Material[] = []): string[] {
  const made = madeHandle(handle, materials);
  if (!made) return [];
  const out: string[] = [];
  const { hole, wall, holeFor } = made;
  const stuff = made.how === 'printed' ? 'plastic' : 'wood';
  if (handle.look.projection <= 0 || handle.look.thickness <= 0 || handle.look.length <= 0) out.push('Its sizes must be more than nothing.');
  if (overHole(handle, made) < hole.depth + wall.beyond) out.push(`It is not tall enough for its ${holeFor}: the hole is ${hole.depth} mm deep and needs ${wall.beyond} mm of ${stuff} beyond it.`);
  if (made.design !== 'knob') {
    if (made.width < hole.diameter + 2 * wall.round) out.push(`It is too narrow for its ${holeFor}: the hole is ${hole.diameter} mm across and needs ${wall.round} mm of ${stuff} each side.`);
    if (handle.spacing < footWidth(handle) + 20) out.push('Its holes are too close together to get fingers between its feet.');
  }
  if (handle.cnc && !materials.some((m) => m.id === handle.cnc!.materialId) && materials.length) out.push('Its material is not in the shop profile.');
  return out;
}
