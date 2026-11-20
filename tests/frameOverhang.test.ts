// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boxOf, hungDesigns, cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, deriveUnderSink, drawerBox, frameOverhangOf, partBox, shopFor } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, DrawerDesign, Part, PlanWarning, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * A face frame that stands past the outside of each side of its box, by about 1/4". The cabinet's width is the
 * frame's; the box is narrower.
 */
const profile = createStarterShopProfile();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const Q = len('1/4"').mm;

function framed(change?: (project: Project) => void) {
  const project = createBaseCabinetProject('faceFrame');
  change?.(project);
  const shop = shopFor(project, profile);
  return { project, shop, cabinet: cabinetsOf(project)[0]!, parts: deriveCabinetParts(project, shop) };
}
const settings = (project: Project) => (project.context as CasesContext).settings;
const stored = (project: Project) => (project.context as CasesContext).pieces[0]!;
const byId = (parts: Part[], end: string) => parts.find((p) => p.id.endsWith(end))!;

describe('a face frame that overhangs the sides of its box', () => {
  it('left out, or on a frameless cabinet: nothing overhangs and the box is the cabinet', () => {
    const { cabinet, shop } = framed();
    expect(frameOverhangOf(cabinet, shop.materials)).toEqual({ left: 0, right: 0 });
    expect(boxOf(cabinet, shop.materials)).toEqual({ box: cabinet, shift: 0 });
    const frameless = createBaseCabinetProject('frameless');
    (frameless.context as CasesContext).settings.faceFrame.overhang = len('1/4"');
    expect(frameOverhangOf(cabinetsOf(frameless)[0]!, shopFor(frameless, profile).materials)).toEqual({ left: 0, right: 0 });
  });

  it('1/4" each side: the frame, the openings and the fronts are as they were; the box is 1/2" narrower and stands 1/4" in', () => {
    const flush = framed();
    const proud = framed((p) => (settings(p).faceFrame.overhang = len('1/4"')));
    expect(frameOverhangOf(proud.cabinet, proud.shop.materials)).toEqual({ left: Q, right: Q });
    // The cabinet is as wide as ever, and so is everything of its frame and its fronts.
    expect(proud.cabinet.size.width.mm).toBe(flush.cabinet.size.width.mm);
    const frame = (parts: Part[]) => parts.filter((p) => p.role === 'frameStile' || p.role === 'frameRail').map((p) => ({ id: p.id, size: p.size, at: p.placement!.origin }));
    expect(frame(proud.parts)).toEqual(frame(flush.parts));
    expect(deriveCabinetOpenings(proud.cabinet, proud.shop.materials)).toEqual(deriveCabinetOpenings(flush.cabinet, flush.shop.materials));
    const fronts = (x: typeof flush) => deriveParts(x.project, x.shop).map((p) => ({ id: p.id, size: p.size, at: p.placement!.origin }));
    expect(fronts(proud)).toEqual(fronts(flush));
    // The sides stand a quarter inch inside the frame's edges.
    const W = proud.cabinet.size.width.mm;
    const [left, right] = [partBox(byId(proud.parts, '/side-left')), partBox(byId(proud.parts, '/side-right'))];
    expect(left.min[0]).toBeCloseTo(Q, 6);
    expect(right.max[0]).toBeCloseTo(W - Q, 6);
    expect(partBox(byId(flush.parts, '/side-left')).min[0]).toBeCloseTo(0, 6);
    // What runs between the sides is a half inch shorter; the sides themselves are the same.
    for (const end of ['/bottom', '/back', '/stretcher-front', '/stretcher-back', '/toe-kick']) {
      const [a, b] = [byId(flush.parts, end), byId(proud.parts, end)];
      if (!a) continue;
      expect(a.size.width - b.size.width, end).toBeCloseTo(2 * Q, 6);
      expect(b.size.height, end).toBeCloseTo(a.size.height, 6);
    }
    expect(byId(proud.parts, '/side-left').size).toEqual(byId(flush.parts, '/side-left').size);
    // Every part of the box is between the two sides' outside faces; only the frame reaches the cabinet's edges.
    for (const p of proud.parts.filter((x) => x.role !== 'frameStile' && x.role !== 'frameRail')) {
      const box = partBox(p);
      expect(box.min[0]!, p.id).toBeGreaterThanOrEqual(Q - 1e-6);
      expect(box.max[0]!, p.id).toBeLessThanOrEqual(W - Q + 1e-6);
    }
    const stiles = proud.parts.filter((p) => p.role === 'frameStile').map(partBox);
    expect(Math.min(...stiles.map((b) => b.min[0]!))).toBeCloseTo(0, 6);
    expect(Math.max(...stiles.map((b) => b.max[0]!))).toBeCloseTo(W, 6);
  });

  it('the drawer box and its slides stay with the opening; what fills the space to the side is that much thinner', () => {
    const flush = framed();
    const proud = framed((p) => (settings(p).faceFrame.overhang = len('1/4"')));
    const drawer = (x: typeof flush) => hungDesigns(x.project, x.shop).find((d): d is DrawerDesign => d.template === 'drawer')!;
    const [a, b] = [drawerBox(drawer(flush), flush.project, flush.shop)!, drawerBox(drawer(proud), proud.project, proud.shop)!];
    expect(b.size).toEqual(a.size);
    expect(b.mount).toBe(a.mount);
    // (A strip is its stock's thickness or the space's, whichever is less: thinner here, by no more than the overhang.)
    if (a.stripThickness !== undefined) {
      expect(b.stripThickness!).toBeLessThan(a.stripThickness);
      expect(a.stripThickness - b.stripThickness!).toBeLessThanOrEqual(Q + 1e-6);
    }
    // The box's own boards are where they were in the cabinet.
    const walls = (x: typeof flush) => deriveDrawerBoxParts(x.project, x.shop).filter((p) => p.role?.startsWith('box')).map((p) => ({ id: p.id, size: p.size, at: p.placement!.origin.map((v) => Math.round(v * 1000) / 1000) }));
    expect(walls(proud)).toEqual(walls(flush));
    // A strip on the side stands on the side's inside face, which is a quarter inch further in.
    const strip = (x: typeof flush) => deriveDrawerBoxParts(x.project, x.shop).find((p) => p.role === 'buildOut');
    if (strip(flush) && strip(proud)) {
      const side = partBox(byId(proud.parts, '/side-left'));
      const strips = deriveDrawerBoxParts(proud.project, proud.shop).filter((p) => p.role === 'buildOut').map(partBox);
      expect(Math.min(...strips.map((s) => s.min[0]!))).toBeCloseTo(side.max[0]!, 4);
    }
  });

  it('a cabinet has its own at one side or both: flush at an end that shows, more at a wall', () => {
    const { cabinet, shop, parts } = framed((p) => {
      settings(p).faceFrame.overhang = len('1/4"');
      stored(p).frameOverhang = { left: len('0"'), right: len('1/2"') };
    });
    expect(frameOverhangOf(cabinet, shop.materials)).toEqual({ left: 0, right: 2 * Q });
    const W = cabinet.size.width.mm;
    expect(partBox(byId(parts, '/side-left')).min[0]).toBeCloseTo(0, 6);
    expect(partBox(byId(parts, '/side-right')).max[0]).toBeCloseTo(W - 2 * Q, 6);
    // One side only said: the other follows the frame's.
    const one = framed((p) => {
      settings(p).faceFrame.overhang = len('1/4"');
      stored(p).frameOverhang = { left: len('0"') };
    });
    expect(frameOverhangOf(one.cabinet, one.shop.materials)).toEqual({ left: 0, right: Q });
  });

  it('never more than leaves the side behind its stile', () => {
    const { cabinet, shop } = framed((p) => (settings(p).faceFrame.overhang = len('3"')));
    const most = cabinet.faceFrame.stileWidth.mm - shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    expect(frameOverhangOf(cabinet, shop.materials)).toEqual({ left: most, right: most });
    // The side's inside face is then in line with the opening's edge.
    const opening = deriveCabinetOpenings(cabinet, shop.materials)[0]!;
    const parts = deriveCabinetParts(framed((p) => (settings(p).faceFrame.overhang = len('3"'))).project, shop);
    expect(partBox(byId(parts, '/side-left')).max[0]).toBeCloseTo(opening.origin.x, 4);
  });

  it('what is inside goes with the box: trays under a sink are worked out behind the same openings', () => {
    const inside = (p: Project) => (stored(p).inside = { obstacles: [], organizers: [{ id: 'tray-bottom', kind: 'tray' }] });
    const flush = framed((p) => {
      stored(p).layout = { ...stored(p).layout };
      inside(p);
    });
    const proud = framed((p) => {
      settings(p).faceFrame.overhang = len('1/4"');
      inside(p);
    });
    const [a, b] = [deriveUnderSink(flush.cabinet, flush.shop.materials, flush.shop.hardware), deriveUnderSink(proud.cabinet, proud.shop.materials, proud.shop.hardware)];
    if (!a || !b) return;
    // Its build-outs are whole layers of the case material on the sides, which are a quarter inch further in: the tray
    // between them is that much narrower each side, and still in the middle of the cabinet.
    expect(a.trays[0]!.width - b.trays[0]!.width).toBeCloseTo(2 * Q, 4);
    expect(b.buildOutLayers).toBe(a.buildOutLayers);
    const W = proud.cabinet.size.width.mm;
    for (const p of b.parts) {
      const box = partBox(p);
      expect(box.min[0]!, p.id).toBeGreaterThan(Q);
      expect(box.max[0]!, p.id).toBeLessThan(W - Q);
    }
    const across = (parts: Part[]) => {
      const boxes = parts.filter((p) => p.role?.startsWith('box')).map(partBox);
      return (Math.min(...boxes.map((x) => x.min[0]!)) + Math.max(...boxes.map((x) => x.max[0]!))) / 2;
    };
    expect(across(b.parts)).toBeCloseTo(across(a.parts), 4);
  });

  it('as a job: every file parses, and nothing blocks', async () => {
    const project = createBaseCabinetProject('faceFrame');
    settings(project).faceFrame.overhang = len('1/4"');
    const job = buildJob(project, createStarterShop());
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.files.length).toBeGreaterThan(0);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  }, 60000);
});
