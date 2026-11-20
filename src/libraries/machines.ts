import type { MachineProfile } from '@/model';
import { len } from '@/units';
import { DEFAULT_ROUTER } from './routers';

/**
 * A generic CNC router, the machine the shop starts with: it takes a full sheet of MDF (49" × 97") whole, so
 * nothing is tiled, and carries a Makita trim router. Describe your own machine by changing its values, or
 * by copying it, on the Shop profile. Most of the values are placeholders: tune me.
 */
export const GENERIC_CNC: MachineProfile = {
  id: 'generic-cnc',
  name: 'Generic CNC',
  cuttingArea: { x: len('49"'), y: len('97"') },
  defaultSheet: { x: len('48"'), y: len('96"') },
  router: DEFAULT_ROUTER,
  routerControl: 'manual',
  workZero: 'stockFrontLeft',
  probe: {
    plateThickness: 0.5,
    clearSquare: 20,
    // Whole numbers of mm/s (3 then 1), as every feed here is.
    fastFeed: 180,
    slowFeed: 60,
    maxTravel: 80,
    retract: 2,
    edgeInset: 2,
  },
  flipPins: { diameter: len('1/4"'), holeClearance: 0.1, spoilboardDepth: 6 },
  safeHeight: 5,
  homeZForBitChange: true,
  maxPlungeFeed: 360,
  rapidFeed: 3000,
  toolChangeSeconds: 120,
  nesting: { partSpacing: 20, pinInset: 15, edgeMargin: 20, sheetTrim: 3.175 },
  tabs: { width: 8, heightPercent: 40, maxSpacing: 400 },
  throughExtra: 0.5,
  tabFit: 0.15,
  postId: 'fluidnc',
  tuneMe: [
    'throughExtra',
    'tabFit',
    'safeHeight',
    'maxPlungeFeed',
    'rapidFeed',
    'toolChangeSeconds',
    'nesting',
    'tabs',
    'probe.fastFeed',
    'probe.slowFeed',
  ],
};
