// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetIdOf, cabinetTags, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, partTitle, tagLetters, tagged } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import { activeMachine, setupFaces } from '@/plan';
import { addCabinet, copyCabinet, createBaseCabinetProject, createShopCabinetProject, createShopWallProject, moveCabinet } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 4: cabinet tags on parts, labels, the lists and the checklist. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();

describe('cabinet tags', () => {
  it('are letters in list order, derived: moving a cabinet moves its tag', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(tagLetters)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    const project = createShopWallProject();
    expect([...cabinetTags(project)]).toEqual([
      ['cabinet-1', 'A'],
      ['cabinet-2', 'B'],
      ['cabinet-3', 'C'],
    ]);
    moveCabinet(project, 'cabinet-3', -1);
    expect(cabinetTags(project).get('cabinet-3')).toBe('B');
    expect(JSON.stringify(project)).not.toMatch(/"tag"/);
    expect([tagged('Left side', 'B'), tagged('Left side')]).toEqual(['B · Left side', 'Left side']);
  });

  it('a project with one cabinet, or none, has no tags and its parts and labels are as they were', () => {
    for (const project of [createBaseCabinetProject('faceFrame'), createShopCabinetProject(), createVanityProject()]) {
      expect(cabinetTags(project).size).toBe(0);
      const job = buildJob(project, shop);
      expect([...job.parts, ...job.cabinetParts].some((p) => 'tag' in p)).toBe(false);
      expect(buildLists(job, project, shop, L).parts.every((p) => /^[A-Z]{1,2}\d+$/.test(p.label))).toBe(true);
      expect(buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).at(-1)!.title).toBe('After the machine');
    }
  });

  it('finds the cabinet of a part by its id: a case part, a front, a drawer box part', () => {
    const cabinetOf = cabinetIdOf(createShopWallProject());
    expect(['cabinet-2/side-left', 'cabinet-2', 'doors-2/door-left', 'drawer-4/box-front', 'drawer-7', 'nothing/x'].map(cabinetOf)).toEqual([
      'cabinet-2',
      'cabinet-2',
      'cabinet-2',
      'cabinet-2',
      'cabinet-3',
      undefined,
    ]);
  });
});

describe('the shop wall with tags', () => {
  const project = createShopWallProject();
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  const lists = buildLists(job, project, shop, L);

  it('every part carries the tag of its cabinet, and keeps its name', () => {
    expect(all.every((p) => p.tag === cabinetTags(project).get(cabinetIdOf(project)(p.id)!))).toBe(true);
    expect([...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)].map((p) => p.tag).filter((t, i, a) => a.indexOf(t) === i)).toEqual(['A', 'B', 'C']);
    const side = all.find((p) => p.id === 'cabinet-2/side-left')!;
    expect([side.name, partTitle(side)]).toEqual(['Left side', 'B · Left side']);
    expect(partTitle(all.find((p) => p.id === 'drawer-5/box-front')!)).toBe('C · Drawer 1 box front');
    // With the tag in front, every part of the job has a name of its own.
    expect(new Set(all.map(partTitle)).size).toBe(all.length);
  });

  it('labels count within each cabinet, behind its tag: alike cabinets have alike labels', () => {
    const label = (partId: string) => lists.parts.find((p) => p.partId === partId)!.label;
    expect([label('cabinet-1/side-left'), label('cabinet-2/side-left'), label('cabinet-3/side-left')]).toEqual(['A-C1', 'B-C1', 'C-C1']);
    expect([label('drawer-1/box-front'), label('drawer-5/box-front'), label('drawer-4/box-front')]).toEqual(['A-D3', 'C-D3', 'B-D3']);
    expect([label('doors-2/door-left'), label('doors-2/door-right')]).toEqual(['B-DR1', 'B-DR2']);
    expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
    const of = (tag: string) => lists.parts.filter((p) => p.label.startsWith(`${tag}-`)).map((p) => p.label.slice(2));
    expect(of('A')).toEqual(of('C'));
  });

  it('the cut list names a merged row once and says whose each part is in its labels', () => {
    const rows = lists.cutList.flatMap((g) => g.rows);
    expect(rows.find((r) => r.quantity === 2 && r.names.join() === 'Bottom')!.labels).toEqual(['A-C3', 'C-C3']);
    expect(rows.find((r) => r.names.join() === 'Front stretcher,Back stretcher' && r.quantity === 4)!.labels).toEqual(['A-C4', 'A-C5', 'C-C4', 'C-C5']);
    expect(rows.reduce((n, r) => n + r.quantity, 0)).toBe(rows.reduce((n, r) => n + r.labels.length, 0));
  });

  it('names the parts on a blank with their tags', () => {
    const shared = job.plan.blanks.find((b) => new Set(b.partIds.map((id) => all.find((p) => p.id === id)!.tag)).size > 1)!;
    const names = shared.setups.flatMap((s) => setupFaces(s, all).groups.flatMap((g) => g.parts));
    expect(names.every((n) => /^[ABC] · /.test(n))).toBe(true);
    expect(new Set(names.map((n) => n[0])).size).toBeGreaterThan(1);
  });

  it('gives the checklist a section per cabinet, each with the steps its own parts call for', () => {
    const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop));
    expect(sections.slice(-4).map((s) => s.title)).toEqual(['After the machine', 'A · Drawers, left', 'B · Drawer over doors', 'C · Drawers, right']);
    const steps = (title: string) => sections.find((s) => s.title === title)!.steps.map((s) => s.text.split(/[.:]/)[0]);
    expect(steps('After the machine')).toEqual(['Cut the tabs and sand them flush', 'Print the install kit']);
    expect(steps('A · Drawers, left')).toEqual([
      'Countersink the case screw holes on the outside of the sides',
      'Assemble the case',
      'Fasten the back over the rear of the case with brads or staples, flush all round',
      'Glue the drawer box sides into the dados in the back of the wide front, square to it',
      'Fit the slides',
      // Each cabinet is finished once it is together.
      'Seal and paint',
    ]);
    expect(steps('C · Drawers, right')).toEqual(steps('A · Drawers, left'));
    // Only the cabinet with doors hangs doors.
    expect(steps('B · Drawer over doors')).toEqual([...steps('A · Drawers, left'), 'Once the finish is dry, put the shelf pins in and set the shelves', 'Screw the hinge plates to the holes in the case sides and fit the hinges in their cups']);
  });

  it('a step belongs to the cabinet whose parts call for it', () => {
    const mixed = createBaseCabinetProject('frameless');
    addCabinet(mixed, { name: 'Doors', width: len('18"'), layout: 'doors' });
    cabinetsOf(mixed)[0]!.name = 'Base';
    const built = buildJob(mixed, shop);
    const sections = buildChecklistSections(mixed, built.plan, built.programs, shop.tools, activeMachine(shop));
    expect(sections.slice(-2).map((s) => [s.title, s.steps.length])).toEqual([
      ['A · Base', 9],
      ['B · Doors', 6],
    ]);
    // Frameless: the hinges clip onto plates on the case sides, not onto a frame.
    expect(sections.at(-1)!.steps.at(-1)!.text).toMatch(/^Screw the hinge plates to the holes in the case sides.*Rest the doors on the support blocks/);
    // The drawer's steps are the cabinet's that has the drawer.
    expect(sections.at(-2)!.steps.some((s) => /drawer box/.test(s.text))).toBe(true);
    expect(sections.at(-1)!.steps.some((s) => /drawer/.test(s.text))).toBe(false);
  });

  it('takes pocket screws only into parts of the same cabinet', () => {
    // Two cabinets of different widths, each in its own frame: a screw of one must not find a part of the other.
    const narrow = createBaseCabinetProject('faceFrame');
    const wide = createBaseCabinetProject('faceFrame');
    cabinetsOf(wide)[0]!.size.width = len('30"');
    const both = createBaseCabinetProject('faceFrame');
    copyCabinet(both, 'cabinet-1');
    cabinetsOf(both)[1]!.size.width = len('30"');
    const screws = (p: typeof narrow) => {
      const built = buildJob(p, shop);
      return buildLists(built, p, shop, L).hardware.filter((h) => h.group === 'Pocket screws').map((h) => [h.item, h.quantity ?? 0] as const);
    };
    const apart = [...screws(narrow), ...screws(wide)];
    for (const [item, n] of screws(both)) expect(n, item).toBe(apart.filter(([i]) => i === item).reduce((sum, [, q]) => sum + q, 0));
    expect(screws(both).length).toBeGreaterThan(0);
    // The Kreg jig's rows name the part each row of holes goes into: one of the same cabinet.
    const built = buildJob(both, shop);
    const kreg = buildLists(built, both, shop, L).kreg;
    expect(kreg.filter((k) => k.label.startsWith('B-')).length).toBe(kreg.filter((k) => k.label.startsWith('A-')).length);
  });
});
