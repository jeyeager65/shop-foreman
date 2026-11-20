/**
 * A project's cabinets grouped by where they stand, for Design's picker (a kitchen's fourteen
 * chips, ten of them "On their own", said nothing of where each was).
 *
 * In a room: each wall's base cabinets, then its uppers, each group in the order they stand along the wall, left to
 * right as you face it; then each island; then what stands free. Without a room nothing says where a cabinet is, so
 * the groups are the runs, in the order of the list, and the cabinets in none ("On their own").
 */
import type { CabinetDesign, DesignedCabinetContext, Project, RoomWall } from '@/model';
import { cabinetPlaces, groupFrame, inCabinet, islandOf, runPlacementsOf } from './room';
import { cabinetsOf } from './settings';

export interface PieceGroup {
  key: string;
  /** Left out: the project's one group, which needs no name. */
  name?: string;
  ids: string[];
}

const WALL_ORDER: RoomWall[] = ['back', 'right', 'front', 'left'];
const WALL_NAMES: Record<RoomWall, string> = { back: 'Back wall', right: 'Right wall', front: 'Front wall', left: 'Left wall' };

export function pieceGroups(project: Project): PieceGroup[] {
  if (project.context.kind !== 'designedCabinet') return [];
  const context: DesignedCabinetContext = project.context;
  const cabinets = cabinetsOf(project);
  const room = context.room;
  const places = room ? cabinetPlaces(project) : undefined;
  if (!room || !places) {
    // By run, in the order their first cabinet has in the list; then the cabinets in none.
    const runs = context.runs
      .map((r) => ({ key: `run:${r.id}`, name: r.name, ids: cabinets.filter((c) => c.runId === r.id).map((c) => c.id), first: cabinets.findIndex((c) => c.runId === r.id) }))
      .filter((g) => g.ids.length > 0)
      .sort((a, b) => a.first - b.first)
      .map(({ key, name, ids }) => ({ key, name, ids }));
    const alone = cabinets.filter((c) => !c.runId).map((c) => c.id);
    if (!runs.length) return alone.length ? [{ key: 'all', ids: alone }] : [];
    return [...runs, ...(alone.length ? [{ key: 'alone', name: 'On their own', ids: alone }] : [])];
  }

  const { placements } = runPlacementsOf(context.runs, context);
  /** Where a cabinet stands: an island, a wall, or free. A run or a cabinet with no place of its own is put on the back wall. */
  const standsAt = (c: CabinetDesign): { island: string } | { wall: RoomWall } | 'free' => {
    const island = c.runId ? islandOf(context, c.runId) : (context.islands ?? []).find((i) => i.covers?.includes(c.id));
    if (island) return { island: island.id };
    const placement = c.runId ? placements.get(c.runId) : c.placement;
    if (!placement) return { wall: 'back' };
    return placement.wall === 'free' ? 'free' : { wall: placement.wall };
  };
  /** How far along its wall a cabinet stands, from the wall's left end as you face it. */
  const along = (c: CabinetDesign, wall: RoomWall): number => {
    const place = places.get(c.id);
    if (!place) return 0;
    const { origin, turn } = groupFrame(room, { wall, along: { mm: 0, unit: 'mm' } });
    return inCabinet({ at: origin, turn }, place.at)[0];
  };
  const out: PieceGroup[] = [];
  for (const wall of WALL_ORDER) {
    const here = cabinets.filter((c) => {
      const at = standsAt(c);
      return typeof at === 'object' && 'wall' in at && at.wall === wall;
    });
    const sorted = (list: CabinetDesign[]) => [...list].sort((a, b) => along(a, wall) - along(b, wall)).map((c) => c.id);
    const [floor, hung] = [here.filter((c) => c.form !== 'wall'), here.filter((c) => c.form === 'wall')];
    if (floor.length) out.push({ key: `${wall}:base`, name: `${WALL_NAMES[wall]}, base`, ids: sorted(floor) });
    if (hung.length) out.push({ key: `${wall}:uppers`, name: `${WALL_NAMES[wall]}, uppers`, ids: sorted(hung) });
  }
  for (const island of context.islands ?? []) {
    const ids = cabinets.filter((c) => {
      const at = standsAt(c);
      return typeof at === 'object' && 'island' in at && at.island === island.id;
    }).map((c) => c.id);
    if (ids.length) out.push({ key: `island:${island.id}`, name: island.name || 'Island', ids });
  }
  const free = cabinets.filter((c) => standsAt(c) === 'free').map((c) => c.id);
  if (free.length) out.push({ key: 'free', name: 'Standing free', ids: free });
  return out;
}
