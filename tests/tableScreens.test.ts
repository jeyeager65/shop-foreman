import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { deriveFrameParts, frameTop, framesOf } from '@/design';
import type { DesignedCabinetContext } from '@/model';
import { createAppRouter } from '@/router';
import { FACE_FRAME_PRESET_ID } from '@/samples/presets';
import { presetsOf } from '@/samples/presets';
import { starterById } from '@/samples/starters';
import { useAppStore } from '@/stores/app';

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

/** Furniture: a project that is one table, with no cabinet in it, on every screen. */
describe('a table on every screen', () => {
  it('walks Setup, Design, Plan, Cut and Build with nothing going wrong', async () => {
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
    const preset = presetsOf(store.shop).find((p) => p.id === FACE_FRAME_PRESET_ID)!;
    store.newProjectFrom(preset, starterById('endtable'));
    expect(store.project!.name).toBe('End table');
    expect(framesOf(store.project!).map((f) => f.name)).toEqual(['End table']);

    // Projects names it; Setup has its style, and its top's material under Tops (a furniture project's word for Countertops).
    // It also asks what a new table's top starts with there, and its legs under Tables.
    expect(await go('/')).toContain('End table');
    expect(await go('/setup')).toContain('Face frame');
    await go('/setup?topic=tops');
    expect(host.querySelector('[data-test="setup-topic-words"]')!.textContent).toContain("How a table's top is made");
    await go('/setup?topic=furniture');
    expect(host.querySelector('[data-test="setup-topic-words"]')!.textContent).toContain("What a new table's legs are cut from");
    expect(host.querySelector('[data-test="setup-new-legs"]')).not.toBeNull();

    // Design: the table's own fields, and its parts.
    const design = await go('/design');
    expect(design).toContain('End table');
    expect(host.querySelector('[data-test="frame-width"]')).not.toBeNull();
    expect(host.querySelector('[data-test="frame-legs"]')).not.toBeNull();
    expect(design).toContain('13 parts');
    // A size typed changes the table.
    framesOf(store.project!)[0]!.size.width = { mm: 30 * 25.4, unit: 'in' };
    await settle();
    expect(host.textContent).toContain('30" long');

    // Plan, Cut and Build: a table with a glued-on edge has nothing for the CNC, and they say so.
    expect(await go('/plan')).toContain('Leg, front left');
    const cut = await go('/cut');
    expect(cut).toContain('Nothing here is cut on the CNC');
    // (A page reads its tab from the address when it opens: leave it and come back.)
    await go('/plan');
    expect(await go('/cut?lists=1')).toContain('Cut to length');
    const build = await go('/build');
    expect(build).toContain('pocket screws');
    await go('/plan');
    const lists = await go('/build?lists=1');
    expect(lists).toContain('Square stock');
    expect(lists).toContain('Figure-8');
    expect(errors).toEqual([]);
    app.unmount();
  });
  it("a table's top is made as Setup's tops are: the assembly table's torsion box is Setup's, and Setup changes it", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    const preset = presetsOf(store.shop).find((p) => p.id === 'builtin-furniture-plywood')!;
    store.newProjectFrom(preset, starterById('assemblytable'));
    const context = store.project!.context as DesignedCabinetContext;
    const table = framesOf(store.project!)[0]!;
    // The starter sets Setup's tops to the bench top's box and leaves the table following them.
    expect([context.tops?.kind, table.top.torsion, table.top.slab]).toEqual(['torsion', undefined, undefined]);
    expect(frameTop(table, context).torsion).toEqual(context.tops!.torsion);
    const parts = () => deriveFrameParts(table, context, store.materials).map((x) => x.name);
    expect(parts().some((n) => /rib/i.test(n))).toBe(true);

    await router.push('/setup?topic=tops');
    await settle();
    // Setup says so, and asks nothing of countertops.
    const text = host.textContent ?? '';
    expect(text).toContain('A torsion box: two skins on a grid of ribs');
    expect(text).not.toContain('Countertops');
    expect(host.querySelector('[data-test="setup-tops"]')!.textContent).not.toContain('Backsplash');

    // Setup's answer changed to a slab: the table is a slab; said its own on Design, it is a box again.
    context.tops!.kind = 'made';
    expect(frameTop(table, context).torsion).toBeUndefined();
    expect(parts().some((n) => /rib/i.test(n))).toBe(false);
    table.top.torsion = JSON.parse(JSON.stringify(context.tops!.torsion!)) as NonNullable<typeof table.top.torsion>;
    expect(parts().some((n) => /rib/i.test(n))).toBe(true);
    // And a table that says it is a slab stays one where Setup's tops are boxes.
    delete table.top.torsion;
    context.tops!.kind = 'torsion';
    table.top.slab = true;
    expect(frameTop(table, context).torsion).toBeUndefined();
    app.unmount();
    host.remove();
  });

  it('an assembly table added to a project that is already there keeps its box its own, and leaves Setup as it was', async () => {
    setActivePinia(createPinia());
    const store = useAppStore();
    await store.load(new IDBFactory());
    const preset = presetsOf(store.shop).find((p) => p.id === 'builtin-furniture-plywood')!;
    store.newProjectFrom(preset, starterById('endtable'));
    const context = store.project!.context as DesignedCabinetContext;
    const before = context.tops?.kind;
    starterById('assemblytable')!.add!(store.project!, 'Assembly table', undefined, store.shop);
    const added = framesOf(store.project!).at(-1)!;
    expect([context.tops?.kind, !!added.top.torsion]).toEqual([before, true]);
    // The end table, which follows Setup, is still a slab.
    expect(frameTop(framesOf(store.project!)[0]!, context).torsion).toBeUndefined();
  });
});
