import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { createAppRouter } from '@/router';
import { createDoorRacks, createObstacle } from '@/design';
import { addBatch } from '@/job/batch';
import { addWallCabinet, makeExisting, setExistingOpenings } from '@/samples/cabinet';
import type { CasesContext } from '@/model';
import { EXISTING_PRESET_ID, builtInPresets } from '@/samples/presets';
import { len } from '@/units';
import { useAppStore } from '@/stores/app';

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

/**
 * Milestone 5's walk-through: a new project from each built-in preset, through Setup,
 * Design, Plan, Cut and Build, every screen rendering its job without errors.
 */
describe('a new project from each preset, step by step', () => {
  it('walks Setup, Design, Plan, Cut and Build', async () => {
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    app.config.errorHandler = (e) => errors.push(e);
    app.config.warnHandler = (msg) => errors.push(msg);
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    const go = async (path: string) => {
      await router.push(path);
      await settle();
      return host.textContent ?? '';
    };

    const expected: Record<string, string> = {
      'Frameless, shaker': 'Frameless, 3/4" Plywood, shaker doors, toe kick',
      'Face frame, shaker': 'Face frame, 3/4" Plywood, shaker doors, toe kick',
      'Shop cabinets: inset slab': 'Inset, 3/4" Plywood, slab doors, flat bottom',
      'Cabinets already there: new shaker doors': 'Cabinets already there, shaker doors, 3/4" MDF',
      'Furniture: face frame, plywood, stained': 'Face frame, 3/4" Plywood, slab doors, toe kick',
      'Furniture: face frame, solid wood, stained': 'Face frame, 3/4" Solid wood, slab doors, toe kick',
      'Furniture: inset, plywood with solid wood edges, stained': 'Inset, 3/4" Plywood, slab doors, generic knob, toe kick',
    };
    for (const preset of builtInPresets()) {
      await go('/');
      store.newProjectFrom(preset);
      const line = expected[preset.name]!;
      expect(await go('/setup')).toContain(line);
      expect(await go('/design')).toContain(`Setup: ${line}`);
      expect(await go('/plan')).toContain('Methods and bits');
      const cut = await go('/cut');
      expect(cut).toContain('Cutting checklist');
      expect(cut).toMatch(/\.gcode/);
      await go('/plan');
      const build = await go('/build');
      expect(build).toContain('Build checklist');
      await go('/plan');
      expect(await go('/build?lists=1')).toContain('To buy');
      expect(store.job.error).toBeUndefined();
    }
    expect(store.projects).toHaveLength(7);
    expect(errors).toEqual([]);
    app.unmount();
  }, 60000);
});

/**
 * The organizers' walk-through: a cabinet that is already there, measured, fitted
 * out with trays and door racks, cut as a batch, through Measure, Design, Plan, Cut, Build and the jigs page.
 */
describe('a cabinet that is already there, measured and fitted out', () => {
  it('walks Measure, Design, Plan with a batch, Cut, Build and the inserts on the jigs page', async () => {
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    app.config.errorHandler = (e) => errors.push(e);
    app.config.warnHandler = (msg) => errors.push(msg);
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    const go = async (path: string) => {
      await router.push(path);
      await settle();
      return host.textContent ?? '';
    };

    await go('/');
    store.newProjectFrom(builtInPresets().find((p) => p.id === EXISTING_PRESET_ID)!);
    expect(await go('/setup')).toContain('The cabinet is already there');

    // Only its door opening is measured: Measure asks that, and offers the rest.
    const measure = await go('/measure');
    expect(measure).toContain('Door opening, width');
    expect(measure).toContain('Measure the inside, to fit it out with trays and shelves');
    expect(measure).not.toContain('Inside width, at the front');

    // Its inside measured, what is in the way, two trays and racks on the doors.
    const stored = (store.project!.context as CasesContext).pieces[0]!;
    stored.existing!.opening = { width: len('27"'), height: len('22"') };
    stored.existing!.inside = { widthFront: len('28-1/2"'), widthBack: len('28-3/8"'), depth: len('21"'), height: len('24"') };
    stored.inside = {
      obstacles: [createObstacle('trap')],
      organizers: [
        { id: 'tray-bottom', kind: 'tray' },
        { id: 'tray-upper', kind: 'tray', up: len('10"') },
      ],
      doorRacks: createDoorRacks(),
    };
    expect(await go('/measure')).toContain('Inside width, at the back');
    const design = await go('/design?fold=openings');
    expect(design).toContain('Fitted out inside');
    expect(design).toContain('Upper tray');
    expect(design).toContain('cut round the trap');
    expect(design).toContain('Through the door opening, round what is in the way');
    expect(design).toContain('Each door carries a rack');
    expect(design).toContain('Print the paper templates');

    // Plan: everything, then only what goes inside as a batch of its own.
    expect(await go('/plan')).toContain('What this job makes');
    Object.assign(addBatch(store.project!, 'Inside'), { kinds: ['inside'] });
    const plan = await go('/plan');
    expect(plan).toContain('what goes inside a cabinet');
    expect(store.job.error).toBeUndefined();
    expect(store.job.job!.parts).toEqual([]);
    expect(store.job.job!.cabinetParts.every((part) => part.id.includes('/sink-'))).toBe(true);

    const cut = await go('/cut');
    expect(cut).toContain('Batch: Inside');
    expect(cut).toMatch(/doors-inside.*\.gcode/);
    expect(cut).toContain('Mark this job as cut');
    await go('/plan');
    const build = await go('/build');
    expect(build).toContain('Build checklist');
    expect(build).toContain('Through the door opening.');
    expect(build).toContain('The door racks: glue and brad each one');

    // With no project's sizes: the inserts for a drawer that is already there.
    expect(await go('/jigs?item=drawer-dividers')).toContain('Drawer dividers');
    expect(await go('/jigs?item=tray-bins')).toContain('Printed bins for a tray');

    expect(store.job.error).toBeUndefined();
    expect(errors).toEqual([]);
    app.unmount();
  }, 30000);

  it('refaces a base cabinet with a drawer and a wall cabinet: new doors and a new drawer front, nothing else', async () => {
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    app.config.errorHandler = (e) => errors.push(e);
    app.config.warnHandler = (msg) => errors.push(msg);
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    const go = async (path: string) => {
      await router.push(path);
      await settle();
      return host.textContent ?? '';
    };

    await go('/');
    store.newProjectFrom(builtInPresets().find((p) => p.id === EXISTING_PRESET_ID)!);
    const project = store.project!;
    const base = (project.context as CasesContext).pieces[0]!;
    // A drawer over its doors, its front new as the doors are; and the wall cabinet over it, with new doors.
    setExistingOpenings(project, base.id, 1);
    base.existing!.drawers![0] = { height: len('5"'), rail: len('1-1/2"'), fronts: 'new' };
    const wall = addWallCabinet(project, { name: 'Wall cabinet' });
    makeExisting(project, wall.id, 'new');

    const measure = await go('/measure?cabinet=1');
    expect(measure).toContain('Drawer opening 1, height');
    expect(measure).toContain('The rail under drawer opening 1');
    const measureWall = await go('/measure?cabinet=2');
    expect(measureWall).toContain('Door opening, width');
    expect(measureWall).not.toContain('Drawer openings over its lowest opening');

    const design = await go('/design?cabinet=1&fold=cabinet');
    expect(design).toContain('Drawer openings over it');
    expect(design).toContain('Only this front is made');
    expect(await go('/design?cabinet=2')).toContain('Already there');

    await go('/plan');
    expect(store.job.error).toBeUndefined();
    // Two pairs of doors and one drawer front; nothing of a case, a box or a slide.
    expect(store.job.job!.parts.length).toBe(5);
    expect(store.job.job!.cabinetParts).toEqual([]);
    await go('/cut');
    const build = await go('/build');
    expect(build).toContain('The new drawer fronts: take each old front off its box');
    expect(build).not.toContain('Hang the cabinet');
    // The lists are a state of the screen read as it opens: come to it from another screen.
    await go('/plan');
    const lists = await go('/build?lists=1');
    expect(lists).toContain('the new front to the drawer box that is there');
    expect(lists).not.toMatch(/hanging rail|French cleat/);

    expect(store.job.error).toBeUndefined();
    expect(errors).toEqual([]);
    app.unmount();
  }, 30000);
});
