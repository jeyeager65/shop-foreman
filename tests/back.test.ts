// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BACK_GROOVE_DEPTH, BACK_GROOVE_INSET, BACK_RABBET_DEPTH, cabinetsOf, deriveCabinetParts, partBox } from '@/design';
import { buildPartMeshes } from '@/geometry/solids';
import { createStarterShop } from '@/libraries';
import type { BackJoint, BackStretcherForm, CabinetDesign, Feature, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const frameless = createBaseCabinetProject('frameless');
const cabinetOf = (p: Project): CabinetDesign => cabinetsOf(p)[0]!;
const derive = (change: (c: CabinetDesign) => void = () => {}, from: Project = frameless) => {
  const p = structuredClone(from);
  change(cabinetOf(p));
  return deriveCabinetParts(p, shop);
};
const built = (back: BackJoint, form: BackStretcherForm = 'flat', more: (c: CabinetDesign) => void = () => {}) =>
  derive((c) => {
    c.joinery.back = back;
    c.joinery.backStretcherForm = form;
    more(c);
  });
const part = (list: Part[], key: string) => list.find((p) => p.id === `cabinet-1/${key}`)!;
const sizeOf = (p: Part) => `${frac(p.size.width)} x ${frac(p.size.height)}`;
type Recess = Extract<Feature, { kind: 'dado' }>;
type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
const recesses = (p: Part) => p.features.filter((f): f is Recess => f.kind === 'dado');
const span = (f: Recess) => {
  const xs = f.outline.map((p) => p.x);
  const ys = f.outline.map((p) => p.y);
  return `${frac(Math.min(...xs))}..${frac(Math.max(...xs))} by ${frac(Math.min(...ys))}..${frac(Math.max(...ys))}`;
};
const row = (p: Part, key: string) => {
  const found = p.features.filter((f): f is PocketHole => f.kind === 'pocketHole' && f.id.startsWith(key));
  return found.length ? `${found[0]!.face}/${found[0]!.edge}: ${found.map((f) => frac(f.at)).join(', ')}` : '';
};
/** Where a side's recess is in the cabinet: [min, max] along x (0), y (1) or z (2). */
const placed = (side: Part, f: Recess, axis: number) => {
  const { origin, xAxis, yAxis } = side.placement!;
  const at = f.outline.map((p) => origin[axis]! + p.x * xAxis[axis]! + p.y * yAxis[axis]!);
  return [Math.min(...at), Math.max(...at)];
};
const D = len('22-1/2"').mm;
const allDado = (c: CabinetDesign) => (c.joinery.case = 'dado');

describe('the back: three joints', () => {
  const applied = built('applied');
  const rabbet = built('rabbet');
  const groove = built('groove');

  it('starts a cabinet with the back in a rabbet and a nailer', () => {
    expect(cabinetOf(frameless).joinery.back).toBe('rabbet');
    expect(cabinetOf(frameless).joinery.backStretcherForm).toBe('nailer');
    expect([frac(BACK_RABBET_DEPTH), frac(BACK_GROOVE_DEPTH), frac(BACK_GROOVE_INSET)]).toEqual(['3/8"', '1/4"', '1/2"']);
  });

  it('applied: the back covers the rear of the case and the sides are shallower by it', () => {
    expect(sizeOf(part(applied, 'side-left'))).toBe('22-9/32" x 34-1/2"');
    expect(sizeOf(part(applied, 'back'))).toBe('24" x 30"');
    expect(sizeOf(part(applied, 'bottom'))).toBe('22-9/16" x 22-9/32"');
    for (const key of ['side-left', 'side-right']) expect(recesses(part(applied, key))).toEqual([]);
  });

  it('rabbet: full-depth sides, a back narrower than the case, the other parts as deep as with an applied back', () => {
    expect(sizeOf(part(rabbet, 'side-left'))).toBe('22-1/2" x 34-1/2"');
    expect(sizeOf(part(rabbet, 'side-right'))).toBe('22-1/2" x 34-1/2"');
    // 24" less twice what is left of a 23/32" side behind a 3/8" rabbet.
    expect(sizeOf(part(rabbet, 'back'))).toBe('23-5/16" x 30"');
    for (const key of ['bottom', 'stretcher-front', 'stretcher-back', 'toe-kick', 'shelf-1']) {
      expect(part(rabbet, key), key).toEqual(part(applied, key));
    }
  });

  it('rabbet: cut down the rear inside edge of each side, the full height, mirrored', () => {
    // Looking at the inside face, the left side's rear edge is at x = 22-1/2" and the right side's at x = 0.
    const left = recesses(part(rabbet, 'side-left'));
    const right = recesses(part(rabbet, 'side-right'));
    expect(left.map((f) => f.id)).toEqual(['rabbet-back']);
    expect(left.map(span)).toEqual(['22-9/32"..22-1/2" by 0"..34-1/2"']);
    expect(right.map(span)).toEqual(['0"..7/32" by 0"..34-1/2"']);
    expect([...left, ...right].every((f) => f.face === 'A' && f.depth === BACK_RABBET_DEPTH)).toBe(true);
  });

  it('groove: full-depth sides, the back 1/2" in from the rear, the parts in front of it 1/2" shallower', () => {
    expect(sizeOf(part(groove, 'side-left'))).toBe('22-1/2" x 34-1/2"');
    // 24" less twice what is left of a 23/32" side behind a 1/4" groove.
    expect(sizeOf(part(groove, 'back'))).toBe('23-1/16" x 30"');
    expect(sizeOf(part(groove, 'bottom'))).toBe('22-9/16" x 21-25/32"');
    expect(sizeOf(part(groove, 'shelf-1'))).toBe('22-7/16" x 21-17/32"');
    expect(sizeOf(part(groove, 'stretcher-back'))).toBe('22-9/16" x 4"');
    expect(partBox(part(groove, 'back')).min[2]).toBeCloseTo(-(D - BACK_GROOVE_INSET), 6);
    expect(partBox(part(groove, 'stretcher-back')).min[2]).toBeCloseTo(partBox(part(groove, 'back')).max[2], 6);
    // The front stretcher and the toe kick board do not move.
    for (const key of ['stretcher-front', 'toe-kick']) expect(part(groove, key), key).toEqual(part(rabbet, key));

    const left = recesses(part(groove, 'side-left'));
    expect(left.map((f) => f.id)).toEqual(['groove-back']);
    expect(left.map(span)).toEqual(['21-25/32"..22" by 0"..34-1/2"']);
    expect(recesses(part(groove, 'side-right')).map(span)).toEqual(['1/2"..23/32" by 0"..34-1/2"']);
    expect(left[0]!.depth).toBe(BACK_GROOVE_DEPTH);
  });

  it('puts the back exactly in its rabbet or groove, in every style', () => {
    const framed = createBaseCabinetProject('faceFrame');
    for (const joint of ['rabbet', 'groove'] as const) {
      const lists = [
        built(joint),
        built(joint, 'nailer', allDado),
        built(joint, 'flat', (c) => (c.frameless.edgeBanding = true)),
        derive((c) => (c.joinery.back = joint), framed),
      ];
      for (const list of lists) {
        const back = partBox(part(list, 'back'));
        for (const key of ['side-left', 'side-right']) {
          const side = part(list, key);
          const f = recesses(side).find((r) => r.id === `${joint}-back`)!;
          // Front to back the recess is as wide as the back is thick, where the back is.
          const [z0, z1] = placed(side, f, 2);
          expect(z0, `${joint} ${key}`).toBeCloseTo(back.min[2], 6);
          expect(z1, `${joint} ${key}`).toBeCloseTo(back.max[2], 6);
          // The back's edge reaches the recess's floor.
          const box = partBox(side);
          const into = key === 'side-left' ? box.max[0] - back.min[0] : back.max[0] - box.min[0];
          expect(into, `${joint} ${key}`).toBeCloseTo(f.depth, 6);
        }
        // From the underside of the bottom to the top of the case.
        expect(back.min[1]).toBeCloseTo(partBox(part(list, 'bottom')).min[1], 6);
        expect(back.max[1]).toBeCloseTo(len('34-1/2"').mm, 6);
      }
    }
  });

  it('stops a dado at the front of the back, clear of the rabbet or groove', () => {
    for (const joint of ['rabbet', 'groove'] as const) {
      for (const form of ['flat', 'nailer'] as const) {
        const list = built(joint, form, allDado);
        const backFront = partBox(part(list, 'back')).max[2];
        for (const key of ['side-left', 'side-right']) {
          const side = part(list, key);
          const cuts = recesses(side);
          expect(cuts.map((f) => f.id)).toEqual(['dado-bottom', 'dado-stretcher-front', 'dado-stretcher-back', `${joint}-back`]);
          for (const f of cuts.slice(0, 3)) expect(placed(side, f, 2)[0], `${joint} ${form} ${key} ${f.id}`).toBeGreaterThanOrEqual(backFront - 1e-6);
          // The bottom's dado and the back stretcher's housing end exactly there.
          expect(placed(side, cuts[0]!, 2)[0]).toBeCloseTo(backFront, 6);
          expect(placed(side, cuts[2]!, 2)[0]).toBeCloseTo(backFront, 6);
        }
      }
    }
  });

  it('is cut out of the solid of each side', async () => {
    const sides = [part(applied, 'side-left'), part(rabbet, 'side-left'), part(rabbet, 'side-right'), part(groove, 'side-left')];
    const [a, r, rr, g] = (await buildPartMeshes(sides)).map((m) => m.mesh.volume);
    const tBack = part(rabbet, 'back').size.thickness;
    const H = len('34-1/2"').mm;
    const t = part(rabbet, 'side-left').size.thickness;
    // A rabbeted side is the applied one plus the strip behind it, less the rabbet.
    expect((r! - a!) / (tBack * H * (t - BACK_RABBET_DEPTH))).toBeCloseTo(1, 4);
    expect(rr!).toBeCloseTo(r!, 3);
    expect((g! - a!) / (tBack * H * t - tBack * H * BACK_GROOVE_DEPTH)).toBeCloseTo(1, 4);
  });

  it('refuses a case material too thin for the rabbet or the groove', () => {
    const thin = structuredClone(shop);
    thin.materials.find((m) => m.id === 'plywood-3-4')!.measuredThickness = len('3/8"');
    const withBack = (back: BackJoint) => {
      // No doors and no shelves: a side this thin cannot take their holes either (hardwareHoles.test.ts).
      const p = structuredClone(frameless);
      p.designObjects = [];
      cabinetOf(p).adjustableShelves = 0;
      cabinetOf(p).joinery.back = back;
      return () => deriveCabinetParts(p, thin);
    };
    expect(withBack('applied')).not.toThrow();
    expect(withBack('rabbet')).toThrow(/too thin for the rabbet/);
    expect(withBack('groove')).toThrow(/too thin for the groove/);
  });
});

describe('the back stretcher: flat or a nailer', () => {
  const flat = built('rabbet', 'flat');
  const nailer = built('rabbet', 'nailer');

  it('flat: lies at the top like the front one, screwed from on top', () => {
    const box = partBox(part(flat, 'stretcher-back'));
    expect(frac(box.max[1] - box.min[1])).toBe('23/32"');
    expect(frac(box.max[2] - box.min[2])).toBe('4"');
    expect(row(part(flat, 'stretcher-back'), 'side-pocket-left')).toBe('A/x0: 1", 3"');
  });

  it('nailer: stands on edge at the top, its rear face against the back', () => {
    const p = part(nailer, 'stretcher-back');
    expect(sizeOf(p)).toBe('22-9/16" x 4"');
    const box = partBox(p);
    expect(frac(box.max[1] - box.min[1])).toBe('4"');
    expect(frac(box.max[2] - box.min[2])).toBe('23/32"');
    expect(box.max[1]).toBeCloseTo(len('34-1/2"').mm, 6);
    expect(box.min[2]).toBeCloseTo(partBox(part(nailer, 'back')).max[2], 6);
    // Face A is its front; the screws go in from the rear face, which the back covers.
    expect(p.placement!.xAxis).toEqual([1, 0, 0]);
    expect(p.placement!.yAxis).toEqual([0, 1, 0]);
    expect(row(p, 'side-pocket-left')).toBe('B/x0: 1", 3"');
    expect(row(p, 'side-pocket-right')).toBe('B/x1: 1", 3"');
    expect(p.grain).toBe('width');
    // Nothing else changes.
    for (const key of ['side-left', 'side-right', 'bottom', 'stretcher-front', 'back', 'toe-kick', 'shelf-1']) {
      expect(part(nailer, key), key).toEqual(part(flat, key));
    }
  });

  it('nailer in dados: 1/4" longer at each end, in an upright housing open at the top of each side', () => {
    const list = built('rabbet', 'nailer', allDado);
    const p = part(list, 'stretcher-back');
    expect(sizeOf(p)).toBe('23-1/16" x 4"');
    expect(p.features.some((f) => f.kind === 'pocketHole')).toBe(false);
    const box = partBox(p);
    for (const key of ['side-left', 'side-right']) {
      const side = part(list, key);
      const f = recesses(side).find((r) => r.id === 'dado-stretcher-back')!;
      for (const axis of [1, 2]) {
        expect(placed(side, f, axis)[0], `${key} ${axis}`).toBeCloseTo(box.min[axis]!, 6);
        expect(placed(side, f, axis)[1], `${key} ${axis}`).toBeCloseTo(box.max[axis]!, 6);
      }
    }
    expect(span(recesses(part(list, 'side-left'))[2]!)).toBe('21-9/16"..22-9/32" by 30-1/2"..34-1/2"');
  });

  it('follows the back into a groove and behind an applied back', () => {
    for (const joint of ['groove', 'applied'] as const) {
      for (const form of ['flat', 'nailer'] as const) {
        const list = built(joint, form);
        expect(partBox(part(list, 'stretcher-back')).min[2], `${joint} ${form}`).toBeCloseTo(partBox(part(list, 'back')).max[2], 6);
      }
    }
  });
});
