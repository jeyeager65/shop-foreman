<script setup lang="ts">
/**
 * The inputs of a set of front settings (milestone 5): how a project's doors and drawers
 * are made, edited in place. `part: 'questions'` is Setup's question 4 (door style and
 * material, hinge, slide, handle); `part: 'details'` the rest (edges and panel, handle
 * placement, finger pulls, the drawer front, box corners and materials, how a face
 * frame carries the slides, a shop drawer's front). A shop-style cabinet's doors have a
 * style of their own (`doors.shop`), kept apart from the one they have in the others.
 */
import { computed, watchEffect } from 'vue';
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import FrontPatternFields from '@/components/FrontPatternFields.vue';
import FrontStyleFields from '@/components/FrontStyleFields.vue';
import { mark } from '@/components/presetMarks';
import FingerSizeFields from '@/components/FingerSizeFields.vue';
import LengthField from '@/components/LengthField.vue';
import MaterialSelect from '@/components/MaterialSelect.vue';
import SubHead from '@/components/SubHead.vue';
import { addMaterialFromCatalog, doorHandleChoice, isHandle, isHinge, isSlide, shopDoorDefaults } from '@/design';
import { doorHandleCentres } from '@/design/handles';
import { frontBorder } from '@/design/pattern';
import { frontFaceTile, handleTile } from '@/design/tileDrawings';
import { MM_PER_INCH } from '@/units';
import type { BoxCornerJoint, ConstructionStyle, DoorHingeKey, FaceFrameSlideMount, FrontSettings, Length, PullChoice, ShopDrawerFront } from '@/model';
import { useAppStore } from '@/stores/app';
import { wideFrontFields } from '@/components/wideFront';

const props = defineProps<{
  fronts: FrontSettings;
  construction: ConstructionStyle;
  /** What a shop-style cabinet's slab doors start as: the case material. */
  caseMaterialId?: string;
  /** Setup's second level under Fronts: the doors, their pattern, the drawers, the hardware and handles. */
  part: 'doors' | 'pattern' | 'drawers' | 'hardware';
  /** Setup: the path these values are under, for the marks on what differs from the preset (`presetMarks.ts`). */
  marks?: string;
  /**
   * The size of the door the pattern's picture is drawn on: Setup gives its example cabinet's own door, so the
   * picture and the example beside it show the same pattern. Left out: a door 15" × 24".
   */
  faceSize?: { width: number; height: number };
  /** Setup: false where the project has no doors, or no drawers: their hardware is then not asked. */
  hasDoors?: boolean;
  hasDrawers?: boolean;
  /** Setup: false where the box corners are asked elsewhere (under Joints). */
  corners?: boolean;
}>();
const store = useAppStore();
const doors = computed(() => props.fronts.doors);
const drawers = computed(() => props.fronts.drawers);
const inset = computed(() => props.construction === 'shop');
const framed = computed(() => props.construction === 'faceFrame');

/** What the door style fields edit: the doors, or their own slab style when inset. */
watchEffect(() => {
  if (inset.value && !doors.value.shop) doors.value.shop = shopDoorDefaults(props.caseMaterialId ?? doors.value.materialId);
});
const doorFront = computed(() => (inset.value && doors.value.shop ? doors.value.shop : doors.value));
/** Where the doors' style is, and the drawer front, for the marks. */
const doorMarks = computed(() => (props.marks ? `${props.marks}.doors${inset.value && doors.value.shop ? '.shop' : ''}` : undefined));
const frontMarks = computed(() => (props.marks ? `${props.marks}.drawers.front` : undefined));

const HINGE_KEY: Record<ConstructionStyle, DoorHingeKey> = { faceFrame: 'hingeId', frameless: 'framelessHingeId', shop: 'shopHingeId' };
const hingeKey = computed(() => HINGE_KEY[props.construction]);
const hinges = computed(() => store.shop.hardware.filter(isHinge).filter((h) => h.cabinetType === props.construction));
const hingeId = computed({
  get: () => doors.value[hingeKey.value] ?? hinges.value.find((h) => h.generic)?.id ?? '',
  set: (id: string) => void (doors.value[hingeKey.value] = id),
});
const slides = computed(() => store.shop.hardware.filter(isSlide).map((s) => ({ title: s.name, value: s.id })));

const NONE = '';
const handles = computed(() => store.shop.hardware.filter(isHandle));
/** Each with its tile, drawn from the handle's own sizes (`handleTile`). */
const handleItems = computed(() => [
  { title: 'None', note: 'Fitted by hand, nothing cut', value: NONE, drawing: handleTile(undefined) },
  ...handles.value.map((h) => ({ title: h.name, value: h.id, drawing: handleTile(h) })),
]);
/** One handle for the doors and the drawers; the details place each. */
const handleId = computed({
  get: () => doors.value.handle?.handleId ?? drawers.value.handle?.handleId ?? NONE,
  set: (id: string) => {
    const wooden = handles.value.find((h) => h.id === id)?.cnc;
    if (wooden && store.project) addMaterialFromCatalog(store.project, store.shop.materialCatalog, wooden.materialId);
    if (id === NONE) {
      delete doors.value.handle;
      delete drawers.value.handle;
      return;
    }
    if (doors.value.handle) doors.value.handle.handleId = id;
    else doors.value.handle = doorHandleChoice(id);
    if (drawers.value.handle) drawers.value.handle.handleId = id;
    else drawers.value.handle = { handleId: id };
  },
});
/** Two knobs on a wide drawer. */
const twoKnobs = computed({
  get: () => !!drawers.value.handle?.two,
  set: (on: boolean) => {
    const handle = drawers.value.handle;
    if (!handle) return;
    if (on) handle.two = true;
    else delete handle.two;
  },
});
/** In the middle of the border, the doors' handles and the drawers' alike. */
const inMargin = computed({
  get: () => !!(doors.value.handle?.inMargin ?? drawers.value.handle?.inMargin),
  set: (on: boolean) => {
    for (const handle of [doors.value.handle, drawers.value.handle]) {
      if (!handle) continue;
      if (on) handle.inMargin = true;
      else delete handle.inMargin;
    }
  },
});
/**
 * A door's face for the pattern's picture: a left-hinged door (the size given, else 15" × 24") with the pattern as it is cut and the
 * handle where it goes (a knob's or a pull's holes; a pull cut into the door is not drawn).
 */
const USUAL_FACE = { width: 15 * MM_PER_INCH, height: 24 * MM_PER_INCH };
const doorFace = computed(() => {
  const FACE = props.faceSize ?? USUAL_FACE;
  const style = doorFront.value.style;
  const handle = handles.value.find((h) => h.id === doors.value.handle?.handleId);
  const centres = handle && doors.value.handle ? doorHandleCentres(handle, doors.value.handle, FACE, 'left', 'top', style.kind === 'shaker' ? style.frameWidth.mm : undefined, frontBorder(style)) : [];
  return frontFaceTile(style, FACE, centres);
});
const setLength = (holder: object | undefined, key: string, value: Length | null) => {
  if (!holder) return;
  const h = holder as Record<string, Length | undefined>;
  if (value) h[key] = value;
  else delete h[key];
};

const DOOR_PULLS: { title: string; value: PullChoice }[] = [
  { title: 'Fitted by hand (nothing cut)', value: 'byHand' },
  { title: 'Finger hole, cut on the CNC', value: 'fingerPull' },
];
const doorPull = computed({
  get: (): PullChoice => doors.value.shopPull ?? 'byHand',
  set: (value: PullChoice) => {
    if (value === 'fingerPull') doors.value.shopPull = value;
    else delete doors.value.shopPull;
  },
});
const SHOP_FRONTS: { title: string; value: ShopDrawerFront }[] = [
  { title: 'Wide front (hides the slides)', value: 'wide' },
  { title: 'Plain box (gaps show beside it)', value: 'plain' },
  { title: 'On runners (no slides)', value: 'runners' },
  { title: 'Applied front (its own front, screwed to the box)', value: 'applied' },
];
const DRAWER_PULLS: { title: string; value: PullChoice }[] = [
  { title: 'Fitted by hand (nothing cut)', value: 'byHand' },
  { title: 'Finger notch, cut on the CNC', value: 'fingerPull' },
];
const shopFront = computed({
  get: (): ShopDrawerFront => drawers.value.shop?.front ?? 'wide',
  set: (front: ShopDrawerFront) => void (drawers.value.shop = { ...drawers.value.shop, front }),
});
const shopPull = computed({
  get: (): PullChoice => drawers.value.shop?.pull ?? 'byHand',
  set: (pull: PullChoice) => void (drawers.value.shop = { ...drawers.value.shop, pull }),
});
/** A wide front's style, edge and material, as the style fields edit them: its own, kept in `drawers.shop`. */
const wideFront = wideFrontFields(() => drawers.value, () => props.caseMaterialId ?? drawers.value.materials.boxId);
const wideMarks = computed(() => (props.marks ? `${props.marks}.drawers.shop` : undefined));
/** A finger notch would cut a shaker front's top rail: it is not offered with one. */
const drawerPulls = computed(() => (shopFront.value === 'wide' && drawers.value.shop?.style?.kind === 'shaker' ? DRAWER_PULLS.filter((p) => p.value !== 'fingerPull') : DRAWER_PULLS));
const MOUNTS: { title: string; value: FaceFrameSlideMount }[] = [
  { title: 'Build-out strips on the case sides', value: 'strips' },
  { title: 'Rear mounting brackets', value: 'rearBrackets' },
];
const CORNERS: { title: string; value: BoxCornerJoint }[] = [
  { title: 'Rabbets in the sides', value: 'rabbet' },
  { title: 'Pocket screws', value: 'pocketScrews' },
  { title: 'Finger joints (tabs and slots, cut on the CNC)', value: 'tabs' },
];
</script>

<template>
  <!-- The doors: their style and material, then their sizes and edges. -->
  <template v-if="part === 'doors'">
    <FrontStyleFields :front="doorFront" part="main" :marks="doorMarks" />
    <SubHead>Fine tuning</SubHead>
    <FrontStyleFields :front="doorFront" part="details" no-pattern :marks="doorMarks" />
    <v-row v-if="inset" density="compact">
      <v-col cols="12" :class="mark(marks, 'doors.shopPull')"><v-select v-model="doorPull" label="Door pulls" :items="DOOR_PULLS" hide-details /></v-col>
    </v-row>
  </template>

  <!-- The pattern cut into the doors' faces. -->
  <template v-else-if="part === 'pattern'">
    <div :class="mark(doorMarks, 'style.pattern')"><FrontPatternFields :front-style="doorFront.style" :face="doorFace" /></div>
  </template>

  <!-- The drawers: their fronts, then their boxes. -->
  <template v-else-if="part === 'drawers'">
    <template v-if="inset">
      <v-row density="compact">
        <v-col cols="12" :class="mark(marks, 'drawers.shop.front')"><v-select v-model="shopFront" label="Drawer front" :items="SHOP_FRONTS" hide-details /></v-col>
        <v-col v-if="shopFront === 'wide'" cols="12" class="text-body-2 text-medium-emphasis">
          One piece: the box's front wall is the drawer's front, the box sides in dados in its back. Left a flat slab with
          square edges it is cut with the box. With a frame or a pattern its outside is cut too, the sheet turned over on
          pins; an eased edge is the hand-held router's, unless Plan gives it to the CNC.
        </v-col>
      </v-row>
      <FrontStyleFields v-if="shopFront === 'wide'" :front="wideFront" :marks="wideMarks" material-key="frontMaterialId" material-label="Front material" />
      <!-- A front of its own: the drawer's usual front settings, as in the other styles. Its handle is Hardware's. -->
      <template v-else-if="shopFront === 'applied'">
        <div class="text-body-2 text-medium-emphasis mb-2">
          A front of its own, inset in the opening and screwed to a plain box from inside it: the front is fitted to its
          opening after the box is hung. Its handle is chosen under Hardware and handles.
        </div>
        <FrontStyleFields :front="drawers.front" :marks="frontMarks" />
      </template>
      <v-row v-if="shopFront !== 'applied'" density="compact">
        <v-col cols="12" :class="mark(marks, 'drawers.shop.pull')"><v-select v-model="shopPull" label="Drawer pulls" :items="drawerPulls" hide-details /></v-col>
      </v-row>
    </template>
    <FrontStyleFields v-else :front="drawers.front" :marks="frontMarks" />
    <SubHead>The boxes</SubHead>
    <v-row density="compact">
      <v-col v-if="framed" cols="12" :class="mark(marks, 'drawers.faceFrameMount')"><v-select v-model="drawers.faceFrameMount" label="Face frame: the slides are carried on" :items="MOUNTS" hide-details /></v-col>
      <v-col v-if="corners !== false" cols="12" :class="mark(marks, 'drawers.cornerJoint')"><v-select v-model="drawers.cornerJoint" label="Box corners" :items="CORNERS" hide-details /></v-col>
      <v-col v-if="corners !== false && drawers.cornerJoint === 'tabs'" cols="12" :class="mark(marks, 'drawers.fingers')"><FingerSizeFields :box="drawers" /></v-col>
      <v-col cols="6" :class="mark(marks, 'drawers.materials.boxId')"><MaterialSelect v-model="drawers.materials.boxId" label="Box material" use="drawers" hide-details /></v-col>
      <v-col cols="6" :class="mark(marks, 'drawers.materials.bottomId')"><MaterialSelect v-model="drawers.materials.bottomId" label="Bottom material" use="backs" hide-details /></v-col>
    </v-row>
  </template>

  <!-- What is bought, and the handles: which, and where they go. -->
  <template v-else>
    <v-row density="compact">
      <v-col v-if="hasDoors !== false" cols="12" :class="mark(marks, `doors.${hingeKey}`)">
        <v-select v-model="hingeId" :label="inset ? 'Hinge (inset)' : 'Hinge'" :items="hinges.map((h) => ({ title: h.name, value: h.id }))" data-test="setup-hinge" />
      </v-col>
      <v-col v-if="hasDrawers !== false" cols="12" :class="mark(marks, 'drawers.slideId')"><v-select v-model="drawers.slideId" label="Drawer slide" :items="slides" data-test="setup-slide" /></v-col>
      <v-col cols="12" :class="mark(marks, 'doors.handle.handleId', 'drawers.handle.handleId')">
        <div class="text-caption text-medium-emphasis mb-1">Handles</div>
        <ChoiceTiles v-model="handleId" :items="handleItems" label="Handles" size="small" name="setup-handle" />
      </v-col>
    </v-row>
    <template v-if="doors.handle || drawers.handle">
      <SubHead>Where the handles go</SubHead>
      <v-row density="compact">
        <v-col v-if="drawers.handle" cols="12" :class="mark(marks, 'drawers.handle.two')">
          <v-switch v-model="twoKnobs" label="Two knobs on a drawer 24&quot; wide or more" color="primary" density="compact" hint="A knob a quarter of the way in from each end of a wide drawer front; a narrower one, and a pull, stays one in the middle." persistent-hint data-test="setup-handle-two" />
        </v-col>
        <v-col cols="12" :class="mark(marks, 'doors.handle.inMargin', 'drawers.handle.inMargin')">
          <v-switch
            v-model="inMargin"
            label="In the middle of a front's border"
            color="primary"
            density="compact"
            hint="On a patterned slab the handle goes in the middle of the plain margin round the pattern; on a shaker front, in the middle of its frame (a drawer front's top rail). A plain slab has no border: the handle stays where it is set."
            persistent-hint
            data-test="setup-handle-in-margin"
          />
        </v-col>
        <template v-if="doors.handle">
          <v-col cols="6" :class="mark(marks, 'doors.handle.fromEdge')">
            <LengthField :model-value="doors.handle.fromEdge ?? null" label="A door's: in from the opening edge" optional @update:model-value="setLength(doors.handle, 'fromEdge', $event)" />
          </v-col>
          <v-col cols="6" :class="mark(marks, 'doors.handle.fromEnd')"><LengthField v-model="doors.handle.fromEnd" label="A door's: from the door's end" tune-me /></v-col>
        </template>
        <v-col v-if="drawers.handle" cols="6" :class="mark(marks, 'drawers.handle.fromTop')">
          <LengthField :model-value="drawers.handle.fromTop ?? null" label="A drawer's: down from the top" optional @update:model-value="setLength(drawers.handle, 'fromTop', $event)" />
        </v-col>
      </v-row>
    </template>
  </template>
</template>
