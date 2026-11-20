// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bullWidth, cutWidth, deriveParts, flutesFor, patternFeatures, patternLines, ripplesFor, shopFor, starterPattern } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, DoorStyle, Feature, FrontPattern, PlanWarning, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * Patterns cut into doors and drawer fronts: V-grooves laid out several ways, flutes with a
 * ball nose, and a frame-and-panel look in V-grooves.
 */
const profile = createStarterShopProfile();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const slots = (features: Feature[]) => features.filter((f): f is Extract<Feature, { kind: 'slot' }> => f.kind === 'slot');
const box = { x0: 0, y0: 0, x1: 400, y1: 700 };
/** Grooves with no margin: from edge to edge. */
const grooves = (layout: Extract<FrontPattern, { kind: 'grooves' }>['layout'], spacing = '4"'): FrontPattern => ({ ...starterPattern('grooves'), layout, spacing: len(spacing), margin: len('0"') } as FrontPattern);
const slab = (pattern?: FrontPattern): DoorStyle => ({ kind: 'slab', ...(pattern ? { pattern } : {}) });
const shaker = (pattern?: FrontPattern): DoorStyle => ({ kind: 'shaker', frameWidth: len('2-1/4"'), recessDepth: len('1/4"'), insideEdge: { kind: 'square' }, floorCornerRadius: len('1/16"'), ...(pattern ? { pattern } : {}) });

describe('the lines of a pattern', () => {
  it('planks: equal planks about the spacing wide, the lines between them, from edge to edge', () => {
    const upright = patternLines(grooves('vertical'), box);
    // 400 mm in planks about 4" wide: four planks, three lines.
    expect(upright.map((l) => l[0]!.x)).toEqual([100, 200, 300]);
    expect(upright.every((l) => l[0]!.y === 0 && l[1]!.y === 700)).toBe(true);
    const level = patternLines(grooves('horizontal'), box);
    expect(level).toHaveLength(6);
    expect(level.every((l) => l[0]!.x === 0 && l[1]!.x === 400 && l[0]!.y === l[1]!.y)).toBe(true);
    expect(level[1]![0]!.y - level[0]![0]!.y).toBeCloseTo(100, 6);
  });

  it('a grid is both; diamonds are both diagonals', () => {
    expect(patternLines(grooves('grid'), box)).toHaveLength(3 + 6);
    const one = patternLines(grooves('diagonal'), box);
    const two = patternLines(grooves('diamond'), box);
    expect(two).toHaveLength(2 * one.length);
  });

  it('diagonals: at 45 degrees, the spacing apart square to themselves, one through the middle, inside the box; mirrored, they lean the other way', () => {
    const lines = patternLines(grooves('diagonal'), box);
    expect(lines.length).toBeGreaterThan(6);
    for (const [a, b] of lines as [{ x: number; y: number }, { x: number; y: number }][]) {
      expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 6);
      expect((b.x - a.x) * (b.y - a.y)).toBeGreaterThan(0);
      for (const p of [a, b]) expect(p.x >= -1e-6 && p.x <= 400 + 1e-6 && p.y >= -1e-6 && p.y <= 700 + 1e-6).toBe(true);
    }
    // x - y is the same along one, and steps by the spacing times root two from one to the next.
    const offsets = lines.map(([a]) => a!.x - a!.y).sort((p, q) => p - q);
    expect(offsets[1]! - offsets[0]!).toBeCloseTo(len('4"').mm * Math.SQRT2, 6);
    expect(offsets.some((o) => Math.abs(o - (200 - 350)) < 1e-6)).toBe(true);
    const mirrored = patternLines(grooves('diagonal'), box, 'right');
    expect(mirrored).toHaveLength(lines.length);
    expect(mirrored.every(([a, b]) => (b!.x - a!.x) * (b!.y - a!.y) < 0)).toBe(true);
  });

  it('chevrons: arms down to either side of the middle line, meeting on it, the same either side', () => {
    const lines = patternLines(grooves('chevron'), box);
    const [left, right] = [lines.filter((l) => Math.min(l[0]!.x, l[1]!.x) < 200 - 1e-6), lines.filter((l) => Math.max(l[0]!.x, l[1]!.x) > 200 + 1e-6)];
    expect(left.length).toBe(right.length);
    expect(left.length + right.length).toBe(lines.length);
    // Every arm that reaches the middle line meets its fellow there.
    const tips = (arms: typeof lines) => arms.flatMap((l) => l.filter((p) => Math.abs(p.x - 200) < 1e-6).map((p) => Math.round(p.y * 1000))).sort((a, b) => a - b);
    expect(tips(left)).toEqual(tips(right));
    expect(tips(left).length).toBeGreaterThan(4);
    // The middle is the high point of each.
    for (const l of lines) {
      const [mid, out] = Math.abs(l[0]!.x - 200) < Math.abs(l[1]!.x - 200) ? [l[0]!, l[1]!] : [l[1]!, l[0]!];
      expect(mid.y).toBeGreaterThan(out.y);
    }
  });

  it('flutes: as many as fit, their pitch apart, the same margin either side', () => {
    const flutes = flutesFor(6.35, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>);
    const xs = patternLines(flutes, box).map((l) => l[0]!.x);
    expect(xs.length).toBe(Math.floor((400 - cutWidth(flutes)) / flutes.spacing.mm) + 1);
    expect(xs[1]! - xs[0]!).toBeCloseTo(flutes.spacing.mm, 6);
    expect(xs[0]!).toBeCloseTo(400 - xs.at(-1)!, 6);
    expect(patternLines({ ...flutes, direction: 'horizontal' }, box).every((l) => l[0]!.y === l[1]!.y)).toBe(true);
  });

  it('the frame look: a closed rectangle in from the edges, or several one over another with the same space between', () => {
    const frame = starterPattern('frame') as Extract<FrontPattern, { kind: 'frame' }>;
    const [one] = patternLines(frame, box);
    const inset = frame.inset.mm;
    expect(one).toEqual([{ x: inset, y: inset }, { x: 400 - inset, y: inset }, { x: 400 - inset, y: 700 - inset }, { x: inset, y: 700 - inset }, { x: inset, y: inset }]);
    const three = patternLines({ ...frame, panels: 3 }, box);
    expect(three).toHaveLength(3);
    expect(three[1]![0]!.y - three[0]![2]!.y).toBeCloseTo(inset, 6);
    expect(three[2]![2]!.y).toBeCloseTo(700 - inset, 6);
  });
});

describe('the second batch of patterns', () => {
  it('a sunburst: rays from the middle of the bottom, starting a little out from it; on a pair, from the corner where the two doors meet', () => {
    const one = patternLines(grooves('sunburst', '3"'), box);
    expect(one.length).toBeGreaterThan(8);
    const from = { x: 200, y: 0 };
    for (const [a, b] of one as [{ x: number; y: number }, { x: number; y: number }][]) {
      // Each is on a line through the point, and starts a spacing out from it.
      const cross = (a.x - from.x) * (b.y - from.y) - (a.y - from.y) * (b.x - from.x);
      expect(Math.abs(cross)).toBeLessThan(1e-3);
      expect(Math.hypot(a.x - from.x, a.y - from.y)).toBeCloseTo(len('3"').mm, 4);
    }
    // The same either side of the middle.
    expect(one.filter(([, b]) => b!.x < 200 - 1e-6).length).toBe(one.filter(([, b]) => b!.x > 200 + 1e-6).length);
    const left = patternLines(grooves('sunburst', '3"'), box, 'left');
    const right = patternLines(grooves('sunburst', '3"'), box, 'right');
    expect(left.length).toBe(right.length);
    expect(left.every(([a]) => Math.hypot(a!.x - 400, a!.y) < len('3"').mm + 1e-3)).toBe(true);
    expect(right.every(([a]) => Math.hypot(a!.x, a!.y) < len('3"').mm + 1e-3)).toBe(true);
  });

  it('rectangles one inside another: each a spacing inside the last, closed, down to the middle', () => {
    const rects = patternLines(grooves('rectangles', '2"'), box);
    // 400 wide: 50.8, 101.6 and 152.4 in; 203.2 would cross.
    expect(rects).toHaveLength(3);
    rects.forEach((r, i) => {
      const k = (i + 1) * 50.8;
      expect(r).toEqual([{ x: k, y: k }, { x: 400 - k, y: k }, { x: 400 - k, y: 700 - k }, { x: k, y: 700 - k }, { x: k, y: k }]);
    });
  });

  it('waves: upright lines that sway a quarter of the spacing either way, in short straight pieces, inside the box', () => {
    const waves = patternLines(grooves('waves', '4"'), box);
    expect(waves).toHaveLength(3);
    for (const [i, w] of waves.entries()) {
      const mid = 100 * (i + 1);
      expect(w.length).toBeGreaterThan(50);
      expect(Math.max(...w.map((p) => p.x)) - mid).toBeCloseTo(len('4"').mm / 4, 0);
      expect(mid - Math.min(...w.map((p) => p.x))).toBeCloseTo(len('4"').mm / 4, 0);
      expect(w[0]!.y).toBe(0);
      expect(w.at(-1)!.y).toBe(700);
      expect(w.every((p, k) => k === 0 || p.y > w[k - 1]!.y)).toBe(true);
    }
  });

  it('reeded flutes overlap and leave a ridge; wavy ones sway and stay in the box', () => {
    const base = flutesFor(6.35, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>);
    const reeded = flutesFor(6.35, { ...base, reeded: true });
    expect(reeded.spacing.mm).toBeLessThan(cutWidth(reeded));
    const xs = patternLines(reeded, box).map((l) => l[0]!.x);
    expect(xs[1]! - xs[0]!).toBeCloseTo(reeded.spacing.mm, 6);
    expect(xs.length).toBeGreaterThan(patternLines(base, box).length);
    const wavy = patternLines({ ...base, wavy: true }, box);
    expect(wavy.length).toBeGreaterThan(10);
    for (const w of wavy) {
      expect(w.length).toBeGreaterThan(50);
      expect(Math.max(...w.map((p) => p.x)) - Math.min(...w.map((p) => p.x))).toBeGreaterThan(base.spacing.mm);
      expect(w.every((p) => p.x >= 0 && p.x <= 400)).toBe(true);
    }
  });

  it('dimples: a plunge each, in rows, every other row shifted by half the spacing, all clear of the edges', () => {
    const dimples = starterPattern('dimples', 6.35) as Extract<FrontPattern, { kind: 'dimples' }>;
    expect(dimples).toMatchObject({ width: { mm: 6.35 }, spacing: { mm: 25.4 } });
    const cut = slots(patternFeatures(slab(dimples), { width: 400, height: 700 }, 19));
    expect(cut.length).toBeGreaterThan(200);
    const wide = cutWidth(dimples);
    for (const f of cut) {
      expect(f.profile).toEqual({ kind: 'round', diameter: 6.35 });
      expect(Math.hypot(f.path[1]!.x - f.path[0]!.x, f.path[1]!.y - f.path[0]!.y)).toBeLessThan(1);
      for (const p of f.path) expect(p.x > wide / 2 && p.x < 400 - wide / 2 && p.y > wide / 2 && p.y < 700 - wide / 2).toBe(true);
    }
    const rows = [...new Set(cut.map((f) => Math.round(f.path[0]!.y * 100)))].sort((a, b) => a - b);
    const row = (k: number) => cut.filter((f) => Math.round(f.path[0]!.y * 100) === rows[k]).map((f) => (f.path[0]!.x + f.path[1]!.x) / 2).sort((a, b) => a - b);
    expect(row(0)[1]! - row(0)[0]!).toBeCloseTo(25.4, 4);
    expect(Math.abs(row(1)[0]! - row(0)[0]!)).toBeCloseTo(12.7, 4);
  });

  it('channels: flat ones have no shape of a bit (an end mill clears them); soft ones are a bull nose’s, as wide as it', () => {
    const channels = starterPattern('channels') as Extract<FrontPattern, { kind: 'channels' }>;
    const plain = slots(patternFeatures(slab(channels), { width: 400, height: 700 }, 19));
    expect(plain.length).toBeGreaterThan(10);
    expect(plain.every((f) => f.profile === undefined && f.width === channels.width.mm && f.depth === channels.depth.mm)).toBe(true);
    expect(plain[1]!.path[0]!.x - plain[0]!.path[0]!.x).toBeCloseTo(channels.spacing.mm, 6);
    const soft = slots(patternFeatures(slab({ ...channels, soft: true, width: len('3/8"'), corner: len('1/8"') }), { width: 400, height: 700 }, 19));
    expect(soft.length).toBeGreaterThan(5);
    expect(soft.every((f) => f.profile?.kind === 'bull' && Math.abs(f.profile.diameter - 9.525) < 1e-6 && Math.abs(f.profile.cornerRadius - 3.175) < 1e-6)).toBe(true);
    // A bull nose is a flat floor between two round corners: as deep as a corner is round or deeper, it cuts its full
    // width; shallower, its flat and the foot of each corner.
    expect(bullWidth(9.525, 3.175, 3.175)).toBeCloseTo(9.525, 6);
    expect(bullWidth(9.525, 3.175, 6)).toBeCloseTo(9.525, 6);
    expect(bullWidth(9.525, 3.175, 0)).toBeCloseTo(3.175, 6);
    expect(bullWidth(9.525, 3.175, 1)).toBeCloseTo(3.175 + 2 * Math.sqrt(1 * (6.35 - 1)), 6);
    expect(soft[0]!.width).toBeCloseTo(9.525, 6);
  });
});

describe('ripples: lines whose depth rises and falls, each half a wave on from the next', () => {
  type Ripples = Extract<FrontPattern, { kind: 'ripples' }>;
  const ripples = starterPattern('ripples') as Ripples;

  it('starts with the V-bit, 1/8" at its deepest, a wave an inch long, the lines as far apart as a cut is wide at its deepest', () => {
    expect(ripples).toMatchObject({ bit: 'v', angleDeg: 90, depth: { mm: 3.175 }, wave: { mm: 25.4 } });
    expect(ripples.spacing.mm).toBeCloseTo(cutWidth(ripples), 6);
    expect(cutWidth(ripples)).toBeCloseTo(6.35, 6);
    // With a ball nose the lines are as far apart as the ball is wide once the cut is half the ball deep or more.
    const round = ripplesFor({ ...ripples, bit: 'round', width: len('1/4"') });
    expect(round.depth.mm).toBeCloseTo(3.175, 6);
    expect(round.spacing.mm).toBeCloseTo(6.35, 6);
    // A 1/8" ball nose 1/8" deep: the depth stands,
    // deeper than the ball is round, and the lines are the ball's width apart.
    const small = ripplesFor({ ...ripples, bit: 'round', width: len('1/8"') });
    expect(small.depth.mm).toBeCloseTo(3.175, 6);
    expect(small.spacing.mm).toBeCloseTo(3.175, 6);
    const cut = slots(patternFeatures(slab(small), { width: 400, height: 700 }, 19));
    expect(cut.length).toBeGreaterThan(50);
    expect(Math.max(...cut[0]!.depths!)).toBeGreaterThan(3.1);
  });

  it('each line has a depth at every point: from nothing to the deepest and back every wave, and the next line is half a wave on', () => {
    const cut = slots(patternFeatures(slab({ ...ripples, margin: len('1"') }), { width: 400, height: 700 }, 19));
    expect(cut.length).toBeGreaterThan(40);
    const [a, b, c] = cut;
    for (const f of [a!, b!, c!]) {
      expect(f.profile).toEqual({ kind: 'v', angleDeg: 90 });
      expect(f.depths).toHaveLength(f.path.length);
      expect(f.depth).toBeCloseTo(3.175, 6);
      expect(Math.max(...f.depths!)).toBeLessThanOrEqual(3.175 + 1e-9);
      expect(Math.max(...f.depths!)).toBeGreaterThan(3.1);
      expect(Math.min(...f.depths!)).toBeLessThan(0.05);
      // Straight, in short pieces.
      expect(f.path.every((p) => p.x === f.path[0]!.x)).toBe(true);
      expect(f.path[1]!.y - f.path[0]!.y).toBeLessThan(3.01);
    }
    // Where the first is shallowest the second is deepest, and the third is as the first.
    expect(a!.depths![0]).toBeCloseTo(0, 6);
    expect(b!.depths![0]).toBeCloseTo(3.175, 6);
    expect(c!.depths).toEqual(a!.depths);
    const at = (f: typeof a, y: number) => f!.depths![f!.path.findIndex((p) => p.y >= y)]!;
    const y = a!.path[0]!.y + 12.7;
    expect(at(a, y)).toBeGreaterThan(2.9);
    expect(at(b, y)).toBeLessThan(0.3);
    expect(b!.path[0]!.x - a!.path[0]!.x).toBeCloseTo(ripples.spacing.mm, 6);
  });

  it('in a shaker panel its depths are from the face, below the panel floor', () => {
    const cut = slots(patternFeatures(shaker({ ...ripples, margin: len('1/2"') }), { width: 400, height: 700 }, 19));
    expect(cut.length).toBeGreaterThan(10);
    expect(cut[0]!.top).toBeCloseTo(6.35, 6);
    expect(Math.min(...cut[0]!.depths!)).toBeGreaterThanOrEqual(6.35 - 1e-9);
    expect(Math.max(...cut[0]!.depths!)).toBeCloseTo(6.35 + 3.175, 2);
  });

  it('the bit follows the depth: every cutting move of the row is between the face and the deepest, and most are on a slope', async () => {
    const project = createBaseCabinetProject('frameless');
    const fronts = (project.context as CasesContext).fronts;
    for (const front of [fronts.doors, fronts.drawers.front]) front.style = slab(ripples);
    const job = buildJob(project, createStarterShop());
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const row = job.plan.operations.find((o) => o.kind === 'slot')!;
    expect(row.clearToolId).toBe('vbit-90');
    const front = job.files.find((f) => f.text.includes('pattern grooves'))!;
    const lines = front.text.split('\n');
    const from = lines.findIndex((l) => l.includes('pattern grooves') && l.startsWith('(MSG'));
    const to = lines.findIndex((l, i) => i > from && l.startsWith('M0'));
    const cuts = lines.slice(from, to).filter((l) => /^G1 .*X.*Z/.test(l));
    expect(cuts.length).toBeGreaterThan(1000);
    const zs = cuts.map((l) => Number(/Z(-?[\d.]+)/.exec(l)![1]));
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-3.176);
    expect(Math.min(...zs)).toBeLessThan(-3.1);
    expect(Math.max(...zs)).toBeLessThanOrEqual(0);
    for (const file of job.files) {
      for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  }, 120000);
});

describe('the faux frame: a pattern starts a frame’s width in from a slab’s edges', () => {
  it('every kind starts 2-1/4" in, which clears the hinge cups', () => {
    for (const kind of ['grooves', 'flutes', 'dimples', 'channels', 'ripples'] as const) {
      const pattern = starterPattern(kind, 6.35);
      expect('margin' in pattern && pattern.margin.mm, kind).toBeCloseTo(57.15, 6);
    }
    expect((starterPattern('frame') as Extract<FrontPattern, { kind: 'frame' }>).inset.mm).toBeCloseTo(57.15, 6);
    // A real door: no line of its pattern is over a hinge cup on its back, with room to spare.
    const project = createBaseCabinetProject('frameless');
    const fronts = (project.context as CasesContext).fronts;
    fronts.doors.style = slab(starterPattern('grooves'));
    for (const door of deriveParts(project, shopFor(project, profile)).filter((p) => p.id.includes('/door'))) {
      const cups = door.features.filter((f) => f.kind === 'cup');
      expect(cups.length).toBeGreaterThan(0);
      for (const f of slots(door.features)) for (const p of f.path) for (const cup of cups) {
        if (cup.kind !== 'cup') continue;
        expect(Math.hypot(p.x - cup.center.x, p.y - cup.center.y) - cup.diameter / 2 - f.width / 2).toBeGreaterThan(10);
      }
    }
  });
});

describe('the rectangle round a pattern, carved too', () => {
  it('on a slab with a margin: one more cut, the rectangle the pattern stops at, with the pattern’s own bit to its depth', () => {
    for (const kind of ['grooves', 'flutes', 'dimples', 'channels', 'ripples'] as const) {
      const pattern = starterPattern(kind, 6.35);
      const plain = slots(patternFeatures(slab(pattern), { width: 400, height: 700 }, 19));
      const framed = slots(patternFeatures(slab({ ...pattern, border: true } as FrontPattern), { width: 400, height: 700 }, 19));
      expect(framed.length, kind).toBe(plain.length + 1);
      const border = framed.at(-1)!;
      const m = 57.15;
      expect(border.id).toBe('pattern-border');
      expect(border.path, kind).toEqual([{ x: m, y: m }, { x: 400 - m, y: m }, { x: 400 - m, y: 700 - m }, { x: m, y: 700 - m }, { x: m, y: m }]);
      expect(border.profile, kind).toEqual(plain[0]!.profile);
      expect(border.depth, kind).toBeCloseTo(pattern.depth.mm, 6);
      expect(border.depths).toBeUndefined();
    }
  });

  it('none with no margin, and none on a shaker front, which has its frame', () => {
    const edge = { ...(starterPattern('grooves') as Extract<FrontPattern, { kind: 'grooves' }>), margin: len('0"'), border: true };
    expect(slots(patternFeatures(slab(edge), { width: 400, height: 700 }, 19)).some((f) => f.id === 'pattern-border')).toBe(false);
    const inPanel = { ...(starterPattern('grooves') as Extract<FrontPattern, { kind: 'grooves' }>), margin: len('1/2"'), border: true };
    expect(slots(patternFeatures(shaker(inPanel), { width: 400, height: 700 }, 19)).some((f) => f.id === 'pattern-border')).toBe(false);
  });
});

describe('a pattern as features of a front', () => {
  it('none: nothing', () => {
    expect(patternFeatures(slab(), { width: 400, height: 700 }, 19)).toEqual([]);
  });

  it('V-grooves on a slab: a slot for each line, as wide at the face as a V of its angle comes at its depth', () => {
    const pattern = grooves('vertical');
    const cut = slots(patternFeatures(slab(pattern), { width: 400, height: 700 }, 19));
    expect(cut).toHaveLength(3);
    const depth = (pattern as { depth: { mm: number } }).depth.mm;
    for (const f of cut) {
      expect(f).toMatchObject({ face: 'A', depth, profile: { kind: 'v', angleDeg: 90 } });
      expect(f.width).toBeCloseTo(2 * depth, 6);
      expect(f.top).toBeUndefined();
    }
    expect(cutWidth({ ...(pattern as Extract<FrontPattern, { kind: 'grooves' }>), angleDeg: 60 })).toBeCloseTo(2 * depth * Math.tan(Math.PI / 6), 6);
    // A margin keeps them in from the edges.
    const inset = slots(patternFeatures(slab({ ...(pattern as Extract<FrontPattern, { kind: 'grooves' }>), margin: len('1"') }), { width: 400, height: 700 }, 19));
    expect(inset.every((f) => f.path[0]!.y === 25.4 && f.path[1]!.y === 700 - 25.4)).toBe(true);
  });

  it('flutes on a shaker front: on the floor of its panel, cut down from there, clear of its walls', () => {
    const flutes = flutesFor(6.35, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>);
    const style = shaker(flutes);
    const cut = slots(patternFeatures(style, { width: 400, height: 700 }, 19));
    expect(cut.length).toBeGreaterThan(10);
    const frame = len('2-1/4"').mm;
    const wide = cutWidth(flutes);
    for (const f of cut) {
      expect(f.profile).toEqual({ kind: 'round', diameter: 6.35 });
      expect(f.top).toBeCloseTo(6.35, 6);
      expect(f.depth).toBeCloseTo(6.35 + flutes.depth.mm, 6);
      expect(f.width).toBeCloseTo(wide, 6);
      for (const p of f.path) {
        expect(p.x - wide / 2).toBeGreaterThanOrEqual(frame + flutes.margin.mm - 1e-6);
        expect(p.x + wide / 2).toBeLessThanOrEqual(400 - frame - flutes.margin.mm + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(frame + flutes.margin.mm - 1e-6);
      }
    }
    // It starts 1/8" deep: half of a 1/4" ball, so as wide as its bit. Shallower than its radius it is a part of a circle, and narrower.
    expect(flutes.depth.mm).toBeCloseTo(3.175, 6);
    expect(wide).toBeCloseTo(6.35, 6);
    const shallow = { ...flutes, depth: len('1/16"') };
    expect(cutWidth(shallow)).toBeCloseTo(2 * Math.sqrt(shallow.depth.mm * (6.35 - shallow.depth.mm)), 6);
    expect(cutWidth(shallow)).toBeLessThan(6.35);
    // With the starter 1/8" ball it is half of that.
    expect((starterPattern('flutes') as typeof flutes).depth.mm).toBeCloseTo(1.5875, 6);
    expect([starterPattern('grooves'), starterPattern('frame'), starterPattern('channels')].map((p) => p.depth.mm)).toEqual([3.175, 3.175, 3.175]);
  });

  it('the frame look is a slab’s: on a shaker front it is nothing', () => {
    expect(slots(patternFeatures(slab(starterPattern('frame')), { width: 400, height: 700 }, 19))).toHaveLength(1);
    expect(patternFeatures(shaker(starterPattern('frame')), { width: 400, height: 700 }, 19)).toEqual([]);
  });

  it('too deep for the front says so; a flute deeper than half its bit is as wide as the bit', () => {
    const deep = { ...(grooves('vertical') as Extract<FrontPattern, { kind: 'grooves' }>), depth: len('3/4"') };
    expect(() => patternFeatures(slab(deep), { width: 400, height: 700 }, 19)).toThrow(/too deep/);
    const flutes = { ...flutesFor(6.35, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>), depth: len('1/4"') };
    const deepFlutes = slots(patternFeatures(slab(flutes), { width: 400, height: 700 }, 19));
    expect(deepFlutes.length).toBeGreaterThan(5);
    expect(deepFlutes[0]).toMatchObject({ width: 6.35, depth: 6.35, profile: { kind: 'round', diameter: 6.35 } });
  });
});

describe('patterned fronts in a project', () => {
  const fronts = (project: Project) => (project.context as CasesContext).fronts;
  const withPattern = (style: 'slab' | 'shaker', pattern: FrontPattern) => {
    const project = createBaseCabinetProject('frameless');
    for (const front of [fronts(project).doors, fronts(project).drawers.front]) front.style = style === 'slab' ? slab(pattern) : shaker(pattern);
    return project;
  };

  it('the doors and the drawer front all have it; the right door of a pair leans its diagonals the other way', () => {
    const project = withPattern('slab', grooves('diagonal'));
    const parts = deriveParts(project, shopFor(project, profile));
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(slots(p.features).length, p.id).toBeGreaterThan(3);
    const lean = (id: string) => {
      const [a, b] = slots(parts.find((p) => p.id.endsWith(id))!.features)[0]!.path;
      return Math.sign((b!.x - a!.x) * (b!.y - a!.y));
    };
    expect(lean('/door-left')).toBe(1);
    expect(lean('/door-right')).toBe(-1);
  });

  for (const [style, pattern, label, bit] of [
    ['slab', grooves('grid'), 'Pattern grooves', 'vbit-90'],
    ['slab', starterPattern('frame'), 'Pattern grooves', 'vbit-90'],
    ['shaker', flutesFor(6.35, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>), 'Flutes', 'ballnose-1-4'],
    ['slab', starterPattern('flutes'), 'Flutes', 'ballnose-1-8'],
  ] as ['slab' | 'shaker', FrontPattern, string, string][]) {
    it(`as a job, ${style} with ${pattern.kind}: a row for it with the bit of its shape; every file parses and cuts no deeper than it should`, async () => {
      const project = withPattern(style, pattern);
      const shop = createStarterShop();
      const job = buildJob(project, shop);
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      const rows = job.plan.operations.filter((o) => o.kind === 'slot');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.label.toLowerCase()).toContain(label.toLowerCase());
        expect(row.clearToolId).toBe(bit);
        expect(row.method).toBe('cnc');
      }
      // On a shaker front the pattern is cut after the panel is cleared.
      if (style === 'shaker') {
        for (const blank of job.plan.blanks) for (const setup of blank.setups) {
          const order = setup.operationKeys.map((k) => job.plan.operations.find((o) => o.key === k)!.kind);
          if (order.includes('slot') && order.includes('pocketClear')) expect(order.indexOf('slot')).toBeGreaterThan(order.lastIndexOf('pocketClear'));
        }
      }
      const tool = shop.tools.find((t) => t.id === bit)!;
      const text = job.files.map((f) => f.text).join('\n');
      // (A comment in a file is plain letters: a degree sign is written out.)
      expect(text).toContain(`NAME=${tool.name.replace('°', ' deg')}`);
      for (const file of job.files) {
        expect(file.text).not.toMatch(/^M[345]\b/m);
        for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      }
    }, 60000);
  }

  it('as jobs: channels are end mill work no wider than they are; dimples and a sunburst parse; soft channels want a bull nose that wide', async () => {
    for (const [pattern, label, bit] of [
      [starterPattern('channels'), 'channels', 'endmill-1-4'],
      [starterPattern('dimples', 6.35), 'dimples', 'ballnose-1-4'],
      [grooves('sunburst'), 'pattern grooves', 'vbit-90'],
      [grooves('waves'), 'pattern grooves', 'vbit-90'],
    ] as [FrontPattern, string, string][]) {
      const job = buildJob(withPattern('slab', pattern), createStarterShop());
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code)), label).toEqual([]);
      const rows = job.plan.operations.filter((o) => o.kind === 'slot');
      expect(rows.length, label).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.label.toLowerCase(), label).toContain(label);
        expect(row.clearToolId, label).toBe(bit);
      }
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), label).toEqual([]);
      }
    }
    // The starter shop's bull nose is 3/8" with 1/8" corners: a 1/4" channel finds no bit. With a bull nose of its width and corner, it takes it.
    const soft = { ...(starterPattern('channels') as Extract<FrontPattern, { kind: 'channels' }>), soft: true, corner: len('1/16"') };
    expect(buildJob(withPattern('slab', soft), createStarterShop()).plan.warnings.some((w) => w.code === 'noCapableTool')).toBe(true);
    const shop = createStarterShop();
    const quarter = shop.tools.find((t) => t.id === 'endmill-1-4')!;
    shop.tools.push({ ...quarter, id: 'bullnose-1-4', name: '1/4" bull nose', shape: { kind: 'bullNose', diameter: len('1/4"'), cornerRadius: len('1/16"'), cuttingLength: null, flutes: 2 } });
    const job = buildJob(withPattern('slab', soft), shop);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.filter((o) => o.kind === 'slot').every((o) => o.clearToolId === 'bullnose-1-4' && /bull nose cuts/i.test(o.label))).toBe(true);
    // The same width with other corners is another bit's: not offered.
    expect(buildJob(withPattern('slab', { ...soft, corner: len('1/8"') }), shop).plan.warnings.some((w) => w.code === 'noCapableTool')).toBe(true);
    // Sized for the starter bull nose, the starter shop cuts it.
    const starter = buildJob(withPattern('slab', { ...soft, width: len('3/8"'), corner: len('1/8"'), spacing: len('1"') }), createStarterShop());
    expect(starter.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(starter.plan.operations.filter((o) => o.kind === 'slot').every((o) => o.clearToolId === 'bullnose-3-8')).toBe(true);
  }, 120000);

  it('a taper ball with a tip the flutes’ width is offered for them beside the ball nose', () => {
    const shop = createStarterShop();
    const ball = shop.tools.find((t) => t.id === 'ballnose-1-4')!;
    shop.tools.push({ ...ball, id: 'taper-1-4', name: '1/4" taper ball', shape: { kind: 'taperBall', angleDeg: 5, ballDiameter: len('1/4"'), maxDiameter: len('3/8"'), cuttingLength: null, flutes: 2 } });
    const job = buildJob(withPattern('slab', flutesFor(6.35, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>)), shop);
    const row = job.plan.operations.find((o) => o.kind === 'slot')!;
    expect(row.options.clearToolIds).toEqual(expect.arrayContaining(['ballnose-1-4', 'taper-1-4']));
  });

  it('a flute wider than any ball nose in the shop: the row says no bit can cut it', () => {
    const project = withPattern('slab', flutesFor(12.7, starterPattern('flutes') as Extract<FrontPattern, { kind: 'flutes' }>));
    const job = buildJob(project, createStarterShop());
    expect(job.plan.warnings.some((w) => w.code === 'noCapableTool')).toBe(true);
  });
});
