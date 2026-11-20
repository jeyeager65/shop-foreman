// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DIVIDER_DADO, TALL_TRAY_WALL, cabinetsOf, createObstacle, createOrganizer, deriveCabinetParts, deriveUnderSink, organizerName, partBox } from '@/design';
import { jigItems } from '@/jigs/catalog';
import { CADDY, caddyParts, caddyProblems, insertFiles } from '@/jigs/drawerInserts';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CabinetInside, CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: more for base cabinets. A narrow pull-out, vertical dividers, things side by side, a caddy. */
const shop = createStarterShop();
const cabinet = (inside: Partial<CabinetInside>, width = '36"') => {
  const project = createBaseCabinetProject('frameless', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len(width);
  stored.adjustableShelves = 0;
  stored.inside = { obstacles: [], organizers: [], ...inside };
  return project;
};
const built = (project: ReturnType<typeof cabinet>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
const named = (parts: Part[], name: string) => {
  const part = parts.find((p) => p.name === name);
  if (!part) throw new Error(`No part named ${name}: ${parts.map((p) => p.name).join('; ')}`);
  return part;
};
const make = (kind: Organizer['kind'], more: Partial<Organizer> = {}, others: Organizer[] = []): Organizer => ({ ...createOrganizer(kind, others), ...more });
const noTwoInOnePlace = (parts: Part[], allowed = 0.01) => {
  for (const a of parts) for (const b of parts) {
    if (a === b) continue;
    const [x, y] = [partBox(a), partBox(b)];
    expect(Math.min(...[0, 1, 2].map((k) => Math.min(x.max[k]!, y.max[k]!) - Math.max(x.min[k]!, y.min[k]!))), `${a.name} and ${b.name}`).toBeLessThanOrEqual(allowed);
  }
};

describe('a narrow pull-out', () => {
  it('starts 6" wide with 8" walls, on a frame of its own on the floor', () => {
    const o = make('narrow');
    expect(o).toMatchObject({ id: 'narrow', kind: 'narrow', width: len('6"') });
    expect(organizerName(o)).toBe('Narrow pull-out');
    const build = built(cabinet({ organizers: [o] }));
    expect(build.trays[0]).toMatchObject({ name: 'Narrow pull-out', height: TALL_TRAY_WALL });
    expect(build.trays[0]!.width).toBeCloseTo(len('6"').mm, 6);
    expect(build.parts.filter((p) => p.id.includes('/sink-narrow-frame/')).map((p) => p.name)).toEqual(['Narrow pull-out frame, left standard', 'Narrow pull-out frame, right standard', 'Narrow pull-out frame, front rail', 'Narrow pull-out frame, back rail']);
  });

  it('is as wide and as tall as asked, and says so when it is too narrow or past the door opening', () => {
    const build = built(cabinet({ organizers: [make('narrow', { width: len('9"'), wall: len('5"') })] }));
    expect(build.trays[0]).toMatchObject({ height: len('5"').mm });
    expect(build.trays[0]!.width).toBeCloseTo(len('9"').mm, 6);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('narrow', { width: len('2"') })] }), shop)).toThrow(/narrow pull-out is at least \d+ mm wide/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('narrow', { fromLeft: len('31"') })] }), shop)).toThrow(/does not fit where it stands.*make it narrower/);
  });
});

describe('vertical dividers', () => {
  it('are thin boards on edge in dados in a base and a top, the outer two at the ends', () => {
    const o = make('dividers');
    expect(o).toMatchObject({ id: 'dividers', count: 4, height: len('14"') });
    const project = cabinet({ organizers: [o] });
    const build = built(project);
    const parts = build.parts.filter((p) => p.id.includes('/sink-dividers/'));
    expect(parts.map((p) => p.name)).toEqual(['Dividers, base', 'Dividers, top', 'Dividers, board 1', 'Dividers, board 2', 'Dividers, board 3', 'Dividers, board 4']);
    const [base, top] = [named(parts, 'Dividers, base'), named(parts, 'Dividers, top')];
    expect(base.features.filter((f) => f.kind === 'dado')).toHaveLength(4);
    expect(top.features).toEqual(base.features);
    const [b, tp] = [partBox(base), partBox(top)];
    // The rack is as tall as asked, the base on the cabinet's floor.
    const floor = partBox(named(deriveCabinetParts(project, shop), 'Bottom')).max[1]!;
    expect(b.min[1]).toBeCloseTo(floor, 6);
    expect(tp.max[1]! - b.min[1]!).toBeCloseTo(len('14"').mm, 6);
    // Each board reaches into both dados, and the outer two stand at the rack's ends.
    const boards = parts.filter((p) => p.name.includes('board')).map(partBox);
    for (const board of boards) {
      expect(b.max[1]! - board.min[1]!).toBeCloseTo(DIVIDER_DADO, 6);
      expect(board.max[1]! - tp.min[1]!).toBeCloseTo(DIVIDER_DADO, 6);
    }
    expect(boards[0]!.min[0]).toBeCloseTo(b.min[0]!, 6);
    expect(boards.at(-1)!.max[0]).toBeCloseTo(b.max[0]!, 6);
    // Evenly spaced.
    const gaps = boards.slice(1).map((x, i) => x.min[0]! - boards[i]!.min[0]!);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 6);
    // Nothing in one place but the boards in their dados.
    noTwoInOnePlace(parts, DIVIDER_DADO + 0.01);
    // No slides: nothing rolls.
    expect(build.slides).toBeUndefined();
  });

  it('say what cannot be made', () => {
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('dividers', { count: 1 })] }), shop)).toThrow(/between 2 and 16 boards/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('dividers', { height: len('4"') })] }), shop)).toThrow(/at least 6" tall/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('dividers', { height: len('40"') })] }), shop)).toThrow(/do not fit under the top/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('dividers', { fromLeft: len('20"'), width: len('20"') })] }), shop)).toThrow(/do not fit: 4 boards need a rack/);
    expect(() => deriveCabinetParts(cabinet({ obstacles: [createObstacle('trap')], organizers: [make('dividers')] }), shop)).toThrow(/The trap is where the dividers would stand/);
  });
});

describe('side by side', () => {
  it('a trash pull-out at the left, dividers in the middle and a narrow pull-out at the right stand in one cabinet', () => {
    const project = cabinet({
      organizers: [make('pullOut'), make('dividers', { fromLeft: len('15"'), width: len('9"') }), make('narrow', { fromLeft: len('25"') })],
    });
    const build = built(project);
    expect(build.trays.map((t) => t.name)).toEqual(['Trash pull-out', 'Narrow pull-out']);
    expect(build.slides!.lengths.reduce((n, l) => n + l.pairs, 0)).toBe(2);
    // A tray's walls stand a quarter inch in each other's rabbets and grooves.
    noTwoInOnePlace(build.parts, 6.36);
    const job = buildJob(project, shop);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ');
    expect(text).toContain('The narrow pull-out: glue and brad its tray');
    expect(text).toContain('The dividers: on the bench');
    expect(text).toContain('The trash pull-out: glue and brad its tray');
  });

  it('two in the same place are refused, and a tray from side to side goes over what stands on the floor', () => {
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('pullOut'), make('narrow')] }), shop)).toThrow(/narrow pull-out and the trash pull-out would stand in the same place: move one of them to one side/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('narrow', { fromLeft: len('25"') }), { id: 'tray-bottom', kind: 'tray' }] }), shop)).toThrow(/would stand in the same place|no room for/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [make('narrow', { fromLeft: len('25"') }), { id: 'shelf', kind: 'shelf', up: len('12"') }] }), shop)).not.toThrow();
  });
});

describe('a caddy that lifts out', () => {
  const profile = createStarterShopProfile();
  const stock = profile.materialCatalog.find((m) => m.measuredThickness.mm > 10 && m.measuredThickness.mm < 15)!;
  const t = stock.measuredThickness.mm;
  const c = { length: 350, width: 220, height: 120 };

  it('is an open box with a middle board that stands over its sides and has a hand hole', () => {
    const parts = caddyParts(c, stock.id, t);
    expect(parts.map((p) => p.name)).toEqual(['Caddy, side 1', 'Caddy, side 2', 'Caddy, end 1', 'Caddy, end 2', 'Caddy, bottom', 'Caddy, middle board']);
    const middle = named(parts, 'Caddy, middle board');
    expect(partBox(middle).max[1]).toBeCloseTo(c.height + CADDY.over, 6);
    const hole = middle.features.find((f) => f.kind === 'cutout' && f.inside) as { outline: { x: number; y: number }[] };
    const xs = hole.outline.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(CADDY.hole.width);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(middle.size.width / 2, 6);
    // Outside it is as long, as wide and (its sides) as high as asked.
    const boxes = parts.filter((p) => p !== middle).map(partBox);
    const span = (k: number) => Math.max(...boxes.map((b) => b.max[k]!)) - Math.min(...boxes.map((b) => b.min[k]!));
    expect([span(0), span(1), span(2)].map((v) => Math.round(v * 100) / 100)).toEqual([c.length, c.height, c.width]);
    noTwoInOnePlace(parts);
  });

  it('says what cannot be made, and is on the jigs page with G-code', () => {
    expect(caddyProblems(c, t)).toEqual([]);
    expect(caddyProblems({ ...c, length: 150 }, t)[0]).toMatch(/too short for a hand hole/);
    expect(caddyProblems({ ...c, width: 80 }, t)[0]).toMatch(/too narrow/);
    const item = jigItems(profile).find((i) => i.id === 'caddy')!;
    expect(item.problems(item.defaults)).toEqual([]);
    expect(item.gcode!(item.defaults, 1, profile.activeMachineId).length).toBeGreaterThan(0);
    expect(insertFiles(caddyParts(c, stock.id, t), 'caddy', profile, profile.activeMachineId)[0]!.name).toMatch(/^caddy.*\.gcode$/);
  });
});
