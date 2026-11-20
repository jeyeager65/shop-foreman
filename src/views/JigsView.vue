<script setup lang="ts">
/**
 * Jigs and handles, with no project: a place to see the 3D printed and CNC cut jigs and handles, enter
 * their parameters and print or cut them without a whole project.
 *
 * `#/jigs` lists everything the app makes that is not a cabinet part (`jigItems`), each under a
 * picture; `#/jigs?item=<id>` opens one: its sizes as fields, a picture that follows them, and its
 * output, a 3MF to print or G-code for a machine of the shop. Nothing is saved in a project. What was
 * typed last is kept in the browser; a handle's sizes can be saved to its entry in the shop profile.
 */
import { mdiArrowLeft, mdiCubeOutline, mdiPrinter3dNozzleOutline, mdiRobotIndustrialOutline } from '@mdi/js';
import manifoldUrl from 'manifold-3d/manifold.wasm?url';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MeshView from '@/components/MeshView.vue';
import StockCarveView from '@/components/StockCarveView.vue';
import MmField from '@/components/MmField.vue';
import PocketGuideInUse from '@/components/PocketGuideInUse.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import { type JigFile, type JigItem, type JigValues, handleWith, jigItems, withCopies } from '@/jigs/catalog';
import type { PrintObject } from '@/jigs/threemf';
import { write3mf } from '@/jigs/threemf';
import type { Handle, ShownIn } from '@/model';
import { useAppStore } from '@/stores/app';
import { download } from '@/ui/format';
import { meshPicture } from '@/ui/meshScene';

/** Where the browser fetches Manifold's WebAssembly from. Under test it is loaded from the package itself. */
const wasmUrl = import.meta.env.MODE === 'test' ? undefined : manifoldUrl;

const store = useAppStore();
const route = useRoute();
const router = useRouter();

const items = computed(() => jigItems(store.shop));
const groups = computed(() => (['Handles', 'Drawer inserts', 'Jigs', 'Install kit'] as const).map((group) => ({ group, items: items.value.filter((i) => i.group === group) })).filter((g) => g.items.length));
const item = computed(() => items.value.find((i) => i.id === route.query.item));
const open = (id?: string) => void router.push(id ? { path: '/jigs', query: { item: id } } : { path: '/jigs' });

/** What was typed last for each item, and how many: kept in this browser, not in the shop profile or a project. */
const KEPT = 'shop-foreman:jigs';
interface Kept {
  values: JigValues;
  quantity: number;
  shownIn?: ShownIn;
}
function readKept(): Record<string, Kept> {
  try {
    return (JSON.parse(globalThis.localStorage?.getItem(KEPT) ?? '{}') as Record<string, Kept>) ?? {};
  } catch {
    return {};
  }
}
const kept = reactive<Record<string, Kept>>(readKept());
watch(
  kept,
  (k) => {
    try {
      globalThis.localStorage?.setItem(KEPT, JSON.stringify(k));
    } catch {
      // Not kept, then.
    }
  },
  { deep: true },
);
/** The item's values on the page: what was typed last over what the shop profile and the job's usual values give. */
const state = computed<Kept | undefined>(() => {
  const i = item.value;
  if (!i) return undefined;
  kept[i.id] ??= { values: {}, quantity: 1 };
  return kept[i.id];
});
const values = computed<JigValues>(() => ({ ...item.value?.defaults, ...state.value?.values }));
const set = (key: string, value: number | string | null) => {
  if (!state.value || value === null) return;
  state.value.values[key] = value;
  // A pin, a hinge or a handle chosen fills in the sizes that come from it.
  Object.assign(state.value.values, item.value?.follow?.(key, value) ?? {});
};
const changed = computed(() => !!item.value && Object.entries(state.value?.values ?? {}).some(([k, v]) => item.value!.defaults[k] !== v));
const startAgain = () => {
  if (state.value) state.value.values = {};
};
const quantity = computed({
  get: () => state.value?.quantity ?? 1,
  set: (n: number) => {
    if (state.value) state.value.quantity = Math.min(200, Math.max(1, Math.floor(Number(n)) || 1));
  },
});
/** The fields that apply: a printed handle shows the hole of the fastening chosen. */
const fields = computed(() =>
  (item.value?.fields ?? []).filter((f) => {
    const fastening = values.value['printed.fastening'];
    if (f.key.startsWith('printed.insert')) return fastening === 'heatSetInsert';
    if (f.key.startsWith('printed.pilot')) return fastening === 'screw';
    return f.when ? f.when(values.value) : true;
  }),
);
const problems = computed(() => (item.value ? item.value.problems(values.value) : []));

/** The solids for the picture: built again, a moment after the last change. */
const solids = shallowRef<PrintObject[]>([]);
const building = ref(false);
const buildError = ref('');
let buildRun = 0;
let buildTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  [item, values],
  () => {
    clearTimeout(buildTimer);
    const i = item.value;
    if (!i) return void (solids.value = []);
    const run = ++buildRun;
    building.value = true;
    buildTimer = setTimeout(async () => {
      try {
        if (i.problems(values.value).length) throw new Error('');
        const objects = await i.build(JSON.parse(JSON.stringify(values.value)) as JigValues, wasmUrl);
        if (run !== buildRun) return;
        solids.value = objects;
        buildError.value = '';
      } catch (e) {
        if (run !== buildRun) return;
        solids.value = [];
        buildError.value = e instanceof Error ? e.message : String(e);
      }
      building.value = false;
    }, 150);
  },
  { immediate: true, deep: true },
);

/** The file to print: as many copies as asked for, laid out on the bed. */
function downloadPrint() {
  if (item.value && solids.value.length) download(item.value.fileName, write3mf(withCopies(solids.value, quantity.value)), 'model/3mf');
}

/** A thing cut on the CNC: the machine it is posted for (the shop's machine in use to start with) and its files. */
const machineId = ref(store.shop.activeMachineId);
/** The bit that cuts it: '' leaves it to the planner. Offered: what Plan's row would offer on that machine. */
const bitId = ref('');
const bits = computed(() => {
  const i = item.value;
  if (!i?.bits || problems.value.length) return { offered: [] };
  try {
    return i.bits(JSON.parse(JSON.stringify(values.value)) as JigValues, machineId.value);
  } catch {
    return { offered: [] };
  }
});
const bitItems = computed(() => {
  const planner = bits.value.offered.find((b) => b.id === bits.value.chosen);
  return [{ title: planner ? `The planner's choice: ${planner.name}` : "The planner's choice", value: '' }, ...bits.value.offered.map((b) => ({ title: b.name, value: b.id }))];
});
// A bit the machine or the material no longer offers goes back to the planner's.
watch(bits, (b) => {
  if (bitId.value && !b.offered.some((x) => x.id === bitId.value)) bitId.value = '';
});
const gcode = computed<{ files: JigFile[]; error?: string }>(() => {
  const i = item.value;
  if (!i?.gcode || problems.value.length) return { files: [] };
  try {
    return { files: i.gcode(JSON.parse(JSON.stringify(values.value)) as JigValues, quantity.value, machineId.value, bitId.value || undefined) };
  } catch (e) {
    return { files: [], error: e instanceof Error ? e.message : String(e) };
  }
});
/** What the item says about these values, under its sizes. */
const notes = computed(() => (item.value?.notes && !problems.value.length ? item.value.notes(values.value) : []));
/** A test cut in scrap has no solid: its picture is its own G-code, carved out of the scrap. */
const carved = computed(() => (item.value?.carved ? gcode.value.files[0]?.text : undefined));
const downloadFile = (f: JigFile) => download(f.name, f.text ?? f.bytes ?? '', f.text ? 'text/plain' : 'model/3mf');

/** A handle is a library entry: its sizes go back to the shop profile, for every project that uses it. */
const saved = ref(false);
function saveToShop() {
  const i = item.value;
  const index = store.shop.hardware.findIndex((h) => h.id === i?.handleId);
  if (!i || index < 0) return;
  store.shop.hardware[index] = handleWith(store.shop.hardware[index] as Handle, values.value);
  startAgain();
  saved.value = true;
}
watch(
  () => item.value?.id,
  () => (saved.value = false),
);

/** The list's pictures: one small picture an item, drawn once from its starting values. */
const pictures = reactive<Record<string, string>>({});
watch(
  items,
  async (list) => {
    for (const i of list) {
      if (pictures[i.id]) continue;
      try {
        const picture = meshPicture(await i.build(i.defaults, wasmUrl));
        if (picture) pictures[i.id] = picture;
      } catch {
        // No picture for it, then.
      }
    }
  },
  { immediate: true },
);
/** A test cut has no solid to draw: its picture is a file, the scrap carved from its G-code (`scripts/sample-shots.mjs jigs`). */
const carvedPicture = (id: string) => `${import.meta.env.BASE_URL}jigs/${id}.webp`;
const madeWords = (i: JigItem) => (i.made === 'print' ? '3D print' : 'Cut on the CNC');
</script>

<template>
  <!-- One item: its sizes, its picture, its file. -->
  <template v-if="item && state">
    <div class="d-flex align-center ga-3 mb-4">
      <v-btn variant="text" :prepend-icon="mdiArrowLeft" data-test="jigs-back" @click="open()">Jigs and handles</v-btn>
    </div>
    <h1 class="text-h4 mb-1" data-test="jig-title">{{ item.name }}</h1>
    <div class="text-body-1 text-medium-emphasis mb-4">{{ madeWords(item) }} · {{ item.about }}</div>
    <v-alert v-if="item.untested" type="warning" variant="tonal" density="compact" class="mb-4" data-test="jig-untested">
      Not yet printed, cut or used: every size here is a first guess (tune me). Make one and try it before making many.
    </v-alert>
    <v-row>
      <v-col cols="12" md="5">
        <v-card class="pa-5">
          <PanelTitle icon="details">Sizes</PanelTitle>
          <v-row density="compact">
            <v-col v-for="f in fields" :key="f.key" cols="12" sm="6">
              <MmField
                v-if="f.kind === 'mm'"
                :model-value="Number(values[f.key])"
                :owner="state"
                :field="f.key"
                :label="f.label"
                :hint="f.hint"
                :data-test="`jig-field-${f.key}`"
                @update:model-value="set(f.key, $event)"
              />
              <v-select
                v-else-if="f.kind === 'choice'"
                :model-value="values[f.key]"
                :items="f.choices"
                :label="f.label"
                :hint="f.hint"
                :persistent-hint="!!f.hint"
                :data-test="`jig-field-${f.key}`"
                @update:model-value="set(f.key, $event)"
              />
              <v-text-field v-else :model-value="values[f.key]" :label="f.label" type="number" min="1" :data-test="`jig-field-${f.key}`" @update:model-value="set(f.key, Math.max(1, Math.floor(Number($event)) || 1))" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model.number="quantity" label="How many" type="number" min="1" max="200" hide-details data-test="jig-quantity" />
            </v-col>
          </v-row>
          <v-alert v-for="p in problems" :key="p" type="error" variant="tonal" density="compact" class="mt-2" data-test="jig-problem">{{ p }}</v-alert>
          <div v-for="n in notes" :key="n" class="text-body-2 text-medium-emphasis mt-2" data-test="jig-note">{{ n }}</div>
          <div class="d-flex flex-wrap align-center ga-2 mt-3">
            <v-btn v-if="changed" variant="text" size="small" data-test="jig-reset" @click="startAgain">{{ item.handleId ? 'Back to the shop profile\'s sizes' : 'Back to the usual sizes' }}</v-btn>
            <v-btn v-if="item.handleId && changed && !problems.length" variant="tonal" color="primary" size="small" data-test="jig-save" @click="saveToShop">Save to the shop profile</v-btn>
            <span v-if="saved" class="text-caption text-success" data-test="jig-saved">Saved: every project that uses this handle follows.</span>
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            Nothing here is saved in a project. What is typed is kept in this browser.
            <template v-if="item.handleId">A handle's sizes are the shop profile's: saving them changes the handle wherever a project uses it.</template>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="7">
        <v-card class="pa-5 mb-4">
          <PanelTitle icon="view">Picture</PanelTitle>
          <MeshView v-if="solids.length" :objects="solids" />
          <template v-else-if="carved">
            <StockCarveView :gcode="carved" data-test="jig-carved" />
            <div class="text-caption text-medium-emphasis mt-2">
              The scrap as the file cuts it: the G-code below, carved with its bit. Drag to turn, scroll to zoom; the slider steps through the cut.
            </div>
          </template>
          <div v-else class="text-body-2 text-medium-emphasis" data-test="jig-no-picture">
            {{ building ? 'Building…' : buildError || (problems.length ? 'It cannot be drawn until its sizes can be made.' : 'Nothing to draw: it is cut into a piece of scrap.') }}
          </div>
        </v-card>
        <v-card v-if="item.inUse && !problems.length" class="pa-5 mb-4" data-test="jig-in-use">
          <PanelTitle icon="view">In use</PanelTitle>
          <PocketGuideInUse :guide="item.inUse(values)" />
        </v-card>
        <v-card class="pa-5" data-test="jig-output">
          <PanelTitle :icon="item.made === 'print' ? 'kit' : 'gcode'">{{ item.made === 'print' ? 'File to print' : 'G-code' }}</PanelTitle>
          <template v-if="item.made === 'print'">
            <div class="d-flex align-center">
              <span>{{ item.fileName }}</span>
              <span class="flex-grow-1 text-medium-emphasis ml-3">{{ quantity }} on the bed · 3MF, in mm</span>
              <v-btn color="primary" variant="flat" :disabled="!solids.length || !!problems.length" data-test="jig-download" @click="downloadPrint">Download</v-btn>
            </div>
          </template>
          <template v-else>
            <v-select
              v-model="machineId"
              :items="store.shop.machines.map((m) => ({ title: m.name, value: m.id }))"
              label="Machine"
              hint="Posted for this machine, with its feeds and speeds: the same probe and bit-change routine as any file."
              persistent-hint
              class="mb-3"
              data-test="jig-machine"
            />
            <v-select
              v-if="bits.offered.length > 1"
              v-model="bitId"
              :items="bitItems"
              label="Bit"
              hint="The bits that can cut it, with feeds for its material on this machine: what Plan offers a job."
              persistent-hint
              class="mb-3"
              data-test="jig-bit"
            />
            <v-alert v-if="gcode.error" type="error" variant="tonal" density="compact" data-test="jig-gcode-error">{{ gcode.error }}</v-alert>
            <div v-for="f in gcode.files" :key="f.name" class="d-flex align-center mb-1" data-test="jig-gcode-file">
              <span>{{ f.name }}</span>
              <span class="flex-grow-1 text-medium-emphasis text-body-2 ml-3">{{ f.note }}</span>
              <v-btn color="primary" variant="flat" size="small" @click="downloadFile(f)">Download</v-btn>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              <template v-if="!item.bits">The bit is the one the planner chooses for the cut, from the shop's bits with feeds for the material.</template>
              Zero at the stock's front-left corner, as for any job.
            </div>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </template>

  <!-- The list. -->
  <template v-else>
    <h1 class="text-h4 mb-2">Jigs and handles</h1>
    <div class="text-body-1 text-medium-emphasis mb-6">
      What the app makes that is not a cabinet part, to print or to cut on its own: no project needed. Open one to set its sizes.
    </div>
    <template v-for="g in groups" :key="g.group">
      <div class="text-overline text-primary mb-2">{{ g.group }}</div>
      <v-row class="mb-4">
        <v-col v-for="i in g.items" :key="i.id" cols="12" sm="6" md="4" lg="3">
          <v-card class="jig-card" :data-test="`jig-${i.id}`" @click="open(i.id)">
            <img v-if="pictures[i.id] || i.carved" :src="pictures[i.id] ?? carvedPicture(i.id)" alt="" class="jig-picture" />
            <div v-else class="jig-picture empty"><v-icon :icon="mdiCubeOutline" size="40" /></div>
            <div class="pa-4">
              <div class="font-weight-bold">{{ i.name }}</div>
              <div class="text-caption text-medium-emphasis d-flex align-center ga-1 mb-1">
                <v-icon :icon="i.made === 'print' ? mdiPrinter3dNozzleOutline : mdiRobotIndustrialOutline" size="14" />
                {{ madeWords(i) }}
                <v-chip v-if="i.untested" size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
              </div>
              <div class="text-body-2 text-medium-emphasis about">{{ i.about }}</div>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </template>
</template>

<style scoped>
.jig-card {
  height: 100%;
  cursor: pointer;
}
.jig-picture {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: linear-gradient(#f1ede6, #cfc8bc);
}
.jig-picture.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.25);
}
.about {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
