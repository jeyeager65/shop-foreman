<script setup lang="ts">
/**
 * A leaf on a top of a piece's own, or on a table's top: which edge it hangs from
 * and how far it reaches. An edge that is not open is listed with why, and cannot be chosen. It edits `top` in place.
 */
import { computed } from 'vue';
import LengthField from '@/components/LengthField.vue';
import type { LeafEdge, Length, OwnTop } from '@/model';
import { len } from '@/units';

const props = defineProps<{
  top: OwnTop;
  /** Whether the top is a torsion box though it does not say so itself: a table's that follows Setup's. */
  box?: boolean;
  /** Why an edge takes no leaf, for each that does not. */
  closed?: Partial<Record<LeafEdge, string>>;
  /** What each edge is called here: a table's back is its far side. */
  titles?: Partial<Record<LeafEdge, string>>;
  /** Whether a second leaf on the opposite edge is offered: on a table, whose front is open (a classic drop-leaf table). */
  pair?: boolean;
  /** What the leaf is, once it is made, in a line. */
  line?: string;
}>();
const EDGES: { edge: LeafEdge; title: string }[] = [
  { edge: 'back', title: 'At the back' },
  { edge: 'left', title: 'At the left end' },
  { edge: 'right', title: 'At the right end' },
];
const items = computed(() => [
  { title: 'None', value: '' },
  ...EDGES.map(({ edge, title }) => {
    const why = props.closed?.[edge];
    // (The edge it is on stays in the list, so that it can be read.)
    return { title: props.titles?.[edge] ?? title, value: edge as string, props: why && props.top.leaf?.edge !== edge ? { disabled: true, subtitle: why } : why ? { subtitle: why } : {} };
  }),
  // Two leaves, on opposite edges: a slab's only.
  ...(props.pair
    ? [
        { title: 'Along the front and the back', value: 'back+' },
        { title: 'At both ends', value: 'left+' },
      ].map((item) => ({ ...item, props: props.top.torsion || props.box ? { disabled: true, subtitle: 'A torsion box takes one leaf.' } : {} }))
    : []),
]);
/** What the list shows: the edge, with a `+` for a leaf on the opposite edge too. */
const chosen = computed(() => {
  const leaf = props.top.leaf;
  if (!leaf) return '';
  return leaf.both ? (leaf.edge === 'back' ? 'back+' : 'left+') : leaf.edge;
});
function setEdge(value: string) {
  const both = value.endsWith('+');
  const edge = both ? value.slice(0, -1) : value;
  if (edge === 'back' || edge === 'left' || edge === 'right') props.top.leaf = { edge, length: props.top.leaf?.length ?? len('10"'), ...(both ? { both: true } : {}) };
  else delete props.top.leaf;
}
function setLength(value: Length | null) {
  if (props.top.leaf && value && value.mm > 0) props.top.leaf.length = value;
}
</script>

<template>
  <div data-test="own-top-leaf">
    <v-row density="compact">
      <v-col :cols="top.leaf ? 7 : 12"><v-select :model-value="chosen" label="A leaf that folds down" :items="items" hide-details data-test="leaf-edge" @update:model-value="setEdge($event)" /></v-col>
      <v-col v-if="top.leaf" cols="5"><LengthField :model-value="top.leaf.length" label="How far it reaches" data-test="leaf-length" @update:model-value="setLength($event)" /></v-col>
    </v-row>
    <div v-if="line" class="text-caption text-medium-emphasis" data-test="leaf-line">{{ line }}</div>
  </div>
</template>
