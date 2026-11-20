import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { buildJob } from '@/job/buildJob';
import { createVanityProject } from '@/samples/vanity';
import { openStore } from '@/storage/db';
import { exportProject, mergeLibrary, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { useAppStore } from '@/stores/app';
import { len } from '@/units';
import { createStarterShopProfile } from '@/libraries';

describe('browser storage', () => {
  it('saves, reopens, lists newest first and deletes projects', async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    const a = createVanityProject();
    const b = { ...createVanityProject(), id: 'second', name: 'Second', updatedAt: '2026-12-01T00:00:00.000Z' };
    await store.saveProject(a);
    await store.saveProject(b);

    const reopened = await openStore(factory);
    expect(await reopened.getProject('vanity')).toEqual(a);
    expect((await reopened.listProjects()).map((p) => p.id)).toEqual(['second', 'vanity']);
    await reopened.deleteProject('second');
    expect((await reopened.listProjects()).map((p) => p.id)).toEqual(['vanity']);
  });

  it('saves and reopens the shop profile', async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    expect(await store.getShopProfile()).toBeUndefined();
    const shop = createStarterShopProfile();
    shop.materialCatalog[0]!.measuredThickness = len('18.6mm');
    await store.saveShopProfile(shop);
    expect(await (await openStore(factory)).getShopProfile()).toEqual(shop);
  });
});

describe('saves of another version (no upgrade steps before 1.0)', () => {
  it('a project of another version is listed as unreadable, to be deleted; the others open', async () => {
    const factory = new IDBFactory();
    const saved = await openStore(factory);
    await saved.saveProject(createVanityProject());
    await saved.saveProject({ ...createVanityProject(), id: 'old', name: 'Old one', schemaVersion: '0.0' });
    setActivePinia(createPinia());
    const store = useAppStore();
    await store.load(factory);
    expect(store.projects.map((p) => p.id)).toEqual(['vanity']);
    expect(store.unreadable).toEqual([{ id: 'old', name: 'Old one', problem: expect.stringMatching(/another version/) }]);
    expect(store.shopReset).toBe('');
    await store.remove('old');
    expect(store.unreadable).toEqual([]);
    expect((await saved.listProjects()).map((p) => p.id)).toEqual(['vanity']);
  });

  it('a shop profile of another version is not read: the shop starts again from the starter one, and says so', async () => {
    const factory = new IDBFactory();
    const saved = await openStore(factory);
    const mine = createStarterShopProfile();
    mine.tools[0]!.settings['mdf']!.feed = 1234;
    await saved.saveShopProfile(mine);
    setActivePinia(createPinia());
    const kept = useAppStore();
    await kept.load(factory);
    expect([kept.shopReset, kept.shop.tools[0]!.settings['mdf']!.feed]).toEqual(['', 1234]);

    // One saved before profiles had this number, as every earlier build's was.
    const old = { ...mine, libraryVersion: 30 } as Partial<typeof mine>;
    delete old.schemaVersion;
    await saved.saveShopProfile(old as typeof mine);
    setActivePinia(createPinia());
    const store = useAppStore();
    await store.load(factory);
    expect(store.shopReset).toMatch(/another version.*starter profile/);
    expect(store.shop).toEqual(createStarterShopProfile());
    expect(await saved.getShopProfile()).toEqual(createStarterShopProfile());
    expect(store.storageError).toBeNull();
  });
});

describe('project file', () => {
  const shop = createStarterShopProfile();
  const project = createVanityProject();

  it('round-trips through text', () => {
    const file = exportProject(project, shop);
    expect(parseProjectFile(serializeProjectFile(file))).toEqual(file);
  });

  it('carries the library entries the project uses', () => {
    const { library } = exportProject(project, shop);
    expect(library.machine.id).toBe('generic-cnc');
    expect(library.tools).toHaveLength(8);
    expect(library.hardware.map((h) => h.id)).toEqual([
      'generic-face-frame-compact-1-2',
      'blum-compact-38n-1-2-soft-screw',
      // Generic entries always go along.
      'generic-frameless-clip-full-overlay',
      'generic-inset-clip',
      'generic-side-mount-ball-bearing',
      'generic-shelf-pin-5mm',
      'generic-knob',
      'generic-pull-96',
      // Milestone 7: the bought laminate tops, generic too.
      'laminate-top-splash',
      'laminate-top-flat',
      // Milestone 9: the casters, generic too.
      'generic-caster-3-brake',
      'generic-caster-3',
      'generic-caster-4-brake',
    ]);
  });

  it('gives the same G-code in a browser with an empty shop profile', () => {
    const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
    const empty = { ...createStarterShopProfile(), machines: [], tools: [], materialCatalog: [], hardware: [] };
    const merged = mergeLibrary(empty, file);
    expect(buildJob(file.project, merged).files).toEqual(buildJob(project, shop).files);
  });

  it('keeps your own library entries when ids match', () => {
    const mine = createStarterShopProfile();
    mine.tools[0]!.settings['mdf']!.feed = 1234;
    const merged = mergeLibrary(mine, exportProject(project, shop));
    expect(merged.tools).toHaveLength(8);
    expect(merged.tools[0]!.settings['mdf']!.feed).toBe(1234);
  });

  it('carries the materials the project was made of, measured for it', () => {
    const p = createVanityProject();
    p.materials[0]!.measuredThickness = len('18.6mm');
    const read = parseProjectFile(serializeProjectFile(exportProject(p, shop)));
    expect(read.project.materials[0]!.measuredThickness.mm).toBe(18.6);
    // The catalog is not the project's: importing changes no catalog entry.
    expect(mergeLibrary(createStarterShopProfile(), read).materialCatalog[0]!.measuredThickness.mm).toBe(19);
  });

  it('refuses a project of another version, plainly', () => {
    const file = exportProject(createVanityProject(), shop);
    file.project.schemaVersion = '0.0';
    expect(() => parseProjectFile(serializeProjectFile(file))).toThrow(/another version of Shop Foreman/);
  });

  it('rejects other files with a clear message', () => {
    expect(() => parseProjectFile('not json')).toThrow(/not valid JSON/);
    expect(() => parseProjectFile('{"format":"other"}')).toThrow(/not a Shop Foreman project/);
    expect(() => parseProjectFile('{"format":"shop-foreman-project","schemaVersion":2}')).toThrow(/version 2/);
  });
});

describe('project pictures for the Projects page', () => {
  const settle = () => new Promise((r) => setTimeout(r, 450));

  it('keeps a picture of the open project beside the projects, brings it back, and drops it with the project', async () => {
    const factory = new IDBFactory();
    setActivePinia(createPinia());
    const store = useAppStore();
    await store.load(factory);
    const first = store.addProject(createVanityProject());
    await nextTick();
    // Made and left for another before its first save: it is saved all the same.
    const second = store.addProject({ ...createVanityProject(), name: 'Second' });
    await nextTick();
    expect(store.thumbnails).toEqual({});
    store.setThumbnail('data:image/webp;base64,second');
    store.open(first.id);
    await nextTick();
    store.setThumbnail('data:image/webp;base64,first');
    expect(store.thumbnails).toEqual({ [first.id]: 'data:image/webp;base64,first', [second.id]: 'data:image/webp;base64,second' });
    await settle();
    // Not in the project, nor in its file.
    expect(JSON.stringify(store.projects)).not.toContain('base64');

    setActivePinia(createPinia());
    const again = useAppStore();
    await again.load(factory);
    expect(Object.keys(again.thumbnails).sort()).toEqual([first.id, second.id].sort());
    await again.remove(second.id);
    expect(again.thumbnails).toEqual({ [first.id]: 'data:image/webp;base64,first' });
    expect(await (await openStore(factory)).getThumbnails()).toEqual({ [first.id]: 'data:image/webp;base64,first' });
  });
});
