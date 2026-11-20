<script setup lang="ts">
/**
 * Design's picker: one line in place of a chip for every cabinet. It says where the piece in
 * hand stands, its name and its place among the others; two arrows step through them in the order they stand; and
 * the name opens a menu of them all, grouped by where they stand, with a picture beside the list when there is one
 * (the room's plan: the `picture` slot). With one piece it is only its name.
 */
import { mdiChevronDown, mdiChevronLeft, mdiChevronRight, mdiTune } from '@mdi/js';
import { computed, ref } from 'vue';

export interface PickerItem {
  id: string;
  label: string;
  /** It has settings of its own. */
  own?: boolean;
}
export interface PickerGroup {
  key: string;
  name?: string;
  items: PickerItem[];
}

const props = defineProps<{ groups: PickerGroup[]; selected: string; /** The picture's caption, when the menu has one. */ pictured?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();

const open = ref(false);
const flat = computed(() => props.groups.flatMap((g) => g.items));
const at = computed(() => flat.value.findIndex((i) => i.id === props.selected));
const current = computed(() => flat.value[at.value]);
const where = computed(() => props.groups.find((g) => g.items.some((i) => i.id === props.selected))?.name);
const step = (by: number) => {
  const next = flat.value[at.value + by];
  if (next) emit('select', next.id);
};
function pick(id: string) {
  emit('select', id);
  open.value = false;
}
defineExpose({ close: () => (open.value = false) });
</script>

<template>
  <div class="piece-picker" data-test="piece-picker">
    <template v-if="flat.length > 1">
      <v-btn variant="outlined" size="small" :icon="mdiChevronLeft" :disabled="at <= 0" title="The one before, as they stand" aria-label="The one before" data-test="picker-prev" @click="step(-1)" />
      <v-menu v-model="open" :close-on-content-click="false" location="bottom start" :max-width="960">
        <template #activator="{ props: menu }">
          <button v-bind="menu" type="button" class="picker-line" :class="{ open }" data-test="picker-line">
            <template v-if="where">
              <span class="where">{{ where }}</span>
              <span class="sep">›</span>
            </template>
            <span class="name">{{ current?.label }}</span>
            <v-icon v-if="current?.own" :icon="mdiTune" size="14" title="Has settings of its own" />
            <span class="count">{{ at + 1 }} of {{ flat.length }}</span>
            <v-icon :icon="mdiChevronDown" size="18" class="chevron" />
          </button>
        </template>
        <v-card class="picker-menu" :class="{ pictured }" data-test="picker-menu">
          <div class="picker-list" :class="{ wide: groups.length > 3 }">
            <div v-for="g in groups" :key="g.key" class="picker-group">
              <div v-if="g.name" class="group-name">{{ g.name }}</div>
              <button v-for="i in g.items" :key="i.id" type="button" class="picker-item" :class="{ on: i.id === selected }" :aria-current="i.id === selected" :data-test="`picker-item-${i.id}`" @click="pick(i.id)">
                {{ i.label }}
                <v-icon v-if="i.own" :icon="mdiTune" size="13" title="Has settings of its own" />
              </button>
            </div>
          </div>
          <div v-if="pictured" class="picker-picture">
            <slot name="picture" :pick="pick" />
          </div>
        </v-card>
      </v-menu>
      <v-btn variant="outlined" size="small" :icon="mdiChevronRight" :disabled="at >= flat.length - 1" title="The one after, as they stand" aria-label="The one after" data-test="picker-next" @click="step(1)" />
    </template>
    <div v-else class="picker-line only" data-test="picker-line">
      <span class="name">{{ current?.label }}</span>
      <v-icon v-if="current?.own" :icon="mdiTune" size="14" title="Has settings of its own" />
    </div>
  </div>
</template>

<style scoped>
.piece-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.picker-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  min-width: 0;
  padding: 4px 14px;
  border: 1px solid rgba(var(--v-border-color), 0.5);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.picker-line.only {
  cursor: default;
}
.picker-line.open,
button.picker-line:hover {
  border-color: rgb(var(--v-theme-primary));
}
.picker-line .where,
.picker-line .count {
  font-size: 0.8rem;
  opacity: 0.7;
  white-space: nowrap;
}
.picker-line .sep {
  opacity: 0.4;
}
.picker-line .name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-line .chevron {
  color: rgb(var(--v-theme-primary));
}
.picker-menu {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 14px 16px;
  max-height: min(80vh, 640px);
  max-width: 94vw;
  overflow: auto;
}
/* With a picture: wide enough for the list and the picture side by side, where the window is. */
.picker-menu.pictured {
  width: 860px;
}
.picker-list {
  display: grid;
  grid-template-columns: minmax(200px, 1fr);
  gap: 10px 16px;
  align-content: start;
  flex: 1 1 220px;
}
.picker-list.wide {
  grid-template-columns: repeat(2, minmax(190px, 1fr));
  flex-basis: 420px;
}
.picker-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.group-name {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
  padding: 2px 8px;
}
.picker-item {
  text-align: left;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.picker-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.picker-item.on {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.picker-picture {
  flex: 0 1 320px;
  min-width: 240px;
}
</style>
