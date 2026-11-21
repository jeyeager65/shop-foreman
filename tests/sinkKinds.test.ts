// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FAUCET_SPREAD, SINK, cabinetsOf, faucetSpread, sinkCuts, sinkLook, sinkOfKind, sinkProblems, sinkShapes, starterTopSettings, topPieces } from '@/design';
import { buildChecklistSections } from '@/job/checklist';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { BUTCHER_BLOCK_ID, TOP_MATERIALS, createStarterShop } from '@/libraries';
import type { CabinetSink, CasesContext, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { starterById } from '@/samples/starters';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** The kinds of sink: drop-in, undermount, vessel and a bought top with its sink in it; one bowl or two. */
const shop = lowRiderJobShop();
const inch = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const words = (mm: number) => `${inch(mm)}"`;

/** A 36" frameless base cabinet with a top of its own made here, and a sink. No room. */
function withSink(sink: Partial<CabinetSink> & Pick<CabinetSink, 'mount'>, top = true): Project {
  const project = createBaseCabinetProject('frameless', 'doors');
  const context = project.context as CasesContext;
  const stored = context.pieces[0]!;
  stored.size.width = len('36"');
  if (top) stored.top = {};
  context.tops = starterTopSettings();
  stored.sink = { ...sinkOfKind(stored, sink.mount), ...sink };
  project.plan.blank.stock = { width: len('48"'), height: len('48"') };
  return project;
}
const cut = (project: Project) => sinkCuts(project, topPieces(project, project.materials))[0];
const problems = (project: Project) => sinkProblems(project, cabinetsOf(project)[0]!, project.materials, words);

describe('an undermount sink', () => {
  it('has its opening inside its flange, and two bowls have one each, the top running over the divider', () => {
    const one = cut(withSink({ mount: 'undermount', width: len('30"'), depth: len('18"'), shape: 'rectangle' }))!;
    expect(one.outlines).toHaveLength(1);
    expect(one.x1 - one.x0).toBeCloseTo(len('30"').mm - 2 * SINK.flange, 6);
    const two = cut(withSink({ mount: 'undermount', width: len('30"'), depth: len('18"'), shape: 'rectangle', double: { leftShare: 0.6 } }))!;
    expect(two.outlines).toHaveLength(2);
    const [a, b] = two.outlines.map((loop) => Math.max(...loop.map((p) => p[0])) - Math.min(...loop.map((p) => p[0])));
    expect(a!).toBeGreaterThan(b!);
    // The divider's top stays: the gap between the two openings.
    const gap = Math.min(...two.outlines[1]!.map((p) => p[0])) - Math.max(...two.outlines[0]!.map((p) => p[0]));
    expect(gap).toBeCloseTo(SINK.divider, 6);
    const panel = buildJob(withSink({ mount: 'undermount', double: { leftShare: 0.5 } }), shop).cabinetParts.find((p) => p.name === 'Countertop')!;
    expect(panel.features.filter((f) => f.kind === 'cutout' && f.inside)).toHaveLength(2);
  });

  it('warns on a plywood top, whose edge shows, and not on a solid wood one', () => {
    expect(problems(withSink({ mount: 'undermount' })).some((w) => /cut edge showing/.test(w))).toBe(true);
    const solid = withSink({ mount: 'undermount' });
    if (!solid.materials.some((m) => m.id === BUTCHER_BLOCK_ID)) solid.materials.push(TOP_MATERIALS.find((m) => m.id === BUTCHER_BLOCK_ID)!);
    (solid.context as CasesContext).tops = { ...starterTopSettings(), materialId: BUTCHER_BLOCK_ID } as never;
    expect(solid.materials.some((m) => m.id === BUTCHER_BLOCK_ID)).toBe(true);
    expect(problems(solid).some((w) => /cut edge showing/.test(w))).toBe(false);
  });

  it('is fixed under the top before the top goes on', () => {
    const project = withSink({ mount: 'undermount' });
    const job = buildJob(project, shop);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith('Before the top goes on: turn it over, set the sink under its opening'))).toBe(true);
  });
});

describe('a vessel sink', () => {
  it('needs only its drain hole through the top, and stands on it', () => {
    const project = withSink({ mount: 'vessel' });
    const c = cut(project)!;
    expect(c.x1 - c.x0).toBeCloseTo(SINK.drain, 1);
    const [basin] = sinkShapes(project, project.materials, shop.hardware);
    // On the top: its underside above the top's surface.
    const piece = topPieces(project, project.materials)[0]!;
    expect(basin!.placement!.origin[1] - basin!.size.thickness).toBeGreaterThan(piece.y);
  });
});

describe('a bought top with its sink in it', () => {
  it('is the whole top: no top is cut, it is drawn and bought, and the checklist sets it', () => {
    const project = withSink({ mount: 'integrated' }, false);
    expect(topPieces(project, project.materials)).toEqual([]);
    expect(problems(project)).toEqual([]);
    const shapes = sinkShapes(project, project.materials, shop.hardware);
    expect(shapes.map((p) => p.name)).toEqual(['Vanity top, with its sink (bought)', 'Sink']);
    const job = buildJob(project, shop);
    expect(job.cabinetParts.some((p) => /Countertop/.test(p.name))).toBe(false);
    const lists = buildLists(job, project, shop, words);
    expect(lists.buying.find((b) => b.material === 'Vanity top with its sink in it')).toMatchObject({ quantity: 1 });
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith('Set the vanity top with its sink on'))).toBe(true);
  });

  it('says so when another top lies over the cabinet too', () => {
    expect(problems(withSink({ mount: 'integrated' }))[0]).toMatch(/another top lies over it too/);
  });

  it('is what the vanity starter has', () => {
    const project = starterById('vanity')!.project?.() ?? createBaseCabinetProject();
    const starter = starterById('vanity')!;
    starter.shape?.(project, cabinetsOf(project)[0]!, createStarterShop() as never);
    expect(cabinetsOf(project)[0]!.sink?.mount).toBe('integrated');
  });
});

describe('a drop-in sink', () => {
  it('is one opening for two bowls, and goes on the buying list', () => {
    const project = withSink({ mount: 'dropIn', double: { leftShare: 0.5 } });
    expect(cut(project)!.outlines).toHaveLength(1);
    const lists = buildLists(buildJob(project, shop), project, shop, words);
    expect(lists.buying.some((b) => /^Drop-in sink, .*two bowls$/.test(b.material))).toBe(true);
  });
});

describe('a sink as the 3D view draws it', () => {
  it('has its bowls, a drop-in its rim, an undermount hung under the top, a vessel on it', () => {
    const drop = sinkLook({ mount: 'dropIn', width: len('33"'), depth: len('22"'), bowlDepth: len('9"'), shape: 'rectangle', double: { leftShare: 0.5 } }, 19);
    expect(drop).toMatchObject({ colour: 'steel', rim: { width: len('33"').mm, depth: len('22"').mm } });
    expect(drop.bowls).toHaveLength(2);
    expect(drop.bowls[0]!.width).toBeCloseTo(drop.bowls[1]!.width, 6);
    const under = sinkLook({ mount: 'undermount', width: len('19"'), depth: len('16"'), bowlDepth: len('6"'), shape: 'oval' }, 30);
    expect(under).toMatchObject({ colour: 'white' });
    expect(under.rim).toBeUndefined();
    expect(under.bowls[0]!.top).toBeCloseTo(len('6"').mm - 30, 6);
    expect(sinkLook(sinkOfKind({ size: { width: len('30"'), height: len('34"'), depth: len('21"') } }, 'vessel'), 19).vessel).toBe(true);
  });

  it('is carried by the part that stands for the sink', () => {
    const project = withSink({ mount: 'dropIn' });
    const [basin] = sinkShapes(project, project.materials, shop.hardware);
    expect(basin!.sinkLook?.bowls).toHaveLength(1);
    expect(basin!.size.width).toBeCloseTo(cabinetsOf(project)[0]!.sink!.width.mm, 6);
  });
});

describe('faucet holes', () => {
  it('are cut through a top made here behind an undermount sink: one, or three a kitchen\'s 8" apart', () => {
    const three = cut(withSink({ mount: 'undermount', faucet: { holes: 3 } }))!;
    expect(three.holes).toHaveLength(3);
    const xs = three.holes.map((loop) => (Math.min(...loop.map((p) => p[0])) + Math.max(...loop.map((p) => p[0]))) / 2);
    expect(xs[2]! - xs[0]!).toBeCloseTo(FAUCET_SPREAD.kitchen, 6);
    // Behind the sink: every hole's front edge behind its back edge.
    const sinkBack = three.cz - cabinetsOf(withSink({ mount: 'undermount' }))[0]!.sink!.depth.mm / 2;
    for (const loop of three.holes) expect(Math.max(...loop.map((p) => p[1]))).toBeLessThan(sinkBack);
    const one = cut(withSink({ mount: 'undermount', faucet: { holes: 1 } }))!;
    expect(one.holes).toHaveLength(1);
    const across = Math.max(...one.holes[0]!.map((p) => p[0])) - Math.min(...one.holes[0]!.map((p) => p[0]));
    expect(across).toBeCloseTo(SINK.faucetHole, 1);
    const panel = buildJob(withSink({ mount: 'undermount', faucet: { holes: 3 } }), shop).cabinetParts.find((p) => p.name === 'Countertop')!;
    expect(panel.features.filter((f) => f.id.startsWith('faucet-'))).toHaveLength(3);
  });

  it('are none in the top for a drop-in, whose deck has them; the faucet is bought either way', () => {
    const project = withSink({ mount: 'dropIn', faucet: { holes: 3 } });
    expect(cut(project)!.holes).toEqual([]);
    const lists = buildLists(buildJob(project, shop), project, shop, words);
    expect(lists.buying.find((b) => b.material.startsWith('Faucet, three holes'))?.note).toMatch(/on the sink's own deck/);
  });

  it('a vanity\'s three are 4" apart, and the checklist says to cut them', () => {
    const project = withSink({ mount: 'vessel', faucet: { holes: 3 } });
    expect(faucetSpread(cabinetsOf(project)[0]!.sink!)).toBeCloseTo(FAUCET_SPREAD.vanity, 6);
    const job = buildJob(project, shop);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => /faucet holes/.test(s))).toBe(true);
  });
});

describe('a sink with its faucet holes in the top', () => {
  it('sits forward enough on a vanity to leave an inch of top behind the holes', () => {
    const project = withSink({ mount: 'undermount', faucet: { holes: 3 } });
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.size.depth = len('21"');
    stored.sink = { ...stored.sink!, width: len('19"'), depth: len('16"'), shape: 'oval' };
    expect(problems(project).some((w) => /faucet holes/.test(w))).toBe(false);
    const c = cut(project)!;
    expect(Math.min(...c.holes.flat().map((p) => p[1])) - c.piece.zBack).toBeGreaterThanOrEqual(len('1"').mm - 0.5);
  });
});

describe('a top with a sink opening, drawn', () => {
  it('keeps its solid round a round opening, however its outline runs', async () => {
    const { buildPartMeshes } = await import('@/geometry/solids');
    const project = withSink({ mount: 'integrated' }, false);
    const shapes = sinkShapes(project, project.materials, shop.hardware);
    const meshes = await buildPartMeshes(shapes);
    for (const m of meshes) expect(m.mesh.positions.length, m.partId).toBeGreaterThan(0);
    const undermount = withSink({ mount: 'undermount', shape: 'oval' });
    const panel = buildJob(undermount, shop).cabinetParts.find((p) => p.name === 'Countertop')!;
    const [made] = await buildPartMeshes([panel]);
    expect(made!.mesh.positions.length).toBeGreaterThan(24);
  });
});
