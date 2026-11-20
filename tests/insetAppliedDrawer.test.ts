// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, cabinetOpeningsOf, deriveDrawerBoxParts, deriveParts, designsOf, drawerBox, drawerFrontKind, isDrawer, partBox, shopFor } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop, createStarterShopProfile, GENERIC_KNOB_ID } from '@/libraries';
import type { CasesContext, Feature, Part, Project } from '@/model';
import { createShopCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * An applied drawer front in the inset style: a front of its own, with the drawer's usual style, edge and material,
 * inset in its opening and screwed to a plain box on slides from inside it. A choice beside the wide front
 * (`ShopDrawerFront` `'applied'`), never the start.
 */
const profile = createStarterShopProfile();
const fronts = (project: Project) => (project.context as CasesContext).fronts;
const round = (n: number) => Math.round(n * 100) / 100 + 0;

function made(change?: (project: Project) => void) {
  const project = createShopCabinetProject();
  change?.(project);
  const shop = shopFor(project, profile);
  const drawer = designsOf(project).find(isDrawer)!;
  const opening = cabinetOpeningsOf(project, shop.materials).find((o) => o.id === drawer.mounting.openingId)!;
  const parts = deriveParts(project, shop);
  const boxes = deriveDrawerBoxParts(project, shop);
  return { project, shop, drawer, opening, parts, boxes, front: parts.find((p) => p.id === `${drawer.id}/front`), box: drawerBox(drawer, project, shop)! };
}
const applied = (more?: (project: Project) => void) =>
  made((p) => {
    fronts(p).drawers.shop = { ...fronts(p).drawers.shop, front: 'applied' };
    more?.(p);
  });
const holesOf = (part: Part, prefix: string) => part.features.filter((f): f is Extract<Feature, { kind: 'hole' }> => f.kind === 'hole' && f.id.startsWith(prefix));

describe('an applied drawer front in the inset style', () => {
  it('is a choice: left out, the drawer is the wide front it was, with no front of its own', () => {
    const plain = made();
    expect(drawerFrontKind(plain.drawer, plain.opening)).toBe('wide');
    expect(plain.front).toBeUndefined();
    expect(drawerFrontKind(applied().drawer, applied().opening)).toBe('applied');
  });

  it('has a front of its own: the opening less the gap, its face at the case front', () => {
    const { front, opening, project } = applied();
    const gap = cabinetsOf(project)[0]!.shop.gap.mm;
    expect(front).toBeDefined();
    expect(front!.role).toBeUndefined();
    // The gap to the case at the sides and the top; half of it to the doors below.
    expect(round(front!.size.width)).toBe(round(opening.width - 2 * gap));
    expect(round(front!.size.height)).toBe(round(opening.height - gap - gap / 2));
    const box = partBox(front!);
    expect(round(box.max[2])).toBe(0);
    expect(round(box.min[0])).toBe(round(opening.origin.x + gap));
    expect(round(box.max[1])).toBe(round(opening.origin.y + opening.height - gap));
    // The drawer's own front settings make it: the shop preset's drawer front is a shaker one in MDF.
    expect(front!.materialId).toBe(fronts(project).drawers.front.materialId);
    expect(front!.features.some((f) => f.kind === 'pocket')).toBe(fronts(project).drawers.front.style.kind === 'shaker');
  });

  it('stands on a plain box that starts behind it, clear of the sides by the slide, with the screw holes for the front', () => {
    const { front, box, boxes, opening } = applied();
    expect(box.front).toBe('applied');
    expect(box.wideFront).toBeUndefined();
    expect(box.fingerPull).toBeUndefined();
    expect(box.mount).toBe('case');
    const wall = boxes.find((p) => p.role === 'boxFront')!;
    // The box's front wall is against the back of the front.
    expect(round(partBox(wall).max[2])).toBe(round(-front!.size.thickness));
    expect(round(box.slideAt.front)).toBe(round(-front!.size.thickness));
    // As wide as the slides allow.
    const clearance = box.slide!.slide.sideClearance.mm;
    expect(round(box.size.width)).toBe(round(opening.width - 2 * clearance));
    for (const side of boxes.filter((p) => p.role === 'boxSide')) {
      const b = partBox(side);
      expect(b.min[0]).toBeGreaterThanOrEqual(opening.origin.x + clearance - 1e-6);
      expect(b.max[0]).toBeLessThanOrEqual(opening.origin.x + opening.width - clearance + 1e-6);
      expect(round(b.max[2])).toBe(round(-front!.size.thickness));
    }
    expect(holesOf(wall, 'front-screw')).toHaveLength(4);
    // No dados for a wide front, no notch.
    expect(wall.features.some((f) => f.kind === 'dado' && f.id.startsWith('front-dado'))).toBe(false);
    expect(wall.features.find((f) => f.kind === 'cutout' && f.outline.length > 4)).toBeUndefined();
  });

  it('takes the handle, in the front; a finger notch asked of the box fronts is not cut', () => {
    const { front, boxes } = applied((p) => {
      fronts(p).drawers.handle = { handleId: GENERIC_KNOB_ID };
      fronts(p).drawers.shop = { ...fronts(p).drawers.shop, pull: 'fingerPull' };
    });
    expect(holesOf(front!, 'handle')).toHaveLength(1);
    const wall = boxes.find((p) => p.role === 'boxFront')!;
    expect(holesOf(wall, 'handle')).toHaveLength(0);
    for (const part of [front!, wall]) expect(part.features.find((f) => f.kind === 'cutout' && f.outline.length > 4), part.name).toBeUndefined();
  });

  it('derives as a slab and with a pattern too', () => {
    const slab = applied((p) => (fronts(p).drawers.front.style = { kind: 'slab' })).front!;
    expect(slab.features.some((f) => f.kind === 'pocket')).toBe(false);
    const patterned = applied((p) => (fronts(p).drawers.front.style = { kind: 'slab', pattern: { kind: 'grooves', layout: 'vertical', spacing: len('3"'), depth: len('1/16"'), angleDeg: 60, margin: len('2-1/4"') } })).front!;
    expect(patterned.features.some((f) => f.kind === 'slot')).toBe(true);
  });

  it('builds: the front is cut with the fronts, its screws are on the hardware list, Build says how it is fitted, and the G-code parses', async () => {
    const { project, shop, drawer } = applied();
    const job = buildJob({ ...project, slug: 'inset-applied' }, createStarterShop());
    expect(job.parts.some((p) => p.id === `${drawer.id}/front`)).toBe(true);
    const lists = buildLists(job, project, shop, (mm) => `${round(mm / 25.4)}"`);
    expect(lists.hardware.some((h) => /Applied front, from inside the box/.test(h.note ?? ''))).toBe(true);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.filter((s) => s.startsWith('The fronts are inset:'))).toHaveLength(1);
    expect(steps.find((s) => s.startsWith('The fronts are inset:'))).toMatch(/flush with the front edges of the case/);
    expect(job.files.length).toBeGreaterThan(0);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
    // The wide front's job says nothing of fitting fronts.
    const wide = made();
    const wideJob = buildJob({ ...wide.project, slug: 'inset-wide' }, createStarterShop());
    const wideSteps = buildChecklistSections(wide.project, wideJob.plan, wideJob.programs, wide.shop.tools, undefined, wide.shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(wideSteps.some((s) => s.startsWith('The fronts are inset:'))).toBe(false);
  }, 60000);
});
