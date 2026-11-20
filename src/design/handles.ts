/**
 * Handles: the knobs and pulls on doors and drawer fronts. Each is one or two screw
 * holes through the front, a known distance apart (the hardware library says which);
 * where they go on the front is the design's, and the CNC drills them through from
 * the back.
 *
 * A door's handle stands upright near the edge the door opens at: near the top of a
 * door on a base or a tall cabinet, near the bottom of one on a wall cabinet or of the
 * upper doors of a tall one. A drawer's lies level, centred across the front.
 */
import type { DoorHandleChoice, DrawerHandleChoice, Feature, Handle, Hardware, Id, Mm, Point, Polygon } from '@/model';
import { len } from '@/units';

/** Every handle hole's id starts with this: Plan gives them their own row, the lists their own name. */
export const HANDLE_HOLE = 'handle';

/**
 * Where a door's handle goes until it is moved: its line in from the door's opening edge (on a slab door; on a shaker door it
 * is the middle of the stile), and its nearest hole from the door's end. Tune me.
 */
export const DEFAULT_DOOR_HANDLE = { fromEdge: len('1-1/2"'), fromEnd: len('3"') };

/** The least wood left between a handle hole and the edge of its front. */
export const HANDLE_EDGE_MARGIN: Mm = 6;

export const isHandle = (h: Hardware): h is Handle => h.kind === 'handle';

/** The handle a front's choice names. */
export function handleFor(choice: { handleId: Id }, hardware: Hardware[]): Handle {
  const handle = hardware.filter(isHandle).find((h) => h.id === choice.handleId);
  if (!handle) throw new Error(`Handle not found: ${choice.handleId}`);
  return handle;
}

/**
 * The end of a door its handle is near, where the hand reaches: the bottom on a wall
 * cabinet and on the upper doors of a tall one, else the top.
 */
export const doorHandleEnd = (form: 'base' | 'wall' | 'tall' | undefined, doorsName: string): 'top' | 'bottom' =>
  form === 'wall' || (form === 'tall' && /^Upper doors$/.test(doorsName.trim())) ? 'bottom' : 'top';

/** A door's handle choice with the starting offsets, for a handle picked for the first time. */
export const doorHandleChoice = (handleId: Id): DoorHandleChoice => ({ handleId, fromEnd: { ...DEFAULT_DOOR_HANDLE.fromEnd } });

/**
 * A door handle's line in from the opening edge: the middle of the door's border when the choice says so
 * (`border`: `frontBorder`, a pattern's margin or a shaker's stile); else as set, else the middle of a shaker
 * door's stile (`stile`: its width), else the slab's default.
 */
export const doorHandleFromEdge = (choice: DoorHandleChoice, stile?: Mm, border?: Mm): Mm =>
  choice.inMargin && border !== undefined ? border / 2 : (choice.fromEdge?.mm ?? (stile !== undefined ? stile / 2 : DEFAULT_DOOR_HANDLE.fromEdge.mm));

/** A drawer front's handle line, up from its bottom: the middle of its top border when the choice says so, else `fromTop` down, else half-way up. */
export const drawerHandleHeight = (choice: DrawerHandleChoice, height: Mm, border?: Mm): Mm =>
  choice.inMargin && border !== undefined ? height - border / 2 : choice.fromTop ? height - choice.fromTop.mm : height / 2;

type Size = { width: Mm; height: Mm; thickness: Mm };

function holes(handle: Handle, centres: Point[], size: Size, face: 'A' | 'B', what: string): Feature[] {
  const least = handle.hole.diameter / 2 + HANDLE_EDGE_MARGIN;
  for (const c of centres) {
    if (c.x < least || c.x > size.width - least || c.y < least || c.y > size.height - least) throw new Error(`The ${what} is too small for its handle where it is set: a hole would be at or past its edge.`);
  }
  return centres.map((center, i) => ({ id: `${HANDLE_HOLE}-${i + 1}`, kind: 'hole', face, center, diameter: handle.hole.diameter, depth: size.thickness, hardwareId: handle.id }));
}

/** Where a door's handle holes are, looking at its front: on a line in from the edge away from the hinges, from the door's top or bottom. */
export function doorHandleCentres(handle: Handle, choice: DoorHandleChoice, size: { width: Mm; height: Mm }, hingeSide: 'left' | 'right', end: 'top' | 'bottom', stile?: Mm, border?: Mm): Point[] {
  const fromEdge = doorHandleFromEdge(choice, stile, border);
  const x = hingeSide === 'left' ? size.width - fromEdge : fromEdge;
  const fromEnd = handle.holes === 0 ? [] : [choice.fromEnd.mm, ...(handle.holes === 2 ? [choice.fromEnd.mm + handle.spacing] : [])];
  return fromEnd.map((d) => ({ x, y: end === 'top' ? size.height - d : d }));
}

/**
 * A door's handle holes: through the door, bored from the back (face B) with the hinge
 * cups, so the door is not flipped for them and its show face lies on the spoilboard.
 */
export function doorHandleHoles(handle: Handle, choice: DoorHandleChoice, size: Size, hingeSide: 'left' | 'right', end: 'top' | 'bottom', stile?: Mm, border?: Mm): Feature[] {
  return holes(handle, doorHandleCentres(handle, choice, size, hingeSide, end, stile, border), size, 'B', 'door');
}

/** The least a drawer front is wide to get two knobs where its choice asks for two. Tune me. */
export const TWO_KNOBS_FROM: Mm = 24 * 25.4;
/** How many of its handle a drawer front gets: two knobs on a wide front that asks for two, else one. */
export const drawerHandleCount = (handle: Handle, choice: DrawerHandleChoice, width: Mm): number => (choice.two && handle.holes === 1 && width >= TWO_KNOBS_FROM - 1e-6 ? 2 : 1);

/** Where a drawer front's handle holes are: level, centred across it (two knobs a quarter in from each end), half-way up unless the choice says how far from the top. */
export function drawerHandleCentres(handle: Handle, choice: DrawerHandleChoice, size: { width: Mm; height: Mm }, border?: Mm): Point[] {
  const y = drawerHandleHeight(choice, size.height, border);
  const across = drawerHandleCount(handle, choice, size.width) === 2 ? [-size.width / 4, size.width / 4] : handle.holes === 2 ? [-handle.spacing / 2, handle.spacing / 2] : handle.holes === 1 ? [0] : [];
  return across.map((d) => ({ x: size.width / 2 + d, y }));
}

/**
 * A drawer front's handle holes, through it. `face` is the face they are bored from: a
 * front's back where the sheet is turned over anyway, else the face the rest of its
 * work is on, so the holes alone never flip a sheet.
 */
export function drawerHandleHoles(handle: Handle, choice: DrawerHandleChoice, size: Size, face: 'A' | 'B', border?: Mm): Feature[] {
  return holes(handle, drawerHandleCentres(handle, choice, size, border), size, face, 'drawer front');
}

/** A pull cut into the front: what is bored through it, and its outline when that has a notch in it. */
export interface RoutedFeatures {
  bores: Feature[];
  outline?: Polygon;
}

/** How many flats a half-round notch is made of. */
const SCOOP_STEPS = 16;

/**
 * A front's outline (counter-clockwise from its bottom-left corner) with a notch in one
 * edge, centred `at` along that edge: square, or half-round. The bit that cuts the
 * outline leaves its radius in a square notch's corners.
 */
export function notchedOutline(size: { width: Mm; height: Mm }, edge: 'top' | 'left' | 'right', at: Mm, shape: 'scoop' | 'notch', width: Mm, depth: Mm): Polygon {
  const { width: W, height: H } = size;
  const half = width / 2;
  // The notch as it is met going round: `u` along the edge from where it starts, `v` into the front.
  const steps: [number, number][] =
    shape === 'notch'
      ? [[0, 0], [0, depth], [width, depth], [width, 0]]
      : Array.from({ length: SCOOP_STEPS + 1 }, (_, i): [number, number] => {
          const t = (Math.PI * i) / SCOOP_STEPS;
          return [half - half * Math.cos(t), depth * Math.sin(t)];
        });
  const notch = steps.map(([u, v]) =>
    edge === 'top' ? { x: at + half - u, y: H - v } : edge === 'right' ? { x: W - v, y: at - half + u } : { x: v, y: at + half - u },
  );
  const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  // Going round counter-clockwise the right edge comes after the second corner, the top after the third, the left after the fourth.
  const after = edge === 'right' ? 2 : edge === 'top' ? 3 : 4;
  return [...corners.slice(0, after), ...notch, ...corners.slice(after)];
}

function routedCheck(what: string, ok: boolean): void {
  if (!ok) throw new Error(`The ${what} is too small for the pull cut into it where it is set.`);
}

/**
 * The pull cut into a door: a finger hole where a handle's nearest hole would be, bored
 * from the back with the cups, or a notch in the edge the door opens at, starting
 * `fromEnd` from the door's end. `frame`: a shaker door's stile, which a notch must
 * leave some of.
 */
export function routedDoorPull(handle: Handle, choice: DoorHandleChoice, size: Size, hingeSide: 'left' | 'right', end: 'top' | 'bottom', frame?: Mm, border?: Mm): RoutedFeatures {
  const r = handle.routed;
  if (!r) return { bores: [] };
  const fromEnd = (d: Mm) => (end === 'top' ? size.height - d : d);
  if (r.shape === 'hole') {
    const fromEdge = doorHandleFromEdge(choice, frame, border);
    const center = { x: hingeSide === 'left' ? size.width - fromEdge : fromEdge, y: fromEnd(choice.fromEnd.mm) };
    const least = r.width / 2 + HANDLE_EDGE_MARGIN;
    routedCheck('door', center.x >= least && center.x <= size.width - least && center.y >= least && center.y <= size.height - least);
    return { bores: [{ id: 'finger-pull', kind: 'hole', face: 'B', center, diameter: r.width, depth: size.thickness }] };
  }
  const at = fromEnd(choice.fromEnd.mm + r.width / 2);
  routedCheck('door', at - r.width / 2 >= HANDLE_EDGE_MARGIN && at + r.width / 2 <= size.height - HANDLE_EDGE_MARGIN && r.depth <= (frame ?? size.width / 2) - HANDLE_EDGE_MARGIN);
  return { bores: [], outline: notchedOutline(size, hingeSide === 'left' ? 'right' : 'left', at, r.shape, r.width, r.depth) };
}

/**
 * The pull cut into a drawer front: a finger hole centred across it (half-way up, or
 * `fromTop` down), or a notch in the middle of its top edge. `frame`: a shaker front's
 * rail, which a notch must leave some of.
 */
export function routedDrawerPull(handle: Handle, choice: DrawerHandleChoice, size: Size, face: 'A' | 'B', frame?: Mm, border?: Mm): RoutedFeatures {
  const r = handle.routed;
  if (!r) return { bores: [] };
  if (r.shape === 'hole') {
    const center = { x: size.width / 2, y: drawerHandleHeight(choice, size.height, border) };
    const least = r.width / 2 + HANDLE_EDGE_MARGIN;
    routedCheck('drawer front', center.x >= least && center.x <= size.width - least && center.y >= least && center.y <= size.height - least);
    return { bores: [{ id: 'finger-pull', kind: 'hole', face, center, diameter: r.width, depth: size.thickness }] };
  }
  routedCheck('drawer front', r.width <= size.width - 2 * 25 && r.depth <= (frame ?? size.height / 2) - HANDLE_EDGE_MARGIN);
  return { bores: [], outline: notchedOutline(size, 'top', size.width / 2, r.shape, r.width, r.depth) };
}

/**
 * How far below a front's show face its surface is at a point: nothing on a slab or on
 * a shaker front's frame, the recess's depth on its panel, and part of that on the
 * bevel between the two. A handle stands on that surface, not on the face: on a shaker
 * drawer front its feet are down in the panel.
 */
export function surfaceBelowFace(part: { features: Feature[] }, at: Point): Mm {
  const pocket = part.features.find((f) => f.kind === 'pocket' && f.face === 'A');
  if (pocket?.kind !== 'pocket') return 0;
  const box = (outline: Polygon) => ({ x0: Math.min(...outline.map((p) => p.x)), x1: Math.max(...outline.map((p) => p.x)), y0: Math.min(...outline.map((p) => p.y)), y1: Math.max(...outline.map((p) => p.y)) });
  /** How far inside a rectangle the point is; negative outside it. */
  const inside = (r: { x0: Mm; x1: Mm; y0: Mm; y1: Mm }) => Math.min(at.x - r.x0, r.x1 - at.x, at.y - r.y0, r.y1 - at.y);
  const floor = box(pocket.outline);
  if (inside(floor) >= 0) return pocket.depth;
  // On the bevel: from the frame's edge at the face down to the floor's edge.
  const bevel = part.features.find((f) => f.kind === 'bevel' && f.face === 'A');
  if (bevel?.kind !== 'bevel') return 0;
  const top = box(bevel.path);
  const run = floor.x0 - top.x0;
  const d = inside(top);
  return d <= 0 || run <= 0 ? 0 : Math.min(1, d / run) * pocket.depth;
}
