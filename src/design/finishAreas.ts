/**
 * How much finish a project takes, and what is said of it in Build's checklist: a rough area to cover.
 *
 * The area is rough on purpose: a face is its part's width by its height, with nothing taken off for a shaker
 * panel's recess, a cutout or a shaped outline, and nothing added for a profile. Edges go by what the part is:
 * a front, a handle and a top all round; a face frame's member along its two long edges; any other part along
 * the one long edge that is in the case's front.
 */
import type { CabinetDesign, Finish, Part, Project, Shop } from '@/model';
import { FINISH_GROUPS, type FinishGroup, clearCoatOf, coatsWords, finishesOf, primerOf } from './finish';
import { faceFinishes, insideFinishOf, type FaceFinish } from './finishFaces';

/** One thing a finish goes on: its area in m², and how many coats of the finish it gets there. */
export interface FinishUse {
  what: string;
  area: number;
  coats: number;
}
/** A finish to buy: where it goes, and the litres all its coats take. */
export interface FinishAmount {
  finish: Finish;
  uses: FinishUse[];
  litres: number;
}

type Where = FinishGroup | 'inside' | 'boxes';
const WHERE: Record<Where, string> = {
  ...(Object.fromEntries(FINISH_GROUPS.map((g) => [g.group, g.title])) as Record<FinishGroup, string>),
  inside: 'Insides of the cases',
  boxes: 'Drawer boxes',
};

/** The group whose finish a part's showing faces take. */
function groupOf(part: Pick<Part, 'role'>): FinishGroup {
  if (part.role === 'top' || part.role === 'topEdge') return 'tops';
  if (part.role === 'handle') return 'handles';
  return !part.role || part.role === 'boxFront' ? 'fronts' : 'case';
}

const MM2 = 1e-6;
/** The area of a part's edges that are finished when its edges are, in m². */
function edgeArea(part: Pick<Part, 'role' | 'size'>): number {
  const { width, height, thickness } = part.size;
  const long = Math.max(width, height);
  const length = !part.role || ['handle', 'top', 'topEdge'].includes(part.role) ? 2 * (width + height) : part.role === 'frameStile' || part.role === 'frameRail' || part.role === 'leg' ? 2 * long : long;
  return length * thickness * MM2;
}

/**
 * The finishes the parts take, each with where it goes and how much of it: the paints and stains of the groups,
 * then the project's clear coat (over its stains, and where an inside is clear coated), then the primer under
 * its paints. `parts`: what is being made (a batch's parts give a batch's amounts). A finish with nothing to go
 * on is left out.
 */
export function finishAmounts(project: Project, shop: Pick<Shop, 'finishes'>, parts: Part[]): FinishAmount[] {
  const made = parts.filter((p) => !p.existing);
  const faces = faceFinishes(project, made);
  // The area of each place, by what it gets there: its group's finish, the case's finish, the clear coat.
  const areas = new Map<string, number>();
  const add = (where: Where, as: FaceFinish, area: number) => as !== 'none' && areas.set(`${where}:${as}`, (areas.get(`${where}:${as}`) ?? 0) + area);
  for (const part of made) {
    const f = faces[part.id];
    if (!f) continue;
    const face = part.size.width * part.size.height * MM2;
    const within: Where = part.role?.startsWith('box') ? 'boxes' : 'inside';
    for (const [as, area] of [[f.A, face], [f.B, face], [f.edges, edgeArea(part)]] as [FaceFinish, number][]) add(as === 'shown' ? groupOf(part) : within, as, area);
  }
  const area = (where: Where, as: FaceFinish) => areas.get(`${where}:${as}`) ?? 0;
  const chosen = finishesOf(project, shop);

  // What each paint and stain goes on: its groups, and the insides and the boxes where they take the case's.
  const colours = new Map<Finish, FinishUse[]>();
  const uses = (finish: Finish) => colours.get(finish) ?? colours.set(finish, []).get(finish)!;
  for (const { group } of FINISH_GROUPS) {
    const finish = chosen[group];
    if (finish && area(group, 'shown') > 0) uses(finish).push({ what: WHERE[group], area: area(group, 'shown'), coats: finish.coats });
  }
  for (const where of ['inside', 'boxes'] as const) {
    if (chosen.case && area(where, 'case') > 0) uses(chosen.case).push({ what: WHERE[where], area: area(where, 'case'), coats: chosen.case.coats });
  }

  const amount = (finish: Finish, its: FinishUse[]): FinishAmount => ({ finish, uses: its, litres: its.reduce((n, u) => n + u.area * u.coats, 0) / finish.coverage });
  const out = [...colours].map(([finish, its]) => amount(finish, its));
  // Under and over them: each paint's primer, each stain's clear coat, over all the paint or the stain covers.
  const covered = (its: FinishUse[]) => its.reduce((n, u) => n + u.area, 0);
  const clear = clearCoatOf(project, shop);
  if (clear) {
    const its: FinishUse[] = [...colours].filter(([f]) => f.kind === 'stain' && (f.clearCoats ?? 0) > 0).map(([f, u]) => ({ what: `Over ${f.name}`, area: covered(u), coats: f.clearCoats! }));
    for (const where of ['inside', 'boxes'] as const) if (area(where, 'clear') > 0) its.push({ what: WHERE[where], area: area(where, 'clear'), coats: clear.coats });
    if (its.length) out.push(amount(clear, its));
  }
  const primer = primerOf(shop);
  if (primer) {
    const its: FinishUse[] = [...colours].filter(([f]) => f.kind === 'paint' && (f.primerCoats ?? 0) > 0).map(([f, u]) => ({ what: `Under ${f.name}`, area: covered(u), coats: f.primerCoats! }));
    if (its.length) out.push(amount(primer, its));
  }
  return out;
}

/** Litres in a US quart: what a can is counted in where sizes are in inches. */
const QUART = 0.946352946;
const SQ_FT = 0.09290304;
/** An area in words, in the shop's unit for sizes: whole square feet, or m² to one place. */
export const areaWords = (m2: number, sizes: 'in' | 'mm'): string => (sizes === 'in' ? `${Math.max(1, Math.round(m2 / SQ_FT))} sq ft` : `${Math.max(0.1, Math.round(m2 * 10) / 10)} m²`);
/** An amount rounded up to what is bought: whole quarts, or whole litres. */
export const cansOf = (litres: number, sizes: 'in' | 'mm'): { quantity: number; unit: string } => {
  const quantity = Math.max(1, Math.ceil((sizes === 'in' ? litres / QUART : litres) - 1e-9));
  return { quantity, unit: sizes === 'in' ? (quantity === 1 ? 'quart' : 'quarts') : quantity === 1 ? 'litre' : 'litres' };
};
/** Where a finish goes, in a line: "Case: 38 sq ft, 2 coats; Drawer boxes: 12 sq ft, 2 coats". */
export const usesWords = (amount: FinishAmount, sizes: 'in' | 'mm'): string =>
  amount.uses.map((u) => `${u.what}: ${areaWords(u.area, sizes)}, ${u.coats} ${u.coats === 1 ? 'coat' : 'coats'}`).join('; ');

const ON: Record<FinishGroup, string> = { case: 'the case where it shows with the doors shut', fronts: 'the doors and drawer fronts', handles: 'the wooden handles', tops: 'the tops' };

/**
 * What Build's checklist says of finishing a cabinet (the project's first, or `cabinet`): what gets which finish
 * and its coats, what the inside and the drawer boxes get, and what is left bare. Empty when the project has no
 * finish and nothing is asked of the insides: the checklist then says what it always said.
 */
export function finishSteps(project: Project, shop: Pick<Shop, 'finishes'>, cabinet?: Pick<CabinetDesign, 'insideFinish'>, has: { boxes?: boolean; handles?: boolean } = {}): string[] {
  const chosen = finishesOf(project, shop);
  const inside = insideFinishOf(project, cabinet);
  const boxes = has.boxes ? (project.settings.finish?.boxes ?? 'bare') : 'bare';
  const groups = (['case', 'fronts', 'handles'] as const).filter((g) => chosen[g] && (g !== 'handles' || has.handles));
  if (!groups.length && inside === 'bare' && boxes === 'bare') return [];
  const clear = clearCoatOf(project, shop);
  const out: string[] = [];
  // One sentence a finish, with everything it goes on.
  for (const finish of new Set(groups.map((g) => chosen[g]!))) {
    const on = groups.filter((g) => chosen[g] === finish).map((g) => ON[g]);
    out.push(`Finish ${on.join(' and ')}: ${finish.name}, ${coatsWords(finish, clear)}.`);
  }
  const within = (answer: typeof inside, what: string, plural: boolean): string => {
    const be = plural ? 'are' : 'is';
    if (answer === 'prefinished') return `${what} ${be} prefinished: nothing to do, but keep the finish off ${plural ? 'them' : 'it'}.`;
    if (answer === 'clear' && clear) return `${what}: ${clear.name}, ${clear.coats} ${clear.coats === 1 ? 'coat' : 'coats'}.`;
    if (answer === 'case' && chosen.case) return `${what}: ${chosen.case.name} too.`;
    return `${what} ${plural ? 'stay' : 'stays'} bare.`;
  };
  const rest = [within(inside, 'The inside of the case', false), ...(has.boxes ? [within(boxes, 'The drawer boxes', true)] : [])];
  out.push(rest.join(' '));
  out.push('Leave bare what is never seen: the rear face of a back against a wall, a side against a wall or a neighbour, the top face under a countertop, the stretchers.');
  return out;
}
