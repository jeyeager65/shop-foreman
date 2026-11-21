// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pocketArc } from '@/cam/cuts';
import { type Feeds, Path } from '@/cam/path';
import { LOW_POCKET, POCKET, arcFloorAt, arcSeatAt, arcShape, lowPocketScrew, slotShape } from '@/geometry/pocketHole';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { jigItems } from '@/jigs/catalog';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { activeMachine, withPocketLooks } from '@/plan';
import { cncPocketsFit, lowPocketsFit } from '@/plan/parts';
import type { CasesContext, Part } from '@/model';
import { buildPartMeshes } from '@/geometry/solids';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { GUIDE, type PocketGuide, buildPocketGuide, buildPocketGuideObjects, buildPocketGuideInUse, guideAngle, guideKeyNose, guidePlateIn, lowKeyEnd, pocketGuideProblems } from '@/jigs/pocketGuide';
import { LOW_KINDS, POCKET_TEST, buildPocketTest, lowPocketBit } from '@/job/pocketTest';
import { PLYWOOD_3_4_ID, createStarterShop, createStarterShopProfile } from '@/libraries';
import { len } from '@/units';

/** A low-angle pocket, as a routed pocket-hole machine cuts it: the screw at 3 or 6 degrees, the floor an arc. */
const QUARTER = len('1/4"').mm;
const T = 19.05;
const feeds: Feeds = { feed: 1800, plunge: 360, depthPerPass: 3.2, stepover: 2.54, finish: 0 };

describe('the shape of a low-angle pocket', () => {
  for (const angle of LOW_POCKET.angles) {
    it(`${angle} degrees: deep at the seat, its floor level for the bit's width and then up to the face in an arc`, () => {
      const arc = arcShape(T, QUARTER, angle);
      expect(arc.fits).toBe(true);
      // The seat 7/8" from the edge, further than a 15 degree pocket's; the floor as far under the screw as the bore's.
      expect(arc.seat).toBeCloseTo(len('7/8"').mm, 9);
      expect(arc.seat).toBeGreaterThan(POCKET.seatShare * T + 5);
      expect(arc.depth).toBeCloseTo(T / 2 - arc.seat * arc.sin + (POCKET.bore / 2) * arc.cos, 9);
      // Deeper than the 15 degree slot: the screw has hardly climbed at the seat.
      expect(arc.depth).toBeGreaterThan(slotShape(T, len('1/8"').mm).depth + 1.5);
      expect(T - arc.depth).toBeGreaterThanOrEqual(POCKET.minFloor);
      // The seat is square to the screw: its foot is that much further in than its top.
      expect(arcSeatAt(arc, -arc.depth)).toBeCloseTo(arc.foot, 9);
      expect(arc.foot - arcSeatAt(arc, 0)).toBeCloseTo(arc.depth * Math.tan((angle * Math.PI) / 180), 9);
      // Level at the foot for the bit's width, then the arc: it leaves at the screw's own slope and meets the face at the end.
      expect(arcFloorAt(arc, arc.foot + QUARTER / 2)).toBe(-arc.depth);
      expect(arcFloorAt(arc, arc.arcFrom)).toBeCloseTo(-arc.depth, 9);
      expect(arcFloorAt(arc, arc.end)).toBe(0);
      expect(arcFloorAt(arc, arc.end - 1e-6)).toBeCloseTo(0, 3);
      const slope = (arcFloorAt(arc, arc.arcFrom + 0.01) - arcFloorAt(arc, arc.arcFrom)) / 0.01;
      expect(slope).toBeCloseTo(Math.tan((angle * Math.PI) / 180), 2);
      // It only rises, steeper and steeper.
      let was = -Infinity;
      for (let u = arc.arcFrom; u < arc.end - 1; u += 1) {
        const rise = arcFloorAt(arc, u + 1) - arcFloorAt(arc, u);
        expect(rise).toBeGreaterThan(was);
        was = rise;
      }
      // About 2" long in 3/4" stock, where a ramp at the screw's angle would run on past 100 mm.
      expect(arc.end - arc.foot).toBeCloseTo(LOW_POCKET.lengthShare * T, 6);
      expect(arc.depth / Math.tan((angle * Math.PI) / 180)).toBeGreaterThan(100);
      // So the driver comes in steeper than the screw lies.
      expect(arc.driverOff).toBeGreaterThan(5);
      expect(arc.driverOff).toBeLessThan(15);
    });
  }

  it('takes 1 1/2" screws in 3/4" stock and 1 1/4" in 1/2", each stopping 1/8" short of the far face of stock as thick', () => {
    expect(lowPocketScrew(19.05)).toBeCloseTo(len('1 1/2"').mm, 9);
    expect(lowPocketScrew(len('23/32"').mm)).toBeCloseTo(len('1 1/2"').mm, 9);
    expect(lowPocketScrew(12.7)).toBeCloseTo(len('1 1/4"').mm, 9);
    expect(lowPocketScrew(25)).toBeUndefined();
    for (const [stock, screw] of [[19.05, 38.1], [12.7, 31.75]] as const) expect(stock - (screw - LOW_POCKET.seat)).toBeCloseTo(len('1/8"').mm, 9);
  });

  it('is for a bit no wider than the bore, in stock thick enough to leave a floor', () => {
    expect(arcShape(T, POCKET.bore, 3).fits).toBe(true);
    expect(arcShape(T, POCKET.bore + 0.5, 3).fits).toBe(false);
    // 1/2" stock takes it, with about 2 mm left under it; 3/8" stock does not.
    expect(arcShape(12.3, QUARTER, 3).fits).toBe(true);
    expect(arcShape(9.5, QUARTER, 3).fits).toBe(false);
  });

  it('is one pocket for every stock: made for 3/4", and cut 1/8" less deep in 1/2" stock, as a machine does with a shim', () => {
    for (const angle of LOW_POCKET.angles) {
      const [full, half] = [arcShape(19.05, QUARTER, angle), arcShape(12.7, QUARTER, angle)];
      expect(full.depth - half.depth).toBeCloseTo(len('1/8"').mm, 9);
      // The seat, its foot and the arc are the same; the screw still leaves the edge at mid-thickness.
      expect(half.seat).toBeCloseTo(full.seat, 9);
      expect(half.foot).toBeCloseTo(full.foot, 9);
      expect(half.radius).toBeCloseTo(full.radius, 9);
      for (const u of [half.foot, half.arcFrom + 5, half.arcFrom + 20]) expect(arcFloorAt(half, u)).toBeCloseTo(arcFloorAt(full, u) + len('1/8"').mm, 9);
      // The arc meets the face sooner, and about 2 mm is left under the pocket.
      expect(half.end).toBeLessThan(full.end - 3);
      expect(arcFloorAt(half, half.end - 1e-6)).toBeCloseTo(0, 3);
      expect(12.7 - half.depth).toBeGreaterThan(1.5);
      expect(12.7 - half.depth).toBeLessThan(4.5);
    }
  });
});

describe('the toolpath of a low-angle pocket', () => {
  const cut = (angle: number, bit = QUARTER) => {
    const arc = arcShape(T, bit, angle);
    const made = new Path(5);
    pocketArc(made, { x: 100, y: 0 }, { x: 0, y: 1 }, arc, feeds);
    const at: { u: number; y: number; z: number }[] = [];
    let from = { x: 0, y: 0, z: 5 };
    for (const step of made.steps) {
      if (step.kind !== 'rapid' && step.kind !== 'cut') continue;
      const to = { x: step.x ?? from.x, y: step.y ?? from.y, z: step.z ?? from.z };
      if (step.kind === 'cut') for (let i = 0; i <= 10; i++) at.push({ u: from.y + ((to.y - from.y) * i) / 10, y: 100 - (from.x + ((to.x - from.x) * i) / 10), z: from.z + ((to.z - from.z) * i) / 10 });
      from = to;
    }
    return { arc, at };
  };

  for (const angle of LOW_POCKET.angles) {
    for (const bit of [QUARTER, len('1/8"').mm]) {
      it(`${angle} degrees, a ${bit.toFixed(2)} mm bit: stays inside the pocket, on its arc, and against its seat`, () => {
        const { arc, at } = cut(angle, bit);
        const below = at.filter((c) => c.z < -1e-6);
        expect(Math.min(...below.map((c) => c.z))).toBeCloseTo(-arc.depth, 6);
        for (const c of below) {
          // Between the walls, never past the seat at the bit's own depth.
          expect(Math.abs(c.y)).toBeLessThanOrEqual(arc.reach + 1e-6);
          expect(c.u - arc.r).toBeGreaterThanOrEqual(arcSeatAt(arc, c.z) - 1e-6);
          // The bit's far edge is never under the floor (a straight move between two points of the arc is a chord over it).
          expect(c.z).toBeGreaterThanOrEqual(arcFloorAt(arc, c.u + arc.r) - 1e-6);
          // And nothing is cut past the pocket's end.
          expect(c.u + arc.r).toBeLessThanOrEqual(arc.end + 1e-6);
        }
        // The floor's passes are on the arc all the way down it, within the sag of a chord a millimetre long.
        const onArc = below.filter((c) => c.u + arc.r > arc.arcFrom + 1 && Math.abs(c.z - arcFloorAt(arc, c.u + arc.r)) < 0.02);
        expect(new Set(onArc.map((c) => c.z.toFixed(1))).size).toBeGreaterThan(40);
        // The seat: the bit's side reaches it at every depth, in steps that stand under 0.1 mm proud of its slope.
        const onSeat = below.filter((c) => Math.abs(c.u - arc.r - arcSeatAt(arc, c.z)) < 1e-6);
        const depths = [...new Set(onSeat.map((c) => c.z.toFixed(4)))].map(Number).sort((a, b) => b - a);
        expect(depths.at(-1)).toBeCloseTo(-arc.depth, 4);
        for (let i = 1; i < depths.length; i++) expect((depths[i - 1]! - depths[i]!) * (arc.sin / arc.cos)).toBeLessThanOrEqual(POCKET.ridge + 1e-6);
      });
    }
  }
});

describe('the scrap test with low-angle pockets', () => {
  const shop = createStarterShop();

  it('is cut with the widest flat end mill the pocket takes', () => {
    expect(lowPocketBit(shop)?.id).toBe('endmill-1-4');
    expect(lowPocketBit(shop, PLYWOOD_3_4_ID)?.id).toBe('endmill-1-4');
  });

  it('two at each angle side by side: one bit, a file that parses and follows the post rules', async () => {
    const test = buildPocketTest(shop, PLYWOOD_3_4_ID, LOW_KINDS);
    expect(test.pockets.map((p) => p.angleDeg)).toEqual([3, 3, 6, 6]);
    expect(test.tools.map((t) => t.toolId)).toEqual(['endmill-1-4']);
    expect(test.depth).toBeCloseTo(arcShape(test.thickness, QUARTER, 3).depth, 9);
    expect(test.stock).toEqual({ x: 70 + 3 * POCKET_TEST.spacing + POCKET_TEST.margin, y: 100 });
    expect(test.text).toContain('Pocket-hole test: 4 low-angle pockets');
    expect(test.text).not.toMatch(/^M[345]\b/m);
    expect((test.text.match(/^G38\.2 Z-80 F180 P0\.5/gm) ?? []).length).toBe(1);
    const moves = [...test.text.matchAll(/^G1 .*$/gm)].map((m) => m[0]);
    const word = (line: string, w: string) => Number(new RegExp(`${w}(-?[\\d.]+)`).exec(line)?.[1] ?? NaN);
    const zs = moves.map((l) => word(l, 'Z')).filter((v) => !Number.isNaN(v));
    const ys = moves.map((l) => word(l, 'Y')).filter((v) => !Number.isNaN(v));
    expect(Math.min(...zs)).toBeCloseTo(-test.depth, 2);
    expect(Math.min(...zs)).toBeGreaterThan(-test.thickness);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(POCKET_TEST.stock.y);
    for (const line of test.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(test.text);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
  });

  it('says so for stock too thin, and for a bit that does not reach', () => {
    const thin = shop.materials.find((m) => m.measuredThickness.mm < 10 && shop.tools.find((t) => t.id === 'endmill-1-4')!.settings[m.id]);
    if (thin) expect(() => buildPocketTest(shop, thin.id, LOW_KINDS)).toThrow(/too thin for a low-angle pocket/);
    const short = createStarterShop();
    const bit = short.tools.find((t) => t.id === 'endmill-1-4')!;
    if (bit.shape.kind === 'endMill') bit.shape.cuttingLength = len('10mm');
    expect(() => buildPocketTest(short, PLYWOOD_3_4_ID, LOW_KINDS)).toThrow(/cuts 10\.0 mm deep and a low-angle pocket/);
  });

  it('is offered on the jigs page, with the guide for its angle', () => {
    const profile = createStarterShopProfile();
    const items = jigItems(profile);
    const test = items.find((i) => i.id === 'pocket-test')!;
    // The 1/4" end mill cuts low-angle pockets only; the 1/8" one either kind. Each row its angle and its seat.
    const bits = test.fields.find((f) => f.key === 'bit')!;
    expect(bits.choices!.map((c) => c.value)).toEqual(expect.arrayContaining(['endmill-1-4', 'endmill-1-8']));
    const angle = test.fields.find((f) => f.key === 'pockets')!.columns!.find((c) => c.key === 'angle')!;
    expect(angle.choicesFor!({ ...test.defaults, bit: 'endmill-1-4' }).map((c) => c.value)).toEqual(['3', '6']);
    expect(angle.choicesFor!({ ...test.defaults, bit: 'endmill-1-8' }).map((c) => c.value)).toEqual(['15', '3', '6']);
    const seats = test.fields.find((f) => f.key === 'pockets')!.columns!.find((c) => c.key === 'seat')!;
    expect(seats.choices.length).toBeGreaterThan(3);
    const values = { ...test.defaults, bit: 'endmill-1-4', pockets: JSON.stringify([{ angle: '3' }, { angle: '3' }]) };
    const files = test.gcode!(values, 1, profile.activeMachineId);
    expect(files[0]!.text).toContain('2 low-angle pockets');
    expect(test.notes!(values).join(' ')).toMatch(/Low angle, 3°: a slot .* The driver comes in about \d+° steeper/);
    expect(test.notes!(values).join(' ')).toContain('A low-angle pocket takes its own guide');
    expect(test.notes!(values).join(' ')).toContain('In this stock it takes 1 1/2" screws');
    const guide = items.find((i) => i.id === 'pocket-guide')!;
    expect(guide.fields.find((f) => f.key === 'angle')!.choices!.map((c) => c.value)).toEqual(['15', '3', '6']);
    expect(guide.inUse!({ ...guide.defaults, angle: '6' }).low).toEqual({ angleDeg: 6, bit: QUARTER });
    expect(guide.inUse!(guide.defaults).low).toBeUndefined();
  });
});

describe('the drill guide for a low-angle pocket', () => {
  const plain: PocketGuide = { thickness: 18.65, drill: 4 };
  for (const angle of LOW_POCKET.angles) {
    it(`${angle} degrees: the same guide with a flatter bore, a short key and a plate to the pocket's end`, async () => {
      const guide = { ...plain, low: { angleDeg: angle, bit: QUARTER } };
      expect(pocketGuideProblems(guide)).toEqual([]);
      expect(guideAngle(guide)).toBe(angle);
      expect(guideAngle(plain)).toBe(POCKET.angleDeg);
      const arc = arcShape(guide.thickness, QUARTER, angle);
      // The plate reaches past the pocket's end, not to where a bore this flat would come up through the face.
      expect(guidePlateIn(guide.thickness, guide.low)).toBe(Math.ceil(arc.end) + GUIDE.plateBeyondKey);
      expect(guidePlateIn(guide.thickness, guide.low)).toBeLessThan(90);
      // The key ends where the floor's arc comes up to the screw's axis, past its nose.
      const end = lowKeyEnd(guide.thickness, guide.low);
      expect(end).toBeGreaterThan(guideKeyNose(guide.thickness) + 5);
      expect(end).toBeLessThan(arc.end);
      const axis = -guide.thickness / 2 + end * Math.tan((angle * Math.PI) / 180);
      expect(arcFloorAt(arc, end)).toBeLessThan(axis);
      const mesh = await buildPocketGuide(guide);
      expect(mesh.volume).toBeGreaterThan(3000);
      // In use: the guide on a board with the arced pocket and the pilot cut out of it; nothing of the key in the wood.
      const { guide: placed, board } = await buildPocketGuideInUse(guide);
      expect(placed.volume).toBeCloseTo(mesh.volume, 0);
      // (The piece of board shown runs on past the pocket's end.)
      const solid = Math.max(75, arc.end + 10) * 52 * guide.thickness;
      expect(board.volume).toBeLessThan(solid - 2000);
      expect(board.volume).toBeGreaterThan(solid - 6000);
    });
  }

  it('says so for stock too thin', () => {
    expect(pocketGuideProblems({ thickness: 12.3, drill: 4, low: { angleDeg: 3, bit: QUARTER } })).toEqual([]);
    expect(pocketGuideProblems({ thickness: 9, drill: 4, low: { angleDeg: 3, bit: QUARTER } })).toEqual(['That stock is too thin for a low-angle pocket hole.']);
  });
});

describe('a job whose pocket holes are low-angle ones', () => {
  const build = (method: 'lowAngle3' | 'lowAngle6', change?: (project: ReturnType<typeof createBaseCabinetProject>) => void) => {
    const shop = createStarterShop();
    const project = createBaseCabinetProject('frameless');
    project.plan.pocketHoles = method;
    change?.(project);
    const job = buildJob(project, shop);
    return { shop, project, job };
  };

  it('cuts them with the flat end mill that cuts the parts out, and prints the guide for the angle', async () => {
    const { job, project, shop } = build('lowAngle3');
    const op = job.plan.operations.find((o) => o.kind === 'pocketHole')!;
    expect(op.clearToolId).toBe('endmill-1-4');
    expect(job.plan.operations.find((o) => o.key === 'case:cutout')!.clearToolId).toBe('endmill-1-4');
    expect(job.plan.warnings.filter((w) => w.code === 'unsupported')).toEqual([]);
    const pockets = job.plan.pocketHoles!;
    expect(pockets.method).toBe('lowAngle3');
    expect(pockets.cncAssisted).toBe(pockets.count);
    expect(pockets.prep!.guides.map((g) => g.params)).toEqual([{ thickness: 18.65, drill: 4, angleDeg: 3, bit: QUARTER, seat: LOW_POCKET.seat }]);
    expect(pockets.prep!.drilling[0]!.bitOutOfChuck).toBeCloseTo(POCKET.guideOutside + LOW_POCKET.seat + POCKET.through, 9);
    const objects = await buildPocketGuideObjects(pockets.prep!.guides);
    expect(objects.map((o) => o.name)).toEqual(['Pocket-hole guide, 3/4" stock, 3°']);
    // The files: the pockets are in them, to the low-angle pocket's depth, and they parse.
    const depth = arcShape(len('23/32"').mm, QUARTER, 3).depth;
    expect(op.depth).toBeCloseTo(depth, 6);
    const withPockets = job.files.filter((f) => f.text.includes('Case: pocket holes'));
    expect(withPockets.length).toBeGreaterThan(0);
    for (const file of job.files) {
      expect(file.text).not.toMatch(/^M[345]\b/m);
      for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
    // Its screws: 1 1/2" in 3/4" stock, which stop inside the sides they go into.
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    const screws = lists.hardware.filter((h) => h.group === 'Pocket screws');
    expect(screws.map((h) => h.item)).toEqual(['1-1/2" pocket screws, coarse thread']);
    expect(screws[0]!.note).toContain('In a low-angle pocket');
    expect(lists.kreg).toEqual([]);
    const list = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ');
    expect(list).toContain('Print the pocket-hole guide');
    expect(list).toMatch(/standing 47\.2 mm out of the chuck/);
  });

  it('6 degrees, and the seat set as on a machine: the guide, the bit and the screws follow', () => {
    const { job, project, shop } = build('lowAngle6', (p) => (p.plan.pocketSeat = len('1 1/8"')));
    const pockets = job.plan.pocketHoles!;
    expect(pockets.prep!.guides[0]!.params).toMatchObject({ angleDeg: 6, seat: len('1 1/8"').mm });
    expect(pockets.prep!.drilling[0]!.bitOutOfChuck).toBeCloseTo(POCKET.guideOutside + len('1 1/8"').mm + POCKET.through, 9);
    expect(job.plan.operations.find((o) => o.kind === 'pocketHole')!.depth).toBeCloseTo(arcShape(len('23/32"').mm, QUARTER, 6, len('1 1/8"').mm).depth, 6);
    expect(buildLists(job, project, shop, (mm) => `${mm}`).hardware.filter((h) => h.group === 'Pocket screws').map((h) => h.item)).toEqual(['1-1/2" pocket screws, coarse thread']);
    // Out of range, the nearest seat a pocket can have is used.
    expect(build('lowAngle3', (p) => (p.plan.pocketSeat = len('3"'))).job.plan.pocketHoles!.prep!.guides[0]!.params.seat).toBe(LOW_POCKET.seatRange.max);
  });

  it('a seat nearer the edge takes a shorter screw where the longer one would come through', () => {
    const { job, project, shop } = build('lowAngle3', (p) => (p.plan.pocketSeat = len('1/2"')));
    const screws = buildLists(job, project, shop, (mm) => `${mm}`).hardware.filter((h) => h.group === 'Pocket screws');
    // From 1/2" in, a 1 1/4" screw would still come through a 23/32" side; a 1" one stops inside it.
    expect(screws.map((h) => h.item)).toEqual(['1" pocket screws, coarse thread']);
    expect(screws[0]!.note).toContain('Shorter than the chart');
  });

  it('whatever the CNC cuts, a part cut out on a saw gets its pocket holes by Kreg jig, with the screws of the Kreg chart', () => {
    for (const method of ['cncAssisted', 'lowAngle3', 'lowAngle6'] as const) {
      const shop = createStarterShop();
      const project = createBaseCabinetProject('frameless');
      project.plan.pocketHoles = method;
      const whole = buildJob(project, shop);
      const all = whole.plan.pocketHoles!.count;
      expect(whole.plan.pocketHoles!.cncAssisted, method).toBe(all);
      // The bottom goes to the table saw: its eight holes are the Kreg jig's again.
      project.plan.parts = { 'cabinet-1/bottom': { cutOut: 'tableSaw' } };
      const job = buildJob(project, shop);
      const bottom = job.plan.parts.find((p) => p.partId === 'cabinet-1/bottom')!;
      expect(bottom.cutOut).toBe('tableSaw');
      expect(bottom.steps.some((s) => s.by === 'kregJig' && /pocket holes/.test(s.label)), method).toBe(true);
      expect(bottom.steps.some((s) => /from the edge with the guide/.test(s.label)), method).toBe(false);
      expect(job.plan.pocketHoles!.count).toBe(all);
      expect(job.plan.pocketHoles!.cncAssisted, method).toBe(all - 8);
      const lists = buildLists(job, project, shop, (mm) => `${mm}`);
      // The Kreg list has the bottom's rows and no other part's.
      expect(lists.kreg.length, method).toBeGreaterThan(0);
      expect(lists.kreg.every((row) => /Bottom/.test(row.part)), method).toBe(true);
      // Its screws are the Kreg chart's 1 1/4"; the CNC's low-angle pockets keep their 1 1/2".
      const screws = lists.hardware.filter((h) => h.group === 'Pocket screws').map((h) => h.item);
      expect(screws, method).toContain('1-1/4" pocket screws, coarse thread');
      if (method !== 'cncAssisted') expect(screws, method).toContain('1-1/2" pocket screws, coarse thread');
      // And no file cuts a pocket in it.
      const blank = job.plan.blanks.find((b) => b.partIds.includes('cabinet-1/bottom'));
      expect(blank, method).toBeUndefined();
    }
  });
});

describe('a part with no room for a low-angle pocket', () => {
  // A low toe kick: its board is about 2" high, and a low-angle pocket runs nearly 3" in from the edge.
  const build = (method: 'lowAngle3' | 'cncAssisted' | 'kregJig', onCnc = true) => {
    const shop = createStarterShop();
    const project = createBaseCabinetProject('frameless');
    const settings = (project.context as CasesContext).settings;
    settings.toeKick.height = len('2-3/4"');
    settings.toeKick.joint = 'pocketScrews';
    project.plan.pocketHoles = method;
    if (onCnc) project.plan.parts = { 'cabinet-1/toe-kick': { cutOut: 'cnc' } };
    const job = buildJob(project, shop);
    return { shop, project, job, kick: job.cabinetParts.find((p) => p.id === 'cabinet-1/toe-kick')! };
  };
  const holesOf = (part: Part) => part.features.filter((f) => f.kind === 'pocketHole').length;

  it('says which parts have room: thick enough, and long enough from the edge', () => {
    const { kick, job } = build('lowAngle3');
    const bottom = job.cabinetParts.find((p) => p.id === 'cabinet-1/bottom')!;
    expect(holesOf(kick)).toBeGreaterThan(0);
    expect(kick.size.height).toBeLessThan(arcShape(kick.size.thickness, POCKET.bore, 3).end);
    expect(lowPocketsFit(kick, 3, LOW_POCKET.seat)).toBe(false);
    expect(lowPocketsFit(bottom, 3, LOW_POCKET.seat)).toBe(true);
    expect(lowPocketsFit({ ...bottom, size: { ...bottom.size, thickness: 9 } }, 3, LOW_POCKET.seat)).toBe(false);
    // The other methods have no such limit here.
    expect(cncPocketsFit(kick, { pocketHoles: 'cncAssisted' })).toBe(true);
    expect(cncPocketsFit(kick, { pocketHoles: 'lowAngle3' })).toBe(false);
    expect(cncPocketsFit(kick, {})).toBe(false);
  });

  it('its pocket holes go to the Kreg jig: in its steps, the counts, the Kreg list, the screws, the file and the 3D view', () => {
    const { job, project, shop, kick } = build('lowAngle3');
    const n = holesOf(kick);
    const plan = job.plan.parts.find((p) => p.partId === kick.id)!;
    expect(plan.cutOut).toBe('cnc');
    expect(plan.steps.filter((s) => /pocket hole/.test(s.label))).toEqual([{ label: `${n} pocket holes (too thin or too short for a low-angle pocket)`, by: 'kregJig' }]);
    expect(plan.steps.some((s) => /from the edge with the guide/.test(s.label))).toBe(false);
    // Counted as the Kreg jig's, not the CNC's; the pilots drilled through the guide are the others'.
    const pockets = job.plan.pocketHoles!;
    expect(pockets.cncAssisted).toBe(pockets.count - n);
    expect(pockets.prep!.drilling.reduce((sum, d) => sum + d.count, 0)).toBe(pockets.count - n);
    // The pocket-hole operation leaves it out, so nothing is skipped with a warning.
    const op = job.plan.operations.find((o) => o.kind === 'pocketHole')!;
    expect(op.source.kind === 'features' && op.source.refs.some((r) => r.partId === kick.id)).toBe(false);
    expect(op.source.kind === 'features' && op.source.refs.length).toBe(pockets.count - n);
    expect(job.plan.warnings.filter((w) => /low-angle pocket/.test(w.message))).toEqual([]);
    // The Kreg list has its rows and no other part's; its screws are the Kreg chart's.
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    expect(lists.kreg.length).toBeGreaterThan(0);
    expect(lists.kreg.every((row) => /Toe kick/.test(row.part))).toBe(true);
    expect(lists.kreg.reduce((sum, row) => sum + row.at.length, 0)).toBe(n);
    const screws = lists.hardware.filter((h) => h.group === 'Pocket screws').map((h) => h.item);
    expect(screws).toContain('1-1/4" pocket screws, coarse thread');
    expect(screws).toContain('1-1/2" pocket screws, coarse thread');
    // Drawn as the Kreg jig bores it.
    const looked = withPocketLooks(job.cabinetParts, project.plan, job.plan.parts);
    expect(looked.find((p) => p.id === kick.id)!.pocketLook).toBeUndefined();
    expect(looked.find((p) => p.id === 'cabinet-1/bottom')!.pocketLook).toMatchObject({ kind: 'low' });
  });

  it('left to the planner it is a plain rectangle with nothing for the CNC to do, and goes to the saw', () => {
    const { job, kick } = build('lowAngle3', false);
    const plan = job.plan.parts.find((p) => p.partId === kick.id)!;
    expect(plan.suggested).not.toBe('cnc');
    expect(plan.steps.filter((s) => /pocket hole/.test(s.label))).toEqual([{ label: `${holesOf(kick)} pocket holes`, by: 'kregJig' }]);
    expect(job.plan.pocketHoles!.cncAssisted).toBe(job.plan.pocketHoles!.count - holesOf(kick));
  });

  it('a 15 degree pocket fits it: the CNC cuts them all', () => {
    const { job, kick } = build('cncAssisted');
    expect(job.plan.pocketHoles!.cncAssisted).toBe(job.plan.pocketHoles!.count);
    expect(job.plan.parts.find((p) => p.partId === kick.id)!.steps.some((s) => s.by === 'kregJig')).toBe(false);
  });
});

describe('how a pocket hole is drawn in the 3D view', () => {
  const shop = createStarterShop();
  const project = createBaseCabinetProject('frameless');
  const parts = [...buildJob(project, shop).cabinetParts];
  const bottom = parts.find((p) => p.id === 'cabinet-1/bottom')!;
  const volume = async (part: typeof bottom) => (await buildPartMeshes([part]))[0]!.mesh.volume;

  it('each part has the look of how its pockets are made: the job’s kind on the CNC, the Kreg jig’s on a saw', () => {
    expect(withPocketLooks(parts, {})).toBe(parts);
    const cnc = withPocketLooks(parts, { pocketHoles: 'cncAssisted' });
    expect(cnc.find((p) => p.id === bottom.id)!.pocketLook).toEqual({ kind: 'cnc' });
    // Only parts with pocket holes are touched.
    expect(cnc.filter((p) => p.pocketLook).every((p) => p.features.some((f) => f.kind === 'pocketHole'))).toBe(true);
    expect(cnc.find((p) => p.id === 'cabinet-1/side-left')!.pocketLook).toBeUndefined();
    const low = withPocketLooks(parts, { pocketHoles: 'lowAngle6', pocketSeat: len('1"') });
    expect(low.find((p) => p.id === bottom.id)!.pocketLook).toEqual({ kind: 'low', angleDeg: 6, seat: len('1"').mm });
    // Cut out on a saw, a part keeps the Kreg jig's look whatever the job's kind is.
    for (const method of ['cncAssisted', 'lowAngle3', 'lowAngle6'] as const) {
      const sawn = withPocketLooks(parts, { pocketHoles: method }, [{ partId: bottom.id, cutOut: 'tableSaw' }]);
      expect(sawn.find((p) => p.id === bottom.id)!.pocketLook, method).toBeUndefined();
      expect(sawn.find((p) => p.id === 'cabinet-1/stretcher-back')?.pocketLook ?? sawn.find((p) => p.pocketLook)!.pocketLook, method).toBeDefined();
    }
  });

  it('the three are different solids: the Kreg bore, the CNC’s slot over it, and the low-angle pocket’s deep arc', async () => {
    const holes = bottom.features.filter((f) => f.kind === 'pocketHole').length;
    const solid = bottom.size.width * bottom.size.height * bottom.size.thickness;
    const kreg = await volume(bottom);
    const cnc = await volume({ ...bottom, pocketLook: { kind: 'cnc' } });
    const low3 = await volume({ ...bottom, pocketLook: { kind: 'low', angleDeg: 3, seat: LOW_POCKET.seat } });
    const low6 = await volume({ ...bottom, pocketLook: { kind: 'low', angleDeg: 6, seat: LOW_POCKET.seat } });
    // Every look takes something out of the part at each hole.
    for (const v of [kreg, cnc, low3, low6]) expect(solid - v).toBeGreaterThan(holes * 300);
    // The CNC's 15 degree pocket takes the bore and what is over it.
    expect(kreg - cnc).toBeGreaterThan(holes * 100);
    // A low-angle pocket is a slot about 13 mm deep at the seat and 55 mm long: more than either.
    const arc = arcShape(bottom.size.thickness, POCKET.bore, 3);
    expect(cnc - low3).toBeGreaterThan(holes * 500);
    expect((solid - low3) / holes).toBeLessThan(POCKET.bore * arc.depth * (arc.end - arc.foot + 5));
    expect((solid - low3) / holes).toBeGreaterThan(POCKET.bore * arc.depth * (arc.end - arc.foot) * 0.3);
    expect(low3).not.toBeCloseTo(low6, 0);
  });

  it('a pocket with a ledge for a cover is drawn with it: the job’s ledge rows, cut round those pockets only', async () => {
    const holes = bottom.features.filter((f) => f.kind === 'pocketHole');
    const one = holes[0]!.id;
    const ledges = [{ partId: bottom.id, featureId: one, r: len('1/4"').mm / 2 }];
    for (const look of [{ kind: 'cnc' as const }, { kind: 'low' as const, angleDeg: 3, seat: LOW_POCKET.seat }]) {
      const looked = withPocketLooks(parts, look.kind === 'cnc' ? { pocketHoles: 'cncAssisted' } : { pocketHoles: 'lowAngle3' }, undefined, ledges);
      const drawn = looked.find((p) => p.id === bottom.id)!;
      expect(drawn.pocketLook).toEqual({ ...look, ledges: { featureIds: [one], r: len('1/4"').mm / 2 } });
      // A part with no ledge keeps the plain look.
      expect(looked.filter((p) => p.pocketLook?.ledges).map((p) => p.id)).toEqual([bottom.id]);
      // The ledge takes out a band round the opening, 2 mm deep: tens of mm³, not hundreds.
      const plain = await volume({ ...bottom, pocketLook: look });
      const taken = plain - (await volume(drawn));
      expect(taken, look.kind).toBeGreaterThan(30);
      expect(taken, look.kind).toBeLessThan(POCKET.ledge.depth * 80 * (POCKET.bore + 2 * POCKET.ledge.margin));
    }
  });
});
