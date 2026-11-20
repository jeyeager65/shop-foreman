import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import type { Handle } from '@/model';
import { createAppRouter } from '@/router';
import { useAppStore } from '@/stores/app';

const settle = async (ms = 0) => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, ms));
    await nextTick();
  }
};

/** `#/jigs`: jigs and handles to print or cut with no project. */
describe('the jigs and handles page', () => {
  it('lists every item with no project open, opens one, keeps what is typed, and saves a handle to the shop profile', async () => {
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    globalThis.localStorage?.removeItem('shop-foreman:jigs');
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    app.config.errorHandler = (e) => errors.push(e);
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    await router.push('/jigs');
    await settle();
    expect(store.project).toBeNull();
    const cards = [...host.querySelectorAll('[data-test^="jig-"]')].map((c) => c.getAttribute('data-test'));
    expect(cards).toEqual(expect.arrayContaining(['jig-handle-printed-bar-96', 'jig-handle-wood-arch-96', 'jig-pocket-guide', 'jig-pocket-test', 'jig-slide-shims', 'jig-support-block', 'jig-gap-shim']));
    expect(host.querySelector('[data-test="header-jigs"]')).not.toBeNull();

    // A printed handle: its sizes start as the shop profile's.
    await router.push('/jigs?item=handle-printed-bar-96');
    await settle();
    expect(host.querySelector('[data-test="jig-title"]')!.textContent).toBe('Printed bar pull, 96 mm centres');
    expect(host.querySelector('[data-test="jig-untested"]')).not.toBeNull();
    const field = (key: string) => host.querySelector<HTMLInputElement>(`[data-test="jig-field-${key}"] input, input[data-test="jig-field-${key}"]`)!;
    expect([field('spacing').value, field('look.length').value]).toEqual(['96', '128']);
    // Held by inserts: the insert's hole shows, the screw's does not.
    expect([!!field('printed.insert.diameter'), !!field('printed.pilot.diameter')]).toEqual([true, false]);
    expect(host.querySelector('[data-test="jig-save"]')).toBeNull();

    const type = async (key: string, text: string) => {
      field(key).value = text;
      field(key).dispatchEvent(new Event('input'));
      field(key).dispatchEvent(new Event('blur'));
      await settle();
    };
    await type('look.length', '150');
    await type('spacing', '5in');
    expect(field('spacing').value).toBe('5');
    // Kept in the browser, not in the shop profile.
    const kept = JSON.parse(globalThis.localStorage!.getItem('shop-foreman:jigs')!) as Record<string, { values: Record<string, number>; shownIn?: Record<string, string> }>;
    expect(kept['handle-printed-bar-96']).toMatchObject({ values: { 'look.length': 150, spacing: 127 }, shownIn: { spacing: 'in' } });
    const entry = () => store.shop.hardware.find((h): h is Handle => h.kind === 'handle' && h.id === 'printed-bar-96')!;
    expect([entry().spacing, entry().look.length]).toEqual([96, 128]);

    // Saved: the shop's handle takes the sizes.
    host.querySelector<HTMLButtonElement>('[data-test="jig-save"]')!.click();
    await settle();
    expect([entry().spacing, entry().look.length]).toEqual([127, 150]);
    expect(host.querySelector('[data-test="jig-saved"]')).not.toBeNull();
    expect(host.querySelector('[data-test="jig-save"]')).toBeNull();

    // A size that cannot be made says so.
    expect(host.querySelector('[data-test="jig-problem"]')).toBeNull();
    await type('look.thickness', '0');
    expect(host.querySelector('[data-test="jig-problem"]')!.textContent).toContain('Bar thickness must be more than 0.');
    expect(host.querySelector('[data-test="jig-save"]')).toBeNull();
    await type('look.thickness', '12');
    expect(host.querySelector('[data-test="jig-problem"]')).toBeNull();

    // A thing cut on the CNC: a machine to choose, and its files.
    await router.push('/jigs?item=handle-wood-bar-96');
    await settle(20);
    expect(host.querySelector('[data-test="jig-machine"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-test="jig-gcode-file"]').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-test="jig-gcode-error"]')).toBeNull();

    // Back to the list.
    host.querySelector<HTMLButtonElement>('[data-test="jigs-back"]')!.click();
    await settle();
    expect(host.querySelector('[data-test="jig-pocket-guide"]')).not.toBeNull();
    expect(errors).toEqual([]);
    app.unmount();
  });
});
