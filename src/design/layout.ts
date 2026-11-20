/**
 * The layouts the Design screen offers, as rows of the stored `OpeningLayout`: a
 * preset writes its rows, and a list of rows is read back as the preset it matches.
 * The list itself stays free; nothing else knows about presets.
 */
import type { Length, OpeningLayout, OpeningRow } from '@/model';
import { len } from '@/units';

export type LayoutPreset = 'drawerOverDoors' | 'doors' | 'drawers' | 'doorsOverDoors';

export const LAYOUT_PRESETS: { value: LayoutPreset; title: string }[] = [
  { value: 'drawerOverDoors', title: 'Drawer over doors' },
  { value: 'doors', title: 'Doors only' },
  { value: 'drawers', title: 'Drawers only' },
  { value: 'doorsOverDoors', title: 'Doors over doors' },
];

/** The layouts a cabinet of a form may have. Doors over doors, with its fixed shelf, is the tall cabinet's. */
export const layoutsOf = (form: 'base' | 'wall' | 'tall'): LayoutPreset[] =>
  form === 'wall' ? ['doors'] : form === 'tall' ? ['doorsOverDoors', 'doors', 'drawerOverDoors', 'drawers'] : ['drawerOverDoors', 'doors', 'drawers'];

/** How many drawers a drawers-only cabinet may have, and how many it starts with. */
export const DRAWER_COUNT = { min: 1, max: 6, start: 3 };
/** The drawer row's height in a new drawer over doors. Tune me. */
export const DRAWER_ROW_HEIGHT = '6"';

/** The id of the n-th drawer row, counted from 1: `drawer`, `drawer-2`, ... The door row is `doors`. */
export const drawerRowId = (n: number) => (n === 1 ? 'drawer' : `drawer-${n}`);
export const DOOR_ROW_ID = 'doors';
/** The upper door row of doors over doors. The lower one is `doors`, so its doors are those of a doors-only layout. */
export const UPPER_DOOR_ROW_ID = 'doors-upper';

/** The preset a list of rows is, or nothing when it is none of them. */
export function layoutPresetOf(layout: OpeningLayout): { preset: LayoutPreset; drawers: number } | undefined {
  const uses = layout.rows.map((r) => r.use);
  if (uses.length === 1 && uses[0] === 'doors') return { preset: 'doors', drawers: 0 };
  if (uses.length === 2 && uses[0] === 'drawer' && uses[1] === 'doors') return { preset: 'drawerOverDoors', drawers: 1 };
  if (uses.length === 2 && uses[0] === 'doors' && uses[1] === 'doors') return { preset: 'doorsOverDoors', drawers: 0 };
  if (uses.length >= 1 && uses.every((u) => u === 'drawer') && layout.rows.every((r) => !r.height)) return { preset: 'drawers', drawers: uses.length };
  return undefined;
}

/**
 * The layout of a preset. Drawers only: `drawers` equal rows. Drawer over doors: the
 * drawer row keeps the height it has in `from`, or had when the layout was last a
 * drawer over doors; that height is kept while the layout is another preset, so
 * switching back re-enters nothing.
 */
export function presetLayout(preset: LayoutPreset, drawers: number = DRAWER_COUNT.start, from?: OpeningLayout): OpeningLayout {
  const was = from && layoutPresetOf(from)?.preset === 'drawerOverDoors' ? from.rows[0]!.height : undefined;
  const drawerHeight: Length | undefined = was ?? from?.kept?.drawerHeight;
  // The upper door row's shelves are kept the same way while the layout has no upper door row.
  const upperShelves = from?.rows.find((r) => r.id === UPPER_DOOR_ROW_ID)?.shelves ?? from?.kept?.upperShelves;
  /** What the new layout has no use for, kept for when it is switched back. */
  const keep = (what: NonNullable<OpeningLayout['kept']>) => (Object.values(what).some((v) => v !== undefined) ? { kept: JSON.parse(JSON.stringify(what)) as NonNullable<OpeningLayout['kept']> } : {});
  const doors: OpeningRow = { id: DOOR_ROW_ID, use: 'doors' };
  if (preset === 'doors') return { rows: [doors], ...keep({ drawerHeight, upperShelves }) };
  // Two equal door rows; the upper has the number of shelves it had.
  if (preset === 'doorsOverDoors') {
    return { rows: [{ id: UPPER_DOOR_ROW_ID, use: 'doors', ...(upperShelves !== undefined ? { shelves: upperShelves } : {}) }, doors], ...keep({ drawerHeight }) };
  }
  if (preset === 'drawerOverDoors') return { rows: [{ id: drawerRowId(1), use: 'drawer', height: drawerHeight ?? len(DRAWER_ROW_HEIGHT) }, doors], ...keep({ upperShelves }) };
  const count = Math.min(DRAWER_COUNT.max, Math.max(DRAWER_COUNT.min, Math.floor(drawers) || DRAWER_COUNT.start));
  return { rows: Array.from({ length: count }, (_, i): OpeningRow => ({ id: drawerRowId(i + 1), use: 'drawer' })), ...keep({ drawerHeight, upperShelves }) };
}
