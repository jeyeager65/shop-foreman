// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bottomKindOf, cabinetsOf, shelfWarnings, shopFor } from '@/design';
import { outsidePath } from '@/cam/cuts';
import { buildPartMeshes } from '@/geometry/solids';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Part, Project } from '@/model';
import { applyCabinetLayout, createBaseCabinetProject, setRowOpen } from '@/samples/cabinet';
import { FACE_FRAME_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Furniture: cable holes and an air slot through the back behind what is open; the TV stand. */
const contextOf = (p: Project) => p.context as CasesContext;
const inches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const backOf = (project: Project, profile = createStarterShopProfile()) => buildJob({ ...project, slug: 'cables' }, profile).cabinetParts.find((p) => p.role === 'back')!;
const holes = (back: Part) => back.features.filter((f) => f.kind === 'cutout' && f.inside);
/** A cut's box in the back's own coordinates, in inches. */
const box = (f: Part['features'][number]) => {
  if (f.kind !== 'cutout') throw new Error('not a cutout');
  const xs = f.outline.map((p) => p.x);
  const ys = f.outline.map((p) => p.y);
  return { x: [inches(Math.min(...xs)), inches(Math.max(...xs))], y: [inches(Math.min(...ys)), inches(Math.max(...ys))] };
};

describe('cable holes through the back', () => {
  it('are behind each opening that is open: a round hole in the middle of its width, and a slot for air when asked', () => {
    const project = createBaseCabinetProject('frameless');
    applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');
    const stored = contextOf(project).pieces[0]!;
    stored.cables = { diameter: len('2"') };
    // Nothing is open: no hole.
    expect(holes(backOf(project))).toEqual([]);
    setRowOpen(project, cabinetsOf(project)[0]!, cabinetsOf(project)[0]!.layout.rows[0]!.id, true);
    let back = backOf(project);
    expect(holes(back).map((f) => f.id)).toEqual(['cable-doors']);
    const hole = box(holes(back)[0]!);
    // 2" across, in the middle of the back's width, on the back with room round it.
    expect(inches((hole.x[1]! - hole.x[0]!) * 25.4)).toBeCloseTo(2, 1);
    expect((hole.x[0]! + hole.x[1]!) / 2).toBeCloseTo(inches(back.size.width) / 2, 1);
    expect(hole.y[0]).toBeGreaterThan(0.4);
    // With air: a slot above it, 6" long and 1" high, and clear of the hole.
    stored.cables = { diameter: len('2"'), air: true };
    back = backOf(project);
    expect(holes(back).map((f) => f.id)).toEqual(['cable-doors', 'air-doors']);
    const slot = box(holes(back)[1]!);
    expect([inches((slot.x[1]! - slot.x[0]!) * 25.4), inches((slot.y[1]! - slot.y[0]!) * 25.4)]).toEqual([6, 1]);
    expect(slot.y[0]).toBeGreaterThan(hole.y[1]!);
    expect(slot.y[1]).toBeLessThan(inches(back.size.height));
    // A hole too big for the back is left out, not cut off its edge.
    stored.cables = { diameter: len('40"') };
    expect(holes(backOf(project))).toEqual([]);
    // No back, no holes (and no error).
    stored.cables = { diameter: len('2"') };
    stored.noBack = true;
    expect(buildJob({ ...project, slug: 'cables' }, createStarterShopProfile()).cabinetParts.some((p) => p.role === 'back')).toBe(false);
  });
});

describe('a round opening', () => {
  it('is cut inside its line, and is a hole in the part as the 3D view draws it', async () => {
    const project = createBaseCabinetProject('frameless');
    applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');
    contextOf(project).pieces[0]!.cables = { diameter: len('2-1/2"') };
    setRowOpen(project, cabinetsOf(project)[0]!, cabinetsOf(project)[0]!.layout.rows[0]!.id, true);
    const back = backOf(project);
    const hole = holes(back)[0]!;
    if (hole.kind !== 'cutout') throw new Error('not a cutout');
    // The bit's centre keeps its radius inside the hole's line: the path round a 2-1/2" hole with a 1/4" bit is 2-1/4" across.
    const path = outsidePath(hole.outline, -3.175);
    const xs = path.map((p) => p.x);
    expect(inches(Math.max(...xs) - Math.min(...xs))).toBeCloseTo(2.25, 1);
    // The solid: the back less a disc.
    const mesh = (await buildPartMeshes([back]))[0]!.mesh;
    const whole = back.size.width * back.size.height * back.size.thickness;
    const disc = Math.PI * (1.25 * 25.4) ** 2 * back.size.thickness;
    expect(mesh.volume / (whole - disc)).toBeCloseTo(1, 2);
  });
});

describe('the TV stand', () => {
  it('is low and wide, three bays: doors, an open bay with its cable hole and air slot, doors; on legs', () => {
    const profile = createStarterShopProfile();
    const { project } = startProject(starterById('tvstand')!, builtInPresets().find((p) => p.id === FACE_FRAME_PRESET_ID)!, profile);
    const [stand] = cabinetsOf(project);
    expect([inches(stand!.size.width.mm), inches(stand!.size.height.mm), inches(stand!.size.depth.mm)]).toEqual([60, 20, 18]);
    expect(stand!.layout.bays!.map((b) => !!b.open)).toEqual([false, true, false]);
    expect([bottomKindOf(contextOf(project).settings.toeKick), stand!.caseTop, !!stand!.top?.own]).toEqual(['legs', 'panel', true]);
    const job = buildJob({ ...project, slug: 'tv' }, profile);
    // Behind the face frame's two mullions stand partitions: a shelf in each bay, a bay long,
    // none across the whole width, and nothing to warn of.
    expect(job.cabinetParts.filter((p) => /partition/i.test(p.id)).length).toBe(2);
    const shelves = job.cabinetParts.filter((p) => p.role === 'shelf');
    expect(shelves.length).toBe(3);
    expect(Math.max(...shelves.map((p) => inches(Math.max(p.size.width, p.size.height))))).toBeLessThan(20);
    expect(shelfWarnings(stand!, shopFor(project, profile).materials, (mm) => `${inches(mm)}"`)).toEqual([]);
    const back = job.cabinetParts.find((p) => p.role === 'back')!;
    expect(holes(back).map((f) => f.id)).toEqual(['cable-doors~b2', 'air-doors~b2']);
    // The hole is behind the middle bay: about the middle of the back.
    const hole = box(holes(back)[0]!);
    expect((hole.x[0]! + hole.x[1]!) / 2).toBeCloseTo(inches(back.size.width) / 2, 0);
    // Two pairs of doors, and it is cut: the back's openings are the CNC's.
    expect(job.parts.filter((p) => /door/i.test(p.name)).length).toBe(4);
    expect(job.plan.parts.find((p) => p.partId === back.id)!.cutOut).toBe('cnc');
    expect(job.files.length).toBeGreaterThan(0);
  });
});
