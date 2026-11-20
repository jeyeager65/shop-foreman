/**
 * Where each cabinet part sits in the 3D view, assembled and exploded, and how the
 * doors swing open and the drawers pull out. Display only; it reads the parts'
 * placements and changes nothing.
 *
 * Cabinet frame (see `model/cabinet.ts`): origin at the case's front-left corner
 * on the floor, X right, Y up, Z out toward the viewer.
 */
import { isTrayPart, trayOf } from './underSink';
import type { CabinetPartRole, Hardware, Hinge, Mm, Part, Slide, Vec3 } from '@/model';
import { slideCentreUp } from './slides';
import { type HingeLinkage, type HingeMount, type HingeShapes, doorPose, doorReach, hingeFamily, hingeLinkage, hingeShapes } from './hingeModel';

export interface PlacedPart {
  partId: string;
  role?: CabinetPartRole;
  /**
   * Places the part's solid (X right and Y up on face A, Z from the back face up
   * to face A): cabinet point = offset + x * axes[0] + y * axes[1] + z * axes[2].
   */
  axes: [Vec3, Vec3, Vec3];
  offset: Vec3;
  /** Which way the part moves in the exploded view; zero for the part that stays. */
  explode: Vec3;
  /**
   * A door: it turns about a vertical line through `pivot`, by `sign` times the
   * opening angle about +Y. The pivot is the hinged edge of the door's back face,
   * a plain butt hinge: it shows how the door opens, not the hinge's real path.
   *
   * An inset door sits between the case sides, so a plain pivot would swing its
   * hinged edge through the side. It turns about the hinged edge of its front face
   * instead and, as an inset cup hinge does, moves across into the opening as it
   * opens: `clear` says how far, so its back corner stays `gap` off the side.
   */
  swing?: { pivot: Vec3; sign: 1 | -1; clear?: { thickness: Mm; gap: Mm; toward: 1 | -1 } };
  /** A drawer's front and box: how far they come forward (+Z) when the drawer is pulled right out. */
  slide?: Mm;
  /**
   * How much of that the drawer comes out by when the view's drawer slider is at its
   * end: a cabinet's drawers open in steps, the bottom one all the way and each one
   * above it less, so every drawer shows. 1 for a cabinet's only drawer.
   */
  pullShare?: number;
  /**
   * A blind corner cabinet's trays are used one after another, and both must be seen to slide out: the view's
   * drawer slider plays that in `pullStages` equal steps. `pullStage` is
   * the step a part moves in: a tray in front of the door comes right out by its `slide`, a blind corner tray
   * (and the platform under one) slides `across` the cabinet (+X or -X). A blind corner tray on a platform then
   * comes out of the door opening by its `slide`, in `forwardStage`. The order is the order of use: a higher
   * blind tray clears the tray in front of the door, so it goes across (and comes forward) first, with that
   * tray in; then the tray in front of the door comes out, and the lowest blind tray goes across into the
   * place it left.
   */
  pullStage?: number;
  forwardStage?: number;
  pullStages?: number;
  across?: Mm;
  /** It turns about a vertical line through this point (x, z) with the view's Doors slider: a lazy susan with its doors on it (`Part.moves`). */
  turnsAbout?: [Mm, Mm];
  /** It tips forward about a level line across the cabinet through this point (y, z) with the Doors slider: a tilt-out false front and its tray. */
  tiltsAbout?: [Mm, Mm];
  /** It swings down about a level line across the cabinet through this point (y, z) with the view's Leaf slider: a table's leaf (`Part.moves`). */
  foldsAbout?: [Mm, Mm];
  /** A bracket under a drop leaf: it swings in a quarter turn about an upright line through `at` (x, z) before the leaf goes down (`Part.moves`). */
  swingsIn?: { at: [Mm, Mm]; sign: 1 | -1 };
  /** The leaf is on an end (1 the right, -1 the left): `foldsAbout` is then (x, y), a line from front to back, and `foldsFirst.at` is (y, z). */
  foldsAcross?: 1 | -1;
  /** The leaf is along the front: it swings down the other way round from one at the back. */
  foldsFront?: true;
  /** A leg under a leaf: before the leaf goes down it folds flat against it, a quarter turn about a level line from front to back through `at` (x, y). */
  foldsFirst?: { at: [Mm, Mm]; sign: 1 | -1 };
  /**
   * The second door of a bi-fold pair (`Part.moves`): it goes where the door `partId` goes, and unfolds from it
   * about the vertical line through `knuckle` (where it is when closed), `sign` saying which way round.
   */
  follows?: { partId: string; knuckle: Vec3; sign: 1 | -1 };
  /** The cabinet the part belongs to, when the view shows several: a click on the part picks it. */
  cabinetId?: string;
  /**
   * A door's hinges, when the hardware library was to hand and a linkage could be worked
   * out for them: the door then moves as its hinges carry it (`design/hingeModel.ts`), not
   * about the plain pivot of `swing`.
   */
  hinges?: DoorHinges;
  /**
   * A door hinged on a partition or a mullion with another door on its other face: it keeps to its own
   * side of the member's middle (`least`, in the hinge's frame), and opens no further than `openLimit`,
   * where the two would meet. `placedDoorPose` is the door's place with both seen to.
   */
  shared?: { least: Mm; width: Mm; thickness: Mm; openLimit: number };
  /** A drawer box's side: the slide beside it, between it and the case side (or the strip that carries the slide). */
  runsOn?: SlideModel;
  /** The bottom of a tray on bottom-mount slides: the pair under it, each `width` wide and `height` tall, its middle at each of `xs`, from `front` back by `length`, its top at `top`. */
  runsUnder?: { xs: Mm[]; top: Mm; height: Mm; width: Mm; front: Mm; length: Mm };
}

/** A drawer and the slide it runs on: what the view needs to draw the slides beside its box. */
export interface SlideMount {
  /** The drawer: its box's parts carry its id as their design object. Or a tray inside a cabinet (`trayOf` its parts). */
  drawerId: string;
  slide: Slide;
  /** The length in use. */
  length: Mm;
  /** A tray on bottom-mount slides: they lie under its bottom, this tall and wide, this far in from its sides. Left out: at its sides. */
  under?: { height: Mm; width: Mm; inset: Mm };
}

/**
 * One slide in the cabinet, in the cabinet's frame. It fills the side clearance
 * between the box side and the case side (or its strip): `outer` is the x of the face
 * its cabinet member is screwed to, and `dir` which way the box is from there.
 */
export interface SlideModel {
  outer: Mm;
  dir: 1 | -1;
  /** The side clearance: how far from the outer face to the box side. */
  clearance: Mm;
  /** Its centre line off the floor, and the height of its cabinet member. */
  y: Mm;
  height: Mm;
  /** The front end of its members when the drawer is shut, and their length. */
  front: Mm;
  length: Mm;
  extension: Slide['extension'];
  /** A bottom-mount roller slide: two members, the drawer's an angle under the box side, whose bottom edge is `height / 2` under `y`. */
  bottom?: true;
  /**
   * A slide that runs across the cabinet (a blind corner tray's): its front end is toward +X (1) or -X (-1).
   * `outer` is then the z of the face its cabinet member is screwed to, `dir` which way the tray is from
   * there along Z, and `front` the x of its front end.
   */
  turn?: 1 | -1;
}

/**
 * The slide beside a box side: as long as the slide, its front end level with the
 * box's front end, centred on the side's height, in the side clearance.
 */
export function slideBesideBox(part: Part, mount: SlideMount): SlideModel {
  const box = partBox(part);
  const left = part.id.endsWith('-left');
  const clearance = mount.slide.sideClearance.mm;
  return {
    outer: left ? box.min[0] - clearance : box.max[0] + clearance,
    dir: left ? 1 : -1,
    clearance,
    y: box.min[1] + slideCentreUp(mount.slide, box.max[1] - box.min[1]),
    height: Math.min(mount.slide.memberHeight, box.max[1] - box.min[1]),
    front: box.max[2],
    length: mount.length,
    extension: mount.slide.extension,
    ...(mount.slide.mount === 'bottom' ? { bottom: true as const } : {}),
  };
}

/**
 * The slide beside a side of a blind corner tray, which runs across the cabinet: between the tray's side and
 * the standard it hangs on, in front of the tray or behind it (`toward`: which way the tray is from the
 * standard, along Z), its front end toward the door opening (`turn`).
 */
export function slideBesideBlindTray(part: Part, mount: SlideMount, toward: 1 | -1, turn: 1 | -1): SlideModel {
  const box = partBox(part);
  const clearance = mount.slide.sideClearance.mm;
  return {
    outer: toward > 0 ? box.min[2] - clearance : box.max[2] + clearance,
    dir: toward,
    clearance,
    y: box.min[1] + slideCentreUp(mount.slide, box.max[1] - box.min[1]),
    height: Math.min(mount.slide.memberHeight, box.max[1] - box.min[1]),
    front: turn > 0 ? box.max[0] : box.min[0],
    length: mount.length,
    extension: mount.slide.extension,
    ...(mount.slide.mount === 'bottom' ? { bottom: true as const } : {}),
    turn,
  };
}

/** The hinges of one door: where they are in the cabinet, how the door moves on them, and what they look like. */
export interface DoorHinges {
  /** Which way the hinge's X runs in the cabinet: 1 for a door hinged at its left, -1 at its right. */
  dir: 1 | -1;
  /** The hinge plane's origin in the cabinet: x of the case side's inner face (the stile's inner edge), z of the front the door closes against. */
  origin: { x: Mm; z: Mm };
  /** The height of each hinge: its cup's centre, off the floor. */
  heights: Mm[];
  mount: HingeMount;
  linkage: HingeLinkage;
  shapes: HingeShapes;
  /** Which way what is fixed to the case moves in the exploded view: with the side, or the frame. */
  explode: Vec3;
  /** The middle, across the cabinet, of what the door is hinged on: two doors with the same one share it. */
  memberMid: Mm;
}

export interface CabinetAssembly {
  parts: PlacedPart[];
  /** The assembled cabinet's bounding box. */
  min: Vec3;
  max: Vec3;
  /** How far a part moves when fully exploded. */
  explodeDistance: Mm;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * How far behind its front a cabinet's rearmost case part is, from its placed parts: what
 * touches the wall (a cleat's standoff counts). A top and a torsion table's ribs do not count,
 * nor a one-row island's finished back: they overhang or cover the whole row but are its first
 * cabinet's parts, and counting them would stand that cabinet out of line with the rest. Nor the stools drawn at
 * an island's seating side, which would move that one cabinet.
 */
export function cabinetBack(parts: Part[]): Mm {
  const counts = (p: Part) => p.placement && p.role !== 'top' && p.role !== 'topEdge' && p.role !== 'rib' && !/\/island-back(-\d+)?$/.test(p.id) && !p.id.endsWith('/hub-back') && !p.id.endsWith('/back-filler') && !p.id.includes('/stool-');
  return Math.max(0, ...parts.filter(counts).map((p) => -partBox(p).min[2]));
}

/** The part's bounding box in the cabinet frame. */
export function partBox(part: Part): { min: Vec3; max: Vec3 } {
  if (!part.placement) throw new Error(`${part.name} has no place in a cabinet.`);
  const { origin, xAxis, yAxis } = part.placement;
  const n = cross(xAxis, yAxis);
  const far = origin.map((o, i) => o + part.size.width * xAxis[i]! + part.size.height * yAxis[i]! - part.size.thickness * n[i]!);
  return {
    min: origin.map((o, i) => Math.min(o, far[i]!)) as Vec3,
    max: origin.map((o, i) => Math.max(o, far[i]!)) as Vec3,
  };
}

const withHinges = (hinges: DoorHinges | undefined) => (hinges ? { hinges } : {});

/** Between two cabinets that stand in a row in the whole-project view, until a run says where they stand. Tune me. */
export const ROW_GAP: Mm = 150;

/**
 * Where each cabinet stands when the whole project is shown: its front-left corner. They
 * stand in a row in list order, a gap apart, a wall cabinet at its height off the floor.
 * The cabinets of a run stand as built: side by side with nothing between them, where
 * the first of them comes in the list, with room at the run's ends for its fillers.
 */
export function rowOfCabinets(
  cabinets: { id: string; width: Mm; offFloor?: Mm; runId?: string; fillerLeft?: Mm; fillerRight?: Mm }[],
  gap: Mm = ROW_GAP,
): Map<string, Vec3> {
  const at = new Map<string, Vec3>();
  let x = 0;
  for (const cabinet of cabinets) {
    if (at.has(cabinet.id)) continue;
    const group = cabinet.runId ? cabinets.filter((c) => c.runId === cabinet.runId) : [cabinet];
    for (const member of group) {
      x += member.fillerLeft ?? 0;
      at.set(member.id, [x, member.offFloor ?? 0, 0]);
      x += member.width + (member.fillerRight ?? 0);
    }
    x += gap;
  }
  return at;
}

/**
 * Several cabinets in one view. Each is assembled in its own frame, as it is on its
 * own (its sides pull off to its own left and right, its doors turn on its own
 * sides), and then set down at `at`.
 */
export function buildProjectAssembly(cabinets: { id: string; at: Vec3; parts: Part[] }[], hardware: Hardware[] = [], slides: SlideMount[] = []): CabinetAssembly {
  const built = cabinets.filter((c) => c.parts.length > 0).map((c) => ({ ...c, assembly: buildCabinetAssembly(c.parts, hardware, slides) }));
  const shift = (v: Vec3, by: Vec3): Vec3 => [v[0] + by[0], v[1] + by[1], v[2] + by[2]];
  const parts = built.flatMap(({ id, at, assembly }) =>
    assembly.parts.map(
      (part): PlacedPart => ({
        ...part,
        cabinetId: id,
        offset: shift(part.offset, at),
        ...(part.swing ? { swing: { ...part.swing, pivot: shift(part.swing.pivot, at) } } : {}),
        ...(part.swingsIn ? { swingsIn: { ...part.swingsIn, at: [part.swingsIn.at[0] + at[0], part.swingsIn.at[1] + at[2]] as [Mm, Mm] } } : {}),
        // A leaf's hinge line and its legs': (y, z) and (x, y) for a leaf at the back, the other way round on an end.
        ...(part.foldsAbout ? { foldsAbout: (part.foldsAcross ? [part.foldsAbout[0] + at[0], part.foldsAbout[1] + at[1]] : [part.foldsAbout[0] + at[1], part.foldsAbout[1] + at[2]]) as [Mm, Mm] } : {}),
        ...(part.foldsFirst
          ? { foldsFirst: { ...part.foldsFirst, at: (part.foldsAcross ? [part.foldsFirst.at[0] + at[1], part.foldsFirst.at[1] + at[2]] : [part.foldsFirst.at[0] + at[0], part.foldsFirst.at[1] + at[1]]) as [Mm, Mm] } }
          : {}),
        ...(part.hinges ? { hinges: { ...part.hinges, origin: { x: part.hinges.origin.x + at[0], z: part.hinges.origin.z + at[2] }, heights: part.hinges.heights.map((y) => y + at[1]) } } : {}),
        ...(part.runsOn ? { runsOn: { ...part.runsOn, outer: part.runsOn.outer + at[0], y: part.runsOn.y + at[1], front: part.runsOn.front + at[2] } } : {}),
      }),
    ),
  );
  if (!built.length) return { parts, min: [0, 0, 0], max: [0, 0, 0], explodeDistance: 0 };
  const corner = (pick: (...values: number[]) => number, of: 'min' | 'max') => [0, 1, 2].map((i) => pick(...built.map((b) => b.assembly[of][i]! + b.at[i]!))) as Vec3;
  // Each cabinet comes apart by its own size, so a row of them does not fly apart by the row's length.
  return { parts, min: corner(Math.min, 'min'), max: corner(Math.max, 'max'), explodeDistance: Math.max(...built.map((b) => b.assembly.explodeDistance)) };
}

/**
 * The streaks that show a part's grain: how far apart they lie across the grain, how
 * long each is and the gap to the next along it, each between a least and a most, and
 * how far a streak stays from the part's edges.
 */
export const GRAIN_STREAKS = { apart: [7, 26], long: [35, 190], gap: [25, 150], margin: 4 };

/**
 * Faint streaks along a part's grain, to draw on both its faces: line segments
 * `[x0, y0, x1, y1]` in the part's own frame (X across its width, Y up its height).
 * They are uneven, as the figure of wood is: of different lengths, unevenly spaced
 * and never in line with each other, so they read as the wood's grain and not as a
 * pattern on it, or as hardware. The same part always gets the same streaks. They keep
 * inside the part's outline where that is not its whole rectangle (a side's toe kick
 * notch, a drawer front's finger notch). Nothing for a part with no grain (MDF).
 */
export function grainStreaks(part: Pick<Part, 'grain' | 'size'> & Partial<Pick<Part, 'features'>>): [Mm, Mm, Mm, Mm][] {
  if (!part.grain) return [];
  const { width, height } = part.size;
  const up = part.grain === 'height';
  const [along, across] = up ? [height, width] : [width, height];
  const g = GRAIN_STREAKS;
  // A small seeded generator (mulberry32), so the streaks do not change from one drawing to the next.
  let seed = (Math.round(width * 10) * 73856093) ^ (Math.round(height * 10) * 19349663);
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = ([least, most]: number[]) => least! + random() * (most! - least!);
  const streaks: [Mm, Mm, Mm, Mm][] = [];
  // Where the line a streak lies on is inside the outline: the spans between its crossings of the outline's edges.
  const outline = part.features?.find((f) => f.kind === 'cutout')?.outline;
  const inside = (v: Mm): [Mm, Mm][] => {
    if (!outline) return [[0, along]];
    const crossings: Mm[] = [];
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length]!;
      const [av, au, bv, bu] = up ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x];
      if (av > v !== bv > v) crossings.push(au + ((v - av) / (bv - av)) * (bu - au));
    });
    crossings.sort((a, b) => a - b);
    const spans: [Mm, Mm][] = [];
    for (let i = 0; i + 1 < crossings.length; i += 2) spans.push([crossings[i]!, crossings[i + 1]!]);
    return spans;
  };
  for (let v = g.margin + random() * g.apart[0]!; v < across - g.margin; v += between(g.apart)) {
    for (let u = g.margin - random() * g.long[1]!; u < along - g.margin; ) {
      const end = u + between(g.long);
      for (const [low, high] of inside(v)) {
        const [from, to] = [Math.max(low + g.margin, u), Math.min(high - g.margin, end)];
        if (to - from > 6) streaks.push(up ? [v, from, v, to] : [from, v, to, v]);
      }
      u = end + between(g.gap);
    }
  }
  return streaks;
}

/** How far a cabinet's top drawer comes out, as a share of the bottom one's, with the drawer slider at its end. */
export const TOP_DRAWER_SHARE = 0.4;

/** Share of the cabinet's largest dimension that a part moves when fully exploded. Tune me. */
const EXPLODE_SHARE = 0.25;

/** Fronts (parts without a cabinet role) come off further than the parts behind them. */
const FRONTS_EXPLODE = 1.6;
/** A drawer box is pulled out as one piece, staying behind its front. */
const BOX_EXPLODE = 1.3;

/** How far the doors open in the view, degrees. */
export const MAX_DOOR_OPEN_DEG = 110;
/** How far a bi-fold pair's second door unfolds from the first, in degrees: what a pie-corner hinge opens. */
export const BIFOLD_UNFOLD_DEG = 60;

/** The least an opened inset door is drawn clear of the case side beside it. */
const INSET_SWING_CLEARANCE: Mm = 1;

/** The least two open doors hinged on one partition or mullion are drawn apart: each keeps half of it. */
const SHARED_SWING_CLEARANCE: Mm = 1;

/**
 * How far an opening door hinged beside another is drawn moved across into its own opening, at most. The
 * worked-out linkage swings a door a few millimetres past its closed edge on the way round, more than a
 * maker's hinge does; beside a neighbour that is taken out, so the two do not cross. Tune me.
 */
const SHARED_SWING_SHIFT: Mm = 6;

/**
 * A door hinged on a partition or a mullion with another door on its other face: each keeps to its own
 * side of the member's middle, and stops where no small move across would keep it there (near 90 degrees,
 * where the two doors stand face to face).
 */
function sharedSwing(part: Part, hinges: DoorHinges, others: DoorHinges[]): PlacedPart['shared'] {
  if (!others.some((o) => o !== hinges && o.dir === -hinges.dir && Math.abs(o.memberMid - hinges.memberMid) < 0.01)) return undefined;
  const least = hinges.dir * (hinges.memberMid - hinges.origin.x) + SHARED_SWING_CLEARANCE / 2;
  const { width, thickness } = part.size;
  const top = Math.min(MAX_DOOR_OPEN_DEG, hinges.linkage.openDeg);
  let deg = 0;
  while (deg < top && doorReach(hinges.linkage, deg + 1, width, thickness) >= least - SHARED_SWING_SHIFT) deg++;
  return { least, width, thickness, openLimit: deg };
}

/**
 * Where a door on its hinges is at the view's opening angle, in the hinge's frame: as its linkage carries
 * it, and beside a neighbour on the same partition or mullion no further than the two can open, moved
 * across so it keeps to its own side.
 */
export function placedDoorPose(part: Pick<PlacedPart, 'hinges' | 'shared'>, deg: number): ReturnType<typeof doorPose> {
  const { linkage } = part.hinges!;
  const shared = part.shared;
  if (!shared) return doorPose(linkage, deg);
  const pose = doorPose(linkage, Math.min(deg, shared.openLimit));
  const across = Math.max(0, shared.least - doorReach(linkage, pose.deg, shared.width, shared.thickness));
  const moved = (p: [Mm, Mm]): [Mm, Mm] => [p[0] + across, p[1]];
  return { deg: pose.deg, corner: moved(pose.corner), pivots: [moved(pose.pivots[0]), moved(pose.pivots[1])] };
}

/** How far an inset door has moved across into its opening at an opening angle, in the direction `clear.toward` along X. */
export function insetSwingShift(clear: NonNullable<NonNullable<PlacedPart['swing']>['clear']>, angleRad: number): Mm {
  // The hinged edge of the back face swings toward the side by the door's thickness times the sine of the angle.
  return Math.max(0, clear.thickness * Math.sin(Math.min(angleRad, Math.PI / 2)) - clear.gap + INSET_SWING_CLEARANCE);
}

/**
 * A door's hinge line. The door is the front with hinge cups; they are bored near
 * the hinged edge, so their place across the door says which edge that is. `sides`
 * are the boxes of the case sides: a door whose hinged edge lies between them, behind
 * their front edges, is inset.
 */
function doorSwing(part: Part, sides: { min: Vec3; max: Vec3 }[] = []): PlacedPart['swing'] {
  const cups = part.features.filter((f) => f.kind === 'cup');
  if (!cups.length || !part.placement) return undefined;
  const { origin, xAxis, yAxis } = part.placement;
  const n = cross(xAxis, yAxis);
  const atLeft = cups.reduce((sum, c) => sum + (c.kind === 'cup' ? c.center.x : 0), 0) / cups.length < part.size.width / 2;
  const along = atLeft ? 0 : part.size.width;
  // Toward the free edge, then out from the cabinet: which way round that is about +Y.
  const free = xAxis.map((v) => (atLeft ? v : -v)) as Vec3;
  const sign = cross(free, n)[1] < 0 ? -1 : 1;
  const back = origin.map((o, i) => o + along * xAxis[i]! - part.size.thickness * n[i]!) as Vec3;
  // The side this door is hinged beside, when the door's back is behind that side's front edge.
  const toward = free[0] >= 0 ? 1 : -1;
  const gaps = sides
    .filter((s) => back[2] < s.max[2] - 0.01 && back[1] < s.max[1] && back[1] + part.size.height > s.min[1])
    .map((s) => (toward === 1 ? back[0] - s.max[0] : s.min[0] - back[0]))
    .filter((g) => g > -0.01);
  if (!gaps.length) return { pivot: back, sign };
  const front = origin.map((o, i) => o + along * xAxis[i]!) as Vec3;
  return { pivot: front, sign, clear: { thickness: part.size.thickness, gap: Math.min(...gaps), toward } };
}

/**
 * A door's hinges: found from its cups, which say which hinge and where up the door,
 * and from what the hinge is fixed to, the case side beside the door's hinged edge or
 * the stile of the face frame. Nothing when the door has no cups, the library does not
 * have the hinge, or no linkage can be worked out.
 */
function doorHinges(part: Part, boxes: { part: Part; box: { min: Vec3; max: Vec3 } }[], hardware: Hardware[]): DoorHinges | undefined {
  const cups = part.features.flatMap((f) => (f.kind === 'cup' ? [f] : []));
  // The hinge model works across the cabinet's X: a door on a face of its own (an L-shaped corner's) turns on its plain pivot.
  if (!cups.length || !part.placement || Math.abs(part.placement.xAxis[0]) < 0.99) return undefined;
  const hinge = hardware.find((h): h is Hinge => h.kind === 'hinge' && h.id === cups[0]!.hardwareId);
  if (!hinge) return undefined;
  const family = hingeFamily(hinge);
  const atLeft = cups.reduce((sum, c) => sum + c.center.x, 0) / cups.length < part.size.width / 2;
  const dir = atLeft ? 1 : -1;
  const { origin } = part.placement;
  const edge = atLeft ? origin[0] : origin[0] + part.size.width;
  // What it is fixed to: the stile (or mullion) or the case side (or partition) nearest the hinged edge.
  const roles = family === 'frame' ? ['frameStile'] : ['side', 'partition'];
  const on = boxes.filter((b) => !!b.part.role && roles.includes(b.part.role)).sort((a, b) => Math.abs((a.box.min[0] + a.box.max[0]) / 2 - edge) - Math.abs((b.box.min[0] + b.box.max[0]) / 2 - edge))[0];
  if (!on) return undefined;
  const x = atLeft ? on.box.max[0] : on.box.min[0];
  const z = on.box.max[2];
  const mount: HingeMount = {
    family,
    closed: [dir * (edge - x), origin[2] - part.size.thickness - z],
    doorThickness: part.size.thickness,
    mountThickness: family === 'frame' ? on.box.max[2] - on.box.min[2] : on.box.max[0] - on.box.min[0],
  };
  const linkage = hingeLinkage(hinge, mount);
  if (!linkage) return undefined;
  return {
    dir,
    origin: { x, z },
    heights: cups.map((c) => origin[1] + c.center.y),
    mount,
    linkage,
    shapes: hingeShapes(hinge, mount, linkage),
    explode: family === 'frame' ? [0, 0, 1] : [-dir, 0, 0],
    memberMid: (on.box.min[0] + on.box.max[0]) / 2,
  };
}

/**
 * The parts placed in the cabinet, each with the way it pulls off in the exploded
 * view: sides outward, back to the rear, stretchers up, the toe kick, shelves and
 * the face frame forward, the fronts further forward. The bottom stays where it is.
 */
export function buildCabinetAssembly(all: Part[], hardware: Hardware[] = [], slides: SlideMount[] = []): CabinetAssembly {
  // A wooden handle has no place of its own: the view draws it on its front's holes. Nor has a part that is bent
  // after it is cut (a lazy susan's rim strip): what is drawn for it comes apart from the parts.
  const parts = all.filter((p) => p.role !== 'handle' && p.placement);
  const boxes = parts.map(partBox);
  const min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]!))) as Vec3;
  const max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]!))) as Vec3;
  const middle = (min[0] + max[0]) / 2;

  // A drawer pulls out by the length of its box: a full-extension slide's travel, near enough.
  // What moves together: a drawer (its front and its box), or one tray under a sink.
  const mover = (part: Part) => (isTrayPart(part) ? trayOf(part) : part.designObjectId);
  const travel = new Map<string, Mm>();
  parts.forEach((part, i) => {
    if (!part.role?.startsWith('box')) return;
    const depth = boxes[i]!.max[2] - boxes[i]!.min[2];
    travel.set(mover(part), Math.max(travel.get(mover(part)) ?? 0, depth));
  });

  // A blind corner tray (its walls and bottom, not its frame) slides across the cabinet by its own length,
  // toward the trays in front of the door, which come right out first.
  const isBlindTray = (part: Part) => /\/sink-blind(-\d+)?(-platform)?\/[^/]+$/.test(part.id);
  /** What goes across together: a blind corner tray, with the platform under it when it has one. */
  const blindOf = (part: Part) => trayOf(part).replace(/-platform$/, '');
  /** The trays that ride on a platform: once across, they come forward too, by their own depth. */
  const onPlatform = new Set(parts.filter((part) => /-platform$/.test(trayOf(part))).map(blindOf));
  const forward = new Map<string, Mm>();
  for (const id of onPlatform) {
    const mine = parts.flatMap((part, i) => (trayOf(part) === id ? [boxes[i]!] : []));
    if (mine.length) forward.set(id, Math.max(...mine.map((b) => b.max[2])) - Math.min(...mine.map((b) => b.min[2])));
  }
  const centreX = (which: (part: Part) => boolean) => {
    const xs = parts.flatMap((part, i) => (which(part) ? [(boxes[i]!.min[0] + boxes[i]!.max[0]) / 2] : []));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  const across = new Map<string, Mm>();
  for (const id of new Set(parts.filter(isBlindTray).map(blindOf))) {
    const mine = parts.flatMap((part, i) => (blindOf(part) === id && isBlindTray(part) ? [boxes[i]!] : []));
    const length = Math.max(...mine.map((b) => b.max[0])) - Math.min(...mine.map((b) => b.min[0]));
    const at = centreX((part) => blindOf(part) === id && isBlindTray(part))!;
    const cabinetId = parts.find((part) => blindOf(part) === id)!.designObjectId;
    const toward = centreX((part) => part.designObjectId === cabinetId && isTrayPart(part)) ?? middle;
    across.set(id, toward >= at ? length : -length);
  }
  const blindCabinets = new Set(parts.filter(isBlindTray).map((part) => part.designObjectId));
  // The order they are used in, a cabinet at a time: the higher blind trays across, then forward if they are on a
  // platform; the trays in front of the door out; the lowest blind tray across, then forward.
  const stageOf = new Map<string, { across: number; forward?: number }>();
  const frontStage = new Map<string, number>();
  const stageCount = new Map<string, number>();
  for (const cabinetId of blindCabinets) {
    const bottomOf = (id: string) => Math.min(...parts.flatMap((part, i) => (blindOf(part) === id && isBlindTray(part) ? [boxes[i]!.min[1]] : [])));
    const ids = [...new Set(parts.filter((part) => part.designObjectId === cabinetId && isBlindTray(part)).map(blindOf))].sort((p, q) => bottomOf(p) - bottomOf(q));
    const [lowest, higher] = [ids.slice(0, 1), ids.slice(1)];
    let n = 0;
    const group = (mine: string[]) => {
      if (!mine.length) return;
      n += 1;
      for (const id of mine) stageOf.set(id, { across: n });
      const out = mine.filter((id) => onPlatform.has(id));
      if (out.length) n += 1;
      for (const id of out) stageOf.get(id)!.forward = n;
    };
    group(higher);
    if (parts.some((part) => part.designObjectId === cabinetId && isTrayPart(part) && !isBlindTray(part))) frontStage.set(cabinetId, (n += 1));
    group(lowest);
    stageCount.set(cabinetId, n);
  }

  // Drawers open in steps, the lowest furthest: ranked by where each drawer's lowest part is, the top one first.
  const drawerBottoms = new Map<string, Mm>();
  parts.forEach((part, i) => {
    if (!travel.has(mover(part)) || (part.role && !part.role.startsWith('box'))) return;
    drawerBottoms.set(mover(part), Math.min(drawerBottoms.get(mover(part)) ?? Infinity, boxes[i]!.min[1]));
  });
  const topDown = [...drawerBottoms].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const pullShare = (id: string) => {
    const rank = topDown.indexOf(id);
    return topDown.length < 2 || rank < 0 ? 1 : TOP_DRAWER_SHARE + ((1 - TOP_DRAWER_SHARE) * rank) / (topDown.length - 1);
  };

  const sides = boxes.filter((_, i) => parts[i]!.role === 'side' || parts[i]!.role === 'partition');
  // A drawer's slide by its drawer; a tray's, inside a cabinet, by the tray.
  const mountOf = (part: Part) => slides.find((s) => s.drawerId === part.designObjectId) ?? (part.id.includes('/sink-') ? slides.find((s) => s.drawerId === trayOf(part)) : undefined);
  /** A blind corner tray's two long sides, and the slide beside each: the tray is behind the one nearer the front, in front of the other. */
  const blindSlide = (part: Part, i: number): SlideModel | undefined => {
    // (A tray's two long sides, or the two aprons of the platform under one that also comes forward.)
    if (!isBlindTray(part) || !/\/(side-[12]|apron-(front|back))$/.test(part.id) || !mountOf(part)) return undefined;
    const mine = parts.flatMap((p, k) => (trayOf(p) === trayOf(part) && isBlindTray(p) ? [boxes[k]!] : []));
    const mid = (Math.min(...mine.map((b) => b.min[2])) + Math.max(...mine.map((b) => b.max[2]))) / 2;
    const here = (boxes[i]!.min[2] + boxes[i]!.max[2]) / 2;
    return slideBesideBlindTray(part, mountOf(part)!, here > mid ? -1 : 1, (across.get(blindOf(part)) ?? 1) >= 0 ? 1 : -1);
  };
  const hinged = parts.map((part) => (!part.role && hardware.length ? doorHinges(part, parts.map((p, k) => ({ part: p, box: boxes[k]! })), hardware) : undefined));
  const allHinges = hinged.flatMap((h) => (h ? [h] : []));
  /** A bi-fold pair's second door: where its knuckle is, and which way it unfolds (against the way its leader swings). */
  const following = (part: Part): PlacedPart['follows'] => {
    if (part.moves?.kind !== 'follow') return undefined;
    const lead = parts.find((p) => p.id === (part.moves as { partId: string }).partId);
    const [mine, theirs] = [doorSwing(part, sides), lead && doorSwing(lead, sides)];
    return mine && theirs ? { partId: lead!.id, knuckle: mine.pivot, sign: theirs.sign === 1 ? -1 : 1 } : undefined;
  };
  const placed = parts.map((part, i): PlacedPart => {
    const follows = following(part);
    // What turns with a susan, or follows another door, is not carried by hinges of its own.
    if (part.moves?.kind === 'turn' || follows) hinged[i] = undefined;
    const shared = hinged[i] ? sharedSwing(part, hinged[i]!, allHinges) : undefined;
    const { origin, xAxis, yAxis } = part.placement!;
    const n = cross(xAxis, yAxis);
    const box = boxes[i]!;
    let explode: Vec3 = [0, 0, 0];
    // A solid wood strip on a case part's edge is glued to it: it goes where its part goes.
    const glued = part.role === 'caseEdge' ? parts.findIndex((p) => p.id === part.id.replace(/-edge(-[xy][01])?$/, '')) : -1;
    const [like, likeBox] = glued >= 0 ? [parts[glued]!, boxes[glued]!] : [part, box];
    // A top lifts off; a torsion table comes apart in its layers, the ribs over the bottom skin, the top skin over them.
    if (like.role === 'rib') explode = [0, 1.2, 0];
    else if (like.role === 'top' || like.role === 'topEdge') explode = [0, like.id.includes('-skin-top') ? 2.4 : like.id.includes('-skin-bottom') ? 0.6 : 1, 0];
    else if (like.role === 'side') explode = [(likeBox.min[0] + likeBox.max[0]) / 2 < middle ? -1 : 1, 0, 0];
    else if (like.role === 'back') explode = [0, 0, -1];
    // A French cleat and its spacer come off behind the back.
    else if (like.role === 'cleat') explode = [0, 0, -1.6];
    else if (like.role === 'stretcher') explode = [0, 1, 0];
    else if (!like.role) explode = [0, 0, FRONTS_EXPLODE];
    // A drawer box comes out as one, behind its front; its strips stay on the sides they are fixed to.
    else if (like.role.startsWith('box')) explode = [0, 0, BOX_EXPLODE];
    else if (like.role === 'buildOut' || like.role === 'runner') explode = [(likeBox.min[0] + likeBox.max[0]) / 2 < middle ? -1 : 1, 0, 0];
    else if (like.role !== 'bottom') explode = [0, 0, 1];
    return {
      partId: part.id,
      role: part.role,
      axes: [xAxis, yAxis, n],
      offset: origin.map((o, k) => o - part.size.thickness * n[k]!) as Vec3,
      explode,
      swing: part.role || part.moves ? undefined : doorSwing(part, sides),
      ...(part.moves?.kind === 'turn' ? { turnsAbout: part.moves.axis } : {}),
      ...(part.moves?.kind === 'tilt' ? { tiltsAbout: part.moves.axis } : {}),
      ...(part.moves?.kind === 'swingIn' ? { swingsIn: { at: part.moves.axis, sign: part.moves.sign } } : {}),
      ...(part.moves?.kind === 'fold' ? { foldsAbout: part.moves.axis, ...(part.moves.across ? { foldsAcross: part.moves.across } : {}), ...(part.moves.front ? { foldsFront: true as const } : {}), ...(part.moves.first ? { foldsFirst: part.moves.first } : {}) } : {}),
      ...(follows ? { follows } : {}),
      ...withHinges(hinged[i]),
      ...(shared ? { shared } : {}),
      // (On a 3/4 extension slide it comes out three quarters of its length.)
      slide: !part.role || part.role.startsWith('box') ? (travel.get(mover(part)) === undefined ? undefined : travel.get(mover(part))! * (mountOf(part)?.slide.extension === 'threeQuarter' ? 0.75 : 1)) : undefined,
      ...((!part.role || part.role.startsWith('box')) && travel.has(mover(part)) ? { pullShare: pullShare(mover(part)) } : {}),
      ...(isBlindTray(part)
        ? {
            across: across.get(blindOf(part))!,
            pullStage: stageOf.get(blindOf(part))!.across,
            pullStages: stageCount.get(part.designObjectId)!,
            // The tray on a platform comes forward; the platform only goes across.
            ...(onPlatform.has(trayOf(part)) ? { forwardStage: stageOf.get(trayOf(part))!.forward!, slide: forward.get(trayOf(part)) } : {}),
          }
        : isTrayPart(part) && frontStage.has(part.designObjectId)
          ? { pullStage: frontStage.get(part.designObjectId)!, pullStages: stageCount.get(part.designObjectId)! }
          : {}),
      ...((part.role === 'boxSide' || (onPlatform.has(trayOf(part)) && /\/tray-side-(left|right)$/.test(part.id))) && mountOf(part) && !mountOf(part)!.under
        ? { runsOn: slideBesideBox(part, mountOf(part)!) }
        : blindSlide(part, i)
          ? { runsOn: blindSlide(part, i)! }
          : {}),
      ...(part.role === 'boxBottom' && mountOf(part)?.under
        ? (() => {
            const u = mountOf(part)!.under!;
            return { runsUnder: { xs: [box.min[0] + u.inset + u.width / 2, box.max[0] - u.inset - u.width / 2], top: box.min[1], height: u.height, width: u.width, front: box.max[2], length: mountOf(part)!.length } };
          })()
        : {}),
    };
  });

  return { parts: placed, min, max, explodeDistance: parts.length ? EXPLODE_SHARE * Math.max(...max.map((v, i) => v - min[i]!)) : 0 };
}
