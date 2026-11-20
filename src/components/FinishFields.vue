<script setup lang="ts">
/**
 * The project's paint and stain: a row of swatches for each group of parts, to try
 * one after another in the 3D view. Nothing here changes what is cut.
 */
import { computed, ref } from 'vue';
import HelpText from '@/components/HelpText.vue';
import { mark } from '@/components/presetMarks';
import { FINISH_GROUPS, INSIDE_FINISHES, type FinishGroup, clearCoatOf, clearCoats, finishesOf, isColour, setClearCoat, setFinish, setInsideFinish, stainedWithoutGrain } from '@/design';
import { useAppStore } from '@/stores/app';

const props = defineProps<{
  /** Leave out the groups a project has none of. */
  groups?: FinishGroup[];
  /** Setup: the path these values are under, for the marks on what differs from the preset (`presetMarks.ts`). */
  marks?: string;
}>();
const store = useAppStore();
/** The swatches are the paints and the stains: a clear coat and a primer go with one, and are not chosen for a group. */
const finishes = computed(() => (store.shop.finishes ?? []).filter(isColour));
/** The project's one clear coat, asked only when the shop has more than one to choose between. */
const clears = computed(() => clearCoats(store.shop).map((f) => ({ title: f.name, value: f.id })));
const clear = computed({
  get: () => (store.project ? clearCoatOf(store.project, store.shop)?.id : undefined),
  set: (value) => store.project && setClearCoat(store.project, store.shop, value),
});
const chosen = computed(() => (store.project ? finishesOf(store.project, store.shop) : {}));
const rows = computed(() => FINISH_GROUPS.filter((g) => !props.groups || props.groups.includes(g.group)));
/** The swatch the pointer or the keyboard is on, so its name can be read before it is chosen. */
const hovering = ref<{ group: FinishGroup; name: string } | null>(null);
/** What the insides and the drawer boxes get: asked with the case's finish. */
const inside = computed({
  get: () => store.project?.settings.finish?.inside ?? 'bare',
  set: (value) => store.project && setInsideFinish(store.project, 'inside', value),
});
const boxes = computed({
  get: () => store.project?.settings.finish?.boxes ?? 'bare',
  set: (value) => store.project && setInsideFinish(store.project, 'boxes', value),
});
const pick = (group: FinishGroup, id?: string) => store.project && setFinish(store.project, group, id);
/** A stain on MDF: it is painted, not stained. */
const unstainable = computed(() => (store.project ? stainedWithoutGrain(store.project, store.shop) : []));
</script>

<template>
  <div v-for="row in rows" :key="row.group" class="mb-3" :class="mark(marks, row.key)" :data-test="`finish-${row.group}`">
    <div class="text-caption text-medium-emphasis mb-1">
      {{ row.title }}: <span class="text-high-emphasis">{{ chosen[row.group]?.name ?? 'Unfinished' }}</span>
      <!-- The swatch under the pointer, named: a colour alone does not say "Walnut stain". -->
      <span v-if="hovering?.group === row.group && hovering.name !== (chosen[row.group]?.name ?? 'Unfinished')" class="ml-2" data-test="finish-hover">→ {{ hovering.name }}</span>
    </div>
    <div class="d-flex flex-wrap ga-2">
      <button
        type="button"
        class="swatch none"
        :class="{ on: !chosen[row.group] }"
        title="Unfinished"
        aria-label="Unfinished"
        @click="pick(row.group)"
        @mouseenter="hovering = { group: row.group, name: 'Unfinished' }"
        @focus="hovering = { group: row.group, name: 'Unfinished' }"
        @mouseleave="hovering = null"
        @blur="hovering = null"
      />
      <button
        v-for="f in finishes"
        :key="f.id"
        type="button"
        class="swatch"
        :class="{ on: chosen[row.group]?.id === f.id, stain: f.kind === 'stain' }"
        :style="{ background: f.color }"
        :title="f.name"
        :aria-label="f.name"
        @click="pick(row.group, f.id)"
        @mouseenter="hovering = { group: row.group, name: f.name }"
        @focus="hovering = { group: row.group, name: f.name }"
        @mouseleave="hovering = null"
        @blur="hovering = null"
      />
    </div>
    <v-alert v-if="unstainable.includes(row.group)" type="warning" variant="tonal" density="compact" class="mt-2" :data-test="`stain-on-mdf-${row.group}`">
      Some of these parts are MDF, which is painted, not stained. Choose a paint, or make them of a wood.
    </v-alert>
  </div>
  <v-row v-if="!groups || groups.includes('case')" density="compact" class="mt-1" data-test="finish-inside">
    <v-col cols="12" sm="6" :class="mark(marks, 'inside')">
      <v-select v-model="inside" label="Inside the cases" :items="INSIDE_FINISHES" hide-details data-test="finish-inside-cases" />
    </v-col>
    <v-col cols="12" sm="6" :class="mark(marks, 'boxes')">
      <v-select v-model="boxes" label="Drawer boxes" :items="INSIDE_FINISHES" hide-details data-test="finish-boxes" />
    </v-col>
    <v-col v-if="clears.length > 1" cols="12" sm="6" :class="mark(marks, 'clearId')">
      <v-select v-model="clear" label="The clear coat" :items="clears" hide-details data-test="finish-clear" />
    </v-col>
    <v-col cols="12" class="text-caption text-medium-emphasis">
      A finish goes on what shows with the doors shut: the fronts, a face frame's front and edges, the sides that are not against a wall or a
      neighbour, a back that faces the room. What is seen only with a door or a drawer open gets the answer here; what is never seen gets nothing. A cabinet with no doors
      shows its inside, which is finished as its outside is.
    </v-col>
  </v-row>
  <HelpText>
    Paint and stain for the picture and the lists: nothing that is cut changes. Round swatches are paints, which cover the grain; square ones
    are stains, which colour the wood and leave its grain showing. The finish is the whole project's. The colours are near enough to choose
    between, not a maker's colour: change them, or add your own, in the shop profile.
  </HelpText>
</template>

<style scoped>
.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 0;
}
.swatch.stain {
  border-radius: 5px;
}
.swatch.none {
  background: repeating-linear-gradient(45deg, #d9bf94, #d9bf94 4px, #c9ad80 4px, #c9ad80 8px);
}
.swatch.on {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
