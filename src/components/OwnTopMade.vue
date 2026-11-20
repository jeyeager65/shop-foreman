<script setup lang="ts">
/**
 * How a top of a piece's own, or a table's, is made: a slab, or a torsion box, whose
 * values are shown when it is one. Its overhangs stay the top's own. It edits `top` in place.
 */
import { computed } from 'vue';
import TorsionFields from '@/components/TorsionFields.vue';
import { addMaterialFromCatalog, topSettingsOf, torsionMaterialIds, torsionSettingsOf } from '@/design';
import type { DesignedCabinetContext, OwnTop } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{
  top: OwnTop;
  /**
   * A table's top: it is made as Setup's tops are unless it says otherwise, and this is what Setup gives it.
   * Left out (a case's own top): a slab unless it is a torsion box.
   */
  setup?: 'slab' | 'torsion';
}>();
const store = useAppStore();
const MADE = computed(() => [
  ...(props.setup ? [{ title: `As Setup: ${props.setup === 'torsion' ? 'a torsion box' : 'a slab'}`, value: 'setup' }] : []),
  { title: props.setup ? 'Its own: a slab, one panel with its edge' : 'A slab: one panel, with its edge', value: 'slab' },
  { title: props.setup ? 'Its own: a torsion box, two skins on a grid of ribs' : 'A torsion box: two skins on a grid of ribs', value: 'torsion' },
]);
const made = computed(() => (props.top.torsion ? 'torsion' : props.setup && !props.top.slab ? 'setup' : 'slab'));
/** A torsion box of its own starts as Setup's (the light top's when Setup has none), its materials brought into the project. */
function setMade(value: string) {
  if (value !== 'torsion') delete props.top.torsion;
  if (value === 'slab' && props.setup) props.top.slab = true;
  else delete props.top.slab;
  if (value !== 'torsion' || props.top.torsion || !store.project) return;
  const box = JSON.parse(JSON.stringify(torsionSettingsOf(topSettingsOf(store.project.context as DesignedCabinetContext)))) as NonNullable<OwnTop['torsion']>;
  props.top.torsion = box;
  for (const id of torsionMaterialIds(box)) addMaterialFromCatalog(store.project, store.shop.materialCatalog, id);
}
</script>

<template>
  <div>
    <v-select :model-value="made" label="Made as" :items="MADE" hide-details data-test="own-top-made" @update:model-value="setMade($event)" />
    <TorsionFields v-if="top.torsion" :box="top.torsion" sized class="mt-2" />
    <div v-else-if="made === 'setup' && setup === 'torsion'" class="text-caption text-medium-emphasis mt-1" data-test="own-top-as-setup">
      Its skins, ribs and their spacing are Setup's, under Tops: changing them there changes every top that follows.
    </div>
  </div>
</template>
