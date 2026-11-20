import type { CabinetPartRole, Part } from '@/model';

export interface FaceNames {
  A: string;
  B: string;
}

/** A front (a door, a drawer front) and anything else with no role. */
const FRONT: FaceNames = { A: 'Front', B: 'Back' };

/** What a part's two faces are called, by what the part is. */
const FACES: Record<CabinetPartRole, FaceNames> = {
  side: { A: 'Inside', B: 'Outside' },
  partition: { A: 'Right face', B: 'Left face' },
  bottom: { A: 'Top', B: 'Underside' },
  stretcher: { A: 'Top', B: 'Underside' },
  back: { A: 'Inside', B: 'Outside' },
  toeKick: FRONT,
  shelf: { A: 'Top', B: 'Underside' },
  frameStile: FRONT,
  frameRail: FRONT,
  boxSide: { A: 'Inside', B: 'Outside' },
  boxFront: { A: 'Inside', B: 'Outside' },
  boxBack: { A: 'Inside', B: 'Outside' },
  boxBottom: { A: 'Top', B: 'Underside' },
  buildOut: { A: 'Inside', B: 'Outside' },
  runner: { A: 'Inside', B: 'Outside' },
  cleat: FRONT,
  filler: FRONT,
  blindPanel: FRONT,
  top: { A: 'Top', B: 'Underside' },
  topEdge: FRONT,
  caseEdge: FRONT,
  rib: { A: 'Side', B: 'Other side' },
  handle: { A: 'Side', B: 'Other side' },
  pullOut: { A: 'Inside', B: 'Outside' },
  leg: { A: 'Face', B: 'Opposite face' },
  apron: { A: 'Outside', B: 'Inside' },
};

/**
 * The names of a part's faces A and B: "Inside" and "Outside" for a side, "Top" and
 * "Underside" for the bottom. A stretcher standing on edge (the nailer) has a front
 * and a back.
 */
export function partFaces(part: Pick<Part, 'role' | 'placement'>): FaceNames {
  if (!part.role) return FRONT;
  if (part.role === 'stretcher' && part.placement && Math.abs(part.placement.yAxis[1]) > 0.5) return FRONT;
  return FACES[part.role];
}
