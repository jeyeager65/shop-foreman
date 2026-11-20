// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { listsHtml } from '@/job/listsHtml';
import type { PlanWarning, Project } from '@/model';
import { activeMachine, planPart, tooBigToCut } from '@/plan';
import { addTallCabinet, applyCabinetLayout, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/**
 * Milestone 4: a part too long for the machine's cutting area (a tall
 * cabinet's side, 84" against the LowRider 3's 72") is cut on a saw, and what the CNC
 * would have cut in it is made by hand, with the lists saying where. This is what a
 * machine that cannot tile does, and what a tiled part may be switched to.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
/** A machine whose Y is a hard limit too: it cannot tile, so a long part goes to the saw. (Tiling is `tests/tiling.test.ts`.) */
const shop = lowRiderJobShop();
for (const machine of shop.machines) delete machine.tiling;
const area = { width: activeMachine(shop).cuttingArea.x.mm, height: activeMachine(shop).cuttingArea.y.mm };

function tallJob(style: 'frameless' | 'faceFrame' | 'shop', edit: (project: Project) => void = () => {}) {
  const project = style === 'shop' ? createShopCabinetProject() : createBaseCabinetProject(style);
  addTallCabinet(project, { name: 'Tall' });
  edit(project);
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  return { project, job, all, lists: buildLists(job, project, shop, L), planOf: (id: string) => job.plan.parts.find((p) => p.partId === id)! };
}

describe('a part too long for the machine', () => {
  it('is one that fits the cutting area neither way round', () => {
    const { all } = tallJob('frameless');
    const part = (id: string) => all.find((p) => p.id === id)!;
    expect([area.width, area.height].map(L)).toEqual(['34"', '72"']);
    expect(tooBigToCut(part('cabinet-2/side-left'), area)).toBe(true);
    expect(tooBigToCut(part('cabinet-1/side-left'), area)).toBe(false);
    expect(tooBigToCut(part('cabinet-2/bottom'), area)).toBe(false);
    // Without a machine to ask, nothing is too big.
    expect(tooBigToCut(part('cabinet-2/side-left'), undefined)).toBe(false);
    // Turned a quarter, a part 40" x 30" fits; 40" x 36" does not.
    const sized = (width: string, height: string) => ({ ...part('cabinet-2/bottom'), size: { width: len(width).mm, height: len(height).mm, thickness: 18 } });
    expect([tooBigToCut(sized('40"', '30"'), area), tooBigToCut(sized('40"', '36"'), area)]).toEqual([false, true]);
  });

  it('is cut on a saw, with the CNC not offered, and its joints and holes become steps by hand', () => {
    const { planOf, all } = tallJob('frameless');
    const side = planOf('cabinet-2/side-left');
    expect([side.cutOut, side.suggested, side.options]).toEqual(['tableSaw', 'tableSaw', ['tableSaw', 'circularSaw']]);
    expect(side.reason).toBe("Longer than the machine's cutting area: cut on the table saw. By hand: a rabbet and holes; the Lists tab on Cut says where each goes.");
    expect(side.steps).toEqual([
      { label: 'Toe-kick notch', by: 'jigSaw' },
      { label: '1 rabbet (router and straightedge)', by: 'byHand' },
      { label: '88 shelf-pin holes (drilled by hand)', by: 'byHand' },
      { label: '12 hinge plate holes (drilled by hand)', by: 'byHand' },
    ]);
    // The same side on a machine that takes it is the CNC's, as ever.
    const part = all.find((p) => p.id === 'cabinet-2/side-left')!;
    const roomy = planPart(part, {}, shop, { width: 1300, height: 2500 });
    expect([roomy.cutOut, roomy.options, roomy.steps.every((s) => s.by === 'cnc' || s.by === 'jigSaw')]).toEqual(['cnc', ['cnc'], true]);
    expect(planPart(part, {}, shop).cutOut).toBe('cnc');
    // A choice of the CNC cannot be kept for it.
    expect(planPart(part, { parts: { 'cabinet-2/side-left': { cutOut: 'cnc' } } }, shop, area).cutOut).toBe('tableSaw');
    // The base cabinet's sides beside it are untouched.
    expect(planOf('cabinet-1/side-left').cutOut).toBe('cnc');
  });

  it('with no saw in the shop it stays with the CNC, and the plan says it does not fit', () => {
    const none = { ...shop, saws: { ...shop.saws, tableSaw: { ...shop.saws.tableSaw, owned: false }, circularSaw: { ...shop.saws.circularSaw, owned: false } } };
    const project = createBaseCabinetProject('frameless');
    addTallCabinet(project, { name: 'Tall' });
    const job = buildJob(project, none);
    const side = job.plan.parts.find((p) => p.partId === 'cabinet-2/side-left')!;
    expect([side.cutOut, side.reason]).toEqual(['cnc', "Longer than the machine's cutting area, and the shop profile has no saw that takes it."]);
    expect(job.plan.warnings.some((w) => w.code === 'outsideCuttingArea' || w.code === 'stockTooSmall')).toBe(true);
  });
});

describe.each(['frameless', 'faceFrame', 'shop'] as const)('a %s job with a tall cabinet', (style) => {
  const { job, all, lists, project } = tallJob(style);

  it('plans with nothing in the way: the long sides are on the cut list, not on a blank', async () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const onBlanks = job.plan.blanks.flatMap((b) => b.partIds);
    expect(onBlanks.some((id) => id.startsWith('cabinet-2/side'))).toBe(false);
    expect(onBlanks).toContain('cabinet-1/side-left');
    const sides = lists.cutList.flatMap((g) => g.rows).find((r) => r.labels.includes('B-C1'))!;
    expect([sides.quantity, L(sides.length), sides.names, sides.labels]).toEqual([2, '84"', ['Left side', 'Right side'], ['B-C1', 'B-C2']]);
    // No row of the plan cuts anything in them.
    const cut = job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => r.partId) : []));
    expect(cut.some((id) => id.startsWith('cabinet-2/side'))).toBe(false);
    // Every part is cut once, and the files parse.
    const onCnc = all.filter((p) => (job.plan.parts.find((x) => x.partId === p.id)?.cutOut ?? 'cnc') === 'cnc');
    expect([...onBlanks].sort()).toEqual(onCnc.map((p) => p.id).sort());
    expect(lists.cutList.flatMap((g) => g.rows).reduce((n, r) => n + r.quantity, 0)).toBe(all.length - onCnc.length);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });

  it('lists every joint and every hole of the long sides to be made by hand, where it goes', () => {
    const rows = lists.byHand;
    expect([...new Set(rows.map((r) => r.label))]).toEqual(['B-C1', 'B-C2']);
    for (const label of ['B-C1', 'B-C2']) {
      const part = all.find((p) => lists.parts.find((x) => x.label === label)!.partId === p.id)!;
      const mine = rows.filter((r) => r.label === label);
      // Nothing is left out: as many holes and recesses as the part has.
      const holes = part.features.filter((f) => f.kind === 'hole').length;
      const recesses = part.features.filter((f) => f.kind === 'dado').length;
      expect(mine.filter((r) => /holes/i.test(r.what)).reduce((n, r) => n + r.count, 0)).toBe(holes);
      expect(mine.filter((r) => !/holes/i.test(r.what))).toHaveLength(recesses);
      expect(mine.every((r) => r.face === 'Inside' && /from its front edge/.test(r.where))).toBe(true);
    }
    const what = new Set(rows.map((r) => r.what));
    expect(what.has('Shelf-pin holes')).toBe(true);
    expect(what.has('Back rabbet')).toBe(style !== 'shop');
    expect(what.has('Case screw holes')).toBe(style === 'shop');
    expect(what.has('Hinge plate holes')).toBe(style !== 'faceFrame');
    // The two sides are mirror images: measured from the front edge, their rows read the same.
    const strip = (label: string) => rows.filter((r) => r.label === label).map(({ what: w, size, where, count }) => ({ w, size, where, count }));
    expect(strip('B-C2')).toEqual(strip('B-C1'));
  });

  it('says so in the checklist and on the printed lists', () => {
    const steps = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop));
    expect(steps.filter((s) => /too long for the machine/.test(s))).toHaveLength(1);
    const page = listsHtml('Job', lists, L);
    expect(page).toContain('By hand: joints and holes of parts cut on a saw');
    expect(page).toContain('Shelf-pin holes'.toLowerCase());
  });
});

describe('by hand, in detail', () => {
  it('a line of holes is one row: its size, its distance from the front edge, and each height', () => {
    const { lists } = tallJob('frameless');
    const pins = lists.byHand.filter((r) => r.label === 'B-C1' && r.what === 'Shelf-pin holes');
    expect(pins.map((r) => [r.count, r.size, r.where.split(',')[0]])).toEqual([
      [44, '5 mm across, 10 mm deep', '1-15/32" from its front edge'],
      [44, '5 mm across, 10 mm deep', '22-5/16" from its front edge'],
    ]);
    expect(pins[0]!.where).toMatch(/ at 10-1\/16", 11-5\/16", .* up from its bottom edge$/);
    const rabbet = lists.byHand.find((r) => r.label === 'B-C1' && r.what === 'Back rabbet')!;
    expect([rabbet.size, rabbet.where, rabbet.count]).toEqual(['7/32" wide × 3/8" deep', '23-25/32" from its front edge, the whole height', 1]);
  });

  it('a dado is named for what it houses and placed up from the bottom edge', () => {
    const { lists } = tallJob('frameless', (project) => {
      project.context.kind === 'designedCabinet' && (project.context.settings.joinery.case = 'dado');
    });
    const dados = lists.byHand.filter((r) => r.label === 'B-C1' && r.what.startsWith('Dado'));
    expect(dados.map((r) => r.what)).toEqual(['Dado for the bottom', 'Dado for the fixed shelf', 'Dado for the top']);
    expect(dados.every((r) => r.size === '23/32" wide × 1/4" deep' && /^its lower side .* up from its bottom edge, from 0" to 23-25\/32" from its front edge$/.test(r.where))).toBe(true);
  });

  it('a job with nothing too long has no such list and no such step', () => {
    for (const project of [createBaseCabinetProject('faceFrame'), createShopCabinetProject()]) {
      const job = buildJob(project, shop);
      expect(buildLists(job, project, shop, L).byHand).toEqual([]);
      expect(buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).some((s) => /too long for the machine/.test(s))).toBe(false);
      expect(job.plan.parts.every((p) => p.steps.every((s) => !/\((router|drilled)/.test(s.label)))).toBe(true);
    }
  });

  it('a door taller than the machine stays a blocking warning: a front cannot be made by hand', () => {
    const { job } = tallJob('frameless', (project) => applyCabinetLayout(project, cabinetsOf(project).find((c) => c.form === 'tall')!, 'doors'));
    const door = job.parts.find((p) => p.tag === 'B')!;
    expect(door.size.height).toBeGreaterThan(area.height);
    expect(job.plan.parts.find((p) => p.partId === door.id)!.cutOut).toBe('cnc');
    expect(job.plan.warnings.some((w) => BLOCKING.includes(w.code))).toBe(true);
  });
});
