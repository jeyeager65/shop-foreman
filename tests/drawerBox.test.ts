// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BOX_BOTTOM_PLAY,
  BOX_GROOVE_DEPTH,
  BOX_RABBET_DEPTH,
  buildCabinetAssembly,
  cabinetsOf,
  deriveCabinetParts,
  deriveDrawerBoxParts,
  deriveParts,
  drawerBox,
  isDrawer,
  partBox,
  designsOf,
} from '@/design';
import { buildPartMeshes } from '@/geometry/solids';
import { PLYWOOD_1_2_ID, PLYWOOD_1_4_ID, createStarterShop } from '@/libraries';
import type { ConstructionStyle, DrawerDesign, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject } from '@/storage/projectFile';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const drawerOf = (project: Project) => designsOf(project).find(isDrawer)!;
const sizeOf = (p: Part) => `${frac(p.size.width)} x ${frac(p.size.height)}`;
const part = (parts: Part[], key: string) => parts.find((p) => p.id === `drawer-1/${key}`)!;
const of = <K extends Part['features'][number]['kind']>(p: Part, kind: K) => p.features.filter((f): f is Extract<Part['features'][number], { kind: K }> => f.kind === kind);

function build(style: ConstructionStyle, change?: (drawer: DrawerDesign, project: Project) => void) {
  const project = createBaseCabinetProject(style);
  change?.(drawerOf(project), project);
  return { project, box: drawerBox(drawerOf(project), project, shop)! };
}

describe('the drawer box on the reference cabinet', () => {
  it('frameless: sized from the opening, the slide and the opening height', () => {
    const { box } = build('frameless');
    // 24" less two 23/32" sides and 1/2" each side; a 20" slide; a 6" opening less 1".
    expect([frac(box.size.width), frac(box.size.length), frac(box.size.height)]).toEqual(['21-9/16"', '20"', '5"']);
    expect(box.heightFrom).toBe('opening');
    expect(box.mount).toBe('case');
    expect(box.parts.map((p) => p.id)).toEqual(['drawer-1/box-side-left', 'drawer-1/box-side-right', 'drawer-1/box-front', 'drawer-1/box-back', 'drawer-1/box-bottom']);
  });

  it('face frame: 20" wide between 1-1/2" stiles, on a 22" slide, with two build-out strips', () => {
    const { box } = build('faceFrame');
    expect([frac(box.size.width), frac(box.size.length), frac(box.size.height)]).toEqual(['20"', '22"', '5"']);
    expect(box.mount).toBe('strips');
    expect(frac(box.stripThickness!)).toBe('3/4"');
    expect(box.parts.map((p) => p.id.split('/')[1])).toEqual(['box-side-left', 'box-side-right', 'box-front', 'box-back', 'box-bottom', 'strip-left', 'strip-right']);
  });

  it('rabbeted corners: full-length sides, the front and back reach into the rabbets', () => {
    const { box } = build('faceFrame');
    expect(sizeOf(part(box.parts, 'box-side-left'))).toBe('22" x 5"');
    // 20" less two 15/32" sides, plus 1/4" into each rabbet.
    expect(sizeOf(part(box.parts, 'box-front'))).toBe('19-9/16" x 5"');
    expect(sizeOf(part(box.parts, 'box-back'))).toBe('19-9/16" x 5"');
    for (const key of ['box-side-left', 'box-side-right']) {
      const rabbets = of(part(box.parts, key), 'dado').filter((f) => f.id.startsWith('box-rabbet'));
      expect(rabbets.map((f) => f.id).sort()).toEqual(['box-rabbet-back', 'box-rabbet-front']);
      expect(rabbets.every((f) => f.face === 'A' && f.depth === BOX_RABBET_DEPTH)).toBe(true);
    }
    expect(box.parts.some((p) => of(p, 'pocketHole').length > 0)).toBe(false);
  });

  it('pocket screws: the front and back stand between the sides and carry the holes on their outside faces', () => {
    const { box } = build('faceFrame', (d) => (d.box.cornerJoint = 'pocketScrews'));
    expect(sizeOf(part(box.parts, 'box-front'))).toBe('19-1/16" x 5"');
    expect(of(part(box.parts, 'box-side-left'), 'dado').map((f) => f.id)).toEqual(['box-groove']);
    for (const key of ['box-front', 'box-back']) {
      const holes = of(part(box.parts, key), 'pocketHole');
      expect(holes).toHaveLength(4);
      expect(holes.every((h) => h.face === 'B')).toBe(true);
      expect(holes.map((h) => h.edge).sort()).toEqual(['x0', 'x0', 'x1', 'x1']);
      // Above the groove, so a screw cannot break into it.
      const groove = of(part(box.parts, key), 'dado')[0]!;
      expect(Math.min(...holes.map((h) => h.at))).toBeGreaterThan(groove.outline[2]!.y + 5);
    }
    // The front's screws keep clear of the pockets at its ends.
    expect(of(part(box.parts, 'box-front'), 'hole').map((h) => frac(h.center.x))).toEqual(['3"', '16-1/16"', '3"', '16-1/16"']);
  });

  it('every wall has the groove and the bottom lies in it with a little play', () => {
    const { box } = build('faceFrame');
    const bottom = part(box.parts, 'box-bottom');
    expect(bottom.materialId).toBe(PLYWOOD_1_4_ID);
    for (const key of ['box-side-left', 'box-side-right', 'box-front', 'box-back']) {
      const wall = part(box.parts, key);
      expect(wall.materialId).toBe(PLYWOOD_1_2_ID);
      const groove = of(wall, 'dado').find((f) => f.id === 'box-groove')!;
      expect(groove.depth).toBe(BOX_GROOVE_DEPTH);
      expect([frac(groove.outline[0]!.y), frac(groove.outline[2]!.y - groove.outline[0]!.y)]).toEqual(['1/2"', '7/32"']);
      expect(groove.outline[2]!.x).toBeCloseTo(wall.size.width, 6);
    }
    const b = partBox(bottom);
    const left = partBox(part(box.parts, 'box-side-left'));
    const right = partBox(part(box.parts, 'box-side-right'));
    const front = partBox(part(box.parts, 'box-front'));
    const back = partBox(part(box.parts, 'box-back'));
    // Into each side by the groove's depth less half the play; the same front and back.
    const into = BOX_GROOVE_DEPTH - BOX_BOTTOM_PLAY / 2;
    expect(b.min[0]).toBeCloseTo(left.max[0] - into, 6);
    expect(b.max[0]).toBeCloseTo(right.min[0] + into, 6);
    expect(b.max[2]).toBeCloseTo(front.min[2] + into, 6);
    expect(b.min[2]).toBeCloseTo(back.max[2] - into, 6);
    // In the groove: 1/2" up from the walls' bottom edge.
    expect(frac(b.min[1] - left.min[1])).toBe('1/2"');
  });

  it('the box front has four clearance holes for the front screws, through it', () => {
    const { box } = build('faceFrame');
    const front = part(box.parts, 'box-front');
    const holes = of(front, 'hole');
    expect(holes.map((h) => `${frac(h.center.x)},${frac(h.center.y)}`)).toEqual(['1",1"', '18-9/16",1"', '1",4"', '18-9/16",4"']);
    expect(holes.every((h) => h.depth === front.size.thickness && frac(h.diameter) === '3/16"')).toBe(true);
    expect(of(part(box.parts, 'box-back'), 'hole')).toHaveLength(0);
  });

  it('stands in the opening: clear at the sides, 1/4" under, against the back of the front, in front of the back', () => {
    for (const style of ['frameless', 'faceFrame'] as const) {
      const { project, box } = build(style);
      const cabinet = deriveCabinetParts(project, shop);
      const walls = box.parts.filter((p) => p.role !== 'buildOut').map(partBox);
      const min = [0, 1, 2].map((i) => Math.min(...walls.map((w) => w.min[i]!)));
      const max = [0, 1, 2].map((i) => Math.max(...walls.map((w) => w.max[i]!)));
      expect([max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!].map(frac)).toEqual([box.size.width, box.size.height, box.size.length].map(frac));
      // Centred across the cabinet.
      expect(min[0]! + max[0]!).toBeCloseTo(cabinetsOf(project)[0]!.size.width.mm, 6);
      // Its front touches the back of the applied front.
      const applied = partBox(deriveParts(project, shop).find((p) => p.id === 'drawer-1/front')!);
      expect(max[2]).toBeCloseTo(applied.min[2], 6);
      // Its rear stops short of the nailer, which stands behind the drawer.
      const nailer = partBox(cabinet.find((p) => p.id === 'cabinet-1/stretcher-back')!);
      expect(min[2]).toBeGreaterThan(nailer.max[2]);
      // No box part runs into a case or frame part.
      for (const p of box.parts.map(partBox)) {
        for (const c of cabinet.map(partBox)) {
          const lap = [0, 1, 2].map((i) => Math.min(p.max[i]!, c.max[i]!) - Math.max(p.min[i]!, c.min[i]!));
          expect(lap.every((v) => v > 0.01)).toBe(false);
        }
      }
    }
  });

  it('an own height replaces the default; one too tall for the opening is refused', () => {
    const { box } = build('frameless', (d) => (d.box.height = len('4"')));
    expect([frac(box.size.height), box.heightFrom]).toEqual(['4"', 'own']);
    expect(sizeOf(part(box.parts, 'box-side-left'))).toBe('20" x 4"');
    expect(() => build('frameless', (d) => (d.box.height = len('6"')))).toThrow(/too tall/);
    expect(() => build('frameless', (d) => (d.box.height = len('3/4"')))).toThrow(/too short/);
  });

  it('follows the slide: a shorter slide makes a shorter box', () => {
    const { box } = build('frameless', (d) => (d.slide.length = len('16"')));
    expect(frac(box.size.length)).toBe('16"');
    expect(sizeOf(part(box.parts, 'box-bottom'))).toBe('21-3/32" x 15-17/32"');
  });

  it('grain runs along every box part', () => {
    const { box } = build('faceFrame');
    expect(box.parts.every((p) => p.grain === 'width')).toBe(true);
  });
});

describe('carrying the slides behind a face frame', () => {
  it('strips: solid wood, flush with the opening, from the back of the frame to the end of the slide', () => {
    const { project, box } = build('faceFrame');
    const cabinet = cabinetsOf(project)[0]!;
    const [left, right] = [part(box.parts, 'strip-left'), part(box.parts, 'strip-right')];
    expect(left.role).toBe('buildOut');
    expect(left.materialId).toBe(cabinet.faceFrame.materialId);
    // 22" slide less the 3/4" frame it starts at the front of.
    expect(sizeOf(left)).toBe('21-1/4" x 2"');
    // The frame stock at its own thickness; short printed shims make up the 1/32" to the opening's edge.
    expect(frac(left.size.thickness)).toBe('3/4"');
    expect(box.shim && [frac(box.shim.thickness), frac(box.shim.length), frac(box.shim.height), box.shim.perStrip]).toEqual(['1/32"', '1-1/2"', '2"', 3]);
    // A short slide's strip takes two: one at each end.
    expect(build('faceFrame', (d) => (d.slide.length = len('10"'))).box.shim!.perStrip).toBe(2);
    const [l, r] = [partBox(left), partBox(right)];
    // Against the case sides.
    expect([frac(l.min[0]), frac(l.max[0])]).toEqual(['23/32"', '1-15/32"']);
    expect([frac(r.min[0]), frac(r.max[0])]).toEqual(['22-17/32"', '23-9/32"']);
    expect(l.max[2]).toBeCloseTo(0, 6);
    // The slide's 1/2" clearance and the shim lie between each strip and the box.
    const side = partBox(part(box.parts, 'box-side-left'));
    expect(side.min[0] - l.max[0]).toBeCloseTo(12.7 + box.shim!.thickness, 6);
    // Centred on the box side.
    expect(l.min[1] + l.max[1]).toBeCloseTo(side.min[1] + side.max[1], 6);
  });

  it('a strip whose stock is thicker than the gap is the gap, with no shim', () => {
    const { box } = build('faceFrame', (_, p) => (cabinetsOf(p)[0]!.faceFrame.stileWidth = len('1-1/4"')));
    expect(frac(box.stripThickness!)).toBe('17/32"');
    expect(box.shim).toBeUndefined();
  });

  it('rear brackets: no strips; the bracket goes on the nailer, or on the back when the stretcher lies flat', () => {
    const { box } = build('faceFrame', (d) => (d.slide.faceFrameMount = 'rearBrackets'));
    expect([box.mount, box.bracketOn]).toEqual(['rearBrackets', 'nailer']);
    expect(box.parts.some((p) => p.role === 'buildOut')).toBe(false);
    const flat = build('faceFrame', (d, p) => {
      d.slide.faceFrameMount = 'rearBrackets';
      cabinetsOf(p)[0]!.joinery.backStretcherForm = 'flat';
    });
    expect(flat.box.bracketOn).toBe('back');
  });

  it('frameless: the slides sit on the case sides whatever the choice says', () => {
    const { box } = build('frameless', (d) => (d.slide.faceFrameMount = 'rearBrackets'));
    expect(box.mount).toBe('case');
    expect(box.bracketOn).toBeUndefined();
    expect(box.parts).toHaveLength(5);
  });
});

describe('the box in the project', () => {
  it('is kept out of the parts Plan works from', () => {
    const p = createBaseCabinetProject('faceFrame');
    expect(deriveParts(p, shop).map((x) => x.id)).toEqual(['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']);
    expect(deriveDrawerBoxParts(p, shop)).toHaveLength(7);
    expect(deriveCabinetParts(p, shop).some((x) => x.designObjectId === 'drawer-1')).toBe(false);
  });

  it('comes out of the cabinet as one in the exploded view, behind its front; strips go with the sides', () => {
    const p = createBaseCabinetProject('faceFrame');
    const assembly = buildCabinetAssembly([...deriveCabinetParts(p, shop), ...deriveDrawerBoxParts(p, shop), ...deriveParts(p, shop)]);
    const explode = (id: string) => assembly.parts.find((x) => x.partId === id)!.explode;
    const box = ['box-side-left', 'box-side-right', 'box-front', 'box-back', 'box-bottom'].map((k) => explode(`drawer-1/${k}`));
    expect(new Set(box.map((e) => e.join())).size).toBe(1);
    expect(box[0]![2]).toBeGreaterThan(0);
    expect(box[0]![2]).toBeLessThan(explode('drawer-1/front')[2]);
    expect([explode('drawer-1/strip-left')[0], explode('drawer-1/strip-right')[0]]).toEqual([-1, 1]);
  });

  it('builds as solids: the grooves, rabbets and holes are cut', async () => {
    const parts = deriveDrawerBoxParts(createBaseCabinetProject('faceFrame'), shop);
    const meshes = await buildPartMeshes(parts);
    const volume = (key: string) => meshes.find((m) => m.partId === `drawer-1/${key}`)!.mesh.volume;
    const side = part(parts, 'box-side-left');
    const { width, height, thickness } = side.size;
    const groove = of(side, 'dado').find((f) => f.id === 'box-groove')!;
    const grooveArea = (groove.outline[2]!.y - groove.outline[0]!.y) * BOX_GROOVE_DEPTH;
    // The rabbets are as deep as the groove, so where they cross the groove is cut once.
    const cut = grooveArea * (width - 2 * thickness) + 2 * thickness * height * BOX_RABBET_DEPTH;
    expect(volume('box-side-left')).toBeCloseTo(width * height * thickness - cut, 0);
    const strip = part(parts, 'strip-left');
    expect(volume('strip-left')).toBeCloseTo(strip.size.width * strip.size.height * strip.size.thickness, 0);
  });

  it('exports the box materials with the project', () => {
    const ids = exportProject(createBaseCabinetProject(), shop).project.materials.map((m) => m.id);
    expect(ids).toContain(PLYWOOD_1_2_ID);
  });
});
