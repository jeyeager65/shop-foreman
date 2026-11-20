<script setup lang="ts">
/**
 * The header band of a panel: an accent icon, the title, and the panel's controls
 * (the `actions` slot) at the right. It must be the first thing in a card padded
 * with `pa-5`: the band reaches out over that padding to the card's edges.
 */
import {
  mdiBookmarkOutline,
  mdiCircularSaw,
  mdiCodeBraces,
  mdiDresserOutline,
  mdiFloorPlan,
  mdiFormatPaint,
  mdiFridgeOutline,
  mdiTuneVariant,
  mdiViewWeekOutline,
  mdiCubeOutline,
  mdiCupboardOutline,
  mdiDoor,
  mdiDoorOpen,
  mdiFileDownloadOutline,
  mdiFormatListChecks,
  mdiLayersOutline,
  mdiPaletteSwatchOutline,
  mdiPrinter3dNozzleOutline,
  mdiRobotIndustrialOutline,
  mdiRulerSquare,
  mdiSawBlade,
  mdiScrewMachineFlatTop,
  mdiShapeOutline,
  mdiTableLarge,
  mdiTextureBox,
  mdiTimerOutline,
  mdiToolboxOutline,
  mdiViewGridOutline,
} from '@mdi/js';

const ICONS = {
  opening: mdiRulerSquare,
  cabinet: mdiCupboardOutline,
  doors: mdiDoor,
  style: mdiPaletteSwatchOutline,
  view: mdiCubeOutline,
  parts: mdiShapeOutline,
  hardware: mdiScrewMachineFlatTop,
  setup: mdiViewGridOutline,
  checklist: mdiFormatListChecks,
  files: mdiFileDownloadOutline,
  kit: mdiPrinter3dNozzleOutline,
  gcode: mdiCodeBraces,
  summary: mdiTimerOutline,
  setups: mdiLayersOutline,
  operations: mdiTableLarge,
  shop: mdiToolboxOutline,
  machine: mdiRobotIndustrialOutline,
  units: mdiRulerSquare,
  materials: mdiTextureBox,
  bits: mdiSawBlade,
  hinges: mdiDoorOpen,
  room: mdiFloorPlan,
  appliances: mdiFridgeOutline,
  run: mdiViewWeekOutline,
  saws: mdiCircularSaw,
  presets: mdiBookmarkOutline,
  finishes: mdiFormatPaint,
  details: mdiTuneVariant,
  slides: mdiDresserOutline,
} as const;

export type PanelIcon = keyof typeof ICONS;

defineProps<{ icon: PanelIcon }>();
</script>

<template>
  <div class="panel-title">
    <span class="badge"><v-icon :icon="ICONS[icon]" size="18" /></span>
    <span class="text"><slot /></span>
    <span v-if="$slots.actions" class="actions"><slot name="actions" /></span>
  </div>
</template>

<style scoped>
.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 54px;
  margin: -20px -20px 18px;
  padding: 8px 14px 8px 16px;
  /* A neutral band with the accent as a line under it. 2px gives a stronger line. */
  border-bottom: 1px solid rgb(var(--v-theme-primary));
  border-radius: 7px 7px 0 0;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.16);
}
.text {
  flex: 1;
  min-width: 0;
  font-size: 1.06rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}
/* A phone: the title keeps its words whole and the controls go under it when they do not fit beside it. */
@media (max-width: 600px) {
  .panel-title {
    flex-wrap: wrap;
  }
  .text {
    flex: 1 1 auto;
    max-width: calc(100% - 40px);
  }
  .actions {
    justify-content: flex-start;
  }
}
</style>
