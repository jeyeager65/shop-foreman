<script setup lang="ts">
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import { mark } from '@/components/presetMarks';
import FrontPatternFields from '@/components/FrontPatternFields.vue';
import MaterialSelect from '@/components/MaterialSelect.vue';
/**
 * The style of a one-piece front: shaker or slab, its outside edge and material.
 * Shared by the doors and the drawer front; it edits the front it is given in place.
 * Fields only: the panel they sit in is the caller's.
 */
import { computed } from 'vue';
import LengthField from '@/components/LengthField.vue';
import type { DoorStyle, DrawerFrontDesign, EdgeTreatment } from '@/model';
import { doorStyleTile, insideEdgeTile, outsideEdgeTile } from '@/design/tileDrawings';
import { len } from '@/units';

const props = defineProps<{
  front: DrawerFrontDesign;
  /** Setup asks the style and the material up top (`main`) and keeps the rest in its details (`details`). Left out: all of it. */
  part?: 'main' | 'details';
  /** Setup: the pattern has a place of its own, and is left out here. */
  noPattern?: boolean;
  /** Setup: the path these values are under, for the marks on what differs from the preset (`presetMarks.ts`). */
  marks?: string;
  /** An inset drawer's wide front: its material is stored under another name (`frontMaterialId`), and is called the front's. */
  materialKey?: string;
  materialLabel?: string;
}>();
const main = computed(() => props.part !== 'details');
const details = computed(() => props.part !== 'main');
const front = computed(() => props.front);

const styleKind = computed({
  get: () => front.value.style.kind,
  set: (kind: DoorStyle['kind']) => {
    // Its pattern goes with it, but the frame look, which is a slab's.
    const pattern = front.value.style.pattern;
    const kept = pattern && !(kind === 'shaker' && pattern.kind === 'frame') ? { pattern } : {};
    front.value.style =
      kind === 'slab'
        ? { kind: 'slab', ...kept }
        : { kind: 'shaker', frameWidth: len('2-1/4"'), recessDepth: len('1/4"'), insideEdge: { kind: 'vBevel', angleDeg: 60 }, floorCornerRadius: len('1/16"'), ...kept };
  },
});
const STYLE_TILES: { value: DoorStyle['kind']; title: string; note: string }[] = [
  { value: 'shaker', title: 'Shaker', note: 'One piece: a frame round a recessed panel' },
  { value: 'slab', title: 'Slab', note: 'A flat face' },
];
const styleTiles = STYLE_TILES.map((s) => ({ ...s, drawing: doorStyleTile(s.value) }));
const INSIDE_EDGES = ([
  { value: 'vBevel', title: '60\u00b0 V bevel' },
  { value: 'square', title: 'Square step' },
] as const).map((e) => ({ ...e, drawing: insideEdgeTile(e.value) }));
const OUTSIDE_EDGES = ([
  { value: 'roundover', title: 'Roundover' },
  { value: 'chamfer', title: 'Chamfer' },
  { value: 'square', title: 'Square' },
] as const).map((e) => ({ ...e, drawing: outsideEdgeTile(e.value) }));
const shaker = computed(() => (front.value.style.kind === 'shaker' ? front.value.style : null));
const insideEdge = computed({
  get: () => shaker.value?.insideEdge.kind ?? 'square',
  set: (kind: 'square' | 'vBevel') => {
    if (shaker.value) shaker.value.insideEdge = kind === 'square' ? { kind: 'square' } : { kind: 'vBevel', angleDeg: 60 };
  },
});
const edgeKind = computed({
  get: () => front.value.outsideEdge.kind,
  set: (kind: EdgeTreatment['kind']) => {
    const size = edgeSize.value ?? len('1/8"');
    front.value.outsideEdge = kind === 'square' ? { kind } : kind === 'roundover' ? { kind, radius: size } : { kind, size };
  },
});
const edgeSize = computed({
  get: () => {
    const e = front.value.outsideEdge;
    return e.kind === 'roundover' ? e.radius : e.kind === 'chamfer' ? e.size : null;
  },
  set: (value) => {
    const e = front.value.outsideEdge;
    if (!value) return;
    if (e.kind === 'roundover') e.radius = value;
    else if (e.kind === 'chamfer') e.size = value;
  },
});
</script>

<template>
  <v-row density="compact">
      <v-col v-if="main" cols="12" :class="mark(marks, 'style.kind')">
        <ChoiceTiles v-model="styleKind" :items="styleTiles" label="Style" name="front-style" />
      </v-col>
      <template v-if="shaker && details">
        <v-col cols="6" :class="mark(marks, 'style.frameWidth')"><LengthField v-model="shaker.frameWidth" label="Frame width" /></v-col>
        <v-col cols="6" :class="mark(marks, 'style.recessDepth')"><LengthField v-model="shaker.recessDepth" label="Recess" /></v-col>
        <v-col cols="6" :class="mark(marks, 'style.floorCornerRadius')"><LengthField v-model="shaker.floorCornerRadius" label="Inside corner radius" /></v-col>
        <v-col cols="12" :class="mark(marks, 'style.insideEdge')">
          <div class="text-caption text-medium-emphasis mb-1">Inside edge</div>
          <ChoiceTiles v-model="insideEdge" :items="INSIDE_EDGES" label="Inside edge" size="small" name="inside-edge" />
        </v-col>
      </template>
      <v-col v-if="details" cols="12" :class="mark(marks, 'outsideEdge.kind')">
        <div class="text-caption text-medium-emphasis mb-1">Outside edge</div>
        <ChoiceTiles v-model="edgeKind" :items="OUTSIDE_EDGES" label="Outside edge" size="small" name="outside-edge" />
      </v-col>
      <v-col v-if="details" cols="6" :class="mark(marks, 'outsideEdge.radius', 'outsideEdge.size')"><LengthField v-if="edgeSize" v-model="edgeSize" label="Edge size" /></v-col>
      <v-col v-if="details && !noPattern" cols="12" :class="mark(marks, 'style.pattern')"><FrontPatternFields :front-style="front.style" /></v-col>
      <v-col v-if="main" cols="12" :class="mark(marks, materialKey ?? 'materialId')"><MaterialSelect v-model="front.materialId" cnc use="fronts" :label="materialLabel ?? 'Material'" /></v-col>
  </v-row>
</template>
