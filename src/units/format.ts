import type { Length, LengthDisplay, LengthUnit, Mm, ShownIn, UnitPreferences } from '@/model';
import { MM_PER_INCH } from './parse';

export const DEFAULT_UNIT_PREFERENCES: UnitPreferences = {
  sizes: { kind: 'fractionalInch', denominator: 32 },
  sawLists: { kind: 'fractionalInch', denominator: 32 },
  cnc: { kind: 'mm', places: 2 },
  bits: 'nameWithMm',
  feed: 'mm/s',
  chipLoad: 'mm',
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Fixed places with trailing zeros removed: 19.00 -> "19", 6.350 -> "6.35". */
function trimmed(value: number, places: number): string {
  return String(Number(value.toFixed(places)));
}

/** `10-29/32"`, `3/4"`, `24"`: rounded to the nearest 1/denominator. */
function fractionalInches(mm: Mm, denominator: number): string {
  const sign = mm < 0 ? '-' : '';
  const total = Math.round((Math.abs(mm) / MM_PER_INCH) * denominator);
  const whole = Math.floor(total / denominator);
  const num = total % denominator;
  if (num === 0) return `${total === 0 ? '' : sign}${whole}"`;
  const d = gcd(num, denominator);
  const fraction = `${num / d}/${denominator / d}`;
  return `${sign}${whole > 0 ? `${whole}-` : ''}${fraction}"`;
}

export function formatLength(mm: Mm, display: LengthDisplay): string {
  switch (display.kind) {
    case 'fractionalInch':
      return fractionalInches(mm, display.denominator);
    case 'decimalInch':
      return `${(mm / MM_PER_INCH).toFixed(display.places)}"`;
    case 'mm':
      return `${trimmed(mm, display.places)} mm`;
  }
}

/** The denominator a length field's inches are shown to. */
export const FIELD_DENOMINATOR = 32;
/** The places a length field's mm are shown to. */
export const FIELD_MM_PLACES = 3;

/**
 * A length as a field shows it: a number with no unit mark (the field's toggle says which). Inches
 * are a fraction to 1/32 (`24-1/2`), mm have up to three places. `about` when what is shown is not
 * exactly the value (19 mm in inches is about 3/4).
 */
export function lengthText(mm: Mm, unit: LengthUnit): { text: string; about: boolean } {
  if (unit === 'mm') {
    const text = trimmed(mm, FIELD_MM_PLACES);
    return { text, about: Math.abs(Number(text) - mm) > 1e-9 };
  }
  const parts = (Math.abs(mm) / MM_PER_INCH) * FIELD_DENOMINATOR;
  return { text: fractionalInches(mm, FIELD_DENOMINATOR).slice(0, -1), about: Math.abs(parts - Math.round(parts)) > 1e-6 };
}

/** The same length shown in another unit: what a field's toggle does. */
export function toUnit(length: Length, unit: LengthUnit): Length {
  return { mm: length.mm, unit };
}

/** The unit a plain number of mm on `owner` is shown in: mm unless its `shownIn` says inches. */
export function shownUnit(owner: { shownIn?: ShownIn } | undefined, field: string): LengthUnit {
  return owner?.shownIn?.[field] ?? 'mm';
}

/** Remembers the unit a plain number of mm on `owner` is shown in. Only what is not mm is kept. */
export function setShownUnit(owner: { shownIn?: ShownIn }, field: string, unit: LengthUnit): void {
  if (unit !== 'mm') (owner.shownIn ??= {})[field] = unit;
  else if (owner.shownIn) {
    delete owner.shownIn[field];
    if (Object.keys(owner.shownIn).length === 0) delete owner.shownIn;
  }
}

/** The three kinds of thing a shown length goes by, with what the Shop profile calls each and what it covers. */
export const UNIT_KINDS: { key: 'sizes' | 'sawLists' | 'cnc'; title: string; covers: string }[] = [
  { key: 'sizes', title: 'Sizes', covers: 'cabinets, rooms, openings, doors and drawers, sheets and stock' },
  { key: 'sawLists', title: 'Saw lists', covers: 'the saw cut list, the by-hand steps, what to buy' },
  { key: 'cnc', title: 'CNC and tooling', covers: "Plan's tables, depths, tabs, clearances, hardware specs, material thickness" },
];
/** What a kind is shown in when it is inches, and when it is mm. */
export const INCH_DISPLAY: LengthDisplay = { kind: 'fractionalInch', denominator: 32 };
export const MM_DISPLAY: LengthDisplay = { kind: 'mm', places: 2 };

/**
 * A length that names a thing (a material's nominal thickness: `3/4" Plywood`, `18 mm Plywood`): said in
 * the unit it was given in, whatever the shop shows lengths in, as a bit's name is.
 */
export function nominalText(length: Length): string {
  return formatLength(length.mm, length.unit === 'mm' ? { kind: 'mm', places: 3 } : INCH_DISPLAY);
}

/** Bits show by name with mm in brackets: `1/4" end mill (6.35 mm)`. */
export function formatBitName(name: string, diameterMm: Mm): string {
  return `${name} (${trimmed(diameterMm, 3)} mm)`;
}
