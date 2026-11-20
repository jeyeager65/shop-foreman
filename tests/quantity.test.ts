// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { baseId, cabinetIdOf, cabinetTags, cabinetsOf, copiesOf, deriveCabinetParts, partTitle } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { addCabinet, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 4: a cabinet designed once and made several times. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const built = (project: Project) => {
  const job = buildJob(project, shop);
  return { job, all: [...job.cabinetParts, ...job.parts], lists: buildLists(job, project, shop, L) };
};
const times = (make: () => Project, quantity: number) => {
  const project = make();
  cabinetsOf(project)[0]!.quantity = quantity;
  return project;
};
const hardware = (project: Project) => new Map(built(project).lists.hardware.map((h) => [`${h.group}|${h.item}`, h.quantity]));

describe('quantity', () => {
  it('is stored on the cabinet, 1 to start with', () => {
    const project = createShopCabinetProject();
    expect(cabinetsOf(project)[0]!.quantity).toBe(1);
    expect(addCabinet(project, { name: 'Other', width: len('18"'), layout: 'doors' }).quantity).toBe(1);
    expect([copiesOf({ quantity: 3 }), copiesOf({ quantity: 0 }), copiesOf({ quantity: 2.7 }), copiesOf({ quantity: NaN })]).toEqual([3, 1, 2, 1]);
  });

  it('one cabinet made once is as it was: no tags, no copies', () => {
    const { all, lists } = built(createShopCabinetProject());
    expect(all.some((p) => p.tag !== undefined || p.copy !== undefined)).toBe(false);
    expect(lists.parts[0]!.label).toBe('C1');
  });

  describe('the shop cabinet made three times', () => {
    const one = built(createShopCabinetProject());
    const project = times(createShopCabinetProject, 3);
    const { job, all, lists } = built(project);

    it('has every part three times, alike but for its id and its copy', () => {
      expect(all).toHaveLength(3 * one.all.length);
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
      expect([...cabinetTags(project)]).toEqual([['cabinet-1', 'A']]);
      const sides = all.filter((p) => p.name === 'Left side');
      expect(sides.map((p) => [p.id, p.tag, p.copy, partTitle(p)])).toEqual([
        ['cabinet-1/side-left', 'A', 1, 'A1 · Left side'],
        ['cabinet-1~2/side-left', 'A', 2, 'A2 · Left side'],
        ['cabinet-1~3/side-left', 'A', 3, 'A3 · Left side'],
      ]);
      expect(sides.map((p) => ({ ...p, id: '', copy: 0 }))).toEqual(Array(3).fill({ ...sides[0]!, id: '', copy: 0 }));
      // Fronts and drawer boxes too.
      expect(all.filter((p) => /door-left$/.test(p.id)).map((p) => p.id)).toEqual(['doors-1/door-left', 'doors-1~2/door-left', 'doors-1~3/door-left']);
      expect(all.filter((p) => /box-front$/.test(p.id)).map((p) => p.id)).toEqual(['drawer-1/box-front', 'drawer-1~2/box-front', 'drawer-1~3/box-front']);
      // A copy's parts follow each other, copy by copy.
      expect(deriveCabinetParts(project, shop).map((p) => p.copy)).toEqual([...Array(7).fill(1), ...Array(7).fill(2), ...Array(7).fill(3)]);
      // Every copy knows its cabinet, and a choice is stored without the copy.
      expect(all.every((p) => cabinetIdOf(project)(p.id) === 'cabinet-1')).toBe(true);
      expect([baseId('cabinet-1~3/side-left'), baseId('drawer-1~12/box-front'), baseId('cabinet-1/side-left'), baseId('doors-1~2')]).toEqual(['cabinet-1/side-left', 'drawer-1/box-front', 'cabinet-1/side-left', 'doors-1']);
    });

    it('labels each copy behind its number', () => {
      const label = (id: string) => lists.parts.find((p) => p.partId === id)!.label;
      expect([label('cabinet-1/side-left'), label('cabinet-1~2/side-left'), label('cabinet-1~3/bottom'), label('doors-1~2/door-right')]).toEqual(['A1-C1', 'A2-C1', 'A3-C3', 'A2-DR2']);
      expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
      const bottom = lists.cutList.flatMap((g) => g.rows).find((r) => r.names.includes('Bottom'))!;
      expect([bottom.quantity, bottom.names, bottom.labels]).toEqual([3, ['Bottom'], ['A1-C3', 'A2-C3', 'A3-C3']]);
    });

    it('cuts every copy: all of them on blanks or on the cut list, in one job that parses', async () => {
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      const onBlanks = job.plan.blanks.flatMap((b) => b.partIds);
      expect(new Set(onBlanks).size).toBe(onBlanks.length);
      expect(onBlanks).toHaveLength(3 * one.job.plan.blanks.flatMap((b) => b.partIds).length);
      expect(lists.cutList.flatMap((g) => g.rows).reduce((n, r) => n + r.quantity, 0)).toBe(3 * one.lists.cutList.flatMap((g) => g.rows).reduce((n, r) => n + r.quantity, 0));
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });

    it('has the same rows on the Plan as one, each covering the cabinet, and a choice is for every copy', () => {
      expect(job.plan.operations.map((o) => o.key)).toEqual(one.job.plan.operations.map((o) => o.key));
      expect(job.plan.operations.filter((o) => o.kind !== 'install').every((o) => o.covers?.join() === 'A')).toBe(true);
      // How a part is cut out is chosen once, for every copy.
      const sawn = times(createShopCabinetProject, 3);
      const before = built(sawn).job.plan.parts.filter((p) => baseId(p.partId) === 'cabinet-1/bottom').map((p) => p.cutOut);
      expect(before).toEqual(['tableSaw', 'tableSaw', 'tableSaw']);
      sawn.plan.parts = { 'cabinet-1/bottom': { cutOut: 'cnc' } };
      expect(built(sawn).job.plan.parts.filter((p) => baseId(p.partId) === 'cabinet-1/bottom').map((p) => p.cutOut)).toEqual(['cnc', 'cnc', 'cnc']);
    });

    it('multiplies the hardware, and keeps one install kit', () => {
      const once = hardware(createShopCabinetProject());
      const thrice = hardware(project);
      expect([...thrice.keys()]).toEqual([...once.keys()]);
      for (const [item, n] of thrice) {
        if (item.startsWith('3D prints')) expect(n, item).toBe(once.get(item));
        else expect(n, item).toBe(once.get(item) === undefined ? undefined : 3 * once.get(item)!);
      }
      expect(thrice.get('Drawer|Generic side-mount ball-bearing slide, 20"')).toBe(3);
    });

    it('has one checklist section for the cabinet, saying how many', () => {
      const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop));
      expect(sections.at(-1)!.title).toBe('A · Shop cabinet, 3 of them');
      // Countersink, the case, its back, the drawer boxes, the slides, the finish, the shelves, the doors
      expect(sections.at(-1)!.steps.length).toBe(8);
    });
  });

  it('multiplies what a face frame cabinet with a drawer on strips needs: screws, shims, pocket screws', () => {
    const once = built(createBaseCabinetProject('faceFrame'));
    const twice = built(times(() => createBaseCabinetProject('faceFrame'), 2));
    const map = (l: typeof once.lists) => new Map(l.hardware.map((h) => [`${h.group}|${h.item}`, h.quantity]));
    for (const [item, n] of map(twice.lists)) {
      if (item.startsWith('3D prints|Slide shims')) expect(n, item).toBe(2 * map(once.lists).get(item)!);
      else if (item.startsWith('3D prints')) expect(n, item).toBe(map(once.lists).get(item));
      else expect(n, item).toBe(map(once.lists).get(item) === undefined ? undefined : 2 * map(once.lists).get(item)!);
    }
    expect(twice.lists.shims!.quantity).toBe(2 * once.lists.shims!.quantity);
    // The slide's note still counts one drawer's pilot holes.
    const note = (l: typeof once.lists) => l.hardware.find((h) => /slide,/.test(h.item))!.note;
    expect(note(twice.lists)).toBe(note(once.lists));
  });

  it('counts only the cabinet that is made several times', () => {
    const project = createShopCabinetProject();
    addCabinet(project, { name: 'Doors', width: len('18"'), layout: 'doors' });
    cabinetsOf(project)[1]!.quantity = 2;
    const { all, lists } = built(project);
    expect(all.filter((p) => p.name === 'Left side').map(partTitle)).toEqual(['A · Left side', 'B1 · Left side', 'B2 · Left side']);
    expect(lists.parts.filter((p) => p.name === 'Left side').map((p) => p.label)).toEqual(['A-C1', 'B1-C1', 'B2-C1']);
    // Two door sets on A and B, B twice: three pairs of doors, six stops.
    expect(lists.hardware.find((h) => h.item === 'Door stops or catches')!.quantity).toBe(6);
    expect(lists.hardware.find((h) => /slide,/.test(h.item))!.quantity).toBe(1);
  });
});
