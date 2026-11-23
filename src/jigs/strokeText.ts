/**
 * A few characters as single lines, to engrave a size on a printed jig or cut it with a pointed bit: digits, a
 * slash, the inch and degree marks, a point and "m". A single-line font: each character is the path a tool's
 * centre takes, with no outline to fill, its curves as short straight runs. Each is drawn on a grid 4 wide and 6
 * high from its lower-left corner; whoever cuts them gives the lines a width, round at their ends.
 */
import type { Point } from '@/model';

/** A character's box, and the gap to the next. */
export const STROKE = { width: 4, height: 6, gap: 1.5 };

type Run = [number, number][];

/** Part of an ellipse as a run of points, from one angle to another in degrees (counter-clockwise when `to` is the greater). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Run {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 20));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/** A six: a sweep down from its top into the bowl, and the bowl. A nine is it turned half round. */
const SIX: Run[] = [[[3.4, 5.9], [2.2, 5.3], [1.1, 4.1], [0.4, 2.9], [0.1, 1.9]], arc(2, 1.9, 1.9, 1.9, 180, 540)];
const turned = (runs: Run[]): Run[] => runs.map((run) => run.map(([x, y]): [number, number] => [STROKE.width - x, STROKE.height - y]));

const GLYPHS: Record<string, Run[]> = {
  '0': [arc(2, 3, 2, 3, 0, 360)],
  '1': [[[0.8, 4.8], [2.2, 6], [2.2, 0]]],
  '2': [[...arc(2, 4.1, 1.9, 1.9, 170, -45), [0, 0], [4, 0]]],
  '3': [arc(2, 4.5, 1.6, 1.5, 150, -90), arc(2, 1.5, 1.8, 1.5, 90, -150)],
  '4': [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  '5': [[[3.6, 6], [0.7, 6], [0.4, 3.3], ...arc(2, 1.9, 1.9, 1.9, 135, -150)]],
  '6': SIX,
  '7': [[[0, 6], [4, 6], [1.5, 0]]],
  '8': [arc(2, 4.5, 1.5, 1.5, -90, 270), arc(2, 1.5, 1.8, 1.5, 90, 450)],
  '9': turned(SIX),
  '/': [[[0.5, 0], [3.5, 6]]],
  '"': [[[1.2, 6], [1.2, 4.2]], [[2.8, 6], [2.8, 4.2]]],
  '°': [arc(2, 5, 1, 1, 0, 360)],
  '.': [[[2, 0], [2, 0.01]]],
  m: [[[0, 0], [0, 3.5]], [...arc(1, 2.5, 1, 1, 180, 0), [2, 0]], [...arc(3, 2.5, 1, 1, 180, 0), [4, 0]]],
  ' ': [],
};

/** Whether every character of a text can be drawn. */
export const strokeTextDraws = (text: string): boolean => [...text].every((c) => c in GLYPHS);

/** How long a text is at a scale of 1. */
export const strokeTextLength = (text: string): number => Math.max(0, [...text].length * (STROKE.width + STROKE.gap) - STROKE.gap);

/**
 * A text's lines, each from one point to the next: from the text's lower-left corner, along +X, `scale` times the
 * grid. A character it cannot draw is left as a space.
 */
export function strokeText(text: string, scale = 1): [Point, Point][] {
  const lines: [Point, Point][] = [];
  [...text].forEach((c, i) => {
    const x0 = i * (STROKE.width + STROKE.gap);
    for (const run of GLYPHS[c] ?? []) {
      for (let k = 0; k + 1 < run.length; k++) {
        const [a, b] = [run[k]!, run[k + 1]!];
        lines.push([{ x: (x0 + a[0]) * scale, y: a[1] * scale }, { x: (x0 + b[0]) * scale, y: b[1] * scale }]);
      }
    }
  });
  return lines;
}
