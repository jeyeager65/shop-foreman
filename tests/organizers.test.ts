// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TRAY_WALL, cabinetsOf, createOrganizer, createUnderSink, deriveCabinetParts, deriveUnderSink, organizerName, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import type { CabinetInside, CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: what stands inside a cabinet is a list, at heights the user sets, with or without a sink. */
const shop = createStarterShop();
const cabinet = (inside: CabinetInside, construction: 'faceFrame' | 'frameless' = 'frameless') => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('30"');
  stored.adjustableShelves = 0;
  stored.inside = inside;
  return project;
};
const plain = (organizers: Organizer[], mounting?: 'strips' | 'frame'): CabinetInside => ({ obstacles: [], organizers, ...(mounting ? { mounting } : {}) });
const built = (project: ReturnType<typeof cabinet>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
const named = (parts: Part[], name: string) => {
  const part = parts.find((p) => p.name === name);
  if (!part) throw new Error(`No part named ${name}: ${parts.map((p) => p.name).join('; ')}`);
  return part;
};
const floorOf = (project: ReturnType<typeof cabinet>) => partBox(named(deriveCabinetParts(project, shop), 'Bottom')).max[1]!;

describe('organizers as a list', () => {
  it('what a sink used to be given in one go is the same list: a tray on the floor and one thing 10" up', () => {
    expect(createUnderSink().organizers).toEqual([]);
    expect(createUnderSink({ bottomTray: true, upper: 'tray' }).organizers).toEqual([
      { id: 'tray-bottom', kind: 'tray' },
      { id: 'tray-upper', kind: 'tray', up: len('10"') },
    ]);
    expect(createUnderSink({ upper: 'sideTrays', mounting: 'frame' })).toMatchObject({ organizers: [{ id: 'shelf', kind: 'sideTrays', up: len('10"') }], mounting: 'frame' });
  });

  it('one more of a kind stands over the ones there are; its id names its parts', () => {
    const list: Organizer[] = [];
    for (const kind of ['tray', 'tray', 'tray', 'shelf', 'shelf'] as const) list.push(createOrganizer(kind, list));
    expect(list.map((o) => [o.id, o.up?.mm === undefined ? 'floor' : Math.round(o.up.mm / 25.4)])).toEqual([
      ['tray-bottom', 'floor'],
      ['tray-upper', 10],
      ['tray-3', 20],
      ['shelf', 30],
      ['shelf-2', 40],
    ]);
    expect(list.map(organizerName)).toEqual(['Bottom tray', 'Upper tray', 'Tray 3', 'Fixed shelf', 'Fixed shelf 2']);
    // With nothing there, a shelf starts 10" up.
    expect(createOrganizer('shelf').up).toEqual(len('10"'));
  });

  it('a cabinet with no sink takes them too: nothing is in the way, so nothing is notched', () => {
    const project = cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'tray-upper', kind: 'tray', up: len('8"') }, { id: 'shelf', kind: 'shelf', up: len('16"') }]));
    const build = built(project);
    expect(build.obstacles).toEqual([]);
    expect(build.trays.map((t) => [t.name, t.cutRound])).toEqual([
      ['Bottom tray', false],
      ['Upper tray', false],
    ]);
    expect(build.templates).toEqual([]);
    // Each stands where it was put: the upper tray's walls from 8" up, the shelf's top at 16".
    const floor = floorOf(project);
    expect(partBox(named(build.parts, 'Upper tray, left side')).min[1]! - floor).toBeCloseTo(len('8"').mm, 6);
    expect(partBox(named(build.parts, 'Fixed shelf')).max[1]! - floor).toBeCloseTo(len('16"').mm, 6);
    // It is cut with the job.
    expect(buildJob(project, shop).cabinetParts.filter((p) => p.id.includes('/sink-')).length).toBe(build.parts.length);
  });

  it('three trays one over another, and two shelves, each with its own parts', () => {
    const project = cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'tray-upper', kind: 'tray', up: len('6"') }, { id: 'tray-3', kind: 'tray', up: len('12"') }, { id: 'shelf', kind: 'shelf', up: len('18"') }, { id: 'shelf-2', kind: 'shelf', up: len('23"') }]));
    const build = built(project);
    expect(build.trays.map((t) => t.name)).toEqual(['Bottom tray', 'Upper tray', 'Tray 3']);
    expect(build.slides!.lengths.map((l) => l.pairs)).toEqual([3]);
    const names = build.parts.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Tray 3, left side', 'Fixed shelf', 'Fixed shelf 2', 'Shelf cleat, left', 'Shelf 2 cleat, left']));
    expect(new Set(build.parts.map((p) => p.id)).size).toBe(build.parts.length);
    // On strips each tray has its own on each side.
    expect(build.parts.filter((p) => p.role === 'buildOut')).toHaveLength(6);
  });

  it('the list is read from the floor up whatever its order', () => {
    const a = built(cabinet(plain([{ id: 'tray-upper', kind: 'tray', up: len('8"') }, { id: 'tray-bottom', kind: 'tray' }])));
    expect(a.trays.map((t) => t.name)).toEqual(['Bottom tray', 'Upper tray']);
  });

  it('says what does not fit: one standing in another, with the height it needs', () => {
    const tooLow = cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'tray-upper', kind: 'tray', up: len('3"') }]));
    expect(() => deriveCabinetParts(tooLow, shop)).toThrow(/no room for the upper tray over the bottom tray: it must stand at least \d+ mm \([\d.]+"\) above the cabinet's floor/);
    // An inch over a tray; right on a shelf.
    const least = 0.25 + TRAY_WALL / 25.4 + 1 + 0.25;
    expect(() => deriveCabinetParts(cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'tray-upper', kind: 'tray', up: len(`${least}"`) }])), shop)).not.toThrow();
    expect(() => deriveCabinetParts(cabinet(plain([{ id: 'shelf', kind: 'shelf', up: len('10"') }, { id: 'tray-upper', kind: 'tray', up: len('10.25"') }])), shop)).not.toThrow();
    const high = cabinet(plain([{ id: 'shelf', kind: 'shelf', up: len('29"') }]));
    expect(() => deriveCabinetParts(high, shop)).toThrow(/no room for the fixed shelf: it is too near the top/);
  });

  it('on a frame the tie stands between the two lowest trays, and a shelf may not pass through the standards', () => {
    const three = built(cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'tray-upper', kind: 'tray', up: len('8"') }, { id: 'tray-3', kind: 'tray', up: len('15"') }], 'frame')));
    const tie = partBox(named(three.parts, 'Tray frame, tie'));
    expect(tie.max[1]).toBeLessThan(partBox(named(three.parts, 'Upper tray, left side')).min[1]!);
    expect(tie.min[1]).toBeGreaterThan(partBox(named(three.parts, 'Bottom tray, left side')).max[1]!);
    const through = cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'shelf', kind: 'shelf', up: len('7"') }, { id: 'tray-upper', kind: 'tray', up: len('12"') }], 'frame'));
    expect(() => deriveCabinetParts(through, shop)).toThrow(/fixed shelf would pass through the frame.*put it above them, or hang the trays on build-out strips/);
    // Above the trays it is no trouble.
    expect(() => deriveCabinetParts(cabinet(plain([{ id: 'tray-bottom', kind: 'tray' }, { id: 'shelf', kind: 'shelf', up: len('12"') }], 'frame')), shop)).not.toThrow();
  });

  it('a shelf with side trays needs something to stand each side of', () => {
    expect(() => deriveCabinetParts(cabinet(plain([{ id: 'shelf', kind: 'sideTrays', up: len('10"') }])), shop)).toThrow(/Nothing is in the way for a tray each side of it/);
  });
});
