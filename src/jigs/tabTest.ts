/**
 * A test cut for the fit of tab-and-slot joints: two small pieces from a scrap of the stock a job will be cut
 * from. One has a tab at each end, the size a
 * job's tabs are; the other a row of slots through it and a row of blind ones, each slot a little bigger than the
 * one before. The tab is tried in every slot, and the fit of the slot that suits goes into the machine's "A
 * joint's slot bigger than its tab" on the Shop profile, which every job then cuts its slots by.
 *
 * The slots are a job's own (`tabSlot`), so they are cut as a job cuts them: the same bit, a dog-bone in each
 * corner. A job adds the machine's fit to every slot; here each slot is drawn so that, with that added, it comes
 * out at its own fit whatever the machine's is now.
 */
import { TAB, tabSlot, tabbedOutline } from '@/design/tabs';
import type { Id, Mm, Part, Point, Vec3 } from '@/model';

/** How much bigger than the tab each slot of the test is, in all, from the clipped corner along the piece. */
export const TAB_TEST_FITS: Mm[] = [0, 0.1, 0.2, 0.3];
/** The least stock the test is cut in: thinner, a slot is no wider than the bit that cuts the parts out. */
export const TAB_TEST_MIN_THICKNESS: Mm = 9;
/** Wood round the slots and between them, the tab piece's body, and the corner clipped off beside the tightest slot. */
const ROOM = { margin: 20, between: 20, body: 70, shoulder: 25, clip: 12 };

export type TabTestKind = 'both' | 'through' | 'blind';
const OWNER = 'tab-test';
const UP: Vec3 = [0, 0, -1];
const RIGHT: Vec3 = [1, 0, 0];

/** How deep a blind slot's tab goes, as a job's does: 3/8", or half the stock where that is less. */
export const tabTestBlind = (thickness: Mm): Mm => Math.min(TAB.blind, thickness / 2);

export function tabTestProblems(thickness: Mm): string[] {
  if (!(thickness > 0)) return ["Choose the scrap's material."];
  return thickness < TAB_TEST_MIN_THICKNESS ? ['Tabs want stock 3/8" thick or more: in thinner stock a slot is no wider than the bit that cuts it.'] : [];
}

/**
 * The two pieces of the test. `machineFit`: what the machine that cuts it adds to every slot of a job, taken off
 * here so each slot comes out at its own fit.
 */
export function tabTestParts(materialId: Id, thickness: Mm, kind: TabTestKind, machineFit: Mm): Part[] {
  const t = thickness;
  const blind = tabTestBlind(t);
  const rows = [...(kind !== 'blind' ? ['through' as const] : []), ...(kind !== 'through' ? ['blind' as const] : [])];
  const n = TAB_TEST_FITS.length;
  const width = ROOM.margin + n * TAB.length + (n - 1) * ROOM.between + ROOM.margin;
  const height = ROOM.margin + rows.length * t + (rows.length - 1) * ROOM.between + ROOM.margin;
  // The corner beside the tightest slot is clipped off, so the piece cannot be read the wrong way round.
  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: ROOM.clip, y: height },
    { x: 0, y: height - ROOM.clip },
  ];
  const slots = rows.flatMap((row, r) =>
    TAB_TEST_FITS.map((fit, i) => {
      const grow = (fit - machineFit) / 2;
      const x0 = ROOM.margin + i * (TAB.length + ROOM.between);
      const y0 = ROOM.margin + r * (t + ROOM.between);
      return tabSlot(`test-${row}-${i + 1}`, 'A', x0 - grow, y0 - grow, x0 + TAB.length + grow, y0 + t + grow, row === 'blind' ? blind + fit - machineFit : undefined);
    }),
  );
  const slotted: Part = {
    id: `${OWNER}/slots`,
    designObjectId: OWNER,
    name: 'Slotted piece',
    materialId,
    size: { width, height, thickness: t },
    features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline }, ...slots],
    role: 'pullOut',
    shaped: true,
    placement: { origin: [0, 0, 0], xAxis: RIGHT, yAxis: UP },
  };
  // The tab piece: a through tab on its left end, as long as the stock is thick, and a blind one on its right.
  const tabHeight = TAB.length + 2 * ROOM.shoulder;
  const span = [{ from: ROOM.shoulder, to: ROOM.shoulder + TAB.length }];
  const [left, right] = [kind !== 'blind' ? t : 0, kind !== 'through' ? blind : 0];
  const tabWidth = left + ROOM.body + right;
  const tabbed: Part = {
    id: `${OWNER}/tab`,
    designObjectId: OWNER,
    name: 'Tab piece',
    materialId,
    size: { width: tabWidth, height: tabHeight, thickness: t },
    features: [
      {
        id: 'cutout',
        kind: 'cutout',
        face: 'A',
        outline: tabbedOutline(tabWidth, tabHeight, { ...(left ? { x0: { reach: left, spans: span } } : {}), ...(right ? { x1: { reach: right, spans: span } } : {}) }),
        dogBones: true,
      },
    ],
    role: 'pullOut',
    tabbed: true,
    placement: { origin: [0, 0, height + 40], xAxis: RIGHT, yAxis: UP },
  };
  return [slotted, tabbed];
}

/** The test in words, for its page. */
export function tabTestNotes(thickness: Mm, kind: TabTestKind, machineFit: Mm): string[] {
  const fits = TAB_TEST_FITS.map((f) => `${f.toFixed(1)} mm`).join(', ');
  const rows = kind === 'both' ? 'A row of slots through the piece and a row of blind ones' : kind === 'through' ? 'A row of slots through the piece' : 'A row of blind slots';
  return [
    `${rows}, each ${TAB_TEST_FITS.length} slots. From the clipped corner along, each slot is bigger than the tab by ${fits} in all, the same across and along${kind === 'through' ? '' : '; a blind one is deeper than its tab by the same'}.`,
    `The tab piece has ${kind === 'both' ? `a tab ${thickness.toFixed(1)} mm long at one end, for the slots through the piece, and one ${tabTestBlind(thickness).toFixed(1)} mm long at the other, for the blind ones` : kind === 'through' ? `a tab ${thickness.toFixed(1)} mm long, as long as the stock is thick` : `a tab ${tabTestBlind(thickness).toFixed(1)} mm long`}: ${TAB.length.toFixed(1)} mm wide, as a job's tabs are.`,
    'Try the tab in each slot, both faces up. The one to use goes in by hand or with a light tap, with room for glue, and its shoulders close on the face; a blind one must not bottom out first.',
    `Type that slot's fit into the Shop profile, Machines, "Parts on the blank", "A joint's slot bigger than its tab". This machine has ${machineFit.toFixed(2)} mm now. If the tightest is loose or the loosest tight, the stock is not the thickness the catalog says: measure it and correct that first.`,
    'Cut it from the stock the job will be cut from, with the bit that cuts its parts out: the fit goes by both.',
  ];
}
