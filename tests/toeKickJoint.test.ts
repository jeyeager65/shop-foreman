// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KICK_ROW_INSET, POCKET_END_INSET, cabinetsOf, deriveCabinetParts, partFaces } from '@/design';
import { arcShape } from '@/geometry/pocketHole';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { Feature } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject } from '@/samples/cabinet';

/** The toe kick board fastened with pocket screws: into the sides, and up into the bottom. */
type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
const pockets = (features: Feature[]) => features.filter((f): f is PocketHole => f.kind === 'pocketHole');
const kickOf = (style: 'frameless' | 'faceFrame', screwed: boolean) => {
  const shop = createStarterShop();
  const project = createBaseCabinetProject(style, 'doors');
  if (screwed) cabinetsOf(project)[0]!.toeKick.joint = 'pocketScrews';
  const kick = deriveCabinetParts(project, shop).find((p) => p.id === 'cabinet-1/toe-kick')!;
  return { shop, project, kick };
};

describe('the toe kick board', () => {
  it('is a plain board fastened by hand until it is given pocket screws', () => {
    const { kick, project, shop } = kickOf('frameless', false);
    expect(pockets(kick.features)).toEqual([]);
    const job = buildJob(project, shop);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ');
    expect(text).toContain('Fasten the toe kick board between the sides');
    expect(text).not.toContain('pocket-screw it from its back');
  });

  for (const style of ['frameless', 'faceFrame'] as const) {
    it(`${style}: pocket holes in its back, into each side and up into the bottom`, () => {
      const { kick } = kickOf(style, true);
      const holes = pockets(kick.features);
      // All in its back, which nobody sees.
      expect(partFaces(kick).B).toBe('Back');
      expect(holes.every((h) => h.face === 'B')).toBe(true);
      // Two at each end into the sides.
      const left = holes.filter((h) => h.edge === 'x0');
      const right = holes.filter((h) => h.edge === 'x1');
      expect(left.length).toBe(2);
      expect(right.map((h) => h.at)).toEqual(left.map((h) => h.at));
      for (const h of left) expect(h.at > 0 && h.at < kick.size.height).toBe(true);
      expect(left.every((h) => h.id.startsWith('side-pocket-left'))).toBe(true);
      // A row along its top edge up into the bottom, well in from each end and no more than 8" apart.
      const up = holes.filter((h) => h.edge === 'y1').sort((a, b) => a.at - b.at);
      expect(up.length).toBeGreaterThanOrEqual(2);
      expect(up.every((h) => h.id.startsWith('bottom-pocket'))).toBe(true);
      // (The row starts that far in, and its first hole is the usual 2" from the row's end.)
      expect(up[0]!.at).toBeCloseTo(KICK_ROW_INSET + POCKET_END_INSET, 6);
      expect(up.at(-1)!.at).toBeCloseTo(kick.size.width - KICK_ROW_INSET - POCKET_END_INSET, 6);
      for (let i = 1; i < up.length; i++) expect(up[i]!.at - up[i - 1]!.at).toBeLessThanOrEqual(8 * 25.4 + 1e-6);
      expect(holes.length).toBe(left.length + right.length + up.length);
      // Even a low-angle pocket from the top edge stays clear of the ones from the ends, which run in toward it.
      const reach = arcShape(kick.size.thickness, 6.35, 3).end;
      expect(up[0]!.at - 9.525 / 2).toBeGreaterThan(reach);
    });
  }

  it('in a job: the screws are on the hardware list, the Kreg list has its rows, and the checklist says how', () => {
    const { project, shop } = kickOf('frameless', true);
    const before = buildLists(buildJob(kickOf('frameless', false).project, shop), kickOf('frameless', false).project, shop, (mm) => `${mm}`);
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    const count = (l: typeof lists) => l.hardware.filter((h) => h.group === 'Pocket screws').reduce((n, h) => n + (h.quantity ?? 0), 0);
    const holes = pockets(job.cabinetParts.find((p) => p.id === 'cabinet-1/toe-kick')!.features).length;
    expect(count(lists) - count(before)).toBe(holes);
    expect(lists.hardware.filter((h) => h.group === 'Pocket screws').some((h) => /Toe kick/.test(h.note ?? ''))).toBe(true);
    // Into the sides, and into the bottom.
    const rows = lists.kreg.filter((r) => /Toe kick/.test(r.part));
    expect(rows.map((r) => r.into).sort()).toEqual(['Bottom', 'Left side', 'Right side']);
    expect(rows.every((r) => r.face === 'Back')).toBe(true);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ');
    expect(text).toContain('pocket-screw it from its back: into each side, and up into the bottom');
  });

  it('cut on the CNC, its pockets are the job’s kind; no file leaves one out', () => {
    for (const method of ['cncAssisted', 'lowAngle3'] as const) {
      const { project, shop } = kickOf('frameless', true);
      project.plan.pocketHoles = method;
      project.plan.parts = { 'cabinet-1/toe-kick': { cutOut: 'cnc' } };
      const job = buildJob(project, shop);
      expect(job.plan.parts.find((p) => p.partId === 'cabinet-1/toe-kick')!.cutOut, method).toBe('cnc');
      expect(job.plan.warnings.filter((w) => w.code === 'unsupported'), method).toEqual([]);
      expect(job.plan.pocketHoles!.cncAssisted, method).toBe(job.plan.pocketHoles!.count);
    }
  });
});
