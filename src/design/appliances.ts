/**
 * Appliances: generic boxes standing in the room among the cabinets. A
 * refrigerator, a dishwasher, a range, a microwave hung over a range. Each has a size and a
 * place; nothing is cut, planned or listed for one. They are drawn in the whole-project view,
 * and the tops meet them (`design/tops.ts`): a top runs over a dishwasher beside it and butts
 * the side of a range or a refrigerator.
 *
 * An appliance's frame is a cabinet's: X across its front from its left, Y up from the floor,
 * Z forward, its front at 0 and its back at minus its depth.
 */
import type { Appliance, ApplianceKind, DesignedCabinetContext, Part, Placement, Project, Vec3 } from '@/model';
import { len } from '@/units';
import { groupFrame, inRoom } from './room';
import { cabinetsOf } from './settings';
import { toeKickOf } from './style';

/** The generic sizes a new appliance starts at, in words and inches. Tune me. */
export const APPLIANCE_KINDS: { kind: ApplianceKind; title: string; size: [string, string, string]; offFloor?: string }[] = [
  { kind: 'refrigerator', title: 'Refrigerator', size: ['36"', '70"', '31"'] },
  { kind: 'dishwasher', title: 'Dishwasher', size: ['24"', '34"', '24"'] },
  { kind: 'range', title: 'Range', size: ['30"', '36"', '26"'] },
  { kind: 'microwave', title: 'Microwave, over the range', size: ['30"', '16-1/2"', '16"'], offFloor: '54"' },
];

/** Whether a top can run over it: only a dishwasher stands under the counter. */
export const underCounter = (appliance: Pick<Appliance, 'kind'>): boolean => appliance.kind === 'dishwasher';

export const appliancesOf = (project: Project): Appliance[] => (project.context.kind === 'designedCabinet' ? (project.context.appliances ?? []) : []);

/** Adds a generic appliance of a kind at a place; its id is free among the project's. */
export function addAppliance(project: Project, kind: ApplianceKind, placement: Placement, own: { name?: string; width?: string; height?: string; depth?: string; offFloor?: string } = {}): Appliance {
  if (project.context.kind !== 'designedCabinet') throw new Error('Only a project of cabinets holds appliances.');
  const context: DesignedCabinetContext = project.context;
  const start = APPLIANCE_KINDS.find((k) => k.kind === kind)!;
  const list = (context.appliances ??= []);
  let n = 1;
  while (list.some((a) => a.id === `appliance-${n}`)) n++;
  const offFloor = own.offFloor ?? start.offFloor;
  const appliance: Appliance = {
    id: `appliance-${n}`,
    kind,
    name: own.name ?? start.title.split(',')[0]!,
    size: { width: len(own.width ?? start.size[0]), height: len(own.height ?? start.size[1]), depth: len(own.depth ?? start.size[2]) },
    ...(offFloor ? { offFloor: len(offFloor) } : {}),
    placement,
  };
  list.push(appliance);
  return appliance;
}

/** Where an appliance stands in the room: its front-left corner at the floor (or its underside), and how it is turned. */
export function appliancePlace(project: Project, appliance: Appliance): { at: Vec3; turn: number } | undefined {
  const room = project.context.kind === 'designedCabinet' ? project.context.room : undefined;
  if (!room) return undefined;
  const { origin, turn } = groupFrame(room, appliance.placement);
  return { at: inRoom(origin, turn, [0, appliance.offFloor?.mm ?? 0, appliance.size.depth.mm]), turn };
}

/** Its footprint on the floor, in the room: back-left, back-right, front-right, front-left. */
export function applianceFootprint(project: Project, appliance: Appliance): [number, number][] | undefined {
  const place = appliancePlace(project, appliance);
  if (!place) return undefined;
  const { width, depth } = appliance.size;
  return ([[0, -depth.mm], [width.mm, -depth.mm], [width.mm, 0], [0, 0]] as const).map(([x, z]) => {
    const p = inRoom(place.at, place.turn, [x, 0, z]);
    return [p[0], p[2]];
  });
}

/** The id of the block an appliance is drawn as. */
export const applianceShapeId = (applianceId: string) => `${applianceId}/shape`;
/** Whether a part is an appliance's block (or a block in the way under a sink): drawn in metal, never cut. */
export const isApplianceShape = (partId: string) => partId.includes('appliance-') && partId.endsWith('/shape');

/**
 * A dishwasher's toe kick, which lines up with the toe kick of the cabinets: as high as the
 * project's base cabinets' and its face as far from the wall as
 * theirs, taken from the first base cabinet that has one. None when they have none.
 */
export function applianceKick(project: Project, appliance: Appliance): { height: number; face: number } | undefined {
  if (!underCounter(appliance) || appliance.offFloor) return undefined;
  const beside = cabinetsOf(project).find((c) => c.form === 'base' && toeKickOf(c).height > 0);
  if (!beside) return undefined;
  const kick = toeKickOf(beside);
  const face = Math.min(beside.size.depth.mm - kick.depth, appliance.size.depth.mm - 20);
  return kick.height < appliance.size.height.mm && face > 0 ? { height: kick.height, face } : undefined;
}

/**
 * What the whole-project view draws for the appliances: each as a plain block of its size,
 * where it stands. For the picture only. None without a room: they have no place. A dishwasher's
 * block starts above its toe kick (`kick`), which the view draws set back under it.
 */
export function applianceShapes(project: Project, materialId: string): { id: string; at: Vec3; turn: number; part: Part; kick?: { height: number; face: number } }[] {
  return appliancesOf(project).flatMap((appliance) => {
    const place = appliancePlace(project, appliance);
    if (!place) return [];
    const kick = applianceKick(project, appliance);
    const { width, depth } = appliance.size;
    const height = { mm: appliance.size.height.mm - (kick?.height ?? 0) };
    if (kick) place.at = [place.at[0], place.at[1] + kick.height, place.at[2]];
    const part: Part = {
      id: applianceShapeId(appliance.id),
      designObjectId: appliance.id,
      name: appliance.name,
      materialId,
      // A block: as wide and as tall as its front, as thick as it is deep, its front face at Z 0.
      size: { width: width.mm, height: height.mm, thickness: depth.mm },
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: width.mm, y: 0 }, { x: width.mm, y: height.mm }, { x: 0, y: height.mm }] }],
      role: 'filler',
      placement: { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
    };
    return [{ id: appliance.id, ...place, part, ...(kick ? { kick } : {}) }];
  });
}
