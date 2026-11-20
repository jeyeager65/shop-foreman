// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KICK_ROW_INSET, cabinetsOf, createRun, deriveCabinetParts, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { Feature, Part } from '@/model';
import { activeMachine } from '@/plan';
import { addCabinet, createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** The toe kick board in front of the sides: one a cabinet, or one across a run. */
type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
const pockets = (features: Feature[]) => features.filter((f): f is PocketHole => f.kind === 'pocketHole');
const build = (board: 'inFront' | 'acrossRun' | undefined, screwed = false, style: 'frameless' | 'faceFrame' = 'frameless') => {
  const shop = createStarterShop();
  const project = createBaseCabinetProject(style, 'doors');
  const cabinet = cabinetsOf(project)[0]!;
  if (board) cabinet.toeKick.board = board;
  if (screwed) cabinet.toeKick.joint = 'pocketScrews';
  const parts = deriveCabinetParts(project, shop);
  const part = (key: string) => parts.find((p) => p.id === `cabinet-1/${key}`)!;
  return { shop, project, parts, part, cabinet: cabinetsOf(project)[0]! };
};
/** How far back from its front edge a left side's toe-kick notch is cut. */
const notchOf = (side: Part) => {
  const outline = side.features.find((f) => f.kind === 'cutout')!;
  if (outline.kind !== 'cutout') throw new Error('no outline');
  return Math.min(...outline.outline.filter((p) => p.y === 0).map((p) => p.x));
};

describe('the toe kick board in front of the sides', () => {
  for (const style of ['frameless', 'faceFrame'] as const) {
    it(`${style}: is as wide as the cabinet and covers the sides' edges; their notches are deeper by its thickness`, () => {
      const between = build(undefined, false, style);
      const ahead = build('inFront', false, style);
      const [was, kick] = [between.part('toe-kick'), ahead.part('toe-kick')];
      const t = kick.size.thickness;
      expect(was.size.width).toBeCloseTo(ahead.cabinet.size.width.mm - 2 * t, 6);
      expect(kick.size.width).toBeCloseTo(ahead.cabinet.size.width.mm, 6);
      expect(kick.size.height).toBeCloseTo(was.size.height, 6);
      // Its face is where the toe space ends either way: the toe space is as deep as it was.
      expect(partBox(kick).max[2]).toBeCloseTo(partBox(was).max[2]!, 6);
      expect(partBox(kick).min[0]).toBeCloseTo(0, 6);
      expect(partBox(kick).max[0]).toBeCloseTo(ahead.cabinet.size.width.mm, 6);
      // The sides' notches are deeper by the board's thickness, so the board stands in front of their edges.
      expect(notchOf(ahead.part('side-left')) - notchOf(between.part('side-left'))).toBeCloseTo(t, 6);
      // By hand, nothing is cut in it or in the sides for it.
      expect(pockets(kick.features)).toEqual([]);
      expect(pockets(ahead.part('side-left').features).filter((h) => h.id.startsWith('kick-pocket'))).toEqual([]);
    });
  }

  it('pocket-screwed: the holes are in the sides, down in the toe space, the screws go forward into the board; the row up into the bottom stays', () => {
    const { part, project, shop } = build('inFront', true);
    const kick = part('toe-kick');
    const holes = pockets(kick.features);
    expect(holes.length).toBeGreaterThanOrEqual(2);
    expect(holes.every((h) => h.edge === 'y1' && h.face === 'B' && h.id.startsWith('bottom-pocket'))).toBe(true);
    // Under the bottom, which lies between the sides.
    const t = kick.size.thickness;
    expect(holes.every((h) => h.at > t + KICK_ROW_INSET && h.at < kick.size.width - t - KICK_ROW_INSET)).toBe(true);
    for (const [key, edge] of [['side-left', 'x0'], ['side-right', 'x1']] as const) {
      const mine = pockets(part(key).features).filter((h) => h.id.startsWith('kick-pocket'));
      expect(mine.length).toBe(2);
      // In the inside face, below the bottom, leaving through the front of the notch.
      expect(mine.every((h) => h.face === 'A' && h.edge === edge)).toBe(true);
      expect(mine.every((h) => h.at > 0 && h.at < kick.size.height)).toBe(true);
      expect(mine.every((h) => Math.abs(h.inset! - notchOf(part('side-left'))) < 1e-6)).toBe(true);
    }
    // The hardware list finds the board ahead of those screws, and the Kreg list says so.
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, (mm) => `${mm}`);
    const rows = lists.kreg.filter((r) => /side/.test(r.part) && r.into === 'Toe kick');
    expect(rows.map((r) => r.part).sort()).toEqual(['Left side', 'Right side']);
    expect(lists.kreg.filter((r) => r.part === 'Toe kick').map((r) => r.into)).toEqual(['Bottom']);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ');
    expect(text).toContain('forward into its back, and from its back up into the bottom');
    // Cut on the CNC in either style, nothing is left out.
    for (const method of ['cncAssisted', 'lowAngle3'] as const) {
      project.plan.pocketHoles = method;
      const cut = buildJob(project, shop);
      expect(cut.plan.warnings.filter((w) => w.code === 'unsupported'), method).toEqual([]);
    }
  });

  it('one board across a run: no cabinet has its own, and it is split at a join when longer than the stock', () => {
    const shop = createStarterShop();
    const project = createBaseCabinetProject('frameless', 'doors');
    addCabinet(project, { name: 'Second', width: len('30"'), layout: 'doors' });
    addCabinet(project, { name: 'Third', width: len('18"'), layout: 'doors' });
    createRun(project, cabinetsOf(project).map((c) => c.id));
    cabinetsOf(project)[0]!.toeKick.board = 'acrossRun';
    cabinetsOf(project)[0]!.toeKick.joint = 'pocketScrews';
    const cabinets = cabinetsOf(project);
    expect(cabinets.every((c) => c.toeKick.board === 'acrossRun')).toBe(true);
    const parts = deriveCabinetParts(project, shop);
    const boards = parts.filter((p) => p.role === 'toeKick');
    const total = cabinets.reduce((sum, c) => sum + c.size.width.mm, 0);
    expect(boards.map((p) => p.id)).toEqual(['cabinet-1/toe-kick-run']);
    expect(boards[0]!.name).toBe('Toe kick, across the run');
    expect(boards[0]!.size.width).toBeCloseTo(total, 6);
    // It goes on from the front once the run is set: nothing is cut in it, or in the sides for it.
    expect(parts.flatMap((p) => pockets(p.features)).filter((h) => /^(kick|bottom)-pocket/.test(h.id))).toEqual([]);
    // Every side is notched for a board in front of it.
    const lone = deriveCabinetParts(createBaseCabinetProject('frameless', 'doors'), shop).find((p) => p.id === 'cabinet-1/side-left')!;
    for (const c of cabinets) expect(notchOf(parts.find((p) => p.id === `${c.id}/side-left`)!) - notchOf(lone)).toBeCloseTo(boards[0]!.size.thickness, 6);
    const job = buildJob(project, shop);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ');
    expect(text).toContain('from the outside of the first cabinet to the outside of the last');
    // Stock 60" long: the first two cabinets share a board, the third has the next.
    project.plan.blank.stock = { width: len('24"'), height: len('60"') };
    const split = deriveCabinetParts(project, shop).filter((p) => p.role === 'toeKick');
    expect(split.map((p) => p.id)).toEqual(['cabinet-1/toe-kick-run', `${cabinets[2]!.id}/toe-kick-run`]);
    expect(split[0]!.size.width).toBeCloseTo(cabinets[0]!.size.width.mm + cabinets[1]!.size.width.mm, 6);
    expect(split[1]!.name).toBe('Toe kick');
  });

  it('a run with a filler strip at a wall: the board runs on under the strip to the wall', () => {
    const shop = createStarterShop();
    for (const end of ['left', 'right'] as const) {
      const project = createBaseCabinetProject('frameless', 'doors');
      addCabinet(project, { name: 'Second', width: len('30"'), layout: 'doors' });
      const run = createRun(project, cabinetsOf(project).map((c) => c.id));
      cabinetsOf(project)[0]!.toeKick.board = 'acrossRun';
      const cabinets = cabinetsOf(project);
      const total = cabinets.reduce((sum, c) => sum + c.size.width.mm, 0);
      // Against a wall at one end, with 2" more to fill than the cabinets take.
      run.ends[end] = 'wall';
      run.length = { mm: total + 50.8, unit: 'in' };
      const parts = deriveCabinetParts(project, shop);
      const strip = parts.find((p) => p.id.endsWith(`/filler-${end}`))!;
      expect(strip.size.width).toBeCloseTo(50.8, 6);
      const boards = parts.filter((p) => p.role === 'toeKick');
      expect(boards.map((p) => p.id)).toEqual(['cabinet-1/toe-kick-run']);
      expect(boards[0]!.size.width).toBeCloseTo(total + 50.8, 6);
      // It starts at the wall when the strip is at the left, at the first cabinet's outside when it is at the right.
      expect(boards[0]!.placement!.origin[0]).toBeCloseTo(end === 'left' ? -50.8 : 0, 6);
      const job = buildJob(project, shop);
      expect(buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join(' ')).toContain('It runs on under the filler strip to the wall');
    }
  });

  it('a cabinet in no run that asks for the board of a run gets its own, in front of its sides', () => {
    const { part, cabinet } = build('acrossRun', true);
    expect(part('toe-kick').size.width).toBeCloseTo(cabinet.size.width.mm, 6);
    expect(pockets(part('side-left').features).filter((h) => h.id.startsWith('kick-pocket')).length).toBe(2);
  });
});

describe('a board taller than the sides\' notches (a raised bottom, behind a face frame)', () => {
  const outlineOf = (part: Part) => {
    const cut = part.features.find((f) => f.kind === 'cutout')!;
    if (cut.kind !== 'cutout') throw new Error('no outline');
    return cut;
  };

  it('frameless: the board is as tall as the notches, a plain rectangle', () => {
    const cut = outlineOf(build('inFront').part('toe-kick'));
    expect(cut.outline).toHaveLength(4);
    expect(cut.dogBones).toBeUndefined();
  });

  it('face frame: it is notched round each side at its top corners, with dog-bones, and no longer runs into them', () => {
    const { part, cabinet } = build('inFront', true, 'faceFrame');
    const kick = part('toe-kick');
    const [t, W, H, low] = [kick.size.thickness, kick.size.width, kick.size.height, cabinet.toeKick.height.mm];
    expect(H).toBeGreaterThan(low + 1);
    const cut = outlineOf(kick);
    expect(cut.dogBones).toBe(true);
    const near = (a: { x: number; y: number }[], b: number[][]) => expect(a.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)])).toEqual(b.map((p) => p.map((v) => +v.toFixed(4))));
    near(cut.outline, [[0, 0], [W, 0], [W, low], [W - t, low], [W - t, H], [t, H], [t, low], [0, low]]);
    // The side's notch is as tall as the board's ends.
    const side = outlineOf(part('side-left')).outline;
    expect(Math.max(...side.filter((p) => p.x > 0 && p.x < 200 && p.y > 0).map((p) => p.y))).toBeCloseTo(low, 6);
    // The pocket screws up into the bottom are along the top edge, between the notches.
    for (const p of pockets(kick.features)) expect(p.at > t && p.at < W - t).toBe(true);
  });

  it('one board across a run is notched at every side it crosses, the two at a join as one', () => {
    const shop = createStarterShop();
    const project = createBaseCabinetProject('faceFrame', 'doors');
    addCabinet(project, { name: 'Second', width: len('18"'), layout: 'doors' });
    createRun(project, cabinetsOf(project).map((c) => c.id));
    for (const c of cabinetsOf(project)) c.toeKick.board = 'acrossRun';
    const board = deriveCabinetParts(project, shop).find((p) => p.id.includes('toe-kick-run'))!;
    const cut = outlineOf(board);
    expect(cut.dogBones).toBe(true);
    const [t, low, W1] = [board.size.thickness, cabinetsOf(project)[0]!.toeKick.height.mm, cabinetsOf(project)[0]!.size.width.mm];
    // Where the top edge drops to the notches' height: at the two ends, and one notch two sides wide at the join.
    const lows = cut.outline.filter((p) => Math.abs(p.y - low) < 1e-6).map((p) => +p.x.toFixed(3)).sort((a, b) => a - b);
    expect(lows).toEqual([0, t, W1 - t, W1 + t, board.size.width - t, board.size.width].map((v) => +v.toFixed(3)));
  });
});

describe('the corner of a side\'s toe-kick notch', () => {
  const dogBones = (part: Part) => {
    const cut = part.features.find((f) => f.kind === 'cutout')!;
    return cut.kind === 'cutout' && cut.dogBones === true;
  };

  it('gets a dog-bone where a board in front of the sides seats in it; between the sides it stays round', () => {
    for (const style of ['frameless', 'faceFrame'] as const) {
      expect([dogBones(build(undefined, false, style).part('side-left')), dogBones(build(undefined, false, style).part('side-right'))]).toEqual([false, false]);
      for (const board of ['inFront', 'acrossRun'] as const) {
        const { part } = build(board, false, style);
        expect([dogBones(part('side-left')), dogBones(part('side-right'))], `${style} ${board}`).toEqual([true, true]);
      }
    }
  });

});
