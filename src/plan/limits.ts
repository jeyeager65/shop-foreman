/**
 * What the machine and the stock on hand allow (milestone 5): the largest part the CNC
 * cuts, and what happens to a part longer than that. Nothing here decides how a part is
 * cut; it says, in words, what Plan's own rules (`tooBigToCut`, `needsTiling`, the stock
 * on hand in `resolvePlan`) will do with a part of a given size.
 */
import type { MachineProfile, Mm, Part, PlanChoices } from '@/model';
import { needsTiling, tooBigToCut } from './parts';
import { DEFAULT_SHEET_TRIM } from './setups';

/** What becomes of a part of some size: cut on the CNC as it is, tiled in two set-ups, cut on a saw, or too big for any stock on hand. */
export type PartLimit = 'fits' | 'tiled' | 'saw' | 'noStock';

/** The largest piece of stock on hand, as Plan takes it: the project's own, or the machine's sheet less its trim. */
export function stockOnHand(plan: Pick<PlanChoices, 'blank'>, machine: MachineProfile): { width: Mm; height: Mm } {
  const chosen = plan.blank.stock;
  const trim = machine.nesting.sheetTrim ?? DEFAULT_SHEET_TRIM;
  return chosen ? { width: chosen.width.mm, height: chosen.height.mm } : { width: machine.defaultSheet.x.mm - trim, height: machine.defaultSheet.y.mm - trim };
}

/** The cutting area as Plan uses it. */
export const cuttingAreaOf = (machine: MachineProfile) => ({ width: machine.cuttingArea.x.mm, height: machine.cuttingArea.y.mm, tileLength: machine.tiling?.maxLength.mm });

/** What becomes of a flat part this size, on this machine, from this stock. */
export function partLimit(size: { width: Mm; height: Mm }, machine: MachineProfile, stock: { width: Mm; height: Mm }): PartLimit {
  const [short, long] = [Math.min(size.width, size.height), Math.max(size.width, size.height)];
  if (short > Math.min(stock.width, stock.height) + 1e-6 || long > Math.max(stock.width, stock.height) + 1e-6) return 'noStock';
  const part = { size: { ...size, thickness: 0 } } as Part;
  const area = cuttingAreaOf(machine);
  if (!tooBigToCut(part, area)) return 'fits';
  return needsTiling(part, area) ? 'tiled' : 'saw';
}

/**
 * Whether the stock on hand is smaller than what the machine cuts in one set-up, either way round:
 * the parts are then spread over more blanks than the machine needs, each with its own bit changes.
 */
export function stockSmallerThanMachine(machine: MachineProfile, stock: { width: Mm; height: Mm }): boolean {
  const area = cuttingAreaOf(machine);
  return Math.min(stock.width, stock.height) < Math.min(area.width, area.height) - 1 || Math.max(stock.width, stock.height) < Math.max(area.width, area.height) - 1;
}

/** What happens to such parts, as a clause: "the sides are tiled in two set-ups on the CNC". `parts` is plural: "sides". */
export function limitWords(limit: PartLimit, parts: string): string {
  switch (limit) {
    case 'fits':
      return `the ${parts} fit the CNC`;
    case 'tiled':
      return `the ${parts} are tiled in two set-ups on the CNC`;
    case 'saw':
      return `the ${parts} go to the saw, their holes by hand`;
    case 'noStock':
      return `no sheet on hand is big enough for the ${parts}`;
  }
}

/** The largest part the CNC cuts in one set-up, and with tiling, longest side first. */
export function largestParts(machine: MachineProfile): { oneSetup: { long: Mm; short: Mm }; tiled?: { long: Mm; short: Mm } } {
  const a = cuttingAreaOf(machine);
  const oneSetup = { long: Math.max(a.width, a.height), short: Math.min(a.width, a.height) };
  return { oneSetup, ...(a.tileLength ? { tiled: { long: a.tileLength, short: a.width } } : {}) };
}
