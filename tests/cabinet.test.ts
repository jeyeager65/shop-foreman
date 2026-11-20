import { describe, expect, it } from 'vitest';
import { BACK_RABBET_DEPTH, deriveCabinetParts, deriveCaseParts, deriveParts, cabinetsOf } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, Part } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject } from '@/storage/projectFile';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const project = createBaseCabinetProject();
const cabinet = cabinetsOf(project)[0]!;
const parts = deriveCabinetParts(project, shop);
const part = (key: string) => parts.find((p) => p.id === `cabinet-1/${key}`)!;
const sizeOf = (p: Part) => `${frac(p.size.width)} x ${frac(p.size.height)} x ${frac(p.size.thickness)}`;

/** The part's box in the cabinet frame, from its placement. */
function box(p: Part): { min: number[]; max: number[] } {
  const { origin, xAxis: x, yAxis: y } = p.placement!;
  const n = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const far = origin.map((o, i) => o + p.size.width * x[i]! + p.size.height * y[i]! - p.size.thickness * n[i]!);
  return { min: origin.map((o, i) => Math.min(o, far[i]!)), max: origin.map((o, i) => Math.max(o, far[i]!)) };
}

describe('reference cabinet case parts (pocket screws, the back in a rabbet, a nailer)', () => {
  it('lists the parts of the case', () => {
    expect(parts.map((p) => p.id.replace('cabinet-1/', ''))).toEqual([
      'side-left',
      'side-right',
      'bottom',
      'stretcher-front',
      'stretcher-back',
      'back',
      'toe-kick',
      'shelf-1',
    ]);
    expect(parts.every((p) => p.designObjectId === 'cabinet-1' && p.role && p.placement)).toBe(true);
  });

  it('sizes them from the outside size and the measured thicknesses', () => {
    expect(sizeOf(part('side-left'))).toBe('22-1/2" x 34-1/2" x 23/32"');
    expect(sizeOf(part('side-right'))).toBe('22-1/2" x 34-1/2" x 23/32"');
    expect(sizeOf(part('bottom'))).toBe('22-9/16" x 22-9/32" x 23/32"');
    expect(sizeOf(part('stretcher-front'))).toBe('22-9/16" x 4" x 23/32"');
    expect(sizeOf(part('stretcher-back'))).toBe('22-9/16" x 4" x 23/32"');
    expect(sizeOf(part('back'))).toBe('23-5/16" x 30" x 7/32"');
    expect(sizeOf(part('toe-kick'))).toBe('22-9/16" x 4-1/2" x 23/32"');
    expect(sizeOf(part('shelf-1'))).toBe('22-7/16" x 22-1/32" x 23/32"');
  });

  it('notches the sides for the toe kick, mirrored', () => {
    const outline = (key: string) => {
      const f = part(key).features[0]!;
      return f.kind === 'cutout' ? f.outline.map((p) => `${frac(p.x)},${frac(p.y)}`) : [];
    };
    // Looking at the inside face: the left side's front edge is at x = 0, the right side's at x = depth.
    expect(outline('side-left')).toEqual(['3",0"', '22-1/2",0"', '22-1/2",34-1/2"', '0",34-1/2"', '0",4-1/2"', '3",4-1/2"']);
    expect(outline('side-right')).toEqual(['0",0"', '19-1/2",0"', '19-1/2",4-1/2"', '22-1/2",4-1/2"', '22-1/2",34-1/2"', '0",34-1/2"']);
  });

  it('places every part inside the case, none through another', () => {
    const W = cabinet.size.width.mm;
    const H = cabinet.size.height.mm;
    const D = cabinet.size.depth.mm;
    const boxes = parts.map((p) => ({ id: p.id, ...box(p) }));
    for (const b of boxes) {
      [0, 0, -D].forEach((lo, i) => expect(b.min[i]!, b.id).toBeGreaterThanOrEqual(lo - 1e-6));
      [W, H, 0].forEach((hi, i) => expect(b.max[i]!, b.id).toBeLessThanOrEqual(hi + 1e-6));
    }
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.id >= b.id) continue;
        // The back sits in the rabbets of the sides: checked below.
        if (a.id.endsWith('/back') && b.id.includes('/side-')) continue;
        const overlaps = [0, 1, 2].every((i) => a.min[i]! < b.max[i]! - 1e-6 && b.min[i]! < a.max[i]! - 1e-6);
        expect(overlaps, `${a.id} and ${b.id}`).toBe(false);
      }
    }
    // The back reaches 3/8" into each side, at the very rear of it.
    const back = box(part('back'));
    expect(box(part('side-left')).max[0]! - back.min[0]!).toBeCloseTo(BACK_RABBET_DEPTH, 6);
    expect(back.max[0]! - box(part('side-right')).min[0]!).toBeCloseTo(BACK_RABBET_DEPTH, 6);
    expect(back.min[2]!).toBeCloseTo(-D, 6);
    expect(box(part('side-left')).min[2]!).toBeCloseTo(-D, 6);
    // The case fills its outside size.
    expect(Math.min(...boxes.map((b) => b.min[2]!))).toBeCloseTo(-D, 6);
    expect(Math.max(...boxes.map((b) => b.max[0]!))).toBeCloseTo(W, 6);
    expect(Math.max(...boxes.map((b) => b.max[1]!))).toBeCloseTo(H, 6);
  });

  it('puts the shelf halfway up the space below the drawer', () => {
    // Inside runs 5-7/32" to 33-25/32"; the drawer row takes the top 6".
    expect(frac(part('shelf-1').placement!.origin[1])).toBe('16-7/8"');
    const b = box(part('shelf-1'));
    const below = b.min[1]! - box(part('bottom')).max[1]!;
    const above = cabinet.size.height.mm - part('side-left').size.thickness - len('6"').mm - b.max[1]!;
    expect(below).toBeCloseTo(above, 6);
  });
});

describe('case parts follow the design', () => {
  const derive = (change: (c: CabinetDesign) => void) => {
    const c = structuredClone(cabinet);
    change(c);
    return deriveCaseParts(c, shop.materials);
  };
  const find = (list: Part[], key: string) => list.find((p) => p.id.endsWith(`/${key}`));

  it('raises the bottom behind a face frame, level with the top of the bottom rail', () => {
    const framed = derive((c) => (c.construction = 'faceFrame'));
    // Same size and place; behind a frame they gain the pocket holes that attach it (faceFrame.test.ts).
    const same = (list: Part[]) => list.filter((p) => p.role === 'side' || p.role === 'stretcher').map((p) => ({ id: p.id, size: p.size, placement: p.placement }));
    expect(same(framed)).toEqual(same(parts));

    // Rail top at 4-1/2" + 1-1/2": no lip. Frameless, the bottom's top is at 5-7/32".
    const bottom = find(framed, 'bottom')!;
    expect(frac(bottom.placement!.origin[1])).toBe('6"');
    expect(frac(part('bottom').placement!.origin[1])).toBe('5-7/32"');
    expect(bottom.size).toEqual(part('bottom').size);
    // The back starts at the underside of the bottom and the toe kick board reaches it.
    expect(sizeOf(find(framed, 'back')!)).toBe('23-5/16" x 29-7/32" x 7/32"');
    expect(frac(find(framed, 'back')!.placement!.origin[1])).toBe('5-9/32"');
    expect(sizeOf(find(framed, 'toe-kick')!)).toBe('22-9/16" x 5-9/32" x 23/32"');
    // The shelf is halfway up the door opening, 6" to 25-1/2".
    const shelf = find(framed, 'shelf-1')!;
    expect(frac(shelf.placement!.origin[1] - shelf.size.thickness / 2)).toBe('15-3/4"');

    // A rail narrower than the bottom is thick lifts nothing.
    const thin = derive((c) => {
      c.construction = 'faceFrame';
      c.faceFrame.railWidth = len('1/2"');
    });
    expect(frac(find(thin, 'bottom')!.placement!.origin[1])).toBe('5-7/32"');
  });

  it('follows the width, the shelf count and the measured thickness', () => {
    const wide = derive((c) => (c.size.width = len('30"')));
    expect(frac(find(wide, 'bottom')!.size.width)).toBe('28-9/16"');
    expect(frac(find(wide, 'back')!.size.width)).toBe('29-5/16"');

    const shelves = derive((c) => (c.adjustableShelves = 2));
    expect(shelves.filter((p) => p.role === 'shelf').map((p) => p.name)).toEqual(['Shelf 1', 'Shelf 2']);
    expect(derive((c) => (c.adjustableShelves = 0)).some((p) => p.role === 'shelf')).toBe(false);

    const measured = structuredClone(shop.materials);
    measured.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness = len('18mm');
    expect(find(deriveCaseParts(cabinet, measured), 'bottom')!.size.width).toBeCloseTo(609.6 - 36, 6);
  });

  it('has no shelves without a doors row, and no kick board without a toe kick', () => {
    const drawers = derive((c) => (c.layout.rows = [{ id: 'a', use: 'drawer' }, { id: 'b', use: 'drawer' }]));
    expect(drawers.some((p) => p.role === 'shelf')).toBe(false);
    const flat = derive((c) => (c.toeKick = { height: len('0"'), depth: len('0"') }));
    expect(flat.some((p) => p.role === 'toeKick')).toBe(false);
    expect(frac(find(flat, 'back')!.size.height)).toBe('34-1/2"');
  });

  it('refuses sizes that cannot be built', () => {
    expect(() => derive((c) => (c.size.width = len('1"')))).toThrow(/too narrow/);
    expect(() => derive((c) => (c.layout.rows[0]!.height = len('40"')))).toThrow(/opening heights/);
    expect(() => derive((c) => (c.adjustableShelves = 40))).toThrow(/shelves/);
  });

  it('keeps the fronts out of the case parts', () => {
    expect(deriveParts(project, shop).every((p) => p.role === undefined)).toBe(true);
    expect(parts.every((p) => p.role !== undefined)).toBe(true);
  });
});

describe('saved shop profiles and cabinet materials', () => {
  it('exports a cabinet project with its case, back and frame materials', () => {
    const ids = exportProject(project, shop).project.materials.map((m) => m.id);
    expect(ids).toEqual(['mdf-3-4', 'plywood-3-4', 'plywood-1-4', 'solid-wood-3-4', 'plywood-1-2']);
  });
});
