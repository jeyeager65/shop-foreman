import { describe, expect, it } from 'vitest';
import { computed, reactive } from 'vue';
import { SETTING_KEYS, cabinetsOf, deriveCabinetParts, hasOwnSettings, setOwnSettings } from '@/design';
import { MDF_ID, createStarterShop } from '@/libraries';
import type { CasesContext, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { len } from '@/units';

const shop = createStarterShop();
const contextOf = (project: Project) => project.context as CasesContext;

/** The reference cabinet and a second one beside it, a copy of the first with no fronts. */
function twoCabinets(): Project {
  const project = createBaseCabinetProject('frameless');
  const context = contextOf(project);
  context.pieces.push({ ...structuredClone(context.pieces[0]!), id: 'cabinet-2', name: 'Second cabinet' });
  return project;
}
const bottomWidth = (parts: Part[], cabinetId: string) => parts.find((p) => p.id === `${cabinetId}/bottom`)!.size.width;

describe('project-wide settings', () => {
  it('a stored cabinet holds only what is its own', () => {
    const stored = contextOf(createBaseCabinetProject()).pieces[0]!;
    // Its kind too: the project holds pieces, and a cabinet is the piece that is a case.
    expect(Object.keys(stored).sort()).toEqual(['adjustableShelves', 'form', 'id', 'kind', 'layout', 'name', 'quantity', 'sides', 'size']);
    expect(stored.kind).toBe('case');
    expect(Object.keys(contextOf(createBaseCabinetProject()).settings).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it('a cabinet reads the project\'s settings, and writing one writes to the project', () => {
    const project = twoCabinets();
    const [first, second] = cabinetsOf(project);
    expect(first!.joinery).toBe(contextOf(project).settings.joinery);
    first!.joinery.case = 'dado';
    first!.construction = 'faceFrame';
    first!.toeKick = { height: len('4"'), depth: len('3"') };
    expect(contextOf(project).settings).toMatchObject({ construction: 'faceFrame', joinery: { case: 'dado' }, toeKick: { height: len('4"') } });
    // The other cabinet follows the project too.
    expect([second!.construction, second!.joinery.case, second!.toeKick.height]).toEqual(['faceFrame', 'dado', len('4"')]);
  });

  it('its own values are written to the cabinet', () => {
    const project = twoCabinets();
    const [first, second] = cabinetsOf(project);
    second!.size.width = len('30"');
    second!.adjustableShelves = 2;
    second!.name = 'Wide one';
    expect(contextOf(project).pieces[1]).toMatchObject({ name: 'Wide one', adjustableShelves: 2, size: { width: len('30"') } });
    expect([first!.size.width, first!.adjustableShelves]).toEqual([len('24"'), 1]);
  });

  it('one setting changes the parts of every cabinet that follows the project', () => {
    const project = twoCabinets();
    const before = deriveCabinetParts(project, shop);
    cabinetsOf(project)[0]!.joinery.case = 'dado';
    const after = deriveCabinetParts(project, shop);
    for (const id of ['cabinet-1', 'cabinet-2']) expect(bottomWidth(after, id)).toBeGreaterThan(bottomWidth(before, id));
  });

  it('a cabinet with its own copy of a group no longer follows the project for it', () => {
    const project = twoCabinets();
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    const [first, second] = cabinetsOf(project);
    expect(hasOwnSettings(second!, 'caseAndJoinery')).toBe(true);
    expect(hasOwnSettings(second!, 'construction')).toBe(false);
    expect(hasOwnSettings(first!, 'caseAndJoinery')).toBe(false);
    // The copy starts as the project's, and is a copy.
    expect(second!.joinery).toEqual(contextOf(project).settings.joinery);
    expect(second!.joinery).not.toBe(contextOf(project).settings.joinery);

    second!.joinery.case = 'dado';
    second!.materials.caseId = MDF_ID;
    expect(contextOf(project).settings.joinery.case).toBe('pocketScrews');
    expect(first!.joinery.case).toBe('pocketScrews');
    const parts = deriveCabinetParts(project, shop);
    expect(bottomWidth(parts, 'cabinet-2')).toBeGreaterThan(bottomWidth(parts, 'cabinet-1'));
    expect(parts.find((p) => p.id === 'cabinet-2/bottom')!.materialId).toBe(MDF_ID);

    // A change to the project reaches the first cabinet, not the second, for that group; the other group still does.
    first!.joinery.back = 'groove';
    first!.construction = 'shop';
    expect([second!.joinery.back, second!.construction]).toEqual(['rabbet', 'shop']);
  });

  it('switching it off drops the copy and the cabinet follows the project again', () => {
    const project = twoCabinets();
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    setOwnSettings(project, 'cabinet-2', 'construction', true);
    cabinetsOf(project)[1]!.joinery.case = 'dado';
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', false);
    expect(cabinetsOf(project)[1]!.joinery.case).toBe('pocketScrews');
    expect(Object.keys(contextOf(project).pieces[1]!.overrides!).sort()).toEqual(['construction', 'faceFrame', 'frameless', 'shop', 'toeKick']);
    setOwnSettings(project, 'cabinet-2', 'construction', false);
    expect(contextOf(project).pieces[1]!.overrides).toBeUndefined();
  });

  it('a cabinet in another style takes that style\'s values with it', () => {
    const project = twoCabinets();
    setOwnSettings(project, 'cabinet-2', 'construction', true);
    const [first, second] = cabinetsOf(project);
    second!.construction = 'shop';
    second!.shop.gap = len('3/16"');
    second!.toeKick.off = true;
    expect([first!.construction, first!.shop.gap, first!.toeKick.off]).toEqual(['frameless', len('1/8"'), undefined]);
    expect([second!.construction, second!.shop.gap, second!.toeKick.off]).toEqual(['shop', len('3/16"'), true]);
  });

  it('a copy of a resolved cabinet is a plain cabinet with every setting filled in', () => {
    const project = twoCabinets();
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    const copy = JSON.parse(JSON.stringify(cabinetsOf(project)[1])) as Record<string, unknown>;
    expect(Object.keys(copy).sort()).toEqual(['adjustableShelves', 'form', 'id', 'layout', 'name', 'quantity', 'sides', 'size', ...SETTING_KEYS].sort());
    expect(Object.keys({ ...cabinetsOf(project)[1]! }).sort()).toEqual(Object.keys(copy).sort());
  });

  it('works on a reactive project: what is computed from a cabinet follows a write to it', () => {
    const project = reactive(twoCabinets()) as Project;
    const style = computed(() => cabinetsOf(project).map((c) => `${c.construction} ${c.joinery.case}`));
    expect(style.value).toEqual(['frameless pocketScrews', 'frameless pocketScrews']);
    cabinetsOf(project)[0]!.construction = 'shop';
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    cabinetsOf(project)[1]!.joinery.case = 'dado';
    expect(style.value).toEqual(['shop pocketScrews', 'shop dado']);
  });
});

describe('project-wide settings in saved data', () => {

  it('keeps a cabinet\'s own settings through export and import, with the material they name', () => {
    const project = twoCabinets();
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    // A material nothing else in the project uses.
    const mine = { ...shop, materials: [...shop.materials, { ...shop.materials[0]!, id: 'test-sheet' }] };
    cabinetsOf(project)[1]!.materials.caseId = 'test-sheet';
    project.materials.push({ ...shop.materials[0]!, id: 'test-sheet' });
    const file = parseProjectFile(serializeProjectFile(exportProject(project, mine)));
    expect(file.project).toEqual(project);
    expect(file.project.materials.map((m) => m.id)).toContain('test-sheet');
  });
});
