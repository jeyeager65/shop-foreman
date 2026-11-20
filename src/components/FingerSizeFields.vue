<script setup lang="ts">
/**
 * The size of a drawer box's finger joints: how wide each finger is and the most between two. `box` is what holds
 * them: Setup's drawers, or a drawer's own box. Nothing is stored while a size is the usual one.
 */
import { computed } from 'vue';
import LengthField from '@/components/LengthField.vue';
import { TAB, TAB_LIMITS, tabSizeOf } from '@/design/tabs';
import type { Length, TabSize } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{ box: { fingers?: TabSize }; disabled?: boolean }>();
const store = useAppStore();
const L = computed(() => store.sizeLength);
const size = computed(() => tabSizeOf(props.box.fingers));
function set(key: 'length' | 'between', value: Length | null) {
  const next: TabSize = { ...props.box.fingers };
  if (value && value.mm > 0 && Math.abs(value.mm - TAB[key]) > 1e-6) next[key] = value;
  else delete next[key];
  if (next.length || next.between) props.box.fingers = next;
  else delete props.box.fingers;
}
</script>

<template>
  <v-row density="compact" data-test="finger-size">
    <v-col cols="6"><LengthField :model-value="box.fingers?.length ?? { mm: size.length, unit: 'in' }" label="Each finger's width" :disabled="disabled" hide-details data-test="finger-length" @update:model-value="set('length', $event)" /></v-col>
    <v-col cols="6"><LengthField :model-value="box.fingers?.between ?? { mm: size.between, unit: 'in' }" label="Between two, at most" :disabled="disabled" hide-details data-test="finger-between" @update:model-value="set('between', $event)" /></v-col>
    <v-col cols="12" class="text-caption text-medium-emphasis pt-0">
      As many fingers as fit up the box's side at that width with no more than that between them, evenly spaced. {{ L(TAB_LIMITS.least) }} to {{ L(TAB_LIMITS.most) }} wide;
      small fingers close together look like a finger joint, {{ L(TAB.length) }} ones {{ L(TAB.between) }} apart are the usual tabs.
    </v-col>
  </v-row>
</template>
