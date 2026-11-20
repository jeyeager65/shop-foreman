import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { cabinetsOf } from '@/design';
import { projectLayoutWarnings } from '@/design/scene';
import { removeMachine } from '@/libraries';
import { cuttingAreaOf } from '@/plan';
import { createBaseCabinetProject, createKitchenProject, createShopCabinetProject } from '@/samples/cabinet';
import { useAppStore } from '@/stores/app';
import { len } from '@/units';
import { lowRiderShop, useLowRider } from './lowRider';

/** The header's dots: a step with something to look at. */
describe('step warnings', () => {
  const open = async (project = createShopCabinetProject()) => {
    setActivePinia(createPinia());
    const store = useAppStore();
    await store.load(new IDBFactory());
    // The LowRider 3: a machine small enough for a tall side to be too long for it.
    useLowRider(store.shop);
    store.addProject(project);
    await nextTick();
    return store;
  };

  it('a plain cabinet has none: a bit not yet measured is the shop\'s to do, not the project\'s', async () => {
    const store = await open();
    expect(store.job.job?.plan.warnings.some((w) => w.code === 'cuttingLengthUnknown')).toBe(true);
    expect(store.stepWarnings).toEqual({});
  });

  it('Plan is marked for a plan warning: the waste round the parts made tighter to fit the stock', async () => {
    const store = await open(createBaseCabinetProject('frameless'));
    expect(Object.keys(store.stepWarnings)).toEqual(['plan']);
    expect(store.stepWarnings.plan).toMatch(/things to check\. First: .*Hold the blank down carefully/);
  });

  it('Setup is marked when the project\'s machine is gone', async () => {
    const store = await open();
    store.project!.machineId = 'lowrider-4';
    removeMachine(store.shop, 'lowrider-4');
    expect(Object.keys(store.stepWarnings)).toEqual(['setup']);
    expect(store.stepWarnings.setup).toMatch(/no longer in the shop/);
  });

  it('Design is marked for where the cabinets stand: a run past its wall\'s end, a cabinet past the ceiling', async () => {
    const kitchen = createKitchenProject();
    const shop = lowRiderShop();
    expect(projectLayoutWarnings(kitchen, kitchen.materials, shop.hardware)).toEqual([]);
    const store = await open(kitchen);
    expect(store.stepWarnings.design).toBeUndefined();
    // The room made too short for the run along its back wall, and its ceiling too low for the wall cabinets.
    if (store.project!.context.kind === 'designedCabinet') {
      store.project!.context.room!.length = len('60"');
      store.project!.context.room!.ceiling = len('60"');
    }
    const words = projectLayoutWarnings(store.project!, store.materials, store.shop.hardware);
    expect(words.length).toBeGreaterThan(0);
    expect(store.stepWarnings.design).toMatch(/things to check\. First: /);
    expect(store.stepWarnings.design).toContain(words[0]!);
  });

  it('a part bigger than the sheet marks nothing, and the CNC is given nothing bigger than it cuts', async () => {
    const store = await open();
    const tall = cabinetsOf(store.project!)[0]!;
    tall.size.height = len('100"');
    await nextTick();
    if (store.job.error) {
      expect(store.stepWarnings.design).toMatch(/cannot be built/);
      return;
    }
    const plan = store.job.job!.plan;
    // Nothing is said of the sheet...
    expect(plan.warnings.filter((w) => w.code === 'stockTooSmall' && /your stock/.test(w.message))).toEqual([]);
    // ...and a blank the CNC cuts is within its cutting area, or its tiled length; what is bigger went to the saw or says so.
    const area = cuttingAreaOf(store.machine!);
    const flagged = plan.warnings.some((w) => w.code === 'outsideCuttingArea' || w.code === 'stockTooSmall' || w.code === 'blankTooSmall');
    // Tiling is along Y only: across X a blank is never wider than the cutting area, tiled or not.
    let tiled = 0;
    for (const blank of plan.blanks) {
      const { width, height } = blank.size;
      const oneSetup = width <= area.width + 1 && height <= area.height + 1;
      const inTwo = width <= area.width + 1 && height <= (area.tileLength ?? 0) + 1;
      if (!oneSetup && inTwo) tiled += 1;
      expect(oneSetup || inTwo || flagged, `${blank.label}: ${Math.round(width)} across X, ${Math.round(height)} along Y (mm)`).toBe(true);
    }
    // The 100" sides are longer than the 96" the machine tiles: they went to the saw, not to the CNC.
    const sides = plan.parts.filter((p) => /^[^/]+\/side-(left|right)$/.test(p.partId));
    expect(sides.length).toBeGreaterThan(0);
    expect(sides.every((p) => p.cutOut !== 'cnc')).toBe(true);
    // Its doors, 92" long and narrow, are tiled: along Y, in two set-ups.
    expect(tiled).toBeGreaterThan(0);
  });
});
