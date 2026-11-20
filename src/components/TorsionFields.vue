<script setup lang="ts">
/**
 * A torsion box's values: the two starting points as tiles, which only fill the
 * fields in, then the skins, the ribs and how they are made. Setup shows it for the project's tops, Design for one
 * top that has its own. It edits `box` in place.
 */
import { computed } from 'vue';
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import LengthField from '@/components/LengthField.vue';
import MaterialSelect from '@/components/MaterialSelect.vue';
import { TORSION_STARTS, TORSION_TAKES_NO, type TorsionStart, addMaterialFromCatalog, torsionMaterialIds, torsionStartOf, torsionThickness, torsionTile } from '@/design';
import type { TorsionSettings } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{
  box: TorsionSettings;
  /** The top's size is typed: its overhang is not asked. */
  sized?: boolean;
}>();
const store = useAppStore();
const L = computed(() => store.sizeLength);

const tiles = TORSION_STARTS.map((x) => ({ value: x.value, title: x.title, note: x.note, drawing: torsionTile(x.value === 'light' ? 0.25 : 0.75) }));
const start = computed(() => torsionStartOf(props.box));
/** A starting point fills every value in, and brings its materials into the project. */
function startFrom(which: TorsionStart | '') {
  const made = TORSION_STARTS.find((x) => x.value === which)?.make();
  if (!made) return;
  Object.assign(props.box, { ...made, overhang: props.box.overhang });
  if (store.project) for (const id of torsionMaterialIds(made)) addMaterialFromCatalog(store.project, store.shop.materialCatalog, id);
}
const RIBS_BY = [
  { title: 'Slotted together, on the CNC', value: 'cnc' },
  { title: 'Cut to fit, on the saw', value: 'saw' },
];
/** How thick it stands; nothing while one of its materials is not in the project. */
const thick = computed(() => {
  try {
    return L.value(torsionThickness(props.box, store.materials));
  } catch {
    return '';
  }
});
</script>

<template>
  <div data-test="torsion">
    <ChoiceTiles :model-value="start" :items="tiles" label="Start from" name="torsion-start" @update:model-value="startFrom($event)" />
    <v-row density="compact">
      <v-col cols="6"><MaterialSelect v-model="box.skins.topId" label="Top skin" use="skins" hide-details /></v-col>
      <v-col cols="6"><MaterialSelect v-model="box.skins.bottomId" label="Bottom skin" use="skins" hide-details /></v-col>
      <v-col cols="6"><MaterialSelect v-model="box.ribs.materialId" label="Ribs" use="cases" hide-details /></v-col>
      <v-col cols="3"><LengthField v-model="box.ribs.height" label="Rib height" /></v-col>
      <v-col cols="3"><LengthField v-model="box.ribs.spacing" label="About apart" /></v-col>
      <v-col cols="6">
        <v-select :model-value="box.ribsBy ?? 'cnc'" label="Ribs made" :items="RIBS_BY" hide-details data-test="torsion-ribs-by" @update:model-value="box.ribsBy = $event" />
      </v-col>
      <v-col v-if="!sized" cols="6"><LengthField v-model="box.overhang" label="Over all round (tune me)" /></v-col>
    </v-row>
    <div class="text-caption text-medium-emphasis" data-test="torsion-words">
      <template v-if="thick">{{ thick }} thick: the skins and the ribs. </template>{{ TORSION_TAKES_NO }}
    </div>
  </div>
</template>
