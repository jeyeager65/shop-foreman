import { describe, expect, it } from 'vitest';
import type { LengthDisplay } from '@/model';
import { formatBitName, formatLength, lengthText, parseLength, toUnit } from '@/units';

const mmOf = (text: string, defaultUnit?: 'in' | 'mm') => parseLength(text, defaultUnit)?.mm;

describe('parseLength', () => {
  it.each([
    ['3/4', 19.05, 'in'],
    ['1-1/2"', 38.1, 'in'],
    ["2' 6\"", 762, 'in'],
    ['19mm', 19, 'mm'],
  ] as const)('accepts the spec example %s', (text, mm, unit) => {
    const length = parseLength(text);
    expect(length?.mm).toBeCloseTo(mm, 10);
    expect(length).toEqual({ mm: length?.mm, unit });
  });

  it.each([
    ['20-15/16"', 20.9375],
    ['23-1/2', 23.5],
    ['21-13/16"', 21.8125],
    ['24-7/8"', 24.875],
    ['1/8"', 0.125],
    ['1 1/2', 1.5],
    ['1 - 1/2 "', 1.5],
    ['0.75in', 0.75],
    ['.75"', 0.75],
    ['2 1/4 in', 2.25],
  ])('reads inches from %s', (text, inches) => {
    expect(mmOf(text)).toBeCloseTo(inches * 25.4, 10);
  });

  it.each([
    ["2'", 24],
    ["2'6", 30],
    ["2' 6-1/2\"", 30.5],
    ['2ft 6in', 30],
    ['2’ 6”', 30],
  ])('reads feet and inches from %s', (text, inches) => {
    const length = parseLength(text);
    expect(length?.mm).toBeCloseTo(inches * 25.4, 10);
    expect(length?.unit).toBe('in');
  });

  it.each([
    ['19 mm', 19],
    ['6.35MM', 6.35],
    ['  12.7mm ', 12.7],
  ])('reads mm from %s', (text, mm) => {
    expect(mmOf(text)).toBe(mm);
  });

  it('gives a bare number the default unit', () => {
    expect(parseLength('19', 'mm')).toEqual({ mm: 19, unit: 'mm' });
    expect(parseLength('19', 'in')?.mm).toBeCloseTo(482.6, 10);
    expect(parseLength('19')?.unit).toBe('in');
  });

  it('treats a bare fraction as inches even when the default is mm', () => {
    expect(parseLength('3/4', 'mm')).toMatchObject({ unit: 'in' });
    expect(mmOf('3/4', 'mm')).toBeCloseTo(19.05, 10);
  });

  it.each(['', '   ', 'abc', '-1', '1/0', '1-1/2mm', '3/4/5', '1..5', "2' x", '"', 'mm', '1 2'])(
    'rejects %j',
    (text) => {
      expect(parseLength(text)).toBeNull();
    },
  );
});

describe('formatLength', () => {
  const frac32: LengthDisplay = { kind: 'fractionalInch', denominator: 32 };
  const inch = 25.4;

  it.each([
    [10.90625, '10-29/32"'],
    [24.875, '24-7/8"'],
    [0.4375, '7/16"'],
    [0.6875, '11/16"'],
    [0.5, '1/2"'],
    [24, '24"'],
    [0, '0"'],
    [0.999, '1"'],
    [0.01, '0"'],
  ])('shows %f in as %s to 1/32', (inches, text) => {
    expect(formatLength(inches * inch, frac32)).toBe(text);
  });

  it('rounds to the chosen denominator', () => {
    expect(formatLength(10.90625 * inch, { kind: 'fractionalInch', denominator: 16 })).toBe('10-15/16"');
    expect(formatLength(19, { kind: 'fractionalInch', denominator: 64 })).toBe('3/4"');
  });

  it('shows decimal inches', () => {
    expect(formatLength(19.05, { kind: 'decimalInch', places: 3 })).toBe('0.750"');
  });

  it('shows mm without trailing zeros', () => {
    expect(formatLength(19, { kind: 'mm', places: 2 })).toBe('19 mm');
    expect(formatLength(6.35, { kind: 'mm', places: 2 })).toBe('6.35 mm');
    expect(formatLength(3.175, { kind: 'mm', places: 1 })).toBe('3.2 mm');
  });

  it('round-trips the vanity door width', () => {
    const opening = parseLength('20-15/16"')!.mm;
    const gap = parseLength('1/8"')!.mm;
    const overlay = parseLength('1/2"')!.mm;
    expect(formatLength((opening + 2 * overlay - gap) / 2, frac32)).toBe('10-29/32"');
  });
});

describe('a length as its field shows it', () => {
  const inch = 25.4;

  it.each([
    [24.5, '24-1/2'],
    [0.75, '3/4'],
    [24, '24'],
    [0, '0'],
    [10.90625, '10-29/32'],
  ])('shows %f in as the fraction %s, with no unit mark and no about mark', (inches, text) => {
    expect(lengthText(inches * inch, 'in')).toEqual({ text, about: false });
  });

  it('marks inches that are not an exact 32nd as about', () => {
    expect(lengthText(19, 'in')).toEqual({ text: '3/4', about: true });
    expect(lengthText(18.6, 'in')).toEqual({ text: '23/32', about: true });
    expect(lengthText(600, 'in')).toEqual({ text: '23-5/8', about: true });
  });

  it('shows mm to three places, about when there is more', () => {
    expect(lengthText(19, 'mm')).toEqual({ text: '19', about: false });
    expect(lengthText(19.05, 'mm')).toEqual({ text: '19.05', about: false });
    expect(lengthText(3.175, 'mm')).toEqual({ text: '3.175', about: false });
    expect(lengthText(25.4 / 32, 'mm')).toEqual({ text: '0.794', about: true });
  });

  it('converts without changing the length, and round-trips', () => {
    const typed = parseLength('24-1/2', 'in')!;
    const metric = toUnit(typed, 'mm');
    expect(metric).toEqual({ mm: 622.3, unit: 'mm' });
    expect(lengthText(metric.mm, metric.unit).text).toBe('622.3');
    expect(toUnit(metric, 'in')).toEqual(typed);
    // What a field shows parses back to the same length in the field's unit, when it is exact.
    for (const text of ['3/4', '1-1/2', '30', '0.794', '19']) {
      for (const unit of ['in', 'mm'] as const) {
        const length = parseLength(text, unit)!;
        const shown = lengthText(length.mm, length.unit);
        if (!shown.about) expect(parseLength(shown.text, length.unit)!.mm).toBeCloseTo(length.mm, 9);
      }
    }
  });

  it('a typed unit decides the unit, whatever the field shows', () => {
    expect(parseLength('19mm', 'in')).toEqual({ mm: 19, unit: 'mm' });
    expect(parseLength("2' 6\"", 'mm')).toEqual({ mm: 762, unit: 'in' });
    expect(parseLength('30', 'mm')).toEqual({ mm: 30, unit: 'mm' });
    expect(parseLength('30', 'in')).toEqual({ mm: 762, unit: 'in' });
  });
});

describe('formatBitName', () => {
  it('adds mm in brackets', () => {
    expect(formatBitName('1/4" end mill', 6.35)).toBe('1/4" end mill (6.35 mm)');
    expect(formatBitName('1/8" end mill', 3.175)).toBe('1/8" end mill (3.175 mm)');
  });
});
