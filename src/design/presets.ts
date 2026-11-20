/**
 * Presets (milestone 5): a named, complete set of a project's shared values. A project
 * copies a preset's values and does not follow it; changing or deleting a preset later
 * changes no project. The built-in ones are `src/samples/presets.ts`.
 */
import { GENERIC_FRAMELESS_HINGE_ID, GENERIC_HINGE_ID, GENERIC_INSET_HINGE_ID, GENERIC_PULL_ID, GENERIC_SHELF_PIN_ID, GENERIC_SLIDE_ID } from '@/libraries';
import type { CabinetSettings, DoorHingeKey, FrontSettings, Hardware, Id, Material, Preset, Project } from '@/model';
import { isDoorSet } from './drawers';
import { existingMakesFronts } from './existing';
import { designsOf } from './frontSettings';
import { shopDoorDefaults } from './style';
import { cabinetsOf, storedCases } from './settings';
import { layoutOpeningIds } from './bays';

/** A plain deep copy: a project may be Vue's reactive proxy, which structuredClone refuses. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Every material id a preset's values name. */
export function presetMaterialIds(values: { settings?: CabinetSettings; fronts: FrontSettings }, hardware: Hardware[] = []): Id[] {
  const { doors, drawers } = values.fronts;
  const handles = new Set([doors.handle?.handleId, drawers.handle?.handleId]);
  const wooden = hardware.flatMap((h) => (h.kind === 'handle' && h.cnc && handles.has(h.id) ? [h.cnc.materialId] : []));
  const s = values.settings;
  return [
    ...new Set([
      ...(s ? [s.materials.caseId, s.materials.backId, s.faceFrame.materialId] : []),
      doors.materialId,
      ...(doors.shop ? [doors.shop.materialId] : []),
      ...(s ? [drawers.front.materialId, drawers.materials.boxId, drawers.materials.bottomId, ...(drawers.shop?.frontMaterialId ? [drawers.shop.frontMaterialId] : [])] : []),
      ...wooden,
    ]),
  ];
}

/**
 * The project's shared values as a preset: its construction settings, front settings,
 * finish and start sizes, with copies of the materials they name.
 */
export function presetFromProject(project: Project, own: { id: Id; name: string; builtIn?: boolean }, hardware: Hardware[] = []): Preset {
  const context = project.context;
  const fronts = context.fronts;
  const settings = context.settings;
  const ids = presetMaterialIds({ settings, fronts }, hardware);
  // A project whose cabinets are all already there gives a preset that starts with one to measure.
  // (A project with no cabinet in it, a table's, is not one of cabinets that are already there.)
  const existing = storedCases(context).length > 0 && storedCases(context).every((c) => c.existing);
  return plain({
    id: own.id,
    name: own.name,
    ...(own.builtIn ? { builtIn: true } : {}),
    ...(existing ? { start: 'existing' as const } : {}),
    settings,
    fronts,
    ...(project.settings.finish ? { finish: project.settings.finish } : {}),
    sizes: context.sizes,
    materials: project.materials.filter((m) => ids.includes(m.id)),
  } satisfies Preset);
}

/** The generic hinge for each of a door setting's hinge keys. */
const GENERIC_HINGES: Record<DoorHingeKey, Id> = { hingeId: GENERIC_HINGE_ID, framelessHingeId: GENERIC_FRAMELESS_HINGE_ID, shopHingeId: GENERIC_INSET_HINGE_ID };

/**
 * A copy of the preset with every hardware id the shop does not have replaced by the
 * generic entry of its kind, and every material it names but does not carry taken
 * from the catalog (else the catalog's first). `fellBack` says what was replaced, in
 * words, for Setup to show.
 */
export function resolvePreset(preset: Preset, shop: { hardware: Hardware[]; materialCatalog: Material[] }): { preset: Preset; fellBack: string[] } {
  const copy = plain(preset);
  const fellBack: string[] = [];
  const has = (id: Id | undefined) => !id || shop.hardware.some((h) => h.id === id);
  const named = (id: Id) => shop.hardware.find((h) => h.id === id)?.name ?? id;
  const doors = copy.fronts.doors;
  for (const key of ['hingeId', 'framelessHingeId', 'shopHingeId'] as DoorHingeKey[]) {
    if (has(doors[key])) continue;
    fellBack.push(`The doors' hinge ${doors[key]} is not in the shop: ${named(GENERIC_HINGES[key])} instead.`);
    doors[key] = GENERIC_HINGES[key];
  }
  if (!has(copy.fronts.drawers.slideId)) {
    fellBack.push(`The drawers' slide ${copy.fronts.drawers.slideId} is not in the shop: ${named(GENERIC_SLIDE_ID)} instead.`);
    copy.fronts.drawers.slideId = GENERIC_SLIDE_ID;
  }
  for (const [what, front] of [['doors', doors], ['drawers', copy.fronts.drawers]] as const) {
    if (!front.handle || has(front.handle.handleId)) continue;
    fellBack.push(`The ${what}' handle ${front.handle.handleId} is not in the shop: ${named(GENERIC_PULL_ID)} instead.`);
    front.handle.handleId = GENERIC_PULL_ID;
  }
  if (copy.settings && !has(copy.settings.shelfPinId)) {
    fellBack.push(`The shelf pin ${copy.settings.shelfPinId} is not in the shop: ${named(GENERIC_SHELF_PIN_ID)} instead.`);
    copy.settings.shelfPinId = GENERIC_SHELF_PIN_ID;
  }
  for (const id of presetMaterialIds(copy, shop.hardware)) {
    if (copy.materials.some((m) => m.id === id)) continue;
    const entry = shop.materialCatalog.find((m) => m.id === id) ?? shop.materialCatalog[0];
    if (!entry) continue;
    if (entry.id !== id) {
      fellBack.push(`The material ${id} is not in the preset or the catalog: ${entry.name} instead.`);
      replaceMaterial(copy, id, entry.id);
    }
    if (!copy.materials.some((m) => m.id === entry.id)) copy.materials.push(plain(entry));
  }
  return { preset: copy, fellBack };
}

/** Every place a preset's values name material `from` names `to` instead. */
function replaceMaterial(preset: Preset, from: Id, to: Id): void {
  const swap = (id: Id) => (id === from ? to : id);
  const s = preset.settings;
  if (s) {
    s.materials = { caseId: swap(s.materials.caseId), backId: swap(s.materials.backId) };
    s.faceFrame.materialId = swap(s.faceFrame.materialId);
  }
  const { doors, drawers } = preset.fronts;
  doors.materialId = swap(doors.materialId);
  if (doors.shop) doors.shop.materialId = swap(doors.shop.materialId);
  drawers.front.materialId = swap(drawers.front.materialId);
  drawers.materials = { boxId: swap(drawers.materials.boxId), bottomId: swap(drawers.materials.bottomId) };
  if (drawers.shop?.frontMaterialId) drawers.shop.frontMaterialId = swap(drawers.shop.frontMaterialId);
}

/**
 * Gives a project a preset's values, in place: its construction and front settings,
 * finish and start sizes are replaced; its cabinets' and fronts' own values, and their
 * overrides, are kept. The preset's materials are added, a material the project already
 * has keeping the project's copy (it is measured for this project). Returns what fell
 * back (`resolvePreset`).
 */
export function applyPreset(project: Project, preset: Preset, shop: { hardware: Hardware[]; materialCatalog: Material[] }): string[] {
  const { preset: resolved, fellBack } = resolvePreset(preset, shop);
  const context = project.context;
  context.fronts = resolved.fronts;
  context.settings = resolved.settings;
  context.sizes = resolved.sizes;
  if (resolved.finish) project.settings.finish = resolved.finish;
  else delete project.settings.finish;
  for (const m of resolved.materials) if (!project.materials.some((o) => o.id === m.id)) project.materials.push(m);
  project.preset = resolved.name;
  return fellBack;
}

/** The user's presets, as the shop profile keeps them. Built-in ones are not among them and cannot be changed here. */
type OwnPresets = { presets: Preset[]; hardware: Hardware[] };
const ownPreset = (shop: OwnPresets, id: Id): Preset => {
  const preset = shop.presets.find((p) => p.id === id);
  if (!preset) throw new Error(id.startsWith('builtin-') ? 'A built-in preset cannot be changed; save it under a new name.' : `Preset not found: ${id}`);
  return preset;
};

/** Stores the project's shared values as a new preset of the user's, under a name. */
export function savePreset(shop: OwnPresets, project: Project, name: string): Preset {
  let n = 1;
  while (shop.presets.some((p) => p.id === `preset-${n}`)) n++;
  const preset = presetFromProject(project, { id: `preset-${n}`, name: name.trim() || 'My preset' }, shop.hardware);
  shop.presets.push(preset);
  return preset;
}

/** Replaces one of the user's presets with the project's values, keeping its name and id. */
export function overwritePreset(shop: OwnPresets, id: Id, project: Project): Preset {
  const old = ownPreset(shop, id);
  const preset = presetFromProject(project, { id, name: old.name }, shop.hardware);
  shop.presets.splice(shop.presets.indexOf(old), 1, preset);
  return preset;
}

export function renamePreset(shop: OwnPresets, id: Id, name: string): void {
  if (name.trim()) ownPreset(shop, id).name = name.trim();
}

export function deletePreset(shop: OwnPresets, id: Id): void {
  shop.presets.splice(shop.presets.indexOf(ownPreset(shop, id)), 1);
}

const STYLE_NAMES = { faceFrame: 'Face frame', frameless: 'Frameless', shop: 'Inset' } as const;

/**
 * The project's Setup in a line: "Frameless, 3/4" Plywood, shaker doors, toe kick"; only what the project has (a
 * dresser: "…, slab drawer fronts, generic knob, corner posts"; tables alone: "Tables, 3/4" Solid wood, legs of …"). When every
 * cabinet is already there: "Cabinets already there, shaker doors, 3/4" MDF" (what is made for
 * them). `length` writes a nominal thickness.
 */
export function setupSummary(project: Project, hardware: Hardware[], length: (mm: number) => string): string {
  const material = (id: Id) => {
    const m = project.materials.find((x) => x.id === id);
    return m ? `${length(m.nominalThickness.mm)} ${m.name}` : id;
  };
  const context = project.context;
  const { settings, fronts } = context;
  if (storedCases(context).length && storedCases(context).every((c) => c.existing)) {
    // Nothing of the cases is made: the line says what is, the new doors or what goes inside.
    const d = storedCases(context).some((c) => c.existing && existingMakesFronts(c.existing)) ? designsOf(project).find(isDoorSet) : undefined;
    return ['Cabinets already there', ...(d ? [`${d.style.kind} doors`, material(d.materialId)] : ['their doors kept', material(settings.materials.caseId)])].join(', ');
  }
  // Only what the project has: no doors on a dresser, no style or toe kick on a table. A
  // project with nothing in it yet says the whole of what it would start with.
  const empty = context.pieces.length === 0;
  const cases = empty || storedCases(context).length > 0;
  // (A front kept for a row its cabinet's layout no longer has is on no opening: it is not counted.)
  const openings = new Set(cabinetsOf(project).flatMap((c) => layoutOpeningIds(c).map((o) => o.id)));
  const hung = (template: 'doorSet' | 'drawer') => empty || project.designObjects.some((d) => d.template === template && openings.has(d.mounting.openingId));
  const [doors, drawers] = [hung('doorSet'), hung('drawer')];
  // Shop-style doors are slabs of the case material until they are given a style of their own.
  const door = settings.construction === 'shop' ? (fronts.doors.shop ?? shopDoorDefaults(settings.materials.caseId)) : fronts.doors;
  const handle = hardware.find((h) => h.id === (doors ? fronts.doors.handle?.handleId : drawers ? fronts.drawers.handle?.handleId : undefined));
  const frame = context.pieces.find((p) => p.kind === 'frame');
  const legs = frame?.kind === 'frame' ? project.materials.find((m) => m.id === frame.legs.materialId)?.name : undefined;
  return [
    ...(cases ? [STYLE_NAMES[settings.construction]] : ['Tables']),
    material(settings.materials.caseId),
    ...(doors ? [`${door.style.kind} doors`] : drawers && cases ? [`${fronts.drawers.front.style.kind} drawer fronts`] : []),
    ...(handle ? [handle.name.toLowerCase()] : []),
    ...(cases ? [settings.toeKick.legs ? (settings.toeKick.legs.posts ? 'corner posts' : 'on legs') : settings.toeKick.casters ? (settings.toeKick.casters.feet ? 'on feet' : 'on casters') : settings.toeKick.off ? 'flat bottom' : settings.toeKick.plinth ? 'plinth' : 'toe kick'] : legs ? [`legs of ${legs.toLowerCase()}`] : []),
  ].join(', ');
}
