<script setup lang="ts">
/** The header row every workflow screen shares: title, a one-line status, extras, and the next step. */
import { mdiArrowRight } from '@mdi/js';

defineProps<{
  title: string;
  /** One line under the title saying where things stand. */
  status?: string;
  next?: { to: string; title: string };
}>();
</script>

<template>
  <div class="page-header">
    <div class="heading">
      <h1 class="title">{{ title }}</h1>
      <div v-if="status" class="text-body-2 text-medium-emphasis">{{ status }}</div>
    </div>
    <slot />
    <v-btn v-if="next" :to="next.to" color="primary" variant="flat" size="large" :append-icon="mdiArrowRight">{{ next.title }}</v-btn>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 24px;
  margin-bottom: 20px;
}
.heading {
  flex: 1;
  min-width: 240px;
}
.title {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
}
</style>
