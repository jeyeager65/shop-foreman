import { describe, expect, it } from 'vitest';
import { computed, reactive } from 'vue';
import { deriveDrawerBoxParts, deriveParts, designsOf, frontDifferences, hasOwnFrontSettings, hungDesigns, isDoorSet, isDrawer, setOwnFrontSettings } from '@/design';
import { PLYWOOD_3_4_ID, createStarterShop } from '@/libraries';
import type { CasesContext, DoorSetDesign, DrawerDesign, Project } from '@/model';
import { CABINET_HINGE_ID, createBaseCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { len } from '@/units';

const shop = createStarterShop();
const frontsOf = (project: Project) => (project.context as CasesContext).fronts;
const doorsOf = (project: Project) => designsOf(project).find(isDoorSet)!;
const drawersOf = (project: Project) => designsOf(project).filter(isDrawer);
/** A face frame cabinet with two drawers: `drawer-1` and `drawer-2`. */
const twoDrawers = () => createBaseCabinetProject('faceFrame', 'drawers', 2);

describe('project-wide front settings', () => {
  it('a stored door set and drawer hold only what is their own', () => {
    const project = createBaseCabinetProject();
    expect(project.designObjects.map((d) => Object.keys(d).sort())).toEqual([
      ['id', 'mounting', 'name', 'template'],
      ['box', 'id', 'mounting', 'name', 'slide', 'template'],
    ]);
    expect(Object.keys(project.designObjects[0]!.mounting).sort()).toEqual(['doors', 'gap', 'openingId', 'overlayBottom', 'overlayTop', 'type']);
    expect(project.designObjects[1]).toMatchObject({ slide: {}, box: {} });
    expect(Object.keys(frontsOf(project).doors).sort()).toEqual(['hingeId', 'materialId', 'outsideEdge', 'style']);
    expect(Object.keys(frontsOf(project).drawers).sort()).toEqual(['cornerJoint', 'faceFrameMount', 'front', 'materials', 'slideId']);
  });

  it("a front reads the project's settings, and writing one writes to the project", () => {
    const project = twoDrawers();
    const [first, second] = drawersOf(project);
    expect(first!.front).toBe(frontsOf(project).drawers.front);
    first!.box.cornerJoint = 'pocketScrews';
    first!.slide.faceFrameMount = 'rearBrackets';
    first!.front.style = { kind: 'slab' };
    first!.shop = { front: 'plain' };
    expect(frontsOf(project).drawers).toMatchObject({ cornerJoint: 'pocketScrews', faceFrameMount: 'rearBrackets', front: { style: { kind: 'slab' } }, shop: { front: 'plain' } });
    // The other drawer follows the project too.
    expect([second!.box.cornerJoint, second!.slide.faceFrameMount, second!.front.style.kind, second!.shop?.front]).toEqual(['pocketScrews', 'rearBrackets', 'slab', 'plain']);

    const doors = doorsOf(project);
    doors.mounting.shopHingeId = 'some-hinge';
    doors.materialId = PLYWOOD_3_4_ID;
    doors.shopPull = 'fingerPull';
    expect(frontsOf(project).doors).toMatchObject({ hingeId: CABINET_HINGE_ID, shopHingeId: 'some-hinge', materialId: PLYWOOD_3_4_ID, shopPull: 'fingerPull' });
    // Taking an optional setting away takes it off the project.
    delete doors.shopPull;
    delete doors.mounting.shopHingeId;
    expect(Object.keys(frontsOf(project).doors).sort()).toEqual(['hingeId', 'materialId', 'outsideEdge', 'style']);
  });

  it('its own values are written to the front', () => {
    const project = twoDrawers();
    const [first, second] = drawersOf(project);
    second!.slide.length = len('18"');
    second!.box.height = len('4"');
    second!.mounting.overlaySide = len('3/4"');
    second!.name = 'Deep one';
    expect(project.designObjects.find((d) => d.id === second!.id)).toMatchObject({ name: 'Deep one', slide: { length: len('18"') }, box: { height: len('4"') } });
    expect([first!.slide.length, first!.box.height, first!.mounting.overlaySide]).toEqual([undefined, undefined, undefined]);
    expect(frontsOf(project).drawers).not.toHaveProperty('length');
    delete second!.slide.length;
    delete second!.mounting.overlaySide;
    expect(project.designObjects.find((d) => d.id === second!.id)).toMatchObject({ slide: {}, mounting: { openingId: second!.mounting.openingId } });
    expect(second!.mounting.overlaySide).toBeUndefined();

    const doors = doorsOf(project);
    doors.mounting.doors = 1;
    doors.mounting.hingeSide = 'right';
    expect(project.designObjects.find((d) => d.id === doors.id)!.mounting).toMatchObject({ doors: 1, hingeSide: 'right' });
    expect(frontsOf(project).doors).not.toHaveProperty('doors');
  });

  it('a part of a front that is set whole lands where each of its values belongs', () => {
    const project = twoDrawers();
    const [first, second] = drawersOf(project);
    first!.slide = { slideId: 'another', length: len('18"'), faceFrameMount: 'rearBrackets' };
    expect(project.designObjects.find((d) => d.id === first!.id)).toMatchObject({ slide: { length: len('18"') } });
    expect(frontsOf(project).drawers).toMatchObject({ slideId: 'another', faceFrameMount: 'rearBrackets' });
    expect([second!.slide.slideId, second!.slide.length]).toEqual(['another', undefined]);
  });

  it('one setting changes the parts of every front that follows the project', () => {
    const project = twoDrawers();
    const pockets = () => deriveDrawerBoxParts(project, shop).filter((p) => p.features.some((f) => f.kind === 'pocketHole')).map((p) => p.designObjectId);
    expect(pockets()).toEqual([]);
    drawersOf(project)[0]!.box.cornerJoint = 'pocketScrews';
    expect(new Set(pockets())).toEqual(new Set(['drawer-1', 'drawer-2']));
  });

  it('a front with its own copy of the settings no longer follows the project', () => {
    const project = twoDrawers();
    setOwnFrontSettings(project, 'drawer-2', true);
    const [first, second] = drawersOf(project);
    expect([hasOwnFrontSettings(first!), hasOwnFrontSettings(second!), hasOwnFrontSettings(doorsOf(project))]).toEqual([false, true, false]);
    // The copy starts as the project's, and is a copy.
    expect(second!.overrides).toEqual(frontsOf(project).drawers);
    expect(second!.front).not.toBe(frontsOf(project).drawers.front);

    second!.box.cornerJoint = 'pocketScrews';
    second!.front.style = { kind: 'slab' };
    expect(frontsOf(project).drawers).toMatchObject({ cornerJoint: 'rabbet', front: { style: { kind: 'shaker' } } });
    expect([first!.box.cornerJoint, first!.front.style.kind]).toEqual(['rabbet', 'shaker']);
    const pocketed = deriveDrawerBoxParts(project, shop).filter((p) => p.features.some((f) => f.kind === 'pocketHole'));
    expect(new Set(pocketed.map((p) => p.designObjectId))).toEqual(new Set(['drawer-2']));
    const fronts = deriveParts(project, shop);
    expect(fronts.find((p) => p.id === 'drawer-1/front')!.features.some((f) => f.kind === 'pocket')).toBe(true);
    expect(fronts.find((p) => p.id === 'drawer-2/front')!.features.some((f) => f.kind === 'pocket')).toBe(false);

    // A change to the project reaches the first drawer, not the second.
    first!.slide.faceFrameMount = 'rearBrackets';
    expect(second!.slide.faceFrameMount).toBe('strips');
  });

  it('switching it off drops the copy and the front follows the project again', () => {
    const project = twoDrawers();
    setOwnFrontSettings(project, 'drawer-2', true);
    drawersOf(project)[1]!.box.cornerJoint = 'pocketScrews';
    setOwnFrontSettings(project, 'drawer-2', false);
    expect(drawersOf(project)[1]!.box.cornerJoint).toBe('rabbet');
    expect(project.designObjects.find((d) => d.id === 'drawer-2')).not.toHaveProperty('overrides');

    setOwnFrontSettings(project, 'doors-1', true);
    doorsOf(project).mounting.hingeId = 'mine';
    expect([frontsOf(project).doors.hingeId, doorsOf(project).mounting.hingeId]).toEqual([CABINET_HINGE_ID, 'mine']);
    setOwnFrontSettings(project, 'doors-1', false);
    expect(doorsOf(project).mounting.hingeId).toBe(CABINET_HINGE_ID);
  });

  it('a copy of a resolved front is a plain front with every setting filled in', () => {
    const project = createBaseCabinetProject('faceFrame');
    setOwnFrontSettings(project, 'drawer-1', true);
    const [doors, drawer] = designsOf(project) as [DoorSetDesign, DrawerDesign];
    const copies = [JSON.parse(JSON.stringify(doors)), { ...doors, mounting: { ...doors.mounting } }] as Record<string, unknown>[];
    for (const copy of copies) {
      expect(Object.keys(copy).sort()).toEqual(['id', 'materialId', 'mounting', 'name', 'outsideEdge', 'style', 'template']);
      expect(Object.keys(copy.mounting as object).sort()).toEqual(['doors', 'gap', 'hingeId', 'openingId', 'overlayBottom', 'overlayTop', 'type']);
    }
    const copy = JSON.parse(JSON.stringify(drawer)) as DrawerDesign;
    expect(Object.keys(copy).sort()).toEqual(['box', 'front', 'id', 'mounting', 'name', 'slide', 'template']);
    expect(copy.slide).toEqual({ slideId: frontsOf(project).drawers.slideId, faceFrameMount: 'strips' });
    expect(copy.box).toEqual({ cornerJoint: 'rabbet', materials: frontsOf(project).drawers.materials });
    // The fronts as they hang are such copies, and hang the same a second time.
    const hung = hungDesigns(createBaseCabinetProject('frameless'), shop);
    expect(hung.every((d) => d.overrides === undefined)).toBe(true);
  });

  it('works on a reactive project: what is computed from a front follows a write to it', () => {
    const project = reactive(twoDrawers()) as Project;
    const corners = computed(() => drawersOf(project).map((d) => `${d.box.cornerJoint} ${d.slide.length?.mm ?? 'auto'}`));
    expect(corners.value).toEqual(['rabbet auto', 'rabbet auto']);
    drawersOf(project)[0]!.box.cornerJoint = 'pocketScrews';
    expect(corners.value).toEqual(['pocketScrews auto', 'pocketScrews auto']);
    setOwnFrontSettings(project, 'drawer-2', true);
    drawersOf(project)[1]!.box.cornerJoint = 'rabbet';
    drawersOf(project)[1]!.slide.length = len('18"');
    expect(corners.value).toEqual(['pocketScrews auto', `rabbet ${len('18"').mm}`]);
    delete drawersOf(project)[1]!.slide.length;
    expect(corners.value).toEqual(['pocketScrews auto', 'rabbet auto']);
  });

  it("a refacing project's door sets follow its fronts, as a designed cabinet's do (milestone 5)", () => {
    const vanity = createVanityProject();
    const [doors] = designsOf(vanity).filter(isDoorSet);
    expect(doors!.mounting.hingeId).toBe(vanity.context.fronts.doors.hingeId);
    expect(doors!.style).toBe(vanity.context.fronts.doors.style);
    // Made different, it has its own copy; the project's stays as it was.
    setOwnFrontSettings(vanity, doors!.id, true);
    const own = designsOf(vanity).filter(isDoorSet)[0]!;
    own.style = { kind: 'slab' };
    expect(vanity.context.fronts.doors.style.kind).toBe('shaker');
    expect(frontDifferences(vanity, own.id)).toEqual(['style']);
  });
});

describe('project-wide front settings in saved data', () => {

  it("keeps a front's own settings through export and import, with what they name", () => {
    const project = twoDrawers();
    setOwnFrontSettings(project, 'drawer-2', true);
    // A slide and a material nothing else in the project uses.
    const mine = {
      ...shop,
      materials: [...shop.materials, { ...shop.materials[0]!, id: 'test-sheet' }],
      hardware: [...shop.hardware, { ...shop.hardware.find((h) => h.kind === 'slide')!, id: 'test-slide', generic: false }],
    };
    const second = drawersOf(project)[1]!;
    second.slide.slideId = 'test-slide';
    second.box.materials.boxId = 'test-sheet';
    const file = parseProjectFile(serializeProjectFile(exportProject(project, mine)));
    expect(file.project).toEqual(project);
    expect(file.library.hardware.map((h) => h.id)).toContain('test-slide');
    const plain = exportProject(twoDrawers(), mine).library;
    expect(plain.hardware.some((h) => h.id === 'test-slide')).toBe(false);
  });
});
