/**
 * Paint and stain: what a project is finished in, for the picture and for the lists.
 * A finish changes nothing that is cut. The project names one for each of three
 * groups of parts: the case (with its face frame, shelves and back), the fronts (doors
 * and drawer fronts) and wooden handles. A group with none is left as its material.
 *
 * Paint covers the wood: its colour is the part's colour, and the grain does not show.
 * Stain colours the wood and leaves its grain showing.
 */
import type { Finish, InsideFinish, Project, ProjectFinish, Shop } from '@/model';
import { SQ_FT_A_QUART } from '@/libraries/finishes';
import { designsOf } from './frontSettings';
import { cabinetsOf } from './settings';

export type FinishGroup = 'case' | 'fronts' | 'handles' | 'tops';

/** The keys of a project's finish that name a paint or a stain, one a group. */
type FinishKey = 'caseId' | 'frontsId' | 'handlesId' | 'topsId';

/** The answers for what is seen only with a door or a drawer open. */
export const INSIDE_FINISHES: { title: string; value: InsideFinish }[] = [
  { title: 'Bare', value: 'bare' },
  { title: 'Prefinished sheet: nothing to do', value: 'prefinished' },
  { title: 'A clear coat', value: 'clear' },
  { title: "The case's finish", value: 'case' },
];
/** Sets what the insides (`inside`) or the drawer boxes (`boxes`) get; bare is the value left out. */
export function setInsideFinish(project: Pick<Project, 'settings'>, key: 'inside' | 'boxes', value: InsideFinish): void {
  const finish: ProjectFinish = { ...project.settings.finish };
  if (value === 'bare') delete finish[key];
  else finish[key] = value;
  if (Object.keys(finish).length) project.settings.finish = finish;
  else delete project.settings.finish;
}

export const FINISH_GROUPS: { group: FinishGroup; key: FinishKey; title: string }[] = [
  { group: 'case', key: 'caseId', title: 'Case' },
  { group: 'fronts', key: 'frontsId', title: 'Doors and drawer fronts' },
  { group: 'handles', key: 'handlesId', title: 'Wooden handles' },
  // Milestone 7: the countertops made here.
  { group: 'tops', key: 'topsId', title: 'Countertops' },
];

/** A paint or a stain: what a group of parts is finished in. A clear coat and a primer go with one, and have no colour. */
export const isColour = (finish: Pick<Finish, 'kind'>): boolean => finish.kind === 'paint' || finish.kind === 'stain';

/** The project's finishes, by group: only the groups that have one the shop profile still knows. */
export function finishesOf(project: Pick<Project, 'settings'>, shop: Pick<Shop, 'finishes'>): Partial<Record<FinishGroup, Finish>> {
  const out: Partial<Record<FinishGroup, Finish>> = {};
  for (const { group, key } of FINISH_GROUPS) {
    const finish = (shop.finishes ?? []).find((f) => f.id === project.settings.finish?.[key] && isColour(f));
    if (finish) out[group] = finish;
  }
  return out;
}

/** The shop's clear coats: one is the project's. */
export const clearCoats = (shop: Pick<Shop, 'finishes'>): Finish[] => (shop.finishes ?? []).filter((f) => f.kind === 'clear');

/**
 * The project's one clear coat, over its stains and on what is clear coated inside: the one it names, else the
 * shop's first. None when the shop profile has no clear coat.
 */
export function clearCoatOf(project: Pick<Project, 'settings'>, shop: Pick<Shop, 'finishes'>): Finish | undefined {
  const all = clearCoats(shop);
  return all.find((f) => f.id === project.settings.finish?.clearId) ?? all[0];
}

/** Names the project's clear coat; the shop's first is the value left out. */
export function setClearCoat(project: Pick<Project, 'settings'>, shop: Pick<Shop, 'finishes'>, id: string | undefined): void {
  const finish: ProjectFinish = { ...project.settings.finish };
  if (id && id !== clearCoats(shop)[0]?.id) finish.clearId = id;
  else delete finish.clearId;
  if (Object.keys(finish).length) project.settings.finish = finish;
  else delete project.settings.finish;
}

/** The primer under the project's paints: the shop's first (one for the shop; a project does not choose). */
export const primerOf = (shop: Pick<Shop, 'finishes'>): Finish | undefined => (shop.finishes ?? []).find((f) => f.kind === 'primer');

/** Whether anything in the project is clear coated on its own: the insides, the drawer boxes, or one cabinet's inside. */
function clearInside(project: Pick<Project, 'settings'> & Partial<Pick<Project, 'context'>>): boolean {
  const own = project.context?.kind === 'designedCabinet' ? cabinetsOf(project as Project).some((c) => c.insideFinish === 'clear') : false;
  return project.settings.finish?.inside === 'clear' || project.settings.finish?.boxes === 'clear' || own;
}

/**
 * Every product the project's finish takes: the paints and stains of its groups, then the clear coat where a
 * stain has coats of it over it or an inside is clear coated, then the primer where a paint has coats of it under.
 */
export function finishesUsed(project: Pick<Project, 'settings'> & Partial<Pick<Project, 'context'>>, shop: Pick<Shop, 'finishes'>): Finish[] {
  const chosen = [...new Set(Object.values(finishesOf(project, shop)))];
  const clear = clearCoatOf(project, shop);
  const primer = primerOf(shop);
  const needsClear = clearInside(project) || chosen.some((f) => f.kind === 'stain' && (f.clearCoats ?? 0) > 0);
  const needsPrimer = chosen.some((f) => f.kind === 'paint' && (f.primerCoats ?? 0) > 0);
  return [...chosen, ...(clear && needsClear ? [clear] : []), ...(primer && needsPrimer ? [primer] : [])];
}

const coatWords = (n: number, of: string, first: boolean) => `${n} ${first ? (n === 1 ? 'coat of ' : 'coats of ') : 'of '}${of}`;

/**
 * A finish's coats in words, in the order they go on: "1 coat of primer, 2 of paint"; "1 coat of stain, 3 of
 * Polyurethane" with the project's clear coat named (`clear`), "of a clear coat" without.
 */
export function coatsWords(finish: Finish, clear?: Pick<Finish, 'name'>): string {
  const parts: [number, string][] =
    finish.kind === 'paint'
      ? [[finish.primerCoats ?? 0, 'primer'], [finish.coats, 'paint']]
      : finish.kind === 'stain'
        ? [[finish.coats, 'stain'], [finish.clearCoats ?? 0, clear?.name ?? 'a clear coat']]
        : [[finish.coats, finish.kind === 'clear' ? 'it where it is the whole finish' : 'it under a paint that is not its own']];
  const said = parts.filter(([n]) => n > 0);
  return said.map(([n, of], i) => coatWords(n, of, i === 0)).join(', ');
}

/** A coverage as it is shown: square feet a quart where sizes are in inches, m² a litre in mm. Stored in m² a litre. */
export const coverageUnit = (sizes: 'in' | 'mm'): string => (sizes === 'in' ? 'sq ft a quart' : 'm² a litre');
export const coverageShown = (coverage: number, sizes: 'in' | 'mm'): number => (sizes === 'in' ? Math.round(coverage / SQ_FT_A_QUART) : Math.round(coverage * 10) / 10);
export const coverageStored = (shown: number, sizes: 'in' | 'mm'): number => (sizes === 'in' ? shown * SQ_FT_A_QUART : shown);

/** Chooses a group's finish, or none. */
export function setFinish(project: Pick<Project, 'settings'>, group: FinishGroup, finishId: string | undefined): void {
  const key = FINISH_GROUPS.find((g) => g.group === group)!.key;
  const finish = { ...project.settings.finish };
  if (finishId) finish[key] = finishId;
  else delete finish[key];
  if (Object.keys(finish).length) project.settings.finish = finish;
  else delete project.settings.finish;
}

/**
 * The groups a stain is chosen for although some of their parts are of a material with no grain
 * (MDF): MDF is painted, not stained. The fronts' material is each door
 * set's and drawer front's; the case's each cabinet's.
 */
export function stainedWithoutGrain(project: Project, shop: Pick<Shop, 'finishes'>): FinishGroup[] {
  const chosen = finishesOf(project, shop);
  const grainless = (id: string) => project.materials.find((m) => m.id === id)?.hasGrain === false;
  const cabinets = project.context.kind === 'designedCabinet' ? cabinetsOf(project) : [];
  // In the inset style a door is its own slab (`shop`), and a drawer's front is its box's front wall unless it is applied.
  const fronts = designsOf(project).map((d) => {
    const cabinet = cabinets.find((c) => d.mounting.openingId.startsWith(`${c.id}/`));
    if (cabinet?.construction !== 'shop') return d.template === 'drawer' ? d.front.materialId : d.materialId;
    if (d.template !== 'drawer') return d.shop?.materialId ?? cabinet.materials.caseId;
    const kind = d.shop?.front ?? 'wide';
    return kind === 'applied' ? d.front.materialId : kind === 'wide' ? (d.shop?.frontMaterialId ?? cabinet.materials.caseId) : d.box.materials.boxId;
  });
  const cases = cabinets.map((c) => c.materials.caseId);
  const out: FinishGroup[] = [];
  if (chosen.fronts?.kind === 'stain' && fronts.some(grainless)) out.push('fronts');
  if (chosen.case?.kind === 'stain' && cases.some(grainless)) out.push('case');
  return out;
}

/** `#rrggbb` as a number; undefined when it is not a colour. */
export function colorNumber(color: string): number | undefined {
  return /^#[0-9a-f]{6}$/i.test(color) ? parseInt(color.slice(1), 16) : undefined;
}

/** How much of a stain's colour shows over the wood under it. */
const STAIN_STRENGTH = 0.72;

/**
 * The colour a part is drawn in: its material's own (`base`) with no finish, the
 * paint's under paint, and the wood's taken most of the way to the stain's under stain,
 * so a pale wood and a dark one still differ a little.
 */
export function finishedColor(base: number, finish: Finish | undefined): number {
  const colour = finish ? colorNumber(finish.color) : undefined;
  if (!finish || colour === undefined) return base;
  if (finish.kind === 'paint') return colour;
  const mix = (shift: number) => Math.round(((base >> shift) & 255) * (1 - STAIN_STRENGTH) + ((colour >> shift) & 255) * STAIN_STRENGTH);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Whether the wood's grain shows through the finish: not through paint. */
export const showsGrain = (finish: Finish | undefined): boolean => finish?.kind !== 'paint';
