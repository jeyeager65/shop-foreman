/**
 * The built-in presets (milestone 5), made from the reference projects the samples
 * already use, and a new project started from a preset.
 */
import { applyPreset, presetFromProject } from '@/design/presets';
import { starterRoom } from '@/design/room';
import { cabinetsOf } from '@/design/settings';
import { doorHandleChoice } from '@/design/handles';
import { BLUM_INSET_HINGE_ID, GENERIC_KNOB_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, STARTER_HANDLES } from '@/libraries';
import { len } from '@/units';
import type { Hardware, Material, Preset, Project, ShopProfile } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from './cabinet';
import { createVanityProject } from './vanity';

export const FRAMELESS_PRESET_ID = 'builtin-frameless-shaker';
export const FACE_FRAME_PRESET_ID = 'builtin-face-frame-shaker';
export const SHOP_PRESET_ID = 'builtin-shop-inset-slab';
export const EXISTING_PRESET_ID = 'builtin-existing-shaker';
export const FURNITURE_PRESET_ID = 'builtin-furniture-plywood';
export const FURNITURE_SOLID_PRESET_ID = 'builtin-furniture-solid';
export const FURNITURE_INSET_PRESET_ID = 'builtin-furniture-inset';

/**
 * The project a furniture preset is made from (face frame, the more common for
 * furniture): a face frame case with slab doors and drawer fronts, stained golden oak, its
 * top too. In plywood with a solid wood frame, or in solid wood all through (the back stays thin plywood).
 */
function furnitureProject(solid: boolean): Project {
  const project = createBaseCabinetProject('faceFrame');
  const context = project.context;
  const wood = solid ? SOLID_WOOD_3_4_ID : PLYWOOD_3_4_ID;
  context.fronts.doors.style = { kind: 'slab' };
  context.fronts.doors.materialId = wood;
  context.fronts.drawers.front.style = { kind: 'slab' };
  context.fronts.drawers.front.materialId = wood;
  if (solid) context.settings.materials.caseId = SOLID_WOOD_3_4_ID;
  project.settings.finish = { caseId: FURNITURE_STAIN_ID, frontsId: FURNITURE_STAIN_ID, topsId: FURNITURE_STAIN_ID };
  return project;
}
const FURNITURE_STAIN_ID = 'stain-golden-oak';

/**
 * The project the inset furniture preset is made from (the inset style made fit for a house, by its
 * material and the wood strips on its plywood edges): the inset
 * construction in 3/4" plywood with a solid wood strip, as thick as the plywood, on every front edge of the case;
 * slab doors of solid wood between the strips; each drawer one front piece of solid wood (the wide front) on
 * plywood sides; a knob on every door and drawer; the case joined, backed and stood as the other furniture
 * presets' are, and stained as they are. The gap round the fronts is the shop preset's, to be tightened to taste.
 * Painted MDF fronts are a change of two materials and a finish in Setup.
 */
function insetFurnitureProject(): Project {
  const project = createBaseCabinetProject('shop');
  const { settings, fronts } = project.context;
  settings.shop.edgeStrip = len('3/4"');
  // The other furniture presets' outside edge, on the doors and on the drawers' fronts alike.
  const edge = () => JSON.parse(JSON.stringify(fronts.doors.outsideEdge)) as typeof fronts.doors.outsideEdge;
  fronts.doors.shop = { style: { kind: 'slab' }, outsideEdge: edge(), materialId: SOLID_WOOD_3_4_ID };
  fronts.doors.shopHingeId = BLUM_INSET_HINGE_ID;
  fronts.drawers.shop = { front: 'wide', frontMaterialId: SOLID_WOOD_3_4_ID, style: { kind: 'slab' }, outsideEdge: edge() };
  // What an applied front would be, if one is chosen: the same slab in the same wood.
  fronts.drawers.front = { style: { kind: 'slab' }, outsideEdge: edge(), materialId: SOLID_WOOD_3_4_ID };
  fronts.doors.handle = doorHandleChoice(GENERIC_KNOB_ID);
  fronts.drawers.handle = { handleId: GENERIC_KNOB_ID };
  project.settings.finish = { caseId: FURNITURE_STAIN_ID, frontsId: FURNITURE_STAIN_ID, topsId: FURNITURE_STAIN_ID };
  return project;
}

/**
 * The presets that come with the app: today's New cabinet (frameless, shaker doors),
 * the same with a face frame, today's New shop cabinet (inset slab fronts, a flat
 * bottom, screws through the sides) and one for cabinets that are already there (the
 * vanity's shaker doors on a measured face frame cabinet; what a refacing project was), two for furniture behind a
 * face frame and one for furniture in the inset style. Made fresh on each call; they are not stored and cannot be changed.
 */
export function builtInPresets(): Preset[] {
  const own = (project: Project, id: string, name: string) => presetFromProject(project, { id, name, builtIn: true }, STARTER_HANDLES);
  return [
    own(createBaseCabinetProject('frameless'), FRAMELESS_PRESET_ID, 'Frameless, shaker'),
    own(createBaseCabinetProject('faceFrame'), FACE_FRAME_PRESET_ID, 'Face frame, shaker'),
    own(createShopCabinetProject(), SHOP_PRESET_ID, 'Shop cabinets: inset slab'),
    own(createVanityProject(), EXISTING_PRESET_ID, 'Cabinets already there: new shaker doors'),
    own(furnitureProject(false), FURNITURE_PRESET_ID, 'Furniture: face frame, plywood, stained'),
    own(furnitureProject(true), FURNITURE_SOLID_PRESET_ID, 'Furniture: face frame, solid wood, stained'),
    own(insetFurnitureProject(), FURNITURE_INSET_PRESET_ID, 'Furniture: inset, plywood with solid wood edges, stained'),
  ];
}

/** The built-in presets, then the user's own. */
export function presetsOf(shop: Pick<ShopProfile, 'presets'>): Preset[] {
  return [...builtInPresets(), ...(shop.presets ?? [])];
}

/**
 * A new project from a preset: one base cabinet at the preset's start size, a drawer over doors, 24"
 * wide, in a room; or, from a preset that starts with a cabinet that is already there (`start`), one
 * measured cabinet with a pair of new doors (the vanity's measurements, to be typed over) and no room.
 * Its materials are only the preset's. `fellBack` says which of the preset's values the shop could not give.
 */
export function newProjectFromPreset(preset: Preset, shop: { hardware: Hardware[]; materialCatalog: Material[] }): { project: Project; fellBack: string[] } {
  const project = preset.start === 'existing' ? createVanityProject() : createBaseCabinetProject(preset.settings.construction);
  project.materials = [];
  const fellBack = applyPreset(project, preset, shop);
  project.plan.blank.materialId = project.context.fronts.doors.materialId;
  if (preset.start !== 'existing') {
    const cabinet = cabinetsOf(project)[0]!;
    const { height, depth } = project.context.sizes.base;
    cabinet.size.height = { ...height };
    cabinet.size.depth = { ...depth };
    // A new project of cabinets stands in a room (milestone 6); Setup asks its size.
    project.context.room = starterRoom();
  }
  return { project, fellBack };
}
