/**
 * Parts as real solids: the blank minus its features, built with Manifold.
 *
 * Solid coordinates: X right and Y up as seen from the front (the part's own
 * frame), Z from the back face (0) to the front face (thickness).
 */
import type { ManifoldToplevel } from 'manifold-3d';
import Module from 'manifold-3d';
import { bevelWidth } from '@/design';
import type { Mm, Part, ResolvedEdge } from '@/model';
import { POCKET, arcFloorAt, arcLedge, arcSeatAt, arcShape, pocketAxis, slotLedge, slotShape } from './pocketHole';
import { asRect, insetRect, mustBeRect, type Rect } from './rect';

type Wasm = ManifoldToplevel;
type Solid = InstanceType<Wasm['Manifold']>;
type Vec3 = [number, number, number];

export interface SolidMesh {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  triangles: Uint32Array;
  volume: number;
}

let loading: Promise<Wasm> | undefined;

/** Loads the Manifold WebAssembly module once. In the browser pass the URL of manifold.wasm. */
export function loadManifold(wasmUrl?: string): Promise<Wasm> {
  loading ??= Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((wasm) => {
    wasm.setup();
    return wasm;
  });
  return loading;
}

const ring = (r: Rect, z: Mm): Vec3[] => [
  [r.x0, r.y0, z],
  [r.x1, r.y0, z],
  [r.x1, r.y1, z],
  [r.x0, r.y1, z],
];

/** The blank, with the outside edge treatment on its front arris. */
function blank(wasm: Wasm, outline: Rect, thickness: Mm, edge?: ResolvedEdge): Solid {
  const points: Vec3[] = [...ring(outline, 0)];
  if (!edge) {
    points.push(...ring(outline, thickness));
  } else if (edge.kind === 'chamfer') {
    points.push(...ring(outline, thickness - edge.size), ...ring(insetRect(outline, edge.size), thickness));
  } else {
    // Roundover as a run of short flats; the shape is convex, so a hull makes it.
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI / 2) * (i / steps);
      points.push(...ring(insetRect(outline, edge.radius * (1 - Math.cos(a))), thickness - edge.radius * (1 - Math.sin(a))));
    }
  }
  return wasm.Manifold.hull(points);
}

/** How a pocket hole is drawn: a 15 degree, 3/8" pocket and its pilot, the screw leaving mid-thickness. Display only. */
const POCKET_HOLE = { angleDeg: 15, diameter: 9.5, pilot: 4, startsIn: 10, length: 70 };

/**
 * A low-angle pocket and its pilot, as a solid to subtract (`Part.pocketLook`, `low`): a slot as wide as the
 * bore, its seat square to the screw, its floor level at the seat's foot and up to the face in an arc. Seen
 * from the side it bulges nowhere, so it is the hull of its outline's points at the slot's two walls.
 */
function lowPocketCutter(wasm: Wasm, part: Part, f: Extract<Part['features'][number], { kind: 'pocketHole' }>, look: { angleDeg: number; seat: number }): Solid {
  const { Manifold } = wasm;
  const t = part.size.thickness;
  const over = 0.01;
  const arc = arcShape(t, POCKET.bore, look.angleDeg, look.seat);
  const { exit, inward } = pocketAxis(part.size, f.edge, f.at, f.inset);
  /** `u` in from the edge, `v` across the slot, `z` from the pocket's face (down into the part is negative). */
  const at = (u: number, v: number, z: number): [number, number, number] => [exit.x + inward.x * u - inward.y * v, exit.y + inward.y * u + inward.x * v, f.face === 'A' ? t + z : -z];
  const side: [number, number][] = [[arcSeatAt(arc, 0), over], [arc.foot, -arc.depth], [arc.arcFrom, -arc.depth]];
  for (let u = arc.arcFrom + 2; u < arc.end; u += 2) side.push([u, arcFloorAt(arc, u)]);
  side.push([arc.end, 0], [arc.end, over]);
  const half = POCKET.bore / 2;
  const slot = Manifold.hull(side.flatMap(([u, z]) => [at(u, -half, z), at(u, half, z)]));
  // The pilot: from outside the edge to just past the seat, at the screw's angle.
  const lead = Manifold.cylinder(arc.seat + 2, POCKET_HOLE.pilot / 2, POCKET_HOLE.pilot / 2, 16);
  const through = lead.translate(0, 0, -1);
  const tilt = f.face === 'A' ? 90 - look.angleDeg : 90 + look.angleDeg;
  const turn = { x0: 0, y0: 90, x1: 180, y1: 270 }[f.edge];
  const turned = through.rotate([0, tilt, turn]);
  const placed = turned.translate(exit.x, exit.y, t / 2);
  const both = Manifold.union([slot, placed]);
  for (const solid of [slot, lead, through, turned, placed]) solid.delete();
  return both;
}

/**
 * The ledge round a pocket's opening for a printed cover (`PocketLook.ledges`), as a solid to subtract: a rectangle
 * `POCKET.ledge.depth` deep in the pocket's face, its corners the bit's radius. Its size is the one the CNC cuts
 * (`slotLedge`, `arcLedge`).
 */
function ledgeCutter(wasm: Wasm, part: Part, f: Extract<Part['features'][number], { kind: 'pocketHole' }>, look: NonNullable<Part['pocketLook']>, r: Mm): Solid {
  const t = part.size.thickness;
  const over = 0.01;
  const open = look.kind === 'low' ? arcLedge(t, look.angleDeg, look.seat) : slotLedge(slotShape(t, 2 * r));
  const { exit, inward } = pocketAxis(part.size, f.edge, f.at, f.inset);
  const at = (u: number, v: number, z: number): Vec3 => [exit.x + inward.x * u - inward.y * v, exit.y + inward.y * u + inward.x * v, f.face === 'A' ? t + z : -z];
  const rad = Math.max(0.1, Math.min(r, open.half - 0.1));
  const points: Vec3[] = [];
  for (const [u, v, a0] of [[open.u0 + rad, open.half - rad, Math.PI / 2], [open.u0 + rad, -open.half + rad, Math.PI], [open.u1 - rad, -open.half + rad, -Math.PI / 2], [open.u1 - rad, open.half - rad, 0]] as const) {
    for (let k = 0; k <= 6; k++) {
      const a = a0 + (Math.PI / 2) * (k / 6);
      const [cu, cv] = [u + rad * Math.cos(a), v + rad * Math.sin(a)];
      points.push(at(cu, cv, -POCKET.ledge.depth), at(cu, cv, over));
    }
  }
  return wasm.Manifold.hull(points);
}

/** The pocket and pilot of one pocket hole, as a solid to subtract. The caller owns it. */
function pocketHoleCutter(wasm: Wasm, part: Part, f: Extract<Part['features'][number], { kind: 'pocketHole' }>): Solid {
  const { Manifold } = wasm;
  if (part.pocketLook?.kind === 'low') return lowPocketCutter(wasm, part, f, part.pocketLook);
  const { angleDeg, diameter, pilot, startsIn, length } = POCKET_HOLE;
  // Built along +Z from the point where the screw leaves the edge, then tipped over
  // to run into the part and out through the face, and turned to the edge it is on.
  const pocket = Manifold.cylinder(length, diameter / 2, diameter / 2, 32);
  const moved = pocket.translate(0, 0, startsIn);
  const lead = Manifold.cylinder(startsIn + 2, pilot / 2, pilot / 2, 16);
  const through = lead.translate(0, 0, -1);
  // As the CNC cuts a 15 degree pocket: the bore's lower half is its floor, and above the screw its walls stand
  // upright to the face, so it opens as a slot with parallel sides where the Kreg jig's bore opens as an oval.
  // (Toward the face is -X here for a pocket in face A and +X for one in face B, before it is tipped over.)
  const cnc = part.pocketLook?.kind === 'cnc';
  const wall = cnc ? Manifold.cube([40, diameter, length]) : undefined;
  const walls = wall?.translate(f.face === 'A' ? -40 : 0, -diameter / 2, startsIn);
  const both = Manifold.union([moved, through, ...(walls ? [walls] : [])]);
  wall?.delete();
  walls?.delete();
  const tilt = f.face === 'A' ? 90 - angleDeg : 90 + angleDeg;
  const turn = { x0: 0, y0: 90, x1: 180, y1: 270 }[f.edge];
  const turned = both.rotate([0, tilt, turn]);
  const { width, height, thickness } = part.size;
  // (Where the screw leaves the part: through the edge, or `inset` in from it, at a notch.)
  const out = pocketAxis({ width, height }, f.edge, f.at, f.inset).exit;
  const at: [number, number] = [out.x, out.y];
  const placed = turned.translate(at[0], at[1], thickness / 2);
  for (const solid of [pocket, moved, lead, through, both, turned]) solid.delete();
  return placed;
}

/** Builds the part: blank (or its shaped outline) minus pocket, bevel and cups. The caller owns the result (call delete()). */
export function buildPartSolid(wasm: Wasm, part: Part): Solid {
  const { Manifold } = wasm;
  const t = part.size.thickness;
  const over = 0.01; // cutters poke past the face so no zero-thickness skin is left
  const edge = part.features.find((f) => f.kind === 'edgeProfile');
  const outline = { x0: 0, y0: 0, x1: part.size.width, y1: part.size.height };
  const cutters: Solid[] = [];

  const bevels = part.features.filter((f) => f.kind === 'bevel');
  for (const f of part.features) {
    if (f.kind === 'pocket') {
      const floor = mustBeRect(f.outline);
      // With a bevel the wall slopes out to the frame edge at the surface.
      const bevel = bevels.find((b) => b.face === f.face && Math.abs(b.depth - f.depth) < 1e-6);
      const top = bevel ? insetRect(floor, -bevelWidth(bevel.angleDeg, f.depth)) : floor;
      const grow = bevel ? (over * bevelWidth(bevel.angleDeg, f.depth)) / f.depth : 0;
      cutters.push(
        f.face === 'A'
          ? Manifold.hull([...ring(floor, t - f.depth), ...ring(insetRect(top, -grow), t + over)])
          : Manifold.hull([...ring(floor, f.depth), ...ring(insetRect(top, -grow), -over)]),
      );
    } else if (f.kind === 'cup' || f.kind === 'hole') {
      const cylinder = Manifold.cylinder(f.depth + over, f.diameter / 2, f.diameter / 2, 96);
      cutters.push(cylinder.translate(f.center.x, f.center.y, f.face === 'A' ? t - f.depth : -over));
      cylinder.delete();
    } else if (f.kind === 'slot') {
      // A box along each stretch of its line, a little long so the stretches of a curve meet.
      const [z0, z1] = f.face === 'A' ? [t - f.depth, t + over] : [-over, f.depth];
      let rise: [number, number, number][] = [];
      for (let i = 0; i + 1 < f.path.length; i++) {
        const [a, b] = [f.path[i]!, f.path[i + 1]!];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len];
        const [nx, ny] = [(-uy * f.width) / 2, (ux * f.width) / 2];
        const e = Math.min(f.width / 2, 1);
        const corners: [number, number][] = [
          [a.x - ux * e + nx, a.y - uy * e + ny],
          [b.x + ux * e + nx, b.y + uy * e + ny],
          [b.x + ux * e - nx, b.y + uy * e - ny],
          [a.x - ux * e - nx, a.y - uy * e - ny],
        ];
        if (f.profile && f.face === 'A') {
          // A shaped cut, from the surface it starts at (the face, or a panel's floor) down: a V to a line, or a round bottom.
          const zTop = t - (f.top ?? 0) + over;
          const shape = f.profile;
          /** The cut's section where it is `deep` from the face: across it in half-widths of the feature, and its height. */
          const section = (deep: number): [number, number][] => {
            const d = Math.max(0.02, deep - (f.top ?? 0));
            const zLow = t - (f.top ?? 0) - d;
            if (shape.kind === 'v') {
              const half = (d * Math.tan((shape.angleDeg * Math.PI) / 360)) / (f.width / 2);
              return [[-half, zTop], [0, zLow], [half, zTop]];
            }
            if (shape.kind === 'bull') {
              // A flat floor between two round corners; shallower than a corner is round, only the foot of each is cut.
              const rc = Math.min(shape.cornerRadius, shape.diameter / 2);
              const flat = shape.diameter / 2 - rc;
              const turn = Math.acos(1 - Math.min(d, rc) / Math.max(rc, 1e-6));
              const corner = Array.from({ length: 5 }, (_, k): [number, number] => {
                const at = (turn * k) / 4;
                return [(flat + rc * Math.sin(at)) / (f.width / 2), k === 4 ? (d > rc ? zLow + rc : t - (f.top ?? 0)) : zLow + rc - rc * Math.cos(at)];
              });
              const right: [number, number][] = [...corner, [corner[4]![0], zTop]];
              return [...right.map(([x, z]): [number, number] => [-x, z]).reverse(), ...right];
            }
            const r = shape.diameter / 2;
            const half = d >= r ? r : Math.sqrt(d * (2 * r - d));
            const reach = Math.asin(Math.min(1, half / r));
            return Array.from({ length: 7 }, (_, k): [number, number] => {
              const at = -reach + (2 * reach * k) / 6;
              return [(r * Math.sin(at)) / (f.width / 2), k === 0 || k === 6 ? zTop : zLow + r - r * Math.cos(at)];
            });
          };
          const [sa, sb] = [section(f.depths?.[i] ?? f.depth), section(f.depths?.[i + 1] ?? f.depth)];
          if (f.depths) {
            // A ripple: one solid for each rise and fall of its depth, the hull of its sections from one shallow point to
            // the next (thousands of short pieces, one a stretch, are too slow to cut from the part).
            rise.push(...sa.map(([s, z]): [number, number, number] => [a.x + nx * s, a.y + ny * s, z]), ...sb.map(([s, z]): [number, number, number] => [b.x + nx * s, b.y + ny * s, z]));
            const [here, next, before] = [f.depths[i + 1]!, f.depths[i + 2], f.depths[i]!];
            if (next === undefined || (here <= before && here <= next)) {
              cutters.push(Manifold.hull(rise));
              rise = [];
            }
            continue;
          }
          const [ax, ay, bx, by] = [a.x - ux * e, a.y - uy * e, b.x + ux * e, b.y + uy * e];
          cutters.push(Manifold.hull([...sa.map(([s, z]): [number, number, number] => [ax + nx * s, ay + ny * s, z]), ...sb.map(([s, z]): [number, number, number] => [bx + nx * s, by + ny * s, z])]));
          continue;
        }
        cutters.push(Manifold.hull([...corners.map(([x, y]): [number, number, number] => [x, y, z0]), ...corners.map(([x, y]): [number, number, number] => [x, y, z1])]));
      }
    } else if (f.kind === 'dado') {
      // Where the recess runs out through an edge of the part, the cutter pokes past it.
      const r = mustBeRect(f.outline);
      const open = {
        x0: r.x0 < 1e-6 ? r.x0 - over : r.x0,
        y0: r.y0 < 1e-6 ? r.y0 - over : r.y0,
        x1: r.x1 > part.size.width - 1e-6 ? r.x1 + over : r.x1,
        y1: r.y1 > part.size.height - 1e-6 ? r.y1 + over : r.y1,
      };
      cutters.push(f.face === 'A' ? Manifold.hull([...ring(open, t - f.depth), ...ring(open, t + over)]) : Manifold.hull([...ring(open, f.depth), ...ring(open, -over)]));
    } else if (f.kind === 'pocketHole') {
      cutters.push(pocketHoleCutter(wasm, part, f));
      const ledges = part.pocketLook?.ledges;
      if (ledges?.featureIds.includes(f.id)) cutters.push(ledgeCutter(wasm, part, f, part.pocketLook!, ledges.r));
    } else if (f.kind === 'cutout' && f.inside) {
      // An opening through the part: a rectangle (a sink's), or any outline (a round cable hole in a back, a slot for air).
      // (A tab's slot at the very edge of a side runs out through it: the cutter pokes past, as a dado's does.)
      const whole = asRect(f.outline);
      const r = whole && {
        x0: whole.x0 < 1e-6 ? whole.x0 - over : whole.x0,
        y0: whole.y0 < 1e-6 ? whole.y0 - over : whole.y0,
        x1: whole.x1 > part.size.width - 1e-6 ? whole.x1 + over : whole.x1,
        y1: whole.y1 > part.size.height - 1e-6 ? whole.y1 + over : whole.y1,
      };
      if (r) cutters.push(Manifold.hull([...ring(r, -over), ...ring(r, t + over)]));
      else {
        // Counter-clockwise, as an extrusion's outline must be: a clockwise one (a sink's, laid out from the front edge
        // back) would be read as a hole, and the part left with nothing.
        const loop = f.outline.map((p): [number, number] => [p.x, p.y]);
        const area = loop.reduce((sum, [x, y], i) => {
          const [nx, ny] = loop[(i + 1) % loop.length]!;
          return sum + x * ny - nx * y;
        }, 0);
        cutters.push(Manifold.extrude([area < 0 ? loop.reverse() : loop], t + 2 * over).translate([0, 0, -over]));
      }
    }
  }

  // A part whose shape is not its bounding rectangle (a side with its toe-kick notch)
  // is extruded from its cutout outline. Edge treatments on such parts are not drawn.
  const cutout = part.features.find((f) => f.kind === 'cutout' && !f.inside);
  const shaped = cutout?.kind === 'cutout' && !asRect(cutout.outline) ? cutout.outline : undefined;
  const body = shaped
    ? Manifold.extrude([shaped.map((p): [number, number] => [p.x, p.y])], t)
    : blank(wasm, outline, t, edge?.kind === 'edgeProfile' ? edge.treatment : undefined);
  if (cutters.length === 0) return body;
  const tools = Manifold.union(cutters);
  const result = body.subtract(tools);
  for (const solid of [body, tools, ...cutters]) solid.delete();
  return result;
}

export function meshOf(solid: Solid): SolidMesh {
  const mesh = solid.getMesh();
  const n = mesh.numProp;
  const positions = new Float32Array((mesh.vertProperties.length / n) * 3);
  for (let i = 0, v = 0; i < mesh.vertProperties.length; i += n, v += 3) {
    positions[v] = mesh.vertProperties[i]!;
    positions[v + 1] = mesh.vertProperties[i + 1]!;
    positions[v + 2] = mesh.vertProperties[i + 2]!;
  }
  return { positions, triangles: new Uint32Array(mesh.triVerts), volume: solid.volume() };
}

/** Mesh of each part, ready to draw. */
export async function buildPartMeshes(parts: Part[], wasmUrl?: string, onProgress?: (done: number, total: number) => void): Promise<{ partId: string; mesh: SolidMesh }[]> {
  const wasm = await loadManifold(wasmUrl);
  return parts.map((part, i) => {
    onProgress?.(i, parts.length);
    const solid = buildPartSolid(wasm, part);
    const mesh = meshOf(solid);
    solid.delete();
    return { partId: part.id, mesh };
  });
}
