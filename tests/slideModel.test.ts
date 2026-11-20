// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TOP_DRAWER_SHARE, buildCabinetAssembly, buildProjectAssembly, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, designsOf, partBox, slideBesideBox, slideMountsOf } from '@/design';
import { createStarterShop } from '@/libraries';
import type { Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';

/** The drawer slides in the 3D view: beside each box side, in its side clearance. */
const shop = createStarterShop();
const partsOf = (project: Project) => [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)];

describe('the slide each drawer runs on', () => {
  it('is the drawer box\'s slide, at the length in use', () => {
    const mounts = slideMountsOf(createBaseCabinetProject('frameless'), shop);
    expect(mounts.map((m) => [m.drawerId, m.slide.id, m.length])).toEqual([['drawer-1', 'generic-side-mount-ball-bearing', 508]]);
  });

  it('a drawer on runners has none', () => {
    const project = createShopCabinetProject();
    for (const d of designsOf(project)) if (d.template === 'drawer') d.shop = { ...d.shop, front: 'runners' };
    expect(slideMountsOf(project, shop)).toEqual([]);
  });
});

describe('a slide beside a box side', () => {
  const project = createBaseCabinetProject('frameless');
  const parts = partsOf(project);
  const mount = slideMountsOf(project, shop)[0]!;
  const [left, right] = [parts.find((p) => p.id === 'drawer-1/box-side-left')!, parts.find((p) => p.id === 'drawer-1/box-side-right')!];

  it('fills the side clearance between the box side and the case side, centred on the box side, from the box\'s front end', () => {
    const l = slideBesideBox(left, mount);
    const box = partBox(left);
    const clearance = mount.slide.sideClearance.mm;
    expect([l.dir, l.clearance]).toEqual([1, clearance]);
    expect(l.outer).toBeCloseTo(box.min[0] - clearance, 6);
    expect(l.y).toBeCloseTo((box.min[1] + box.max[1]) / 2, 6);
    expect([l.height, l.length, l.extension]).toEqual([mount.slide.memberHeight, 508, mount.slide.extension]);
    expect(l.front).toBeCloseTo(box.max[2], 6);
    // On a frameless cabinet its outer face is the case side's inner face.
    const side = partBox(parts.find((p) => p.id === 'cabinet-1/side-left')!);
    expect(l.outer).toBeCloseTo(side.max[0], 6);
    const r = slideBesideBox(right, mount);
    expect(r.dir).toBe(-1);
    expect(r.outer).toBeCloseTo(partBox(parts.find((p) => p.id === 'cabinet-1/side-right')!).min[0], 6);
  });

  it('the assembly puts one on each box side, and none without the mounts', () => {
    const withSlides = buildCabinetAssembly(parts, shop.hardware, [mount]).parts.filter((p) => p.runsOn);
    expect(withSlides.map((p) => p.partId)).toEqual(['drawer-1/box-side-left', 'drawer-1/box-side-right']);
    // They come out with the drawer.
    expect(withSlides.every((p) => (p.slide ?? 0) > 0)).toBe(true);
    expect(buildCabinetAssembly(parts, shop.hardware).parts.some((p) => p.runsOn)).toBe(false);
  });

  it('in a view of several cabinets they go with their cabinet', () => {
    const at: [number, number, number] = [1000, 50, -20];
    const one = buildCabinetAssembly(parts, shop.hardware, [mount]).parts.find((p) => p.runsOn)!.runsOn!;
    const moved = buildProjectAssembly([{ id: 'cabinet-1', at, parts }], shop.hardware, [mount]).parts.find((p) => p.runsOn)!.runsOn!;
    expect([moved.outer - one.outer, moved.y - one.y, moved.front - one.front]).toEqual(at.map((v) => expect.closeTo(v, 6)));
  });
});

describe('drawers opening in steps', () => {
  it('the bottom drawer comes all the way out and each one above it less; a single drawer all the way', () => {
    const project = createBaseCabinetProject('frameless', 'drawers', 3);
    const placed = buildCabinetAssembly(partsOf(project), shop.hardware).parts;
    const shareOf = (id: string) => placed.find((p) => p.partId === `${id}/front`)!.pullShare;
    const drawers = designsOf(project).filter((d) => d.template === 'drawer');
    expect(drawers).toHaveLength(3);
    // Top to bottom, by where each front is.
    const fronts = drawers.map((d) => placed.find((p) => p.partId === `${d.id}/front`)!).sort((a, b) => b.offset[1] - a.offset[1]);
    expect(fronts.map((p) => p.pullShare)).toEqual([TOP_DRAWER_SHARE, expect.closeTo((1 + TOP_DRAWER_SHARE) / 2, 6), 1]);
    // A drawer's box comes out with its front.
    for (const d of drawers) expect(placed.filter((p) => p.partId.startsWith(`${d.id}/box-`)).every((p) => p.pullShare === shareOf(d.id))).toBe(true);
    // One drawer: all the way. Nothing else has a share.
    const one = buildCabinetAssembly(partsOf(createBaseCabinetProject('frameless')), shop.hardware).parts;
    expect(one.filter((p) => p.pullShare !== undefined).every((p) => p.pullShare === 1)).toBe(true);
    expect(one.filter((p) => p.role === 'side' || p.partId.includes('door')).every((p) => p.pullShare === undefined)).toBe(true);
  });
});
