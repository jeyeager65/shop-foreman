/**
 * Inserts for drawers that are already there: cut to one measured drawer, with no
 * cabinet and no project. Three kinds, each a handful of flat parts for the CNC:
 *
 * - **Dividers**: strips on edge that cross in half-lap slots, an egg crate dropped into the drawer.
 * - **A knife insert**: a board lying in the drawer with a row of slots, each taking a blade on its edge.
 * - **A spice insert**: saw-tooth supports with a thin slat on each slope, so jars lie tilted in tiers,
 *   labels up, each tier stopped by the step in front of it.
 *
 * The measurements are the drawer's inside: between its sides, front to back, and from its bottom up to
 * the top edge of its lowest side. Every part is an ordinary `Part`, so its G-code is planned, nested and
 * posted as a job's is (`buildPartsJob`). Sizes that do not come from the drawer are first guesses (tune me).
 */
import { addMaterialFromCatalog } from '@/design';
import { loadManifold, meshOf, type SolidMesh } from '@/geometry/solids';
import { buildPartsJob } from '@/job/buildJob';
import { filesByBlank } from '@/job/files';
import type { Feature, Id, Mm, Part, Point, ShopProfile, Vec3 } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import type { JigFile } from './catalog';
import type { PrintObject } from './threemf';

/** The inside of a drawer. */
export interface DrawerInside {
  width: Mm;
  depth: Mm;
  height: Mm;
}

/** Play between an insert and the drawer's walls, in all. Tune me. */
export const INSERT_PLAY: Mm = 1.5;
/** How far an insert's top stays under the drawer's top edge. Tune me. */
export const INSERT_UNDER: Mm = 3;
/** How much wider a half-lap slot is than the strip that goes in it. Tune me. */
export const SLOT_PLAY: Mm = 0.3;

const UP: Vec3 = [0, 1, 0];
const RIGHT: Vec3 = [1, 0, 0];
const BACK: Vec3 = [0, 0, -1];
const rect = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const OWNER = 'insert';
const part = (id: string, name: string, materialId: Id, size: Part['size'], placement: NonNullable<Part['placement']>, outline?: Point[], cut: Feature[] = []): Part => ({
  id: `${OWNER}/${id}`,
  designObjectId: OWNER,
  name,
  materialId,
  size,
  features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: outline ?? rect(0, 0, size.width, size.height) }, ...cut],
  // A plain board of no cabinet: the planner treats it as it does any part with a role.
  role: 'pullOut',
  placement,
  ...(outline ? { shaped: true } : {}),
});

/** A strip `length` long and `height` high with a slot cut down from its top edge at each of `at`. */
function slottedStrip(length: Mm, height: Mm, at: Mm[], slot: Mm, deep: Mm): Point[] {
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: height },
  ];
  for (const x of [...at].sort((a, b) => b - a)) {
    points.push({ x: x + slot / 2, y: height }, { x: x + slot / 2, y: height - deep }, { x: x - slot / 2, y: height - deep }, { x: x - slot / 2, y: height });
  }
  points.push({ x: 0, y: height });
  return points;
}

export interface Dividers extends DrawerInside {
  /** Strips running from side to side. */
  rows: number;
  /** Strips running from front to back. */
  columns: number;
}

/** Why these dividers cannot be made; empty when they can. `thickness` is the strips' material's. */
export function dividerProblems(d: Dividers, thickness: Mm): string[] {
  const found: string[] = [];
  if (!(d.width > 0 && d.depth > 0 && d.height > 0)) return ["Measure the drawer's inside: its width, its depth and its height."];
  if (d.rows < 0 || d.columns < 0 || d.rows + d.columns < 1) found.push('Ask for at least one divider.');
  if (d.height - INSERT_UNDER < 20) found.push('The drawer is too shallow for dividers: they would be under 20 mm high.');
  const cell = Math.min(d.width / (d.columns + 1), d.depth / (d.rows + 1)) - thickness;
  if (cell < 25) found.push(`The compartments would be ${Math.round(cell)} mm across: ask for fewer dividers.`);
  return found;
}

/**
 * Dividers for a drawer: `rows` strips from side to side and `columns` from front to back, evenly spaced,
 * crossing in half-lap slots (the side-to-side strips slotted from the top, the others from the bottom).
 */
export function dividerParts(d: Dividers, materialId: Id, thickness: Mm): Part[] {
  const height = d.height - INSERT_UNDER;
  const slot = thickness + SLOT_PLAY;
  // Each slot is a hair more than half the height, so the top edges come level.
  const deep = height / 2 + 0.25;
  const xs = Array.from({ length: d.columns }, (_, i) => ((i + 1) * d.width) / (d.columns + 1));
  const zs = Array.from({ length: d.rows }, (_, i) => ((i + 1) * d.depth) / (d.rows + 1));
  const [across, along] = [d.width - INSERT_PLAY, d.depth - INSERT_PLAY];
  const parts: Part[] = [];
  zs.forEach((z, i) => {
    const size = { width: across, height, thickness };
    parts.push(part(`row-${i + 1}`, `Divider, side to side${d.rows > 1 ? ` ${i + 1}` : ''}`, materialId, size, { origin: [INSERT_PLAY / 2, 0, -z + thickness / 2], xAxis: RIGHT, yAxis: UP }, d.columns ? slottedStrip(across, height, xs.map((x) => x - INSERT_PLAY / 2), slot, deep) : undefined));
  });
  xs.forEach((x, i) => {
    const size = { width: along, height, thickness };
    // Slotted from the bottom: the same strip turned over, so it is drawn standing on its slotted edge.
    parts.push(part(`column-${i + 1}`, `Divider, front to back${d.columns > 1 ? ` ${i + 1}` : ''}`, materialId, size, { origin: [x + thickness / 2, height, -INSERT_PLAY / 2], xAxis: BACK, yAxis: [0, -1, 0] }, d.rows ? slottedStrip(along, height, zs.map((z) => z - INSERT_PLAY / 2), slot, deep) : undefined));
  });
  return parts;
}

export interface KnifeInsert {
  /** The drawer's inside width: the board lies across it. */
  width: Mm;
  /** The board, front to back: as long as the longest knife, handle and all. */
  length: Mm;
  /** How long a blade the slots take. */
  blade: Mm;
  /** The slots: how wide (the bit that cuts them, or wider), how deep, and how far apart their middles are. */
  slot: Mm;
  slotDepth: Mm;
  spacing: Mm;
}

/** How many slots a knife insert has: as many as fit across it at its spacing, an inch in from each edge. */
export const knifeSlots = (k: KnifeInsert) => Math.max(0, Math.floor((k.width - INSERT_PLAY - 2 * 25) / k.spacing) + 1);

export function knifeProblems(k: KnifeInsert, thickness: Mm): string[] {
  const found: string[] = [];
  if (!(k.width > 0 && k.length > 0)) return ["Measure the drawer's inside width, and say how long the board is."];
  if (knifeSlots(k) < 1) found.push('The drawer is too narrow for a slot.');
  if (k.blade + 2 * 15 > k.length) found.push('The board is too short for slots that long: make it longer, or the blades shorter.');
  if (k.slotDepth > thickness - 4) found.push(`The slots would come within 4 mm of the board's underside: it is ${thickness.toFixed(1)} mm thick.`);
  if (k.spacing < k.slot + 10) found.push('The slots are too close together: at least 10 mm of wood between two.');
  return found;
}

/** A knife insert: one board with a row of blind slots from its back end, each taking a blade edge down; the handles lie on the board in front of them. */
export function knifeParts(k: KnifeInsert, materialId: Id, thickness: Mm): Part[] {
  const width = k.width - INSERT_PLAY;
  const count = knifeSlots(k);
  const first = (width - (count - 1) * k.spacing) / 2;
  const slots: Feature[] = Array.from({ length: count }, (_, i) => {
    const x = first + i * k.spacing;
    return { id: `knife-slot-${i + 1}`, kind: 'dado', face: 'A', outline: rect(x - k.slot / 2, k.length - 15 - k.blade, x + k.slot / 2, k.length - 15), depth: k.slotDepth };
  });
  return [part('knife-board', 'Knife insert', materialId, { width, height: k.length, thickness }, { origin: [INSERT_PLAY / 2, thickness, 0], xAxis: RIGHT, yAxis: BACK }, undefined, slots)];
}

export interface SpiceInsert extends DrawerInside {
  /** The jars: how big across and how tall. */
  jar: Mm;
  jarHeight: Mm;
}

/** A spice insert's fixed sizes. Tune me. */
export const SPICE = {
  /** How steeply the jars lie. */
  angleDeg: 20,
  /** The least height of a support, under the low end of each slope. */
  low: 12,
  /** The stop in front of the first tier: how wide, and how far it stands over the slope's low end. */
  lip: 10,
  lipOver: 18,
  /** How far in from each side a support stands, and the widest span between two. */
  inset: 30,
  span: 300,
};

/** What a spice insert comes to: its tiers, the run and the rise of each, and how high it stands with a jar on it. */
export function spiceLayout(s: SpiceInsert, slat: Mm): { tiers: number; run: Mm; rise: Mm; slope: Mm; high: Mm; length: Mm; needs: Mm; supports: number } {
  const a = (SPICE.angleDeg * Math.PI) / 180;
  const slope = s.jarHeight + 5;
  const [run, rise] = [slope * Math.cos(a), slope * Math.sin(a)];
  const tiers = Math.max(0, Math.floor((s.depth - INSERT_PLAY - SPICE.lip) / run));
  const high = SPICE.low + rise;
  const width = s.width - INSERT_PLAY;
  return { tiers, run, rise, slope, high, length: SPICE.lip + tiers * run, needs: high + slat + s.jar * Math.cos(a), supports: Math.max(2, Math.ceil((width - 2 * SPICE.inset) / SPICE.span) + 1) };
}

export function spiceProblems(s: SpiceInsert, slat: Mm): string[] {
  if (!(s.width > 0 && s.depth > 0 && s.height > 0 && s.jar > 0 && s.jarHeight > 0)) return ["Measure the drawer's inside, and a jar: across it and its height."];
  const found: string[] = [];
  const layout = spiceLayout(s, slat);
  if (layout.tiers < 1) found.push('The drawer is not deep enough for one tier of jars that tall.');
  if (layout.needs > s.height) found.push(`The jars would stand ${Math.ceil(layout.needs)} mm high at the back of each tier, and the drawer is ${Math.round(s.height)} mm deep inside: they would catch on the way in.`);
  if (s.width - INSERT_PLAY < 2 * SPICE.inset + 40) found.push('The drawer is too narrow for two supports.');
  return found;
}

/** A spice insert: saw-tooth supports on edge, front to back, and a slat across them on each slope. */
export function spiceParts(s: SpiceInsert, supportId: Id, supportThickness: Mm, slatId: Id, slatThickness: Mm): Part[] {
  const { tiers, run, rise, slope, high, length, supports } = spiceLayout(s, slatThickness);
  const width = s.width - INSERT_PLAY;
  // Seen from its left: x from the drawer's front back, y up. The lip, then a slope up for each tier, each ending in the step that stops the tier behind it.
  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: high },
  ];
  for (let k = tiers - 1; k >= 0; k--) {
    const front = SPICE.lip + k * run;
    outline.push({ x: front, y: SPICE.low });
    if (k > 0) outline.push({ x: front, y: high });
  }
  outline.push({ x: SPICE.lip, y: SPICE.low + SPICE.lipOver }, { x: 0, y: SPICE.low + SPICE.lipOver });
  const parts: Part[] = [];
  for (let i = 0; i < supports; i++) {
    const x = INSERT_PLAY / 2 + SPICE.inset + (i * (width - 2 * SPICE.inset - supportThickness)) / (supports - 1);
    parts.push(part(`support-${i + 1}`, `Spice insert, support ${i + 1}`, supportId, { width: length, height: SPICE.low + SPICE.lipOver > high ? SPICE.low + SPICE.lipOver : high, thickness: supportThickness }, { origin: [x + supportThickness, 0, 0], xAxis: BACK, yAxis: UP }, outline));
  }
  const a = (SPICE.angleDeg * Math.PI) / 180;
  for (let k = 0; k < tiers; k++) {
    const front = SPICE.lip + k * run;
    // Lying on the slope: its long edge across the drawer, its width up the slope.
    parts.push(part(`slat-${k + 1}`, `Spice insert, slat${tiers > 1 ? ` ${k + 1}` : ''}`, slatId, { width, height: slope - 1, thickness: slatThickness }, { origin: [INSERT_PLAY / 2, SPICE.low + slatThickness * Math.cos(a), -front + slatThickness * Math.sin(a)], xAxis: RIGHT, yAxis: [0, Math.sin(a), -Math.cos(a)] }));
  }
  void rise;
  return parts;
}

/** `quantity` of an insert: its parts, once for each. */
export function insertCopies(parts: Part[], quantity: number): Part[] {
  const count = Math.max(1, Math.floor(quantity) || 1);
  return Array.from({ length: count }, (_, n) => parts.map((p) => (n === 0 ? p : { ...p, id: `${p.id}~${n + 1}`, name: `${p.name} (${n + 1})` }))).flat();
}

/** The files that cut an insert's parts on a machine of the shop, one per blank and set-up. */
export function insertFiles(parts: Part[], slug: string, shop: ShopProfile, machineId: Id): JigFile[] {
  const project = createBaseCabinetProject();
  project.slug = slug;
  project.name = slug;
  project.machineId = machineId;
  for (const id of new Set(parts.map((p) => p.materialId))) {
    if (!addMaterialFromCatalog(project, shop.materialCatalog, id)) throw new Error("The insert is cut from a material the shop's catalog does not have.");
  }
  project.plan = { strategy: 'fastest', blank: { materialId: parts[0]!.materialId }, operations: {} };
  const job = buildPartsJob(project, shop, parts);
  const sawn = job.plan.parts.filter((p) => p.cutOut !== 'cnc');
  if (sawn.length === job.plan.parts.length) throw new Error('None of its parts can be cut on this machine: they are cut on a saw. The sizes are in the notes.');
  return filesByBlank(job).flatMap((b) =>
    b.files.map((f) => ({
      name: f.name,
      text: f.text,
      note: `${b.blank.label}: ${b.blank.partIds.length} ${b.blank.partIds.length === 1 ? 'part' : 'parts'} on a blank ${Math.round(b.blank.size.width)} × ${Math.round(b.blank.size.height)} mm`,
    })),
  );
}

/**
 * An insert's parts as solids standing where they go in the drawer, for the picture: each part's outline
 * pushed out to its thickness and set by its placement. The drawer's frame (x across, y up, z toward the
 * front) is turned so that up is the picture's up.
 */
export async function insertObjects(parts: Part[], wasmUrl?: string): Promise<PrintObject[]> {
  const { Manifold } = await loadManifold(wasmUrl);
  return parts.map((p) => {
    const cutout = p.features.find((f) => f.kind === 'cutout') as { outline: Point[] };
    const solid = Manifold.extrude([cutout.outline.map((q) => [q.x, q.y] as [number, number])], p.size.thickness);
    const flat = meshOf(solid);
    solid.delete();
    const { origin, xAxis, yAxis } = p.placement!;
    const n: Vec3 = [xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1], xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2], xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0]];
    const positions = new Float32Array(flat.positions.length);
    for (let i = 0; i < flat.positions.length; i += 3) {
      const [u, v, w] = [flat.positions[i]!, flat.positions[i + 1]!, flat.positions[i + 2]!];
      // Face A is the part's far face: its body lies behind it, against the normal.
      const at = [0, 1, 2].map((k) => origin[k]! + xAxis[k]! * u + yAxis[k]! * v - n[k]! * w);
      positions.set([at[0]!, -at[2]!, at[1]!], i);
    }
    // Putting the body behind face A mirrors the solid, which turns every triangle to face inward: the view then
    // draws only the far walls. Each triangle's winding is turned back.
    const triangles = new Uint32Array(flat.triangles.length);
    for (let i = 0; i < flat.triangles.length; i += 3) triangles.set([flat.triangles[i]!, flat.triangles[i + 2]!, flat.triangles[i + 1]!], i);
    const mesh: SolidMesh = { positions, triangles, volume: flat.volume };
    return { name: p.name, mesh, placements: [{ x: 0, y: 0 }] };
  });
}

/** An insert's parts in words, for its notes: each with its size and its material. */
export function insertPartLines(parts: Part[], materialName: (id: Id) => string): string[] {
  const groups = new Map<string, number>();
  for (const p of parts) {
    const key = `${p.name.replace(/ \d+$/, '')}: ${p.size.width.toFixed(1)} × ${p.size.height.toFixed(1)} mm, ${materialName(p.materialId)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([line, count]) => (count > 1 ? `${count} × ${line}` : line));
}

/** A caddy that lifts out: an open box with a board down its middle that has a hand hole. */
export interface Caddy {
  length: Mm;
  width: Mm;
  /** The height of its sides; the middle board stands higher, for the hand hole. */
  height: Mm;
}

/** A caddy's hand hole, and how far the middle board stands over the sides. Tune me. */
export const CADDY = { hole: { width: 100, height: 30 }, over: 70, bottom: 6 };

export function caddyProblems(c: Caddy, thickness: Mm): string[] {
  if (!(c.length > 0 && c.width > 0 && c.height > 0)) return ['Say how long, how wide and how high the caddy is.'];
  const found: string[] = [];
  if (c.length < CADDY.hole.width + 2 * thickness + 60) found.push(`The caddy is too short for a hand hole: at least ${Math.ceil(CADDY.hole.width + 2 * thickness + 60)} mm long.`);
  if (c.width < 4 * thickness + 60) found.push('The caddy is too narrow: there would be no room each side of the middle board.');
  if (c.height < 50) found.push('The caddy is at least 50 mm high.');
  return found;
}

/**
 * A caddy: two sides the whole length, two ends between them, a bottom inside the four, and a middle
 * board from end to end that stands over the sides with a hand hole in it. Butt joints, glued and pinned.
 */
export function caddyParts(c: Caddy, materialId: Id, thickness: Mm): Part[] {
  const t = thickness;
  const inner = { length: c.length - 2 * t, width: c.width - 2 * t };
  const tall = c.height + CADDY.over;
  const hole = { x0: inner.length / 2 - CADDY.hole.width / 2, y0: tall - 25 - CADDY.hole.height };
  return [
    part('caddy-side-front', 'Caddy, side 1', materialId, { width: c.length, height: c.height, thickness: t }, { origin: [0, 0, 0], xAxis: RIGHT, yAxis: UP }),
    part('caddy-side-back', 'Caddy, side 2', materialId, { width: c.length, height: c.height, thickness: t }, { origin: [0, 0, -c.width + t], xAxis: RIGHT, yAxis: UP }),
    part('caddy-end-left', 'Caddy, end 1', materialId, { width: inner.width, height: c.height, thickness: t }, { origin: [t, 0, -t], xAxis: BACK, yAxis: UP }),
    part('caddy-end-right', 'Caddy, end 2', materialId, { width: inner.width, height: c.height, thickness: t }, { origin: [c.length, 0, -t], xAxis: BACK, yAxis: UP }),
    part('caddy-bottom', 'Caddy, bottom', materialId, { width: inner.length, height: inner.width, thickness: t }, { origin: [t, t, -t], xAxis: RIGHT, yAxis: BACK }),
    part('caddy-middle', 'Caddy, middle board', materialId, { width: inner.length, height: tall - t, thickness: t }, { origin: [t, t, -c.width / 2 + t / 2], xAxis: RIGHT, yAxis: UP }, undefined, [
      { id: 'hand-hole', kind: 'cutout', face: 'A', inside: true, outline: rect(hole.x0, hole.y0 - t, hole.x0 + CADDY.hole.width, hole.y0 - t + CADDY.hole.height) },
    ]),
  ];
}
