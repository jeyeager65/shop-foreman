import type { Material, MaterialGroup } from '@/model';
import { len } from '@/units';

/** A full sheet, 4' × 8'. */
const FULL_SHEET = () => [{ x: len('48"'), y: len('96"') }];
/** MDF is sold an inch over: 49" × 97". */
const MDF_SHEET = () => [{ x: len('49"'), y: len('97"') }];

/**
 * The material types, which come with the app: what a type's thicknesses share. OSB's strands run every
 * way: no grain to keep.
 * The colours are of the bare material. Tune me.
 */
export const MATERIAL_TYPES: MaterialGroup[] = [
  { id: 'plywood', name: 'Plywood', hasGrain: true, sheets: FULL_SHEET(), look: { color: 0xd9bf94, texture: 'wood', edge: 'plies' } },
  { id: 'mdf', name: 'MDF', hasGrain: false, sheets: MDF_SHEET(), look: { color: 0xc2a67e, texture: 'smooth' } },
  { id: 'hardboard', name: 'Hardboard', hasGrain: false, sheets: FULL_SHEET(), look: { color: 0x7d5a3c, texture: 'smooth' } },
  { id: 'osb', name: 'OSB', hasGrain: false, sheets: FULL_SHEET(), look: { color: 0xd2ad72, texture: 'strands', edge: 'pressed' } },
  { id: 'solid-wood', name: 'Solid wood', hasGrain: true, look: { color: 0xc9a56c, texture: 'wood' } },
];
/** The types as a new shop profile holds them (it keeps the sheets each is sold in). */
export const STARTER_MATERIAL_GROUPS = MATERIAL_TYPES;
/** The feeds and speeds every type starts on: MDF's, until each is tuned. */
export const MDF_TYPE_ID = 'mdf';

/** A material's bare look in the 3D view: its type's. Undefined for a type the app does not know. */
export function materialLook(material: Pick<Material, 'groupId'>, groups: MaterialGroup[] = MATERIAL_TYPES): MaterialGroup['look'] {
  return groups.find((g) => g.id === material.groupId)?.look ?? MATERIAL_TYPES.find((g) => g.id === material.groupId)?.look;
}

export const MDF_ID = 'mdf-3-4';
export const PLYWOOD_3_4_ID = 'plywood-3-4';
export const PLYWOOD_1_4_ID = 'plywood-1-4';
export const PLYWOOD_1_2_ID = 'plywood-1-2';
export const SOLID_WOOD_3_4_ID = 'solid-wood-3-4';
/** A countertop slab (milestone 7). A plywood or MDF top is the 3/4" plywood or MDF, tagged for tops. */
export const BUTCHER_BLOCK_ID = 'butcher-block-1-1-2';

/** Whether a material that says nothing about grain has it: everything but MDF. */
export function defaultHasGrain(material: Pick<Material, 'id' | 'name'>): boolean {
  return STARTER_MATERIALS.find((m) => m.id === material.id)?.hasGrain ?? !/mdf/i.test(material.name);
}

/** The materials a cabinet is made of: what the samples' projects hold. */
export const CABINET_MATERIALS: Material[] = [
  {
    id: MDF_ID,
    name: 'MDF',
    groupId: 'mdf',
    nominalThickness: len('3/4"'),
    measuredThickness: len('19mm'),
    hasGrain: false,
    sheets: MDF_SHEET(),
    uses: ['fronts', 'cases', 'tops'],
    tuneMe: ['measuredThickness'],
  },
  // Plywood runs under its nominal thickness; these are typical values until the sheets are measured.
  {
    id: PLYWOOD_3_4_ID,
    name: 'Plywood',
    groupId: 'plywood',
    nominalThickness: len('3/4"'),
    measuredThickness: len('23/32"'),
    hasGrain: true,
    sheets: FULL_SHEET(),
    uses: ['cases', 'fronts', 'tops', 'drawers'],
    tuneMe: ['measuredThickness'],
  },
  {
    id: PLYWOOD_1_4_ID,
    name: 'Plywood',
    groupId: 'plywood',
    nominalThickness: len('1/4"'),
    measuredThickness: len('7/32"'),
    hasGrain: true,
    sheets: FULL_SHEET(),
    uses: ['backs', 'skins'],
    tuneMe: ['measuredThickness'],
  },
  {
    id: SOLID_WOOD_3_4_ID,
    name: 'Solid wood',
    groupId: 'solid-wood',
    nominalThickness: len('3/4"'),
    measuredThickness: len('3/4"'),
    hasGrain: true,
    uses: ['frames', 'fronts'],
    tuneMe: ['measuredThickness'],
  },
  // Drawer boxes.
  {
    id: PLYWOOD_1_2_ID,
    name: 'Plywood',
    groupId: 'plywood',
    nominalThickness: len('1/2"'),
    measuredThickness: len('15/32"'),
    hasGrain: true,
    sheets: FULL_SHEET(),
    uses: ['drawers', 'backs', 'cases'],
    tuneMe: ['measuredThickness'],
  },
];

/** Countertops (milestone 7): a butcher-block slab. A plywood top with a hardwood edge and MDF under laminate are the 3/4" sheets. Tune me. */
export const TOP_MATERIALS: Material[] = [
  {
    id: BUTCHER_BLOCK_ID,
    name: 'Butcher block',
    groupId: 'solid-wood',
    nominalThickness: len('1-1/2"'),
    measuredThickness: len('1-1/2"'),
    hasGrain: true,
    sheets: [{ x: len('25"'), y: len('96"') }],
    uses: ['tops'],
    tuneMe: ['measuredThickness'],
  },
];

/** A torsion table's thin skins (milestone 8): 1/4" MDF, 1/8" and 3/16" hardboard. Tune me. */
export const MDF_1_4_ID = 'mdf-1-4';
export const HARDBOARD_1_8_ID = 'hardboard-1-8';
export const HARDBOARD_3_16_ID = 'hardboard-3-16';
export const SKIN_MATERIALS: Material[] = [
  { id: MDF_1_4_ID, name: 'MDF', groupId: 'mdf', nominalThickness: len('1/4"'), measuredThickness: len('6mm'), hasGrain: false, sheets: MDF_SHEET(), uses: ['skins', 'backs'], tuneMe: ['measuredThickness'] },
  { id: HARDBOARD_1_8_ID, name: 'Hardboard', groupId: 'hardboard', nominalThickness: len('1/8"'), measuredThickness: len('3.2mm'), hasGrain: false, sheets: FULL_SHEET(), uses: ['skins', 'backs'], tuneMe: ['measuredThickness'] },
  { id: HARDBOARD_3_16_ID, name: 'Hardboard', groupId: 'hardboard', nominalThickness: len('3/16"'), measuredThickness: len('4.8mm'), hasGrain: false, sheets: FULL_SHEET(), uses: ['skins', 'backs'], tuneMe: ['measuredThickness'] },
];

/** OSB, for shop cabinets and sheathing-grade work: 7/16" and 23/32" (sold as 3/4"). Tune me. */
export const OSB_7_16_ID = 'osb-7-16';
export const OSB_3_4_ID = 'osb-3-4';
export const OSB_MATERIALS: Material[] = [
  { id: OSB_7_16_ID, name: 'OSB', groupId: 'osb', nominalThickness: len('7/16"'), measuredThickness: len('7/16"'), hasGrain: false, sheets: FULL_SHEET(), uses: ['backs', 'skins'], tuneMe: ['measuredThickness'] },
  { id: OSB_3_4_ID, name: 'OSB', groupId: 'osb', nominalThickness: len('3/4"'), measuredThickness: len('23/32"'), hasGrain: false, sheets: FULL_SHEET(), uses: ['cases', 'tops'], tuneMe: ['measuredThickness'] },
];

/** The material catalog a new shop profile starts with. */
/**
 * Square stock for legs, as a home centre stocks it: a 2x2, 1-1/2"
 * square, and a 3x3, 2-1/2" square, in 8' lengths. Measure yours.
 */
export const SQUARE_2X2_ID = 'square-2x2';
export const SQUARE_3X3_ID = 'square-3x3';
export const SQUARE_MATERIALS: Material[] = [
  { id: SQUARE_2X2_ID, name: 'Square stock (a 2×2)', groupId: 'solid-wood', nominalThickness: len('2"'), measuredThickness: len('1-1/2"'), hasGrain: true, section: 'square', lengths: [len('96"')], uses: ['legs'], tuneMe: ['measuredThickness'] },
  { id: SQUARE_3X3_ID, name: 'Square stock (a 3×3)', groupId: 'solid-wood', nominalThickness: len('3"'), measuredThickness: len('2-1/2"'), hasGrain: true, section: 'square', lengths: [len('96"')], uses: ['legs'], tuneMe: ['measuredThickness'] },
];

export const STARTER_MATERIALS: Material[] = [...CABINET_MATERIALS, ...TOP_MATERIALS, ...SKIN_MATERIALS, ...OSB_MATERIALS, ...SQUARE_MATERIALS];
