// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { benchTopTable, leafEdgeClosed, lightTopTable, starterTopSettings, topPieces, topWarnings } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project, TopLeaf } from '@/model';
import { createIslandProject, createFoldingShopTableProject, createShopTableProject, createShopReferenceProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A leaf belongs to a top, on one of its edges, and only on an edge that is open. */
const shop = createStarterShop();
const contextOf = (p: Project) => p.context as CasesContext;
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;
const L = (mm: number) => `${inch(mm)}"`;
const words = (project: Project) => topWarnings(project, shop.materials, L).map((w) => w.text);
const leaf = (edge: TopLeaf['edge'], length: string): TopLeaf => ({ edge, length: len(length) });
/** A project whose tops are torsion boxes, with the box's materials in it. */
function torsion<T extends Project>(project: T, box = benchTopTable()): T {
  contextOf(project).tops = { ...starterTopSettings(), kind: 'torsion', torsion: box };
  for (const id of [box.skins.topId, box.skins.bottomId, box.ribs.materialId]) if (!project.materials.some((m) => m.id === id)) project.materials.push(shop.materials.find((m) => m.id === id)!);
  return project;
}

describe('the folding table', () => {
  it("its top's size is the part that stays; the leaf is 28\" more at the back, and nothing is wrong with it", () => {
    const project = createFoldingShopTableProject();
    const top = contextOf(project).islands![0]!.top!;
    expect(top.leaf).toEqual({ edge: 'back', length: len('28"') });
    expect(inch(top.size!.width.mm)).toBe(84);
    const [piece] = topPieces(project, shop.materials);
    expect(piece!.leaf).toEqual({ edge: 'back', length: len('28"').mm });
    expect(inch(piece!.zFront - piece!.zBack)).toBe(112);
    expect(piece!.torsion!.leaf!.edge).toBe('back');
    expect(words(project)).toEqual([]);
  });

  it('warns of a leaf that would reach the floor, and of one that reaches past the walls when up', () => {
    const project = createFoldingShopTableProject();
    contextOf(project).islands![0]!.top!.leaf = leaf('back', '32"');
    expect(words(project).some((w) => /folded down it would reach the floor. Make it 29.016" or less/.test(w))).toBe(true);
    contextOf(project).islands![0]!.top!.leaf = leaf('back', '60"');
    expect(words(project)).toContain("With its leaf up the top reaches past the room's walls.");
  });

  it('warns when what stands under the top reaches past the joint', () => {
    const project = createShopTableProject();
    const top = contextOf(project).islands![0]!.top!;
    // The cabinets stand under 84" of it: a part that stays of 60" leaves them under the leaf.
    top.size = { length: top.size!.length, width: len('60"') };
    top.leaf = leaf('back', '24"');
    expect(words(project).some((w) => /What stands under the top reaches 10" past the leaf's joint at its back/.test(w))).toBe(true);
  });
});

describe('an edge takes a leaf only when it is open', () => {
  it("an island's ends are open; its back is not when a second row faces that way", () => {
    const project = torsion(createIslandProject(), lightTopTable());
    const island = contextOf(project).islands![0]!;
    island.top = {};
    const [piece] = topPieces(project, shop.materials);
    expect(leafEdgeClosed(project, piece!, 'left')).toBeUndefined();
    expect(leafEdgeClosed(project, piece!, 'right')).toBeUndefined();
    expect(leafEdgeClosed(project, piece!, 'back')).toMatch(/second row faces that way/);
    // Asked for there, it is refused: the top is as it was, and says why.
    const before = [piece!.zBack, piece!.zFront];
    island.top = { leaf: leaf('back', '12"') };
    const [refused] = topPieces(project, shop.materials);
    expect(refused!.leaf).toBeUndefined();
    expect([refused!.zBack, refused!.zFront]).toEqual(before);
    expect(refused!.torsion!.leaf).toBeUndefined();
    expect(words(project)).toEqual([expect.stringMatching(/^No leaf at the back: the island's second row faces that way/)]);
  });

  it('a run against a wall, between the wall and a tall cabinet, has no open edge', () => {
    const project = torsion(createShopReferenceProject());
    const run = contextOf(project).runs.find((r) => r.name === 'Bench run')!;
    run.top = {};
    const [piece] = topPieces(project, shop.materials);
    expect(leafEdgeClosed(project, piece!, 'left')).toBe('Its left end is against a wall.');
    expect(leafEdgeClosed(project, piece!, 'right')).toBe('Its right end stops at a tall cabinet or an appliance.');
    expect(leafEdgeClosed(project, piece!, 'back')).toBe('Its back is against a wall.');
    run.top = { leaf: leaf('left', '12"') };
    expect(words(project)).toEqual(['No leaf at the left end: its left end is against a wall.']);
  });

  it('a cabinet standing free is open on every edge', () => {
    const project = torsion(createShopReferenceProject());
    const lone = contextOf(project).pieces.find((c) => c.name === 'Doors')!;
    lone.placement = { wall: 'free', x: len('60"'), y: len('60"'), turn: 0 };
    lone.top = {};
    const [piece] = topPieces(project, shop.materials);
    for (const edge of ['left', 'right', 'back'] as const) expect(leafEdgeClosed(project, piece!, edge), edge).toBeUndefined();
  });
});

describe('what else is refused', () => {
  it('a bought and a measured top take no leaf', () => {
    for (const [kind, why] of [['bought', 'A bought laminate top takes no leaf.'], ['measured', 'A top that is measured for and bought takes no leaf.']] as const) {
      const project = createFoldingShopTableProject();
      contextOf(project).islands![0]!.top!.settings = { kind };
      const [piece] = topPieces(project, shop.materials);
      expect(piece!.leaf).toBeUndefined();
      expect(words(project)).toEqual([why]);
    }
  });

  it('a leaf, or a part that stays, too short to make', () => {
    const project = createFoldingShopTableProject();
    contextOf(project).islands![0]!.top!.leaf = leaf('back', '3"');
    const [piece] = topPieces(project, shop.materials);
    expect(piece!.leaf).toBeUndefined();
    // The top is the part that stays, with no leaf added.
    expect(inch(piece!.zFront - piece!.zBack)).toBe(84);
    expect(words(project)[0]).toMatch(/The leaf and the part that stays must each be at least/);
  });
});
