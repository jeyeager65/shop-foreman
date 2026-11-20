import { describe, expect, it } from 'vitest';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { deriveParts, doorSetOf } from '@/design';
import type { Project, RouterBit } from '@/model';
import { resolvePlan } from '@/plan';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

const shop = lowRiderJobShop();
/**
 * The vanity's plan with its first blank read the way these tests were written, when
 * a plan had one blank: `blank`, `minimumBlank`, `layout` and `setups` are that blank's.
 */
const planFor = (project: Project, s = shop) => {
  const plan = resolvePlan(project, s, deriveParts(project, s));
  const first = plan.blanks[0]!;
  return {
    ...plan,
    blank: first.size,
    minimumBlank: first.minimum,
    layout: { arrangement: first.arrangement, edgeMargin: first.edgeMargin, stock: plan.stock },
    setups: first.setups,
  };
};
const op = (plan: ReturnType<typeof planFor>, kind: string) => plan.operations.find((o) => o.kind === kind)!;

describe('vanity plan', () => {
  const plan = planFor(createVanityProject());

  it('lists every operation with its face, method and bits', () => {
    expect(plan.operations.map((o) => [o.kind, o.face, o.method, o.clearToolId, o.cleanupToolId])).toEqual([
      ['hingeCup', 'B', 'cnc', 'endmill-1-4', undefined],
      ['pocketClear', 'A', 'cnc', 'endmill-1-4', 'endmill-1-8'],
      ['vBevel', 'A', 'cnc', 'vbit-60', undefined],
      ['edgeProfile', 'edge', 'handheldRouter', undefined, undefined],
      ['cutout', 'A', 'cnc', 'endmill-1-4', undefined],
      ['pinHole', 'B', 'cnc', 'endmill-1-4', undefined],
      ['install', 'install', 'byHand', undefined, undefined],
    ]);
  });

  it('needs the 1/8" clean-up because the design asks for 1/16" floor corners', () => {
    const pocket = op(plan, 'pocketClear');
    expect(pocket.options.cleanupRequired).toBe(true);
    expect(pocket.options.cleanupToolIds).toEqual(['endmill-1-8', 'endmill-1-16']);
  });

  it('only offers bits that can make the feature', () => {
    expect(op(plan, 'vBevel').options.clearToolIds).toEqual(['vbit-60']);
    expect(op(plan, 'hingeCup').options.clearToolIds).toEqual(['endmill-1-4', 'endmill-1-8', 'endmill-1-16']);
    // No roundover bit in the shop, so the CNC isn't offered for the outside edge
    expect(op(plan, 'edgeProfile').options.methods).toEqual(['handheldRouter', 'byHand']);
  });

  it('is one blank of MDF with both doors on it, neither turned', () => {
    expect(plan.blanks).toHaveLength(1);
    expect(plan.blanks[0]).toMatchObject({ id: 'blank-1', index: 1, label: '3/4" MDF', materialId: 'mdf-3-4', partIds: ['doors-1/door-left', 'doors-1/door-right'] });
    expect(plan.blanks[0]!.grainAxis).toBeUndefined();
    expect(plan.setups.flatMap((s) => s.placements.map((p) => p.turned))).toEqual([false, false, false, false]);
  });

  it('plans two setups with a sheet flip on pins', () => {
    expect(plan.setups).toHaveLength(2);
    const [back, front] = plan.setups;
    expect(back!.faceUp).toBe('B');
    expect(back!.flipBefore).toBe('none');
    expect(back!.operationKeys).toEqual(['doors:hingeCup', 'job:pinHole']);
    expect(front!.faceUp).toBe('A');
    expect(front!.flipBefore).toEqual({ kind: 'sheetOnPins', direction: 'leftToRight' });
    expect(front!.operationKeys).toEqual(['doors:pocketClear', 'doors:vBevel@60', 'doors:cutout']);
  });

  it('puts the pins on the flip axis, clear of the doors', () => {
    const [back, front] = plan.setups;
    expect(back!.pinHoles).toHaveLength(2);
    for (const pin of back!.pinHoles) expect(pin.x).toBeCloseTo(303.2125, 9);
    expect(back!.pinHoles[0]!.y).toBeCloseTo(15, 9);
    expect(back!.pinHoles[1]!.y).toBeCloseTo(698.5 - 15, 9);
    expect(front!.pinHoles).toEqual(back!.pinHoles);
    expect(plan.warnings.filter((w) => w.code === 'blankTooSmall')).toEqual([]);
  });

  it('mirrors the doors left to right between the setups', () => {
    const [back, front] = plan.setups;
    const frontLeft = front!.placements.find((p) => p.partId === 'doors-1/door-left')!;
    const backLeft = back!.placements.find((p) => p.partId === 'doors-1/door-left')!;
    const width = 10.90625 * 25.4;
    expect(frontLeft.mirrored).toBe(false);
    expect(backLeft.mirrored).toBe(true);
    expect(backLeft.origin.x).toBeCloseTo(606.425 - frontLeft.origin.x - width, 9);
    expect(backLeft.origin.y).toBe(frontLeft.origin.y);
    // Both doors fit on the blank
    for (const p of front!.placements) {
      expect(p.origin.x).toBeGreaterThan(10);
      expect(p.origin.x + width).toBeLessThan(701.2);
    }
  });

  it('probes on the front-left corner in both setups', () => {
    for (const setup of plan.setups) expect(setup.probeSpot).toEqual({ at: { x: 12, y: 12 } });
  });

  it('lists the install kit and what is done by hand', () => {
    expect(plan.installKit).toEqual([
      { template: 'supportBlock', params: { height: 17.4625 }, quantity: 2, output: '3mf' },
      { template: 'gapShim', params: { thickness: 3.175 }, quantity: 1, output: '3mf' },
    ]);
    expect(plan.summary.byHand).toEqual(['Outside edges']);
    expect(plan.summary.toolIds).toEqual(['endmill-1-4', 'endmill-1-8', 'vbit-60']);
  });

  it('warns that the end mill cutting lengths are not measured', () => {
    expect(plan.warnings.filter((w) => w.code === 'cuttingLengthUnknown').length).toBeGreaterThan(0);
  });
});

describe('plan choices', () => {
  it('fewest bit changes uses the 1/8" end mill for all end mill work, with no clean-up', () => {
    const project = createVanityProject();
    project.plan.strategy = 'fewestBitChanges';
    const plan = planFor(project);
    for (const kind of ['hingeCup', 'pocketClear', 'cutout', 'pinHole']) {
      expect(op(plan, kind).clearToolId).toBe('endmill-1-8');
    }
    expect(op(plan, 'pocketClear').cleanupToolId).toBeUndefined();
    expect(plan.summary.toolIds).toEqual(['endmill-1-8', 'vbit-60']);
  });

  it('keeps a user choice that can make the feature and ignores one that cannot', () => {
    const project = createVanityProject();
    project.plan.operations['doors:hingeCup'] = { clearToolId: 'endmill-1-8' };
    project.plan.operations['doors:vBevel'] = { clearToolId: 'vbit-90' };
    const plan = planFor(project);
    expect(op(plan, 'hingeCup').clearToolId).toBe('endmill-1-8');
    expect(op(plan, 'vBevel').clearToolId).toBe('vbit-60');
  });

  it('makes clean-up optional when the design allows the clearing bit radius', () => {
    const project = createVanityProject();
    const style = doorSetOf(project).style;
    if (style.kind === 'shaker') style.floorCornerRadius = len('1/8"');
    const pocket = op(planFor(project), 'pocketClear');
    expect(pocket.options.cleanupRequired).toBe(false);
    expect(pocket.cleanupToolId).toBeUndefined();
    expect(pocket.options.cleanupToolIds).toEqual(['endmill-1-8', 'endmill-1-16']);
  });

  it('offers the CNC for a chamfered edge with the 90° V-bit, and for a roundover once that bit is added', () => {
    const chamfer = createVanityProject();
    doorSetOf(chamfer).outsideEdge = { kind: 'chamfer', size: len('1/8"') };
    expect(op(planFor(chamfer), 'edgeProfile').options).toMatchObject({
      methods: ['handheldRouter', 'cnc', 'byHand'],
      clearToolIds: ['vbit-90'],
    });

    const withBit = lowRiderJobShop();
    const roundover: RouterBit = {
      id: 'roundover-1-8',
      type: 'routerBit',
      name: '1/8" roundover bit',
      offset: { x: 0, y: 0 },
      shank: len('1/4"'),
      shape: { kind: 'roundover', radius: len('1/8"'), tipDiameter: len('1/8"'), diameter: len('1/2"') },
      settings: { 'mdf-3-4': { feed: 1500, plungeFeed: 300, depthPerPass: 3.2, stepover: 0, rpm: 22000 } },
      tuneMe: [],
    };
    withBit.tools.push(roundover);
    expect(op(planFor(createVanityProject(), withBit), 'edgeProfile').options.clearToolIds).toEqual(['roundover-1-8']);
  });

  it('avoids the flip for a slab door: cups and cutout from the back', () => {
    const project = createVanityProject();
    doorSetOf(project).style = { kind: 'slab' };
    const plan = planFor(project);
    expect(plan.setups).toHaveLength(1);
    expect(plan.setups[0]!.faceUp).toBe('B');
    expect(plan.setups[0]!.operationKeys).toEqual(['doors:hingeCup', 'doors:cutout']);
    expect(plan.setups[0]!.pinHoles).toEqual([]);
    expect(plan.operations.some((o) => o.kind === 'pinHole')).toBe(false);
  });

  it('warns when the user\'s own piece is too small', () => {
    const project = createVanityProject();
    project.plan.blank.width = len('20"');
    project.plan.blank.height = len('30"');
    expect(planFor(project).warnings.some((w) => w.code === 'blankTooSmall')).toBe(true);
  });

  /** The vanity project with a given largest piece of stock, X x Y. */
  const withStock = (width: string, height: string) => {
    const project = createVanityProject();
    project.plan.blank.stock = { width: len(width), height: len(height) };
    return project;
  };

  it('uses the smallest blank that works when the stock is big enough', () => {
    const plan = planFor(withStock('48"', '96"'));
    // Two 10-29/32" doors, 20 mm apart, 20 mm of waste each side: 614 mm, up to the next 1/8"
    expect(plan.minimumBlank.width).toBeCloseTo(24.25 * 25.4, 6);
    // 24-7/8" tall plus room at the front and back for the flip pins
    expect(plan.minimumBlank.height).toBeCloseTo(27.5 * 25.4, 6);
    expect(plan.blank).toMatchObject(plan.minimumBlank);
    expect(plan.layout).toMatchObject({ arrangement: 'row', edgeMargin: 20 });
    expect(plan.warnings.some((w) => ['blankTooSmall', 'tightMargins', 'stockTooSmall'].includes(w.code))).toBe(false);
  });

  it('squeezes the edge waste to fit the default 24" x 48" sheet, planned 1/8" short for the saw cuts', () => {
    const plan = planFor(createVanityProject());
    expect(plan.layout.stock.width).toBeCloseTo(23.875 * 25.4, 6);
    expect(plan.layout.stock.height).toBeCloseTo(47.875 * 25.4, 6);
    expect(plan.layout.arrangement).toBe('row');
    // 23-7/8" less the doors and the 20 mm between them leaves 16.2 mm a side; stepped to 16
    expect(plan.layout.edgeMargin).toBe(16);
    expect(plan.blank.width).toBeCloseTo(23.875 * 25.4, 6);
    expect(plan.blank.height).toBeCloseTo(27.5 * 25.4, 6);
    expect(plan.warnings.filter((w) => w.code === 'tightMargins')).toHaveLength(1);
    expect(plan.warnings.some((w) => w.code === 'blankTooSmall' || w.code === 'stockTooSmall')).toBe(false);
  });

  it('puts the doors one behind the other when the stock is narrow and long', () => {
    const plan = planFor(withStock('14"', '60"'));
    expect(plan.layout).toMatchObject({ arrangement: 'column', edgeMargin: 20 });
    expect(plan.blank.width).toBeCloseTo(12.5 * 25.4, 6);
    expect(plan.blank.height).toBeLessThanOrEqual(60 * 25.4);
    expect(plan.warnings.some((w) => w.code === 'blankTooSmall' || w.code === 'stockTooSmall')).toBe(false);
    for (const setup of plan.setups) {
      const [a, b] = setup.placements;
      // Same X, stacked in Y with the part spacing between, inside the blank
      expect(a!.origin.x).toBeCloseTo(b!.origin.x, 6);
      expect(b!.origin.y - a!.origin.y).toBeCloseTo(631.825 + 20, 6);
      expect(a!.origin.y).toBeGreaterThan(20);
      expect(b!.origin.y + 631.825).toBeLessThan(plan.blank.height - 20);
      // Pins stay on the flip axis, in the waste at the front and back
      for (const pin of setup.pinHoles) expect(pin.x).toBeCloseTo(plan.blank.width / 2, 6);
    }
  });

  it('takes an entered stock size as measured, with no trim', () => {
    const plan = planFor(withStock('24"', '48"'));
    expect(plan.layout.stock.width).toBeCloseTo(609.6, 6);
    expect(plan.blank.width).toBeCloseTo(609.6, 6);
    expect(plan.layout.edgeMargin).toBe(17.5);
  });

  it('takes the stock either way round', () => {
    expect(planFor(withStock('60"', '14"')).layout.arrangement).toBe('column');
    expect(planFor(withStock('48"', '24"')).layout.arrangement).toBe('row');
  });

  it('puts the doors on a blank each when they fit on no single piece of the stock', () => {
    const plan = planFor(withStock('20"', '40"'));
    expect(plan.warnings.some((w) => w.code === 'stockTooSmall')).toBe(false);
    expect(plan.blanks.map((b) => [b.label, b.partIds])).toEqual([
      ['3/4" MDF, 1 of 2', ['doors-1/door-left']],
      ['3/4" MDF, 2 of 2', ['doors-1/door-right']],
    ]);
    // Each is flipped on its own pins.
    for (const blank of plan.blanks) {
      expect(blank.setups).toHaveLength(2);
      expect(blank.setups[0]!.pinHoles).toHaveLength(2);
      expect(blank.size.width).toBeLessThanOrEqual(20 * 25.4);
    }
  });

  it('a part bigger than the sheet gets a blank as big as it needs, and nothing is said of the sheet', () => {
    // (The sheet on hand does not matter: the material is bought to suit.)
    const plan = planFor(withStock('10"', '40"'));
    expect(plan.blanks).toHaveLength(2);
    expect(plan.warnings.filter((w) => w.code === 'stockTooSmall')).toEqual([]);
    for (const blank of plan.blanks) expect(Math.min(blank.size.width, blank.size.height)).toBeGreaterThan(10 * 25.4);
    expect(plan.setups).toHaveLength(2);
  });

  it('plans on an entered piece as it is', () => {
    const own = createVanityProject();
    own.plan.blank.width = len('28"');
    own.plan.blank.height = len('30"');
    const larger = planFor(own);
    expect(larger.blank.width).toBeCloseTo(711.2, 6);
    expect(larger.blank.height).toBeCloseTo(762, 6);
    expect(larger.minimumBlank).toEqual(planFor(createVanityProject()).minimumBlank);
    expect(larger.warnings.some((w) => w.code === 'tightMargins')).toBe(false);

    const narrow = createVanityProject();
    narrow.plan.blank.width = len('13"');
    narrow.plan.blank.height = len('56"');
    expect(planFor(narrow).layout.arrangement).toBe('column');
  });

  it('needs no flip pins for a slab door', () => {
    const project = createVanityProject();
    doorSetOf(project).style = { kind: 'slab' };
    const plan = planFor(project);
    expect(plan.minimumBlank.height).toBeLessThanOrEqual(27.5 * 25.4);
    expect(plan.warnings.some((w) => w.code === 'blankTooSmall')).toBe(false);
  });

describe('flip pin holes and the bit\'s cutting length', () => {
  const planWith = (flutes: string | null) => {
    const shop = lowRiderJobShop();
    const bit = shop.tools.find((t) => t.id === 'endmill-1-4')!;
    if (bit.shape.kind === 'endMill') bit.shape.cuttingLength = flutes ? len(flutes) : null;
    return buildJob(createVanityProject(), shop);
  };
  const pinDepth = (text: string) => {
    const lines = text.split('\n');
    const from = lines.findIndex((l) => l.includes('Registration holes'));
    return Math.min(...lines.slice(from).flatMap((l) => /^G[123] .*?Z(-[\d.]+)/.exec(l)?.[1] ?? []).map(Number));
  };

  it('goes the full depth when the flutes reach, or when their length is unknown', () => {
    for (const flutes of [null, '32mm']) {
      const job = planWith(flutes);
      expect(job.plan.operations.find((o) => o.kind === 'pinHole')!.depth).toBe(25);
      expect(job.plan.warnings.some((w) => w.code === 'pinHolesShallow')).toBe(false);
      expect(pinDepth(job.files[0]!.text)).toBeCloseTo(-25, 6);
      expect(job.files[0]!.text).toContain('M0 (MSG, Router OFF. Setup 1 done. Flip the sheet left to right onto the pins.)');
    }
  });

  it('stops at the flute length and says how much to drill by hand', () => {
    const job = planWith('22mm');
    const op = job.plan.operations.find((o) => o.kind === 'pinHole')!;
    expect(op.depth).toBe(22);
    const notes = job.plan.warnings.filter((w) => w.code === 'pinHolesShallow');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toBe(
      'The 1/4" end mill cuts 22 mm deep, so the pin holes stop 3 mm into the spoilboard instead of 6 mm. Drill them 3 mm deeper by hand before the flip.',
    );
    // Not also reported as a cut deeper than the bit
    expect(op.warnings.some((w) => w.code === 'deeperThanCuttingLength')).toBe(false);
    expect(pinDepth(job.files[0]!.text)).toBeCloseTo(-22, 6);
    expect(job.files[0]!.text).toContain(
      'M0 (MSG, Router OFF. Setup 1 done. Drill the pin holes deeper by hand, then flip the sheet left to right onto the pins.)',
    );
    const steps = buildChecklist(createVanityProject(), job.plan, job.programs, lowRiderJobShop().tools);
    const run = steps.findIndex((s) => s.startsWith('Run vanity-setup-1-back.gcode'));
    expect(steps[run + 1]).toBe(notes[0]!.message);
    expect(steps[run + 2]).toMatch(/^Flip the sheet/);
  });

  it('says so when the bit cannot even get through the blank', () => {
    const job = planWith('15mm');
    expect(job.plan.operations.find((o) => o.kind === 'pinHole')!.depth).toBe(15);
    expect(job.plan.warnings.find((w) => w.code === 'pinHolesShallow')!.message).toBe(
      'The 1/4" end mill cuts 15 mm deep, so the pin holes stop 4 mm short of going through the blank. Drill them through and 6 mm into the spoilboard by hand before the flip.',
    );
    expect(pinDepth(job.files[0]!.text)).toBeCloseTo(-15, 6);
  });
});
});
