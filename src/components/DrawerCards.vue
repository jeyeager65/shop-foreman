<script setup lang="ts">
import MaterialSelect from '@/components/MaterialSelect.vue';
/**
 * The inputs of a drawer in one panel that folds: its front (how far it laps over the
 * drawer opening, and its style), the slide it runs on and its box.
 * Edits the design it is given in place. On a frameless cabinet the overlays are
 * the cabinet's (`fixed`): shown, not typed. In a shop-style cabinet (`inset`) the
 * drawer has no front of its own: the front of its box is the front, wide or plain.
 * On a designed cabinet (`shared`) how the front is made, the slide, the box's corners
 * and materials are the project's unless this drawer has its own copy, which the
 * switch makes and drops; `design` is a view that reads and writes whichever applies.
 * The overlays, the slide's length and the box's height are always the drawer's own.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import FoldCard from '@/components/FoldCard.vue';
import FrontStyleFields from '@/components/FrontStyleFields.vue';
import HandleFields from '@/components/HandleFields.vue';
import HelpText from '@/components/HelpText.vue';
import FingerSizeFields from '@/components/FingerSizeFields.vue';
import LengthField from '@/components/LengthField.vue';
import SubHead from '@/components/SubHead.vue';
import {
  BOX_CLEAR_OVER,
  BOX_CLEAR_UNDER,
  BOX_GROOVE_DEPTH,
  BOX_GROOVE_UP,
  BOX_RABBET_DEPTH,
  BUILD_OUT_HEIGHT,
  FINGER_NOTCH,
  FRONT_SCREW_HOLE,
  RUNNER_BACK_CLEARANCE,
  RUNNER_HEIGHT,
  RUNNER_SIDE_CLEARANCE,
  RUNNER_TOP_CLEARANCE,
  WIDE_FRONT_DADO_DEPTH,
  FALSE_FRONT,
  type DrawerBox,
  drawerBox,
  drawerFrontSize,
  drawerSideOverlay,
  doorsBeside,
  drawerSlide,
  frontDifferences,
  hasOwnFrontSettings,
  mountedDesigns,
  setOwnFrontSettings,
  type SlideFit,
  slideMountWords,
} from '@/design';
import type { BoxCornerJoint, CabinetOpening, DrawerDesign, FaceFrameSlideMount, Length, Opening, PullChoice, ShopDrawerFront } from '@/model';
import { useAppStore } from '@/stores/app';
import { wideFrontFields } from '@/components/wideFront';

/** `frontOnly`: the drawer is in a cabinet that is already there, and only its front is made. */
const props = defineProps<{ design: DrawerDesign; opening: Opening; fixed?: CabinetOpening['fixedOverlay']; inset?: CabinetOpening['inset']; shared?: boolean; frontOnly?: boolean; overDoors?: boolean; /** What its false front's tray cannot do. */ problems?: string[] }>();
const store = useAppStore();
const L = computed(() => store.sizeLength);
const design = computed(() => props.design);
/** A false front: offered on the top row over doors only, a front with no box and no slides. */
const isFalse = computed(() => !!props.overDoors && !!design.value.falseFront);
const falseOn = computed({
  get: () => isFalse.value,
  set: (on: boolean) => {
    if (on) design.value.falseFront = {};
    else delete design.value.falseFront;
  },
});
const tiltOn = computed({
  get: () => !!design.value.falseFront?.tiltOut,
  set: (on: boolean) => {
    if (!design.value.falseFront) return;
    if (on) design.value.falseFront.tiltOut = { depth: { mm: FALSE_FRONT.trayDepth.start, unit: 'in' } };
    else delete design.value.falseFront.tiltOut;
  },
});
/** Behind a face frame a fixed false front is screwed through the stiles: an overlay front whose overlays are typed has one. */
const hasFrame = computed(() => !props.fixed && !props.inset);
/** The slide picker is told which drawer, and which cabinet to come back to. */
const route = useRoute();
const picker = computed(() => ({ path: '/design/slide', query: { drawer: design.value.id, ...(route?.query.cabinet ? { cabinet: route.query.cabinet } : {}) } }));

const own = computed({
  get: () => hasOwnFrontSettings(design.value),
  set: (on: boolean) => setOwnFrontSettings(store.project!, design.value.id, on),
});
/** On a designed cabinet the settings are edited in Setup, or here once this drawer has its own copy. */
const editable = computed(() => !props.shared || own.value);
const differs = computed(() => (props.shared ? frontDifferences(store.project!, design.value.id) : []));
/** The doors and drawers on the cabinet's openings: not the ones kept for a row the layout no longer has. */
const mounted = computed(() => mountedDesigns(store.project!, store.materials));
const side = computed(() => drawerSideOverlay(design.value, mounted.value, store.shop.hardware));
const asLength = (mm: number): Length => ({ mm, unit: 'in' });
const size = computed(() => {
  const f = props.fixed;
  if (!f) return drawerFrontSize(design.value, props.opening, side.value.overlay);
  const hung = { ...design.value, mounting: { ...design.value.mounting, overlayTop: asLength(f.top), overlayBottom: asLength(f.bottom) } };
  return drawerFrontSize(hung, props.opening, f.side);
});

/** On: no value of its own, so the front's sides follow the doors' hinge overlay. */
const matchDoors = computed({
  get: () => side.value.from === 'doors',
  set: (on: boolean) => {
    if (on) delete design.value.mounting.overlaySide;
    else design.value.mounting.overlaySide = asLength(side.value.overlay);
  },
});
const setSide = (value: Length | null) => {
  if (value) design.value.mounting.overlaySide = value;
};
/** How far its own side overlay puts the front's edges from the doors' edges. */
/** The drawer's slide at its length; nothing when the drawer is not on a designed cabinet. */
const slide = computed<SlideFit | undefined>(() => {
  // A drawer on runners has no slide; one that is already there keeps its own.
  if (props.frontOnly || isFalse.value || (props.inset && design.value.shop?.front === 'runners')) return undefined;
  try {
    return drawerSlide(design.value, store.project!, store.jobShop);
  } catch {
    return undefined;
  }
});
/** 'auto' (the longest that fits) or one of the slide's lengths, by its mm. */
const slideLength = computed({
  get: () => (slide.value?.from === 'chosen' ? slide.value.length.mm : 'auto'),
  set: (value: 'auto' | number) => {
    const picked = slide.value?.options.find((o) => o.length.mm === value);
    if (picked) design.value.slide.length = { ...picked.length };
    else delete design.value.slide.length;
  },
});
const slideLengths = computed(() => {
  const s = slide.value;
  if (!s) return [];
  const longest = s.options.filter((o) => o.fits).at(-1);
  return [
    { title: longest ? `Longest that fits (${L.value(longest.length.mm)})` : 'Longest that fits (none does)', value: 'auto' as const },
    ...s.options.map((o) => ({ title: `${L.value(o.length.mm)}${o.fits ? '' : ' (too long)'}`, value: o.length.mm })),
  ];
});
/** Shop style: how the front of the box is made, and what a wide front is cut from. */
const SHOP_FRONTS: { title: string; value: ShopDrawerFront }[] = [
  { title: 'Wide front (hides the slides)', value: 'wide' },
  { title: 'Plain box (gaps show beside it)', value: 'plain' },
  { title: 'On runners (no slides)', value: 'runners' },
  { title: 'Applied front (its own front, screwed to the box)', value: 'applied' },
];
const shopFront = computed({
  get: (): ShopDrawerFront => design.value.shop?.front ?? 'wide',
  set: (front: ShopDrawerFront) => {
    design.value.shop = { ...design.value.shop, front };
  },
});
const PULLS: { title: string; value: PullChoice }[] = [
  { title: 'Fitted by hand (nothing cut)', value: 'byHand' },
  { title: 'Finger notch, cut on the CNC', value: 'fingerPull' },
];
const shopPull = computed({
  get: (): PullChoice => design.value.shop?.pull ?? 'byHand',
  set: (pull: PullChoice) => {
    design.value.shop = { ...design.value.shop, pull };
  },
});
/** A wide front's style, edge and material, as the style fields edit them: its own, kept in the drawer's `shop`. */
const wideFront = wideFrontFields(() => design.value, () => props.inset?.frontMaterialId ?? design.value.box.materials.boxId);
/** A finger notch would cut a shaker front's top rail: it is not offered with one. */
const pulls = computed(() => (shopFront.value === 'wide' && design.value.shop?.style?.kind === 'shaker' ? PULLS.filter((p) => p.value !== 'fingerPull') : PULLS));
const MOUNTS: { title: string; value: FaceFrameSlideMount }[] = [
  { title: 'Build-out strips on the case sides', value: 'strips' },
  { title: 'Rear mounting brackets', value: 'rearBrackets' },
];
const CORNERS: { title: string; value: BoxCornerJoint }[] = [
  { title: 'Rabbets in the sides', value: 'rabbet' },
  { title: 'Pocket screws', value: 'pocketScrews' },
  { title: 'Finger joints (tabs and slots, cut on the CNC)', value: 'tabs' },
];

/** The box at its derived size, or why it cannot be made. */
const boxResult = computed<{ box?: DrawerBox; error?: string }>(() => {
  try {
    return { box: drawerBox(design.value, store.project!, store.jobShop) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});
const box = computed(() => boxResult.value.box);
const boxError = computed(() => boxResult.value.error);
/** On: the drawer has its own box height. Off: the opening's height less the clearances. */
const ownHeight = computed({
  get: () => design.value.box.height !== undefined,
  set: (on: boolean) => {
    if (!on) delete design.value.box.height;
    else if (box.value) design.value.box.height = asLength(box.value.size.height);
    else design.value.box.height = asLength(Math.max(0, props.opening.height.mm - BOX_CLEAR_UNDER - BOX_CLEAR_OVER));
  },
});
const setHeight = (value: Length | null) => {
  if (value && ownHeight.value) design.value.box.height = value;
};

/** The style, edge and material of the doors on the same cabinet, as text to compare and copy. */
const doors = computed(() => doorsBeside(design.value, mounted.value));
const styleOf = (f: { style: unknown; outsideEdge: unknown; materialId: string }) =>
  JSON.stringify({ style: f.style, outsideEdge: f.outsideEdge, materialId: f.materialId });
const doorStyle = computed(() => (doors.value ? styleOf(doors.value) : undefined));
function copyDoorStyle() {
  if (doorStyle.value) Object.assign(design.value.front, JSON.parse(doorStyle.value));
}
/** On: the front's style is the doors', and follows them while this screen is open. It starts on when the two match. */
const following = ref(doorStyle.value !== undefined && doorStyle.value === styleOf(design.value.front));
const sameAsDoors = computed({
  get: () => following.value && doorStyle.value !== undefined,
  set: (on: boolean) => {
    following.value = on;
    if (on) copyDoorStyle();
  },
});
watch(doorStyle, () => {
  if (following.value) copyDoorStyle();
});

/** The panel's one line while it is folded. */
const summary = computed(() =>
  isFalse.value ? `False front ${L.value(size.value.width)} × ${L.value(size.value.height)}${design.value.falseFront?.tiltOut ? ', tips out with a tray' : ', fixed'}` :
  [
    props.inset && design.value.shop?.front === 'applied'
      ? `Front ${L.value(size.value.width)} × ${L.value(size.value.height)}, inset`
      : props.inset
      ? box.value?.wideFront
        ? `Wide front ${L.value(box.value.wideFront.width)} × ${L.value(box.value.wideFront.height)}`
        : box.value?.runners
          ? 'Box as the front'
          : 'Plain box'
      : `Front ${L.value(size.value.width)} × ${L.value(size.value.height)}`,
    slide.value ? `${L.value(slide.value.length.mm)} slides` : box.value?.runners ? 'on runners' : undefined,
    box.value?.fingerPull ? 'finger pull' : undefined,
    box.value ? `box ${L.value(box.value.size.width)} × ${L.value(box.value.size.length)} × ${L.value(box.value.size.height)}` : boxError.value ? 'box cannot be made' : undefined,
  ]
    .filter(Boolean)
    .join(' · '),
);
const offDoors = computed(() => (side.value.from === 'own' && side.value.doors !== undefined ? side.value.overlay - side.value.doors : 0));
</script>

<template>
  <FoldCard icon="doors" :title="design.name || 'Drawer'" :name="`drawer:${design.id}`" :summary="summary">
    <template v-if="shared">
      <div class="text-body-2" data-test="drawer-follows">
        <template v-if="differs.length">Differs from Setup: {{ differs.join(', ') }}.</template>
        <template v-else-if="own">Its own copy of Setup's front, handle, slide and box, the same as Setup's for now.</template>
        <template v-else-if="frontOnly || isFalse">How the front is made and its handle follow Setup.</template>
        <template v-else>How the front is made, its handle, the slide and the box corners and materials follow Setup.</template>
      </div>
      <v-btn v-if="!own" variant="text" size="small" color="primary" class="mb-2" data-test="own-drawer" @click="own = true">Make this drawer different</v-btn>
      <v-btn v-else variant="text" size="small" class="mb-2" data-test="follow-setup-drawer" @click="own = false">Follow Setup again</v-btn>
    </template>
    <template v-if="overDoors">
      <v-switch v-model="falseOn" label="A false front (no box, no slides)" color="primary" density="compact" hide-details data-test="false-front" />
      <template v-if="isFalse">
        <v-switch v-model="tiltOn" label="Tips out, with a tray behind it" color="primary" density="compact" hide-details data-test="false-front-tilt" />
        <v-row v-if="design.falseFront?.tiltOut" density="compact">
          <v-col cols="4"><LengthField v-model="design.falseFront.tiltOut.depth" label="Tray, deep" /></v-col>
        </v-row>
        <v-alert v-for="p in problems ?? []" :key="p" type="warning" variant="tonal" density="compact" class="mt-2" data-test="false-front-problem">{{ p }}</v-alert>
        <HelpText>
          <template v-if="design.falseFront?.tiltOut">
            It hangs on a pair of tilt-out hinges and tips forward. A shallow tray is screwed to its back, {{ L(FALSE_FRONT.trayNarrower) }}
            narrower and {{ L(FALSE_FRONT.trayShorter) }} shorter than the opening but no taller than {{ L(FALSE_FRONT.trayTall) }},
            {{ L(FALSE_FRONT.trayDepth.min) }} to {{ L(FALSE_FRONT.trayDepth.max) }} deep (tune me): shallower than asked where a sink's
            bowl or the trap stands close behind it. The hinges are on the hardware list.
          </template>
          <template v-else>
            Fixed: it is screwed from behind, through {{ hasFrame ? "the face frame's stiles" : 'a block screwed to each case side' }}.
          </template>
        </HelpText>
      </template>
    </template>
    <template v-if="inset && isFalse">
      <v-row v-if="fixed" density="compact" class="mt-1">
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.side)" label="Side gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.top)" label="Top gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.bottom)" label="Bottom gap" disabled /></v-col>
      </v-row>
      <div class="text-body-2 mt-3">One front, {{ L(size.width) }} × {{ L(size.height) }}, inset in its opening, flush with the case front.</div>
    </template>
    <template v-else-if="inset">
      <v-row v-if="editable" density="compact">
        <v-col cols="12"><v-select v-model="shopFront" label="Front" :items="SHOP_FRONTS" hide-details data-test="shop-front" /></v-col>
        <v-col v-if="shopFront !== 'applied'" cols="12"><v-select v-model="shopPull" label="Pull" :items="pulls" hide-details data-test="drawer-pull" /></v-col>
      </v-row>
      <template v-if="editable && shopFront === 'wide'">
        <SubHead>Front style</SubHead>
        <FrontStyleFields :front="wideFront" material-label="Front material" />
      </template>
      <template v-if="shopFront === 'applied' && fixed">
        <v-row density="compact" class="mt-1">
          <v-col cols="4"><LengthField :model-value="asLength(-fixed.side)" label="Side gap" disabled /></v-col>
          <v-col cols="4"><LengthField :model-value="asLength(-fixed.top)" label="Top gap" disabled /></v-col>
          <v-col cols="4"><LengthField :model-value="asLength(-fixed.bottom)" label="Bottom gap" disabled /></v-col>
        </v-row>
      </template>
      <div class="text-body-2 mt-3">
        <template v-if="shopFront === 'applied'">
          One front, {{ L(size.width) }} × {{ L(size.height) }}. Inset: it sits in its opening, flush with the front edges of the
          case, with that gap all round (half of it to a front above or below), screwed to its box from inside.
        </template>
        <template v-else-if="box?.wideFront">
          The front of the box is the drawer's front: {{ L(box.wideFront.width) }} × {{ L(box.wideFront.height) }}, the opening less the
          cabinet's gap, flush with the case front.
        </template>
        <template v-else-if="box?.runners">
          The box itself is the front and fills the opening: {{ L(box.size.width) }} × {{ L(box.size.height) }}, flush with the case
          front. It slides on {{ box.runners.on === 'caseBottom' ? 'the case bottom' : 'a runner strip on each side' }}.
        </template>
        <template v-else-if="box">
          The box itself is the front: {{ L(box.size.width) }} × {{ L(box.size.height) }}, flush with the case front, with the slides'
          clearance showing at each side.
        </template>
      </div>
      <HelpText>
        <template v-if="shopFront === 'wide'">
          The wide front hides the slides. The box sides sit in dados in its back face, {{ L(box?.wideFront?.dadoDepth ?? WIDE_FRONT_DADO_DEPTH) }}
          deep (tune me) and stopped short of its top and bottom edges, glued; the bottom's groove runs between them. No screws
          hold a front on, so there are none on the hardware list.
          <template v-if="box?.wideFront?.decorated">
            Its style is cut into its outside face and the dados into its back, so it is cut with the doors; where the
            CNC cuts both faces the sheet is turned over on pins for it.
          </template>
        </template>
        <template v-else-if="shopFront === 'applied'">
          The box is a plain one on slides, as wide as they allow, and starts behind the front. Fit the front to its opening
          on spacers once the box is hung, then screw it on from inside the box: its screws are on the hardware list.
        </template>
        <template v-else-if="shopFront === 'runners'">
          No slides. The box is {{ L(2 * RUNNER_SIDE_CLEARANCE) }} narrower than the opening, {{ L(RUNNER_TOP_CLEARANCE) }} lower than what is
          over it and {{ L(RUNNER_BACK_CLEARANCE) }} shorter than the case is deep (all tune me).
          <template v-if="box?.runners?.on === 'strips'">
            It slides on a strip of the case material on each side, {{ L(RUNNER_HEIGHT) }} tall, glued and screwed to the side under
            it; the strips are on the saw cut list.
          </template>
          <template v-else>It slides on the case bottom.</template>
          <template v-if="box?.runners?.under === 'stretcher'">The front stretcher over it keeps it from tipping as it is pulled out.</template>
          <template v-else-if="box?.runners?.under === 'runnersAbove'">The runners of the drawer above keep it from tipping as it is pulled out.</template>
          <template v-else-if="box?.runners">A pair of kicker strips over it, like the runners, keeps it from tipping as it is pulled out.</template>
          Stops at the back, fitted by hand, set its front flush. Wax the runners.
        </template>
        <template v-else>The plain box is the same box as behind an applied front, without the holes for the front's screws.</template>
        <template v-if="shopFront === 'applied'" />
        <template v-else-if="shopPull === 'fingerPull'">
          The finger pull is a notch in the top edge of the front, {{ L(FINGER_NOTCH.width) }} wide and {{ L(FINGER_NOTCH.depth) }} deep
          (tune me), cut with the front's outline; the bit leaves its radius in the notch's corners. Ease its edges by hand.
        </template>
        <template v-else>No finger pull: choose a handle below, or fit one by hand afterwards.</template>
      </HelpText>
    </template>
    <template v-else-if="fixed && fixed.side < 0">
      <!-- Between corner posts: the front is inset in the frame, a gap all round. -->
      <v-row density="compact">
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.side)" label="Side gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.top)" label="Top gap" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(-fixed.bottom)" label="Bottom gap" disabled /></v-col>
      </v-row>
      <div class="text-body-2 mt-3">
        One front, {{ L(size.width) }} × {{ L(size.height) }}. Inset: it sits in its opening between the posts and the rails, flush
        with their faces, with that gap all round.
      </div>
    </template>
    <template v-else-if="fixed">
      <v-row density="compact">
        <v-col cols="4"><LengthField :model-value="asLength(fixed.side)" label="Side overlay" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(fixed.top)" label="Top overlay" disabled /></v-col>
        <v-col cols="4"><LengthField :model-value="asLength(fixed.bottom)" label="Bottom overlay" disabled /></v-col>
      </v-row>
      <div class="text-body-2 mt-3">
        One front, {{ L(size.width) }} × {{ L(size.height) }}. Full overlay: it covers the case front, less the cabinet's reveal and
        front gap.
      </div>
    </template>
    <template v-else>
      <v-switch
        v-if="side.doors !== undefined"
        v-model="matchDoors"
        label="Side overlay matches the doors"
        color="primary"
        density="compact"
        hide-details
        class="mb-2"
      />
      <v-row density="compact">
        <v-col cols="4">
          <LengthField v-if="matchDoors" :model-value="asLength(side.overlay)" label="Side overlay" disabled />
          <LengthField v-else :model-value="design.mounting.overlaySide ?? asLength(side.overlay)" label="Side overlay" @update:model-value="setSide" />
        </v-col>
        <v-col cols="4"><LengthField v-model="design.mounting.overlayTop" label="Top overlay" /></v-col>
        <v-col cols="4"><LengthField v-model="design.mounting.overlayBottom" label="Bottom overlay" /></v-col>
      </v-row>
      <div class="text-body-2 mt-3">
        One front, {{ L(size.width) }} × {{ L(size.height) }}: the drawer opening plus its overlays.
        <template v-if="side.from === 'doors'">Its sides line up with the doors.</template>
      </div>
      <v-alert v-if="Math.abs(offDoors) > 0.01" type="warning" variant="tonal" density="compact" class="mt-3">
        The front's sides stand {{ L(Math.abs(offDoors)) }} {{ offDoors > 0 ? 'outside' : 'inside' }} the doors' edges: the doors' hinge
        gives {{ L(side.doors!) }} of side overlay.
      </v-alert>
    </template>

    <div v-if="frontOnly" class="text-body-2 text-medium-emphasis mt-3" data-test="drawer-front-only">
      Only this front is made: the drawer's box and its slides are already there and stay. The new front is screwed to the box from inside.
    </div>
    <template v-if="!frontOnly && !isFalse && (slide || box?.runners || (inset && boxError))">
      <template v-if="slide">
      <SubHead>Slide</SubHead>
      <v-sheet border rounded="lg" class="pa-3 d-flex align-center mb-3">
        <div class="flex-grow-1">
          <div>{{ slide.slide.name }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ slideMountWords(slide.slide) }}, {{ L(slide.slide.sideClearance.mm) }} clearance each side ·
            {{ slide.slide.holes?.length ? 'screw holes drilled on the CNC' : 'no hole data: screwed on by hand' }}
          </div>
        </div>
        <v-btn v-if="editable" :to="picker" variant="text" color="primary">Change</v-btn>
      </v-sheet>
      <v-row density="compact">
        <v-col cols="12"><v-select v-model="slideLength" label="Slide length" :items="slideLengths" hide-details /></v-col>
        <v-col v-if="opening.cabinetType === 'faceFrame' && editable" cols="12">
          <v-select v-model="design.slide.faceFrameMount" label="Behind the face frame" :items="MOUNTS" hide-details />
        </v-col>
      </v-row>
      <div class="text-body-2 mt-3">{{ L(slide.length.mm) }} slides in {{ L(slide.room) }} of clear depth.</div>
      <HelpText>
        A slide needs its length plus {{ slide.slide.rearClearance }} mm of clear depth.
        <template v-if="box?.mount === 'strips'">
          The stiles stand {{ L(box.stripThickness! + (box.shim?.thickness ?? 0)) }} inside the case sides, so each slide sits on a
          build-out strip {{ L(box.stripThickness!) }} thick and {{ L(BUILD_OUT_HEIGHT) }} tall (tune me), glued and screwed to the
          case side.
          <template v-if="box.shim">
            {{ box.shim.perStrip }} short 3D-printed shims on the face of each strip, {{ store.cncLength(box.shim.thickness) }}
            thick and {{ L(box.shim.length) }} long (tune me), under the slide's screws, bring the slide flush with the opening.
          </template>
          <template v-else>The strip is flush with the opening.</template>
        </template>
        <template v-if="box?.mount === 'rearBrackets'">
          Each slide fixes to the back of the face frame at the front and to a rear bracket on the
          {{ box.bracketOn === 'nailer' ? 'front of the nailer' : 'cabinet back' }}. No strips; the brackets go on the hardware list.
        </template>
      </HelpText>
      <v-alert v-if="!slide.fits" type="warning" variant="tonal" density="compact" class="mt-3">
        A {{ L(slide.length.mm) }} slide needs {{ L(slide.length.mm + slide.slide.rearClearance) }} of clear depth and the cabinet has
        {{ L(slide.room) }}. Choose a shorter length or make the cabinet deeper.
      </v-alert>
      </template>

      <SubHead>Box</SubHead>
      <v-row density="compact">
        <v-col v-if="editable" cols="12"><v-select v-model="design.box.cornerJoint" label="Corner joints" :items="CORNERS" hide-details /></v-col>
        <v-col v-if="editable && design.box.cornerJoint === 'tabs'" cols="12"><FingerSizeFields :box="design.box" /></v-col>
        <v-col cols="6">
          <LengthField :model-value="design.box.height ?? (box ? asLength(box.size.height) : null)" label="Box height" :disabled="!ownHeight" @update:model-value="setHeight" />
        </v-col>
        <v-col cols="6">
          <v-switch v-model="ownHeight" label="Own height" color="primary" density="compact" hide-details />
        </v-col>
        <template v-if="editable">
          <v-col cols="6"><MaterialSelect v-model="design.box.materials.boxId" label="Box material" use="drawers" hide-details /></v-col>
          <v-col cols="6"><MaterialSelect v-model="design.box.materials.bottomId" label="Bottom material" use="backs" hide-details /></v-col>
        </template>
      </v-row>
      <v-alert v-if="boxError" type="error" variant="tonal" density="compact" class="mt-3">{{ boxError }}</v-alert>
      <template v-if="box">
        <div class="text-body-2 mt-3">
          The box is {{ L(box.size.width) }} wide × {{ L(box.size.length) }} long × {{ L(box.size.height) }} tall.
        </div>
        <HelpText>
          <template v-if="box.runners">The box is sized to the opening: see the front above.</template>
          <template v-else>
          The width is the opening less the slide's clearance each side and the length is the slide's<template v-if="box.heightFrom === 'opening'"
            >; the height is the opening's less {{ L(BOX_CLEAR_UNDER) }} under it and {{ L(BOX_CLEAR_OVER) }} over it (tune me)</template
          >.
          </template>
          <template v-if="design.box.cornerJoint === 'rabbet'">
            A rabbet {{ L(BOX_RABBET_DEPTH) }} deep (tune me) at {{ box.front === 'wide' ? 'the back end' : 'each end' }} of the sides takes the
            box {{ box.front === 'wide' ? 'back' : 'front and back' }}: glued, and nailed or screwed.
          </template>
          <template v-else-if="design.box.cornerJoint === 'tabs'">
            Finger joints: the box {{ box.front === 'wide' ? "back's ends have" : "front's and back's ends have" }} tabs that go through slots at the ends of
            the sides, open at the end, with a dog-bone in each corner. Cut on the CNC and glued; the ends of the tabs show on the outside of the sides.
          </template>
          <template v-else>The box {{ box.front === 'wide' ? 'back stands' : 'front and back stand' }} between the sides, pocket-screwed into them from {{ box.front === 'wide' ? 'its outside face' : 'their outside faces' }}.</template>
          The bottom sits in a groove in all four, {{ L(BOX_GROOVE_DEPTH) }} deep and {{ L(BOX_GROOVE_UP) }} up (tune me).
          <template v-if="box.front === 'applied'">
            Four {{ L(FRONT_SCREW_HOLE) }} holes in the box front take the screws that hold the front, which is positioned by hand.
          </template>
        </HelpText>
      </template>
    </template>

    <template v-if="(!inset || shopFront === 'applied') && editable">
      <SubHead>Front style</SubHead>
      <v-switch v-if="doors" v-model="sameAsDoors" label="Same as the doors" color="primary" density="compact" hide-details class="mb-2" />
      <FrontStyleFields v-show="!sameAsDoors" :front="design.front" />
    </template>
    <template v-if="editable && !(inset && shopFront !== 'applied' && shopPull === 'fingerPull')">
      <SubHead>Handle</SubHead>
      <HandleFields :design="design" />
    </template>
  </FoldCard>
</template>
