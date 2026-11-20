// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, designsOf, isDrawer, mountedDesigns, setOwnFrontSettings, setOwnSettings } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import type { Part, Project } from '@/model';
import { NEW_CABINET, addCabinet, applyCabinetLayout, copyCabinet, createBaseCabinetProject, createShopWallProject, deleteCabinet, moveCabinet } from '@/samples/cabinet';
import { len } from '@/units';

/** Milestone 4: what the cabinet list on the Design screen does to the project. */
const shop = createStarterShop();
const names = (project: Project) => cabinetsOf(project).map((c) => c.name);
const ids = (project: Project) => cabinetsOf(project).map((c) => c.id);
/** A cabinet's parts with the ids taken off, to compare one cabinet with another. */
function shapes(project: Project, cabinetId: string) {
  const own = new Set([cabinetId, ...designsOf(project).filter((d) => d.mounting.openingId.startsWith(`${cabinetId}/`)).map((d) => d.id)]);
  const strip = (p: Part) => ({ name: p.name, size: p.size, materialId: p.materialId, features: p.features.length });
  return [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)].filter((p) => own.has(p.designObjectId)).map(strip);
}

describe('adding a cabinet', () => {
  it('starts beside the one it is added from: its height and depth, the starter width and layout', () => {
    const project = createShopWallProject();
    const added = addCabinet(project, { name: 'Cabinet 4', width: len(NEW_CABINET.width), layout: NEW_CABINET.layout, like: 'cabinet-2' });
    expect(names(project)).toEqual(['Drawers, left', 'Drawer over doors', 'Drawers, right', 'Cabinet 4']);
    expect([added.id, added.size.width, added.size.height, added.size.depth]).toEqual(['cabinet-4', len('24"'), len('30"'), len('22-1/2"')]);
    expect(mountedDesigns(project, shop.materials).filter((d) => d.mounting.openingId.startsWith('cabinet-4/')).map((d) => d.template).sort()).toEqual(['doorSet', 'drawer']);
    expect(added.overrides).toBeUndefined();
  });
});

describe('copying a cabinet', () => {
  it('puts the copy after the original, with its fronts under new ids, and the same parts', () => {
    const project = createShopWallProject();
    const copy = copyCabinet(project, 'cabinet-2');
    expect(names(project)).toEqual(['Drawers, left', 'Drawer over doors', 'Drawer over doors copy', 'Drawers, right']);
    expect(copy.id).toBe('cabinet-4');
    const fronts = designsOf(project);
    expect(new Set(fronts.map((d) => d.id)).size).toBe(fronts.length);
    expect(fronts.filter((d) => d.mounting.openingId.startsWith('cabinet-4/')).map((d) => d.mounting.openingId).sort()).toEqual(['cabinet-4/doors', 'cabinet-4/drawer']);
    expect(shapes(project, 'cabinet-4')).toEqual(shapes(project, 'cabinet-2'));
    // A second copy gets another name.
    expect(copyCabinet(project, 'cabinet-2').name).toBe('Drawer over doors copy 2');
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it("copies what is the cabinet's own, the settings it has made different, and the fronts waiting for another layout", () => {
    const project = createBaseCabinetProject('frameless');
    const first = cabinetsOf(project)[0]!;
    first.adjustableShelves = 2;
    first.sides.left = 'hidden';
    setOwnSettings(project, 'cabinet-1', 'caseAndJoinery', true);
    cabinetsOf(project)[0]!.joinery.case = 'dado';
    setOwnFrontSettings(project, 'drawer-1', true);
    designsOf(project).find(isDrawer)!.box.cornerJoint = 'pocketScrews';
    designsOf(project).find(isDrawer)!.box.height = len('4"');
    // Doors only: the drawer waits for its row.
    applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');

    const copy = copyCabinet(project, 'cabinet-1');
    expect([copy.adjustableShelves, copy.sides.left, copy.joinery.case]).toEqual([2, 'hidden', 'dado']);
    expect(copy.joinery).not.toBe(cabinetsOf(project)[0]!.joinery);
    // The project's own joint is untouched, and a change to the copy stays in the copy.
    copy.joinery.back = 'groove';
    expect(cabinetsOf(project)[0]!.joinery.back).toBe('rabbet');
    const waiting = designsOf(project).filter(isDrawer).find((d) => d.mounting.openingId === 'cabinet-2/drawer')!;
    expect([waiting.id, waiting.box.cornerJoint, waiting.box.height]).toEqual(['drawer-2', 'pocketScrews', len('4"')]);
    expect(waiting.overrides).not.toBe(designsOf(project).find(isDrawer)!.overrides);
    // Back to a drawer over doors, the copy has its drawer again.
    applyCabinetLayout(project, copy, 'drawerOverDoors');
    expect(designsOf(project).filter(isDrawer)).toHaveLength(2);
  });

  it('works on a reactive project, as the store holds it', () => {
    const project = reactive(createShopWallProject()) as Project;
    copyCabinet(project, 'cabinet-1');
    addCabinet(project, { name: 'New', width: len('18"'), layout: 'doors' });
    expect(names(project)).toEqual(['Drawers, left', 'Drawers, left copy', 'Drawer over doors', 'Drawers, right', 'New']);
    expect(() => buildJob(JSON.parse(JSON.stringify(project)) as Project, shop)).not.toThrow();
  });
});

describe('deleting and moving a cabinet', () => {
  it('removes the cabinet with its fronts and leaves the others as they were', () => {
    const project = createShopWallProject();
    const before = shapes(project, 'cabinet-3');
    deleteCabinet(project, 'cabinet-2');
    expect(ids(project)).toEqual(['cabinet-1', 'cabinet-3']);
    expect(project.designObjects.some((d) => d.mounting.openingId.startsWith('cabinet-2/'))).toBe(false);
    expect(shapes(project, 'cabinet-3')).toEqual(before);
    expect(deriveParts(project, shop)).toEqual([]);
    // A new cabinet takes the free id, and nothing of the old one comes back with it.
    expect(addCabinet(project, { name: 'New', width: len('18"'), layout: 'doors' }).id).toBe('cabinet-2');
    expect(designsOf(project).filter((d) => d.mounting.openingId.startsWith('cabinet-2/'))).toHaveLength(1);
  });

  it('keeps the last cabinet', () => {
    const project = createBaseCabinetProject();
    expect(() => deleteCabinet(project, 'cabinet-1')).toThrow(/at least one/);
    expect(() => deleteCabinet(project, 'nope')).toThrow(/not found/);
    expect(ids(project)).toEqual(['cabinet-1']);
  });

  it('moves a cabinet one place and stops at the ends; the job has the same parts', () => {
    const project = createShopWallProject();
    const before = buildJob(project, shop);
    moveCabinet(project, 'cabinet-3', -1);
    expect(ids(project)).toEqual(['cabinet-1', 'cabinet-3', 'cabinet-2']);
    moveCabinet(project, 'cabinet-3', -1);
    moveCabinet(project, 'cabinet-3', -1);
    expect(ids(project)).toEqual(['cabinet-3', 'cabinet-1', 'cabinet-2']);
    moveCabinet(project, 'cabinet-2', 1);
    expect(ids(project)).toEqual(['cabinet-3', 'cabinet-1', 'cabinet-2']);
    const after = buildJob(project, shop);
    expect([...after.cabinetParts, ...after.parts].map((p) => p.id).sort()).toEqual([...before.cabinetParts, ...before.parts].map((p) => p.id).sort());
  });
});
