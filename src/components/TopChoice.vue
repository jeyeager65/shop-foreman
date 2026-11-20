<script setup lang="ts">
/**
 * The one "Top" choice, wherever a top is: on a run, on a cabinet on its own and on
 * an island. None, as Setup makes them, or its own kind with the values that differ (`TopDesign.settings`); a
 * piece on its own may instead have a top laid on it, over every side (`TopDesign.own`). A torsion top may have
 * its size typed. It sets, changes and takes away `owner.top`.
 */
import { computed } from 'vue';
import LengthField from '@/components/LengthField.vue';
import MaterialSelect from '@/components/MaterialSelect.vue';
import TorsionFields from '@/components/TorsionFields.vue';
import { LEAF, SEATING, TORSION_STARTS, TORSION_TAKES_NO, type TopPiece, seatingBrackets, seatingEdgeClosed, seatingEdgeLength, seatingStools, addMaterialFromCatalog, dropLeafSupportWords, leafEdgeClosed, leafEdgeWords, materialTitle, newOwnTop, topSettingsFor, topSettingsOf, torsionMaterialIds, torsionSettingsOf, torsionStartOf } from '@/design';
import { SOLID_WOOD_3_4_ID } from '@/libraries';
import type { DesignedCabinetContext, LeafEdge, Length, TopDesign, TopSettings } from '@/model';
import { len } from '@/units';
import { useAppStore } from '@/stores/app';

const props = defineProps<{
  /** What the top is on: a run, a stored cabinet or an island. */
  owner: { top?: TopDesign };
  label: string;
  /** A piece on its own may have a top laid on it, over every side; a tall one has only that. */
  laid?: 'offered' | 'only';
  /** The top as it is cut: what its typed size starts from, and what its leaf says. */
  piece?: TopPiece;
  /** What is wrong with this top as it is cut (`topWarnings`). */
  warnings?: string[];
  /** Names the select and the fields for scripts. */
  name: string;
}>();
const store = useAppStore();
const L = computed(() => store.sizeLength);
const context = computed(() => store.project!.context as DesignedCabinetContext);
const setup = computed(() => topSettingsOf(context.value));
const top = computed(() => props.owner.top);
/** What this top is made by: Setup's values with its own in their place. */
const resolved = computed(() => (top.value && !top.value.own ? topSettingsFor(setup.value, top.value) : undefined));
const materialName = (id: string) => {
  const m = store.materials.find((x) => x.id === id);
  return m ? materialTitle(m, L.value) : id;
};
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A kind of top in a few words, as these settings make it. */
function words(t: TopSettings): string {
  if (t.kind === 'bought') return 'a bought laminate top';
  if (t.kind === 'measured') return 'measured for a bought top';
  if (t.kind === 'torsion') {
    const box = torsionSettingsOf(t);
    const start = TORSION_STARTS.find((x) => x.value === torsionStartOf(box));
    return `a torsion box${start ? `, the ${start.title}` : ''}, ${materialName(box.skins.topId)} skins`;
  }
  return `${materialName(t.materialId)}${t.layers === 2 ? ', two layers' : ''}${t.backsplash.on ? `, a ${L.value(t.backsplash.height.mm)} backsplash` : ''}`;
}

const OWN = 'own:';
const KINDS: { title: string; value: TopSettings['kind'] }[] = [
  { title: 'made here from a sheet or a slab', value: 'made' },
  { title: 'bought laminate', value: 'bought' },
  { title: 'measured for a bought top (stone)', value: 'measured' },
  { title: 'a torsion box', value: 'torsion' },
];
const items = computed(() => [
  { title: 'None', value: '' },
  ...(props.laid === 'only' ? [] : [{ title: `As Setup makes them (${words(setup.value)})`, value: 'setup' }]),
  ...(props.laid ? [{ title: 'Its own: laid on, over every side', value: 'laid' }] : []),
  ...(props.laid === 'only' ? [] : KINDS.map((k) => ({ title: `Its own: ${k.title}`, value: `${OWN}${k.value}` }))),
]);
const choice = computed(() => (!top.value ? '' : top.value.own ? 'laid' : top.value.settings?.kind ? `${OWN}${top.value.settings.kind}` : 'setup'));

/** A top's own values of a kind, to start from: Setup's, copied. */
function startOf(kind: TopSettings['kind']): Partial<TopSettings> {
  const s = setup.value;
  if (kind === 'made') return { kind, materialId: s.materialId, layers: s.layers, edge: copy(s.edge), backsplash: copy(s.backsplash) };
  if (kind === 'bought') return { kind, ...(s.boughtTopId ?? boughtTops.value[0]?.value ? { boughtTopId: s.boughtTopId ?? boughtTops.value[0]!.value } : {}) };
  if (kind === 'torsion') return { kind, torsion: copy(torsionSettingsOf(s)) };
  return { kind };
}
/** What the top is made of comes into the project from the catalog. */
function needMaterials() {
  const t = props.owner.top;
  if (!t || !store.project) return;
  const made = t.own ? { kind: 'made' as const, materialId: t.own.materialId ?? setup.value.materialId, strip: t.own.edge.kind === 'strip' } : undefined;
  const s = topSettingsFor(setup.value, t);
  const ids = made ? [made.materialId, ...(made.strip ? [SOLID_WOOD_3_4_ID] : [])] : s.kind === 'made' ? [s.materialId, ...(s.edge.kind === 'strip' ? [SOLID_WOOD_3_4_ID] : [])] : s.kind === 'torsion' ? torsionMaterialIds(torsionSettingsOf(s)) : [];
  for (const id of ids) addMaterialFromCatalog(store.project, store.shop.materialCatalog, id);
}
function choose(value: string) {
  const owner = props.owner;
  if (!value) return void delete owner.top;
  // What the top keeps whatever it is made by: its corner joint and its leaf; a torsion top's typed size, while it stays one.
  const kept: TopDesign = owner.top?.cornerJoint ? { cornerJoint: owner.top.cornerJoint } : {};
  const next: TopDesign = value === 'laid' ? { own: newOwnTop(context.value) } : value.startsWith(OWN) ? { ...kept, settings: startOf(value.slice(OWN.length) as TopSettings['kind']) } : kept;
  if (!next.own && topSettingsFor(setup.value, next).kind === 'torsion') {
    if (owner.top?.size) next.size = owner.top.size;
  }
  if (!next.own && owner.top?.leaf) next.leaf = owner.top.leaf;
  if (!next.own && owner.top?.seating) next.seating = owner.top.seating;
  owner.top = next;
  needMaterials();
}

/** Its own values, by kind. */
const own = computed(() => top.value?.settings);
const ownMade = computed(() => (own.value?.kind === 'made' && own.value.edge && own.value.backsplash ? (own.value as TopSettings) : undefined));
const EDGES = [
  { title: 'A solid wood strip', value: 'strip' },
  { title: 'Edge banding', value: 'banding' },
  { title: 'Left as it is', value: 'none' },
];
const boughtTops = computed(() => store.shop.hardware.filter((h) => h.kind === 'boughtTop').map((h) => ({ title: h.name, value: h.id })));

/** A torsion top's typed size: typing one starts the other from the size it is now. */
function setSize(key: 'length' | 'width', value: Length | null) {
  const t = props.owner.top;
  if (!t) return;
  if (!value) return void delete t.size;
  const p = props.piece;
  const now = { length: { mm: p ? p.x1 - p.x0 : value.mm, unit: 'in' as const }, width: { mm: p ? p.zFront - p.zBack : value.mm, unit: 'in' as const } };
  t.size = { ...(t.size ?? now), [key]: value };
}
/**
 * A leaf that folds down: on one of the top's edges that is open. An edge that is not is listed with why,
 * and cannot be chosen.
 */
const LEAF_EDGES: { edge: LeafEdge; title: string }[] = [
  { edge: 'back', title: 'At the back' },
  { edge: 'left', title: 'At the left end' },
  { edge: 'right', title: 'At the right end' },
];
const leafOffered = computed(() => resolved.value?.kind === 'torsion' || (resolved.value?.kind === 'made' && resolved.value.layers === 1) || !!top.value?.leaf);
const leafItems = computed(() => [
  { title: 'None', value: '' },
  ...LEAF_EDGES.map(({ edge, title }) => {
    const closed = props.piece && store.project ? leafEdgeClosed(store.project, props.piece, edge) : undefined;
    // (The edge it is on stays in the list, so that it can be read.)
    return { title, value: edge as string, props: closed && top.value?.leaf?.edge !== edge ? { disabled: true, subtitle: closed } : closed ? { subtitle: closed } : {} };
  }),
]);
function setLeafEdge(edge: string) {
  const t = props.owner.top;
  if (!t) return;
  if (edge === 'back' || edge === 'left' || edge === 'right') t.leaf = { edge, length: t.leaf?.length ?? len('12"') };
  else delete t.leaf;
}
function setLeafLength(value: Length | null) {
  const t = props.owner.top;
  if (t?.leaf && value && value.mm > 0) t.leaf.length = value;
}
/**
 * A side for stools: on an island's or a peninsula's top, one open edge reaches further past
 * the cabinets. An edge that cannot is listed with why.
 */
const seatingOffered = computed(() => (!!props.piece?.island && !props.piece.own && resolved.value?.kind !== 'torsion') || !!top.value?.seating);
const seatingItems = computed(() => [
  { title: 'None', value: '' },
  ...LEAF_EDGES.map(({ edge, title }) => {
    const closed = props.piece && store.project ? seatingEdgeClosed(store.project, props.piece, edge) : undefined;
    return { title, value: edge as string, props: closed && top.value?.seating?.edge !== edge ? { disabled: true, subtitle: closed } : closed ? { subtitle: closed } : {} };
  }),
]);
function setSeatingEdge(edge: string) {
  const t = props.owner.top;
  if (!t) return;
  if (edge === 'back' || edge === 'left' || edge === 'right') t.seating = { edge, overhang: t.seating?.overhang ?? { mm: SEATING.start, unit: 'in' } };
  else delete t.seating;
}
function setSeatingOverhang(value: Length | null) {
  const t = props.owner.top;
  if (t?.seating && value && value.mm > 0) t.seating.overhang = value;
}
const seatingLine = computed(() => {
  const p = props.piece;
  if (!p?.seating) return '';
  const [brackets, stools] = [seatingBrackets(p), seatingStools(p)];
  return `The top reaches ${L.value(p.seating.overhang)} past the cabinets at the ${leafEdgeWords(p.seating.edge)}: room for ${stools} ${stools === 1 ? 'stool' : 'stools'} along its ${L.value(seatingEdgeLength(p))}. ${L.value(SEATING.comfortable)} is comfortable at a counter's height. ${brackets ? `It rests on ${brackets} bought brackets.` : 'This far it needs no bracket.'}`;
});
/** What the leaf is, once the piece has it: how much folds down and how much stays. */
const leafLine = computed(() => {
  const p = props.piece;
  if (!p?.leaf) return '';
  const whole = p.leaf.edge === 'back' ? p.zFront - p.zBack : p.x1 - p.x0;
  const joint = p.leaf.edge === 'back' ? p.x1 - p.x0 : p.zFront - p.zBack;
  // A torsion leaf is a box of its own on legs, lined up by pins; a slab's is a panel on brackets or legs.
  const how = p.torsion
    ? ` The two ribs that meet get ${LEAF.pin.count} matching holes for alignment pins, drilled on the CNC.`
    : ` It is a panel of its own, square at the joint, and rests on ${dropLeafSupportWords(p.leaf.length, joint)}.`;
  return `${L.value(p.leaf.length)} at the ${leafEdgeWords(p.leaf.edge)} folds down on ${p.torsion ? 'a hinge' : 'hinges'} under the joint; ${L.value(whole - p.leaf.length)} stays.${how}`;
});
</script>

<template>
  <div :data-test="`${name}-choice`">
    <v-select :model-value="choice" :label="label" :items="items" hide-details :data-test="name" @update:model-value="choose($event)" />
    <template v-if="top && resolved">
      <!-- Its own values, by its kind. -->
      <v-row v-if="ownMade" density="compact" class="mt-2" :data-test="`${name}-made`">
        <v-col cols="8"><MaterialSelect v-model="ownMade.materialId" label="Top material" use="tops" hide-details /></v-col>
        <v-col cols="4"><v-select v-model="ownMade.layers" label="Layers" :items="[1, 2]" hide-details /></v-col>
        <v-col cols="6"><v-select v-model="ownMade.edge.kind" label="Front and open ends" :items="EDGES" hide-details @update:model-value="needMaterials" /></v-col>
        <v-col v-if="ownMade.edge.kind === 'strip'" cols="6"><LengthField v-model="ownMade.edge.thickness" label="Strip thickness" /></v-col>
        <v-col cols="6"><v-switch v-model="ownMade.backsplash.on" label="Backsplash" color="primary" density="compact" hide-details /></v-col>
        <v-col v-if="ownMade.backsplash.on" cols="6"><LengthField v-model="ownMade.backsplash.height" label="Backsplash height" /></v-col>
      </v-row>
      <v-select v-if="own?.kind === 'bought'" v-model="own.boughtTopId" label="Laminate top" :items="boughtTops" hide-details class="mt-2" :data-test="`${name}-bought`" />
      <TorsionFields v-if="own?.kind === 'torsion' && own.torsion" :box="own.torsion" :sized="!!top.size" class="mt-2" />
      <!-- A torsion top, Setup's or its own: its size may be typed. -->
      <template v-if="resolved.kind === 'torsion'">
        <v-row density="compact" class="mt-1" :data-test="`${name}-size`">
          <v-col cols="6"><LengthField :model-value="top.size?.length ?? null" label="Length (empty: to fit)" optional @update:model-value="setSize('length', $event)" /></v-col>
          <v-col cols="6"><LengthField :model-value="top.size?.width ?? null" label="Width" optional @update:model-value="setSize('width', $event)" /></v-col>
        </v-row>
        <div v-if="top.size" class="text-caption text-medium-emphasis">A typed size is centred on what is under it, which stands where it is put. A leaf is beyond it.</div>
        <div v-if="!own?.kind" class="text-caption text-medium-emphasis mt-1">The box is Setup's ({{ words(resolved) }}). {{ TORSION_TAKES_NO }}</div>
      </template>
      <div v-else-if="!own?.kind" class="text-caption text-medium-emphasis mt-1" :data-test="`${name}-words`">How it is made is Setup's ({{ words(resolved) }}).</div>
      <div v-else class="text-caption text-medium-emphasis mt-1" :data-test="`${name}-words`">This one top only: {{ words(resolved) }}. The rest are as Setup makes them.</div>
    </template>
    <!-- A leaf on an open edge: of a torsion top, or of a slab of one layer. -->
    <template v-if="top && resolved">
      <template v-if="leafOffered">
        <v-row density="compact" class="mt-1" :data-test="`${name}-leaf`">
          <v-col :cols="top.leaf ? 7 : 12"><v-select :model-value="top.leaf?.edge ?? ''" label="A leaf that folds down" :items="leafItems" hide-details data-test="leaf-edge" @update:model-value="setLeafEdge($event)" /></v-col>
          <v-col v-if="top.leaf" cols="5"><LengthField :model-value="top.leaf.length" label="How far it reaches" data-test="torsion-leaf" @update:model-value="setLeafLength($event)" /></v-col>
        </v-row>
        <div v-if="leafLine" class="text-caption text-medium-emphasis" data-test="torsion-leaf-line">{{ leafLine }}</div>
      </template>
    </template>
    <!-- A side for stools: on an island's or a peninsula's top. -->
    <template v-if="top && seatingOffered">
      <v-row density="compact" class="mt-1" :data-test="`${name}-seating`">
        <v-col :cols="top.seating ? 7 : 12"><v-select :model-value="top.seating?.edge ?? ''" label="A side for stools" :items="seatingItems" hide-details data-test="seating-edge" @update:model-value="setSeatingEdge($event)" /></v-col>
        <v-col v-if="top.seating" cols="5"><LengthField :model-value="top.seating.overhang" label="Past the cabinets" data-test="seating-overhang" @update:model-value="setSeatingOverhang($event)" /></v-col>
      </v-row>
      <div v-if="seatingLine" class="text-caption text-medium-emphasis" data-test="seating-line">{{ seatingLine }}</div>
    </template>
    <v-alert v-for="w in warnings ?? []" :key="w" type="warning" variant="tonal" density="compact" class="mt-1" :data-test="`${name}-warning`">{{ w }}</v-alert>
  </div>
</template>
