/**
 * Project-wide settings. The project holds how its cabinets are built (style,
 * materials, joinery, toe kick, shelf pin); a stored cabinet holds what is its own
 * and, under `overrides`, the settings it has made different. This is the one place
 * that puts the two together.
 */
import type { CabinetDesign, CabinetOwn, CabinetSettings, DesignedCabinetContext, Length, Material, Project, StoredCabinet, StoredFrame, StoredPiece } from '@/model';
import { ASSUMED_DEPTH, ASSUMED_WALL_DEPTH, EXISTING_JOINERY, existingStandIn, shownInInches } from './existing';
import { runOf, runSides } from './runs';

/** Every project-wide setting, by its key. */
export const SETTING_KEYS = ['construction', 'materials', 'faceFrame', 'frameless', 'shop', 'joinery', 'toeKick', 'shelfPinId', 'hanging'] as const satisfies readonly (keyof CabinetSettings)[];
export type SettingKey = (typeof SETTING_KEYS)[number];

/** What only some cabinets have: left out of a copy of the view when the cabinet has none. */
const OPTIONAL_OWN_KEYS = ['offFloor', 'placement', 'corner', 'top', 'backFiller', 'topSupport', 'inside', 'sink', 'existing', 'frameOverhang', 'insideFinish', 'caseTop', 'noBack', 'noBottom', 'cables', 'hub', 'rod', 'spans', 'onTop'] as const satisfies readonly (keyof CabinetOwn)[];
const OWN_KEYS = ['id', 'name', 'form', 'size', 'sides', 'adjustableShelves', 'layout', 'quantity'] as const satisfies readonly (keyof CabinetOwn)[];

/**
 * The settings that go together on the Design screen: a cabinet makes a whole group
 * its own or follows the project for all of it. The style goes with its values, so
 * a cabinet in another style has that style's numbers too.
 */
export const SETTING_GROUPS = {
  construction: ['construction', 'faceFrame', 'frameless', 'shop', 'toeKick'],
  caseAndJoinery: ['materials', 'joinery', 'shelfPinId', 'hanging'],
} as const satisfies Record<string, readonly SettingKey[]>;
export type SettingGroup = keyof typeof SETTING_GROUPS;

const isOwn = (stored: StoredCabinet, key: SettingKey) => stored.overrides?.[key] !== undefined;

/**
 * The cabinet with its settings resolved, as a view of the stored project: reading a
 * setting gives the cabinet's own or else the project's, and writing one writes to
 * whichever it was read from. Its own values read and write the stored cabinet. The
 * nested objects are the stored ones, so `cabinet.joinery.case = 'dado'` lands in the
 * same place as `cabinet.joinery = {...}`.
 *
 * An existing case (`stored.existing`) is measured, not designed: its size, its style, its face frame's
 * widths, its joints and its toe kick are worked out from the measurements (`existingStandIn`, with the
 * thicknesses of `materials`) and cannot be written; its own and its run's are kept, unused.
 */
export function resolveCabinet(context: DesignedCabinetContext, stored: StoredCabinet, materials: Material[] = []): CabinetDesign {
  const view = {};
  const standIn = () => {
    const existing = stored.existing;
    if (!existing) return undefined;
    const ids = stored.overrides?.materials ?? context.settings.materials;
    const thick = (id: string) => materials.find((m) => m.id === id)?.measuredThickness.mm ?? 0;
    // A wall cabinet stands on nothing: its box starts at its bottom.
    const wall = stored.form === 'wall';
    return existingStandIn(existing, thick(ids.caseId), thick(ids.backId), wall ? 0 : context.settings.toeKick.height.mm, wall ? ASSUMED_WALL_DEPTH : ASSUMED_DEPTH);
  };
  const at = <T extends object>(holder: () => T, key: keyof T) => ({
    enumerable: true,
    get: () => holder()[key],
    set: (value: T[keyof T]) => {
      holder()[key] = value;
    },
  });
  // In a run the depth, the height (per form) and the toe kick are the run's, the sides
  // come from where the cabinet stands in it, and it is made once. Its own are kept, stored.
  const run = () => runOf(context, stored.id);
  const size = {};
  /** A size of the case: an existing one's is worked out, and writing it does nothing. */
  const sized = (key: 'width' | 'height' | 'depth', get: () => Length, set: (value: Length) => void) => ({
    enumerable: true,
    get: () => {
      const measured = standIn();
      return measured ? shownInInches(measured[key]) : get();
    },
    set: (value: Length) => {
      if (!stored.existing) set(value);
    },
  });
  Object.defineProperty(size, 'width', sized('width', () => stored.size.width, (value) => void (stored.size.width = value)));
  Object.defineProperty(size, 'depth', sized('depth', () => (run()?.shared ?? stored.size).depth, (value) => void ((run()?.shared ?? stored.size).depth = value)));
  Object.defineProperty(
    size,
    'height',
    sized(
      'height',
      () => run()?.shared.heights[stored.form] ?? stored.size.height,
      (value) => {
      const shared = run()?.shared;
      if (shared) shared.heights[stored.form] = value;
      else stored.size.height = value;
      },
    ),
  );
  for (const key of OWN_KEYS) {
    if (key === 'size') Object.defineProperty(view, key, { enumerable: true, get: () => size, set: (value: CabinetOwn['size']) => Object.assign(size, value) });
    else if (key === 'sides') Object.defineProperty(view, key, { enumerable: true, get: () => (run() ? runSides(context, run()!).get(stored.id)! : stored.sides), set: (value: CabinetOwn['sides']) => void (stored.sides = value) });
    // An existing case's drawer openings are measured: each drawer row has its measured height, and the lowest row what is left, which is its opening's.
    else if (key === 'layout')
      Object.defineProperty(view, key, {
        enumerable: true,
        get: () => {
          const drawers = stored.existing?.drawers;
          if (!stored.existing) return stored.layout;
          const last = stored.layout.rows.length - 1;
          return { ...stored.layout, rows: stored.layout.rows.map((row, i) => (i < last && drawers?.[i] ? { ...row, height: drawers[i]!.height } : i === last ? { id: row.id, use: row.use, ...(row.shelves !== undefined ? { shelves: row.shelves } : {}) } : row)) };
        },
        set: (value: CabinetOwn['layout']) => void (stored.layout = value),
      });
    else if (key === 'quantity') Object.defineProperty(view, key, { enumerable: true, get: () => (run() ? 1 : stored.quantity), set: (value: number) => void (stored.quantity = value) });
    else Object.defineProperty(view, key, at(() => stored, key));
  }
  Object.defineProperty(view, 'runId', { enumerable: false, get: () => run()?.id });
  Object.defineProperty(view, 'kind', { enumerable: false, get: () => stored.kind });
  for (const key of OPTIONAL_OWN_KEYS) Object.defineProperty(view, key, { ...at(() => stored, key), enumerable: stored[key] !== undefined, configurable: true });
  /** What an existing case has in place of a setting: worked out from its measurements, a new copy at every read. */
  const measured = (key: SettingKey): CabinetSettings[SettingKey] | undefined => {
    const existing = stored.existing;
    // A case with corner posts is a face frame's, whatever the project's cabinets are (`postsOf`).
    if (!existing && key === 'construction' && stored.form !== 'wall' && !stored.corner && ((run()?.shared ?? context.settings).toeKick ?? context.settings.toeKick).legs?.posts) return 'faceFrame';
    if (!existing) return undefined;
    if (key === 'construction') return existing.frame;
    if (key === 'joinery') return { ...EXISTING_JOINERY };
    // The project's toe kick, always there: a flat bottom or casters are a made cabinet's.
    if (key === 'toeKick') return { height: context.settings.toeKick.height, depth: context.settings.toeKick.depth };
    if (key === 'faceFrame') {
      const { stile, rail } = standIn()!;
      return { stileWidth: shownInInches(stile), railWidth: shownInInches(rail), materialId: (stored.overrides?.faceFrame ?? context.settings.faceFrame).materialId };
    }
    return undefined;
  };
  for (const key of SETTING_KEYS) {
    const holder = (): Partial<CabinetSettings> => (key === 'toeKick' && run() ? run()!.shared : isOwn(stored, key) ? stored.overrides! : context.settings);
    Object.defineProperty(view, key, {
      enumerable: true,
      get: () => measured(key) ?? holder()[key],
      set: (value: CabinetSettings[SettingKey]) => {
        // An existing case's style is face frame or frameless, a measurement; its other worked-out settings are not written.
        if (stored.existing && key === 'construction') stored.existing.frame = value === 'faceFrame' ? 'faceFrame' : 'frameless';
        else if (measured(key) === undefined) (holder() as Record<SettingKey, unknown>)[key] = value;
      },
    });
  }
  // An existing case that is a blind corner cabinet: its corner is worked out from what was measured, never the stored one.
  Object.defineProperty(view, 'corner', {
    enumerable: stored.corner !== undefined || !!stored.existing?.blind,
    get: () => {
      const blind = stored.existing?.blind;
      if (!stored.existing) return stored.corner;
      if (!blind) return undefined;
      const ids = stored.overrides?.materials ?? context.settings.materials;
      const side = materials.find((m) => m.id === ids.caseId)?.measuredThickness.mm ?? 0;
      return { kind: 'blind' as const, side: blind.side, blind: shownInInches(blind.reach.mm + side), filler: shownInInches(0) };
    },
    set: (value: CabinetOwn['corner']) => {
      if (!stored.existing) stored.corner = value;
    },
  });
  // Not enumerable: a copy of the view ({...cabinet}, JSON) is a plain cabinet with every setting filled in.
  Object.defineProperty(view, 'overrides', { enumerable: false, get: () => stored.overrides });
  return view as CabinetDesign;
}

/** The cabinets designed in the project, resolved; none when it refaces an existing one. */
export function cabinetsOf(project: Project): CabinetDesign[] {
  const context = project.context;
  return context.kind === 'designedCabinet' ? storedCases(context).map((stored) => resolveCabinet(context, stored, project.materials)) : [];
}

/** The stored pieces that are cases (cabinets), in the project's order. */
export function storedCases(context: Pick<DesignedCabinetContext, 'pieces'>): StoredCabinet[] {
  return context.pieces.filter((p): p is StoredCabinet => p.kind === 'case');
}

/** The stored pieces that are frames (tables), in the project's order. */
export function framesOf(project: Project): StoredFrame[] {
  return project.context.kind === 'designedCabinet' ? project.context.pieces.filter((p): p is StoredFrame => p.kind === 'frame') : [];
}

/** Every piece of the project as it is stored, of any kind: what tags, copies, batches and the lists count. */
export function piecesOf(project: Project): StoredPiece[] {
  return project.context.kind === 'designedCabinet' ? project.context.pieces : [];
}

function storedCabinet(project: Project, cabinetId: string): { context: DesignedCabinetContext; stored: StoredCabinet } {
  const stored = project.context.kind === 'designedCabinet' ? storedCases(project.context).find((c) => c.id === cabinetId) : undefined;
  if (project.context.kind !== 'designedCabinet' || !stored) throw new Error(`Cabinet not found: ${cabinetId}`);
  return { context: project.context, stored };
}

/** Whether the cabinet has its own copy of this group of settings. */
export function hasOwnSettings(cabinet: Pick<CabinetDesign, 'overrides'>, group: SettingGroup): boolean {
  return SETTING_GROUPS[group].some((key) => cabinet.overrides?.[key] !== undefined);
}

/**
 * Gives the cabinet its own copy of a group of settings, starting from the
 * project's, or drops its copy so it follows the project again.
 */
export function setOwnSettings(project: Project, cabinetId: string, group: SettingGroup, own: boolean): void {
  const { context, stored } = storedCabinet(project, cabinetId);
  const overrides: Partial<Record<SettingKey, unknown>> = { ...stored.overrides };
  for (const key of SETTING_GROUPS[group]) {
    // A plain copy: the project may be Vue's reactive proxy, which structuredClone refuses.
    if (!own) delete overrides[key];
    else if (overrides[key] === undefined) overrides[key] = JSON.parse(JSON.stringify(context.settings[key]));
  }
  if (Object.keys(overrides).length) stored.overrides = overrides as Partial<CabinetSettings>;
  else delete stored.overrides;
}

/** A setting in words, for "Differs from Setup: ...". */
const SETTING_WORDS: Record<SettingKey, string> = {
  construction: 'construction style',
  materials: 'materials',
  faceFrame: 'face frame',
  frameless: 'reveal and gaps',
  shop: 'gap around the fronts',
  joinery: 'joinery',
  toeKick: 'toe kick',
  shelfPinId: 'shelf pin',
  hanging: 'how it hangs',
};

/**
 * What a cabinet's own settings make different from the project's (Setup), in words:
 * only the settings of its own copy whose values differ, so a copy made and not yet
 * changed names nothing. A face frame's or frameless numbers count only in that style.
 */
export function cabinetDifferences(project: Project, cabinetId: string): string[] {
  const { context, stored } = storedCabinet(project, cabinetId);
  const style = stored.overrides?.construction ?? context.settings.construction;
  const counts = (key: SettingKey) => (key === 'faceFrame' ? style === 'faceFrame' : key === 'frameless' ? style === 'frameless' : key === 'shop' ? style === 'shop' : true);
  return SETTING_KEYS.filter((key) => counts(key) && stored.overrides?.[key] !== undefined && JSON.stringify(stored.overrides[key]) !== JSON.stringify(context.settings[key])).map((key) => SETTING_WORDS[key]);
}
