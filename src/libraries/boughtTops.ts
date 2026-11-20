import type { BoughtTop } from '@/model';
import { len } from '@/units';

/** Post-formed laminate countertops as a home centre sells them (milestone 7). Tune me. */
export const STARTER_BOUGHT_TOPS: BoughtTop[] = [
  {
    id: 'laminate-top-splash',
    kind: 'boughtTop',
    name: 'Laminate countertop, 4" backsplash',
    generic: true,
    depth: len('25"'),
    thickness: len('1-1/2"'),
    backsplash: len('4"'),
    lengths: ["6'", "8'", "10'", "12'"].map((l) => len(l)),
    tuneMe: ['depth', 'lengths'],
  },
  {
    id: 'laminate-top-flat',
    kind: 'boughtTop',
    name: 'Laminate countertop, no backsplash',
    generic: true,
    depth: len('25"'),
    thickness: len('1-1/2"'),
    backsplash: null,
    lengths: ["6'", "8'", "10'", "12'"].map((l) => len(l)),
    tuneMe: ['depth', 'lengths'],
  },
];
