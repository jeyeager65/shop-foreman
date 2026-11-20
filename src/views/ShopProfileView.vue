<script setup lang="ts">
import { mdiChevronDown, mdiChevronRight, mdiClose, mdiDotsVertical } from '@mdi/js';
import { computed, provide, reactive, ref, toRaw } from 'vue';
import { useRoute } from 'vue-router';
import TabMethodExamples from '@/components/TabMethodExamples.vue';
import BitsCard from '@/components/BitsCard.vue';
import FoldCard from '@/components/FoldCard.vue';
import TopicShell from '@/components/TopicShell.vue';
import { type Topic, useTopics } from '@/components/topics';
import LengthField from '@/components/LengthField.vue';
import MmField from '@/components/MmField.vue';
import UnitButton from '@/components/UnitButton.vue';
import { slideMountWords, clearCoats, coatsWords, coverageShown, coverageStored, coverageUnit, isColour, deletePreset, footWidth, handleHeight, handleLook, isHandle, isHinge, isShelfPin, isSlide, madeHandle, printedHandleProblems, renamePreset } from '@/design';
import { presetsOf } from '@/samples/presets';
import type { Caster, Finish, FinishKind, Handle, Length, MachineProfile, Material, MaterialGroup, MaterialUse, PocketSleeve, ShownIn, Slide } from '@/model';
import { FINISH_STARTS, newFinish, addRouterMark, removeRouterMark, routerPresetId, setRouterName, setRouterPreset, setRouterSpeed, MACHINE_FIELDS, MACHINE_GROUPS, ROUTERS, copyMachine, machineFieldTune, machineValue, removeMachine, setMachineTiling, setMachineValue, useMachine } from '@/libraries';
import type { MachineField, MachineFieldGroup } from '@/libraries';
import { machineRouter } from '@/plan';
import { POCKET_SLEEVE, SLEEVE_LIMITS, sleeveHolds, sleeveProblems, sleeveWords } from '@/geometry/pocketHole';
import { useAppStore } from '@/stores/app';
import { INCH_DISPLAY, MM_DISPLAY, UNIT_KINDS, feedShown, feedStored, formatLength, len, nextFeedUnit, shownUnit } from '@/units';

const store = useAppStore();
const route = useRoute();
const presets = computed(() => presetsOf(store.shop));
const STYLE = { faceFrame: 'face frame', frameless: 'frameless', shop: 'inset' };
const machine = computed(() => store.shop.machines.find((m) => m.id === store.shop.activeMachineId));
const D = computed(() => store.sizeLength);
const hinges = computed(() => store.shop.hardware.filter(isHinge));
const slides = computed(() => store.shop.hardware.filter(isSlide));
const shelfPins = computed(() => store.shop.hardware.filter(isShelfPin));
const handles = computed(() => store.shop.hardware.filter(isHandle));
const casters = computed(() => store.shop.hardware.filter((h): h is Caster => h.kind === 'caster'));
/** The metal sleeve the pocket-hole drill guide is printed for: the shop's own, or the usual one until a size is typed. */
const sleeve = computed<PocketSleeve>(() => store.shop.pocketSleeve ?? POCKET_SLEEVE);
const sleeveUnits = reactive<{ shownIn?: ShownIn }>({});
const setSleeve = (patch: Partial<PocketSleeve>) => (store.shop.pocketSleeve = { ...sleeve.value, ...patch });
const sleeveWrong = computed(() => sleeveProblems(sleeve.value));
const sleeveLine = computed(() => `${sleeve.value.count === 2 ? 'two of ' : ''}${sleeveWords(sleeve.value)}`);
const FASTENINGS = [
  { title: 'Heat-set inserts (recommended)', value: 'heatSetInsert' },
  { title: 'Screws into the plastic', value: 'screw' },
];
/** What a handle is, in a line. */
const handleFacts = (h: Handle) => {
  const look = handleLook(h);
  const size = h.holes === 2 ? `two ${h.hole.diameter} mm holes ${+h.spacing.toFixed(2)} mm apart` : `one ${h.hole.diameter} mm hole`;
  if (h.routed) {
    const r = h.routed;
    return r.shape === 'hole' ? `Cut into the front: a ${+r.width.toFixed(1)} mm hole through it` : `Cut into the front: a ${r.shape === 'scoop' ? 'half-round' : 'square'} notch ${+r.width.toFixed(1)} mm long, ${+r.depth.toFixed(1)} mm deep, in its edge`;
  }
  const how = madeHandle(h, store.shop.materialCatalog);
  if (!how) return `${h.holes === 2 ? 'Pull' : 'Knob'}: ${size}`;
  const made = how.design === 'knob' ? `${look.length} mm across, ${handleHeight(h)} mm tall` : `${+look.length.toFixed(1)} mm long, ${+how.width.toFixed(1)} mm wide, stands ${handleHeight(h)} mm off the front, feet ${+footWidth(h).toFixed(1)} mm`;
  return `${how.how === 'cnc' ? 'Cut on the CNC' : '3D printed'} ${how.design}: ${size} · ${made}`;
};
const FINISH_KINDS: { title: string; value: FinishKind }[] = [
  { title: 'Paint', value: 'paint' },
  { title: 'Stain', value: 'stain' },
  { title: 'Clear coat', value: 'clear' },
  { title: 'Primer', value: 'primer' },
];
function addFinish(kind: FinishKind) {
  let n = 1;
  while (store.shop.finishes.some((f) => f.id === `${kind}-own-${n}`)) n++;
  store.shop.finishes.push(newFinish(kind, `${kind}-own-${n}`));
}
/** A finish made another kind takes that kind's usual coats (a paint's primer, a stain's clear coat) and a colour where it needs one. */
function setFinishKind(f: Finish, kind: FinishKind) {
  const start = FINISH_STARTS[kind];
  f.kind = kind;
  f.coats = start.coats;
  if (start.primerCoats === undefined) delete f.primerCoats;
  else f.primerCoats = start.primerCoats;
  if (start.clearCoats === undefined) delete f.clearCoats;
  else f.clearCoats = start.clearCoats;
  if (!isColour(f)) f.color = '';
  else if (!f.color) f.color = start.color;
}
/** Coats are whole numbers, none or more. */
const setCoats = (f: Finish, key: 'coats' | 'primerCoats' | 'clearCoats', value: unknown) => {
  const n = Math.round(Number(value));
  if (Number.isFinite(n) && n >= (key === 'coats' ? 1 : 0)) f[key] = n;
};
/** Coverage is typed as the can says it: square feet a quart where sizes are in inches, m² a litre in mm. */
const areaUnit = computed<'in' | 'mm'>(() => (store.shop.units.sizes.kind === 'mm' ? 'mm' : 'in'));
function setCoverage(f: Finish, value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  f.coverage = coverageStored(n, areaUnit.value);
  // Typed by the user: no longer a placeholder.
  if (f.tuneMe) f.tuneMe = f.tuneMe.filter((t) => t !== 'coverage');
}
const projectClear = computed(() => clearCoats(store.shop)[0]);
function removeFinish(id: string) {
  store.shop.finishes = store.shop.finishes.filter((f) => f.id !== id);
}
const handleMaterials = computed(() => store.shop.materialCatalog.map((m) => ({ title: m.name, value: m.id })));
/**
 * The catalog by material type (plywood, MDF, hardboard, OSB, solid wood: they come with the app), each
 * entry a thickness of one, thinnest first. A material whose type is gone is listed under "Other".
 */
const materialGroups = computed(() => {
  const byThickness = (list: Material[]) => [...list].sort((x, y) => x.nominalThickness.mm - y.nominalThickness.mm);
  const groups: { group: MaterialGroup | null; materials: Material[] }[] = store.shop.materialGroups.map((group) => ({ group, materials: byThickness(store.shop.materialCatalog.filter((m) => m.groupId === group.id)) }));
  const lost = store.shop.materialCatalog.filter((m) => !store.shop.materialGroups.some((g) => g.id === m.groupId));
  return lost.length ? [...groups, { group: null, materials: lost }] : groups;
});
/** The types that are open: each is one line until it is. `#/shop?types=plywood,mdf` opens with those open. */
const openTypes = ref(new Set<string>(String(route.query.types ?? '').split(',').filter(Boolean)));
function toggleType(id: string) {
  const open = new Set(openTypes.value);
  if (!open.delete(id)) open.add(id);
  openTypes.value = open;
}
const sizeWords = (sheets: Material['sheets']) => (sheets?.length ? sheets.map((s) => `${D.value(s.x.mm)} × ${D.value(s.y.mm)}`).join(', ') : 'boards');
/** A type in a line: its thicknesses, the sheets it is sold in, and whether it has grain. */
const typeSummary = (group: MaterialGroup, materials: Material[]) =>
  [materials.length ? [...new Set(materials.map((m) => D.value(m.nominalThickness.mm)))].join(', ') : 'none yet', sizeWords(group.sheets), group.hasGrain ? 'grain' : 'no grain'].join(' · ');
const sameSheets = (a: Material['sheets'], b: Material['sheets']) => JSON.stringify((a ?? []).map((s) => [s.x.mm, s.y.mm])) === JSON.stringify((b ?? []).map((s) => [s.x.mm, s.y.mm]));
/** The sheet a type is sold in: its thicknesses that were sold in the old size follow; one sold some other way (a slab) keeps its own. */
function setTypeSheet(group: MaterialGroup, side: 'x' | 'y', value: Length | null) {
  const before = group.sheets ? structuredClone(toRaw(group.sheets)) : undefined;
  if (!value || !group.sheets?.[0]) return;
  group.sheets[0][side] = value;
  for (const m of store.shop.materialCatalog) {
    if (m.groupId === group.id && sameSheets(m.sheets, before)) m.sheets = structuredClone(toRaw(group.sheets));
  }
}
/** What a material may be tagged for, as the pickers ask. */
const USES: { value: MaterialUse; title: string; short: string }[] = [
  { value: 'cases', title: 'Cases', short: 'Cases' },
  { value: 'backs', title: 'Backs and drawer bottoms', short: 'Backs' },
  { value: 'fronts', title: 'Doors and drawer fronts', short: 'Fronts' },
  { value: 'frames', title: 'Face frames', short: 'Frames' },
  { value: 'drawers', title: 'Drawer boxes', short: 'Drawers' },
  { value: 'tops', title: 'Countertops', short: 'Tops' },
  { value: 'skins', title: 'Torsion table skins', short: 'Skins' },
];
const useWords = (m: Material) => USES.filter((u) => m.uses?.includes(u.value)).map((u) => u.short).join(', ');
function setUses(m: Material, uses: MaterialUse[]) {
  if (uses.length) m.uses = USES.map((u) => u.value).filter((u) => uses.includes(u));
  else delete m.uses;
}
/** Its name when it is not just its type's: "Butcher block", "Baltic birch". */
const ownName = (m: Material, group: MaterialGroup | null) => (m.name === group?.name ? '' : m.name);
function setOwnName(m: Material, group: MaterialGroup | null, name: string) {
  m.name = name.trim() || group?.name || m.name;
}
function moveToGroup(m: Material, groupId: string) {
  const group = store.shop.materialGroups.find((g) => g.id === groupId);
  if (!group) return;
  if (m.name === store.shop.materialGroups.find((g) => g.id === m.groupId)?.name) m.name = group.name;
  m.groupId = group.id;
  m.hasGrain = group.hasGrain;
}
/** Another thickness of a type, sold in the type's sheets. The bits cut it on the type's settings. */
function addCatalogMaterial(group: MaterialGroup) {
  let n = 1;
  while (store.shop.materialCatalog.some((m) => m.id === `material-own-${n}`)) n++;
  const sheets = group.sheets ? structuredClone(toRaw(group.sheets)) : undefined;
  store.shop.materialCatalog.push({ id: `material-own-${n}`, name: group.name, groupId: group.id, nominalThickness: len('3/4"'), measuredThickness: len('3/4"'), hasGrain: group.hasGrain, ...(sheets ? { sheets } : {}), tuneMe: ['measuredThickness'] });
  if (!openTypes.value.has(group.id)) toggleType(group.id);
}
/** Out of the catalog. A project that copied it keeps its copy. */
function removeCatalogMaterial(m: Material) {
  store.shop.materialCatalog = store.shop.materialCatalog.filter((x) => x.id !== m.id);
}
/** Another printed handle like this one, to give other sizes: a pull for another spacing. */
function copyHandle(h: Handle) {
  let n = 2;
  while (store.shop.hardware.some((x) => x.id === `${h.id}-${n}`)) n++;
  const copy = JSON.parse(JSON.stringify(h)) as Handle;
  store.shop.hardware.splice(store.shop.hardware.indexOf(h) + 1, 0, { ...copy, id: `${h.id}-${n}`, name: `${h.name} (copy)` });
}
const slideLengths = (s: Slide) => `${D.value(s.lengths[0]!.mm)} to ${D.value(s.lengths.at(-1)!.mm)}`;

/** The machine in use: the card under it shows and changes that one. Choosing another swaps the bits' feeds to its own. */
const machineId = computed({
  get: () => store.shop.activeMachineId,
  set: (id: string) => void useMachine(store.shop, id),
});
/** Another machine like the one in use, put in use so that what differs can be typed. */
function copyTheMachine() {
  const copy = copyMachine(store.shop, store.shop.activeMachineId);
  if (copy) useMachine(store.shop, copy.id);
}
const removingMachine = ref(false);
function removeTheMachine() {
  removeMachine(store.shop, store.shop.activeMachineId);
  removingMachine.value = false;
}
const machineGroups = MACHINE_GROUPS.map((g) => ({ ...g, fields: MACHINE_FIELDS.filter((f) => f.group === g.id) }));
/** A number of the machine as its field shows it: a feed in the shop's feed unit, the rest as stored. */
const machineNumber = (m: MachineProfile, f: MachineField) => {
  const value = machineValue(m, f) as number;
  return f.unit === 'mm/s' ? feedShown(value, store.units.feed) : +value.toFixed(3);
};
/** A typed number; one that cannot be (0 for a height, a letter) puts the field back as it was. */
function setMachineNumber(m: MachineProfile, f: MachineField, event: Event) {
  const input = event.target as HTMLInputElement;
  const typed = input.value.trim() === '' ? Number.NaN : Number(input.value);
  // Feeds are typed in the shop's feed unit and kept in mm/min, as the G-code wants them.
  if (setMachineValue(m, f, f.unit === 'mm/s' ? feedStored(typed, store.units.feed) : Number(typed.toFixed(3)))) return;
  // The field holds what was typed: draw it again from the machine.
  input.value = String(machineNumber(m, f));
  refused.value++;
}
/** A length of the machine kept as a number of mm, typed in either unit; one that cannot be (0 for a height) is drawn again as it was. */
function setMachineMm(m: MachineProfile, f: MachineField, value: number | null) {
  if (value === null || !setMachineValue(m, f, value)) refused.value++;
}
/** A kind of hardware in a line: how many, and which. */
const kindLine = (list: { name: string }[]) => (list.length ? `${list.length}: ${list.map((h) => h.name).join(', ')}` : 'None');

/**
 * The topics: the five tabs and their cards are one rail, Hardware with its kinds
 * as a second level. `#/shop?topic=bits`, `&sub=hinges`; the old `tab=machine|materials|bits|hardware|presets`
 * opens the first topic the tab had, and `bits=`, `feeds=`, `types=` and `group=` the topic they are about.
 */
// The cards a topic is made of show their content alone (`FoldCard`, `BitsCard`).
provide('foldPlain', true);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const topics = computed((): Topic[] => [
  { id: 'machine', group: 'Machines', title: 'Machines', summary: machine.value ? `${machine.value.name} in use${store.shop.machines.length > 1 ? `, of ${store.shop.machines.length}` : ''}` : '', words: 'The CNC machines of the shop, and every value of the one in use.' },
  { id: 'saws', group: 'Machines', title: 'Saws', summary: [store.shop.saws.tableSaw.owned ? 'Table saw' : '', store.shop.saws.miterSaw.owned ? 'Mitre saw' : ''].filter(Boolean).join(', ') || 'None', words: 'The saws on hand: what is not cut on the CNC is listed for them.' },
  { id: 'units', group: 'Machines', title: 'Units', summary: 'Inches and mm, by kind of thing', words: 'The unit a size is shown in where it has no field of its own.' },
  { id: 'materials', group: 'Materials', title: 'Materials', summary: `${store.shop.materialCatalog.length} in the catalog`, words: 'The catalog a project copies its materials from, by type.' },
  { id: 'finishes', group: 'Materials', title: 'Paints and stains', summary: count(store.shop.finishes.length, 'finish', 'finishes'), words: 'Paints, stains, clear coats and primers a project may be finished in.' },
  { id: 'bits', group: 'Tooling', title: 'Bits', summary: count(store.shop.tools.length, 'bit'), words: 'The bit library, by kind, with feeds and speeds for each material type.' },
  {
    id: 'hardware',
    group: 'Tooling',
    title: 'Hardware',
    summary: `${store.shop.hardware.length} pieces`,
    words: 'Hinges, slides, shelf pins, casters, handles and the drill guide\'s sleeve.',
    subs: [
      { id: 'hinges', title: 'Hinges', summary: kindLine(hinges.value), words: 'The hinges a door may hang on.' },
      { id: 'slides', title: 'Drawer slides', summary: kindLine(slides.value), words: 'The slides a drawer or a tray may run on.' },
      { id: 'pins', title: 'Shelf pins', summary: kindLine(shelfPins.value), words: 'The pins an adjustable shelf sits on.' },
      { id: 'casters', title: 'Casters', summary: kindLine(casters.value), words: 'The casters a cabinet may stand on.' },
      { id: 'sleeve', title: 'Drill guide sleeve', summary: sleeveLine.value, words: 'The metal sleeve the printed pocket-hole drill guide is made for.' },
      { id: 'handles', title: 'Handles', summary: kindLine(handles.value), words: 'Knobs and pulls: bought, printed, cut on the CNC, or cut into the front itself.' },
    ],
  },
  { id: 'presets', group: 'Projects', title: 'Presets', summary: `${presets.value.length}`, words: 'What a new project starts from.' },
]);
const TAB_TOPICS: Record<string, string> = { machine: 'machine', materials: 'materials', bits: 'bits', hardware: 'hardware', presets: 'presets' };
const nav = useTopics(() => topics.value, {
  from: (query) => TAB_TOPICS[String(query.tab ?? '')] ?? (query.bits || query.feeds ? 'bits' : query.types ? 'materials' : query.group ? 'machine' : undefined),
  keep: 'all',
});
/** The machine's group of values that is open: one at a time, the rest a line each. `#/shop?tab=machine&group=probe` opens one. */
const machineOpen = ref(String(useRoute().query.group ?? ''));
/** A value of the machine as its field shows it, with its unit: "0.5 mm", "34\"", "3 mm/s". */
const machineShown = (m: MachineProfile, f: MachineField) => {
  const value = machineValue(m, f);
  return f.unit === 'length'
    ? D.value((value as Length).mm)
    : f.unit === 'mm/s'
      ? `${feedShown(value as number, store.units.feed)} ${store.units.feed}`
      : f.unit === 'mm'
        ? shownUnit(m, f.path) === 'in'
          ? formatLength(value as number, INCH_DISPLAY)
          : `${+(value as number).toFixed(3)} mm`
        : `${+(value as number).toFixed(3)} ${f.unit}`;
};
/** A group's values in a line of words, the ones that say most first: "0.5 mm plate · 3 mm/s then 1 mm/s · 80 mm travel". */
function machineGroupLine(m: MachineProfile, group: MachineFieldGroup, fields: MachineField[]): string {
  const v = (path: string) => {
    const f = fields.find((x) => x.path === path);
    return f ? machineShown(m, f) : '';
  };
  switch (group) {
    case 'size':
      return [`cuts ${v('cuttingArea.x')} × ${v('cuttingArea.y')}`, `sheet ${v('defaultSheet.x')} × ${v('defaultSheet.y')}`, m.tiling ? `sheets to ${D.value(m.tiling.maxLength.mm)} with tiling` : ''].filter(Boolean).join(' · ');
    case 'probe':
      return [`${v('probe.plateThickness')} plate`, m.probe.slowFeed > 0 ? `${v('probe.fastFeed')} then ${v('probe.slowFeed')}` : `one touch at ${v('probe.fastFeed')}`, `${v('probe.maxTravel')} travel`].join(' · ');
    case 'motion':
      return [`${v('safeHeight')} above the stock`, `plunge to ${v('maxPlungeFeed')}`, `rapid ${v('rapidFeed')}`, `${v('toolChangeSeconds')} a bit change`].join(' · ');
    case 'tabs':
      return `${m.tabs.method === 'perSide' ? 'evenly along every side' : 'smart'} · ${v('tabs.width')} wide · ${v('tabs.heightPercent')} of the stock high · spacing ${v('tabs.maxSpacing')}`;
    case 'nesting':
      return `${v('nesting.partSpacing')} between parts · ${v('nesting.edgeMargin')} of waste around them`;
    case 'pins':
      return `${v('flipPins.diameter')} pins · holes ${v('flipPins.holeClearance')} bigger · ${v('flipPins.spoilboardDepth')} into the spoilboard`;
  }
}
/** Counts the values that were refused, to draw their fields again as the machine has them. */
const refused = ref(0);
const machineHint = (m: MachineProfile, f: MachineField) => [machineFieldTune(m, f) ? 'Placeholder: tune me' : '', f.hint ?? ''].filter(Boolean).join(' · ');
/** Tiling: a sheet longer than the cutting area hangs over the table's ends. Turned on, it starts at a full sheet or the cutting area, whichever is longer. */
const tiling = computed({
  get: () => !!machine.value?.tiling,
  set: (on: boolean) => {
    if (machine.value) setMachineTiling(machine.value, on ? (machine.value.cuttingArea.y.mm > len('96"').mm ? { ...toRaw(machine.value.cuttingArea.y) } : len('96"')) : null);
  },
});
const settingsBlock = computed({
  get: () => machine.value?.postOptions?.parameters ?? false,
  set: (on: boolean) => {
    if (machine.value) machine.value.postOptions = { ...machine.value.postOptions, parameters: on };
  },
});

/** The preset the machine's router still is (none once its name or a speed was typed over); choosing one fills both in. */
const routerId = computed({
  get: () => (machine.value ? (routerPresetId(machineRouter(machine.value)) ?? null) : null),
  set: (id: string | null) => {
    if (machine.value && id) setRouterPreset(machine.value, id);
  },
});
function setTheRouterName(m: MachineProfile, event: Event) {
  if (!setRouterName(m, (event.target as HTMLInputElement).value)) refused.value++;
}
/** A typed dial speed; one that cannot be (not between the marks beside it) puts the field back. */
function setTheRouterSpeed(m: MachineProfile, index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  if (!setRouterSpeed(m, index, input.value.trim() === '' ? Number.NaN : Number(input.value))) refused.value++;
}
/** The unit a kind of thing is shown in where there is no field: inches or mm. */
const kindUnit = (key: (typeof UNIT_KINDS)[number]['key']) => (store.units[key].kind === 'mm' ? 'mm' : 'in');
const setKindUnit = (key: (typeof UNIT_KINDS)[number]['key'], unit: string) => (store.shop.units[key] = unit === 'mm' ? { ...MM_DISPLAY } : { ...INCH_DISPLAY });
</script>

<template>
  <h1 class="text-h4 mb-2">Shop profile</h1>
  <p class="text-body-2 text-medium-emphasis mb-6">
    Values marked <v-chip size="x-small" color="warning" variant="tonal">tune me</v-chip> are conservative placeholders until measured on real cuts.
  </p>
  <!-- One topic at a time, on the shell Setup and Design share: `#/shop?topic=bits` opens one (and the old `tab=`); every topic stays in the page, hidden. -->
  <TopicShell :nav="nav" name="shop" icon="shop" list-label="Section">
    <div v-if="machine" v-show="nav.current.id === 'machine'" class="shop-topic" data-test="machine-card">
            <div class="d-flex align-center ga-2 mb-1">
              <v-select
                v-model="machineId"
                label="Machine in use"
                :items="store.shop.machines.map((m) => ({ title: m.name, value: m.id }))"
                hide-details
                data-test="machine-select"
              />
              <v-btn variant="tonal" data-test="machine-copy" title="Another machine like this one, to change what differs" @click="copyTheMachine">Copy</v-btn>
              <v-btn variant="text" :disabled="store.shop.machines.length < 2" data-test="machine-remove" @click="removingMachine = true">Remove</v-btn>
            </div>
            <div class="text-caption text-medium-emphasis mb-4">
              A new project takes the machine in use and keeps it: each project is planned for its own machine, chosen in its Setup. The bits are the shop's; their feeds and speeds are each machine's own, and a copy
              starts with a copy of them.
            </div>
            <v-row density="compact">
              <v-col cols="12" sm="6"><v-text-field v-model="machine.name" label="Name" hide-details data-test="machine-name" /></v-col>
            </v-row>
            <div class="machine-group">Router<span class="machine-note text-caption text-medium-emphasis ml-2">Its speed is set by hand: the messages in the G-code give the nearest half step on its dial for the RPM a bit asks for.</span></div>
            <v-row density="compact">
              <v-col cols="12" sm="6">
                <v-text-field
                  :key="`router-${machine.id}-${refused}`"
                  :model-value="machineRouter(machine).name"
                  label="Router name"
                  hide-details
                  data-test="router-name"
                  @change="setTheRouterName(machine, $event)"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="routerId"
                  label="Start from"
                  placeholder="Your own"
                  persistent-placeholder
                  :items="ROUTERS.map((r) => ({ title: r.name, value: r.id }))"
                  hide-details
                  data-test="router-preset"
                />
              </v-col>
              <v-col v-for="(mark, i) in machineRouter(machine).speeds" :key="`${machine.id}-${i}-${refused}`" cols="6" sm="4">
                <v-text-field
                  :model-value="mark.rpm"
                  :label="`Dial ${mark.dial}`"
                  suffix="RPM"
                  type="number"
                  min="0"
                  step="any"
                  hide-details
                  :data-test="`router-speed-${i}`"
                  @change="setTheRouterSpeed(machine, i, $event)"
                />
              </v-col>
            </v-row>
            <div class="d-flex align-center ga-2 mt-1">
              <v-btn variant="text" size="small" color="primary" data-test="router-add-mark" @click="addRouterMark(machine)">Add a mark</v-btn>
              <v-btn variant="text" size="small" :disabled="machineRouter(machine).speeds.length <= 2" data-test="router-remove-mark" @click="removeRouterMark(machine)">Remove the last mark</v-btn>
            </div>
            <div class="text-caption text-medium-emphasis mb-2">
              Choosing a router to start from fills in its name and its dial speeds; both can then be typed over. The speeds rise with the dial.
            </div>
            <template v-for="g in machineGroups" :key="g.id">
              <!-- A group is one line until it is opened; opening one folds the one that was open. -->
              <button type="button" class="machine-fold" :aria-expanded="machineOpen === g.id" :data-test="`machine-group-${g.id}`" @click="machineOpen = machineOpen === g.id ? '' : g.id">
                <v-icon :icon="machineOpen === g.id ? mdiChevronDown : mdiChevronRight" size="20" />
                <span class="machine-fold-title">{{ g.title }}</span>
                <span v-if="machineOpen !== g.id" class="machine-fold-line text-body-2 text-medium-emphasis">{{ machineGroupLine(machine, g.id, g.fields) }}</span>
              </button>
              <div v-if="machineOpen === g.id && g.note" class="machine-note text-caption text-medium-emphasis mb-2">{{ g.note }}</div>
              <v-row v-show="machineOpen === g.id" density="compact">
                <!-- How the holding tabs are placed: a choice, not a number. -->
                <v-col v-if="g.id === 'tabs'" cols="12">
                  <div class="text-caption text-medium-emphasis mb-2">
                    Tabs are placed for you, on straight sides and on curves, never near a corner. Choose how: each picture is a part with its
                    tabs (the orange marks) as a job would leave them with the values below and a 1/4" bit, and changes as they are typed.
                  </div>
                  <TabMethodExamples :tabs="machine.tabs" :show="(mm: number) => D(mm)" class="mb-3" @choose="machine.tabs.method = $event" />
                </v-col>
                <v-col v-for="f in g.fields" :key="f.path" cols="12" sm="6">
                  <LengthField
                    v-if="f.unit === 'length'"
                    :model-value="(machineValue(machine, f) as Length)"
                    :label="f.label"
                    :data-test="`machine-${f.path}`"
                    @update:model-value="$event && setMachineValue(machine, f, $event)"
                  />
                  <MmField
                    v-else-if="f.unit === 'mm'"
                    :key="`mm-${machine.id}-${refused}`"
                    :model-value="(machineValue(machine, f) as number)"
                    :owner="machine"
                    :field="f.path"
                    :label="f.label"
                    :tune-me="machineFieldTune(machine, f)"
                    :hint="f.hint"
                    :data-test="`machine-${f.path}`"
                    @update:model-value="setMachineMm(machine, f, $event)"
                  />
                  <v-text-field
                    v-else
                    :key="`${machine.id}-${refused}-${store.units.feed}`"
                    :model-value="machineNumber(machine, f)"
                    :label="f.label"
                    :suffix="f.unit === 'mm/s' ? undefined : f.unit"
                    type="number"
                    min="0"
                    step="any"
                    :hint="machineHint(machine, f)"
                    :persistent-hint="!!machineHint(machine, f)"
                    :data-test="`machine-${f.path}`"
                    @change="setMachineNumber(machine, f, $event)"
                  >
                    <!-- A feed: its unit is the shop's, and a click on it changes every feed's. -->
                    <template v-if="f.unit === 'mm/s'" #append-inner>
                      <UnitButton
                        :unit="store.units.feed"
                        :title="`Feeds are shown in ${store.units.feed}. Click for ${nextFeedUnit(store.units.feed)}: every feed in the shop follows.`"
                        data-test="feed-unit"
                        @click.stop="store.shop.units.feed = nextFeedUnit(store.units.feed)"
                      />
                    </template>
                  </v-text-field>
                </v-col>
                <template v-if="g.id === 'size'">
                  <v-col cols="12" class="pa-0" />
                  <v-col cols="12" sm="6">
                    <v-switch v-model="tiling" label="A longer sheet may hang over the table's ends" color="primary" density="compact" hide-details data-test="machine-tiling" />
                  </v-col>
                  <v-col v-if="machine.tiling" cols="12" sm="6">
                    <LengthField
                      :model-value="machine.tiling.maxLength"
                      label="Longest sheet"
                      :tune-me="machine.tuneMe.includes('tiling')"
                      data-test="machine-tiling-length"
                      @update:model-value="$event && setMachineTiling(machine, $event)"
                    />
                  </v-col>
                  <v-col cols="12" class="text-caption text-medium-emphasis pt-0">
                    {{ machine.tiling ? 'A blank longer than the cutting area is cut in two set-ups, slid along Y on pins. X stays a hard limit.' : 'No tiling: a blank is no longer than the cutting area.' }}
                  </v-col>
                </template>
              </v-row>
            </template>
            <div class="machine-group">G-code</div>
            <v-switch v-model="machine.homeZForBitChange" label="Home Z ($HZ) before each bit change and at the end of a file" color="primary" density="compact" hide-details data-test="machine-homez" />
            <v-switch v-model="settingsBlock" label="Write a settings block of FluidNC parameters at the top of each file" color="primary" density="compact" hide-details data-test="machine-parameters" />
            <div class="text-caption text-medium-emphasis mt-2">
              The router is switched by hand: pauses with messages, no M3/M5. Work zero: jog the bit to the front-left corner of the stock, and
              the first file sets X0 Y0 there; Z comes from the probe. Post: FluidNC, mm (G21), .gcode.
            </div>
            <v-dialog v-model="removingMachine" max-width="460">
              <v-card class="pa-5">
                <div class="text-h6 mb-2">Remove {{ machine.name }}?</div>
                <div class="text-body-2 mb-4">Its values and its feeds and speeds for every bit go with it. {{ store.shop.machines.find((m) => m.id !== machine!.id)?.name }} is put in use.</div>
                <div class="d-flex justify-end ga-2">
                  <v-btn variant="text" @click="removingMachine = false">Keep it</v-btn>
                  <v-btn color="error" variant="tonal" data-test="machine-remove-yes" @click="removeTheMachine">Remove</v-btn>
                </div>
              </v-card>
            </v-dialog>
    </div>
    <div v-show="nav.current.id === 'saws'" class="shop-topic" data-test="saws">
            <v-row density="compact" class="align-center">
              <v-col cols="5"><v-switch v-model="store.shop.saws.tableSaw.owned" label="Table saw" color="primary" density="compact" hide-details /></v-col>
              <v-col cols="7">
                <LengthField v-model="store.shop.saws.tableSaw.ripCapacity" label="Rip capacity (fence to blade)" />
              </v-col>
            </v-row>
            <v-switch v-model="store.shop.saws.circularSaw.owned" label="Circular/track saw" color="primary" density="compact" hide-details />
            <v-switch v-model="store.shop.saws.miterSaw.owned" label="Miter saw" color="primary" density="compact" hide-details />
            <div class="text-caption text-medium-emphasis mt-2">
              Plan suggests the table saw for plain rectangles it can take and for solid wood ripped to width, the circular/track saw for a panel
              too big for the table saw, and the miter saw to cut solid wood to length. A jig saw is only the hand step for the toe-kick
              notch of a side cut out on a saw.
            </div>
    </div>
    <div v-show="nav.current.id === 'units'" class="shop-topic" data-test="shop-topic-units">
            <div class="text-body-2 text-medium-emphasis mb-3">
              A field has its own unit: click the small in or mm in it. Where there is no field (a worked-out size, a table, a list), the
              unit goes by the kind of thing, on every screen.
            </div>
            <div v-for="k in UNIT_KINDS" :key="k.key" class="d-flex align-center ga-3 mb-2" :data-test="`unit-kind-${k.key}`">
              <v-btn-toggle :model-value="kindUnit(k.key)" mandatory density="compact" color="primary" variant="outlined" divided class="flex-shrink-0" @update:model-value="setKindUnit(k.key, $event)">
                <v-btn value="in" size="small" :data-test="`unit-kind-${k.key}-in`">inches</v-btn>
                <v-btn value="mm" size="small" :data-test="`unit-kind-${k.key}-mm`">mm</v-btn>
              </v-btn-toggle>
              <div>
                <div>{{ k.title }}</div>
                <div class="text-caption text-medium-emphasis">{{ k.covers }}</div>
              </div>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Everything is stored in mm. Inches are shown as fractions to 1/32. Feeds and chip loads have their own units, on the Bits section.
              G-code is always mm.
            </div>
    </div>
    <div v-show="nav.current.id === 'materials'" class="shop-topic" data-test="shop-topic-materials">
            <div class="text-body-2 text-medium-emphasis mb-3">
              Kinds of material a project could be made of, to copy into a project instead of typing them again. Having one here
              says nothing about owning it: each project holds its own copies, with the thickness measured on what was bought for
              it, and changing an entry here changes no project.
            </div>
            <div v-for="{ group, materials } in materialGroups" :key="group?.id ?? 'other'" class="type" :data-test="`material-group-${group?.id ?? 'other'}`">
              <!-- A type is one line until it is opened. -->
              <button v-if="group" type="button" class="type-head" :aria-expanded="openTypes.has(group.id)" @click="toggleType(group.id)">
                <v-icon :icon="openTypes.has(group.id) ? mdiChevronDown : mdiChevronRight" size="20" />
                <span class="type-name">{{ group.name }}</span>
                <span class="text-body-2 text-medium-emphasis">{{ typeSummary(group, materials) }}</span>
              </button>
              <div v-else class="type-head"><span class="type-name">Other (no type)</span></div>
              <div v-if="!group || openTypes.has(group.id)" class="type-body">
                <div v-if="group?.sheets?.[0]" class="d-flex align-center ga-2 mb-3 sold-as">
                  <span class="text-body-2 text-medium-emphasis">Sold as</span>
                  <LengthField :model-value="group.sheets[0].x" label="Across" class="sheet" @update:model-value="setTypeSheet(group, 'x', $event)" />
                  <span class="text-medium-emphasis">×</span>
                  <LengthField :model-value="group.sheets[0].y" label="Along" class="sheet" @update:model-value="setTypeSheet(group, 'y', $event)" />
                  <span class="text-body-2 text-medium-emphasis">{{ group.hasGrain ? 'Has grain: parts keep a grain direction.' : 'No grain: parts may be turned to fit.' }}</span>
                </div>
                <div v-else-if="group" class="text-body-2 text-medium-emphasis mb-3">Sold as boards. {{ group.hasGrain ? 'Has grain: parts keep a grain direction.' : 'No grain.' }}</div>
                <div v-for="m in materials" :key="m.id" class="thickness" :data-test="`catalog-${m.id}`">
                  <LengthField v-model="m.nominalThickness" label="Thickness" class="thick" />
                  <LengthField v-model="m.measuredThickness" :label="m.tuneMe.includes('measuredThickness') ? 'Typical' : 'Measured'" default-unit="mm" class="thick"
                    @update:model-value="m.tuneMe = m.tuneMe.filter((k) => k !== 'measuredThickness')" />
                  <v-text-field :model-value="ownName(m, group)" label="Own name" :placeholder="group?.name" persistent-placeholder density="compact" hide-details class="own-name" @update:model-value="setOwnName(m, group, $event ?? '')" />
                  <v-select :model-value="m.uses ?? []" :items="USES" label="Used for" :placeholder="'anything'" persistent-placeholder multiple density="compact" hide-details class="uses" :data-test="`uses-${m.id}`" @update:model-value="setUses(m, $event)">
                    <template #selection="{ item, index }">
                      <span v-if="index === 0" class="text-body-2 use-words" :title="`${item.title}: ${useWords(m)}`">{{ useWords(m) }}</span>
                    </template>
                  </v-select>
                  <v-menu>
                    <template #activator="{ props: menu }">
                      <v-btn v-bind="menu" :icon="mdiDotsVertical" variant="text" size="small" :aria-label="`More for ${m.name}`" />
                    </template>
                    <v-list density="compact">
                      <v-list-subheader>Move to</v-list-subheader>
                      <v-list-item v-for="g in store.shop.materialGroups.filter((x) => x.id !== m.groupId)" :key="g.id" :title="g.name" @click="moveToGroup(m, g.id)" />
                    </v-list>
                  </v-menu>
                  <v-btn :icon="mdiClose" variant="text" size="small" :aria-label="`Remove ${m.name}`" :data-test="`remove-${m.id}`" @click="removeCatalogMaterial(m)" />
                  <div v-if="!sameSheets(m.sheets, group?.sheets)" class="own-sheet text-caption text-medium-emphasis">Sold as {{ sizeWords(m.sheets) }}</div>
                </div>
                <v-btn v-if="group" variant="text" color="primary" size="small" @click="addCatalogMaterial(group)">Add a thickness</v-btn>
              </div>
            </div>
            <div class="text-caption text-medium-emphasis mt-3">
              The types come with the app. A type holds what its thicknesses share: whether it has grain, the sheets it is sold in, how it
              looks in the 3D view, and the bits' feeds and speeds (under Bits; every type starts on MDF's, tune me). A thickness
              labelled "Typical" is a placeholder until you type what your sheet measures. "Used for" is what the pickers in Setup
              and Design offer a material for; left empty, it is offered for anything.
            </div>
    </div>
    <div v-show="nav.current.id === 'finishes'" class="shop-topic" data-test="shop-topic-finishes">
            <div class="text-body-2 text-medium-emphasis mb-3">
              What a project may be finished in, chosen in Setup. For the picture and the lists only: the colours are near enough to choose
              between, not a maker's colour (tune me). The coats and the area a can covers give the amount to buy; a paint goes over the
              first primer here, and a stain under the project's clear coat (the first one here unless Setup names another).
            </div>
            <div v-for="f in store.shop.finishes" :key="f.id" class="mb-4 finish-entry" :data-test="`finish-${f.id}`">
              <div class="d-flex align-center ga-2 mb-2 finish-row">
                <input v-if="isColour(f)" v-model="f.color" type="color" :aria-label="`Colour of ${f.name}`" style="width: 36px; height: 36px; border: 0; padding: 0; background: none" />
                <div v-else style="width: 36px" />
                <v-text-field v-model="f.name" label="Name" density="compact" hide-details class="flex-grow-1" />
                <v-select :model-value="f.kind" :items="FINISH_KINDS" label="Kind" density="compact" hide-details style="max-width: 140px" @update:model-value="setFinishKind(f, $event)" />
                <v-btn variant="text" size="small" @click="removeFinish(f.id)">Remove</v-btn>
              </div>
              <div class="d-flex align-center ga-2 finish-row finish-coats">
                <div style="width: 36px" />
                <v-text-field
                  v-if="f.kind === 'paint'"
                  :model-value="f.primerCoats ?? 0"
                  type="number"
                  min="0"
                  label="Coats of primer"
                  density="compact"
                  hide-details
                  style="max-width: 130px"
                  :data-test="`finish-primer-coats-${f.id}`"
                  @update:model-value="setCoats(f, 'primerCoats', $event)"
                />
                <v-text-field
                  :model-value="f.coats"
                  type="number"
                  min="1"
                  :label="f.kind === 'paint' ? 'Coats of paint' : f.kind === 'stain' ? 'Coats of stain' : f.kind === 'clear' ? 'Coats on an inside' : 'Coats'"
                  density="compact"
                  hide-details
                  style="max-width: 150px"
                  :data-test="`finish-coats-${f.id}`"
                  @update:model-value="setCoats(f, 'coats', $event)"
                />
                <v-text-field
                  v-if="f.kind === 'stain'"
                  :model-value="f.clearCoats ?? 0"
                  type="number"
                  min="0"
                  label="Coats of clear over it"
                  density="compact"
                  hide-details
                  style="max-width: 160px"
                  :data-test="`finish-clear-coats-${f.id}`"
                  @update:model-value="setCoats(f, 'clearCoats', $event)"
                />
                <v-text-field
                  :model-value="coverageShown(f.coverage, areaUnit)"
                  type="number"
                  min="1"
                  :label="f.tuneMe?.includes('coverage') ? 'One coat covers (tune me)' : 'One coat covers'"
                  :suffix="coverageUnit(areaUnit)"
                  density="compact"
                  hide-details
                  style="max-width: 230px"
                  :data-test="`finish-coverage-${f.id}`"
                  @update:model-value="setCoverage(f, $event)"
                />
              </div>
              <div v-if="isColour(f)" class="text-caption text-medium-emphasis mt-1" style="margin-left: 44px" :data-test="`finish-coats-words-${f.id}`">
                {{ coatsWords(f, projectClear) }}
              </div>
            </div>
            <v-btn variant="tonal" color="primary" size="small" class="mr-2 mb-2" @click="addFinish('paint')">Add a paint</v-btn>
            <v-btn variant="tonal" color="primary" size="small" class="mr-2 mb-2" @click="addFinish('stain')">Add a stain</v-btn>
            <v-btn variant="tonal" color="primary" size="small" class="mr-2 mb-2" @click="addFinish('clear')">Add a clear coat</v-btn>
            <v-btn variant="tonal" color="primary" size="small" class="mb-2" @click="addFinish('primer')">Add a primer</v-btn>
    </div>
    <div v-show="nav.current.id === 'bits'" data-test="shop-topic-bits">
      <BitsCard />
    </div>
    <div v-show="nav.current.id === 'hardware'" class="shop-topic" data-test="shop-topic-hardware">
          <FoldCard v-show="nav.currentSub?.id === 'hinges'" icon="hinges" title="Hinges" name="hw-hinges" group="shop-hardware" :summary="kindLine(hinges)">
            <div v-for="h in hinges" :key="h.id" class="mb-2">
              <div>{{ h.name }} <v-chip v-if="h.generic" size="x-small" class="ml-1">Generic</v-chip></div>
              <div class="text-body-2 text-medium-emphasis">
                {{ h.cup.diameter }} mm cup, {{ h.cup.depth }} mm deep, {{ h.cup.boreDistance }} mm bore distance · cups {{ D(h.placement.fromEnd.mm) }} from the door ends
                <v-chip v-if="h.tuneMe.includes('placement')" size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
              </div>
              <div v-if="h.plate" class="text-body-2 text-medium-emphasis">
                Mounting plate on the case side: two {{ h.plate.hole.diameter }} mm holes, {{ h.plate.hole.depth }} mm deep, {{ h.plate.spacing }} mm apart,
                {{ h.plate.setback }} mm from the front edge
                <v-chip v-if="h.tuneMe.includes('plate')" size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
              </div>
            </div>
          </FoldCard>
          <FoldCard v-show="nav.currentSub?.id === 'slides'" icon="slides" title="Drawer slides" name="hw-slides" group="shop-hardware" :summary="kindLine(slides)">
            <div v-for="s in slides" :key="s.id" class="mb-2">
              <div>{{ s.name }} <v-chip v-if="s.generic" size="x-small" class="ml-1">Generic</v-chip></div>
              <div class="text-body-2 text-medium-emphasis">
                {{ slideMountWords(s) }}, {{ D(s.sideClearance.mm) }} clearance each side · {{ s.lengths.length }} lengths, {{ slideLengths(s) }} · needs
                {{ s.rearClearance }} mm behind it
                <v-chip v-if="s.tuneMe.includes('rearClearance')" size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ s.holes?.length ? 'Screw holes are drilled on the CNC from its hole data.' : 'No hole data: it is positioned and screwed on by hand.' }}
              </div>
            </div>
          </FoldCard>
          <FoldCard v-show="nav.currentSub?.id === 'pins'" icon="hardware" title="Shelf pins" name="hw-pins" group="shop-hardware" :summary="kindLine(store.shop.hardware.filter((h) => h.kind === 'shelfPin'))">
            <div v-for="p in shelfPins" :key="p.id" class="mb-2">
              <div>{{ p.name }} <v-chip v-if="p.generic" size="x-small" class="ml-1">Generic</v-chip></div>
              <div class="text-body-2 text-medium-emphasis">
                {{ +p.hole.diameter.toFixed(2) }} mm holes, {{ +p.hole.depth.toFixed(2) }} mm deep · rows {{ p.rows.frontSetback }} mm from the front edge and
                {{ p.rows.rearSetback }} mm in front of the back, holes {{ p.rows.spacing }} mm apart
                <v-chip v-if="p.tuneMe.length" size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
              </div>
              <div v-if="p.note" class="text-body-2 text-medium-emphasis">{{ p.note }}</div>
            </div>
          </FoldCard>
          <FoldCard v-show="nav.currentSub?.id === 'casters'" icon="hardware" title="Casters" name="hw-casters" group="shop-hardware" :summary="kindLine(casters)" data-test="casters">
            <div v-for="c in casters" :key="c.id" class="mb-2">
              <div>{{ c.name }} <v-chip v-if="c.generic" size="x-small" class="ml-1">Generic</v-chip></div>
              <div class="text-body-2 text-medium-emphasis">
                {{ D(c.overallHeight.mm) }} to the top of its plate · plate {{ c.plate.width }} × {{ c.plate.length }} mm, four {{ c.holes.diameter }} mm holes
                {{ c.holes.x }} × {{ c.holes.y }} mm apart · {{ c.screw }} · {{ c.locking ? 'with a brake' : 'no brake' }} · carries {{ c.load }} kg
                <v-chip size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
              </div>
            </div>
          </FoldCard>
          <FoldCard v-show="nav.currentSub?.id === 'sleeve'" icon="hardware" title="Drill guide sleeve" name="hw-sleeve" group="shop-hardware" :summary="sleeveLine" data-test="sleeve">
            <p class="text-body-2 text-medium-emphasis mb-3">
              The printed pocket-hole drill guide steers its bit in a metal sleeve: a stainless spacer, a bronze bushing, whatever you can buy. Type the size of yours and
              every guide is printed for it. The bore takes a 4 mm or 5/32" bit with little play; longer steers better; two short ones go one at each end of the guide's bore.
              A flanged one seats in a recess, flush; its length is over all, the flange too.
            </p>
            <v-row density="compact">
              <v-col cols="6" sm="3"><MmField :model-value="sleeve.bore" :owner="sleeveUnits" field="bore" label="Bore" density="compact" hide-details="auto" data-test="sleeve-bore" @update:model-value="$event && setSleeve({ bore: $event })" /></v-col>
              <v-col cols="6" sm="3"><MmField :model-value="sleeve.outside" :owner="sleeveUnits" field="outside" label="Outside diameter" density="compact" hide-details="auto" data-test="sleeve-outside" @update:model-value="$event && setSleeve({ outside: $event })" /></v-col>
              <v-col cols="6" sm="3"><MmField :model-value="sleeve.length" :owner="sleeveUnits" field="length" label="Length" density="compact" hide-details="auto" data-test="sleeve-length" @update:model-value="$event && setSleeve({ length: $event })" /></v-col>
              <v-col cols="6" sm="3">
                <v-select :model-value="sleeve.count" :items="[{ title: 'One', value: 1 }, { title: 'Two, in line', value: 2 }]" label="Sleeves a guide" density="compact" hide-details data-test="sleeve-count" @update:model-value="setSleeve({ count: $event === 2 ? 2 : 1 })" />
              </v-col>
              <v-col cols="12" sm="4">
                <v-switch :model-value="!!sleeve.flange" label="Flanged" color="primary" density="compact" hide-details data-test="sleeve-flanged" @update:model-value="setSleeve({ flange: $event ? { diameter: sleeve.outside + 4, thickness: 2 } : undefined })" />
              </v-col>
              <template v-if="sleeve.flange">
                <v-col cols="6" sm="4"><MmField :model-value="sleeve.flange.diameter" :owner="sleeveUnits" field="flange.diameter" label="Flange's diameter" density="compact" hide-details="auto" data-test="sleeve-flange" @update:model-value="$event && setSleeve({ flange: { ...sleeve.flange, diameter: $event } })" /></v-col>
                <v-col cols="6" sm="4"><MmField :model-value="sleeve.flange.thickness" :owner="sleeveUnits" field="flange.thickness" label="Flange's thickness" density="compact" hide-details="auto" data-test="sleeve-flange-thickness" @update:model-value="$event && setSleeve({ flange: { ...sleeve.flange, thickness: $event } })" /></v-col>
              </template>
            </v-row>
            <v-alert v-for="w in sleeveWrong" :key="w" type="warning" variant="tonal" density="compact" class="mt-3" data-test="sleeve-problem">{{ w }}</v-alert>
            <p class="text-body-2 text-medium-emphasis mt-3 mb-0">
              Within limits: a bore from the bit's size to {{ SLEEVE_LIMITS.looseBore }} mm over it, up to {{ SLEEVE_LIMITS.outside }} mm outside, and about
              {{ Math.floor(sleeveHolds(sleeve) * 10) / 10 }} mm of sleeve in all at this size. Untested: tune me.
            </p>
          </FoldCard>
          <FoldCard v-show="nav.currentSub?.id === 'handles'" icon="hardware" title="Handles" name="hw-handles" group="shop-hardware" :summary="kindLine(handles)">
            <div class="text-body-2 text-medium-emphasis mb-3">
              Knobs and pulls for doors and drawers. A front's handle is chosen in Design, and the CNC drills its holes. The printed and the wooden ones are
              made here to the sizes below: the job's 3D prints have a printed one for every front that uses it, and a wooden one is cut on the
              CNC with the job, an extra part for every front.
            </div>
            <div v-for="h in handles" :key="h.id" class="mb-3" :data-test="`handle-${h.id}`">
              <v-sheet v-if="h.routed" border rounded="lg" class="pa-3">
                <div class="d-flex align-center mb-2">
                  <v-text-field v-model="h.name" label="Name" density="compact" hide-details class="flex-grow-1" />
                  <v-btn variant="text" color="primary" size="small" class="ml-2" @click="copyHandle(h)">Copy</v-btn>
                </div>
                <v-row density="compact">
                  <v-col cols="4">
                    <MmField v-model="h.routed.width" :owner="h" field="routed.width" :label="h.routed.shape === 'hole' ? 'Diameter' : 'Length along the edge'" density="compact" hide-details="auto" />
                  </v-col>
                  <v-col v-if="h.routed.shape !== 'hole'" cols="4"><MmField v-model="h.routed.depth" :owner="h" field="routed.depth" label="Depth into the front" density="compact" hide-details="auto" /></v-col>
                </v-row>
                <div class="text-body-2 text-medium-emphasis mt-2">
                  {{ handleFacts(h) }} · nothing to fit
                  <v-chip size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
                </div>
              </v-sheet>
              <template v-else-if="!h.printed && !h.cnc">
                <div>{{ h.name }} <v-chip v-if="h.generic" size="x-small" class="ml-1">Generic</v-chip></div>
                <div class="text-body-2 text-medium-emphasis">
                  {{ handleFacts(h) }}
                  <v-chip v-if="h.tuneMe.includes('hole')" size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
                </div>
              </template>
              <v-sheet v-else border rounded="lg" class="pa-3">
                <div class="d-flex align-center mb-2">
                  <v-text-field v-model="h.name" label="Name" density="compact" hide-details class="flex-grow-1" />
                  <v-btn variant="text" color="primary" size="small" class="ml-2" @click="copyHandle(h)">Copy</v-btn>
                </div>
                <v-row density="compact">
                  <v-col v-if="h.holes === 2" cols="4"><MmField v-model="h.spacing" :owner="h" field="spacing" label="Hole centres" density="compact" hide-details="auto" /></v-col>
                  <v-col v-if="(h.printed ?? h.cnc)!.design !== 'arch'" cols="4">
                    <MmField v-model="h.look.length" :owner="h" field="look.length" :label="h.printed?.design === 'knob' ? 'Diameter' : 'Length'" density="compact" hide-details="auto" />
                  </v-col>
                  <v-col cols="4">
                    <MmField v-model="h.look.projection" :owner="h" field="look.projection" :label="h.printed?.design === 'knob' ? 'Height to the head' : 'Room for fingers'" density="compact" hide-details="auto" />
                  </v-col>
                  <v-col cols="4">
                    <MmField v-model="h.look.thickness" :owner="h" field="look.thickness" :label="h.printed?.design === 'knob' ? 'Head thickness' : 'Bar thickness'" density="compact" hide-details="auto" />
                  </v-col>
                  <template v-if="h.cnc">
                    <v-col cols="8"><v-select v-model="h.cnc.materialId" :items="handleMaterials" label="Cut from" density="compact" hide-details /></v-col>
                    <v-col cols="4"><MmField v-model="h.cnc.pilot.diameter" :owner="h" field="cnc.pilot.diameter" label="Pilot hole" density="compact" hide-details="auto" /></v-col>
                    <v-col cols="4"><MmField v-model="h.cnc.pilot.depth" :owner="h" field="cnc.pilot.depth" label="Pilot hole depth" density="compact" hide-details="auto" /></v-col>
                  </template>
                  <v-col v-if="h.printed && h.printed.design !== 'knob'" cols="4"><MmField v-model="h.printed.width" :owner="h" field="printed.width" label="Width" density="compact" hide-details="auto" /></v-col>
                  <v-col v-if="h.printed" cols="8"><v-select v-model="h.printed.fastening" :items="FASTENINGS" label="Held by" density="compact" hide-details /></v-col>
                  <template v-if="!h.printed" />
                  <template v-else-if="h.printed.fastening === 'heatSetInsert'">
                    <v-col cols="4"><MmField v-model="h.printed.insert.diameter" :owner="h" field="printed.insert.diameter" label="Insert hole" density="compact" hide-details="auto" /></v-col>
                    <v-col cols="4"><MmField v-model="h.printed.insert.depth" :owner="h" field="printed.insert.depth" label="Insert hole depth" density="compact" hide-details="auto" /></v-col>
                  </template>
                  <template v-else>
                    <v-col cols="4"><MmField v-model="h.printed.pilot.diameter" :owner="h" field="printed.pilot.diameter" label="Screw hole" density="compact" hide-details="auto" /></v-col>
                    <v-col cols="4"><MmField v-model="h.printed.pilot.depth" :owner="h" field="printed.pilot.depth" label="Screw hole depth" density="compact" hide-details="auto" /></v-col>
                  </template>
                </v-row>
                <div class="text-body-2 text-medium-emphasis mt-2">
                  {{ handleFacts(h) }} · {{ (h.printed ?? h.cnc)!.screw }} screws from the back
                  <v-chip size="x-small" color="warning" variant="tonal" class="ml-1">tune me</v-chip>
                </div>
                <v-alert v-for="problem in printedHandleProblems(h, store.shop.materialCatalog)" :key="problem" type="warning" variant="tonal" density="compact" class="mt-2">{{ problem }}</v-alert>
              </v-sheet>
            </div>
            <div class="text-body-2 text-medium-emphasis">
              Heat-set inserts give a metal thread that can be done up tight and undone again; the hole suits a common M4 insert, so check it
              against the ones in hand. Pulls print lying on their side and knobs head down: no supports. A wooden pull is cut out lying on
              its side, so it is as wide as its stock is thick; the pilot holes in its feet are drilled by hand, and its edges rounded by hand.
              None of these has been made yet.
            </div>
          </FoldCard>
    </div>
    <div v-show="nav.current.id === 'presets'" class="shop-topic" data-test="presets">
            <div class="text-body-2 text-medium-emphasis mb-3">
              What a new project starts from: how its cabinets are built, how its doors and drawers are made, its finish and the size a
              new cabinet starts at. A project copies a preset and does not follow it. The built-in ones cannot be changed; save a project's
              values under a name of your own from Setup.
            </div>
            <div v-for="p in presets" :key="p.id" class="d-flex align-center ga-2 mb-2" :data-test="`preset-${p.id}`">
              <template v-if="p.builtIn">
                <span class="flex-grow-1">{{ p.name }}</span>
                <v-chip size="x-small">Built in</v-chip>
              </template>
              <template v-else>
                <v-text-field :model-value="p.name" label="Name" density="compact" hide-details class="flex-grow-1" @update:model-value="renamePreset(store.shop, p.id, $event)" />
                <v-btn variant="text" size="small" @click="deletePreset(store.shop, p.id)">Delete</v-btn>
              </template>
              <span class="text-caption text-medium-emphasis" style="min-width: 7rem">{{ p.start === 'existing' ? 'already there' : STYLE[p.settings.construction] }}</span>
            </div>
    </div>
  </TopicShell>
</template>

<style scoped>
/* A topic's fields keep to a readable width where the page is wide (the bits, a table, take it all). */
.shop-topic {
  max-width: 820px;
}
/* The material catalog: a type is a line (click to open), its thicknesses one row each. */
.type {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.type-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}
.type-head .v-icon {
  align-self: center;
}
.type-name {
  font-weight: 600;
  min-width: 6.5rem;
}
.type-body {
  padding: 4px 0 14px 30px;
}
/* One line a thickness: thickness, measured, its own name, what it is for, the menu, remove. */
.thickness {
  display: grid;
  grid-template-columns: 6.5rem 6.5rem minmax(5rem, 1fr) minmax(8rem, 1.3fr) auto auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.thickness :deep(.v-select__selection) {
  min-width: 0;
}
.use-words {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sheet {
  flex: 0 0 6.5rem;
}
.own-sheet {
  grid-column: 1 / -1;
  margin-top: -6px;
}
.machine-note {
  font-weight: 400;
}
.machine-fold {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
  padding: 8px 0;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  cursor: pointer;
}
.machine-fold .v-icon {
  align-self: center;
  flex: none;
}
.machine-fold-title {
  flex: none;
  font-weight: 600;
}
.machine-fold-line {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.machine-group {
  margin: 18px 0 8px;
  font-weight: 600;
}
/*
 * A phone: a thickness is two lines (its two thicknesses with the menu and remove, then its name and
 * what it is for), and what does not fit beside a row's fields goes under them.
 */
@media (max-width: 600px) {
  .type-head {
    flex-wrap: wrap;
  }
  .type-body {
    padding-left: 0;
  }
  .sold-as {
    flex-wrap: wrap;
  }
  .sold-as > span:last-child {
    flex: 1 1 100%;
  }
  .thickness {
    grid-template-columns: 1fr 1fr auto auto;
    margin-bottom: 16px;
  }
  .thickness > .own-name {
    grid-area: 2 / 1 / 3 / 2;
  }
  .thickness > .uses {
    grid-area: 2 / 2 / 3 / -1;
  }
  .own-sheet {
    grid-row: 3;
    margin-top: 0;
  }
  .finish-row {
    flex-wrap: wrap;
    margin-bottom: 14px !important;
  }
  .finish-coats > .v-text-field {
    flex: 1 1 40%;
    max-width: none !important;
  }
  .finish-row > .v-text-field {
    flex: 1 1 60%;
  }
}
</style>
