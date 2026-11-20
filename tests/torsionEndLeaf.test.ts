// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LEAF, buildCabinetAssembly, deriveCabinetParts, lightTopTable, partBox, shownTopParts, topPieces, topWarnings } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, LeafEdge, Part, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createIslandProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A torsion leaf on an end is the leaf at the back, turned. */
const shop = createStarterShop();
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;
const L = (mm: number) => `${inch(mm)}"`;

/** The island (two rows back to back, 78" × 45") under a light torsion top 2" over all round, with a 24" leaf on an end. */
function island(edge: LeafEdge | undefined): Project {
  const project = createIslandProject();
  project.materials.push(...shop.materials.filter((m) => m.id === 'mdf-1-4'));
  (project.context as CasesContext).islands![0]!.top = { settings: { kind: 'torsion', torsion: lightTopTable() }, ...(edge ? { leaf: { edge, length: len('24"') } } : {}) };
  return project;
}
const made = (project: Project) => deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'rib');
const isLeaf = (p: Part) => p.name.startsWith('Leaf: ');
/** A part that folds with a leaf on an end: about the line from front to back through (x, y), and nothing else of its own. */
function expectFold(p: Part, x: number, y: number, across: 1 | -1) {
  const m = p.moves as { kind: string; axis: [number, number]; across?: number; first?: unknown };
  expect([m.kind, m.across, m.first]).toEqual(['fold', across, undefined]);
  expect(m.axis[0]).toBeCloseTo(x, 6);
  expect(m.axis[1]).toBeCloseTo(y, 6);
}
const holes = (p: Part, id: string) => p.features.flatMap((f) => (f.kind === 'hole' && f.id.startsWith(id) ? [f.center.x] : []));

describe('a torsion leaf on the right end', () => {
  const project = island('right');
  const [piece] = topPieces(project, shop.materials);
  const parts = made(project);
  const joint = piece!.x1 - len('24"').mm;

  it('the top is 24" longer at that end, and nothing is wrong with it', () => {
    const [plain] = topPieces(island(undefined), shop.materials);
    expect(piece!.leaf).toEqual({ edge: 'right', length: len('24"').mm });
    expect(inch(piece!.x1 - plain!.x1)).toBe(24);
    expect([piece!.x0, piece!.zBack, piece!.zFront]).toEqual([plain!.x0, plain!.zBack, plain!.zFront]);
    expect(topWarnings(project, shop.materials, L)).toEqual([]);
  });

  it('is two boxes that meet at the joint: the part that stays to its left, the leaf to its right', () => {
    const fixed = parts.filter((p) => !isLeaf(p));
    const leaf = parts.filter(isLeaf);
    expect(leaf.length).toBeGreaterThan(8);
    expect(Math.max(...fixed.map((p) => partBox(p).max[0]))).toBeCloseTo(joint, 6);
    expect(Math.min(...leaf.map((p) => partBox(p).min[0]))).toBeCloseTo(joint, 6);
    expect(Math.min(...fixed.map((p) => partBox(p).min[0]))).toBeCloseTo(piece!.x0, 6);
    expect(Math.max(...leaf.map((p) => partBox(p).max[0]))).toBeCloseTo(piece!.x1, 6);
    // Both are the table's whole width, and stand on the cabinets.
    for (const box of [fixed, leaf]) {
      expect(Math.min(...box.map((p) => partBox(p).min[2]))).toBeCloseTo(piece!.zBack, 6);
      expect(Math.max(...box.map((p) => partBox(p).max[2]))).toBeCloseTo(piece!.zFront, 6);
      expect(Math.min(...box.map((p) => partBox(p).min[1]))).toBeCloseTo(piece!.y, 6);
    }
  });

  it('the two ribs that meet are end ribs, named so, with matching holes for the alignment pins', () => {
    const stays = parts.find((p) => p.name === 'Rib, right end')!;
    const hangs = parts.find((p) => p.name === 'Leaf: Rib, left end')!;
    expect(holes(stays, 'leaf-pin')).toHaveLength(LEAF.pin.count);
    expect(holes(hangs, 'leaf-pin')).toEqual(holes(stays, 'leaf-pin'));
    // They stand face to face at the joint, and run the table's width.
    expect(partBox(stays).max[0]).toBeCloseTo(joint, 6);
    expect(partBox(hangs).min[0]).toBeCloseTo(joint, 6);
    expect(stays.size.width).toBeCloseTo(piece!.zFront - piece!.zBack, 6);
    // The leaf's far rib has the rest feet's holes; a backer stands in every cell along the joint, in both boxes.
    expect(holes(parts.find((p) => p.name === 'Leaf: Rib, right end')!, 'leaf-rest')).toHaveLength(LEAF.rest.count);
    const backers = parts.filter((p) => /Hinge backer/.test(p.name));
    expect(backers.filter(isLeaf).length).toBe(backers.filter((p) => !isLeaf(p)).length);
    expect(backers.length).toBeGreaterThan(4);
  });

  it('the leaf swings down about a line from front to back under the joint, its legs folding first', () => {
    const leaf = parts.filter(isLeaf);
    for (const p of leaf) expectFold(p, joint, piece!.y, 1);
    expect(parts.filter((p) => !isLeaf(p)).every((p) => !p.moves)).toBe(true);
    const shapes = shownTopParts(project, shop.materials, shop.hardware);
    const legs = shapes.filter((p) => p.name === 'Leg');
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      // Under the leaf's far end, reaching the floor; each folds about a line across the table.
      expect(partBox(leg).min[0]).toBeGreaterThan(joint);
      expect(partBox(leg).max[0]).toBeLessThan(piece!.x1);
      expect(leg.moves).toMatchObject({ kind: 'fold', across: 1, first: { sign: expect.any(Number) } });
    }
    const signs = legs.map((l) => (l.moves as { first: { sign: number } }).first.sign);
    expect(signs[0]).toBe(-signs[1]!);
    // The hinge's knuckle lies under the joint, the table's whole width.
    const hinge = shapes.find((p) => p.name === 'Hinge')!;
    expect((partBox(hinge).min[0] + partBox(hinge).max[0]) / 2).toBeCloseTo(joint, 6);
    expect(partBox(hinge).max[2] - partBox(hinge).min[2]).toBeCloseTo(piece!.zFront - piece!.zBack, 6);
    // The view takes them as a leaf that folds across.
    const placed = buildCabinetAssembly([...parts, ...shapes]).parts.filter((p) => p.foldsAbout);
    expect(placed.length).toBe(leaf.length + shapes.filter((p) => p.moves).length);
    expect(placed.every((p) => p.foldsAcross === 1)).toBe(true);
  });

  it('builds: the hinge is as long as the table is wide, and the steps say what stays', () => {
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    const hinge = lists.hardware.find((h) => /Continuous \(piano\) hinge/.test(h.item))!;
    expect(hinge.note).toContain(`${inch(piece!.zFront - piece!.zBack)}" of it`);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.includes(`the part that stays (${inch(joint - piece!.x0)}") and its leaf (24")`))).toBe(true);
  });
});

describe('a torsion leaf on the left end', () => {
  it('is the same, the other way round', () => {
    const project = island('left');
    const [piece] = topPieces(project, shop.materials);
    const parts = made(project);
    const joint = piece!.x0 + len('24"').mm;
    const leaf = parts.filter(isLeaf);
    expect(Math.max(...leaf.map((p) => partBox(p).max[0]))).toBeCloseTo(joint, 6);
    expect(Math.min(...leaf.map((p) => partBox(p).min[0]))).toBeCloseTo(piece!.x0, 6);
    expect(Math.min(...parts.filter((p) => !isLeaf(p)).map((p) => partBox(p).min[0]))).toBeCloseTo(joint, 6);
    for (const p of leaf) expectFold(p, joint, piece!.y, -1);
    expect(holes(parts.find((p) => p.name === 'Leaf: Rib, right end')!, 'leaf-pin')).toEqual(holes(parts.find((p) => p.name === 'Rib, left end')!, 'leaf-pin'));
    // As many parts as with the leaf on the right, of the same sizes.
    const sizes = (list: Part[]) => list.map((p) => [p.size.width, p.size.height, p.size.thickness].map((v) => v.toFixed(3)).join('x')).sort();
    expect(sizes(parts)).toEqual(sizes(made(island('right'))));
    expect(topWarnings(project, shop.materials, L)).toEqual([]);
  });
});
