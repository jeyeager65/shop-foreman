// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CASTER_INSET, CASTER_PILOT, casterUnder, casterUnderChoice, setCasterUnderChoice, bottomKindOf, boxOffFloor, cabinetsOf, casterGroups, casterLoadProblems, casterShares, deriveCabinetParts, partsWeight, setBottomKind, setupSummary, shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { activeMachine } from '@/plan';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';
import { GENERIC_CASTER_ID, STARTER_CASTERS, createStarterShop } from '@/libraries';
import type { Caster, CasesContext, PlanWarning, Project } from '@/model';
import { createIslandProject, createShopCabinetProject } from '@/samples/cabinet';
import { exportProject } from '@/storage/projectFile';

describe('caster hardware', () => {
  it('has a generic entry, with a brake, and a starter without one', () => {
    const generic = STARTER_CASTERS.find((c) => c.id === GENERIC_CASTER_ID)!;
    expect(generic.generic).toBe(true);
    expect(generic.locking).toBe(true);
    expect(STARTER_CASTERS.some((c) => !c.locking)).toBe(true);
    for (const c of STARTER_CASTERS) expect(c.holes.x < c.plate.width && c.holes.y < c.plate.length).toBe(true);
  });

  it('goes with a project file when the project uses it', () => {
    const shop = createStarterShop();
    const own: Caster = { ...STARTER_CASTERS[0]!, id: 'my-caster', name: 'My caster', generic: false };
    shop.hardware.push(own);
    const project = createShopCabinetProject();
    expect(exportProject(project, shop).library.hardware.some((h) => h.id === 'my-caster')).toBe(false);
    (project.context as CasesContext).settings.toeKick = { ...(project.context as CasesContext).settings.toeKick, off: true, casters: { casterId: 'my-caster' } };
    expect(exportProject(project, shop).library.hardware.some((h) => h.id === 'my-caster')).toBe(true);
  });
});

const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const starter = createStarterShop();
/** On casters, with a second layer under the case unless `under` says otherwise (`auto`: the field left out). */
function onCasters(project: Project = createShopCabinetProject(), under: 'layer' | 'pads' | 'auto' = 'layer'): Project {
  const kick = (project.context as CasesContext).settings.toeKick;
  setBottomKind(kick, 'casters', starter.hardware);
  setCasterUnderChoice(kick, under);
  return project;
}

describe('a cabinet on casters', () => {
  it('is a third state of the bottom: a flat bottom with the generic caster', () => {
    const project = onCasters();
    const kick = (project.context as CasesContext).settings.toeKick;
    expect(bottomKindOf(kick)).toBe('casters');
    expect(kick).toMatchObject({ off: true, casters: { casterId: GENERIC_CASTER_ID } });
    expect(casterUnderChoice(kick)).toBe('layer');
    setCasterUnderChoice(kick, 'auto');
    expect(kick.casters).toEqual({ casterId: GENERIC_CASTER_ID });
    expect(setupSummary(project, starter.hardware, (mm) => `${mm}`)).toContain('on casters');
    setBottomKind(kick, 'flat', starter.hardware);
    expect(bottomKindOf(kick)).toBe('flat');
    expect(kick.casters).toBeUndefined();
    setBottomKind(kick, 'toeKick', starter.hardware);
    expect(kick.off).toBeUndefined();
  });

  it('gets a second layer under the whole case, its casters\' pilot holes in face B', () => {
    const project = onCasters();
    const shop = shopFor(project, starter);
    const [cabinet] = cabinetsOf(project);
    const parts = deriveCabinetParts(project, shop).filter((p) => p.designObjectId === cabinet!.id);
    const layer = parts.find((p) => p.id.endsWith('/bottom-under'))!;
    expect(layer.size).toMatchObject({ width: cabinet!.size.width.mm, height: cabinet!.size.depth.mm });
    expect(layer.placement!.origin[1]).toBe(0);
    const holes = layer.features.filter((f) => f.kind === 'hole');
    expect(holes).toHaveLength(16);
    expect(holes.every((h) => h.face === 'B' && h.kind === 'hole' && h.diameter === CASTER_PILOT.diameter && h.hardwareId === GENERIC_CASTER_ID)).toBe(true);
    // The first caster's plate is in from the front-left corner by the inset; its holes centred on the plate.
    const caster = STARTER_CASTERS[0]!;
    const xs = holes.map((h) => (h.kind === 'hole' ? h.center.x : 0));
    expect(Math.min(...xs)).toBeCloseTo(CASTER_INSET + (caster.plate.width - caster.holes.x) / 2);
    // No toe kick board, and the sides are plain rectangles.
    expect(parts.some((p) => p.role === 'toeKick')).toBe(false);
  });

  it('stands its box the layer and the casters off the floor', () => {
    const project = onCasters();
    const shop = shopFor(project, starter);
    const [cabinet] = cabinetsOf(project);
    const t = shop.materials.find((m) => m.id === cabinet!.materials.caseId)!.measuredThickness.mm;
    expect(boxOffFloor(cabinet!, shop.materials, shop.hardware)).toBeCloseTo(t + STARTER_CASTERS[0]!.overallHeight.mm);
    expect(boxOffFloor(cabinetsOf(createShopCabinetProject())[0]!, shop.materials, shop.hardware)).toBeUndefined();
  });

  it('a cabinet can be on casters when the project is not', () => {
    const project = createShopCabinetProject();
    const own = (project.context as CasesContext).pieces[0]!;
    own.overrides = { toeKick: structuredClone((project.context as CasesContext).settings.toeKick) };
    setBottomKind(own.overrides.toeKick!, 'casters', starter.hardware);
    expect(deriveCabinetParts(project, shopFor(project, starter)).some((p) => p.id.endsWith('/caster-pad-1'))).toBe(true);
  });

  it('plans with nothing in the way, the pilot holes on the CNC', () => {
    const project = onCasters();
    const job = buildJob(project, starter);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => r.featureId) : [])));
    expect([...planned].some((id) => id.startsWith('caster-screw-'))).toBe(true);
  });
});

describe('a pad under each caster', () => {
  it('is what a cabinet on its own gets when nothing is said, and a run or an island a second layer', () => {
    const kick = (onCasters(undefined, 'auto').context as CasesContext).settings.toeKick;
    expect(casterUnder(kick, 1)).toBe('pads');
    expect(casterUnder(kick, 3)).toBe('layer');
    expect(casterUnder({ ...kick, casters: { ...kick.casters!, under: 'layer' } }, 1)).toBe('layer');
    expect(casterUnder({ ...kick, casters: { ...kick.casters!, under: 'pads' } }, 3)).toBe('pads');
    expect(casterGroups(onCasters(undefined, 'auto'), starter.hardware)[0]!.under).toBe('pads');
  });

  it('four pads, one in each corner, flush with the case and reaching past the plate, each with its four pilot holes', () => {
    const project = onCasters(undefined, 'auto');
    const shop = shopFor(project, starter);
    const [cabinet] = cabinetsOf(project);
    const parts = deriveCabinetParts(project, shop).filter((p) => p.designObjectId === cabinet!.id);
    expect(parts.some((p) => p.id.endsWith('/bottom-under'))).toBe(false);
    const pads = parts.filter((p) => /\/caster-pad-\d$/.test(p.id));
    expect(pads.map((p) => p.name)).toEqual(['Caster pad', 'Caster pad', 'Caster pad', 'Caster pad']);
    const caster = STARTER_CASTERS[0]!;
    const [W, D] = [cabinet!.size.width.mm, cabinet!.size.depth.mm];
    const layer = deriveCabinetParts(onCasters(), shopFor(onCasters(), starter)).find((p) => p.id.endsWith('/bottom-under'))!;
    const where = (p: (typeof pads)[number], h: { x: number; y: number }) => ({ x: p.placement!.origin[0] + h.x, y: -p.placement!.origin[2] + h.y });
    const drilled: { x: number; y: number }[] = [];
    for (const pad of pads) {
      // The case material, under the case, its holes in face B.
      expect(pad.materialId).toBe(cabinet!.materials.caseId);
      expect(pad.size.thickness).toBe(layer.size.thickness);
      expect(pad.placement!.origin[1]).toBe(0);
      expect(pad.size.width).toBeCloseTo(caster.plate.width + 2 * CASTER_INSET, 6);
      expect(pad.size.height).toBeCloseTo(caster.plate.length + 2 * CASTER_INSET, 6);
      // In a corner: two of its edges are the cabinet's.
      const [x0, y0] = [pad.placement!.origin[0], -pad.placement!.origin[2]];
      expect(Math.min(Math.abs(x0), Math.abs(x0 + pad.size.width - W))).toBeLessThan(1e-6);
      expect(Math.min(Math.abs(y0), Math.abs(y0 + pad.size.height - D))).toBeLessThan(1e-6);
      const holes = pad.features.filter((f) => f.kind === 'hole');
      expect(holes).toHaveLength(4);
      for (const h of holes) {
        if (h.kind !== 'hole') continue;
        expect(h.face).toBe('B');
        expect(h.center.x).toBeGreaterThan(CASTER_INSET - 1e-6);
        expect(h.center.x).toBeLessThan(pad.size.width - CASTER_INSET + 1e-6);
        drilled.push(where(pad, h.center));
      }
    }
    // The casters stand where they do under a second layer: the same sixteen holes.
    const key = (h: { x: number; y: number }) => `${h.x.toFixed(3)},${h.y.toFixed(3)}`;
    expect(drilled.map(key).sort()).toEqual(layer.features.flatMap((f) => (f.kind === 'hole' ? [key(f.center)] : [])).sort());
    // And the box stands as high: a pad is as thick as the layer.
    expect(boxOffFloor(cabinet!, shop.materials, shop.hardware)).toBe(boxOffFloor(cabinetsOf(onCasters())[0]!, shop.materials, shop.hardware));
  });

  it('under a run when asked for: a pad each side of a join, with two of the caster\'s screws in each', () => {
    const project = createIslandProject();
    for (const run of (project.context as CasesContext).runs) {
      setBottomKind(run.shared.toeKick, 'casters', starter.hardware);
      setCasterUnderChoice(run.shared.toeKick, 'pads');
    }
    const shop = shopFor(project, starter);
    const [g] = casterGroups(project, shop.hardware);
    expect(g!.under).toBe('pads');
    const parts = deriveCabinetParts(project, shop);
    expect(parts.some((p) => p.id.endsWith('/bottom-under'))).toBe(false);
    const pads = parts.filter((p) => /\/caster-pad-\d+$/.test(p.id));
    // Every screw of every caster is in a pad.
    expect(pads.reduce((n, p) => n + p.features.filter((f) => f.kind === 'hole').length, 0)).toBe(4 * g!.places.length);
    expect(pads.some((p) => p.features.filter((f) => f.kind === 'hole').length === 2)).toBe(true);
    for (const pad of pads) {
      const cabinet = cabinetsOf(project).find((c) => c.id === pad.designObjectId)!;
      const [x0, y0] = [pad.placement!.origin[0], -pad.placement!.origin[2]];
      // Inside its own cabinet's plan, every hole clear of its edges.
      expect(x0).toBeGreaterThanOrEqual(-1e-6);
      expect(x0 + pad.size.width).toBeLessThanOrEqual(cabinet.size.width.mm + 1e-6);
      expect(y0).toBeGreaterThanOrEqual(-1e-6);
      expect(y0 + pad.size.height).toBeLessThanOrEqual(cabinet.size.depth.mm + 1e-6);
      for (const f of pad.features) if (f.kind === 'hole') expect(f.center.x > 2 && f.center.x < pad.size.width - 2 && f.center.y > 2 && f.center.y < pad.size.height - 2).toBe(true);
    }
  });

  it('in the lists and the checklist: the pads\' own screws, and how they go on', () => {
    const project = onCasters(undefined, 'auto');
    const job = buildJob(project, starter);
    const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
    const lists = buildLists(job, project, starter, L);
    const rows = lists.hardware.filter((h) => h.group === 'Casters');
    expect(rows.find((r) => r.item.startsWith('#8 × 1-1/4"'))).toMatchObject({ quantity: 16 });
    expect(rows.find((r) => r.item.startsWith('#8 × 1-1/4"'))!.note).toContain('caster pad');
    expect(rows.some((r) => /doubled bottom/.test(r.note ?? ''))).toBe(false);
    expect(lists.parts.filter((p) => /\/caster-pad-\d$/.test(p.partId))).toHaveLength(4);
    const steps = buildChecklistSections(project, job.plan, job.programs, starter.tools, activeMachine(starter), starter.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((t) => t.startsWith('Glue and screw a pad under the case for each caster'))).toBe(true);
    expect(steps.some((t) => t.startsWith('Glue and screw the second layer'))).toBe(false);
    expect(steps.some((t) => t.startsWith('Screw the 4 casters on'))).toBe(true);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });
});

describe('a run or an island on casters', () => {
  function island(): Project {
    const project = createIslandProject();
    for (const run of (project.context as CasesContext).runs) setBottomKind(run.shared.toeKick, 'casters', starter.hardware);
    return project;
  }

  it('puts one set under the whole island: lines at its ends, its joins and its rows\' backs, no more than 36" apart', () => {
    const project = island();
    const groups = casterGroups(project, starter.hardware);
    expect(groups).toHaveLength(1);
    const [g] = groups;
    expect(g!.members).toHaveLength(6);
    // 78" long with joins at 24" and 54": four lines across; 48" deep: front, the backs' join, back.
    expect(g!.places).toHaveLength(12);
    expect(g!.places.filter((p) => p.locking)).toHaveLength(2);
    expect(new Set(g!.places.map((p) => Math.round(p.behind))).size).toBe(3);
  });

  it("splits a caster over a join between the cabinets' layers, every hole in one", () => {
    const project = island();
    const shop = shopFor(project, starter);
    const groups = casterGroups(project, shop.hardware);
    const shares = casterShares(groups, shop.materials);
    const holes = [...shares.values()].reduce((n, s) => n + s.holes.length, 0);
    expect(holes).toBe(4 * groups[0]!.places.length);
    expect([...shares.values()].reduce((n, s) => n + s.casters.length, 0)).toBe(groups[0]!.places.length);
    const layers = deriveCabinetParts(project, shop).filter((p) => p.id.endsWith('/bottom-under'));
    expect(layers).toHaveLength(6);
    for (const layer of layers) {
      for (const f of layer.features) {
        if (f.kind !== 'hole') continue;
        expect(f.center.x).toBeGreaterThan(0);
        expect(f.center.x).toBeLessThan(layer.size.width);
        expect(f.center.y).toBeGreaterThan(0);
        expect(f.center.y).toBeLessThan(layer.size.height);
      }
    }
  });

  it('a run alone has its own set, a lone cabinet its four', () => {
    const project = island();
    (project.context as CasesContext).islands = [];
    const groups = casterGroups(project, starter.hardware);
    expect(groups.map((g) => g.places.length)).toEqual([8, 8]);
    expect(casterGroups(onCasters(), starter.hardware)[0]!.places).toHaveLength(4);
  });

  it('warns when the casters carry less than the cabinets weigh', () => {
    const project = island();
    const shop = shopFor(project, starter);
    const groups = casterGroups(project, shop.hardware);
    const parts = deriveCabinetParts(project, shop);
    expect(casterLoadProblems(groups, parts, shop.materials)).toEqual([]);
    expect(partsWeight(parts, shop.materials)).toBeGreaterThan(50);
    const weak = groups.map((g) => ({ ...g, caster: { ...g.caster, load: 1 } }));
    expect(casterLoadProblems(weak, parts, shop.materials)[0]).toMatch(/^The island "Island" weighs about \d+ kg/);
  });
});

describe('casters in the lists and the checklist', () => {
  const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);

  it('lists the casters, the brake ones apart when the caster has none, their screws and the layer\'s', () => {
    const project = onCasters();
    (project.context as CasesContext).settings.toeKick.casters = { casterId: 'generic-caster-3', under: 'layer' };
    const job = buildJob(project, starter);
    const rows = buildLists(job, project, starter, L).hardware.filter((h) => h.group === 'Casters');
    expect(rows.find((r) => r.item === 'Generic 3" swivel plate caster')?.quantity).toBe(2);
    expect(rows.find((r) => r.item === 'Generic 3" swivel plate caster, with brake')?.quantity).toBe(2);
    expect(rows.find((r) => r.item.startsWith('#12'))?.quantity).toBe(16);
    expect(rows.some((r) => r.item.startsWith('#8 × 1-1/4"'))).toBe(true);
  });

  it('names the pilot holes on the layer, and builds the casters on', () => {
    const project = onCasters();
    const job = buildJob(project, starter);
    const lists = buildLists(job, project, starter, L);
    const layer = lists.parts.find((p) => p.partId.endsWith('/bottom-under'))!;
    expect(layer).toBeDefined();
    const sections = buildChecklistSections(project, job.plan, job.programs, starter.tools, activeMachine(starter), starter.hardware);
    const steps = sections.flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((t) => t.startsWith('Glue and screw the second layer under the case'))).toBe(true);
    expect(steps.some((t) => t.startsWith('Screw the 4 casters on'))).toBe(true);
  });
});
