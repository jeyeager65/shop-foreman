import type { BitSettings, Id, Length, MachineProfile, Router, ShopProfile } from '@/model';
import { DEFAULT_ROUTER, ROUTERS } from './routers';

/**
 * The machines of a shop: several, one of them in use; a machine can be copied
 * and every value of it typed on the Shop profile. The bits belong to the shop, their feeds and speeds
 * to a machine: the machine in use has its feeds on the bits themselves (`RouterBit.settings`, which is
 * what every job reads), a machine not in use keeps its own in `MachineProfile.feeds`. `useMachine`
 * swaps them.
 */

/** Where a value of a machine is shown on the Shop profile. */
export type MachineFieldGroup = 'size' | 'probe' | 'motion' | 'tabs' | 'nesting' | 'pins';

export interface MachineField {
  /** Dotted, into the machine: `probe.fastFeed`. */
  path: string;
  label: string;
  group: MachineFieldGroup;
  /** A length is typed in any unit; a feed (`mm/s` here) is kept in mm/min and typed in the shop's feed unit. */
  unit: 'length' | 'mm' | 'mm/s' | 's' | '%';
  /** May be 0. */
  zero?: boolean;
  /** The `tuneMe` key that marks it a placeholder. Typing the value takes the mark off. */
  tune?: string;
  /** What it is when the machine does not say. */
  fallback?: number;
  hint?: string;
}

export const MACHINE_GROUPS: { id: MachineFieldGroup; title: string; note?: string }[] = [
  { id: 'size', title: 'Size', note: 'X is across the gantry, Y along the table. The default sheet is the stock a job is planned on when its material names none.' },
  { id: 'probe', title: 'Probe', note: 'The touch plate that sets Z at each set-up and bit change.' },
  { id: 'motion', title: 'Heights and speeds' },
  { id: 'tabs', title: 'Holding tabs', note: 'Left under a cutout to hold the part.' },
  { id: 'nesting', title: 'Parts on the blank' },
  { id: 'pins', title: 'Flip pins', note: 'A sheet cut on both faces is turned over onto two pins.' },
];

export const MACHINE_FIELDS: MachineField[] = [
  { path: 'cuttingArea.x', label: 'Cutting area, X', group: 'size', unit: 'length' },
  { path: 'cuttingArea.y', label: 'Cutting area, Y', group: 'size', unit: 'length' },
  { path: 'defaultSheet.x', label: 'Default sheet, X', group: 'size', unit: 'length' },
  { path: 'defaultSheet.y', label: 'Default sheet, Y', group: 'size', unit: 'length' },
  { path: 'nesting.sheetTrim', label: 'Sheet shorter than nominal', group: 'size', unit: 'mm', zero: true, tune: 'nesting', fallback: 3.175, hint: 'each way, for the saw cuts' },

  { path: 'probe.plateThickness', label: 'Plate thickness', group: 'probe', unit: 'mm' },
  { path: 'probe.clearSquare', label: 'Uncut square it needs', group: 'probe', unit: 'mm' },
  { path: 'probe.edgeInset', label: 'In from the stock edge', group: 'probe', unit: 'mm', zero: true },
  { path: 'probe.fastFeed', label: 'First touch', group: 'probe', unit: 'mm/s', tune: 'probe.fastFeed' },
  { path: 'probe.slowFeed', label: 'Second touch', group: 'probe', unit: 'mm/s', zero: true, tune: 'probe.slowFeed', hint: '0: one touch only' },
  { path: 'probe.retract', label: 'Lift between touches', group: 'probe', unit: 'mm' },
  { path: 'probe.maxTravel', label: 'Travel down at most', group: 'probe', unit: 'mm' },

  { path: 'safeHeight', label: 'Safe height above the stock', group: 'motion', unit: 'mm', tune: 'safeHeight' },
  { path: 'throughExtra', label: 'Past the bottom on a through cut', group: 'motion', unit: 'mm', zero: true, tune: 'throughExtra', hint: 'into the spoilboard; 0: stop at the bottom' },
  { path: 'maxPlungeFeed', label: 'Maximum plunge feed', group: 'motion', unit: 'mm/s', tune: 'maxPlungeFeed' },
  { path: 'rapidFeed', label: 'Rapid feed', group: 'motion', unit: 'mm/s', tune: 'rapidFeed', hint: 'for time estimates only' },
  { path: 'toolChangeSeconds', label: 'Bit change time', group: 'motion', unit: 's', zero: true, tune: 'toolChangeSeconds', hint: 'for time estimates only' },

  { path: 'tabs.width', label: 'Width', group: 'tabs', unit: 'mm', tune: 'tabs' },
  { path: 'tabs.heightPercent', label: "Height, of the stock's thickness", group: 'tabs', unit: '%', tune: 'tabs', fallback: 40, hint: '30 to 50 is usual' },
  { path: 'tabs.maxSpacing', label: 'Spacing', group: 'tabs', unit: 'mm', tune: 'tabs', hint: 'a side longer than this gets a tab of its own' },
  { path: 'tabs.fromCorner', label: 'Clear of a corner', group: 'tabs', unit: 'mm', zero: true, tune: 'tabs', fallback: 25, hint: 'a side too short for it gets no tab' },

  { path: 'nesting.partSpacing', label: 'Between parts', group: 'nesting', unit: 'mm', tune: 'nesting' },
  { path: 'nesting.edgeMargin', label: 'Waste kept around the parts', group: 'nesting', unit: 'mm', zero: true, tune: 'nesting', fallback: 20, hint: 'sets the smallest stock' },
  { path: 'tabFit', label: "A joint's slot bigger than its tab", group: 'nesting', unit: 'mm', zero: true, tune: 'tabFit', fallback: 0.15, hint: 'tab-and-slot joints: in all, each way' },
  { path: 'nesting.pinInset', label: 'Pins in from the blank\'s ends', group: 'nesting', unit: 'mm', tune: 'nesting' },

  { path: 'flipPins.diameter', label: 'Pin diameter', group: 'pins', unit: 'length' },
  { path: 'flipPins.holeClearance', label: 'Hole bigger than the pin', group: 'pins', unit: 'mm', zero: true },
  { path: 'flipPins.spoilboardDepth', label: 'Into the spoilboard', group: 'pins', unit: 'mm' },
];

type Bag = Record<string, unknown>;

/** A value of a machine by its field: a `Length`, or a number as it is stored (a feed in mm/min). */
export function machineValue(machine: MachineProfile, field: MachineField): Length | number | undefined {
  let at: unknown = machine;
  for (const key of field.path.split('.')) at = (at as Bag | undefined)?.[key];
  return (at as Length | number | undefined) ?? field.fallback;
}

/** Whether a field of a machine still holds a placeholder. */
export function machineFieldTune(machine: MachineProfile, field: MachineField): boolean {
  return field.tune !== undefined && machine.tuneMe.includes(field.tune);
}

/**
 * Sets a value of a machine, when it can be one: a length or a number above 0 (0 where the field takes
 * it), as it is stored (a feed in mm/min). The value is then no longer a placeholder, once every field
 * under its "tune me" mark has been typed. Returns false when nothing was set.
 */
export function setMachineValue(machine: MachineProfile, field: MachineField, value: Length | number): boolean {
  const n = typeof value === 'number' ? value : value?.mm;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || (n === 0 && !field.zero)) return false;
  if ((field.unit === 'length') !== (typeof value !== 'number')) return false;
  const keys = field.path.split('.');
  let at = machine as unknown as Bag;
  for (const key of keys.slice(0, -1)) at = at[key] as Bag;
  at[keys.at(-1)!] = value;
  if (field.tune) machine.tuneMe = machine.tuneMe.filter((k) => k !== field.tune);
  return true;
}

/**
 * Whether a sheet longer than the cutting area may hang over the table's ends and be cut in two set-ups
 * (tiling), and how long a sheet at most. Turned on, it starts at the cutting area's length.
 */
export function setMachineTiling(machine: MachineProfile, maxLength: Length | null): void {
  if (maxLength) machine.tiling = { maxLength };
  else delete machine.tiling;
  machine.tuneMe = machine.tuneMe.filter((k) => k !== 'tiling');
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The machine a project is planned on: the one it names when the shop has it, else the shop's machine
 * in use.
 */
export function projectMachineId(project: { machineId?: Id } | null | undefined, shop: Pick<ShopProfile, 'machines' | 'activeMachineId'>): Id {
  return project?.machineId && shop.machines.some((m) => m.id === project.machineId) ? project.machineId : shop.activeMachineId;
}

/** Whether a project names a machine the shop no longer has: it is then planned on the one in use, and its Setup says so. */
export function projectMachineGone(project: { machineId?: Id } | null | undefined, shop: Pick<ShopProfile, 'machines'>): boolean {
  return !!project?.machineId && !shop.machines.some((m) => m.id === project.machineId);
}

/**
 * The shop's bits with the feeds and speeds of one of its machines, whichever is in use: the bits as
 * they are for the machine in use, and for another its own feeds (`MachineProfile.feeds`) in their
 * place. A bit that machine has no feeds for (one added since) cuts on the feeds it has, marked "tune
 * me". Nothing in the shop is changed.
 */
export function toolsOnMachine<T extends Pick<ShopProfile, 'machines' | 'activeMachineId' | 'tools'>>(shop: T, machineId: Id): T['tools'] {
  const feeds = machineId === shop.activeMachineId ? undefined : shop.machines.find((m) => m.id === machineId)?.feeds;
  if (!feeds) return shop.tools;
  return shop.tools.map((tool) => {
    const mine = feeds[tool.id];
    const tuneMe = tool.tuneMe.filter((k) => k !== 'settings');
    if (!mine || mine.tuneMe) tuneMe.unshift('settings');
    return { ...tool, settings: mine ? mine.settings : tool.settings, tuneMe };
  });
}

/** The feeds of the shop's bits as they stand: what the machine in use cuts on. */
function feedsOnBits(shop: Pick<ShopProfile, 'tools'>): NonNullable<MachineProfile['feeds']> {
  return Object.fromEntries(shop.tools.map((t) => [t.id, { settings: clone(t.settings) as Record<Id, BitSettings>, tuneMe: t.tuneMe.includes('settings') }]));
}

/**
 * Makes another machine the one in use. The bits' feeds go back to the machine that was, and the
 * bits take this machine's. A bit this machine has no feeds for (one added since) starts on a copy of
 * the feeds it had, marked "tune me". Returns false when it is in use already or is not in the shop.
 */
export function useMachine(shop: Pick<ShopProfile, 'machines' | 'activeMachineId' | 'tools'>, id: Id): boolean {
  const to = shop.machines.find((m) => m.id === id);
  if (!to || id === shop.activeMachineId) return false;
  const from = shop.machines.find((m) => m.id === shop.activeMachineId);
  if (from) from.feeds = feedsOnBits(shop);
  for (const tool of shop.tools) {
    const mine = to.feeds?.[tool.id];
    if (mine) tool.settings = clone(mine.settings);
    const tune = mine ? mine.tuneMe : true;
    tool.tuneMe = tool.tuneMe.filter((k) => k !== 'settings');
    if (tune) tool.tuneMe.unshift('settings');
  }
  delete to.feeds;
  shop.activeMachineId = id;
  return true;
}

/** An id for a machine of the user's own that no machine of the shop has. */
function freeMachineId(machines: MachineProfile[]): Id {
  let n = 1;
  while (machines.some((m) => m.id === `machine-own-${n}`)) n++;
  return `machine-own-${n}`;
}

/**
 * Another machine like this one, after it in the shop, with a copy of its feeds for every bit: to
 * describe a second machine by changing what differs. It is not put in use. Returns the copy.
 */
export function copyMachine(shop: Pick<ShopProfile, 'machines' | 'activeMachineId' | 'tools'>, id: Id): MachineProfile | undefined {
  const machine = shop.machines.find((m) => m.id === id);
  if (!machine) return undefined;
  const copy: MachineProfile = {
    ...clone(machine),
    id: freeMachineId(shop.machines),
    name: `${machine.name} (copy)`,
    feeds: id === shop.activeMachineId ? feedsOnBits(shop) : clone(machine.feeds ?? {}),
  };
  shop.machines.splice(shop.machines.indexOf(machine) + 1, 0, copy);
  return copy;
}

/**
 * Takes a machine out of the shop, with its feeds. The last one stays. Taking out the machine in use
 * puts the first of the others in use. Returns false when nothing was removed.
 */
export function removeMachine(shop: Pick<ShopProfile, 'machines' | 'activeMachineId' | 'tools'>, id: Id): boolean {
  if (shop.machines.length < 2 || !shop.machines.some((m) => m.id === id)) return false;
  if (id === shop.activeMachineId) useMachine(shop, shop.machines.find((m) => m.id !== id)!.id);
  shop.machines = shop.machines.filter((m) => m.id !== id);
  return true;
}

/**
 * A machine's router is its own: a name and what each mark on its speed dial
 * gives, both typed. The routers that come with the app (`ROUTERS`) are presets to start it from.
 */

/** The machine's router, given one (a copy of the usual one) when it has none: to change it. */
function ownRouter(machine: MachineProfile): Router {
  machine.router ??= clone(DEFAULT_ROUTER);
  return machine.router;
}

/** A router that was typed over is no longer the preset it started as. */
function typed(router: Router): void {
  router.id = 'router-own';
  delete router.source;
}

/** The preset a machine's router still is: the same name and the same speeds. None once either was typed over. */
export function routerPresetId(router: Router | undefined): Id | undefined {
  if (!router) return undefined;
  const same = (preset: Router) => preset.name === router.name && preset.speeds.length === router.speeds.length && preset.speeds.every((p, i) => p.dial === router.speeds[i]!.dial && p.rpm === router.speeds[i]!.rpm);
  return ROUTERS.find(same)?.id;
}

/** Starts a machine's router from a preset: its name and its dial speeds. Returns false when there is no such preset. */
export function setRouterPreset(machine: MachineProfile, presetId: Id): boolean {
  const preset = ROUTERS.find((r) => r.id === presetId);
  if (!preset) return false;
  machine.router = clone(preset);
  return true;
}

/** Names a machine's router. An empty name is not taken. */
export function setRouterName(machine: MachineProfile, name: string): boolean {
  const text = name.trim();
  if (!text) return false;
  const router = ownRouter(machine);
  if (router.name === text) return true;
  router.name = text;
  typed(router);
  return true;
}

/**
 * Sets what a mark on the dial gives, in RPM. The speeds rise with the dial (settings between marks are
 * read off the line between them), so one that is not above the mark before it and below the mark after
 * is not taken. Returns false when nothing was set.
 */
export function setRouterSpeed(machine: MachineProfile, index: number, rpm: number): boolean {
  const router = ownRouter(machine);
  const mark = router.speeds[index];
  if (!mark || !Number.isFinite(rpm) || rpm <= 0) return false;
  const before = router.speeds[index - 1]?.rpm ?? 0;
  const after = router.speeds[index + 1]?.rpm ?? Infinity;
  if (rpm <= before || rpm >= after) return false;
  if (mark.rpm === rpm) return true;
  mark.rpm = rpm;
  typed(router);
  return true;
}

/** Another mark at the top of the dial, as far above the last as the last is above the one before. */
export function addRouterMark(machine: MachineProfile): void {
  const router = ownRouter(machine);
  const last = router.speeds.at(-1)!;
  const before = router.speeds.at(-2);
  router.speeds.push({ dial: last.dial + (before ? last.dial - before.dial : 1), rpm: last.rpm + (before ? last.rpm - before.rpm : 4000) });
  typed(router);
}

/** Takes the top mark off the dial. Two stay: a dial needs a low and a high. Returns false when nothing was removed. */
export function removeRouterMark(machine: MachineProfile): boolean {
  const router = ownRouter(machine);
  if (router.speeds.length <= 2) return false;
  router.speeds.pop();
  typed(router);
  return true;
}
