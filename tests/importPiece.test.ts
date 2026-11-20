// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetDifferences, cabinetsOf, designsOf, frameMaterials, framesOf, mountedDesigns, piecesOf, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { DesignedCabinetContext, Project } from '@/model';
import { createKitchenProject } from '@/samples/cabinet';
import { importPiece, importablePieces } from '@/samples/importPiece';
import { FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, FURNITURE_SOLID_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';

/** Furniture: a piece from another project, in this project's style or as it was. */
const profile = createStarterShopProfile();
const preset = (id: string) => builtInPresets().find((p) => p.id === id)!;
const started = (id: string, style: string) => startProject(starterById(id)!, preset(style), profile).project;
const contextOf = (p: Project) => p.context as DesignedCabinetContext;
const draws = (project: Project) => {
  const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
  if ('error' in scene) throw new Error(scene.error);
  return scene;
};

describe('a piece from another project', () => {
  it('lists what a project has to give: every piece, with its kind and its size as it stood', () => {
    const kitchen = createKitchenProject();
    const list = importablePieces(kitchen);
    expect(list.length).toBe(cabinetsOf(kitchen).length);
    expect(list.every((p) => p.kind === 'case' && p.name.length > 0)).toBe(true);
    expect(importablePieces(started('endtable', FACE_FRAME_PRESET_ID)).map((p) => [p.name, p.kind])).toEqual([['End table', 'frame']]);
  });

  it('a cabinet in this project\'s style: its shape comes across, and it is built as this project builds', () => {
    // A face frame dresser, brought into a frameless project.
    const dresser = started('dresser', FACE_FRAME_PRESET_ID);
    const into = started('base', FRAMELESS_PRESET_ID);
    const before = into.materials.map((m) => m.id);
    const { id } = importPiece(into, dresser, cabinetsOf(dresser)[0]!.id, 'style');
    const [mine, copy] = cabinetsOf(into);
    expect(copy!.id).toBe(id);
    expect([copy!.name, copy!.construction, copy!.layout.rows.length, copy!.caseTop, !!copy!.top?.own]).toEqual(['Dresser', 'frameless', 4, 'panel', true]);
    expect(copy!.size).toEqual(cabinetsOf(dresser)[0]!.size);
    expect(copy!.overrides).toBeUndefined();
    expect(cabinetDifferences(into, id)).toEqual([]);
    // It stands on what this project's pieces stand on: a toe kick, not the dresser's feet.
    expect(copy!.toeKick).toEqual(mine!.toeKick);
    // Its four drawers come with it, under new ids, following this project's fronts.
    const fronts = mountedDesigns(into, shopFor(into, profile).materials).filter((d) => d.mounting.openingId.startsWith(`${id}/`));
    expect(fronts.map((d) => d.template)).toEqual(['drawer', 'drawer', 'drawer', 'drawer']);
    expect(new Set(designsOf(into).map((d) => d.id)).size).toBe(designsOf(into).length);
    // The original is untouched, and nothing links the two.
    expect(cabinetsOf(dresser)[0]!.construction).toBe('faceFrame');
    // Only what its own top needs was added to the materials.
    expect(into.materials.map((m) => m.id).filter((m) => !before.includes(m)).sort()).toEqual([]);
    expect(buildJob({ ...into, slug: 'both' }, profile).files.length).toBeGreaterThan(0);
    expect(draws(into).cabinets.length).toBe(2);
  });

  it('a cabinet as it was: what it was made of and how it was built come with it as its own', () => {
    // A solid wood, face frame, stained dresser on feet, brought into a frameless plywood project.
    const dresser = started('dresser', FURNITURE_SOLID_PRESET_ID);
    const into = started('base', FRAMELESS_PRESET_ID);
    // (Taken out of this project first, to see it brought in with the piece.)
    into.materials = into.materials.filter((m) => m.id !== 'solid-wood-3-4');
    const { id } = importPiece(into, dresser, cabinetsOf(dresser)[0]!.id, 'asWas');
    const copy = cabinetsOf(into).find((c) => c.id === id)!;
    expect([copy.construction, copy.materials.caseId, !!copy.toeKick.casters?.feet]).toEqual(['faceFrame', 'solid-wood-3-4', true]);
    expect(cabinetDifferences(into, id).length).toBeGreaterThan(0);
    // This project's own cabinet is as it was.
    expect([cabinetsOf(into)[0]!.construction, contextOf(into).settings.materials.caseId]).toEqual(['frameless', 'plywood-3-4']);
    // Its fronts keep their style and material as their own.
    const front = designsOf(into).find((d) => d.template === 'drawer' && d.mounting.openingId.startsWith(`${id}/`))!;
    expect(front.template === 'drawer' && [front.front.style.kind, front.front.materialId]).toEqual(['slab', 'solid-wood-3-4']);
    // What it names is in the project now.
    expect(into.materials.some((m) => m.id === 'solid-wood-3-4')).toBe(true);
    expect(buildJob({ ...into, slug: 'both' }, profile).files.length).toBeGreaterThan(0);
  });

  it('a table comes across too; a cabinet out of a kitchen leaves its run and its place behind', () => {
    const into = started('base', FRAMELESS_PRESET_ID);
    const table = started('sofatable', FACE_FRAME_PRESET_ID);
    const made = importPiece(into, table, framesOf(table)[0]!.id, 'style');
    const frame = framesOf(into).find((f) => f.id === made.id)!;
    expect([frame.name, frame.aprons.materialId, frame.top.materialId, !!frame.shelf]).toEqual(['Sofa table', undefined, undefined, true]);
    expect(frameMaterials(frame, contextOf(into)).apronId).toBe(contextOf(into).settings.materials.caseId);
    expect(into.materials.some((m) => m.id === frame.legs.materialId)).toBe(true);
    const asWas = importPiece(into, table, framesOf(table)[0]!.id, 'asWas');
    const second = framesOf(into).find((f) => f.id === asWas.id)!;
    expect([second.name, second.aprons.materialId]).toEqual(['Sofa table 2', frameMaterials(framesOf(table)[0]!, contextOf(table)).apronId]);

    const kitchen = createKitchenProject();
    const inRun = cabinetsOf(kitchen).find((c) => c.runId)!;
    const { id } = importPiece(into, kitchen, inRun.id, 'style');
    const copy = cabinetsOf(into).find((c) => c.id === id)!;
    expect([copy.runId, copy.placement, copy.sides]).toEqual([undefined, undefined, { left: 'exposed', right: 'exposed' }]);
    expect(contextOf(into).runs).toEqual([]);
    expect(piecesOf(into).length).toBe(4);
    expect(draws(into).cabinets.length).toBe(4);
    expect(() => importPiece(into, kitchen, 'no-such-piece', 'style')).toThrow('Piece not found');
  });
});
