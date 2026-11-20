/// <reference lib="webworker" />
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { type SolidMesh, buildPartMeshes } from '@/geometry/solids';
import { type KitObject, buildInstallKitObjects } from '@/jigs/installKit';
import type { JigInstance, Part } from '@/model';

export interface SolidRequest {
  id: number;
  parts: Part[];
  /** Install kit jigs to build as well. */
  kit?: JigInstance[];
  /** Report how far along the parts are while they are built (`progress` replies, a few a second). */
  progress?: boolean;
}
export interface SolidResponse {
  id: number;
  meshes?: { partId: string; mesh: SolidMesh }[];
  kit?: KitObject[];
  error?: string;
  /** Not the answer yet: how many of the parts are built so far. Only when the request asked for it. */
  progress?: { done: number; total: number };
}

self.onmessage = async (event: MessageEvent<SolidRequest>) => {
  const { id, parts, kit: jigs } = event.data;
  try {
    let told = 0;
    const tell = (done: number, total: number) => {
      if (performance.now() - told < 80) return;
      told = performance.now();
      self.postMessage({ id, progress: { done, total } } satisfies SolidResponse);
    };
    const meshes = await buildPartMeshes(parts, wasmUrl, event.data.progress ? tell : undefined);
    const kit = jigs?.length ? await buildInstallKitObjects(jigs, wasmUrl) : [];
    const buffers = [...meshes, ...kit].flatMap((m) => [m.mesh.positions.buffer, m.mesh.triangles.buffer]);
    self.postMessage({ id, meshes, kit } satisfies SolidResponse, buffers);
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies SolidResponse);
  }
};
