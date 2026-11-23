/**
 * A hold-down clamp for stock on the CNC's spoilboard, made for one thickness of stock, held by a wood screw into
 * the spoilboard.
 *
 * It is a flat strap with a rib up each side, not a block. The strap's front end, the nose, laps onto the stock's top
 * at its edge; its back end stands on a heel on the spoilboard; between them it bridges, with a slot down its middle
 * for the screw. The nose's underside is a little lower than the thinnest stock sold as that thickness, so the screw
 * pulls the nose down onto the stock. The slot lets the clamp slide up to the stock with its screw already started,
 * and puts the screw near the nose or further back.
 *
 * The ribs are what make it stiff. Seen from the side each is a triangle standing on the strap: nothing at the
 * nose's tip, where the bit may pass near, highest beside the slot, where the strap bends most, and low again at the
 * heel. Seen from the end each leans in at 45 degrees from its top to the strap, so the strap is a flat floor
 * between two slopes, the screw's head on it and below the ribs' tops.
 *
 * The stock it is made for is engraved in the strap's top, over the heel.
 *
 * Seen from the side, x from the nose's tip back to the heel's end and z up from the spoilboard; the stock's edge is
 * `lap` in from the tip. It prints lying on its side, that profile on the bed, with no supports: the layers then run
 * the length of the nose, which a nose printed flat would snap along. On its side the lower rib is on the bed, the
 * strap a wall standing on it, and the upper rib grows out of that wall at its 45 degrees, which is why the ribs lean.
 * The slot's roof is a short bridge.
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
  length: 76,
  width: 36,
  /** The strap's thickness: all that stands above the stock at the nose's tip. */
  strap: 5,
  /** How far the nose reaches onto the stock. */
  lap: 8,
  /** How much lower than the thinnest stock the nose's underside is, so it bears before the strap lies level. */
  bite: 0.5,
  /** Clear of the stock's edge behind the nose, and of the spoilboard between there and the heel. */
  edgeGap: 2,
  relief: 2,
  heel: 14,
  /** Cut off the heel's two lower corners. */
  chamfer: 3,
  /** A rib: how wide its top is, how high it stands at its peak and at the heel's end, and where its peak is from the tip. */
  rib: { top: 3, height: 7, back: 2, peak: 30 },
  /** The slot: where the screw is at its nearest to the stock's edge, and how far back from there it can be. */
  screwFromEdge: 14,
  slot: 18,
  /** A #8 wood screw's clearance, and the widest head (a pan or a washer head) the floor between the ribs is kept clear for. */
  hole: 4.6,
  head: 10.5,
  /** How far the screw should reach into the spoilboard, at the least. */
  intoSpoilboard: 9,
  /** The label engraved in the strap's top: how deep, how wide its lines, the room left round it, and its size at the most. */
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

/** How high a rib stands above the strap, `x` back from the nose's tip. */
export function holdDownRibAt(x: Mm): Mm {
  const { height, back, peak } = HOLD_DOWN.rib;
  return x <= peak ? (height * Math.max(0, x)) / peak : height - ((height - back) * (Math.min(x, HOLD_DOWN.length) - peak)) / (HOLD_DOWN.length - peak);
}

/** How wide the flat floor between the ribs is at `x`: each rib takes its top and, leaning at 45 degrees, its height. */
export const holdDownFloorAt = (x: Mm): Mm => HOLD_DOWN.width - 2 * (HOLD_DOWN.rib.top + holdDownRibAt(x));

/**
 * The heights that follow from the stock, above the spoilboard: the nose's underside, the strap's top and the ribs'
 * peak; how far the strap and the ribs stand above the thinnest stock where they are over it; and how much plastic
 * is under the screw's head.
 */
export function holdDownHeights(clamp: HoldDown): { under: Mm; strapTop: Mm; top: Mm; strapAboveStock: Mm; ribsAboveStock: Mm; throughPlastic: Mm } {
  const h = HOLD_DOWN;
  const under = clamp.thinnest - h.bite;
  const strapTop = under + h.strap;
  return { under, strapTop, top: strapTop + h.rib.height, strapAboveStock: h.strap - h.bite, ribsAboveStock: h.strap - h.bite + holdDownRibAt(h.lap), throughPlastic: strapTop };
}

/** The shortest usual wood screw that reaches far enough into the spoilboard, in inches; and how far it goes in. */
export function holdDownScrew(clamp: HoldDown): { inches: number; into: Mm } {
  const through = holdDownHeights(clamp).throughPlastic;
  const inches = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].find((l) => l * 25.4 - through >= HOLD_DOWN.intoSpoilboard) ?? 3;
  return { inches, into: inches * 25.4 - through };
}

/** Where the screw can be along the clamp, from the nose's tip: the two ends of the slot. */
export function holdDownSlot(): [Mm, Mm] {
  const from = HOLD_DOWN.lap + HOLD_DOWN.screwFromEdge;
  return [from, from + HOLD_DOWN.slot];
}

/** Why a clamp cannot be made as it is; empty when it can. */
export function holdDownProblems(clamp: HoldDown): string[] {
  const h = HOLD_DOWN;
  if (!(clamp.thinnest >= h.least)) return [`A clamp is made for stock ${h.least} mm thick or more: thinner than that, lay a scrap on it and clamp the scrap.`];
  if (clamp.thinnest > h.most) return [`A clamp is made for stock up to ${h.most} mm thick.`];
  if (!(clamp.hole >= 2 && clamp.hole <= h.head - 3)) return [`The screw's slot is 2 to ${h.head - 3} mm wide: its head has to bear on the strap either side of it.`];
  return [];
}

/**
 * The strap and the heel from the side, counter-clockwise from the nose's tip: under the strap to the heel, down
 * the heel's front, round its foot, up its back, and forward along the strap's top.
 */
export function holdDownProfile(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { under, strapTop } = holdDownHeights(clamp);
  const c = Math.min(h.chamfer, under - 0.5);
  return [
    [0, under],
    [h.length - h.heel, under],
    [h.length - h.heel + c, 0],
    [h.length - c, 0],
    [h.length, c],
    [h.length, strapTop],
    [0, strapTop],
  ];
}

/** A rib from the side, standing on the strap: counter-clockwise from the nose's tip, along the strap, up at the heel's end, and over its peak. */
export function holdDownRib(clamp: HoldDown): [Mm, Mm][] {
  const h = HOLD_DOWN;
  const { strapTop } = holdDownHeights(clamp);
  return [
    [0, strapTop],
    [h.length, strapTop],
    [h.length, strapTop + h.rib.back],
    [h.rib.peak, strapTop + h.rib.height],
  ];
}

/**
 * The label's lines on the strap's top, behind the slot and between the ribs: each from one point to another, x back
 * from the nose's tip and y across the clamp from its middle. Read from above with the nose on the left.
 */
export function holdDownLabelLines(clamp: HoldDown): [{ x: Mm; y: Mm }, { x: Mm; y: Mm }][] {
  const h = HOLD_DOWN;
  const text = holdDownLabel(clamp);
  if (!strokeTextDraws(text)) return [];
  const from = holdDownSlot()[1] + h.head / 2 + h.label.margin;
  const room = { x: h.length - h.label.margin - from, y: holdDownFloorAt(from) - 2 * h.label.margin };
  const scale = Math.min(h.label.scale, room.x / strokeTextLength(text), room.y / STROKE.height);
  const at = { x: from + (room.x - strokeTextLength(text) * scale) / 2, y: -(STROKE.height * scale) / 2 };
  return strokeText(text, scale).map(([a, b]) => [{ x: at.x + a.x, y: at.y + a.y }, { x: at.x + b.x, y: at.y + b.y }]);
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
  const { strapTop, top } = holdDownHeights(clamp);
  const strap = keep(Manifold.extrude([holdDownProfile(clamp)], h.width));
  // The ribs: the triangle pushed out as wide as a rib is at the strap, then its inner side cut back at 45 degrees
  // so it is `rib.top` wide at its peak. One on the bed, one at the top of the print.
  const wide = h.rib.top + h.rib.height;
  const s = Math.SQRT1_2;
  const lower = keep(keep(Manifold.extrude([holdDownRib(clamp)], wide)).trimByPlane([0, -s, -s], -(strapTop + wide) * s));
  const upper = keep(keep(keep(Manifold.extrude([holdDownRib(clamp)], wide)).translate(0, 0, h.width - wide)).trimByPlane([0, -s, s], (h.width - wide - strapTop) * s));
  const body = keep(Manifold.union([strap, lower, upper]));
  // The slot, along the clamp's height: two cylinders turned from the bed's z to its y, and a box between them.
  const [x0, x1] = holdDownSlot();
  const [from, to] = [-1, top + 1];
  const slot = [
    ...[x0, x1].map((x) => keep(keep(keep(Manifold.cylinder(to - from, clamp.hole / 2, clamp.hole / 2, 64)).rotate([-90, 0, 0])).translate(x, from, h.width / 2))),
    keep(keep(Manifold.cube([x1 - x0, to - from, clamp.hole])).translate(x0, from, (h.width - clamp.hole) / 2)),
  ];
  // The label: each line a bar with round ends, sunk into the strap's top. Drawn flat, then stood up: the strap's
  // top faces along the bed's y, and what is up in the label is down the print.
  const { depth, line } = h.label;
  const over = 0.5;
  const strokes = holdDownLabelLines(clamp).flatMap(([a, b]) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const bar = keep(keep(Manifold.cube([length, line, depth + over])).translate(0, -line / 2, -depth));
    const end = (p: { x: Mm; y: Mm }) => keep(keep(Manifold.cylinder(depth + over, line / 2, line / 2, 16)).translate(p.x, p.y, -depth));
    return [keep(keep(bar.rotate([0, 0, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI])).translate(a.x, a.y, 0)), end(a), end(b)];
  });
  const label = strokes.length ? [keep(keep(keep(Manifold.union(strokes)).rotate([-90, 0, 0])).translate(0, strapTop, h.width / 2))] : [];
  const cut = keep(body.subtract(keep(Manifold.union([...slot, ...label]))));
  const mesh = meshOf(cut);
  for (const made1 of made) made1.delete();
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
