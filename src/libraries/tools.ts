import type { BitSettings, BitShape, Length, Material, RouterBit } from '@/model';
import { MM_PER_INCH, formatLength, len } from '@/units';
import { MATERIAL_TYPES, MDF_TYPE_ID } from './materials';

/**
 * The speed the starter bits are set to: dial 2 on the starter machine's Makita router. A placeholder like the
 * feeds: tune me.
 */
export const STARTER_RPM = 12000;

/**
 * Every feed, depth and dial value here is a conservative placeholder. The feeds are whole numbers of
 * mm/s, kept in mm/min: multiples of 60. The stepovers are steps of 5% of the bit's
 * width, kept in mm: 40% for the end mills, 50% for the ball nose. Each feed puts the bit's chip load inside
 * its usual range (`chipLoadRange`).
 */
const TUNE_SETTINGS = ['settings'];

/**
 * A bit's settings are kept by material type: every thickness of a type cuts on
 * the same feeds. Each type starts on a copy of the MDF values until it is tuned.
 */
function mdf(settings: BitSettings, solidWood: Partial<BitSettings> = {}): Record<string, BitSettings> {
  // Solid wood cuts on a smaller chip load (`CHIP_LOAD_LOW_TYPES`): a slower feed where the bit needs one.
  return Object.fromEntries(MATERIAL_TYPES.map((type) => [type.id, { ...settings, ...(type.id === 'solid-wood' ? solidWood : {}) }]));
}

/**
 * Gives a bit its type's settings under each of these materials' ids, which is how a job looks them
 * up (`toolSettings(tool, materialId)`). A material of a type the bit has no settings for gets
 * none, so the bit is not offered for it; one with no type (saved before types) cuts on MDF's.
 * Settings already under a material's id are kept. Returns the bits, copied where one changed.
 */
export function withMaterialSettings<T extends Pick<RouterBit, 'settings'>>(tools: T[], materials: Pick<Material, 'id' | 'groupId'>[]): T[] {
  return tools.map((tool) => {
    const added: Record<string, BitSettings> = {};
    for (const m of materials) {
      const from = tool.settings[m.groupId ?? MDF_TYPE_ID];
      if (from && !tool.settings[m.id]) added[m.id] = from;
    }
    return Object.keys(added).length ? { ...tool, settings: { ...tool.settings, ...added } } : tool;
  });
}

export type BitKind = BitShape['kind'];

/** One value of a bit's shape: `key` is its name in that kind's `BitShape`. */
export interface BitField {
  key: string;
  label: string;
  /** `length`: a `Length` (typed with a unit); `mm`: a bare number of mm; `cut`: up, down or compression. */
  unit: 'length' | 'mm' | 'degrees' | 'count' | 'cut';
  /** May be left empty: a cutting length not measured yet, a V-bit with no flat on its point. */
  optional?: boolean;
}

/**
 * A kind of bit. The kinds come with the app, as the material types do: one for
 * each shape cnc-gcode-tools draws. A bit in the library is a size of one.
 */
export interface BitType {
  kind: BitKind;
  /** For a heading: "End mills". */
  name: string;
  /** For a bit: "end mill". */
  singular: string;
  /** Its SHAPE in a `(ToolDef ...)` comment. */
  toolDefShape: 'flat' | 'ball' | 'bullnose' | 'vbit' | 'chamfer' | 'taperball' | 'roundover';
  /** The field a bit of this kind is known by: its diameter, its angle, its radius. */
  sizeField: string;
  fields: BitField[];
}

const CUTTING_LENGTH: BitField = { key: 'cuttingLength', label: 'Cutting length', unit: 'length', optional: true };
const FLUTES: BitField = { key: 'flutes', label: 'Flutes', unit: 'count' };
/** For the kinds whose flutes only matter for the chip load: left empty until they are counted. */
const OPTIONAL_FLUTES: BitField = { ...FLUTES, optional: true };
const DIAMETER: BitField = { key: 'diameter', label: 'Diameter', unit: 'length' };
/** A bit sold by a diameter has two: the one it is sold as (`nominal`, which names it) and the one it measures, which cuts. */
const SOLD_AS: BitField = { key: 'nominal', label: 'Sold as', unit: 'length' };
const MEASURED: BitField = { key: 'diameter', label: 'Measured', unit: 'length' };
const ANGLE: BitField = { key: 'angleDeg', label: 'Angle', unit: 'degrees' };
const MAX_DIAMETER: BitField = { key: 'maxDiameter', label: 'Max width', unit: 'length' };
const MAX_DEPTH: BitField = { key: 'maxDepth', label: 'Deepest cut', unit: 'mm' };

/** What each kind of bit is: its name, its fields, the shape the G-code preview draws it as. */
export const BIT_TYPES: BitType[] = [
  {
    kind: 'endMill',
    name: 'End mills',
    singular: 'end mill',
    toolDefShape: 'flat',
    sizeField: 'diameter',
    fields: [SOLD_AS, MEASURED, CUTTING_LENGTH, FLUTES, { key: 'cut', label: 'Cut', unit: 'cut' }],
  },
  { kind: 'ballNose', name: 'Ball nose bits', singular: 'ball nose', toolDefShape: 'ball', sizeField: 'diameter', fields: [SOLD_AS, MEASURED, CUTTING_LENGTH, FLUTES] },
  {
    kind: 'bullNose',
    name: 'Bull nose bits',
    singular: 'bull nose',
    toolDefShape: 'bullnose',
    sizeField: 'diameter',
    fields: [SOLD_AS, MEASURED, { key: 'cornerRadius', label: 'Corner radius', unit: 'length' }, CUTTING_LENGTH, FLUTES],
  },
  {
    kind: 'vBit',
    name: 'V-bits',
    singular: 'V-bit',
    toolDefShape: 'vbit',
    sizeField: 'angleDeg',
    fields: [ANGLE, MAX_DIAMETER, MAX_DEPTH, { key: 'tipDiameter', label: 'Flat tip', unit: 'length', optional: true }, OPTIONAL_FLUTES],
  },
  {
    kind: 'chamfer',
    name: 'Chamfer bits',
    singular: 'chamfer bit',
    toolDefShape: 'chamfer',
    sizeField: 'angleDeg',
    fields: [ANGLE, MAX_DIAMETER, { key: 'tipDiameter', label: 'Flat tip', unit: 'length' }, MAX_DEPTH, OPTIONAL_FLUTES],
  },
  {
    kind: 'taperBall',
    name: 'Tapered ball nose bits',
    singular: 'tapered ball nose',
    toolDefShape: 'taperball',
    sizeField: 'ballDiameter',
    fields: [{ ...SOLD_AS, label: 'Ball sold as' }, { key: 'ballDiameter', label: 'Ball measured', unit: 'length' }, { ...ANGLE, label: 'Taper angle' }, MAX_DIAMETER, CUTTING_LENGTH, FLUTES],
  },
  {
    kind: 'roundover',
    name: 'Roundover bits',
    singular: 'roundover bit',
    toolDefShape: 'roundover',
    sizeField: 'radius',
    fields: [
      { key: 'radius', label: 'Radius', unit: 'length' },
      { key: 'tipDiameter', label: 'Tip diameter', unit: 'length' },
      DIAMETER,
      OPTIONAL_FLUTES,
    ],
  },
];

export function bitType(kind: BitKind): BitType {
  return BIT_TYPES.find((t) => t.kind === kind)!;
}

/** A length as a bit's size is said: `1/4"` when it was typed in inches and is a 64th, else `6 mm`. */
function sizeText(length: Length): string {
  const sixtyFourths = (length.mm / MM_PER_INCH) * 64;
  if (length.unit !== 'mm' && Math.abs(sixtyFourths - Math.round(sixtyFourths)) < 1e-6) return formatLength(length.mm, { kind: 'fractionalInch', denominator: 64 });
  return formatLength(length.mm, { kind: 'mm', places: 3 });
}

/** Whether a kind of bit is sold by a diameter, and so has a nominal one beside the one it measures. */
export const hasNominal = (kind: BitKind): boolean => bitType(kind).fields.some((f) => f.key === 'nominal');

/**
 * The diameter a bit is sold as: its own `nominal`, else the one it measures (the two are the same
 * until the bit is measured). Undefined for a kind not sold by a diameter that is cut to (a V-bit, a
 * chamfer bit, a roundover bit).
 */
export function nominalDiameter(shape: BitShape): Length | undefined {
  if (!hasNominal(shape.kind)) return undefined;
  const bag = shape as unknown as Record<string, Length | undefined>;
  return bag.nominal ?? bag[bitType(shape.kind).sizeField];
}

/** The size a bit is known by: an end mill's diameter (`1/4"`), a V-bit's angle (`60°`), a roundover's radius. */
export function bitSize(shape: BitShape): string {
  const value = nominalDiameter(shape) ?? (shape as unknown as Record<string, Length | number>)[bitType(shape.kind).sizeField]!;
  return typeof value === 'number' ? `${Number(value.toFixed(2))}°` : sizeText(value);
}

/** What a bit is called when it has no name of its own: its size and its kind, `1/4" end mill`, `60° V-bit`. */
export function bitAutoName(shape: BitShape): string {
  return `${bitSize(shape)} ${bitType(shape.kind).singular}`;
}

/** A bit's own name; empty when it goes by its size and kind. */
export function bitOwnName(tool: Pick<RouterBit, 'name' | 'shape'>): string {
  return tool.name === bitAutoName(tool.shape) ? '' : tool.name;
}

/** Names a bit; an empty name puts it back on its size and kind. */
export function setBitName(tool: Pick<RouterBit, 'name' | 'shape'>, name: string): void {
  tool.name = name.trim() || bitAutoName(tool.shape);
}

/**
 * Sets one value of a bit's shape (a key of its kind's `fields`). A bit that goes by its size and kind
 * is renamed with it, and the value is no longer a placeholder ("tune me").
 */
export function setBitField(tool: Pick<RouterBit, 'name' | 'shape' | 'tuneMe'> & Partial<Pick<RouterBit, 'settings'>>, key: string, value: Length | number | string | null): void {
  const field = bitType(tool.shape.kind).fields.find((f) => f.key === key);
  if (!field) return;
  const auto = bitOwnName(tool) === '';
  const shape = tool.shape as unknown as Record<string, unknown>;
  const widthBefore = bitWidth(tool.shape);
  const size = bitType(tool.shape.kind).sizeField;
  if (key === 'nominal') {
    // What it is sold as. A bit not measured yet measures what it is sold as: the two move together.
    if (!value) return;
    if (tool.tuneMe.includes(size)) {
      shape[size] = { ...(value as Length) };
      delete shape.nominal;
    } else shape.nominal = value;
  } else if (key === size && hasNominal(tool.shape.kind)) {
    // What it measures. The size it is sold as, and its name, stay as they were.
    shape.nominal ??= shape[size];
    shape[key] = value;
    if ((shape.nominal as Length).mm === (value as Length).mm && (shape.nominal as Length).unit === (value as Length).unit) delete shape.nominal;
  } else if (value === null && field.optional && field.key !== 'cuttingLength') delete shape[key];
  else shape[key] = value;
  // A stepover is thought of as a share of the bit's width: a bit made wider or narrower keeps its share.
  const width = bitWidth(tool.shape);
  if (width !== widthBefore && widthBefore > 0 && width > 0) {
    for (const settings of Object.values(tool.settings ?? {})) settings.stepover = Number(((settings.stepover * width) / widthBefore).toFixed(3));
  }
  if (auto) tool.name = bitAutoName(tool.shape);
  if (key !== 'nominal') tool.tuneMe = tool.tuneMe.filter((k) => k !== key);
}

/** The six feeds and speeds of a bit in a material type, in the order the Shop page shows them. */
export const BIT_SETTING_FIELDS: {
  key: keyof BitSettings;
  label: string;
  unit: string;
  /** May be 0. */
  zero?: boolean;
  /** May be left empty. */
  optional?: boolean;
  /** A feed: stored in mm/min, as the G-code wants it, and shown and typed in mm/s. */
  perSecond?: boolean;
  /** The stepover: stored in mm, and shown and typed as a percentage of the bit's width. */
  ofWidth?: boolean;
}[] = [
  { key: 'feed', label: 'Feed', unit: 'mm/s', perSecond: true },
  { key: 'plungeFeed', label: 'Plunge', unit: 'mm/s', perSecond: true },
  { key: 'depthPerPass', label: 'Depth per pass', unit: 'mm' },
  { key: 'stepover', label: 'Stepover', unit: '% of width', zero: true, ofWidth: true },
  { key: 'rpm', label: 'RPM', unit: 'RPM' },
  { key: 'finishAllowance', label: 'Finish allowance', unit: 'mm', zero: true, optional: true },
];

/** A feed as it is shown: mm/s, to two places, from the mm/min it is stored in. */
export function feedPerSecond(mmPerMin: number): number {
  return Number((mmPerMin / 60).toFixed(2));
}

/** A bit at its widest, in mm: what a stepover is a share of. */
export function bitWidth(shape: BitShape): number {
  return shape.kind === 'vBit' || shape.kind === 'chamfer' || shape.kind === 'taperBall' ? shape.maxDiameter.mm : shape.diameter.mm;
}

/** A stepover as it is shown: a percentage of the bit's width, to one place, from the mm it is stored in. */
export function stepoverPercent(shape: BitShape, mm: number): number {
  const width = bitWidth(shape);
  return width > 0 ? Number(((mm / width) * 100).toFixed(1)) : 0;
}

/** The stepover in mm, to three places, that is this percentage of the bit's width. */
export function stepoverForPercent(shape: BitShape, percent: number): number {
  return Number(((bitWidth(shape) * percent) / 100).toFixed(3));
}

/** Stepovers go in steps of this many percent of the bit's width. */
export const STEPOVER_STEP = 5;

/**
 * A stepover in mm moved to the nearest step of the bit's width: 5%, 10% ... 100%. None stays none; any
 * at all is one step at least.
 */
export function snapStepover(shape: BitShape, mm: number): number {
  const width = bitWidth(shape);
  if (!(mm > 0) || width <= 0) return 0;
  const percent = Math.min(100, Math.max(STEPOVER_STEP, Math.round(((mm / width) * 100) / STEPOVER_STEP) * STEPOVER_STEP));
  return stepoverForPercent(shape, percent);
}

/** How many flutes a bit has, when its shape says. */
export function flutesOf(shape: BitShape): number | undefined {
  return shape.flutes && shape.flutes > 0 ? shape.flutes : undefined;
}

/**
 * Chip load: how much each flute takes at the full feed, in mm per tooth: feed / (RPM x flutes).
 * Undefined when the bit's flutes are not known. It is what the feed and the speed are tuned to.
 */
export function chipLoad(shape: BitShape, settings: Pick<BitSettings, 'feed' | 'rpm'>): number | undefined {
  const flutes = flutesOf(shape);
  return flutes && settings.rpm > 0 ? settings.feed / (settings.rpm * flutes) : undefined;
}

/**
 * The feed (mm/min) that gives a chip load at a speed: chip load x RPM x flutes, to the nearest whole
 * mm/s (and no less than 1). Undefined without flutes.
 */
export function feedForChipLoad(shape: BitShape, rpm: number, mmPerTooth: number): number | undefined {
  const flutes = flutesOf(shape);
  return flutes && rpm > 0 && mmPerTooth > 0 ? Math.max(1, Math.round((mmPerTooth * rpm * flutes) / 60)) * 60 : undefined;
}

/**
 * The usual chip load of a bit as a share of its diameter: a rule of thumb for sheet goods (0.1 to 0.2 mm
 * a tooth for a 1/4" bit, 0.05 to 0.1 for a 1/8"). Not cut here: tune me.
 */
export const CHIP_LOAD_OF_DIAMETER = { least: 0.016, most: 0.032 };
/** Material types cut toward the low end of the range: the lower half of it. */
export const CHIP_LOAD_LOW_TYPES = ['solid-wood'];

/**
 * The chip load usual for a bit in a material type, in mm a tooth to two places (shown beside
 * the chip load, flagged when a row is outside it). Only for the bits that cut on their full
 * width (end mills, ball noses, bull noses): a V-bit, a chamfer, a tapered or a roundover bit cuts on a
 * width that changes with the depth, so it has none.
 */
export function chipLoadRange(shape: BitShape, typeId: string): { least: number; most: number } | undefined {
  if (shape.kind !== 'endMill' && shape.kind !== 'ballNose' && shape.kind !== 'bullNose') return undefined;
  const least = shape.diameter.mm * CHIP_LOAD_OF_DIAMETER.least;
  const full = shape.diameter.mm * CHIP_LOAD_OF_DIAMETER.most;
  const most = CHIP_LOAD_LOW_TYPES.includes(typeId) ? (least + full) / 2 : full;
  return { least: Number(least.toFixed(2)), most: Number(most.toFixed(2)) };
}

/** Where a bit's chip load in a material type lies against the usual range; undefined when either is unknown. */
export function chipLoadCheck(shape: BitShape, typeId: string, settings: Pick<BitSettings, 'feed' | 'rpm'>): 'low' | 'ok' | 'high' | undefined {
  const range = chipLoadRange(shape, typeId);
  const chip = chipLoad(shape, settings);
  if (!range || chip === undefined) return undefined;
  const shown = Number(chip.toFixed(3));
  return shown < range.least ? 'low' : shown > range.most ? 'high' : 'ok';
}

/** Where a bit with no feeds at all starts. Conservative placeholders: tune me. */
export const PLACEHOLDER_BIT_SETTINGS: BitSettings = { feed: 900, plungeFeed: 300, depthPerPass: 1.5, stepover: 1, rpm: STARTER_RPM };

/**
 * Sets one feed or speed of a bit for a material type, when the value can be one (above 0; a stepover
 * or a finish allowance may be 0; an empty finish allowance goes back to a share of the bit). The bit's
 * settings are then no longer placeholders ("tune me"). Returns false when nothing was set.
 */
export function setBitSetting(tool: Pick<RouterBit, 'settings' | 'tuneMe'>, typeId: string, key: keyof BitSettings, value: number | null): boolean {
  const settings = tool.settings[typeId];
  const field = BIT_SETTING_FIELDS.find((f) => f.key === key);
  if (!settings || !field) return false;
  if (value === null) {
    if (!field.optional) return false;
    delete settings[key];
  } else {
    if (!Number.isFinite(value) || value < 0 || (value === 0 && !field.zero)) return false;
    settings[key] = value;
  }
  tool.tuneMe = tool.tuneMe.filter((k) => k !== 'settings');
  return true;
}

/** The material type a bit's feeds would be copied from for a type it has none for: MDF, else the first it has. */
export function bitSettingsSource(tool: Pick<RouterBit, 'settings'>, types: { id: string }[] = MATERIAL_TYPES): string | undefined {
  return tool.settings[MDF_TYPE_ID] ? MDF_TYPE_ID : types.find((t) => tool.settings[t.id])?.id;
}

/**
 * Gives a bit feeds for a material type it has none for, so Plan offers it for that type's materials:
 * a copy of MDF's (else of the first type it has; else placeholders). The copy wants tuning.
 */
export function copyBitSettings(tool: Pick<RouterBit, 'settings' | 'tuneMe'>, typeId: string, types: { id: string }[] = MATERIAL_TYPES): void {
  if (tool.settings[typeId]) return;
  const from = bitSettingsSource(tool, types);
  tool.settings[typeId] = { ...(from ? tool.settings[from]! : PLACEHOLDER_BIT_SETTINGS) };
  if (!from && !tool.tuneMe.includes('settings')) tool.tuneMe.push('settings');
}

/** Takes a material type's feeds off a bit: Plan no longer offers it for that type's materials. */
export function removeBitSettings(tool: Pick<RouterBit, 'settings'>, typeId: string): void {
  delete tool.settings[typeId];
}

/** Where a new bit of each kind starts: a common size, every value a placeholder until it is typed over. */
const STARTING_SHAPES: { [K in BitKind]: () => Extract<BitShape, { kind: K }> } = {
  endMill: () => ({ kind: 'endMill', diameter: len('1/4"'), cuttingLength: null, flutes: 2, cut: 'up' }),
  ballNose: () => ({ kind: 'ballNose', diameter: len('1/4"'), cuttingLength: null, flutes: 2 }),
  bullNose: () => ({ kind: 'bullNose', diameter: len('1/4"'), cornerRadius: len('1mm'), cuttingLength: null, flutes: 2 }),
  vBit: () => ({ kind: 'vBit', angleDeg: 90, maxDiameter: len('1/2"'), maxDepth: 6.3, flutes: 2 }),
  chamfer: () => ({ kind: 'chamfer', angleDeg: 90, maxDiameter: len('1/2"'), tipDiameter: len('1/16"'), maxDepth: 5.5, flutes: 2 }),
  taperBall: () => ({ kind: 'taperBall', angleDeg: 10, ballDiameter: len('1mm'), maxDiameter: len('1/4"'), cuttingLength: null, flutes: 2 }),
  roundover: () => ({ kind: 'roundover', radius: len('1/4"'), tipDiameter: len('1/8"'), diameter: len('5/8"'), flutes: 2 }),
};

/** A bit's size as a number, to tell which of two bits of a kind is nearer a third: mm, or degrees. */
function sizeNumber(shape: BitShape): number {
  const value = (shape as unknown as Record<string, Length | number>)[bitType(shape.kind).sizeField]!;
  return typeof value === 'number' ? value : value.mm;
}

function freeBitId(tools: Pick<RouterBit, 'id'>[]): string {
  let n = 1;
  while (tools.some((t) => t.id === `bit-own-${n}`)) n++;
  return `bit-own-${n}`;
}

/**
 * A new bit of a kind, not yet in `tools`: a starting size, every value of its shape and its feeds
 * marked "tune me". Its feeds are a copy of those of the bit of its kind nearest in size; with no bit of
 * its kind to copy, placeholders for every material type.
 */
export function newBit(kind: BitKind, tools: RouterBit[], types: { id: string }[] = MATERIAL_TYPES): RouterBit {
  const shape = STARTING_SHAPES[kind]();
  const size = sizeNumber(shape);
  const nearest = tools
    .filter((t) => t.shape.kind === kind && Object.keys(t.settings).length > 0)
    .sort((a, b) => Math.abs(sizeNumber(a.shape) - size) - Math.abs(sizeNumber(b.shape) - size))[0];
  const settings: Record<string, BitSettings> = nearest ? structuredClone(nearest.settings) : Object.fromEntries(types.map((type) => [type.id, { ...PLACEHOLDER_BIT_SETTINGS }]));
  // The stepover keeps the share it was of the bit it came from, on a step of this bit's width.
  const from = nearest ? bitWidth(nearest.shape) : bitWidth(shape);
  for (const s of Object.values(settings)) s.stepover = snapStepover(shape, from > 0 ? (s.stepover * bitWidth(shape)) / from : s.stepover);
  return {
    id: freeBitId(tools),
    type: 'routerBit',
    name: bitAutoName(shape),
    offset: { x: 0, y: 0 },
    shank: len('1/4"'),
    shape,
    settings: JSON.parse(JSON.stringify(settings)) as Record<string, BitSettings>,
    tuneMe: ['settings', ...bitType(kind).fields.filter((f) => f.key !== 'nominal' && (f.unit === 'length' || f.unit === 'mm' || f.unit === 'degrees')).map((f) => f.key)],
  };
}

/** Another bit like this one, not yet in `tools`, to give another size. One that goes by its size and kind still does. */
export function copyBit(tool: RouterBit, tools: RouterBit[]): RouterBit {
  const copy = JSON.parse(JSON.stringify(tool)) as RouterBit;
  return { ...copy, id: freeBitId(tools), name: bitOwnName(tool) ? `${tool.name} (copy)` : tool.name };
}

export const STARTER_TOOLS: RouterBit[] = [
  {
    id: 'endmill-1-4',
    type: 'routerBit',
    name: '1/4" end mill',
    offset: { x: 0, y: 0 },
    shank: len('1/4"'),
    shape: { kind: 'endMill', diameter: len('1/4"'), cuttingLength: null, flutes: 1, cut: 'up' },
    settings: mdf({ feed: 2400, plungeFeed: 360, depthPerPass: 3.2, stepover: 2.54, rpm: STARTER_RPM }, { feed: 1800 }),
    tuneMe: [...TUNE_SETTINGS, 'diameter', 'cuttingLength'],
  },
  {
    id: 'endmill-1-8',
    type: 'routerBit',
    name: '1/8" end mill',
    offset: { x: 0, y: 0 },
    shank: len('1/8"'),
    shape: { kind: 'endMill', diameter: len('1/8"'), cuttingLength: null, flutes: 1, cut: 'up' },
    settings: mdf({ feed: 1200, plungeFeed: 300, depthPerPass: 1.6, stepover: 1.27, rpm: STARTER_RPM }, { feed: 900 }),
    tuneMe: [...TUNE_SETTINGS, 'diameter', 'cuttingLength'],
  },
  {
    // For slide screw pilot holes; nothing else wants a bit this small.
    id: 'endmill-1-16',
    type: 'routerBit',
    name: '1/16" end mill',
    offset: { x: 0, y: 0 },
    shank: len('1/8"'),
    shape: { kind: 'endMill', diameter: len('1/16"'), cuttingLength: null, flutes: 2, cut: 'up' },
    settings: mdf({ feed: 960, plungeFeed: 120, depthPerPass: 0.8, stepover: 0.635, rpm: STARTER_RPM }),
    tuneMe: [...TUNE_SETTINGS, 'diameter', 'cuttingLength'],
  },
  {
    // For CNC-assisted pocket holes (untested): it cuts the ramped, round floor of each pocket.
    id: 'ballnose-1-8',
    type: 'routerBit',
    name: '1/8" ball nose',
    offset: { x: 0, y: 0 },
    shank: len('1/8"'),
    shape: { kind: 'ballNose', diameter: len('1/8"'), cuttingLength: null, flutes: 2 },
    settings: mdf({ feed: 1800, plungeFeed: 300, depthPerPass: 1.6, stepover: 1.588, rpm: STARTER_RPM }),
    tuneMe: [...TUNE_SETTINGS, 'diameter', 'cuttingLength'],
  },
  {
    // For flutes in a front (untested): a flute is as wide as its ball.
    id: 'ballnose-1-4',
    type: 'routerBit',
    name: '1/4" ball nose',
    offset: { x: 0, y: 0 },
    shank: len('1/4"'),
    shape: { kind: 'ballNose', diameter: len('1/4"'), cuttingLength: null, flutes: 2 },
    settings: mdf({ feed: 3600, plungeFeed: 300, depthPerPass: 3.2, stepover: 3.175, rpm: STARTER_RPM }),
    tuneMe: [...TUNE_SETTINGS, 'diameter', 'cuttingLength'],
  },
  {
    // For patterns in a front (untested): a flat floor 1/8" wide between two 1/8" round corners.
    id: 'bullnose-3-8',
    type: 'routerBit',
    name: '3/8" bull nose',
    offset: { x: 0, y: 0 },
    shank: len('1/4"'),
    shape: { kind: 'bullNose', diameter: len('3/8"'), cornerRadius: len('1/8"'), cuttingLength: null, flutes: 2 },
    settings: mdf({ feed: 4320, plungeFeed: 300, depthPerPass: 3.2, stepover: 3.81, rpm: STARTER_RPM }),
    tuneMe: [...TUNE_SETTINGS, 'diameter', 'cuttingLength'],
  },
  {
    id: 'vbit-60',
    type: 'routerBit',
    name: '60° V-bit',
    offset: { x: 0, y: 0 },
    shank: len('1/4"'),
    // The starter bits: the 1/4" and 1/8" end mills have one flute; the 1/16", the ball noses
    // (tapered ones too) and the V-bits have two.
    shape: { kind: 'vBit', angleDeg: 60, maxDiameter: len('1/2"'), maxDepth: 11, flutes: 2 },
    settings: mdf({ feed: 1500, plungeFeed: 300, depthPerPass: 3.2, stepover: 0, rpm: STARTER_RPM }),
    tuneMe: [...TUNE_SETTINGS, 'maxDiameter', 'maxDepth'],
  },
  {
    id: 'vbit-90',
    type: 'routerBit',
    name: '90° V-bit',
    offset: { x: 0, y: 0 },
    shank: len('1/4"'),
    shape: { kind: 'vBit', angleDeg: 90, maxDiameter: len('1/2"'), maxDepth: 6.3, flutes: 2 },
    settings: mdf({ feed: 1500, plungeFeed: 300, depthPerPass: 3.2, stepover: 0, rpm: STARTER_RPM }),
    tuneMe: [...TUNE_SETTINGS, 'maxDiameter', 'maxDepth'],
  },
];
