// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { benchTopTable, cabinetsOf, deriveFrameParts, frameLayout, frameLeafOf, frameLeafShapes, framesOf, leafEdgeClosed, partBox, shopFor, torsionMaterialIds } from '@/design';
import { addMaterialFromCatalog } from '@/design/materials';
import { projectScene } from '@/design/scene';
import { deriveTopParts, shownTopParts, starterOwnTop, topPieces, topWarnings } from '@/design/tops';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID } from '@/libraries';
import type { CasesContext, DesignedCabinetContext, Part, Project, StoredFrame } from '@/model';
import { createBaseCabinetProject, deleteCabinet } from '@/samples/cabinet';
import { starterById } from '@/samples/starters';
import { TABLE_SIZES, addTable } from '@/samples/tables';
import { len } from '@/units';

/** Leaves on furniture, a table's top and a piece's own top. */
const profile = createStarterShopProfile();
const materials = (p: Project) => shopFor(p, profile).materials;
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
const L = (mm: number) => `${inches(mm)}"`;
const isLeaf = (p: Part) => p.name.startsWith('Leaf: ');
const contextOf = (p: Project) => p.context as DesignedCabinetContext;

/** A project that is one table 36" × 20" × 30" high, its top flush with the back legs, changed as `own` says. */
function table(own: (frame: StoredFrame, project: Project) => void): { project: Project; frame: StoredFrame } {
  const project = createBaseCabinetProject('faceFrame');
  const frame = addTable(project, profile, { name: 'Table', size: TABLE_SIZES.dropLeaf });
  deleteCabinet(project, cabinetsOf(project)[0]!.id);
  frame.top.overhang.back = len('0"');
  own(frame, project);
  return { project, frame };
}
const partsOf = (project: Project) => deriveFrameParts(framesOf(project)[0]!, contextOf(project), materials(project));

describe('the drop-leaf table', () => {
  it('is a starter: a table with a 10" leaf along each long side, its top flush with the legs there', () => {
    const starter = starterById('dropleaftable')!;
    const project = createBaseCabinetProject('faceFrame');
    starter.add!(project, 'Drop-leaf table', undefined, profile);
    const frame = framesOf(project)[0]!;
    expect(frame.top.leaf).toEqual({ edge: 'back', length: len('10"'), both: true });
    expect([frame.top.overhang.front.mm, frame.top.overhang.back.mm]).toEqual([0, 0]);
    expect(frame.top.edge.kind).toBe('banding');
    // It is drawn: the table, its leaf, and what the leaf hangs on.
    const scene = projectScene(project, shopFor(project, profile));
    expect('error' in scene).toBe(false);
  });
});

describe("a slab leaf along a table's back", () => {
  const { project, frame } = table((f) => (f.top.leaf = { edge: 'back', length: len('10"') }));
  const parts = partsOf(project);
  const layout = frameLayout(frame, contextOf(project), materials(project));

  it("the table's size is the part that stays, over the legs; the leaf is 10\" more behind it", () => {
    expect(layout.leaf).toEqual({ edge: 'back', length: len('10"').mm });
    const leaf = frameLeafOf(frame, contextOf(project), materials(project))!;
    expect([leaf.joint, leaf.stays, leaf.whole.length, leaf.whole.width].map(inches)).toEqual([36, 20, 36, 30]);
    const top = parts.filter((p) => p.role === 'top' || p.role === 'topEdge');
    const stays = top.filter((p) => !isLeaf(p));
    const hangs = top.filter(isLeaf);
    expect([Math.min(...stays.map((p) => partBox(p).min[2])), Math.max(...stays.map((p) => partBox(p).max[2]))].map(inches)).toEqual([-20, 0]);
    expect([Math.min(...hangs.map((p) => partBox(p).min[2])), Math.max(...hangs.map((p) => partBox(p).max[2]))].map(inches)).toEqual([-30, -20]);
    // The legs have not moved: none stands under the leaf.
    for (const leg of parts.filter((p) => p.role === 'leg')) expect(partBox(leg).min[2]).toBeGreaterThanOrEqual(-len('20"').mm - 1e-6);
  });

  it('the two panels have an edge strip on every side but the joint', () => {
    const names = parts.filter((p) => p.role === 'top' || p.role === 'topEdge').map((p) => p.name).sort();
    expect(names).toEqual(
      ['Top', 'Top edge, front', 'Top edge, left end', 'Top edge, right end', 'Leaf: Top', 'Leaf: Top edge, back', 'Leaf: Top edge, left end', 'Leaf: Top edge, right end'].sort(),
    );
    for (const p of parts.filter(isLeaf)) expect(p.moves).toEqual({ kind: 'fold', axis: [layout.legHeight, -len('20"').mm] });
    expect(parts.filter((p) => !isLeaf(p)).every((p) => !p.moves)).toBe(true);
  });

  it('hangs on hinges under the joint, and rests on two brackets that swing in under the top', () => {
    const shapes = frameLeafShapes(frame, contextOf(project), materials(project));
    expect(shapes.filter((p) => p.name === 'Hinge')).toHaveLength(4);
    const brackets = shapes.filter((p) => p.name === 'Swing-out bracket');
    expect(brackets).toHaveLength(2);
    for (const b of brackets) {
      expect(partBox(b).max[1]).toBeCloseTo(layout.legHeight, 6);
      expect(partBox(b).min[2]).toBeLessThan(-len('26"').mm);
      expect(b.moves).toMatchObject({ kind: 'swingIn' });
    }
  });

  it('builds: its hinges and brackets are on the list under Tables, and the steps hang the brackets on the apron', () => {
    const shop = shopFor(project, profile);
    const job = buildJob({ ...project, slug: 'leaf' }, profile);
    const rows = buildLists(job, project, shop, L).hardware.filter((h) => h.group === 'Tables');
    expect(rows.map((h) => [h.item, h.quantity])).toEqual(expect.arrayContaining([['Drop-leaf hinges, or 2-1/2" butt hinges', 4], ['Swing-out drop-leaf brackets', 2]]));
    expect(rows.find((h) => h.item === 'Swing-out drop-leaf brackets')!.note).toContain('hinged to the apron under the joint');
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).find((s) => s.title === 'Table: Table')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith("The leaf at the table's back (10\") is a panel of its own."))).toBe(true);
    expect(steps.some((s) => s.includes('With the top on its legs, fit the two swing-out brackets'))).toBe(true);
  });
});

describe('other leaves on a table', () => {
  it('on an end: the leaf is beyond the legs there, and folds about a line from front to back', () => {
    const { project, frame } = table((f) => (f.top.leaf = { edge: 'right', length: len('16"') }));
    const parts = partsOf(project);
    const layout = frameLayout(frame, contextOf(project), materials(project));
    const hangs = parts.filter(isLeaf);
    expect([Math.min(...hangs.map((p) => partBox(p).min[0])), Math.max(...hangs.map((p) => partBox(p).max[0]))].map(inches)).toEqual([36, 52]);
    for (const p of hangs) expect(p.moves).toEqual({ kind: 'fold', axis: [len('36"').mm, layout.legHeight], across: 1 });
    // 16" is more than brackets carry: a folding leg, one where the joint is 20".
    expect(frameLeafShapes(frame, contextOf(project), materials(project)).filter((p) => p.name === 'Leg')).toHaveLength(1);
  });

  it('a torsion box with a leaf: two boxes, pinned, the leaf on legs', () => {
    const { project, frame } = table((f, p) => {
      const box = benchTopTable();
      for (const id of torsionMaterialIds(box)) addMaterialFromCatalog(p, profile.materialCatalog, id);
      f.top = { overhang: { front: len('1"'), ends: len('1"'), back: len('0"') }, edge: { kind: 'none' }, torsion: box, leaf: { edge: 'back', length: len('12"') } };
    });
    const parts = partsOf(project);
    const ribs = parts.filter((p) => p.role === 'rib');
    expect(ribs.some(isLeaf)).toBe(true);
    const pins = (name: string) => parts.find((p) => p.name === name)!.features.filter((f) => f.kind === 'hole' && f.id.startsWith('leaf-pin')).length;
    expect([pins('Rib, back'), pins('Leaf: Rib, front')]).toEqual([3, 3]);
    expect(Math.min(...parts.filter(isLeaf).map((p) => partBox(p).min[2]))).toBeCloseTo(-len('32"').mm, 6);
    const shapes = frameLeafShapes(frame, contextOf(project), materials(project));
    expect(shapes.filter((p) => p.name === 'Leg')).toHaveLength(2);
    expect(shapes.some((p) => p.name === 'Alignment pin')).toBe(true);
    const shop = shopFor(project, profile);
    const job = buildJob({ ...project, slug: 'box-leaf' }, profile);
    expect(buildLists(job, project, shop, L).hardware.some((h) => /Continuous \(piano\) hinge/.test(h.item))).toBe(true);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).find((s) => s.title === 'Table: Table')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.includes('Set the table on its legs and fasten the part that stays'))).toBe(true);
  });

  it('is refused when it would reach the floor, or is too short to make', () => {
    const long = table((f) => (f.top.leaf = { edge: 'back', length: len('30"') }));
    expect(() => frameLayout(long.frame, contextOf(long.project), materials(long.project))).toThrow(/folded down it would reach the floor/);
    expect(frameLeafOf(long.frame, contextOf(long.project), materials(long.project))).toBeUndefined();
    const short = table((f) => (f.top.leaf = { edge: 'back', length: len('2"') }));
    expect(() => frameLayout(short.frame, contextOf(short.project), materials(short.project))).toThrow(/The leaf must be at least 4" long/);
  });
});

describe('a classic drop-leaf table: a leaf on each of two opposite edges', () => {
  const { project, frame } = table((f) => {
    f.top.overhang.front = len('0"');
    f.top.leaf = { edge: 'back', length: len('10"'), both: true };
  });
  const parts = partsOf(project);
  const layout = frameLayout(frame, contextOf(project), materials(project));
  const leaf = frameLeafOf(frame, contextOf(project), materials(project))!;

  it('is 40" wide with both up: 10" in front of the part that stays and 10" behind it', () => {
    expect(leaf.edges).toEqual(['back', 'front']);
    expect([leaf.whole.length, leaf.whole.width, leaf.whole.origin[2]].map(inches)).toEqual([36, 40, 10]);
    const top = parts.filter((p) => p.role === 'top' || p.role === 'topEdge');
    const span = (of: Part[]) => [Math.min(...of.map((p) => partBox(p).min[2])), Math.max(...of.map((p) => partBox(p).max[2]))].map(inches);
    expect(span(top.filter((p) => !p.name.startsWith('Leaf')))).toEqual([-20, 0]);
    expect(span(top.filter((p) => p.name.startsWith('Leaf, back: ')))).toEqual([-30, -20]);
    expect(span(top.filter((p) => p.name.startsWith('Leaf, front: ')))).toEqual([0, 10]);
    // No leg stands under a leaf.
    for (const leg of parts.filter((p) => p.role === 'leg')) {
      expect(partBox(leg).min[2]).toBeGreaterThanOrEqual(-len('20"').mm - 1e-6);
      expect(partBox(leg).max[2]).toBeLessThanOrEqual(1e-6);
    }
  });

  it('the part that stays has an edge strip at its ends only; each leaf on every side but its joint', () => {
    const names = parts.filter((p) => p.role === 'top' || p.role === 'topEdge').map((p) => p.name).sort();
    expect(names).toEqual(
      [
        'Top', 'Top edge, left end', 'Top edge, right end',
        'Leaf, back: Top', 'Leaf, back: Top edge, back', 'Leaf, back: Top edge, left end', 'Leaf, back: Top edge, right end',
        'Leaf, front: Top', 'Leaf, front: Top edge, front', 'Leaf, front: Top edge, left end', 'Leaf, front: Top edge, right end',
      ].sort(),
    );
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    for (const p of parts.filter((x) => x.name.startsWith('Leaf, back: '))) expect(p.moves).toEqual({ kind: 'fold', axis: [layout.legHeight, -len('20"').mm] });
    for (const p of parts.filter((x) => x.name.startsWith('Leaf, front: '))) expect(p.moves).toEqual({ kind: 'fold', axis: [layout.legHeight, 0], front: true });
  });

  it('each leaf hangs on its own hinges and rests on its own two brackets, the front ones a mirror of the back ones', () => {
    const shapes = frameLeafShapes(frame, contextOf(project), materials(project));
    expect(new Set(shapes.map((p) => p.id)).size).toBe(shapes.length);
    expect(shapes.filter((p) => p.name === 'Hinge')).toHaveLength(8);
    const brackets = shapes.filter((p) => p.name === 'Swing-out bracket');
    expect(brackets).toHaveLength(4);
    const front = brackets.filter((b) => partBox(b).max[2] > len('6"').mm);
    const back = brackets.filter((b) => partBox(b).min[2] < -len('26"').mm);
    expect([front.length, back.length]).toEqual([2, 2]);
    // Mirrored about the middle of the part that stays, 10" behind its front; and turning the other way round.
    const mid = -len('10"').mm;
    for (const b of back) {
      const twin = front.find((f) => Math.abs(partBox(f).min[0] - partBox(b).min[0]) < 1e-6)!;
      expect(partBox(twin).max[2] - mid).toBeCloseTo(mid - partBox(b).min[2], 6);
      expect(partBox(twin).min[2] - mid).toBeCloseTo(mid - partBox(b).max[2], 6);
      const [m, t] = [b.moves, twin.moves];
      if (m?.kind !== 'swingIn' || t?.kind !== 'swingIn') throw new Error('a bracket that does not swing in');
      expect(t.sign).toBe(-m.sign);
      expect(t.axis[1] - mid).toBeCloseTo(mid - m.axis[1], 6);
    }
    expect('error' in projectScene(project, shopFor(project, profile))).toBe(false);
  });

  it('builds: twice the hinges and brackets, and steps for the two leaves', () => {
    const shop = shopFor(project, profile);
    const job = buildJob({ ...project, slug: 'classic' }, profile);
    const rows = buildLists(job, project, shop, L).hardware.filter((h) => h.group === 'Tables');
    expect(rows.map((h) => [h.item, h.quantity])).toEqual(expect.arrayContaining([['Drop-leaf hinges, or 2-1/2" butt hinges', 8], ['Swing-out drop-leaf brackets', 4]]));
    expect(rows.find((h) => h.item === 'Swing-out drop-leaf brackets')!.note).toContain('Table: each of its two leaves (front and back)');
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).find((s) => s.title === 'Table: Table')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith("The two leaves at the table's front and back (10\" each) are panels of their own."))).toBe(true);
    expect(steps.some((s) => s.includes('fit two swing-out brackets for each leaf'))).toBe(true);
  });

  it('at both ends: a leaf beyond each end, each on a leg', () => {
    const ends = table((f) => (f.top.leaf = { edge: 'right', length: len('16"'), both: true }));
    const made = partsOf(ends.project);
    const xs = (prefix: string) => made.filter((p) => p.name.startsWith(prefix)).flatMap((p) => [partBox(p).min[0], partBox(p).max[0]]);
    expect([Math.min(...xs('Leaf, left end: ')), Math.max(...xs('Leaf, left end: ')), Math.min(...xs('Leaf, right end: ')), Math.max(...xs('Leaf, right end: '))].map(inches)).toEqual([-16, 0, 36, 52]);
    const whole = frameLeafOf(ends.frame, contextOf(ends.project), materials(ends.project))!.whole;
    expect([whole.length, whole.width, whole.origin[0]].map(inches)).toEqual([68, 20, -16]);
    expect(frameLeafShapes(ends.frame, contextOf(ends.project), materials(ends.project)).filter((p) => p.name === 'Leg')).toHaveLength(2);
  });

  it('is not for a torsion box, which takes one leaf', () => {
    const box = table((f, p) => {
      const t = benchTopTable();
      for (const id of torsionMaterialIds(t)) addMaterialFromCatalog(p, profile.materialCatalog, id);
      f.top = { overhang: { front: len('0"'), ends: len('1"'), back: len('0"') }, edge: { kind: 'none' }, torsion: t, leaf: { edge: 'back', length: len('12"'), both: true } };
    });
    expect(() => frameLayout(box.frame, contextOf(box.project), materials(box.project))).toThrow(/A torsion box takes one leaf/);
  });
});

describe("a leaf on a piece's own top", () => {
  const dresser = (leaf: 'left' | 'right' | 'back') => {
    const project = createBaseCabinetProject('frameless');
    for (const id of [PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, profile.materialCatalog, id);
    (project.context as CasesContext).pieces[0]!.top = { own: { ...starterOwnTop(), leaf: { edge: leaf, length: len('10"') } } };
    return project;
  };

  it('on an end: the top is 10" longer there, in two panels, the leaf on two brackets', () => {
    const project = dresser('right');
    const [piece] = topPieces(project, materials(project));
    expect(piece!.leaf).toEqual({ edge: 'right', length: len('10"').mm });
    const parts = deriveTopParts(project, materials(project));
    expect(parts.filter((p) => p.role === 'top').map((p) => p.name).sort()).toEqual(['Leaf: Top', 'Top']);
    // A strip on every edge of the two but the joint's.
    expect(parts.filter((p) => p.role === 'topEdge').map((p) => p.name).sort()).toEqual(
      ['Countertop edge, back', 'Countertop edge, front', 'Countertop edge, left end', 'Leaf: Countertop edge, back', 'Leaf: Countertop edge, front', 'Leaf: Countertop edge, right end'].sort(),
    );
    expect(shownTopParts(project, materials(project), profile.hardware).filter((p) => p.name === 'Swing-out bracket')).toHaveLength(2);
    expect(topWarnings(project, materials(project), L)).toEqual([]);
  });

  it("at the back it is refused where the piece's back is against a wall", () => {
    const project = dresser('back');
    const [piece] = topPieces(project, materials(project));
    expect(piece!.leaf).toBeUndefined();
    expect(leafEdgeClosed(project, piece!, 'back')).toBe('Its back is against a wall.');
    expect(leafEdgeClosed(project, piece!, 'left')).toBeUndefined();
    expect(topWarnings(project, materials(project), L).map((w) => w.text)).toEqual(['No leaf at the back: its back is against a wall.']);
  });
});
