import { describe, expect, it } from 'vitest';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { doorSetOf, shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import {
  BIT_SETTING_FIELDS,
  BIT_TYPES,
  MDF_TYPE_ID,
  PLACEHOLDER_BIT_SETTINGS,
  STARTER_TOOLS,
  bitAutoName,
  bitOwnName,
  bitSettingsSource,
  bitSize,
  bitType,
  snapStepover,
  STEPOVER_STEP,
  bitWidth,
  stepoverForPercent,
  stepoverPercent,
  chipLoad,
  chipLoadCheck,
  chipLoadRange,
  feedForChipLoad,
  feedPerSecond,
  flutesOf,
  hasNominal,
  nominalDiameter,
  routerDial,
  STARTER_RPM,
  createStarterShop,
  copyBit,
  copyBitSettings,
  newBit,
  removeBitSettings,
  setBitField,
  setBitName,
  setBitSetting,
} from '@/libraries';
import type { BitShape, Project, RouterBit } from '@/model';
import { cutDiameter } from '@/plan';
import { MAX_LINE, toolDef } from '@/post/fluidnc';
import { createBaseCabinetProject, createShopWallProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';
import { lowRiderJobShop, lowRiderShop } from './lowRider';

const bit = (name: string, shape: BitShape, more: Partial<RouterBit> = {}): RouterBit => ({
  id: name,
  type: 'routerBit',
  name,
  offset: { x: 0, y: 0 },
  shank: len('1/4"'),
  shape,
  settings: {},
  tuneMe: [],
  ...more,
});

/** One bit of every kind, each with every field filled in. */
const ONE_OF_EACH: RouterBit[] = [
  bit('1/4" end mill', { kind: 'endMill', diameter: len('1/4"'), cuttingLength: len('22mm'), flutes: 2, cut: 'down' }),
  bit('1/8" ball nose', { kind: 'ballNose', diameter: len('1/8"'), cuttingLength: len('12mm'), flutes: 2 }),
  bit('1/4" bull nose', { kind: 'bullNose', diameter: len('1/4"'), cornerRadius: len('1mm'), cuttingLength: len('20mm'), flutes: 2 }),
  bit('60° V-bit', { kind: 'vBit', angleDeg: 60, maxDiameter: len('1/2"'), maxDepth: 11, tipDiameter: len('0.5mm'), flutes: 2 }),
  bit('90° chamfer bit', { kind: 'chamfer', angleDeg: 90, maxDiameter: len('1/2"'), tipDiameter: len('2mm'), maxDepth: 5, flutes: 3 }),
  bit('1 mm tapered ball nose', { kind: 'taperBall', angleDeg: 10, ballDiameter: len('1mm'), maxDiameter: len('1/4"'), cuttingLength: len('30mm'), flutes: 2 }),
  bit('1/4" roundover bit', { kind: 'roundover', radius: len('1/4"'), tipDiameter: len('1/8"'), diameter: len('5/8"'), flutes: 2 }),
];

async function parsed(line: string) {
  const tools = loadGCodeTools();
  const parser = new tools.GCodeParser();
  await parser.parseString(`${line}\nG21 G90\nT1\nG1 X10 F600\n`);
  return { def: parser.simMeta.tools.get(1)!, tools };
}

describe('bit types', () => {
  it('has one for each shape cnc-gcode-tools draws, and one for each kind in the model', () => {
    expect(BIT_TYPES.map((t) => t.toolDefShape).sort()).toEqual([...loadGCodeTools().STOCK_TOOL_SHAPES].sort());
    expect(ONE_OF_EACH.map((b) => b.shape.kind)).toEqual(BIT_TYPES.map((t) => t.kind));
  });

  it("names each kind's fields as its shape holds them", () => {
    for (const b of ONE_OF_EACH) {
      const type = bitType(b.shape.kind);
      const keys = Object.keys(b.shape).filter((k) => k !== 'kind');
      // `nominal` (what a bit is sold as) is a field of its own, not held while it is the measured diameter.
      expect(type.fields.map((f) => f.key).filter((k) => k !== 'nominal').sort()).toEqual(keys.sort());
      expect(keys).toContain(type.sizeField);
    }
  });

  it('gives the widest cutting diameter of every kind', () => {
    expect(ONE_OF_EACH.map(cutDiameter)).toEqual([6.35, 3.175, 6.35, 12.7, 12.7, 6.35, 15.875]);
  });
});

describe('ToolDef comments', () => {
  it('writes each kind in cnc-gcode-tools format', () => {
    expect(ONE_OF_EACH.map((b, i) => toolDef(i + 1, b))).toEqual([
      '(ToolDef 1: SHAPE=flat D=6.35 FLUTES=2 LEN=22 NAME=1/4" end mill)',
      '(ToolDef 2: SHAPE=ball D=3.175 FLUTES=2 LEN=12 NAME=1/8" ball nose)',
      '(ToolDef 3: SHAPE=bullnose D=6.35 CR=1 FLUTES=2 LEN=20 NAME=1/4" bull nose)',
      '(ToolDef 4: SHAPE=vbit D=12.7 ANGLE=60 TIP=0.5 FLUTES=2 LEN=11 NAME=60 deg V-bit)',
      '(ToolDef 5: SHAPE=chamfer D=12.7 ANGLE=90 TIP=2 FLUTES=3 LEN=5 NAME=90 deg chamfer bit)',
      '(ToolDef 6: SHAPE=taperball D=6.35 ANGLE=10 TIP=1 FLUTES=2 LEN=30 NAME=1 mm tapered ball nose)',
      '(ToolDef 7: SHAPE=roundover D=15.875 CR=6.35 TIP=3.175 FLUTES=2 NAME=1/4" roundover bit)',
    ]);
  });

  it.each(ONE_OF_EACH)('$name: parses in cnc-gcode-tools and compiles to a shape that cuts', async (b) => {
    const line = toolDef(1, { ...b, overallLength: len('50mm') });
    expect(line.length).toBeLessThanOrEqual(MAX_LINE);
    expect(line).toMatch(/^\([^()]*\)$/);
    const { def, tools } = await parsed(line);
    expect(def).toMatchObject({ shape: bitType(b.shape.kind).toolDefShape, diameter: cutDiameter(b), overallLength: 50, name: b.name.replace('°', ' deg') });
    const tool = tools.compileStockTool(def);
    expect(tool).not.toBeNull();
    expect(tool!.radius).toBeCloseTo(cutDiameter(b) / 2, 6);
    expect(tool!.overallLength).toBe(50);
    // The cutting edge never dips below the tip, and a flat end mill's is level
    for (let d = 0; d <= tool!.radius; d += tool!.radius / 8) expect(tool!.profile(d)).toBeGreaterThanOrEqual(-1e-9);
    expect(tool!.flat).toBe(b.shape.kind === 'endMill');
  });

  it('reads back the fields that give each new shape its profile', async () => {
    const bull = (await parsed(toolDef(1, ONE_OF_EACH[2]!))).def as unknown as Record<string, number>;
    expect(bull).toMatchObject({ cornerRadius: 1, flutes: 2, fluteLength: 20 });
    const chamfer = (await parsed(toolDef(1, ONE_OF_EACH[4]!))).def as unknown as Record<string, number>;
    expect(chamfer).toMatchObject({ angle: 90, tip: 2, flutes: 3, fluteLength: 5 });
    const taper = (await parsed(toolDef(1, ONE_OF_EACH[5]!))).def as unknown as Record<string, number>;
    expect(taper).toMatchObject({ angle: 10, tip: 1, flutes: 2, fluteLength: 30 });
  });

  it('writes a sharp V-bit with TIP=0 and leaves out what is not known', () => {
    expect(toolDef(3, STARTER_TOOLS.find((t) => t.id === 'vbit-60')!)).toBe('(ToolDef 3: SHAPE=vbit D=12.7 ANGLE=60 TIP=0 FLUTES=2 LEN=11 NAME=60 deg V-bit)');
    expect(toolDef(1, STARTER_TOOLS[0]!)).toBe('(ToolDef 1: SHAPE=flat D=6.35 FLUTES=1 NAME=1/4" end mill)');
  });

  it('writes OAL before the name, and cuts a long name short to stay within 127 bytes', async () => {
    const long = { ...ONE_OF_EACH[5]!, overallLength: len('3"'), name: 'Tapered ball nose for carving door panels (the long one from the blue box, second drawer down, do not drop it again)' };
    const line = toolDef(12, long);
    expect(line.length).toBeLessThanOrEqual(MAX_LINE);
    expect(line).toBe('(ToolDef 12: SHAPE=taperball D=6.35 ANGLE=10 TIP=1 FLUTES=2 LEN=30 OAL=76.2 NAME=Tapered ball nose for carving door panels the)');
    const { def } = await parsed(line.replace('ToolDef 12', 'ToolDef 1'));
    expect(def).toMatchObject({ shape: 'taperball', overallLength: 76.2 });
  });
});

/** The starter shop with a bit of each new kind, on the 90° V-bit's feeds for every material. */
function shopWithNewKinds() {
  const shop = lowRiderJobShop();
  const settings = () => structuredClone(shop.tools.find((t) => t.id === 'vbit-90')!.settings);
  const add = (id: string, shape: BitShape) => shop.tools.push(bit(id, shape, { settings: settings() }));
  add('chamfer-90', { kind: 'chamfer', angleDeg: 90, maxDiameter: len('1/2"'), tipDiameter: len('2mm'), maxDepth: 5 });
  add('chamfer-60', { kind: 'chamfer', angleDeg: 60, maxDiameter: len('1/2"'), tipDiameter: len('2mm'), maxDepth: 8 });
  add('bullnose-1-4', { kind: 'bullNose', diameter: len('1/4"'), cornerRadius: len('1mm'), cuttingLength: len('25mm'), flutes: 2 });
  add('bullnose-1-8', { kind: 'bullNose', diameter: len('1/8"'), cornerRadius: len('0.5mm'), cuttingLength: len('25mm'), flutes: 2 });
  add('taperball-1', { kind: 'taperBall', angleDeg: 10, ballDiameter: len('1mm'), maxDiameter: len('1/4"'), cuttingLength: len('30mm'), flutes: 2 });
  return shop;
}

describe('what each kind may cut', () => {
  const shop = shopWithNewKinds();
  const chamfered = (size = '1/8"') => {
    const project = createVanityProject();
    doorSetOf(project).outsideEdge = { kind: 'chamfer', size: len(size) };
    return project;
  };
  const operations = (project: Project) => buildJob(project, shop).plan.operations;
  const offered = (project: Project) => operations(project).flatMap((o) => [...o.options.clearToolIds, ...o.options.cleanupToolIds]);

  it('offers a 90° chamfer bit beside the 90° V-bit for an edge chamfer, and no other angle', () => {
    const edge = operations(chamfered()).find((o) => o.kind === 'edgeProfile')!;
    expect(edge.options.methods).toContain('cnc');
    expect([...edge.options.clearToolIds].sort()).toEqual(['chamfer-90', 'vbit-90']);
  });

  it('offers a chamfer bit only for a chamfer it is deep and wide enough to cut', () => {
    // 5 mm deep, 12.7 mm wide with a 2 mm flat: a 3.5 mm chamfer wants its tip 4.5 mm down and 5.5 mm of radius
    const edge = (size: string) => operations(chamfered(size)).find((o) => o.kind === 'edgeProfile')!.options.clearToolIds;
    expect(edge('3.5mm')).toContain('chamfer-90');
    expect(edge('4.2mm')).not.toContain('chamfer-90');
    expect(edge('4.2mm')).toContain('vbit-90');
  });

  it('offers a chamfer bit for nothing but an edge chamfer', () => {
    for (const project of [createVanityProject(), chamfered(), createBaseCabinetProject('frameless'), createBaseCabinetProject('faceFrame', 'drawers')]) {
      for (const o of operations(project)) {
        const chamferBits = [...o.options.clearToolIds, ...o.options.cleanupToolIds].filter((id) => id.startsWith('chamfer-'));
        if (o.kind !== 'edgeProfile') expect(chamferBits).toEqual([]);
      }
    }
    // The inside bevel is a V-bit's: a flat tip would leave a flat at its foot
    expect(operations(createVanityProject()).find((o) => o.kind === 'vBevel')!.options.clearToolIds).toEqual(['vbit-60']);
  });

  it('never offers a bull nose or a tapered ball: not for a pocket, a cutout, a groove or a hole', () => {
    const projects = [createVanityProject(), chamfered(), createBaseCabinetProject('frameless'), createBaseCabinetProject('faceFrame', 'drawers'), createShopWallProject()];
    const kinds = new Set<string>();
    for (const project of projects) {
      for (const o of operations(project)) kinds.add(o.kind);
      expect(offered(project).filter((id) => id.startsWith('bullnose-') || id.startsWith('taperball-'))).toEqual([]);
    }
    for (const kind of ['pocketClear', 'cutout', 'holes', 'pinHole']) expect(kinds).toContain(kind);
    // The case joints and the grooves for backs and drawer bottoms
    expect(['dado', 'rabbet', 'groove'].filter((kind) => kinds.has(kind)).length).toBeGreaterThan(1);
  });

  it('cuts the chamfer with a chamfer bit: the same depth as the V-bit, its axis a tip radius further out', async () => {
    /** The edge operation's cutting moves, from its status line to the next one. */
    const edgeCut = async (clearToolId: string) => {
      const project = chamfered();
      const key = operations(project).find((o) => o.kind === 'edgeProfile')!.key;
      project.plan.operations[key] = { method: 'cnc', clearToolId };
      const job = buildJob(project, shop);
      const file = job.files.find((f) => /\(MSG, \d+\/\d+ T\d+ [^)]*edges/i.test(f.text))!;
      expect(file).toBeDefined();
      for (const line of file.text.split('\n')) expect(line.length).toBeLessThanOrEqual(MAX_LINE);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      const lines = file.text.split('\n');
      const start = lines.findIndex((l) => /^\(MSG, \d+\/\d+ T\d+ [^)]*edges/i.test(l));
      const toolNumber = Number(/ T(\d+) /.exec(lines[start]!)![1]);
      const cuts = parser.segments.filter((s) => s.type === 'cut' && s.toolNumber === toolNumber && s.lineNum > start);
      const xs = cuts.filter((s) => s.end.z < 0).flatMap((s) => [s.start.x, s.end.x]);
      return { def: parser.simMeta.tools.get(toolNumber)!, deepest: Math.min(...cuts.map((s) => s.end.z)), minX: Math.min(...xs), maxX: Math.max(...xs) };
    };
    const v = await edgeCut('vbit-90');
    const c = await edgeCut('chamfer-90');
    expect(v.def.shape).toBe('vbit');
    expect(c.def).toMatchObject({ shape: 'chamfer', diameter: 12.7, angle: 90 });
    expect(v.deepest).toBeCloseTo(-(3.175 + 1), 3);
    expect(c.deepest).toBeCloseTo(v.deepest, 3);
    // A 2 mm flat: the axis runs 1 mm further from the edge all round
    expect(c.minX).toBeCloseTo(v.minX - 1, 3);
    expect(c.maxX).toBeCloseTo(v.maxX + 1, 3);
  });
});

describe('a bit goes by its size and kind', () => {
  it('names every starter bit as it was named, so no job or golden file changes', () => {
    for (const t of STARTER_TOOLS) expect(bitAutoName(t.shape)).toBe(t.name);
    expect(STARTER_TOOLS.map((t) => bitSize(t.shape))).toEqual(['1/4"', '1/8"', '1/16"', '1/8"', '1/4"', '3/8"', '60°', '90°']);
  });

  it('says a size in the unit it was typed in', () => {
    expect(ONE_OF_EACH.map((b) => bitAutoName(b.shape))).toEqual([
      '1/4" end mill',
      '1/8" ball nose',
      '1/4" bull nose',
      '60° V-bit',
      '90° chamfer bit',
      '1 mm tapered ball nose',
      '1/4" roundover bit',
    ]);
    expect(bitSize({ kind: 'endMill', diameter: len('6mm'), cuttingLength: null, flutes: 2, cut: 'up' })).toBe('6 mm');
    // Typed in inches but not a 64th: said in mm
    expect(bitSize({ kind: 'endMill', diameter: len('0.3"'), cuttingLength: null, flutes: 2, cut: 'up' })).toBe('7.62 mm');
  });

  it('renames a bit with its size unless it has a name of its own', () => {
    const t = structuredClone(STARTER_TOOLS[0]!);
    expect(bitOwnName(t)).toBe('');
    setBitField(t, 'nominal', len('3/8"'));
    expect(t.name).toBe('3/8" end mill');
    setBitName(t, ' Amana 46202 ');
    expect([t.name, bitOwnName(t)]).toEqual(['Amana 46202', 'Amana 46202']);
    setBitField(t, 'nominal', len('1/2"'));
    expect(t.name).toBe('Amana 46202');
    setBitName(t, '');
    expect(t.name).toBe('1/2" end mill');
  });

  it('a bit sold by a diameter has a nominal one that names it and a measured one that cuts', () => {
    const t = structuredClone(STARTER_TOOLS[0]!);
    const shape = () => t.shape as Extract<typeof t.shape, { kind: 'endMill' }>;
    // Not measured yet: it measures what it is sold as, and says so.
    expect([hasNominal('endMill'), hasNominal('ballNose'), hasNominal('bullNose'), hasNominal('taperBall')]).toEqual([true, true, true, true]);
    expect([hasNominal('vBit'), hasNominal('chamfer'), hasNominal('roundover')]).toEqual([false, false, false]);
    expect([nominalDiameter(t.shape), shape().nominal, t.tuneMe.includes('diameter')]).toEqual([len('1/4"'), undefined, true]);
    const before = toolDef(1, t);
    expect(before).toContain('D=6.35 ');
    // Sold as another size while not measured: the measured one follows.
    setBitField(t, 'nominal', len('3/8"'));
    expect([t.name, shape().diameter, shape().nominal, t.tuneMe.includes('diameter')]).toEqual(['3/8" end mill', len('3/8"'), undefined, true]);
    setBitField(t, 'nominal', len('1/4"'));
    expect(toolDef(1, t)).toBe(before);
    // Measured: the name and the size it is sold as stay, every cut uses what it measures.
    const stepover = stepoverPercent(t.shape, t.settings.mdf!.stepover);
    setBitField(t, 'diameter', len('6.2mm'));
    expect([t.name, bitSize(t.shape), nominalDiameter(t.shape), shape().diameter, t.tuneMe.includes('diameter')]).toEqual(['1/4" end mill', '1/4"', len('1/4"'), len('6.2mm'), false]);
    expect([cutDiameter(t), bitWidth(t.shape)]).toEqual([6.2, 6.2]);
    expect(toolDef(1, t)).toContain('D=6.2 ');
    expect(toolDef(1, t)).toContain('NAME=1/4" end mill');
    expect(stepoverPercent(t.shape, t.settings.mdf!.stepover)).toBeCloseTo(stepover, 1);
    // Once measured, what it is sold as no longer moves what it measures.
    setBitField(t, 'nominal', len('6mm'));
    expect([t.name, shape().diameter]).toEqual(['6 mm end mill', len('6.2mm')]);
    // Measured at exactly what it is sold as: one value again.
    setBitField(t, 'diameter', len('6mm'));
    expect([shape().nominal, nominalDiameter(t.shape)]).toEqual([undefined, len('6mm')]);
    // A tapered bit's ball is the same; a V-bit keeps one value.
    const taper = newBit('taperBall', []);
    expect(taper.tuneMe).not.toContain('nominal');
    setBitField(taper, 'ballDiameter', len('1.1mm'));
    expect([taper.name, nominalDiameter(taper.shape)]).toEqual(['1 mm tapered ball nose', len('1mm')]);
    expect(nominalDiameter(newBit('vBit', []).shape)).toBeUndefined();
  });

  it('a measured value is no longer a placeholder, and an optional one can be emptied', () => {
    const t = structuredClone(STARTER_TOOLS[0]!);
    expect(t.tuneMe).toContain('cuttingLength');
    setBitField(t, 'cuttingLength', len('22mm'));
    expect(t.tuneMe).toEqual(['settings', 'diameter']);
    expect(t.shape).toMatchObject({ cuttingLength: { mm: 22 } });
    setBitField(t, 'cuttingLength', null);
    expect(t.shape).toMatchObject({ cuttingLength: null });
    const v = structuredClone(STARTER_TOOLS.find((x) => x.id === 'vbit-90')!);
    setBitField(v, 'tipDiameter', len('1mm'));
    expect(v.shape).toMatchObject({ tipDiameter: { mm: 1 } });
    setBitField(v, 'tipDiameter', null);
    expect('tipDiameter' in v.shape).toBe(false);
    setBitField(v, 'notAField', 3);
    expect('notAField' in v.shape).toBe(false);
  });
});

describe('feeds and speeds, per material type', () => {
  const fresh = () => structuredClone(STARTER_TOOLS[0]!);

  it('lists the six values a bit has for a material type', () => {
    expect(BIT_SETTING_FIELDS.map((f) => f.key)).toEqual(['feed', 'plungeFeed', 'depthPerPass', 'stepover', 'rpm', 'finishAllowance']);
  });

  it('sets a value for one type only, and the settings are then no longer "tune me"', () => {
    const t = fresh();
    expect(t.tuneMe).toContain('settings');
    expect(setBitSetting(t, 'plywood', 'feed', 3000)).toBe(true);
    expect([t.settings.plywood!.feed, t.settings.mdf!.feed]).toEqual([3000, 2400]);
    expect(t.tuneMe).toEqual(['diameter', 'cuttingLength']);
  });

  it('refuses a value that cannot be one and leaves the bit as it was', () => {
    const t = fresh();
    const before = structuredClone(t);
    expect(setBitSetting(t, 'mdf', 'feed', 0)).toBe(false);
    expect(setBitSetting(t, 'mdf', 'rpm', -5)).toBe(false);
    expect(setBitSetting(t, 'mdf', 'depthPerPass', Number.NaN)).toBe(false);
    expect(setBitSetting(t, 'mdf', 'feed', null)).toBe(false);
    expect(setBitSetting(t, 'no-such-type', 'feed', 1000)).toBe(false);
    expect(t).toEqual(before);
  });

  it('takes 0 for a stepover and a finish allowance; an empty finish allowance is a share of the bit again', () => {
    const t = fresh();
    expect(setBitSetting(t, 'mdf', 'stepover', 0)).toBe(true);
    expect(setBitSetting(t, 'mdf', 'finishAllowance', 0)).toBe(true);
    expect(t.settings.mdf).toMatchObject({ stepover: 0, finishAllowance: 0 });
    expect(setBitSetting(t, 'mdf', 'finishAllowance', null)).toBe(true);
    expect('finishAllowance' in t.settings.mdf!).toBe(false);
  });

  it("a type with no feeds: the bit is not offered for its materials until it is given a copy of MDF's", () => {
    const profile = lowRiderShop();
    const project = createVanityProject();
    const cutoutBits = () => buildJob(project, shopFor(project, profile)).plan.operations.find((o) => o.kind === 'cutout')!.options.clearToolIds;
    expect(cutoutBits()).toContain('endmill-1-4');
    const bit = profile.tools.find((t) => t.id === 'endmill-1-4')!;
    const typeId = project.materials[0]!.groupId;
    removeBitSettings(bit, typeId);
    expect(cutoutBits()).not.toContain('endmill-1-4');
    copyBitSettings(bit, typeId);
    expect(cutoutBits()).toContain('endmill-1-4');

    const t = fresh();
    removeBitSettings(t, 'plywood');
    setBitSetting(t, MDF_TYPE_ID, 'feed', 1234);
    expect(bitSettingsSource(t)).toBe(MDF_TYPE_ID);
    copyBitSettings(t, 'plywood');
    expect(t.settings.plywood).toEqual(t.settings[MDF_TYPE_ID]);
    expect(t.settings.plywood).not.toBe(t.settings[MDF_TYPE_ID]);
  });

  it('copies from the first type it has when MDF has none, and starts on placeholders when it has none at all', () => {
    const t = fresh();
    removeBitSettings(t, MDF_TYPE_ID);
    setBitSetting(t, 'plywood', 'feed', 2000);
    expect(bitSettingsSource(t)).toBe('plywood');
    copyBitSettings(t, MDF_TYPE_ID);
    expect(t.settings[MDF_TYPE_ID]!.feed).toBe(2000);
    // Never over feeds it already has
    copyBitSettings(t, 'osb');
    expect(t.settings.osb!.feed).toBe(2400);

    const bare = { ...fresh(), settings: {}, tuneMe: [] as string[] };
    expect(bitSettingsSource(bare)).toBeUndefined();
    copyBitSettings(bare, 'plywood');
    expect(bare.settings).toEqual({ plywood: PLACEHOLDER_BIT_SETTINGS });
    expect(bare.tuneMe).toEqual(['settings']);
  });
});

describe('add, copy, remove', () => {
  it('adds a bit of every kind: a starting size, marked "tune me", an id of its own', () => {
    const profile = lowRiderShop();
    for (const type of BIT_TYPES) {
      const added = newBit(type.kind, profile.tools);
      expect(profile.tools.some((t) => t.id === added.id)).toBe(false);
      profile.tools.push(added);
      expect(added.shape.kind).toBe(type.kind);
      expect(added.name).toBe(bitAutoName(added.shape));
      expect(added.tuneMe).toContain('settings');
      expect(added.tuneMe).toContain(type.sizeField);
      // Every material type has feeds, so Plan can offer it
      expect(Object.keys(added.settings).sort()).toEqual(profile.materialGroups.map((g) => g.id).sort());
      // It posts and previews
      const line = toolDef(1, added);
      expect(line.length).toBeLessThanOrEqual(MAX_LINE);
      expect(loadGCodeTools().STOCK_TOOL_SHAPES).toContain(/SHAPE=(\w+)/.exec(line)![1]);
    }
    expect(profile.tools.slice(-7).map((t) => t.id)).toEqual(['bit-own-1', 'bit-own-2', 'bit-own-3', 'bit-own-4', 'bit-own-5', 'bit-own-6', 'bit-own-7']);
  });

  it("starts a new bit on the feeds of the nearest bit of its kind, and on placeholders when there is none", () => {
    const profile = lowRiderShop();
    // A new end mill is 1/4": the 1/4" end mill's feeds, not the 1/16"'s
    const endMill = newBit('endMill', profile.tools);
    expect(endMill.settings).toEqual(profile.tools.find((t) => t.id === 'endmill-1-4')!.settings);
    expect(endMill.settings.mdf).not.toBe(profile.tools.find((t) => t.id === 'endmill-1-4')!.settings.mdf);
    // A new V-bit is 90 degrees
    expect(newBit('vBit', profile.tools).settings).toEqual(profile.tools.find((t) => t.id === 'vbit-90')!.settings);
    // A kind with none yet (a shop with no bull nose; the starter one has a 3/8" one).
    const bull = newBit('bullNose', profile.tools.filter((t) => t.shape.kind !== 'bullNose'));
    // The placeholder's 1 mm stepover, on a step of the 1/4" bit's width: 15%
    for (const type of profile.materialGroups) expect(bull.settings[type.id]).toEqual({ ...PLACEHOLDER_BIT_SETTINGS, stepover: 0.953 });
    // With the starter bull nose there, a new one takes its feeds.
    expect(newBit('bullNose', profile.tools).settings.mdf!.feed).toBe(4320);
  });

  it('copies a bit under a new id; one with a name of its own says it is a copy', () => {
    const profile = lowRiderShop();
    const original = profile.tools[0]!;
    const copy = copyBit(original, profile.tools);
    expect(copy).toEqual({ ...original, id: 'bit-own-1' });
    expect(copy.settings.mdf).not.toBe(original.settings.mdf);
    // Still goes by its size and kind, so it is renamed with its size
    setBitField(copy, 'nominal', len('3/8"'));
    expect([copy.name, original.name]).toEqual(['3/8" end mill', '1/4" end mill']);
    setBitName(original, 'Amana 46202');
    expect(copyBit(original, profile.tools).name).toBe('Amana 46202 (copy)');
  });

  describe('a bit a plan chose, removed from the shop', () => {
    const without = (...ids: string[]) => {
      const shop = lowRiderJobShop();
      return { ...shop, tools: shop.tools.filter((t) => !ids.includes(t.id)) };
    };
    const chose = () => {
      const project = createVanityProject();
      project.plan.operations['doors:pocketClear'] = { clearToolId: 'endmill-1-8' };
      return project;
    };

    it('uses the chosen bit while it is there', () => {
      const pocket = buildJob(chose(), lowRiderJobShop()).plan.operations.find((o) => o.kind === 'pocketClear')!;
      expect(pocket.clearToolId).toBe('endmill-1-8');
      expect(pocket.warnings.filter((w) => w.code === 'chosenToolGone')).toEqual([]);
    });

    it('falls back to another bit with a plain warning, and the job still posts', async () => {
      const job = buildJob(chose(), without('endmill-1-8'));
      const pocket = job.plan.operations.find((o) => o.kind === 'pocketClear')!;
      expect(pocket.clearToolId).toBe('endmill-1-4');
      expect(pocket.options.clearToolIds).not.toContain('endmill-1-8');
      expect(pocket.warnings.filter((w) => w.code === 'chosenToolGone').map((w) => w.message)).toEqual([
        'Panel pocket: the bit chosen for it is no longer in the shop profile, so the 1/4" end mill is used.',
      ]);
      expect(job.plan.warnings.some((w) => w.code === 'chosenToolGone')).toBe(true);
      expect(job.files.length).toBeGreaterThan(0);
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      }
    });

    it('says so for a clean-up bit too', () => {
      const project = createVanityProject();
      project.plan.operations['doors:pocketClear'] = { clearToolId: 'endmill-1-4', cleanupToolId: 'endmill-1-16' };
      const pocket = buildJob(project, without('endmill-1-16')).plan.operations.find((o) => o.kind === 'pocketClear')!;
      expect(pocket.cleanupToolId).not.toBe('endmill-1-16');
      expect(pocket.warnings.filter((w) => w.code === 'chosenToolGone')).toHaveLength(1);
    });

    it('with no bit left that can make a feature, the plan says so and the job is built without error', () => {
      const job = buildJob(chose(), without('endmill-1-4', 'endmill-1-8', 'endmill-1-16'));
      const cnc = job.plan.operations.filter((o) => o.method === 'cnc' && ['pocketClear', 'cutout', 'hingeCup'].includes(o.kind));
      expect(cnc.length).toBeGreaterThan(0);
      for (const o of cnc) {
        expect(o.clearToolId).toBeUndefined();
        expect(o.warnings.map((w) => w.code)).toContain('noCapableTool');
      }
    });

    it('a project with no stored choice shows no such warning', () => {
      const job = buildJob(createVanityProject(), without('endmill-1-8'));
      expect(job.plan.warnings.filter((w) => w.code === 'chosenToolGone')).toEqual([]);
    });
  });
});

describe('feeds in mm/s, chip load, the router at dial 2', () => {
  const endMill = STARTER_TOOLS[0]!;

  it('shows a feed in mm/s, to two places, from the mm/min it is kept in', () => {
    expect(BIT_SETTING_FIELDS.filter((f) => f.perSecond).map((f) => [f.key, f.unit])).toEqual([
      ['feed', 'mm/s'],
      ['plungeFeed', 'mm/s'],
    ]);
    expect([2540, 400, 600, 1000].map(feedPerSecond)).toEqual([42.33, 6.67, 10, 16.67]);
  });

  it('works out a chip load from the feed, the speed and the flutes', () => {
    // 2400 mm/min at the starter speed with one flute
    expect(chipLoad(endMill.shape, endMill.settings.mdf!)).toBeCloseTo(2400 / STARTER_RPM, 9);
    expect(chipLoad({ ...endMill.shape, flutes: 2 } as BitShape, endMill.settings.mdf!)).toBeCloseTo(2400 / (2 * STARTER_RPM), 9);
    // Twice the speed halves it
    expect(chipLoad(endMill.shape, { feed: 2400, rpm: 28000 })).toBeCloseTo(2400 / 28000, 9);
  });

  it('has no chip load for a bit whose flutes are not counted, until they are', () => {
    const v = structuredClone(STARTER_TOOLS.find((t) => t.id === 'vbit-90')!);
    // The starter V-bits have two flutes; emptied, they are not counted.
    expect(flutesOf(v.shape)).toBe(2);
    setBitField(v, 'flutes', null);
    expect(flutesOf(v.shape)).toBeUndefined();
    expect(chipLoad(v.shape, v.settings.mdf!)).toBeUndefined();
    expect(feedForChipLoad(v.shape, 14000, 0.1)).toBeUndefined();
    setBitField(v, 'flutes', 2);
    expect(chipLoad(v.shape, v.settings.mdf!)).toBeCloseTo(1500 / (2 * STARTER_RPM), 9);
    expect(toolDef(1, v)).toBe('(ToolDef 1: SHAPE=vbit D=12.7 ANGLE=90 TIP=0 FLUTES=2 LEN=6.3 NAME=90 deg V-bit)');
    setBitField(v, 'flutes', null);
    expect('flutes' in v.shape).toBe(false);
  });

  it('counts the flutes of the starter bits', () => {
    expect(STARTER_TOOLS.map((t) => [t.id, flutesOf(t.shape)])).toEqual([
      ['endmill-1-4', 1],
      ['endmill-1-8', 1],
      ['endmill-1-16', 2],
      ['ballnose-1-8', 2],
      ['ballnose-1-4', 2],
      ['bullnose-3-8', 2],
      ['vbit-60', 2],
      ['vbit-90', 2],
    ]);
    expect([flutesOf(newBit('vBit', []).shape), flutesOf(newBit('taperBall', []).shape), flutesOf(newBit('ballNose', []).shape)]).toEqual([2, 2, 2]);
    // A new chamfer or roundover bit starts at two as well.
    expect([newBit('chamfer', []).shape, newBit('roundover', []).shape].map((s) => 'flutes' in s && s.flutes)).toEqual([2, 2]);
  });

  it('gives the feed for a chip load at a speed, and the chip load comes back', () => {
    const feed = feedForChipLoad(endMill.shape, 10000, 0.2)!;
    // 0.2 x 10000 x 1 = 2000 mm/min = 33.33 mm/s: the nearest whole mm/s is 33
    expect(feed).toBe(1980);
    expect(chipLoad(endMill.shape, { feed, rpm: 10000 })).toBeCloseTo(0.198, 9);
    expect(feedForChipLoad(endMill.shape, 10000, 0.001)).toBe(60);
    expect(feedForChipLoad(endMill.shape, 0, 0.2)).toBeUndefined();
    expect(feedForChipLoad(endMill.shape, 10000, 0)).toBeUndefined();
  });

  it('sets every starter bit to dial 2 on the starter machine\'s router', () => {
    const shop = createStarterShop();
    const router = shop.machines[0]!.router!;
    for (const t of STARTER_TOOLS) for (const s of Object.values(t.settings)) expect([s.rpm, routerDial(router, s.rpm)]).toEqual([STARTER_RPM, 2]);
  });

  it('keeps every starter feed a whole number of mm/s: the bits, the plunge limit, the probe', () => {
    const shop = lowRiderJobShop();
    const m = shop.machines[0]!;
    const feeds = [PLACEHOLDER_BIT_SETTINGS.feed, PLACEHOLDER_BIT_SETTINGS.plungeFeed, m.maxPlungeFeed, m.probe.fastFeed, m.probe.slowFeed, m.rapidFeed];
    for (const t of STARTER_TOOLS) for (const s of Object.values(t.settings)) feeds.push(s.feed, s.plungeFeed);
    expect(feeds.filter((f) => f % 60 !== 0)).toEqual([]);
    expect([m.maxPlungeFeed, m.probe.fastFeed, m.probe.slowFeed].map(feedPerSecond)).toEqual([6, 3, 1]);
  });

  it('gives the usual chip load for a bit that cuts on its full width, lower in solid wood', () => {
    const byId = (id: string) => STARTER_TOOLS.find((t) => t.id === id)!;
    expect(chipLoadRange(byId('endmill-1-4').shape, 'plywood')).toEqual({ least: 0.1, most: 0.2 });
    expect(chipLoadRange(byId('endmill-1-8').shape, 'mdf')).toEqual({ least: 0.05, most: 0.1 });
    expect(chipLoadRange(byId('endmill-1-16').shape, 'osb')).toEqual({ least: 0.03, most: 0.05 });
    expect(chipLoadRange(byId('endmill-1-4').shape, 'solid-wood')).toEqual({ least: 0.1, most: 0.15 });
    // A V-bit cuts on a width that changes with its depth: no range, even with its flutes counted.
    const v = structuredClone(byId('vbit-90'));
    setBitField(v, 'flutes', 2);
    expect(chipLoadRange(v.shape, 'mdf')).toBeUndefined();
    expect(chipLoadCheck(v.shape, 'mdf', v.settings.mdf!)).toBeUndefined();
  });

  it('says when a row is below or above the usual chip load', () => {
    const shape = STARTER_TOOLS.find((t) => t.id === 'endmill-1-4')!.shape;
    // One flute at 14000 RPM: 40 mm/s is 0.171, 20 mm/s is 0.086, 50 mm/s is 0.214
    expect([2400, 1200, 3000].map((feed) => chipLoadCheck(shape, 'plywood', { feed, rpm: 14000 }))).toEqual(['ok', 'low', 'high']);
    expect(chipLoadCheck(shape, 'solid-wood', { feed: 2400, rpm: 14000 })).toBe('high');
    // The ends of the range are inside it
    expect(chipLoadCheck(shape, 'plywood', { feed: 1400, rpm: 14000 })).toBe('ok');
    expect(chipLoadCheck(shape, 'plywood', { feed: 2800, rpm: 14000 })).toBe('ok');
  });

  it('shows a stepover as a percentage of the bit at its widest, and takes one', () => {
    const byId = (id: string) => structuredClone(STARTER_TOOLS.find((t) => t.id === id)!);
    const quarter = byId('endmill-1-4');
    expect(BIT_SETTING_FIELDS.find((f) => f.ofWidth)).toMatchObject({ key: 'stepover', unit: '% of width' });
    expect([bitWidth(quarter.shape), bitWidth(byId('vbit-90').shape)]).toEqual([6.35, 12.7]);
    expect(stepoverPercent(quarter.shape, quarter.settings.mdf!.stepover)).toBe(40);
    expect(stepoverPercent(quarter.shape, 2.5)).toBe(39.4);
    expect(stepoverForPercent(quarter.shape, 40)).toBe(2.54);
    expect(stepoverPercent(quarter.shape, 2.54)).toBe(40);
    expect(stepoverPercent(byId('vbit-90').shape, 0)).toBe(0);
  });

  it('keeps a bit\'s stepover the same share of it when its width is changed', () => {
    const t = structuredClone(STARTER_TOOLS.find((x) => x.id === 'endmill-1-4')!);
    setBitField(t, 'diameter', len('1/2"'));
    expect([t.settings.mdf!.stepover, t.settings.osb!.stepover]).toEqual([5.08, 5.08]);
    expect(stepoverPercent(t.shape, t.settings.mdf!.stepover)).toBe(40);
    // Another field leaves it alone
    setBitField(t, 'flutes', 2);
    expect(t.settings.mdf!.stepover).toBe(5.08);
  });

  it('keeps stepovers on steps of 5% of the bit\'s width', () => {
    const quarter = STARTER_TOOLS.find((t) => t.id === 'endmill-1-4')!;
    expect(STEPOVER_STEP).toBe(5);
    expect([2.5, 2.7, 0.1, 0, 9].map((mm) => stepoverPercent(quarter.shape, snapStepover(quarter.shape, mm)))).toEqual([40, 45, 5, 0, 100]);
    expect(STARTER_TOOLS.map((t) => [t.id, stepoverPercent(t.shape, t.settings.mdf!.stepover)])).toEqual([
      ['endmill-1-4', 40],
      ['endmill-1-8', 40],
      ['endmill-1-16', 40],
      ['ballnose-1-8', 50],
      ['ballnose-1-4', 50],
      ['bullnose-3-8', 40],
      ['vbit-60', 0],
      ['vbit-90', 0],
    ]);
    // A new bit takes the share of the bit its feeds came from
    const big = newBit('ballNose', STARTER_TOOLS);
    expect(stepoverPercent(big.shape, big.settings.mdf!.stepover)).toBe(50);
  });

  it('starts every bit inside its usual chip load, in every material type', () => {
    const rows = STARTER_TOOLS.flatMap((t) => Object.entries(t.settings).map(([type, s]) => [t.id, type, chipLoadCheck(t.shape, type, s)]));
    expect(rows.filter(([, , check]) => check === 'low' || check === 'high')).toEqual([]);
    const feeds = (id: string) => {
      const t = STARTER_TOOLS.find((x) => x.id === id)!;
      return [t.settings.mdf!.feed, t.settings['solid-wood']!.feed].map(feedPerSecond);
    };
    expect([feeds('endmill-1-4'), feeds('endmill-1-8'), feeds('endmill-1-16'), feeds('ballnose-1-8'), feeds('ballnose-1-4')]).toEqual([
      [40, 30],
      [20, 15],
      [16, 16],
      [30, 30],
      // The 1/4" ball nose, for flutes: twice the 1/8" one's, for the same share of its width a tooth.
      [60, 60],
    ]);
  });
});
