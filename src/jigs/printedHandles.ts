/**
 * The job's printed handles as printable solids, laid out on the bed: one object for
 * each kind of handle, with a copy for every front that has it.
 *
 * A pull lies on its side (its profile on the bed), so the holes in its feet are
 * level; a knob stands head down with its hole on top. Neither needs supports.
 */
import { fasteningHole, handleHeight, handleLook, knobProfile, printedHandleProblems, pullProfile } from '@/design/printedHandle';
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import type { Handle, Hardware, Mm, Part } from '@/model';
import { type PrintObject, write3mf } from './threemf';

/** Space between pieces on the print bed. */
const BED_SPACING: Mm = 8;
const PER_ROW = 4;
/** Flats round a hole and round a knob. */
const ROUND = 48;

export interface PrintedHandleCount {
  handle: Handle;
  quantity: number;
}

/**
 * The printed handles the job's parts call for, and how many of each: one for every
 * front with handle holes for it, every copy of a cabinet counted.
 */
export function printedHandlesOf(parts: Part[], hardware: Hardware[]): PrintedHandleCount[] {
  const counts = new Map<string, number>();
  for (const part of parts) {
    const hole = part.features.find((f) => f.kind === 'hole' && f.id.startsWith('handle') && f.hardwareId);
    if (hole?.kind === 'hole' && hole.hardwareId) counts.set(hole.hardwareId, (counts.get(hole.hardwareId) ?? 0) + 1);
  }
  return [...counts].flatMap(([id, quantity]) => {
    const handle = hardware.find((h): h is Handle => h.kind === 'handle' && h.id === id);
    return handle?.printed ? [{ handle, quantity }] : [];
  });
}

/** One printed handle as a mesh, as it lies on the bed, with its footprint there. */
export async function buildPrintedHandle(handle: Handle, wasmUrl?: string): Promise<{ mesh: SolidMesh; size: { x: Mm; y: Mm } }> {
  const printed = handle.printed;
  if (!printed) throw new Error(`${handle.name} is not a printed handle.`);
  const problems = printedHandleProblems(handle);
  if (problems.length) throw new Error(`${handle.name} cannot be printed. ${problems.join(' ')}`);
  const { Manifold } = await loadManifold(wasmUrl);
  const hole = fasteningHole(printed);
  const top = handleHeight(handle);
  // A little past the surface it starts at, so the cut is clean.
  const over = 0.5;
  if (printed.design === 'knob') {
    // Head down: the profile turned over, so the foot and its hole are on top.
    const profile = knobProfile(handle).map(([r, z]): [number, number] => [r, top - z]).reverse();
    const body = Manifold.revolve([profile], ROUND);
    const drill = Manifold.cylinder(hole.depth + over, hole.diameter / 2, hole.diameter / 2, ROUND);
    const cutter = drill.translate(0, 0, top - hole.depth);
    const solid = body.subtract(cutter);
    const across = Math.max(...profile.map(([r]) => r)) * 2;
    // Moved so its corner, not its axis, is at the origin.
    const placed = solid.translate(across / 2, across / 2, 0);
    const mesh = meshOf(placed);
    for (const s of [body, drill, cutter, solid, placed]) s.delete();
    return { mesh, size: { x: across, y: across } };
  }
  const half = handleLook(handle).length / 2;
  const body = Manifold.extrude([pullProfile(handle)], printed.width);
  // A hole up each foot from the face that meets the front: level, as the pull lies.
  const drill = Manifold.cylinder(hole.depth + over, hole.diameter / 2, hole.diameter / 2, ROUND);
  const turned = drill.rotate([-90, 0, 0]);
  const cutters = [-1, 1].map((side) => turned.translate((side * handle.spacing) / 2, -over, printed.width / 2));
  const tools = Manifold.union(cutters);
  const solid = body.subtract(tools);
  const placed = solid.translate(half, 0, 0);
  const mesh = meshOf(placed);
  for (const s of [body, drill, turned, ...cutters, tools, solid, placed]) s.delete();
  return { mesh, size: { x: 2 * half, y: top } };
}

/** One object per kind of handle, its copies in rows. */
export async function buildPrintedHandleObjects(handles: PrintedHandleCount[], wasmUrl?: string): Promise<PrintObject[]> {
  const objects: PrintObject[] = [];
  let rowY = 0;
  for (const { handle, quantity } of handles) {
    const { mesh, size } = await buildPrintedHandle(handle, wasmUrl);
    const placements = Array.from({ length: quantity }, (_, i) => ({ x: (i % PER_ROW) * (size.x + BED_SPACING), y: rowY + Math.floor(i / PER_ROW) * (size.y + BED_SPACING) }));
    rowY += Math.ceil(quantity / PER_ROW) * (size.y + BED_SPACING);
    objects.push({ name: handle.name, mesh, placements });
  }
  return objects;
}

export const printedHandlesFileName = (slug: string) => `${slug}-handles.3mf`;

/** All the job's printed handles as one 3MF file. */
export async function buildPrintedHandles3mf(handles: PrintedHandleCount[], wasmUrl?: string): Promise<Uint8Array> {
  return write3mf(await buildPrintedHandleObjects(handles, wasmUrl));
}
