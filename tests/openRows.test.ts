// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetOpeningsOf, cabinetsOf, mountedDesigns, shopFor } from '@/design';
import { cabinetShows } from '@/design/finishFaces';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { Project } from '@/model';
import { addTallCabinet, applyCabinetLayout, createBaseCabinetProject, deleteCabinet, setRowOpen } from '@/samples/cabinet';

/** Furniture: a door row with its doors off is open shelves; more shelves than three; a fixed shelf between two rows. */
const profile = createStarterShopProfile();
const materials = (project: Project) => shopFor(project, profile).materials;
/** A face frame base cabinet with doors only: furniture is looked at behind a face frame first. */
const doorsOnly = (construction: 'faceFrame' | 'frameless' | 'shop' = 'faceFrame') => {
  const project = createBaseCabinetProject(construction);
  applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doors');
  return project;
};
const first = (project: Project) => cabinetsOf(project)[0]!;
const features = (project: Project) => {
  const job = buildJob({ ...project, slug: 'open' }, profile);
  return { job, kinds: job.cabinetParts.flatMap((p) => p.features.map((f) => `${p.id.split('/').pop()}:${f.id}`)) };
};

describe('an open row', () => {
  it('has no doors and nothing for them, and keeps its shelves', () => {
    for (const construction of ['faceFrame', 'frameless', 'shop'] as const) {
      const project = doorsOnly(construction);
      const row = first(project).layout.rows[0]!;
      const before = features(project);
      expect(before.job.parts.some((p) => /door/i.test(p.name)), construction).toBe(true);
      const doorSet = mountedDesigns(project, materials(project)).find((d) => d.template === 'doorSet')!;

      setRowOpen(project, first(project), row.id, true);
      expect(first(project).layout.rows[0]!.open).toBe(true);
      const opening = cabinetOpeningsOf(project, materials(project))[0]!;
      expect([opening.name, opening.open, opening.use]).toEqual(['Open shelves', true, 'doors']);
      // Nothing hangs on it; the door set is kept in the project for when the doors are put back.
      expect(mountedDesigns(project, materials(project)).filter((d) => d.template === 'doorSet')).toEqual([]);
      expect(project.designObjects.some((d) => d.id === doorSet.id)).toBe(true);
      const open = features(project);
      expect(open.job.parts, construction).toEqual([]);
      // No hinge plates in the sides (frameless and shop drill them); the shelf pins stay.
      const plates = (job: typeof open.job) => job.cabinetParts.flatMap((p) => p.features.filter((f) => f.id.startsWith('hinge-plate'))).length;
      if (construction !== 'faceFrame') expect(plates(before.job), construction).toBeGreaterThan(0);
      expect(plates(open.job), construction).toBe(0);
      const shelves = (job: typeof open.job) => job.cabinetParts.filter((p) => p.role === 'shelf').length;
      expect(shelves(open.job), construction).toBe(shelves(before.job));
      expect(open.job.files.length, construction).toBeGreaterThan(0);
      // Its inside shows, so it is finished as what shows.
      expect(cabinetShows(project, first(project)).open, construction).toBe(true);

      // The doors come back as they were.
      setRowOpen(project, first(project), row.id, false);
      expect(first(project).layout.rows[0]!.open).toBeUndefined();
      expect(mountedDesigns(project, materials(project)).find((d) => d.template === 'doorSet')!.id).toBe(doorSet.id);
      expect(features(project).kinds.sort()).toEqual(before.kinds.sort());
      expect(cabinetShows(project, first(project)).open, construction).toBe(false);
    }
  });

  it('is a door row only, and a new open row gets its doors when they are first put on', () => {
    const project = createBaseCabinetProject('faceFrame');
    const drawerRow = first(project).layout.rows[0]!;
    expect(drawerRow.use).toBe('drawer');
    expect(() => setRowOpen(project, first(project), drawerRow.id, true)).toThrow('Only a row of doors can be open');
    // The drawer over an open row: the drawer stays, the doors go.
    setRowOpen(project, first(project), first(project).layout.rows[1]!.id, true);
    expect(mountedDesigns(project, materials(project)).map((d) => d.template)).toEqual(['drawer']);
    expect(cabinetOpeningsOf(project, materials(project)).map((o) => o.name)).toEqual(['Drawer opening', 'Open shelves']);
  });

  it('a tall case of two open rows is a bookcase: a fixed shelf between them, and more than three loose ones', () => {
    const project = createBaseCabinetProject('faceFrame');
    const tall = addTallCabinet(project, { name: 'Bookcase' });
    deleteCabinet(project, first(project).id);
    expect(tall.layout.rows.map((r) => r.use)).toEqual(['doors', 'doors']);
    for (const row of tall.layout.rows) setRowOpen(project, first(project), row.id, true);
    const stored = first(project);
    stored.adjustableShelves = 5;
    stored.layout = { ...stored.layout, rows: stored.layout.rows.map((r, i) => (i === 0 ? { ...r, shelves: 4 } : r)) };
    expect(cabinetOpeningsOf(project, materials(project)).map((o) => o.name)).toEqual(['Open shelves 1', 'Open shelves 2']);
    const job = buildJob({ ...project, slug: 'bookcase' }, profile);
    expect(job.parts).toEqual([]);
    expect(job.cabinetParts.filter((p) => p.id.endsWith('/fixed-shelf')).length).toBe(1);
    expect(job.cabinetParts.filter((p) => p.role === 'shelf' && !p.id.includes('fixed')).length).toBe(9);
  });
});
