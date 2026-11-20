// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SEATING, shopFor, partBox, partShows, projectShows, deriveCabinetParts, seatingBrackets, seatingStools, stoolShapes, topPieces, topWarnings } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { type ProjectScene, projectScene } from '@/design/scene';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, LeafEdge, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createCommonKitchenProject, createIslandProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A side for stools on an island's top: one open edge reaches further past the cabinets. */
const shop = createStarterShop();
const contextOf = (p: Project) => p.context as CasesContext;
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;
const L = (mm: number) => `${inch(mm)}"`;
/** The common kitchen: its island is one row of two cabinets, 66" long, under one bought laminate top. */
const kitchen = (edge?: LeafEdge, overhang = '12"') => {
  const project = createCommonKitchenProject();
  if (edge) contextOf(project).islands![0]!.top!.seating = { edge, overhang: len(overhang) };
  const materials = [...project.materials];
  return { project, materials, piece: topPieces(project, materials).find((p) => p.island)! };
};

describe('a side for stools', () => {
  it('reaches its own amount past the cabinets at that edge, in place of the usual overhang; the other edges stay', () => {
    const plain = kitchen().piece;
    const back = kitchen('back').piece;
    expect(back.seating?.edge).toBe('back');
    expect(back.seating?.overhang).toBeCloseTo(304.8, 6);
    // The usual overhang there is 1": the top is 11" deeper, at its back only.
    expect(inch(plain.zBack - back.zBack)).toBe(11);
    expect([back.x0, back.x1, back.zFront]).toEqual([plain.x0, plain.x1, plain.zFront]);
    const right = kitchen('right', '15"').piece;
    expect(inch(right.x1 - plain.x1)).toBe(14);
    expect([right.x0, right.zBack, right.zFront]).toEqual([plain.x0, plain.zBack, plain.zFront]);
    const left = kitchen('left').piece;
    expect(inch(plain.x0 - left.x0)).toBe(11);
  });

  it('past 10" it rests on brackets, one about every 24", which are listed, warned of and fastened before the top goes on', () => {
    const { project, materials, piece } = kitchen('back');
    // 68" of edge: three brackets, and room for two stools.
    expect(inch(piece.x1 - piece.x0)).toBe(68);
    expect(seatingBrackets(piece)).toBe(3);
    expect(seatingStools(piece)).toBe(2);
    expect(topWarnings(project, materials).map((w) => w.text)).toEqual(['The side for stools is 12" past the cabinets: past 10" the top wants support. 3 bought brackets are on the hardware list, one about every 24", fastened by hand.']);
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    expect(lists.hardware.find((h) => h.item === 'Countertop support brackets')?.quantity).toBe(3);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((s) => s.startsWith("Before the island's top goes on: screw the 3 support brackets"))).toBe(true);
    // Up to 10": no bracket, no warning, nothing listed.
    const short = kitchen('back', '10"');
    expect(seatingBrackets(short.piece)).toBe(0);
    expect(topWarnings(short.project, short.materials)).toEqual([]);
    expect(buildLists(buildJob(short.project, shop), short.project, shop, L).hardware.some((h) => /support brackets/.test(h.item))).toBe(false);
    // With no seating side, nothing of any of it.
    expect(buildLists(buildJob(kitchen().project, shop), kitchen().project, shop, L).hardware.some((h) => /support brackets/.test(h.item))).toBe(false);
  });

  it('is refused where it cannot be: too short, at a second row of fronts, on a torsion top, or on a top that is no island', () => {
    const tooShort = kitchen('back', '4"');
    expect(tooShort.piece.seating).toBeUndefined();
    expect(tooShort.piece.seatingRefused).toBe('A side for stools is at least 8" past the cabinets.');
    expect(topWarnings(tooShort.project, tooShort.materials).map((w) => w.text)).toEqual(['A side for stools is at least 8" past the cabinets.']);
    // Two rows back to back: both long sides have doors and drawers; an end may still seat.
    const island = createIslandProject();
    const top = (contextOf(island).islands![0]!.top ??= {});
    top.seating = { edge: 'back', overhang: len('12"') };
    const materials = [...island.materials];
    const refused = topPieces(island, materials).find((p) => p.island)!;
    expect(refused.seating).toBeUndefined();
    expect(refused.seatingRefused).toMatch(/^No stools at the back: the island's second row faces that way/);
    top.seating = { edge: 'left', overhang: len('12"') };
    expect(topPieces(island, materials).find((p) => p.island)!.seating?.edge).toBe('left');
    // A run against a wall is no island.
    const run = createCommonKitchenProject();
    const wallRun = contextOf(run).runs.find((r) => r.top && !contextOf(run).islands!.some((i) => i.rows.includes(r.id)))!;
    wallRun.top!.seating = { edge: 'right', overhang: len('12"') };
    expect(topPieces(run, [...run.materials]).some((p) => p.seatingRefused === 'Only an island or a peninsula has a side for stools.')).toBe(true);
  });

  it('stools are drawn at it, one for about every 24", tucked a little under the top, and are never parts of the job', () => {
    const { project, materials, piece } = kitchen('back');
    const stools = stoolShapes(project, materials);
    expect(stools.filter((p) => p.id.includes('-seat/'))).toHaveLength(2);
    expect(stools).toHaveLength(10);
    // Drawn as the top is: its material, its finish, on every face.
    for (const p of stools) {
      expect(p.role).toBe('top');
      expect(p.materialId).toBe(piece.settings.materialId);
      expect(partShows(p)).toEqual({ A: 'shows', B: 'shows', edges: 'shows' });
    }
    for (const seat of stools.filter((p) => p.id.includes('-seat/'))) {
      const box = partBox(seat);
      // Under the top, along its seating edge, partly under the overhang and partly out.
      expect(box.max[1]).toBeLessThan(piece.y - 200);
      expect(box.min[0]).toBeGreaterThan(piece.x0);
      expect(box.max[0]).toBeLessThan(piece.x1);
      expect(box.min[2]).toBeLessThan(piece.zBack);
      expect(box.max[2]).toBeGreaterThan(piece.zBack);
      // Clear of the cabinets and the finished back over them, which stands in the overhang.
      expect(box.max[2]).toBeLessThan(piece.zBack + piece.seating!.overhang - 25);
    }
    // At the 10" it starts at, and at an end, the same.
    const ten = kitchen('back', '10"');
    for (const seat of stoolShapes(ten.project, ten.materials).filter((p) => p.id.includes('-seat/'))) expect(partBox(seat).max[2]).toBeLessThan(ten.piece.zBack + 254 - 25);
    const end = kitchen('right', '10"');
    for (const seat of stoolShapes(end.project, end.materials).filter((p) => p.id.includes('-seat/'))) expect(partBox(seat).min[0]).toBeGreaterThan(end.piece.x1 - 254 + 25);
    expect(stoolShapes(kitchen().project, materials)).toEqual([]);
    const job = buildJob(project, shop);
    expect(job.projectParts.some((p) => p.id.includes('/stool-'))).toBe(false);
    expect(SEATING.start).toBeCloseTo(254, 6);
    expect(seatingBrackets({ ...piece, seating: { edge: 'back', overhang: SEATING.start } })).toBe(0);
  });

  it('moves no cabinet: the stools are not what a cabinet stands by', () => {
    const profile = createStarterShopProfile();
    const placesOf = (project: Project) => {
      const scene = projectScene(project, shopFor(project, profile), profile.materialGroups) as ProjectScene;
      return Object.fromEntries(scene.cabinets.map((c) => [c.id, [...c.at, c.turn ?? 0]]));
    };
    expect(placesOf(kitchen('back').project)).toEqual(placesOf(kitchen().project));
    expect(placesOf(kitchen('left').project)).toEqual(placesOf(kitchen().project));
  });
});

describe("an island's finished back", () => {
  it('has its edges finished: its ends are seen beside the end cabinets', () => {
    const project = createCommonKitchenProject();
    const parts = deriveCabinetParts(project, shop);
    const back = parts.find((p) => /\/island-back$/.test(p.id))!;
    expect(projectShows(project, parts).get(back.id)).toEqual({ A: 'shows', B: 'hidden', edges: 'shows' });
    // A filler strip's edges are still hidden.
    const filler = parts.find((p) => p.role === 'filler' && !/island-back/.test(p.id));
    if (filler) expect(projectShows(project, parts).get(filler.id)!.edges).toBe('hidden');
  });
});
