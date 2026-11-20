import { frontBorder, patternFeatures } from './pattern';
import type {
  CabinetType,
  DoorMounting,
  DoorSetDesign,
  Feature,
  Hardware,
  Hinge,
  Material,
  Mm,
  Opening,
  OverlayReport,
  Part,
  Point,
  Polygon,
} from '@/model';

import { type RoutedFeatures, doorHandleHoles, handleFor, routedDoorPull } from './handles';
import { fingerHole } from './pulls';

const EPS = 1e-6;

/** Counter-clockwise rectangle. */
export function rect(x0: Mm, y0: Mm, x1: Mm, y1: Mm): Polygon {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Overlay of the doors that are on the cabinet now, assumed centred on the opening. */
export function currentOverlay(opening: Opening): OverlayReport['current'] {
  const doors = opening.existingDoors;
  if (!doors) return undefined;
  const side = (doors.widthAcross.mm - opening.width.mm) / 2;
  const topBottom = (doors.height.mm - opening.height.mm) / 2;
  return { side, top: topBottom, bottom: topBottom };
}

export const isHinge = (h: Hardware): h is Hinge => h.kind === 'hinge';

/** Hinges for this cabinet type whose overlay is nearest the given side overlay. */
export function suggestHinges(opening: Opening, sideOverlay: Mm, hardware: Hardware[]): Hinge[] {
  const fits = hardware.filter(isHinge).filter((h) => h.cabinetType === opening.cabinetType);
  const nearest = Math.min(...fits.map((h) => Math.abs(h.overlay.mm - sideOverlay)));
  return fits.filter((h) => Math.abs(h.overlay.mm - sideOverlay) - nearest < EPS);
}

/**
 * The hinge the doors hang on: on a frameless opening the door set's frameless
 * hinge, in a shop-style cabinet its inset hinge, each falling back to the generic
 * one of its kind; otherwise its hinge.
 */
export function hingeFor(mounting: DoorMounting, cabinetType: CabinetType, hardware: Hardware[]): Hinge {
  const hinges = hardware.filter(isHinge);
  if (cabinetType === 'faceFrame') return findHinge(hinges, mounting.hingeId);
  const fits = hinges.filter((h) => h.cabinetType === cabinetType);
  const own = cabinetType === 'frameless' ? mounting.framelessHingeId : mounting.shopHingeId;
  const hinge = fits.find((h) => h.id === own) ?? fits.find((h) => h.generic);
  if (!hinge) throw new Error(cabinetType === 'frameless' ? 'The shop profile has no hinge for a frameless cabinet.' : 'The shop profile has no hinge for inset doors.');
  return hinge;
}

/** The doors' side overlay: their own when the cabinet's style sets one, else the hinge's. */
export const doorSideOverlay = (mounting: DoorMounting, hinge: Hinge): Mm => mounting.overlaySide?.mm ?? hinge.overlay.mm;

/**
 * How far the side overlay is from what the hinge can be set to; 0 when it is
 * within the hinge's adjustment.
 */
export function hingeOverlayMiss(mounting: DoorMounting, hinge: Hinge): Mm {
  const off = Math.abs(doorSideOverlay(mounting, hinge) - hinge.overlay.mm);
  return Math.max(0, off - (hinge.sideAdjust ?? 0));
}

export function doorSize(
  design: DoorSetDesign,
  opening: Opening,
  hinge: Hinge,
): { width: Mm; height: Mm } {
  const m = design.mounting;
  // Inset doors get their (negative) overlays from the cabinet's gap when they are hung.
  if (m.type !== 'overlay' && !m.overlaySide) throw new Error('Inset doors need a cabinet in the shop style.');
  const across = opening.width.mm + 2 * doorSideOverlay(m, hinge);
  return {
    width: (across - m.gap.mm * (m.doors - 1)) / m.doors,
    height: opening.height.mm + m.overlayTop.mm + m.overlayBottom.mm,
  };
}

export function overlayReport(
  design: DoorSetDesign,
  opening: Opening,
  hinges: Hardware[],
): OverlayReport {
  const hinge = hingeFor(design.mounting, opening.cabinetType, hinges);
  const current = currentOverlay(opening);
  return {
    current,
    suggestedHingeIds: current
      ? suggestHinges(opening, current.side, hinges).map((h) => h.id)
      : [],
    doorSize: doorSize(design, opening, hinge),
  };
}

function findHinge(hinges: Hinge[], id: string): Hinge {
  const hinge = hinges.find((h) => h.id === id);
  if (!hinge) throw new Error(`Hinge not found: ${id}`);
  return hinge;
}

/** Heights of the cup centres up the door, from the hinge's placement rule. */
export function hingeHeights(hinge: Hinge, doorHeight: Mm): Mm[] {
  const rules = hinge.placement.perDoor;
  const rule = rules.find((r) => doorHeight <= r.maxDoorHeight) ?? rules.at(-1);
  const count = Math.max(2, rule?.count ?? 2);
  const first = hinge.placement.fromEnd.mm;
  const last = doorHeight - first;
  return Array.from({ length: count }, (_, i) => first + ((last - first) * i) / (count - 1));
}

/** Width of a V bevel from its top edge to the floor. */
export function bevelWidth(angleDeg: number, depth: Mm): Mm {
  return depth * Math.tan((angleDeg / 2) * (Math.PI / 180));
}

/**
 * What a one-piece front has cut into it: the shaker panel and its bevel, then any
 * bores on the back, the outside edge and the cutout. Doors and drawer fronts.
 */
export function frontFeatures(
  front: Pick<DoorSetDesign, 'style' | 'outsideEdge'>,
  size: { width: Mm; height: Mm },
  bores: Feature[] = [],
  /** The front's outline when it is not its rectangle: one with a finger notch in an edge. */
  notched?: Polygon,
  /** For its pattern: how thick it is (so the pattern is not cut through it), and which door of a pair it is (a diagonal leans the other way on the right one; a sunburst starts where the two meet). */
  pattern?: { thickness?: Mm; side?: 'left' | 'right' },
): Feature[] {
  const { width, height } = size;
  const outline = rect(0, 0, width, height);
  const features: Feature[] = [];

  if (front.style.kind === 'shaker') {
    const s = front.style;
    const frame = s.frameWidth.mm;
    const depth = s.recessDepth.mm;
    const inset = s.insideEdge.kind === 'vBevel' ? bevelWidth(s.insideEdge.angleDeg, depth) : 0;
    const floor = frame + inset;
    features.push({
      id: 'pocket',
      kind: 'pocket',
      face: 'A',
      // The flat floor; with a bevel, the bevel forms the wall up to the frame edge.
      outline: rect(floor, floor, width - floor, height - floor),
      depth,
      floorCornerRadius: s.floorCornerRadius.mm,
    });
    if (s.insideEdge.kind === 'vBevel') {
      features.push({
        id: 'bevel',
        kind: 'bevel',
        face: 'A',
        path: rect(frame, frame, width - frame, height - frame),
        angleDeg: s.insideEdge.angleDeg,
        depth,
      });
    }
  }

  features.push(...patternFeatures(front.style, size, pattern?.thickness, pattern?.side));
  features.push(...bores);

  const e = front.outsideEdge;
  if (e.kind !== 'square') {
    features.push({
      id: 'outside-edge',
      kind: 'edgeProfile',
      face: 'edge',
      path: outline,
      treatment:
        e.kind === 'roundover'
          ? { kind: 'roundover', radius: e.radius.mm }
          : { kind: 'chamfer', size: e.size.mm },
      arris: 'A',
    });
  }

  features.push({ id: 'cutout', kind: 'cutout', face: 'A', outline: notched ?? outline });
  return features;
}

/** Hinge cups and their dowel holes, from the hinge's spec. */
function hingeBores(hinge: Hinge, size: { width: Mm; height: Mm }, hingeSide: 'left' | 'right'): Feature[] {
  const { width, height } = size;
  const features: Feature[] = [];
  // Cups are on the back; x is still measured looking at the front.
  const cupOffset = hinge.cup.boreDistance + hinge.cup.diameter / 2;
  const toward = hingeSide === 'left' ? 1 : -1;
  const edgeX = hingeSide === 'left' ? 0 : width;
  hingeHeights(hinge, height).forEach((y, i) => {
    const center: Point = { x: edgeX + toward * cupOffset, y };
    features.push({
      id: `cup-${i + 1}`,
      kind: 'cup',
      face: 'B',
      center,
      diameter: hinge.cup.diameter,
      depth: hinge.cup.depth,
      hardwareId: hinge.id,
    });
    const d = hinge.dowels;
    if (d) {
      [-1, 1].forEach((sign, j) => {
        features.push({
          id: `cup-${i + 1}-dowel-${j + 1}`,
          kind: 'hole',
          face: 'B',
          center: { x: center.x + toward * d.setback, y: y + (sign * d.spacing) / 2 },
          diameter: d.diameter,
          depth: d.depth,
        });
      });
    }
  });

  return features;
}

/** The parts of a door set, with every feature placed. Derived; never stored. */
export function deriveDoorParts(
  design: DoorSetDesign,
  opening: Opening,
  hinges: Hardware[],
  materials: Material[],
  /** The end of the door its handle is near: the bottom on a wall cabinet. */
  handleEnd: 'top' | 'bottom' = 'top',
): Part[] {
  const hinge = hingeFor(design.mounting, opening.cabinetType, hinges);
  const material = materials.find((m) => m.id === design.materialId);
  if (!material) throw new Error(`Material not found: ${design.materialId}`);
  const size = doorSize(design, opening, hinge);
  const doors: { key: string; name: string; side: 'left' | 'right' }[] =
    design.mounting.doors === 2
      ? [
          { key: 'door-left', name: 'Left door', side: 'left' },
          { key: 'door-right', name: 'Right door', side: 'right' },
        ]
      : [{ key: 'door', name: 'Door', side: design.mounting.hingeSide ?? 'left' }];
  // Inset in a shop-style cabinet, a door may have a finger hole cut for a pull.
  // Else its handle's holes, when it has one.
  const thick = { ...size, thickness: material.measuredThickness.mm };
  const stile = design.style.kind === 'shaker' ? design.style.frameWidth.mm : undefined;
  const border = frontBorder(design.style);
  const pull = (side: 'left' | 'right'): RoutedFeatures => {
    if (design.mounting.type === 'inset' && design.shopPull === 'fingerPull') return { bores: [fingerHole(thick, side)] };
    if (!design.handle) return { bores: [] };
    const handle = handleFor(design.handle, hinges);
    // A handle's screw holes, or the pull cut into the door itself.
    const routed = routedDoorPull(handle, design.handle, thick, side, handleEnd, stile, border);
    return { bores: [...doorHandleHoles(handle, design.handle, thick, side, handleEnd, stile, border), ...routed.bores], outline: routed.outline };
  };
  // One of two door sets on a cabinet says which it is: "Upper doors" gives "Upper left door".
  const which = /^(Upper|Lower) doors$/.exec(design.name.trim())?.[1];
  return doors.map((d) => ({
    id: `${design.id}/${d.key}`,
    designObjectId: design.id,
    name: which ? `${which} ${d.name.toLowerCase()}` : d.name,
    materialId: material.id,
    size: { ...size, thickness: material.measuredThickness.mm },
    features: frontFeatures(design, size, [...hingeBores(hinge, size, d.side), ...pull(d.side).bores], pull(d.side).outline, { thickness: material.measuredThickness.mm, side: d.key === 'door-left' ? 'left' : d.key === 'door-right' ? 'right' : undefined }),
  }));
}
