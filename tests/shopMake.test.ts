// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, doorSetOf, isDrawer, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { Project } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Milestone 3: what Plan and Make say for a shop-style cabinet. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);

function made(change: (p: Project) => void = () => {}, project = createShopCabinetProject()) {
  change(project);
  const job = buildJob(project, shop);
  return {
    project,
    job,
    lists: buildLists(job, project, shop, L),
    steps: buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)),
  };
}
const items = (lists: ReturnType<typeof made>['lists']) => lists.hardware.map((h) => `${h.quantity ?? ''} ${h.item}`);

describe('the install kit for inset doors', () => {
  it('is shims to stand the doors on and to set the gap between a pair', () => {
    const { job, project } = made();
    const gap = cabinetsOf(project)[0]!.shop.gap.mm;
    // A pair: two under each door and one between them, all the cabinet's gap thick.
    expect(job.plan.installKit).toEqual([{ template: 'gapShim', params: { thickness: gap }, quantity: 5, output: '3mf' }]);
    expect(job.plan.operations.find((o) => o.kind === 'install')?.label).toBe('Hang doors');
  });

  it('keeps shims of different thickness apart', () => {
    const { job } = made((p) => (doorSetOf(p).mounting.gap = { mm: 2, unit: 'mm' }));
    expect(job.plan.installKit.map((j) => [j.params.thickness, j.quantity])).toEqual([[3.175, 4], [2, 1]]);
  });

  it('is two shims for a single door', () => {
    const { job } = made((p) => Object.assign(doorSetOf(p).mounting, { doors: 1, hingeSide: 'left' }));
    expect(job.plan.installKit.map((j) => j.quantity)).toEqual([2]);
  });

  it('is still support blocks for doors that overlay', () => {
    const { job } = made(() => {}, createBaseCabinetProject('frameless'));
    expect(job.plan.installKit.map((j) => j.template)).toEqual(['supportBlock', 'gapShim']);
  });
});

describe('the build checklist for the shop cabinet', () => {
  it('names the hand steps its joints and fronts call for', () => {
    const { steps } = made();
    const text = steps.join('\n');
    expect(text).toMatch(/Countersink the case screw holes/);
    expect(text).toMatch(/Glue the drawer box sides into the dados/);
    expect(text).toMatch(/Print the install kit: 5 gap shims\./);
    expect(text).toMatch(/Stand each door in its opening on two shims/);
    expect(text).not.toMatch(/support blocks|runner|finger pulls/);
    // In order: the hand steps, then finishing, then hanging.
    const at = (re: RegExp) => steps.findIndex((s) => re.test(s));
    expect(at(/Countersink/)).toBeLessThan(at(/Seal and paint/));
    expect(at(/Seal and paint/)).toBeLessThan(at(/Stand each door/));
  });

  it('adds the steps for runners and finger pulls when the design has them', () => {
    const { steps } = made((p) => {
      doorSetOf(p).shopPull = 'fingerPull';
      for (const d of designsOf(p).filter(isDrawer)) d.shop = { front: 'runners', pull: 'fingerPull' };
    });
    const text = steps.join('\n');
    expect(text).toMatch(/Glue and screw the runner and kicker strips/);
    expect(text).toMatch(/Ease the edges of the finger pulls/);
    expect(text).not.toMatch(/dados in the back of the wide front/);
  });

  it('says nothing new for a cabinet that has none of it', () => {
    const { steps } = made(() => {}, createBaseCabinetProject('faceFrame'));
    const text = steps.join('\n');
    expect(text).not.toMatch(/Countersink|runner|finger pull|wide front|Stand each door/);
    expect(text).toMatch(/rest the doors on the support blocks/);
  });
});

describe('the hardware list for the shop cabinet', () => {
  it('has the stops inset doors need and the pulls that are fitted by hand', () => {
    const { lists } = made();
    const list = items(lists);
    expect(list).toContain('2 Door stops or catches');
    expect(list).toContain('2 Knobs or pulls');
    expect(list).toContain('1 Knob or pull');
    expect(list).toContain('5 Door gap shims, 1/8" thick');
    expect(list.join('\n')).not.toMatch(/support blocks|washer-head|pocket screws/);
  });

  it('leaves out the pulls the CNC cuts', () => {
    const { lists } = made((p) => {
      doorSetOf(p).shopPull = 'fingerPull';
      for (const d of designsOf(p).filter(isDrawer)) d.shop = { pull: 'fingerPull' };
    });
    const list = items(lists).join('\n');
    expect(list).not.toMatch(/Knob/);
    expect(list).toMatch(/2 Door stops or catches/);
  });

  it('labels the parts by what they are: the wide front with the drawer box', () => {
    const { lists } = made();
    const label = (name: string) => lists.parts.find((p) => p.name === name)!.label;
    expect(label('Box front')).toMatch(/^D\d+$/);
    expect(label('Left door')).toMatch(/^DR\d+$/);
    expect(label('Left side')).toMatch(/^C\d+$/);
    expect(lists.parts.some((p) => p.label.startsWith('DF'))).toBe(false);
    expect(lists.kreg).toEqual([]);
  });

  it('does not change the lists of the other styles', () => {
    const { lists } = made(() => {}, createBaseCabinetProject('frameless'));
    const list = items(lists).join('\n');
    expect(list).not.toMatch(/stops or catches|Knob/);
    expect(list).toMatch(/2 Door support blocks/);
    expect(list).toMatch(/1 Door gap shim/);
  });
});
