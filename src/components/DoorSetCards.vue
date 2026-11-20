<script setup lang="ts">
/**
 * The inputs of a door set: how the doors hang (layout, hinge, overlays) and their
 * style, in one panel that folds. The same whether the opening was measured or comes
 * from a designed cabinet. They edit the design they are given in place. On a frameless
 * cabinet the overlays are the cabinet's (`fixed`): shown, not typed. In a shop-style
 * cabinet (`inset`) the doors sit inside the opening and have their own style, kept
 * apart from the one they have in the other styles. On a designed cabinet (`shared`)
 * the hinge, the style and the pulls are the project's unless these doors have their
 * own copy, which the switch makes and drops; `design` is a view that reads and
 * writes whichever applies.
 */
import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import FoldCard from '@/components/FoldCard.vue';
import FrontStyleFields from '@/components/FrontStyleFields.vue';
import HandleFields from '@/components/HandleFields.vue';
import HelpText from '@/components/HelpText.vue';
import LengthField from '@/components/LengthField.vue';
import SubHead from '@/components/SubHead.vue';
import { FINGER_HOLE, frontDifferences, hasOwnFrontSettings, hingeFor, hingeOverlayMiss, isHinge, overlayReport, setOwnFrontSettings, shopDoorDefaults } from '@/design';
import type { DrawerFrontDesign, PullChoice } from '@/model';
import type { CabinetOpening, DoorSetDesign, Hinge, Length, Opening } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{ design: DoorSetDesign; opening: Opening; fixed?: CabinetOpening['fixedOverlay']; inset?: CabinetOpening['inset']; open?: boolean; shared?: boolean; /** The end of the door its handle is near. */ handleEnd?: 'top' | 'bottom' }>();
const store = useAppStore();
const L = computed(() => store.sizeLength);
const design = computed(() => props.design);
/** The hinge picker is told which doors, and which cabinet to come back to. */
const route = useRoute();
const picker = computed(() => ({ path: '/design/hinge', query: { doors: design.value.id, ...(route?.query.cabinet ? { cabinet: route.query.cabinet } : {}) } }));

const hinge = computed<Hinge | undefined>(() => {
  try {
    return hingeFor(design.value.mounting, props.opening.cabinetType, store.shop.hardware);
  } catch {
    return undefined;
  }
});
const own = computed({
  get: () => hasOwnFrontSettings(design.value),
  set: (on: boolean) => setOwnFrontSettings(store.project!, design.value.id, on),
});
const asLength = (mm: number): Length => ({ mm, unit: 'in' });
/** On a designed cabinet the settings are edited in Setup, or here once these doors have their own copy. */
const editable = computed(() => !props.shared || own.value);
const differs = computed(() => (props.shared ? frontDifferences(store.project!, design.value.id) : []));
const handleName = computed(() => store.shop.hardware.find((h) => h.id === design.value.handle?.handleId)?.name.toLowerCase());
/**
 * What the style fields edit: the door set itself, or its shop doors when inset. Those
 * start as slab doors from the case material and are stored once they are looked at.
 */
const front = computed<DrawerFrontDesign>(() => (props.inset ? (design.value.shop ?? shopDoorDefaults(props.inset.frontMaterialId)) : design.value));
watchEffect(() => {
  if (props.inset && !design.value.shop) design.value.shop = shopDoorDefaults(props.inset.frontMaterialId);
});
/** How far the cabinet's side overlay is beyond what the hinge can be adjusted to. */
const hingeMiss = computed(() =>
  props.fixed && hinge.value ? hingeOverlayMiss({ ...design.value.mounting, overlaySide: asLength(props.fixed.side) }, hinge.value) : 0,
);
const hingeFacts = computed(() => {
  const h = hinge.value;
  if (!h) return '';
  const facts = [
    h.close ? `${h.close} close` : null,
    h.attachment === 'screwOn' ? 'screw-on' : h.attachment === 'pressIn' ? 'press-in' : null,
    h.openingAngleDeg ? `${h.openingAngleDeg}°` : null,
  ].filter(Boolean);
  return facts.length ? facts.join(' · ') : 'Generic: design now, pick a product later';
});

/** Reverse mode: what the existing doors' overlay is, and what the chosen hinge does to the door width. */
const matched = computed(() => {
  const doors = props.opening.existingDoors;
  if (!doors || !hinge.value) return null;
  let r;
  try {
    r = overlayReport(design.value, props.opening, store.shop.hardware);
  } catch {
    return null;
  }
  if (!r.current) return null;
  const names = [...new Set(r.suggestedHingeIds.map((id) => store.shop.hardware.filter(isHinge).find((h) => h.id === id)!.overlay.mm))];
  const grow = (hinge.value.overlay.mm - r.current.side) * (2 / design.value.mounting.doors);
  const change = Math.abs(grow) < 0.01 ? 'doors stay the same width' : `doors ${grow > 0 ? 'grow' : 'shrink'} ${L.value(Math.abs(grow))} each`;
  return (
    `${L.value(doors.widthAcross.mm)} across, ${L.value(doors.height.mm)} tall gives ${L.value(r.current.side)} side overlay ` +
    `and ${L.value(r.current.top)} top and bottom. Nearest hinge: ${names.map((n) => L.value(n)).join(' or ')}; ` +
    `with the chosen ${L.value(hinge.value.overlay.mm)} hinge, ${change}.`
  );
});

const PULLS: { title: string; value: PullChoice }[] = [
  { title: 'Fitted by hand (nothing cut)', value: 'byHand' },
  { title: 'Finger hole, cut on the CNC', value: 'fingerPull' },
];
const pull = computed({
  get: (): PullChoice => design.value.shopPull ?? 'byHand',
  set: (value: PullChoice) => {
    if (value === 'fingerPull') design.value.shopPull = value;
    else delete design.value.shopPull;
  },
});

const layout = computed({
  get: () => design.value.mounting.doors,
  set: (doors: 1 | 2) => {
    design.value.mounting.doors = doors;
    if (doors === 1 && !design.value.mounting.hingeSide) design.value.mounting.hingeSide = 'left';
  },
});
/** The panel's one line while it is folded. */
const summary = computed(() => {
  const d = design.value;
  const f = front.value;
  const material = store.materials.find((m) => m.id === f.materialId);
  return [
    d.mounting.doors === 2 ? 'Pair' : 'Single',
    ...(props.inset ? ['inset'] : []),
    hinge.value?.name ?? 'no hinge chosen',
    f.style.kind === 'shaker' ? 'shaker' : 'slab',
    ...(props.inset && design.value.shopPull === 'fingerPull' ? ['finger holes'] : design.value.handle ? [store.shop.hardware.find((h) => h.id === design.value.handle?.handleId)?.name.toLowerCase() ?? 'handles'] : []),
    material ? `${L.value(material.nominalThickness.mm)} ${material.name}` : f.materialId,
  ].join(' · ');
});
</script>

<template>
  <FoldCard icon="doors" :title="design.name || 'Doors'" :name="`doors:${design.id}`" :summary="summary" :open="open">
    <v-row density="compact">
      <v-col cols="6"><v-select v-model="layout" label="Layout" :items="[{ title: 'Pair', value: 2 }, { title: 'Single', value: 1 }]" /></v-col>
      <v-col cols="6">
        <LengthField v-if="layout === 2" v-model="design.mounting.gap" label="Center gap" />
        <v-select v-else v-model="design.mounting.hingeSide" label="Hinge side" :items="[{ title: 'Left', value: 'left' }, { title: 'Right', value: 'right' }]" />
      </v-col>
    </v-row>
    <template v-if="shared">
      <div class="text-body-2 mt-2" data-test="doors-follow">
        <template v-if="differs.length">Differs from Setup: {{ differs.join(', ') }}.</template>
        <template v-else-if="own">Their own copy of Setup's hinge, style and handles, the same as Setup's for now.</template>
        <template v-else>The hinge, the style and the handles follow Setup: {{ hinge?.name ?? 'no hinge' }}, {{ front.style.kind }}{{ handleName ? `, ${handleName}` : '' }}.</template>
      </div>
      <v-btn v-if="!own" variant="text" size="small" color="primary" class="mb-2" data-test="own-doors" @click="own = true">Make these doors different</v-btn>
      <v-btn v-else variant="text" size="small" class="mb-2" data-test="follow-setup-doors" @click="own = false">Follow Setup again</v-btn>
    </template>
    <div class="text-caption text-medium-emphasis mt-3 mb-1">Hinge</div>
    <v-sheet border rounded="lg" class="pa-3 d-flex align-center mb-3">
      <div class="flex-grow-1">
        <div>{{ hinge?.name ?? 'No hinge chosen' }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ hingeFacts }}</div>
      </div>
      <v-btn v-if="editable" :to="picker" variant="text" color="primary">Change</v-btn>
    </v-sheet>
    <template v-if="fixed && inset">
      <v-row density="compact">
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.side)" label="Side gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.top)" label="Top gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.bottom)" label="Bottom gap" disabled /></v-col>
      </v-row>
      <HelpText>
        Inset: the doors sit inside the opening, flush with the front edges of the case, with the cabinet's gap all round. Where
        another front is their neighbour above or below, each takes half of the one gap between them. The hinge's cups are bored
        in the doors and its plates' holes drilled in the case sides, both on the CNC; the generic hinge's numbers are unchecked
        until a real hinge's sheet is used.
      </HelpText>
      <v-alert v-if="hingeMiss > 0.01 && hinge" type="warning" variant="tonal" density="compact" class="mt-3">
        The gap at the sides is {{ L(-fixed.side) }}; this hinge leaves {{ L(-hinge.overlay.mm) }} and adjusts {{ hinge.sideAdjust ?? 0 }} mm
        either way. Change the cabinet's gap or choose another hinge.
      </v-alert>
    </template>
    <template v-else-if="fixed && fixed.side < 0">
      <!-- Between corner posts: the doors are inset in the frame, a gap all round. -->
      <v-row density="compact">
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.side)" label="Side gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.top)" label="Top gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.bottom)" label="Bottom gap" disabled /></v-col>
      </v-row>
      <HelpText>
        Inset: the doors sit in their opening between the posts and the rails, flush with their faces, with that gap all round.
        Their hinges are not worked out yet (tune me): no cups are bored, and they are hung by hand.
      </HelpText>
    </template>
    <template v-else-if="fixed">
      <v-row density="compact">
        <v-col cols="4"><LengthField :model-value="asLength(fixed.side)" label="Side overlay" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(fixed.top)" label="Top overlay" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(fixed.bottom)" label="Bottom overlay" disabled /></v-col>
      </v-row>
      <HelpText>
        Full overlay: the doors cover the case front, less the cabinet's reveal and front gap. A negative overlay means the door
        stops short of the opening's edge, where another front is its neighbour.
      </HelpText>
      <v-alert v-if="hingeMiss > 0.01 && hinge" type="warning" variant="tonal" density="compact" class="mt-3">
        The side overlay is {{ L(fixed.side) }}; this hinge gives {{ L(hinge.overlay.mm) }} and adjusts {{ hinge.sideAdjust ?? 0 }} mm
        either way. Change the reveal or choose another hinge.
      </v-alert>
    </template>
    <v-row v-else density="compact">
      <v-col cols="6"><LengthField v-model="design.mounting.overlayTop" label="Top overlay" /></v-col>
      <v-col cols="6"><LengthField v-model="design.mounting.overlayBottom" label="Bottom overlay" /></v-col>
    </v-row>
    <v-alert v-if="matched" color="primary" variant="tonal" class="mt-4" title="Matched from existing doors">{{ matched }}</v-alert>
    <template v-if="editable">
    <SubHead>Door style</SubHead>
    <FrontStyleFields :front="front" />
    </template>
    <template v-if="inset && editable">
      <SubHead>Pulls</SubHead>
      <v-select v-model="pull" label="Pulls" :items="PULLS" hide-details data-test="door-pull" />
      <HelpText>
        <template v-if="pull === 'fingerPull'">
          A {{ L(FINGER_HOLE.diameter) }} finger hole through each door, {{ L(FINGER_HOLE.fromEdge) }} in from the edge it opens at and
          {{ L(FINGER_HOLE.fromTop) }} down from its top (tune me). It is bored from the back with the hinge cups, so the doors are not
          flipped for it. Ease its edges by hand.
        </template>
        <template v-else>No finger hole: choose a handle below, or fit one by hand afterwards.</template>
      </HelpText>
    </template>
    <template v-if="editable && !(inset && pull === 'fingerPull')">
      <SubHead>Handles</SubHead>
      <HandleFields :design="design" :end="handleEnd" />
    </template>
  </FoldCard>
</template>
