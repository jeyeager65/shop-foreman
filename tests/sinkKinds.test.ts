// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SINK, cabinetsOf, sinkCuts, sinkOfKind, sinkProblems, sinkShapes, starterTopSettings, topPieces } from '@/design';
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
