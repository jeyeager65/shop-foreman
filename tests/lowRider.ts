import { DEFAULT_ROUTER, ROUTERS, createStarterShopProfile, useMachine, withMaterialSettings } from '@/libraries';
import type { RouterBit } from '@/model';
import type { MachineProfile, Shop, ShopProfile } from '@/model';

/** The LowRider 3's router, and the speed its bits run at: dial 2 on it. */
const KOBALT = ROUTERS.find((r) => r.id === 'kobalt-k7tr-03')!;
export const LOWRIDER_RPM = 14000;
/** A copy of the bits' feeds for a LowRider, at its own speed. */
const lowRiderFeeds = (tools: RouterBit[]) =>
  Object.fromEntries(
    tools.map((t) => {
      const settings = JSON.parse(JSON.stringify(t.settings)) as typeof t.settings;
      for (const s of Object.values(settings)) if (s) s.rpm = LOWRIDER_RPM;
      return [t.id, { settings, tuneMe: true }];
    }),
  );
import { len } from '@/units';

/**
 * Two machines of the tests' own, which the app does not come with. The LowRider 3 is small (34" × 72", a
 * 24" × 48" sheet) and tiles a long part: the tests written round those sizes, and the reviewed golden files,
 * run on it.
 */
export const LOWRIDER_3: MachineProfile = {
  id: 'lowrider-3',
  name: 'LowRider 3',
  cuttingArea: { x: len('34"'), y: len('72"') },
  // The table is open at its ends: a full-length sheet can hang over them. Tune me.
  tiling: { maxLength: len('96"') },
  defaultSheet: { x: len('24"'), y: len('48"') },
  router: KOBALT,
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
    'tiling',
    'tabs',
    'probe.fastFeed',
    'probe.slowFeed',
  ],
};

/**
 * A LowRider 4 that takes a full sheet (48" × 96", with a Makita router):
 * a second machine beside the LowRider 3. No tiling: the sheet lies
 * whole inside the cutting area. Its probe travels 110 mm. Every other value is the LowRider 3's, not
 * measured on an LR4: tune me.
 */
export const LOWRIDER_4: MachineProfile = {
  ...structuredClone({ ...LOWRIDER_3, tiling: undefined }),
  id: 'lowrider-4',
  name: 'LowRider 4',
  cuttingArea: { x: len('48"'), y: len('96"') },
  defaultSheet: { x: len('48"'), y: len('96"') },
  router: DEFAULT_ROUTER,
  probe: { ...LOWRIDER_3.probe, maxTravel: 110 },
  tuneMe: LOWRIDER_3.tuneMe.filter((k) => k !== 'tiling'),
};
delete LOWRIDER_4.tiling;

/** Adds the two LowRiders to a shop, each with a copy of the feeds the bits have at its own speed, and puts the LowRider 3 in use. */
export function useLowRider<S extends Pick<ShopProfile, 'machines' | 'activeMachineId' | 'tools'>>(shop: S): S {
  for (const machine of [LOWRIDER_3, LOWRIDER_4]) {
    if (!shop.machines.some((m) => m.id === machine.id)) shop.machines.push({ ...structuredClone(machine), feeds: lowRiderFeeds(shop.tools) });
  }
  useMachine(shop, LOWRIDER_3.id);
  return shop;
}

/**
 * The starter shop with the LowRider 3 in use and first in the list, the LowRider 4 after it, then the
 * generic CNC the app comes with. The bits carry the starter feeds at the LowRider's speed; the generic CNC
 * keeps the starter's own.
 */
export function lowRiderShop(): ShopProfile {
  const shop = createStarterShopProfile();
  const generic = shop.machines[0]!;
  generic.feeds = Object.fromEntries(shop.tools.map((t) => [t.id, { settings: JSON.parse(JSON.stringify(t.settings)) as typeof t.settings, tuneMe: true }]));
  for (const tool of shop.tools) for (const s of Object.values(tool.settings)) if (s) s.rpm = LOWRIDER_RPM;
  shop.machines = [structuredClone(LOWRIDER_3), { ...structuredClone(LOWRIDER_4), feeds: lowRiderFeeds(shop.tools) }, generic];
  shop.activeMachineId = LOWRIDER_3.id;
  return shop;
}

/** The same, as the shop a job is built with. */
export function lowRiderJobShop(): Shop {
  const { materialCatalog, materialGroups: _groups, ...shop } = lowRiderShop();
  return { ...shop, tools: withMaterialSettings(shop.tools, materialCatalog), materials: materialCatalog };
}
