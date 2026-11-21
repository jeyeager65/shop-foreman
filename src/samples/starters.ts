/**
 * The starters: the things that can be made, each a thing with a usual size and
 * shape, not a style. One list, used to start a project (what, then in what style: a preset) and by Design's Add
 * to add to one. Only what the app makes today.
 */
import { setPosts, setBottomKind } from '@/design/casters';
import { addMaterialFromCatalog } from '@/design/materials';
import { applyPreset } from '@/design/presets';
import { starterRoom } from '@/design/room';
import { createRun } from '@/design/runs';
import { standOn } from '@/design/standsOn';
import { newOwnTop, topSettingsOf } from '@/design/tops';
import { benchTopTable, torsionMaterialIds } from '@/design/torsion';
import { SQUARE_3X3_ID } from '@/libraries/materials';
import { cabinetsOf } from '@/design/settings';
import { createOrganizer, createUnderSink } from '@/design/underSink';
import { sinkOfKind } from '@/design/sinks';
import { EURO_SLIDE_ID, GENERIC_KNOB_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID } from '@/libraries';
import type { CabinetDesign, DesignedCabinetContext, Hardware, Id, Material, Preset, Project, StoredFrame } from '@/model';
import { len } from '@/units';
import {
  NEW_CABINET,
  addCabinet,
  addTallCabinet,
  addWallCabinet,
  applyCabinetLayout,
  createBaseCabinetProject,
  createIslandProject,
  createKitchenProject,
  createShopTableProject,
  createShopWallProject,
  deleteCabinet,
  makeExisting,
  setBayOpen,
  setBays,
  setRowOpen,
  setRowSplit,
} from './cabinet';
import { FURNITURE_PRESET_ID, FURNITURE_SOLID_PRESET_ID, SHOP_PRESET_ID } from './presets';
import { TABLE_SIZES, addTable } from './tables';
import { createVanityProject } from './vanity';
import { storedCases } from '@/design/settings';

export type StarterGroupId = 'cabinets' | 'room' | 'furniture' | 'existing' | 'shop' | 'small';

/** The groups, in the order they are asked; the Samples page has the same ones (`samples`: its group's id). */
export const STARTER_GROUPS: { id: StarterGroupId; title: string; samples?: string }[] = [
  { id: 'cabinets', title: 'Cabinets', samples: 'cabinets' },
  { id: 'room', title: 'Kitchens and rooms', samples: 'room' },
  { id: 'furniture', title: 'Furniture', samples: 'furniture' },
  { id: 'existing', title: 'Existing cabinets', samples: 'existing' },
  { id: 'shop', title: 'For the shop', samples: 'shop' },
  { id: 'small', title: 'Small things' },
];

type Shop = { hardware: Hardware[]; materialCatalog: Material[] };

export interface Starter {
  id: string;
  group: StarterGroupId;
  title: string;
  /** What it makes, in a line. */
  what: string;
  /** The words its finished examples are found by on the Samples page (`#/samples?q=`). */
  examples?: string;
  /** The new project's name. */
  name?: string;
  /** A page it goes to in place of making a project (jigs need none). */
  to?: string;
  /**
   * The project it starts from, before the style is applied: a whole sample (a kitchen), or the measured
   * vanity. Left out, one base cabinet, a drawer over doors, 24" wide.
   */
  project?: () => Project;
  /**
   * What the project's style is given for this thing, once, when a project is started as it (a bookcase stands
   * on a plinth, a dresser on feet): Setup's own answers, so it is never applied to Setup's example or to a
   * piece added to a project, which takes that project's style as it is.
   */
  settings?: (project: Project, shop: Shop) => void;
  /** Turns that one base cabinet, in the style chosen, into the thing. */
  shape?: (project: Project, cabinet: CabinetDesign, shop: Shop) => void;
  /**
   * Setup's example is this thing: one cabinet whose `shape` changes only the cabinet, never what Setup
   * sets. Left out, the example is the usual base cabinet (a kitchen is not looked at to set a style).
   */
  example?: boolean;
  /** Its cabinets are already there: the styles offered are the presets for those, and it opens on Measure. */
  existing?: boolean;
  /** It comes as it is, in its own style (the shop table is shop cabinets under a torsion top): no style is asked. */
  fixed?: boolean;
  /** The preset offered first, when it is not the one last used. */
  prefers?: string;
  /** Adds one to a project of cabinets (Design's Add), under a name; `like`: the cabinet in hand. */
  add?: (project: Project, name: string, like?: Id, shop?: Shop) => { id: Id };
  /** What Design's Add names a new one after: "Cabinet 3". */
  stem?: string;
}

const contextOf = (project: Project) => project.context as DesignedCabinetContext;
/** No shop to copy a material from: the project must have what the thing is made of already. */
const NO_SHOP: Shop = { hardware: [], materialCatalog: [] };
const storedOf = (project: Project, id: Id) => storedCases(contextOf(project)).find((c) => c.id === id)!;

/** A bank of drawers: 18" wide, three of them. */
function asDrawers(project: Project, cabinet: CabinetDesign) {
  storedOf(project, cabinet.id).size.width = len('18"');
  applyCabinetLayout(project, cabinet, 'drawers', 3);
}
/**
 * A bathroom vanity: 30" wide and 21" deep, doors only, a bought top with its sink in it, the sink's trap and a tray
 * under it, corner blocks under the top.
 */
function asVanity(project: Project, cabinet: CabinetDesign) {
  const stored = storedOf(project, cabinet.id);
  stored.size.width = len('30"');
  stored.size.depth = len('21"');
  applyCabinetLayout(project, cabinet, 'doors');
  stored.inside = createUnderSink({ bottomTray: true });
  stored.adjustableShelves = 0;
  stored.topSupport = { cornerBlocks: true };
  stored.sink = sinkOfKind(stored, 'integrated');
}
/** A diagonal corner cabinet, 36" along each wall, the room's corner at its left. */
function asCorner(project: Project, cabinet: CabinetDesign) {
  const stored = storedOf(project, cabinet.id);
  stored.size.width = len('36"');
  applyCabinetLayout(project, cabinet, 'doors');
  stored.corner = { kind: 'diagonal', side: 'left' };
}
/** What a furniture top is made of is in the project: Setup's top material, and solid wood for its edge strip. */
function ownTop(project: Project, shop: Shop): { own: ReturnType<typeof newOwnTop> } {
  for (const id of [topSettingsOf(contextOf(project)).materialId, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, shop.materialCatalog, id);
  return { own: newOwnTop(contextOf(project)) };
}
/**
 * A bookcase: a tall case 32" wide, 72" high and 12" deep, two rows of open shelves with a
 * fixed shelf between them, two loose shelves in each, under a top of its own.
 */
function asBookcase(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('32"'), height: len('72"'), depth: len('12"') };
  for (const row of cabinet.layout.rows) setRowOpen(project, cabinetsOf(project).find((c) => c.id === cabinet.id)!, row.id, true);
  stored.adjustableShelves = 2;
  stored.layout = { ...stored.layout, rows: stored.layout.rows.map((r, i) => (i === 0 ? { ...r, shelves: 2 } : r)) };
  stored.top = ownTop(project, shop);
}
/** A dresser: 36" wide, 34" high and 18" deep, four drawers, a top panel under a top of its own. */
function asDresser(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('36"'), height: len('34"'), depth: len('18"') };
  applyCabinetLayout(project, cabinet, 'drawers', 4);
  stored.caseTop = 'panel';
  stored.top = ownTop(project, shop);
}
/** A night stand that is a box: 20" wide, 26" high and 16" deep, a drawer over an open shelf, under a top of its own. */
function asNightStand(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('20"'), height: len('26"'), depth: len('16"') };
  applyCabinetLayout(project, cabinet, 'drawerOverDoors');
  const now = cabinetsOf(project).find((c) => c.id === cabinet.id)!;
  setRowOpen(project, now, now.layout.rows.at(-1)!.id, true);
  stored.adjustableShelves = 0;
  stored.caseTop = 'panel';
  stored.top = ownTop(project, shop);
}
/** A project whose cases stand on a leg frame: Setup's bottom, and the legs' square stock among its materials. */
function onLegFrame(project: Project, shop: Shop) {
  const kick = contextOf(project).settings.toeKick;
  setBottomKind(kick, 'legs', shop.hardware);
  addMaterialFromCatalog(project, shop.materialCatalog, kick.legs!.materialId);
}
/** A project whose cases have posts at their corners: legs that run up to the case's top, 4" under it. */
function onCornerPosts(project: Project, shop: Shop) {
  onLegFrame(project, shop);
  const settings = contextOf(project).settings;
  settings.toeKick.legs!.height = len('4"');
  setPosts(settings, true);
  // Between two bays the middle upright runs down to the floor as a narrow leg, half-way back, as on a wide dresser.
  settings.toeKick.legs!.middle = true;
  // Plywood sides and stretchers in a solid wood project as such a piece is usually
  // built: the posts, the rails, the uprights and the fronts stay solid, and no plywood edge shows from the
  // front, the sides' front edges being behind the posts.
  if (settings.materials.caseId === SOLID_WOOD_3_4_ID && shop.materialCatalog.some((m) => m.id === PLYWOOD_3_4_ID)) {
    settings.materials.caseId = PLYWOOD_3_4_ID;
    addMaterialFromCatalog(project, shop.materialCatalog, PLYWOOD_3_4_ID);
  }
  // Its drawers on bottom-mount roller slides, as such dressers often are: they open three quarters, which tips a chest less than full extension.
  if (shop.hardware.some((h) => h.id === EURO_SLIDE_ID)) contextOf(project).fronts.drawers.slideId = EURO_SLIDE_ID;
  // A knob on every drawer, two on a wide one, its hole drilled on the CNC.
  if (shop.hardware.some((h) => h.id === GENERIC_KNOB_ID)) contextOf(project).fronts.drawers.handle = { handleId: GENERIC_KNOB_ID, two: true };
}
/** The top row of drawers split into two side by side, and that row a set height (the others share what is left). */
function splitTopRow(project: Project, cabinet: CabinetDesign, height: string) {
  const top = cabinet.layout.rows[0]!;
  setRowSplit(project, cabinet, top.id, 2);
  const stored = storedOf(project, cabinet.id);
  stored.layout = { ...stored.layout, rows: stored.layout.rows.map((r) => (r.id === top.id ? { ...r, height: len(height) } : r)) };
}
/** A dresser between corner posts: 60" wide, 34" high and 18" deep, two bays of three rows of drawers, the top row two small ones in each bay, a top of its own. */
function asPostDresser(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('60"'), height: len('34"'), depth: len('18"') };
  applyCabinetLayout(project, cabinet, 'drawers', 3);
  const at = () => cabinetsOf(project).find((c) => c.id === cabinet.id)!;
  setBays(project, at(), 2);
  // The top row is two small drawers in each bay.
  splitTopRow(project, at(), '6"');
  // No bottom and no top panel under its top: stretchers front and back at the top, one at the back at the bottom.
  stored.noBottom = true;
  stored.top = ownTop(project, shop);
}
/** A tall chest between corner posts: 42" wide, 50" high and 20" deep, five rows of drawers, the top one two small ones side by side, a top of its own. */
function asPostChest(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('42"'), height: len('50"'), depth: len('20"') };
  applyCabinetLayout(project, cabinet, 'drawers', 5);
  splitTopRow(project, cabinetsOf(project).find((c) => c.id === cabinet.id)!, '6"');
  stored.noBottom = true;
  stored.top = ownTop(project, shop);
}
/**
 * A TV stand: 60" wide, 20" high and 18" deep, three bays, doors on the outer two and the
 * middle one open for equipment, a hole for its cables and a slot for air through the back there, a shelf in each
 * bay, a top panel under a top of its own. Behind a face frame a partition stands behind each mullion, as in any case with bays
 * (one shelf across the whole 60" is not strong enough), so its shelves are a bay long.
 */
function asTvStand(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('60"'), height: len('20"'), depth: len('18"') };
  applyCabinetLayout(project, cabinet, 'doors');
  const at = () => cabinetsOf(project).find((c) => c.id === cabinet.id)!;
  setBays(project, at(), 3);
  setBayOpen(project, at(), 1, true);
  stored.adjustableShelves = 1;
  stored.cables = { diameter: len('2-1/2"'), air: true };
  stored.caseTop = 'panel';
  stored.top = ownTop(project, shop);
}
/**
 * A closet tower: a tall case 24" wide, 84" high and 16" deep, two open rows with the fixed
 * shelf between them: three loose shelves above, a hanging rod below with 42" under it for shirts and jackets.
 */
function asClosetTower(project: Project, cabinet: CabinetDesign) {
  const stored = storedOf(project, cabinet.id);
  stored.size = { width: len('24"'), height: len('84"'), depth: len('16"') };
  for (const row of cabinet.layout.rows) setRowOpen(project, cabinetsOf(project).find((c) => c.id === cabinet.id)!, row.id, true);
  // The lower row, for hanging: no loose shelves, and tall enough under the rod.
  stored.adjustableShelves = 0;
  stored.layout = { ...stored.layout, rows: stored.layout.rows.map((r, i) => (i === 0 ? { ...r, shelves: 3, height: len('32"') } : r)) };
  stored.rod = {};
}
/** A pedestal desk's sizes, in inches (tune me): each pedestal, the knee space between them, and where it stands in its room. */
export const PEDESTAL_DESK = { width: 16, height: 29.25, depth: 22, knees: 28, fromLeft: 42, fromBack: 36 };

/**
 * A pedestal desk: two banks of three drawers with knee space between them under one top.
 * It is built as the shop table is: the left pedestal is a row of an island, whose one top also covers the
 * right pedestal, which stands free beside it. So it stands in a room, away from the walls, and its top is
 * Setup's countertop, over the pedestals by Setup's overhangs.
 */
function asPedestalDesk(project: Project, cabinet: CabinetDesign, shop: Shop) {
  const context = contextOf(project);
  const d = PEDESTAL_DESK;
  const inch = (n: number) => len(`${n}"`);
  context.room = starterRoom();
  const left = storedOf(project, cabinet.id);
  left.name = 'Left pedestal';
  left.size = { width: inch(d.width), height: inch(d.height), depth: inch(d.depth) };
  applyCabinetLayout(project, cabinet, 'drawers', 3);
  const right = addCabinet(project, { name: 'Right pedestal', width: inch(d.width), layout: 'drawers', drawers: 3, height: inch(d.height) });
  const storedRight = storedOf(project, right.id);
  storedRight.size.depth = inch(d.depth);
  storedRight.placement = { wall: 'free', x: inch(d.fromLeft + d.width + d.knees), y: inch(d.fromBack), turn: 0 };
  const row = createRun(project, [cabinet.id], 'Left pedestal');
  context.islands = [{ id: 'island-1', name: 'Desk', rows: [row.id], placement: { x: inch(d.fromLeft), y: inch(d.fromBack), turn: 0 }, top: {}, covers: [right.id] }];
  // The top's material and its edge strip's are in the project.
  for (const id of [topSettingsOf(context).materialId, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, shop.materialCatalog, id);
}
/** The one cabinet a new project has is taken out once `add` has put another in. */
const only = (add: (project: Project) => CabinetDesign) => (project: Project, cabinet: CabinetDesign) => {
  add(project);
  deleteCabinet(project, cabinet.id);
};

/**
 * A table: a piece of its own kind, legs and aprons under a top, at a usual size. Started as a
 * project it is the only piece; added to one it stands after the others. It reads the project's style: its aprons
 * are the case material, its top Setup's top material.
 */
/** The drop-leaf table, a classic one: a leaf along each long side of its top, the top flush with the legs there. */
function dropLeafTable(): Starter {
  const base = table('dropleaftable', 'A drop-leaf table', 'A narrow table, 36" long and 20" wide, with a 10" leaf along each long side that folds down: 40" wide with both up.', 'Drop-leaf table', TABLE_SIZES.dropLeaf);
  const leafed = (made: StoredFrame) => {
    // The top is flush with the legs front and back, so that the leaves hang clear of them; a square edge, banded.
    made.top = { ...made.top, overhang: { ...made.top.overhang, front: len('0"'), back: len('0"') }, edge: { kind: 'banding' }, leaf: { edge: 'back', length: len('10"'), both: true } };
    return made;
  };
  return {
    ...base,
    shape: (project, cabinet, shop) => {
      base.shape!(project, cabinet, shop);
      for (const piece of (project.context as DesignedCabinetContext).pieces) if (piece.kind === 'frame') leafed(piece);
    },
    add: (project, n, like, shop) => leafed(base.add!(project, n, like, shop) as unknown as StoredFrame) as unknown as ReturnType<NonNullable<Starter['add']>>,
  };
}

/**
 * The assembly table: a table whose top is a torsion box. As a new project its top follows Setup, whose tops are
 * set to the bench top's torsion box; added to a project that is already there, the box is the table's own, so
 * that project's Setup is left as it was.
 */
function assemblyTable(): Starter {
  const name = 'Assembly table';
  const make = (project: Project, n: string, shop: Parameters<typeof addTable>[1], inSetup: boolean) => {
    const made = addTable(project, shop, { name: n, size: TABLE_SIZES.assembly, legMaterialId: SQUARE_3X3_ID });
    const box = benchTopTable();
    for (const id of torsionMaterialIds(box)) addMaterialFromCatalog(project, shop.materialCatalog, id);
    made.top = { overhang: { front: len('3"'), ends: len('3"'), back: len('3"') }, edge: { kind: 'none' }, ...(inSetup ? {} : { torsion: box }) };
    if (inSetup && project.context.kind === 'designedCabinet') project.context.tops = { ...topSettingsOf(project.context), kind: 'torsion', torsion: box };
    made.shelf = { up: len('8"') };
    return made;
  };
  return {
    id: 'assemblytable',
    examples: 'assembly table',
    group: 'shop',
    title: 'An assembly table',
    what: 'A torsion box on legs and aprons, flat and stiff: 60" long, 30" wide and 34" high, with a shelf low down.',
    name,
    stem: name,
    example: true,
    shape: (project, cabinet, shop) => {
      make(project, name, shop, true);
      deleteCabinet(project, cabinet.id);
    },
    add: (project, n, _like, shop) => make(project, n, shop ?? NO_SHOP, false),
  };
}

function table(id: string, title: string, what: string, name: string, size: { width: string; height: string; depth: string }, shelf?: string): Starter {
  return {
    id,
    examples: name.toLowerCase(),
    group: 'furniture',
    title,
    what,
    name,
    stem: name,
    prefers: FURNITURE_PRESET_ID,
    example: true,
    shape: (project, cabinet, shop) => {
      const made = addTable(project, shop, { name, size });
      if (shelf) made.shelf = { up: len(shelf) };
      deleteCabinet(project, cabinet.id);
    },
    add: (project, n, _like, shop) => {
      const made = addTable(project, shop ?? NO_SHOP, { name: n, size });
      if (shelf) made.shelf = { up: len(shelf) };
      return made;
    },
  };
}

export const STARTERS: Starter[] = [
  {
    id: 'base',
    examples: 'base cabinet',
    group: 'cabinets',
    title: 'A base cabinet',
    what: 'A drawer over a pair of doors, 24" wide.',
    name: 'Base cabinet',
    stem: 'Cabinet',
    add: (project, name, like) => addCabinet(project, { name, width: len(NEW_CABINET.width), layout: NEW_CABINET.layout, ...(like ? { like } : {}) }),
  },
  {
    id: 'drawers',
    examples: 'drawers',
    group: 'cabinets',
    title: 'A bank of drawers',
    what: 'Three drawers, 18" wide.',
    name: 'Bank of drawers',
    stem: 'Drawers',
    example: true,
    shape: asDrawers,
    add: (project, name, like) => addCabinet(project, { name, width: len('18"'), layout: 'drawers', drawers: 3, ...(like ? { like } : {}) }),
  },
  {
    id: 'wall',
    examples: 'wall cabinet',
    group: 'cabinets',
    title: 'A wall cabinet',
    what: 'A pair of doors, hung on the wall.',
    name: 'Wall cabinet',
    stem: 'Wall cabinet',
    example: true,
    shape: only((project) => addWallCabinet(project, { name: 'Wall cabinet' })),
    add: (project, name) => addWallCabinet(project, { name }),
  },
  {
    id: 'tall',
    examples: 'tall',
    group: 'cabinets',
    title: 'A tall cabinet',
    what: 'Doors over doors, floor to above head height: a pantry.',
    name: 'Tall cabinet',
    stem: 'Tall cabinet',
    example: true,
    shape: only((project) => addTallCabinet(project, { name: 'Tall cabinet' })),
    add: (project, name) => addTallCabinet(project, { name }),
  },
  {
    id: 'vanity',
    examples: 'vanity',
    group: 'cabinets',
    title: 'A bathroom vanity',
    what: '30" wide and 21" deep, a bought top with its sink, and a roll-out tray under it.',
    name: 'Vanity',
    stem: 'Vanity',
    example: true,
    shape: asVanity,
    add: (project, name, like) => {
      const added = addCabinet(project, { name, width: len('30"'), layout: 'doors', ...(like ? { like } : {}) });
      asVanity(project, added);
      return cabinetsOf(project).find((c) => c.id === added.id)!;
    },
  },
  {
    id: 'corner',
    examples: 'corner',
    group: 'cabinets',
    title: 'A corner cabinet',
    what: 'Diagonal across the corner, 36" along each wall; blind and L-shaped ones are a choice in Design.',
    name: 'Corner cabinet',
    stem: 'Corner cabinet',
    example: true,
    shape: asCorner,
    add: (project, name, like) => {
      const added = addCabinet(project, { name, width: len('36"'), layout: 'doors', ...(like ? { like } : {}) });
      asCorner(project, added);
      return cabinetsOf(project).find((c) => c.id === added.id)!;
    },
  },
  {
    id: 'run',
    examples: 'run',
    group: 'room',
    title: 'A run along a wall',
    what: 'Three base cabinets side by side against a wall, under one countertop.',
    name: 'Run of cabinets',
    shape: (project, cabinet, shop) => {
      const context = contextOf(project);
      context.room = starterRoom();
      const drawers = addCabinet(project, { name: 'Drawers', width: len('18"'), layout: 'drawers', drawers: 3 });
      const doors = addCabinet(project, { name: 'Doors', width: len('30"'), layout: 'doors' });
      const run = createRun(project, [cabinet.id, drawers.id, doors.id]);
      run.ends.left = 'wall';
      run.top = {};
      for (const id of [PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, shop.materialCatalog, id);
    },
  },
  {
    id: 'bookcase',
    prefers: FURNITURE_PRESET_ID,
    examples: 'bookcase',
    group: 'furniture',
    title: 'A bookcase',
    what: 'Open shelves, 32" wide and 72" high, with a fixed shelf half-way up.',
    name: 'Bookcase',
    stem: 'Bookcase',
    example: true,
    settings: (project, shop) => setBottomKind(contextOf(project).settings.toeKick, 'plinth', shop.hardware),
    shape: (project, cabinet, shop) => {
      const tall = addTallCabinet(project, { name: 'Bookcase' });
      deleteCabinet(project, cabinet.id);
      asBookcase(project, tall, shop);
    },
    add: (project, name, _like, shop) => {
      const tall = addTallCabinet(project, { name });
      asBookcase(project, tall, shop ?? NO_SHOP);
      return cabinetsOf(project).find((c) => c.id === tall.id)!;
    },
  },
  {
    id: 'dresser',
    prefers: FURNITURE_PRESET_ID,
    examples: 'dresser',
    group: 'furniture',
    title: 'A dresser',
    what: 'Four drawers, 36" wide, under a top of its own, on feet.',
    name: 'Dresser',
    stem: 'Dresser',
    example: true,
    settings: (project, shop) => setBottomKind(contextOf(project).settings.toeKick, 'feet', shop.hardware),
    shape: asDresser,
    add: (project, name, like, shop) => {
      const added = addCabinet(project, { name, width: len('36"'), layout: 'drawers', drawers: 4, ...(like ? { like } : {}) });
      asDresser(project, added, shop ?? NO_SHOP);
      return cabinetsOf(project).find((c) => c.id === added.id)!;
    },
  },
  {
    id: 'nightstand',
    prefers: FURNITURE_PRESET_ID,
    examples: 'night stand',
    group: 'furniture',
    title: 'A night stand',
    what: 'A drawer over an open shelf, 20" wide and 26" high, on feet.',
    name: 'Night stand',
    stem: 'Night stand',
    example: true,
    settings: (project, shop) => setBottomKind(contextOf(project).settings.toeKick, 'feet', shop.hardware),
    shape: asNightStand,
    add: (project, name, like, shop) => {
      const added = addCabinet(project, { name, width: len('20"'), layout: 'drawerOverDoors', ...(like ? { like } : {}) });
      asNightStand(project, added, shop ?? NO_SHOP);
      return cabinetsOf(project).find((c) => c.id === added.id)!;
    },
  },
  {
    id: 'dresser-legs',
    prefers: FURNITURE_PRESET_ID,
    examples: 'dresser',
    group: 'furniture',
    title: 'A dresser on legs',
    what: 'Four drawers under a top of its own, the case on a frame of legs and aprons.',
    name: 'Dresser on legs',
    example: true,
    settings: onLegFrame,
    shape: asDresser,
  },
  {
    id: 'dresser-posts',
    prefers: FURNITURE_SOLID_PRESET_ID,
    examples: 'dresser',
    group: 'furniture',
    title: 'A wide dresser with corner posts',
    what: 'Eight drawers in two bays, four small ones across the top, between four posts of square stock that run from the floor to the top: sides set in between the posts, rails between the drawers, the fronts inset, on bottom-mount roller slides.',
    name: 'Dresser with posts',
    example: true,
    settings: onCornerPosts,
    shape: asPostDresser,
  },
  {
    id: 'chest-posts',
    prefers: FURNITURE_SOLID_PRESET_ID,
    examples: 'chest',
    group: 'furniture',
    title: 'A tall chest with corner posts',
    what: 'Two small drawers over four wide ones between four posts of square stock, 42" wide and 50" high: sides set in between the posts, a rail between each two drawers, the fronts inset.',
    name: 'Chest with posts',
    example: true,
    settings: onCornerPosts,
    shape: asPostChest,
  },
  {
    id: 'nightstand-legs',
    prefers: FURNITURE_PRESET_ID,
    examples: 'night stand',
    group: 'furniture',
    title: 'A night stand on legs',
    what: 'A drawer over an open shelf, the case on a frame of legs and aprons.',
    name: 'Night stand on legs',
    example: true,
    settings: onLegFrame,
    shape: asNightStand,
  },
  {
    id: 'tvstand',
    prefers: FURNITURE_PRESET_ID,
    examples: 'tv stand',
    group: 'furniture',
    title: 'A TV stand',
    what: 'Low and wide: doors, an open bay for equipment with holes for its cables, doors; on legs.',
    name: 'TV stand',
    stem: 'TV stand',
    example: true,
    settings: onLegFrame,
    shape: asTvStand,
    add: (project, name, like, shop) => {
      const added = addCabinet(project, { name, width: len('60"'), layout: 'doors', ...(like ? { like } : {}) });
      asTvStand(project, added, shop ?? NO_SHOP);
      return cabinetsOf(project).find((c) => c.id === added.id)!;
    },
  },
  {
    id: 'closettower',
    examples: 'closet',
    group: 'furniture',
    title: 'A closet tower',
    what: 'Tall, open and shallow: shelves above, a rod to hang clothes below.',
    name: 'Closet tower',
    stem: 'Closet tower',
    example: true,
    settings: (project, shop) => setBottomKind(contextOf(project).settings.toeKick, 'plinth', shop.hardware),
    shape: (project, cabinet) => {
      const tall = addTallCabinet(project, { name: 'Closet tower' });
      deleteCabinet(project, cabinet.id);
      asClosetTower(project, tall);
    },
    add: (project, name) => {
      const tall = addTallCabinet(project, { name });
      asClosetTower(project, tall);
      return cabinetsOf(project).find((c) => c.id === tall.id)!;
    },
  },
  {
    id: 'closet',
    examples: 'closet',
    group: 'furniture',
    title: 'A closet',
    what: 'A tower of shelves in the middle, and a shelf and a rod from it to the wall each side.',
    name: 'Closet',
    settings: (project, shop) => setBottomKind(contextOf(project).settings.toeKick, 'plinth', shop.hardware),
    shape: (project, cabinet) => {
      const tall = addTallCabinet(project, { name: 'Tower' });
      deleteCabinet(project, cabinet.id);
      asClosetTower(project, tall);
      // Shelves all the way down the tower; the clothes hang either side of it.
      const stored = storedOf(project, tall.id);
      delete stored.rod;
      stored.adjustableShelves = 3;
      const span = () => ({ length: len('30"'), to: 'wall' as const, up: len('68"'), rod: true });
      stored.spans = { left: span(), right: span() };
    },
  },
  table('endtable', 'An end table', 'Four legs, aprons and a top, 22" square and 24" high.', 'End table', TABLE_SIZES.endTable),
  table('coffeetable', 'A coffee table', 'Legs, aprons and a top, 48" long, 24" wide and 18" high.', 'Coffee table', TABLE_SIZES.coffeeTable),
  table('writingdesk', 'A writing desk', 'A table at a desk\'s height: legs, aprons and a top, 48" long and 24" wide, open underneath.', 'Writing desk', TABLE_SIZES.desk),
  {
    id: 'desk',
    prefers: FURNITURE_PRESET_ID,
    examples: 'desk',
    group: 'furniture',
    title: 'A pedestal desk',
    what: 'A bank of three drawers each side, 28" of knee space between them, under one top.',
    name: 'Pedestal desk',
    settings: (project, shop) => setBottomKind(contextOf(project).settings.toeKick, 'plinth', shop.hardware),
    shape: asPedestalDesk,
  },
  {
    id: 'deskhutch',
    prefers: FURNITURE_PRESET_ID,
    examples: 'hutch',
    group: 'furniture',
    title: 'A desk with a hutch',
    what: 'A writing desk, and standing at the back of its top a shallow case of open shelves.',
    name: 'Desk with a hutch',
    shape: (project, cabinet, shop) => {
      const desk = addTable(project, shop, { name: 'Writing desk', size: TABLE_SIZES.desk });
      // The hutch: as long as the desk, 30" high and 10" deep, two bays of open shelves with a shelf in each.
      const hutch = addWallCabinet(project, { name: 'Hutch', width: len('48"'), height: len('30"'), depth: len('10"') });
      deleteCabinet(project, cabinet.id);
      const at = () => cabinetsOf(project).find((c) => c.id === hutch.id)!;
      setBays(project, at(), 2);
      setRowOpen(project, at(), at().layout.rows[0]!.id, true);
      storedOf(project, hutch.id).adjustableShelves = 1;
      standOn(project, hutch.id, desk.id, project.materials, shop.hardware);
    },
  },
  // A torsion box on a frame of legs and aprons: 3×3 legs, a bench top's 3/4" skins
  // 3" over the legs all round, to clamp to, and a shelf low down.
  assemblyTable(),
  // A classic drop-leaf table: a 10" leaf along each long side, each on two brackets hinged to the apron.
  dropLeafTable(),
  // Its long aprons want something lower down to stiffen them: a shelf 6" off the floor.
  table('sofatable', 'A sofa table', 'A console behind a sofa: 54" long, 12" wide and 30" high, with a lower shelf.', 'Sofa table', TABLE_SIZES.sofaTable, '6"'),
  { id: 'kitchen', examples: 'kitchen', group: 'room', title: 'A kitchen', what: 'A room to fill: base runs round a corner, wall cabinets over them.', name: 'Kitchen', project: createKitchenProject },
  { id: 'island', examples: 'island', group: 'room', title: 'An island', what: 'Two rows of cabinets back to back, standing free under one top.', name: 'Island', project: createIslandProject },
  {
    id: 'newfronts',
    examples: 'new doors',
    group: 'existing',
    title: 'New doors and drawer fronts',
    what: 'A cabinet that stays: measure its openings, and its new fronts are made to fit.',
    name: 'New doors',
    existing: true,
    project: createVanityProject,
  },
  {
    id: 'organizers',
    examples: 'tray',
    group: 'existing',
    title: 'Roll-out trays inside',
    what: 'A cabinet that stays, measured inside: trays on slides behind its doors.',
    name: 'Roll-out trays',
    existing: true,
    shape: (project, cabinet) => {
      applyCabinetLayout(project, cabinet, 'doors');
      const stored = storedOf(project, cabinet.id);
      const tray = createOrganizer('tray');
      stored.inside = { obstacles: [], organizers: [tray, { ...createOrganizer('tray', [tray]), up: len('10"') }] };
      makeExisting(project, cabinet.id, 'kept');
    },
  },
  {
    id: 'undersink',
    examples: 'sink',
    group: 'existing',
    title: 'Under a sink',
    what: 'A sink cabinet that stays: trays cut round its plumbing.',
    name: 'Under a sink',
    existing: true,
    shape: (project, cabinet) => {
      const stored = storedOf(project, cabinet.id);
      stored.size.width = len('30"');
      applyCabinetLayout(project, cabinet, 'doors');
      stored.inside = createUnderSink({ bottomTray: true, upper: 'tray' });
      makeExisting(project, cabinet.id, 'kept');
    },
  },
  { id: 'shopcabinet', examples: 'shop cabinet', group: 'shop', title: 'A shop cabinet', what: 'A plain, strong cabinet for the shop: a drawer over doors.', name: 'Shop cabinet', prefers: SHOP_PRESET_ID },
  {
    id: 'casters',
    examples: 'casters',
    group: 'shop',
    title: 'A cabinet on casters',
    what: 'A cabinet that rolls: four casters under it, the front two locking.',
    name: 'Cabinet on casters',
    prefers: SHOP_PRESET_ID,
    shape: (project, _cabinet, shop) => setBottomKind(contextOf(project).settings.toeKick, 'casters', shop.hardware),
  },
  { id: 'shopwall', examples: 'shop cabinets', group: 'shop', title: 'A wall of shop cabinets', what: 'Three shop cabinets in one project, cut as one job.', name: 'Shop wall', prefers: SHOP_PRESET_ID, project: createShopWallProject },
  { id: 'shoptable', examples: 'table', group: 'shop', title: 'A shop table', what: 'A torsion table over cabinets at its two ends.', name: 'Shop table', fixed: true, project: createShopTableProject },
  { id: 'jigs', group: 'small', title: 'Jigs, handles and drawer inserts', what: 'Printed and cut things that need no project.', to: '/jigs' },
];

export const starterById = (id: string | undefined): Starter | undefined => STARTERS.find((s) => s.id === id);
/** The starters Design's Add offers: the ones that can be added to a project of cabinets. */
export const addableStarters = (): Starter[] => STARTERS.filter((s) => s.add);

/**
 * A new project of a starter in a style: the starter's thing, built with everything the preset sets. A single
 * cabinet starts at the preset's start size and stands in no room; a room of cabinets brings its room.
 * `fellBack` says which of the preset's values the shop could not give.
 */
export function startProject(starter: Starter, preset: Preset, shop: Shop): { project: Project; fellBack: string[] } {
  if (starter.to) throw new Error(`"${starter.title}" needs no project.`);
  const project = starter.project ? starter.project() : createBaseCabinetProject(preset.settings.construction);
  // A whole sample keeps the materials its tops and tables are made of; one cabinet has only the preset's.
  if (!starter.project) project.materials = [];
  const fellBack = starter.fixed ? [] : applyPreset(project, preset, shop);
  if (!starter.fixed) project.plan.blank.materialId = contextOf(project).fronts.doors.materialId;
  if (!starter.project) {
    const cabinet = cabinetsOf(project)[0]!;
    const { height, depth } = contextOf(project).sizes.base;
    const stored = storedOf(project, cabinet.id);
    stored.size.height = { ...height };
    stored.size.depth = { ...depth };
    starter.settings?.(project, shop);
    starter.shape?.(project, cabinetsOf(project)[0]!, shop);
  }
  if (starter.name) project.name = starter.name;
  // The one piece of a project started as a thing carries the thing's name.
  const pieces = contextOf(project).pieces;
  if (!starter.project && starter.name && pieces.length === 1) pieces[0]!.name = starter.name;
  project.starter = starter.id;
  return { project, fellBack };
}

/**
 * Setup's example for a project: the thing its starter makes, in place of the usual base cabinet, when
 * that is one cabinet (`example`). `example` is `setupExample`'s project, changed in place.
 */
export function shapeExample(example: Project, starterId: string | undefined, shop: Shop): Project {
  const starter = starterById(starterId);
  if (starter?.example && starter.shape && cabinetsOf(example)[0]) starter.shape(example, cabinetsOf(example)[0]!, shop);
  return example;
}
