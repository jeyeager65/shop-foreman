/**
 * A table: the parts of a frame piece. Four legs of square stock, four aprons between them
 * set in from the legs' faces, and a top laid over all.
 *
 * In the piece's own frame, as a cabinet's: X to the right across its front, Y up from the floor, Z toward the
 * front, with the front edge of its top at Z 0 and its back edge at -depth. Its size is the whole of it: the top
 * is `width` long and `depth` wide and its surface is `height` off the floor. The legs stand in from the top's
 * edges by its overhangs.
 *
 * Nothing is cut in a leg: the aprons are pocket-screwed into the legs from their inside faces (or, with bought
 * corner braces, bolted), and the top is held down by figure-8 fasteners on the aprons, so a solid top can move.
 * The legs are cut to length on the miter saw, never on the CNC.
 */
import { SOLID_WOOD_3_4_ID } from '@/libraries';
import type { CabinetDesign, DesignedCabinetContext, Feature, Id, LeafEdge, Material, Mm, OwnTop, Part, StoredFrame } from '@/model';
import { INCH_DISPLAY, MM_PER_INCH, formatLength, len } from '@/units';
import { bayCount, bayDivider } from './bays';
import { deriveCabinetOpenings, wholeOpenings } from './openings';
import { withGrain } from './grain';
import { pocketRow, railEndPositions } from './pocketHoles';
import { EDGE_BAND_THICKNESS, postsOf, thicknessOf } from './style';
import { ownTopThickness, starterOwnTop, topSettingsOf, torsionSettingsOf } from './tops';
import { DROP_LEAF, dropLeafShapes } from './dropLeaf';
import { LEAF, deriveTorsionParts, leafHardwareShapes } from './torsion';

type Vec = [Mm, Mm, Mm];
const RIGHT: Vec = [1, 0, 0];
const LEFT: Vec = [-1, 0, 0];
const UP: Vec = [0, 1, 0];
const FRONT: Vec = [0, 0, 1];
const BACK: Vec = [0, 0, -1];
const rect = (w: Mm, h: Mm) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** Dowels at a table's apron-to-leg joints: so many a joint, this size, and where the first is below the top. Tune me. */
export const FRAME_DOWELS = { perJoint: 2, diameter: (3 / 8) * MM_PER_INCH, length: 1.5 * MM_PER_INCH, fromTop: MM_PER_INCH };
/** The dowel jig's sizes for a table as it stands: what to type on the jigs page, in mm. */
export function frameDowelJig(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>, materials: Material[]): { diameter: Mm; thickness: Mm; setback: Mm; fromTop: Mm; spacing: Mm; dowels: number } {
  const f = frameLayout(frame, context, materials);
  return { diameter: FRAME_DOWELS.diameter, thickness: f.apron, setback: f.setback, fromTop: FRAME_DOWELS.fromTop, spacing: Math.max(FRAME_DOWELS.diameter + 6, f.apronHeight - 2 * FRAME_DOWELS.fromTop), dowels: FRAME_DOWELS.perJoint };
}

/** The shortest an apron may be between two legs, for its pocket screws and a hand between them. Tune me. */
export const MIN_APRON: Mm = 2 * MM_PER_INCH;
/** A figure-8 fastener on each apron for about this much of its length, at least two on the long ones. Tune me. */
export const FASTENER_SPACING: Mm = 16 * MM_PER_INCH;

/**
 * A table's top as it is made. Its own where it says so (a torsion box of its own, or `slab`); else as Setup's
 * tops: a torsion box of Setup's values where Setup's tops are torsion boxes, and a slab of Setup's top
 * material otherwise (bought and measured countertops are not a table's).
 */
export function frameTop(frame: Pick<StoredFrame, 'top'>, context: Pick<DesignedCabinetContext, 'tops'>): OwnTop {
  const top = frame.top;
  if (top.torsion || top.slab) return top;
  const settings = topSettingsOf(context);
  return settings.kind === 'torsion' ? { ...top, torsion: torsionSettingsOf(settings) } : top;
}
/** Whether a table's top is made as Setup says: it has said nothing of its own. */
export const frameTopFollows = (frame: Pick<StoredFrame, 'top'>): boolean => !frame.top.torsion && !frame.top.slab;
/** The table with its top as it is made: what the functions below work from. */
const asMade = (frame: StoredFrame, context: Pick<DesignedCabinetContext, 'tops'>): StoredFrame => {
  const top = frameTop(frame, context);
  return top === frame.top ? frame : { ...frame, top };
};

/** What a table's parts are made of: its own where it says, else the project's style (the case material, Setup's top material). */
export function frameMaterials(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>): { legId: Id; apronId: Id; topId: Id; shelfId: Id } {
  frame = asMade(frame, context);
  const apronId = frame.aprons.materialId ?? context.settings.materials.caseId;
  return { legId: frame.legs.materialId, apronId, topId: frame.top.torsion?.skins.topId ?? frame.top.materialId ?? topSettingsOf(context).materialId, shelfId: frame.shelf?.materialId ?? apronId };
}

/** The room left round a leg in a shelf's notch, each way. Tune me. */
export const SHELF_NOTCH_CLEARANCE: Mm = 0.5;

/** A table to start from: a size, legs of a square stock, 4" aprons set 1/4" in, a top 1" over the legs all round. Tune me. */
export function createFrame(id: Id, name: string, size: { width: string; height: string; depth: string }, legMaterialId: Id): StoredFrame {
  return {
    kind: 'frame',
    id,
    name,
    quantity: 1,
    size: { width: len(size.width), height: len(size.height), depth: len(size.depth) },
    legs: { materialId: legMaterialId },
    aprons: { height: len('4"'), setback: len('1/4"') },
    top: { ...starterOwnTop(), overhang: { front: len('1"'), ends: len('1"'), back: len('1"') } },
  };
}

/** The sizes a table's parts are worked out from, in mm: where its legs stand and what is between them. */
export function frameLayout(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>, materials: Material[]) {
  frame = asMade(frame, context);
  const ids = frameMaterials(frame, context);
  const [W, H, D] = [frame.size.width.mm, frame.size.height.mm, frame.size.depth.mm];
  // A leg is as wide as its stock is thick: square stock, or so many layers of a sheet or a board glued up.
  const legStock = materials.find((m) => m.id === ids.legId);
  const layers = frame.legs.layers;
  if (!layers && legStock && legStock.section !== 'square') throw new Error('The legs want square stock, or to be glued up from layers of a sheet or a board: choose one on Legs.');
  const leg = thicknessOf(materials, ids.legId) * (layers ?? 1);
  const apron = thicknessOf(materials, ids.apronId);
  // The top: a slab, or a torsion box, which is much thicker.
  const top = ownTopThickness(frame.top, topSettingsOf(context), materials);
  const over = { front: frame.top.overhang.front.mm, ends: frame.top.overhang.ends.mm, back: frame.top.overhang.back.mm };
  const legHeight = H - top;
  /** Between the legs: along the front and the back, and along each end. */
  const span = { long: W - 2 * over.ends - 2 * leg, short: D - over.front - over.back - 2 * leg };
  if (legHeight <= frame.aprons.height.mm) throw new Error('The table is too low for its aprons: make it taller or its aprons lower.');
  if (span.long < MIN_APRON || span.short < MIN_APRON) throw new Error('The table is too small for its legs: make it larger, its overhang smaller or its legs thinner.');
  if (frame.aprons.setback.mm < 0 || frame.aprons.setback.mm + apron > leg + 1e-6) throw new Error('The aprons stand outside the legs: set them less far in, or use thicker legs.');
  // The lower shelf: its top off the floor, under the aprons; its edges in from the legs' outside faces.
  const shelf = frame.shelf
    ? { up: frame.shelf.up.mm, inset: frame.shelf.inset?.mm ?? frame.aprons.setback.mm, thickness: thicknessOf(materials, ids.shelfId) }
    : undefined;
  if (shelf && (shelf.up < shelf.thickness || shelf.up > legHeight - frame.aprons.height.mm + 1e-6)) throw new Error('The shelf is not between the floor and the aprons: lower it, or raise it by its own thickness at least.');
  if (shelf && shelf.inset < 0) throw new Error('The shelf stands outside the legs: set it in by nothing or more.');
  // A leaf: beyond the size above, which is the part that stays. It must be long
  // enough to make, and clear the floor when it hangs.
  const asked = frame.top.leaf;
  if (asked) {
    const say = (mm: Mm) => formatLength(mm, INCH_DISPLAY);
    const least = frame.top.torsion ? LEAF.least : DROP_LEAF.least;
    if (asked.length.mm < least - 1e-6) throw new Error(`The leaf must be at least ${say(least)} long.`);
    if (frame.top.torsion && (asked.edge === 'back' ? D : W) < LEAF.least - 1e-6) throw new Error(`The part of the top that stays must be at least ${say(LEAF.least)}.`);
    if (asked.both && frame.top.torsion) throw new Error('A torsion box takes one leaf: a leaf on each side is for a slab top.');
    if (asked.length.mm > legHeight - LEAF.floorClearance + 1e-6) throw new Error(`The leaf is ${say(asked.length.mm)} long but the top's underside is ${say(legHeight)} off the floor: folded down it would reach the floor. Make it ${say(legHeight - LEAF.floorClearance)} or less.`);
  }
  return { ids, W, H, D, leg, layers, apron, top, over, legHeight, span, apronHeight: frame.aprons.height.mm, setback: frame.aprons.setback.mm, shelf, leaf: asked ? { edge: asked.edge, length: asked.length.mm, ...(asked.both ? { both: true as const } : {}) } : undefined };
}

/**
 * A table's leaf as it is made, or nothing: its edge and length; the joint's length; how much stays across
 * the joint; the top's underside off the floor; and the whole top with the leaf up, as a torsion table's is given:
 * its length, its width and where its front-left corner is. Nothing too for a table that cannot be made.
 */
export function frameLeafOf(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>, materials: Material[]) {
  frame = asMade(frame, context);
  if (!frame.top.leaf) return undefined;
  let f: ReturnType<typeof frameLayout>;
  try {
    f = frameLayout(frame, context, materials);
  } catch {
    return undefined;
  }
  if (!f.leaf) return undefined;
  const { edge, length } = f.leaf;
  const both = !!f.leaf.both;
  const back = edge === 'back';
  const n = both ? 2 : 1;
  /** Every edge that has a leaf: the one asked for, and with `both` the one opposite it. */
  const edges: (LeafEdge | 'front')[] = !both ? [edge] : back ? ['back', 'front'] : ['left', 'right'];
  return {
    edge,
    both,
    edges,
    length,
    joint: back ? f.W : f.D,
    stays: back ? f.D : f.W,
    under: f.legHeight,
    fixed: { length: f.W, width: f.D },
    whole: { length: f.W + (back ? 0 : n * length), width: f.D + (back ? n * length : 0), origin: [edges.includes('left') ? -length : 0, f.legHeight, both && back ? length : 0] as Vec },
  };
}

/** A table's leaf's hardware, for the picture only: a torsion leaf's hinge, latches, pins and legs, or a slab leaf's hinges and its brackets or legs. */
export function frameLeafShapes(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>, materials: Material[]): Part[] {
  frame = asMade(frame, context);
  const leaf = frameLeafOf(frame, context, materials);
  if (!leaf) return [];
  const { length, width, origin } = leaf.whole;
  if (frame.top.torsion) return leafHardwareShapes({ ...frame.top.torsion, leaf: frame.top.leaf! }, length, width, origin, `${frame.id}/top`, frame.id, materials);
  // A slab's leaves, each worked out as the only one: the top that stays with that leaf alone.
  const { fixed, under } = leaf;
  const topId = frameMaterials(frame, context).topId;
  return leaf.edges.flatMap((edge, i) => {
    const across = edge === 'back' || edge === 'front';
    const at: Vec = [edge === 'left' ? -leaf.length : 0, under, edge === 'front' ? leaf.length : 0];
    return dropLeafShapes(edge, leaf.length, fixed.length + (across ? 0 : leaf.length), fixed.width + (across ? leaf.length : 0), at, `${frame.id}/top${i ? `-${i + 1}` : ''}`, frame.id, topId);
  });
}

/** How many figure-8 fasteners hold the top down: along each apron, at least two on the long ones and one on the short. */
export function frameFasteners(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>, materials: Material[]): number {
  const { span } = frameLayout(frame, context, materials);
  const along = (length: Mm, least: number) => Math.max(least, Math.round(length / FASTENER_SPACING));
  return 2 * along(span.long, 2) + 2 * along(span.short, 1);
}

/**
 * The top's parts: its panel, and with a solid wood edge the strips round it; a banded or a profiled edge is the
 * panel's own. With a leaf it is two panels that meet square at the joint, each with
 * its edge on its three other sides; the leaf's parts fold with the view's Leaf slider.
 */
function topParts(frame: StoredFrame, own: OwnTop, materialId: Id, at: { y: Mm; W: Mm; D: Mm; thick: Mm }, materials: Material[], leaf?: { edge: LeafEdge; length: Mm; both?: boolean }): Part[] {
  const strip = own.edge.kind === 'strip' ? (own.edge.thickness?.mm ?? 19.05) : 0;
  const band = own.edge.kind === 'banding' ? EDGE_BAND_THICKNESS : 0;
  const cut = strip + band;
  const make = (key: string, name: string, role: 'top' | 'topEdge', width: Mm, height: Mm, thickness: Mm, origin: Vec, xAxis: Vec, yAxis: Vec, material: Id, features: Feature[] = [], banding?: Part['banding']): Part =>
    withGrain(
      {
        id: `${frame.id}/${key}`,
        designObjectId: frame.id,
        name,
        materialId: material,
        size: { width, height, thickness },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(width, height) }, ...features],
        role,
        placement: { origin, xAxis, yAxis },
        ...(banding ? { banding } : {}),
      },
      role,
      materials,
    );
  const profile = own.edge.kind === 'roundover' || own.edge.kind === 'chamfer' ? own.edge : undefined;
  const size = profile?.size?.mm ?? 3;
  /** A slab of the top: its outline over all, which of its edges are finished, and for a leaf what its parts are named with and how they move. */
  type Slab = { key: string; prefix: string; x0: Mm; x1: Mm; zFront: Mm; zBack: Mm; edges: { front: boolean; back: boolean; left: boolean; right: boolean }; moves?: NonNullable<Part['moves']> };
  const all = { front: true, back: true, left: true, right: true };
  // Which edges have a leaf: the one asked for, and with `both` the one opposite it (a classic drop-leaf table).
  const two = !!leaf?.both;
  const has = {
    back: leaf?.edge === 'back',
    front: two && leaf?.edge === 'back',
    left: leaf?.edge === 'left' || (two && leaf?.edge === 'right'),
    right: leaf?.edge === 'right' || (two && leaf?.edge === 'left'),
  };
  /** A leaf's parts: the one asked for is `leaf`, the one opposite it `leaf-2`; two are named with where they are. */
  const named = (edge: LeafEdge | 'front', words: string) => ({ key: edge === leaf?.edge ? 'leaf' : 'leaf-2', prefix: two ? `Leaf, ${words}: ` : 'Leaf: ' });
  const length = leaf?.length ?? 0;
  const slabs: Slab[] = [{ key: 'top', prefix: '', x0: 0, x1: at.W, zFront: 0, zBack: -at.D, edges: { front: !has.front, back: !has.back, left: !has.left, right: !has.right } }];
  if (has.back) slabs.push({ ...named('back', 'back'), x0: 0, x1: at.W, zFront: -at.D, zBack: -at.D - length, edges: { ...all, front: false }, moves: { kind: 'fold', axis: [at.y, -at.D] } });
  if (has.front) slabs.push({ ...named('front', 'front'), x0: 0, x1: at.W, zFront: length, zBack: 0, edges: { ...all, back: false }, moves: { kind: 'fold', axis: [at.y, 0], front: true } });
  if (has.right) slabs.push({ ...named('right', 'right end'), x0: at.W, x1: at.W + length, zFront: 0, zBack: -at.D, edges: { ...all, left: false }, moves: { kind: 'fold', axis: [at.W, at.y], across: 1 } });
  if (has.left) slabs.push({ ...named('left', 'left end'), x0: -length, x1: 0, zFront: 0, zBack: -at.D, edges: { ...all, right: false }, moves: { kind: 'fold', axis: [0, at.y], across: -1 } });
  const parts: Part[] = [];
  for (const slab of slabs) {
    const { edges } = slab;
    // The panel, inside its edges where they are finished.
    const [x0, x1, zFront, zBack] = [slab.x0 + (edges.left ? cut : 0), slab.x1 - (edges.right ? cut : 0), slab.zFront - (edges.front ? cut : 0), slab.zBack + (edges.back ? cut : 0)];
    const edge: Feature[] = profile ? [{ id: 'edge', kind: 'edgeProfile', face: 'A', path: rect(x1 - x0, zFront - zBack), treatment: profile.kind === 'roundover' ? { kind: 'roundover', radius: size } : { kind: 'chamfer', size }, arris: 'A' }] : [];
    const banded: NonNullable<Part['banding']>['edges'] = [...(edges.left ? (['x0'] as const) : []), ...(edges.right ? (['x1'] as const) : []), ...(edges.front ? (['y0'] as const) : []), ...(edges.back ? (['y1'] as const) : [])];
    const made: Part[] = [];
    // The panel lies face A up, its Y running back from its front edge.
    made.push(make(slab.key, `${slab.prefix}Top`, 'top', x1 - x0, zFront - zBack, at.thick, [x0, at.y + at.thick, zFront], RIGHT, BACK, materialId, edge, band ? { edges: banded, thickness: band } : undefined));
    if (strip) {
      // The front and the back strips run the slab's whole length; the end ones between them.
      const long = slab.x1 - slab.x0;
      if (edges.front) made.push(make(`${slab.key}-edge-front`, `${slab.prefix}Top edge, front`, 'topEdge', long, at.thick, strip, [slab.x0, at.y, slab.zFront], RIGHT, UP, SOLID_WOOD_3_4_ID));
      if (edges.back) made.push(make(`${slab.key}-edge-back`, `${slab.prefix}Top edge, back`, 'topEdge', long, at.thick, strip, [slab.x1, at.y, slab.zBack], LEFT, UP, SOLID_WOOD_3_4_ID));
      if (edges.left) made.push(make(`${slab.key}-edge-left`, `${slab.prefix}Top edge, left end`, 'topEdge', zFront - zBack, at.thick, strip, [slab.x0, at.y, zBack], FRONT, UP, SOLID_WOOD_3_4_ID));
      if (edges.right) made.push(make(`${slab.key}-edge-right`, `${slab.prefix}Top edge, right end`, 'topEdge', zFront - zBack, at.thick, strip, [slab.x1, at.y, zFront], BACK, UP, SOLID_WOOD_3_4_ID));
    }
    parts.push(...made.map((p) => (slab.moves ? { ...p, moves: slab.moves } : p)));
  }
  return parts;
}

/** How far a leg frame's aprons stand in from the legs' outside faces. Tune me. */
export const LEG_FRAME_SETBACK: Mm = MM_PER_INCH / 4;

/**
 * How far apart a leg frame's legs may stand along the case, centre to centre, before it gets legs in the middle,
 * where they are asked for (`legs.middle`). Tune me.
 */
export const LEG_FRAME_SPAN: Mm = 36 * MM_PER_INCH;

/**
 * Where a leg frame's middle legs stand along the case: their centres, from its left end. None unless the project
 * asks for them (`legs.middle`), and none while the corner legs are no more than `LEG_FRAME_SPAN` apart. Otherwise under the case's partitions (or mullions), as few of them
 * as keep every span within the limit, since that is where the load comes down; evenly spaced when the case has
 * none, or they are too far apart.
 */
export function legFrameMiddles(cabinet: CabinetDesign, materials: Material[]): Mm[] {
  const legs = cabinet.toeKick.legs;
  const stock = legs && materials.find((m) => m.id === legs.materialId);
  if (!stock || !legs.middle) return [];
  const leg = stock.measuredThickness.mm;
  const [first, last] = [leg / 2, cabinet.size.width.mm - leg / 2];
  if (last - first <= LEG_FRAME_SPAN + 0.5) return [];
  // The middle of each partition or mullion: half of it past the right edge of the opening on its left.
  const d = bayDivider(cabinet, materials);
  const row = cabinet.layout.rows[0]?.id;
  const under: Mm[] = bayCount(cabinet) > 1 ? wholeOpenings(deriveCabinetOpenings(cabinet, materials)).filter((o) => o.rowId === row).slice(0, -1).map((o) => o.origin.x + o.width + d / 2) : [];
  // As few of the partitions as will do: from each leg, the furthest one within reach.
  const chosen: Mm[] = [];
  let at = first;
  while (last - at > LEG_FRAME_SPAN + 0.5) {
    const next = under.filter((x) => x > at + leg && x - at <= LEG_FRAME_SPAN + 0.5 && last - x > leg).at(-1);
    if (next === undefined) {
      const n = Math.ceil((last - first - 0.5) / LEG_FRAME_SPAN) - 1;
      return Array.from({ length: n }, (_, i) => first + ((last - first) * (i + 1)) / (n + 1));
    }
    chosen.push(next);
    at = next;
  }
  return chosen;
}

/**
 * The leg frame a case stands on: four legs of square stock at the case's corners, flush
 * with its outside, and an apron between each two, their tops under the case's bottom. In the cabinet's own
 * frame, below its floor line (Y from -height to 0), as a caster's pad is: the cabinet stands that much higher.
 * The aprons are the case material, pocket-screwed into the legs from their inside faces and up into the bottom
 * along their top edges. `cabinet` is the box (`boxOf`): its width and depth are the frame's. A long case has
 * legs in the middle too where they are asked for (`legFrameMiddles`): a front and a back one at each place, the long aprons in lengths
 * between the legs, and a cross apron from the front leg to the back one, under the partition.
 */
export function legFrameParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const legs = cabinet.toeKick.legs;
  // (Corner posts are no frame under the case: `postParts`.)
  if (!legs || legs.posts) return [];
  const [W, D, h, a] = [cabinet.size.width.mm, cabinet.size.depth.mm, legs.height.mm, legs.apron.mm];
  const stock = materials.find((m) => m.id === legs.materialId);
  if (!stock) throw new Error('The legs\' square stock is not among the project\'s materials: choose it under Bottom in Setup.');
  if (stock.section !== 'square') throw new Error('The legs under a case want square stock: choose one under Bottom in Setup.');
  const leg = stock.measuredThickness.mm;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const span = { long: W - 2 * leg, short: D - 2 * leg };
  if (h <= a) throw new Error('The legs are too short for their aprons: make the legs longer or the aprons lower.');
  if (span.long < MIN_APRON || span.short < MIN_APRON) throw new Error('The case is too small for a leg frame under it.');
  const part = (key: string, name: string, role: 'leg' | 'apron', materialId: Id, size: Part['size'], origin: Vec, xAxis: Vec, features: Feature[] = []): Part =>
    withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId,
        size,
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(size.width, size.height) }, ...features],
        role,
        placement: { origin, xAxis, yAxis: UP },
      },
      role,
      materials,
    );
  const [left, right, front, back] = [0, W - leg, 0, -D + leg];
  const legSize = { width: leg, height: h, thickness: leg };
  /** Up into the bottom, along an apron's top edge: about every 8", at least two. */
  const up = (key: string, length: Mm): Feature[] => {
    const n = Math.max(2, Math.round(length / (8 * MM_PER_INCH)) + 1);
    return pocketRow(`${key}-up`, 'B', 'y1', Array.from({ length: n }, (_, i) => (length * (i + 0.5)) / n));
  };
  const screws = (key: string, length: Mm): Feature[] => [...pocketRow(`${key}-left`, 'B', 'x0', railEndPositions(a)), ...pocketRow(`${key}-right`, 'B', 'x1', railEndPositions(a)), ...up(key, length)];
  const short = { width: span.short, height: a, thickness: t };
  const s = LEG_FRAME_SETBACK;
  // The legs in the middle of a long case, and the long aprons in lengths between one leg and the next.
  const middles = legFrameMiddles(cabinet, materials);
  const nth = (i: number) => (middles.length > 1 ? ` ${i + 1}` : '');
  const middleLegs = middles.flatMap((c, i) => [
    part(`leg-front-middle-${i + 1}`, `Leg, front middle${nth(i)}`, 'leg', legs.materialId, legSize, [c - leg / 2, -h, front], RIGHT),
    part(`leg-back-middle-${i + 1}`, `Leg, back middle${nth(i)}`, 'leg', legs.materialId, legSize, [c - leg / 2, -h, back], RIGHT),
    part(`leg-apron-cross-${i + 1}`, `Leg frame apron, across${nth(i)}`, 'apron', cabinet.materials.caseId, short, [c - t / 2, -a, back], FRONT, screws(`leg-apron-cross-${i + 1}`, span.short)),
  ]);
  const stops = [left + leg, ...middles.flatMap((c) => [c - leg / 2, c + leg / 2]), right];
  const longAprons = Array.from({ length: middles.length + 1 }, (_, i) => {
    const [x0, x1] = [stops[2 * i]!, stops[2 * i + 1]!];
    if (x1 - x0 < MIN_APRON) throw new Error('The legs under the case stand too close together: make the case wider or its bays more even.');
    const [key, name] = middles.length ? [`-${i + 1}`, ` ${i + 1}`] : ['', ''];
    const size = { width: x1 - x0, height: a, thickness: t };
    return [
      part(`leg-apron-front${key}`, `Leg frame apron, front${name}`, 'apron', cabinet.materials.caseId, size, [x0, -a, front - s], RIGHT, screws(`leg-apron-front${key}`, x1 - x0)),
      part(`leg-apron-back${key}`, `Leg frame apron, back${name}`, 'apron', cabinet.materials.caseId, size, [x1, -a, back - leg + s], LEFT, screws(`leg-apron-back${key}`, x1 - x0)),
    ];
  }).flat();
  return [
    part('leg-front-left', 'Leg, front left', 'leg', legs.materialId, legSize, [left, -h, front], RIGHT),
    part('leg-front-right', 'Leg, front right', 'leg', legs.materialId, legSize, [right, -h, front], RIGHT),
    part('leg-back-left', 'Leg, back left', 'leg', legs.materialId, legSize, [left, -h, back], RIGHT),
    part('leg-back-right', 'Leg, back right', 'leg', legs.materialId, legSize, [right, -h, back], RIGHT),
    ...middleLegs,
    ...longAprons,
    part('leg-apron-left', 'Leg frame apron, left end', 'apron', cabinet.materials.caseId, short, [left + s, -a, back], FRONT, screws('leg-apron-left', span.short)),
    part('leg-apron-right', 'Leg frame apron, right end', 'apron', cabinet.materials.caseId, short, [right + leg - s, -a, front - leg], BACK, screws('leg-apron-right', span.short)),
  ];
}

/**
 * The four corner posts of a case that has them (`toeKick.legs.posts`, `postsOf`): square stock from the floor to
 * the case's top, the front two in the plane of the frame (they are its stiles), the back two behind the box, which
 * stops at their front faces (its back is `postsBack`). `cabinet` is the cabinet itself, not its box: the posts are
 * at its outside corners.
 */
export function postParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const posts = postsOf(cabinet, materials);
  if (!posts) return [];
  const stock = materials.find((m) => m.id === posts.materialId)!;
  if (stock.section !== 'square') throw new Error('Corner posts want square stock: choose one under Bottom in Setup.');
  const [W, D, H] = [cabinet.size.width.mm, cabinet.size.depth.mm, cabinet.size.height.mm];
  const { leg, under } = posts;
  if (W - 2 * leg < MIN_APRON || D - 2 * leg < MIN_APRON) throw new Error('The case is too small for posts at its corners.');
  const size = { width: leg, height: under + H, thickness: leg };
  const post = (key: string, name: string, x: Mm, z: Mm): Part =>
    withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId: posts.materialId,
        size,
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(size.width, size.height) }],
        role: 'leg',
        placement: { origin: [x, -under, z], xAxis: RIGHT, yAxis: UP },
      },
      'leg',
      materials,
    );
  return [
    post('leg-front-left', 'Post, front left', 0, leg),
    post('leg-front-right', 'Post, front right', W - leg, leg),
    post('leg-back-left', 'Post, back left', 0, -D + leg),
    post('leg-back-right', 'Post, back right', W - leg, -D + leg),
  ];
}

/**
 * The back of a case on corner posts. **The back panel is on the very back, between the back posts, its rear face
 * in line with theirs**, and **the box's own members stand behind it and carry it**: what
 * closes the box at the back, top and bottom, runs to the panel between the posts, and an upright stands in the
 * back behind each bay division, or in the middle of a wide single bay. The panel is fastened to all of them.
 *
 * `parts`: the box's parts, where the box stands in the cabinet (it stops at the back posts' front faces and has
 * no back of its own: `boxOf`), and the frame's, for the upright at the back of each bay division. A member on edge
 * (a back stretcher that is a nailer) is moved to the rear, between the posts. One that lies flat (the bottom, a
 * flat stretcher, a top panel) is made longer to the rear and notched round the two back posts, so it still reaches
 * the sides in front of them: cut on the CNC, a dog-bone in each notch. All stop the panel's thickness short of the
 * posts' rear faces, whether or not the piece has a back, so that one can be added.
 */
export function postsBack(parts: Part[], cabinet: CabinetDesign, materials: Material[]): Part[] {
  const posts = postsOf(cabinet, materials);
  if (!posts) return parts;
  const [W, D, H] = [cabinet.size.width.mm, cabinet.size.depth.mm, cabinet.size.height.mm];
  const { leg } = posts;
  const between = W - 2 * leg;
  const tBack = thicknessOf(materials, cabinet.materials.backId);
  /** Where the members' rear faces are: the panel's thickness in from the posts' rear faces. */
  const rear = -D + tBack;
  const MEMBERS = ['stretcher-back', 'bottom-stretcher-back', 'bottom', 'top'];
  /** The member that stands on edge at the top, to notch an upright round. */
  let nailer: { y: Mm; thickness: Mm } | undefined;
  let [floor, ceiling] = [0, H];
  const members = parts.map((p): Part => {
    const cut = p.features.find((f) => f.id === 'cutout');
    if (!p.placement || !MEMBERS.includes(p.id.slice(cabinet.id.length + 1)) || cut?.kind !== 'cutout' || cut.outline.length !== 4) return p;
    const { origin, yAxis } = p.placement;
    if (Math.abs(yAxis[1]) > 0.5) {
      // On edge: at the rear, between the back posts, behind the panel.
      nailer = { y: origin[1], thickness: p.size.thickness };
      return {
        ...p,
        size: { ...p.size, width: between },
        // (Its pocket holes go to its inside face: the back lies on its rear one.)
        features: p.features.map((f) => (f === cut ? { ...cut, outline: rect(between, p.size.height) } : f.kind === 'pocketHole' ? { ...f, face: 'A' as const } : f)),
        placement: { ...p.placement, origin: [leg, origin[1], rear + p.size.thickness] },
      };
    }
    // Flat, its length running to the rear, where it stops at the back posts' front faces: on to the panel, notched round the posts.
    const [w, h0] = [p.size.width, p.size.height];
    if (yAxis[2] > -0.5 || Math.abs(origin[2] - h0 - (-D + leg)) > 1) return p;
    const h = h0 + leg - tBack;
    const n = leg - origin[0];
    const outline =
      n > 0.01
        ? [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h0 }, { x: w - n, y: h0 }, { x: w - n, y: h }, { x: n, y: h }, { x: n, y: h0 }, { x: 0, y: h0 }]
        : rect(w, h);
    if (origin[1] < H / 2) floor = Math.max(floor, origin[1]);
    else ceiling = Math.min(ceiling, origin[1] - p.size.thickness);
    return { ...p, size: { ...p.size, height: h }, features: p.features.map((f) => (f === cut ? { ...cut, outline, ...(n > 0.01 ? { dogBones: true } : {}) } : f)) };
  });

  // A middle piece in the back, so that it all ties to the back; whether there is one goes by the back's size and
  // its bay divisions: an upright behind the panel, from the member at the bottom up behind the
  // tie, notched round a back stretcher that stands on edge. One behind each bay division (the upright that stood
  // inside the box at the back, moved there: the tie's end butts its front face); with one bay, one in the middle
  // where the back is wider than `BACK_UPRIGHT_OVER`. The panel is fastened down it.
  const tCase = thicknessOf(materials, cabinet.materials.caseId);
  const top = ceiling === H ? H - tCase : ceiling;
  /** How deep an upright is: from the back posts' front faces to the panel. */
  const deep = leg - tBack;
  /** An upright's outline, in its own frame (X to the rear, Y up): notched at its top rear corner round the stretcher on edge. */
  const uprightOutline = (from: Mm, height: Mm) => {
    const at = nailer ? nailer.y - from : height;
    return nailer && at < height - 0.01
      ? { outline: [{ x: 0, y: 0 }, { x: deep, y: 0 }, { x: deep, y: at }, { x: deep - nailer.thickness, y: at }, { x: deep - nailer.thickness, y: height }, { x: 0, y: height }], dogBones: true as const }
      : { outline: rect(deep, height) };
  };
  const atRear = (p: Part): Part => {
    const from = p.placement!.origin[1];
    const height = top - from;
    const cut = p.features.find((f) => f.id === 'cutout');
    return {
      ...p,
      size: { ...p.size, width: deep, height },
      features: p.features.map((f) => (f === cut && cut.kind === 'cutout' ? { ...cut, dogBones: undefined, ...uprightOutline(from, height) } : f)),
      placement: { ...p.placement!, origin: [p.placement!.origin[0], from, -D + leg] },
    };
  };
  const isBackUpright = (p: Part) => /\/divider-upright-back-\d+$/.test(p.id);
  const out = members.map((p) => (isBackUpright(p) && p.placement ? atRear(p) : p));
  if (!out.some(isBackUpright) && between > BACK_UPRIGHT_OVER) {
    const t = posts.rail;
    const height = top - floor;
    out.push(
      withGrain(
        {
          id: `${cabinet.id}/back-upright-1`,
          designObjectId: cabinet.id,
          name: 'Back upright',
          materialId: cabinet.faceFrame.materialId,
          size: { width: deep, height, thickness: t },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', ...uprightOutline(floor, height) }],
          role: 'buildOut',
          // On edge, its face A to the right, its length up: from the back posts' front faces to the panel.
          placement: { origin: [W / 2 + t / 2, floor, -D + leg], xAxis: [0, 0, -1], yAxis: UP },
        },
        'buildOut',
        materials,
      ),
    );
  }
  if (cabinet.noBack) return out;
  // The back panel: one piece between the posts over the whole back, its rear face in line with theirs.
  const size = { width: between, height: H, thickness: tBack };
  return [
    ...out,
    withGrain(
      {
        id: `${cabinet.id}/back`,
        designObjectId: cabinet.id,
        name: 'Back',
        materialId: cabinet.materials.backId,
        size,
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(size.width, size.height) }],
        role: 'back',
        // Face A inside, on the members' rear faces; its rear face is the back of the piece.
        placement: { origin: [leg, 0, rear], xAxis: RIGHT, yAxis: UP },
      },
      'back',
      materials,
    ),
  ];
}

/** With one bay, a back wider than this between its posts has an upright in its middle: a 1/4" panel that wide is floppy. Tune me. */
export const BACK_UPRIGHT_OVER: Mm = 36 * MM_PER_INCH;

/** The parts of a table: its four legs, its four aprons and its top. */
export function deriveFrameParts(frame: StoredFrame, context: Pick<DesignedCabinetContext, 'settings' | 'tops'>, materials: Material[]): Part[] {
  frame = asMade(frame, context);
  const f = frameLayout(frame, context, materials);
  const part = (key: string, name: string, role: 'leg' | 'apron', materialId: Id, size: Part['size'], origin: Vec, xAxis: Vec, features: Feature[] = [], yAxis: Vec = UP): Part =>
    withGrain(
      {
        id: `${frame.id}/${key}`,
        designObjectId: frame.id,
        name,
        materialId,
        size,
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(size.width, size.height) }, ...features],
        role,
        placement: { origin, xAxis, yAxis },
      },
      role,
      materials,
    );
  // The legs: a part's face A is at its origin and its thickness runs behind it, so each stands with a face to the front.
  const [left, right] = [f.over.ends, f.W - f.over.ends - f.leg];
  const [front, back] = [-f.over.front, -(f.D - f.over.back) + f.leg];
  // One part a leg of square stock; a glued-up leg is its layers, front to back, each a strip as wide as the leg.
  const layerCount = f.layers ?? 1;
  const strip = f.leg / layerCount;
  const leg = (key: string, name: string, x: Mm, z: Mm): Part[] =>
    Array.from({ length: layerCount }, (_, i) =>
      part(layerCount > 1 ? `${key}-layer-${i + 1}` : key, layerCount > 1 ? `${name}, layer ${i + 1}` : name, 'leg', f.ids.legId, { width: f.leg, height: f.legHeight, thickness: strip }, [x, 0, z - i * strip], RIGHT),
    );
  const legs = [
    ...leg('leg-front-left', 'Leg, front left', left, front),
    ...leg('leg-front-right', 'Leg, front right', right, front),
    ...leg('leg-back-left', 'Leg, back left', left, back),
    ...leg('leg-back-right', 'Leg, back right', right, back),
  ];
  // The aprons: face A outward, set in from the legs' outside faces, their tops under the top. Pocket screws from
  // the inside face (B) through each end into the leg, unless bought braces or dowels hold them (a dowel's holes are
  // in an apron's end and a leg's face, which the CNC cannot reach: they are drilled by hand through a printed jig).
  const y = f.legHeight - f.apronHeight;
  const screws = (key: string): Feature[] => (frame.joint ? [] : [...pocketRow(`${key}-left`, 'B', 'x0', railEndPositions(f.apronHeight)), ...pocketRow(`${key}-right`, 'B', 'x1', railEndPositions(f.apronHeight))]);
  const long = { width: f.span.long, height: f.apronHeight, thickness: f.apron };
  const short = { width: f.span.short, height: f.apronHeight, thickness: f.apron };
  const aprons = [
    part('apron-front', 'Apron, front', 'apron', f.ids.apronId, long, [left + f.leg, y, front - f.setback], RIGHT, screws('apron-front')),
    part('apron-back', 'Apron, back', 'apron', f.ids.apronId, long, [right, y, back - f.leg + f.setback], LEFT, screws('apron-back')),
    part('apron-left', 'Apron, left end', 'apron', f.ids.apronId, short, [left + f.setback, y, back], FRONT, screws('apron-left')),
    part('apron-right', 'Apron, right end', 'apron', f.ids.apronId, short, [right + f.leg - f.setback, y, front - f.leg], BACK, screws('apron-right')),
  ];
  // The lower shelf: flat, its top face up, from the legs' outside faces less its inset, cut round each leg.
  const shelves: Part[] = [];
  if (f.shelf) {
    const [x0, x1] = [left + f.shelf.inset, right + f.leg - f.shelf.inset];
    const [zFront, zBack] = [front - f.shelf.inset, back - f.leg + f.shelf.inset];
    const [w, h] = [x1 - x0, zFront - zBack];
    // How far a leg reaches into the shelf's corner, with room round it; nothing when the shelf stops short of the legs.
    const n = Math.max(0, f.leg - f.shelf.inset + SHELF_NOTCH_CLEARANCE);
    const outline =
      n > 0
        ? [{ x: n, y: 0 }, { x: w - n, y: 0 }, { x: w - n, y: n }, { x: w, y: n }, { x: w, y: h - n }, { x: w - n, y: h - n }, { x: w - n, y: h }, { x: n, y: h }, { x: n, y: h - n }, { x: 0, y: h - n }, { x: 0, y: n }, { x: n, y: n }]
        : rect(w, h);
    shelves.push(
      withGrain(
        {
          id: `${frame.id}/shelf`,
          designObjectId: frame.id,
          name: 'Lower shelf',
          materialId: f.ids.shelfId,
          size: { width: w, height: h, thickness: f.shelf.thickness },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline, ...(n > 0 ? { dogBones: true } : {}) }],
          role: 'shelf',
          placement: { origin: [x0, f.shelf.up, zFront], xAxis: RIGHT, yAxis: BACK },
        },
        'shelf',
        materials,
      ),
    );
  }
  // A torsion box for a top: its skins and ribs, its front-left corner on the front-left leg's side of the table.
  const top = frame.top.torsion
    ? deriveTorsionParts(
        { ...frame.top.torsion, ...(f.leaf ? { leaf: frame.top.leaf! } : {}) },
        f.W + (f.leaf && f.leaf.edge !== 'back' ? f.leaf.length : 0),
        f.D + (f.leaf?.edge === 'back' ? f.leaf.length : 0),
        [f.leaf?.edge === 'left' ? -f.leaf.length : 0, f.legHeight, 0],
        `${frame.id}/top`,
        frame.id,
        materials,
      )
    : topParts(frame, frame.top, f.ids.topId, { y: f.legHeight, W: f.W, D: f.D, thick: f.top }, materials, f.leaf);
  return [...legs, ...aprons, ...shelves, ...top];
}
