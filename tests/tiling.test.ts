// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { clipToBand, cutsSomething, shiftY } from '@/cam/tile';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import type { PlanWarning, Project, SetupProgram, ToolpathStep } from '@/model';
import { TILE_OVERLAP, TILE_PIN_FROM_FRONT, TILE_REACH_MARGIN, TILE_SIDE_MARGIN, activeMachine, holdingTabHeight, isTiled, needsTiling, planPart } from '@/plan';
import { addTallCabinet, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/**
 * Milestone 4: tiling. On a machine whose Y is a soft limit, a part too long
 * for the cutting area (a tall cabinet's 84" side on the LowRider 3's 34" x 72") is cut
 * on the CNC in two set-ups on the same face, the sheet slid along Y between them and
 * found again on pins.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = lowRiderJobShop();
const machine = activeMachine(shop);
const area = { width: machine.cuttingArea.x.mm, height: machine.cuttingArea.y.mm, tileLength: machine.tiling?.maxLength.mm };

/** The reference cabinet and a tall one, with a full sheet on hand. */
function tallJob(style: 'frameless' | 'faceFrame' | 'shop', edit: (project: Project) => void = () => {}) {
  const project = style === 'shop' ? createShopCabinetProject() : createBaseCabinetProject(style);
  addTallCabinet(project, { name: 'Tall' });
  project.plan.blank.stock = { width: len('48"'), height: len('96"') };
  edit(project);
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  const blankOf = (partId: string) => job.plan.blanks.find((b) => b.partIds.includes(partId))!;
  const programsOf = (partId: string) => job.programs.filter((p) => p.blank.id === blankOf(partId).id);
  return { project, job, all, blankOf, programsOf };
}
type Move = { x: number; y: number; z: number; cut: boolean };
/** Every move of a program as absolute positions. */
function moves(program: SetupProgram): Move[] {
  const out: Move[] = [];
  let at = { x: NaN, y: NaN, z: NaN };
  for (const step of program.steps) {
    if (step.kind !== 'rapid' && step.kind !== 'cut' && step.kind !== 'arc') continue;
    at = { x: step.x ?? at.x, y: step.y ?? at.y, z: step.z ?? at.z };
    out.push({ ...at, cut: step.kind !== 'rapid' });
  }
  return out;
}

describe('cutting a toolpath down to a band', () => {
  const SAFE = 5;
  const run = (steps: ToolpathStep[], from: number, to: number) => clipToBand(steps, from, to, SAFE, 100);
  const start: ToolpathStep[] = [
    { kind: 'rapid', z: SAFE },
    { kind: 'rapid', x: 10, y: 0 },
    { kind: 'cut', z: -3, feed: 100 },
  ];

  it('leaves a path inside the band as it is', () => {
    const steps: ToolpathStep[] = [...start, { kind: 'cut', y: 40, feed: 900 }, { kind: 'rapid', z: SAFE }];
    expect(run(steps, 0, 50)).toEqual(steps);
    expect(run(steps, -Infinity, Infinity)).toEqual(steps);
  });

  it('stops a cut at the edge of the band and lifts', () => {
    const steps: ToolpathStep[] = [...start, { kind: 'cut', y: 100, feed: 900 }, { kind: 'cut', x: 50, feed: 900 }, { kind: 'rapid', z: SAFE }];
    expect(run(steps, 0, 60)).toEqual([...start, { kind: 'cut', x: 10, y: 60, z: -3, feed: 900 }, { kind: 'rapid', z: SAFE }]);
  });

  it('starts a cut at the edge when the path comes in from outside: travel there, down at the plunge feed, on', () => {
    const steps: ToolpathStep[] = [...start, { kind: 'cut', y: 100, feed: 900 }, { kind: 'rapid', z: SAFE }];
    expect(run(steps, 60, 200)).toEqual([
      { kind: 'rapid', z: SAFE },
      { kind: 'rapid', x: 10, y: 60 },
      { kind: 'cut', z: -3, feed: 100 },
      { kind: 'cut', x: 10, y: 100, z: -3, feed: 900 },
      { kind: 'rapid', z: SAFE },
    ]);
  });

  it('cuts a loop that crosses the band in two pieces, and keeps a ramp\'s depth where it comes back in', () => {
    // Round a square 0..100, ramping from -1 to -5 on the way.
    const loop: ToolpathStep[] = [
      { kind: 'rapid', z: SAFE },
      { kind: 'rapid', x: 0, y: 0 },
      { kind: 'cut', z: -1, feed: 100 },
      { kind: 'cut', x: 100, y: 0, z: -2, feed: 900 },
      { kind: 'cut', x: 100, y: 100, z: -3, feed: 900 },
      { kind: 'cut', x: 0, y: 100, z: -4, feed: 900 },
      { kind: 'cut', x: 0, y: 0, z: -5, feed: 900 },
    ];
    const near = run(loop, -Infinity, 40);
    const far = run(loop, 40, Infinity);
    // The near band: the bottom edge, up the right side to y 40, lift; back in on the left side at y 40, down to the start.
    expect(near.filter((s) => s.kind === 'cut')).toEqual([
      { kind: 'cut', z: -1, feed: 100 },
      { kind: 'cut', x: 100, y: 0, z: -2, feed: 900 },
      { kind: 'cut', x: 100, y: 40, z: -2.4, feed: 900 },
      { kind: 'cut', z: -4.6, feed: 100 },
      { kind: 'cut', x: 0, y: 0, z: -5, feed: 900 },
    ]);
    expect(near).toContainEqual({ kind: 'rapid', x: 0, y: 40 });
    // The far band has the rest: in on the right side, across the top, out on the left.
    expect(far.filter((s) => s.kind === 'cut')).toEqual([
      { kind: 'cut', z: -2.4, feed: 100 },
      { kind: 'cut', x: 100, y: 100, z: -3, feed: 900 },
      { kind: 'cut', x: 0, y: 100, z: -4, feed: 900 },
      { kind: 'cut', x: 0, y: 40, z: -4.6, feed: 900 },
    ]);
    // Between them every stretch of the loop is cut once.
    const length = (steps: ToolpathStep[]) => {
      let at = { x: 0, y: 0 };
      let sum = 0;
      for (const s of steps) {
        if (s.kind !== 'rapid' && s.kind !== 'cut') continue;
        const next = { x: s.x ?? at.x, y: s.y ?? at.y };
        if (s.kind === 'cut') sum += Math.hypot(next.x - at.x, next.y - at.y);
        at = next;
      }
      return sum;
    };
    expect(length(near) + length(far)).toBeCloseTo(400, 6);
  });

  it('keeps an arc inside the band whole, drops one outside it, and cuts one that crosses as short lines', () => {
    const circle = (cy: number): ToolpathStep[] => [
      { kind: 'rapid', z: SAFE },
      { kind: 'rapid', x: 15, y: cy },
      { kind: 'cut', z: -2, feed: 100 },
      { kind: 'arc', dir: 'ccw', x: 5, y: cy, i: -5, j: 0, feed: 300 },
      { kind: 'arc', dir: 'ccw', x: 15, y: cy, i: 5, j: 0, feed: 300 },
      { kind: 'rapid', z: SAFE },
    ];
    expect(run(circle(20), 0, 50)).toEqual(circle(20));
    expect(cutsSomething(run(circle(80), 0, 50))).toBe(false);
    const crossing = run(circle(50), 0, 50);
    expect(crossing.some((s) => s.kind === 'arc')).toBe(false);
    const ys = crossing.flatMap((s) => (s.kind === 'cut' && s.y !== undefined ? [s.y] : []));
    expect(Math.max(...ys)).toBeLessThanOrEqual(50 + 1e-6);
    expect(Math.min(...ys)).toBeCloseTo(45, 6);
    // Only the lower half of the circle is cut: half its length, near enough.
    let at = { x: 15, y: 50 };
    let sum = 0;
    for (const s of crossing) {
      if (s.kind !== 'rapid' && s.kind !== 'cut') continue;
      const next = { x: s.x ?? at.x, y: s.y ?? at.y };
      if (s.kind === 'cut') sum += Math.hypot(next.x - at.x, next.y - at.y);
      at = next;
    }
    expect(sum).toBeGreaterThan(Math.PI * 5 * 0.98);
    expect(sum).toBeLessThan(Math.PI * 5 * 1.01);
  });

  it('moves a path by the slide: Y only, arcs with their centres', () => {
    const steps: ToolpathStep[] = [
      { kind: 'rapid', z: 5 },
      { kind: 'rapid', x: 1, y: 500 },
      { kind: 'cut', z: -1, feed: 100 },
      { kind: 'arc', dir: 'cw', x: 2, y: 510, i: 3, j: 4, feed: 300 },
      { kind: 'comment', text: 'x' },
    ];
    expect(shiftY(steps, -400)).toEqual([
      { kind: 'rapid', z: 5 },
      { kind: 'rapid', x: 1, y: 100 },
      { kind: 'cut', z: -1, feed: 100 },
      { kind: 'arc', dir: 'cw', x: 2, y: 110, i: 3, j: 4, feed: 300 },
      { kind: 'comment', text: 'x' },
    ]);
  });
});

describe('what is tiled', () => {
  it('a part that fits across X and is too long for Y, up to the length the machine says', () => {
    const { all } = tallJob('frameless');
    const side = all.find((p) => p.id === 'cabinet-2/side-left')!;
    expect(L(machine.tiling!.maxLength.mm)).toBe('96"');
    expect(needsTiling(side, area)).toBe(true);
    expect(needsTiling(all.find((p) => p.id === 'cabinet-1/side-left')!, area)).toBe(false);
    // Too wide for X, or longer than a sheet may be: not tiled, whatever its length.
    const sized = (width: string, height: string) => ({ ...side, size: { ...side.size, width: len(width).mm, height: len(height).mm } });
    expect([needsTiling(sized('36"', '84"'), area), needsTiling(sized('24"', '100"'), area), needsTiling(sized('84"', '24"'), area)]).toEqual([false, false, true]);
    // A machine whose Y is a hard limit does not tile.
    expect(needsTiling(side, { width: area.width, height: area.height })).toBe(false);
    expect([isTiled({ width: 676, height: 2207 }, machine), isTiled({ width: 900, height: 2207 }, machine), isTiled({ width: 676, height: 1800 }, machine)]).toEqual([true, false, false]);
  });

  it('Plan suggests the CNC for it and still offers the saw, with the work by hand', () => {
    const { job, all } = tallJob('frameless');
    const side = job.plan.parts.find((p) => p.partId === 'cabinet-2/side-left')!;
    expect([side.cutOut, side.suggested, side.options]).toEqual(['cnc', 'cnc', ['cnc', 'tableSaw', 'circularSaw']]);
    expect(side.reason).toBe(
      "Longer than the machine's cutting area: cut on the CNC in two set-ups, the sheet slid along on pins between them. Or cut it on the table saw and make its joints and holes by hand.",
    );
    expect(side.steps.every((s) => s.by === 'cnc')).toBe(true);
    // The long back is a plain rectangle: the saw, as ever, though the CNC could tile it.
    const back = job.plan.parts.find((p) => p.partId === 'cabinet-2/back')!;
    expect([back.cutOut, back.options]).toEqual(['tableSaw', ['cnc', 'tableSaw', 'circularSaw']]);
    // Chosen for the saw, it is made by hand, off the blanks.
    const part = all.find((p) => p.id === 'cabinet-2/side-left')!;
    const sawn = planPart(part, { parts: { 'cabinet-2/side-left': { cutOut: 'tableSaw' } } }, shop, area);
    expect([sawn.cutOut, sawn.steps.some((s) => s.by === 'byHand')]).toEqual(['tableSaw', true]);
  });
});

describe.each(['frameless', 'shop', 'faceFrame'] as const)('a %s job with a tall cabinet, tiled', (style) => {
  const { job, all, blankOf, programsOf, project } = tallJob(style);
  const side = all.find((p) => p.id === 'cabinet-2/side-left')!;
  const blank = blankOf(side.id);
  const [first, second] = blank.setups;
  const reach = machine.cuttingArea.y.mm;

  it('plans with nothing in the way: each long side on a blank of its own, in two set-ups on one face', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(blank.partIds).toEqual([side.id]);
    expect(blankOf('cabinet-2/side-right').partIds).toEqual(['cabinet-2/side-right']);
    // As wide as the side and its two strips of waste for the pins; longer than the machine, no longer than it tiles.
    expect(blank.size.width).toBeGreaterThanOrEqual(side.size.width + 2 * TILE_SIDE_MARGIN - 1e-6);
    expect(blank.size.width).toBeLessThanOrEqual(machine.cuttingArea.x.mm);
    expect(blank.size.height).toBeGreaterThan(reach);
    expect(blank.size.height).toBeLessThanOrEqual(machine.tiling!.maxLength.mm);
    expect(blank.setups.map((s) => [s.index, s.faceUp, s.flipBefore === 'none' ? 'none' : s.flipBefore.kind])).toEqual([
      [1, 'A', 'none'],
      [2, 'A', 'slideOnPins'],
    ]);
    // The other blanks are as they are without a tall cabinet: none tiled.
    expect(job.plan.blanks.filter((b) => b.setups.some((s) => s.tile)).map((b) => b.partIds[0])).toEqual(['cabinet-2/side-left', 'cabinet-2/side-right']);
  });

  it('slides the sheet far enough for the far end to be reached, onto pins both set-ups can use', () => {
    const shift = second!.tile!.shift;
    expect(second!.flipBefore).toEqual({ kind: 'slideOnPins', distance: shift });
    expect(shift % 5).toBe(0);
    expect(blank.size.height - shift).toBeLessThanOrEqual(reach - TILE_REACH_MARGIN + 1e-6);
    // Two pairs of holes, the pairs the slide apart, both drilled in the first set-up within its reach.
    const pins = first!.pinHoles;
    expect(pins).toHaveLength(4);
    expect(second!.pinHoles).toEqual([]);
    expect(pins.map((p) => p.y)).toEqual([TILE_PIN_FROM_FRONT, TILE_PIN_FROM_FRONT, TILE_PIN_FROM_FRONT + shift, TILE_PIN_FROM_FRONT + shift]);
    expect(pins[2]!.x).toBe(pins[0]!.x);
    expect(pins[3]!.x).toBe(pins[1]!.x);
    expect(Math.max(...pins.map((p) => p.y))).toBeLessThan(reach - TILE_REACH_MARGIN);
    // They stand in the waste at the sides, clear of the cut round the part.
    const placed = first!.placements[0]!;
    const bit = 6.35;
    for (const pin of pins) {
      const clear = pin.x < placed.origin.x ? placed.origin.x - bit - pin.x : pin.x - (placed.origin.x + side.size.width + bit);
      expect(clear).toBeGreaterThan(3.2 + 2);
      expect(Math.min(pin.x, blank.size.width - pin.x)).toBeGreaterThan(3.2 + 2);
    }
  });

  it('joins the two bands where both set-ups reach, clear of every hole', () => {
    const join = first!.tile!.to;
    expect(first!.tile).toEqual({ from: 0, to: join, shift: 0 });
    expect(second!.tile).toEqual({ from: join, to: blank.size.height, shift: second!.tile!.shift });
    expect(join).toBeLessThanOrEqual(reach - TILE_REACH_MARGIN);
    expect(join - second!.tile!.shift).toBeGreaterThanOrEqual(TILE_REACH_MARGIN);
    const placed = first!.placements[0]!;
    const holes = side.features.flatMap((f) => (f.kind === 'hole' ? [{ y: placed.origin.y + f.center.y, r: f.diameter / 2 }] : []));
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.every((h) => Math.abs(h.y - join) > h.r + 5)).toBe(true);
  });

  it('cuts nothing outside the machine\'s reach in either set-up, and drills the pins in the first', () => {
    const [one, two] = programsOf(side.id);
    expect([one!.setup.index, two!.setup.index]).toEqual([1, 2]);
    for (const program of [one!, two!]) {
      const cuts = moves(program).filter((m) => m.cut);
      expect(cuts.length).toBeGreaterThan(50);
      expect(Math.min(...cuts.map((m) => m.y))).toBeGreaterThanOrEqual(0);
      expect(Math.max(...cuts.map((m) => m.y))).toBeLessThanOrEqual(reach);
      expect(Math.min(...cuts.map((m) => m.x))).toBeGreaterThanOrEqual(0);
      expect(Math.max(...cuts.map((m) => m.x))).toBeLessThanOrEqual(machine.cuttingArea.x.mm);
    }
    // Each band's cuts stop the overlap past the join.
    const join = first!.tile!.to;
    const shift = second!.tile!.shift;
    const nearCuts = moves(one!).filter((m) => m.cut && m.z < 0);
    expect(Math.max(...nearCuts.map((m) => m.y))).toBeLessThanOrEqual(Math.max(join + TILE_OVERLAP, TILE_PIN_FROM_FRONT + shift + 4) + 1e-6);
    expect(Math.min(...moves(two!).filter((m) => m.cut && m.z < 0).map((m) => m.y))).toBeGreaterThanOrEqual(join - TILE_OVERLAP - shift - 1e-6);
    // The four pin holes go through the blank into the spoilboard, in the first set-up only.
    const through = (program: SetupProgram) => moves(program).filter((m) => m.cut && m.z < -blank.size.thickness - 1);
    for (const pin of first!.pinHoles) expect(through(one!).some((m) => Math.hypot(m.x - pin.x, m.y - pin.y) < 1)).toBe(true);
    expect(through(two!)).toEqual([]);
    expect(first!.operationKeys[0]).toBe('job:pinHole');
    expect(second!.operationKeys).not.toContain('job:pinHole');
  });

  it('cuts every hole once, in the set-up whose band it is in, and the outline all the way round between them', () => {
    const [one, two] = programsOf(side.id);
    const placed = first!.placements[0]!;
    const shift = second!.tile!.shift;
    const join = first!.tile!.to;
    const deep = (program: SetupProgram) => moves(program).filter((m) => m.cut && m.z < -0.5);
    for (const f of side.features) {
      if (f.kind !== 'hole') continue;
      const at = { x: placed.origin.x + f.center.x, y: placed.origin.y + f.center.y };
      const inFirst = deep(one!).some((m) => Math.hypot(m.x - at.x, m.y - at.y) <= f.diameter / 2 + 1e-6);
      const inSecond = deep(two!).some((m) => Math.hypot(m.x - at.x, m.y - (at.y - shift)) <= f.diameter / 2 + 1e-6);
      expect([inFirst, inSecond], f.id).toEqual(at.y < join ? [true, false] : [false, true]);
    }
    // The outline: at full depth the first set-up reaches the blank's front end of the part, the second its far end.
    const full = (program: SetupProgram) => moves(program).filter((m) => m.cut && m.z <= -(blank.size.thickness - holdingTabHeight(machine, blank.size.thickness)) + 1e-6 && m.z >= -blank.size.thickness - THROUGH_EXTRA - 1e-6);
    expect(Math.min(...full(one!).map((m) => m.y))).toBeLessThan(placed.origin.y);
    expect(Math.max(...full(two!).map((m) => m.y)) + shift).toBeGreaterThan(placed.origin.y + side.size.height);
    // And both cut it up to the join.
    expect(Math.max(...full(one!).map((m) => m.y))).toBeCloseTo(join + TILE_OVERLAP, 3);
    expect(Math.min(...full(two!).map((m) => m.y)) + shift).toBeCloseTo(join - TILE_OVERLAP, 3);
  });

  it('writes two files that parse, the second without a new zero, and says how to slide the sheet', async () => {
    const [one, two] = programsOf(side.id);
    expect([one!.fileName, two!.fileName].every((n) => /-setup-[12]-inside\.gcode$/.test(n))).toBe(true);
    expect(one!.fileName).not.toBe(two!.fileName);
    const texts = [one!, two!].map((p) => job.files.find((f) => f.name === p.fileName)!.text);
    const slide = `slide the sheet ${second!.tile!.shift} mm toward the front`;
    expect(texts[0]).toContain(`Slide the sheet ${second!.tile!.shift} mm forward onto pins in the front holes.`);
    expect(texts[0]).toContain('G10 L20 P0 X0 Y0');
    expect(texts[1]).not.toContain('G10 L20 P0 X0 Y0');
    for (const text of texts) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      expect(text).not.toMatch(/\bM0?[35]\b/);
      for (const line of text.split('\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(127);
      // No move below the stock but the pin holes.
      const deepest = -Math.min(0, ...[...text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      expect(deepest).toBeLessThanOrEqual(blank.size.thickness + (text === texts[0] ? machine.flipPins.spoilboardDepth : 0) + THROUGH_EXTRA + 0.011);
    }
    const steps = buildChecklist(project, job.plan, job.programs, shop.tools, machine);
    expect(steps.filter((s) => s.includes(slide))).toHaveLength(2);
    expect(steps.some((s) => /too long for the machine/.test(s))).toBe(false);
    expect(buildLists(job, project, shop, L).byHand).toEqual([]);
  });
});

describe('a tiled job, otherwise', () => {
  it('with the default 24" x 48" sheet a tall side still gets a blank as long as it needs: nothing is said of the sheet', () => {
    const project = createBaseCabinetProject('frameless');
    addTallCabinet(project, { name: 'Tall' });
    const job = buildJob(project, shop);
    expect(job.plan.warnings.filter((w) => w.code === 'stockTooSmall' && /your stock/.test(w.message))).toEqual([]);
    expect(Math.max(...job.plan.blanks.map((b) => Math.max(b.size.width, b.size.height)))).toBeGreaterThan(48 * 25.4);
  });

  it('a side cut on the saw instead leaves the job without tiled blanks', () => {
    const { job } = tallJob('frameless', (project) => {
      project.plan.parts = { 'cabinet-2/side-left': { cutOut: 'tableSaw' }, 'cabinet-2/side-right': { cutOut: 'tableSaw' } };
    });
    expect(job.plan.blanks.some((b) => b.setups.some((s) => s.tile))).toBe(false);
    expect(job.plan.operations.some((o) => o.kind === 'pinHole')).toBe(job.plan.blanks.some((b) => b.setups.length > 1));
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });
});
