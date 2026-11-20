// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { MDF_ID, PLYWOOD_1_2_ID, PLYWOOD_1_4_ID, PLYWOOD_3_4_ID } from '@/libraries';
import type { ConstructionStyle, Part, PlannedBlank, Project, Shop } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });

function jobFor(style: ConstructionStyle, change?: (project: Project, shop: Shop) => void) {
  const shop = lowRiderJobShop();
  const project = createBaseCabinetProject(style);
  change?.(project, shop);
  const job = buildJob(project, shop);
  const parts = new Map([...job.parts, ...job.cabinetParts].map((p) => [p.id, p]));
  return { job, parts, shop };
}

/** Where each part of a setup lies on its blank: the rectangle it takes up. */
function footprints(blank: PlannedBlank, setupIndex: number, parts: Map<string, Part>) {
  return blank.setups[setupIndex]!.placements.map((p) => {
    const part = parts.get(p.partId)!;
    const width = p.turned ? part.size.height : part.size.width;
    const height = p.turned ? part.size.width : part.size.height;
    return { id: p.partId, x0: p.origin.x, y0: p.origin.y, x1: p.origin.x + width, y1: p.origin.y + height };
  });
}

/** Every X and Y word of the moves between two lines of a file. */
function moves(gcode: string, from = 0, to = Infinity) {
  const points: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  gcode.split('\n').forEach((line, i) => {
    if (i < from || i >= to || !/^G[0123] /.test(line)) return;
    const mx = /X(-?[\d.]+)/.exec(line);
    const my = /Y(-?[\d.]+)/.exec(line);
    if (!mx && !my) return;
    if (mx) x = Number(mx[1]);
    if (my) y = Number(my[1]);
    points.push({ x, y });
  });
  return points;
}

describe('the frameless reference cabinet on its blanks', () => {
  const { job, parts } = jobFor('frameless');
  const { blanks, stock } = job.plan;

  it('groups the CNC parts by material: two MDF blanks, a sheet per side, one for the box walls', () => {
    expect(blanks.map((b) => [b.id, b.label, b.partIds.map((id) => parts.get(id)!.name)])).toEqual([
      ['blank-1', '3/4" MDF, 1 of 2', ['Left door', 'Drawer front']],
      ['blank-2', '3/4" MDF, 2 of 2', ['Right door']],
      ['blank-3', '3/4" Plywood, 1 of 2', ['Left side']],
      ['blank-4', '3/4" Plywood, 2 of 2', ['Right side']],
      ['blank-5', '1/2" Plywood', ['Box side, left', 'Box side, right', 'Box front', 'Box back']],
    ]);
    expect(blanks.map((b) => b.materialId)).toEqual([MDF_ID, MDF_ID, PLYWOOD_3_4_ID, PLYWOOD_3_4_ID, PLYWOOD_1_2_ID]);
    expect(blanks.map((b) => b.size.thickness)).toEqual([19, 19, len('23/32"').mm, len('23/32"').mm, len('15/32"').mm]);
  });

  it('nests only the parts cut out on the CNC, each once', () => {
    const onCnc = job.plan.parts.filter((p) => p.cutOut === 'cnc').map((p) => p.partId);
    expect(blanks.flatMap((b) => b.partIds).sort()).toEqual([...onCnc].sort());
    expect(onCnc).toHaveLength(9);
  });

  it('fixes the known gap: the 23-7/8" drawer front fits the 24" x 48" sheet, with a door turned beside it', () => {
    expect(job.plan.warnings.some((w) => ['stockTooSmall', 'outsideCuttingArea', 'blankTooSmall'].includes(w.code))).toBe(false);
    const [first] = blanks;
    expect([first!.size.width, first!.size.height].map(frac)).toEqual(['25-1/2"', '21-7/8"']);
    const front = first!.setups[1]!;
    expect(front.placements.map((p) => [p.partId, p.turned])).toEqual([
      ['doors-1/door-left', true],
      ['drawer-1/front', false],
    ]);
  });

  it('keeps every blank within the stock and the machine', () => {
    const long = Math.max(stock.width, stock.height);
    const short = Math.min(stock.width, stock.height);
    for (const b of blanks) {
      expect(Math.max(b.size.width, b.size.height)).toBeLessThanOrEqual(long + 1e-6);
      expect(Math.min(b.size.width, b.size.height)).toBeLessThanOrEqual(short + 1e-6);
      expect(b.size.width).toBeLessThanOrEqual(len('34"').mm);
      expect(b.minimum).toEqual({ width: b.size.width, height: b.size.height });
    }
  });

  it('lays the parts inside their blank, clear of each other, in every setup', () => {
    for (const b of blanks) {
      b.setups.forEach((setup, i) => {
        const rects = footprints(b, i, parts);
        expect(rects.map((r) => r.id)).toEqual(b.partIds);
        for (const r of rects) {
          expect(r.x0).toBeGreaterThanOrEqual(10 - 1e-6);
          expect(r.y0).toBeGreaterThanOrEqual(10 - 1e-6);
          expect(r.x1).toBeLessThanOrEqual(b.size.width - 10 + 1e-6);
          expect(r.y1).toBeLessThanOrEqual(b.size.height - 10 + 1e-6);
        }
        for (const a of rects) {
          for (const c of rects) {
            if (a === c) continue;
            const apart = a.x1 <= c.x0 + 1e-6 || c.x1 <= a.x0 + 1e-6 || a.y1 <= c.y0 + 1e-6 || c.y1 <= a.y0 + 1e-6;
            expect(apart, `${a.id} and ${c.id} on ${b.id}, setup ${setup.index}`).toBe(true);
          }
        }
      });
    }
  });

  it('runs every grained part with the sheet: the blank lies along the sheet, the box walls are turned to match', () => {
    for (const b of blanks.slice(0, 2)) expect(b.grainAxis).toBeUndefined();
    for (const b of blanks.slice(2)) {
      expect(b.grainAxis).toBe('y');
      // Grain along Y: the blank's depth comes off the sheet's length, its width off the sheet's width.
      expect(b.size.width).toBeLessThanOrEqual(Math.min(stock.width, stock.height) + 1e-6);
      for (const p of b.setups[0]!.placements) {
        const part = parts.get(p.partId)!;
        expect(part.grain).toBeDefined();
        // On the blank the part's grain runs along Y: a part with grain across its width is turned, one with grain up its height is not.
        expect(p.turned, part.name).toBe(part.grain === 'width');
      }
    }
    expect(blanks[2]!.setups[0]!.placements[0]).toMatchObject({ partId: 'cabinet-1/side-left', turned: false });
    expect(blanks[4]!.setups[0]!.placements.every((p) => p.turned)).toBe(true);
  });

  it('gives each blank its own setups and flip: the fronts flip on pins, the case parts are laid out only', () => {
    expect(blanks.map((b) => b.setups.map((s) => s.faceUp).join(''))).toEqual(['BA', 'BA', 'A', 'A', 'A']);
    expect(blanks[0]!.setups[0]!.operationKeys).toEqual(['doors:hingeCup', 'job:pinHole']);
    expect(blanks[0]!.setups[1]!.operationKeys).toEqual([
      'doors:pocketClear',
      'drawerFronts:pocketClear',
      'doors:vBevel@60',
      'drawerFronts:vBevel@60',
      'doors:cutout',
      'drawerFronts:cutout',
    ]);
    // The right door is alone on blank 2: nothing of the drawer's there.
    expect(blanks[1]!.setups[1]!.operationKeys).toEqual(['doors:pocketClear', 'doors:vBevel@60', 'doors:cutout']);
    for (const b of blanks.slice(0, 2)) {
      expect(b.setups[0]!.pinHoles).toHaveLength(2);
      for (const pin of b.setups[0]!.pinHoles) expect(pin.x).toBeCloseTo(b.size.width / 2, 6);
    }
    // The case and box parts are worked on their inside faces only: one setup, no pins.
    for (const b of blanks.slice(2)) {
      expect(b.setups).toHaveLength(1);
      expect(b.setups[0]).toMatchObject({ faceUp: 'A', pinHoles: [], flipBefore: 'none' });
    }
    expect(blanks[2]!.setups[0]!.operationKeys).toEqual(['case:holes:shelf-pin@5', 'case:holes:hinge-plate@5', 'case:rabbet', 'case:cutout']);
    expect(blanks[4]!.setups[0]!.operationKeys).toEqual([
      'boxes:holes:front-screw@4.76',
      'boxes:groove',
      'boxes:rabbet',
      'boxes:cutout',
    ]);
  });

  it('writes a file per blank and setup that has something to cut, named by blank', () => {
    expect(job.files.map((f) => f.name)).toEqual([
      'base-cabinet-blank-1-setup-1-back.gcode',
      'base-cabinet-blank-1-setup-2-front.gcode',
      'base-cabinet-blank-2-setup-1-back.gcode',
      'base-cabinet-blank-2-setup-2-front.gcode',
      'base-cabinet-blank-3.gcode',
      'base-cabinet-blank-4.gcode',
      'base-cabinet-blank-5.gcode',
    ]);
    expect(job.programs.map((p) => [p.blank.id, p.setup.index, p.materialId])).toEqual([
      ['blank-1', 1, MDF_ID],
      ['blank-1', 2, MDF_ID],
      ['blank-2', 1, MDF_ID],
      ['blank-2', 2, MDF_ID],
      ['blank-3', 1, PLYWOOD_3_4_ID],
      ['blank-4', 1, PLYWOOD_3_4_ID],
      ['blank-5', 1, PLYWOOD_1_2_ID],
    ]);
    expect(job.files[0]!.text).toContain('Blank 1 of 5, setup 1 of 2: back face up');
    expect(job.files[1]!.text).toContain('M0 (MSG, Router OFF. Blank 1 of 5 done.)');
    const n = (v: number) => Number(v.toFixed(3));
    expect(job.files[2]!.text).toContain(`(Stock: XMIN=0 XMAX=${n(blanks[1]!.size.width)} YMIN=0 YMAX=${n(blanks[1]!.size.height)} ZMIN=-19 ZMAX=0)`);
  });

  it('keeps every file within its blank, the post rules and the parser', async () => {
    for (const [i, file] of job.files.entries()) {
      const blank = blanks.find((b) => b.id === job.programs[i]!.blank.id)!;
      expect(file.text).not.toMatch(/^M[35]\b/m);
      for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
      for (const p of moves(file.text)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(blank.size.width);
        expect(p.y).toBeLessThanOrEqual(blank.size.height);
      }
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  });

  it('cuts a turned part where it lies: the hinge cups inside the turned door, the cutout round it', () => {
    const [first] = blanks;
    const lines = (text: string) => text.split('\n');
    const section = (text: string, label: string) => {
      const all = lines(text);
      const from = all.findIndex((l) => l.includes(`(MSG, `) && l.includes(label));
      const next = all.findIndex((l, i) => i > from && /\(MSG, \d+\/\d+ /.test(l));
      return moves(text, from + 1, next < 0 ? Infinity : next);
    };

    // Back up: the door is mirrored left to right and turned; its cups are bored inside it.
    const back = footprints(first!, 0, parts).find((r) => r.id === 'doors-1/door-left')!;
    const cups = section(job.files[0]!.text, 'hinge cups');
    expect(cups.length).toBeGreaterThan(10);
    for (const p of cups.slice(1)) {
      expect(p.x).toBeGreaterThan(back.x0);
      expect(p.x).toBeLessThan(back.x1);
      expect(p.y).toBeGreaterThan(back.y0);
      expect(p.y).toBeLessThan(back.y1);
    }
    // A door's cups are along its hinge edge, top and bottom: turned, they are spread along X.
    const xs = cups.slice(1).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(400);

    // Front up: both cutouts together reach the bit's radius (and the finishing allowance) outside the parts.
    const rects = footprints(first!, 1, parts);
    const cut = section(job.files[1]!.text, 'Doors: cutout').concat(section(job.files[1]!.text, 'Drawer: cutout'));
    const reach = (pick: (p: { x: number; y: number }) => number) => [Math.min(...cut.slice(2).map(pick)), Math.max(...cut.slice(2).map(pick))];
    const [minX, maxX] = reach((p) => p.x);
    const [minY, maxY] = reach((p) => p.y);
    expect(minX).toBeLessThan(Math.min(...rects.map((r) => r.x0)) - 3);
    expect(minX).toBeGreaterThan(Math.min(...rects.map((r) => r.x0)) - 5);
    expect(maxX).toBeGreaterThan(Math.max(...rects.map((r) => r.x1)) + 3);
    expect(maxX).toBeLessThan(Math.max(...rects.map((r) => r.x1)) + 5);
    expect(minY).toBeGreaterThan(Math.min(...rects.map((r) => r.y0)) - 5);
    expect(maxY).toBeLessThan(Math.max(...rects.map((r) => r.y1)) + 5);
  });

  it('counts machine time and bit changes over all the blanks', () => {
    // Three on each MDF blank, and one on each of the others: the 1/8" bit for the holes and the groove, then the 1/4".
    expect(job.plan.summary.toolChanges).toBe(9);
    expect(job.plan.summary.machineSeconds).toBeGreaterThan(0);
    expect(job.plan.warnings.filter((w) => w.code === 'tightMargins').map((w) => w.message.split(':')[0])).toEqual([
      '3/4" Plywood, 1 of 2',
      '3/4" Plywood, 2 of 2',
    ]);
  });
});

describe('the face frame reference cabinet on its blanks', () => {
  it('keeps the three fronts on one blank, as before, and adds the sides and the box walls', () => {
    const { job } = jobFor('faceFrame');
    expect(job.plan.blanks.map((b) => [b.label, b.partIds.length])).toEqual([
      ['3/4" MDF', 3],
      ['3/4" Plywood, 1 of 2', 1],
      ['3/4" Plywood, 2 of 2', 1],
      ['1/2" Plywood', 4],
    ]);
    expect(job.plan.blanks[0]!.arrangement).toEqual([2, 1]);
    expect(job.files).toHaveLength(5);
  });

  it('nests the parts CNC-assisted pocket holes bring onto the CNC, turned so their grain runs with the sheet', () => {
    const { job, parts } = jobFor('faceFrame', (project) => {
      project.plan.pocketHoles = 'cncAssisted';
    });
    const third = job.plan.blanks.find((b) => b.label === '3/4" Plywood, 3 of 3')!;
    expect(third.partIds.map((id) => parts.get(id)!.name)).toEqual(['Bottom', 'Front stretcher', 'Back stretcher']);
    expect(third.grainAxis).toBe('y');
    expect(third.setups[0]!.placements.every((p) => p.turned)).toBe(true);
    expect(third.size.height).toBeLessThanOrEqual(job.plan.stock.height);
  });

  it('puts a plain rectangle the user moves to the CNC on a blank', () => {
    const { job } = jobFor('faceFrame', (project) => {
      project.plan.parts = { 'cabinet-1/back': { cutOut: 'cnc' } };
    });
    const back = job.plan.blanks.find((b) => b.materialId === PLYWOOD_1_4_ID)!;
    expect(back).toMatchObject({ label: '1/4" Plywood', partIds: ['cabinet-1/back'], grainAxis: 'y' });
    expect(back.setups[0]!.placements[0]!.turned).toBe(false);
  });
});

describe('one blank or several', () => {
  it("uses the user's own piece only when the job is one blank", () => {
    const own = createVanityProject();
    own.plan.blank.width = len('28"');
    own.plan.blank.height = len('30"');
    const one = buildJob(own, lowRiderJobShop()).plan.blanks;
    expect(one).toHaveLength(1);
    expect([one[0]!.size.width, one[0]!.size.height].map(frac)).toEqual(['28"', '30"']);

    const { job } = jobFor('frameless', (project) => {
      project.plan.blank.width = len('28"');
      project.plan.blank.height = len('30"');
    });
    expect(job.plan.blanks.length).toBeGreaterThan(1);
    for (const b of job.plan.blanks) expect(b.size).toMatchObject(b.minimum);
  });

  it('does not turn a part across the grain to make it fit: it gets a blank that says the stock is too small', () => {
    // A sheet too short for a 34-1/2" side, though it would fit turned.
    const { job } = jobFor('frameless', (project) => {
      project.plan.blank.stock = { width: len('40"'), height: len('30"') };
    });
    const side = job.plan.blanks.find((b) => b.partIds.includes('cabinet-1/side-left'))!;
    // The sheet's grain runs along its 40": the side lies along it, which this machine has no room for across X.
    expect(side.partIds).toEqual(['cabinet-1/side-left']);
    expect(side.setups[0]!.placements[0]!.turned).toBe(side.grainAxis === 'x');
    for (const b of job.plan.blanks.filter((x) => x.grainAxis)) {
      for (const p of b.setups[0]!.placements) {
        const part = [...job.parts, ...job.cabinetParts].find((x) => x.id === p.partId)!;
        expect(p.turned).toBe(b.grainAxis === 'y' ? part.grain === 'width' : part.grain === 'height');
      }
    }
  });
});

describe('plywood settings for the bits', () => {
  it('starts every bit on a copy of its MDF settings for each plywood, marked tune me', () => {
    for (const tool of lowRiderJobShop().tools) {
      for (const id of [PLYWOOD_3_4_ID, PLYWOOD_1_2_ID, PLYWOOD_1_4_ID]) expect(tool.settings[id]).toEqual(tool.settings[MDF_ID]);
      expect(tool.settings[PLYWOOD_3_4_ID]).not.toBe(tool.settings[MDF_ID]);
      expect(tool.tuneMe).toContain('settings');
    }
  });
});
