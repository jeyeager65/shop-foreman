import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createVuetify } from 'vuetify';
import LengthField from '@/components/LengthField.vue';
import MmField from '@/components/MmField.vue';
import type { Length } from '@/model';
import { len, setShownUnit, shownUnit } from '@/units';

/** The field on a page of its own, bound to a value the test can read. */
function mount(start: Length | null, props: Record<string, unknown> = {}) {
  const value = ref<Length | null>(start);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(LengthField, { label: 'Width', ...props, modelValue: value.value, 'onUpdate:modelValue': (v: Length | null) => (value.value = v) }),
  }).use(createVuetify());
  app.mount(host);
  const input = host.querySelector('input')!;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await nextTick();
  };
  const button = () => host.querySelector<HTMLButtonElement>('[data-test="unit"]')!;
  const on = () => button().textContent!.trim();
  /** Clicks the toggle when it is not already showing that unit. */
  const toggle = async (unit: 'in' | 'mm') => {
    if (on() !== unit) button().click();
    await nextTick();
  };
  const about = () => !!host.querySelector('[data-test="about"]');
  return { value, input, type, toggle, on, about, host };
}

describe('the length field', () => {
  it('shows a number and which unit is selected, not a unit mark', () => {
    const f = mount(len('24-1/2"'));
    expect([f.input.value, f.on(), f.about()]).toEqual(['24-1/2', 'in', false]);
    const m = mount(len('19mm'));
    expect([m.input.value, m.on()]).toEqual(['19', 'mm']);
  });

  it('converts the value when the toggle changes, and keeps the unit with it', async () => {
    const f = mount(len('24-1/2"'));
    await f.toggle('mm');
    expect(f.value.value).toEqual({ mm: 622.3, unit: 'mm' });
    expect([f.input.value, f.on()]).toEqual(['622.3', 'mm']);
    await f.toggle('in');
    expect(f.value.value).toEqual(len('24-1/2"'));
    expect(f.input.value).toBe('24-1/2');
  });

  it('marks inches that are not an exact 32nd as about, and leaving the field does not round the value', async () => {
    const f = mount(len('19mm'));
    await f.toggle('in');
    expect([f.input.value, f.about()]).toEqual(['3/4', true]);
    f.input.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(f.value.value).toEqual({ mm: 19, unit: 'in' });
    // Typed again, it is what was typed.
    await f.type('3/4');
    expect(f.value.value).toEqual({ mm: 19, unit: 'in' });
    await f.type('0.75');
    expect([f.value.value, f.about()]).toEqual([len('3/4"'), false]);
  });

  it('reads a bare number in the unit shown', async () => {
    const f = mount(len('24"'));
    await f.type('30');
    expect(f.value.value).toEqual({ mm: 762, unit: 'in' });
    await f.toggle('mm');
    await f.type('30');
    expect(f.value.value).toEqual({ mm: 30, unit: 'mm' });
    await f.type('30.5');
    expect(f.value.value).toEqual({ mm: 30.5, unit: 'mm' });
  });

  it('a typed unit switches the toggle; feet and inches become inches; a fraction is inches', async () => {
    const f = mount(len('24"'));
    await f.type('19mm');
    expect([f.value.value, f.input.value, f.on()]).toEqual([{ mm: 19, unit: 'mm' }, '19', 'mm']);
    await f.type('2\' 6"');
    expect([f.value.value, f.input.value, f.on()]).toEqual([{ mm: 762, unit: 'in' }, '30', 'in']);
    await f.toggle('mm');
    await f.type('3/4');
    expect([f.value.value, f.input.value, f.on()]).toEqual([len('3/4"'), '3/4', 'in']);
  });

  it('refuses what is not a length, and keeps the value', async () => {
    const f = mount(len('24"'));
    await f.type('wide');
    expect(f.value.value).toEqual(len('24"'));
    expect(f.host.textContent).toContain('Enter a number such as');
  });

  it('an empty optional field starts in the unit usual for its kind, and can be emptied again', async () => {
    const f = mount(null, { optional: true, defaultUnit: 'mm' });
    expect([f.input.value, f.on()]).toEqual(['', 'mm']);
    await f.type('12');
    expect(f.value.value).toEqual({ mm: 12, unit: 'mm' });
    await f.type('');
    expect(f.value.value).toBeNull();
  });

  it('a field that only shows a value still converts what it shows', async () => {
    const f = mount({ mm: 3.175, unit: 'in' }, { disabled: true });
    expect(f.input.value).toBe('1/8');
    await f.toggle('mm');
    expect([f.input.value, f.on()]).toEqual(['3.175', 'mm']);
    expect(f.value.value).toEqual({ mm: 3.175, unit: 'in' });
  });
});

describe('a plain number of mm in the same field', () => {
  /** The field on a machine-like owner whose `probe.maxTravel` is a number of mm. */
  function mountMm(owner: { shownIn?: Record<string, 'in' | 'mm'>; travel: number | undefined }, props: Record<string, unknown> = {}) {
    const state = reactive(owner);
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp({
      render: () => h(MmField, { label: 'Travel', owner: state, field: 'probe.maxTravel', ...props, modelValue: state.travel, 'onUpdate:modelValue': (v: number | null) => (state.travel = v ?? undefined) }),
    })
      .use(createVuetify())
      .mount(host);
    const input = host.querySelector('input')!;
    const button = () => host.querySelector<HTMLButtonElement>('[data-test="unit"]')!;
    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await nextTick();
    };
    const toggle = async () => {
      button().click();
      await nextTick();
    };
    return { state, input, type, toggle, on: () => button().textContent!.trim(), host };
  }

  it('shows mm until it is toggled, keeps the number in mm and the unit beside it', async () => {
    const f = mountMm({ travel: 76.2 });
    expect([f.input.value, f.on()]).toEqual(['76.2', 'mm']);
    await f.toggle();
    expect([f.input.value, f.on(), f.state.travel, f.state.shownIn]).toEqual(['3', 'in', 76.2, { 'probe.maxTravel': 'in' }]);
    await f.type('3-1/2');
    expect(f.state.travel).toBeCloseTo(88.9, 9);
    await f.type('80mm');
    expect([f.state.travel, f.on(), f.state.shownIn]).toEqual([80, 'mm', undefined]);
  });

  it('opens in the unit that was kept', () => {
    const f = mountMm({ travel: 76.2, shownIn: { 'probe.maxTravel': 'in' } });
    expect([f.input.value, f.on()]).toEqual(['3', 'in']);
  });

  it('remembers the unit of an empty optional field, and shows what it stands for in that unit', async () => {
    const f = mountMm({ travel: undefined }, { optional: true, plain: true, placeholderMm: 0.635 });
    expect([f.input.value, f.input.placeholder, f.on()]).toEqual(['', '0.635', 'mm']);
    await f.toggle();
    expect([f.input.placeholder, f.on(), f.state.shownIn]).toEqual(['1/32', 'in', { 'probe.maxTravel': 'in' }]);
    await f.type('1/16');
    expect(f.state.travel).toBeCloseTo(1.5875, 9);
    await f.type('');
    expect(f.state.travel).toBeUndefined();
  });

  it('the helpers keep only what is not mm', () => {
    const owner: { shownIn?: Record<string, 'in' | 'mm'> } = {};
    expect(shownUnit(owner, 'a')).toBe('mm');
    setShownUnit(owner, 'a', 'in');
    setShownUnit(owner, 'b', 'in');
    expect([shownUnit(owner, 'a'), owner.shownIn]).toEqual(['in', { a: 'in', b: 'in' }]);
    setShownUnit(owner, 'a', 'mm');
    setShownUnit(owner, 'b', 'mm');
    expect(owner.shownIn).toBeUndefined();
  });
});
