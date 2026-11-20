<script setup lang="ts">
/**
 * An explanation kept out of the way: a small "How this works" line that opens
 * the text under it. The text stays in the page while closed.
 */
import { mdiChevronDown, mdiHelpCircleOutline } from '@mdi/js';
import { ref } from 'vue';

defineProps<{ label?: string }>();
const open = ref(false);
</script>

<template>
  <div class="mt-3">
    <button type="button" class="toggle" :aria-expanded="open" @click="open = !open">
      <v-icon :icon="mdiHelpCircleOutline" size="16" />
      <span>{{ label ?? 'How this works' }}</span>
      <v-icon :icon="mdiChevronDown" size="16" class="chevron" :class="{ turned: open }" />
    </button>
    <div v-show="open" class="text-body-2 text-medium-emphasis mt-2 help"><slot /></div>
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
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
  cursor: pointer;
}
.toggle:hover {
  color: rgb(var(--v-theme-primary));
}
.chevron {
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
.help :deep(p) {
  margin-bottom: 8px;
}
</style>
