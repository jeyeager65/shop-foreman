// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BIN_PLAY, PULLOUT_WALL, TALL_TRAY_WALL, TRAY_FRONT, TRAY_WALL, cabinetsOf, createObstacle, createOrganizer, deriveCabinetOpenings, deriveCabinetParts, deriveUnderSink, deriveWayIn, organizerName, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CabinetInside, CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: under a kitchen sink. A tall tray for bottles, a pull-out for bins, a tilt-out tray. */
const shop = createStarterShop();
const cabinet = (inside: Partial<CabinetInside>, construction: 'faceFrame' | 'frameless' = 'faceFrame', existing = false) => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('36"');
  stored.adjustableShelves = 0;
  stored.inside = { obstacles: [], organizers: [], ...inside };
  if (existing) makeExisting(project, stored.id);
  return project;
};
const built = (project: ReturnType<typeof cabinet>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
const named = (parts: Part[], name: string) => {
  const part = parts.find((p) => p.name === name);
  if (!part) throw new Error(`No part named ${name}: ${parts.map((p) => p.name).join('; ')}`);
  return part;
};
const pullOut = (more: Partial<Organizer> = {}): Organizer => ({ ...createOrganizer('pullOut'), ...more });

describe('a tall tray', () => {
  it('has walls as high as asked, its front lower by the same as any tray, and takes the room it stands in', () => {
    const tall: Organizer = { id: 'tray-bottom', kind: 'tray', wall: { mm: TALL_TRAY_WALL, unit: 'in' } };
    const build = built(cabinet({ organizers: [tall] }));
    expect(build.trays[0]).toMatchObject({ name: 'Bottom tray', height: TALL_TRAY_WALL });
    expect(named(build.parts, 'Bottom tray, left side').size.height).toBe(TALL_TRAY_WALL);
    expect(named(build.parts, 'Bottom tray, front').size.height).toBeCloseTo(TALL_TRAY_WALL - (TRAY_WALL - TRAY_FRONT), 6);
    // A tray over it must stand over its walls, not over an ordinary tray's.
    const over = cabinet({ organizers: [tall, { id: 'tray-upper', kind: 'tray', up: len('6"') }] });
    expect(() => deriveCabinetParts(over, shop)).toThrow(/no room for the upper tray over the bottom tray/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [tall, { id: 'tray-upper', kind: 'tray', up: len('10"') }] }), shop)).not.toThrow();
  });

  it('is cut round the trap when it reaches it, as any tray is', () => {
    const build = built(cabinet({ obstacles: [createObstacle('trap')], organizers: [{ id: 'tray-bottom', kind: 'tray', wall: len('13"') }] }));
    expect(build.trays[0]!.cutRound).toBe(true);
  });
});

describe('a pull-out for bins', () => {
  it('starts as one bin 9-1/2" × 13-1/2" × 16", and is named for what it is', () => {
    const o = pullOut();
    expect(o).toMatchObject({ id: 'pullout', kind: 'pullOut', bins: { count: 1 } });
    expect(organizerName(o)).toBe('Trash pull-out');
    expect(createOrganizer('pullOut', [o]).id).toBe('pullout-2');
  });

  for (const construction of ['faceFrame', 'frameless'] as const) {
    it(`${construction}: a tray as wide as its bin on a frame of its own on the cabinet's floor, at the left of the door opening`, () => {
      const project = cabinet({ organizers: [pullOut()] }, construction);
      const build = built(project);
      const all = deriveCabinetParts(project, shop);
      const bin = pullOut().bins!;
      const tray = build.trays[0]!;
      const t = named(build.parts, 'Trash pull-out, left side').size.thickness;
      expect(tray).toMatchObject({ name: 'Trash pull-out', height: PULLOUT_WALL, cutRound: false });
      expect(tray.width).toBeCloseTo(bin.width.mm + 2 * BIN_PLAY + 2 * t, 6);
      expect(tray.length).toBeGreaterThanOrEqual(bin.depth.mm + 2 * BIN_PLAY + 2 * t);
      // Its frame: two standards and two rails, the rails on the cabinet's floor, the tray between the standards over the rails.
      const frame = build.parts.filter((p) => p.id.includes('/sink-pullout-frame/'));
      expect(frame.map((p) => p.name)).toEqual(['Trash pull-out frame, left standard', 'Trash pull-out frame, right standard', 'Trash pull-out frame, front rail', 'Trash pull-out frame, back rail']);
      const floor = partBox(named(all, 'Bottom')).max[1]!;
      const [sl, sr, rail] = [partBox(frame[0]!), partBox(frame[1]!), partBox(frame[2]!)];
      expect(rail.min[1]).toBeCloseTo(floor, 6);
      const side = partBox(named(build.parts, 'Trash pull-out, left side'));
      expect(side.min[1]).toBeGreaterThan(rail.max[1]!);
      const clearance = build.slides!.slide.sideClearance.mm;
      expect(side.min[0]! - sl.max[0]!).toBeCloseTo(clearance, 6);
      expect(sr.min[0]! - partBox(named(build.parts, 'Trash pull-out, right side')).max[0]!).toBeCloseTo(clearance, 6);
      // At the left of the door opening, inside it.
      const opening = deriveCabinetOpenings(cabinetsOf(project)[0]!, shop.materials).at(-1)!;
      expect(sl.min[0]!).toBeGreaterThanOrEqual(opening.origin.x - 1e-6);
      expect(sl.min[0]! - opening.origin.x).toBeLessThan(len('1"').mm);
      // One pair of slides, and nothing on the cabinet's sides.
      expect(build.slides!.lengths.map((l) => l.pairs)).toEqual([1]);
      expect(build.parts.some((p) => p.role === 'buildOut')).toBe(false);
    });
  }

  it('two bins one behind another need a longer tray; put from the left side, it stands there', () => {
    const one = built(cabinet({ organizers: [pullOut()] }));
    const two = pullOut();
    two.bins!.count = 2;
    two.bins!.depth = len('9"');
    two.fromLeft = len('18"');
    const project = cabinet({ organizers: [two] });
    const build = built(project);
    expect(build.trays[0]!.length).toBeGreaterThanOrEqual(2 * two.bins!.depth.mm);
    const left = partBox(named(deriveCabinetParts(project, shop), 'Left side')).max[0]!;
    expect(partBox(named(build.parts, 'Trash pull-out frame, left standard')).min[0]! - left).toBeCloseTo(len('18"').mm, 6);
    expect(build.trays[0]!.length).toBeGreaterThanOrEqual(one.trays[0]!.length);
  });

  it('stands beside the trap, and says so when something is over its bins or in its way', () => {
    // A trap in the middle of a 36" cabinet leaves the left clear.
    const beside = cabinet({ obstacles: [createObstacle('trap')], organizers: [pullOut()] });
    expect(built(beside).trays[0]!.cutRound).toBe(false);
    // A bowl over where the bins stand, lower than they are tall.
    const bowl = { ...createObstacle('bowl'), width: len('30"'), clearUnder: len('14"') };
    expect(() => deriveCabinetParts(cabinet({ obstacles: [bowl], organizers: [pullOut()] }), shop)).toThrow(/The bowl is in the way of the trash pull-out and its bin \(\d+ mm high\): move it to one side, or use a lower bin/);
    // Too far right: past the door opening.
    expect(() => deriveCabinetParts(cabinet({ organizers: [pullOut({ fromLeft: len('28"') })] }), shop)).toThrow(/does not fit where it stands.*past the right edge of the door opening/);
    const deep = pullOut();
    deep.bins!.count = 2;
    deep.bins!.depth = len('14"');
    expect(() => deriveCabinetParts(cabinet({ organizers: [deep] }), shop)).toThrow(/not deep enough for the trash pull-out: its 2 bins need a tray \d+ mm long/);
  });

  it('takes the floor up to the top of its bins: a tray may stand over it, not in it', () => {
    expect(() => deriveCabinetParts(cabinet({ organizers: [pullOut(), { id: 'tray-upper', kind: 'tray', up: len('10"') }] }), shop)).toThrow(/no room for the upper tray over the trash pull-out/);
    expect(() => deriveCabinetParts(cabinet({ organizers: [pullOut(), { id: 'tray-upper', kind: 'tray', up: len('19"') }] }), shop)).not.toThrow();
  });

  it('goes in through the door opening with its frame, and has its steps in the checklist', () => {
    const project = cabinet({ organizers: [pullOut()] }, 'faceFrame', true);
    const ways = deriveWayIn(cabinetsOf(project)[0]!, shop.materials, shop.hardware, (mm) => `${Math.round(mm)} mm`);
    expect(ways.map((w) => [w.what, w.how]), ways.map((w) => w.words).join(' | ')).toEqual([
      ['Trash pull-out', 'assembled'],
      ['The trash pull-out frame', 'assembled'],
    ]);
    const job = buildJob(project, shop);
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ')).toContain('The trash pull-out: glue and brad its tray');
  });
});

describe('a tilt-out tray', () => {
  const tilt = { width: len('20"'), height: len('4"'), depth: len('2.5"') };

  it('is a trough a little smaller than the opening behind the false front, up under the top, at the front', () => {
    const project = cabinet({ tiltOut: tilt });
    const build = built(project);
    expect([build.tiltOut!.width, build.tiltOut!.height, build.tiltOut!.depth].map((mm) => Math.round(mm * 100) / 100)).toEqual([len('19"').mm, len('3.5"').mm, len('2.5"').mm].map((mm) => Math.round(mm * 100) / 100));
    const parts = build.parts.filter((p) => p.id.includes('/sink-tilt/'));
    expect(parts.map((p) => p.name)).toEqual(['Tilt-out tray, bottom', 'Tilt-out tray, lip', 'Tilt-out tray, left end', 'Tilt-out tray, right end']);
    const boxes = parts.map(partBox);
    const span = (k: number) => Math.max(...boxes.map((b) => b.max[k]!)) - Math.min(...boxes.map((b) => b.min[k]!));
    expect(span(0)).toBeCloseTo(len('19"').mm, 6);
    expect(span(1)).toBeCloseTo(len('3.5"').mm, 6);
    expect(span(2)).toBeCloseTo(len('2.5"').mm, 6);
    expect(Math.max(...boxes.map((b) => b.max[2]!))).toBeCloseTo(0, 6);
    for (const a of parts) for (const b of parts) {
      if (a === b) continue;
      const [x, y] = [partBox(a), partBox(b)];
      expect(Math.min(...[0, 1, 2].map((k) => Math.min(x.max[k]!, y.max[k]!) - Math.max(x.min[k]!, y.min[k]!))), `${a.name} and ${b.name}`).toBeLessThanOrEqual(0.01);
    }
  });

  it('its hinges are bought: a pair on the hardware list, and its steps in the checklist', () => {
    const project = cabinet({ tiltOut: tilt });
    const job = buildJob(project, shop);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)} mm`);
    expect(lists.hardware.find((h) => h.item === 'Tilt-out tray hinges')).toMatchObject({ quantity: 1, unit: 'pair' });
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ')).toContain('The tilt-out tray: glue and brad');
  });

  it('says so when the bowl comes too far forward, or the opening is too small', () => {
    const bowl = { ...createObstacle('bowl'), fromBack: len('0"'), depth: len('22"') };
    expect(() => deriveCabinetParts(cabinet({ obstacles: [bowl], tiltOut: tilt }), shop)).toThrow(/The bowl comes too far forward for a tilt-out tray/);
    expect(() => deriveCabinetParts(cabinet({ tiltOut: { ...tilt, height: len('1.5"') } }), shop)).toThrow(/needs an opening at least 7" wide and 2-1\/2" high/);
  });
});
