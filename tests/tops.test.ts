// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetParts, partBox, starterTopSettings, topPieces } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createKitchenProject, createShopReferenceProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Milestone 7: a top on a run, derived. */
const shop = createStarterShop();
const contextOf = (p: Project) => p.context as CasesContext;
const inch = (v: number) => Math.round((v / 25.4) * 1000) / 1000 + 0;
/** The shop with its top plywood in 10' sheets: a 97" top is one piece (one longer than the sheet is split). */
const long = { ...shop, materials: shop.materials.map((m) => (m.id === 'plywood-3-4' ? { ...m, sheets: [{ x: len('48"'), y: len('120"') }] } : m)) };

describe('a top on a run', () => {
  it('nothing is covered until a run or cabinet says so', () => {
    expect(topPieces(createKitchenProject(), shop.materials)).toEqual([]);
  });

  it("covers the run's base cabinets: over the filler at a wall end, stopped by a tall cabinet's side", () => {
    const project = createShopReferenceProject();
    const bench = contextOf(project).runs.find((r) => r.name === 'Bench run')!;
    bench.top = {};
    const [piece, ...more] = topPieces(project, shop.materials);
    expect(more).toEqual([]);
    const names = piece!.cabinetIds.map((id) => cabinetsOf(project).find((c) => c.id === id)!.name);
    expect(names).toEqual(['Drawers', 'Drawer over doors', 'Drawers copy']);
    expect(piece!.ends).toEqual({ left: 'wall', right: 'tall' });
    // 6" of filler at the wall end; 24" + 30" + 24" of cabinets to the tall cabinet's side.
    expect([inch(piece!.x0), inch(piece!.x1)]).toEqual([-6, 78]);
    // Back to the wall, 1" over the fronts (inset: flush with the case front).
    expect([inch(piece!.zBack), inch(piece!.zFront), inch(piece!.y)]).toEqual([-22.5, 1, 30]);
  });

  it('past an open end by the open-end overhang', () => {
    const project = createKitchenProject();
    contextOf(project).runs[0]!.top = {};
    const [piece] = topPieces(project, long.materials);
    expect(piece!.ends).toEqual({ left: 'wall', right: 'open' });
    expect([inch(piece!.x0), inch(piece!.x1)]).toEqual([0, 42 + 36 + 18 + 1]);
    // Frameless: over the doors (19 mm and 2 mm of bumpers) by 1".
    expect(piece!.zFront).toBeCloseTo(21 + 25.4, 6);
  });

  it('on a lone cabinet: past its exposed sides', () => {
    const project = createShopReferenceProject();
    const lone = contextOf(project).pieces.find((c) => c.name === 'Doors')!;
    lone.top = {};
    const [piece] = topPieces(project, shop.materials);
    expect(piece!.ends).toEqual({ left: 'open', right: 'open' });
    expect([inch(piece!.x0), inch(piece!.x1)]).toEqual([-1, 25]);
  });

  it('is a part of 3/4" plywood for a top, its grain along the run, standing on the cabinets', () => {
    const project = createKitchenProject();
    contextOf(project).runs[0]!.top = {};
    const top = deriveCabinetParts(project, shop).find((p) => p.role === 'top')!;
    expect(top).toMatchObject({ name: 'Countertop', materialId: 'plywood-3-4', grain: 'width' });
    const box = partBox(top);
    expect(box.min[1]).toBeCloseTo(len('34-1/2"').mm, 6);
    expect(box.max[1] - box.min[1]).toBeCloseTo(top.size.thickness, 6);
  });
});

/** Milestone 7: backsplash, edge and build-up. */
describe('what goes with a top', () => {
  const kitchen = (change?: (s: import('@/model').TopSettings) => void) => {
    const project = createKitchenProject();
    const context = contextOf(project);
    context.runs[0]!.top = {};
    const tops = { ...structuredClone(starterTopSettings()) };
    change?.(tops);
    context.tops = tops;
    project.materials.push(...shop.materials.filter((m) => m.id.startsWith('top-') && !project.materials.some((o) => o.id === m.id)));
    return deriveCabinetParts(project, long).filter((p) => p.role === 'top' || p.role === 'topEdge');
  };
  const box = (parts: import('@/model').Part[], name: string) => partBox(parts.find((p) => p.name === name)!);

  it('the starter: a panel inside a solid wood strip at the front and the open end, a backsplash and a side splash at the wall end', () => {
    const parts = kitchen();
    expect(parts.map((p) => p.name)).toEqual(['Countertop', 'Countertop edge, front', 'Countertop edge, right end', 'Backsplash', 'Side splash, left']);
    const strip = len('3/4"').mm;
    const [top, front] = [box(parts, 'Countertop'), box(parts, 'Countertop edge, front')];
    expect(front.max[2] - top.max[2]).toBeCloseTo(strip, 6);
    expect(box(parts, 'Countertop edge, right end').max[0] - top.max[0]).toBeCloseTo(strip, 6);
    expect(parts.find((p) => p.name === 'Countertop edge, front')!.materialId).toBe('solid-wood-3-4');
    // The splash stands on the top against the wall; the side splash in front of it, against the left wall.
    const splash = box(parts, 'Backsplash');
    expect(splash.min[1]).toBeCloseTo(top.max[1], 6);
    expect(inch(splash.max[1] - splash.min[1])).toBe(4);
    const side = box(parts, 'Side splash, left');
    expect(side.min[0]).toBeCloseTo(top.min[0], 6);
    expect(side.min[2]).toBeCloseTo(splash.max[2], 6);
    // Nothing overlaps: the splashes, the strips and the panel are separate pieces.
    const overlap = (a: ReturnType<typeof partBox>, b: ReturnType<typeof partBox>) => [0, 1, 2].every((k) => Math.min(a.max[k]!, b.max[k]!) - Math.max(a.min[k]!, b.min[k]!) > 0.01);
    const boxes = parts.map(partBox);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
  });

  it('banded instead: the panel is cut smaller by the band, and says so', () => {
    const parts = kitchen((s) => (s.edge = { kind: 'banding', thickness: len('1mm') }));
    expect(parts.map((p) => p.name)).toEqual(['Countertop', 'Backsplash', 'Side splash, left']);
    expect(parts[0]!.banding?.edges).toEqual(['y0', 'x1']);
  });

  it('two layers: the panel stands on strips round its edges and across it', () => {
    const parts = kitchen((s) => {
      s.layers = 2;
      s.backsplash.on = false;
      s.edge.kind = 'none';
    });
    // 97" long: five spaces of at most 24".
    const names = parts.map((p) => p.name);
    expect(names.filter((n) => n.startsWith('Build-up'))).toEqual(['Build-up strip, front', 'Build-up strip, back', 'Build-up strip, left end', 'Build-up strip, across 1', 'Build-up strip, across 2', 'Build-up strip, across 3', 'Build-up strip, across 4', 'Build-up strip, right end']);
    const top = box(parts, 'Countertop');
    expect(top.min[1]).toBeCloseTo(box(parts, 'Build-up strip, front').max[1], 6);
  });
});

/** Milestone 7: tops in Plan, Cut and Build. */
describe('tops in the job', () => {
  const covered = () => {
    const project = createKitchenProject();
    contextOf(project).runs[0]!.top = {};
    project.materials.push(...shop.materials.filter((m) => m.id.startsWith('top-') && !project.materials.some((o) => o.id === m.id)));
    return project;
  };

  it('a top longer than its sheet is split at the cabinet join nearest its middle', () => {
    const pieces = topPieces(covered(), shop.materials);
    // 97" over 42", 36" and 18" cabinets: split between the blind corner and the sink base.
    expect(pieces.map((p) => [p.cabinetIds.length, p.ends.left, p.ends.right])).toEqual([
      [1, 'wall', 'joint'],
      [2, 'joint', 'open'],
    ]);
    expect(pieces.map((p) => inch(p.x1 - p.x0))).toEqual([42, 55]);
  });

  it('is planned, cut and listed: panels on the saw or the CNC, the edge strips as boards', async () => {
    const { buildJob } = await import('@/job/buildJob');
    const { buildLists } = await import('@/job/lists');
    const { buildChecklistSections } = await import('@/job/checklist');
    const { activeMachine } = await import('@/plan');
    const project = covered();
    const job = buildJob(project, shop);
    const tops = job.cabinetParts.filter((p) => p.role === 'top' || p.role === 'topEdge');
    for (const part of tops) expect(job.plan.parts.some((p) => p.partId === part.id), part.name).toBe(true);
    const edge = job.cabinetParts.find((p) => p.role === 'topEdge')!;
    expect(job.plan.parts.find((p) => p.partId === edge.id)!.cutOut).not.toBe('cnc');
    const lists = buildLists(job, project, shop, (mm) => `${inch(mm)}"`);
    expect(lists.hardware.filter((h) => h.group === 'Tops').map((h) => [h.item, h.quantity])).toEqual([
      ['#8 × 1-1/4" wood screws', 12],
      ['Construction adhesive and caulk', undefined],
      ['Wood glue', undefined],
    ]);
    const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop));
    const steps = sections.find((s) => s.title === 'Tops')!.steps.map((s) => s.text.split(/[.:,]/)[0]);
    expect(steps).toEqual(['Glue the solid wood edge strips to the tops\' front and open ends', 'Join the top pieces over their cabinets', 'Set the tops on the cabinets', 'Glue the backsplash down on each top against the wall']);
    expect(sections.find((s) => s.title === 'Tops')!.steps.every((s) => s.phase === 'build')).toBe(true);
  });
});

/** Milestone 7: corners and joints. */
describe('tops at a corner', () => {
  const kitchen = (joint?: 'butt' | 'mitre') => {
    const project = createKitchenProject();
    const runs = contextOf(project).runs;
    runs[0]!.top = {};
    runs[1]!.top = joint ? { cornerJoint: joint } : {};
    project.materials.push(...shop.materials.filter((m) => m.id.startsWith('top-') && !project.materials.some((o) => o.id === m.id)));
    return project;
  };
  const room = async (project: Project, piece: import('@/design').TopPiece, x: number, z: number) => {
    const { cabinetPlaces, inRoom } = await import('@/design');
    const at = cabinetPlaces(project)!.get(piece.cabinetId)!;
    const p = inRoom(at.at, at.turn, [x, 0, z]);
    return [p[0], p[2]];
  };

  it("butt: the left run's top stops at the back run's top's front edge, and takes pocket screws there", async () => {
    const project = kitchen();
    const pieces = topPieces(project, long.materials);
    const [back, left] = [pieces.find((p) => p.runId === contextOf(project).runs[0]!.id)!, pieces.find((p) => p.runId === contextOf(project).runs[1]!.id)!];
    expect(left.ends.right).toBe('joint');
    expect(left.pockets).toEqual(['right']);
    // In the room: the left top's end lies on the back top's front edge.
    const [, endZ] = await room(project, left, left.x1, left.zBack);
    expect(endZ).toBeCloseTo((await room(project, back, back.x1, back.zFront))[1]!, 6);
    const panel = deriveCabinetParts(project, long).find((p) => p.id === left.id)!;
    expect(panel.features.filter((f) => f.kind === 'pocketHole').map((f) => f.kind === 'pocketHole' && f.edge)).toEqual(['x1', 'x1', 'x1', 'x1']);
  });

  it('mitre: both run to the corner of the walls and are cut on the line to the corner of their fronts', async () => {
    const project = kitchen('mitre');
    const pieces = topPieces(project, long.materials);
    const [back, left] = [pieces.find((p) => p.runId === contextOf(project).runs[0]!.id)!, pieces.find((p) => p.runId === contextOf(project).runs[1]!.id)!];
    expect([back.ends.left, left.ends.right]).toEqual(['joint', 'joint']);
    const [backOuter, leftOuter] = [await room(project, back, back.mitre!.from[0], back.mitre!.from[1]), await room(project, left, left.mitre!.from[0], left.mitre!.from[1])];
    // The same line in the room, from the walls' corner at 45°.
    expect(backOuter[0]).toBeCloseTo(0, 6);
    expect(backOuter[1]).toBeCloseTo(0, 6);
    expect(leftOuter[0]).toBeCloseTo(0, 6);
    const inner = await room(project, back, back.mitre!.to[0], back.mitre!.to[1]);
    expect(inner[0]!).toBeCloseTo(inner[1]! + (left.zFront - back.zFront), 6);
    const panel = deriveCabinetParts(project, long).find((p) => p.id === back.id)!;
    expect(panel.shaped).toBe(true);
    const cut = panel.features.find((f) => f.kind === 'cutout');
    expect(cut?.kind === 'cutout' && cut.outline).toHaveLength(4);
  });
});

/** Milestone 7: bought laminate tops. */
describe('a bought laminate top', () => {
  const bought = async (kind: 'bought' | 'measured', boughtTopId = 'laminate-top-splash') => {
    const { buildJob } = await import('@/job/buildJob');
    const { buildLists } = await import('@/job/lists');
    const project = createKitchenProject();
    const context = contextOf(project);
    context.runs[0]!.top = {};
    context.runs[1]!.top = {};
    context.tops = { ...starterTopSettings(), kind, boughtTopId };
    const job = buildJob(project, shop);
    return { job, lists: buildLists(job, project, shop, (mm) => `${inch(mm)}"`) };
  };

  it('is not cut here: the stock length that covers each piece is bought and cut to length, mitred at the corner', async () => {
    const { job, lists } = await bought('bought');
    expect(job.cabinetParts.some((p) => p.role === 'top' || p.role === 'topEdge')).toBe(false);
    const tops = lists.buying.filter((b) => b.material.startsWith('Laminate'));
    // The back run's top, 97": a 10' length; the left run's, mitred into the corner, about 64": a 6' one.
    expect(tops.map((b) => inch(b.size!.width))).toEqual([120, 72]);
    expect(tops[0]!.note.split(',')[0]).toBe('Cut to 97"');
    expect(tops.every((b) => /a mitre at its (left|right) end/.test(b.note))).toBe(true);
    expect(lists.hardware.filter((h) => h.group === 'Tops').map((h) => [h.item, h.quantity])).toEqual([
      ['#8 × 1-1/4" wood screws', 20],
      // The two open ends (the corner is a mitre, not a wall end).
      ['End caps for laminate countertop, 4" backsplash', 2],
      ['Countertop connector bolts', 3],
    ]);
  });

  it('a measured top is an order with its size, nothing cut', async () => {
    const { job, lists } = await bought('measured');
    expect(job.cabinetParts.some((p) => p.role === 'top')).toBe(false);
    const orders = lists.buying.filter((b) => b.material === 'Countertop, to order');
    expect(orders).toHaveLength(2);
    expect(orders[0]!.note).toMatch(/^Measured: [\d.]+" long × [\d.]+" deep/);
  });
});
