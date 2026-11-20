<script setup lang="ts">
/**
 * Setup (milestone 5): what the project's cabinets and fronts share, with the preset's answers already chosen.
 * Three panes: the topics, the topic in hand, the picture (`topics` below),
 * on the shell the other pages share (`TopicShell.vue`). It edits the project's stored values, the same ones Design's cabinets and
 * fronts follow unless they have their own. It never holds a cabinet's own values.
 */
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CabinetSettingsFields from '@/components/CabinetSettingsFields.vue';
import ChoiceTiles from '@/components/ChoiceTiles.vue';
import { mark, presetMarks } from '@/components/presetMarks';
import FinishFields from '@/components/FinishFields.vue';
import FrontSettingsFields from '@/components/FrontSettingsFields.vue';
import HelpText from '@/components/HelpText.vue';
import CabinetAssemblyView from '@/components/CabinetAssemblyView.vue';
import { projectScene } from '@/design/scene';
import RoomLookFields from '@/components/RoomLookFields.vue';
import LengthField from '@/components/LengthField.vue';
import MaterialSelect from '@/components/MaterialSelect.vue';
import PageHeader from '@/components/PageHeader.vue';
import PanelTitle from '@/components/PanelTitle.vue';
import ProjectMaterials from '@/components/ProjectMaterials.vue';
import SubHead from '@/components/SubHead.vue';
import TopicShell from '@/components/TopicShell.vue';
import TorsionFields from '@/components/TorsionFields.vue';
import { type Topic, useTopics } from '@/components/topics';
import { frameTopFollows, mountedDesigns, starterOwnTop, lightTopTable, torsionMaterialIds, torsionSettingsOf, torsionStartOf, TORSION_STARTS, addMaterialFromCatalog, piecesOf, isFoot, isHandle, stainedWithoutGrain, backToPreset, presetDiffs, type PresetTopic, presetTopic, resolvePreset, BOTTOM_KINDS, type BottomKind, bottomTile, constructionTile, lookOf, PATTERN_LOOKS, CASTER_UNDER_CHOICES, casterUnderChoice, setCasterUnderChoice, bottomKindOf, isCaster, setPosts, setBottomKind, STANDARD_SIZES, starterRoom, starterTopSettings, applyPreset, cabinetsOf, materialIdsOf, materialTitle, overwritePreset, savePreset, setupSummary, standardStartSizes } from '@/design';
import type { CabinetForm, ConstructionStyle, DesignedCabinetContext, Length, TopSettings } from '@/model';
import { activeMachine, largestParts, limitWords, partLimit, stockOnHand } from '@/plan';
import { setupExample } from '@/samples/cabinet';
import { presetsOf } from '@/samples/presets';
import { SQUARE_2X2_ID, STARTER_MATERIALS } from '@/libraries/materials';
import { shapeExample, starterById } from '@/samples/starters';
import { useAppStore } from '@/stores/app';
import FingerSizeFields from '@/components/FingerSizeFields.vue';
import { LOW_POCKET } from '@/geometry/pocketHole';
import type { BoxCornerJoint, PocketCoverWhere, PocketHoleMethod } from '@/model';
import { lowAngleOf, pocketHoleMethod } from '@/plan/parts';
import { pocketHoleMethodLabel } from '@/ui/format';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const L = computed(() => store.sizeLength);

// #/setup?preset=<id> starts a new project from that preset: for looking at the screen from a URL.
const asked = String(route.query.preset ?? '');
if (asked && store.ready) {
  const preset = presetsOf(store.shop).find((p) => p.id === asked);
  if (preset) {
    store.newProjectFrom(preset);
    void router.replace({ query: {} });
  }
}

const project = computed(() => store.project!);
const cabinets = computed(() => (project.value.context.kind === 'designedCabinet' ? (project.value.context as DesignedCabinetContext) : undefined));
/** The cabinets that are already there: they are measured, and only what is made for them follows these answers. */
const thereCount = computed(() => cabinetsOf(project.value).filter((c) => c.existing).length);
const presets = computed(() => presetsOf(store.shop));
const presetId = computed(() => presets.value.find((p) => p.name === project.value.preset)?.id ?? null);
const fellBack = ref<string[]>([]);
const confirming = ref<string | null>(null);
function choosePreset(id: string) {
  confirming.value = id;
}
function applyChosen() {
  const preset = presets.value.find((p) => p.id === confirming.value);
  confirming.value = null;
  if (preset) fellBack.value = applyPreset(project.value, preset, store.shop);
}

const settings = computed(() => cabinets.value?.settings);
const fronts = computed(() => cabinets.value?.fronts);
/** A toe kick, a flat bottom or casters (milestone 9). */
const bottom = computed({
  get: () => (settings.value ? bottomKindOf(settings.value.toeKick) : 'toeKick'),
  set: (kind: BottomKind) => {
    if (!settings.value) return;
    setBottomKind(settings.value.toeKick, kind, store.shop.hardware);
    // A leg frame's square stock is one of the project's materials.
    if (settings.value.toeKick.legs) addMaterialFromCatalog(project.value, store.shop.materialCatalog, settings.value.toeKick.legs.materialId);
  },
});
const casterChoices = computed(() => store.shop.hardware.filter((h) => isCaster(h) && !h.foot).map((c) => ({ title: c.name, value: c.id })));
/** Legs in the middle of a long case: on, or left out. */
function setMiddleLegs(on: boolean) {
  const legs = settings.value?.toeKick.legs;
  if (!legs) return;
  if (on) legs.middle = true;
  else delete legs.middle;
}
/** The legs run up the corners of the case, as posts: on, or left out. */
function setCornerPosts(on: boolean) {
  if (settings.value) setPosts(settings.value, on);
}
/** The square stock a leg frame's legs may be: the project's, and what the catalog has more. */
const legStockChoices = computed(() => {
  const own = store.materials.filter((m) => m.section === 'square');
  // The catalog's, and what comes with the app where a shop profile saved before square stock has none.
  const more = [...store.shop.materialCatalog, ...STARTER_MATERIALS].filter((m) => m.section === 'square' && !own.some((o) => o.id === m.id));
  return [...own, ...more.filter((m, i) => more.findIndex((x) => x.id === m.id) === i)].map((m) => ({ title: materialTitle(m, L.value), value: m.id }));
});
function setLegStock(id: string) {
  if (!settings.value?.toeKick.legs) return;
  addMaterialFromCatalog(project.value, store.shop.materialCatalog, id);
  settings.value.toeKick.legs.materialId = id;
}
/** Bought feet stand where casters would. */
const footChoices = computed(() => store.shop.hardware.filter(isFoot).map((c) => ({ title: c.name, value: c.id })));
/** Each with its tile: the cabinet from the front, and its front corner from above (`constructionTile`). */
const STYLES: { title: string; value: ConstructionStyle; note: string }[] = [
  { title: 'Face frame', value: 'faceFrame', note: 'A frame on the front of the case; the doors lie over it' },
  { title: 'Frameless', value: 'frameless', note: "The doors cover the case's edges" },
  { title: 'Inset', value: 'shop', note: 'The doors and drawers stand between the sides, flush with the case' },
];
const styleTiles = STYLES.map((s) => ({ ...s, drawing: constructionTile(s.value) }));
/** A bottom's name and what its brackets say, as a tile's two lines. */
const bottomTiles = BOTTOM_KINDS.map((k) => {
  const [title, note] = k.title.replace(')', '').split(' (');
  return { value: k.value, title: title!, note: note && note[0]!.toUpperCase() + note.slice(1), drawing: bottomTile(k.value) };
});

/** Question 10: how the project's tops are made. Seen here, the starter values become the project's own. */
const tops = computed(() => {
  const c = cabinets.value;
  if (c && !c.tops) c.tops = starterTopSettings();
  return c?.tops;
});
const TOP_KINDS = [
  { title: 'Made here from a sheet or a slab', value: 'made' },
  { title: 'Bought laminate, cut to length here', value: 'bought' },
  { title: 'Measured for a bought top (stone): nothing cut', value: 'measured' },
  { title: 'A torsion box made here: two skins on a grid of ribs', value: 'torsion' },
];
/** The kind of top; a torsion box starts as the light top's, its materials brought into the project. */
function setTopKind(kind: TopSettings['kind']) {
  const t = tops.value;
  if (!t) return;
  t.kind = kind;
  if (kind !== 'torsion') return;
  t.torsion ??= lightTopTable();
  for (const id of torsionMaterialIds(t.torsion)) addMaterialFromCatalog(project.value, store.shop.materialCatalog, id);
}
const EDGES = [
  { title: 'A solid wood strip', value: 'strip' },
  { title: 'Edge banding', value: 'banding' },
  { title: 'Left as it is', value: 'none' },
];
const boughtTops = computed(() => store.shop.hardware.filter((h) => h.kind === 'boughtTop').map((h) => ({ title: h.name, value: h.id })));

/** Question 7: the start sizes. */
/**
 * The kinds of cabinet whose start sizes are asked: the ones the project has, since the sizes of a kind it does
 * not make do not matter. The others are a click away, for the cabinet about to be added; a project with no
 * cabinet yet is asked all three.
 */
const moreSizes = ref(false);
const formsInUse = computed(() => new Set(cabinetsOf(project.value).map((c) => c.form)));
const shownForms = computed(() => (moreSizes.value || formsInUse.value.size === 0 ? FORMS : FORMS.filter((f) => formsInUse.value.has(f.form))));
const hiddenForms = computed(() => FORMS.filter((f) => !shownForms.value.includes(f)));
/**
 * What the project has, for which topics it is asked (a project is not asked about what it is
 * not making). A project with nothing in it yet is asked everything: anything could be next.
 */
const empty = computed(() => piecesOf(project.value).length === 0);
const hung = computed(() => {
  try {
    return mountedDesigns(project.value, store.materials);
  } catch {
    // A project that cannot be worked out is asked everything.
    return undefined;
  }
});
const hasDoors = computed(() => empty.value || !hung.value || hung.value.some((d) => d.template === 'doorSet'));
const hasDrawers = computed(() => empty.value || !hung.value || hung.value.some((d) => d.template === 'drawer'));
const hasCases = computed(() => empty.value || cabinetCount.value > 0);
/** Whether Sizes is asked at all: not of furniture, whose pieces are sized one by one, nor of a project with no cabinet among its pieces (tables only). */
const asksSizes = computed(() => !furniture.value && (cabinetCount.value > 0 || piecesOf(project.value).length === 0));
/** A start size's two values, each with its field's label and the list of usual sizes it picks from. */
const SIZE_DIMENSIONS = [
  { key: 'height', label: 'Height', list: 'heights' },
  { key: 'depth', label: 'Depth (the case)', list: 'depths' },
] as const;
/** What a usual size is for: the words in brackets after it, if it has any. */
const sizeNote = (title: string) => /\((.*)\)/.exec(title)?.[1] ?? '';
/** The same of the size in use, where it is one of the usual ones; a size typed in is said to be its own. */
function chosenNote(form: (typeof FORMS)[number]['form'], d: (typeof SIZE_DIMENSIONS)[number]): string {
  const now = sizes.value?.[form][d.key];
  if (!now) return '';
  const usual = STANDARD_SIZES[form][d.list].find((c) => same(c.value, now));
  if (!usual) return 'A size of your own.';
  const note = sizeNote(usual.title);
  return note ? note[0]!.toUpperCase() + note.slice(1) + '.' : 'A usual size.';
}
const FORMS: { form: CabinetForm; title: string }[] = [
  { form: 'base', title: 'Base cabinets' },
  { form: 'wall', title: 'Wall cabinets' },
  { form: 'tall', title: 'Tall cabinets' },
];
const sizes = computed(() => {
  const c = cabinets.value;
  if (c && !c.sizes) c.sizes = standardStartSizes();
  return c?.sizes;
});
const setSize = (form: CabinetForm, key: 'height' | 'depth', value: Length | null) => {
  if (value && sizes.value) sizes.value[form][key] = value;
};
const same = (a: Length, b: Length) => Math.abs(a.mm - b.mm) < 0.01;

/**
 * An example cabinet built as the answers stand, beside them (not the project itself: a whole kitchen is too
 * much to look at to set a style). Under a top while the tops or the finish are in hand.
 * It is the thing the project was started as when that is one cabinet (a vanity, a bank of drawers: `shapeExample`).
 */
const scene = computed(() =>
  !store.project ? undefined : projectScene(shapeExample(setupExample(store.project, { top: ['tops', 'finish'].includes(current.value.id) }), store.project.starter, store.shop), store.jobShop, store.shop.materialGroups),
);
/** The example's own door: the pattern's flat picture is drawn on a door of its size, so the two agree. */
const exampleDoor = computed(() => {
  const parts = scene.value && 'parts' in scene.value ? scene.value.parts : [];
  const door = parts.find((p) => !p.role && /\/door/.test(p.id));
  return door ? { width: door.size.width, height: door.size.height } : undefined;
});

/**
 * How the example is seen for each topic: the fronts face on, the bottom from low down, the case pulled
 * apart to show its joints, the tops from above. Elsewhere, the usual view.
 */
const POSES: Partial<Record<TopicId, { from: [number, number, number]; explode?: number }>> = {
  case: { from: [0.55, 0.3, 0.8], explode: 35 },
  fronts: { from: [0.16, 0.1, 1] },
  bottom: { from: [0.6, -0.04, 0.8] },
  tops: { from: [0.5, 0.55, 0.7] },
};
const USUAL_POSE = { from: [0.55, 0.3, 0.8] as [number, number, number] };
const pose = computed(() => POSES[current.value.id as TopicId] ?? USUAL_POSE);

/** Question 8: the machine, the stock on hand, and what a size's sides come to. */
const machine = computed(() => activeMachine(store.jobShop));
/** The machine the project is cut on: the project's own choice, kept when the shop's machine in use changes. */
const machineId = computed({
  get: () => machine.value.id,
  set: (id: string) => (project.value.machineId = id),
});
const largest = computed(() => largestParts(machine.value));
const stock = computed(() => stockOnHand(project.value.plan, machine.value));
const ownStock = computed(() => !!project.value.plan.blank.stock);
function setStock(key: 'width' | 'height', value: Length | null) {
  const blank = project.value.plan.blank;
  if (!value) return;
  blank.stock ??= { width: { ...machine.value.defaultSheet.x }, height: { ...machine.value.defaultSheet.y } };
  blank.stock[key] = value;
}
/**
 * What the CNC does with the sides of a cabinet this tall and deep: Plan's own rules, said in a few words. Only the
 * machine counts here, never the sheet on hand (the material is bought as it is needed).
 */
const sideNote = (height: Length, depth: Length) => {
  const limit = partLimit({ width: depth.mm, height: height.mm }, machine.value, { width: Infinity, height: Infinity });
  return limit === 'fits' ? '' : limitWords(limit, 'sides');
};

/** Save as a preset: under a new name, or over the user's preset the project started from. */
const saving = ref(false);
const presetName = ref('');
const ownPreset = computed(() => store.shop.presets.find((p) => p.name === project.value.preset));
function save() {
  const preset = savePreset(store.shop, project.value, presetName.value);
  project.value.preset = preset.name;
  saving.value = false;
}
const overwrite = () => ownPreset.value && overwritePreset(store.shop, ownPreset.value.id, project.value);

const usedMaterials = computed(() => materialIdsOf(project.value, store.shop.hardware));
const status = computed(() => setupSummary(project.value, store.shop.hardware, L.value));
const cabinetCount = computed(() => cabinetsOf(project.value).length);
const anyWall = computed(() => cabinetsOf(project.value).some((c) => c.form === 'wall'));
/**
 * A project of furniture: one started as a piece of furniture. Its Setup says "Tops" and
 * "Base" where a kitchen's says "Countertops" and "Bottom".
 */
const furniture = computed(() => starterById(project.value.starter)?.group === 'furniture');
/** Whether Setup asks what a new table and a new top start with: where the project is furniture, or has a table or a top of a piece's own. */
const furnitureAnswers = computed(() => furniture.value || piecesOf(project.value).some((p) => p.kind === 'frame' || !!p.top?.own));
/** Those answers. Seen here, the starter values become the project's own, as the countertops' do. */
const newPieces = computed(() => {
  const c = cabinets.value;
  if (!c || !furnitureAnswers.value) return undefined;
  if (!c.furniture?.top || !c.furniture.legMaterialId) c.furniture = { legMaterialId: c.furniture?.legMaterialId ?? SQUARE_2X2_ID, top: c.furniture?.top ?? starterOwnTop() };
  return c.furniture as { legMaterialId: string; top: NonNullable<NonNullable<typeof c.furniture>['top']> };
});
const OWN_TOP_EDGES = [
  { title: 'A solid wood strip', value: 'strip' },
  { title: 'Edge banding', value: 'banding' },
  { title: 'Rounded over', value: 'roundover' },
  { title: 'Chamfered', value: 'chamfer' },
  { title: 'Left square', value: 'none' },
];
function setNewLegStock(id: string) {
  if (!newPieces.value) return;
  addMaterialFromCatalog(project.value, store.shop.materialCatalog, id);
  newPieces.value.legMaterialId = id;
}

/**
 * Setup follows the starter: a topic with nothing to say is left out. No room for
 * one thing started on its own (a vanity) until it has one, which Design's Room gives; no countertops where
 * nothing stands on the floor (a wall cabinet).
 */
const oneThing = computed(() => !!starterById(project.value.starter) && piecesOf(project.value).length === 1 && !cabinets.value?.room);
/** Whether the project can have a countertop: it has a cabinet that stands on the floor, or nothing yet. */
const countertops = computed(() => empty.value || piecesOf(project.value).some((p) => p.kind === 'case' && p.form !== 'wall'));
/**
 * Whether a top of a piece's own follows Setup's tops. A table's top is made as Setup says (a slab of Setup's
 * material, or Setup's torsion box) unless its Design makes it its own; a case's own top is a slab of Setup's
 * material unless it names one. A top that says everything itself takes nothing from Setup.
 */
const ownTopFollows = computed(() =>
  piecesOf(project.value).some((p) => {
    if (p.kind === 'frame') return frameTopFollows(p) || (!p.top.torsion && !p.top.materialId);
    const own = p.top?.own;
    return !!own && !own.torsion && !own.materialId;
  }),
);
/** The tops topic is asked where it says something: of countertops, or of a top that follows it. */
const asksTops = computed(() => countertops.value || ownTopFollows.value);
/** With no cabinet on the floor there is no countertop: a top is a slab or a torsion box, never bought or measured for. */
const TABLE_TOP_KINDS: { title: string; value: TopSettings['kind'] }[] = [
  { title: 'A slab: one panel, with its edge', value: 'made' },
  { title: 'A torsion box: two skins on a grid of ribs', value: 'torsion' },
];
/** Setup's Joints: the drawer boxes' corners, and how the job's pocket holes are made (a choice Plan shows too). */
const BOX_CORNERS: { title: string; value: BoxCornerJoint }[] = [
  { title: 'Rabbets in the sides', value: 'rabbet' },
  { title: 'Pocket screws', value: 'pocketScrews' },
  { title: 'Finger joints (tabs and slots, cut on the CNC)', value: 'tabs' },
];
const POCKET_METHODS: PocketHoleMethod[] = ['kregJig', 'cncAssisted', 'lowAngle3', 'lowAngle6'];
const POCKET_COVERS: { title: string; value: PocketCoverWhere }[] = [
  { title: 'Where it shows from outside', value: 'outside' },
  { title: 'Inside a case: seen when a door is opened', value: 'behindDoor' },
  { title: 'Inside a drawer box: seen when the drawer is opened', value: 'inDrawer' },
  { title: 'Every pocket, seen or not', value: 'all' },
];
const pocketMethod = computed(() => pocketHoleMethod(project.value.plan));
const pocketLow = computed(() => lowAngleOf(pocketMethod.value));
function setPocketMethod(method: PocketHoleMethod) {
  if (method === 'kregJig') delete project.value.plan.pocketHoles;
  else project.value.plan.pocketHoles = method;
}
const pocketSeat = computed({
  get: (): Length => project.value.plan.pocketSeat ?? { mm: LOW_POCKET.seat, unit: 'in' },
  set: (value: Length) => {
    if (Math.abs(value.mm - LOW_POCKET.seat) < 0.01) delete project.value.plan.pocketSeat;
    else project.value.plan.pocketSeat = value;
  },
});
const pocketCovers = computed(() => project.value.plan.pocketCovers ?? []);
function setPocketCover(where: PocketCoverWhere, on: boolean) {
  const next = pocketCovers.value.filter((w) => w !== where);
  if (on) next.push(where);
  if (next.length) project.value.plan.pocketCovers = next;
  else delete project.value.plan.pocketCovers;
}
/** Where the project's joints are pocket screws, in a line. */
const pocketUses = computed(() => {
  const s = settings.value;
  const uses = [
    ...(s && hasCases.value && s.joinery.case === 'pocketScrews' ? ['the case joints'] : []),
    ...(s && hasCases.value && s.construction === 'faceFrame' ? ['the face frames'] : []),
    ...(fronts.value && hasDrawers.value && fronts.value.drawers.cornerJoint === 'pocketScrews' ? ['the drawer boxes'] : []),
    ...(s && hasCases.value && s.toeKick.joint === 'pocketScrews' ? ['the toe kick board'] : []),
    ...(piecesOf(project.value).some((p) => p.kind === 'frame') ? ["a table's aprons"] : []),
  ];
  return uses.length ? `Pocket screws hold ${uses.join(', ')}; a stretcher, a nailer and a top's joint may take them too.` : 'None of the joints above is pocket screws; a stretcher, a nailer and a top\'s joint may still take them.';
});
/** The joints in a line: the cases', the drawer boxes', and how pocket holes are made. */
const jointWords = computed(() => {
  const s = settings.value;
  const names: Record<string, string> = { pocketScrews: 'pocket screws', dado: 'dados', throughScrews: 'screws through the sides', tabs: 'tabs and slots', rabbet: 'rabbets' };
  const said = [
    ...(s && hasCases.value ? [`Cases: ${names[s.joinery.case] ?? s.joinery.case}`] : []),
    ...(fronts.value && hasDrawers.value ? [`boxes: ${names[fronts.value.drawers.cornerJoint] ?? fronts.value.drawers.cornerJoint}`] : []),
    `pocket holes: ${pocketHoleMethodLabel(pocketMethod.value).replace(' (untested)', '')}`,
  ];
  return said.join('; ');
});
/**
 * The topics, in three columns, a thing and then a sub-thing picked and its details shown:
 * Setup is a list of topics on the left, each with its answer in a line; the one in hand in the middle,
 * its main choices first and its fine tuning under them; the picture on the right, always in view.
 * `#/setup?topic=fronts` opens one (and the old `fold=setup-details`, `fold=materials`).
 */
type TopicId = 'start' | 'construction' | 'case' | 'fronts' | 'bottom' | 'joints' | 'tops' | 'furniture' | 'finish' | 'sizes' | 'room' | 'stock' | 'materials';
const materialName = (id: string | undefined) => {
  const m = store.materials.find((x) => x.id === id);
  return m ? materialTitle(m, L.value) : 'none';
};
const frontWords = computed(() => {
  const f = fronts.value?.doors;
  if (!f) return '';
  // Drawers only: their fronts' style and material.
  const d = fronts.value!.drawers;
  if (!hasDoors.value && settings.value?.construction !== 'shop') return `${d.front.style.kind === 'shaker' ? 'Shaker' : 'Slab'} drawer fronts, ${materialName(d.front.materialId)}`;
  const style = settings.value?.construction === 'shop' && f.shop ? f.shop.style : f.style;
  const pattern = style.pattern ? `, ${PATTERN_LOOKS.find((l) => l.value === lookOf(style.pattern))?.title.toLowerCase()}` : '';
  return `${style.kind === 'shaker' ? 'Shaker' : 'Slab'}${pattern}, ${materialName(settings.value?.construction === 'shop' && f.shop ? f.shop.materialId : f.materialId)}`;
});
/**
 * What differs from the preset the project started from: a dot on each such field and on its topic, and
 * "Back to the preset's" a topic. A project on its own values, or whose preset is gone, has nothing to differ from.
 */
const startedFrom = computed(() => {
  const preset = presets.value.find((p) => p.name === project.value.preset);
  return preset && resolvePreset(preset, store.shop).preset;
});
const diffs = computed(() => (startedFrom.value ? presetDiffs(project.value, startedFrom.value) : []));
watchEffect(() => (presetMarks.value = diffs.value));
onUnmounted(() => (presetMarks.value = []));
/** How many values of a topic differ. */
const differing = (id: string) => diffs.value.filter((path) => presetTopic(path) === id).length;
const restore = () => startedFrom.value && differing(current.value.id) && backToPreset(project.value, startedFrom.value, current.value.id as PresetTopic);

/** The countertops in a line: how they are made, and of what when they are made here. */
const topWords = computed(() => {
  const t = cabinets.value?.tops;
  const kind = t?.kind ?? 'made';
  if (t && kind === 'torsion') {
    const box = torsionSettingsOf(t);
    return `Torsion box${torsionStartOf(box) ? `: ${TORSION_STARTS.find((x) => x.value === torsionStartOf(box))!.title}` : ''}, ${materialName(box.skins.topId)} skins`;
  }
  return kind === 'made' ? `Made here${t ? `, ${materialName(t.materialId)}` : ''}` : kind === 'bought' ? 'Bought laminate' : 'Measured for';
});
const topics = computed((): (Topic & { id: TopicId })[] => {
  const c = cabinets.value;
  const s = settings.value;
  const all: { id: TopicId; title: string; summary: string; words: string; show: boolean }[] = [
    { id: 'start', title: 'Start from', summary: project.value.preset ?? "The project's own values", words: 'The preset the answers start from. Choosing another replaces every answer here.', show: true },
    { id: 'construction', title: 'Construction', summary: STYLES.find((x) => x.value === s?.construction)?.title ?? '', words: 'How the pieces are built: with a face frame, frameless, or inset.', show: !!s && hasCases.value },
    { id: 'case', title: 'Case', summary: s ? `${materialName(s.materials.caseId)}; back ${materialName(s.materials.backId)}` : '', words: 'What the cases are made of, and the details of how they are built.', show: !!s },
    { id: 'fronts', title: 'Fronts', summary: frontWords.value, words: 'The doors and the drawers: their style, a pattern, their material, hinges, slides and handles.', show: !!s && !!fronts.value && (hasDoors.value || hasDrawers.value) },
    { id: 'bottom', title: furniture.value ? 'Base' : 'Bottom', summary: s?.toeKick.legs?.posts ? 'Corner posts' : (BOTTOM_KINDS.find((k) => k.value === bottom.value)?.title.split(' (')[0] ?? ''), words: 'What the pieces stand on: a toe kick, a plinth, a flat bottom, casters, feet or a frame of legs.', show: !!s && hasCases.value },
    // Every joint in one place, after the things that are joined: the cases, the drawer boxes, the toe kick board; and how pocket holes are made.
    { id: 'joints', title: 'Joints', summary: jointWords.value, words: 'How the parts are joined: the cases, their backs, the drawer boxes and the toe kick board, and how the pocket holes are made.', show: !!s && (hasCases.value || hasDrawers.value) },
    // Countertops are a topic of their own (they sat oddly with the room), before the finish, which has their colour.
    {
      id: 'tops',
      title: !countertops.value || furniture.value ? 'Tops' : 'Countertops',
      summary: countertops.value || tops.value?.kind === 'torsion' ? topWords.value : `A slab, ${materialName(tops.value?.materialId ?? '')}`,
      words: !countertops.value
        ? "How a table's top is made, unless its Design makes it its own: a slab or a torsion box, and what a new one starts with."
        : furniture.value
          ? 'What the tops are made of, and how a countertop is made where the project has one.'
          : 'How the countertops are made: here, bought laminate, measured for a stone top, or a torsion box.',
      show: !!c && asksTops.value,
    },
    // What a kitchen's style does not say: the legs' stock, and a furniture top's overhang and edge.
    {
      id: 'furniture',
      title: countertops.value ? 'Tables and tops' : 'Tables',
      summary: newPieces.value
        ? `${legStockChoices.value.find((x) => x.value === newPieces.value!.legMaterialId)?.title ?? 'Square stock'} legs${countertops.value ? `; a top ${L.value(newPieces.value.top?.overhang.front.mm ?? 0)} over the front` : ''}`
        : '',
      words: countertops.value ? "What a new table and a new top of a piece's own start with: the legs' stock, and the top's overhang and edge." : "What a new table's legs are cut from.",
      show: !!c && furnitureAnswers.value,
    },
    { id: 'finish', title: 'Finish', summary: 'Paint and stain colours', words: 'The colours the project is shown in, and listed with.', show: true },
    {
      id: 'sizes',
      title: 'Sizes',
      summary: sizes.value && shownForms.value[0] ? `${shownForms.value[0].title.split(' ')[0]} ${L.value(sizes.value[shownForms.value[0].form].height.mm)} high, ${L.value(sizes.value[shownForms.value[0].form].depth.mm)} deep` : '',
      words: 'The sizes a new cabinet starts at.',
      show: !!sizes.value && asksSizes.value,
    },
    { id: 'room', title: 'Room', summary: c?.room ? `${L.value(c.room.length.mm)} × ${L.value(c.room.width.mm)}` : 'No room', words: 'The room the pieces stand in.', show: !!c && !oneThing.value },
    { id: 'stock', title: 'Machine and sheet', summary: `${machine.value.name}; ${L.value(stock.value.width)} × ${L.value(stock.value.height)}`, words: 'The machine the project is cut on, and the size of sheet its parts are laid out on.', show: true },
    { id: 'materials', title: 'Materials', summary: `${store.materials.length} in the project`, words: "The project's own materials, copied from the shop's catalog.", show: true },
  ];
  return all.filter((t) => t.show).map(({ show: _show, ...t }) => ({ ...t, dot: differing(t.id), warn: warnings.value[t.id] ?? 0, subs: t.id === 'fronts' ? frontSubs.value : undefined }));
});
/**
 * The second level: Fronts is four things, listed under it while it is the topic in hand, each with its
 * answer in a line. `#/setup?topic=fronts&sub=pattern` opens one.
 */
type SubId = 'doors' | 'pattern' | 'drawers' | 'hardware';
/** How the inset style's drawer fronts are made, in a few words. */
const insetDrawerWords = (drawers: NonNullable<typeof fronts.value>['drawers']): string => {
  const kind = drawers.shop?.front ?? 'wide';
  const named = (style: { kind: string } | undefined) => (style?.kind === 'shaker' ? 'shaker' : 'slab');
  if (kind === 'applied') return `Applied ${named(drawers.front.style)} fronts`;
  if (kind === 'wide') return `One-piece ${named(drawers.shop?.style)} fronts`;
  return kind === 'runners' ? 'The box as the front, on runners' : 'The box as the front';
};
const frontSubs = computed((): (Topic & { id: SubId })[] => {
  const f = fronts.value;
  const s = settings.value;
  if (!f || !s) return [];
  const shop = s.construction === 'shop';
  const door = shop && f.doors.shop ? f.doors.shop : f.doors;
  const handle = store.shop.hardware.filter(isHandle).find((h) => h.id === (f.doors.handle?.handleId ?? f.drawers.handle?.handleId));
  const styleName = (kind: string) => (kind === 'shaker' ? 'Shaker' : 'Slab');
  const list: { id: SubId; title: string; summary: string; words: string }[] = [
    { id: 'doors', title: 'Doors', summary: `${styleName(door.style.kind)}, ${materialName(door.materialId)}`, words: "The doors: their style and material, then their sizes and edges." },
    { id: 'pattern', title: 'Pattern', summary: PATTERN_LOOKS.find((l) => l.value === lookOf(door.style.pattern))?.title ?? 'None', words: "A pattern cut into the doors' faces: its look, its bit and its sizes." },
    { id: 'drawers', title: 'Drawers', summary: shop ? `${insetDrawerWords(f.drawers)}, ${materialName(f.drawers.materials.boxId)} boxes` : `${styleName(f.drawers.front.style.kind)} fronts, ${materialName(f.drawers.materials.boxId)} boxes`, words: 'The drawer fronts, and how the boxes are made.' },
    { id: 'hardware', title: 'Hardware and handles', summary: handle?.name ?? 'No handles', words: 'The hinges and slides, and the handles: which, and where they go.' },
  ];
  // Only what the project has: no doors, no Doors and no Pattern; no drawers, no Drawers.
  const asked = list.filter((x) => (x.id === 'doors' || x.id === 'pattern' ? hasDoors.value : x.id === 'drawers' ? hasDrawers.value : true));
  return asked.map((x) => ({ ...x, dot: subDiffering(x.id) }));
});
/** Which of Fronts' four a value of the preset's is answered under. */
const frontsSub = (path: string): SubId =>
  /\.style\.pattern\b/.test(path) && path.startsWith('fronts.doors.') ? 'pattern' : /^fronts\.(doors\.(hingeId|framelessHingeId|shopHingeId|handle)|drawers\.(slideId|handle))\b/.test(path) ? 'hardware' : path.startsWith('fronts.drawers.') ? 'drawers' : 'doors';
const subDiffering = (id: SubId) => diffs.value.filter((path) => presetTopic(path) === 'fronts' && frontsSub(path) === id).length;

/** Which topic is in hand, its second level, Back and Next, and the address: the shell's (`useTopics`). */
const nav = useTopics(() => topics.value, { first: route.query.fold === 'materials' ? 'materials' : route.query.fold === 'setup-details' ? 'construction' : 'start' });
const current = computed(() => nav.current);
const currentSub = computed(() => nav.currentSub);

/** What needs a look, by topic: shown as a badge on it. */
const warnings = computed((): Partial<Record<TopicId, number>> => ({
  start: fellBack.value.length,
  finish: stainedWithoutGrain(project.value, store.shop).length,
  sizes: sizes.value ? FORMS.filter((f) => sideNote(sizes.value![f.form].height, sizes.value![f.form].depth)).length : 0,
  stock: store.machineGone ? 1 : 0,
}));
watch(
  // No project yet while a sample is being made again (`&fresh=1`), or with none open.
  () => store.project?.id,
  () => (fellBack.value = []),
);
</script>

<template>
  <template v-if="store.project">
    <PageHeader title="Setup" :status="status" :next="{ to: '/design', title: 'Design' }" />
    <TopicShell :nav="nav" name="setup" dot-title="Differs from the preset">
          <template #notice>
          <div v-if="differing(current.id)" class="d-flex align-center flex-wrap ga-2 text-body-2 mb-4" data-test="setup-differs">
            <span class="topic-dot" />
            <span>{{ differing(current.id) === 1 ? '1 answer here is' : `${differing(current.id)} answers here are` }} not the preset's ("{{ project.preset }}").</span>
            <v-btn size="small" variant="tonal" data-test="setup-back-to-preset" @click="restore">Back to the preset's</v-btn>
          </div>
          </template>

          <template v-if="current.id === 'start'">
          <v-select
            :model-value="presetId"
            label="Preset"
            :items="presets.map((p) => ({ title: p.name, value: p.id }))"
            placeholder="None: the project's own values. Choose one to start again from it."
            persistent-placeholder
            data-test="setup-preset"
            @update:model-value="choosePreset"
          />
          <v-alert v-for="line in fellBack" :key="line" type="warning" variant="tonal" density="compact" class="mb-2">{{ line }}</v-alert>

          <v-alert v-if="thereCount" type="info" variant="tonal" density="compact" class="mb-4" data-test="setup-existing">
            {{ thereCount === cabinetCount ? (thereCount === 1 ? 'The cabinet is' : `All ${thereCount} cabinets are`) : `${thereCount} of the ${cabinetCount} cabinets ${thereCount === 1 ? 'is' : 'are'}` }}
            already there: measured, with nothing of the case made. The answers below are for what is made for
            {{ thereCount === 1 ? 'it' : 'them' }}: new doors and drawer fronts follow the fronts, trays and shelves the case material.
            <div class="mt-2"><v-btn to="/measure" size="small" variant="flat" color="primary" data-test="setup-measure">Measure {{ thereCount === 1 ? 'it' : 'them' }}</v-btn></div>
          </v-alert>
            <div class="text-body-2 text-medium-emphasis mb-3">
              Each answer starts as the preset's; accept them all and go on to Design, or change any. Every cabinet and front follows
              these unless it is made different in Design.
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-btn variant="tonal" color="primary" data-test="save-preset" @click="(presetName = ''), (saving = true)">Save as a preset</v-btn>
              <v-btn v-if="ownPreset" variant="text" color="primary" @click="overwrite">Update the preset "{{ ownPreset.name }}"</v-btn>
            </div>
          </template>

          <template v-if="current.id === 'construction' && settings">
            <div :class="mark('settings', 'construction')"><ChoiceTiles v-model="settings.construction" :items="styleTiles" label="Construction" name="construction" /></div>
            <SubHead>Fine tuning</SubHead>
            <CabinetSettingsFields :settings="settings" part="construction" details joints="none" marks="settings" />
          </template>

          <template v-if="current.id === 'case' && settings">
            <v-row density="compact">
              <v-col cols="6" :class="mark('settings', 'materials.caseId')"><MaterialSelect v-model="settings.materials.caseId" label="Case material" use="cases" /></v-col>
              <v-col cols="6" :class="mark('settings', 'materials.backId')"><MaterialSelect v-model="settings.materials.backId" label="Back material" use="backs" /></v-col>
            </v-row>

            <CabinetSettingsFields :settings="settings" part="case" details joints="none" :walls="true" marks="settings" />
            <div v-if="!anyWall" class="text-caption text-medium-emphasis">How wall cabinets hang applies once the project has one.</div>
          </template>

          <template v-if="current.id === 'fronts' && settings && fronts">
            <FrontSettingsFields :fronts="fronts" :construction="settings.construction" :case-material-id="settings.materials.caseId" :corners="false" :part="(currentSub?.id as SubId | undefined) ?? (hasDoors ? 'doors' : 'drawers')" marks="fronts" :face-size="exampleDoor" :has-doors="hasDoors" :has-drawers="hasDrawers" />
          </template>

          <template v-if="current.id === 'bottom' && settings">
            <div :class="mark('settings', 'toeKick.off', 'toeKick.casters')"><ChoiceTiles v-model="bottom" :items="bottomTiles" label="Bottom" name="setup-bottom" /></div>
            <template v-if="settings.toeKick.legs">
              <v-row density="compact" class="mt-1" data-test="setup-legs">
                <v-col cols="6"><LengthField v-model="settings.toeKick.legs.height" label="Legs: floor to the case" /></v-col>
                <v-col v-if="!settings.toeKick.legs.posts" cols="6"><LengthField v-model="settings.toeKick.legs.apron" label="Aprons: height" /></v-col>
                <v-col cols="12"><v-select :model-value="settings.toeKick.legs.materialId" label="Leg stock" :items="legStockChoices" hide-details data-test="setup-leg-stock" @update:model-value="setLegStock($event)" /></v-col>
                <v-col cols="12">
                  <v-switch :model-value="!!settings.toeKick.legs.posts" label="The legs run up the corners of the case, as posts" color="primary" density="compact" hide-details data-test="setup-legs-posts" @update:model-value="setCornerPosts(!!$event)" />
                  <div v-if="settings.toeKick.legs.posts" class="text-caption text-medium-emphasis">
                    The four posts are the case's corners, from the floor to its top. The sides stand between the front and the back posts, a quarter inch in from their faces; rails of the frame's material lie flat between the front
                    posts, over, under and between the openings; and the fronts are inset, flush with the posts. The cabinets are face frame ones: the posts are the frame's stiles.
                  </div>
                </v-col>
                <v-col cols="12"><v-switch :model-value="!!settings.toeKick.legs.middle" :label="settings.toeKick.legs.posts ? 'Between two bays the middle upright runs down to the floor, as a narrow leg half-way back' : 'Legs in the middle of a long case'" color="primary" density="compact" hide-details data-test="setup-legs-middle" @update:model-value="setMiddleLegs(!!$event)" /></v-col>
              </v-row>
              <div class="text-caption text-medium-emphasis mt-1">
                A frame under each case: four legs of square stock at its corners and an apron between each two, pocket-screwed to the legs and up
                into the case's flat bottom. With legs in the middle, a case longer than about 3' gets a front and a back leg under its partitions too, and an apron across between them. The sizes under "Sizes" are
                the boxes' own: the legs stand them higher.
              </div>
            </template>
            <template v-else-if="settings.toeKick.casters?.feet">
              <v-select v-model="settings.toeKick.casters.casterId" label="Feet" :items="footChoices" hide-details class="mt-2" data-test="setup-foot" />
              <div class="text-caption text-medium-emphasis mt-1">
                Bought feet on plates, one under each corner. A piece on its own with no face frame and a bottom of 3/4" or more has them
                screwed straight to its bottom, by hand; any other has a pad of the case material under each, its pilot holes drilled on the
                CNC. The sizes under "Sizes" are the boxes' own: the feet (and the pads) stand them higher. Their sizes are in the shop
                profile, under Hardware.
              </div>
            </template>
            <div v-else-if="bottom === 'plinth'" class="text-caption text-medium-emphasis mt-1" data-test="setup-plinth">
              The toe kick's board, flush with the front of the case: no toe space. Its height is the toe kick's, under Construction.
            </div>
            <template v-else-if="settings.toeKick.casters">
              <v-select v-model="settings.toeKick.casters.casterId" label="Casters" :items="casterChoices" hide-details class="mt-2" data-test="setup-caster" />
              <v-select :model-value="casterUnderChoice(settings.toeKick)" label="Under the casters" :items="CASTER_UNDER_CHOICES" hide-details class="mt-2" data-test="setup-caster-under" @update:model-value="setCasterUnderChoice(settings.toeKick, $event)" />
              <div class="text-caption text-medium-emphasis mt-1">
                The sizes under "Sizes" are the boxes' own: what is under the bottom for the casters (pads, or a second layer) and the casters stand them higher.
              </div>
            </template>
          </template>

          <template v-if="current.id === 'joints' && settings">
            <template v-if="hasCases">
              <SubHead>Cases</SubHead>
              <CabinetSettingsFields :settings="settings" part="case" details joints="only" marks="settings" />
            </template>
            <template v-if="fronts && hasDrawers">
              <SubHead>Drawer boxes</SubHead>
              <v-row density="compact">
                <v-col cols="12" :class="mark('fronts', 'drawers.cornerJoint')"><v-select v-model="fronts.drawers.cornerJoint" label="Box corners" :items="BOX_CORNERS" hide-details data-test="setup-box-corners" /></v-col>
                <v-col v-if="fronts.drawers.cornerJoint === 'tabs'" cols="12" :class="mark('fronts', 'drawers.fingers')"><FingerSizeFields :box="fronts.drawers" /></v-col>
              </v-row>
            </template>
            <template v-if="hasCases && bottom === 'toeKick'">
              <SubHead>Toe kick board</SubHead>
              <CabinetSettingsFields :settings="settings" part="kick" marks="settings" />
            </template>

            <SubHead>Pocket holes</SubHead>
            <div class="text-body-2 text-medium-emphasis mb-2" data-test="setup-pocket-uses">{{ pocketUses }}</div>
            <v-row density="compact">
              <v-col cols="12" sm="7">
                <v-select :model-value="pocketMethod" label="Pocket holes are made" :items="POCKET_METHODS.map((m) => ({ title: pocketHoleMethodLabel(m), value: m }))" hide-details data-test="setup-pocket-method" @update:model-value="setPocketMethod($event)" />
              </v-col>
              <v-col v-if="pocketLow" cols="12" sm="5"><LengthField v-model="pocketSeat" label="Seat from the edge" data-test="setup-pocket-seat" /></v-col>
            </v-row>
            <div class="text-caption text-medium-emphasis mt-1">
              Whatever is chosen, a part cut out on a saw gets its pocket holes with the Kreg jig: the CNC cuts pockets only in the parts it cuts out.
            </div>
            <template v-if="pocketMethod !== 'kregJig'">
              <div class="text-body-2 mt-3">A ledge for a printed cover, round the pockets that are seen</div>
              <v-checkbox v-for="c in POCKET_COVERS" :key="c.value" :model-value="pocketCovers.includes(c.value)" :label="c.title" :disabled="c.value !== 'all' && pocketCovers.includes('all')" color="primary" density="compact" hide-details :data-test="`setup-pocket-cover-${c.value}`" @update:model-value="setPocketCover(c.value, !!$event)" />
              <div class="text-caption text-medium-emphasis mt-1">
                The ledge is a shallow step round the pocket's opening, cut with a flat end mill after the pocket: a printed cover lies in it, flush with the face.
                The covers are printed from the Jigs page, one a pocket. Untested.
                <template v-if="pocketLow"> A low-angle pocket in stock thinner than 5/8" gets none (in 5/8" stock, none at 6°): its screw's head comes up nearly to the face.</template>
              </div>
            </template>
          </template>

          <template v-if="current.id === 'finish'">
            <FinishFields :groups="['case', 'fronts', 'tops']" marks="finish" />
            <SubHead>Wooden handles</SubHead>
            <FinishFields :groups="['handles']" marks="finish" />
          </template>

          <template v-if="current.id === 'sizes' && sizes">
            <!-- One block a form: each size in its own column, its usual values under it as plain sizes, and what the chosen one is for in words. -->
            <div v-for="f in shownForms" :key="f.form" class="size-form mb-4" :data-test="`setup-size-${f.form}`">
              <SubHead>{{ f.title }}</SubHead>
              <v-row density="compact">
                <v-col v-for="d in SIZE_DIMENSIONS" :key="d.key" cols="12" sm="6" :class="mark('sizes', `${f.form}.${d.key}`)">
                  <LengthField :model-value="sizes[f.form][d.key]" :label="d.label" @update:model-value="setSize(f.form, d.key, $event)" />
                  <div class="d-flex flex-wrap align-center ga-1 mt-1">
                    <span class="text-caption text-medium-emphasis mr-1">Usual:</span>
                    <v-chip
                      v-for="c in STANDARD_SIZES[f.form][d.list]"
                      :key="c.value.mm"
                      size="small"
                      :title="sizeNote(c.title) || undefined"
                      :color="same(c.value, sizes[f.form][d.key]) ? 'primary' : undefined"
                      :variant="same(c.value, sizes[f.form][d.key]) ? 'flat' : 'outlined'"
                      :data-test="`size-pick-${f.form}-${d.key}`"
                      @click="setSize(f.form, d.key, { ...c.value })"
                      >{{ L(c.value.mm) }}</v-chip
                    >
                  </div>
                  <div class="text-caption text-medium-emphasis size-note">{{ chosenNote(f.form, d) }}</div>
                </v-col>
              </v-row>
              <div v-if="sideNote(sizes[f.form].height, sizes[f.form].depth)" class="text-body-2 text-warning mt-1" data-test="size-limit">
                At this size {{ sideNote(sizes[f.form].height, sizes[f.form].depth) }}.
              </div>
            </div>
            <v-btn v-if="hiddenForms.length" variant="text" size="small" class="mb-2 px-0" data-test="more-sizes" @click="moreSizes = true">
              {{ hiddenForms.map((f) => f.title).join(' and ') }} too
            </v-btn>
            <HelpText>
              Only where a new cabinet starts: a cabinet's size is its own, and changing these changes no cabinet that is already
              there. Heights are from the floor, toe kick included; depths are the case alone, without doors or a face frame. The
              standard sizes are US kitchen practice (tune me). Hover over a usual size to see what it is for; the line under it says so for the one in use.
              <div v-for="f in shownForms" :key="f.form" class="mt-1">{{ f.title }} are offered in Design at these widths: {{ sizes.widths[f.form].map((w) => L(w.mm)).join(', ') }}.</div>
            </HelpText>
          </template>

          <template v-if="current.id === 'room' && cabinets">
            <template v-if="cabinets.room">
              <v-row density="compact">
                <v-col cols="4"><LengthField v-model="cabinets.room.length" label="Length (back wall)" /></v-col>
                <v-col cols="4"><LengthField v-model="cabinets.room.width" label="Width (side walls)" /></v-col>
                <v-col cols="4"><LengthField v-model="cabinets.room.ceiling" label="Ceiling" /></v-col>
              </v-row>
              <RoomLookFields :room="cabinets.room" />
              <v-btn variant="text" size="small" class="mt-2" data-test="setup-no-room" @click="delete cabinets.room">No room</v-btn>
            </template>
            <v-btn v-else variant="tonal" color="primary" size="small" data-test="setup-add-room" @click="cabinets.room = starterRoom()">Add a room</v-btn>
            <div class="text-caption text-medium-emphasis">The room the cabinets stand in, inside its walls: Design places them against its walls. Without one, the whole project is shown in a row.</div>
          </template>

          <template v-if="current.id === 'tops' && cabinets">
            <!-- No cabinet on the floor: no countertop to make, only how a table's top is made. -->
            <template v-if="tops && !countertops">
              <v-row density="compact" data-test="setup-tops">
                <v-col cols="12">
                  <v-select :model-value="tops.kind === 'torsion' ? 'torsion' : 'made'" label="A table's top" :items="TABLE_TOP_KINDS" hide-details data-test="setup-top-kind" @update:model-value="setTopKind($event as TopSettings['kind'])" />
                </v-col>
                <v-col v-if="tops.kind !== 'torsion'" cols="12"><MaterialSelect v-model="tops.materialId" label="Top material" use="tops" hide-details /></v-col>
              </v-row>
              <TorsionFields v-if="tops.kind === 'torsion' && tops.torsion" :box="tops.torsion" sized />
              <div class="text-caption text-medium-emphasis mb-3">
                Every table's top is made this way unless its Design makes it its own: a slab of another material, or a torsion box of its own.
              </div>
            </template>
            <template v-else-if="tops">
            <v-row density="compact" data-test="setup-tops">
              <v-col cols="12"><v-select :model-value="tops.kind" label="Countertops" :items="TOP_KINDS" hide-details data-test="setup-top-kind" @update:model-value="setTopKind($event)" /></v-col>
              <template v-if="tops.kind === 'made'">
                <v-col cols="8"><MaterialSelect v-model="tops.materialId" label="Top material" use="tops" hide-details /></v-col>
                <v-col cols="4"><v-select v-model="tops.layers" label="Layers" :items="[1, 2]" hide-details /></v-col>
                <v-col cols="6"><v-select v-model="tops.edge.kind" label="Front and open ends" :items="EDGES" hide-details /></v-col>
                <v-col v-if="tops.edge.kind === 'strip'" cols="6"><LengthField v-model="tops.edge.thickness" label="Strip thickness" /></v-col>
                <v-col cols="6"><v-switch v-model="tops.backsplash.on" label="Backsplash" color="primary" density="compact" hide-details /></v-col>
                <v-col v-if="tops.backsplash.on" cols="6"><LengthField v-model="tops.backsplash.height" label="Backsplash height" /></v-col>
              </template>
              <v-col v-if="tops.kind === 'bought'" cols="12">
                <v-select v-model="tops.boughtTopId" label="Laminate top" :items="boughtTops" hide-details />
              </v-col>
              <template v-if="tops.kind !== 'torsion'">
                <v-col cols="6"><LengthField v-model="tops.overhang.front" label="Over the front (tune me)" /></v-col>
                <v-col cols="6"><LengthField v-model="tops.overhang.openEnd" label="Past an open end (tune me)" /></v-col>
              </template>
            </v-row>
            <TorsionFields v-if="tops.kind === 'torsion' && tops.torsion" :box="tops.torsion" />
            <div class="text-caption text-medium-emphasis">Which runs and cabinets have a top is Design's: a switch on a run's card, or a cabinet's on its own.</div>
            </template>
          </template>

          <template v-if="newPieces && (current.id === 'furniture' || (current.id === 'tops' && !countertops))">
            <v-row density="compact" data-test="setup-furniture">
              <v-col v-if="current.id === 'furniture'" cols="12"><v-select :model-value="newPieces.legMaterialId" label="A table's legs" :items="legStockChoices" hide-details data-test="setup-new-legs" @update:model-value="setNewLegStock($event)" /></v-col>
              <template v-if="current.id === 'tops' || countertops">
                <v-col v-if="current.id === 'tops'" cols="12" class="text-caption text-medium-emphasis pb-0">A new table's top starts with:</v-col>
              <v-col cols="4"><LengthField v-model="newPieces.top.overhang.front" label="Top: over the front" /></v-col>
              <v-col cols="4"><LengthField v-model="newPieces.top.overhang.ends" label="Over each end" /></v-col>
              <v-col cols="4"><LengthField v-model="newPieces.top.overhang.back" label="Over the back" /></v-col>
              <v-col cols="7"><v-select v-model="newPieces.top.edge.kind" label="Its edge, all round" :items="OWN_TOP_EDGES" hide-details data-test="setup-new-edge" /></v-col>
              <v-col v-if="newPieces.top.edge.kind === 'strip'" cols="5">
                <LengthField :model-value="newPieces.top.edge.thickness ?? null" label="Strip thickness" @update:model-value="$event && newPieces && (newPieces.top.edge.thickness = $event)" />
              </v-col>
              <v-col v-if="newPieces.top.edge.kind === 'roundover' || newPieces.top.edge.kind === 'chamfer'" cols="5">
                <LengthField :model-value="newPieces.top.edge.size ?? null" :label="newPieces.top.edge.kind === 'roundover' ? 'Radius' : 'Chamfer'" @update:model-value="$event && newPieces && (newPieces.top.edge.size = $event)" />
              </v-col>
              </template>
            </v-row>
            <HelpText v-if="current.id === 'furniture' && countertops">
              Only where a new one starts, as the sizes are: a table added in Design takes these legs and this top, and a case given a top of its
              own takes this top. Changing them changes no table or top that is already there: each has its own, on its Design. What a top is
              made of is under Tops.
            </HelpText>
            <HelpText v-else-if="current.id === 'tops'">
              The overhang and the edge are only where a new table starts: changing them changes no table that is already there. Each has
              its own, on its Design.
            </HelpText>
          </template>

          <template v-if="current.id === 'stock'">
          <div class="text-body-2 mb-2" data-test="setup-cnc">
            {{ machine.name }}: the largest part it cuts in one set-up is {{ L(largest.oneSetup.long) }} × {{ L(largest.oneSetup.short) }}<template
              v-if="largest.tiled"
              >, and {{ L(largest.tiled.long) }} × {{ L(largest.tiled.short) }} with tiling (two set-ups, the sheet slid along on pins)</template
            >.
            <router-link to="/shop">Its values are in the shop profile.</router-link>
          </div>
          <v-alert v-if="store.machineGone" type="warning" variant="tonal" density="compact" class="mb-3" data-test="setup-machine-gone">
            The machine this project was planned for is no longer in the shop: it is planned for the {{ machine.name }}, the shop's machine in use.
            Choose a machine here to keep it on one.
          </v-alert>
          <v-row density="compact">
            <v-col cols="12" sm="6">
              <v-select
                v-model="machineId"
                :items="store.shop.machines.map((m) => ({ title: m.name, value: m.id }))"
                label="Machine"
                hint="This project is planned and cut on it, with its feeds and speeds, whichever machine the shop has in use."
                persistent-hint
                data-test="setup-machine"
              />
            </v-col>
          </v-row>
          <v-row density="compact">
            <v-col cols="6">
              <LengthField :model-value="project.plan.blank.stock?.width ?? machine.defaultSheet.x" label="Sheet size: width" @update:model-value="setStock('width', $event)" />
            </v-col>
            <v-col cols="6">
              <LengthField :model-value="project.plan.blank.stock?.height ?? machine.defaultSheet.y" label="Sheet size: length" @update:model-value="setStock('height', $event)" />
            </v-col>
          </v-row>
          <div class="text-caption text-medium-emphasis">
            The size of sheet the parts are laid out on. A part bigger than it is cut from a piece that takes it; only what the machine cannot cut is held back.
            {{ ownStock ? '' : `This is the machine profile's sheet, nominal; planned ${L(machine.defaultSheet.x.mm - stock.width)} shorter each way for the saw cuts.` }}
            <v-btn v-if="ownStock" variant="text" size="x-small" @click="delete project.plan.blank.stock">Use the machine profile's sheet</v-btn>
          </div>
          </template>

          <template v-if="current.id === 'materials'">
            <ProjectMaterials :used="usedMaterials" />
          </template>

          <template #last><v-btn to="/design" color="primary" variant="flat">Next: Design</v-btn></template>
      <!-- An example as the answers make it, following every answer. -->
      <template v-if="scene" #picture>
        <v-card class="pa-5" data-test="setup-picture">
          <PanelTitle icon="view">An example, as answered</PanelTitle>
          <v-alert v-if="'error' in scene" type="warning" variant="tonal" density="compact">{{ scene.error }}</v-alert>
          <template v-else>
            <CabinetAssemblyView
              :parts="scene.parts"
              :cabinets="scene.cabinets"
              :room="scene.room"
              frame-key="example"
              :pose="pose"
              :hardware="scene.hardware"
              :finish="scene.finish"
              :faces="scene.faces"
              :slides="scene.slides"
              :casters="scene.casters"
              :appliances="scene.appliances"
              :looks="scene.looks"
            />
            <div class="text-caption text-medium-emphasis mt-2">
              An example, not one of the project's cabinets: a base cabinet built as these answers stand. The construction, the
              materials, the fronts, the bottom and the finish show here as they are changed. The project itself is in Design.
            </div>
          </template>
        </v-card>
      </template>
    </TopicShell>

    <v-dialog :model-value="!!confirming" max-width="520" @update:model-value="confirming = null">
      <v-card class="pa-5">
        <div class="text-h6 mb-2">Start from another preset?</div>
        <div class="text-body-2 mb-4">
          This replaces every value on this screen with the preset's. The cabinets, their sizes and
          layouts, and anything made different in Design are kept.
        </div>
        <div class="d-flex justify-end ga-2">
          <v-btn variant="text" @click="confirming = null">Cancel</v-btn>
          <v-btn color="primary" variant="flat" data-test="confirm-preset" @click="applyChosen">Replace</v-btn>
        </div>
      </v-card>
    </v-dialog>
    <v-dialog v-model="saving" max-width="420">
      <v-card class="pa-5">
        <div class="text-h6 mb-3">Save as a preset</div>
        <v-text-field v-model="presetName" label="Name" autofocus @keydown.enter="save" />
        <div class="text-body-2 text-medium-emphasis mb-3">Kept in the shop profile, for new projects to start from.</div>
        <div class="d-flex justify-end ga-2">
          <v-btn variant="text" @click="saving = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!presetName.trim()" @click="save">Save</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </template>
</template>

<style scoped>
.topic-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
}
</style>
