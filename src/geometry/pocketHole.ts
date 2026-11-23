/**
 * The shape of a CNC-assisted pocket hole (feature doc, "Worked example: CNC-prepped
 * pocket holes"). Untested: every number here is a first guess, to be tuned on scrap.
 *
 * The screw's axis leaves the part's edge at mid-thickness and climbs into the part at
 * 15 degrees, toward the face the pocket is cut in. The CNC cuts the open part of the
 * 3/8" counterbore with a ball nose bit: the ball's centre runs along lines parallel to
 * the axis, wrapped round the lower half of the bore, so the floor is round and parallel
 * to the axis and the walls above it are upright. The lines stop at the seat, where the
 * screw's head bears.
 *
 * The seat is square to the axis over its whole height (it was cut
 * vertical above the axis, which left material standing where the screw's head lands). It
 * leans back toward the edge as it rises, so it faces up and the bit reaches all of it.
 *
 * The pilot is drilled by hand from the part's edge, up into the pocket, through a printed
 * guide (`jigs/pocketGuide.ts`). Drilled from the pocket, a drill's
 * chuck only clears the face of the board about 82 mm from the edge in 3/4" stock, which
 * takes a bit longer than a regular one; outside the edge nothing is in the chuck's way.
 * A sleeve lying in the trough and two guides drilled from the pocket were built the same
 * day and taken out again in favour of this one, with a flat-floored trough made for them.
 *
 * Positions along the axis are measured from where it leaves the edge (`s`). Heights are
 * measured from the face the pocket is cut in, negative into the part.
 */
import type { JigInstance, Mm, PartEdge, PocketSleeve, Point } from '@/model';

/** Tune me: Kreg-style numbers, none of them cut yet. */
export const POCKET = {
  angleDeg: 15,
  /** The counterbore the screw's head runs in: 3/8". */
  bore: 9.525,
  /** The pilot's drill bit: 4 mm, or 5/32". */
  drill: 4,
  /** The seat's distance from the edge along the axis, as a share of the stock's thickness (about 9/16" in 3/4" stock). */
  seatShare: 0.75,
  /** The least stock left under the pocket's floor. */
  minFloor: 3,
  /** Left on the floor and walls by the roughing levels for the finishing lines. */
  roughAllowance: 0.3,
  /** The tallest ridge the finishing passes may leave between them on the seat, where the screw's head bears. */
  ridge: 0.1,
  /**
   * The tallest ridge the finishing lines may leave between them on the floor. Coarser than the seat's: the
   * floor only has to clear the screw's head and the driver now that nothing lies on it (the guide's key
   * stands above the axis, between the walls, which the outermost two lines always cut).
   */
  floorRidge: 0.3,
  /** How much narrower than the bore the printed guide's key is, across. */
  keyFit: 0.25,
  /**
   * The guide's bore outside the part's edge, to the back the drill's chuck stops against, at the least: long
   * enough for one sleeve 20 mm long or two of 10 mm. It is longer for longer sleeves (`boreOutside`), up to
   * `guideOutsideMost`: past that a regular bit no longer stands far enough out of the chuck.
   */
  guideOutside: 22,
  guideOutsideMost: 32,
  /** How far the pilot bit comes through the seat into the pocket. */
  through: 3,
  /**
   * A ledge round the pocket's opening for a printed cover to lie in, flush with the face: how deep, and how far out
   * all round; and the least of the cover's plate left over the screw's head, where it is hollowed for it.
   */
  ledge: { depth: 2, margin: 2, skin: 0.8 },
};

/** The sleeve a guide is printed for when the shop has not said: a stainless M4 spacer, 4.1 mm bore, 7 mm outside, 20 mm long. */
export const POCKET_SLEEVE: PocketSleeve = { bore: 4.1, outside: 7, length: 20, count: 1 };

/**
 * What a sleeve may be. `looseBore`: its bore no more than this over the bit, or it does not steer it. `wall`: its
 * wall at least this. `outside`: no bigger across. `length`: no shorter. `lip`: the plastic left between the
 * sleeve's end and the board's edge, which the sleeve is pushed in against. `flange`: a flange no bigger across.
 * `flangeBehindEdge`: a flange let into the fence stops this far short of the board's edge.
 */
export const SLEEVE_LIMITS = { looseBore: 0.6, wall: 0.5, outside: 10, length: 2, lip: 0.8, flange: 16, flangeBehindEdge: 0.2 };

/**
 * Where the lip at the fence stops a plain sleeve, along the bore from the board's edge. The bore meets the edge
 * at an angle, so a fatter sleeve stops a little further from it.
 */
export function sleeveLipAt(outside: Mm, angleDeg: number = POCKET.angleDeg): Mm {
  const a = (angleDeg * Math.PI) / 180;
  return -(SLEEVE_LIMITS.lip + (outside / 2) * Math.sin(a)) / Math.cos(a);
}

/** How much sleeve a bore holds, from its back to the lip at the fence: the longest bore's, unless one is given. */
export const sleeveRoom = (outside: Mm, angleDeg: number = POCKET.angleDeg, bore: Mm = POCKET.guideOutsideMost): Mm => bore + sleeveLipAt(outside, angleDeg);

/**
 * Where a flanged sleeve let into the fence ends, along the bore from the board's edge: its flange's face, just
 * short of the edge, which the bore meets at an angle.
 */
export function fenceFlangeAt(flangeDiameter: Mm, angleDeg: number = POCKET.angleDeg): Mm {
  const a = (angleDeg * Math.PI) / 180;
  return -(SLEEVE_LIMITS.flangeBehindEdge + (flangeDiameter / 2) * Math.sin(a)) / Math.cos(a);
}

/**
 * How much sleeve a guide holds in all, with its bore as long as it may be: plain ones to the lip; two flanged
 * ones, from the boss's back to the fence.
 */
export const sleeveHolds = (sleeve: PocketSleeve, angleDeg: number = POCKET.angleDeg): Mm =>
  sleeve.flange && sleeve.count === 2 ? POCKET.guideOutsideMost + fenceFlangeAt(sleeve.flange.diameter, angleDeg) : sleeveRoom(sleeve.outside, angleDeg);

/**
 * The guide's bore outside the part's edge for a sleeve: as long as its sleeves need in all (one long one, or two
 * in line), in whole mm, and no shorter than the least. It goes by the 15 degree guide, where a sleeve stops
 * furthest from the edge, so the guides for one sleeve have one bore at every angle and the bit is chucked once.
 */
export function boreOutside(sleeve: PocketSleeve = POCKET_SLEEVE): Mm {
  const end = sleeve.flange && sleeve.count === 2 ? fenceFlangeAt(sleeve.flange.diameter) : sleeveLipAt(sleeve.outside);
  const needed = Math.ceil(sleeve.count * sleeve.length - end - 1e-9) || 0;
  return Math.min(POCKET.guideOutsideMost, Math.max(POCKET.guideOutside, needed));
}

/** The sleeve a job's guide is printed for: among its params when the shop has one of its own. */
export const jigSleeve = (jig: Pick<JigInstance, 'params'>): PocketSleeve =>
  jig.params.sleeveBore
    ? {
        bore: jig.params.sleeveBore,
        outside: jig.params.sleeveOutside!,
        length: jig.params.sleeveLength!,
        count: jig.params.sleeveCount === 2 ? 2 : 1,
        ...(jig.params.sleeveFlange ? { flange: { diameter: jig.params.sleeveFlange, thickness: jig.params.sleeveFlangeThickness! } } : {}),
      }
    : POCKET_SLEEVE;

/** A sleeve as a job's guide carries it among its params. */
export const sleeveParams = (sleeve: PocketSleeve): Record<string, Mm> => ({
  sleeveBore: sleeve.bore,
  sleeveOutside: sleeve.outside,
  sleeveLength: sleeve.length,
  sleeveCount: sleeve.count,
  ...(sleeve.flange ? { sleeveFlange: sleeve.flange.diameter, sleeveFlangeThickness: sleeve.flange.thickness } : {}),
});

const sleeveNumber = (v: Mm) => String(+v.toFixed(2));
/** A sleeve's size in words: bore × outside × length, and its flange's diameter × thickness. */
export const sleeveWords = (s: PocketSleeve): string =>
  `${sleeveNumber(s.bore)} × ${sleeveNumber(s.outside)} × ${sleeveNumber(s.length)} mm${s.flange ? `, flange ${sleeveNumber(s.flange.diameter)} × ${sleeveNumber(s.flange.thickness)} mm` : ''}`;

/** How a guide's sleeves go in, for the checklist and the notes. */
export function sleeveGoesIn(s: PocketSleeve): string {
  if (s.flange) return s.count === 2 ? 'one from the back and one from the fence side, each until its flange is seated' : 'from the back, until its flange is seated';
  return s.count === 2 ? 'from the back, the first up to its stop and the second flush with the back' : 'from the back, up to its stop';
}

/** What is wrong with a sleeve for a guide: its bore against the bit, its wall, and whether it fits in the guide. */
export function sleeveProblems(sleeve: PocketSleeve, drill: Mm = POCKET.drill, angleDeg: number = POCKET.angleDeg): string[] {
  const found: string[] = [];
  const L = SLEEVE_LIMITS;
  if (![sleeve.bore, sleeve.outside, sleeve.length].every((v) => v > 0)) return ["The sleeve's sizes must be more than 0."];
  if (sleeve.bore < drill) found.push(`The sleeve's bore is smaller than the ${sleeveNumber(drill)} mm drill bit.`);
  else if (sleeve.bore > drill + L.looseBore + 1e-9) found.push(`The sleeve's bore is too loose to steer a ${sleeveNumber(drill)} mm bit: ${sleeveNumber(drill + L.looseBore)} mm at most.`);
  if (sleeve.outside < sleeve.bore + 2 * L.wall - 1e-9) found.push(`The sleeve's wall is too thin: at least ${sleeveNumber(sleeve.bore + 2 * L.wall)} mm outside.`);
  if (sleeve.outside > L.outside + 1e-9) found.push(`The sleeve is too big across for the guide: ${L.outside} mm outside at most.`);
  if (sleeve.length < L.length - 1e-9) found.push(`The sleeve is too short: at least ${L.length} mm.`);
  if (sleeve.flange) {
    const f = sleeve.flange;
    if (!(f.diameter > sleeve.outside) || !(f.thickness > 0)) found.push("The flange must be bigger across than the sleeve, and its thickness more than 0.");
    else if (f.diameter > L.flange + 1e-9) found.push(`The flange is too big across for the guide: ${L.flange} mm at most.`);
    if (f.thickness >= sleeve.length) found.push("The flange is as thick as the sleeve is long: the length is over all.");
  }
  const room = sleeveHolds({ ...sleeve, outside: Math.min(sleeve.outside, L.outside), ...(sleeve.flange ? { flange: { ...sleeve.flange, diameter: Math.min(sleeve.flange.diameter, L.flange) } } : {}) }, angleDeg);
  if (sleeve.count * sleeve.length > room + 1e-9) found.push(`${sleeve.count === 2 ? 'Two sleeves' : 'A sleeve'} this long ${sleeve.count === 2 ? 'do' : 'does'} not fit: the guide holds ${sleeveNumber(Math.floor(room * 10) / 10)} mm${sleeve.count === 2 ? ' in all' : ''}.`);
  return found;
}

/**
 * The stock the printed guide is made for. Only one thing about the guide follows the
 * stock's thickness: its bore meets the edge at half of it. Sheets sold as one thickness measure a little
 * differently (3/4" plywood is 23/32"), and half of that difference is nothing to a pocket screw, so one
 * guide does every stock of a nominal thickness: it is made for `mm`, and used from `from` to `to`.
 */
export const GUIDE_STOCK = [
  { id: '3/4', name: '3/4"', mm: 18.65, from: 17.8, to: 19.5 },
  { id: '5/8', name: '5/8"', mm: 15.5, from: 14.8, to: 16.3 },
  { id: '1/2', name: '1/2"', mm: 12.3, from: 11.6, to: 13.1 },
] as const;

/** The nominal stock a measured thickness is, when it is one the guide is made for. */
export const guideStock = (thickness: Mm) => GUIDE_STOCK.find((s) => thickness >= s.from && thickness <= s.to);

/** The thickness a guide for stock this thick is made for: its nominal stock's, or its own. */
export const guideThickness = (thickness: Mm): Mm => guideStock(thickness)?.mm ?? thickness;

/** Half the width of the printed guide's key, which stands between the trough's upright walls: the bore's radius, less a running fit. */
export const KEY_RADIUS: Mm = (POCKET.bore - POCKET.keyFit) / 2;

export interface PocketShape {
  thickness: Mm;
  /** The ball's radius. */
  r: Mm;
  /** Radius of the cylinder the ball's centre stays on, around the axis: bore radius less the ball's. */
  orbit: Mm;
  sin: number;
  cos: number;
  /** Where the screw's head bears, along the axis from the edge. */
  seat: Mm;
  /** Where the ball's centre stops at the seat end of every line. */
  end: Mm;
  /** The deepest point of the floor below the face. */
  depth: Mm;
  /** How far in from the edge the pocket reaches at the face. */
  length: Mm;
  /** False when the stock is too thin to leave `minFloor` under the pocket, or the ball is wider than the bore. */
  fits: boolean;
}

/** The pocket for stock of one thickness, cut with a ball nose of one diameter. */
export function pocketShape(thickness: Mm, ballDiameter: Mm): PocketShape {
  const angle = (POCKET.angleDeg * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const r = ballDiameter / 2;
  const orbit = POCKET.bore / 2 - r;
  const seat = POCKET.seatShare * thickness;
  const end = seat + r;
  const depth = thickness / 2 - end * sin + orbit * cos + r;
  // The lowest line leaves the face where the ball's tip comes up to it.
  const out = (r + thickness / 2 + orbit * cos) / sin;
  return {
    thickness,
    r,
    orbit,
    sin,
    cos,
    seat,
    end,
    depth,
    length: out * cos + orbit * sin,
    fits: orbit >= 0 && thickness - depth >= POCKET.minFloor - 1e-9,
  };
}

/** The ball's centre: `u` in from the edge, `y` to the side of the axis, `z` from the face. */
export interface BallCentre {
  u: Mm;
  y: Mm;
  z: Mm;
}

/**
 * The ball's centre at `s` along the axis, on the line `theta` round it: 0 is the
 * bottom of the bore, a quarter turn either way is level with the axis.
 */
export function onLine(shape: PocketShape, s: Mm, theta: number): BallCentre {
  const down = shape.orbit * Math.cos(theta);
  return {
    u: s * shape.cos + down * shape.sin,
    y: shape.orbit * Math.sin(theta),
    z: -shape.thickness / 2 + s * shape.sin - down * shape.cos,
  };
}

/** The ball's centre on the axis itself. */
export const onAxis = (shape: PocketShape, s: Mm): BallCentre => ({ u: s * shape.cos, y: 0, z: -shape.thickness / 2 + s * shape.sin });

/** Where along a line the ball's tip is at height `tip` (0: the face). */
export function lineAt(shape: PocketShape, theta: number, tip: Mm): Mm {
  return (tip + shape.r + shape.thickness / 2 + shape.orbit * Math.cos(theta) * shape.cos) / shape.sin;
}

/**
 * The ball's centre against the seat, `up` above the axis (along the seat's own slope) and `y` to its
 * side: the seat is square to the axis, so it leans back toward the edge as it rises.
 */
export const onSeat = (shape: PocketShape, up: Mm, y: Mm): BallCentre => ({
  u: shape.end * shape.cos - up * shape.sin,
  y,
  z: -shape.thickness / 2 + shape.end * shape.sin + up * shape.cos,
});

/** How far in from the edge the ball's centre may come at height `z` and stay off the seat. */
export const seatAt = (shape: PocketShape, z: Mm): Mm => (shape.end - (z + shape.thickness / 2) * shape.sin) / shape.cos;

/**
 * The lowest the ball's centre may be at (`u`, `y`) and stay inside the pocket: on the
 * round floor, or `allow` above it. Infinity to the side of the bore.
 */
export function floorAt(shape: PocketShape, u: Mm, y: Mm, allow: Mm = 0): Mm {
  const reach = shape.orbit - allow;
  if (Math.abs(y) > reach + 1e-9) return Infinity;
  const h = Math.sqrt(Math.max(0, reach * reach - y * y));
  return -shape.thickness / 2 + (u * shape.sin) / shape.cos - h / shape.cos + allow;
}

/**
 * Where a pocket hole is in its part's own frame: the point its axis leaves the edge
 * through, and the direction into the part.
 */
export function pocketAxis(size: { width: Mm; height: Mm }, edge: PartEdge, at: Mm, inset: Mm = 0): { exit: Point; inward: Point } {
  // `inset`: the part's outline is cut back there (a side's toe-kick notch), and the screw leaves through that cut.
  switch (edge) {
    case 'x0':
      return { exit: { x: inset, y: at }, inward: { x: 1, y: 0 } };
    case 'x1':
      return { exit: { x: size.width - inset, y: at }, inward: { x: -1, y: 0 } };
    case 'y0':
      return { exit: { x: at, y: inset }, inward: { x: 0, y: 1 } };
    case 'y1':
      return { exit: { x: at, y: size.height - inset }, inward: { x: 0, y: -1 } };
  }
}

/**
 * How far the pilot bit stands out of the drill's chuck: through the guide outside the edge, in through
 * the edge to the seat, and a little way out into the pocket. The chuck stops against the guide's back.
 * About 39 mm in 3/4" stock with the usual sleeve, which a regular (jobber) 4 mm or 5/32" bit has.
 */
export function bitOutOfChuck(shape: PocketShape, sleeve?: PocketSleeve): Mm {
  return boreOutside(sleeve) + shape.seat + POCKET.through;
}

/**
 * The pocket as a flat end mill cuts it, an ordinary 1/8" or 1/4" one, to compare with the ball
 * nose's. A slot as wide as the bore with upright
 * walls all the way down. Its floor slopes with the screw, as the bore's does: the bit runs down the slope
 * as the ball does, it does not cut it in steps. At the seat's foot the floor is level for the bit's
 * width, a little deeper there than the bore's own. The seat is still square to the screw: the bit's side
 * cuts it in fine steps down its slope, and it meets the floor in a sharp corner, where the ball leaves a
 * fillet.
 *
 * A bit's side leaves its own radius in the corners where the seat meets the walls. A 1/8" bit's is the
 * ball's. A 1/4" bit's would leave little of the seat flat; a variation that cut on sideways past each wall
 * at the seat (a T from above) was built and taken out, so the slot is for a bit no wider than half the bore.
 *
 * The same printed guide does both pockets: its key stands between the upright walls above the screw's
 * axis, which every one of them has, as wide apart as the bore.
 */
export interface SlotShape {
  thickness: Mm;
  /** The bit's radius, and how far its centre may go to either side of the axis in the slot. */
  r: Mm;
  reach: Mm;
  sin: number;
  cos: number;
  /** Where the screw's head bears, along the axis from the edge. */
  seat: Mm;
  /** The floor's depth below the face at the seat's foot: the deepest the bit goes. */
  depth: Mm;
  /** False when the stock is too thin to leave `minFloor` under the pocket, or the bit is wider than half the bore. */
  fits: boolean;
}

export function slotShape(thickness: Mm, bitDiameter: Mm): SlotShape {
  const angle = (POCKET.angleDeg * Math.PI) / 180;
  const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
  const R = POCKET.bore / 2;
  const r = bitDiameter / 2;
  const seat = POCKET.seatShare * thickness;
  const depth = thickness / 2 - seat * sin + R * cos;
  // A bit more than half the bore across would leave most of the seat to its rounded corners.
  return { thickness, r, reach: R - r, sin, cos, seat, depth, fits: bitDiameter <= R + 1e-9 && thickness - depth >= POCKET.minFloor - 1e-9 };
}

/** How far in from the edge the seat is at height `z`: it leans back toward the edge as it rises. */
export const slotSeatAt = (slot: SlotShape, z: Mm): Mm => (slot.seat - (z + slot.thickness / 2) * slot.sin) / slot.cos;

/** The height of the bore's own floor, the lowest line of it, `u` in from the edge. */
export const slotFloorAt = (slot: SlotShape, u: Mm): Mm => -slot.thickness / 2 + (u * slot.sin) / slot.cos - POCKET.bore / 2 / slot.cos;

/**
 * Where the bit's run down the slope ends, its side against the seat: its bottom's height there. A flat
 * bit's bottom is level, so with its far edge on the floor's slope its near edge, at the seat, is still
 * above the seat's foot; the passes down the seat take it the rest of the way, which leaves the floor level
 * there for the bit's width.
 */
export const slotSlopeEnd = (slot: SlotShape): Mm => -slot.depth + 2 * slot.r * slot.sin * slot.cos;

/** How far in from the edge the bore's own floor comes up to height `z`. */
export const slotOpenAt = (slot: SlotShape, z: Mm): Mm => ((z + slot.thickness / 2) * slot.cos + POCKET.bore / 2) / slot.sin;

/**
 * The slot's opening in the face: from `u0` to `u1` in from the edge and `half` to either side of the axis.
 * With `ledge`, the ledge round it for a printed cover.
 */
export function slotOpening(slot: SlotShape, ledge = false): { u0: Mm; u1: Mm; half: Mm } {
  const out = ledge ? POCKET.ledge.margin : 0;
  return { u0: slotSeatAt(slot, 0) - out, u1: slotOpenAt(slot, 0) + out, half: POCKET.bore / 2 + out };
}

/**
 * The ledge round a pocket's opening for a printed cover: from `u0` to `u1` in from the edge and `half` to either
 * side of the axis, and `fillFrom`, how far in the pocket's floor comes up to the ledge's depth. Past it the
 * pocket is shallower than the ledge, so that end is cleared level.
 */
export interface LedgeOpening {
  u0: Mm;
  u1: Mm;
  half: Mm;
  fillFrom: Mm;
}

/** The ledge round a 15 degree pocket (the ball nose's or the end mill's: its opening does not go by the bit). */
export function slotLedge(slot: SlotShape): LedgeOpening {
  return { ...slotOpening(slot, true), fillFrom: slotOpenAt(slot, -POCKET.ledge.depth) };
}

/**
 * The ledge round a low-angle pocket. Its opening is worked out for the widest bit that cuts one, the bore's
 * width, whose arc meets the face furthest in (by under 2 mm in 1/2" stock): so it covers the pocket whatever
 * bit cut it, and the cover is one plate for every bit's pocket.
 */
export function arcLedge(thickness: Mm, angleDeg: number, seat: Mm = LOW_POCKET.seat): LedgeOpening {
  const shape = arcShape(thickness, POCKET.bore, angleDeg, seat);
  const out = POCKET.ledge.margin;
  // A narrower bit's arc rises a little sooner: start the level end that much further in.
  return { u0: arcSeatAt(shape, 0) - out, u1: shape.end + out, half: POCKET.bore / 2 + out, fillFrom: arcOpenAt(shape, -POCKET.ledge.depth) - 3 };
}

/**
 * A low-angle pocket, as a routed pocket-hole machine cuts it (after Castle's machines, which cut
 * one at 3 degrees and one at 6; untested). The screw leaves the
 * edge at mid-thickness as ever, but climbs only 3 or 6 degrees, so it pulls the joint together with
 * little sideways creep. The pocket is a slot as wide as the bore with upright walls, cut with a flat end
 * mill. Its floor is level for the bit's width at the seat's foot and then rises to the face in an arc, as
 * the swinging router of such a machine leaves it, which keeps it short: a ramp at the screw's own angle
 * would run on for 150 mm and more.
 *
 * So the pocket is short and deep, and the driver comes in steeper than the screw lies (`driverOff`):
 * the screw wants a head that takes a driver off its axis (Castle asks for cheese-head Torx screws in its
 * 3 degree pocket). The seat is further from the edge than a 15 degree pocket's, for the longer screws it
 * takes (`LOW_POCKET.seat`, `screws`), and square to the screw, cut in fine steps as the flat end mill's 15 degree
 * slot is; the bit's side leaves its own radius where the seat meets the walls, which a machine's 3/8" bit
 * leaves too, so here the bit may be as wide as the bore.
 *
 * The pilot is drilled from the edge through the printed guide made for the angle, as the others are.
 *
 * One pocket for every stock (such a machine, set up for 3/4" stock, cuts 1/2" stock on a 1/8" shim, so
 * the pocket only needs to be 1/8" less deep): the pocket is the one
 * made for 3/4" stock (`madeFor`), the seat as far from the edge and the arc the same, cut less deep by half
 * of what the stock is thinner, so the screw still leaves the edge at mid-thickness. Its arc then meets the
 * face sooner, and less is left under it: 1/2" stock keeps about 2 mm, which such a machine leaves too.
 */
export const LOW_POCKET = {
  /** The angles offered: Castle's two. */
  angles: [3, 6] as const,
  /** How far in from the seat's foot the pocket's floor comes up to the face, as a share of the stock's thickness (about 2" in 3/4" stock). Tune me. */
  lengthShare: 2.6,
  /** Half the driver's shaft, which has to pass over the pocket's far lip: a 1/4" hex bit. */
  driverRadius: 3.2,
  /** The stock the pocket is made for: 3/4". Thinner stock gets the same pocket, less deep. */
  madeFor: 19.05,
  /** The least stock left under the pocket: less than a 15 degree pocket's, as a machine's pocket in 1/2" stock has. Tune me. */
  minFloor: 1.5,
  /**
   * The screws (1 1/2" in 3/4" stock, 1 1/4" in 1/2" stock), by the stock's nominal thickness, in mm.
   */
  screws: { '3/4': 38.1, '1/2': 31.75 } as Record<string, Mm>,
  /**
   * The seat's distance from the edge along the screw: 7/8". Worked out from those screws, not measured on a
   * machine: lying this flat a screw goes nearly straight into the other part, and from here a 1 1/2" screw
   * stops 1/8" short of the far face of 3/4" stock, as a 1 1/4" one does of 1/2" stock (the screws differ by
   * what the stocks do). Tune me. It is where the seat starts: it can be set, as on a Castle machine,
   * between `seatRange`'s two ends.
   */
  seat: 22.225,
  seatRange: { min: 12, max: 45 },
};
export type LowAngle = (typeof LOW_POCKET.angles)[number];

export interface ArcShape {
  thickness: Mm;
  angleDeg: number;
  /** The bit's radius, and how far its centre may go to either side of the axis in the slot. */
  r: Mm;
  reach: Mm;
  sin: number;
  cos: number;
  /** Where the screw's head bears, along the axis from the edge. */
  seat: Mm;
  /** The floor's depth below the face at the seat's foot: the deepest the bit goes. */
  depth: Mm;
  /** The seat's foot, in from the edge; where the level floor ends and the arc begins; where the arc meets the face. */
  foot: Mm;
  arcFrom: Mm;
  end: Mm;
  /** The arc's radius and its centre (in from the edge, and above the face). */
  radius: Mm;
  centre: { u: Mm; z: Mm };
  /** How far off the screw's axis the driver has to come in to clear the pocket's far lip, in degrees. */
  driverOff: number;
  /** False when the stock is too thin to leave `LOW_POCKET.minFloor` under the pocket, or the bit is wider than the bore. */
  fits: boolean;
}

/** The low-angle pocket for stock of one thickness, cut with a flat end mill of one diameter. */
export function arcShape(thickness: Mm, bitDiameter: Mm, angleDeg: number, seatFromEdge: Mm = LOW_POCKET.seat): ArcShape {
  const angle = (angleDeg * Math.PI) / 180;
  const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
  const R = POCKET.bore / 2;
  const r = bitDiameter / 2;
  // The pocket made for 3/4" stock, and how much less deep it is cut in this one: half of what it is thinner.
  const made = LOW_POCKET.madeFor;
  const lift = (made - thickness) / 2;
  const seat = seatFromEdge;
  const deepest = made / 2 - seat * sin + R * cos;
  const depth = deepest - lift;
  // The seat is square to the screw: its foot is further in than where it meets the face.
  const foot = (seat + (deepest - made / 2) * sin) / cos;
  const arcFrom = foot + 2 * r;
  // An arc that leaves the level floor at the screw's own slope and meets the face of 3/4" stock so far in:
  // the angle between its chord and its first tangent is half the angle it turns through.
  const [run, rise] = [Math.max(arcFrom + deepest, foot + LOW_POCKET.lengthShare * made) - arcFrom, deepest];
  const half = Math.atan2(rise, run) - angle;
  const radius = Math.hypot(run, rise) / (2 * Math.sin(half));
  const centre = { u: arcFrom - radius * sin, z: -depth + radius * cos };
  // Where that arc meets this stock's face.
  const end = centre.u + Math.sqrt(Math.max(0, radius * radius - centre.z * centre.z));
  // The driver's tip is on the screw's head, on the axis at the seat; its shaft passes over the far lip.
  const head = { u: seat * cos, z: -thickness / 2 + seat * sin };
  const driver = (Math.atan2(-head.z + LOW_POCKET.driverRadius, end - head.u) * 180) / Math.PI;
  return { thickness, angleDeg, r, reach: R - r, sin, cos, seat, depth, foot, arcFrom, end, radius, centre, driverOff: driver - angleDeg, fits: r <= R + 1e-9 && depth > R && thickness - depth >= LOW_POCKET.minFloor - 1e-9 && seat >= LOW_POCKET.seatRange.min - 1e-9 && seat <= LOW_POCKET.seatRange.max + 1e-9 };
}

/** The screw a low-angle pocket in stock this thick takes, in mm, where it is known: by the stock's nominal thickness. */
export const lowPocketScrew = (thickness: Mm): Mm | undefined => LOW_POCKET.screws[guideStock(thickness)?.id ?? ''];

/** How far in from the edge the seat is at height `z`: it leans back toward the edge as it rises. */
export const arcSeatAt = (shape: ArcShape, z: Mm): Mm => (shape.seat - (z + shape.thickness / 2) * shape.sin) / shape.cos;

/** The height of the pocket's floor `u` in from the edge: level at the seat's foot, then the arc up to the face. */
export function arcFloorAt(shape: ArcShape, u: Mm): Mm {
  if (u <= shape.arcFrom) return -shape.depth;
  if (u >= shape.end) return 0;
  return Math.min(0, shape.centre.z - Math.sqrt(Math.max(0, shape.radius * shape.radius - (u - shape.centre.u) * (u - shape.centre.u))));
}

/**
 * Whether a printed cover goes over a low-angle pocket in stock this thick: the screw's head (taken as wide as the
 * bore) stays under the cover's plate, hollowed over it. In thin stock the pocket is cut less deep, so the head
 * comes up nearly to the face (in 1/2" stock it does at either angle) and no cover fits.
 */
export function lowCoverFits(thickness: Mm, angleDeg: number, seat: Mm = LOW_POCKET.seat): boolean {
  const a = (angleDeg * Math.PI) / 180;
  const headTop = -thickness / 2 + seat * Math.sin(a) + (POCKET.bore / 2) * Math.cos(a);
  return headTop <= -POCKET.ledge.skin + 1e-9;
}

/** How far in from the edge the pocket's floor comes up to height `z`: the arc, read the other way. */
export function arcOpenAt(shape: ArcShape, z: Mm): Mm {
  if (z >= 0) return shape.end;
  if (z <= -shape.depth) return shape.arcFrom;
  const dz = shape.centre.z - z;
  return shape.centre.u + Math.sqrt(Math.max(0, shape.radius * shape.radius - dz * dz));
}
