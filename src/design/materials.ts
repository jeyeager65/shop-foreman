/**
 * The project's materials (milestone 5): copies taken from the shop's material
 * catalog when first chosen, holding the measured thickness of what was bought for this
 * project. Everything derived reads these; the catalog only saves retyping.
 */
import { nominalText } from '@/units';
import type { DoorSettings, DrawerSettings, Hardware, Id, Material, Project } from '@/model';
import { designsOf, splitFront } from './frontSettings';
import { cabinetsOf } from './settings';
import { STARTER_MATERIALS } from '@/libraries/materials';

/**
 * Copies a catalog entry into the project, unless the project has it already, and
 * returns the project's copy. The copy keeps the entry's id, which the bits' settings
 * are keyed by. Undefined when neither has it.
 */
export function addMaterialFromCatalog(project: Pick<Project, 'materials'>, catalog: Material[], id: Id): Material | undefined {
  const own = project.materials.find((m) => m.id === id);
  if (own) return own;
  // The shop's catalog first; then what comes with the app, for a shop profile saved before the entry was added
  // (square stock), which so needs nothing done to it.
  const entry = catalog.find((m) => m.id === id) ?? STARTER_MATERIALS.find((m) => m.id === id);
  if (!entry) return undefined;
  // A plain copy: the catalog may be Vue's reactive proxy, which structuredClone refuses.
  const copy = JSON.parse(JSON.stringify(entry)) as Material;
  project.materials.push(copy);
  return copy;
}

/** A material as a picker or a list names it: its nominal thickness, in the unit it was given in, and its name. */
export function materialTitle(material: Material, _length?: (mm: number) => string): string {
  return `${nominalText(material.nominalThickness)} ${material.name}`;
}

/**
 * Every material the project's values name: its fronts and their shared settings, its
 * cabinets, the plan's blank, and the stock of the wooden handles its fronts use. These
 * are the materials a project cannot do without.
 */
export function materialIdsOf(project: Project, hardware: Hardware[] = []): Id[] {
  const designs = designsOf(project);
  const shared = project.context.fronts;
  const doors: DoorSettings[] = [...designs.filter((d) => d.template === 'doorSet').map((d) => splitFront(d).settings as DoorSettings), shared.doors];
  const drawers: DrawerSettings[] = [...designs.filter((d) => d.template === 'drawer').map((d) => splitFront(d).settings as DrawerSettings), shared.drawers];
  const handles = new Set(designs.map((d) => d.handle?.handleId));
  const wooden = hardware.flatMap((h) => (h.kind === 'handle' && h.cnc && handles.has(h.id) ? [h.cnc.materialId] : []));
  return [
    ...new Set([
      project.plan.blank.materialId,
      ...doors.flatMap((d) => [d.materialId, ...(d.shop ? [d.shop.materialId] : [])]),
      ...drawers.flatMap((d) => [d.front.materialId, d.materials.boxId, d.materials.bottomId, ...(d.shop?.frontMaterialId ? [d.shop.frontMaterialId] : [])]),
      ...cabinetsOf(project).flatMap((c) => [c.materials.caseId, c.materials.backId, c.faceFrame.materialId]),
      ...wooden,
    ]),
  ];
}
