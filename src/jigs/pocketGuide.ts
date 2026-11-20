/**
 * The drill guide for CNC-assisted pocket holes, as a printable solid (untested).
 *
 * The CNC cuts the open part of each pocket; the pilot is drilled by hand from the part's edge, up into
 * the pocket, to come out through the seat. Outside the edge nothing is in the way of the drill's chuck,
 * so a regular bit reaches (drilled from the pocket, the chuck only clears the face about 82 mm from the
 * edge, which takes a long bit: a sleeve and two guides that drilled that way were built first and taken
 * out).
 *
 * A plate lies on the face of the board and sets the bit's angle. A leg hangs down from it over the edge:
 * the fence that sets how far in the pilot starts. A key under the plate stands in the trough between its
 * upright walls, no deeper than the screw's axis, and sets the guide side to side; its nose stops just short
 * of the seat, its corners rounded like the trough's. A boss on the leg
 * carries the bit at 15 degrees in a metal sleeve (the MR74 bearings it was first made for
 * are very small; a stainless spacer or a bronze bushing is easier to buy and to handle): the bore is as big as the
 * sleeve from the boss's back to a lip just short of the board's edge, and the sleeve is pushed in from the back
 * against the lip. Its size is the shop's (`PocketSleeve`, within `SLEEVE_LIMITS`); a second one, where two are
 * used, goes in flush with the back. A flanged sleeve goes in until its flange is seated in a recess, flush: one
 * from the boss's back, a second from the fence side, shut in by the board's edge. The boss's back is square to the bore: the drill's chuck stops against it,
 * so the pilot's depth is how far the bit stands out of the chuck (`bitOutOfChuck`).
 *
 * It is made for one thickness of stock: the bore meets the edge at half of it. A little either way does
 * not matter, so one guide does every stock of a nominal thickness (`GUIDE_STOCK`). The part must overhang
 * the bench. It prints plate down, the leg and the key standing up, without supports.
 *
 * A guide for a low-angle pocket (`low`, after Castle's machines) is the same guide with
 * its bore at 3 or 6 degrees. Its key is short: the pocket's floor comes up in an arc, so the key stops where
 * the floor would meet it, and the plate reaches to the pocket's far end.
 *
 * It is no bigger than it has to be: the plate
 * reaches just past the key and stands on the face a finger's width either side of the pocket. To use less
 * filament the plate and the leg are thin, and the boss stands on a web narrower than
 * itself; the plate's far corners and the leg's lower corners are rounded.
 */
import { KEY_RADIUS, LOW_POCKET, type LowAngle, POCKET, POCKET_SLEEVE, arcFloorAt, arcShape, bitOutOfChuck, fenceFlangeAt, guideStock, jigSleeve, pocketShape, sleeveProblems, sleeveRoom } from '@/geometry/pocketHole';
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import type { JigInstance, Mm, PocketSleeve } from '@/model';
import { MM_PER_INCH } from '@/units';
import { type PrintObject, write3mf } from './threemf';

/** Sizes that don't come from the pocket. Tune me: first guesses, not yet printed. */
export const GUIDE = {
  /** The plate that lies on the board's face: its thickness, its width across the trough, and how far it reaches in past the key's end. */
  plate: 3,
  plateWidth: 26,
  plateBeyondKey: 4,
  /** The leg that hangs over the edge, down to the board's other face: how thick. */
  leg: 4,
  /** The boss round the bore outside the edge, across, at the least: it is this much plastic round a fatter sleeve (`guideBoss`). */
  boss: 13,
  bossWall: 3,
  /**
   * The web from the boss up to the plate's top (the bed, when it is printed): it carries the boss and is what the boss
   * is printed on. Seven tenths of the boss across: narrower, and the boss's sides would overhang too far to print.
   */
  web: 9,
  /** The plate's two far corners and the leg's two lower corners are rounded this much. */
  round: 5,
  /** Added to the sleeve's outside diameter for a push fit in the print. Tune me. */
  sleeveFit: 0.1,
  /** Past the sleeve the hole is this much bigger than the bit, so the bit touches no plastic. */
  bitClearance: 0.8,
  /** The ball nose the trough is cut with: it rounds the corners where the seat meets the trough's walls. */
  ball: MM_PER_INCH / 8,
  /** Between the key's nose and the seat: the leg against the edge places the guide, so the key must not reach the seat first. */
  noseClear: 0.5,
  /** The key's two front corners are rounded this much more than the ball rounds the trough's, so they stand clear of it. */
  noseRoundOver: 0.3,
  /** Between two guides on the print bed. */
  bedSpacing: 10,
};

/** How far the plate reaches in from the edge: to where the key ends (the bore's axis comes up through the face there), and a little past. */
export const guidePlateIn = (thickness: Mm, low?: PocketGuide['low']): Mm =>
  low ? Math.ceil(arcShape(thickness, low.bit, low.angleDeg, low.seat).end) + GUIDE.plateBeyondKey : Math.ceil(thickness / 2 / Math.tan((POCKET.angleDeg * Math.PI) / 180)) + GUIDE.plateBeyondKey;

/** The angle a guide's bore climbs into the board at. */
export const guideAngle = (guide: Pick<PocketGuide, 'low'>): number => guide.low?.angleDeg ?? POCKET.angleDeg;

/** Between a low-angle guide's key and the pocket's floor where the key ends. */
const KEY_OVER_FLOOR: Mm = 0.5;

/**
 * How far in from the edge a low-angle guide's key runs: to where the pocket's arced floor comes up to the
 * screw's axis, which is the key's underside, less a little.
 */
export function lowKeyEnd(thickness: Mm, low: NonNullable<PocketGuide['low']>): Mm {
  const arc = arcShape(thickness, low.bit, low.angleDeg, low.seat);
  const axis = (u: Mm) => -thickness / 2 + (u * arc.sin) / arc.cos;
  let u = arc.arcFrom;
  while (u < arc.end && arcFloorAt(arc, u + 0.5) < axis(u + 0.5) - KEY_OVER_FLOOR) u += 0.5;
  return u;
}

/**
 * Where the key's nose is, along the bore from the edge: just short of the seat. Its two front corners are
 * rounded to
 * clear the rounded corners the ball leaves where the seat meets the trough's walls; square, the key had to
 * stop a millimetre further back to miss them.
 */
export const guideKeyNose = (thickness: Mm, low?: PocketGuide['low']): Mm => (low ? arcShape(thickness, low.bit, low.angleDeg, low.seat).seat : pocketShape(thickness, GUIDE.ball).seat) + GUIDE.noseClear;

/** A guide's stock in words: its nominal thickness where it has one. */
export const guideStockName = (thickness: Mm): string => (guideStock(thickness) ? `${guideStock(thickness)!.name} stock` : `${+thickness.toFixed(2)} mm stock`);

export interface PocketGuide {
  /** The stock it is made for: its measured thickness. */
  thickness: Mm;
  /** The pilot bit: 4 mm or 5/32". */
  drill: Mm;
  /** The metal sleeve it is printed for. Left out: `POCKET_SLEEVE`. */
  sleeve?: PocketSleeve;
  /** For a low-angle pocket: its angle, and the flat end mill it is cut with (its radius is in the corners at the seat). Left out: a 15 degree pocket. */
  low?: { angleDeg: LowAngle; bit: Mm; /** The seat's distance from the edge, when it is not the usual one. */ seat?: Mm };
}

/** How far the pilot bit must stand out of the chuck with this guide. */
export const guideBitOut = (guide: Pick<PocketGuide, 'thickness' | 'low'>): Mm =>
  guide.low ? POCKET.guideOutside + arcShape(guide.thickness, guide.low.bit, guide.low.angleDeg, guide.low.seat).seat + POCKET.through : bitOutOfChuck(pocketShape(guide.thickness, GUIDE.ball));

/** The sleeve a guide is printed for. */
export const guideSleeve = (guide: Pick<PocketGuide, 'sleeve'>): PocketSleeve => guide.sleeve ?? POCKET_SLEEVE;

/** The boss round the bore, across, and the web it stands on: bigger round a fat sleeve. */
export function guideBoss(guide: Pick<PocketGuide, 'sleeve'>): { boss: Mm; web: Mm } {
  const sleeve = guideSleeve(guide);
  const boss = Math.max(GUIDE.boss, sleeve.outside + 2 * GUIDE.bossWall, (sleeve.flange?.diameter ?? 0) + GUIDE.bossWall);
  return { boss, web: Math.round(boss * 0.7 * 10) / 10 };
}

/**
 * Where a guide's sleeves sit along the bore from the board's edge, each from its end nearer the drill to its
 * other: the first against the lip at the fence, nearest the work; a second flush with the boss's back. Flanged
 * (`flange`: the end its flange is at): the first in the boss's back, a second let into the fence.
 */
export function guideSleeves(guide: Pick<PocketGuide, 'sleeve' | 'low'>): { from: Mm; to: Mm; flange?: 'from' | 'to' }[] {
  const sleeve = guideSleeve(guide);
  const back = -POCKET.guideOutside;
  if (sleeve.flange) {
    const fence = fenceFlangeAt(sleeve.flange.diameter, guideAngle(guide));
    const first = { from: back, to: back + sleeve.length, flange: 'from' as const };
    return sleeve.count === 2 ? [first, { from: fence - sleeve.length, to: fence, flange: 'to' as const }] : [first];
  }
  const lip = sleeveRoom(sleeve.outside, guideAngle(guide)) - POCKET.guideOutside;
  const first = { from: lip - sleeve.length, to: lip };
  return sleeve.count === 2 ? [first, { from: -POCKET.guideOutside, to: -POCKET.guideOutside + sleeve.length }] : [first];
}

export function pocketGuideProblems(guide: PocketGuide): string[] {
  const found: string[] = [];
  if (!(guide.drill > 0)) found.push('The drill bit must be more than 0.');
  else found.push(...sleeveProblems(guideSleeve(guide), guide.drill, guideAngle(guide)));
  if (guide.low?.seat !== undefined && (guide.low.seat < LOW_POCKET.seatRange.min || guide.low.seat > LOW_POCKET.seatRange.max)) found.push(`The seat is ${LOW_POCKET.seatRange.min} to ${LOW_POCKET.seatRange.max} mm from the edge.`);
  else if (!(guide.thickness > 0)) found.push('The stock thickness must be more than 0.');
  else if (guide.low ? !arcShape(guide.thickness, guide.low.bit, guide.low.angleDeg, guide.low.seat).fits : !pocketShape(guide.thickness, GUIDE.ball).fits) found.push(guide.low ? 'That stock is too thin for a low-angle pocket hole.' : 'That stock is too thin for a pocket hole.');
  return found;
}

/**
 * The guide as it is used, in the board's own frame (X in from the edge, Y across the trough, Z up from
 * the face), with what was used to make it, for whoever sets it on the bed or beside a board.
 */
async function guideInBoard(guide: PocketGuide, wasmUrl?: string) {
  const problems = pocketGuideProblems(guide);
  if (problems.length) throw new Error(problems.join(' '));
  const { Manifold } = await loadManifold(wasmUrl);
  type Solid = ReturnType<typeof Manifold.cube>;
  const made: Solid[] = [];
  const keep = <T extends Solid>(s: T): T => {
    made.push(s);
    return s;
  };
  const shape = pocketShape(guide.thickness, GUIDE.ball);
  const t = guide.thickness;
  const low = guide.low;
  const angleDeg = guideAngle(guide);
  const [sin, cos] = [Math.sin((angleDeg * Math.PI) / 180), Math.cos((angleDeg * Math.PI) / 180)];
  const BIG = 400;
  const over = 1;
  const back = -POCKET.guideOutside;
  const half = GUIDE.plateWidth / 2;
  const plateIn = guidePlateIn(t, low);

  // Boxes are in the board's frame.
  const box = (x0: Mm, x1: Mm, y: Mm, z0: Mm, z1: Mm) => keep(keep(Manifold.cube([x1 - x0, 2 * y, z1 - z0])).translate(x0, -y, z0));
  /** A cylinder round the bore from `s0` to `s1` along it, in the bore's own frame (X along the bore from the edge, Z square to it). */
  const round = (s0: Mm, s1: Mm, radius: Mm) => keep(keep(keep(Manifold.cylinder(s1 - s0, radius, radius, 96)).rotate([0, 90, 0])).translate(s0, 0, 0));
  /** A solid made in the bore's frame, set into the board's. */
  const toBoard = (s: Solid) => keep(keep(s.rotate([0, -angleDeg, 0])).translate(0, 0, -t / 2));

  // The plate, its two far corners rounded: a narrower piece at its end, the full width behind it, a post in each corner.
  const rad = Math.min(GUIDE.round, half - KEY_RADIUS - 1);
  const upPost = (y: Mm) => keep(keep(Manifold.cylinder(GUIDE.plate, rad, rad, 48)).translate(plateIn - rad, y, 0));
  const plate = keep(Manifold.union([box(-GUIDE.leg, plateIn - rad, half, 0, GUIDE.plate), box(-GUIDE.leg, plateIn, half - rad, 0, GUIDE.plate), upPost(half - rad), upPost(-(half - rad))]));
  // The leg, its two lower corners rounded the same way.
  const acrossPost = (y: Mm) => keep(keep(keep(Manifold.cylinder(GUIDE.leg, rad, rad, 48)).rotate([0, 90, 0])).translate(-GUIDE.leg, y, -t + rad));
  const leg = keep(Manifold.union([box(-GUIDE.leg, 0, half, -t + rad, GUIDE.plate), box(-GUIDE.leg, 0, half - rad, -t, GUIDE.plate), acrossPost(half - rad), acrossPost(-(half - rad))]));
  // The key: between the trough's upright walls, no deeper than the bore's axis, its nose just short of the seat
  // with its two front corners rounded. Seen along the seat's slope it is a rectangle with two round corners:
  // a narrower piece at the nose, the full width behind it, and a post in each corner.
  const nose = guideKeyNose(t, low);
  const seat = nose - GUIDE.noseClear;
  // (A low-angle pocket's corners are its end mill's.)
  const corner = Math.min(KEY_RADIUS, (low ? low.bit : GUIDE.ball) / 2 + GUIDE.noseRoundOver);
  const post = (y: Mm) => keep(keep(Manifold.cylinder(BIG, corner, corner, 48)).translate(nose + corner, y, 0));
  const rounded = keep(Manifold.union([box(nose, BIG / 2, KEY_RADIUS - corner, 0, BIG), box(nose + corner, BIG / 2, KEY_RADIUS, 0, BIG), post(KEY_RADIUS - corner), post(-(KEY_RADIUS - corner))]));
  const key = keep(toBoard(rounded).intersect(box(0, low ? lowKeyEnd(t, low) : plateIn, BIG, -BIG, over)));
  // The boss round the bore outside the edge, on a web up to the plate's top (the bed, when it is printed), its back square to the bore.
  const outside = box(-BIG, 0, BIG, -BIG, GUIDE.plate);
  const { boss, web: webWidth } = guideBoss(guide);
  const barrel = keep(toBoard(round(back, 5, boss / 2)).intersect(outside));
  // The web's outer corner is cut away: from the boss's back, where it is nearest the bed, the
  // web runs in toward the leg at 45 degrees as it goes down to the bed, which still prints without supports.
  const nearBed = { x: back * cos - (boss / 2) * sin, z: back * sin + (boss / 2) * cos - t / 2 };
  const cutAway = keep(keep(box(-BIG, 0, BIG, -BIG, BIG).rotate([0, 45, 0])).translate(nearBed.x, 0, nearBed.z));
  const web = keep(keep(toBoard(box(back, 5, webWidth / 2, 0, BIG)).intersect(outside)).subtract(cutAway));
  const body = keep(Manifold.union([plate, leg, key, barrel, web]));
  const cutters = toBoard(
    keep(
      Manifold.union([
        // Through the boss and the leg, and on through the front of the key where the bit comes out of the seat.
        round(back - over, seat + 12, (guide.drill + GUIDE.bitClearance) / 2),
        // The sleeve's seat: from the boss's back to the lip just short of the edge, which the sleeve is pushed in against.
        // A flanged one: each sleeve's own seat, and a recess for its flange, open to the back or to the edge.
        ...(guideSleeve(guide).flange
          ? guideSleeves(guide).flatMap((s) => {
              const { outside: across, flange } = guideSleeve(guide);
              const [body, lipped] = [(across + GUIDE.sleeveFit) / 2, (flange!.diameter + GUIDE.sleeveFit) / 2];
              return s.flange === 'from' ? [round(s.from - over, s.to, body), round(s.from - over, s.from + flange!.thickness, lipped)] : [round(s.from, s.to + over, body), round(s.to - flange!.thickness, over, lipped)];
            })
          : [round(back - over, guideSleeves(guide)[0]!.to, (guideSleeve(guide).outside + GUIDE.sleeveFit) / 2)]),
      ]),
    ),
  );
  const solid = keep(body.subtract(cutters));
  return { Manifold, solid, shape, box, round, toBoard, keep, BIG, dispose: () => made.forEach((s) => s.delete()) };
}

/** One guide as a solid, lying plate down on the print bed. */
export async function buildPocketGuide(guide: PocketGuide, wasmUrl?: string): Promise<SolidMesh> {
  const made = await guideInBoard(guide, wasmUrl);
  // Onto the bed: the plate's top down, the leg and the key standing up.
  const lying = made.keep(made.keep(made.solid.rotate([180, 0, 0])).translate(0, 0, GUIDE.plate));
  const mesh = meshOf(lying);
  made.dispose();
  // Into the bed's positive quarter.
  const p = mesh.positions;
  let [minX, minY] = [Infinity, Infinity];
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]!);
    minY = Math.min(minY, p[i + 1]!);
  }
  for (let i = 0; i < p.length; i += 3) {
    p[i]! -= minX;
    p[i + 1]! -= minY;
  }
  return mesh;
}

/** A piece of board for the picture of the guide in use: how far it runs in from its edge, and across. */
const SHOWN_BOARD = { in: 75, across: 52 };

/**
 * The guide in use, for the picture that shows it going on: the guide as it sits on
 * a board, and a piece of that board with the pocket the CNC cuts and the pilot the bit drills, all in the
 * board's frame (X in from the edge, Y across the pocket, Z up from the face).
 */
export async function buildPocketGuideInUse(guide: PocketGuide, wasmUrl?: string): Promise<{ guide: SolidMesh; board: SolidMesh }> {
  const made = await guideInBoard(guide, wasmUrl);
  const { Manifold, shape, box, round, toBoard, keep, BIG } = made;
  const R = POCKET.bore / 2;
  if (guide.low) {
    // A low-angle pocket: a slot as wide as the bore, its floor level at the seat and then up in an arc, drawn in thin slices.
    const arc = arcShape(guide.thickness, guide.low.bit, guide.low.angleDeg, guide.low.seat);
    const SLICE = 0.5;
    const slices: ReturnType<typeof box>[] = [];
    for (let u = arc.foot; u < arc.end; u += SLICE) slices.push(box(u, u + SLICE + 0.01, R, arcFloorAt(arc, u), 1));
    const lowPilot = toBoard(round(-5, arc.seat + 1, guide.drill / 2));
    const lowBoard = keep(box(0, Math.max(SHOWN_BOARD.in, arc.end + 10), SHOWN_BOARD.across / 2, -guide.thickness, 0).subtract(keep(Manifold.union([...slices, lowPilot]))));
    const lowMeshes = { guide: meshOf(made.solid), board: meshOf(lowBoard) };
    made.dispose();
    return lowMeshes;
  }
  // The pocket: the bore's lower half as its floor, upright walls above the axis, from the seat on in, with the
  // rounded corners the ball leaves where the seat meets the walls.
  const r = shape.r;
  const corner = (y: Mm) => keep(keep(Manifold.cylinder(BIG, r, r, 48)).translate(shape.seat + r, y, 0));
  const pocket = toBoard(
    keep(Manifold.union([round(shape.seat, BIG / 2, R), box(shape.seat, BIG / 2, R - r, 0, BIG), box(shape.seat + r, BIG / 2, R, 0, BIG), corner(R - r), corner(-(R - r))])),
  );
  const pilot = toBoard(round(-5, shape.seat + 1, guide.drill / 2));
  const board = keep(box(0, SHOWN_BOARD.in, SHOWN_BOARD.across / 2, -guide.thickness, 0).subtract(keep(Manifold.union([pocket, pilot]))));
  const meshes = { guide: meshOf(made.solid), board: meshOf(board) };
  made.dispose();
  return meshes;
}

/** How the picture of the guide in use runs, in seconds: each step's end. */
export const IN_USE = { lower: 1.4, slide: 2.0, wait: 2.5, drill: 4.7, hold: 5.3, withdraw: 6.4, lift: 7.4, end: 8.0 };

/**
 * Where the guide and the bit are `time` seconds into the picture, which runs round. The guide comes
 * down onto the face a little out from the edge, its key into the pocket, and slides in until its leg is
 * against the edge. Then the bit goes in along the bore until the chuck stops against the guide's back,
 * and comes out again. `guide`: how far the guide is out from its place and above it; `tip`: the bit's
 * tip along the bore from the board's edge.
 */
export function guideInUseAt(guide: PocketGuide, time: number): { guide: { out: Mm; up: Mm }; tip: Mm; drilling: boolean } {
  const t = ((time % IN_USE.end) + IN_USE.end) % IN_USE.end;
  const ease = (from: number, to: number) => {
    const k = Math.min(1, Math.max(0, (t - from) / (to - from)));
    return k * k * (3 - 2 * k);
  };
  const [OUT, UP] = [3, 45];
  const away = -POCKET.guideOutside - 14;
  const deep = guideBitOut(guide) - POCKET.guideOutside;
  const lifted = ease(IN_USE.withdraw, IN_USE.lift);
  const up = UP * (1 - ease(0, IN_USE.lower)) + UP * lifted;
  const out = OUT * (1 - ease(IN_USE.lower, IN_USE.slide)) + OUT * lifted;
  const tip = away + (deep - away) * (ease(IN_USE.wait, IN_USE.drill) - ease(IN_USE.hold, IN_USE.withdraw));
  return { guide: { out, up }, tip, drilling: t > IN_USE.wait && t < IN_USE.withdraw };
}

/** A job's guide: `angleDeg`, `bit` and `seat` among its params make it a low-angle pocket's. */
const guideOf = (jig: JigInstance): PocketGuide => {
  const angle = LOW_POCKET.angles.find((a) => a === jig.params.angleDeg);
  return { thickness: jig.params.thickness!, drill: jig.params.drill!, sleeve: jigSleeve(jig), ...(angle ? { low: { angleDeg: angle, bit: jig.params.bit ?? MM_PER_INCH / 4, ...(jig.params.seat ? { seat: jig.params.seat } : {}) } } : {}) };
};

/** A job's guides, one for each thickness of stock its pocket holes are in, side by side on the bed. */
export async function buildPocketGuideObjects(jigs: JigInstance[], wasmUrl?: string): Promise<PrintObject[]> {
  const objects: PrintObject[] = [];
  let y = 0;
  for (const jig of jigs) {
    const guide = guideOf(jig);
    objects.push({ name: `Pocket-hole guide, ${guideStockName(guide.thickness)}${guide.low ? `, ${guide.low.angleDeg}°` : ''}`, mesh: await buildPocketGuide(guide, wasmUrl), placements: [{ x: 0, y }] });
    y += GUIDE.plateWidth + GUIDE.bedSpacing;
  }
  return objects;
}

export const POCKET_GUIDE_FILE = 'pocket-hole-guide.3mf';

/** A job's guides as one 3MF file. */
export async function buildPocketGuide3mf(jigs: JigInstance[], wasmUrl?: string): Promise<Uint8Array> {
  return write3mf(await buildPocketGuideObjects(jigs, wasmUrl));
}
