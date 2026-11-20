<script setup lang="ts">
/**
 * A picture of one measurement of a cabinet that is already there: the cabinet
 * drawn plainly from the front, from above or cut through from the side, with the one distance to
 * measure marked. Schematic: not to scale, and the same for every cabinet.
 */
import { computed } from 'vue';

export type MeasureWhat =
  | 'openingWidth'
  | 'openingHeight'
  | 'insideWidthFront'
  | 'insideWidthBack'
  | 'insideDepth'
  | 'insideHeight'
  | 'hingeStandIn'
  | 'doorsAcross'
  | 'doorsHeight'
  | 'doorsGap'
  | 'drawerHeight'
  | 'drawerRail';

const props = defineProps<{ what: MeasureWhat; frame: 'faceFrame' | 'frameless'; wall?: boolean }>();

const view = computed(() => (props.what === 'insideHeight' ? 'side' : props.what.startsWith('insideWidth') || props.what === 'insideDepth' ? 'top' : 'front'));
const framed = computed(() => props.frame === 'faceFrame');
/** The door opening in the front view: the hole in the face frame, or the inside of a frameless box. */
const open = computed(() => (framed.value ? { x: 68, y: 34, w: 104, h: 92 } : { x: 48, y: 26, w: 144, h: 108 }));
/** The doors over the opening, for the measurements of the doors it has now. */
const doors = computed(() => {
  const o = open.value;
  const lap = framed.value ? 8 : 4;
  const [x, y, w, h] = [o.x - lap, o.y - lap, o.w + 2 * lap, o.h + 2 * lap];
  return { x, y, w, h, gap: 4, each: (w - 4) / 2 };
});
const showsDoors = computed(() => props.what.startsWith('doors'));
/** A drawer opening over the lowest opening: the two holes and the rail between them. */
const showsDrawer = computed(() => props.what.startsWith('drawer'));
const drawerHole = computed(() => ({ x: open.value.x, y: open.value.y, w: open.value.w, h: 24 }));
const railUnder = computed(() => (framed.value ? 12 : 3));
const lowerHole = computed(() => {
  const y = drawerHole.value.y + drawerHole.value.h + railUnder.value;
  return { x: open.value.x, y, w: open.value.w, h: open.value.y + open.value.h - y };
});

/** The marked distance: a line from `a` to `b` with a tick at each end, and where its label sits. */
const mark = computed((): { a: [number, number]; b: [number, number]; label: [number, number] } => {
  const o = open.value;
  const d = doors.value;
  switch (props.what) {
    case 'drawerHeight':
      return { a: [o.x + o.w / 2, drawerHole.value.y], b: [o.x + o.w / 2, drawerHole.value.y + drawerHole.value.h], label: [o.x + o.w / 2 + 8, drawerHole.value.y + 15] };
    case 'drawerRail':
      return { a: [o.x + o.w / 2, lowerHole.value.y - railUnder.value], b: [o.x + o.w / 2, lowerHole.value.y], label: [o.x + o.w / 2 + 8, lowerHole.value.y + 12] };
    case 'openingWidth':
      return { a: [o.x, o.y + o.h / 2], b: [o.x + o.w, o.y + o.h / 2], label: [o.x + o.w / 2, o.y + o.h / 2 - 7] };
    case 'openingHeight':
      return { a: [o.x + o.w / 2, o.y], b: [o.x + o.w / 2, o.y + o.h], label: [o.x + o.w / 2 + 8, o.y + o.h / 2] };
    case 'hingeStandIn':
      return { a: [o.x, o.y + 30], b: [o.x + 16, o.y + 30], label: [o.x + 22, o.y + 34] };
    case 'doorsAcross':
      return { a: [d.x, d.y + d.h / 2], b: [d.x + d.w, d.y + d.h / 2], label: [d.x + d.w / 4, d.y + d.h / 2 - 7] };
    case 'doorsHeight':
      return { a: [d.x + d.each / 2, d.y], b: [d.x + d.each / 2, d.y + d.h], label: [d.x + d.each / 2 + 8, d.y + d.h / 2] };
    case 'doorsGap':
      return { a: [d.x + d.each, d.y + 26], b: [d.x + d.each + d.gap, d.y + 26], label: [d.x + d.each + 12, d.y + 30] };
    case 'insideWidthFront':
      return { a: [48, 124], b: [192, 124], label: [120, 117] };
    case 'insideWidthBack':
      return { a: [48, 36], b: [192, 36], label: [120, 50] };
    case 'insideDepth':
      return { a: [120, 28], b: [120, 140], label: [128, 86] };
    default:
      // The inside height, in the side view: from the cabinet's floor up to what is over it.
      return { a: [120, 28], b: [120, 120], label: [128, 76] };
  }
});
const upright = computed(() => mark.value.a[0] === mark.value.b[0]);
</script>

<template>
  <svg viewBox="0 0 240 160" class="measure" role="img" :aria-label="`Where to measure: ${what}`" :data-test="`diagram-${what}`">
    <!-- From the front: the case, its face frame or its edges, the toe kick, the opening. -->
    <g v-if="view === 'front'" class="body">
      <rect x="40" y="18" width="160" height="124" class="solid" />
      <rect v-if="!wall" x="46" y="142" width="148" height="12" class="faint" />
      <template v-if="showsDrawer">
        <rect :x="drawerHole.x" :y="drawerHole.y" :width="drawerHole.w" :height="drawerHole.h" class="hole" />
        <rect :x="lowerHole.x" :y="lowerHole.y" :width="lowerHole.w" :height="lowerHole.h" class="hole" />
      </template>
      <rect v-else :x="open.x" :y="open.y" :width="open.w" :height="open.h" class="hole" />
      <g v-if="what === 'hingeStandIn'">
        <rect :x="open.x" :y="open.y + 22" width="16" height="16" class="hinge" />
        <rect :x="open.x" :y="open.y + open.h - 30" width="16" height="16" class="hinge" />
      </g>
      <g v-if="showsDoors">
        <rect :x="doors.x" :y="doors.y" :width="doors.each" :height="doors.h" class="door" />
        <rect :x="doors.x + doors.each + doors.gap" :y="doors.y" :width="doors.each" :height="doors.h" class="door" />
      </g>
      <text x="120" y="12" class="note">from the front</text>
    </g>
    <!-- From above: the two sides and the back, open at the front, the face frame's stiles standing in. -->
    <g v-else-if="view === 'top'" class="body">
      <rect x="40" y="20" width="160" height="8" class="solid" />
      <rect x="40" y="20" width="8" height="120" class="solid" />
      <rect x="192" y="20" width="8" height="120" class="solid" />
      <template v-if="framed">
        <rect x="40" y="140" width="28" height="7" class="solid" />
        <rect x="172" y="140" width="28" height="7" class="solid" />
      </template>
      <text x="120" y="12" class="note">from above: the back</text>
      <text x="120" y="157" class="note">the front</text>
    </g>
    <!-- Cut through from the side: the top, the back, the floor over the toe kick. -->
    <g v-else class="body">
      <rect x="50" y="20" width="140" height="8" class="solid" />
      <rect x="182" y="20" width="8" height="108" class="solid" />
      <rect x="50" y="120" width="140" height="8" class="solid" />
      <rect v-if="!wall" x="62" y="128" width="8" height="24" class="faint" />
      <template v-if="framed"><rect x="43" y="20" width="7" height="16" class="solid" /><rect x="43" y="116" width="7" height="12" class="solid" /></template>
      <text x="120" y="12" class="note">cut through, from the side</text>
      <text x="40" y="80" class="note" text-anchor="end">front</text>
    </g>
    <!-- The distance to measure. -->
    <g class="mark">
      <line :x1="mark.a[0]" :y1="mark.a[1]" :x2="mark.b[0]" :y2="mark.b[1]" />
      <template v-if="upright">
        <line :x1="mark.a[0] - 6" :y1="mark.a[1]" :x2="mark.a[0] + 6" :y2="mark.a[1]" />
        <line :x1="mark.b[0] - 6" :y1="mark.b[1]" :x2="mark.b[0] + 6" :y2="mark.b[1]" />
      </template>
      <template v-else>
        <line :x1="mark.a[0]" :y1="mark.a[1] - 6" :x2="mark.a[0]" :y2="mark.a[1] + 6" />
        <line :x1="mark.b[0]" :y1="mark.b[1] - 6" :x2="mark.b[0]" :y2="mark.b[1] + 6" />
      </template>
      <text :x="mark.label[0]" :y="mark.label[1]" :text-anchor="upright || what === 'hingeStandIn' || what === 'doorsGap' ? 'start' : 'middle'">measure</text>
    </g>
  </svg>
</template>

<style scoped>
.measure {
  display: block;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  color: rgb(var(--v-theme-on-surface));
}
.solid {
  fill: currentColor;
  fill-opacity: 0.22;
  stroke: currentColor;
  stroke-opacity: 0.6;
  stroke-width: 1;
}
.faint {
  fill: currentColor;
  fill-opacity: 0.1;
  stroke: currentColor;
  stroke-opacity: 0.3;
  stroke-width: 1;
}
.hole {
  fill: rgb(var(--v-theme-surface));
  stroke: currentColor;
  stroke-opacity: 0.6;
  stroke-width: 1;
}
.door {
  fill: currentColor;
  fill-opacity: 0.12;
  stroke: currentColor;
  stroke-opacity: 0.75;
  stroke-width: 1;
  stroke-dasharray: 4 2;
}
.hinge {
  fill: currentColor;
  fill-opacity: 0.55;
}
.note {
  fill: currentColor;
  fill-opacity: 0.6;
  font-size: 8px;
  text-anchor: middle;
}
.mark line {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2.5;
  stroke-linecap: round;
}
.mark text {
  fill: rgb(var(--v-theme-primary));
  font-size: 9px;
  font-weight: 600;
}
</style>
