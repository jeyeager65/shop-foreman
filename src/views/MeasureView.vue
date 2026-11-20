<script setup lang="ts">
/**
 * Measure: the measurements of a cabinet that is already there, one to a card, each
 * under a picture of what to measure. One narrow column, made for a phone held at the cabinet. Everything
 * here is the cabinet's `existing` (`ExistingCase`); Design shows the same numbers without the pictures.
 * `#/measure?cabinet=2` opens on the project's second cabinet.
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LengthField from '@/components/LengthField.vue';
import MeasureDiagram, { type MeasureWhat } from '@/components/MeasureDiagram.vue';
import PageHeader from '@/components/PageHeader.vue';
import { cabinetsOf, existingProblems, measuredInside, takesExisting } from '@/design';
import type { ExistingCase, Length } from '@/model';
import { EXISTING_DRAWERS_MAX, addCabinet, addWallCabinet, makeExisting, setExistingOpenings } from '@/samples/cabinet';
import { useAppStore } from '@/stores/app';
import { len } from '@/units';
import { storedCases } from '@/design/settings';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const L = computed(() => store.sizeLength);

const cabinets = computed(() => (store.project ? cabinetsOf(store.project) : []));
/** The cabinet being measured: the one asked for, else the first that is already there. */
const index = computed(() => {
  const asked = Math.floor(Number(route.query.cabinet)) - 1;
  if (asked >= 0 && asked < cabinets.value.length) return asked;
  const first = cabinets.value.findIndex((c) => c.existing);
  return first < 0 ? 0 : first;
});
const cabinet = computed(() => cabinets.value[index.value]);
const existing = computed(() => cabinet.value?.existing);
const wall = computed(() => cabinet.value?.form === 'wall');
const go = (i: number) => void router.replace({ query: { cabinet: String(i + 1) } });

/** A cabinet made here becomes one that is already there, measured as it stands until the numbers are typed. */
function makeThere() {
  if (store.project && cabinet.value) makeExisting(store.project, cabinet.value.id);
}
/** One more cabinet that is already there, like the vanity: a base cabinet with doors, to be measured. */
function addThere(form: 'base' | 'wall' = 'base') {
  if (!store.project) return;
  const name = `${form === 'wall' ? 'Wall cabinet' : 'Cabinet'} ${cabinets.value.length + 1}`;
  const added = form === 'wall' ? addWallCabinet(store.project, { name }) : addCabinet(store.project, { name, width: len('24"'), layout: 'doors' });
  // A wall cabinet that is already there is here for new doors: nothing is fitted inside it.
  makeExisting(store.project, added.id, form === 'wall' ? 'new' : 'kept');
  if (form === 'wall') delete storedCases(store.project.context).find((c) => c.id === added.id)!.existing!.inside;
  go(cabinets.value.length - 1);
}

const FRAMES = [
  { title: 'With a face frame', value: 'faceFrame' },
  { title: 'Frameless', value: 'frameless' },
];
const DRAWER_FRONTS = [
  { title: 'Kept as it is', value: 'kept' },
  { title: 'A new front, made here', value: 'new' },
];
const DRAWER_COUNTS = Array.from({ length: EXISTING_DRAWERS_MAX + 1 }, (_, n) => ({ title: n === 0 ? 'None' : String(n), value: n }));
const LOWEST = [
  { title: 'Doors', value: 'doors' },
  { title: 'A drawer', value: 'drawer' },
];
/** Its drawer openings over the lowest opening, and what the lowest holds. */
function setOpenings(drawers: number, lowest: string) {
  if (store.project && cabinet.value) setExistingOpenings(store.project, cabinet.value.id, drawers, lowest === 'drawer' ? 'drawer' : 'doors');
}
const FRONTS = [
  { title: 'Kept as they are', value: 'kept' },
  { title: 'New doors, made here', value: 'new' },
];
function setInside(on: boolean) {
  const e = existing.value;
  if (!e || !cabinet.value) return;
  if (on) e.inside ??= measuredInside(cabinet.value, store.materials);
  else delete e.inside;
}
/** The doors it has now (reverse mode): measured, the overlay they have is worked out and hinges suggested for it. */
function setDoorsNow(on: boolean) {
  const e = existing.value;
  if (!e) return;
  if (on) e.doors ??= { count: 2, widthAcross: { mm: e.opening.width.mm + 25.4, unit: 'in' }, height: { mm: e.opening.height.mm + 25.4, unit: 'in' }, gap: len('1/8"') };
  else delete e.doors;
}

interface Step {
  /** Which step it is, when several ask the same kind of thing (the drawer openings). */
  key?: string;
  what: MeasureWhat;
  title: string;
  words: string;
  get: (e: ExistingCase) => Length | undefined;
  set: (e: ExistingCase, value: Length) => void;
}
/** The measurements asked, in the order they are taken standing at the cabinet. */
const steps = computed((): Step[] => {
  const e = existing.value;
  if (!e) return [];
  const out: Step[] = [];
  const low = e.lowest === 'drawer' ? 'Lowest drawer opening' : 'Door opening';
  // The drawer openings over the lowest one, from the top down, each with the rail under it.
  (e.drawers ?? []).forEach((_, i) => {
    out.push({ key: `drawer-${i}`, what: 'drawerHeight', title: `Drawer opening ${i + 1}, height`, words: `Counted from the top: drawer opening ${i + 1}, with its drawer out. ${e.frame === 'faceFrame' ? 'The clear hole in the face frame, from the rail under it up to the rail over it.' : 'From the bottom edge of its front to the top edge, with half of each gap to its neighbours.'}`, get: (x) => x.drawers?.[i]?.height, set: (x, v) => x.drawers?.[i] && (x.drawers[i]!.height = v) });
    if (e.frame === 'faceFrame') out.push({ key: `rail-${i}`, what: 'drawerRail', title: `The rail under drawer opening ${i + 1}`, words: 'How wide the rail is, from the bottom of this opening down to the top of the next.', get: (x) => x.drawers?.[i]?.rail, set: (x, v) => x.drawers?.[i] && (x.drawers[i]!.rail = v) });
  });
  if (e.frame === 'faceFrame' || !e.inside) {
    out.push(
      { what: 'openingWidth', title: `${low}, width`, words: e.frame === 'faceFrame' ? 'The clear hole in the face frame, from the edge of one stile to the edge of the other.' : 'Between the two sides of the box, at the front.', get: (x) => x.opening.width, set: (x, v) => (x.opening.width = v) },
      { what: 'openingHeight', title: `${low}, height`, words: e.frame === 'faceFrame' ? 'The clear hole in the face frame, from the bottom rail up to the top rail.' : wall.value ? "From the cabinet's bottom board up to its top board, inside." : "From the cabinet's floor up to what is over the doors.", get: (x) => x.opening.height, set: (x, v) => (x.opening.height = v) },
    );
  }
  if (e.fronts === 'new' && e.doors) {
    out.push(
      { what: 'doorsAcross', title: 'The doors it has now: across', words: 'With the doors closed, from the outer edge of one door to the outer edge of the other, the gap between them included. One door: across it.', get: (x) => x.doors?.widthAcross, set: (x, v) => x.doors && (x.doors.widthAcross = v) },
      { what: 'doorsHeight', title: 'The doors it has now: height', words: 'One door, from its bottom edge to its top edge.', get: (x) => x.doors?.height, set: (x, v) => x.doors && (x.doors.height = v) },
      { what: 'doorsGap', title: 'The doors it has now: the gap', words: 'Between the two doors where they meet, closed.', get: (x) => x.doors?.gap, set: (x, v) => x.doors && (x.doors.gap = v) },
    );
  }
  if (e.inside) {
    out.push(
      { what: 'insideWidthFront', title: 'Inside width, at the front', words: 'Inside the box, between its two sides, just behind the front. Behind a face frame this is wider than the door opening.', get: (x) => x.inside?.widthFront, set: (x, v) => x.inside && (x.inside.widthFront = v) },
      { what: 'insideWidthBack', title: 'Inside width, at the back', words: 'Between the two sides again, against the back. Old boxes are seldom square: the smaller of the two widths is the one used.', get: (x) => x.inside?.widthBack, set: (x, v) => x.inside && (x.inside.widthBack = v) },
      { what: 'insideDepth', title: 'Inside depth', words: 'From the front edge of the sides (behind the face frame, if it has one) to the back.', get: (x) => x.inside?.depth, set: (x, v) => x.inside && (x.inside.depth = v) },
      { what: 'insideHeight', title: 'Inside height', words: wall.value ? "From the top of the cabinet's bottom board up to the underside of its top." : "From the cabinet's floor up to what is over it: the underside of the top, a rail, or the bottom of a drawer.", get: (x) => x.inside?.height, set: (x, v) => x.inside && (x.inside.height = v) },
      { what: 'hingeStandIn', title: 'How far the hinges stand in', words: 'With a door open, from the edge of the door opening to the furthest point of the hinge that stands in it. What goes in must clear it.', get: (x) => x.hingeStandIn, set: (x, v) => (x.hingeStandIn = v) },
    );
  }
  return out;
});
const wrong = computed(() => (existing.value ? existingProblems(existing.value) : []));
const status = computed(() => {
  const c = cabinet.value;
  if (!c) return '';
  if (!c.existing) return `${c.name} is made here: nothing to measure.`;
  const e = c.existing;
  return `${c.name}: door opening ${L.value(e.opening.width.mm)} × ${L.value(e.opening.height.mm)}${e.inside ? `, ${L.value(Math.min(e.inside.widthFront.mm, e.inside.widthBack.mm))} wide inside` : ''}`;
});
</script>

<template>
  <template v-if="store.project && cabinet">
    <PageHeader title="Measure" :status="status" :next="{ to: `/design?cabinet=${index + 1}`, title: 'Design' }" />
    <div class="measure-column">
      <div v-if="cabinets.length > 1" class="d-flex flex-wrap ga-2 mb-3" data-test="measure-cabinets">
        <v-chip v-for="(c, i) in cabinets" :key="c.id" :color="i === index ? 'primary' : undefined" :variant="i === index ? 'flat' : 'tonal'" @click="go(i)">
          {{ c.name }}<template v-if="!c.existing"> (made here)</template>
        </v-chip>
      </div>

      <v-card v-if="!existing" class="pa-4 mb-3" data-test="measure-made">
        <div class="text-body-1 mb-2">{{ cabinet.name }} is a cabinet made here: its sizes are chosen in Design, not measured.</div>
        <v-btn v-if="takesExisting(cabinet)" color="primary" variant="tonal" data-test="measure-make-there" @click="makeThere">It is already there: measure it</v-btn>
        <div v-else class="text-body-2 text-medium-emphasis">Only a base or a wall cabinet with one bay can be measured as one that is already there (of the corner cabinets, a blind one).</div>
      </v-card>

      <template v-else>
        <v-card class="pa-4 mb-3" data-test="measure-kind">
          <div class="text-subtitle-1 font-weight-bold mb-2">The cabinet</div>
          <v-text-field v-model="cabinet.name" label="Its name" hide-details class="mb-3" />
          <v-select v-model="existing.frame" label="How it is built" :items="FRAMES" hide-details class="mb-3" data-test="measure-frame" />
          <div class="text-body-2 text-medium-emphasis mb-3">
            A face frame is a frame of solid wood on the front of the box, the doors closing on it. Frameless: the doors close on the edges of the box itself.
          </div>
          <template v-if="!wall">
            <v-select :model-value="existing.drawers?.length ?? 0" label="Drawer openings over its lowest opening" :items="DRAWER_COUNTS" hide-details class="mb-3" data-test="measure-drawer-count" @update:model-value="setOpenings($event, existing.lowest ?? 'doors')" />
            <v-select :model-value="existing.lowest ?? 'doors'" label="Its lowest opening holds" :items="LOWEST" hide-details class="mb-3" data-test="measure-lowest" @update:model-value="setOpenings(existing.drawers?.length ?? 0, $event)" />
            <v-select v-for="(d, i) in existing.drawers ?? []" :key="i" v-model="d.fronts" :label="`Drawer front ${i + 1}, from the top`" :items="DRAWER_FRONTS" hide-details class="mb-3" :data-test="`measure-drawer-fronts-${i + 1}`" />
          </template>
          <v-select v-model="existing.fronts" :label="existing.lowest === 'drawer' ? 'Its lowest drawer front' : 'Its doors'" :items="existing.lowest === 'drawer' ? DRAWER_FRONTS : FRONTS" hide-details class="mb-1" data-test="measure-fronts" />
          <v-switch v-if="existing.fronts === 'new' && existing.lowest !== 'drawer'" :model-value="!!existing.doors" label="Measure the doors it has now, to copy how they sit" color="primary" density="compact" hide-details data-test="measure-doors-now" @update:model-value="setDoorsNow(!!$event)" />
          <v-switch :model-value="!!existing.inside" :label="wall ? 'Measure the inside too, to draw it at its own size' : 'Measure the inside, to fit it out with trays and shelves'" color="primary" density="compact" hide-details data-test="measure-inside" @update:model-value="setInside(!!$event)" />
        </v-card>

        <v-card v-for="(step, i) in steps" :key="step.key ?? step.what" class="pa-4 mb-3" :data-test="`measure-${step.key ?? step.what}`">
          <div class="text-caption text-medium-emphasis">{{ i + 1 }} of {{ steps.length }}</div>
          <div class="text-subtitle-1 font-weight-bold mb-1">{{ step.title }}</div>
          <MeasureDiagram :what="step.what" :frame="existing.frame" :wall="wall" class="mb-2" />
          <div class="text-body-2 text-medium-emphasis mb-3">{{ step.words }}</div>
          <LengthField :model-value="step.get(existing) ?? null" :label="step.title" @update:model-value="$event && step.set(existing, $event)" />
        </v-card>

        <v-alert v-for="line in wrong" :key="line" type="warning" variant="tonal" density="compact" class="mb-3" data-test="measure-problem">{{ line }}</v-alert>

        <v-card class="pa-4 mb-3">
          <div class="text-body-2 text-medium-emphasis mb-3">
            <template v-if="wall">A wall cabinet that is already there is here for new doors: the door opening is all they need.</template>
            <template v-else-if="existing.inside">What is in the way inside (the trap, the bowl, valves) is measured in Design, under "A sink over it", where the trays and shelves are chosen.</template>
            <template v-else>With only the door opening measured, new doors can be made. Measure the inside to put trays and shelves in it.</template>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn :to="`/design?cabinet=${index + 1}&fold=openings`" color="primary" variant="flat" data-test="measure-done">Done: to Design</v-btn>
            <v-btn variant="tonal" data-test="measure-add" @click="addThere()">Another cabinet that is already there</v-btn>
            <v-btn variant="tonal" data-test="measure-add-wall" @click="addThere('wall')">A wall cabinet that is already there</v-btn>
          </div>
        </v-card>
      </template>
    </div>
  </template>
</template>

<style scoped>
/* One narrow column: a phone's width, centred on anything wider. */
.measure-column {
  max-width: 520px;
  margin: 0 auto;
}
</style>
