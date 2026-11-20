import { describe, expect, it } from 'vitest';
import { bevelWidth, currentOverlay, deriveParts, hingeHeights, isHinge, openingsOf, overlayReport, doorSetOf } from '@/design';
import { createStarterShop } from '@/libraries';
import type { Feature } from '@/model';
import { createVanityProject } from '@/samples/vanity';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const project = createVanityProject();
const design = doorSetOf(project);
const opening = openingsOf(project, shop.materials)[0]!;
const of = <K extends Feature['kind']>(features: Feature[], kind: K) =>
  features.filter((f): f is Extract<Feature, { kind: K }> => f.kind === kind);

describe('vanity overlay and door size', () => {
  it('reports the current overlay from the existing doors', () => {
    const o = currentOverlay(opening)!;
    expect(frac(o.side)).toBe('7/16"');
    expect(frac(o.top)).toBe('11/16"');
    expect(frac(o.bottom)).toBe('11/16"');
  });

  it('suggests the 1/2" overlay hinges, generic included', () => {
    const report = overlayReport(design, opening, shop.hardware);
    expect(report.suggestedHingeIds).toContain('generic-face-frame-compact-1-2');
    expect(report.suggestedHingeIds).toContain('blum-compact-38n-1-2-soft-screw');
    for (const id of report.suggestedHingeIds) {
      expect(frac(shop.hardware.filter(isHinge).find((h) => h.id === id)!.overlay.mm)).toBe('1/2"');
    }
  });

  it('sizes each door 10-29/32" x 24-7/8"', () => {
    const { doorSize } = overlayReport(design, opening, shop.hardware);
    expect(frac(doorSize.width)).toBe('10-29/32"');
    expect(frac(doorSize.height)).toBe('24-7/8"');
    expect(doorSize.width).toBeCloseTo(10.90625 * 25.4, 9);
  });

  it('follows a different gap', () => {
    // A plain copy: the design is a view of the stored project, which structuredClone refuses.
    const wider = JSON.parse(JSON.stringify(design)) as typeof design;
    wider.mounting.gap = len('1/4"');
    expect(frac(overlayReport(wider, opening, shop.hardware).doorSize.width)).toBe('10-27/32"');
  });
});

describe('vanity parts and features', () => {
  const parts = deriveParts(project, shop);
  const left = parts[0]!;
  const right = parts[1]!;

  it('makes a left and a right door from the measured thickness', () => {
    expect(parts.map((p) => p.id)).toEqual(['doors-1/door-left', 'doors-1/door-right']);
    expect(left.size.thickness).toBe(19);
  });

  it('places 2 cups per door on the back from the hinge spec', () => {
    for (const part of parts) {
      const cups = of(part.features, 'cup');
      expect(cups).toHaveLength(2);
      for (const cup of cups) {
        expect(cup.face).toBe('B');
        expect(cup.diameter).toBe(35);
        expect(cup.depth).toBe(13);
      }
    }
    // 3 mm bore distance: the cup edge is 3 mm from the hinge edge of the door
    expect(of(left.features, 'cup')[0]!.center.x).toBeCloseTo(3 + 17.5, 9);
    expect(of(right.features, 'cup')[0]!.center.x).toBeCloseTo(right.size.width - 20.5, 9);
    const ys = of(left.features, 'cup').map((c) => c.center.y);
    expect(ys[0]).toBeCloseTo(88.9, 9);
    expect(ys[1]).toBeCloseTo(left.size.height - 88.9, 9);
  });

  it('adds hinges for taller doors', () => {
    const hinge = shop.hardware.filter(isHinge)[0]!;
    expect(hingeHeights(hinge, 1200)).toHaveLength(3);
    expect(hingeHeights(hinge, 1200)[1]).toBeCloseTo(600, 9);
  });

  it('builds the shaker panel: bevel on the frame edge, floor inset by the bevel width', () => {
    const pocket = of(left.features, 'pocket')[0]!;
    const bevel = of(left.features, 'bevel')[0]!;
    const w = bevelWidth(60, 6.35);
    expect(w).toBeCloseTo(3.6662, 4);
    expect(bevel.path[0]!.x).toBeCloseTo(57.15, 9);
    expect(pocket.outline[0]!.x).toBeCloseTo(57.15 + w, 9);
    expect(pocket.depth).toBeCloseTo(6.35, 9);
    expect(pocket.face).toBe('A');
  });

  it('adds dowel holes for a press-in hinge', () => {
    const p = createVanityProject();
    doorSetOf(p).mounting.hingeId = 'blum-compact-38n-1-2-soft-press';
    const holes = of(deriveParts(p, shop)[0]!.features, 'hole');
    expect(holes).toHaveLength(4);
    expect(holes[0]!.center.x).toBeCloseTo(20.5 + 9.5, 9);
  });

  it('a slab door has only cups, edge and cutout', () => {
    const p = createVanityProject();
    doorSetOf(p).style = { kind: 'slab' };
    const kinds = deriveParts(p, shop)[0]!.features.map((f) => f.kind);
    expect(kinds).toEqual(['cup', 'cup', 'edgeProfile', 'cutout']);
  });
});
