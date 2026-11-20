/**
 * The slide jig: a printed stand that holds a build-out strip, or a slide, level at
 * its height in a cabinet that cannot be clamped to. Two stand on the cabinet's floor against the side,
 * one near the front and one near the back; the strip rests on their tops while it is screwed on.
 *
 * Seen from the side it is an L with a gusset: a foot on the floor, a column up to the height, the top of
 * the column the ledge. It prints lying on its side, its profile on the bed, with no supports.
 */
import type { SolidMesh } from '@/geometry/solids';
import type { Mm } from '@/model';
import { type PrintObject, write3mf } from './threemf';

/** Sizes that do not come from the design. Tune me: first guesses, not yet printed. */
export const SLIDE_JIG = {
  /** How far the foot reaches out from the cabinet's side. */
  foot: 45,
  footThickness: 6,
  /** How deep the ledge is: the column's thickness. */
  column: 12,
  /** Along the cabinet's side. */
  width: 40,
  /** How high the gusset between the foot and the column reaches. */
  gusset: 40,
  /** The lowest ledge worth printing, and the tallest most printers' beds take. */
  least: 10,
  most: 250,
};
const BED_SPACING: Mm = 8;

export interface SlideJig {
  /** The ledge above the cabinet's floor: the underside of the strip or the slide. */
  height: Mm;
  quantity: number;
}

/** Its side profile, counter-clockwise: x out from the cabinet's side, y up from the floor. */
export function slideJigProfile(height: Mm): [number, number][] {
  const j = SLIDE_JIG;
  const gusset = Math.min(height, j.gusset);
  return [[0, 0], [j.foot, 0], [j.foot, j.footThickness], [j.column, gusset], ...(gusset < height ? [[j.column, height] as [number, number]] : []), [0, height]];
}

/** Why a jig of this height cannot be made as it is; empty when it can. */
export function slideJigProblems(height: Mm): string[] {
  if (!(height >= SLIDE_JIG.least)) return [`The ledge must be at least ${SLIDE_JIG.least} mm above the floor: lower than that, rest the strip on a scrap of that thickness.`];
  if (height > SLIDE_JIG.most) return [`A ledge ${Math.round(height)} mm up is taller than most printers' beds (${SLIDE_JIG.most} mm): cut two boards to that length and stand the strip on them instead.`];
  return [];
}

/** A profile that every corner can be seen from its first point, pushed out to `depth`: a closed mesh. */
function prism(profile: [number, number][], depth: Mm): SolidMesh {
  const n = profile.length;
  const positions = new Float32Array(n * 6);
  profile.forEach(([x, y], i) => {
    positions.set([x, y, 0], i * 3);
    positions.set([x, y, depth], (n + i) * 3);
  });
  const triangles: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    // The bottom faces down, the top up.
    triangles.push(0, i + 1, i, n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangles.push(i, j, n + j, i, n + j, n + i);
  }
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = profile[i]!;
    const [x1, y1] = profile[(i + 1) % n]!;
    area += (x0 * y1 - x1 * y0) / 2;
  }
  return { positions, triangles: new Uint32Array(triangles), volume: area * depth };
}

/** The jigs laid out on the print bed in a row, each on its side. */
export function buildSlideJigObjects(jigs: SlideJig[]): PrintObject[] {
  let x = 0;
  return jigs.map((jig) => {
    const placements = Array.from({ length: jig.quantity }, (_, i) => ({ x: x + i * (SLIDE_JIG.foot + BED_SPACING), y: 0 }));
    x += jig.quantity * (SLIDE_JIG.foot + BED_SPACING);
    return { name: `Slide jig, ${Math.round(jig.height * 10) / 10} mm`, mesh: prism(slideJigProfile(jig.height), SLIDE_JIG.width), placements };
  });
}

export const slideJigsFileName = (slug: string) => `${slug}-slide-jigs.3mf`;
export const buildSlideJigs3mf = (jigs: SlideJig[]): Uint8Array => write3mf(buildSlideJigObjects(jigs));
