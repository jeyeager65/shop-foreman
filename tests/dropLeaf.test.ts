// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DROP_LEAF, buildCabinetAssembly, deriveCabinetParts, dropLeafHinges, dropLeafSupport, partBox, shownTopParts, starterTopSettings, topPieces, topWarnings } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Part, Project, TopLeaf } from '@/model';
import { activeMachine } from '@/plan';
import { createKitchenProject, createShopReferenceProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A drop leaf on a slab top. */
const shop = createStarterShop();
const contextOf = (p: Project) => p.context as CasesContext;
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;
const L = (mm: number) => `${inch(mm)}"`;
const leaf = (edge: TopLeaf['edge'], length: string): TopLeaf => ({ edge, length: len(length) });
const tops = (project: Project) => deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'topEdge');
const isLeaf = (p: Part) => p.name.startsWith('Leaf: ');

/** The shop's cabinet on its own, standing free, under a slab top of Setup's (3/4" plywood, a solid wood strip) with a leaf. */
function bench(own: TopLeaf | undefined, change?: (c: CasesContext) => void): Project {
  const project = createShopReferenceProject();
  const context = contextOf(project);
  for (const id of ['plywood-3-4', 'solid-wood-3-4']) if (!project.materials.some((m) => m.id === id)) project.materials.push(shop.materials.find((m) => m.id === id)!);
  const lone = context.pieces.find((c) => c.name === 'Doors')!;
  lone.placement = { wall: 'free', x: len('60"'), y: len('60"'), turn: 0 };
  // (The shop makes two of it: one here, so that each part is there once.)
  lone.quantity = 1;
  lone.top = own ? { leaf: own } : {};
  change?.(context);
  return project;
}

describe('what holds a drop leaf up', () => {
  it('brackets under a short leaf, a leg under a longer one, two legs where the joint is long', () => {
    expect(dropLeafSupport(len('12"').mm, len('24"').mm)).toEqual({ kind: 'brackets', count: 2 });
    expect(dropLeafSupport(len('12-1/4"').mm, len('24"').mm)).toEqual({ kind: 'legs', count: 1 });
    expect(dropLeafSupport(len('20"').mm, len('48"').mm)).toEqual({ kind: 'legs', count: 2 });
    // A hinge about every 16" of the joint, at least two.
    expect([12, 24, 48, 96].map((j) => dropLeafHinges(len(`${j}"`).mm))).toEqual([2, 3, 4, 7]);
  });
});

describe('a drop leaf on the right end of a slab', () => {
  const project = bench(leaf('right', '10"'));
  const [piece] = topPieces(project, shop.materials);
  const parts = tops(project);
  const joint = piece!.x1 - len('10"').mm;

  it('the top is 10" longer at that end, with nothing wrong', () => {
    const [plain] = topPieces(bench(undefined), shop.materials);
    expect(piece!.leaf).toEqual({ edge: 'right', length: len('10"').mm });
    expect(inch(piece!.x1 - plain!.x1)).toBe(10);
    expect(topWarnings(project, shop.materials, L)).toEqual([]);
  });

  it('is two panels that meet square at the joint, each with its own edge strips and none on the joint', () => {
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(['Countertop', 'Countertop edge, front', 'Countertop edge, left end', 'Leaf: Countertop', 'Leaf: Countertop edge, front', 'Leaf: Countertop edge, right end'].sort());
    const [stays, hangs] = [parts.find((p) => p.name === 'Countertop')!, parts.find((p) => p.name === 'Leaf: Countertop')!];
    expect(partBox(stays).max[0]).toBeCloseTo(joint, 6);
    expect(partBox(hangs).min[0]).toBeCloseTo(joint, 6);
    // The leaf's panel stops short of its end by the strip there; its front strip runs from the joint to the end.
    expect(partBox(hangs).max[0]).toBeCloseTo(piece!.x1 - len('3/4"').mm, 6);
    const front = parts.find((p) => p.name === 'Leaf: Countertop edge, front')!;
    expect([partBox(front).min[0], partBox(front).max[0]].map((v) => inch(v - joint))).toEqual([0, 10]);
    expect(partBox(parts.find((p) => p.name === 'Countertop edge, front')!).max[0]).toBeCloseTo(joint, 6);
    // Every part of the leaf folds about the joint's lower edge, a line from front to back; nothing else moves.
    for (const p of parts) {
      if (!isLeaf(p)) expect(p.moves).toBeUndefined();
      else expect(p.moves).toMatchObject({ kind: 'fold', across: 1, axis: [joint, piece!.y] });
    }
  });

  it('is drawn on its hinges, with two brackets that swing in under the part that stays', () => {
    const shapes = shownTopParts(project, shop.materials, shop.hardware);
    const across = piece!.zFront - piece!.zBack;
    expect(shapes.filter((p) => p.name === 'Hinge')).toHaveLength(dropLeafHinges(across));
    const brackets = shapes.filter((p) => p.name === 'Swing-out bracket');
    expect(brackets).toHaveLength(2);
    for (const b of brackets) {
      // An arm under the leaf, from the joint out, short of its edge.
      expect(partBox(b).max[1]).toBeCloseTo(piece!.y, 6);
      expect(partBox(b).max[0]).toBeLessThan(piece!.x1);
      expect(partBox(b).max[0]).toBeGreaterThan(joint + len('6"').mm);
      expect(b.moves).toMatchObject({ kind: 'swingIn' });
    }
    expect(new Set(brackets.map((b) => (b.moves as { sign: number }).sign)).size).toBe(2);
    expect(shapes.some((p) => p.name === 'Leg')).toBe(false);
    const placed = buildCabinetAssembly([...parts, ...shapes]).parts;
    expect(placed.filter((p) => p.swingsIn)).toHaveLength(2);
    expect(placed.filter((p) => p.foldsAcross === 1)).toHaveLength(parts.filter(isLeaf).length);
  });

  it('builds: hinges and brackets on the list, and the steps hinge it face down', () => {
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, L);
    const rows = lists.hardware.filter((h) => h.group === 'Tops').map((h) => [h.item, h.quantity]);
    expect(rows).toContainEqual(['Drop-leaf hinges, or 2-1/2" butt hinges', dropLeafHinges(piece!.zFront - piece!.zBack)]);
    expect(rows).toContainEqual(['Swing-out drop-leaf brackets', 2]);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith("The leaf at a top's right end (10\") is a panel of its own."))).toBe(true);
    expect(steps.some((s) => s.includes('fit the two swing-out brackets'))).toBe(true);
  });
});

describe('a longer leaf, and one at the back', () => {
  it('a 20" leaf stands on a folding leg in the middle of its far edge', () => {
    const project = bench(leaf('left', '20"'));
    const [piece] = topPieces(project, shop.materials);
    const shapes = shownTopParts(project, shop.materials, shop.hardware);
    const legs = shapes.filter((p) => p.name === 'Leg');
    expect(legs).toHaveLength(1);
    expect(shapes.some((p) => p.name === 'Swing-out bracket')).toBe(false);
    // Near the leaf's far (left) edge, half way across the top, reaching the floor.
    expect(partBox(legs[0]!).min[0]).toBeLessThan(piece!.x0 + len('4"').mm);
    expect((partBox(legs[0]!).min[2] + partBox(legs[0]!).max[2]) / 2).toBeCloseTo((piece!.zBack + piece!.zFront) / 2, 6);
    expect(legs[0]!.moves).toMatchObject({ kind: 'fold', across: -1, first: {} });
    const lists = buildLists(buildJob(project, shop), project, shop, L);
    expect(lists.hardware.filter((h) => h.group === 'Tops').map((h) => [h.item, h.quantity])).toContainEqual(['Locking folding leg brackets', 1]);
  });

  it('at the back of a top that stands free: the leaf has the back edge, the part that stays none', () => {
    const project = bench(leaf('back', '10"'));
    const [piece] = topPieces(project, shop.materials);
    const parts = tops(project);
    const joint = piece!.zBack + len('10"').mm;
    expect(parts.map((p) => p.name).sort()).toEqual(
      ['Countertop', 'Countertop edge, front', 'Countertop edge, left end', 'Countertop edge, right end', 'Leaf: Countertop', 'Leaf: Countertop edge, back', 'Leaf: Countertop edge, left end', 'Leaf: Countertop edge, right end'].sort(),
    );
    expect(partBox(parts.find((p) => p.name === 'Countertop')!).min[2]).toBeCloseTo(joint, 6);
    expect(partBox(parts.find((p) => p.name === 'Leaf: Countertop')!).max[2]).toBeCloseTo(joint, 6);
    expect(parts.find((p) => p.name === 'Leaf: Countertop')!.moves).toEqual({ kind: 'fold', axis: [piece!.y, joint] });
    expect(topWarnings(project, shop.materials, L)).toEqual([]);
  });
});

describe('what a slab leaf is refused for', () => {
  it('a top of two layers; a leaf too short; a part that stays too short', () => {
    const two = bench(leaf('right', '10"'), (c) => (c.tops = { ...starterTopSettings(), layers: 2 }));
    expect(topWarnings(two, shop.materials, L).map((w) => w.text)).toEqual(['A leaf wants a top of one layer: this one has two.']);
    expect(tops(two).some(isLeaf)).toBe(false);
    const short = bench(leaf('right', '3"'));
    expect(topWarnings(short, shop.materials, L)[0]!.text).toBe(`A leaf must be at least ${inch(DROP_LEAF.least)}" long.`);
  });
});

describe('a leaf on the open end of a long run', () => {
  it('is not part of what must fit the sheet, and stays with the piece at that end when the top is split', () => {
    const project = createKitchenProject();
    const run = contextOf(project).runs[0]!;
    run.top = { leaf: leaf('right', '10"') };
    const pieces = topPieces(project, shop.materials);
    // 97" of top over 42", 36" and 18" cabinets is split as it is without a leaf; only the right piece has the leaf.
    run.top = {};
    const plain = topPieces(project, shop.materials);
    expect(pieces.map((p) => p.cabinetIds)).toEqual(plain.map((p) => p.cabinetIds));
    expect(pieces.map((p) => p.leaf?.edge)).toEqual([...plain.slice(0, -1).map(() => undefined), 'right']);
    expect(inch(pieces.at(-1)!.x1 - plain.at(-1)!.x1)).toBe(10);
  });
});
