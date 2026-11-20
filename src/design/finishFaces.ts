/**
 * Which faces of a part are finished: the front and sides of a face frame are painted, a back that is not seen is
 * not, unless it shows, as on a peninsula or an island. Every face is one of three things, worked out from
 * what the part is and where its cabinet stands, never stored:
 *
 * - `shows`: seen with the doors shut. It gets its group's finish.
 * - `inside`: seen with a door or a drawer open. It gets the inside's answer.
 * - `hidden`: never seen. It gets nothing.
 *
 * A cabinet with nothing hung on it is open: its inside shows, and so does a wall cabinet's
 * underside.
 */
import type { CabinetDesign, Id, InsideFinish, Part, Project } from '@/model';
import { islandOf } from './room';
import { runOf } from './runs';
import { cabinetsOf } from './settings';
import { kickBoardOf } from './style';
import { cabinetIdOf } from './tags';

export type FaceShows = 'shows' | 'inside' | 'hidden';

/** A part's two faces (as `partFaces` names them) and its edges, taken together: the best seen of them. */
export interface PartShows {
  A: FaceShows;
  B: FaceShows;
  edges: FaceShows;
}

/** What of a cabinet decides which of its faces show. */
export interface CabinetShows {
  form: CabinetDesign['form'];
  /** A face frame covers the case's front edges; without one they show. */
  framed: boolean;
  /** Each side's outside: showing, or against a wall or a neighbour. */
  sides: { left: boolean; right: boolean };
  /** Nothing is hung on it: no door, no drawer. Its inside shows. */
  open: boolean;
  /** Its back is to the room: it stands free, or is the one row of an island. */
  backShows: boolean;
  /** Its toe kick board stands in front of its sides (`toeKick.board`): the board's ends are seen beside a side that shows. */
  kickAhead?: boolean;
  /** It stands on corner posts: its back members are at the posts' rear faces (`postsBack`), seen where its back is. */
  posts?: boolean;
}

/** How a cabinet stands, for its faces. */
export function cabinetShows(project: Project, cabinet: CabinetDesign): CabinetShows {
  const context = project.context;
  const run = runOf(context, cabinet.id);
  const island = run ? islandOf(context, run.id) : undefined;
  // Two rows of an island stand back to back; a run or a cabinet placed free has its back to the room.
  const free = island ? island.rows.length === 1 : (run ? run.placement : cabinet.placement)?.wall === 'free';
  return {
    form: cabinet.form,
    framed: cabinet.construction === 'faceFrame',
    sides: { left: cabinet.sides.left === 'exposed', right: cabinet.sides.right === 'exposed' },
    // A row with its doors off shows the inside too: the whole inside is then finished as what shows.
    open: !project.designObjects.some((d) => d.mounting.openingId.startsWith(`${cabinet.id}/`)) || cabinet.layout.rows.some((r) => r.open) || !!cabinet.layout.bays?.some((b) => b.open),
    backShows: free,
    kickAhead: ['inFront', 'acrossRun'].includes(kickBoardOf(cabinet)),
    ...(cabinet.toeKick.legs?.posts ? { posts: true } : {}),
  };
}

const ALL = (shows: FaceShows): PartShows => ({ A: shows, B: shows, edges: shows });

/**
 * Which faces of a part show. `cabinet`: how its cabinet stands; left out for a part that belongs to none (a top,
 * a handle). `showFront`: a drawer box's front that is the drawer's front (a shop drawer with no applied front).
 */
export function partShows(part: Pick<Part, 'id' | 'role'>, cabinet?: CabinetShows, showFront = false): PartShows {
  const role = part.role;
  // A stool drawn at an island's seating side: seen all round, in the top's finish.
  if (part.id.includes('/stool-')) return ALL('shows');
  // A door, a drawer front, a wooden handle: seen all round.
  if (!role || role === 'handle') return ALL('shows');
  const inside: FaceShows = cabinet?.open ? 'shows' : 'inside';
  // The case's front edges show where no face frame covers them.
  const frontEdge: FaceShows = cabinet?.framed ? 'hidden' : 'shows';
  switch (role) {
    case 'side': {
      const left = /side-left|left/i.test(part.id.split('/').pop() ?? '');
      const out = cabinet ? (left ? cabinet.sides.left : cabinet.sides.right) : true;
      return { A: inside, B: out ? 'shows' : 'hidden', edges: frontEdge };
    }
    case 'partition':
      return { A: inside, B: inside, edges: frontEdge };
    case 'bottom':
      // A wall cabinet's underside is seen from below.
      return { A: inside, B: cabinet?.form === 'wall' ? 'shows' : 'hidden', edges: frontEdge };
    case 'stretcher':
      // A wall or a tall cabinet's top: its underside is its inside. The front stretcher is the same under a
      // countertop: its front edge is in the case's front, over the top drawer, and on a frameless cabinet it shows.
      // The other stretchers and the hanging rails are never seen.
      return part.id.endsWith('/top') || part.id.endsWith('/stretcher-front') ? { A: 'hidden', B: inside, edges: frontEdge } : ALL('hidden');
    case 'back':
      return { A: inside, B: cabinet?.backShows ? 'shows' : 'hidden', edges: 'hidden' };
    case 'shelf':
    case 'pullOut':
      return ALL(inside);
    case 'toeKick':
      // In front of the sides its ends are in the plane of the sides' outsides: seen where a side shows.
      return { A: 'shows', B: 'hidden', edges: cabinet?.kickAhead && (cabinet.sides.left || cabinet.sides.right) ? 'shows' : 'hidden' };
    case 'filler':
      // An island's finished back stands over the row's backs: its ends are seen beside the end cabinets' sides
      // and are finished.
      if (/\/island-back(-\d+)?$/.test(part.id)) return { A: 'shows', B: 'hidden', edges: 'shows' };
      return { A: 'shows', B: 'hidden', edges: 'hidden' };
    case 'blindPanel':
      return { A: 'shows', B: 'hidden', edges: 'hidden' };
    case 'frameStile':
    case 'frameRail':
    case 'caseEdge':
      // Its front and its edges; not the back, which lies on the case.
      return { A: 'shows', B: 'hidden', edges: 'shows' };
    case 'boxFront':
      return showFront ? { A: 'inside', B: 'shows', edges: 'shows' } : ALL('inside');
    case 'boxSide':
    case 'boxBack':
    case 'boxBottom':
      return ALL('inside');
    case 'top':
    case 'topEdge':
      return { A: 'shows', B: 'hidden', edges: 'shows' };
    case 'leg':
      // All four of its long faces.
      return ALL('shows');
    case 'apron':
      // Its outside and its lower edge; its inside is under the table.
      return { A: 'shows', B: 'hidden', edges: 'shows' };
    case 'buildOut':
    case 'runner':
    case 'cleat':
    case 'rib':
      return ALL('hidden');
  }
}

/** Which faces show, for every part given, by its id. `parts`: a project's parts, its fronts and drawer boxes among them. */
export function projectShows(project: Project, parts: Part[]): Map<Id, PartShows> {
  const cabinetOf = cabinetIdOf(project);
  const standing = new Map(cabinetsOf(project).map((c) => [c.id, cabinetShows(project, c)]));
  // A drawer box's front is the drawer's front where no front is applied over it.
  const applied = new Set(parts.filter((p) => !p.role).map((p) => p.designObjectId));
  return new Map(parts.map((p) => [p.id, partShows(p, standing.get(cabinetOf(p.id) ?? ''), p.role === 'boxFront' && !applied.has(p.designObjectId))]));
}

/**
 * What a face is finished in: its group's own finish where it shows (`shown`: the fronts' on a door, the
 * case's on a side, the tops' on a top), the case's finish or the clear coat where the inside's answer says so,
 * else nothing.
 */
export type FaceFinish = 'shown' | 'case' | 'clear' | 'none';
export interface PartFinishes {
  A: FaceFinish;
  B: FaceFinish;
  edges: FaceFinish;
}

/** What a cabinet's inside gets: its own answer, else the project's, else bare. */
export const insideFinishOf = (project: Pick<Project, 'settings'>, cabinet?: Pick<CabinetDesign, 'insideFinish'>): InsideFinish => cabinet?.insideFinish ?? project.settings.finish?.inside ?? 'bare';

const INSIDE_AS: Record<InsideFinish, FaceFinish> = { bare: 'none', prefinished: 'none', clear: 'clear', case: 'case' };

/**
 * What every face of every part is finished in, by the part's id: where it shows, its group's finish; inside, the
 * cabinet's inside answer (a drawer box: the boxes' answer, all over); hidden, nothing.
 */
export function faceFinishes(project: Project, parts: Part[]): Record<Id, PartFinishes> {
  const cabinetOf = cabinetIdOf(project);
  const cabinets = new Map(cabinetsOf(project).map((c) => [c.id, c]));
  const boxes = INSIDE_AS[project.settings.finish?.boxes ?? 'bare'];
  const out: Record<Id, PartFinishes> = {};
  for (const [id, shows] of projectShows(project, parts)) {
    const part = parts.find((p) => p.id === id)!;
    const inside = part.role?.startsWith('box') ? boxes : INSIDE_AS[insideFinishOf(project, cabinets.get(cabinetOf(id) ?? ''))];
    const as = (face: FaceShows): FaceFinish => (face === 'shows' ? 'shown' : face === 'inside' ? inside : 'none');
    out[id] = { A: as(shows.A), B: as(shows.B), edges: as(shows.edges) };
  }
  return out;
}
