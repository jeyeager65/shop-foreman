<script setup lang="ts">
/**
 * The 3D view's look, chosen from a small menu: in the header of the card the view is in, or under the view where
 * it has no such header (and when it fills the page).
 */
import { mdiCheck, mdiChevronDown, mdiEyeOutline } from '@mdi/js';
import { computed } from 'vue';
import { VIEW_LOOKS, viewLook } from './viewLook';

const current = computed(() => VIEW_LOOKS.find((l) => l.id === viewLook.value) ?? VIEW_LOOKS[0]!);
</script>

<template>
  <!-- Over the view when it fills the page (that is at 3000): its list opened behind it. -->
  <v-menu :z-index="3100">
    <template #activator="{ props: menu }">
      <v-btn v-bind="menu" variant="outlined" size="small" class="look" :prepend-icon="mdiEyeOutline" :append-icon="mdiChevronDown" title="How the 3D view is drawn" data-test="view-look">
        {{ current.title }}
      </v-btn>
    </template>
    <v-list density="compact" data-test="view-looks">
      <v-list-item v-for="look in VIEW_LOOKS" :key="look.id" :title="look.title" :subtitle="look.what" :active="look.id === viewLook" :data-test="`view-look-${look.id}`" @click="viewLook = look.id">
        <template #append><v-icon v-if="look.id === viewLook" :icon="mdiCheck" size="18" /></template>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<style scoped>
.look {
  flex: none;
  text-transform: none;
  letter-spacing: 0;
}
</style>
