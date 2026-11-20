/**
 * The room the cabinets stand in (milestone 6), and where each cabinet stands in it.
 *
 * Room frame: origin at the back-left corner on the floor, X along the back wall to the
 * right, Y up, Z out from the back wall toward the front wall. A cabinet stands in it at
 * `at` (where its own frame's origin, the front-left corner of its case on the floor,
 * lands), turned about Y by `turn` degrees: 0 faces the front wall, 90 faces the right
 * wall (it stands on the left wall), 270 faces the left wall, 180 faces the back wall.
 */
import type { CabinetDesign, CabinetForm, DesignedCabinetContext, Hardware, Island, Length, Mm, Placement, Project, Room, Run, Vec3 } from '@/model';
import { boxOffFloor } from './casters';
import { diagonalPlace } from './diagonal';
import { runFit, wallLength } from './runs';
import { cabinetsOf } from './settings';
import { len } from '@/units';
import { rowOfCabinets } from './cabinetAssembly';
import { storedCases } from './settings';

/** A new project's room: 12' × 10', its ceiling 8' (tune me). */
export function starterRoom(): Room {
  return { length: len(`144"`), width: len(`120"`), ceiling: len(`96"`) };
}

/** Where one cabinet stands in the whole-project view. */
export interface CabinetPlace {
  at: Vec3;
  /** Degrees about Y: a multiple of 90, or 45 off one for a diagonal corner cabinet. */
  turn: number;
}

/** What the layout needs of each cabinet, in list order. `back`: how far its rearmost part is behind its front-left corner (a cleat included). */
export interface LaidCabinet {
  id: string;
  width: Mm;
  back: Mm;
  /** Wall cabinets stand apart from floor-standing ones when placed automatically. Left out: on the floor. */
  form?: CabinetForm;
  offFloor?: Mm;
  runId?: string;
  fillerLeft?: Mm;
  fillerRight?: Mm;
  /** A cabinet in no run: where it stands. A run's is `placements`'. */
  placement?: Placement;
  /** A diagonal corner cabinet: which end of its run the corner is at, and its depth (its short sides). It is turned into the corner. */
  diagonal?: { side: 'left' | 'right'; depth: Mm };
  /** An L-shaped corner cabinet: which end of its run the corner is at, and its cut-out. Its frame starts at face 1's left end. */
  lShaped?: { side: 'left' | 'right'; depth: Mm };
}

/** A run, or a cabinet in no run: what is placed as one, its left end first. */
export interface PlacedGroup {
  /** The run's id, or `cabinet:<id>`. */
  key: string;
  cabinetIds: string[];
  /** Along its wall: its fillers and cabinets end to end. */
  length: Mm;
  /** Where it stands: its own placement, or the automatic one. */
  placement: Placement;
  auto: boolean;
  kind: 'floor' | 'wall';
}

/** The group key of a lone cabinet. */
export const cabinetGroupKey = (id: string) => `cabinet:${id}`;

const mmLength = (mm: Mm): Length => ({ mm, unit: 'in' });

/**
 * Where a group's frame stands in the room: its origin on the wall's face (or at its
 * back-left corner when free) at its left end, and the turn that faces it into the room.
 * In the group's frame X runs along it, Z out from the wall.
 */
export function groupFrame(room: Room, placement: Placement): { origin: Vec3; turn: 0 | 90 | 180 | 270 } {
  const L = room.length.mm;
  const W = room.width.mm;
  if (placement.wall === 'free') return { origin: [placement.x.mm, 0, placement.y.mm], turn: placement.turn };
  const along = placement.along.mm;
  switch (placement.wall) {
    case 'back':
      return { origin: [along, 0, 0], turn: 0 };
    case 'left':
      return { origin: [0, 0, W - along], turn: 90 };
    case 'right':
      return { origin: [L, 0, along], turn: 270 };
    case 'front':
      return { origin: [L - along, 0, W], turn: 180 };
  }
}

/** A point of a group's frame in the room: turned about Y by `turn` degrees, then moved to `origin`. */
export function inRoom(origin: Vec3, turn: number, local: Vec3): Vec3 {
  const t = (turn * Math.PI) / 180;
  const [c, s] = [Math.round(Math.cos(t) * 1e9) / 1e9, Math.round(Math.sin(t) * 1e9) / 1e9];
  return [origin[0] + local[0] * c + local[2] * s, origin[1] + local[1], origin[2] - local[0] * s + local[2] * c];
}

/**
 * The runs and lone cabinets in list order, each placed: by its own placement, or else
 * automatically on the back wall after what of its kind already stands there (explicit
 * ones first). A wall group placed automatically starts over the first floor group on the
 * back wall, then follows the wall groups before it.
 */
export function placeGroups(cabinets: LaidCabinet[], runPlacements: Map<string, Placement | undefined>, aligned: Map<string, string> = new Map()): PlacedGroup[] {
  const groups: Omit<PlacedGroup, 'placement' | 'auto'>[] = [];
  const own = new Map<string, Placement | undefined>();
  for (const c of cabinets) {
    const key = c.runId ?? cabinetGroupKey(c.id);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, cabinetIds: [], length: 0, kind: c.form === 'wall' ? 'wall' : 'floor' };
      groups.push(group);
      own.set(key, c.runId ? runPlacements.get(c.runId) : c.placement);
    }
    group.cabinetIds.push(c.id);
    group.length += (c.fillerLeft ?? 0) + c.width + (c.fillerRight ?? 0);
  }
  const placed: PlacedGroup[] = [];
  const ends = (kind: PlacedGroup['kind']) => placed.filter((g) => g.kind === kind && g.placement.wall === 'back').map((g) => (g.placement.wall === 'back' ? g.placement.along.mm + g.length : 0));
  for (const g of groups) {
    const placement = own.get(g.key);
    if (placement) placed.push({ ...g, placement, auto: false });
  }
  const auto = (g: (typeof groups)[number]) => {
    const before = ends(g.kind);
    const floorStart = placed.find((p) => p.kind === 'floor' && p.placement.wall === 'back')?.placement;
    const along = before.length ? Math.max(...before) : g.kind === 'wall' && floorStart?.wall === 'back' ? floorStart.along.mm : 0;
    placed.push({ ...g, placement: { wall: 'back', along: mmLength(along) }, auto: true });
  };
  // Floor groups first, so a wall run lined up with one, and the wall groups after them, have it to stand over.
  for (const g of groups) if (!own.get(g.key) && !aligned.has(g.key) && g.kind === 'floor') auto(g);
  for (const g of groups) {
    const to = aligned.get(g.key);
    const under = to ? placed.find((p) => p.key === to) : undefined;
    if (!under || under.placement.wall === 'free' || own.get(g.key)) continue;
    placed.push({ ...g, placement: { wall: under.placement.wall, along: { ...under.placement.along } }, auto: false });
  }
  for (const g of groups) if (!placed.some((p) => p.key === g.key)) auto(g);
  return groups.map((g) => placed.find((p) => p.key === g.key)!);
}

/**
 * Where every cabinet stands. Without a room: in a row, as milestone 4 drew them. In a
 * room: each run, and each cabinet in no run, by its placement (`placeGroups`); its
 * cabinets side by side from its left end, each one's back against the wall.
 */
export function layOutCabinets(room: Room | undefined, cabinets: LaidCabinet[], runPlacements: Map<string, Placement | undefined> = new Map(), aligned: Map<string, string> = new Map()): Map<string, CabinetPlace> {
  const places = new Map<string, CabinetPlace>();
  if (!room) {
    const row = rowOfCabinets(cabinets);
    for (const c of cabinets) places.set(c.id, { at: row.get(c.id)!, turn: 0 });
    return places;
  }
  for (const group of placeGroups(cabinets, runPlacements, aligned)) {
    const { origin, turn } = groupFrame(room, group.placement);
    let x = 0;
    for (const id of group.cabinetIds) {
      const c = cabinets.find((k) => k.id === id)!;
      x += c.fillerLeft ?? 0;
      if (c.diagonal) {
        const place = diagonalPlace({ size: { width: { mm: c.width, unit: 'mm' }, depth: { mm: c.diagonal.depth, unit: 'mm' } } as CabinetDesign['size'] }, x, c.diagonal.side);
        places.set(id, { at: inRoom(origin, turn, [place.local[0], c.offFloor ?? 0, place.local[1]]), turn: turn + place.turn });
      } else if (c.lShaped) {
        const local: [Mm, Mm] = c.lShaped.side === 'left' ? [x + c.lShaped.depth, c.lShaped.depth] : [x, c.lShaped.depth];
        places.set(id, { at: inRoom(origin, turn, [local[0], c.offFloor ?? 0, local[1]]), turn });
      } else places.set(id, { at: inRoom(origin, turn, [x, c.offFloor ?? 0, c.back]), turn });
      x += c.width + (c.fillerRight ?? 0);
    }
  }
  return places;
}

/** The cabinets that reach past the ceiling: their top (the bottom off the floor, plus the height) above it. A warning, never refused. */
export function pastCeiling(project: Project, cabinets: CabinetDesign[], hardware: Hardware[] = []): { cabinet: CabinetDesign; top: Mm }[] {
  const room = project.context.kind === 'designedCabinet' ? project.context.room : undefined;
  if (!room) return [];
  return cabinets.flatMap((cabinet) => {
    // Casters stand a cabinet higher (milestone 9); without the hardware, only a wall cabinet's own height counts.
    const top = (hardware.length || cabinet.form === 'wall' ? (boxOffFloor(cabinet, project.materials, hardware) ?? 0) : 0) + cabinet.size.height.mm;
    return top > room.ceiling.mm + 0.5 ? [{ cabinet, top }] : [];
  });
}

/** A room's size in words: 12' × 10', 8' ceiling. */
export function roomWords(room: Room, length: (mm: Mm) => string): string {
  return `${length(room.length.mm)} × ${length(room.width.mm)}, ${length(room.ceiling.mm)} ceiling`;
}

/** A room from a URL's `144x120x96` (inches), or undefined. */
export function parseRoom(text: string | null): Room | undefined {
  const m = text?.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  const inch = (v: string): Length => len(`${v}"`);
  return { length: inch(m[1]!), width: inch(m[2]!), ceiling: inch(m[3]!) };
}

/**
 * The runs' own placements and the wall runs lined up with floor runs, as `placeGroups`
 * takes them. With the context, an island's rows stand where the island puts them
 * (`islandPlacements`), whatever their own say.
 */
export function runPlacementsOf(runs: Run[], context?: Pick<DesignedCabinetContext, 'runs' | 'pieces' | 'islands'>): { placements: Map<string, Placement | undefined>; aligned: Map<string, string> } {
  const islands = context ? islandPlacements(context) : new Map<string, Placement>();
  return {
    placements: new Map(runs.map((r) => [r.id, islands.get(r.id) ?? r.placement])),
    aligned: new Map(runs.flatMap((r) => (r.alignedWith ? [[r.id, r.alignedWith] as [string, string]] : []))),
  };
}

/**
 * Where an island's rows stand (milestone 8): the first row free at the island's placement
 * and turn; the second turned 180° more, its back against the first's, centred on it.
 */
export function islandPlacements(context: Pick<DesignedCabinetContext, 'runs' | 'pieces' | 'islands'>): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const length = (runId: string) => {
    const run = context.runs.find((r) => r.id === runId);
    return run ? storedCases(context).filter((c) => run.cabinetIds.includes(c.id)).reduce((sum, c) => sum + c.size.width.mm, 0) : 0;
  };
  for (const island of context.islands ?? []) {
    const [one, two] = island.rows;
    if (!one) continue;
    const { x, y, turn } = island.placement;
    out.set(one, { wall: 'free', x, y, turn });
    if (!two) continue;
    const [l1, l2] = [length(one), length(two)];
    const at = inRoom([x.mm, 0, y.mm], turn, [(l1 + l2) / 2, 0, 0]);
    out.set(two, { wall: 'free', x: { mm: at[0], unit: 'in' }, y: { mm: at[2], unit: 'in' }, turn: ((turn + 180) % 360) as 0 | 90 | 180 | 270 });
  }
  return out;
}

/** The island a run is a row of, if any. */
export function islandOf(context: Pick<DesignedCabinetContext, 'islands'>, runId: string): Island | undefined {
  return context.islands?.find((i) => i.rows.includes(runId));
}

/** What `layoutProblems` needs of each cabinet beyond the layout. */
export interface CabinetReach {
  id: string;
  name: string;
  form: CabinetForm;
  /** Its bottom and top off the floor. */
  bottom: Mm;
  top: Mm;
}

/**
 * What is wrong with where things stand, in words: two runs of the same kind in the same
 * place on a wall, a run past a wall's end, a wall run over a tall cabinet that reaches up
 * into it. Warnings on Design, never refused. Free-standing groups are not checked.
 */
export function layoutProblems(room: Room, groups: PlacedGroup[], cabinets: (LaidCabinet & CabinetReach)[], nameOf: (key: string) => string): string[] {
  const problems: string[] = [];
  const span = (g: PlacedGroup) => (g.placement.wall === 'free' ? undefined : { wall: g.placement.wall, from: g.placement.along.mm, to: g.placement.along.mm + g.length });
  const AT = 0.5;
  for (const g of groups) {
    const s = span(g);
    if (!s) continue;
    const wall = wallLength(room, s.wall);
    if (s.from < -AT || s.to > wall + AT) problems.push(`${nameOf(g.key)} runs past the end of the ${s.wall} wall: it reaches ${Math.round(s.to)} mm along a wall ${Math.round(wall)} mm long.`);
  }
  groups.forEach((a, i) =>
    groups.slice(i + 1).forEach((b) => {
      const [p, q] = [span(a), span(b)];
      if (!p || !q || p.wall !== q.wall || p.to - AT <= q.from || q.to - AT <= p.from) return;
      if (a.kind === b.kind) return void problems.push(`${nameOf(a.key)} and ${nameOf(b.key)} stand in the same place on the ${p.wall} wall.`);
      // A wall group over a floor group: only a cabinet that reaches up into it collides.
      const [floor, high] = a.kind === 'floor' ? [a, b] : [b, a];
      const wallBottom = Math.min(...high.cabinetIds.map((id) => cabinets.find((c) => c.id === id)?.bottom ?? Infinity));
      const fs = span(floor)!;
      const hs = span(high)!;
      let x = fs.from;
      for (const id of floor.cabinetIds) {
        const c = cabinets.find((k) => k.id === id)!;
        x += c.fillerLeft ?? 0;
        const [from, to] = [x, x + c.width];
        x += c.width + (c.fillerRight ?? 0);
        if (to - AT > hs.from && hs.to - AT > from && c.top > wallBottom + AT) problems.push(`${c.name} reaches up into ${nameOf(high.key)} on the ${fs.wall} wall.`);
      }
    }),
  );
  return problems;
}

/** A group's footprint seen from above, in the room: its corners, for the room plan. `depth`: how far it stands out from its wall. */
export function groupFootprint(room: Room, group: PlacedGroup, depth: Mm): [number, number][] {
  const { origin, turn } = groupFrame(room, group.placement);
  return ([[0, 0], [group.length, 0], [group.length, depth], [0, depth]] as const).map(([x, z]) => {
    const p = inRoom(origin, turn, [x, 0, z]);
    return [p[0], p[2]];
  });
}

/**
 * Where every cabinet of a project stands in its room, worked out from the design alone:
 * each one's back taken as its case depth (a cleat's standoff left out). For what is
 * derived from the layout (tops meeting at a corner); the whole-project view measures
 * the backs on the parts. Undefined without a room.
 */
export function cabinetPlaces(project: Project): Map<string, CabinetPlace> | undefined {
  const context = project.context;
  if (context.kind !== 'designedCabinet' || !context.room) return undefined;
  const fits = new Map(context.runs.map((r) => [r.id, runFit(context, r)]));
  const filler = (id: string, end: 'left' | 'right') => [...fits.values()].flatMap((f) => f?.fillers ?? []).find((f) => f.cabinetId === id && f.end === end)?.width;
  const laid: LaidCabinet[] = cabinetsOf(project).map((c) => ({
    id: c.id,
    width: c.size.width.mm,
    back: c.size.depth.mm,
    form: c.form,
    offFloor: c.form === 'wall' ? c.offFloor?.mm : undefined,
    runId: c.runId,
    fillerLeft: filler(c.id, 'left'),
    fillerRight: filler(c.id, 'right'),
    ...(c.placement ? { placement: c.placement } : {}),
    ...(c.corner?.kind === 'diagonal' ? { diagonal: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
    ...(c.corner?.kind === 'lShaped' ? { lShaped: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
  }));
  const { placements, aligned } = runPlacementsOf(context.runs, context);
  return layOutCabinets(context.room, laid, placements, aligned);
}

/** A point of the room in a cabinet's own frame: the inverse of `inRoom` for its place. */
export function inCabinet(place: CabinetPlace, room: Vec3): Vec3 {
  const t = (place.turn * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const [dx, dz] = [room[0] - place.at[0], room[2] - place.at[2]];
  // inRoom: x = ox + lx·c + lz·s, z = oz − lx·s + lz·c; turned back.
  return [dx * c - dz * s, room[1] - place.at[1], dx * s + dz * c];
}
