<script setup lang="ts">
/**
 * The project's materials: copies of catalog entries, each with
 * the measured thickness of what was bought for this project. Measuring one batch
 * changes this project only; the catalog stays as it is.
 */
import { computed, ref } from 'vue';
import LengthField from '@/components/LengthField.vue';
import { addMaterialFromCatalog, materialTitle } from '@/design';
import { useAppStore } from '@/stores/app';

const store = useAppStore();
const props = defineProps<{ /** Ids the project's values name: those cannot be removed. */ used: string[] }>();
const toAdd = ref<string | null>(null);
const addable = computed(() =>
  store.shop.materialCatalog.filter((m) => !store.materials.some((o) => o.id === m.id)).map((m) => ({ title: materialTitle(m, store.sizeLength), value: m.id })),
);
function add(id: string | null) {
  if (id && store.project) addMaterialFromCatalog(store.project, store.shop.materialCatalog, id);
  toAdd.value = null;
}
function remove(id: string) {
  if (store.project) store.project.materials = store.project.materials.filter((m) => m.id !== id);
}
</script>

<template>
  <div data-test="project-materials">
    <v-row v-for="m in store.materials" :key="m.id" density="compact" class="align-center">
      <v-col cols="5">{{ materialTitle(m, store.sizeLength) }}</v-col>
      <v-col cols="5">
        <LengthField
          v-model="m.measuredThickness"
          label="Measured thickness"
          default-unit="mm"
          :tune-me="m.tuneMe.includes('measuredThickness')"
          @update:model-value="m.tuneMe = m.tuneMe.filter((k) => k !== 'measuredThickness')"
        />
      </v-col>
      <v-col cols="2">
        <v-btn v-if="!props.used.includes(m.id)" variant="text" size="small" @click="remove(m.id)">Remove</v-btn>
        <span v-else class="text-caption text-medium-emphasis">in use</span>
      </v-col>
    </v-row>
    <v-select
      v-if="addable.length"
      :model-value="toAdd"
      label="Add from the catalog"
      :items="addable"
      density="compact"
      hide-details
      class="mt-2"
      style="max-width: 360px"
      @update:model-value="add"
    />
    <div class="text-caption text-medium-emphasis mt-2">
      What this project is made of. Measure what you bought and type it here: part sizes use it. These are copies of the shop
      profile's material catalog, so changing them changes no other project and not the catalog.
    </div>
  </div>
</template>
