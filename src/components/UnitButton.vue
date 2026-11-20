<script setup lang="ts">
/**
 * The small button that says the unit a value is shown in; a click shows another. Used inside a
 * length field, on a feed field and in the heads of the feeds table.
 */
defineProps<{ unit: string; title?: string }>();
</script>

<template>
  <button type="button" tabindex="-1" class="unit-button" :title="title" :data-unit="unit" @mousedown.prevent>{{ unit }}</button>
</template>

<style scoped>
.unit-button {
  align-self: center;
  min-width: 1.9em;
  padding: 2px 3px;
  border: 1px solid rgba(var(--v-theme-primary), 0.5);
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-size: 0.7rem;
  font-weight: 400;
  line-height: 1.1;
  white-space: nowrap;
  cursor: pointer;
  /* It works on a field that only shows a value. */
  pointer-events: auto;
}
.unit-button:hover {
  background: rgba(var(--v-theme-primary), 0.3);
}
</style>
