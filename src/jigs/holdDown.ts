/**
 * A hold-down clamp for stock on the CNC's spoilboard, made for one thickness of stock, held by a wood screw into
 * the spoilboard.
 *
 * It sits on the spoilboard beside the stock: a flat floor with a slot down its middle for the screw, a wall standing
 * at its front against the stock's edge, and a lip at the top of that wall reaching over the stock. A triangular
 * side each side of the floor runs from the top of the wall down to the floor's back end and keeps the wall from
 * being bent back when the lip is pushed up: flat in the middle, triangular up the sides, and hollow between them
 * for the screw and the driver.
 *
 * The lip's underside is a little lower than the thinnest stock sold as that thickness. On the stock the lip rides
 * up, the floor's front lifts, and the screw pulls it down again: the clamp turns on the floor's back edge and the
 * lip bears on the stock. The slot lets the clamp slide up to the stock with its screw already started. The screw
 * only goes through the floor, so it is a short one whatever the stock.
 *
 * The stock it is made for is engraved in the lip's top.
 *
 * Seen from the side, x from the lip's tip back to the floor's end and z up from the spoilboard; the stock's edge is
 * `lap` in from the tip. It prints lying on its side, that profile on the bed, with no supports: the lip, which
 * would hang in the air printed upright, is then a wall, and the layers run the way every part of it is loaded. The
 * side that is uppermost in the print is a roof from the floor to the wall, bridged along its slope; the slot's roof
 * is a short bridge.
 *
 * **It has not been printed or used.** Every size is a first guess: tune me.
 */
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import { GUIDE_STOCK } from '@/geometry/pocketHole';
import type { Mm } from '@/model';
import { STROKE, strokeText, strokeTextDraws, strokeTextLength } from './strokeText';
import type { PrintObject, PrintSettings } from './threemf';

/** Sizes that do not come from the stock. Tune me: first guesses, not yet printed. */
export const HOLD_DOWN = {
  /** The floor, from the stock's edge back, and the clamp across. */
  length: 44,
  width: 32,
  floor: 4,
  /** The wall at the front, the sides, and the lip: how thick each is, and how far the lip reaches over the stock. */
  wall: 4,
  side: 3,
  lip: 4,
  lap: 6,
  /** How much lower than the thinnest stock the lip's underside is, so it bears before the floor lies flat. */
  bite: 0.5,
  /** The slot: where the screw is from the stock's edge, at its nearest and its furthest. */
  slot: { from: 11, to: 30 },
  /** A #8 wood screw's clearance, and the widest head (a pan or a washer head) there is room for. */
  hole: 4.6,
  head: 10.5,
  /** How far the screw should reach into the spoilboard, at the least. */
  intoSpoilboard: 12,
  /** The label engraved in the lip's top: how deep, how wide its lines, the room left round it, and its size at the most. */
  label: { depth: 0.6, line: 0.8, margin: 1.5, scale: 1.25 },
  /** The thinnest and the thickest stock a clamp is made for. */
  least: 4,
  most: 50,
  bedSpacing: 8,
};

/** First guesses. Solid enough to be screwed down hard. */
export const HOLD_DOWN_PRINT: PrintSettings = { walls: 4, topLayers: 5, bottomLayers: 5, infillPercent: 40, infillPattern: 'gyroid', layerHeight: 0.2 };

/** The stock a clamp is made for by name: what the pocket-hole guide knows, and 1/4" for backs and bottoms. */
export const HOLD_DOWN_STOCK = [...GUIDE_STOCK, { id: '1/4', name: '1/4"', mm: 5.6, from: 4.8, to: 6.6 }] as const;

export interface HoldDown {
  /** The thinnest stock it holds: sold as one thickness, the least that measures; a typed thickness, that one. */
  thinnest: Mm;
  /** What it is called: `3/4"`, or its thickness. */
  name: string;
  /** The slot's width. */
  hole: Mm;
}

/** The clamp for a stock sold by a nominal thickness, or (`thickness`) for one measured. */
export function holdDownFor(stockId: string, thickness: Mm, hole: Mm = HOLD_DOWN.hole): HoldDown {
  const stock = HOLD_DOWN_STOCK.find((s) => s.id === stockId);
  return { thinnest: stock ? stock.from : thickness, name: stock ? stock.name : `${+thickness.toFixed(1)} mm`, hole };
}

/** What is engraved on it: `3/4"`, or `22mm` for stock that is none of the usual ones. */
export const holdDownLabel = (clamp: HoldDown): string => clamp.name.replace(' ', '');

/** The heights that follow from the stock, above the spoilboard: the lip's underside and the clamp's top; and how far it stands above the thinnest stock. */
export function holdDownHeights(clamp: HoldDown): { under: Mm; top: Mm; aboveStock: Mm } {
  const under = clamp.thinnest - HOLD_DOWN.bite;
  return { under, top: under + HOLD_DOWN.lip, aboveStock: HOLD_DOWN.lip - HOLD_DOWN.bite };
}

/** The shortest usual wood screw that reaches far enough into the spoilboard through the floor, in inches; and how far it goes in. */
export function holdDownScrew(): { inches: number; into: Mm } {
  const inches = [0.5, 0.625, 0.75, 1, 1.25, 1.5].find((l) => l * 25.4 - HOLD_DOWN.floor >= HOLD_DOWN.intoSpoilboard) ?? 1.5;
  return { inches, into: inches * 25.4 - HOLD_DOWN.floor };
}

/** Why a clamp cannot be made as it is; empty when it can. */
export function holdDownProblems(clamp: HoldDown): string[] {
  const h = HOLD_DOWN;
  if (!(clamp.thinnest >= h.least)) return [`A clamp is made for stock ${h.least} mm thick or more: thinner than that, lay a scrap on it and clamp the scrap.`];
  if (clamp.thinnest > h.most) return [`A clamp is made for stock up to ${h.most} mm thick.`];
  if (!(clamp.hole >= 2 && clamp.hole <= h.head - 3)) return [`The screw's slot is 2 to ${h.head - 3} mm wide: its head has to bear on the floor either side of it.`];
  return [];
}

/**
 * The clamp's middle from the side, between its two sides, counter-clockwise from the lip's tip (x 0; the stock's
 * edge at `lap`): under the lip, down the wall's face, along the spoilboard, up the floor's back end, forward along
 * the floor, up the back of the wall, and forward along the top.
 */
export function holdDownProfile(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { under, top } = holdDownHeights(clamp);
  const back = h.lap + h.length;
  // In stock no thicker than the floor the wall is all lip, and the floor runs straight into it.
  const inside: [Mm, Mm][] = top > h.floor ? [[back, h.floor], [h.lap + h.wall, h.floor], [h.lap + h.wall, top]] : [[back, top]];
  return [[0, under], [h.lap, under], [h.lap, 0], [back, 0], ...inside, [0, top]];
}

/** A side from the side: the same, but from the floor's back end straight up the slope to the top of the wall. */
export function holdDownSide(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { under, top } = holdDownHeights(clamp);
  const back = h.lap + h.length;
  return [[0, under], [h.lap, under], [h.lap, 0], [back, 0], [back, Math.min(h.floor, top)], [h.lap + h.wall, top], [0, top]];
}

/**
 * The label's lines on the lip's top: each from one point to another, x back from the lip's tip and y across the
 * clamp from its middle. It runs across the clamp and is read from behind it, looking toward the stock.
 */
export function holdDownLabelLines(clamp: HoldDown): [{ x: Mm; y: Mm }, { x: Mm; y: Mm }][] {
  const h = HOLD_DOWN;
  const text = holdDownLabel(clamp);
  if (!strokeTextDraws(text)) return [];
  const room = { across: h.width - 2 * h.label.margin, deep: h.lap + h.wall - 2 * h.label.margin };
  const scale = Math.min(h.label.scale, room.across / strokeTextLength(text), room.deep / STROKE.height);
  const [length, height] = [strokeTextLength(text) * scale, STROKE.height * scale];
  // The text's own right is the clamp's -y from there, and its up is toward the lip's tip.
  const at = (p: { x: number; y: number }) => ({ x: (h.lap + h.wall + height) / 2 - p.y, y: length / 2 - p.x });
  return strokeText(text, scale).map(([a, b]) => [at(a), at(b)]);
}

/** The clamp lying on its side on the bed: its profile's x along the bed's x, its height along the bed's y, its width up from the bed. */
export async function buildHoldDown(clamp: HoldDown, wasmUrl?: string): Promise<SolidMesh> {
  const h = HOLD_DOWN;
  const { Manifold } = await loadManifold(wasmUrl);
  const made: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(s: T): T => {
    made.push(s);
    return s;
  };
  const { top } = holdDownHeights(clamp);
  const side = () => keep(Manifold.extrude([holdDownSide(clamp)], h.side));
  const body = keep(Manifold.union([keep(Manifold.extrude([holdDownProfile(clamp)], h.width)), side(), keep(side().translate(0, 0, h.width - h.side))]));
  // The slot through the floor, along the clamp's height: two cylinders turned from the bed's z to its y, and a box between them.
  const [x0, x1] = [h.lap + h.slot.from, h.lap + h.slot.to];
  const [from, to] = [-1, h.floor + 1];
  const slot = [
    ...[x0, x1].map((x) => keep(keep(keep(Manifold.cylinder(to - from, clamp.hole / 2, clamp.hole / 2, 64)).rotate([-90, 0, 0])).translate(x, from, h.width / 2))),
    keep(keep(Manifold.cube([x1 - x0, to - from, clamp.hole])).translate(x0, from, (h.width - clamp.hole) / 2)),
  ];
  // The label: each line a bar with round ends, sunk into the lip's top, which faces along the bed's y. A line is
  // made along the bed's x and turned to lie between its two points in the bed's x and z.
  const { depth, line } = h.label;
  const over = 0.5;
  const onTop = (p: { x: Mm; y: Mm }) => ({ x: p.x, z: h.width / 2 + p.y });
  const strokes = holdDownLabelLines(clamp).flatMap(([a, b]) => {
    const [p, q] = [onTop(a), onTop(b)];
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const bar = keep(keep(Manifold.cube([length, depth + over, line])).translate(0, top - depth, -line / 2));
    // About the bed's y, a turn by t takes the x axis to (cos t, 0, -sin t).
    const turned = keep(bar.rotate([0, (-Math.atan2(q.z - p.z, q.x - p.x) * 180) / Math.PI, 0]));
    const end = (e: { x: Mm; z: Mm }) => keep(keep(keep(Manifold.cylinder(depth + over, line / 2, line / 2, 16)).rotate([-90, 0, 0])).translate(e.x, top - depth, e.z));
    return [keep(turned.translate(p.x, 0, p.z)), end(p), end(q)];
  });
  const cut = keep(body.subtract(keep(Manifold.union([...slot, ...strokes]))));
  // Turned half round on the bed, still on its side, so its open top and not its underside faces the front of the bed.
  const mesh = meshOf(keep(keep(cut.rotate([180, 0, 0])).translate(0, top, h.width)));
  for (const solid of made) solid.delete();
  return mesh;
}

/** The clamps on the bed, one after another along y, each on its side. */
export async function buildHoldDownObjects(clamps: HoldDown[], wasmUrl?: string): Promise<PrintObject[]> {
  const objects: PrintObject[] = [];
  let y = 0;
  for (const clamp of clamps) {
    objects.push({ name: `Hold-down clamp, ${clamp.name}`, mesh: await buildHoldDown(clamp, wasmUrl), placements: [{ x: 0, y }], print: HOLD_DOWN_PRINT });
    y += holdDownHeights(clamp).top + HOLD_DOWN.bedSpacing;
  }
  return objects;
}
