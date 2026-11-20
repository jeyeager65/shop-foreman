/**
 * An existing case, where it meets the case and the openings: which cabinets can be
 * one, the measurements a made cabinet would give, and the shell the 3D view draws. The arithmetic is in
 * `existing.ts`.
 */
import type { CabinetDesign, ExistingCase, Material, Part, Project, Shop } from '@/model';
import { deriveCaseParts, insideDepth } from './case';
import { HINGE_STAND_IN, shownInInches } from './existing';
import type { ExistingDrawer } from '@/model';
import { deriveFaceFrameParts } from './faceFrame';
import { deriveCabinetOpenings } from './openings';
import { cabinetsOf } from './settings';
import { constructionRules, thicknessOf, toeKickOf } from './style';

/**
 * Whether a cabinet's case can be an existing one: a base or a wall cabinet's ordinary box (a wall cabinet
 * since part E, for new doors on it), one bay. Of the corner cabinets only a blind one (part C).
 */
export function takesExisting(cabinet: Pick<CabinetDesign, 'form' | 'corner' | 'layout'>): boolean {
  // Over its lowest opening it may have drawer openings, nothing else.
  if (!cabinet.layout.rows.slice(0, -1).every((r) => r.use === 'drawer')) return false;
  return (cabinet.form === 'base' || cabinet.form === 'wall') && (!cabinet.corner || cabinet.corner.kind === 'blind') && (cabinet.layout.bays?.length ?? 1) <= 1;
}

/** The inside of a cabinet as it would be measured: where its inside measurements start when they are first asked for. */
export function measuredInside(cabinet: CabinetDesign, materials: Material[]): NonNullable<ExistingCase['inside']> {
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const inside = cabinet.size.width.mm - 2 * t;
  const floor = toeKickOf(cabinet).height + t + constructionRules(cabinet, materials).bottomLift;
  // Under drawer openings the inside is measured in the lowest section: the box's inside less what the openings above take.
  const openings = deriveCabinetOpenings(cabinet, materials);
  const [first, last] = [openings[0]!, openings.at(-1)!];
  const above = first.origin.y + first.height - (last.origin.y + last.height);
  return { widthFront: shownInInches(inside), widthBack: shownInInches(inside), depth: shownInInches(insideDepth(cabinet, materials)), height: shownInInches(cabinet.size.height.mm - t - floor - above) };
}

/**
 * A made cabinet as it would be measured: where an existing case starts, so that switching a cabinet
 * to one moves nothing until a measurement is typed. Its doors are kept.
 */
export function measureCase(cabinet: CabinetDesign, materials: Material[]): ExistingCase {
  const rules = constructionRules(cabinet, materials);
  const openings = deriveCabinetOpenings(cabinet, materials);
  // The lowest opening is the one measured as `opening`; the drawer openings over it, each with the rail under it.
  const opening = openings.at(-1)!;
  const drawers = openings.slice(0, -1).map((o, i): ExistingDrawer => {
    const next = openings[i + 1]!;
    return { height: shownInInches(o.height), rail: shownInInches(Math.max(0, o.origin.y - (next.origin.y + next.height))), fronts: 'kept' };
  });
  return {
    ...(drawers.length ? { drawers } : {}),
    ...(opening.use === 'drawer' ? { lowest: 'drawer' as const } : {}),
    // A blind corner cabinet stays one: its blind part, from the inside of its far side to the door opening.
    ...(cabinet.corner?.kind === 'blind' ? { blind: { side: cabinet.corner.side, reach: shownInInches(Math.max(0, cabinet.corner.blind.mm - thicknessOf(materials, cabinet.materials.caseId))) } } : {}),
    frame: rules.hasFaceFrame ? 'faceFrame' : 'frameless',
    opening: { width: shownInInches(opening.width), height: shownInInches(opening.height) },
    inside: measuredInside(cabinet, materials),
    hingeStandIn: shownInInches(HINGE_STAND_IN),
    fronts: 'kept',
  };
}

/**
 * The closed front of a frameless blind corner cabinet that is already there: a plain board over the blind
 * part of its front, from its outside edge on the blind side to the door opening, so the picture shows which
 * half can be reached through the door and which cannot.
 * Behind a face frame the wide stile is that front already. Drawn only, like the rest of the shell.
 */
function blindFront(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const corner = cabinet.corner;
  if (corner?.kind !== 'blind' || constructionRules(cabinet, materials).hasFaceFrame) return [];
  const opening = deriveCabinetOpenings(cabinet, materials).at(-1)!;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const [x0, x1] = corner.side === 'left' ? [0, opening.origin.x] : [opening.origin.x + opening.width, cabinet.size.width.mm];
  const bottom = toeKickOf(cabinet).height;
  const [width, height] = [x1 - x0, cabinet.size.height.mm - bottom];
  if (width <= 0.5 || height <= 0.5) return [];
  return [
    {
      id: `${cabinet.id}/blind-front`,
      designObjectId: cabinet.id,
      name: 'Blind front',
      materialId: cabinet.materials.caseId,
      size: { width, height, thickness: t },
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] }],
      role: 'blindPanel',
      // Over the front of the case, as a door is.
      placement: { origin: [x0, bottom, t], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
    },
  ];
}

/**
 * The cases that are already there, as the 3D view draws them: each one's sides, bottom, stretchers, back,
 * toe kick and face frame as plain boards with nothing cut into them, marked `existing`. They are never
 * among the parts of a job (`deriveCabinetParts` leaves them out): nothing of them is cut, listed or bought.
 */
export function existingShellParts(project: Project, shop: Pick<Shop, 'materials'>): Part[] {
  return cabinetsOf(project)
    .filter((cabinet) => cabinet.existing)
    .flatMap((cabinet) => [...deriveCaseParts(cabinet, shop.materials), ...deriveFaceFrameParts(cabinet, shop.materials), ...blindFront(cabinet, shop.materials)])
    .map(({ banding: _banding, grain: _grain, ...part }) => ({ ...part, features: part.features.slice(0, 1), existing: true }));
}
