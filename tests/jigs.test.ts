// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  GAP_SHIM,
  SUPPORT_BLOCK,
  buildInstallKit3mf,
  buildInstallKitObjects,
  supportBlockProfile,
  supportBlockVolume,
} from '@/jigs/installKit';
import { modelXml, printSettingsWords, slicerSettingsXml, write3mf } from '@/jigs/threemf';
import { crc32, zip } from '@/jigs/zip';
import { installKit } from '@/plan';
import { createVanityProject } from '@/samples/vanity';

const kit = installKit(createVanityProject());
const OVERLAY = 17.4625; // 11/16"
const GAP = 3.175; // 1/8"

/** Reads a stored-only zip back through its central directory. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files[name] = decoder.decode(data);
    at += 46 + nameLength;
  }
  return files;
}

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips files', () => {
    const files = unzip(zip([{ path: 'a.txt', text: 'hello' }, { path: 'dir/b.txt', text: 'wörld' }]));
    expect(files).toEqual({ 'a.txt': 'hello', 'dir/b.txt': 'wörld' });
  });
});

describe('install kit', () => {
  it('puts the ledge the bottom overlay below the opening edge', () => {
    const profile = supportBlockProfile(OVERLAY);
    const b = SUPPORT_BLOCK;
    // Underside of the hook (sits on the opening edge) and top of the ledge (carries the door)
    const hookUnderside = profile[0]![1];
    const ledgeTop = profile[4]![1];
    expect(hookUnderside - ledgeTop).toBeCloseTo(OVERLAY, 6);
    expect(ledgeTop).toBeCloseTo(b.ledgeThickness, 6);
    // The ledge reaches out from the frame face; the hook reaches back from it
    expect(profile[4]![0] - profile[1]![0]).toBeCloseTo(b.ledgeDepth, 6);
    expect(profile[1]![0] - profile[0]![0]).toBeCloseTo(b.hookDepth, 6);
  });

  it('builds the block and the shim as solids', async () => {
    const [block, shim] = await buildInstallKitObjects(kit);
    expect(block!.name).toBe('Support block');
    expect(block!.mesh.volume / supportBlockVolume(OVERLAY)).toBeCloseTo(1, 5);
    expect(block!.placements).toHaveLength(2);
    expect(shim!.name).toBe('Gap shim');
    expect(shim!.mesh.volume).toBeCloseTo(GAP_SHIM.length * GAP_SHIM.width * GAP, 3);
    expect(shim!.placements).toHaveLength(1);

    // Both sit on the bed (z from 0), the shim as thick as the gap
    const zs = (positions: Float32Array) => Array.from(positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs(block!.mesh.positions))).toBeCloseTo(0, 5);
    expect(Math.max(...zs(block!.mesh.positions))).toBeCloseTo(SUPPORT_BLOCK.width, 5);
    expect(Math.max(...zs(shim!.mesh.positions))).toBeCloseTo(GAP, 5);

    // Pieces don't overlap on the bed
    expect(block!.placements[1]!.x).toBeGreaterThan(SUPPORT_BLOCK.hookDepth + SUPPORT_BLOCK.ledgeDepth);
    expect(shim!.placements[0]!.y).toBeGreaterThan(OVERLAY + SUPPORT_BLOCK.ledgeThickness + SUPPORT_BLOCK.hookThickness);
  });

  it('writes a 3MF package in millimetres with every copy on the bed', async () => {
    const objects = await buildInstallKitObjects(kit);
    const bytes = await buildInstallKit3mf(kit);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
    const files = unzip(bytes);
    expect(Object.keys(files)).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
    expect(files['_rels/.rels']).toContain('Target="/3D/3dmodel.model"');

    const model = files['3D/3dmodel.model']!;
    expect(model).toBe(modelXml(objects));
    expect(model).toContain('<model unit="millimeter"');
    expect(model.match(/<object /g)).toHaveLength(2);
    expect(model.match(/<item objectid="1"/g)).toHaveLength(2);
    expect(model.match(/<item objectid="2"/g)).toHaveLength(1);
    expect(model.match(/<vertex /g)).toHaveLength((objects[0]!.mesh.positions.length + objects[1]!.mesh.positions.length) / 3);
    expect(model.match(/<triangle /g)).toHaveLength((objects[0]!.mesh.triangles.length + objects[1]!.mesh.triangles.length) / 3);

    // Every triangle points at a real vertex, and every edge is shared by exactly two triangles
    for (const { mesh } of objects) {
      const edges = new Map<string, number>();
      for (let t = 0; t < mesh.triangles.length; t += 3) {
        const tri = [mesh.triangles[t]!, mesh.triangles[t + 1]!, mesh.triangles[t + 2]!];
        tri.forEach((a, i) => {
          expect(a).toBeLessThan(mesh.positions.length / 3);
          const b = tri[(i + 1) % 3]!;
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        });
      }
      expect([...edges.values()].every((count) => count === 2)).toBe(true);
    }
  });

  it("carries a solid's own print settings beside the model, for the slicers that read them", async () => {
    const [block, shim] = await buildInstallKitObjects(kit);
    const print = { walls: 4, topLayers: 5, bottomLayers: 5, infillPercent: 40, infillPattern: 'gyroid' as const, layerHeight: 0.2 };
    expect(printSettingsWords(print)).toBe('4 walls, 5 top and 5 bottom layers, 40% gyroid infill, 0.2 mm layers');
    // None has any: the file is the model alone.
    expect(slicerSettingsXml([block!, shim!])).toBeUndefined();
    // The block is on the bed twice: an object for each copy, each with the settings; the shim has none.
    expect(block!.placements).toHaveLength(2);
    const files = unzip(write3mf([{ ...block!, print }, shim!]));
    expect(Object.keys(files)).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/model_settings.config']);
    expect(files['[Content_Types].xml']).toContain('Extension="config"');
    const model = files['3D/3dmodel.model']!;
    expect(model.match(/<object /g)).toHaveLength(3);
    for (const id of [1, 2, 3]) expect(model.match(new RegExp(`<item objectid="${id}"`, 'g'))).toHaveLength(1);
    // Nothing says another program wrote it, which would change how a slicer opens it.
    expect(model).not.toMatch(/BambuStudio|OrcaSlicer|PrusaSlicer/);
    const settings = files['Metadata/model_settings.config']!;
    expect(settings.match(/<object id="[12]">/g)).toHaveLength(2);
    expect(settings).not.toContain('<object id="3">');
    for (const line of ['key="wall_loops" value="4"', 'key="top_shell_layers" value="5"', 'key="bottom_shell_layers" value="5"', 'key="sparse_infill_density" value="40%"', 'key="sparse_infill_pattern" value="gyroid"', 'key="layer_height" value="0.2"']) {
      expect(settings.match(new RegExp(line, 'g'))).toHaveLength(2);
    }
  });
});
