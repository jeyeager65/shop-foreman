// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addMaterialFromCatalog, deriveCabinetParts, materialIdsOf, shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { listsHtml } from '@/job/listsHtml';
import { MATERIAL_TYPES, OSB_3_4_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, CABINET_MATERIALS, materialLook } from '@/libraries';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { projectProblem } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderJobShop, lowRiderShop } from './lowRider';

/** Milestone 5: materials belong to the project, copied from a catalog. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);

describe('the project holds its materials', () => {
  it('samples start with copies of the starter materials, so their jobs are as before', () => {
    expect(createVanityProject().materials).toEqual(CABINET_MATERIALS);
    expect(createBaseCabinetProject().materials).toEqual(CABINET_MATERIALS);
  });

  it('a job reads the project materials, never the catalog', () => {
    const project = createBaseCabinetProject();
    const profile = lowRiderShop();
    const before = buildJob(project, profile);
    // Measuring this project's plywood changes this project's parts...
    project.materials.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness = len('18mm');
    const after = buildJob(project, profile);
    const side = (job: typeof before) => job.cabinetParts.find((p) => p.role === 'side')!;
    expect(side(after).size.thickness).toBe(18);
    expect(side(before).size.thickness).not.toBe(18);
    // ...and the catalog's typical value changes nothing.
    const again = createBaseCabinetProject();
    profile.materialCatalog.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness = len('12mm');
    expect(side(buildJob(again, profile)).size.thickness).toBe(side(before).size.thickness);
  });

  it('shopFor puts the project materials in place of the catalog', () => {
    const project = createBaseCabinetProject();
    project.materials = project.materials.filter((m) => m.id !== SOLID_WOOD_3_4_ID);
    const shop = shopFor(project, lowRiderShop());
    expect(shop.materials).toBe(project.materials);
    expect('materialCatalog' in shop).toBe(false);
    // A shop that already has materials gets the project's all the same.
    expect(shopFor(project, lowRiderJobShop()).materials).toBe(project.materials);
  });

  it('a value naming a material the project lacks fails plainly', () => {
    const project = createBaseCabinetProject();
    project.materials = project.materials.filter((m) => m.id !== PLYWOOD_3_4_ID);
    expect(() => deriveCabinetParts(project, shopFor(project, lowRiderShop()))).toThrow();
  });
});

describe('the catalog', () => {
  it('a material is copied in once, keeping the catalog id the bits are keyed by', () => {
    const project = createBaseCabinetProject();
    project.materials = [];
    const catalog = lowRiderShop().materialCatalog;
    const copy = addMaterialFromCatalog(project, catalog, PLYWOOD_3_4_ID)!;
    expect(copy).toEqual(catalog.find((m) => m.id === PLYWOOD_3_4_ID));
    expect(copy).not.toBe(catalog.find((m) => m.id === PLYWOOD_3_4_ID));
    expect(addMaterialFromCatalog(project, catalog, PLYWOOD_3_4_ID)).toBe(copy);
    expect(project.materials).toHaveLength(1);
    expect(addMaterialFromCatalog(project, catalog, 'nothing')).toBeUndefined();
  });

  it('names the materials a project cannot do without', () => {
    // A cabinet that is already there still names the project's case materials: its shell is drawn with them, and what is fitted inside is made of them.
    expect(materialIdsOf(createVanityProject()).sort()).toEqual(['mdf-3-4', 'plywood-1-2', 'plywood-1-4', 'plywood-3-4', 'solid-wood-3-4']);
    expect(materialIdsOf(createBaseCabinetProject()).sort()).toEqual(['mdf-3-4', 'plywood-1-2', 'plywood-1-4', 'plywood-3-4', 'solid-wood-3-4']);
  });

  it('sheet goods say the sheets they come in; solid wood is bought as boards', () => {
    const catalog = lowRiderShop().materialCatalog;
    expect(catalog.filter((m) => m.sheets?.length).map((m) => m.id)).toEqual(['mdf-3-4', 'plywood-3-4', 'plywood-1-4', 'plywood-1-2', 'butcher-block-1-1-2', 'mdf-1-4', 'hardboard-1-8', 'hardboard-3-16', 'osb-7-16', 'osb-3-4']);
    // MDF comes 49" × 97".
    for (const m of catalog.filter((x) => x.groupId === 'mdf')) expect(m.sheets, m.id).toEqual([{ x: len('49"'), y: len('97"') }]);
  });

  it('is in groups, and whether a material has grain is its group\'s', () => {
    const profile = lowRiderShop();
    expect(profile.materialGroups.map((g) => g.name)).toEqual(['Plywood', 'MDF', 'Hardboard', 'OSB', 'Solid wood']);
    for (const m of profile.materialCatalog) {
      const group = profile.materialGroups.find((g) => g.id === m.groupId);
      expect(group, m.id).toBeDefined();
      expect(m.hasGrain, m.id).toBe(group!.hasGrain);
    }
  });
});

describe('material types', () => {
  it('come with the app, OSB among them, each with its sheets and its look', () => {
    expect(MATERIAL_TYPES.map((t) => t.id)).toEqual(['plywood', 'mdf', 'hardboard', 'osb', 'solid-wood']);
    const osb = MATERIAL_TYPES.find((t) => t.id === 'osb')!;
    expect(osb).toMatchObject({ hasGrain: false, look: { texture: 'strands' } });
    expect(osb.sheets).toEqual([{ x: len('48"'), y: len('96"') }]);
    // Solid wood is sold as boards.
    expect(MATERIAL_TYPES.find((t) => t.id === 'solid-wood')!.sheets).toBeUndefined();
    const catalog = lowRiderShop().materialCatalog;
    expect(catalog.filter((m) => m.groupId === 'osb').map((m) => m.id)).toEqual(['osb-7-16', 'osb-3-4']);
    expect(materialLook(catalog.find((m) => m.id === 'mdf-3-4')!)).toMatchObject({ texture: 'smooth' });
    expect(materialLook(catalog.find((m) => m.id === PLYWOOD_3_4_ID)!)).toMatchObject({ texture: 'wood' });
  });

  it('hold the bits\' settings: a profile keeps them by type, and a job finds them under each of its materials', () => {
    const profile = lowRiderShop();
    for (const tool of profile.tools) expect(Object.keys(tool.settings).sort(), tool.id).toEqual(['hardboard', 'mdf', 'osb', 'plywood', 'solid-wood']);
    // A project's own thickness of a type cuts on the type's settings, whatever its id.
    const project = createBaseCabinetProject();
    addMaterialFromCatalog(project, profile.materialCatalog, OSB_3_4_ID);
    project.materials.push({ ...structuredClone(project.materials.find((m) => m.id === PLYWOOD_3_4_ID)!), id: 'material-own-1', name: 'Baltic birch' });
    profile.tools[0]!.settings['plywood']!.feed = 1111;
    const shop = shopFor(project, profile);
    expect(shop.tools[0]!.settings['material-own-1']!.feed).toBe(1111);
    expect(shop.tools[0]!.settings[PLYWOOD_3_4_ID]!.feed).toBe(1111);
    expect(shop.tools[0]!.settings[OSB_3_4_ID]).toEqual(profile.tools[0]!.settings['osb']);
    // The profile's own bits are not changed by it.
    expect(profile.tools[0]!.settings['material-own-1']).toBeUndefined();
    // A type the bit has no settings for: the bit is not offered for its materials.
    delete profile.tools[0]!.settings['osb'];
    expect(shopFor(project, profile).tools[0]!.settings[OSB_3_4_ID]).toBeUndefined();
  });
});

describe('the buying list', () => {
  it('the vanity: one sheet of MDF, cut into the 24" × 48" piece its one blank is cut from', () => {
    const project = createVanityProject();
    const shop = lowRiderJobShop();
    const lists = buildLists(buildJob(project, shop), project, shop, L);
    // MDF is sold 49" × 97".
    expect(lists.buying).toEqual([{ material: '3/4" MDF', quantity: 1, unit: 'sheet', size: { width: len('49"').mm, height: len('97"').mm }, note: 'For the CNC: one 24" × 48" piece for each blank (blank 1), 4 to a sheet.' }]);
  });

  it('blanks cut from full sheets: a sheet each', () => {
    const project = createVanityProject();
    project.plan.blank.stock = { width: len('49"'), height: len('97"') };
    const shop = lowRiderJobShop();
    const [row] = buildLists(buildJob(project, shop), project, shop, L).buying;
    expect(row).toMatchObject({ quantity: 1, unit: 'sheet', note: 'For the CNC: one sheet for each blank (blank 1).' });
  });

  it('stock on hand bigger than the sheet the material comes in: pieces of it', () => {
    const project = createVanityProject();
    project.plan.blank.stock = { width: len('50"'), height: len('98"') };
    const shop = lowRiderJobShop();
    const [row] = buildLists(buildJob(project, shop), project, shop, L).buying;
    expect(row).toMatchObject({ quantity: 1, unit: 'piece', size: { width: len('50"').mm, height: len('98"').mm } });
  });

  it('a face frame cabinet: sheets for the blanks, board feet for the frame', () => {
    const project = createBaseCabinetProject('faceFrame');
    const shop = lowRiderJobShop();
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    const blanks = (id: string) => job.plan.blanks.filter((b) => b.materialId === id).length;
    const sheets = lists.buying.filter((b) => b.unit === 'sheet');
    // Two blanks, each from a 24" × 48" piece: four of those to a sheet.
    expect(blanks(PLYWOOD_3_4_ID)).toBe(2);
    // One line a material: the sheet for the CNC and those for the saw-cut parts are one total, the note saying which is which.
    const plywood = sheets.filter((b) => b.material === '3/4" Plywood');
    expect(plywood).toHaveLength(1);
    const split = /^(\d+) for the CNC: .* (\d+) for the \d+ parts? cut on the saw: /.exec(plywood[0]!.note)!;
    expect(Number(split[1])).toBe(1);
    expect(plywood[0]!.quantity).toBe(Number(split[1]) + Number(split[2]));
    for (const name of new Set(sheets.map((b) => b.material))) expect(sheets.filter((b) => b.material === name)).toHaveLength(1);
    const frame = lists.buying.find((b) => b.unit === 'board feet')!;
    expect(frame.material).toBe('3/4" Solid wood');
    // The frame's parts at 3/4" nominal, and 20% more.
    const boards = lists.parts.filter((p) => p.material === '3/4" Solid wood' && p.cutOut !== 'cnc');
    const feet = (boards.reduce((s, p) => s + p.size.width * p.size.height, 0) * 19.05) / 25.4 ** 3 / 144;
    expect(frame.quantity).toBeCloseTo(Math.ceil(feet * 1.2 * 10) / 10, 5);
    expect(listsHtml('Cabinet', lists, L)).toContain('<h2>To buy</h2>');
  });
});

describe('old saves', () => {
  it('a project of another version cannot be opened, and says so; nor one with no materials of its own', () => {
    expect(projectProblem(createVanityProject())).toBeUndefined();
    expect(projectProblem({ ...createVanityProject(), schemaVersion: '0.0' })).toMatch(/another version.*saved by version 0\.0 and this is version \d+\.\d+.*Delete it/);
    const old = createVanityProject() as Partial<ReturnType<typeof createVanityProject>>;
    delete old.materials;
    expect(projectProblem(old)).toMatch(/another version.*incomplete.*Delete it/);
  });
});
