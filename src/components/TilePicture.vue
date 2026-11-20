<script setup lang="ts">
/** A tile's line drawing (`src/design/tileDrawings.ts`), in the colour of the text round it. */
import type { TileDrawing } from '@/design/tileDrawings';

defineProps<{ drawing: TileDrawing }>();
</script>

<template>
  <svg class="tile-picture" :viewBox="`${drawing.x} ${drawing.y} ${drawing.w} ${drawing.h}`" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <template v-for="(s, i) in drawing.shapes" :key="i">
      <path v-if="s.kind === 'cut'" :d="s.d" class="cut" :stroke-width="s.width" />
      <path v-else :d="s.d" :class="s.kind" />
    </template>
  </svg>
</template>

<style scoped>
.tile-picture {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.outline,
.area {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25px;
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.area {
  fill: currentColor;
  fill-opacity: 0.1;
}
.solid {
  fill: currentColor;
  fill-opacity: 0.7;
}
.cut {
  fill: none;
  stroke: currentColor;
  stroke-opacity: 0.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
