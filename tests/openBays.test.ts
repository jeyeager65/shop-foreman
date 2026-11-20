// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetOpeningsOf, cabinetsOf, mountedDesigns, shopFor } from '@/design';
import { cabinetShows } from '@/design/finishFaces';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { applyCabinetLayout, createBaseCabinetProject, setBayOpen, setBays } from '@/samples/cabinet';
import { len } from '@/units';

/** Furniture: a bay may be open where the bays beside it have doors (a TV stand: doors, open, doors). */
const profile = createStarterShopProfile();
const materials = (project: Project) => shopFor(project, profile).materials;
const first = (project: Project) => cabinetsOf(project)[0]!;
/** 54" wide, doors only, three bays. */
const threeBays = (construction: 'faceFrame' | 'frameless' | 'shop') => {
  const project = createBaseCabinetProject(construction);
  (project.context as CasesContext).pieces[0]!.size.width = len('54"');
  applyCabinetLayout(project, first(project), 'doors');
  setBays(project, first(project), 3);
  return project;
};
const doorSets = (project: Project) => mountedDesigns(project, materials(project)).filter((d) => d.template === 'doorSet');

describe('an open bay', () => {
  it('has no doors and nothing for them, while the bays beside it keep theirs', () => {
    for (const construction of ['faceFrame', 'frameless', 'shop'] as const) {
      const project = threeBays(construction);
      const before = doorSets(project).map((d) => d.id);
      expect(before.length, construction).toBe(3);
      const plates = (p: Project) => buildJob({ ...p, slug: 'bays' }, profile).cabinetParts.flatMap((x) => x.features.filter((f) => f.id.startsWith('hinge-plate'))).length;
      const platesBefore = construction === 'faceFrame' ? 0 : plates(project);

      setBayOpen(project, first(project), 1, true);
      expect(first(project).layout.bays!.map((b) => !!b.open), construction).toEqual([false, true, false]);
      const openings = cabinetOpeningsOf(project, materials(project));
      expect(openings.map((o) => [o.name, !!o.open]), construction).toEqual([['Door opening, bay 1', false], ['Open shelves, bay 2', true], ['Door opening, bay 3', false]]);
      // Two sets of doors hang; the middle one is kept for when its doors go back.
      expect(doorSets(project).map((d) => d.id), construction).toEqual([before[0], before[2]]);
      expect(project.designObjects.some((d) => d.id === before[1]), construction).toBe(true);
      const job = buildJob({ ...project, slug: 'bays' }, profile);
      expect(job.files.length, construction).toBeGreaterThan(0);
      // A third fewer hinge plates where the case is drilled for them; the inside shows.
      if (construction !== 'faceFrame') expect(plates(project), construction).toBe((platesBefore * 2) / 3);
      expect(cabinetShows(project, first(project)).open, construction).toBe(true);

      // The doors come back as they were, and a change in the number of bays keeps an open bay open.
      setBayOpen(project, first(project), 1, false);
      expect(doorSets(project).map((d) => d.id).sort(), construction).toEqual([...before].sort());
      setBayOpen(project, first(project), 1, true);
      setBays(project, first(project), 2);
      expect(first(project).layout.bays!.map((b) => !!b.open), construction).toEqual([false, true]);
    }
  });

  it('keeps its drawer in a drawer over doors, and one bay alone has none to open', () => {
    const project = createBaseCabinetProject('frameless');
    (project.context as CasesContext).pieces[0]!.size.width = len('48"');
    expect(() => setBayOpen(project, first(project), 0, true)).toThrow('no such bay');
    setBays(project, first(project), 2);
    setBayOpen(project, first(project), 0, true);
    expect(cabinetOpeningsOf(project, materials(project)).map((o) => o.name)).toEqual(['Drawer opening, bay 1', 'Drawer opening, bay 2', 'Open shelves, bay 1', 'Door opening, bay 2']);
    expect(mountedDesigns(project, materials(project)).map((d) => d.template).sort()).toEqual(['doorSet', 'drawer', 'drawer']);
  });
});
