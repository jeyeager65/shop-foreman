// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PLUMBING_CLEAR, cabinetsOf, createUnderSink, type SinkStorage, deriveUnderSink } from '@/design';
import { jigItems } from '@/jigs/catalog';
import { SLIDE_JIG, buildSlideJigObjects, buildSlideJigs3mf, slideJigProblems, slideJigProfile } from '@/jigs/slideJig';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { TILE, templatesHtml, tilesOf } from '@/job/templatesHtml';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, StoredCabinet } from '@/model';
import { createBaseCabinetProject, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: a notch printed 1:1 on paper, and a printed jig that sets a slide's strip level. */
const shop = createStarterShop();
const vanity = (storage: SinkStorage, change?: (c: StoredCabinet) => void) => {
  const project = createBaseCabinetProject('faceFrame', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('30"');
  stored.adjustableShelves = 0;
  stored.inside = createUnderSink(storage);
  makeExisting(project, stored.id);
  change?.(stored);
  return project;
};
const built = (project: ReturnType<typeof vanity>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;

describe('paper templates', () => {
  it('there is one for each tray and shelf cut round something, and none for a plain one', () => {
    expect(built(vanity({ bottomTray: true })).templates).toEqual([]);
    const shelf = built(vanity({ upper: 'shelf' }, (c) => (c.inside!.obstacles[0]!.clearUnder = len('6"'))));
    expect(shelf.templates.map((t) => t.name)).toEqual(['Fixed shelf: its notches']);
    expect(built(vanity({ bottomTray: true, upper: 'tray' })).templates.map((t) => t.name)).toEqual(['Upper tray: its notch']);
  });

  it("is the notch at its real size: as wide as the trap and its clearance, the board 40 mm round it, placed from the cabinet's left side", () => {
    const build = built(vanity({ bottomTray: true, upper: 'tray' }));
    const t = build.templates[0]!;
    const trap = build.obstacles[0]!;
    const xs = [...new Set(t.outline.map((p) => p.x))].sort((a, b) => a - b);
    // The board's left edge, the notch's two sides, the board's right edge.
    expect(xs).toHaveLength(4);
    expect(xs[2]! - xs[1]!).toBeCloseTo(trap.max[0] - trap.min[0] + 2 * PLUMBING_CLEAR, 6);
    expect(xs[1]! - xs[0]!).toBeCloseTo(40, 6);
    expect(t.width).toBeCloseTo(xs[3]!, 6);
    // The notch is open at the back (the top of the sheet) and stops 40 mm short of the bottom.
    const deep = Math.max(...t.outline.filter((p) => p.x === xs[1]).map((p) => p.y));
    expect(t.height - deep).toBeCloseTo(40, 6);
    const tCase = shop.materials.find((m) => m.id === cabinetsOf(vanity({}))[0]!.materials.caseId)!.measuredThickness.mm;
    expect(t.fromLeft).toBeCloseTo(trap.min[0] - PLUMBING_CLEAR - 40 - tCase, 6);
    expect(t.words).toMatch(/Its left edge is \d+ mm \(\d+\.\d\d"\) from the inside of the cabinet's left side/);
  });

  it('prints at real size, in tiles when it is larger than a sheet', () => {
    const t = built(vanity({ bottomTray: true, upper: 'tray' })).templates[0]!;
    const html = templatesHtml('Vanity', [t], (mm) => `${mm} mm`);
    expect(html).toContain(`<svg width="${TILE.width}mm" height="${TILE.height}mm"`);
    expect(html).toContain('Upper tray: its notch');
    expect(html).toContain('Print at 100%');
    const { across, down } = tilesOf(t);
    expect(html.split('<section>').length - 1).toBe(across * down);
    expect(tilesOf({ width: 400, height: 250 })).toEqual({ across: 3, down: 2 });
    expect(templatesHtml('Vanity', [{ ...t, width: 400, height: 250 }], String)).toContain('Sheet 6 of 6 (row 2, column 3)');
    expect(templatesHtml('Vanity', [], String)).toContain('no template to print');
  });
});

describe('the slide jig', () => {
  it('is an L with a gusset, as high as its ledge, a closed solid that prints on its side', () => {
    const profile = slideJigProfile(60);
    expect(Math.max(...profile.map((p) => p[1]))).toBe(60);
    expect(Math.max(...profile.map((p) => p[0]))).toBe(SLIDE_JIG.foot);
    const [jig] = buildSlideJigObjects([{ height: 60, quantity: 2 }]);
    expect(jig!.placements).toHaveLength(2);
    const { positions, triangles, volume } = jig!.mesh;
    expect(positions.length / 3).toBe(profile.length * 2);
    // Closed: every edge is shared by two triangles, once each way.
    const edges = new Map<string, number>();
    for (let i = 0; i < triangles.length; i += 3) {
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const key = `${triangles[i + a]}>${triangles[i + b]}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const [edge, count] of edges) {
      expect(count, edge).toBe(1);
      expect(edges.get(edge.split('>').reverse().join('>')), edge).toBe(1);
    }
    expect(volume).toBeGreaterThan(SLIDE_JIG.column * 60 * SLIDE_JIG.width);
    expect(buildSlideJigs3mf([{ height: 60, quantity: 2 }]).length).toBeGreaterThan(500);
  });

  it('says so when it is too low to print or too tall for a bed', () => {
    expect(slideJigProblems(25.4)).toEqual([]);
    expect(slideJigProblems(4)[0]).toMatch(/at least 10 mm/);
    expect(slideJigProblems(273)[0]).toMatch(/taller than most printers' beds.*cut two boards/);
  });

  it("a job has a pair for each height a strip is set at on the cabinet's sides, on its lists and in its checklist; a frame needs none", () => {
    const project = vanity({ bottomTray: true, mounting: 'strips' });
    const build = built(project);
    expect(build.jigHeights).toHaveLength(1);
    expect(build.jigHeights[0]).toBeGreaterThan(len('3/4"').mm);
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)} mm`);
    expect(lists.slideJigs).toEqual([{ height: build.jigHeights[0], quantity: 2 }]);
    expect(lists.hardware.some((row) => /^Slide jigs, \d+ mm high$/.test(row.item) && row.quantity === 2)).toBe(true);
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ')).toContain('Print the slide jigs');
    const framed = vanity({ bottomTray: true });
    expect(built(framed).jigHeights).toEqual([]);
    expect(buildLists(buildJob(framed, shop), framed, shop, String).slideJigs).toBeUndefined();
  });

  it('is on the jigs page with no project', () => {
    const item = jigItems(createStarterShopProfile()).find((i) => i.id === 'slide-jig')!;
    expect(item.made).toBe('print');
    expect(item.problems(item.defaults)).toEqual([]);
    expect(item.problems({ height: 300 })).toHaveLength(1);
  });

  it("Build's checklist says to try the paper template in a cabinet that is already there", () => {
    const project = vanity({ bottomTray: true, upper: 'tray' });
    const job = buildJob(project, shop);
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ')).toContain('print its paper template');
  });
});
