/**
 * Batches: cutting a project in parts. A batch is a selection of the project's
 * parts by three things that combine: which cabinets, which kinds of part, which materials; each left out
 * means all of it. The project keeps its batches by name (`plan.batches`) and one is the one in hand
 * (`plan.batchId`); with none in hand the job is everything, as it always was. A batch stores a
 * selection, never a part: it is a filter on the derived parts, in front of the planner.
 */
import { baseId, cabinetIdOf, cabinetsOf } from '@/design';
import type { Batch, BatchKind, CutRecord, Id, Material, Part, Project } from '@/model';

/** The kinds of part a batch can choose, in the order they are made, with their words. */
export const BATCH_KINDS: { value: BatchKind; title: string }[] = [
  { value: 'cases', title: 'Cases' },
  { value: 'faceFrames', title: 'Face frames' },
  { value: 'drawerBoxes', title: 'Drawer boxes' },
  { value: 'fronts', title: 'Doors and drawer fronts' },
  { value: 'tops', title: 'Tops' },
  { value: 'inside', title: 'What goes inside a cabinet' },
  { value: 'handles', title: 'Handles' },
];

/** What kind of part a part is, for a batch. */
export function batchKindOf(part: Pick<Part, 'id' | 'role'>): BatchKind {
  // Trays, shelves, strips and frames fitted inside a cabinet (organizers), whatever their role.
  if (part.id.includes('/sink-')) return 'inside';
  const role = part.role;
  if (!role) return 'fronts';
  if (role === 'handle') return 'handles';
  if (role === 'top' || role === 'topEdge' || role === 'rib') return 'tops';
  if (role === 'frameStile' || role === 'frameRail') return 'faceFrames';
  // A drawer box, and the strips and runners it rides on.
  if (role.startsWith('box') || role === 'buildOut' || role === 'runner') return 'drawerBoxes';
  return 'cases';
}

/** "What is left": the batch of everything not yet cut. It is not stored; it is there once something is marked cut. */
export const LEFT_BATCH_ID = 'left';
const LEFT: Batch = { id: LEFT_BATCH_ID, name: 'What is left' };

/** The batch in hand: none when the job is everything, or when the one named is gone. */
export function batchInHand(project: Pick<Project, 'plan'>): Batch | undefined {
  const id = project.plan.batchId;
  if (id === LEFT_BATCH_ID) return LEFT;
  return id ? project.plan.batches?.find((b) => b.id === id) : undefined;
}

/** Whether a part is in a batch. */
export function inBatch(batch: Batch, project: Project): (part: Part) => boolean {
  if (batch.id === LEFT_BATCH_ID) {
    const cut = project.plan.cut ?? {};
    return (part) => !cut[baseId(part.id)];
  }
  const cabinetOf = cabinetIdOf(project);
  const cabinets = batch.cabinetIds?.length ? new Set(batch.cabinetIds) : undefined;
  const kinds = batch.kinds?.length ? new Set(batch.kinds) : undefined;
  const materials = batch.materialIds?.length ? new Set(batch.materialIds) : undefined;
  return (part) => {
    if (cabinets && !cabinets.has(cabinetOf(part.id) ?? part.designObjectId)) return false;
    if (kinds && !kinds.has(batchKindOf(part))) return false;
    if (materials && !materials.has(part.materialId)) return false;
    return true;
  };
}

/**
 * Whether a batch makes the parts of a kind of a cabinet: for what is counted or said by cabinet, not by
 * part (a back's brads, hanging a wall cabinet). With no batch, always. Its materials say nothing here.
 */
export function batchWants(batch: Batch | undefined): (cabinetId: Id | undefined, kind: BatchKind) => boolean {
  return (cabinetId, kind) => !batch || batch.id === LEFT_BATCH_ID || ((!batch.cabinetIds?.length || (!!cabinetId && batch.cabinetIds.includes(cabinetId))) && (!batch.kinds?.length || batch.kinds.includes(kind)));
}

/** A batch's name as part of a file name: `doors`, `3-4-plywood`. */
export const batchSlug = (batch: Pick<Batch, 'name' | 'id'>) =>
  batch.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || batch.id;

/** The project with no batch in hand: its job is everything. */
export function wholeProject(project: Project): Project {
  const { batchId: _batchId, ...plan } = project.plan;
  return { ...project, plan };
}

/** A new batch of everything, named "Batch N", in the project and in hand. */
export function addBatch(project: Project, name?: string): Batch {
  const batches = (project.plan.batches ??= []);
  let n = batches.length + 1;
  while (batches.some((b) => b.id === `batch-${n}`)) n += 1;
  const batch: Batch = { id: `batch-${n}`, name: name?.trim() || `Batch ${n}` };
  batches.push(batch);
  project.plan.batchId = batch.id;
  return batch;
}

/** Takes a batch out of the project; the job is everything again when it was the one in hand. */
export function removeBatch(project: Project, id: Id): void {
  project.plan.batches = (project.plan.batches ?? []).filter((b) => b.id !== id);
  if (!project.plan.batches.length) delete project.plan.batches;
  if (project.plan.batchId === id) delete project.plan.batchId;
}

/** What a batch can choose from, from the whole project's parts: its cabinets, the kinds of part it has, its materials. */
export function batchChoices(project: Project, parts: Part[], materials: Material[]): { cabinets: { value: Id; title: string }[]; kinds: { value: BatchKind; title: string }[]; materials: { value: Id; title: string }[] } {
  const cabinetOf = cabinetIdOf(project);
  const owners = new Set(parts.map((p) => cabinetOf(p.id) ?? p.designObjectId));
  const kinds = new Set(parts.map(batchKindOf));
  const used = new Set(parts.map((p) => p.materialId));
  return {
    cabinets: cabinetsOf(project)
      .filter((c) => owners.has(c.id))
      .map((c) => ({ value: c.id, title: c.name })),
    kinds: BATCH_KINDS.filter((k) => kinds.has(k.value)),
    materials: materials.filter((m) => used.has(m.id)).map((m) => ({ value: m.id, title: m.name })),
  };
}

/** A batch in a line: "Vanity, Sink base · doors and drawer fronts · 3/4" MDF"; "everything" when it chooses nothing. */
export function batchWords(batch: Batch, project: Project, materials: Material[]): string {
  if (batch.id === LEFT_BATCH_ID) return 'every part not yet marked as cut';
  const cabinets = cabinetsOf(project);
  const said = [
    batch.cabinetIds?.length ? batch.cabinetIds.map((id) => cabinets.find((c) => c.id === id)?.name ?? id).join(', ') : '',
    batch.kinds?.length ? batch.kinds.map((k) => BATCH_KINDS.find((x) => x.value === k)!.title.toLowerCase()).join(', ') : '',
    batch.materialIds?.length ? batch.materialIds.map((id) => materials.find((m) => m.id === id)?.name ?? id).join(', ') : '',
  ].filter(Boolean);
  return said.length ? said.join(' · ') : 'every part of the project';
}

/** The parts of a copy of a cabinet share its base id: a selection by part speaks of that. */
export const batchPartId = (part: Pick<Part, 'id'>): Id => baseId(part.id);

/** A short digest of a value: the same value gives the same digest. Not for secrets. */
function digest(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
const rounded = (mm: number) => Math.round(mm * 100) / 100;

/** A part as the record of what is cut keeps it. */
export function cutRecordOf(part: Part, batch: string, at: string): CutRecord {
  return {
    name: part.name,
    batch,
    at,
    materialId: part.materialId,
    size: { width: rounded(part.size.width), height: rounded(part.size.height), thickness: rounded(part.size.thickness) },
    // Numbers to a hundredth of a millimetre: a part worked out again a hair differently has not changed.
    features: digest(JSON.parse(JSON.stringify(part.features, (_key, v: unknown) => (typeof v === 'number' ? rounded(v) : v)))),
  };
}

/**
 * Marks the parts of a job as cut: each is remembered as it is now, under the batch's name. A part cut
 * before is remembered anew. `at` is when (an ISO date-time).
 */
export function markCut(project: Project, parts: Part[], batchName: string, at: string): void {
  const cut = (project.plan.cut ??= {});
  for (const part of parts) cut[baseId(part.id)] = cutRecordOf(part, batchName, at);
}

/** Forgets that parts were cut (all of them when none is named): they are in "What is left" again. */
export function forgetCut(project: Project, partIds?: Id[]): void {
  if (!project.plan.cut) return;
  if (!partIds) delete project.plan.cut;
  else {
    for (const id of partIds) delete project.plan.cut[baseId(id)];
    if (!Object.keys(project.plan.cut).length) delete project.plan.cut;
  }
  // With nothing cut there is no "What is left": the job is everything again.
  if (!project.plan.cut && project.plan.batchId === LEFT_BATCH_ID) delete project.plan.batchId;
}

/** How much of the project is cut: of its parts (a cabinet made several times counted once), how many are marked. */
export function cutCount(project: Pick<Project, 'plan'>, parts: Part[]): { cut: number; all: number } {
  const ids = new Set(parts.map((p) => baseId(p.id)));
  const cut = project.plan.cut ?? {};
  return { cut: [...ids].filter((id) => cut[id]).length, all: ids.size };
}

/** A part that is not what it was when it was cut. */
export interface CutChange {
  partId: Id;
  name: string;
  /** The batch it was cut in, and when. */
  batch: string;
  at: string;
  /** What changed, each in words: its size, its material, what is cut into it; or that it is no longer in the design. */
  changes: string[];
}

/**
 * The parts that were cut and are no longer what was cut: the design changed under them. `parts`
 * is every part of the project as it is now; `length` writes a size. The app only says so: whether to cut
 * one again is the user's to decide ("forget" puts it back in what is left).
 */
export function cutChanges(project: Pick<Project, 'plan'>, parts: Part[], length: (mm: number) => string, materialName: (id: Id) => string = (id) => id): CutChange[] {
  const now = new Map(parts.map((p) => [baseId(p.id), p]));
  const out: CutChange[] = [];
  for (const [partId, was] of Object.entries(project.plan.cut ?? {})) {
    const part = now.get(partId);
    const changes: string[] = [];
    if (!part) changes.push('It is no longer in the design.');
    else {
      const is = cutRecordOf(part, was.batch, was.at);
      const size = (s: CutRecord['size']) => `${length(s.width)} × ${length(s.height)} × ${length(s.thickness)}`;
      if (is.size.width !== was.size.width || is.size.height !== was.size.height || is.size.thickness !== was.size.thickness) changes.push(`Its size: it was cut ${size(was.size)} and is now ${size(is.size)}.`);
      if (is.materialId !== was.materialId) changes.push(`Its material: it was cut from ${materialName(was.materialId)} and is now ${materialName(is.materialId)}.`);
      if (is.features !== was.features) changes.push('What is cut into it: its outline, its joints or its holes are not what was cut.');
    }
    if (changes.length) out.push({ partId, name: part?.name ?? was.name, batch: was.batch, at: was.at, changes });
  }
  return out;
}
