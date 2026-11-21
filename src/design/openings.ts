/**
 * The openings a designed cabinet produces from its layout, and how they stand in
 * for measured openings so a door set hangs on either kind the same way.
 *
 * Face frame: the frame covers the case front, from the top of the toe kick to the
 * top of the case. Openings sit between the stiles, with a rail above, below and
 * between rows. Frameless: openings are the inside of the case, between the sides,
 * from the bottom up to the top stretchers, with nothing between rows.
 */
import type { CabinetDesign, CabinetOpening, Material, Mm, Opening, OpeningRow, Part, Project, Vec3 } from '@/model';
import { CORNER_POST, doorsOnSusan, lShapedFace, lShapedFace2 } from './lShaped';
import { SUSAN, susanDoorFit } from './susan';
import { cabinetsOf } from './settings';
import { frontWidth } from './diagonal';
import { constructionRules, thicknessOf } from './style';
import { bayDivider, bayOpeningId, baySpans, rowSplit, splitOpeningId } from './bays';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';
import { apronRowHeight, farmhouseRow } from './sinks';

/** Gap between the back of a closed door and what it closes against (bumpers). Tune me. */
export const DOOR_STANDOFF: Mm = 2;

/**
 * Rows stacked from `top` down to `bottom` with `divider` between them: rows with a
 * height take it, the others share what is left.
 */
function stackRows(rows: OpeningRow[], bottom: Mm, top: Mm, dividers: Mm[]): { row: OpeningRow; bottom: Mm; top: Mm }[] {
  const fixed = rows.reduce((sum, r) => sum + (r.height?.mm ?? 0), 0);
  const open = rows.filter((r) => !r.height).length;
  const left = top - bottom - fixed - dividers.reduce((sum, d) => sum + d, 0);
  if (left < 0 || (open > 0 && left <= 0)) throw new Error('The opening heights add up to more than the cabinet has room for.');
  const share = open > 0 ? left / open : 0;
  let y = top;
  return rows.map((row, i) => {
    const height = row.height?.mm ?? share;
    const span = { row, bottom: y - height, top: y };
    y -= height + (dividers[i] ?? 0);
    return span;
  });
}

/**
 * What stands at each side of the openings, from the case's outside edge: a stile or a
 * case side, or on a blind corner cabinet's blind side its blind width (milestone 6).
 */
export function openingSides(cabinet: CabinetDesign, openingSide: Mm, frame = false, face2 = false): { left: Mm; right: Mm } {
  // An L-shaped cabinet's faces end at the corner post at one end and at a side at the other.
  if (cabinet.corner?.kind === 'lShaped') {
    const cornerAtLeft = (cabinet.corner.side === 'left') !== face2;
    return cornerAtLeft ? { left: CORNER_POST, right: openingSide } : { left: openingSide, right: CORNER_POST };
  }
  // A diagonal cabinet's short sides meet its front at 45°: each takes √2 of its thickness off the front. A face frame's stiles are as wide as ever.
  if (cabinet.corner?.kind === 'diagonal') return frame ? { left: openingSide, right: openingSide } : { left: openingSide * Math.SQRT2, right: openingSide * Math.SQRT2 };
  const blind = cabinet.corner?.kind === 'blind' ? cabinet.corner : undefined;
  // The box behind a frame that overhangs it (`boxOf`) has that much less of each stile in front of it.
  const less = frame ? cabinet.boxInset : undefined;
  return {
    left: (blind?.side === 'left' ? Math.max(openingSide, blind.blind.mm) : openingSide) - (less?.left ?? 0),
    right: (blind?.side === 'right' ? Math.max(openingSide, blind.blind.mm) : openingSide) - (less?.right ?? 0),
  };
}

/** One opening per layout row, top to bottom. Derived; never stored. */
export function deriveCabinetOpenings(cabinet: CabinetDesign, materials: Material[]): CabinetOpening[] {
  const W = cabinet.corner?.kind === 'lShaped' ? lShapedFace(cabinet) : frontWidth(cabinet);
  const rules = constructionRules(cabinet, materials);

  // A blind corner moves the opening off its blind side; the overlays are the side's (`left` is that thickness).
  const sides = openingSides(cabinet, rules.openingSide, rules.hasFaceFrame);
  const left = rules.openingSide;
  const width = W - sides.left - sides.right;
  if (width <= 0 && cabinet.corner?.kind === 'blind') throw new Error(`The cabinet is too narrow for its blind corner: the blind takes ${formatLength(cabinet.corner.blind.mm, DEFAULT_UNIT_PREFERENCES.sizes)} of it. Make it wider, or the blind narrower.`);
  if (width <= 0) throw new Error(rules.hasFaceFrame ? 'The cabinet is too narrow for its two stiles.' : 'The cabinet is too narrow for its two sides.');
  // Between two rows: a rail, or nothing. Between two door rows stands a fixed shelf,
  // so there the rows are at least its thickness apart.
  // A farmhouse sink's apron takes the top row of drawer over doors: that row is as tall as the apron reaches down
  // from the case's top, its bottom where the sink stands (`apronRowHeight`).
  const apron = farmhouseRow(cabinet) ? apronRowHeight(cabinet, rules.openingsTop) : undefined;
  const rows = apron === undefined ? cabinet.layout.rows : cabinet.layout.rows.map((r, i) => (i === 0 ? { ...r, height: { mm: apron, unit: 'in' as const } } : r));
  const shelf = thicknessOf(materials, cabinet.materials.caseId);
  // In a case that is already there the rail under each drawer opening is measured.
  const measured = rules.hasFaceFrame ? cabinet.existing?.drawers : undefined;
  const dividers = rows.slice(1).map((row, i) => measured?.[i]?.rail.mm ?? (row.use === 'doors' && rows[i]!.use === 'doors' ? Math.max(rules.divider, shelf) : rules.divider));
  const spans = stackRows(rows, rules.openingsBottom, rules.openingsTop, dividers);
  const full = rules.fullOverlay;
  if (full && left - full.reveal <= 0) throw new Error('The reveal is wider than the case sides are thick.');

  const inset = rules.inset;
  // An open row (a door row with its doors off) is named and counted apart from the door rows.
  const kindOf = (row: OpeningRow) => (row.use === 'drawer' ? 'drawer' : row.open ? 'open' : 'doors');
  const count = (kind: ReturnType<typeof kindOf>) => cabinet.layout.rows.filter((r) => kindOf(r) === kind).length;
  const seen = { drawer: 0, doors: 0, open: 0 };
  // Bays side by side (milestone 10): each row once in every bay, a partition or a mullion between.
  const bays = baySpans(cabinet, materials, sides.left, width);
  const several = bays.length > 1;
  const half = several ? bayDivider(cabinet, materials) / 2 : 0;
  const openings: CabinetOpening[] = spans.flatMap(({ row, bottom, top }, i) => {
    const n = ++seen[kindOf(row)];
    // Full overlay: the outer fronts run to the reveal; neighbours share the gap between them,
    // beside each other at a partition as above each other.
    const fullOverlay = full && {
      side: left - full.reveal,
      top: i === 0 ? full.top - top : -(full.gap - dividers[i - 1]!) / 2,
      bottom: i === spans.length - 1 ? bottom - full.bottom : -(full.gap - dividers[i]!) / 2,
    };
    // Inset: the gap to the case at the outer edges; neighbours share one gap between them.
    const insetOverlay = inset && {
      side: -inset.gap,
      // Above and below a fixed shelf each front has the whole gap to it, like the case's top and bottom.
      top: i === 0 || dividers[i - 1]! > 0 ? -inset.gap : -inset.gap / 2,
      bottom: i === spans.length - 1 || dividers[i]! > 0 ? -inset.gap : -inset.gap / 2,
    };
    // Between corner posts: the gap to the posts and the rails all round.
    const frameOverlay = rules.inFrame && { side: -rules.inFrame.gap, top: -rules.inFrame.gap, bottom: -rules.inFrame.gap };
    const fixedOverlay = fullOverlay || insetOverlay || frameOverlay;
    const base = row.use === 'drawer' ? 'Drawer opening' : row.open ? 'Open shelves' : 'Door opening';
    const name = count(kindOf(row)) > 1 ? `${base} ${n}` : base;
    const parts = rowSplit(cabinet, row);
    const between = bayDivider(cabinet, materials);
    return bays.flatMap((bay, b): CabinetOpening[] => {
      // At a partition a full-overlay front covers half of it, less half the gap; an inset one keeps the whole gap to it.
      const atPartition = fullOverlay ? half - full.gap / 2 : undefined;
      const edges = several && fullOverlay ? { left: b === 0 ? fullOverlay.side : atPartition!, right: b === bays.length - 1 ? fullOverlay.side : atPartition! } : {};
      const whole: CabinetOpening = {
        id: bayOpeningId(cabinet.id, row.id, b + 1),
        cabinetId: cabinet.id,
        rowId: row.id,
        // A bay may be open where the others have doors.
        name: row.use === 'doors' && !row.open && cabinet.layout.bays?.[b]?.open ? `Open shelves, bay ${b + 1}` : several ? `${name}, bay ${b + 1}` : name,
        use: row.use,
        ...(row.use === 'doors' && (row.open || cabinet.layout.bays?.[b]?.open) ? { open: true } : {}),
        construction: cabinet.construction,
        width: bay.width,
        height: top - bottom,
        origin: { x: bay.x, y: bottom },
        frameThickness: rules.mountThickness,
        frontPlane: rules.frontPlane,
        ...(fixedOverlay ? { fixedOverlay: { ...fixedOverlay, ...edges } } : {}),
        ...(inset ? { inset: { gap: inset.gap, frontMaterialId: cabinet.materials.caseId } } : {}),
        ...(rules.inFrame ? { inFrame: true as const } : {}),
        ...(i === 0 && row.use === 'drawer' && parts === 1 && rows[1]?.use === 'doors' && !cabinet.existing ? { overDoors: true as const, ...(apron !== undefined ? { apron: true as const } : {}) } : {}),
        ...(several ? { bay: b + 1 } : {}),
      };
      if (parts === 1) return [whole];
      // A split row: that many openings side by side, a short mullion between two.
      const width = (bay.width - (parts - 1) * between) / parts;
      if (width <= 0) throw new Error('The row is too narrow to split: make the cabinet wider, or split it into fewer.');
      return Array.from({ length: parts }, (_, k) => ({
        ...whole,
        id: splitOpeningId(whole.id, k + 1),
        name: `${whole.name}, ${parts === 2 ? (k === 0 ? 'left' : 'right') : k + 1}`,
        width,
        origin: { ...whole.origin, x: bay.x + k * (width + between) },
        part: { n: k + 1, of: parts, x: bay.x, width: bay.width },
      }));
    });
  });
  // An L-shaped cabinet's second face: the same rows on the face square to the first.
  if (cabinet.corner?.kind !== 'lShaped') return openings;
  const two = openingSides(cabinet, rules.openingSide, false, true);
  const faces = [
    ...openings,
    ...openings.map((o) => ({ ...o, id: `${o.id}-2`, rowId: `${o.rowId}-2`, name: `${o.name}, other face`, width: W - two.left - two.right, origin: { ...o.origin, x: two.left }, frame: lShapedFace2(cabinet) })),
  ];
  if (!doorsOnSusan(cabinet)) return faces;
  // Doors fixed to a lazy susan: inside the opening, flush with the case front, a gap under and over them; at the
  // corner they run to it (no post), at the other end they stop short of the side, to pass it as they turn.
  const fit = susanDoorFit(cabinet, materials);
  return faces.map((o, i) => {
    const cornerAtLeft = (cabinet.corner?.side === 'left') !== i >= openings.length;
    const [corner, outer] = [CORNER_POST - SUSAN.doorGap, -fit.short];
    return { ...o, flush: true, fixedOverlay: { side: outer, top: -2 * SUSAN.doorGap, bottom: -2 * SUSAN.doorGap, left: cornerAtLeft ? corner : outer, right: cornerAtLeft ? outer : corner } };
  });
}

/**
 * The openings with every split row's parts put back together: one opening a row and a bay, as wide as the bay,
 * for what goes by rows and bays (the rails, the mullions and partitions between bays, the shelves).
 */
export function wholeOpenings(openings: CabinetOpening[]): CabinetOpening[] {
  return openings.filter((o) => !o.part || o.part.n === 1).map((o) => (o.part ? { ...o, width: o.part.width, origin: { ...o.origin, x: o.part.x } } : o));
}

/** A cabinet's opening as the door rules see it. `existingDoors`: the doors measured on a cabinet that is already there. */
export function asOpening(o: CabinetOpening, existingDoors?: Opening['existingDoors']): Opening {
  const length = (mm: Mm) => ({ mm, unit: 'mm' as const });
  return { id: o.id, name: o.name, cabinetType: o.construction, width: length(o.width), height: length(o.height), frameThickness: length(o.frameThickness), ...(existingDoors ? { existingDoors } : {}) };
}

/** The openings of every designed cabinet in the project. */
export function cabinetOpeningsOf(project: Project, materials: Material[]): CabinetOpening[] {
  return cabinetsOf(project).flatMap((c) => deriveCabinetOpenings(c, materials));
}

/**
 * Puts the fronts on an opening (a door set's doors, a drawer's front) in the
 * cabinet: centred across the opening, hanging the bottom overlay below it, closed
 * against the face frame (or the case front), or inside the opening when inset.
 */
export function placeFronts(parts: Part[], opening: CabinetOpening, overlayBottom: Mm, gap: Mm): Part[] {
  const across = parts.reduce((sum, p) => sum + p.size.width, 0) + gap * (parts.length - 1);
  // Overlays that differ side to side (a bay beside a partition): the fronts move toward the larger one.
  const o = opening.fixedOverlay;
  const shift = o?.left !== undefined && o.right !== undefined ? (o.right - o.left) / 2 : 0;
  let x = opening.origin.x + (opening.width - across) / 2 + shift;
  // An opening on a face of its own: its x runs across that face, its z out of it.
  const f = opening.frame;
  const out: Vec3 = f ? [-f.xAxis[2], 0, f.xAxis[0]] : [0, 0, 1];
  const at = (u: Mm, y: Mm, z: Mm): Vec3 => (f ? [f.origin[0] + u * f.xAxis[0] + z * out[0], y, f.origin[2] + u * f.xAxis[2] + z * out[2]] : [u, y, z]);
  return parts.map((part) => {
    // Face A is the front's show face; the thickness runs back toward the cabinet.
    // An inset front's face is flush with the case front.
    // Between corner posts it is flush with the frame's face.
    const face = opening.inFrame ? opening.frontPlane : opening.inset || opening.flush ? 0 : opening.frontPlane + DOOR_STANDOFF + part.size.thickness;
    const placed: Part = {
      ...part,
      placement: { origin: at(x, opening.origin.y - overlayBottom, face), xAxis: f ? f.xAxis : [1, 0, 0], yAxis: [0, 1, 0] },
    };
    x += part.size.width + gap;
    return placed;
  });
}
