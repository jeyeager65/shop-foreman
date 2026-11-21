/**
 * A farmhouse (apron-front) sink's cabinet. The sink stands inside the case on a platform of the case material, its
 * apron the front of the cabinet's top row (`CabinetOpening.apron`): the front stretcher under the top and the face
 * frame's top rail are left out there, as the sink's body takes their place, and nothing is hung on that row.
 *
 * The platform lies on a cleat screwed to each side; on a case wider than 30" inside, a rail on edge across under its
 * front and its back stiffens it. Each bowl's drain has a hole through it. Its top is where the sink's underside is: the
 * top's surface less the sink's height (`farmhouseFloor`).
 */
import type { CabinetDesign, Material, Mm, Part, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { rect } from './doors';
import { withGrain } from './grain';
import { insideDepth } from './case';
import { DOOR_STANDOFF } from './openings';
import { apronOf, farmhouseFloor, farmhouseRow, roundedOutline, sinkBowls, sinkCentre } from './sinks';
import { boxOf, constructionRules, thicknessOf } from './style';

/** Tune me: the platform's cleats and rails, how far it runs behind the sink, and its drain holes. */
export const FARMHOUSE_FRAME = {
  cleat: 3 * MM_PER_INCH,
  rail: 3 * MM_PER_INCH,
  railsOver: 30 * MM_PER_INCH,
  behind: 2 * MM_PER_INCH,
  drain: 3.5 * MM_PER_INCH,
  /** About what one weighs full, for the checklist. */
  weight: '200 lb',
};

/** Where a farmhouse sink's apron face is in its cabinet's frame: in front of the doors' faces by its `proud` (a door as thick as the case material). */
export function apronFace(cabinet: CabinetDesign, materials: Material[]): Mm {
  const rules = constructionRules(cabinet, materials);
  const door = rules.inset ? 0 : rules.inFrame ? rules.frontPlane : rules.frontPlane + DOOR_STANDOFF + thicknessOf(materials, cabinet.materials.caseId);
  return door + apronOf(cabinet.sink ?? {}).proud;
}

/** The ids of what a farmhouse sink takes the place of: the front stretcher under the top and the face frame's top rail. */
const takenOut = (cabinetId: string) => new Set([`${cabinetId}/stretcher-front`, `${cabinetId}/frame-rail-top`]);

/**
 * A farmhouse sink cabinet's parts without what the sink takes the place of: the front stretcher and the top rail, and
 * the housings, slots and holes cut for that stretcher in the sides.
 */
export function withoutApronMembers(parts: Part[], cabinet: CabinetDesign): Part[] {
  if (!farmhouseRow(cabinet)) return parts;
  const out = takenOut(cabinet.id);
  const forIt = (id: string) => /(^|[-/])stretcher-front/.test(id) && !/bottom-stretcher-front/.test(id);
  return parts.filter((p) => !out.has(p.id)).map((p) => (p.designObjectId === cabinet.id && p.features.some((f) => forIt(f.id)) ? { ...p, features: p.features.filter((f) => !forIt(f.id)) } : p));
}

/** The platform a farmhouse sink stands on, its cleats and (on a wide case) its rails. Nothing for any other cabinet. */
export function farmhouseParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  if (!farmhouseRow(cabinet)) return [];
  const sink = cabinet.sink!;
  const { box, shift } = boxOf(cabinet, materials);
  const caseId = cabinet.materials.caseId;
  const t = thicknessOf(materials, caseId);
  const [x0, x1] = [shift + t, shift + box.size.width.mm - t];
  const [cx, cz] = sinkCentre(cabinet, apronFace(cabinet, materials));
  const deep = Math.min(insideDepth(cabinet, materials), -(cz - sink.depth.mm / 2) + FARMHOUSE_FRAME.behind);
  const top = farmhouseFloor(cabinet);
  const parts: Part[] = [];
  const add = (key: string, name: string, role: NonNullable<Part['role']>, size: Part['size'], origin: Vec3, xAxis: Vec3, yAxis: Vec3, holes: Part['features'] = []) => {
    parts.push(
      withGrain(
        { id: `${cabinet.id}/farmhouse-${key}`, designObjectId: cabinet.id, name, materialId: caseId, size, features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, size.width, size.height) }, ...holes], role, placement: { origin, xAxis, yAxis } },
        role,
        materials,
      ),
    );
  };
  const [UP, RIGHT, BACK, FRONT]: [Vec3, Vec3, Vec3, Vec3] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];
  // The platform: between the sides from the case front back past the sink, face A up, a drain hole under each bowl.
  const width = x1 - x0;
  const drains = sinkBowls(sink).map((b, i) => ({
    id: `drain-${i + 1}`,
    kind: 'cutout' as const,
    face: 'A' as const,
    inside: true,
    outline: roundedOutline(FARMHOUSE_FRAME.drain, FARMHOUSE_FRAME.drain, 'oval').map(([x, f]) => ({ x: cx + b.x - x0 + x, y: -cz - f })),
  }));
  add('platform', 'Sink platform', 'shelf', { width, height: deep, thickness: t }, [x0, top, 0], RIGHT, BACK, drains);
  // A cleat on each side under it, glued and screwed to the side.
  const cleat = { width: deep, height: FARMHOUSE_FRAME.cleat, thickness: t };
  const under = top - t - FARMHOUSE_FRAME.cleat;
  add('cleat-left', 'Sink platform cleat, left', 'buildOut', cleat, [x0 + t, under, 0], BACK, UP);
  add('cleat-right', 'Sink platform cleat, right', 'buildOut', cleat, [x1 - t, under, -deep], FRONT, UP);
  // On a wide case: a rail on edge across under its front and its back, between the cleats.
  if (width > FARMHOUSE_FRAME.railsOver) {
    const rail = { width: width - 2 * t, height: FARMHOUSE_FRAME.rail, thickness: t };
    const y = top - t - FARMHOUSE_FRAME.rail;
    add('rail-front', 'Sink platform rail, front', 'stretcher', rail, [x0 + t, y, 0], RIGHT, UP);
    add('rail-back', 'Sink platform rail, back', 'stretcher', rail, [x0 + t, y, -deep + t], RIGHT, UP);
  }
  return parts;
}

/** The sink's apron in a sentence, for the checklist. */
export function farmhouseWords(cabinet: CabinetDesign, length: (mm: Mm) => string): string {
  const sink = cabinet.sink!;
  const { height, proud } = apronOf(sink);
  return `the farmhouse sink, ${length(sink.width.mm)} wide and ${length(height)} tall at its apron, its face ${length(proud)} in front of the doors`;
}

