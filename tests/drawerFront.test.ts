// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCabinetAssembly, deriveCabinetParts, deriveParts, doorSetOf, drawerSideOverlay, isDrawer, partBox, designsOf } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import type { Project } from '@/model';
import { CABINET_HINGE_ID, createBaseCabinetProject, createCabinetDrawer, createDoorSettings, createDrawerSettings } from '@/samples/cabinet';
import { exportProject } from '@/storage/projectFile';
import { formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = lowRiderJobShop();
const framed = createBaseCabinetProject('faceFrame');
const drawerOf = (project: Project) => designsOf(project).find(isDrawer)!;
const frontOf = (project: Project) => deriveParts(project, shop).find((p) => p.id === 'drawer-1/front')!;

describe('drawer front on the face frame cabinet', () => {
  it("fills the drawer opening plus its overlays, with the doors' style and no hinge bores", () => {
    const front = frontOf(framed);
    // 21" + 2 x 1/2" from the doors' hinge; 6" + 1/2" top and bottom.
    expect(`${front.name}: ${frac(front.size.width)} x ${frac(front.size.height)}`).toBe('Drawer front: 22" x 7"');
    expect(front.features.map((f) => f.id)).toEqual(['pocket', 'bevel', 'outside-edge', 'cutout']);
    expect(front.features.every((f) => f.face !== 'B')).toBe(true);
    expect(front.role).toBeUndefined();
    const doors = doorSetOf(framed);
    expect(drawerOf(framed).front).toEqual({ style: doors.style, outsideEdge: doors.outsideEdge, materialId: doors.materialId });
  });

  it('lines up with the doors at the sides and clears them by the rail less the overlays', () => {
    const parts = deriveParts(framed, shop);
    const [left, right, front] = parts.map(partBox);
    expect([front!.min[0], front!.max[0]].map(frac)).toEqual([frac(left!.min[0]), frac(right!.max[0])]);
    expect([front!.min[1], front!.max[1]].map(frac)).toEqual(['26-1/2"', '33-1/2"']);
    // The doors top out at 26": the 1-1/2" rail less 1/2" from each.
    expect(frac(front!.min[1] - left!.max[1])).toBe('1/2"');
    expect(front!.min[2]).toBeCloseTo(left!.min[2], 6);
    const assembly = buildCabinetAssembly([...deriveCabinetParts(framed, shop), ...parts]);
    expect(assembly.parts.find((p) => p.partId === 'drawer-1/front')!.explode).toEqual([0, 0, 1.6]);
  });

  it("side overlay: its own value, else the doors' hinge, else 1/2\"", () => {
    const p = structuredClone(framed);
    expect(drawerSideOverlay(drawerOf(p), designsOf(p), shop.hardware)).toEqual({ overlay: 12.7, from: 'doors', doors: 12.7 });
    // Another hinge on the doors moves the front with them. The starter library has only 1/2" ones.
    const other = { ...structuredClone(shop.hardware.find((h) => h.id === doorSetOf(p).mounting.hingeId)!), id: 'test-1-1-4', overlay: len('1-1/4"') };
    const wide = { ...shop, hardware: [...shop.hardware, other] };
    const widths = () => deriveParts(p, wide).map((q) => frac(q.size.width));
    doorSetOf(p).mounting.hingeId = other.id;
    expect(widths()).toEqual(['11-11/16"', '11-11/16"', '23-1/2"']);
    // Its own value wins; the doors' is still reported, for the Design screen's warning.
    drawerOf(p).mounting.overlaySide = len('3/4"');
    expect(drawerSideOverlay(drawerOf(p), designsOf(p), wide.hardware)).toEqual({ overlay: len('3/4"').mm, from: 'own', doors: 31.75 });
    expect(widths()).toEqual(['11-11/16"', '11-11/16"', '22-1/2"']);
    // No doors on the cabinet.
    delete drawerOf(p).mounting.overlaySide;
    p.designObjects = p.designObjects.filter((d) => d.template === 'drawer');
    expect(drawerSideOverlay(drawerOf(p), designsOf(p), wide.hardware)).toEqual({ overlay: 12.7, from: 'default' });
    expect(widths()).toEqual(['22"']);
  });

  it('keeps its own style: a slab front beside shaker doors, and a readable error when the frame leaves no panel', () => {
    const p = structuredClone(framed);
    drawerOf(p).front.style = { kind: 'slab' };
    expect(frontOf(p).features.map((f) => f.id)).toEqual(['outside-edge', 'cutout']);
    expect(deriveParts(p, shop)[0]!.features.some((f) => f.kind === 'pocket')).toBe(true);
    const q = structuredClone(framed);
    const style = drawerOf(q).front.style;
    if (style.kind === 'shaker') style.frameWidth = len('3-1/2"');
    expect(() => deriveParts(q, shop)).toThrow(/too small for its frame width/);
  });

  it("a project's drawer fronts start as a copy of the doors they are given and do not share them", () => {
    const doors = createDoorSettings();
    doors.style = { kind: 'slab' };
    const drawers = createDrawerSettings(doors);
    expect(drawers.front.style).toEqual({ kind: 'slab' });
    expect(drawers.front.outsideEdge).toEqual(doors.outsideEdge);
    expect(drawers.front.outsideEdge).not.toBe(doors.outsideEdge);
    expect(createCabinetDrawer('cabinet-1/drawer', 'drawer-2').mounting.overlaySide).toBeUndefined();
  });

  it('is planned and posted with the doors on one blank; only the doors get an install kit', async () => {
    const job = buildJob(framed, shop);
    const labels = job.plan.operations.map((o) => o.label);
    expect(labels).toContain('Doors: hinge cups');
    expect(labels).toContain('Drawer: panel pocket');
    expect(labels).toContain('Drawer: cutout');
    expect(labels).not.toContain('Drawer: hinge cups');
    expect(job.plan.operations.filter((o) => o.kind === 'install')).toHaveLength(1);
    expect(job.plan.installKit.map((j) => j.template)).toEqual(['supportBlock', 'gapShim']);
    expect(job.plan.warnings.filter((w) => w.code === 'noCapableTool' || w.code === 'unsupported')).toEqual([]);
    // Side by side is 47" wide and one behind the other 51" long: neither fits the 34" wide
    // machine with a 24" x 48" sheet. The doors go in front and the drawer front behind.
    const fronts = job.plan.blanks[0]!;
    expect(fronts.partIds).toEqual(['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']);
    expect(fronts.arrangement).toEqual([2, 1]);
    expect([fronts.size.width, fronts.size.height].map(frac)).toEqual(['23-7/8"', '31"']);
    expect(fronts.warnings.map((w) => w.code)).toEqual(['tightMargins']);
    const [, front] = fronts.setups;
    const at = (id: string) => front!.placements.find((q) => q.partId === id)!.origin;
    expect(at('doors-1/door-left').y).toBeCloseTo(at('doors-1/door-right').y, 6);
    expect(at('drawer-1/front').y - at('doors-1/door-left').y).toBeCloseTo(20.5 * 25.4 + 20, 6);
    // Like operations share a bit change: 1/4", 1/8" clean-up, V bit, 1/4" again. The
    // two sides and the box walls add one each: the 1/8" bit, then the 1/4".
    expect(job.plan.summary.toolChanges).toBe(6);
    expect(job.files).toHaveLength(5);
    for (const file of job.files) {
      expect(file.text).not.toMatch(/^M[35]\b/m);
      for (const line of file.text.split('\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(127);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    }
    // The front is cut in the front-up setup only.
    expect(job.files[1]!.text).toContain('Drawer: panel pocket');
    expect(job.files[0]!.text).not.toContain('Drawer:');
  });

  it('a job with one design object keeps the plain labels', () => {
    const p = structuredClone(framed);
    p.designObjects = p.designObjects.filter((d) => d.template === 'doorSet');
    expect(buildJob(p, shop).plan.operations.map((o) => o.label)).toContain('Hinge cups');
  });

  it("exports with its material, and with the hinge the project's doors hang on though it has none yet", () => {
    const p = structuredClone(framed);
    p.designObjects = p.designObjects.filter((d) => d.template === 'drawer');
    const file = exportProject(p, shop);
    expect(file.project.materials.map((m) => m.id)).toContain(drawerOf(p).front.materialId);
    expect(file.library.hardware.filter((h) => !h.generic).map((h) => h.id)).toEqual([CABINET_HINGE_ID]);
  });
});
