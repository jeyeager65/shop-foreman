/**
 * The torsion table (milestone 8): two skins glued to a grid of ribs. Every value is an input
 * (`TorsionTable`). A CNC's spoilboard is not part of it (not drawn or listed, for now).
 *
 * In the table's own plan, X runs along it from its left end and Z back from its front
 * edge. The ribs: a frame round the edge and, inside it, long ribs along X and short ribs
 * along Z about `spacing` apart, the cells all the same. The long ribs run its whole length
 * and the short ribs its whole width: on the CNC they slot together (an egg-crate).
 * A skin larger than its sheet is made of pieces whose joints land on a rib, the top skin's
 * a cell away from the bottom's so they do not line up.
 */
import { MDF_1_4_ID, MDF_ID, PLYWOOD_3_4_ID } from '@/libraries';
import type { LeafEdge, Material, Mm, Part, TorsionSettings, TorsionTable } from '@/model';
import { len } from '@/units';
import { withGrain } from './grain';
import { thicknessOf } from './style';

/** The "Light top": 1/4" MDF skins, 3/4" plywood ribs 3-1/2" tall about 6" apart; 2" over all round. Tune me. */
export function lightTopTable(): TorsionSettings {
  return {
    overhang: len('2"'),
    skins: { topId: MDF_1_4_ID, bottomId: MDF_1_4_ID },
    ribs: { materialId: PLYWOOD_3_4_ID, height: len('3-1/2"'), spacing: len('6"') },
  };
}

/** The "Bench top": 3/4" MDF skins on the same ribs. Tune me. */
export function benchTopTable(): TorsionSettings {
  return { overhang: len('2"'), skins: { topId: MDF_ID, bottomId: MDF_ID }, ribs: { materialId: PLYWOOD_3_4_ID, height: len('3-1/2"'), spacing: len('6"') } };
}

/**
 * The two starting points a torsion top is offered from: they only fill the box's
 * values in. `torsionStartOf`: which one a box still is, by its skins; neither once they are changed.
 */
export type TorsionStart = 'light' | 'bench';
export const TORSION_STARTS: { value: TorsionStart; title: string; note: string; make: () => TorsionSettings }[] = [
  { value: 'light', title: 'Light top', note: '1/4" skins: light, for a table that is not pounded on', make: lightTopTable },
  { value: 'bench', title: 'Bench top', note: '3/4" skins: takes a blow and a clamp', make: benchTopTable },
];
export function torsionStartOf(box: TorsionSettings): TorsionStart | '' {
  const same = (make: () => TorsionSettings) => make().skins.topId === box.skins.topId && make().skins.bottomId === box.skins.bottomId;
  return TORSION_STARTS.find((x) => same(x.make))?.value ?? '';
}

/** The materials a torsion box is made of: its two skins and its ribs. */
export function torsionMaterialIds(box: TorsionSettings): string[] {
  return [...new Set([box.skins.topId, box.skins.bottomId, box.ribs.materialId])];
}

/** What a torsion top does not take, said where it is chosen. */
export const TORSION_TAKES_NO = 'A torsion top takes no backsplash, no sink, no second layer and no banding, and two do not join at a corner: each stops there. Its edge is its outer ribs.';

/** Where the ribs stand across a span: each rib's near face, the first at 0 and the last at the far edge, the cells between them equal and about `spacing`. */
export function ribLines(span: Mm, thickness: Mm, spacing: Mm): Mm[] {
  const cells = Math.max(1, Math.round((span - thickness) / spacing));
  return Array.from({ length: cells + 1 }, (_, i) => ((span - thickness) * i) / cells);
}

/**
 * A skin in pieces along a span: where each piece starts and ends. A joint is on a rib's
 * middle; each piece is as long as the sheet allows. `offset`: the top skin's first joint
 * is a rib earlier, so its joints are a cell away from the bottom's.
 */
export function skinPieces(span: Mm, sheet: Mm, ribs: Mm[], thickness: Mm, offset = false): [Mm, Mm][] {
  if (span <= sheet + 0.5) return [[0, span]];
  const middles = ribs.map((r) => r + thickness / 2);
  const out: [Mm, Mm][] = [];
  let start = 0;
  let first = true;
  while (span - start > sheet + 0.5) {
    const fits = middles.filter((m) => m > start + 0.5 && m <= start + sheet + 0.5);
    if (!fits.length) break;
    let at = fits.length - 1;
    if (first && offset && at > 0) at -= 1;
    first = false;
    out.push([start, fits[at]!]);
    start = fits[at]!;
  }
  out.push([start, span]);
  return out;
}

/** How thick the table stands: its skins and its core. */
export function torsionThickness(table: TorsionSettings, materials: Material[]): Mm {
  return (
    thicknessOf(materials, table.skins.bottomId) +
    table.ribs.height.mm +
    thicknessOf(materials, table.skins.topId)
  );
}

/**
 * Why a box this size cannot be made of its ribs' material: a rib runs its whole length (and, slotted on
 * the CNC, its whole width), so neither may be longer than the sheet the ribs are cut from. A leaf's two boxes are
 * each measured on their own. Nothing when it can.
 */
export function torsionRibProblem(table: TorsionTable, length: Mm, width: Mm, materials: Material[], say: (mm: Mm) => string): string | undefined {
  const sheet = sheetOf(materials, table.ribs.materialId).long;
  // Each box's own length and width: a leaf at the back shortens the widths, one on an end the lengths.
  const { edge, leaf } = leafOf(table, length, width);
  const along = edge === 'back' ? length : Math.max(length - leaf, leaf);
  const across = table.ribsBy === 'saw' ? 0 : edge === 'back' ? Math.max(width - leaf, leaf) : width;
  const longest = Math.max(along, across);
  return longest > sheet + 0.5 ? `Its ribs run ${say(longest)}, longer than the ${say(sheet)} sheet they are cut from: make the top shorter, or give it a leaf, so that each box fits.` : undefined;
}

/** Each side of a slot's fit on the crossing rib: the slot is the rib's thickness and twice this. Tune me. */
export const SLOT_CLEARANCE: Mm = 0.1;

/**
 * A rib's outline with its slots, lying flat: X along it, Y up from its bottom edge. `from`
 * says which edge the slots are cut from: the long ribs' from the top, the short ribs' from
 * the bottom. A slot at an end runs out through it. Each slot is half the rib deep; the CNC
 * dog-bones its inside corners, so the crossing rib seats flush.
 */
export function slottedRib(length: Mm, height: Mm, slots: [Mm, Mm][], from: 'top' | 'bottom'): { x: Mm; y: Mm }[] {
  const depth = height / 2;
  const cuts = slots.map(([a, b]) => [Math.max(0, a), Math.min(length, b)] as [Mm, Mm]).filter(([a, b]) => b > a).sort((p, q) => q[0] - p[0]);
  // The slotted edge, from the right end to the left: its height, and in each slot the slot's floor.
  const edge = from === 'top' ? height : 0;
  const floor = from === 'top' ? height - depth : depth;
  const along: { x: Mm; y: Mm }[] = [];
  const atRight = cuts[0] && cuts[0][1] >= length - 1e-6;
  along.push({ x: length, y: atRight ? floor : edge });
  for (const [a, b] of cuts) {
    if (b < length - 1e-6) along.push({ x: b, y: edge }, { x: b, y: floor });
    along.push({ x: a, y: floor });
    if (a > 1e-6) along.push({ x: a, y: edge });
  }
  const atLeft = cuts.length && cuts.at(-1)![0] <= 1e-6;
  if (!atLeft) along.push({ x: 0, y: edge });
  const other = from === 'top' ? 0 : height;
  // Round the plain edge, then the slotted one back.
  const out = from === 'top' ? [{ x: 0, y: other }, { x: length, y: other }, ...along] : [{ x: 0, y: other }, ...along.reverse().map((p) => p), { x: length, y: other }];
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length]!;
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
  });
}

/** Gives a part a new outline in place of its rectangle, its inside corners dog-boned. */
function setOutline(part: Part, outline: { x: Mm; y: Mm }[]): void {
  const cut = part.features.find((f) => f.kind === 'cutout');
  if (cut?.kind === 'cutout') {
    cut.outline = outline;
    cut.dogBones = true;
  }
}

/** A sheet's longest and shortest side for a material: what a skin's pieces may be. Full 4' × 8' when it says nothing. */
function sheetOf(materials: Material[], id: string): { long: Mm; short: Mm } {
  const s = materials.find((m) => m.id === id)?.sheets?.[0];
  const [a, b] = s ? [s.x.mm, s.y.mm] : [len('48"').mm, len('96"').mm];
  return { long: Math.max(a, b), short: Math.min(a, b) };
}

/**
 * A torsion table's parts, `length` along and `width` back from its front edge, its
 * front-left corner at `origin` (on its underside) in its cabinet's frame: the bottom
 * skin, the ribs and the top skin. `id` is the start of each part's id;
 * the parts are `designObjectId`'s.
 */
export function deriveTorsionParts(table: TorsionTable, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materials: Material[]): Part[] {
  const turned = turnedFor(table, length, width, origin);
  if (turned) return backLeafParts(turned.table, turned.length, turned.width, [0, origin[1], 0], id, designObjectId, materials).map((p) => turned.part(p, true));
  return backLeafParts(table, length, width, origin, id, designObjectId, materials);
}

/** A leaf's edge and its length as it is made, or 0 when the table has none: across the joint the leaf and the part that stays must each be long enough. */
export function leafOf(table: TorsionTable, length: Mm, width: Mm): { edge: LeafEdge; leaf: Mm } {
  const edge = table.leaf?.edge ?? 'back';
  return { edge, leaf: leafLength(table, edge === 'back' ? width : length) };
}

/**
 * A leaf on an end is the leaf at the back, turned: the table is worked out in a frame of its own, a
 * quarter turn about the vertical, in which the leaf's end is the back, and each part is then set back in the
 * table's own frame. In that frame X runs along the table's width and Z back along its length. Nothing when the
 * leaf is at the back, or there is none.
 */
function turnedFor(table: TorsionTable, length: Mm, width: Mm, origin: [Mm, Mm, Mm]) {
  const { edge, leaf } = leafOf(table, length, width);
  if (edge === 'back' || !leaf) return undefined;
  return { table: { ...table, leaf: { ...table.leaf!, edge: 'back' as const } }, ...turnedFrame(edge, length, width, origin) };
}

/**
 * The frame a leaf on an end is worked out in: a quarter turn about the vertical from the top's
 * own, so that the leaf's end is the back. `length` and `width` are the top's own, its front-left corner at
 * `origin`; what is given back is its length and width in the turned frame, its origin there, and `part`, which
 * sets a part made in that frame back in the top's own: its place, how it moves, and (`rename`) a rib's name.
 */
export function turnedFrame(edge: 'left' | 'right', length: Mm, width: Mm, origin: [Mm, Mm, Mm]) {
  const [x0, y0, z0] = origin;
  const right = edge === 'right';
  /** A direction, and a point, of the turned frame in the top's own. */
  const dir = ([a, b, c]: [Mm, Mm, Mm]): [Mm, Mm, Mm] => (right ? [-c + 0, b, a] : [c, b, -a + 0]);
  const point = ([a, b, c]: [Mm, Mm, Mm]): [Mm, Mm, Mm] => (right ? [x0 - c, b, z0 - width + a] : [x0 + length + c, b, z0 - a]);
  const across: 1 | -1 = right ? 1 : -1;
  /** The ribs' names in the top's own frame: which end, and which way they run. */
  const NAMES: [RegExp, string][] = right
    ? [[/Rib, front/, 'Rib, left end'], [/Rib, back/, 'Rib, right end'], [/Rib, left end/, 'Rib, back'], [/Rib, right end/, 'Rib, front'], [/Long rib/, 'Short rib'], [/Short rib/, 'Long rib']]
    : [[/Rib, front/, 'Rib, right end'], [/Rib, back/, 'Rib, left end'], [/Rib, left end/, 'Rib, front'], [/Rib, right end/, 'Rib, back'], [/Long rib/, 'Short rib'], [/Short rib/, 'Long rib']];
  const named = (name: string) => {
    const found = NAMES.find(([from]) => from.test(name));
    return found ? name.replace(found[0], found[1]) : name;
  };
  /** A fold in the turned frame, about (y, z) with its legs about (x, y), as one in the top's own: about (x, y), its legs about (y, z). */
  const foldAcross = (m: Extract<NonNullable<Part['moves']>, { kind: 'fold' }>): NonNullable<Part['moves']> => ({
    kind: 'fold',
    axis: [point([0, m.axis[0], m.axis[1]])[0], m.axis[0]],
    across,
    // The legs' line ran from front to back in the turned frame: across the top in its own, the other way round on the right.
    ...(m.first ? { first: { at: [m.first.at[1], point([m.first.at[0], m.first.at[1], 0])[2]] as [Mm, Mm], sign: (right ? -m.first.sign : m.first.sign) as 1 | -1 } } : {}),
  });
  /** A bracket's upright line, in the top's own frame: a turn about the vertical keeps its sense. */
  const swing = (m: Extract<NonNullable<Part['moves']>, { kind: 'swingIn' }>): NonNullable<Part['moves']> => {
    const at = point([m.axis[0], 0, m.axis[1]]);
    return { kind: 'swingIn', axis: [at[0], at[2]], sign: m.sign };
  };
  const part = (p: Part, rename: boolean): Part => {
    const at = p.placement!;
    const moves = p.moves?.kind === 'fold' ? foldAcross(p.moves) : p.moves?.kind === 'swingIn' ? swing(p.moves) : p.moves;
    return { ...p, ...(rename ? { name: named(p.name) } : {}), placement: { origin: point(at.origin), xAxis: dir(at.xAxis), yAxis: dir(at.yAxis) }, ...(moves ? { moves } : {}) };
  };
  return { length: width, width: length, origin: [0, y0, 0] as [Mm, Mm, Mm], part };
}

function backLeafParts(table: TorsionTable, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materials: Material[]): Part[] {
  const leaf = leafLength(table, width);
  if (!leaf) return boxParts(table, length, width, origin, id, designObjectId, materials);
  // A folding leaf: two boxes, each whole, that meet at the joint. The fixed one's back rib and the leaf's front rib
  // carry the alignment pins.
  const [x0, y0, z0] = origin;
  return [
    ...boxParts(table, length, width - leaf, origin, id, designObjectId, materials, { pins: 'back' }),
    // The leaf swings down about the joint's lower edge, where its hinge is (for the picture only).
    ...boxParts(table, length, leaf, [x0, y0, z0 - (width - leaf)], `${id}-leaf`, designObjectId, materials, { pins: 'front', prefix: 'Leaf: ' }).map((p) => ({
      ...p,
      moves: { kind: 'fold' as const, axis: [y0, z0 - (width - leaf)] as [Mm, Mm] },
    })),
  ];
}

/**
 * A folding leaf's joint (tune me): brass table-leaf alignment pins, bullet-nosed so they find their sockets as
 * the leaf swings up, in holes the CNC drills at the same places in the two ribs that meet; how much of the floor
 * the hanging leaf must clear; the least either box may be.
 */
export const LEAF = {
  pin: { diameter: (5 / 16) * 25.4, fit: 0.1, count: 3 },
  floorClearance: 25,
  least: 150,
  /**
   * What the hinge is fastened into (the leaf is too heavy to hang on the hinge alone when down): a block of
   * the ribs' material in every cell along the joint, in both boxes, flat on the bottom skin against the joint rib,
   * this wide. The hinge's fasteners go through the skin into its face, not into a rib's edge. `gap`: how much
   * shorter than its cell a block is.
   */
  backer: { width: 2.5 * 25.4, gap: 1 },
  /**
   * Two feet the hanging leaf stands on, so the hinge carries nothing at rest: on threaded inserts in the outside
   * face of the leaf's far rib, in holes the CNC drills, in the second cell from each end, a quarter of the rib's
   * height up from the leaf's underside.
   */
  rest: { hole: 12.7, count: 2 },
};

/**
 * The leaf's length, or 0 when the table has none (or one too long or too short to make). `width`: the table's whole
 * size across the joint, with the leaf: its width for a leaf at the back, its length for one on an end.
 */
export function leafLength(table: TorsionTable, width: Mm): Mm {
  const leaf = table.leaf?.length.mm ?? 0;
  return leaf >= LEAF.least && width - leaf >= LEAF.least ? leaf : 0;
}

/** Why a leaf cannot fold as it is; empty when it can. `under`: the table's underside off the floor. */
export function leafProblems(table: TorsionTable, width: Mm, under: Mm, length: (mm: Mm) => string): string[] {
  if (!table.leaf) return [];
  const leaf = table.leaf.length.mm;
  if (leaf < LEAF.least || width - leaf < LEAF.least) return [`The leaf and the part that stays must each be at least ${length(LEAF.least)}: the table is made in one piece.`];
  const most = under - LEAF.floorClearance;
  return leaf > most ? [`The leaf is ${length(leaf)} long but the table's underside is ${length(under)} off the floor: folded down it would reach the floor. Make it ${length(most)} or less.`] : [];
}

/** Where the leaf's two rest feet are along its far rib: in the middle of the second cell from each end (the first, where there are too few). */
export function leafRestPlaces(length: Mm, thickness: Mm, spacing: Mm): Mm[] {
  const lines = ribLines(length, thickness, spacing);
  const cells = lines.length - 1;
  const which = cells >= 4 ? [1, cells - 2] : [...new Set([0, cells - 1])];
  return which.map((k) => (lines[k]! + thickness + lines[k + 1]!) / 2);
}

/** Where the alignment pins are along a joint rib: in the middle of the first, the middle and the last cell. */
export function leafPinPlaces(length: Mm, thickness: Mm, spacing: Mm): Mm[] {
  const lines = ribLines(length, thickness, spacing);
  const cells = lines.length - 1;
  const which = [...new Set([0, Math.floor(cells / 2), cells - 1])].slice(0, LEAF.pin.count);
  return which.map((k) => (lines[k]! + thickness + lines[k + 1]!) / 2);
}

function boxParts(table: TorsionTable, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materials: Material[], joint?: { pins: 'front' | 'back'; prefix?: string }): Part[] {
  const prefix = joint?.prefix ?? '';
  const t = thicknessOf(materials, table.ribs.materialId);
  const h = table.ribs.height.mm;
  const tb = thicknessOf(materials, table.skins.bottomId);
  const ts = thicknessOf(materials, table.skins.topId);
  const along = ribLines(length, t, table.ribs.spacing.mm);
  const across = ribLines(width, t, table.ribs.spacing.mm);
  const [x0, y0, z0] = origin;
  const rect = (w: Mm, hh: Mm) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: hh }, { x: 0, y: hh }];
  const parts: Part[] = [];
  const part = (key: string, name: string, materialId: string, size: Part['size'], placement: NonNullable<Part['placement']>, role: 'top' | 'rib'): Part =>
    withGrain({ id: `${id}${key}`, designObjectId, name: `${prefix}${name}`, materialId, size, features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(size.width, size.height) }], role, placement }, role, materials);
  /** A skin, in pieces when larger than its sheet, its face A up at `top`. */
  const skin = (key: string, name: string, materialId: string, thickness: Mm, top: Mm, offset: boolean) => {
    const sheet = sheetOf(materials, materialId);
    // Its long way along the table's long way.
    const [alongSheet, acrossSheet] = length >= width ? [sheet.long, sheet.short] : [sheet.short, sheet.long];
    const xs = skinPieces(length, alongSheet, along, t, offset);
    const zs = skinPieces(width, acrossSheet, across, t, offset);
    const several = xs.length * zs.length > 1;
    let n = 0;
    for (const [a, b] of xs) {
      for (const [c, d] of zs) {
        n++;
        parts.push(part(`-${key}-${n}`, several ? `${name} ${n}` : name, materialId, { width: b - a, height: d - c, thickness }, { origin: [x0 + a, top, z0 - c], xAxis: [1, 0, 0], yAxis: [0, 0, -1] }, 'top'));
      }
    }
  };
  skin('skin-bottom', 'Bottom skin', table.skins.bottomId, tb, y0 + tb, false);
  // The ribs on the bottom skin. On the CNC (an egg-crate) the long ones run the whole length slotted from the top and
  // the short ones the whole width slotted from the bottom, a slot at every crossing. Sawn, the long ones run the whole
  // length and the short ones are cut to fit between them, butted, glued and nailed.
  const ribY = y0 + tb;
  const cnc = table.ribsBy !== 'saw';
  const slots = (lines: Mm[]): [Mm, Mm][] => lines.map((l) => [l - SLOT_CLEARANCE, l + t + SLOT_CLEARANCE]);
  across.forEach((z, i) => {
    const name = i === 0 ? 'Rib, front' : i === across.length - 1 ? 'Rib, back' : `Long rib ${i}`;
    // Face A toward the front; it runs back from there by its thickness.
    const rib = part(`-rib-long-${i + 1}`, name, table.ribs.materialId, { width: length, height: h, thickness: t }, { origin: [x0, ribY, z0 - z], xAxis: [1, 0, 0], yAxis: [0, 1, 0] }, 'rib');
    if (cnc) setOutline(rib, slottedRib(length, h, slots(along), 'top'));
    // The rib at a leaf's joint: holes through it for the alignment pins, at the same places in both boxes.
    if (joint && i === (joint.pins === 'front' ? 0 : across.length - 1)) {
      leafPinPlaces(length, t, table.ribs.spacing.mm).forEach((x, n) =>
        rib.features.push({ id: `leaf-pin-${n + 1}`, kind: 'hole', face: 'A', center: { x, y: h / 2 }, diameter: LEAF.pin.diameter + LEAF.pin.fit, depth: t }),
      );
    }
    // The leaf's far rib: a hole for each rest foot's threaded insert.
    if (joint?.pins === 'front' && i === across.length - 1) {
      leafRestPlaces(length, t, table.ribs.spacing.mm).forEach((x, n) => rib.features.push({ id: `leaf-rest-${n + 1}`, kind: 'hole', face: 'A', center: { x, y: h / 4 }, diameter: LEAF.rest.hole, depth: t }));
    }
    parts.push(rib);
  });
  // At a leaf's joint: a backer block in every cell, flat on the bottom skin against the joint rib, for the hinge.
  if (joint) {
    const w = Math.min(LEAF.backer.width, (across[1] ?? width) - t - 1);
    // The fixed box's joint rib is its last, with the block in front of it; the leaf's is its first, the block behind it.
    const zFar = joint.pins === 'back' ? z0 - across.at(-1)! + w : z0 - t;
    along.slice(1).forEach((x1, k) => {
      const from = along[k]! + t + LEAF.backer.gap / 2;
      const long = x1 - along[k]! - t - LEAF.backer.gap;
      if (long > 10 && w > 10) parts.push(part(`-backer-${k + 1}`, `Hinge backer ${k + 1}`, table.ribs.materialId, { width: long, height: w, thickness: t }, { origin: [x0 + from, ribY + t, zFar], xAxis: [1, 0, 0], yAxis: [0, 0, -1] }, 'rib'));
    });
  }
  along.forEach((x, i) => {
    const name = i === 0 ? 'Rib, left end' : i === along.length - 1 ? 'Rib, right end' : `Short rib ${i}`;
    // Face A toward +X: it runs back toward −X by its thickness; along it, back from the front.
    if (cnc) {
      const rib = part(`-rib-short-${i + 1}`, name, table.ribs.materialId, { width: width, height: h, thickness: t }, { origin: [x0 + x + t, ribY, z0], xAxis: [0, 0, -1], yAxis: [0, 1, 0] }, 'rib');
      setOutline(rib, slottedRib(width, h, slots(across), 'bottom'));
      parts.push(rib);
      return;
    }
    // Sawn: a piece in each cell between two long ribs.
    across.slice(1).forEach((z, k) => {
      const from = across[k]! + t;
      parts.push(part(`-rib-short-${i + 1}-${k + 1}`, `${name}, piece ${k + 1}`, table.ribs.materialId, { width: z - from, height: h, thickness: t }, { origin: [x0 + x + t, ribY, z0 - from], xAxis: [0, 0, -1], yAxis: [0, 1, 0] }, 'rib'));
    });
  });
  skin('skin-top', 'Top skin', table.skins.topId, ts, y0 + tb + h + ts, true);
  return parts;
}

/** What is drawn of a leaf's hardware (tune me): the hinge's knuckle, the latches, the pins, the legs and their feet. */
export const LEAF_LOOK = { rest: { pad: 20, thick: 8, stud: 5 }, knuckle: 12, latch: { long: 60, wide: 24, thick: 10 }, pin: { long: 12 }, leg: { size: 38.1, inset: 50, fromEnd: 25, apart: 12 }, foot: { size: 50, height: 25 }, bracket: { size: 60, thick: 6 } };

/**
 * A leaf's hardware, for the picture only (drawn in metal, never cut, planned or listed as parts: `isApplianceShape`):
 * the hinge's knuckle under the joint, a draw latch in two halves across the joint on each long edge, the alignment
 * pins on the leaf's joint face, and under the leaf's far end two legs on folding brackets, each with a levelling
 * foot. What is on the leaf goes down with it; the legs fold in toward each other first, one a little behind the
 * other so they pass. `under`: the table's underside off the floor, which the legs reach.
 */
export function leafHardwareShapes(table: TorsionTable, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materials: Material[]): Part[] {
  // A leaf on an end: the same hardware, turned with the table.
  const turned = turnedFor(table, length, width, origin);
  if (turned) return backLeafShapes(turned.table, turned.length, turned.width, [0, origin[1], 0], id, designObjectId, materials).map((p) => turned.part(p, false));
  return backLeafShapes(table, length, width, origin, id, designObjectId, materials);
}

function backLeafShapes(table: TorsionTable, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materials: Material[]): Part[] {
  const leaf = leafLength(table, width);
  if (!leaf) return [];
  const [x0, y0, z0] = origin;
  const [zj, zb] = [z0 - (width - leaf), z0 - width];
  const thick = torsionThickness(table, materials);
  const t = thicknessOf(materials, table.ribs.materialId);
  const tb = thicknessOf(materials, table.skins.bottomId);
  const fold = { kind: 'fold' as const, axis: [y0, zj] as [Mm, Mm] };
  const L = LEAF_LOOK;
  const block = (key: string, name: string, min: [Mm, Mm, Mm], max: [Mm, Mm, Mm], moves?: Part['moves']): Part => {
    const size = { width: max[0] - min[0], height: max[1] - min[1], thickness: max[2] - min[2] };
    return {
      id: `${id}-appliance-leaf-${key}/shape`,
      designObjectId,
      name,
      materialId: table.ribs.materialId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: size.width, y: 0 }, { x: size.width, y: size.height }, { x: 0, y: size.height }] }],
      // (The table's own role: what stands under a top is not the cabinet's back, which is what says where it stands.)
      role: 'top',
      placement: { origin: [min[0], min[1], max[2]], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
      ...(moves ? { moves } : {}),
    };
  };
  const out: Part[] = [block('hinge', 'Hinge', [x0, y0 - L.knuckle, zj - L.knuckle / 2], [x0 + length, y0, zj + L.knuckle / 2])];
  // A draw latch on each long edge: its body on the part that stays, its catch on the leaf.
  const mid = y0 + thick / 2;
  for (const [side, xa, xb] of [['left', x0 - L.latch.thick, x0], ['right', x0 + length, x0 + length + L.latch.thick]] as const) {
    out.push(block(`latch-${side}`, 'Draw latch', [xa, mid - L.latch.wide / 2, zj + 4], [xb, mid + L.latch.wide / 2, zj + 4 + L.latch.long]));
    out.push(block(`catch-${side}`, 'Latch catch', [xa, mid - L.latch.wide / 2, zj - 4 - L.latch.long / 2], [xb, mid + L.latch.wide / 2, zj - 4], fold));
  }
  // The pins stand out of the leaf's joint face, into the sockets in the other.
  const r = LEAF.pin.diameter / 2;
  const pinY = y0 + tb + table.ribs.height.mm / 2;
  leafPinPlaces(length, t, table.ribs.spacing.mm).forEach((x, n) => out.push(block(`pin-${n + 1}`, 'Alignment pin', [x0 + x - r, pinY - r, zj], [x0 + x + r, pinY + r, zj + L.pin.long], fold)));
  // The legs: under the far end, in from each long edge; the right one stands a little nearer the joint, so the two pass when folded.
  const s = L.leg.size;
  const legs = [
    { key: 'left', x: x0 + L.leg.inset, z: zb + L.leg.fromEnd, sign: 1 as const },
    { key: 'right', x: x0 + length - L.leg.inset - s, z: zb + L.leg.fromEnd + s + L.leg.apart, sign: -1 as const },
  ];
  for (const leg of legs) {
    // Folded, the leg lies flat against the underside: it turns about a line half its own size below it.
    const moves = { ...fold, first: { at: [leg.x + s / 2, y0 - s / 2] as [Mm, Mm], sign: leg.sign } };
    out.push(block(`bracket-${leg.key}`, 'Folding leg bracket', [leg.x - (L.bracket.size - s) / 2, y0 - L.bracket.thick, leg.z - (L.bracket.size - s) / 2], [leg.x + (L.bracket.size + s) / 2, y0, leg.z + (L.bracket.size + s) / 2], fold));
    out.push(block(`leg-${leg.key}`, 'Leg', [leg.x, L.foot.height, leg.z], [leg.x + s, y0 - L.bracket.thick, leg.z + s], moves));
    out.push(block(`foot-${leg.key}`, 'Levelling foot', [leg.x - (L.foot.size - s) / 2, 0, leg.z - (L.foot.size - s) / 2], [leg.x + (L.foot.size + s) / 2, L.foot.height, leg.z + (L.foot.size + s) / 2], moves));
  }
  // The rest feet: out of the leaf's far rib, long enough to reach the floor when the leaf hangs.
  const reach = Math.max(L.rest.thick + 5, y0 - leaf);
  const restY = y0 + tb + table.ribs.height.mm / 4;
  leafRestPlaces(length, t, table.ribs.spacing.mm).forEach((x, n) => {
    out.push(block(`rest-stud-${n + 1}`, 'Rest foot stud', [x0 + x - L.rest.stud, restY - L.rest.stud, zb - reach + L.rest.thick], [x0 + x + L.rest.stud, restY + L.rest.stud, zb], fold));
    out.push(block(`rest-${n + 1}`, 'Rest foot', [x0 + x - L.rest.pad, restY - L.rest.pad, zb - reach], [x0 + x + L.rest.pad, restY + L.rest.pad, zb - reach + L.rest.thick], fold));
  });
  return out;
}
