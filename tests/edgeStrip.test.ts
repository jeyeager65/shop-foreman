// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, partBox, shopFor } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Part, Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject, setBays } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * A solid wood strip on the front edges of a plywood case with no face frame, where the plywood's edge must not
 * show at the front: `FramelessDesign.edgeStrip`, the parts cut smaller by it and a strip of the frame's material
 * on each.
 */
const profile = createStarterShopProfile();
const Q = len('3/4"').mm;
const settings = (project: Project) => (project.context as CasesContext).settings;

function frameless(change?: (project: Project) => void) {
  const project = createBaseCabinetProject('frameless');
  change?.(project);
  const shop = shopFor(project, profile);
  return { project, shop, cabinet: cabinetsOf(project)[0]!, parts: deriveCabinetParts(project, shop) };
}
const stripped = (more?: (project: Project) => void) =>
  frameless((p) => {
    settings(p).frameless.edgeStrip = len('3/4"');
    more?.(p);
  });
const strips = (parts: Part[]) => parts.filter((p) => p.role === 'caseEdge');
const round = (n: number) => Math.round(n * 100) / 100 + 0;

describe('a solid wood strip on the front edges of a frameless case', () => {
  it('left out, there is none, and banding is banding', () => {
    expect(strips(frameless().parts)).toHaveLength(0);
    const banded = frameless((p) => (settings(p).frameless.edgeBanding = true));
    expect(strips(banded.parts)).toHaveLength(0);
    expect(banded.parts.some((p) => p.banding && !p.banding.strip)).toBe(true);
  });

  it('every part with a front edge has a strip of the frame material, as wide as the part is thick', () => {
    const { parts, cabinet } = stripped();
    const edged = parts.filter((p) => p.banding?.strip);
    expect(edged.map((p) => p.name)).toEqual(expect.arrayContaining(['Left side', 'Right side', 'Bottom', 'Front stretcher']));
    expect(strips(parts)).toHaveLength(edged.length);
    for (const s of strips(parts)) {
      const of = edged.find((p) => s.id === `${p.id}-edge`)!;
      expect(s.name).toBe(`${of.name} edge strip`);
      expect([s.materialId, round(s.size.thickness), round(s.size.height)]).toEqual([cabinet.faceFrame.materialId, round(Q), round(of.size.thickness)]);
    }
  });

  it('each strip lies on the front of its part: its face at the case front, the part behind it', () => {
    const { parts, cabinet } = stripped();
    const [W, H] = [cabinet.size.width.mm, cabinet.size.height.mm];
    for (const s of strips(parts)) {
      const of = parts.find((p) => s.id === `${p.id}-edge`)!;
      const [box, behind] = [partBox(s), partBox(of)];
      // The case front is z = 0 and the back is -z: the strip from the front back by its thickness, the part from there.
      // (A loose shelf stands back from the case front, and its strip with it.)
      expect(round(box.max[2] - box.min[2])).toBe(round(Q));
      expect(round(behind.max[2])).toBe(round(box.min[2]));
      if (of.role !== 'shelf') expect(round(box.max[2])).toBe(0);
      // Across the part's thickness, and no longer than it.
      const across = of.role === 'side' ? 0 : 1;
      expect([round(box.min[across]), round(box.max[across])]).toEqual([round(behind.min[across]), round(behind.max[across])]);
      expect(box.min[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(box.max[0]).toBeLessThanOrEqual(W + 1e-6);
      expect(box.max[1]).toBeLessThanOrEqual(H + 1e-6);
    }
    // A side's strip runs from the top of the toe kick to the top; the bottom's between the sides.
    const side = partBox(strips(parts).find((s) => s.name === 'Left side edge strip')!);
    expect([round(side.min[1]), round(side.max[1])]).toEqual([round(cabinet.toeKick.height.mm), round(H)]);
    const t = partBox(parts.find((p) => p.name === 'Left side')!).max[0];
    const bottom = partBox(strips(parts).find((s) => s.name === 'Bottom edge strip')!);
    expect([round(bottom.min[0]), round(bottom.max[0])]).toEqual([round(t), round(W - t)]);
  });

  it('a partition and the shelves of two bays have theirs too', () => {
    const { parts } = stripped((p) => setBays(p, cabinetsOf(p)[0]!, 2));
    expect(strips(parts).some((s) => s.name.startsWith('Partition'))).toBe(true);
    expect(parts.filter((p) => p.banding?.strip)).toHaveLength(strips(parts).length);
  });

  it('builds: the strips are cut on a saw, the lists name no banding, Build says to glue them on, and the G-code parses', async () => {
    const { project, shop } = stripped();
    const job = buildJob({ ...project, slug: 'strip' }, profile);
    const made = job.cabinetParts.filter((p) => p.role === 'caseEdge');
    expect(made.length).toBeGreaterThan(3);
    expect(made.every((p) => job.plan.parts.find((x) => x.partId === p.id)!.cutOut !== 'cnc')).toBe(true);
    const lists = buildLists(job, project, shop, (mm) => `${round(mm / 25.4)}"`);
    expect(lists.hardware.some((h) => h.item.startsWith('Edge banding'))).toBe(false);
    const side = job.plan.parts.find((p) => p.partId.endsWith('/side-left'))!;
    expect(side.steps.map((s) => s.label)).toContain('Solid wood strip glued to its front edge');
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text));
    expect(steps.some((s) => s.startsWith('Glue a solid wood edge strip'))).toBe(true);
    expect(job.files.length).toBeGreaterThan(0);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  }, 60000);
});

/**
 * The same on an inset (shop-style) case, the inset style made fit for a house: `ShopStyleDesign.edgeStrip`. The
 * fronts stay flush with the case front, which is then the strips' faces.
 */
describe('a solid wood strip on the front edges of an inset case', () => {
  function inset(change?: (project: Project) => void) {
    const project = createShopCabinetProject();
    change?.(project);
    const shop = shopFor(project, profile);
    return { project, shop, cabinet: cabinetsOf(project)[0]!, parts: deriveCabinetParts(project, shop) };
  }
  const withStrip = (more?: (project: Project) => void) =>
    inset((p) => {
      settings(p).shop.edgeStrip = len('3/4"');
      more?.(p);
    });

  it('with neither field the parts are exactly the shop cabinet\'s; banding is banding', () => {
    const plain = inset().parts;
    expect(strips(plain)).toHaveLength(0);
    expect(plain.some((p) => p.banding)).toBe(false);
    expect(inset((p) => (settings(p).shop.edgeBanding = false)).parts).toEqual(plain);
    const banded = inset((p) => (settings(p).shop.edgeBanding = true)).parts;
    expect(strips(banded)).toHaveLength(0);
    expect(banded.some((p) => p.banding && !p.banding.strip)).toBe(true);
  });

  it('every banded part has a strip, on its front, its face at the case front', () => {
    const { parts, cabinet } = withStrip();
    const edged = parts.filter((p) => p.banding?.strip);
    expect(edged.map((p) => p.name)).toEqual(expect.arrayContaining(['Left side', 'Right side', 'Bottom']));
    expect(strips(parts)).toHaveLength(edged.length);
    for (const s of strips(parts)) {
      const of = edged.find((p) => s.id === `${p.id}-edge`)!;
      expect([s.materialId, round(s.size.thickness), round(s.size.height)]).toEqual([cabinet.faceFrame.materialId, round(Q), round(of.size.thickness)]);
      const [box, behind] = [partBox(s), partBox(of)];
      expect(round(behind.max[2])).toBe(round(box.min[2]));
      if (of.role !== 'shelf') expect(round(box.max[2])).toBe(0);
    }
  });

  it('the doors and the drawer box are the same parts as with no strip, the drawer\'s front flush with the case front', () => {
    const made = (x: ReturnType<typeof inset>) => [...deriveParts(x.project, x.shop), ...deriveDrawerBoxParts(x.project, x.shop)];
    const [plain, edged] = [made(inset()), made(withStrip())];
    expect(edged.length).toBeGreaterThanOrEqual(3);
    expect(edged).toEqual(plain);
    const front = edged.find((p) => p.role === 'boxFront')!;
    expect(round(partBox(front).max[2])).toBe(0);
  });

  it('no hole is in a strip or within 3 mm of the cut front edge of a side; a strip too thick for the hinge plates is refused', () => {
    const { parts } = withStrip();
    for (const name of ['Left side', 'Right side']) {
      const side = parts.find((p) => p.name === name)!;
      const holes = side.features.filter((f) => f.kind === 'hole');
      expect(holes.some((f) => f.id.startsWith('hinge-plate-'))).toBe(true);
      for (const f of holes) {
        if (f.kind !== 'hole') continue;
        const fromFront = name === 'Left side' ? f.center.x : side.size.width - f.center.x;
        expect(fromFront - f.diameter / 2).toBeGreaterThanOrEqual(3 - 1e-6);
      }
    }
    expect(() => withStrip((p) => (settings(p).shop.edgeStrip = len('2"')))).toThrow(/edge strip is too thick/);
  });

  it('builds, and its G-code parses', async () => {
    const { project } = withStrip();
    const job = buildJob({ ...project, slug: 'inset-strip' }, profile);
    expect(job.cabinetParts.filter((p) => p.role === 'caseEdge').length).toBeGreaterThan(2);
    expect(job.files.length).toBeGreaterThan(0);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
  }, 60000);
});
