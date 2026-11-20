// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { reactive } from 'vue';
import { cabinetsOf, deriveCabinetOpenings, isDoorSet, isDrawer, layoutPresetOf, mountedDesigns, presetLayout, designsOf, setOwnFrontSettings } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { ConstructionStyle, PlanWarning, Slide } from '@/model';
import { activeMachine } from '@/plan';
import { applyCabinetLayout, createBaseCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/**
 * Milestone 3: a cabinet that is doors only or drawers only comes out as
 * complete as the drawer over doors, in both construction styles.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];

describe('layout presets', () => {
  it('reads the rows back as the preset they are', () => {
    expect(layoutPresetOf(presetLayout('doors'))).toEqual({ preset: 'doors', drawers: 0 });
    expect(layoutPresetOf(presetLayout('drawers'))).toEqual({ preset: 'drawers', drawers: 3 });
    expect(layoutPresetOf(presetLayout('drawers', 5))).toEqual({ preset: 'drawers', drawers: 5 });
    expect(layoutPresetOf(presetLayout('drawers', 40))).toEqual({ preset: 'drawers', drawers: 6 });
    expect(layoutPresetOf(presetLayout('drawerOverDoors'))).toEqual({ preset: 'drawerOverDoors', drawers: 1 });
    expect(layoutPresetOf(cabinetsOf(createBaseCabinetProject())[0]!.layout)?.preset).toBe('drawerOverDoors');
    expect(layoutPresetOf({ rows: [{ id: 'a', use: 'doors' }, { id: 'b', use: 'drawer' }] })).toBeUndefined();
  });

  it('keeps the drawer row height while the layout has no use for it', () => {
    const start = presetLayout('drawerOverDoors');
    start.rows[0]!.height = len('7"');
    const drawers = presetLayout('drawers', 4, start);
    expect(drawers.rows.map((r) => r.id)).toEqual(['drawer', 'drawer-2', 'drawer-3', 'drawer-4']);
    expect(drawers.rows.every((r) => !r.height)).toBe(true);
    const doors = presetLayout('doors', undefined, drawers);
    expect(presetLayout('drawerOverDoors', undefined, doors).rows[0]!.height).toEqual(len('7"'));
  });
});

describe('changing the layout of a cabinet', () => {
  it('adds the drawers its rows need, copied from the first, and keeps the doors', () => {
    const project = createBaseCabinetProject('frameless');
    const cabinet = cabinetsOf(project)[0]!;
    const first = designsOf(project).find(isDrawer)!;
    first.box.cornerJoint = 'pocketScrews';
    applyCabinetLayout(project, cabinet, 'drawers', 3);
    const drawers = designsOf(project).filter(isDrawer);
    expect(drawers.map((d) => d.name)).toEqual(['Drawer 1', 'Drawer 2', 'Drawer 3']);
    expect(drawers.map((d) => d.mounting.openingId)).toEqual(['cabinet-1/drawer', 'cabinet-1/drawer-2', 'cabinet-1/drawer-3']);
    expect(new Set(drawers.map((d) => d.id)).size).toBe(3);
    expect(drawers.every((d) => d.box.cornerJoint === 'pocketScrews')).toBe(true);
    // The doors stay in the project with nothing to hang on.
    expect(designsOf(project).filter(isDoorSet)).toHaveLength(1);
    expect(mountedDesigns(project, shop.materials).filter(isDoorSet)).toHaveLength(0);
    expect(deriveCabinetOpenings(cabinet, shop.materials).map((o) => o.name)).toEqual(['Drawer opening 1', 'Drawer opening 2', 'Drawer opening 3']);
  });

  it('works on a reactive project, as the store holds it', () => {
    const project = reactive(createBaseCabinetProject('frameless'));
    applyCabinetLayout(project, cabinetsOf(project)[0]!, 'drawers', 3);
    expect(designsOf(project).filter(isDrawer)).toHaveLength(3);
  });

  it('gives the same job again when the layout is switched back', () => {
    const project = createBaseCabinetProject('faceFrame');
    const cabinet = cabinetsOf(project)[0]!;
    const before = buildJob(project, shop).files.map((f) => f.text);
    const stored = JSON.stringify(project.designObjects);
    applyCabinetLayout(project, cabinet, 'drawers', 4);
    applyCabinetLayout(project, cabinet, 'doors');
    expect(mountedDesigns(project, shop.materials).map((d) => d.template)).toEqual(['doorSet']);
    applyCabinetLayout(project, cabinet, 'drawers', 2);
    expect(designsOf(project).filter(isDrawer)).toHaveLength(4);
    expect(mountedDesigns(project, shop.materials)).toHaveLength(2);
    applyCabinetLayout(project, cabinet, 'drawerOverDoors');
    expect(buildJob(project, shop).files.map((f) => f.text)).toEqual(before);
    // The first drawer and the doors are as they were stored; the other drawers wait unmounted.
    expect(JSON.stringify(project.designObjects.slice(0, 2))).toBe(stored);
  });
});

const variants: [ConstructionStyle, 'doors' | 'drawers'][] = [
  ['frameless', 'doors'],
  ['frameless', 'drawers'],
  ['faceFrame', 'doors'],
  ['faceFrame', 'drawers'],
];

describe.each(variants)('a %s cabinet, %s only', (style, layout) => {
  const project = createBaseCabinetProject(style, layout);
  const job = buildJob(project, shop);
  const all = [...job.parts, ...job.cabinetParts];
  const lists = buildLists(job, project, shop, L);
  const names = all.map((p) => p.name);
  const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';
  const holes = (prefix: string) => job.cabinetParts.flatMap((p) => p.features.filter((f) => f.kind === 'hole' && f.id.startsWith(prefix)));

  it('has the parts of its layout and no others', () => {
    expect(new Set(names).size).toBe(names.length);
    const frame = names.filter((n) => /rail|stile/.test(n));
    if (layout === 'doors') {
      expect(names).toEqual(expect.arrayContaining(['Left door', 'Right door', 'Shelf']));
      expect(names.filter((n) => /[Dd]rawer|[Bb]ox/.test(n))).toEqual([]);
      expect(frame).toEqual(style === 'faceFrame' ? ['Left stile', 'Right stile', 'Top rail', 'Bottom rail'] : []);
      expect(holes('shelf-pin').length).toBeGreaterThan(0);
      expect(holes('slide-screw')).toEqual([]);
    } else {
      expect(names.filter((n) => /front$/.test(n) && !/box/.test(n))).toEqual(['Drawer 1 front', 'Drawer 2 front', 'Drawer 3 front']);
      expect(names.filter((n) => /box bottom/.test(n))).toEqual(['Drawer 1 box bottom', 'Drawer 2 box bottom', 'Drawer 3 box bottom']);
      expect(names.filter((n) => /door|Shelf/.test(n))).toEqual([]);
      expect(frame).toEqual(style === 'faceFrame' ? ['Left stile', 'Right stile', 'Top rail', 'Middle rail 1', 'Middle rail 2', 'Bottom rail'] : []);
      expect(names.filter((n) => /build-out strip/.test(n))).toHaveLength(style === 'faceFrame' ? 6 : 0);
      expect(holes('shelf-pin')).toEqual([]);
      expect(holes('hinge-plate')).toEqual([]);
    }
  });

  it('stacks the fronts up the cabinet without overlapping', () => {
    const fronts = job.parts.map((p) => ({ name: p.name, x0: p.placement!.origin[0], x1: p.placement!.origin[0] + p.size.width, y0: p.placement!.origin[1], y1: p.placement!.origin[1] + p.size.height }));
    for (const a of fronts) {
      expect(a.x0).toBeGreaterThanOrEqual(-0.01);
      expect(a.y1).toBeLessThanOrEqual(cabinetsOf(project)[0]!.size.height.mm + 0.01);
      for (const b of fronts) {
        if (a === b) continue;
        const apart = a.x1 <= b.x0 + 0.01 || b.x1 <= a.x0 + 0.01 || a.y1 <= b.y0 + 0.01 || b.y1 <= a.y0 + 0.01;
        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
    }
    if (layout === 'drawers') {
      // Equal openings; frameless, the outer fronts also cover the case edges.
      const openings = deriveCabinetOpenings(cabinetsOf(project)[0]!, shop.materials);
      expect(openings).toHaveLength(3);
      expect(Math.max(...openings.map((o) => o.height)) - Math.min(...openings.map((o) => o.height))).toBeLessThan(0.01);
    }
  });

  it('plans with nothing in the way and cuts every part out once', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    for (const part of all) {
      expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), part.name).toHaveLength(onCnc(part.id) ? 1 : 0);
      expect(cut.filter((name) => name === part.name), part.name).toHaveLength(onCnc(part.id) ? 0 : 1);
    }
    expect(lists.parts).toHaveLength(all.length);
    expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
    expect(new Set(job.plan.operations.map((o) => o.key)).size).toBe(job.plan.operations.length);
  });

  it('makes every feature: in a row of the plan, with the Kreg jig, or on the saw', () => {
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    const kregParts = new Set(lists.kreg.map((k) => k.part));
    const missing: string[] = [];
    for (const part of all) {
      for (const feature of part.features) {
        if (planned.has(`${part.id}:${feature.id}`)) continue;
        if (feature.kind === 'cutout' && !onCnc(part.id)) continue;
        if (feature.kind === 'pocketHole' && kregParts.has(part.name)) continue;
        missing.push(`${part.name}: ${feature.id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('writes files that parse and follow the post rules', async () => {
    expect(job.files.length).toBeGreaterThan(0);
    expect(new Set(job.files.map((f) => f.name)).size).toBe(job.files.length);
    for (const [i, file] of job.files.entries()) {
      const lines = file.text.split('\n');
      expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
      expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
      const attach = lines.filter((l) => /^M0 \(MSG, .*[Aa]ttach the probe/.test(l)).length;
      const changes = lines.filter((l) => l.startsWith('M0 (MSG, Router OFF. Change to ')).length;
      expect(attach, file.name).toBe(changes + 1);
      expect(lines.filter((l) => l.startsWith('G38.2 Z-80 F180')).length, file.name).toBe(attach);
      const program = job.programs[i]!;
      const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + (program.setup.pinHoles.length > 0 ? activeMachine(shop).flipPins.spoilboardDepth : 0) + THROUGH_EXTRA + 0.011);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });

  it('lists the hardware of its layout', () => {
    const items = lists.hardware.map((h) => `${h.quantity ?? ''} ${h.unit ?? ''} ${h.item}`).join('\n');
    const steps = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).join('\n');
    if (layout === 'doors') {
      expect(items).toMatch(/hinge|Blum Compact/i);
      expect(items).toMatch(/4\s+Generic 5 mm shelf pin/);
      expect(items).not.toMatch(/slide|washer-head/);
      expect(job.plan.installKit.length).toBeGreaterThan(0);
      expect(steps).toMatch(/support blocks/);
    } else {
      expect(items).not.toMatch(/hinge|shelf pin|support block|gap shim/i);
      // Three pairs of slides in all, and four front screws a drawer.
      const slides = lists.hardware.filter((h) => /slide,/.test(h.item));
      expect(slides.reduce((n, h) => n + (h.quantity ?? 0), 0)).toBe(3);
      expect(lists.hardware.filter((h) => /washer-head/.test(h.item)).reduce((n, h) => n + (h.quantity ?? 0), 0)).toBe(12);
      expect(job.plan.installKit).toEqual([]);
      expect(job.plan.operations.some((o) => o.kind === 'install')).toBe(false);
      expect(steps).not.toMatch(/hinges|support blocks/);
      if (style === 'faceFrame') expect(lists.shims?.quantity).toBe(18);
    }
  });
});

describe('slide pilot holes with several drawers', () => {
  it('are counted for the drawer they belong to', () => {
    const s = createStarterShop();
    const slide: Slide = { ...structuredClone(s.hardware.find((h) => h.kind === 'slide') as Slide), id: 'test-slide', generic: false, name: 'Test slide' };
    slide.holes = [
      { length: len('20"'), fromFront: [35, 227] },
      { length: len('22"'), fromFront: [35, 259] },
    ];
    s.hardware.push(slide);
    const project = createBaseCabinetProject('frameless', 'drawers', 2);
    // The second drawer gets its own settings, and with them another slide.
    setOwnFrontSettings(project, designsOf(project).filter(isDrawer)[1]!.id, true);
    designsOf(project).filter(isDrawer)[1]!.slide.slideId = 'test-slide';
    const job = buildJob(project, s);
    const rows = buildLists(job, project, s, L).hardware.filter((h) => /slide/i.test(h.item));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => /Test slide/.test(r.item))!.note).toMatch(/drills 4 pilot holes/);
    expect(rows.find((r) => !/Test slide/.test(r.item))!.note).toMatch(/by hand/);
  });
});
