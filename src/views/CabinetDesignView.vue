<script setup lang="ts">
import CabinetSettingsFields from '@/components/CabinetSettingsFields.vue';
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import { BAY_COUNT } from '@/design/bays';
import ImportPieceDialog from '@/components/ImportPieceDialog.vue';
import PlacementFields from '@/components/PlacementFields.vue';
/**
 * Design for a designed cabinet: its size, style and materials, the openings its
 * layout gives, the doors and the drawer front on them, the parts, and the assembly
 * in 3D. What the two construction styles change comes from the style layer
 * (`design/style.ts`), and what the case joints change from `design/joints.ts`. A
 * face frame is drawn with its stiles, rails and pocket holes, and a drawer with its
 * box and, behind a face frame, its build-out strips. The sides carry the holes for
 * the hardware (`design/hardwareHoles.ts`): shelf pins, hinge plates, slide screws.
 *
 * A project holds several cabinets: the list above the cards selects the one the
 * cards, the 3D view and the parts list are about, and adds, copies, deletes and
 * reorders them. `#/design?cabinet=2` opens on the second.
 */
import { mdiArrowLeft, mdiArrowRight, mdiChevronDown, mdiChevronRight, mdiContentCopy, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { computed, defineAsyncComponent, nextTick, ref, provide, watch } from 'vue';
import { projectLayoutWarnings } from '@/design/scene';
import { useRoute, useRouter } from 'vue-router';
import DoorSetCards from '@/components/DoorSetCards.vue';
import DrawerCards from '@/components/DrawerCards.vue';
import HelpText from '@/components/HelpText.vue';
import ViewLookSelect from '@/components/ViewLookSelect.vue';
import { lookFromQuery, useViewLookData } from '@/components/viewLook';
import WarningLines from '@/components/WarningLines.vue';
import OwnTopLeaf from '@/components/OwnTopLeaf.vue';
import OwnTopMade from '@/components/OwnTopMade.vue';
import TopChoice from '@/components/TopChoice.vue';
import TopicShell from '@/components/TopicShell.vue';
import { type SubTopic, type Topic, useTopics } from '@/components/topics';
import RoomLookFields from '@/components/RoomLookFields.vue';
import PiecePicker, { type PickerGroup } from '@/components/PiecePicker.vue';
import { pieceGroups } from '@/design/pieceGroups';
import LengthField from '@/components/LengthField.vue';
import PageHeader from '@/components/PageHeader.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import SubHead from '@/components/SubHead.vue';
import {
  BACK_GROOVE_DEPTH,
  BACK_GROOVE_INSET,
  BACK_RABBET_DEPTH,
  BOX_GROOVE_DEPTH,
  BOX_GROOVE_UP,
  BOX_RABBET_DEPTH,
  CASE_DADO_DEPTH,
  CASE_SCREW,
  CASE_SCREW_HOLE,
  CLEAT_WIDTH,
  DRAWER_COUNT,
  EDGE_BAND_THICKNESS,
  HANGING_RAIL_WIDTH,
  JOINED_PARTS,
  LAYOUT_PRESETS,
  type LayoutPreset,
  type JoinedPart,
  addToRun,
  asOpening,
  cabinetIdOf,
  cabinetTags,
  cabinetsOf,
  copiesOf,
  createRun,
  deleteRun,
  caseJointOf,
  deriveCabinetOpenings,
  deriveCabinetParts,
  deriveDrawerBoxParts,
  deriveParts,
  designsOf,
  doorHandleEnd,
  finishesOf,
  faceFinishes,
  INSIDE_FINISHES,
  insideFinishOf,
  slideMountsOf,
  traySlideMounts,
  hasOwnSettings,
  isDoorSet,
  isDrawer,
  layoutPresetOf,
  layoutsOf,
  partBox,
  cabinetBack,
  partFaces,
  removeFromRun,
  layOutCabinets,
  dividerWords,
  BOTTOM_KINDS,
  CASTER_UNDER_CHOICES,
  casterUnderChoice,
  setCasterUnderChoice,
  type BottomKind,
  bottomKindOf,
  casterGroups,
  casterShares,
  casterLoadProblems,
  setBottomKind,
  boxOffFloor,
  casterFor,
  shownTopParts,
  applianceShapes,
  sinkShapes,
  SINK,
  SINK_MOUNTS,
  newSink,
  sinkOfKind,
  falseFrontProblems,
  FARMHOUSE,
  apronOf,
  farmhouseRow,
  faucetSpread,
  holesInTop,
  sinkProblems,
  sinkWords,
  takesTopSupport,
  takesNoBack,
  shelfWarnings,
  tipWarnings,
  takesRod,
  standOn,
  standablePieces,
  takesSpans,
  towerSpans,
  closetRod,
  hangingWords,
  rodShapes,
  takesSink,
  obstacleName,
  takesExisting,
  existingProblems,
  existingRowFronts,
  existingInsideWidth,
  measuredInside,
  existingShellParts,
  deriveUnderSink,
  TALL_TRAY_WALL,
  RACK_DOORS,
  createDoorRacks,
  createOrganizer,
  organizerName,
  createUnderSink,
  obstacleShapes,
  hubShapes,
  stoolShapes,
  hubProblems,
  frameOverhangOf,
  susanShapes,
  susanOf,
  SUSAN_TURNS,
  SUSAN_RIMS,
  SUSAN_RIM_HARDBOARD_ID,
  createObstacle,
  OBSTACLE_KINDS,
  MOUNTINGS,
  trayMounting,
  deriveWayIn,
  applianceFootprint,
  addAppliance,
  APPLIANCE_KINDS,
  topPieces,
  islandOf,
  topSettingsOf,
  topSettingsFor,
  topWarnings,
  leafEdgeClosed,
  leafEdgeWords,
  dropLeafSupportWords,
  addMaterialFromCatalog,
  materialTitle,
  lShapedFace,
  lazySusanDiameter,
  frontWidth,
  groupFootprint,
  runPlacementsOf,
  placeGroups,
  cabinetGroupKey,
  runEnds,
  starterRoom,
  pastCeiling,
  roomWords,
  shownRoom,
  cabinetPlaces,
  inRoom,
  runCabinets,
  runFit,
  runKindOf,
  runWidth,
  setOwnSettings,
  shelfPinFor,
  shelfPinLevels,
  standardStartSizes,
  cabinetDifferences,
  cornerTile,
  layoutTile,
  frontDifferences,
  setupSummary,
  tagged,
} from '@/design';
import { templatesHtml } from '@/job/templatesHtml';
import type { Appliance, CabinetOpening, SinkMount, DesignedCabinetContext, Length, Obstacle, ObstacleKind, OpeningRow, Organizer, Part, Placement, RoomWall, Run, RunEnd } from '@/model';
import { activeMachine, partLimit, pocketLedgesOf, withPocketLooks } from '@/plan';
import { materialLook } from '@/libraries';
import { makeBlind, makeLShaped, applyCabinetLayout, setBays, setBayOpen, setRowOpen, setRowSplit, copyCabinet, createCabinetDoorSet, createCabinetDrawer, deleteCabinet, EXISTING_DRAWERS_MAX, makeExisting, setExistingOpenings, makeMade, moveCabinet } from '@/samples/cabinet';
import { type Starter, addableStarters } from '@/samples/starters';
import { useAppStore } from '@/stores/app';
import { featureTags } from '@/ui/format';
import { len } from '@/units';
import { framesOf, storedCases } from '@/design/settings';

const store = useAppStore();
// Loaded on first use: it brings in Three.js and the solid-building worker.
const CabinetAssemblyView = defineAsyncComponent(() => import('@/components/CabinetAssemblyView.vue'));
// #/design?explode=100 opens with the parts pulled apart, ?open=90 with the doors open, ?drawer=100 with the drawers out.
const startExplode = Number(useRoute().query.explode) || 0;
const startOpen = Number(useRoute().query.open) || 0;
const startDrawer = Number(useRoute().query.drawer) || 0;
const startLeaf = Number(useRoute().query.leaf) || 0;
// ?full=1 opens with the 3D view filling the page.
const startFull = 'full' in useRoute().query;
// ?real=1 opens the 3D view in its realistic look and ?real=0 in its plain one, whatever was last chosen.
// (&look=basic|seethrough|lines|material|cut|realistic names any of its looks.)
const startLook = lookFromQuery(useRoute().query);
const { materialNames, cutBy } = useViewLookData();

const route = useRoute();
const router = useRouter();
const cabinets = computed(() => cabinetsOf(store.project!));
/** A, B, C in list order, once there is more than one cabinet. */
const tags = computed(() => cabinetTags(store.project!));
/** The cabinet on screen, by its place in the list: `?cabinet=2` is the second. */
const selected = computed(() => Math.min(cabinets.value.length, Math.max(1, Math.floor(Number(route.query.cabinet)) || 1)) - 1);
const cabinet = computed(() => cabinets.value[selected.value]!);
const select = (index: number) => void router.replace({ query: { ...route.query, cabinet: String(index + 1) } });
/** A click on something that is not a cabinet (an appliance) selects nothing. */
const selectId = (id: string) => {
  const at = cabinets.value.findIndex((c) => c.id === id);
  if (at >= 0) select(at);
};
const BAY_COUNTS = Array.from({ length: BAY_COUNT.max }, (_, i) => i + 1);
/** A piece from another project: the dialog, and where its copy is opened. */
const importing = ref(false);
function imported(id: string) {
  if (tables.value.some((f) => f.id === id)) openTable(id);
  else selectId(id);
}
/** The project's tables, and the way to one's own Design. */
const tables = computed(() => framesOf(store.project!));
const openTable = (id: string) => void router.replace({ query: { piece: id } });
/** What can be added: the starters that are one cabinet (`src/samples/starters.ts`), the list a new project also starts from. */
const ADDABLE = addableStarters();
function addOne(starter: Starter) {
  const names = new Set(cabinets.value.map((c) => c.name));
  const stem = starter.stem ?? 'Cabinet';
  let n = cabinets.value.length + 1;
  while (names.has(`${stem} ${n}`)) n++;
  const added = starter.add!(store.project!, `${stem} ${n}`, cabinet.value.id, store.shop);
  // A table is a piece of another kind: it opens on its own Design.
  if (tables.value.some((f) => f.id === added.id)) openTable(added.id);
  else selectId(added.id);
}
/**
 * Runs: cabinets that stand side by side as one piece. The chips are grouped by run;
 * the cabinet on screen is put into one, or taken out, on its card, and the run has a
 * card of its own for its name and what its ends meet.
 */
const context = computed(() => store.project!.context as DesignedCabinetContext);
const run = computed(() => (cabinet.value.runId ? context.value.runs.find((r) => r.id === cabinet.value.runId) : undefined));
/**
 * The picker's menu (`PiecePicker.vue`): the cabinets by where they stand (`pieceGroups`: each
 * wall's base cabinets and uppers in a room, the runs without one), then the tables, each with a Design of its own.
 */
const pickerGroups = computed<PickerGroup[]>(() => {
  const byId = new Map(cabinets.value.map((c) => [c.id, c]));
  const label = (c: { id: string; name: string }, stem: string) => `${tagged(c.name || stem, tags.value.get(c.id))}${copiesOf(c as never) > 1 ? ` × ${copiesOf(c as never)}` : ''}`;
  const groups: PickerGroup[] = pieceGroups(store.project!).map((g) => ({
    key: g.key,
    ...(g.name ? { name: g.name } : {}),
    items: g.ids.map((id) => byId.get(id)!).map((c) => ({ id: c.id, label: label(c, 'Cabinet'), own: !!c.overrides })),
  }));
  if (tables.value.length) groups.push({ key: 'tables', name: 'Tables', items: tables.value.map((f) => ({ id: f.id, label: label(f, 'Table') })) });
  // One group has no need of a name unless it says where things stand.
  return groups;
});
/** A pick from the picker: a table opens on its own Design. */
const pickPiece = (id: string) => (tables.value.some((f) => f.id === id) ? openTable(id) : selectId(id));
/** Where the cabinet may stand: on its own, in a run of its kind, or in a new one. */
const runChoices = computed(() => [
  { title: 'On its own', value: '' },
  ...context.value.runs
    .filter((r) => r.id === cabinet.value.runId || runKindOf(runCabinets(context.value, r)[0]?.form ?? 'base') === runKindOf(cabinet.value.form))
    .map((r) => ({ title: `In the run "${r.name}"`, value: r.id })),
  { title: 'In a new run', value: 'new' },
]);
function standIn(value: string) {
  const id = cabinet.value.id;
  if (value === '') removeFromRun(store.project!, id);
  else if (value === 'new') createRun(store.project!, [id]);
  else addToRun(store.project!, value, id);
  // Joining a run moves the cabinet in the list: stay on it.
  selectId(id);
}
const ENDS: { title: string; value: RunEnd }[] = [
  { title: 'Open: the side shows', value: 'open' },
  { title: 'Against a wall', value: 'wall' },
];
const runSummary = computed(() => {
  const r = run.value;
  if (!r) return '';
  const n = r.cabinetIds.length;
  const end = (e: RunEnd) => (e === 'wall' ? 'wall' : 'open');
  const ends = runEnds(context.value, r);
  return `${n} ${n === 1 ? 'cabinet' : 'cabinets'} · ${L.value(runWidth(context.value, r))} long · ${end(ends.left)} on the left, ${end(ends.right)} on the right`;
});
/** How the run fills its length: what is left over, and the fillers at its wall ends. */
const fit = computed(() => (run.value ? runFit(context.value, run.value) : undefined));
function dissolveRun() {
  const id = cabinet.value.id;
  if (run.value) deleteRun(store.project!, run.value.id);
  selectId(id);
}

/** The widths Setup offers for this cabinet's form, as quick picks beside the width. */
const standardWidths = computed(() => (context.value.sizes ?? standardStartSizes()).widths[cabinet.value.form]);
/** A corner cabinet (milestone 6): none, or a blind corner blind on its left or right side. */
/** The kinds of corner, each a tile: the cabinet from above, the room's corner at its left or its right. */
const cornerTiles = computed(() =>
  CORNERS.map((c) => {
    const [kind, side] = c.value.split('-') as ['blind' | 'diagonal' | 'lShaped' | '', 'left' | 'right' | undefined];
    return { value: c.value, title: c.short, note: c.title, drawing: cornerTile(kind || undefined, side) };
  }),
);
const CORNERS = [
  { title: 'Not a corner cabinet', value: '', short: 'None' },
  { title: 'Blind corner, blind on the left', value: 'blind-left', short: 'Blind, left' },
  { title: 'Blind corner, blind on the right', value: 'blind-right', short: 'Blind, right' },
  { title: 'Diagonal, the corner at its left', value: 'diagonal-left', short: 'Diagonal, left' },
  { title: 'Diagonal, the corner at its right', value: 'diagonal-right', short: 'Diagonal, right' },
  { title: 'L-shaped (lazy susan), the corner at its left', value: 'lShaped-left', short: 'L-shaped, left' },
  { title: 'L-shaped (lazy susan), the corner at its right', value: 'lShaped-right', short: 'L-shaped, right' },
];
const cornerKind = computed({
  get: () => (cabinet.value.corner ? `${cabinet.value.corner.kind}-${cabinet.value.corner.side}` : ''),
  set: (value: string) => {
    const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
    if (!value) return void delete stored.corner;
    const [kind, side] = value.split('-') as ['blind' | 'diagonal' | 'lShaped', 'left' | 'right'];
    if (kind === 'lShaped') {
      if (stored.corner?.kind === 'lShaped') stored.corner = { kind, side };
      else makeLShaped(store.project!, stored.id, side);
      return;
    }
    if (kind === 'diagonal') {
      // 36" along each wall for a base cabinet, 24" for a wall one (tune me); doors only.
      if (stored.corner?.kind !== 'diagonal') {
        stored.size.width = len(cabinet.value.form === 'wall' ? '24"' : '36"');
        if (layout.value?.preset !== 'doors') applyCabinetLayout(store.project!, cabinet.value, 'doors');
      }
      stored.corner = { kind: 'diagonal', side };
      return;
    }
    // The other run's depth and its doors, and 3" to clear; widened when too narrow for an opening beside it.
    makeBlind(store.project!, stored.id, side);
  },
});
/** A wall cabinet: no toe kick, a top panel, doors only, hung on the wall. */
const wall = computed(() => cabinet.value.form === 'wall');
const copyOne = () => selectId(copyCabinet(store.project!, cabinet.value.id).id);
function deleteOne() {
  const at = selected.value;
  deleteCabinet(store.project!, cabinet.value.id);
  select(Math.min(at, cabinets.value.length - 1));
}
function moveOne(by: -1 | 1) {
  const id = cabinet.value.id;
  moveCabinet(store.project!, id, by);
  selectId(id);
}
const L = computed(() => store.sizeLength);
/**
 * The construction settings are the project's: an input writes to the project unless
 * this cabinet has its own copy of that group of settings, which these switches make
 * and drop. `cabinet` is a view that reads and writes whichever applies.
 */
const ownConstruction = computed({
  get: () => hasOwnSettings(cabinet.value, 'construction'),
  set: (own: boolean) => setOwnSettings(store.project!, cabinet.value.id, 'construction', own),
});
const ownCase = computed({
  get: () => hasOwnSettings(cabinet.value, 'caseAndJoinery'),
  set: (own: boolean) => setOwnSettings(store.project!, cabinet.value.id, 'caseAndJoinery', own),
});
/** What this cabinet's own settings make different from Setup, and Setup in a line. */
const differs = computed(() => cabinetDifferences(store.project!, cabinet.value.id));
const setupLine = computed(() => setupSummary(store.project!, store.shop.hardware, L.value));
function followSetup() {
  ownConstruction.value = false;
  ownCase.value = false;
}
/**
 * The cabinet's parts that are longer than one set-up on the CNC: which part, how long, and what Plan's rules do
 * with it.
 */
const partLimits = computed(() => {
  const machine = activeMachine(store.jobShop);
  // Only the machine counts, never the sheet on hand (the material is bought as it is needed): a part
  // bigger than the sheet set in Setup is cut from a piece that takes it.
  const seen = new Set<string>();
  return caseParts.value.flatMap((part) => {
    const limit = partLimit(part.size, machine, { width: Infinity, height: Infinity });
    const long = Math.max(part.size.width, part.size.height);
    const key = `${part.name}|${limit}|${Math.round(long)}`;
    // A part Plan cuts on a saw anyway is not held back by the CNC's reach.
    const planned = store.job.job?.plan.parts.find((p) => p.partId === part.id)?.cutOut;
    if (limit === 'tiled' && planned && planned !== 'cnc') return [];
    if (limit === 'fits' || seen.has(key)) return [];
    seen.add(key);
    return [`${part.name}, ${L.value(long)} long: ${PART_LIMIT_WORDS[limit]}.`];
  });
});
/** Several of them are one line that opens: what they have in common, when it is the sheet. */
const partLimitsSummary = computed(() => {
  const n = partLimits.value.length;
  return `${n} parts are too big for one set-up on the CNC.`;
});
const PART_LIMIT_WORDS = {
  fits: '',
  tiled: 'longer than one set-up on the CNC, so it is tiled in two set-ups',
  saw: 'too big for the CNC, so it goes to the saw and its holes are made by hand',
  noStock: '',
} as const;
const framed = computed(() => cabinet.value.construction === 'faceFrame');
/** The shop style: a frameless case with inset fronts. */
const inset = computed(() => cabinet.value.construction === 'shop');
const styleName = computed(() => (framed.value ? 'face frame' : inset.value ? 'inset' : 'frameless'));
/** On casters (milestone 9): how far the box stands off the floor, and the caster's name. */
const casterLift = computed(() => (cabinet.value.form === 'wall' ? undefined : boxOffFloor(cabinet.value, store.materials, store.shop.hardware)));
const casterName = computed(() => (cabinet.value.toeKick.casters ? casterFor(cabinet.value.toeKick.casters.casterId, store.shop.hardware).name : ''));
/** Off: a flat bottom. The toe kick's sizes stay in the project. */
const toeKickOn = computed({
  get: () => !cabinet.value.toeKick.off,
  set: (on: boolean) => {
    if (on) delete cabinet.value.toeKick.off;
    else cabinet.value.toeKick.off = true;
  },
});

const derived = computed<{ caseParts: Part[]; shell: Part[]; fronts: Part[]; openings: CabinetOpening[]; error?: string }>(() => {
  try {
    return {
      caseParts: deriveCabinetParts(store.project!, store.jobShop),
      // The cases that are already there: drawn, never among the parts.
      // What is only drawn: the shell of a case that is already there, and a bought hanging rod.
      shell: [...existingShellParts(store.project!, store.jobShop), ...rodShapes(store.project!, store.materials)],
      fronts: deriveParts(store.project!, store.jobShop),
      openings: deriveCabinetOpenings(cabinet.value, store.materials),
    };
  } catch (e) {
    return { caseParts: [], shell: [], fronts: [], openings: [], error: e instanceof Error ? e.message : String(e) };
  }
});
/**
 * What belongs to the cabinet on this screen: the cabinet itself and the fronts on
 * its openings. Every cabinet's parts are in its own frame, so the parts of another
 * one must not be drawn or listed here: they would lie on top of this one's.
 */
const ownIds = computed(() => {
  const prefix = `${cabinet.value.id}/`;
  return new Set([cabinet.value.id, ...designsOf(store.project!).filter((d) => d.mounting.openingId.startsWith(prefix)).map((d) => d.id)]);
});
// A cabinet made several times is drawn and listed once.
const own = (parts: Part[]) => parts.filter((p) => ownIds.value.has(p.designObjectId) && (p.copy ?? 1) === 1);
const caseParts = computed(() => own(derived.value.caseParts));
const fronts = computed(() => own(derived.value.fronts));
/** The drawer boxes and their strips. A box that cannot be made is left out; its card says why. */
const boxParts = computed(() => {
  if (derived.value.error) return [];
  try {
    return own(deriveDrawerBoxParts(store.project!, store.jobShop));
  } catch {
    return [];
  }
});
/** What is in the way under a sink, for the picture of this cabinet only: blocks, never cut. */
const obstacles = computed(() => (derived.value.error ? [] : obstacleShapes(cabinet.value, store.materials)));
/** A lazy susan's rims bent round their shelves: drawn, never listed as parts (the flat strips are). */
const susanRims = computed(() => (derived.value.error ? [] : susanShapes([cabinet.value], store.materials)));
/** A power hub's bought pieces, drawn in its open space. */
const hubParts = computed(() => (derived.value.error ? [] : hubShapes(cabinet.value, store.materials)));
const allParts = computed(() => [...caseParts.value, ...boxParts.value, ...fronts.value, ...obstacles.value, ...hubParts.value]);
/** What the 3D view draws of this cabinet: its parts, and the shell of its case when that is already there. */
/** The parts as the 3D view draws their pocket holes: each as the job makes it (the Kreg jig's, or the CNC's kind of pocket). */
const pocketLooked = (parts: Part[]) => {
  const job = store.job.job;
  // With the ledges the job cuts round the pockets that get a printed cover.
  return withPocketLooks(parts, store.project!.plan, job?.plan.parts, job ? pocketLedgesOf(job.plan.operations, store.jobShop.tools) : undefined);
};
/**
 * A bought or measured top over this cabinet, and its sink, drawn with it (a top is its first cabinet's part, so a
 * cabinet on its own, as a vanity, has them): only drawn, never cut.
 */
const topShapes = computed(() => {
  if (derived.value.error) return [];
  try {
    return [...shownTopParts(store.project!, store.materials, store.shop.hardware), ...sinkShapes(store.project!, store.materials, store.shop.hardware)].filter((p) => p.designObjectId === cabinet.value.id);
  } catch {
    return [];
  }
});
const drawnParts = computed(() => [...own(derived.value.shell), ...allParts.value, ...susanRims.value, ...topShapes.value]);
/**
 * An existing case: the cabinet is already there and is measured here; nothing of its case
 * is made. The switch measures the cabinet as it is now, so nothing moves until a measurement is typed.
 */
const existing = computed(() => cabinet.value.existing);
const existingOffered = computed(() => !!existing.value || takesExisting(cabinet.value));
const CASE_KINDS = [
  { title: 'Made here', value: 'made' },
  { title: 'Already there: measured, nothing of it is made', value: 'existing' },
];
function setCaseKind(kind: string) {
  // A wall cabinet that is already there is here for new doors.
  if (kind === 'existing') makeExisting(store.project!, cabinet.value.id, cabinet.value.form === 'wall' ? 'new' : 'kept');
  else makeMade(store.project!, cabinet.value.id);
}
const EXISTING_FRAMES = [
  { title: 'With a face frame', value: 'faceFrame' },
  { title: 'Frameless', value: 'frameless' },
];
const EXISTING_DRAWER_FRONTS = [
  { title: 'Kept as it is', value: 'kept' },
  { title: 'A new front, made here', value: 'new' },
];
const EXISTING_FRONTS = [
  { title: 'Kept as they are', value: 'kept' },
  { title: 'New doors, made here', value: 'new' },
];
/** Whether the inside is measured: without it only new doors are made, and the case is drawn at a size taken from its opening. */
function setInsideMeasured(on: boolean) {
  const e = cabinet.value.existing;
  if (!e) return;
  if (on) e.inside ??= measuredInside(cabinet.value, store.materials);
  else delete e.inside;
}
const BLIND_SIDES = [
  { title: 'No: its opening is in the middle', value: 'none' },
  { title: 'Its box runs on to the left', value: 'left' },
  { title: 'Its box runs on to the right', value: 'right' },
];
/** A cabinet that is already there and runs on past its door opening on one side: a blind corner cabinet. */
function setExistingBlind(side: string) {
  const e = cabinet.value.existing;
  if (!e) return;
  if (side !== 'left' && side !== 'right') delete e.blind;
  else e.blind = { side, reach: e.blind?.reach ?? len('15"') };
}
/** Its drawer openings over the lowest opening, and whether that one holds doors or one more drawer. */
const DRAWER_OPENING_COUNTS = Array.from({ length: EXISTING_DRAWERS_MAX + 1 }, (_, n) => ({ title: n === 0 ? 'None' : String(n), value: n }));
const LOWEST_KINDS = [
  { title: 'Doors', value: 'doors' },
  { title: 'A drawer', value: 'drawer' },
];
const setExistingDrawerCount = (n: number) => setExistingOpenings(store.project!, cabinet.value.id, n, existing.value?.lowest ?? 'doors');
const setExistingLowest = (lowest: string) => setExistingOpenings(store.project!, cabinet.value.id, existing.value?.drawers?.length ?? 0, lowest === 'drawer' ? 'drawer' : 'doors');
/** A tray on the floor: on slides at its sides, as every tray, or on bottom-mount slides under it. */
const TRAY_SLIDES = [
  { title: 'At its sides, on the frame or the strips', value: 'sides' },
  { title: 'Under it: bottom-mount, full extension', value: 'bottom' },
];
function setBlindForward(o: Organizer, on: boolean) {
  if (on) o.forward = true;
  else delete o.forward;
}
function setTraySlides(o: Organizer, value: string) {
  if (value === 'bottom') o.slides = 'bottom';
  else delete o.slides;
}
const existingWrong = computed(() => (existing.value ? existingProblems(existing.value) : []));

/**
 * The 3D view shows this cabinet or the whole project: every cabinet once, in a row
 * in list order. `#/design?all=1` opens on the whole project.
 */
const showAll = ref('all' in route.query);
/**
 * Of the whole project, only the run this cabinet is in, or its island: by itself, with its top and without the
 * room (an island is hard to see with the rest of a kitchen round it).
 * `#/design?all=run` opens on it.
 */
const runOnly = ref(route.query.all === 'run');
/** The cabinets that reach past the room's ceiling. */
const tooTall = computed(() => pastCeiling(store.project!, cabinets.value, store.shop.hardware));
/** The project's groups on casters (milestone 9), and those whose casters carry less than the cabinets weigh. */
const casterSets = computed(() => {
  try {
    return casterGroups(store.project!, store.shop.hardware);
  } catch {
    return [];
  }
});
const casterLoad = computed(() => casterLoadProblems(casterSets.value, derived.value.caseParts, store.materials));
/** Every caster, under the cabinet that carries it, for the 3D view. */
const castersDrawn = computed(() =>
  [...casterShares(casterSets.value, store.materials).entries()].flatMap(([cabinetId, share]) => share.casters.map((c) => ({ cabinetId, ...c }))),
);
/** What this cabinet's casters are screwed to: its group's answer. */
const castersUnder = computed(() => casterSets.value.find((x) => x.members.some((m) => m.cabinet.id === cabinet.value.id))?.under ?? 'layer');
/** A run's (or its island's) casters in words: how many, which, and how high the boxes stand. */
const casterWords = computed(() => {
  const g = casterSets.value.find((x) => x.members.some((m) => m.cabinet.id === cabinet.value.id));
  const lift = boxOffFloor(cabinet.value, store.materials, store.shop.hardware);
  if (!g || lift === undefined) return '';
  return `: ${g.places.length} casters (${g.caster.name}), ${g.caster.locking ? 'all with a brake' : 'the two at the front ends with a brake'}; the boxes stand ${L.value(lift)} off the floor, their tops at ${L.value(lift + cabinet.value.size.height.mm)}`;
});
/** A run's bottom, and its island's other row with it: one island stands on one set of casters. */
function setGroupBottom(kind: BottomKind) {
  const runs = island.value ? context.value.runs.filter((r) => island.value!.rows.includes(r.id)) : run.value ? [run.value] : [];
  for (const r of runs) setBottomKind(r.shared.toeKick, kind, store.shop.hardware);
}
/** What a run's casters are screwed to, and its island's other row's with it. */
function setGroupCasterUnder(choice: Parameters<typeof setCasterUnderChoice>[1]) {
  const runs = island.value ? context.value.runs.filter((r) => island.value!.rows.includes(r.id)) : run.value ? [run.value] : [];
  for (const r of runs) setCasterUnderChoice(r.shared.toeKick, choice);
}
/** The project's room, in mm, for the 3D view. */
const room = computed(() => {
  const r = context.value.room;
  if (!r) return undefined;
  return shownRoom(r);
});
/** The room as the whole-project view draws it: with the tile on its walls behind what stands against them. */
const roomDrawn = computed(() => (context.value.room ? shownRoom(context.value.room, projectParts.value, projectPlaces.value) : undefined));
/** How each of the project's materials looks bare in the 3D view: its type's colour and what is drawn on it. */
const materialLooks = computed(() => Object.fromEntries(store.materials.flatMap((m) => {
  const look = materialLook(m, store.shop.materialGroups);
  return look ? [[m.id, look]] : [];
})));
/** The appliances as the whole-project view draws them: a block each, where it stands. */
const applianceBlocks = computed(() => (store.materials[0] ? applianceShapes(store.project!, store.materials[0].id) : []));
/** What each appliance's block is, so the 3D view draws its doors, handles and burners on it. (A sink draws itself.) */
const applianceLooks = computed(() => {
  const kindOf = new Map(appliances.value.map((a) => [a.id, a.kind]));
  const blocks = applianceBlocks.value.map((a) => ({ partId: a.part.id, kind: kindOf.get(a.id)!, ...(a.kick ? { kick: a.kick } : {}) }));
  return blocks;
});
/** With a room the whole project is worth showing even with one cabinet: it stands in the room. */
const canShowAll = computed(() => cabinets.value.length > 1 || !!room.value);
/** On a phone: the fields or the picture. A wider window shows both, and this is not looked at. */
const phoneShows = ref<'fields' | 'view'>('fields');
const wholeProject = computed(() => showAll.value && canShowAll.value);
/** The view's picture is the project's on the Projects page when it shows all of it: every cabinet, or the only one. */
const keepPicture = (dataUrl: string) => {
  if (wholeProject.value || cabinets.value.length === 1) store.setThumbnail(dataUrl);
};
const projectParts = computed(() => {
  if (!wholeProject.value || derived.value.error) return [];
  let boxes: Part[] = [];
  try {
    boxes = deriveDrawerBoxParts(store.project!, store.jobShop);
  } catch {
    // A box that cannot be made is left out; its card says why.
  }
  // Bought and measured tops are drawn, never cut: slabs for the picture only.
  const shownTops = shownTopParts(store.project!, store.materials, store.shop.hardware);
  // Appliances too: a block each, and a sink's basin in its top.
  const basins = sinkShapes(store.project!, store.materials, store.shop.hardware);
  return [...derived.value.caseParts, ...derived.value.shell, ...boxes, ...derived.value.fronts, ...shownTops, ...basins, ...applianceBlocks.value.map((a) => a.part), ...cabinets.value.flatMap((c) => hubShapes(c, store.materials)), ...stoolShapes(store.project!, store.materials)].filter((p) => (p.copy ?? 1) === 1);
});
/** What the layout needs of every cabinet. `back` and the fillers come from the parts, which only the whole-project view builds. */
const laid = (back: (id: string) => number, filler: (id: string, end: 'left' | 'right') => number | undefined) =>
  cabinets.value.map((c) => ({
    id: c.id,
    width: c.size.width.mm,
    back: back(c.id),
    form: c.form,
    offFloor: boxOffFloor(c, store.materials, store.shop.hardware),
    runId: c.runId,
    fillerLeft: filler(c.id, 'left'),
    fillerRight: filler(c.id, 'right'),
    ...(c.placement ? { placement: c.placement } : {}),
    ...(c.corner?.kind === 'diagonal' ? { diagonal: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
    ...(c.corner?.kind === 'lShaped' ? { lShaped: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
  }));
/** Each run and lone cabinet with where it stands, its own placement or the automatic one: for the placement inputs. */
const groups = computed(() => {
  const { placements, aligned } = runPlacementsOf(context.value.runs, context.value);
  return context.value.room ? placeGroups(laidForPlan.value, placements, aligned) : [];
});
/** The cabinets as the placement inputs, the room plan and its warnings see them: their case depth for `back`, the runs' fillers. */
const laidForPlan = computed(() => {
  const fits = new Map(context.value.runs.map((r) => [r.id, runFit(context.value, r)]));
  const filler = (id: string, end: 'left' | 'right') => [...fits.values()].flatMap((f) => f?.fillers ?? []).find((f) => f.cabinetId === id && f.end === end)?.width;
  return laid((id) => cabinets.value.find((c) => c.id === id)!.size.depth.mm, filler);
});
/** A run's or a lone cabinet's name, for the warnings and the plan. */
const groupName = (key: string) => {
  const r = context.value.runs.find((x) => x.id === key);
  if (r) return `The run "${r.name}"`;
  const c = cabinets.value.find((x) => cabinetGroupKey(x.id) === key);
  return c ? tagged(c.name || 'Cabinet', tags.value.get(c.id)) : key;
};
/** Overlaps, runs past a wall's end, a tall cabinet up into a wall run. */
const layoutWarnings = computed(() => projectLayoutWarnings(store.project!, store.materials, store.shop.hardware));
/** The room seen from above: its outline and each run's and lone cabinet's footprint, in mm, for the plan's SVG. */
const plan = computed(() => {
  const room = context.value.room;
  if (!room) return undefined;
  return {
    length: room.length.mm,
    width: room.width.mm,
    // The walls that are not there, as lines over the outline.
    open: (room.open ?? []).map((wall) => {
      const [L, W] = [room.length.mm, room.width.mm];
      const [x1, y1, x2, y2] = wall === 'back' ? [0, 0, L, 0] : wall === 'front' ? [0, W, L, W] : wall === 'left' ? [0, 0, 0, W] : [L, 0, L, W];
      return { wall, x1, y1, x2, y2 };
    }),
    groups: groups.value.map((g) => {
      const depth = Math.max(...g.cabinetIds.map((id) => cabinets.value.find((c) => c.id === id)!.size.depth.mm));
      const points = groupFootprint(room, g, depth);
      return { key: g.key, kind: g.kind, first: g.cabinetIds[0]!, points: points.map((p) => p.join(',')).join(' '), mid: points.reduce((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4], [0, 0]), selected: g.cabinetIds.includes(cabinet.value.id), name: groupName(g.key) };
    }),
  };
});
/** Each cabinet on the room's plan, for the picker: its own footprint, so one is picked and not its run. */
const planCabinets = computed(() => {
  const places = context.value.room ? cabinetPlaces(store.project!) : undefined;
  if (!places) return [];
  // Floor cabinets first, so a wall cabinet's outline is drawn over what it hangs above and takes the click only on its line.
  return [...cabinets.value]
    .sort((a, b) => Number(a.form === 'wall') - Number(b.form === 'wall'))
    .flatMap((c) => {
      const place = places.get(c.id);
      if (!place) return [];
      const [w, d] = [c.size.width.mm, c.size.depth.mm];
      const points = ([[0, -d], [w, -d], [w, 0], [0, 0]] as const).map(([x, z]) => inRoom(place.at, place.turn, [x, 0, z])).map((q) => `${q[0]},${q[2]}`);
      return [{ id: c.id, hung: c.form === 'wall', name: tagged(c.name || 'Cabinet', tags.value.get(c.id)), points: points.join(' ') }];
    });
});
/** The appliances on the room's plan, and the list the Appliances card edits. */
const appliances = computed(() => context.value.appliances ?? []);
const planAppliances = computed(() =>
  appliances.value.flatMap((a) => {
    const foot = applianceFootprint(store.project!, a);
    return foot ? [{ id: a.id, name: a.name, points: foot.map((p) => p.join(',')).join(' ') }] : [];
  }),
);
/** The cabinet's sink: on with one that suits its size, off with none. */
const setCabinetSink = (on: boolean) => {
  if (on) cabinet.value.sink = newSink(cabinet.value);
  else delete cabinet.value.sink;
};
/** The kinds offered: every one. */
const sinkMounts = computed(() => SINK_MOUNTS);
/** Another kind: its sizes start again as that kind's; where it sits and its faucet stay. */
const setSinkMount = (mount: SinkMount) => {
  const now = cabinet.value.sink;
  if (!now || now.mount === mount) return;
  const next = sinkOfKind(cabinet.value, mount);
  cabinet.value.sink = { ...next, ...(now.offset ? { offset: now.offset } : {}), ...(now.faucet && mount !== 'integrated' ? { faucet: now.faucet } : {}) };
  // A farmhouse sink's apron takes the top row of a drawer over doors: a cabinet without one is given that layout.
  if (mount === 'farmhouse' && !farmhouseRow(cabinet.value)) applyCabinetLayout(store.project!, cabinet.value, 'drawerOverDoors');
};
const SINK_SHAPES = [
  { title: 'Square or rectangle', value: 'rectangle' },
  { title: 'Round or oval', value: 'oval' },
];
const SINK_BOWLS = [
  { title: 'One bowl', value: 'one' },
  { title: 'Two, equal', value: 'equal' },
  { title: 'Two, 60/40', value: '60/40' },
];
const sinkBowls = computed(() => (!cabinet.value.sink?.double ? 'one' : cabinet.value.sink.double.leftShare > 0.55 ? '60/40' : 'equal'));
const setSinkBowls = (value: string) => {
  const sink = cabinet.value.sink;
  if (!sink) return;
  if (value === 'one') delete sink.double;
  else sink.double = { leftShare: value === '60/40' ? 0.6 : 0.5 };
};
const setSinkOffset = (value: Length | null) => {
  const sink = cabinet.value.sink;
  if (!sink) return;
  if (value && Math.abs(value.mm) > 0.01) sink.offset = value;
  else delete sink.offset;
};
/** A farmhouse sink's apron: its height and how far it stands in front of the doors. */
const setApron = (key: 'height' | 'proud', value: Length | null) => {
  const sink = cabinet.value.sink;
  if (!sink || !value) return;
  const now = apronOf(sink);
  sink.apron = { height: { mm: now.height, unit: 'in' }, proud: { mm: now.proud, unit: 'in' }, ...sink.apron, [key]: value };
};
const FAUCETS = [
  { title: 'None (on the wall, or fitted later)', value: 'none' },
  { title: 'One hole', value: '1' },
  { title: 'Three holes', value: '3' },
];
const faucetChoice = computed(() => String(cabinet.value.sink?.faucet?.holes ?? 'none'));
const setFaucet = (value: string) => {
  const sink = cabinet.value.sink;
  if (!sink) return;
  if (value === 'none') delete sink.faucet;
  else sink.faucet = { holes: value === '3' ? 3 : 1, ...(sink.faucet?.spread ? { spread: sink.faucet.spread } : {}) };
};
const setFaucetSpread = (value: Length | null) => {
  const faucet = cabinet.value.sink?.faucet;
  if (faucet && value && value.mm > 0) faucet.spread = value;
};
/** What a false front's tilt-out tray cannot do: fit at all, or be as deep as asked. */
const trayProblems = computed(() => (derived.value.error ? [] : falseFrontProblems(store.project!, cabinet.value, store.materials, L.value)));
/** What is wrong with the sink: no top over it, a bowl wider than the case. */
const sinkProblemList = computed(() => (cabinet.value.sink ? sinkProblems(store.project!, cabinet.value, store.materials, L.value) : []));
const WALLS = [
  { title: 'Back wall', value: 'back' },
  { title: 'Left wall', value: 'left' },
  { title: 'Right wall', value: 'right' },
  { title: 'Front wall', value: 'front' },
];
const addApplianceOf = (kind: (typeof APPLIANCE_KINDS)[number]['kind']) => addAppliance(store.project!, kind, { wall: 'back', along: len('0"') });
const removeAppliance = (id: string) => (context.value.appliances = appliances.value.filter((a) => a.id !== id));
/** Which wall an appliance is on; a free one is left as it is (only a sample places one free). */
const applianceWall = (a: Appliance) => (a.placement.wall === 'free' ? '' : a.placement.wall);
const setApplianceWall = (a: Appliance, wall: string) => {
  if (wall === 'back' || wall === 'left' || wall === 'right' || wall === 'front') a.placement = { wall, along: a.placement.wall === 'free' ? len('0"') : a.placement.along };
};
/** The lazy susan of a diagonal or an L-shaped corner cabinet: none made here (its shelves, or a bought one), or made here on bearings or on a pole. */
const susanChoices = computed(() => [
  { title: cabinet.value.corner?.kind === 'lShaped' ? 'Bought (on the hardware list)' : 'None: shelves on pins', value: 'none' },
  ...SUSAN_TURNS.map((x) => ({ title: `Made here: ${x.title.charAt(0).toLowerCase()}${x.title.slice(1)}`, value: x.value as string })),
]);
const susanChoice = computed(() => susanOf(cabinet.value)?.turns ?? 'none');
function setSusan(choice: string) {
  const corner = cabinet.value.corner;
  if (corner?.kind !== 'diagonal' && corner?.kind !== 'lShaped') return;
  // (Doors fixed to it need the pole: on bearing rings they go back to a bi-fold pair.)
  if (choice === 'bearings' || choice === 'pole') corner.susan = { turns: choice, rim: corner.susan?.rim ?? 'kerfed', ...(choice === 'pole' && corner.susan?.doors ? { doors: corner.susan.doors } : {}) };
  else delete corner.susan;
}
function setSusanDoors(on: boolean) {
  const corner = cabinet.value.corner;
  if (corner?.kind !== 'lShaped' || !corner.susan) return;
  if (on) corner.susan.doors = 'onSusan';
  else delete corner.susan.doors;
}
/** Its rim; two strips of hardboard bring 1/8" hardboard into the project's materials, from the shop's catalog. */
function setSusanRim(rim: 'kerfed' | 'laminated' | 'none') {
  const corner = cabinet.value.corner;
  if ((corner?.kind !== 'diagonal' && corner?.kind !== 'lShaped') || !corner.susan) return;
  if (rim === 'laminated') addMaterialFromCatalog(store.project!, store.shop.materialCatalog, SUSAN_RIM_HARDBOARD_ID);
  corner.susan.rim = rim;
}
/** This cabinet's own face frame overhang at one side; emptied, that side follows the project's again. */
const OVERHANG_ENDS = ['left', 'right'] as const;
/** This cabinet's inside, finished as the project's insides are or in its own way. */
const AS_PROJECT = 'project';
const insideChoices = computed(() => {
  const projects = INSIDE_FINISHES.find((f) => f.value === insideFinishOf(store.project!))!.title;
  return [{ title: `As the project's (${projects.toLowerCase()})`, value: AS_PROJECT }, ...INSIDE_FINISHES];
});
const ownInside = computed({
  get: () => cabinet.value.insideFinish ?? AS_PROJECT,
  set: (value: string) => {
    const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id);
    if (!stored) return;
    const found = INSIDE_FINISHES.find((f) => f.value === value);
    if (found) stored.insideFinish = found.value;
    else delete stored.insideFinish;
  },
});
const frameOverhang = computed(() => frameOverhangOf(cabinet.value, store.materials));
function setFrameOverhang(end: 'left' | 'right', value: Length | null) {
  const own = { ...(cabinet.value.frameOverhang ?? {}) };
  if (value) own[end] = value;
  else delete own[end];
  if (own.left || own.right) cabinet.value.frameOverhang = own;
  else delete cabinet.value.frameOverhang;
}
function setCornerJoint(joint: string) {
  if (!run.value?.top) return;
  if (joint === 'butt' || joint === 'mitre') run.value.top.cornerJoint = joint;
  else delete run.value.top.cornerJoint;
}
/** The cabinet as it is stored: where its top is set and taken away (`TopChoice`). */
const storedSelf = computed(() => storedCases(context.value).find((c) => c.id === cabinet.value.id));
/** The project's tops as they are cut: what a top's typed size starts from and what its leaf says. */
const topsNow = computed(() => {
  try {
    return store.project ? topPieces(store.project, store.materials) : [];
  } catch {
    return [];
  }
});
/** What is wrong with the tops over a cabinet, for the choice it is shown under. */
const topProblems = computed(() => {
  try {
    return store.project ? topWarnings(store.project, store.materials, L.value) : [];
  } catch {
    return [];
  }
});
const topProblemsOver = (ids: string[]) => [...new Set(topProblems.value.filter((w) => w.cabinetIds.some((id) => ids.includes(id))).map((w) => w.text))];
/** A top of the cabinet's own: why each of its edges takes no leaf, and its leaf in a line once it has one. */
const ownTopPiece = computed(() => topsNow.value.find((p) => p.cabinetId === cabinet.value.id && p.own));
const ownLeafClosed = computed(() => {
  const p = ownTopPiece.value;
  if (!p || !store.project) return {};
  return Object.fromEntries((['back', 'left', 'right'] as const).flatMap((edge) => [[edge, leafEdgeClosed(store.project!, p, edge)] as const].filter(([, why]) => !!why)));
});
const ownLeafLine = computed(() => {
  const p = ownTopPiece.value;
  if (!p?.leaf) return '';
  const joint = p.leaf.edge === 'back' ? p.x1 - p.x0 : p.zFront - p.zBack;
  const whole = p.leaf.edge === 'back' ? p.zFront - p.zBack : p.x1 - p.x0;
  return `${L.value(p.leaf.length)} at the ${leafEdgeWords(p.leaf.edge)} folds down under the joint; ${L.value(whole - p.leaf.length)} stays. ${p.torsion ? 'It is a box of its own on two folding legs.' : `It rests on ${dropLeafSupportWords(p.leaf.length, joint)}.`}`;
});
/** Whether a top is a torsion box, by Setup or of its own: it has no corner joint to choose. */
const isTorsionTop = (top: Run['top']) => !!top && topSettingsFor(topSettingsOf(context.value), top).kind === 'torsion';
const OWN_TOP_EDGES = [
  { title: 'A solid wood strip', value: 'strip' },
  { title: 'Edge banding', value: 'banding' },
  { title: 'Rounded over', value: 'roundover' },
  { title: 'Chamfered', value: 'chamfer' },
  { title: 'Left square', value: 'none' },
];
const CASE_TOPS = [
  { title: 'Two stretchers, for a countertop to lie on', value: 'stretchers' },
  { title: 'A top panel between the sides', value: 'panel' },
];
const ownTopMaterials = computed(() => [{ title: `Setup's top material`, value: '' }, ...store.materials.map((m) => ({ title: materialTitle(m, L.value), value: m.id }))]);
function setOwnTopMaterial(id: string) {
  const own = storedCases(context.value).find((c) => c.id === cabinet.value.id)?.top?.own;
  if (!own) return;
  if (id) own.materialId = id;
  else delete own.materialId;
}
function setNoBack(on: boolean) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (on) stored.noBack = true;
  else delete stored.noBack;
}
/** A case of drawers with a flat bottom may have no bottom panel: stretchers in its place. */
function setNoBottom(on: boolean) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (on) stored.noBottom = true;
  else delete stored.noBottom;
}
function setCaseTop(kind: string) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (kind === 'panel') stored.caseTop = 'panel';
  else delete stored.caseTop;
}
/** The island the run on screen is a row of (milestone 8), its other row, and the runs that may be its second. */
const island = computed(() => (run.value ? islandOf(context.value, run.value.id) : undefined));
const otherRow = computed(() => context.value.runs.find((r) => r.id === island.value?.rows.find((id) => id !== run.value?.id)));
const secondRows = computed(() => [
  { title: 'Nothing: one row, its back finished', value: '' },
  ...floorRuns.value.filter((r) => r.id !== run.value?.id && (!islandOf(context.value, r.id) || island.value?.rows.includes(r.id))).map((r) => ({ title: `The run "${r.name}"`, value: r.id })),
]);
const TURNS = [
  { title: 'The front wall', value: 0 },
  { title: 'The right wall', value: 90 },
  { title: 'The back wall', value: 180 },
  { title: 'The left wall', value: 270 },
];
function makeIsland() {
  const room = context.value.room;
  if (!run.value || !room) return;
  let n = 1;
  while (context.value.islands?.some((i) => i.id === `island-${n}`)) n++;
  // In the middle of the room to start.
  const length = runWidth(context.value, run.value);
  context.value.islands = [
    ...(context.value.islands ?? []),
    { id: `island-${n}`, name: `Island ${n}`, rows: [run.value.id], placement: { x: { mm: Math.max(0, (room.length.mm - length) / 2), unit: 'in' }, y: { mm: room.width.mm / 2, unit: 'in' }, turn: 0 } },
  ];
}
function setSecondRow(id: string) {
  if (!island.value || !run.value) return;
  island.value.rows = [island.value.rows[0]!, ...(id ? [id] : [])];
}
/** A one-row island's finished back: on (as a kitchen island wants), or off (a shop table's). */
function setFinishedBack(on: boolean) {
  if (!island.value) return;
  if (on) delete island.value.finishedBack;
  else island.value.finishedBack = false;
}
/** The island's top as it is cut. */
const islandPiece = computed(() => topsNow.value.find((p) => p.island && p.cabinetIds.some((id) => cabinets.value.find((c) => c.id === id)?.runId === island.value?.rows[0])));
function dissolveIsland() {
  if (island.value) context.value.islands = context.value.islands!.filter((i) => i.id !== island.value!.id);
}
/** Floor runs a wall run may line up with. */
const floorRuns = computed(() => context.value.runs.filter((r) => runKindOf(runCabinets(context.value, r)[0]?.form ?? 'base') === 'floor'));
const alignedWith = computed({
  get: () => run.value?.alignedWith ?? '',
  set: (id: string) => {
    if (!run.value) return;
    if (id) run.value.alignedWith = id;
    else delete run.value.alignedWith;
  },
});
const autoPlacement = (key: string) => groups.value.find((g) => g.key === key)?.placement;
/** A placed run's ends are the room's: they are derived, not chosen. */
const placedOnWall = computed(() => !!context.value.room && !!run.value?.placement && run.value.placement.wall !== 'free');
const setCabinetPlacement = (placement: Placement | undefined) => {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (placement) stored.placement = placement;
  else delete stored.placement;
};
const setRunPlacement = (placement: Placement | undefined) => {
  if (!run.value) return;
  if (placement) run.value.placement = placement;
  else delete run.value.placement;
};
const projectPlaces = computed(() => {
  const cabinetOf = cabinetIdOf(store.project!);
  const filler = (id: string, end: 'left' | 'right') => projectParts.value.find((p) => p.id === `${id}/filler-${end}`)?.size.width;
  const partsOf = (id: string) => projectParts.value.filter((p) => cabinetOf(p.id) === id);
  // How far behind its front its rearmost case part is: what touches the wall. Tops and an island's finished back do not count.
  const back = (id: string) => cabinetBack(partsOf(id));
  const { placements, aligned } = runPlacementsOf(context.value.runs, context.value);
  const places = layOutCabinets(context.value.room, laid((id) => back(id), filler), placements, aligned);
  return [
    ...cabinets.value.map((c) => ({ id: c.id, ...places.get(c.id)!, partIds: partsOf(c.id).map((p) => p.id) })),
    ...applianceBlocks.value.map((a) => ({ id: a.id, at: a.at, turn: a.turn, partIds: [a.part.id] })),
  ];
});

/** The cabinets shown with this one when only its run is: its run's, or every row of its island and what the island's top covers. */
const runGroup = computed(() => {
  const r = run.value;
  if (!r) return new Set<string>();
  const rows = island.value ? context.value.runs.filter((x) => island.value!.rows.includes(x.id)) : [r];
  return new Set([...rows.flatMap((x) => x.cabinetIds), ...(island.value?.covers ?? [])]);
});
/** The view shows this cabinet's run alone. */
const runShown = computed(() => runOnly.value && wholeProject.value && runGroup.value.size > 0);
const runPlaces = computed(() => projectPlaces.value.filter((p) => runGroup.value.has(p.id)));
const runParts = computed(() => {
  const ids = new Set(runPlaces.value.flatMap((p) => p.partIds));
  return projectParts.value.filter((p) => ids.has(p.id));
});
/** What the view shows: this cabinet, its run, or everything. */
const viewScope = computed({
  get: () => (!showAll.value ? 'cabinet' : runOnly.value && run.value ? 'run' : 'all'),
  set: (scope: string) => {
    showAll.value = scope !== 'cabinet';
    runOnly.value = scope === 'run';
  },
});

/** The door openings, top to bottom, each with the door set on it if there is one. */
const doorRows = computed(() =>
  derived.value.openings
    .filter((o) => o.use === 'doors' && !o.open && existing.value?.fronts !== 'kept')
    // (the lowest opening's fronts; a kept drawer front of a cabinet that is already there is left out below)
    .map((opening) => ({ opening, doors: designsOf(store.project!).filter(isDoorSet).find((d) => d.mounting.openingId === opening.id) })),
);
/** A door row above the lowest has its own number of shelves, kept on the row. */
// By the layout's rows, not the openings: with bays a row has an opening in each (milestone 10).
const upperDoorRows = computed(() => new Set(cabinet.value.layout.rows.filter((r) => r.use === 'doors').slice(0, -1).map((r) => r.id)));
const setRowShelves = (row: OpeningRow, count: number) => {
  row.shelves = count;
};
function freeId(prefix: string) {
  const taken = new Set(store.project!.designObjects.map((d) => d.id));
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function addDoors(opening: CabinetOpening) {
  store.project!.designObjects.push(createCabinetDoorSet(opening.id, freeId('doors')));
  // Named for its row when the cabinet has two.
  applyCabinetLayout(store.project!, cabinet.value, layout.value?.preset ?? 'doors', layout.value?.drawers || undefined);
}

/** The drawer openings, each with the drawer on it if there is one. */
const drawerRows = computed(() =>
  derived.value.openings
    // (A farmhouse sink's apron takes the top row's place: no front is hung there.)
    .filter((o) => o.use === 'drawer' && !o.apron)
    .filter((o) => !existing.value || existingRowFronts(existing.value, cabinet.value.layout.rows.findIndex((r) => r.id === o.rowId)) === 'new')
    .map((opening) => ({ opening, drawer: designsOf(store.project!).filter(isDrawer).find((d) => d.mounting.openingId === opening.id) })),
);
/** A new drawer follows the project: its front, slide and box are the project's. */
function addDrawer(opening: CabinetOpening) {
  store.project!.designObjects.push(createCabinetDrawer(opening.id, freeId('drawer')));
}

/** Fronts that run into each other: overlays larger than the rail between two openings allows. */
const clashes = computed(() => {
  const boxes = fronts.value.filter((p) => p.placement).map((p) => ({ part: p, box: partBox(p) }));
  const found: string[] = [];
  boxes.forEach((a, i) =>
    boxes.slice(i + 1).forEach((b) => {
      if (a.part.designObjectId === b.part.designObjectId) return;
      const lap = [0, 1].map((k) => Math.min(a.box.max[k]!, b.box.max[k]!) - Math.max(a.box.min[k]!, b.box.min[k]!));
      if (lap[0]! > 0.01 && lap[1]! > 0.01) found.push(`${a.part.name} and ${b.part.name} overlap by ${L.value(lap[1]!)}`);
    }),
  );
  return found;
});

/**
 * The layout as one of the presets. Choosing one writes the rows and adds the fronts
 * they lack; the doors and drawers of rows that are gone are kept, off the cabinet.
 */
const layout = computed(() => layoutPresetOf(cabinet.value.layout));
const drawerCounts = Array.from({ length: DRAWER_COUNT.max - DRAWER_COUNT.min + 1 }, (_, i) => DRAWER_COUNT.min + i);
function setLayout(preset: LayoutPreset, drawers?: number) {
  applyCabinetLayout(store.project!, cabinet.value, preset, drawers);
}
/** Bays side by side (milestone 10): how many, each one's width, and on a face frame a partition behind each mullion. */
const bays = computed(() => cabinet.value.layout.bays ?? [{}]);
function setBayWidth(i: number, width: Length | null) {
  cabinet.value.layout = { ...cabinet.value.layout, bays: bays.value.map((b, j) => (j === i ? (width ? { width } : {}) : b)) };
}
function setPartitions(on: boolean) {
  const next = { ...cabinet.value.layout };
  if (on) delete next.partitions;
  else next.partitions = false;
  cabinet.value.layout = next;
}
/** More under the top (a vanity top): corner blocks, and cross stretchers either side of a sink. */
const topSupportOffered = computed(() => takesTopSupport(cabinet.value) && !cabinet.value.existing);
function setTopSupport(change: { cornerBlocks?: boolean; cross?: boolean }) {
  const now = cabinet.value.topSupport ?? {};
  const blocks = change.cornerBlocks ?? !!now.cornerBlocks;
  const cross = change.cross === undefined ? now.crossStretchers : change.cross ? (now.crossStretchers ?? { apart: len('20"') }) : undefined;
  cabinet.value.topSupport = blocks || cross ? { ...(blocks ? { cornerBlocks: true } : {}), ...(cross ? { crossStretchers: cross } : {}) } : undefined;
}
/** What the cabinet is fitted out with inside: what is in the way, and the organizers made to go round it. */
const sinkOffered = computed(() => takesSink(cabinet.value));
function setSink(on: boolean) {
  // It starts with nothing in the way and nothing made; a sink's trap is one press away.
  cabinet.value.inside = on ? { obstacles: [], organizers: [] } : undefined;
}
/** The usual start under a sink: its trap in the way, and a tray on the floor. */
function startUnderSink() {
  cabinet.value.inside = createUnderSink({ bottomTray: true });
}
function setDoorRacks(on: boolean) {
  const inside = cabinet.value.inside;
  if (!inside) return;
  if (on) inside.doorRacks = createDoorRacks();
  else delete inside.doorRacks;
}
function addOrganizer(kind: Organizer['kind'], tall = false) {
  const inside = cabinet.value.inside;
  if (!inside) return;
  const made = createOrganizer(kind, inside.organizers);
  // A tall tray holds bottles standing up.
  if (tall) made.wall = { mm: TALL_TRAY_WALL, unit: 'in' };
  inside.organizers = [...inside.organizers, made];
}
/** An optional length of an organizer: an empty field takes it away. */
function setOrganizerLength(o: Organizer, field: 'wall' | 'fromLeft' | 'width' | 'height' | 'up', value: Length | null) {
  if (value && value.mm >= 0) o[field] = value;
  else delete o[field];
}
function setTiltOut(on: boolean) {
  const inside = cabinet.value.inside;
  if (!inside) return;
  if (on) inside.tiltOut = { width: len('20"'), height: len('4"'), depth: len('2.5"') };
  else delete inside.tiltOut;
}
function removeOrganizer(id: string) {
  const inside = cabinet.value.inside;
  if (inside) inside.organizers = inside.organizers.filter((o) => o.id !== id);
}
/** An organizer's height: an empty field puts a tray on the floor; a shelf keeps its height. */
function setOrganizerUp(o: Organizer, value: Length | null) {
  if (value && value.mm > 0) o.up = value;
  else if (o.kind === 'tray') delete o.up;
}
/** The blocks in the way: one more of a kind, one taken away, a kind changed (its measurements stay). */
function addObstacle(kind: ObstacleKind) {
  const sink = cabinet.value.inside;
  if (sink) sink.obstacles = [...sink.obstacles, createObstacle(kind, sink.obstacles)];
}
/** The Inside topic's lines that are open: a block in the way, or something made. One just added opens. */
const openItems = ref(new Set<string>());
function toggleItem(id: string) {
  const open = new Set(openItems.value);
  if (!open.delete(id)) open.add(id);
  openItems.value = open;
}
const capitalised = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
function addObstacleOpen(kind: ObstacleKind) {
  const before = new Set(cabinet.value.inside?.obstacles.map((o) => o.id));
  addObstacle(kind);
  const made = cabinet.value.inside?.obstacles.find((o) => !before.has(o.id));
  if (made) openItems.value = new Set([...openItems.value, made.id]);
}
function addOrganizerOpen(kind: Organizer['kind'], tall = false) {
  const before = new Set(cabinet.value.inside?.organizers.map((o) => o.id));
  addOrganizer(kind, tall);
  const made = cabinet.value.inside?.organizers.find((o) => !before.has(o.id));
  if (made) openItems.value = new Set([...openItems.value, made.id]);
}
/** What can be made inside, for the Add menu (a blind corner tray only in a blind corner cabinet). */
const organizerAdds = computed(() => [
  { title: 'Tray', kind: 'tray' as const, tall: false, test: 'tray' },
  { title: 'Tall tray for bottles', kind: 'tray' as const, tall: true, test: 'tall' },
  { title: 'Shelf', kind: 'shelf' as const, tall: false, test: 'shelf' },
  { title: 'Shelf with side trays', kind: 'sideTrays' as const, tall: false, test: 'sideTrays' },
  { title: 'Trash pull-out', kind: 'pullOut' as const, tall: false, test: 'pullOut' },
  { title: 'Narrow pull-out', kind: 'narrow' as const, tall: false, test: 'narrow' },
  { title: 'Dividers', kind: 'dividers' as const, tall: false, test: 'dividers' },
  ...(cabinet.value.corner?.kind === 'blind' ? [{ title: 'Blind corner tray', kind: 'blindTray' as const, tall: false, test: 'blindTray' }] : []),
]);
/** A block's line, closed: its size and where it is. "6" × 10", 10" clear under it". */
function obstacleSummary(o: Obstacle): string {
  return [
    `${L.value(o.width.mm)} × ${L.value(o.depth.mm)}`,
    o.fromLeft ? `${L.value(o.fromLeft.mm)} from the left` : '',
    o.fromBack ? `${L.value(o.fromBack.mm)} out from the back` : '',
    o.clearUnder ? `${L.value(o.clearUnder.mm)} clear under it` : 'on the floor',
    o.height ? `${L.value(o.height.mm)} tall` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
/** Something made, closed: where it stands and, for a tray, its size as made. */
function organizerSummary(o: Organizer): string {
  const made = underSink.value?.trays.find((t) => t.name === organizerName(o));
  const where = o.up && o.up.mm > 0 ? `${L.value(o.up.mm)} up` : o.kind === 'shelf' || o.kind === 'sideTrays' ? '' : 'on the floor';
  const size = made ? `${L.value(made.width)} × ${L.value(made.length)} × ${L.value(made.height)}` : '';
  const bins = o.kind === 'pullOut' && o.bins ? `${o.bins.count === 2 ? 'two bins' : 'a bin'} ${L.value(o.bins.width.mm)} × ${L.value(o.bins.depth.mm)}` : '';
  return [where, bins, size, made?.round ? `cut round ${made.round}` : ''].filter(Boolean).join(', ');
}
function removeObstacle(id: string) {
  const sink = cabinet.value.inside;
  if (sink) sink.obstacles = sink.obstacles.filter((o) => o.id !== id);
}
/** An optional measurement of a block: an empty field takes it away. */
function setObstacle(o: Obstacle, field: 'fromLeft' | 'fromBack' | 'clearUnder' | 'height', value: Length | null) {
  if (value) o[field] = value;
  else delete o[field];
}
/** What is made under the sink, in words: each tray's size, and how thick its build-outs are. */
const underSink = computed(() => {
  if (derived.value.error || !cabinet.value.inside) return undefined;
  try {
    return deriveUnderSink(cabinet.value, store.materials, store.shop.hardware);
  } catch {
    return undefined;
  }
});
/** Why what is asked for inside cannot be made, in words: shown with the list, where it is put right. */
const sinkError = computed(() => {
  if (!cabinet.value.inside) return '';
  try {
    deriveUnderSink(cabinet.value, store.materials, store.shop.hardware);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
});
/** How each thing under the sink goes in through the door opening, and in an existing cabinet round what is in the way. */
const wayIn = computed(() => {
  if (!underSink.value) return [];
  try {
    return deriveWayIn(cabinet.value, store.materials, store.shop.hardware, L.value);
  } catch {
    return [];
  }
});
/** The notches at their real size, to print on paper: a frame that is thrown away once it has printed, as Cut's lists are. */
function printTemplates() {
  if (!underSink.value?.templates.length || !store.project) return;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  frame.srcdoc = templatesHtml(`${store.project.name}, ${cabinet.value.name}`, underSink.value.templates, L.value);
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}
/** How many adjustable shelves a row may have: a tall bookcase wants more than a kitchen's three. */
const SHELF_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/** Beside a closet tower: a shelf and a rod from its side to the wall, or to the next tower. */
const spansOffered = computed(() => takesSpans(cabinet.value));
const SPAN_SIDES = ['left', 'right'] as const;
const SPAN_TO = [
  { title: 'The wall', value: 'wall' },
  { title: 'The next tower', value: 'tower' },
];
const builtSpans = computed(() => {
  try {
    return towerSpans(cabinet.value, store.materials);
  } catch {
    return [];
  }
});
function setSpan(side: 'left' | 'right', on: boolean) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (on) stored.spans = { ...stored.spans, [side]: stored.spans?.[side] ?? { length: len('30"'), to: 'wall', up: len('68"'), rod: true } };
  else if (stored.spans) {
    delete stored.spans[side];
    if (!stored.spans.left && !stored.spans.right) delete stored.spans;
  }
}
function setSpanRod(side: 'left' | 'right', on: boolean) {
  const span = storedCases(context.value).find((c) => c.id === cabinet.value.id)?.spans?.[side];
  if (!span) return;
  if (on) span.rod = true;
  else delete span.rod;
}
/** What a wall cabinet is: hung on the wall, or standing on another piece's top (a hutch). */
const standChoices = computed(() => [{ title: 'Hung on the wall', value: '' }, ...standablePieces(store.project!, cabinet.value.id).map((p) => ({ title: `Standing on ${p.name || 'a piece'}`, value: p.id }))]);
/** A hanging rod in an open row. */
const rodOffered = computed(() => takesRod(cabinet.value));
const rod = computed(() => {
  try {
    return closetRod(cabinet.value, store.materials);
  } catch {
    return undefined;
  }
});
/** The loose shelves of the row the rod hangs in: clothes hang into them. */
const rodRowShelves = computed(() => {
  if (!rod.value) return 0;
  const rows = cabinet.value.layout.rows.filter((r) => r.use === 'doors');
  const row = rows.find((r) => r.id === rod.value!.opening.rowId);
  return row === rows.at(-1) ? cabinet.value.adjustableShelves : (row?.shelves ?? 0);
});
function setRod(on: boolean) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (on) stored.rod = stored.rod ?? {};
  else delete stored.rod;
}
function setRodDown(value: Length | null) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)?.rod;
  if (!stored) return;
  if (value) stored.down = value;
  else delete stored.down;
}
/** Whether anything of the cabinet is open: a row, or a bay. */
const anyOpen = computed(() => cabinet.value.layout.rows.some((r) => r.use === 'doors' && r.open) || !!cabinet.value.layout.bays?.some((b) => b.open));
/** Cable holes through the back behind what is open. */
function setCables(on: boolean) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (on) stored.cables = stored.cables ?? { diameter: len('2-1/2"') };
  else delete stored.cables;
}
function setCableUp(value: Length | null) {
  const cables = storedCases(context.value).find((c) => c.id === cabinet.value.id)?.cables;
  if (!cables) return;
  if (value) cables.up = value;
  else delete cables.up;
}
function setCableAir(on: boolean) {
  const cables = storedCases(context.value).find((c) => c.id === cabinet.value.id)?.cables;
  if (!cables) return;
  if (on) cables.air = true;
  else delete cables.air;
}
/** A power hub in the open space at the top: on which side its outlets and port are, or none. */
function setHub(side: string) {
  const stored = storedCases(context.value).find((c) => c.id === cabinet.value.id)!;
  if (side !== 'left' && side !== 'right') delete stored.hub;
  else stored.hub = { side };
  // A switch panel closes that space: its row has no doors.
  const top = cabinet.value.layout.rows[0];
  if (stored.hub && top && top.use === 'doors' && !top.open) setRowOpen(store.project!, cabinet.value, top.id, true);
}
const HUB_SIDES = [
  { title: 'None', value: 'none' },
  { title: 'Outlets and port in the left side', value: 'left' },
  { title: 'Outlets and port in the right side', value: 'right' },
];
const hubWarnings = computed(() => (derived.value.error ? [] : hubProblems(cabinet.value, store.materials)));
/** An opening's doors off or on: its bay's where the cabinet has several (a TV stand's open middle bay), else its row's. */
function setOpen(opening: { rowId: string; bay?: number }, open: boolean) {
  if (bays.value.length > 1) setBayOpen(store.project!, cabinet.value, (opening.bay ?? 1) - 1, open);
  else setRowOpen(store.project!, cabinet.value, opening.rowId, open);
}
const hasDoorRow = computed(() => cabinet.value.layout.rows.some((r) => r.use === 'doors'));
const drawerRowCount = computed(() => cabinet.value.layout.rows.filter((r) => r.use === 'drawer').length);

// An L-shaped cabinet's second face is the same row on its other face.
const rowOf = (opening: CabinetOpening): OpeningRow => cabinet.value.layout.rows.find((r) => r.id === (opening.frame ? opening.rowId.replace(/-2$/, '') : opening.rowId))!;
const setRowHeight = (row: OpeningRow, value: Length | null) => {
  if (value) row.height = value;
};

const pins = computed(() => {
  if (derived.value.error || cabinet.value.adjustableShelves < 1 || !hasDoorRow.value) return undefined;
  const pin = shelfPinFor(cabinet.value, store.shop.hardware);
  const side = caseParts.value.find((p) => p.role === 'side');
  const levels = side?.features.filter((f) => f.id.startsWith('shelf-pin-front')).length ?? 0;
  return { pin, levels, leftOut: shelfPinLevels(cabinet.value, store.materials, pin).length - levels };
});
/** Holes in a part, by the start of their id. */
const holeCount = (part: Part, prefix: string) => part.features.filter((f) => f.kind === 'hole' && f.id.startsWith(prefix)).length;

const materials = computed(() => store.materials.map((m) => ({ title: `${L.value(m.nominalThickness.mm)} ${m.name}`, value: m.id })));
const materialName = (id: string) => materials.value.find((m) => m.value === id)?.title ?? id;

const status = computed(() => {
  const { width, height, depth } = cabinet.value.size;
  const size = `${L.value(width.mm)} wide × ${L.value(height.mm)} tall × ${L.value(depth.mm)} deep`;
  if (derived.value.error) return size;
  const n = fronts.value.length;
  const b = boxParts.value.length;
  return `${size} · ${caseParts.value.length} cabinet parts${b ? `, ${b} drawer box parts` : ''}${n ? `, ${n} ${n === 1 ? 'front' : 'fronts'}` : ''}`;
});

const exposures = [
  { title: 'Exposed', value: 'exposed' },
  { title: 'Hidden (wall or cabinet)', value: 'hidden' },
];
/** Which side of the cabinet takes its frame pockets where, in words. */
const pocketFace = (side: 'left' | 'right') => (cabinet.value.sides[side] === 'hidden' ? 'outside' : 'inside');

const anyDado = computed(() => JOINED_PARTS.some((p) => caseJointOf(cabinet.value, p.key) === 'dado'));
const anyThrough = computed(() => JOINED_PARTS.some((p) => caseJointOf(cabinet.value, p.key) === 'throughScrews'));
const anyTabs = computed(() => JOINED_PARTS.some((p) => caseJointOf(cabinet.value, p.key) === 'tabs'));
const anyScrews = computed(() => JOINED_PARTS.some((p) => caseJointOf(cabinet.value, p.key) === 'pocketScrews'));
/** The case part with a joint to the sides, by the end of its id. */
const JOINED_KEY: Record<string, JoinedPart> = { bottom: 'bottom', 'stretcher-front': 'frontStretcher', 'stretcher-back': 'backStretcher' };
/** What a dado in a side houses, by the feature's id. */
const HOUSED: Record<string, string> = { 'dado-bottom': 'bottom', 'dado-stretcher-front': 'front stretcher', 'dado-stretcher-back': 'back stretcher' };

const nailer = computed(() => cabinet.value.joinery.backStretcherForm === 'nailer');
const backThickness = computed(() => store.materials.find((m) => m.id === cabinet.value.materials.backId)?.measuredThickness.mm ?? 0);

/** The one line each topic says on the rail. */
const placeSummary = computed(() =>
  [
    cabinet.value.corner ? `${cabinet.value.corner.kind === 'lShaped' ? 'An L-shaped' : cabinet.value.corner.kind === 'diagonal' ? 'A diagonal' : 'A blind'} corner cabinet` : 'Not a corner cabinet',
    !run.value && cabinet.value.top ? (cabinet.value.top.own ? 'a top of its own' : 'a countertop over it') : '',
    cabinet.value.caseTop === 'panel' ? 'a top panel' : '',
    cabinet.value.noBack ? 'no back' : '',
    cabinet.value.spans ? 'a shelf and a rod beside it' : '',
  ]
    .filter(Boolean)
    .join(' · '),
);
const frontsSummary = computed(() => {
  const doors = doorRows.value.filter((r) => r.doors).length;
  const drawers = drawerRows.value.filter((r) => r.drawer).length;
  return [doors ? (doors === 1 ? 'Doors' : `${doors} sets of doors`) : '', drawers ? (drawers === 1 ? '1 drawer' : `${drawers} drawers`) : ''].filter(Boolean).join(', ') || 'None yet';
});
// The doors' and drawers' cards are topics here: they show their fields with no card of their own (`FoldCard`).
provide('foldPlain', true);
/** What the piece stands on, for its summary line; a toe kick, the usual, is not said. */
const bottomWords = (kick: Parameters<typeof bottomKindOf>[0]) => ({ toeKick: '', flat: ' · flat bottom', plinth: ' · on a plinth', casters: ' · on casters', feet: ' · on feet', legs: kick.legs?.posts ? ' · corner posts' : ' · on legs' })[bottomKindOf(kick)];
const cabinetSummary = computed(() => {
  const { width, height, depth } = cabinet.value.size;
  if (existing.value?.inside) return `Already there, ${styleName.value} · ${L.value(existingInsideWidth(existing.value))} wide × ${L.value(existing.value.inside.depth.mm)} deep × ${L.value(existing.value.inside.height.mm)} high inside`;
  if (existing.value) return `Already there, ${styleName.value} · door opening ${L.value(existing.value.opening.width.mm)} × ${L.value(existing.value.opening.height.mm)}, its inside not measured`;
  return `${L.value(width.mm)} × ${L.value(height.mm)} × ${L.value(depth.mm)} · ${styleName.value}${bottomWords(cabinet.value.toeKick)}`;
});
const openingsSummary = computed(() => derived.value.openings.map((o) => `${o.name} ${L.value(o.width)} × ${L.value(o.height)}`).join(' · '));

/**
 * The topics: Setup's three panes for the cabinet chosen. This cabinet's, then its
 * run when it stands in one, then the room, in one rail so that they read together. A topic that does not apply
 * is left out. `#/design?cabinet=2&topic=openings`, `&sub=<a front's id>`; the old `fold=` and `more=` open the
 * topic that has what the card had.
 */
const frontSubs = computed((): SubTopic[] => [
  ...doorRows.value.map(({ opening, doors }) => ({
    id: doors?.id ?? `none:${opening.id}`,
    dot: doors ? frontDifferences(store.project!, doors.id).length : 0,
    title: doors?.name || 'Doors',
    summary: doors ? `${opening.name}, ${L.value(opening.width)} × ${L.value(opening.height)}` : `None on the ${opening.name.toLowerCase()} yet`,
    words: 'A set of doors: how they are made, their hinges and their handles.',
  })),
  ...drawerRows.value.map(({ opening, drawer }) => ({
    id: drawer?.id ?? `none:${opening.id}`,
    dot: drawer ? frontDifferences(store.project!, drawer.id).length : 0,
    title: drawer?.name || 'Drawer',
    summary: drawer ? `${opening.name}, ${L.value(opening.width)} × ${L.value(opening.height)}` : `No front on the ${opening.name.toLowerCase()} yet`,
    words: 'A drawer: its front, its box, its slides and its handle.',
  })),
]);
const topics = computed((): Topic[] => {
  const c = cabinet.value;
  const inside = c.inside;
  // "Piece", not "cabinet": it has to be generic, a bookcase is one too.
  const THIS = 'This piece';
  const all: (Topic & { show: boolean })[] = [
    { id: 'cabinet', group: THIS, title: 'Piece', summary: cabinetSummary.value, words: 'Its name, how many are made, its size and where it stands.', show: true },
    { id: 'place', group: THIS, title: 'Place and corner', summary: placeSummary.value, words: 'Its place in the room, a countertop of its own, a corner and a lazy susan, and which of its sides show.', show: !existing.value },
    {
      id: 'construction',
      group: THIS,
      title: 'Construction',
      summary: differs.value.length ? `Differs from Setup: ${differs.value.join(', ')}` : 'As Setup',
      words: 'What this cabinet does differently from Setup: its construction, its case and its joinery.',
      show: !existing.value,
    },
    { id: 'openings', group: THIS, title: 'Openings', summary: openingsSummary.value, words: 'Its layout, its bays, the height of each row, its shelves, and what is under its top.', show: true },
    { id: 'sink', group: THIS, title: 'Sink', summary: c.sink ? sinkWords(c.sink, L.value) : 'None', words: 'A sink over it, set in the top over it: its kind, its size and where it sits.', show: c.form === 'base' },
    { id: 'fronts', group: THIS, title: 'Fronts', summary: frontsSummary.value, words: 'Its doors and drawers.', subs: frontSubs.value, show: frontSubs.value.length > 0 },
    {
      id: 'inside',
      group: THIS,
      title: 'Inside',
      summary: inside ? [inside.organizers.length ? `${inside.organizers.length} made` : '', inside.obstacles.length ? `${inside.obstacles.length} in the way` : '', inside.doorRacks ? 'door racks' : '', inside.tiltOut ? 'a tilt-out tray' : ''].filter(Boolean).join(', ') || 'Fitted out, nothing in it yet' : 'Nothing',
      words: 'What stands inside it behind the doors: what is in the way, trays, shelves, pull-outs and racks.',
      show: sinkOffered.value,
    },
    { id: 'run', group: 'Its run', title: `Run: ${run.value?.name ?? ''}`, summary: runSummary.value, words: 'The run it stands in: its ends, its length, what it stands on, its top and its place.', show: !!run.value },
    {
      id: 'room',
      group: 'The room',
      title: 'Room',
      summary: context.value.room ? roomWords(context.value.room, L.value) : 'No room',
      words: 'The room the cabinets stand in, seen from above.',
      show: true,
    },
    { id: 'appliances', group: 'The room', title: 'Appliances', summary: appliances.value.length ? appliances.value.map((a) => a.name).join(', ') : 'None', words: 'Appliances standing in the room: a size and a place.', show: !!context.value.room },
  ];
  return all.filter((t) => t.show).map(({ show: _show, ...t }) => ({ ...t, warn: warnings.value[t.id] ?? 0, dot: t.id === 'construction' ? differs.value.length : t.id === 'fronts' ? frontSubs.value.reduce((n, x) => n + (x.dot ?? 0), 0) : 0 }));
});
/**
 * What needs a look, by topic: a badge on it. Each warning is shown in its own topic, so the badge says
 * where to go: a part too big for the sheet or a measurement that cannot be on Cabinet, fronts that clash on
 * Fronts, what does not fit or go in on Inside, a run longer than its wall on Run, the layout on Room, a sink over
 * no top on Appliances.
 */
/** A shelf too long for its thickness to carry books. */
const shelfTooLong = computed(() => (derived.value.error ? [] : shelfWarnings(cabinet.value, store.materials, L.value)));
/** A piece that can tip, with drawers that come right out. */
const mayTip = computed(() => (derived.value.error || !store.project ? [] : tipWarnings(cabinet.value, designsOf(store.project), store.shop.hardware)));
const warnings = computed((): Record<string, number> => ({
  cabinet: partLimits.value.length + existingWrong.value.length,
  openings: shelfTooLong.value.length + mayTip.value.length,
  fronts: clashes.value.length + trayProblems.value.length,
  inside: !cabinet.value.inside
    ? 0
    : (sinkError.value ? 1 : 0) + wayIn.value.filter((w) => w.how === 'no').length + (underSink.value?.doorRacks?.weight.heavy ? 1 : 0) + (cabinet.value.adjustableShelves > 0 ? 1 : 0),
  run: fit.value && fit.value.leftOver < -0.5 ? 1 : 0,
  room: layoutWarnings.value.length + casterLoad.value.length + tooTall.value.length,
  sink: sinkProblemList.value.length,
}));
const foldAsked = String(route.query.fold ?? '').split(',').filter(Boolean);
const frontAsked = foldAsked.find((f) => /^(doors|drawer):/.test(f));
const nav = useTopics(() => topics.value, {
  first: route.query.more === 'cabinet' ? 'place' : frontAsked ? 'fronts' : (foldAsked.find((f) => ['run', 'room', 'appliances', 'openings', 'cabinet'].includes(f)) ?? 'cabinet'),
  firstSub: frontAsked?.replace(/^(doors|drawer):/, ''),
  keep: 'all',
});

/** The layouts this cabinet may have, each a tile: its front as the layout makes it. */
const layoutTiles = computed(() =>
  LAYOUT_PRESETS.filter((p) => layoutsOf(cabinet.value.form).includes(p.value)).map((p) => ({ ...p, drawing: layoutTile(p.value, layout.value?.preset === 'drawers' ? layout.value.drawers : undefined) })),
);
/**
 * The view follows the topic: on Inside the doors stand open and the trays part out, on a
 * drawer it is pulled out with the rest, on a set of doors all is shut. Leaving those, all is shut again; between
 * the other topics the view stays as the user left it. Where it is seen from is never moved. A link that says how
 * far the doors are open (`open=`, `drawer=`) is left to say so.
 */
const viewPose = ref<{ open: number; drawer: number } | undefined>();
watch(
  () => [nav.current?.id, nav.currentSub?.id, cabinet.value.id] as const,
  ([id, sub]) => {
    if ('open' in route.query || 'drawer' in route.query) return;
    const isDrawer = drawerRows.value.some((r) => r.drawer?.id === sub);
    if (id === 'inside') viewPose.value = { open: 110, drawer: 60 };
    else if (id === 'fronts') viewPose.value = isDrawer ? { open: 0, drawer: 70 } : { open: 0, drawer: 0 };
    else if (viewPose.value && (viewPose.value.open || viewPose.value.drawer)) viewPose.value = { open: 0, drawer: 0 };
  },
  { immediate: true },
);

/**
 * The parts are listed under the 3D view, in a section that opens (not a tab that hides the
 * view). One part may be picked out, from the list or by clicking it in the view: it is drawn in a strong colour with
 * the rest seen through, and its row shows what is cut into it.
 */
const partsOpen = ref(false);
const pickedPart = ref<string>();
const partsTable = ref<HTMLElement | null>(null);
/** From the list: the row's part, or none when it was the one picked out. */
function pickPart(id: string) {
  pickedPart.value = pickedPart.value === id ? undefined : id;
}
/** From the view: the part clicked (the list opens at its row), or none. */
function pickedInView(id: string | undefined) {
  pickedPart.value = id && allParts.value.some((p) => p.id === id) ? id : undefined;
  if (!pickedPart.value) return;
  partsOpen.value = true;
  void nextTick(() => partsTable.value?.querySelector('.part-row.picked')?.scrollIntoView({ block: 'nearest' }));
}
/** The details of every part open at once. */
const allOpen = ref(false);
// Another cabinet in hand: nothing of it is picked out.
watch(() => cabinet.value?.id, () => (pickedPart.value = undefined));

/** Which way the grain runs, named by the dimension it runs along. */
const grainNote = (part: Part) => (part.grain ? [`Grain runs the ${L.value(part.grain === 'width' ? part.size.width : part.size.height)} way`] : []);

/** What is cut into the part besides its rectangle. */
function notes(part: Part): string[] {
  if (!part.role) return [...featureTags(part, L.value), ...grainNote(part)];
  const found: string[] = [];
  // A nailer stands on edge: its faces are its front and its back.
  const faces = partFaces(part);
  // Pocket holes by face and by what they screw into: the feature's id says which joint it belongs to.
  const into = (id: string) => (id.startsWith('frame-pocket') ? 'face frame' : id.startsWith('side-pocket') || id.startsWith('box-pocket') ? 'sides' : id.startsWith('bottom-pocket') ? 'bottom' : id.startsWith('kick-pocket') ? 'toe kick board' : 'stiles');
  for (const face of ['A', 'B'] as const) {
    for (const target of ['face frame', 'sides', 'bottom', 'toe kick board', 'stiles']) {
      const n = part.features.filter((f) => f.kind === 'pocketHole' && f.face === face && into(f.id) === target).length;
      if (n) found.push(`${faces[face]}: ${n} pocket ${n === 1 ? 'hole' : 'holes'} into the ${target}`);
    }
  }
  const dados = part.features.flatMap((f) => (f.kind === 'dado' && HOUSED[f.id] ? [HOUSED[f.id]!] : []));
  if (dados.length) found.push(`Inside: ${L.value(CASE_DADO_DEPTH)} deep ${dados.length === 1 ? 'dado' : 'dados'} for the ${dados.join(', ')}`);
  if (part.features.some((f) => f.id === 'rabbet-back')) {
    found.push(`Inside: rabbet for the back along the rear edge, ${L.value(backThickness.value)} wide × ${L.value(BACK_RABBET_DEPTH)} deep`);
  }
  if (part.features.some((f) => f.id === 'groove-back')) {
    found.push(`Inside: groove for the back, ${L.value(backThickness.value)} wide × ${L.value(BACK_GROOVE_DEPTH)} deep, ${L.value(BACK_GROOVE_INSET)} in from the rear edge`);
  }
  const grooved = part.features.find((f) => f.id === 'box-groove');
  if (grooved?.kind === 'dado') {
    const wide = grooved.outline[2]!.y - grooved.outline[0]!.y;
    found.push(`Inside: groove for the bottom, ${L.value(wide)} wide × ${L.value(BOX_GROOVE_DEPTH)} deep, ${L.value(BOX_GROOVE_UP)} up`);
  }
  const boxRabbets = part.features.filter((f) => f.id.startsWith('box-rabbet')).length;
  if (boxRabbets === 2) found.push(`Inside: a rabbet ${L.value(BOX_RABBET_DEPTH)} deep at each end for the box front and back`);
  if (boxRabbets === 1) found.push(`Inside: a rabbet ${L.value(BOX_RABBET_DEPTH)} deep at the back end for the box back`);
  if (part.role === 'boxFront' && part.features.some((f) => f.kind === 'cutout' && f.outline.length > 4)) found.push('Finger pull: a notch in its top edge, cut with its outline');
  const frontDado = part.features.find((f) => f.id.startsWith('front-dado'));
  if (frontDado?.kind === 'dado') found.push(`Inside: two stopped dados ${L.value(frontDado.depth)} deep for the box sides`, 'Its outside face is the drawer front: flush with the case front');
  const plateHoles = holeCount(part, 'hinge-plate');
  if (plateHoles) found.push(`Inside: ${plateHoles} hinge plate holes`);
  const pinHoles = holeCount(part, 'shelf-pin-front');
  if (pinHoles) found.push(`Inside: 2 rows of ${pinHoles} shelf-pin holes`);
  const caseScrews = holeCount(part, 'case-screw');
  if (caseScrews) found.push(`${caseScrews} holes through it for the screws into the bottom and stretchers`);
  const pilots = holeCount(part, 'slide-screw');
  if (pilots) found.push(`${part.role === 'side' ? 'Inside: ' : ''}${pilots} pilot holes for the slide's screws`);
  const screws = part.features.filter((f) => f.id.startsWith('front-screw')).length;
  if (screws) found.push(`${screws} holes for the screws that hold the drawer front`);
  if (part.role === 'boxBottom') found.push('Sits in the groove in all four walls');
  if (part.role === 'buildOut') found.push('Carries a drawer slide: glued and screwed to the case side');
  if (part.role === 'runner') found.push(part.id.includes('/kicker') ? 'Over a drawer on runners, so it cannot tip: glued and screwed to the case side' : 'A drawer slides on it: glued and screwed to the case side');
  const joined = part.designObjectId === cabinet.value.id ? JOINED_KEY[part.id.split('/').at(-1)!] : undefined;
  if (joined && caseJointOf(cabinet.value, joined) === 'dado') found.push(`Ends sit ${L.value(CASE_DADO_DEPTH)} into dados in the sides: glued, no screws`);
  if (joined && caseJointOf(cabinet.value, joined) === 'throughScrews') found.push('Ends butt against the sides: screwed through the sides from outside');
  if (joined && caseJointOf(cabinet.value, joined) === 'tabs') found.push(cabinet.value.joinery.tabs?.blind ? 'Tabs on its ends, into blind slots in the sides: glued, no screws' : 'Tabs on its ends, through slots in the sides: glued, no screws');
  const tabSlots = part.features.filter((f) => f.id.startsWith('tab-slot-')).length;
  if (tabSlots) found.push(`${tabSlots} ${tabSlots === 1 ? 'slot' : 'slots'} for the tabs of the parts that meet it${part.features.some((f) => f.id.startsWith('tab-slot-') && f.kind === 'dado') ? ', in its face' : ', through it, a dog-bone in each corner'}`);
  if (part.role === 'side' && !cabinet.value.toeKick.off && cabinet.value.toeKick.height.mm > 0) {
    found.push(`Toe kick notch ${L.value(cabinet.value.toeKick.depth.mm)} × ${L.value(cabinet.value.toeKick.height.mm)}`);
  }
  if (part.banding) found.push(`Front edge banded, ${part.banding.thickness} mm: cut size shown`);
  found.push(...grainNote(part));
  return found;
}
</script>

<template>
  <PageHeader v-if="store.project" title="Design" :status="status" :next="{ to: '/plan', title: 'Plan' }" />
  <div v-if="store.project" class="text-body-2 mb-3" data-test="setup-line">
    <span class="text-medium-emphasis">Setup:</span> {{ setupLine }} · <router-link to="/setup" class="text-primary">Change in Setup</router-link>
  </div>
  <div v-if="store.project" class="d-flex flex-wrap align-center ga-2 mb-4" data-test="cabinet-list">
    <!-- One line for the piece in hand: where it stands, its name, its place among the others; its menu lists them all by where they stand. -->
    <PiecePicker :groups="pickerGroups" :selected="cabinet.id" :pictured="!!plan" @select="pickPiece">
      <template #picture="{ pick }">
        <svg v-if="plan" :viewBox="`-60 -120 ${plan.length + 120} ${plan.width + 180}`" class="room-plan" data-test="picker-plan">
          <rect x="0" y="0" :width="plan.length" :height="plan.width" class="room-wall" />
          <line v-for="o in plan.open" :key="o.wall" :x1="o.x1" :y1="o.y1" :x2="o.x2" :y2="o.y2" class="room-open" />
          <g v-for="a in planAppliances" :key="a.id" class="room-appliance">
            <title>{{ a.name }}</title>
            <polygon :points="a.points" />
          </g>
          <g v-for="c in planCabinets" :key="c.id" class="room-group" :class="{ wall: c.hung, on: c.id === cabinet.id }" @click="pick(c.id)">
            <title>{{ c.name }}</title>
            <polygon :points="c.points" />
          </g>
        </svg>
        <div class="text-caption text-medium-emphasis">From above, the back wall at the top. Click a cabinet; wall cabinets are outlined, appliances grey.</div>
      </template>
    </PiecePicker>
    <v-menu>
      <template #activator="{ props: menu }">
        <v-btn v-bind="menu" variant="tonal" color="primary" size="small" :prepend-icon="mdiPlus" data-test="add-cabinet">Add</v-btn>
      </template>
      <v-list density="compact">
        <v-list-item v-for="s in ADDABLE" :key="s.id" :title="s.title" :subtitle="s.what" :data-test="`add-${s.id}`" @click="addOne(s)" />
        <v-divider />
        <v-list-item title="From another project…" subtitle="A copy of one of its pieces, in this project's style or as it was." data-test="add-from-project" @click="importing = true" />
      </v-list>
    </v-menu>
    <ImportPieceDialog v-model="importing" @added="imported" />
    <!-- What is done to the chosen cabinet: one group, so on a narrow screen it wraps as a line of its own. -->
    <div class="cabinet-actions">
      <v-btn variant="text" size="small" :prepend-icon="mdiContentCopy" data-test="copy-cabinet" @click="copyOne">Copy</v-btn>
      <v-btn variant="text" size="small" :icon="mdiArrowLeft" :disabled="selected === 0" title="Move it earlier in the list (in a run: to the left)" aria-label="Move earlier" @click="moveOne(-1)" />
      <v-btn variant="text" size="small" :icon="mdiArrowRight" :disabled="selected === cabinets.length - 1" title="Move it later in the list (in a run: to the right)" aria-label="Move later" @click="moveOne(1)" />
      <v-btn variant="text" size="small" color="error" :prepend-icon="mdiTrashCanOutline" :disabled="cabinets.length === 1" data-test="delete-cabinet" @click="deleteOne">Delete</v-btn>
    </div>
  </div>
  <!-- A phone shows the fields or the picture, not one a long scroll under the other. -->
  <v-btn-toggle v-model="phoneShows" mandatory density="compact" color="primary" variant="outlined" divided class="phone-switch mb-3" data-test="phone-switch">
    <v-btn value="fields" size="small">Fields</v-btn>
    <v-btn value="view" size="small">3D and parts</v-btn>
  </v-btn-toggle>
  <TopicShell v-if="store.project" :nav="nav" name="design" icon="cabinet" dot-title="Differs from Setup" :lg="[3, 4, 5]" :xl="[2, 4, 6]" stick :class="`phone-${phoneShows}`">

      <!-- This cabinet. Every topic stays in the page while another is in hand, so its fields keep their state. -->
      <div v-show="nav.current.id === 'cabinet'" data-test="topic-cabinet">
        <v-row density="compact" class="mb-1">
          <v-col cols="8"><v-text-field v-model="cabinet.name" label="Name" hide-details data-test="cabinet-name" /></v-col>
          <v-col cols="4">
            <v-text-field
              :model-value="cabinet.quantity"
              :disabled="!!run"
              label="Quantity"
              type="number"
              min="1"
              hide-details
              data-test="cabinet-quantity"
              @update:model-value="cabinet.quantity = Math.max(1, Math.floor(Number($event)) || 1)"
            />
          </v-col>
        </v-row>
        <v-row v-if="existingOffered" density="compact" class="mb-1">
          <v-col cols="12">
            <v-select :model-value="existing ? 'existing' : 'made'" label="Its case" :items="CASE_KINDS" hide-details data-test="case-kind" @update:model-value="setCaseKind($event)" />
          </v-col>
        </v-row>
        <v-row v-if="existing" density="compact" data-test="existing">
          <v-col cols="6"><v-select v-model="existing.frame" label="Built" :items="EXISTING_FRAMES" hide-details data-test="existing-frame" /></v-col>
          <v-col cols="6"><v-select v-model="existing.fronts" :label="existing.lowest === 'drawer' ? 'Its lowest drawer front' : 'Its doors'" :items="existing.lowest === 'drawer' ? EXISTING_DRAWER_FRONTS : EXISTING_FRONTS" hide-details data-test="existing-fronts" /></v-col>
          <v-col cols="12">
            <v-btn :to="`/measure?cabinet=${selected + 1}`" size="small" variant="tonal" color="primary" data-test="existing-measure">Measure it step by step, with pictures</v-btn>
          </v-col>
          <template v-if="existing.frame === 'faceFrame' || !existing.inside">
            <v-col cols="6"><LengthField v-model="existing.opening.width" :label="existing.lowest === 'drawer' ? 'Lowest opening, width' : 'Door opening, width'" data-test="existing-opening-width" /></v-col>
            <v-col cols="6"><LengthField v-model="existing.opening.height" :label="existing.lowest === 'drawer' ? 'Lowest opening, height' : 'Door opening, height'" data-test="existing-opening-height" /></v-col>
          </template>
          <template v-if="cabinet.form === 'base'">
            <v-col cols="6"><v-select :model-value="existing.drawers?.length ?? 0" label="Drawer openings over it" :items="DRAWER_OPENING_COUNTS" hide-details data-test="existing-drawer-count" @update:model-value="setExistingDrawerCount($event)" /></v-col>
            <v-col cols="6"><v-select :model-value="existing.lowest ?? 'doors'" label="Its lowest opening holds" :items="LOWEST_KINDS" hide-details data-test="existing-lowest" @update:model-value="setExistingLowest($event)" /></v-col>
            <template v-for="(d, i) in existing.drawers ?? []" :key="i">
              <v-col :cols="existing.frame === 'faceFrame' ? 4 : 6"><LengthField v-model="d.height" :label="`Drawer opening ${i + 1}, height`" :data-test="`existing-drawer-height-${i + 1}`" /></v-col>
              <v-col v-if="existing.frame === 'faceFrame'" cols="4"><LengthField v-model="d.rail" label="Rail under it" :data-test="`existing-drawer-rail-${i + 1}`" /></v-col>
              <v-col :cols="existing.frame === 'faceFrame' ? 4 : 6"><v-select v-model="d.fronts" label="Its front" :items="EXISTING_DRAWER_FRONTS" hide-details :data-test="`existing-drawer-fronts-${i + 1}`" /></v-col>
            </template>
            <v-col v-if="existing.drawers?.length || existing.lowest === 'drawer'" cols="12" class="text-body-2 text-medium-emphasis" data-test="existing-drawer-words">
              Drawer openings are counted from the top, each as wide as the lowest opening. A new drawer front is a front only: the box and
              its slides are already there and stay.
            </v-col>
          </template>
          <v-col cols="6">
            <v-select :model-value="existing.blind?.side ?? 'none'" label="A blind corner" :items="BLIND_SIDES" hide-details data-test="existing-blind" @update:model-value="setExistingBlind($event)" />
          </v-col>
          <v-col v-if="existing.blind" cols="6"><LengthField v-model="existing.blind.reach" label="Its blind part" hint="From the inside of its far side to the door opening" data-test="existing-blind-reach" /></v-col>
          <v-col cols="12">
            <v-switch :model-value="!!existing.inside" :label="cabinet.form === 'wall' ? 'Its inside is measured, to draw it at its own size' : 'Its inside is measured, to fit it out'" color="primary" density="compact" hide-details data-test="existing-inside" @update:model-value="setInsideMeasured(!!$event)" />
          </v-col>
          <v-col v-if="!existing.inside" cols="12" class="text-body-2 text-medium-emphasis" data-test="existing-words">
            Only its door opening is measured: enough for new doors. It is drawn at a size taken from the opening<template v-if="cabinet.form !== 'wall'">; measure its inside to put
            trays and shelves in it</template>.
          </v-col>
          <template v-if="existing.inside">
          <v-col cols="6"><LengthField v-model="existing.inside.widthFront" label="Inside width, at the front" data-test="existing-width-front" /></v-col>
          <v-col cols="6"><LengthField v-model="existing.inside.widthBack" label="Inside width, at the back" data-test="existing-width-back" /></v-col>
          <v-col cols="4"><LengthField v-model="existing.inside.depth" label="Inside depth" data-test="existing-depth" /></v-col>
          <v-col cols="4"><LengthField v-model="existing.inside.height" label="Inside height" data-test="existing-height" /></v-col>
          <v-col cols="4"><LengthField v-model="existing.hingeStandIn" label="Hinges stand in" data-test="existing-hinges" /></v-col>
          <v-col cols="12" class="text-body-2 text-medium-emphasis" data-test="existing-words">
            Measured inside the cabinet: between its sides at the front and at the back (the smaller, {{ L(existingInsideWidth(existing)) }}, is used),
            from the front edge of the sides to the back, and from its floor up to what is over it<template v-if="existing.frame === 'faceFrame'">;
            the door opening is the clear hole in the face frame</template>. The hinges: how far the furthest one stands in from the edge of the
            opening, so what goes in clears them. It is drawn {{ L(cabinet.size.width.mm) }} wide × {{ L(cabinet.size.height.mm) }} tall ×
            {{ L(cabinet.size.depth.mm) }} deep, a plain shell with walls as thick as the project's case material: nothing of it is cut, listed or bought.
          </v-col>
          </template>
          <v-col v-for="line in existingWrong" :key="line" cols="12">
            <v-alert type="warning" variant="tonal" density="compact" data-test="existing-problem">{{ line }}</v-alert>
          </v-col>
        </v-row>
        <v-row v-else density="compact">
          <v-col cols="4">
            <LengthField v-model="cabinet.size.width" label="Width" />
            <v-menu>
              <template #activator="{ props: menu }">
                <v-btn v-bind="menu" variant="tonal" size="x-small" class="mt-1" :append-icon="mdiChevronDown" title="Standard widths: pick one of the widths cabinets are sold in" data-test="standard-widths">Standard</v-btn>
              </template>
              <v-list density="compact" max-height="320">
                <v-list-item v-for="w in standardWidths" :key="w.mm" :title="L(w.mm)" @click="cabinet.size.width = { ...w }" />
              </v-list>
            </v-menu>
          </v-col>
          <v-col cols="4"><LengthField v-model="cabinet.size.height" :label="run ? `Height (the run's)` : 'Height'" /></v-col>
          <v-col cols="4"><LengthField v-model="cabinet.size.depth" :label="run ? `Depth (the run's)` : 'Depth'" /></v-col>
          <v-col cols="12">
            <v-select :model-value="cabinet.runId ?? ''" label="Stands" :items="runChoices" hide-details data-test="stands-in" @update:model-value="standIn($event)" />
          </v-col>
        </v-row>
        <WarningLines :lines="partLimits" :summary="partLimitsSummary" data-test="part-limits" />
        <HelpText>
          <p v-if="existing">
            This cabinet is already there. It is measured, not designed: its case is drawn so that what goes inside it can be
            fitted, and none of it is on a cut list, a parts list or a buying list. Doors that are kept are not drawn; new doors
            made here hang on its door opening, which is refacing. Making it "Made here" again brings back the cabinet it was.
          </p>
          <p v-else>Sizes are the outside of the case. Height is from the floor; depth is the case alone, without doors or a face frame.</p>
          <p v-if="run">
            This cabinet stands in the run "{{ run.name }}". Its depth, its height and its toe kick are the run's: changing one
            here changes it for every cabinet of the run<template v-if="cabinet.form !== 'wall'"> (the height, for every {{ cabinet.form }} cabinet of it)</template>.
            Which of its sides show comes from where it stands, and it is made once. Its own values are kept for when it leaves the run.
          </p>
          <p v-if="copiesOf(cabinet) > 1">
            Quantity {{ copiesOf(cabinet) }}: this cabinet is designed once and every part of it is cut {{ copiesOf(cabinet) }} times.
            The view and the parts list here show one; Plan and Make have them all, numbered {{ tags.get(cabinet.id) }}1 to
            {{ tags.get(cabinet.id) }}{{ copiesOf(cabinet) }}.
          </p>
          <p>
            The construction style, the toe kick, the materials and the joinery are the project's, set in Setup; every cabinet
            follows them. "Make its ... different" gives this cabinet its own copy of that group, starting from Setup's; "Follow
            Setup again" drops the copy.
          </p>
          <p v-if="wall">
            A wall cabinet has a full top where a base cabinet has its two stretchers, joined to the sides the way the bottom is,
            and no toe kick. It has doors only. How far its bottom is off the floor only places it in the picture of the whole
            project.
            <template v-if="framed">Its bottom is raised level with the top of the frame's bottom rail, which leaves a recess under it.</template>
          </p>
          <p v-else-if="cabinet.toeKick.casters && casterLift !== undefined">
            <template v-if="castersUnder === 'bottom'">On feet: a {{ casterName }} is screwed under each corner of the bottom itself, by hand; no pad.</template>
            <template v-else-if="castersUnder === 'layer'">On casters: a second layer of the case material is screwed under the whole case (the doubled bottom), and four
            {{ casterName }} casters are screwed to it, one in each corner, the front two with a brake.</template>
            <template v-else>On casters: a pad of the case material is screwed under each corner of the case, flush with its outside faces, and a
            {{ casterName }} caster is screwed to each, the front two with a brake.</template>
            The height is the case alone;
            the cabinet's box stands {{ L(casterLift) }} off the floor.
          </p>
          <p v-else-if="!toeKickOn">
            Flat bottom: the sides are plain rectangles and the bottom sits at the floor line, for a cabinet that stands on a bench,
            a separate base or casters. The height is still the case alone, so enter it without what the cabinet stands on.
            <template v-if="framed">The bottom rail stands above the bottom as a lip.</template>
          </p>
          <p v-if="framed">
            The face frame is glued and pocket-screwed to the case: the holes are in the {{ pocketFace('left') }} face of the left
            side, the {{ pocketFace('right') }} face of the right side, the underside of the bottom and the top of the front
            stretcher. A hidden side is against a wall or another cabinet, so its holes can go on the outside. The rails are
            pocket-screwed to the stiles from the back.
          </p>
          <p v-else-if="inset">
            The inset style is a frameless case with its doors and drawers inside the box, flush with its front edges. Every front
            is its opening less the gap all round, with one gap between two fronts, one above the other.
            <template v-if="cabinet.shop.edgeStrip">
              The front edges of the sides, bottom, top or front stretcher, shelves and partitions get a solid wood strip
              {{ L(cabinet.shop.edgeStrip.mm) }} thick, glued on, and those parts are cut smaller by it: the fronts are flush
              with the strips.
            </template>
            <template v-else-if="cabinet.shop.edgeBanding">
              The front edges of the case get {{ EDGE_BAND_THICKNESS }} mm banding (tune me), and those parts are cut smaller by it.
            </template>
            <template v-else>The edges of the case show and are left bare.</template>
            Doors start as slabs cut from the case material unless Setup gives them their own.
          </p>
          <p v-else>
            Frameless fronts are full overlay: they cover the case front, less the reveal at its outside edges and the front gap
            between two fronts, one above the other.
            <template v-if="cabinet.frameless.edgeStrip">
              The front edges of the sides, bottom, top or front stretcher, shelves and partitions get a solid wood strip
              {{ L(cabinet.frameless.edgeStrip.mm) }} thick, glued on, and those parts are cut smaller by it.
            </template>
            <template v-else-if="cabinet.frameless.edgeBanding">
              The front edges of the sides, bottom, front stretcher and shelves get {{ EDGE_BAND_THICKNESS }} mm banding (tune me), and
              those parts are cut smaller by it.
            </template>
            <template v-else>Edges are bare and parts are cut to full size.</template>
          </p>
        </HelpText>
      </div>

      <!-- What most cabinets leave alone: its top and place when it stands alone, a corner, its sides. -->
      <div v-if="!existing" v-show="nav.current.id === 'place'" data-test="topic-place">
        <v-row density="compact">
          <v-col v-if="!run && cabinet.form !== 'wall' && storedSelf" cols="12">
            <TopChoice :owner="storedSelf" :label="cabinet.form === 'tall' ? 'A top laid on it' : 'Top'" :laid="cabinet.form === 'tall' ? 'only' : 'offered'" :piece="topsNow.find((p) => p.cabinetId === cabinet.id)" :warnings="topProblemsOver([cabinet.id])" name="cabinet-top" />
          </v-col>
          <!-- A top of its own: laid on and over every side. -->
          <template v-if="!run && cabinet.top">
            <template v-if="cabinet.top.own">
              <v-col cols="4"><LengthField v-model="cabinet.top.own.overhang.front" label="Over the front" data-test="own-top-front" /></v-col>
              <v-col cols="4"><LengthField v-model="cabinet.top.own.overhang.ends" label="Over each end" /></v-col>
              <v-col cols="4"><LengthField v-model="cabinet.top.own.overhang.back" label="Over the back" /></v-col>
              <v-col cols="12"><OwnTopMade :top="cabinet.top.own" /></v-col>
              <v-col cols="12"><OwnTopLeaf :top="cabinet.top.own" :closed="ownLeafClosed" :line="ownLeafLine" /></v-col>
            </template>
            <template v-if="cabinet.top.own && !cabinet.top.own.torsion">
              <v-col cols="7"><v-select v-model="cabinet.top.own.edge.kind" label="Its edge, all round" :items="OWN_TOP_EDGES" hide-details data-test="own-top-edge" /></v-col>
              <v-col v-if="cabinet.top.own.edge.kind === 'strip'" cols="5">
                <LengthField :model-value="cabinet.top.own.edge.thickness ?? null" label="Strip thickness" @update:model-value="$event && (cabinet.top!.own!.edge.thickness = $event)" />
              </v-col>
              <v-col v-if="cabinet.top.own.edge.kind === 'roundover' || cabinet.top.own.edge.kind === 'chamfer'" cols="5">
                <LengthField :model-value="cabinet.top.own.edge.size ?? null" :label="cabinet.top.own.edge.kind === 'roundover' ? 'Radius' : 'Chamfer'" @update:model-value="$event && (cabinet.top!.own!.edge.size = $event)" />
              </v-col>
              <v-col cols="12">
                <v-select :model-value="cabinet.top.own.materialId ?? ''" label="Its material" :items="ownTopMaterials" hide-details data-test="own-top-material" @update:model-value="setOwnTopMaterial($event)" />
              </v-col>
            </template>
            <template v-if="cabinet.top.own">
              <v-col cols="12" class="text-caption text-medium-emphasis" data-test="own-top-words">
                Made here whatever Setup says of the project's countertops: {{ cabinet.top.own.torsion ? 'a torsion box' : 'one layer, no backsplash, the same edge on all four sides' }}. It is
                fastened from inside the case{{ cabinet.caseTop === 'panel' || cabinet.form === 'tall' ? ', up through its top panel' : ', up through its stretchers' }}.
              </v-col>
            </template>
          </template>
          <!-- Beside a closet tower: a shelf and a rod to the wall, or to the next tower. -->
          <template v-if="spansOffered">
            <v-col cols="12"><div class="text-body-2 font-weight-bold">Beside it</div></v-col>
            <template v-for="side in SPAN_SIDES" :key="side">
              <v-col cols="12">
                <v-switch :model-value="!!cabinet.spans?.[side]" :label="`A shelf and a rod to its ${side}`" color="primary" density="compact" hide-details :data-test="`span-${side}`" @update:model-value="setSpan(side, !!$event)" />
              </v-col>
              <template v-if="cabinet.spans?.[side]">
                <v-col cols="6"><LengthField v-model="cabinet.spans[side]!.length" label="How far" :data-test="`span-${side}-length`" /></v-col>
                <v-col cols="6"><v-select v-model="cabinet.spans[side]!.to" label="To" :items="SPAN_TO" hide-details /></v-col>
                <v-col cols="6"><LengthField v-model="cabinet.spans[side]!.up" label="The shelf's top, off the floor" /></v-col>
                <v-col cols="6"><v-switch :model-value="!!cabinet.spans[side]!.rod" label="A rod under it" color="primary" density="compact" hide-details @update:model-value="setSpanRod(side, !!$event)" /></v-col>
              </template>
            </template>
            <v-col v-if="builtSpans.length" cols="12" class="text-body-2 text-medium-emphasis" data-test="span-words">
              <div v-for="s in builtSpans" :key="s.side">
                To the {{ s.side }}: a shelf {{ L(s.x1 - s.x0) }} long on a cleat at each end<template v-if="s.rod">, and a bought rod under it {{ L(s.rod.clearUnder) }} off the floor: {{ hangingWords(s.rod.clearUnder) }}</template
                ><template v-if="s.brackets">. It is longer than it carries between its ends: {{ s.brackets === 1 ? 'a bracket' : `${s.brackets} brackets` }} under it, on the hardware list</template>.
              </div>
            </v-col>
          </template>
          <v-col v-if="cabinet.form !== 'wall' && cabinet.toeKick.off && !existing && !cabinet.corner" cols="12">
            <v-switch
              :model-value="!!cabinet.noBottom"
              label="No bottom panel"
              color="primary"
              density="compact"
              :hint="cabinet.noBottom ? 'A stretcher at the bottom at the back, and one at the front unless a rail is there, in place of the bottom: for a case of drawers.' : ''"
              :persistent-hint="!!cabinet.noBottom"
              :hide-details="!cabinet.noBottom"
              data-test="no-bottom"
              @update:model-value="setNoBottom(!!$event)"
            />
          </v-col>
          <v-col v-if="takesNoBack(cabinet)" cols="12">
            <v-switch
              :model-value="!!cabinet.noBack"
              label="No back"
              color="primary"
              density="compact"
              :hint="cabinet.noBack ? 'An open case: nothing keeps it square but its joints. Fasten it to a wall, or give it a fixed shelf.' : ''"
              :persistent-hint="!!cabinet.noBack"
              :hide-details="!cabinet.noBack"
              data-test="no-back"
              @update:model-value="setNoBack(!!$event)"
            />
          </v-col>
          <v-col v-if="cabinet.form === 'base'" cols="12">
            <v-select :model-value="cabinet.caseTop ?? 'stretchers'" label="The case is closed on top by" :items="CASE_TOPS" hide-details data-test="case-top" @update:model-value="setCaseTop($event)" />
          </v-col>
          <v-col v-if="context.room && !run" cols="12">
            <PlacementFields :placement="cabinet.placement" :auto="autoPlacement(cabinetGroupKey(cabinet.id))" @update:placement="setCabinetPlacement" />
          </v-col>
          <v-col v-if="wall" cols="6">
            <LengthField :model-value="cabinet.offFloor ?? null" label="Bottom off the floor" data-test="off-floor" @update:model-value="$event && (cabinet.offFloor = $event)" />
          </v-col>
          <!-- A hutch: a wall cabinet standing on another piece's top. -->
          <v-col v-if="wall && !existing && standChoices.length > 1" cols="12">
            <v-select :model-value="cabinet.onTop?.of ?? ''" label="It is" :items="standChoices" hide-details data-test="stands-on-top" @update:model-value="standOn(store.project!, cabinet.id, $event || undefined, store.materials, store.shop.hardware)" />
            <div v-if="cabinet.onTop" class="text-caption text-medium-emphasis mt-1">
              Not hung: it stands at the back of that piece's top, their left ends in line, and is screwed to it from underneath. Its bottom is set to that
              top's height; the picture of the whole project keeps it there when the piece under it changes.
            </div>
          </v-col>
          <template v-if="cabinet.construction === 'faceFrame' && !cabinet.existing && cabinet.corner?.kind !== 'diagonal'">
            <v-col v-for="end in OVERHANG_ENDS" :key="end" cols="6">
              <LengthField
                :model-value="cabinet.frameOverhang?.[end] ?? null"
                :label="`Frame past its ${end} side`"
                optional
                :data-test="`frame-overhang-${end}`"
                @update:model-value="setFrameOverhang(end, $event)"
              />
            </v-col>
            <v-col cols="12" class="text-caption text-medium-emphasis" data-test="frame-overhang-words">
              The face frame stands {{ L(frameOverhang.left) }} past the box's left side and {{ L(frameOverhang.right) }} past its right
              ({{ cabinet.faceFrame.overhang ? `the project's is ${L(cabinet.faceFrame.overhang.mm)}` : 'the project has none' }}; a field left empty follows it).
              Set one to 0 at an end that shows, or wider at a wall to scribe.
            </v-col>
          </template>
          <v-col cols="12">
            <v-select v-model="ownInside" label="Its inside is finished" :items="insideChoices" hide-details data-test="cabinet-inside-finish" />
          </v-col>
        </v-row>
        <v-row v-if="cabinet.form !== 'tall'" density="compact" data-test="corner">
          <v-col cols="12">
            <div class="text-body-2 font-weight-bold mb-1">Corner</div>
            <ChoiceTiles v-model="cornerKind" :items="cornerTiles" label="Corner" name="corner-kind" size="small" />
          </v-col>
          <v-col v-if="cabinet.corner?.kind === 'diagonal'" cols="12" class="text-caption text-medium-emphasis">
            In plan five-sided: two backs along the walls, the width along each; two short sides square to the walls, the depth;
            and the diagonal front, {{ L(frontWidth(cabinet)) }} across, with the doors. Its bottom, top and shelves are cut on the CNC.
            Its hinge plates and shelf pins are fitted by hand. It turns the corner at the {{ cabinet.corner.side }} end of its run.
          </v-col>
          <v-col v-if="cabinet.corner?.kind === 'lShaped'" cols="12" class="text-caption text-medium-emphasis">
            Square in plan from outside, the width along each wall, the inside corner cut out by the depth: two faces
            {{ L(lShapedFace(cabinet)) }} across, a door on each, hinged together (bi-fold) and the pair on the end side. A
            {{ L(lazySusanDiameter(cabinet)) }} lazy susan turns inside ({{ susanOf(cabinet) ? 'made here' : 'on the hardware list' }}). Its L bottom and top are cut on the CNC;
            its hinge plates are fitted by hand. Frameless or inset; it turns the corner at the {{ cabinet.corner.side }} end of its run.
          </v-col>
          <template v-if="cabinet.corner?.kind === 'diagonal' || cabinet.corner?.kind === 'lShaped'">
            <v-col cols="12">
              <v-select :model-value="susanChoice" label="Lazy susan" :items="susanChoices" hide-details data-test="susan" @update:model-value="setSusan($event)" />
            </v-col>
            <v-col v-if="cabinet.corner.susan" cols="12">
              <v-select :model-value="cabinet.corner.susan.rim" label="Its rim" :items="SUSAN_RIMS" hide-details data-test="susan-rim" @update:model-value="setSusanRim($event)" />
            </v-col>
            <v-col v-if="cabinet.corner.kind === 'lShaped' && cabinet.corner.susan?.turns === 'pole'" cols="12">
              <v-switch
                :model-value="cabinet.corner.susan.doors === 'onSusan'"
                label="Its doors are fixed to it and turn with it"
                color="primary"
                density="compact"
                hide-details
                data-test="susan-doors"
                @update:model-value="setSusanDoors(!!$event)"
              />
            </v-col>
            <v-col v-if="cabinet.corner.susan" cols="12" class="text-caption text-medium-emphasis" data-test="susan-words">
              Made here (untested): two {{ cabinet.corner.kind === 'lShaped' ? 'pie-cut' : 'whole round' }} shelves cut on the CNC,
              <template v-if="cabinet.corner.susan.turns === 'bearings'">each turning on a bought bearing ring, the upper one on a fixed shelf half-way up.</template>
              <template v-else>both on a bought pole through their centres, turning together.</template>
              <template v-if="cabinet.corner.susan.rim === 'kerfed'"> The rim is a strip of the back's material with slots cut across it so it bends, standing in a groove round the shelf.</template>
              <template v-else-if="cabinet.corner.susan.rim === 'laminated'"> The rim is two strips of 1/8" hardboard, glued one inside the other in a groove round the shelf.</template>
              <template v-if="cabinet.corner.kind === 'lShaped' && cabinet.corner.susan.turns === 'pole' && cabinet.corner.susan.doors === 'onSusan'">
                The two doors are screwed to the shelves and have no hinges: push one and the whole turns. They stand inside the opening,
                narrow enough to pass the end sides, with a fixed stile beside each and no corner post. The Doors slider turns it.
              </template>
              <template v-else-if="cabinet.corner.kind === 'lShaped'"> The two doors are a bi-fold pair on hinges, apart from it.</template>
              They go in before the top goes on.
            </v-col>
          </template>
          <template v-if="cabinet.corner?.kind === 'blind'">
            <v-col cols="6"><LengthField v-model="cabinet.corner.blind" label="Blind width (tune me)" data-test="blind-width" /></v-col>
            <v-col cols="6"><LengthField v-model="cabinet.corner.filler" label="Filler (tune me)" /></v-col>
            <v-col cols="12" class="text-caption text-medium-emphasis">
              The blind width runs from the case's {{ cabinet.corner.side }} edge to the door opening: the other run's end cabinet covers it,
              less the filler beside the door, which keeps the doors and handles clear of the other run.
              {{ framed ? 'Behind a face frame the stile on that side is that wide.' : 'A blind panel and a filler strip in the doors\' material cover it.' }}
            </v-col>
          </template>
        </v-row>
        <v-row v-if="framed" density="compact">
          <v-col cols="6"><v-select v-model="cabinet.sides.left" label="Left side" :items="exposures" :disabled="!!run" /></v-col>
          <v-col cols="6"><v-select v-model="cabinet.sides.right" label="Right side" :items="exposures" :disabled="!!run" /></v-col>
        </v-row>
      </div>

      <!-- What it does differently from Setup. -->
      <div v-if="!existing" v-show="nav.current.id === 'construction'" data-test="topic-construction">
        <div class="text-body-2" data-test="follows-setup">
          <template v-if="differs.length">Differs from Setup: {{ differs.join(', ') }}.</template>
          <template v-else-if="ownConstruction || ownCase">Its own copy of Setup's values, the same as Setup's for now.</template>
          <template v-else>Follows Setup: {{ setupLine }}.</template>
        </div>
        <div class="d-flex flex-wrap ga-1 mt-1 mb-2">
          <v-btn v-if="!ownConstruction" variant="text" size="small" color="primary" data-test="own-construction" @click="ownConstruction = true">Make its construction different</v-btn>
          <v-btn v-if="!ownCase" variant="text" size="small" color="primary" data-test="own-case" @click="ownCase = true">Make its case and joinery different</v-btn>
          <v-btn v-if="ownConstruction || ownCase" variant="text" size="small" data-test="follow-setup" @click="followSetup">Follow Setup again</v-btn>
        </div>
        <template v-if="ownConstruction">
          <div class="text-caption text-medium-emphasis">This cabinet's construction: the style, its values and the toe kick.</div>
          <CabinetSettingsFields :settings="cabinet" part="construction" :floor="!wall" />
        </template>
        <template v-if="ownCase">
          <div class="text-caption text-medium-emphasis">This cabinet's case and joinery: the materials, the shelf pin and the joints.</div>
          <CabinetSettingsFields :settings="cabinet" part="case" :walls="wall" :floor="!wall" />
        </template>
        <HelpText label="About its case and joinery">
          <p v-if="pins">
            The shelf-pin holes are behind the doors, {{ store.cncLength(pins.pin.hole.diameter) }} across and
            {{ store.cncLength(pins.pin.hole.depth) }} deep, {{ store.cncLength(pins.pin.rows.frontSetback) }} from the front edge and
            {{ store.cncLength(pins.pin.rows.rearSetback) }} in front of the back, {{ store.cncLength(pins.pin.rows.spacing) }} apart
            (tune me).
            <template v-if="pins.pin.note">{{ pins.pin.note }}</template>
          </p>
          <p>Part sizes use each material's measured thickness: the project's own, under Materials in Setup.</p>
          <p v-if="wall && cabinet.hanging === 'rails'">
            Hanging rails: a rail {{ L(HANGING_RAIL_WIDTH) }} tall (tune me) stands inside the cabinet against the back, one under
            the top and one on the bottom. The screws that hold the cabinet to the wall go through them and the back into the
            studs. The shelf-pin holes stop short of them. How wall cabinets hang is the project's, like the joinery.
          </p>
          <p v-else-if="wall">
            French cleat: a strip {{ L(CLEAT_WIDTH) }} wide (tune me) with a 45° bevel along one edge is glued and screwed to the
            top of the cabinet's back, and its mate to the wall; the cabinet hooks over it. A spacer strip of the same thickness
            at the bottom of the back keeps the cabinet plumb. The three strips are cut on the saw, the bevel ripped on the table
            saw, and are as long as the cabinet is wide. The cabinet stands off the wall by their thickness.
          </p>
          <p>
            The case joints are how the bottom and the {{ wall ? 'top' : 'stretchers' }} meet the sides.
            <template v-if="anyScrews">
              Pocket screws change no size: the holes are in the underside of the bottom and the top of
              {{ nailer ? 'the front stretcher' : 'the stretchers' }}, out of sight{{
                nailer && caseJointOf(cabinet, 'backStretcher') === 'pocketScrews' ? ', and in the rear face of the nailer, which the back covers' : ''
              }}.
            </template>
            <template v-if="anyDado">
              A dado is {{ L(CASE_DADO_DEPTH) }} deep in each side (tune me) and glued, with no screws; the part is
              {{ L(2 * CASE_DADO_DEPTH) }} longer. It runs out through the front edge of the side, where the end of the
              part shows{{ framed ? ' until the face frame covers it' : inset ? '' : ' unless the edge is banded' }}.
            </template>
            <template v-if="anyTabs">
              Tabs and slots are cut on the CNC and glued, with no screws: each part's ends have tabs about 2" long, and each side a
              slot for every tab{{ cabinet.joinery.tabs?.blind ? ', a pocket in its inside face, so nothing shows outside' : ', through it, so the ends of the tabs show on the outside of the case' }}.
              A part at the very top or bottom of a side has its slots open at that edge. The slots are cut a little bigger than the
              tabs (the machine's value, on the Shop profile).
            </template>
            <template v-if="anyThrough">
              Screws through the sides change no size: the CNC drills a {{ store.cncLength(CASE_SCREW_HOLE) }} hole through each side at each
              screw, from the inside face, and the {{ CASE_SCREW }} are driven from outside into the ends of the part (tune me). The
              heads show on the outside of the case; countersinking them is by hand.
            </template>
          </p>
          <p>
            <template v-if="cabinet.joinery.back === 'tabs'">
              The back stands between the sides, {{ L(BACK_GROOVE_INSET) }} in from their rear edges, with tabs up its two edges
              in slots in the sides{{ cabinet.joinery.tabs?.blind ? ' (blind: nothing shows outside)' : ', which show on the outside of the case' }}:
              glued, with no brads. It wants a back 1/2" thick or more. The bottom, the back stretcher and the shelves stop at its front face.
            </template>
            <template v-else-if="cabinet.joinery.back === 'rabbet'">
              The back sits in a rabbet along the rear inside edge of each side, {{ L(BACK_RABBET_DEPTH) }} deep (tune me) and
              as wide as the back is thick. The sides are the full case depth and the back is fastened to the rear edges of
              the bottom and the back stretcher.
            </template>
            <template v-else-if="cabinet.joinery.back === 'groove'">
              The back sits in a groove in each side, {{ L(BACK_GROOVE_DEPTH) }} deep, its rear wall
              {{ L(BACK_GROOVE_INSET) }} in from the rear edge (both tune me). The sides are the full case depth; the bottom,
              the back stretcher and the shelves are {{ L(BACK_GROOVE_INSET) }} shallower than with a rabbet.
            </template>
            <template v-else>
              The back is fastened over the rear of the case and covers the rear edges of the sides, which are shallower by
              its thickness. Its edges show from the side.
            </template>
            <template v-if="cabinet.joinery.back !== 'applied' && cabinet.joinery.back !== 'tabs'">The {{ cabinet.joinery.back }} runs the full height of the side, down to the floor.</template>
            <template v-if="nailer">
              The back stretcher stands on edge with its rear face against the back: something solid for screws into the
              wall.
            </template>
            <template v-else>The back stretcher lies flat, like the front one.</template>
          </p>
        </HelpText>
      </div>

      <div v-if="run" v-show="nav.current.id === 'run'" data-test="topic-run">
        <v-row density="compact">
          <v-col cols="12"><v-text-field v-model="run.name" label="Run's name" hide-details data-test="run-name-field" /></v-col>
          <template v-if="!placedOnWall">
            <v-col cols="6"><v-select v-model="run.ends.left" label="Left end" :items="ENDS" hide-details data-test="run-left" /></v-col>
            <v-col cols="6"><v-select v-model="run.ends.right" label="Right end" :items="ENDS" hide-details data-test="run-right" /></v-col>
          </template>
          <v-col v-else cols="12" class="text-body-2 text-medium-emphasis">Its ends are where it stands: against the room's wall where an end meets one, open elsewhere.</v-col>
        </v-row>
        <v-row density="compact" class="mt-1">
          <v-col cols="8">
            <LengthField :model-value="run.length ?? null" label="Length to fill" data-test="run-length" @update:model-value="$event && (run.length = $event)" />
          </v-col>
          <v-col cols="4" class="d-flex align-center">
            <v-btn v-if="run.length" variant="text" size="small" data-test="run-no-length" @click="delete run.length">No length</v-btn>
          </v-col>
        </v-row>
        <template v-if="runKindOf(cabinet.form) === 'floor'">
          <SubHead>Bottom</SubHead>
          <v-select :model-value="bottomKindOf(run.shared.toeKick)" label="The run stands on" :items="BOTTOM_KINDS" hide-details data-test="run-bottom" @update:model-value="setGroupBottom($event)" />
          <v-select
            v-if="run.shared.toeKick.casters"
            :model-value="casterUnderChoice(run.shared.toeKick)"
            label="Under the casters"
            :items="CASTER_UNDER_CHOICES"
            hide-details
            class="mt-2"
            data-test="run-caster-under"
            @update:model-value="setGroupCasterUnder($event)"
          />
          <div v-if="run.shared.toeKick.casters" class="text-caption text-medium-emphasis mt-1" data-test="run-casters">
            One set of casters under the whole {{ island ? 'island' : 'run' }}{{ casterWords }}.
          </div>
          <SubHead>Top</SubHead>
          <TopChoice v-if="!island" :owner="run" label="A countertop over this run" :piece="topsNow.find((p) => p.runId === run!.id)" :warnings="topProblemsOver(run.cabinetIds)" name="run-top" />
          <div v-else class="text-caption text-medium-emphasis">The island's one top covers this row: it is chosen under Placement, with the island.</div>
          <v-select
            v-if="run.top && !island && !isTorsionTop(run.top)"
            :model-value="run.top.cornerJoint ?? ''"
            label="Where it meets another top at a corner"
            :items="[{ title: 'As Setup says (a butt joint; a mitre on a bought top)', value: '' }, { title: 'A butt joint', value: 'butt' }, { title: 'A mitre', value: 'mitre' }]"
            hide-details
            class="mt-2"
            @update:model-value="setCornerJoint($event)"
          />
        </template>
        <template v-if="context.room">
          <SubHead>Placement</SubHead>
          <v-select
            v-if="runKindOf(cabinet.form) === 'wall' && floorRuns.length"
            v-model="alignedWith"
            label="Line up with"
            :items="[{ title: 'Nothing: placed on its own', value: '' }, ...floorRuns.map((r) => ({ title: `Over the run &quot;${r.name}&quot;`, value: r.id }))]"
            hide-details
            class="mb-2"
            data-test="aligned-with"
          />
          <div v-if="run.alignedWith" class="text-body-2 text-medium-emphasis">Over the run, from its left end, on its wall; it moves with it.</div>
          <template v-else-if="island">
            <div class="text-body-2 mb-2" data-test="island">
              A row of the island "{{ island.name }}"<template v-if="island.rows.length > 1">, back to back with the run "{{ otherRow?.name }}"</template>.
            </div>
            <v-row density="compact">
              <v-col cols="12"><v-text-field v-model="island.name" label="Island's name" hide-details /></v-col>
              <v-col cols="12">
                <v-select :model-value="island.rows[1] ?? ''" label="Back to back with" :items="secondRows" hide-details data-test="island-second" @update:model-value="setSecondRow($event)" />
              </v-col>
              <v-col cols="4"><LengthField :model-value="island.placement.x" label="Along the back wall" @update:model-value="$event && (island!.placement.x = $event)" /></v-col>
              <v-col cols="4"><LengthField :model-value="island.placement.y" label="Out from it" @update:model-value="$event && (island!.placement.y = $event)" /></v-col>
              <v-col cols="4"><v-select v-model="island.placement.turn" label="Facing" :items="TURNS" hide-details /></v-col>
            </v-row>
            <div class="text-caption text-medium-emphasis mt-1">Where the first row's back-left corner stands; a second row stands back to back with it, centred.</div>
            <v-switch v-if="island.rows.length === 1" :model-value="island.finishedBack !== false" label="A finished back over the row's backs" color="primary" density="compact" hide-details data-test="island-finished-back" @update:model-value="setFinishedBack(!!$event)" />
            <TopChoice :owner="island" label="Top" :piece="islandPiece" :warnings="topProblemsOver(islandPiece?.cabinetIds ?? [])" name="island-top" class="mt-2" />
            <v-btn variant="text" color="error" size="small" class="mt-1" @click="dissolveIsland">Not an island</v-btn>
          </template>
          <template v-else>
            <PlacementFields :placement="run.placement" :auto="autoPlacement(run.id)" @update:placement="setRunPlacement" />
            <v-btn v-if="runKindOf(cabinet.form) === 'floor'" variant="text" color="primary" size="small" class="mt-1" data-test="make-island" @click="makeIsland">Make it an island</v-btn>
          </template>
        </template>
        <div class="text-body-2 mt-3">{{ runSummary }}.</div>
        <template v-if="fit">
          <v-alert v-if="fit.leftOver < -0.5" type="warning" variant="tonal" density="compact" class="mt-2" data-test="run-too-long">
            The run is {{ L(-fit.leftOver) }} longer than the {{ L(fit.length) }} it is to fill: make a cabinet narrower or take one out.
          </v-alert>
          <div v-else-if="fit.fillers.length" class="text-body-2 mt-1" data-test="run-fillers">
            {{ L(fit.leftOver) }} is left over of {{ L(fit.length) }}:
            {{ fit.fillers.length === 2 ? `a ${L(fit.fillers[0]!.width)} filler strip at each end` : `a ${L(fit.fillers[0]!.width)} filler strip at the ${fit.fillers[0]!.end} end` }},
            against the wall. It is on the saw cut list; scribe it to the wall.
          </div>
          <div v-else-if="fit.leftOver > 0.5" class="text-body-2 mt-1">
            {{ L(fit.leftOver) }} is left over of {{ L(fit.length) }}. Neither end is against a wall, so nothing fills it.
          </div>
          <div v-else class="text-body-2 mt-1">The cabinets fill the {{ L(fit.length) }} exactly.</div>
        </template>
        <div class="text-body-2 text-medium-emphasis mt-1">
          Left to right: {{ runCabinets(context, run).map((c) => tagged(c.name || 'Cabinet', tags.get(c.id))).join(', ') }}.
        </div>
        <v-btn variant="text" color="error" size="small" class="mt-2" data-test="dissolve-run" @click="dissolveRun">Dissolve the run</v-btn>
        <HelpText>
          A run is cabinets that stand side by side as one piece: {{ runKindOf(cabinet.form) === 'wall' ? 'wall cabinets' : 'base and tall cabinets' }}.
          They stand left to right in the order of the list above; the arrows there move the selected one. They share one depth,
          one toe kick and, for each form, one height. A side against a neighbour, or at an end that is against a wall, is hidden;
          a side at an open end shows, and so does the side of a tall cabinet beside a base one. A copy of a cabinet in a run
          stands beside it in the run. With a length to fill (wall to wall, or from a wall to a mark), what the cabinets leave
          over is taken up by a filler strip at each end that is against a wall: as tall as the cabinet's front, flush with
          it, cut a little wide on the saw and scribed to the wall by hand.
        </HelpText>
      </div>

      <div v-show="nav.current.id === 'room'" data-test="topic-room">
        <template v-if="context.room">
          <v-row density="compact">
            <v-col cols="4"><LengthField v-model="context.room.length" label="Length (back wall)" data-test="room-length" /></v-col>
            <v-col cols="4"><LengthField v-model="context.room.width" label="Width (side walls)" data-test="room-width" /></v-col>
            <v-col cols="4"><LengthField v-model="context.room.ceiling" label="Ceiling" data-test="room-ceiling" /></v-col>
          </v-row>
          <v-select
            :model-value="context.room.open ?? []"
            :items="[{ title: 'Back', value: 'back' }, { title: 'Left', value: 'left' }, { title: 'Right', value: 'right' }, { title: 'Front', value: 'front' }]"
            label="Open sides (no wall: open to the next room)"
            multiple
            chips
            density="compact"
            hide-details
            class="mb-2"
            data-test="room-open"
            @update:model-value="(walls: RoomWall[]) => (walls.length ? (context.room!.open = walls) : delete context.room!.open)"
          />
          <v-btn variant="text" size="small" @click="delete context.room">No room</v-btn>
        </template>
        <v-btn v-else variant="tonal" color="primary" size="small" data-test="add-room" @click="context.room = starterRoom()">Add a room</v-btn>
        <svg v-if="plan" :viewBox="`-60 -200 ${plan.length + 120} ${plan.width + 260}`" class="room-plan mt-2" data-test="room-plan">
          <rect x="0" y="0" :width="plan.length" :height="plan.width" class="room-wall" />
          <line v-for="o in plan.open" :key="o.wall" :x1="o.x1" :y1="o.y1" :x2="o.x2" :y2="o.y2" class="room-open" />
          <text :x="plan.length / 2" y="-50" class="room-label" text-anchor="middle">back</text>
          <g v-for="g in plan.groups" :key="g.key" class="room-group" :class="{ wall: g.kind === 'wall', on: g.selected }" @click="selectId(g.first)">
            <title>{{ g.name }}</title>
            <polygon :points="g.points" />
          </g>
          <g v-for="a in planAppliances" :key="a.id" class="room-appliance">
            <title>{{ a.name }}</title>
            <polygon :points="a.points" />
          </g>
        </svg>
        <div v-if="plan" class="text-caption text-medium-emphasis">Seen from above, the back wall at the top. Click a run or a cabinet to select it; wall cabinets are outlined.</div>
        <v-alert v-for="w in layoutWarnings" :key="w" type="warning" variant="tonal" density="compact" class="mt-2" data-test="layout-warning">{{ w }}</v-alert>
        <v-alert v-for="w in casterLoad" :key="w" type="warning" variant="tonal" density="compact" class="mt-2" data-test="caster-load">{{ w }}</v-alert>
        <v-alert v-for="c in tooTall" :key="c.cabinet.id" type="warning" variant="tonal" density="compact" class="mt-2" data-test="past-ceiling">
          {{ tagged(c.cabinet.name || 'Cabinet', tags.get(c.cabinet.id)) }} reaches {{ L(c.top) }} off the floor, past the {{ L(context.room!.ceiling.mm) }} ceiling.
        </v-alert>
        <RoomLookFields v-if="context.room" :room="context.room" />
        <HelpText>
          A rectangular room: its length along the back wall, its width along the side walls, and its ceiling height. The walls are
          named as seen from the middle of the room facing the back wall. The whole-project view ("The room") starts standing
          inside it at eye height, looking at the cabinets, with its floor, walls and ceiling round you. Drag to look round; zoom
          out past a wall or up past the ceiling and that one is cut away, so you look in from outside. A side marked open has no
          wall: the room goes on into the next one there. Sizes are inside the walls (tune me: 12' × 10', 8' to start).
        </HelpText>
      </div>

      <div v-show="nav.current.id === 'sink'" data-test="topic-sink">
        <v-switch :model-value="!!cabinet.sink" label="A sink over it" color="primary" density="compact" hide-details data-test="sink-on" @update:model-value="setCabinetSink(!!$event)" />
        <template v-if="cabinet.sink">
          <v-row density="compact">
            <v-col cols="12"><v-select :model-value="cabinet.sink.mount" label="Kind" :items="sinkMounts" hide-details data-test="sink-mount" @update:model-value="setSinkMount" /></v-col>
            <v-col cols="6"><v-select v-model="cabinet.sink.shape" label="Shape" :items="SINK_SHAPES" hide-details data-test="sink-shape" /></v-col>
            <v-col v-if="cabinet.sink.mount !== 'vessel' && cabinet.sink.mount !== 'integrated'" cols="6"><v-select :model-value="sinkBowls" label="Bowls" :items="SINK_BOWLS" hide-details data-test="sink-bowls" @update:model-value="setSinkBowls" /></v-col>
            <v-col cols="4"><LengthField v-model="cabinet.sink.width" label="Width" /></v-col>
            <v-col cols="4"><LengthField v-model="cabinet.sink.depth" label="Front to back" /></v-col>
            <v-col cols="4"><LengthField v-model="cabinet.sink.bowlDepth" label="Bowl depth" /></v-col>
            <v-col cols="6"><LengthField :model-value="cabinet.sink.offset ?? len('0')" label="Right of centre" data-test="sink-offset" @update:model-value="setSinkOffset" /></v-col>
            <template v-if="cabinet.sink.mount === 'farmhouse'">
              <v-col cols="6"><LengthField :model-value="cabinet.sink.apron?.height ?? { mm: FARMHOUSE.height, unit: 'in' }" label="Apron, tall" data-test="sink-apron-height" @update:model-value="setApron('height', $event)" /></v-col>
              <v-col cols="6"><LengthField :model-value="cabinet.sink.apron?.proud ?? { mm: FARMHOUSE.proud, unit: 'in' }" label="In front of the doors" data-test="sink-apron-proud" @update:model-value="setApron('proud', $event)" /></v-col>
            </template>
            <v-col v-if="cabinet.sink.mount !== 'integrated'" cols="6"><v-select :model-value="faucetChoice" label="Faucet" :items="FAUCETS" hide-details data-test="sink-faucet" @update:model-value="setFaucet" /></v-col>
            <v-col v-if="cabinet.sink.faucet?.holes === 3" cols="6"><LengthField :model-value="{ mm: faucetSpread(cabinet.sink), unit: 'in' }" label="Outer holes apart" data-test="sink-spread" @update:model-value="setFaucetSpread" /></v-col>
          </v-row>
          <div v-if="cabinet.sink.faucet && cabinet.sink.mount !== 'integrated'" class="text-body-2 text-medium-emphasis mt-2" data-test="sink-faucet-words">
            {{ holesInTop(cabinet.sink) ? `Its holes, ${L(SINK.faucetHole)} across, are cut through the top behind the sink.` : "A drop-in sink has its faucet's holes in its own deck: none are cut in the top." }}
          </div>
          <v-alert v-for="w in sinkProblemList" :key="w" type="warning" variant="tonal" density="compact" class="mt-2" data-test="sink-problem">{{ w }}</v-alert>
          <HelpText>
            The sink is the cabinet's: it is set in whatever top lies over the cabinet (the run's, its own, an island's), with or
            without a room. Its sizes are the maker's, outside: the rim of a drop-in, the bowl of an undermount. A drop-in's opening
            is {{ L(SINK.rim) }} inside its rim each side, an undermount's {{ L(SINK.flange) }} inside its outside (both tune me).
            It sits across the cabinet where it says, and front to back in the middle of the top over the cabinet. The CNC cuts the
            opening in a top made here; in a bought top it is cut by hand, in a measured one by the supplier. Its bowl is in the way
            under it, for what is fitted out inside.
          </HelpText>
        </template>
      </div>

      <div v-if="context.room" v-show="nav.current.id === 'appliances'" data-test="topic-appliances">
        <div v-for="a in appliances" :key="a.id" class="mb-3" :data-test="`appliance-${a.id}`">
          <v-row density="compact" class="align-center">
            <v-col cols="7"><v-text-field v-model="a.name" label="Name" density="compact" hide-details /></v-col>
            <v-col cols="5" class="text-right"><v-btn variant="text" color="error" size="small" @click="removeAppliance(a.id)">Remove</v-btn></v-col>
            <v-col cols="4"><LengthField v-model="a.size.width" label="Width" /></v-col>
            <v-col cols="4"><LengthField v-model="a.size.height" label="Height" /></v-col>
            <v-col cols="4"><LengthField v-model="a.size.depth" label="Depth" /></v-col>
            <template v-if="a.placement.wall !== 'free'">
              <v-col cols="6"><v-select :model-value="applianceWall(a)" :items="WALLS" label="Against" density="compact" hide-details @update:model-value="setApplianceWall(a, $event)" /></v-col>
              <v-col cols="6"><LengthField v-model="a.placement.along" label="From the wall's left end" /></v-col>
            </template>
          </v-row>
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn v-for="k in APPLIANCE_KINDS" :key="k.kind" variant="tonal" color="primary" size="small" :data-test="`add-appliance-${k.kind}`" @click="addApplianceOf(k.kind)">Add a {{ k.title.split(',')[0]!.toLowerCase() }}</v-btn>
        </div>
        <HelpText>
          Generic appliances standing in the room: a size and a place, drawn in the whole-project view. Nothing is made for one. A
          top beside a dishwasher runs on over it; beside a range or a refrigerator it stops at its cabinet's side. A sink is not
          one: it is its cabinet's, under the cabinet's Sink topic. The sizes are typical ones (tune me): measure yours.
        </HelpText>
      </div>

      <div v-show="nav.current.id === 'openings'" data-test="topic-openings">
        <v-row v-if="!existing" density="compact" class="mb-2">
          <v-col v-if="layoutTiles.length > 1" cols="12">
            <ChoiceTiles
              :model-value="layout?.preset ?? 'doors'"
              :items="layoutTiles"
              label="Layout"
              name="layout"
              size="small"
              @update:model-value="setLayout($event, layout?.preset === 'drawers' ? layout.drawers : undefined)"
            />
          </v-col>
          <v-col v-else cols="12" class="text-body-2 text-medium-emphasis" data-test="layout">A wall cabinet has doors only.</v-col>
          <v-col v-if="layout?.preset === 'drawers'" cols="4">
            <v-select :model-value="layout.drawers" label="Drawers" :items="drawerCounts" data-test="drawer-count" @update:model-value="setLayout('drawers', $event)" />
          </v-col>
        </v-row>
        <v-row v-if="!cabinet.corner && !existing" density="compact" class="mb-1" data-test="bays">
          <v-col cols="4">
            <v-select :model-value="bays.length" label="Bays side by side" :items="BAY_COUNTS" hide-details data-test="bay-count" @update:model-value="setBays(store.project!, cabinet, $event)" />
          </v-col>
          <template v-if="bays.length > 1">
            <v-col v-for="(bay, i) in bays" :key="i" :cols="bays.length > 2 ? 4 : 4">
              <LengthField :model-value="bay.width ?? null" :label="`Bay ${i + 1} width`" optional @update:model-value="setBayWidth(i, $event)" />
            </v-col>
            <v-col v-if="framed" cols="12">
              <v-switch :model-value="cabinet.layout.partitions !== false" label="A partition behind each mullion" color="primary" density="compact" hide-details data-test="bay-partitions" @update:model-value="setPartitions(!!$event)" />
            </v-col>
            <v-col cols="12" class="text-body-2 text-medium-emphasis">
              Every bay has the whole layout, and any bay's doors can be left off ("Open", on its opening below); between two stands {{ dividerWords(cabinet, store.materials, L) }}<template v-if="framed && cabinet.layout.partitions === false">, with nothing behind it: the shelves run the full width</template>.
              A bay with no width shares what is left.
            </v-col>
          </template>
        </v-row>
        <v-row v-if="hasDoorRow && !existing" density="compact" class="mb-1">
          <v-col cols="6"><v-select v-model="cabinet.adjustableShelves" :label="upperDoorRows.size ? 'Shelves in the lower row' : 'Adjustable shelves'" :items="SHELF_COUNTS" hide-details data-test="shelves" /></v-col>
        </v-row>
        <!-- A hanging rod in an open row. -->
        <v-row v-if="rodOffered" density="compact" class="mb-1" data-test="rod">
          <v-col cols="12">
            <v-switch :model-value="!!cabinet.rod" label="A hanging rod in its lowest open row" color="primary" density="compact" hide-details data-test="rod-on" @update:model-value="setRod(!!$event)" />
          </v-col>
          <template v-if="cabinet.rod">
            <v-col cols="6"><LengthField :model-value="cabinet.rod.down ?? null" label="Its centre, below the opening's top" optional hint="Empty: 2-1/2 in" @update:model-value="setRodDown($event)" /></v-col>
            <v-col v-if="rod" cols="12" class="text-body-2 text-medium-emphasis" data-test="rod-words">
              A bought closet rod, cut to {{ L(rod.length - 3) }}, on a pair of flanges screwed to the sides: {{ L(rod.clearUnder) }} clear under it,
              {{ hangingWords(rod.clearUnder) }}. Nothing is made for it; it is on the hardware list.
              <template v-if="rodRowShelves"> The row it hangs in has {{ rodRowShelves === 1 ? 'a shelf' : `${rodRowShelves} shelves` }}: clothes hang into them. Set its shelves to 0.</template>
            </v-col>
          </template>
        </v-row>
        <!-- Holes through the back behind what is open. -->
        <v-row v-if="anyOpen && !cabinet.noBack && !existing" density="compact" class="mb-1" data-test="cables">
          <v-col cols="12">
            <v-switch :model-value="!!cabinet.cables" label="Cable holes through the back, behind what is open" color="primary" density="compact" hide-details data-test="cables-on" @update:model-value="setCables(!!$event)" />
          </v-col>
          <template v-if="cabinet.cables">
            <v-col cols="6"><LengthField v-model="cabinet.cables.diameter" label="Hole, across" data-test="cable-diameter" /></v-col>
            <v-col cols="6"><LengthField :model-value="cabinet.cables.up ?? null" label="Above the opening's floor" optional hint="Empty: 3 in" @update:model-value="setCableUp($event)" /></v-col>
            <v-col cols="12">
              <v-switch :model-value="!!cabinet.cables.air" label="A slot for air too, high in each" color="primary" density="compact" hide-details data-test="cables-air" @update:model-value="setCableAir(!!$event)" />
            </v-col>
            <v-col cols="12" class="text-body-2 text-medium-emphasis">Cut through the back on the CNC, with the back: one hole in the middle of each open opening's width.</v-col>
          </template>
        </v-row>
        <!-- A power hub in the open space at the top (a shop table's). Not offered: it shows only on a
             cabinet that has one (the folding table sample's, or one given it by a link's &hub=left), where it can be moved or taken away. -->
        <v-row v-if="cabinet.hub && cabinet.layout.rows[0]?.use === 'doors' && cabinet.form === 'base' && !existing" density="compact" class="mb-1" data-test="hub">
          <v-col cols="12">
            <v-select :model-value="cabinet.hub?.side ?? 'none'" :items="HUB_SIDES" label="A power hub in the space at the top" density="compact" hide-details data-test="hub-side" @update:model-value="setHub($event)" />
          </v-col>
          <v-col v-if="cabinet.hub" cols="12" class="text-body-2 text-medium-emphasis">
            For a shop table: a dust port, a power inlet and two outlets set into that side, as high as they go; a panel with a paddle switch, a lamp and the router and vac switches screwed on across the front of the top row, which loses its doors; and over the back, behind that row, a panel that comes off, set in level with the back, with a second port for the vac's hose. The row can be as low as 7 in, and the back stretcher lies flat. The CNC cuts their openings; check each against the part in hand first. The hub is 120 V house wiring: Build's lists describe one way to build it, not an electrical design.
            <v-alert v-for="w in hubWarnings" :key="w" type="warning" variant="tonal" density="compact" class="mt-1" data-test="hub-problem">{{ w }}</v-alert>
          </v-col>
        </v-row>
        <v-row v-if="topSupportOffered" density="compact" class="mb-1" data-test="top-support">
          <v-col cols="12">
            <v-switch :model-value="!!cabinet.topSupport?.cornerBlocks" label="Corner blocks under the top" color="primary" density="compact" hide-details data-test="corner-blocks" @update:model-value="setTopSupport({ cornerBlocks: !!$event })" />
          </v-col>
          <v-col cols="12">
            <v-switch :model-value="!!cabinet.topSupport?.crossStretchers" label="Cross stretchers beside a sink" color="primary" density="compact" hide-details data-test="cross-stretchers" @update:model-value="setTopSupport({ cross: !!$event })" />
          </v-col>
          <v-col v-if="cabinet.topSupport?.crossStretchers" cols="6">
            <LengthField v-model="cabinet.topSupport.crossStretchers.apart" label="Clear between them" />
          </v-col>
          <v-col v-if="cabinet.topSupport" cols="12" class="text-body-2 text-medium-emphasis">
            Flush with the top of the case, glued and screwed, for a top that wants more under it than the stretchers (a vanity top, stone).
            <template v-if="cabinet.topSupport.crossStretchers">The cross stretchers stand either side of the bowl: measure it under the top, and leave room for its clips.</template>
          </v-col>
        </v-row>
        <v-alert v-for="line in shelfTooLong" :key="line" type="warning" variant="tonal" density="compact" class="mb-3" data-test="shelf-span">{{ line }}</v-alert>
        <v-alert v-for="line in mayTip" :key="line" type="warning" variant="tonal" density="compact" class="mb-3" data-test="may-tip">{{ line }}</v-alert>
        <div v-if="pins" class="text-body-2 mb-3">
          Shelf pins: two rows of {{ pins.levels }} holes in each side<template v-if="pins.leftOut"
            >; {{ pins.leftOut }} {{ pins.leftOut === 1 ? 'level is' : 'levels are' }} left out to clear
            {{ framed ? 'the pocket holes that attach the face frame' : 'the hinge plates and the other holes in the sides' }}</template
          >.
        </div>
        <div v-for="opening in derived.openings" :key="opening.id" class="d-flex flex-wrap align-center ga-3 mb-3">
          <div class="flex-grow-1 opening-name">
            <div class="font-weight-bold">{{ opening.name }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ L(opening.width) }} wide × {{ L(opening.height) }} tall</div>
          </div>
          <LengthField
            v-if="rowOf(opening).height"
            :model-value="rowOf(opening).height ?? null"
            label="Height"
            class="row-height"
            @update:model-value="setRowHeight(rowOf(opening), $event)"
          />
          <span v-else class="text-body-2 text-medium-emphasis">{{ derived.openings.length === 1 ? 'the whole front' : layout?.preset === 'drawers' || layout?.preset === 'doorsOverDoors' ? 'equal share' : 'takes what is left' }}</span>
          <v-switch
            v-if="opening.use === 'doors' && !existing"
            :model-value="!!opening.open"
            label="Open"
            title="No doors on this row: open shelves"
            color="primary"
            density="compact"
            hide-details
            class="flex-grow-0 flex-shrink-0"
            :data-test="bays.length > 1 ? `bay-open-${opening.bay ?? 1}-${opening.rowId}` : `row-open-${opening.rowId}`"
            @update:model-value="setOpen(opening, !!$event)"
          />
          <v-select
            v-if="opening.use === 'drawer' && cabinet.construction === 'faceFrame' && !existing && (!opening.part || opening.part.n === 1) && (opening.bay ?? 1) === 1"
            :model-value="rowOf(opening).split ?? 1"
            label="Drawers side by side"
            title="Split this row into two or three drawers side by side, a short mullion between them"
            :items="[1, 2, 3]"
            hide-details
            class="row-split flex-grow-0"
            :data-test="`row-split-${opening.rowId}`"
            @update:model-value="setRowSplit(store.project!, cabinet, opening.rowId, Number($event))"
          />
          <v-select
            v-if="upperDoorRows.has(opening.rowId)"
            :model-value="rowOf(opening).shelves ?? 0"
            label="Shelves"
            :items="SHELF_COUNTS"
            hide-details
            class="row-height"
            data-test="upper-shelves"
            @update:model-value="setRowShelves(rowOf(opening), $event)"
          />
        </div>
        <HelpText>
          <template v-if="framed">
            Clear openings in a face frame with {{ L(cabinet.faceFrame.stileWidth.mm) }} stiles and
            {{ L(cabinet.faceFrame.railWidth.mm) }} rails<template v-if="derived.openings.length > 1">, one rail between the openings</template>.
          </template>
          <template v-else>Clear openings inside the case, between the sides<template v-if="derived.openings.length > 1">, with nothing between them</template>.</template>
          <template v-if="inset">The fronts sit inside them.</template>
          Changing the layout re-enters nothing: the doors and drawers of a layout you leave are kept and come back with it.
          <template v-if="layout?.preset === 'drawers'">The drawers are equal in height; each starts as a copy of the first.</template>
          <template v-if="layout?.preset === 'doorsOverDoors'">
            A fixed shelf stands between the two door rows, joined to the sides the way the bottom is. The upper doors have their
            own number of adjustable shelves, here; the lower doors' are on the Case and joinery card.
          </template>
        </HelpText>
      </div>

      <!-- What stands inside it: what is in the way, trays, shelves and racks. -->
      <div v-if="sinkOffered" v-show="nav.current.id === 'inside'" data-test="topic-inside">
        <v-switch :model-value="!!cabinet.inside" label="Fitted out inside: trays and shelves behind its doors" color="primary" density="compact" hide-details data-test="sink-on" @update:model-value="setSink(!!$event)" />
        <template v-if="cabinet.inside">
          <v-btn v-if="!cabinet.inside.obstacles.length && !cabinet.inside.organizers.length" size="small" variant="tonal" color="primary" class="mt-2" data-test="start-under-sink" @click="startUnderSink">
            It is under a sink: start with its trap and a tray
          </v-btn>

          <!-- What is in the way: each a line that opens to its measurements. -->
          <SubHead>In the way</SubHead>
          <div v-if="!cabinet.inside.obstacles.length" class="text-body-2 text-medium-emphasis">Nothing: add the trap, the valves and whatever else stands under the sink.</div>
          <div v-for="o in cabinet.inside.obstacles" :key="o.id" class="item" data-test="obstacle">
            <div class="item-line" @click="toggleItem(o.id)">
              <v-icon :icon="openItems.has(o.id) ? mdiChevronDown : mdiChevronRight" size="18" />
              <span class="font-weight-medium">{{ o.name ?? OBSTACLE_KINDS.find((k) => k.value === o.kind)?.title ?? capitalised(obstacleName(o)) }}</span>
              <span class="text-body-2 text-medium-emphasis item-summary">{{ obstacleSummary(o) }}</span>
              <v-btn :icon="mdiTrashCanOutline" variant="text" size="x-small" :aria-label="`Remove ${obstacleName(o)}`" data-test="obstacle-remove" @click.stop="removeObstacle(o.id)" />
            </div>
            <v-row v-if="openItems.has(o.id)" density="compact" class="item-fields">
              <v-col cols="12"><v-select v-model="o.kind" label="What it is" :items="OBSTACLE_KINDS" hide-details density="compact" /></v-col>
              <v-col cols="6"><LengthField v-model="o.width" label="Across" /></v-col>
              <v-col cols="6"><LengthField v-model="o.depth" label="Front to back" /></v-col>
              <v-col cols="6"><LengthField :model-value="o.fromLeft ?? null" label="From the left side" optional empty-text="in the middle" @update:model-value="setObstacle(o, 'fromLeft', $event)" /></v-col>
              <v-col cols="6"><LengthField :model-value="o.fromBack ?? null" label="Out from the back" optional empty-text="against it" @update:model-value="setObstacle(o, 'fromBack', $event)" /></v-col>
              <v-col cols="6"><LengthField :model-value="o.clearUnder ?? null" label="Clear under it" optional empty-text="on the floor" @update:model-value="setObstacle(o, 'clearUnder', $event)" /></v-col>
              <v-col cols="6"><LengthField :model-value="o.height ?? null" label="How tall" optional :empty-text="cabinet.sink ? 'to the sink' : 'up to the top'" @update:model-value="setObstacle(o, 'height', $event)" /></v-col>
            </v-row>
          </div>
          <v-menu>
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" size="small" variant="tonal" :prepend-icon="mdiPlus" class="mt-2" data-test="add-obstacle">Add something in the way</v-btn>
            </template>
            <v-list density="compact">
              <v-list-item v-for="k in OBSTACLE_KINDS" :key="k.value" :title="k.title" :data-test="`add-obstacle-${k.value}`" @click="addObstacleOpen(k.value)" />
            </v-list>
          </v-menu>

          <!-- What is made for it, from the floor up: each a line that opens. -->
          <SubHead>Made for it</SubHead>
          <div v-if="!cabinet.inside.organizers.length" class="text-body-2 text-medium-emphasis">Nothing yet: add a tray, a shelf or a pull-out.</div>
          <div v-for="o in cabinet.inside.organizers" :key="o.id" class="item" data-test="organizer">
            <div class="item-line" @click="toggleItem(o.id)">
              <v-icon :icon="openItems.has(o.id) ? mdiChevronDown : mdiChevronRight" size="18" />
              <span class="font-weight-medium">{{ organizerName(o) }}</span>
              <span class="text-body-2 text-medium-emphasis item-summary">{{ organizerSummary(o) }}</span>
              <v-btn :icon="mdiTrashCanOutline" variant="text" size="x-small" :aria-label="`Remove the ${organizerName(o).toLowerCase()}`" data-test="organizer-remove" @click.stop="removeOrganizer(o.id)" />
            </div>
            <v-row v-if="openItems.has(o.id)" density="compact" class="item-fields">
              <template v-if="o.kind === 'pullOut' && o.bins">
                <v-col cols="6"><LengthField v-model="o.bins.width" label="A bin, across" /></v-col>
                <v-col cols="6"><LengthField v-model="o.bins.depth" label="A bin, front to back" /></v-col>
                <v-col cols="6"><LengthField v-model="o.bins.height" label="A bin, high" /></v-col>
                <v-col cols="6"><v-select v-model="o.bins.count" label="Bins, one behind another" :items="[1, 2]" hide-details density="compact" /></v-col>
                <v-col cols="12"><LengthField :model-value="o.fromLeft ?? null" label="Its frame, from the left side" optional empty-text="as far left as the opening lets it" @update:model-value="setOrganizerLength(o, 'fromLeft', $event)" /></v-col>
              </template>
              <template v-else-if="o.kind === 'narrow'">
                <v-col cols="6"><LengthField :model-value="o.width ?? null" label="How wide, outside" optional :placeholder-mm="6 * 25.4" @update:model-value="setOrganizerLength(o, 'width', $event)" /></v-col>
                <v-col cols="6"><LengthField :model-value="o.wall ?? null" label="Its walls" optional :placeholder-mm="8 * 25.4" @update:model-value="setOrganizerLength(o, 'wall', $event)" /></v-col>
                <v-col cols="12"><LengthField :model-value="o.fromLeft ?? null" label="Its frame, from the left side" optional empty-text="as far left as the opening lets it" @update:model-value="setOrganizerLength(o, 'fromLeft', $event)" /></v-col>
              </template>
              <template v-else-if="o.kind === 'dividers'">
                <v-col cols="6"><v-select v-model="o.count" label="Boards, the ends counted" :items="[2, 3, 4, 5, 6, 7, 8, 10, 12]" hide-details density="compact" /></v-col>
                <v-col cols="6"><LengthField :model-value="o.height ?? null" label="How tall" optional @update:model-value="setOrganizerLength(o, 'height', $event)" /></v-col>
                <v-col cols="6"><LengthField :model-value="o.width ?? null" label="How wide" optional empty-text="the whole inside" @update:model-value="setOrganizerLength(o, 'width', $event)" /></v-col>
                <v-col cols="6"><LengthField :model-value="o.fromLeft ?? null" label="From the left side" optional empty-text="against it" @update:model-value="setOrganizerLength(o, 'fromLeft', $event)" /></v-col>
                <v-col cols="12"><LengthField :model-value="o.up ?? null" label="Its base, above the floor" optional empty-text="on the floor" @update:model-value="setOrganizerLength(o, 'up', $event)" /></v-col>
              </template>
              <template v-else>
                <v-col cols="6">
                  <LengthField :model-value="o.up ?? null" :label="o.kind === 'tray' || o.kind === 'blindTray' ? 'Above the floor' : 'Its top, above the floor'" optional empty-text="on the floor" @update:model-value="setOrganizerUp(o, $event)" />
                </v-col>
                <v-col v-if="o.kind === 'tray'" cols="6"><LengthField :model-value="o.wall ?? null" label="Its walls" optional :placeholder-mm="3.5 * 25.4" @update:model-value="setOrganizerLength(o, 'wall', $event)" /></v-col>
                <v-col v-if="o.kind === 'blindTray'" cols="12">
                  <v-switch :model-value="!!o.forward" label="It also comes forward, out of the door opening" color="primary" density="compact" hide-details data-test="blind-forward" @update:model-value="setBlindForward(o, !!$event)" />
                </v-col>
                <v-col v-if="o.kind === 'tray' && !(o.up && o.up.mm > 0)" cols="12">
                  <v-select :model-value="o.slides ?? 'sides'" label="Its slides" :items="TRAY_SLIDES" hide-details density="compact" data-test="tray-slides" @update:model-value="setTraySlides(o, $event)" />
                </v-col>
              </template>
            </v-row>
          </div>
          <v-menu>
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" size="small" variant="tonal" :prepend-icon="mdiPlus" class="mt-2" data-test="add-organizer">Add a tray, shelf or pull-out</v-btn>
            </template>
            <v-list density="compact">
              <v-list-item v-for="a in organizerAdds" :key="a.test" :title="a.title" :data-test="`add-organizer-${a.test}`" @click="addOrganizerOpen(a.kind, a.tall)" />
            </v-list>
          </v-menu>
          <v-select
            v-if="cabinet.inside.organizers.some((o) => o.kind !== 'shelf')"
            :model-value="trayMounting(cabinet)"
            label="The trays' slides hang on"
            :items="MOUNTINGS"
            hide-details
            density="compact"
            class="mt-4"
            data-test="sink-mounting"
            @update:model-value="cabinet.inside.mounting = $event"
          />

          <!-- On the doors and behind a false front. -->
          <SubHead>On the doors</SubHead>
          <v-switch :model-value="!!cabinet.inside.doorRacks" label="Racks on the inside of the doors" color="primary" density="compact" hide-details data-test="racks-on" @update:model-value="setDoorRacks(!!$event)" />
          <v-row v-if="cabinet.inside.doorRacks" density="compact">
            <v-col cols="12"><v-select v-model="cabinet.inside.doorRacks.doors" label="Its doors" :items="RACK_DOORS" hide-details density="compact" data-test="racks-doors" /></v-col>
            <v-col cols="6"><v-select v-model="cabinet.inside.doorRacks.count" label="Racks on each door" :items="[1, 2, 3]" hide-details density="compact" data-test="racks-count" /></v-col>
            <v-col cols="6"><LengthField v-model="cabinet.inside.doorRacks.depth" label="How deep" /></v-col>
            <v-col v-if="underSink?.doorRacks?.weight.heavy" cols="12">
              <v-alert type="warning" variant="tonal" density="compact" data-test="racks-weight">{{ underSink.doorRacks.weight.words }}</v-alert>
            </v-col>
          </v-row>
          <template v-if="existing || cabinet.inside.tiltOut">
            <v-switch :model-value="!!cabinet.inside.tiltOut" label="A tilt-out tray behind the false front" color="primary" density="compact" hide-details data-test="tilt-on" @update:model-value="setTiltOut(!!$event)" />
            <v-row v-if="cabinet.inside.tiltOut" density="compact">
              <v-col cols="4"><LengthField v-model="cabinet.inside.tiltOut.width" label="Opening, wide" /></v-col>
              <v-col cols="4"><LengthField v-model="cabinet.inside.tiltOut.height" label="Opening, high" /></v-col>
              <v-col cols="4"><LengthField v-model="cabinet.inside.tiltOut.depth" label="Tray, deep" /></v-col>
            </v-row>
          </template>
          <div v-else class="text-body-2 text-medium-emphasis mt-2" data-test="tilt-on-front">A tilt-out tray goes behind a false front: make the drawer over the doors one that tips out, under Fronts.</div>

          <!-- What needs a look, and what to print. -->
          <v-alert v-if="sinkError" type="warning" variant="tonal" density="compact" class="mt-4" data-test="sink-error">{{ sinkError }}</v-alert>
          <v-alert v-for="way in wayIn.filter((w) => w.how === 'no')" :key="way.what" type="warning" variant="tonal" density="compact" class="mt-2" data-test="way-in-no">{{ way.words }}</v-alert>
          <v-alert v-if="cabinet.adjustableShelves > 0" type="warning" variant="tonal" density="compact" class="mt-2" data-test="sink-shelves">
            The adjustable shelves run the full depth, into what is in the way: set them to 0, or notch them by hand.
          </v-alert>
          <div v-if="underSink?.templates.length" class="mt-4">
            <v-btn size="small" variant="tonal" color="primary" data-test="print-templates" @click="printTemplates">Print the paper templates</v-btn>
          </div>

          <HelpText>
            <p>
              What is in the way is measured as blocks: the trap and the drain, the bowl, the supply valves, a disposal. They are drawn grey
              and never cut; what is made is cut round them. "From the left side" is from the inside of the cabinet's left side to the block's
              left edge, "Clear under it" from the cabinet's floor to its lowest point.<template v-if="cabinet.sink"> The sink's own bowl is in
              the way too, from its sizes: a block with no height of its own stops under it.</template>
            </p>
            <p v-if="underSink?.trays.length" data-test="sink-words">
              <template v-for="tray in underSink.trays" :key="tray.name">
                {{ tray.name }}: {{ L(tray.width) }} wide × {{ L(tray.length) }} deep × {{ L(tray.height) }} high outside ({{ L(tray.inside.width) }} × {{ L(tray.inside.length) }} inside)<template v-if="tray.round">, cut round {{ tray.round }}</template
                ><template v-if="tray.stopsAt">, made short to stop in front of {{ tray.stopsAt }}</template>.
              </template>
              <template v-if="underSink.mounting === 'strips'">
                Drawer boxes with no front, on {{ underSink.slides ? underSink.slides.lengths.map((u) => L(u.length.mm)).join(' and ') : '' }} slides hung on build-out strips on the case sides
                ({{ underSink.buildOutLayers === 1 ? 'one layer' : `${underSink.buildOutLayers} layers` }} of the case material), clear of the hinges.
              </template>
              <template v-else>
                Drawer boxes with no front, on {{ underSink.slides ? underSink.slides.lengths.map((u) => L(u.length.mm)).join(' and ') : '' }} slides<template v-if="underSink.frame">
                  hung on a frame {{ L(underSink.frame.width) }} wide × {{ L(underSink.frame.depth) }} deep × {{ L(underSink.frame.height) }} high: two standards on two rails, squared on the
                  bench and screwed to the cabinet's floor. It touches neither side and goes in through the door opening; the trays roll over its rails<template v-if="underSink.trays.length > 1"
                    >{{ underSink.frame.tie ? ', and a tie at the back keeps its standards upright' : '. There is no room for a tie at the back: fasten the top of each standard to the cabinet\'s side with a block' }}</template
                  >.</template
                ><template v-else>{{ cabinet.inside.organizers.some((o) => o.kind === 'sideTrays') ? ' hung on standards screwed to the shelf.' : ', each on a frame of its own.' }}</template>
              </template>
              <router-link to="/jigs?item=tray-bins" class="text-primary" data-test="tray-bins-link">Printed bins</router-link> and
              <router-link to="/jigs?item=tray-divider" class="text-primary">a printed divider</router-link> sized to a tray's inside are on the jigs page.
            </p>
            <p v-if="wayIn.some((w) => w.how !== 'no')" data-test="way-in">
              Through the door opening{{ existing ? ', round what is in the way' : '' }}: <template v-for="way in wayIn.filter((w) => w.how !== 'no')" :key="way.what">{{ way.words }} </template>
            </p>
            <p v-if="underSink?.doorRacks" data-test="racks-words">
              Each rack is {{ L(underSink.doorRacks.racks[0]!.width) }} wide × {{ L(underSink.doorRacks.racks[0]!.depth) }} deep × {{ L(underSink.doorRacks.racks[0]!.height) }} high, narrower than
              its door so that it swings clear. Shut, the racks stand {{ L(underSink.doorRacks.reach) }} into the cabinet: the trays and shelves start behind them.
              <template v-if="!underSink.doorRacks.weight.heavy">{{ underSink.doorRacks.weight.words }}</template>
            </p>
            <p v-if="cabinet.inside.tiltOut" data-test="tilt-words">
              Measure the opening behind the false front over the doors. Only the tray is made<template v-if="underSink?.tiltOut"
                >, {{ L(underSink.tiltOut.width) }} wide × {{ L(underSink.tiltOut.height) }} high × {{ L(underSink.tiltOut.depth) }} deep</template
              >: the false front is the cabinet's own, taken off and hung on a pair of tilt-out hinges, which are bought.
            </p>
            <p v-if="underSink?.templates.length" data-test="sink-templates">
              The paper templates: {{ underSink.templates.length === 1 ? 'the notch' : `the ${underSink.templates.length} notches` }} at real size, to cut out with scissors and hold against the plumbing before any plywood is cut.
            </p>
            <p v-if="underSink?.jigHeights.length" data-test="sink-jigs">
              A pair of printed stands holds each build-out strip level while it is screwed on ({{ underSink.jigHeights.map((h) => L(h)).join(' and ') }} high): the file is with Cut's 3D prints.
            </p>
          </HelpText>
        </template>
      </div>

      <!-- The fronts: a set of doors or a drawer at a time, the one in hand on the rail's second level. -->
      <div v-show="nav.current.id === 'fronts'" data-test="topic-fronts">
      <v-alert v-for="clash in clashes" :key="clash" type="warning" variant="tonal" density="compact" class="mb-4" data-test="front-clash">
          {{ clash }}: {{ framed ? (drawerRowCount > 1 ? 'reduce their overlays or widen the rails' : 'reduce their overlays or widen the rail between the openings') : inset ? 'widen the gap' : 'widen the front gap' }}.
        </v-alert>
      <template v-for="{ opening, doors } in doorRows" :key="opening.id">
        <div v-show="nav.currentSub?.id === (doors?.id ?? `none:${opening.id}`)">
        <DoorSetCards v-if="doors" :key="doors.id" shared :design="doors" :opening="asOpening(opening, existing?.doors)" :fixed="opening.fixedOverlay" :inset="opening.inset" :handle-end="doorHandleEnd(cabinet.form, doors.name)" />
        <template v-else>
          <div class="text-body-2 text-medium-emphasis mb-3">No doors on the {{ opening.name.toLowerCase() }} yet.</div>
          <v-btn color="primary" variant="tonal" @click="addDoors(opening)">Add a pair of doors</v-btn>
        </template>
        </div>
      </template>
      <template v-for="{ opening, drawer } in drawerRows" :key="opening.id">
        <div v-show="nav.currentSub?.id === (drawer?.id ?? `none:${opening.id}`)">
        <DrawerCards v-if="drawer" :key="drawer.id" shared :design="drawer" :opening="asOpening(opening)" :fixed="opening.fixedOverlay" :inset="opening.inset" :front-only="!!existing" :over-doors="!!opening.overDoors" :problems="trayProblems.filter((p) => p.drawerId === drawer.id).map((p) => p.words)" />
        <template v-else>
          <div class="text-body-2 text-medium-emphasis mb-3">No front on the {{ opening.name.toLowerCase() }} yet.</div>
          <v-btn color="primary" variant="tonal" @click="addDrawer(opening)">Add a drawer front</v-btn>
        </template>
        </div>
      </template>
      </div>

    <template #last><v-btn to="/plan" color="primary" variant="flat">Next: Plan</v-btn></template>

    <template #picture>
      <v-card class="pa-5">
        <PanelTitle icon="view">
          3D view
          <template #actions>
            <ViewLookSelect />
            <v-btn-toggle v-if="canShowAll" v-model="viewScope" mandatory density="compact" variant="outlined" divided data-test="view-scope">
              <v-btn value="cabinet" title="This cabinet alone">{{ run ? 'Cabinet' : 'This cabinet' }}</v-btn>
              <v-btn v-if="run" value="run" data-test="view-scope-run" :title="island ? 'Its island, by itself' : 'Its run, by itself'">{{ island ? 'Island' : 'Run' }}</v-btn>
              <v-btn value="all" title="The whole project">{{ run ? (room ? 'Room' : 'All') : room ? 'The room' : `All ${cabinets.length}` }}</v-btn>
            </v-btn-toggle>
          </template>
        </PanelTitle>
        <v-alert v-if="derived.error" type="error" variant="tonal">{{ derived.error }}</v-alert>
        <div>
          <CabinetAssemblyView
            v-if="!derived.error"
            :parts="pocketLooked(runShown ? runParts : wholeProject ? projectParts : drawnParts)"
            :cabinets="runShown ? runPlaces : wholeProject ? projectPlaces : undefined"
            :room="wholeProject && !runShown ? roomDrawn : undefined"
            :frame-key="runShown ? `run:${run?.id}` : wholeProject ? 'all' : cabinet.id"
            :pose="viewPose"
            :hardware="store.shop.hardware"
            :finish="finishesOf(store.project!, store.jobShop)"
            :faces="faceFinishes(store.project!, wholeProject ? projectParts : drawnParts)"
            :slides="[...slideMountsOf(store.project!, store.jobShop), ...traySlideMounts(cabinetsOf(store.project!), store.jobShop)]"
            :casters="castersDrawn"
            :appliances="applianceLooks"
            :looks="materialLooks"
            :start-explode="startExplode"
            :start-open="startOpen"
            :start-drawer="startDrawer"
            :start-leaf="startLeaf"
            :start-full="startFull"
            :start-look="startLook"
            look-elsewhere
            :material-names="materialNames"
            :cut-by="cutBy"
            :selected-part="pickedPart"
            :selected-cabinet="wholeProject ? cabinet.id : undefined"
            @part="pickedInView"
            @pick="selectId"
            @picture="keepPicture"
          />
          <HelpText label="About this view">
            <template v-if="runShown">The run this cabinet is in (or its island), by itself with its top: the rest of the project and the room are left out. Click a cabinet of it to work on it.</template>
            <template v-else-if="wholeProject">
              Every cabinet of the project, once, standing in a row in the order of the list; click one to work on it. A cabinet
              with a quantity is shown once. The cabinets of a run stand as built, side by side with their fillers, and a wall
              cabinet hangs at its height off the floor.
            </template>
            Drag to turn, scroll to zoom; the button in the corner fills the page with the view. The sliders open the doors, pull the drawers out and pull the parts apart. The doors
            hang on their hinges: each is drawn with its screws, its cup in the door and its plate and arm on the case, and the door moves as a cup
            hinge carries it, out and away<template v-if="inset">; an inset door comes forward out of its opening and stands in it when open</template>. The
            hinge's links are worked out from its overlay and opening angle, not taken from its maker's drawing (tune me), so it shows how a door
            clears, not the last millimetre. A drawer comes out by the length of its box, not the slide's exact travel. Every part is a real solid at its derived size, set where it goes in the cabinet.
            <template v-if="hasDoorRow">Adjustable shelves are drawn evenly spaced in the door opening.</template>
            The look is chosen in this card's header: Realistic is a lit, textured picture; Basic a drawing in flat colours, where the faint streaks on a part run the way its grain does (plywood and solid wood; MDF has none); See-through shows what is inside; the last two colour each part by its material or by where it is cut.
            Click a part to pick it out (in the whole project, first the cabinet, then the part); click the background to let it go. The button under the full-page one puts the view back as it started.
            The holes for the hardware are inside the case: turn the view or pull the parts apart to see them.
            <template v-if="framed || anyScrews">Pocket holes are drawn roughly: a 15° pocket and its pilot, where each screw goes.</template>
          </HelpText>
        </div>
        <div class="mt-3" data-test="design-parts">
          <div class="d-flex align-center">
            <button type="button" class="parts-toggle" :aria-expanded="partsOpen" data-test="parts-tab" @click="partsOpen = !partsOpen">
              <span class="text-subtitle-2">Parts ({{ allParts.length }})</span>
              <v-icon :icon="mdiChevronDown" size="18" class="chevron" :class="{ turned: partsOpen }" />
            </button>
            <v-spacer />
            <v-btn v-if="partsOpen && allParts.length" variant="text" size="small" @click="allOpen = !allOpen">{{ allOpen ? 'Close all' : 'Open all' }}</v-btn>
          </div>
          <div v-show="partsOpen" ref="partsTable" class="parts-box">
            <v-table density="compact" class="mt-1">
              <thead>
                <tr><th>Part</th><th>Material</th><th>Width × height × thickness</th><th /></tr>
              </thead>
              <tbody>
                <template v-for="part in allParts" :key="part.id">
                  <tr class="part-row" :class="{ picked: part.id === pickedPart }" :data-part="part.id" @click="pickPart(part.id)">
                    <td class="font-weight-bold">{{ part.name }}</td>
                    <td class="text-medium-emphasis">{{ materialName(part.materialId) }}</td>
                    <td>{{ L(part.size.width) }} × {{ L(part.size.height) }} × {{ store.cncLength(part.size.thickness) }}</td>
                    <td class="text-right">
                      <v-icon v-if="notes(part).length" :icon="mdiChevronDown" size="18" class="chevron" :class="{ turned: allOpen || part.id === pickedPart }" />
                    </td>
                  </tr>
                  <tr v-if="notes(part).length" v-show="allOpen || part.id === pickedPart" class="notes-row">
                    <td colspan="4" class="py-2">
                      <v-chip v-for="note in notes(part)" :key="note" size="small" class="mr-1 mb-1">{{ note }}</v-chip>
                    </td>
                  </tr>
                </template>
              </tbody>
            </v-table>
            <div v-if="!allParts.length" class="text-body-2 text-medium-emphasis">No parts: see the message above.</div>
            <div v-else class="text-caption text-medium-emphasis mt-2">Click a part, here or in the view, to pick it out: it is drawn alone in orange, and its row says what is cut into it and which way its grain runs.</div>
          </div>
        </div>
      </v-card>
    </template>
  </TopicShell>
</template>

<style scoped>
.room-plan {
  width: 100%;
  max-height: 260px;
}
.room-wall {
  fill: rgba(var(--v-theme-on-surface), 0.04);
  stroke: rgba(var(--v-theme-on-surface), 0.5);
  stroke-width: 12;
}
/* A wall that is not there: the outline broken up. */
.room-open {
  stroke: rgb(var(--v-theme-surface));
  stroke-width: 16;
  stroke-dasharray: 60 50;
}
.room-label {
  fill: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 140px;
}
.room-group {
  cursor: pointer;
}
.room-group polygon {
  fill: rgba(var(--v-theme-primary), 0.25);
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 8;
}
.room-group.wall polygon {
  fill: none;
  stroke-dasharray: 30 18;
}
.room-group.on polygon {
  fill: rgba(var(--v-theme-primary), 0.55);
}
.room-appliance polygon {
  fill: rgba(var(--v-theme-on-surface), 0.22);
  stroke: rgba(var(--v-theme-on-surface), 0.6);
  stroke-width: 8;
}
.run-name {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.row-height {
  max-width: 130px;
}
/* Wide enough for its label; on a phone it goes under the opening's name (the row wraps). */
.row-split {
  flex: 0 0 170px;
}
.opening-name {
  min-width: 130px;
}
.part-row {
  cursor: pointer;
}
.part-row.picked td {
  background: rgba(255, 167, 38, 0.16);
}
/* The list scrolls in its own box, so the view above it stays in sight. */
/* The Inside topic's lists: each block or thing made one line that opens to its fields. */
.item {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.item-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  cursor: pointer;
}
.item-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-fields {
  padding: 4px 0 12px 26px;
}
.parts-box {
  max-height: 280px;
  overflow-y: auto;
}
.parts-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.chevron {
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
/* On wide screens the 3D view stays in sight while the inputs scroll. */
.cabinet-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  margin-left: auto;
}
.phone-switch {
  display: none;
}
@media (max-width: 600px) {
  .phone-switch {
    display: inline-flex;
  }
  .phone-fields :deep(.topic-picture-col),
  .phone-view :deep(.topic-rail-col),
  .phone-view :deep(.topic-body-col) {
    display: none;
  }
}
</style>
