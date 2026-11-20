// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { deriveDrawerBoxParts, deriveParts, drawerBox, designsOf, isDrawer, partBox, shopFor } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { createStarterShop, createStarterShopProfile, SOLID_WOOD_3_4_ID } from '@/libraries';
import type { CasesContext, DoorStyle, Feature, Part, PlanWarning, Project, ShopDrawerDesign } from '@/model';
import { activeMachine } from '@/plan';
import { addMaterialFromCatalog } from '@/design';
import { createShopCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * The inset style's wide drawer front with a style of its own: a single front piece of MDF or solid wood, so that
 * the front need not be doubled up. One piece, the box sides in dados in its back, and the front's look (an eased
 * edge, a shaker frame, a pattern) cut into its outside. It is then a front: its show face is its face A, the dados
 * and the bottom's groove are on its face B, and the sheet is flipped for it. A plain slab wide front is a part of
 * the box, as before.
 */
const profile = createStarterShopProfile();
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const SHAKER: DoorStyle = { kind: 'shaker', frameWidth: len('2-1/4"'), recessDepth: len('1/4"'), insideEdge: { kind: 'vBevel', angleDeg: 60 }, floorCornerRadius: len('1/16"') };
const drawers = (project: Project) => (project.context as CasesContext).fronts.drawers;

function made(shopDrawer?: ShopDrawerDesign, more?: (project: Project) => void) {
  const project = createShopCabinetProject();
  if (shopDrawer) drawers(project).shop = { ...drawers(project).shop, ...shopDrawer };
  more?.(project);
  const shop = shopFor(project, profile);
  const fronts = deriveParts(project, shop);
  const boxes = deriveDrawerBoxParts(project, shop);
  const drawer = designsOf(project).find(isDrawer)!;
  return { project, shop, fronts, boxes, drawer, front: fronts.find((p) => p.id === `${drawer.id}/box-front`), wall: boxes.find((p) => p.id === `${drawer.id}/box-front`) };
}
const dadosOf = (part: Part) => part.features.filter((f): f is Extract<Feature, { kind: 'dado' }> => f.kind === 'dado');
const round = (n: number) => Math.round(n * 100) / 100 + 0;

describe('a plain wide front', () => {
  it('is a part of the box, as before: face A its inside, nothing among the fronts', () => {
    const plain = made();
    expect(plain.front).toBeUndefined();
    expect(plain.wall?.role).toBe('boxFront');
    expect(dadosOf(plain.wall!).every((f) => f.face === 'A')).toBe(true);
    // Saying slab and square outright changes nothing.
    const said = made({ style: { kind: 'slab' }, outsideEdge: { kind: 'square' } });
    expect(said.boxes).toEqual(plain.boxes);
    expect(said.fronts).toEqual(plain.fronts);
  });

  it('is cut in one set-up', () => {
    const job = buildJob(made().project, createStarterShop());
    const blank = job.plan.blanks.find((b) => b.partIds.some((id) => id.endsWith('/box-front')))!;
    expect(blank.setups.filter((s) => s.operationKeys.length > 0)).toHaveLength(1);
  });
});

describe.each([
  ['a roundover on its edges', { outsideEdge: { kind: 'roundover', radius: len('1/8"') } }, 'edgeProfile'],
  ['a shaker frame', { style: SHAKER }, 'pocket'],
  ['a pattern of V-grooves', { style: { kind: 'slab', pattern: { kind: 'grooves', layout: 'vertical', spacing: len('3"'), depth: len('1/16"'), angleDeg: 60, margin: len('2-1/4"') } } }, 'slot'],
] as [string, ShopDrawerDesign, Feature['kind']][])('a wide front with %s', (_name, shopDrawer, kind) => {
  const plain = made();
  const styled = made(shopDrawer);

  it('is a front: one piece, its show face A at the case front, its style on face A', () => {
    const front = styled.front!;
    expect(front).toBeDefined();
    expect(front.role).toBeUndefined();
    expect(styled.wall).toBeUndefined();
    // The same board as the plain one, in the same place.
    const was = plain.wall!;
    expect([round(front.size.width), round(front.size.height), round(front.size.thickness), front.materialId]).toEqual([round(was.size.width), round(was.size.height), round(was.size.thickness), was.materialId]);
    const [a, b] = [partBox(front), partBox(was)];
    expect(a.min.map(round)).toEqual(b.min.map(round));
    expect(a.max.map(round)).toEqual(b.max.map(round));
    expect(round(a.max[2])).toBe(0);
    const outside = front.features.filter((f) => f.kind === kind);
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.every((f) => f.face === 'A' || f.face === 'edge')).toBe(true);
    // The rest of the box is the plain one's.
    expect(styled.boxes).toEqual(plain.boxes.filter((p) => p.role !== 'boxFront'));
  });

  it('has the dados for the sides and the groove on its back, where the plain one has them, seen from the other face', () => {
    const [front, was] = [styled.front!, plain.wall!];
    const mirrored = dadosOf(was).map((f) => ({ id: f.id, depth: f.depth, x: [round(was.size.width - Math.max(...f.outline.map((p) => p.x))), round(was.size.width - Math.min(...f.outline.map((p) => p.x)))], y: [round(Math.min(...f.outline.map((p) => p.y))), round(Math.max(...f.outline.map((p) => p.y)))] }));
    const now = dadosOf(front).map((f) => ({ id: f.id, depth: f.depth, x: [round(Math.min(...f.outline.map((p) => p.x))), round(Math.max(...f.outline.map((p) => p.x)))], y: [round(Math.min(...f.outline.map((p) => p.y))), round(Math.max(...f.outline.map((p) => p.y)))] }));
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(now.sort(byId)).toEqual(mirrored.sort(byId));
    expect(dadosOf(front).every((f) => f.face === 'B')).toBe(true);
    // The box sides stand in those dados: each side's end is inside its dado in plan.
    for (const side of styled.boxes.filter((p) => p.role === 'boxSide')) {
      const box = partBox(side);
      const left = partBox(front).min[0];
      const dado = dadosOf(front).find((f) => f.id === (side.id.endsWith('left') ? 'front-dado-left' : 'front-dado-right'))!;
      expect(round(box.min[0] - left)).toBe(round(Math.min(...dado.outline.map((p) => p.x))));
      expect(round(box.max[0] - left)).toBe(round(Math.max(...dado.outline.map((p) => p.x))));
      expect(round(box.max[2])).toBe(round(-(front.size.thickness - dado.depth)));
    }
  });

  it('builds: the sheet is flipped for it, every feature is in a row, the G-code parses and stays in the stock', async () => {
    const shop = createStarterShop();
    const job = buildJob(styled.project, shop);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const front = job.parts.find((p) => p.id.endsWith('/box-front'))!;
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    expect(front.features.filter((f) => !planned.has(`${front.id}:${f.id}`)).map((f) => f.id)).toEqual([]);
    const blank = job.plan.blanks.find((b) => b.partIds.includes(front.id))!;
    // The dados are cut with the back up. With work on the show face too, that is two set-ups (a roundover is the
    // hand-held router's until the plan says otherwise: the front is then cut back up, in one).
    const cutting = blank.setups.filter((s) => s.operationKeys.length > 0);
    expect(cutting).toHaveLength(kind === 'edgeProfile' ? 1 : 2);
    const dadoOp = job.plan.operations.find((o) => o.kind === 'dado' && o.source.kind === 'features' && o.source.refs.some((r) => r.partId === front.id))!;
    expect(dadoOp.face).toBe('B');
    for (const [i, file] of job.files.entries()) {
      const program = job.programs[i]!;
      const of = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      const pins = program.setup.pinHoles.length > 0;
      expect(deepest, file.name).toBeLessThanOrEqual(of.size.thickness + (pins ? activeMachine(shop).flipPins.spoilboardDepth : 0) + LOWRIDER_3.throughExtra + 0.011);
      expect(file.text.split('\n').some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  }, 60000);
});

describe('what a styled wide front refuses', () => {
  it('a shaker recess that meets the dados for the box sides', () => {
    // A frame narrower than the sides stand in from the front's edges, and a deep recess: it is over the dados, with too little left.
    expect(() => made({ style: { ...SHAKER, frameWidth: len('1/4"'), recessDepth: len('3/8"') } })).toThrow(/The shaker recess and the (dado for the box side|groove for the box's bottom) meet: make the frame wider/);
    // The usual frame is clear of them.
    expect(() => made({ style: SHAKER })).not.toThrow();
    // A shallow recess over them leaves enough: allowed.
    expect(() => made({ style: { ...SHAKER, frameWidth: len('1/4"'), recessDepth: len('1/8"'), insideEdge: { kind: 'square' } } })).not.toThrow();
  });

  it('a pattern cut over the dados, too deep', () => {
    const pattern = { kind: 'grooves', layout: 'vertical', spacing: len('3"'), angleDeg: 60 } as const;
    expect(() => made({ style: { kind: 'slab', pattern: { ...pattern, depth: len('3/8"'), margin: len('0"') } } })).toThrow(/The pattern and .* meet: give the pattern a wider margin/);
    expect(() => made({ style: { kind: 'slab', pattern: { ...pattern, depth: len('1/16"'), margin: len('0"') } } })).not.toThrow();
  });

  it('a finger notch in a shaker front, which would cut its top rail; a slab or a patterned one takes it', () => {
    expect(() => made({ style: SHAKER, pull: 'fingerPull' })).toThrow(/A finger notch would cut through the top rail/);
    const notched = made({ outsideEdge: { kind: 'chamfer', size: len('1/16"') }, pull: 'fingerPull' });
    expect(notched.front!.features.find((f) => f.kind === 'cutout' && f.outline.length > 4)).toBeDefined();
  });
});

describe('a styled wide front and its handle', () => {
  it("the handle's holes go through it, in the middle of a shaker front's top rail when asked", () => {
    const withKnob = (inMargin: boolean) =>
      made({ style: SHAKER }, (p) => {
        drawers(p).handle = { handleId: 'generic-knob', ...(inMargin ? { inMargin: true } : {}) };
      });
    const holes = (part: Part) => part.features.filter((f): f is Extract<Feature, { kind: 'hole' }> => f.kind === 'hole' && f.id.startsWith('handle'));
    const front = withKnob(true).front!;
    expect(holes(front)).toHaveLength(1);
    expect(round(holes(front)[0]!.center.y)).toBe(round(front.size.height - SHAKER.frameWidth.mm / 2));
    expect(round(holes(withKnob(false).front!)[0]!.center.y)).toBe(round(front.size.height / 2));
  });

  it('of solid wood it is still one piece, on plywood sides', () => {
    const solid = made({ outsideEdge: { kind: 'roundover', radius: len('1/8"') } }, (p) => {
      addMaterialFromCatalog(p, profile.materialCatalog, SOLID_WOOD_3_4_ID);
      drawers(p).shop = { ...drawers(p).shop, frontMaterialId: SOLID_WOOD_3_4_ID };
    });
    expect(solid.front!.materialId).toBe(SOLID_WOOD_3_4_ID);
    expect(solid.boxes.filter((p) => p.role === 'boxSide').every((p) => p.materialId !== SOLID_WOOD_3_4_ID)).toBe(true);
    expect(drawerBox(solid.drawer, solid.project, solid.shop)!.wideFront!.decorated).toBe(true);
  });
});
