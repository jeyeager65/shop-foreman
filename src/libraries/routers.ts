import type { Router } from '@/model';

/**
 * Trim routers and what each mark on the speed dial gives. The speed is set by hand;
 * the G-code messages say which dial setting to use. Tables as in the FreeCAD
 * FluidNC post used on the same machine.
 */
export const ROUTERS: Router[] = [
  {
    id: 'makita-rt0701c',
    name: 'Makita RT0701C',
    speeds: [
      { dial: 1, rpm: 10000 },
      { dial: 2, rpm: 12000 },
      { dial: 3, rpm: 17000 },
      { dial: 4, rpm: 22000 },
      { dial: 5, rpm: 27000 },
      { dial: 6, rpm: 30000 },
    ],
    source: 'Makita RT0701C instruction manual, speed adjusting dial table',
  },
  {
    id: 'kobalt-k7tr-03',
    name: 'Kobalt K7TR-03',
    speeds: [
      { dial: 1, rpm: 10000 },
      { dial: 2, rpm: 14000 },
      { dial: 3, rpm: 18000 },
      { dial: 4, rpm: 22000 },
      { dial: 5, rpm: 26000 },
      { dial: 6, rpm: 35000 },
    ],
    source: 'manual table',
  },
  {
    id: 'carbide-compact',
    name: 'Carbide Compact Router',
    speeds: [
      { dial: 1, rpm: 11000 },
      { dial: 2, rpm: 13500 },
      { dial: 3, rpm: 18250 },
      { dial: 4, rpm: 24500 },
      { dial: 5, rpm: 29250 },
      { dial: 6, rpm: 31000 },
    ],
    source: 'Carbide 3D table (approximate)',
  },
  {
    id: 'dewalt-dwp611',
    name: 'DeWalt DWP611',
    speeds: [
      { dial: 1, rpm: 16000 },
      { dial: 2, rpm: 18200 },
      { dial: 3, rpm: 20400 },
      { dial: 4, rpm: 22600 },
      { dial: 5, rpm: 24800 },
      { dial: 6, rpm: 27000 },
    ],
    source: "even spread over DeWalt's 16000-27000 RPM spec - unverified",
  },
];

/** The starter machine's router: used when a machine has none set. */
export const DEFAULT_ROUTER: Router = ROUTERS[0]!;
