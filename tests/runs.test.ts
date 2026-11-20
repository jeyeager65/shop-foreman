// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computed, reactive } from 'vue';
import { addToRun, cabinetsOf, createRun, deleteRun, deriveCabinetParts, removeFromRun, rowOfCabinets, runCabinets, runFit, runOf, runSides, runWidth, setOwnSettings } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { activeMachine } from '@/plan';
import { addCabinet, addTallCabinet, addWallCabinet, copyCabinet, createBaseCabinetProject, createShopWallProject, deleteCabinet, moveCabinet } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 4: runs. Cabinets side by side with a shared depth, height and toe kick, and sides that follow from where each stands. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();
const contextOf = (project: Project) => project.context as CasesContext;
const byId = (project: Project, id: string) => cabinetsOf(project).find((c) => c.id === id)!;
/** The shop wall's three cabinets in one run. */
function wallRun() {
  const project = createShopWallProject();
  const run = createRun(project, ['cabinet-1', 'cabinet-2', 'cabinet-3'], 'Bench');
  return { project, run };
}

describe('a run', () => {
  it('is stored beside the cabinets: its name, its cabinets in list order, its ends and what they share', () => {
    const { project, run } = wallRun();
    expect(contextOf(project).runs).toEqual([run]);
    expect(run).toEqual({
      id: 'run-1',
      name: 'Bench',
      cabinetIds: ['cabinet-1', 'cabinet-2', 'cabinet-3'],
      ends: { left: 'open', right: 'open' },
      shared: { depth: len('22-1/2"'), toeKick: { height: len('4-1/2"'), depth: len('3"'), off: true }, heights: { base: len('30"') } },
    });
    expect(cabinetsOf(project).map((c) => c.runId)).toEqual(['run-1', 'run-1', 'run-1']);
    expect(L(runWidth(contextOf(project), run))).toBe('78"');
    // The shared values are copies: the project's toe kick is its own still.
    expect(run.shared.toeKick).not.toBe(contextOf(project).settings.toeKick);
    // A project without runs has an empty list.
    expect(contextOf(createBaseCabinetProject('frameless')).runs).toEqual([]);
  });

  it('holds cabinets on the floor or cabinets on the wall, not both, and a cabinet is in one run', () => {
    const project = createBaseCabinetProject('frameless');
    const tall = addTallCabinet(project, { name: 'Tall' });
    const upper = addWallCabinet(project, { name: 'Upper' });
    const floor = createRun(project, ['cabinet-1', tall.id]);
    expect(() => addToRun(project, floor.id, upper.id)).toThrow(/not both/);
    expect(() => createRun(project, ['cabinet-1', upper.id])).toThrow(/not both/);
    const wall = createRun(project, [upper.id]);
    expect([floor.name, wall.name]).toEqual(['Run 1', 'Wall run 2']);
    // Into another run: out of the first. A run left empty is gone.
    const second = createRun(project, [tall.id]);
    expect(contextOf(project).runs.map((r) => [r.id, r.cabinetIds])).toEqual([
      ['run-1', ['cabinet-1']],
      ['run-2', [upper.id]],
      [second.id, [tall.id]],
    ]);
    addToRun(project, 'run-1', tall.id);
    expect(contextOf(project).runs.map((r) => r.id)).toEqual(['run-1', 'run-2']);
  });
});

describe('what a run shares', () => {
  it('the depth, the height and the toe kick: changed on any of its cabinets, changed for all', () => {
    const { project, run } = wallRun();
    const [a, b, c] = cabinetsOf(project);
    b!.size.depth = len('24"');
    c!.size.height = len('32"');
    a!.toeKick.off = false;
    a!.toeKick.height = len('4"');
    expect(cabinetsOf(project).map((x) => [L(x.size.depth.mm), L(x.size.height.mm), x.toeKick.off, L(x.toeKick.height.mm)])).toEqual(Array(3).fill(['24"', '32"', false, '4"']));
    expect([run.shared.depth, run.shared.heights.base]).toEqual([len('24"'), len('32"')]);
    // The width is each cabinet's own.
    b!.size.width = len('36"');
    expect(cabinetsOf(project).map((x) => L(x.size.width.mm))).toEqual(['24"', '36"', '24"']);
    // The project's toe kick is not the run's: a cabinet outside the run keeps following the project.
    const loose = addCabinet(project, { name: 'Loose', width: len('18"'), layout: 'doors' });
    expect([loose.toeKick.off, loose.toeKick.height]).toEqual([true, len('4-1/2"')]);
    // And the parts follow: every case in the run is 24" deep and 32" tall.
    const sides = deriveCabinetParts(project, shop).filter((p) => p.id.endsWith('/side-left'));
    expect(sides.slice(0, 3).map((p) => L(p.size.height))).toEqual(['32"', '32"', '32"']);
    expect(L(sides[3]!.size.height)).toBe('30"');
  });

  it('each cabinet keeps its own values for when it leaves the run', () => {
    const { project } = wallRun();
    byId(project, 'cabinet-2').size.depth = len('24"');
    byId(project, 'cabinet-2').size.height = len('36"');
    const stored = contextOf(project).pieces.find((c) => c.id === 'cabinet-2')!;
    expect([stored.size.depth, stored.size.height]).toEqual([len('22-1/2"'), len('30"')]);
    removeFromRun(project, 'cabinet-2');
    const out = byId(project, 'cabinet-2');
    expect([out.runId, L(out.size.depth.mm), L(out.size.height.mm), out.toeKick.off]).toEqual([undefined, '22-1/2"', '30"', true]);
    expect(byId(project, 'cabinet-1').size.height).toEqual(len('36"'));
    // Its own values are written to it again.
    out.size.height = len('28"');
    expect(stored.size.height).toEqual(len('28"'));
  });

  it('has a height for each form: tall cabinets share theirs, base cabinets theirs', () => {
    const project = createBaseCabinetProject('frameless');
    const tall = addTallCabinet(project, { name: 'Tall' });
    const base = addCabinet(project, { name: 'Base 2', width: len('18"'), layout: 'doors' });
    const run = createRun(project, ['cabinet-1', tall.id, base.id]);
    expect(run.shared.heights).toEqual({ base: len('34-1/2"'), tall: len('84"') });
    base.size.height = len('36"');
    expect(cabinetsOf(project).map((c) => L(c.size.height.mm))).toEqual(['36"', '84"', '36"']);
    // One depth for all of them: the first cabinet's.
    expect(cabinetsOf(project).map((c) => L(c.size.depth.mm))).toEqual(['22-1/2"', '22-1/2"', '22-1/2"']);
    // A tall cabinet that joins later brings the tall height if the run has none.
    const other = createBaseCabinetProject('frameless');
    const only = createRun(other, ['cabinet-1']);
    const late = addTallCabinet(other, { name: 'Tall', height: len('90"') });
    addToRun(other, only.id, late.id);
    expect(only.shared.heights).toEqual({ base: len('34-1/2"'), tall: len('90"') });
  });

  it('a cabinet\'s own settings stay its own in a run, but for the toe kick, which is the run\'s', () => {
    const { project, run } = wallRun();
    setOwnSettings(project, 'cabinet-2', 'construction', true);
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    const b = byId(project, 'cabinet-2');
    b.construction = 'frameless';
    b.joinery.case = 'dado';
    b.toeKick.off = false;
    expect([byId(project, 'cabinet-1').construction, byId(project, 'cabinet-1').joinery.case]).toEqual(['shop', 'throughScrews']);
    expect(run.shared.toeKick.off).toBe(false);
    expect(byId(project, 'cabinet-3').toeKick.off).toBe(false);
  });

  it('a cabinet in a run is made once, whatever quantity it has of its own', () => {
    const project = createShopWallProject();
    byId(project, 'cabinet-3').quantity = 3;
    expect(deriveCabinetParts(project, shop).filter((p) => p.name === 'Left side')).toHaveLength(5);
    createRun(project, ['cabinet-2', 'cabinet-3']);
    expect(byId(project, 'cabinet-3').quantity).toBe(1);
    expect(deriveCabinetParts(project, shop).filter((p) => p.name === 'Left side')).toHaveLength(3);
    removeFromRun(project, 'cabinet-3');
    expect(byId(project, 'cabinet-3').quantity).toBe(3);
  });
});

describe('which sides show in a run', () => {
  it('a side against a neighbour is hidden; an end shows unless it is against a wall', () => {
    const { project, run } = wallRun();
    const sides = () => cabinetsOf(project).map((c) => `${c.sides.left}/${c.sides.right}`);
    expect(sides()).toEqual(['exposed/hidden', 'hidden/hidden', 'hidden/exposed']);
    run.ends.left = 'wall';
    expect(sides()).toEqual(['hidden/hidden', 'hidden/hidden', 'hidden/exposed']);
    run.ends.right = 'wall';
    expect(sides()).toEqual(Array(3).fill('hidden/hidden'));
    expect([...runSides(contextOf(project), run).keys()]).toEqual(['cabinet-1', 'cabinet-2', 'cabinet-3']);
    // What each has of its own is kept, and comes back out of the run.
    expect(contextOf(project).pieces.every((c) => c.sides.left === 'exposed' && c.sides.right === 'exposed')).toBe(true);
    removeFromRun(project, 'cabinet-1');
    expect(sides()).toEqual(['exposed/exposed', 'hidden/hidden', 'hidden/hidden']);
  });

  it('a tall cabinet beside a base one shows the upper part of its side: it counts as showing', () => {
    const project = createBaseCabinetProject('frameless');
    const tall = addTallCabinet(project, { name: 'Tall' });
    const right = addCabinet(project, { name: 'Right', width: len('18"'), layout: 'doors' });
    const run = createRun(project, ['cabinet-1', tall.id, right.id]);
    run.ends = { left: 'wall', right: 'wall' };
    expect(cabinetsOf(project).map((c) => [c.form, c.sides.left, c.sides.right])).toEqual([
      ['base', 'hidden', 'hidden'],
      ['tall', 'exposed', 'exposed'],
      ['base', 'hidden', 'hidden'],
    ]);
    // Two tall cabinets side by side hide each other's sides.
    const twin = copyCabinet(project, tall.id);
    expect(byId(project, twin.id).runId).toBe(run.id);
    expect(cabinetsOf(project).map((c) => `${c.sides.left}/${c.sides.right}`)).toEqual(['hidden/hidden', 'exposed/hidden', 'hidden/exposed', 'hidden/hidden']);
  });

  it('decides where a face frame cabinet takes the pocket holes that hold its frame', () => {
    const project = createBaseCabinetProject('faceFrame');
    const second = copyCabinet(project, 'cabinet-1');
    const pockets = (id: string, face: 'A' | 'B') =>
      deriveCabinetParts(project, shop)
        .find((p) => p.id === `${id}/side-left`)!
        .features.filter((f) => f.id.startsWith('frame-pocket') && f.face === face).length;
    // On their own both sides show: the frame's pockets are in the inside face.
    expect([pockets(second.id, 'A') > 0, pockets(second.id, 'B')]).toEqual([true, 0]);
    createRun(project, ['cabinet-1', second.id]);
    // In the run the second cabinet's left side is against the first: the pockets move to its outside face.
    expect([pockets(second.id, 'A'), pockets(second.id, 'B') > 0]).toEqual([0, true]);
    expect([pockets('cabinet-1', 'A') > 0, pockets('cabinet-1', 'B')]).toEqual([true, 0]);
  });
});

describe('a run and the cabinet list', () => {
  it('stands left to right in the order of the list: moving a cabinet moves it in the run', () => {
    const { project, run } = wallRun();
    moveCabinet(project, 'cabinet-3', -1);
    expect(run.cabinetIds).toEqual(['cabinet-1', 'cabinet-3', 'cabinet-2']);
    expect(runCabinets(contextOf(project), run).map((c) => c.name)).toEqual(['Drawers, left', 'Drawers, right', 'Drawer over doors']);
    expect(byId(project, 'cabinet-2').sides).toEqual({ left: 'hidden', right: 'exposed' });
  });

  it('a cabinet put into a run stands at its right-hand end, and a new run gathers its cabinets in the list', () => {
    const project = createShopWallProject();
    const loose = addCabinet(project, { name: 'Loose', width: len('18"'), layout: 'doors' });
    const run = createRun(project, ['cabinet-1', 'cabinet-3']);
    expect(cabinetsOf(project).map((c) => c.id)).toEqual(['cabinet-1', 'cabinet-3', 'cabinet-2', loose.id]);
    addToRun(project, run.id, loose.id);
    expect(cabinetsOf(project).map((c) => c.id)).toEqual(['cabinet-1', 'cabinet-3', loose.id, 'cabinet-2']);
    expect(run.cabinetIds).toEqual(['cabinet-1', 'cabinet-3', loose.id]);
  });

  it('a copy stands beside its original in the run; a deleted cabinet leaves it; a dissolved run frees them all', () => {
    const { project, run } = wallRun();
    const copy = copyCabinet(project, 'cabinet-1');
    expect(run.cabinetIds).toEqual(['cabinet-1', copy.id, 'cabinet-2', 'cabinet-3']);
    expect(copy.size.height).toBe(run.shared.heights.base);
    deleteCabinet(project, 'cabinet-2');
    expect(run.cabinetIds).toEqual(['cabinet-1', copy.id, 'cabinet-3']);
    deleteRun(project, run.id);
    expect(contextOf(project).runs).toEqual([]);
    expect(cabinetsOf(project).every((c) => c.runId === undefined && c.sides.left === 'exposed')).toBe(true);
    expect(runOf(contextOf(project), 'cabinet-1')).toBeUndefined();
  });

  it('works on a reactive project, builds as a job, and survives export and import', () => {
    const project = reactive(createShopWallProject()) as Project;
    const heights = computed(() => cabinetsOf(project).map((c) => `${L(c.size.height.mm)} ${c.sides.right}`));
    expect(heights.value).toEqual(['30" exposed', '30" exposed', '30" exposed']);
    const run = createRun(project, ['cabinet-1', 'cabinet-2', 'cabinet-3']);
    cabinetsOf(project)[1]!.size.height = len('32"');
    run.ends.right = 'wall';
    expect(heights.value).toEqual(['32" hidden', '32" hidden', '32" hidden']);
    const plain = JSON.parse(JSON.stringify(project)) as Project;
    const job = buildJob(plain, shop);
    expect(new Set([...job.cabinetParts, ...job.parts].map((p) => p.id)).size).toBe(job.cabinetParts.length + job.parts.length);
    expect(parseProjectFile(serializeProjectFile(exportProject(plain, shop))).project).toEqual(plain);
  });
});

describe('a run with a length to fill', () => {
  const fitOf = (project: Project) => runFit(contextOf(project), contextOf(project).runs[0]!);
  const fillers = (project: Project) => deriveCabinetParts(project, shop).filter((p) => p.role === 'filler');

  it('has nothing to fill without a length, or when its cabinets fill it exactly', () => {
    const { project, run } = wallRun();
    expect(fitOf(project)).toBeUndefined();
    run.ends.left = 'wall';
    expect(fillers(project)).toEqual([]);
    run.length = len('78"');
    expect([Math.abs(fitOf(project)!.leftOver) < 1e-6, fitOf(project)!.fillers]).toEqual([true, []]);
    expect(fillers(project)).toEqual([]);
  });

  it('takes up what is left with a filler at the end against a wall, as tall as the cabinet\'s front and flush with it', () => {
    const { project, run } = wallRun();
    run.ends.left = 'wall';
    run.length = len('84"');
    const fit = fitOf(project)!;
    expect([L(fit.length), L(fit.width), L(fit.leftOver)]).toEqual(['84"', '78"', '6"']);
    expect(fit.fillers.map((f) => [f.end, f.cabinetId, L(f.width)])).toEqual([['left', 'cabinet-1', '6"']]);
    const [strip] = fillers(project);
    expect([strip!.id, strip!.name, strip!.designObjectId, strip!.tag, L(strip!.size.width), L(strip!.size.height), strip!.materialId, strip!.grain]).toEqual([
      'cabinet-1/filler-left',
      'Filler, left',
      'cabinet-1',
      'A',
      '6"',
      '30"',
      'plywood-3-4',
      'height',
    ]);
    // It stands left of the cabinet, its face flush with the case front.
    expect(strip!.placement!.origin.map((v) => L(v))).toEqual(['-6"', '0"', '0"']);
    // It is cut on the saw and is on the cut list.
    const job = buildJob(project, shop);
    expect(job.plan.parts.find((p) => p.partId === strip!.id)!.cutOut).toBe('tableSaw');
    expect(job.plan.blanks.flatMap((b) => b.partIds)).not.toContain(strip!.id);
  });

  it('shares what is left between two wall ends, and leaves it where no end is against a wall', () => {
    const { project, run } = wallRun();
    run.length = len('81"');
    expect([L(fitOf(project)!.leftOver), fitOf(project)!.fillers]).toEqual(['3"', []]);
    expect(fillers(project)).toEqual([]);
    run.ends = { left: 'wall', right: 'wall' };
    expect(fillers(project).map((p) => [p.id, L(p.size.width), p.tag, L(p.placement!.origin[0])])).toEqual([
      ['cabinet-1/filler-left', '1-1/2"', 'A', '-1-1/2"'],
      ['cabinet-3/filler-right', '1-1/2"', 'C', '24"'],
    ]);
    // A run of one cabinet between two walls has both of them.
    const one = createBaseCabinetProject('frameless');
    const alone = createRun(one, ['cabinet-1']);
    alone.ends = { left: 'wall', right: 'wall' };
    alone.length = len('26"');
    expect(deriveCabinetParts(one, shop).filter((p) => p.role === 'filler').map((p) => [p.name, L(p.size.width)])).toEqual([
      ['Filler, left', '1"'],
      ['Filler, right', '1"'],
    ]);
  });

  it('behind a face frame the filler is the frame\'s material, flush with the frame, from the top of the toe kick up', () => {
    const project = createBaseCabinetProject('faceFrame');
    const run = createRun(project, ['cabinet-1']);
    run.ends.right = 'wall';
    run.length = len('27"');
    const [strip] = fillers(project);
    expect([strip!.name, strip!.materialId, L(strip!.size.width), L(strip!.size.height)]).toEqual(['Filler, right', 'solid-wood-3-4', '3"', '30"']);
    expect([L(strip!.placement!.origin[0]), L(strip!.placement!.origin[1]), strip!.placement!.origin[2]]).toEqual(['24"', '4-1/2"', strip!.size.thickness]);
  });

  it('a run longer than its length has no fillers: it is too long by what is left over, negative', () => {
    const { project, run } = wallRun();
    run.ends = { left: 'wall', right: 'wall' };
    run.length = len('72"');
    expect([L(-fitOf(project)!.leftOver), fitOf(project)!.fillers]).toEqual(['6"', []]);
    expect(fillers(project)).toEqual([]);
    // Narrowing a cabinet brings it back in.
    byId(project, 'cabinet-2').size.width = len('24"');
    expect(fitOf(project)!.leftOver).toBeCloseTo(0, 6);
  });
});

describe('building a run', () => {
  const listsOf = (project: Project) => {
    const job = buildJob(project, shop);
    return { job, lists: buildLists(job, project, shop, L), sections: buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)) };
  };

  it('joins neighbours with four screws a join, through their sides', () => {
    const { project } = wallRun();
    const rows = listsOf(project).lists.hardware.filter((h) => h.group === 'Runs');
    expect(rows.map((h) => [h.item, h.quantity])).toEqual([['#8 × 1-1/4" wood screws', 8]]);
    expect(rows[0]!.note).toMatch(/through one side into the next/);
    // No run, no joining screws; a run of one has no join.
    expect(listsOf(createShopWallProject()).lists.hardware.some((h) => h.group === 'Runs')).toBe(false);
    const one = createBaseCabinetProject('frameless');
    createRun(one, ['cabinet-1']);
    expect(listsOf(one).lists.hardware.some((h) => h.group === 'Runs')).toBe(false);
  });

  it('behind face frames the screws go through the stiles', () => {
    const project = createBaseCabinetProject('faceFrame');
    const second = copyCabinet(project, 'cabinet-1');
    createRun(project, ['cabinet-1', second.id]);
    const rows = listsOf(project).lists.hardware.filter((h) => h.group === 'Runs');
    expect(rows.map((h) => [h.item, h.quantity])).toEqual([['#8 × 2-1/2" trim screws', 4]]);
    expect(rows[0]!.note).toMatch(/stile/);
  });

  it('has a checklist section for the run after its cabinets\': set, join, fit the fillers, fasten', () => {
    const { project, run } = wallRun();
    run.ends.left = 'wall';
    run.length = len('84"');
    const { sections } = listsOf(project);
    expect(sections.slice(-4).map((s) => s.title)).toEqual(['A · Drawers, left', 'B · Drawer over doors', 'C · Drawers, right', 'Run: Bench']);
    expect(sections.at(-1)!.steps.map((s) => s.text)).toEqual([
      'Set the cabinets in place left to right: A · Drawers, left, B · Drawer over doors, C · Drawers, right. Level them, shimming under them, with their tops and fronts in line.',
      'Clamp each pair together, fronts flush, and screw them to each other through their sides: 4 screws a join.',
      'Scribe the filler strip to the wall at the left end and fasten it to the end cabinet, its face flush with the front.',
      'Fasten the run to the wall through the back of each cabinet, near the top, into the studs.',
    ]);
    // A project without runs ends with its cabinets, as before.
    expect(listsOf(createShopWallProject()).sections.at(-1)!.title).toBe('C · Drawers, right');
  });

  it('a run of wall cabinets is hung, level with each other, and joined', () => {
    const project = createBaseCabinetProject('frameless');
    const first = addWallCabinet(project, { name: 'Upper 1' });
    const second = copyCabinet(project, first.id);
    createRun(project, [first.id, second.id], 'Uppers');
    const { sections, lists } = listsOf(project);
    const steps = sections.at(-1)!.steps.map((s) => s.text);
    expect(sections.at(-1)!.title).toBe('Run: Uppers');
    expect(steps[0]).toMatch(/^Hang the cabinets left to right: B · Upper 1, C · Upper 1 copy\./);
    expect(steps).toHaveLength(2);
    expect(lists.hardware.find((h) => h.group === 'Runs')!.quantity).toBe(4);
    // Each still hangs on its own rails: eight screws into the studs.
    expect(lists.hardware.find((h) => h.group === 'Hanging')!.quantity).toBe(8);
  });
});

describe('a run in the picture of the whole project', () => {
  it('stands as built: its cabinets side by side, with room for its fillers, the rest a gap apart', () => {
    const at = rowOfCabinets(
      [
        { id: 'loose', width: 500 },
        { id: 'a', width: 600, runId: 'r', fillerLeft: 50 },
        { id: 'other', width: 400 },
        { id: 'b', width: 700, runId: 'r', fillerRight: 30 },
        { id: 'up', width: 800, offFloor: 1300, runId: 'w' },
        { id: 'up2', width: 800, offFloor: 1300, runId: 'w' },
      ],
      100,
    );
    expect(Object.fromEntries(at)).toEqual({
      loose: [0, 0, 0],
      // The run starts where its first cabinet comes in the list, after its left filler.
      a: [650, 0, 0],
      b: [1250, 0, 0],
      // What follows the run stands past its right filler.
      other: [2080, 0, 0],
      up: [2580, 1300, 0],
      up2: [3380, 1300, 0],
    });
  });
});
