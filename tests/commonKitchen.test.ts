// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, shopFor, topPieces, topWarnings } from '@/design';
import { projectLayoutWarnings, projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { DesignedCabinetContext } from '@/model';
import { createCommonKitchenProject } from '@/samples/cabinet';

/** "A kitchen" on the samples page: a common layout, an L of two walls and an island. */
describe('the common kitchen', () => {
  const profile = createStarterShopProfile();
  const project = createCommonKitchenProject();
  const shop = shopFor(project, profile);
  const context = project.context as DesignedCabinetContext;

  it('has a fridge, a range under a microwave, a dishwasher and a sink under a window', () => {
    expect((context.appliances ?? []).map((a) => a.kind).sort()).toEqual(['dishwasher', 'microwave', 'range', 'refrigerator']);
    // The sink is the sink base's, not the room's.
    expect(cabinetsOf(project).find((c) => c.name === 'Sink base')!.sink?.mount).toBe('dropIn');
    expect(context.room?.windows).toHaveLength(1);
    const [range, microwave] = ['range', 'microwave'].map((kind) => context.appliances!.find((a) => a.kind === kind)!);
    expect(microwave!.placement).toEqual(range!.placement);
  });

  it('is an L of base cabinets round a blind corner, uppers over them, and an island under one top', () => {
    const cabinets = cabinetsOf(project);
    expect(cabinets.filter((c) => c.form === 'base')).toHaveLength(7);
    expect(cabinets.filter((c) => c.form === 'wall')).toHaveLength(7);
    expect(cabinets.filter((c) => c.corner).map((c) => c.corner!.kind).sort()).toEqual(['blind', 'diagonal']);
    expect(context.islands).toHaveLength(1);
    // The blind corner cabinet has one door, hinged away from its blind: there is no side at the blind to hinge a second on.
    const blind = cabinets.find((c) => c.corner?.kind === 'blind')!;
    const doors = project.designObjects.filter((d) => d.template === 'doorSet' && d.mounting.openingId.startsWith(`${blind.id}/`));
    expect(doors.map((d) => (d.template === 'doorSet' ? [d.mounting.doors, d.mounting.hingeSide] : []))).toEqual([[1, 'left']]);
    // A top on every floor cabinet: by the fridge, the range wall's run, the sink wall's two, the island.
    expect(topPieces(project, shop.materials).length).toBeGreaterThanOrEqual(4);
  });

  it('stands in its room with nothing to warn of, is drawn, and builds', () => {
    expect(projectLayoutWarnings(project, shop.materials, shop.hardware)).toEqual([]);
    expect(topWarnings(project, shop.materials, (mm) => `${mm}`)).toEqual([]);
    expect('error' in projectScene(project, shop)).toBe(false);
    const job = buildJob({ ...project, slug: 'common-kitchen' }, profile);
    expect(job.files.length).toBeGreaterThan(0);
  });
});
