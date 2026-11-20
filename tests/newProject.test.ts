import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { cabinetsOf } from '@/design';
import { createAppRouter } from '@/router';
import { presetsOf } from '@/samples/presets';
import { starterById } from '@/samples/starters';
import { useAppStore } from '@/stores/app';

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

/** A new project asks what is being made, then in what style. */
describe('a new project: what, then style', () => {
  it('asks what on the empty Projects page and on #/new, then the style, and starts the thing in it', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    const go = async (path: string) => {
      await router.push(path);
      await settle();
      return host.textContent ?? '';
    };
    const click = async (test: string, to = false) => {
      const el = host.querySelector<HTMLElement>(`[data-test="${test}"]`);
      expect(el, test).not.toBeNull();
      const before = router.currentRoute.value.fullPath;
      el!.click();
      await settle();
      // A click that goes to another page loads it first: wait for the address when it is on its way.
      for (let i = 0; i < 400 && to && router.currentRoute.value.fullPath === before; i++) await new Promise((r) => setTimeout(r, 25));
      await settle();
    };

    // With no projects yet the Projects page is the first question.
    const projects = await go('/');
    expect(projects).toContain('No projects yet. What are you making?');
    expect(projects).toContain('A bathroom vanity');
    expect(projects).toContain('Jigs, handles and drawer inserts');
    // Each group links to its finished examples on the Samples page.
    expect(host.querySelector('[data-test="starter-samples-cabinets"]')!.getAttribute('href')).toBe('#/samples?topic=cabinets');
    await click('starter-vanity', true);
    expect(router.currentRoute.value.fullPath).toBe('/new?starter=vanity');

    // Then the style: the presets for new cabinets, the first in hand.
    expect(host.textContent).toContain('In what style?');
    // The starter links to its finished examples: the Samples page, searched for it.
    expect(host.querySelector('[data-test="new-examples"]')!.getAttribute('href')).toBe('#/samples?q=vanity');
    const styles = [...host.querySelectorAll('[data-test^="new-style-"]')].map((e) => e.getAttribute('data-test'));
    expect(styles).toEqual(['new-style-builtin-frameless-shaker', 'new-style-builtin-face-frame-shaker', 'new-style-builtin-shop-inset-slab', 'new-style-builtin-furniture-plywood', 'new-style-builtin-furniture-solid', 'new-style-builtin-furniture-inset']);
    await click('new-style-builtin-face-frame-shaker');
    await click('new-start', true);
    expect(router.currentRoute.value.path).toBe('/setup');
    expect(store.project!.starter).toBe('vanity');
    expect(store.project!.name).toBe('Vanity');
    expect(store.project!.preset).toBe('Face frame, shaker');
    const vanity = cabinetsOf(store.project!)[0]!;
    expect([vanity.construction, Math.round(vanity.size.width.mm / 25.4), !!vanity.inside]).toEqual(['faceFrame', 30, true]);

    // Setup follows the starter: one vanity has no Room topic, and asking for it opens the first topic.
    await go('/setup?topic=room');
    expect(host.querySelector('[data-test="setup-topic-words"]')!.textContent).toContain('The preset the answers start from');
    await go('/setup?topic=tops');
    expect(host.querySelector('[data-test="setup-topic-words"]')!.textContent).toContain('How the countertops are made');

    // The style last used is in hand the next time; cabinets already there have their own styles and go to Measure.
    await go('/new?starter=drawers');
    expect(host.querySelector('[data-test="new-style-builtin-face-frame-shaker"]')!.getAttribute('aria-checked')).toBe('true');
    await go('/new?starter=organizers');
    expect([...host.querySelectorAll('[data-test^="new-style-"]')].map((e) => e.getAttribute('data-test'))).toEqual(['new-style-builtin-existing-shaker']);
    await click('new-start', true);
    expect(router.currentRoute.value.path).toBe('/measure');
    expect(cabinetsOf(store.project!)[0]!.existing).toBeDefined();

    // The shop table comes as it is: no style is asked. Jigs need no project.
    await go('/new');
    expect(host.textContent).toContain('What are you making?');
    await click('starter-shoptable', true);
    expect(router.currentRoute.value.path).toBe('/setup');
    expect(store.project!.starter).toBe('shoptable');
    await go('/new');
    await click('starter-jigs', true);
    expect(router.currentRoute.value.path).toBe('/jigs');
    expect(store.projects.length).toBe(3);
    // A run brings its room, so Setup has the Room topic; a wall cabinet on its own has neither Room nor Countertops.
    store.newProjectFrom(presetsOf(store.shop)[0]!, starterById('run'));
    await go('/setup?topic=room');
    expect(host.querySelector('[data-test="setup-topic-words"]')!.textContent).toContain('The room the pieces stand in');
    store.newProjectFrom(presetsOf(store.shop)[0]!, starterById('wall'));
    await go('/setup?topic=tops');
    expect(host.querySelector('[data-test="setup-topic-words"]')!.textContent).toContain('The preset the answers start from');
    app.unmount();
  });
});
