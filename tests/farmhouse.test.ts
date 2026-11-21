// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FARMHOUSE_FRAME, apronFace, cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, sinkCuts, sinkOfKind, sinkProblems, sinkShapes, starterTopSettings, topPieces } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildChecklistSections } from '@/job/checklist';
import { buildJob } from '@/job/buildJob';
import type { CasesContext, ConstructionStyle, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A farmhouse (apron-front) sink: its apron in the top row's place, a platform under it, the top notched round it. */
const shop = lowRiderJobShop();
const words = (mm: number) => `${Math.round((mm / 25.4) * 100) / 100}"`;

function farmhouse(construction: ConstructionStyle = 'faceFrame', layout: 'drawerOverDoors' | 'doors' = 'drawerOverDoors'): Project {
  const project = createBaseCabinetProject(construction, layout);
  const context = project.context as CasesContext;
  const stored = context.pieces[0]!;
  stored.size.width = len('36"');
  stored.top = {};
  context.tops = starterTopSettings();
  stored.sink = sinkOfKind(stored, 'farmhouse');
  project.plan.blank.stock = { width: len('48"'), height: len('48"') };
  return project;
}
const cabinet = (p: Project) => cabinetsOf(p)[0]!;

describe('a farmhouse sink', () => {
  for (const construction of ['faceFrame', 'frameless'] as const) {
    it(`${construction}: takes the top row's place, with nothing hung there, and the row reaches down to where the sink stands`, () => {
      const p = farmhouse(construction);
      const [apron] = deriveCabinetOpenings(cabinet(p), shop.materials);
      expect(apron).toMatchObject({ use: 'drawer', apron: true });
      const ids = new Set(p.designObjects.filter((d) => d.mounting.openingId === apron!.id).map((d) => d.id));
      expect(deriveParts(p, shop).some((part) => ids.has(part.designObjectId))).toBe(false);
      expect(deriveDrawerBoxParts(p, shop).some((part) => ids.has(part.designObjectId))).toBe(false);
      // The sink stands on its platform, the platform's top at the row's bottom.
      const platform = deriveCabinetParts(p, shop).find((part) => part.name === 'Sink platform')!;
      expect(platform.placement!.origin[1]).toBeCloseTo(apron!.origin.y, 0);
    });

    it(`${construction}: leaves out the front stretcher and the top rail, and what was cut in the sides for them`, () => {
      const parts = deriveCabinetParts(farmhouse(construction), shop);
      const id = cabinet(farmhouse(construction)).id;
      expect(parts.some((part) => part.id === `${id}/stretcher-front` || part.id === `${id}/frame-rail-top`)).toBe(false);
      expect(parts.some((part) => part.features.some((f) => /(^|[-/])stretcher-front/.test(f.id) && !/bottom-stretcher/.test(f.id)))).toBe(false);
      // Its platform on two cleats, and a rail under its front and back: the case is wider than 30" inside.
      expect(parts.filter((part) => part.id.includes('/farmhouse-')).map((part) => part.name).sort()).toEqual(['Sink platform', 'Sink platform cleat, left', 'Sink platform cleat, right', 'Sink platform rail, back', 'Sink platform rail, front']);
    });
  }

  it('has a drain hole in its platform under each bowl', () => {
    const p = farmhouse();
    (p.context as CasesContext).pieces[0]!.sink!.double = { leftShare: 0.5 };
    const platform = deriveCabinetParts(p, shop).find((part) => part.name === 'Sink platform')!;
    expect(platform.features.filter((f) => f.id.startsWith('drain-'))).toHaveLength(2);
  });

  it('notches the top round it from its front edge, the front strip either side, and no opening cut in it', () => {
    const p = farmhouse();
    const [cut] = sinkCuts(p, topPieces(p, p.materials));
    expect(cut!.outlines).toEqual([]);
    expect(cut!.notch!.x1 - cut!.notch!.x0).toBeCloseTo(cabinet(p).sink!.width.mm, 6);
    const job = buildJob(p, shop);
    const panel = job.cabinetParts.find((part) => part.name === 'Countertop')!;
    const outline = panel.features.find((f) => f.kind === 'cutout');
    expect(outline?.kind === 'cutout' && outline.outline.length).toBe(8);
    expect(panel.features.some((f) => f.kind === 'cutout' && f.inside)).toBe(false);
    expect(job.cabinetParts.filter((part) => part.name.startsWith('Countertop edge, front')).map((part) => part.name)).toEqual(['Countertop edge, front, left of the sink', 'Countertop edge, front, right of the sink']);
  });

  it('stands its apron in front of the doors by its own amount, and is drawn with it', () => {
    const p = farmhouse();
    const [cut] = sinkCuts(p, topPieces(p, p.materials));
    const face = cut!.cz + cabinet(p).sink!.depth.mm / 2;
    // (Within a millimetre: the doors' own thickness against the case material's.)
    expect(Math.abs(face - apronFace(cabinet(p), p.materials))).toBeLessThan(1);
    const [basin] = sinkShapes(p, p.materials, shop.hardware);
    expect(basin!.sinkLook?.apron?.height).toBeCloseTo(cabinet(p).sink!.apron!.height.mm, 6);
  });

  it('says so on a cabinet with no drawer row over its doors', () => {
    const stands = (p: Project) => sinkProblems(p, cabinet(p), shop.materials, words).some((w) => /farmhouse sink stands in the top row/.test(w));
    expect(stands(farmhouse('faceFrame', 'doors'))).toBe(true);
    expect(stands(farmhouse())).toBe(false);
    // On a plywood top its notch's edge shows, as an undermount's opening does.
    expect(sinkProblems(farmhouse(), cabinet(farmhouse()), shop.materials, words).some((w) => /cut edge showing/.test(w))).toBe(true);
  });

  it('is set on its platform before the top, in a job whose files parse', async () => {
    const p = farmhouse();
    const job = buildJob(p, shop);
    const steps = buildChecklistSections(p, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.startsWith("Before the top goes on: glue and screw the sink platform's cleats") && s.includes(FARMHOUSE_FRAME.weight))).toBe(true);
    expect(steps.some((s) => s.startsWith('The CNC cuts the notch round the sink'))).toBe(true);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });
});
