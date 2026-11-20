/**
 * Furniture: a shelf too long to carry books, and a piece that wants fastening to the wall.
 */
import type { CabinetDesign, DesignObject, DrawerDesign, Hardware, Material, Mm } from '@/model';
import { MM_PER_INCH } from '@/units';
import { bayCount } from './bays';
import { fixedShelfTops } from './case';
import { hasPartitions } from './partitions';
import { slideFor } from './slides';
import { thicknessOf } from './style';

/**
 * How far a shelf may span between what carries it before it sags under books: about 32" for a 3/4" plywood or
 * solid wood shelf, in proportion to its thickness; MDF and hardboard, which creep, four fifths of that. Tune me.
 */
export const SHELF_SPAN = { at19: 32 * MM_PER_INCH, weak: 0.8 };
const WEAK_GROUPS = ['mdf', 'hardboard', 'osb'];

/** The longest a shelf of the case's material should span, and the span its shelves have (between the sides, or across a bay). */
export function shelfSpan(cabinet: CabinetDesign, materials: Material[]): { span: Mm; limit: Mm; thickness: Mm; material: string } {
  const material = materials.find((m) => m.id === cabinet.materials.caseId);
  const t = thicknessOf(materials, cabinet.materials.caseId);
  // Behind a face frame's mullions there may be nothing (its partitions turned off): the shelves then run the full width.
  const bays = hasPartitions(cabinet) ? bayCount(cabinet) : 1;
  const span = (cabinet.size.width.mm - 2 * t - (bays - 1) * t) / bays;
  const weak = !!material && WEAK_GROUPS.some((g) => material.groupId === g || material.id.startsWith(g));
  return { span, limit: SHELF_SPAN.at19 * (t / 19.05) * (weak ? SHELF_SPAN.weak : 1), thickness: t, material: material?.name ?? 'the case material' };
}

/** Whether the case has a shelf at all: loose ones behind a row of doors (or in an open row), or a fixed one. */
export function hasShelves(cabinet: CabinetDesign, materials: Material[]): boolean {
  if (cabinet.existing || cabinet.corner?.kind === 'diagonal' || cabinet.corner?.kind === 'lShaped') return false;
  const doorRows = cabinet.layout.rows.filter((r) => r.use === 'doors');
  if (!doorRows.length) return false;
  return cabinet.adjustableShelves > 0 || doorRows.some((r) => (r.shelves ?? 0) > 0) || fixedShelfTops(cabinet, materials).length > 0;
}

/**
 * What to say of a case whose shelves are too long for their thickness: nothing when they are not, or
 * when it has none. `length` writes a size as the screen shows sizes.
 */
export function shelfWarnings(cabinet: CabinetDesign, materials: Material[], length: (mm: Mm) => string): string[] {
  if (!hasShelves(cabinet, materials)) return [];
  const { span, limit, thickness, material } = shelfSpan(cabinet, materials);
  if (span <= limit + 0.5) return [];
  return [
    `Its shelves span ${length(span)}: more than about ${length(limit)}, which is as far as ${length(thickness)} ${material} carries a row of books without sagging (tune me). ${cabinet.construction === 'faceFrame' && bayCount(cabinet) > 1 ? 'Put a partition behind each mullion (Openings), make it narrower' : 'Make it narrower, give it bays side by side'}, or a thicker case material.`,
  ];
}

/**
 * Whether a piece wants an anti-tip strap to the wall: one that stands on its own and is tall, or has
 * two drawers or more under a top of its own or a top panel (a dresser, a night stand): pulled out, loaded
 * drawers can tip it. Cabinets in a run are screwed to each other and the wall, and a base cabinet under a
 * countertop is held by it.
 */
export function needsAntiTip(cabinet: CabinetDesign): boolean {
  if (cabinet.runId || cabinet.existing || cabinet.form === 'wall') return false;
  if (cabinet.form === 'tall') return true;
  const drawers = cabinet.layout.rows.filter((r) => r.use === 'drawer').length;
  return drawers >= 2 && (cabinet.caseTop === 'panel' || !!cabinet.top?.own);
}

/**
 * What to say of a piece that can tip whose drawers come right out (full extension slides let loaded drawers tip
 * it): nothing when every drawer is on a slide that stops at three quarters, or
 * when the piece is held (`needsAntiTip`). A slide that does not say how far it opens is taken to open fully.
 * `designs`: the project's doors and drawers, resolved (`designsOf`).
 */
export function tipWarnings(cabinet: CabinetDesign, designs: DesignObject[], hardware: Hardware[]): string[] {
  if (!needsAntiTip(cabinet)) return [];
  const drawers = designs.filter((d): d is DrawerDesign => d.template === 'drawer' && d.mounting.openingId.startsWith(`${cabinet.id}/`));
  const full = drawers.filter((d) => {
    try {
      return slideFor(d, hardware).extension !== 'threeQuarter';
    } catch {
      return false;
    }
  });
  if (!full.length) return [];
  return [
    `${full.length === 1 ? 'A drawer comes' : 'Its drawers come'} right out on full-extension slides: with several open and loaded, a piece that stands on its own can tip forward. Fasten it to the wall with the anti-tip strap on the hardware list, or put the drawers on slides that open three quarters, which keep more of the load over the case.`,
  ];
}
