// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, createOrganizer, deriveCabinetOpenings, deriveCabinetParts, deriveUnderSink, deriveWayIn, existingShellParts, organizerName, partBox, shopFor, takesExisting } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject, makeBlind, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: a pull-out in the reachable half of a blind corner cabinet, and a tray on sideways slides in the blind half. */
const shop = createStarterShop();
const blindCabinet = (side: 'left' | 'right', organizers: Organizer[], construction: 'faceFrame' | 'frameless' = 'frameless', existing = false) => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  makeBlind(project, stored.id, side);
  stored.inside = { obstacles: [], organizers };
  if (existing) makeExisting(project, stored.id);
  return project;
};
const built = (project: ReturnType<typeof blindCabinet>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
const named = (parts: Part[], name: string) => {
  const part = parts.find((p) => p.name === name);
  if (!part) throw new Error(`No part named ${name}: ${parts.map((p) => p.name).join('; ')}`);
  return part;
};
const tray: Organizer = { id: 'tray-bottom', kind: 'tray' };
const blindTray = (): Organizer => createOrganizer('blindTray');
const box = (parts: Part[]) => {
  const boxes = parts.map(partBox);
  return { min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))), max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!))) };
};

describe('the reachable half', () => {
  for (const side of ['left', 'right'] as const) {
    it(`blind on the ${side}: a tray from side to side lies between the door opening's edges, on a frame, whatever the mounting`, () => {
      const project = blindCabinet(side, [tray]);
      const cabinet = cabinetsOf(project)[0]!;
      const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
      const build = built(project);
      expect(build.mounting).toBe('frame');
      expect(build.parts.some((p) => p.role === 'buildOut')).toBe(false);
      const [x0, x1] = [opening.origin.x, opening.origin.x + opening.width];
      const frame = box(build.parts.filter((p) => p.id.includes('/sink-frame/')));
      const trayBox = box(build.parts.filter((p) => p.name.startsWith('Bottom tray')));
      // The frame goes in and out through the opening; the tray is inside the frame.
      expect(frame.min[0]!).toBeGreaterThanOrEqual(x0 - 20);
      expect(frame.max[0]!).toBeLessThanOrEqual(x1 + 20);
      expect(trayBox.min[0]!).toBeGreaterThan(x0);
      expect(trayBox.max[0]!).toBeLessThan(x1);
      // Nothing of it is in the blind half.
      const blindEdge = side === 'left' ? x0 : x1;
      if (side === 'left') expect(trayBox.min[0]!).toBeGreaterThan(blindEdge);
      else expect(trayBox.max[0]!).toBeLessThan(blindEdge);
    });
  }
});

describe('the blind corner tray', () => {
  it('is for a blind corner cabinet only, and is named for it', () => {
    expect(organizerName(blindTray())).toBe('Blind corner tray');
    const plain = createBaseCabinetProject('frameless', 'doors');
    (plain.context as CasesContext).pieces[0]!.inside = { obstacles: [], organizers: [blindTray()] };
    (plain.context as CasesContext).pieces[0]!.adjustableShelves = 0;
    expect(() => deriveCabinetParts(plain, shop)).toThrow(/A blind corner tray is for a blind corner cabinet/);
  });

  for (const side of ['left', 'right'] as const) {
    it(`blind on the ${side}: stands in the blind half, over the frame in front of the doors, and is pulled across into the reachable half`, () => {
      const project = blindCabinet(side, [tray, blindTray()]);
      const cabinet = cabinetsOf(project)[0]!;
      const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
      const build = built(project);
      expect(build.trays.map((t) => t.name)).toEqual(['Bottom tray', 'Blind corner tray']);
      const parts = build.parts.filter((p) => p.id.includes('/sink-blind/'));
      expect(parts.map((p) => p.name)).toEqual(['Blind corner tray, side 1', 'Blind corner tray, side 2', 'Blind corner tray, front', 'Blind corner tray, back', 'Blind corner tray, bottom']);
      const b = box(parts);
      const [x0, x1] = [opening.origin.x, opening.origin.x + opening.width];
      // Wholly in the blind half, beside the door opening.
      if (side === 'left') expect(b.max[0]!).toBeLessThan(x0 + 30);
      else expect(b.min[0]!).toBeGreaterThan(x1 - 30);
      // Its slides run sideways: it is as long across the cabinet as its slide, and one more pair is on the list.
      const blind = build.trays[1]!;
      expect(b.max[0]! - b.min[0]!).toBeCloseTo(blind.length, 4);
      expect(b.max[2]! - b.min[2]!).toBeCloseTo(blind.width, 4);
      expect(build.slides!.lengths.reduce((n, l) => n + l.pairs, 0)).toBe(2);
      // Pulled across by its length it is still inside the cabinet, in front of the doors.
      expect(blind.length).toBeLessThanOrEqual(opening.width);
      // As low as it can be: it is only reached with the tray in front of the doors pulled out, so it
      // rides just over that tray's frame, which stays, and lower than the top of the tray itself.
      const frame = box(build.parts.filter((p) => p.id.includes('/sink-frame/')));
      const front = box(build.parts.filter((p) => p.name.startsWith('Bottom tray')));
      expect(b.min[1]!).toBeGreaterThan(frame.max[1]!);
      expect(b.min[1]! - frame.max[1]!).toBeLessThan(25);
      expect(b.min[1]!).toBeLessThan(front.max[1]!);
      // Its low wall is toward the door opening.
      const low = partBox(named(parts, 'Blind corner tray, front'));
      const high = partBox(named(parts, 'Blind corner tray, back'));
      expect(low.max[1]! - low.min[1]!).toBeLessThan(high.max[1]! - high.min[1]!);
      if (side === 'left') expect(low.min[0]!).toBeGreaterThan(high.max[0]!);
      else expect(low.max[0]!).toBeLessThan(high.min[0]!);
      // Its own frame: two standards across the cabinet, front and back of it, on two rails on the floor.
      const own = build.parts.filter((p) => p.id.includes('/sink-blind-frame/'));
      expect(own.map((p) => p.name)).toEqual(['Blind corner tray frame, front standard', 'Blind corner tray frame, back standard', 'Blind corner tray frame, near rail', 'Blind corner tray frame, far rail']);
      const [s1, s2] = [partBox(own[0]!), partBox(own[1]!)];
      expect(Math.min(s1.min[2]!, s2.min[2]!)).toBeLessThan(b.min[2]!);
      expect(Math.max(s1.max[2]!, s2.max[2]!)).toBeGreaterThan(b.max[2]!);
      const floor = partBox(named(deriveCabinetParts(project, shop), 'Bottom')).max[1]!;
      expect(partBox(own[2]!).min[1]).toBeCloseTo(floor, 6);
      expect(s1.min[1]).toBeCloseTo(partBox(own[2]!).max[1]!, 6);
      // No two parts in one place, but for the tray's own joints.
      const all = [...parts, ...own];
      for (const p of all) for (const q of all) {
        if (p === q) continue;
        const [x, y] = [partBox(p), partBox(q)];
        expect(Math.min(...[0, 1, 2].map((k) => Math.min(x.max[k]!, y.max[k]!) - Math.max(x.min[k]!, y.min[k]!))), `${p.name} and ${q.name}`).toBeLessThanOrEqual(6.36);
      }
    });
  }

  it('says so when it is put too low, and goes in through the door opening on its edge', () => {
    const low = blindCabinet('left', [tray, { ...blindTray(), up: len('2"') }]);
    expect(() => deriveCabinetParts(low, shop)).toThrow(/The blind corner tray would run into what stays in front of the door when its tray is pulled out: it must stand at least/);
    const project = blindCabinet('left', [tray, blindTray()], 'frameless', true);
    const ways = deriveWayIn(cabinetsOf(project)[0]!, shop.materials, shop.hardware, (mm) => `${Math.round(mm)} mm`);
    expect(ways.map((w) => w.what)).toEqual(['Bottom tray', 'The tray frame', 'The blind corner tray frame', 'Blind corner tray']);
    expect(ways.find((w) => w.what === 'Blind corner tray')!.words).toMatch(/goes in assembled on its edge.*laid flat inside and hung on its slides/);
    const job = buildJob(project, shop);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ');
    expect(text).toContain('The blind corner tray: glue and brad it as the others');
    expect(text).toContain('pull the tray in front of the doors right out, then pull the blind corner tray across');
  });
});

describe('a blind corner cabinet that is already there', () => {
  it('can be measured: its blind part is from the inside of its far side to the door opening, and its opening comes out as measured', () => {
    const made = blindCabinet('left', []);
    const before = cabinetsOf(made)[0]!;
    expect(takesExisting(before)).toBe(true);
    const wasOpening = deriveCabinetOpenings(before, shop.materials).at(-1)!;
    const wasWidth = before.size.width.mm;
    const project = blindCabinet('left', [], 'frameless', true);
    const stored = (project.context as CasesContext).pieces[0]!;
    expect(stored.existing!.blind).toMatchObject({ side: 'left' });
    const cabinet = cabinetsOf(project)[0]!;
    // Measured as it stood: the same box, the same opening in the same place, the same blind.
    expect(cabinet.size.width.mm).toBeCloseTo(wasWidth, 4);
    expect(cabinet.corner).toMatchObject({ kind: 'blind', side: 'left' });
    const blindOf = (c: typeof cabinet) => (c.corner?.kind === 'blind' ? c.corner.blind.mm : 0);
    expect(blindOf(cabinet)).toBeCloseTo(blindOf(before), 4);
    const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
    expect(opening.width).toBeCloseTo(wasOpening.width, 4);
    expect(opening.origin.x).toBeCloseTo(wasOpening.origin.x, 4);
    // A longer blind part moves the opening's edge, not the box.
    stored.existing!.blind!.reach = len('30"');
    expect(cabinetsOf(project)[0]!.size.width.mm).toBeCloseTo(wasWidth, 4);
    // Nothing of it is made, and it is drawn.
    const profile = createStarterShopProfile();
    expect(deriveCabinetParts(project, shopFor(project, profile))).toEqual([]);
    expect(existingShellParts(project, shopFor(project, profile)).length).toBeGreaterThan(4);
  });

  it('behind a face frame the stile is what the blind part and the opening leave', () => {
    const project = blindCabinet('right', [tray, blindTray()], 'faceFrame', true);
    const cabinet = cabinetsOf(project)[0]!;
    const stored = (project.context as CasesContext).pieces[0]!;
    const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
    expect(opening.width).toBeCloseTo(stored.existing!.opening.width.mm, 4);
    // The opening is at the left; the blind part runs on to the right.
    expect(opening.origin.x).toBeLessThan(cabinet.size.width.mm / 4);
    expect(built(project).trays.map((t) => t.name)).toEqual(['Bottom tray', 'Blind corner tray']);
  });
});
