// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { benchTopTable, cabinetPlaces, deriveCabinetParts, inRoom, lightTopTable, starterTopSettings, topPieces, topWarnings, type TopPiece } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createKitchenProject, createShopReferenceProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A torsion top on a run and on a cabinet on its own. */
const shop = createStarterShop();
const contextOf = (p: Project) => p.context as CasesContext;
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;
const L = (mm: number) => `${inch(mm)}"`;

/** A project whose tops are torsion boxes, with the box's materials in it. */
function torsion<T extends Project>(project: T, box = benchTopTable()): T {
  contextOf(project).tops = { ...starterTopSettings(), kind: 'torsion', torsion: box };
  for (const id of [box.skins.topId, box.skins.bottomId, box.ribs.materialId]) if (!project.materials.some((m) => m.id === id)) project.materials.push(shop.materials.find((m) => m.id === id)!);
  return project;
}
const bench = (project: Project) => contextOf(project).runs.find((r) => r.name === 'Bench run')!;

describe('a torsion top on a run', () => {
  it('against a wall: stops at the wall end and at a tall cabinet, its own overhang at the front, none at the back', () => {
    const project = torsion(createShopReferenceProject());
    bench(project).top = {};
    const [piece, ...more] = topPieces(project, shop.materials);
    expect(more).toEqual([]);
    expect(piece!.torsion).toBeDefined();
    expect(piece!.ends).toEqual({ left: 'wall', right: 'tall' });
    // Over the 6" filler to the wall; to the tall cabinet's side; back to the wall; 2" over the (inset) fronts.
    expect([inch(piece!.x0), inch(piece!.x1)]).toEqual([-6, 78]);
    expect([inch(piece!.zBack), inch(piece!.zFront)]).toEqual([-22.5, 2]);
  });

  it('is made of skins and ribs: no slab, no backsplash, no edge strip', () => {
    const project = torsion(createShopReferenceProject());
    bench(project).top = {};
    const parts = deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'rib' || p.role === 'topEdge');
    expect(parts.some((p) => p.role === 'rib')).toBe(true);
    expect(parts.filter((p) => p.role === 'top').every((p) => /skin/.test(p.name))).toBe(true);
    expect(parts.some((p) => p.role === 'topEdge' || /splash|Countertop/.test(p.name))).toBe(false);
  });

  it('a typed size is measured from the wall: between a wall and a tall cabinet the length is theirs', () => {
    const project = torsion(createShopReferenceProject());
    bench(project).top = { size: { length: len('60"'), width: len('30"') } };
    const [piece] = topPieces(project, shop.materials);
    expect([inch(piece!.x0), inch(piece!.x1)]).toEqual([-6, 78]);
    expect([inch(piece!.zBack), inch(piece!.zFront)]).toEqual([-22.5, 7.5]);
  });

  it('past an open end by its own overhang; a typed length runs from the wall end', () => {
    const project = torsion(createKitchenProject());
    const run = contextOf(project).runs[0]!;
    run.top = {};
    const [derived] = topPieces(project, shop.materials);
    expect(derived!.ends).toEqual({ left: 'wall', right: 'open' });
    expect([inch(derived!.x0), inch(derived!.x1)]).toEqual([0, 42 + 36 + 18 + 2]);
    run.top = { size: { length: len('90"'), width: len('26"') } };
    const [typed] = topPieces(project, shop.materials);
    expect([inch(typed!.x0), inch(typed!.x1)]).toEqual([0, 90]);
    expect(inch(typed!.zFront - typed!.zBack)).toBe(26);
  });

  it("warns of ribs longer than their sheet, and not once the top is typed shorter", () => {
    const project = torsion(createKitchenProject());
    const run = contextOf(project).runs[0]!;
    run.top = {};
    const words = topWarnings(project, shop.materials, L).map((w) => w.text);
    expect(words).toHaveLength(1);
    expect(words[0]).toContain('Its ribs run 98", longer than the 96" sheet');
    run.top = { size: { length: len('90"'), width: len('26"') } };
    expect(topWarnings(project, shop.materials, L)).toEqual([]);
  });
});

describe('a torsion top on a cabinet on its own', () => {
  const lone = (project: Project) => contextOf(project).pieces.find((c) => c.name === 'Doors')!;

  it('against a wall: over both open sides and the front, back at the wall', () => {
    const project = torsion(createShopReferenceProject(), lightTopTable());
    lone(project).top = {};
    const [piece] = topPieces(project, shop.materials);
    expect([inch(piece!.x0), inch(piece!.x1)]).toEqual([-2, 26]);
    expect(inch(piece!.zBack)).toBe(-inch(lone(project).size.depth.mm));
  });

  it('standing free: over the back too; a typed size is centred on it', () => {
    const project = torsion(createShopReferenceProject(), lightTopTable());
    const cabinet = lone(project);
    cabinet.placement = { wall: 'free', x: len('60"'), y: len('60"'), turn: 0 };
    cabinet.top = {};
    const depth = inch(cabinet.size.depth.mm);
    const [piece] = topPieces(project, shop.materials);
    expect([inch(piece!.zBack), inch(piece!.zFront)]).toEqual([-depth - 2, 2]);
    cabinet.top = { size: { length: len('48"'), width: len('36"') } };
    const [typed] = topPieces(project, shop.materials);
    expect([inch(typed!.x0), inch(typed!.x1)]).toEqual([-12, 36]);
    expect(inch((typed!.zBack + typed!.zFront) / 2)).toBeCloseTo(-depth / 2, 3);
    expect(inch(typed!.zFront - typed!.zBack)).toBe(36);
  });

  it('one torsion bench in a project of slabs: only that top is a box', () => {
    const project = createShopReferenceProject();
    const box = benchTopTable();
    project.materials.push(...shop.materials.filter((m) => [box.skins.topId, box.ribs.materialId].includes(m.id) && !project.materials.some((o) => o.id === m.id)));
    bench(project).top = {};
    lone(project).top = { settings: { kind: 'torsion', torsion: box } };
    const pieces = topPieces(project, shop.materials);
    expect(pieces.map((p) => !!p.torsion)).toEqual([false, true]);
    const names = deriveCabinetParts(project, shop).filter((p) => p.role === 'top').map((p) => p.name);
    expect(names).toContain('Countertop');
    expect(names).toContain('Top skin');
  });
});

describe('torsion tops at a corner', () => {
  const room = (project: Project, piece: TopPiece, x: number, z: number) => {
    const at = cabinetPlaces(project)!.get(piece.cabinetId)!;
    const p = inRoom(at.at, at.turn, [x, 0, z]);
    return [p[0], p[2]];
  };
  const kitchen = () => {
    const project = torsion(createKitchenProject());
    const runs = contextOf(project).runs;
    runs[0]!.top = { size: { length: len('90"'), width: len('26"') } };
    runs[1]!.top = { cornerJoint: 'mitre' };
    return project;
  };

  it("the left run's stops at the back run's front edge: no pocket screws, no mitre, and a warning", () => {
    const project = kitchen();
    const pieces = topPieces(project, shop.materials);
    const [back, left] = [pieces.find((p) => p.runId === contextOf(project).runs[0]!.id)!, pieces.find((p) => p.runId === contextOf(project).runs[1]!.id)!];
    expect(left.stops).toEqual(['right']);
    expect(left.pockets).toBeUndefined();
    expect(left.mitre ?? back.mitre).toBeUndefined();
    expect(room(project, left, left.x1, left.zBack)[1]).toBeCloseTo(room(project, back, back.x1, back.zFront)[1]!, 6);
    const words = topWarnings(project, shop.materials, L);
    expect(words.filter((w) => w.pieceId === left.id).map((w) => w.text)).toEqual([expect.stringContaining('stops at the front edge of the top it meets at the corner')]);
    // No pocket holes are cut in either box.
    expect(deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'rib').some((p) => p.features.some((f) => f.kind === 'pocketHole'))).toBe(false);
  });
});

describe('building a run under a torsion top', () => {
  it('lists its glue and brads, and the checklist builds the box before the tops go on', () => {
    const project = torsion(createShopReferenceProject());
    bench(project).top = {};
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    expect(lists.hardware.filter((h) => h.group === 'Torsion table').map((h) => h.item)).toEqual(['Wood glue', '18 ga brad nails, 1-1/4"']);
    // Nothing of a slab: no caulk for a backsplash, and nothing to buy as a top.
    expect(lists.hardware.some((h) => /caulk/i.test(h.item))).toBe(false);
    expect(lists.buying.some((b) => /Countertop/.test(b.material))).toBe(false);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps[0]).toContain('egg-crate');
    expect(steps.at(-1)).toContain('Set the tops on the cabinets and fasten them from below');
    expect(steps.some((s) => /backsplash|edge strip/i.test(s))).toBe(false);
  });
});
