import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { listsHtml } from '@/job/listsHtml';
import { useMachine } from '@/libraries';
import { createAppRouter } from '@/router';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { useAppStore } from '@/stores/app';
import { INCH_DISPLAY, MM_DISPLAY, formatLength, len, nominalText, chipLoadRangeWords, chipLoadShown, chipLoadStored, feedShown, feedStored, feedWords, nextChipLoadUnit, nextFeedUnit } from '@/units';
import { lowRiderJobShop, lowRiderShop, useLowRider } from './lowRider';

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

describe('feeds and chip loads in the unit the shop shows them in', () => {
  it('shows a stored feed (mm/min) in mm/s, mm/min or in/min, and reads one back', () => {
    expect([feedShown(2400, 'mm/s'), feedShown(2400, 'mm/min'), feedShown(2400, 'in/min')]).toEqual([40, 2400, 94.5]);
    expect([feedShown(400, 'mm/s'), feedShown(2540, 'in/min')]).toEqual([6.67, 100]);
    expect([feedStored(40, 'mm/s'), feedStored(2400, 'mm/min'), feedStored(100, 'in/min')]).toEqual([2400, 2400, 2540]);
    expect(feedWords(2400, 'in/min')).toBe('94.5 in/min');
  });

  it('goes round the three feed units, and between the two chip load units', () => {
    expect([nextFeedUnit('mm/s'), nextFeedUnit('mm/min'), nextFeedUnit('in/min')]).toEqual(['mm/min', 'in/min', 'mm/s']);
    expect([nextChipLoadUnit('mm'), nextChipLoadUnit('in')]).toEqual(['in', 'mm']);
  });

  it('shows a chip load in mm to three places or inches to four, and the usual range in the same unit', () => {
    expect([chipLoadShown(0.1714, 'mm'), chipLoadShown(0.1714, 'in')]).toEqual(['0.171', '0.0067']);
    expect(chipLoadStored(0.004, 'in')).toBeCloseTo(0.1016, 9);
    expect(chipLoadStored(0.1, 'mm')).toBe(0.1);
    expect([chipLoadRangeWords({ least: 0.1, most: 0.2 }, 'mm'), chipLoadRangeWords({ least: 0.1, most: 0.2 }, 'in')]).toEqual(['0.10 to 0.20', '0.0039 to 0.0079']);
  });

  it('the starter shop starts at mm/s and mm a tooth', () => {
    expect([lowRiderShop().units.feed, lowRiderShop().units.chipLoad]).toEqual(['mm/s', 'mm']);
  });

  it('one click flips every feed on the Shop profile; the chip load has its own; stored feeds do not change', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    await router.push('/shop?tab=bits&bits=endMill&feeds=endmill-1-4');
    await settle();
    const stored = JSON.stringify(store.shop.tools);
    const feed = () => host.querySelector<HTMLInputElement>('[data-test="bit-endmill-1-4-mdf-feed"]')!;
    const chip = () => host.querySelector<HTMLInputElement>('[data-test="bit-endmill-1-4-mdf-chip"]')!;
    const button = (name: string) => host.querySelector<HTMLButtonElement>(`[data-test="${name}"]`)!;
    expect([feed().value, button('feed-unit').textContent, chip().value]).toEqual(['40', 'mm/s', '0.200']);
    button('feed-unit').click();
    await settle();
    expect([feed().value, button('feed-unit').textContent, store.shop.units.feed]).toEqual(['2400', 'mm/min', 'mm/min']);
    button('feed-unit').click();
    await settle();
    expect([feed().value, chip().value]).toEqual(['94.5', '0.200']);
    expect(host.textContent!.includes('0.10 to 0.20')).toBe(true);
    button('chip-unit').click();
    await settle();
    expect([chip().value, feed().value, store.shop.units.chipLoad]).toEqual(['0.0079', '94.5', 'in']);
    expect(host.textContent!.includes('0.0039 to 0.0079')).toBe(true);
    expect(JSON.stringify(store.shop.tools)).toBe(stored);

    // Typed in in/min, it is kept in mm/min; a chip load typed in inches a tooth sets a whole mm/s.
    feed().value = '100';
    feed().dispatchEvent(new Event('change'));
    await settle();
    expect(store.shop.tools[0]!.settings.mdf!.feed).toBe(2540);
    chip().value = '0.005';
    chip().dispatchEvent(new Event('change'));
    await settle();
    expect(store.shop.tools[0]!.settings.mdf!.feed).toBe(25 * 60);

    // The machine's feeds follow the same choice.
    await router.push('/shop?tab=machine');
    await settle();
    const probe = () => host.querySelector<HTMLInputElement>('[data-test="machine-probe.fastFeed"] input, input[data-test="machine-probe.fastFeed"]')!;
    expect(probe().value).toBe('7.1');
    host.querySelectorAll<HTMLButtonElement>('[data-test="feed-unit"]')[0]!.click();
    await settle();
    expect(probe().value).toBe('3');
    expect(store.shop.machines[0]!.probe.fastFeed).toBe(180);
    app.unmount();
  });
});

describe('read-only lengths go by kind of thing, not by screen', () => {
  it('sizes and saw lists start in inches, CNC and tooling in mm; each kind is set on the Shop profile', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    const store = useAppStore();
    await store.load(new IDBFactory());
    app.mount(host);
    await router.push('/shop?tab=machine');
    await settle();
    const shown = () => [store.sizeLength(609.6), store.sawLength(609.6), store.cncLength(609.6)];
    expect(shown()).toEqual(['24"', '24"', '609.6 mm']);
    host.querySelector<HTMLButtonElement>('[data-test="unit-kind-sawLists-mm"]')!.click();
    await settle();
    expect(shown()).toEqual(['24"', '609.6 mm', '609.6 mm']);
    host.querySelector<HTMLButtonElement>('[data-test="unit-kind-cnc-in"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-test="unit-kind-sizes-mm"]')!.click();
    await settle();
    expect(shown()).toEqual(['609.6 mm', '609.6 mm', '24"']);
    expect(store.shop.units).toMatchObject({ sizes: { kind: 'mm' }, sawLists: { kind: 'mm' }, cnc: { kind: 'fractionalInch', denominator: 32 } });
    app.unmount();
  });

  it('the saw cut list and the by-hand steps follow the saw lists unit', () => {
    const shop = lowRiderJobShop();
    const project = createBaseCabinetProject('faceFrame');
    const job = buildJob(project, shop);
    const mm = (v: number) => formatLength(v, MM_DISPLAY);
    const inch = (v: number) => formatLength(v, INCH_DISPLAY);
    const page = (show: (v: number) => string) => listsHtml('Cabinet', buildLists(job, project, shop, show), show);
    expect(page(inch).includes('22-9/16')).toBe(true);
    expect(page(mm).includes('22-9/16')).toBe(false);
    expect(page(mm).includes('573.09 mm')).toBe(true);
    // A material is named by the thickness it is sold as, in the unit that was given in, whatever the lists show.
    expect([/3\/4(&quot;|") Plywood/.test(page(mm)), /3\/4(&quot;|") Plywood/.test(page(inch))]).toEqual([true, true]);
    expect([nominalText(len('18mm')), nominalText(len('3/4"')), nominalText(len('7/16"'))]).toEqual(['18 mm', '3/4"', '7/16"']);
  });
});

describe('the machine picker on the Bits section', () => {
  it('shows and types another machine\'s feeds without leaving the section, and changes no project\'s machine', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    const store = useAppStore();
    await store.load(new IDBFactory());
    // Between the tests' two LowRiders, the LowRider 3 in use.
    useLowRider(store.shop);
    const project = store.addProject(createBaseCabinetProject('frameless'));
    app.mount(host);
    await settle();
    await router.push('/shop?tab=bits&bits=endMill&feeds=endmill-1-4');
    await settle();
    const feed = () => host.querySelector<HTMLInputElement>('[data-test="bit-endmill-1-4-mdf-feed"]')!;
    // The page may already be up from the test before (the router's place is the window's): open the end mills and the bit's feeds by hand.
    if (!host.querySelector('[data-test="bit-endmill-1-4-feeds"]')) host.querySelector<HTMLButtonElement>('[data-test="bit-group-endMill"] .kind-head')!.click();
    await settle();
    if (!feed()) host.querySelector<HTMLButtonElement>('[data-test="bit-endmill-1-4-feeds"]')!.click();
    await settle();
    const type = async (text: string) => {
      feed().value = text;
      feed().dispatchEvent(new Event('change'));
      await settle();
    };
    expect(host.querySelector('[data-test="bits-machine"]')).not.toBeNull();
    await type('50');
    // What the picker does when another machine is chosen.
    expect(useMachine(store.shop, 'lowrider-4')).toBe(true);
    await settle();
    expect(feed().value).toBe('40');
    await type('30');
    useMachine(store.shop, 'lowrider-3');
    await settle();
    expect(feed().value).toBe('50');
    expect(store.shop.machines.find((m) => m.id === 'lowrider-4')!.feeds!['endmill-1-4']!.settings.mdf!.feed).toBe(1800);
    expect([project.machineId, store.machine?.id]).toEqual(['lowrider-3', 'lowrider-3']);
    app.unmount();
  });
});
