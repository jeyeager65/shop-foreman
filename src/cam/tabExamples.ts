/**
 * A few parts with their holding tabs drawn, for choosing how a machine places them: examples to look at where
 * the method is picked. Each is an outline in mm and the
 * stock it is cut from; the tabs are worked out by `tabCenters`, the rule a job is cut by, from the machine's own
 * values, so the pictures change as the values are typed.
 */
import type { MachineProfile, Mm, Point } from '@/model';
import { tabSpans, tabbedOutline } from '@/design/tabs';
import { type TabMethod, tabCenters } from './cuts';

export interface TabExample {
  id: string;
  title: string;
  /** What to look for in it. */
  note: string;
  outline: Point[];
  thickness: Mm;
  /** It has a joint's tabs: the shoulders beside them take no holding tab. */
  jointed?: boolean;
}

/** The bit the examples are cut with: 1/4". A tab with its ramps is the machine's width and three of these long. */
export const EXAMPLE_BIT: Mm = 6.35;
const rect = (w: Mm, h: Mm): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
const arc = (cx: Mm, cy: Mm, rx: Mm, ry: Mm, from: number, to: number, steps: number): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => ({ x: cx + rx * Math.cos(from + ((to - from) * i) / steps), y: cy + ry * Math.sin(from + ((to - from) * i) / steps) }));

/** Sizes in whole inches, so they read plainly in either unit. */
const IN = 25.4;

export function tabExamples(): TabExample[] {
  const ends = { reach: 0.75 * IN, spans: tabSpans(20 * IN) };
  // The two tall ones first, then the rest in pairs: they are drawn at one scale, a row as high as its taller part.
  return [
    { id: 'panel', title: 'A cabinet side', note: '3/4" plywood.', outline: rect(23 * IN, 30 * IN), thickness: 0.75 * IN },
    { id: 'door', title: 'A door', note: 'Held near its four corners, on its long sides.', outline: rect(15 * IN, 30 * IN), thickness: 0.75 * IN },
    { id: 'strip', title: 'A long, narrow part', note: 'A stretcher: not held twice at the same place.', outline: rect(24 * IN, 4 * IN), thickness: 0.75 * IN },
    { id: 'small', title: 'A small part', note: 'Held where it can be.', outline: rect(5 * IN, 3 * IN), thickness: 0.75 * IN },
    { id: 'round', title: 'A round shelf', note: 'No corner: evenly round it.', outline: arc(10 * IN, 10 * IN, 10 * IN, 10 * IN, 0, 2 * Math.PI, 72).slice(0, -1), thickness: 0.75 * IN },
    { id: 'leaf', title: 'A rounded leaf', note: 'One tab a corner, on the straight edge; the curve has its own.', outline: [{ x: 0, y: 0 }, ...arc(14 * IN, 0, 14 * IN, 12 * IN, 0, Math.PI, 48).slice(0, -1)], thickness: 0.75 * IN },
    { id: 'tabbed', title: "A bottom with a joint's tabs", note: "No holding tab on the shoulders beside a joint's tab: an edge with them is held on a tab's end.", outline: tabbedOutline(24 * IN, 20 * IN, { x0: ends, x1: ends }), thickness: 0.75 * IN, jointed: true },
  ];
}

/** The holding tabs of an example on a machine, by a method: where each is along the outline, and how long it is drawn. */
export function exampleTabs(example: TabExample, tabs: MachineProfile['tabs'], method: TabMethod): { centers: Mm[]; length: Mm } {
  const whole = tabs.width + 3 * EXAMPLE_BIT;
  return { centers: tabCenters(example.outline, tabs.maxSpacing, whole, tabs.fromCorner ?? 25, method, !!example.jointed), length: tabs.width + EXAMPLE_BIT };
}

/** The stretch of a closed outline from `from` to `to` along it, as points: a tab, to draw over the outline. */
export function alongLoop(outline: Point[], from: Mm, to: Mm): Point[] {
  const n = outline.length;
  const lengths = outline.map((a, i) => Math.hypot(outline[(i + 1) % n]!.x - a.x, outline[(i + 1) % n]!.y - a.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const at = (u: Mm): { point: Point; side: number } => {
    let d = ((u % total) + total) % total;
    for (let i = 0; i < n; i++) {
      if (d <= lengths[i]! || i === n - 1) {
        const [a, b] = [outline[i]!, outline[(i + 1) % n]!];
        const t = lengths[i]! > 0 ? Math.min(1, d / lengths[i]!) : 0;
        return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, side: i };
      }
      d -= lengths[i]!;
    }
    return { point: outline[0]!, side: 0 };
  };
  const [start, end] = [at(from), at(to)];
  const out = [start.point];
  // The corners between the two, where the stretch runs over more than one flat (a curve).
  for (let i = start.side; i !== end.side; i = (i + 1) % n) out.push(outline[(i + 1) % n]!);
  out.push(end.point);
  return out;
}
