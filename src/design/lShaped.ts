/**
 * The L-shaped corner cabinet (milestone 6), for a lazy susan: square in plan from outside,
 * `size.width` along each wall, the inside corner cut out `size.depth` deep, so its front
 * is two faces meeting at 90°. A door on each face; the two are hinged together (bi-fold)
 * and the pair on the cabinet's side. Frameless or shop style.
 *
 * Its own frame runs along the face parallel to its run's wall (face 1): X across it from
 * its left end, Z out of it. The other face (face 2) is square to it, at the corner end of
 * face 1, facing along the run. In corner coordinates (p along the run's wall from the
 * room's corner, q out from that wall) the outline is (0,0) (A,0) (A,D) (D,D) (D,A) (0,A).
 */
import type { CabinetDesign, Material, Mm, Part, Point, Vec3 } from '@/model';
import { withGrain } from './grain';
import { thicknessOf, toeKickOf } from './style';

/** What the openings keep of the corner where the two faces meet (once a post's width; no post is made): face 1's door stops beside it, face 2's clears face 1's. Tune me. */
export const CORNER_POST: Mm = 38;

/** How far a sleeper under a corner cabinet's bottom stands in from the wall, clear of the hump where a floor meets it. Tune me. */
export const SLEEPER_INSET: Mm = 50;

type Plan2 = [Mm, Mm];

/** Corner coordinates to the cabinet's own frame (x, z). */
export function lShapedFrame(cabinet: Pick<CabinetDesign, 'size' | 'corner'>): (p: Mm, q: Mm) => Plan2 {
  const A = cabinet.size.width.mm;
  const D = cabinet.size.depth.mm;
  const left = cabinet.corner?.side !== 'right';
  return (p, q) => [left ? p - D : A - p, q - D];
}

/** Whether the cabinet's two doors are fixed to a lazy susan made here, on a pole, and turn with it (`LazySusan.doors`). */
export const doorsOnSusan = (cabinet: Pick<CabinetDesign, 'corner'>): boolean =>
  cabinet.corner?.kind === 'lShaped' && cabinet.corner.susan?.turns === 'pole' && cabinet.corner.susan.doors === 'onSusan';

/** Each face's width: the width along a wall less the cut-out. */
export const lShapedFace = (cabinet: Pick<CabinetDesign, 'size'>): Mm => cabinet.size.width.mm - cabinet.size.depth.mm;

/**
 * Face 2's frame in the cabinet's: its front-left corner (seen from the room), and the
 * direction across it. In the left corner it faces +X at x = 0; in the right one, −X at
 * x = the face's width.
 */
export function lShapedFace2(cabinet: Pick<CabinetDesign, 'size' | 'corner'>): { origin: Vec3; xAxis: Vec3 } {
  const F = lShapedFace(cabinet);
  return cabinet.corner?.side === 'right' ? { origin: [F, 0, 0], xAxis: [0, 0, 1] } : { origin: [0, 0, F], xAxis: [0, 0, -1] };
}

/**
 * The case: an L bottom and top, two backs (the second butts the first), the two end
 * sides, and a toe kick board under each face on a base cabinet (no post at the corner). The
 * end sides stand on the floor and carry the top; the bottom fits between them and the
 * backs, which start at its underside; sleepers under it carry the back of the case and
 * the susan's pole. The lazy susan stands on the bottom; there are no shelves.
 */
export function deriveLShapedCaseParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const A = cabinet.size.width.mm;
  const D = cabinet.size.depth.mm;
  const H = cabinet.size.height.mm;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const tb = thicknessOf(materials, cabinet.materials.backId);
  const kick = toeKickOf(cabinet);
  const k = kick.height;
  const at = lShapedFrame(cabinet);
  const id = (key: string) => `${cabinet.id}/${key}`;
  const rect = (w: Mm, h: Mm): Point[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  // The middle of the L's corner block: inside the case whichever way the frame is mirrored.
  const inside = at(D / 2, D / 2);

  const flat = (key: string, name: string, outline: Plan2[], y: Mm): Part => {
    const minX = Math.min(...outline.map((p) => p[0]));
    const maxZ = Math.max(...outline.map((p) => p[1]));
    const points = outline.map(([x, z]) => ({ x: x - minX, y: maxZ - z }));
    // A left-hand cabinet's frame is mirrored, which turns the outline clockwise: a solid built from that is inside
    // out (the 3D view drew no top), so it is always given counter-clockwise.
    const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length]!.y - points[(i + 1) % points.length]!.x * p.y, 0);
    if (area < 0) points.reverse();
    return withGrain(
      {
        id: id(key),
        designObjectId: cabinet.id,
        name,
        materialId: cabinet.materials.caseId,
        size: { width: Math.max(...points.map((p) => p.x)), height: Math.max(...points.map((p) => p.y)), thickness: t },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: points }],
        role: 'bottom',
        shaped: true,
        placement: { origin: [minX, y, maxZ], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
      },
      'bottom',
      materials,
    );
  };
  /** An upright on the line from `a` to `b` (its outer face), face A toward the inside of the case. */
  const upright = (key: string, name: string, role: 'side' | 'back' | 'toeKick', a: Plan2, b: Plan2, bottom: Mm, height: Mm, thickness: Mm, materialId: string, toward: Plan2 = inside, notch?: { length: Mm; height: Mm }): Part => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let dir: Plan2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let from = a;
    // Face A's normal is X × Y = (-dir.z, 0, dir.x): turn the part round if that points out of the case.
    if (-dir[1] * (toward[0] - a[0]) + dir[0] * (toward[1] - a[1]) < 0) {
      dir = [-dir[0], -dir[1]];
      from = b;
    }
    const n: Plan2 = [-dir[1], dir[0]];
    // A toe-kick notch is at the end `b`, the side's front: the part's far end, or its near one when it was turned round.
    const shape: Point[] = !notch
      ? rect(len, height)
      : from === a
        ? [{ x: 0, y: 0 }, { x: len - notch.length, y: 0 }, { x: len - notch.length, y: notch.height }, { x: len, y: notch.height }, { x: len, y: height }, { x: 0, y: height }]
        : [{ x: notch.length, y: 0 }, { x: len, y: 0 }, { x: len, y: height }, { x: 0, y: height }, { x: 0, y: notch.height }, { x: notch.length, y: notch.height }];
    return withGrain(
      {
        id: id(key),
        designObjectId: cabinet.id,
        name,
        materialId,
        size: { width: len, height, thickness },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: shape }],
        role,
        placement: { origin: [from[0] + n[0] * thickness, bottom, from[1] + n[1] * thickness], xAxis: [dir[0], 0, dir[1]], yAxis: [0, 1, 0] },
      },
      role,
      materials,
    );
  };

  const outline: Plan2[] = [at(0, 0), at(A, 0), at(A, D), at(D, D), at(D, A), at(0, A)];
  // The end sides stand on the floor and run up to the top, as a cabinet's sides do, notched for the toe kick; the
  // backs start at the underside of the bottom, which fits between them all (a back on the
  // floor rocks on a floor that is not flat, worst in a room's corner).
  const between: Plan2[] = [at(tb, tb), at(A - t, tb), at(A - t, D), at(D, D), at(D, A - t), at(tb, A - t)];
  const full = H - t;
  const notch = k > 0 && kick.depth > 0 ? { length: kick.depth, height: k } : undefined;
  const parts: Part[] = [
    flat('bottom', 'Bottom', between, k + t),
    flat('top', 'Top', outline, H),
    upright('back-1', 'Back along the run', 'back', at(0, 0), at(A, 0), k, full - k, tb, cabinet.materials.backId),
    upright('back-2', 'Back along the other wall', 'back', at(0, tb), at(0, A), k, full - k, tb, cabinet.materials.backId),
    upright('side-1', 'End side', 'side', at(A, tb), at(A, D), 0, full, t, cabinet.materials.caseId, at(D, D / 2), notch),
    upright('side-2', 'Other end side', 'side', at(tb, A), at(D, A), 0, full, t, cabinet.materials.caseId, at(D / 2, D), notch),
  ];
  // No post stands where the two faces meet, or the lazy susan could not turn: a pie-cut shelf's round part passes
  // through that corner as it turns. `CORNER_POST`
  // is still what the doors keep clear of the corner, for each other.
  if (k > 0) {
    // A board under each face, set back by the toe kick's depth.
    const kd = kick.depth;
    parts.push(
      upright('toe-kick', 'Toe kick', 'side', at(D - kd, D - kd), at(A - t, D - kd), 0, k, t, cabinet.materials.caseId, at(D, D / 2)),
      upright('toe-kick-2', 'Toe kick, other face', 'side', at(D - kd, D - kd + t), at(D - kd, A - t), 0, k, t, cabinet.materials.caseId, at(D / 2, D)),
    );
    for (const p of parts.slice(-2)) p.role = 'toeKick';
    // Sleepers under the bottom, shimmed level when the cabinet is set: one near each wall, in from it, and one
    // under the lazy susan's pole (the middle of the square), from the first back to the line of the toe kick.
    const s = SLEEPER_INSET;
    const pole = Math.min(A / 2, D - kd - t);
    parts.push(
      upright('sleeper-back-1', 'Sleeper, along the run', 'toeKick', at(s, s), at(A - t, s), 0, k, t, cabinet.materials.caseId),
      upright('sleeper-back-2', 'Sleeper, along the other wall', 'toeKick', at(s, s + t), at(s, A - t), 0, k, t, cabinet.materials.caseId),
      upright('sleeper-middle', 'Sleeper, under the pole', 'toeKick', at(pole - t / 2, s + t), at(pole - t / 2, D - kd), 0, k, t, cabinet.materials.caseId, at(pole + t, D / 2)),
    );
  }
  return parts;
}

/** The lazy susan's round shelves: the width along a wall less 8" (a 28" pie-cut susan in a 36" cabinet). Tune me. */
export function lazySusanDiameter(cabinet: Pick<CabinetDesign, 'size'>): Mm {
  return Math.max(0, cabinet.size.width.mm - 8 * 25.4);
}
