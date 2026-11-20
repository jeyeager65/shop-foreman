// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveFaceFrameParts, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject, createKitchenProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 6: the blind corner cabinet. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();
const blindOf = (project: Project, side: 'left' | 'right' = 'left') => {
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('42"');
  stored.corner = { kind: 'blind', side, blind: len('26-1/2"'), filler: len('3"') };
  return cabinetsOf(project)[0]!;
};

describe('a blind corner cabinet', () => {
  it('moves its openings off the blind side', () => {
    const project = createBaseCabinetProject('frameless', 'doors');
    const cabinet = blindOf(project);
    const [opening] = deriveCabinetOpenings(cabinet, shop.materials);
    expect(L(opening!.origin.x)).toBe('26-1/2"');
    const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    expect(opening!.width).toBeCloseTo(len('42"').mm - len('26-1/2"').mm - t, 6);
    const right = deriveCabinetOpenings(blindOf(createBaseCabinetProject('frameless', 'doors'), 'right'), shop.materials)[0]!;
    expect(right.origin.x).toBeCloseTo(t, 6);
  });

  it('frameless: a blind panel and a filler in the doors\' material, in their plane, across the blind', () => {
    const project = createBaseCabinetProject('frameless', 'doors');
    blindOf(project);
    const parts = deriveCabinetParts(project, shop).filter((p) => p.role === 'blindPanel');
    expect(parts.map((p) => p.name)).toEqual(['Blind panel', 'Corner filler']);
    const [panel, filler] = parts;
    expect(panel!.materialId).toBe('mdf-3-4');
    expect(L(filler!.size.width)).toBe('3"');
    // From the reveal at the outside edge to a front gap short of the door, which overlays the side's thickness less the reveal.
    const rules = (project.context as CasesContext).settings.frameless;
    expect(partBox(panel!).min[0]).toBeCloseTo(rules.reveal.mm, 6);
    expect(partBox(filler!).max[0]).toBeCloseTo(partBox(panel!).max[0] + filler!.size.width, 6);
    const doors = buildJob(project, shop).parts;
    expect(partBox(doors[0]!).min[0] - partBox(filler!).max[0]).toBeCloseTo(rules.frontGap.mm, 6);
    expect(partBox(filler!).max[2]).toBeCloseTo(partBox(doors[0]!).max[2], 6);
  });

  it('face frame: the stile on the blind side is the blind, and no panel is made', () => {
    const project = createBaseCabinetProject('faceFrame', 'doors');
    const cabinet = blindOf(project);
    const frame = deriveFaceFrameParts(cabinet, shop.materials);
    expect(L(frame.find((p) => p.name === 'Left stile')!.size.width)).toBe('26-1/2"');
    expect(L(frame.find((p) => p.name === 'Right stile')!.size.width)).toBe('1-1/2"');
    expect(L(frame.find((p) => p.name === 'Top rail')!.size.width)).toBe(L(len('42"').mm - len('28"').mm));
    expect(deriveCabinetParts(project, shop).some((p) => p.role === 'blindPanel')).toBe(false);
  });
});

describe('the kitchen sample', () => {
  const project = createKitchenProject();
  const job = buildJob(project, shop);

  it('is one job with every part planned, the blind panel and filler on the lists', () => {
    expect(job.plan.warnings.filter((w) => ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'unsupported'].includes(w.code))).toEqual([]);
    const lists = buildLists(job, project, shop, L);
    expect(lists.parts.filter((p) => p.name === 'Blind panel' || p.name === 'Corner filler')).toHaveLength(2);
    expect(cabinetsOf(project).map((c) => c.name)).toEqual(['Blind corner', 'Sink base', 'Drawers', 'Drawer over doors', 'Doors', 'Wall, back', 'Wall, back copy', 'Wall, left']);
  });

  it("the left run's end stops at the front of the back run, over the blind panel", async () => {
    const { layOutCabinets, runPlacementsOf } = await import('@/design');
    const context = project.context as CasesContext;
    const cabinets = cabinetsOf(project);
    const { placements, aligned } = runPlacementsOf(context.runs, context);
    const places = layOutCabinets(
      context.room,
      cabinets.map((c) => ({ id: c.id, width: c.size.width.mm, back: c.size.depth.mm, form: c.form, offFloor: c.form === 'wall' ? c.offFloor?.mm : undefined, runId: c.runId })),
      placements,
      aligned,
    );
    const doors = cabinets.find((c) => c.name === 'Doors')!;
    const at = places.get(doors.id)!;
    expect(at.turn).toBe(90);
    // On the left wall a cabinet's right end is toward the back wall: it is at z = at.z - its width.
    const end = at.at[2] - doors.size.width.mm;
    expect(end).toBeCloseTo(cabinets[0]!.size.depth.mm + 21, 6);
    // Under the blind: the left run stands within the blind panel's width of the corner.
    expect(at.at[0] + 21).toBeLessThan((cabinets[0]!.corner as { blind: { mm: number } }).blind.mm - len('3"').mm);
  });
});
