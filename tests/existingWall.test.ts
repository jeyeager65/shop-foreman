// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, existingShellParts, partBox, shopFor, takesExisting, takesSink } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { addWallCabinet, createBaseCabinetProject, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: a wall cabinet that is already there, for new doors on it (refacing). */
const profile = createStarterShopProfile();
const withWall = (construction: 'faceFrame' | 'frameless') => {
  const project = createBaseCabinetProject(construction, 'doors');
  const wall = addWallCabinet(project, { name: 'Wall cabinet' });
  const stored = (project.context as CasesContext).pieces.find((c) => c.id === wall.id)!;
  return { project, shop: shopFor(project, profile), stored, wall: () => cabinetsOf(project).find((c) => c.id === wall.id)! };
};

describe('a wall cabinet that is already there', () => {
  for (const construction of ['faceFrame', 'frameless'] as const) {
    it(`${construction}: starts as the cabinet it was, with no toe kick under it`, () => {
      const { project, shop, stored, wall } = withWall(construction);
      expect(takesExisting(wall())).toBe(true);
      const was = { width: wall().size.width.mm, height: wall().size.height.mm, depth: wall().size.depth.mm };
      const openingWas = deriveCabinetOpenings(wall(), shop.materials)[0]!;
      makeExisting(project, stored.id, 'new');
      const cabinet = wall();
      expect(cabinet.size.width.mm).toBeCloseTo(was.width, 6);
      expect(cabinet.size.height.mm).toBeCloseTo(was.height, 6);
      expect(cabinet.size.depth.mm).toBeCloseTo(was.depth, 6);
      const opening = deriveCabinetOpenings(cabinet, shop.materials)[0]!;
      expect(opening.width).toBeCloseTo(openingWas.width, 6);
      expect(opening.height).toBeCloseTo(openingWas.height, 6);
      expect(opening.origin.y).toBeCloseTo(openingWas.origin.y, 6);
      // Nothing is fitted inside a wall cabinet.
      expect(takesSink(cabinet)).toBe(false);
    });
  }

  it('measured by its door opening only: new doors on that opening, and nothing else made, listed or said', () => {
    const { project, shop, stored, wall } = withWall('faceFrame');
    makeExisting(project, (project.context as CasesContext).pieces[0]!.id);
    makeExisting(project, stored.id, 'new');
    delete stored.existing!.inside;
    stored.existing!.opening = { width: len('27"'), height: len('26"') };
    const opening = deriveCabinetOpenings(wall(), shop.materials)[0]!;
    expect(opening.width).toBeCloseTo(len('27"').mm, 6);
    expect(opening.height).toBeCloseTo(len('26"').mm, 6);
    // The box is drawn as deep as a wall cabinet, not as a base cabinet.
    expect(wall().size.depth.mm).toBeLessThan(len('13"').mm);
    // Nothing of either case is made; the wall cabinet's shell is drawn, with no toe kick.
    expect(deriveCabinetParts(project, shop)).toEqual([]);
    const shell = existingShellParts(project, shop).filter((p) => p.id.startsWith(`${stored.id}/`));
    expect(shell.length).toBeGreaterThan(4);
    expect(shell.some((p) => p.id.endsWith('/toe-kick'))).toBe(false);
    expect(Math.min(...shell.map((p) => partBox(p).min[1]!))).toBeCloseTo(0, 4);
    // The job is the wall cabinet's two doors.
    const job = buildJob(project, shop);
    expect(job.parts.length).toBe(2);
    const design = project.designObjects.find((d) => d.mounting.openingId.startsWith(`${stored.id}/`))!;
    expect(job.parts.every((p) => p.id.startsWith(`${design.id}/`))).toBe(true);
    expect(job.cabinetParts).toEqual([]);
    const doors = job.parts.reduce((sum, p) => sum + p.size.width, 0);
    expect(doors).toBeGreaterThan(len('27"').mm);
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    expect(lists.hardware.filter((h) => h.group === 'Hanging')).toEqual([]);
    expect(lists.hardware.some((h) => h.group === 'Doors')).toBe(true);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ');
    expect(text).not.toMatch(/Hang the cabinet|cleat/);
  });

  it('with its doors kept nothing at all is made for it', () => {
    const { project, shop, stored } = withWall('frameless');
    makeExisting(project, stored.id);
    const job = buildJob(project, shop);
    const design = project.designObjects.find((d) => d.mounting.openingId.startsWith(`${stored.id}/`))!;
    expect(job.parts.some((p) => p.id.startsWith(`${design.id}/`))).toBe(false);
    expect(job.cabinetParts.some((p) => p.id.startsWith(`${stored.id}/`))).toBe(false);
    expect(buildLists(job, project, shop, (mm) => `${mm}`).hardware.filter((h) => h.group === 'Hanging')).toEqual([]);
  });
});
