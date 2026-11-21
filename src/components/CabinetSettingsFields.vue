<script setup lang="ts">
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import { mark } from '@/components/presetMarks';
import { backJointTile, caseJointTile } from '@/design/tileDrawings';
/**
 * The inputs of a set of cabinet settings (milestone 5): the project's in Setup, or a
 * cabinet's own copy where it is made different. `part` picks the group: the
 * construction style's values and the toe kick, or the case materials, shelf pin,
 * joinery and how wall cabinets hang. They edit the object they are given in place.
 */
import { computed, ref } from 'vue';
import LengthField from '@/components/LengthField.vue';
import MaterialSelect from '@/components/MaterialSelect.vue';
import { SINK_STRETCHER_WIDTH, STRETCHER_WIDTH, BOTTOM_KINDS, type BottomKind, CASTER_UNDER_CHOICES, casterUnderChoice, setCasterUnderChoice, JOINED_PARTS, type JoinedPart, TAB_BACK_MIN, bottomKindOf, isCaster, isShelfPin, setBottomKind } from '@/design';
import type { BackJoint, BackStretcherForm, CabinetSettings, CaseJoint, Length, WallHanging } from '@/model';
import { useAppStore } from '@/stores/app';
import { TAB, tabSizeOf } from '@/design/tabs';

const props = withDefaults(defineProps<{
  settings: CabinetSettings;
  /** `kick`: only how the toe kick board is fastened (Setup's Joints). */
  part: 'construction' | 'case' | 'kick';
  /** Leave out what the question above already asks: the style and the toe kick switch, or the materials. */
  details?: boolean;
  /** The cabinets these settings are for include wall ones (or may: Setup). */
  walls?: boolean;
  /** Floor-standing ones. */
  floor?: boolean;
  /** Setup: `only` the case joint and the back (the case part's main choices), or everything but them (`none`; of the construction part, everything but the toe kick board's joint). */
  joints?: 'only' | 'none';
  /** Setup: the path these values are under, for the marks on what differs from the preset (`presetMarks.ts`). */
  marks?: string;
}>(), { details: false, walls: false, floor: true });
const store = useAppStore();
const s = computed(() => props.settings);
const framed = computed(() => s.value.construction === 'faceFrame');
const inset = computed(() => s.value.construction === 'shop');
const floor = computed(() => props.floor);

const STYLES = [
  { title: 'Face frame', value: 'faceFrame' },
  { title: 'Frameless', value: 'frameless' },
  { title: 'Inset', value: 'shop' },
];
/** A toe kick, a flat bottom, or casters (milestone 9). The toe kick's sizes stay while it is off. */
const bottom = computed({
  get: () => bottomKindOf(s.value.toeKick),
  set: (kind: BottomKind) => setBottomKind(s.value.toeKick, kind, store.shop.hardware),
});
const toeKickOn = computed(() => bottom.value === 'toeKick');
/** The face frame's overhang past each side of the box; emptied, the frame is flush again. */
function setOverhang(value: Length | null) {
  if (value && value.mm > 0) s.value.faceFrame.overhang = value;
  else delete s.value.faceFrame.overhang;
}
/** What covers the front edges of a frameless case: nothing, thin banding, or a solid wood strip. */
const FRONT_EDGES = [
  { title: 'Bare', value: 'none' },
  { title: 'Edge banding', value: 'banding' },
  { title: 'Solid wood strip', value: 'strip' },
];
/** The style the edges belong to: the inset style's or the frameless one's (their fields are named alike). */
const edged = computed(() => (inset.value ? s.value.shop : s.value.frameless));
const edgeKey = computed(() => (inset.value ? 'shop' : 'frameless'));
const frontEdge = computed({
  get: () => (edged.value.edgeStrip ? 'strip' : edged.value.edgeBanding ? 'banding' : 'none'),
  set: (kind: string) => {
    // The inset style's fields are left out when bare, as a shop cabinet has them.
    if (kind === 'banding' || !inset.value) edged.value.edgeBanding = kind === 'banding';
    else delete edged.value.edgeBanding;
    // As thick as the plywood it covers, to start with, like a top's edge strip.
    if (kind === 'strip') edged.value.edgeStrip ??= { ...(store.project?.materials.find((m) => m.id === s.value.materials.caseId)?.nominalThickness ?? { mm: 19.05, unit: 'in' as const }) };
    else delete edged.value.edgeStrip;
  },
});
const casterChoices = computed(() => store.shop.hardware.filter(isCaster).map((c) => ({ title: c.name, value: c.id })));
/** Each with its tile: the joint cut through (`caseJointTile`, `backJointTile`). */
const JOINTS: { title: string; value: CaseJoint; note: string }[] = [
  { title: 'Pocket screws', value: 'pocketScrews', note: 'A butt joint, screwed from a pocket' },
  { title: 'Dado', value: 'dado', note: 'The part let into a groove in the side' },
  { title: 'Screws through the sides', value: 'throughScrews', note: 'A butt joint; the heads show' },
  { title: 'Tabs and slots', value: 'tabs', note: 'Cut on the CNC and glued; through the sides or blind' },
];
const jointTiles = computed(() => JOINTS.map((j) => ({ ...j, drawing: caseJointTile(j.value, !!s.value.joinery.tabs?.blind) })));
/** Whether any joint of the case is on tabs: the fields for how the tabs are made show then. */
const anyTabs = computed(() => s.value.joinery.case === 'tabs' || s.value.joinery.back === 'tabs' || Object.values(s.value.joinery.overrides ?? {}).includes('tabs'));
const TAB_KINDS = [
  { title: 'Through the sides: the ends of the tabs show outside', value: 'through' },
  { title: 'Blind: into pockets in the inside faces, nothing shows outside', value: 'blind' },
];
const tabKind = computed({
  get: () => (s.value.joinery.tabs?.blind ? 'blind' : 'through'),
  set: (kind: string) => {
    setTabs({ blind: kind === 'blind' ? true : undefined, proud: kind === 'blind' ? undefined : s.value.joinery.tabs?.proud });
  },
});
/** Writes the tabs' answers, each left out while it is the usual, and nothing stored when all are. */
function setTabs(patch: Partial<NonNullable<CabinetSettings['joinery']['tabs']>>) {
  const next = { ...s.value.joinery.tabs, ...patch };
  for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key];
  if (Object.keys(next).length) s.value.joinery.tabs = next;
  else delete s.value.joinery.tabs;
}
/** How far a through tab stands proud: nothing stored while it is flush. */
const setProud = (value: Length | null) => setTabs({ proud: value && value.mm > 0 ? value : undefined });
/** The tabs' size: nothing stored while it is the usual one. */
const tabSize = computed(() => tabSizeOf(s.value.joinery.tabs));
const setTabSize = (key: 'length' | 'between', value: Length | null) => setTabs({ [key]: value && value.mm > 0 && Math.abs(value.mm - TAB[key]) > 1e-6 ? value : undefined });
const BACKS: { title: string; value: BackJoint; note: string }[] = [
  { title: 'In a rabbet', value: 'rabbet', note: 'Let into the rear edges' },
  { title: 'In a groove', value: 'groove', note: 'In from the rear, held all round' },
  { title: 'Applied over the rear', value: 'applied', note: 'Its edges show at the sides' },
];
/** A back thick enough for tabs (`TAB_BACK_MIN`): the choice is offered then, or while it is the one in use. */
const thickBack = computed(() => (store.project?.materials.find((m) => m.id === s.value.materials.backId)?.measuredThickness.mm ?? 0) >= TAB_BACK_MIN - 1e-6);
const backTiles = computed(() =>
  [...BACKS, ...(thickBack.value || s.value.joinery.back === 'tabs' ? [{ title: 'On tabs', value: 'tabs' as const, note: 'A thick back, tabs into the sides' }] : [])].map((b) => ({ ...b, drawing: backJointTile(b.value, !!s.value.joinery.tabs?.blind) })),
);
const STRETCHER_FORMS: { title: string; value: BackStretcherForm }[] = [
  { title: 'On edge, against the back (nailer)', value: 'nailer' },
  { title: 'Flat, like the front one', value: 'flat' },
];
const HANGINGS: { title: string; value: WallHanging }[] = [
  { title: 'Hanging rails, top and bottom', value: 'rails' },
  { title: 'French cleat', value: 'cleat' },
];
const pinChoices = computed(() => store.shop.hardware.filter(isShelfPin).map((p) => ({ title: p.name, value: p.id })));
const jointName = (joint: CaseJoint) => JOINTS.find((j) => j.value === joint)!.title;
const jointChoices = computed(() => [{ title: `Same as the case (${jointName(s.value.joinery.case).toLowerCase()})`, value: 'same' }, ...JOINTS]);
function setJoint(part: JoinedPart, value: string) {
  const joinery = s.value.joinery;
  const overrides = { ...joinery.overrides };
  if (value === 'dado' || value === 'pocketScrews' || value === 'throughScrews' || value === 'tabs') overrides[part] = value;
  else delete overrides[part];
  if (Object.keys(overrides).length) joinery.overrides = overrides;
  else delete joinery.overrides;
}
/** The top stretchers' depth, usual or over a sink: kept only where it differs from the default. */
function setStretchers(key: 'width' | 'underSink', value: Length | null) {
  if (!value || value.mm <= 0) return;
  const joinery = s.value.joinery;
  const start = key === 'width' ? STRETCHER_WIDTH : SINK_STRETCHER_WIDTH;
  const next = { ...joinery.stretchers };
  if (Math.abs(value.mm - start) < 0.01) delete next[key];
  else next[key] = value;
  if (Object.keys(next).length) joinery.stretchers = next;
  else delete joinery.stretchers;
}
const ownJoints = ref(Object.keys(s.value.joinery.overrides ?? {}).length > 0);
function setOwnJoints(on: boolean) {
  ownJoints.value = on;
  if (!on) delete s.value.joinery.overrides;
}
/** How the toe kick board is fastened: by hand, or with pocket screws into the sides and up into the bottom. */
const kickJoints = computed(() => [
  { title: 'Glue and brads, by hand', value: 'byHand' },
  { title: s.value.toeKick.board ? 'Pocket screws: from the sides into it, and from it up into the bottom' : 'Pocket screws: into the sides and up into the bottom', value: 'pocketScrews' },
]);
/** Where the toe kick board stands: between the sides, or in front of them, where it hides their edges. */
const KICK_BOARDS = [
  { title: 'Between the sides', value: 'between' },
  { title: 'In front of the sides: one board a cabinet', value: 'inFront' },
  { title: 'In front of the sides: one board across a run', value: 'acrossRun' },
];
function setKickBoard(value: string) {
  if (value === 'inFront' || value === 'acrossRun') s.value.toeKick.board = value;
  else delete s.value.toeKick.board;
}
function setKickJoint(value: string) {
  if (value === 'pocketScrews') s.value.toeKick.joint = 'pocketScrews';
  else delete s.value.toeKick.joint;
}
</script>

<template>
  <v-row v-if="part === 'construction'" density="compact">
    <v-col v-if="!details" cols="12" :class="mark(marks, 'construction')"><v-select v-model="s.construction" label="Construction" :items="STYLES" data-test="construction" /></v-col>
    <v-col v-if="!details && floor" cols="12">
      <v-select v-model="bottom" label="Bottom" :items="BOTTOM_KINDS" hide-details data-test="toe-kick" />
    </v-col>
    <v-col v-if="floor && s.toeKick.casters" cols="12" :class="mark(marks, 'toeKick.casters.casterId')">
      <v-select v-model="s.toeKick.casters.casterId" label="Casters" :items="casterChoices" hide-details data-test="caster" />
    </v-col>
    <v-col v-if="floor && s.toeKick.casters" cols="12" :class="mark(marks, 'toeKick.casters.under')">
      <v-select :model-value="casterUnderChoice(s.toeKick)" label="Under the casters" :items="CASTER_UNDER_CHOICES" hide-details data-test="caster-under" @update:model-value="setCasterUnderChoice(s.toeKick, $event)" />
    </v-col>
    <template v-if="toeKickOn && floor">
      <v-col cols="6" :class="mark(marks, 'toeKick.height')"><LengthField v-model="s.toeKick.height" label="Toe kick height" /></v-col>
      <v-col cols="6" :class="mark(marks, 'toeKick.depth')"><LengthField v-model="s.toeKick.depth" label="Toe kick depth" /></v-col>
      <v-col cols="12" :class="mark(marks, 'toeKick.board')">
        <v-select
          :model-value="s.toeKick.board ?? 'between'"
          label="Toe kick board stands"
          :items="KICK_BOARDS"
          hide-details
          data-test="toe-kick-board"
          @update:model-value="setKickBoard($event)"
        />
      </v-col>
      <v-col v-if="joints !== 'none'" cols="12" :class="mark(marks, 'toeKick.joint')">
        <v-select
          :model-value="s.toeKick.joint ?? 'byHand'"
          label="Toe kick board"
          :items="kickJoints"
          :hint="s.toeKick.board === 'acrossRun' ? `One board across a run goes on from the front once the run is set, with glue and brads; a cabinet in no run gets its own board, fastened as chosen here.` : ''"
          :persistent-hint="s.toeKick.board === 'acrossRun'"
          :hide-details="s.toeKick.board !== 'acrossRun'"
          data-test="toe-kick-joint"
          @update:model-value="setKickJoint($event)"
        />
      </v-col>
    </template>
    <template v-if="framed">
      <v-col cols="6" :class="mark(marks, 'faceFrame.stileWidth')"><LengthField v-model="s.faceFrame.stileWidth" label="Stile width" /></v-col>
      <v-col cols="6" :class="mark(marks, 'faceFrame.railWidth')"><LengthField v-model="s.faceFrame.railWidth" label="Rail width" /></v-col>
      <v-col cols="12" :class="mark(marks, 'faceFrame.overhang')">
        <LengthField
          :model-value="s.faceFrame.overhang ?? null"
          label="Frame past each side of the box"
          optional
          hint="Left empty, the frame is flush with the sides. 1/4&quot; is usual: neighbours then meet frame to frame. The cabinet's width is the frame's; the box is narrower by twice this."
          data-test="frame-overhang"
          @update:model-value="setOverhang($event)"
        />
      </v-col>
      <v-col cols="12" :class="mark(marks, 'faceFrame.materialId')"><MaterialSelect v-model="s.faceFrame.materialId" label="Face frame material" use="frames" /></v-col>
    </template>
    <v-col v-if="inset" cols="6" :class="mark(marks, 'shop.gap')"><LengthField v-model="s.shop.gap" label="Gap around fronts (tune me)" /></v-col>
    <template v-if="!framed && !inset">
      <v-col cols="6" :class="mark(marks, 'frameless.reveal')"><LengthField v-model="s.frameless.reveal" label="Reveal (tune me)" /></v-col>
      <v-col cols="6" :class="mark(marks, 'frameless.frontGap')"><LengthField v-model="s.frameless.frontGap" label="Front gap (tune me)" /></v-col>
    </template>
    <template v-if="!framed">
      <v-col :cols="frontEdge === 'strip' ? 6 : 12" :class="mark(marks, `${edgeKey}.edgeBanding`, `${edgeKey}.edgeStrip`)">
        <v-select v-model="frontEdge" label="Front edges of the case" :items="FRONT_EDGES" hide-details data-test="front-edge" />
      </v-col>
      <template v-if="frontEdge === 'strip'">
        <v-col cols="6" :class="mark(marks, `${edgeKey}.edgeStrip`)"><LengthField :model-value="edged.edgeStrip ?? null" label="Strip thickness" data-test="edge-strip" @update:model-value="$event && $event.mm > 0 && (edged.edgeStrip = $event)" /></v-col>
        <v-col cols="12" :class="mark(marks, 'faceFrame.materialId')"><MaterialSelect v-model="s.faceFrame.materialId" label="Strip material" use="frames" /></v-col>
        <v-col cols="12" class="text-body-2 text-medium-emphasis">
          A strip of solid wood glued to the front edge of each piece of the case (the sides, the bottom, the top or front stretcher, the
          shelves, the partitions), as on a top, so that no plywood edge shows from the front. Each piece is cut smaller by its strip.
          <template v-if="inset">The doors and drawers stand between the strips, flush with their faces.</template>
        </v-col>
      </template>
    </template>
  </v-row>
  <v-row v-else-if="part === 'kick'" density="compact">
    <v-col cols="12" :class="mark(marks, 'toeKick.joint')">
      <v-select
        :model-value="s.toeKick.joint ?? 'byHand'"
        label="Toe kick board"
        :items="kickJoints"
        :hint="s.toeKick.board === 'acrossRun' ? `One board across a run goes on from the front once the run is set, with glue and brads; a cabinet in no run gets its own board, fastened as chosen here.` : ''"
        :persistent-hint="s.toeKick.board === 'acrossRun'"
        :hide-details="s.toeKick.board !== 'acrossRun'"
        data-test="toe-kick-joint"
        @update:model-value="setKickJoint($event)"
      />
    </v-col>
  </v-row>
  <v-row v-else density="compact">
    <template v-if="!details">
      <v-col cols="6" :class="mark(marks, 'materials.caseId')"><MaterialSelect v-model="s.materials.caseId" label="Case material" use="cases" /></v-col>
      <v-col cols="6" :class="mark(marks, 'materials.backId')"><MaterialSelect v-model="s.materials.backId" label="Back material" use="backs" /></v-col>
    </template>
    <v-col v-if="joints !== 'only'" cols="12" :class="mark(marks, 'shelfPinId')"><v-select v-model="s.shelfPinId" label="Shelf pin" :items="pinChoices" /></v-col>
    <v-col v-if="joints !== 'none'" cols="12" :class="mark(marks, 'joinery.case')">
      <div class="text-caption text-medium-emphasis mb-1">Case joints</div>
      <ChoiceTiles v-model="s.joinery.case" :items="jointTiles" label="Case joints" name="case-joint" />
    </v-col>
    <template v-if="anyTabs && joints !== 'none'">
      <v-col cols="12" sm="7" :class="mark(marks, 'joinery.tabs')">
        <v-select v-model="tabKind" label="Tabs go" :items="TAB_KINDS" hide-details data-test="tab-kind" />
      </v-col>
      <v-col v-if="tabKind === 'through'" cols="12" sm="5" :class="mark(marks, 'joinery.tabs')">
        <LengthField :model-value="s.joinery.tabs?.proud ?? { mm: 0, unit: 'in' }" label="Tabs stand proud by" hide-details data-test="tab-proud" @update:model-value="setProud($event)" />
      </v-col>
      <v-col cols="6" :class="mark(marks, 'joinery.tabs')">
        <LengthField :model-value="s.joinery.tabs?.length ?? { mm: tabSize.length, unit: 'in' }" label="Each tab's length" hide-details data-test="tab-length" @update:model-value="setTabSize('length', $event)" />
      </v-col>
      <v-col cols="6" :class="mark(marks, 'joinery.tabs')">
        <LengthField :model-value="s.joinery.tabs?.between ?? { mm: tabSize.between, unit: 'in' }" label="Between two, at most" hide-details data-test="tab-between" @update:model-value="setTabSize('between', $event)" />
      </v-col>
      <v-col cols="12" class="text-caption text-medium-emphasis pt-0">
        Tabs on the ends of the parts that span the case and a slot in each side for every tab, all cut on the CNC, glued with no
        screws. A tabbed part is never cut on a saw. Flush is the usual; a tab left a little proud is sanded back once the glue is dry.
      </v-col>
    </template>
    <v-col v-if="joints !== 'only'" cols="12" :class="mark(marks, 'joinery.overrides')">
      <v-switch :model-value="ownJoints" label="Different joint for one part" color="primary" density="compact" hide-details @update:model-value="setOwnJoints(!!$event)" />
    </v-col>
    <v-col v-for="joined in joints === 'only' ? [] : JOINED_PARTS" v-show="ownJoints" :key="joined.key" cols="12" :class="mark(marks, `joinery.overrides.${joined.key}`)">
      <v-select :model-value="s.joinery.overrides?.[joined.key] ?? 'same'" :label="joined.name" :items="jointChoices" @update:model-value="setJoint(joined.key, $event)" />
    </v-col>
    <v-col v-if="joints !== 'none'" cols="12" :class="mark(marks, 'joinery.back')">
      <div class="text-caption text-medium-emphasis mb-1">Back</div>
      <ChoiceTiles v-model="s.joinery.back" :items="backTiles" label="Back" name="back-joint" />
      <div v-if="!thickBack" class="text-caption text-medium-emphasis mt-1">{{ s.joinery.back === 'tabs' ? 'This back is too thin for tabs: give it a material 1/2" thick or more.' : 'A back 1/2" thick or more can also be on tabs, in slots in the sides.' }}</div>
    </v-col>
    <v-col v-if="floor && joints !== 'only'" cols="12" :class="mark(marks, 'joinery.backStretcherForm')"><v-select v-model="s.joinery.backStretcherForm" label="Back stretcher form" :items="STRETCHER_FORMS" /></v-col>
    <template v-if="floor && joints !== 'only'">
      <v-col cols="6" :class="mark(marks, 'joinery.stretchers.width')">
        <LengthField :model-value="s.joinery.stretchers?.width ?? { mm: STRETCHER_WIDTH, unit: 'in' }" label="Top stretchers, front to back" data-test="stretcher-width" @update:model-value="setStretchers('width', $event)" />
      </v-col>
      <v-col cols="6" :class="mark(marks, 'joinery.stretchers.underSink')">
        <LengthField :model-value="s.joinery.stretchers?.underSink ?? { mm: SINK_STRETCHER_WIDTH, unit: 'in' }" label="Over a sink" data-test="stretcher-under-sink" @update:model-value="setStretchers('underSink', $event)" />
      </v-col>
      <v-col cols="12" class="text-caption text-medium-emphasis pt-0">Where they lie flat. Over a sink they are narrower, the sink's bowl hanging between them.</v-col>
    </template>
    <v-col v-if="walls && joints !== 'only'" cols="12" :class="mark(marks, 'hanging')"><v-select v-model="s.hanging" label="Wall cabinets hang on" :items="HANGINGS" data-test="hanging" /></v-col>
  </v-row>
</template>
