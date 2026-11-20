<script setup lang="ts">
/**
 * The Shop profile's bits, as its material catalog is laid out: a kind of bit is one line that opens,
 * a bit is one row of its kind's own fields (`BIT_TYPES`). The kinds come with the app.
 */
import { mdiChevronDown, mdiChevronRight, mdiClose, mdiContentCopy } from '@mdi/js';
import { computed, inject, ref, toRaw } from 'vue';
import { useRoute } from 'vue-router';
import LengthField from '@/components/LengthField.vue';
import MmField from '@/components/MmField.vue';
import UnitButton from '@/components/UnitButton.vue';
import { chipLoadRangeWords, chipLoadShown, chipLoadStored, feedShown, feedStored, feedWords, nextChipLoadUnit, nextFeedUnit } from '@/units';
import PanelTitle from '@/components/PanelTitle.vue';
import { BIT_SETTING_FIELDS, BIT_TYPES, MATERIAL_TYPES, bitAutoName, chipLoad, chipLoadCheck, chipLoadRange, feedForChipLoad, flutesOf, hasNominal, nominalDiameter, bitSettingsSource, copyBit, copyBitSettings, newBit, removeBitSettings, setBitSetting, snapStepover, stepoverForPercent, stepoverPercent, STEPOVER_STEP, bitOwnName, bitSize, routerDial, routerRangeNote, setBitField, setBitName, useMachine } from '@/libraries';
import type { BitField, BitType } from '@/libraries';
import type { Length, Tool } from '@/model';
import { cutDiameter, finishAllowance, machineRouter } from '@/plan';
import { useAppStore } from '@/stores/app';

/** On a page of topics (the Shop profile) the bits are a topic's body: no card of their own, the topic's head over them. */
const plain = inject<boolean>('foldPlain', false);
const store = useAppStore();
const machine = computed(() => store.shop.machines.find((m) => m.id === store.shop.activeMachineId));
/** The machine whose feeds are shown and typed: the shop's machine in use. Choosing another swaps the bits' feeds to its own (`useMachine`). */
const machineId = computed({
  get: () => store.shop.activeMachineId,
  set: (id: string) => void useMachine(store.shop, id),
});

/** Every kind, with the shop's bits of it in the order they were added. */
const groups = computed(() => BIT_TYPES.map((type) => ({ type, tools: store.shop.tools.filter((t) => t.shape.kind === type.kind) })));
/** The kinds that are open: each is one line until it is. `#/shop?bits=endMill,vBit` opens with those open. */
const openKinds = ref(new Set<string>(String(useRoute().query.bits ?? '').split(',').filter(Boolean)));
function toggleKind(kind: string) {
  const open = new Set(openKinds.value);
  if (!open.delete(kind)) open.add(kind);
  openKinds.value = open;
}
/** A new bit of a kind, at a starting size with its values marked "tune me"; its feeds are those of the nearest bit of its kind. */
function add(kind: BitType['kind']) {
  store.shop.tools.push(newBit(kind, store.shop.tools, store.shop.materialGroups));
  if (!openKinds.value.has(kind)) toggleKind(kind);
}
/** Another bit like this one, under it, to give another size. */
function copy(t: Tool) {
  store.shop.tools.splice(store.shop.tools.indexOf(t) + 1, 0, copyBit(toRaw(t), store.shop.tools));
}
/** Out of the shop. A project whose plan chose it falls back to another bit, and its Plan says so. */
function remove(t: Tool) {
  store.shop.tools = store.shop.tools.filter((x) => x.id !== t.id);
}
/** A kind in a line: the sizes of its bits. */
const kindSummary = (tools: Tool[]) => (tools.length ? tools.map((t) => bitSize(t.shape)).join(', ') : 'none yet');
/** What a kind is for, under its heading. */
const KIND_NOTES: Record<BitType['kind'], string> = {
  endMill: 'Cutouts, pockets, grooves and holes.',
  ballNose: 'The ramped floor of CNC-assisted pocket holes (untested).',
  bullNose: 'Not used by any operation yet: it is posted and previewed, for surface work to come.',
  vBit: 'Inside bevels (a sharp point, matched by its angle) and edge chamfers (90°).',
  chamfer: 'Edge chamfers (90°), beside the V-bits.',
  taperBall: 'Not used by any operation yet: it is posted and previewed, for carving to come.',
  roundover: 'Rounded edges, matched by its radius. Point-cutting, no bearing.',
};

const value = (t: Tool, key: string) => (t.shape as unknown as Record<string, unknown>)[key];
/** A length of a bit's shape. What it is sold as is what it measures until the two differ. */
const lengthOf = (t: Tool, key: string) => (value(t, key) as Length | null | undefined) ?? (key === 'nominal' ? nominalDiameter(t.shape) : undefined) ?? null;
/** A field in the line that says what is still a placeholder: "diameter" for the measured one. */
const tuneWord = (t: Tool, f: BitField) => (hasNominal(t.shape.kind) && f.key === type(t).sizeField ? 'diameter' : f.label.toLowerCase());
const type = (t: Tool) => BIT_TYPES.find((b) => b.kind === t.shape.kind)!;
const tune = (t: Tool, key: string) => t.tuneMe.includes(key);
/** A typed number for a field: kept only when it can be one (a whole number of flutes, an angle under 180°). */
function setNumber(t: Tool, field: BitField, text: string | number | null | undefined) {
  const n = Number(text);
  if (text === '' || text === null || text === undefined) {
    // Emptied: a V-bit's flutes go back to not counted.
    if (field.optional) setBitField(t, field.key, null);
    return;
  }
  if (!Number.isFinite(n) || n <= 0) return;
  if (field.unit === 'count' && (!Number.isInteger(n) || n > 12)) return;
  if (field.unit === 'degrees' && n >= 180) return;
  setBitField(t, field.key, n);
}
const CUTS = [
  { title: 'Up', value: 'up' },
  { title: 'Down', value: 'down' },
  { title: 'Compression', value: 'compression' },
];

/** The bits whose feeds are open. `#/shop?bits=endMill&feeds=endmill-1-4` opens with those open. */
const openFeeds = ref(new Set<string>(String(useRoute().query.feeds ?? '').split(',').filter(Boolean)));
function toggleFeeds(id: string) {
  const open = new Set(openFeeds.value);
  if (!open.delete(id)) open.add(id);
  openFeeds.value = open;
}
/** The unit feeds are shown and typed in, and the one chip loads are: each one choice for the whole shop. */
const feedUnit = computed(() => store.units.feed);
const chipUnit = computed(() => store.units.chipLoad);
const cycleFeedUnit = () => (store.shop.units.feed = nextFeedUnit(feedUnit.value));
const cycleChipUnit = () => (store.shop.units.chipLoad = nextChipLoadUnit(chipUnit.value));
/** A setting as its field shows it: a feed in the shop's feed unit, the stepover as a percentage of the bit's width, the rest as stored. */
const shown = (t: Tool, typeId: string, f: (typeof BIT_SETTING_FIELDS)[number]) => {
  const value = t.settings[typeId]?.[f.key];
  return value === undefined ? '' : f.perSecond ? feedShown(value, feedUnit.value) : f.ofWidth ? stepoverPercent(t.shape, value) : value;
};
/** A typed feed or speed; one that cannot be (a feed of 0, a letter) puts the field back as it was. */
function setSetting(t: Tool, typeId: string, f: (typeof BIT_SETTING_FIELDS)[number], event: Event) {
  const input = event.target as HTMLInputElement;
  const text = input.value.trim();
  // Feeds are typed in the shop's feed unit and kept in mm/min, as the G-code wants them.
  // The stepover is typed as a percentage of the bit's width and kept in mm; no more than the whole bit.
  if (f.ofWidth && Number(text) > 100) {
    input.value = String(shown(t, typeId, f));
    return;
  }
  // It goes to the nearest 5%.
  const value = text === '' ? null : f.ofWidth ? snapStepover(t.shape, stepoverForPercent(t.shape, Number(text))) : f.perSecond ? feedStored(Number(text), feedUnit.value) : Number(Number(text).toFixed(3));
  if (!setBitSetting(t, typeId, f.key, value) || f.ofWidth) input.value = String(shown(t, typeId, f));
}
/** A typed depth or allowance, in mm whatever unit it was typed in; one that cannot be is drawn again as it was. */
function setLength(t: Tool, typeId: string, f: (typeof BIT_SETTING_FIELDS)[number], value: number | null) {
  if (!setBitSetting(t, typeId, f.key, value)) refused.value++;
}
/** Counts the values that were refused, to draw their fields again as the bit has them. */
const refused = ref(0);
/** A bit's chip load in a material type, in the shop's chip load unit; empty when its flutes are not known. */
const chipOf = (t: Tool, typeId: string) => {
  const chip = t.settings[typeId] ? chipLoad(t.shape, t.settings[typeId]) : undefined;
  return chip === undefined ? '' : chipLoadShown(chip, chipUnit.value);
};
/** The usual chip load for a bit in a material type, as words under its box, and whether the row is outside it. */
const chipRange = (t: Tool, typeId: string) => {
  const range = chipLoadRange(t.shape, typeId);
  if (!range) return undefined;
  const check = t.settings[typeId] ? chipLoadCheck(t.shape, typeId, t.settings[typeId]) : undefined;
  const words = chipLoadRangeWords(range, chipUnit.value);
  const per = `${chipUnit.value} a tooth`;
  const title =
    check === 'low'
      ? `Below the usual ${words} ${per}: the bit rubs more than it cuts (dust, heat, burn marks). Feed faster or turn the router down.`
      : check === 'high'
        ? `Above the usual ${words} ${per}: a rough cut and a bit that bends or breaks. Feed slower or turn the router up.`
        : `The usual chip load for this bit in this material: ${words} ${per}. A rule of thumb, not cut here.`;
  return { words, check, title };
};
/** A typed chip load sets the feed that gives it at the row's speed. */
function setChip(t: Tool, typeId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const feed = feedForChipLoad(t.shape, t.settings[typeId]?.rpm ?? 0, chipLoadStored(Number(input.value), chipUnit.value));
  if (!feed || !setBitSetting(t, typeId, 'feed', feed)) input.value = chipOf(t, typeId);
}
const dial = (rpm: number) => (machine.value ? routerDial(machineRouter(machine.value), rpm) : '?');
/** What the button that gives a bit feeds for another material type says. */
const copyWords = (t: Tool) => {
  const from = bitSettingsSource(t, store.shop.materialGroups);
  return from ? `Copy from ${store.shop.materialGroups.find((g) => g.id === from)?.name ?? from}` : 'Start on placeholder feeds';
};
const rangeNote = (rpm: number) => {
  const note = machine.value ? routerRangeNote(machineRouter(machine.value), rpm) : '';
  return note ? ` (${note})` : '';
};
/**
 * A bit's settings, which are kept by material type: a line per set of types that share them,
 * "All materials: ..." when every type has the same.
 */
const settings = (t: Tool) => {
  const lines: { materials: string[]; text: string }[] = [];
  for (const [typeId, s] of Object.entries(t.settings)) {
    const material = store.shop.materialGroups.find((g) => g.id === typeId)?.name ?? MATERIAL_TYPES.find((g) => g.id === typeId)?.name ?? typeId;
    const chip = chipLoad(t.shape, s);
    const text = `${feedWords(s.feed, feedUnit.value)}, plunge ${feedShown(s.plungeFeed, feedUnit.value)}${chip ? `, ${chipLoadShown(chip, chipUnit.value)} ${chipUnit.value} chip load` : ''}, ${+s.depthPerPass.toFixed(3)} mm per pass${s.stepover ? `, ${stepoverPercent(t.shape, s.stepover)}% stepover` : ''}${t.shape.kind === 'endMill' ? `, ${+finishAllowance(t, typeId).toFixed(2)} mm left for the finishing pass${s.finishAllowance === undefined ? ' (10% of the bit)' : ''}` : ''}, ${s.rpm} RPM = dial ${machine.value ? routerDial(machineRouter(machine.value), s.rpm) : '?'}${rangeNote(s.rpm)}`;
    const line = lines.find((l) => l.text === text);
    if (line) line.materials.push(material);
    else lines.push({ materials: [material], text });
  }
  return lines.map((l) => `${lines.length === 1 && l.materials.length > 1 ? 'All materials' : l.materials.join(', ')}: ${l.text}`);
};
</script>

<template>
  <v-card :class="plain ? 'bits-plain' : 'pa-5'" :flat="plain" data-test="bits">
    <PanelTitle v-if="!plain" icon="bits">Bits</PanelTitle>
    <div class="text-body-2 text-medium-emphasis mb-3">
      The router bits in the shop. Plan offers a bit only for work its kind and size can do, in a material it has feeds for.
      The feeds and speeds are a machine's own: choose whose are shown and typed here.
    </div>
    <!-- Whose feeds are on the bits: the shop's machine in use. Projects keep the machine each was set up for. -->
    <v-select
      v-model="machineId"
      :items="store.shop.machines.map((m) => ({ title: m.name, value: m.id }))"
      label="Feeds and speeds of"
      hint="This is the shop's machine in use, as on the Machines card: a new project starts on it. No project's own machine changes."
      persistent-hint
      density="compact"
      class="feeds-machine mb-3"
      data-test="bits-machine"
    />
    <div v-for="{ type, tools } in groups" :key="type.kind" class="kind" :data-test="`bit-group-${type.kind}`">
      <!-- A kind is one line until it is opened. -->
      <button type="button" class="kind-head" :aria-expanded="openKinds.has(type.kind)" @click="toggleKind(type.kind)">
        <v-icon :icon="openKinds.has(type.kind) ? mdiChevronDown : mdiChevronRight" size="20" />
        <span class="kind-name">{{ type.name }}</span>
        <span class="text-body-2 text-medium-emphasis">{{ kindSummary(tools) }}</span>
      </button>
      <div v-if="openKinds.has(type.kind)" class="kind-body">
        <div class="text-body-2 text-medium-emphasis mb-3">{{ KIND_NOTES[type.kind] }}</div>
        <div v-for="t in tools" :key="t.id" class="bit" :data-test="`bit-${t.id}`">
          <div class="bit-fields">
            <template v-for="f in type.fields" :key="f.key">
              <LengthField
                v-if="f.unit === 'length'"
                :model-value="lengthOf(t, f.key)"
                :label="f.label"
                :default-unit="f.key === 'cuttingLength' ? 'mm' : 'in'"
                :optional="f.optional"
                density="compact"
                hide-details="auto"
                :class="['bit-field', { wide: f.key === 'cuttingLength' }]"
                :data-test="`bit-${t.id}-${f.key}`"
                @update:model-value="setBitField(t, f.key, $event)"
              />
              <v-select
                v-else-if="f.unit === 'cut'"
                :model-value="value(t, f.key)"
                :items="CUTS"
                :label="f.label"
                density="compact"
                hide-details
                class="bit-field cut"
                @update:model-value="setBitField(t, f.key, String($event))"
              />
              <MmField
                v-else-if="f.unit === 'mm'"
                :model-value="(value(t, f.key) as number | undefined)"
                :owner="t"
                :field="f.key"
                :label="f.label"
                :optional="f.optional"
                density="compact"
                hide-details="auto"
                class="bit-field"
                :data-test="`bit-${t.id}-${f.key}`"
                @update:model-value="setNumber(t, f, $event)"
              />
              <v-text-field
                v-else
                :model-value="value(t, f.key)"
                :label="f.label"
                :suffix="f.unit === 'degrees' ? '°' : undefined"
                type="number"
                min="0"
                :step="f.unit === 'count' ? 1 : 'any'"
                density="compact"
                hide-details
                :class="['bit-field', { narrow: f.unit === 'count' }]"
                :data-test="`bit-${t.id}-${f.key}`"
                @update:model-value="setNumber(t, f, $event)"
              />
            </template>
            <LengthField v-model="t.shank" label="Shank" density="compact" hide-details="auto" class="bit-field" />
            <v-text-field
              :model-value="bitOwnName(t)"
              label="Own name"
              :placeholder="bitAutoName(t.shape)"
              persistent-placeholder
              density="compact"
              hide-details
              class="bit-name"
              :data-test="`bit-${t.id}-name`"
              @update:model-value="setBitName(t, $event ?? '')"
            />
            <v-btn :icon="mdiContentCopy" variant="text" size="small" :aria-label="`Copy the ${t.name}`" :title="`Copy the ${t.name}`" :data-test="`copy-bit-${t.id}`" @click="copy(t)" />
            <v-btn :icon="mdiClose" variant="text" size="small" :aria-label="`Remove the ${t.name}`" :title="`Remove the ${t.name}`" :data-test="`remove-bit-${t.id}`" @click="remove(t)" />
          </div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            {{ cutDiameter(t) ? `${+cutDiameter(t).toFixed(3)} mm at its widest.` : '' }}
            <template v-if="type.fields.some((f) => tune(t, f.key))">
              <v-chip size="x-small" color="warning" variant="tonal" class="mx-1">tune me</v-chip>
              {{ type.fields.filter((f) => tune(t, f.key)).map((f) => tuneWord(t, f)).join(', ') }}: measure the bit.
            </template>
          </div>
          <!-- Feeds and speeds: a line of words until it is opened, then a row per material type. -->
          <button type="button" class="feeds-head text-body-2" :aria-expanded="openFeeds.has(t.id)" :data-test="`bit-${t.id}-feeds`" @click="toggleFeeds(t.id)">
            <v-icon :icon="openFeeds.has(t.id) ? mdiChevronDown : mdiChevronRight" size="18" />
            <span class="feeds-title">Feeds and speeds</span>
            <v-chip v-if="tune(t, 'settings')" size="x-small" color="warning" variant="tonal">tune me</v-chip>
            <span v-if="!openFeeds.has(t.id)" class="text-medium-emphasis">
              <template v-for="line in settings(t)" :key="line">{{ line }}<br /></template>
              <template v-if="settings(t).length === 0">None: it is not offered for any material.</template>
            </span>
          </button>
          <div v-if="openFeeds.has(t.id)" class="feeds">
            <!-- On a phone the table's heads are gone: the units are chosen here. -->
            <div class="feeds-units text-body-2">
              Feeds in <UnitButton :unit="feedUnit" title="Click for the next unit: every feed in the shop follows." @click="cycleFeedUnit" />
              chip load in <UnitButton :unit="`${chipUnit} a tooth`" title="Click for the other unit." @click="cycleChipUnit" />
            </div>
            <table class="feeds-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th v-for="f in BIT_SETTING_FIELDS" :key="f.key">
                    {{ f.label }}
                    <span class="unit">
                      <UnitButton v-if="f.perSecond" :unit="feedUnit" :title="`Feeds are shown in ${feedUnit}. Click for ${nextFeedUnit(feedUnit)}: every feed in the shop follows.`" data-test="feed-unit" @click="cycleFeedUnit" />
                      <template v-else>{{ f.unit === 'RPM' || f.unit === 'mm' ? '' : f.unit }}</template>
                    </span>
                  </th>
                  <th>
                    Chip load
                    <span class="unit"><UnitButton :unit="`${chipUnit} a tooth`" :title="`Chip loads are shown in ${chipUnit} a tooth. Click for ${nextChipLoadUnit(chipUnit)} a tooth.`" data-test="chip-unit" @click="cycleChipUnit" /></span>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in store.shop.materialGroups" :key="g.id" :data-test="`bit-${t.id}-feeds-${g.id}`">
                  <td class="material">{{ g.name }}</td>
                  <template v-if="t.settings[g.id]">
                    <td v-for="f in BIT_SETTING_FIELDS" :key="f.key" :data-label="f.label">
                      <!-- A length (depth per pass, finish allowance): the field with its unit toggle, kept in mm. -->
                      <MmField
                        v-if="f.unit === 'mm'"
                        :key="`${f.key}-${refused}`"
                        plain
                        :model-value="t.settings[g.id]![f.key]"
                        :owner="t"
                        :field="`settings.${g.id}.${f.key}`"
                        :label="`${f.label}, ${g.name}`"
                        :optional="f.optional"
                        :placeholder-mm="f.key === 'finishAllowance' ? finishAllowance(t, g.id) : undefined"
                        :data-test="`bit-${t.id}-${g.id}-${f.key}`"
                        @update:model-value="setLength(t, g.id, f, $event)"
                      />
                      <input
                        v-else
                        type="number"
                        class="feed-input"
                        min="0"
                        :max="f.ofWidth ? 100 : undefined"
                        :step="f.ofWidth ? STEPOVER_STEP : 'any'"
                        :value="shown(t, g.id, f)"
                        :placeholder="f.key === 'finishAllowance' ? `${+finishAllowance(t, g.id).toFixed(2)}` : undefined"
                        :aria-label="`${f.label}, ${g.name}`"
                        :data-test="`bit-${t.id}-${g.id}-${f.key}`"
                        @change="setSetting(t, g.id, f, $event)"
                      />
                      <div v-if="f.ofWidth && t.settings[g.id]!.stepover" class="dial text-caption text-medium-emphasis">{{ +t.settings[g.id]!.stepover.toFixed(2) }} mm</div>
                      <div v-if="f.key === 'rpm'" class="dial text-caption text-medium-emphasis">dial {{ dial(t.settings[g.id]!.rpm) }}{{ rangeNote(t.settings[g.id]!.rpm) }}</div>
                    </td>
                    <td data-label="Chip load">
                      <input
                        type="number"
                        class="feed-input"
                        min="0"
                        step="any"
                        :value="chipOf(t, g.id)"
                        :disabled="!flutesOf(t.shape)"
                        :placeholder="flutesOf(t.shape) ? undefined : 'flutes?'"
                        :title="flutesOf(t.shape) ? 'Feed ÷ (RPM × flutes). Type a chip load to set the feed that gives it at this RPM.' : 'Enter the bit\'s flutes to see its chip load.'"
                        :aria-label="`Chip load, ${g.name}`"
                        :data-test="`bit-${t.id}-${g.id}-chip`"
                        @change="setChip(t, g.id, $event)"
                      />
                      <div
                        v-if="chipRange(t, g.id)"
                        class="dial text-caption"
                        :class="chipRange(t, g.id)!.check === 'low' || chipRange(t, g.id)!.check === 'high' ? 'text-warning' : 'text-medium-emphasis'"
                        :title="chipRange(t, g.id)!.title"
                        :data-test="`bit-${t.id}-${g.id}-chip-range`"
                      >
                        {{ chipRange(t, g.id)!.check === 'low' ? 'low: ' : chipRange(t, g.id)!.check === 'high' ? 'high: ' : '' }}{{ chipRange(t, g.id)!.words }}
                      </div>
                    </td>
                    <td class="drop"><v-btn :icon="mdiClose" variant="text" size="x-small" :aria-label="`Do not use it for ${g.name}`" :title="`Do not use it for ${g.name}`" @click="removeBitSettings(t, g.id)" /></td>
                  </template>
                  <td v-else :colspan="BIT_SETTING_FIELDS.length + 2" class="text-medium-emphasis">
                    Not used for {{ g.name }}.
                    <v-btn variant="text" color="primary" size="small" :data-test="`bit-${t.id}-copy-${g.id}`" @click="copyBitSettings(t, g.id, store.shop.materialGroups)">{{ copyWords(t) }}</v-btn>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-caption text-medium-emphasis mt-1">
              Feeds are kept in mm/min, as the G-code takes them; click a feed's unit to show every feed in mm/s, mm/min or in/min, and the
              chip load's to show it in mm or inches a tooth. The stepover is a share of the bit's width in steps of 5%, and keeps its share when
              the bit's width is changed. Chip load is what each flute takes at the full feed: feed ÷ (RPM ×
              flutes). Type one to set the feed that gives it at the row's RPM. Under it is the usual range for the bit in that material (a rule of
              thumb), in amber when the row is outside it. An empty finish allowance is 10% of the bit's width,
              left on walls for one full-depth finishing pass; 0 turns that pass off. A V-bit's stepover is 0.
            </div>
          </div>
        </div>
        <div v-if="tools.length === 0" class="text-body-2 text-medium-emphasis mb-1">None in the shop yet.</div>
        <v-btn variant="text" color="primary" size="small" :data-test="`add-bit-${type.kind}`" @click="add(type.kind)">Add {{ /^[aeiou]/i.test(type.singular) ? 'an' : 'a' }} {{ type.singular }}</v-btn>
      </div>
    </div>
    <div class="text-caption text-medium-emphasis mt-3">
      The kinds come with the app: one for each shape the G-code preview draws. A bit goes by its size and kind unless it is given
      a name of its own. Feeds and speeds are kept per material type (every type starts on MDF's, tune me). A new bit starts at
      a common size on the feeds of the nearest bit of its kind: type over what yours measures. Removing a bit a project's plan
      chose makes that plan pick another, and Plan says so.
    </div>
  </v-card>
</template>

<style scoped>
.bits-plain {
  overflow: visible;
  background: transparent;
}
/* As the material catalog: a kind is a line (click to open), its bits one row each. */
.kind {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.kind-head {
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
.kind-head .v-icon {
  align-self: center;
}
.kind-name {
  font-weight: 600;
  min-width: 11.5rem;
}
.kind-body {
  padding: 4px 0 14px 30px;
}
.bit {
  margin-bottom: 18px;
}
/* One row a bit: its kind's fields, its shank, its own name. */
.bit-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}
.bit-field {
  flex: 0 0 7.2rem;
}
.bit-field.wide {
  flex-basis: 10.5rem;
}
.bit-field.cut {
  flex-basis: 7rem;
}
.bit-field.narrow {
  flex-basis: 4.5rem;
}
.feeds-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 2px 0 0 -4px;
  padding: 2px 0;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}
.feeds-head .v-icon {
  align-self: flex-start;
  margin-top: 2px;
}
.feeds-title {
  white-space: nowrap;
}
.feeds-head .v-chip {
  flex: none;
}
.feeds {
  margin: 4px 0 0 18px;
  overflow-x: auto;
}
.feeds-table {
  border-collapse: collapse;
  font-size: 0.875rem;
}
.feeds-table th {
  padding: 2px 3px 4px;
  font-weight: 500;
  text-align: left;
  vertical-align: bottom;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.feeds-table th .unit {
  display: block;
  font-size: 0.7rem;
  font-weight: 400;
  min-height: 1em;
}
.feeds-table td {
  padding: 3px 3px;
  vertical-align: top;
}
.feeds-table td.material {
  padding-top: 8px;
  white-space: nowrap;
}
.feed-input {
  width: 4.6rem;
  padding: 4px 5px;
  color: inherit;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 4px;
  font: inherit;
}
.feed-input:focus {
  outline: none;
  border-color: rgb(var(--v-theme-primary));
}
.dial {
  white-space: nowrap;
}
.feeds-machine {
  max-width: 22rem;
}
.feeds-units {
  display: none;
}
/*
 * A phone: a material's row of feeds is a card, each value on a line of its own
 * with its name before it, in place of a table that ran off the side.
 */
@media (max-width: 600px) {
  .feeds {
    margin-left: 0;
  }
  .feeds-units {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .feeds-table {
    width: 100%;
  }
  .feeds-table thead {
    display: none;
  }
  .feeds-table tbody tr {
    display: block;
    position: relative;
    padding: 8px 10px;
    margin-bottom: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
    border-radius: 8px;
  }
  .feeds-table td {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    padding: 3px 0;
  }
  .feeds-table td.material {
    padding-top: 0;
    font-weight: 600;
  }
  .feeds-table td[data-label]::before {
    content: attr(data-label);
    flex: 0 0 7.5rem;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  .feeds-table td.drop {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 0;
  }
}
.bit-name {
  flex: 1 1 7rem;
  min-width: 7rem;
}
</style>
