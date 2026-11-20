/**
 * Closets. A hanging rod inside a case: a bought rod across an open row, between the
 * sides, on a pair of bought flanges. Nothing is made for it: it is on the hardware list, cut to length by hand,
 * and drawn so that what hangs under it can be judged.
 */
import type { CabinetDesign, CabinetOpening, Material, Mm, Part, Project, TowerSpan } from '@/model';
import { withGrain } from './grain';
import { SHELF_SPAN } from './shelves';
import { MM_PER_INCH } from '@/units';
import { bayCount } from './bays';
import { deriveCabinetOpenings } from './openings';
import { cabinetsOf } from './settings';
import { thicknessOf } from './style';

/** A closet rod: 1-5/16" across, the usual wooden or steel one. Tune me. */
export const ROD_DIAMETER: Mm = (21 / 16) * MM_PER_INCH;
/** The rod's centre below the top of its opening, when the cabinet does not say: room to lift a hanger off. Tune me. */
export const ROD_DOWN: Mm = 2.5 * MM_PER_INCH;
/** The rod's centre in front of the back, at most: a hanger is about 17" wide, so 11" to 12" from the wall behind. Tune me. */
export const ROD_FROM_BACK: Mm = 11.5 * MM_PER_INCH;
/** What a hanging garment wants under the rod: shirts and folded trousers, and long coats and dresses. Tune me. */
export const HANGING = { short: 40 * MM_PER_INCH, long: 64 * MM_PER_INCH };

export interface ClosetRod {
  /** The opening it is in. */
  opening: CabinetOpening;
  /** Between the sides: what the rod is cut to, less a little for its flanges. */
  length: Mm;
  /** Its centre, in the cabinet's frame: from the left outside, up from the floor, behind the case front. */
  x0: Mm;
  y: Mm;
  behind: Mm;
  /** From the rod's centre down to the floor of its opening. */
  clearUnder: Mm;
}

/** Whether a cabinet may have a rod: a box made here with a row that is open and one bay. */
export const takesRod = (cabinet: Pick<CabinetDesign, 'layout' | 'existing' | 'corner'>): boolean =>
  !cabinet.existing && cabinet.corner?.kind !== 'diagonal' && cabinet.corner?.kind !== 'lShaped' && bayCount(cabinet) === 1 && cabinet.layout.rows.some((r) => r.use === 'doors' && r.open);

/**
 * The cabinet's hanging rod, where it has one: in the row it names, or its lowest open row. Nothing when it has
 * none, or no open row to hang it in.
 */
export function closetRod(cabinet: CabinetDesign, materials: Material[]): ClosetRod | undefined {
  if (!cabinet.rod || !takesRod(cabinet)) return undefined;
  const open = deriveCabinetOpenings(cabinet, materials).filter((o) => o.open);
  const opening = open.find((o) => o.rowId === cabinet.rod!.rowId) ?? open.at(-1);
  if (!opening) return undefined;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const down = cabinet.rod.down?.mm ?? ROD_DOWN;
  const depth = cabinet.size.depth.mm;
  return {
    opening,
    length: cabinet.size.width.mm - 2 * t,
    x0: t,
    y: opening.origin.y + opening.height - down,
    // In the middle of a shallow case; no further from the back than a hanger wants in a deep one.
    behind: Math.max(depth / 2, depth - ROD_FROM_BACK),
    clearUnder: opening.height - down,
  };
}

/** A span's cleats: this tall, and this much shorter than the shelf is deep, set back from its front. Tune me. */
export const SPAN_CLEAT = { height: 2 * MM_PER_INCH, short: MM_PER_INCH };

/** Whether a cabinet may have a shelf and a rod reaching from its sides: a tall one in no run, a box made here. */
export const takesSpans = (cabinet: Pick<CabinetDesign, 'form' | 'runId' | 'existing' | 'corner'>): boolean => cabinet.form === 'tall' && !cabinet.runId && !cabinet.existing && !cabinet.corner;

/** A stretch beside a tower as it is built: where it is, in the tower's frame, and what holds it. */
export interface BuiltSpan {
  side: 'left' | 'right';
  span: TowerSpan;
  /** From and to, along X: the tower's side and the wall (or the next tower's side). */
  x0: Mm;
  x1: Mm;
  /** The rod, when it has one: its centre's height and how far behind the case front, and what is clear under it. */
  rod?: { y: Mm; behind: Mm; clearUnder: Mm };
  /** Brackets under a shelf too long to carry clothes between its ends: so many, evenly along it. */
  brackets: number;
}

/** The stretches beside a tower, left and right, as they are built. */
export function towerSpans(cabinet: CabinetDesign, materials: Material[]): BuiltSpan[] {
  if (!cabinet.spans || !takesSpans(cabinet)) return [];
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const depth = cabinet.size.depth.mm;
  const limit = SHELF_SPAN.at19 * (t / 19.05);
  return (['left', 'right'] as const).flatMap((side): BuiltSpan[] => {
    const span = cabinet.spans![side];
    if (!span || span.length.mm <= 0) return [];
    const [x0, x1] = side === 'left' ? [-span.length.mm, 0] : [cabinet.size.width.mm, cabinet.size.width.mm + span.length.mm];
    // The rod hangs under the shelf, or at the shelf's height when there is none.
    const rodY = span.noShelf ? span.up.mm : span.up.mm - t - ROD_DOWN;
    return [
      {
        side,
        span,
        x0,
        x1,
        ...(span.rod || span.noShelf ? { rod: { y: rodY, behind: Math.max(depth / 2, depth - ROD_FROM_BACK), clearUnder: rodY } } : {}),
        brackets: Math.max(0, Math.ceil(span.length.mm / limit) - 1),
      },
    ];
  });
}

/**
 * The parts made for the stretches beside a tower: each one's shelf, as deep as the tower, and a cleat
 * under each of its ends, one screwed to the tower's side and one to the wall (or to the next tower's side).
 * In the tower's frame, outside its box. The rod is bought.
 */
export function spanParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const depth = cabinet.size.depth.mm;
  const rect = (w: Mm, h: Mm) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const part = (key: string, name: string, role: 'shelf' | 'stretcher', width: Mm, height: Mm, origin: [Mm, Mm, Mm], xAxis: [Mm, Mm, Mm], yAxis: [Mm, Mm, Mm]): Part =>
    withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId: cabinet.materials.caseId,
        size: { width, height, thickness: t },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(width, height) }],
        role,
        placement: { origin, xAxis, yAxis },
      },
      role,
      materials,
    );
  return towerSpans(cabinet, materials).flatMap((s): Part[] => {
    if (s.span.noShelf) return [];
    const up = s.span.up.mm;
    const cleat = depth - SPAN_CLEAT.short;
    const under = up - t - SPAN_CLEAT.height;
    // A cleat stands on edge against what it is screwed to, running back from just behind the shelf's front edge:
    // face A toward the span, its thickness toward the tower's side or the wall.
    // Facing right (1) it lies from `x` less its thickness to `x`; facing left (-1), from `x` to `x` and its thickness.
    const against = (key: string, name: string, x: Mm, facing: 1 | -1) =>
      part(key, name, 'stretcher', cleat, SPAN_CLEAT.height, [x, under, facing > 0 ? -SPAN_CLEAT.short : -depth], facing > 0 ? [0, 0, -1] : [0, 0, 1], [0, 1, 0]);
    const far = s.span.to === 'wall' ? 'on the wall' : 'on the next tower';
    return [
      // The shelf: flat, its top face up, from the tower's side to the wall.
      part(`span-${s.side}-shelf`, `Shelf to the ${s.side}`, 'shelf', s.x1 - s.x0, depth, [s.x0, up, 0], [1, 0, 0], [0, 0, -1]),
      ...(s.side === 'left'
        ? [against('span-left-cleat-tower', 'Shelf cleat, left, on the tower', -t, -1), against('span-left-cleat-far', `Shelf cleat, left, ${far}`, s.x0 + t, 1)]
        : [against('span-right-cleat-tower', 'Shelf cleat, right, on the tower', s.x0 + t, 1), against('span-right-cleat-far', `Shelf cleat, right, ${far}`, s.x1 - t, -1)]),
    ];
  });
}

/** What hangs under a rod with this much clear under it, in words. */
export function hangingWords(clearUnder: Mm): string {
  if (clearUnder >= HANGING.long) return 'room for long coats and dresses';
  if (clearUnder >= HANGING.short) return 'room for shirts, jackets and folded trousers; not for long coats';
  return 'less than shirts and jackets want (about 40"): lower the shelf under it, or hang the rod higher';
}

/**
 * The rods as the 3D view draws them: a square stick where the round rod is, as long as it is cut. For the
 * picture only (`existing`: drawn grey, never cut, listed or planned).
 */
export function rodShapes(project: Project, materials: Material[]): Part[] {
  return cabinetsOf(project).flatMap((cabinet): Part[] => {
    let rod: ClosetRod | undefined;
    try {
      rod = closetRod(cabinet, materials);
    } catch {
      return [];
    }
    const d = ROD_DIAMETER;
    // The rods of the stretches beside a tower, drawn the same way.
    const beside = (() => {
      try {
        return towerSpans(cabinet, materials);
      } catch {
        return [];
      }
    })().flatMap((s): Part[] =>
      s.rod
        ? [
            {
              id: `${cabinet.id}/span-${s.side}-rod/shape`,
              designObjectId: cabinet.id,
              name: `Hanging rod to the ${s.side} (bought)`,
              materialId: cabinet.materials.caseId,
              size: { width: s.x1 - s.x0, height: d, thickness: d },
              features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: s.x1 - s.x0, y: 0 }, { x: s.x1 - s.x0, y: d }, { x: 0, y: d }] }],
              role: 'shelf',
              existing: true,
              placement: { origin: [s.x0, s.rod.y - d / 2, -s.rod.behind + d / 2], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
            },
          ]
        : [],
    );
    if (!rod) return beside;
    return [
      ...beside,
      {
        id: `${cabinet.id}/rod/shape`,
        designObjectId: cabinet.id,
        name: 'Hanging rod (bought)',
        materialId: cabinet.materials.caseId,
        size: { width: rod.length, height: d, thickness: d },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: rod.length, y: 0 }, { x: rod.length, y: d }, { x: 0, y: d }] }],
        role: 'shelf',
        existing: true,
        placement: { origin: [rod.x0, rod.y - d / 2, -rod.behind + d / 2], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
      },
    ];
  });
}

