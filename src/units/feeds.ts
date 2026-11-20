import type { ChipLoadUnit, FeedUnit } from '@/model';
import { MM_PER_INCH } from './parse';

/**
 * Feeds and chip loads in the unit the shop shows them in. A feed is always
 * stored in mm/min, as the G-code takes it, and a chip load is worked out in mm a tooth; these turn
 * them into what is shown and back. Each is one choice for the whole shop (`UnitPreferences.feed`,
 * `.chipLoad`): a table of feeds in mixed units would be hard to read.
 */
export const FEED_UNITS: FeedUnit[] = ['mm/s', 'mm/min', 'in/min'];
export const CHIP_LOAD_UNITS: ChipLoadUnit[] = ['mm', 'in'];

/** The unit after this one, round the three: what a click on a feed's unit goes to. */
export const nextFeedUnit = (unit: FeedUnit): FeedUnit => FEED_UNITS[(FEED_UNITS.indexOf(unit) + 1) % FEED_UNITS.length]!;
export const nextChipLoadUnit = (unit: ChipLoadUnit): ChipLoadUnit => (unit === 'mm' ? 'in' : 'mm');

/** A stored feed (mm/min) as it is shown: mm/s to two places, mm/min and in/min to one. */
export function feedShown(mmPerMin: number, unit: FeedUnit): number {
  if (unit === 'mm/s') return Number((mmPerMin / 60).toFixed(2));
  if (unit === 'in/min') return Number((mmPerMin / MM_PER_INCH).toFixed(1));
  return Number(mmPerMin.toFixed(1));
}

/** A typed feed in mm/min, as it is stored. */
export function feedStored(typed: number, unit: FeedUnit): number {
  return Number((typed * (unit === 'mm/s' ? 60 : unit === 'in/min' ? MM_PER_INCH : 1)).toFixed(3));
}

/** A feed with its unit, for a line of words: `40 mm/s`, `94.5 in/min`. */
export const feedWords = (mmPerMin: number, unit: FeedUnit): string => `${feedShown(mmPerMin, unit)} ${unit}`;

/** A chip load (mm a tooth) as it is shown: mm to three places, inches to four, as bit makers' charts give them. */
export function chipLoadShown(mmPerTooth: number, unit: ChipLoadUnit): string {
  return unit === 'in' ? (mmPerTooth / MM_PER_INCH).toFixed(4) : mmPerTooth.toFixed(3);
}

/** A typed chip load in mm a tooth. */
export function chipLoadStored(typed: number, unit: ChipLoadUnit): number {
  return unit === 'in' ? typed * MM_PER_INCH : typed;
}

/** The usual range of a chip load as words: `0.10 to 0.20`, or `0.0040 to 0.0080` in inches. */
export function chipLoadRangeWords(range: { least: number; most: number }, unit: ChipLoadUnit): string {
  const show = (mm: number) => (unit === 'in' ? (mm / MM_PER_INCH).toFixed(4) : mm.toFixed(2));
  return `${show(range.least)} to ${show(range.most)}`;
}
