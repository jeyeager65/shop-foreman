// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CLEAT_WIDTH,
  HANGING_RAIL_WIDTH,
  buildCabinetAssembly,
  cabinetsOf,
  deriveCabinetOpenings,
  deriveCabinetParts,
  deriveParts,
  partBox,
  partFaces,
  rowOfCabinets,
  setOwnSettings,
} from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, CasesContext, Part, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { NEW_WALL_CABINET, addCabinet, addWallCabinet, applyCabinetLayout, copyCabinet, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { parseProjectFile, serializeProjectFile, exportProject } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 4: the wall cabinet, its top panel and the two ways to hang it. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const t = shop.materials.find((m) => m.id === 'plywood-3-4')?.measuredThickness.mm ?? 18.26;

/** A project with the reference cabinet (A) and a wall cabinet (B), set up by `edit`. */
function withWall(style: 'frameless' | 'faceFrame' | 'shop', edit: (wall: CabinetDesign, project: Project) => void = () => {}) {
  const project = style === 'shop' ? createShopCabinetProject() : createBaseCabinetProject(style);
  const wall = addWallCabinet(project, { name: 'Wall' });
  edit(wall, project);
  const parts = [...deriveCabinetParts(project, shop), ...deriveParts(project, shop)].filter((p) => p.tag === 'B');
  const part = (key: string) => parts.find((p) => p.id.endsWith(`/${key}`));
  const ids = (p: Part | undefined, prefix: string) => (p?.features ?? []).filter((f) => f.id.startsWith(prefix)).map((f) => f.id);
  return { project, wall, parts, part, ids };
}

describe('a wall cabinet', () => {
  it('starts at the starter size, on doors, 54" off the floor, and follows the project', () => {
    const { project, wall } = withWall('frameless');
    expect([wall.form, L(wall.size.width.mm), L(wall.size.height.mm), L(wall.size.depth.mm), L(wall.offFloor!.mm), wall.adjustableShelves]).toEqual(['wall', '30"', '30"', '12"', '54"', NEW_WALL_CABINET.shelves]);
    expect(wall.layout.rows.map((r) => r.use)).toEqual(['doors']);
    expect([wall.overrides, wall.hanging, wall.construction]).toEqual([undefined, 'rails', 'frameless']);
    // Only a wall cabinet has a height off the floor.
    expect(Object.keys({ ...cabinetsOf(project)[0]! })).not.toContain('offFloor');
    expect(Object.keys({ ...wall })).toContain('offFloor');
    expect(() => applyCabinetLayout(project, wall, 'drawerOverDoors')).toThrow(/doors only/);
    // A base cabinet added after it is sized after the base cabinet, not the wall one.
    const base = addCabinet(project, { name: 'Base 2', width: len('18"'), layout: 'doors', like: wall.id });
    expect([L(base.size.height.mm), L(base.size.depth.mm)]).toEqual(['34-1/2"', '22-1/2"']);
  });

  it('has a full top joined like the bottom, no stretchers and no toe kick', () => {
    const { parts, part, ids } = withWall('frameless');
    expect(parts.map((p) => p.name)).toEqual(['Left side', 'Right side', 'Bottom', 'Top', 'Top hanging rail', 'Bottom hanging rail', 'Back', 'Shelf 1', 'Shelf 2', 'Left door', 'Right door']);
    const [top, bottom] = [part('top')!, part('bottom')!];
    expect(top.size).toEqual(bottom.size);
    expect([top.role, partFaces(top).A, top.grain]).toEqual(['stretcher', 'Top', 'width']);
    // Its pocket screws go in from above, the bottom's from underneath.
    expect([...new Set(top.features.filter((f) => f.kind === 'pocketHole').map((f) => f.face))]).toEqual(['A']);
    expect([...new Set(bottom.features.filter((f) => f.kind === 'pocketHole').map((f) => f.face))]).toEqual(['B']);
    expect(ids(top, 'side-pocket')).toEqual(ids(bottom, 'side-pocket'));
    // The top's upper face is the top of the cabinet; the bottom sits at its foot.
    expect(partBox(top).max[1]).toBeCloseTo(30 * 25.4, 6);
    expect(partBox(bottom).min[1]).toBeCloseTo(0, 6);
    // The sides are plain rectangles as tall as the cabinet, with no toe-kick notch.
    const side = part('side-left')!;
    expect(side.size.height).toBeCloseTo(30 * 25.4, 6);
    const outline = side.features.find((f) => f.kind === 'cutout');
    expect(outline?.kind === 'cutout' && outline.outline).toHaveLength(4);
    // The whole front is one door opening, from the bottom to the top.
    const opening = deriveCabinetOpenings(withWall('frameless').wall, shop.materials)[0]!;
    expect(opening.origin.y).toBeCloseTo(t, 6);
    expect(opening.height).toBeCloseTo(30 * 25.4 - 2 * t, 6);
  });

  it('the top follows the bottom\'s joint: a dado in each side, or screws through them', () => {
    const dado = withWall('frameless', (wall) => (wall.joinery.case = 'dado'));
    expect(dado.ids(dado.part('side-left'), 'dado-')).toEqual(['dado-bottom', 'dado-top', 'dado-hanging-rail-top', 'dado-hanging-rail-bottom']);
    expect(dado.part('top')!.size.width - withWall('frameless').part('top')!.size.width).toBeCloseTo(12.7, 6);
    expect(dado.part('top')!.features.filter((f) => f.kind === 'pocketHole')).toEqual([]);
    const screwed = withWall('shop');
    const holes = screwed.ids(screwed.part('side-right'), 'case-screw').map((id) => id.replace(/-\d+$/, ''));
    expect([...new Set(holes)]).toEqual(['case-screw-bottom', 'case-screw-top', 'case-screw-hanging-rail-top', 'case-screw-hanging-rail-bottom']);
    // An override of the bottom's joint is the top's too.
    const mixed = withWall('frameless', (wall, project) => {
      setOwnSettings(project, wall.id, 'caseAndJoinery', true);
      wall.joinery.overrides = { bottom: 'dado' };
    });
    expect(mixed.ids(mixed.part('side-left'), 'dado-')).toEqual(['dado-bottom', 'dado-top']);
  });

  it('behind a face frame its bottom is level with the top of the bottom rail, with nothing under it', () => {
    const { parts, part } = withWall('faceFrame');
    expect(parts.some((p) => p.role === 'toeKick')).toBe(false);
    expect(partBox(part('bottom')!).max[1]).toBeCloseTo(38.1, 6);
    expect(partBox(part('frame-rail-bottom')!).max[1]).toBeCloseTo(38.1, 6);
    expect(parts.filter((p) => p.role === 'frameRail').map((p) => p.name)).toEqual(['Top rail', 'Bottom rail']);
    // The top takes the frame's pocket holes along its front edge, like the bottom.
    const pockets = (key: string) => part(key)!.features.filter((f) => f.id.startsWith('frame-pocket')).length;
    expect(pockets('top')).toBe(pockets('bottom'));
    expect(pockets('top')).toBeGreaterThan(0);
  });
});

describe('hanging a wall cabinet', () => {
  it('on rails: one under the top and one on the bottom, against the back, and the shelf pins stop short of them', () => {
    const { part, ids, wall } = withWall('frameless');
    const [upper, lower, top, bottom, back] = ['hanging-rail-top', 'hanging-rail-bottom', 'top', 'bottom', 'back'].map((k) => partBox(part(k)!));
    expect([upper!.max[1], lower!.min[1]]).toEqual([top!.min[1], bottom!.max[1]]);
    expect(upper!.max[1] - upper!.min[1]).toBeCloseTo(HANGING_RAIL_WIDTH, 6);
    // Their rear faces lie against the front face of the back.
    expect(upper!.min[2]).toBeCloseTo(back!.max[2], 6);
    expect(lower!.min[2]).toBeCloseTo(back!.max[2], 6);
    expect(partFaces(part('hanging-rail-top')!).A).toBe('Front');
    const pins = part('side-left')!.features.flatMap((f) => (f.kind === 'hole' && f.id.startsWith('shelf-pin') ? [f.center.y] : []));
    expect(Math.min(...pins)).toBeGreaterThan(lower!.max[1]);
    expect(Math.max(...pins)).toBeLessThan(upper!.min[1]);
    // On a cleat the rails are gone and the pins have the whole height.
    const cleat = withWall('frameless', (w) => (w.hanging = 'cleat'));
    expect(cleat.part('hanging-rail-top')).toBeUndefined();
    expect(cleat.ids(cleat.part('side-left'), 'shelf-pin').length).toBeGreaterThan(ids(part('side-left'), 'shelf-pin').length);
    expect(wall.hanging).toBe('rails');
  });

  it('on a French cleat: two halves and a spacer behind the back, as long as the cabinet is wide', () => {
    const { parts, part } = withWall('faceFrame', (w) => (w.hanging = 'cleat'));
    const strips = parts.filter((p) => p.role === 'cleat');
    expect(strips.map((p) => [p.name, L(p.size.width), L(p.size.height), p.size.thickness])).toEqual([
      ['Cleat, on the cabinet', '30"', '3"', t],
      ['Cleat, on the wall', '30"', '3"', t],
      ['Spacer strip', '30"', '3"', t],
    ]);
    const rear = -12 * 25.4;
    for (const strip of strips) {
      const box = partBox(strip);
      expect([box.max[2], box.min[2]]).toEqual([rear, rear - t]);
      expect(box.max[2]).toBeLessThanOrEqual(partBox(part('back')!).min[2] + 1e-6);
    }
    expect(partBox(part('cleat-cabinet')!).max[1]).toBeCloseTo(30 * 25.4, 6);
    expect(partBox(part('cleat-wall')!).max[1]).toBeCloseTo(30 * 25.4 - CLEAT_WIDTH, 6);
    expect(partBox(part('cleat-spacer')!).min[1]).toBe(0);
    // In the exploded view they come off behind the back.
    expect(buildCabinetAssembly(parts).parts.filter((p) => p.role === 'cleat').every((p) => p.explode[2] < 0)).toBe(true);
  });

  it('is a setting of the project that a cabinet can make its own', () => {
    const project = createBaseCabinetProject('frameless');
    const first = addWallCabinet(project, { name: 'Wall 1' });
    const second = copyCabinet(project, first.id);
    first.hanging = 'cleat';
    expect([(project.context as CasesContext).settings.hanging, second.hanging]).toEqual(['cleat', 'cleat']);
    setOwnSettings(project, second.id, 'caseAndJoinery', true);
    cabinetsOf(project)[2]!.hanging = 'rails';
    const names = (id: string) => deriveCabinetParts(project, shop).filter((p) => p.designObjectId === id).map((p) => p.name);
    expect(names(first.id)).toContain('Spacer strip');
    expect(names(second.id)).toContain('Top hanging rail');
    expect(names(second.id)).not.toContain('Spacer strip');
    // The base cabinet is as it was.
    expect(names('cabinet-1')).toEqual(deriveCabinetParts(createBaseCabinetProject('frameless'), shop).map((p) => p.name));
  });
});

describe.each([
  ['frameless', 'rails'],
  ['faceFrame', 'cleat'],
  ['shop', 'rails'],
  ['shop', 'cleat'],
] as const)('a %s job with a wall cabinet on %s', (style, hanging) => {
  const { project } = withWall(style, (wall) => (wall.hanging = hanging));
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  const lists = buildLists(job, project, shop, L);

  it('plans and cuts every part once, in files that parse', async () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    const onCnc = all.filter((p) => (job.plan.parts.find((x) => x.partId === p.id)?.cutOut ?? 'cnc') === 'cnc').map((p) => p.id);
    expect(job.plan.blanks.flatMap((b) => b.partIds).sort()).toEqual([...onCnc].sort());
    expect(lists.cutList.flatMap((g) => g.rows).reduce((n, r) => n + r.quantity, 0)).toBe(all.length - onCnc.length);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });

  it('lists what hangs it and says how in the checklist', () => {
    const rows = lists.hardware.filter((h) => h.group === 'Hanging').map((h) => [h.item, h.quantity]);
    const cut = lists.cutList.flatMap((g) => g.rows);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).at(-1)!;
    expect(steps.title).toBe('B · Wall');
    if (hanging === 'rails') {
      expect(rows).toEqual([['#10 × 3" cabinet screws', 4]]);
      expect(cut.some((r) => r.names.join() === 'Top hanging rail,Bottom hanging rail' && r.quantity === 2)).toBe(true);
      expect(steps.steps.some((s) => /^Hang the cabinet: hold it level/.test(s.text))).toBe(true);
    } else {
      expect(rows).toEqual([
        ['#10 × 3" cabinet screws', 2],
        ['#8 × 1-1/4" wood screws', 8],
      ]);
      const halves = cut.find((r) => r.names.includes('Cleat, on the wall'))!;
      expect([halves.quantity, halves.steps]).toEqual([2, ['45° bevel along one edge, table saw']]);
      expect(cut.find((r) => r.names.includes('Spacer strip'))!.steps).toEqual([]);
      expect(steps.steps.filter((s) => /cleat/.test(s.text))).toHaveLength(2);
    }
    // The cabinet goes on the wall before its doors go on.
    const order = steps.steps.map((s) => s.text);
    const hangs = order.findIndex((s) => /^(Hang the cabinet|Screw the other cleat)/.test(s));
    expect(hangs).toBeGreaterThanOrEqual(0);
    expect(order.findIndex((s) => /hinges/.test(s))).toBeGreaterThan(hangs);
  });

  it('survives export and import', () => {
    expect(parseProjectFile(serializeProjectFile(exportProject(project, shop))).project).toEqual(project);
  });
});

describe('a wall cabinet in the picture of the whole project', () => {
  it('hangs at its height off the floor, beside the cabinets on it', () => {
    const { project } = withWall('frameless');
    const at = rowOfCabinets(cabinetsOf(project).map((c) => ({ id: c.id, width: c.size.width.mm, offFloor: c.form === 'wall' ? c.offFloor?.mm : undefined })));
    expect(at.get('cabinet-1')).toEqual([0, 0, 0]);
    expect(at.get('cabinet-2')![1]).toBeCloseTo(54 * 25.4, 6);
    expect(at.get('cabinet-2')![0]).toBeGreaterThan(24 * 25.4);
  });
});
