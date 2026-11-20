/**
 * The install kit as printable solids.
 *
 * Support block: an L seen from the side. A hook rests on the bottom edge of the
 * opening (the top of the face frame's bottom rail), a thin web runs down the
 * frame face, and a ledge sticks out with its top the bottom overlay below the
 * opening edge. The door stands on the ledge while its hinges are screwed on.
 *
 * Gap shim: a flat plate as thick as the gap between a pair of doors.
 *
 * Both print without supports: the block lies on its side (its side profile on
 * the bed), the shim lies flat.
 */
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import type { JigInstance, Mm } from '@/model';
import { type PrintObject, write3mf } from './threemf';

/** Sizes that don't come from the design. Tune me: first guesses, not yet printed. */
export const SUPPORT_BLOCK = {
  /** Along the opening edge. */
  width: 30,
  /** How far the hook reaches into the opening. */
  hookDepth: 15,
  hookThickness: 3,
  /** Sits between the frame and the door, so it is kept thin. */
  webThickness: 1.2,
  /** How far the ledge sticks out from the frame face. */
  ledgeDepth: 30,
  ledgeThickness: 6,
};
export const GAP_SHIM = { length: 80, width: 25 };
/** Space between pieces on the print bed. */
const BED_SPACING = 10;

/**
 * Side profile of the support block, counter-clockwise, as it lies on the bed:
 * x runs from the back of the hook out to the tip of the ledge, y runs up from
 * the underside of the ledge.
 */
export function supportBlockProfile(height: Mm): [number, number][] {
  const b = SUPPORT_BLOCK;
  const x = (forward: Mm) => forward + b.hookDepth; // 0 at the frame face
  const y = (up: Mm) => up + height + b.ledgeThickness; // 0 at the opening edge
  return [
    [x(-b.hookDepth), y(0)],
    [x(0), y(0)],
    [x(0), y(-height - b.ledgeThickness)],
    [x(b.ledgeDepth), y(-height - b.ledgeThickness)],
    [x(b.ledgeDepth), y(-height)],
    [x(b.webThickness), y(-height)],
    [x(b.webThickness), y(b.hookThickness)],
    [x(-b.hookDepth), y(b.hookThickness)],
  ];
}

export function supportBlockVolume(height: Mm): number {
  const b = SUPPORT_BLOCK;
  const area =
    b.hookDepth * b.hookThickness +
    b.webThickness * (height + b.ledgeThickness + b.hookThickness) +
    (b.ledgeDepth - b.webThickness) * b.ledgeThickness;
  return area * b.width;
}

/** Bed footprint of one piece. */
function footprint(jig: JigInstance): { x: Mm; y: Mm } {
  if (jig.template === 'gapShim') return { x: GAP_SHIM.length, y: GAP_SHIM.width };
  const b = SUPPORT_BLOCK;
  return { x: b.hookDepth + b.ledgeDepth, y: jig.params.height! + b.ledgeThickness + b.hookThickness };
}

const jigName = (jig: JigInstance) => (jig.template === 'supportBlock' ? 'Support block' : 'Gap shim');

export interface KitObject extends PrintObject {
  template: JigInstance['template'];
}

/** One mesh per jig, with its copies laid out in a row per jig. */
export async function buildInstallKitObjects(kit: JigInstance[], wasmUrl?: string): Promise<KitObject[]> {
  const wasm = await loadManifold(wasmUrl);
  let rowY = 0;
  return kit.map((jig) => {
    const solid =
      jig.template === 'supportBlock'
        ? wasm.Manifold.extrude(supportBlockProfile(jig.params.height!), SUPPORT_BLOCK.width)
        : wasm.Manifold.cube([GAP_SHIM.length, GAP_SHIM.width, jig.params.thickness!]);
    const mesh: SolidMesh = meshOf(solid);
    solid.delete();
    const size = footprint(jig);
    const placements = Array.from({ length: jig.quantity }, (_, i) => ({ x: i * (size.x + BED_SPACING), y: rowY }));
    rowY += size.y + BED_SPACING;
    return { name: jigName(jig), template: jig.template, mesh, placements };
  });
}

export const installKitFileName = (slug: string) => `${slug}-install-kit.3mf`;

/** The whole kit as one 3MF file. */
export async function buildInstallKit3mf(kit: JigInstance[], wasmUrl?: string): Promise<Uint8Array> {
  return write3mf(await buildInstallKitObjects(kit, wasmUrl));
}
