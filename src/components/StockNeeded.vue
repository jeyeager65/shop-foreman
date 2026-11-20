<script setup lang="ts">
/**
 * The stock the job needs, on Plan. A one-blank job shows it large: by default the
 * smallest blank that works; with `editable` the user can enter their own piece instead.
 * A job with several blanks lists them, each the smallest that works, a row per blank:
 * its size, what is cut from it and which face is up. Opening a row shows its setups
 * and what each cuts. Warnings about the stock are in the screen's checks strip.
 */
import { mdiChevronDown } from '@mdi/js';
import { computed, ref } from 'vue';
import LengthField from '@/components/LengthField.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import type { Length, PlannedBlank, Setup } from '@/model';
import { partTitle } from '@/design/tags';
import { setupFaces } from '@/plan';
import { useAppStore } from '@/stores/app';

defineProps<{ editable?: boolean }>();

const store = useAppStore();
const choice = computed(() => store.project?.plan.blank);
const plan = computed(() => store.job.job?.plan);
const blanks = computed(() => plan.value?.blanks ?? []);
/** The one blank of a one-blank job: the large figure, and the piece the user may enter. */
const blank = computed(() => (blanks.value.length === 1 ? blanks.value[0] : undefined));
const materialOf = (id: string) => store.materials.find((m) => m.id === id);
const material = computed(() => materialOf(blanks.value[0]?.materialId ?? ''));
const unmeasured = computed(() => material.value?.tuneMe.includes('measuredThickness') ?? false);
const allParts = computed(() => {
  const job = store.job.job;
  return job ? [...job.parts, ...job.cabinetParts] : [];
});
const partNames = (ids: string[]) => ids.map((id) => { const part = allParts.value.find((p) => p.id === id); return part ? partTitle(part) : id; }).join(', ');
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Which face of each part is up, in the parts' own words ("Inside face up"). */
const facesOf = (setup: Setup) => {
  const faces = setupFaces(setup, allParts.value);
  return { ...faces, title: capital(faces.summary) };
};
/** A blank's time on the machine in a few words: "Back face up, flip, front face up". */
const howItLies = (b: PlannedBlank) =>
  capital(b.setups.map((s) => `${s.flipBefore === 'none' ? '' : s.flipBefore.kind === 'slideOnPins' ? 'slide along, ' : 'flip, '}${setupFaces(s, allParts.value).summary}`).join(', '));
const setupOps = (keys: string[]) =>
  keys.length ? keys.map((k) => plan.value?.operations.find((o) => o.key === k)?.label.toLowerCase()).join(', ') : 'nothing to cut';
/** The blanks whose setups are on show. */
const openBlanks = ref(new Set<string>());
function toggleBlank(id: string) {
  const next = new Set(openBlanks.value);
  if (!next.delete(id)) next.add(id);
  openBlanks.value = next;
}
const machine = computed(() => store.machine);
/** The largest piece on hand: the project's own, or the machine profile's sheet. */
const stock = computed(() => plan.value?.stock);
const ownStock = computed(() => !!choice.value?.stock);
const arrangement = computed(() => {
  const count = blank.value?.partIds.length ?? 0;
  if (count < 2) return '';
  const a = blank.value?.arrangement;
  if (Array.isArray(a)) return `Parts in ${a.length} rows, one behind the other`;
  return a === 'column' ? 'Parts one behind the other' : 'Parts side by side';
});
const inches = computed(() => store.sizeLength);
const mm = computed(() => store.cncLength);

const own = computed(() => !!choice.value?.width || !!choice.value?.height);
const spare = computed(() => {
  const b = blank.value;
  if (!b) return null;
  const w = b.size.width - b.minimum.width;
  const h = b.size.height - b.minimum.height;
  return w > 0.5 || h > 0.5 ? { w: Math.max(0, w), h: Math.max(0, h) } : null;
});

function useOwn() {
  const b = blank.value;
  if (!b || !choice.value) return;
  choice.value.width = { mm: b.size.width, unit: 'in' };
  choice.value.height = { mm: b.size.height, unit: 'in' };
}
function useSmallest() {
  if (!choice.value) return;
  delete choice.value.width;
  delete choice.value.height;
}
function set(key: 'width' | 'height', value: Length | null) {
  if (choice.value && value) choice.value[key] = value;
}
function setStock(key: 'width' | 'height', value: Length | null) {
  const c = choice.value;
  const m = machine.value;
  if (!c || !value || !m) return;
  // Starts from the machine profile's sheet the first time one side is changed.
  c.stock ??= { width: { ...m.defaultSheet.x }, height: { ...m.defaultSheet.y } };
  c.stock[key] = value;
}
function useProfileStock() {
  if (choice.value) delete choice.value.stock;
}
</script>

<template>
  <v-card v-if="plan && material" class="pa-5" :variant="blank ? 'tonal' : undefined" :color="blank ? 'primary' : undefined">
    <template v-if="blank">
      <div class="label">{{ own ? 'Stock: your piece' : 'Stock needed (smallest that works)' }}</div>
      <div class="size">{{ inches(blank.size.width) }} × {{ inches(blank.size.height) }}</div>
      <div class="material">
        {{ inches(material.nominalThickness.mm) }} {{ material.name }}, one piece<template v-if="arrangement"> · {{ arrangement.toLowerCase() }}</template>
      </div>
      <div class="text-body-2 mt-1">
        {{ mm(Math.round(blank.size.width)) }} × {{ mm(Math.round(blank.size.height)) }} · width (X) × depth (Y) on the machine · measured
        {{ mm(material.measuredThickness.mm) }} thick<template v-if="unmeasured"> (placeholder: measure your sheet before cutting)</template>
      </div>
      <div v-if="own" class="text-body-2 mt-1">
        The smallest that works is {{ inches(blank.minimum.width) }} × {{ inches(blank.minimum.height) }}<template v-if="spare">;
        yours is {{ inches(spare.w) }} wider and {{ inches(spare.h) }} deeper</template>.
      </div>
      <div v-else-if="stock" class="text-body-2 mt-1">
        Cut from stock up to {{ inches(stock.width) }} × {{ inches(stock.height) }}<template v-if="!ownStock && machine">
          (a {{ inches(machine.defaultSheet.x.mm) }} × {{ inches(machine.defaultSheet.y.mm) }} sheet less the saw cuts)</template>. Fits the parts with {{ mm(blank.edgeMargin) }} of
        waste around them, the flip pins and the probe spot.
      </div>
    </template>
    <template v-else>
      <PanelTitle icon="setups">Blanks: {{ blanks.length }} pieces of stock, each the smallest that works</PanelTitle>
      <div
        v-for="b in blanks"
        :key="b.id"
        class="blank-row"
        data-test="blank-row"
        role="button"
        tabindex="0"
        :aria-expanded="openBlanks.has(b.id)"
        @click="toggleBlank(b.id)"
        @keydown.enter="toggleBlank(b.id)"
      >
        <div class="d-flex align-center ga-4">
          <span class="number">{{ b.index }}</span>
          <div class="flex-grow-1">
            <div class="material">{{ inches(b.size.width) }} × {{ inches(b.size.height) }} <span class="text-medium-emphasis">· {{ b.label }}</span></div>
            <div class="text-body-2 text-medium-emphasis">{{ partNames(b.partIds) }}</div>
          </div>
          <span class="text-body-2 text-right" :class="b.setups.length > 1 ? 'text-warning' : 'text-medium-emphasis'">{{ howItLies(b) }}</span>
          <v-icon :icon="mdiChevronDown" size="20" class="chevron" :class="{ turned: openBlanks.has(b.id) }" />
        </div>
        <div v-show="openBlanks.has(b.id)" class="detail">
          <div class="text-body-2 text-medium-emphasis mb-2">
            {{ mm(Math.round(b.size.width)) }} × {{ mm(Math.round(b.size.height)) }}, width (X) × depth (Y) on the machine · measured
            {{ mm(b.size.thickness) }} thick<template v-if="materialOf(b.materialId)?.tuneMe.includes('measuredThickness')"> (placeholder)</template><template v-if="b.grainAxis">
              · grain along {{ b.grainAxis === 'y' ? 'the depth (Y)' : 'the width (X)' }}</template>
          </div>
          <template v-for="setup in b.setups" :key="setup.index">
            <div v-if="setup.flipBefore !== 'none' && setup.flipBefore.kind === 'slideOnPins'" class="text-body-2 text-warning">
              Longer than the machine reaches: slide the sheet {{ mm(Math.round(setup.flipBefore.distance)) }} toward the front onto pins; Z is probed again
            </div>
            <div v-else-if="setup.flipBefore !== 'none'" class="text-body-2 text-warning">Flip left to right onto pins; Z is probed again on the new top face</div>
            <div class="text-body-2">
              <span class="font-weight-bold">Setup {{ setup.index }} · {{ facesOf(setup).title }}</span>
              <span v-if="facesOf(setup).mixed" data-test="setup-faces"> · {{ facesOf(setup).detail }}</span>
              <span class="text-medium-emphasis"> · {{ setupOps(setup.operationKeys) }}</span>
            </div>
          </template>
        </div>
      </div>
      <div v-if="stock" class="text-caption text-medium-emphasis mt-3">
        Each is cut from stock up to {{ inches(stock.width) }} × {{ inches(stock.height) }}<template v-if="!ownStock && machine">
          (a {{ inches(machine.defaultSheet.x.mm) }} × {{ inches(machine.defaultSheet.y.mm) }} sheet less the saw cuts)</template>, with
        room for the waste around the parts, the flip pins and the probe spot. Click a blank for its setups.
      </div>
    </template>
    <template v-if="editable && choice">
      <div class="text-body-2 mt-4 mb-2">
        Largest stock I have{{ ownStock ? ' (as measured)' : ' (nominal sheet from the machine profile; planned a saw cut shorter)' }}
      </div>
      <v-row v-if="stock" density="compact" class="stock-fields">
        <v-col cols="6">
          <LengthField
            :model-value="choice.stock?.width ?? machine?.defaultSheet.x ?? null"
            label="Stock width"
            @update:model-value="setStock('width', $event)"
          />
        </v-col>
        <v-col cols="6">
          <LengthField
            :model-value="choice.stock?.height ?? machine?.defaultSheet.y ?? null"
            label="Stock length"
            @update:model-value="setStock('height', $event)"
          />
        </v-col>
      </v-row>
      <v-btn v-if="ownStock" variant="text" size="small" class="mb-2" @click="useProfileStock">Use the machine profile's sheet</v-btn>
      <v-row v-if="own && blank" density="compact" class="mt-3">
        <v-col cols="6"><LengthField :model-value="choice.width ?? null" label="Width (X)" @update:model-value="set('width', $event)" /></v-col>
        <v-col cols="6"><LengthField :model-value="choice.height ?? null" label="Depth (Y)" @update:model-value="set('height', $event)" /></v-col>
      </v-row>
      <v-btn v-if="own && blank" variant="outlined" size="small" class="mt-2" @click="useSmallest">Use the smallest size</v-btn>
      <v-btn v-else-if="blank" variant="outlined" size="small" class="mt-3" @click="useOwn">Enter my own piece</v-btn>
    </template>
  </v-card>
</template>

<style scoped>
.label {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.size {
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}
.material {
  font-size: 1.3rem;
  font-weight: 500;
}
.blank-row {
  padding: 10px 4px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  cursor: pointer;
}
.blank-row:first-of-type {
  border-top: 0;
}
.blank-row .material {
  font-size: 1.1rem;
}
.number {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.16);
}
.detail {
  margin: 8px 0 2px 46px;
}
.chevron {
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
.stock-fields {
  max-width: 420px;
}
</style>
