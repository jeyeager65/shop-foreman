import type { CabinetDesign, Material, Part, Vec3 } from '@/model';
import { withGrain } from './grain';
import { thicknessOf } from './style';

/**
 * A solid wood strip on the front edges of a plywood case with no face frame, so the plywood's edge does not show
 * at the front. The case's parts are already cut smaller by the strip's thickness on those edges, as for edge banding
 * (`banding`, with `strip`); this gives the strips themselves: one for each such edge, as long as the edge that
 * shows, as wide as its part is thick, of the frame's material, glued on.
 */
export function edgeStripParts(parts: Part[], cabinet: CabinetDesign, materials: Material[]): Part[] {
  const materialId = cabinet.faceFrame.materialId;
  const tCase = thicknessOf(materials, cabinet.materials.caseId);
  const W = cabinet.size.width.mm;
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const scaled = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
  const made: Part[] = [];
  for (const part of parts) {
    if (!part.banding?.strip || !part.placement) continue;
    const band = part.banding.thickness;
    const { origin, xAxis: X, yAxis: Y } = part.placement;
    const N = cross(X, Y);
    const outline = part.features.find((f) => f.kind === 'cutout' && !f.inside);
    const points = outline?.kind === 'cutout' ? outline.outline : [];
    for (const edge of part.banding.edges) {
      // The edge in the part's frame: the line it is on, and how far along it the outline runs (a side with a toe
      // kick notch has its front edge only above the notch).
      const upright = edge === 'x0' || edge === 'x1';
      const at = edge === 'x0' || edge === 'y0' ? 0 : upright ? part.size.width : part.size.height;
      const on = points.filter((p) => Math.abs((upright ? p.x : p.y) - at) < 1e-6).map((p) => (upright ? p.y : p.x));
      let from = on.length ? Math.min(...on) : 0;
      let to = on.length ? Math.max(...on) : upright ? part.size.height : part.size.width;
      const along: Vec3 = upright ? Y : X;
      // What spans the case runs into its sides' joints: its strip stops at the sides' inside faces.
      if (part.role !== 'side' && part.role !== 'partition' && Math.abs(along[0]) > 0.99) {
        const x = (d: number) => origin[0] + d * along[0];
        const [lo, hi] = [tCase, W - tCase];
        const clip = (d: number) => (Math.min(Math.max(x(d), lo), hi) - origin[0]) / along[0];
        [from, to] = [clip(from), clip(to)].sort((a, b) => a - b) as [number, number];
      }
      const length = to - from;
      if (length <= 1e-6) continue;
      // Face A of the strip looks out from the edge; its length runs so that its width crosses the part's thickness.
      const out: Vec3 = edge === 'x0' ? scaled(X, -1) : edge === 'x1' ? X : edge === 'y0' ? scaled(Y, -1) : Y;
      const down = scaled(N, -1);
      const run = cross(down, out);
      // Where the strip starts: the end of the edge its length runs from, on the part's face A, out by the band.
      const sign = run[0] * along[0] + run[1] * along[1] + run[2] * along[2];
      const start = sign > 0 ? from : to;
      const [ex, ey] = upright ? [at, start] : [start, at];
      const corner: Vec3 = [0, 1, 2].map((i) => origin[i]! + ex * X[i]! + ey * Y[i]! + band * out[i]!) as Vec3;
      made.push(
        withGrain(
          {
            id: `${part.id}-edge${part.banding.edges.length > 1 ? `-${edge}` : ''}`,
            designObjectId: part.designObjectId,
            name: `${part.name} edge strip`,
            materialId,
            size: { width: length, height: part.size.thickness, thickness: band },
            features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: length, y: 0 }, { x: length, y: part.size.thickness }, { x: 0, y: part.size.thickness }] }],
            role: 'caseEdge',
            placement: { origin: corner, xAxis: run, yAxis: down },
          },
          'caseEdge',
          materials,
        ),
      );
    }
  }
  return made;
}
