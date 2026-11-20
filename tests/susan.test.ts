// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SUSAN, buildCabinetAssembly, cabinetsOf, deriveCabinetParts, deriveParts, deriveSusan, doorsOnSusan, lazySusanDiameter, partBox, shopFor, susanAxis, susanDoorFit, susanShapes } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { HARDBOARD_1_8_ID, createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, Feature, LazySusan, PlanWarning } from '@/model';
import { activeMachine } from '@/plan';
import { addMaterialFromCatalog } from '@/design/materials';
import { applyCabinetLayout, createBaseCabinetProject, makeLShaped } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * A lazy susan made here (both ways of turning, a rim
 * of slotted 1/4" plywood in a slot in the shelf, the 1/8" option as well; both corner cabinets).
 */
const profile = createStarterShopProfile();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const slots = (features: Feature[]) => features.filter((f): f is Extract<Feature, { kind: 'slot' }> => f.kind === 'slot');

function corner(kind: 'lShaped' | 'diagonal', susan: LazySusan | undefined, side: 'left' | 'right' = 'left') {
  const project = createBaseCabinetProject('frameless', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  if (kind === 'lShaped') makeLShaped(project, stored.id, side);
  else {
    stored.size.width = len('36"');
    applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');
    stored.corner = { kind: 'diagonal', side };
  }
  if (susan && stored.corner && stored.corner.kind !== 'blind') stored.corner.susan = susan;
  if (susan?.rim === 'laminated') addMaterialFromCatalog(project, profile.materialCatalog, HARDBOARD_1_8_ID);
  // A full sheet on hand: a shelf is 28" across or more.
  project.plan.blank.stock = { width: len('48"'), height: len('96"') };
  const shop = shopFor(project, profile);
  return { project, shop, cabinet: cabinetsOf(project)[0]! };
}

describe('a lazy susan made here', () => {
  it('none asked for: nothing is made, the L-shaped cabinet lists a bought one and the diagonal one keeps its shelves', () => {
    for (const kind of ['lShaped', 'diagonal'] as const) {
      const { project, shop, cabinet } = corner(kind, undefined);
      expect(deriveSusan(cabinet, shop.materials)).toBeUndefined();
      expect(deriveCabinetParts(project, shop).some((p) => p.id.includes('/susan-'))).toBe(false);
    }
  });

  for (const side of ['left', 'right'] as const) {
    it(`L-shaped, corner at the ${side}: two pie-cut shelves inside the case, the notch toward the two faces`, () => {
      const { project, shop, cabinet } = corner('lShaped', { turns: 'bearings', rim: 'kerfed' }, side);
      const susan = deriveSusan(cabinet, shop.materials)!;
      expect(susan.pieCut).toBe(true);
      expect(susan.diameter).toBeCloseTo(lazySusanDiameter(cabinet), 6);
      const parts = deriveCabinetParts(project, shop);
      const shelves = parts.filter((p) => /\/susan-shelf-\d$/.test(p.id));
      expect(shelves.map((p) => p.name)).toEqual(['Lazy susan, lower shelf', 'Lazy susan, upper shelf']);
      const caseBox = { min: [0, 1, 2].map((k) => Math.min(...parts.filter((p) => p.role === 'side' || p.role === 'back').map((p) => partBox(p).min[k]!))), max: [0, 1, 2].map((k) => Math.max(...parts.filter((p) => p.role === 'side' || p.role === 'back').map((p) => partBox(p).max[k]!))) };
      for (const shelf of shelves) {
        const box = partBox(shelf);
        expect(shelf.shaped).toBe(true);
        expect(shelf.size.width).toBeCloseTo(susan.diameter, 6);
        // Inside the case in plan, with room to turn.
        for (const k of [0, 2]) {
          expect(box.min[k]!).toBeGreaterThan(caseBox.min[k]! + 25);
          expect(box.max[k]!).toBeLessThan(caseBox.max[k]! - 25);
        }
        // Counter-clockwise, as a solid needs it; a quarter is cut out of the circle, less than a full quarter of its area.
        const o = shelf.features[0]!.kind === 'cutout' ? shelf.features[0]!.outline : [];
        const area = o.reduce((sum, p, i) => sum + p.x * o[(i + 1) % o.length]!.y - o[(i + 1) % o.length]!.x * p.y, 0) / 2;
        const R = susan.diameter / 2;
        expect(area).toBeGreaterThan(0.8 * Math.PI * R * R);
        expect(area).toBeLessThan(0.99 * Math.PI * R * R);
        // The notch's corner is the one point well inside the circle.
        const inner = o.filter((p) => Math.hypot(p.x - R, p.y - R) < R - 5);
        expect(inner).toHaveLength(1);
        // It is toward the front (part Y runs back from the front edge) and toward the faces' corner.
        expect(inner[0]!.y).toBeLessThan(R);
        expect(side === 'left' ? inner[0]!.x > R : inner[0]!.x < R).toBe(true);
      }
      // One over the other, the lower just off the bottom on its bearing, the upper on the fixed shelf half-way up.
      const [low, high] = shelves.map(partBox);
      const bottom = partBox(parts.find((p) => p.id === 'cabinet-1/bottom')!);
      expect(low!.min[1]! - bottom.max[1]!).toBeCloseTo(SUSAN.bearing, 6);
      const fixed = partBox(parts.find((p) => p.id.endsWith('/susan-fixed-shelf'))!);
      expect(high!.min[1]! - fixed.max[1]!).toBeCloseTo(SUSAN.bearing, 6);
      expect(fixed.min[1]!).toBeGreaterThan(low!.max[1]! + SUSAN.rimHeight);
    });
  }

  it('the slotted rim: a groove round the shelf for it, and a strip with slots across it that leave its face veneer', () => {
    const { project, shop, cabinet } = corner('lShaped', { turns: 'bearings', rim: 'kerfed' });
    const susan = deriveSusan(cabinet, shop.materials)!;
    const parts = deriveCabinetParts(project, shop);
    const shelf = parts.find((p) => p.id.endsWith('/susan-shelf-1'))!;
    const back = shop.materials.find((m) => m.id === cabinet.materials.backId)!;
    const [groove] = slots(shelf.features);
    const R = susan.diameter / 2;
    expect(groove).toMatchObject({ id: 'slot-rim', face: 'A', depth: SUSAN.rimGroove });
    expect(groove!.width).toBeCloseTo(back.measuredThickness.mm + SUSAN.rimPlay, 6);
    // It follows a circle just inside the shelf's edge, then the two straight edges of the pie cut to their corner, and closes.
    const radii = groove!.path.map((p) => Math.hypot(p.x - R, p.y - R));
    const onCircle = radii.filter((r) => Math.abs(r - radii[0]!) < 1e-6);
    expect(onCircle).toHaveLength(radii.length - 1);
    expect(R - radii[0]! - groove!.width / 2).toBeCloseTo(SUSAN.rimInset, 6);
    expect(groove!.path.at(-1)).toEqual(groove!.path[0]);
    // The corner of the straight grooves is as far in from the notch's two edges as the round groove is from the round edge.
    const o = shelf.features[0]!.kind === 'cutout' ? shelf.features[0]!.outline : [];
    const notchCorner = o.find((p) => Math.hypot(p.x - R, p.y - R) < R - 5)!;
    const grooveCorner = groove!.path.at(-2)!;
    expect(Math.abs(grooveCorner.x - notchCorner.x)).toBeCloseTo(SUSAN.rimInset + groove!.width / 2, 6);
    expect(Math.abs(grooveCorner.y - notchCorner.y)).toBeCloseTo(SUSAN.rimInset + groove!.width / 2, 6);
    // Nearer the shelf's middle than the notch's corner is: the rim stands on the shelf, not in the notch.
    expect(Math.hypot(grooveCorner.x - R, grooveCorner.y - R)).toBeLessThan(Math.hypot(notchCorner.x - R, notchCorner.y - R));
    // Two plain straight strips a shelf for them.
    const endStrips = parts.filter((p) => /\/susan-rim-1-end-\d$/.test(p.id));
    expect(endStrips).toHaveLength(2);
    expect(endStrips.every((p) => slots(p.features).length === 0 && Math.abs(p.size.width - susan.straightLength!) < 1e-6)).toBe(true);
    expect(susan.straightLength).toBeGreaterThan(150);
    // The strip: of the back's material, as long as the groove's outer wall, as high as the rim and the groove, bent later (no place).
    const strip = parts.find((p) => p.id.endsWith('/susan-rim-1-1'))!;
    expect(strip.materialId).toBe(back.id);
    expect(strip.placement).toBeUndefined();
    expect(strip.size.height).toBe(SUSAN.rimHeight + SUSAN.rimGroove);
    // In two pieces, each no longer than 4', that butt in the groove.
    expect(susan.rimPieces).toBe(2);
    expect(strip.name).toBe('Lazy susan, lower rim, piece 1 of 2');
    expect(strip.size.width).toBeCloseTo(susan.rimLength / 2, 6);
    expect(susan.rimLength).toBeGreaterThan(0.75 * 2 * Math.PI * (R - 10));
    expect(susan.rimLength).toBeLessThan(2 * Math.PI * R);
    const kerfs = slots(strip.features);
    expect(kerfs.length).toBeGreaterThan(50);
    for (const kerf of kerfs) {
      expect(kerf.width).toBeCloseTo(3.175, 6);
      expect(kerf.depth).toBeCloseTo(back.measuredThickness.mm - SUSAN.kerf.skin, 6);
      expect(kerf.path).toEqual([{ x: kerf.path[0]!.x, y: 0 }, { x: kerf.path[0]!.x, y: strip.size.height }]);
    }
    expect(kerfs[1]!.path[0]!.x - kerfs[0]!.path[0]!.x).toBeCloseTo(SUSAN.kerf.spacing, 6);
    expect(parts.filter((p) => /\/susan-rim-\d-\d$/.test(p.id))).toHaveLength(4);
  });

  it('the rim of two strips of 1/8" hardboard: a wider groove, two plain strips a shelf, the inner one shorter', () => {
    const { project, shop, cabinet } = corner('lShaped', { turns: 'bearings', rim: 'laminated' });
    const hardboard = shop.materials.find((m) => m.id === HARDBOARD_1_8_ID)!;
    const parts = deriveCabinetParts(project, shop);
    const [groove] = slots(parts.find((p) => p.id.endsWith('/susan-shelf-2'))!.features);
    expect(groove!.width).toBeCloseTo(2 * hardboard.measuredThickness.mm + SUSAN.rimPlay, 6);
    const [outer, inner] = [parts.find((p) => p.id.endsWith('/susan-rim-2-outer-1'))!, parts.find((p) => p.id.endsWith('/susan-rim-2-inner-1'))!];
    expect(outer.materialId).toBe(HARDBOARD_1_8_ID);
    expect(slots(outer.features)).toEqual([]);
    expect(inner.size.width).toBeLessThan(outer.size.width);
    expect(outer.size.width).toBeCloseTo(deriveSusan(cabinet, shop.materials)!.rimLength / 2, 6);
    expect(parts.filter((p) => /\/susan-rim-\d-(outer|inner)-\d$/.test(p.id))).toHaveLength(8);
    // And two strips for each straight piece along the pie cut's edges.
    expect(parts.filter((p) => /\/susan-rim-\d-end-\d-(outer|inner)$/.test(p.id))).toHaveLength(8);
  });

  it('no rim: plain shelves', () => {
    const { project, shop } = corner('lShaped', { turns: 'bearings', rim: 'none' });
    const parts = deriveCabinetParts(project, shop);
    expect(parts.some((p) => p.id.includes('/susan-rim-'))).toBe(false);
    expect(slots(parts.find((p) => p.id.endsWith('/susan-shelf-1'))!.features)).toEqual([]);
  });

  it('on a pole: a hole through the centre of each shelf, no fixed shelf, the lower shelf off the bottom', () => {
    const { project, shop, cabinet } = corner('lShaped', { turns: 'pole', rim: 'kerfed' });
    const susan = deriveSusan(cabinet, shop.materials)!;
    const parts = deriveCabinetParts(project, shop);
    expect(parts.some((p) => p.id.endsWith('/susan-fixed-shelf'))).toBe(false);
    for (const shelf of parts.filter((p) => /\/susan-shelf-\d$/.test(p.id))) {
      const hole = shelf.features.find((f) => f.id === 'susan-pole')!;
      expect(hole).toMatchObject({ kind: 'hole', center: { x: susan.diameter / 2, y: susan.diameter / 2 }, diameter: SUSAN.pole.diameter, depth: shelf.size.thickness });
    }
    expect(susan.poleLength).toBeCloseTo(cabinet.size.height.mm - partBox(parts.find((p) => p.id === 'cabinet-1/bottom')!).max[1]! - parts.find((p) => p.id === 'cabinet-1/top')!.size.thickness, 4);
    const low = partBox(parts.find((p) => p.id.endsWith('/susan-shelf-1'))!);
    expect(low.min[1]! - partBox(parts.find((p) => p.id === 'cabinet-1/bottom')!).max[1]!).toBeCloseTo(SUSAN.pole.lift, 6);
  });

  it('diagonal: two whole round shelves that clear the backs, the sides and the front; on bearings its one shelf is the fixed one', () => {
    const { project, shop, cabinet } = corner('diagonal', { turns: 'bearings', rim: 'kerfed' });
    const susan = deriveSusan(cabinet, shop.materials)!;
    expect(susan.pieCut).toBe(false);
    const parts = deriveCabinetParts(project, shop);
    const shelves = parts.filter((p) => /\/susan-shelf-\d$/.test(p.id));
    expect(shelves).toHaveLength(2);
    const R = susan.diameter / 2;
    const centre = [partBox(shelves[0]!).min[0]! + R, partBox(shelves[0]!).min[2]! + R];
    // Every point of the circle is inside the case's plan: nearer its middle than any back or side panel's inner face.
    for (const panel of parts.filter((p) => p.role === 'side' || p.role === 'back')) {
      const o = panel.placement!.origin;
      const x = panel.placement!.xAxis;
      // The panel's face line in plan, from its origin along its X: the centre's distance from it is more than the radius.
      const d = Math.abs((centre[0]! - o[0]) * x[2] - (centre[1]! - o[2]) * x[0]);
      expect(d).toBeGreaterThan(R + 3);
    }
    expect(partBox(shelves[0]!).max[2]!).toBeLessThan(-SUSAN.behindFaces + 1e-6);
    // Whole: the groove goes all the way round, and so does the rim.
    const [groove] = slots(shelves[0]!.features);
    expect(Math.hypot(groove!.path[0]!.x - groove!.path.at(-1)!.x, groove!.path[0]!.y - groove!.path.at(-1)!.y)).toBeLessThan(1e-6);
    expect(susan.rimLength).toBeCloseTo(2 * Math.PI * (R - SUSAN.rimInset), 4);
    // Its own shelf, one, half-way up, is what the upper one turns on; no other fixed shelf.
    expect(parts.filter((p) => p.role === 'shelf')).toHaveLength(1);
    expect(parts.some((p) => p.id.endsWith('/susan-fixed-shelf'))).toBe(false);
    expect(partBox(shelves[1]!).min[1]! - partBox(parts.find((p) => p.role === 'shelf')!).max[1]!).toBeCloseTo(SUSAN.bearing, 6);
    // On a pole it has no shelf at all.
    const pole = corner('diagonal', { turns: 'pole', rim: 'none' });
    expect(deriveCabinetParts(pole.project, pole.shop).some((p) => p.role === 'shelf')).toBe(false);
  });

  it('in the 3D view: the shelves are drawn, the flat strips are not, and each rim is drawn bent round its shelf', () => {
    const { project, shop, cabinet } = corner('lShaped', { turns: 'bearings', rim: 'kerfed' });
    const parts = deriveCabinetParts(project, shop);
    const shown = susanShapes([cabinet], shop.materials);
    const susan = deriveSusan(cabinet, shop.materials)!;
    const placed = buildCabinetAssembly([...parts, ...shown]).parts;
    expect(placed.some((p) => /\/susan-rim-\d-\d$/.test(p.partId))).toBe(false);
    expect(placed.filter((p) => /\/susan-shelf-\d$/.test(p.partId))).toHaveLength(2);
    const every = shown.filter((p) => p.id.includes('/susan-rim-1-shape-'));
    // The last two are the straight pieces along the pie cut's edges; the rest go round.
    const pieces = every.slice(0, -2);
    expect(every.slice(-2).every((p) => Math.abs(p.size.width - susan.straightLength!) < 8)).toBe(true);
    expect(pieces.length).toBeGreaterThan(40);
    // The pieces together are as long as the strip, near enough, and stand from the groove's floor to the rim's top.
    expect(pieces.reduce((sum, p) => sum + p.size.width, 0)).toBeGreaterThan(0.97 * susan.rimLength);
    expect(pieces.reduce((sum, p) => sum + p.size.width, 0)).toBeLessThan(1.01 * susan.rimLength);
    const shelf = partBox(parts.find((p) => p.id.endsWith('/susan-shelf-1'))!);
    const R = susan.diameter / 2;
    const centre = [shelf.min[0]! + R, shelf.min[2]! + R];
    for (const piece of pieces) {
      const box = partBox(piece);
      expect(box.min[1]).toBeCloseTo(shelf.max[1]! - SUSAN.rimGroove, 6);
      expect(box.max[1]).toBeCloseTo(shelf.max[1]! + SUSAN.rimHeight, 6);
      // Inside the shelf's edge: its middle is half the rim's thickness inside the groove's outer wall, near enough (a chord).
      const mid = Math.hypot((box.min[0]! + box.max[0]!) / 2 - centre[0]!, (box.min[2]! + box.max[2]!) / 2 - centre[1]!);
      expect(mid).toBeLessThan(R - SUSAN.rimInset - piece.size.thickness / 2 + 0.2);
      expect(mid).toBeGreaterThan(R - SUSAN.rimInset - piece.size.thickness / 2 - 1.5);
    }
    // None of them is among the job's parts.
    expect(parts.some((p) => p.id.includes('-shape-'))).toBe(false);
  });

  it('too small or too low, or with no hardboard for the rim, it says so', () => {
    const { project, shop, cabinet } = corner('lShaped', { turns: 'bearings', rim: 'laminated' });
    expect(() => deriveSusan(cabinet, shop.materials.filter((m) => m.id !== HARDBOARD_1_8_ID))).toThrow(/needs 1\/8" hardboard/);
    (project.context as CasesContext).pieces[0]!.size.height = len('9"');
    expect(() => deriveSusan(cabinetsOf(project)[0]!, shop.materials)).toThrow(/too low/);
  });
});

describe('what it turns on, and its doors, in the 3D view', () => {
  it('the pole is drawn through the middle of the shelves from the bottom to the top; on bearings a ring under each shelf', () => {
    const pole = corner('lShaped', { turns: 'pole', rim: 'kerfed' });
    const parts = deriveCabinetParts(pole.project, pole.shop);
    const shown = susanShapes([pole.cabinet], pole.shop.materials);
    const drawn = partBox(shown.find((p) => p.id.endsWith('/appliance-susan-pole/shape'))!);
    const shelf = partBox(parts.find((p) => p.id.endsWith('/susan-shelf-1'))!);
    for (const k of [0, 2]) expect((drawn.min[k]! + drawn.max[k]!) / 2).toBeCloseTo((shelf.min[k]! + shelf.max[k]!) / 2, 4);
    expect(drawn.max[0]! - drawn.min[0]!).toBeCloseTo(SUSAN.pole.diameter, 4);
    expect(drawn.min[1]).toBeCloseTo(partBox(parts.find((p) => p.id === 'cabinet-1/bottom')!).max[1]!, 4);
    expect(drawn.max[1]).toBeCloseTo(partBox(parts.find((p) => p.id === 'cabinet-1/top')!).min[1]!, 4);
    // It is where the susan's axis is said to be.
    expect([(drawn.min[0]! + drawn.max[0]!) / 2, (drawn.min[2]! + drawn.max[2]!) / 2]).toEqual(susanAxis(pole.cabinet).map((v) => expect.closeTo(v, 4)));
    const rings = corner('lShaped', { turns: 'bearings', rim: 'none' });
    const ringParts = deriveCabinetParts(rings.project, rings.shop);
    const two = susanShapes([rings.cabinet], rings.shop.materials).filter((p) => /appliance-susan-ring-\d\/shape$/.test(p.id));
    expect(two).toHaveLength(2);
    // Each fills the space under its shelf.
    expect(partBox(two[0]!).max[1]).toBeCloseTo(partBox(ringParts.find((p) => p.id.endsWith('/susan-shelf-1'))!).min[1]!, 4);
    expect(partBox(two[0]!).min[1]).toBeCloseTo(partBox(ringParts.find((p) => p.id === 'cabinet-1/bottom')!).max[1]!, 4);
    expect(partBox(two[1]!).min[1]).toBeCloseTo(partBox(ringParts.find((p) => p.id.endsWith('/susan-fixed-shelf'))!).max[1]!, 4);
  });

  it('a bi-fold pair: the door on the second face follows the first, unfolding against the way it swings', () => {
    for (const side of ['left', 'right'] as const) {
      const { project, shop } = corner('lShaped', { turns: 'bearings', rim: 'none' }, side);
      const fronts = deriveParts(project, shop);
      const [one, two] = [fronts.filter((p) => !p.moves), fronts.filter((p) => p.moves)];
      expect(one).toHaveLength(1);
      expect(two).toHaveLength(1);
      expect(two[0]!.moves).toEqual({ kind: 'follow', partId: one[0]!.id });
      const placed = buildCabinetAssembly([...deriveCabinetParts(project, shop), ...fronts], shop.hardware).parts;
      const [lead, follower] = [placed.find((p) => p.partId === one[0]!.id)!, placed.find((p) => p.partId === two[0]!.id)!];
      expect(lead.swing).toBeDefined();
      expect(lead.follows).toBeUndefined();
      expect(follower.follows).toMatchObject({ partId: lead.partId, sign: lead.swing!.sign === 1 ? -1 : 1 });
      expect(follower.hinges).toBeUndefined();
      expect(follower.swing).toBeUndefined();
      // The knuckle is at the corner where the two faces meet, the second door's hinged edge; the first door's hinged edge is at its end side.
      const [a, b] = [partBox(one[0]!), partBox(two[0]!)];
      const knuckle = follower.follows!.knuckle;
      expect(knuckle[0]).toBeGreaterThanOrEqual(b.min[0]! - 1e-6);
      expect(knuckle[0]).toBeLessThanOrEqual(b.max[0]! + 1e-6);
      expect(Math.hypot(knuckle[0] - lead.swing!.pivot[0], knuckle[2] - lead.swing!.pivot[2])).toBeGreaterThan(a.max[0]! - a.min[0]! - 30);
    }
  });

  it('nothing else moves that way: an ordinary cabinet, and a diagonal one, have no part that turns or follows', () => {
    const plain = createBaseCabinetProject('frameless', 'doors');
    expect(deriveParts(plain, shopFor(plain, profile)).some((p) => p.moves)).toBe(false);
    const diagonal = corner('diagonal', { turns: 'pole', rim: 'none' });
    expect([...deriveParts(diagonal.project, diagonal.shop), ...deriveCabinetParts(diagonal.project, diagonal.shop), ...susanShapes([diagonal.cabinet], diagonal.shop.materials)].some((p) => p.moves)).toBe(false);
  });
});

describe('doors fixed to the lazy susan', () => {
  const onSusan: LazySusan = { turns: 'pole', rim: 'kerfed', doors: 'onSusan' };

  it('only on a pole in an L-shaped cabinet: on bearing rings, or in a diagonal cabinet, the setting does nothing', () => {
    expect(doorsOnSusan(corner('lShaped', onSusan).cabinet)).toBe(true);
    expect(doorsOnSusan(corner('lShaped', { ...onSusan, turns: 'bearings' }).cabinet)).toBe(false);
    expect(doorsOnSusan(corner('diagonal', onSusan).cabinet)).toBe(false);
    expect(doorsOnSusan(corner('lShaped', { turns: 'pole', rim: 'kerfed' }).cabinet)).toBe(false);
  });

  for (const side of ['left', 'right'] as const) {
    it(`corner at the ${side}: the doors stand inside the opening with no hinges, and everything that turns passes the case all the way round`, () => {
      const { project, shop, cabinet } = corner('lShaped', onSusan, side);
      const fit = susanDoorFit(cabinet, shop.materials);
      const parts = deriveCabinetParts(project, shop);
      const fronts = deriveParts(project, shop);
      const shown = susanShapes([cabinet], shop.materials);
      const axis = susanAxis(cabinet);
      // With the doors on it the rim stops at the straight edges: the doors close them.
      expect(deriveSusan(cabinet, shop.materials)!.straightLength).toBeUndefined();
      expect(parts.some((p) => /\/susan-rim-\d-end-/.test(p.id))).toBe(false);
      // No corner post; a stile beside each door.
      expect(parts.some((p) => p.id.endsWith('/corner-post'))).toBe(false);
      expect(parts.filter((p) => /\/susan-stile-\d$/.test(p.id))).toHaveLength(2);
      // Two doors, no cups, turning about the pole.
      expect(fronts).toHaveLength(2);
      for (const door of fronts) {
        expect(door.features.some((f) => f.kind === 'cup')).toBe(false);
        expect(door.moves).toEqual({ kind: 'turn', axis });
      }
      // Inside the case's height, a gap under and over.
      const [bottom, top] = [partBox(parts.find((p) => p.id === 'cabinet-1/bottom')!), partBox(parts.find((p) => p.id === 'cabinet-1/top')!)];
      for (const door of fronts.map(partBox)) {
        expect(door.min[1]! - bottom.max[1]!).toBeCloseTo(2 * SUSAN.doorGap, 4);
        expect(top.min[1]! - door.max[1]!).toBeCloseTo(2 * SUSAN.doorGap, 4);
      }
      // Everything that turns: the doors, the shelves, the rims, the pole. No corner of any is further from the pole than the sweep.
      const turning = [...fronts, ...parts, ...shown].filter((p) => p.moves?.kind === 'turn');
      expect(turning.filter((p) => /\/susan-shelf-\d$/.test(p.id))).toHaveLength(2);
      expect(turning.some((p) => p.id.endsWith('/appliance-susan-pole/shape'))).toBe(true);
      const reach = (p: (typeof turning)[number]) => {
        const box = partBox(p);
        return Math.max(...[box.min[0]!, box.max[0]!].flatMap((x) => [box.min[2]!, box.max[2]!].map((z) => Math.hypot(x - axis[0], z - axis[1]))));
      };
      for (const door of fronts) expect(reach(door)).toBeLessThanOrEqual(fit.radius + 1e-6);
      expect(Math.max(...fronts.map(reach))).toBeCloseTo(fit.radius, 3);
      // Nothing that stays is nearer the pole than that, at the doors' height: the sides, the backs, the stiles.
      const staying = parts.filter((p) => p.role === 'side' || p.role === 'back' || /\/susan-stile-\d$/.test(p.id));
      expect(staying.length).toBeGreaterThanOrEqual(6);
      for (const p of staying) {
        const box = partBox(p);
        // The nearest point of its plan (a rectangle square to the axes) to the pole.
        const near = Math.hypot(Math.max(box.min[0]! - axis[0], 0, axis[0] - box.max[0]!), Math.max(box.min[2]! - axis[1], 0, axis[1] - box.max[2]!));
        expect(near, p.id).toBeGreaterThan(fit.radius + 1);
      }
      // The doors' backs are against the shelves' straight edges: the notch's corner is just behind the two doors.
      const shelf = parts.find((p) => p.id.endsWith('/susan-shelf-1'))!;
      const R = shelf.size.width / 2;
      const o = shelf.features[0]!.kind === 'cutout' ? shelf.features[0]!.outline : [];
      const inner = o.find((p) => Math.hypot(p.x - R, p.y - R) < R - 5)!;
      const notchZ = partBox(shelf).max[2]! - inner.y;
      const face1 = fronts.map(partBox).find((b) => b.max[0]! - b.min[0]! > b.max[2]! - b.min[2]!)!;
      expect(face1.min[2]! - notchZ).toBeGreaterThanOrEqual(0);
      expect(face1.min[2]! - notchZ).toBeLessThan(2);
      // In the assembly they turn; nothing swings or follows.
      const placed = buildCabinetAssembly([...parts, ...fronts, ...shown], shop.hardware).parts;
      expect(placed.filter((p) => p.turnsAbout).length).toBe(turning.length);
      expect(placed.some((p) => p.swing || p.hinges || p.follows)).toBe(false);
    });
  }

  it('as a job: no hinges and no bi-fold hinges are bought; brackets and a stop are; the checklist says how the doors go on', () => {
    const { project } = corner('lShaped', onSusan);
    const shop = createStarterShop();
    const job = buildJob(project, shop);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)}`);
    const items = lists.hardware.map((h) => h.item);
    expect(items.some((i) => /hinge/i.test(i))).toBe(false);
    expect(lists.hardware.find((h) => h.item.startsWith('Angle brackets'))!.quantity).toBe(8);
    expect(items.some((i) => i.startsWith('Stop for the pole'))).toBe(true);
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ')).toContain("The lazy susan's doors turn with it");
  }, 60000);

  it('a cabinet whose faces are too near the pole or too far says so', () => {
    const { project, shop } = corner('lShaped', onSusan);
    (project.context as CasesContext).pieces[0]!.size.depth = len('17"');
    expect(() => susanDoorFit(cabinetsOf(project)[0]!, shop.materials)).toThrow(/would not pass its end sides/);
  });
});

describe('a lazy susan made here, as a job', () => {
  for (const [kind, susan] of [
    ['lShaped', { turns: 'bearings', rim: 'kerfed' }],
    ['lShaped', { turns: 'pole', rim: 'laminated' }],
    ['diagonal', { turns: 'pole', rim: 'kerfed' }],
  ] as ['lShaped' | 'diagonal', LazySusan][]) {
    it(`${kind}, ${susan.turns}, ${susan.rim}: the CNC cuts the shelves, their grooves and the strips' slots; every file parses`, async () => {
      const { project } = corner(kind, susan);
      const shop = createStarterShop();
      const job = buildJob(project, shop);
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      // The shelves and the strips are cut out on the CNC.
      for (const end of ['/susan-shelf-1', '/susan-shelf-2']) expect(job.plan.parts.find((p) => p.partId.endsWith(end))!.cutOut).toBe('cnc');
      // One row for the slots, with a bit no wider than a slot.
      const op = job.plan.operations.find((o) => o.kind === 'slot')!;
      expect(op.label).toBe('Case: slots');
      const bit = shop.tools.find((t) => t.id === op.clearToolId)!;
      expect(bit.shape.kind === 'endMill' && bit.shape.diameter.mm <= (susan.rim === 'kerfed' ? 3.175 : 6.8) + 1e-6).toBe(true);
      if (susan.rim === 'kerfed') expect(op.source.kind === 'features' && op.source.refs.filter((r) => r.featureId.startsWith('slot-kerf-')).length).toBeGreaterThan(200);
      expect(op.source.kind === 'features' && op.source.refs.filter((r) => r.featureId === 'slot-rim')).toHaveLength(2);
      for (const file of job.files) {
        expect(file.text).not.toMatch(/^M[345]\b/m);
        for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      }
      // The lists: what it turns on is bought; the bought susan is gone.
      const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)}`);
      const rows = lists.hardware.filter((h) => h.group === 'Corner cabinets').map((h) => h.item);
      expect(rows.some((r) => r.startsWith('Lazy susan, two pie-cut shelves'))).toBe(false);
      if (susan.turns === 'bearings') expect(lists.hardware.find((h) => h.item.startsWith('Lazy susan bearing ring'))!.quantity).toBe(2);
      else expect(rows.filter((r) => /pole/i.test(r))).toHaveLength(3);
      const text = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ');
      expect(text).toContain(susan.turns === 'pole' ? 'The lazy susan, on its pole' : 'The lazy susan, on its bearing rings');
      expect(text).toContain(susan.rim === 'kerfed' ? 'bend each slotted strip with its slots inward' : 'glue the outer strip into the groove');
    }, 60000);
  }
});
