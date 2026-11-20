/**
 * Three drilling jigs for work done by hand, when a part is not
 * drilled on the CNC: a part cut on a saw, a cabinet already built, a door that was bought.
 *
 * - A shelf-pin jig: a strip with a row of guide holes at the pin's spacing and a fence that sets the
 *   row's setback from the case's front edge. A pin through its first hole into the last hole drilled
 *   steps it up the side.
 * - A hinge-cup jig: a plate with a fence against the door's edge and a stop against its end, a guide
 *   hole for the 35 mm cup bit at the hinge's bore distance, and two pilot holes for the hinge's screws
 *   or dowels.
 * - A pull-drilling template: a plate with a fence on two edges that puts a knob's hole or a pull's two
 *   holes at a door's corner, or (one fence, a centre line) across the middle of a drawer front.
 *
 * Each is a flat plate with its fences standing up from it: it prints with the plate on the bed,
 * fences up, without supports, and is used the other way up, plate on the work and fences hooked over
 * its edges.
 *
 * **None of them has been printed or used.** Every size not taken from the hardware is a first guess:
 * tune me. A printed guide hole wears; a drill bushing pressed into it would last, and is not drawn.
 */
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import type { Mm } from '@/model';
import type { PrintObject } from './threemf';

/** Sizes the jigs share that do not come from what they drill for. Tune me: first guesses, not yet printed. */
export const DRILL_JIG = {
  /** How far a fence stands above the plate: what hooks over the edge of the work. */
  fenceHeight: 10,
  fenceThickness: 6,
  /** Plate left round a guide hole, from the hole's edge to the plate's. */
  margin: 12,
  /** Added to a guide hole's diameter so the bit turns in it. */
  holeFit: 0.2,
  /** The slot at each end of a drawer template's centre line. */
  centreSlot: { width: 1.2, length: 8 },
};

type Wasm = Awaited<ReturnType<typeof loadManifold>>;
type Solid = ReturnType<Wasm['Manifold']['cube']>;

/** A plate with fences and holes: boxes joined, cylinders and boxes cut through. Everything in mm, the plate's underside at z = 0. */
function plateWith(
  wasm: Wasm,
  boxes: { x: Mm; y: Mm; z?: Mm; size: [Mm, Mm, Mm] }[],
  holes: { x: Mm; y: Mm; diameter: Mm }[],
  thickness: Mm,
  slots: { x: Mm; y: Mm; size: [Mm, Mm] }[] = [],
): SolidMesh {
  const { Manifold } = wasm;
  const made: Solid[] = [];
  const keep = <T extends Solid>(s: T): T => {
    made.push(s);
    return s;
  };
  const over = 0.5;
  const parts = boxes.map((b) => keep(keep(Manifold.cube(b.size)).translate(b.x, b.y, b.z ?? 0)));
  const body = keep(Manifold.union(parts));
  const cutters = [
    ...holes.map((h) => keep(keep(Manifold.cylinder(thickness + 2 * over, h.diameter / 2, h.diameter / 2, 72)).translate(h.x, h.y, -over))),
    ...slots.map((s) => keep(keep(Manifold.cube([s.size[0], s.size[1], thickness + 2 * over])).translate(s.x, s.y, -over))),
  ];
  const cut = cutters.length ? keep(body.subtract(keep(Manifold.union(cutters)))) : body;
  const mesh = meshOf(cut);
  for (const s of made) s.delete();
  return mesh;
}

export interface ShelfPinJig {
  /** The pin's hole: the drill bit the guide holes take. */
  diameter: Mm;
  /** Between holes up the row. */
  spacing: Mm;
  /** How many guide holes. */
  holes: number;
  /** The row's centre line behind the case's front edge. */
  setback: Mm;
  /** The plate's thickness: what guides the bit. */
  thickness: Mm;
}

/** Why a shelf-pin jig cannot be made; empty when it can. */
export function shelfPinJigProblems(j: ShelfPinJig): string[] {
  const out: string[] = [];
  if (!(j.diameter > 0) || !(j.spacing > 0) || !(j.setback > 0) || !(j.thickness > 0)) out.push('Every size must be more than 0.');
  if (!(j.holes >= 2) || j.holes > 40) out.push('It needs 2 to 40 holes: two at least, to step it up the side on a pin.');
  if (j.spacing <= j.diameter + 2) out.push('The holes are too close together for the plate between them to hold.');
  if (j.setback < j.diameter / 2 + 3) out.push('The row is too close to the front edge for its fence.');
  return out;
}

/** The shelf-pin jig's size on the bed. */
export function shelfPinJigSize(j: ShelfPinJig): { length: Mm; width: Mm } {
  const m = DRILL_JIG.margin + j.diameter / 2;
  return { length: (j.holes - 1) * j.spacing + 2 * m, width: DRILL_JIG.fenceThickness + j.setback + m };
}

/** The shelf-pin jig: its row along X, its fence along the edge at y = 0. */
export async function buildShelfPinJig(j: ShelfPinJig, wasmUrl?: string): Promise<PrintObject[]> {
  const wasm = await loadManifold(wasmUrl);
  const { fenceHeight, fenceThickness: f, margin, holeFit } = DRILL_JIG;
  const { length, width } = shelfPinJigSize(j);
  const first = margin + j.diameter / 2;
  const mesh = plateWith(
    wasm,
    [
      { x: 0, y: 0, size: [length, width, j.thickness] },
      { x: 0, y: 0, size: [length, f, j.thickness + fenceHeight] },
    ],
    Array.from({ length: j.holes }, (_, i) => ({ x: first + i * j.spacing, y: f + j.setback, diameter: j.diameter + holeFit })),
    j.thickness,
  );
  return [{ name: 'Shelf-pin jig', mesh, placements: [{ x: 0, y: 0 }] }];
}

export interface HingeCupJig {
  /** The cup: 35 mm on nearly every cup hinge. */
  cupDiameter: Mm;
  /** Door edge to the cup's edge. */
  boreDistance: Mm;
  /** The cup's centre from the door's end. */
  fromEnd: Mm;
  /** The hinge's two screws or dowels: apart along the door's edge, and behind the cup's centre. */
  pilotSpacing: Mm;
  pilotSetback: Mm;
  pilotDiameter: Mm;
  thickness: Mm;
}

export function hingeCupJigProblems(j: HingeCupJig): string[] {
  const out: string[] = [];
  if ([j.cupDiameter, j.fromEnd, j.pilotSpacing, j.pilotDiameter, j.thickness].some((v) => !(v > 0)) || !(j.boreDistance >= 0) || !(j.pilotSetback >= 0)) out.push('Every size must be more than 0 (the bore distance and the pilots\' setback may be 0).');
  if (j.fromEnd < j.cupDiameter / 2 + 3) out.push('The cup is too close to the door\'s end for the stop.');
  if (j.pilotSpacing / 2 < j.pilotDiameter && j.pilotSetback < j.cupDiameter / 2) out.push('The pilot holes run into each other.');
  return out;
}

/** The hinge-cup jig: the door's edge along the fence at y = 0, its end against the stop at x = 0. */
export async function buildHingeCupJig(j: HingeCupJig, wasmUrl?: string): Promise<PrintObject[]> {
  const wasm = await loadManifold(wasmUrl);
  const { fenceHeight, fenceThickness: f, margin, holeFit } = DRILL_JIG;
  const cupY = f + j.boreDistance + j.cupDiameter / 2;
  const cupX = f + j.fromEnd;
  const pilotY = cupY + j.pilotSetback;
  const reach = Math.max(j.cupDiameter / 2, j.pilotSpacing / 2 + j.pilotDiameter / 2);
  const length = cupX + reach + margin;
  const width = Math.max(cupY + j.cupDiameter / 2, pilotY + j.pilotDiameter / 2) + margin;
  const mesh = plateWith(
    wasm,
    [
      { x: 0, y: 0, size: [length, width, j.thickness] },
      // Against the door's edge, and against its end.
      { x: 0, y: 0, size: [length, f, j.thickness + fenceHeight] },
      { x: 0, y: 0, size: [f, width, j.thickness + fenceHeight] },
    ],
    [
      { x: cupX, y: cupY, diameter: j.cupDiameter + holeFit },
      // The pilots are cut round the cup: where one falls inside it, the cup's hole takes it.
      ...[-1, 1].map((side) => ({ x: cupX + (side * j.pilotSpacing) / 2, y: pilotY, diameter: j.pilotDiameter + holeFit })),
    ],
    j.thickness,
  );
  return [{ name: 'Hinge-cup jig', mesh, placements: [{ x: 0, y: 0 }] }];
}

export interface PullTemplate {
  /** `door`: at a door's corner, on two fences; `drawer`: across a drawer front's middle, on one fence and a centre line. */
  use: 'door' | 'drawer';
  /** One hole for a knob, two for a pull. */
  holes: 1 | 2;
  /** Between a pull's two holes. */
  spacing: Mm;
  /** The screw's hole. */
  diameter: Mm;
  /** A door: the holes' line in from the door's edge away from its hinges. */
  fromEdge: Mm;
  /** A door: the first hole from the door's end. A drawer: the holes' line below the front's top edge. */
  fromEnd: Mm;
  /** A door: which hand. `left`: the door's edge is to the left of the holes as the template lies on it. */
  hand: 'left' | 'right';
  thickness: Mm;
}

export function pullTemplateProblems(j: PullTemplate): string[] {
  const out: string[] = [];
  if ([j.diameter, j.fromEnd, j.thickness].some((v) => !(v > 0)) || (j.use === 'door' && !(j.fromEdge > 0)) || (j.holes === 2 && !(j.spacing > 0))) out.push('Every size must be more than 0.');
  const least = j.diameter / 2 + 3;
  if (j.fromEnd < least || (j.use === 'door' && j.fromEdge < least)) out.push('A hole is too close to the edge for its fence.');
  if (j.holes === 2 && j.spacing <= j.diameter + 2) out.push('The two holes are too close together.');
  return out;
}

/**
 * The pull template. A door's: the door's end against the fence at y = 0, its edge against the fence
 * at x = 0 (the left hand) or at the far side (the right hand), the pull's holes in a line up the door.
 * A drawer front's: the front's top edge against the fence at y = 0, the holes level and either side of
 * a centre line marked by a slot at each edge, to set on a pencil line at the front's middle.
 */
export async function buildPullTemplate(j: PullTemplate, wasmUrl?: string): Promise<PrintObject[]> {
  const wasm = await loadManifold(wasmUrl);
  const { fenceHeight, fenceThickness: f, margin, holeFit, centreSlot } = DRILL_JIG;
  const m = margin + j.diameter / 2;
  const span = j.holes === 2 ? j.spacing : 0;
  const high = j.thickness + fenceHeight;
  const hole = j.diameter + holeFit;
  if (j.use === 'drawer') {
    const length = span + 2 * m + 2 * margin;
    const width = f + j.fromEnd + m;
    const mid = length / 2;
    const mesh = plateWith(
      wasm,
      [
        { x: 0, y: 0, size: [length, width, j.thickness] },
        { x: 0, y: 0, size: [length, f, high] },
      ],
      (j.holes === 2 ? [-1, 1] : [0]).map((side) => ({ x: mid + (side * span) / 2, y: f + j.fromEnd, diameter: hole })),
      j.thickness,
      // The centre line: a slot in from the edge away from the fence, and a notch through the fence.
      [
        { x: mid - centreSlot.width / 2, y: width - centreSlot.length, size: [centreSlot.width, centreSlot.length + 1] },
        { x: mid - centreSlot.width / 2, y: f, size: [centreSlot.width, centreSlot.length] },
      ],
    );
    return [{ name: 'Pull template, drawer front', mesh, placements: [{ x: 0, y: 0 }] }];
  }
  const width = f + j.fromEdge + m;
  const length = f + j.fromEnd + span + m;
  const left = j.hand === 'left';
  const x = left ? f + j.fromEdge : width - f - j.fromEdge;
  const mesh = plateWith(
    wasm,
    [
      { x: 0, y: 0, size: [width, length, j.thickness] },
      // Against the door's end, and against its edge on the hand's side.
      { x: 0, y: 0, size: [width, f, high] },
      { x: left ? 0 : width - f, y: 0, size: [f, length, high] },
    ],
    (j.holes === 2 ? [0, span] : [0]).map((d) => ({ x, y: f + j.fromEnd + d, diameter: hole })),
    j.thickness,
  );
  return [{ name: `Pull template, door, ${j.hand} hand`, mesh, placements: [{ x: 0, y: 0 }] }];
}

/**
 * A dowel jig for a table's aprons and legs: one plate drills both halves of a joint, so
 * the holes meet. It has a fence along one edge and a stop across its end, and a row of guide holes for the
 * dowel's bit.
 *  - On a leg: the fence against the leg's outside face and the stop on its top end. The holes are the aprons'
 *    setback and half the apron's thickness in from that face.
 *  - On an apron's end: the same, with the printed spacer (as thick as the setback) between the fence and the
 *    apron's outside face, and the stop on its top edge. The holes are then in the middle of its thickness.
 * Never printed: every size is a first guess.
 */
export interface DowelJig {
  /** The dowel, and the bit that drills for it. */
  diameter: Mm;
  /** The apron's thickness: the holes are in its middle. */
  thickness: Mm;
  /** How far the apron's outside face stands in from the leg's. */
  setback: Mm;
  /** The first dowel's centre below the top of the apron (and of the leg). */
  fromTop: Mm;
  /** Between the dowels down the joint. */
  spacing: Mm;
  /** How many dowels a joint. */
  dowels: number;
  /** The plate's thickness: what guides the bit. */
  plate: Mm;
}

/** Why a dowel jig cannot be made; empty when it can. */
export function dowelJigProblems(j: DowelJig): string[] {
  const out: string[] = [];
  if (!(j.diameter > 0) || !(j.thickness > 0) || !(j.fromTop > 0) || !(j.spacing > 0) || !(j.plate > 0)) out.push('Every size must be more than 0 (the setback may be 0).');
  if (j.setback < 0) out.push('The setback cannot be less than 0.');
  if (!(j.dowels >= 1) || j.dowels > 6) out.push('It takes 1 to 6 dowels a joint.');
  if (j.diameter > j.thickness - 6) out.push('The dowel is too thick for the apron: leave 3 mm of wood each side of it.');
  if (j.dowels > 1 && j.spacing <= j.diameter + 4) out.push('The dowels are too close together.');
  if (j.fromTop < j.diameter / 2 + 5) out.push('The first dowel is too close to the top.');
  return out;
}

/** The dowel jig's size on the bed, and where its holes are from the fence. */
export function dowelJigSize(j: DowelJig): { length: Mm; width: Mm; fromFence: Mm } {
  const m = DRILL_JIG.margin + j.diameter / 2;
  const fromFence = j.setback + j.thickness / 2;
  return { length: DRILL_JIG.fenceThickness + j.fromTop + (j.dowels - 1) * j.spacing + m, width: DRILL_JIG.fenceThickness + fromFence + m, fromFence };
}

/** The dowel jig, and beside it the spacer that goes between its fence and an apron's face. */
export async function buildDowelJig(j: DowelJig, wasmUrl?: string): Promise<PrintObject[]> {
  const wasm = await loadManifold(wasmUrl);
  const { fenceHeight, fenceThickness: f, holeFit } = DRILL_JIG;
  const { length, width, fromFence } = dowelJigSize(j);
  const jig = plateWith(
    wasm,
    [
      { x: 0, y: 0, size: [length, width, j.plate] },
      // The fence along the face, and the stop across the top end.
      { x: 0, y: 0, size: [length, f, j.plate + fenceHeight] },
      { x: 0, y: 0, size: [f, width, j.plate + fenceHeight] },
    ],
    Array.from({ length: j.dowels }, (_, i) => ({ x: f + j.fromTop + i * j.spacing, y: f + fromFence, diameter: j.diameter + holeFit })),
    j.plate,
  );
  const out: PrintObject[] = [{ name: 'Dowel jig', mesh: jig, placements: [{ x: 0, y: 0 }] }];
  // The spacer: as thick as the setback, for the apron's end. None where the aprons are flush with the legs.
  if (j.setback > 0.4) {
    const spacer = plateWith(wasm, [{ x: 0, y: 0, size: [length - f - 1, fenceHeight - 1, j.setback] }], [], j.setback);
    out.push({ name: 'Dowel jig spacer', mesh: spacer, placements: [{ x: 0, y: width + 6 }] });
  }
  return out;
}
