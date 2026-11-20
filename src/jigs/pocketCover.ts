/**
 * A printed cover for a pocket hole (untested). The pocket has a ledge round its opening (`POCKET.ledge`,
 * `pocketLedge`), cut with a flat end mill. The cover is a plate that lies in the ledge, flush with the face, its
 * corners rounded as the bit leaves the ledge's. Under it a rib stands in the slot, a push fit between its upright
 * walls, to hold it.
 *
 * Two kinds. Over a 15 degree pocket (the ball nose's or the end mill's) it is hollowed over the seat, where the
 * screw's head comes up nearly to the face. Over a low-angle pocket (`low`) it is longer, as the pocket is, hollowed
 * over the seat the same way, and its rib starts as far behind the seat and runs on to where the arced floor comes
 * up under it. In thin stock a low-angle pocket's screw head comes up nearly to the face and no cover fits
 * (`lowCoverFits`).
 *
 * It follows the bit the ledge was cut with (its corners: a 1/8" bit's plate and a 1/4" bit's are two plates) and the
 * stock's thickness (how long the pocket is). It prints face down, without supports.
 */
import { LOW_POCKET, type LedgeOpening, POCKET, arcFloorAt, arcLedge, arcSeatAt, arcShape, lowCoverFits, slotLedge, slotSeatAt, slotShape } from '@/geometry/pocketHole';
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import type { Mm } from '@/model';

/** Sizes that don't come from the pocket. Tune me: first guesses, not yet printed. */
export const COVER = {
  /** Between the cover's edge and the ledge's, all round. */
  fit: 0.15,
  /** The rib under it that stands in the slot: how far below the ledge, how much narrower than the slot, and how far behind the seat it starts. */
  rib: { depth: 2.5, fit: 0.2, behindSeat: 12 },
  /** The hollow over the screw's head: how much of the plate is left over it, and how far it runs in from the seat. */
  head: { skin: POCKET.ledge.skin, length: 11 },
};

export interface PocketCover {
  /** The stock the pocket is in: its thickness, as the guide's. */
  thickness: Mm;
  /** The flat end mill the ledge was cut with: its diameter. The plate's corners are its radius. */
  bit: Mm;
  /** Over a low-angle pocket: its angle, and its seat from the edge when it is not the usual one. */
  low?: { angleDeg: number; seat?: Mm };
}

export function pocketCoverProblems(cover: PocketCover): string[] {
  const found: string[] = [];
  if (!(cover.thickness > 0)) found.push('The stock thickness must be more than 0.');
  if (!(cover.bit > 0)) found.push('The bit must be more than 0.');
  if (found.length) return found;
  if (cover.bit > POCKET.bore + 1e-9) found.push('The bit is wider than the pocket: the ledge is cut with one no wider than it.');
  else if (cover.low) {
    const seat = cover.low.seat ?? LOW_POCKET.seat;
    if (!arcShape(cover.thickness, POCKET.bore, cover.low.angleDeg, seat).fits) found.push('That stock is too thin for a low-angle pocket hole.');
    else if (!lowCoverFits(cover.thickness, cover.low.angleDeg, seat)) found.push("In stock this thin the screw's head comes up nearly to the face: no cover fits over a low-angle pocket.");
  } else if (!slotShape(cover.thickness, Math.min(cover.bit, POCKET.bore / 2)).fits) found.push('That stock is too thin for a pocket hole.');
  return found;
}

/** The ledge the cover lies in. */
export const coverLedge = (cover: PocketCover): LedgeOpening =>
  cover.low ? arcLedge(cover.thickness, cover.low.angleDeg, cover.low.seat ?? LOW_POCKET.seat) : slotLedge(slotShape(cover.thickness, cover.bit));

/** The cover's size as it lies in the ledge: its length along the pocket, its width, its thickness. */
export function coverSize(cover: PocketCover): { length: Mm; width: Mm; thickness: Mm } {
  const open = coverLedge(cover);
  return { length: open.u1 - open.u0 - 2 * COVER.fit, width: 2 * (open.half - COVER.fit), thickness: POCKET.ledge.depth };
}

/** The cover as one solid, lying face down on the print bed. */
export async function buildPocketCover(cover: PocketCover, wasmUrl?: string): Promise<SolidMesh> {
  const problems = pocketCoverProblems(cover);
  if (problems.length) throw new Error(problems.join(' '));
  const { Manifold } = await loadManifold(wasmUrl);
  type Solid = ReturnType<typeof Manifold.cube>;
  const made: Solid[] = [];
  const keep = <T extends Solid>(s: T): T => {
    made.push(s);
    return s;
  };
  const open = coverLedge(cover);
  const r = cover.bit / 2;
  const R = POCKET.bore / 2;
  const deep = POCKET.ledge.depth;
  // In the board's frame: X in from the edge, Y across the pocket, Z up from the face.
  const box = (x0: Mm, x1: Mm, y: Mm, z0: Mm, z1: Mm) => keep(keep(Manifold.cube([x1 - x0, 2 * y, z1 - z0])).translate(x0, -y, z0));
  const [x0, x1, half] = [open.u0 + COVER.fit, open.u1 - COVER.fit, open.half - COVER.fit];
  // The plate, its four corners rounded as the bit leaves the ledge's.
  const rad = Math.min(r, half - 0.5);
  const posts = [x0 + rad, x1 - rad].flatMap((x) => [half - rad, -(half - rad)].map((y) => keep(keep(Manifold.cylinder(deep, rad, rad, 48)).translate(x, y, -deep))));
  const plate = keep(Manifold.union([box(x0 + rad, x1 - rad, half, -deep, 0), box(x0, x1, half - rad, -deep, 0), ...posts]));
  // The rib that stands in the slot, where the slot is still deep enough for it.
  const ribBottom = -deep - COVER.rib.depth - 0.3;
  let body: Solid;
  if (cover.low) {
    const shape = arcShape(cover.thickness, POCKET.bore, cover.low.angleDeg, cover.low.seat ?? LOW_POCKET.seat);
    // Where the arc comes up to the rib's underside, for the narrowest bit's pocket, whose arc rises soonest.
    const narrow = arcShape(cover.thickness, 3, cover.low.angleDeg, cover.low.seat ?? LOW_POCKET.seat);
    let ribEnd = narrow.arcFrom;
    while (ribEnd < narrow.end && arcFloorAt(narrow, ribEnd + 0.5) < ribBottom) ribEnd += 0.5;
    ribEnd = Math.min(ribEnd, x1 - 2);
    const ribStart = Math.min(shape.foot + COVER.rib.behindSeat, ribEnd - 4);
    const rib = box(ribStart, ribEnd, R - COVER.rib.fit / 2, -deep - COVER.rib.depth, -deep);
    // Hollowed over the screw's head, which lies further under the plate than a 15° pocket's.
    const seat = arcSeatAt(shape, 0);
    const hollow = box(seat - 1, seat + COVER.head.length, R + 0.5, -deep - 1, -COVER.head.skin);
    body = keep(keep(Manifold.union([plate, rib])).subtract(hollow));
  } else {
    const slot = slotShape(cover.thickness, cover.bit);
    const seat = slotSeatAt(slot, 0);
    const tan = slot.sin / slot.cos;
    const ribEnd = Math.min((cover.thickness / 2 + R / slot.cos - deep - COVER.rib.depth - 0.3) / tan, x1 - 2);
    const ribStart = Math.min(seat + COVER.rib.behindSeat, ribEnd - 4);
    const rib = box(ribStart, ribEnd, R - COVER.rib.fit / 2, -deep - COVER.rib.depth, -deep);
    // Hollowed over the screw's head.
    const hollow = box(seat - 1, seat + COVER.head.length, R + 0.5, -deep - 1, -COVER.head.skin);
    body = keep(keep(Manifold.union([plate, rib])).subtract(hollow));
  }
  // Face down on the bed.
  const lying = keep(keep(body.rotate([180, 0, 0])).translate(-x0, half, 0));
  const mesh = meshOf(lying);
  for (const s of made) s.delete();
  return mesh;
}
