<script setup lang="ts">
/** A heading for a section inside a panel, with a line above it. */
</script>

<template>
  <div class="sub-head"><slot /></div>
</template>

<style scoped>
.sub-head {
  margin: 18px 0 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}
</style>
