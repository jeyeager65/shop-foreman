import { createDrawerBoxDefaults } from '@/design/drawerBox';
import { createJoineryDefaults } from '@/design/joints';
import { DOOR_ROW_ID, type LayoutPreset, UPPER_DOOR_ROW_ID, drawerRowId, layoutsOf, presetLayout } from '@/design/layout';
import { measureCase, takesExisting } from '@/design/existingShell';
import { designsOf } from '@/design/frontSettings';
import { createRun, runOf, tidyRuns } from '@/design/runs';
import { cabinetsOf } from '@/design/settings';
import { starterRoom } from '@/design/room';
import { starterWallTile } from '@/design/roomLook';
import { BAY_COUNT, SPLIT_MOST, layoutOpeningIds } from '@/design/bays';
import { lightTopTable } from '@/design/torsion';
import { standardStartSizes } from '@/design/sizes';
import { createFramelessDefaults, createShopDefaults } from '@/design/style';
import { BLUM_INSET_HINGE_ID, GENERIC_PULL_ID, GENERIC_SHELF_PIN_ID, GENERIC_SLIDE_ID, MDF_ID, PLYWOOD_1_4_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, CABINET_MATERIALS, MDF_1_4_ID, SKIN_MATERIALS } from '@/libraries';
import { addAppliance } from '@/design/appliances';
import { doorHandleChoice } from '@/design/handles';
import { frontOf, starterTopSettings } from '@/design/tops';
import { PROJECT_VERSION } from '@/model';
import type { CabinetDesign, CabinetSink, CabinetForm, ConstructionStyle, DesignedCabinetContext, DoorSettings, DrawerSettings, Id, Length, Project, StoredCabinet, StoredDoorSet, StoredDrawer, StoredPiece } from '@/model';
import { len } from '@/units';
import { storedCases } from '@/design/settings';

/** Blum Compact, 1/2" overlay: the face frame hinge agreed for the reference job. */
export const CABINET_HINGE_ID = 'blum-compact-38n-1-2-soft-screw';

/**
 * How a project's doors start: one-piece shaker doors in MDF on the reference job's
 * face frame hinge. Every value can be changed in Design.
 */
export function createDoorSettings(): DoorSettings {
  return {
    style: {
      kind: 'shaker',
      frameWidth: len('2-1/4"'),
      recessDepth: len('1/4"'),
      insideEdge: { kind: 'vBevel', angleDeg: 60 },
      floorCornerRadius: len('1/16"'),
    },
    outsideEdge: { kind: 'roundover', radius: len('1/8"') },
    materialId: MDF_ID,
    hingeId: CABINET_HINGE_ID,
  };
}

/**
 * How a project's drawers start: a one-piece front with the style, edge and material
 * of the doors (`like`), and a rabbeted plywood box on the generic side-mount slide
 * (on build-out strips behind a face frame).
 */
export function createDrawerSettings(like: Pick<DoorSettings, 'style' | 'outsideEdge' | 'materialId'> = createDoorSettings()): DrawerSettings {
  const { cornerJoint, materials } = createDrawerBoxDefaults();
  return {
    // A plain copy: `like` may be inside Vue's reactive proxy, which structuredClone refuses.
    front: JSON.parse(JSON.stringify({ style: like.style, outsideEdge: like.outsideEdge, materialId: like.materialId })) as DrawerSettings['front'],
    slideId: GENERIC_SLIDE_ID,
    faceFrameMount: 'strips',
    cornerJoint,
    materials,
  };
}

/**
 * A pair of doors for a cabinet's door opening, with the reference job's values:
 * 1/2" overlay top and bottom. What they look like and hang on is the project's.
 */
export function createCabinetDoorSet(openingId: Id, id: Id = 'doors-1'): StoredDoorSet {
  return {
    id,
    template: 'doorSet',
    name: 'Doors',
    mounting: { openingId, type: 'overlay', doors: 2, gap: len('1/8"'), overlayTop: len('1/2"'), overlayBottom: len('1/2"') },
  };
}

/**
 * A drawer for a cabinet's drawer opening, at the longest slide length that fits and
 * the box height its opening gives. 1/2" over the opening top and bottom; at the
 * sides it follows the doors until it is given its own overlay. Its front, slide and
 * box corners are the project's.
 */
export function createCabinetDrawer(openingId: Id, id: Id = 'drawer-1'): StoredDrawer {
  return {
    id,
    template: 'drawer',
    name: 'Drawer',
    mounting: { openingId, type: 'overlay', overlayTop: len('1/2"'), overlayBottom: len('1/2"') },
    slide: {},
    box: {},
  };
}

/**
 * Gives the cabinet a preset layout and the fronts its rows need. A row with nothing
 * on it gets a door set with the starter values, or a drawer that copies the
 * cabinet's first drawer as it is stored (the starter values when it has none).
 * Nothing is removed: the doors and drawers of rows that are gone stay in the
 * project, unmounted, and come back with their row. Drawers are named by their place
 * when there are several.
 */
export function applyCabinetLayout(project: Project, cabinet: CabinetDesign, preset: LayoutPreset, drawers?: number): void {
  if (cabinet.form === 'wall' && preset !== 'doors') throw new Error('A wall cabinet has doors only.');
  if (!layoutsOf(cabinet.form).includes(preset)) throw new Error('Doors over doors is a tall cabinet\'s layout.');
  // Bays are kept across a change of layout (milestone 10).
  const bays = cabinet.layout.bays;
  cabinet.layout = { ...presetLayout(preset, drawers, cabinet.layout), ...(bays ? { bays } : {}) };
  addLayoutFronts(project, cabinet);
}

/** After the id of the opening a door set hung on, while its row is open: no opening has that id, so nothing is made of it. */
const DOORS_OFF = ':off';

/**
 * Gives every opening of the cabinet's layout (every row, in every bay) a front when it has
 * none: a door set with the starter values, or a copy of the cabinet's first drawer. A bay
 * after the first names its fronts by it ("Doors, bay 2").
 */
export function addLayoutFronts(project: Project, cabinet: CabinetDesign): void {
  const on = (openingId: Id) => project.designObjects.find((d) => d.mounting.openingId === openingId);
  const freeId = (base: string) => {
    for (let n = 1; ; n++) if (!project.designObjects.some((d) => d.id === `${base}-${n}`)) return `${base}-${n}`;
  };
  const first = project.designObjects.find((d) => d.template === 'drawer' && d.mounting.openingId.startsWith(`${cabinet.id}/`));
  const drawerRows = cabinet.layout.rows.filter((r) => r.use === 'drawer');
  for (const { id: openingId, rowId, bay, part, of } of layoutOpeningIds(cabinet)) {
    const row = cabinet.layout.rows.find((r) => r.id === rowId)!;
    // An open row's doors are off: the door set is parked on an opening that is not there, which is how
    // a front with no row is kept everywhere, and comes back to its opening when the row is no longer open.
    const hung = on(openingId);
    const parked = on(openingId + DOORS_OFF);
    if (row.use === 'doors' && (row.open || cabinet.layout.bays?.[bay - 1]?.open)) {
      if (hung) hung.mounting.openingId = openingId + DOORS_OFF;
      continue;
    }
    if (!hung && parked) parked.mounting.openingId = openingId;
    if (!on(openingId)) {
      if (row.use === 'doors') project.designObjects.push(createCabinetDoorSet(openingId, freeId('doors')));
      else if (first) {
        // A plain copy: the project may be Vue's reactive proxy, which structuredClone refuses.
        const copy = JSON.parse(JSON.stringify(first)) as typeof first;
        project.designObjects.push({ ...copy, id: freeId('drawer'), mounting: { ...copy.mounting, openingId } } as typeof first);
      }
      else project.designObjects.push(createCabinetDrawer(openingId, freeId('drawer')));
    }
    const drawer = on(openingId);
    const ofBay = bay > 1 ? `, bay ${bay}` : '';
    // One of a split row's drawers says which it is, as its opening does: "Drawer 1, left".
    const ofSplit = of === 1 ? '' : of === 2 ? (part === 1 ? ', left' : ', right') : `, ${part}`;
    if (drawer?.template === 'drawer' && /^Drawer( \d+)?(, bay \d+)?(, (left|right|\d+))?$/.test(drawer.name)) {
      drawer.name = (drawerRows.length > 1 ? `Drawer ${drawerRows.indexOf(row) + 1}` : 'Drawer') + ofBay + ofSplit;
    }
    // Two door rows: their doors are the upper and the lower ones, and so are their parts.
    if (drawer?.template === 'doorSet' && /^((Upper|Lower) d|D)oors(, bay \d+)?$/.test(drawer.name)) {
      const doorRows = cabinet.layout.rows.filter((r) => r.use === 'doors');
      drawer.name = (doorRows.length < 2 ? 'Doors' : doorRows.indexOf(row) === 0 ? 'Upper doors' : 'Lower doors') + ofBay;
    }
  }
}

/**
 * Takes a door row's doors off, or puts them back: an open row is open shelves. The door
 * set is kept in the project while the row is open and hangs again, as it was, when it is not; a row that never
 * had doors gets a pair with the starter values.
 */
export function setRowOpen(project: Project, cabinet: CabinetDesign, rowId: Id, open: boolean): void {
  const row = cabinet.layout.rows.find((r) => r.id === rowId);
  if (!row || row.use !== 'doors') throw new Error('Only a row of doors can be open.');
  cabinet.layout = { ...cabinet.layout, rows: cabinet.layout.rows.map((r) => (r.id !== rowId ? r : open ? { ...r, open: true } : (({ open: _open, ...rest }) => rest)(r))) };
  addLayoutFronts(project, cabinetsOf(project).find((c) => c.id === cabinet.id)!);
}

/**
 * Splits a row of drawers into `count` drawers side by side in every bay (1 puts it back), and gives the new openings
 * their drawers. A drawer of a part that is no longer there is kept in the project, unmounted, as any front with no opening.
 */
export function setRowSplit(project: Project, cabinet: CabinetDesign, rowId: Id, count: number): void {
  const row = cabinet.layout.rows.find((r) => r.id === rowId);
  if (!row || row.use !== 'drawer') throw new Error('Only a row of drawers can be split.');
  const n = Math.min(SPLIT_MOST, Math.max(1, Math.floor(count) || 1));
  cabinet.layout = { ...cabinet.layout, rows: cabinet.layout.rows.map((r) => (r.id !== rowId ? r : n > 1 ? { ...r, split: n } : (({ split: _split, ...rest }) => rest)(r))) };
  addLayoutFronts(project, cabinetsOf(project).find((c) => c.id === cabinet.id)!);
}

/**
 * Takes the doors off one bay, or puts them back: an open bay beside bays with doors. The
 * bays are counted from 0, left to right. A cabinet with one bay has none to open: its row is (`setRowOpen`).
 */
export function setBayOpen(project: Project, cabinet: CabinetDesign, bay: number, open: boolean): void {
  const bays = cabinet.layout.bays;
  if (!bays?.[bay]) throw new Error('The cabinet has no such bay.');
  cabinet.layout = { ...cabinet.layout, bays: bays.map((b, i) => (i !== bay ? b : open ? { ...b, open: true } : (({ open: _open, ...rest }) => rest)(b))) };
  addLayoutFronts(project, cabinetsOf(project).find((c) => c.id === cabinet.id)!);
}

/** Sets how many bays the cabinet has (1 to `BAY_COUNT.max`, sharing its width equally) and gives the new ones their fronts. */
export function setBays(project: Project, cabinet: CabinetDesign, count: number): void {
  const n = Math.min(BAY_COUNT.max, Math.max(BAY_COUNT.min, Math.floor(count) || 1));
  const layout = { ...cabinet.layout };
  if (n === 1) delete layout.bays;
  else layout.bays = Array.from({ length: n }, (_, i) => cabinet.layout.bays?.[i] ?? {});
  // Equal shares when the count changes: a typed width may no longer fit. An open bay stays open.
  if (layout.bays) layout.bays = layout.bays.map((b) => (b.open ? { open: true } : {}));
  cabinet.layout = layout;
  addLayoutFronts(project, cabinet);
}

/**
 * Milestone 2's reference job: a base cabinet with one drawer over a pair of
 * doors, the drawer with its box on the generic slide.
 * The fronts carry the face frame's hinge and overlays; frameless, the cabinet's
 * reveal and front gap size them and the generic frameless hinge hangs the doors.
 * `layout` makes it doors only or drawers only (milestone 3's reference jobs).
 */
export function createBaseCabinetProject(construction: ConstructionStyle = 'frameless', layout: LayoutPreset = 'drawerOverDoors', drawers?: number): Project {
  const project = baseCabinetProject(construction);
  if (layout !== 'drawerOverDoors') applyCabinetLayout(project, cabinetsOf(project)[0]!, layout, drawers);
  return project;
}

/**
 * Milestone 3's reference job: a cabinet for the shop, 24" wide x 30" tall x 22-1/2"
 * deep, with a flat bottom, 3/4" plywood, screws through the sides, a 1/4" applied
 * back, one adjustable shelf, and a drawer over a pair of slab doors, all inset.
 */
export function createShopCabinetProject(layout: LayoutPreset = 'drawerOverDoors', drawers?: number): Project {
  const project = createBaseCabinetProject('shop', layout, drawers);
  project.id = 'shop-cabinet';
  project.name = 'Shop cabinet';
  project.slug = 'shop-cabinet';
  // The one cabinet follows the project, so these land in the project's settings.
  const cabinet = cabinetsOf(project)[0]!;
  cabinet.name = 'Shop cabinet';
  cabinet.size.height = len('30"');
  if (project.context.kind === 'designedCabinet') project.context.sizes.base.height = len('30"');
  cabinet.toeKick.off = true;
  cabinet.joinery = { case: 'throughScrews', back: 'applied', backStretcherForm: 'nailer' };
  project.plan.blank.materialId = PLYWOOD_3_4_ID;
  // Its doors hang on Blum's inset hinge; the generic one stays the fallback.
  for (const d of designsOf(project)) if (d.template === 'doorSet') d.mounting.shopHingeId = BLUM_INSET_HINGE_ID;
  return project;
}

/**
 * Setup's example, in place of the project itself, so that a setting is easy to see without a whole kitchen
 * round it: one base cabinet 24" wide, a drawer over two doors, at the project's start size, built with everything the project's
 * cabinets share (its settings, fronts, materials, finish and machine) and none of its own cabinets, runs or
 * room. `top`: under a top as Setup makes them. A project of its own, never saved: the picture only.
 */
export function setupExample(project: Project, own: { top?: boolean } = {}): Project {
  // A plain copy: the project may be Vue's reactive proxy.
  const from = JSON.parse(JSON.stringify(project)) as Project;
  const example = baseCabinetProject(from.context.settings.construction);
  example.id = 'setup-example';
  example.context.settings = from.context.settings;
  example.context.fronts = from.context.fronts;
  example.context.sizes = from.context.sizes;
  if (from.context.tops) example.context.tops = from.context.tops;
  example.materials = from.materials;
  example.settings = from.settings;
  if (from.machineId) example.machineId = from.machineId;
  const cabinet = storedCabinets(example)[0]!;
  cabinet.name = 'Example';
  cabinet.size.height = { ...from.context.sizes.base.height };
  cabinet.size.depth = { ...from.context.sizes.base.depth };
  if (own.top) cabinet.top = {};
  return example;
}

/** The stored cabinets of a project of designed cabinets: the pieces that are cases, to read. A piece is added, moved or taken out in `piecesIn`. */
/** A kitchen's sink: a drop-in 33" × 22", two equal bowls 9" deep. */
export function kitchenSink(): CabinetSink {
  return { mount: 'dropIn', width: len('33"'), depth: len('22"'), bowlDepth: len('9"'), shape: 'rectangle', double: { leftShare: 0.5 } };
}

function storedCabinets(project: Project): StoredCabinet[] {
  return storedCases({ pieces: piecesIn(project) });
}
/** The project's stored pieces, of every kind, as they are stored: what is added to, re-ordered and removed from. */
function piecesIn(project: Project): StoredPiece[] {
  if (project.context.kind !== 'designedCabinet' || !project.context.pieces.length) throw new Error('Not a project of designed cabinets.');
  return project.context.pieces;
}
const freeCabinetId = (cabinets: { id: Id }[]) => {
  for (let n = 1; ; n++) if (!cabinets.some((c) => c.id === `cabinet-${n}`)) return `cabinet-${n}`;
};
const frontsOf = (project: Project, cabinetId: Id) => project.designObjects.filter((d) => d.mounting.openingId.startsWith(`${cabinetId}/`));

/** What a new base cabinet starts as: 24" wide, a drawer over doors. Its height and depth are the project's start size (Setup). */
export const NEW_CABINET = { width: '24"', layout: 'drawerOverDoors' as LayoutPreset };
/** What a new tall cabinet starts as: 24" wide (its height and depth are the project's start size), doors over doors, two shelves behind the lower doors and one behind the upper. Tune me. */
export const NEW_TALL_CABINET = { width: '24"', shelves: 2, upperShelves: 1, layout: 'doorsOverDoors' as LayoutPreset };
/** What a new wall cabinet starts as: 30" wide (its height and depth are the project's start size), doors only, two shelves, its bottom 54" off the floor. Tune me. */
export const NEW_WALL_CABINET = { width: '30"', offFloor: '54"', shelves: 2, layout: 'doors' as LayoutPreset };

/** The size a new cabinet of a form starts at: the project's (Setup), else the standard one. */
function startSize(project: Project, form: CabinetForm): { height: Length; depth: Length } {
  const sizes = project.context.kind === 'designedCabinet' ? project.context.sizes : undefined;
  const size = sizes?.[form] ?? standardStartSizes()[form];
  return { height: { ...size.height }, depth: { ...size.depth } };
}

/**
 * Adds a cabinet to a project of designed cabinets, with the fronts its layout needs.
 * It follows the project's settings; its height and depth are the project's start size
 * for a base cabinet (Setup), its number of shelves that of the cabinet `like` (the
 * project's first base cabinet when left out), and it goes at the end of the list.
 */
export function addCabinet(project: Project, own: { name: string; width: Length; layout: LayoutPreset; drawers?: number; height?: Length; like?: Id }): CabinetDesign {
  const cabinets = storedCabinets(project);
  // A base cabinet is not sized after a wall cabinet: the first on the floor, if there is one.
  const like = cabinets.find((c) => c.id === own.like && c.form === 'base') ?? cabinets.find((c) => c.form === 'base') ?? cabinets[0]!;
  const id = freeCabinetId(cabinets);
  const size = startSize(project, 'base');
  piecesIn(project).push({
    kind: 'case',
    id,
    name: own.name,
    form: 'base',
    size: { width: own.width, height: own.height ?? size.height, depth: size.depth },
    sides: { left: 'exposed', right: 'exposed' },
    adjustableShelves: like.form === 'base' ? like.adjustableShelves : 1,
    layout: { rows: [] },
    quantity: 1,
  });
  const cabinet = cabinetsOf(project).find((c) => c.id === id)!;
  applyCabinetLayout(project, cabinet, own.layout, own.drawers);
  return cabinet;
}

/**
 * Adds a wall cabinet: a pair of doors over its whole front, hung the way the project
 * hangs its wall cabinets. It starts at the project's start size for a wall cabinet.
 */
export function addWallCabinet(project: Project, own: { name: string; width?: Length; height?: Length; depth?: Length }): CabinetDesign {
  const cabinets = storedCabinets(project);
  const id = freeCabinetId(cabinets);
  piecesIn(project).push({
    kind: 'case',
    id,
    name: own.name,
    form: 'wall',
    offFloor: len(NEW_WALL_CABINET.offFloor),
    size: { width: own.width ?? len(NEW_WALL_CABINET.width), height: own.height ?? startSize(project, 'wall').height, depth: own.depth ?? startSize(project, 'wall').depth },
    sides: { left: 'exposed', right: 'exposed' },
    adjustableShelves: NEW_WALL_CABINET.shelves,
    layout: { rows: [] },
    quantity: 1,
  });
  const cabinet = cabinetsOf(project).find((c) => c.id === id)!;
  applyCabinetLayout(project, cabinet, NEW_WALL_CABINET.layout);
  return cabinet;
}

/**
 * Adds a tall cabinet: doors over doors with a fixed shelf between them, on the
 * project's toe kick. It starts at the project's start size for a tall cabinet.
 */
export function addTallCabinet(project: Project, own: { name: string; width?: Length; height?: Length; depth?: Length; layout?: LayoutPreset }): CabinetDesign {
  const cabinets = storedCabinets(project);
  const id = freeCabinetId(cabinets);
  piecesIn(project).push({
    kind: 'case',
    id,
    name: own.name,
    form: 'tall',
    size: { width: own.width ?? len(NEW_TALL_CABINET.width), height: own.height ?? startSize(project, 'tall').height, depth: own.depth ?? startSize(project, 'tall').depth },
    sides: { left: 'exposed', right: 'exposed' },
    adjustableShelves: NEW_TALL_CABINET.shelves,
    layout: { rows: [] },
    quantity: 1,
  });
  const cabinet = cabinetsOf(project).find((c) => c.id === id)!;
  applyCabinetLayout(project, cabinet, own.layout ?? NEW_TALL_CABINET.layout);
  const upper = cabinet.layout.rows.find((r) => r.id === UPPER_DOOR_ROW_ID);
  if (upper) upper.shelves = NEW_TALL_CABINET.upperShelves;
  return cabinet;
}

/**
 * A copy of a cabinet, placed after it: its own values, its own settings where it has
 * them, and every front it has (those waiting for a row its layout no longer has as
 * well), under new ids.
 */
export function copyCabinet(project: Project, cabinetId: Id): CabinetDesign {
  const cabinets = storedCabinets(project);
  const at = cabinets.findIndex((c) => c.id === cabinetId);
  if (at < 0) throw new Error(`Cabinet not found: ${cabinetId}`);
  // Plain copies: the project may be Vue's reactive proxy, which structuredClone refuses.
  const plain = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;
  const id = freeCabinetId(cabinets);
  const names = new Set(cabinets.map((c) => c.name));
  let name = `${cabinets[at]!.name} copy`;
  for (let n = 2; names.has(name); n++) name = `${cabinets[at]!.name} copy ${n}`;
  // After its original, among the pieces of every kind.
  const pieces = piecesIn(project);
  pieces.splice(pieces.findIndex((p) => p.id === cabinetId) + 1, 0, { ...plain(cabinets[at]!), id, name });
  // In a run, the copy stands beside its original: alike cabinets in a run are made this way.
  const run = project.context.kind === 'designedCabinet' ? runOf(project.context, cabinetId) : undefined;
  if (run) run.cabinetIds.push(id);
  tidyRuns(project);
  for (const front of frontsOf(project, cabinetId)) {
    const base = front.template === 'doorSet' ? 'doors' : 'drawer';
    let n = 1;
    while (project.designObjects.some((d) => d.id === `${base}-${n}`)) n++;
    const copy = plain(front);
    project.designObjects.push({ ...copy, id: `${base}-${n}`, mounting: { ...copy.mounting, openingId: `${id}/${front.mounting.openingId.slice(cabinetId.length + 1)}` } } as typeof front);
  }
  return cabinetsOf(project).find((c) => c.id === id)!;
}

/** Removes a cabinet and its fronts. A project keeps at least one cabinet. */
export function deleteCabinet(project: Project, cabinetId: Id): void {
  const cabinets = storedCabinets(project);
  const at = cabinets.findIndex((c) => c.id === cabinetId);
  if (at < 0) throw new Error(`Cabinet not found: ${cabinetId}`);
  const pieces = piecesIn(project);
  if (pieces.length === 1) throw new Error('A project keeps at least one cabinet.');
  const gone = new Set(frontsOf(project, cabinetId).map((d) => d.id));
  pieces.splice(pieces.findIndex((p) => p.id === cabinetId), 1);
  project.designObjects = project.designObjects.filter((d) => !gone.has(d.id));
  tidyRuns(project);
}

/** Moves a cabinet one place earlier (-1) or later (1) in the list; at the end it stays. */
export function moveCabinet(project: Project, cabinetId: Id, by: -1 | 1): void {
  const cabinets = storedCabinets(project);
  const at = cabinets.findIndex((c) => c.id === cabinetId);
  const to = at + by;
  if (at < 0 || to < 0 || to >= cabinets.length) return;
  // Among the cabinets: it changes places with the one before or after it, wherever a piece of another kind stands.
  const pieces = piecesIn(project);
  const [from, into] = [pieces.findIndex((p) => p.id === cabinets[at]!.id), pieces.findIndex((p) => p.id === cabinets[to]!.id)];
  [pieces[from], pieces[into]] = [pieces[into]!, pieces[from]!];
  // A run's cabinets stand in the order of the list.
  tidyRuns(project);
}

/**
 * Three cabinets for a wall of the shop, in one project and cut as one job: a 24"
 * cabinet of three drawers, the 30" drawer over doors, and another 24" of three
 * drawers. All in the shop style, 30" tall with flat bottoms.
 */
export function createShopWallProject(): Project {
  const project = createShopCabinetProject('drawers', 3);
  project.id = 'shop-wall';
  project.name = 'Shop wall';
  project.slug = 'shop-wall';
  cabinetsOf(project)[0]!.name = 'Drawers, left';
  addCabinet(project, { name: 'Drawer over doors', width: len('30"'), layout: 'drawerOverDoors' });
  addCabinet(project, { name: 'Drawers, right', width: len('24"'), layout: 'drawers', drawers: 3 });
  return project;
}

/**
 * Milestone 4's reference job: a wall of the shop in one project, all in the shop
 * style in 3/4" plywood, cut as one job.
 *  - The bench run, on the floor, its left end against a wall and its right end open,
 *    108" to fill: A, 24", three drawers; B, 30", a drawer over doors (milestone 3's
 *    cabinet); C, a copy of A; D, a tall cabinet 24" x 84", doors over doors. The base
 *    cabinets are 30" tall with flat bottoms; a filler takes up the 6" left at the wall.
 *  - The wall run, both ends open: E and F, 30" x 30" x 12", doors only, F a copy of E.
 *  - On its own: G, a 24" base cabinet, doors only, made twice.
 * The stock on hand is a full sheet: the tall cabinet's sides are tiled. It stands in a
 * 12' × 10' room (milestone 6): the bench run on the back wall, the wall run over it.
 */
export function createShopReferenceProject(): Project {
  const project = createShopCabinetProject('drawers', 3);
  project.id = 'shop-reference';
  project.name = 'Shop wall, reference job';
  project.slug = 'shop';
  cabinetsOf(project)[0]!.name = 'Drawers';
  const b = addCabinet(project, { name: 'Drawer over doors', width: len('30"'), layout: 'drawerOverDoors' });
  const c = copyCabinet(project, 'cabinet-1');
  moveCabinet(project, c.id, 1);
  const d = addTallCabinet(project, { name: 'Tall' });
  const bench = createRun(project, ['cabinet-1', b.id, c.id, d.id], 'Bench run');
  bench.ends.left = 'wall';
  bench.length = len('108"');
  const e = addWallCabinet(project, { name: 'Wall cabinet' });
  const f = copyCabinet(project, e.id);
  const wall = createRun(project, [e.id, f.id], 'Wall run');
  // Milestone 6: the shop is a 12' × 10' room. The bench run stands against the back wall from its
  // left corner, the wall run over it, and G after the bench run.
  if (project.context.kind === 'designedCabinet') project.context.room = starterRoom();
  bench.placement = { wall: 'back', along: len('0"') };
  wall.alignedWith = bench.id;
  const g = addCabinet(project, { name: 'Doors', width: len('24"'), layout: 'doors' });
  g.quantity = 2;
  project.plan.blank.stock = { width: len('48"'), height: len('96"') };
  return project;
}

/**
 * Milestone 4's second reference job, for the styles together: a run of two face frame
 * base cabinets between two walls, 51" to fill. Each keeps its own frame; the sides
 * are all hidden; a 1-1/2" filler stands at each end.
 */
export function createFaceFrameRunProject(): Project {
  const project = createBaseCabinetProject('faceFrame');
  project.id = 'face-frame-run';
  project.name = 'Face frame run';
  project.slug = 'frame-run';
  cabinetsOf(project)[0]!.name = 'Left';
  const right = copyCabinet(project, 'cabinet-1');
  right.name = 'Right';
  const run = createRun(project, ['cabinet-1', right.id], 'Between the walls');
  run.ends = { left: 'wall', right: 'wall' };
  run.length = len('51"');
  return project;
}

function baseCabinetProject(construction: ConstructionStyle): Project {
  const now = '2026-11-11T00:00:00.000Z';
  return {
    schemaVersion: PROJECT_VERSION,
    id: 'base-cabinet',
    name: 'Base cabinet, drawer over doors',
    slug: 'base-cabinet',
    createdAt: now,
    updatedAt: now,
    context: {
      kind: 'designedCabinet',
      settings: {
        construction,
        materials: { caseId: PLYWOOD_3_4_ID, backId: PLYWOOD_1_4_ID },
        faceFrame: { stileWidth: len('1-1/2"'), railWidth: len('1-1/2"'), materialId: SOLID_WOOD_3_4_ID },
        frameless: createFramelessDefaults(),
        shop: createShopDefaults(),
        joinery: createJoineryDefaults(),
        toeKick: { height: len('4-1/2"'), depth: len('3"') },
        shelfPinId: GENERIC_SHELF_PIN_ID,
        hanging: 'rails',
      },
      fronts: { doors: createDoorSettings(), drawers: createDrawerSettings() },
      runs: [],
      sizes: standardStartSizes(),
      pieces: [
        {
          kind: 'case',
          id: 'cabinet-1',
          name: 'Base cabinet',
          form: 'base',
          size: { width: len('24"'), height: len('34-1/2"'), depth: len('22-1/2"') },
          sides: { left: 'exposed', right: 'exposed' },
          adjustableShelves: 1,
          layout: {
            rows: [
              { id: 'drawer', use: 'drawer', height: len('6"') },
              { id: 'doors', use: 'doors' },
            ],
          },
          quantity: 1,
        },
      ],
    },
    designObjects: [createCabinetDoorSet('cabinet-1/doors'), createCabinetDrawer('cabinet-1/drawer')],
    plan: {
      strategy: 'fastest',
      blank: { materialId: MDF_ID },
      operations: {},
    },
    materials: structuredClone(CABINET_MATERIALS),
    settings: {},
  };
}

/**
 * Milestone 6's reference job: a small kitchen in a 12' × 10' room, frameless with shaker
 * doors. An L of base runs turns the back-left corner: the back run starts with a 42"
 * blind corner cabinet, blind on its left, then a 36" sink base and an 18" bank of three
 * drawers; the left run, a 24" drawer over doors and a 15" door cabinet, ends against the
 * blind cabinet's blind panel. A wall run stands over each: two 30" wall cabinets over the
 * back run, one 36" over the left run.
 */
export function createKitchenProject(): Project {
  const project = createBaseCabinetProject('frameless', 'doors');
  project.id = 'kitchen';
  project.name = 'Kitchen';
  project.slug = 'kitchen';
  const context = project.context as DesignedCabinetContext;
  context.room = starterRoom();
  const blind = cabinetsOf(project)[0]!;
  blind.name = 'Blind corner';
  // 42" wide, one door hinged on the side away from the blind.
  makeBlind(project, blind.id, 'left');
  const sink = addCabinet(project, { name: 'Sink base', width: len('36"'), layout: 'doors' });
  const drawers = addCabinet(project, { name: 'Drawers', width: len('18"'), layout: 'drawers', drawers: 3 });
  const back = createRun(project, ['cabinet-1', sink.id, drawers.id], 'Back run');
  back.placement = { wall: 'back', along: len('0"') };
  const a = addCabinet(project, { name: 'Drawer over doors', width: len('24"'), layout: 'drawerOverDoors' });
  const b = addCabinet(project, { name: 'Doors', width: len('15"'), layout: 'doors' });
  const left = createRun(project, [a.id, b.id], 'Left run');
  // Its right end stops at the front of the back run's doors, over the blind panel.
  const backFront = blind.size.depth.mm + 21;
  left.placement = { wall: 'left', along: { mm: context.room.width.mm - backFront - len('39"').mm, unit: 'in' } };
  const w1 = addWallCabinet(project, { name: 'Wall, back' });
  const w2 = copyCabinet(project, w1.id);
  const overBack = createRun(project, [w1.id, w2.id], 'Wall run, back');
  overBack.alignedWith = back.id;
  const w3 = addWallCabinet(project, { name: 'Wall, left', width: len('36"') });
  const overLeft = createRun(project, [w3.id], 'Wall run, left');
  overLeft.alignedWith = left.id;
  // Cut from half sheets: a 36" cabinet's back is too wide for the machine profile's quarter sheet.
  project.plan.blank.stock = { width: len('48"'), height: len('48"') };
  return project;
}

/**
 * "A kitchen" on the samples page (a common kitchen layout, with a sink, a stove, a dishwasher, a fridge and a
 * microwave over the stove): an L of two walls and an island,
 * in a 13' 6" × 12' room, the base cabinets 24" deep, frameless with shaker fronts painted white, bought laminate tops. Every size is a usual one.
 *
 * - **The range wall** (the back wall), left to right: 12" of wall for the fridge's door to open, the fridge (36"), an 18" bank of drawers, the range (30") with
 *   the microwave over it, an 18" bank of drawers, and a 48" blind corner cabinet, its blind behind the sink wall's run.
 * - **The sink wall** (the right wall), from the corner forward: a 36" sink base under a window, the dishwasher (24")
 *   and an 18" drawer over a door.
 * - **Uppers**, their tops at 84": a short one over the fridge, one beside it, a short one over the microwave, one
 *   beside that and a diagonal corner cabinet; on the sink wall one by the corner, the window, and two past it.
 * - **An island** facing the range: a 36" bank of drawers and a 30" door cabinet under one top, a finished back to the room.
 */
export function createCommonKitchenProject(): Project {
  const project = createBaseCabinetProject('frameless', 'drawers', 3);
  project.id = 'common-kitchen';
  project.name = 'Kitchen';
  project.slug = 'common-kitchen';
  const context = project.context as DesignedCabinetContext;
  // 12" of wall left of the fridge, so that its door can open.
  const F = 12;
  const L = 150 + F;
  context.room = { length: len(`${L}"`), width: len('144"'), ceiling: len('96"') };
  const inch = (n: number): Length => len(`${n}"`);
  const stored = (id: Id) => storedCases(context).find((c) => c.id === id)!;
  const oneDoor = (cabinetId: Id, hinge: 'left' | 'right') => {
    for (const d of project.designObjects) {
      if (d.template !== 'doorSet' || !d.mounting.openingId.startsWith(`${cabinetId}/`)) continue;
      d.mounting.doors = 1;
      d.mounting.hingeSide = hinge;
    }
  };
  const place = (cabinetId: Id, wall: 'back' | 'right', along: number) => {
    stored(cabinetId).placement = { wall, along: inch(along) };
  };
  // Base cabinets 24" deep, the usual: a 22" sink then sits behind the case front (in a 22-1/2" one its bowl showed through the doors).
  const sizes = standardStartSizes();
  context.sizes = { ...sizes, base: { ...sizes.base, depth: inch(24) } };
  stored('cabinet-1').size.depth = inch(24);
  const depth = stored('cabinet-1').size.depth.mm;
  /** In front of a run's doors: its case and the doors on it. */
  const runFront = (depth + 21) / 25.4;

  // The range wall: the fridge 0–36", drawers to 54", the range to 84", drawers to 102", the blind corner (48", for a door of a useful width) to the sink wall.
  const byFridge = cabinetsOf(project)[0]!;
  stored(byFridge.id).name = 'Drawers by the fridge';
  stored(byFridge.id).size.width = inch(18);
  place(byFridge.id, 'back', F + 36);
  stored(byFridge.id).top = {};
  const byRange = addCabinet(project, { name: 'Drawers by the range', width: inch(18), layout: 'drawers', drawers: 3 });
  const blind = addCabinet(project, { name: 'Blind corner', width: inch(48), layout: 'doors' });
  makeBlind(project, blind.id, 'right');
  const rangeRun = createRun(project, [byRange.id, blind.id], 'Range wall');
  rangeRun.placement = { wall: 'back', along: inch(F + 84) };
  rangeRun.top = {};

  // The sink wall, from the blind corner's panel: on the right wall, `along` is from the back wall.
  const sink = addCabinet(project, { name: 'Sink base', width: inch(36), layout: 'doors' });
  place(sink.id, 'right', runFront);
  stored(sink.id).top = {};
  stored(sink.id).adjustableShelves = 0;
  const sinkEnd = runFront + 36;
  // The dishwasher, 24", then the end of the wall's cabinets.
  const end = addCabinet(project, { name: 'By the dishwasher', width: inch(18), layout: 'drawerOverDoors' });
  oneDoor(end.id, 'left');
  place(end.id, 'right', sinkEnd + 24);
  stored(end.id).top = {};

  // The island, facing the range across a 42" aisle: its cabinets' backs to the room.
  const drawers = addCabinet(project, { name: 'Island drawers', width: inch(36), layout: 'drawers', drawers: 3 });
  const doors = addCabinet(project, { name: 'Island doors', width: inch(30), layout: 'doors' });
  const row = createRun(project, [drawers.id, doors.id], 'Island');
  context.islands = [{ id: 'island-1', name: 'Island', rows: [row.id], placement: { x: inch(F + 24 + 66), y: { mm: inch(runFront + 42).mm + depth, unit: 'in' }, turn: 180 }, top: {} }];

  // The uppers, their tops at 84".
  const upper = (name: string, wall: 'back' | 'right', width: number, along: number, opts: { height?: number; doors?: 1; hinge?: 'left' | 'right' } = {}) => {
    const c = addWallCabinet(project, { name, width: inch(width), ...(opts.height ? { height: inch(opts.height) } : {}) });
    stored(c.id).offFloor = inch(84 - (opts.height ?? 30));
    if (opts.doors) oneDoor(c.id, opts.hinge ?? 'left');
    place(c.id, wall, along);
    return c;
  };
  upper('Over the fridge', 'back', 36, F, { height: 15 });
  upper('Beside the fridge', 'back', 18, F + 36, { doors: 1, hinge: 'left' });
  upper('Over the microwave', 'back', 30, F + 54, { height: 12 });
  upper('Beside the range', 'back', 42, F + 84);
  // The corner: a diagonal wall cabinet, 24" along each wall, one door on its diagonal face.
  const diagonal = upper('Corner, upper', 'back', 24, L - 24);
  stored(diagonal.id).corner = { kind: 'diagonal', side: 'right' };
  applyCabinetLayout(project, cabinetsOf(project).find((c) => c.id === diagonal.id)!, 'doors');
  oneDoor(diagonal.id, 'right');
  // The sink wall: the window over the sink, open between the corner cabinet and the uppers past it.
  upper('Over the dishwasher', 'right', 24, sinkEnd);
  upper('End of the sink wall', 'right', 18, sinkEnd + 24, { doors: 1, hinge: 'right' });

  // The appliances: generic ones, standing in the gaps left for them.
  addAppliance(project, 'refrigerator', { wall: 'back', along: inch(F) }, { width: '35-1/2"', height: '68"' });
  addAppliance(project, 'range', { wall: 'back', along: inch(F + 54) });
  addAppliance(project, 'microwave', { wall: 'back', along: inch(F + 54) }, { offFloor: '55-1/2"' });
  addAppliance(project, 'dishwasher', { wall: 'right', along: inch(sinkEnd) });
  // The sink, centred on its 36" base: a drop-in, two bowls.
  stored(sink.id).sink = kitchenSink();
  // A window over the sink, centred on it: 28" wide (its trim and sill are wider, and stay clear of the uppers each side), its sill at 42", 36" tall.
  context.room.windows = [{ wall: 'right', along: inch(runFront + 18 - 14), width: inch(28), height: inch(36), sill: inch(42) }];
  // How the room looks: white subway tile between the tops and the uppers, round the window, and pale blue walls.
  context.room.look = { wall: '#b9cad6', tile: starterWallTile('subway') };

  // Cut from half sheets, as the other kitchens are.
  project.plan.blank.stock = { width: len('48"'), height: len('48"') };
  // Bought laminate tops, white paint, a pull on every front.
  context.tops = { ...starterTopSettings(), kind: 'bought' };
  // (The tops' colour stands for the laminate's: a charcoal one.)
  project.settings.finish = { caseId: 'paint-white', frontsId: 'paint-white', topsId: 'paint-charcoal' };
  for (const d of designsOf(project)) d.handle = d.template === 'drawer' ? { handleId: GENERIC_PULL_ID } : doorHandleChoice(GENERIC_PULL_ID);
  return project;
}

/**
 * An L-shaped kitchen with a peninsula (every size a guess, tune me): face frame
 * cabinets of plywood with solid wood doors, in a dark stain, wire pulls, bought laminate tops,
 * uppers to a soffit. An L of two walls and a peninsula, in a room that goes on past it.
 *
 * - **The fridge wall** (the back wall), left to right: room for the bin, the fridge (36"), then a
 *   45" blind corner (a drawer over a door), its blind on the right behind the window wall's run.
 * - **The window wall** (the right wall), from the corner forward: an 18" bank of four drawers, a
 *   36" sink base under the window (two bays, a drawer front over a door in each), the dishwasher
 *   (24"), a 12" drawer over a door, and the range (30"), whose side is against the peninsula.
 * - **The peninsula** runs off the window wall beside the range, parallel to the fridge wall. In
 *   the corner, behind the range's side, a 24" drawer over a door faces the dining side; then an
 *   18" and a 30" drawer over a door face into the kitchen (a one-row island, its finished back to
 *   the stools). One top covers it all. The peninsula stands off the range's side by its top's reach,
 *   with a filler board in the space (the corner box's `backFiller`).
 * - **Uppers**, their tops at 84" under the soffit: a short pair over the fridge, a 21" one, and a
 *   24" diagonal corner cabinet; on the window wall a 15" one, the window, two 18" ones, a short one
 *   over the microwave and one over the peninsula's corner.
 *
 * The fridge, the dishwasher, the range and the microwave are generic appliances: the top runs
 * over the dishwasher and stops at the range.
 * Its doors are one piece (a carved shaker in solid wood): it has no rail-and-stile doors yet.
 */
export function createHomeKitchenProject(): Project {
  const project = createBaseCabinetProject('faceFrame', 'doors');
  project.id = 'home-kitchen';
  project.name = 'Home kitchen';
  project.slug = 'home-kitchen';
  const context = project.context as DesignedCabinetContext;
  const L = 99;
  // 8' 3" across the fridge wall; 18' from it to the far side of the stools.
  // Past the peninsula it is open to the next room: there is no wall there.
  context.room = { length: len(`${L}"`), width: len('216"'), ceiling: len('96"'), open: ['front'] };
  // Wood doors and drawer fronts: they are stained.
  context.fronts.doors.materialId = SOLID_WOOD_3_4_ID;
  context.fronts.drawers.front.materialId = SOLID_WOOD_3_4_ID;
  const inch = (n: number): Length => len(`${n}"`);
  const stored = (id: Id) => storedCases(context).find((c) => c.id === id)!;
  /** A door set's cabinet as one door, hinged on `hinge`. */
  const oneDoor = (cabinetId: Id, hinge: 'left' | 'right') => {
    for (const d of project.designObjects) {
      if (d.template !== 'doorSet' || !d.mounting.openingId.startsWith(`${cabinetId}/`)) continue;
      d.mounting.doors = 1;
      d.mounting.hingeSide = hinge;
    }
  };
  const place = (cabinetId: Id, wall: 'back' | 'right', along: number) => {
    stored(cabinetId).placement = { wall, along: inch(along) };
  };
  const depth = stored('cabinet-1').size.depth.mm;
  /** In front of a run's doors: its case, the face frame and the doors. */
  const runFront = (depth + len('1-1/2"').mm) / 25.4;

  // The fridge wall. The bin 0–18", the fridge 18–54", then the blind corner to the window wall.
  const blind = cabinetsOf(project)[0]!;
  stored(blind.id).name = 'Corner, fridge wall';
  applyCabinetLayout(project, blind, 'drawerOverDoors');
  stored(blind.id).size.width = inch(45);
  makeBlind(project, blind.id, 'right');
  oneDoor(blind.id, 'left');
  place(blind.id, 'back', 54);
  stored(blind.id).top = {};

  // The window wall, from the blind corner's panel: on the right wall, `along` is from the back wall.
  const bank = addCabinet(project, { name: 'Drawers in the corner', width: inch(18), layout: 'drawers', drawers: 4 });
  // The sink base: two bays with a stile between, a drawer front over one door in each, the doors hinged at the outside.
  const sink = addCabinet(project, { name: 'Sink base', width: inch(36), layout: 'drawerOverDoors' });
  setBays(project, cabinetsOf(project).find((c) => c.id === sink.id)!, 2);
  for (const d of project.designObjects) {
    if (d.template !== 'doorSet' || !d.mounting.openingId.startsWith(`${sink.id}/`)) continue;
    d.mounting.doors = 1;
    d.mounting.hingeSide = d.mounting.openingId.includes('~b') ? 'right' : 'left';
  }
  const sinkRun = createRun(project, [bank.id, sink.id], 'Window wall');
  sinkRun.placement = { wall: 'right', along: inch(runFront) };
  sinkRun.top = {};
  const sinkEnd = runFront + 18 + 36;
  // The dishwasher, 24".
  const byRange = addCabinet(project, { name: 'By the range', width: inch(12), layout: 'drawerOverDoors' });
  oneDoor(byRange.id, 'left');
  place(byRange.id, 'right', sinkEnd + 24);
  stored(byRange.id).top = {};
  // The range, 30", its side against the peninsula.
  const cornerAt = sinkEnd + 24 + 12 + 30;

  // The peninsula, from the window wall beside the range. Its corner box, behind the range's side, faces the dining
  // side: a lone cabinet against the wall. The other cabinets have a finished back on the dining side: the corner box
  // stands that much off the range, so its face frame is flush with their backs.
  const wide = depth + len('3/4"').mm;
  // The peninsula stands off the range's side by what its top reaches past its face frames (the doors and the
  // overhang), so the top's edge meets the range's side and the doors clear it: the range must not stand
  // into the peninsula's top. A filler board closes the space between the range and the peninsula.
  const off = frontOf(blind, project.materials, context) - len('3/4"').mm + starterTopSettings().overhang.front.mm;
  const corner = addCabinet(project, { name: 'Peninsula corner (dining side)', width: inch(24), layout: 'drawerOverDoors' });
  oneDoor(corner.id, 'left');
  const finishedBack = project.materials.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness.mm;
  stored(corner.id).placement = { wall: 'free', x: inch(L - 24), y: { mm: inch(cornerAt).mm + off + finishedBack, unit: 'in' }, turn: 0 };
  // The board, from the range's side to the corner box's back, its face toward the kitchen in line with the box's side.
  stored(corner.id).backFiller = { side: 'left', width: { mm: off + finishedBack, unit: 'in' } };
  // Facing the kitchen: their face frame in line with the range's side, their backs to the stools.
  const pen1 = addCabinet(project, { name: 'Peninsula by the range', width: inch(18), layout: 'drawerOverDoors' });
  oneDoor(pen1.id, 'right');
  const pen2 = addCabinet(project, { name: 'Peninsula end', width: inch(30), layout: 'drawerOverDoors' });
  oneDoor(pen2.id, 'right');
  const peninsula = createRun(project, [pen1.id, pen2.id], 'Peninsula');
  context.islands = [
    {
      id: 'island-1',
      name: 'Peninsula',
      rows: [peninsula.id],
      placement: { x: inch(L - 24), y: { mm: inch(cornerAt).mm + off + wide, unit: 'in' }, turn: 180 },
      // One top over the peninsula and its corner box, as it is in the kitchen.
      top: {},
      covers: [corner.id],
    },
  ];

  // The uppers, their tops at 84".
  const upper = (name: string, wall: 'back' | 'right', width: number, along: number, opts: { height?: number; doors?: 1; hinge?: 'left' | 'right' } = {}) => {
    const c = addWallCabinet(project, { name, width: inch(width), ...(opts.height ? { height: inch(opts.height) } : {}) });
    stored(c.id).offFloor = inch(84 - (opts.height ?? 30));
    if (opts.doors) oneDoor(c.id, opts.hinge ?? 'left');
    place(c.id, wall, along);
    return c;
  };
  upper('Over the fridge', 'back', 36, 18, { height: 15 });
  upper('Beside the fridge', 'back', 21, 54, { doors: 1, hinge: 'left' });
  // The corner: a diagonal wall cabinet, 24" along each wall, one door on its diagonal face.
  const diagonal = upper('Corner, upper', 'back', 24, L - 24);
  stored(diagonal.id).corner = { kind: 'diagonal', side: 'right' };
  applyCabinetLayout(project, cabinetsOf(project).find((c) => c.id === diagonal.id)!, 'doors');
  oneDoor(diagonal.id, 'right');
  // The window wall: a 15" one by the corner, the window over the sink (open between), two right of it, the
  // microwave's, the peninsula corner's.
  upper('Window wall, by the corner', 'right', 15, 24, { doors: 1, hinge: 'right' });
  upper('Right of the window', 'right', 18, sinkEnd, { doors: 1, hinge: 'left' });
  upper('Right of the window, 2', 'right', 18, sinkEnd + 18, { doors: 1, hinge: 'right' });
  upper('Over the microwave', 'right', 30, cornerAt - 30, { height: 12 });
  upper('Over the peninsula', 'right', 24, cornerAt, { doors: 1, hinge: 'right' });

  // The appliances: the fridge on its wall, the dishwasher and the range on the window wall, the microwave hung
  // under its cabinet over the range.
  // The fridge stands a little clear of what is round it: 1" under the cabinet over it
  // (whose bottom is at 69"), 1/2" from the corner cabinet beside it.
  addAppliance(project, 'refrigerator', { wall: 'back', along: inch(18) }, { width: '35-1/2"', height: '68"' });
  addAppliance(project, 'dishwasher', { wall: 'right', along: inch(sinkEnd) });
  addAppliance(project, 'range', { wall: 'right', along: inch(cornerAt - 30) });
  addAppliance(project, 'microwave', { wall: 'right', along: inch(cornerAt - 30) }, { offFloor: '55-1/2"' });
  // The window over the sink, centred on it between the uppers: 28" wide (at 34" it was
  // too wide; its trim and sill are wider than it, and ran behind the upper beside it), its sill at 42", 36" tall.
  context.room.windows = [{ wall: 'right', along: inch(runFront + 36 - 14), width: inch(28), height: inch(36), sill: inch(42) }];
  // The sink, centred on its 36" base: a drop-in, two bowls. The drawer fronts over its doors are false fronts.
  stored(sink.id).sink = kitchenSink();
  for (const d of project.designObjects) if (d.template === 'drawer' && d.mounting.openingId.startsWith(`${sink.id}/`)) d.falseFront = {};

  // Cut from half sheets: its widest door is 28" across with its grain up and down, too wide for a quarter sheet.
  // (Full sheets plan too, and take the planner longer on a job this size.)
  project.plan.blank.stock = { width: len('48"'), height: len('48"') };
  // Bought laminate tops, a dark stain, wire pulls.
  context.tops = { ...starterTopSettings(), kind: 'bought' };
  // Dark stained cabinets, white laminate tops.
  project.settings.finish = { caseId: 'stain-espresso', frontsId: 'stain-espresso', topsId: 'paint-white' };
  for (const d of designsOf(project)) d.handle = d.template === 'drawer' ? { handleId: GENERIC_PULL_ID } : doorHandleChoice(GENERIC_PULL_ID);
  return project;
}

/** Tune me: the opening a blind corner cabinet keeps beside its blind at least, and the width it is made when narrower. */
export const BLIND_MIN_OPENING = len('12"');
export const BLIND_WIDTH = { base: len('42"'), wall: len('30"') };

/**
 * Makes a cabinet a blind corner cabinet, its blind on `side`: the other run's depth and its
 * doors, and 3" for the doors and handles to clear (tune me), with a 3" filler. A cabinet too
 * narrow to keep an opening beside the blind is made 42" wide (30" on a wall cabinet), and each
 * of its door sets one door hinged away from the blind.
 */
export function makeBlind(project: Project, cabinetId: Id, side: 'left' | 'right'): void {
  const stored = storedCabinets(project).find((c) => c.id === cabinetId);
  if (!stored) throw new Error(`Cabinet not found: ${cabinetId}`);
  stored.corner =
    stored.corner?.kind === 'blind' ? { ...stored.corner, side } : { kind: 'blind', side, blind: { mm: stored.size.depth.mm + len('4"').mm, unit: 'in' }, filler: len('3"') };
  // A corner cabinet has no bays (milestone 10).
  const resolved = cabinetsOf(project).find((c) => c.id === cabinetId)!;
  if ((resolved.layout.bays?.length ?? 1) > 1) setBays(project, resolved, 1);
  // One door, hinged away from the blind, whatever its width: at the blind there is no side to hinge a second one on
  // (a 42" one kept its pair, and the door at the blind hung in the air).
  for (const d of project.designObjects) {
    if (d.template !== 'doorSet' || !d.mounting.openingId.startsWith(`${cabinetId}/`)) continue;
    d.mounting.doors = 1;
    d.mounting.hingeSide = side === 'left' ? 'right' : 'left';
  }
  if (stored.size.width.mm >= stored.corner.blind.mm + BLIND_MIN_OPENING.mm) return;
  stored.size.width = structuredClone(stored.form === 'wall' ? BLIND_WIDTH.wall : BLIND_WIDTH.base);
}

/**
 * Makes a cabinet's case an existing one (a wall cabinet's too, with its drawer openings): no shelves, nothing over or
 * beside it, and measured as the cabinet it was, so nothing moves until a measurement is typed. Its doors
 * are kept as they are (`fronts`: `new` makes new ones on its opening, which is refacing).
 */
export function makeExisting(project: Project, cabinetId: Id, fronts: 'kept' | 'new' = 'kept'): void {
  const stored = storedCabinets(project).find((c) => c.id === cabinetId);
  if (!stored) throw new Error(`Cabinet not found: ${cabinetId}`);
  delete stored.existing;
  const resolved = () => cabinetsOf(project).find((c) => c.id === cabinetId)!;
  if (!takesExisting(resolved())) throw new Error('Only a base or a wall cabinet with one bay, and of the corner cabinets only a blind one, can be an existing one.');
  stored.adjustableShelves = 0;
  delete stored.top;
  delete stored.topSupport;
  delete stored.backFiller;
  const measured = measureCase(resolved(), project.materials);
  // Its drawer openings are measured with it, their fronts kept or new as its doors are.
  stored.existing = { ...measured, ...(measured.drawers ? { drawers: measured.drawers.map((d) => ({ ...d, fronts })) } : {}), fronts };
}

/** How many drawer openings a cabinet that is already there may have over its lowest opening. */
export const EXISTING_DRAWERS_MAX = 5;

/**
 * Gives a cabinet that is already there its openings: so many drawer openings over
 * its lowest opening, which holds doors or one more drawer. The layout gets a row for each and each row
 * its front; a drawer opening that is new starts 5" high over a 1 1/2" rail (tune me), its front kept or
 * new as the lowest opening's is. The measurements of the ones that stay are kept.
 */
export function setExistingOpenings(project: Project, cabinetId: Id, drawersAbove: number, lowest: 'doors' | 'drawer' = 'doors'): void {
  const stored = storedCabinets(project).find((c) => c.id === cabinetId);
  const existing = stored?.existing;
  if (!stored || !existing) throw new Error(`No cabinet that is already there: ${cabinetId}`);
  const n = Math.min(EXISTING_DRAWERS_MAX, Math.max(0, Math.floor(drawersAbove) || 0));
  if (stored.form === 'wall' && (n > 0 || lowest === 'drawer')) throw new Error('A wall cabinet has doors only.');
  stored.layout = {
    rows: [
      ...Array.from({ length: n }, (_, i) => ({ id: drawerRowId(i + 1), use: 'drawer' as const })),
      lowest === 'drawer' ? { id: drawerRowId(n + 1), use: 'drawer' as const } : { id: DOOR_ROW_ID, use: 'doors' as const },
    ],
  };
  const was = existing.drawers ?? [];
  if (n > 0) existing.drawers = Array.from({ length: n }, (_, i) => was[i] ?? { height: len('5"'), rail: len('1-1/2"'), fronts: existing.fronts });
  else delete existing.drawers;
  if (lowest === 'drawer') {
    existing.lowest = 'drawer';
    delete existing.doors;
    delete stored.inside;
  } else delete existing.lowest;
  addLayoutFronts(project, cabinetsOf(project).find((c) => c.id === cabinetId)!);
}

/** Makes an existing case one that is made here again, at the size it was before. */
export function makeMade(project: Project, cabinetId: Id): void {
  const stored = storedCabinets(project).find((c) => c.id === cabinetId);
  if (stored) delete stored.existing;
}

/**
 * Makes a cabinet an L-shaped corner cabinet (milestone 6): 36" along each wall with a 24"
 * cut-out (24" and 12" for a wall cabinet, tune me), doors only, no shelves (a lazy susan
 * turns in it), a single door on each face: the first hinged at its outer end, the second
 * at the corner, where the two are hinged together.
 */
export function makeLShaped(project: Project, cabinetId: Id, side: 'left' | 'right'): void {
  const stored = storedCabinets(project).find((c) => c.id === cabinetId);
  if (!stored) throw new Error(`Cabinet not found: ${cabinetId}`);
  const wall = stored.form === 'wall';
  stored.size.width = len(wall ? '24"' : '36"');
  stored.size.depth = len(wall ? '12"' : '24"');
  stored.adjustableShelves = 0;
  stored.corner = { kind: 'lShaped', side };
  const cabinet = cabinetsOf(project).find((c) => c.id === cabinetId)!;
  applyCabinetLayout(project, cabinet, 'doors');
  const row = cabinet.layout.rows[0]!;
  const one = `${cabinetId}/${row.id}`;
  const two = `${one}-2`;
  if (!project.designObjects.some((d) => d.mounting.openingId === two)) {
    let n = 1;
    while (project.designObjects.some((d) => d.id === `doors-${n}`)) n++;
    project.designObjects.push({ ...createCabinetDoorSet(two, `doors-${n}`), name: 'Doors, other face' });
  }
  for (const d of project.designObjects) {
    if (d.template !== 'doorSet' || (d.mounting.openingId !== one && d.mounting.openingId !== two)) continue;
    d.mounting.doors = 1;
    const outerRight = side === 'left';
    d.mounting.hingeSide = d.mounting.openingId === one ? (outerRight ? 'right' : 'left') : outerRight ? 'right' : 'left';
  }
}

/**
 * Milestone 8's island: two rows of shop cabinets back to back in the middle of a 14' × 12'
 * room. The front row: 24" of three drawers, a 30" drawer over doors, 24" of three drawers;
 * the back row: three door cabinets, 24", 30" and 24".
 */
export function createIslandProject(): Project {
  const project = createShopCabinetProject('drawers', 3);
  project.id = 'island';
  project.name = 'Island';
  project.slug = 'island';
  const context = project.context as DesignedCabinetContext;
  context.room = { length: len('168"'), width: len('144"'), ceiling: len('96"') };
  cabinetsOf(project)[0]!.name = 'Drawers, left';
  const b = addCabinet(project, { name: 'Drawer over doors', width: len('30"'), layout: 'drawerOverDoors' });
  const c = addCabinet(project, { name: 'Drawers, right', width: len('24"'), layout: 'drawers', drawers: 3 });
  const front = createRun(project, ['cabinet-1', b.id, c.id], 'Front row');
  const d = addCabinet(project, { name: 'Doors, left', width: len('24"'), layout: 'doors' });
  const e = addCabinet(project, { name: 'Doors, middle', width: len('30"'), layout: 'doors' });
  const f = addCabinet(project, { name: 'Doors, right', width: len('24"'), layout: 'doors' });
  const back = createRun(project, [d.id, e.id, f.id], 'Back row');
  // In the middle of the room: the rows' backs meet on its middle line across.
  const length = len('78"').mm;
  // One top over both rows.
  context.islands = [{ id: 'island-1', name: 'Island', rows: [front.id, back.id], placement: { x: { mm: (len('168"').mm - length) / 2, unit: 'in' }, y: len('72"'), turn: 0 }, top: {} }];
  return project;
}

/**
 * Milestone 8's reference job: a torsion table over shop cabinets, 84" long and
 * 50" wide (a placeholder; tune me), the "Light top" make-up (1/4" MDF skins, 3/4" plywood ribs 3-1/2" tall slotted together on the CNC).
 * Full sheets on hand.
 *
 * Laid out as the table might really be, its length running front to back
 * in a 14' × 12' room:
 *  - at the front short end, a row of two 24" cabinets facing that end: on the left a 12" open space
 *    over a pair of doors (on the folding table a 7" space for a power hub, behind a switch panel), on the right four
 *    drawers, two shallow (4") over two deeper;
 *  - at the back end, two 24" door cabinets back to back across the table, one facing each long
 *    side;
 *  - the middle open right across, for a vacuum to stand under the table.
 * The front row is a one-row island (its back, toward the open middle, finished); its top, the
 * table, covers the two back cabinets too. Every front has a finger-pull notch cut by the CNC, and
 * the cases are joined with pocket screws.
 */
export function createShopTableProject(): Project {
  return shopTableProject({ id: 'shop-table', name: 'Shop table', long: 84, wide: 50 });
}

/**
 * A second example of it: a table for a machine that cuts full sheets of MDF, 62" × 112",
 * in a shop without the room for it. The back 28" is a leaf that folds down, and comes up only for a full sheet:
 * it is as long as the table's height off the floor allows. The cabinets are laid out as the first table's, all
 * under the part that stays (the two at the back stop short of the leaf), and the wider front end takes a third
 * cabinet: 20", 18" and 20" under its 62".
 */
export function createFoldingShopTableProject(): Project {
  return shopTableProject({ id: 'shop-leaf-table', name: 'Shop table, folding', long: 112, wide: 62, leaf: 28, front: [20, 18, 20], hub: true });
}

function shopTableProject(make: { id: string; name: string; long: number; wide: number; leaf?: number; front?: [number, number, number]; /** A power hub in the front-left cabinet: the folding table's only. */ hub?: boolean }): Project {
  const project = createShopCabinetProject('doors');
  project.id = make.id;
  project.name = make.name;
  project.slug = make.id;
  const context = project.context as DesignedCabinetContext;
  context.room = { length: len('168"'), width: len('144"'), ceiling: len('96"') };
  const inch = (n: number): Length => len(`${n}"`);
  const stored = (id: Id) => storedCases(context).find((c) => c.id === id)!;
  const depth = stored('cabinet-1').size.depth.mm / 25.4;
  // The table: centred in the room, its long way from the back wall to the front.
  // (With a leaf, `long` is the part that stays: that is what the cabinets are under, and what is centred on them.)
  const leaf = make.leaf ?? 0;
  const [cx, cz, long, wide, over] = [84, 72 + leaf / 2, make.long - leaf, make.wide, 2];
  // The front end: two cabinets facing it, their fronts the table's overhang in from its end.
  // On the left as you face them: a 12" open space at the top (no front; a fixed shelf under it), two doors below; with
  // a hub, a 7" space for it.
  const widths = make.front ?? [24, 24];
  stored('cabinet-1').size.width = inch(widths[0]!);
  const open = cabinetsOf(project)[0]!;
  open.name = 'Front, open over doors';
  open.layout = { rows: [{ id: UPPER_DOOR_ROW_ID, use: 'doors', height: inch(make.hub ? 7 : 12), shelves: 0 }, { id: DOOR_ROW_ID, use: 'doors' }] };
  addLayoutFronts(project, open);
  project.designObjects = project.designObjects.filter((d) => d.mounting.openingId !== `${open.id}/${UPPER_DOOR_ROW_ID}`);
  // The space at the top is for the table's power hub (lr4-sandbox's): the outlets and the
  // dust port in the cabinet's left side, at the table's left edge, as high as they go; a switch panel screwed on
  // across its front; the upper back a panel that comes off, with a second port for the vac's hose. The space is
  // 7", about the least the hub takes, which leaves the doors under it 5" taller than under the 12" it was.
  // It is on the folding table only: it is for planning that table more than a feature of the app.
  if (make.hub) stored('cabinet-1').hub = { side: 'left' };
  // On the right: four drawers, two shallow ones over two deeper ones that share what is left.
  const drawers = addCabinet(project, { name: 'Front, four drawers', width: inch(widths[1]!), layout: 'drawers', drawers: 4 });
  for (const row of stored(drawers.id).layout.rows.slice(0, 2)) row.height = inch(4);
  // A wider table's front end takes a third: a pair of doors.
  const third = widths[2] ? addCabinet(project, { name: 'Front, doors', width: inch(widths[2]), layout: 'doors' }) : undefined;
  const front = createRun(project, ['cabinet-1', drawers.id, ...(third ? [third.id] : [])], 'Front end');
  const rowLength = widths.reduce((sum, w) => sum + w, 0);
  // The back end: two door cabinets back to back on the table's middle line, each facing a long side.
  const left = addCabinet(project, { name: 'Back, facing left', width: inch(24), layout: 'doors' });
  const right = addCabinet(project, { name: 'Back, facing right', width: inch(24), layout: 'doors' });
  const backEnd = cz - long / 2 + over;
  // Under the wider table they stand apart, each with its front the table's overhang in from a long edge.
  const apart = make.front ? wide / 2 - over - depth : 0;
  stored(left.id).placement = { wall: 'free', x: inch(cx - apart), y: inch(backEnd), turn: 270 };
  stored(right.id).placement = { wall: 'free', x: inch(cx + apart), y: inch(backEnd + 24), turn: 90 };
  context.islands = [
    {
      id: 'island-1',
      name: 'Shop table',
      rows: [front.id],
      placement: { x: inch(cx - rowLength / 2), y: inch(cz + long / 2 - over - depth), turn: 0 },
      // Across the front row the table is 50"; from end to end, 84". Its size is the part that stays: a leaf is beyond it.
      top: { settings: { kind: 'torsion', torsion: lightTopTable() }, size: { length: inch(wide), width: inch(long) }, ...(make.leaf ? { leaf: { edge: 'back' as const, length: inch(make.leaf) } } : {}) },
      covers: [left.id, right.id],
      // A shop table: the row's backs face the space under it, and get no finished panel over them.
      finishedBack: false,
    },
  ];
  // Every door and drawer front gets a finger-pull notch cut by the CNC, and the cases go together with pocket screws.
  // A drawer's is in its front's top edge; a door's is the library's square notch in its opening edge (the shop
  // style's own door pull is a round finger hole).
  for (const d of designsOf(project)) {
    if (d.template === 'drawer') d.shop = { ...d.shop, pull: 'fingerPull' };
    else d.handle = doorHandleChoice('routed-notch');
  }
  context.settings.joinery.case = 'pocketScrews';
  project.materials.push(...structuredClone(SKIN_MATERIALS.filter((m) => m.id === MDF_1_4_ID)));
  project.plan.blank.stock = { width: len('48"'), height: len('96"') };
  return project;
}
