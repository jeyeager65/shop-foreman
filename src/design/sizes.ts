/**
 * Standard cabinet sizes (milestone 5): where a new cabinet starts, and the choices
 * Setup offers. US kitchen practice; every value is tune me. A cabinet's height is from
 * the floor, toe kick included; its depth is the case alone (a face frame and the
 * fronts add to it).
 */
import type { CabinetForm, Length, StartSizes } from '@/model';
import { len } from '@/units';

const inches = (values: string[]): Length[] => values.map((v) => len(v));
const steps = (from: number, to: number, by: number) => Array.from({ length: Math.floor((to - from) / by) + 1 }, (_, i) => `${from + i * by}"`);

/** One standard size with what it is for, as Setup lists it. */
export interface SizeChoice {
  value: Length;
  title: string;
}
const choice = (value: string, note?: string): SizeChoice => ({ value: len(value), title: note ? `${value} (${note})` : value });

/** The heights and depths Setup offers for each form, the usual one first. Tune me. */
export const STANDARD_SIZES: Record<CabinetForm, { heights: SizeChoice[]; depths: SizeChoice[] }> = {
  base: {
    heights: [choice('34-1/2"', '36" with a 1-1/2" top'), choice('32-1/2"', 'a bathroom vanity, 34" with its top'), choice('31"', 'a low vanity'), choice('30"', 'a shop bench under a top')],
    // The case: 24" over a 3/4" door with its bumpers, as the starter frameless cabinet is.
    depths: [choice('22-1/2"', '24" over the doors'), choice('21"', 'a bathroom vanity'), choice('20-1/4"', 'a vanity, 21" over the doors')],
  },
  wall: {
    heights: [choice('30"'), choice('36"'), choice('42"', 'to the ceiling of an 8\' room'), choice('12"', 'over a fridge'), choice('15"', 'over a range hood')],
    depths: [choice('12"'), choice('15"'), choice('24"', 'over a fridge')],
  },
  tall: {
    heights: [choice('84"'), choice('90"'), choice('96"')],
    depths: [choice('24"'), choice('12"', 'a linen cabinet')],
  },
};

/** The widths Design offers as quick picks, per form. Tune me. */
export const STANDARD_WIDTHS: Record<CabinetForm, string[]> = {
  base: steps(9, 48, 3),
  wall: steps(9, 36, 3),
  tall: ['18"', '24"', '30"', '36"'],
};

/** The standard start sizes: the first choice of each form. `base` changes the base cabinet's (a shop bench is lower). */
export function standardStartSizes(base?: { height?: string; depth?: string }): StartSizes {
  const first = (form: CabinetForm) => ({ height: { ...STANDARD_SIZES[form].heights[0]!.value }, depth: { ...STANDARD_SIZES[form].depths[0]!.value } });
  const sizes: StartSizes = {
    base: first('base'),
    wall: first('wall'),
    tall: first('tall'),
    widths: { base: inches(STANDARD_WIDTHS.base), wall: inches(STANDARD_WIDTHS.wall), tall: inches(STANDARD_WIDTHS.tall) },
  };
  if (base?.height) sizes.base.height = len(base.height);
  if (base?.depth) sizes.base.depth = len(base.depth);
  return sizes;
}
