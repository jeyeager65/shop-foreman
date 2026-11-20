import { describe, expect, it } from 'vitest';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { HUB, cabinetBack, cabinetsOf, hubOf, hubProblems, hubShapeColour, hubShapes, partBox, storedCases } from '@/design';
import { isApplianceShape } from '@/design/appliances';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Feature, PlanWarning } from '@/model';
import { activeMachine } from '@/plan';
import { createFoldingShopTableProject, createShopTableProject as createPlainTableProject } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * A power hub in the space at the top of a shop table's front-left cabinet (after lr4-sandbox's table hub): outlets
 * and a port in the side, a switch panel screwed on at the front, the upper back a panel that comes off, with a
 * second port.
 */
const shop = createStarterShop();
const L = (mm: number) => `${Math.round((mm / 25.4) * 100) / 100}"`;
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const openings = (features: Feature[]) => features.filter((f) => f.kind === 'cutout' && f.inside);
const box = (f: Feature) => {
  if (f.kind !== 'cutout') throw new Error('not an outline');
  const [xs, ys] = [f.outline.map((p) => p.x), f.outline.map((p) => p.y)];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/** The hub is the folding table's only. */
const createShopTableProject = createFoldingShopTableProject;

describe("the shop table's power hub", () => {
  it('is on the folding table only: the plain table has a 12" open space there, and nothing of a hub', () => {
    const plain = createPlainTableProject();
    const [first] = cabinetsOf(plain);
    expect(first!.hub).toBeUndefined();
    expect(Math.round(first!.layout.rows[0]!.height!.mm / 25.4)).toBe(12);
    expect(buildJob(plain, shop).cabinetParts.some((p) => /\/hub-/.test(p.id))).toBe(false);
  });

  const project = createShopTableProject();
  const job = buildJob(project, shop);
  const cabinet = cabinetsOf(project)[0]!;
  const hub = hubOf(cabinet, shop.materials)!;
  const mine = job.cabinetParts.filter((p) => p.designObjectId === cabinet.id);
  const part = (key: string) => mine.find((p) => p.id === `${cabinet.id}/${key}`)!;

  it('is in a 7" space at the top of the front-left cabinet, its outlets in the left side, everything as high as it goes', () => {
    expect(cabinet.name).toBe('Front, open over doors');
    expect(hub.side).toBe('left');
    expect(L(hub.y1 - hub.y0)).toBe('7"');
    expect(hub.y1 - hub.mid).toBeCloseTo(HUB.margin + HUB.plate.height / 2, 6);
    expect(hubProblems(cabinet, shop.materials)).toEqual([]);
    // No other cabinet has one.
    expect(cabinetsOf(project).filter((c) => hubOf(c, shop.materials)).length).toBe(1);
    // The doors under it are 5" taller than under the 12" space it was, and no door hangs on the space itself.
    const sets = new Set(project.designObjects.filter((d) => d.mounting.openingId.startsWith(`${cabinet.id}/`)).map((d) => d.id));
    const fronts = job.parts.filter((p) => !p.role && p.placement && sets.has(p.designObjectId));
    expect(fronts.length).toBe(2);
    expect(fronts.every((p) => partBox(p).max[1] < hub.y0)).toBe(true);
    expect(Math.min(...fronts.map((p) => p.size.height))).toBeGreaterThan(len('20"').mm);
  });

  it('cuts three box openings and the port through the left side, on one line, and nothing through the right', () => {
    const cuts = openings(part('side-left').features);
    expect(cuts.map((f) => f.id)).toEqual(['hub-accessory', 'hub-outlet', 'hub-inlet', 'hub-port']);
    const boxes = cuts.map(box);
    for (const b of boxes.slice(0, 3)) {
      expect(b.x1 - b.x0).toBeCloseTo(HUB.box.width, 6);
      expect(b.y1 - b.y0).toBeCloseTo(HUB.box.height, 6);
    }
    expect(boxes[3]!.x1 - boxes[3]!.x0).toBeCloseTo(HUB.port.hole, 1);
    // Each on the hub's line, from the front back, clear of each other, of the side's edges and of the shelf under them.
    const side = part('side-left');
    for (const [i, b] of boxes.entries()) {
      expect((b.y0 + b.y1) / 2).toBeCloseTo(hub.mid, 1);
      expect(b.y0).toBeGreaterThan(hub.y0 + HUB.margin);
      expect(b.x0).toBeGreaterThan((boxes[i - 1]?.x1 ?? 0) + 10);
      expect(b.x1).toBeLessThan(side.size.width - HUB.margin);
    }
    expect(openings(part('side-right').features)).toEqual([]);
  });

  it('closes the space with a switch panel, cut for the paddle switch and the three-gang box, centred across it', () => {
    const panel = part('hub-panel');
    expect(panel.name).toBe('Hub switch panel');
    expect([panel.size.width, panel.size.height]).toEqual([hub.x1 - hub.x0, hub.y1 - hub.y0]);
    // Flush with the case front, in the opening.
    const at = partBox(panel);
    expect(at.max[2]).toBeCloseTo(0, 6);
    expect([at.min[0], at.min[1]]).toEqual([hub.x0, hub.y0]);
    const [paddle, switches] = openings(panel.features).map(box);
    expect(paddle!.x1 - paddle!.x0).toBeCloseTo(HUB.paddle.cut.width, 6);
    expect(switches!.x1 - switches!.x0).toBeCloseTo(HUB.box3, 6);
    expect(switches!.x0).toBeGreaterThan(paddle!.x1 + HUB.margin);
    for (const b of [paddle!, switches!]) expect((b.y0 + b.y1) / 2 + hub.y0).toBeCloseTo(hub.mid, 6);
    // The pair is centred: as far from one end as from the other, the paddle's face and the plate counted.
    const [first, last] = [(paddle!.x0 + paddle!.x1) / 2 - HUB.paddle.face.width / 2, (switches!.x0 + switches!.x1) / 2 + HUB.plate3 / 2];
    expect(first).toBeCloseTo(panel.size.width - last, 6);
    expect(first).toBeGreaterThan(2 * HUB.margin);
  });

  it('splits the back: the lower panel as any back, the upper one an access panel with the second port', () => {
    const [back, access] = [part('back'), part('hub-back')];
    expect(access.name).toBe('Hub access panel');
    expect(openings(back.features)).toEqual([]);
    // The back stops at the top of the shelf under the hub's space, covering the shelf's edge.
    const [low, high] = [partBox(back), partBox(access)];
    expect(low.max[1]).toBeCloseTo(hub.y0, 6);
    // The access panel is set in between the sides, standing on the shelf under the stretcher, a little smaller
    // than its opening, and its outside face is level with the back's below it.
    expect(high.min[2]).toBeCloseTo(low.min[2], 6);
    expect(high.min[1]).toBeCloseTo(hub.y0 + HUB.fit / 2, 6);
    expect(high.max[1]).toBeCloseTo(hub.y1 - HUB.fit / 2, 6);
    expect([high.min[0], high.max[0]].map((v) => Math.round(v * 1000) / 1000)).toEqual([hub.x0 + HUB.fit / 2, hub.x1 - HUB.fit / 2].map((v) => Math.round(v * 1000) / 1000));
    // Nothing of the cabinet stands further back than its thin back.
    expect(cabinetBack(mine)).toBeCloseTo(-low.min[2], 6);
    // It is of the case material, thicker than the back: it carries a port and is screwed on and off.
    expect(access.materialId).toBe(cabinet.materials.caseId);
    expect(access.size.thickness).toBeCloseTo(hub.t, 6);
    expect(back.size.thickness).toBeLessThan(hub.t);
    const [port] = openings(access.features).map(box);
    expect(port!.x1 - port!.x0).toBeCloseTo(HUB.port.hole, 1);
    expect((port!.y0 + port!.y1) / 2 + high.min[1]).toBeCloseTo(hub.mid, 1);
    // The back stretcher lies flat under the top, out of the opening the access panel leaves; the project's is a nailer.
    expect(cabinet.joinery.backStretcherForm).toBe('nailer');
    const stretcher = partBox(part('stretcher-back'));
    expect(stretcher.max[1] - stretcher.min[1]).toBeCloseTo(hub.t, 6);
    const other = job.cabinetParts.find((p) => p.id.endsWith('/stretcher-back') && p.designObjectId !== cabinet.id)!;
    expect(partBox(other).max[1] - partBox(other).min[1]).toBeGreaterThan(50);
  });

  it('gives the two panels cleats to be screwed to: two at the front behind the switch panel, two at the back', () => {
    const cleats = mine.filter((p) => p.id.includes('/hub-cleat-'));
    expect(cleats.map((p) => p.name)).toEqual(['Hub cleat, front left', 'Hub cleat, front right', 'Hub cleat, back left', 'Hub cleat, back right']);
    const panel = partBox(part('hub-panel'));
    const access = partBox(part('hub-back'));
    for (const c of cleats) {
      const at = partBox(c);
      // As tall as the space, against the inside of a side.
      expect([at.min[1], at.max[1]]).toEqual([hub.y0, hub.y1]);
      expect(Math.min(Math.abs(at.min[0] - hub.x0), Math.abs(at.max[0] - hub.x1))).toBeLessThan(1e-6);
      // Its face meets the back of the switch panel, or the inside of the access panel.
      if (c.name.includes('front')) expect(at.max[2]).toBeCloseTo(panel.min[2], 6);
      else expect(at.min[2]).toBeCloseTo(access.max[2], 6);
      // A plain strip: the saw's, with no bevel.
      const plan = job.plan.parts.find((x) => x.partId === c.id)!;
      expect(plan.cutOut).not.toBe('cnc');
      expect(plan.steps.some((s) => /bevel/.test(s.label))).toBe(false);
    }
    // Clear of the first box in the side and of the port.
    const cuts = openings(part('side-left').features).map(box);
    expect(cuts[0]!.x0).toBeGreaterThan(hub.t + HUB.cleat + 10);
    expect(cuts[3]!.x1).toBeLessThan(part('side-left').size.width - HUB.cleat - 10);
  });

  it('has no finished back over the row: a shop table; an island that has one stops it behind the hub, in rectangles', () => {
    expect(mine.some((p) => /\/island-back(-\d+)?$/.test(p.id))).toBe(false);
    const finished = createShopTableProject();
    delete (finished.context as CasesContext).islands![0]!.finishedBack;
    const made = buildJob(finished, shop);
    const pieces = made.cabinetParts.filter((p) => /\/island-back(-\d+)?$/.test(p.id));
    expect(pieces.map((p) => p.name)).toEqual(['Finished back 1', 'Finished back 2']);
    const [low, full] = pieces.map((p) => partBox(p));
    // Behind the hub's cabinet it stops where the back does; behind the rest it is whole.
    expect([low!.min[0], low!.max[0]]).toEqual([0, cabinet.size.width.mm]);
    expect(low!.max[1]).toBeCloseTo(hub.split, 6);
    expect(full!.min[0]).toBeCloseTo(cabinet.size.width.mm, 6);
    expect(full!.max[1]).toBeCloseTo(cabinet.size.height.mm, 6);
    for (const p of pieces) {
      expect(p.features.length).toBe(1);
      expect(made.plan.parts.find((x) => x.partId === p.id)!.cutOut).not.toBe('cnc');
    }
    expect(made.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });

  it('plans with nothing in the way, the side and the two panels cut on the CNC, and its G-code parses', async () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    for (const key of ['side-left', 'hub-panel', 'hub-back']) expect(job.plan.parts.find((p) => p.partId === `${cabinet.id}/${key}`)!.cutOut).toBe('cnc');
    expect(job.files.length).toBeGreaterThan(0);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.segments.some((s) => s.type === 'cut')).toBe(true);
    }
  });

  it('lists what is bought for it, with the warning first, and says how it goes together', () => {
    const lines = buildLists(job, project, shop, L).hardware.filter((h) => h.group === 'Power hub');
    expect(lines[0]!.item).toMatch(/120 V house wiring/);
    expect(lines[0]!.note).toMatch(/not an electrical design/);
    const items = lines.map((h) => h.item).join('\n');
    for (const word of ['Power inlet', 'Duplex receptacles', 'paddle switch', 'Toggle switches', 'Pilot lamp', 'single-gang', 'three-gang', 'Dust ports', 'hose, a short length', 'Hose ground', 'NM-B', 'Screws for the switch panel']) expect(items).toContain(word);
    expect(lines.find((h) => h.item.startsWith('Dust ports'))!.quantity).toBe(2);
    // Nothing of it flexes: no cord, no hinge.
    expect(items).not.toMatch(/Flexible cord/);
    const section = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title.startsWith('Power hub'))!;
    expect(section.title).toBe('Power hub: Front, open over doors');
    expect(section.steps.length).toBe(8);
    expect(section.steps[0]!.text).toMatch(/not an electrical design/);
    expect(section.steps.map((s) => s.text).join(' ')).toMatch(/access panel/);
  });

  it('draws what is bought, for the picture only, each piece in a colour of its own', () => {
    const shapes = hubShapes(cabinet, shop.materials);
    expect(shapes.length).toBeGreaterThan(20);
    expect(shapes.every((p) => isApplianceShape(p.id) && hubShapeColour(p.id) !== undefined && !job.cabinetParts.some((q) => q.id === p.id) && !p.moves)).toBe(true);
    expect(hubShapeColour(`${cabinet.id}/side-left`)).toBeUndefined();
    // On the outside of the left side: the plates and the port stand out from it, under the table's overhang.
    const port = partBox(shapes.find((p) => p.name === 'Dust port')!);
    expect(port.min[0]).toBeCloseTo(-HUB.port.out, 6);
    expect(port.max[0]).toBeLessThan(0);
    // The paddle stands proud of the panel, in front of the case; the second port stands out behind the back.
    expect(partBox(shapes.find((p) => p.name === 'STOP paddle')!).max[2]).toBeCloseTo(HUB.paddle.proud, 6);
    expect(partBox(shapes.find((p) => p.name === 'Back dust port')!).min[2]).toBeCloseTo(partBox(part('hub-back')).min[2] - HUB.port.out, 6);
    // Nothing of it says where the cabinet's back is, the port behind it included.
    expect(cabinetBack([...mine, ...shapes])).toBeCloseTo(cabinetBack(mine), 6);
  });

  it('is on the folding table too, and on the right side when asked, mirrored', () => {
    const folding = createFoldingShopTableProject();
    expect(hubOf(cabinetsOf(folding)[0]!, shop.materials)?.side).toBe('left');
    expect(buildJob(folding, shop).plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const other = createShopTableProject();
    storedCases(other.context as CasesContext)[0]!.hub = { side: 'right' };
    const made = buildJob(other, shop).cabinetParts;
    const id = cabinetsOf(other)[0]!.id;
    const of = (key: string) => made.find((p) => p.id === `${id}/${key}`)!;
    expect(openings(of('side-right').features).length).toBe(4);
    expect(openings(of('side-left').features)).toEqual([]);
    // The panel's pair stays centred, the paddle now toward the right; the back port moves to the right too.
    const [paddle, switches] = openings(of('hub-panel').features).map(box);
    expect(paddle!.x0).toBeGreaterThan(switches!.x1);
    const [here, there] = [box(openings(part('hub-back').features)[0]!), box(openings(of('hub-back').features)[0]!)];
    expect(here.x0).toBeCloseTo(of('hub-back').size.width - there.x1, 6);
    // The two sides are mirror images: the port is as far behind the case front in either.
    const left = box(openings(part('side-left').features)[3]!);
    const right = box(openings(of('side-right').features)[3]!);
    expect(part('side-left').size.width - left.x1).toBeCloseTo(right.x0, 6);
  });

  it('says why it cannot be made, and then makes nothing of it', () => {
    const low = createShopTableProject();
    storedCases(low.context as CasesContext)[0]!.layout.rows[0]!.height = len('6"');
    expect(hubProblems(cabinetsOf(low)[0]!, shop.materials)[0]).toMatch(/too low/);
    expect(hubOf(cabinetsOf(low)[0]!, shop.materials)).toBeUndefined();
    const parts = buildJob(low, shop).cabinetParts;
    expect(parts.some((p) => p.id.endsWith('/hub-panel') || p.id.endsWith('/hub-back') || p.id.includes('/hub-cleat-'))).toBe(false);
    expect(openings(parts.find((p) => p.id.endsWith('cabinet-1/side-left'))!.features)).toEqual([]);
    const narrow = createShopTableProject();
    storedCases(narrow.context as CasesContext)[0]!.size.width = len('12"');
    expect(hubProblems(cabinetsOf(narrow)[0]!, shop.materials)[0]).toMatch(/too narrow/);
    // A back in a groove cannot come off.
    const grooved = createShopTableProject();
    (grooved.context as CasesContext).settings.joinery.back = 'groove';
    expect(hubProblems(cabinetsOf(grooved)[0]!, shop.materials).join(' ')).toMatch(/groove/);
    // No hub: nothing of it.
    const none = createShopTableProject();
    delete storedCases(none.context as CasesContext)[0]!.hub;
    expect(buildJob(none, shop).cabinetParts.some((p) => p.id.endsWith('/hub-panel') || p.id.endsWith('/hub-back'))).toBe(false);
    expect(hubShapes(cabinetsOf(none)[0]!, shop.materials)).toEqual([]);
  });
});
