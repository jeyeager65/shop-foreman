// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetOpeningsOf, cabinetsOf, deriveCabinetParts, deriveFaceFrameParts, deriveParts, partBox, pocketPositions, railEndPositions } from '@/design';
import { buildPartMeshes } from '@/geometry/solids';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, Feature, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const framed = createBaseCabinetProject('faceFrame');
const frameless = createBaseCabinetProject('frameless');
const cabinetOf = (p: Project): CabinetDesign => cabinetsOf(p)[0]!;
const parts = deriveCabinetParts(framed, shop);
const part = (key: string, list: Part[] = parts) => list.find((p) => p.id === `cabinet-1/${key}`)!;
const sizeOf = (p: Part) => `${frac(p.size.width)} x ${frac(p.size.height)} x ${frac(p.size.thickness)}`;
type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
/** The pocket holes of the frame: the ones that join the case parts to the sides are in joints.test.ts. */
const pockets = (p: Part) => p.features.filter((f): f is PocketHole => f.kind === 'pocketHole' && !f.id.startsWith('side-pocket'));
/** "A/x0: 8", 15-15/16"" */
const pocketText = (p: Part) => {
  const found = pockets(p);
  return found.length ? `${found[0]!.face}/${found[0]!.edge}: ${found.map((f) => frac(f.at)).join(', ')}` : '';
};
const derive = (change: (c: CabinetDesign) => void, from: Project = framed) => {
  const p = structuredClone(from);
  change(cabinetOf(p));
  return deriveCabinetParts(p, shop);
};

describe('face frame parts of the reference cabinet', () => {
  const frame = parts.filter((p) => p.role === 'frameStile' || p.role === 'frameRail');

  it('adds two stiles and a rail above, between and below the openings', () => {
    expect(frame.map((p) => p.id.replace('cabinet-1/', ''))).toEqual(['frame-stile-left', 'frame-stile-right', 'frame-rail-top', 'frame-rail-mid-1', 'frame-rail-bottom']);
    expect(frame.map((p) => p.name)).toEqual(['Left stile', 'Right stile', 'Top rail', 'Middle rail', 'Bottom rail']);
    expect(frame.every((p) => p.materialId === 'solid-wood-3-4' && p.designObjectId === 'cabinet-1')).toBe(true);
    expect(deriveFaceFrameParts(cabinetOf(framed), shop.materials)).toEqual(frame);
  });

  it('sizes the stiles to the full height of the frame and the rails between them', () => {
    expect(sizeOf(part('frame-stile-left'))).toBe('1-1/2" x 30" x 3/4"');
    expect(sizeOf(part('frame-stile-right'))).toBe('1-1/2" x 30" x 3/4"');
    for (const key of ['frame-rail-top', 'frame-rail-mid-1', 'frame-rail-bottom']) expect(sizeOf(part(key))).toBe('21" x 1-1/2" x 3/4"');
  });

  it('covers the case front from the top of the toe kick to the top, leaving exactly the openings', () => {
    const boxes = frame.map((p) => ({ id: p.id, ...partBox(p) }));
    // In front of the case, as thick as the frame material.
    for (const b of boxes) {
      expect(b.min[2]).toBeCloseTo(0, 6);
      expect(b.max[2]).toBeCloseTo(19.05, 6);
    }
    expect(Math.min(...boxes.map((b) => b.min[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...boxes.map((b) => b.max[0]))).toBeCloseTo(len('24"').mm, 6);
    expect(Math.min(...boxes.map((b) => b.min[1]))).toBeCloseTo(len('4-1/2"').mm, 6);
    expect(Math.max(...boxes.map((b) => b.max[1]))).toBeCloseTo(len('34-1/2"').mm, 6);
    // No two frame parts overlap, and none covers an opening.
    const openings = cabinetOpeningsOf(framed, shop.materials).map((o) => ({ id: o.id, min: [o.origin.x, o.origin.y], max: [o.origin.x + o.width, o.origin.y + o.height] }));
    const lap = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) => [0, 1].every((i) => a.min[i]! < b.max[i]! - 1e-6 && b.min[i]! < a.max[i]! - 1e-6);
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) expect(lap(a, b), `${a.id} and ${b.id}`).toBe(false);
      for (const o of openings) expect(lap(a, o), `${a.id} and ${o.id}`).toBe(false);
    });
    // Frame plus openings fill the frame's rectangle.
    const area = (b: { min: number[]; max: number[] }) => (b.max[0]! - b.min[0]!) * (b.max[1]! - b.min[1]!);
    const total = [...boxes, ...openings].reduce((sum, b) => sum + area(b), 0);
    expect(total).toBeCloseTo(len('24"').mm * len('30"').mm, 3);
    // The middle rail sits under the drawer opening; the bottom rail's top is level with the cabinet bottom's top.
    expect(frac(part('frame-rail-mid-1').placement!.origin[1])).toBe('25-1/2"');
    expect(partBox(part('frame-rail-bottom')).max[1]).toBeCloseTo(partBox(part('bottom')).max[1], 6);
  });

  it('follows the stile and rail widths, the layout and the frame material', () => {
    const wide = derive((c) => {
      c.faceFrame.stileWidth = len('2"');
      c.faceFrame.railWidth = len('1-3/4"');
    });
    expect(sizeOf(part('frame-stile-left', wide))).toBe('2" x 30" x 3/4"');
    expect(sizeOf(part('frame-rail-top', wide))).toBe('20" x 1-3/4" x 3/4"');

    const three = derive((c) => (c.layout.rows = [{ id: 'a', use: 'drawer', height: len('5"') }, { id: 'b', use: 'drawer', height: len('5"') }, { id: 'c', use: 'doors' }]));
    expect(three.filter((p) => p.role === 'frameRail').map((p) => p.name)).toEqual(['Top rail', 'Middle rail 1', 'Middle rail 2', 'Bottom rail']);
    expect(derive((c) => (c.layout.rows = [{ id: 'c', use: 'doors' }])).filter((p) => p.role === 'frameRail')).toHaveLength(2);

    const thin = structuredClone(shop);
    thin.materials.find((m) => m.id === 'solid-wood-3-4')!.measuredThickness = len('18mm');
    expect(part('frame-stile-left', deriveCabinetParts(framed, thin)).size.thickness).toBe(18);
  });

  it('is there only with a face frame, and switching back and forth re-enters nothing', () => {
    expect(deriveCabinetParts(frameless, shop).some((p) => p.role === 'frameStile' || p.role === 'frameRail')).toBe(false);
    expect(deriveCabinetParts(frameless, shop).some((p) => pockets(p).length > 0)).toBe(false);
    const p = structuredClone(framed);
    cabinetOf(p).construction = 'frameless';
    expect(deriveCabinetParts(p, shop)).toEqual(deriveCabinetParts(frameless, shop));
    cabinetOf(p).construction = 'faceFrame';
    expect(deriveCabinetParts(p, shop)).toEqual(parts);
  });
});

describe('pocket holes', () => {
  it('spaces them 2" from each end and no more than 8" apart', () => {
    expect(pocketPositions(0, len('22-9/16"').mm).map(frac)).toEqual(['2"', '8-3/16"', '14-3/8"', '20-9/16"']);
    expect(pocketPositions(0, len('12"').mm).map(frac)).toEqual(['2"', '10"']);
    expect(pocketPositions(0, len('12-1/8"').mm).map(frac)).toEqual(['2"', '6-1/16"', '10-1/8"']);
    // Too short for two: one in the middle.
    expect(pocketPositions(0, len('3"').mm).map(frac)).toEqual(['1-1/2"']);
  });

  it('joins the frame through the back of each rail end, two screws on a rail 1" or wider', () => {
    for (const key of ['frame-rail-top', 'frame-rail-mid-1', 'frame-rail-bottom']) {
      expect(pockets(part(key)).map((f) => `${f.face}/${f.edge} ${frac(f.at)}`)).toEqual(['B/x0 3/8"', 'B/x0 1-1/8"', 'B/x1 3/8"', 'B/x1 1-1/8"']);
    }
    expect(pockets(part('frame-stile-left'))).toEqual([]);
    expect(railEndPositions(len('3/4"').mm).map(frac)).toEqual(['3/8"']);
    expect(railEndPositions(len('3"').mm).map(frac)).toEqual(['3/4"', '2-1/4"']);
  });

  it('attaches the frame from the inside face of an exposed side, between the bottom and the stretchers', () => {
    // Face A of a side is its inside face; the front edge is x0 on the left side and x1 on the right.
    expect(pocketText(part('side-left'))).toBe('A/x0: 8", 15-15/16", 23-27/32", 31-25/32"');
    expect(pocketText(part('side-right'))).toBe('A/x1: 8", 15-15/16", 23-27/32", 31-25/32"');
  });

  it('attaches it from the outside face of a hidden side, along the whole frame, each side on its own', () => {
    const corner = derive((c) => (c.sides.left = 'hidden'));
    expect(pocketText(part('side-left', corner))).toBe('B/x0: 6-1/2", 13", 19-1/2", 26", 32-1/2"');
    expect(pocketText(part('side-right', corner))).toBe('A/x1: 8", 15-15/16", 23-27/32", 31-25/32"');
    const both = derive((c) => (c.sides = { left: 'hidden', right: 'hidden' }));
    expect(pocketText(part('side-right', both))).toBe('B/x1: 6-1/2", 13", 19-1/2", 26", 32-1/2"');
  });

  it('attaches it from under the bottom and from the top of the front stretcher', () => {
    // Face A of both is the top face; y0 is the front edge.
    expect(pocketText(part('bottom'))).toBe('B/y0: 2", 8-3/16", 14-3/8", 20-9/16"');
    expect(pocketText(part('stretcher-front'))).toBe('A/y0: 2", 8-3/16", 14-3/8", 20-9/16"');
    for (const key of ['stretcher-back', 'back', 'toe-kick', 'shelf-1']) expect(pockets(part(key))).toEqual([]);
  });

  it('changes no size: the sides and stretchers are the same in both styles', () => {
    const plain = deriveCabinetParts(frameless, shop);
    for (const key of ['side-left', 'side-right', 'stretcher-front', 'stretcher-back']) {
      expect(part(key).size).toEqual(part(key, plain).size);
      expect(part(key).placement).toEqual(part(key, plain).placement);
    }
  });

  it('is cut out of the solid: a pocket and its pilot per hole', async () => {
    const rail = part('frame-rail-top');
    const bare = { ...rail, features: rail.features.filter((f) => f.kind !== 'pocketHole') };
    const [drilled, solid] = await buildPartMeshes([rail, bare]);
    const removed = solid!.mesh.volume - drilled!.mesh.volume;
    // Four holes, each well under a 3/8" x 1-1/2" cylinder and more than a pilot alone.
    expect(removed).toBeGreaterThan(4 * 200);
    expect(removed).toBeLessThan(4 * Math.PI * 4.75 ** 2 * 38);
    // Nothing is cut outside the rail.
    expect(drilled!.mesh.volume).toBeLessThan(rail.size.width * rail.size.height * rail.size.thickness);
  });
});

describe('grain', () => {
  const grainOf = (list: Part[]) => Object.fromEntries(list.map((p) => [p.id.replace('cabinet-1/', ''), p.grain]));

  it('runs up the uprights and across the parts that span the cabinet', () => {
    expect(grainOf(parts)).toEqual({
      'side-left': 'height',
      'side-right': 'height',
      bottom: 'width',
      'stretcher-front': 'width',
      'stretcher-back': 'width',
      back: 'height',
      'toe-kick': 'width',
      'shelf-1': 'width',
      'frame-stile-left': 'height',
      'frame-stile-right': 'height',
      'frame-rail-top': 'width',
      'frame-rail-mid-1': 'width',
      'frame-rail-bottom': 'width',
    });
  });

  it('is left off parts of a material without grain', () => {
    // The reference fronts are MDF.
    expect(deriveParts(framed, shop).every((p) => p.grain === undefined)).toBe(true);
    const mdfCase = derive((c) => (c.materials.caseId = 'mdf-3-4'));
    expect(part('side-left', mdfCase).grain).toBeUndefined();
    expect(part('back', mdfCase).grain).toBe('height');
  });

  it('runs up plywood doors and across a plywood drawer front', () => {
    const p = structuredClone(framed);
    const ply = structuredClone(shop);
    // Fronts need a material the bits have settings for: give the MDF grain.
    ply.materials.find((m) => m.id === 'mdf-3-4')!.hasGrain = true;
    expect(deriveParts(p, ply).map((part) => `${part.id}: ${part.grain}`)).toEqual(['doors-1/door-left: height', 'doors-1/door-right: height', 'drawer-1/front: width']);
  });

  it('is a flag on the starter materials', () => {
    expect(shop.materials.map((m) => `${m.id}: ${m.hasGrain}`)).toEqual(['mdf-3-4: false', 'plywood-3-4: true', 'plywood-1-4: true', 'solid-wood-3-4: true', 'plywood-1-2: true', 'butcher-block-1-1-2: true', 'mdf-1-4: false', 'hardboard-1-8: false', 'hardboard-3-16: false', 'osb-7-16: false', 'osb-3-4: false', 'square-2x2: true', 'square-3x3: true']);
  });
});

describe('saved data', () => {

  it('keeps a hidden side through export and import', () => {
    const p = structuredClone(framed);
    cabinetOf(p).sides.left = 'hidden';
    const read = parseProjectFile(serializeProjectFile(exportProject(p, shop)));
    expect(cabinetOf(read.project).sides).toEqual({ left: 'hidden', right: 'exposed' });
  });
});
