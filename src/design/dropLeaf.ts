/**
 * A drop leaf on a slab top: a panel of its own, hinged under a square joint to the
 * part of the top that stays. A short leaf rests on two swing-out brackets; a longer one on a folding leg, or a
 * pair where the joint is long. No pins: the hinges line it up. What is here is the hardware: how much of it, and
 * what is drawn of it. The leaf's panel and its edges are the top's own parts (`deriveTopParts`).
 */
import type { LeafEdge, Mm, Part } from '@/model';
import { MM_PER_INCH } from '@/units';
import { LEAF_LOOK, turnedFrame } from './torsion';

/**
 * A drop leaf's limits and hardware (tune me, every one): the least a leaf and the part that stays may be; the
 * longest leaf that rests on swing-out brackets, a longer one standing on a leg; the joint beyond which it has two
 * legs; a hinge about every `spacing` of the joint, at least two, the end ones `inset` in; and the brackets: how far
 * in from the joint's ends, and what is drawn of one.
 */
export const DROP_LEAF = {
  least: 4 * MM_PER_INCH,
  staysLeast: 6 * MM_PER_INCH,
  bracketsUpTo: 12 * MM_PER_INCH,
  pairOver: 36 * MM_PER_INCH,
  hinge: { spacing: 16 * MM_PER_INCH, least: 2, inset: 3 * MM_PER_INCH, long: 60, knuckle: 10 },
  bracket: { inset: 4 * MM_PER_INCH, thick: 19.05, tall: 63.5, shy: MM_PER_INCH, clear: 3 },
};

/** What holds a drop leaf up: two swing-out brackets under a short one; a folding leg under a longer one, two where the joint is long. */
export function dropLeafSupport(leaf: Mm, joint: Mm): { kind: 'brackets' | 'legs'; count: number } {
  if (leaf <= DROP_LEAF.bracketsUpTo + 1e-6) return { kind: 'brackets', count: 2 };
  return { kind: 'legs', count: joint > DROP_LEAF.pairOver + 1e-6 ? 2 : 1 };
}

/** How many hinges are under a joint this long. */
export function dropLeafHinges(joint: Mm): number {
  // (A hair off, so that a joint of exactly so many spacings does not gain a hinge to rounding.)
  return Math.max(DROP_LEAF.hinge.least, Math.ceil(joint / DROP_LEAF.hinge.spacing - 0.01) + 1);
}

/** What holds a leaf up, in words: "two swing-out brackets", "a folding leg", "two folding legs". */
export function dropLeafSupportWords(leaf: Mm, joint: Mm): string {
  const s = dropLeafSupport(leaf, joint);
  return s.kind === 'brackets' ? 'two swing-out brackets' : s.count === 2 ? 'two folding legs' : 'a folding leg';
}

/**
 * A drop leaf's hardware, for the picture only (drawn in metal, never cut, planned or listed as parts): the hinges
 * under the joint, and the brackets or the legs under the leaf. `length` and `width` are the whole top with its
 * leaf, its front-left corner at `origin` on its underside, as a torsion table's are; `under` is that underside off
 * the floor, which a leg reaches. `front`: the second leaf of a table with one on each long side. A leaf on an end is worked out as one at the back, turned (`turnedFrame`).
 */
export function dropLeafShapes(edge: LeafEdge | 'front', leaf: Mm, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materialId: string): Part[] {
  if (edge === 'front') {
    // A leaf along the front (a table with one on each long side): the one at the back, mirrored front to back.
    // What turns about a level line across, or about an upright one, then turns the other way round.
    const flip = (z: Mm) => 2 * origin[2] - width - z;
    return backLeafShapes(leaf, length, width, origin, id, designObjectId, materialId).map((p) => {
      const at = p.placement!;
      const m = p.moves;
      const moves: Part['moves'] = m?.kind === 'fold' ? { ...m, axis: [m.axis[0], flip(m.axis[1])], front: true } : m?.kind === 'swingIn' ? { ...m, axis: [m.axis[0], flip(m.axis[1])], sign: -m.sign as 1 | -1 } : m;
      return { ...p, placement: { ...at, origin: [at.origin[0], at.origin[1], flip(at.origin[2] - p.size.thickness)] as [Mm, Mm, Mm] }, ...(moves ? { moves } : {}) };
    });
  }
  if (edge !== 'back') {
    const turned = turnedFrame(edge, length, width, origin);
    return backLeafShapes(leaf, turned.length, turned.width, turned.origin, id, designObjectId, materialId).map((p) => turned.part(p, false));
  }
  return backLeafShapes(leaf, length, width, origin, id, designObjectId, materialId);
}

function backLeafShapes(leaf: Mm, length: Mm, width: Mm, origin: [Mm, Mm, Mm], id: string, designObjectId: string, materialId: string): Part[] {
  const [x0, y0, z0] = origin;
  const [zj, zb] = [z0 - (width - leaf), z0 - width];
  const fold = { kind: 'fold' as const, axis: [y0, zj] as [Mm, Mm] };
  const D = DROP_LEAF;
  const L = LEAF_LOOK;
  const block = (key: string, name: string, min: [Mm, Mm, Mm], max: [Mm, Mm, Mm], moves?: Part['moves']): Part => {
    const size = { width: max[0] - min[0], height: max[1] - min[1], thickness: max[2] - min[2] };
    return {
      id: `${id}-appliance-leaf-${key}/shape`,
      designObjectId,
      name,
      materialId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: size.width, y: 0 }, { x: size.width, y: size.height }, { x: 0, y: size.height }] }],
      role: 'top',
      placement: { origin: [min[0], min[1], max[2]], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
      ...(moves ? { moves } : {}),
    };
  };
  const out: Part[] = [];
  // The hinges: their knuckles under the joint, on its line.
  const n = dropLeafHinges(length);
  const inset = Math.min(D.hinge.inset, length / 4);
  for (let i = 0; i < n; i++) {
    const x = x0 + inset + ((length - 2 * inset) * i) / (n - 1);
    out.push(block(`hinge-${i + 1}`, 'Hinge', [x - D.hinge.long / 2, y0 - D.hinge.knuckle, zj - D.hinge.knuckle / 2], [x + D.hinge.long / 2, y0, zj + D.hinge.knuckle / 2]));
  }
  const support = dropLeafSupport(leaf, length);
  if (support.kind === 'brackets') {
    // Two swing-out brackets: each an arm under the leaf, square to the joint, that swings in under the part that
    // stays before the leaf goes down, about an upright line just inside the joint.
    const b = D.bracket;
    const at = Math.min(b.inset, length / 4);
    for (const [key, x, sign] of [['left', x0 + at, -1], ['right', x0 + length - at, 1]] as const) {
      const pivot = zj + b.clear + b.thick / 2;
      out.push(block(`bracket-${key}`, 'Swing-out bracket', [x - b.thick / 2, y0 - b.tall, zj - Math.max(b.tall, leaf - b.shy)], [x + b.thick / 2, y0, pivot + b.thick / 2], { kind: 'swingIn', axis: [x, pivot], sign }));
    }
    return out;
  }
  // A folding leg, or a pair: under the leaf's far edge, in from the ends of the joint; a single one in the middle.
  const s = L.leg.size;
  const legs =
    support.count === 2
      ? [
          { key: 'left', x: x0 + L.leg.inset, z: zb + L.leg.fromEnd, sign: 1 as const },
          { key: 'right', x: x0 + length - L.leg.inset - s, z: zb + L.leg.fromEnd + s + L.leg.apart, sign: -1 as const },
        ]
      : [{ key: 'middle', x: x0 + (length - s) / 2, z: zb + L.leg.fromEnd, sign: 1 as const }];
  for (const leg of legs) {
    const moves = { ...fold, first: { at: [leg.x + s / 2, y0 - s / 2] as [Mm, Mm], sign: leg.sign } };
    out.push(block(`bracket-${leg.key}`, 'Folding leg bracket', [leg.x - (L.bracket.size - s) / 2, y0 - L.bracket.thick, leg.z - (L.bracket.size - s) / 2], [leg.x + (L.bracket.size + s) / 2, y0, leg.z + (L.bracket.size + s) / 2], fold));
    out.push(block(`leg-${leg.key}`, 'Leg', [leg.x, L.foot.height, leg.z], [leg.x + s, y0 - L.bracket.thick, leg.z + s], moves));
    out.push(block(`foot-${leg.key}`, 'Levelling foot', [leg.x - (L.foot.size - s) / 2, 0, leg.z - (L.foot.size - s) / 2], [leg.x + (L.foot.size + s) / 2, L.foot.height, leg.z + (L.foot.size + s) / 2], moves));
  }
  return out;
}
