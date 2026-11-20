/**
 * The diagonal corner cabinet (milestone 6): in plan a five-sided box in a room's corner,
 * two backs along the walls, two short sides square to the walls and a diagonal front
 * at 45°. `size.width` is how far it runs along each wall, `size.depth` its short sides.
 *
 * It is drawn and cut in its own frame like any cabinet, but that frame runs along its
 * diagonal front: X across the front from its left end, Z out of it, so its openings, doors
 * and hinges are an ordinary cabinet's. The case parts stand at 45° in that frame, and the
 * room layout turns the cabinet the other 45° into its corner (`diagonalPlace`).
 */
import type { CabinetDesign, Material, Mm, Part, Point, Vec3 } from '@/model';
import { withGrain } from './grain';
import { SLEEPER_INSET } from './lShaped';
import { constructionRules, thicknessOf, toeKickOf } from './style';

const R2 = Math.SQRT2;

/** The cabinet's plan in its own frame (x, z): its front, its two backs' corner and the backs' ends. */
export function diagonalPlan(cabinet: Pick<CabinetDesign, 'size'>): { front: Mm; fl: [Mm, Mm]; fr: [Mm, Mm]; r: [Mm, Mm]; q: [Mm, Mm]; l: [Mm, Mm] } {
  const A = cabinet.size.width.mm;
  const d = cabinet.size.depth.mm;
  const front = R2 * (A - d);
  return { front, fl: [0, 0], fr: [front, 0], r: [(2 * A - d) / R2, -d / R2], q: [front / 2, -(A + d) / R2], l: [-d / R2, -d / R2] };
}

/** The width of the cabinet's face: its diagonal front for a diagonal corner cabinet, else its width. */
export function frontWidth(cabinet: Pick<CabinetDesign, 'size' | 'corner'>): Mm {
  return cabinet.corner?.kind === 'diagonal' ? diagonalPlan(cabinet).front : cabinet.size.width.mm;
}

/** A convex polygon (counter-clockwise or clockwise) with each edge moved in by its own distance. */
export function insetPolygon(points: [Mm, Mm][], by: Mm[]): [Mm, Mm][] {
  const n = points.length;
  const area = points.reduce((s, p, i) => s + p[0] * points[(i + 1) % n]![1] - points[(i + 1) % n]![0] * p[1], 0);
  const turn = area > 0 ? 1 : -1;
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n]!;
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const len = Math.hypot(dx, dy);
    // The inward normal: left of the edge on a counter-clockwise polygon.
    const [nx, ny] = [(-dy / len) * turn, (dx / len) * turn];
    return { p: [p[0] + nx * by[i]!, p[1] + ny * by[i]!] as [Mm, Mm], d: [dx, dy] as [Mm, Mm] };
  });
  return lines.map((a, i) => {
    const b = lines[(i + n - 1) % n]!;
    // Where the previous edge's line meets this one's.
    const det = b.d[0] * a.d[1] - b.d[1] * a.d[0];
    const t = ((a.p[0] - b.p[0]) * a.d[1] - (a.p[1] - b.p[1]) * a.d[0]) / det;
    return [b.p[0] + b.d[0] * t, b.p[1] + b.d[1] * t] as [Mm, Mm];
  });
}

/** Front set-back of a shelf behind the doors, so they close. Tune me. */
const SHELF_SETBACK: Mm = 25;

/**
 * The case of a diagonal corner cabinet: a five-sided bottom and top, two backs, two
 * short sides, a toe kick under the front on a base cabinet, and its adjustable shelves,
 * five-sided too. The sides stand on the floor and carry the top; the bottom fits between them and the backs, which
 * start at its underside, on sleepers; the shelves
 * are spaced evenly between them and sit on pins (drilled by hand: see the plan).
 */
export function deriveDiagonalCaseParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const plan = diagonalPlan(cabinet);
  const rules = constructionRules(cabinet, materials);
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const tb = thicknessOf(materials, cabinet.materials.backId);
  const H = cabinet.size.height.mm;
  const kick = toeKickOf(cabinet);
  const k = kick.height;
  const id = (key: string) => `${cabinet.id}/${key}`;
  const rect = (w: Mm, h: Mm): Point[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

  /** A flat part in the cabinet: its outline in plan, its face A up at height `y`. */
  const flat = (key: string, name: string, role: 'bottom' | 'shelf', outline: [Mm, Mm][], y: Mm): Part => {
    const minX = Math.min(...outline.map((p) => p[0]));
    const maxZ = Math.max(...outline.map((p) => p[1]));
    // The part's X runs with the cabinet's X, its Y back from the front (cabinet -Z).
    const points = outline.map(([x, z]) => ({ x: x - minX, y: maxZ - z }));
    const width = Math.max(...points.map((p) => p.x));
    const height = Math.max(...points.map((p) => p.y));
    return withGrain(
      {
        id: id(key),
        designObjectId: cabinet.id,
        name,
        materialId: cabinet.materials.caseId,
        size: { width, height, thickness: t },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: points }],
        role,
        shaped: true,
        placement: { origin: [minX, y, maxZ], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
      },
      role,
      materials,
    );
  };

  /** An upright panel standing on the line from `from` along `dir` (a unit vector in plan), its face A on the side `dir` turns left to (inside). */
  const upright = (key: string, name: string, role: 'side' | 'back' | 'toeKick', from: [Mm, Mm], dir: [Mm, Mm], length: Mm, bottom: Mm, height: Mm, thickness: Mm, materialId: string, notch?: { at: 'start' | 'end'; length: Mm; height: Mm }): Part => {
    // Face A's normal is X × Y: (-dir.z, 0, dir.x). The part runs back from face A by its thickness.
    const normal: Vec3 = [-dir[1], 0, dir[0]];
    const origin: Vec3 = [from[0] + normal[0] * thickness, bottom, from[1] + normal[2] * thickness];
    // A side's toe-kick notch, at whichever end of it is at the front.
    const shape: Point[] = !notch
      ? rect(length, height)
      : notch.at === 'end'
        ? [{ x: 0, y: 0 }, { x: length - notch.length, y: 0 }, { x: length - notch.length, y: notch.height }, { x: length, y: notch.height }, { x: length, y: height }, { x: 0, y: height }]
        : [{ x: notch.length, y: 0 }, { x: length, y: 0 }, { x: length, y: height }, { x: 0, y: height }, { x: 0, y: notch.height }, { x: notch.length, y: notch.height }];
    return withGrain(
      {
        id: id(key),
        designObjectId: cabinet.id,
        name,
        materialId,
        size: { width: length, height, thickness },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: shape }],
        role,
        placement: { origin, xAxis: [dir[0], 0, dir[1]], yAxis: [0, 1, 0] },
      },
      role,
      materials,
    );
  };

  const { fl, fr, r, q, l } = plan;
  const outline: [Mm, Mm][] = [fl, fr, r, q, l];
  const inside = H - k - 2 * t;
  const unit = (a: [Mm, Mm], b: [Mm, Mm]): [Mm, Mm] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };
  const along = (p: [Mm, Mm], dir: [Mm, Mm], by: Mm): [Mm, Mm] => [p[0] + dir[0] * by, p[1] + dir[1] * by];
  const A = cabinet.size.width.mm;
  const d = cabinet.size.depth.mm;
  // Back one along the first wall, from the corner; back two along the other, butting it.
  const toR = unit(q, r);
  const toQ = unit(l, q);
  // The sides stand on the floor and run up to the top, as a cabinet's sides do; the backs start at the underside of
  // the bottom, which fits between them all (a back on the floor rocks on a floor that is not
  // flat, worst in a room's corner). The toe kick board's face is the kick's depth behind the front, and the sides
  // stand at 45° to it, so their notch is that much longer along them.
  const full = H - t;
  const notch = (at: 'start' | 'end', length: Mm) => (k > 0 && kick.depth > 0 ? { at, length: Math.min(kick.depth * R2, length), height: k } : undefined);
  const parts: Part[] = [
    flat('bottom', 'Bottom', 'bottom', insetPolygon(outline, [0, t, tb, tb, t]), k + t),
    flat('top', 'Top', 'bottom', outline, H),
    upright('back-1', 'Back, right', 'back', q, toR, A, k, full - k, tb, cabinet.materials.backId),
    upright('back-2', 'Back, left', 'back', l, toQ, A - tb, k, full - k, tb, cabinet.materials.backId),
    // The short sides, square to the walls, from the backs to the front.
    upright('side-right', 'Right side', 'side', along(r, unit(r, fr), tb), unit(r, fr), d - tb, 0, full, t, cabinet.materials.caseId, notch('end', d - tb)),
    upright('side-left', 'Left side', 'side', fl, unit(fl, l), d - tb, 0, full, t, cabinet.materials.caseId, notch('start', d - tb)),
  ];
  // The top has the bottom's outline and its role; its name says which it is.
  if (k > 0) {
    // The board runs between the sides' inside faces, its ends cut square: to where its rear face meets them.
    const x0 = -kick.depth + (R2 - 1) * t;
    const board = plan.front - 2 * x0;
    parts.push(
      withGrain(
        {
          id: id('toe-kick'),
          designObjectId: cabinet.id,
          name: 'Toe kick',
          materialId: cabinet.materials.caseId,
          size: { width: board, height: k, thickness: t },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(board, k) }],
          role: 'toeKick',
          placement: { origin: [x0, 0, -kick.depth], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
        },
        'toeKick',
        materials,
      ),
    );
  }
  if (k > 0) {
    // Sleepers under the bottom, shimmed level when the cabinet is set: one near each wall, in from it, between the
    // sides, and one down the middle from where they meet to the back of the toe kick board.
    const s = SLEEPER_INSET;
    // Into the case from each wall: from the first, toward the other wall's far end; from the second, along the first.
    const in1: [Mm, Mm] = [-toQ[0], -toQ[1]];
    const meet = q[1] + (s + t) * R2 + t / 2;
    parts.push(
      upright('sleeper-back-1', 'Sleeper, back right', 'toeKick', along(along(q, in1, s), toR, s), toR, A - t - s, 0, k, t, cabinet.materials.caseId),
      upright('sleeper-back-2', 'Sleeper, back left', 'toeKick', along(along(l, toR, s), toQ, t), toQ, A - s - 2 * t, 0, k, t, cabinet.materials.caseId),
      upright('sleeper-middle', 'Sleeper, middle', 'toeKick', [plan.front / 2 - t / 2, -kick.depth - t], [0, -1], -kick.depth - t - meet, 0, k, t, cabinet.materials.caseId),
    );
  }
  // Shelves: inside the backs and sides, back from the front so the doors close.
  const shelfOutline = insetPolygon(outline, [rules.fullOverlay || rules.inset ? SHELF_SETBACK + (rules.inset ? 20 : 0) : SHELF_SETBACK, t, tb, tb, t]);
  // A lazy susan made here takes the shelves' place: on bearings one shelf stays, half-way up, for the upper one to turn on.
  const susan = cabinet.corner?.kind === 'diagonal' ? cabinet.corner.susan : undefined;
  const n = susan ? (susan.turns === 'bearings' ? 1 : 0) : cabinet.layout.rows.some((row) => row.use === 'doors') ? cabinet.adjustableShelves : 0;
  for (let i = 1; i <= n; i++) {
    parts.push(flat(`shelf-${i}`, n > 1 ? `Shelf ${i}` : 'Shelf', 'shelf', shelfOutline, k + t + (inside * i) / (n + 1)));
  }
  return parts;
}

/**
 * Where a diagonal corner cabinet stands in its run's frame (X along the wall from the
 * run's left end, Z out from the wall): the front-left corner of its own frame, and how
 * much more it is turned than the run. `x0`: where it starts along the run. In the left
 * corner the other wall is at the run's left end; in the right corner at its right end.
 */
export function diagonalPlace(cabinet: Pick<CabinetDesign, 'size'>, x0: Mm, corner: 'left' | 'right'): { local: [Mm, Mm]; turn: number } {
  const A = cabinet.size.width.mm;
  const d = cabinet.size.depth.mm;
  return corner === 'left' ? { local: [x0 + d, A], turn: 45 } : { local: [x0, d], turn: -45 };
}
