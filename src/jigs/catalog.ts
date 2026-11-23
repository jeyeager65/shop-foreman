/**
 * Everything the app can make that is not a cabinet part: the handles printed
 * here and the wooden ones cut on the CNC, the pocket-hole drill guide and its scrap test, the slide
 * shims and the install kit's pieces. Each is an item with its sizes as fields, a picture built from
 * them, and its output: a 3MF file to print, or G-code for a thing cut on the CNC. The page that
 * lists them (`#/jigs`) needs no project.
 */
import { materialTitle, shopFor } from '@/design';
import { DEFAULT_UNIT_PREFERENCES, feedWords } from '@/units';
import { DEFAULT_DOOR_HANDLE } from '@/design/handles';
import { handleHeight, handleLook, printedHandleProblems, pullProfile } from '@/design/printedHandle';
import { GUIDE_STOCK, LOW_POCKET, POCKET, POCKET_SLEEVE, SLEEVE_LIMITS, arcShape, lowPocketScrew, sleeveGoesIn, sleeveWords } from '@/geometry/pocketHole';
import { loadManifold, meshOf } from '@/geometry/solids';
import { POCKET_TEST, POCKET_TEST_FILE, type PocketKind, buildPocketTest, lowPocketBit, pocketTestBits, pocketTestStock } from '@/job/pocketTest';
import { activeMachine, cutDiameter, isBallNose, tabFitOf } from '@/plan';
import type { Handle, Hinge, Id, Mm, PocketSleeve, ShelfPin, ShopProfile } from '@/model';
import { INSERT_PLAY, INSERT_UNDER, type Caddy, type Dividers, type KnifeInsert, type SpiceInsert, caddyParts, caddyProblems, dividerParts, dividerProblems, insertCopies, insertFiles, insertObjects, insertPartLines, knifeParts, knifeProblems, knifeSlots, spiceLayout, spiceParts, spiceProblems } from './drawerInserts';
import { type DowelJig, type HingeCupJig, type PullTemplate, type ShelfPinJig, buildDowelJig, buildHingeCupJig, buildPullTemplate, buildShelfPinJig, dowelJigProblems, hingeCupJigProblems, pullTemplateProblems, shelfPinJigProblems } from './drillJigs';
import { buildInstallKitObjects } from './installKit';
import { type PocketCover, buildPocketCover, coverSize, pocketCoverProblems } from './pocketCover';
import { POCKET_SCREW, type PocketSection, bothUnits, farthestSeat, pocketSection } from './pocketSection';
import { type ScrapView, buildDrilledScrap, testLedge } from './drilledScrap';
import { GUIDE, GUIDE_PRINT, type PocketGuide, buildPocketGuide, guideAngle, guideBitOut, guideBoss, guideFileName, guideLabel, guideStockName, pocketGuideProblems } from './pocketGuide';
import { buildPrintedHandle } from './printedHandles';
import { buildSlideJigObjects, slideJigProblems } from './slideJig';
import { buildSlideShimObjects } from './slideShims';
import { TAB_TEST_FITS, type TabTestKind, tabTestNotes, tabTestParts, tabTestProblems } from './tabTest';
import { type PrintObject, printSettingsWords } from './threemf';
import { type TrayBins, type TrayDivider, buildTrayBinObjects, buildTrayDivider, trayBinProblems, trayBinSize, trayDividerProblems } from './trayBins';
import { woodHandleBits, woodHandleFiles } from './woodHandle';

/** A size or a choice of an item. `mm`: a length, typed in either unit; `count`: a whole number; `choice`: one of `choices`. */
export interface JigField {
  key: string;
  label: string;
  /** `rows`: a list, each row a choice in every one of `columns` (kept as JSON, a list of records), up to `max` rows. */
  kind: 'mm' | 'count' | 'choice' | 'rows';
  choices?: { title: string; value: string }[];
  /** A column shows on a row only where `when` says, given the row and the page's other values. */
  /** A choice's `short` title is what its button says, where a column's few choices are buttons. `check`: a tick box, its value `yes` or `no`. */
  /** `length`: a length typed freely with its unit switch, kept in mm under `key` and its unit under `key` + `Unit`. */
  columns?: { key: string; label: string; check?: boolean; length?: boolean; /** A length's usual value, which a button in its field puts back. */ reset?: Mm; choices: { title: string; value: string; short?: string }[]; choicesFor?(values: JigValues, row?: Record<string, string>): { title: string; value: string; short?: string }[]; when?(row: Record<string, string>, values: JigValues): boolean }[];
  /** A row's name ("Pocket"), and the most rows. */
  row?: string;
  max?: number;
  hint?: string;
  /** Shown only for these values: a size that another choice makes moot. */
  when?(values: JigValues): boolean;
}
export type JigValues = Record<string, number | string>;

/** A `rows` field's rows, from the JSON its value keeps. */
export function jigRows(values: JigValues, key: string): Record<string, string>[] {
  try {
    const rows = JSON.parse(String(values[key] ?? '[]')) as unknown;
    return Array.isArray(rows) ? (rows as Record<string, string>[]) : [];
  } catch {
    return [];
  }
}

/** A file an item gives: a 3MF to print, or G-code. */
export interface JigFile {
  name: string;
  bytes?: Uint8Array;
  text?: string;
  /** What it is, for the page: which blank, what it cuts with. */
  note?: string;
}

export interface JigItem {
  id: string;
  name: string;
  group: 'Handles' | 'Drawer inserts' | 'Jigs' | 'Install kit';
  /** `print`: a 3MF for a 3D printer; `cnc`: G-code for a machine, a material and a bit. */
  made: 'print' | 'cnc';
  /** What it is for, in a line or two. */
  about: string;
  /** Not yet printed, cut or used: every size is a first guess. */
  untested?: boolean;
  /** Always one: its file is one of it whatever, so the page asks no "How many" (the scrap test; the drill guide, one for a stock and an angle). */
  single?: boolean;
  fields: JigField[];
  /** What the fields start at: the shop profile's entry where there is one, else the job's usual values. */
  defaults: JigValues;
  /** Why these values cannot be made; empty when they can. */
  problems(values: JigValues): string[];
  /** The thing itself, once, for the picture and (a print) the file. */
  build(values: JigValues, wasmUrl?: string): Promise<PrintObject[]>;
  /** A thing cut on the CNC: its G-code for `quantity` of them on a machine of the shop. */
  gcode?(values: JigValues, quantity: number, machineId: Id, bitId?: Id): JigFile[];
  /** The bits that can cut it on that machine, and the one the planner picks: the page offers them when there is more than one. */
  bits?(values: JigValues, machineId: Id): { chosen?: Id; offered: { id: Id; name: string }[] };
  /** The 3MF's file name. */
  fileName: string;
  /** Its file name where that goes by its sizes (a guide made for one stock and one angle). */
  fileNameFor?(values: JigValues): string;
  /** A thing with no solid of its own (a test cut in scrap): the page's picture is its G-code, carved. */
  carved?: boolean;
  /** A test cut's second picture: the scrap once what is drilled by hand is drilled, cut away to show it. */
  drilled?(values: JigValues, wasmUrl?: string, view?: ScrapView): Promise<PrintObject[]>;
  /** More to say about it for these values, under its sizes: what the numbers come to. */
  /** `machineId`: the machine its G-code is posted for, where what it says goes by the machine (times, feeds). */
  notes?(values: JigValues, machineId?: Id): string[];
  /** What is kept under the page's "How this works": explanations that need not be in sight. */
  help?(values: JigValues): string[];
  /** The scrap test's pockets in section, each kind once, with the pockets it stands for. */
  sections?(values: JigValues): { title: string; section: PocketSection }[];
  /** The pocket-hole guide: what the page's moving picture of it in use is drawn from. */
  inUse?(values: JigValues): PocketGuide;
  /** A handle of the shop's library: "Save to the shop profile" writes the values back to it. */
  handleId?: Id;
  /** What else changes when a value is chosen: a pin, a hinge or a handle fills in the sizes that come from it. */
  follow?(key: string, value: number | string): JigValues;
}

/** The play the notes of a drawer insert speak of. */
const INSERT_NOTE = { play: INSERT_PLAY, under: INSERT_UNDER };
const num = (values: JigValues, key: string, fallback = 0) => {
  const v = Number(values[key]);
  return Number.isFinite(v) ? v : fallback;
};
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const positive = (values: JigValues, fields: JigField[]) => fields.filter((f) => f.kind !== 'choice' && !(num(values, f.key) > 0)).map((f) => `${f.label} must be more than 0.`);

type Bag = Record<string, unknown>;
/** Reads a value of a handle by its dotted path. */
const at = (handle: Handle, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Bag | undefined)?.[k], handle);
/** A copy of a handle with the page's values put in by their paths. */
export function handleWith(handle: Handle, values: JigValues): Handle {
  const copy = JSON.parse(JSON.stringify(handle)) as Handle;
  for (const [path, value] of Object.entries(values)) {
    const keys = path.split('.');
    let o = copy as unknown as Bag;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Bag;
    o[keys.at(-1)!] = value;
  }
  return copy;
}

/** A made handle's fields: the same sizes its entry in the shop profile has. */
function handleFields(handle: Handle, materials: { title: string; value: string }[]): JigField[] {
  const made = (handle.printed ?? handle.cnc)!;
  const knob = handle.printed?.design === 'knob';
  const fields: JigField[] = [];
  if (handle.holes === 2) fields.push({ key: 'spacing', label: 'Hole centres', kind: 'mm' });
  if (made.design !== 'arch') fields.push({ key: 'look.length', label: knob ? 'Diameter' : 'Length', kind: 'mm' });
  fields.push({ key: 'look.projection', label: knob ? 'Height to the head' : 'Room for fingers', kind: 'mm' }, { key: 'look.thickness', label: knob ? 'Head thickness' : 'Bar thickness', kind: 'mm' });
  if (handle.cnc) {
    fields.push(
      { key: 'cnc.materialId', label: 'Cut from', kind: 'choice', choices: materials, hint: 'It is as wide as this stock is thick.' },
      { key: 'cnc.pilot.diameter', label: 'Pilot hole', kind: 'mm', hint: 'Drilled by hand in each foot.' },
      { key: 'cnc.pilot.depth', label: 'Pilot hole depth', kind: 'mm' },
    );
  }
  if (handle.printed) {
    if (!knob) fields.push({ key: 'printed.width', label: 'Width', kind: 'mm' });
    fields.push({
      key: 'printed.fastening',
      label: 'Held by',
      kind: 'choice',
      choices: [
        { title: 'Heat-set inserts', value: 'heatSetInsert' },
        { title: 'Screws into the plastic', value: 'screw' },
      ],
    });
    fields.push(
      { key: 'printed.insert.diameter', label: 'Insert hole', kind: 'mm' },
      { key: 'printed.insert.depth', label: 'Insert hole depth', kind: 'mm' },
      { key: 'printed.pilot.diameter', label: 'Screw hole', kind: 'mm' },
      { key: 'printed.pilot.depth', label: 'Screw hole depth', kind: 'mm' },
    );
  }
  return fields;
}

/** A wooden pull as a solid, lying on its side as it is cut: its profile, as thick as its stock. */
async function woodHandleObject(handle: Handle, thickness: Mm, wasmUrl?: string): Promise<PrintObject[]> {
  const { Manifold } = await loadManifold(wasmUrl);
  const half = handleLook(handle).length / 2;
  const body = Manifold.extrude([pullProfile(handle)], thickness);
  const placed = body.translate(half, 0, 0);
  const mesh = meshOf(placed);
  body.delete();
  placed.delete();
  return [{ name: handle.name, mesh, placements: [{ x: 0, y: 0 }] }];
}

/**
 * The items a shop can make, in the order the page lists them: its made handles (each from its entry
 * in the shop profile), then the jigs, then the install kit's pieces.
 */
/** The drill guide's choice of angle that prints a guide for every angle. */
const EVERY_ANGLE = 'all';

export function jigItems(shop: ShopProfile): JigItem[] {
  const handles = shop.hardware.filter((h): h is Handle => h.kind === 'handle' && !!(h.printed ?? h.cnc));
  const stock = shop.materialCatalog.filter((m) => m.groupId === 'solid-wood' || m.groupId === 'plywood').map((m) => ({ title: materialTitle(m), value: m.id }));
  const thicknessOf = (id: unknown) => shop.materialCatalog.find((m) => m.id === id)?.measuredThickness.mm ?? 19.05;

  const handleItems = handles.map((handle): JigItem => {
    const fields = handleFields(handle, stock);
    const defaults: JigValues = Object.fromEntries(fields.flatMap((f) => (at(handle, f.key) === undefined ? [] : [[f.key, at(handle, f.key) as number | string]])));
    const shown = (values: JigValues) => fields.filter((f) => !f.key.startsWith('printed.insert') || values['printed.fastening'] === 'heatSetInsert').filter((f) => !f.key.startsWith('printed.pilot') || values['printed.fastening'] === 'screw');
    const item: JigItem = {
      id: `handle-${handle.id}`,
      name: handle.name,
      group: 'Handles',
      made: handle.printed ? 'print' : 'cnc',
      about: handle.printed
        ? `A ${handle.printed.design === 'knob' ? 'knob' : 'pull'} printed here, held from the back of the front by ${handle.printed.screw} screws. It prints without supports.`
        : `A wooden pull cut out lying on its side, so it is as wide as its stock is thick, held by ${handle.cnc!.screw} screws from the back. Its pilot holes are drilled by hand and its edges rounded by hand.`,
      untested: true,
      fields,
      defaults,
      problems: (values) => [...positive(values, shown(values)), ...printedHandleProblems(handleWith(handle, values), shop.materialCatalog)],
      build: (values, wasmUrl) => {
        const h = handleWith(handle, values);
        return h.printed ? buildPrintedHandle(h, wasmUrl).then(({ mesh }) => [{ name: h.name, mesh, placements: [{ x: 0, y: 0 }] }]) : woodHandleObject(h, thicknessOf(values['cnc.materialId']), wasmUrl);
      },
      fileName: `${slug(handle.name)}.3mf`,
      handleId: handle.id,
    };
    if (handle.cnc) {
      item.gcode = (values, quantity, machineId, bitId) => woodHandleFiles(handleWith(handle, values), quantity, shop, machineId, bitId);
      item.bits = (values, machineId) => woodHandleBits(handleWith(handle, values), shop, machineId);
    }
    return item;
  });

  const one = (template: 'supportBlock' | 'gapShim', params: Record<string, Mm>) => ({ template, params, quantity: 1, output: '3mf' as const });
  /**
   * The scrap test's lengths in both units (`bothUnits`): what the CNC cuts and what is measured on the scrap (a seat, a depth,
   * the scrap) the shop's CNC unit first; what is bought (a screw, `screwName`) its sizes unit first. A bit or a material keeps
   * its own name.
   */
  const cnc = (mm: Mm) => bothUnits(mm, { ...DEFAULT_UNIT_PREFERENCES, ...shop.units }.cnc);
  /** A screw's length as it is bought: in the shop's sizes unit (1-1/2" in a shop in inches, 38.1 mm in one in mm). */
  const screwName = (mm: Mm) => bothUnits(mm, { ...DEFAULT_UNIT_PREFERENCES, ...shop.units }.sizes);
  const ballNoseStock = shop.materialCatalog.map((m) => ({ title: `${materialTitle(m)}, ${cnc(m.measuredThickness.mm)} thick`, value: m.id }));
  const shimFields: JigField[] = [
    { key: 'thickness', label: 'Thickness', kind: 'mm' },
    { key: 'length', label: 'Length', kind: 'mm' },
    { key: 'height', label: 'Height', kind: 'mm' },
  ];
  const blockFields: JigField[] = [{ key: 'height', label: 'Bottom overlay', kind: 'mm', hint: 'How far the door hangs below the opening: the ledge is that far down.' }];
  const gapFields: JigField[] = [{ key: 'thickness', label: 'Gap', kind: 'mm', hint: 'The gap between a pair of doors.' }];
  const testBits = pocketTestBits(shop);
  const lowBit = lowPocketBit(shop);
  const lowBitWidth = lowBit ? cutDiameter(lowBit) : 6.35;
  /** The seat's distance from the edge, which is set as on a pocket-hole machine. */
  const seatField: JigField = { key: 'seat', label: 'Seat', kind: 'mm', hint: `Along the screw, from the edge to where its head bears: ${LOW_POCKET.seatRange.min} to ${LOW_POCKET.seatRange.max} mm. A screw goes its length less this into the other part.` };
  const seatOf = (values: JigValues): Mm => (Number(values.seat) > 0 ? Number(values.seat) : LOW_POCKET.seat);
  /** The bits a scrap is cut with, one a scrap: a ball nose cuts 15° pockets; a narrow end mill 15° or low-angle ones; one wider than half the bore, low-angle ones. */
  const scrapBits = [...testBits, ...(lowBit && !testBits.some((t) => t.id === lowBit.id) ? [lowBit] : [])];
  const bitKindOf = (id: unknown): 'ball' | 'narrow' | 'wide' => {
    const tool = scrapBits.find((t) => t.id === id);
    return !tool || isBallNose(tool) ? 'ball' : cutDiameter(tool) <= POCKET.bore / 2 + 1e-9 ? 'narrow' : 'wide';
  };
  // In number order: 3°, 6°, 15°.
  const ANGLES = { ball: [POCKET.angleDeg], narrow: [...LOW_POCKET.angles, POCKET.angleDeg], wide: [...LOW_POCKET.angles] };
  const anglesFor = (values: JigValues) => ANGLES[bitKindOf(values.bit)];
  /** A row's angle: its own where the bit can cut it, else the bit's first. */
  const angleOf = (row: Record<string, string>, values: JigValues): number => anglesFor(values).find((a) => String(a) === row.angle) ?? anglesFor(values)[0]!;
  const lowRow = (row: Record<string, string>, values: JigValues) => angleOf(row, values) !== POCKET.angleDeg;
  const bitChoices = scrapBits.map((t) => ({ title: t.name, value: t.id }));
  /** The scrap's thickness, measured: its material's. */
  const scrapThickness = (values: JigValues): Mm => shop.materialCatalog.find((m) => m.id === values.materialId)?.measuredThickness.mm ?? 19.05;
  /** The end mills a 15° pocket's ledge may be cut with: any no wider than the bore (the 1/8" or the 1/4" in the starter shop). */
  const ledgeBits = shop.tools.filter((t) => t.shape.kind === 'endMill' && cutDiameter(t) >= 3 - 1e-6 && cutDiameter(t) <= POCKET.bore + 1e-6).sort((a, b) => cutDiameter(a) - cutDiameter(b));
  /** The pockets on the scrap, all cut with the one bit: each a row of its own. */
  const POCKET_COLUMNS: NonNullable<JigField['columns']> = [
    {
      key: 'angle',
      label: 'Angle',
      choices: [],
      // Shown whatever the bit, a ball nose's one angle too: a table without it leaves the angle to be guessed.
      choicesFor: (values) => anglesFor(values).map((a) => ({ title: `${a}°`, value: String(a) })),
    },
    // Typed, as in Setup and on Plan, with its unit switch: from the edge along the screw.
    { key: 'seat', label: 'Seat', length: true, reset: LOW_POCKET.seat, choices: [], when: lowRow },
    // A ledge is cut with the scrap's own end mill; round a ball nose's pocket, which cannot cut a flat one, with an end mill chosen here.
    {
      // A tick: cut with the scrap's own end mill, or round a ball nose's pocket with the end mill chosen above the table.
      key: 'ledge',
      label: 'Ledge',
      check: true,
      choices: [
        { title: 'No', value: 'no' },
        { title: 'Yes', value: 'yes' },
      ],
    },
    {
      key: 'way',
      label: "Screw's way",
      choices: [
        { title: 'Drilled, with the guide', short: 'Drill', value: 'drilled' },
        { title: 'A slot cut open from the face, nothing drilled', short: 'Slot', value: 'channel' },
      ],
    },
  ];
  const testFields: JigField[] = [
    { key: 'materialId', label: 'Scrap of', kind: 'choice', choices: ballNoseStock },
    { key: 'bit', label: 'Cut with', kind: 'choice', choices: bitChoices, hint: 'One bit a scrap.' },
    // A ball nose cannot cut a flat ledge: on its scrap, the end mill that cuts the ledges.
    {
      key: 'ledgeBit',
      label: 'Ledges cut with',
      kind: 'choice',
      choices: ledgeBits.map((t) => ({ title: t.name, value: t.id })),
      when: (values) => bitKindOf(values.bit) === 'ball' && jigRows(values, 'pockets').some((r) => r.ledge === 'yes'),
    },
    {
      key: 'pockets',
      label: 'Pockets on the scrap',
      kind: 'rows',
      row: 'Pocket',
      max: POCKET_TEST.most,
      columns: POCKET_COLUMNS,
    },
  ];
  /** The pockets the page's rows come to, all with the bit chosen. */
  const testKinds = (values: JigValues): PocketKind[] => {
    const tool = scrapBits.find((t) => t.id === values.bit);
    return jigRows(values, 'pockets').map((row): PocketKind => {
      const channel = row.way === 'channel' ? { channel: true } : {};
      if (lowRow(row, values)) {
        const angle = LOW_POCKET.angles.find((a) => a === angleOf(row, values)) ?? LOW_POCKET.angles[0];
        return { ...channel, bit: 'arc', ledge: row.ledge === 'yes', angleDeg: angle, seat: Number(row.seat) > 0 ? Number(row.seat) : LOW_POCKET.seat };
      }
      // A ledge round a 15° pocket: the scrap's own end mill, or on a ball nose's scrap the end mill chosen for ledges.
      const ledgeBit = row.ledge === 'yes' ? (tool && isBallNose(tool) ? (ledgeBits.find((t) => t.id === values.ledgeBit) ?? ledgeBits[0]) : tool) : undefined;
      return { ...channel, bit: tool && isBallNose(tool) ? 'ball' : 'flat', ledge: !!ledgeBit, ...(ledgeBit ? { ledgeBitId: ledgeBit.id } : {}) };
    });
  };
  /** What else the scrap needs besides the bit chosen: the flat end mill for a ledge round a ball nose's pocket, a narrow one for a channel a wide bit cannot cut. */
  const otherBits = (values: JigValues): string[] => {
    const kinds = testKinds(values);
    const tool = scrapBits.find((t) => t.id === values.bit);
    const out: string[] = [];
    // A ledge with an end mill other than the scrap's own bit (a ball nose cannot cut a flat ledge at all).
    for (const id of new Set(kinds.filter((k) => k.ledgeBitId && k.ledgeBitId !== tool?.id).map((k) => k.ledgeBitId!))) {
      out.push(`${tool && isBallNose(tool) ? "a ledge round a ball nose's pocket is flat" : 'a ledge with another bit'}: the ${ledgeBits.find((t) => t.id === id)?.name ?? id} cuts it`);
    }
    if (tool && cutDiameter(tool) > POCKET.drill + 1e-9 && kinds.some((k) => k.channel)) out.push(`the ${tool.name} is wider than the ${POCKET.drill} mm pilot: a narrower end mill cuts the channels`);
    return out;
  };  /** Two pockets as a job cuts them, drilled: where the test starts. */
  const TEST_START = JSON.stringify(Array.from({ length: POCKET_TEST.count }, () => ({ angle: String(POCKET.angleDeg), seat: String(LOW_POCKET.seat), seatUnit: 'in', ledge: 'no', way: 'drilled' })));  /** The screw for a low-angle pocket in stock this thick, where it is known. */
  const screwWords = (thickness: Mm, seat: Mm): string => {
    const screw = lowPocketScrew(thickness);
    return screw ? `. In this stock it takes ${screwName(screw)} screws: with the seat ${cnc(seat)} from the edge, one goes ${cnc(screw - seat)} into the other part` : '';
  };
  const kindWords = (kind: PocketKind, thickness: Mm, bitWidth: Mm = lowBitWidth): string => {
    if (kind.bit !== 'arc') return plainKindWords(kind);
    const arc = arcShape(thickness, bitWidth, kind.angleDeg ?? 3, kind.seat);
    return `Low angle, ${arc.angleDeg}°: a slot ${cnc(arc.depth)} deep at the seat, its floor up to the face in an arc ${cnc(arc.end)} in from the edge. The driver comes in about ${Math.round(arc.driverOff)}° steeper than the screw lies, so it wants a head that takes that (Torx, or a square drive)${screwWords(thickness, arc.seat)}${kind.ledge ? '; with a ledge round its opening for a printed cover, cut with the same bit' : ''}`;
  };
  const plainKindWords = (kind: PocketKind) =>
    (kind.bit === 'ball'
      ? 'The ball nose: a round floor, and a small fillet where the seat meets it'
      : "The flat end mill: a slot with upright walls and a floor that slopes with the screw, level for the bit's width at the seat, which it meets in a sharp corner") +
    (kind.ledge ? '; with a ledge round its opening for a printed cover, cut with the flat end mill' : '');
  /** The flat end mills a ledge is cut with in a job: any no wider than the bore, the 1/8" or the 1/4" in the starter shop. */
  const coverBits = shop.tools.filter((t) => t.shape.kind === 'endMill' && cutDiameter(t) >= 3 - 1e-6 && cutDiameter(t) <= POCKET.bore + 1e-6).sort((a, b) => cutDiameter(a) - cutDiameter(b));
  const coverFields: JigField[] = [
    {
      key: 'stock',
      label: 'Stock',
      kind: 'choice',
      choices: [...GUIDE_STOCK.map((s) => ({ title: `${s.name} stock`, value: s.id })), { title: 'Another thickness', value: 'other' }],
    },
    { key: 'thickness', label: 'Stock thickness', kind: 'mm', when: (values) => values.stock === 'other' },
    { key: 'bitId', label: 'Ledge cut with', kind: 'choice', choices: coverBits.map((t) => ({ title: t.name, value: t.id })), hint: 'The flat end mill that cut the ledge: the cover follows its corners.' },
    {
      key: 'angle',
      label: 'Pocket',
      kind: 'choice',
      choices: [{ title: `${POCKET.angleDeg}°`, value: String(POCKET.angleDeg) }, ...LOW_POCKET.angles.map((a) => ({ title: `Low angle, ${a}°`, value: String(a) }))],
      hint: "A low-angle pocket's cover is longer, as its pocket is.",
    },
    { ...seatField, when: (values) => String(values.angle) !== String(POCKET.angleDeg) },
  ];
  const coverOf = (values: JigValues): PocketCover => {
    const low = LOW_POCKET.angles.find((a) => String(a) === String(values.angle));
    return {
      thickness: GUIDE_STOCK.find((s) => s.id === values.stock)?.mm ?? num(values, 'thickness'),
      bit: cutDiameter(coverBits.find((t) => t.id === values.bitId) ?? coverBits[0]!),
      ...(low ? { low: { angleDeg: low, ...(seatOf(values) !== LOW_POCKET.seat ? { seat: seatOf(values) } : {}) } } : {}),
    };
  };
  const guideFields: JigField[] = [
    {
      key: 'stock',
      label: 'Stock',
      kind: 'choice',
      choices: [...GUIDE_STOCK.map((s) => ({ title: `${s.name} stock: ${s.from} to ${s.to} mm thick`, value: s.id })), { title: 'Another thickness', value: 'other' }],
      hint: 'One guide does every stock sold as that thickness, plywood or solid.',
    },
    { key: 'thickness', label: 'Stock thickness', kind: 'mm', hint: 'Measured: the bore meets the edge at half of it.', when: (values) => values.stock === 'other' },
    { key: 'drill', label: 'Drill bit', kind: 'mm', hint: 'The pilot bit that turns in its sleeve: 4 mm or 5/32".' },
    { key: 'sleeveBore', label: "Sleeve's bore", kind: 'mm', hint: "The metal sleeve that steers the bit: a stainless spacer or a bronze bushing. It starts at the Shop profile's (Hardware, Drill guide sleeve)." },
    { key: 'sleeveOutside', label: "Sleeve's outside diameter", kind: 'mm', hint: `${SLEEVE_LIMITS.outside} mm at most.` },
    { key: 'sleeveLength', label: "Sleeve's length", kind: 'mm', hint: "Longer steers better. The guide's bore is as long as the sleeves need: up to about 30 mm in all, one long one or two in line." },
    { key: 'sleeveCount', label: 'Sleeves', kind: 'choice', choices: [{ title: 'One', value: '1' }, { title: 'Two, in line', value: '2' }], hint: 'Two short ones: one at each end of the bore.' },
    { key: 'sleeveFlanged', label: 'Flange', kind: 'choice', choices: [{ title: 'Plain: no flange', value: 'no' }, { title: 'Flanged', value: 'yes' }], hint: 'A flanged sleeve seats in a recess, flush. Its length is over all.' },
    { key: 'sleeveFlange', label: "Flange's diameter", kind: 'mm', when: (values) => values.sleeveFlanged === 'yes' },
    { key: 'sleeveFlangeThickness', label: "Flange's thickness", kind: 'mm', when: (values) => values.sleeveFlanged === 'yes' },
    {
      key: 'angle',
      label: 'Pocket',
      kind: 'choice',
      choices: [
        { title: `${POCKET.angleDeg}°: as a job cuts them`, value: String(POCKET.angleDeg) },
        ...LOW_POCKET.angles.map((a) => ({ title: `Low angle, ${a}°`, value: String(a) })),
        { title: `One of each: ${[POCKET.angleDeg, ...LOW_POCKET.angles].map((a) => `${a}°`).join(', ')}`, value: EVERY_ANGLE },
      ],
      hint: 'The angle the screw lies at. A low-angle pocket is cut as a pocket-hole machine cuts it. One of each prints a guide for every angle, side by side.',
    },
    { ...seatField, when: (values) => String(values.angle) !== String(POCKET.angleDeg) },
  ];
  /** The guide for these sizes at one angle (left out: the angle chosen; with one of each chosen, the 15° one). */
  const guideOf = (values: JigValues, angle: unknown = values.angle): PocketGuide => {
    const low = LOW_POCKET.angles.find((a) => String(a) === String(angle));
    const sleeve: PocketSleeve = { bore: num(values, 'sleeveBore'), outside: num(values, 'sleeveOutside'), length: num(values, 'sleeveLength'), count: String(values.sleeveCount) === '2' ? 2 : 1, ...(values.sleeveFlanged === 'yes' ? { flange: { diameter: num(values, 'sleeveFlange'), thickness: num(values, 'sleeveFlangeThickness') } } : {}) };
    return { thickness: GUIDE_STOCK.find((s) => s.id === values.stock)?.mm ?? num(values, 'thickness'), drill: num(values, 'drill'), sleeve, ...(low ? { low: { angleDeg: low, bit: lowBitWidth, ...(seatOf(values) !== LOW_POCKET.seat ? { seat: seatOf(values) } : {}) } } : {}) };
  };
  /** Every guide these sizes print: one, or one for each angle. */
  const guidesOf = (values: JigValues): PocketGuide[] => (values.angle === EVERY_ANGLE ? [POCKET.angleDeg, ...LOW_POCKET.angles].map((a) => guideOf(values, a)) : [guideOf(values)]);
  const shopSleeve = shop.pocketSleeve ?? POCKET_SLEEVE;
  const testStock = shop.materialCatalog.find((m) => m.groupId === 'plywood' && m.measuredThickness.mm > 15) ?? shop.materialCatalog[0];
  const testSize = (machineId?: Id) => pocketTestStock(shop.machines.find((m) => m.id === machineId) ?? activeMachine(shopFor({ materials: shop.materialCatalog }, shop)));

  const tabStock = (id: unknown): Mm => shop.materialCatalog.find((m) => m.id === id)?.measuredThickness.mm ?? 0;
  const tabKind = (values: JigValues): TabTestKind => (values.kind === 'through' || values.kind === 'blind' ? values.kind : 'both');

  const jigs: JigItem[] = [
    {
      id: 'pocket-guide',
      name: 'Pocket-hole drill guide',
      group: 'Jigs',
      made: 'print',
      about: "The drill guide for pocket holes whose pocket the CNC cuts. The pilot is drilled from the board's edge, up into the pocket: a plate lies on the board's face with a key in the pocket, a leg hangs over the edge as a fence, and a boss on the leg carries the bit at 15° in a metal sleeve (or at 3° or 6° for a low-angle pocket).",
      untested: true,
      single: true,
      fields: guideFields,
      defaults: { stock: GUIDE_STOCK[0].id, thickness: testStock?.measuredThickness.mm ?? 19.05, drill: POCKET.drill, angle: String(POCKET.angleDeg), seat: LOW_POCKET.seat, sleeveBore: shopSleeve.bore, sleeveOutside: shopSleeve.outside, sleeveLength: shopSleeve.length, sleeveCount: String(shopSleeve.count), sleeveFlanged: shopSleeve.flange ? 'yes' : 'no', sleeveFlange: shopSleeve.flange?.diameter ?? 12, sleeveFlangeThickness: shopSleeve.flange?.thickness ?? 2 },
      problems: (values) => [...new Set(guidesOf(values).flatMap(pocketGuideProblems))],
      // Side by side on the bed, each as wide as its boss or its plate.
      build: async (values, wasmUrl) => {
        const objects: PrintObject[] = [];
        let y = 0;
        for (const guide of guidesOf(values)) {
          objects.push({ name: `Pocket-hole guide, ${guideLabel(guide)}`, mesh: await buildPocketGuide(guide, wasmUrl), placements: [{ x: 0, y }], print: GUIDE_PRINT });
          y += Math.max(GUIDE.plateWidth, guideBoss(guide).boss) + GUIDE.bedSpacing;
        }
        return objects;
      },
      notes: (values) => [
        guidesOf(values).length > 1
          ? `Chuck the bit so it stands this far out of the chuck: ${guidesOf(values).map((g) => `${guideAngle(g)}°, ${guideBitOut(g).toFixed(1)} mm`).join('; ')}. The chuck stops against the guide's back and the bit comes ${POCKET.through} mm through the seat into the pocket. A regular 4 mm or 5/32" bit is long enough. Each guide has its stock and its angle engraved on it.`
          : `Chuck the bit so it stands ${guideBitOut(guideOf(values)).toFixed(1)} mm out of the chuck: the chuck stops against the guide's back and the bit comes ${POCKET.through} mm through the seat into the pocket. A regular 4 mm or 5/32" bit is long enough.`,
        "To set the bit without measuring, push it through the guide, off the board, until it stops at the end of its hole under the plate, and tighten the chuck against the guide's back. Use a regular-length bit, never a long one: the chuck against the guide's back is all that stops it, and a bit chucked too long drills on into the guide, at 15° up toward the plate your hand is on.",
        "Lay the plate on the board's face with its key in the pocket and pull the leg tight against the edge: the edge sets how far in the pilot starts, so it must be the edge the file was zeroed to. The part has to overhang the bench for the drill.",
        "The bit breaks out at the seat, inside the pocket: look for tear-out there, where the screw's head bears. The clean entry is on the joint's face.",
        `It is made for ${guideStockName(guideOf(values).thickness)}: the bit goes in at half the stock's thickness, and a little either way does not matter, so plywood and solid wood sold as one thickness share a guide. Another thickness takes another guide.`,
        `It takes ${guideOf(values).sleeve!.count === 2 ? 'two metal sleeves' : 'a metal sleeve'}, ${sleeveWords(guideOf(values).sleeve!)} (bore × outside × length): a stainless spacer or a bronze bushing. Push ${guideOf(values).sleeve!.count === 2 ? 'them' : 'it'} in: ${sleeveGoesIn(guideOf(values).sleeve!)}. Put the bit in before starting the drill.`,
        `It prints plate down, the leg and the key standing up, without supports: ${printSettingsWords(GUIDE_PRINT)} (a first guess). Bambu Studio and OrcaSlicer take these from the file when it is opened, not when it is imported into a plate; set them by hand in another slicer.`,
      ],
      inUse: guideOf,
      fileName: 'pocket-hole-guide.3mf',
      fileNameFor: (values) => (guidesOf(values).length > 1 ? guideFileName(guideOf(values)).replace(/-\d+deg\.3mf$/, `-${guidesOf(values).map(guideAngle).join('-')}deg.3mf`) : guideFileName(guideOf(values))),
    },
    {
      id: 'pocket-test',
      name: 'Pocket-hole scrap test',
      group: 'Jigs',
      made: 'cnc',
      about: `A board with pocket holes along one edge, cut out of a piece of stock (${cnc(testSize().x)} × ${cnc(testSize().y)} for two pockets), to screw to another piece and see how they hold.`,
      untested: true,
      single: true,
      fields: testFields,
      sections: (values) => {
        const kinds = testKinds(values);
        const tool = scrapBits.find((t) => t.id === values.bit);
        const width = tool ? cutDiameter(tool) : lowBitWidth;
        // Each kind once (its angle, seat and screw's way), named by the pockets that are it.
        const groups = new Map<string, number[]>();
        kinds.forEach((k, i) => {
          const key = `${k.bit === 'arc' ? k.angleDeg : POCKET.angleDeg}/${k.bit === 'arc' ? k.seat : ''}/${!!k.channel}`;
          groups.set(key, [...(groups.get(key) ?? []), i]);
        });
        return [...groups.values()].map((list) => {
          const k = kinds[list[0]!]!;
          const names = list.map((i) => i + 1);
          const title = names.length === 1 ? `Pocket ${names[0]}` : `Pockets ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
          return { title, section: pocketSection(scrapThickness(values), k.bit === 'arc' ? (k.angleDeg ?? 3) : POCKET.angleDeg, k.seat, width, !!k.channel, shop.materialCatalog.find((m) => m.id === values.materialId)?.groupId === 'solid-wood') };
        });
      },
      defaults: { materialId: testStock?.id ?? '', bit: scrapBits[0]?.id ?? '', ledgeBit: ledgeBits[0]?.id ?? '', pockets: TEST_START },
      problems: (values) => [
        ...(shop.materialCatalog.some((m) => m.id === values.materialId) ? [] : ["Choose the scrap's material."]),
        ...(jigRows(values, 'pockets').length ? [] : ['Add a pocket to try.']),
        ...testKinds(values).flatMap((k, i) => (k.bit === 'arc' && (k.seat! < LOW_POCKET.seatRange.min - 1e-6 || k.seat! > LOW_POCKET.seatRange.max + 1e-6) ? [`Pocket ${i + 1}: a seat is ${cnc(LOW_POCKET.seatRange.min)} to ${cnc(LOW_POCKET.seatRange.max)} from the edge.`] : [])),
      ],
      // No solid of its own: the page carves its G-code out of the scrap.
      build: async () => [],
      carved: true,
      // Each pocket where the file puts it, drawn from its section, with its pilot drilled or its channel cut.
      drilled: async (values, wasmUrl, view) => {
        const kinds = testKinds(values);
        const tool = scrapBits.find((t) => t.id === values.bit);
        const width = tool ? cutDiameter(tool) : lowBitWidth;
        const t = scrapThickness(values);
        const hardwood = shop.materialCatalog.find((m) => m.id === values.materialId)?.groupId === 'solid-wood';
        const test = buildPocketTest(shopFor({ materials: shop.materialCatalog }, shop), String(values.materialId), kinds, String(values.bit));
        const ledgeTool = shop.tools.find((x) => x.id === values.ledgeBit);
        return buildDrilledScrap(
          test.board,
          t,
          test.pockets.map((p, i) => {
            const k = kinds[i]!;
            const section = pocketSection(t, k.bit === 'arc' ? (k.angleDeg ?? 3) : POCKET.angleDeg, k.seat, width, !!k.channel, hardwood);
            const ledgeWidth = k.bit === 'ball' && ledgeTool ? cutDiameter(ledgeTool) : width;
            return { x: p.x, section, ...(k.ledge ? { ledge: testLedge(section, ledgeWidth, k.seat) } : {}) };
          }),
          wasmUrl,
          view,
        );
      },
      // In sight: how long it takes, and only what needs doing (another bit, a guide to print).
      notes: (values, machineId) => {
        const kinds = testKinds(values);
        const low = kinds.some((k) => k.bit === 'arc' && !k.channel);
        // How long it takes, then each bit in the order it goes in: what it cuts for how long, and at what feeds.
        // On the machine the G-code is posted for: its feeds and speeds, as the file has them.
        const times: string[] = [];
        try {
          const test = buildPocketTest(shopFor({ materials: shop.materialCatalog, machineId }, shop), String(values.materialId), kinds, String(values.bit));
          const about = (seconds: number) => (seconds < 50 ? 'under a minute' : `about ${Math.round(seconds / 60)} min`);
          const feed = (mmPerMin: number) => feedWords(mmPerMin, { ...DEFAULT_UNIT_PREFERENCES, ...shop.units }.feed);
          times.push(`${about(test.tools.reduce((n, t) => n + t.seconds, 0)).replace(/^./, (c) => c.toUpperCase())} to cut${test.tools.length > 1 ? `, and ${test.tools.length - 1 === 1 ? 'a bit change' : `${test.tools.length - 1} bit changes`}` : ''}.`);
          test.tools.forEach((t, i) => {
            const cutsOut = i === test.tools.length - 1;
            const what = cutsOut ? (test.tools.length === 1 ? 'the pockets, then the board cut out' : i > 0 && test.tools.slice(0, i).some((u) => u.toolId === t.toolId) ? 'back in, to cut the board out' : 'cuts the board out') : '';
            times.push(`${t.name}${what ? ` (${what})` : ''}: ${about(t.seconds)}. Feed ${feed(t.feed)}, plunge ${feed(t.plunge)}, ${cnc(t.depthPerPass)} a pass${t.rpm ? `, ${t.rpm} RPM` : ''}.`);
          });
        } catch {
          // What cannot be made is said by the G-code card.
        }
        return [
          ...times,
          ...otherBits(values).map((w) => `Another bit: ${w}.`),
          // A seat that leaves too little of the screw in the other part.
          ...kinds.flatMap((k, i) => {
            if (k.bit !== 'arc' || k.seat! <= farthestSeat(scrapThickness(values)) + 0.01) return [];
            return [`Pocket ${i + 1}: that seat leaves less than ${cnc(POCKET_SCREW.leastInto)} of the screw in the other part.`];
          }),
          ...(low ? ['Drilled low-angle pockets take their own guide: print the pocket-hole drill guide for each angle and seat.'] : []),
        ].filter(Boolean);
      },
      // Kept under "How this works": each kind once, then where to zero and what to look for.
      help: (values) => {
        const kinds = testKinds(values);
        const drilled = kinds.some((k) => !k.channel);
        const words: string[] = [];
        try {
          const test = buildPocketTest(shopFor({ materials: shop.materialCatalog }, shop), String(values.materialId), kinds, String(values.bit));
          const chosen = scrapBits.find((t) => t.id === values.bit);
          const width = chosen && !isBallNose(chosen) ? cutDiameter(chosen) : lowBitWidth;
          const seen = new Map<string, number[]>();
          test.pockets.forEach((p, i) => {
            const key = `${kindWords(p, test.thickness, width)}|${!!p.channel}`;
            seen.set(key, [...(seen.get(key) ?? []), i + 1]);
          });
          for (const [key, list] of seen) {
            const [text, channel] = key.split('|');
            const names = list.length === 1 ? `Pocket ${list[0]}` : `Pockets ${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
            words.push(`${names}. ${text}${channel === 'true' ? `; the screw's way a channel ${cnc(POCKET.drill)} wide, cut open from the face, nothing to drill` : ''}.`);
          }
        } catch {
          // As above.
        }
        return [
          ...words,
          `Pockets go left to right along the board's front edge; two alike make a joint that does not turn. A low-angle pocket's seat is set as on a pocket-hole machine: a screw goes its length less the seat into the other part.`,
          'Each drawing under the picture is cut along its screw. The pocket and a channel are slots down the middle (drawn darker, dashed): the wood either side of them is still there.',
          ...(kinds.some((k) => k.channel) ? ["A channel's floor runs along the screw's underside, so the screw leaves the edge at mid-thickness as a drilled one does. Look at how straight the screws go in, and break the joint to see how it holds against one drilled."] : []),
          `The board is cut out of the stock once its pockets are cut, ${cnc(POCKET_TEST.border)} in from the stock's edges, so the stock's own edges need not be straight or square. Zero at the stock's front-left corner. The board's front edge is the edge the screws leave through${drilled ? ", and the edge the guide's leg goes against" : ''}. Cut the holding tabs and trim them flush, on that edge above all: the other board closes on it.`,
          'What to look for: the seat (does the head sit flat on it), tear-out where the bit comes through it, and the joint pulled tight.',
        ];
      },      gcode: (values, _quantity, machineId) => {
        const kinds = testKinds(values);
        const test = buildPocketTest(shopFor({ materials: shop.materialCatalog, machineId }, shop), String(values.materialId), kinds, String(values.bit));
        const drill = kinds.some((k) => !k.channel) ? `; the pilot bit ${cnc(test.bitOutOfChuck)} out of the chuck` : '; nothing to drill';
        return [{ name: POCKET_TEST_FILE, text: test.text, note: `stock at least ${cnc(test.stock.x)} × ${cnc(test.stock.y)}, the board cut out of it ${cnc(test.board.x)} × ${cnc(test.board.y)}; ${test.pockets.length} pockets; cut with ${test.tools.map((t) => t.name).join(' then ')}${drill}` }];
      },
      fileName: POCKET_TEST_FILE,
    },
    {
      id: 'pocket-cover',
      name: 'Pocket-hole cover',
      group: 'Jigs',
      made: 'print',
      about: 'A plate that lies in a ledge round a pocket hole, flush with the face, to cover it: at 15° or round a low-angle pocket. A rib under it stands in the slot to hold it, and it is hollowed over the screw\'s head.',
      untested: true,
      fields: coverFields,
      defaults: { stock: GUIDE_STOCK[0].id, thickness: testStock?.measuredThickness.mm ?? 19.05, bitId: coverBits.at(-1)?.id ?? '', angle: String(POCKET.angleDeg), seat: LOW_POCKET.seat },
      problems: (values) => (coverBits.some((t) => t.id === values.bitId) ? pocketCoverProblems(coverOf(values)) : ['Choose the flat end mill the ledge was cut with.']),
      build: async (values, wasmUrl) => [{ name: 'Pocket-hole cover', mesh: await buildPocketCover(coverOf(values), wasmUrl), placements: [{ x: 0, y: 0 }] }],
      notes: (values) => {
        const size = coverSize(coverOf(values));
        return [
          `${size.length.toFixed(1)} × ${size.width.toFixed(1)} mm and ${size.thickness} mm thick: the ledge is ${POCKET.ledge.depth} mm deep and ${POCKET.ledge.margin} mm out from the pocket all round.`,
          'It prints face down, without supports. One a pocket: set "How many". Press it in after the screw is driven; a drop of glue under the plate holds it for good.',
          coverOf(values).low
            ? 'A job cuts the ledge where Setup asks for covers (Joints, Pocket holes), and the scrap test does with "A ledge for a printed cover". The same cover fits a pocket cut with either bit; it is for the angle and the seat the job uses.'
            : 'The same cover fits the ledge round a ball nose\'s pocket and round a flat end mill\'s. A job cuts the ledge where Setup asks for covers (Joints, Pocket holes), and the scrap test does with "A ledge for a printed cover".',
        ];
      },
      fileName: 'pocket-hole-cover.3mf',
    },
    {
      id: 'tab-test',
      name: 'Tab-and-slot fit test',
      group: 'Jigs',
      made: 'cnc',
      about: `Two small pieces from a scrap of the stock a job will be cut from: one with a tab, one with ${TAB_TEST_FITS.length} slots through it and ${TAB_TEST_FITS.length} blind ones, each slot a little bigger than the one before. Try the tab in each, and give the machine the fit of the one that suits: every job on tab-and-slot joints cuts its slots by it.`,
      untested: true,
      fields: [
        { key: 'materialId', label: 'Scrap of', kind: 'choice', choices: shop.materialCatalog.map((m) => ({ title: materialTitle(m), value: m.id })), hint: 'The stock the job is cut from: a slot is as wide as it is thick.' },
        {
          key: 'kind',
          label: 'Slots',
          kind: 'choice',
          choices: [
            { title: 'Through the piece, and blind', value: 'both' },
            { title: 'Through the piece only', value: 'through' },
            { title: 'Blind only', value: 'blind' },
          ],
        },
      ],
      defaults: { materialId: testStock?.id ?? '', kind: 'both' },
      problems: (values) => tabTestProblems(tabStock(values.materialId)),
      // No solid of its own: the page carves its G-code out of the scrap.
      build: async () => [],
      carved: true,
      notes: (values) => tabTestNotes(tabStock(values.materialId), tabKind(values), tabFitOf(activeMachine(shopFor({ materials: shop.materialCatalog }, shop)))),
      gcode: (values, quantity, machineId) => {
        const machine = shop.machines.find((m) => m.id === machineId) ?? activeMachine(shopFor({ materials: shop.materialCatalog }, shop));
        return insertFiles(insertCopies(tabTestParts(String(values.materialId), tabStock(values.materialId), tabKind(values), tabFitOf(machine)), quantity), 'tab-fit-test', shop, machineId);
      },
      fileName: 'tab-fit-test.gcode',
    },
    {
      id: 'slide-shims',
      name: 'Slide shims',
      group: 'Jigs',
      made: 'print',
      about: 'Flat pads that pack a build-out strip out to the edge of a drawer opening, behind a face frame.',
      fields: shimFields,
      defaults: { thickness: 2, length: 40, height: 25 },
      problems: (values) => positive(values, shimFields),
      build: async (values) => buildSlideShimObjects({ thickness: num(values, 'thickness'), length: num(values, 'length'), height: num(values, 'height'), quantity: 1 }),
      fileName: 'slide-shims.3mf',
    },
    {
      id: 'slide-jig',
      name: 'Slide jig',
      group: 'Jigs',
      made: 'print',
      about: "A stand that holds a build-out strip or a drawer slide level at its height in a cabinet that is already there, where nothing can be clamped. Print two: one stands on the cabinet's floor near the front, one near the back, and the strip rests on them while it is screwed on.",
      untested: true,
      fields: [{ key: 'height', label: 'Height of the ledge', kind: 'mm', hint: "From the cabinet's floor up to the underside of the strip or the slide." }],
      defaults: { height: 25.4 },
      problems: (values) => slideJigProblems(num(values, 'height')),
      build: async (values) => buildSlideJigObjects([{ height: num(values, 'height'), quantity: 1 }]),
      fileName: 'slide-jig.3mf',
    },
  ];
  const kit: JigItem[] = [
    {
      id: 'support-block',
      name: 'Door support block',
      group: 'Install kit',
      made: 'print',
      about: 'Hooks on the bottom edge of an opening and holds a door at its height while its hinges are screwed on.',
      untested: true,
      fields: blockFields,
      defaults: { height: 12.7 },
      problems: (values) => positive(values, blockFields),
      build: (values, wasmUrl) => buildInstallKitObjects([one('supportBlock', { height: num(values, 'height') })], wasmUrl),
      fileName: 'door-support-block.3mf',
    },
    {
      id: 'gap-shim',
      name: 'Door gap shim',
      group: 'Install kit',
      made: 'print',
      about: 'A flat plate as thick as the gap between a pair of doors, to set it while they are hung.',
      untested: true,
      fields: gapFields,
      defaults: { thickness: 3.175 },
      problems: (values) => positive(values, gapFields),
      build: (values, wasmUrl) => buildInstallKitObjects([one('gapShim', { thickness: num(values, 'thickness') })], wasmUrl),
      fileName: 'door-gap-shim.3mf',
    },
  ];
  return [...handleItems, ...drawerInserts(shop), ...jigs, ...drillJigs(shop), ...kit];
}

/**
 * The three drilling jigs for work done by hand: a shelf-pin jig, a hinge-cup jig and a pull
 * template. Each starts from the shop's hardware: choosing a pin, a hinge or a handle fills in the
 * sizes that come from it, which can then be typed over.
 */
function drillJigs(shop: ShopProfile): JigItem[] {
  const pins = shop.hardware.filter((h): h is ShelfPin => h.kind === 'shelfPin');
  const hinges = shop.hardware.filter((h): h is Hinge => h.kind === 'hinge');
  const pulls = shop.hardware.filter((h): h is Handle => h.kind === 'handle' && h.holes > 0);
  const pin = pins.find((h) => h.generic) ?? pins[0];
  const hinge = hinges.find((h) => h.generic) ?? hinges[0];
  const pull = pulls.find((h) => h.holes === 2) ?? pulls[0];
  const titles = (list: { id: string; name: string }[]) => list.map((h) => ({ title: h.name, value: h.id }));

  const pinFields: JigField[] = [
    { key: 'pinId', label: 'Shelf pin', kind: 'choice', choices: titles(pins), hint: 'Choosing one fills in its hole, spacing and setback.' },
    { key: 'diameter', label: 'Hole (the drill bit)', kind: 'mm' },
    { key: 'spacing', label: 'Between holes', kind: 'mm' },
    { key: 'holes', label: 'How many holes', kind: 'count' },
    { key: 'setback', label: 'Row from the front edge', kind: 'mm' },
    { key: 'thickness', label: 'Plate thickness', kind: 'mm', hint: 'What guides the bit: thicker holds it straighter.' },
  ];
  const pinValues = (v: JigValues): ShelfPinJig => ({ diameter: num(v, 'diameter'), spacing: num(v, 'spacing'), holes: Math.floor(num(v, 'holes')), setback: num(v, 'setback'), thickness: num(v, 'thickness') });

  const dowelFields: JigField[] = [
    { key: 'diameter', label: 'Dowel (the drill bit)', kind: 'mm', hint: '3/8" is 9.525 mm.' },
    { key: 'thickness', label: "The apron's thickness", kind: 'mm', hint: 'The holes are in its middle.' },
    { key: 'setback', label: "Apron in from the leg's face", kind: 'mm', hint: 'The spacer is this thick. 0: flush, and no spacer.' },
    { key: 'fromTop', label: 'First dowel below the top', kind: 'mm' },
    { key: 'spacing', label: 'Between dowels', kind: 'mm' },
    { key: 'dowels', label: 'Dowels a joint', kind: 'count' },
    { key: 'plate', label: 'Plate thickness', kind: 'mm', hint: 'What guides the bit: thicker holds it straighter.' },
  ];
  const dowelValues = (v: JigValues): DowelJig => ({ diameter: num(v, 'diameter'), thickness: num(v, 'thickness'), setback: num(v, 'setback'), fromTop: num(v, 'fromTop'), spacing: num(v, 'spacing'), dowels: Math.floor(num(v, 'dowels')), plate: num(v, 'plate') });

  const hingeFields: JigField[] = [
    { key: 'hingeId', label: 'Hinge', kind: 'choice', choices: titles(hinges), hint: 'Choosing one fills in its cup, bore distance and the place of its screws or dowels.' },
    { key: 'cupDiameter', label: 'Cup', kind: 'mm' },
    { key: 'boreDistance', label: 'Bore distance', kind: 'mm', hint: "Door edge to the cup's edge." },
    { key: 'fromEnd', label: "Cup centre from the door's end", kind: 'mm' },
    { key: 'pilotSpacing', label: 'Screws apart', kind: 'mm' },
    { key: 'pilotSetback', label: "Screws behind the cup's centre", kind: 'mm' },
    { key: 'pilotDiameter', label: 'Pilot hole', kind: 'mm' },
    { key: 'thickness', label: 'Plate thickness', kind: 'mm' },
  ];
  const hingeValues = (v: JigValues): HingeCupJig => ({ cupDiameter: num(v, 'cupDiameter'), boreDistance: num(v, 'boreDistance'), fromEnd: num(v, 'fromEnd'), pilotSpacing: num(v, 'pilotSpacing'), pilotSetback: num(v, 'pilotSetback'), pilotDiameter: num(v, 'pilotDiameter'), thickness: num(v, 'thickness') });

  const pullFields: JigField[] = [
    { key: 'handleId', label: 'Handle', kind: 'choice', choices: titles(pulls), hint: 'Choosing one fills in its hole and, for a pull, its hole centres.' },
    {
      key: 'use',
      label: 'For',
      kind: 'choice',
      choices: [
        { title: 'A door: at its corner', value: 'door' },
        { title: 'A drawer front: across its middle', value: 'drawer' },
      ],
    },
    { key: 'spacing', label: 'Hole centres', kind: 'mm', hint: '0 for a knob: one hole.' },
    { key: 'diameter', label: 'Hole (the drill bit)', kind: 'mm' },
    { key: 'fromEdge', label: "In from the door's edge", kind: 'mm', hint: 'A door only: the edge away from the hinges.' },
    { key: 'fromEnd', label: 'From the end (a drawer: below its top)', kind: 'mm' },
    {
      key: 'hand',
      label: 'Hand',
      kind: 'choice',
      choices: [
        { title: "Left: the door's edge on the left", value: 'left' },
        { title: "Right: the door's edge on the right", value: 'right' },
      ],
      hint: 'A door only.',
    },
    { key: 'thickness', label: 'Plate thickness', kind: 'mm' },
  ];
  const pullValues = (v: JigValues): PullTemplate => ({
    use: v.use === 'drawer' ? 'drawer' : 'door',
    holes: num(v, 'spacing') > 0 ? 2 : 1,
    spacing: num(v, 'spacing'),
    diameter: num(v, 'diameter'),
    fromEdge: num(v, 'fromEdge'),
    fromEnd: num(v, 'fromEnd'),
    hand: v.hand === 'right' ? 'right' : 'left',
    thickness: num(v, 'thickness'),
  });

  return [
    {
      id: 'shelf-pin-jig',
      name: 'Shelf-pin jig',
      group: 'Jigs',
      made: 'print',
      about: "A strip with a row of guide holes at the pin's spacing and a fence that sets the row back from the case's front edge. A pin through its first hole into the last hole drilled steps it up the side.",
      untested: true,
      fields: pinFields,
      defaults: { pinId: pin?.id ?? '', diameter: pin?.hole.diameter ?? 5, spacing: pin?.rows.spacing ?? 32, holes: 6, setback: pin?.rows.frontSetback ?? 37, thickness: 10 },
      follow: (key, value): JigValues => {
        const chosen = key === 'pinId' ? pins.find((h) => h.id === value) : undefined;
        return chosen ? { diameter: chosen.hole.diameter, spacing: chosen.rows.spacing, setback: chosen.rows.frontSetback } : {};
      },
      problems: (values) => shelfPinJigProblems(pinValues(values)),
      build: (values, wasmUrl) => buildShelfPinJig(pinValues(values), wasmUrl),
      fileName: 'shelf-pin-jig.3mf',
    },
    {
      id: 'hinge-cup-jig',
      name: 'Hinge-cup jig',
      group: 'Jigs',
      made: 'print',
      about: "A plate with a fence against the door's edge and a stop against its end: a guide hole for the cup bit at the hinge's bore distance, and two pilot holes for its screws or dowels.",
      untested: true,
      fields: hingeFields,
      defaults: { hingeId: hinge?.id ?? '', ...hingeSizes(hinge), thickness: 8 },
      follow: (key, value) => (key === 'hingeId' ? hingeSizes(hinges.find((h) => h.id === value)) : {}),
      problems: (values) => hingeCupJigProblems(hingeValues(values)),
      build: (values, wasmUrl) => buildHingeCupJig(hingeValues(values), wasmUrl),
      fileName: 'hinge-cup-jig.3mf',
    },
    {
      id: 'pull-template',
      name: 'Pull-drilling template',
      group: 'Jigs',
      made: 'print',
      about: "A plate that puts a knob's hole or a pull's two holes where Design puts them: at a door's corner, on a fence against its end and one against its edge, or across the middle of a drawer front, on a fence against its top and a centre line.",
      untested: true,
      fields: pullFields,
      defaults: { handleId: pull?.id ?? '', use: 'door', spacing: pull?.holes === 2 ? pull.spacing : 0, diameter: pull?.hole.diameter ?? 5, fromEdge: DEFAULT_DOOR_HANDLE.fromEdge.mm, fromEnd: DEFAULT_DOOR_HANDLE.fromEnd.mm, hand: 'left', thickness: 6 },
      follow: (key, value): JigValues => {
        const chosen = key === 'handleId' ? pulls.find((h) => h.id === value) : undefined;
        return chosen ? { spacing: chosen.holes === 2 ? chosen.spacing : 0, diameter: chosen.hole.diameter } : {};
      },
      problems: (values) => pullTemplateProblems(pullValues(values)),
      build: (values, wasmUrl) => buildPullTemplate(pullValues(values), wasmUrl),
      fileName: 'pull-template.3mf',
    },
    {
      id: 'dowel-jig',
      name: 'Dowel jig for aprons and legs',
      group: 'Jigs',
      made: 'print',
      about: "A plate with a fence and an end stop that drills both halves of a table's apron-to-leg joint so that the dowels meet: on the leg with its fence against the leg's outside face, on the apron's end with the printed spacer between. Its sizes are a table's: the apron's thickness and how far it stands in from the legs.",
      untested: true,
      fields: dowelFields,
      defaults: { diameter: 9.525, thickness: 19.05, setback: 6.35, fromTop: 25.4, spacing: 50.8, dowels: 2, plate: 12 },
      problems: (values) => dowelJigProblems(dowelValues(values)),
      build: (values, wasmUrl) => buildDowelJig(dowelValues(values), wasmUrl),
      fileName: 'dowel-jig.3mf',
    },
  ];
}

/**
 * What a hinge-cup jig takes from a hinge: its cup, its bore distance, where its cup is from the door's
 * end, and its dowels where it has them. A screw-on hinge says nothing of its screws: the usual 45 mm
 * apart, 9.5 mm behind the cup's centre, for a pilot of 2 mm (tune me).
 */
function hingeSizes(hinge?: Hinge): JigValues {
  return {
    cupDiameter: hinge?.cup.diameter ?? 35,
    boreDistance: hinge?.cup.boreDistance ?? 3,
    fromEnd: hinge?.placement.fromEnd.mm ?? 88.9,
    pilotSpacing: hinge?.dowels?.spacing ?? 45,
    pilotSetback: hinge?.dowels?.setback ?? 9.5,
    pilotDiameter: hinge?.dowels?.diameter ?? 2,
  };
}

/** The size of a mesh on the bed, from its points. */
function footprint(object: PrintObject): { x: Mm; y: Mm } {
  const p = object.mesh.positions;
  let [x, y] = [0, 0];
  for (let i = 0; i < p.length; i += 3) {
    x = Math.max(x, p[i]!);
    y = Math.max(y, p[i + 1]!);
  }
  return { x, y };
}

/**
 * The objects with `quantity` copies of each on the print bed, in rows of four, each object's copies
 * under the one before. An item's `build` gives one of each.
 */
export function withCopies(objects: PrintObject[], quantity: number, spacing: Mm = 8, perRow = 4): PrintObject[] {
  const n = Math.max(1, Math.floor(quantity) || 1);
  let rowY = 0;
  return objects.map((object) => {
    const size = footprint(object);
    const first = object.placements[0] ?? { x: 0, y: 0 };
    const placements = Array.from({ length: n }, (_, i) => ({ x: first.x + (i % perRow) * (size.x + spacing), y: rowY + Math.floor(i / perRow) * (size.y + spacing) }));
    rowY += Math.ceil(n / perRow) * (size.y + spacing);
    return { ...object, placements };
  });
}

/** How far a made handle stands off the front, for the page's words. */
export const handleStandsOff = (handle: Handle): Mm => handleHeight(handle);

/**
 * Inserts for drawers that are already there: dividers, a knife insert and a spice
 * insert, each cut to one measured drawer. The fields are the drawer's inside and what the insert is
 * made of; the picture is the insert as it stands in the drawer, the output its parts' G-code.
 */
function drawerInserts(shop: ShopProfile): JigItem[] {
  const sheets = shop.materialCatalog.filter((m) => m.groupId !== 'solid-wood' || m.measuredThickness.mm <= 20);
  const choices = (list: typeof sheets) => list.map((m) => ({ title: materialTitle(m), value: m.id }));
  const thin = sheets.filter((m) => m.measuredThickness.mm <= 7);
  const thick = sheets.filter((m) => m.measuredThickness.mm >= 15 && m.measuredThickness.mm <= 20);
  const thicknessOf = (id: unknown) => shop.materialCatalog.find((m) => m.id === id)?.measuredThickness.mm ?? 0;
  const nameOf = (id: Id) => {
    const m = shop.materialCatalog.find((x) => x.id === id);
    return m ? materialTitle(m) : id;
  };
  const drawer: JigField[] = [
    { key: 'width', label: "Drawer's inside width", kind: 'mm', hint: 'Between its two sides.' },
    { key: 'depth', label: "Drawer's inside depth", kind: 'mm', hint: 'From the inside of its front to the inside of its back.' },
    { key: 'height', label: "Drawer's inside height", kind: 'mm', hint: 'From its bottom up to the top edge of its lowest side.' },
  ];
  const inside = { width: 400, depth: 500, height: 90 };
  const needs = (values: JigValues, key: string, label: string) => (shop.materialCatalog.some((m) => m.id === values[key]) ? [] : [`Choose ${label}.`]);
  const files = (parts: ReturnType<typeof dividerParts>, slug: string, quantity: number, machineId: Id) => insertFiles(insertCopies(parts, quantity), slug, shop, machineId);

  const dividerFields: JigField[] = [
    ...drawer,
    { key: 'rows', label: 'Dividers from side to side', kind: 'count' },
    { key: 'columns', label: 'Dividers from front to back', kind: 'count' },
    { key: 'materialId', label: 'Cut from', kind: 'choice', choices: choices(sheets), hint: 'Thin stock: the slots are as wide as it is thick.' },
  ];
  const dividersOf = (v: JigValues): Dividers => ({ width: num(v, 'width'), depth: num(v, 'depth'), height: num(v, 'height'), rows: Math.floor(num(v, 'rows')), columns: Math.floor(num(v, 'columns')) });
  const dividerPartsOf = (v: JigValues) => dividerParts(dividersOf(v), String(v.materialId), thicknessOf(v.materialId));

  const knifeFields: JigField[] = [
    { key: 'width', label: "Drawer's inside width", kind: 'mm', hint: 'Between its two sides: the board lies across it.' },
    { key: 'length', label: 'Board, front to back', kind: 'mm', hint: 'As long as the longest knife, handle and all, and no longer than the drawer is deep.' },
    { key: 'blade', label: 'Longest blade', kind: 'mm', hint: 'The slots are this long, from the back of the board.' },
    { key: 'slot', label: 'Slot width', kind: 'mm', hint: 'The bit that cuts it, or wider: a 1/8" end mill cuts 3.2 mm.' },
    { key: 'slotDepth', label: 'Slot depth', kind: 'mm' },
    { key: 'spacing', label: 'Between slots', kind: 'mm' },
    { key: 'materialId', label: 'Cut from', kind: 'choice', choices: choices(thick.length ? thick : sheets) },
  ];
  const knifeOf = (v: JigValues): KnifeInsert => ({ width: num(v, 'width'), length: num(v, 'length'), blade: num(v, 'blade'), slot: num(v, 'slot'), slotDepth: num(v, 'slotDepth'), spacing: num(v, 'spacing') });

  const spiceFields: JigField[] = [
    ...drawer,
    { key: 'jar', label: 'A jar, across', kind: 'mm' },
    { key: 'jarHeight', label: 'A jar, its height', kind: 'mm', hint: 'With its lid.' },
    { key: 'supportId', label: 'Supports cut from', kind: 'choice', choices: choices(thick.length ? thick : sheets) },
    { key: 'slatId', label: 'Slats cut from', kind: 'choice', choices: choices(thin.length ? thin : sheets) },
  ];
  const binsOf = (v: JigValues): TrayBins => ({ width: num(v, 'width'), depth: num(v, 'depth'), columns: Math.floor(num(v, 'columns')), rows: Math.floor(num(v, 'rows')), height: num(v, 'height'), wall: num(v, 'wall') });
  const dividerOf = (v: JigValues): TrayDivider => ({ length: num(v, 'length'), height: num(v, 'height'), thickness: num(v, 'thickness') });
  const caddyOf = (v: JigValues): Caddy => ({ length: num(v, 'length'), width: num(v, 'width'), height: num(v, 'height') });
  const spiceOf = (v: JigValues): SpiceInsert => ({ width: num(v, 'width'), depth: num(v, 'depth'), height: num(v, 'height'), jar: num(v, 'jar'), jarHeight: num(v, 'jarHeight') });
  const spicePartsOf = (v: JigValues) => spiceParts(spiceOf(v), String(v.supportId), thicknessOf(v.supportId), String(v.slatId), thicknessOf(v.slatId));

  return [
    {
      id: 'drawer-dividers',
      name: 'Drawer dividers',
      group: 'Drawer inserts',
      made: 'cnc',
      about: 'Strips on edge that cross in half-lap slots and drop into a drawer that is already there: an egg crate cut to its measured inside. No glue is needed; a drop in each slot keeps it together out of the drawer.',
      untested: true,
      fields: dividerFields,
      defaults: { ...inside, rows: 1, columns: 2, materialId: (thin[0] ?? sheets[0])?.id ?? '' },
      problems: (v) => [...needs(v, 'materialId', "the dividers' material"), ...(thicknessOf(v.materialId) ? dividerProblems(dividersOf(v), thicknessOf(v.materialId)) : [])],
      build: (v, wasmUrl) => insertObjects(dividerPartsOf(v), wasmUrl),
      gcode: (v, quantity, machineId) => files(dividerPartsOf(v), 'drawer-dividers', quantity, machineId),
      notes: (v) => [
        ...insertPartLines(dividerPartsOf(v), nameOf),
        'The strips from side to side are slotted from their top edge, the ones from front to back from their bottom edge: they are the same part turned over. Each slot is a hair over half the height, so the tops come level.',
        `It is ${INSERT_NOTE.play} mm smaller than the drawer each way and stands ${INSERT_NOTE.under} mm under its top edge. The inside corners of a slot are as round as the bit: if a strip does not seat, ease them with a knife or a file.`,
      ],
      fileName: 'drawer-dividers.gcode',
    },
    {
      id: 'knife-insert',
      name: 'Knife insert',
      group: 'Drawer inserts',
      made: 'cnc',
      about: 'A board that lies in a drawer with a row of slots cut into it from its back end. Each slot takes a blade, edge down; the handles lie on the board in front of the slots.',
      untested: true,
      fields: knifeFields,
      defaults: { width: inside.width, length: 420, blade: 230, slot: 3.2, slotDepth: 10, spacing: 30, materialId: (thick[0] ?? sheets[0])?.id ?? '' },
      problems: (v) => [...needs(v, 'materialId', "the board's material"), ...(thicknessOf(v.materialId) ? knifeProblems(knifeOf(v), thicknessOf(v.materialId)) : [])],
      build: (v, wasmUrl) => insertObjects(knifeParts(knifeOf(v), String(v.materialId), thicknessOf(v.materialId)), wasmUrl),
      gcode: (v, quantity, machineId) => files(knifeParts(knifeOf(v), String(v.materialId), thicknessOf(v.materialId)), 'knife-insert', quantity, machineId),
      notes: (v) => [
        ...insertPartLines(knifeParts(knifeOf(v), String(v.materialId), thicknessOf(v.materialId)), nameOf),
        `${knifeSlots(knifeOf(v))} slots, ${num(v, 'spacing')} mm apart. A blade deeper than the slot stands proud of the board: check the drawer still closes over the tallest knife.`,
        'Sand the slots\' edges and finish the board with something safe for a kitchen (mineral oil, or nothing).',
      ],
      fileName: 'knife-insert.gcode',
    },
    {
      id: 'spice-insert',
      name: 'Spice insert',
      group: 'Drawer inserts',
      made: 'cnc',
      about: 'Jars lying tilted in tiers, labels up. Saw-tooth supports stand on edge from front to back; a thin slat is glued across them on each slope, and the step in front of each tier stops its jars.',
      untested: true,
      fields: spiceFields,
      defaults: { ...inside, height: 110, jar: 48, jarHeight: 110, supportId: (thick[0] ?? sheets[0])?.id ?? '', slatId: (thin[0] ?? sheets[0])?.id ?? '' },
      problems: (v) => [...needs(v, 'supportId', "the supports' material"), ...needs(v, 'slatId', "the slats' material"), ...(thicknessOf(v.supportId) && thicknessOf(v.slatId) ? spiceProblems(spiceOf(v), thicknessOf(v.slatId)) : [])],
      build: (v, wasmUrl) => insertObjects(spicePartsOf(v), wasmUrl),
      gcode: (v, quantity, machineId) => files(spicePartsOf(v), 'spice-insert', quantity, machineId),
      notes: (v) => {
        const layout = spiceLayout(spiceOf(v), thicknessOf(v.slatId));
        const across = Math.max(0, Math.floor((num(v, 'width') - 1.5) / (num(v, 'jar') + 3)));
        return [
          ...insertPartLines(spicePartsOf(v), nameOf),
          `${layout.tiers} ${layout.tiers === 1 ? 'tier' : 'tiers'} of about ${across} jars: ${layout.tiers * across} in all. Each tier takes ${layout.run.toFixed(0)} mm of the drawer's depth, and the jars stand ${Math.ceil(layout.needs)} mm high at the back of a tier.`,
          'Glue each slat across the supports on its slope, its lower edge against the step. The supports stand on the drawer\'s bottom: a dab of glue or a strip of tape under them keeps the insert from sliding.',
        ];
      },
      fileName: 'spice-insert.gcode',
    },
    {
      id: 'caddy',
      name: 'Caddy that lifts out',
      group: 'Drawer inserts',
      made: 'cnc',
      about: 'An open box with a board down its middle that stands over the sides and has a hand hole: for the bottles and brushes under a sink, carried to where they are used. It stands on a tray or on the floor of the cabinet.',
      untested: true,
      fields: [
        { key: 'length', label: 'Length', kind: 'mm' },
        { key: 'width', label: 'Width', kind: 'mm' },
        { key: 'height', label: 'Height of its sides', kind: 'mm', hint: 'The middle board stands 70 mm over them. Check the whole height passes under what is over it.' },
        { key: 'materialId', label: 'Cut from', kind: 'choice', choices: choices(sheets) },
      ],
      defaults: { length: 350, width: 220, height: 120, materialId: (sheets.find((m) => m.measuredThickness.mm > 10 && m.measuredThickness.mm < 15) ?? thick[0] ?? sheets[0])?.id ?? '' },
      problems: (v) => [...needs(v, 'materialId', "the caddy's material"), ...(thicknessOf(v.materialId) ? caddyProblems(caddyOf(v), thicknessOf(v.materialId)) : [])],
      build: (v, wasmUrl) => insertObjects(caddyParts(caddyOf(v), String(v.materialId), thicknessOf(v.materialId)), wasmUrl),
      gcode: (v, quantity, machineId) => files(caddyParts(caddyOf(v), String(v.materialId), thicknessOf(v.materialId)), 'caddy', quantity, machineId),
      notes: (v) => [
        ...insertPartLines(caddyParts(caddyOf(v), String(v.materialId), thicknessOf(v.materialId)), nameOf),
        'Glue and pin the ends between the sides, the bottom inside the four, and the middle board from end to end on the bottom. Round the edges of the hand hole.',
        `It stands ${Math.round(num(v, 'height') + 70)} mm high with its handle: check that passes under the trap, or under the tray above it.`,
      ],
      fileName: 'caddy.gcode',
    },
    {
      id: 'tray-bins',
      name: 'Printed bins for a tray',
      group: 'Drawer inserts',
      made: 'print',
      about: "Open bins that share out the inside of a roll-out tray or a drawer in a grid: they stand side by side and lift out one at a time. Measure the tray's inside (Design says it for each tray it makes), and say how many bins each way.",
      untested: true,
      fields: [
        { key: 'width', label: "Tray's inside, across", kind: 'mm' },
        { key: 'depth', label: "Tray's inside, front to back", kind: 'mm' },
        { key: 'columns', label: 'Bins across', kind: 'count' },
        { key: 'rows', label: 'Bins front to back', kind: 'count' },
        { key: 'height', label: 'Height', kind: 'mm', hint: "Under the tray's walls: a tray's are 89 mm (3-1/2 in)." },
        { key: 'wall', label: 'Wall thickness', kind: 'mm' },
      ],
      defaults: { width: 480, depth: 480, columns: 3, rows: 3, height: 60, wall: 1.6 },
      problems: (v) => trayBinProblems(binsOf(v)),
      build: (v, wasmUrl) => buildTrayBinObjects(binsOf(v), 1, wasmUrl),
      notes: (v) => {
        const size = trayBinSize(binsOf(v));
        const count = Math.floor(num(v, 'columns')) * Math.floor(num(v, 'rows'));
        return [
          `Each bin is ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(0)} mm outside. The tray takes ${count}: set "How many" to print them all, or fewer to leave part of the tray open.`,
          'They print as they stand, with no supports. Bins of two sizes in one tray: work one size out for part of the width, then the other for the rest.',
        ];
      },
      fileName: 'tray-bins.3mf',
    },
    {
      id: 'tray-divider',
      name: 'Printed divider for a tray',
      group: 'Drawer inserts',
      made: 'print',
      about: 'A thin wall on a foot that stands across a tray or a drawer and is stuck down with double-sided tape, to keep tall things from sliding. As long as the tray is wide inside, or deep.',
      untested: true,
      fields: [
        { key: 'length', label: "Length: the tray's inside", kind: 'mm' },
        { key: 'height', label: 'Height', kind: 'mm' },
        { key: 'thickness', label: 'Thickness', kind: 'mm' },
      ],
      defaults: { length: 240, height: 60, thickness: 2 },
      problems: (v) => trayDividerProblems(dividerOf(v)),
      build: async (v, wasmUrl) => [{ name: 'Tray divider', mesh: await buildTrayDivider(dividerOf(v), wasmUrl), placements: [{ x: 0, y: 0 }] }],
      notes: () => ['It is 0.8 mm shorter than the length given, to drop in. Its foot is 16 mm wide: a strip of double-sided tape under it holds it.'],
      fileName: 'tray-divider.3mf',
    },
  ];
}
