import type { Saws } from '@/model';
import { len } from '@/units';

/** The starter shop: a table saw with a 30" rip, a circular saw and a miter saw. */
export const STARTER_SAWS: Saws = {
  tableSaw: { owned: true, ripCapacity: len('30"') },
  circularSaw: { owned: true },
  miterSaw: { owned: true },
};
