/**
 * The drawer box: four plywood walls, a bottom in a groove in all four, and the
 * holes for the screws that hold the applied front. Its width comes from the
 * opening and the slide's side clearance, its length is the slide's length, and its
 * height is the opening less a clearance unless the drawer has its own.
 *
 * The box front stands against the back of the applied front. Face A of each wall is
 * its inside face, where the groove and the rabbets are cut; face A of the bottom is
 * its top.
 *
 * In a shop-style cabinet there is no applied front: the box's front wall is what
 * shows, flush with the case front. Plain, the box is the same box. Wide, the front
 * wall fills the opening less the gap, and the sides sit in stopped dados in its back.
 * A wide front with a style of its own (`ShopDrawerDesign.style`, `outsideEdge`) is not among the box's parts: it is
 * a front (`DrawerBox.frontPart`), its show face its face A and the dados on its back.
 * On runners there are no slides: the box is the plain box made to fill the opening,
 * sliding on the case bottom or on a strip screwed to each side (a part, derived
 * here), with the stretcher, the runners of the drawer above or its own kicker
 * strips over it so it cannot tip.
 *
 * Behind a face frame the stiles stand inside the case sides, so the slides either
 * sit on a build-out strip on each side (derived here as parts) or fix to the back
 * of the frame and to rear brackets (hardware; no parts). A strip is cut from the
 * frame stock at its own thickness; short 3D-printed shims on its face, under the
 * slide's screws, make up what is left to the edge of the opening.
 */
import { PLYWOOD_1_2_ID, PLYWOOD_1_4_ID } from '@/libraries';
import type { CabinetDesign, CabinetOpening, CabinetPartRole, DrawerBoxDesign, DrawerDesign, Feature, Hardware, Material, Mm, Part, PartPlacement, Polygon, Project, Shop, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { clearDepth, nailerBehind } from './case';
import { frontFeatures, rect } from './doors';
import { designsOf } from './frontSettings';
import type { SlideMount } from './cabinetAssembly';
import { withGrain } from './grain';
import { drawerHandleHoles, handleFor, routedDrawerPull } from './handles';
import { DOOR_STANDOFF, cabinetOpeningsOf, deriveCabinetOpenings } from './openings';
import { tabSizeOf, tabSlot, tabSpans, tabbedOutline } from './tabs';
import { POCKET_END_INSET, pocketPositions, pocketRow, railEndPositions } from './pocketHoles';
import { frontBorder } from './pattern';
import { fingerNotchOutline } from './pulls';
import { SLIDE_PILOT_DEPTH, SLIDE_PILOT_DIAMETER, type SlideFit, drawerFrontKind, insetFrontDepth, slideCentreUp, slideFit, slideFor, slideRoom, slideHoles, wideFrontDecorated, wideFrontFace, wideFrontMaterialId } from './slides';
import { cabinetsOf } from './settings';
import { boxOf, shiftedParts, thicknessOf } from './style';

/** Between the opening's bottom edge and the underside of the box sides. Tune me. */
export const BOX_CLEAR_UNDER: Mm = MM_PER_INCH / 4;
/** Between the top of the box sides and the opening's top edge. Tune me. */
export const BOX_CLEAR_OVER: Mm = (3 * MM_PER_INCH) / 4;
/** How deep the rabbets at the ends of the box sides are cut. Tune me. */
export const BOX_RABBET_DEPTH: Mm = MM_PER_INCH / 4;
/** How deep the groove for the bottom is cut into each wall. Tune me. */
export const BOX_GROOVE_DEPTH: Mm = MM_PER_INCH / 4;
/** From the bottom edge of a wall to the underside of the box bottom. Tune me. */
export const BOX_GROOVE_UP: Mm = MM_PER_INCH / 2;
/** How much smaller than its grooves the bottom is cut, in each direction, so it goes in. Tune me. */
export const BOX_BOTTOM_PLAY: Mm = 1;
/** Clearance hole for the screws that hold the applied front: a #8 screw. Tune me. */
export const FRONT_SCREW_HOLE: Mm = (3 * MM_PER_INCH) / 16;
/** From the box front's top and bottom edges, and from its ends, to the front screws. Tune me. */
export const FRONT_SCREW_INSET: Mm = MM_PER_INCH;
/** From the box front's ends to the front screws when pocket screws take up the ends. Tune me. */
export const FRONT_SCREW_INSET_POCKETS: Mm = 3 * MM_PER_INCH;
/** How deep the dados in a shop drawer's wide front are, at most; never more than half the front. Tune me. */
export const WIDE_FRONT_DADO_DEPTH: Mm = MM_PER_INCH / 4;
/**
 * How far those dados run past the top and bottom of the box sides, so a side's square
 * end goes into a dado whose ends the bit leaves round: the radius of a 1/4" bit. Tune me.
 */
export const WIDE_FRONT_DADO_OVERRUN: Mm = MM_PER_INCH / 8;
/** A drawer on runners: the gap between the box and each case side. Tune me. */
export const RUNNER_SIDE_CLEARANCE: Mm = MM_PER_INCH / 16;
/** A drawer on runners: the gap between the top of the box and what is over it. Tune me. */
export const RUNNER_TOP_CLEARANCE: Mm = MM_PER_INCH / 8;
/** A drawer on runners: the gap left behind the box, where its stops go. Tune me. */
export const RUNNER_BACK_CLEARANCE: Mm = MM_PER_INCH / 2;
/** Height of a runner or kicker strip; it is as thick as the case material it is cut from. Tune me. */
export const RUNNER_HEIGHT: Mm = (3 * MM_PER_INCH) / 4;
/** Screws that hold a runner or kicker strip to the case side, and how many each takes. Tune me. */
export const RUNNER_SCREW = '#8 × 1-1/4" wood screws';
export const RUNNER_SCREWS = 3;
/** Height of a build-out strip. Tune me. */
export const BUILD_OUT_HEIGHT: Mm = 2 * MM_PER_INCH;
/** Length of a printed shim along its strip. Tune me. */
export const SHIM_LENGTH: Mm = 1.5 * MM_PER_INCH;
/** The most two neighbouring shims on a strip are apart, centre to centre. Tune me. */
export const SHIM_MAX_SPACING: Mm = 10 * MM_PER_INCH;
/** The least a rabbet or groove may leave of a box wall's thickness. */
const MIN_WALL_LEFT: Mm = 4;

/** The box a new drawer starts with: rabbeted corners, 1/2" plywood, a 1/4" bottom. */
export function createDrawerBoxDefaults(): DrawerBoxDesign {
  return { cornerJoint: 'rabbet', materials: { boxId: PLYWOOD_1_2_ID, bottomId: PLYWOOD_1_4_ID } };
}

export interface DrawerBox {
  /** Outside of the box: across the opening, front to back, and the height of its sides. */
  size: { width: Mm; length: Mm; height: Mm };
  /** Applied: a separate front screws to the box (inset in the shop style, where it is a choice). Wide, plain and runners: the box's front wall is the front (shop style). */
  front: 'applied' | 'wide' | 'plain' | 'runners';
  /** The front wall has a hand-hold notch in its top edge (shop style). */
  fingerPull?: boolean;
  /** Wide: the front wall's size and how deep the sides sit in it. `decorated`: it has a style of its own, cut into its outside (`frontPart`). */
  wideFront?: { width: Mm; height: Mm; thickness: Mm; dadoDepth: Mm; decorated?: true };
  /**
   * A wide front with a style of its own (a shaker frame, a pattern, an eased edge): it is a front, not one of
   * `parts`. Its face A is its show face, where its style is cut; the dados for the sides and the bottom's groove
   * are on its back, face B, so the sheet is flipped for it. `deriveParts` gives it with the doors.
   */
  frontPart?: Part;
  heightFrom: 'own' | 'opening';
  /** What carries the slides: the case sides, build-out strips on them, or the face frame and rear brackets. Runners: no slides. */
  mount: 'case' | 'strips' | 'rearBrackets' | 'uprights' | 'runners';
  /** Runners: what the box slides on, and what is over it to stop it tipping as it is pulled out. */
  runners?: { on: 'caseBottom' | 'strips'; under: 'stretcher' | 'runnersAbove' | 'kickers' };
  /** Rear brackets: what they screw to. */
  bracketOn?: 'nailer' | 'back';
  /** Strips: the thickness of each strip, which is its stock's unless the gap is thinner. */
  stripThickness?: Mm;
  /**
   * Strips: the short printed shims on the face of each strip, under the slide's
   * screws, that bring the slide flush with the opening. Left out when the strip
   * alone fills the gap.
   */
  shim?: { thickness: Mm; length: Mm; height: Mm; perStrip: number };
  /**
   * Where the cabinet member of each slide sits: its centre line off the floor, and
   * its front end forward of the case front (the frame's thickness behind a face frame).
   */
  slideAt: { y: Mm; front: Mm };
  /** Left out for a drawer on runners. */
  slide?: SlideFit;
  /** The box parts, then the strips. Each has its place in the cabinet. */
  parts: Part[];
}

const RIGHT: Vec3 = [1, 0, 0];
const LEFT: Vec3 = [-1, 0, 0];
const UP: Vec3 = [0, 1, 0];
const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];

/** Up the end of a box front or back, clear of the groove: two screws, or a row up a tall box. */
function cornerScrews(from: Mm, to: Mm): Mm[] {
  if (to - from > 3 * POCKET_END_INSET) return pocketPositions(from, to);
  return railEndPositions(to - from).map((p) => from + p);
}

/**
 * The box of a drawer on a designed cabinet, on its slide at the slide's length, or
 * on runners. Derived; never stored. `runnersAbove`: the drawer in the opening above
 * is on runners too, so its runners are what is over this one.
 */
export function deriveDrawerBox(
  design: DrawerDesign,
  cabinet: CabinetDesign,
  opening: CabinetOpening,
  slide: SlideFit | undefined,
  materials: Material[],
  runnersAbove = false,
): DrawerBox {
  const box = design.box;
  const t = thicknessOf(materials, box.materials.boxId);
  const tBottom = thicknessOf(materials, box.materials.bottomId);
  const tCase = thicknessOf(materials, cabinet.materials.caseId);

  const kind = drawerFrontKind(design, opening);
  const onRunners = kind === 'runners';
  if (!onRunners && !slide) throw new Error('The drawer has no slide.');
  // The rows of its own bay.
  const rows = deriveCabinetOpenings(cabinet, materials).filter((o) => (o.bay ?? 1) === (opening.bay ?? 1));
  const topRow = rows[0]?.rowId === opening.rowId;
  const lowestRow = rows.at(-1)?.rowId === opening.rowId;
  /** Between the box and each case side: the slide's clearance, or a runner drawer's. */
  const sideClearance = onRunners ? RUNNER_SIDE_CLEARANCE : slide!.slide.sideClearance.mm;
  /** The underside of the box: on its runners, or clear of the opening's edge on slides. */
  const y0 = opening.origin.y + (onRunners ? 0 : BOX_CLEAR_UNDER);
  /**
   * What the box must stay under: the strips at the top of the opening, when it is on
   * runners below another row (the runners above, or its own kickers) or on slides
   * below a drawer on runners.
   */
  const stripsOver = onRunners ? !topRow : runnersAbove;
  const ceiling = opening.origin.y + opening.height - (stripsOver ? RUNNER_HEIGHT : 0);
  /** How deep the case is clear for a drawer on runners, as high as this opening. */
  const clear = clearDepth(cabinet, materials, opening.origin.y + opening.height);

  const width = opening.width - 2 * sideClearance;
  const length = onRunners ? clear - RUNNER_BACK_CLEARANCE : slide!.length.mm;
  const height =
    box.height?.mm ?? (onRunners ? ceiling - y0 - RUNNER_TOP_CLEARANCE : Math.min(opening.height - BOX_CLEAR_UNDER - BOX_CLEAR_OVER, ceiling - y0 - RUNNER_TOP_CLEARANCE));
  const inside = width - 2 * t;
  const rabbeted = box.cornerJoint === 'rabbet';
  /** Finger joints: the front's and the back's ends have tabs through slots at the ends of the sides. */
  const fingered = box.cornerJoint === 'tabs';

  if (inside <= 0) throw new Error(onRunners ? 'The drawer opening is too narrow for a box.' : 'The drawer opening is too narrow for a box on this slide.');
  if (length <= 2 * t) throw new Error(onRunners ? 'The cabinet is too shallow for a drawer box.' : 'The slide is too short for a drawer box.');
  if (y0 + height > ceiling + 1e-6) throw new Error(stripsOver ? 'The drawer box is too tall for its opening: the strips over it take room at the top.' : 'The drawer box is too tall for its opening.');
  if (height < BOX_GROOVE_UP + tBottom + 2 * MIN_WALL_LEFT) throw new Error('The drawer box is too short for the groove that takes its bottom.');
  if (t - BOX_GROOVE_DEPTH < MIN_WALL_LEFT) throw new Error('The box material is too thin for the groove that takes the bottom.');
  if (rabbeted && t - BOX_RABBET_DEPTH < MIN_WALL_LEFT) throw new Error('The box material is too thin for rabbeted corners.');

  // Where the box stands in the cabinet: centred in the opening, its front against the
  // back of the applied front, or at the case front when its front wall is the front.
  const x0 = opening.origin.x + sideClearance;
  const wide = kind === 'wide';
  const frontId = wide ? wideFrontMaterialId(design, opening) : box.materials.boxId;
  const tFront = thicknessOf(materials, frontId);
  /** How deep the sides sit in a wide front. */
  const dado = Math.min(WIDE_FRONT_DADO_DEPTH, tFront / 2);
  if (wide && tFront - BOX_GROOVE_DEPTH < MIN_WALL_LEFT) throw new Error('The front material is too thin for the groove that takes the bottom.');
  /** Where the slides start behind the case front: behind a wide front. */
  const behind = insetFrontDepth(design, opening, materials);
  /** The front ends of the sides: in a wide front's dados. */
  const z0 = kind === 'applied' ? (opening.inFrame || opening.inset ? opening.frontPlane - behind : opening.frontPlane + DOOR_STANDOFF) : wide ? -(tFront - dado) : 0;
  /** The inside face of the front wall. */
  const zInside = wide ? -tFront : z0 - t;

  const parts: Part[] = [];
  // One of several drawers says which it is: "Drawer 2 box side, left".
  const named = (name: string) => (design.name === 'Drawer' ? name : `${design.name} ${name[0]!.toLowerCase()}${name.slice(1)}`);
  /** The outlines with a finger joint's tabs: a dog-bone at each tab's root, and only the CNC cuts them. */
  const tabbedOutlines = new WeakSet<Polygon>();
  const add = (key: string, name: string, role: CabinetPartRole, materialId: string, size: Part['size'], placement: PartPlacement, cut: Feature[] = [], outline?: Polygon) => {
    const tabbed = !!outline && tabbedOutlines.has(outline);
    const part: Part = {
      id: `${design.id}/${key}`,
      designObjectId: design.id,
      name: named(name),
      materialId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: outline ?? rect(0, 0, size.width, size.height), ...(tabbed ? { dogBones: true } : {}) }, ...cut],
      role,
      placement,
      ...(tabbed ? { tabbed: true as const } : {}),
    };
    parts.push(withGrain(part, role, materials));
  };
  /** The groove for the bottom, along the whole inside face of a wall. */
  const groove = (run: Mm): Feature => ({ id: 'box-groove', kind: 'dado', face: 'A', outline: rect(0, BOX_GROOVE_UP, run, BOX_GROOVE_UP + tBottom), depth: BOX_GROOVE_DEPTH });
  const boxId = box.materials.boxId;

  // The sides run the full length. Rabbeted, each end takes the box front or back.
  const rabbet = (id: string, from: Mm): Feature[] => (rabbeted ? [{ id, kind: 'dado', face: 'A', outline: rect(from, 0, from + t, height), depth: BOX_RABBET_DEPTH }] : []);
  // Finger joints: the tabs are above the bottom's groove, the same on a wall's end and in the side it meets. The
  // wall is at the very end of the side, so each slot is open at that end: the fingers of the corner.
  const fingersFrom = BOX_GROOVE_UP + tBottom + MIN_WALL_LEFT;
  const fingers = fingered ? tabSpans(height - fingersFrom, tabSizeOf(box.fingers)).map((s) => ({ from: fingersFrom + s.from, to: fingersFrom + s.to })) : [];
  const fingerSlots = (id: string, from: Mm): Feature[] => fingers.map((s, i) => tabSlot(`${id}-${i + 1}`, 'A', from, s.from, from + t, s.to));
  const sideSize = { width: length, height, thickness: t };
  // Looking at the inside face, the left side's front end is at x = 0 and the right side's at x = its length.
  // In a wide front the sides' front ends are housed whole: no rabbet there.
  add('box-side-left', 'Box side, left', 'boxSide', boxId, sideSize, { origin: [x0 + t, y0, z0], xAxis: BACK, yAxis: UP }, [
    groove(length),
    ...(wide ? [] : rabbet('box-rabbet-front', 0)),
    ...rabbet('box-rabbet-back', length - t),
    ...(wide ? [] : fingerSlots('box-front', 0)),
    ...fingerSlots('box-back', length - t),
  ]);
  add('box-side-right', 'Box side, right', 'boxSide', boxId, sideSize, { origin: [x0 + width - t, y0, z0 - length], xAxis: FRONT, yAxis: UP }, [
    groove(length),
    ...rabbet('box-rabbet-back', 0),
    ...(wide ? [] : rabbet('box-rabbet-front', length - t)),
    ...fingerSlots('box-back', 0),
    ...(wide ? [] : fingerSlots('box-front', length - t)),
  ]);

  // The front and back stand between the sides, or reach into their rabbets. Pocket
  // screws go in from the outside faces, which the applied front and the cabinet hide,
  // above the groove so they cannot break into it.
  const reach = rabbeted ? BOX_RABBET_DEPTH : fingered ? t : 0;
  const across = inside + 2 * reach;
  const screwsAt = cornerScrews(BOX_GROOVE_UP + tBottom, height);
  /** A wall's outline with its fingers; `top`: a finger notch's points along its top edge. */
  const fingeredOutline = (top: Polygon = []): Polygon | undefined => {
    if (!fingered) return top.length ? [{ x: 0, y: 0 }, { x: across, y: 0 }, { x: across, y: height }, ...top, { x: 0, y: height }] : undefined;
    const outline = tabbedOutline(across, height, { x0: { reach: t, spans: fingers }, x1: { reach: t, spans: fingers } }, top);
    tabbedOutlines.add(outline);
    return outline;
  };
  const corners = (face: 'A' | 'B' = 'B'): Feature[] => (rabbeted || fingered ? [] : [...pocketRow('box-pocket-x0', face, 'x0', screwsAt), ...pocketRow('box-pocket-x1', face, 'x1', screwsAt)]);
  // Four clearance holes for the screws that hold the applied front, from inside the box.
  const inset = Math.min(rabbeted ? FRONT_SCREW_INSET : FRONT_SCREW_INSET_POCKETS, across / 4);
  const frontScrews: Feature[] = [
    [inset, FRONT_SCREW_INSET],
    [across - inset, FRONT_SCREW_INSET],
    [inset, height - FRONT_SCREW_INSET],
    [across - inset, height - FRONT_SCREW_INSET],
  ].map(([x, y], i) => ({ id: `front-screw-${i + 1}`, kind: 'hole', face: 'A', center: { x: x!, y: y! }, diameter: FRONT_SCREW_HOLE, depth: t }));
  const wallSize = { width: across, height, thickness: t };
  /** Where the front wall is the drawer's front, it may have a hand-hold notch in its top edge, cut with its outline. */
  const pulled = kind !== 'applied' && design.shop?.pull === 'fingerPull';
  const frontOutline = (size: { width: Mm; height: Mm }) => (pulled ? fingerNotchOutline(size.width, size.height) : undefined);
  let wideFront: DrawerBox['wideFront'];
  let frontPart: Part | undefined;
  const face = wideFrontFace(design.shop);
  const decorated = wide && wideFrontDecorated(design.shop);
  if (decorated) {
    // One piece, with the front's look cut into its outside. Looking at its show face, x
    // runs from the cabinet's left to its right; what the box needs is on its back, at the same x.
    const o = opening.fixedOverlay!;
    const size = { width: opening.width + 2 * o.side, height: opening.height + o.top + o.bottom, thickness: tFront };
    if (size.width <= 0 || size.height <= 0) throw new Error('The drawer front has no size: the gap is too wide for the opening.');
    if (pulled && face.style.kind === 'shaker') throw new Error('A finger notch would cut through the top rail of a shaker front: make the front a slab, or give the drawer a handle.');
    const left = opening.origin.x - o.side;
    const bottom = opening.origin.y - o.bottom;
    const up = y0 - bottom;
    const housing = (id: string, cabinetX: Mm): Feature => ({
      id,
      kind: 'dado',
      face: 'B',
      outline: rect(cabinetX - left, Math.max(0, up - WIDE_FRONT_DADO_OVERRUN), cabinetX + t - left, Math.min(size.height, up + height + WIDE_FRONT_DADO_OVERRUN)),
      depth: dado,
    });
    const behindIt: Feature[] = [
      { id: 'box-groove', kind: 'dado', face: 'B', outline: rect(x0 - left, up + BOX_GROOVE_UP, x0 + width - left, up + BOX_GROOVE_UP + tBottom), depth: BOX_GROOVE_DEPTH },
      housing('front-dado-left', x0),
      housing('front-dado-right', x0 + width - t),
    ];
    const features = frontFeatures(face, size, behindIt, frontOutline(size), { thickness: tFront });
    clearOfTheBack(features, tFront);
    frontPart = withGrain(
      { id: `${design.id}/box-front`, designObjectId: design.id, name: named('Box front'), materialId: frontId, size, features, placement: { origin: [left, bottom, 0], xAxis: RIGHT, yAxis: UP } },
      'drawerFront',
      materials,
    );
    wideFront = { width: size.width, height: size.height, thickness: tFront, dadoDepth: dado, decorated: true };
  } else if (wide) {
    // The front wall fills the opening less the gaps. Looking at its inside face, x runs
    // from the cabinet's right to its left. Each side's end sits in a stopped dado that
    // runs a little past the side's top and bottom; the bottom's groove joins the two.
    const o = opening.fixedOverlay!;
    const size = { width: opening.width + 2 * o.side, height: opening.height + o.top + o.bottom, thickness: tFront };
    if (size.width <= 0 || size.height <= 0) throw new Error('The drawer front has no size: the gap is too wide for the opening.');
    const right = opening.origin.x + opening.width + o.side;
    const bottom = opening.origin.y - o.bottom;
    /** The underside of the box sides, up the front wall. */
    const up = y0 - bottom;
    const housing = (id: string, cabinetX: Mm): Feature => ({
      id,
      kind: 'dado',
      face: 'A',
      outline: rect(right - cabinetX - t, Math.max(0, up - WIDE_FRONT_DADO_OVERRUN), right - cabinetX, Math.min(size.height, up + height + WIDE_FRONT_DADO_OVERRUN)),
      depth: dado,
    });
    const dados = [housing('front-dado-right', x0 + width - t), housing('front-dado-left', x0)];
    const bottomGroove: Feature = {
      id: 'box-groove',
      kind: 'dado',
      face: 'A',
      outline: rect(right - (x0 + width), up + BOX_GROOVE_UP, right - x0, up + BOX_GROOVE_UP + tBottom),
      depth: BOX_GROOVE_DEPTH,
    };
    add('box-front', 'Box front', 'boxFront', frontId, size, { origin: [right, bottom, -tFront], xAxis: LEFT, yAxis: UP }, [bottomGroove, ...dados], frontOutline(size));
    wideFront = { width: size.width, height: size.height, thickness: tFront, dadoDepth: dado };
  } else {
    // The applied front's screw holes only where there is an applied front.
    add(
      'box-front',
      'Box front',
      'boxFront',
      boxId,
      wallSize,
      { origin: [x0 + t + inside + reach, y0, z0 - t], xAxis: LEFT, yAxis: UP },
      [
        groove(across),
        ...(kind === 'applied' ? frontScrews : []),
        // Where the front wall shows, its pocket screws go in from the inside face.
        ...corners(kind === 'applied' ? 'B' : 'A'),
      ],
      // (A finger notch's points are the ones strictly inside the wall's width, in order along its top edge.)
      fingered ? fingeredOutline((frontOutline(wallSize) ?? []).filter((p) => p.x > 1e-6 && p.x < wallSize.width - 1e-6)) : frontOutline(wallSize),
    );
  }
  add('box-back', 'Box back', 'boxBack', boxId, wallSize, { origin: [x0 + t - reach, y0, z0 - length + t], xAxis: RIGHT, yAxis: UP }, [groove(across), ...corners()], fingered ? fingeredOutline() : undefined);

  // The bottom sits in the groove in all four walls, cut a little small so it goes in.
  const into = BOX_GROOVE_DEPTH - BOX_BOTTOM_PLAY / 2;
  add(
    'box-bottom',
    'Box bottom',
    'boxBottom',
    box.materials.bottomId,
    // From the inside face of the front wall to the inside face of the back.
    { width: inside + 2 * into, height: zInside - (z0 - length + t) + 2 * into, thickness: tBottom },
    { origin: [x0 + t - into, y0 + BOX_GROOVE_UP + tBottom, zInside + into], xAxis: RIGHT, yAxis: BACK },
  );

  // Behind a face frame the stiles stand inside the case sides by `gap`.
  const gap = opening.origin.x - tCase;
  let strip: Mm | undefined;
  let shim: DrawerBox['shim'];
  // Beside a mullion a build-out strip has nothing to fix to: a face frame cabinet with bays hangs its slides on rear brackets (milestone 10).
  const mount: DrawerBox['mount'] = onRunners
    ? 'runners'
    : opening.construction !== 'faceFrame' || gap <= 1e-6
      ? 'case'
      : opening.part || (opening.bay && opening.inFrame)
        ? // A split row: the board between its two drawers carries the slides, or a short mullion and the board like it at
          // the back. Between corner posts the three uprights between two bays do.
          'uprights'
        : opening.bay
          ? 'rearBrackets'
        : design.slide.faceFrameMount;
  let runners: DrawerBox['runners'];
  if (onRunners) {
    // A strip of the case material on each side, as thick as the stock and on edge
    // against the side. Runners sit under the box when it is not on the case bottom;
    // kickers sit over it when nothing else is there. Both start behind the fronts
    // of the row they are in and stop at the back.
    const from = tCase + DOOR_STANDOFF;
    const strips = (key: string, name: string, top: Mm) => {
      const run = clearDepth(cabinet, materials, top) - from;
      if (run <= 0) return;
      const size = { width: run, height: RUNNER_HEIGHT, thickness: tCase };
      const caseId = cabinet.materials.caseId;
      // Looking at its face, the left strip's front end is at x = 0 and the right strip's at x = its length.
      add(`${key}-left`, `${name}, left`, 'runner', caseId, size, { origin: [opening.origin.x + tCase, top - RUNNER_HEIGHT, -from], xAxis: BACK, yAxis: UP });
      add(`${key}-right`, `${name}, right`, 'runner', caseId, size, { origin: [opening.origin.x + opening.width - tCase, top - RUNNER_HEIGHT, -from - run], xAxis: FRONT, yAxis: UP });
    };
    if (!lowestRow) strips('runner', 'Runner', opening.origin.y);
    const kickers = !topRow && !runnersAbove;
    if (kickers) strips('kicker', 'Kicker', opening.origin.y + opening.height);
    runners = { on: lowestRow ? 'caseBottom' : 'strips', under: topRow ? 'stretcher' : runnersAbove ? 'runnersAbove' : 'kickers' };
  }
  if (mount === 'strips' && slide) {
    // One strip per slide, from the back of the frame to the slide's rear end, centred
    // on the box side. It is the frame stock at its own thickness, against the case
    // side; short printed shims on its face, one at each end and others between them
    // no further apart than the spacing, fill what is left of the gap. Where the stock
    // is thicker than the gap the strip is the gap's thickness and has to be planed.
    const run = length - (opening.frontPlane - behind);
    if (run <= 0) throw new Error('The slide is too short to reach behind the face frame.');
    const frameId = cabinet.faceFrame.materialId;
    strip = Math.min(gap, thicknessOf(materials, frameId));
    const size = { width: run, height: BUILD_OUT_HEIGHT, thickness: strip };
    // The strip is behind the slide: half way up the box; behind a bottom-mount slide, centred on it and no lower than the opening.
    const low = slide.slide.mount === 'bottom';
    const y = low ? Math.max(opening.origin.y, y0 + slideCentreUp(slide.slide, height) - BUILD_OUT_HEIGHT / 2) : y0 + (height - BUILD_OUT_HEIGHT) / 2;
    const pilotUp = low ? y0 + slideCentreUp(slide.slide, height) - y : BUILD_OUT_HEIGHT / 2;
    // With hole data the slide's screws get pilot holes in the strip's face, along its
    // centre line. A screw in front of the strip goes into the edge of the stile, by hand.
    const r = SLIDE_PILOT_DIAMETER / 2;
    const screws = (slideHoles(slide) ?? []).map((fromFront, i) => ({ n: i + 1, behind: fromFront - (opening.frontPlane - behind) })).filter((h) => h.behind >= r && h.behind <= run - r);
    const pilots = (x: (behind: Mm) => Mm): Feature[] =>
      screws.map((h) => ({
        id: `slide-screw-${h.n}`,
        kind: 'hole',
        face: 'A',
        center: { x: x(h.behind), y: pilotUp },
        diameter: SLIDE_PILOT_DIAMETER,
        depth: Math.min(SLIDE_PILOT_DEPTH, strip! - 2),
      }));
    // Looking at its face, the left strip's front end is at x = 0 and the right strip's at x = its length.
    add('strip-left', 'Build-out strip, left', 'buildOut', frameId, size, { origin: [tCase + strip, y, 0], xAxis: BACK, yAxis: UP }, pilots((d) => d));
    add('strip-right', 'Build-out strip, right', 'buildOut', frameId, size, { origin: [opening.origin.x + opening.width + gap - strip, y, -run], xAxis: FRONT, yAxis: UP }, pilots((d) => run - d));
    if (gap - strip > 1e-6) {
      // One shim under each screw when the slide says where they are; else spaced evenly.
      const perStrip = screws.length || 1 + Math.max(1, Math.ceil((run - SHIM_LENGTH) / SHIM_MAX_SPACING - 1e-9));
      shim = { thickness: gap - strip, length: Math.min(SHIM_LENGTH, run), height: BUILD_OUT_HEIGHT, perStrip };
    }
  }

  return {
    size: { width, length, height },
    front: kind,
    ...(pulled ? { fingerPull: true } : {}),
    ...(wideFront ? { wideFront } : {}),
    ...(frontPart ? { frontPart } : {}),
    heightFrom: box.height ? 'own' : 'opening',
    mount,
    ...(mount === 'rearBrackets' ? { bracketOn: nailerBehind(cabinet, opening.origin.y + opening.height) ? ('nailer' as const) : ('back' as const) } : {}),
    ...(strip !== undefined ? { stripThickness: strip } : {}),
    ...(shim ? { shim } : {}),
    slideAt: { y: y0 + (slide && !onRunners ? slideCentreUp(slide.slide, height) : height / 2), front: opening.frontPlane - behind },
    ...(runners ? { runners } : {}),
    ...(slide && !onRunners ? { slide } : {}),
    parts,
  };
}

/**
 * A wide front cut from both faces: what is cut into its outside (a shaker recess, a pattern) may not meet the dados
 * for the box sides or the bottom's groove in its back. Where the two overlap in plan, `MIN_WALL_LEFT` must be left
 * between them; else it throws, naming the fix.
 */
function clearOfTheBack(features: Feature[], thickness: Mm): void {
  type Box = { x0: Mm; y0: Mm; x1: Mm; y1: Mm };
  const boxOf = (points: { x: Mm; y: Mm }[], grow = 0): Box => ({
    x0: Math.min(...points.map((q) => q.x)) - grow,
    y0: Math.min(...points.map((q) => q.y)) - grow,
    x1: Math.max(...points.map((q) => q.x)) + grow,
    y1: Math.max(...points.map((q) => q.y)) + grow,
  });
  const meet = (a: Box, b: Box) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
  const back = features.flatMap((f) => (f.kind === 'dado' && f.face === 'B' ? [{ box: boxOf(f.outline), depth: f.depth, what: f.id === 'box-groove' ? "the groove for the box's bottom" : 'the dado for the box side' }] : []));
  const outside = features.flatMap((f): { box: Box; depth: Mm; what: string; fix: string }[] => {
    // The recess, out to the frame's inside edge (a bevel is the wall between the two).
    if (f.kind === 'bevel') return [{ box: boxOf(f.path), depth: f.depth, what: 'The shaker recess', fix: 'make the frame wider, the recess shallower, or the front thicker' }];
    if (f.kind === 'pocket' && f.face === 'A') return [{ box: boxOf(f.outline), depth: f.depth, what: 'The shaker recess', fix: 'make the frame wider, the recess shallower, or the front thicker' }];
    if (f.kind === 'slot' && f.face === 'A') return [{ box: boxOf(f.path, f.width / 2), depth: f.depth, what: 'The pattern', fix: 'give the pattern a wider margin, cut it shallower, or make the front thicker' }];
    return [];
  });
  for (const o of outside) {
    for (const b of back) {
      if (meet(o.box, b.box) && thickness - o.depth - b.depth < MIN_WALL_LEFT - 1e-6) throw new Error(`${o.what} and ${b.what} meet: ${o.fix}.`);
    }
  }
}

/** The box of a drawer in the project; nothing when the drawer is not on a designed cabinet, or on one that is already there. */
export function drawerBox(design: DrawerDesign, project: Project, shop: Pick<Shop, 'materials' | 'hardware'>): DrawerBox | undefined {
  const found = cabinetOpeningsOf(project, shop.materials).find((o) => o.id === design.mounting.openingId);
  const whole = cabinetsOf(project).find((c) => c.id === found?.cabinetId);
  if (!found || !whole) return undefined;
  // Behind a face frame that overhangs its sides the box is narrower than the cabinet (`boxOf`): the drawer's box,
  // its slides and their strips are worked out in the box's own frame, then stood where the box is.
  const { box: cabinet, shift } = boxOf(whole, shop.materials);
  const made = boxInFrame(design, project, shop, cabinet, shift ? { ...found, origin: { ...found.origin, x: found.origin.x - shift } } : found);
  return made && shift ? { ...made, parts: shiftedParts(made.parts, shift), ...(made.frontPart ? { frontPart: shiftedParts([made.frontPart], shift)[0]! } : {}) } : made;
}

function boxInFrame(design: DrawerDesign, project: Project, shop: Pick<Shop, 'materials' | 'hardware'>, cabinet: CabinetDesign, opening: CabinetOpening): DrawerBox | undefined {
  // In a case that is already there the box and its slides are there too: only a front is ever made.
  if (cabinet.existing) return undefined;
  // What is over it: the runners of a drawer on runners in the opening above, if there is one.
  const rows = cabinetOpeningsOf(project, shop.materials).filter((o) => o.cabinetId === cabinet.id && (o.bay ?? 1) === (opening.bay ?? 1));
  const above = rows[rows.findIndex((o) => o.id === opening.id) - 1];
  const drawerAbove = above && designsOf(project).find((d): d is DrawerDesign => d.template === 'drawer' && d.mounting.openingId === above.id);
  const runnersAbove = !!drawerAbove && drawerFrontKind(drawerAbove, above) === 'runners';
  if (drawerFrontKind(design, opening) === 'runners') return withHandle(deriveDrawerBox(design, cabinet, opening, undefined, shop.materials, runnersAbove), design, shop.hardware);
  const slide = slideFit(design, slideFor(design, shop.hardware), slideRoom(cabinet, opening, shop.materials, insetFrontDepth(design, opening, shop.materials)));
  return withHandle(deriveDrawerBox(design, cabinet, opening, slide, shop.materials, runnersAbove), design, shop.hardware);
}

/**
 * Where the front of the box is the drawer's front and it has no finger pull, its
 * handle's holes go through it, bored from its inside face (its face A, where its
 * other work is).
 */
function withHandle(box: DrawerBox, design: DrawerDesign, hardware: Hardware[]): DrawerBox {
  if (box.front === 'applied' || box.fingerPull || !design.handle) return box;
  const handle = handleFor(design.handle, hardware);
  const choice = design.handle;
  // A wide front with a style of its own: its handle goes where a drawer front's does (the middle of its border, a
  // shaker front's top rail). Its holes go through: they are bored from the show face where a frame or a pattern is
  // cut there, and else from the back with the dados, so that a knob alone does not turn the sheet over.
  const styled = (part: Part): Part => {
    const { style } = wideFrontFace(design.shop);
    const face = style.kind === 'shaker' || style.pattern ? 'A' : 'B';
    const routed = routedDrawerPull(handle, choice, part.size, face, style.kind === 'shaker' ? style.frameWidth.mm : undefined, frontBorder(style));
    const features = part.features.map((f) => (f.kind === 'cutout' && routed.outline ? { ...f, outline: routed.outline } : f));
    return { ...part, features: [...features, ...drawerHandleHoles(handle, choice, part.size, face, frontBorder(style)), ...routed.bores] };
  };
  return {
    ...box,
    ...(box.frontPart ? { frontPart: styled(box.frontPart) } : {}),
    parts: box.parts.map((part) => {
      if (part.role !== 'boxFront') return part;
      // A handle's screw holes, or the pull cut into the front itself: a hole, or a notch in its outline.
      const routed = routedDrawerPull(handle, choice, part.size, 'A');
      const features = part.features.map((f) => (f.kind === 'cutout' && routed.outline ? { ...f, outline: routed.outline } : f));
      return { ...part, features: [...features, ...drawerHandleHoles(handle, choice, part.size, 'A'), ...routed.bores] };
    }),
  };
}

/**
 * The slide every drawer of the project runs on, for the 3D view: none for a drawer on
 * runners, or one whose box cannot be made (the Design screen says why).
 */
export function slideMountsOf(project: Project, shop: Pick<Shop, 'materials' | 'hardware'>): SlideMount[] {
  return designsOf(project)
    .filter((d): d is DrawerDesign => d.template === 'drawer')
    .flatMap((drawer): SlideMount[] => {
      let box: DrawerBox | undefined;
      try {
        box = drawerBox(drawer, project, shop);
      } catch {
        return [];
      }
      return box?.slide && box.mount !== 'runners' ? [{ drawerId: drawer.id, slide: box.slide.slide, length: box.slide.length.mm }] : [];
    });
}
