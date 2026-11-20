<script setup lang="ts">
/**
 * A new project: first what is being
 * made, a grid of the starters (`StarterGrid`), then in what style, the presets, with the thing just chosen
 * drawn in the style in hand, so the choice is seen rather than read. `#/new` asks the first, `#/new?starter=vanity`
 * the second. Then Setup, or Measure when the cabinets are already there.
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CabinetAssemblyView from '@/components/CabinetAssemblyView.vue';
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import StarterGrid from '@/components/StarterGrid.vue';
import { constructionTile, doorStyleTile, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import type { Preset } from '@/model';
import { presetsOf } from '@/samples/presets';
import { type Starter, startProject, starterById } from '@/samples/starters';
import { useAppStore } from '@/stores/app';

const store = useAppStore();
const route = useRoute();
const router = useRouter();

const starter = computed(() => starterById(String(route.query.starter ?? '')));
/** The styles a starter is offered in: the presets for new cabinets, or the ones for cabinets that are already there. */
const styles = computed(() => (starter.value ? presetsOf(store.shop).filter((p) => (p.start === 'existing') === !!starter.value!.existing) : []));
/** The style last started from is offered first (kept in the browser), else the starter's usual one. */
const LAST_PRESET = 'shop-foreman:lastPreset';
const lastUsed = () => {
  try {
    return globalThis.localStorage?.getItem(LAST_PRESET) ?? undefined;
  } catch {
    return undefined;
  }
};
const chosen = ref('');
watch(
  starter,
  (s) => {
    const ids = styles.value.map((p) => p.id);
    chosen.value = [lastUsed(), s?.prefers].find((id) => id && ids.includes(id)) ?? ids[0] ?? '';
  },
  { immediate: true },
);
const preset = computed(() => styles.value.find((p) => p.id === chosen.value) ?? styles.value[0]);
const STYLE = { faceFrame: 'Face frame', frameless: 'Frameless', shop: 'Inset' };
const tiles = computed(() =>
  styles.value.map((p) => ({
    value: p.id,
    title: p.name,
    note: `${STYLE[p.settings.construction]}${p.builtIn ? '' : ' · your own'}`,
    // A cabinet that stays shows what is made for it, its doors; a new one how it is built.
    drawing: p.start === 'existing' ? doorStyleTile(p.fronts.doors.style.kind) : constructionTile(p.settings.construction),
  })),
);

/** The thing chosen, in the style in hand: the project that Start would make, drawn and never saved. */
const scene = computed(() => {
  if (!starter.value || starter.value.to || !preset.value) return undefined;
  try {
    const { project } = startProject(starter.value, preset.value, store.shop);
    return projectScene(project, shopFor(project, store.shop), store.shop.materialGroups);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

function start(s: Starter, p: Preset) {
  store.newProjectFrom(p, s);
  try {
    if (!s.fixed) globalThis.localStorage?.setItem(LAST_PRESET, p.id);
  } catch {
    // No storage (a private window): the style is not remembered.
  }
  // Cabinets that are already there are measured first.
  void router.push(s.existing ? '/measure' : '/setup');
}
function pick(s: Starter) {
  if (s.to) return void router.push(s.to);
  // One that comes as it is has no style to ask.
  const only = presetsOf(store.shop).find((p) => p.start !== 'existing');
  if (s.fixed && only) return start(s, only);
  void router.push({ path: '/new', query: { starter: s.id } });
}
</script>

<template>
  <template v-if="!starter">
    <h1 class="text-h4 mb-2">What are you making?</h1>
    <p class="text-body-2 text-medium-emphasis mb-5">
      Pick the thing; its style is asked next. Each starts at a usual size, which Design changes, and a project can hold more than one.
    </p>
    <StarterGrid @pick="pick" />
  </template>

  <template v-else>
    <h1 class="text-h4 mb-2">In what style?</h1>
    <p class="text-body-2 text-medium-emphasis mb-5" data-test="new-what">
      {{ starter.title }}: {{ starter.what }}
      <router-link to="/new" class="text-primary ml-1" data-test="new-back">Something else</router-link>
      <template v-if="starter.examples">
        · <router-link :to="{ path: '/samples', query: { q: starter.examples } }" class="text-primary" data-test="new-examples">See finished examples</router-link>
      </template>
    </p>
    <v-row>
      <v-col cols="12" lg="5">
        <v-card class="pa-5" data-test="new-styles">
          <PanelTitle icon="presets">Style</PanelTitle>
          <ChoiceTiles v-model="chosen" :items="tiles" label="Style" name="new-style" />
          <div class="text-body-2 text-medium-emphasis mb-4">
            A style is a preset: how it is built, its fronts, its materials and its finish. Everything it sets can be changed in Setup, and your
            own presets are saved from there.
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn variant="text" to="/new">Back</v-btn>
            <v-spacer />
            <v-btn v-if="preset" color="primary" variant="flat" data-test="new-start" @click="start(starter, preset)">
              {{ starter.existing ? 'Start: measure it' : 'Start' }}
            </v-btn>
          </div>
        </v-card>
      </v-col>
      <v-col v-if="scene" cols="12" lg="7">
        <v-card class="pa-5" data-test="new-picture">
          <PanelTitle icon="view">{{ starter.title }}, {{ preset?.name.toLowerCase() }}</PanelTitle>
          <v-alert v-if="'error' in scene" type="warning" variant="tonal" density="compact">{{ scene.error }}</v-alert>
          <CabinetAssemblyView
            v-else
            :parts="scene.parts"
            :cabinets="scene.cabinets"
            :room="scene.room"
            :frame-key="`${starter.id}-${preset?.id}`"
            :hardware="scene.hardware"
            :finish="scene.finish"
            :faces="scene.faces"
            :slides="scene.slides"
            :casters="scene.casters"
            :appliances="scene.appliances"
            :looks="scene.looks"
          />
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>
