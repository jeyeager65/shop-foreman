<script setup lang="ts">
/**
 * How a machine places its holding tabs, chosen from pictures: the same few parts under each
 * way, with the tabs where a job would leave them for the machine's values as they stand. The pictures are the
 * rule itself (`tabCenters`), so they change as the width, the spacing and the corner clearance are typed.
 */
import { computed } from 'vue';
import type { TabMethod } from '@/cam/cuts';
import { alongLoop, exampleTabs, tabExamples } from '@/cam/tabExamples';
import type { MachineProfile } from '@/model';

const props = defineProps<{ tabs: MachineProfile['tabs']; /** A length in words, in the shop's unit for sizes. */ show: (mm: number) => string }>();
const emit = defineEmits<{ (e: 'choose', method: TabMethod): void }>();

const METHODS: { value: TabMethod; title: string; about: string }[] = [
  { value: 'spread', title: 'Smart', about: 'The part as a whole: a tab near each corner, on its long sides; staggered on a narrow part; one more only on a side longer than "Spacing" that has none. Two on a side may be twice "Spacing" apart.' },
  { value: 'perSide', title: 'Evenly along every side', about: 'Every side long enough for a tab has one in its middle, and more only when it is longer than "Spacing".' },
];
const chosen = computed<TabMethod>(() => props.tabs.method ?? 'spread');
/** Every part is drawn at one scale, so a small part looks small beside a cabinet side: the biggest fills its box. */
const BOX = { w: 132, h: 120, pad: 4 };
const all = tabExamples();
const span = (points: { x: number; y: number }[], axis: 'x' | 'y') => Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
const SCALE = Math.min(...all.map((ex) => Math.min((BOX.w - 2 * BOX.pad) / span(ex.outline, 'x'), (BOX.h - 2 * BOX.pad) / span(ex.outline, 'y'))));
/** A foot, drawn at that scale under the pictures, to judge them by. */
const RULE = 304.8;
const path = (points: { x: number; y: number }[], closed: boolean) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + (closed ? 'Z' : '');

const columns = computed(() =>
  METHODS.map((m) => ({
    ...m,
    examples: all.map((ex) => {
      const xs = ex.outline.map((p) => p.x);
      const ys = ex.outline.map((p) => p.y);
      const [x0, y0, w, h] = [Math.min(...xs), Math.min(...ys), span(ex.outline, 'x'), span(ex.outline, 'y')];
      const k = SCALE;
      // Drawn with y up, standing on the bottom of its box, as high as it is at the scale.
      const height = h * k + 2 * BOX.pad;
      const place = (p: { x: number; y: number }) => ({ x: BOX.pad + (p.x - x0) * k, y: height - BOX.pad - (p.y - y0) * k });
      const { centers, length } = exampleTabs(ex, props.tabs, m.value);
      // A tab is drawn at its own length, and no shorter than will show.
      const drawn = Math.max(length, 4 / k);
      return {
        id: ex.id,
        title: ex.title,
        note: ex.note,
        count: centers.length,
        size: `${props.show(w)} × ${props.show(h)}, ${props.show(ex.thickness)} thick`,
        height,
        outline: path(ex.outline.map(place), true),
        tabs: centers.map((c) => path(alongLoop(ex.outline, c - drawn / 2, c + drawn / 2).map(place), false)),
      };
    }),
  })),
);
</script>

<template>
  <div class="tab-methods" role="radiogroup" aria-label="How the holding tabs are placed">
    <button
      v-for="m in columns"
      :key="m.value"
      type="button"
      role="radio"
      :aria-checked="chosen === m.value"
      :class="['tab-method', { chosen: chosen === m.value }]"
      :data-test="`tab-method-${m.value}`"
      @click="emit('choose', m.value)"
    >
      <div class="tab-method-title">
        <span class="dot" />
        {{ m.title }}
      </div>
      <div class="text-caption text-medium-emphasis tab-method-about">{{ m.about }}</div>
      <div class="tab-examples">
        <figure v-for="ex in m.examples" :key="ex.id" class="tab-example" :title="ex.note">
          <div class="tab-picture">
            <svg :viewBox="`0 0 ${BOX.w} ${ex.height}`" :width="BOX.w" :height="ex.height" aria-hidden="true">
              <path :d="ex.outline" class="part" />
              <path v-for="(t, i) in ex.tabs" :key="i" :d="t" class="tab" />
            </svg>
          </div>
          <figcaption class="text-caption">
            <div>{{ ex.title }}</div>
            <div class="text-medium-emphasis">{{ ex.size }}</div>
            <div class="tab-count" :data-test="`tab-count-${m.value}-${ex.id}`">{{ ex.count }} {{ ex.count === 1 ? 'tab' : 'tabs' }}</div>
          </figcaption>
        </figure>
      </div>
      <!-- All seven are drawn at one scale: this is a foot of it. -->
      <div class="tab-rule text-caption text-medium-emphasis">
        <svg :width="RULE * SCALE + 2" height="10" aria-hidden="true"><path :d="`M1,1V9M1,5H${RULE * SCALE + 1}M${RULE * SCALE + 1},1V9`" /></svg>
        {{ show(RULE) }}: every part is drawn at this scale
      </div>
    </button>
  </div>
</template>

<style scoped>
.tab-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}
.tab-method {
  text-align: left;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  min-width: 0;
}
.tab-method.chosen {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}
.tab-method-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.6);
  flex: none;
}
.chosen .dot {
  border-color: rgb(var(--v-theme-primary));
  background: radial-gradient(rgb(var(--v-theme-primary)) 45%, transparent 50%);
}
.tab-method-about {
  margin: 4px 0 8px;
  min-height: 3.2em;
}
.tab-examples {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 12px 6px;
  align-items: end;
}
.tab-example {
  margin: 0;
  min-width: 0;
}
.tab-picture {
  display: flex;
  align-items: flex-end;
  margin-bottom: 2px;
}
.tab-example figcaption {
  min-height: 5.2em;
}
.tab-example svg {
  display: block;
  flex: none;
}
.tab-count {
  font-weight: 600;
}
.tab-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.tab-rule path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.part {
  fill: rgba(var(--v-theme-on-surface), 0.07);
  stroke: rgba(var(--v-theme-on-surface), 0.55);
  stroke-width: 1;
  stroke-linejoin: round;
}
.tab {
  fill: none;
  stroke: rgb(var(--v-theme-warning));
  stroke-width: 3.5;
  stroke-linecap: butt;
}
</style>
