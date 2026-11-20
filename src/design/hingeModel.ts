/**
 * A cup hinge as a model: how the door moves on it, and what it looks like. Display
 * only; it changes no part.
 *
 * A cup hinge is a four-bar linkage. Two pivots sit in the cup, in the door; two sit
 * in the head of the arm, which is fixed to the case (on a mounting plate on the case
 * side, or on the edge of a face frame); two links join them. So the door does not turn
 * about a pin: it swings out and away, which is what lets an overlay door open beside
 * its neighbour and an inset door come out of its opening.
 *
 * The hinge library does not have the links' real sizes. The linkage here is worked
 * out from what is known: where the door is when closed (its overlay or gap, from the
 * design), how far it opens, and that with the door closed all four pivots lie in the
 * cup. An overlay door is taken as near as such a hinge can to where `HINGE_MOTION`
 * (tune me, or the hinge's own `motion`) wants it when open; an inset door, which
 * opens within its opening, as little into the opening as it can. The links then carry
 * the door from one to the other without it touching the case. It is a plausible hinge,
 * not a maker's drawing: it shows how the door clears, not the last millimetre. A
 * hinge whose real pivots are known can give them (`linkage`) and is traced as it is.
 *
 * Everything is in the hinge's own plane, seen from above: X across the cabinet, from
 * the inner face of the case side (or the inner edge of the stile) into the opening;
 * Z out toward the room, from the front the door closes against. Angles are the
 * door's, 0 closed.
 */
import type { Hinge, Mm } from '@/model';

export type P2 = [Mm, Mm];

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const times = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Along the door's width, from its hinged edge, at a door angle. */
const along = (a: number): P2 => [Math.cos(a), Math.sin(a)];
/** Through the door's thickness, from its back face to its front, at a door angle. */
const through = (a: number): P2 => [-Math.sin(a), Math.cos(a)];

/** Overlay: on a plate on the case side, the door over the case front. Inset: the same, the door inside the opening. Frame: on the edge of a face frame's stile. */
export type HingeFamily = 'overlay' | 'inset' | 'frame';

export const hingeFamily = (hinge: Pick<Hinge, 'cabinetType'>): HingeFamily => (hinge.cabinetType === 'faceFrame' ? 'frame' : hinge.cabinetType === 'shop' ? 'inset' : 'overlay');

/** How a hinge sits on a cabinet: what the model needs besides the hinge's own numbers. */
export interface HingeMount {
  family: HingeFamily;
  /** The closed door's back corner at its hinged edge. Overlay: X negative (it laps the side), Z the bumper gap. Inset: X the gap, Z minus the door's thickness. */
  closed: P2;
  doorThickness: Mm;
  /** What the hinge is fixed to: the case side's thickness, or the face frame's (front to back). */
  mountThickness: Mm;
}

/** Where a door ends up when fully open, for hinges that do not say. All tune me. */
export const HINGE_MOTION = {
  /** The opening angle of a hinge that gives none. */
  openDeg: 105,
  /** Overlay and frame: how far the open door's front edge stands outside the line of its closed edge. */
  edgeOut: 1,
  /** Overlay and frame: how far in front of the case (or the frame) the open door's nearest corner stands. */
  clear: 1.5,
};

/** A hinge's linkage: its pivots, and the door's place at every degree from closed to fully open. */
export interface HingeLinkage {
  openDeg: number;
  /** The two pivots in the cup, in the door's own frame: [along its width from the hinged edge, into its thickness from the back face]. */
  doorPivots: [P2, P2];
  /** The two pivots in the head of the arm, fixed to the case. */
  fixedPivots: [P2, P2];
  linkLengths: [Mm, Mm];
  /** The door's back corner at its hinged edge, at 0, 1, 2 ... `openDeg` degrees. */
  corners: P2[];
}

/** The door's place at an angle: its back hinged corner, and where the two cup pivots are. Angles past fully open are fully open. */
export function doorPose(linkage: HingeLinkage, deg: number): { deg: number; corner: P2; pivots: [P2, P2] } {
  const at = Math.min(linkage.openDeg, Math.max(0, deg));
  const lower = Math.floor(at);
  const upper = Math.min(linkage.corners.length - 1, lower + 1);
  const t = at - lower;
  const a = linkage.corners[lower]!;
  const b = linkage.corners[upper]!;
  const corner: P2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const angle = rad(at);
  const place = (p: P2): P2 => add(corner, add(times(along(angle), p[0]), times(through(angle), p[1])));
  return { deg: at, corner, pivots: [place(linkage.doorPivots[0]), place(linkage.doorPivots[1])] };
}

/**
 * An overlay door's front corner at its hinged edge, fully open, as the hinge's motion
 * numbers want it: the corner nearest the case and the neighbour. (An inset door has no
 * such place: it stands in its opening when open, as little into it as its hinge allows.)
 */
function wantedFront(hinge: Hinge, mount: HingeMount): P2 {
  const motion = { ...HINGE_MOTION, ...hinge.motion };
  return [mount.closed[0] - motion.edgeOut, motion.clear];
}

/** Points of the door near its hinged edge, at a pose: what could touch the case. */
function nearEdge(corner: P2, angle: number, thickness: Mm): P2[] {
  const points: P2[] = [];
  for (let v = 0; v <= 4; v++) points.push(add(corner, times(through(angle), (thickness * v) / 4)));
  for (let u = 5; u <= 60; u += 5) {
    points.push(add(corner, times(along(angle), u)));
    points.push(add(corner, add(times(along(angle), u), times(through(angle), thickness))));
  }
  return points;
}

/** The two points where two circles cross; none when they do not meet. */
function circlesMeet(a: P2, ra: Mm, b: P2, rb: Mm): P2[] {
  const d = dist(a, b);
  if (d < 1e-9 || d > ra + rb + 1e-9 || d < Math.abs(ra - rb) - 1e-9) return [];
  const x = (d * d + ra * ra - rb * rb) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - x * x));
  const dir = times(sub(b, a), 1 / d);
  const mid = add(a, times(dir, x));
  const off: P2 = [-dir[1] * h, dir[0] * h];
  return [add(mid, off), sub(mid, off)];
}

/**
 * The door's back corner at every degree, carried by two links of fixed length from
 * the fixed pivots. Nothing when the links cannot carry the door all the way.
 */
function trace(doorPivots: [P2, P2], fixedPivots: [P2, P2], lengths: [Mm, Mm], closed: P2, openDeg: number): P2[] | undefined {
  const corners: P2[] = [closed];
  const [p1, p2] = doorPivots;
  let last = add(closed, [p1[0], p1[1]]);
  for (let deg = 1; deg <= openDeg; deg++) {
    const a = rad(deg);
    // The second cup pivot is a fixed step from the first, turned with the door.
    const step = add(times(along(a), p2[0] - p1[0]), times(through(a), p2[1] - p1[1]));
    const found = circlesMeet(fixedPivots[0], lengths[0], sub(fixedPivots[1], step), lengths[1]);
    if (found.length === 0) return undefined;
    // The way the linkage was going: the nearer of the two.
    const next = found.reduce((best, p) => (dist(p, last) < dist(best, last) ? p : best));
    // A degree of the door moves a pivot a fraction of a millimetre: more is the linkage snapping over.
    if (dist(next, last) > 1.5) return undefined;
    last = next;
    corners.push(sub(next, add(times(along(a), p1[0]), times(through(a), p1[1]))));
  }
  return corners;
}

const cache = new Map<string, HingeLinkage | undefined>();

/**
 * How far toward (and past) what it is hinged on the door reaches at an angle: the least X of its four
 * corners seen from above, in the hinge's frame (X runs from the hinged member's face into the opening).
 */
export function doorReach(linkage: HingeLinkage, deg: number, width: Mm, thickness: Mm): Mm {
  const pose = doorPose(linkage, deg);
  const angle = rad(pose.deg);
  const w = times(along(angle), width);
  const t = times(through(angle), thickness);
  return Math.min(pose.corner[0], pose.corner[0] + w[0], pose.corner[0] + t[0], pose.corner[0] + w[0] + t[0]);
}

/**
 * The hinge's linkage on this cabinet, or nothing when none can be found that carries
 * the door from closed to open clear of the case (the view then turns the door on a
 * plain pivot, as it did before there were hinges).
 */
export function hingeLinkage(hinge: Hinge, mount: HingeMount): HingeLinkage | undefined {
  const key = JSON.stringify([hinge.cup, hinge.openingAngleDeg, hinge.motion, hinge.linkage, mount]);
  if (cache.has(key)) return cache.get(key);
  const linkage = hinge.linkage ? fromGiven(hinge, mount) : synthesize(hinge, mount);
  cache.set(key, linkage);
  return linkage;
}

/** A linkage whose pivots the library gives: traced as it is. */
function fromGiven(hinge: Hinge, mount: HingeMount): HingeLinkage | undefined {
  const given = hinge.linkage!;
  const openDeg = Math.round(hinge.openingAngleDeg ?? HINGE_MOTION.openDeg);
  const doorPivots: [P2, P2] = [given.doorPivots[0], given.doorPivots[1]];
  const fixedPivots: [P2, P2] = [given.fixedPivots[0], given.fixedPivots[1]];
  const lengths: [Mm, Mm] = [dist(add(mount.closed, doorPivots[0]), fixedPivots[0]), dist(add(mount.closed, doorPivots[1]), fixedPivots[1])];
  const corners = trace(doorPivots, fixedPivots, lengths, mount.closed, openDeg);
  return corners && { openDeg, doorPivots, fixedPivots, linkLengths: lengths, corners };
}

/** Whether the door, at a pose, is in the case side or the frame, or closer to its front than a hair. */
const touches = (corner: P2, angle: number, thickness: Mm) => nearEdge(corner, angle, thickness).some((p) => p[0] < -0.2 && p[1] < 0.2);

/**
 * Works a linkage out.
 *
 * Going from closed to open, the door is turned by its opening angle about some point:
 * the pole. With the door closed, all four pivots of a cup hinge lie in the cup, and
 * that fixes where the pole can be: seen from it, a fixed pivot and its cup pivot stand
 * half the opening angle apart, so the pole is in or beside the cup. Each pole gives an
 * open position. The poles are tried in the order of how near their open position is to
 * the wanted one; for each, pairs of links with all their pivots in the cup are tried,
 * and the first pole with a pair that carries the door all the way, clear of the case,
 * is taken, with the pair that swings the door least far sideways on the way.
 */
function synthesize(hinge: Hinge, mount: HingeMount): HingeLinkage | undefined {
  const openDeg = Math.round(hinge.openingAngleDeg ?? HINGE_MOTION.openDeg);
  const open = rad(openDeg);
  const T = mount.doorThickness;
  const D = hinge.cup.diameter;
  const centre = hinge.cup.boreDistance + D / 2;
  const depth = Math.min(hinge.cup.depth, T - 2);
  const wanted = wantedFront(hinge, mount);
  const turn = (p: P2, about: P2, a: number): P2 => {
    const [x, z] = sub(p, about);
    return add(about, [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]);
  };
  /** In the cup's hollow, in the door's frame, with a little wall left. */
  const inCup = (u: Mm, v: Mm) => Math.abs(u - centre) <= D / 2 - 2 && v >= 0.5 && v <= depth - 0.5;

  // Where a fixed pivot may be: in the cup's hollow with the door closed, on a grid.
  const fixedPlaces: P2[] = [];
  for (let u = centre - D / 2 + 2; u <= centre + D / 2 - 2 + 1e-6; u += 3) for (let v = 1; v <= depth - 0.5 + 1e-6; v += 2.5) fixedPlaces.push(add(mount.closed, [u, v]));

  // The poles, by how near their open position is to the wanted one.
  const poles: { pole: P2; opened: P2; cost: number }[] = [];
  for (let u = -12; u <= centre + D / 2 + 12; u += 1.5) {
    for (let v = -14; v <= depth + 14; v += 1.5) {
      const pole = add(mount.closed, [u, v]);
      const opened = turn(mount.closed, pole, open);
      if (touches(opened, open, T)) continue;
      const front = add(opened, times(through(open), T));
      if (mount.family === 'inset') {
        // An inset door opens within its opening: as little into it as can be.
        poles.push({ pole, opened, cost: opened[0] });
        continue;
      }
      // In front of the case by at least the wanted clearance; then as near the wanted place as can be.
      if (front[1] < wanted[1] - 1e-6) continue;
      poles.push({ pole, opened, cost: Math.abs(front[0] - wanted[0]) + 0.5 * (front[1] - wanted[1]) });
    }
  }
  poles.sort((a, b) => a.cost - b.cost);

  for (const { pole, opened } of poles.slice(0, 150)) {
    // The links this pole allows: a fixed pivot, and a cup pivot half the opening angle round from it about the pole.
    const links: { fixed: P2; inDoor: P2; length: Mm }[] = [];
    for (const fixed of fixedPlaces) {
      const reach = dist(fixed, pole);
      if (reach < 1) continue;
      const dir = times(sub(turn(fixed, pole, -open / 2), pole), 1 / reach);
      for (let r = -40; r <= 40; r += 2) {
        if (Math.abs(r) < 1) continue;
        const cupPivot = add(pole, times(dir, r));
        const inDoor = sub(cupPivot, mount.closed);
        const length = dist(cupPivot, fixed);
        if (inCup(inDoor[0], inDoor[1]) && length >= 8 && length <= 30) links.push({ fixed, inDoor, length });
      }
    }
    let best: { score: number; linkage: HingeLinkage } | undefined;
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        const [a, b] = [links[i]!, links[j]!];
        if (dist(a.fixed, b.fixed) < 6 || dist(a.inDoor, b.inDoor) < 6) continue;
        const doorPivots: [P2, P2] = [a.inDoor, b.inDoor];
        const corners = trace(doorPivots, [a.fixed, b.fixed], [a.length, b.length], mount.closed, openDeg);
        if (!corners || dist(corners.at(-1)!, opened) > 0.05) continue;
        let out = 0;
        let hits = false;
        let fastest = 0;
        // The arm's head, between its two pivots: it and the links may be in the cup's hollow or behind the door, never in its wood.
        const head = [0, 0.25, 0.5, 0.75, 1].map((t): P2 => add(times(a.fixed, 1 - t), times(b.fixed, t)));
        for (let deg = 0; deg <= openDeg && !hits; deg += 1) {
          const corner = corners[deg]!;
          const angle = rad(deg);
          const inWood = (p: P2) => {
            const rel = sub(p, corner);
            const u = rel[0] * Math.cos(angle) + rel[1] * Math.sin(angle);
            const v = -rel[0] * Math.sin(angle) + rel[1] * Math.cos(angle);
            return u > 0.3 && v > 0.3 && v < T - 0.3 && !(Math.abs(u - centre) < D / 2 - 0.2 && v < depth + 0.6);
          };
          const cupPivots = doorPivots.map((p) => add(corner, add(times(along(angle), p[0]), times(through(angle), p[1]))));
          const onLinks = [a.fixed, b.fixed].flatMap((fixed, k) => [0.2, 0.4, 0.6, 0.8].map((t): P2 => add(times(fixed, 1 - t), times(cupPivots[k]!, t))));
          hits = touches(corner, angle, T) || head.some(inWood) || onLinks.some(inWood);
          if (deg > 0) fastest = Math.max(fastest, dist(corners[deg]!, corners[deg - 1]!));
          for (const p of nearEdge(corners[deg]!, rad(deg), T).slice(0, 5)) out = Math.max(out, (mount.family === 'inset' ? 0 : Math.min(mount.closed[0], wanted[0])) - p[0]);
        }
        if (hits) continue;
        // Least sideways swing past the closed edge first; then an even motion, with no lurch in it;
        // then the pivots well apart, which is a steadier hinge.
        const score = out * 10 + fastest * 40 - dist(a.fixed, b.fixed) - dist(a.inDoor, b.inDoor);
        if (!best || score < best.score) best = { score, linkage: { openDeg, doorPivots, fixedPivots: [a.fixed, b.fixed], linkLengths: [a.length, b.length], corners } };
      }
    }
    if (best) return best.linkage;
  }
  return undefined;
}

/** A piece of the hinge as a bar seen from above, standing a height tall: from one point to another, so thick. */
export interface HingeBar {
  from: P2;
  to: P2;
  thickness: Mm;
  /** Its height, centred on the hinge. */
  height: Mm;
  what: 'plate' | 'arm' | 'head' | 'bracket' | 'link' | 'pin';
}

/** What a hinge looks like, in three groups: what is on the case, what is on the door, and the two links between them. */
export interface HingeShapes {
  /** In the hinge's plane. */
  fixed: HingeBar[];
  /** The cup: in the door's own frame, its centre from the hinged edge, bored into the back face. */
  cup: { centre: Mm; diameter: Mm; depth: Mm };
  /** The cup's flange on the back of the door: from..to along the door's width, its thickness, its height. */
  flange: { from: Mm; to: Mm; thickness: Mm; height: Mm };
  /** The two links, each from its fixed pivot to its cup pivot (which moves: see `doorPose`). */
  links: { fixed: P2; thickness: Mm; height: Mm }[];
  /**
   * Its screws, each in its hole. In the door, through the cup's flange: where along the
   * door's width, and how far above the hinge's centre. None on a press-in hinge, whose
   * flange is held by its dowels. In the case, through the mounting plate (or, on a face
   * frame, through the bracket into the stile's edge): where in the hinge's plane, on the
   * face that looks into the opening, and how far above the centre.
   */
  screws: { head: Mm; door: { along: Mm; up: Mm }[]; fixed: { at: P2; up: Mm }[] };
}

/** Sizes of the drawn hinge that the library does not give. They only shape the picture. */
const LOOK = { screwHead: 7, flangeScrewSetback: 9.5, flangeScrewSpacing: 45, bracketScrewSpacing: 30, plateThickness: 2.5, armThickness: 4, armHeight: 12, armOffFace: 5, headHeight: 14, linkThickness: 2.2, flangeThickness: 1.2, flangeHeight: 48, bracketHeight: 46 };

/** The hinge's pieces, sized from its numbers and placed for its mount. */
export function hingeShapes(hinge: Hinge, mount: HingeMount, linkage: HingeLinkage): HingeShapes {
  const D = hinge.cup.diameter;
  const centre = hinge.cup.boreDistance + D / 2;
  const [q1, q2] = linkage.fixedPivots;
  const head = times(add(q1, q2), 0.5);
  const fixed: HingeBar[] = [];
  const fixedScrews: { at: P2; up: Mm }[] = [];
  // The flange's screws stand beside the cup, toward the middle of the door, one above and one below the centre:
  // where a press-in hinge has its dowels. A hinge that does not say how it is fixed is drawn screwed on.
  const beside = centre + (hinge.dowels?.setback ?? LOOK.flangeScrewSetback);
  const apart = hinge.dowels?.spacing ?? LOOK.flangeScrewSpacing;
  const doorScrews = hinge.attachment === 'pressIn' ? [] : [-apart / 2, apart / 2].map((up) => ({ along: beside, up }));
  if (mount.family === 'frame') {
    // Screwed to the inner edge of the stile, across the frame's thickness.
    fixed.push({ from: [LOOK.plateThickness / 2, -mount.mountThickness], to: [LOOK.plateThickness / 2, 0], thickness: LOOK.plateThickness, height: LOOK.bracketHeight, what: 'bracket' });
    fixed.push({ from: [LOOK.plateThickness, -mount.mountThickness / 2], to: head, thickness: LOOK.armThickness, height: LOOK.armHeight, what: 'arm' });
    for (const up of [-LOOK.bracketScrewSpacing / 2, LOOK.bracketScrewSpacing / 2]) fixedScrews.push({ at: [LOOK.plateThickness, -mount.mountThickness / 2], up });
  } else {
    // A mounting plate on the case side, its two holes on a line set back from the front edge
    // (from the back of the closed door, for an inset hinge), and the arm clipped onto it.
    const setback = hinge.plate?.setback ?? 37;
    const line = mount.family === 'inset' ? -mount.doorThickness - setback : -setback;
    const spacing = hinge.plate?.spacing ?? 32;
    fixed.push({ from: [LOOK.plateThickness / 2, line - 14], to: [LOOK.plateThickness / 2, line + 14], thickness: LOOK.plateThickness, height: spacing + 16, what: 'plate' });
    // The plate's two screws, in the two holes the CNC drills for them in the case side.
    for (const up of [-spacing / 2, spacing / 2]) fixedScrews.push({ at: [LOOK.plateThickness, line], up });
    // Along the side to near the front, then across to the head.
    const x = LOOK.plateThickness + LOOK.armOffFace;
    const turn: P2 = [x, Math.min(head[1], Math.max(line + 14, head[1] - Math.abs(head[0] - x)))];
    fixed.push({ from: [x, line - 16], to: turn, thickness: LOOK.armThickness, height: LOOK.armHeight, what: 'arm' });
    if (dist(turn, head) > 0.5) fixed.push({ from: turn, to: head, thickness: LOOK.armThickness, height: LOOK.armHeight, what: 'arm' });
  }
  // The head carries the two fixed pivots.
  fixed.push({ from: q1, to: q2, thickness: LOOK.armThickness, height: LOOK.headHeight, what: 'head' });
  for (const q of [q1, q2]) fixed.push({ from: [q[0], q[1] - 1.5], to: [q[0], q[1] + 1.5], thickness: 3, height: LOOK.headHeight + 2, what: 'pin' });
  return {
    fixed,
    cup: { centre, diameter: D, depth: Math.min(hinge.cup.depth, mount.doorThickness - 1) },
    flange: {
      from: centre - D / 2 - 2,
      to: Math.max(centre + D / 2 + 8, beside + LOOK.screwHead),
      thickness: LOOK.flangeThickness,
      height: Math.max(LOOK.flangeHeight, apart + 2 * LOOK.screwHead),
    },
    links: [
      { fixed: q1, thickness: LOOK.linkThickness, height: LOOK.armHeight - 3 },
      { fixed: q2, thickness: LOOK.linkThickness, height: LOOK.armHeight },
    ],
    screws: { head: LOOK.screwHead, door: doorScrews, fixed: fixedScrews },
  };
}
