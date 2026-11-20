import { describe, expect, it } from 'vitest';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { cabinetsOf, createUnderSink, deriveCabinetOpenings, deriveCabinetParts, deriveParts, existingShellParts, existingStandIn, insideDepth, mountedDesigns, shopFor, takesExisting, thicknessOf } from '@/design';
import { projectScene } from '@/design/scene';
import { createStarterShopProfile } from '@/libraries';
import { PROJECT_VERSION } from '@/model';
import type { CasesContext, ExistingCase } from '@/model';
import { projectProblem } from '@/storage/projectFile';
import { createBaseCabinetProject, makeExisting, makeMade } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: a case that is already there, measured; nothing of it is cut, listed or bought. */
const profile = createStarterShopProfile();
const made = (construction: 'faceFrame' | 'frameless' | 'shop' = 'faceFrame') => {
  const project = createBaseCabinetProject(construction, 'doors');
  return { project, shop: shopFor(project, profile), stored: (project.context as CasesContext).pieces[0]! };
};
const existing = (construction: 'faceFrame' | 'frameless' | 'shop' = 'faceFrame', fronts: 'kept' | 'new' = 'kept') => {
  const job = made(construction);
  makeExisting(job.project, job.stored.id, fronts);
  return job;
};
/** A vanity as it is measured: 21" between the sides at the front, 20 3/4" at the back, an 18" × 22" door opening. */
const MEASURED: ExistingCase = {
  frame: 'faceFrame',
  opening: { width: len('18"'), height: len('22"') },
  inside: { widthFront: len('21"'), widthBack: len('20 3/4"'), depth: len('20"'), height: len('24"') },
  hingeStandIn: len('1"'),
  fronts: 'kept',
};

describe('an existing case', () => {
  it('starts as the cabinet it was: nothing moves until a measurement is typed', () => {
    for (const construction of ['faceFrame', 'frameless', 'shop'] as const) {
      const before = made(construction);
      const was = { ...cabinetsOf(before.project)[0]!.size };
      const openingWas = deriveCabinetOpenings(cabinetsOf(before.project)[0]!, before.shop.materials)[0]!;
      const { project, shop } = existing(construction);
      const cabinet = cabinetsOf(project)[0]!;
      expect(cabinet.existing?.frame).toBe(construction === 'faceFrame' ? 'faceFrame' : 'frameless');
      expect(cabinet.construction).toBe(construction === 'faceFrame' ? 'faceFrame' : 'frameless');
      expect(cabinet.size.width.mm).toBeCloseTo(was.width.mm, 6);
      expect(cabinet.size.height.mm).toBeCloseTo(was.height.mm, 6);
      const opening = deriveCabinetOpenings(cabinet, shop.materials)[0]!;
      expect(opening.width).toBeCloseTo(openingWas.width, 6);
      expect(opening.height).toBeCloseTo(openingWas.height, 6);
    }
  });

  it('is the cabinet its measurements describe: the inside and the door opening come out as measured', () => {
    const { project, shop, stored } = existing();
    stored.existing = structuredClone(MEASURED);
    const cabinet = cabinetsOf(project)[0]!;
    const t = thicknessOf(shop.materials, cabinet.materials.caseId);
    // The smaller of the two inside widths is the one used.
    expect(cabinet.size.width.mm - 2 * t).toBeCloseTo(len('20 3/4"').mm, 6);
    expect(insideDepth(cabinet, shop.materials)).toBeCloseTo(len('20"').mm, 6);
    const opening = deriveCabinetOpenings(cabinet, shop.materials)[0]!;
    expect(opening.width).toBeCloseTo(len('18"').mm, 6);
    expect(opening.height).toBeCloseTo(len('22"').mm, 6);
    // The floor is level with the bottom of the opening, and the inside is as tall as measured above it.
    expect(cabinet.size.height.mm - t - opening.origin.y).toBeCloseTo(len('24"').mm, 6);
    // Frameless, the opening is the inside of the case.
    stored.existing.frame = 'frameless';
    const frameless = deriveCabinetOpenings(cabinetsOf(project)[0]!, shop.materials)[0]!;
    expect(frameless.width).toBeCloseTo(len('20 3/4"').mm, 6);
    expect(frameless.height).toBeCloseTo(len('24"').mm, 6);
    expect(existingStandIn({ ...MEASURED, frame: 'frameless' }, 19, 6, 100).height).toBeCloseTo(100 + 19 + len('24"').mm + 19, 6);
  });

  it('cannot have its size or its style typed, and comes back as it was when it is made here again', () => {
    const { project, stored } = existing();
    const cabinet = cabinetsOf(project)[0]!;
    const width = cabinet.size.width.mm;
    cabinet.size.width = len('40"');
    cabinet.joinery = { case: 'dado', back: 'groove', backStretcherForm: 'nailer' };
    expect(cabinetsOf(project)[0]!.size.width.mm).toBeCloseTo(width, 6);
    expect(cabinetsOf(project)[0]!.joinery.back).toBe('applied');
    cabinet.construction = 'frameless';
    expect(stored.existing!.frame).toBe('frameless');
    makeMade(project, stored.id);
    expect(cabinetsOf(project)[0]!.existing).toBeUndefined();
    expect(cabinetsOf(project)[0]!.construction).toBe('faceFrame');
    // A copy of the view is a plain cabinet, its measurements with it.
    makeExisting(project, stored.id);
    expect(JSON.parse(JSON.stringify(cabinetsOf(project)[0]!)).existing.fronts).toBe('kept');
  });

  it('only a base or a wall cabinet with one bay can be one, never a tall one', () => {
    const { project, stored } = made();
    expect(takesExisting(cabinetsOf(project)[0]!)).toBe(true);
    stored.form = 'wall';
    expect(takesExisting(cabinetsOf(project)[0]!)).toBe(true);
    stored.form = 'tall';
    expect(takesExisting(cabinetsOf(project)[0]!)).toBe(false);
    expect(() => makeExisting(project, stored.id)).toThrow(/Only a base or a wall cabinet/);
  });

  it('has none of its case cut, listed or bought: only what goes inside it', () => {
    const { project, shop, stored } = existing();
    expect(deriveCabinetParts(project, shop)).toEqual([]);
    expect(deriveParts(project, shop)).toEqual([]);
    stored.inside = createUnderSink({ bottomTray: true });
    const parts = deriveCabinetParts(project, shop);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => p.id.includes('/sink-'))).toBe(true);
    const job = buildJob(project, profile);
    expect(job.cabinetParts.map((p) => p.id)).toEqual(parts.map((p) => p.id));
    expect(job.plan.parts.every((p) => p.partId.includes('/sink-'))).toBe(true);
    for (const file of job.files) expect(file.text).not.toMatch(/Left side|Bottom rail|Left stile/);
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    expect(lists.hardware.filter((row) => row.group === 'Case' || row.group === 'Doors')).toEqual([]);
    expect(lists.hardware.some((row) => row.group === 'Under the sink')).toBe(true);
  });

  it('is drawn as a plain shell, with nothing cut into it', () => {
    const { project, shop } = existing();
    const shell = existingShellParts(project, shop);
    expect(shell.map((p) => p.name)).toEqual(expect.arrayContaining(['Left side', 'Right side', 'Bottom', 'Back', 'Left stile', 'Top rail']));
    expect(shell.every((p) => p.existing && p.features.length === 1 && p.features[0]!.kind === 'cutout')).toBe(true);
    expect(existingShellParts(made().project, shop)).toEqual([]);
    const scene = projectScene(project, shop);
    if ('error' in scene) throw new Error(scene.error);
    expect(scene.parts.filter((p) => p.existing)).toHaveLength(shell.length);
    expect(scene.cabinets[0]!.partIds).toEqual(expect.arrayContaining(shell.map((p) => p.id)));
  });

  it('keeps its doors, or has new ones made on its opening: refacing', () => {
    const kept = existing();
    expect(mountedDesigns(kept.project, kept.shop.materials)).toEqual([]);
    const refaced = existing('faceFrame', 'new');
    refaced.stored.existing = { ...structuredClone(MEASURED), fronts: 'new' };
    expect(deriveCabinetParts(refaced.project, refaced.shop)).toEqual([]);
    const doors = deriveParts(refaced.project, refaced.shop);
    expect(doors).toHaveLength(2);
    // A pair that overlays the measured 18" opening at each side, by its hinge's overlay.
    expect(mountedDesigns(refaced.project, refaced.shop.materials)).toHaveLength(1);
    const across = doors.reduce((sum, d) => sum + d.size.width, 0);
    expect(across).toBeGreaterThan(len('18"').mm);
    expect(across).toBeLessThan(len('20"').mm);
    expect(doors[0]!.size.height).toBeGreaterThan(len('22"').mm);
    expect(doors[0]!.size.height).toBeLessThan(len('24"').mm);
    const job = buildJob(refaced.project, profile);
    expect(job.parts).toHaveLength(2);
    expect(job.cabinetParts).toEqual([]);
  });

  it('the trays under its sink clear its hinges by how far they were measured to stand in', () => {
    const layers = (standIn: string) => {
      const { project, shop, stored } = existing();
      stored.existing = { ...structuredClone(MEASURED), hingeStandIn: len(standIn) };
      stored.inside = createUnderSink({ bottomTray: true, mounting: 'strips' });
      return deriveCabinetParts(project, shop).filter((p) => p.role === 'buildOut').length / 2;
    };
    expect(layers('2"')).toBeGreaterThan(layers('1/4"'));
  });

  it('a project saved by another version of the app is refused', () => {
    expect(PROJECT_VERSION).toMatch(/^\d+\.\d+$/);
    expect(projectProblem({ ...made().project, schemaVersion: '0.0' })).toMatch(/saved by version 0\.0/);
  });
});
