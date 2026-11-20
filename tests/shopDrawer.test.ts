// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { BOX_CLEAR_UNDER, BOX_GROOVE_UP, WIDE_FRONT_DADO_DEPTH, WIDE_FRONT_DADO_OVERRUN, cabinetsOf, deriveCabinetOpenings, deriveDrawerBoxParts, deriveParts, drawerBox, isDrawer, designsOf } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { PLYWOOD_1_2_ID, PLYWOOD_3_4_ID, createStarterShop } from '@/libraries';
import type { Feature, Part, PlanWarning, Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/** Milestone 3: a shop drawer on slides, the front of its box as the front. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const thick = (id: string) => shop.materials.find((m) => m.id === id)!.measuredThickness.mm;
const drawerOf = (p: Project) => designsOf(p).find(isDrawer)!;
const part = (parts: Part[], key: string) => parts.find((p) => p.id.endsWith(`/${key}`))!;
type Recess = Extract<Feature, { kind: 'dado' }>;
const recess = (p: Part, id: string) => p.features.find((f): f is Recess => f.kind === 'dado' && f.id === id)!;
const span = (f: Recess) => ({ x0: Math.min(...f.outline.map((q) => q.x)), x1: Math.max(...f.outline.map((q) => q.x)), y0: Math.min(...f.outline.map((q) => q.y)), y1: Math.max(...f.outline.map((q) => q.y)) });
/** A part's extent in the cabinet along an axis (0 x, 1 y, 2 z). */
function extent(p: Part, axis: number): [number, number] {
  const pl = p.placement!;
  const n = [pl.xAxis[1]! * pl.yAxis[2]! - pl.xAxis[2]! * pl.yAxis[1]!, pl.xAxis[2]! * pl.yAxis[0]! - pl.xAxis[0]! * pl.yAxis[2]!, pl.xAxis[0]! * pl.yAxis[1]! - pl.xAxis[1]! * pl.yAxis[0]!];
  const vs = [0, p.size.width].flatMap((x) => [0, p.size.height].flatMap((y) => [0, p.size.thickness].map((z) => pl.origin[axis]! + pl.xAxis[axis]! * x + pl.yAxis[axis]! * y - n[axis]! * z)));
  return [Math.min(...vs), Math.max(...vs)];
}

describe('a shop drawer with a wide front', () => {
  const project = createShopCabinetProject();
  const cabinet = cabinetsOf(project)[0]!;
  const gap = cabinet.shop.gap.mm;
  const opening = deriveCabinetOpenings(cabinet, shop.materials)[0]!;
  const parts = deriveDrawerBoxParts(project, shop);
  const box = drawerBox(drawerOf(project), project, shop)!;
  const front = part(parts, 'box-front');
  const tFront = thick(PLYWOOD_3_4_ID);
  const tBox = thick(PLYWOOD_1_2_ID);

  it('has no front of its own and no screws for one', () => {
    expect(deriveParts(project, shop).map((p) => p.name)).toEqual(['Left door', 'Right door']);
    expect(parts.map((p) => p.name)).toEqual(['Box side, left', 'Box side, right', 'Box front', 'Box back', 'Box bottom']);
    expect(parts.flatMap((p) => p.features).filter((f) => f.id.startsWith('front-screw'))).toEqual([]);
    expect(box.front).toBe('wide');
  });

  it('makes the front wall fill the opening less the gap, from the case material, flush with the case front', () => {
    expect(front.materialId).toBe(PLYWOOD_3_4_ID);
    expect(front.size.width).toBeCloseTo(opening.width - 2 * gap, 5);
    expect(front.size.height).toBeCloseTo(opening.height - gap - gap / 2, 5);
    expect(front.grain).toBe('width');
    expect(extent(front, 0)[0]).toBeCloseTo(opening.origin.x + gap, 5);
    expect(extent(front, 1)[0]).toBeCloseTo(opening.origin.y + gap / 2, 5);
    expect(extent(front, 2)).toEqual([expect.closeTo(-tFront, 5), expect.closeTo(0, 5)]);
    expect(box.wideFront).toMatchObject({ width: front.size.width, height: front.size.height, thickness: tFront });
  });

  it('houses the sides in stopped dados in its back face, where the sides are', () => {
    const dado = Math.min(WIDE_FRONT_DADO_DEPTH, tFront / 2);
    for (const [id, key] of [['front-dado-left', 'box-side-left'], ['front-dado-right', 'box-side-right']] as const) {
      const f = recess(front, id);
      const s = span(f);
      const side = part(parts, key);
      expect(f.face).toBe('A');
      expect(f.depth).toBeCloseTo(dado, 5);
      // In the cabinet: the dado is as wide as the side and where the side is.
      const right = extent(front, 0)[1];
      expect([right - s.x1, right - s.x0]).toEqual([expect.closeTo(extent(side, 0)[0], 4), expect.closeTo(extent(side, 0)[1], 4)]);
      // It runs a little past the side's top and bottom, and stops inside the front.
      const bottom = extent(front, 1)[0];
      expect(bottom + s.y0).toBeCloseTo(extent(side, 1)[0] - WIDE_FRONT_DADO_OVERRUN, 4);
      expect(bottom + s.y1).toBeCloseTo(extent(side, 1)[1] + WIDE_FRONT_DADO_OVERRUN, 4);
      expect(s.y0).toBeGreaterThan(0);
      expect(s.y1).toBeLessThan(front.size.height);
      // The side's end sits on the dado's floor.
      expect(extent(side, 2)[1]).toBeCloseTo(-(tFront - dado), 5);
      // No rabbet at the front end of the side; one at the back.
      expect(side.features.filter((x) => x.id.startsWith('box-rabbet')).map((x) => x.id)).toEqual(['box-rabbet-back']);
    }
  });

  it('runs the groove for the bottom between the dados, level with the sides\' grooves', () => {
    const g = span(recess(front, 'box-groove'));
    const left = span(recess(front, 'front-dado-left'));
    const right = span(recess(front, 'front-dado-right'));
    expect(g.x0).toBeCloseTo(Math.min(left.x0, right.x0), 5);
    expect(g.x1).toBeCloseTo(Math.max(left.x1, right.x1), 5);
    const side = part(parts, 'box-side-left');
    expect(extent(front, 1)[0] + g.y0).toBeCloseTo(extent(side, 1)[0] + BOX_GROOVE_UP, 5);
    // The bottom reaches from the front wall's groove to the back's.
    const bottom = part(parts, 'box-bottom');
    const back = part(parts, 'box-back');
    expect(extent(bottom, 2)[1]).toBeGreaterThan(-tFront);
    expect(extent(bottom, 2)[1]).toBeLessThan(-tFront + WIDE_FRONT_DADO_DEPTH + 0.01);
    expect(extent(bottom, 2)[0]).toBeLessThan(extent(back, 2)[1]);
    expect(extent(bottom, 2)[0]).toBeGreaterThan(extent(back, 2)[0]);
  });

  it('starts the slides behind the front and keeps the box clear of the opening', () => {
    expect(box.slideAt.front).toBeCloseTo(-tFront, 5);
    expect(box.slide!.fits).toBe(true);
    expect(box.slide!.room).toBeLessThan(drawerBox(drawerOf(createBaseCabinetProject("frameless")), createBaseCabinetProject("frameless"), shop)!.slide!.room);
    const side = part(parts, 'box-side-left');
    expect(extent(side, 1)[0]).toBeCloseTo(opening.origin.y + BOX_CLEAR_UNDER, 5);
    expect(side.size.thickness).toBeCloseTo(tBox, 5);
  });

  it('takes its own front material', () => {
    const p = createShopCabinetProject();
    drawerOf(p).shop = { frontMaterialId: PLYWOOD_1_2_ID };
    const f = part(deriveDrawerBoxParts(p, shop), 'box-front');
    expect(f.size.thickness).toBeCloseTo(tBox, 5);
    expect(recess(f, 'front-dado-left').depth).toBeCloseTo(Math.min(WIDE_FRONT_DADO_DEPTH, tBox / 2), 5);
    expect(extent(f, 2)[1]).toBeCloseTo(0, 5);
  });
});

describe('a shop drawer as a plain box', () => {
  const project = createShopCabinetProject();
  drawerOf(project).shop = { front: 'plain' };
  const parts = deriveDrawerBoxParts(project, shop);
  const box = drawerBox(drawerOf(project), project, shop)!;

  it('is the ordinary box at the case front, without the front screw holes', () => {
    const frameless = createBaseCabinetProject('frameless');
    const usual = deriveDrawerBoxParts(frameless, shop);
    expect(box.front).toBe('plain');
    expect(box.wideFront).toBeUndefined();
    expect(parts.map((p) => [p.name, p.size.width, p.size.thickness])).toEqual(usual.map((p) => [p.name, p.size.width, p.size.thickness]));
    const front = part(parts, 'box-front');
    expect(front.features.map((f) => f.id)).toEqual(['cutout', 'box-groove']);
    expect(part(usual, 'box-front').features.filter((f) => f.id.startsWith('front-screw'))).toHaveLength(4);
    expect(extent(front, 2)[1]).toBeCloseTo(0, 5);
    expect(extent(part(parts, 'box-side-left'), 2)[1]).toBeCloseTo(0, 5);
    expect(box.slideAt.front).toBeCloseTo(0, 5);
    expect(deriveParts(project, shop).map((p) => p.name)).toEqual(['Left door', 'Right door']);
  });
});

describe.each(['wide', 'plain'] as const)('the shop cabinet with a %s drawer front, as a job', (front) => {
  const project = createShopCabinetProject();
  drawerOf(project).shop = { front };
  const job = buildJob(project, shop);
  const lists = buildLists(job, project, shop, L);
  const all = [...job.parts, ...job.cabinetParts];

  it('plans every part and every feature', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    for (const p of all) {
      const onBlank = job.plan.blanks.filter((b) => b.partIds.includes(p.id)).length;
      expect(onBlank + cut.filter((n) => n === p.name).length, p.name).toBe(1);
      for (const f of p.features) if (onBlank || f.kind !== 'cutout') expect(planned.has(`${p.id}:${f.id}`), `${p.name}: ${f.id}`).toBe(true);
    }
    if (front === 'wide') {
      const dados = job.plan.operations.find((o) => o.key === 'boxes:dado')!;
      expect(dados.label).toBe('Drawer box: dados');
      expect(dados.clearToolId).toBeTruthy();
      expect(dados.source.kind === 'features' && dados.source.refs.map((r) => r.featureId).sort()).toEqual(['front-dado-left', 'front-dado-right']);
    }
  });

  it('lists the slides and no screws for an applied front', () => {
    const items = lists.hardware.map((h) => h.item).join('\n');
    expect(items).toMatch(/slide/);
    expect(items).not.toMatch(/washer-head/);
    expect(lists.parts.filter((p) => p.label.startsWith('DF'))).toEqual([]);
  });

  it('writes files that parse and stay inside their blanks', async () => {
    for (const [i, file] of job.files.entries()) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      const program = job.programs[i]!;
      const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      if (program.setup.pinHoles.length === 0) expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + THROUGH_EXTRA + 0.011);
    }
  });
});
