// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deriveCabinetParts, lightTopTable, partBox, ribLines, skinPieces, slottedRib, topPieces, torsionThickness } from '@/design';
import { outlineInsideCorners } from '@/cam/cuts';
import type { CasesContext, Project } from '@/model';
import { createIslandProject } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** Milestone 8: the torsion table, derived. */
const shop = lowRiderJobShop();
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;

function table(size?: { length: string; width: string }): Project {
  const project = createIslandProject();
  const context = project.context as CasesContext;
  context.islands![0]!.top = { settings: { kind: 'torsion', torsion: lightTopTable() }, ...(size ? { size: { length: len(size.length), width: len(size.width) } } : {}) };
  project.materials.push(...shop.materials.filter((m) => m.id === 'mdf-1-4'));
  return project;
}

describe('the rib grid', () => {
  it('a frame round the edge, the cells between equal and about the spacing', () => {
    const lines = ribLines(len('48"').mm, 18, len('6"').mm);
    expect(lines[0]).toBe(0);
    expect(lines.at(-1)).toBeCloseTo(len('48"').mm - 18, 6);
    const cells = lines.slice(1).map((l, i) => l - lines[i]!);
    expect(new Set(cells.map((c) => c.toFixed(6))).size).toBe(1);
    expect(inch(cells[0]!)).toBeCloseTo(6, 0);
  });

  it("a skin longer than its sheet is in pieces, joined on a rib's middle; the top skin's joints a cell away", () => {
    const ribs = ribLines(len('120"').mm, 18, len('6"').mm);
    const bottom = skinPieces(len('120"').mm, len('96"').mm, ribs, 18);
    const top = skinPieces(len('120"').mm, len('96"').mm, ribs, 18, true);
    expect(bottom).toHaveLength(2);
    expect(top).toHaveLength(2);
    const middles = ribs.map((r) => r + 9);
    expect(middles.some((m) => Math.abs(m - bottom[0]![1]) < 1e-6)).toBe(true);
    expect(middles.some((m) => Math.abs(m - top[0]![1]) < 1e-6)).toBe(true);
    expect(top[0]![1]).toBeLessThan(bottom[0]![1]);
    expect(bottom.every(([a, b]) => b - a <= len('96"').mm + 0.5)).toBe(true);
  });
});

describe('a torsion table on the island', () => {
  it("the cabinets' footprint and 2\" all round, or the size typed, centred on the cabinets", () => {
    const [own] = topPieces(table(), shop.materials);
    expect(inch(own!.x1 - own!.x0)).toBe(78 + 4);
    expect(inch(own!.zFront - own!.zBack)).toBe(45 + 4);
    const [typed] = topPieces(table({ length: '96"', width: '60"' }), shop.materials);
    expect(inch(typed!.x1 - typed!.x0)).toBe(96);
    expect(inch(typed!.zFront - typed!.zBack)).toBe(60);
    expect((typed!.x0 + typed!.x1) / 2).toBeCloseTo((own!.x0 + own!.x1) / 2, 6);
  });

  it('the light top: 1/4" MDF skins, 3/4" plywood ribs 3-1/2" tall, no spoilboard', () => {
    const project = table({ length: '96"', width: '60"' });
    const parts = deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'rib');
    const names = parts.map((p) => p.name);
    // 60" is wider than a 48" sheet: each skin in two, joined on a long rib.
    expect(names.filter((n) => n.startsWith('Bottom skin'))).toEqual(['Bottom skin 1', 'Bottom skin 2']);
    expect(names.filter((n) => n.startsWith('Top skin'))).toEqual(['Top skin 1', 'Top skin 2']);
    expect(names.some((n) => /spoilboard/i.test(n))).toBe(false);
    expect(names).toContain('Rib, front');
    expect(names).toContain('Rib, left end');
    const ribs = parts.filter((p) => p.role === 'rib');
    expect(ribs.every((r) => r.materialId === 'plywood-3-4' && inch(r.size.height) === 3.5)).toBe(true);
    // Stacked: bottom skin, the ribs, the top skin, on the cabinets.
    const box = (name: string) => partBox(parts.find((p) => p.name === name)!);
    expect(box('Bottom skin 1').min[1]).toBeCloseTo(len('30"').mm, 6);
    expect(box('Rib, front').min[1]).toBeCloseTo(box('Bottom skin 1').max[1], 6);
    expect(box('Top skin 1').min[1]).toBeCloseTo(box('Rib, front').max[1], 6);
    expect(box('Top skin 1').max[1] - box('Bottom skin 1').min[1]).toBeCloseTo(torsionThickness(lightTopTable(), shop.materials), 6);
  });
});

/** Milestone 8: egg-crate ribs on the CNC, and saw-cut ribs. */
describe('the ribs', () => {
  it('a slotted rib: a slot the crossing rib\'s thickness and its clearance, half the rib deep, its inside corners dog-boned', () => {
    const outline = slottedRib(1000, 89, [[100, 118.2]], 'top');
    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 89 },
      { x: 118.2, y: 89 },
      { x: 118.2, y: 44.5 },
      { x: 100, y: 44.5 },
      { x: 100, y: 89 },
      { x: 0, y: 89 },
    ]);
    // The toolpath dog-bones the slot's two inside corners, out into the slot (up, and toward its middle).
    expect(outlineInsideCorners(outline)).toEqual([
      { corner: { x: 118.2, y: 44.5 }, inward: { x: -1, y: 1 } },
      { corner: { x: 100, y: 44.5 }, inward: { x: 1, y: 1 } },
    ]);
    // At an end the slot runs out through it; from the bottom it is the mirror.
    const end = slottedRib(1000, 89, [[-0.1, 18.1]], 'bottom');
    expect(end[0]).toEqual({ x: 0, y: 89 });
    expect(end[1]).toEqual({ x: 0, y: 44.5 });
  });

  it('egg-crate: every long rib slotted at every short rib, and the other way; the CNC only, long ones tiled', async () => {
    const { buildJob } = await import('@/job/buildJob');
    const project = table({ length: '84"', width: '60"' });
    // An 84" rib wants a full sheet on hand.
    project.plan.blank.stock = { width: len('48"'), height: len('96"') };
    const job = buildJob(project, shop);
    const ribs = job.cabinetParts.filter((p) => p.role === 'rib');
    const short = ribs.filter((p) => p.id.includes('-rib-short-'));
    const long = ribs.filter((p) => p.id.includes('-rib-long-'));
    const slots = (p: (typeof ribs)[number]) => {
      const cut = p.features.find((f) => f.kind === 'cutout');
      return cut?.kind === 'cutout' ? cut.outline.filter((q) => Math.abs(q.y - p.size.height / 2) < 1e-6).length / 2 : 0;
    };
    expect(long.every((r) => slots(r) === short.length)).toBe(true);
    expect(short.every((r) => slots(r) === long.length)).toBe(true);
    for (const rib of ribs) expect(job.plan.parts.find((p) => p.partId === rib.id)!.options, rib.name).toEqual(['cnc']);
    expect(ribs.every((r) => r.features.some((f) => f.kind === 'cutout' && f.dogBones))).toBe(true);
    // An 84" rib is longer than the LowRider 3 cuts in one set-up (72"): tiled.
    const front = job.plan.blanks.find((b) => b.partIds.includes(long[0]!.id))!;
    expect(front.setups.some((s) => s.tile)).toBe(true);
  });

  it('sawn: the long ribs whole, the short ones cut to fit between them, plain rectangles for the saw', () => {
    const project = table({ length: '96"', width: '60"' });
    (project.context as CasesContext).islands![0]!.top!.settings!.torsion!.ribsBy = 'saw';
    const ribs = deriveCabinetParts(project, shop).filter((p) => p.role === 'rib');
    const long = ribs.filter((p) => p.id.includes('-rib-long-'));
    const pieces = ribs.filter((p) => p.id.includes('-rib-short-'));
    const cells = long.length - 1;
    const lines = ribLines(len('96"').mm, 18.26, len('6"').mm).length;
    expect(pieces).toHaveLength(lines * cells);
    expect(pieces.every((p) => p.features.find((f) => f.kind === 'cutout')!.kind === 'cutout')).toBe(true);
    expect(pieces[0]!.name).toBe('Rib, left end, piece 1');
  });
});

/** Milestone 8: build, lists and 3D. */
describe('building a light torsion table', () => {
  it('lists glue and brads for a 1/4" skin; the checklist slots the ribs and builds it flat', async () => {
    const { buildJob } = await import('@/job/buildJob');
    const { buildLists } = await import('@/job/lists');
    const { buildChecklistSections } = await import('@/job/checklist');
    const { activeMachine } = await import('@/plan');
    const { createShopTableProject } = await import('@/samples/cabinet');
    const project = createShopTableProject();
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, (mm) => `${inch(mm)}"`);
    const table = lists.hardware.filter((h) => h.group === 'Torsion table');
    // 1/4" is thicker than 1/8": brads go in.
    expect(table.map((h) => h.item)).toEqual(['Wood glue', '18 ga brad nails, 1-1/4"']);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text.split(/[,.:]/)[0]);
    expect(steps.slice(0, 2)).toEqual(['Slot the ribs together into the egg-crate', 'On a flat surface']);
    expect(steps.some((s) => /spoilboard/i.test(s ?? ''))).toBe(false);
  });
});
