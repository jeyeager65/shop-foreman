import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import {
  MACHINE_FIELDS,
  MACHINE_GROUPS,
  GENERIC_CNC,
  ROUTERS,
  addRouterMark,
  removeRouterMark,
  routerDial,
  routerPresetId,
  setRouterName,
  setRouterPreset,
  setRouterSpeed,
  copyMachine,
  createStarterShopProfile,
  machineFieldTune,
  machineValue,
  newBit,
  removeMachine,
  setBitSetting,
  setMachineTiling,
  setMachineValue,
  useMachine,
  projectMachineGone,
  projectMachineId,
  toolsOnMachine,
} from '@/libraries';
import { shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import type { MachineProfile } from '@/model';
import { addTallCabinet, createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject, mergeLibrary, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { useAppStore } from '@/stores/app';
import { len } from '@/units';
import { LOWRIDER_3, lowRiderShop, useLowRider } from './lowRider';

/** The starter shop as two LowRiders, the LowRider 3 in use: what most of these tests switch between. */
const lowRiders = () => {
  const shop = lowRiderShop();
  shop.machines = shop.machines.filter((m) => m.id !== GENERIC_CNC.id);
  return shop;
};

describe('the generic CNC that comes with the app', () => {
  it('is the one machine the shop starts with: a full sheet of MDF whole, no tiling, the Makita', () => {
    const shop = createStarterShopProfile();
    expect([shop.machines.map((m) => m.name), shop.activeMachineId]).toEqual([['Generic CNC'], 'generic-cnc']);
    const generic = shop.machines[0]!;
    const inches = (l: { mm: number }) => Math.round((l.mm / 25.4) * 1000) / 1000;
    expect([generic.cuttingArea.x, generic.cuttingArea.y, generic.defaultSheet.x, generic.defaultSheet.y].map(inches)).toEqual([49, 97, 48, 96]);
    expect([generic.tiling, 'tiling' in generic, generic.router?.name, generic.feeds]).toEqual([undefined, false, 'Makita RT0701C', undefined]);
  });
});

const field = (path: string) => MACHINE_FIELDS.find((f) => f.path === path)!;

describe('a machine\'s values, typed on the Shop profile', () => {
  it('has a field for every number and length of a machine, each in a group', () => {
    const machine = lowRiders().machines[0]!;
    for (const f of MACHINE_FIELDS) {
      const value = machineValue(machine, f);
      expect(f.unit === 'length' ? typeof (value as { mm: number }).mm : typeof value, f.path).toBe('number');
      expect(MACHINE_GROUPS.some((g) => g.id === f.group), f.path).toBe(true);
    }
    // Every placeholder of the starter machine can be typed over
    const typed = new Set([...MACHINE_FIELDS.map((f) => f.tune), 'tiling']);
    expect(machine.tuneMe.filter((k) => !typed.has(k))).toEqual([]);
  });

  it('takes a number or a length, and takes the "tune me" mark off', () => {
    const machine = lowRiders().machines[0]!;
    expect(machineFieldTune(machine, field('safeHeight'))).toBe(true);
    expect(setMachineValue(machine, field('safeHeight'), 8)).toBe(true);
    expect([machine.safeHeight, machineFieldTune(machine, field('safeHeight'))]).toEqual([8, false]);
    expect(setMachineValue(machine, field('cuttingArea.x'), len('48"'))).toBe(true);
    expect(machine.cuttingArea.x.mm).toBeCloseTo(1219.2, 6);
    expect(setMachineValue(machine, field('probe.fastFeed'), 240)).toBe(true);
    expect([machine.probe.fastFeed, machine.tuneMe.includes('probe.fastFeed'), machine.tuneMe.includes('probe.slowFeed')]).toEqual([240, false, true]);
  });

  it('refuses what cannot be: nothing, a negative, a number for a length', () => {
    const machine = lowRiders().machines[0]!;
    expect(setMachineValue(machine, field('safeHeight'), 0)).toBe(false);
    expect(setMachineValue(machine, field('safeHeight'), -1)).toBe(false);
    expect(setMachineValue(machine, field('safeHeight'), Number.NaN)).toBe(false);
    expect(setMachineValue(machine, field('cuttingArea.x'), 900)).toBe(false);
    expect(setMachineValue(machine, field('safeHeight'), len('1/4"'))).toBe(false);
    expect(machine.safeHeight).toBe(5);
    // A second touch of 0 turns it off
    expect(setMachineValue(machine, field('probe.slowFeed'), 0)).toBe(true);
  });

  it('turns tiling on and off', () => {
    const machine = lowRiders().machines[0]!;
    setMachineTiling(machine, null);
    expect([machine.tiling, machine.tuneMe.includes('tiling')]).toEqual([undefined, false]);
    setMachineTiling(machine, len('120"'));
    expect(machine.tiling!.maxLength.mm).toBeCloseTo(3048, 6);
  });
});

describe('several machines, each with its own feeds', () => {
  const start = () => {
    const shop = lowRiders();
    // A shop with the one machine: the LowRider 4 that comes with the app has its own test below.
    shop.machines = shop.machines.filter((m) => m.id === 'lowrider-3');
    const copy = copyMachine(shop, shop.activeMachineId)!;
    return { shop, first: shop.machines[0]!, copy };
  };
  const feed = (shop: { tools: { id: string; settings: Record<string, { feed: number }> }[] }, id = 'endmill-1-4') => shop.tools.find((t) => t.id === id)!.settings.mdf!.feed;

  it('copies a machine: its values, and its feeds for every bit; the first stays in use', () => {
    const { shop, first, copy } = start();
    expect(shop.machines.map((m) => [m.id, m.name])).toEqual([
      ['lowrider-3', 'LowRider 3'],
      ['machine-own-1', 'LowRider 3 (copy)'],
    ]);
    expect(shop.activeMachineId).toBe('lowrider-3');
    const { id: _id, name: _name, feeds, ...rest } = copy;
    const { id: _i, name: _n, ...same } = first;
    expect(rest).toEqual(same);
    expect(first.feeds).toBeUndefined();
    expect(Object.keys(feeds!)).toEqual(shop.tools.map((t) => t.id));
    expect(feeds!['endmill-1-4']).toEqual({ settings: shop.tools[0]!.settings, tuneMe: true });
    // A copy of a copy gets its own id
    expect(copyMachine(shop, copy.id)!.id).toBe('machine-own-2');
  });

  it('keeps each machine\'s feeds apart: what is typed on one is not on the other', () => {
    const { shop, first, copy } = start();
    expect(useMachine(shop, copy.id)).toBe(true);
    expect(shop.activeMachineId).toBe(copy.id);
    expect([copy.feeds, Object.keys(first.feeds!).length]).toEqual([undefined, shop.tools.length]);
    const quarter = shop.tools.find((t) => t.id === 'endmill-1-4')!;
    setBitSetting(quarter, 'mdf', 'feed', 3600);
    expect([feed(shop), quarter.tuneMe.includes('settings')]).toEqual([3600, false]);
    // Back on the first machine: its own feed, still a placeholder there
    expect(useMachine(shop, first.id)).toBe(true);
    expect([feed(shop), quarter.tuneMe.includes('settings')]).toEqual([2400, true]);
    expect(copy.feeds!['endmill-1-4']).toMatchObject({ tuneMe: false });
    expect(useMachine(shop, copy.id)).toBe(true);
    expect([feed(shop), quarter.tuneMe.includes('settings')]).toEqual([3600, false]);
  });

  it('a bit added since a machine was last in use starts there on the feeds it had, to be tuned', () => {
    const { shop, copy } = start();
    const added = newBit('endMill', shop.tools);
    added.settings.mdf!.feed = 1800;
    added.tuneMe = added.tuneMe.filter((k) => k !== 'settings');
    shop.tools.push(added);
    useMachine(shop, copy.id);
    expect([feed(shop, added.id), added.tuneMe.includes('settings')]).toEqual([1800, true]);
  });

  it('does nothing for the machine in use or one that is not there', () => {
    const { shop } = start();
    expect(useMachine(shop, 'lowrider-3')).toBe(false);
    expect(useMachine(shop, 'nope')).toBe(false);
    expect(copyMachine(shop, 'nope')).toBeUndefined();
  });

  it('removes a machine, but not the last; removing the one in use puts another in use with its feeds', () => {
    const { shop, first, copy } = start();
    useMachine(shop, copy.id);
    setBitSetting(shop.tools[0]!, 'mdf', 'feed', 3600);
    expect(removeMachine(shop, copy.id)).toBe(true);
    expect([shop.machines.map((m: MachineProfile) => m.id), shop.activeMachineId, feed(shop), first.feeds]).toEqual([['lowrider-3'], 'lowrider-3', 2400, undefined]);
    expect(removeMachine(shop, 'lowrider-3')).toBe(false);
    expect(shop.machines).toHaveLength(1);
  });
});

describe('a machine\'s router: its own name and dial speeds, started from a preset', () => {
  const start = () => lowRiders().machines[0]!;

  it('starts as a preset, and stops being one when its name or a speed is typed over', () => {
    const machine = start();
    expect(routerPresetId(machine.router)).toBe('kobalt-k7tr-03');
    expect(setRouterName(machine, '  My Kobalt ')).toBe(true);
    expect([machine.router!.name, machine.router!.id, machine.router!.source, routerPresetId(machine.router)]).toEqual(['My Kobalt', 'router-own', undefined, undefined]);
    expect(setRouterName(machine, ' ')).toBe(false);
    expect(machine.router!.name).toBe('My Kobalt');
  });

  it('takes a preset\'s name and speeds, as a copy', () => {
    const machine = start();
    setRouterName(machine, 'Mine');
    expect(setRouterPreset(machine, 'makita-rt0701c')).toBe(true);
    expect([machine.router!.name, routerPresetId(machine.router)]).toEqual(['Makita RT0701C', 'makita-rt0701c']);
    setRouterSpeed(machine, 1, 12500);
    expect(ROUTERS.find((r) => r.id === 'makita-rt0701c')!.speeds[1]!.rpm).toBe(12000);
    expect(setRouterPreset(machine, 'nope')).toBe(false);
  });

  it('takes a dial speed between the marks beside it, and the dial in the messages follows', () => {
    const machine = start();
    expect(routerDial(machine.router!, 14000)).toBe(2);
    expect(setRouterSpeed(machine, 1, 16000)).toBe(true);
    expect([machine.router!.speeds[1], routerPresetId(machine.router)]).toEqual([{ dial: 2, rpm: 16000 }, undefined]);
    expect(routerDial(machine.router!, 14000)).toBe(1.5);
    // Not above the mark after it, not below the one before, not nothing
    expect([18000, 10000, 0, Number.NaN].map((rpm) => setRouterSpeed(machine, 1, rpm))).toEqual([false, false, false, false]);
    expect(setRouterSpeed(machine, 9, 20000)).toBe(false);
    // The ends are open on their far side
    expect([setRouterSpeed(machine, 0, 8000), setRouterSpeed(machine, 5, 40000)]).toEqual([true, true]);
  });

  it('adds a mark at the top and takes it off again; two marks stay', () => {
    const machine = start();
    addRouterMark(machine);
    expect(machine.router!.speeds.at(-1)).toEqual({ dial: 7, rpm: 44000 });
    expect(removeRouterMark(machine)).toBe(true);
    while (removeRouterMark(machine));
    expect(machine.router!.speeds).toEqual([
      { dial: 1, rpm: 10000 },
      { dial: 2, rpm: 14000 },
    ]);
  });

  it('gives a machine with no router one to change', () => {
    const machine = start();
    delete machine.router;
    expect(setRouterSpeed(machine, 0, 9000)).toBe(true);
    expect(machine.router!.speeds[0]).toEqual({ dial: 1, rpm: 9000 });
  });
});

describe("a second machine that takes a full sheet (the tests' LowRider 4)", () => {
  it('is a second starter machine: a full sheet, no tiling, the Makita, 110 mm of probe travel; the LowRider 3 stays in use', () => {
    const shop = lowRiders();
    expect([shop.machines.map((m) => m.name), shop.activeMachineId]).toEqual([['LowRider 3', 'LowRider 4'], 'lowrider-3']);
    const lr4 = shop.machines[1]!;
    const inches = (l: { mm: number }) => Math.round((l.mm / 25.4) * 1000) / 1000;
    expect([lr4.cuttingArea.x, lr4.cuttingArea.y, lr4.defaultSheet.x, lr4.defaultSheet.y].map(inches)).toEqual([48, 96, 48, 96]);
    expect([lr4.tiling, 'tiling' in lr4, lr4.router?.name, lr4.probe.maxTravel]).toEqual([undefined, false, 'Makita RT0701C', 110]);
    // The rest is the LowRider 3's, still to be tuned.
    const { id: _a, name: _b, cuttingArea: _c, defaultSheet: _d, router: _e, probe, tuneMe, feeds: _f, ...rest } = lr4;
    const { id: _g, name: _h, cuttingArea: _i, defaultSheet: _j, router: _k, probe: probe3, tuneMe: tune3, tiling: _l, ...rest3 } = LOWRIDER_3;
    expect(rest).toEqual(rest3);
    expect(probe).toEqual({ ...probe3, maxTravel: 110 });
    expect(tuneMe).toEqual(tune3.filter((k) => k !== 'tiling'));
    expect(LOWRIDER_3.tiling).toBeDefined();
  });

  it('starts on a copy of the starter feeds, marked tune me, and takes them when it is put in use', () => {
    const shop = lowRiders();
    const lr4 = shop.machines[1]!;
    expect(Object.keys(lr4.feeds!)).toEqual(shop.tools.map((t) => t.id));
    expect(lr4.feeds!['endmill-1-4']).toEqual({ settings: shop.tools[0]!.settings, tuneMe: true });
    expect(lr4.feeds!['endmill-1-4']!.settings).not.toBe(shop.tools[0]!.settings);
    setBitSetting(shop.tools[0]!, 'mdf', 'feed', 3600);
    expect(useMachine(shop, 'lowrider-4')).toBe(true);
    expect([shop.activeMachineId, shop.tools[0]!.settings.mdf!.feed, shop.tools[0]!.tuneMe.includes('settings')]).toEqual(['lowrider-4', 2400, true]);
    expect(shop.machines[0]!.feeds!['endmill-1-4']!.settings.mdf!.feed).toBe(3600);
  });

  it('a full sheet is cut on it in one set-up where the LowRider 3 tiles it', () => {
    const blanks = (machineId: string) => {
      const shop = lowRiders();
      useMachine(shop, machineId);
      const project = createBaseCabinetProject('frameless');
      addTallCabinet(project, { name: 'Tall' });
      for (const m of project.materials) m.sheets = [{ x: len('48"'), y: len('96"') }];
      return buildJob(project, shop).plan.blanks;
    };
    const tiled = (id: string) => blanks(id).some((b) => b.setups.some((s) => s.tile));
    expect([tiled('lowrider-3'), tiled('lowrider-4')]).toEqual([true, false]);
  });
});

describe('the machine is the project\'s', () => {
  const tall = () => {
    const project = createBaseCabinetProject('frameless');
    addTallCabinet(project, { name: 'Tall' });
    for (const m of project.materials) m.sheets = [{ x: len('48"'), y: len('96"') }];
    return project;
  };
  const files = (project: ReturnType<typeof tall>, shop: ReturnType<typeof createStarterShopProfile>) => buildJob(project, shop).files.map((f) => f.text).join('\n');

  it('a project is planned on the machine it names, whichever the shop has in use; one that names none follows the shop', () => {
    const shop = lowRiders();
    const project = tall();
    expect([projectMachineId(project, shop), shopFor(project, shop).activeMachineId]).toEqual(['lowrider-3', 'lowrider-3']);
    const onThree = files(project, shop);
    project.machineId = 'lowrider-4';
    expect(shopFor(project, shop).activeMachineId).toBe('lowrider-4');
    const onFour = files(project, shop);
    expect(onFour).not.toBe(onThree);
    // The LowRider 4: a full sheet in one set-up, its Makita's dial in the messages, its probe's travel.
    expect(buildJob(project, shop).plan.blanks.some((b) => b.setups.some((s) => s.tile))).toBe(false);
    expect(onFour).toContain('G38.2 Z-110');
    expect(onThree).toContain('G38.2 Z-80');
    // Putting another machine in use in the shop does not replan it.
    expect(useMachine(shop, 'lowrider-4')).toBe(true);
    expect(files(project, shop)).toBe(onFour);
    project.machineId = 'lowrider-3';
    expect(files(project, shop)).toBe(onThree);
    // Nothing in the shop was changed by planning.
    expect(shop.activeMachineId).toBe('lowrider-4');
  });

  it('the feeds follow the project\'s machine', () => {
    const shop = lowRiders();
    const project = tall();
    project.machineId = 'lowrider-4';
    const before = files(project, shop);
    // The bits carry the LowRider 3's feeds (it is in use): changing one changes nothing for this project.
    setBitSetting(shop.tools[0]!, 'plywood', 'feed', 3000);
    expect(files(project, shop)).toBe(before);
    // The LowRider 4's own feeds do.
    shop.machines[1]!.feeds!['endmill-1-4']!.settings.plywood!.feed = 1200;
    const after = files(project, shop);
    expect(after).not.toBe(before);
    expect(after).toContain('F1200');
    const onFour = toolsOnMachine(shop, 'lowrider-4');
    expect([onFour[0]!.settings.plywood!.feed, onFour[0]!.tuneMe.includes('settings'), shop.tools[0]!.settings.plywood!.feed]).toEqual([1200, true, 3000]);
    expect(toolsOnMachine(shop, 'lowrider-3')).toBe(shop.tools);
    // A bit added since has no feeds on the other machine: it cuts there on the feeds it has, to be tuned.
    const added = newBit('endMill', shop.tools);
    shop.tools.push(added);
    expect(toolsOnMachine(shop, 'lowrider-4').at(-1)).toMatchObject({ id: added.id, settings: added.settings });
  });

  it('a project whose machine is gone falls back to the shop\'s machine in use, and says so', () => {
    const shop = lowRiders();
    const project = tall();
    project.machineId = 'lowrider-4';
    expect(projectMachineGone(project, shop)).toBe(false);
    expect(removeMachine(shop, 'lowrider-4')).toBe(true);
    expect([projectMachineGone(project, shop), projectMachineId(project, shop)]).toEqual([true, 'lowrider-3']);
    const fellBack = files(project, shop);
    delete project.machineId;
    expect([projectMachineGone(project, shop), files(project, shop)]).toEqual([false, fellBack]);
  });

  it('a project file carries the project\'s machine and its feeds, and gives the same G-code in an empty shop', () => {
    const shop = lowRiders();
    const project = tall();
    project.machineId = 'lowrider-4';
    shop.machines[1]!.feeds!['endmill-1-4']!.settings.plywood!.feed = 1200;
    const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
    expect([file.library.machine.id, file.library.machine.feeds, file.library.tools[0]!.settings.plywood!.feed]).toEqual(['lowrider-4', undefined, 1200]);
    const empty = { ...lowRiders(), machines: [], tools: [], hardware: [] };
    expect(files(file.project, mergeLibrary(empty, file))).toBe(files(project, shop));
    // In a shop that has the bits but not the machine, the machine arrives with the file's feeds; the bits keep theirs.
    const mine = lowRiders();
    mine.machines = mine.machines.filter((m) => m.id === 'lowrider-3');
    const merged = mergeLibrary(mine, file);
    expect(merged.machines.map((m) => m.id)).toEqual(['lowrider-3', 'lowrider-4']);
    expect([merged.tools[0]!.settings.plywood!.feed, merged.machines[1]!.feeds!['endmill-1-4']!.settings.plywood!.feed]).toEqual([2400, 1200]);
    expect(files(file.project, merged)).toBe(files(project, shop));
  });

  it('a new project takes the shop\'s machine in use and keeps it; Setup has the picker', async () => {
    setActivePinia(createPinia());
    const store = useAppStore();
    await store.load(new IDBFactory());
    useLowRider(store.shop);
    removeMachine(store.shop, GENERIC_CNC.id);
    const first = store.addProject(createBaseCabinetProject('frameless'));
    expect([first.machineId, store.machine?.id, store.machineGone]).toEqual(['lowrider-3', 'lowrider-3', false]);
    useMachine(store.shop, 'lowrider-4');
    expect(store.machine?.id).toBe('lowrider-3');
    const second = store.newCabinetProject('frameless');
    expect([second.machineId, store.machine?.id]).toEqual(['lowrider-4', 'lowrider-4']);
    store.project!.machineId = 'lowrider-3';
    expect([store.machine?.name, store.jobShop.activeMachineId]).toEqual(['LowRider 3', 'lowrider-3']);
    removeMachine(store.shop, 'lowrider-3');
    expect([store.machineGone, store.machine?.id]).toEqual([true, 'lowrider-4']);
  });
});
