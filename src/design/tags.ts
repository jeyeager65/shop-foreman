/**
 * Cabinet tags: a letter for each cabinet of a project, in list order (A, B, C ...).
 * Derived, never stored. Part names stay as they are ("Left side"); the tag goes in
 * front wherever a part is named beside the parts of other cabinets ("B · Left
 * side"), and on its label ("B-C1"). A project with one cabinet, made once, has no
 * tags: there is nothing to tell apart.
 *
 * Quantity: a cabinet made more than once has every part once per copy, with the
 * copy's number behind the tag ("B2 · Left side", "B2-C1").
 */
import type { CabinetOwn, Id, Part, Project } from '@/model';
import { cabinetsOf, framesOf, piecesOf } from './settings';

/** A, B ... Z, AA, AB ... */
export function tagLetters(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** How many of a cabinet are made: its quantity, at least 1. */
export const copiesOf = (cabinet: Pick<CabinetOwn, 'quantity'>) => Math.max(1, Math.floor(Number(cabinet.quantity)) || 1);

/** The tag of each cabinet, by its id. Empty when the project makes one cabinet, once. */
export function cabinetTags(project: Project): Map<Id, string> {
  // Every piece, of any kind, in the project's order: a cabinet's copies are what it is made as
  // where it stands (one in a run), a table's its own quantity.
  const made = madeOf(project);
  const total = [...made.values()].reduce((n, copies) => n + copies, 0);
  return new Map(total > 1 ? [...made.keys()].map((id, i) => [id, tagLetters(i)]) : []);
}

/** How many of each piece are made, by its id, in the project's order. */
function madeOf(project: Project): Map<Id, number> {
  const cabinets = new Map(cabinetsOf(project).map((c) => [c.id, copiesOf(c)]));
  return new Map(piecesOf(project).map((p) => [p.id, cabinets.get(p.id) ?? copiesOf(p)]));
}

/** A part's id without its copy: `cabinet-1~2/bottom` is `cabinet-1/bottom`. Plan choices are stored under it, so they apply to every copy. */
export const baseId = (id: Id) => id.replace(/~\d+(?=\/|$)/, '');
const copyId = (id: Id, copy: number) => {
  const at = id.indexOf('/');
  return at < 0 ? `${id}~${copy}` : `${id.slice(0, at)}~${copy}${id.slice(at)}`;
};

/**
 * The cabinet a part belongs to, from the part's id or its design object's id: a case
 * part's is the cabinet's id, a front's or a drawer box's is that of a door set or
 * drawer on one of the cabinet's openings.
 */
export function cabinetIdOf(project: Project): (id: Id) => Id | undefined {
  const owner = new Map<Id, Id>([...cabinetsOf(project), ...framesOf(project)].map((c) => [c.id, c.id]));
  for (const front of project.designObjects) {
    const cabinetId = front.mounting.openingId.split('/')[0]!;
    if (owner.has(cabinetId)) owner.set(front.id, cabinetId);
  }
  return (id) => owner.get(baseId(id).split('/')[0]!);
}

/**
 * The parts with their cabinet's tag, when the project has tags, and once for every
 * copy of a cabinet that is made more than once: a cabinet's first copy, then its
 * second, each in the order the parts came in.
 */
export function withTags(project: Project, parts: Part[]): Part[] {
  const tags = cabinetTags(project);
  if (tags.size === 0) return parts;
  const cabinetOf = cabinetIdOf(project);
  const quantity = madeOf(project);
  const out: Part[] = [];
  const done = new Set<Id>();
  parts.forEach((part, at) => {
    const cabinetId = cabinetOf(part.designObjectId);
    const tag = tags.get(cabinetId ?? '');
    const copies = quantity.get(cabinetId ?? '') ?? 1;
    if (!tag || copies === 1) return void out.push(tag ? { ...part, tag } : part);
    // The first part of a cabinet that is made several times brings all of them, copy by copy.
    if (done.has(cabinetId!)) return;
    done.add(cabinetId!);
    const own = parts.slice(at).filter((p) => cabinetOf(p.designObjectId) === cabinetId);
    for (let copy = 1; copy <= copies; copy++) out.push(...own.map((p) => ({ ...p, id: copy === 1 ? p.id : copyId(p.id, copy), tag, copy })));
  });
  return out;
}

/** A name with its cabinet's tag in front: "B · Left side". */
export const tagged = (name: string, tag?: string) => (tag ? `${tag} · ${name}` : name);

/** A part's tag with its copy's number: "B", or "B2" when its cabinet is made more than once. */
export const partTag = (part: Pick<Part, 'tag' | 'copy'>) => (part.tag ? `${part.tag}${part.copy ?? ''}` : undefined);

/** The part's name as it is shown beside the parts of other cabinets. */
export const partTitle = (part: Pick<Part, 'name' | 'tag' | 'copy'>) => tagged(part.name, partTag(part));
