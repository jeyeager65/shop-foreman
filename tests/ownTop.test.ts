// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, shopFor } from '@/design';
import { hasTopPanel } from '@/design/case';
import { deriveTopParts, starterOwnTop, starterTopSettings, topPieces } from '@/design/tops';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID } from '@/libraries';
import { addMaterialFromCatalog } from '@/design/materials';
import type { CasesContext, Project } from '@/model';
import { addTallCabinet, createBaseCabinetProject, deleteCabinet } from '@/samples/cabinet';
import { len } from '@/units';

/** Furniture: a top panel on a floor-standing case, and a piece's own top laid on with an overhang all round. */
const profile = createStarterShopProfile();
const contextOf = (p: Project) => p.context as CasesContext;
const stored = (p: Project) => contextOf(p).pieces[0]!;
const materials = (p: Project) => shopFor(p, profile).materials;
const made = (construction: 'faceFrame' | 'frameless' | 'shop') => {
  const project = createBaseCabinetProject(construction);
  for (const id of [PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, profile.materialCatalog, id);
  return project;
};
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;

describe('a top panel on a base case', () => {
  it('stands in for the two stretchers, joined like a tall case\'s top, in every construction', () => {
    for (const construction of ['faceFrame', 'frameless', 'shop'] as const) {
      const project = made(construction);
      const ids = (p: Project) => buildJob({ ...p, slug: 'top' }, profile).cabinetParts.map((x) => x.id.split('/').pop()!);
      expect(hasTopPanel(cabinetsOf(project)[0]!), construction).toBe(false);
      expect(ids(project), construction).toEqual(expect.arrayContaining(['stretcher-front', 'stretcher-back']));
      stored(project).caseTop = 'panel';
      expect(hasTopPanel(cabinetsOf(project)[0]!), construction).toBe(true);
      const after = ids(project);
      expect(after, construction).toContain('top');
      expect(after.filter((id) => id.startsWith('stretcher')), construction).toEqual([]);
      // As wide and as deep as the bottom: it closes the case.
      const job = buildJob({ ...project, slug: 'top' }, profile);
      const part = (key: string) => job.cabinetParts.find((x) => x.id.endsWith(`/${key}`))!;
      expect(part('top').size.width, construction).toBeCloseTo(part('bottom').size.width, 3);
      expect(job.files.length, construction).toBeGreaterThan(0);
    }
  });
});

describe("a piece's own top", () => {
  it('lies over the case by its own amounts on every side, with an edge strip all round and no backsplash', () => {
    const project = made('faceFrame');
    stored(project).top = { own: starterOwnTop() };
    const cabinet = cabinetsOf(project)[0]!;
    const [piece] = topPieces(project, materials(project));
    expect(piece!.own).toBeDefined();
    // 3/4" past each end; flush at the back; 3/4" past the fronts' faces.
    expect([inches(piece!.x0), inches(piece!.x1 - cabinet.size.width.mm), inches(piece!.zBack + cabinet.size.depth.mm)]).toEqual([-0.75, 0.75, 0]);
    const parts = deriveTopParts(project, materials(project));
    expect(parts.map((p) => p.id.split('/').pop()).sort()).toEqual(['top-1', 'top-1-edge-back', 'top-1-edge-front', 'top-1-edge-left', 'top-1-edge-right']);
    const panel = parts.find((p) => p.id.endsWith('/top-1'))!;
    expect(panel.name).toBe('Top');
    // The panel is the piece less a strip on each of its four edges.
    expect(inches(panel.size.width)).toBeCloseTo(inches(piece!.x1 - piece!.x0) - 1.5, 3);
    expect(inches(panel.size.height)).toBeCloseTo(inches(piece!.zFront - piece!.zBack) - 1.5, 3);
    expect(buildJob({ ...project, slug: 'own' }, profile).files.length).toBeGreaterThan(0);
  });

  it('is made here whatever Setup says of the project\'s countertops, of its own material', () => {
    const project = made('faceFrame');
    contextOf(project).tops = { ...starterTopSettings(), kind: 'measured' };
    stored(project).top = { own: { ...starterOwnTop(), materialId: SOLID_WOOD_3_4_ID, overhang: { front: len('1"'), ends: len('2"'), back: len('1"') }, edge: { kind: 'none' } } };
    const parts = deriveTopParts(project, materials(project));
    expect(parts.map((p) => [p.id.split('/').pop(), p.materialId])).toEqual([['top-1', SOLID_WOOD_3_4_ID]]);
    const cabinet = cabinetsOf(project)[0]!;
    expect(inches(parts[0]!.size.width)).toBeCloseTo(inches(cabinet.size.width.mm) + 4, 3);
    // Without `own` a measured top is ordered, and nothing is made.
    stored(project).top = {};
    expect(deriveTopParts(project, materials(project))).toEqual([]);
  });

  it('has its own edge rounded over or chamfered on the panel itself, and a banded one banded all round', () => {
    const project = made('frameless');
    stored(project).top = { own: { ...starterOwnTop(), edge: { kind: 'roundover', size: len('1/8"') } } };
    let parts = deriveTopParts(project, materials(project));
    expect(parts.length).toBe(1);
    const edge = parts[0]!.features.find((f) => f.kind === 'edgeProfile');
    expect(edge?.kind === 'edgeProfile' && edge.treatment).toEqual({ kind: 'roundover', radius: 3.175 });
    // The job plans it: a bit is found for the edge.
    expect(buildJob({ ...project, slug: 'round' }, profile).files.length).toBeGreaterThan(0);
    stored(project).top = { own: { ...starterOwnTop(), edge: { kind: 'chamfer', size: len('1/8"') } } };
    parts = deriveTopParts(project, materials(project));
    const chamfer = parts[0]!.features.find((f) => f.kind === 'edgeProfile');
    expect(chamfer?.kind === 'edgeProfile' && chamfer.treatment.kind).toBe('chamfer');
    stored(project).top = { own: { ...starterOwnTop(), edge: { kind: 'banding' } } };
    parts = deriveTopParts(project, materials(project));
    expect(parts.length).toBe(1);
    expect([...(parts[0]!.banding?.edges ?? [])].sort()).toEqual(['x0', 'x1', 'y0', 'y1']);
  });

  it('covers a tall case too: a bookcase with a top laid on a top panel', () => {
    const project = made('faceFrame');
    addTallCabinet(project, { name: 'Bookcase' });
    deleteCabinet(project, cabinetsOf(project)[0]!.id);
    stored(project).top = { own: starterOwnTop() };
    const [piece] = topPieces(project, materials(project));
    expect(piece!.y).toBeCloseTo(cabinetsOf(project)[0]!.size.height.mm, 3);
    const job = buildJob({ ...project, slug: 'bookcase' }, profile);
    expect(job.cabinetParts.some((p) => p.id.endsWith('/top-1'))).toBe(true);
  });
});
