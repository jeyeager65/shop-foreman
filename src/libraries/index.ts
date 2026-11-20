import { SHOP_PROFILE_VERSION } from '@/model';
import type { Router, Shop, ShopProfile } from '@/model';
import { DEFAULT_UNIT_PREFERENCES } from '@/units';
import { STARTER_BOUGHT_TOPS } from './boughtTops';
import { STARTER_CASTERS } from './casters';
import { STARTER_FINISHES } from './finishes';
import { STARTER_HANDLES } from './handles';
import { STARTER_HINGES } from './hinges';
import { GENERIC_CNC } from './machines';
import { STARTER_MATERIAL_GROUPS, STARTER_MATERIALS } from './materials';
import { STARTER_SAWS } from './saws';
import { STARTER_SHELF_PINS } from './shelfPins';
import { STARTER_SLIDES } from './slides';
import { STARTER_TOOLS, withMaterialSettings } from './tools';

export { BLUM_INSET_HINGE_ID, GENERIC_FRAMELESS_HINGE_ID, GENERIC_HINGE_ID, GENERIC_INSET_HINGE_ID, STARTER_HINGES } from './hinges';
export { FINISH_STARTS, SQ_FT_A_QUART, STARTER_FINISHES, newFinish } from './finishes';
export { STARTER_BOUGHT_TOPS } from './boughtTops';
export { GENERIC_CASTER_ID, STARTER_CASTERS } from './casters';
export { GENERIC_KNOB_ID, GENERIC_PULL_ID, STARTER_CNC_HANDLES, STARTER_HANDLES, STARTER_PRINTED_HANDLES, STARTER_ROUTED_PULLS } from './handles';
export { GENERIC_SHELF_PIN_ID, SHELF_PIN_1_4_ID, STARTER_SHELF_PINS } from './shelfPins';
export { EURO_SLIDE_ID, GENERIC_SLIDE_ID, STARTER_SLIDES } from './slides';
export { STARTER_SAWS } from './saws';
export { GENERIC_CNC } from './machines';
export { DEFAULT_ROUTER, ROUTERS } from './routers';
export { BUTCHER_BLOCK_ID, MDF_ID, PLYWOOD_1_2_ID, PLYWOOD_1_4_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, STARTER_MATERIALS, STARTER_MATERIAL_GROUPS, MATERIAL_TYPES, MDF_TYPE_ID, materialLook, CABINET_MATERIALS, TOP_MATERIALS, SKIN_MATERIALS, OSB_MATERIALS, OSB_3_4_ID, OSB_7_16_ID, MDF_1_4_ID, HARDBOARD_1_8_ID, HARDBOARD_3_16_ID, defaultHasGrain } from './materials';
export { CHIP_LOAD_LOW_TYPES, CHIP_LOAD_OF_DIAMETER, STARTER_RPM, STEPOVER_STEP, snapStepover, bitWidth, hasNominal, nominalDiameter, stepoverForPercent, stepoverPercent, chipLoad, chipLoadCheck, chipLoadRange, feedForChipLoad, feedPerSecond, flutesOf, copyBit, newBit, BIT_SETTING_FIELDS, BIT_TYPES, PLACEHOLDER_BIT_SETTINGS, bitSettingsSource, copyBitSettings, removeBitSettings, setBitSetting, STARTER_TOOLS, bitAutoName, bitOwnName, bitSize, bitType, setBitField, setBitName, withMaterialSettings } from './tools';
export type { BitField, BitKind, BitType } from './tools';
export { addRouterMark, removeRouterMark, routerPresetId, setRouterName, setRouterPreset, setRouterSpeed, MACHINE_FIELDS, MACHINE_GROUPS, copyMachine, machineFieldTune, machineValue, removeMachine, setMachineTiling, setMachineValue, useMachine, projectMachineGone, projectMachineId, toolsOnMachine } from './machineFields';
export type { MachineField, MachineFieldGroup } from './machineFields';

/** A fresh copy of the starter shop profile. */
export function createStarterShopProfile(): ShopProfile {
  return structuredClone({
    schemaVersion: SHOP_PROFILE_VERSION,
    machines: [GENERIC_CNC],
    activeMachineId: GENERIC_CNC.id,
    tools: STARTER_TOOLS,
    materialCatalog: STARTER_MATERIALS,
    materialGroups: STARTER_MATERIAL_GROUPS,
    hardware: [...STARTER_HINGES, ...STARTER_SLIDES, ...STARTER_SHELF_PINS, ...STARTER_HANDLES, ...STARTER_BOUGHT_TOPS, ...STARTER_CASTERS],
    saws: STARTER_SAWS,
    finishes: structuredClone(STARTER_FINISHES),
    presets: [],
    units: DEFAULT_UNIT_PREFERENCES,
  });
}

/**
 * The starter shop as a job sees it, holding the starter materials a sample project
 * copies: for scripts and tests that derive parts without a project to hand.
 */
export function createStarterShop(): Shop {
  const { materialCatalog, materialGroups: _groups, ...shop } = createStarterShopProfile();
  return { ...shop, tools: withMaterialSettings(shop.tools, materialCatalog), materials: materialCatalog };
}

/** RPM at a dial setting, interpolated between the marks and held at the ends. */
export function dialRpm(router: Router, dial: number): number {
  const pts = router.speeds;
  if (dial <= pts[0]!.dial) return pts[0]!.rpm;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (dial <= b.dial) return a.rpm + ((b.rpm - a.rpm) * (dial - a.dial)) / (b.dial - a.dial);
  }
  return pts.at(-1)!.rpm;
}

/**
 * The dial setting nearest an RPM, in half steps. Outside the router's range it is
 * the end setting; see routerRangeNote.
 */
export function routerDial(router: Router, rpm: number): number {
  const pts = router.speeds;
  let dial = pts.at(-1)!.dial;
  if (rpm <= pts[0]!.rpm) dial = pts[0]!.dial;
  else {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (rpm <= b.rpm) {
        dial = a.dial + ((b.dial - a.dial) * (rpm - a.rpm)) / (b.rpm - a.rpm);
        break;
      }
    }
  }
  return Math.round(dial * 2) / 2;
}

/** Empty when the router can run at this RPM, else a short warning. */
export function routerRangeNote(router: Router, rpm: number): string {
  const lo = router.speeds[0]!.rpm;
  const hi = router.speeds.at(-1)!.rpm;
  if (rpm < lo * 0.97) return `the ${router.name} can't go below about ${lo} RPM: chips get thinner, watch for burning`;
  if (rpm > hi * 1.03) return `above the ${router.name}'s ${hi} RPM maximum: chips get thicker, consider a lower feed`;
  return '';
}
