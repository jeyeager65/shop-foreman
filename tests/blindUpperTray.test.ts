// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PLATFORM_APRON, buildCabinetAssembly, cabinetsOf, createOrganizer, deriveCabinetOpenings, deriveCabinetParts, deriveUnderSink, existingShellParts, partBox, shopFor, traySlideMounts } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject, makeBlind, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * Two blind corner trays, one over the other, the upper one optionally coming forward out of the door opening
 * as well.
 */
const profile = createStarterShopProfile();
const front: Organizer = { id: 'tray-bottom', kind: 'tray' };
const lower = (): Organizer => ({ id: 'blind', kind: 'blindTray' });
const upper = (forward = false): Organizer => ({ id: 'blind-2', kind: 'blindTray', ...(forward ? { forward: true } : {}) });
const corner = (organizers: Organizer[], side: 'left' | 'right' = 'left') => {
  const project = createBaseCabinetProject('frameless', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  stored.size.width = len('48"');
  stored.size.depth = len('24"');
  makeBlind(project, stored.id, side);
  if (stored.corner?.kind === 'blind') stored.corner.blind = len('24"');
  stored.inside = { obstacles: [], organizers };
  makeExisting(project, stored.id);
  const shop = shopFor(project, profile);
  const cabinet = cabinetsOf(project)[0]!;
  return { project, shop, cabinet, build: deriveUnderSink(cabinet, shop.materials, shop.hardware)! };
};
const boxOf = (parts: Part[]) => {
  const boxes = parts.map(partBox);
  return { min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))), max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!))) };
};
const of = (parts: Part[], test: RegExp) => parts.filter((p) => test.test(p.id));

describe('two blind corner trays', () => {
  it('the second stands over the first, an inch clear of it, and they hang on one pair of standards', () => {
    expect(createOrganizer('blindTray', [lower()]).id).toBe('blind-2');
    const { build } = corner([front, lower(), upper()]);
    expect(build.trays.map((t) => t.name)).toEqual(['Bottom tray', 'Blind corner tray', 'Blind corner tray 2']);
    const [a, b] = [boxOf(of(build.parts, /\/sink-blind\/[^/]+$/)), boxOf(of(build.parts, /\/sink-blind-2\/[^/]+$/))];
    expect(b.min[1]! - a.max[1]!).toBeGreaterThanOrEqual(25);
    expect(b.min[1]! - a.max[1]!).toBeLessThan(45);
    // The same place in plan, one over the other.
    expect(b.min[0]).toBeCloseTo(a.min[0]!, 4);
    expect(b.max[0]).toBeCloseTo(a.max[0]!, 4);
    // One frame, made with the lowest: its standards reach up to the upper tray's slides.
    expect(build.parts.filter((p) => p.id.includes('-frame/')).map((p) => p.id.split('/sink-')[1])).toEqual(expect.arrayContaining(['blind-frame/standard-1', 'blind-frame/standard-2', 'blind-frame/rail-1', 'blind-frame/rail-2']));
    expect(build.parts.some((p) => p.id.includes('/sink-blind-2-frame/'))).toBe(false);
    const standard = partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/standard-1'))!);
    expect(standard.max[1]!).toBeGreaterThan(b.min[1]! + 30);
    expect(standard.max[1]!).toBeLessThan(b.max[1]! + 1);
    // A pair of slides each.
    expect(build.slides!.lengths.reduce((n, l) => n + l.pairs, 0)).toBe(3);
  });

  it('a tie stands across the far ends of the two standards, from the floor to their tops, and the trays stop short of it', () => {
    for (const side of ['left', 'right'] as const) {
      const { build } = corner([front, lower(), upper()], side);
      const tie = partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/tie'))!);
      const [one, two] = [partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/standard-1'))!), partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/standard-2'))!)];
      const rail = partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/rail-2'))!);
      expect(tie.max[1]).toBeCloseTo(one.max[1]!, 4);
      expect(tie.min[1]).toBeCloseTo(rail.min[1]!, 4);
      expect(tie.min[2]).toBeCloseTo(Math.min(one.min[2]!, two.min[2]!), 4);
      expect(tie.max[2]).toBeCloseTo(Math.max(one.max[2]!, two.max[2]!), 4);
      // Against their far ends, inside the cabinet.
      if (side === 'left') expect(tie.max[0]).toBeCloseTo(one.min[0]!, 4);
      else expect(tie.min[0]).toBeCloseTo(one.max[0]!, 4);
      expect(tie.min[0]!).toBeGreaterThan(15);
      expect(tie.max[0]!).toBeLessThan(48 * 25.4 - 15);
    }
    // One blind corner tray alone has none.
    expect(corner([front, lower()]).build.parts.some((p) => p.id.endsWith('/tie'))).toBe(false);
  });

  it('too high under the top, it says so', () => {
    expect(() => corner([front, lower(), { ...upper(), up: len('27"') }])).toThrow(/does not fit under the top of the cabinet/);
  });
});

describe('the upper blind corner tray that also comes forward', () => {
  for (const side of ['left', 'right'] as const) {
    it(`blind on the ${side}: a platform on the sideways slides, and the tray on it on a second pair, facing the front`, () => {
      const { build, cabinet, shop } = corner([front, lower(), upper(true)], side);
      const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
      const platform = of(build.parts, /\/sink-blind-2-platform\/[^/]+$/);
      const tray = of(build.parts, /\/sink-blind-2\/[^/]+$/);
      expect(platform.map((p) => p.id.split('/').at(-1))).toEqual(['apron-front', 'apron-back', 'wall-near', 'wall-far']);
      expect(tray.map((p) => p.id.split('/').at(-1)).sort()).toEqual(['tray-back', 'tray-bottom', 'tray-front', 'tray-side-left', 'tray-side-right']);
      const [p, t] = [boxOf(platform), boxOf(tray)];
      // The tray stands inside the platform's plan, between its two walls, clear above its aprons.
      expect(t.min[0]!).toBeGreaterThan(p.min[0]! + 15);
      expect(t.max[0]!).toBeLessThan(p.max[0]! - 15);
      expect(t.min[2]!).toBeGreaterThanOrEqual(p.min[2]! - 1e-6);
      expect(t.max[2]!).toBeLessThanOrEqual(p.max[2]! + 1e-6);
      const aprons = boxOf(platform.filter((x) => /apron/.test(x.id)));
      expect(aprons.max[1]! - aprons.min[1]!).toBeCloseTo(PLATFORM_APRON, 6);
      expect(t.min[1]!).toBeGreaterThan(aprons.max[1]!);
      // Its low wall is toward the cabinet's front, and its two sides are named for where they are.
      const [low, high] = [partBox(tray.find((x) => x.id.endsWith('/tray-front'))!), partBox(tray.find((x) => x.id.endsWith('/tray-back'))!)];
      expect(low.max[1]! - low.min[1]!).toBeLessThan(high.max[1]! - high.min[1]!);
      expect(low.min[2]!).toBeGreaterThan(high.max[2]!);
      expect(partBox(tray.find((x) => x.id.endsWith('/tray-side-left'))!).max[0]!).toBeLessThan(partBox(tray.find((x) => x.id.endsWith('/tray-side-right'))!).min[0]!);
      // Made as the other trays are: its sides round the front and the back in rabbets, its bottom in a groove in all four.
      const cuts = (end: string) => (tray.find((x) => x.id.endsWith(end))!.features ?? []).map((f) => f.id).filter((id) => id !== 'cutout').sort();
      expect(cuts('/tray-side-left')).toEqual(['box-groove', 'box-rabbet-back', 'box-rabbet-front']);
      expect(cuts('/tray-side-right')).toEqual(['box-groove', 'box-rabbet-back', 'box-rabbet-front']);
      expect(cuts('/tray-front')).toEqual(['box-groove']);
      expect(cuts('/tray-back')).toEqual(['box-groove']);
      const bottom = partBox(tray.find((x) => x.id.endsWith('/tray-bottom'))!);
      expect(bottom.min[1]!).toBeGreaterThan(t.min[1]! + 5);
      expect(bottom.min[0]!).toBeGreaterThan(t.min[0]!);
      expect(bottom.max[2]!).toBeLessThan(t.max[2]!);
      // It goes out through the door opening.
      expect(t.max[0]! - t.min[0]!).toBeLessThan(opening.width - 20);
      // Over the lower blind tray, which is a plain one.
      const below = boxOf(of(build.parts, /\/sink-blind\/[^/]+$/));
      expect(p.min[1]!).toBeGreaterThan(below.max[1]! + 20);
      // Slides: the front tray's, the lower blind tray's, the platform's sideways pair and the tray's forward pair.
      expect(build.slides!.lengths.reduce((n, l) => n + l.pairs, 0)).toBe(4);
      expect(build.trays.at(-1)).toMatchObject({ name: 'Blind corner tray 2' });
      expect(build.trays.at(-1)!.length).toBeLessThan(build.trays[1]!.width);
    });
  }

  it('lands on a ledge on the back of the cabinet, behind the door opening, when it is across', () => {
    const { build, cabinet, shop } = corner([front, lower(), upper(true)]);
    const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
    const ledge = partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/landing-ledge'))!);
    const cleat = partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-frame/landing-cleat'))!);
    const aprons = boxOf(of(build.parts, /\/sink-blind-2-platform\/apron-/));
    const back = partBox(build.parts.find((p) => p.id.endsWith('/sink-blind-2-platform/apron-back'))!);
    // Just under the platform, behind the door opening (blind on the left: at the right of the blind half), at the back.
    expect(aprons.min[1]! - ledge.max[1]!).toBeGreaterThan(0.5);
    expect(aprons.min[1]! - ledge.max[1]!).toBeLessThan(3);
    expect(ledge.min[0]!).toBeGreaterThan(opening.origin.x);
    expect(ledge.max[0]!).toBeLessThan(opening.origin.x + opening.width);
    // Under where the back apron comes: the apron's line across the cabinet is within the ledge's depth.
    expect(ledge.min[2]!).toBeLessThanOrEqual(back.min[2]! + 1e-6);
    expect(ledge.max[2]!).toBeGreaterThanOrEqual(back.max[2]! - 1e-6);
    // The cleat under it, against the back, in line with the back standard.
    expect(cleat.max[1]).toBeCloseTo(ledge.min[1]!, 4);
    expect(cleat.min[2]!).toBeLessThan(back.min[2]!);
  });

  it('too shallow or too short a blind half, it says to leave it a tray that only comes across', () => {
    const project = createBaseCabinetProject('frameless', 'doors');
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.adjustableShelves = 0;
    stored.size.width = len('48"');
    stored.size.depth = len('15"');
    makeBlind(project, stored.id, 'left');
    if (stored.corner?.kind === 'blind') stored.corner.blind = len('24"');
    stored.inside = { obstacles: [], organizers: [lower(), upper(true)] };
    const shop = shopFor(project, profile);
    expect(() => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)).toThrow(/to come forward as well|no slide is short enough|too shallow/);
  });

  it('in the 3D view: across with its platform, then forward out of the door opening, its slides with it', () => {
    const { project, shop, cabinet } = corner([front, lower(), upper(true)]);
    const parts = [...deriveCabinetParts(project, shop), ...existingShellParts(project, shop)];
    const mounts = traySlideMounts([cabinet], shop);
    expect(mounts.map((m) => m.drawerId).sort()).toEqual(['cabinet-1/sink-blind', 'cabinet-1/sink-blind-2', 'cabinet-1/sink-blind-2-platform', 'cabinet-1/sink-tray-bottom']);
    const placed = buildCabinetAssembly(parts, [], mounts).parts;
    const tray = placed.filter((p) => /\/sink-blind-2\/[^/]+$/.test(p.partId));
    const platform = placed.filter((p) => /\/sink-blind-2-platform\/[^/]+$/.test(p.partId));
    const plain = placed.filter((p) => /\/sink-blind\/[^/]+$/.test(p.partId));
    // In the order of use: the upper tray across on its platform and forward, with the tray in front of the door
    // in; then that tray out; then the lower blind tray across.
    expect(platform.every((p) => p.pullStage === 1 && p.forwardStage === undefined && p.across! > 0)).toBe(true);
    expect(tray.every((p) => p.pullStage === 1 && p.forwardStage === 2 && p.across === platform[0]!.across && (p.slide ?? 0) > 300)).toBe(true);
    expect(placed.filter((p) => /\/sink-tray-bottom\/[^/]+$/.test(p.partId)).every((p) => p.pullStage === 3 && p.across === undefined)).toBe(true);
    expect(plain.every((p) => p.pullStage === 4 && p.forwardStage === undefined)).toBe(true);
    expect([...platform, ...tray, ...plain].every((p) => p.pullStages === 4)).toBe(true);
    // Right out, it is in front of the cabinet.
    const box = boxOf(parts.filter((p) => /\/sink-blind-2\/[^/]+$/.test(p.id)));
    // (By its own length: a full-extension slide leaves its back end a few inches inside.)
    expect(box.max[2]! + tray[0]!.slide!).toBeGreaterThan(300);
    expect(box.min[2]! + tray[0]!.slide!).toBeGreaterThan(-110);
    // The landing ledge and the standards stay.
    expect(placed.filter((p) => p.partId.includes('/sink-blind-frame/')).every((p) => p.pullStage === undefined)).toBe(true);
    // Slides: across, beside the platform's two aprons; forward, beside the tray's two sides.
    expect(platform.filter((p) => p.runsOn).map((p) => p.partId.split('/').at(-1)).sort()).toEqual(['apron-back', 'apron-front']);
    expect(platform.filter((p) => p.runsOn).every((p) => p.runsOn!.turn === 1)).toBe(true);
    expect(tray.filter((p) => p.runsOn).map((p) => p.partId.split('/').at(-1)).sort()).toEqual(['tray-side-left', 'tray-side-right']);
    expect(tray.filter((p) => p.runsOn).every((p) => p.runsOn!.turn === undefined)).toBe(true);
  });

  it('is in the job and on the checklist', () => {
    const { project, shop } = corner([front, lower(), upper(true)]);
    const job = buildJob(project, shop);
    expect(job.cabinetParts.some((p) => p.id.endsWith('/sink-blind-2-platform/apron-front'))).toBe(true);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ');
    expect(text).toContain('The blind corner tray that also comes forward');
    expect(text).toContain('pull it across by the platform until it stops, then pull the tray out of the door opening');
  });
});
