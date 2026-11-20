/**
 * The line drawings on a choice's tiles, made in code so that a tile is always what is cut. Each is a few shapes
 * in a box, drawn by `TilePicture.vue`.
 * A pattern's tile is drawn by `patternLines`, the same lines that are cut, each as wide as its cut.
 */
import type { BottomKind } from './casters';
import type { LayoutPreset } from './layout';
import type { BackJoint, CaseJoint, ConstructionStyle, DoorStyle, EdgeTreatment, FrontPattern, Handle, Mm, Point } from '@/model';
import { MM_PER_INCH, len } from '@/units';
import { cutWidth, patternFeatures, patternLines, rippleDepths, PATTERN_MARGIN } from './pattern';
import { type PatternLook, withLook } from './patternLooks';

/**
 * One shape of a drawing, an SVG path in the drawing's own units, y down. `outline`: a thin line. `area`: a thin
 * line round a faint fill (a face). `solid`: filled (a piece cut through, a cut seen from above). `cut`: a line
 * `width` wide in the drawing's units, with round ends (a groove, a flute, a dimple).
 */
export type TileShape = { d: string; kind: 'outline' | 'area' | 'solid' } | { d: string; kind: 'cut'; width: number };
export type TileDrawing = { x: number; y: number; w: number; h: number; shapes: TileShape[] };

const n = (v: number) => String(Math.round(v * 100) / 100);
const rect = (x: number, y: number, w: number, h: number) => `M${n(x)},${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)},${n(cy)}a${n(r)},${n(r)} 0 1,0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1,0 ${n(-2 * r)},0z`;

/**
 * How a cabinet is built, in inches: a base cabinet 24" wide from the front, a drawer over two doors, and beside it
 * its left front corner seen from above at three times the size: the side, the face frame's stile, the door.
 */
export function constructionTile(style: ConstructionStyle): TileDrawing {
  const shapes: TileShape[] = [];
  /** A drawer front over two doors inside `m` of the box's edges, `gap` between them. */
  const fronts = (m: number, gap: number) => {
    const w = (24 - 2 * m - gap) / 2;
    shapes.push({ d: rect(m, m, 24 - 2 * m, 5.5), kind: 'area' }, { d: rect(m, m + 5.5 + gap, w, 30 - 2 * m - 5.5 - gap), kind: 'area' }, { d: rect(m + w + gap, m + 5.5 + gap, w, 30 - 2 * m - 5.5 - gap), kind: 'area' });
  };
  // Seen from above at three times the size, to the right: the back is up, the side's front edge at `front`.
  const [x, top, front, t] = [28, 7, 19, 2.25];
  shapes.push({ d: rect(x, top, t, front - top), kind: 'solid' });
  if (style === 'faceFrame') {
    // The frame shows round fronts that lie over it by 1/2".
    shapes.push({ d: rect(0, 0, 24, 30), kind: 'area' });
    fronts(1, 1);
    shapes.push({ d: rect(x, front, 2 * t, t), kind: 'solid' }, { d: rect(x + 3, front + t + 0.4, 21, t), kind: 'area' });
  } else if (style === 'frameless') {
    // The fronts cover the case's edges.
    fronts(0, 0.3);
    shapes.push({ d: rect(x + 0.3, front + 0.4, 23.7, t), kind: 'area' });
  } else {
    // Inset: the fronts stand between the sides, flush with their edges.
    shapes.push({ d: rect(0, 0, 24, 30), kind: 'area' });
    fronts(1, 0.3);
    shapes.push({ d: rect(x + t + 0.4, front - t, 24 - t - 0.4, t), kind: 'area' });
  }
  return { x: 0, y: 0, w: 52, h: 30, shapes };
}

/**
 * A torsion box cut through, in inches: a foot of it, the ribs standing between its two skins. `skin`: how thick
 * the skins are (a light top's 1/4", a bench top's 3/4").
 */
export function torsionTile(skin: number): TileDrawing {
  const [w, core, rib] = [12, 3.5, 0.75];
  const shapes: TileShape[] = [{ d: rect(0, 0, w, skin), kind: 'area' }, { d: rect(0, skin + core, w, skin), kind: 'area' }];
  for (const x of [0, (w - rib) / 2, w - rib]) shapes.push({ d: rect(x, skin, rib, core), kind: 'solid' });
  // (Room above and below, so that the two tiles are drawn at one scale.)
  return { x: 0, y: skin - 1.25, w, h: core + 2.5, shapes };
}

/** A door face 15" × 21", in inches: a slab, or a shaker's frame round its recessed panel. */
export function doorStyleTile(kind: DoorStyle['kind']): TileDrawing {
  const shapes: TileShape[] = [{ d: rect(0, 0, 15, 21), kind: 'area' }];
  if (kind === 'shaker') shapes.push({ d: rect(2.25, 2.25, 10.5, 16.5), kind: 'area' }, { d: rect(2.6, 2.6, 9.8, 15.8), kind: 'outline' });
  return { x: 0, y: 0, w: 15, h: 21, shapes };
}

/** What a cabinet stands on, in inches: the foot of a case seen from its side, its front to the left, on the floor. */
export function bottomTile(kind: BottomKind): TileDrawing {
  const shapes: TileShape[] = [{ d: 'M-2,14h26', kind: 'outline' }];
  if (kind === 'toeKick') {
    // The side, notched; the kick board across the notch.
    shapes.push({ d: 'M0,0h22v14h-19v-4h-3z', kind: 'area' }, { d: rect(3, 10, 0.75, 4), kind: 'solid' }, { d: rect(-0.9, 0, 0.75, 9.8), kind: 'area' });
  } else if (kind === 'plinth') {
    // The side runs to the floor; the plinth board across its foot, flush with the front, the front above it.
    shapes.push({ d: rect(0, 0, 22, 14), kind: 'area' }, { d: rect(0, 10, 0.75, 4), kind: 'solid' }, { d: rect(-0.9, 0, 0.75, 9.8), kind: 'area' });
  } else if (kind === 'flat') {
    shapes.push({ d: rect(0, 0, 22, 14), kind: 'area' }, { d: rect(-0.9, 0, 0.75, 13.8), kind: 'area' });
  } else if (kind === 'legs') {
    // A flat bottom on a frame: a leg under each corner, an apron between them, set in a little.
    shapes.push({ d: rect(0, 0, 22, 8), kind: 'area' }, { d: rect(-0.9, 0, 0.75, 7.8), kind: 'area' });
    shapes.push({ d: rect(0, 8, 1.5, 6), kind: 'solid' }, { d: rect(20.5, 8, 1.5, 6), kind: 'solid' }, { d: rect(1.5, 8, 19, 2.4), kind: 'area' });
  } else if (kind === 'feet') {
    // Pads under the bottom, and a tapered foot under each.
    shapes.push({ d: rect(0, 0, 22, 9.5), kind: 'area' }, { d: rect(-0.9, 0, 0.75, 9.3), kind: 'area' });
    for (const x of [3.5, 18.5]) shapes.push({ d: rect(x - 2, 9.5, 4, 0.75), kind: 'solid' }, { d: `M${x - 1.4},10.25h2.8l-0.5,3.75h-1.8z`, kind: 'area' });
  } else {
    // A layer under the bottom, the plates and the wheels.
    shapes.push({ d: rect(0, 0, 22, 9.5), kind: 'area' }, { d: rect(0, 9.5, 22, 0.75), kind: 'solid' }, { d: rect(-0.9, 0, 0.75, 9.3), kind: 'area' });
    for (const x of [3.5, 18.5]) shapes.push({ d: rect(x - 1.6, 10.25, 3.2, 0.4), kind: 'solid' }, { d: circle(x, 12.3, 1.7), kind: 'area' }, { d: circle(x, 12.3, 0.4), kind: 'solid' });
  }
  return { x: -2, y: 0, w: 26, h: 14.4, shapes };
}

/**
 * A case joint, in inches: where the bottom meets a side, cut through and seen from the front. The side stands at
 * the left and runs on down past the bottom; the screw is drawn where it goes. Tabs: the bottom's tab through the
 * side to its outside face, or (`blind`) half-way into it.
 */
export function caseJointTile(joint: CaseJoint, blind = false): TileDrawing {
  const shapes: TileShape[] = [];
  if (joint === 'tabs' && !blind) {
    // The side above and below the slot, the tab's end flush with its outside face.
    shapes.push({ d: rect(0, 0, 0.75, 1.6), kind: 'area' }, { d: rect(0, 2.35, 0.75, 0.65), kind: 'area' }, { d: rect(0, 1.6, 3.2, 0.75), kind: 'area' });
  } else if (joint === 'tabs') {
    shapes.push({ d: 'M0,0h0.75v1.6h-0.375v0.75h0.375v0.65h-0.75z', kind: 'area' }, { d: rect(0.375, 1.6, 2.825, 0.75), kind: 'area' });
  } else if (joint === 'dado') {
    // The bottom's end in a groove a third of the side deep.
    shapes.push({ d: 'M0,0h0.75v1.6h-0.25v0.75h0.25v0.65h-0.75z', kind: 'area' }, { d: rect(0.5, 1.6, 2.7, 0.75), kind: 'area' });
  } else {
    shapes.push({ d: rect(0, 0, 0.75, 3), kind: 'area' }, { d: rect(0.75, 1.6, 2.45, 0.75), kind: 'area' });
    // Pocket screws: from a pocket in the underside, at a slant into the side. Through screws: straight through the side.
    if (joint === 'pocketScrews') shapes.push({ d: 'M1.25,2.35h0.9l-0.9,-0.3z', kind: 'solid' }, { d: 'M1.75,2.26L0.3,1.86', kind: 'cut', width: 0.1 });
    else shapes.push({ d: 'M0.02,1.975h1.7', kind: 'cut', width: 0.1 }, { d: rect(-0.08, 1.83, 0.1, 0.29), kind: 'solid' });
  }
  return { x: -0.1, y: 0, w: 3.3, h: 3, shapes };
}

/** How the back is held, in inches: the rear corner of the case seen from above, the rear up, a side at the left. */
export function backJointTile(joint: BackJoint, blind = false): TileDrawing {
  const shapes: TileShape[] = [];
  // On tabs: a thicker back set in from the rear, its tab through the side or half-way into it.
  if (joint === 'tabs' && !blind) shapes.push({ d: rect(0, 0, 0.75, 0.5), kind: 'area' }, { d: rect(0, 1, 0.75, 2), kind: 'area' }, { d: rect(0, 0.5, 3.175, 0.5), kind: 'solid' });
  else if (joint === 'tabs') shapes.push({ d: 'M0,0h0.75v0.5h-0.375v0.5h0.375v2h-0.75z', kind: 'area' }, { d: rect(0.375, 0.5, 2.8, 0.5), kind: 'solid' });
  else if (joint === 'rabbet') shapes.push({ d: 'M0,0h0.375v0.25h0.375v2.75h-0.75z', kind: 'area' }, { d: rect(0.375, 0, 2.8, 0.25), kind: 'solid' });
  else if (joint === 'groove') shapes.push({ d: 'M0,0h0.75v0.5h-0.375v0.25h0.375v2.25h-0.75z', kind: 'area' }, { d: rect(0.375, 0.5, 2.8, 0.25), kind: 'solid' });
  else shapes.push({ d: rect(0, 0.25, 0.75, 2.75), kind: 'area' }, { d: rect(0, 0, 3.175, 0.25), kind: 'solid' });
  return { x: 0, y: 0, w: 3.2, h: 3, shapes };
}

/** A front's outside edge, in inches: the edge cut through, the face up. Drawn a little bigger than 1/8", to read. */
export function outsideEdgeTile(kind: EdgeTreatment['kind']): TileDrawing {
  const r = 0.2;
  const corner = kind === 'roundover' ? `H${n(1.8 - r)}A${r},${r} 0 0 1 1.8,${r}` : kind === 'chamfer' ? `H${n(1.8 - r)}L1.8,${r}` : 'H1.8';
  return { x: 0, y: -0.15, w: 1.9, h: 1.05, shapes: [{ d: `M0,0${corner}V0.75H0z`, kind: 'area' }] };
}

/** A shaker front's inside edge, in inches: the frame at the left stepping down to the panel, cut through. */
export function insideEdgeTile(kind: 'square' | 'vBevel'): TileDrawing {
  const step = kind === 'vBevel' ? `L${n(0.9 + 0.25 * Math.tan(Math.PI / 6))},0.25` : 'V0.25';
  return { x: 0, y: -0.15, w: 2.2, h: 1.05, shapes: [{ d: `M0,0H0.9${step}H2.2V0.75H0z`, kind: 'area' }] };
}

/**
 * A handle, in mm, from its own sizes. One that is fitted is seen from the side, standing on the front (a knob on
 * its stem, a bar on two legs, an arch from foot to foot); one cut into the front is seen from the front (a hole, or
 * a round or a square notch in the edge). None: the bare front.
 */
export function handleTile(handle: Handle | undefined): TileDrawing {
  const shapes: TileShape[] = [];
  if (handle?.routed) {
    // A piece of the front, its opening edge up, and what is cut out of it.
    const { shape, width, depth } = handle.routed;
    const W = Math.max(150, width * 2.2);
    const cut = shape === 'hole' ? circle(W / 2, 45, width / 2) : shape === 'scoop' ? `M${n(W / 2 - width / 2)},0A${n(width / 2)},${n(depth)} 0 0 0 ${n(W / 2 + width / 2)},0z` : rect(W / 2 - width / 2, 0, width, depth);
    shapes.push({ d: rect(0, 0, W, 90), kind: 'area' }, { d: cut, kind: 'solid' });
    return { x: 0, y: 0, w: W, h: 90, shapes };
  }
  const look = handle?.look ?? { length: 0, projection: 0, thickness: 0 };
  const [t, up] = [Math.max(look.thickness, 6), Math.max(look.projection, 12)];
  const W = Math.max(150, look.length + 40);
  // The front, cut through, lying under the handle.
  const [mid, face, high] = [W / 2, 60, 80];
  shapes.push({ d: rect(0, face, W, high - face), kind: 'area' });
  if (!handle) return { x: 0, y: 0, w: W, h: high, shapes };
  const design = handle.printed?.design ?? handle.cnc?.design ?? (handle.holes === 1 ? 'knob' : 'bar');
  if (design === 'knob') {
    const head = Math.max(look.length, 16);
    shapes.push({ d: rect(mid - head / 5, face - up, (head * 2) / 5, up), kind: 'solid' }, { d: rect(mid - head / 2, face - up - t / 2, head, t), kind: 'solid' });
  } else if (design === 'arch') {
    const half = (handle.spacing + t) / 2;
    shapes.push({ d: `M${n(mid - half)},${face}Q${n(mid)},${n(face - 2 * (up + t))} ${n(mid + half)},${face}h${n(-t)}Q${n(mid)},${n(face - 2 * up)} ${n(mid - half + t)},${face}z`, kind: 'solid' });
  } else {
    const [legs, long] = [handle.spacing / 2, Math.max(look.length, handle.spacing + t)];
    shapes.push({ d: rect(mid - long / 2, face - up - t, long, t), kind: 'solid' }, { d: rect(mid - legs - t / 2, face - up, t, up), kind: 'solid' }, { d: rect(mid + legs - t / 2, face - up, t, up), kind: 'solid' });
  }
  return { x: 0, y: 0, w: W, h: high, shapes };
}

/**
 * A front's face as it is made, in mm: its outline, a shaker's frame and panel, its pattern (`patternFeatures`:
 * the slots that are cut, each as wide as its cut, the border's rectangle among them) and its handle. `handle`: the
 * centres of its holes, from the front's bottom-left corner: a knob's one, a pull's two.
 */
export function frontFaceTile(style: DoorStyle, size: { width: Mm; height: Mm }, handle: Point[] = []): TileDrawing {
  const { width: W, height: H } = size;
  const at = (p: Point) => `${n(p.x)},${n(H - p.y)}`;
  const shapes: TileShape[] = [{ d: rect(0, 0, W, H), kind: 'area' }];
  if (style.kind === 'shaker') {
    const f = style.frameWidth.mm;
    if (W > 2 * f && H > 2 * f) shapes.push({ d: rect(f, f, W - 2 * f, H - 2 * f), kind: 'area' });
  }
  const pattern = style.pattern;
  let slots: ReturnType<typeof patternFeatures> = [];
  try {
    slots = patternFeatures(style, size, undefined);
  } catch {
    // A pattern that cannot be cut is not drawn.
  }
  for (const f of slots) {
    if (f.kind !== 'slot') continue;
    if (f.depths && pattern) {
      // A ripple: as wide at each point as its cut is there.
      const top = f.top ?? 0;
      const halves = f.depths.map((d) => cutWidth({ ...pattern, depth: { mm: Math.max(0, d - top), unit: 'mm' } } as FrontPattern) / 2);
      const upright = Math.abs(f.path[0]!.x - f.path[f.path.length - 1]!.x) < Math.abs(f.path[0]!.y - f.path[f.path.length - 1]!.y);
      const side = (sign: 1 | -1) => f.path.map((p, k) => (upright ? { x: p.x + sign * halves[k]!, y: p.y } : { x: p.x, y: p.y + sign * halves[k]! }));
      shapes.push({ d: `M${[...side(1), ...side(-1).reverse()].map(at).join('L')}z`, kind: 'solid' });
    } else shapes.push({ d: `M${f.path.map(at).join('L')}`, kind: 'cut', width: Math.max(f.width, W / 160) });
  }
  if (handle.length === 1) shapes.push({ d: circle(handle[0]!.x, H - handle[0]!.y, 15), kind: 'solid' });
  else if (handle.length > 1) shapes.push({ d: `M${handle.map(at).join('L')}`, kind: 'cut', width: 12 }, ...handle.map((p): TileShape => ({ d: circle(p.x, H - p.y, 9), kind: 'solid' })));
  return { x: 0, y: 0, w: W, h: H, shapes };
}

const inches = (v: number) => ({ mm: v * MM_PER_INCH, unit: 'in' as const });
/** The door a whole-face look is drawn on, and the grooves' spacing on it (closer than they start, to read at a tile's size). */
const TILE_DOOR = { width: 15 * MM_PER_INCH, height: 24 * MM_PER_INCH };
const TILE_SPACING = inches(2);
/** The ball nose a close-up is drawn for. */
const TILE_BALL: Mm = MM_PER_INCH / 4;
/** How much of a face a close-up shows, square. */
const CLOSE_UP: Mm = 3 * MM_PER_INCH;

/** The pattern a look's tile draws: the look's own starter, the grooves closer together. */
export function tilePattern(look: PatternLook): FrontPattern | undefined {
  const pattern = withLook(undefined, look, TILE_BALL);
  return pattern?.kind === 'grooves' ? { ...pattern, spacing: TILE_SPACING } : pattern;
}

/**
 * A look's tile, in mm. Grooves and the frame look are drawn on a whole slab door 15" × 24", the pattern a border
 * in from its edges as it is cut; the finer looks (flutes, dimples, channels, ripples) are a 3" square of a face
 * seen close. Every line is as wide as its cut at the surface; a ripple swells and thins as its depth does.
 */
export function patternTile(look: PatternLook): TileDrawing {
  const pattern = tilePattern(look);
  const whole = !pattern || pattern.kind === 'grooves' || pattern.kind === 'frame';
  const [W, H] = whole ? [TILE_DOOR.width, TILE_DOOR.height] : [CLOSE_UP, CLOSE_UP];
  const shapes: TileShape[] = [{ d: rect(0, 0, W, H), kind: whole ? 'area' : 'outline' }];
  if (!pattern) return { x: 0, y: 0, w: W, h: H, shapes };
  const margin = pattern.kind === 'frame' || !whole ? 0 : len(PATTERN_MARGIN).mm;
  const lines = patternLines(pattern, { x0: margin, y0: margin, x1: W - margin, y1: H - margin });
  // `patternLines` has y up, from the front's bottom edge.
  const at = (p: Point) => `${n(p.x)},${n(H - p.y)}`;
  if (pattern.kind === 'ripples') {
    // Each line as an outline as wide as its cut is at each point.
    lines.forEach((line, i) => {
      const halves = rippleDepths(pattern, line, i).map((d) => cutWidth({ ...pattern, depth: { mm: d, unit: 'mm' } }) / 2);
      const side = (sign: 1 | -1) => line.map((p, k) => (pattern.direction === 'vertical' ? { x: p.x + sign * halves[k]!, y: p.y } : { x: p.x, y: p.y + sign * halves[k]! }));
      shapes.push({ d: `M${[...side(1), ...side(-1).reverse()].map(at).join('L')}z`, kind: 'solid' });
    });
    return { x: 0, y: 0, w: W, h: H, shapes };
  }
  // No thinner than shows at a tile's size.
  const width = Math.max(cutWidth(pattern), W / 70);
  for (const line of lines) shapes.push({ d: `M${line.map(at).join('L')}`, kind: 'cut', width });
  return { x: 0, y: 0, w: W, h: H, shapes };
}

/**
 * A cabinet's layout, in inches: its front, 24" wide, with the fronts the layout gives it (`drawers`: how many a
 * drawers-only one has). Doors over doors is the tall cabinet's and is drawn twice as high.
 */
export function layoutTile(preset: LayoutPreset, drawers = 3): TileDrawing {
  const [w, h, gap] = [24, preset === 'doorsOverDoors' ? 60 : 30, 0.5];
  const shapes: TileShape[] = [{ d: rect(0, 0, w, h), kind: 'outline' }];
  /** A pair of doors from `y`, `high`. */
  const pair = (y: number, high: number) => {
    const each = (w - 3 * gap) / 2;
    shapes.push({ d: rect(gap, y, each, high), kind: 'area' }, { d: rect(2 * gap + each, y, each, high), kind: 'area' });
  };
  if (preset === 'doors') pair(gap, h - 2 * gap);
  else if (preset === 'drawerOverDoors') {
    shapes.push({ d: rect(gap, gap, w - 2 * gap, 5.5), kind: 'area' });
    pair(6 + gap, h - 6 - 2 * gap);
  } else if (preset === 'doorsOverDoors') {
    pair(gap, h / 2 - 1.5 * gap);
    pair(h / 2 + gap / 2, h / 2 - 1.5 * gap);
  } else {
    const count = Math.max(1, drawers);
    const each = (h - (count + 1) * gap) / count;
    for (let i = 0; i < count; i++) shapes.push({ d: rect(gap, gap + i * (each + gap), w - 2 * gap, each), kind: 'area' });
  }
  return { x: 0, y: 0, w, h, shapes };
}

/**
 * A corner cabinet seen from above, in inches, the walls drawn thick and the room's corner at the top on `side`:
 * a blind one (its blind part solid, the other run's cabinet in front of it outlined, its doors beside it), a
 * diagonal one (five-sided), an L-shaped one with its lazy susan. With no kind, a plain cabinet against the back wall.
 */
export function cornerTile(kind: 'blind' | 'diagonal' | 'lShaped' | undefined, side: 'left' | 'right' = 'left'): TileDrawing {
  const W = 42;
  /** Drawn for a corner at the left; a right one is its mirror. */
  const x = (v: number) => (side === 'left' ? v : W - v);
  const poly = (points: [number, number][]) => `M${points.map(([px, py]) => `${n(x(px))},${n(py)}`).join('L')}z`;
  const line = (a: [number, number], b: [number, number]) => `M${n(x(a[0]))},${n(a[1])}L${n(x(b[0]))},${n(b[1])}`;
  const shapes: TileShape[] = [{ d: line([0, -1], [W, -1]), kind: 'cut', width: 1.2 }];
  if (kind) shapes.push({ d: line([-1, -1], [-1, 38]), kind: 'cut', width: 1.2 });
  if (!kind) shapes.push({ d: poly([[9, 0], [33, 0], [33, 22], [9, 22]]), kind: 'area' }, { d: line([9.5, 23.2], [32.5, 23.2]), kind: 'cut', width: 0.9 });
  else if (kind === 'blind') {
    shapes.push({ d: poly([[0, 0], [W, 0], [W, 22], [0, 22]]), kind: 'area' }, { d: poly([[0, 0], [22, 0], [22, 22], [0, 22]]), kind: 'solid' });
    shapes.push({ d: line([25.5, 23.2], [W - 0.5, 23.2]), kind: 'cut', width: 0.9 }, { d: poly([[0, 22], [22, 22], [22, 38], [0, 38]]), kind: 'outline' });
  } else if (kind === 'diagonal') {
    shapes.push({ d: poly([[0, 0], [36, 0], [36, 22], [22, 36], [0, 36]]), kind: 'area' }, { d: line([36.6, 23.4], [23.4, 36.6]), kind: 'cut', width: 0.9 });
  } else {
    shapes.push({ d: poly([[0, 0], [36, 0], [36, 22], [22, 22], [22, 36], [0, 36]]), kind: 'area' });
    shapes.push({ d: line([35.5, 23.2], [23.2, 23.2]), kind: 'cut', width: 0.9 }, { d: line([23.2, 23.2], [23.2, 35.5]), kind: 'cut', width: 0.9 });
    shapes.push({ d: circle(x(14), 14, 11), kind: 'outline' });
  }
  return { x: -2, y: -2, w: W + 4, h: 42, shapes };
}
