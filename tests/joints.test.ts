// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CASE_DADO_DEPTH, JOINERY_BEFORE_BACK, cabinetsOf, caseJointOf, deriveCabinetParts, jointPositions, partBox } from '@/design';
import { buildPartMeshes } from '@/geometry/solids';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, Feature, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const cabinetOf = (p: Project): CabinetDesign => cabinetsOf(p)[0]!;
/**
 * These tests are about the joints of the bottom and the stretchers alone, so the
 * back is applied and the back stretcher flat. What the back's
 * joint and a nailer change is in back.test.ts.
 */
const plainBack = (p: Project) => {
  Object.assign(cabinetOf(p).joinery, JOINERY_BEFORE_BACK);
  return p;
};
const frameless = plainBack(createBaseCabinetProject('frameless'));
const framed = plainBack(createBaseCabinetProject('faceFrame'));
const derive = (from: Project, change: (c: CabinetDesign) => void = () => {}) => {
  const p = structuredClone(from);
  change(cabinetOf(p));
  return deriveCabinetParts(p, shop);
};
const part = (list: Part[], key: string) => list.find((p) => p.id === `cabinet-1/${key}`)!;
const sizeOf = (p: Part) => `${frac(p.size.width)} x ${frac(p.size.height)}`;
type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
type Dado = Extract<Feature, { kind: 'dado' }>;
/** "B/x0: 2", 8"" for the holes of one row, picked by the start of their id. */
const row = (p: Part, key: string) => {
  const found = p.features.filter((f): f is PocketHole => f.kind === 'pocketHole' && f.id.startsWith(key));
  return found.length ? `${found[0]!.face}/${found[0]!.edge}: ${found.map((f) => frac(f.at)).join(', ')}` : '';
};
const dados = (p: Part) => p.features.filter((f): f is Dado => f.kind === 'dado');
/** "x0..x1 by y0..y1" of a dado's rectangle. */
const span = (f: Dado) => {
  const xs = f.outline.map((p) => p.x);
  const ys = f.outline.map((p) => p.y);
  return `${frac(Math.min(...xs))}..${frac(Math.max(...xs))} by ${frac(Math.min(...ys))}..${frac(Math.max(...ys))}`;
};
const SPANNING = ['bottom', 'stretcher-front', 'stretcher-back'];
const allDado = (c: CabinetDesign) => (c.joinery.case = 'dado');

describe('case joints: pocket screws (the default)', () => {
  const parts = derive(frameless);

  it('starts a cabinet with pocket screws throughout', () => {
    expect(cabinetOf(createBaseCabinetProject()).joinery).toEqual({ case: 'pocketScrews', back: 'rabbet', backStretcherForm: 'nailer' });
    for (const key of ['bottom', 'frontStretcher', 'backStretcher'] as const) expect(caseJointOf(cabinetOf(frameless), key)).toBe('pocketScrews');
  });

  it('changes no size and cuts nothing into the sides', () => {
    expect(sizeOf(part(parts, 'bottom'))).toBe('22-9/16" x 22-9/32"');
    expect(sizeOf(part(parts, 'stretcher-front'))).toBe('22-9/16" x 4"');
    expect(sizeOf(part(parts, 'stretcher-back'))).toBe('22-9/16" x 4"');
    // Nothing but the holes for the hardware (hardwareHoles.test.ts).
    for (const key of ['side-left', 'side-right']) expect(part(parts, key).features.filter((f) => f.kind !== 'hole').map((f) => f.kind)).toEqual(['cutout']);
  });

  it('screws the bottom to the sides from underneath, 2" from each end and no more than 8" apart', () => {
    // Face B of the bottom is its underside; x0 is the end at the left side, x1 at the right.
    expect(row(part(parts, 'bottom'), 'side-pocket-left')).toBe('B/x0: 2", 8-3/32", 14-3/16", 20-9/32"');
    expect(row(part(parts, 'bottom'), 'side-pocket-right')).toBe('B/x1: 2", 8-3/32", 14-3/16", 20-9/32"');
  });

  it('screws each stretcher end from the top with two screws', () => {
    for (const key of ['stretcher-front', 'stretcher-back']) {
      expect(row(part(parts, key), 'side-pocket-left')).toBe('A/x0: 1", 3"');
      expect(row(part(parts, key), 'side-pocket-right')).toBe('A/x1: 1", 3"');
    }
    // A joint too short for the 2" insets takes its screws at the quarter points; under 1", one.
    expect(jointPositions(0, len('4"').mm).map(frac)).toEqual(['1"', '3"']);
    expect(jointPositions(0, len('3/4"').mm).map(frac)).toEqual(['3/8"']);
    expect(jointPositions(0, len('12"').mm).map(frac)).toEqual(['2"', '10"']);
  });

  it('keeps clear of the row that attaches a face frame along the same front edge', () => {
    const behind = derive(framed);
    expect(row(part(behind, 'bottom'), 'frame-pocket')).toBe('B/y0: 2", 8-3/16", 14-3/8", 20-9/16"');
    expect(row(part(behind, 'bottom'), 'side-pocket-left')).toBe('B/x0: 4", 9-7/16", 14-27/32", 20-9/32"');
    expect(row(part(behind, 'stretcher-front'), 'side-pocket-right')).toBe('A/x1: 2-1/2", 3-1/2"');
    // The back stretcher has no frame row.
    expect(row(part(behind, 'stretcher-back'), 'side-pocket-left')).toBe('A/x0: 1", 3"');
  });
});

describe('case joints: dados', () => {
  const parts = derive(frameless, allDado);
  const butt = derive(frameless);

  it('lengthens the bottom and the stretchers by twice the 1/4" depth, with no screws', () => {
    expect(frac(CASE_DADO_DEPTH)).toBe('1/4"');
    expect(sizeOf(part(parts, 'bottom'))).toBe('23-1/16" x 22-9/32"');
    expect(sizeOf(part(parts, 'stretcher-front'))).toBe('23-1/16" x 4"');
    expect(sizeOf(part(parts, 'stretcher-back'))).toBe('23-1/16" x 4"');
    for (const key of SPANNING) {
      expect(part(parts, key).features.some((f) => f.kind === 'pocketHole')).toBe(false);
      // Each end reaches 1/4" into its side.
      const box = partBox(part(parts, key));
      const was = partBox(part(butt, key));
      expect(was.min[0]! - box.min[0]!).toBeCloseTo(CASE_DADO_DEPTH, 6);
      expect(box.max[0]! - was.max[0]!).toBeCloseTo(CASE_DADO_DEPTH, 6);
      expect([box.min[1], box.max[1], box.min[2], box.max[2]]).toEqual([was.min[1], was.max[1], was.min[2], was.max[2]]);
    }
  });

  it('leaves every other part as it was', () => {
    for (const key of ['back', 'toe-kick', 'shelf-1']) expect(part(parts, key)).toEqual(part(butt, key));
    for (const key of ['side-left', 'side-right']) {
      expect(part(parts, key).size).toEqual(part(butt, key).size);
      expect(part(parts, key).placement).toEqual(part(butt, key).placement);
    }
  });

  it('cuts three dados in the inside face of each side, mirrored', () => {
    // Looking at the inside face, the left side's front edge is at x = 0 and the right side's at x = 22-9/32".
    const left = dados(part(parts, 'side-left'));
    expect(left.map((f) => f.id)).toEqual(['dado-bottom', 'dado-stretcher-front', 'dado-stretcher-back']);
    expect(left.every((f) => f.face === 'A' && f.depth === CASE_DADO_DEPTH)).toBe(true);
    expect(left.map(span)).toEqual(['0"..22-9/32" by 4-1/2"..5-7/32"', '0"..4" by 33-25/32"..34-1/2"', '18-9/32"..22-9/32" by 33-25/32"..34-1/2"']);
    expect(dados(part(parts, 'side-right')).map(span)).toEqual(['0"..22-9/32" by 4-1/2"..5-7/32"', '18-9/32"..22-9/32" by 33-25/32"..34-1/2"', '0"..4" by 33-25/32"..34-1/2"']);
  });

  it('puts each dado exactly where the part it houses is', () => {
    const housed: Record<string, string> = { 'dado-bottom': 'bottom', 'dado-stretcher-front': 'stretcher-front', 'dado-stretcher-back': 'stretcher-back' };
    for (const list of [parts, derive(framed, allDado), derive(frameless, (c) => ((c.frameless.edgeBanding = true), allDado(c)))]) {
      for (const key of ['side-left', 'side-right']) {
        const side = part(list, key);
        const { origin, xAxis, yAxis } = side.placement!;
        for (const f of dados(side)) {
          const at = f.outline.map((p) => origin.map((o, i) => o + p.x * xAxis[i]! + p.y * yAxis[i]!));
          const box = partBox(part(list, housed[f.id]!));
          for (const axis of [1, 2]) {
            expect(Math.min(...at.map((p) => p[axis]!)), `${key} ${f.id}`).toBeCloseTo(box.min[axis]!, 6);
            expect(Math.max(...at.map((p) => p[axis]!)), `${key} ${f.id}`).toBeCloseTo(box.max[axis]!, 6);
          }
        }
      }
    }
  });

  it('keeps the face frame pocket holes where they were between the sides', () => {
    const behind = derive(framed, allDado);
    // 1/4" further along the longer part: the same place in the cabinet.
    expect(row(part(behind, 'bottom'), 'frame-pocket')).toBe('B/y0: 2-1/4", 8-7/16", 14-5/8", 20-13/16"');
    expect(row(part(behind, 'stretcher-front'), 'frame-pocket')).toBe('A/y0: 2-1/4", 8-7/16", 14-5/8", 20-13/16"');
    expect(row(part(behind, 'bottom'), 'side-pocket')).toBe('');
    // The sides keep the holes that attach the frame, clear of the dados.
    expect(row(part(behind, 'side-left'), 'frame-pocket')).toBe('A/x0: 8", 15-15/16", 23-27/32", 31-25/32"');
  });

  it('is cut out of the solid of each side', async () => {
    const [left, right, plain] = await buildPartMeshes([part(parts, 'side-left'), part(parts, 'side-right'), part(butt, 'side-left')]);
    const t = part(parts, 'side-left').size.thickness;
    const area = (len('22-9/32"').mm + 2 * len('4"').mm) * t;
    expect((plain!.mesh.volume - left!.mesh.volume) / (area * CASE_DADO_DEPTH)).toBeCloseTo(1, 4);
    expect(right!.mesh.volume).toBeCloseTo(left!.mesh.volume, 3);
  });

  it('refuses a case material too thin to take them', () => {
    const thin = structuredClone(shop);
    thin.materials.find((m) => m.id === 'plywood-3-4')!.measuredThickness = len('3/8"');
    // No doors and no shelves: a side this thin cannot take their holes either (hardwareHoles.test.ts).
    const p = structuredClone(frameless);
    p.designObjects = [];
    cabinetOf(p).adjustableShelves = 0;
    expect(() => deriveCabinetParts(p, thin)).not.toThrow();
    allDado(cabinetOf(p));
    expect(() => deriveCabinetParts(p, thin)).toThrow(/too thin for dados/);
  });
});

describe('a joint per part', () => {
  it('lets one part differ from the case, the same at both of its ends', () => {
    const mixed = derive(frameless, (c) => (c.joinery.overrides = { bottom: 'dado' }));
    expect(sizeOf(part(mixed, 'bottom'))).toBe('23-1/16" x 22-9/32"');
    expect(sizeOf(part(mixed, 'stretcher-front'))).toBe('22-9/16" x 4"');
    expect(dados(part(mixed, 'side-left')).map((f) => f.id)).toEqual(['dado-bottom']);
    expect(dados(part(mixed, 'side-right')).map((f) => f.id)).toEqual(['dado-bottom']);
    expect(row(part(mixed, 'bottom'), 'side-pocket')).toBe('');
    expect(row(part(mixed, 'stretcher-back'), 'side-pocket-left')).toBe('A/x0: 1", 3"');

    const other = derive(frameless, (c) => (c.joinery = { ...c.joinery, case: 'dado', overrides: { frontStretcher: 'pocketScrews' } }));
    expect(dados(part(other, 'side-left')).map((f) => f.id)).toEqual(['dado-bottom', 'dado-stretcher-back']);
    expect(row(part(other, 'stretcher-front'), 'side-pocket-left')).toBe('A/x0: 1", 3"');
  });

  it('follows the case joint when it has no override, and switching back re-enters nothing', () => {
    const p = structuredClone(frameless);
    allDado(cabinetOf(p));
    cabinetOf(p).joinery.case = 'pocketScrews';
    expect(deriveCabinetParts(p, shop)).toEqual(deriveCabinetParts(frameless, shop));
  });
});

describe('saved projects', () => {
  it('keeps the joints through export and import', () => {
    const p = structuredClone(frameless);
    const joinery: CabinetDesign['joinery'] = { case: 'dado', overrides: { backStretcher: 'pocketScrews' }, back: 'groove', backStretcherForm: 'flat' };
    cabinetOf(p).joinery = structuredClone(joinery);
    expect(cabinetOf(parseProjectFile(serializeProjectFile(exportProject(p, shop))).project).joinery).toEqual(joinery);
  });
});
