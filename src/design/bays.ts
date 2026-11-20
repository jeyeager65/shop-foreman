/**
 * Bays (milestone 10): door sets and drawers side by side in one cabinet. A cabinet's layout
 * has `bays` left to right, one by default; every bay has every row of the layout, so the
 * openings are rows × bays. Between two bays stands a partition the case's thickness
 * (frameless and shop) or a mullion the frame's stile width (face frame).
 *
 * The first bay's openings keep the ids they had with one bay (`${cabinetId}/${rowId}`), so
 * the fronts on them, Plan's keys and the golden files hold; another bay's are
 * `${cabinetId}/${rowId}~b${n}`.
 */
import type { CabinetDesign, Id, Material, Mm } from '@/model';
import { postsOf, thicknessOf } from './style';

/** How many bays a cabinet may have: up to six (a closet's or a wall unit's sections). */
export const BAY_COUNT = { min: 1, max: 6 };

export const bayCount = (cabinet: Pick<CabinetDesign, 'layout'>): number => Math.max(1, cabinet.layout.bays?.length ?? 1);

/** An opening's id: bay 1's as before bays, another bay's with its number. */
export const bayOpeningId = (cabinetId: Id, rowId: Id, bay: number): Id => (bay <= 1 ? `${cabinetId}/${rowId}` : `${cabinetId}/${rowId}~b${bay}`);

/** How many drawers side by side a row has in each bay: 1, or what a drawer row behind a face frame is split into (`OpeningRow.split`). */
export const rowSplit = (cabinet: Pick<CabinetDesign, 'construction'>, row: CabinetDesign['layout']['rows'][number]): number =>
  cabinet.construction === 'faceFrame' && row.use === 'drawer' && row.split && row.split > 1 ? Math.min(SPLIT_MOST, Math.floor(row.split)) : 1;
/** The most a row may be split into. */
export const SPLIT_MOST = 3;
/** The id of one part of a split row's opening: the first is the bay's own. */
export const splitOpeningId = (bayId: Id, part: number): Id => (part <= 1 ? bayId : `${bayId}~s${part}`);

/** Every opening id of a cabinet's layout, row by row, bay by bay within a row, part by part where a row is split. */
export function layoutOpeningIds(cabinet: Pick<CabinetDesign, 'id' | 'layout' | 'construction'>): { id: Id; rowId: Id; bay: number; part: number; of: number }[] {
  const n = bayCount(cabinet);
  return cabinet.layout.rows.flatMap((row) => {
    const of = rowSplit(cabinet, row);
    return Array.from({ length: n }, (_, i) => Array.from({ length: of }, (_, k) => ({ id: splitOpeningId(bayOpeningId(cabinet.id, row.id, i + 1), k + 1), rowId: row.id, bay: i + 1, part: k + 1, of }))).flat();
  });
}

/** What stands between two bays: a mullion the frame's stile width, or a partition the case's thickness. */
export function bayDivider(cabinet: CabinetDesign, materials: Material[]): Mm {
  // Between corner posts a mullion stands edge-on: as wide as the frame's material is thick.
  const posts = postsOf(cabinet, materials);
  if (posts) return posts.rail;
  return cabinet.construction === 'faceFrame' ? cabinet.faceFrame.stileWidth.mm : thicknessOf(materials, cabinet.materials.caseId);
}

/** Each bay's clear width and its left edge, from `x0` across `width` (the openings' span with one bay). */
export function baySpans(cabinet: CabinetDesign, materials: Material[], x0: Mm, width: Mm): { x: Mm; width: Mm }[] {
  const n = bayCount(cabinet);
  if (n === 1) return [{ x: x0, width }];
  const d = bayDivider(cabinet, materials);
  const bays = cabinet.layout.bays!;
  const fixed = bays.reduce((sum, b) => sum + (b.width?.mm ?? 0), 0);
  const open = bays.filter((b) => !b.width).length;
  const left = width - (n - 1) * d - fixed;
  if (left < -0.01 || (open > 0 && left <= 0) || (open === 0 && Math.abs(left) > 0.5)) {
    throw new Error(open === 0 ? 'The bay widths do not add up to the cabinet\'s inside width: leave one of them empty.' : 'The bay widths add up to more than the cabinet has room for.');
  }
  const share = open > 0 ? left / open : 0;
  let x = x0;
  return bays.map((b) => {
    const w = b.width?.mm ?? share;
    const span = { x, width: w };
    x += w + d;
    return span;
  });
}
