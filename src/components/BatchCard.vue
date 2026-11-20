<script setup lang="ts">
/**
 * The batch in hand, on Plan: which of the project's parts this job makes. A
 * select of the project's batches ("Everything" first, "What is left" once something is cut), and for the
 * one in hand its name and its three choices: cabinets, kinds of part, materials, each empty for all.
 * Under them, what is cut: marking this job's parts as cut, how much of the project is, and the parts
 * whose design has changed since. `compact`: only the line that says which batch is in hand and the
 * button that marks it cut, for Cut and Build.
 */
import { mdiCheck, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import PanelTitle from '@/components/PanelTitle.vue';
import { LEFT_BATCH_ID, addBatch, batchChoices, batchInHand, batchWords, cutChanges, cutCount, forgetCut, markCut, removeBatch } from '@/job/batch';
import type { Part } from '@/model';
import { useAppStore } from '@/stores/app';

defineProps<{ compact?: boolean }>();
const store = useAppStore();
const project = computed(() => store.project!);
const batch = computed(() => batchInHand(project.value));
const left = computed(() => batch.value?.id === LEFT_BATCH_ID);
const EVERYTHING = '';
const anyCut = computed(() => !!project.value.plan.cut);
const items = computed(() => [
  { title: 'Everything: the whole project as one job', value: EVERYTHING },
  ...(anyCut.value ? [{ title: 'What is left: every part not yet marked as cut', value: LEFT_BATCH_ID }] : []),
  ...(project.value.plan.batches ?? []).map((b) => ({ title: b.name, value: b.id })),
]);
function choose(id: string) {
  if (id === EVERYTHING) delete project.value.plan.batchId;
  else project.value.plan.batchId = id;
}
// A batch that chooses nothing that exists has no job: what it can choose from is kept from the last job that was built.
const known = ref<Part[]>([]);
watch(
  () => store.job.job?.projectParts,
  (parts) => parts && (known.value = parts),
  { immediate: true },
);
const choices = computed(() => batchChoices(project.value, known.value, store.materials));
const counts = computed(() => {
  const job = store.job.job;
  return job ? { made: job.parts.length + job.cabinetParts.length, all: job.projectParts.length } : undefined;
});
const words = computed(() => (batch.value ? batchWords(batch.value, project.value, store.materials) : ''));

/** What is cut. */
const cut = computed(() => cutCount(project.value, known.value));
/** Whether every part of the job in hand is already marked as cut. */
const allMarked = computed(() => {
  const job = store.job.job;
  return !!job && cutCount(project.value, [...job.parts, ...job.cabinetParts]).cut === cutCount(project.value, [...job.parts, ...job.cabinetParts]).all;
});
function mark() {
  const job = store.job.job;
  if (!job) return;
  markCut(project.value, [...job.parts, ...job.cabinetParts], job.batch?.name ?? 'Everything', new Date().toISOString());
  // What was left is cut now: nothing is left to make a job of.
  if (left.value) delete project.value.plan.batchId;
}
const materialName = (id: string) => store.materials.find((m) => m.id === id)?.name ?? id;
const changed = computed(() => cutChanges(project.value, known.value, store.sizeLength, materialName));
const day = (iso: string) => new Date(iso).toLocaleDateString();
</script>

<template>
  <div v-if="compact" class="text-body-2 mb-3 d-flex align-center flex-wrap ga-2" data-test="batch-line">
    <template v-if="batch">
      <span><span class="text-medium-emphasis">Batch:</span> <span class="font-weight-bold">{{ batch.name }}</span></span>
      <span class="text-medium-emphasis">· {{ words }}<template v-if="counts"> · {{ counts.made }} of the project's {{ counts.all }} parts</template> ·</span>
      <router-link to="/plan" class="text-primary">Change on Plan</router-link>
    </template>
    <template v-if="store.job.job && (batch || anyCut)">
      <v-btn v-if="!allMarked" size="small" variant="tonal" color="primary" :prepend-icon="mdiCheck" data-test="mark-cut" @click="mark">Mark this job as cut</v-btn>
      <span v-else class="text-medium-emphasis" data-test="marked-cut">Every part of this job is marked as cut.</span>
    </template>
  </div>
  <v-card v-else class="pa-5 mb-4" data-test="batch-card">
    <PanelTitle icon="parts">What this job makes</PanelTitle>
    <v-row density="compact" class="align-center">
      <v-col cols="12" md="6">
        <v-select :model-value="batch?.id ?? EVERYTHING" label="Batch" :items="items" hide-details data-test="batch-select" @update:model-value="choose($event)" />
      </v-col>
      <v-col cols="12" md="6" class="d-flex ga-2">
        <v-btn variant="tonal" color="primary" :prepend-icon="mdiPlus" data-test="batch-add" @click="addBatch(project)">New batch</v-btn>
        <v-btn v-if="batch && !left" variant="text" color="error" :prepend-icon="mdiTrashCanOutline" data-test="batch-remove" @click="removeBatch(project, batch.id)">Delete it</v-btn>
      </v-col>
    </v-row>
    <template v-if="batch && !left">
      <v-row density="compact" class="mt-1">
        <v-col cols="12" md="6"><v-text-field v-model="batch.name" label="Its name" hint="It is in the names of its files." persistent-hint data-test="batch-name" /></v-col>
        <v-col cols="12" md="6"><v-select v-model="batch.cabinetIds" label="Cabinets" :items="choices.cabinets" multiple chips closable-chips clearable placeholder="All of them" persistent-placeholder hide-details data-test="batch-cabinets" /></v-col>
        <v-col cols="12" md="6"><v-select v-model="batch.kinds" label="Kinds of part" :items="choices.kinds" multiple chips closable-chips clearable placeholder="Every kind" persistent-placeholder hide-details data-test="batch-kinds" /></v-col>
        <v-col cols="12" md="6"><v-select v-model="batch.materialIds" label="Materials" :items="choices.materials" multiple chips closable-chips clearable placeholder="Every material" persistent-placeholder hide-details data-test="batch-materials" /></v-col>
      </v-row>
      <div class="text-body-2 text-medium-emphasis mt-3" data-test="batch-words">
        This job makes {{ words }}<template v-if="counts">: {{ counts.made }} of the project's {{ counts.all }} parts</template>. A part is in the batch when it is in every one of the three choices; one left
        empty takes all. Plan's methods and bits are the project's, shared by its batches.
      </div>
    </template>
    <div v-else-if="left" class="text-body-2 text-medium-emphasis mt-3" data-test="batch-words">
      This job makes {{ words }}<template v-if="counts">: {{ counts.made }} of the project's {{ counts.all }} parts</template>.
    </div>
    <div v-else class="text-body-2 text-medium-emphasis mt-3">
      Every part of the project, nested and cut as one job. A batch is a job of part of it: some cabinets, some kinds of part (all the cases first, the doors later), some materials.
    </div>

    <!-- What is cut: marking this job, how much of the project is, and what has changed since. -->
    <div class="d-flex align-center flex-wrap ga-3 mt-4" data-test="batch-cut">
      <v-btn v-if="store.job.job && !allMarked" size="small" variant="tonal" color="primary" :prepend-icon="mdiCheck" data-test="mark-cut" @click="mark">Mark this job as cut</v-btn>
      <span v-if="anyCut" class="text-body-2" data-test="cut-count">{{ cut.cut }} of the project's {{ cut.all }} parts are marked as cut.</span>
      <span v-else class="text-body-2 text-medium-emphasis">Once a job is cut, mark it: "What is left" is then a batch of its own, and a part whose design changes afterwards is named here.</span>
      <v-btn v-if="anyCut" size="small" variant="text" data-test="forget-cut" @click="forgetCut(project)">Forget what was cut</v-btn>
    </div>
    <v-alert v-if="changed.length" type="warning" variant="tonal" density="compact" class="mt-3" data-test="cut-changes">
      <div class="font-weight-bold mb-1">{{ changed.length === 1 ? 'A part is' : `${changed.length} parts are` }} no longer what was cut. Whether to cut {{ changed.length === 1 ? 'it' : 'them' }} again is yours to decide.</div>
      <div v-for="c in changed" :key="c.partId" class="d-flex align-start flex-wrap ga-2 mb-1">
        <div class="flex-grow-1">
          <span class="font-weight-bold">{{ c.name }}</span> (cut in "{{ c.batch }}", {{ day(c.at) }}). {{ c.changes.join(' ') }}
        </div>
        <v-btn size="x-small" variant="tonal" :data-test="`forget-${c.partId}`" @click="forgetCut(project, [c.partId])">Not cut: put it back in what is left</v-btn>
      </div>
    </v-alert>
  </v-card>
</template>
