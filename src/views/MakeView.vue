<script setup lang="ts">
/**
 * Cut and Build (milestone 5), the two screens Make became. Cut: everything needed to have
 * every part cut out, with its holes and joints made (the setups, the files, the saw cut
 * list and parts, what is done by hand, the 3D prints). Build: how it goes together once
 * the parts are cut (the build checklist, what to buy, the hardware and the finish, the
 * install kit in place). `screen` says which.
 */
import { mdiChevronDown } from '@mdi/js';
import ChecksStrip, { type Check } from '@/components/ChecksStrip.vue';
import BatchCard from '@/components/BatchCard.vue';
import { wholeProject } from '@/job/batch';
import { buildJob } from '@/job/buildJob';
import PageHeader from '@/components/PageHeader.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import TopicShell from '@/components/TopicShell.vue';
import { type Topic, useTopics } from '@/components/topics';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import HelpText from '@/components/HelpText.vue';
import { useRoute } from 'vue-router';
import { buildInstallKit3mf, installKitFileName } from '@/jigs/installKit';
import { buildPrintedHandles3mf, printedHandlesFileName, printedHandlesOf } from '@/jigs/printedHandles';
import { buildSlideJigs3mf, slideJigsFileName } from '@/jigs/slideJig';
import { buildSlideShims3mf, slideShimsFileName } from '@/jigs/slideShims';
import { hungDesigns, isDoorSet, openingsOf } from '@/design';
import GCodeListing from '@/components/GCodeListing.vue';
import SetupView from '@/components/SetupView.vue';
import StockCarveView from '@/components/StockCarveView.vue';
import ToolpathPreview from '@/components/ToolpathPreview.vue';
import type { GCodeParserInstance } from '@/gcode/gcodeTools';
import { buildChecklistSections, checklistFor } from '@/job/checklist';
import { buildJobZip, filesByBlank, jobZipName } from '@/job/files';
import { buildLists } from '@/job/lists';
import { buyQuantity, grainWords, listsFileName, listsHtml } from '@/job/listsHtml';
import { pocketLedgesOf, setupFaces, withPocketLooks } from '@/plan';
import { useAppStore } from '@/stores/app';
import { cutMethodLabel, download, duration, stepToolLabel } from '@/ui/format';

const CabinetView = defineAsyncComponent(() => import('@/components/CabinetView.vue'));
const props = defineProps<{ screen: 'cut' | 'build' }>();
const cut = computed(() => props.screen === 'cut');

const store = useAppStore();
const job = computed(() => store.job.job);
const machine = computed(() => store.machine!);
const fileIndex = ref(Number(useRoute().query.file) || 0);
const previewMode = ref<'top' | '3d'>(useRoute().query.view === '3d' ? '3d' : 'top');
// The page opens on the tab the link asks for. Cut: ?kit=bed on 3D prints, ?lists on Lists, ?view= or ?file= on Files and
// preview, else Run. Build: ?kit on Install, ?lists on Lists, else the checklist.
const query = useRoute().query;
type Tab = 'run' | 'files' | 'lists' | 'prints' | 'checklist' | 'install';
const tab = ref<Tab>(
  props.screen === 'cut'
    ? query.kit ? 'prints' : 'lists' in query ? 'lists' : query.view || query.file ? 'files' : 'run'
    : query.kit ? 'install' : 'lists' in query ? 'lists' : 'checklist',
);
/** The ticked steps, by section and place in it. */
const done = ref<Record<string, boolean>>({});

/** Every setup of every blank, in order: what the Run tab's picker steps through. */
const views = computed(() => (job.value?.plan.blanks ?? []).flatMap((blank) => blank.setups.map((setup) => ({ blank, setup }))));
/**
 * The Run tab's rail: the blanks, under the material each is cut from in a job of
 * several, a blank's setups under it while it is the one in hand, and a tick on a blank whose steps are all ticked.
 * `#/cut?topic=<blank's id>&sub=<setup>`; the old `?setup=N` (counted through the job from 0) opens that one.
 */
const runTopics = computed((): Topic[] =>
  (job.value?.plan.blanks ?? []).map((blank) => ({
    id: blank.id,
    // A blank's label is its material, and which of that material's blanks it is: `3/4" MDF, 2 of 11`.
    ...(several.value ? { group: blank.label.replace(/, \d+ of \d+$/, '') } : {}),
    title: several.value ? `Blank ${blank.index}` : 'The blank',
    summary: `${store.sizeLength(blank.size.width)} × ${store.sizeLength(blank.size.height)}${blank.setups.length > 1 ? ` · ${blank.setups.length} setups` : ''}`,
    words: blank.setups.length > 1 ? blank.label : `${blank.label} · ${setupFaces(blank.setups[0]!, allParts.value).summary}`,
    done: blankDone(blank.id),
    ...(blank.setups.length > 1
      ? { subs: blank.setups.map((x) => ({ id: String(x.index), title: `Setup ${x.index}`, summary: setupFaces(x, allParts.value).summary, words: `${blank.label} · ${setupFaces(x, allParts.value).summary}` })) }
      : {}),
  })),
);
const askedSetup = () => views.value[Number(query.setup)];
const nav = useTopics(() => runTopics.value, { from: (q) => ('setup' in q ? views.value[Number(q.setup)]?.blank.id : undefined), firstSub: askedSetup() ? String(askedSetup()!.setup.index) : undefined, keep: 'all' });
/** The setup on show, counted through the job from 0. */
const setupIndex = computed(() => Math.max(0, views.value.findIndex((v) => v.blank.id === nav.current?.id && (v.blank.setups.length === 1 || String(v.setup.index) === nav.currentSub?.id))));
const view = computed(() => views.value[setupIndex.value] ?? views.value[0]);
/** Whether every step of a blank's section of the checklist is ticked. */
function blankDone(blankId: string): boolean {
  const i = checklist.value.findIndex((s) => s.blankId === blankId);
  return i >= 0 && checklist.value[i]!.steps.length > 0 && ticked(i) === checklist.value[i]!.steps.length;
}
const setup = computed(() => view.value?.setup);
const several = computed(() => (job.value?.plan.blanks.length ?? 0) > 1);
/** Which face of each part is up in the setup on show, in the parts' own words. */
const faces = computed(() => (setup.value ? setupFaces(setup.value, allParts.value) : undefined));
/** The files under the blank each one cuts. */
const groups = computed(() => (job.value ? filesByBlank(job.value) : []));
/** The blank the previewed file cuts. */
const fileBlank = computed(() => groups.value.find((g) => g.files.some((f) => f.index === fileIndex.value))?.blank);
/** A file's button: its name, or with several blanks the blank's number (and the setup's, when it has two), as on the Run tab. */
function fileLabel(i: number): string {
  const program = job.value?.programs[i];
  if (!program || !several.value) return job.value?.files[i]?.name ?? '';
  return program.blank.setupCount > 1 ? `${program.blank.index}.${program.setup.index}` : `${program.blank.index}`;
}
const allParts = computed(() => (job.value ? [...job.value.parts, ...job.value.cabinetParts] : []));
/** The parts as a blank's picture draws their pocket holes: each as the job makes it. */
const lookedParts = computed(() =>
  job.value && store.project ? withPocketLooks(allParts.value, store.project.plan, job.value.plan.parts, pocketLedgesOf(job.value.plan.operations, store.jobShop.tools)) : allParts.value,
);
const file = computed(() => job.value?.files[fileIndex.value] ?? job.value?.files[0]);
/** Cut's steps (the machine, and what is done by hand to the cut parts) or Build's (finishing, assembly, hanging, runs). */
const checklist = computed(() =>
  job.value && store.project ? checklistFor(buildChecklistSections(store.project, job.value.plan, job.value.programs, store.jobShop.tools, machine.value, store.shop.hardware, store.sawLength, store.shop.finishes), props.screen) : [],
);
/** Sections opened or closed by hand; otherwise the blank on show is open, and every section of a one-blank job. */
const sectionsSet = ref<Record<string, boolean>>({});
const sectionOpen = (i: number) => {
  const section = checklist.value[i]!;
  return sectionsSet.value[section.title] ?? (!several.value || !cut.value || section.blankId === view.value?.blank.id);
};
function toggleSection(i: number) {
  sectionsSet.value = { ...sectionsSet.value, [checklist.value[i]!.title]: !sectionOpen(i) };
}
const ticked = (i: number) => checklist.value[i]!.steps.filter((_, k) => done.value[`${i}:${k}`]).length;
// Another setup shows its blank's steps: what was opened or closed by hand is forgotten.
watch(setupIndex, () => (sectionsSet.value = {}));

/** The Kreg jig's rows with the label, part and face left out where they repeat the row above. */
const kregRows = computed(() =>
  (lists.value?.kreg ?? []).map((k, i, all) => {
    const same = i > 0 && all[i - 1]!.label === k.label;
    return { ...k, first: !same, sameFace: same && all[i - 1]!.face === k.face };
  }),
);
/** A cut-list group's saw when every row is cut on the same one: it goes in the heading instead of a column. */
const oneSaw = (rows: { saw: Parameters<typeof cutMethodLabel>[0] }[]) => (rows.every((r) => r.saw === rows[0]!.saw) ? rows[0]!.saw : undefined);
const partsOpen = ref(false);
const kitName = (jig: { template: string; quantity: number }) => (jig.template === 'supportBlock' ? 'Support blocks' : jig.quantity > 1 ? 'Gap shims' : 'Center gap shim');
/** Inset doors (the shop style) stand in their opening on shims: the in-place picture is for doors hung over a frame or a case front. */
const insetDoors = computed(() => design.value?.mounting.type === 'inset');

/** The parts list, the saw cut list, the hardware and the Kreg jig's holes. */
const lists = computed(() => (job.value && store.project ? buildLists(job.value, store.project, store.jobShop, store.sawLength) : undefined));
/**
 * What to buy: for the whole project, or for the batch in hand. The whole project to start with, since stock
 * is usually bought once; that takes the job of everything, built only while it is asked for.
 */
const buyFor = ref<'project' | 'batch'>('project');
const buying = computed(() => {
  if (!lists.value || !store.project) return [];
  if (!job.value?.batch || buyFor.value === 'batch') return lists.value.buying;
  try {
    const whole = wholeProject(store.project);
    return buildLists(buildJob(whole, store.jobShop), whole, store.jobShop, store.sawLength).buying;
  } catch {
    return lists.value.buying;
  }
});
const hardwareGroups = computed(() => [...new Set(lists.value?.hardware.map((h) => h.group) ?? [])]);
const L = computed(() => store.sizeLength);
/** Sizes in the saw cut list and what to buy: the shop's unit for saw lists. */
const S = computed(() => store.sawLength);
const listsPage = () => listsHtml(store.project!.name, lists.value!, store.sawLength);
/** Prints the lists as their own page, through a frame that is thrown away afterwards. */
function printLists() {
  if (!lists.value || !store.project) return;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  frame.srcdoc = listsPage();
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}
function downloadLists() {
  if (lists.value && store.project) download(listsFileName(store.project.slug), listsPage(), 'text/html');
}
/** The job's printed handles, and how many of each. A plain copy: Manifold shouldn't see Vue's reactive proxies. */
const printedHandles = computed(() => (job.value ? printedHandlesOf([...job.value.parts, ...job.value.cabinetParts], store.shop.hardware) : []));
const handleBytes = () => buildPrintedHandles3mf(JSON.parse(JSON.stringify(printedHandles.value)) as typeof printedHandles.value, wasmUrl);
const handlesBusy = ref(false);
async function downloadHandles() {
  if (!store.project) return;
  handlesBusy.value = true;
  kitError.value = '';
  try {
    download(printedHandlesFileName(store.project.slug), await handleBytes(), 'model/3mf');
  } catch (e) {
    kitError.value = `The handles could not be built: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    handlesBusy.value = false;
  }
}
function downloadSlideJigs() {
  if (lists.value?.slideJigs && store.project) download(slideJigsFileName(store.project.slug), buildSlideJigs3mf(lists.value.slideJigs), 'model/3mf');
}
function downloadShims() {
  if (lists.value?.shims && store.project) download(slideShimsFileName(store.project.slug), buildSlideShims3mf(lists.value.shims), 'model/3mf');
}

/** Whether the job has anything to print: Cut has a tab for them. */
const anyPrints = computed(() => !!job.value && (job.value.plan.installKit.length > 0 || !!lists.value?.shims || printedHandles.value.length > 0));
const cabinets = computed(() => store.project?.context.kind === 'designedCabinet');
const design = computed(() => (store.project ? hungDesigns(store.project, store.jobShop).find(isDoorSet) : undefined));
const opening = computed(() => (store.project ? openingsOf(store.project, store.materials) : []).find((o) => o.id === design.value?.mounting.openingId));
const status = computed(() => {
  const p = job.value?.plan;
  if (!p) return '';
  if (!cut.value) {
    // Build is about the steps, not the machine.
    const steps = checklist.value.reduce((sum, s) => sum + s.steps.length, 0);
    const ticks = checklist.value.reduce((sum, _, i) => sum + ticked(i), 0);
    const context = store.project?.context;
    const cabinets = context?.kind === 'designedCabinet' ? context.pieces.length : 0;
    const made = cabinets > 1 ? `${cabinets} cabinets, ` : '';
    return `${made}${steps} ${steps === 1 ? 'step' : 'steps'} once every part is cut${ticks ? `, ${ticks} done` : ''}`;
  }
  const n = p.blanks.reduce((sum, b) => sum + b.setups.length, 0);
  const setups = n === 1 ? '1 setup' : `${n} setups`;
  const blanks = p.blanks.length > 1 ? `${p.blanks.length} blanks, ` : '';
  return `${blanks}${setups}, ${duration(p.summary.machineSeconds)} on the machine, ${p.summary.toolChanges} bit changes`;
});
const checks = computed<Check[]>(() => [
  // On the tabs that are about running files.
  {
    title: 'Not yet run on a machine',
    text: 'Feeds, depths, dial settings and safe height are placeholders. Preview each file, then air-cut above the stock before a real cut.',
    tone: 'warning',
  },
]);
/** Stored in the machine profile: it is how this machine's files are written. */
const useParameters = computed({
  get: () => machine.value.postOptions?.parameters ?? false,
  set: (on: boolean) => {
    machine.value.postOptions = { ...machine.value.postOptions, parameters: on };
  },
});
const kitBusy = ref(false);
const kitError = ref('');
/** The install kit as a 3MF file. A plain copy goes in: Manifold shouldn't see Vue's reactive proxies. */
const kitBytes = () => {
  const kit = job.value!.plan.installKit;
  return buildInstallKit3mf(JSON.parse(JSON.stringify(kit)) as typeof kit, wasmUrl);
};
const zipBusy = ref(false);
/** Every G-code file, the lists, and the 3D prints the job has (install kit, slide shims), in one ZIP. */
async function downloadAll() {
  if (!job.value || !store.project) return;
  zipBusy.value = true;
  kitError.value = '';
  try {
    const { slug } = store.project;
    const extras = [
      ...(lists.value ? [{ path: listsFileName(slug), text: listsPage() }] : []),
      ...(job.value.plan.installKit.length ? [{ path: installKitFileName(slug), bytes: await kitBytes() }] : []),
      ...(lists.value?.shims ? [{ path: slideShimsFileName(slug), bytes: buildSlideShims3mf(lists.value.shims) }] : []),
      ...(lists.value?.slideJigs ? [{ path: slideJigsFileName(slug), bytes: buildSlideJigs3mf(lists.value.slideJigs) }] : []),
      ...(printedHandles.value.length ? [{ path: printedHandlesFileName(slug), bytes: await handleBytes() }] : []),
    ];
    download(jobZipName(slug), buildJobZip(job.value, extras), 'application/zip');
  } catch (e) {
    kitError.value = `The files could not be zipped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    zipBusy.value = false;
  }
}
async function downloadKit() {
  if (!job.value?.plan.installKit.length || !store.project) return;
  kitBusy.value = true;
  kitError.value = '';
  try {
    download(installKitFileName(store.project.slug), await kitBytes(), 'model/3mf');
  } catch (e) {
    kitError.value = `The install kit could not be built: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    kitBusy.value = false;
  }
}

const stats = ref({ bitChanges: 0, pauses: 0, deepest: 0, alarms: 0 });
function onParsed(parser: GCodeParserInstance) {
  const text = file.value?.text ?? '';
  stats.value = {
    bitChanges: (text.match(/^M0 \(MSG, Router OFF\. Change to /gm) ?? []).length,
    pauses: (text.match(/^M0\b/gm) ?? []).length,
    // From the file's own Z words, so it reads the same whatever the preview does.
    deepest: -Math.min(0, ...[...text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1]))),
    alarms: parser.events.filter((e) => e.kind === 'alarm').length,
  };
}
</script>

<template>
  <PageHeader :title="cut ? 'Cut' : 'Build'" :status="status" :next="cut ? { to: '/build', title: 'Build' } : undefined" />
  <BatchCard v-if="store.project" compact />
  <v-alert v-if="store.job.error" type="error" variant="tonal">{{ store.job.error }}</v-alert>
  <template v-else-if="job">
    <ChecksStrip v-if="tab === 'run' || tab === 'files'" :checks="checks" />
    <v-tabs v-if="cut" v-model="tab" color="primary" class="mb-5">
      <v-tab value="run">Run</v-tab>
      <v-tab value="files">Files and preview</v-tab>
      <v-tab value="lists">Lists</v-tab>
      <v-tab v-if="anyPrints" value="prints" data-test="prints-tab">3D prints</v-tab>
    </v-tabs>
    <v-tabs v-else v-model="tab" color="primary" class="mb-5">
      <v-tab value="checklist">Checklist</v-tab>
      <v-tab value="lists">Lists</v-tab>
      <v-tab v-if="job.plan.installKit.length && design && opening" value="install">Install</v-tab>
    </v-tabs>

    <TopicShell v-if="tab === 'run' && view && setup" :nav="nav" name="run" icon="setup" list-label="Blank" :lg="[3, 5, 4]" :xl="[2, 5, 5]">
          <div class="text-body-2 mb-2" data-test="run-blank">
            <span class="font-weight-bold">{{ store.sizeLength(view.blank.size.width) }} × {{ store.sizeLength(view.blank.size.height) }}</span>
            · {{ view.blank.label }} · {{ store.cncLength(Math.round(view.blank.size.width)) }} × {{ store.cncLength(Math.round(view.blank.size.height)) }},
            measured {{ store.cncLength(view.blank.size.thickness) }} thick
          </div>
          <div v-if="faces?.mixed" class="text-body-2 mb-2" data-test="setup-faces">
            <div v-for="g in faces.groups" :key="g.face"><span class="text-medium-emphasis">{{ g.parts.join(', ') }}:</span> {{ g.up }}</div>
          </div>
          <SetupView :setup="setup" :blank="view.blank" :parts="lookedParts" :machine="machine" />
          <div class="text-body-2 text-medium-emphasis mt-2">
            <span class="text-primary">●</span> Cut in this setup &nbsp; <span class="text-warning">●</span> Pins and flip axis &nbsp;
            <span class="text-success">□</span> Probe spot &nbsp; - - - Cut in the other setup
          </div>
          <div v-if="setup.tile" class="text-body-2 text-medium-emphasis mt-1" data-test="tile-note">
            This blank is longer than the machine reaches. It is cut in two setups on the same face: this one cuts the part of it
            that is not shaded, up to the dashed line.
            <template v-if="setup.tile.shift > 0">
              Before it, the sheet is slid {{ store.cncLength(Math.round(setup.tile.shift)) }} toward the front, its rear pair of
              pin holes onto pins in the front pair of holes in the spoilboard; the front of the sheet hangs over the table.
            </template>
            <template v-else>It also drills the four pin holes; the far end of the sheet hangs over the back of the table.</template>
          </div>
          <div class="text-body-2 text-medium-emphasis mt-1">Front of the machine is at the bottom.</div>
      <template #picture>
        <v-card class="pa-5">
          <PanelTitle icon="checklist">Cutting checklist</PanelTitle>
          <div v-for="(section, i) in checklist" :key="section.title" class="section" data-test="checklist-section">
            <button type="button" class="section-head" :aria-expanded="sectionOpen(i)" @click="toggleSection(i)">
              <v-icon :icon="mdiChevronDown" size="18" class="chevron" :class="{ turned: sectionOpen(i) }" />
              <span class="font-weight-bold flex-grow-1">{{ section.title }}</span>
              <span class="text-body-2 text-medium-emphasis">{{ ticked(i) }} of {{ section.steps.length }}</span>
            </button>
            <div v-show="sectionOpen(i)" class="pl-2">
              <template v-for="(step, k) in section.steps" :key="step.text">
                <v-checkbox v-model="done[`${i}:${k}`]" :label="step.short" density="compact" hide-details />
                <details v-if="step.detail" class="cuts"><summary>What it cuts</summary>{{ step.detail }}</details>
              </template>
            </div>
          </div>
        </v-card>
      </template>
    </TopicShell>
    <!-- A job with nothing for the CNC (a table whose parts are all plain rectangles). -->
    <v-alert v-else-if="tab === 'run' || (tab === 'files' && !file)" type="info" variant="tonal" data-test="no-cnc">
      Nothing here is cut on the CNC: every part is a plain rectangle or a length of stock, cut on the saws. The saw cut list and what is done by hand
      are under Lists; Plan gives a part to the CNC where you would rather it were cut there.
    </v-alert>

    <v-row v-else-if="tab === 'checklist'">
      <v-col cols="12" lg="8">
        <v-card class="pa-5">
          <PanelTitle icon="checklist">Build checklist</PanelTitle>
          <div class="text-body-2 text-medium-emphasis mb-2">Once every part is cut (Cut's checklist): finishing, putting it together, hanging the doors{{ cabinets ? ', setting the runs' : '' }}.</div>
          <div v-for="(section, i) in checklist" :key="section.title" class="section" data-test="checklist-section">
            <button type="button" class="section-head" :aria-expanded="sectionOpen(i)" @click="toggleSection(i)">
              <v-icon :icon="mdiChevronDown" size="18" class="chevron" :class="{ turned: sectionOpen(i) }" />
              <span class="font-weight-bold flex-grow-1">{{ section.title === 'After the machine' ? 'Finish and assemble' : section.title }}</span>
              <span class="text-body-2 text-medium-emphasis">{{ ticked(i) }} of {{ section.steps.length }}</span>
            </button>
            <div v-show="sectionOpen(i)" class="pl-2">
              <template v-for="(step, k) in section.steps" :key="step.text">
                <v-checkbox v-model="done[`${i}:${k}`]" :label="step.short" density="compact" hide-details />
              </template>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="tab === 'files' && file">
      <v-col cols="12">
        <v-card class="pa-5">
          <PanelTitle icon="files">
            Files
            <template #actions>
              <v-switch
                v-model="useParameters"
                label="Editable settings block"
                color="primary"
                density="compact"
                hide-details
                class="mr-3"
              />
              <v-btn v-if="store.project" variant="tonal" color="primary" size="small" :loading="zipBusy" data-test="download-all" @click="downloadAll">
                Download all (.zip)
              </v-btn>
            </template>
          </PanelTitle>
          <div v-show="useParameters" class="text-caption text-medium-emphasis mb-3">
            With the settings block on, feeds, heights and probe values are FluidNC parameters at the top of each file (<code>#&lt;t1_feed&gt;</code>,
            <code>#&lt;clear_z&gt;</code>, ...), so changing one number there changes every line that uses it.
          </div>
          <div v-for="g in groups" :key="g.blank.id" class="mb-3" data-test="blank-files">
            <template v-if="several">
              <div class="font-weight-bold text-primary">
                Blank {{ g.blank.index }} · {{ g.blank.label }} · {{ store.sizeLength(g.blank.size.width) }} × {{ store.sizeLength(g.blank.size.height) }}
              </div>
              <div class="text-body-2 text-medium-emphasis mb-1">{{ g.partNames.join(', ') }}</div>
            </template>
            <div v-for="f in g.files" :key="f.name" class="d-flex align-center mb-1 phone-wrap">
              <span :class="f.index === fileIndex ? 'font-weight-bold' : ''">{{ f.name }}</span>
              <span class="flex-grow-1 text-medium-emphasis ml-3">
                <template v-if="g.files.length > 1">Setup {{ f.program.setup.index }} · </template>{{ f.program.faces.summary }}
              </span>
              <span class="text-medium-emphasis mr-3">FluidNC</span>
              <v-btn variant="text" size="small" :disabled="f.index === fileIndex" @click="fileIndex = f.index">Preview</v-btn>
              <v-btn variant="text" color="primary" size="small" @click="download(f.name, f.text)">Download</v-btn>
            </div>
          </div>
          <div v-if="(job.plan.installKit.length || lists?.shims || lists?.slideJigs || printedHandles.length) && several" class="font-weight-bold text-primary">3D prints</div>
          <div v-if="lists?.slideJigs && store.project" class="d-flex align-center phone-wrap" data-test="slide-jigs-file">
            <span>{{ slideJigsFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ lists.slideJigs.map((j) => `${j.quantity} slide jigs ${L(j.height)} high`).join(', ') }}</span>
            <span class="text-medium-emphasis mr-3">3D print</span>
            <router-link :to="'/jigs?item=slide-jig'" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" @click="downloadSlideJigs">Download</v-btn>
          </div>
          <div v-if="job.plan.installKit.length && store.project" class="d-flex align-center phone-wrap">
            <span class="flex-grow-1">{{ installKitFileName(store.project.slug) }}</span>
            <span class="text-medium-emphasis mr-3">3D print</span>
            <router-link :to="'/jigs?item=support-block'" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" :loading="kitBusy" @click="downloadKit">Download</v-btn>
          </div>
          <div v-if="lists?.shims && store.project" class="d-flex align-center phone-wrap" data-test="shims-file">
            <span>{{ slideShimsFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ lists.shims.quantity }} slide shims, {{ L(lists.shims.thickness) }} thick</span>
            <span class="text-medium-emphasis mr-3">3D print</span>
            <router-link :to="'/jigs?item=slide-shims'" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" @click="downloadShims">Download</v-btn>
          </div>
          <div v-if="printedHandles.length && store.project" class="d-flex align-center phone-wrap" data-test="handles-file">
            <span>{{ printedHandlesFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ printedHandles.map((h) => `${h.quantity} × ${h.handle.name}`).join(', ') }}</span>
            <span class="text-medium-emphasis mr-3">3D print</span>
            <router-link :to="`/jigs?item=handle-${printedHandles[0]!.handle.id}`" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" :loading="handlesBusy" @click="downloadHandles">Download</v-btn>
          </div>
          <v-alert v-if="kitError" type="error" variant="tonal" density="compact" class="mt-2">{{ kitError }}</v-alert>
        </v-card>
      </v-col>
      <v-col cols="12">
        <v-card class="pa-5">
          <PanelTitle icon="gcode">
            G-code preview
            <template #actions>
            <v-btn-toggle v-model="previewMode" mandatory density="compact" variant="outlined" divided class="mr-3">
              <v-btn value="top">Top</v-btn>
              <v-btn value="3d">3D</v-btn>
            </v-btn-toggle>
            <v-btn-toggle v-model="fileIndex" mandatory density="compact" variant="outlined" divided>
              <v-btn v-for="(f, i) in job.files" :key="f.name" :value="i" :title="f.name">{{ fileLabel(i) }}</v-btn>
            </v-btn-toggle>
            </template>
          </PanelTitle>
          <div v-if="several && fileBlank" class="text-body-2 mb-2">Blank {{ fileBlank.index }} · {{ fileBlank.label }} · {{ file.name }}</div>
          <v-row>
            <v-col cols="12" md="5">
              <StockCarveView v-if="previewMode === '3d'" :gcode="file.text" @parsed="onParsed" />
              <ToolpathPreview v-else :gcode="file.text" @parsed="onParsed" />
            </v-col>
            <v-col cols="12" md="7">
              <GCodeListing :gcode="file.text" />
              <v-row density="compact" class="mt-2">
                <v-col><v-sheet border rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">Bit changes</div><div class="text-h6">{{ stats.bitChanges }}</div></v-sheet></v-col>
                <v-col><v-sheet border rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">Operator pauses</div><div class="text-h6">{{ stats.pauses }}</div></v-sheet></v-col>
                <v-col><v-sheet border rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">Deepest cut</div><div class="text-h6">{{ store.cncLength(stats.deepest) }}</div></v-sheet></v-col>
              </v-row>
              <v-alert v-if="stats.alarms" type="error" variant="tonal" density="compact" class="mt-2">The preview reports {{ stats.alarms }} alarm(s).</v-alert>
              <div class="text-caption text-medium-emphasis mt-2">
                Top shows the moves as parsed by cnc-gcode-tools; 3D carves the stock with each bit's shape. Each file starts from an
                uncut blank, so the front setup doesn't show the hinge cups cut from the back.
              </div>
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="tab === 'lists' && lists" data-test="lists">
      <v-col cols="12" class="d-flex align-center phone-wrap">
        <span class="text-body-2 text-medium-emphasis flex-grow-1">
          <template v-if="cut">Sizes are finished sizes. Write each part's label on it as it is cut.</template>
          <template v-else>What to buy for the job, then the hardware and the finish.</template>
          Printed and downloaded, the lists are all together, as in "Download all (.zip)".
        </span>
        <v-btn variant="tonal" color="primary" size="small" class="mr-2" data-test="print-lists" @click="printLists">Print</v-btn>
        <v-btn variant="text" color="primary" size="small" @click="downloadLists">Download (.html)</v-btn>
      </v-col>
      <v-col v-if="!cut && buying.length" cols="12">
        <v-card class="pa-5" data-test="buying-list">
          <PanelTitle icon="materials">To buy</PanelTitle>
          <div v-if="job.batch" class="d-flex align-center flex-wrap ga-3 mb-2" data-test="buy-for">
            <v-btn-toggle v-model="buyFor" mandatory density="compact" variant="outlined" divided>
              <v-btn value="project">The whole project</v-btn>
              <v-btn value="batch">This batch</v-btn>
            </v-btn-toggle>
            <span class="text-body-2 text-medium-emphasis">{{ buyFor === 'project' ? 'Stock for every part of the project, cut as one job: usually bought once.' : `Stock for the batch "${job.batch.name}" alone. Cutting in batches takes more sheet than cutting the project at once.` }}</span>
          </div>
          <v-table density="compact" class="phone-cards">
            <tbody>
              <tr v-for="(b, i) in buying" :key="i">
                <td style="width: 8rem" class="lead">{{ buyQuantity(b) }}</td>
                <td style="width: 25%">{{ b.material }}</td>
                <td style="width: 15%">{{ b.size ? `${S(b.size.width)} × ${S(b.size.height)}` : '' }}</td>
                <td class="text-medium-emphasis">{{ b.note }}</td>
              </tr>
            </tbody>
          </v-table>
          <div class="text-caption text-medium-emphasis mt-2">
            Of the project's materials, as the job uses them; the hardware to buy is at the end. Nothing here assumes a sheet is
            already in the shop.
          </div>
        </v-card>
      </v-col>
      <v-col v-if="cut && lists.cutList.length" cols="12">
        <v-card class="pa-5" data-test="cut-list">
          <PanelTitle icon="bits">Cut list: parts cut on a saw</PanelTitle>
          <template v-for="g in lists.cutList" :key="`${g.material}-${g.thickness}`">
            <div class="font-weight-bold text-primary mt-2">
              {{ g.material }}, {{ S(g.thickness) }} thick<template v-if="g.board"> · boards: rip to width, then cut to length</template
              ><template v-if="oneSaw(g.rows)"> · {{ cutMethodLabel(oneSaw(g.rows)!).toLowerCase() }}</template>
            </div>
            <v-table density="compact" class="phone-cards">
              <thead>
                <tr><th>Qty</th><th>Length</th><th>Width</th><th>Label</th><th>Part</th><th v-if="!oneSaw(g.rows)">Saw</th><th v-if="g.rows.some((r) => r.steps.length)">Then</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in g.rows" :key="r.labels.join()">
                  <td data-label="Qty">{{ r.quantity }}</td>
                  <td data-label="Length">{{ S(r.length) }}</td>
                  <td data-label="Width">{{ S(r.width) }}</td>
                  <td data-label="Label" class="font-weight-bold">{{ r.labels.join(', ') }}</td>
                  <td data-label="Part">{{ r.names.join(', ') }}</td>
                  <td v-if="!oneSaw(g.rows)" data-label="Saw">{{ cutMethodLabel(r.saw) }}</td>
                  <td v-if="g.rows.some((x) => x.steps.length)" data-label="Then">{{ r.steps.join('; ') }}</td>
                </tr>
              </tbody>
            </v-table>
            <div v-if="g.rows.some((r) => r.grain)" class="text-caption text-medium-emphasis">The grain runs along the length.</div>
          </template>
        </v-card>
      </v-col>
      <v-col v-if="cut" cols="12">
        <v-card class="pa-5" data-test="parts-list">
          <PanelTitle icon="parts" class="fold-head" role="button" tabindex="0" :aria-expanded="partsOpen" @click="partsOpen = !partsOpen" @keydown.enter="partsOpen = !partsOpen">
            Parts ({{ lists.parts.length }})
            <template #actions><v-icon :icon="mdiChevronDown" size="22" class="chevron" :class="{ turned: partsOpen }" /></template>
          </PanelTitle>
          <div v-show="!partsOpen" class="text-body-2 text-medium-emphasis fold-head" @click="partsOpen = true">
            Every part with its label, size, material, grain and how it is cut out. Open it to find a part by its label.
          </div>
          <v-table v-show="partsOpen" density="compact" class="phone-cards">
            <thead>
              <tr><th>Label</th><th>Part</th><th>Width × height</th><th>Material</th><th>Grain</th><th>Cut out</th><th>Then</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in lists.parts" :key="p.partId">
                <td data-label="Label" class="font-weight-bold">{{ p.label }}</td>
                <td data-label="Part">{{ p.name }}</td>
                <td data-label="Width × height">{{ L(p.size.width) }} × {{ L(p.size.height) }}</td>
                <td data-label="Material">{{ p.material }}</td>
                <td data-label="Grain">{{ grainWords(p.grain, p.size, L) }}</td>
                <td data-label="Cut out">{{ p.cutOut === 'cnc' && p.blank ? `CNC, blank ${p.blank}` : cutMethodLabel(p.cutOut) }}</td>
                <td data-label="Then">{{ p.steps.filter((s) => s.by !== 'cnc').map((s) => `${s.label}, ${stepToolLabel(s.by)}`).join('; ') }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col v-if="cut && lists.byHand.length" cols="12">
        <v-card class="pa-5" data-test="by-hand-list">
          <PanelTitle icon="checklist">By hand: joints and holes of parts cut on a saw</PanelTitle>
          <div class="text-body-2 text-medium-emphasis mb-2">
            These parts are too long for the machine's cutting area, so they are cut on a saw and what the CNC would have cut is
            made by hand: the joints with a router and a straightedge, the holes with a drill (a shelf-pin jig for the rows of
            shelf-pin holes). Measurements are from the part's own edges.
          </div>
          <v-table density="compact" class="phone-cards">
            <thead>
              <tr><th>Label</th><th>Part</th><th>What</th><th>Face</th><th>Size</th><th>Where</th></tr>
            </thead>
            <tbody>
              <tr v-for="(h, i) in lists.byHand" :key="i">
                <td data-label="Label" class="font-weight-bold text-no-wrap">{{ h.label }}</td>
                <td data-label="Part" class="text-no-wrap">{{ h.part }}</td>
                <td data-label="What" class="text-no-wrap">{{ h.count > 1 ? `${h.count} ${h.what.toLowerCase()}` : h.what }}</td>
                <td data-label="Face">{{ h.face }}</td>
                <td data-label="Size" class="text-no-wrap">{{ h.size }}</td>
                <td data-label="Where">{{ h.where }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col v-if="cut && lists.kreg.length" cols="12">
        <v-card class="pa-5" data-test="kreg-list">
          <PanelTitle icon="checklist">Pocket holes with the Kreg jig ({{ lists.kreg.reduce((n, k) => n + k.at.length, 0) }})</PanelTitle>
          <v-table density="compact" class="phone-cards">
            <thead>
              <tr><th>Label</th><th>Part</th><th>Face</th><th>Through its</th><th>Into</th><th>Holes at</th><th>Measured from</th><th>Screw</th></tr>
            </thead>
            <tbody>
              <tr v-for="(k, i) in kregRows" :key="i" :class="{ 'part-start': k.first && i > 0 }">
                <td data-label="Label" class="font-weight-bold">{{ k.first ? k.label : '' }}</td>
                <td data-label="Part">{{ k.first ? k.part : '' }}</td>
                <td data-label="Face">{{ k.sameFace ? '' : k.face }}</td>
                <td data-label="Through its">{{ k.edge }}</td>
                <td data-label="Into">{{ k.into }}</td>
                <td data-label="Holes at">{{ k.at.map(L).join(', ') }}</td>
                <td data-label="Measured from">its {{ k.from }}</td>
                <td data-label="Screw">{{ k.screw }}</td>
              </tr>
            </tbody>
          </v-table>
          <div class="text-caption text-medium-emphasis mt-2">
            Set the jig and the drill collar to the thickness of the part being drilled. Screw lengths are from the Kreg chart, checked
            against the part each screw goes into (tune me: the check uses an estimate of where the jig seats the screw).
          </div>
        </v-card>
      </v-col>
      <v-col v-if="!cut" cols="12">
        <v-card class="pa-5" data-test="hardware-list">
          <PanelTitle icon="hardware">Hardware</PanelTitle>
          <template v-for="group in hardwareGroups" :key="group">
            <div class="font-weight-bold text-primary mt-2">{{ group }}</div>
            <v-table density="compact" class="phone-cards">
              <tbody>
                <tr v-for="h in lists.hardware.filter((x) => x.group === group)" :key="h.item">
                  <td style="width: 5rem">{{ h.quantity === undefined ? '' : `${h.quantity}${h.unit ? ` ${h.unit}` : ''}` }}</td>
                  <td style="width: 40%" class="lead">{{ h.item }}</td>
                  <td class="text-medium-emphasis">{{ h.note }}</td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="tab === 'prints'">
      <v-col cols="12">
        <v-card class="pa-5" data-test="prints">
          <PanelTitle icon="kit">3D prints</PanelTitle>
          <div class="text-body-2 text-medium-emphasis mb-3">Printed while the parts are cut: each is a 3MF file, laid out flat, no supports needed.</div>
          <div v-if="job.plan.installKit.length && store.project" class="d-flex align-center mb-1 phone-wrap">
            <span>{{ installKitFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ job.plan.installKit.map((j) => `${j.quantity} × ${kitName(j).toLowerCase()}`).join(', ') }}</span>
            <router-link :to="'/jigs?item=support-block'" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" :loading="kitBusy" @click="downloadKit">Download</v-btn>
          </div>
          <div v-if="lists?.slideJigs && store.project" class="d-flex align-center mb-1 phone-wrap" data-test="slide-jigs-print">
            <span>{{ slideJigsFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ lists.slideJigs.map((j) => `${j.quantity} slide jigs ${L(j.height)} high`).join(', ') }}</span>
            <router-link :to="'/jigs?item=slide-jig'" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" @click="downloadSlideJigs">Download</v-btn>
          </div>
          <div v-if="lists?.shims && store.project" class="d-flex align-center mb-1 phone-wrap">
            <span>{{ slideShimsFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ lists.shims.quantity }} slide shims, {{ L(lists.shims.thickness) }} thick</span>
            <router-link :to="'/jigs?item=slide-shims'" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" @click="downloadShims">Download</v-btn>
          </div>
          <div v-if="printedHandles.length && store.project" class="d-flex align-center mb-1 phone-wrap">
            <span>{{ printedHandlesFileName(store.project.slug) }}</span>
            <span class="flex-grow-1 text-medium-emphasis ml-3">{{ printedHandles.map((h) => `${h.quantity} × ${h.handle.name}`).join(', ') }}</span>
            <router-link :to="`/jigs?item=handle-${printedHandles[0]!.handle.id}`" class="text-caption mr-3" title="Its sizes, a picture, and a file of any number, with no project" data-test="jig-link">On its own</router-link>
            <v-btn variant="text" color="primary" size="small" :loading="handlesBusy" @click="downloadHandles">Download</v-btn>
          </div>
          <v-alert v-if="kitError" type="error" variant="tonal" density="compact" class="mt-2">{{ kitError }}</v-alert>
          <template v-if="job.plan.installKit.length && design && opening">
            <div class="font-weight-bold mt-4 mb-2">The install kit on the print bed</div>
            <CabinetView :parts="job.parts.filter((p) => p.designObjectId === design!.id)" :opening="opening" :mounting="design.mounting" :kit="job.plan.installKit" mode="bed" kit-shown />
          </template>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="design && opening">
      <v-col cols="12">
        <v-card class="pa-5">
          <PanelTitle icon="kit">
            Install kit
            <template #actions>
            <v-btn v-if="store.project" variant="tonal" color="primary" size="small" :loading="kitBusy" @click="downloadKit">
              Download {{ installKitFileName(store.project.slug) }}
            </v-btn>
            </template>
          </PanelTitle>
          <v-alert v-if="kitError" type="error" variant="tonal" density="compact" class="mb-2">{{ kitError }}</v-alert>
          <div class="d-flex flex-wrap ga-6 mb-3" data-test="kit-list">
            <div v-for="(jig, i) in job.plan.installKit" :key="i">
              <span class="font-weight-bold">{{ kitName(jig) }}, {{ L(Object.values(jig.params)[0] ?? 0) }}</span>
              <span class="text-secondary"> · print {{ jig.quantity }}</span>
            </div>
          </div>
          <CabinetView :parts="job.parts.filter((p) => p.designObjectId === design!.id)" :opening="opening" :mounting="design.mounting" :kit="job.plan.installKit" :mode="insetDoors ? 'bed' : 'cabinet'" kit-shown />
          <HelpText label="About the kit">
            <template v-if="insetDoors">
              Inset doors stand inside their opening: put two shims under each door on the bottom edge of the opening, and one between
              a pair, then clip the hinges to their plates on the case sides and adjust until the gaps are even. The shims are shown as
              they are laid out in the 3MF file, flat, no supports needed.
            </template>
            <template v-else>
              Each support block hooks over the bottom edge of the opening; the door stands on its ledge while the hinges are screwed to
              {{ opening.cabinetType === 'frameless' ? 'their plates on the case sides' : 'the frame' }}. The shim stands in the gap between the
              doors. The frame, cabinet box and hinges are schematic.
            </template>
            <template v-if="!insetDoors">Block sizes other than the overlay are first guesses: print one and check it before relying on it.</template>
          </HelpText>
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>

<style scoped>
.section {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
.section:first-of-type {
  border-top: 0;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cuts {
  margin: -2px 0 6px 40px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}
.cuts summary {
  cursor: pointer;
}
.fold-head {
  cursor: pointer;
}
.chevron {
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
.part-start td {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.22);
}
</style>
