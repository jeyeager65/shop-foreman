<script setup lang="ts">
/**
 * Choose the slide a drawer runs on. `?drawer=<id>` names the drawer; without it,
 * the project's first one. `?cabinet=N` is the cabinet to go back to. Generic entries always stay in the list.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { chooseSlide, drawerSlide, isDrawer, isSlide, mountedDesigns, slideFit, slideMountWords, type SlideFit } from '@/design';
import type { Slide } from '@/model';
import { useAppStore } from '@/stores/app';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const L = computed(() => store.sizeLength);
const back = computed(() => ({ path: '/design', query: route.query.cabinet ? { cabinet: route.query.cabinet } : {} }));

// The drawers on the cabinet's openings, not ones kept for a row its layout no longer has.
const drawers = computed(() => mountedDesigns(store.project!, store.materials).filter(isDrawer));
const design = computed(() => drawers.value.find((d) => d.id === route.query.drawer) ?? drawers.value[0]);
const current = computed<SlideFit | undefined>(() => {
  try {
    return design.value && drawerSlide(design.value, store.project!, store.jobShop);
  } catch {
    return undefined;
  }
});

const extension = ref<'any' | NonNullable<Slide['extension']>>('any');
const close = ref<'any' | NonNullable<Slide['close']>>('any');

const matches = computed(() =>
  store.shop.hardware
    .filter(isSlide)
    .filter((s) => s.generic || ((extension.value === 'any' || s.extension === extension.value) && (close.value === 'any' || s.close === close.value)))
    .map((slide) => {
      // What this slide would be on this drawer: its longest length that fits.
      const fit = design.value && current.value ? slideFit({ ...design.value, slide: { slideId: slide.id, faceFrameMount: design.value.slide.faceFrameMount } }, slide, current.value.room) : undefined;
      return { slide, fit };
    }),
);

const facts = (s: Slide) =>
  [
    `${slideMountWords(s)}, ${L.value(s.sideClearance.mm)} clearance each side`,
    `${s.lengths.length} lengths, ${L.value(s.lengths[0]!.mm)} to ${L.value(s.lengths.at(-1)!.mm)}`,
    s.extension === 'full' ? 'full extension' : s.extension === 'threeQuarter' ? '3/4 extension' : '',
    s.close === 'soft' ? 'soft close' : s.close === 'self' ? 'self close' : '',
  ]
    .filter(Boolean)
    .join(' · ');

function choose(slide: Slide) {
  if (design.value) chooseSlide(design.value, slide);
  void router.push(back.value);
}
</script>

<template>
  <div class="d-flex align-center mb-6">
    <h1 class="text-h4 flex-grow-1">Choose a drawer slide</h1>
    <v-btn :to="back" variant="text">Back to Design</v-btn>
  </div>
  <v-alert v-if="!design || !current" type="info" variant="tonal">This project has no drawer on a designed cabinet.</v-alert>
  <v-row v-else>
    <v-col cols="12" md="4">
      <v-card class="pa-5">
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ design.name }}: the cabinet has {{ L(current.room) }} of clear depth for a slide.
        </div>
        <v-select
          v-model="extension"
          label="Extension"
          class="mb-3"
          :items="[{ title: 'Any', value: 'any' }, { title: 'Full', value: 'full' }, { title: '3/4', value: 'threeQuarter' }]"
        />
        <v-select v-model="close" label="Close" :items="[{ title: 'Any', value: 'any' }, { title: 'Soft close', value: 'soft' }, { title: 'Self close', value: 'self' }]" />
      </v-card>
    </v-col>
    <v-col cols="12" md="8">
      <v-card v-for="{ slide, fit } in matches" :key="slide.id" class="pa-4 mb-3 d-flex align-center ga-3 flex-wrap flex-sm-nowrap">
        <div class="flex-grow-1">
          <div class="text-subtitle-1">
            {{ slide.name }}
            <v-chip v-if="slide.generic" size="x-small" class="ml-2">Generic</v-chip>
            <v-chip v-if="fit?.fits" size="x-small" color="success" variant="tonal" class="ml-2">{{ L(fit.length.mm) }} fits</v-chip>
            <v-chip v-else-if="fit" size="x-small" color="warning" variant="tonal" class="ml-2">No length fits</v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis">{{ facts(slide) }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ slide.holes?.length ? 'Has hole data: its screw holes are drilled on the CNC.' : 'No hole data: it is positioned and screwed on by hand.' }}
          </div>
          <div v-if="slide.note" class="text-body-2 text-warning">{{ slide.note }}</div>
        </div>
        <v-chip v-if="slide.id === current.slide.id" color="primary" variant="tonal" size="small" class="flex-shrink-0">Chosen</v-chip>
        <v-btn v-else variant="tonal" @click="choose(slide)">Use this slide</v-btn>
      </v-card>
    </v-col>
  </v-row>
</template>
