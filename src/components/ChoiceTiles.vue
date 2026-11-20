<script setup lang="ts" generic="T extends string">
/**
 * A choice as picture tiles: one of a few things that have a look, each a line
 * drawing over its name. For named products (materials, hinges, slides) a select stays the better field.
 */
import TilePicture from '@/components/TilePicture.vue';
import type { TileDrawing } from '@/design/tileDrawings';

defineProps<{
  modelValue: T;
  items: { value: T; title: string; note?: string; drawing: TileDrawing }[];
  /** What is chosen, for a screen reader. */
  label: string;
  /** `small`: many tiles to a row, the note left to the tooltip. */
  size?: 'large' | 'small';
  /** Names the group and each tile for scripts: `<name>` and `<name>-<value>`. */
  name?: string;
}>();
defineEmits<{ 'update:modelValue': [value: T] }>();
</script>

<template>
  <div class="choice-tiles" :class="size ?? 'large'" role="radiogroup" :aria-label="label" :data-test="name">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="tile"
      :class="{ chosen: item.value === modelValue }"
      role="radio"
      :aria-checked="item.value === modelValue"
      :title="item.note ? `${item.title}: ${item.note}` : item.title"
      :data-test="name ? `${name}-${item.value}` : undefined"
      @click="$emit('update:modelValue', item.value)"
    >
      <span class="picture"><TilePicture :drawing="item.drawing" /></span>
      <span class="title">{{ item.title }}</span>
      <span v-if="item.note && size !== 'small'" class="note">{{ item.note }}</span>
    </button>
  </div>
</template>

<style scoped>
.choice-tiles {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.choice-tiles.large {
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
}
.choice-tiles.small {
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 8px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  text-align: center;
}
.tile:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.4);
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.tile:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.tile.chosen {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}
.picture {
  width: 100%;
  height: 96px;
}
.small .picture {
  height: 60px;
}
.title {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  color: rgb(var(--v-theme-on-surface));
}
.small .title {
  font-size: 0.72rem;
}
.note {
  font-size: 0.7rem;
  line-height: 1.2;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
