import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { topPieces } from '@/design';
import type { CasesContext } from '@/model';
import { createAppRouter } from '@/router';
import { FACE_FRAME_PRESET_ID, presetsOf } from '@/samples/presets';
import { starterById } from '@/samples/starters';
import { useAppStore } from '@/stores/app';

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

/** The torsion box in Setup's Tops, and the one "Top" choice in Design. */
describe('the top choice on screen', () => {
  it("shows the shop table's island its own torsion box, and Setup the box when the project's tops are one", async () => {
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
    store.newProjectFrom(preset, starterById('shoptable'));
    const context = store.project!.context as CasesContext;

    // Design, the run's topic: the row's own top gives way to the island's, which says its kind, its box and its size.
    await go('/design?topic=run');
    expect(host.querySelector('[data-test="run-top"]')).toBeNull();
    const island = host.querySelector('[data-test="island-top-choice"]')!;
    expect(island.textContent).toContain('Its own: a torsion box');
    expect(island.querySelector('[data-test="torsion"]')).not.toBeNull();
    expect(island.querySelector('[data-test="torsion-start-light"]')!.getAttribute('aria-checked')).toBe('true');
    expect(island.querySelector('[data-test="island-top-size"]')).not.toBeNull();
    expect(island.querySelector('[data-test="leaf-edge"]')).not.toBeNull();

    // The bench top's tile fills the box's values in: the skins are 3/4" MDF, and the table is cut so.
    (island.querySelector('[data-test="torsion-start-bench"]') as HTMLElement).click();
    await settle();
    expect(context.islands![0]!.top!.settings!.torsion!.skins.topId).toBe('mdf-3-4');
    expect(store.materials.some((m) => m.id === 'mdf-3-4')).toBe(true);
    expect(topPieces(store.project!, store.materials)[0]!.torsion!.skins.topId).toBe('mdf-3-4');

    // Setup's Tops: the project's own kind is still a slab; as a torsion box it shows the box's fields.
    await go('/setup?topic=tops');
    expect(host.querySelector('[data-test="setup-tops"] [data-test="torsion"]')).toBeNull();
    context.tops = { ...context.tops!, kind: 'torsion', torsion: context.islands![0]!.top!.settings!.torsion! };
    await settle();
    expect(host.querySelector('[data-test="setup-tops"]')!.parentElement!.querySelector('[data-test="torsion"]')).not.toBeNull();
    expect(host.textContent).toContain('A torsion top takes no backsplash');
    expect(errors).toEqual([]);
    // (The shop table is the heaviest project to mount: it takes most of a minute when the whole suite runs at once.)
  }, 120000);
});
