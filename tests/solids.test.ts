// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bevelWidth, deriveParts, doorSetOf } from '@/design';
import { buildPartMeshes } from '@/geometry/solids';
import { createStarterShop } from '@/libraries';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';

const shop = createStarterShop();
const CUP = Math.PI * 17.5 ** 2 * 13;

/** Volume of the panel recess: a frustum from the floor up to the frame edge. */
function recessVolume(width: number, height: number, frame: number, depth: number, slope: number) {
  const top = (width - 2 * frame) * (height - 2 * frame);
  const floor = (width - 2 * frame - 2 * slope) * (height - 2 * frame - 2 * slope);
  return (depth / 3) * (top + floor + Math.sqrt(top * floor));
}

describe('door solids', () => {
  it('builds the vanity door as blank minus pocket, bevel and cups', async () => {
    const project = createVanityProject();
    doorSetOf(project).outsideEdge = { kind: 'square' };
    const parts = deriveParts(project, shop);
    const meshes = await buildPartMeshes(parts);
    expect(meshes.map((m) => m.partId)).toEqual(['doors-1/door-left', 'doors-1/door-right']);

    const { width, height, thickness } = parts[0]!.size;
    const expected = width * height * thickness - recessVolume(width, height, 57.15, 6.35, bevelWidth(60, 6.35)) - 2 * CUP;
    for (const { mesh } of meshes) {
      expect(mesh.volume / expected).toBeCloseTo(1, 3);
      expect(mesh.triangles.length % 3).toBe(0);
      expect(mesh.positions.length).toBeGreaterThan(100);
    }
    // Left and right doors mirror each other, so they hold the same volume
    expect(meshes[0]!.mesh.volume).toBeCloseTo(meshes[1]!.mesh.volume, 3);
  });

  it('takes the outside edge off the front arris', async () => {
    const square = createVanityProject();
    doorSetOf(square).style = { kind: 'slab' };
    doorSetOf(square).outsideEdge = { kind: 'square' };
    const chamfer = structuredClone(square);
    doorSetOf(chamfer).outsideEdge = { kind: 'chamfer', size: len('1/8"') };
    const round = structuredClone(square);
    doorSetOf(round).outsideEdge = { kind: 'roundover', radius: len('1/8"') };

    const volume = async (p: typeof square) => (await buildPartMeshes(deriveParts(p, shop)))[0]!.mesh.volume;
    const [vSquare, vChamfer, vRound] = [await volume(square), await volume(chamfer), await volume(round)];
    const part = deriveParts(square, shop)[0]!;
    expect(vSquare / (part.size.width * part.size.height * 19 - 2 * CUP)).toBeCloseTo(1, 3);
    // A chamfer removes more than a roundover of the same size; both remove a little
    expect(vChamfer).toBeLessThan(vRound);
    expect(vRound).toBeLessThan(vSquare);
    const perimeter = 2 * (part.size.width + part.size.height);
    expect((vSquare - vChamfer) / ((3.175 ** 2 / 2) * perimeter)).toBeCloseTo(1, 1);
  });
});
