<script setup lang="ts">
/**
 * Design for the open project: its cabinets, made here or already there, and its tables,
 * which are pieces of another kind with a Design of their own. `?piece=<id>` opens a table; a project with no
 * cabinet opens on its first table.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { cabinetsOf, framesOf } from '@/design/settings';
import { useAppStore } from '@/stores/app';
import CabinetDesignView from './CabinetDesignView.vue';
import FrameDesignView from './FrameDesignView.vue';

const store = useAppStore();
const route = useRoute();
const frame = computed(() => {
  if (!store.project) return undefined;
  const frames = framesOf(store.project);
  return frames.find((f) => f.id === route.query.piece) ?? (cabinetsOf(store.project).length ? undefined : frames[0]);
});
</script>

<template>
  <FrameDesignView v-if="store.project && frame" :key="frame.id" :frame="frame" />
  <CabinetDesignView v-else-if="store.project" />
</template>
