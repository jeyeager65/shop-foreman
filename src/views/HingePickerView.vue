<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { currentOverlay, designsOf, doorSetOf, hingeFor, isDoorSet, isHinge, openingsOf } from '@/design';
import type { Hinge } from '@/model';
import { useAppStore } from '@/stores/app';

const store = useAppStore();
const router = useRouter();
const route = useRoute();
// `?doors=<id>` names the door set; without it, the project's first. `?cabinet=N` is the cabinet to go back to.
const design = computed(() => designsOf(store.project!).filter(isDoorSet).find((d) => d.id === route.query.doors) ?? doorSetOf(store.project!));
const back = computed(() => ({ path: '/design', query: route.query.cabinet ? { cabinet: route.query.cabinet } : {} }));
const opening = computed(() => openingsOf(store.project!, store.materials).find((o) => o.id === design.value.mounting.openingId)!);
const L = computed(() => store.sizeLength);

const angle = ref<'any' | number>('any');
const close = ref<'any' | NonNullable<Hinge['close']>>('any');
const attachment = ref<'any' | NonNullable<Hinge['attachment']>>('any');

const current = computed(() => currentOverlay(opening.value));
const forCabinet = computed(() => store.shop.hardware.filter(isHinge).filter((h) => h.cabinetType === opening.value.cabinetType));
const angles = computed(() => [...new Set(forCabinet.value.flatMap((h) => (h.openingAngleDeg ? [h.openingAngleDeg] : [])))]);
/** Generic entries always stay in the list; products are filtered by the answers. */
const matches = computed(() =>
  forCabinet.value
    .filter(
      (h) =>
        h.generic ||
        ((angle.value === 'any' || h.openingAngleDeg === angle.value) &&
          (close.value === 'any' || h.close === close.value) &&
          (attachment.value === 'any' || h.attachment === attachment.value)),
    )
    .map((h) => ({ hinge: h, off: current.value ? Math.abs(h.overlay.mm - current.value.side) : 0 }))
    .sort((a, b) => a.off - b.off || Number(a.hinge.generic) - Number(b.hinge.generic)),
);

/** The hinge in use on this opening: a frameless opening and a shop-style one each have their own, kept beside the face frame one. */
const chosenId = computed(() => {
  try {
    return hingeFor(design.value.mounting, opening.value.cabinetType, store.shop.hardware).id;
  } catch {
    return undefined;
  }
});

function choose(h: Hinge) {
  if (opening.value.cabinetType === 'frameless') design.value.mounting.framelessHingeId = h.id;
  else if (opening.value.cabinetType === 'shop') design.value.mounting.shopHingeId = h.id;
  else design.value.mounting.hingeId = h.id;
  void router.push(back.value);
}
</script>

<template>
  <div class="d-flex align-center mb-6">
    <h1 class="text-h4 flex-grow-1">Choose a hinge</h1>
    <v-btn :to="back" variant="text">Back to Design</v-btn>
  </div>
  <v-row>
    <v-col cols="12" md="4">
      <v-card class="pa-5">
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ opening.cabinetType === 'faceFrame' ? 'Face frame' : opening.cabinetType === 'shop' ? 'Shop-style' : 'Frameless' }} cabinet<span v-if="opening.cabinetType === 'shop'">, inset doors</span><span v-if="current">, existing doors overlay {{ L(current.side) }} at the sides</span>.
        </div>
        <v-select v-model="angle" label="Opening angle" class="mb-3" :items="[{ title: 'Any', value: 'any' }, ...angles.map((a) => ({ title: `${a}°`, value: a }))]" />
        <v-select v-model="close" label="Close" class="mb-3" :items="[{ title: 'Any', value: 'any' }, { title: 'Soft close', value: 'soft' }, { title: 'Self close', value: 'self' }, { title: 'Free swing', value: 'free' }]" />
        <v-select v-model="attachment" label="Attachment to the door" :items="[{ title: 'Any', value: 'any' }, { title: 'Screw-on', value: 'screwOn' }, { title: 'Press-in dowels', value: 'pressIn' }]" />
      </v-card>
    </v-col>
    <v-col cols="12" md="8">
      <v-card v-for="{ hinge, off } in matches" :key="hinge.id" class="pa-4 mb-3 d-flex align-center ga-3 flex-wrap flex-sm-nowrap">
        <div class="flex-grow-1">
          <div class="text-subtitle-1">
            {{ hinge.name }}
            <v-chip v-if="hinge.generic" size="x-small" class="ml-2">Generic</v-chip>
            <v-chip v-if="current && off < 2" size="x-small" color="success" variant="tonal" class="ml-2">Nearest overlay</v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis">
            {{ hinge.cabinetType === 'shop' ? `Inset, ${L(-hinge.overlay.mm)} gap` : `${L(hinge.overlay.mm)} overlay` }}<span v-if="hinge.sideAdjust"> (adjusts {{ hinge.sideAdjust }} mm either way)</span> · {{ hinge.cup.diameter }} mm cup, {{ hinge.cup.depth }} mm deep, {{ hinge.cup.boreDistance }} mm bore distance
            <span v-if="hinge.dowels"> · dowel holes cut with the cups</span>
            <span v-if="hinge.plate"> · plate holes {{ hinge.plate.setback }} mm from the {{ hinge.cabinetType === 'shop' ? 'back of the door' : 'front edge' }}, {{ hinge.plate.spacing }} mm apart</span>
          </div>
          <div v-if="hinge.note" class="text-body-2 text-warning">{{ hinge.note }}</div>
        </div>
        <v-chip v-if="hinge.id === chosenId" color="primary" variant="tonal" size="small" class="flex-shrink-0">Chosen</v-chip>
        <v-btn v-else variant="tonal" @click="choose(hinge)">Use this hinge</v-btn>
      </v-card>
    </v-col>
  </v-row>
</template>
