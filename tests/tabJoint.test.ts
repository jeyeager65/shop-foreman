// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TAB, TAB_LIMITS, tabSizeOf, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, designsOf, isDrawer, isTabSlot, shopFor, tabReach, tabSpans, tabSpansBetween, tabbedOutline } from '@/design';
import { asRect } from '@/geometry/rect';
import { jigItems } from '@/jigs/catalog';
import { TAB_TEST_FITS, tabTestParts } from '@/jigs/tabTest';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import type { CabinetDesign, CasesContext, ConstructionStyle, Part, PlanWarning, Project } from '@/model';
import { FURNITURE_INSET_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { addWallCabinet, createBaseCabinetProject, createShopCabinetProject, setBays } from '@/samples/cabinet';
import { len } from '@/units';
import { lowRiderShop } from './lowRider';

/**
 * Tab-and-slot case joints: tabs on the ends of the parts
 * that span the case, a slot in each side for every tab, through the side or blind.
 */
const profile = lowRiderShop();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
type Tabs = CabinetDesign['joinery']['tabs'];

function tabbed(style: ConstructionStyle, tabs?: Tabs, edit: (cabinet: CabinetDesign, project: Project) => void = () => {}) {
  const project = style === 'shop' ? createShopCabinetProject('doors') : createBaseCabinetProject(style, 'doors');
  const cabinet = cabinetsOf(project)[0]!;
  cabinet.joinery.case = 'tabs';
  if (tabs) cabinet.joinery.tabs = tabs;
  edit(cabinet, project);
  const shop = shopFor(project, profile);
  const parts = deriveCabinetParts(project, shop);
  const part = (key: string) => parts.find((p) => p.id === `${cabinet.id}/${key}`)!;
  return { project, shop, cabinet: cabinetsOf(project)[0]!, parts, part };
}
const outlineOf = (part: Part) => {
  const f = part.features.find((x) => x.kind === 'cutout' && !x.inside)!;
  return f.kind === 'cutout' ? f : undefined!;
};
/** The tabs on a flat part's left end (x = 0), as from..to behind the case front. */
const leftTabs = (part: Part) => {
  const ys = outlineOf(part).outline.filter((p) => Math.abs(p.x) < 1e-6).map((p) => p.y).sort((a, b) => a - b);
  const front = -part.placement!.origin[2];
  return Array.from({ length: ys.length / 2 }, (_, i) => [front + ys[2 * i]!, front + ys[2 * i + 1]!]);
};
/** The left side's slots, as [from, to] behind the case front and [y0, y1] off the floor. */
const leftSlots = (side: Part) => {
  const band = -side.placement!.origin[2];
  return side.features.filter(isTabSlot).map((f) => {
    const r = asRect((f as { outline: { x: number; y: number }[] }).outline)!;
    return { id: f.id, kind: f.kind, behind: [band + r.x0, band + r.x1], y: [r.y0, r.y1], depth: f.kind === 'dado' ? f.depth : undefined, dogBones: f.kind === 'cutout' ? f.dogBones : undefined };
  });
};
const near = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);

async function builds(project: Project) {
  const job = buildJob({ ...project, slug: 'tabs' }, profile);
  expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code)).map((w) => w.message)).toEqual([]);
  expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  expect(job.files.length).toBeGreaterThan(0);
  for (const file of job.files) {
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(file.text);
    expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
  }
  return job;
}

describe('where the tabs are', () => {
  it('evenly along a joint, never at its ends, one on a short joint', () => {
    expect(tabSpans(200)).toEqual([{ from: 100 - TAB.length / 2, to: 100 + TAB.length / 2 }]);
    // A joint too short for a whole tab has one half its length.
    expect(tabSpans(60)).toEqual([{ from: 15, to: 45 }]);
    const long = tabSpans(584);
    expect(long).toHaveLength(3);
    expect(long[0]!.from).toBeGreaterThan(20);
    expect(584 - long[2]!.to).toBeCloseTo(long[0]!.from);
    for (const s of long) expect(s.to - s.from).toBeCloseTo(TAB.length);
    // The tabs of a part on the other face of the same part are between them.
    const between = tabSpansBetween(584);
    expect(between).toHaveLength(2);
    expect(between.every((b) => long.every((s) => b.to < s.from || b.from > s.to))).toBe(true);
    expect(tabSpansBetween(100)).toEqual([]);
  });

  it('an outline with tabs on its ends', () => {
    const outline = tabbedOutline(140, 200, { x0: { reach: 20, spans: tabSpans(200) }, x1: { reach: 20, spans: tabSpans(200) } });
    expect(outline).toHaveLength(12);
    expect([Math.min(...outline.map((p) => p.x)), Math.max(...outline.map((p) => p.x))]).toEqual([0, 140]);
    // The body is 20 in from each end; its area is the body's plus two tabs'.
    const area = Math.abs(outline.reduce((sum, p, i) => sum + p.x * outline[(i + 1) % outline.length]!.y - outline[(i + 1) % outline.length]!.x * p.y, 0)) / 2;
    expect(area).toBeCloseTo(100 * 200 + 2 * 20 * TAB.length);
  });
});

describe('a case on through tabs', () => {
  it('the bottom and the stretchers reach the outside of the sides, a slot through each side for every tab', () => {
    const { cabinet, part, shop } = tabbed('frameless');
    const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    const W = cabinet.size.width.mm;
    expect(tabReach(cabinet, t)).toBeCloseTo(t);
    const bottom = part('bottom');
    expect(bottom.size.width).toBeCloseTo(W);
    expect(bottom.placement!.origin[0]).toBeCloseTo(0);
    expect(outlineOf(bottom).dogBones).toBe(true);
    // Its body is between the sides; nothing screws it to them.
    const xs = outlineOf(bottom).outline.map((p) => p.x);
    expect(xs.filter((x) => Math.abs(x - t) < 1e-6).length).toBeGreaterThan(0);
    expect(bottom.features.some((f) => f.kind === 'pocketHole')).toBe(false);
    const side = part('side-left');
    expect(side.features.some((f) => f.kind === 'pocketHole' || f.id.startsWith('case-screw') || f.id.startsWith('dado-'))).toBe(false);
    const slots = leftSlots(side);
    // Each of the bottom's tabs has its slot, at its place, as high as the bottom is thick, through the side.
    const top = bottom.placement!.origin[1];
    const mine = slots.filter((s) => s.id.startsWith('tab-slot-bottom-'));
    expect(mine).toHaveLength(leftTabs(bottom).length);
    leftTabs(bottom).forEach((tab, i) => {
      expect(near(mine[i]!.behind, tab), `${mine[i]!.behind} ${tab}`).toBe(true);
      expect(near(mine[i]!.y, [top - t, top])).toBe(true);
    });
    expect(mine.every((s) => s.kind === 'cutout' && s.dogBones === true)).toBe(true);
    // One for each stretcher too, at the top of the side.
    for (const key of ['stretcher-front', 'stretcher-back']) {
      const span = part(key);
      expect(outlineOf(span).outline.length).toBeGreaterThan(4);
      expect(slots.filter((s) => s.id.startsWith(`tab-slot-${key}-`))).toHaveLength(1);
    }
    // The two sides are mirror images.
    expect(part('side-right').features.filter(isTabSlot)).toHaveLength(slots.length);
  });

  it('a tab may stand proud of the side', () => {
    const { cabinet, part } = tabbed('frameless', { proud: len('1/32"') });
    const proud = 25.4 / 32;
    expect(part('bottom').size.width).toBeCloseTo(cabinet.size.width.mm + 2 * proud);
    expect(part('bottom').placement!.origin[0]).toBeCloseTo(-proud);
  });

  it('one part alone may be on tabs', () => {
    const { part } = tabbed('frameless', undefined, (c) => {
      c.joinery.case = 'pocketScrews';
      c.joinery.overrides = { bottom: 'tabs' };
    });
    expect(part('side-left').features.filter(isTabSlot).every((f) => f.id.startsWith('tab-slot-bottom-'))).toBe(true);
    expect(part('side-left').features.filter(isTabSlot).length).toBeGreaterThan(0);
    expect(asRect(outlineOf(part('stretcher-front')).outline)).toBeTruthy();
    expect(part('stretcher-front').features.some((f) => f.kind === 'pocketHole')).toBe(true);
  });

  it('builds in each construction, and its G-code parses', async () => {
    for (const style of ['frameless', 'faceFrame', 'shop'] as const) await builds(tabbed(style).project);
  }, 240000);
});

describe('a case on blind tabs', () => {
  it('the slots are pockets in the inside faces, no deeper than half the side', () => {
    const { cabinet, part, shop } = tabbed('frameless', { blind: true });
    const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    const reach = Math.min(TAB.blind, t / 2);
    expect(part('bottom').size.width).toBeCloseTo(cabinet.size.width.mm - 2 * t + 2 * reach);
    const slots = leftSlots(part('side-left'));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.kind === 'dado' && Math.abs(s.depth! - reach) < 1e-6)).toBe(true);
    expect(part('side-left').features.some((f) => f.kind === 'cutout' && f.inside)).toBe(false);
  });

  it('builds in each construction, and its G-code parses', async () => {
    for (const style of ['frameless', 'faceFrame', 'shop'] as const) await builds(tabbed(style, { blind: true }).project);
  }, 240000);
});

describe('partitions, wall cabinets and fixed shelves on tabs', () => {
  it('a partition has tabs down into the bottom and up into the stretchers', async () => {
    for (const tabs of [undefined, { blind: true }] as Tabs[]) {
      const made = tabbed('frameless', tabs, (c, project) => {
        c.size.width = len('42"');
        setBays(project, c, 2);
      });
      const partition = made.parts.find((p) => p.role === 'partition')!;
      const outline = outlineOf(partition);
      expect(outline.outline.length).toBeGreaterThan(4);
      expect(outline.dogBones).toBe(true);
      const bottom = made.part('bottom');
      const below = bottom.features.filter(isTabSlot);
      expect(below.length).toBeGreaterThan(1);
      expect(below.every((f) => (tabs?.blind ? f.kind === 'dado' && f.face === 'A' : f.kind === 'cutout' && f.inside))).toBe(true);
      expect(made.part('stretcher-front').features.filter(isTabSlot)).toHaveLength(1);
      expect(partition.features.some((f) => f.kind === 'pocketHole') || bottom.features.some((f) => f.id.startsWith('case-screw'))).toBe(false);
      await builds(made.project);
    }
  }, 240000);

  it('a wall cabinet: its top, its bottom and its hanging rails', async () => {
    const project = createBaseCabinetProject('frameless', 'doors');
    const wall = addWallCabinet(project, { name: 'Wall' });
    for (const c of cabinetsOf(project)) c.joinery.case = 'tabs';
    const parts = deriveCabinetParts(project, shopFor(project, profile));
    const side = parts.find((p) => p.id === `${wall.id}/side-left`)!;
    const ids = side.features.filter(isTabSlot).map((f) => f.id);
    for (const key of ['bottom', 'top']) expect(ids.some((id) => id.startsWith(`tab-slot-${key}-`)), key).toBe(true);
    const rails = parts.filter((p) => p.id.startsWith(`${wall.id}/hanging-rail`));
    for (const rail of rails) {
      expect(outlineOf(rail).outline.length).toBeGreaterThan(4);
      expect(ids.some((id) => id.startsWith(`tab-slot-${rail.id.split('/').pop()}-`))).toBe(true);
    }
    await builds(project);
  }, 240000);
});

describe('cutting a tabbed case', () => {
  it('a tabbed part and a slotted side are the CNC\'s alone, and Plan says why', () => {
    for (const tabs of [undefined, { blind: true }] as Tabs[]) {
      const { project, cabinet } = tabbed('frameless', tabs);
      const job = buildJob({ ...project, slug: 'plan' }, profile);
      const planned = (key: string) => job.plan.parts.find((p) => p.partId === `${cabinet.id}/${key}`)!;
      expect(planned('bottom').options).toEqual(['cnc']);
      expect(planned('bottom').reason).toMatch(/its tabs/);
      expect(planned('bottom').steps.map((s) => s.label)).toContain('Tabs on its ends, cut with the outline');
      expect(planned('side-left').options).toEqual(['cnc']);
      expect(planned('side-left').reason).toMatch(/slots for tabs/);
      expect(planned('side-left').reason).not.toMatch(/opening|dado/);
      // Blind slots have a row of their own; through ones are cut with the outline's bit.
      expect(job.plan.operations.some((o) => o.key.endsWith(':tabSlot'))).toBe(!!tabs?.blind);
      expect(job.plan.operations.some((o) => /slots for tabs/i.test(o.label))).toBe(!!tabs?.blind);
    }
  }, 120000);

  it('a slot is cut bigger than its tab by the machine\'s fit, with a dog-bone in each corner', () => {
    const cut = (fit: number) => {
      const { project } = tabbed('frameless');
      const own = lowRiderShop();
      for (const m of own.machines) m.tabFit = fit;
      return buildJob({ ...project, slug: 'fit' }, own).files.map((f) => f.text).join('\n');
    };
    const [tight, loose] = [cut(0), cut(0.4)];
    expect(tight).not.toEqual(loose);
    // More moves than a case on pocket screws has: the slots and their dog-bones.
    const plain = createBaseCabinetProject('frameless', 'doors');
    const lines = (text: string) => text.split('\n').filter((l) => /^G1 /.test(l)).length;
    expect(lines(tight)).toBeGreaterThan(lines(buildJob({ ...plain, slug: 'plain' }, profile).files.map((f) => f.text).join('\n')));
  }, 120000);

  it('a tabbed part too big for the machine is named: the joint needs the CNC', () => {
    const { project, cabinet } = tabbed('frameless', undefined, (c) => (c.size.height = len('84"')));
    void cabinet;
    const small = lowRiderShop();
    for (const m of small.machines) delete m.tiling;
    const job = buildJob({ ...project, slug: 'big' }, small);
    const said = job.plan.warnings.filter((w) => /tab-and-slot joints, which only the CNC cuts/.test(w.message));
    expect(said.map((w) => w.message.split(' is too big')[0])).toEqual(expect.arrayContaining(['Left side']));
  }, 120000);

  it('Build glues the tabs into the slots', () => {
    const { project, shop } = tabbed('frameless');
    const job = buildJob({ ...project, slug: 'build' }, profile);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((s) => s.startsWith('Assemble the case: try it dry first.') && /glue the tabs of the bottom and the stretchers into its slots/.test(s))).toBe(true);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)} mm`);
    expect(lists.hardware.some((h) => /pocket|case screw/i.test(`${h.item} ${h.note ?? ''}`))).toBe(false);
  }, 120000);
});

describe('slots and what else is in a part', () => {
  it('no hole and no pocket hole is on a slot, in any construction, with drawers, bays and shelves', () => {
    const POCKET = { reach: 60, half: 5 };
    for (const style of ['frameless', 'faceFrame', 'shop'] as const) {
      for (const tabs of [undefined, { blind: true }] as Tabs[]) {
        for (const bays of [1, 2]) {
          const project = style === 'shop' ? createShopCabinetProject('drawerOverDoors') : createBaseCabinetProject(style, 'drawerOverDoors');
          const cabinet = cabinetsOf(project)[0]!;
          cabinet.joinery.case = 'tabs';
          if (tabs) cabinet.joinery.tabs = tabs;
          cabinet.sides = { left: 'hidden', right: 'exposed' };
          if (bays > 1) {
            cabinet.size.width = len('42"');
            setBays(project, cabinet, bays);
          }
          const parts = deriveCabinetParts(project, shopFor(project, profile));
          for (const part of parts) {
            const slots = part.features.filter(isTabSlot).map((f) => asRect((f as { outline: { x: number; y: number }[] }).outline)!);
            for (const s of slots) {
              for (const f of part.features) {
                if (f.kind === 'hole' || f.kind === 'cup') {
                  const r = f.diameter / 2;
                  const clear = f.center.x <= s.x0 - r || f.center.x >= s.x1 + r || f.center.y <= s.y0 - r || f.center.y >= s.y1 + r;
                  expect(clear, `${style} ${part.name}: ${f.id}`).toBe(true);
                }
                if (f.kind === 'pocketHole') {
                  const along = f.edge === 'x0' || f.edge === 'x1' ? [s.y0, s.y1] : [s.x0, s.x1];
                  const from = { x0: s.x0, x1: part.size.width - s.x1, y0: s.y0, y1: part.size.height - s.y1 }[f.edge];
                  const hit = f.at > along[0]! - POCKET.half && f.at < along[1]! + POCKET.half && from < POCKET.reach;
                  expect(hit, `${style} ${part.name}: ${f.id}`).toBe(false);
                }
              }
            }
          }
        }
      }
    }
  }, 240000);

  it('a face frame still has pocket holes for its frame on a tabbed case', () => {
    const { part } = tabbed('faceFrame');
    for (const key of ['side-left', 'bottom', 'stretcher-front']) expect(part(key).features.filter((f) => f.kind === 'pocketHole' && f.id.startsWith('frame-pocket')).length, key).toBeGreaterThan(0);
  });

  it('a TV stand of three bays on tabs builds', async () => {
    for (const blind of [false, true]) {
      const { project } = startProject(starterById('tvstand')!, builtInPresets().find((p) => p.id === FURNITURE_INSET_PRESET_ID)!, profile);
      const joinery = (project.context as CasesContext).settings.joinery;
      joinery.case = 'tabs';
      if (blind) joinery.tabs = { blind: true };
      const parts = deriveCabinetParts(project, shopFor(project, profile));
      expect(parts.filter((p) => p.role === 'partition' && p.tabbed)).toHaveLength(2);
      const job = buildJob({ ...project, slug: 'tv' }, profile);
      expect(job.files.length).toBeGreaterThan(0);
      expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    }
  }, 240000);
});

describe('a thick back on tabs', () => {
  const backed = (tabs?: Tabs, edit: (c: CabinetDesign) => void = () => {}) =>
    tabbed('frameless', tabs, (c) => {
      c.joinery.case = 'pocketScrews';
      c.joinery.back = 'tabs';
      c.materials.backId = c.materials.caseId;
      edit(c);
    });

  it('stands between the sides, set in from the rear, with tabs up its edges in slots in the sides', () => {
    const { part, cabinet, shop } = backed();
    const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    const back = part('back');
    expect(back.tabbed).toBe(true);
    expect(back.size.width).toBeCloseTo(cabinet.size.width.mm);
    // Set in: its rear face is short of the sides' rear edges.
    const behind = -back.placement!.origin[2];
    expect(behind + t).toBeLessThan(cabinet.size.depth.mm - 10);
    const slots = leftSlots(part('side-left')).filter((s) => s.id.startsWith('tab-slot-back-'));
    const tabs = outlineOf(back).outline.filter((p) => Math.abs(p.x) < 1e-6).length / 2;
    expect(slots).toHaveLength(tabs);
    expect(slots.length).toBeGreaterThan(1);
    // Each slot is as wide as the back is thick, at the back's place, closed all round.
    for (const s of slots) {
      expect(near(s.behind, [behind, behind + t])).toBe(true);
      expect(s.y[0]).toBeGreaterThan(0);
      expect(s.y[1]).toBeLessThan(cabinet.size.height.mm);
    }
    // Nothing else holds it: no rabbet, no groove.
    expect(part('side-left').features.some((f) => f.id === 'rabbet-back' || f.id === 'groove-back')).toBe(false);
  });

  it('a thin back is refused in plain words, and so is a slot beside a nailer on tabs', () => {
    expect(() => tabbed('frameless', undefined, (c) => (c.joinery.back = 'tabs'))).toThrow(/too thin for tabs/);
    // The whole case on tabs, a nailer on edge against the back: no slot of the back meets the nailer's.
    const { part } = backed(undefined, (c) => {
      c.joinery.case = 'tabs';
      c.joinery.backStretcherForm = 'nailer';
    });
    const slots = leftSlots(part('side-left'));
    const nailer = slots.find((s) => s.id.startsWith('tab-slot-stretcher-back-'))!;
    for (const s of slots.filter((x) => x.id.startsWith('tab-slot-back-'))) expect(s.y[1]! < nailer.y[0]! - 5 || s.y[0]! > nailer.y[1]! + 5).toBe(true);
  });

  it('builds through and blind, with no brads listed for the back', async () => {
    for (const tabs of [undefined, { blind: true }] as Tabs[]) {
      const { project, shop } = backed(tabs, (c) => (c.joinery.case = 'tabs'));
      const job = await builds(project);
      const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)} mm`);
      expect(lists.hardware.some((h) => /brads/.test(h.item) && /Back/.test(h.note ?? ''))).toBe(false);
      const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
      expect(steps.some((s) => s.startsWith("The back's tabs go into the slots in the sides"))).toBe(true);
    }
  }, 240000);
});

describe('drawer boxes with finger joints', () => {
  const boxed = (style: ConstructionStyle, edit: (project: Project) => void = () => {}) => {
    const project = style === 'shop' ? createShopCabinetProject('drawers') : createBaseCabinetProject(style, 'drawers');
    for (const d of designsOf(project)) if (isDrawer(d)) d.box.cornerJoint = 'tabs';
    edit(project);
    const shop = shopFor(project, profile);
    return { project, shop, boxes: deriveDrawerBoxParts(project, shop), drawer: designsOf(project).find(isDrawer)! };
  };

  it("the front's and the back's ends have tabs through slots at the ends of the sides, clear of the bottom's groove", () => {
    const { boxes, drawer } = boxed('frameless');
    const own = boxes.filter((p) => p.designObjectId === drawer.id);
    const side = own.find((p) => p.role === 'boxSide')!;
    const back = own.find((p) => p.role === 'boxBack')!;
    const front = own.find((p) => p.role === 'boxFront')!;
    const t = side.size.thickness;
    for (const wall of [front, back]) {
      expect(wall.tabbed).toBe(true);
      expect(outlineOf(wall).dogBones).toBe(true);
      // As wide as the box is, outside to outside: its tabs fill the sides' thickness.
      expect(wall.size.width).toBeCloseTo(back.size.width);
      expect(wall.features.some((f) => f.kind === 'pocketHole' || f.id.startsWith('box-rabbet'))).toBe(false);
    }
    const slots = side.features.filter(isTabSlot).map((f) => ({ id: f.id, r: asRect((f as { outline: { x: number; y: number }[] }).outline)! }));
    const tabs = outlineOf(back).outline.filter((p) => Math.abs(p.x) < 1e-6).map((p) => p.y).sort((a, b) => a - b);
    expect(slots.filter((s) => s.id.startsWith('tab-slot-box-back-'))).toHaveLength(tabs.length / 2);
    expect(slots.filter((s) => s.id.startsWith('tab-slot-box-front-'))).toHaveLength(tabs.length / 2);
    const groove = side.features.find((f) => f.id === 'box-groove')!;
    const grooveTop = asRect((groove as { outline: { x: number; y: number }[] }).outline)!.y1;
    for (const s of slots) {
      // Through the side, at its very end, as high as the tab, above the groove.
      expect(s.r.x1 - s.r.x0).toBeCloseTo(t);
      expect(Math.min(s.r.x0, side.size.width - s.r.x1)).toBeCloseTo(0);
      expect(s.r.y0).toBeGreaterThan(grooveTop);
      expect(near([s.r.y0, s.r.y1], [tabs[0]!, tabs[1]!]) || tabs.length > 2).toBe(true);
    }
    expect(side.features.some((f) => f.id.startsWith('box-rabbet'))).toBe(false);
  });

  it('an inset wide front keeps its dados, and the box front of a plain inset drawer keeps its finger notch', () => {
    const wide = boxed('shop');
    const wall = wide.boxes.find((p) => p.role === 'boxFront')!;
    expect(wall.tabbed).toBeUndefined();
    expect(wide.boxes.find((p) => p.role === 'boxBack')!.tabbed).toBe(true);
    expect(wide.boxes.find((p) => p.role === 'boxSide')!.features.filter(isTabSlot).every((f) => f.id.startsWith('tab-slot-box-back-'))).toBe(true);
    const plain = boxed('shop', (project) => {
      for (const d of designsOf(project)) if (isDrawer(d)) d.shop = { ...d.shop, front: 'plain', pull: 'fingerPull' };
    });
    const front = plain.boxes.find((p) => p.role === 'boxFront')!;
    expect(front.tabbed).toBe(true);
    const outline = outlineOf(front).outline;
    // Its tabs at its ends and its notch in its top edge, in one outline that does not cross itself.
    expect(outline.filter((p) => Math.abs(p.x) < 1e-6).length).toBeGreaterThan(1);
    const top = outline.filter((p) => p.y < front.size.height - 1e-6 && p.y > front.size.height / 2 && p.x > 30 && p.x < front.size.width - 30);
    expect(top.length).toBe(2);
    const area = outline.reduce((sum, p, i) => sum + p.x * outline[(i + 1) % outline.length]!.y - outline[(i + 1) % outline.length]!.x * p.y, 0) / 2;
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(front.size.width * front.size.height);
  });

  it('builds in each construction; Build glues the fingers, and no corner screws are listed', async () => {
    for (const style of ['frameless', 'faceFrame', 'shop'] as const) {
      const { project, shop } = boxed(style);
      const job = await builds(project);
      const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
      expect(steps.some((s) => s.startsWith('Assemble each drawer box with finger joints'))).toBe(true);
      expect(steps.some((s) => /join its corners with pocket screws|into the rabbets of its front and back/.test(s))).toBe(false);
      const boxParts = job.plan.parts.filter((p) => /\/box-(back|side-left)$/.test(p.partId));
      expect(boxParts.every((p) => p.cutOut === 'cnc' && p.options.length === 1)).toBe(true);
    }
  }, 240000);
});

describe('the test cut for the fit', () => {
  const shop = lowRiderShop();
  const item = jigItems(shop).find((i) => i.id === 'tab-test')!;
  const t = shop.materialCatalog.find((m) => m.id === item.defaults.materialId)!.measuredThickness.mm;

  it('a tab piece, and a piece with a row of slots through it and a row of blind ones, each a step bigger', () => {
    const [slotted, tab] = tabTestParts(String(item.defaults.materialId), t, 'both', 0);
    const slots = slotted!.features.filter(isTabSlot);
    expect(slots).toHaveLength(2 * TAB_TEST_FITS.length);
    const sizes = (kind: 'cutout' | 'dado') => slots.filter((f) => f.kind === kind).map((f) => asRect((f as { outline: { x: number; y: number }[] }).outline)!).map((r) => [r.x1 - r.x0 - TAB.length, r.y1 - r.y0 - t]);
    for (const kind of ['cutout', 'dado'] as const) {
      sizes(kind).forEach(([along, across], i) => {
        expect(along).toBeCloseTo(TAB_TEST_FITS[i]!);
        expect(across).toBeCloseTo(TAB_TEST_FITS[i]!);
      });
    }
    // A blind slot is deeper than its tab by its fit; the tab piece's two tabs are a job's.
    const depths = slots.flatMap((f) => (f.kind === 'dado' ? [f.depth] : []));
    depths.forEach((d, i) => expect(d).toBeCloseTo(Math.min(TAB.blind, t / 2) + TAB_TEST_FITS[i]!));
    expect(tab!.tabbed).toBe(true);
    const xs = outlineOf(tab!).outline.map((p) => p.x);
    expect(xs.filter((x) => Math.abs(x - t) < 1e-6).length).toBeGreaterThan(0);
    expect(tab!.size.width).toBeCloseTo(t + 70 + Math.min(TAB.blind, t / 2));
    // The corner by the tightest slot is clipped off.
    expect(outlineOf(slotted!).outline).toHaveLength(5);
  });

  it('whatever the machine adds to a slot now, each slot is cut at its own fit', () => {
    const cut = (fit: number) => {
      const own = lowRiderShop();
      for (const m of own.machines) m.tabFit = fit;
      const made = jigItems(own).find((i) => i.id === 'tab-test')!;
      return made.gcode!(made.defaults, 1, own.activeMachineId).map((f) => f.text).join('\n');
    };
    const moves = (text: string) => text.split('\n').filter((l) => /^G[01] /.test(l));
    expect(moves(cut(0))).toEqual(moves(cut(0.25)));
  }, 120000);

  it('its file parses, on one blank, and says what to do with the answer', async () => {
    expect(item.problems(item.defaults)).toEqual([]);
    expect(item.carved).toBe(true);
    const files = item.gcode!(item.defaults, 1, shop.activeMachineId);
    expect(files).toHaveLength(1);
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(files[0]!.text!);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    const notes = item.notes!(item.defaults).join(' ');
    expect(notes).toMatch(/0\.0 mm, 0\.1 mm, 0\.2 mm, 0\.3 mm/);
    expect(notes).toMatch(/A joint's slot bigger than its tab/);
    expect(notes).toMatch(/This machine has 0\.15 mm now/);
    // Through only, blind only; stock too thin for a slot.
    for (const kind of ['through', 'blind']) expect(item.gcode!({ ...item.defaults, kind }, 1, shop.activeMachineId)).toHaveLength(1);
    const thin = shop.materialCatalog.find((m) => m.measuredThickness.mm < 7)!;
    expect(item.problems({ ...item.defaults, materialId: thin.id })[0]).toMatch(/3\/8" thick or more/);
  }, 120000);
});

/** Tabs of an adjustable size, primarily for drawers. */
describe('the size of the tabs', () => {
  const inch = (v: number) => ({ mm: v * 25.4, unit: 'in' as const });

  it('is the usual 2" no more than 6" apart unless set, and kept within what can be cut', () => {
    expect(tabSizeOf()).toEqual({ length: TAB.length, between: TAB.between });
    expect(tabSizeOf({ length: inch(0.75) }).length).toBeCloseTo(19.05, 9);
    expect(tabSizeOf({ length: inch(0.75) }).between).toBe(TAB.between);
    expect(tabSizeOf({ length: inch(0.1), between: inch(0.05) })).toEqual({ length: TAB_LIMITS.least, between: TAB_LIMITS.betweenLeast });
    expect(tabSizeOf({ length: inch(12) }).length).toBe(TAB_LIMITS.most);
    // Smaller tabs closer together: more of them along the same joint, still evenly spaced and never at an end.
    const small = { length: 19.05, between: 19.05 };
    expect(tabSpans(100)).toHaveLength(1);
    const spans = tabSpans(100, small);
    expect(spans).toHaveLength(3);
    for (const s of spans) expect(s.to - s.from).toBeCloseTo(19.05);
    expect(spans[0]!.from).toBeGreaterThan(0);
    expect(spans[0]!.from).toBeCloseTo(100 - spans[2]!.to);
    expect(tabSpansBetween(100, small)).toHaveLength(2);
  });

  it("a drawer box's fingers: as many as fit at that width, a slot for each in the sides", () => {
    const boxesOf = (fingers?: { length: ReturnType<typeof inch>; between: ReturnType<typeof inch> }) => {
      const project = createBaseCabinetProject('frameless', 'drawers');
      for (const d of designsOf(project)) {
        if (!isDrawer(d)) continue;
        d.box.cornerJoint = 'tabs';
        if (fingers) d.box.fingers = fingers;
      }
      const shop = shopFor(project, profile);
      const drawer = designsOf(project).find(isDrawer)!;
      const own = deriveDrawerBoxParts(project, shop).filter((p) => p.designObjectId === drawer.id);
      const side = own.find((p) => p.role === 'boxSide')!;
      const slots = side.features.filter((f) => isTabSlot(f) && f.id.startsWith('tab-slot-box-back-')).map((f) => asRect((f as { outline: { x: number; y: number }[] }).outline)!);
      return { project, shop, slots, back: own.find((p) => p.role === 'boxBack')! };
    };
    const usual = boxesOf();
    const fine = boxesOf({ length: inch(0.5), between: inch(0.5) });
    expect(fine.slots.length).toBeGreaterThan(usual.slots.length);
    expect(fine.slots.length).toBeGreaterThanOrEqual(3);
    // Each slot is as high as a finger is wide, and the back has a finger for each.
    for (const r of fine.slots) expect(r.y1 - r.y0).toBeCloseTo(12.7);
    const fingerEdges = outlineOf(fine.back).outline.filter((p) => Math.abs(p.x) < 1e-6);
    expect(fingerEdges).toHaveLength(2 * fine.slots.length);
    // And it builds, the slots cut on the CNC.
    const job = buildJob(fine.project, fine.shop);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });

  it("Setup's size is every drawer's that follows it, and a case's own tabs take theirs", () => {
    const project = createBaseCabinetProject('frameless', 'drawers');
    const context = project.context as CasesContext;
    context.fronts.drawers.cornerJoint = 'tabs';
    context.fronts.drawers.fingers = { length: inch(0.75), between: inch(0.75) };
    const drawer = designsOf(project).find(isDrawer)!;
    expect(drawer.box.cornerJoint).toBe('tabs');
    expect(drawer.box.fingers).toEqual({ length: inch(0.75), between: inch(0.75) });
    // A case on tabs 1" long, 3" apart at most: more slots in its sides than with the usual ones.
    const slotsIn = (tabs?: Tabs) => tabbed('frameless', tabs).parts.find((p) => p.role === 'side')!.features.filter(isTabSlot).length;
    expect(slotsIn({ length: inch(1), between: inch(3) })).toBeGreaterThan(slotsIn());
  });
});
