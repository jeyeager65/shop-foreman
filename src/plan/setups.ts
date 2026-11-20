import { type Rect, insetRect, rectsOverlap } from '@/geometry/rect';
import type { Feature, Id, MachineProfile, Mm, Operation, OperationKind, Part, PlanWarning, Point, Setup } from '@/model';
import { pinHoleDiameter } from './tools';

/** Cutting order inside a setup. The cutout is last so parts stay attached. */
const KIND_ORDER: OperationKind[] = [
  'hingeCup',
  'pinHole',
  // Holes and grooves usually share the small bit, dados and rabbets the big one with the cutout.
  'holes',
  'groove',
  // Before the dados and the cutout, which share a bit: the ball nose is one change, not two.
  'pocketHole',
  // Round the pockets the ball nose has just cut.
  'pocketLedge',
  'pocketClear',
  'dado',
  'rabbet',
  'vBevel',
  // After a panel is cleared: a pattern on its floor is cut down from there. (A lazy susan's slots are end mill work too.)
  'slot',
  'edgeProfile',
  'cutout',
];
/** Work cut into whichever face its features are on. */
const FACE_KINDS: OperationKind[] = ['dado', 'rabbet', 'groove', 'slot', 'holes', 'pocketHole', 'pocketLedge'];
/** Work that is always on the front face. */
const FRONT_KINDS: OperationKind[] = ['pocketClear', 'vBevel', 'edgeProfile'];

/** Room kept around each part for the cutout and edge cuts when placing pins and the probe. */
const PART_ALLOWANCE: Mm = 10;

/**
 * A tiled blank (longer than the cutting area, cut in two set-ups, slid along Y on
 * pins between them). All tune me.
 */
/** The waste left at each side of a tiled blank: the pins stand in it, clear of the cut round the part. */
export const TILE_SIDE_MARGIN: Mm = 35;
/** How far from the blank's front edge the front pair of pin holes is. */
export const TILE_PIN_FROM_FRONT: Mm = 45;
/** Kept between the end of what a set-up cuts and the end of the machine's travel. */
export const TILE_REACH_MARGIN: Mm = 25;
/** How far each set-up cuts past the join into the other's band. */
export const TILE_OVERLAP: Mm = 1;
/** Kept between the join and a hole, so no hole is cut half in each set-up when there is room to avoid it. */
const TILE_CLEAR_OF_HOLE: Mm = 8;

/** Whether a blank of this size is tiled on this machine: too long for its cutting area, within what may hang over the ends, and no wider than X allows. */
export function isTiled(blank: { width: Mm; height: Mm }, machine: MachineProfile): boolean {
  const tiling = machine.tiling;
  return !!tiling && blank.height > machine.cuttingArea.y.mm + EPS && blank.height <= tiling.maxLength.mm + EPS && blank.width <= machine.cuttingArea.x.mm + EPS;
}

const isCnc = (op: Operation) => op.method === 'cnc' && op.kind !== 'install';

/**
 * The face that must be up for an operation to cut one of its features. Undefined when
 * either will do: a cutout goes from whichever face is up.
 */
export function workFace(op: Operation, feature: Feature): 'A' | 'B' | undefined {
  if (FRONT_KINDS.includes(op.kind)) return 'A';
  if (op.kind === 'hingeCup') return 'B';
  if (FACE_KINDS.includes(op.kind)) return feature.face === 'B' ? 'B' : 'A';
  return undefined;
}

/** For each part, the faces its CNC work is tied to. */
function facesWorked(ops: Operation[], parts: Part[]): Map<Id, Set<'A' | 'B'>> {
  const worked = new Map<Id, Set<'A' | 'B'>>();
  for (const op of ops) {
    if (!isCnc(op) || op.source.kind !== 'features') continue;
    for (const ref of op.source.refs) {
      const feature = parts.find((p) => p.id === ref.partId)?.features.find((f) => f.id === ref.featureId);
      const face = feature && workFace(op, feature);
      if (!face) continue;
      if (!worked.has(ref.partId)) worked.set(ref.partId, new Set());
      worked.get(ref.partId)!.add(face);
    }
  }
  return worked;
}

/**
 * A flip is needed only when some part has CNC work tied to both of its faces. A part
 * whose work is all on its back is laid back face up instead, and a cutout can go
 * from either face.
 */
export function needsFlip(ops: Operation[], parts: Part[]): boolean {
  return [...facesWorked(ops, parts).values()].some((faces) => faces.size === 2);
}

export interface Blank {
  width: Mm;
  height: Mm;
  thickness: Mm;
}

/** Used when a saved machine profile has no edge margin yet. */
export const DEFAULT_EDGE_MARGIN: Mm = 20;
/** Used when a saved machine profile has no sheet trim yet: 1/8" for a saw kerf. */
export const DEFAULT_SHEET_TRIM: Mm = 3.175;
/** Stock sizes are rounded up to the next 1/8". */
const STOCK_STEP: Mm = 25.4 / 8;
const EPS = 1e-6;

/**
 * 'row': parts side by side across X. 'column': one behind the other along Y.
 * A list of numbers: rows one behind the other, with that many parts in each, in
 * part order (two doors in front and a drawer front behind them is `[2, 1]`).
 */
export type Arrangement = 'row' | 'column' | number[];
type Size = { width: Mm; height: Mm };

/** The parts split into rows, front to back. */
function rowsOf(parts: Part[], arrangement: Arrangement): Part[][] {
  if (arrangement === 'row') return parts.length ? [parts] : [];
  if (arrangement === 'column') return parts.map((p) => [p]);
  const rows: Part[][] = [];
  let i = 0;
  for (const n of arrangement) {
    rows.push(parts.slice(i, i + n));
    i += n;
  }
  if (i < parts.length) rows.push(parts.slice(i));
  return rows.filter((r) => r.length > 0);
}

const rowSize = (row: Part[], spacing: Mm): Size => ({
  width: row.reduce((sum, p) => sum + p.size.width, 0) + spacing * (row.length - 1),
  height: Math.max(...row.map((p) => p.size.height)),
});

/** The space the parts take up together, without any waste around them. */
function extent(parts: Part[], spacing: Mm, arrangement: Arrangement): Size {
  const sizes = rowsOf(parts, arrangement).map((row) => rowSize(row, spacing));
  return {
    width: Math.max(0, ...sizes.map((s) => s.width)),
    height: sizes.reduce((sum, s) => sum + s.height, 0) + spacing * Math.max(0, sizes.length - 1),
  };
}

/** Rows filled in part order, each as wide as `limit` allows. */
function wrapRows(parts: Part[], spacing: Mm, limit: Mm): number[] {
  const counts: number[] = [];
  let width = 0;
  for (const part of parts) {
    const next = width === 0 ? part.size.width : width + spacing + part.size.width;
    if (width > 0 && next > limit + EPS) {
      counts.push(1);
      width = part.size.width;
    } else {
      if (counts.length === 0) counts.push(0);
      counts[counts.length - 1]!++;
      width = next;
    }
  }
  return counts;
}

/** Parts centred on the blank, as seen with the front face up. */
function layoutFrontUp(
  parts: Part[],
  blank: Blank,
  spacing: Mm,
  arrangement: Arrangement,
): { placements: Map<string, Point>; fits: boolean } {
  const total = extent(parts, spacing, arrangement);
  let y = (blank.height - total.height) / 2;
  const placements = new Map<string, Point>();
  // Each row is centred across the blank, and each part in the depth of its row.
  for (const row of rowsOf(parts, arrangement)) {
    const size = rowSize(row, spacing);
    let x = (blank.width - size.width) / 2;
    for (const part of row) {
      placements.set(part.id, { x, y: y + (size.height - part.size.height) / 2 });
      x += part.size.width + spacing;
    }
    y += size.height + spacing;
  }
  const margin = Math.min((blank.width - total.width) / 2, (blank.height - total.height) / 2);
  return { placements, fits: margin >= PART_ALLOWANCE - EPS };
}

/**
 * The smallest blank for one arrangement and edge margin, before rounding: the parts
 * plus the margin all round, then more depth until the flip pins and the probe spot
 * have room. The layout rules decide, not a formula.
 */
function smallestFor(ops: Operation[], parts: Part[], thickness: Mm, machine: MachineProfile, arrangement: Arrangement, margin: Mm): Size {
  const total = extent(parts, machine.nesting.partSpacing, arrangement);
  const size = { width: total.width + 2 * margin, height: total.height + 2 * margin };
  for (let i = 0; i < 400; i++) {
    const { warnings } = planSetups(ops, parts, { ...size, thickness }, machine, arrangement);
    const short = warnings.filter((w) => w.code === 'blankTooSmall');
    if (short.length === 0) break;
    // The pins sit at the front and back and the probe spot fits there too, so depth
    // is what they need. Only parts that don't fit at all need more width as well.
    if (short.some((w) => w.message.includes('too small for these parts'))) size.width += 0.5;
    size.height += 0.5;
  }
  return size;
}

const roundUp = (v: Mm) => Math.ceil(v / STOCK_STEP - 1e-9) * STOCK_STEP;
/**
 * The stock can be turned on the machine, so either way round counts, unless it is
 * `fixed`: a sheet with grain, whose blank must lie the way the parts' grain needs.
 */
const within = (b: Size, limit: Size, fixed = false) =>
  (b.width <= limit.width + EPS && b.height <= limit.height + EPS) ||
  (!fixed && b.width <= limit.height + EPS && b.height <= limit.width + EPS);

export interface BlankLayout {
  /** The smallest blank that works, rounded up to the next 1/8" where the stock allows. */
  blank: Size;
  arrangement: Arrangement;
  /** Waste left between the parts and the blank's edges. */
  edgeMargin: Mm;
  warnings: PlanWarning[];
}

/**
 * Picks how the parts go on the blank and how big the blank must be, within the
 * largest piece of stock on hand. Side by side is tried first, then one behind the
 * other, then rows as wide as the stock or the machine allows; if none fits, the
 * edge waste is squeezed down toward the least the cut needs. If nothing fits, the
 * result is the layout that would, with a warning.
 *
 * `parts` are as they lie on the blank: a turned part comes in with its width and
 * height swapped. `fixed`: the stock may not be turned (its grain runs along its height
 * or width as given).
 */
export function chooseLayout(
  ops: Operation[],
  parts: Part[],
  thickness: Mm,
  machine: MachineProfile,
  stock?: Size,
  fixed = false,
  /** The blank may be as long as the machine tiles: for one part too long for the cutting area. Its side waste is wide enough for the pins. */
  tile = false,
): BlankLayout {
  const long = tile && machine.tiling ? machine.tiling.maxLength.mm : undefined;
  const wanted = Math.max(machine.nesting.edgeMargin ?? DEFAULT_EDGE_MARGIN, long ? TILE_SIDE_MARGIN : 0);
  const least = long ? TILE_SIDE_MARGIN : PART_ALLOWANCE;
  const area: Size = { width: machine.cuttingArea.x.mm, height: long ?? machine.cuttingArea.y.mm };
  const spacing = machine.nesting.partSpacing;
  /** Rows wrapped to each width the blank could have: the stock either way round, or the machine. */
  const wrapped = (margin: Mm): Arrangement[] => {
    const widths = (stock ? (fixed ? [stock.width] : [stock.width, stock.height]) : [area.width]).filter((w) => w <= area.width + EPS);
    const found: number[][] = [];
    for (const width of widths) {
      const counts = wrapRows(parts, spacing, width - 2 * margin);
      const plain = counts.length === 1 || counts.length === parts.length; // the same as 'row' or 'column'
      if (!plain && !found.some((f) => f.join() === counts.join())) found.push(counts);
    }
    return found;
  };
  const onMachine = (b: Size) => b.width <= area.width + EPS && b.height <= area.height + EPS;
  const ok = (b: Size) => (!stock || within(b, stock, fixed)) && onMachine(b);

  const attempt = (margin: Mm): { blank: Size; arrangement: Arrangement } | null => {
    const arrangements: Arrangement[] = parts.length > 1 ? ['row', 'column', ...(parts.length > 2 ? wrapped(margin) : [])] : ['row'];
    for (const arrangement of arrangements) {
      // Quick no: the parts and their margin alone are already too big.
      const total = extent(parts, spacing, arrangement);
      if (!ok({ width: total.width + 2 * margin, height: total.height + 2 * margin })) continue;
      const raw = smallestFor(ops, parts, thickness, machine, arrangement, margin);
      const rounded = { width: roundUp(raw.width), height: roundUp(raw.height) };
      if (ok(rounded)) return { blank: rounded, arrangement };
      if (ok(raw)) return { blank: raw, arrangement };
    }
    return null;
  };

  // The widest margin that fits, in half millimetres from the wanted one down to the least. A smaller
  // margin never makes a blank bigger, so the search halves the range instead of trying each step:
  // parts that do not fit at the least margin fit at none (nesting asks that of many sets of parts).
  const steps = Math.max(0, Math.floor((wanted - least + EPS) / 0.5));
  const marginAt = (step: number) => wanted - step * 0.5;
  let best: { found: NonNullable<ReturnType<typeof attempt>>; margin: Mm } | null = null;
  const first = attempt(wanted);
  if (first) best = { found: first, margin: wanted };
  else if (steps > 0) {
    const last = attempt(marginAt(steps));
    if (last) {
      best = { found: last, margin: marginAt(steps) };
      // Between a step that does not fit (lo) and one that does (hi).
      let lo = 0;
      let hi = steps;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const found = attempt(marginAt(mid));
        if (found) {
          best = { found, margin: marginAt(mid) };
          hi = mid;
        } else lo = mid;
      }
    }
  }
  if (best) {
    const { found, margin } = best;
    const warnings: PlanWarning[] =
      margin < wanted - EPS
        ? [{
            code: 'tightMargins',
            message: `To fit your stock, the waste left around the parts is ${margin} mm instead of ${wanted} mm. Hold the blank down carefully.`,
          }]
        : [];
    return { ...found, edgeMargin: margin, warnings };
  }

  // Nothing fits: show what would be needed.
  const raw = smallestFor(ops, parts, thickness, machine, 'row', wanted);
  const blank = { width: roundUp(raw.width), height: roundUp(raw.height) };
  return {
    blank,
    arrangement: 'row',
    edgeMargin: wanted,
    warnings: [{
      code: 'stockTooSmall',
      message: stock && !within(blank, stock, fixed)
        ? 'These parts do not fit on one piece of your stock, side by side, one behind the other or in rows.'
        : `These parts do not fit in the ${machine.name}'s cutting area on one blank.`,
    }],
  };
}

/** For a piece the user entered: the first arrangement that fits on it. */
export function arrangementFor(ops: Operation[], parts: Part[], blank: Blank, machine: MachineProfile): Arrangement {
  const fits = (a: Arrangement) => !planSetups(ops, parts, blank, machine, a).warnings.some((w) => w.code === 'blankTooSmall');
  if (parts.length < 2 || fits('row')) return 'row';
  if (fits('column')) return 'column';
  const rows = wrapRows(parts, machine.nesting.partSpacing, blank.width - 2 * PART_ALLOWANCE);
  return fits(rows) ? rows : 'row';
}

function probeSpot(machine: MachineProfile, blank: Blank, keepOut: Rect[]): { at: Point; note?: string } | null {
  const { clearSquare: size, edgeInset } = machine.probe;
  const step = 5;
  let best: { at: Point; d: number } | null = null;
  for (let x = edgeInset; x + size <= blank.width - edgeInset; x += step) {
    // Nothing this far right can be nearer than the best so far.
    if (best && x >= best.d) break;
    let y = edgeInset;
    while (y + size <= blank.height - edgeInset) {
      const square = { x0: x, y0: y, x1: x + size, y1: y + size };
      const hit = keepOut.find((k) => rectsOverlap(square, k));
      if (hit) {
        // Every step up to the last one below the back of what is in the way overlaps it too: go on from there.
        const steps = Math.floor((hit.y1 - edgeInset) / step - 1e-9);
        y = Math.max(y + step, edgeInset + steps * step);
        continue;
      }
      const d = Math.hypot(x, y);
      if (!best || d < best.d) best = { at: { x: x + size / 2, y: y + size / 2 }, d };
      break; // squares further back at this x are further away
    }
  }
  if (!best) return null;
  const moved = best.at.x > edgeInset + size / 2 + 1e-6 || best.at.y > edgeInset + size / 2 + 1e-6;
  return moved
    ? { at: best.at, note: `${Math.round(best.at.x)} mm right and ${Math.round(best.at.y)} mm back from the front-left corner` }
    : { at: best.at };
}

export function planSetups(
  ops: Operation[],
  parts: Part[],
  blank: Blank,
  machine: MachineProfile,
  arrangement: Arrangement = 'row',
  /** Ids of the parts that lie a quarter turn round; `parts` already has their sizes swapped. */
  turned: ReadonlySet<Id> = new Set(),
): { setups: Setup[]; warnings: PlanWarning[] } {
  const warnings: PlanWarning[] = [];
  const cnc = ops.filter(isCnc);
  if (parts.length === 0) return { setups: [], warnings };

  const { placements, fits } = layoutFrontUp(parts, blank, machine.nesting.partSpacing, arrangement);
  if (!fits) {
    warnings.push({ code: 'blankTooSmall', message: 'The blank is too small for these parts with room to cut around them.' });
  }
  const worked = facesWorked(ops, parts);
  const flip = [...worked.values()].some((faces) => faces.size === 2);
  // A blank longer than the cutting area is tiled where the machine can; not one that is flipped as well.
  const tiled = !flip && isTiled(blank, machine);
  if (!tiled && (blank.width > machine.cuttingArea.x.mm || blank.height > machine.cuttingArea.y.mm)) {
    warnings.push({
      code: 'outsideCuttingArea',
      message: flip && isTiled(blank, machine) ? `The blank is longer than the ${machine.name}'s cutting area and has work on both faces: it cannot be slid along and flipped as well.` : `The blank is larger than the ${machine.name}'s cutting area.`,
    });
  }
  const any = (face: 'A' | 'B') => [...worked.values()].some((faces) => faces.has(face));
  // Without a flip the blank shows its back only when nothing on it wants its front.
  const faces: ('A' | 'B')[] = flip ? ['B', 'A'] : [any('B') && !any('A') ? 'B' : 'A'];
  const pinInset = machine.nesting.pinInset;
  const pins: Point[] = flip
    ? [
        { x: blank.width / 2, y: pinInset },
        { x: blank.width / 2, y: blank.height - pinInset },
      ]
    : [];
  const pinR = pinHoleDiameter(machine) / 2 + PART_ALLOWANCE / 2;
  const pinRects = pins.map((p) => ({ x0: p.x - pinR, y0: p.y - pinR, x1: p.x + pinR, y1: p.y + pinR }));

  const setups = faces.map((faceUp, i): Setup => {
    const placed = parts.map((part) => {
      const front = placements.get(part.id)!;
      // Flipping left to right mirrors X across the blank; the pins sit on that axis.
      const origin = faceUp === 'B' ? { x: blank.width - front.x - part.size.width, y: front.y } : front;
      // On a blank that is not flipped, a part whose work is all on one face lies that face up.
      const own = worked.get(part.id);
      const up = !flip && own?.size === 1 ? [...own][0]! : faceUp;
      return { partId: part.id, origin, mirrored: up === 'B', size: part.size };
    });
    const upFace = new Map(placed.map((p) => [p.partId, p.mirrored ? 'B' : 'A']));
    /** True when the operation has a feature whose face is up on its part in this setup. */
    const cutsHere = (op: Operation) =>
      op.source.kind === 'features' &&
      op.source.refs.some((ref) => {
        const feature = parts.find((p) => p.id === ref.partId)?.features.find((f) => f.id === ref.featureId);
        return feature !== undefined && workFace(op, feature) === upFace.get(ref.partId);
      });
    const partRects = placed.map((p) =>
      insetRect({ x0: p.origin.x, y0: p.origin.y, x1: p.origin.x + p.size.width, y1: p.origin.y + p.size.height }, -PART_ALLOWANCE),
    );
    if (pinRects.some((pin) => partRects.some((part) => rectsOverlap(pin, part)))) {
      warnings.push({ code: 'blankTooSmall', message: 'There is no room for the flip pins clear of the parts.' });
    }
    const spot = probeSpot(machine, blank, [...partRects, ...pinRects]);
    if (!spot) {
      warnings.push({ code: 'blankTooSmall', message: 'There is no uncut spot on the blank for the probe plate.' });
    } else if (spot.note) {
      warnings.push({ code: 'probeSpotMoved', message: `Setup ${i + 1}: the probe spot is ${spot.note}.` });
    }
    const last = i === faces.length - 1;
    const here = cnc.filter((op) => {
      if (op.kind === 'cutout') return last;
      if (op.kind === 'pinHole') return i === 0;
      return cutsHere(op);
    });
    here.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    const half = machine.probe.edgeInset + machine.probe.clearSquare / 2;
    return {
      index: (i + 1) as 1 | 2,
      faceUp,
      flipBefore: i === 0 ? 'none' : { kind: 'sheetOnPins', direction: 'leftToRight' },
      operationKeys: here.map((op) => op.key),
      placements: placed.map(({ partId, origin, mirrored: m }) => ({ partId, origin, mirrored: m, turned: turned.has(partId) })),
      pinHoles: pins,
      probeSpot: spot ?? { at: { x: half, y: half } },
    };
  });
  if (!tiled) return { setups, warnings };

  // Tiled: the one setup becomes two on the same face. The first cuts the front of the
  // blank and drills two pairs of pin holes through its side waste into the spoilboard,
  // the pairs `shift` apart along Y. The sheet is then slid `shift` toward the front and
  // its rear pair of holes dropped onto pins in the front pair's sockets; the second
  // setup cuts the rest.
  const whole = setups[0]!;
  const reach = machine.cuttingArea.y.mm;
  const shift = Math.ceil((blank.height - reach + TILE_REACH_MARGIN) / 5) * 5;
  const sizeOf = new Map(parts.map((p) => [p.id, p.size]));
  const partRects = whole.placements.map((p) => {
    const size = sizeOf.get(p.partId)!;
    return insetRect({ x0: p.origin.x, y0: p.origin.y, x1: p.origin.x + size.width, y1: p.origin.y + size.height }, -PART_ALLOWANCE);
  });
  const left = Math.min(...partRects.map((r) => r.x0));
  const right = Math.max(...partRects.map((r) => r.x1));
  const pinXs = [left / 2, (right + blank.width) / 2];
  const front = pinXs.map((x) => ({ x, y: TILE_PIN_FROM_FRONT }));
  const rear = pinXs.map((x) => ({ x, y: TILE_PIN_FROM_FRONT + shift }));
  const tilePins = [...front, ...rear];
  const tilePinRects = tilePins.map((p) => ({ x0: p.x - pinR, y0: p.y - pinR, x1: p.x + pinR, y1: p.y + pinR }));
  const tileWarnings = warnings.filter((w) => w.code !== 'probeSpotMoved' && w.message !== 'There is no uncut spot on the blank for the probe plate.');
  if (tilePinRects.some((pin) => pin.x0 < 0 || pin.x1 > blank.width || partRects.some((part) => rectsOverlap(pin, part)))) {
    tileWarnings.push({ code: 'blankTooSmall', message: 'There is no room at the sides of the blank for the pins it is slid along on.' });
  }
  if (TILE_PIN_FROM_FRONT + shift > reach - TILE_REACH_MARGIN) {
    tileWarnings.push({ code: 'outsideCuttingArea', message: `The blank is too long to be slid along on the ${machine.name}: its rear pin holes would be out of reach.` });
  }

  // The join: anywhere both set-ups reach, as near the middle of that as no hole is in the way.
  const [lo, hi] = [shift + TILE_REACH_MARGIN, reach - TILE_REACH_MARGIN];
  const laid = new Map(parts.map((p) => [p.id, p]));
  const yOf = (placement: Setup['placements'][number], p: Point) => placement.origin.y + (placement.turned ? p.x : p.y);
  /** What a feature takes up along the blank's Y. */
  const span = (placement: Setup['placements'][number], f: Feature): [Mm, Mm] | undefined => {
    if (f.kind === 'hole' || f.kind === 'cup') {
      const y = yOf(placement, f.center);
      return [y - f.diameter / 2, y + f.diameter / 2];
    }
    if (f.kind === 'dado') {
      const ys = f.outline.map((p) => yOf(placement, p));
      return [Math.min(...ys), Math.max(...ys)];
    }
    return undefined;
  };
  const holes = whole.placements.flatMap((placement) =>
    (laid.get(placement.partId)?.features ?? []).flatMap((f) => (f.kind === 'hole' || f.kind === 'cup' ? [span(placement, f)!] : [])),
  );
  const clear = (y: Mm) => holes.every(([y0, y1]) => y < y0 - TILE_CLEAR_OF_HOLE || y > y1 + TILE_CLEAR_OF_HOLE);
  const middle = (lo + hi) / 2;
  let join = middle;
  for (let d = 0; d <= (hi - lo) / 2; d += 1) {
    const found = [middle - d, middle + d].find(clear);
    if (found !== undefined) {
      join = found;
      break;
    }
  }

  const half = machine.probe.edgeInset + machine.probe.clearSquare / 2;
  /** The probe spot of a tile: on what the machine reaches of the sheet once it is slid `by`. */
  const spotFor = (by: Mm, index: number) => {
    const moved = (r: Rect): Rect => ({ ...r, y0: r.y0 - by, y1: r.y1 - by });
    const spot = probeSpot(machine, { ...blank, height: Math.min(blank.height - by, reach) }, [...partRects, ...tilePinRects].map(moved));
    if (!spot) tileWarnings.push({ code: 'blankTooSmall', message: 'There is no uncut spot on the blank for the probe plate.' });
    else if (spot.note) tileWarnings.push({ code: 'probeSpotMoved', message: `Setup ${index}: the probe spot is ${spot.note}.` });
    return spot ?? { at: { x: half, y: half } };
  };
  /** The setup's rows that have something to cut in a band: every row but those whose holes and recesses all lie outside it. */
  const keysIn = (from: Mm, to: Mm, withPins: boolean) =>
    whole.operationKeys.filter((key) => {
      const op = cnc.find((o) => o.key === key)!;
      if (op.kind === 'pinHole') return withPins;
      if (op.source.kind !== 'features') return true;
      const spans = op.source.refs.flatMap((ref) => {
        const placement = whole.placements.find((p) => p.partId === ref.partId);
        const feature = placement && laid.get(ref.partId)?.features.find((f) => f.id === ref.featureId);
        return placement && feature ? [span(placement, feature)] : [];
      });
      return spans.some((s) => !s || (s[1] >= from - TILE_OVERLAP && s[0] <= to + TILE_OVERLAP));
    });
  return {
    setups: [
      { ...whole, index: 1, operationKeys: keysIn(0, join, true), pinHoles: tilePins, probeSpot: spotFor(0, 1), tile: { from: 0, to: join, shift: 0 } },
      {
        ...whole,
        index: 2,
        flipBefore: { kind: 'slideOnPins', distance: shift },
        operationKeys: keysIn(join, blank.height, false),
        pinHoles: [],
        probeSpot: spotFor(shift, 2),
        tile: { from: join, to: blank.height, shift },
      },
    ],
    warnings: tileWarnings,
  };
}
