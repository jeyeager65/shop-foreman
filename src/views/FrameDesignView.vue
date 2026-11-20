<script setup lang="ts">
/**
 * Design for a table: a piece of its own kind, a frame of legs and aprons under a top, with
 * its own few topics on the shell the other pages share and the 3D view beside them. The row of pieces across
 * the top is the project's, cabinets and tables alike: a cabinet's button goes back to the cabinets' Design.
 * `#/design?piece=<id>` opens a table; a project with no cabinet opens on its first.
 */
import { mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CabinetAssemblyView from '@/components/CabinetAssemblyView.vue';
import ImportPieceDialog from '@/components/ImportPieceDialog.vue';
import LengthField from '@/components/LengthField.vue';
import PageHeader from '@/components/PageHeader.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import OwnTopLeaf from '@/components/OwnTopLeaf.vue';
import OwnTopMade from '@/components/OwnTopMade.vue';
import TopicShell from '@/components/TopicShell.vue';
import { type Topic, useTopics } from '@/components/topics';
import { frameTop, frameTopFollows, addMaterialFromCatalog, cabinetTags, cabinetsOf, copiesOf, dropLeafSupportWords, frameDowelJig, frameFasteners, frameLayout, frameLeafOf, leafEdgeWords, leafSidesWords, materialTitle, piecesOf, setupSummary, tagged, topSettingsOf } from '@/design';
import { projectScene } from '@/design/scene';
import { SOLID_WOOD_3_4_ID } from '@/libraries';
import { SQUARE_2X2_ID, STARTER_MATERIALS } from '@/libraries/materials';
import type { DesignedCabinetContext, StoredFrame } from '@/model';
import { type Starter, addableStarters } from '@/samples/starters';
import { useAppStore } from '@/stores/app';
import ViewLookSelect from '@/components/ViewLookSelect.vue';
import { lookFromQuery, useViewLookData } from '@/components/viewLook';

const props = defineProps<{ frame: StoredFrame }>();
const store = useAppStore();
const router = useRouter();
// `&full=1` opens the view filling the page, `&explode=40` with its parts apart, `&real=0` in its plain look: for a picture from a link.
const asked = useRoute().query;
const startFull = 'full' in asked;
/** The view shows this table, or every piece of the project where it stands (`&all=1`): a hutch on its desk. */
const showAll = ref('all' in asked);
const startExplode = Number(asked.explode) || 0;
/** Where the Leaf slider starts (`leaf=70`): 0 up, 100 down. */
const startLeaf = Number(asked.leaf) || 0;
const startLook = lookFromQuery(asked);
const { materialNames, cutBy } = useViewLookData();
const L = computed(() => store.sizeLength);
const context = computed(() => store.project!.context as DesignedCabinetContext);
const frame = computed(() => props.frame);
/** Its top as it is made: its own, or as Setup's tops are. */
const madeTop = computed(() => frameTop(frame.value, context.value));

/** The project's pieces, in its order: the cabinets, which have their own Design, and the tables. */
const tags = computed(() => cabinetTags(store.project!));
const pieces = computed(() => {
  const cabinets = cabinetsOf(store.project!);
  return piecesOf(store.project!).map((p) => ({ id: p.id, name: p.name || (p.kind === 'frame' ? 'Table' : 'Cabinet'), kind: p.kind, copies: copiesOf(p), cabinet: cabinets.findIndex((c) => c.id === p.id) + 1 }));
});
function openPiece(p: { id: string; kind: string; cabinet: number }) {
  if (p.kind === 'frame') void router.replace({ query: { piece: p.id } });
  else void router.replace({ query: { cabinet: String(p.cabinet) } });
}
const ADDABLE = addableStarters();
function addOne(starter: Starter) {
  const names = new Set(pieces.value.map((p) => p.name));
  const stem = starter.stem ?? 'Cabinet';
  let n = pieces.value.length + 1;
  while (names.has(`${stem} ${n}`)) n++;
  const added = starter.add!(store.project!, `${stem} ${n}`, undefined, store.shop);
  const now = pieces.value.find((p) => p.id === added.id);
  if (now) openPiece(now);
}
/** A piece from another project. */
const importing = ref(false);
function imported(id: string) {
  const now = pieces.value.find((p) => p.id === id);
  if (now) openPiece(now);
}
function deleteOne() {
  const all = context.value.pieces;
  if (all.length < 2) return;
  const at = all.findIndex((p) => p.id === frame.value.id);
  all.splice(at, 1);
  const next = pieces.value[Math.min(at, pieces.value.length - 1)];
  if (next) openPiece(next);
}

/** What it is made of: its own where it says, else the project's style. */
const materialName = (id: string) => {
  const m = store.materials.find((x) => x.id === id);
  return m ? materialTitle(m, L.value) : id;
};
/** The square stock a leg may be: the project's, and what comes with the app that it does not have yet. */
const legChoices = computed(() => {
  const own = store.materials.filter((m) => m.section === 'square');
  const more = [...store.shop.materialCatalog, ...STARTER_MATERIALS].filter((m) => m.section === 'square' && !own.some((o) => o.id === m.id));
  return [...own, ...more.filter((m, i) => more.findIndex((x) => x.id === m.id) === i)].map((m) => ({ title: materialTitle(m, L.value), value: m.id }));
});
function setLegs(id: string) {
  addMaterialFromCatalog(store.project!, store.shop.materialCatalog, id);
  frame.value.legs.materialId = id;
}
/** Square stock, or glued up from layers of a sheet or a board. */
const LEG_KINDS = [
  { title: 'Square stock, cut to length', value: 'square' },
  { title: 'Glued up from layers of a sheet or a board', value: 'layers' },
];
const layerChoices = computed(() => store.materials.filter((m) => !m.section).map((m) => ({ title: materialTitle(m, L.value), value: m.id })));
function setLegKind(kind: string) {
  if (kind === 'layers') {
    // The case material to start with: it is in the project, and two layers of 3/4" make a 1-1/2" leg.
    frame.value.legs = { materialId: context.value.settings.materials.caseId, layers: 2 };
  } else {
    const square = store.materials.find((m) => m.section === 'square')?.id ?? SQUARE_2X2_ID;
    addMaterialFromCatalog(store.project!, store.shop.materialCatalog, square);
    frame.value.legs = { materialId: square };
  }
}
/** The lower shelf. */
const setShelf = (on: boolean) => (on ? (frame.value.shelf = frame.value.shelf ?? { up: { mm: 6 * 25.4, unit: 'in' } }) : delete frame.value.shelf);
const shelfChoices = computed(() => sheetChoices('As the aprons'));
const setShelfMaterial = (id: string) => frame.value.shelf && (id ? (frame.value.shelf.materialId = id) : delete frame.value.shelf.materialId);
const setShelfInset = (value: { mm: number; unit: 'in' | 'mm' } | null) => frame.value.shelf && (value ? (frame.value.shelf.inset = value) : delete frame.value.shelf.inset);
const sheetChoices = (setup: string) => [{ title: setup, value: '' }, ...store.materials.filter((m) => !m.section).map((m) => ({ title: materialTitle(m, L.value), value: m.id }))];
const apronChoices = computed(() => sheetChoices(`As Setup: the case material (${materialName(context.value.settings.materials.caseId)})`));
const topChoices = computed(() => sheetChoices(`As Setup: the top material (${materialName(topSettingsOf(context.value).materialId)})`));
const setApronMaterial = (id: string) => (id ? (frame.value.aprons.materialId = id) : delete frame.value.aprons.materialId);
/** The table's leaf in a line: how much folds down, the top with it up, and what it rests on. */
const leafLine = computed(() => {
  const leaf = frameLeafOf(frame.value, context.value, store.materials);
  if (!leaf) return '';
  const up = `${L.value(leaf.whole.length)} long × ${L.value(leaf.whole.width)} wide`;
  const rests = madeTop.value.torsion ? 'It is a box of its own on two folding legs, lined up by pins in holes the CNC drills.' : `It is a panel of its own, square at the joint, and rests on ${dropLeafSupportWords(leaf.length, leaf.joint)}${dropLeafSupportWords(leaf.length, leaf.joint).includes('bracket') ? ' hinged to the apron' : ''}.`;
  if (leaf.both) return `${L.value(leaf.length)} at the ${leafSidesWords(leaf.edge, true)} each folds down under its joint; with both up the top is ${up}. Each is a panel of its own, square at the joint, and rests on ${dropLeafSupportWords(leaf.length, leaf.joint)}${dropLeafSupportWords(leaf.length, leaf.joint).includes('bracket') ? ' hinged to the apron' : ''}.`;
  return `${L.value(leaf.length)} at the ${leafEdgeWords(leaf.edge)} folds down under the joint; with it up the top is ${up}. ${rests}`;
});
const setTopMaterial = (id: string) => (id ? (frame.value.top.materialId = id) : delete frame.value.top.materialId);
const JOINTS = [
  { title: 'Pocket screws from the aprons into the legs', value: 'pocketScrews' },
  { title: 'Bought corner braces, a hanger bolt into each leg', value: 'braces' },
  { title: 'Dowels, drilled through a printed jig', value: 'dowels' },
];
const setJoint = (joint: string) => (joint === 'braces' || joint === 'dowels' ? (frame.value.joint = joint) : delete frame.value.joint);
/** The dowel jig's sizes for this table, as the jigs page takes them. */
const dowelJig = computed(() => {
  try {
    return frameDowelJig(frame.value, context.value, store.materials);
  } catch {
    return undefined;
  }
});
const TOP_EDGES = [
  { title: 'A solid wood strip', value: 'strip' },
  { title: 'Edge banding', value: 'banding' },
  { title: 'Rounded over', value: 'roundover' },
  { title: 'Chamfered', value: 'chamfer' },
  { title: 'Left square', value: 'none' },
];
function setEdge(kind: StoredFrame['top']['edge']['kind']) {
  frame.value.top.edge.kind = kind;
  if (kind === 'strip') addMaterialFromCatalog(store.project!, store.shop.materialCatalog, SOLID_WOOD_3_4_ID);
}

/** The table as it stands, or why it cannot be made. */
const layout = computed(() => {
  try {
    return { ...frameLayout(frame.value, context.value, store.materials), fasteners: frameFasteners(frame.value, context.value, store.materials) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});
const scene = computed(() => projectScene(store.project!, store.jobShop, store.shop.materialGroups));
const shown = computed(() => {
  const s = scene.value;
  if ('error' in s) return undefined;
  const ids = new Set(s.cabinets.find((c) => c.id === frame.value.id)?.partIds ?? []);
  return { ...s, parts: s.parts.filter((p) => ids.has(p.id)) };
});
const status = computed(() => {
  const { width, height, depth } = frame.value.size;
  return `${L.value(width.mm)} long × ${L.value(depth.mm)} wide × ${L.value(height.mm)} high${shown.value ? ` · ${shown.value.parts.length} parts` : ''}`;
});
const setupLine = computed(() => setupSummary(store.project!, store.shop.hardware, L.value));

const topics = computed((): Topic[] => {
  const f = frame.value;
  const edge = TOP_EDGES.find((e) => e.value === f.top.edge.kind)?.title.toLowerCase() ?? '';
  return [
    { id: 'piece', group: 'This piece', title: 'Piece', summary: status.value, words: 'Its name, how many are made, and its size over all: the top, and the height to its surface.', warn: 'error' in layout.value ? 1 : 0 },
    { id: 'legs', group: 'This piece', title: 'Legs', summary: f.legs.layers ? `${f.legs.layers} layers of ${materialName(f.legs.materialId)}` : materialName(f.legs.materialId), words: 'What the legs are cut from: square stock cut to length, or strips glued up.' },
    { id: 'aprons', group: 'This piece', title: 'Aprons', summary: `${L.value(f.aprons.height.mm)} tall, ${f.joint === 'braces' ? 'corner braces' : f.joint === 'dowels' ? 'dowels' : 'pocket screws'}`, words: 'The rails between the legs, under the top: their height, how far they stand in from the legs, and how they are joined.' },
    { id: 'shelf', group: 'This piece', title: 'Lower shelf', summary: f.shelf ? `${L.value(f.shelf.up.mm)} off the floor` : 'None', words: 'A shelf between the legs, lower down, cut round each leg: it stiffens long aprons.' },
    { id: 'top', group: 'This piece', title: 'Top', summary: madeTop.value.torsion ? `A torsion box, ${materialName(madeTop.value.torsion.skins.topId)} skins${frameTopFollows(f) ? ', as Setup' : ''}` : `${materialName(f.top.materialId ?? topSettingsOf(context.value).materialId)}, ${edge}`, words: 'The top: how far it is over the legs, its edge and what it is made of.' },
  ];
});
const nav = useTopics(() => topics.value, { keep: 'all' });
</script>

<template>
  <PageHeader title="Design" :status="status" :next="{ to: '/plan', title: 'Plan' }" />
  <div class="text-body-2 mb-3" data-test="setup-line">
    <span class="text-medium-emphasis">Setup:</span> {{ setupLine }} · <router-link to="/setup" class="text-primary">Change in Setup</router-link>
  </div>
  <div class="d-flex flex-wrap align-center ga-2 mb-4" data-test="piece-list">
    <v-chip
      v-for="p in pieces"
      :key="p.id"
      :color="p.id === frame.id ? 'primary' : undefined"
      :variant="p.id === frame.id ? 'flat' : 'outlined'"
      :data-test="`piece-chip-${p.id}`"
      @click="openPiece(p)"
    >
      {{ tagged(p.name, tags.get(p.id)) }}<template v-if="p.copies > 1"> × {{ p.copies }}</template>
    </v-chip>
    <v-menu>
      <template #activator="{ props: menu }">
        <v-btn v-bind="menu" variant="tonal" color="primary" size="small" :prepend-icon="mdiPlus" data-test="add-piece">Add</v-btn>
      </template>
      <v-list density="compact">
        <v-list-item v-for="s in ADDABLE" :key="s.id" :title="s.title" :subtitle="s.what" :data-test="`add-${s.id}`" @click="addOne(s)" />
        <v-divider />
        <v-list-item title="From another project…" subtitle="A copy of one of its pieces, in this project's style or as it was." data-test="add-from-project" @click="importing = true" />
      </v-list>
    </v-menu>
    <ImportPieceDialog v-model="importing" @added="imported" />
    <v-spacer />
    <v-btn variant="text" size="small" color="error" :prepend-icon="mdiTrashCanOutline" :disabled="pieces.length === 1" data-test="delete-piece" @click="deleteOne">Delete</v-btn>
  </div>

  <TopicShell :nav="nav" name="frame" icon="cabinet" :lg="[3, 4, 5]" :xl="[2, 4, 6]">
    <template #notice>
      <v-alert v-if="'error' in layout" type="warning" variant="tonal" density="compact" class="mb-4" data-test="frame-error">{{ layout.error }}</v-alert>
    </template>

    <div v-show="nav.current.id === 'piece'">
      <v-row density="compact">
        <v-col cols="8"><v-text-field v-model="frame.name" label="Name" hide-details data-test="frame-name" /></v-col>
        <v-col cols="4">
          <v-text-field :model-value="frame.quantity" label="Quantity" type="number" min="1" hide-details data-test="frame-quantity" @update:model-value="frame.quantity = Math.max(1, Math.floor(Number($event)) || 1)" />
        </v-col>
        <v-col cols="4"><LengthField v-model="frame.size.width" label="Length" data-test="frame-width" /></v-col>
        <v-col cols="4"><LengthField v-model="frame.size.depth" label="Width" data-test="frame-depth" /></v-col>
        <v-col cols="4"><LengthField v-model="frame.size.height" label="Height" data-test="frame-height" /></v-col>
      </v-row>
      <div class="text-body-2 text-medium-emphasis mt-2">
        The size is the whole table: its top's length and width, and its height from the floor to the top's surface. The legs stand in from the
        top's edges by its overhang, and are as long as the height less the top.
      </div>
    </div>

    <div v-show="nav.current.id === 'legs'">
      <v-select :model-value="frame.legs.layers ? 'layers' : 'square'" label="The legs are" :items="LEG_KINDS" hide-details class="mb-3" data-test="frame-leg-kind" @update:model-value="setLegKind($event)" />
      <v-row v-if="frame.legs.layers" density="compact">
        <v-col cols="8"><v-select :model-value="frame.legs.materialId" label="Glued up from" :items="layerChoices" hide-details data-test="frame-legs" @update:model-value="setLegs($event)" /></v-col>
        <v-col cols="4"><v-select v-model="frame.legs.layers" label="Layers" :items="[2, 3, 4]" hide-details data-test="frame-leg-layers" /></v-col>
      </v-row>
      <v-select v-else :model-value="frame.legs.materialId" label="Leg stock" :items="legChoices" hide-details data-test="frame-legs" @update:model-value="setLegs($event)" />
      <div v-if="!('error' in layout)" class="text-body-2 text-medium-emphasis mt-3" data-test="frame-legs-words">
        <template v-if="layout.layers">
          Four legs, each {{ layout.layers }} strips glued face to face: {{ L(layout.leg) }} square and {{ L(layout.legHeight) }} long. The strips are
          cut on the saw like any board, glued up, then trimmed square and cut to length together. No stock is bought that the shop does not already use.
        </template>
        <template v-else>
          Four legs, {{ L(layout.leg) }} square as measured and {{ L(layout.legHeight) }} long, cut to length on the miter saw, all four against one
          stop so that they match. The stock is one of the project's materials: measure yours under Materials in Setup.
        </template>
        Nothing is cut in a leg.
      </div>
    </div>

    <div v-show="nav.current.id === 'aprons'">
      <v-row density="compact">
        <v-col cols="6"><LengthField v-model="frame.aprons.height" label="Height" data-test="frame-apron-height" /></v-col>
        <v-col cols="6"><LengthField v-model="frame.aprons.setback" label="In from the legs' faces" /></v-col>
        <v-col cols="12"><v-select :model-value="frame.aprons.materialId ?? ''" label="Material" :items="apronChoices" hide-details @update:model-value="setApronMaterial($event)" /></v-col>
        <v-col cols="12"><v-select :model-value="frame.joint ?? 'pocketScrews'" label="Joined to the legs by" :items="JOINTS" hide-details data-test="frame-joint" @update:model-value="setJoint($event)" /></v-col>
      </v-row>
      <div v-if="!('error' in layout)" class="text-body-2 text-medium-emphasis mt-3" data-test="frame-apron-words">
        Two aprons {{ L(layout.span.long) }} long and two {{ L(layout.span.short) }} long, between the legs, their tops flush with the tops of the legs.
        <template v-if="frame.joint === 'braces'">A bought corner brace in each corner is screwed to the two aprons and drawn tight to the leg by a hanger bolt: it comes apart again.</template>
        <template v-else-if="frame.joint === 'dowels'">
          Two 3/8" dowels at each end of each apron, glued. Their holes are in the aprons' ends and in the legs, where the CNC does not reach: they are
          drilled by hand through <router-link to="/jigs?item=dowel-jig" class="text-primary" data-test="frame-dowel-jig">the printed dowel jig</router-link>, which
          drills both halves of a joint so that they meet<template v-if="dowelJig">. For this table type there: apron {{ store.cncLength(dowelJig.thickness) }}, setback
          {{ store.cncLength(dowelJig.setback) }}, {{ store.cncLength(dowelJig.spacing) }} between the dowels</template>.
        </template>
        <template v-else>Two pocket screws through each end of each apron, from its inside face, into the leg, with glue.</template>
      </div>
    </div>

    <div v-show="nav.current.id === 'shelf'">
      <v-switch :model-value="!!frame.shelf" label="A lower shelf between the legs" color="primary" density="compact" hide-details data-test="frame-shelf" @update:model-value="setShelf(!!$event)" />
      <v-row v-if="frame.shelf" density="compact" class="mt-1">
        <v-col cols="6"><LengthField v-model="frame.shelf.up" label="Its top, off the floor" data-test="frame-shelf-up" /></v-col>
        <v-col cols="6"><LengthField :model-value="frame.shelf.inset ?? null" label="In from the legs' faces" optional hint="Empty: as far as the aprons" @update:model-value="setShelfInset($event)" /></v-col>
        <v-col cols="12"><v-select :model-value="frame.shelf.materialId ?? ''" label="Material" :items="shelfChoices" hide-details @update:model-value="setShelfMaterial($event)" /></v-col>
      </v-row>
      <div class="text-body-2 text-medium-emphasis mt-3" data-test="frame-shelf-words">
        <template v-if="frame.shelf">
          One panel, cut round each leg on the CNC (a notch in each corner, with dog-bones so that a square leg seats). It goes in with the
          last apron, glued, with a pocket screw up into each leg.
        </template>
        <template v-else>A shelf lower down ties the legs together where the aprons are long and the table is tall and narrow, as a sofa table is.</template>
      </div>
    </div>

    <div v-show="nav.current.id === 'top'">
      <v-row density="compact">
        <v-col cols="4"><LengthField v-model="frame.top.overhang.front" label="Over the front legs" data-test="frame-top-front" /></v-col>
        <v-col cols="4"><LengthField v-model="frame.top.overhang.ends" label="Over each end" /></v-col>
        <v-col cols="4"><LengthField v-model="frame.top.overhang.back" label="Over the back legs" /></v-col>
        <v-col cols="12"><OwnTopMade :top="frame.top" :setup="context.tops?.kind === 'torsion' ? 'torsion' : 'slab'" /></v-col>
        <v-col cols="12"><OwnTopLeaf :top="frame.top" :box="!!madeTop.torsion" :titles="{ back: 'Along the back' }" pair :line="leafLine" /></v-col>
      </v-row>
      <v-row v-if="!madeTop.torsion" density="compact">
        <v-col cols="7"><v-select :model-value="frame.top.edge.kind" label="Its edge, all round" :items="TOP_EDGES" hide-details data-test="frame-top-edge" @update:model-value="setEdge($event)" /></v-col>
        <v-col v-if="frame.top.edge.kind === 'strip'" cols="5">
          <LengthField :model-value="frame.top.edge.thickness ?? null" label="Strip thickness" @update:model-value="$event && (frame.top.edge.thickness = $event)" />
        </v-col>
        <v-col v-if="frame.top.edge.kind === 'roundover' || frame.top.edge.kind === 'chamfer'" cols="5">
          <LengthField :model-value="frame.top.edge.size ?? null" :label="frame.top.edge.kind === 'roundover' ? 'Radius' : 'Chamfer'" @update:model-value="$event && (frame.top.edge.size = $event)" />
        </v-col>
        <v-col cols="12"><v-select :model-value="frame.top.materialId ?? ''" label="Material" :items="topChoices" hide-details @update:model-value="setTopMaterial($event)" /></v-col>
      </v-row>
      <div v-if="!('error' in layout)" class="text-body-2 text-medium-emphasis mt-3" data-test="frame-top-words">
        The overhang is from the legs' outside faces to the top's edge. The top is held down by {{ layout.fasteners }} figure-8 fasteners: a small
        steel plate shaped like an 8, one loop screwed to the top edge of an apron and the other up into the top.
        <template v-if="madeTop.torsion">Under a torsion box their screws hold only in its bottom skin, so it is glued to the aprons as well.</template>
        <template v-else>It swivels, so a solid wood top can swell and shrink across its width without splitting.</template>
      </div>
    </div>

    <template #last><v-btn to="/plan" color="primary" variant="flat">Next: Plan</v-btn></template>

    <template #picture>
      <v-card class="pa-5" data-test="frame-picture">
        <PanelTitle icon="view">
          3D view
          <template #actions>
            <ViewLookSelect />
            <v-btn-toggle v-if="pieces.length > 1" v-model="showAll" mandatory density="compact" variant="outlined" divided data-test="frame-view-scope">
              <v-btn :value="false" size="small">This piece</v-btn>
              <v-btn :value="true" size="small">All {{ pieces.length }}</v-btn>
            </v-btn-toggle>
          </template>
        </PanelTitle>
        <v-alert v-if="'error' in scene" type="warning" variant="tonal" density="compact">{{ scene.error }}</v-alert>
        <CabinetAssemblyView
          v-else-if="showAll && pieces.length > 1"
          :parts="scene.parts"
          :cabinets="scene.cabinets"
          :room="scene.room"
          frame-key="all"
          :hardware="scene.hardware"
          :finish="scene.finish"
          :faces="scene.faces"
          :slides="scene.slides"
          :casters="scene.casters"
          :appliances="scene.appliances"
          :looks="scene.looks"
          :start-full="startFull"
          :start-explode="startExplode"
          :start-leaf="startLeaf"
          :start-look="startLook"
          look-elsewhere
          :material-names="materialNames"
          :cut-by="cutBy"
        />
        <CabinetAssemblyView
          v-else-if="shown"
          :parts="shown.parts"
          :frame-key="frame.id"
          :hardware="shown.hardware"
          :finish="shown.finish"
          :faces="shown.faces"
          :looks="shown.looks"
          :start-full="startFull"
          :start-explode="startExplode"
          :start-leaf="startLeaf"
          :start-look="startLook"
          look-elsewhere
          :material-names="materialNames"
          :cut-by="cutBy"
        />
        <div v-if="shown" class="text-body-2 text-medium-emphasis mt-3" data-test="frame-parts">
          {{ shown.parts.length }} parts: {{ shown.parts.filter((p) => p.role === 'leg').length }} legs, {{ shown.parts.filter((p) => p.role === 'apron').length }} aprons, the top{{
            shown.parts.some((p) => p.role === 'topEdge') ? ' and its edge strips' : ''
          }}. Their sizes and how each is cut are on Plan.
        </div>
      </v-card>
    </template>
  </TopicShell>
</template>
