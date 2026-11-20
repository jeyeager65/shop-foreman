/**
 * A lazy susan made here, in a diagonal or an L-shaped corner cabinet, in place of the
 * bought one: two round shelves cut on the CNC (pie-cut in an L-shaped cabinet, whole in a diagonal one), a rim
 * round each standing in a groove in its top, and one of two ways to turn.
 *
 * - `bearings`: each shelf turns on a bought bearing ring, the lower on the cabinet's bottom, the upper on a
 *   fixed shelf half-way up (an L-shaped cabinet gets one; a diagonal one uses its own shelf). They turn apart.
 * - `pole`: both shelves are fixed to a bought pole through their centres, which turns in a pivot on the bottom
 *   and one under the top. They turn together.
 *
 * The rim, a strip that bends and stands in a groove in the shelf: `kerfed`, one strip of the back's material
 * with slots across it, most of the way through,
 * bent with the slots inward; or `laminated`, two strips of 1/8" hardboard that bend as they are, glued one
 * inside the other; or `none`. The groove is cut with the shelf; the strips are cut flat and bent by hand.
 *
 * Untested: nothing here has been cut. Every size is a first guess, tune me.
 */
import type { CabinetDesign, Feature, LazySusan, Material, Mm, Part, Point, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { diagonalPlan } from './diagonal';
import { withGrain } from './grain';
import { doorsOnSusan, lShapedFrame, lazySusanDiameter } from './lShaped';
import { thicknessOf, toeKickOf } from './style';

/** The 1/8" hardboard a laminated rim is made of (the catalog's id). */
export const SUSAN_RIM_HARDBOARD_ID = 'hardboard-1-8';

export const SUSAN = {
  /** From a shelf's edge to its rim's outer face, the groove's depth, and the rim's height above the shelf. */
  rimInset: 6,
  rimGroove: 6,
  rimHeight: 50,
  /** How much wider than the rim its groove is. */
  rimPlay: 0.3,
  /** A kerfed rim's slots: a 1/8" bit wide, this far apart, leaving this much of the strip (its face veneer). */
  kerf: { width: MM_PER_INCH / 8, spacing: MM_PER_INCH / 2, skin: 1.2 },
  /** A bearing ring's height, between what it stands on and the shelf. */
  bearing: 8,
  /** The pole: its diameter (1-1/4"), and how far the lower shelf is off the bottom on it. */
  pole: { diameter: 1.25 * MM_PER_INCH, lift: MM_PER_INCH },
  /** How far the notch of a pie-cut shelf stands back from the cabinet's two faces, and a whole shelf from the front. */
  behindFaces: MM_PER_INCH,
  /** Round a whole shelf, to the backs and the sides. */
  clear: 6,
  /** A bearing ring's width across, for the picture. */
  ring: 12 * MM_PER_INCH,
  /** Doors fixed to the susan: half the gap under and over them (and their gap at the corner), and what they clear the end sides by as they turn. */
  doorGap: 1.5,
  sweep: 5,
  /** What a stile's back edge stays outside the circle the doors' corners sweep. */
  stileClear: 2,
  /** A rim strip is cut in pieces no longer than this, which butt in the groove: a strip all the way round is longer than most stock. */
  rimPiece: 1200,
  /** A curve is drawn and cut as chords this many degrees long. */
  chord: 5,
};

export const SUSAN_TURNS: { title: string; value: LazySusan['turns'] }[] = [
  { title: 'On bearing rings, a fixed shelf under the upper one', value: 'bearings' },
  { title: 'On a pole, the two shelves turning together', value: 'pole' },
];
export const SUSAN_RIMS: { title: string; value: LazySusan['rim'] }[] = [
  { title: 'A strip of the back\'s plywood, slotted to bend', value: 'kerfed' },
  { title: 'Two strips of 1/8" hardboard, one inside the other', value: 'laminated' },
  { title: 'No rim', value: 'none' },
];

export interface SusanBuild {
  /** The shelves, the fixed shelf under the upper one (L-shaped, on bearings) and the rim strips, flat. */
  parts: Part[];
  /** For the picture only: each rim bent round its shelf, as short straight pieces. Never made. */
  shown: Part[];
  diameter: Mm;
  /** Whether the shelves are pie-cut (an L-shaped cabinet) or whole. */
  pieCut: boolean;
  turns: LazySusan['turns'];
  rim: LazySusan['rim'];
  /** How long each of the two straight pieces of a pie-cut shelf's rim is; nothing when it has none. */
  straightLength?: Mm;
  /** How long each rim is round its shelf (the outer strip of a laminated pair), and how many pieces it is cut in. */
  rimLength: Mm;
  rimPieces: number;
  /** The pole's length, when it turns on one. */
  poleLength?: Mm;
}

/** The lazy susan a corner cabinet asks to have made; nothing when it asks for none (a bought one, or shelves). */
export function susanOf(cabinet: Pick<CabinetDesign, 'corner'>): LazySusan | undefined {
  return cabinet.corner?.kind === 'lShaped' || cabinet.corner?.kind === 'diagonal' ? cabinet.corner.susan : undefined;
}

/** Where an L-shaped cabinet's lazy susan turns, in the cabinet's plan (x, z): the middle of its square. */
export function susanAxis(cabinet: Pick<CabinetDesign, 'size' | 'corner'>): [Mm, Mm] {
  return lShapedFrame(cabinet)(cabinet.size.width.mm / 2, cabinet.size.width.mm / 2);
}

/**
 * Doors fixed to the susan turn about its pole, inside the case: their outer corners sweep a circle that has to
 * pass the end sides' inside faces (`radius`, `SUSAN.sweep` clear of them). So each door stops `short` of the
 * side it used to cover, and a fixed stile `stile` wide stands in the space, `gap` from the door. The stile is
 * thin, of the back's material (`stileThick`): the back of a thicker one would be inside the circle, and the
 * door's corner would catch it. Its gap is what keeps its back edge `SUSAN.stileClear` outside the circle.
 */
export function susanDoorFit(cabinet: Pick<CabinetDesign, 'size' | 'materials'>, materials: Material[]): { radius: Mm; short: Mm; stile: Mm; stileThick: Mm; gap: Mm } {
  const A = cabinet.size.width.mm;
  const D = cabinet.size.depth.mm;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const stileThick = thicknessOf(materials, cabinet.materials.backId);
  const radius = A / 2 - t - SUSAN.sweep;
  // The faces' plane is this far out from the pole; a door's outer front corner is on the circle.
  const out = D - A / 2;
  if (!(out > 0 && out < radius - 4 * MM_PER_INCH)) throw new Error('The cabinet is too deep or too shallow for doors that turn with the lazy susan: they would not pass its end sides.');
  const along = Math.sqrt(radius * radius - out * out);
  const short = A / 2 - t - along;
  const gap = Math.max(2 * SUSAN.doorGap, Math.sqrt((radius + SUSAN.stileClear) ** 2 - (out - stileThick) ** 2) - along);
  return { radius, short, stile: short - gap, stileThick, gap };
}

/** The shop-made lazy susan of a corner cabinet: its parts, and its rims for the picture. Undefined when none is made. */
export function deriveSusan(cabinet: CabinetDesign, materials: Material[]): SusanBuild | undefined {
  const susan = susanOf(cabinet);
  const corner = cabinet.corner;
  if (!susan || !corner || corner.kind === 'blind' || cabinet.existing) return undefined;
  const A = cabinet.size.width.mm;
  const D = cabinet.size.depth.mm;
  const H = cabinet.size.height.mm;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const tb = thicknessOf(materials, cabinet.materials.backId);
  const k = toeKickOf(cabinet).height;
  const floor = k + t;
  const inside = H - k - 2 * t;
  const id = (key: string) => `${cabinet.id}/susan-${key}`;

  // Where it stands in the cabinet's plan (x, z), its radius, and (pie-cut) the notch's corner out from its centre
  // along each of its two axes `u` and `v`.
  let centre: [Mm, Mm];
  let R: Mm;
  let notch: Mm | undefined;
  let uSign = 1;
  if (corner.kind === 'lShaped') {
    const at = lShapedFrame(cabinet);
    centre = at(A / 2, A / 2);
    uSign = corner.side === 'right' ? -1 : 1;
    R = lazySusanDiameter(cabinet) / 2;
    // Back from the two faces; right behind the doors when they are fixed to it (a door is about as thick as the case).
    notch = D - (doorsOnSusan(cabinet) ? Math.max(t, 0.75 * MM_PER_INCH) + 0.5 : SUSAN.behindFaces) - A / 2;
    if (notch >= R) notch = undefined;
    else if (notch < SUSAN.pole.diameter + 2 * MM_PER_INCH) throw new Error('The cabinet is too deep for a lazy susan made here: its notch would come to the middle of the shelf.');
  } else {
    const plan = diagonalPlan(cabinet);
    const R2 = Math.SQRT2;
    const toBacks = ((A + D) / 2 - SUSAN.behindFaces / R2 - tb - SUSAN.clear) / (1 + 1 / R2);
    const toSides = ((plan.front / 2 + SUSAN.behindFaces) / R2 - t - SUSAN.clear) / (1 - 1 / R2);
    R = Math.min(toBacks, toSides, (A - 4 * MM_PER_INCH) / 2);
    centre = [plan.front / 2, -(R + SUSAN.behindFaces)];
  }
  if (!(R > 6 * MM_PER_INCH)) throw new Error('The cabinet is too small for a lazy susan made here.');

  // The rim: what it is made of, and the groove it stands in.
  const rimMaterial = susan.rim === 'laminated' ? materials.find((m) => m.id === SUSAN_RIM_HARDBOARD_ID) : materials.find((m) => m.id === cabinet.materials.backId);
  if (susan.rim === 'laminated' && !rimMaterial) throw new Error('The rim of two strips needs 1/8" hardboard among the project\'s materials: add it in Setup, or choose the slotted strip.');
  const tr = rimMaterial?.measuredThickness.mm ?? 0;
  const rimThick = susan.rim === 'none' ? 0 : susan.rim === 'laminated' ? 2 * tr : tr;
  const grooveWide = rimThick + SUSAN.rimPlay;
  const rg = R - SUSAN.rimInset - grooveWide / 2;
  if (susan.rim === 'kerfed' && tr - SUSAN.kerf.skin < 1) throw new Error("The back's material is too thin to slot for a rim.");

  /** From `from` round to `to` (radians, counter-clockwise in u, v) at radius `r`, as points a chord apart. */
  const arc = (r: Mm, from: number, to: number): [Mm, Mm][] => {
    const n = Math.max(2, Math.ceil(((to - from) * 180) / Math.PI / SUSAN.chord));
    return Array.from({ length: n + 1 }, (_, i) => [r * Math.cos(from + ((to - from) * i) / n), r * Math.sin(from + ((to - from) * i) / n)] as [Mm, Mm]);
  };
  /** Where a circle of radius `r` leaves the notch and comes back to it: the whole way round with no notch. */
  const ends = (r: Mm): [number, number] => {
    if (notch === undefined) return [0, 2 * Math.PI];
    const a = Math.asin(notch / r);
    return [Math.PI / 2 - a, 2 * Math.PI + a];
  };
  const [e0, e1] = ends(R);
  const outline: [Mm, Mm][] = notch === undefined ? arc(R, 0, 2 * Math.PI).slice(0, -1) : [...arc(R, e0, e1), [notch, notch]];
  // A pie-cut shelf's rim goes along its two straight edges too, to close its ends where the doors are not fixed to
  // it, as far in from them as from the round edge, the
  // three meeting. With the doors fixed to it they close those edges, and the rim stops at them.
  const straight = notch !== undefined && susan.rim !== 'none' && !doorsOnSusan(cabinet);
  const inFrom = SUSAN.rimInset + grooveWide / 2;
  /** As `ends`, for a circle of radius `r` stopped by lines `by` in from the notch's two edges. */
  const endsAt = (r: Mm, by: Mm): [number, number] => {
    const a = Math.asin((notch! - by) / r);
    return [Math.PI / 2 - a, 2 * Math.PI + a];
  };
  const [g0, g1] = straight ? endsAt(rg, inFrom) : ends(rg);
  // The groove: round, and with straight edges on to their corner and back to where it began.
  const round = arc(rg, g0, g1);
  const groove: [Mm, Mm][] = straight ? [...round, [notch! - inFrom, notch! - inFrom], round[0]!] : round;
  /** How long each straight piece of the rim is, to the outside of the corner where the two meet. */
  const straightLength = straight ? Math.sqrt(rg * rg - (notch! - inFrom) ** 2) - (notch! - inFrom) + grooveWide / 2 : 0;
  const span = g1 - g0;
  const rimLength = (rg + grooveWide / 2) * span;
  const rimPieces = Math.max(1, Math.ceil(rimLength / SUSAN.rimPiece - 1e-6));

  // A shelf's own coordinates: X with the cabinet's, Y back from its front edge, its centre at (R, R).
  const local = ([u, v]: [Mm, Mm]): Point => ({ x: R + uSign * u, y: R - v });
  const world = ([u, v]: [Mm, Mm], y: Mm): Vec3 => [centre[0] + uSign * u, y, centre[1] + v];
  const points = outline.map(local);
  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length]!.y - points[(i + 1) % points.length]!.x * p.y, 0);
  if (area < 0) points.reverse();

  // Their heights: the tops of the two shelves, and of the fixed shelf under the upper one.
  const fixedTop = floor + inside / 2;
  const tops: [Mm, Mm] = susan.turns === 'bearings' ? [floor + SUSAN.bearing + t, fixedTop + SUSAN.bearing + t] : [floor + SUSAN.pole.lift + t, fixedTop + t];
  if (tops[1] + SUSAN.rimHeight > H - t - MM_PER_INCH) throw new Error('The cabinet is too low for two shelves of a lazy susan.');

  const parts: Part[] = [];
  const shown: Part[] = [];
  // With its doors on it, the whole of it turns with the view's Doors slider.
  const turning = doorsOnSusan(cabinet) ? { moves: { kind: 'turn' as const, axis: centre } } : {};
  /** A round thing lying flat, for the picture: `across` wide, its top at `top`, `high` down from there. Drawn as metal (an appliance's shape). */
  const disc = (key: string, name: string, across: Mm, top: Mm, high: Mm) => {
    const ring = arc(across / 2, 0, 2 * Math.PI).slice(0, -1).map(([u, v]): Point => ({ x: across / 2 + u, y: across / 2 - v }));
    const sign = ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % ring.length]!.y - ring[(i + 1) % ring.length]!.x * p.y, 0);
    if (sign < 0) ring.reverse();
    shown.push({
      id: `${cabinet.id}/appliance-susan-${key}/shape`,
      designObjectId: cabinet.id,
      name,
      materialId: cabinet.materials.caseId,
      size: { width: across, height: across, thickness: high },
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: ring }],
      role: 'pullOut',
      shaped: true,
      placement: { origin: [centre[0] - across / 2, top, centre[1] + across / 2], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
      ...turning,
    });
  };
  tops.forEach((top, i) => {
    const n = i + 1;
    const name = n === 1 ? 'Lazy susan, lower shelf' : 'Lazy susan, upper shelf';
    const cut: Feature[] = [];
    if (susan.rim !== 'none') cut.push({ id: 'slot-rim', kind: 'slot', face: 'A', path: groove.map(local), width: grooveWide, depth: SUSAN.rimGroove });
    if (susan.turns === 'pole') cut.push({ id: 'susan-pole', kind: 'hole', face: 'A', center: { x: R, y: R }, diameter: SUSAN.pole.diameter, depth: t });
    parts.push(
      withGrain(
        {
          id: id(`shelf-${n}`),
          designObjectId: cabinet.id,
          name,
          materialId: cabinet.materials.caseId,
          size: { width: 2 * R, height: 2 * R, thickness: t },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: points }, ...cut],
          role: 'pullOut',
          shaped: true,
          placement: { origin: [centre[0] - R, top, centre[1] + R], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
          ...turning,
        },
        'bottom',
        materials,
      ),
    );
    if (susan.rim === 'none' || !rimMaterial) return;
    // The strips, flat: as long as the groove's outer wall goes round, and as high as the rim and the groove.
    const high = SUSAN.rimHeight + SUSAN.rimGroove;
    const strip = (key: string, label: string, length: Mm, cuts: Feature[]) =>
      parts.push(
        withGrain(
          {
            id: id(key),
            designObjectId: cabinet.id,
            name: label,
            materialId: rimMaterial.id,
            size: { width: length, height: high, thickness: tr },
            features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: length, y: 0 }, { x: length, y: high }, { x: 0, y: high }] }, ...cuts],
            role: 'pullOut',
          },
          // Its grain runs along it, round the bend.
          'stretcher',
          materials,
        ),
      );
    const rimName = name.replace(' shelf', '');
    for (let piece = 1; piece <= rimPieces; piece++) {
      const which = rimPieces > 1 ? `, piece ${piece} of ${rimPieces}` : '';
      if (susan.rim === 'kerfed') {
        const length = rimLength / rimPieces;
        const count = Math.floor((length - SUSAN.kerf.spacing) / SUSAN.kerf.spacing) + 1;
        const first = (length - (count - 1) * SUSAN.kerf.spacing) / 2;
        const kerfs = Array.from({ length: count }, (_, j): Feature => {
          const x = first + j * SUSAN.kerf.spacing;
          return { id: `slot-kerf-${j + 1}`, kind: 'slot', face: 'A', path: [{ x, y: 0 }, { x, y: high }], width: SUSAN.kerf.width, depth: tr - SUSAN.kerf.skin };
        });
        strip(`rim-${n}-${piece}`, `${rimName} rim${which}`, length, kerfs);
      } else {
        strip(`rim-${n}-outer-${piece}`, `${rimName} rim, outer strip${which}`, rimLength / rimPieces, []);
        strip(`rim-${n}-inner-${piece}`, `${rimName} rim, inner strip${which}`, ((rg + grooveWide / 2 - tr) * span) / rimPieces, []);
      }
    }
    // The two straight pieces along a pie cut's edges: plain strips, mitred or butted where they meet by hand.
    if (straight) {
      for (const end of [1, 2]) {
        if (susan.rim === 'kerfed') strip(`rim-${n}-end-${end}`, `${rimName} rim, straight piece ${end}`, straightLength, []);
        else {
          strip(`rim-${n}-end-${end}-outer`, `${rimName} rim, straight piece ${end}, outer strip`, straightLength, []);
          strip(`rim-${n}-end-${end}-inner`, `${rimName} rim, straight piece ${end}, inner strip`, straightLength - tr, []);
        }
      }
    }
    // For the picture: the rim bent round, a straight piece for each chord of the groove's outer wall, and one
    // along each straight edge.
    const [o0, o1] = straight ? endsAt(rg + rimThick / 2, inFrom - rimThick / 2) : [g0, g1];
    const bent = arc(rg + rimThick / 2, o0, o1);
    const outer: [Mm, Mm][] = straight ? [...bent, [notch! - inFrom + rimThick / 2, notch! - inFrom + rimThick / 2], bent[0]!] : bent;
    for (let j = 0; j + 1 < outer.length; j++) {
      let [a, b] = [world(outer[j]!, top - SUSAN.rimGroove), world(outer[j + 1]!, top - SUSAN.rimGroove)];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      let dir: Vec3 = [(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len];
      // Its body lies behind its face A (the normal X × Y): turned so that is toward the middle of the shelf.
      const normal: Vec3 = [-dir[2], 0, dir[0]];
      if (normal[0] * (centre[0] - a[0]) + normal[2] * (centre[1] - a[2]) > 0) {
        [a, b] = [b, a];
        dir = [-dir[0], 0, -dir[2]];
      }
      shown.push({
        id: id(`rim-${n}-shape-${j + 1}`),
        designObjectId: cabinet.id,
        name: `${name.replace(' shelf', '')} rim`,
        materialId: rimMaterial.id,
        size: { width: len, height: high, thickness: rimThick },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: high }, { x: 0, y: high }] }],
        role: 'pullOut',
        placement: { origin: a, xAxis: dir, yAxis: [0, 1, 0] },
        ...turning,
      });
    }
  });

  // What it turns on, for the picture: the pole from the bottom to the top, or a bearing ring under each shelf.
  if (susan.turns === 'pole') disc('pole', 'Lazy susan pole', SUSAN.pole.diameter, H - t, inside);
  else tops.forEach((top, i) => disc(`ring-${i + 1}`, 'Lazy susan bearing ring', SUSAN.ring, top - t, SUSAN.bearing));

  // Doors fixed to it stop short of the end sides: a fixed stile stands in each space, flush with the case front,
  // from the bottom to the top, against the side's inside face. It is thin (the back's material), so the doors'
  // corners pass behind it; a cleat of scrap behind its outer edge holds it to the side.
  if (doorsOnSusan(cabinet)) {
    const at = lShapedFrame(cabinet);
    const fit = susanDoorFit(cabinet, materials);
    const stile = (key: string, name: string, a: [Mm, Mm], b: [Mm, Mm], out: [Mm, Mm]) => {
      // Its face A looks out of the cabinet (`out`): X runs along the face whichever way makes X × Y that.
      let [from, to] = [a, b];
      if (-(to[1] - from[1]) * out[0] + (to[0] - from[0]) * out[1] < 0) [from, to] = [to, from];
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      parts.push(
        withGrain(
          {
            id: id(key),
            designObjectId: cabinet.id,
            name,
            materialId: cabinet.materials.backId,
            size: { width: len, height: inside, thickness: fit.stileThick },
            features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: inside }, { x: 0, y: inside }] }],
            role: 'pullOut',
            placement: { origin: [from[0], floor, from[1]], xAxis: [(to[0] - from[0]) / len, 0, (to[1] - from[1]) / len], yAxis: [0, 1, 0] },
          },
          'side',
          materials,
        ),
      );
    };
    const [p0, p1] = [A - t - fit.stile, A - t];
    const [o1, o2] = [at(D + 1, D + 1), at(D, D)];
    stile('stile-1', 'Lazy susan, stile beside the door', at(p0, D), at(p1, D), [0, 1]);
    stile('stile-2', 'Lazy susan, stile beside the other door', at(D, p0), at(D, p1), [o1[0] - o2[0], 0]);
  }

  // On bearings, the upper shelf turns on a fixed shelf. A diagonal cabinet has its own shelf there; an L-shaped
  // one gets this: the bottom's shape, back from the two faces, on cleats on the backs and the end sides.
  if (susan.turns === 'bearings' && corner.kind === 'lShaped') {
    const at = lShapedFrame(cabinet);
    const back = D - SUSAN.behindFaces;
    const plan: [Mm, Mm][] = [at(tb, tb), at(A - t, tb), at(A - t, back), at(back, back), at(back, A - t), at(tb, A - t)];
    const minX = Math.min(...plan.map((p) => p[0]));
    const maxZ = Math.max(...plan.map((p) => p[1]));
    const shape = plan.map(([x, z]) => ({ x: x - minX, y: maxZ - z }));
    const turn = shape.reduce((sum, p, i) => sum + p.x * shape[(i + 1) % shape.length]!.y - shape[(i + 1) % shape.length]!.x * p.y, 0);
    if (turn < 0) shape.reverse();
    parts.push(
      withGrain(
        {
          id: id('fixed-shelf'),
          designObjectId: cabinet.id,
          name: 'Lazy susan, fixed shelf',
          materialId: cabinet.materials.caseId,
          size: { width: Math.max(...shape.map((p) => p.x)), height: Math.max(...shape.map((p) => p.y)), thickness: t },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: shape }],
          role: 'pullOut',
          shaped: true,
          placement: { origin: [minX, fixedTop, maxZ], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
        },
        'bottom',
        materials,
      ),
    );
  }

  return { parts, shown, diameter: 2 * R, pieCut: notch !== undefined, turns: susan.turns, rim: susan.rim, rimLength, rimPieces, ...(straight ? { straightLength } : {}), ...(susan.turns === 'pole' ? { poleLength: inside } : {}) };
}

/** The rims of the project's shop-made lazy susans, bent round their shelves, for the picture only. */
export function susanShapes(cabinets: CabinetDesign[], materials: Material[]): Part[] {
  return cabinets.flatMap((cabinet) => {
    try {
      return deriveSusan(cabinet, materials)?.shown ?? [];
    } catch {
      return [];
    }
  });
}
