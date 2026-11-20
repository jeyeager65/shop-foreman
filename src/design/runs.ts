/**
 * Runs: cabinets that stand side by side as one piece. A run holds floor-standing
 * cabinets (base and tall together) or wall cabinets, not both. Its cabinets stand left
 * to right in the order of the project's cabinet list.
 *
 * In a run the depth, the toe kick and, for each form, the height are the run's:
 * changing one on any of its cabinets changes it for all (`resolveCabinet` in
 * `settings.ts` reads and writes them through here). Each cabinet keeps its own values
 * for when it leaves the run. Which sides show is derived: a side against a neighbour,
 * or at an end that is against a wall, is hidden; a side at an open end shows. A
 * cabinet in a run is made once.
 */
import type { CabinetForm, DesignedCabinetContext, Id, Project, Room, RoomWall, Run, SideExposure, StoredCabinet } from '@/model';
import { storedCases } from './settings';

type Kind = 'floor' | 'wall';
/** What a run of this cabinet's kind may hold: the floor-standing forms together, or wall cabinets. */
export const runKindOf = (form: CabinetForm): Kind => (form === 'wall' ? 'wall' : 'floor');

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function contextOf(project: Project): DesignedCabinetContext {
  if (project.context.kind !== 'designedCabinet') throw new Error('Not a project of designed cabinets.');
  return project.context;
}

/** The run a cabinet stands in, if any. */
export function runOf(context: DesignedCabinetContext, cabinetId: Id): Run | undefined {
  return context.runs.find((run) => run.cabinetIds.includes(cabinetId));
}

/** The run's cabinets as stored, left to right: the order of the project's list. */
export function runCabinets(context: DesignedCabinetContext, run: Run): StoredCabinet[] {
  return storedCases(context).filter((c) => run.cabinetIds.includes(c.id));
}

/** A wall's length in a room: the back and front walls run its length, the side walls its width. */
export function wallLength(room: Room, wall: RoomWall): number {
  return wall === 'back' || wall === 'front' ? room.length.mm : room.width.mm;
}

/** Nearer a room's wall than this, a run's end is against it. */
const AT_WALL = 1;

/**
 * What each end of the run meets. A run placed against a wall of the project's room
 * (milestone 6): a wall where its left end is at the wall's left end, or its right end
 * (its length to fill, else its cabinets) at the wall's right end; open elsewhere. A run
 * placed free, or not placed, or in a project without a room: its stored `ends`.
 */
export function runEnds(context: DesignedCabinetContext, run: Run): Run['ends'] {
  const place = run.placement;
  if (!context.room || !place || place.wall === 'free') return run.ends;
  const length = run.length?.mm ?? runWidth(context, run);
  const left = place.along.mm < AT_WALL ? 'wall' : 'open';
  const right = place.along.mm + length > wallLength(context.room, place.wall) - AT_WALL ? 'wall' : 'open';
  return { left, right };
}

/**
 * Which sides of each of the run's cabinets show. Against a neighbour: hidden, except
 * the side of a tall cabinet beside a base one, whose upper part shows. At an end:
 * hidden against a wall, showing where the end is open.
 */
export function runSides(context: DesignedCabinetContext, run: Run): Map<Id, { left: SideExposure; right: SideExposure }> {
  const cabinets = runCabinets(context, run);
  const beside = (cabinet: StoredCabinet, other: StoredCabinet | undefined, end: 'wall' | 'open'): SideExposure => {
    if (!other) return end === 'wall' ? 'hidden' : 'exposed';
    return cabinet.form === 'tall' && other.form === 'base' ? 'exposed' : 'hidden';
  };
  const ends = runEnds(context, run);
  return new Map(cabinets.map((c, i) => [c.id, { left: beside(c, cabinets[i - 1], ends.left), right: beside(c, cabinets[i + 1], ends.right) }]));
}

/** The run's width: its cabinets side by side. */
export function runWidth(context: DesignedCabinetContext, run: Run): number {
  return runCabinets(context, run).reduce((sum, c) => sum + c.size.width.mm, 0);
}

/** Less than this left over is nothing to fill. */
const NO_GAP = 0.5;

/**
 * How a run fills its length: what is left over beside its cabinets (negative when
 * the run is too long), and the filler strips that take it up. They go at the ends that
 * are against a wall, in equal shares; an open end takes none, so a run with no wall
 * end just has its space left over. Nothing when the run has no length.
 */
export function runFit(context: DesignedCabinetContext, run: Run): { length: number; width: number; leftOver: number; fillers: { end: 'left' | 'right'; cabinetId: Id; width: number }[] } | undefined {
  if (!run.length) return undefined;
  const cabinets = runCabinets(context, run);
  const width = runWidth(context, run);
  const leftOver = run.length.mm - width;
  const at = runEnds(context, run);
  const ends = (['left', 'right'] as const).filter((end) => at[end] === 'wall');
  const fillers =
    leftOver > NO_GAP && cabinets.length > 0
      ? ends.map((end) => ({ end, cabinetId: (end === 'left' ? cabinets[0]! : cabinets.at(-1)!).id, width: leftOver / ends.length }))
      : [];
  return { length: run.length.mm, width, leftOver, fillers };
}

/** Keeps a run's list of ids in the order of the project's list, and drops runs left empty. */
function tidy(context: DesignedCabinetContext): void {
  for (const run of context.runs) run.cabinetIds = storedCases(context).filter((c) => run.cabinetIds.includes(c.id)).map((c) => c.id);
  context.runs = context.runs.filter((run) => run.cabinetIds.length > 0);
}

/** Makes sure the run has a height for the cabinet's form: the cabinet's own, the first of its form to join. */
function share(run: Run, cabinet: StoredCabinet): void {
  run.shared.heights[cabinet.form] ??= plain(cabinet.size.height);
}

/**
 * A new run of these cabinets, both ends open. Its depth and heights start as the first
 * cabinet's (of each form), its toe kick as the project's. The cabinets are moved
 * together in the list, where the first of them stands.
 */
export function createRun(project: Project, cabinetIds: Id[], name?: string): Run {
  const context = contextOf(project);
  const members = storedCases(context).filter((c) => cabinetIds.includes(c.id));
  if (members.length === 0) throw new Error('A run needs a cabinet.');
  if (new Set(members.map((c) => runKindOf(c.form))).size > 1) throw new Error('A run holds cabinets on the floor or cabinets on the wall, not both.');
  for (const run of context.runs) run.cabinetIds = run.cabinetIds.filter((id) => !cabinetIds.includes(id));
  let n = 1;
  while (context.runs.some((r) => r.id === `run-${n}`)) n++;
  const run: Run = {
    id: `run-${n}`,
    name: name ?? (runKindOf(members[0]!.form) === 'wall' ? `Wall run ${n}` : `Run ${n}`),
    cabinetIds: members.map((c) => c.id),
    ends: { left: 'open', right: 'open' },
    shared: { depth: plain(members[0]!.size.depth), toeKick: plain(context.settings.toeKick), heights: {} },
  };
  for (const cabinet of members) share(run, cabinet);
  context.runs.push(run);
  gather(context, run);
  tidy(context);
  return context.runs.find((r) => r.id === run.id)!;
}

/** Moves the run's cabinets together in the project's list, where the first of them stands, keeping their order. */
function gather(context: DesignedCabinetContext, run: Run): void {
  const at = context.pieces.findIndex((c) => run.cabinetIds.includes(c.id));
  if (at < 0) return;
  const members = storedCases(context).filter((c) => run.cabinetIds.includes(c.id));
  const before = context.pieces.slice(0, at).filter((c) => !run.cabinetIds.includes(c.id));
  const after = context.pieces.slice(at).filter((c) => !run.cabinetIds.includes(c.id));
  context.pieces = [...before, ...members, ...after];
}

/** Puts a cabinet at the right-hand end of a run (taking it out of the one it was in). */
export function addToRun(project: Project, runId: Id, cabinetId: Id): void {
  const context = contextOf(project);
  const run = context.runs.find((r) => r.id === runId);
  const cabinet = storedCases(context).find((c) => c.id === cabinetId);
  if (!run || !cabinet) throw new Error(`Run or cabinet not found: ${runId}, ${cabinetId}`);
  const first = runCabinets(context, run)[0];
  if (first && runKindOf(first.form) !== runKindOf(cabinet.form)) throw new Error('A run holds cabinets on the floor or cabinets on the wall, not both.');
  for (const other of context.runs) other.cabinetIds = other.cabinetIds.filter((id) => id !== cabinetId);
  // After the run's last cabinet in the list, so it stands at the right-hand end.
  context.pieces = context.pieces.filter((c) => c.id !== cabinetId);
  const lastId = run.cabinetIds.filter((id) => id !== cabinetId).at(-1);
  const to = lastId ? context.pieces.findIndex((c) => c.id === lastId) + 1 : context.pieces.length;
  context.pieces.splice(to, 0, cabinet);
  run.cabinetIds.push(cabinetId);
  share(run, cabinet);
  tidy(context);
}

/** Takes a cabinet out of its run: it has its own depth, height, toe kick and sides again. A run left empty is gone. */
export function removeFromRun(project: Project, cabinetId: Id): void {
  const context = contextOf(project);
  for (const run of context.runs) run.cabinetIds = run.cabinetIds.filter((id) => id !== cabinetId);
  tidy(context);
}

/** Dissolves a run: its cabinets stand on their own again. */
export function deleteRun(project: Project, runId: Id): void {
  const context = contextOf(project);
  context.runs = context.runs.filter((r) => r.id !== runId);
}

/** Call after the project's cabinet list changed (a cabinet deleted or moved): the runs follow it. */
export function tidyRuns(project: Project): void {
  if (project.context.kind === 'designedCabinet') tidy(project.context);
}
