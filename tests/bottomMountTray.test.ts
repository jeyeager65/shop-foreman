// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BOTTOM_SLIDE, buildCabinetAssembly, cabinetsOf, createOrganizer, deriveCabinetOpenings, deriveCabinetParts, deriveUnderSink, onBottomSlides, partBox, shopFor, traySlideMounts } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject, makeBlind, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/** A tray on the cabinet's floor on bottom-mount slides: a choice for a tray on the floor only. */
const profile = createStarterShopProfile();
const blindCorner = (organizers: Organizer[]) => {
  const project = createBaseCabinetProject('frameless', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  stored.size.width = len('48"');
  stored.size.depth = len('24"');
  makeBlind(project, stored.id, 'left');
  if (stored.corner?.kind === 'blind') stored.corner.blind = len('24"');
  stored.inside = { obstacles: [], organizers };
  makeExisting(project, stored.id);
  const shop = shopFor(project, profile);
  const cabinet = () => cabinetsOf(project)[0]!;
  return { project, shop, cabinet, build: () => deriveUnderSink(cabinet(), shop.materials, shop.hardware)! };
};
const side: Organizer = { id: 'tray-bottom', kind: 'tray' };
const under: Organizer = { id: 'tray-bottom', kind: 'tray', slides: 'bottom' };
const boxOf = (parts: Part[]) => {
  const boxes = parts.map(partBox);
  return { min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))), max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!))) };
};
const trayParts = (parts: Part[]) => parts.filter((p) => p.id.includes('/sink-tray-bottom/tray-'));
const blindParts = (parts: Part[]) => parts.filter((p) => /\/sink-blind\/[^/]+$/.test(p.id));

describe('a tray on bottom-mount slides', () => {
  it('is only a tray on the floor', () => {
    expect(onBottomSlides(under)).toBe(true);
    expect(onBottomSlides(side)).toBe(false);
    expect(onBottomSlides({ ...under, up: len('8"') })).toBe(false);
    expect(onBottomSlides({ ...createOrganizer('shelf'), slides: 'bottom' })).toBe(false);
  });

  it('has nothing beside it: no frame, no strips, and it is wider, from one edge of the door opening to the other', () => {
    const [was, now] = [blindCorner([side]), blindCorner([under])];
    const [a, b] = [was.build(), now.build()];
    expect(a.frame).toBeDefined();
    expect(b.frame).toBeUndefined();
    expect(b.parts.some((p) => p.role === 'buildOut' || p.id.includes('/sink-frame/'))).toBe(false);
    // (Here about an inch and a half: the two slides' clearances and what the standards stood in from the opening.)
    expect(b.trays[0]!.width).toBeGreaterThan(a.trays[0]!.width + 30);
    const opening = deriveCabinetOpenings(now.cabinet(), now.shop.materials).at(-1)!;
    const box = boxOf(trayParts(b.parts));
    // Inside the door opening, clear of the hinges at each edge.
    expect(box.min[0]!).toBeGreaterThan(opening.origin.x + 10);
    expect(box.max[0]!).toBeLessThan(opening.origin.x + opening.width - 10);
    expect(opening.width - (box.max[0]! - box.min[0]!)).toBeLessThan(45);
  });

  it('lies on its slides: its bottom 27 mm off the floor and as thick as its walls, its length one the slides come in', () => {
    const { build } = blindCorner([under]);
    const b = build();
    expect(b.bottomSlides).toEqual([{ tray: 'cabinet-1/sink-tray-bottom', name: BOTTOM_SLIDE.name, length: expect.objectContaining({ unit: 'in' }), height: 27 }]);
    const bottom = b.parts.find((p) => p.id.endsWith('/sink-tray-bottom/tray-bottom'))!;
    const sideWall = b.parts.find((p) => p.id.endsWith('/tray-side-left'))!;
    expect(bottom.size.thickness).toBeCloseTo(sideWall.size.thickness, 6);
    expect(bottom.materialId).toBe(sideWall.materialId);
    // Its underside is the slides' height above the cabinet's floor; its walls hang a little lower, clear of the floor.
    const cabinetFloor = partBox(bottom).min[1]! - BOTTOM_SLIDE.height;
    expect(partBox(sideWall).min[1]! - cabinetFloor).toBeGreaterThanOrEqual(BOTTOM_SLIDE.sideClear - 1e-6);
    expect(partBox(sideWall).min[1]!).toBeLessThan(partBox(bottom).min[1]!);
    expect(BOTTOM_SLIDE.lengths.map((l) => len(l).mm)).toContain(b.bottomSlides![0]!.length.mm);
    expect(b.trays[0]!.length).toBeCloseTo(b.bottomSlides![0]!.length.mm, 6);
    // None of the side slides is counted for it.
    expect(b.slides).toBeUndefined();
  });

  it('lets a blind corner tray ride just over the slides, inches lower than over a frame', () => {
    const [was, now] = [blindCorner([side, createOrganizer('blindTray')]), blindCorner([under, createOrganizer('blindTray')])];
    const [a, b] = [boxOf(blindParts(was.build().parts)), boxOf(blindParts(now.build().parts))];
    // (Over a frame it rides just over the standards, half-way up the front tray; over the slides, just off the floor.)
    expect(a.min[1]! - b.min[1]!).toBeGreaterThan(50);
    // Over the slides on the floor, with room under it.
    const bottom = now.build().parts.find((p) => p.id.endsWith('/sink-tray-bottom/tray-bottom'))!;
    const floor = partBox(bottom).min[1]! - BOTTOM_SLIDE.height;
    expect(b.min[1]! - floor).toBeGreaterThan(BOTTOM_SLIDE.height);
    expect(b.min[1]! - floor).toBeLessThan(BOTTOM_SLIDE.height + 30);
    expect(now.build().trays.map((t) => t.name)).toEqual(['Bottom tray', 'Blind corner tray']);
  });

  it('stands alone: with another tray from side to side it says so', () => {
    const { build } = blindCorner([under, { id: 'tray-upper', kind: 'tray', up: len('10"') }]);
    expect(() => build()).toThrow(/on bottom-mount slides must be the only tray from side to side/);
  });

  it('in a plain cabinet too, and on the hardware list and the checklist', () => {
    const project = createBaseCabinetProject('frameless', 'doors');
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.adjustableShelves = 0;
    stored.inside = { obstacles: [], organizers: [{ ...under }] };
    const shop = shopFor(project, profile);
    const job = buildJob(project, shop);
    expect(job.cabinetParts.some((p) => p.role === 'buildOut')).toBe(false);
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    const rows = lists.hardware.filter((h) => h.group === 'Under the sink');
    expect(rows.map((h) => h.item)).toEqual([expect.stringContaining(BOTTOM_SLIDE.name)]);
    expect(rows[0]!.unit).toBe('pair');
    expect(rows[0]!.quantity).toBe(1);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ');
    expect(text).toContain('The tray on bottom-mount slides: screw the pair of slides down to');
  });

  it('is drawn with its slides under it, which come out with it', () => {
    const { project, shop, cabinet } = blindCorner([under, createOrganizer('blindTray')]);
    const parts = deriveCabinetParts(project, shop);
    const mounts = traySlideMounts([cabinet()], shop);
    expect(mounts.find((m) => m.drawerId === 'cabinet-1/sink-tray-bottom')!.under).toEqual({ height: 27, width: BOTTOM_SLIDE.width, inset: BOTTOM_SLIDE.inset });
    const placed = buildCabinetAssembly(parts, [], mounts).parts;
    const tray = placed.filter((p) => p.partId.includes('/sink-tray-bottom/'));
    // No slide beside its sides; a pair under its bottom, inside its width, their top at its underside.
    expect(tray.some((p) => p.runsOn)).toBe(false);
    const bottom = tray.find((p) => p.runsUnder)!;
    expect(bottom.partId.endsWith('/tray-bottom')).toBe(true);
    const box = partBox(parts.find((p) => p.id === bottom.partId)!);
    expect(bottom.runsUnder!.xs.length).toBe(2);
    for (const x of bottom.runsUnder!.xs) expect(x > box.min[0]! && x < box.max[0]!).toBe(true);
    expect(bottom.runsUnder!.top).toBeCloseTo(box.min[1]!, 6);
    expect(bottom.runsUnder!.height).toBe(27);
    // It still comes right out first, and the blind corner tray across after it.
    expect(bottom.pullStage).toBe(1);
    expect(placed.filter((p) => /\/sink-blind\/[^/]+$/.test(p.partId)).every((p) => p.pullStage === 2)).toBe(true);
  });
});
