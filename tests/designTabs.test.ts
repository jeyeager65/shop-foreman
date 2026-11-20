import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { createAppRouter } from '@/router';
import { createKitchenProject } from '@/samples/cabinet';
import { useAppStore } from '@/stores/app';

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

/** Design on the three-pane shell: a topic at a time, the address keeping it, the old links still opening one. */
describe('Design: topics on the shell', () => {
  it('shows one topic at a time, keeps the cabinet in the address, and opens the topic an old fold= or more= link names', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    const store = useAppStore();
    await store.load(new IDBFactory());
    store.addProject(createKitchenProject());
    app.mount(host);
    await router.push('/design');
    await settle();

    /** Whether the element, or anything it is inside, is hidden. */
    const hidden = (test: string) => {
      let el: HTMLElement | null = host.querySelector<HTMLElement>(`[data-test="${test}"]`);
      expect(el, test).not.toBeNull();
      while (el && el !== host) {
        if (el.style.display === 'none') return true;
        el = el.parentElement;
      }
      return false;
    };
    const go = async (to: string) => {
      await router.push(to);
      await settle();
    };
    // The tabs are gone. The test's window is narrow, so the rail is a select over the topic.
    expect(host.querySelector('[data-test="design-tabs"]')).toBeNull();
    expect(host.querySelector('[data-test="design-topic-select"]')).not.toBeNull();
    // It opens on the cabinet: its name shows; its corner, its run and the room are other topics.
    expect([hidden('cabinet-name'), hidden('stands-in')]).toEqual([false, false]);
    expect([hidden('corner'), hidden('run-name-field'), hidden('room-length'), hidden('layout')]).toEqual([true, true, true, true]);
    expect(host.querySelector('[data-test="design-topic-words"]')!.textContent).toContain('Its name');

    // What the cabinet card's "More" held is Place and corner, and Construction.
    await go('/design?topic=place');
    expect([hidden('corner'), hidden('cabinet-name'), hidden('follows-setup')]).toEqual([false, true, true]);
    await go('/design?topic=construction');
    expect([hidden('follows-setup'), hidden('corner')]).toEqual([false, true]);
    // The run and the room are in the same list as the cabinet's topics.
    await go('/design?topic=run');
    expect([hidden('run-name-field'), hidden('cabinet-name')]).toEqual([false, true]);
    await go('/design?topic=room');
    expect([hidden('room-length'), hidden('run-name-field')]).toEqual([false, true]);

    // Next walks the topics and keeps the cabinet in the address.
    await go('/design?cabinet=2&topic=cabinet');
    host.querySelector<HTMLElement>('[data-test="design-next"]')!.click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({ cabinet: '2', topic: 'place' });
    expect(hidden('corner')).toBe(false);
    // Fronts has a second level: a set of doors or a drawer at a time.
    await go('/design?cabinet=4&topic=fronts');
    const chips = [...host.querySelectorAll('[data-test^="design-sub-chip-"]')].map((c) => c.textContent!.trim());
    expect(chips.length).toBeGreaterThan(1);

    // A warning is in its own topic, and a badge on the topic says where: a ceiling the cabinets pass, on Room.
    await go('/design?cabinet=1&topic=room');
    expect(host.querySelector('[data-test="past-ceiling"]')).toBeNull();
    expect(host.querySelector('[data-test="design-topic-select"]')!.textContent).not.toContain('(!)');
    const context = store.project!.context;
    if (context.kind === 'designedCabinet') context.room!.ceiling = { mm: 30 * 25.4, unit: 'in' };
    await settle();
    expect(host.querySelector('[data-test="past-ceiling"]')).not.toBeNull();
    expect(host.querySelector('[data-test="design-topic-select"]')!.textContent).toContain('Room (!)');

    // The old links, read when the page opens: a card's name, or the cabinet card's More.
    await go('/setup');
    await go('/design?fold=appliances');
    expect([hidden('add-appliance-range'), hidden('cabinet-name')]).toEqual([false, true]);
    await go('/setup');
    await go('/design?more=cabinet');
    expect(hidden('corner')).toBe(false);
    await go('/setup');
    await go('/design?fold=openings');
    expect([hidden('layout'), hidden('cabinet-name')]).toEqual([false, true]);
    app.unmount();
  });
});
