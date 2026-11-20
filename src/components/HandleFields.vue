<script setup lang="ts">
/**
 * The handle on a door set or a drawer: a knob or a pull from the hardware library and
 * where it goes on the front. It edits the design's `handle`; "None" removes it.
 */
import { computed } from 'vue';
import HelpText from '@/components/HelpText.vue';
import LengthField from '@/components/LengthField.vue';
import { addMaterialFromCatalog, doorHandleChoice, frontBorder, isHandle } from '@/design';
import type { DoorSetDesign, DrawerDesign, Length } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{ design: DoorSetDesign | DrawerDesign; /** A wall cabinet's doors: the handle is near the door's bottom. */ end?: 'top' | 'bottom' }>();
const store = useAppStore();
const L = computed(() => store.sizeLength);
const NONE = '';
const handles = computed(() => store.shop.hardware.filter(isHandle));
const items = computed(() => [{ title: 'None (fitted by hand, nothing cut)', value: NONE }, ...handles.value.map((h) => ({ title: h.name, value: h.id }))]);
const doors = computed(() => (props.design.template === 'doorSet' ? props.design : undefined));
const drawer = computed(() => (props.design.template === 'drawer' ? props.design : undefined));
const chosen = computed(() => handles.value.find((h) => h.id === props.design.handle?.handleId));

const handleId = computed({
  get: () => props.design.handle?.handleId ?? NONE,
  set: (id: string) => {
    // A wooden handle is cut from its own stock: the project gains it from the catalog.
    const wooden = handles.value.find((h) => h.id === id)?.cnc;
    if (wooden && store.project) addMaterialFromCatalog(store.project, store.shop.materialCatalog, wooden.materialId);
    if (id === NONE) delete props.design.handle;
    else if (props.design.handle) props.design.handle.handleId = id;
    else if (doors.value) doors.value.handle = doorHandleChoice(id);
    else drawer.value!.handle = { handleId: id };
  },
});
/** The front's border (a pattern's margin, a shaker's frame): with one, the handle may go in the middle of it. */
const border = computed(() => frontBorder(doors.value ? doors.value.style : drawer.value!.front.style));
const inMargin = computed({
  get: () => !!props.design.handle?.inMargin,
  set: (on: boolean) => {
    const handle = props.design.handle;
    if (!handle) return;
    if (on) handle.inMargin = true;
    else delete handle.inMargin;
  },
});
/** Two knobs on a wide drawer. */
const two = computed({
  get: () => !!drawer.value?.handle?.two,
  set: (on: boolean) => {
    const handle = drawer.value?.handle;
    if (!handle) return;
    if (on) handle.two = true;
    else delete handle.two;
  },
});
const fromEdge = computed({
  get: (): Length | null => doors.value?.handle?.fromEdge ?? null,
  set: (value: Length | null) => {
    const handle = doors.value?.handle;
    if (!handle) return;
    if (value) handle.fromEdge = value;
    else delete handle.fromEdge;
  },
});
const fromTop = computed({
  get: (): Length | null => drawer.value?.handle?.fromTop ?? null,
  set: (value: Length | null) => {
    const handle = drawer.value?.handle;
    if (!handle) return;
    if (value) handle.fromTop = value;
    else delete handle.fromTop;
  },
});
</script>

<template>
  <v-row density="compact">
    <v-col cols="12"><v-select v-model="handleId" :label="doors ? 'Handles' : 'Handle'" :items="items" hide-details data-test="handle" /></v-col>
    <template v-if="doors?.handle">
      <v-col v-if="!chosen?.routed || chosen.routed.shape === 'hole'" cols="6">
        <LengthField v-model="fromEdge" label="In from the opening edge" optional :disabled="inMargin && !!border" hint="Empty: the middle of a shaker door's stile; 1-1/2&quot; on a slab" persistent-hint data-test="handle-from-edge" />
      </v-col>
      <v-col cols="6"><LengthField v-model="doors.handle.fromEnd" :label="end === 'bottom' ? 'Up from the bottom' : 'Down from the top'" tune-me data-test="handle-from-end" /></v-col>
    </template>
    <v-col v-else-if="drawer?.handle && (!chosen?.routed || chosen.routed.shape === 'hole')" cols="6"><LengthField v-model="fromTop" label="Down from the top" optional :disabled="inMargin && !!border" hint="Empty: half-way up" persistent-hint data-test="handle-from-top" /></v-col>
    <v-col v-if="design.handle && border && (!chosen?.routed || chosen.routed.shape === 'hole')" cols="12">
      <v-switch v-model="inMargin" :label="`In the middle of the border (${L(border / 2)} ${doors ? 'in from the opening edge' : 'down from the top'})`" color="primary" density="compact" hide-details data-test="handle-in-margin" />
    </v-col>
    <v-col v-if="drawer?.handle && chosen?.holes === 1" cols="12">
      <v-switch v-model="two" label="Two knobs where the drawer is 24&quot; wide or more" color="primary" density="compact" hide-details data-test="handle-two" />
    </v-col>
  </v-row>
  <HelpText v-if="chosen?.routed">
    <template v-if="chosen.routed.shape === 'hole'">
      A {{ L(chosen.routed.width) }} finger hole through {{ doors ? 'each door, near the edge it opens at' : 'the front, centred across it' }}: nothing is fitted.
      {{ doors ? 'It is bored from the back with the hinge cups.' : '' }}
    </template>
    <template v-else>
      A {{ chosen.routed.shape === 'scoop' ? 'half-round' : 'square' }} notch {{ L(chosen.routed.width) }} long and {{ L(chosen.routed.depth) }} deep in
      {{ doors ? 'the edge each door opens at' : 'the middle of the front\'s top edge' }}, cut with the outline: nothing is fitted.
      <template v-if="doors">A pair's two notches meet as one opening.</template>
      <template v-if="chosen.routed.shape === 'notch'">The bit leaves its radius in the notch's corners.</template>
    </template>
    It shows what is behind it, and is not for a front that must seal. Ease its edges by hand. Its sizes are in the shop profile.
  </HelpText>
  <HelpText v-else-if="chosen">
    <template v-if="chosen.holes === 2">Two {{ chosen.hole.diameter }} mm holes {{ L(chosen.spacing) }} apart, </template>
    <template v-else>One {{ chosen.hole.diameter }} mm hole, </template>
    <template v-if="doors">
      through each door on a line in from the edge it opens at, the {{ chosen.holes === 2 ? 'nearer one ' : '' }}measured from the door's
      {{ end === 'bottom' ? 'bottom' : 'top' }}. The CNC bores {{ chosen.holes === 2 ? 'them' : 'it' }} from the back with the hinge cups, so the doors are not flipped
      for {{ chosen.holes === 2 ? 'them' : 'it' }}.
    </template>
    <template v-else>
      through the front, centred across it. The CNC drills {{ chosen.holes === 2 ? 'them' : 'it' }} with the front's other work; behind an applied front, drill on
      through the box by hand once the front is on.
    </template>
    <template v-if="chosen.printed">
      This handle is 3D printed: Make has the file, with one for every front. Its screws go into
      {{ chosen.printed.fastening === 'heatSetInsert' ? `${chosen.printed.screw} heat-set inserts melted into its feet` : `the plastic of its feet (${chosen.printed.screw})` }}; its sizes are
      in the shop profile.
    </template>
    <template v-if="chosen.cnc">
      This handle is cut out of wood on the CNC with the job, one for every front: it is in the parts list. Its pilot holes are drilled and
      its edges rounded by hand; its sizes and its material are in the shop profile.
    </template>
    A finger pull, where one is chosen, takes the handle's place.
  </HelpText>
</template>
