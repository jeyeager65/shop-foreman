// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { benchTopTable, cabinetsOf, deriveFrameParts, frameLayout, framesOf, lightTopTable, partBox, shopFor, torsionMaterialIds, torsionThickness } from '@/design';
import { addMaterialFromCatalog } from '@/design/materials';
import { deriveTopParts, starterOwnTop, topPieces } from '@/design/tops';
import { topHeightOf } from '@/design/standsOn';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, DesignedCabinetContext, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject, deleteCabinet } from '@/samples/cabinet';
import { starterById } from '@/samples/starters';
import { TABLE_SIZES, addTable } from '@/samples/tables';
import { len } from '@/units';

/** A torsion box as a piece's own top and as a table's top. */
const profile = createStarterShopProfile();
const materials = (p: Project) => shopFor(p, profile).materials;
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
const bring = (project: Project, box = benchTopTable()) => {
  for (const id of torsionMaterialIds(box)) addMaterialFromCatalog(project, profile.materialCatalog, id);
  return box;
};

describe("a torsion box as a piece's own top", () => {
  const dresser = () => {
    const project = createBaseCabinetProject('frameless');
    const box = bring(project);
    (project.context as CasesContext).pieces[0]!.top = { own: { ...starterOwnTop(), torsion: box } };
    return { project, box };
  };

  it("is over the case by the top's own overhangs, not the box's", () => {
    const { project } = dresser();
    const [piece] = topPieces(project, materials(project));
    expect(piece!.torsion).toBeDefined();
    expect(piece!.settings.kind).toBe('torsion');
    const cabinet = cabinetsOf(project)[0]!;
    // 3/4" over each end and the front, flush at the back.
    expect([inches(piece!.x0), inches(piece!.x1)]).toEqual([-0.75, inches(cabinet.size.width.mm) + 0.75]);
    expect(inches(piece!.zBack)).toBe(-inches(cabinet.size.depth.mm));
  });

  it('is made of skins and ribs, with no slab and no edge strip, and stands as thick as the box', () => {
    const { project, box } = dresser();
    const parts = deriveTopParts(project, materials(project));
    expect(parts.some((p) => p.role === 'rib')).toBe(true);
    expect(parts.some((p) => p.name === 'Top' || p.role === 'topEdge')).toBe(false);
    const cabinet = cabinetsOf(project)[0]!;
    const high = Math.max(...parts.map((p) => partBox(p).max[1]));
    expect(high - cabinet.size.height.mm).toBeCloseTo(torsionThickness(box, materials(project)), 6);
    const stored = (project.context as CasesContext).pieces[0]!;
    expect(topHeightOf(project, stored, materials(project), profile.hardware) - topHeightOf({ ...project, context: { ...project.context, pieces: [{ ...stored, top: undefined }] } } as Project, stored, materials(project), profile.hardware)).toBeCloseTo(
      torsionThickness(box, materials(project)),
      6,
    );
  });
});

describe("a torsion box as a table's top", () => {
  const table = () => {
    const project = createBaseCabinetProject('faceFrame');
    const frame = addTable(project, profile, { name: 'Bench', size: TABLE_SIZES.assembly });
    deleteCabinet(project, cabinetsOf(project)[0]!.id);
    frame.top = { overhang: { front: len('3"'), ends: len('3"'), back: len('3"') }, edge: { kind: 'none' }, torsion: bring(project, lightTopTable()) };
    return { project, frame };
  };

  it('the legs are shorter by the box: its top skin is the table\'s height off the floor', () => {
    const { project, frame } = table();
    const context = project.context as DesignedCabinetContext;
    const layout = frameLayout(frame, context, materials(project));
    const thick = torsionThickness(frame.top.torsion!, materials(project));
    expect(layout.top).toBeCloseTo(thick, 6);
    expect(layout.legHeight).toBeCloseTo(len('34"').mm - thick, 6);
    const parts = deriveFrameParts(frame, context, materials(project));
    const top = parts.filter((p) => p.role === 'top' || p.role === 'rib');
    expect(top.filter((p) => p.role === 'top').map((p) => p.name)).toEqual(['Bottom skin', 'Top skin']);
    expect(parts.some((p) => p.role === 'topEdge' || p.id.endsWith('/top'))).toBe(false);
    expect(Math.max(...top.map((p) => partBox(p).max[1]))).toBeCloseTo(len('34"').mm, 6);
    // The box is the whole of the table's size: 60" long and 30" wide, its front edge at the front.
    const all = top.map((p) => partBox(p));
    expect([Math.min(...all.map((b) => b.min[0])), Math.max(...all.map((b) => b.max[0]))].map(inches)).toEqual([0, 60]);
    expect([Math.min(...all.map((b) => b.min[2])), Math.max(...all.map((b) => b.max[2]))].map(inches)).toEqual([-30, 0]);
  });

  it('builds: its lists have the glue, the brads and adhesive under it; the checklist builds the box first', () => {
    const { project } = table();
    const shop = shopFor(project, profile);
    const job = buildJob({ ...project, slug: 'bench' }, profile);
    expect(job.cabinetParts.filter((p) => p.role === 'rib').length).toBeGreaterThan(8);
    const lists = buildLists(job, project, shop, (mm) => `${inches(mm)}"`);
    expect(lists.hardware.filter((h) => h.group === 'Torsion table').map((h) => h.item)).toEqual(['Wood glue', '18 ga brad nails, 1-1/4"']);
    expect(lists.hardware.some((h) => h.group === 'Tables' && h.item === 'Construction adhesive')).toBe(true);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop), shop.hardware).find((s) => s.title === 'Table: Bench')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith('The top is a torsion box. Slot its ribs together'))).toBe(true);
    expect(steps.some((s) => /edge strips|Band all four/.test(s))).toBe(false);
    expect(steps.some((s) => s.includes('construction adhesive along the aprons'))).toBe(true);
  });
});

describe('the assembly table', () => {
  it('is a starter: a table on 3×3 legs with a shelf, under a bench top\'s torsion box 3" over all round', () => {
    const starter = starterById('assemblytable')!;
    expect(starter.group).toBe('shop');
    const project = createBaseCabinetProject('shop');
    starter.add!(project, 'Assembly table', undefined, profile);
    const frame = framesOf(project)[0]!;
    expect(frame.legs.materialId).toBe('square-3x3');
    expect(frame.shelf).toBeDefined();
    expect(frame.top.torsion).toEqual(benchTopTable());
    expect(inches(frame.top.overhang.front.mm)).toBe(3);
    for (const id of torsionMaterialIds(benchTopTable())) expect(project.materials.some((m) => m.id === id), id).toBe(true);
    expect(() => deriveFrameParts(frame, project.context as DesignedCabinetContext, materials(project))).not.toThrow();
  });
});
