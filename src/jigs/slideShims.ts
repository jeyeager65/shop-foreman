/**
 * The printed shims that pack a build-out strip out to the edge of the drawer opening:
 * flat pads, one thickness, laid out in rows on the print bed.
 */
import type { SolidMesh } from '@/geometry/solids';
import type { Mm } from '@/model';
import { type PrintObject, write3mf } from './threemf';

const BED_SPACING: Mm = 5;
const PER_ROW = 4;

export interface SlideShims {
  thickness: Mm;
  length: Mm;
  height: Mm;
  quantity: number;
}

/** A box with one corner at the origin, as a closed mesh. */
function boxMesh(x: Mm, y: Mm, z: Mm): SolidMesh {
  const positions = new Float32Array([0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z]);
  // Counter-clockwise seen from outside.
  const triangles = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { positions, triangles, volume: x * y * z };
}

export function buildSlideShimObjects(shims: SlideShims): PrintObject[] {
  const placements = Array.from({ length: shims.quantity }, (_, i) => ({
    x: (i % PER_ROW) * (shims.length + BED_SPACING),
    y: Math.floor(i / PER_ROW) * (shims.height + BED_SPACING),
  }));
  return [{ name: 'Slide shim', mesh: boxMesh(shims.length, shims.height, shims.thickness), placements }];
}

export const slideShimsFileName = (slug: string) => `${slug}-slide-shims.3mf`;

export const buildSlideShims3mf = (shims: SlideShims): Uint8Array => write3mf(buildSlideShimObjects(shims));
