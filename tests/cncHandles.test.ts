// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { outsidePath } from '@/cam/cuts';
import { WOOD_WALL, buildCabinetAssembly, cabinetsOf, deriveCabinetParts, deriveHandleParts, designsOf, doorHandleChoice, footWidth, handleHeight, handleLook, isHandle, madeHandle, printedHandleProblems, pullProfile } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { printedHandlesOf } from '@/jigs/printedHandles';
import { PLYWOOD_1_4_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, STARTER_CNC_HANDLES, createStarterShop } from '@/libraries';
import type { PlanWarning, Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Handles cut out of wood on the CNC: extra parts in the job, one for every front. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const [bar, arch] = STARTER_CNC_HANDLES as [(typeof STARTER_CNC_HANDLES)[0], (typeof STARTER_CNC_HANDLES)[0]];
const withHandle = (project: Project, handleId: string): Project => {
  for (const d of designsOf(project)) {
    if (d.template === 'drawer') d.handle = { handleId };
    else d.handle = doorHandleChoice(handleId);
  }
  return project;
};

describe('the wooden handles in the library', () => {
  it('are a bar pull and an arch pull of 3/4" solid wood, on the same holes as a bought one', () => {
    expect(STARTER_CNC_HANDLES.map((h) => [h.cnc!.design, h.holes, h.spacing, h.hole.diameter, h.cnc!.materialId])).toEqual([
      ['bar', 2, 96, 5, SOLID_WOOD_3_4_ID],
      ['arch', 2, 96, 5, SOLID_WOOD_3_4_ID],
    ]);
    expect(STARTER_CNC_HANDLES.every((h) => h.tuneMe.includes('cnc') && printedHandleProblems(h, shop.materials).length === 0)).toBe(true);
    // As wide as the stock is thick, with more wood round the pilot than a print has plastic.
    const made = madeHandle(bar, shop.materials)!;
    expect([made.how, made.width, made.holeFor]).toEqual(['cnc', shop.materials.find((m) => m.id === SOLID_WOOD_3_4_ID)!.measuredThickness.mm, 'screw']);
    expect(footWidth(bar)).toBeCloseTo(bar.cnc!.pilot.diameter + 2 * WOOD_WALL.round, 6);
  });

  it('stock too thin for the pilot hole is said', () => {
    const thin = { ...bar, cnc: { ...bar.cnc!, materialId: PLYWOOD_1_4_ID } };
    expect(printedHandleProblems(thin, shop.materials).join(' ')).toMatch(/too narrow for its screw/);
    const project = withHandle(createBaseCabinetProject('frameless'), bar.id);
    const own = createStarterShop();
    own.hardware.filter(isHandle).find((h) => h.id === bar.id)!.cnc!.materialId = PLYWOOD_1_4_ID;
    expect(() => deriveHandleParts(project, own)).toThrow(/Wooden bar pull.*cannot be made/);
  });
});

describe('a wooden handle as a part', () => {
  const project = withHandle(createBaseCabinetProject('frameless'), arch.id);
  const parts = deriveHandleParts(project, shop);

  it('there is one for every front, its side profile the outline, its grain along its length', () => {
    expect(parts.map((p) => [p.id, p.name, p.role, p.materialId, p.grain, p.handleId])).toEqual([
      ['doors-1/door-left-handle', 'Left door handle', 'handle', SOLID_WOOD_3_4_ID, 'width', arch.id],
      ['doors-1/door-right-handle', 'Right door handle', 'handle', SOLID_WOOD_3_4_ID, 'width', arch.id],
      ['drawer-1/front-handle', 'Drawer front handle', 'handle', SOLID_WOOD_3_4_ID, 'width', arch.id],
    ]);
    const part = parts[0]!;
    expect(part.size.width).toBeCloseTo(handleLook(arch).length, 6);
    expect(part.size.height).toBe(handleHeight(arch));
    expect(part.size.thickness).toBe(shop.materials.find((m) => m.id === SOLID_WOOD_3_4_ID)!.measuredThickness.mm);
    const outline = part.features.find((f) => f.kind === 'cutout')!.outline;
    expect(outline).toHaveLength(pullProfile(arch).length);
    expect(Math.min(...outline.map((p) => p.x))).toBeCloseTo(0, 6);
    expect(Math.max(...outline.map((p) => p.x))).toBeCloseTo(part.size.width, 6);
    expect(Math.min(...outline.map((p) => p.y))).toBeCloseTo(0, 6);
    expect(Math.max(...outline.map((p) => p.y))).toBeCloseTo(part.size.height, 6);
  });

  it('is among the cabinet parts, but has no place in the cabinet: the picture leaves it out', () => {
    const all = deriveCabinetParts(project, shop);
    expect(all.filter((p) => p.role === 'handle')).toHaveLength(3);
    expect(all.filter((p) => p.role === 'handle').every((p) => !p.placement)).toBe(true);
    expect(buildCabinetAssembly(all).parts.some((p) => p.partId.endsWith('-handle'))).toBe(false);
    // No wooden handle chosen: none.
    expect(deriveHandleParts(createBaseCabinetProject('frameless'), shop)).toEqual([]);
    expect(deriveHandleParts(withHandle(createBaseCabinetProject('frameless'), 'printed-bar-96'), shop)).toEqual([]);
  });

  it('a cabinet made twice has twice the handles, each with its copy\'s tag', () => {
    const twice = withHandle(createShopCabinetProject(), bar.id);
    cabinetsOf(twice)[0]!.quantity = 2;
    const made = deriveHandleParts(twice, shop);
    expect(made).toHaveLength(6);
    expect(made.filter((p) => p.copy === 2)).toHaveLength(3);
    expect(new Set(made.map((p) => p.id)).size).toBe(6);
  });
});

describe('the path round an outline that is not square', () => {
  it('stays the bit\'s radius off every side of a curve made of flats', () => {
    const outline = pullProfile(arch).map(([x, y]) => ({ x, y }));
    const offset = 3.175;
    const path = outsidePath(outline, offset);
    expect(path).toHaveLength(outline.length);
    const toSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    for (const p of path) {
      const nearest = Math.min(...outline.map((a, i) => toSegment(p, a, outline[(i + 1) % outline.length]!)));
      // Never inside the part; at a corner a little further out than along a side.
      expect(nearest).toBeGreaterThan(offset - 1e-6);
      expect(nearest).toBeLessThan(offset * 1.5);
    }
    // A square is as it was: the corners are the sum of the two sides' normals.
    expect(outsidePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }], 2)).toEqual([
      { x: -2, y: -2 },
      { x: -2, y: 7 },
      { x: 12, y: 7 },
      { x: 12, y: -2 },
    ]);
  });
});

describe('the job with wooden handles', () => {
  for (const handle of [bar, arch]) {
    it(`${handle.name}: a blank of its own wood, cut on the CNC, G-code that parses`, async () => {
      const project = withHandle(createBaseCabinetProject('frameless'), handle.id);
      const job = buildJob(project, shop);
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
      const ids = job.cabinetParts.filter((p) => p.role === 'handle').map((p) => p.id);
      expect(ids).toHaveLength(3);
      const blank = job.plan.blanks.find((b) => b.partIds.some((id) => ids.includes(id)))!;
      expect(blank.materialId).toBe(SOLID_WOOD_3_4_ID);
      expect([...blank.partIds].sort()).toEqual([...ids].sort());
      expect(blank.setups).toHaveLength(1);
      for (const plan of job.plan.parts.filter((p) => ids.includes(p.partId))) {
        expect([plan.cutOut, plan.options]).toEqual(['cnc', ['cnc']]);
        expect(plan.steps.map((s) => s.by)).toEqual(['cnc', 'byHand', 'byHand']);
      }
      // The fronts still get the holes for them.
      expect(job.plan.operations.some((o) => o.key === 'doors:holes:handle')).toBe(true);
      for (const file of job.files) {
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });
  }

  it('handles are cut apart from the parts of the cabinet: blanks and Plan rows of their own, even from the same material', () => {
    const own = createStarterShop();
    // Cut from the plywood the case is made of.
    for (const h of own.hardware.filter(isHandle)) if (h.cnc) h.cnc.materialId = PLYWOOD_3_4_ID;
    const plain = buildJob(createBaseCabinetProject('frameless'), own);
    const job = buildJob(withHandle(createBaseCabinetProject('frameless'), bar.id), own);
    const isHandlePart = (id: string) => id.endsWith('-handle');
    const mixed = job.plan.blanks.filter((b) => b.partIds.some(isHandlePart) && !b.partIds.every(isHandlePart));
    expect(mixed).toEqual([]);
    const theirs = job.plan.blanks.filter((b) => b.partIds.some(isHandlePart));
    expect(theirs.map((b) => [b.materialId, b.partIds.length, b.label])).toEqual([[PLYWOOD_3_4_ID, 3, '3/4" Plywood, handles']]);
    // The cabinet's blanks are as they are without handles.
    expect(job.plan.blanks.filter((b) => !b.partIds.some(isHandlePart)).map((b) => [b.materialId, b.partIds, b.size])).toEqual(plain.plan.blanks.map((b) => [b.materialId, b.partIds, b.size]));
    // Their cutout is a row of its own, after the cabinet's; the cabinet's rows are as they were.
    const keys = job.plan.operations.map((o) => o.key);
    expect(keys).toContain('handles:cutout');
    expect(job.plan.operations.find((o) => o.key === 'handles:cutout')!.label).toBe('Handles: cutout');
    expect(keys.filter((k) => !/handle/.test(k))).toEqual(plain.plan.operations.map((o) => o.key));
    const caseCut = job.plan.operations.find((o) => o.key === 'case:cutout')!;
    expect(caseCut.source.kind === 'features' && caseCut.source.refs.some((r) => isHandlePart(r.partId))).toBe(false);
  });

  it('lists its wood screws, and has nothing to print', () => {
    const project = withHandle(createBaseCabinetProject('frameless'), bar.id);
    const job = buildJob(project, shop);
    const hardware = buildLists(job, project, shop, L).hardware;
    expect(hardware.filter((h) => h.group === 'Wooden handles').map((h) => [h.item, h.quantity])).toEqual([['#8 wood screws', 6]]);
    expect(hardware.filter((h) => h.item === bar.name).map((h) => [h.group, h.quantity])).toEqual([
      ['Doors', 2],
      ['Drawer', 1],
    ]);
    expect(printedHandlesOf([...job.parts, ...job.cabinetParts], shop.hardware)).toEqual([]);
  });
});
