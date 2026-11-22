<script setup lang="ts">
/**
 * Plan: a line of totals, then three tabs. Blanks is the stock to cut and how each
 * piece lies on the machine; Operations is the CNC's cuts, grouped by what they are
 * cut into, with the method and bits to choose; Parts (a cabinet only) is how each
 * part is cut out. `#/plan?tab=operations` or `?tab=parts` opens on that tab.
 */
import BatchCard from '@/components/BatchCard.vue';
import { mdiChevronDown } from '@mdi/js';
import { useRoute } from 'vue-router';
import HelpText from '@/components/HelpText.vue';
import ChecksStrip, { type Check } from '@/components/ChecksStrip.vue';
import PageHeader from '@/components/PageHeader.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { computed, ref } from 'vue';
import StockNeeded from '@/components/StockNeeded.vue';
import type { CutMethod, Length, Method, Operation, PartPlan, PocketHoleMethod, Setup } from '@/model';
import LengthField from '@/components/LengthField.vue';
import { LOW_POCKET, POCKET_SLEEVE, sleeveWords } from '@/geometry/pocketHole';
import { lowAngleOf, pocketSeatOf } from '@/plan/parts';
import { boresByPecking } from '@/cam/cuts';
import { POCKET_GUIDE_FILE, buildPocketGuide3mf } from '@/jigs/pocketGuide';
import { POCKET_TEST, buildPocketTest, pocketTestStock } from '@/job/pocketTest';
import { baseId, cabinetIdOf, cabinetsOf, copiesOf, partFaces, partTitle, tagged } from '@/design';
import { cutDiameter, cuttingLengthOf, pinHoleDiameter, setupFaces } from '@/plan';
import { useAppStore } from '@/stores/app';
import { cutMethodLabel, download, duration, faceLabel, methodLabel, pocketHoleMethodLabel, stepToolLabel } from '@/ui/format';
import { formatBitName } from '@/units';

const store = useAppStore();
const plan = computed(() => store.job.job?.plan);
const choices = computed(() => store.project!.plan);
const L = computed(() => store.sizeLength);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const asked = useRoute().query.tab;
const tab = ref<'blanks' | 'operations' | 'parts'>(asked === 'operations' || asked === 'parts' ? asked : 'blanks');

const bit = (id: string) => {
  const tool = store.shop.tools.find((t) => t.id === id);
  return tool ? formatBitName(tool.name, cutDiameter(tool)) : id;
};
/** For the pin holes the bit decides how they are made, so the choice says which. */
const bitItems = (ids: string[], op?: Operation) =>
  ids.map((id) => {
    const tool = store.shop.tools.find((t) => t.id === id);
    const machine = store.machine;
    const how =
      op?.kind === 'pinHole' && tool && machine
        ? boresByPecking(pinHoleDiameter(machine), cutDiameter(tool))
          ? ' · peck drill'
          : ' · helix'
        : '';
    return { title: bit(id) + how, value: id };
  });
const NONE = '__none__';

function choice(op: Operation) {
  return (choices.value.operations[op.key] ??= {});
}
function setMethod(op: Operation, method: Method) {
  choice(op).method = method;
}
function setClear(op: Operation, id: string) {
  choice(op).clearToolId = id;
}
function setCleanup(op: Operation, id: string) {
  choice(op).cleanupToolId = id === NONE ? null : id;
}
function resetChoices() {
  choices.value.operations = {};
  delete choices.value.parts;
  delete choices.value.pocketHoles;
}
const hasChoices = computed(
  () => Object.keys(choices.value.operations).length > 0 || Object.keys(choices.value.parts ?? {}).length > 0 || choices.value.pocketHoles !== undefined,
);

/** A cabinet's parts with how each is cut out. A refacing job has only its doors, all on the CNC, and no table. */
const partRows = computed(() => {
  const job = store.job.job;
  if (!job || job.cabinetParts.length === 0) return [];
  const all = [...job.parts, ...job.cabinetParts];
  const cabinetOf = cabinetIdOf(store.project!);
  const made = new Map(cabinetsOf(store.project!).map((c) => [c.id, copiesOf(c)]));
  return job.plan.parts.flatMap((planned) => {
    const part = all.find((p) => p.id === planned.partId);
    // A cabinet made several times: its parts are listed once, for every copy.
    if (!part || (part.copy ?? 1) > 1) return [];
    const copies = made.get(cabinetOf(part.id) ?? '') ?? 1;
    const material = store.materials.find((m) => m.id === part.materialId);
    return [
      {
        planned,
        name: copies > 1 ? `${tagged(part.name, part.tag)} × ${copies}` : partTitle(part),
        size: `${L.value(part.size.width)} × ${L.value(part.size.height)}`,
        material: material ? `${L.value(material.nominalThickness.mm)} ${material.name}` : part.materialId,
      },
    ];
  });
});
/** Only what differs from the suggestion is stored. */
function setCutOut(planned: PartPlan, method: CutMethod) {
  const parts = (choices.value.parts ??= {});
  if (method === planned.suggested) delete parts[baseId(planned.partId)];
  else parts[baseId(planned.partId)] = { cutOut: method };
}
function setPocketHoles(method: PocketHoleMethod) {
  if (method === 'kregJig') delete choices.value.pocketHoles;
  else choices.value.pocketHoles = method;
}
const POCKET_METHODS: PocketHoleMethod[] = ['kregJig', 'cncAssisted', 'lowAngle3', 'lowAngle6'];
/** A low-angle pocket's angle when the job's pockets are that; its seat from the edge, set as on a pocket-hole machine. */
const lowAngle = computed(() => (plan.value?.pocketHoles ? lowAngleOf(plan.value.pocketHoles.method) : undefined));
const pocketSeat = computed({
  get: (): Length => choices.value.pocketSeat ?? { mm: LOW_POCKET.seat, unit: 'in' },
  set: (value: Length) => {
    if (Math.abs(value.mm - LOW_POCKET.seat) < 0.01) delete choices.value.pocketSeat;
    else choices.value.pocketSeat = value;
  },
});
const seatOutOfRange = computed(() => !!choices.value.pocketSeat && (choices.value.pocketSeat.mm < LOW_POCKET.seatRange.min || choices.value.pocketSeat.mm > LOW_POCKET.seatRange.max));

/**
 * The face a row is cut into, in its parts' own words: "Inside" for a side, "Underside"
 * for the bottom, "Front" for a door. A row over parts whose faces have two names
 * gives both, and "Several" for more.
 */
function opFace(op: Operation): string {
  const job = store.job.job;
  if (op.source.kind !== 'features' || !job) return faceLabel(op.face);
  const all = [...job.parts, ...job.cabinetParts];
  const names = new Set<string>();
  for (const r of op.source.refs) {
    const part = all.find((p) => p.id === r.partId);
    const face = part?.features.find((f) => f.id === r.featureId)?.face;
    if (!part || !face) continue;
    names.add(face === 'edge' ? faceLabel('edge') : partFaces(part)[face]);
  }
  if (names.size === 0) return faceLabel(op.face);
  if (names.size === 1) return [...names][0]!;
  // A cutout goes through the part: with parts lying different ways there is no one face to name.
  if (op.kind === 'cutout') return '—';
  return names.size > 2 ? 'Several' : [...names].join(' / ');
}

/** The CNC's and the hand's rows. Hanging the doors is on Build's Install tab. */
const operations = computed(() => (plan.value?.operations ?? []).filter((o) => o.kind !== 'install'));
/**
 * The rows under what they are cut into: a label "Doors: hinge cups" goes under
 * "Doors" as "Hinge cups". Rows with no such name (the registration holes) are the
 * job's. A job whose rows have no names at all (one door set) is one group, shown
 * without a heading.
 */
const opGroups = computed(() => {
  const groups: { name: string; seconds: number; rows: { op: Operation; label: string }[] }[] = [];
  for (const op of operations.value) {
    const cut = op.label.indexOf(': ');
    const name = cut > 0 ? op.label.slice(0, cut) : 'Job';
    const label = cut > 0 ? capital(op.label.slice(cut + 2)) : op.label;
    let group = groups.find((g) => g.name === name);
    if (!group) groups.push((group = { name, seconds: 0, rows: [] }));
    group.rows.push({ op, label });
    group.seconds += op.machineSeconds;
  }
  return groups;
});
const closedGroups = ref(new Set<string>());
function toggleGroup(name: string) {
  const next = new Set(closedGroups.value);
  if (!next.delete(name)) next.add(name);
  closedGroups.value = next;
}

/** The first material the CNC cuts pockets in: the scrap test is written for it. */
/** The sleeve the job's drill guides are printed for, in words. */
const pocketSleeveWords = computed(() => {
  const sleeve = store.shop.pocketSleeve ?? POCKET_SLEEVE;
  return `${sleeve.count === 2 ? 'two metal sleeves' : 'a metal sleeve'} of ${sleeveWords(sleeve)} (bore × outside × length; the Shop profile's, under Hardware)`;
});
const pocketMaterial = computed(() => {
  const job = store.job.job;
  const op = job?.plan.operations.find((o) => o.kind === 'pocketHole');
  if (!job || op?.source.kind !== 'features') return undefined;
  const first = op.source.refs[0];
  const id = job.cabinetParts.find((p) => p.id === first?.partId)?.materialId;
  return store.materials.find((m) => m.id === id);
});
const pocketBusy = ref(false);
const pocketError = ref('');
async function downloadGuide() {
  const guides = plan.value?.pocketHoles?.prep?.guides;
  if (!guides?.length) return;
  pocketBusy.value = true;
  pocketError.value = '';
  try {
    // A plain copy: Manifold shouldn't see Vue's reactive proxies.
    download(POCKET_GUIDE_FILE, await buildPocketGuide3mf(JSON.parse(JSON.stringify(guides)) as typeof guides, wasmUrl), 'model/3mf');
  } catch (e) {
    pocketError.value = `The guide could not be built: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    pocketBusy.value = false;
  }
}
function downloadPocketTest() {
  pocketError.value = '';
  try {
    // As the job cuts them: two low-angle pockets at its angle and its seat, or two 15 degree ones.
    const low = lowAngle.value;
    const kinds = low ? Array.from({ length: POCKET_TEST.count }, () => ({ bit: 'arc' as const, ledge: false, angleDeg: low, seat: pocketSeatOf(choices.value) })) : undefined;
    const test = buildPocketTest(JSON.parse(JSON.stringify(store.jobShop)) as typeof store.jobShop, pocketMaterial.value!.id, kinds);
    download(test.name, test.text);
  } catch (e) {
    pocketError.value = `The test file could not be written: ${e instanceof Error ? e.message : String(e)}`;
  }
}
/** "9 on the table saw, 11 on the CNC". */
const cutOutCounts = computed(() => {
  const methods: CutMethod[] = ['cnc', 'tableSaw', 'circularSaw'];
  const names = { cnc: 'on the CNC', tableSaw: 'on the table saw', circularSaw: 'with the circular/track saw' };
  return methods
    .map((m) => ({ m, n: partRows.value.filter((r) => r.planned.cutOut === m).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${names[c.m]}`)
    .join(', ');
});

/** The parts under how they are cut out. The CNC's are closed to start with: there is nothing to choose there. */
const partGroups = computed(() => {
  const titles: Record<CutMethod, string> = { cnc: 'On the CNC', tableSaw: 'On the table saw', circularSaw: 'With the circular/track saw' };
  return (['tableSaw', 'circularSaw', 'cnc'] as CutMethod[])
    .map((method) => ({
      method,
      title: titles[method],
      note: method === 'cnc' ? ': the CNC works on each, so it cuts them out too' : '',
      rows: partRows.value.filter((r) => r.planned.cutOut === method),
    }))
    .filter((g) => g.rows.length > 0);
});
const partGroupsOpen = ref<Partial<Record<CutMethod, boolean>>>({});
const isPartGroupOpen = (method: CutMethod) => partGroupsOpen.value[method] ?? method !== 'cnc';
function togglePartGroup(method: CutMethod) {
  partGroupsOpen.value = { ...partGroupsOpen.value, [method]: !isPartGroupOpen(method) };
}
const blanks = computed(() => plan.value?.blanks ?? []);
const setupCount = computed(() => blanks.value.reduce((sum, b) => sum + b.setups.length, 0));
const flips = computed(() => blanks.value.filter((b) => b.setups.some((s) => s.flipBefore !== 'none' && s.flipBefore.kind === 'sheetOnPins')).length);
const flip = computed(() => flips.value > 0);
const setupOps = (keys: string[]) =>
  keys.length ? keys.map((k) => plan.value?.operations.find((o) => o.key === k)?.label.toLowerCase()).join(', ') : 'nothing to cut';
/** Which face of each part is up, in the parts' own words ("Inside face up"). */
const facesOf = (setup: Setup) => {
  const job = store.job.job;
  const faces = setupFaces(setup, job ? [...job.parts, ...job.cabinetParts] : []);
  return { ...faces, title: capital(faces.summary) };
};
/** The thickest blank a set of pin holes goes through, for the note on an unmeasured bit. */
const pinnedThickness = computed(() => Math.max(0, ...blanks.value.filter((b) => b.setups.some((s) => s.pinHoles.length)).map((b) => b.size.thickness)));
/** Bits in use whose cutting length is still unknown, reported once instead of on every row. */
/**
 * Bits in use whose cutting length is still unknown, each with the deepest cut it
 * makes and which operation that is, reported once instead of on every row.
 */
const unmeasured = computed(() => {
  const p = plan.value;
  if (!p) return [];
  return p.summary.toolIds.flatMap((id) => {
    const tool = store.shop.tools.find((t) => t.id === id);
    if (!tool || cuttingLengthOf(tool) !== null) return [];
    const uses = p.operations.filter((o) => o.method === 'cnc' && (o.clearToolId === id || o.cleanupToolId === id));
    const deepest = uses.reduce<Operation | undefined>((best, o) => (!best || o.depth > best.depth ? o : best), undefined);
    return deepest ? [{ name: tool.name, depth: deepest.depth, op: deepest }] : [];
  });
});
const otherWarnings = computed(() => {
  const p = plan.value;
  if (!p) return [];
  const onRows = new Set(p.operations.flatMap((o) => o.warnings.map((w) => w.message)));
  return p.warnings.filter((w) => !onRows.has(w.message));
});

const WARNING_TITLES: Record<string, string> = {
  deeperThanCuttingLength: 'Cut deeper than the bit',
  deeperThanVMax: 'Cut deeper than the V-bit',
  noCapableTool: 'No bit can make this',
  chosenToolGone: 'Chosen bit no longer in the shop',
  blankTooSmall: 'Blank too small',
  outsideCuttingArea: 'Outside the cutting area',
  tightMargins: 'Tight edge waste',
  pinHolesShallow: 'Pin holes need drilling deeper',
  stockTooSmall: 'Does not fit the machine',
  probeSpotMoved: 'Probe spot moved',
  unsupported: 'Cut left out',
};
/** Everything on this screen that needs a look, in one strip. */
const checks = computed<Check[]>(() => {
  const p = plan.value;
  if (!p) return [];
  const list: Check[] = [];
  if (flip.value) {
    list.push({
      title: 'Flip needed',
      text:
        blanks.value.length > 1
          ? `Some work is on the back and some on the front. Planned as a sheet flip, left to right, on registration pins, for ${flips.value} of the ${blanks.value.length} blanks.`
          : 'Some work is on the back and some on the front. Planned as one sheet flip, left to right, on registration pins.',
      tone: 'info',
    });
  } else if (setupCount.value > 0) {
    list.push({ title: 'No flip', text: 'Everything the CNC does is reachable from one face.', tone: 'info' });
  }
  if (unmeasured.value.length) {
    list.push({
      title: 'Cutting length not measured',
      text:
        unmeasured.value
          .map((u) => {
            // The pin holes are the one cut deeper than the blank: say why.
            const why =
              u.op.kind === 'pinHole'
                ? `, through the ${store.cncLength(pinnedThickness.value)} blank and ${store.cncLength(u.depth - pinnedThickness.value)} into the spoilboard`
                : '';
            return `${u.name} cuts up to ${store.cncLength(Math.round(u.depth * 100) / 100)} deep (${u.op.label.toLowerCase()}${why})`;
          })
          .join('; ') + '. Enter the cutting lengths so these depths can be checked:',
      tone: 'warning',
      link: { to: '/shop?tab=bits&bits=endMill,ballNose', label: 'shop profile' },
    });
  }
  for (const w of p.warnings.filter((x) => x.code === 'pinHolesShallow')) list.push({ title: WARNING_TITLES[w.code]!, text: w.message, tone: 'warning' });
  // One line per kind of warning: with several blanks the same one comes once per blank, each message naming its blank.
  const byCode = new Map<string, string[]>();
  for (const w of otherWarnings.value) byCode.set(w.code, [...(byCode.get(w.code) ?? []), w.message]);
  for (const [code, messages] of byCode) {
    const title = WARNING_TITLES[code] ?? 'Check';
    list.push({ title: messages.length > 1 ? `${title} (${messages.length})` : title, text: messages.join(' '), tone: 'warning' });
  }
  return list;
});
</script>

<template>
  <PageHeader
    title="Plan"
    status="Methods and bits chosen from your shop profile; change any row."
    :next="store.project ? { to: '/cut', title: 'Cut' } : undefined"
  />
  <BatchCard v-if="store.project" />
  <v-alert v-if="store.job.error" type="error" variant="tonal">{{ store.job.error }}</v-alert>
  <template v-else-if="plan">
    <ChecksStrip :checks="checks" />
    <v-card class="summary mb-4" data-test="plan-summary">
      <div class="stat"><div class="value">{{ duration(plan.summary.machineSeconds) }}</div><div class="name">Machine time</div></div>
      <div class="stat"><div class="value">{{ plan.summary.toolChanges }}</div><div class="name">Bit changes</div></div>
      <div class="stat"><div class="value">{{ plan.summary.toolIds.length }}</div><div class="name">Bits used</div></div>
      <div v-if="blanks.length > 1" class="stat"><div class="value">{{ blanks.length }}</div><div class="name">Blanks</div></div>
      <div class="stat">
        <div class="value">{{ setupCount }}</div>
        <div class="name">Setups{{ flip ? (flips > 1 ? `, with ${flips} flips` : ', with a flip') : '' }}</div>
      </div>
      <div class="stat wide">
        <div class="by-hand">{{ capital(plan.summary.byHand.join(', ').toLowerCase() || 'nothing') }}</div>
        <div class="name">Done by hand</div>
      </div>
    </v-card>

    <v-tabs v-model="tab" color="primary" class="mb-5">
      <v-tab value="blanks">{{ blanks.length > 1 ? `Blanks (${blanks.length})` : 'Stock and setups' }}</v-tab>
      <v-tab value="operations">Operations ({{ operations.length }})</v-tab>
      <v-tab v-if="partRows.length" value="parts">Parts ({{ partRows.length }})</v-tab>
    </v-tabs>

    <v-row v-show="tab === 'blanks'">
      <v-col cols="12" :lg="blanks.length > 1 ? 12 : 6">
        <StockNeeded editable class="h-100" />
      </v-col>
      <v-col v-if="blanks.length === 1" cols="12" lg="6">
        <v-card class="pa-5 h-100">
          <PanelTitle icon="setups">Setups</PanelTitle>
          <template v-for="setup in blanks[0]!.setups" :key="setup.index">
            <div v-if="setup.flipBefore !== 'none' && setup.flipBefore.kind === 'slideOnPins'" class="mb-3">
              <div class="font-weight-bold text-warning">Slide the sheet {{ store.cncLength(Math.round(setup.flipBefore.distance)) }} toward the front onto pins</div>
              <div class="text-body-2 text-medium-emphasis">Longer than the machine reaches; Z is probed again</div>
            </div>
            <div v-else-if="setup.flipBefore !== 'none'" class="mb-3">
              <div class="font-weight-bold text-warning">Flip left to right onto pins</div>
              <div class="text-body-2 text-medium-emphasis">Z is probed again on the new top face</div>
            </div>
            <div class="mb-3">
              <div class="font-weight-bold">{{ setup.index }} · {{ facesOf(setup).title }}</div>
              <div v-if="facesOf(setup).mixed" class="text-body-2" data-test="setup-faces">{{ facesOf(setup).detail }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ setupOps(setup.operationKeys) }}</div>
            </div>
          </template>
        </v-card>
      </v-col>
    </v-row>

    <div v-show="tab === 'operations'">
      <div class="d-flex flex-wrap align-center ga-3 mb-3">
        <span class="text-body-2 text-medium-emphasis flex-grow-1 offered">Only methods and bits that can make what Design asks for are offered.</span>
        <v-btn v-if="hasChoices" variant="text" size="small" @click="resetChoices">Reset my choices</v-btn>
        <v-btn-toggle v-model="choices.strategy" mandatory density="compact" variant="outlined" divided>
          <v-btn value="fastest">Fastest</v-btn>
          <v-btn value="fewestBitChanges">Fewest bit changes</v-btn>
        </v-btn-toggle>
      </div>
      <v-card data-test="operations">
        <v-table class="stack">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Face</th>
              <th style="width: 230px">Method</th>
              <th style="width: 360px">Bits</th>
              <th class="text-right">Machine time</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in opGroups" :key="group.name">
              <tr v-if="opGroups.length > 1" class="group-row" :aria-expanded="!closedGroups.has(group.name)" @click="toggleGroup(group.name)">
                <td colspan="4">
                  <v-icon :icon="mdiChevronDown" size="18" class="chevron mr-1" :class="{ turned: !closedGroups.has(group.name) }" />
                  <span class="font-weight-bold">{{ group.name }}</span>
                  <span class="text-medium-emphasis"> · {{ group.rows.length === 1 ? '1 operation' : `${group.rows.length} operations` }}</span>
                </td>
                <td class="text-right font-weight-bold" data-label="Machine time">{{ duration(group.seconds) }}</td>
              </tr>
              <tr v-for="{ op, label } in group.rows" v-show="!closedGroups.has(group.name)" :key="op.key">
                <td class="py-3 lead" :class="{ 'pl-10': opGroups.length > 1 }">
                  {{ label }}
                  <span v-if="op.covers" class="text-caption text-medium-emphasis ml-2" data-test="row-covers">{{ op.covers.join(', ') }}</span>
                  <div v-for="w in op.warnings.filter((x) => x.code !== 'cuttingLengthUnknown')" :key="w.message" class="text-caption text-warning">{{ w.message }}</div>
                </td>
                <td data-label="Face">{{ opFace(op) }}</td>
                <td data-label="Method">
                  <v-select
                    v-if="op.options.methods.length > 1"
                    :model-value="op.method"
                    :items="op.options.methods.map((m) => ({ title: methodLabel(m), value: m }))"
                    aria-label="Method"
                    @update:model-value="setMethod(op, $event)"
                  />
                  <span v-else>{{ methodLabel(op.method) }}</span>
                </td>
                <td class="py-2" data-label="Bits">
                  <template v-if="op.method === 'cnc' && op.clearToolId">
                    <v-select
                      v-if="op.options.clearToolIds.length > 1"
                      :model-value="op.clearToolId"
                      :items="bitItems(op.options.clearToolIds, op)"
                      label="Cut with"
                      @update:model-value="setClear(op, $event)"
                    />
                    <span v-else>{{ bit(op.clearToolId) }}</span>
                    <v-select
                      v-if="op.options.cleanupToolIds.length > 0"
                      class="mt-2"
                      :model-value="op.cleanupToolId ?? NONE"
                      :items="[...(op.options.cleanupRequired ? [] : [{ title: 'None', value: NONE }]), ...bitItems(op.options.cleanupToolIds)]"
                      :label="op.options.cleanupRequired ? 'Corner clean-up (needed for the radius)' : 'Corner clean-up (optional)'"
                      @update:model-value="setCleanup(op, $event)"
                    />
                  </template>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td class="text-right" data-label="Machine time">{{ duration(op.machineSeconds) }}</td>
              </tr>
            </template>
          </tbody>
        </v-table>
      </v-card>
      <div class="text-caption text-medium-emphasis mt-3">
        Times come from the feeds in your bit library, which are placeholders until tuned, plus
        {{ duration(store.machine?.toolChangeSeconds ?? 0) }} per bit change.
        <template v-if="plan.installKit.length">The install kit is printed from Cut's 3D prints tab; hanging the doors with it is on Build's Install tab.</template>
      </div>
    </div>

    <v-card v-if="partRows.length" v-show="tab === 'parts'" data-test="part-methods">
      <div class="pa-5 pb-2">
        <PanelTitle icon="parts">Parts: how each is cut out</PanelTitle>
        <div class="d-flex align-center flex-wrap ga-4">
          <span class="text-body-2 text-medium-emphasis flex-grow-1">
            {{ partRows.length }} parts: {{ cutOutCounts }}. Suggested from the saws in your
            <router-link to="/shop">shop profile</router-link>; change any part. A part the CNC works on (dados, a rabbet, a groove,
            holes) is cut out on the CNC.
          </span>
          <v-select
            v-if="plan.pocketHoles"
            :model-value="plan.pocketHoles.method"
            :items="POCKET_METHODS.map((m) => ({ title: pocketHoleMethodLabel(m), value: m }))"
            :label="`Pocket holes (${plan.pocketHoles.count})`"
            style="max-width: 280px"
            hide-details
            @update:model-value="setPocketHoles($event)"
          />
          <LengthField v-if="lowAngle" v-model="pocketSeat" label="Seat from the edge" style="max-width: 200px" data-test="pocket-seat" />
        </div>
        <div v-if="plan.pocketHoles && plan.pocketHoles.method !== 'kregJig'" class="mt-2" data-test="pocket-prep">
          <div class="text-body-2 text-warning">
            Untested experiment: the CNC preps {{ plan.pocketHoles.cncAssisted }} of the {{ plan.pocketHoles.count }} pocket holes; parts
            cut out on a saw get theirs by Kreg jig.
          </div>
          <HelpText label="About CNC-assisted pocket holes: the guide and the scrap test">
            <p v-if="lowAngle" data-test="pocket-low-words">
              A low-angle pocket, as a routed pocket-hole machine cuts it: the screw lies at {{ lowAngle }}°, so it pulls the joint together
              with little creep. The CNC cuts a slot with a flat end mill, deep at the seat and up to the face in an arc; the bit that
              cuts the parts out can cut it, so it need not cost a bit change. The seat is {{ store.cncLength(pocketSeatOf(choices)) }} from the
              edge along the screw, the same in every stock, and can be set above as on such a machine: a screw goes its length less that
              into the other part (1 1/2" screws in 3/4" stock, 1 1/4" in 1/2"; the hardware list has a shorter one where it would come
              through). The pocket is short and deep, so the driver comes in steeper than the screw lies: use screws with a Torx or
              square drive. A part too short for the pocket to run in from its edge is left out, with a warning.
            </p>
            <v-alert v-if="lowAngle && seatOutOfRange" type="warning" variant="tonal" density="compact" class="mb-2">
              The seat is {{ LOW_POCKET.seatRange.min }} to {{ LOW_POCKET.seatRange.max }} mm from the edge: the nearest of those is used.
            </v-alert>
            <p>
              <template v-if="lowAngle">The pilot is drilled by hand from the part's edge, up into</template>
              <template v-else>The CNC cuts the open part of each pocket with a ball nose bit. The pilot is drilled by hand from the part's edge, up into</template>
              the pocket, through a printed guide: its plate lies on the face with a key in the pocket and its leg goes against the edge.
              It applies to parts cut out on the CNC.
            </p>
            <template v-if="plan.pocketHoles.prep">
              <p v-for="d in plan.pocketHoles.prep.drilling" :key="d.thickness">
                {{ d.count }} pilots in {{ store.cncLength(d.thickness) }} stock: a {{ d.drill }} mm or 5/32" drill bit standing
                {{ store.cncLength(Math.round(d.bitOutOfChuck * 10) / 10) }} out of the chuck, which stops against the guide. A regular bit is long enough.
              </p>
              <p>
                The guide is made for one nominal thickness of stock (3/4", 1/2"): the 3MF holds one for each the job's pocket holes are in, each for {{ pocketSleeveWords }}.
                <template v-if="pocketMaterial">
                  The scrap test cuts {{ POCKET_TEST.count }} pockets along the front edge of a board, as the job cuts them, and
                  cuts the board out of a piece of {{ L(pocketMaterial.nominalThickness.mm) }} {{ pocketMaterial.name }} at least
                  {{ pocketTestStock(store.machine!).x }} × {{ pocketTestStock(store.machine!).y }} mm.
                </template>
              </p>
              <div class="d-flex align-center flex-wrap ga-3">
                <v-btn size="small" variant="tonal" :loading="pocketBusy" @click="downloadGuide">Guide (3MF)</v-btn>
                <router-link to="/jigs?item=pocket-guide" class="text-caption ml-3" title="Its sizes, a picture, and its file, with no project" data-test="jig-link">On its own</router-link>
                <v-btn v-if="pocketMaterial" size="small" variant="tonal" @click="downloadPocketTest">Scrap test (G-code)</v-btn>
              </div>
              <div v-if="pocketError" class="text-caption text-error mt-1">{{ pocketError }}</div>
            </template>
          </HelpText>
        </div>
      </div>
      <v-table class="stack">
        <thead>
          <tr>
            <th>Part</th>
            <th>Size</th>
            <th>Material</th>
            <th style="width: 260px">Cut out</th>
            <th>Then</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="group in partGroups" :key="group.method">
            <tr class="group-row" :aria-expanded="isPartGroupOpen(group.method)" @click="togglePartGroup(group.method)">
              <td colspan="5">
                <v-icon :icon="mdiChevronDown" size="18" class="chevron mr-1" :class="{ turned: isPartGroupOpen(group.method) }" />
                <span class="font-weight-bold">{{ group.title }}</span>
                <span class="text-medium-emphasis"> · {{ group.rows.length === 1 ? '1 part' : `${group.rows.length} parts` }}{{ group.note }}</span>
              </td>
            </tr>
            <tr v-for="row in group.rows" v-show="isPartGroupOpen(group.method)" :key="row.planned.partId" :title="row.planned.reason">
              <td class="py-2 pl-10 lead">
                {{ row.name }}
                <div v-show="row.planned.cutOut !== row.planned.suggested || group.method === 'cnc'" class="text-caption text-medium-emphasis">
                  {{ row.planned.cutOut === row.planned.suggested ? row.planned.reason : `Your choice. Suggested: ${cutMethodLabel(row.planned.suggested).toLowerCase()}.` }}
                </div>
              </td>
              <td class="text-no-wrap" data-label="Size">{{ row.size }}</td>
              <td class="text-no-wrap" data-label="Material">{{ row.material }}</td>
              <td data-label="Cut out">
                <v-select
                  v-if="row.planned.options.length > 1"
                  :model-value="row.planned.cutOut"
                  :items="row.planned.options.map((m) => ({ title: cutMethodLabel(m), value: m }))"
                  :aria-label="`Cut out: ${row.name}`"
                  @update:model-value="setCutOut(row.planned, $event)"
                />
                <span v-else>{{ cutMethodLabel(row.planned.cutOut) }}</span>
              </td>
              <td class="text-body-2" data-label="Then">
                <div v-for="step in row.planned.steps" :key="step.label">
                  {{ step.label }} <span class="text-medium-emphasis">· {{ stepToolLabel(step.by) }}</span>
                </div>
                <span v-if="!row.planned.steps.length" class="text-medium-emphasis">—</span>
              </td>
            </tr>
          </template>
        </tbody>
      </v-table>
    </v-card>
  </template>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 36px;
  padding: 14px 20px;
}
.stat .value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.3;
}
.stat .name {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}
.stat.wide {
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.by-hand {
  font-size: 0.95rem;
  line-height: 1.95;
}
.group-row {
  cursor: pointer;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.chevron {
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
/*
 * A phone: a table's row is a card, each cell on a line of its own under the row's
 * name with what it is before it, so the method and bit pickers have the card's whole width.
 */
@media (max-width: 600px) {
  .stack :deep(thead) {
    display: none;
  }
  .stack :deep(tbody tr) {
    display: block;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }
  .stack :deep(tbody td) {
    display: flex;
    align-items: center;
    gap: 10px;
    height: auto !important;
    padding: 3px 0 !important;
    border: 0 !important;
    text-align: left !important;
    white-space: normal !important;
  }
  .stack :deep(tbody td:empty) {
    display: none;
  }
  .stack :deep(tbody td.lead) {
    font-weight: 600;
    padding-bottom: 6px !important;
  }
  .stack :deep(tbody td[data-label]::before) {
    content: attr(data-label);
    flex: 0 0 6.2rem;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .stack :deep(tbody td[data-label] > *) {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* A row's two bit pickers: one under the other, each the card's width. */
  .stack :deep(tbody td[data-label='Bits']) {
    flex-wrap: wrap;
  }
  .stack :deep(tbody td[data-label='Bits'] > .v-input) {
    flex: 1 1 100%;
  }
  .stack :deep(tbody td[data-label='Bits'] > .v-input ~ .v-input) {
    margin-left: calc(6.2rem + 10px);
  }
  .offered {
    flex-basis: 100%;
  }
  .stack :deep(tr.group-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .stack :deep(tr.group-row td[data-label]::before) {
    content: none;
  }
}
</style>
