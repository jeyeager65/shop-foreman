/**
 * Storage under a sink, where the space is hard to use: behind the doors of a base cabinet, round what is in the way.
 * That is a list of measured blocks: the trap, the bowl, supply valves, a disposal, each `width` across and `depth` front
 * to back, centred or `fromLeft`, against the back or `fromBack`, from `clearUnder` above the cabinet's floor
 * up to the top or `height` tall. What goes in:
 *
 * - a roll-out tray on the floor, under the trap;
 * - above it, one of: a second tray, cut round the plumbing (a U) where it reaches it; a fixed shelf
 *   from side to side, cut round the plumbing where it reaches it; or that shelf with a narrow tray on
 *   it each side of the plumbing, for a trap that comes too far forward for one tray to go round.
 *
 * A tray is a drawer box with no front: 1/2" walls, rabbeted corners, a 1/4" bottom in a groove, its
 * front wall lower than the rest (the drawer boxes' own sizes, `drawerBox.ts`). Its slides hang on
 * build-out strips on the case sides, as a drawer's do behind a face frame: layers of the case
 * material, enough of them to bring the slide past the edge of the door opening and clear of the
 * hinges (in an existing case, by how far its hinges were measured to stand in). A tray beside the plumbing has no case side at its inner edge: a standard on the shelf
 * carries that slide. Or the slides hang on a self-standing frame: two standards on edge standing on two
 * rails laid flat, squared on the bench and screwed to the cabinet's floor; the trays roll over the rails. It is
 * what an existing cabinet starts with: nothing is fitted to sides that may be out of square. Derived; never stored.
 */
import type { CabinetDesign, CabinetInside, Feature, Hardware, Length, Material, Mm, Obstacle, ObstacleKind, Organizer, Part, Point, Slide, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { SHELF_SIDE_CLEARANCE, hasTopPanel, insideDepth } from './case';
import { type DoorRackBuild, deriveDoorRacks } from './doorRacks';
import { rect } from './doors';
import { BOX_BOTTOM_PLAY, BOX_CLEAR_UNDER, BOX_GROOVE_DEPTH, BOX_GROOVE_UP, BOX_RABBET_DEPTH, BUILD_OUT_HEIGHT } from './drawerBox';
import { withGrain } from './grain';
import { deriveCabinetOpenings } from './openings';
import { isSlide } from './slides';
import { sinkBowlBlock } from './sinks';
import { boxOf, constructionRules, shiftedParts, thicknessOf, toeKickOf } from './style';

/** The least a tray's slide stands in from the edge of the door opening, each side: the hinges stand in it. Tune me. */
export const HINGE_CLEAR: Mm = (5 * MM_PER_INCH) / 8;
/** How far behind the case front a tray starts, clear of the doors. Tune me. */
export const PULLOUT_SETBACK: Mm = MM_PER_INCH;
/** The height of a tray's sides and back. Tune me. */
export const TRAY_WALL: Mm = 3.5 * MM_PER_INCH;
/** The height of a tray's front wall: lower, to see and reach in. Tune me. */
export const TRAY_FRONT: Mm = 2.25 * MM_PER_INCH;
/** The upper level above the cabinet's floor: the underside of an upper tray, the top of the shelf. Tune me. */
export const UPPER_UP: Mm = 10 * MM_PER_INCH;
/** Between a tray or the shelf and a block it is cut round. Tune me. */
export const PLUMBING_CLEAR: Mm = MM_PER_INCH / 2;
/** The height of the cleat under each end of the shelf. Tune me. */
export const SHELF_CLEAT: Mm = 1.5 * MM_PER_INCH;
/** How wide the rails of a tray frame are, and how high its tie at the most. Tune me. */
export const FRAME_RAIL: Mm = 3 * MM_PER_INCH;
/** Between a tray frame and the edge of the door opening, each side: it goes in through it. Tune me. */
export const FRAME_PLAY: Mm = MM_PER_INCH / 8;
/** A tall tray's walls, for bottles standing up. Tune me. */
export const TALL_TRAY_WALL: Mm = 8 * MM_PER_INCH;
/** A pull-out for bins: its walls, and the play round each bin. Tune me. */
export const PULLOUT_WALL: Mm = 5 * MM_PER_INCH;
export const BIN_PLAY: Mm = MM_PER_INCH / 4;
/** The room left over the bins of a pull-out, to lift one out. Tune me. */
export const BIN_LIFT: Mm = MM_PER_INCH;
/** The narrowest tray worth making, outside. */
const MIN_BOX: Mm = 4 * MM_PER_INCH;
/** The drawer boxes' starter materials, used when the project has them. */
const BOX_ID = 'plywood-1-2';
const BOTTOM_ID = 'plywood-1-4';

const inches = (n: number): Length => ({ mm: n * MM_PER_INCH, unit: 'in' });

/** The kinds of block, in words, and the size a new one starts at. Tune me. */
export const OBSTACLE_KINDS: { value: ObstacleKind; title: string; start: () => Omit<Obstacle, 'id' | 'kind'> }[] = [
  // A vanity's trap and drain: 6" across, 10" out from the back, 12" clear under it, up to the top.
  { value: 'trap', title: 'Trap and drain', start: () => ({ width: inches(6), depth: inches(10), clearUnder: inches(12) }) },
  { value: 'bowl', title: 'Bowl', start: () => ({ width: inches(16), depth: inches(14), fromBack: inches(2), clearUnder: inches(18) }) },
  { value: 'valve', title: 'Supply valve', start: () => ({ width: inches(3), depth: inches(4), fromLeft: inches(2), clearUnder: inches(14), height: inches(4) }) },
  { value: 'disposal', title: 'Disposal', start: () => ({ width: inches(8), depth: inches(8), fromBack: inches(4), clearUnder: inches(8) }) },
  { value: 'other', title: 'Something else', start: () => ({ width: inches(4), depth: inches(4), fromLeft: inches(1), height: inches(8) }) },
];

/** A new block of a kind, with an id no other in the list has. */
export function createObstacle(kind: ObstacleKind, others: Pick<Obstacle, 'id'>[] = []): Obstacle {
  let n = others.length + 1;
  while (others.some((o) => o.id === `${kind}-${n}`)) n += 1;
  return { id: `${kind}-${n}`, kind, ...OBSTACLE_KINDS.find((k) => k.value === kind)!.start() };
}

/** What a block is called in a sentence: "the trap", "the supply valve", or its own name. */
export function obstacleName(o: Pick<Obstacle, 'kind' | 'name'>): string {
  if (o.name?.trim()) return o.name.trim();
  return { trap: 'the trap', bowl: 'the bowl', valve: 'the supply valve', disposal: 'the disposal', other: 'what is in the way' }[o.kind];
}

/** What a cabinet under a sink can be given in one go: a tray on its floor, and one thing above it. */
export interface SinkStorage {
  bottomTray?: boolean;
  upper?: 'tray' | 'shelf' | 'sideTrays';
  mounting?: 'strips' | 'frame';
}

/**
 * What a cabinet under a sink starts with: a vanity's trap, in the middle at the back, and nothing made
 * until `storage` asks: a tray on the floor, and above it (10" up) a second tray, a shelf, or a shelf with
 * a tray each side of the plumbing.
 */
export function createUnderSink(storage: SinkStorage = {}): CabinetInside {
  const organizers: Organizer[] = [];
  if (storage.bottomTray) organizers.push({ id: 'tray-bottom', kind: 'tray' });
  if (storage.upper) organizers.push(storage.upper === 'tray' ? { id: 'tray-upper', kind: 'tray', up: inches(UPPER_UP / MM_PER_INCH) } : { id: 'shelf', kind: storage.upper, up: inches(UPPER_UP / MM_PER_INCH) });
  return { obstacles: [createObstacle('trap')], organizers, ...(storage.mounting ? { mounting: storage.mounting } : {}) };
}

/** The kinds of organizer, in words, for the picker and the buttons that add one. */
export const ORGANIZER_KINDS: { title: string; value: Organizer['kind'] }[] = [
  { title: 'A roll-out tray', value: 'tray' },
  { title: 'A fixed shelf', value: 'shelf' },
  { title: 'A shelf with a tray each side of what is in the way', value: 'sideTrays' },
  { title: 'A pull-out for trash and recycling bins', value: 'pullOut' },
  { title: 'A narrow pull-out with tall walls', value: 'narrow' },
  { title: 'Vertical dividers for trays and baking sheets', value: 'dividers' },
  { title: 'A tray in the blind half, on slides that run sideways', value: 'blindTray' },
];
/** How deep the dados are that hold a divider in its base and its top. Tune me. */
export const DIVIDER_DADO: Mm = 6;

/**
 * One more organizer of a kind, over the ones there are: the first tray stands on the floor, anything else
 * 10" above the highest. Its id names its parts: `tray-bottom`, `tray-upper`, `tray-3`; `shelf`, `shelf-2`.
 */
export function createOrganizer(kind: Organizer['kind'], others: Organizer[] = []): Organizer {
  const free = (stem: string, first: string[]) => {
    for (const id of first) if (!others.some((o) => o.id === id)) return id;
    for (let n = first.length + 1; ; n++) if (!others.some((o) => o.id === `${stem}-${n}`)) return `${stem}-${n}`;
  };
  const top = Math.max(0, ...others.map((o) => o.up?.mm ?? 0));
  const next = inches(Math.round((top + UPPER_UP) / MM_PER_INCH));
  if (kind === 'blindTray') return { id: free('blind', ['blind']), kind };
  if (kind === 'narrow') return { id: free('narrow', ['narrow']), kind, width: inches(6), wall: inches(TALL_TRAY_WALL / MM_PER_INCH) };
  if (kind === 'dividers') return { id: free('dividers', ['dividers']), kind, count: 4, height: inches(14) };
  if (kind === 'pullOut') return { id: free('pullout', ['pullout']), kind, bins: { width: inches(9.5), depth: inches(13.5), height: inches(16), count: 1 } };
  if (kind === 'tray') {
    const onFloor = !others.some((o) => o.kind === 'tray' && !o.up);
    return onFloor && !others.some((o) => o.id === 'tray-bottom') ? { id: 'tray-bottom', kind } : { id: free('tray', ['tray-upper', 'tray-upper']), kind, up: next };
  }
  return { id: free('shelf', ['shelf']), kind, up: others.length ? next : inches(UPPER_UP / MM_PER_INCH) };
}

/** What an organizer is called: its parts' names start with it. */
export function organizerName(o: Pick<Organizer, 'id' | 'kind'>): string {
  const n = /-(\d+)$/.exec(o.id)?.[1];
  if (o.kind === 'pullOut') return n ? `Trash pull-out ${n}` : 'Trash pull-out';
  if (o.kind === 'narrow') return n ? `Narrow pull-out ${n}` : 'Narrow pull-out';
  if (o.kind === 'blindTray') return n ? `Blind corner tray ${n}` : 'Blind corner tray';
  if (o.kind === 'dividers') return n ? `Dividers ${n}` : 'Dividers';
  if (o.kind === 'tray') return o.id === 'tray-bottom' ? 'Bottom tray' : o.id === 'tray-upper' ? 'Upper tray' : `Tray ${n ?? o.id}`;
  return n ? `Fixed shelf ${n}` : 'Fixed shelf';
}

/** Whether a cabinet can have a sink over it: a base cabinet's ordinary case, one bay, doors at the bottom. */
export function takesSink(cabinet: Pick<CabinetDesign, 'form' | 'corner' | 'layout'> & Partial<Pick<CabinetDesign, 'existing'>>): boolean {
  // A cabinet that is already there and was measured for new doors only: nothing is fitted inside it.
  if (cabinet.existing && !cabinet.existing.inside) return false;
  if (hasTopPanel(cabinet) || cabinet.corner?.kind === 'diagonal' || cabinet.corner?.kind === 'lShaped') return false;
  return (cabinet.layout.bays?.length ?? 1) <= 1 && cabinet.layout.rows.at(-1)?.use === 'doors';
}

/** What carries the trays of a cabinet: what it says, else a frame in an existing cabinet and strips in one made here. */
export const trayMounting = (cabinet: Pick<CabinetDesign, 'inside' | 'existing'>): 'strips' | 'frame' => cabinet.inside?.mounting ?? (cabinet.existing ? 'frame' : 'strips');
export const MOUNTINGS: { title: string; value: 'strips' | 'frame' }[] = [
  { title: "Build-out strips on the cabinet's sides", value: 'strips' },
  { title: "A frame screwed to the cabinet's floor", value: 'frame' },
];

/**
 * A notch at its real size, to print on paper and hold against the plumbing before plywood is cut: the back of a
 * tray or of the shelf seen from above, the back of the cabinet at the top (y 0), cropped
 * to a little more than its notches.
 */
export interface PaperTemplate {
  name: string;
  width: Mm;
  height: Mm;
  /** The board, the notch cut out of it: x across from the crop's left edge, y forward from the back edge. */
  outline: Point[];
  /** Where it goes, in a sentence: how far its left edge is from the cabinet's left side. */
  words: string;
  /** The crop's left edge from the inside of the cabinet's left side. */
  fromLeft: Mm;
}
/** How much of the board a paper template shows round its notches. */
const TEMPLATE_MARGIN: Mm = 40;

/** A block in the way, placed: a box in the cabinet's frame. */
export interface ObstacleBlock {
  id: string;
  kind: ObstacleKind;
  /** In a sentence: "the trap". */
  name: string;
  min: Vec3;
  max: Vec3;
}

/**
 * A bottom-mount slide for a tray on the cabinet's floor (from a maker's sheet for one pair: full extension, soft
 * close). The pair is screwed down to the floor and the tray's
 * bottom lies on it, fastened from underneath with the slides pulled out. `height`: from the floor to the
 * underside of the tray's bottom. `sideClear`: the least between the tray and a panel beside it. The rest is
 * a guess: tune me. Only the 18" length is known to be sold.
 */
export const BOTTOM_SLIDE = {
  name: 'Bottom-mount slides, full extension, soft close',
  height: 27,
  sideClear: 3,
  /** How wide each slide is, and how far in from the tray's side it lies: only for the picture. */
  width: 45,
  inset: 50,
  rearClearance: 10,
  lengths: ['14"', '16"', '18"', '20"', '22"'],
};

/** A platform that carries a blind corner tray which also comes forward: how tall the two aprons its sideways slides are on. Tune me. */
export const PLATFORM_APRON: Mm = 2 * MM_PER_INCH;
/** The cleat on the cabinet's back that carries the ledge such a platform lands on: how tall. Tune me. */
export const LANDING_CLEAT: Mm = 2.5 * MM_PER_INCH;
/** How much taller than its walls a blind corner tray is with its platform under it. */
const platformUnder = (o: Organizer): Mm => (o.kind === 'blindTray' && o.forward ? PLATFORM_APRON + BOX_CLEAR_UNDER : 0);

/** Whether an organizer is a tray on the floor on bottom-mount slides. */
export const onBottomSlides = (o: Organizer): boolean => o.kind === 'tray' && o.slides === 'bottom' && !(o.up && o.up.mm > 0);

export interface UnderSinkBuild {
  parts: Part[];
  /** The bottom-mount slides under a tray on the floor: the tray's id (`trayOf` its parts), their length, and how tall they are. */
  bottomSlides?: { tray: string; name: string; length: Length; height: Mm }[];
  /** The slides the trays run on: pairs of each length used, the longest first. */
  slides?: { slide: Slide; lengths: { length: Length; pairs: number }[] };
  /**
   * Each tray, outside: for the words on Design. `round`: what it is cut round. `stopsAt`: what it was made
   * shorter for, a tray that could not go round it.
   */
  trays: { name: string; width: Mm; length: Mm; height: Mm; /** Between its walls, across and front to back: what printed bins are sized to. */ inside: { width: Mm; length: Mm }; cutRound: boolean; round?: string; stopsAt?: string }[];
  /** How many layers of the case material each build-out is. */
  buildOutLayers: number;
  /** What carries the slides. */
  mounting: 'strips' | 'frame';
  /** The frame under the trays that run from side to side, outside; `tie`: whether there was room for its tie at the back. */
  frame?: { width: Mm; depth: Mm; height: Mm; tie: boolean };
  /** Each block in the way, in the cabinet's frame. */
  obstacles: ObstacleBlock[];
  /** The tilt-out tray behind the false front, outside, when it has one. */
  tiltOut?: { width: Mm; height: Mm; depth: Mm };
  /** The racks on the doors, when it has some: their sizes, and what the doors are asked to carry. */
  doorRacks?: Pick<DoorRackBuild, 'racks' | 'weight' | 'reach'>;
  /** A paper template for each tray and shelf that is cut round something. */
  templates: PaperTemplate[];
  /** The heights a build-out strip's underside stands above the cabinet's floor: a printed jig holds it there, two a height. */
  jigHeights: Mm[];
}

const UP: Vec3 = [0, 1, 0];
const RIGHT: Vec3 = [1, 0, 0];
const LEFT: Vec3 = [-1, 0, 0];
const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];
type Plan2 = [x: Mm, z: Mm];

/**
 * The slide every tray inside the project's cabinets runs on, for the 3D view, which shows the slides: the roll-out
 * trays, the pull-outs, and a blind corner tray,
 * each by its tray (`trayOf`), as long as its tray is.
 */
export function traySlideMounts(cabinets: CabinetDesign[], shop: { materials: Material[]; hardware: Hardware[] }): { drawerId: string; slide: Slide; length: Mm; under?: { height: Mm; width: Mm; inset: Mm } }[] {
  return cabinets.flatMap((cabinet) => {
    let build: UnderSinkBuild | undefined;
    try {
      build = deriveUnderSink(cabinet, shop.materials, shop.hardware);
    } catch {
      return []; // what cannot be made is said on the Design screen
    }
    const slide = build?.slides?.slide;
    if (!build || !slide) return [];
    const sides = build.parts.filter((p) => (p.role === 'boxSide' && p.id.includes('/sink-')) || /\/sink-blind(-\d+)?\/(side-1|tray-side-left)$/.test(p.id) || /\/sink-blind(-\d+)?-platform\/apron-front$/.test(p.id));
    const seen = new Set<string>();
    return sides.flatMap((p) => {
      const id = trayOf(p);
      if (seen.has(id)) return [];
      seen.add(id);
      // A tray on bottom-mount slides has them under it, not beside it.
      const under = build!.bottomSlides?.find((b) => b.tray === id);
      return [{ drawerId: id, slide, length: under ? under.length.mm : p.size.width, ...(under ? { under: { height: under.height, width: BOTTOM_SLIDE.width, inset: BOTTOM_SLIDE.inset } } : {}) }];
    });
  });
}

/** Whether a part is a tray's (its walls and bottom): they roll out together in the 3D view. */
export const isTrayPart = (part: Pick<Part, 'id' | 'role'>) => !!part.role?.startsWith('box') && part.id.includes('/sink-');
/** The tray a tray's part belongs to. */
export const trayOf = (part: Pick<Part, 'id'>) => part.id.slice(0, part.id.lastIndexOf('/'));

/** The id of the block a cabinet's own sink's bowl is in the way as. */
export const SINK_BOWL_BLOCK = 'sink-bowl';

/** Where each block of a cabinet's list stands, in its frame. One with no size, or none left under the top, is left out. */
export function obstacleBlocks(cabinet: CabinetDesign, materials: Material[]): ObstacleBlock[] {
  // Behind a face frame that overhangs its sides the box is narrower than the cabinet (`boxOf`): worked out in the box, stood where it is.
  const { box, shift } = boxOf(cabinet, materials);
  const blocks = blocksInBox(box, materials);
  return shift ? blocks.map((b) => ({ ...b, min: [b.min[0] + shift, b.min[1], b.min[2]] as Vec3, max: [b.max[0] + shift, b.max[1], b.max[2]] as Vec3 })) : blocks;
}

function blocksInBox(cabinet: CabinetDesign, materials: Material[]): ObstacleBlock[] {
  if (!cabinet.inside || !takesSink(cabinet)) return [];
  const W = cabinet.size.width.mm;
  const tCase = thicknessOf(materials, cabinet.materials.caseId);
  const floor = toeKickOf(cabinet).height + tCase + constructionRules(cabinet, materials).bottomLift;
  const ceiling = cabinet.size.height.mm - tCase;
  const depth = insideDepth(cabinet, materials);
  const blocks: ObstacleBlock[] = [];
  // The cabinet's own sink: its bowl hangs under the top, from the sink's sizes, not measured.
  const bowl = sinkBowlBlock(cabinet);
  for (const o of cabinet.inside.obstacles) {
    const x0 = o.fromLeft ? tCase + o.fromLeft.mm : W / 2 - o.width.mm / 2;
    const z0 = -depth + (o.fromBack?.mm ?? 0);
    const y0 = floor + (o.clearUnder?.mm ?? 0);
    const z1 = Math.min(0, z0 + o.depth.mm);
    // With no height of its own a block goes up to the top, or under the sink's bowl to its underside: a trap hangs
    // from the bowl's drain, it does not stand in the bowl.
    const underBowl = bowl && x0 < bowl.max[0] && x0 + o.width.mm > bowl.min[0] && z0 < bowl.max[2] && z1 > bowl.min[2];
    const y1 = o.height ? Math.min(ceiling, y0 + o.height.mm) : underBowl ? Math.min(ceiling, bowl.min[1]) : ceiling;
    if (y1 <= y0 || o.width.mm <= 0 || o.depth.mm <= 0) continue;
    blocks.push({ id: o.id, kind: o.kind, name: obstacleName(o), min: [x0, y0, z0], max: [x0 + o.width.mm, y1, z1] });
  }
  if (bowl && bowl.min[1] < ceiling) blocks.push({ id: SINK_BOWL_BLOCK, kind: 'bowl', name: "the sink's bowl", min: bowl.min, max: [bowl.max[0], ceiling, bowl.max[2]] });
  return blocks;
}

/** "the trap", "the trap and the bowl", "the trap, the bowl and the supply valve": each name once. */
function listed(blocks: ObstacleBlock[]): string {
  const names = [...new Set(blocks.map((b) => b.name))];
  return names.length < 2 ? (names[0] ?? 'what is in the way') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** What stands under the sink of a cabinet that has one. Nothing for a cabinet with none, or one that cannot take it. */
export function deriveUnderSink(cabinet: CabinetDesign, materials: Material[], hardware: Hardware[]): UnderSinkBuild | undefined {
  // As `obstacleBlocks`: everything inside is worked out in the box's own frame, then stood where the box is.
  const { box, shift } = boxOf(cabinet, materials);
  const build = underSinkInBox(box, materials, hardware);
  if (!build || !shift) return build;
  return { ...build, parts: shiftedParts(build.parts, shift), obstacles: build.obstacles.map((b) => ({ ...b, min: [b.min[0] + shift, b.min[1], b.min[2]] as Vec3, max: [b.max[0] + shift, b.max[1], b.max[2]] as Vec3 })) };
}

function underSinkInBox(cabinet: CabinetDesign, materials: Material[], hardware: Hardware[]): UnderSinkBuild | undefined {
  const sink = cabinet.inside;
  if (!sink || !takesSink(cabinet)) return undefined;
  const W = cabinet.size.width.mm;
  const caseId = cabinet.materials.caseId;
  const tCase = thicknessOf(materials, caseId);
  const has = (id: string) => materials.some((m) => m.id === id);
  // The drawer boxes' materials when the project has them, else the case's and the back's.
  const boxId = has(BOX_ID) ? BOX_ID : caseId;
  const bottomId = has(BOTTOM_ID) ? BOTTOM_ID : cabinet.materials.backId;
  const t = thicknessOf(materials, boxId);
  const tBottom = thicknessOf(materials, bottomId);
  const rules = constructionRules(cabinet, materials);
  const floor = toeKickOf(cabinet).height + tCase + rules.bottomLift;
  const ceiling = cabinet.size.height.mm - tCase;
  const depth = insideDepth(cabinet, materials);
  const opening = deriveCabinetOpenings(cabinet, materials).filter((o) => o.use === 'doors').at(-1)!;
  // Racks on the doors stand inside the cabinet when the doors are shut: everything else starts behind them.
  const doorRacks = deriveDoorRacks(cabinet, materials);
  // Inset doors stand inside the case: the trays start behind them.
  const front = -Math.max(PULLOUT_SETBACK + (rules.inset ? MM_PER_INCH : 0), doorRacks?.reach ?? 0);
  // Behind a face frame the stiles stand inside the case sides by `gap`. The build-out is whole layers of the case
  // material: as many as bring the slide past the opening's edge and clear of the hinges.
  // A blind corner cabinet (part C): its box runs on past the door opening on one side. What rolls out of the doors
  // is carried between the opening's two edges, on a frame: the blind side has no case side near to hang a strip on.
  const blind = cabinet.corner?.kind === 'blind' ? cabinet.corner.side : undefined;
  const [gapL, gapR] = [Math.max(0, opening.origin.x - tCase), Math.max(0, W - tCase - (opening.origin.x + opening.width))];
  const gap = blind === 'left' ? gapR : blind === 'right' ? gapL : Math.max(gapL, gapR);
  const layers = Math.max(1, Math.ceil((gap + (cabinet.existing?.hingeStandIn.mm ?? HINGE_CLEAR)) / tCase - 1e-9));
  const mounting = blind ? 'frame' : trayMounting(cabinet);
  // A frame's standards stand inside the door opening's width with a little play, so it goes in through it, and
  // their inner faces clear the hinges.
  const hinge = cabinet.existing?.hingeStandIn.mm ?? HINGE_CLEAR;
  /** Where the inner face of a frame's left standard stands: its outer face just inside the door opening, its inner face clear of the hinges. */
  const frameIn = tCase + gap + Math.max(hinge, tCase + FRAME_PLAY);
  const built = mounting === 'frame' ? frameIn : tCase + layers * tCase;
  /** The inner faces of what carries a tray from side to side: the two build-outs, or the frame's two standards. */
  const edge = Math.max(hinge, tCase + FRAME_PLAY);
  const spanL = blind === 'left' ? opening.origin.x + edge : built;
  const spanR = blind === 'right' ? opening.origin.x + opening.width - edge : W - built;
  /** Where the standards of a frame of its own may stand, left and right: just inside the door opening's edges, whatever carries the other trays. */
  const frameL = blind === 'left' ? spanL : frameIn;
  const frameR = blind === 'right' ? spanR : W - frameIn;
  /** How far a tray from side to side is lifted: it rolls over the frame's rails. */
  const lift = mounting === 'frame' ? tCase : 0;
  const blocks = obstacleBlocks(cabinet, materials);
  const C = PLUMBING_CLEAR;

  const parts: Part[] = [];
  const add = (key: string, name: string, role: NonNullable<Part['role']>, materialId: string, size: Part['size'], placement: NonNullable<Part['placement']>, cut: Feature[] = [], outline?: Point[]) => {
    const part: Part = {
      id: `${cabinet.id}/sink-${key}`,
      designObjectId: cabinet.id,
      name,
      materialId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: outline ?? rect(0, 0, size.width, size.height) }, ...cut],
      role,
      placement,
      ...(outline ? { shaped: true } : {}),
    };
    parts.push(withGrain(part, role, materials));
  };
  /** A board on edge on the line from `from` along `dir`: its body to the left of that direction seen from above, its face A the far face. */
  const upright = (key: string, name: string, role: NonNullable<Part['role']>, materialId: string, from: Plan2, dir: Plan2, length: Mm, bottom: Mm, height: Mm, thickness: Mm, cut: Feature[] = []) => {
    const normal: Plan2 = [-dir[1], dir[0]];
    add(key, name, role, materialId, { width: length, height, thickness }, { origin: [from[0] + normal[0] * thickness, bottom, from[1] + normal[1] * thickness], xAxis: [dir[0], 0, dir[1]], yAxis: UP }, cut);
  };

  const wantsTray = sink.organizers.some((o) => o.kind !== 'shelf' && o.kind !== 'dividers');
  if (!blind && sink.organizers.some((o) => o.kind === 'blindTray')) throw new Error('A blind corner tray is for a blind corner cabinet: this cabinet has no blind half.');
  // (A pull-out is a tray too: it rides on the same slides.)
  let slide: Slide | undefined;
  /** The slide lengths that fit the cabinet's depth, the longest first. */
  let fits: Length[] = [];
  if (wantsTray) {
    slide = hardware.filter(isSlide).find((s) => s.generic) ?? hardware.filter(isSlide)[0];
    if (!slide) throw new Error('The shop profile has no drawer slide for the trays.');
    const rearClearance = slide.rearClearance;
    fits = [...slide.lengths].reverse().filter((l) => l.mm + rearClearance <= depth + front);
    if (!fits.length) throw new Error('The cabinet is too shallow for a tray: no slide is short enough.');
  }
  const clear = slide?.sideClearance.mm ?? 0;
  const used = new Map<Mm, { length: Length; pairs: number }>();
  const trays: UnderSinkBuild['trays'] = [];
  const bottomSlides: NonNullable<UnderSinkBuild['bottomSlides']> = [];
  const templates: PaperTemplate[] = [];
  const jigHeights: Mm[] = [];
  /** A template of a board whose back edge steps forward by `deep(x)`, between `a` and `b` across the cabinet. */
  const template = (name: string, a: Mm, b: Mm, steps: { x0: Mm; x1: Mm; deep: Mm }[], most: Mm) => {
    const [x0, x1] = [Math.max(a, Math.min(...steps.map((s) => s.x0)) - TEMPLATE_MARGIN), Math.min(b, Math.max(...steps.map((s) => s.x1)) + TEMPLATE_MARGIN)];
    const height = Math.min(most, Math.max(...steps.map((s) => s.deep)) + TEMPLATE_MARGIN);
    const xs = [...new Set([x0, x1, ...steps.flatMap((s) => [s.x0, s.x1]).filter((x) => x > x0 && x < x1)])].sort((p, q) => p - q);
    const outline: Point[] = [{ x: 0, y: height }];
    const push = (x: Mm, y: Mm) => {
      const last = outline.at(-1)!;
      if (last.x !== x || last.y !== y) outline.push({ x, y });
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const mid = (xs[i]! + xs[i + 1]!) / 2;
      const deep = Math.max(0, ...steps.filter((s) => s.x0 < mid && s.x1 > mid).map((s) => s.deep));
      push(xs[i]! - x0, deep);
      push(xs[i + 1]! - x0, deep);
    }
    push(x1 - x0, height);
    const fromLeft = x0 - tCase;
    templates.push({ name, width: x1 - x0, height, outline, fromLeft, words: `Its left edge is ${Math.round(fromLeft)} mm (${(fromLeft / MM_PER_INCH).toFixed(2)}") from the inside of the cabinet's left side, its top edge where the back of the ${name.toLowerCase().split(':')[0]} comes.` });
  };
  // A tray from side to side runs between the two build-outs.
  const [left, right] = [spanL + clear, spanR - clear];

  /** The layers of a build-out on a case side, beside a tray `L` long whose walls stand from `y0`. */
  const buildOut = (key: string, name: string, side: 'left' | 'right', y0: Mm, L: Mm) => {
    const y = y0 + (TRAY_WALL - BUILD_OUT_HEIGHT) / 2;
    // A strip on the cabinet's own side is set level on a pair of printed stands; one on the shelf is not that high off anything.
    const up = Math.round((y - floor) * 100) / 100;
    if (!key.startsWith('tray-left') && !key.startsWith('tray-right') && !jigHeights.includes(up)) jigHeights.push(up);
    for (let i = 0; i < layers; i++) {
      const n = layers > 1 ? ` ${i + 1}` : '';
      const size = { width: L, height: BUILD_OUT_HEIGHT, thickness: tCase };
      if (side === 'left') add(`${key}/strip-left${i ? `-${i + 1}` : ''}`, `${name}, build-out strip, left${n}`, 'buildOut', caseId, size, { origin: [tCase * (i + 2), y, front], xAxis: BACK, yAxis: UP });
      else add(`${key}/strip-right${i ? `-${i + 1}` : ''}`, `${name}, build-out strip, right${n}`, 'buildOut', caseId, size, { origin: [W - tCase * (i + 2), y, front - L], xAxis: FRONT, yAxis: UP });
    }
  };

  /**
   * A tray between `x0` and `x1` (outside), its walls standing from `y0`: as long as the longest slide that
   * fits. Where blocks are in its way it is cut round them, one notch from the back with a wall on its three
   * sides; when too little would be left (a block at a side, or one far forward) it is made shorter, to stop
   * in front of them. Gives back how long it came out.
   */
  const tray = (key: string, name: string, x0: Mm, x1: Mm, y0: Mm, advice = '', high: Mm = TRAY_WALL, under?: { fits: Length[] }): Mm => {
    // On bottom-mount slides its bottom carries it: of the walls' material, not the thin one that lies in a groove and carries nothing.
    const [floorId, tFloor] = under ? [boxId, t] : [bottomId, tBottom];
    const width = x1 - x0;
    const inside = width - 2 * t;
    if (width < MIN_BOX) throw new Error(`There is no room for the ${name.toLowerCase()}: it would be ${Math.round(width)} mm wide.`);
    if (y0 + high > ceiling - MM_PER_INCH) throw new Error(`The ${name.toLowerCase()} does not fit under the top of the cabinet.`);
    type Notch = { x0: Mm; x1: Mm; front: Mm; deep: Mm };
    let chosen: { length: Length; hits: ObstacleBlock[]; notch?: Notch } | undefined;
    let first: ObstacleBlock[] = [];
    for (const length of under?.fits ?? fits) {
      const rear = front - length.mm;
      const hits = blocks.filter((b) => y0 + high > b.min[1] - C && y0 - BOX_CLEAR_UNDER < b.max[1] && rear < b.max[2] + C && x0 < b.max[0] + C && x1 > b.min[0] - C);
      if (length === (under?.fits ?? fits)[0]) first = hits;
      if (!hits.length) {
        chosen = { length, hits };
        break;
      }
      // The notch, clear, in the cabinet's frame: one round everything in the way, open at the back.
      const edge = Math.max(...hits.map((b) => b.max[2])) + C;
      const notch: Notch = { x0: Math.min(...hits.map((b) => b.min[0])) - C, x1: Math.max(...hits.map((b) => b.max[0])) + C, front: edge, deep: edge - rear };
      if (notch.x0 - t - (x0 + t) >= MM_PER_INCH && x1 - t - (notch.x1 + t) >= MM_PER_INCH && notch.deep <= length.mm - 2 * t - 3 * MM_PER_INCH) {
        chosen = { length, hits, notch };
        break;
      }
    }
    if (!chosen) throw new Error(`The ${name.toLowerCase()} cannot go round ${listed(first)}: too little of it would be left, and no slide is short enough for it to stop in front.${advice}`);
    const { notch, hits } = chosen;
    const L = chosen.length.mm;
    const rear = front - L;
    const passed = first.filter((b) => !hits.includes(b));
    trays.push({ name, width, length: L, height: high, inside: { width: width - 2 * t, length: L - 2 * t }, cutRound: !!notch, ...(notch ? { round: listed(hits) } : {}), ...(passed.length ? { stopsAt: listed(passed) } : {}) });
    if (under) bottomSlides.push({ tray: `${cabinet.id}/sink-${key}`, name: BOTTOM_SLIDE.name, length: chosen.length, height: BOTTOM_SLIDE.height });
    else {
      const count = used.get(L) ?? { length: chosen.length, pairs: 0 };
      count.pairs += 1;
      used.set(L, count);
    }
    const id = (piece: string) => `${key}/${piece}`;
    const groove = (run: Mm): Feature => ({ id: 'box-groove', kind: 'dado', face: 'A', outline: rect(0, BOX_GROOVE_UP, run, BOX_GROOVE_UP + tFloor), depth: BOX_GROOVE_DEPTH });
    const rabbet = (which: string, from: Mm): Feature => ({ id: which, kind: 'dado', face: 'A', outline: rect(from, 0, from + t, high), depth: BOX_RABBET_DEPTH });
    const sideSize = { width: L, height: high, thickness: t };
    // The sides run the full length, rabbeted at each end for the front and the back; their inside faces are face A.
    add(id('tray-side-left'), `${name}, left side`, 'boxSide', boxId, sideSize, { origin: [x0 + t, y0, front], xAxis: BACK, yAxis: UP }, [groove(L), rabbet('box-rabbet-front', 0), rabbet('box-rabbet-back', L - t)]);
    add(id('tray-side-right'), `${name}, right side`, 'boxSide', boxId, sideSize, { origin: [x1 - t, y0, rear], xAxis: FRONT, yAxis: UP }, [groove(L), rabbet('box-rabbet-back', 0), rabbet('box-rabbet-front', L - t)]);
    const across = inside + 2 * BOX_RABBET_DEPTH;
    // The front wall is lower. Its role is a back's: it has no front fastened to it and is never shown as one.
    add(id('tray-front'), `${name}, front`, 'boxBack', boxId, { width: across, height: high - (TRAY_WALL - TRAY_FRONT), thickness: t }, { origin: [x1 - t + BOX_RABBET_DEPTH, y0, front - t], xAxis: LEFT, yAxis: UP }, [groove(across)]);
    const into = BOX_GROOVE_DEPTH - BOX_BOTTOM_PLAY / 2;
    const bottom = { x0: x0 + t - into, x1: x1 - t + into, front: front - t + into, rear: rear + t - into };
    const bottomSize = { width: bottom.x1 - bottom.x0, height: bottom.front - bottom.rear, thickness: tFloor };
    const place = { origin: [bottom.x0, y0 + BOX_GROOVE_UP + tFloor, bottom.front] as Vec3, xAxis: RIGHT, yAxis: BACK };
    if (!notch) {
      add(id('tray-back'), `${name}, back`, 'boxBack', boxId, { width: across, height: high, thickness: t }, { origin: [x0 + t - BOX_RABBET_DEPTH, y0, rear + t], xAxis: RIGHT, yAxis: UP }, [groove(across)]);
      add(id('tray-bottom'), `${name}, bottom`, 'boxBottom', floorId, bottomSize, place);
      return L;
    }
    template(`${name}: its notch`, x0, x1, [{ x0: notch.x0, x1: notch.x1, deep: notch.deep }], L);
    // Round the notch: the back in two, and three walls with their inside faces to the tray. Butt joints, glued and pinned.
    const wall = (piece: string, what: string, from: Plan2, dir: Plan2, length: Mm) => upright(id(piece), `${name}, ${what}`, 'boxBack', boxId, from, dir, length, y0, high, t, [groove(length)]);
    wall('tray-back-left', 'back, left', [x0 + t - BOX_RABBET_DEPTH, rear], [1, 0], notch.x0 - t - (x0 + t) + BOX_RABBET_DEPTH);
    wall('tray-back-right', 'back, right', [notch.x1 + t, rear], [1, 0], x1 - t - (notch.x1 + t) + BOX_RABBET_DEPTH);
    wall('tray-notch-left', 'notch, left', [notch.x0, rear], [0, 1], notch.deep);
    wall('tray-notch-right', 'notch, right', [notch.x1, notch.front], [0, -1], notch.deep);
    wall('tray-notch-front', 'notch, front', [notch.x0 - t, notch.front], [1, 0], notch.x1 - notch.x0 + 2 * t);
    // The bottom reaches into the groove of every wall, the notch's three too.
    const [nx0, nx1] = [notch.x0 - t + into - bottom.x0, notch.x1 + t - into - bottom.x0];
    const ny = bottom.front - (notch.front + t - into);
    add(id('tray-bottom'), `${name}, bottom`, 'boxBottom', floorId, bottomSize, place, [], [
      { x: 0, y: 0 },
      { x: bottomSize.width, y: 0 },
      { x: bottomSize.width, y: bottomSize.height },
      { x: nx1, y: bottomSize.height },
      { x: nx1, y: ny },
      { x: nx0, y: ny },
      { x: nx0, y: bottomSize.height },
      { x: 0, y: bottomSize.height },
    ]);
    return L;
  };
  /** A tray from side to side, with its strips; on a frame, the frame is made once every such tray is. */
  const across: { y0: Mm; L: Mm; high: Mm }[] = [];
  const wide = (key: string, name: string, y0: Mm, advice = '', high: Mm = TRAY_WALL) => {
    const L = tray(key, name, left, right, y0, advice, high);
    across.push({ y0, L, high });
    if (mounting === 'frame') return;
    buildOut(key, name, 'left', y0, L);
    buildOut(key, name, 'right', y0, L);
  };

  // The organizers, from the floor up: each stands at its height, and none may stand in another.
  const low = floor + lift + BOX_CLEAR_UNDER;
  // The trays in front of the door, for a blind corner cabinet's blind trays: where each one's walls stand from, the
  // top of the tallest, and what stays in the door's half when they are all pulled out: the standards of their frame
  // (half-way up the highest tray's walls), or only the slides on the floor under a tray on bottom-mount slides.
  const fronts = sink.organizers.filter((o) => o.kind === 'tray');
  const frontAt = (o: Organizer): Mm => (onBottomSlides(o) ? floor + Math.max(BOTTOM_SLIDE.sideClear, BOTTOM_SLIDE.height - BOX_GROOVE_UP) : Math.max(low, floor + (o.up?.mm ?? 0)));
  const frontTop = Math.max(floor, ...fronts.map((o) => frontAt(o) + (o.wall?.mm ?? TRAY_WALL)));
  const hung = fronts.filter((o) => !onBottomSlides(o));
  /** The lowest the walls of a blind corner tray may stand, to come across once the trays in front of the door are out. */
  const blindFloor = hung.length
    ? Math.max(...hung.map((o) => frontAt(o) + (TRAY_WALL + BUILD_OUT_HEIGHT) / 2)) + BOX_CLEAR_UNDER + 3
    : fronts.length
      ? floor + BOTTOM_SLIDE.height + 2 * BOX_CLEAR_UNDER
      : floor + tCase + BOX_CLEAR_UNDER;
  const lowestBlind = sink.organizers.find((o) => o.kind === 'blindTray');
  if (lowestBlind?.up && floor + lowestBlind.up.mm < blindFloor - 0.01) {
    const least = blindFloor - floor;
    throw new Error(`The ${organizerName(lowestBlind).toLowerCase()} would run into what stays in front of the door when its tray is pulled out: it must stand at least ${Math.ceil(least)} mm (${(Math.ceil((least / MM_PER_INCH) * 8) / 8).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}") above the cabinet's floor.`);
  }
  const levels = sink.organizers
    .map((o) => {
      const name = organizerName(o);
      // A tray's walls stand from its height, never lower than the floor (or the frame's rails) lets them; a shelf's top is at its height.
      const wall = o.wall?.mm ?? TRAY_WALL;
      // A pull-out stands on its own frame's rails, on the floor, and its bins stand in it.
      // What goes from side to side takes the whole width; a pull-out and the dividers only their own.
      const whole: [Mm, Mm] = [tCase, W - tCase];
      if (o.kind === 'pullOut' || o.kind === 'narrow') {
        const at = floor + tCase + BOX_CLEAR_UNDER;
        const high = o.kind === 'pullOut' ? PULLOUT_WALL : (o.wall?.mm ?? TALL_TRAY_WALL);
        const width = o.kind === 'pullOut' ? (o.bins?.width.mm ?? 0) + 2 * BIN_PLAY + 2 * t : (o.width?.mm ?? 6 * MM_PER_INCH);
        const inL = o.fromLeft ? tCase + o.fromLeft.mm + tCase : frameL;
        const across: [Mm, Mm] = [inL - tCase, inL + clear + width + clear + tCase];
        return { o, name, at, from: floor, to: o.kind === 'pullOut' ? at + (o.bins?.height.mm ?? 0) + BIN_LIFT : at + high, wall: high, across, width, inL };
      }
      if (o.kind === 'blindTray') {
        // It rides over the frame of whatever rolls out of the doors: its walls from where it is put, or just over a tray on the floor.
        // Over a tray on bottom-mount slides nothing stands up once that tray is out: it rides just over the slides on the floor.
        // Where they stand. The first is as low as it can be: it is only reached with the tray
        // in front of the door pulled out, so it need only clear what stays behind then (`blindFloor`). The second
        // is higher: over the first, and over the tray in front of the door, so it comes across without that tray
        // being pulled out. Any more stand one over another.
        const stacked = sink.organizers.filter((x) => x.kind === 'blindTray');
        const standsAt = (k: number): Mm => {
          const mine = stacked[k]!;
          if (mine.up) return floor + mine.up.mm;
          if (k === 0) return blindFloor;
          const below = stacked[k - 1]!;
          const overBelow = standsAt(k - 1) + platformUnder(below) + (below.wall?.mm ?? TRAY_WALL) + MM_PER_INCH + BOX_CLEAR_UNDER;
          return k === 1 ? Math.max(overBelow, frontTop + MM_PER_INCH + BOX_CLEAR_UNDER) : overBelow;
        };
        const at = standsAt(stacked.indexOf(o));
        // One that also comes forward has its platform under it: its walls stand that much higher.
        return { o, name, at, from: at - BOX_CLEAR_UNDER, to: at + platformUnder(o) + wall, wall, across: whole, width: whole[1] - whole[0], inL: whole[0] };
      }
      if (o.kind === 'dividers') {
        const at = floor + (o.up?.mm ?? 0);
        const width = o.width?.mm ?? W - 2 * tCase - 2 * SHELF_SIDE_CLEARANCE;
        const x0 = tCase + (o.fromLeft?.mm ?? SHELF_SIDE_CLEARANCE);
        return { o, name, at, from: at, to: at + (o.height?.mm ?? 0), wall, across: [x0, x0 + width] as [Mm, Mm], width, inL: x0 };
      }
      if (onBottomSlides(o)) {
        // Its bottom lies on the slides; its walls hang down past it by the groove's height, clear of the floor.
        const at = floor + Math.max(BOTTOM_SLIDE.sideClear, BOTTOM_SLIDE.height - BOX_GROOVE_UP);
        return { o, name, at, from: floor, to: at + wall, wall, across: whole, width: whole[1] - whole[0], inL: whole[0] };
      }
      const at = o.kind === 'tray' ? Math.max(low, floor + (o.up?.mm ?? 0)) : floor + (o.up?.mm ?? UPPER_UP);
      const from = o.kind === 'tray' ? at - BOX_CLEAR_UNDER : at - tCase;
      const to = o.kind === 'tray' ? at + wall : o.kind === 'shelf' ? at : at + BOX_CLEAR_UNDER + TRAY_WALL;
      return { o, name, at, from, to, wall, across: whole, width: whole[1] - whole[0], inL: whole[0] };
    })
    .sort((p, q) => p.at - q.at || p.from - q.from);
  for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) {
    const [under, over] = [levels[i]!, levels[j]!];
    // The lowest blind corner tray and a tray in front of the door are never in one place at once: the tray is right out
    // when the blind one comes across (`blindFloor` keeps it clear of what stays). A higher blind tray clears the trays.
    if ([under, over].some((l) => l.o === lowestBlind) && [under, over].some((l) => l.o.kind === 'tray')) continue;
    // Two that are side by side do not meet.
    if (under.across[1] <= over.across[0] + 0.01 || over.across[1] <= under.across[0] + 0.01) continue;
    // An inch over a tray, to see into it and lift things out; a shelf can have something standing right on it.
    const least = under.to + (under.o.kind === 'tray' || under.o.kind === 'sideTrays' ? MM_PER_INCH : 0);
    if (over.from < least - 0.01) {
      if (over.at - under.at < 0.01 || over.from < under.from + 0.01) throw new Error(`The ${over.name.toLowerCase()} and the ${under.name.toLowerCase()} would stand in the same place: move one of them to one side, or put one over the other.`);
      const up = least + (over.at - over.from) - floor;
      throw new Error(`There is no room for the ${over.name.toLowerCase()} over the ${under.name.toLowerCase()}: it must stand at least ${Math.ceil(up)} mm (${(Math.ceil((up / MM_PER_INCH) * 8) / 8).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}") above the cabinet's floor.`);
    }
  }
  // A tray on bottom-mount slides: nothing carries it but the floor, so it runs from one edge of the door opening to
  // the other, clear of the hinges, and stands alone (another tray's frame would stand on its slides).
  const underFits = BOTTOM_SLIDE.lengths
    .map((text): Length => ({ mm: Number(text.replace('"', '')) * MM_PER_INCH, unit: 'in' }))
    .reverse()
    .filter((l) => l.mm + BOTTOM_SLIDE.rearClearance <= depth + front);
  const [openL, openR] = [blind === 'left' ? opening.origin.x + hinge : tCase + gap + hinge, blind === 'right' ? opening.origin.x + opening.width - hinge : W - tCase - gap - hinge];
  for (const l of levels) {
    if (l.o.kind !== 'tray') continue;
    if (!onBottomSlides(l.o)) {
      wide(l.o.id, l.name, l.at, l.o.up ? ' Use a shelf with a tray each side of the plumbing.' : '', l.wall);
      continue;
    }
    if (sink.organizers.some((o) => o !== l.o && o.kind === 'tray')) throw new Error(`The ${l.name.toLowerCase()} on bottom-mount slides must be the only tray from side to side: what carries another tray would stand on its slides. Put it on slides at its sides, or take the other tray out.`);
    if (!underFits.length) throw new Error(`The cabinet is too shallow for the ${l.name.toLowerCase()} on bottom-mount slides: none is short enough.`);
    tray(l.o.id, l.name, openL, openR, l.at, '', l.wall, { fits: underFits });
  }
  /**
   * A frame that carries trays: `inL` and `inR` are the inner faces of its two standards, `held` the trays
   * between them. `whole`: it is the frame of the trays from side to side, which a shelf may not pass through.
   */
  const makeFrame = (key: string, name: string, inL: Mm, inR: Mm, held: { y0: Mm; L: Mm; high: Mm }[], whole: boolean): NonNullable<UnderSinkBuild['frame']> => {
    // Two standards on edge, as long as the longest tray and as high as the top slide, standing on two rails laid flat
    // on the cabinet's floor, front and back. With a tray above the bottom one, a tie on edge between the standards at
    // the back, under that tray, keeps them upright; it is left out when a block leaves it no room.
    const L = Math.max(...held.map((a) => a.L));
    const rear = front - L;
    const base = floor + tCase;
    const top = Math.max(...held.map((a) => a.y0 + (TRAY_WALL + BUILD_OUT_HEIGHT) / 2));
    const [x0, x1] = [inL - tCase, inR + tCase];
    const made = parts.length;
    upright(`${key}/standard-left`, `${name}, left standard`, 'pullOut', caseId, [inL, rear], [0, 1], L, base, top - base, tCase);
    upright(`${key}/standard-right`, `${name}, right standard`, 'pullOut', caseId, [inR, front], [0, -1], L, base, top - base, tCase);
    const rail = { width: x1 - x0, height: Math.min(FRAME_RAIL, L / 3), thickness: tCase };
    add(`${key}/rail-front`, `${name}, front rail`, 'pullOut', caseId, rail, { origin: [x0, base, front], xAxis: RIGHT, yAxis: BACK });
    add(`${key}/rail-back`, `${name}, back rail`, 'pullOut', caseId, rail, { origin: [x0, base, rear + rail.height], xAxis: RIGHT, yAxis: BACK });
    let tie = false;
    if (held.length > 1) {
      // Over the lowest tray and under the next one up.
      const sorted = [...held].sort((p, q) => p.y0 - q.y0);
      const heights = sorted.map((a) => a.y0);
      const lo = heights[0]! + sorted[0]!.high + MM_PER_INCH / 4;
      const over = blocks.filter((b) => b.max[0] > inL && b.min[0] < inR && b.min[2] < rear + tCase + C && b.max[2] > rear - C && b.max[1] > lo);
      const hi = Math.min(heights[1]! - MM_PER_INCH / 4, ...over.map((b) => b.min[1] - C));
      if (hi - lo >= 1.5 * MM_PER_INCH) {
        const height = Math.min(FRAME_RAIL, hi - lo);
        upright(`${key}/tie`, `${name}, tie`, 'pullOut', caseId, [inL, rear], [1, 0], inR - inL, hi - height, height, tCase);
        tie = true;
      }
    }
    // Nothing of the frame may stand where a block is.
    const lap = (p: Part) => {
      const o = p.placement!.origin;
      const [ax, ay] = [p.placement!.xAxis, p.placement!.yAxis];
      const az: Vec3 = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]];
      const far: Vec3 = [0, 1, 2].map((k) => o[k]! + ax[k]! * p.size.width + ay[k]! * p.size.height - az[k]! * p.size.thickness) as Vec3;
      return blocks.filter((b) => [0, 1, 2].every((k) => Math.min(o[k]!, far[k]!) < b.max[k]! - 0.01 && Math.max(o[k]!, far[k]!) > b.min[k]! + 0.01));
    };
    const hit = parts.slice(made).flatMap(lap);
    if (hit.length) throw new Error(whole ? `The frame for the trays would stand where ${listed(hit)} is: hang the trays on build-out strips on the cabinet's sides.` : `The ${name.toLowerCase()} would stand where ${listed(hit)} is: move it.`);
    // A shelf from side to side cannot pass through the standards.
    const through = whole ? levels.find((l) => (l.o.kind === 'shelf' || l.o.kind === 'sideTrays') && l.at > base && l.at - tCase < top) : undefined;
    if (through) throw new Error(`The ${through.name.toLowerCase()} would pass through the frame that carries the trays: put it above them, or hang the trays on build-out strips on the cabinet's sides.`);
    return { width: x1 - x0, depth: L, height: top - floor, tie };
  };
  const frame = mounting === 'frame' && across.length ? makeFrame('frame', 'Tray frame', spanL, spanR, across, true) : undefined;
  /** A pull-out for bins: a narrow tray on a frame of its own on the cabinet's floor, as wide as its bins. */
  const pullOut = (l: (typeof levels)[number]) => {
    const { width, inL } = l;
    const [x0, x1] = [inL + clear, inL + clear + width];
    const inR = x1 + clear;
    const past = () => {
      if (inR + tCase > frameR + tCase + 0.01) throw new Error(`The ${l.name.toLowerCase()} does not fit where it stands: it reaches ${Math.round(inR - frameR)} mm past the right edge of the door opening. Move it left, or ${l.o.kind === 'narrow' ? 'make it narrower' : 'measure a narrower bin'}.`);
    };
    if (l.o.kind === 'narrow') {
      // A narrow pull-out: the same tray and frame, as wide as asked, its walls tall. It is cut round what it reaches, as any tray is.
      if (width < MIN_BOX) throw new Error(`The ${l.name.toLowerCase()} is at least ${Math.round(MIN_BOX)} mm wide outside.`);
      past();
      const L = tray(l.o.id, l.name, x0, x1, l.at, '', l.wall);
      makeFrame(`${l.o.id}-frame`, `${l.name} frame`, inL, inR, [{ y0: l.at, L, high: l.wall }], false);
      return;
    }
    const bins = l.o.bins;
    if (!bins || !(bins.width.mm > 0 && bins.depth.mm > 0 && bins.height.mm > 0)) throw new Error(`Measure a bin for the ${l.name.toLowerCase()}: across, front to back and its height.`);
    const count = Math.max(1, Math.floor(bins.count) || 1);
    const need = count * (bins.depth.mm + BIN_PLAY) + BIN_PLAY + 2 * t;
    if (!fits.length || fits[0]!.mm < need) throw new Error(`The cabinet is not deep enough for the ${l.name.toLowerCase()}: ${count === 1 ? 'its bin needs' : `its ${count} bins need`} a tray ${Math.ceil(need)} mm long.`);
    // Its standards stand either side of it: the left one where it is put, or as far left as the door opening lets it.
    past();
    const before = trays.length;
    const L = tray(l.o.id, l.name, x0, x1, l.at, '', PULLOUT_WALL);
    const made = trays[before]!;
    const inWay = blocks.filter((b) => b.min[1] < l.to && b.max[1] > l.at && b.max[0] > x0 && b.min[0] < x1 && b.max[2] > front - L);
    if (made.cutRound || made.stopsAt || L < need || inWay.length) {
      throw new Error(`${capital(inWay.length ? listed(inWay) : (made.round ?? made.stopsAt ?? 'what is in the way'))} is in the way of the ${l.name.toLowerCase()} and its ${count === 1 ? 'bin' : 'bins'} (${Math.round(bins.height.mm)} mm high): move it to one side, or use a lower bin.`);
    }
    makeFrame(`${l.o.id}-frame`, `${l.name} frame`, inL, inR, [{ y0: l.at, L, high: PULLOUT_WALL }], false);
  };
  for (const l of levels) if (l.o.kind === 'pullOut' || l.o.kind === 'narrow') pullOut(l);
  /**
   * Vertical dividers: thin boards on edge, front to back, standing in dados in a base and a top, the two
   * outer ones at the ends. The rack is put together on the bench and stood in the cabinet.
   */
  const dividers = (l: (typeof levels)[number]) => {
    const count = Math.floor(l.o.count ?? 0);
    const height = l.o.height?.mm ?? 0;
    if (count < 2 || count > 16) throw new Error(`The ${l.name.toLowerCase()} have between 2 and 16 boards, the two at the ends counted.`);
    if (height < 6 * MM_PER_INCH) throw new Error(`The ${l.name.toLowerCase()} are at least 6" tall.`);
    const [x0, width] = [l.across[0], l.width];
    if (x0 + width > W - tCase + 0.01 || width < (count - 1) * MM_PER_INCH) throw new Error(`The ${l.name.toLowerCase()} do not fit: ${count} boards need a rack at least ${Math.round((count - 1) * MM_PER_INCH)} mm wide, inside the cabinet.`);
    if (l.at + height > ceiling) throw new Error(`The ${l.name.toLowerCase()} do not fit under the top of the cabinet.`);
    const rear = -depth + SHELF_SIDE_CLEARANCE;
    const deep = front - rear;
    const inWay = blocks.filter((b) => b.max[0] > x0 && b.min[0] < x0 + width && b.max[1] > l.at && b.min[1] < l.at + height && b.max[2] > rear);
    if (inWay.length) throw new Error(`${capital(listed(inWay))} is where the ${l.name.toLowerCase()} would stand: move them to one side, or make them lower.`);
    const key = l.o.id;
    const pitch = (width - tBottom) / (count - 1);
    // A dado for each board, a hair wider than it; the outer two are at the edges.
    const dados: Feature[] = Array.from({ length: count }, (_, k) => {
      const [a, b] = [Math.max(0, k * pitch - 0.15), Math.min(width, k * pitch + tBottom + 0.15)];
      return { id: `divider-dado-${k + 1}`, kind: 'dado', face: 'A', outline: rect(a, 0, b, deep), depth: DIVIDER_DADO };
    });
    const board = { width, height: deep, thickness: tCase };
    add(`${key}/base`, `${l.name}, base`, 'pullOut', caseId, board, { origin: [x0, l.at + tCase, front], xAxis: RIGHT, yAxis: BACK }, dados);
    // The top is the base turned over: its dados look down.
    add(`${key}/top`, `${l.name}, top`, 'pullOut', caseId, board, { origin: [x0, l.at + height - tCase, rear], xAxis: RIGHT, yAxis: FRONT }, dados);
    const tall = height - 2 * tCase + 2 * DIVIDER_DADO;
    for (let k = 0; k < count; k++) {
      add(`${key}/board-${k + 1}`, `${l.name}, board ${k + 1}`, 'pullOut', bottomId, { width: deep, height: tall, thickness: tBottom }, { origin: [x0 + k * pitch + tBottom, l.at + tCase - DIVIDER_DADO, front], xAxis: BACK, yAxis: UP });
    }
  };
  for (const l of levels) if (l.o.kind === 'dividers') dividers(l);
  /**
   * The blind corner tray: a tray in the blind half whose slides run sideways, on two standards that stand
   * across the cabinet (one near the front, one near the back) on two rails. Pulled toward the door opening
   * it comes its whole length into the reachable half, over the frame there.
   */
  const blindTray = (l: (typeof levels)[number]) => {
    if (!blind || !slide) return;
    const high = l.wall;
    const rear = -depth + SHELF_SIDE_CLEARANCE;
    // Its front end stands just short of the frame in the reachable half; its far end near the cabinet's far side.
    const play = MM_PER_INCH / 4;
    const [nearEnd, farEnd] = blind === 'left' ? [spanL - tCase - play, tCase + play] : [spanR + tCase + play, W - tCase - play];
    const room = Math.abs(nearEnd - farEnd);
    const reachable = spanR - spanL;
    // Every blind corner tray hangs on the same two standards: they are made with the lowest, as tall as the highest needs.
    const stack = levels.filter((x) => x.o.kind === 'blindTray');
    // With more than one tray the standards are tall, and a tie stands across their far ends: the trays leave room for it.
    const tie = stack.length > 1 ? tCase : 0;
    const length = [...slide.lengths].reverse().find((x) => x.mm + Math.max(slide.rearClearance, tie) <= room && x.mm <= reachable);
    if (!length) throw new Error(`There is no room for the ${l.name.toLowerCase()}: the blind half is ${Math.round(room)} mm long and the door opening leaves ${Math.round(reachable)} mm to pull it into, and no slide is that short.`);
    const L = length.mm;
    // Across the cabinet it lies between its two standards, front and back.
    const width = front - rear - 2 * (tCase + clear);
    if (width < MIN_BOX) throw new Error(`There is no room for the ${l.name.toLowerCase()}: the cabinet is too shallow.`);
    if (l.to > ceiling - MM_PER_INCH) throw new Error(`The ${l.name.toLowerCase()} does not fit under the top of the cabinet.`);
    // Seen from its own front (the end toward the door opening): F points that way, U to its right.
    const F: Vec3 = blind === 'left' ? RIGHT : LEFT;
    const U: Vec3 = blind === 'left' ? BACK : FRONT;
    const O: Vec3 = [nearEnd, l.at, blind === 'left' ? front - tCase - clear : rear + tCase + clear];
    const at = (u: Mm, f: Mm, up = 0): Vec3 => [O[0] + U[0] * u + F[0] * f, O[1] + up, O[2] + U[2] * u + F[2] * f];
    const back: Vec3 = [-F[0], 0, -F[2]];
    // Where it stands and where it is pulled to: nothing may be in the way of either.
    const [bx0, bx1] = [Math.min(nearEnd, farEnd, nearEnd + F[0] * L), Math.max(nearEnd, farEnd, nearEnd + F[0] * L)];
    const inWay = blocks.filter((b) => b.max[0] > bx0 && b.min[0] < bx1 && b.max[1] > l.at - BOX_CLEAR_UNDER && b.min[1] < l.to && b.max[2] > rear);
    if (inWay.length) throw new Error(`${capital(listed(inWay))} is in the way of the ${l.name.toLowerCase()}, where it stands or where it is pulled to.`);
    const count = used.get(L) ?? { length, pairs: 0 };
    count.pairs += 1;
    used.set(L, count);
    const key = l.o.id;
    const frameKey = `${stack[0]!.o.id}-frame`;
    const frameName = `${stack[0]!.name} frame`;
    /**
     * A tray's box as any other tray's, its sides round the front and the back in rabbets and its bottom in a groove,
     * wherever it faces: `o` is its front corner on the left seen from its own front, `f` points to its front and `u`
     * to its right; `wide` across and `long` from front to back. Its low wall is its front.
     */
    const trayBox = (o: Vec3, f: Vec3, u: Vec3, wide: Mm, long: Mm, ids: { left: [string, string]; right: [string, string]; front: string; back: string; bottom: string }) => {
      const on = (du: Mm, df: Mm, up = 0): Vec3 => [o[0] + u[0] * du + f[0] * df, o[1] + up, o[2] + u[2] * du + f[2] * df];
      const toBack: Vec3 = [-f[0], 0, -f[2]];
      const toLeft: Vec3 = [-u[0], 0, -u[2]];
      const groove = (run: Mm): Feature => ({ id: 'box-groove', kind: 'dado', face: 'A', outline: rect(0, BOX_GROOVE_UP, run, BOX_GROOVE_UP + tBottom), depth: BOX_GROOVE_DEPTH });
      const rabbet = (which: string, from: Mm): Feature => ({ id: which, kind: 'dado', face: 'A', outline: rect(from, 0, from + t, high), depth: BOX_RABBET_DEPTH });
      const side = { width: long, height: high, thickness: t };
      const inside = wide - 2 * t;
      const full = inside + 2 * BOX_RABBET_DEPTH;
      const into = BOX_GROOVE_DEPTH - BOX_BOTTOM_PLAY / 2;
      add(`${key}/${ids.left[0]}`, `${l.name}, ${ids.left[1]}`, 'pullOut', boxId, side, { origin: on(t, 0), xAxis: toBack, yAxis: UP }, [groove(long), rabbet('box-rabbet-front', 0), rabbet('box-rabbet-back', long - t)]);
      add(`${key}/${ids.right[0]}`, `${l.name}, ${ids.right[1]}`, 'pullOut', boxId, side, { origin: on(wide - t, -long), xAxis: f, yAxis: UP }, [groove(long), rabbet('box-rabbet-back', 0), rabbet('box-rabbet-front', long - t)]);
      add(`${key}/${ids.front}`, `${l.name}, front`, 'pullOut', boxId, { width: full, height: high - (TRAY_WALL - TRAY_FRONT), thickness: t }, { origin: on(wide - t + BOX_RABBET_DEPTH, -t), xAxis: toLeft, yAxis: UP }, [groove(full)]);
      add(`${key}/${ids.back}`, `${l.name}, back`, 'pullOut', boxId, { width: full, height: high, thickness: t }, { origin: on(t - BOX_RABBET_DEPTH, -(long - t)), xAxis: u, yAxis: UP }, [groove(full)]);
      add(`${key}/${ids.bottom}`, `${l.name}, bottom`, 'pullOut', bottomId, { width: inside + 2 * into, height: long - 2 * t + 2 * into, thickness: tBottom }, { origin: on(t - into, -t + into, BOX_GROOVE_UP + tBottom), xAxis: u, yAxis: toBack });
      trays.push({ name: l.name, width: wide, length: long, height: high, inside: { width: inside, length: long - 2 * t }, cutRound: false });
    };
    if (l.o.forward) {
      // It also comes forward (`forward`): a platform on the sideways slides, two aprons along its travel with a wall
      // across each end, and the tray between the walls on a second pair of slides, facing the cabinet's front. The
      // front apron is lower than the tray's bottom, so the tray goes out over it.
      const base = l.at;
      const trayAt = PLATFORM_APRON + BOX_CLEAR_UNDER;
      const wallHigh = trayAt + (TRAY_WALL + BUILD_OUT_HEIGHT) / 2;
      const pk = `${key}-platform`;
      const pn = `${l.name} platform`;
      const span = width - 2 * tCase;
      const forwardLength = [...slide.lengths].reverse().find((x) => x.mm + slide.rearClearance <= span);
      const across = L - 2 * tCase - 2 * clear;
      if (!forwardLength || across < MIN_BOX) throw new Error(`There is no room for the ${l.name.toLowerCase()} to come forward as well: its platform would be ${Math.round(L)} mm by ${Math.round(width)} mm. Leave it a tray that only comes across.`);
      const Lz = forwardLength.mm;
      // Boards by where they are: `d` from the side of the platform that is toward the cabinet's front, `f` along
      // its travel (0 at the end toward the door opening, negative into the blind half), `up` above its base. (The
      // tray's own `u` runs from the cabinet's front with the blind half on the left, from its back on the right.)
      const uOf = (d: Mm, deep: Mm) => (blind === 'left' ? d : width - d - deep);
      /** A board on edge along the travel: `thick` across, from `d`; `len` along from `f`. */
      const alongTravel = (id: string, name: string, materialId: string, d: Mm, thick: Mm, f: Mm, len: Mm, up: Mm, height: Mm) =>
        add(id, name, 'pullOut', materialId, { width: len, height, thickness: thick }, { origin: at(uOf(d, thick), f, up), xAxis: F, yAxis: UP });
      /** A board on edge across the travel: `thick` along it, from `f`; `len` across from `d`. */
      const acrossTravel = (id: string, name: string, materialId: string, f: Mm, thick: Mm, d: Mm, len: Mm, up: Mm, height: Mm) =>
        add(id, name, 'pullOut', materialId, { width: len, height, thickness: thick }, { origin: at(uOf(d, len), f + thick, up), xAxis: U, yAxis: UP });
      /** A board lying flat, its top at `up`. */
      const flat = (id: string, name: string, materialId: string, d: Mm, deep: Mm, f: Mm, len: Mm, up: Mm, thick: Mm) =>
        add(id, name, 'pullOut', materialId, { width: len, height: deep, thickness: thick }, { origin: at(uOf(d, deep), f, up), xAxis: F, yAxis: U });
      alongTravel(`${pk}/apron-front`, `${pn}, front apron`, caseId, 0, tCase, -L, L, 0, PLATFORM_APRON);
      alongTravel(`${pk}/apron-back`, `${pn}, back apron`, caseId, width - tCase, tCase, -L, L, 0, PLATFORM_APRON);
      acrossTravel(`${pk}/wall-near`, `${pn}, wall toward the door opening`, caseId, -tCase, tCase, tCase, span, 0, wallHigh);
      acrossTravel(`${pk}/wall-far`, `${pn}, far wall`, caseId, -L, tCase, tCase, span, 0, wallHigh);
      // The tray: a box as the other trays are, facing the cabinet's front, between the two walls and behind the front apron.
      const [f0, f1] = [-L + tCase + clear, -tCase - clear];
      const corner = at(uOf(tCase, 0), F[0] > 0 ? f0 : f1, trayAt);
      trayBox(corner, FRONT, RIGHT, across, Lz, { left: ['tray-side-left', 'left side'], right: ['tray-side-right', 'right side'], front: 'tray-front', back: 'tray-back', bottom: 'tray-bottom' });
      const second = used.get(Lz) ?? { length: forwardLength, pairs: 0 };
      second.pairs += 1;
      used.set(Lz, second);
      // Where it lands when it is across: a ledge on a cleat on the cabinet's back, behind the door opening, just
      // under its back apron. It carries the platform there and the slides do not hang free.
      const ledgeDeep = 2 * tCase + clear + 10;
      flat(`${frameKey}/landing-ledge`, `${l.name}, landing ledge`, caseId, width + clear + tCase - ledgeDeep, ledgeDeep, play, L - play, -1.5, tCase);
      alongTravel(`${frameKey}/landing-cleat`, `${l.name}, landing cleat`, caseId, width + clear, tCase, play, L - play, -1.5 - tCase - LANDING_CLEAT, LANDING_CLEAT);
      void base;
    } else {
      // A tray as any other, turned a quarter: its parts are named for where they are in the cabinet.
      trayBox(O, F, U, width, L, { left: ['side-1', 'side 1'], right: ['side-2', 'side 2'], front: 'front', back: 'back', bottom: 'bottom' });
    }
    // The frame: a standard each side of the trays along their travel, on a rail under each end. Made once, with the lowest.
    if (stack[0] !== l) return;
    const base = floor + tCase;
    const top = Math.max(...stack.map((x) => (x.o.forward ? x.at + PLATFORM_APRON : x.at + (TRAY_WALL + BUILD_OUT_HEIGHT) / 2)));
    const standard = { width: L, height: top - base, thickness: tCase };
    const lift = base - l.at;
    add(`${frameKey}/standard-1`, `${frameName}, front standard`, 'pullOut', caseId, standard, { origin: at(-clear, 0, lift), xAxis: back, yAxis: UP });
    add(`${frameKey}/standard-2`, `${frameName}, back standard`, 'pullOut', caseId, standard, { origin: at(width + clear, -L, lift), xAxis: F, yAxis: UP });
    const rail = { width: width + 2 * clear + 2 * tCase, height: Math.min(FRAME_RAIL, L / 3), thickness: tCase };
    add(`${frameKey}/rail-1`, `${frameName}, near rail`, 'pullOut', caseId, rail, { origin: at(-clear - tCase, 0, lift), xAxis: U, yAxis: back });
    add(`${frameKey}/rail-2`, `${frameName}, far rail`, 'pullOut', caseId, rail, { origin: at(-clear - tCase, -(L - rail.height), lift), xAxis: U, yAxis: back });
    // The tie: a board on edge across the standards' far ends, from the floor to their tops, screwed into their ends.
    // It keeps two tall standards upright and parallel; the trays stop short of it.
    if (tie) add(`${frameKey}/tie`, `${frameName}, tie`, 'pullOut', caseId, { width: rail.width, height: top - floor, thickness: tCase }, { origin: at(-clear - tCase, -L, floor - l.at), xAxis: U, yAxis: UP });
  };
  for (const l of levels) if (l.o.kind === 'blindTray') blindTray(l);
  // The tilt-out tray: a trough behind the false front, up under the top of the cabinet, in front of everything.
  let tiltOut: UnderSinkBuild['tiltOut'];
  if (sink.tiltOut) {
    const [width, height, deep] = [sink.tiltOut.width.mm - MM_PER_INCH, sink.tiltOut.height.mm - MM_PER_INCH / 2, sink.tiltOut.depth.mm];
    if (!(width >= 6 * MM_PER_INCH) || !(height >= 2 * MM_PER_INCH) || !(deep >= 1.5 * MM_PER_INCH) || deep > 4 * MM_PER_INCH) {
      throw new Error('The tilt-out tray needs an opening at least 7" wide and 2-1/2" high behind the false front, and is 1-1/2" to 4" from front to back.');
    }
    const [tx0, ty0] = [W / 2 - width / 2, ceiling - MM_PER_INCH / 4 - height];
    const hit = blocks.filter((b) => b.max[0] > tx0 && b.min[0] < tx0 + width && b.max[1] > ty0 && b.max[2] > -deep - C);
    if (hit.length) throw new Error(`${capital(listed(hit))} comes too far forward for a tilt-out tray behind the false front: it needs ${Math.round(deep + C)} mm.`);
    const lip = Math.min(height, 2 * MM_PER_INCH);
    add('tilt/bottom', 'Tilt-out tray, bottom', 'pullOut', bottomId, { width: width - 2 * t, height: deep - tBottom, thickness: tBottom }, { origin: [tx0 + t, ty0 + tBottom, 0], xAxis: RIGHT, yAxis: BACK });
    add('tilt/lip', 'Tilt-out tray, lip', 'pullOut', bottomId, { width: width - 2 * t, height: lip, thickness: tBottom }, { origin: [tx0 + t, ty0, -deep + tBottom], xAxis: RIGHT, yAxis: UP });
    upright('tilt/end-left', 'Tilt-out tray, left end', 'pullOut', boxId, [tx0, 0], [0, -1], deep, ty0, height, t);
    upright('tilt/end-right', 'Tilt-out tray, right end', 'pullOut', boxId, [tx0 + width, -deep], [0, 1], deep, ty0, height, t);
    tiltOut = { width, height, depth: deep };
  }
  /** A fixed shelf with its top at `level`, on a cleat at each side; `sides`: a tray on it each side of what is in the way. */
  const fixedShelf = (key: string, name: string, level: Mm, sides: boolean) => {
    const suffix = key.slice('shelf'.length);
    const n = suffix ? ` ${suffix.slice(1)}` : '';
    // The shelf: from side to side and nearly to the back, its top at the upper level, on a cleat at each side.
    const shelf = { x0: tCase + SHELF_SIDE_CLEARANCE, x1: W - tCase - SHELF_SIDE_CLEARANCE, rear: -depth + SHELF_SIDE_CLEARANCE };
    const size = { width: shelf.x1 - shelf.x0, height: front - shelf.rear, thickness: tCase };
    if (level > ceiling - 4 * MM_PER_INCH) throw new Error(`There is no room for the ${name.toLowerCase()}: it is too near the top of the cabinet.`);
    // Every block that passes through the board cuts a notch into it from the back: across the block, as far forward
    // as it comes. Where two notches meet the deeper one wins, so the back edge is a line of steps.
    const through = blocks.filter((b) => level > b.min[1] - C && level - tCase < b.max[1] + C && b.max[0] + C > shelf.x0 && b.min[0] - C < shelf.x1 && b.max[2] + C > shelf.rear);
    const notches = through.map((b) => ({ x0: Math.max(0, b.min[0] - C - shelf.x0), x1: Math.min(size.width, b.max[0] + C - shelf.x0), deep: b.max[2] + C - shelf.rear, block: b }));
    const far = notches.find((n) => n.deep > size.height - 3 * MM_PER_INCH);
    if (far) throw new Error(`${capital(far.block.name)} comes too far forward for a shelf round it: too little of the ${name.toLowerCase()} would be left in front.`);
    let outline: Point[] | undefined;
    if (notches.length) {
      const xs = [...new Set([0, size.width, ...notches.flatMap((n) => [n.x0, n.x1])])].sort((a, b) => a - b);
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: size.width, y: 0 },
      ];
      const push = (x: Mm, y: Mm) => {
        const [a, b] = [points.at(-2), points.at(-1)!];
        if (b.x === x && b.y === y) return;
        // A point on the line of the last two takes the last one's place.
        if (a && ((a.x === b.x && b.x === x) || (a.y === b.y && b.y === y))) points.pop();
        points.push({ x, y });
      };
      for (let i = xs.length - 1; i > 0; i--) {
        const mid = (xs[i]! + xs[i - 1]!) / 2;
        const deep = Math.max(0, ...notches.filter((n) => n.x0 < mid && n.x1 > mid).map((n) => n.deep));
        push(xs[i]!, size.height - deep);
        push(xs[i - 1]!, size.height - deep);
      }
      outline = points;
      template(`${name}: its notches`, shelf.x0, shelf.x1, notches.map((n) => ({ x0: n.x0 + shelf.x0, x1: n.x1 + shelf.x0, deep: n.deep })), size.height);
    }
    add(key, name, 'shelf', caseId, size, { origin: [shelf.x0, level, front], xAxis: RIGHT, yAxis: BACK }, [], outline);
    // A cleat stops in front of a block standing where it would run.
    const cleatY = level - tCase - SHELF_CLEAT;
    const cleatRear = (x0: Mm, x1: Mm) => {
      const inWay = blocks.filter((b) => b.min[1] < level - tCase && b.max[1] > cleatY && b.max[0] > x0 && b.min[0] < x1 && b.max[2] > shelf.rear);
      const rear = Math.max(shelf.rear, ...inWay.map((b) => b.max[2] + C));
      if (front - rear < 3 * MM_PER_INCH) throw new Error(`There is no room for the cleat of the ${name.toLowerCase()}: ${listed(inWay)} is where it would be screwed to the side.`);
      return rear;
    };
    const [rearL, rearR] = [cleatRear(tCase, 2 * tCase), cleatRear(W - 2 * tCase, W - tCase)];
    upright(`${key}-cleat-left`, `Shelf${n} cleat, left`, 'pullOut', caseId, [tCase, front], [0, -1], front - rearL, cleatY, SHELF_CLEAT, tCase);
    upright(`${key}-cleat-right`, `Shelf${n} cleat, right`, 'pullOut', caseId, [W - tCase, rearR], [0, 1], front - rearR, cleatY, SHELF_CLEAT, tCase);
    if (sides) {
      // A tray each side of the plumbing, rolling over the shelf: its outer slide on a build-out on the case side, its
      // inner one on a standard that stands on the shelf beside the plumbing. The plumbing is what comes down into the
      // trays' height with room for a tray each side of it; with none like that, whatever comes down into it.
      const y0 = level + BOX_CLEAR_UNDER;
      const reach = blocks.filter((b) => b.min[1] - C < y0 + TRAY_WALL && b.max[1] > level);
      const room = MIN_BOX + tCase + clear + C;
      const middle = reach.filter((b) => b.min[0] - left >= room && right - b.max[0] >= room);
      const between = middle.length ? middle : reach.length ? reach : blocks;
      if (!between.length) throw new Error('Nothing is in the way for a tray each side of it: use a tray from side to side.');
      const [inL, inR] = [Math.min(...between.map((b) => b.min[0])) - C, Math.max(...between.map((b) => b.max[0])) + C];
      const [keyL, keyR, nameL, nameR] = [`tray-left${suffix}`, `tray-right${suffix}`, `Left tray${n}`, `Right tray${n}`];
      const lengthL = tray(keyL, nameL, left, inL - tCase - clear, y0);
      const lengthR = tray(keyR, nameR, inR + tCase + clear, right, y0);
      const standard = BUILD_OUT_HEIGHT + BOX_CLEAR_UNDER;
      upright(`${keyL}/standard`, `${nameL}, standard`, 'pullOut', caseId, [inL, front - lengthL], [0, 1], lengthL, level, standard, tCase);
      upright(`${keyR}/standard`, `${nameR}, standard`, 'pullOut', caseId, [inR, front], [0, -1], lengthR, level, standard, tCase);
      if (mounting === 'frame') {
        // No strip on the cabinet's sides: a second standard on the shelf carries each tray's outer slide.
        upright(`${keyL}/standard-outer`, `${nameL}, outer standard`, 'pullOut', caseId, [spanL, front - lengthL], [0, 1], lengthL, level, standard, tCase);
        upright(`${keyR}/standard-outer`, `${nameR}, outer standard`, 'pullOut', caseId, [spanR, front], [0, -1], lengthR, level, standard, tCase);
      } else {
        buildOut(keyL, nameL, 'left', y0, lengthL);
        buildOut(keyR, nameR, 'right', y0, lengthR);
      }
    }
  };
  for (const l of levels) if (l.o.kind === 'shelf' || l.o.kind === 'sideTrays') fixedShelf(l.o.id, l.name, l.at, l.o.kind === 'sideTrays');
  if (doorRacks) {
    // A rack may not swing into something that is in the way.
    const hit = blocks.filter((b) => b.max[2] > -doorRacks.reach);
    if (hit.length) throw new Error(`${capital(listed(hit))} comes too far forward for racks on the doors: they would strike it as the doors shut.`);
    parts.push(...doorRacks.parts);
  }
  const lengths = [...used.values()].sort((a, b) => b.length.mm - a.length.mm);
  return { parts, obstacles: blocks, trays, templates, jigHeights, ...(tiltOut ? { tiltOut } : {}), ...(doorRacks ? { doorRacks: { racks: doorRacks.racks, weight: doorRacks.weight, reach: doorRacks.reach } } : {}), buildOutLayers: layers, mounting, ...(frame ? { frame } : {}), ...(slide && lengths.length ? { slides: { slide, lengths } } : {}), ...(bottomSlides.length ? { bottomSlides } : {}) };
}

/** The blocks in the way, for the picture: drawn in metal, never cut (`isApplianceShape`). */
export function obstacleShapes(cabinet: CabinetDesign, materials: Material[]): Part[] {
  // (The sink's own bowl is drawn with the sink.)
  return obstacleBlocks(cabinet, materials).filter((b) => b.id !== SINK_BOWL_BLOCK).map(({ id, name, min, max }): Part => {
    const size = { width: max[0] - min[0], height: max[1] - min[1], thickness: max[2] - min[2] };
    return {
      id: `${cabinet.id}/appliance-obstacle-${id}/shape`,
      designObjectId: cabinet.id,
      name: capital(name),
      materialId: cabinet.materials.caseId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, size.width, size.height) }],
      role: 'back',
      placement: { origin: [min[0], min[1], max[2]], xAxis: RIGHT, yAxis: UP },
    };
  });
}
