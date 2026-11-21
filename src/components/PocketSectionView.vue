<script setup lang="ts">
/**
 * A pocket hole in section (`PocketSection`): the board and the other part it is screwed to, the pocket, the screw
 * lying in it with its head on the seat, and its pilot (drilled) or channel (cut open). Drawn to scale in mm, the
 * face the pocket is cut in at the top. Under it: the seat's distance and how much screw goes into the other part.
 */
import { computed } from 'vue';
import type { PocketSection } from '@/jigs/pocketSection';
import { POCKET_SCREW, bothUnits } from '@/jigs/pocketSection';
import { POCKET } from '@/geometry/pocketHole';
import { useAppStore } from '@/stores/app';

const props = defineProps<{ section: PocketSection; title: string }>();
const store = useAppStore();
/** Its lengths as the rest of the scrap test's page, in both units: what is cut and measured the CNC unit first, the screw as bought. */
const L = computed(() => (mm: number) => bothUnits(mm, store.units.cnc));
const screwName = computed(() => (mm: number) => bothUnits(mm, store.units.sizes));

const s = computed(() => props.section);
const a = computed(() => (s.value.angleDeg * Math.PI) / 180);
/** How far in the drawing reaches: past the pocket, or the screw's head. */
const reach = computed(() => Math.max(...s.value.pocket.map((p) => p[0]), s.value.seat * Math.cos(a.value) + kind.value.head.height) + 6);
/** The kind of screw: its head and how much of it is threaded. */
const kind = computed(() => POCKET_SCREW[s.value.screwKind]);
/** Along the screw from where it leaves the edge: its tip, where its threads stop, and its seat. */
const tip = computed(() => s.value.seat - s.value.screw);
const threadEnd = computed(() => tip.value + s.value.screw * kind.value.threads);
/** The threads, seen from the side: a zigzag between their outsides, from behind the point to where they stop. */
const threads = computed(() => {
  const [from, to, half, pitch] = [tip.value + POCKET_SCREW.point, threadEnd.value, kind.value.thread / 2, s.value.fine ? POCKET_SCREW.pitch.fine : POCKET_SCREW.pitch.coarse];
  const n = Math.max(1, Math.round((to - from) / pitch));
  return Array.from({ length: n + 1 }, (_, i) => `${(from + ((to - from) * i) / n).toFixed(2)},${(i % 2 ? half : -half).toFixed(2)}`).join(' ');
});
/** The point: from the threads' root down to the tip. */
const point = computed(() => `${tip.value.toFixed(2)},0 ${(tip.value + POCKET_SCREW.point).toFixed(2)},${(-kind.value.shank / 2).toFixed(2)} ${(tip.value + POCKET_SCREW.point).toFixed(2)},${(kind.value.shank / 2).toFixed(2)}`);
const t = computed(() => s.value.thickness);
/** The view in SVG units (mm, y down): from inside the other part to past the pocket, above the face to under the board. */
const view = computed(() => {
  const x0 = -t.value - 4;
  return { x0, y0: -10, w: reach.value - x0, h: t.value + 20 };
});
const points = (pts: [number, number][]) => pts.map(([u, z]) => `${u.toFixed(2)},${(-z).toFixed(2)}`).join(' ');
/** The screw's channel, open to the face: from the edge to the seat, its floor along the screw's underside. */
const channel = computed(() => {
  const tan = Math.tan(a.value);
  const seatU = s.value.seat * Math.cos(a.value);
  const floor = (u: number) => -t.value / 2 + u * tan - POCKET.drill / 2;
  return points([[0, 0], [0, floor(0)], [seatU, floor(seatU)], [seatU, 0]]);
});
/** The screw along its axis from where it leaves the edge (mid-thickness), turned up by its angle. */
const screwTransform = computed(() => `translate(0 ${(t.value / 2).toFixed(2)}) rotate(${(-s.value.angleDeg).toFixed(2)})`);
</script>

<template>
  <figure class="section">
    <svg :viewBox="`${view.x0} ${view.y0} ${view.w} ${view.h}`" class="drawing" role="img" :aria-label="`${title}: a section through the pocket and its screw`">
      <!-- The other part, standing against the edge, and the board the pocket is cut in. -->
      <rect :x="-t" :y="-8" :width="t" :height="t + 16" class="other" />
      <rect x="0" y="0" :width="reach - 2" :height="t" class="board" />
      <!-- The pocket and the channel are slots down the middle: drawn lighter, the wood either side of them still there. -->
      <polygon :points="points(s.pocket)" class="slot" />
      <polygon v-if="s.channel" :points="channel" class="slot" />
      <g :transform="screwTransform">
        <!-- A drilled pilot, from the edge to the seat. -->
        <template v-if="!s.channel">
          <line x1="0" :y1="-POCKET.drill / 2" :x2="s.seat" :y2="-POCKET.drill / 2" class="pilot" />
          <line x1="0" :y1="POCKET.drill / 2" :x2="s.seat" :y2="POCKET.drill / 2" class="pilot" />
        </template>
        <!-- The screw: its point, its threaded length, its smooth shank up to the seat, and its head on the seat. -->
        <g :class="{ bad: s.short || s.through }">
          <polygon :points="point" class="screw" />
          <rect :x="tip + POCKET_SCREW.point" :y="-kind.shank / 2" :width="s.screw - POCKET_SCREW.point" :height="kind.shank" class="screw" />
          <polyline :points="threads" class="thread" />
          <rect v-if="s.screwKind === 'castle'" :x="s.seat" :y="-kind.head.diameter / 2" :width="kind.head.height" :height="kind.head.diameter" rx="0.8" class="screw" />
          <!-- A washer head: flat on the seat, rounded over its top. -->
          <path v-else :d="`M ${s.seat} ${-kind.head.diameter / 2} L ${s.seat + kind.head.height * 0.4} ${-kind.head.diameter / 2} Q ${s.seat + kind.head.height} 0 ${s.seat + kind.head.height * 0.4} ${kind.head.diameter / 2} L ${s.seat} ${kind.head.diameter / 2} Z`" class="screw" />
        </g>
      </g>
      <!-- The joint's line. -->
      <line x1="0" :y1="-9" x2="0" :y2="t + 9" class="joint" />
    </svg>
    <figcaption class="text-caption">
      <span class="font-weight-medium">{{ title }}</span>
      <span class="text-medium-emphasis"> · seat {{ L(s.seat) }} · {{ screwName(s.screw) }} {{ s.screwKind === 'castle' ? '#7' : '#8' }}{{ s.fine ? ' fine' : '' }} · </span>
      <span :class="s.short || s.through ? 'text-warning' : 'text-medium-emphasis'">{{ L(s.into) }} in<template v-if="s.short">, too little</template><template v-else-if="s.through">, comes through</template></span>
    </figcaption>
  </figure>
</template>

<style scoped>
.section {
  margin: 0;
}
.drawing {
  display: block;
  width: 100%;
  height: auto;
  max-height: 180px;
  background: #2a2e37;
  border-radius: 6px;
}
.board {
  fill: #c9a676;
}
.other {
  fill: #a8875c;
}
.slot {
  fill: #5c4c38;
  stroke: #e7e2d6;
  stroke-width: 0.25;
  stroke-dasharray: 1 0.8;
}
.pilot {
  stroke: #e7e2d6;
  stroke-width: 0.25;
  stroke-dasharray: 1 0.8;
}
.screw {
  fill: #b8bec8;
  stroke: #5b616b;
  stroke-width: 0.2;
}
.bad .screw {
  fill: #e0a050;
}
.thread {
  fill: none;
  stroke: #5b616b;
  stroke-width: 0.35;
}
.joint {
  stroke: #1c1f25;
  stroke-width: 0.3;
}
</style>
