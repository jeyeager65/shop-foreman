// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boxOffFloor, casterGroups, feetOnBottom, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, designsOf, drawerBox, isDrawer, shopFor, stainedWithoutGrain } from '@/design';
import { projectScene } from '@/design/scene';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { PLYWOOD_1_2_ID, PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, createStarterShopProfile } from '@/libraries';
import type { CasesContext, PlanWarning, Project } from '@/model';
import { FURNITURE_INSET_PRESET_ID, FURNITURE_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';

/**
 * The inset style as furniture: the preset "Furniture: inset, plywood with solid wood edges, stained", and the two
 * samples that show it: the TV stand (doors, an open bay, a top of its own, on a leg frame) and the night stand (a
 * drawer whose front is one piece of solid wood on plywood sides).
 */
const profile = createStarterShopProfile();
const preset = builtInPresets().find((p) => p.id === FURNITURE_INSET_PRESET_ID)!;
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const started = (id: string, change?: (project: Project) => void) => {
  const { project, fellBack } = startProject(starterById(id)!, preset, profile);
  expect(fellBack).toEqual([]);
  change?.(project);
  const shop = shopFor(project, profile);
  return { project, shop, cabinet: cabinetsOf(project)[0]!, parts: deriveCabinetParts(project, shop), fronts: deriveParts(project, shop), boxes: deriveDrawerBoxParts(project, shop) };
};
/** `allowed`: the blocking warnings the same piece has in another style (the TV stand's back is longer than a LowRider 3 cuts, whatever it is made like). */
async function builds(project: Project, allowed: string[] = []) {
  const job = buildJob({ ...project, slug: 'inset-furniture' }, profile);
  expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code)).map((w) => w.message)).toEqual(allowed);
  expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  expect(job.files.length).toBeGreaterThan(0);
  for (const file of job.files) {
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(file.text);
    expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
  }
  return job;
}

describe('the TV stand in the inset furniture preset', () => {
  const stand = started('tvstand');

  it('is an inset case of plywood with a solid wood strip on every front edge', () => {
    const { cabinet, parts, project } = stand;
    expect([cabinet.construction, cabinet.materials.caseId, Math.round(cabinet.shop.edgeStrip!.mm * 100) / 100]).toEqual(['shop', PLYWOOD_3_4_ID, 19.05]);
    expect('error' in projectScene(project, stand.shop)).toBe(false);
    const strips = parts.filter((p) => p.role === 'caseEdge');
    const names = strips.map((s) => s.name);
    // Each side, the two partitions between its three bays, the bottom and the top panel.
    expect(names).toEqual(expect.arrayContaining(['Left side edge strip', 'Right side edge strip', 'Bottom edge strip', 'Top edge strip']));
    expect(names.filter((n) => n.startsWith('Partition'))).toHaveLength(2);
    expect(strips.every((s) => s.materialId === SOLID_WOOD_3_4_ID)).toBe(true);
    expect(parts.filter((p) => p.banding?.strip)).toHaveLength(strips.length);
    // Full partitions, as in this style: no face frame.
    expect(parts.filter((p) => p.role === 'partition')).toHaveLength(2);
    expect(parts.some((p) => p.role === 'frameStile' || p.role === 'frameRail')).toBe(false);
  });

  it('has inset slab doors of solid wood on the outer two bays, the middle one open, with its cable hole and air slot', () => {
    const { fronts, parts, cabinet } = stand;
    expect(fronts).toHaveLength(4);
    expect(fronts.every((p) => p.materialId === SOLID_WOOD_3_4_ID && !p.features.some((f) => f.kind === 'pocket'))).toBe(true);
    expect(fronts.every((p) => Math.abs(p.placement!.origin[2]) < 1e-6)).toBe(true);
    expect(cabinet.layout.bays?.map((b) => !!b.open)).toEqual([false, true, false]);
    const back = parts.find((p) => p.role === 'back')!;
    expect(back.features.filter((f) => f.kind === 'cutout' && f.inside).length).toBeGreaterThanOrEqual(2);
    // On a leg frame, under a top of its own.
    expect(parts.some((p) => p.role === 'leg')).toBe(true);
    expect(cabinet.top?.own).toBeDefined();
  });

  it('builds, and its G-code parses; nothing is in the way that is not in the way of the face frame one', async () => {
    const framed = startProject(starterById('tvstand')!, builtInPresets().find((p) => p.id === FURNITURE_PRESET_ID)!, profile).project;
    const usual = buildJob({ ...framed, slug: 'framed' }, profile).plan.warnings.filter((w) => BLOCKING.includes(w.code)).map((w) => w.message);
    await builds(stand.project, usual);
  }, 120000);
});

describe('the night stand in the inset furniture preset', () => {
  const stand = started('nightstand');

  it("its drawer is one front piece of solid wood on plywood sides, with a knob", () => {
    const { project, shop, fronts, boxes } = stand;
    expect('error' in projectScene(project, shop)).toBe(false);
    const drawer = designsOf(project).find(isDrawer)!;
    const box = drawerBox(drawer, project, shop)!;
    expect(box.front).toBe('wide');
    const front = fronts.find((p) => p.id === `${drawer.id}/box-front`)!;
    expect(front.materialId).toBe(SOLID_WOOD_3_4_ID);
    // No second front, and no front wall among the box's parts: the one piece is both.
    expect(fronts.filter((p) => p.designObjectId === drawer.id)).toHaveLength(1);
    expect(boxes.some((p) => p.role === 'boxFront')).toBe(false);
    expect(boxes.filter((p) => p.role === 'boxSide').map((p) => p.materialId)).toEqual([PLYWOOD_1_2_ID, PLYWOOD_1_2_ID]);
    expect(front.features.filter((f) => f.kind === 'hole' && f.id.startsWith('handle'))).toHaveLength(1);
    expect(front.features.filter((f) => f.kind === 'dado' && f.face === 'B')).toHaveLength(3);
    // The knob's hole is bored from the back with the dados: nothing is cut on the show face, so the sheet is not turned over.
    expect(front.features.filter((f) => f.kind === 'hole' && f.id.startsWith('handle')).map((f) => f.face)).toEqual(['B']);
    const job = buildJob({ ...project, slug: 'one-setup' }, profile);
    expect(job.plan.blanks.find((b) => b.partIds.includes(front.id))!.setups.filter((x) => x.operationKeys.length > 0)).toHaveLength(1);
    expect(job.plan.operations.some((o) => o.kind === 'pinHole')).toBe(false);
    // A stain on fronts of solid wood: nothing says MDF is painted (the preset's unused face frame doors are MDF).
    expect(stainedWithoutGrain(project, profile)).toEqual([]);
  });

  it('builds: the lists name no finger pull, no full overlay and no bare edge, and Build glues the strips on', async () => {
    const { project, shop } = stand;
    const job = await builds(project);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round((mm / 25.4) * 100) / 100}"`);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((s) => s.startsWith('Glue a solid wood edge strip'))).toBe(true);
    const words = [...steps, ...lists.hardware.map((h) => `${h.item} ${h.note ?? ''}`)].join('\n');
    expect(words).not.toMatch(/finger pull|full overlay|Applied front/i);
    // Every line is true of this piece: no applied front to drill through, feet and not casters, a top panel and not stretchers.
    expect(steps.join(' | ')).not.toMatch(/applied drawer front|casters on|for each caster|brake|the bottom and the stretchers/i);
    expect(steps.some((x) => x.startsWith('Screw the 4 feet on'))).toBe(true);
    expect(steps.some((x) => x.startsWith('Assemble the case: join the bottom and the top to the sides'))).toBe(true);
    expect(steps.some((x) => x.startsWith('Glue the drawer box sides into the dados in the back of the one-piece front'))).toBe(true);
  }, 120000);

  it('its feet are screwed straight to the bottom: no pad under it, and it stands on the feet alone', () => {
    const { project, shop, cabinet, parts } = stand;
    expect(feetOnBottom(cabinet, shop.materials)).toBe(true);
    expect(parts.some((p) => /caster-pad|bottom-under/.test(p.id))).toBe(false);
    expect(parts.some((p) => p.features.some((f) => f.id.startsWith('caster-screw')))).toBe(false);
    const [group] = casterGroups(project, shop.hardware);
    expect([group!.under, group!.places.length]).toEqual(['bottom', 4]);
    expect(boxOffFloor(cabinet, shop.materials, shop.hardware)).toBeCloseTo(101.6);
    // The feet are still drawn, one in each corner.
    const scene = projectScene(project, shop);
    expect('error' in scene ? [] : scene.casters).toHaveLength(4);
    const job = buildJob({ ...project, slug: 'feet' }, profile);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((x) => x.startsWith('Screw the 4 feet on under the bottom, one in each corner, its plate 1-1/2" in'))).toBe(true);
    expect(steps.join(' | ')).not.toMatch(/a pad under the case|pilot holes facing down/);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round((mm / 25.4) * 100) / 100}"`);
    expect(lists.hardware.filter((h) => h.group === 'Feet').map((h) => h.note).join(' ')).not.toMatch(/pad/);
    // Pads when asked for, and behind a face frame, whose bottom rail hides them.
    const padded = started('nightstand', (p) => ((p.context as CasesContext).settings.toeKick.casters!.under = 'pads'));
    expect(padded.parts.filter((p) => /caster-pad/.test(p.id))).toHaveLength(4);
    const framed = startProject(starterById('nightstand')!, builtInPresets().find((p) => p.id === FURNITURE_PRESET_ID)!, profile).project;
    expect(deriveCabinetParts(framed, shopFor(framed, profile)).filter((p) => /caster-pad/.test(p.id))).toHaveLength(4);
  }, 120000);

  it('a plain one-piece front of solid wood (a slab, square edges) is cut on the CNC with its dados, as a part of the box', () => {
    const plain = started('nightstand', (p) => {
      const drawers = (p.context as CasesContext).fronts.drawers;
      drawers.shop = { ...drawers.shop, front: 'wide', outsideEdge: { kind: 'square' } };
      delete drawers.shop.style;
    });
    const wall = plain.boxes.find((p) => p.role === 'boxFront')!;
    expect(wall.materialId).toBe(SOLID_WOOD_3_4_ID);
    const planned = buildJob({ ...plain.project, slug: 'plain' }, profile).plan.parts.find((p) => p.partId === wall.id)!;
    expect(planned.cutOut).toBe('cnc');
    expect(planned.steps.filter((s) => /dado|groove/.test(s.label)).map((s) => s.by)).toEqual(['cnc', 'cnc']);
  }, 120000);

  it('with an applied front it has a front of its own on a plain box', async () => {
    const applied = started('nightstand', (p) => {
      const drawers = (p.context as CasesContext).fronts.drawers;
      drawers.shop = { ...drawers.shop, front: 'applied' };
    });
    const drawer = designsOf(applied.project).find(isDrawer)!;
    const front = applied.fronts.find((p) => p.id === `${drawer.id}/front`)!;
    expect(front.materialId).toBe(SOLID_WOOD_3_4_ID);
    expect(front.features.some((f) => f.kind === 'pocket')).toBe(false);
    const wall = applied.boxes.find((p) => p.role === 'boxFront')!;
    expect(wall.materialId).toBe(PLYWOOD_1_2_ID);
    expect(wall.features.filter((f) => f.kind === 'hole' && f.id.startsWith('front-screw'))).toHaveLength(4);
    expect(drawerBox(drawer, applied.project, applied.shop)!.front).toBe('applied');
    await builds(applied.project);
  }, 120000);
});
