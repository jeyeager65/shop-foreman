/**
 * Patterns cut into the face of a door or a drawer front, which put more of the kinds of bit to use. A pattern is
 * lines, each cut along with a bit to a depth (`Feature` `slot`, most with a `profile`):
 *
 * - `grooves`: V-grooves with a V-bit: planking (vertical, horizontal or diagonal lines), a grid, diamonds,
 *   chevrons, a sunburst, rectangles one inside another, waves.
 * - `flutes`: round-bottomed channels side by side, with a ball nose (or a taper ball of the same tip): straight
 *   or wavy; reeded, they overlap and leave ridges between them.
 * - `dimples`: a grid of shallow round dents, each a plunge of a ball nose.
 * - `channels`: flat-bottomed channels (a slat look) with an end mill, or soft-cornered ones with a bull nose.
 * - `ripples`: lines whose depth rises and falls along them, each half a wave on from the next: a woven look, with a
 *   V-bit, a ball nose or a bull nose.
 * - `frame`: a V-groove rectangle or several, one over another, that makes a slab look framed and panelled.
 *
 * On a slab it covers the face, a margin in from its edges (none: the lines run out through the edges). On a
 * shaker front it covers the recessed panel's floor instead, cut down from it; the frame look is for a slab only.
 * Untested: nothing here has been cut. Every default is a first guess, tune me.
 */
import type { DoorStyle, Feature, FrontPattern, Mm, Point } from '@/model';
import { MM_PER_INCH, len } from '@/units';

/** The least left under a pattern's deepest cut. */
const MIN_UNDER: Mm = 3;
/** A piece of a line shorter than this is not worth cutting. */
const SHORTEST: Mm = 6;
/** A dimple is a plunge: its line is this long, so it is a line all the same. */
const DIMPLE_RUN: Mm = 0.5;
/** A ripple's depth is followed in pieces no longer than this. */
const RIPPLE_STEP: Mm = 3;
/** A wave is drawn and cut as straight pieces about this long. */
const WAVE_STEP: Mm = 6;

export const PATTERN_KINDS: { title: string; value: FrontPattern['kind'] | 'none' }[] = [
  { title: 'None', value: 'none' },
  { title: 'V-grooves (planks, grid, diamonds, chevrons, sunburst, waves)', value: 'grooves' },
  { title: 'Flutes (round channels, a ball nose)', value: 'flutes' },
  { title: 'Dimples (a grid of round dents, a ball nose)', value: 'dimples' },
  { title: 'Channels (a slat look: an end mill, or a bull nose)', value: 'channels' },
  { title: 'Ripples (lines that rise and fall, each offset from the next)', value: 'ripples' },
  { title: 'Frame and panel look, in V-grooves (a slab)', value: 'frame' },
];
export const GROOVE_LAYOUTS: { title: string; value: Extract<FrontPattern, { kind: 'grooves' }>['layout'] }[] = [
  { title: 'Planks, upright', value: 'vertical' },
  { title: 'Planks, level', value: 'horizontal' },
  { title: 'Planks, on the diagonal', value: 'diagonal' },
  { title: 'Grid', value: 'grid' },
  { title: 'Diamonds', value: 'diamond' },
  { title: 'Chevrons', value: 'chevron' },
  { title: 'Sunburst, from the bottom', value: 'sunburst' },
  { title: 'Rectangles, one inside another', value: 'rectangles' },
  { title: 'Waves, upright', value: 'waves' },
];

type Flutes = Extract<FrontPattern, { kind: 'flutes' }>;
type Dimples = Extract<FrontPattern, { kind: 'dimples' }>;

/**
 * What a pattern of a kind starts as. `ball`: the ball nose the flutes or dimples are sized for (they are as wide
 * as their bit, so Design offers the widths of the shop's ball noses); left out, 1/8", the smallest starter bit's.
 */
export function starterPattern(kind: FrontPattern['kind'], ball: Mm = MM_PER_INCH / 8): FrontPattern {
  if (kind === 'grooves') return { kind, layout: 'vertical', spacing: len('3"'), depth: len('1/8"'), angleDeg: 90, margin: len(PATTERN_MARGIN) };
  if (kind === 'flutes') return flutesFor(ball, { kind, direction: 'vertical', width: len('1/8"'), spacing: len('3/16"'), depth: len('3/64"'), margin: len(PATTERN_MARGIN) });
  if (kind === 'dimples') return dimplesFor(ball, { kind, width: len('1/8"'), spacing: len('1"'), depth: len('3/64"'), margin: len(PATTERN_MARGIN) });
  if (kind === 'channels') return { kind, direction: 'vertical', width: len('1/4"'), spacing: len('3/4"'), depth: len('1/8"'), margin: len(PATTERN_MARGIN) };
  if (kind === 'ripples') return ripplesFor({ kind, direction: 'vertical', bit: 'v', angleDeg: 90, width: inches(ball), spacing: len('1/4"'), wave: len('1"'), depth: len('1/8"'), margin: len(PATTERN_MARGIN) });
  return { kind, inset: len('2-1/4"'), depth: len('1/8"'), angleDeg: 90, panels: 1 };
}

const inches = (v: Mm) => ({ mm: v, unit: 'in' as const });
/** How deep a pattern starts: 1/8". A flute or a dimple starts no deeper than half its bit, a half round; it may be set deeper. */
export const PATTERN_DEPTH: Mm = MM_PER_INCH / 8;
const roundDepth = (ball: Mm): Mm => Math.min(PATTERN_DEPTH, ball / 2);
/**
 * How far in from a front's edges a pattern starts, on a slab: a plain border as wide as a shaker frame, a faux
 * frame where the pattern does not go, which keeps a deeper pattern clear of the hinge cups. A hinge cup reaches
 * about 1-1/2" in from the door's edge.
 */
export const PATTERN_MARGIN = '2-1/4"';
/** Flutes resized for a ball nose of a diameter: as wide as it, 1/8" deep or half of it if that is less, one and a half times it apart (reeded: three quarters). */
export function flutesFor(ball: Mm, flutes: Flutes): Flutes {
  return { ...flutes, width: inches(ball), depth: inches(roundDepth(ball)), spacing: inches(ball * (flutes.reeded ? 0.75 : 1.5)) };
}
/** Ripples respaced for their bit and depth: the lines as far apart as a cut is wide at its deepest, so each just meets the next. */
export function ripplesFor(ripples: Extract<FrontPattern, { kind: 'ripples' }>): Extract<FrontPattern, { kind: 'ripples' }> {
  return { ...ripples, spacing: inches(cutWidth(ripples)) };
}
/** Dimples resized for a ball nose of a diameter: 1/8" deep or half of it if that is less, four times it apart. */
export function dimplesFor(ball: Mm, dimples: Dimples): Dimples {
  return { ...dimples, width: inches(ball), depth: inches(roundDepth(ball)), spacing: inches(ball * 4) };
}

/** A bull nose's corner radius when a pattern does not say: an eighth of its width. */
export const bullCorner = (pattern: { width: { mm: Mm }; corner?: { mm: Mm } }): Mm => Math.min(pattern.width.mm / 2, pattern.corner?.mm ?? pattern.width.mm / 8);
/**
 * How wide a bull nose `diameter` across with corners of `radius` cuts at the surface, `depth` deep: its flat floor
 * and as much of each round corner as is in the wood. Its full width once it is as deep as a corner is round.
 */
export function bullWidth(diameter: Mm, radius: Mm, depth: Mm): Mm {
  if (depth >= radius) return diameter;
  return diameter - 2 * radius + 2 * Math.sqrt(Math.max(0, depth * (2 * radius - depth)));
}
/** How wide a cut is at the surface it starts from: a V of an angle, a ball of a diameter, to a depth; a channel's own width. */
export function cutWidth(pattern: FrontPattern): Mm {
  if ((pattern.kind === 'channels' && pattern.soft) || (pattern.kind === 'ripples' && pattern.bit === 'bull')) return bullWidth(pattern.width.mm, bullCorner(pattern), pattern.depth.mm);
  if (pattern.kind === 'channels') return pattern.width.mm;
  if (pattern.kind === 'flutes' || pattern.kind === 'dimples' || (pattern.kind === 'ripples' && pattern.bit === 'round')) {
    const [d, D] = [pattern.depth.mm, pattern.width.mm];
    return d >= D / 2 ? D : 2 * Math.sqrt(d * (D - d));
  }
  return 2 * pattern.depth.mm * Math.tan((pattern.angleDeg * Math.PI) / 360);
}

type Box = { x0: Mm; y0: Mm; x1: Mm; y1: Mm };

/** The part of the line from `a` to `b` inside the box; nothing when none of it is, or too little. */
function clip(a: Point, b: Point, box: Box): [Point, Point] | undefined {
  let [t0, t1] = [0, 1];
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  for (const [p, q] of [
    [-dx, a.x - box.x0],
    [dx, box.x1 - a.x],
    [-dy, a.y - box.y0],
    [dy, box.y1 - a.y],
  ] as [number, number][]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return undefined;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (t1 - t0 <= 0) return undefined;
  const [from, to] = [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
  return Math.hypot(to.x - from.x, to.y - from.y) < SHORTEST ? undefined : [from, to];
}

/** Places across `span` from `from` for lines that part it into equal planks about `spacing` wide: the lines between them. */
const between = (from: Mm, span: Mm, spacing: Mm): Mm[] => {
  const n = Math.max(1, Math.round(span / spacing));
  return Array.from({ length: n - 1 }, (_, i) => from + ((i + 1) * span) / n);
};
/** Places across `span` from `from` for cuts `wide`, `pitch` apart, as many as fit, in the middle of it. */
const filling = (from: Mm, span: Mm, wide: Mm, pitch: Mm): Mm[] => {
  const n = Math.floor((span - wide) / pitch + 1e-9) + 1;
  if (n < 1) return [];
  const first = from + (span - (n - 1) * pitch) / 2;
  return Array.from({ length: n }, (_, i) => first + i * pitch);
};

/**
 * A front's border, where nothing is cut into its face: a shaker front's frame, or the margin a slab's pattern
 * stops at (the frame look: how far in its rectangle is). A plain slab, or a pattern that runs out through the
 * edges, has none. A handle set `inMargin` goes in the middle of it.
 */
export function frontBorder(style: DoorStyle): Mm | undefined {
  if (style.kind === 'shaker') return style.frameWidth.mm;
  const pattern = style.pattern;
  if (!pattern) return undefined;
  const margin = pattern.kind === 'frame' ? pattern.inset.mm : pattern.margin.mm;
  return margin > 0 ? margin : undefined;
}

/**
 * The lines of a pattern over a box, as runs of points. `side`: which door of a pair the front is: a diagonal
 * leans the other way on the right one, and a sunburst starts from the bottom corner where the two doors meet
 * (the middle of the bottom of a front on its own).
 */
export function patternLines(pattern: FrontPattern, box: Box, side?: 'left' | 'right'): Point[][] {
  const [W, H] = [box.x1 - box.x0, box.y1 - box.y0];
  if (W <= 0 || H <= 0) return [];
  const upright = (xs: Mm[]): Point[][] => xs.map((x) => [{ x, y: box.y0 }, { x, y: box.y1 }]);
  const level = (ys: Mm[]): Point[][] => ys.map((y) => [{ x: box.x0, y }, { x: box.x1, y }]);
  /** Upright lines that wave from side to side by `sway`, a wave every `long`, kept inside the box. */
  const wavy = (xs: Mm[], sway: Mm, long: Mm): Point[][] =>
    xs.map((x) => {
      const n = Math.max(2, Math.ceil(H / WAVE_STEP));
      return Array.from({ length: n + 1 }, (_, i) => {
        const y = box.y0 + (H * i) / n;
        return { x: Math.min(box.x1, Math.max(box.x0, x + sway * Math.sin((2 * Math.PI * (y - box.y0)) / long))), y };
      });
    });
  /** Lines at 45 degrees, `spacing` apart square to themselves, one through the middle; `lean` 1 rises to the right. */
  const diagonal = (spacing: Mm, lean: 1 | -1): Point[][] => {
    const step = spacing * Math.SQRT2;
    const [cx, cy] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    const reach = (W + H) / 2;
    const out: Point[][] = [];
    for (let k = -Math.ceil(reach / step); k <= Math.ceil(reach / step); k++) {
      const x = cx + k * step;
      const cut = clip({ x: x - reach, y: cy - lean * reach }, { x: x + reach, y: cy + lean * reach }, box);
      if (cut) out.push(cut);
    }
    return out;
  };
  if (pattern.kind === 'flutes') {
    const wide = cutWidth(pattern);
    // Reeded, they overlap and leave a ridge between each two; else each is clear of the next.
    const pitch = pattern.reeded ? Math.min(pattern.spacing.mm, wide * 0.95) : Math.max(pattern.spacing.mm, wide);
    if (!(pitch > 0.5)) return [];
    if (pattern.wavy && pattern.direction === 'vertical') {
      const sway = pitch;
      return wavy(filling(box.x0 + sway, W - 2 * sway, wide, pitch), sway, 12 * pitch);
    }
    return pattern.direction === 'vertical' ? upright(filling(box.x0, W, wide, pitch)) : level(filling(box.y0, H, wide, pitch));
  }
  if (pattern.kind === 'dimples') {
    // Rows a spacing apart, every other one shifted by half of it.
    const wide = cutWidth(pattern);
    const s = Math.max(pattern.spacing.mm, wide);
    const rows = filling(box.y0, H, wide, (s * Math.sqrt(3)) / 2);
    return rows.flatMap((y, r) => filling(box.x0 + (r % 2 ? s / 2 : 0), W - (r % 2 ? s : 0), wide, s).map((x) => [{ x: x - DIMPLE_RUN / 2, y }, { x: x + DIMPLE_RUN / 2, y }]));
  }
  if (pattern.kind === 'ripples') {
    // Straight lines, in pieces short enough to follow the depth as it rises and falls (`rippleDepths`).
    const wide = cutWidth(pattern);
    const pitch = Math.max(pattern.spacing.mm, 1);
    const along = pattern.direction === 'vertical' ? H : W;
    const n = Math.max(2, Math.ceil(along / Math.min(RIPPLE_STEP, pattern.wave.mm / 12)));
    const run = (at: Mm): Point[] => Array.from({ length: n + 1 }, (_, i) => (pattern.direction === 'vertical' ? { x: at, y: box.y0 + (H * i) / n } : { x: box.x0 + (W * i) / n, y: at }));
    return (pattern.direction === 'vertical' ? filling(box.x0, W, wide, pitch) : filling(box.y0, H, wide, pitch)).map(run);
  }
  if (pattern.kind === 'channels') {
    const wide = pattern.width.mm;
    const pitch = Math.max(pattern.spacing.mm, wide + 1);
    return pattern.direction === 'vertical' ? upright(filling(box.x0, W, wide, pitch)) : level(filling(box.y0, H, wide, pitch));
  }
  if (pattern.kind === 'frame') {
    // One rectangle, or several one over another, each `inset` from the edges and from the next.
    const inset = pattern.inset.mm;
    const n = Math.max(1, Math.min(6, Math.round(pattern.panels ?? 1)));
    const high = (H - (n + 1) * inset) / n;
    if (high < SHORTEST || W - 2 * inset < SHORTEST) return [];
    return Array.from({ length: n }, (_, i) => {
      const [x0, x1, y0] = [box.x0 + inset, box.x1 - inset, box.y0 + inset + i * (high + inset)];
      return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y0 + high }, { x: x0, y: y0 + high }, { x: x0, y: y0 }];
    });
  }
  const s = Math.max(pattern.spacing.mm, MM_PER_INCH / 4);
  const lean = side === 'right' ? -1 : 1;
  if (pattern.layout === 'vertical') return upright(between(box.x0, W, s));
  if (pattern.layout === 'horizontal') return level(between(box.y0, H, s));
  if (pattern.layout === 'grid') return [...upright(between(box.x0, W, s)), ...level(between(box.y0, H, s))];
  if (pattern.layout === 'diagonal') return diagonal(s, lean);
  if (pattern.layout === 'diamond') return [...diagonal(s, 1), ...diagonal(s, -1)];
  if (pattern.layout === 'waves') return wavy(between(box.x0, W, s), s / 4, 2 * s);
  if (pattern.layout === 'rectangles') {
    // Each a spacing inside the last, down to one too small to be worth cutting.
    const out: Point[][] = [];
    for (let k = 1; W - 2 * k * s >= SHORTEST && H - 2 * k * s >= SHORTEST; k++) {
      const [x0, y0, x1, y1] = [box.x0 + k * s, box.y0 + k * s, box.x1 - k * s, box.y1 - k * s];
      out.push([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]);
    }
    return out;
  }
  if (pattern.layout === 'sunburst') {
    // Rays from a point on the bottom edge: its middle, or the corner where a pair's two doors meet. They start a
    // little out from it, where they would all run together, and are about the spacing apart half-way out.
    const from: Point = { x: side === 'left' ? box.x1 : side === 'right' ? box.x0 : (box.x0 + box.x1) / 2, y: box.y0 };
    const far = Math.hypot(Math.max(from.x - box.x0, box.x1 - from.x), H);
    const sweep = side ? Math.PI / 2 : Math.PI;
    const n = Math.max(2, Math.round((sweep * far) / 2 / s));
    const start = side === 'left' ? Math.PI / 2 : 0;
    const out: Point[][] = [];
    for (let i = 1; i < n; i++) {
      const a = start + (sweep * i) / n;
      const cut = clip({ x: from.x + s * Math.cos(a), y: from.y + s * Math.sin(a) }, { x: from.x + far * Math.cos(a), y: from.y + far * Math.sin(a) }, box);
      if (cut) out.push(cut);
    }
    return out;
  }
  // Chevrons: each a point on the middle line with an arm down to either side, the points `spacing` apart square to the arms.
  const step = s * Math.SQRT2;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const out: Point[][] = [];
  const reach = W / 2;
  for (let k = -Math.ceil((H / 2 + reach) / step); k <= Math.ceil((H / 2 + reach) / step); k++) {
    const y = cy + k * step + reach / 2;
    for (const arm of [-1, 1]) {
      const cut = clip({ x: cx, y }, { x: cx + arm * reach, y: y - reach }, box);
      if (cut) out.push(cut);
    }
  }
  return out;
}

/** The depth of a ripple at each point of its line, from the surface it starts at: from nothing to `depth` and back every `wave`, line `index` half a wave on from the one before. */
export function rippleDepths(pattern: Extract<FrontPattern, { kind: 'ripples' }>, line: Point[], index: number): Mm[] {
  let run = 0;
  return line.map((p, i) => {
    if (i > 0) run += Math.hypot(p.x - line[i - 1]!.x, p.y - line[i - 1]!.y);
    return (pattern.depth.mm * (1 - Math.cos(2 * Math.PI * (run / pattern.wave.mm + (index % 2) / 2)))) / 2;
  });
}

/**
 * The pattern on a front, as features: a slot for each line, in the front's face A. On a shaker front the lines
 * cover the panel's floor and are cut down from it.
 */
export function patternFeatures(style: DoorStyle, size: { width: Mm; height: Mm }, thickness: Mm | undefined, side?: 'left' | 'right'): Feature[] {
  const pattern = style.pattern;
  if (!pattern) return [];
  const shaker = style.kind === 'shaker' ? style : undefined;
  // The frame look is a slab's: a shaker front has its frame.
  if (shaker && pattern.kind === 'frame') return [];
  const wide = cutWidth(pattern);
  const depth = pattern.depth.mm;
  if (!(depth > 0) || !(wide > 0)) return [];
  const top = shaker ? shaker.recessDepth.mm : 0;
  if (thickness !== undefined && top + depth > thickness - MIN_UNDER + 1e-9) throw new Error('The pattern is cut too deep for the front: it would leave less than 3 mm under it.');
  // (A round cut may be deeper than half its bit: its walls are then straight above its round bottom, and it is as wide as the bit.)
  // Where it goes: the panel's floor, or the face; a margin in from that (lines that would run out of a panel stop half a cut short of its wall).
  const frame = shaker ? shaker.frameWidth.mm + (shaker.insideEdge.kind === 'vBevel' ? shaker.recessDepth.mm * Math.tan((shaker.insideEdge.angleDeg * Math.PI) / 360) : 0) : 0;
  const least = pattern.kind === 'dimples' || pattern.kind === 'ripples' ? wide / 2 + 1 : shaker ? wide / 2 : 0;
  const margin = pattern.kind === 'frame' ? 0 : Math.max(pattern.margin.mm, least);
  const box = { x0: frame + margin, y0: frame + margin, x1: size.width - frame - margin, y1: size.height - frame - margin };
  // The bit's shape: a V, a round bottom, a flat one with soft corners; a plain channel has none (an end mill clears it).
  const profile =
    pattern.kind === 'ripples'
      ? pattern.bit === 'v'
        ? ({ kind: 'v', angleDeg: pattern.angleDeg } as const)
        : pattern.bit === 'bull'
          ? ({ kind: 'bull', diameter: pattern.width.mm, cornerRadius: bullCorner(pattern) } as const)
          : ({ kind: 'round', diameter: pattern.width.mm } as const)
      : pattern.kind === 'flutes' || pattern.kind === 'dimples'
      ? ({ kind: 'round', diameter: pattern.width.mm } as const)
      : pattern.kind === 'channels'
        ? pattern.soft
          ? ({ kind: 'bull', diameter: pattern.width.mm, cornerRadius: bullCorner(pattern) } as const)
          : undefined
        : ({ kind: 'v', angleDeg: pattern.angleDeg } as const);
  const lines: Feature[] = patternLines(pattern, box, side).map((path, i) => ({
    id: `pattern-${i + 1}`,
    kind: 'slot',
    face: 'A',
    path,
    width: wide,
    depth: top + depth,
    ...(profile ? { profile } : {}),
    ...(top ? { top } : {}),
    ...(pattern.kind === 'ripples' ? { depths: rippleDepths(pattern, path, i).map((d) => top + d) } : {}),
  }));
  // The rectangle the pattern stops at, carved too, as an option: on a slab with a margin, with the pattern's own bit to
  // its depth, so it costs no change of bit. A shaker front has its frame there already.
  if (pattern.kind !== 'frame' && pattern.border && !shaker && pattern.margin.mm > 0 && box.x1 - box.x0 > SHORTEST && box.y1 - box.y0 > SHORTEST) {
    const path = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }, { x: box.x0, y: box.y0 }];
    lines.push({ id: 'pattern-border', kind: 'slot', face: 'A', path, width: wide, depth, ...(profile ? { profile } : {}) });
  }
  return lines;
}
