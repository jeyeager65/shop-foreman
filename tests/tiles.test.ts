import { describe, expect, it } from 'vitest';
import { frontFaceTile, patternFeatures, BOTTOM_KINDS, PATTERN_LOOKS, backJointTile, bottomTile, cabinetsOf, caseJointTile, constructionTile, doorStyleTile, handleTile, insideEdgeTile, isHandle, outsideEdgeTile, lookOf, patternLines, patternTile, starterPattern, tilePattern, withLook } from '@/design';
import { createStarterShopProfile } from '@/libraries';
import type { FrontPattern } from '@/model';
import { createKitchenProject, setupExample } from '@/samples/cabinet';
import { len } from '@/units';

/** Setup's picture tiles: a pattern's looks, and the drawings on the tiles. */
describe('pattern looks', () => {
  it('makes a pattern of every look, and reads the look back from it', () => {
    for (const { value } of PATTERN_LOOKS) {
      const pattern = withLook(undefined, value);
      expect(lookOf(pattern)).toBe(value);
      if (value === 'none') expect(pattern).toBeUndefined();
    }
  });

  it('keeps the sizes of a pattern of the same kind', () => {
    const planks: FrontPattern = { ...starterPattern('grooves'), spacing: len('1-1/2"'), depth: len('3/32"') } as FrontPattern;
    const chevrons = withLook(planks, 'grooves-chevron');
    expect(chevrons).toMatchObject({ kind: 'grooves', layout: 'chevron', spacing: len('1-1/2"'), depth: len('3/32"') });
    // Another kind starts again.
    expect(withLook(planks, 'dimples')).toEqual(starterPattern('dimples'));
    expect(withLook(starterPattern('dimples'), 'dimples')).toEqual(starterPattern('dimples'));
  });

  it('reeds overlap, flutes stand apart, wavy flutes are upright', () => {
    const flutes = withLook(undefined, 'flutes', 6.35)!;
    const reeds = withLook(flutes, 'reeds')!;
    if (flutes.kind !== 'flutes' || reeds.kind !== 'flutes') throw new Error('not flutes');
    expect(reeds.reeded).toBe(true);
    expect(reeds.spacing.mm).toBeLessThan(reeds.width.mm);
    const back = withLook(reeds, 'flutes')!;
    expect(back).toEqual(flutes);
    const level = { ...flutes, direction: 'horizontal' as const };
    expect(withLook(level, 'wavyFlutes')).toMatchObject({ direction: 'vertical', wavy: true });
    // Level flutes with the wavy switch left on are plain flutes: only upright ones wave.
    expect(lookOf({ ...level, wavy: true })).toBe('flutes');
  });
});

describe('tile drawings', () => {
  it('draws every look with the lines that are cut', () => {
    const drawn = new Set<string>();
    for (const { value } of PATTERN_LOOKS) {
      const tile = patternTile(value);
      const pattern = tilePattern(value);
      if (!pattern) {
        expect(tile.shapes).toHaveLength(1);
        continue;
      }
      // The face, and a shape for each of the pattern's lines.
      const whole = pattern.kind === 'grooves' || pattern.kind === 'frame';
      const margin = whole && pattern.kind !== 'frame' ? len('2-1/4"').mm : 0;
      const lines = patternLines(pattern, { x0: margin, y0: margin, x1: tile.w - margin, y1: tile.h - margin });
      expect(lines.length, value).toBeGreaterThan(0);
      expect(tile.shapes, value).toHaveLength(lines.length + 1);
      for (const s of tile.shapes) expect(s.d, value).not.toMatch(/NaN|undefined/);
      drawn.add(JSON.stringify(tile.shapes));
    }
    // No two looks draw the same.
    expect(drawn.size).toBe(PATTERN_LOOKS.length - 1);
  });

  it('draws each construction, door style and bottom differently', () => {
    const all = [
      ...(['faceFrame', 'frameless', 'shop'] as const).map(constructionTile),
      ...(['shaker', 'slab'] as const).map(doorStyleTile),
      ...BOTTOM_KINDS.map((k) => bottomTile(k.value)),
      ...(['pocketScrews', 'dado', 'throughScrews', 'tabs'] as const).map((j) => caseJointTile(j)),
      caseJointTile('tabs', true),
      ...(['rabbet', 'groove', 'applied', 'tabs'] as const).map((j) => backJointTile(j)),
      backJointTile('tabs', true),
      ...(['roundover', 'chamfer', 'square'] as const).map(outsideEdgeTile),
      ...(['vBevel', 'square'] as const).map(insideEdgeTile),
    ];
    expect(new Set(all.map((t) => JSON.stringify(t.shapes))).size).toBe(all.length);
    for (const t of all) for (const s of t.shapes) expect(s.d).not.toMatch(/NaN|undefined/);
  });

  it("draws every starter handle from its own sizes, and each kind differently", () => {
    const handles = createStarterShopProfile().hardware.filter(isHandle);
    expect(handles.length).toBeGreaterThan(5);
    const bare = handleTile(undefined);
    expect(bare.shapes).toHaveLength(1);
    for (const h of handles) {
      const tile = handleTile(h);
      expect(tile.shapes.length, h.name).toBeGreaterThan(1);
      for (const s of tile.shapes) expect(s.d, h.name).not.toMatch(/NaN|undefined/);
      expect(tile.w, h.name).toBeGreaterThanOrEqual(150);
    }
    // A knob, a bar, an arch, and each of the three cut into the front: no two the same.
    const kinds = ['generic-knob', 'printed-arch', 'printed-bar', 'finger-hole', 'finger-scoop', 'finger-notch'];
    const byKind = (h: (typeof handles)[number]) => h.routed?.shape ?? h.printed?.design ?? h.cnc?.design ?? (h.holes === 1 ? 'knob' : 'bar');
    const drawn = new Map(handles.map((h) => [byKind(h), JSON.stringify(handleTile(h).shapes)]));
    expect(drawn.size).toBeGreaterThanOrEqual(kinds.length);
    expect(new Set(drawn.values()).size).toBe(drawn.size);
  });
});

/** The larger picture beside a pattern's fields: a front's face as it is cut. */
describe("a front's face", () => {
  const size = { width: 381, height: 609.6 };
  it('draws a slab with every slot of its pattern, the carved border among them, and its handle', () => {
    const style = { kind: 'slab' as const, pattern: { ...starterPattern('grooves'), layout: 'chevron' as const, border: true } };
    const slots = patternFeatures(style, size, undefined);
    expect(slots.some((f) => f.id === 'pattern-border')).toBe(true);
    const bare = frontFaceTile(style, size);
    expect(bare.shapes).toHaveLength(1 + slots.length);
    // A pull: a bar and its two feet. A knob: one round.
    expect(frontFaceTile(style, size, [{ x: 350, y: 500 }, { x: 350, y: 404 }]).shapes).toHaveLength(bare.shapes.length + 3);
    expect(frontFaceTile(style, size, [{ x: 350, y: 500 }]).shapes).toHaveLength(bare.shapes.length + 1);
  });

  it('draws a shaker with its panel, the pattern on the panel, and a ripple as wide as its cut', () => {
    const shaker = { kind: 'shaker' as const, frameWidth: len('2-1/4"'), recessDepth: len('1/4"'), insideEdge: { kind: 'square' as const }, floorCornerRadius: len('1/16"'), pattern: starterPattern('ripples') };
    const tile = frontFaceTile(shaker, size);
    const slots = patternFeatures(shaker, size, undefined);
    expect(slots.length).toBeGreaterThan(3);
    expect(tile.shapes).toHaveLength(2 + slots.length);
    expect(tile.shapes.filter((x) => x.kind === 'solid')).toHaveLength(slots.length);
    for (const x of tile.shapes) expect(x.d).not.toMatch(/NaN|undefined/);
    // A plain front is its outline alone.
    expect(frontFaceTile({ kind: 'slab' }, size).shapes).toHaveLength(1);
  });
});

/** Setup's picture is an example cabinet, not the project. */
describe("Setup's example", () => {
  it('is one base cabinet built with what the project shares, and leaves the project alone', () => {
    const kitchen = createKitchenProject();
    kitchen.context.settings.construction = 'faceFrame';
    kitchen.context.sizes.base.height = len('30"');
    const before = JSON.stringify(kitchen);
    const example = setupExample(kitchen);
    expect(JSON.stringify(kitchen)).toBe(before);
    expect(cabinetsOf(example)).toHaveLength(1);
    const cabinet = cabinetsOf(example)[0]!;
    expect(cabinet.construction).toBe('faceFrame');
    expect(cabinet.size.height.mm).toBeCloseTo(len('30"').mm);
    expect(example.context.room).toBeUndefined();
    expect(example.context.fronts).toEqual(kitchen.context.fronts);
    expect(example.materials).toEqual(kitchen.materials);
    expect(cabinet.top).toBeUndefined();
    expect(cabinetsOf(setupExample(kitchen, { top: true }))[0]!.top).toEqual({});
  });
});
