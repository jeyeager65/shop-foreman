<script setup lang="ts">
/**
 * Warnings that do not crowd a card: one is shown as it is; several are one line saying what
 * they are, which opens the list under it, as "How this works" does.
 */
import { mdiAlertOutline, mdiChevronDown } from '@mdi/js';
import { ref } from 'vue';

defineProps<{ lines: string[]; summary: string }>();
const open = ref(false);
</script>

<template>
  <div v-if="lines.length === 1" class="text-body-2 text-warning mt-2" data-test="warning-line">{{ lines[0] }}</div>
  <div v-else-if="lines.length" class="mt-2">
    <button type="button" class="toggle text-warning" :aria-expanded="open" data-test="warning-toggle" @click="open = !open">
      <v-icon :icon="mdiAlertOutline" size="16" />
      <span>{{ summary }}</span>
      <v-icon :icon="mdiChevronDown" size="16" class="chevron" :class="{ turned: open }" />
    </button>
    <div v-show="open">
      <div v-for="line in lines" :key="line" class="text-body-2 text-warning mt-2" data-test="warning-line">{{ line }}</div>
    </div>
  </div>
</template>

<style scoped>
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.chevron {
  flex: none;
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
</style>
