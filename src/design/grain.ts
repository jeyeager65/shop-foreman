/**
 * Grain direction: derived from what a part is, never chosen per part. Only parts of
 * a material with grain (plywood, solid wood) get one; MDF parts have none and may
 * be turned freely when nested.
 *
 * Uprights run with their height: sides, the back, stiles and doors. Everything that
 * spans the cabinet from side to side runs with its width: the bottom, shelves,
 * stretchers, the toe kick, rails and drawer fronts.
 */
import type { CabinetPartRole, GrainDirection, Material, Part } from '@/model';

export type GrainedKind = CabinetPartRole | 'door' | 'drawerFront';

const DIRECTION: Record<GrainedKind, GrainDirection> = {
  side: 'height',
  partition: 'height',
  back: 'height',
  frameStile: 'height',
  door: 'height',
  bottom: 'width',
  shelf: 'width',
  stretcher: 'width',
  toeKick: 'width',
  frameRail: 'width',
  drawerFront: 'width',
  // A drawer box's walls and its strips run with their length; the bottom runs side to side.
  boxSide: 'width',
  boxFront: 'width',
  boxBack: 'width',
  boxBottom: 'width',
  buildOut: 'width',
  runner: 'width',
  cleat: 'width',
  filler: 'height',
  blindPanel: 'height',
  // A top's grain runs along the run.
  top: 'width',
  topEdge: 'width',
  caseEdge: 'width',
  rib: 'width',
  // A pull's grain runs its length, for strength.
  handle: 'width',
  pullOut: 'width',
  // A leg's grain runs its length, which is its height.
  leg: 'height',
  apron: 'width',
};

/** The part with its grain direction, or as it is when its material has no grain. */
export function withGrain(part: Part, kind: GrainedKind, materials: Material[]): Part {
  const grained = materials.find((m) => m.id === part.materialId)?.hasGrain;
  return grained ? { ...part, grain: DIRECTION[kind] } : part;
}
