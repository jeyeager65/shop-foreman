/**
 * Project-wide settings of the fronts. A project of designed cabinets holds how its
 * doors and drawers are made (style, edge, material, hinges, pulls; front, slide, box
 * corners and materials); a stored door set or drawer holds what is its own and,
 * under `overrides`, its own copy of all of those settings when it does not follow
 * the project. This is the one place that puts the two together. A refacing project
 * stores its fronts whole, and they pass through unchanged.
 */
import type {
  DesignObject,
  DesignedCabinetContext,
  DoorSetDesign,
  DoorSettings,
  DrawerDesign,
  DrawerSettings,
  Project,
  StoredDesignObject,
  StoredDoorSet,
  StoredDrawer,
} from '@/model';

/** A door set's settings beside its own values, and the ones inside its `mounting`. */
const DOOR_KEYS = ['style', 'outsideEdge', 'materialId', 'shop', 'shopPull', 'handle'] as const satisfies readonly (keyof DoorSettings)[];
const HINGE_KEYS = ['hingeId', 'framelessHingeId', 'shopHingeId'] as const satisfies readonly (keyof DoorSettings)[];
/** A drawer's settings beside its own values, and the ones inside its `slide` and its `box`. */
const DRAWER_KEYS = ['front', 'shop', 'handle'] as const satisfies readonly (keyof DrawerSettings)[];
const SLIDE_KEYS = ['slideId', 'faceFrameMount'] as const satisfies readonly (keyof DrawerSettings)[];
const BOX_KEYS = ['cornerJoint', 'fingers', 'materials'] as const satisfies readonly (keyof DrawerSettings)[];

type Bag = Record<string | symbol, unknown>;
const hasOwn = (o: object, key: string | symbol) => Object.prototype.hasOwnProperty.call(o, key);

/**
 * One object out of two: the keys in `sharedKeys` read, write and delete in
 * `shared()`, every other key in `own()`. `parts` are nested objects made the same
 * way; assigning one replaces its contents. A copy ({...view}, JSON) is a plain
 * object with every value; `overrides` is readable but not copied.
 */
function layered<T extends object>(own: () => object, shared: () => object, sharedKeys: readonly string[], parts: Record<string, object> = {}): T {
  const holder = (key: string | symbol) => (sharedKeys.includes(key as string) ? shared() : own()) as Bag;
  const keys = () => [
    ...new Set([
      ...Object.keys(own()).filter((k) => k !== 'overrides' && !sharedKeys.includes(k)),
      ...sharedKeys.filter((k) => (shared() as Bag)[k] !== undefined),
      ...Object.keys(parts),
    ]),
  ];
  const get = (key: string | symbol) => (hasOwn(parts, key) ? parts[key as string] : holder(key)[key]);
  return new Proxy({} as T, {
    // Vue's own markers (`__v_raw` and the like) must not reach the stored object behind the view.
    get: (_, key) => (typeof key === 'string' && key.startsWith('__v_') ? undefined : get(key)),
    set: (_, key, value: unknown) => {
      if (hasOwn(parts, key)) {
        const part = parts[key as string] as Bag;
        for (const k of Object.keys(part)) delete part[k];
        Object.assign(part, value);
      } else holder(key)[key] = value;
      return true;
    },
    deleteProperty: (_, key) => hasOwn(parts, key) || delete holder(key)[key],
    has: (_, key) => hasOwn(parts, key) || key in holder(key),
    ownKeys: keys,
    getOwnPropertyDescriptor: (_, key) => (keys().includes(key as string) ? { value: get(key), writable: true, enumerable: true, configurable: true } : undefined),
  });
}

/** Whether a stored front carries every value itself: a refacing project's, or one as it hangs. */
const isWhole = (stored: StoredDesignObject): stored is DesignObject => (stored.template === 'doorSet' ? 'style' in stored : 'front' in stored);

/**
 * The front with its settings resolved, as a view of the stored project: reading a
 * setting gives the front's own or else the project's, and writing one writes to
 * whichever it was read from. Its own values read and write the stored front.
 */
export function resolveFront(context: Pick<DesignedCabinetContext, 'fronts'>, stored: StoredDesignObject): DesignObject {
  if (isWhole(stored)) return stored;
  if (stored.template === 'doorSet') {
    const from = () => stored.overrides ?? context.fronts.doors;
    return layered<DoorSetDesign>(() => stored, from, DOOR_KEYS, { mounting: layered(() => stored.mounting, from, HINGE_KEYS) });
  }
  const from = () => stored.overrides ?? context.fronts.drawers;
  return layered<DrawerDesign>(() => stored, from, DRAWER_KEYS, {
    slide: layered(() => stored.slide, from, SLIDE_KEYS),
    box: layered(() => stored.box, from, BOX_KEYS),
  });
}

/** The project's doors and drawers, resolved. Everything that reads a front reads it from here. */
export function designsOf(project: Project): DesignObject[] {
  const context = project.context;
  return project.designObjects.map((stored) => resolveFront(context, stored));
}

/** Whether the door set or drawer has its own copy of the settings. */
export function hasOwnFrontSettings(design: Pick<DesignObject, 'overrides'>): boolean {
  return design.overrides !== undefined;
}

/**
 * Gives the door set or drawer its own copy of the settings, starting from the
 * project's, or drops its copy so it follows the project again.
 */
export function setOwnFrontSettings(project: Project, designId: string, own: boolean): void {
  const stored = project.designObjects.find((d) => d.id === designId);
  if (!stored || isWhole(stored)) throw new Error(`No front that follows the project: ${designId}`);
  if (!own) delete stored.overrides;
  // A plain copy: the project may be Vue's reactive proxy, which structuredClone refuses.
  else if (stored.template === 'doorSet') stored.overrides ??= JSON.parse(JSON.stringify(project.context.fronts.doors)) as DoorSettings;
  else stored.overrides ??= JSON.parse(JSON.stringify(project.context.fronts.drawers)) as DrawerSettings;
}

const pick = <T extends object, K extends keyof T>(from: T, keys: readonly K[]): Pick<T, K> =>
  Object.fromEntries(keys.filter((k) => from[k] !== undefined).map((k) => [k, from[k]])) as Pick<T, K>;

/**
 * A whole front taken apart: what a designed cabinet's project stores for it, and
 * the settings it carried. For projects saved before the settings were the project's.
 */
export function splitFront(whole: DoorSetDesign): { stored: StoredDoorSet; settings: DoorSettings };
export function splitFront(whole: DrawerDesign): { stored: StoredDrawer; settings: DrawerSettings };
export function splitFront(whole: DesignObject): { stored: StoredDoorSet | StoredDrawer; settings: DoorSettings | DrawerSettings };
export function splitFront(whole: DesignObject): { stored: StoredDoorSet | StoredDrawer; settings: DoorSettings | DrawerSettings } {
  const { id, template, name } = whole;
  if (whole.template === 'doorSet') {
    const mounting = Object.fromEntries(Object.entries(whole.mounting).filter(([k]) => !(HINGE_KEYS as readonly string[]).includes(k))) as StoredDoorSet['mounting'];
    return { stored: { id, template: 'doorSet', name, mounting }, settings: { ...pick(whole, DOOR_KEYS), ...pick(whole.mounting, HINGE_KEYS) } };
  }
  return {
    stored: { id, template: template as 'drawer', name, mounting: whole.mounting, slide: pick(whole.slide, ['length']), box: pick(whole.box, ['height']), ...(whole.falseFront ? { falseFront: whole.falseFront } : {}) },
    settings: { ...pick(whole, DRAWER_KEYS), ...pick(whole.slide, SLIDE_KEYS), ...pick(whole.box, BOX_KEYS) },
  };
}

/** A front setting in words, for "Differs from Setup: ...". */
const FRONT_WORDS: Record<string, string> = {
  style: 'style',
  outsideEdge: 'edge',
  materialId: 'material',
  shop: 'inset style',
  shopPull: 'pulls',
  handle: 'handle',
  hingeId: 'hinge',
  framelessHingeId: 'hinge',
  shopHingeId: 'hinge',
  front: 'front',
  slideId: 'slide',
  faceFrameMount: 'slide mounting',
  cornerJoint: 'box corners',
  materials: 'box materials',
};

/** What a door set's or drawer's own copy of the settings makes different from the project's (Setup), in words. */
export function frontDifferences(project: Project, designId: string): string[] {
  const stored = project.designObjects.find((d) => d.id === designId);
  if (!stored || isWhole(stored) || !stored.overrides) return [];
  const shared = (stored.template === 'doorSet' ? project.context.fronts.doors : project.context.fronts.drawers) as unknown as Record<string, unknown>;
  const own = stored.overrides as unknown as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(own), ...Object.keys(shared)])];
  return [...new Set(keys.filter((k) => JSON.stringify(own[k]) !== JSON.stringify(shared[k])).map((k) => FRONT_WORDS[k] ?? k))];
}
