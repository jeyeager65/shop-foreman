// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SINK_RIM, cabinetsOf, sinkProblems, isApplianceShape, shownTopParts, sinkCuts, sinkShapes, starterTopSettings, topPieces } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildChecklistSections } from '@/job/checklist';
import { buildJob } from '@/job/buildJob';
import { SOLID_WOOD_3_4_ID } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject, createHomeKitchenProject, createShopTableProject } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A sink: its cabinet's, set in the top over it, its opening a real cut-out. */
const shop = lowRiderJobShop();
const inch = (mm: number) => Math.round((mm / 25.4) * 100) / 100;

/** A 36" base cabinet against the back wall under a top made here, a 24" × 16" sink in it; oom: in a room or not. */
function sinkCabinet(room = true): Project {
  const project = createBaseCabinetProject('frameless', 'doors');
  const context = project.context as CasesContext;
  if (room) context.room = { length: len('120"'), width: len('120"'), ceiling: len('96"') };
  const stored = context.pieces[0]!;
  stored.size.width = len('36"');
  if (room) stored.placement = { wall: 'back', along: len('12"') };
  stored.top = {};
  context.tops = starterTopSettings();
  expect(project.materials.some((m) => m.id === SOLID_WOOD_3_4_ID)).toBe(true);
  project.plan.blank.stock = { width: len('48"'), height: len('48"') };
  stored.sink = { mount: 'dropIn', width: len('24"'), depth: len('16"'), bowlDepth: len('8"'), shape: 'rectangle' };
  return project;
}

describe('a sink in a top made here', () => {
  const project = sinkCabinet();
  const job = buildJob(project, shop);
  const panel = job.cabinetParts.find((p) => p.name === 'Countertop')!;
  const opening = panel.features.find((f) => f.kind === 'cutout' && f.inside);

  it('is an opening through the top\'s panel: the rim less its lap each side, centred front to back', () => {
    expect(opening?.kind).toBe('cutout');
    if (opening?.kind !== 'cutout') return;
    const xs = opening.outline.map((q) => q.x);
    const ys = opening.outline.map((q) => q.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(len('24"').mm - 2 * SINK_RIM, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(len('16"').mm - 2 * SINK_RIM, 6);
    // Centred front to back on the top, the edge strip counted.
    const [cut] = sinkCuts(project, topPieces(project, project.materials));
    expect((cut!.zBack + cut!.zFront) / 2).toBeCloseTo((cut!.piece.zBack + cut!.piece.zFront) / 2, 6);
    // The panel's own outline is still its first cutout: the whole rectangle.
    const outline = panel.features.find((f) => f.kind === 'cutout');
    expect(outline?.kind === 'cutout' && !outline.inside).toBe(true);
  });

  it('is cut on the CNC with the top, in a file that parses', async () => {
    expect(job.plan.blanks.filter((b) => b.partIds.includes(panel.id))).toHaveLength(1);
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    expect(planned.has(`${panel.id}:${opening!.id}`)).toBe(true);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });

  it('cuts the opening inside its line: the bit\'s centre a radius in from it, never outside', () => {
    const blank = job.plan.blanks.find((b) => b.partIds.includes(panel.id))!;
    const program = job.programs.find((p) => p.blank.id === blank.id)!;
    const text = job.files.find((f) => f.name === program.fileName)!.text;
    // Every point the bit cuts at, below the surface.
    const at = { x: 0, y: 0, z: 10 };
    const cuts: { x: number; y: number }[] = [];
    for (const line of text.split('\n')) {
      if (!/^G[01]\b/.test(line)) continue;
      for (const [, axis, value] of line.matchAll(/([XYZ])(-?\d+(?:\.\d+)?)/g)) at[axis!.toLowerCase() as 'x' | 'y' | 'z'] = Number(value);
      if (at.z < -1) cuts.push({ x: at.x, y: at.y });
    }
    const box = (pts: { x: number; y: number }[]) => ({ w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)), x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)) });
    const outer = box(cuts);
    // The cuts well inside the panel's own outline are the opening's.
    const inside = cuts.filter((p) => p.x > outer.x0 + 50 && p.x < outer.x0 + outer.w - 50 && p.y > outer.y0 + 50 && p.y < outer.y0 + outer.h - 50);
    expect(inside.length).toBeGreaterThan(8);
    const loop = box(inside);
    const [long, short] = [Math.max(loop.w, loop.h), Math.min(loop.w, loop.h)];
    const bit = 6.35;
    expect(long).toBeCloseTo(len('24"').mm - 2 * SINK_RIM - bit, 1);
    expect(short).toBeCloseTo(len('16"').mm - 2 * SINK_RIM - bit, 1);
  });

  it('tells the builder the CNC cuts it, and to set the sink', () => {
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith('The CNC cuts the opening for the sink (23-3/8" × 15-3/8")'))).toBe(true);
    expect(steps.some((s) => s.startsWith('Set the sink in a bead of sealant'))).toBe(true);
  });

  it('draws the basin in the opening, never as a part of the job', () => {
    const [basin] = sinkShapes(project, project.materials, shop.hardware);
    expect(isApplianceShape(basin!.id)).toBe(true);
    expect(inch(basin!.size.thickness)).toBe(8);
    expect([...job.cabinetParts, ...job.parts].some((p) => isApplianceShape(p.id))).toBe(false);
  });

  it('has no opening when no top lies under it', () => {
    const bare = sinkCabinet();
    delete (bare.context as CasesContext).pieces[0]!.top;
    expect(sinkCuts(bare, topPieces(bare, bare.materials))).toEqual([]);
    expect(sinkProblems(bare, cabinetsOf(bare)[0]!, bare.materials, String)[0]).toMatch(/No top lies over this cabinet/);
    expect(buildJob(bare, shop).cabinetParts.some((p) => p.features.some((f) => f.kind === 'cutout' && f.inside))).toBe(false);
  });
});

describe('a sink with no room', () => {
  it('is cut in its cabinet\'s own top just the same, centred on the cabinet', () => {
    const project = sinkCabinet(false);
    const [cut] = sinkCuts(project, topPieces(project, project.materials));
    expect(inch(cut!.x1 - cut!.x0)).toBeCloseTo(24 - (2 * SINK_RIM) / 25.4, 2);
    expect(inch((cut!.x0 + cut!.x1) / 2)).toBe(18);
    const job = buildJob(project, shop);
    expect(job.cabinetParts.find((p) => p.name === 'Countertop')!.features.some((f) => f.kind === 'cutout' && f.inside)).toBe(true);
    expect(sinkShapes(project, project.materials, shop.hardware)).toHaveLength(1);
    expect(sinkProblems(project, cabinetsOf(project)[0]!, project.materials, String)).toEqual([]);
  });

  it('moves with its offset, and says when its bowl is wider than the case', () => {
    const project = sinkCabinet(false);
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.sink!.offset = len('3"');
    const [cut] = sinkCuts(project, topPieces(project, project.materials));
    expect(inch((cut!.x0 + cut!.x1) / 2)).toBe(21);
    stored.sink!.width = len('36"');
    expect(sinkProblems(project, cabinetsOf(project)[0]!, project.materials, String).some((w) => /does not fit between the case sides/.test(w))).toBe(true);
  });
});

describe('a project with no sink', () => {
  it('draws no basin: the shop table, whose top is a torsion table', () => {
    const project = createShopTableProject();
    expect(sinkShapes(project, project.materials, shop.hardware)).toEqual([]);
    expect(shownTopParts(project, project.materials, shop.hardware)).toEqual([]);
  });
});

describe('the home kitchen\'s sink, in a bought top', () => {
  const project = createHomeKitchenProject();

  it('is over the sink base, in the window wall\'s top, which is drawn with its opening', () => {
    const pieces = topPieces(project, project.materials);
    const [cut] = sinkCuts(project, pieces);
    const sinkBase = cabinetsOf(project).find((c) => c.name === 'Sink base')!;
    expect(cut!.piece.cabinetIds).toContain(sinkBase.id);
    expect(inch(cut!.x1 - cut!.x0)).toBeCloseTo(33 - (2 * SINK_RIM) / 25.4, 1);
    // Centred on the 36" sink base, which starts 18" along the run.
    expect(inch((cut!.x0 + cut!.x1) / 2)).toBe(36);
    const slab = shownTopParts(project, project.materials, shop.hardware).find((p) => p.id === `${cut!.piece.id}-shown`)!;
    expect(slab.features.filter((f) => f.kind === 'cutout' && f.inside)).toHaveLength(1);
  });

  it('is cut by hand: the checklist says how big', () => {
    const job = buildJob(project, shop);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith('Cut the opening for the sink by hand: 32-3/8" × 21-3/8"'))).toBe(true);
  });
});
