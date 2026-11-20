// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyPreset, cabinetsOf, deletePreset, overwritePreset, renamePreset, resolvePreset, savePreset, standardStartSizes } from '@/design';
import { buildJob } from '@/job/buildJob';
import { GENERIC_HINGE_ID, GENERIC_SLIDE_ID, PLYWOOD_3_4_ID, createStarterShopProfile } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, EXISTING_PRESET_ID, SHOP_PRESET_ID, builtInPresets, newProjectFromPreset, presetsOf } from '@/samples/presets';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';

/** Milestone 5: presets in the shop profile. */
const contextOf = (p: Project) => p.context as CasesContext;
const presetById = (id: string) => builtInPresets().find((p) => p.id === id)!;
/** The G-code of a project's job: what a preset must give the same of. */
const gcode = (p: Project) => buildJob({ ...p, slug: 'same', name: 'Same' }, createStarterShopProfile()).files.map((f) => f.text);

describe('built-in presets', () => {
  it('are the four from the reference projects, and three for furniture', () => {
    expect(builtInPresets().map((p) => [p.name, p.start ?? 'made', !!p.builtIn])).toEqual([
      ['Frameless, shaker', 'made', true],
      ['Face frame, shaker', 'made', true],
      ['Shop cabinets: inset slab', 'made', true],
      ['Cabinets already there: new shaker doors', 'existing', true],
      // Furniture: face frame, slab fronts, stained; in plywood, or in solid wood all through.
      ['Furniture: face frame, plywood, stained', 'made', true],
      ['Furniture: face frame, solid wood, stained', 'made', true],
      // The inset style made fit for a house.
      ['Furniture: inset, plywood with solid wood edges, stained', 'made', true],
    ]);
    const inset = builtInPresets().find((p) => p.id === 'builtin-furniture-inset')!;
    expect([inset.settings.construction, inset.settings.materials.caseId, Math.round((inset.settings.shop.edgeStrip?.mm ?? 0) * 100) / 100, inset.fronts.doors.shop?.materialId, inset.fronts.drawers.shop?.front, inset.fronts.drawers.shop?.frontMaterialId, inset.finish?.caseId]).toEqual(
      ['shop', 'plywood-3-4', 19.05, 'solid-wood-3-4', 'wide', 'solid-wood-3-4', 'stain-golden-oak'],
    );
    // The gap is the shop preset's; the case is joined and stood as the other furniture presets' are.
    const plywood = builtInPresets().find((p) => p.id === 'builtin-furniture-plywood')!;
    expect(inset.settings.shop.gap).toEqual(builtInPresets().find((p) => p.id === SHOP_PRESET_ID)!.settings.shop.gap);
    expect([inset.settings.joinery, inset.settings.toeKick]).toEqual([plywood.settings.joinery, plywood.settings.toeKick]);
    expect(inset.materials.map((m) => m.id)).toEqual(expect.arrayContaining(['plywood-3-4', 'solid-wood-3-4']));
    const furniture = builtInPresets().find((p) => p.id === 'builtin-furniture-solid')!;
    expect([furniture.settings.construction, furniture.settings.materials.caseId, furniture.fronts.doors.style.kind, furniture.fronts.doors.materialId, furniture.finish?.caseId]).toEqual(['faceFrame', 'solid-wood-3-4', 'slab', 'solid-wood-3-4', 'stain-golden-oak']);
    // Complete: every detail value, and copies of what they name.
    const shop = presetById(SHOP_PRESET_ID);
    expect(shop.settings).toEqual(contextOf(createShopCabinetProject()).settings);
    expect(shop.fronts).toEqual(contextOf(createShopCabinetProject()).fronts);
    expect(shop.materials.map((m) => m.id)).toEqual(['mdf-3-4', 'plywood-3-4', 'plywood-1-4', 'solid-wood-3-4', 'plywood-1-2']);
    // One for cabinets already there is as complete: what is fitted inside them follows it too.
    expect(presetById(EXISTING_PRESET_ID).materials.map((m) => m.id)).toEqual(['mdf-3-4', 'plywood-3-4', 'plywood-1-4', 'solid-wood-3-4', 'plywood-1-2']);
  });

  it('carry the standard start sizes; the shop cabinets start 30" tall', () => {
    expect(presetById(FRAMELESS_PRESET_ID).sizes).toEqual(standardStartSizes());
    expect(presetById(SHOP_PRESET_ID).sizes!.base.height).toEqual(len('30"'));
    expect(presetById(SHOP_PRESET_ID).sizes!.wall).toEqual(standardStartSizes().wall);
    expect(presetById(EXISTING_PRESET_ID).sizes).toEqual(standardStartSizes());
  });

  it('applied to a new project give the same job as New cabinet and New shop cabinet', () => {
    const shop = createStarterShopProfile();
    const from = (id: string) => newProjectFromPreset(presetById(id), shop).project;
    expect(gcode(from(FRAMELESS_PRESET_ID))).toEqual(gcode(createBaseCabinetProject('frameless')));
    expect(gcode(from(FACE_FRAME_PRESET_ID))).toEqual(gcode(createBaseCabinetProject('faceFrame')));
    expect(gcode(from(SHOP_PRESET_ID))).toEqual(gcode(createShopCabinetProject()));
    expect(gcode(from(EXISTING_PRESET_ID))).toEqual(gcode(createVanityProject()));
  });

  it('a new project holds only the preset materials and names the preset', () => {
    const { project, fellBack } = newProjectFromPreset(presetById(EXISTING_PRESET_ID), createStarterShopProfile());
    expect(project.materials.map((m) => m.id)).toEqual(presetById(EXISTING_PRESET_ID).materials.map((m) => m.id));
    expect(project.preset).toBe('Cabinets already there: new shaker doors');
    // It starts with one cabinet that is already there, measured for new doors.
    expect(cabinetsOf(project).map((c) => [c.existing?.fronts, !!c.existing?.inside])).toEqual([['new', false]]);
    expect(fellBack).toEqual([]);
  });
});

describe('applying a preset to a project with cabinets', () => {
  it('replaces the shared values and keeps the cabinets and their overrides', () => {
    const project = createBaseCabinetProject('frameless');
    const cabinet = contextOf(project).pieces[0]!;
    cabinet.size.width = len('30"');
    cabinet.overrides = { joinery: { case: 'dado', back: 'groove', backStretcherForm: 'flat' } };
    applyPreset(project, presetById(SHOP_PRESET_ID), createStarterShopProfile());
    expect(contextOf(project).settings.construction).toBe('shop');
    expect(cabinet.size.width).toEqual(len('30"'));
    expect(cabinetsOf(project)[0]!.joinery.case).toBe('dado');
    expect(project.preset).toBe('Shop cabinets: inset slab');
  });

  it('keeps a material the project has already measured', () => {
    const project = createBaseCabinetProject('frameless');
    project.materials.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness = len('18mm');
    applyPreset(project, presetById(SHOP_PRESET_ID), createStarterShopProfile());
    expect(project.materials.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness.mm).toBe(18);
  });

  it('any preset can be applied to any project: one of cabinets already there keeps them, measured', () => {
    const vanity = createVanityProject();
    applyPreset(vanity, presetById(SHOP_PRESET_ID), createStarterShopProfile());
    expect(cabinetsOf(vanity)[0]!.existing?.opening.width).toEqual(len('20-15/16"'));
    const made = createBaseCabinetProject();
    applyPreset(made, presetById(EXISTING_PRESET_ID), createStarterShopProfile());
    expect(cabinetsOf(made)[0]!.existing).toBeUndefined();
  });
});

describe('falling back', () => {
  it('hardware the shop no longer has gives way to the generic entry, and says so', () => {
    const preset = presetById(FACE_FRAME_PRESET_ID);
    preset.fronts.doors.hingeId = 'gone-hinge';
    preset.fronts.drawers.slideId = 'gone-slide';
    const { preset: resolved, fellBack } = resolvePreset(preset, createStarterShopProfile());
    expect(resolved.fronts.doors.hingeId).toBe(GENERIC_HINGE_ID);
    expect(resolved.fronts.drawers.slideId).toBe(GENERIC_SLIDE_ID);
    expect(fellBack).toHaveLength(2);
    expect(fellBack[0]).toMatch(/gone-hinge is not in the shop/);
    // The preset itself is not changed.
    expect(preset.fronts.doors.hingeId).toBe('gone-hinge');
  });

  it('a material the preset does not carry comes from the catalog, else the catalog first', () => {
    const preset = presetById(FRAMELESS_PRESET_ID);
    preset.materials = preset.materials.filter((m) => m.id !== PLYWOOD_3_4_ID);
    preset.settings!.faceFrame.materialId = 'gone-wood';
    const { preset: resolved, fellBack } = resolvePreset(preset, createStarterShopProfile());
    expect(resolved.materials.map((m) => m.id)).toContain(PLYWOOD_3_4_ID);
    expect(resolved.settings!.faceFrame.materialId).toBe('mdf-3-4');
    expect(fellBack).toEqual(['The material gone-wood is not in the preset or the catalog: MDF instead.']);
  });
});

describe("the user's own presets", () => {
  it('are saved from a project, renamed, overwritten and deleted', () => {
    const shop = createStarterShopProfile();
    const project = createShopCabinetProject();
    const mine = savePreset(shop, project, ' My shop ');
    expect(mine).toMatchObject({ id: 'preset-1', name: 'My shop' });
    expect(mine.start).toBeUndefined();
    expect(presetsOf(shop).map((p) => p.name).at(-1)).toBe('My shop');
    renamePreset(shop, mine.id, 'Garage');
    expect(shop.presets[0]!.name).toBe('Garage');
    contextOf(project).settings.joinery.case = 'dado';
    overwritePreset(shop, mine.id, project);
    expect(shop.presets[0]).toMatchObject({ id: 'preset-1', name: 'Garage' });
    expect(shop.presets[0]!.settings!.joinery.case).toBe('dado');
    // A project started from it copies it and does not follow it.
    const started = newProjectFromPreset(shop.presets[0]!, shop).project;
    deletePreset(shop, mine.id);
    expect(shop.presets).toEqual([]);
    expect(contextOf(started).settings.joinery.case).toBe('dado');
  });

  it('built-in ones cannot be changed or deleted', () => {
    const shop = createStarterShopProfile();
    expect(() => renamePreset(shop, SHOP_PRESET_ID, 'Mine')).toThrow(/built-in/);
    expect(() => deletePreset(shop, SHOP_PRESET_ID)).toThrow(/built-in/);
    expect(() => overwritePreset(shop, SHOP_PRESET_ID, createShopCabinetProject())).toThrow(/built-in/);
  });
});
