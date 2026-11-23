<script setup lang="ts">
/**
 * A pocket hole in section (`PocketSection`): the board and the other part it is screwed to, the pocket, the screw
 * lying in it with its head on the seat, and its pilot (drilled) or channel (cut open). Drawn to scale in mm, the
 * face the pocket is cut in at the top. Under it: the seat's distance, how much screw goes into the other part, and how long the pocket takes to cut.
 */
import { computed, useId } from 'vue';
import type { PocketSection } from '@/jigs/pocketSection';
import { POCKET_SCREW, bothUnits } from '@/jigs/pocketSection';
import { POCKET } from '@/geometry/pocketHole';
import { useAppStore } from '@/stores/app';

const props = defineProps<{ section: PocketSection; title: string; time?: string }>();
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
/**
 * The screw's body seen from the side, along its axis from the tip (x) and across it (y), as one outline: the point,
 * tapering to the tip with its threads running down it; the threaded length, a sawtooth on each edge (each crest leaning
 * toward the head, the two edges half a pitch apart as a helix shows them); then the smooth shank up to the seat.
 */
const body = computed(() => {
  const k = kind.value;
  const [x0, xThreads, xSeat] = [tip.value, threadEnd.value, s.value.seat];
  const pitch = s.value.fine ? POCKET_SCREW.pitch.fine : POCKET_SCREW.pitch.coarse;
  const [root, crest] = [k.shank / 2 * 0.82, k.thread / 2];
  /** The radius a crest or root reaches at x: full along the thread, tapering to nothing at the tip over the point. */
  const taper = (x: number) => Math.min(1, Math.max(0, (x - x0) / POCKET_SCREW.point));
  const edge = (side: 1 | -1) => {
    const pts: [number, number][] = [];
    const offset = side === 1 ? 0 : pitch / 2;
    for (let x = x0 + offset; x < xThreads; x += pitch) {
      pts.push([x, side * root * taper(x)]);
      const peak = Math.min(xThreads, x + pitch * 0.62);
      pts.push([peak, side * crest * taper(peak)]);
    }
    pts.push([xThreads, side * root], [xThreads + 0.6, side * (k.shank / 2)], [xSeat, side * (k.shank / 2)]);
    return pts;
  };
  const top = edge(-1);
  const bottom = edge(1).reverse();
  return [[x0, 0] as [number, number], ...top, ...bottom].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
});
/** The head, on the seat: a Castle screw's short cheese head, or a Kreg screw's washer head, flat underneath and domed. */
const head = computed(() => {
  const { diameter: d, height: h } = kind.value.head;
  const x = s.value.seat;
  if (s.value.screwKind === 'castle') return `M ${x} ${-d / 2} L ${x + h - 0.8} ${-d / 2} Q ${x + h} ${-d / 2} ${x + h} ${-d / 2 + 0.8} L ${x + h} ${d / 2 - 0.8} Q ${x + h} ${d / 2} ${x + h - 0.8} ${d / 2} L ${x} ${d / 2} Z`;
  return `M ${x} ${-d / 2} L ${x + h * 0.3} ${-d / 2} Q ${x + h} ${-d / 4} ${x + h} 0 Q ${x + h} ${d / 4} ${x + h * 0.3} ${d / 2} L ${x} ${d / 2} Z`;
});
/** The drive's recess in the head's top, seen from the side: a notch. */
const recess = computed(() => {
  const { height: h } = kind.value.head;
  const x = s.value.seat + h;
  return `${(x - h * 0.55).toFixed(2)},-1.4 ${x.toFixed(2)},-1.6 ${x.toFixed(2)},1.6 ${(x - h * 0.55).toFixed(2)},1.4`;
});
/** The metal's shading across the screw, an id of this drawing's own since several are on a page. */
const gradient = `screw-shade-${useId()}`;
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
      <defs>
        <!-- Lit from above: a Kreg screw's zinc, a Castle screw's bronze coating. -->
        <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
          <template v-if="s.screwKind === 'castle'">
            <stop offset="0" stop-color="#5a4a30" />
            <stop offset="0.3" stop-color="#d8c49a" />
            <stop offset="0.5" stop-color="#b09870" />
            <stop offset="1" stop-color="#5a4a30" />
          </template>
          <template v-else>
            <stop offset="0" stop-color="#4b5563" />
            <stop offset="0.3" stop-color="#f1f5f9" />
            <stop offset="0.5" stop-color="#cbd2db" />
            <stop offset="1" stop-color="#4b5563" />
          </template>
        </linearGradient>
      </defs>
      <!-- The other part, standing against the edge, and the board the pocket is cut in. -->
      <rect :x="-t" :y="-8" :width="t" :height="t + 16" class="other" />
      <rect x="0" y="0" :width="reach - 2" :height="t" class="board" />
      <!-- The pocket and the channel are slots down the middle: drawn lighter, the wood either side of them still there. -->
      <polygon :points="points(s.pocket)" class="slot" />
      <!-- A channel only outlined: 4 mm across, the wood either side of it is what you see above the screw. -->
      <polygon v-if="s.channel" :points="channel" class="channel" />
      <g :transform="screwTransform">
        <!-- A drilled pilot, from the edge to the seat. -->
        <template v-if="!s.channel">
          <line x1="0" :y1="-POCKET.drill / 2" :x2="s.seat" :y2="-POCKET.drill / 2" class="pilot" />
          <line x1="0" :y1="POCKET.drill / 2" :x2="s.seat" :y2="POCKET.drill / 2" class="pilot" />
        </template>
        <!-- The screw: its point, its threaded length, its smooth shank up to the seat, and its head on the seat. -->
        <g :class="['screw', s.screwKind, { bad: s.short || s.through }]">
          <polygon :points="body" :fill="`url(#${gradient})`" class="outline" />
          <path :d="head" :fill="`url(#${gradient})`" class="outline" />
          <polygon :points="recess" class="recess" />
        </g>
      </g>
      <!-- The joint's line. -->
      <line x1="0" :y1="-9" x2="0" :y2="t + 9" class="joint" />
    </svg>
    <figcaption class="text-caption">
      <span class="font-weight-medium">{{ title }}</span>
      <span class="text-medium-emphasis"> · seat {{ L(s.seat) }} · {{ screwName(s.screw) }} {{ s.screwKind === 'castle' ? '#7' : '#8' }}{{ s.fine ? ' fine' : '' }} · </span>
      <span :class="s.short || s.through ? 'text-warning' : 'text-medium-emphasis'">{{ L(s.into) }} in<template v-if="s.short">, too little</template><template v-else-if="s.through">, comes through</template></span>
      <span v-if="time" class="text-medium-emphasis" data-test="section-time"> · cuts in {{ time }}</span>
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
.channel {
  fill: none;
  stroke: #2a2e37;
  stroke-width: 0.35;
  stroke-dasharray: 1.2 0.8;
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
.outline {
  stroke: #2b2f36;
  stroke-width: 0.18;
  stroke-linejoin: round;
}
.recess {
  fill: #1c1f25;
}
/* A screw too short or coming through: tinted amber over its shading. */
.bad .outline {
  stroke: #e0a050;
  stroke-width: 0.35;
}
.joint {
  stroke: #1c1f25;
  stroke-width: 0.3;
}
</style>
