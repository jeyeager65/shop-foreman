// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCabinetAssembly, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, designsOf, drawerBox, isDrawer, isSlide, partBox, slideMountWords } from '@/design';
import { slideMountsOf } from '@/design/drawerBox';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { EURO_SLIDE_ID, createStarterShop, createStarterShopProfile } from '@/libraries';
import type { ConstructionStyle, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A bottom-mount roller slide: a Euro slide, self-closing, 3/4 extension. */
const shop = createStarterShop();
const drawerOf = (project: Project) => designsOf(project).find(isDrawer)!;
function build(style: ConstructionStyle, euro = true) {
  const project = createBaseCabinetProject(style);
  if (euro) drawerOf(project).slide = { ...drawerOf(project).slide, slideId: EURO_SLIDE_ID };
  return { project, box: drawerBox(drawerOf(project), project, shop)! };
}

describe('a bottom-mount roller slide', () => {
  const euro = shop.hardware.filter(isSlide).find((s) => s.id === EURO_SLIDE_ID)!;

  it('comes with the shop: bottom mount, 1/2" each side, 3/4 extension, self-closing, 12" to 24"', () => {
    expect([euro.mount, euro.extension, euro.close, euro.generic]).toEqual(['bottom', 'threeQuarter', 'self', false]);
    expect(euro.sideClearance).toEqual(len('1/2"'));
    expect(euro.lengths.map((l) => Math.round(l.mm / 25.4))).toEqual([12, 14, 16, 18, 20, 22, 24]);
    // From the maker's sheet: 1-5/8" up the cabinet member; only what it needs behind it is still a guess.
    expect(euro.memberHeight).toBe(41.3);
    expect(euro.tuneMe).toEqual(['rearClearance']);
    expect(slideMountWords(euro)).toBe('Bottom mount (the box stands on its drawer members)');
  });

  it('the box is the same size as on a side-mount slide of that length; the slide is level with its bottom edge', () => {
    const [on, beside] = [build('frameless'), build('frameless', false)];
    expect(on.box.slide!.slide.id).toBe(EURO_SLIDE_ID);
    expect(on.box.size).toEqual(beside.box.size);
    const side = on.box.parts.find((p) => p.id.endsWith('/box-side-left'))!;
    const under = partBox(side).min[1];
    // Its centre line: half the member's height above the box's bottom edge, not half way up the box.
    expect(on.box.slideAt.y).toBeCloseTo(under + euro.memberHeight / 2, 6);
    expect(beside.box.slideAt.y).toBeCloseTo(under + on.box.size.height / 2, 6);
  });

  it('behind a face frame its build-out strips are behind it, no lower than the opening', () => {
    const { project, box } = build('faceFrame');
    const strip = box.parts.find((p) => p.id.endsWith('/strip-left'))!;
    const b = partBox(strip);
    expect(b.min[1]).toBeLessThanOrEqual(box.slideAt.y);
    expect(b.max[1]).toBeGreaterThanOrEqual(box.slideAt.y);
    const side = partBox(box.parts.find((p) => p.id.endsWith('/box-side-left'))!);
    expect(b.min[1]).toBeLessThanOrEqual(side.min[1] + 1e-6);
    expect(deriveDrawerBoxParts(project, shop).length).toBeGreaterThan(5);
  });

  it('in the 3D view: two members beside the box at its bottom edge, and the drawer comes out three quarters', () => {
    const { project, box } = build('frameless');
    const all = [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)];
    const assembly = buildCabinetAssembly(all, shop.hardware, slideMountsOf(project, shop));
    const side = assembly.parts.find((p) => p.partId === 'drawer-1/box-side-left')!;
    expect(side.runsOn).toMatchObject({ bottom: true, extension: 'threeQuarter', height: euro.memberHeight });
    expect(side.runsOn!.y).toBeCloseTo(box.slideAt.y, 6);
    expect(side.slide).toBeCloseTo(0.75 * box.size.length, 6);
    expect(assembly.parts.find((p) => p.partId === 'drawer-1/front')!.slide).toBeCloseTo(0.75 * box.size.length, 6);
  });

  it('builds: the list and the steps say how it goes on', () => {
    const profile = createStarterShopProfile();
    const { project } = build('frameless');
    const job = buildJob({ ...project, slug: 'euro' }, profile);
    const row = buildLists(job, project, shop, (mm) => `${Math.round((mm / 25.4) * 100) / 100}"`).hardware.find((h) => h.item.startsWith('Liberty D688 bottom-mount roller slide (Euro), self-closing'))!;
    expect(row.unit).toBe('pair');
    expect(row.note).toContain("screwed up into the side's bottom edge");
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((s) => s.startsWith('A bottom-mount roller slide: its drawer member is an angle'))).toBe(true);
    // Not said of a side-mount slide.
    const plain = build('frameless', false).project;
    const plainJob = buildJob({ ...plain, slug: 'plain' }, profile);
    expect(buildChecklistSections(plain, plainJob.plan, plainJob.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text)).some((s) => s.startsWith('A bottom-mount roller slide'))).toBe(false);
  });
});
