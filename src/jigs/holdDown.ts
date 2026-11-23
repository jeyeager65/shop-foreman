/**
 * A hold-down clamp for stock on the CNC's spoilboard, made for one thickness of stock, held by a wood screw into
 * the spoilboard.
 *
 * It sits on the spoilboard beside the stock: a floor with a slot down its middle for the screw, a wall standing
 * at its front against the stock's edge, and a lip at the top of that wall reaching over the stock. A triangular
 * side each side of the floor runs from the top of the wall down to the floor's back end and keeps the wall from
 * being bent back when the lip is pushed up: flat in the middle, triangular up the sides, and hollow between them
 * for the screw and the driver.
 *
 * It stands on a heel under its back end, the rest of its underside clear of the spoilboard, and the lip's
 * underside is a little lower than the thinnest stock sold as that thickness. So it bears at two places only, the
 * heel and the lip, and the screw between them pulls the lip down onto the stock. The slot lets the clamp slide up
 * to the stock with its screw already started. The screw only goes through the floor, so it is a short one whatever
 * the stock.
 *
 * It is made to be screwed down hard. The screw's pull is the greatest force in it, and what it bends is the floor
 * across the clamp, from one side to the other: so the sides are close in to the screw's head, the floor is thick,
 * and the corners where the floor meets the sides are filled at 45 degrees. The lip is a wedge, thin at its tip
 * where the bit may pass near and thick at its root. The slot stops well short of the low end of the sides.
 *
 * The stock it is made for is engraved in the outside of one side, the right way up as the clamp stands.
 *
 * Seen from the side, x from the lip's tip back to the heel's end and z up from the spoilboard; the stock's edge is
 * `lap` in from the tip. It prints lying on its side, that profile on the bed, with no supports: the lip, which
 * would hang in the air printed upright, is then a wall, and the layers run the way the lip, the wall and the sides
 * are loaded. The side that is uppermost in the print is a roof from the floor to the wall, started by the filled
 * corners and bridged along its slope; the slot's roof is a short bridge. The label is in the print's top face.
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
  /** The clamp from the stock's edge back, and across. */
  length: 40,
  width: 28,
  floor: 6,
  /** The wall at the front and the sides: how thick each is. */
  wall: 6,
  side: 5,
  /** The corners where the floor meets the sides, filled at 45 degrees: how far up and how far in. */
  fill: 3,
  /** The lip: how far it reaches over the stock, and how thick it is at its tip and at its root. */
  lap: 5,
  lip: { tip: 3, root: 6 },
  /** How much lower than the thinnest stock the lip's underside is, with the clamp standing level. */
  bite: 0.5,
  /** The heel under the back end: how far it stands below the rest of the underside, and how long it is. */
  heel: { height: 1, length: 6 },
  /** The slot: where the screw is from the stock's edge, at its nearest and its furthest. */
  slot: { from: 12, to: 24 },
  /** A #8 wood screw's clearance, and the widest head (a pan or a washer head) there is room for. */
  hole: 4.6,
  head: 10.5,
  /** How far the screw should reach into the spoilboard, at the least. */
  intoSpoilboard: 12,
  /** The label engraved in a side: how deep, how wide its lines, the room left round it, and its size at the most and the least. */
  label: { depth: 0.6, line: 0.8, margin: 1.5, scale: 1.25, least: 0.5 },
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

/**
 * The heights that follow from the stock, above the spoilboard with the clamp standing level on its heel: the lip's
 * underside, the floor's top and the clamp's top; and how far the lip stands above the thinnest stock at its tip and
 * at its root.
 */
export function holdDownHeights(clamp: HoldDown): { under: Mm; floorTop: Mm; top: Mm; tipAboveStock: Mm; aboveStock: Mm } {
  const h = HOLD_DOWN;
  const under = clamp.thinnest - h.bite;
  return { under, floorTop: h.heel.height + h.floor, top: under + h.lip.root, tipAboveStock: h.lip.tip - h.bite, aboveStock: h.lip.root - h.bite };
}

/** The shortest usual wood screw that reaches far enough into the spoilboard through the floor, in inches; and how far it goes in. */
export function holdDownScrew(): { inches: number; into: Mm } {
  const through = HOLD_DOWN.heel.height + HOLD_DOWN.floor;
  const inches = [0.5, 0.625, 0.75, 1, 1.25, 1.5].find((l) => l * 25.4 - through >= HOLD_DOWN.intoSpoilboard) ?? 1.5;
  return { inches, into: inches * 25.4 - through };
}

/** How wide the flat of the floor is between the filled corners: what the screw's head sits on. */
export const holdDownSeat = (): Mm => HOLD_DOWN.width - 2 * (HOLD_DOWN.side + HOLD_DOWN.fill);

/** Why a clamp cannot be made as it is; empty when it can. */
export function holdDownProblems(clamp: HoldDown): string[] {
  const h = HOLD_DOWN;
  if (!(clamp.thinnest >= h.least)) return [`A clamp is made for stock ${h.least} mm thick or more: thinner than that, lay a scrap on it and clamp the scrap.`];
  if (clamp.thinnest > h.most) return [`A clamp is made for stock up to ${h.most} mm thick.`];
  if (!(clamp.hole >= 2 && clamp.hole <= h.head - 3)) return [`The screw's slot is 2 to ${h.head - 3} mm wide: its head has to bear on the floor either side of it.`];
  return [];
}

/** The outline's front and underside, shared by the middle and the sides: under the lip, down the wall's face, back under the floor, and round the heel. */
function underside(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { under } = holdDownHeights(clamp);
  const back = h.lap + h.length;
  return [[0, under], [h.lap, under], [h.lap, h.heel.height], [back - h.heel.length, h.heel.height], [back - h.heel.length, 0], [back, 0]];
}

/**
 * The clamp's middle from the side, between its two sides, counter-clockwise from the lip's tip (x 0; the stock's
 * edge at `lap`): the underside, up the floor's back end, forward along the floor, up the back of the wall, forward
 * along its top, and down the lip's slope to its tip.
 */
export function holdDownProfile(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { under, floorTop, top } = holdDownHeights(clamp);
  return [...underside(clamp), [h.lap + h.length, floorTop], [h.lap + h.wall, floorTop], [h.lap + h.wall, top], [h.lap, top], [0, under + h.lip.tip]];
}

/** A side from the side: the same, but from the floor's back end straight up the slope to the top of the wall. */
export function holdDownSide(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { under, floorTop, top } = holdDownHeights(clamp);
  return [...underside(clamp), [h.lap + h.length, floorTop], [h.lap + h.wall, top], [h.lap, top], [0, under + h.lip.tip]];
}

/** How high a side's slope is above the spoilboard, `x` back from the lip's tip (behind the wall). */
function slopeAt(clamp: HoldDown, x: Mm): Mm {
  const h = HOLD_DOWN;
  const { floorTop, top } = holdDownHeights(clamp);
  const from = h.lap + h.wall;
  return top - ((top - floorTop) * Math.max(0, x - from)) / (h.length - h.wall);
}

/**
 * The label's lines on the outside of a side: each from one point to another, x back from the lip's tip and z up
 * from the spoilboard. It starts under the top of the wall, where the side is tallest, and is as big as fits under
 * the slope; seen from outside with the lip on the right it reads the right way up.
 */
export function holdDownLabelLines(clamp: HoldDown): [{ x: Mm; z: Mm }, { x: Mm; z: Mm }][] {
  const h = HOLD_DOWN;
  const text = holdDownLabel(clamp);
  if (!strokeTextDraws(text)) return [];
  const m = h.label.margin;
  const [x0, z0] = [h.lap + m, h.heel.height + m];
  const fits = (scale: number) => {
    const end = x0 + strokeTextLength(text) * scale;
    return end <= h.lap + h.length - h.heel.length && z0 + STROKE.height * scale + m <= slopeAt(clamp, end);
  };
  let scale = h.label.scale;
  while (scale > h.label.least && !fits(scale)) scale -= 0.05;
  if (!fits(scale)) return [];
  // Seen from outside this side, the lip is on the right: the text runs from the heel's end toward the lip.
  const end = x0 + strokeTextLength(text) * scale;
  const at = (p: { x: number; y: number }) => ({ x: end - p.x, z: z0 + p.y });
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
  const { floorTop, top } = holdDownHeights(clamp);
  const side = () => keep(Manifold.extrude([holdDownSide(clamp)], h.side));
  // The filled corners: a square bar along the floor beside each side, cut at 45 degrees from the side to the floor,
  // and kept only under the sides' slope.
  const s = Math.SQRT1_2;
  const bar = (z: Mm) => keep(keep(Manifold.cube([h.length - h.wall, h.fill, h.fill])).translate(h.lap + h.wall, floorTop, z));
  const fills = [
    keep(bar(h.side).trimByPlane([0, -s, -s], -(floorTop + h.side + h.fill) * s)),
    keep(bar(h.width - h.side - h.fill).trimByPlane([0, -s, s], (h.width - h.side - h.fill - floorTop) * s)),
  ];
  const within = keep(Manifold.extrude([holdDownSide(clamp)], h.width));
  const body = keep(Manifold.union([keep(Manifold.extrude([holdDownProfile(clamp)], h.width)), side(), keep(side().translate(0, 0, h.width - h.side)), ...fills.map((f) => keep(f.intersect(within)))]));
  // The slot through the floor, along the clamp's height: two cylinders turned from the bed's z to its y, and a box between them.
  const [x0, x1] = [h.lap + h.slot.from, h.lap + h.slot.to];
  const [from, to] = [-1, floorTop + 1];
  const slot = [
    ...[x0, x1].map((x) => keep(keep(keep(Manifold.cylinder(to - from, clamp.hole / 2, clamp.hole / 2, 64)).rotate([-90, 0, 0])).translate(x, from, h.width / 2))),
    keep(keep(Manifold.cube([x1 - x0, to - from, clamp.hole])).translate(x0, from, (h.width - clamp.hole) / 2)),
  ];
  // The label: each line a bar with round ends, sunk into the face that lies on the bed here and is the print's top
  // once the clamp is turned over, below.
  const { depth, line } = h.label;
  const over = 0.5;
  const strokes = holdDownLabelLines(clamp).flatMap(([a, b]) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const stroke = keep(keep(Manifold.cube([length, line, depth + over])).translate(0, -line / 2, -over));
    const end = (p: { x: Mm; z: Mm }) => keep(keep(Manifold.cylinder(depth + over, line / 2, line / 2, 16)).translate(p.x, p.z, -over));
    return [keep(keep(stroke.rotate([0, 0, (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI])).translate(a.x, a.z, 0)), end(a), end(b)];
  });
  const cut = keep(body.subtract(keep(Manifold.union([...slot, ...strokes]))));
  // Turned over on the bed, still on its side: its open top and not its underside faces the front of the bed, and
  // the labelled side is uppermost.
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
