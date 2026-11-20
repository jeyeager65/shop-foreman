// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCabinetAssembly, cabinetOpeningsOf, deriveCabinetOpenings, deriveCabinetParts, deriveParts, hungDesigns, openingsOf, partBox, cabinetsOf, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import type { CabinetOpening } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { formatLength, len } from '@/units';
import { lowRiderJobShop } from './lowRider';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = lowRiderJobShop();
const frameless = createBaseCabinetProject('frameless');
const framed = createBaseCabinetProject('faceFrame');
const cabinetOf = (project: typeof framed) => cabinetsOf(project)[0]!;
const show = (o: CabinetOpening) => `${o.name}: ${frac(o.width)} x ${frac(o.height)} at ${frac(o.origin.x)}, ${frac(o.origin.y)}`;

describe('openings from the cabinet layout', () => {
  it('frameless: the inside of the case, the drawer row over the doors with nothing between', () => {
    const openings = cabinetOpeningsOf(frameless, shop.materials);
    expect(openings.map((o) => o.id)).toEqual(['cabinet-1/drawer', 'cabinet-1/doors']);
    // Inside runs 5-7/32" to 33-25/32" between 23/32" sides.
    expect(openings.map(show)).toEqual([
      'Drawer opening: 22-9/16" x 6" at 23/32", 27-25/32"',
      'Door opening: 22-9/16" x 22-9/16" at 23/32", 5-7/32"',
    ]);
    expect(openings.every((o) => o.construction === 'frameless' && frac(o.frameThickness) === '23/32"')).toBe(true);
  });

  it('face frame: between 1-1/2" stiles, with a rail above, below and between the rows', () => {
    const openings = cabinetOpeningsOf(framed, shop.materials);
    expect(openings.map(show)).toEqual(['Drawer opening: 21" x 6" at 1-1/2", 27"', 'Door opening: 21" x 19-1/2" at 1-1/2", 6"']);
    expect(openings.every((o) => o.construction === 'faceFrame' && frac(o.frameThickness) === '3/4"')).toBe(true);
  });

  it('follows the layout: rows without a height share what is left, and are numbered when alike', () => {
    const c = structuredClone(cabinetOf(framed));
    c.layout.rows = [
      { id: 'a', use: 'drawer', height: len('5"') },
      { id: 'b', use: 'drawer' },
      { id: 'c', use: 'drawer' },
    ];
    const openings = deriveCabinetOpenings(c, shop.materials);
    // 27" between the top and bottom rails, less two rails and the 5" row, halved.
    expect(openings.map((o) => `${o.name} ${frac(o.height)}`)).toEqual(['Drawer opening 1 5"', 'Drawer opening 2 9-1/2"', 'Drawer opening 3 9-1/2"']);
    expect(frac(openings[2]!.origin.y)).toBe('6"');

    c.layout.rows[0]!.height = len('30"');
    expect(() => deriveCabinetOpenings(c, shop.materials)).toThrow(/opening heights/);
    c.faceFrame.stileWidth = len('13"');
    expect(() => deriveCabinetOpenings(c, shop.materials)).toThrow(/too narrow/);
  });

  it('stand in for measured openings', () => {
    const [, doors] = openingsOf(framed, shop.materials);
    expect(doors).toMatchObject({ id: 'cabinet-1/doors', name: 'Door opening', cabinetType: 'faceFrame' });
    expect([doors!.width.mm, doors!.height.mm, doors!.frameThickness.mm].map(frac)).toEqual(['21"', '19-1/2"', '3/4"']);
  });
});

describe('doors on the face frame cabinet', () => {
  const doors = deriveParts(framed, shop).filter((p) => p.designObjectId === 'doors-1');

  it('sizes the pair from the door opening with the 1/2" overlay hinge, as in milestone 1', () => {
    expect(doors.map((p) => p.id)).toEqual(['doors-1/door-left', 'doors-1/door-right']);
    // 21" + 2 x 1/2" less the 1/8" gap, halved; 19-1/2" + 1/2" top and bottom.
    for (const door of doors) expect(`${frac(door.size.width)} x ${frac(door.size.height)}`).toBe('10-15/16" x 20-1/2"');
    expect(doors[0]!.features.filter((f) => f.kind === 'cup')).toHaveLength(2);
    expect(doors.every((p) => p.role === undefined)).toBe(true);
  });

  it('places them over the opening, closed against the front of the frame', () => {
    const [left, right] = doors.map(partBox);
    // 1/2" past the opening at each side and below it.
    expect([left!.min[0], left!.min[1]].map(frac)).toEqual(['1"', '5-1/2"']);
    expect(frac(right!.max[0])).toBe('23"');
    expect(frac(right!.min[0] - left!.max[0])).toBe('1/8"');
    // Frame 19.05, a 2 mm standoff, then the 19 mm door.
    expect(left!.min[2]).toBeCloseTo(21.05, 6);
    expect(left!.max[2]).toBeCloseTo(40.05, 6);
  });

  it('stands clear of the case, assembled and exploded', () => {
    const parts = [...deriveCabinetParts(framed, shop), ...doors];
    const assembly = buildCabinetAssembly(parts);
    for (const amount of [0, 1]) {
      const boxes = parts.map((p) => {
        const box = partBox(p);
        const shift = assembly.parts.find((a) => a.partId === p.id)!.explode.map((d) => d * assembly.explodeDistance * amount);
        return { id: p.id, min: box.min.map((v, i) => v + shift[i]!), max: box.max.map((v, i) => v + shift[i]!) };
      });
      for (const door of boxes.filter((b) => b.id.startsWith('doors-1/'))) {
        for (const other of boxes) {
          if (other.id === door.id) continue;
          const overlaps = [0, 1, 2].every((i) => door.min[i]! < other.max[i]! - 1e-6 && other.min[i]! < door.max[i]! - 1e-6);
          expect(overlaps, `${door.id} and ${other.id} at ${amount}`).toBe(false);
        }
      }
    }
    expect(assembly.parts.find((p) => p.partId === 'doors-1/door-left')!.explode).toEqual([0, 0, 1.6]);
  });

  it('plans and posts the doors like any door set', () => {
    const job = buildJob(framed, shop);
    expect(job.parts.map((p) => p.id)).toEqual(['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']);
    // The fronts are the first of the job's blanks; the sides and the box walls follow.
    expect(job.plan.blanks[0]!.partIds).toEqual(['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']);
    expect(job.files.map((f) => f.name)).toEqual([
      'base-cabinet-blank-1-setup-1-back.gcode',
      'base-cabinet-blank-1-setup-2-front.gcode',
      'base-cabinet-blank-2.gcode',
      'base-cabinet-blank-3.gcode',
      'base-cabinet-blank-4.gcode',
    ]);
    expect(job.plan.installKit.map((j) => j.template)).toEqual(['supportBlock', 'gapShim']);
  });
});

describe('fronts on the frameless cabinet', () => {
  // Their sizes and overlays are in style.test.ts.
  it('hang like the face frame ones: the same designs, made into parts', () => {
    expect(designsOf(frameless).map((d) => d.template)).toEqual(['doorSet', 'drawer']);
    expect(hungDesigns(frameless, shop).map((d) => d.id)).toEqual(['doors-1', 'drawer-1']);
    expect(deriveParts(frameless, shop).map((p) => p.id)).toEqual(['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']);
  });
});
