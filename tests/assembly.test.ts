// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deriveParts, openingsOf, doorSetOf } from '@/design';
import { ASSEMBLY, type JigPlacement, buildAssembly, swingClearance } from '@/design/assembly';
import { GAP_SHIM, SUPPORT_BLOCK } from '@/jigs/installKit';
import { createStarterShop } from '@/libraries';
import { installKit } from '@/plan';
import { createVanityProject } from '@/samples/vanity';

const project = createVanityProject();
const shop = createStarterShop();
const parts = deriveParts(project, shop);
const opening = openingsOf(project, shop.materials)[0]!;
const mounting = doorSetOf(project).mounting;
const assembly = buildAssembly(opening, mounting, parts, installKit(project));
const OVERLAY = 12.7; // the hinge's 1/2" side overlay
const BOTTOM = 17.4625; // 11/16"
const GAP = 3.175;

/** A point of a jig's own mesh, in the world. */
const at = (j: JigPlacement, p: [number, number, number]) =>
  j.offset.map((o, i) => o + p[0] * j.axes[0][i]! + p[1] * j.axes[1][i]! + p[2] * j.axes[2][i]!);

describe('cabinet assembly', () => {
  it('hangs the doors over the opening by their overlays', () => {
    const [left, right] = assembly.doors;
    expect(left!.origin[0]).toBeCloseTo(-OVERLAY, 4);
    expect(left!.origin[1]).toBeCloseTo(-BOTTOM, 4);
    expect(left!.origin[2]).toBe(ASSEMBLY.doorStandoff);
    expect(right!.origin[0] - (left!.origin[0] + left!.size.width)).toBeCloseTo(GAP, 4);
    expect(right!.origin[0] + right!.size.width).toBeCloseTo(opening.width.mm + OVERLAY, 4);
    expect(left!.origin[1] + left!.size.height).toBeCloseTo(opening.height.mm + BOTTOM, 4);
  });

  it('hinges each door on its outer side with two hinges that clear the frame', () => {
    const [left, right] = assembly.doors;
    expect([left!.hingeSide, right!.hingeSide]).toEqual(['left', 'right']);
    for (const door of assembly.doors) {
      expect(door.hinges).toHaveLength(2);
      // The pivot is inside the cup, within the door's thickness
      expect(door.pivot.z).toBeGreaterThan(door.origin[2]);
      expect(door.pivot.z).toBeLessThan(door.origin[2] + door.hinges[0]!.cup.depth);
      expect(swingClearance(door)).toBeLessThan(ASSEMBLY.doorStandoff);
      // The frame wing sits on the opening's edge, inside the opening
      const wing = door.hinges[0]!.fixed[0]!;
      const edge = door.hingeSide === 'left' ? 0 : opening.width.mm;
      expect(Math.min(Math.abs(wing.min[0] - edge), Math.abs(wing.max[0] - edge))).toBeCloseTo(0, 6);
      expect(wing.min[0]).toBeGreaterThanOrEqual(0);
      expect(wing.max[0]).toBeLessThanOrEqual(opening.width.mm);
    }
    // Mirror images of each other
    expect(left!.pivot.x + right!.pivot.x).toBeCloseTo(opening.width.mm, 4);
  });

  it('frames the opening', () => {
    const xs = assembly.frame.flatMap((b) => [b.min[0], b.max[0]]);
    expect(Math.min(...xs)).toBe(-ASSEMBLY.frameMemberWidth);
    expect(Math.max(...xs)).toBe(opening.width.mm + ASSEMBLY.frameMemberWidth);
    for (const b of assembly.frame) {
      expect(b.max[2]).toBe(0);
      expect(b.min[2]).toBe(-opening.frameThickness.mm);
    }
  });

  it('puts a support block under each door and the shim in the gap', () => {
    const blocks = assembly.jigs.filter((j) => j.template === 'supportBlock');
    const shims = assembly.jigs.filter((j) => j.template === 'gapShim');
    expect(blocks).toHaveLength(2);
    expect(shims).toHaveLength(1);

    blocks.forEach((block, i) => {
      const door = assembly.doors[i]!;
      // Mesh point (hookDepth, ledgeThickness, 0): the frame face at the top of the ledge
      const ledge = at(block, [SUPPORT_BLOCK.hookDepth, SUPPORT_BLOCK.ledgeThickness, 0]);
      expect(ledge[1]).toBeCloseTo(door.origin[1], 4); // the door stands on it
      expect(ledge[2]).toBeCloseTo(0, 6);
      // Underside of the hook rests on the opening's bottom edge
      expect(at(block, [0, SUPPORT_BLOCK.ledgeThickness + BOTTOM, 0])[1]).toBeCloseTo(0, 4);
      // Centred under the door
      const far = at(block, [0, 0, SUPPORT_BLOCK.width]);
      expect((ledge[0]! + far[0]!) / 2).toBeCloseTo(door.origin[0] + door.size.width / 2, 4);
    });
    // The web fits between door and frame
    expect(SUPPORT_BLOCK.webThickness).toBeLessThan(ASSEMBLY.doorStandoff);

    const shim = shims[0]!;
    const left = assembly.doors[0]!;
    expect(at(shim, [0, 0, 0])[0]).toBeCloseTo(left.origin[0] + left.size.width, 4);
    expect(at(shim, [0, 0, GAP])[0]).toBeCloseTo(assembly.doors[1]!.origin[0], 4);
    expect(at(shim, [GAP_SHIM.length, 0, 0])[1]).toBeLessThan(opening.height.mm);
  });

  it('handles a single door', () => {
    const single = structuredClone(project);
    doorSetOf(single).mounting.doors = 1;
    doorSetOf(single).mounting.hingeSide = 'right';
    const design = doorSetOf(single);
    const one = buildAssembly(opening, design.mounting, deriveParts(single, createStarterShop()), installKit(single));
    expect(one.doors).toHaveLength(1);
    expect(one.doors[0]!.hingeSide).toBe('right');
    expect(one.jigs.filter((j) => j.template === 'gapShim')).toHaveLength(0);
    expect(one.jigs.filter((j) => j.template === 'supportBlock')).toHaveLength(1);
  });
});
