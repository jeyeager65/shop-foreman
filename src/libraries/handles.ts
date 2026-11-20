import type { Handle } from '@/model';
import { MM_PER_INCH } from '@/units';
import { SOLID_WOOD_3_4_ID } from './materials';

export const GENERIC_KNOB_ID = 'generic-knob';
export const GENERIC_PULL_ID = 'generic-pull-96';

/** The hole a handle's screw passes through: a clearance hole for the usual #8-32 (M4) screw. Tune me. */
const hole: Handle['hole'] = { diameter: 5 };

const pull = (id: string, name: string, generic: boolean, spacing: number): Handle => ({
  id,
  kind: 'handle',
  name,
  generic,
  holes: 2,
  spacing,
  hole,
  look: { length: spacing + 24, projection: 32, thickness: 10 },
  tuneMe: ['hole', 'look'],
});

/**
 * What a printed handle's screw goes into. An M4 screw suits the 5 mm hole through the
 * front. Insert: the hole for a common M4 heat-set insert (5.6 mm across, 8 mm long);
 * check it against the inserts in hand. Pilot: a hole an M4 screw taps for itself.
 * Tune me: none of these has been printed.
 */
const fastening = { fastening: 'heatSetInsert', screw: 'M4', insert: { diameter: 5.6, depth: 9 }, pilot: { diameter: 3.4, depth: 12 } } as const;

const printedPull = (id: string, name: string, design: 'bar' | 'arch', spacing: number): Handle => ({
  id,
  kind: 'handle',
  name,
  generic: false,
  holes: 2,
  spacing,
  hole,
  look: { length: spacing + 32, projection: 28, thickness: 10 },
  printed: { design, width: 14, ...fastening, insert: { ...fastening.insert }, pilot: { ...fastening.pilot } },
  tuneMe: ['hole', 'look', 'printed'],
});

/** Handles printed here: change their sizes in the shop profile, or copy one for another spacing. */
export const STARTER_PRINTED_HANDLES: Handle[] = [
  printedPull('printed-bar-96', 'Printed bar pull, 96 mm centres', 'bar', 96),
  printedPull('printed-arch-96', 'Printed arch pull, 96 mm centres', 'arch', 96),
  {
    id: 'printed-knob',
    kind: 'handle',
    name: 'Printed knob',
    generic: false,
    holes: 1,
    spacing: 0,
    hole,
    look: { length: 32, projection: 16, thickness: 8 },
    printed: { design: 'knob', width: 0, ...fastening, insert: { ...fastening.insert }, pilot: { ...fastening.pilot } },
    tuneMe: ['hole', 'look', 'printed'],
  },
];

/** Handles cut out of wood on the CNC: 3/4" solid wood to start with, held by a #8 wood screw in a 1/8" pilot. Tune me: none has been cut. */
const woodenPull = (id: string, name: string, design: 'bar' | 'arch', spacing: number): Handle => ({
  id,
  kind: 'handle',
  name,
  generic: false,
  holes: 2,
  spacing,
  hole,
  look: { length: spacing + 40, projection: 28, thickness: 12 },
  cnc: { design, materialId: SOLID_WOOD_3_4_ID, screw: '#8', pilot: { diameter: 3.2, depth: 16 } },
  tuneMe: ['hole', 'look', 'cnc'],
});

export const STARTER_CNC_HANDLES: Handle[] = [
  woodenPull('wood-bar-96', 'Wooden bar pull, 96 mm centres', 'bar', 96),
  woodenPull('wood-arch-96', 'Wooden arch pull, 96 mm centres', 'arch', 96),
];

/** Pulls the CNC cuts into the front itself: nothing to buy or fit. Tune me: sizes for a hand, not yet cut. */
const routedPull = (id: string, name: string, shape: 'hole' | 'scoop' | 'notch', width: number, depth: number): Handle => ({
  id,
  kind: 'handle',
  name,
  generic: false,
  holes: 0,
  spacing: 0,
  hole,
  look: { length: width, projection: 0, thickness: 0 },
  routed: { shape, width, depth },
  tuneMe: ['routed'],
});

export const STARTER_ROUTED_PULLS: Handle[] = [
  routedPull('routed-hole', 'Finger hole, cut into the front', 'hole', 1.25 * MM_PER_INCH, 0),
  routedPull('routed-scoop', 'Half-round finger notch, cut into the edge', 'scoop', 2.5 * MM_PER_INCH, MM_PER_INCH),
  routedPull('routed-notch', 'Square finger notch, cut into the edge', 'notch', 4 * MM_PER_INCH, MM_PER_INCH),
];

/**
 * Knobs and pulls. Every one is one or two screw holes through the front, of one size
 * and a known distance apart; where they go on the front is the design's.
 */
export const STARTER_HANDLES: Handle[] = [
  {
    id: GENERIC_KNOB_ID,
    kind: 'handle',
    name: 'Generic knob',
    generic: true,
    holes: 1,
    spacing: 0,
    hole,
    look: { length: 30, projection: 26, thickness: 12 },
    tuneMe: ['hole', 'look'],
  },
  pull(GENERIC_PULL_ID, 'Generic pull, 96 mm centres', true, 96),
  pull('pull-3in', 'Pull, 3" centres', false, 3 * MM_PER_INCH),
  pull('pull-128', 'Pull, 128 mm centres', false, 128),
  pull('pull-160', 'Pull, 160 mm centres', false, 160),
  ...STARTER_PRINTED_HANDLES,
  ...STARTER_CNC_HANDLES,
  ...STARTER_ROUTED_PULLS,
];
