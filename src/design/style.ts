/**
 * The construction-style layer: the one place that knows what face frame, frameless
 * and shop (a frameless case with inset fronts) mean. It answers whether there is a face frame, what the openings are
 * cut out of, what the fronts close against, how they overlay, where hinges mount,
 * and which edges are banded. The case, the openings and the fronts ask it; nothing
 * else branches on the style.
 */
import type { CabinetDesign, CabinetOpening, DesignObject, FramelessDesign, Length, Material, Mm, Part, ShopStyleDesign } from '@/model';
import { MM_PER_INCH, len } from '@/units';

/** Thickness of the edge banding. Tune me. */
export const EDGE_BAND_THICKNESS: Mm = 0.5;

export function thicknessOf(materials: Material[], id: string): Mm {
  const material = materials.find((m) => m.id === id);
  if (!material) throw new Error(`Material not found: ${id}`);
  return material.measuredThickness.mm;
}

/** The frameless choices a cabinet starts with. Tune me. */
export function createFramelessDefaults(): FramelessDesign {
  return { reveal: len('1/16"'), frontGap: len('1/8"'), edgeBanding: false };
}

/** The cabinet's toe kick as the case is cut: nothing when it has a flat bottom. */
export function toeKickOf(cabinet: CabinetDesign): { height: Mm; depth: Mm } {
  // A wall cabinet has none, whatever the project's cabinets on the floor have.
  // A plinth is a toe kick with no toe space: its board is flush with the case front.
  return cabinet.toeKick.off || cabinet.form === 'wall' ? { height: 0, depth: 0 } : { height: cabinet.toeKick.height.mm, depth: cabinet.toeKick.plinth ? 0 : cabinet.toeKick.depth.mm };
}

/**
 * Where a cabinet's toe kick board stands: between its sides, in front of them as its own board, or as part
 * of one board across its run (`toeKick.board`). A cabinet in no run that asks for the run's board gets its
 * own; a diagonal or an L-shaped corner cabinet stands on its own sleepers and has none of these.
 */
/** A case with corner posts: how far its sides stand in from the posts' outside faces. Tune me. */
export const POST_SETBACK: Mm = MM_PER_INCH / 4;

/**
 * A case whose corners are posts of square stock (`toeKick.legs.posts`): the posts' thickness, how far they reach
 * under the case, how thick the rails between the front ones are (the frame's material: `rail`, what a rail between
 * two rows shows, lying flat), how wide the top and the bottom rails are, which stand upright (`edge`), and the gap
 * round its inset fronts (the shop style's). Nothing for a wall cabinet, a corner cabinet, a case that is already
 * there, or while the posts' stock is not among the materials.
 */
export function postsOf(cabinet: CabinetDesign, materials: Material[]): { leg: Mm; under: Mm; rail: Mm; edge: Mm; gap: Mm; materialId: string } | undefined {
  const legs = cabinet.toeKick.legs;
  if (!legs?.posts || cabinet.form === 'wall' || cabinet.existing || cabinet.corner) return undefined;
  const stock = materials.find((m) => m.id === legs.materialId);
  if (!stock) return undefined;
  return { leg: stock.measuredThickness.mm, under: legs.height.mm, rail: thicknessOf(materials, cabinet.faceFrame.materialId), edge: cabinet.faceFrame.railWidth.mm, gap: cabinet.shop.gap.mm, materialId: legs.materialId };
}

/**
 * How far a face frame stands past the outside of each side of its box: the cabinet's own where it has one, else
 * the frame's. Never more than leaves the side behind its stile; nothing without a face frame, on a case that is
 * already there (it is measured as it is), or on the copy that stands for the box itself.
 */
export function frameOverhangOf(cabinet: CabinetDesign, materials: Material[]): { left: Mm; right: Mm } {
  // Between corner posts the sides stand in from the posts' faces.
  if (!cabinet.boxInset && postsOf(cabinet, materials)) return { left: POST_SETBACK, right: POST_SETBACK };
  if (cabinet.construction !== 'faceFrame' || cabinet.existing || cabinet.boxInset || cabinet.corner?.kind === 'diagonal' || cabinet.corner?.kind === 'lShaped') return { left: 0, right: 0 };
  const most = Math.max(0, cabinet.faceFrame.stileWidth.mm - thicknessOf(materials, cabinet.materials.caseId));
  const of = (own: Length | undefined) => Math.min(most, Math.max(0, own?.mm ?? cabinet.faceFrame.overhang?.mm ?? 0));
  return { left: of(cabinet.frameOverhang?.left), right: of(cabinet.frameOverhang?.right) };
}

/**
 * The cabinet's box, as a cabinet of its own: the same cabinet, narrower by the frame's two overhangs and with
 * that much less stile in front of each side (`boxInset`, which the openings take off), so everything derived
 * from it (the case, the shelves, the slides' strips, the trays) is as it would be behind a flush frame. `shift`:
 * where that box stands in the cabinet, from its left edge. With no overhang, the cabinet itself.
 */
export function boxOf(cabinet: CabinetDesign, materials: Material[]): { box: CabinetDesign; shift: Mm } {
  const { left, right } = frameOverhangOf(cabinet, materials);
  if (left === 0 && right === 0) return { box: cabinet, shift: 0 };
  // Between corner posts the box also stops at the front faces of the back posts.
  const posts = cabinet.boxInset ? undefined : postsOf(cabinet, materials);
  const depth = { ...cabinet.size.depth, mm: cabinet.size.depth.mm - (posts?.leg ?? 0) };
  // (A resolved cabinet is a view over the project: its copy is a plain cabinet. What is not enumerable goes with it by hand.)
  // (Between posts the back is not the box's: it stands between the back posts, on the box's own back members: `postsBack`.)
  const box = { ...cabinet, size: { ...cabinet.size, width: { ...cabinet.size.width, mm: cabinet.size.width.mm - left - right }, depth }, boxInset: { left, right }, ...(posts ? { noBack: true } : {}) } as CabinetDesign;
  Object.defineProperty(box, 'overrides', { enumerable: false, value: cabinet.overrides });
  return { box, shift: left };
}

/** Parts moved `by` across the cabinet: a box's parts to where the box stands behind its frame. */
export function shiftedParts<T extends { placement?: Part['placement'] }>(parts: T[], by: Mm): T[] {
  if (by === 0) return parts;
  return parts.map((part) => (part.placement ? { ...part, placement: { ...part.placement, origin: [part.placement.origin[0] + by, part.placement.origin[1], part.placement.origin[2]] } } : part));
}

export function kickBoardOf(cabinet: CabinetDesign): 'none' | 'between' | 'inFront' | 'acrossRun' {
  if (toeKickOf(cabinet).height <= 0 || cabinet.corner?.kind === 'diagonal' || cabinet.corner?.kind === 'lShaped') return 'none';
  const board = cabinet.toeKick.board;
  if (!board) return 'between';
  return board === 'acrossRun' && cabinet.runId ? 'acrossRun' : 'inFront';
}

/** The shop-style choices a cabinet starts with. Tune me. */
export function createShopDefaults(): ShopStyleDesign {
  return { gap: len('1/8"') };
}

export interface ConstructionRules {
  hasFaceFrame: boolean;
  /** What stands at each side of the openings: a stile's width, or a case side's thickness. */
  openingSide: Mm;
  /** Height off the floor of the lowest opening's bottom edge and the highest opening's top edge. */
  openingsBottom: Mm;
  openingsTop: Mm;
  /** Between two rows of openings: a rail's width, or nothing. */
  divider: Mm;
  /** The plane the fronts close against, measured forward from the case front. */
  frontPlane: Mm;
  /** Where hinges mount: on the edge of the face frame, or on a plate on the case side. */
  hingeMount: 'frameEdge' | 'sidePlate';
  /** Thickness of what the hinges mount on: the frame, or the case side. */
  mountThickness: Mm;
  /** How far the cabinet bottom is raised above the toe kick, so there is no lip behind a bottom rail. */
  bottomLift: Mm;
  /**
   * Full overlay: the fronts cover the case front less a reveal at its outside edges
   * and a gap between fronts above each other, so their overlays are derived. Null
   * when each front carries its own overlays (face frame).
   */
  fullOverlay: { reveal: Mm; gap: Mm; top: Mm; bottom: Mm } | null;
  /**
   * Inset: the fronts sit inside their openings, flush with the case front, with this
   * gap all round and one gap between two fronts above each other. Null otherwise.
   */
  inset: { gap: Mm } | null;
  /** Between corner posts: the fronts sit inside their openings, flush with the frame's face, with this gap all round. */
  inFrame?: { gap: Mm };
  /**
   * Banding on the front edges of the sides, bottom, front stretcher and shelves:
   * its thickness, which those parts are cut smaller by. 0 when the edges are bare.
   */
  frontEdgeBand: Mm;
  /** The band is a solid wood strip, a part of its own (`edgeStripParts`), not banding. */
  frontEdgeStrip?: true;
}

export function constructionRules(cabinet: CabinetDesign, materials: Material[]): ConstructionRules {
  const H = cabinet.size.height.mm;
  const kickH = toeKickOf(cabinet).height;
  const t = thicknessOf(materials, cabinet.materials.caseId);

  const posts = postsOf(cabinet, materials);
  if (posts) {
    // The posts are the stiles and as thick as the frame is deep. The top and the bottom rails stand upright, flush
    // with the posts' faces; a rail between two rows lies flat, so it shows its thickness.
    return {
      hasFaceFrame: true,
      openingSide: posts.leg,
      openingsBottom: kickH + posts.edge,
      openingsTop: H - posts.edge,
      divider: posts.rail,
      frontPlane: posts.leg,
      hingeMount: 'frameEdge',
      mountThickness: posts.leg,
      // The bottom is on the floor line of the case, the bottom rail standing above it as a lip, as under any flat-bottomed face frame.
      bottomLift: 0,
      fullOverlay: null,
      inset: null,
      inFrame: { gap: posts.gap },
      frontEdgeBand: 0,
    };
  }

  if (cabinet.construction === 'faceFrame') {
    const rail = cabinet.faceFrame.railWidth.mm;
    const frame = thicknessOf(materials, cabinet.faceFrame.materialId);
    return {
      hasFaceFrame: true,
      openingSide: cabinet.faceFrame.stileWidth.mm,
      // The frame covers the case front from the top of the toe kick to the top of the case.
      openingsBottom: kickH + rail,
      openingsTop: H - rail,
      divider: rail,
      frontPlane: frame,
      hingeMount: 'frameEdge',
      mountThickness: frame,
      // A flat bottom sits on the floor line: nothing is under it to lift it, and the bottom rail stands above it as a lip.
      // A wall cabinet's bottom is raised like one over a toe kick, level with the top of the bottom rail.
      bottomLift: cabinet.toeKick.off && cabinet.form !== 'wall' ? 0 : Math.max(0, rail - t),
      fullOverlay: null,
      inset: null,
      frontEdgeBand: 0,
    };
  }

  if (cabinet.construction === 'shop') {
    // The frameless case, with its fronts inside it; its edges bare, banded or under a solid wood strip.
    return {
      hasFaceFrame: false,
      openingSide: t,
      openingsBottom: kickH + t,
      openingsTop: H - t,
      divider: 0,
      frontPlane: 0,
      hingeMount: 'sidePlate',
      mountThickness: t,
      bottomLift: 0,
      fullOverlay: null,
      inset: { gap: cabinet.shop.gap.mm },
      ...frontEdgeOf(cabinet.shop),
    };
  }

  const f = cabinet.frameless;
  return {
    hasFaceFrame: false,
    openingSide: t,
    // The inside of the case: from the top of the bottom to the underside of the stretchers.
    openingsBottom: kickH + t,
    openingsTop: H - t,
    divider: 0,
    frontPlane: 0,
    hingeMount: 'sidePlate',
    mountThickness: t,
    bottomLift: 0,
    // The fronts run from the underside of the bottom to the top of the case, less the reveal.
    fullOverlay: { reveal: f.reveal.mm, gap: f.frontGap.mm, top: H - f.reveal.mm, bottom: kickH + f.reveal.mm },
    inset: null,
    ...frontEdgeOf(f),
  };
}

/** What covers the front edges of a case with no face frame (frameless, inset): a strip, banding or nothing. */
function frontEdgeOf(style: { edgeBanding?: boolean; edgeStrip?: Length }): Pick<ConstructionRules, 'frontEdgeBand' | 'frontEdgeStrip'> {
  return {
    frontEdgeBand: style.edgeStrip ? style.edgeStrip.mm : style.edgeBanding ? EDGE_BAND_THICKNESS : 0,
    ...(style.edgeStrip ? { frontEdgeStrip: true as const } : {}),
  };
}

/**
 * The design as it hangs on its opening. Where the style fixes the overlays
 * (frameless, shop), they replace the design's own, which are kept in the project
 * for the face frame. Inset in a shop-style cabinet, a door set is also its shop
 * doors: slab, square-edged, from the case material, until it is given its own.
 * Otherwise the design is returned as it is.
 */
export function hang<T extends DesignObject>(design: T, opening?: CabinetOpening): T {
  const o = opening?.fixedOverlay;
  if (!o) return design;
  const mm = (v: Mm): Length => ({ mm: v, unit: 'mm' });
  // Overlays that differ side to side (beside a partition, milestone 10): the fronts are sized on
  // their mean, and `placeFronts` moves them toward the larger.
  const side = o.left !== undefined && o.right !== undefined ? (o.left + o.right) / 2 : o.side;
  const mounting = { ...design.mounting, overlaySide: mm(side), overlayTop: mm(o.top), overlayBottom: mm(o.bottom) };
  if (opening.inset && design.template === 'doorSet') {
    const doors = design.shop ?? shopDoorDefaults(opening.inset.frontMaterialId);
    return { ...design, ...doors, mounting: { ...mounting, type: 'inset' } };
  }
  return { ...design, mounting };
}

/** The doors a shop-style cabinet starts with: slab, square edges, the case material. */
export function shopDoorDefaults(materialId: string): { style: { kind: 'slab' }; outsideEdge: { kind: 'square' }; materialId: string } {
  return { style: { kind: 'slab' }, outsideEdge: { kind: 'square' }, materialId };
}
