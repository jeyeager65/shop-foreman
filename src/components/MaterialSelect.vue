<script setup lang="ts">
/**
 * Picks one of the project's materials. The project's own come first; below them, the
 * catalog's other entries as "Add from the catalog": choosing one copies it into the
 * project and picks the copy.
 */
import { computed } from 'vue';
import { addMaterialFromCatalog, materialTitle } from '@/design';
import type { Material, MaterialUse } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{
  label: string;
  /** Only materials the bits have settings for: a part cut on the CNC. */
  cnc?: boolean;
  /** What is being picked: only materials tagged for it (or tagged for nothing) are offered, and the one already chosen. */
  use?: MaterialUse;
  hideDetails?: boolean;
}>();
const model = defineModel<string>({ required: true });
const store = useAppStore();
const ADD = 'catalog:';

// A bit's settings are by material type (its group's id); a material saved before types has them under its own id.
const cut = (m: Material) => store.shop.tools.some((t) => t.settings[m.groupId] ?? t.settings[m.id]);
const usable = (m: Material) => m.id === model.value || ((!props.cnc || cut(m)) && (!props.use || !m.uses?.length || m.uses.includes(props.use)));
const items = computed(() => {
  const own = store.materials.filter(usable);
  const add = store.shop.materialCatalog.filter((m) => usable(m) && !own.some((o) => o.id === m.id));
  return [
    ...own.map((m) => ({ title: materialTitle(m, store.sizeLength), value: m.id })),
    ...add.map((m) => ({ title: `Add from the catalog: ${materialTitle(m, store.sizeLength)}`, value: `${ADD}${m.id}` })),
  ];
});
const value = computed({
  get: () => model.value,
  set: (id: string) => {
    if (!id.startsWith(ADD)) return void (model.value = id);
    const copy = store.project && addMaterialFromCatalog(store.project, store.shop.materialCatalog, id.slice(ADD.length));
    if (copy) model.value = copy.id;
  },
});
</script>

<template>
  <v-select v-model="value" :label="label" :items="items" :hide-details="hideDetails" data-test="material" />
</template>
