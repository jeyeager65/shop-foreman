// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveParts, designsOf, drawerBox, isDrawer, shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { activeMachine } from '@/plan';
import { createStarterShop } from '@/libraries';
import type { ConstructionStyle, PlanWarning, Project } from '@/model';
import { layoutOpeningIds } from '@/design/bays';
import { type LayoutPreset } from '@/design/layout';
import { addTallCabinet, applyCabinetLayout, createBaseCabinetProject, createShopCabinetProject, setBays } from '@/samples/cabinet';
import { len } from '@/units';

const starter = createStarterShop();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];

/** A 42" base cabinet of two bays in a style and layout (its bottom fits the samples' stock). */
function twoBays(style: ConstructionStyle, layout: LayoutPreset = 'doors'): Project {
  const project = style === 'shop' ? createShopCabinetProject(layout) : createBaseCabinetProject(style, layout);
  const cabinet = cabinetsOf(project)[0]!;
  cabinet.size.width = len('42"');
  setBays(project, cabinet, 2);
  return project;
}

describe('bays', () => {
  it('keeps the first bay\'s opening ids, and numbers the others', () => {
    const project = twoBays('frameless', 'drawerOverDoors');
    const cabinet = cabinetsOf(project)[0]!;
    const openings = deriveCabinetOpenings(cabinet, project.materials);
    expect(openings.map((o) => o.id)).toEqual([`${cabinet.id}/drawer`, `${cabinet.id}/drawer~b2`, `${cabinet.id}/doors`, `${cabinet.id}/doors~b2`]);
    expect(openings.map((o) => o.bay)).toEqual([1, 2, 1, 2]);
    // Every opening has a front, the second bay's named by it.
    const names = designsOf(project).map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(['Doors', 'Doors, bay 2', 'Drawer', 'Drawer, bay 2']));
  });

  it('shares the width between bays, a partition (or a mullion) between them', () => {
    for (const style of ['frameless', 'shop', 'faceFrame'] as const) {
      const project = twoBays(style);
      const cabinet = cabinetsOf(project)[0]!;
      const [one, two] = deriveCabinetOpenings(cabinet, project.materials);
      const single = deriveCabinetOpenings({ ...cabinet, layout: { ...cabinet.layout, bays: undefined } }, project.materials)[0]!;
      const between = style === 'faceFrame' ? cabinet.faceFrame.stileWidth.mm : project.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
      expect(one!.width).toBeCloseTo((single.width - between) / 2);
      expect(two!.width).toBeCloseTo(one!.width);
      expect(two!.origin.x).toBeCloseTo(one!.origin.x + one!.width + between);
    }
  });

  it('frameless: the fronts meet over the partition, the gap between them', () => {
    const project = twoBays('frameless');
    const shop = shopFor(project, starter);
    const cabinet = cabinetsOf(project)[0]!;
    const [one, two] = deriveCabinetOpenings(cabinet, project.materials);
    const doors = deriveParts(project, shop).filter((p) => !p.role);
    expect(doors).toHaveLength(4);
    const edges = doors.map((p) => ({ from: p.placement!.origin[0], to: p.placement!.origin[0] + p.size.width })).sort((a, b) => a.from - b.from);
    const middle = one!.origin.x + one!.width + (two!.origin.x - one!.origin.x - one!.width) / 2;
    const gap = cabinet.frameless.frontGap.mm;
    // The second door's right edge and the third's left edge stand half the gap either side of the partition's middle.
    expect(edges[1]!.to).toBeCloseTo(middle - gap / 2);
    expect(edges[2]!.from).toBeCloseTo(middle + gap / 2);
    // The outer edges keep the reveal.
    const reveal = cabinet.frameless.reveal.mm;
    expect(edges[0]!.from).toBeCloseTo(reveal);
    expect(edges[3]!.to).toBeCloseTo(cabinet.size.width.mm - reveal);
  });

  it('a drawer in each bay, its box as wide as its bay allows', () => {
    const project = twoBays('frameless', 'drawerOverDoors');
    const shop = shopFor(project, starter);
    const drawers = designsOf(project).filter(isDrawer);
    expect(drawers).toHaveLength(2);
    const [a, b] = drawers.map((d) => drawerBox(d, project, shop)!);
    expect(a!.parts.find((p) => p.role === 'boxFront')!.size.width).toBeCloseTo(b!.parts.find((p) => p.role === 'boxFront')!.size.width);
  });

  it('one bay is the cabinet as before', () => {
    const project = createBaseCabinetProject('frameless');
    const cabinet = cabinetsOf(project)[0]!;
    const before = JSON.stringify(deriveCabinetOpenings(cabinet, project.materials));
    setBays(project, cabinet, 2);
    setBays(project, cabinet, 1);
    expect(cabinet.layout.bays).toBeUndefined();
    expect(JSON.stringify(deriveCabinetOpenings(cabinet, project.materials))).toBe(before);
  });

  it('plans a two-bay cabinet with nothing in the way', () => {
    const job = buildJob(twoBays('shop'), starter);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });
});

describe('partitions', () => {
  const partsOf = (project: Project) => deriveCabinetParts(project, shopFor(project, starter));

  it('stands one between two bays, from the bottom to the stretchers, its shelves per bay', () => {
    const project = twoBays('frameless');
    const cabinet = cabinetsOf(project)[0]!;
    const parts = partsOf(project);
    const [partition, ...more] = parts.filter((p) => p.role === 'partition');
    expect(more).toEqual([]);
    const t = project.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    const [one] = deriveCabinetOpenings(cabinet, project.materials);
    expect(partition!.placement!.origin[0]).toBeCloseTo(one!.origin.x + one!.width + t);
    const shelves = parts.filter((p) => p.role === 'shelf');
    expect(shelves.length % 2).toBe(0);
    expect(shelves.every((s) => s.size.width < one!.width)).toBe(true);
  });

  it('joins it the case joint\'s way: dados in the bottom and the stretchers, pocket holes in it, or screws through them', () => {
    for (const joint of ['dado', 'pocketScrews', 'throughScrews'] as const) {
      const project = twoBays('frameless');
      cabinetsOf(project)[0]!.joinery.case = joint;
      const parts = partsOf(project);
      const partition = parts.find((p) => p.role === 'partition')!;
      const bottom = parts.find((p) => p.id.endsWith('/bottom'))!;
      if (joint === 'dado') expect(bottom.features.some((f) => f.id === 'dado-p1')).toBe(true);
      if (joint === 'pocketScrews') expect(partition.features.filter((f) => f.kind === 'pocketHole').length).toBeGreaterThan(2);
      if (joint === 'throughScrews') expect(bottom.features.some((f) => f.id.startsWith('case-screw-p1'))).toBe(true);
    }
  });

  it('takes the hinge plates of the doors hinged on it on the face toward them, and shelf pins through it', () => {
    const project = twoBays('frameless');
    const partition = partsOf(project).find((p) => p.role === 'partition')!;
    const plates = partition.features.filter((f) => f.id.startsWith('hinge-plate-'));
    expect(plates.some((f) => f.face === 'A')).toBe(true);
    expect(plates.some((f) => f.face === 'B')).toBe(true);
    const t = partition.size.thickness;
    expect(plates.every((f) => f.kind === 'hole' && f.depth <= (t - 3) / 2 + 1e-6)).toBe(true);
    const pins = partition.features.filter((f) => f.id.startsWith('shelf-pin-'));
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.every((f) => f.kind === 'hole' && f.depth === t)).toBe(true);
  });

  it('carries the slides of the drawers beside it, as a side does', () => {
    const project = twoBays('frameless', 'drawers');
    // A slide with its screw holes, so they are drilled.
    const withHoles = createStarterShop();
    for (const h of withHoles.hardware) if (h.kind === 'slide') h.holes = h.lengths.map((length) => ({ length, fromFront: [37, 133, 261] }));
    const parts = deriveCabinetParts(project, shopFor(project, withHoles));
    const side = parts.find((p) => p.id.endsWith('/side-left'))!;
    const partition = parts.find((p) => p.role === 'partition')!;
    const screws = partition.features.filter((f) => f.id.startsWith('slide-screw-'));
    expect(side.features.some((f) => f.id.startsWith('slide-screw-'))).toBe(true);
    expect(screws.some((f) => f.face === 'A') && screws.some((f) => f.face === 'B')).toBe(true);
  });

  it('a tall cabinet\'s fixed shelf is split per bay', () => {
    const project = createBaseCabinetProject('frameless');
    const tall = addTallCabinet(project, { name: 'Tall' });
    const cabinet = cabinetsOf(project).find((c) => c.id === tall.id)!;
    cabinet.size.width = len('36"');
    applyCabinetLayout(project, cabinet, 'doorsOverDoors');
    setBays(project, cabinet, 2);
    const fixed = partsOf(project).filter((p) => p.designObjectId === cabinet.id && p.id.includes('fixed-shelf'));
    expect(fixed).toHaveLength(2);
  });

  for (const style of ['frameless', 'shop'] as const) {
    for (const layout of ['doors', 'drawerOverDoors', 'drawers'] as const) {
      it(`plans a two-bay ${style} cabinet (${layout}) with nothing in the way, every feature made`, () => {
        const project = twoBays(style, layout);
        const job = buildJob(project, starter);
        expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
        const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
        const partition = job.cabinetParts.find((p) => p.role === 'partition')!;
        const missing = partition.features.filter((f) => f.kind !== 'cutout' && f.kind !== 'pocketHole' && !planned.has(`${partition.id}:${f.id}`));
        expect(missing.map((f) => f.id)).toEqual([]);
      });
    }
  }
});

describe('mullions (face frame)', () => {
  const partsOf = (project: Project) => deriveCabinetParts(project, shopFor(project, starter));

  it('stands a mullion between the rails, the middle rails split per bay; with its partition turned off, nothing behind it', () => {
    const project = twoBays('faceFrame', 'drawerOverDoors');
    const cabinet = cabinetsOf(project)[0]!;
    // A partition stands behind the mullion to start with.
    expect(partsOf(project).filter((p) => p.role === 'partition')).toHaveLength(1);
    cabinet.layout = { ...cabinet.layout, partitions: false };
    const parts = partsOf(project);
    const mullion = parts.find((p) => p.id.endsWith('/frame-mullion-1'))!;
    expect(mullion.size.width).toBeCloseTo(cabinet.faceFrame.stileWidth.mm);
    const rail = cabinet.faceFrame.railWidth.mm;
    expect(mullion.size.height).toBeCloseTo(cabinet.size.height.mm - cabinet.toeKick.height.mm - 2 * rail);
    expect(mullion.features.filter((f) => f.kind === 'pocketHole').length).toBeGreaterThanOrEqual(2);
    expect(parts.filter((p) => p.id.includes('/frame-rail-mid-1'))).toHaveLength(2);
    expect(parts.some((p) => p.role === 'partition')).toBe(false);
    // The shelves run the full width behind it.
    const [one] = deriveCabinetOpenings(cabinet, project.materials);
    expect(parts.filter((p) => p.role === 'shelf').every((s) => s.size.width > 2 * one!.width)).toBe(true);
  });

  it('a partition behind it, centred on it, the shelves per bay', () => {
    const project = twoBays('faceFrame');
    const parts = partsOf(project);
    const mullion = parts.find((p) => p.id.endsWith('/frame-mullion-1'))!;
    const partition = parts.find((p) => p.role === 'partition')!;
    const t = partition.size.thickness;
    expect(partition.placement!.origin[0] - t / 2).toBeCloseTo(mullion.placement!.origin[0] + mullion.size.width / 2);
    const shelves = parts.filter((p) => p.role === 'shelf');
    expect(shelves.length % 2).toBe(0);
  });

  it('hangs the drawers on rear brackets', () => {
    const project = twoBays('faceFrame', 'drawerOverDoors');
    const shop = shopFor(project, starter);
    for (const d of designsOf(project).filter(isDrawer)) expect(drawerBox(d, project, shop)!.mount).toBe('rearBrackets');
  });

  it('plans with nothing in the way, every feature made', () => {
    const project = twoBays('faceFrame', 'drawerOverDoors');
    const job = buildJob(project, starter);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    const mullion = job.cabinetParts.find((p) => p.id.endsWith('/frame-mullion-1'))!;
    expect(mullion.features.filter((f) => f.kind !== 'cutout' && f.kind !== 'pocketHole' && !planned.has(`${mullion.id}:${f.id}`))).toEqual([]);
  });
});

describe('bays in the lists and the checklist', () => {
  const L = (mm: number) => `${Math.round(mm)}`;
  it('lists half-overlay plates for the hinges on a frameless partition, and fits the partition', () => {
    const project = twoBays('frameless');
    const job = buildJob(project, starter);
    const rows = buildLists(job, project, starter, L).hardware;
    expect(rows.find((r) => r.item.startsWith('Half-overlay mounting plates'))?.quantity).toBeGreaterThan(0);
    const steps = buildChecklistSections(project, job.plan, job.programs, starter.tools, activeMachine(starter)).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((t) => t.startsWith('Fit the partitions'))).toBe(true);
  });

  it('joins the mullions with the frame', () => {
    const project = twoBays('faceFrame');
    const job = buildJob(project, starter);
    const steps = buildChecklistSections(project, job.plan, job.programs, starter.tools, activeMachine(starter)).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((t) => t.startsWith('Join the mullions'))).toBe(true);
  });
});

describe('bays in the 3D view', () => {
  it('hinges the middle doors on the partition or the mullion, and stops them where they would meet', async () => {
    const { buildCabinetAssembly, MAX_DOOR_OPEN_DEG, placedDoorPose } = await import('@/design/cabinetAssembly');
    for (const style of ['frameless', 'shop', 'faceFrame'] as const) {
      const project = twoBays(style);
      const shop = shopFor(project, starter);
      const built = buildCabinetAssembly([...deriveCabinetParts(project, shop), ...deriveParts(project, shop)], shop.hardware);
      const doors = built.parts.filter((p) => p.swing);
      expect(doors, style).toHaveLength(4);
      // Every door moves on its hinges: none is left on a plain pivot.
      expect(doors.every((d) => d.hinges), style).toBe(true);
      const mids = doors.map((d) => d.hinges!.memberMid);
      const shared = doors.filter((_, i) => mids.filter((m) => Math.abs(m - mids[i]!) < 0.01).length === 2);
      expect(shared, style).toHaveLength(2);
      const all = [...deriveCabinetParts(project, shop), ...deriveParts(project, shop)];
      for (const door of shared) {
        const part = all.find((p) => p.id === door.partId)!;
        const h = door.hinges!;
        // They open a useful way, and no further than face to face.
        expect(door.shared!.openLimit, style).toBeGreaterThanOrEqual(85);
        expect(door.shared!.openLimit, style).toBeLessThanOrEqual(95);
        // At every angle the view can ask for, the door keeps to its own side of the middle of what it shares.
        for (let deg = 0; deg <= MAX_DOOR_OPEN_DEG; deg++) {
          const pose = placedDoorPose(door, deg);
          const a = (pose.deg * Math.PI) / 180;
          const corners = [0, part.size.width].flatMap((u) => [0, part.size.thickness].map((v) => pose.corner[0] + u * Math.cos(a) - v * Math.sin(a)));
          expect(Math.min(...corners), `${style} ${deg}`).toBeGreaterThan(h.dir * (h.memberMid - h.origin.x));
        }
      }
      // The outer doors open all the way.
      expect(doors.filter((d) => !shared.includes(d)).every((d) => !d.shared), style).toBe(true);
    }
  });
});

/** Furniture: more than four sections sharing their panels. */
describe('six bays', () => {
  for (const construction of ['frameless', 'shop', 'faceFrame'] as const) {
    it(`${construction}: a 90" case of six bays of doors has five dividers between them, a front on every opening, and makes a job`, () => {
      const project = createBaseCabinetProject(construction, 'doors');
      const cabinet = cabinetsOf(project)[0]!;
      cabinet.size.width = len('90"');
      setBays(project, cabinet, 6);
      expect(cabinet.layout.bays).toHaveLength(6);
      // More than six is held at six.
      setBays(project, cabinet, 9);
      expect(cabinet.layout.bays).toHaveLength(6);
      const openings = layoutOpeningIds(cabinet).map((o) => o.id);
      expect(openings).toHaveLength(6);
      expect(openings.at(-1)).toBe(`${cabinet.id}/${cabinet.layout.rows[0]!.id}~b6`);
      const fronts = designsOf(project).filter((d) => openings.includes(d.mounting.openingId));
      expect(fronts).toHaveLength(6);
      const job = buildJob({ ...project, slug: 'six' }, starter);
      const between = job.cabinetParts.filter((p) => p.role === 'partition' || p.name.startsWith('Mullion'));
      // (Behind a face frame, a mullion and the partition behind it.)
      expect(between).toHaveLength(construction === 'faceFrame' ? 10 : 5);
      expect(job.files.length).toBeGreaterThan(0);
    });
  }
});
