/**
 * A pocket hole seen in section, through the screw's axis: the board, the pocket cut in it, the screw lying in it with
 * its head on the seat, and the board it goes into, standing against the edge. For the scrap test's page, where it
 * shows what a seat distance and an angle do: the screw leaves the edge at mid-thickness whatever they are, and the
 * seat says how much of it goes into the other part.
 *
 * In the section: `u` in from the edge (negative: into the other part), `z` up from the face the pocket is cut in
 * (negative into the board). Lengths along the screw are measured from where it leaves the edge.
 */
import { LOW_POCKET, POCKET, arcFloorAt, arcSeatAt, arcShape, lowPocketScrew } from '@/geometry/pocketHole';
import type { LengthDisplay, Mm } from '@/model';
import { formatLength } from '@/units';
import { MM_PER_INCH } from '@/units';

/**
 * Tune me: the screws, as drawn. A 15° pocket's (Kreg-style): a washer head, threaded over more than half its length. A low-angle
 * pocket's (Castle's, Torx or square drive, 1-1/2" or 1-1/4"): a short cheese head with a flat underside, a smooth shank, and
 * threads only toward its point. And how much of a screw a joint wants in the other part at the least.
 */
export const POCKET_SCREW = {
  /** A #8 (Kreg) and a #7 (Castle): the threads' outside and the smooth shank, across. */
  kreg: { head: { diameter: 9.5, height: 2.8 }, threads: 0.6, thread: 4.2, shank: 3.3 },
  castle: { head: { diameter: 8, height: 3.6 }, threads: 0.42, thread: 3.8, shank: 3 },
  /** How long the point is, and the pitch drawn: coarse (plywood, MDF, softwood; every Castle screw) or fine (a Kreg screw in hardwood). */
  pitch: { coarse: 2.2, fine: 1.3 },
  point: 3,
  leastInto: (5 / 8) * MM_PER_INCH,
};

/** The screw a 15° pocket takes: 1-1/4" in stock 5/8" or thicker, else 1" (as the Kreg chart). Tune me. */
export const steepPocketScrew = (thickness: Mm): Mm => (thickness >= 15 ? 1.25 : 1) * MM_PER_INCH;

/** The screw a pocket in this stock takes: a low-angle one's by its stock (1-1/2" in 3/4"), else 15°'s. */
export const pocketScrew = (thickness: Mm, low: boolean): Mm => (low ? (lowPocketScrew(thickness) ?? 1.5 * MM_PER_INCH) : steepPocketScrew(thickness));

/** The farthest a low-angle pocket's seat may be from the edge and leave the screw `POCKET_SCREW.leastInto` in the other part. */
export const farthestSeat = (thickness: Mm): Mm => Math.min(LOW_POCKET.seatRange.max, pocketScrew(thickness, true) - POCKET_SCREW.leastInto);

export interface PocketSection {
  thickness: Mm;
  angleDeg: number;
  /** Along the screw, from the edge to the seat its head bears on. */
  seat: Mm;
  screw: Mm;
  /** Which screw: a 15° pocket's Kreg-style one, or a low-angle pocket's Castle one; and whether its thread is fine. */
  screwKind: 'kreg' | 'castle';
  fine: boolean;
  /** The pocket's outline in the section, round from the face: the seat, the floor, back along the face. */
  pocket: [Mm, Mm][];
  /** The screw's way cut open from the face (a channel), or a pilot drilled along it. */
  channel: boolean;
  /** How much of the screw goes into the other part, along it; and whether that is too little, or comes out its far face (as thick as this board). */
  into: Mm;
  short: boolean;
  through: boolean;
}

/** A pocket's section: a low-angle one (`angleDeg` 3 or 6, cut with a bit `bitDiameter` across) or a 15° one. */
export function pocketSection(thickness: Mm, angleDeg: number, seatFromEdge: Mm | undefined, bitDiameter: Mm, channel: boolean, hardwood = false): PocketSection {
  const low = angleDeg !== POCKET.angleDeg;
  const a = (angleDeg * Math.PI) / 180;
  const [sin, cos] = [Math.sin(a), Math.cos(a)];
  let seat: Mm;
  let pocket: [Mm, Mm][];
  if (low) {
    const shape = arcShape(thickness, Math.min(bitDiameter, POCKET.bore), angleDeg, seatFromEdge ?? LOW_POCKET.seat);
    seat = shape.seat;
    // Down the seat, along the floor (level, then the arc), and back along the face.
    const floor = Array.from({ length: 25 }, (_, i): [Mm, Mm] => {
      const u = shape.foot + ((shape.end - shape.foot) * i) / 24;
      return [u, arcFloorAt(shape, u)];
    });
    pocket = [[arcSeatAt(shape, 0), 0], [arcSeatAt(shape, -shape.depth), -shape.depth], ...floor, [shape.end, 0]];
  } else {
    // A 15° pocket: the bore's floor runs along the axis a bore's radius under it, from the seat up to the face; the
    // seat is square to the axis, from the floor up to the face.
    seat = POCKET.seatShare * thickness;
    const R = POCKET.bore / 2;
    const axis = (s: Mm): [Mm, Mm] => [s * cos, -thickness / 2 + s * sin];
    const down: [Mm, Mm] = [sin, -cos];
    const foot: [Mm, Mm] = [axis(seat)[0] + R * down[0], axis(seat)[1] + R * down[1]];
    const sEnd = (thickness / 2 + R * cos) / sin;
    const floorEnd: [Mm, Mm] = [axis(sEnd)[0] + R * down[0], 0];
    const k = -foot[1] / cos;
    pocket = [[foot[0] - k * sin, 0], foot, floorEnd];
  }
  const screw = pocketScrew(thickness, low);
  const into = screw - seat;
  return { thickness, angleDeg, seat, screw, screwKind: low ? 'castle' : 'kreg', fine: !low && hardwood, pocket, channel, into, short: into < POCKET_SCREW.leastInto - 0.5, through: into * cos > thickness + 0.5 };
}

/** A length in inches to the 1/16", "≈" in front when it is not exact (no 32nds to think in). */
export function inchesBy16(mm: Mm): string {
  const sixteenths = (mm / MM_PER_INCH) * 16;
  const exact = Math.abs(sixteenths - Math.round(sixteenths)) < 0.02;
  return `${exact ? '' : '≈'}${formatLength(mm, { kind: 'fractionalInch', denominator: 16 })}`;
}

/** A length in mm to the tenth. */
export const mmBy10 = (mm: Mm): string => `${+mm.toFixed(1)} mm`;

/**
 * A length on the scrap test's page in both units, its own first and the other after it: what the CNC cuts and is
 * measured on the scrap goes by the shop's CNC unit (22.2 mm (7/8")), what is bought by its sizes unit (1-1/2" (38.1 mm)).
 */
export function bothUnits(mm: Mm, first: LengthDisplay): string {
  return first.kind === 'mm' ? `${mmBy10(mm)} (${inchesBy16(mm)})` : `${inchesBy16(mm)} (${mmBy10(mm)})`;
}