// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { pocketChannel, pocketLedge, pocketSlot } from '@/cam/cuts';
import { type Feeds, Path, runTime } from '@/cam/path';
import { arcFloorAt, arcLedge, arcSeatAt, arcShape, lowCoverFits, slotLedge, GUIDE_STOCK, KEY_RADIUS, POCKET, POCKET_SLEEVE, SLEEVE_LIMITS, bitOutOfChuck, fenceFlangeAt, jigSleeve, sleeveGoesIn, sleeveParams, sleeveProblems, sleeveRoom, sleeveWords, floorAt, guideStock, guideThickness, onAxis, onLine, pocketAxis, pocketShape, slotFloorAt, slotOpening, slotSeatAt, slotShape, slotSlopeEnd } from '@/geometry/pocketHole';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildChecklist } from '@/job/checklist';
import { cabinetsOf, designsOf, projectShows } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { POCKET_KINDS, POCKET_TEST, buildPocketTest, pocketTestBits } from '@/job/pocketTest';
import { COVER, buildPocketCover, coverSize, pocketCoverProblems } from '@/jigs/pocketCover';
import { GUIDE, IN_USE, buildPocketGuide, buildPocketGuide3mf, buildPocketGuideInUse, buildPocketGuideObjects, guideBoss, guideBitOut, guideSleeves, guideInUseAt, guideKeyNose, guidePlateIn, pocketGuideProblems } from '@/jigs/pocketGuide';
import { PLYWOOD_3_4_ID } from '@/libraries';
import type { CabinetDesign, ConstructionStyle, DrawerDesign, Feature, Part, PocketCoverWhere, PocketSleeve, Project, Shop } from '@/model';
import { pocketCovered, pocketCoversOf } from '@/plan/parts';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

const BALL = len('1/8"').mm;
/** The starter library's 1/8" ball nose in plywood. */
const feeds: Feeds = { feed: 1200, plunge: 300, depthPerPass: 1.6, stepover: 1.5, finish: 0 };

const cabinetOf = (project: Project) => cabinetsOf(project)[0]!;

function jobFor(style: ConstructionStyle, change?: (cabinet: CabinetDesign, project: Project, shop: Shop) => void) {
  const shop = lowRiderJobShop();
  const project = createBaseCabinetProject(style);
  project.plan.pocketHoles = 'cncAssisted';
  change?.(cabinetOf(project), project, shop);
  const job = buildJob(project, shop);
  const parts = new Map([...job.parts, ...job.cabinetParts].map((p) => [p.id, p]));
  const op = (key: string) => job.plan.operations.find((o) => o.key === key);
  const blankOf = (partId: string) => job.plan.blanks.find((b) => b.partIds.includes(partId))!;
  const fileOf = (blankId: string, setupIndex: number) => job.files[job.programs.findIndex((p) => p.blank.id === blankId && p.setup.index === setupIndex)]!;
  return { job, parts, op, blankOf, fileOf, shop, project };
}

interface Move {
  x: number;
  y: number;
  z: number;
  cut: boolean;
}

/** Every move of one operation of a file: from its status line to the next one. */
function section(gcode: string, label: string): Move[] {
  const lines = gcode.split('\n');
  const from = lines.findIndex((l) => /\(MSG, \d+\/\d+ /.test(l) && l.includes(label));
  expect(from, label).toBeGreaterThan(-1);
  const next = lines.findIndex((l, i) => i > from && (/\(MSG, \d+\/\d+ /.test(l) || /^\$HZ/.test(l)));
  const out: Move[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  lines.forEach((line, i) => {
    if (!/^G[0123] /.test(line)) return;
    const word = (w: string) => new RegExp(`${w}(-?[\\d.]+)`).exec(line.replace(/\(.*\)/, ''));
    const mx = word('X');
    const my = word('Y');
    const mz = word('Z');
    if (mx) x = Number(mx[1]);
    if (my) y = Number(my[1]);
    if (mz) z = Number(mz[1]);
    if (i > from && (next < 0 || i < next)) out.push({ x, y, z, cut: !line.startsWith('G0 ') });
  });
  return out;
}

type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
const pocketHoles = (part: Part) => part.features.filter((f): f is PocketHole => f.kind === 'pocketHole');

/** A point of a part on the machine, as the part lies in a setup. */
function onMachine(part: Part, placement: { origin: { x: number; y: number }; mirrored: boolean; turned: boolean }, p: { x: number; y: number }) {
  return placement.turned
    ? { x: placement.origin.x + (placement.mirrored ? p.y : part.size.height - p.y), y: placement.origin.y + p.x }
    : { x: placement.origin.x + (placement.mirrored ? part.size.width - p.x : p.x), y: placement.origin.y + p.y };
}

/** Where the floor of a part's pocket hole is deepest, on the machine. */
function deepest(part: Part, placement: Parameters<typeof onMachine>[1], hole: PocketHole) {
  const shape = pocketShape(part.size.thickness, BALL);
  const { exit, inward } = pocketAxis(part.size, hole.edge, hole.at);
  const u = onLine(shape, shape.end, 0).u;
  return { ...onMachine(part, placement, { x: exit.x + inward.x * u, y: exit.y + inward.y * u }), z: -shape.depth };
}

describe('the shape of a pocket', () => {
  it('follows the Kreg numbers in 3/4" stock: a 15 degree axis out through the middle of the edge', () => {
    const shape = pocketShape(19.05, BALL);
    expect(shape.fits).toBe(true);
    expect(shape.seat).toBeCloseTo(14.29, 2);
    // About 3/8" deep at the seat, and a little over 2" long at the face.
    expect(shape.depth).toBeCloseTo(10.07, 2);
    expect(shape.length).toBeCloseTo(53.74, 1);
    // The axis leaves the edge at mid-thickness and climbs toward the face.
    expect(onAxis(shape, 0)).toEqual({ u: 0, y: 0, z: -19.05 / 2 });
    expect(onAxis(shape, 10).z - onAxis(shape, 0).z).toBeCloseTo(10 * Math.sin((15 * Math.PI) / 180), 6);
    // The ball's centre stays its own radius inside the 3/8" bore.
    expect(shape.orbit + shape.r).toBeCloseTo(POCKET.bore / 2, 9);
  });

  it('refuses stock too thin to leave a floor under the pocket', () => {
    expect(pocketShape(len('15/32"').mm, BALL).fits).toBe(true);
    expect(pocketShape(9, BALL).fits).toBe(false);
  });

  it('sets the pilot by how far the bit stands out of the chuck', () => {
    const shape = pocketShape(19.05, BALL);
    // Through the guide outside the edge, in to the seat, and a little way out into the pocket: a regular bit has it.
    expect(bitOutOfChuck(shape)).toBeCloseTo(POCKET.guideOutside + shape.seat + POCKET.through, 9);
    expect(bitOutOfChuck(shape)).toBeLessThan(50);
    // The key is a running fit between the trough's walls.
    expect(KEY_RADIUS * 2).toBeCloseTo(POCKET.bore - POCKET.keyFit, 9);
  });
});

describe('the toolpath of one pocket', () => {
  const shape = pocketShape(19.05, BALL);
  const path = new Path(5);
  // The screw leaves through the edge at y = 0; the pocket runs back along +Y.
  pocketChannel(path, { x: 100, y: 0 }, { x: 0, y: 1 }, shape, feeds);

  /** The ball's centre in the pocket's own frame, at every cutting move and along each one. */
  const centres: { u: number; y: number; z: number }[] = [];
  let at = { x: 0, y: 0, z: 5 };
  for (const step of path.steps) {
    if (step.kind !== 'rapid' && step.kind !== 'cut') continue;
    const to = { x: step.x ?? at.x, y: step.y ?? at.y, z: step.z ?? at.z };
    if (step.kind === 'cut') {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        centres.push({ u: at.y + (to.y - at.y) * t, y: 100 - (at.x + (to.x - at.x) * t), z: at.z + (to.z - at.z) * t + shape.r });
      }
    }
    at = to;
  }
  const along = (c: { u: number; z: number }) => c.u * shape.cos + (c.z + 19.05 / 2) * shape.sin;

  it('keeps the ball inside the bore: on the round floor or above it, between the walls', () => {
    expect(centres.length).toBeGreaterThan(500);
    for (const c of centres) {
      expect(Math.abs(c.y)).toBeLessThanOrEqual(shape.orbit + 1e-6);
      expect(c.z).toBeGreaterThanOrEqual(floorAt(shape, c.u, c.y) - 1e-6);
    }
  });

  it('stops at the seat: nothing is cut past it, at any height', () => {
    expect(Math.min(...centres.map(along))).toBeCloseTo(shape.end, 6);
    expect(centres.filter((c) => along(c) < shape.end - 1e-6)).toEqual([]);
  });

  it('finishes the floor along lines round the lower half of the bore, to its full depth', () => {
    expect(Math.min(...centres.map((c) => c.z - shape.r))).toBeCloseTo(-shape.depth, 6);
    // Eleven lines, close enough to leave ridges under 0.3 mm (the floor only clears the screw's head), each reaching the
    // seat end; the middle one is the bottom of the bore, and the outermost two cut the walls the guide's key stands between.
    const axis = onAxis(shape, shape.end);
    const onCircle = centres.filter((c) => Math.abs(along(c) - shape.end) < 1e-6 && Math.abs(Math.hypot(c.u - axis.u, c.y, c.z - axis.z) - shape.orbit) < 1e-6);
    const sides = new Set(onCircle.map((c) => c.y.toFixed(3).replace('-0.000', '0.000')));
    expect(sides.size).toBe(11);
    expect(POCKET.floorRidge).toBeGreaterThan(POCKET.ridge);
    expect(sides.has('0.000')).toBe(true);
    expect(sides.has(shape.orbit.toFixed(3)) && sides.has((-shape.orbit).toFixed(3))).toBe(true);
  });

  it('cuts the seat square to the screw over its whole height, leaning back toward the edge as it rises', () => {
    // The ball's centre against the seat, above the axis: up to the top of the bore, from wall to wall.
    const axis = onAxis(shape, shape.end);
    const onSeat = centres.filter((c) => Math.abs(along(c) - shape.end) < 1e-6 && c.z > axis.z + 1e-6);
    const up = (c: { u: number; z: number }) => (c.z - axis.z) * shape.cos - (c.u - axis.u) * shape.sin;
    expect(Math.max(...onSeat.map(up))).toBeCloseTo(POCKET.bore / 2, 6);
    expect(Math.max(...onSeat.map((c) => c.y))).toBeCloseTo(shape.orbit, 6);
    expect(Math.min(...onSeat.map((c) => c.y))).toBeCloseTo(-shape.orbit, 6);
    // Higher up the seat is nearer the edge: no wall stands straight up from the axis any more.
    const top = onSeat.reduce((a, b) => (b.z > a.z ? b : a));
    expect(top.u).toBeCloseTo(axis.u - (POCKET.bore / 2) * shape.sin, 6);
    // The passes up the seat are close enough to leave ridges under 0.1 mm.
    const heights = [...new Set(onSeat.map((c) => up(c).toFixed(3)))].map(Number).sort((a, b) => a - b);
    for (let i = 1; i < heights.length; i++) expect(heights[i]! - heights[i - 1]!).toBeLessThanOrEqual(Math.sqrt(8 * POCKET.ridge * shape.r) + 1e-6);
  });

  it('roughs in levels no deeper than the bit takes, leaving the floor for the finishing lines', () => {
    const cuts = path.steps.filter((s) => s.kind === 'cut');
    const firstFinish = cuts.findIndex((s) => s.kind === 'cut' && s.z === 0.5);
    const rough = cuts.slice(0, firstFinish).flatMap((s) => (s.kind === 'cut' && s.z !== undefined ? [s.z] : []));
    const levels = [...new Set(rough.map((z) => z.toFixed(3)))].map(Number).sort((a, b) => b - a);
    expect(levels[0]).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i - 1]! - levels[i]!).toBeLessThanOrEqual(1.6 + 1e-6);
    expect(Math.min(...levels)).toBeGreaterThan(-shape.depth + POCKET.roughAllowance - 1e-6);
  });

  it('ramps into each level as fast as keeps its downward speed within the plunge feed', () => {
    let from = { x: 0, y: 0, z: 5 };
    let ramps = 0;
    let fast = 0;
    for (const step of path.steps) {
      // The roughing only: the finishing lines run down the cleared slope at the cutting feed, as light cuts.
      if (step.kind === 'cut' && step.z === 0.5) break;
      if (step.kind !== 'rapid' && step.kind !== 'cut') continue;
      const to = { x: step.x ?? from.x, y: step.y ?? from.y, z: step.z ?? from.z };
      if (step.kind === 'cut') {
        const run = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
        const down = from.z - to.z;
        expect(step.feed).toBeLessThanOrEqual(feeds.feed + 1e-9);
        // No roughing move goes down faster than the plunge feed, however fast it goes along.
        if (down > 1e-6 && run > 1e-6) expect((step.feed * down) / run).toBeLessThanOrEqual(feeds.plunge + 1e-6);
        // A ramp: down and along at once, during the roughing.
        if (down > 0.5 && run > 2 * down && to.z < 0) {
          ramps++;
          if (step.feed > feeds.plunge + 1) fast++;
        }
      }
      from = to;
    }
    // One ramp a level; all but the short ones of the last levels run faster than a straight plunge would.
    expect(ramps).toBeGreaterThanOrEqual(5);
    expect(fast).toBeGreaterThanOrEqual(ramps - 2);
  });

  it('takes about a minute', () => {
    const seconds = runTime(path.steps, 3000, { x: 100, y: 0, z: 5 }).seconds;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(90);
  });
});

describe('the face frame reference cabinet, CNC-assisted', () => {
  const { job, parts, op, blankOf, fileOf } = jobFor('faceFrame');

  it('gives the case one pocket-hole row, cut with the ball nose, and the Kreg job none', () => {
    const row = op('case:pocketHole')!;
    expect(row).toMatchObject({ kind: 'pocketHole', label: 'Case: pocket holes', method: 'cnc', clearToolId: 'ballnose-1-8' });
    // Any ball nose that fits the bore is offered; the row starts on the narrowest, which the pocket was worked out with.
    expect(row.options.clearToolIds).toEqual(['ballnose-1-8', 'ballnose-1-4']);
    expect(row.machineSeconds).toBeGreaterThan(0);
    // Between the back's rabbet and the cutout in the table.
    const keys = job.plan.operations.map((o) => o.key);
    expect(keys.indexOf('case:pocketHole')).toBe(keys.indexOf('case:cutout') - 1);
    expect(job.plan.warnings.filter((w) => w.code === 'unsupported' || w.code === 'noCapableTool')).toEqual([]);

    const kreg = createBaseCabinetProject('faceFrame');
    expect(buildJob(kreg, lowRiderJobShop()).plan.operations.some((o) => o.kind === 'pocketHole')).toBe(false);
  });

  it('preps only the holes of parts cut out on the CNC, and says how to drill them', () => {
    const { pocketHoles: plan } = job.plan;
    expect(plan).toMatchObject({ method: 'cncAssisted', count: 44, cncAssisted: 32 });
    const row = op('case:pocketHole')!;
    expect(row.source.kind === 'features' && row.source.refs.length).toBe(32);
    // The solid-wood rails are cut on the saws: theirs are not in the row.
    expect(row.source.kind === 'features' && row.source.refs.some((r) => r.partId.includes('rail'))).toBe(false);
    const thickness = len('23/32"').mm;
    // One guide for each nominal thickness of stock: here the one, for 3/4" (the plywood measures 23/32").
    expect(plan!.prep!.guides).toEqual([{ template: 'pocketGuide', params: { thickness: 18.65, drill: 4 }, quantity: 1, output: '3mf' }]);
    expect(plan!.prep!.drilling).toEqual([{ thickness, count: 32, drill: 4, bitOutOfChuck: bitOutOfChuck(pocketShape(thickness, BALL)) }]);
    expect(plan!.prep!.drilling[0]!.bitOutOfChuck).toBeCloseTo(38.69, 1);
    const steps = job.plan.parts.find((p) => p.partId === 'cabinet-1/bottom')!.steps;
    expect(steps.map((s) => `${s.label}: ${s.by}`)).toEqual(['12 pocket holes: cnc', 'Drill 12 pilots from the edge with the guide: byHand']);
  });

  it('lays a part whose pockets are on its back the other face up, so no case blank is flipped', () => {
    const blank = blankOf('cabinet-1/bottom');
    expect(blank.setups).toHaveLength(1);
    const [setup] = blank.setups;
    expect(setup!.faceUp).toBe('A');
    expect(setup!.pinHoles).toEqual([]);
    expect(setup!.operationKeys).toEqual(['case:pocketHole', 'case:cutout']);
    const lies = Object.fromEntries(setup!.placements.map((p) => [p.partId, p.mirrored]));
    // The bottom's are underneath and the nailer's behind; the front stretcher's are on top.
    expect(lies).toEqual({ 'cabinet-1/bottom': true, 'cabinet-1/stretcher-front': false, 'cabinet-1/stretcher-back': true });
    // Only the fronts' blank is flipped.
    expect(job.plan.blanks.filter((b) => b.setups.length > 1).map((b) => b.index)).toEqual([1]);
    expect(job.files).toHaveLength(6);
  });

  it('cuts every pocket where its hole is, to its depth, with the ball nose between the holes and the big bit', () => {
    for (const partId of ['cabinet-1/bottom', 'cabinet-1/stretcher-front', 'cabinet-1/stretcher-back', 'cabinet-1/side-left', 'cabinet-1/side-right']) {
      const part = parts.get(partId)!;
      const blank = blankOf(partId);
      const setup = blank.setups[0]!;
      const placement = setup.placements.find((p) => p.partId === partId)!;
      const cuts = section(fileOf(blank.id, 1).text, 'Case: pocket holes').filter((m) => m.cut);
      const holes = pocketHoles(part);
      expect(holes.length, partId).toBeGreaterThan(0);
      for (const hole of holes) {
        const low = deepest(part, placement, hole);
        expect(cuts.some((m) => Math.hypot(m.x - low.x, m.y - low.y) < 0.002 && Math.abs(m.z - low.z) < 0.002), `${partId} ${hole.id}`).toBe(true);
      }
      // Nothing goes deeper than a pocket's floor, or off the part.
      expect(Math.min(...cuts.map((m) => m.z))).toBeGreaterThanOrEqual(-pocketShape(part.size.thickness, BALL).depth - 0.002);
    }
    const side = fileOf(blankOf('cabinet-1/side-left').id, 1).text;
    const status = side.split('\n').flatMap((l) => /\(MSG, (\d+\/\d+ T\d+ .+?) - /.exec(l)?.[1] ?? []);
    expect(status).toEqual(['1/4 T1 Case: shelf-pin holes', '2/4 T2 Case: pocket holes', '3/4 T3 Case: back rabbet', '4/4 T3 Case: cutout']);
    expect(side).toContain('(ToolDef 2: SHAPE=ball D=3.175 FLUTES=2 NAME=1/8" ball nose)');
  });

  it('keeps every pocket inside its own part', () => {
    const blank = blankOf('cabinet-1/bottom');
    const setup = blank.setups[0]!;
    const cuts = section(fileOf(blank.id, 1).text, 'Case: pocket holes').filter((m) => m.cut && m.z < 0);
    const boxes = setup.placements.map((p) => {
      const part = parts.get(p.partId)!;
      const a = onMachine(part, p, { x: 0, y: 0 });
      const b = onMachine(part, p, { x: part.size.width, y: part.size.height });
      return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
    });
    const r = BALL / 2;
    for (const m of cuts) {
      expect(boxes.some((b) => m.x > b.x0 + r && m.x < b.x1 - r && m.y > b.y0 + r && m.y < b.y1 - r)).toBe(true);
    }
  });

  it('writes files that follow the post rules and parse in cnc-gcode-tools', async () => {
    for (const [i, file] of job.files.entries()) {
      const planned = job.plan.blanks.find((b) => b.id === job.programs[i]!.blank.id)!;
      expect(file.text).not.toMatch(/^M[345]\b/m);
      for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
      const probes = (file.text.match(/^G38\.2 Z-80 F180 P0\.5/gm) ?? []).length;
      expect(probes).toBe((file.text.match(/attach the probe/gi) ?? []).length);
      expect(probes).toBeGreaterThanOrEqual(job.programs[i]!.toolIds.length);
      const lowest = Math.min(...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      if (planned.index > 1) expect(lowest).toBeGreaterThanOrEqual(-planned.size.thickness - THROUGH_EXTRA - 1e-6);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  });

  it('puts the guide and the drilling on the checklist', () => {
    const { job: built, project, shop } = jobFor('faceFrame');
    const list = buildChecklist(project, built.plan, built.programs, shop.tools, activeMachine(shop));
    expect(list.filter((s) => /pocket-hole/.test(s))).toEqual([
      'Print the pocket-hole guide and push a metal sleeve (4.1 × 7 × 20 mm) into it: from the back, up to its stop (untested experiment).',
      expect.stringMatching(/^Drill 32 pocket-hole pilots in the 18\.3 mm parts from the edge: a 4 mm or 5\/32" bit standing 38\.7 mm out of the chuck\..*pull its leg tight against the edge/),
    ]);
  });
});

describe('a side with work on both faces', () => {
  // Hidden: the frame's pocket holes are on the outside face, the shelf-pin holes and rabbet inside.
  const { job, parts, blankOf, fileOf } = jobFor('faceFrame', (cabinet) => {
    cabinet.sides.left = 'hidden';
  });
  const side = parts.get('cabinet-1/side-left')!;
  const blank = blankOf(side.id);

  it('flips that blank on pins, and no other case blank', () => {
    expect(pocketHoles(side).every((h) => h.face === 'B')).toBe(true);
    expect(blank.setups.map((s) => [s.faceUp, s.operationKeys.map((k) => k.split(':').slice(1).join(':'))])).toEqual([
      ['B', ['pinHole', 'pocketHole']],
      ['A', ['holes:shelf-pin@5', 'rabbet', 'cutout']],
    ]);
    expect(blank.setups[0]!.pinHoles).toHaveLength(2);
    expect(blankOf('cabinet-1/side-right').setups).toHaveLength(1);
    expect(blankOf('cabinet-1/bottom').setups).toHaveLength(1);
    expect(job.plan.warnings.filter((w) => w.code === 'unsupported' || w.code === 'noCapableTool')).toEqual([]);
  });

  it('cuts the pockets mirrored, with the back face up, and the pin holes through this blank', () => {
    const setup = blank.setups[0]!;
    const placement = setup.placements[0]!;
    expect(placement.mirrored).toBe(true);
    const file = fileOf(blank.id, 1).text;
    const cuts = section(file, 'Case: pocket holes').filter((m) => m.cut);
    for (const hole of pocketHoles(side)) {
      const low = deepest(side, placement, hole);
      expect(cuts.some((m) => Math.hypot(m.x - low.x, m.y - low.y) < 0.002 && Math.abs(m.z - low.z) < 0.002), hole.id).toBe(true);
    }
    // Through the plywood and 6 mm into the spoilboard: this blank's thickness, not the thicker MDF fronts'.
    const pins = section(file, 'Registration holes').filter((m) => m.cut);
    expect(Math.min(...pins.map((m) => m.z))).toBeCloseTo(-(len('23/32"').mm + 6), 3);
    expect(file).toContain('Flip the sheet left to right onto the pins.');
  });
});

describe('other jobs', () => {
  it('preps a pocket-screwed drawer box in 1/2" plywood, on the outside faces', () => {
    const { job, parts, op, blankOf } = jobFor('frameless', (_cabinet, project) => {
      const drawer = designsOf(project).find((d): d is DrawerDesign => d.template === 'drawer')!;
      drawer.box.cornerJoint = 'pocketScrews';
    });
    expect(op('boxes:pocketHole')).toMatchObject({ label: 'Drawer box: pocket holes', clearToolId: 'ballnose-1-8' });
    const front = parts.get('drawer-1/box-front')!;
    expect(pocketHoles(front).length).toBeGreaterThan(0);
    // The front has screw holes through it and pockets outside: one face each way would do, but the holes go right through.
    const blank = blankOf(front.id);
    expect(blank.setups.flatMap((s) => s.operationKeys)).toContain('boxes:pocketHole');
    expect(job.plan.warnings.filter((w) => w.code === 'unsupported' || w.code === 'noCapableTool')).toEqual([]);
    expect(job.plan.pocketHoles!.prep!.drilling.map((d) => Number(d.thickness.toFixed(2)))).toEqual([18.26, 11.91]);
  });

  it('leaves the vanity and a Kreg cabinet with no ball nose in any file', () => {
    const job = buildJob(createBaseCabinetProject('frameless'), lowRiderJobShop());
    expect(job.plan.summary.toolIds).not.toContain('ballnose-1-8');
    expect(job.plan.pocketHoles).toEqual({ method: 'kregJig', count: 16, cncAssisted: 0 });
  });
});

describe('the scrap test', () => {
  const shop = lowRiderJobShop();
  const test = buildPocketTest(shop, PLYWOOD_3_4_ID);

  it('cuts two pockets along the front edge, both as a job cuts them', () => {
    const planned = pocketShape(len('23/32"').mm, BALL);
    expect(POCKET_TEST.count).toBe(2);
    // Centred along the board: as far from its right end as from its left.
    expect(test.pockets.map((p) => p.x)).toEqual([60, 100]);
    // One seat, the planned one, for both.
    expect(test.seat).toBeCloseTo(planned.seat, 9);
    expect(test.depth).toBeCloseTo(planned.depth, 9);
    // The board, and the stock it is cut out of: a border bigger all round.
    expect(test.board).toEqual({ x: 160, y: 100 });
    expect(test.at).toEqual({ x: POCKET_TEST.border, y: POCKET_TEST.border });
    expect(test.stock).toEqual({ x: 200, y: 140 });
    expect(test.bitOutOfChuck).toBeCloseTo(bitOutOfChuck(planned), 9);
    expect(test.text).toContain('(Pocket 1 of 2: seat 13.7 mm from the edge)');
    expect(test.text).toContain('(Pocket 2 of 2: seat 13.7 mm from the edge)');
    expect(test.text).toContain('(MSG, 1/2 T1 Pocket-hole test: 2 pockets - ');
    expect(test.text).toContain('(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=140 ');
  });

  it('then cuts the board out of the stock, on holding tabs, with an end mill that reaches through', () => {
    expect(test.tools.map((t) => t.toolId)).toEqual(['ballnose-1-8', 'endmill-1-4']);
    expect(test.cutout.toolId).toBe('endmill-1-4');
    expect(test.cutout.tabs).toBeGreaterThanOrEqual(4);
    expect(test.text).toContain('(MSG, 2/2 T2 Pocket-hole test: cut the board out - ');
    expect(test.text.indexOf('cut the board out')).toBeGreaterThan(test.text.indexOf('(Pocket 2 of 2'));
    expect(test.text).toContain('Cut its tabs and trim them flush.');
    // Round the outside of the board, the bit's radius off its line on the last lap, through the stock and a little past it.
    const after = test.text.slice(test.text.indexOf('cut the board out'));
    const word = (line: string, w: string) => Number(new RegExp(`${w}(-?[\\d.]+)`).exec(line)?.[1] ?? NaN);
    const cuts = [...after.matchAll(/^G1 .*$/gm)].map((m) => m[0]);
    const r = len('1/4"').mm / 2;
    const [xs, ys, zs] = ['X', 'Y', 'Z'].map((w) => cuts.map((l) => word(l, w)).filter((v) => !Number.isNaN(v)));
    expect(Math.max(...xs!)).toBeLessThan(test.stock.x);
    expect(Math.max(...ys!)).toBeLessThan(test.stock.y);
    expect(Math.min(...xs!)).toBeGreaterThan(0);
    // A roughing lap a little outside the line, then one on it: never inside it.
    expect(ys!.some((y) => Math.abs(y - (test.at.y - r)) < 0.01)).toBe(true);
    expect(Math.min(...ys!)).toBeGreaterThan(test.at.y - r - 1);
    expect(xs!.some((x) => Math.abs(x - (test.at.x + test.board.x + r)) < 0.01)).toBe(true);
    expect(Math.min(...zs!)).toBeCloseTo(-(test.thickness + THROUGH_EXTRA), 2);
  });

  it('stays on the scrap and above its underside, and follows the post rules', async () => {
    const moves = [...test.text.matchAll(/^G[01] .*$/gm)].map((m) => m[0]);
    const word = (line: string, w: string) => Number(new RegExp(`${w}(-?[\\d.]+)`).exec(line)?.[1] ?? NaN);
    const xs = moves.map((l) => word(l, 'X')).filter((v) => !Number.isNaN(v));
    const ys = moves.map((l) => word(l, 'Y')).filter((v) => !Number.isNaN(v));
    const zs = moves.filter((l) => l.startsWith('G1')).map((l) => word(l, 'Z')).filter((v) => !Number.isNaN(v));
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(test.stock.x);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(test.stock.y);
    // The pockets as deep as planned; only the cut round the board goes through.
    const pocketZs = [...test.text.slice(0, test.text.indexOf('cut the board out')).matchAll(/^G1 .*Z(-?[\d.]+)/gm)].map((m) => Number(m[1]));
    expect(Math.min(...pocketZs)).toBeCloseTo(-test.depth, 2);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-(test.thickness + THROUGH_EXTRA) - 0.001);
    expect(test.text).not.toMatch(/^M[345]\b/m);
    expect(test.text).toContain('G10 L20 P0 X0 Y0');
    expect((test.text.match(/^G38\.2 Z-80 F180 P0\.5/gm) ?? []).length).toBe(2);
    for (const line of test.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(test.text);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
  });

  it('says so when the shop has no ball nose', () => {
    const bare = lowRiderJobShop();
    bare.tools = bare.tools.filter((t) => t.shape.kind !== 'ballNose');
    expect(() => buildPocketTest(bare, PLYWOOD_3_4_ID)).toThrow(/No ball nose bit/);
  });
});

describe('the pocket cut with a flat end mill', () => {
  const flatFeeds: Feeds = { feed: 1200, plunge: 300, depthPerPass: 1.6, stepover: 1.27, finish: 0 };
  const EIGHTH = len('1/8"').mm;
  /** Every cutting move of a slot, sampled along it: the bit's centre in from the edge and to the side, and its bottom's height. */
  const cut = (ledge = false) => {
    const slot = slotShape(19.05, EIGHTH);
    const made = new Path(5);
    pocketSlot(made, { x: 100, y: 0 }, { x: 0, y: 1 }, slot, flatFeeds, ledge);
    const at: { u: number; y: number; z: number }[] = [];
    let from = { x: 0, y: 0, z: 5 };
    for (const step of made.steps) {
      if (step.kind !== 'rapid' && step.kind !== 'cut') continue;
      const to = { x: step.x ?? from.x, y: step.y ?? from.y, z: step.z ?? from.z };
      if (step.kind === 'cut') for (let i = 0; i <= 10; i++) at.push({ u: from.y + ((to.y - from.y) * i) / 10, y: 100 - (from.x + ((to.x - from.x) * i) / 10), z: from.z + ((to.z - from.z) * i) / 10 });
      from = to;
    }
    return { slot, at };
  };

  it('is a slot as wide as the bore, to the bore\'s depth at the seat, with the seat square to the screw', () => {
    const { slot, at } = cut();
    expect(slot.fits).toBe(true);
    expect(slot.seat).toBeCloseTo(pocketShape(19.05, BALL).seat, 9);
    // Its floor at the seat is the bore's own lowest point there.
    expect(Math.min(...at.map((c) => c.z))).toBeCloseTo(-slot.depth, 6);
    expect(slot.depth).toBeCloseTo(19.05 / 2 - slot.seat * slot.sin + (POCKET.bore / 2) * slot.cos, 9);
    for (const c of at) {
      if (c.z > 1e-6) continue;
      // The bit's side never goes past the seat at the bit's own depth: the seat leans back as it rises.
      expect(c.u - slot.r).toBeGreaterThanOrEqual(slotSeatAt(slot, c.z) - 1e-6);
      // Between the walls.
      expect(Math.abs(c.y)).toBeLessThanOrEqual(slot.reach + 1e-6);
    }
    // The bit's side reaches the seat at every depth, in steps that stand under 0.1 mm proud of its slope.
    const onSeat = at.filter((c) => c.z < -1e-6 && Math.abs(c.u - slot.r - slotSeatAt(slot, c.z)) < 1e-6);
    const depths = [...new Set(onSeat.map((c) => c.z.toFixed(4)))].map(Number).sort((a, b) => b - a);
    expect(depths.at(-1)).toBeCloseTo(-slot.depth, 4);
    for (let i = 1; i < depths.length; i++) expect((depths[i - 1]! - depths[i]!) * (slot.sin / slot.cos)).toBeLessThanOrEqual(POCKET.ridge + 1e-6);
  });

  it('runs down the slope, not in steps: its floor is the bore\'s own, and level for the bit\'s width at the seat', () => {
    const { slot, at } = cut();
    const below = at.filter((c) => c.z < -1e-6);
    // Away from the seat the bit's far edge is never below the bore's floor there.
    const againstSeat = (c: { u: number; z: number }) => c.u - slot.r < slotSeatAt(slot, c.z) + 1e-6;
    for (const c of below) if (!againstSeat(c)) expect(c.z).toBeGreaterThanOrEqual(slotFloorAt(slot, c.u + slot.r) - 1e-6);
    // And it is on it all the way down the slope, at every line across the slot: nothing is left in steps.
    const onSlope = below.filter((c) => Math.abs(c.z - slotFloorAt(slot, c.u + slot.r)) < 1e-6);
    expect(new Set(onSlope.map((c) => c.y.toFixed(3))).size).toBeGreaterThanOrEqual(5);
    // (Each run down the slope is one straight move, looked at here at eleven points along it.)
    expect(new Set(onSlope.map((c) => c.z.toFixed(2))).size).toBeGreaterThanOrEqual(8);
    expect(Math.min(...onSlope.map((c) => c.z))).toBeLessThan(slotSlopeEnd(slot) + 0.5);
    expect(Math.max(...onSlope.map((c) => c.z))).toBeGreaterThan(-1);
    // Under where the slope's run ends, only the passes against the seat go: level for the bit's width at the seat's foot.
    expect(slotSlopeEnd(slot)).toBeCloseTo(-slot.depth + 2 * slot.r * slot.sin * slot.cos, 9);
    for (const c of below) if (c.z < slotSlopeEnd(slot) - 1e-6) expect(againstSeat(c)).toBe(true);
    const deepest = below.filter((c) => Math.abs(c.z + slot.depth) < 1e-6);
    expect(Math.max(...deepest.map((c) => c.u)) - Math.min(...deepest.map((c) => c.u))).toBeLessThan(1e-6);
  });

  it('is for a bit no wider than half the bore: a 1/4" bit\'s corners would take the seat', () => {
    expect(slotShape(19.05, EIGHTH).fits).toBe(true);
    expect(slotShape(19.05, len('1/4"').mm).fits).toBe(false);
    // The guide's key fits it as it fits the ball nose's pocket: the walls are the bore's width apart.
    expect(slotShape(19.05, EIGHTH).reach + EIGHTH / 2).toBeCloseTo(POCKET.bore / 2, 9);
  });

  it('with a ledge, first clears a shallow rectangle round the opening for a printed cover', () => {
    const plain = cut();
    const { slot, at } = cut(true);
    const open = slotOpening(slot, true);
    const bare = slotOpening(slot);
    expect(open.u0).toBeCloseTo(bare.u0 - POCKET.ledge.margin, 9);
    expect(open.u1).toBeCloseTo(bare.u1 + POCKET.ledge.margin, 9);
    expect(open.half).toBeCloseTo(bare.half + POCKET.ledge.margin, 9);
    // The bit goes out to the ledge's edge, no deeper than the ledge there.
    const outside = at.filter((c) => Math.abs(c.y) > slot.reach + 1e-6 || c.u < slotSeatAt(slot, c.z) + slot.r - 1e-3);
    expect(outside.length).toBeGreaterThan(0);
    for (const c of outside) expect(c.z).toBeGreaterThanOrEqual(-POCKET.ledge.depth - 1e-6);
    expect(Math.max(...at.map((c) => Math.abs(c.y)))).toBeCloseTo(open.half - slot.r, 6);
    expect(Math.min(...at.map((c) => c.u))).toBeCloseTo(open.u0 + slot.r, 6);
    expect(Math.max(...at.map((c) => c.u))).toBeCloseTo(open.u1 - slot.r, 6);
    expect(at.length).toBeGreaterThan(plain.at.length);
  });
});

describe('the scrap test with other kinds of pocket', () => {
  const shop = lowRiderJobShop();

  it('offers the ball nose a job uses, then the flat end mill that can cut a pocket', () => {
    expect(pocketTestBits(shop).map((t) => t.id)).toEqual(['ballnose-1-8', 'ballnose-1-4', 'endmill-1-8']);
  });

  it('cuts two alike with the flat end mill, in well under a minute and a half each with its ledge', () => {
    const plain = buildPocketTest(shop, PLYWOOD_3_4_ID, [{ bit: 'flat', ledge: false }, { bit: 'flat', ledge: false }]);
    // The end mill that cut the pockets cuts the board out too: one bit, no change.
    expect(plain.tools.map((t) => t.toolId)).toEqual(['endmill-1-8']);
    expect(plain.cutout.toolId).toBe('endmill-1-8');
    expect((plain.text.match(/^G38\.2 Z-80 F180 P0\.5/gm) ?? []).length).toBe(1);
    expect(plain.board).toEqual({ x: 160, y: 100 });
    expect(plain.text).not.toContain('ball nose');
    expect(plain.pockets[0]!.seconds).toBeLessThan(65);
    const ledged = buildPocketTest(shop, PLYWOOD_3_4_ID, [{ bit: 'flat', ledge: true }, { bit: 'flat', ledge: true }]);
    // The ledge is once round its edge at each depth, not the whole rectangle cleared: about a third more, not double.
    expect(ledged.pockets[0]!.seconds).toBeGreaterThan(plain.pockets[0]!.seconds);
    expect(ledged.pockets[0]!.seconds).toBeLessThan(plain.pockets[0]!.seconds * 1.4);
  });

  it('cuts a ledge round the ball nose\'s pocket with the flat end mill, before the ball nose cuts down through it', () => {
    const test = buildPocketTest(shop, PLYWOOD_3_4_ID, [{ bit: 'ball', ledge: true }, { bit: 'ball', ledge: true }]);
    // The board is cut out with the end mill the test already has, back in the router, not with a third bit.
    expect(test.tools.map((t) => t.toolId)).toEqual(['endmill-1-8', 'ballnose-1-8', 'endmill-1-8']);
    expect(test.text.indexOf('1/8 in end mill')).toBeLessThan(test.text.indexOf('1/8 in ball nose'));
    const bare = buildPocketTest(shop, PLYWOOD_3_4_ID);
    expect(bare.tools.map((t) => t.toolId)).toEqual(['ballnose-1-8', 'endmill-1-4']);
    expect(test.pockets[0]!.seconds).toBeGreaterThan(bare.pockets[0]!.seconds);
    expect(test.pockets[0]!.seconds).toBeLessThan(bare.pockets[0]!.seconds + 40);
    // Round a ball nose's pocket the ledge's far end is cleared level too: the pocket is shallower than the ledge there.
    const slot = slotShape(19.05, len('1/8"').mm);
    const feeds: Feeds = { feed: 1200, plunge: 300, depthPerPass: 1.6, stepover: 1.27, finish: 0 };
    const cuts = (fill: boolean) => {
      const path = new Path(5);
      pocketLedge(path, { x: 100, y: 0 }, { x: 0, y: 1 }, slotLedge(slot), slot.r, feeds, fill);
      return path.steps.filter((s) => s.kind === 'cut');
    };
    expect(cuts(true).length).toBeGreaterThan(cuts(false).length);
    for (const s of cuts(true)) if (s.kind === 'cut' && s.z !== undefined) expect(s.z).toBeGreaterThanOrEqual(-POCKET.ledge.depth - 1e-9);
  });

  it('cuts every kind side by side, one of each: the ball nose\'s and the end mill\'s, without the ledge and with it', async () => {
    const all = buildPocketTest(shop, PLYWOOD_3_4_ID, POCKET_KINDS);
    expect(all.pockets.map((p) => [p.bit, p.ledge])).toEqual([['ball', false], ['ball', true], ['flat', false], ['flat', true]]);
    expect(all.pockets.map((p) => p.x)).toEqual([60, 100, 140, 180]);
    expect(all.board).toEqual({ x: 240, y: 100 });
    expect(all.stock).toEqual({ x: 280, y: 140 });
    for (const p of all.pockets) {
      expect(p.seconds).toBeGreaterThan(10);
      expect(p.seconds).toBeLessThan(90);
    }
    // Two bits for the pockets, the flat end mill first, which goes back in to cut the board out: a probe for each change, and every line within the controller's limit.
    expect(all.tools.map((t) => t.toolId)).toEqual(['endmill-1-8', 'ballnose-1-8', 'endmill-1-8']);
    expect((all.text.match(/^G38\.2 Z-80 F180 P0\.5/gm) ?? []).length).toBe(3);
    expect(all.text).toContain('Pocket-hole test: 1/8 in end mill');
    expect(all.text).toContain('(Pocket 4 of 4: seat 13.7 mm from the edge)');
    for (const line of all.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
    expect(all.text).not.toMatch(/^M[345]\b/m);
    const zs = [...all.text.slice(0, all.text.indexOf('cut the board out')).matchAll(/^G1 .*Z(-?[\d.]+)/gm)].map((m) => Number(m[1]));
    expect(Math.min(...zs)).toBeGreaterThan(-all.thickness + POCKET.minFloor - 1e-6);
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(all.text);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
  });

  it('says so when the shop has no bit for a kind', () => {
    const bare = lowRiderJobShop();
    bare.tools = bare.tools.filter((t) => t.id !== 'endmill-1-8');
    // The 1/4" end mill does not count: more than half the bore across.
    expect(() => buildPocketTest(bare, PLYWOOD_3_4_ID, [{ bit: 'flat', ledge: false }])).toThrow(/No flat end mill/);
    expect(() => buildPocketTest(bare, PLYWOOD_3_4_ID, [{ bit: 'ball', ledge: true }])).toThrow(/No flat end mill/);
    expect(buildPocketTest(bare, PLYWOOD_3_4_ID).pockets).toHaveLength(2);
  });
});

describe('the printed cover', () => {
  const cover = { thickness: 18.65, bit: len('1/8"').mm };

  it('lies in the ledge with a little room all round, as thick as the ledge is deep', () => {
    const open = slotOpening(slotShape(cover.thickness, cover.bit), true);
    expect(coverSize(cover)).toEqual({ length: open.u1 - open.u0 - 2 * COVER.fit, width: 2 * (open.half - COVER.fit), thickness: POCKET.ledge.depth });
    // The bore and the ledge's margin either side of it.
    expect(coverSize(cover).width).toBeCloseTo(POCKET.bore + 2 * POCKET.ledge.margin - 2 * COVER.fit, 9);
  });

  it('is one solid lying face down: a plate, a rib that stands in the slot, hollowed over the screw\'s head', async () => {
    const mesh = await buildPocketCover(cover);
    const max = [0, 0, 0];
    mesh.positions.forEach((v, i) => (max[i % 3] = Math.max(max[i % 3]!, v)));
    const size = coverSize(cover);
    expect(max[0]).toBeCloseTo(size.length, 3);
    expect(max[1]).toBeCloseTo(size.width, 3);
    expect(max[2]).toBeCloseTo(POCKET.ledge.depth + COVER.rib.depth, 3);
    expect(mesh.volume).toBeGreaterThan(0.6 * size.length * size.width * size.thickness);
    expect(mesh.volume).toBeLessThan(size.length * size.width * size.thickness + 400);
  });

  it('says so for a bit too wide for the pocket, and for stock too thin', () => {
    expect(pocketCoverProblems(cover)).toEqual([]);
    // A ledge is cut with a bit up to the pocket's own width: a 1/4" one is another plate, not a problem.
    expect(pocketCoverProblems({ ...cover, bit: 6.35 })).toEqual([]);
    expect(pocketCoverProblems({ ...cover, bit: 12.7 })).toEqual(['The bit is wider than the pocket: the ledge is cut with one no wider than it.']);
    expect(pocketCoverProblems({ ...cover, thickness: 9 })).toEqual(['That stock is too thin for a pocket hole.']);
  });
});

describe('the printed guide', () => {
  const guide = { thickness: len('23/32"').mm, drill: 4 };
  const box = (mesh: { positions: Float32Array }) => {
    const max = [0, 0, 0];
    mesh.positions.forEach((v, i) => (max[i % 3] = Math.max(max[i % 3]!, v)));
    return max;
  };

  it('drills from the edge, so a regular bit reaches', () => {
    const shape = pocketShape(guide.thickness, GUIDE.ball);
    // Through the guide, in through the edge, and out through the seat a little.
    expect(guideBitOut(guide)).toBeCloseTo(POCKET.guideOutside + shape.seat + POCKET.through, 9);
    expect(guideBitOut(guide)).toBeLessThan(50);
  });

  it('is one solid, lying plate down on the bed with its leg standing up', async () => {
    const mesh = await buildPocketGuide(guide);
    const [long, across, tall] = box(mesh);
    expect(across).toBeCloseTo(GUIDE.plateWidth, 3);
    // The leg stands up past the board's other face.
    expect(tall).toBeGreaterThanOrEqual(GUIDE.plate + guide.thickness - 1e-3);
    // From the boss's back outside the edge to the plate's far end.
    expect(long).toBeGreaterThan(guidePlateIn(guide.thickness) + POCKET.guideOutside * 0.9);
    expect(long).toBeLessThan(guidePlateIn(guide.thickness) + POCKET.guideOutside + GUIDE.boss);
    // No bigger than it has to be: the plate ends just past the key, about 40 mm in, and it is under 15 cm3.
    expect(guidePlateIn(guide.thickness)).toBeLessThan(42);
    expect(guidePlateIn(12.3)).toBeLessThan(guidePlateIn(guide.thickness));
    expect(long).toBeLessThan(75);
    expect(mesh.volume).toBeGreaterThan(5000);
    // Under 10 cm3: a thin plate and leg, and the boss on a web narrower than itself.
    expect(mesh.volume).toBeLessThan(10000);
    expect(GUIDE.web).toBeLessThan(GUIDE.boss);
    expect(GUIDE.web).toBeGreaterThanOrEqual(0.69 * GUIDE.boss);
    // Its far corners are rounded: nothing of it is in the very corner of the box it fills.
    const p = mesh.positions;
    let inCorner = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i]! > long! - 1 && (p[i + 1]! < 1 || p[i + 1]! > across! - 1)) inCorner++;
    expect(inCorner).toBe(0);
  });

  it('its key comes to within half a millimetre of the seat, its front corners rounded to clear the trough\'s', async () => {
    const shape = pocketShape(guide.thickness, GUIDE.ball);
    expect(guideKeyNose(guide.thickness)).toBeCloseTo(shape.seat + 0.5, 9);
    // Rounder than the corners the ball leaves, so they never touch.
    expect(GUIDE.ball / 2 + GUIDE.noseRoundOver).toBeGreaterThan(shape.r);
    // The key's nose in the solid: the furthest point toward the edge that is under the face and inside the board.
    const { guide: placed } = await buildPocketGuideInUse(guide);
    const p = placed.positions;
    let front = Infinity;
    for (let i = 0; i < p.length; i += 3) if (p[i + 2]! < -1 && p[i]! > 1) front = Math.min(front, p[i]! * shape.cos + (p[i + 2]! + guide.thickness / 2) * shape.sin);
    expect(front).toBeCloseTo(guideKeyNose(guide.thickness), 2);
    // And its corners are cut back: at the key's full width the solid starts a corner's radius further in.
    let atSide = Infinity;
    for (let i = 0; i < p.length; i += 3) if (p[i + 2]! < -1 && p[i]! > 1 && Math.abs(Math.abs(p[i + 1]!) - KEY_RADIUS) < 1e-3) atSide = Math.min(atSide, p[i]! * shape.cos + (p[i + 2]! + guide.thickness / 2) * shape.sin);
    expect(atSide).toBeCloseTo(guideKeyNose(guide.thickness) + GUIDE.ball / 2 + GUIDE.noseRoundOver, 2);
  });

  it('one guide does every stock sold as one thickness', () => {
    // 3/4" plywood (23/32") and 3/4" solid wood share a guide; 1/2" stock takes another.
    expect(guideStock(len('23/32"').mm)?.name).toBe('3/4"');
    expect(guideThickness(len('23/32"').mm)).toBe(guideThickness(19.05));
    expect(guideThickness(len('15/32"').mm)).toBe(12.3);
    expect(guideThickness(len('15/32"').mm)).not.toBe(guideThickness(19.05));
    // A thickness that is none of them gets a guide of its own.
    expect(guideStock(22)).toBeUndefined();
    expect(guideThickness(22)).toBe(22);
    // The bit goes in at half the thickness the guide is made for: within half a millimetre of the middle of any stock it does.
    for (const s of GUIDE_STOCK) expect(Math.max(s.mm - s.from, s.to - s.mm) / 2).toBeLessThan(0.5);
  });

  it('a job gets one for each thickness of stock, as one 3MF', async () => {
    const jigs = [19, 12.3].map((thickness) => ({ template: 'pocketGuide' as const, params: { thickness, drill: 4 }, quantity: 1, output: '3mf' as const }));
    const objects = await buildPocketGuideObjects(jigs);
    expect(objects.map((o) => o.name)).toEqual(['Pocket-hole guide, 3/4" stock', 'Pocket-hole guide, 1/2" stock']);
    expect(objects[1]!.placements[0]!.y).toBeGreaterThan(GUIDE.plateWidth);
    const bytes = await buildPocketGuide3mf(jigs);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it('is shown in use: on a board with its pocket, its sleeve in its seat, the bit going through', async () => {
    const { guide: placed, board } = await buildPocketGuideInUse(guide);
    // The same solid as the one printed, as it sits on the board.
    expect(placed.volume).toBeCloseTo((await buildPocketGuide(guide)).volume, 0);
    const span = (mesh: { positions: Float32Array }, axis: number) => {
      const values = Array.from(mesh.positions).filter((_, i) => i % 3 === axis);
      return [Math.min(...values), Math.max(...values)];
    };
    // Its plate lies on the face (z = 0) and its leg is against the edge (x = 0), down past the board's other face.
    expect(span(placed, 2)[1]).toBeCloseTo(GUIDE.plate, 3);
    // (The boss on the leg hangs lower still.)
    expect(span(placed, 2)[0]).toBeLessThanOrEqual(-guide.thickness + 1e-3);
    expect(span(placed, 0)[0]).toBeLessThan(-GUIDE.leg);
    expect(span(placed, 0)[1]).toBeCloseTo(guidePlateIn(guide.thickness), 3);
    // The board has its pocket and its pilot cut out of it.
    const solid = 75 * 52 * guide.thickness;
    expect(board.volume).toBeLessThan(solid - 1000);
    expect(board.volume).toBeGreaterThan(solid - 5000);
    expect(span(board, 2)).toEqual([expect.closeTo(-guide.thickness, 3), expect.closeTo(0, 3)]);
    // Its sleeve, 20 mm long, from just inside the boss's back to the lip short of the edge.
    const [sleeve] = guideSleeves({ ...guide, sleeve: POCKET_SLEEVE });
    expect(guideSleeves({ ...guide, sleeve: POCKET_SLEEVE })).toHaveLength(1);
    expect(sleeve!.to - sleeve!.from).toBeCloseTo(20, 9);
    expect(sleeve!.from).toBeGreaterThanOrEqual(-POCKET.guideOutside);
    expect(sleeve!.to).toBeLessThan(-SLEEVE_LIMITS.lip);
  });

  it('is printed for the metal sleeve the shop has, within limits', async () => {
    // The usual one: a stainless M4 spacer. Two bronze bushings, a fatter spacer and two MR74 bearings fit too.
    expect(POCKET_SLEEVE).toEqual({ bore: 4.1, outside: 7, length: 20, count: 1 });
    expect(sleeveWords(POCKET_SLEEVE)).toBe('4.1 × 7 × 20 mm');
    for (const sleeve of [POCKET_SLEEVE, { bore: 4, outside: 6, length: 10, count: 2 }, { bore: 4, outside: 8, length: 12, count: 1 }, { bore: 4, outside: 7, length: 2.5, count: 2 }] as const) {
      expect(sleeveProblems(sleeve)).toEqual([]);
      expect(pocketGuideProblems({ ...guide, sleeve })).toEqual([]);
    }
    // What does not: a bore the bit does not go in, or rattles in; a wall too thin; too fat; too long.
    expect(sleeveProblems({ ...POCKET_SLEEVE, bore: 3.9 })).toEqual(["The sleeve's bore is smaller than the 4 mm drill bit."]);
    expect(sleeveProblems({ ...POCKET_SLEEVE, bore: 4.76 })).toEqual(["The sleeve's bore is too loose to steer a 4 mm bit: 4.6 mm at most."]);
    expect(sleeveProblems({ ...POCKET_SLEEVE, outside: 4.8 })).toEqual(["The sleeve's wall is too thin: at least 5.1 mm outside."]);
    expect(sleeveProblems({ ...POCKET_SLEEVE, outside: 12, length: 10 })).toEqual(['The sleeve is too big across for the guide: 10 mm outside at most.']);
    expect(sleeveProblems({ ...POCKET_SLEEVE, length: 1 })).toEqual(['The sleeve is too short: at least 2 mm.']);
    expect(sleeveProblems({ ...POCKET_SLEEVE, length: 25 })).toEqual(['A sleeve this long does not fit: the guide holds 20.2 mm.']);
    expect(sleeveProblems({ bore: 4, outside: 8, length: 12, count: 2 })).toEqual(['Two sleeves this long do not fit: the guide holds 20 mm in all.']);
    await expect(buildPocketGuide({ ...guide, sleeve: { ...POCKET_SLEEVE, length: 25 } })).rejects.toThrow(/does not fit/);
    // A fatter sleeve stops a little further from the edge, which the bore meets at an angle; a low-angle guide holds more.
    expect(sleeveRoom(8)).toBeLessThan(sleeveRoom(6));
    expect(sleeveRoom(7, 3)).toBeGreaterThan(sleeveRoom(7));
    // Two: the first against the lip, the second flush with the boss's back, clear of each other.
    const two = guideSleeves({ sleeve: { bore: 4, outside: 6, length: 10, count: 2 } });
    expect(two[1]!.from).toBe(-POCKET.guideOutside);
    expect(two[0]!.from).toBeGreaterThanOrEqual(two[1]!.to - 1e-9);
    // The seat is cut out of the print, from the back to the lip whatever the length: a fatter sleeve leaves less plastic, though the boss grows round a fat one.
    const volume = async (sleeve: PocketSleeve) => (await buildPocketGuide({ ...guide, sleeve })).volume;
    expect(await volume({ ...POCKET_SLEEVE, outside: 6 })).toBeGreaterThan(await volume(POCKET_SLEEVE));
    expect(guideBoss({ sleeve: POCKET_SLEEVE }).boss).toBe(GUIDE.boss);
    expect(guideBoss({ sleeve: { ...POCKET_SLEEVE, outside: 10 } })).toEqual({ boss: 16, web: 11.2 });
  });

  it('takes flanged sleeves: one in the back, a second let into the fence, each flange in a recess', async () => {
    // Bronze flanged bushings, 4 × 8 × 10 over all with a 12 × 2 flange.
    const flanged: PocketSleeve = { bore: 4, outside: 8, length: 10, count: 2, flange: { diameter: 12, thickness: 2 } };
    expect(sleeveProblems(flanged)).toEqual([]);
    expect(sleeveWords(flanged)).toBe('4 × 8 × 10 mm, flange 12 × 2 mm');
    const [first, second] = guideSleeves({ sleeve: flanged });
    // The first's flange is at the boss's back, flush, so the chuck stops where it did; the second's is just short of the edge.
    expect(first).toEqual({ from: -POCKET.guideOutside, to: -POCKET.guideOutside + 10, flange: 'from' });
    expect(second!.flange).toBe('to');
    expect(second!.to).toBeCloseTo(fenceFlangeAt(12), 9);
    expect(second!.to).toBeLessThan(0);
    expect(second!.from).toBeGreaterThanOrEqual(first!.to - 1e-9);
    // The boss grows round the flange, and the recesses come out of the print.
    expect(guideBoss({ sleeve: flanged }).boss).toBe(15);
    const plain = await buildPocketGuide({ ...guide, sleeve: { ...flanged, flange: undefined } });
    const made = await buildPocketGuide({ ...guide, sleeve: flanged });
    expect(made.volume).toBeGreaterThan(5000);
    expect(made.volume).not.toBeCloseTo(plain.volume, 0);
    // What does not fit: a flange no bigger than the sleeve, one too big, one as thick as the sleeve, two too long.
    expect(sleeveProblems({ ...flanged, flange: { diameter: 8, thickness: 2 } })).toEqual(['The flange must be bigger across than the sleeve, and its thickness more than 0.']);
    expect(sleeveProblems({ ...flanged, count: 1, flange: { diameter: 20, thickness: 2 } })).toEqual(['The flange is too big across for the guide: 16 mm at most.']);
    expect(sleeveProblems({ ...flanged, length: 2 })).toEqual(['The flange is as thick as the sleeve is long: the length is over all.']);
    expect(sleeveProblems({ ...flanged, length: 12 })[0]).toMatch(/^Two sleeves this long do not fit/);
    expect(sleeveGoesIn(flanged)).toBe('one from the back and one from the fence side, each until its flange is seated');
  });

  it("a job's guides, lists and checklist go by the shop's sleeve", () => {
    const sleeve: PocketSleeve = { bore: 4, outside: 6, length: 10, count: 2 };
    expect(jigSleeve({ params: { thickness: 19, drill: 4 } })).toEqual(POCKET_SLEEVE);
    expect(jigSleeve({ params: { thickness: 19, drill: 4, ...sleeveParams(sleeve) } })).toEqual(sleeve);
    const flanged: PocketSleeve = { ...sleeve, outside: 8, flange: { diameter: 12, thickness: 2 } };
    expect(jigSleeve({ params: { thickness: 19, drill: 4, ...sleeveParams(flanged) } })).toEqual(flanged);
  });

  it('the picture runs round: the guide down and in, then the bit in until the chuck stops, and out again', () => {
    const at = (time: number) => guideInUseAt(guide, time);
    const deep = guideBitOut(guide) - POCKET.guideOutside;
    // It starts above its place and a little out from the edge, the bit well clear.
    expect(at(0).guide.up).toBeGreaterThan(30);
    expect(at(0).guide.out).toBeGreaterThan(0);
    expect(at(0).tip).toBeLessThan(-POCKET.guideOutside);
    // Down first, still out from the edge; then in, against it.
    expect(at(IN_USE.lower)).toMatchObject({ guide: { up: 0, out: at(0).guide.out } });
    expect(at(IN_USE.slide).guide).toEqual({ out: 0, up: 0 });
    // The bit only moves once the guide is seated, and stops with the chuck against the guide's back.
    expect(at(IN_USE.wait).tip).toBeCloseTo(at(0).tip, 9);
    expect(at(IN_USE.drill).tip).toBeCloseTo(deep, 9);
    expect(deep).toBeCloseTo(pocketShape(guide.thickness, GUIDE.ball).seat + POCKET.through, 9);
    expect(at(IN_USE.hold).guide).toEqual({ out: 0, up: 0 });
    expect(at((IN_USE.wait + IN_USE.drill) / 2).drilling).toBe(true);
    // Out again before the guide lifts, and round to the start.
    expect(at(IN_USE.withdraw).tip).toBeCloseTo(at(0).tip, 9);
    expect(at(IN_USE.withdraw).guide.up).toBe(0);
    expect(at(IN_USE.lift).guide.up).toBeGreaterThan(30);
    expect(at(IN_USE.end + 0.5)).toEqual(at(0.5));
  });

  it('says so for a bit the sleeve does not take, and for stock too thin', async () => {
    expect(pocketGuideProblems(guide)).toEqual([]);
    expect(pocketGuideProblems({ ...guide, drill: 8 })).toEqual(["The sleeve's bore is smaller than the 8 mm drill bit."]);
    expect(pocketGuideProblems({ ...guide, thickness: 9 })).toEqual(['That stock is too thin for a pocket hole.']);
    await expect(buildPocketGuide({ ...guide, thickness: 9 })).rejects.toThrow(/too thin/);
  });
});

describe('a ledge for a printed cover, round the pocket holes that are seen', () => {
  const covered = (where: PocketCoverWhere[] | undefined, method: Project['plan']['pocketHoles'] = 'cncAssisted') =>
    jobFor('faceFrame', (_cabinet, project) => {
      project.plan.pocketHoles = method;
      if (where) project.plan.pocketCovers = where;
    });
  const refs = (j: ReturnType<typeof jobFor>, key: string) => {
    const source = j.op(key)?.source;
    return source?.kind === 'features' ? source.refs : [];
  };

  it('is asked for by where a pocket is seen: none to start with, every pocket, or the ones in a face that shows', () => {
    expect(pocketCovered([], 'shows', false)).toBe(false);
    expect([pocketCovered(['outside'], 'shows', false), pocketCovered(['outside'], 'inside', false), pocketCovered(['outside'], 'hidden', false)]).toEqual([true, false, false]);
    // Inside a case and inside a drawer box are asked apart.
    expect([pocketCovered(['behindDoor'], 'inside', false), pocketCovered(['behindDoor'], 'inside', true)]).toEqual([true, false]);
    expect([pocketCovered(['inDrawer'], 'inside', true), pocketCovered(['inDrawer'], 'inside', false)]).toEqual([true, false]);
    // A hidden face gets one only when every pocket does.
    expect([pocketCovered(['outside', 'behindDoor', 'inDrawer'], 'hidden', false), pocketCovered(['all'], 'hidden', false)]).toEqual([false, true]);
    // Only a pocket the CNC cuts takes one, at 15 degrees or a low angle: never a Kreg jig hole.
    expect([pocketCoversOf({ pocketHoles: 'cncAssisted', pocketCovers: ['all'] }), pocketCoversOf({ pocketCovers: ['all'] }), pocketCoversOf({ pocketHoles: 'lowAngle3', pocketCovers: ['all'] })]).toEqual([['all'], [], ['all']]);
  });

  it('is a row of its own after the pockets, cut with a flat end mill, on those pockets only', async () => {
    const none = covered(undefined);
    expect(none.op('case:pocketLedge')).toBeUndefined();

    const all = covered(['all']);
    const row = all.op('case:pocketLedge')!;
    expect(row).toMatchObject({ kind: 'pocketLedge', label: 'Case: pocket-hole cover ledges', method: 'cnc' });
    // Either flat end mill cuts it, the 1/8" or the 1/4"; the row starts on the widest, which cuts the parts out too.
    expect(row.options.clearToolIds).toEqual(['endmill-1-4', 'endmill-1-8']);
    expect([row.clearToolId, all.op('case:cutout')!.clearToolId]).toEqual(['endmill-1-4', 'endmill-1-4']);
    // Every pocket the CNC cuts gets one, and the ledge comes after its pocket.
    expect(refs(all, 'case:pocketLedge')).toEqual(refs(all, 'case:pocketHole'));
    const keys = all.job.plan.operations.map((o) => o.key);
    expect(keys.indexOf('case:pocketLedge')).toBeGreaterThan(keys.indexOf('case:pocketHole'));
    expect(all.job.plan.warnings.filter((w) => w.code === 'unsupported' || w.code === 'noCapableTool')).toEqual([]);
    // The files still parse and follow the post's rules, and the ledge is no deeper than it should be.
    for (const file of all.job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
    expect(all.job.files.some((f) => f.text.includes('cover ledges'))).toBe(true);
    // The covers to print are on the list, one a ledge.
    const L = (mm: number) => `${mm} mm`;
    expect(buildLists(all.job, all.project, all.shop, L).hardware.find((h) => h.item.startsWith('Pocket-hole covers, for a ledge cut with the 1/4"'))?.quantity).toBe(refs(all, 'case:pocketLedge').length);
    // The plate follows the bit that cut its ledge: the same size, with that bit's radius at its corners.
    const [small, big] = [len('1/8"').mm, len('1/4"').mm].map((bit) => ({ thickness: 19.05, bit }));
    expect([pocketCoverProblems(small!), pocketCoverProblems(big!)]).toEqual([[], []]);
    expect(coverSize(big!)).toEqual(coverSize(small!));
    expect(buildLists(none.job, none.project, none.shop, L).hardware.some((h) => h.item.startsWith('Pocket-hole covers'))).toBe(false);

    // Asked only where a pocket is seen: fewer of them, each one of the pockets, in a face that is not hidden.
    const seen = covered(['outside', 'behindDoor', 'inDrawer']);
    const some = refs(seen, 'case:pocketLedge');
    expect(some.length).toBeLessThan(refs(all, 'case:pocketLedge').length);
    const pockets = refs(all, 'case:pocketHole').map((r) => `${r.partId}/${r.featureId}`);
    for (const r of some) expect(pockets).toContain(`${r.partId}/${r.featureId}`);
    const shows = projectShows(seen.project, [...seen.job.parts, ...seen.job.cabinetParts]);
    for (const r of some) {
      const feature = seen.parts.get(r.partId)!.features.find((f) => f.id === r.featureId) as Extract<Feature, { kind: 'pocketHole' }>;
      expect(shows.get(r.partId)![feature.face]).not.toBe('hidden');
    }
  });

  it('is not cut round a Kreg jig hole', () => {
    expect(covered(['all'], 'kregJig').op('case:pocketLedge')).toBeUndefined();
  });

  it('is cut round a low-angle pocket too, after it, with the arc\'s shallow end cleared level', async () => {
    for (const method of ['lowAngle3', 'lowAngle6'] as const) {
      const all = covered(['all'], method);
      const row = all.op('case:pocketLedge')!;
      expect(row).toMatchObject({ kind: 'pocketLedge', method: 'cnc' });
      expect(refs(all, 'case:pocketLedge')).toEqual(refs(all, 'case:pocketHole'));
      const keys = all.job.plan.operations.map((o) => o.key);
      expect(keys.indexOf('case:pocketLedge')).toBeGreaterThan(keys.indexOf('case:pocketHole'));
      expect(all.job.plan.warnings.filter((w) => w.code === 'unsupported' || w.code === 'noCapableTool')).toEqual([]);
      for (const file of all.job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      }
      // The covers are the low-angle kind, named by their angle.
      const L = (mm: number) => `${mm} mm`;
      const angle = method === 'lowAngle3' ? 3 : 6;
      expect(buildLists(all.job, all.project, all.shop, L).hardware.find((h) => h.item.startsWith(`Pocket-hole covers, low angle ${angle}°`))?.quantity).toBe(refs(all, 'case:pocketLedge').length);
    }
  });

  it('round a low-angle pocket: as long as the arc, cleared level where the arc is shallower than the ledge, never deeper', () => {
    const t = 18.65;
    const open = arcLedge(t, 3);
    const shape = arcShape(t, POCKET.bore, 3);
    expect(open.u0).toBeCloseTo(arcSeatAt(shape, 0) - POCKET.ledge.margin, 9);
    expect(open.u1).toBeCloseTo(shape.end + POCKET.ledge.margin, 9);
    expect(open.half).toBeCloseTo(POCKET.bore / 2 + POCKET.ledge.margin, 9);
    // It covers the pocket whatever bit cut it: a narrower bit's arc meets the face no further in.
    for (const bit of [3.175, 6.35]) expect(arcShape(12.3, bit, 6).end).toBeLessThanOrEqual(arcShape(12.3, POCKET.bore, 6).end + 1e-9);
    const cut = (fill: boolean) => {
      const path = new Path(5);
      pocketLedge(path, { x: 100, y: 0 }, { x: 0, y: 1 }, open, 3.175, feeds, fill);
      return path.steps.filter((s) => s.kind === 'cut');
    };
    expect(cut(true).length).toBeGreaterThan(cut(false).length);
    for (const s of cut(true)) if (s.kind === 'cut' && s.z !== undefined) expect(s.z).toBeGreaterThanOrEqual(-POCKET.ledge.depth - 1e-9);
    // The level end starts where the arc is still deeper than the ledge.
    expect(arcFloorAt(arcShape(t, 3.175, 3), open.fillFrom)).toBeLessThan(-POCKET.ledge.depth);
  });

  it('is left off a low-angle pocket in stock too thin for a cover over the screw\'s head', () => {
    expect([lowCoverFits(18.65, 3), lowCoverFits(18.65, 6), lowCoverFits(15.5, 3)]).toEqual([true, true, true]);
    expect([lowCoverFits(15.5, 6), lowCoverFits(12.3, 3), lowCoverFits(12.3, 6)]).toEqual([false, false, false]);
  });
});

describe('the printed cover over a low-angle pocket', () => {
  const cover = { thickness: 18.65, bit: len('1/4"').mm, low: { angleDeg: 3 } };

  it('lies in its ledge and is one solid with its rib and hollow', async () => {
    const open = arcLedge(cover.thickness, 3);
    expect(coverSize(cover)).toEqual({ length: open.u1 - open.u0 - 2 * COVER.fit, width: 2 * (open.half - COVER.fit), thickness: POCKET.ledge.depth });
    // From the seat to where the arc meets the face, about 50 mm in 3/4" stock.
    expect(coverSize(cover).length).toBeGreaterThan(45);
    // One plate for every bit's pocket: only the corners follow the ledge's bit.
    expect(coverSize({ ...cover, bit: len('1/8"').mm })).toEqual(coverSize(cover));
    const mesh = await buildPocketCover(cover);
    const max = [0, 0, 0];
    mesh.positions.forEach((v, i) => (max[i % 3] = Math.max(max[i % 3]!, v)));
    const size = coverSize(cover);
    expect(max[0]).toBeCloseTo(size.length, 3);
    expect(max[1]).toBeCloseTo(size.width, 3);
    expect(max[2]).toBeCloseTo(POCKET.ledge.depth + COVER.rib.depth, 3);
    expect(mesh.volume).toBeGreaterThan(0.6 * size.length * size.width * size.thickness);
  });

  it('says so in stock too thin for one', () => {
    expect(pocketCoverProblems(cover)).toEqual([]);
    expect(pocketCoverProblems({ ...cover, thickness: 12.3 })[0]).toMatch(/no cover fits/);
  });
});

describe('the scrap test, low-angle pockets with a ledge', () => {
  it('cuts the ledge with the bit that cut the pocket, after it, no deeper than the ledge outside the pocket', async () => {
    const shop = lowRiderJobShop();
    const plain = buildPocketTest(shop, PLYWOOD_3_4_ID, [{ bit: 'arc', ledge: false, angleDeg: 3 }, { bit: 'arc', ledge: false, angleDeg: 3 }]);
    const ledged = buildPocketTest(shop, PLYWOOD_3_4_ID, [{ bit: 'arc', ledge: true, angleDeg: 3 }, { bit: 'arc', ledge: true, angleDeg: 6 }]);
    expect(ledged.tools.map((t) => t.toolId)).toEqual(plain.tools.map((t) => t.toolId));
    expect(ledged.pockets[0]!.seconds).toBeGreaterThan(plain.pockets[0]!.seconds);
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(ledged.text);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
  });
});
