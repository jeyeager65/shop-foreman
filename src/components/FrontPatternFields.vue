<script setup lang="ts">
/**
 * The pattern cut into a front's face (`DoorStyle.pattern`, `src/design/pattern.ts`): none, V-grooves, flutes or a
 * frame-and-panel look. It edits the style it is given in place. Fields only: the panel they sit in is the caller's.
 */
import { computed } from 'vue';
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import TilePicture from '@/components/TilePicture.vue';
import LengthField from '@/components/LengthField.vue';
import { bullCorner, cutWidth, dimplesFor, flutesFor, ripplesFor } from '@/design/pattern';
import { PATTERN_LOOKS, type PatternLook, lookOf, withLook } from '@/design/patternLooks';
import { type TileDrawing, patternTile } from '@/design/tileDrawings';
import type { DoorStyle } from '@/model';
import { useAppStore } from '@/stores/app';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

// (Not `style`: Vue hands a component a copy of what is bound to `style`, and a pattern put on the copy is lost.)
const props = defineProps<{
  frontStyle: DoorStyle;
  /** Setup: a picture of a front's face with the pattern on it (`frontFaceTile`), drawn beside the fields. */
  face?: TileDrawing;
}>();
const store = useAppStore();
const pattern = computed(() => props.frontStyle.pattern);
const L = (mm: number) => formatLength(mm, store.shop.units?.sizes ?? DEFAULT_UNIT_PREFERENCES.sizes);

/** The shop's ball noses, by width: a flute is as wide as the bit that cuts it. */
const balls = computed(() =>
  [...new Set(store.shop.tools.flatMap((t) => (t.shape.kind === 'ballNose' ? [t.shape.diameter.mm] : [])))].sort((a, b) => a - b),
);
const ballItems = computed(() => {
  const mine = pattern.value?.kind === 'flutes' || pattern.value?.kind === 'dimples' || (pattern.value?.kind === 'ripples' && pattern.value.bit === 'round') ? pattern.value.width.mm : undefined;
  const all = mine !== undefined && !balls.value.some((d) => Math.abs(d - mine) < 0.05) ? [...balls.value, mine] : balls.value;
  return all.map((d) => ({ title: `${L(d)} ball nose${balls.value.some((b) => Math.abs(b - d) < 0.05) ? '' : ' (not among your bits)'}`, value: d }));
});

/** The looks, each with its tile (`patternTile`: the lines that are cut); the frame look is a slab's. */
const LOOK_TILES = PATTERN_LOOKS.map((l) => ({ ...l, drawing: patternTile(l.value) }));
const looks = computed(() => LOOK_TILES.filter((l) => l.value !== 'frame' || props.frontStyle.kind === 'slab'));
const look = computed({
  get: () => lookOf(pattern.value),
  set: (value: PatternLook) => {
    // Flutes start at the widest ball nose in the shop up to 1/2". A pattern of the same kind keeps its sizes.
    const made = withLook(pattern.value, value, [...balls.value].reverse().find((d) => d <= 12.8));
    if (made) props.frontStyle.pattern = made;
    else delete props.frontStyle.pattern;
    // (On a slab every kind starts a frame's width in from the edges: a plain border, clear of the hinge cups.)
  },
});
const grooves = computed(() => (pattern.value?.kind === 'grooves' ? pattern.value : null));
const flutes = computed(() => (pattern.value?.kind === 'flutes' ? pattern.value : null));
const frame = computed(() => (pattern.value?.kind === 'frame' ? pattern.value : null));
/** Every pattern but the frame look: lines a spacing apart, a margin in from the edges. */
const sized = computed(() => (pattern.value && pattern.value.kind !== 'frame' ? pattern.value : null));
const dimples = computed(() => (pattern.value?.kind === 'dimples' ? pattern.value : null));
const channels = computed(() => (pattern.value?.kind === 'channels' ? pattern.value : null));
const ripples = computed(() => (pattern.value?.kind === 'ripples' ? pattern.value : null));
/** A ripple's bit, its width or its depth changed: the lines go to where each just meets the next. */
function respace(change: Partial<NonNullable<typeof ripples.value>>) {
  if (ripples.value) props.frontStyle.pattern = ripplesFor({ ...ripples.value, ...change });
}
const DIRECTIONS = [
  { title: 'Upright', value: 'vertical' },
  { title: 'Level', value: 'horizontal' },
];
function setBall(diameter: number) {
  if (flutes.value) props.frontStyle.pattern = flutesFor(diameter, flutes.value);
  if (dimples.value) props.frontStyle.pattern = dimplesFor(diameter, dimples.value);
}
/** Reeded or not: the spacing goes to what suits (they overlap, or stand apart). */
function setReeded(on: boolean) {
  if (!flutes.value) return;
  const { reeded: _was, ...rest } = flutes.value;
  props.frontStyle.pattern = flutesFor(rest.width.mm, on ? { ...rest, reeded: true } : rest);
}
function setBorder(on: boolean) {
  const p = props.frontStyle.pattern as Record<string, unknown> | undefined;
  if (!p) return;
  if (on) p.border = true;
  else delete p.border;
}
function flag(key: 'wavy', on: boolean) {
  const p = props.frontStyle.pattern as Record<string, unknown> | undefined;
  if (!p) return;
  if (on) p[key] = true;
  else delete p[key];
}
/** The shop's bull noses: a cut with one is as wide as it, with its corners. */
const bulls = computed(() => store.shop.tools.flatMap((t) => (t.shape.kind === 'bullNose' ? [{ id: t.id, name: t.name, width: t.shape.diameter.mm, corner: t.shape.cornerRadius.mm }] : [])));
const bullItems = computed(() => bulls.value.map((b) => ({ title: `${b.name} (${L(b.corner)} corners)`, value: b.id })));
/** The bull nose a pattern is sized for, when the shop has it. */
const bullId = computed(() => {
  const p = pattern.value;
  if (!p || (p.kind !== 'ripples' && p.kind !== 'channels')) return undefined;
  return bulls.value.find((b) => Math.abs(b.width - p.width.mm) < 0.05 && Math.abs(b.corner - bullCorner(p)) < 0.05)?.id;
});
/** A pattern sized for one of the shop's bull noses: its width and its corners. */
function setBull(id: string | undefined) {
  const bull = bulls.value.find((b) => b.id === id) ?? bulls.value[0];
  const p = pattern.value;
  if (!bull || !p) return;
  const sized = { width: { mm: bull.width, unit: 'in' as const }, corner: { mm: bull.corner, unit: 'in' as const } };
  if (p.kind === 'ripples') props.frontStyle.pattern = ripplesFor({ ...p, bit: 'bull', ...sized });
  // (Channels at least a bit and a half apart, middle to middle.)
  if (p.kind === 'channels') props.frontStyle.pattern = { ...p, soft: true, ...sized, spacing: p.spacing.mm < bull.width * 1.5 ? { mm: bull.width * 2, unit: 'in' as const } : p.spacing };
}
/** Soft corners on or off: on, the channels take the first bull nose of the shop. */
function setSoft(on: boolean) {
  const p = channels.value;
  if (!p) return;
  if (on) {
    if (bulls.value.length) setBull(undefined);
    else p.soft = true;
  } else {
    delete p.soft;
    delete p.corner;
  }
}
/**
 * The bit a pattern is cut with, as one choice among the shop's: its V-bits for grooves and the frame
 * look, its ball noses for flutes and dimples, all three kinds for ripples, an end mill or one of its bull noses
 * for channels. A choice is `v:<angle>`, `ball:<diameter>`, `bull:<bit id>` or `mill`.
 */
const vees = computed(() => {
  const seen = new Map<number, string>();
  for (const t of store.shop.tools) if (t.shape.kind === 'vBit' && !seen.has(t.shape.angleDeg)) seen.set(t.shape.angleDeg, t.name);
  return [...seen].map(([angle, name]) => ({ angle, name })).sort((a, b) => b.angle - a.angle);
});
const ballName = (d: number) => store.shop.tools.find((t) => t.shape.kind === 'ballNose' && Math.abs(t.shape.diameter.mm - d) < 0.05)?.name;
const bit = computed({
  get: (): string | undefined => {
    const p = pattern.value;
    if (!p) return undefined;
    if (p.kind === 'grooves' || p.kind === 'frame' || (p.kind === 'ripples' && p.bit === 'v')) return `v:${p.angleDeg}`;
    if (p.kind === 'flutes' || p.kind === 'dimples' || (p.kind === 'ripples' && p.bit === 'round')) return `ball:${p.width.mm}`;
    if (p.kind === 'channels' && !p.soft) return 'mill';
    return bullId.value ? `bull:${bullId.value}` : 'bull:';
  },
  set: (value: string | undefined) => {
    const p = pattern.value;
    if (!p || !value) return;
    const [kind, rest = ''] = value.split(':');
    if (kind === 'v') {
      const angleDeg = Number(rest);
      if (p.kind === 'ripples') respace({ bit: 'v', angleDeg });
      else if (p.kind === 'grooves' || p.kind === 'frame') p.angleDeg = angleDeg;
    } else if (kind === 'ball') {
      if (p.kind === 'ripples') respace({ bit: 'round', width: { mm: Number(rest), unit: 'in' } });
      else setBall(Number(rest));
    } else if (kind === 'bull') setBull(rest || undefined);
    else setSoft(false);
  },
});
const bitItems = computed(() => {
  const p = pattern.value;
  if (!p) return [];
  const mine = bit.value;
  const veeItems = () => {
    const items = vees.value.map((v) => ({ title: v.name, value: `v:${v.angle}` }));
    const angle = 'angleDeg' in p ? p.angleDeg : undefined;
    return mine?.startsWith('v:') && !items.some((i) => i.value === mine) ? [...items, { title: `${angle}\u00b0 V-bit (not among your bits)`, value: mine }] : items;
  };
  const ballChoices = () => ballItems.value.map((b) => ({ title: ballName(b.value) ?? b.title, value: `ball:${b.value}` }));
  const bullChoices = () => {
    const items = bullItems.value.map((b) => ({ title: b.title, value: `bull:${b.value}` }));
    return mine === 'bull:' ? [...items, { title: 'A bull nose (none of your bits is this one)', value: 'bull:' }] : items;
  };
  if (p.kind === 'grooves' || p.kind === 'frame') return veeItems();
  if (p.kind === 'flutes' || p.kind === 'dimples') return ballChoices();
  if (p.kind === 'ripples') return [...veeItems(), ...ballChoices(), ...bullChoices()];
  return [{ title: 'An end mill (square corners)', value: 'mill' }, ...bullChoices()];
});
/** The three sizes asked first, whatever the pattern: how far apart, how deep, how far in from the edges. */
const spacingLabel = computed(() => {
  const p = pattern.value;
  return p?.kind === 'grooves' ? 'About this far apart' : p?.kind === 'ripples' ? 'Line to line' : p?.kind === 'dimples' ? 'This far apart' : 'Middle to middle';
});

const words = computed(() => {
  const p = pattern.value;
  if (!p) return '';
  const wide = L(cutWidth(p));
  if (p.kind === 'flutes') return `Each flute comes ${wide} wide at the surface${p.reeded ? ', and they overlap: a ridge is left between each two' : ''}. Deeper than half the bit's width, its walls are straight above its round bottom. A taper ball with the same tip cuts them too. Untested: cut a scrap first.`;
  if (p.kind === 'ripples' && p.bit === 'bull') return `Each line is cut ${wide} wide where it is deepest: a flat floor between two round corners, rising to the surface between, and the line beside it is half a wave on${bullId.value ? '' : '. None of your bits is that bull nose: choose one of yours, or add it on the Shop page'}. Untested: cut a scrap first.`;
  if (p.kind === 'ripples') return `Each line is cut ${wide} wide where it is deepest and comes up to nothing between, and the line beside it is half a wave on: a woven look. The spacing follows the bit and the depth so the lines just meet; set it wider for plain ground between them. Untested: cut a scrap first.`;
  if (p.kind === 'dimples') return `Each dimple comes ${wide} across at the surface: one plunge of the ball nose. Untested: cut a scrap first.`;
  if (p.kind === 'channels') {
    if (!p.soft) return 'Flat-bottomed channels, cut with an end mill no wider than they are. Untested: cut a scrap first.';
    return `Cut in one pass with the bull nose, as wide as it: a flat floor between two round corners${bullId.value ? '' : '. None of your bits is that bull nose: choose one of yours, or add it on the Shop page'}. Untested: cut a scrap first.`;
  }

  return `Each groove comes ${wide} wide at the surface. In plywood a groove cuts through the face veneer: for paint. Untested: cut a scrap first.`;
});
</script>

<template>
  <v-row density="compact" data-test="front-pattern">
    <v-col cols="12">
      <div class="text-caption text-medium-emphasis mb-1">Pattern</div>
      <ChoiceTiles v-model="look" :items="looks" label="Pattern" size="small" name="pattern-look" />
    </v-col>
    <!-- A front's face with the pattern on it, as it is cut, beside the three sizes that matter most. -->
    <v-col v-if="face" cols="12" sm="5" class="d-flex justify-center" data-test="pattern-face">
      <div class="pattern-face"><TilePicture :drawing="face" /></div>
    </v-col>
    <v-col v-if="pattern" cols="12" :sm="face ? 7 : 12">
      <v-row density="compact">
        <v-col cols="12">
          <v-select v-model="bit" label="Cut with" :items="bitItems" hide-details no-data-text="None among your bits: add one on the Shop page" data-test="pattern-bit" />
        </v-col>
        <template v-if="frame">
          <v-col cols="12" :sm="face ? 12 : 4"><LengthField v-model="frame.inset" label="In from the edges" /></v-col>
          <v-col cols="12" :sm="face ? 12 : 4"><LengthField v-model="frame.depth" label="Groove depth" /></v-col>
          <v-col cols="12" :sm="face ? 12 : 4">
            <v-select v-model="frame.panels" label="Panels, one over another" :items="[1, 2, 3, 4, 5]" hide-details data-test="pattern-panels" />
          </v-col>
        </template>
        <template v-else-if="sized">
          <v-col cols="12" :sm="face ? 12 : 4"><LengthField v-model="sized.spacing" :label="spacingLabel" data-test="pattern-spacing" /></v-col>
          <v-col cols="12" :sm="face ? 12 : 4">
            <LengthField v-if="ripples" :model-value="ripples.depth" label="Deepest" @update:model-value="$event && respace({ depth: $event })" />
            <LengthField v-else v-model="sized.depth" label="Depth" data-test="pattern-depth" />
          </v-col>
          <v-col cols="12" :sm="face ? 12 : 4"><LengthField v-model="sized.margin" label="Border: in from the edges" data-test="pattern-margin" /></v-col>
        </template>
      </v-row>
    </v-col>
    <!-- The rest of a pattern's settings. -->
    <template v-if="pattern && !frame && !grooves">
      <v-col cols="12" class="text-caption text-medium-emphasis pb-0">More</v-col>
      <template v-if="flutes">
        <v-col cols="6"><v-select v-model="flutes.direction" label="Flutes run" :items="DIRECTIONS" hide-details data-test="pattern-direction" /></v-col>
        <v-col cols="6">
          <v-switch :model-value="!!flutes.reeded" label="Reeded (they overlap)" color="primary" density="compact" hide-details data-test="pattern-reeded" @update:model-value="setReeded(!!$event)" />
        </v-col>
        <v-col v-if="flutes.direction === 'vertical'" cols="6">
          <v-switch :model-value="!!flutes.wavy" label="Wavy" color="primary" density="compact" hide-details data-test="pattern-wavy" @update:model-value="flag('wavy', !!$event)" />
        </v-col>
      </template>
      <template v-if="ripples">
        <v-col cols="6"><v-select v-model="ripples.direction" label="Lines run" :items="DIRECTIONS" hide-details data-test="pattern-direction" /></v-col>
        <v-col cols="6"><LengthField v-model="ripples.wave" label="A rise and a fall every" /></v-col>
      </template>
      <template v-if="channels">
        <v-col cols="6"><v-select v-model="channels.direction" label="Channels run" :items="DIRECTIONS" hide-details data-test="pattern-direction" /></v-col>
        <v-col cols="6"><LengthField v-model="channels.width" label="Channel width" :disabled="!!channels.soft" /></v-col>
      </template>
    </template>
    <v-col v-if="pattern && pattern.kind !== 'frame' && frontStyle.kind === 'slab' && pattern.margin.mm > 0" cols="12">
      <v-switch
        :model-value="!!pattern.border"
        label="Carve the rectangle round it too (the same bit, the same depth)"
        color="primary"
        density="compact"
        hide-details
        data-test="pattern-border"
        @update:model-value="setBorder(!!$event)"
      />
    </v-col>
    <v-col v-if="pattern" cols="12" class="text-caption text-medium-emphasis" data-test="pattern-words">{{ words }}</v-col>
  </v-row>
</template>

<style scoped>
/* The face is tall and narrow: as high as the three fields beside it. */
.pattern-face {
  width: 100%;
  max-width: 190px;
  height: 250px;
}
</style>
