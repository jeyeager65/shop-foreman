/**
 * The case of a designed cabinet as parts. The bottom and the stretchers meet the
 * sides with the cabinet's case joint (`joints.ts`): pocket screws, which add holes
 * to the spanning part, or a dado, which adds a recess to each side and lengthens
 * the spanning part. The back sits in a rabbet or a groove in the sides, or is
 * applied over the rear of the case; the back stretcher lies flat or stands on edge
 * against the back as a nailer.
 *
 * The sides and stretchers are the same in both construction styles. Behind a face
 * frame the bottom is raised to the top of the frame's bottom rail, and the back and
 * the toe kick board follow it. The frame itself is `faceFrame.ts`; the pocket holes
 * that attach it are here, in the front edges of the sides, the bottom and the front
 * stretcher. What differs between the styles comes from `constructionRules`, not
 * from here.
 */
import type { CabinetDesign, CabinetPartRole, CaseJoint, Feature, Material, Mm, Part, PartEdge, PartPlacement, Polygon, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { rect } from './doors';
import { HUB, hubBackCut, hubBackSplit, hubPanel, hubSideCuts } from './hub';
import { withGrain } from './grain';
import { DOOR_STANDOFF, deriveCabinetOpenings, wholeOpenings } from './openings';
import { tabReach, tabSizeOf, tabSlot, tabSpans, tabbedOutline, tabsOf } from './tabs';
import { BACK_GROOVE_DEPTH, BACK_RABBET_DEPTH, CASE_DADO_DEPTH, CASE_SCREW_HOLE, TAB_BACK_MIN, backFit, caseJointOf, jointReach } from './joints';
import { POCKET_END_INSET, jointPositions, pocketPositions, pocketRow } from './pocketHoles';
import { constructionRules, thicknessOf, kickBoardOf, toeKickOf } from './style';

import { SINK_STRETCHER_WIDTH, STRETCHER_WIDTH, topStretcherWidth } from './stretchers';
export { SINK_STRETCHER_WIDTH, STRETCHER_WIDTH, topStretcherWidth };
/** How tall a wall cabinet's hanging rails stand, top and bottom, against the back. Tune me. */
export const HANGING_RAIL_WIDTH: Mm = 3.5 * MM_PER_INCH;
/** The width of each half of a French cleat, and of the spacer strip under it. Tune me. */
export const CLEAT_WIDTH: Mm = 3 * MM_PER_INCH;
/** The two short edges of a corner block under the top. Tune me. */
export const TOP_CORNER_BLOCK: Mm = 4 * MM_PER_INCH;
/** The width of a cross stretcher under the top. Tune me. */

export const CROSS_STRETCHER_WIDTH: Mm = 3 * MM_PER_INCH;
/** Whether a cabinet can have corner blocks and cross stretchers under its top: one with stretchers, an ordinary case. */
export const takesTopSupport = (cabinet: Pick<CabinetDesign, 'form' | 'corner' | 'caseTop'>) => !hasTopPanel(cabinet) && cabinet.corner?.kind !== 'diagonal' && cabinet.corner?.kind !== 'lShaped';
/** A cabinet with a full top panel where a base cabinet has its two stretchers: a wall or a tall one, or a base one that asks for it (`caseTop`). */
export const hasTopPanel = (cabinet: Pick<CabinetDesign, 'form' | 'caseTop'>) => cabinet.form !== 'base' || cabinet.caseTop === 'panel';
/** A wall cabinet hung on rails inside it, top and bottom. */
export const hasHangingRails = (cabinet: Pick<CabinetDesign, 'form' | 'hanging' | 'onTop'>) => cabinet.form === 'wall' && cabinet.hanging === 'rails' && !cabinet.onTop;
/** Gap between an adjustable shelf and each side. Tune me. */
export const SHELF_SIDE_CLEARANCE: Mm = MM_PER_INCH / 16;
/** How far an adjustable shelf's front edge sits behind the case front. Tune me. */
export const SHELF_FRONT_SETBACK: Mm = MM_PER_INCH / 4;

/** How tall a cabinet's toe kick board is: from the floor to the underside of its bottom. */
/**
 * The outline of a toe kick board that stands in front of the sides: `height` tall, and notched down to `low`
 * (the height of the sides' own notches) wherever a side stands behind it (`sides`: each from x to x). Behind a
 * face frame the bottom is raised, so the board reaches higher than the sides' notches and is cut round each
 * side, with a dog-bone in each notch. A plain rectangle
 * where the board is no taller than the sides' notches. Sides that touch (a join in a run) share one notch.
 */
export function kickBoardOutline(width: Mm, height: Mm, low: Mm, sides: [Mm, Mm][]): Polygon {
  if (height - low < 1e-6) return rect(0, 0, width, height);
  const gaps: [Mm, Mm][] = [];
  for (const [a, b] of sides.map(([a, b]) => [Math.max(0, a), Math.min(width, b)] as [Mm, Mm]).filter(([a, b]) => b - a > 1e-6).sort((p, q) => p[0] - q[0])) {
    const last = gaps.at(-1);
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else gaps.push([a, b]);
  }
  // The top edge from left to right, then the outline counter-clockwise from the bottom left.
  const top: Polygon = [];
  let x = 0;
  for (const [a, b] of gaps) {
    if (a > 1e-6) top.push({ x, y: height }, { x: a, y: height });
    top.push({ x: a, y: low }, { x: b, y: low });
    x = b;
  }
  if (width - x > 1e-6) top.push({ x, y: height }, { x: width, y: height });
  const distinct = top.filter((p, i) => i === 0 || Math.abs(p.x - top[i - 1]!.x) > 1e-6 || Math.abs(p.y - top[i - 1]!.y) > 1e-6);
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, ...distinct.reverse()];
}

export const kickBoardHeight =(cabinet: CabinetDesign, materials: Material[]): Mm => toeKickOf(cabinet).height + constructionRules(cabinet, materials).bottomLift;

/** From each end of a pocket-screwed toe kick board to where its row of holes up into the bottom starts. Tune me. */
export const KICK_ROW_INSET: Mm = 4 * MM_PER_INCH;

const RIGHT: Vec3 = [1, 0, 0];
const UP: Vec3 = [0, 1, 0];
const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];

/** A slot for air behind equipment: this long (less in a narrow opening) and this high, its ends round. Tune me. */
export const AIR_SLOT = { length: 6 * MM_PER_INCH, height: MM_PER_INCH, below: 2 * MM_PER_INCH };
/** How far above an opening's floor a cable hole's centre is, when the cabinet does not say. Tune me. */
export const CABLE_UP: Mm = 3 * MM_PER_INCH;

/**
 * The holes through the back for cables and air: behind each opening that is open, a round
 * hole in the middle of its width, and with `air` a slot high in it. Each is an opening cut through the back
 * inside its outline, in the back's own coordinates (`x0`, `y0`: where its corner is in the cabinet). One that
 * would not lie wholly on the back with a margin round it is left out.
 */
export function cableCuts(cabinet: CabinetDesign, materials: Material[], x0: Mm, y0: Mm, back: { width: Mm; height: Mm }): Feature[] {
  const cables = cabinet.cables;
  if (!cables) return [];
  const cuts: Feature[] = [];
  const margin = 12;
  const inside = (cx: Mm, cy: Mm, rx: Mm, ry: Mm) => cx - rx > margin && cx + rx < back.width - margin && cy - ry > margin && cy + ry < back.height - margin;
  const round = (cx: Mm, cy: Mm, r: Mm) => Array.from({ length: 48 }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / 48), y: cy + r * Math.sin((2 * Math.PI * i) / 48) }));
  /** A slot with round ends: `long` between its ends' centres, `r` its half height. */
  const slot = (cx: Mm, cy: Mm, long: Mm, r: Mm) => [
    ...Array.from({ length: 13 }, (_, i) => ({ x: cx + long / 2 + r * Math.cos(-Math.PI / 2 + (Math.PI * i) / 12), y: cy + r * Math.sin(-Math.PI / 2 + (Math.PI * i) / 12) })),
    ...Array.from({ length: 13 }, (_, i) => ({ x: cx - long / 2 + r * Math.cos(Math.PI / 2 + (Math.PI * i) / 12), y: cy + r * Math.sin(Math.PI / 2 + (Math.PI * i) / 12) })),
  ];
  for (const o of deriveCabinetOpenings(cabinet, materials).filter((x) => x.open)) {
    const cx = o.origin.x + o.width / 2 - x0;
    const r = cables.diameter.mm / 2;
    const cy = o.origin.y + (cables.up?.mm ?? CABLE_UP) - y0;
    if (r > 0 && inside(cx, cy, r, r)) cuts.push({ id: `cable-${o.id.split('/').pop()}`, kind: 'cutout', face: 'A', inside: true, outline: round(cx, cy, r) });
    if (cables.air) {
      const long = Math.min(AIR_SLOT.length, o.width - 4 * MM_PER_INCH) - AIR_SLOT.height;
      const ay = o.origin.y + o.height - AIR_SLOT.below - y0;
      if (long > 0 && ay - AIR_SLOT.height / 2 > cy + r + margin && inside(cx, ay, long / 2 + AIR_SLOT.height / 2, AIR_SLOT.height / 2)) {
        cuts.push({ id: `air-${o.id.split('/').pop()}`, kind: 'cutout', face: 'A', inside: true, outline: slot(cx, ay, long, AIR_SLOT.height / 2) });
      }
    }
  }
  return cuts;
}

/** Whether a case may go without a back: an ordinary box that is made here. */
export const takesNoBack = (cabinet: Pick<CabinetDesign, 'corner' | 'existing'>) => !cabinet.existing && cabinet.corner?.kind !== 'diagonal' && cabinet.corner?.kind !== 'lShaped';

/**
 * The back as the case is cut for it: its joint and its thickness. A case with no back (`noBack`) is cut as for
 * a back of no thickness laid over the rear: nothing in the sides, and everything runs the full depth.
 */
export function backOf(cabinet: CabinetDesign, materials: Material[]): { joint: CabinetDesign['joinery']['back']; thickness: Mm; none: boolean } {
  const none = !!cabinet.noBack && takesNoBack(cabinet);
  return none ? { joint: 'applied', thickness: 0, none } : { joint: cabinet.joinery.back, thickness: thicknessOf(materials, cabinet.materials.backId), none };
}

/**
 * From the case front to the front face of the back: where the bottom, the
 * stretchers and the shelves end. A groove sets the back in from the rear.
 */
export function insideDepth(cabinet: CabinetDesign, materials: Material[]): Mm {
  const { joint, thickness: tBack } = backOf(cabinet, materials);
  const fit = backFit(joint, tBack, thicknessOf(materials, cabinet.materials.caseId));
  return cabinet.size.depth.mm - Math.max(fit.behind, tBack);
}

/**
 * How far behind the case front the inside is clear, for something that reaches up
 * to `top` off the floor: to the back, or to the nailer where it stands in the way.
 */
export function clearDepth(cabinet: CabinetDesign, materials: Material[], top: Mm): Mm {
  return insideDepth(cabinet, materials) - (nailerBehind(cabinet, top) ? thicknessOf(materials, cabinet.materials.caseId) : 0);
}

/** Whether a nailer (or a wall cabinet's top hanging rail) stands at the back behind something that reaches up to `top` off the floor. */
export function nailerBehind(cabinet: CabinetDesign, top: Mm): boolean {
  if (hasTopPanel(cabinet)) return hasHangingRails(cabinet) && top > rearClear(cabinet).top;
  return cabinet.joinery.backStretcherForm === 'nailer' && top > cabinet.size.height.mm - STRETCHER_WIDTH;
}

/**
 * Between which heights off the floor the rear of the sides, in front of the back, is
 * free: below a nailer, or between a wall cabinet's two hanging rails. The case
 * material's thickness is not known here, so a top panel and a bottom count as rail.
 */
export function rearClear(cabinet: CabinetDesign, caseThickness: Mm = 0): { bottom: Mm; top: Mm } {
  const H = cabinet.size.height.mm;
  if (hasHangingRails(cabinet)) return { bottom: caseThickness + HANGING_RAIL_WIDTH, top: H - caseThickness - HANGING_RAIL_WIDTH };
  if (!hasTopPanel(cabinet) && cabinet.joinery.backStretcherForm === 'nailer') return { bottom: 0, top: H - STRETCHER_WIDTH };
  return { bottom: 0, top: H };
}

/**
 * Where the adjustable shelves go, off the floor: the lowest door opening, as much of
 * it as is inside the case. Nothing when the cabinet has no door opening.
 */
export function shelfSpace(cabinet: CabinetDesign, materials: Material[]): { bottom: Mm; top: Mm } | undefined {
  return shelfSpaces(cabinet, materials).at(-1);
}

/**
 * The space behind every door row, top row first, with how many adjustable shelves it
 * has: the lowest row's are the cabinet's, an upper row's are that row's own.
 */
export function shelfSpaces(cabinet: CabinetDesign, materials: Material[]): { rowId: string; bottom: Mm; top: Mm; count: number }[] {
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const floorTop = toeKickOf(cabinet).height + t + constructionRules(cabinet, materials).bottomLift;
  // One bay's rows: with several, the shelves of each bay are its own (milestone 10).
  const openings = wholeOpenings(deriveCabinetOpenings(cabinet, materials)).filter((o) => o.use === 'doors' && (o.bay ?? 1) === 1);
  return openings.map((opening, i) => {
    const own = i === openings.length - 1 ? cabinet.adjustableShelves : (cabinet.layout.rows.find((r) => r.id === opening.rowId)?.shelves ?? 0);
    return {
      rowId: opening.rowId,
      bottom: Math.max(floorTop, opening.origin.y),
      top: Math.min(cabinet.size.height.mm - t, opening.origin.y + opening.height),
      count: Math.max(0, Math.floor(own)),
    };
  });
}

/**
 * The fixed shelves: one between every two door rows, its top face the floor of the
 * upper row's opening. Top to bottom, as heights off the floor.
 */
export function fixedShelfTops(cabinet: CabinetDesign, materials: Material[]): Mm[] {
  const openings = wholeOpenings(deriveCabinetOpenings(cabinet, materials)).filter((o) => (o.bay ?? 1) === 1);
  return openings.slice(0, -1).flatMap((o, i) => (o.use === 'doors' && openings[i + 1]!.use === 'doors' ? [o.origin.y] : []));
}

/** The case parts of one cabinet, each with its place in the cabinet. Derived; never stored. */
/**
 * `frontsDepth`: how thick the inset fronts of a shop-style cabinet are, when it is
 * known (the doors' material); the shelves stop that far behind the case front.
 */
export function deriveCaseParts(cabinet: CabinetDesign, materials: Material[], frontsDepth?: Mm): Part[] {
  const W = cabinet.size.width.mm;
  const H = cabinet.size.height.mm;
  const { height: kickH, depth: kickD } = toeKickOf(cabinet);
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const { joint: backJoint, thickness: tBack, none: noBack } = backOf(cabinet, materials);
  const fit = backFit(backJoint, tBack, t, tabReach(cabinet, t));
  /** A back on tabs: thick enough to have them, and in one piece. */
  const backTabs = backJoint === 'tabs' && !noBack;
  if (backTabs && tBack < TAB_BACK_MIN - 1e-6) throw new Error('The back is too thin for tabs: give it a material 1/2" thick or more, or put this one in a rabbet or a groove.');
  if (backTabs && hubBackSplit(cabinet, materials) !== undefined) throw new Error("The hub's upper back comes off, which a back on tabs cannot: give the cabinet a back in a rabbet or an applied one.");
  /** From the case front to the front face of the back. */
  const depth = insideDepth(cabinet, materials);
  /** Depth of the sides: the full case depth, less the back when it is applied over them. */
  const sideDepth = depth + fit.behind;
  /** Between the sides. */
  const inside = W - 2 * t;
  const rules = constructionRules(cabinet, materials);
  // Behind a face frame the bottom is raised so its top is level with the top of the
  // frame's bottom rail: no lip at the front of the cabinet. Frameless, it sits on
  // the top of the toe kick.
  const floorTop = kickH + t + rules.bottomLift;
  /** Banding on the front edges: those parts are cut this much smaller and set back by it. */
  const band = rules.frontEdgeBand;
  /** Underside of the bottom: where the back starts and the toe kick board ends. */
  const floorUnder = floorTop - t;
  const ceiling = H - t;

  if (inside <= 0) throw new Error('The cabinet is too narrow for its two sides.');
  /** A full top panel (a wall cabinet) in place of the two stretchers. */
  const topPanel = hasTopPanel(cabinet);
  const rails = hasHangingRails(cabinet);
  if (!topPanel && depth <= 2 * topStretcherWidth(cabinet)) throw new Error('The cabinet is too shallow for its two stretchers.');
  if (rails && ceiling - floorTop <= 2 * HANGING_RAIL_WIDTH) throw new Error('The cabinet is too short for its two hanging rails.');
  // In front of the sides (`toeKick.board`) the board's face is where the toe space ends, so the sides' notches are deeper by its thickness.
  const kickBoard = kickBoardOf(cabinet);
  const boardAhead = kickBoard === 'inFront' || kickBoard === 'acrossRun';
  if (kickH < 0 || kickD < 0 || kickD + t + (boardAhead ? t : 0) >= depth) throw new Error('The toe kick is too deep for the cabinet.');
  if (ceiling <= floorTop) throw new Error('The cabinet is too short for its toe kick, bottom and stretchers.');
  if (backJoint === 'rabbet' && BACK_RABBET_DEPTH > t - 1) throw new Error('The case material is too thin for the rabbet that takes the back.');
  if (backJoint === 'groove' && BACK_GROOVE_DEPTH > t / 2 + 1e-6) {
    throw new Error('The case material is too thin for the groove that takes the back: it would cut more than halfway through the sides.');
  }

  const parts: Part[] = [];
  /** The outlines that have tabs: the inside corner at each tab's root gets a dog-bone, so the joint closes. */
  const tabbedOutlines = new WeakSet<Polygon>();
  const add = (
    key: string,
    name: string,
    role: CabinetPartRole,
    materialId: string,
    size: { width: Mm; height: Mm; thickness: Mm },
    placement: PartPlacement,
    outline: Polygon = rect(0, 0, size.width, size.height),
    banded?: PartEdge,
    cut: Feature[] = [],
  ) => {
    const part: Part = {
      id: `${cabinet.id}/${key}`,
      designObjectId: cabinet.id,
      name,
      materialId,
      size,
      // The outline is the part's shape: a rectangle, or a side with its toe-kick notch.
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline, ...(tabbedOutlines.has(outline) ? { dogBones: true } : {}) }, ...cut],
      role,
      placement,
      ...(tabbedOutlines.has(outline) ? { tabbed: true as const } : {}),
      ...(banded && band > 0 ? { banding: { edges: [banded], thickness: band, ...(rules.frontEdgeStrip ? { strip: true as const } : {}) } } : {}),
    };
    parts.push(withGrain(part, role, materials));
  };
  const caseId = cabinet.materials.caseId;

  // Pocket screws (and glue) hold a face frame to the front edges of the sides, the
  // bottom and the front stretcher. An exposed side takes them in its inside face
  // (A), between the bottom and the stretchers, so its outside stays clean; a hidden
  // side takes them in its outside face (B), along the whole frame. The bottom takes
  // them from underneath and the front stretcher from on top.
  const framePockets = (face: 'A' | 'B', edge: PartEdge, from: Mm, to: Mm): Feature[] =>
    rules.hasFaceFrame ? pocketRow('frame-pocket', face, edge, pocketPositions(from, to)) : [];
  const sidePockets = (side: 'left' | 'right', edge: PartEdge) =>
    cabinet.sides[side] === 'hidden' ? framePockets('B', edge, kickH, H) : framePockets('A', edge, floorTop, ceiling);

  // A banded front edge is cut back by the band, so the finished edge is the case front.
  const sideW = sideDepth - band;
  const notch = kickD + (boardAhead ? t : 0) - band;
  /** With a flat bottom (or a toe kick of no size) the sides are plain rectangles. */
  const notched = kickH > 0 && notch > 0;

  // The joints between the sides and the parts that span the cabinet.
  const joint = { bottom: caseJointOf(cabinet, 'bottom'), front: caseJointOf(cabinet, 'frontStretcher'), back: caseJointOf(cabinet, 'backStretcher') };
  if (Object.values(joint).includes('dado') && CASE_DADO_DEPTH > t / 2 + 1e-6) {
    throw new Error('The case material is too thin for dados: they would cut more than halfway through the sides.');
  }
  // Tabs (`src/design/tabs.ts`): the spanning part's ends have tabs, each side a slot for each: through it, or a
  // pocket in its inside face. A part at the very top or bottom of a side has its slots open at that edge.
  const tabDeep = tabReach(cabinet, t);
  const reachOf = (which: CaseJoint) => jointReach(which, tabDeep);
  const slotDepth = tabsOf(cabinet).blind ? tabDeep : undefined;
  const slotAt = (side: 'left' | 'right', id: string, d0: Mm, d1: Mm, y0: Mm, y1: Mm): Feature => {
    const [x0, x1] = side === 'left' ? [d0 - band, d1 - band] : [sideDepth - d1, sideDepth - d0];
    return tabSlot(id, 'A', x0, y0, x1, y1, slotDepth);
  };
  /** The slots in a side for a part that lies flat: its front edge `front` behind the case front, `length` deep, its top at `top`. */
  const slotsFlat = (side: 'left' | 'right', which: CaseJoint, key: string, front: Mm, length: Mm, top: Mm): Feature[] =>
    which !== 'tabs' ? [] : tabSpans(length, tabSizeOf(cabinet.joinery.tabs)).map((s, i) => slotAt(side, `${key}-${i + 1}`, front + s.from, front + s.to, top - t, top));
  /** For a part on edge against the back: from `d0` to `d1` behind the case front, `width` high from `under`. */
  const slotsOnEdge = (side: 'left' | 'right', which: CaseJoint, key: string, d0: Mm, d1: Mm, under: Mm, width: Mm): Feature[] =>
    which !== 'tabs' ? [] : tabSpans(width, tabSizeOf(cabinet.joinery.tabs)).map((s, i) => slotAt(side, `${key}-${i + 1}`, d0, d1, under + s.from, under + s.to));
  /** A spanning part's outline: a rectangle, or with tabs on its two ends. */
  const endsOutline = (which: CaseJoint, width: Mm, length: Mm): Polygon | undefined => {
    if (which !== 'tabs') return undefined;
    const edge = { reach: tabDeep, spans: tabSpans(length, tabSizeOf(cabinet.joinery.tabs)) };
    const outline = tabbedOutline(width, length, { x0: edge, x1: edge });
    tabbedOutlines.add(outline);
    return outline;
  };
  // Pocket screws go through the ends of the spanning part into the sides: from under
  // the bottom and from the top of the stretchers, where they are out of sight. `from`
  // is where the joint's run of holes starts, measured from the part's front edge.
  const sideScrews = (which: CaseJoint, face: 'A' | 'B', from: Mm, length: Mm): Feature[] => {
    if (which !== 'pocketScrews') return [];
    const at = jointPositions(Math.min(from, length), length);
    return [...pocketRow('side-pocket-left', face, 'x0', at), ...pocketRow('side-pocket-right', face, 'x1', at)];
  };
  // Behind a face frame they start clear of the row that attaches the frame along the same part's front edge.
  const clearOfFrame = rules.hasFaceFrame ? POCKET_END_INSET : 0;
  // A dado houses the part's end in each side: glued, no fasteners, and the part is
  // longer by the dado's depth at each end.
  /** A recess in a side's inside face, from `d0` to `d1` behind the case front and from `y0` to `y1` off the floor. */
  const recess = (side: 'left' | 'right', id: string, d0: Mm, d1: Mm, y0: Mm, y1: Mm, deep: Mm): Feature => {
    // Looking at the inside face, the left side's front edge is at x = 0 and the right side's at x = its width.
    const [x0, x1] = side === 'left' ? [d0 - band, d1 - band] : [sideDepth - d1, sideDepth - d0];
    return { id, kind: 'dado', face: 'A', outline: rect(x0, y0, x1, y1), depth: deep };
  };
  const housing = (side: 'left' | 'right', which: CaseJoint, id: string, d0: Mm, d1: Mm, y0: Mm, y1: Mm): Feature[] =>
    which === 'dado' ? [recess(side, id, d0, d1, y0, y1, CASE_DADO_DEPTH)] : [];
  // Through screws go through the sides from outside into the end of the part: a hole
  // through each side at each screw, on the centre line of the part's end, spaced
  // along the joint as its pocket holes would be. They are drilled from the inside
  // face (A), with the rest of the side's work, so the side is not flipped for them.
  /** Holes through a side: `at` are points behind the case front and off the floor. */
  const through = (side: 'left' | 'right', which: CaseJoint, key: string, at: { behind: Mm; y: Mm }[]): Feature[] =>
    which !== 'throughScrews'
      ? []
      : at.map(({ behind, y }, i) => ({
          id: `case-screw-${key}-${i + 1}`,
          kind: 'hole',
          face: 'A',
          center: { x: side === 'left' ? behind - band : sideDepth - behind, y },
          diameter: CASE_SCREW_HOLE,
          depth: t,
        }));
  /** Along a part that lies flat: from its front edge `front` behind the case front, `length` deep, its top at `top`. */
  const alongFlat = (front: Mm, length: Mm, from: Mm, top: Mm) => jointPositions(Math.min(from, length), length).map((p) => ({ behind: front + p, y: top - t / 2 }));
  // The back stretcher: flat like the front one, or a nailer on edge with its rear face against the back.
  // (Over a power hub it lies flat whatever the project says: on edge it would stand in the opening the removable back leaves.)
  const nailer = cabinet.joinery.backStretcherForm === 'nailer' && hubBackSplit(cabinet, materials) === undefined;
  /** The back stretcher's section in a side: from..to behind the case front, under..H off the floor. */
  // The top stretchers' depth, front to back where they lie flat: narrower over a sink, whose bowl hangs between them.
  const SW = topStretcherWidth(cabinet);
  const rear = nailer ? { from: depth - t, to: depth, under: H - STRETCHER_WIDTH } : { from: depth - SW, to: depth, under: ceiling };
  // The dados stop at the front of the back, so none runs into its rabbet or groove.
  // The rabbet or groove itself runs the full height of the side, down to the floor.
  // A wall cabinet's hanging rails stand on edge against the back, under the top and on the bottom: joined like a nailer.
  const railSpans = rails
    ? [
        { key: 'hanging-rail-top', name: 'Top hanging rail', under: ceiling - HANGING_RAIL_WIDTH },
        { key: 'hanging-rail-bottom', name: 'Bottom hanging rail', under: floorTop },
      ]
    : [];
  // What spans the case at its floor: the bottom, or with none (`noBottom`) a stretcher at the front and one at the
  // back (between corner posts the frame's bottom rail is the front one). Each: where it starts behind the case
  // front, how deep it is, its joint, and where its screws start clear of the frame's.
  const noBottom = !!cabinet.noBottom && kickH === 0 && cabinet.form !== 'wall';
  const floorSpans = !noBottom
    ? [{ key: 'bottom', name: 'Bottom', role: 'bottom' as const, which: joint.bottom, front: band, length: depth - band, frame: true, clear: clearOfFrame }]
    : [
        ...(rules.inFrame ? [] : [{ key: 'bottom-stretcher-front', name: 'Bottom stretcher, front', role: 'stretcher' as const, which: joint.front, front: band, length: STRETCHER_WIDTH - band, frame: true, clear: clearOfFrame }]),
        { key: 'bottom-stretcher-back', name: 'Bottom stretcher, back', role: 'stretcher' as const, which: joint.back, front: depth - STRETCHER_WIDTH, length: STRETCHER_WIDTH, frame: false, clear: 0 },
      ];
  // A fixed shelf between two door rows is the bottom over again, higher up.
  const fixedShelves = fixedShelfTops(cabinet, materials).map((top, i) => ({ key: i === 0 ? 'fixed-shelf' : `fixed-shelf-${i + 1}`, name: i === 0 ? 'Fixed shelf' : `Fixed shelf ${i + 1}`, top }));
  // A back on tabs: tabs up its two edges, a slot in each side for each. A tab that would come beside the slot or the
  // dado of a part standing on edge against the back (a nailer, a hanging rail) is left off, so the two never meet.
  const onEdge = [...(topPanel ? railSpans.map((r) => ({ from: r.under, to: r.under + HANGING_RAIL_WIDTH })) : nailer ? [{ from: rear.under, to: H }] : [])].filter(() => joint.back === 'tabs' || joint.back === 'dado');
  const backSpans = backTabs
    ? tabSpans(H - floorUnder, tabSizeOf(cabinet.joinery.tabs)).filter((s) => !onEdge.some((e) => floorUnder + s.to > e.from - t && floorUnder + s.from < e.to + t))
    : [];
  const sideDados = (side: 'left' | 'right'): Feature[] => [
    ...floorSpans.flatMap((s) => housing(side, s.which, `dado-${s.key}`, s.front, s.front + s.length, floorUnder, floorTop)),
    ...fixedShelves.flatMap((s) => housing(side, joint.bottom, `dado-${s.key}`, band, depth, s.top - t, s.top)),
    ...(topPanel
      ? [
          ...housing(side, joint.bottom, 'dado-top', band, depth, ceiling, H),
          ...railSpans.flatMap((r) => housing(side, joint.back, `dado-${r.key}`, depth - t, depth, r.under, r.under + HANGING_RAIL_WIDTH)),
        ]
      : [
          ...housing(side, joint.front, 'dado-stretcher-front', band, SW, ceiling, H),
          ...housing(side, joint.back, 'dado-stretcher-back', rear.from, rear.to, rear.under, H),
        ]),
    ...floorSpans.flatMap((s) => slotsFlat(side, s.which, s.key, s.front, s.length, floorTop)),
    ...fixedShelves.flatMap((s) => slotsFlat(side, joint.bottom, s.key, band, depth - band, s.top)),
    ...(topPanel
      ? [...slotsFlat(side, joint.bottom, 'top', band, depth - band, H), ...railSpans.flatMap((r) => slotsOnEdge(side, joint.back, r.key, depth - t, depth, r.under, HANGING_RAIL_WIDTH))]
      : [
          ...slotsFlat(side, joint.front, 'stretcher-front', band, SW - band, H),
          ...(nailer ? slotsOnEdge(side, joint.back, 'stretcher-back', rear.from, rear.to, rear.under, STRETCHER_WIDTH) : slotsFlat(side, joint.back, 'stretcher-back', rear.from, SW, H)),
        ]),
    ...backSpans.map((s, i) => slotAt(side, `back-${i + 1}`, depth, depth + tBack, floorUnder + s.from, floorUnder + s.to)),
    ...(backJoint === 'rabbet' ? [recess(side, 'rabbet-back', depth, depth + tBack, 0, H, BACK_RABBET_DEPTH)] : []),
    ...(backJoint === 'groove' ? [recess(side, 'groove-back', depth, depth + tBack, 0, H, BACK_GROOVE_DEPTH)] : []),
    ...floorSpans.flatMap((s) => through(side, s.which, s.key, alongFlat(s.front, s.length, s.clear, floorTop))),
    ...fixedShelves.flatMap((s) => through(side, joint.bottom, s.key, alongFlat(band, depth - band, clearOfFrame, s.top))),
    ...(topPanel
      ? [
          ...through(side, joint.bottom, 'top', alongFlat(band, depth - band, clearOfFrame, H)),
          ...railSpans.flatMap((r) => through(side, joint.back, r.key, jointPositions(0, HANGING_RAIL_WIDTH).map((p) => ({ behind: depth - t / 2, y: r.under + p })))),
        ]
      : [
          ...through(side, joint.front, 'stretcher-front', alongFlat(band, SW - band, clearOfFrame, H)),
          ...through(
            side,
            joint.back,
            'stretcher-back',
            nailer ? jointPositions(0, STRETCHER_WIDTH).map((p) => ({ behind: rear.from + t / 2, y: rear.under + p })) : alongFlat(rear.from, SW, 0, H),
          ),
        ]),
  ];

  // A cabinet's own toe kick board in front of its sides, pocket-screwed: the holes are in each side's inside
  // face, down in the toe space, and the screws leave through the front of the notch into the back of the board.
  const kickPockets = (edge: 'x0' | 'x1'): Feature[] =>
    kickBoard === 'inFront' && cabinet.toeKick.joint === 'pocketScrews' && notch > 0
      ? pocketRow('kick-pocket', 'A', edge, jointPositions(0, Math.min(floorUnder, kickH))).map((f) => ({ ...f, inset: notch }))
      : [];

  // Sides run to the floor. Face A is the inside face, where the joinery and the
  // hardware holes go, so the two sides are mirror images.
  const sideSize = { width: sideW, height: H, thickness: t };
  add(
    'side-left',
    'Left side',
    'side',
    caseId,
    sideSize,
    { origin: [t, 0, -band], xAxis: BACK, yAxis: UP },
    notched
      ? [
          { x: notch, y: 0 },
          { x: sideW, y: 0 },
          { x: sideW, y: H },
          { x: 0, y: H },
          { x: 0, y: kickH },
          { x: notch, y: kickH },
        ]
      : undefined,
    'x0',
    [...sidePockets('left', 'x0'), ...sideDados('left'), ...kickPockets('x0'), ...hubSideCuts(cabinet, materials, 'left', (behind) => behind - band)],
  );
  add(
    'side-right',
    'Right side',
    'side',
    caseId,
    sideSize,
    { origin: [W - t, 0, -sideDepth], xAxis: FRONT, yAxis: UP },
    notched
      ? [
          { x: 0, y: 0 },
          { x: sideW - notch, y: 0 },
          { x: sideW - notch, y: kickH },
          { x: sideW, y: kickH },
          { x: sideW, y: H },
          { x: 0, y: H },
        ]
      : undefined,
    'x1',
    [...sidePockets('right', 'x1'), ...sideDados('right'), ...kickPockets('x1'), ...hubSideCuts(cabinet, materials, 'right', (behind) => sideDepth - behind)],
  );
  // A toe kick board in front of the sides seats in the corner of each side's notch, which a round bit leaves
  // round: a dog-bone there lets the board's square edge in. Between the sides nothing seats in that corner, and it
  // stays round.
  if (notched && boardAhead) {
    for (const side of parts.filter((p) => p.role === 'side')) {
      const cutout = side.features[0]!;
      if (cutout.kind === 'cutout') cutout.dogBones = true;
    }
  }

  // Flat parts between the sides: face A is the top face, part Y runs toward the back.
  // A dado makes the part longer at both ends; the frame's pocket holes keep their place between the sides.
  const spanning = (key: string, name: string, role: CabinetPartRole, which: CaseJoint, front: Mm, length: Mm, top: Mm, face: 'A' | 'B', frame: boolean, banded?: PartEdge) => {
    const reach = reachOf(which);
    add(key, name, role, caseId, { width: inside + 2 * reach, height: length, thickness: t }, { origin: [t - reach, top, -front], xAxis: RIGHT, yAxis: BACK }, endsOutline(which, inside + 2 * reach, length), banded, [
      // (Between corner posts the top and the bottom rails stand at the posts' faces, clear of the box: the posts hold them.)
      ...(frame && !rules.inFrame ? framePockets(face, 'y0', reach, reach + inside) : []),
      ...sideScrews(which, face, frame ? clearOfFrame : 0, length),
    ]);
  };
  for (const s of floorSpans) spanning(s.key, s.name, s.role, s.which, s.front, s.length, floorTop, 'B', s.frame, s.frame ? 'y0' : undefined);
  for (const s of fixedShelves) spanning(s.key, s.name, 'bottom', joint.bottom, band, depth - band, s.top, 'B', true, 'y0');
  if (topPanel) {
    // The top is the bottom over again, its screws in from above where they are out of sight.
    spanning('top', 'Top', 'stretcher', joint.bottom, band, depth - band, H, 'A', true, 'y0');
    const reach = reachOf(joint.back);
    const size = { width: inside + 2 * reach, height: HANGING_RAIL_WIDTH, thickness: t };
    // On edge against the back: face A is the rail's front, and its screws go in from the rear face, which the back covers.
    for (const r of railSpans) {
      add(r.key, r.name, 'stretcher', caseId, size, { origin: [t - reach, r.under, -(depth - t)], xAxis: RIGHT, yAxis: UP }, endsOutline(joint.back, size.width, size.height), undefined, sideScrews(joint.back, 'B', 0, HANGING_RAIL_WIDTH));
    }
  } else {
  spanning('stretcher-front', 'Front stretcher', 'stretcher', joint.front, band, SW - band, H, 'A', true, 'y0');
  if (nailer) {
    // On edge at the top back: face A is its front, and its screws go in from the rear
    // face, which the back covers.
    const reach = reachOf(joint.back);
    const size = { width: inside + 2 * reach, height: STRETCHER_WIDTH, thickness: t };
    add('stretcher-back', 'Back stretcher', 'stretcher', caseId, size, { origin: [t - reach, rear.under, -rear.from], xAxis: RIGHT, yAxis: UP }, endsOutline(joint.back, size.width, size.height), undefined, sideScrews(joint.back, 'B', 0, STRETCHER_WIDTH));
  } else {
    spanning('stretcher-back', 'Back stretcher', 'stretcher', joint.back, rear.from, SW, H, 'A', false);
  }
  }

  // More under the top (a vanity top): corner blocks and cross stretchers, flush with the top of the case, between
  // the front stretcher's rear edge and the front of the back stretcher. Glued and screwed; their joints are not drawn.
  const support = takesTopSupport(cabinet) ? cabinet.topSupport : undefined;
  if (support) {
    const [front, back] = [SW, rear.from];
    const block = support.cornerBlocks ? Math.min(TOP_CORNER_BLOCK, inside / 2, (back - front) / 2) : 0;
    if (block > 0) {
      const size = { width: block, height: block, thickness: t };
      const at = (x: Mm, behind: Mm): PartPlacement => ({ origin: [x, H, -behind], xAxis: RIGHT, yAxis: BACK });
      // Each a right triangle, its square corner in the corner of the case.
      const corners: [key: string, name: string, place: PartPlacement, outline: Polygon][] = [
        ['corner-block-front-left', 'Corner block, front left', at(t, front), [{ x: 0, y: 0 }, { x: block, y: 0 }, { x: 0, y: block }]],
        ['corner-block-front-right', 'Corner block, front right', at(W - t - block, front), [{ x: 0, y: 0 }, { x: block, y: 0 }, { x: block, y: block }]],
        ['corner-block-back-left', 'Corner block, back left', at(t, back - block), [{ x: 0, y: 0 }, { x: block, y: block }, { x: 0, y: block }]],
        ['corner-block-back-right', 'Corner block, back right', at(W - t - block, back - block), [{ x: block, y: 0 }, { x: block, y: block }, { x: 0, y: block }]],
      ];
      for (const [key, name, place, outline] of corners) {
        add(key, name, 'stretcher', caseId, size, place, outline);
        parts.at(-1)!.shaped = true;
      }
    }
    // With bays the partitions and mullions stand where these would: one bay only.
    if (support.crossStretchers && (cabinet.layout.bays?.length ?? 1) <= 1) {
      const apart = support.crossStretchers.apart.mm;
      const left = W / 2 - apart / 2 - CROSS_STRETCHER_WIDTH;
      if (apart <= 0 || left < t + block - 1e-6) throw new Error('There is no room for the cross stretchers that far apart: bring them closer together.');
      const size = { width: CROSS_STRETCHER_WIDTH, height: back - front, thickness: t };
      add('cross-stretcher-left', 'Cross stretcher, left', 'stretcher', caseId, size, { origin: [left, H, -front], xAxis: RIGHT, yAxis: BACK });
      add('cross-stretcher-right', 'Cross stretcher, right', 'stretcher', caseId, size, { origin: [W / 2 + apart / 2, H, -front], xAxis: RIGHT, yAxis: BACK });
    }
  }

  // The back runs from the underside of the bottom to the top of the case. Applied, it
  // covers the rear edges of the sides; in a rabbet or a groove it reaches into each
  // side by the recess's depth. Face A is the inside face.
  // Behind a power hub it is two panels, meeting half-way down the rear edge of the shelf under the hub's space: the
  // upper one comes off, to get at the hub, and has the second dust port's hole.
  const split = hubBackSplit(cabinet, materials);
  const backSize = { width: inside + 2 * fit.reach, height: (split ?? H) - floorUnder, thickness: tBack };
  const backOutline = backTabs ? tabbedOutline(backSize.width, backSize.height, { x0: { reach: fit.reach, spans: backSpans }, x1: { reach: fit.reach, spans: backSpans } }) : undefined;
  if (backOutline) tabbedOutlines.add(backOutline);
  if (!noBack) add('back', 'Back', 'back', cabinet.materials.backId, backSize, { origin: [t - fit.reach, floorUnder, -depth], xAxis: RIGHT, yAxis: UP }, backOutline, undefined, cableCuts(cabinet, materials, t - fit.reach, floorUnder, backSize));
  // The access panel is of the case material, not the back's: it carries a port with a hose on it, and is screwed
  // on and off. It is set in between the sides, standing on the shelf and under the stretcher, so that its outside
  // face is level with the back's below it; a little smaller than its opening, to come out.
  const accessInner = depth + tBack - t;
  if (!noBack && split !== undefined) {
    const fitGap = HUB.fit / 2;
    add('hub-back', 'Hub access panel', 'back', caseId, { width: inside - HUB.fit, height: ceiling - split - HUB.fit, thickness: t }, { origin: [t + fitGap, split + fitGap, -accessInner], xAxis: RIGHT, yAxis: UP }, undefined, undefined, hubBackCut(cabinet, materials, (x) => x - (t + fitGap), split + fitGap));
  }

  // A power hub's switch panel: it closes the space at the top, flush with the case front, its face A forward. It is
  // screwed on from the front, so it comes off to get at the switches.
  const switchPanel = hubPanel(cabinet, materials);
  if (switchPanel) {
    add('hub-panel', 'Hub switch panel', 'filler', caseId, switchPanel.size, { origin: switchPanel.origin, xAxis: RIGHT, yAxis: UP }, undefined, undefined, switchPanel.cuts);
    // What the two panels are screwed to: a cleat on the inside of each side at the front, set back by the switch
    // panel's thickness, and one at the back, set forward by what the access panel is set in. Glued and screwed to the sides.
    const strip = { width: HUB.cleat, height: switchPanel.size.height, thickness: t };
    const y = switchPanel.origin[1];
    // (The back pair stand that far forward of the sides' rear edges: the access panel is set in against them.)
    for (const [end, name, front] of [['front', 'front', t], ['back', 'back', accessInner - HUB.cleat]] as const) {
      add(`hub-cleat-${end}-left`, `Hub cleat, ${name} left`, 'cleat', caseId, strip, { origin: [2 * t, y, -front], xAxis: BACK, yAxis: UP });
      add(`hub-cleat-${end}-right`, `Hub cleat, ${name} right`, 'cleat', caseId, strip, { origin: [W - t, y, -front], xAxis: BACK, yAxis: UP });
    }
  }

  // A French cleat: one half on the cabinet's back at the top, its mate on the wall under it,
  // and a spacer of the same thickness at the bottom so the cabinet hangs plumb. They are as
  // long as the cabinet is wide, so the cabinet's half is screwed into the rear edges of the
  // sides and the top. Drawn as plain strips; the 45 degree bevel is ripped on the table saw.
  if (cabinet.form === 'wall' && cabinet.hanging === 'cleat' && !cabinet.onTop) {
    if (H <= 3 * CLEAT_WIDTH) throw new Error('The cabinet is too short for a French cleat and its spacer.');
    const rear = -cabinet.size.depth.mm;
    const strip = { width: W, height: CLEAT_WIDTH, thickness: t };
    const behind = (y: Mm): PartPlacement => ({ origin: [0, y, rear], xAxis: RIGHT, yAxis: UP });
    add('cleat-cabinet', 'Cleat, on the cabinet', 'cleat', caseId, strip, behind(H - CLEAT_WIDTH));
    add('cleat-wall', 'Cleat, on the wall', 'cleat', caseId, strip, behind(H - 2 * CLEAT_WIDTH));
    add('cleat-spacer', 'Spacer strip', 'cleat', caseId, strip, behind(0));
  }

  // The toe kick board stands between the sides and reaches up to the bottom, its face at the back of the notch.
  // A wall cabinet has none: behind a face frame its raised bottom leaves a recess under it.
  if (floorUnder > 0 && cabinet.form !== 'wall') {
    // Pocket-screwed (`toeKick.joint`): holes in its back (face B), into the sides at its two ends and up into the
    // bottom along its top edge. The row into the bottom starts well in from each end, so its pockets stay clear
    // of the ones into the sides however long the job's kind of pocket is.
    // In front of the sides it is as wide as the cabinet, and only the row up into the bottom is in it: the
    // sides' own pockets hold it to them (`kickPockets`). One board across a run is not this cabinet's part
    // (`runKickBoards`).
    const upRow = (from: Mm, to: Mm) => (to - from > 2 * KICK_ROW_INSET + 1e-6 ? pocketRow('bottom-pocket', 'B', 'y1', pocketPositions(from + KICK_ROW_INSET, to - KICK_ROW_INSET)) : pocketRow('bottom-pocket', 'B', 'y1', [(from + to) / 2]));
    if (kickBoard === 'inFront') {
      // Taller than the sides' notches (a raised bottom, behind a face frame): notched round each side, with
      // dog-bones so the sides' square corners seat.
      const outline = kickBoardOutline(W, floorUnder, kickH, [[0, t], [W - t, W]]);
      add('toe-kick', 'Toe kick', 'toeKick', caseId, { width: W, height: floorUnder, thickness: t }, { origin: [0, 0, -kickD], xAxis: RIGHT, yAxis: UP }, outline, undefined, cabinet.toeKick.joint === 'pocketScrews' ? upRow(t, W - t) : []);
      const cutout = parts.at(-1)!.features[0]!;
      if (outline.length > 4 && cutout.kind === 'cutout') cutout.dogBones = true;
    }
    const kickScrews: Feature[] =
      cabinet.toeKick.joint === 'pocketScrews'
        ? [
            ...pocketRow('side-pocket-left', 'B', 'x0', jointPositions(0, floorUnder)),
            ...pocketRow('side-pocket-right', 'B', 'x1', jointPositions(0, floorUnder)),
            ...(inside > 2 * KICK_ROW_INSET + 1e-6 ? pocketRow('bottom-pocket', 'B', 'y1', pocketPositions(KICK_ROW_INSET, inside - KICK_ROW_INSET)) : pocketRow('bottom-pocket', 'B', 'y1', [inside / 2])),
          ]
        : [];
    if (kickBoard === 'between') add('toe-kick', 'Toe kick', 'toeKick', caseId, { width: inside, height: floorUnder, thickness: t }, { origin: [t, 0, -kickD], xAxis: RIGHT, yAxis: UP }, undefined, undefined, kickScrews);
  }

  // Adjustable shelves, spaced evenly behind each door row (the part of its opening inside
  // the case). They move; this is where they are drawn. The lowest row's come first and
  // are plain "Shelf"; an upper row's are "Upper shelf".
  const spaces = shelfSpaces(cabinet, materials);
  for (const doors of [...spaces].reverse()) {
    const { count } = doors;
    if (count === 0) continue;
    const lowest = doors === spaces.at(-1);
    const gap = (doors.top - doors.bottom - count * t) / (count + 1);
    if (gap <= 0) throw new Error('There is no room for that many shelves.');
    // Behind inset doors a shelf stops short of their back faces, by the bumper gap.
    const setback = rules.inset ? (frontsDepth ?? t) + DOOR_STANDOFF : SHELF_FRONT_SETBACK;
    const size = { width: inside - 2 * SHELF_SIDE_CLEARANCE, height: depth - setback - band, thickness: t };
    for (let i = 1; i <= count; i++) {
      const top = doors.bottom + i * (gap + t);
      const place = { origin: [t + SHELF_SIDE_CLEARANCE, top, -setback - band] as Vec3, xAxis: RIGHT, yAxis: BACK };
      const name = `${lowest ? 'Shelf' : 'Upper shelf'}${count > 1 ? ` ${i}` : ''}`;
      add(lowest ? `shelf-${i}` : `shelf-${doors.rowId}-${i}`, name, 'shelf', caseId, size, place, undefined, 'y0');
    }
  }

  return parts;
}
