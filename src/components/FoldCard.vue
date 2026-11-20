<script lang="ts">
import { reactive } from 'vue';

/** Which cards are open, by name: kept while the app runs, so a card stays as it was left when the screen is left and reopened. */
const remembered = reactive<Record<string, boolean>>({});
/** The cards of each group, by name: opening one closes the others (one panel at a time). */
const groups: Record<string, Set<string>> = {};
</script>

<script setup lang="ts">
/**
 * A panel that folds: closed, it is its title band and one line saying what is
 * inside; opened, its content. The content stays in the page while closed, so
 * inputs keep their state.
 */
import { mdiChevronDown } from '@mdi/js';
import { computed, inject } from 'vue';
import { useRoute } from 'vue-router';
import PanelTitle, { type PanelIcon } from '@/components/PanelTitle.vue';

const props = defineProps<{
  icon: PanelIcon;
  title: string;
  /** Remembers whether the card is open. */
  name: string;
  /** Shown while closed. */
  summary: string;
  /** Open the first time it is shown. */
  open?: boolean;
  /**
   * The cards it shares one open panel with: opening it closes the others of its group. Left out, the
   * group the screen provides as `foldGroup`, or none: it then opens and closes on its own.
   */
  group?: string;
}>();
const group = props.group ?? inject<string | undefined>('foldGroup', undefined);
if (group) (groups[group] ??= new Set()).add(props.name);
// #/design?fold=openings,case opens those cards by name: for looking at a screen from a URL.
const asked = String(useRoute()?.query.fold ?? '').split(',');
const isOpen = computed({
  get: () => remembered[props.name] ?? (asked.includes(props.name) || (props.open ?? false)),
  set: (value: boolean) => {
    // One panel at a time: the others of its group fold to their line.
    if (value && group) for (const other of groups[group] ?? []) if (other !== props.name) remembered[other] = false;
    remembered[props.name] = value;
  },
});
/** On a page of topics (Design) a card is a topic's body: its content alone, the topic's head over it. */
const plain = inject<boolean>('foldPlain', false);
const toggle = () => {
  isOpen.value = !isOpen.value;
};
</script>

<template>
  <div v-if="plain"><slot /></div>
  <v-card v-else class="pa-5 mb-4">
    <PanelTitle :icon="icon" class="head" role="button" tabindex="0" :aria-expanded="isOpen" @click="toggle" @keydown.enter="toggle" @keydown.space.prevent="toggle">
      {{ title }}
      <template #actions><v-icon :icon="mdiChevronDown" size="22" class="chevron" :class="{ turned: isOpen }" /></template>
    </PanelTitle>
    <div v-show="!isOpen" class="text-body-2 text-medium-emphasis summary" @click="toggle">{{ summary }}</div>
    <div v-show="isOpen"><slot /></div>
  </v-card>
</template>

<style scoped>
.head,
.summary {
  cursor: pointer;
}
.chevron {
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
</style>
