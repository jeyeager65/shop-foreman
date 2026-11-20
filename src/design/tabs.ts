/**
 * Tab-and-slot joints cut on the CNC: a part's end has tabs in
 * its outline and the part it meets has a slot for each. Through: the slot goes through the part and the tab's
 * end shows on its outside face, flush or standing a little proud. Blind: the slot is a pocket in the inside
 * face and nothing shows outside. Glued; no screws.
 *
 * Where the tabs are along a joint is worked out here once, from the joint's length, so both parts agree.
 */
import type { CabinetDesign, Feature, Mm, Part, PartEdge, Point, Polygon, TabSize } from '@/model';
import { MM_PER_INCH } from '@/units';
import { rect } from './doors';

/** A tab's length along its joint, the most between two tabs, and how deep a blind slot is at most. Tune me. */
export const TAB = { length: 2 * MM_PER_INCH, between: 6 * MM_PER_INCH, blind: (3 * MM_PER_INCH) / 8 };

/** From..to along a joint. */
export interface TabSpan {
  from: Mm;
  to: Mm;
}

/** How a cabinet's tabs are made: blind or through, and how far a through tab stands proud of the outside face. */
export function tabsOf(cabinet: Pick<CabinetDesign, 'joinery'>): { blind: boolean; proud: Mm } {
  const tabs = cabinet.joinery.tabs;
  return { blind: !!tabs?.blind, proud: tabs?.blind ? 0 : Math.max(0, tabs?.proud?.mm ?? 0) };
}

/**
 * How far a tab reaches into a part `thickness` thick: through it (and proud of it, where the far face is an
 * outside one), or into a blind slot no deeper than half of it.
 */
export function tabReach(cabinet: Pick<CabinetDesign, 'joinery'>, thickness: Mm, outside = true): Mm {
  const { blind, proud } = tabsOf(cabinet);
  return blind ? Math.min(TAB.blind, thickness / 2) : thickness + (outside ? proud : 0);
}

/** A joint's tabs in mm: how long each is along the joint, and the most between two. */
export interface TabSizes {
  length: Mm;
  between: Mm;
}

/** What a tab's size may be: no shorter than a slot a 1/4" bit can cut with its dog-bones, no longer than 6"; at least 1/4" between two. */
export const TAB_LIMITS = { least: (3 * MM_PER_INCH) / 8, most: 6 * MM_PER_INCH, betweenLeast: MM_PER_INCH / 4 };

/** The size of a joint's tabs: what is set (a case's `joinery.tabs`, a drawer box's `fingers`), within the limits, or the usual. */
export function tabSizeOf(set?: TabSize): TabSizes {
  return {
    length: Math.min(TAB_LIMITS.most, Math.max(TAB_LIMITS.least, set?.length?.mm ?? TAB.length)),
    between: Math.max(TAB_LIMITS.betweenLeast, set?.between?.mm ?? TAB.between),
  };
}

/** How many tabs a joint this long has. */
const tabCount = (length: Mm, size: TabSizes) => Math.max(1, Math.floor((length + size.between) / (size.length + size.between)));

/**
 * Where the tabs are along a joint `length` long: evenly spaced, each in the middle of its share of the joint, so
 * the two ends are alike and a tab is never at a corner. A short joint (a stretcher's end) has one.
 */
export function tabSpans(length: Mm, size: TabSizes = TAB): TabSpan[] {
  const n = tabCount(length, size);
  const pitch = length / n;
  const tab = Math.min(size.length, length / 2);
  return Array.from({ length: n }, (_, i) => ({ from: (i + 0.5) * pitch - tab / 2, to: (i + 0.5) * pitch + tab / 2 }));
}

/**
 * The tabs of a second part that meets the same part from its other face at the same place (the fixed shelves of
 * two bays, either side of a partition): half-way between the first one's, so the two never want one slot.
 * None where the joint is too short for two tabs of the first.
 */
export function tabSpansBetween(length: Mm, size: TabSizes = TAB): TabSpan[] {
  const n = tabCount(length, size);
  const pitch = length / n;
  return Array.from({ length: n - 1 }, (_, i) => ({ from: (i + 1) * pitch - size.length / 2, to: (i + 1) * pitch + size.length / 2 }));
}

/** An edge of a part with tabs: how far they stand out from the part's body, and where they are along the edge. */
export interface TabbedEdge {
  reach: Mm;
  spans: TabSpan[];
}

/**
 * A rectangular part's outline with tabs on some of its edges. `width` and `height` are the part's size over its
 * tabs; an edge with tabs has its body `reach` in from that. Spans are in the part's own x (for `y0`, `y1`) or y
 * (for `x0`, `x1`), and lie clear of the body's corners. `top`: more points along the top edge, from right to
 * left (a drawer front's finger notch).
 */
export function tabbedOutline(width: Mm, height: Mm, edges: Partial<Record<PartEdge, TabbedEdge>>, top: Polygon = []): Polygon {
  const [x0, x1] = [edges.x0?.reach ?? 0, width - (edges.x1?.reach ?? 0)];
  const [y0, y1] = [edges.y0?.reach ?? 0, height - (edges.y1?.reach ?? 0)];
  const up = (spans: TabSpan[] = []) => [...spans].sort((a, b) => a.from - b.from);
  const down = (spans: TabSpan[] = []) => up(spans).reverse();
  const out: Polygon = [{ x: x0, y: y0 }];
  for (const s of up(edges.y0?.spans)) out.push({ x: s.from, y: y0 }, { x: s.from, y: 0 }, { x: s.to, y: 0 }, { x: s.to, y: y0 });
  out.push({ x: x1, y: y0 });
  for (const s of up(edges.x1?.spans)) out.push({ x: x1, y: s.from }, { x: width, y: s.from }, { x: width, y: s.to }, { x: x1, y: s.to });
  out.push({ x: x1, y: y1 });
  for (const s of down(edges.y1?.spans)) out.push({ x: s.to, y: y1 }, { x: s.to, y: height }, { x: s.from, y: height }, { x: s.from, y: y1 });
  out.push(...top, { x: x0, y: y1 });
  for (const s of down(edges.x0?.spans)) out.push({ x: x0, y: s.to }, { x: 0, y: s.to }, { x: 0, y: s.from }, { x: x0, y: s.from });
  return out;
}

/** Whether a feature is a tab's slot (`tab-slot-...`): through the part, or a pocket in a face. */
export const isTabSlot = (f: Feature): boolean => f.id.startsWith('tab-slot-');

/**
 * A slot for a tab in a part's face: the rectangle the tab's section fills. Through (`depth` left out), an
 * opening with a dog-bone in each corner, which a square tab needs; blind, a recess `depth` deep.
 */
export function tabSlot(id: string, face: 'A' | 'B', x0: Mm, y0: Mm, x1: Mm, y1: Mm, depth?: Mm): Feature {
  const outline = rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
  return depth === undefined ? { id: `tab-slot-${id}`, kind: 'cutout', face, outline, inside: true, dogBones: true } : { id: `tab-slot-${id}`, kind: 'dado', face, outline, depth };
}

/** A slot's rectangle in its part, whichever kind it is. */
function slotRect(f: Feature): { x0: Mm; y0: Mm; x1: Mm; y1: Mm } | undefined {
  if (!isTabSlot(f) || (f.kind !== 'cutout' && f.kind !== 'dado')) return undefined;
  const [xs, ys] = [f.outline.map((p) => p.x), f.outline.map((p) => p.y)];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Whether a hole of radius `r` at `at` in a part comes within `web` of one of its slots for a tab, on either
 * face: a through slot is in both, and a blind one leaves too little under it for a hole from the other.
 */
export function onTabSlot(features: Feature[], at: Point, r: Mm, web: Mm): boolean {
  return features.some((f) => {
    const s = slotRect(f);
    return !!s && at.x > s.x0 - r - web && at.x < s.x1 + r + web && at.y > s.y0 - r - web && at.y < s.y1 + r + web;
  });
}

/** What a pocket hole takes up of its face, roughly: how far in from the edge the screw leaves by, and half its width. */
const POCKET_ROOM = { reach: 60, halfWidth: 8 };

/**
 * The parts with no pocket hole on a slot for a tab: a pocket hole that would run into one is left out (a face
 * frame's row along a side or a bottom has others beside it). With no slots, the parts as they are.
 */
export function clearOfTabSlots(parts: Part[]): Part[] {
  return parts.map((part) => {
    const slots = part.features.flatMap((f) => slotRect(f) ?? []);
    if (!slots.length || !part.features.some((f) => f.kind === 'pocketHole')) return part;
    const hits = (f: Feature) => {
      if (f.kind !== 'pocketHole') return false;
      const from = f.inset ?? 0;
      const [a0, a1] = [f.at - POCKET_ROOM.halfWidth, f.at + POCKET_ROOM.halfWidth];
      const { width: W, height: H } = part.size;
      const room =
        f.edge === 'x0'
          ? { x0: from, x1: from + POCKET_ROOM.reach, y0: a0, y1: a1 }
          : f.edge === 'x1'
            ? { x0: W - from - POCKET_ROOM.reach, x1: W - from, y0: a0, y1: a1 }
            : f.edge === 'y0'
              ? { x0: a0, x1: a1, y0: from, y1: from + POCKET_ROOM.reach }
              : { x0: a0, x1: a1, y0: H - from - POCKET_ROOM.reach, y1: H - from };
      return slots.some((s) => room.x0 < s.x1 && room.x1 > s.x0 && room.y0 < s.y1 && room.y1 > s.y0);
    };
    return { ...part, features: part.features.filter((f) => !hits(f)) };
  });
}
