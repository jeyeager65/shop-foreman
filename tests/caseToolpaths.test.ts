// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { dogBone, outsidePath } from '@/cam/cuts';
import { type Feeds, Path } from '@/cam/path';
import { floorToClear, insideCorners, openSides, widestBit } from '@/geometry/recess';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { cabinetsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { SHELF_PIN_1_4_ID, SOLID_WOOD_3_4_ID } from '@/libraries';
import type { CabinetDesign, ConstructionStyle, Feature, Part, Project, Shop } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

const R = len('1/4"').mm / 2;
const feeds: Feeds = { feed: 1000, plunge: 300, depthPerPass: 3, stepover: 2, finish: 0 };

const cabinetOf = (project: Project) => cabinetsOf(project)[0]!;

function jobFor(style: ConstructionStyle, change?: (cabinet: CabinetDesign, project: Project, shop: Shop) => void) {
  const shop = lowRiderJobShop();
  const project = createBaseCabinetProject(style);
  change?.(cabinetOf(project), project, shop);
  const job = buildJob(project, shop);
  const parts = new Map([...job.parts, ...job.cabinetParts].map((p) => [p.id, p]));
  const op = (key: string) => job.plan.operations.find((o) => o.key === key)!;
  /** The file that cuts a part, the part's corner on its blank, and its blank. */
  const where = (partId: string) => {
    const blank = job.plan.blanks.find((b) => b.partIds.includes(partId))!;
    const setup = blank.setups.at(-1)!;
    const placement = setup.placements.find((p) => p.partId === partId)!;
    const file = job.files[job.programs.findIndex((p) => p.blank.id === blank.id && p.setup.index === setup.index)]!;
    return { blank, placement, file, origin: placement.origin };
  };
  return { job, parts, op, where, shop };
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

const feature = <K extends Feature['kind']>(part: Part, id: string, kind: K) =>
  part.features.find((f): f is Extract<Feature, { kind: K }> => f.id === id && f.kind === kind)!;
const box = (points: { x: number; y: number }[]) => ({
  x0: Math.min(...points.map((p) => p.x)),
  x1: Math.max(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  y1: Math.max(...points.map((p) => p.y)),
});

describe('recess geometry', () => {
  const bounds = { x0: 0, y0: 0, x1: 500, y1: 800 };

  it('finds the sides with no wall: at the edge of the part, or where a deeper recess takes over', () => {
    // A through dado, edge to edge.
    expect(openSides({ x0: 0, x1: 500, y0: 100, y1: 119 }, bounds, [], 6)).toEqual({ x0: true, x1: true, y0: false, y1: false });
    // A housing open at the top and the front; its rear end runs into the back's rabbet.
    const housing = { x0: 380, x1: 494, y0: 781, y1: 800 };
    expect(openSides(housing, bounds, [], 6)).toEqual({ x0: false, x1: false, y0: false, y1: true });
    const rabbet = { rect: { x0: 494, x1: 500, y0: 0, y1: 800 }, depth: 9.5 };
    expect(openSides(housing, bounds, [rabbet], 6)).toEqual({ x0: false, x1: true, y0: false, y1: true });
    // A shallower neighbour leaves a wall standing.
    expect(openSides(housing, bounds, [{ ...rabbet, depth: 3 }], 6).x1).toBe(false);
  });

  it('lets any bit cut a rabbet, and only a bit that fits between the walls cut a groove', () => {
    const rabbet = { x0: 494, x1: 500, y0: 0, y1: 800 };
    expect(widestBit(rabbet, openSides(rabbet, bounds, [], 9))).toBe(Infinity);
    const groove = { x0: 480, x1: 485.5, y0: 0, y1: 800 };
    expect(widestBit(groove, openSides(groove, bounds, [], 6))).toBeCloseTo(5.5, 6);
  });

  it('runs the cut out past an open side, and far enough for a bit wider than the recess', () => {
    const rabbet = { x0: 494, x1: 500, y0: 0, y1: 800 };
    const open = openSides(rabbet, bounds, [], 9);
    // The bit's centre clears the edge by 1 mm: the floor reaches half a bit further.
    expect(floorToClear(rabbet, open, 3)).toEqual({ x0: 494, x1: 502.5, y0: -2.5, y1: 802.5 });
    const wide = floorToClear(rabbet, open, 12);
    expect(wide.x0).toBe(494);
    expect(wide.x1 - wide.x0).toBeGreaterThanOrEqual(12);
  });

  it('finds the inside corners, each with the way into the recess', () => {
    const housing = { x0: 380, x1: 494, y0: 781, y1: 800 };
    expect(insideCorners(housing, { x0: false, x1: true, y0: false, y1: true })).toEqual([{ corner: { x: 380, y: 781 }, inward: { x: 1, y: 1 } }]);
    expect(insideCorners(housing, { x0: true, x1: true, y0: false, y1: false })).toEqual([]);
  });
});

describe('cuts', () => {
  it('follows a notched outline on the outside, clockwise, keeping the bit off the inside corner', () => {
    // An L: a 100 x 200 part with a 30 x 40 notch at its front bottom (x0, y0) corner.
    const outline = [
      { x: 30, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
      { x: 0, y: 40 },
      { x: 30, y: 40 },
    ];
    const loop = outsidePath(outline, 3);
    expect(loop).toEqual([
      { x: 27, y: -3 },
      { x: 27, y: 37 },
      { x: -3, y: 37 },
      { x: -3, y: 203 },
      { x: 103, y: 203 },
      { x: 103, y: -3 },
    ]);
    // The same outline listed the other way round (a mirrored part) gives the same path.
    expect(outsidePath([...outline].reverse(), 3).sort((a, b) => a.x - b.x || a.y - b.y)).toEqual([...loop].sort((a, b) => a.x - b.x || a.y - b.y));
  });

  it('relieves an inside corner until the edge of the bit reaches it', () => {
    const path = new Path(5);
    dogBone(path, { x: 10, y: 20 }, { x: 1, y: -1 }, 6, 6, feeds);
    const cuts = path.steps.filter((s) => s.kind === 'cut' && s.x !== undefined);
    const nearest = Math.min(...cuts.map((s) => Math.hypot((s as { x: number }).x - 10, (s as { y: number }).y - 20)));
    expect(nearest).toBeCloseTo(3, 6);
    // Two levels, each out to the corner and back.
    expect(cuts).toHaveLength(4);
    expect(Math.min(...path.steps.map((s) => ('z' in s && s.z !== undefined ? s.z : 0)))).toBe(-6);
  });
});

describe('the face frame reference cabinet: sides and box walls', () => {
  const { job, parts, op, where } = jobFor('faceFrame');

  it('has a row for each kind of cut, each with its own bit', () => {
    const rows = job.plan.operations.filter((o) => o.key.startsWith('case:') || o.key.startsWith('boxes:'));
    expect(rows.map((o) => [o.key, o.label, o.face, o.clearToolId])).toEqual([
      ['case:holes:shelf-pin@5', 'Case: shelf-pin holes', 'A', 'endmill-1-8'],
      ['case:rabbet', 'Case: back rabbet', 'A', 'endmill-1-4'],
      ['case:cutout', 'Case: cutout', 'A', 'endmill-1-4'],
      ['boxes:holes:front-screw@4.76', 'Drawer box: front screw holes', 'A', 'endmill-1-8'],
      ['boxes:groove', 'Drawer box: bottom groove', 'A', 'endmill-1-8'],
      ['boxes:rabbet', 'Drawer box: corner rabbets', 'A', 'endmill-1-4'],
      ['boxes:cutout', 'Drawer box: cutout', 'A', 'endmill-1-4'],
    ]);
    // A 5 mm hole and a 7/32" groove are too small for the 1/4" bit; a rabbet is open along its side.
    expect(op('case:holes:shelf-pin@5').options.clearToolIds).toEqual(['endmill-1-8', 'endmill-1-16']);
    expect(op('boxes:groove').options.clearToolIds).toEqual(['endmill-1-8', 'endmill-1-16']);
    expect(op('case:rabbet').options.clearToolIds).toEqual(['endmill-1-4', 'endmill-1-8', 'endmill-1-16']);
    expect(rows.every((o) => o.machineSeconds > 0)).toBe(true);
    expect(job.plan.warnings.filter((w) => w.code === 'noCapableTool' || w.code === 'unsupported')).toEqual([]);
  });

  it('leaves the fronts their own rows and bits', () => {
    expect(op('drawerFronts:cutout').source).toEqual({ kind: 'features', refs: [{ partId: 'drawer-1/front', featureId: 'cutout' }] });
    expect(op('doors:hingeCup').source).toMatchObject({ refs: expect.arrayContaining([expect.objectContaining({ partId: 'doors-1/door-left' })]) });
    expect(job.plan.operations.filter((o) => o.kind === 'hingeCup')).toHaveLength(1);
  });

  it('cuts each blank in one setup, inside face up: holes, then the recesses, the cutout last', () => {
    expect(job.plan.blanks.slice(1).map((b) => b.setups.map((s) => [s.faceUp, s.operationKeys.map((k) => k.split(':').slice(1).join(':'))]))).toEqual([
      [['A', ['holes:shelf-pin@5', 'rabbet', 'cutout']]],
      [['A', ['holes:shelf-pin@5', 'rabbet', 'cutout']]],
      [['A', ['holes:front-screw@4.76', 'groove', 'rabbet', 'cutout']]],
    ]);
    const side = where('cabinet-1/side-left').file.text;
    const status = side.split('\n').flatMap((l) => /\(MSG, (\d+\/\d+ T\d+ .+?) - ~/.exec(l)?.[1] ?? []);
    expect(status).toEqual(['1/3 T1 Case: shelf-pin holes', '2/3 T2 Case: back rabbet', '3/3 T2 Case: cutout']);
    expect(side).toContain('Blank 2 of 4, setup 1 of 1: inside face up');
    expect(side).toContain('M0 (MSG, Router OFF. Blank 2 of 4 done.)');
  });

  it('helixes every shelf-pin hole to its depth, where the hole is', () => {
    const { file, origin } = where('cabinet-1/side-left');
    const side = parts.get('cabinet-1/side-left')!;
    const holes = side.features.filter((f): f is Extract<Feature, { kind: 'hole' }> => f.kind === 'hole');
    expect(holes).toHaveLength(20);
    const cuts = section(file.text, 'shelf-pin holes').filter((m) => m.cut && m.z < 0);
    for (const hole of holes) {
      const c = { x: origin.x + hole.center.x, y: origin.y + hole.center.y };
      const reach = (hole.diameter - len('1/8"').mm) / 2;
      const own = cuts.filter((m) => Math.hypot(m.x - c.x, m.y - c.y) <= reach + 0.002);
      expect(own.length, hole.id).toBeGreaterThan(4);
      expect(Math.min(...own.map((m) => m.z))).toBeCloseTo(-hole.depth, 3);
      expect(Math.max(...own.map((m) => Math.hypot(m.x - c.x, m.y - c.y)))).toBeCloseTo(reach, 2);
    }
    // Nothing is cut anywhere else.
    expect(cuts.every((m) => holes.some((h) => Math.hypot(m.x - origin.x - h.center.x, m.y - origin.y - h.center.y) < h.diameter / 2))).toBe(true);
  });

  it("cuts the back's rabbet to its wall and depth, and runs out past the rear edge and both ends", () => {
    const { file, origin } = where('cabinet-1/side-left');
    const side = parts.get('cabinet-1/side-left')!;
    const rabbet = feature(side, 'rabbet-back', 'dado');
    const wall = origin.x + Math.min(...rabbet.outline.map((p) => p.x));
    const cuts = section(file.text, 'back rabbet').filter((m) => m.cut && m.z < 0);
    const reach = box(cuts);
    expect(Math.min(...cuts.map((m) => m.z))).toBeCloseTo(-rabbet.depth, 3);
    // The bit's edge stops at the rabbet's wall.
    expect(reach.x0 - R).toBeCloseTo(wall, 3);
    // Its centre passes the part's rear edge and both ends.
    expect(reach.x1).toBeGreaterThan(origin.x + side.size.width);
    expect(reach.y0).toBeLessThan(origin.y);
    expect(reach.y1).toBeGreaterThan(origin.y + side.size.height);
  });

  it('cuts the side out round its toe-kick notch, leaving the notch corner the radius of the bit', () => {
    const { file, origin } = where('cabinet-1/side-left');
    const side = parts.get('cabinet-1/side-left')!;
    const outline = feature(side, 'cutout', 'cutout').outline;
    expect(outline).toHaveLength(6);
    const xs = [...new Set(outline.map((p) => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(outline.map((p) => p.y))].sort((a, b) => a - b);
    // The notch is at the front bottom corner: 3" back and 4-1/2" up.
    expect([xs[1], ys[1]]).toEqual([len('3"').mm, len('4-1/2"').mm]);
    const cuts = section(file.text, 'Case: cutout').filter((m) => m.cut && m.z < 0);
    const inside = (m: Move) => {
      const x = m.x - origin.x;
      const y = m.y - origin.y;
      const inBounds = x > -R + 0.01 && x < side.size.width + R - 0.01 && y > -R + 0.01 && y < side.size.height + R - 0.01;
      const inNotch = x < xs[1]! - R + 0.01 && y < ys[1]! - R + 0.01;
      return inBounds && !inNotch;
    };
    // The bit's centre never comes closer to the part than its radius.
    expect(cuts.filter(inside)).toEqual([]);
    // The last lap is on the line: it turns in the notch a radius off both of its walls.
    const corner = { x: origin.x + xs[1]! - R, y: origin.y + ys[1]! - R };
    expect(cuts.some((m) => Math.hypot(m.x - corner.x, m.y - corner.y) < 0.002)).toBe(true);
    expect(Math.min(...cuts.map((m) => m.z))).toBeCloseTo(-side.size.thickness - THROUGH_EXTRA, 3);
    // Tabs: the last passes rise over them.
    expect(new Set(cuts.map((m) => Number(m.z.toFixed(2)))).size).toBeGreaterThan(6);
  });

  it('cuts the box walls where they lie turned: grooves with the 1/8" bit, rabbets across the ends, screw holes through', () => {
    const { file, origin, placement, blank } = where('drawer-1/box-front');
    expect(placement.turned).toBe(true);
    const front = parts.get('drawer-1/box-front')!;
    // Turned: the part's width runs along the blank's Y.
    const lying = { x0: origin.x, x1: origin.x + front.size.height, y0: origin.y, y1: origin.y + front.size.width };
    const holes = section(file.text, 'front screw holes').filter((m) => m.cut && m.z < 0);
    expect(holes.length).toBeGreaterThan(16);
    for (const m of holes) {
      expect(m.x).toBeGreaterThan(lying.x0);
      expect(m.x).toBeLessThan(lying.x1);
      expect(m.y).toBeGreaterThan(lying.y0);
      expect(m.y).toBeLessThan(lying.y1);
    }
    expect(Math.min(...holes.map((m) => m.z))).toBeCloseTo(-front.size.thickness - THROUGH_EXTRA, 3);
    const grooves = section(file.text, 'bottom groove').filter((m) => m.cut && m.z < 0);
    expect(Math.min(...grooves.map((m) => m.z))).toBeCloseTo(-feature(front, 'box-groove', 'dado').depth, 3);
    // Every file stays on its blank and above the spoilboard.
    for (const m of [...holes, ...grooves, ...section(file.text, 'corner rabbets'), ...section(file.text, 'Drawer box: cutout')]) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(blank.size.width);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(blank.size.height);
      expect(m.z).toBeGreaterThanOrEqual(-blank.size.thickness - THROUGH_EXTRA - 1e-6);
    }
  });

  it('writes files that follow the post rules and parse in cnc-gcode-tools', async () => {
    expect(job.files).toHaveLength(5);
    for (const [i, file] of job.files.entries()) {
      const { blank } = job.programs[i]!;
      const planned = job.plan.blanks.find((b) => b.id === blank.id)!;
      expect(file.text).not.toMatch(/^M[345]\b/m);
      for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
      // A probe at the start and after every bit change.
      const probes = (file.text.match(/^G38\.2 Z-80 F180 P0\.5/gm) ?? []).length;
      expect(probes).toBe((file.text.match(/attach the probe/gi) ?? []).length);
      expect(probes).toBeGreaterThanOrEqual(job.programs[i]!.toolIds.length);
      // Only the fronts' pin holes go below the stock.
      const deepest = Math.min(...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      if (blank.index > 1) expect(deepest).toBeGreaterThanOrEqual(-planned.size.thickness - THROUGH_EXTRA - 1e-6);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  });
});

describe('dado joints', () => {
  const { job, parts, op, where } = jobFor('frameless', (cabinet) => {
    cabinet.joinery.case = 'dado';
  });

  it('adds a dado row with the 1/4" bit, before the rabbet', () => {
    expect(op('case:dado')).toMatchObject({ label: 'Case: dados', clearToolId: 'endmill-1-4' });
    const keys = job.plan.blanks.find((b) => b.partIds.includes('cabinet-1/side-left'))!.setups[0]!.operationKeys;
    expect(keys).toEqual(['case:holes:shelf-pin@5', 'case:holes:hinge-plate@5', 'case:dado', 'case:rabbet', 'case:cutout']);
  });

  it('dog-bones the one inside corner of each stretcher housing, and nothing on the through dado', () => {
    const { file, origin } = where('cabinet-1/side-left');
    const side = parts.get('cabinet-1/side-left')!;
    const cuts = section(file.text, 'Case: dados').filter((m) => m.cut && m.z < 0);
    const bounds = { x0: 0, y0: 0, x1: side.size.width, y1: side.size.height };
    const dados = side.features.filter((f): f is Extract<Feature, { kind: 'dado' }> => f.kind === 'dado');
    const relieved: string[] = [];
    for (const dado of dados.filter((d) => d.id.startsWith('dado-'))) {
      const rect = box(dado.outline);
      const others = dados.filter((d) => d.id !== dado.id).map((d) => ({ rect: box(d.outline), depth: d.depth }));
      const corners = insideCorners(rect, openSides(rect, bounds, others, dado.depth));
      for (const { corner, inward } of corners) {
        // The bit's centre comes within its radius of the corner: its edge reaches it.
        const tip = { x: origin.x + corner.x + (inward.x * R) / Math.SQRT2, y: origin.y + corner.y + (inward.y * R) / Math.SQRT2 };
        expect(cuts.some((m) => Math.hypot(m.x - tip.x, m.y - tip.y) < 0.002 && Math.abs(m.z + dado.depth) < 0.002), dado.id).toBe(true);
        relieved.push(dado.id);
      }
      // No cut goes past a wall of the dado, but for the relief.
      const floor = { x0: origin.x + rect.x0, x1: origin.x + rect.x1, y0: origin.y + rect.y0, y1: origin.y + rect.y1 };
      const near = cuts.filter((m) => m.x > floor.x0 - 20 && m.x < floor.x1 + 20 && m.y > floor.y0 - 20 && m.y < floor.y1 + 20);
      expect(near.length, dado.id).toBeGreaterThan(8);
      expect(Math.min(...near.map((m) => m.z))).toBeCloseTo(-dado.depth, 3);
    }
    expect(relieved.sort()).toEqual(['dado-stretcher-back', 'dado-stretcher-front']);
  });

  it('keeps the 1/4" bit on the dados when the back sits in a groove, which takes the 1/8"', () => {
    const grooved = jobFor('frameless', (cabinet) => {
      cabinet.joinery.case = 'dado';
      cabinet.joinery.back = 'groove';
    });
    expect(grooved.op('case:groove')).toMatchObject({ label: 'Case: back groove', clearToolId: 'endmill-1-8' });
    expect(grooved.op('case:groove').options.clearToolIds).toEqual(['endmill-1-8', 'endmill-1-16']);
    expect(grooved.op('case:dado').clearToolId).toBe('endmill-1-4');
    // The groove goes with the holes, before the bit change.
    expect(grooved.job.plan.blanks.find((b) => b.partIds.includes('cabinet-1/side-left'))!.setups[0]!.operationKeys.map((k) => k.split(':').slice(1).join(':'))).toEqual([
      'holes:shelf-pin@5',
      'holes:hinge-plate@5',
      'groove',
      'dado',
      'cutout',
    ]);
    expect(grooved.job.plan.warnings.filter((w) => w.code === 'unsupported')).toEqual([]);
  });
});

describe('bits', () => {
  it('peck drills a 1/4" shelf-pin hole with the 1/4" bit, so a side needs no bit change', () => {
    const { job, op, where } = jobFor('faceFrame', (cabinet) => {
      cabinet.shelfPinId = SHELF_PIN_1_4_ID;
    });
    expect(op('case:holes:shelf-pin@6.35').options.clearToolIds).toEqual(['endmill-1-4', 'endmill-1-8', 'endmill-1-16']);
    expect(op('case:holes:shelf-pin@6.35').clearToolId).toBe('endmill-1-4');
    const { file } = where('cabinet-1/side-left');
    expect((file.text.match(/^G38\.2 Z-80/gm) ?? []).length).toBe(1);
    // Straight down and up: every cut of a hole is at its centre.
    const cuts = section(file.text, 'shelf-pin holes').filter((m) => m.cut && m.z < 0);
    expect(new Set(cuts.map((m) => `${m.x.toFixed(3)},${m.y.toFixed(3)}`)).size).toBe(20);
    expect(job.plan.warnings.filter((w) => w.code === 'unsupported')).toEqual([]);
  });

  it('picks one bit for the case and one for the box, with "fewest bit changes"', () => {
    const { job, op, where } = jobFor('faceFrame', (_cabinet, project) => {
      project.plan.strategy = 'fewestBitChanges';
    });
    const plain = jobFor('faceFrame');
    for (const key of ['case:holes:shelf-pin@5', 'case:rabbet', 'case:cutout', 'boxes:rabbet', 'boxes:cutout']) {
      expect(op(key).clearToolId, key).toBe('endmill-1-8');
    }
    expect((where('cabinet-1/side-left').file.text.match(/^G38\.2 Z-80/gm) ?? []).length).toBe(1);
    expect(job.plan.summary.toolChanges).toBeLessThan(plain.job.plan.summary.toolChanges);
  });

  it('has a 1/16" end mill', () => {
    const shop = lowRiderJobShop();
    expect(shop.tools.map((t) => t.id)).toContain('endmill-1-16');
  });

  it('cuts a face frame out on the CNC in a shop with no saw', () => {
    const { job } = jobFor('faceFrame', (_cabinet, _project, shop) => {
      shop.saws.tableSaw.owned = false;
      shop.saws.circularSaw.owned = false;
      shop.saws.miterSaw.owned = false;
    });
    expect(job.plan.blanks.some((b) => b.materialId === SOLID_WOOD_3_4_ID)).toBe(true);
    expect(job.plan.warnings.filter((w) => w.code === 'unsupported' || w.code === 'noCapableTool')).toEqual([]);
  });
});
