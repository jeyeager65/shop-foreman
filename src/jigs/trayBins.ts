/**
 * Printed bins and dividers sized to a tray. A tray's inside is shared out in a grid
 * of open bins that stand side by side and lift out one at a time; or a printed divider, a thin wall on a
 * foot, is stuck across it. Both print as they stand, with no supports.
 *
 * The measurements are the tray's inside: between its walls, across and front to back (Design says them
 * for each tray under "Fitted out inside").
 */
import { type SolidMesh, loadManifold, meshOf } from '@/geometry/solids';
import type { Mm } from '@/model';
import type { PrintObject } from './threemf';

/** Sizes that do not come from the tray. Tune me: first guesses, not yet printed. */
export const TRAY_BIN = {
  /** Between a bin and its neighbour or the tray's wall, each side. */
  play: 0.4,
  floor: 1.2,
  /** The smallest bin worth printing, and the biggest most printers' beds take. */
  least: 30,
  most: 250,
};
export const TRAY_DIVIDER = {
  /** The foot it stands on: how wide, how thick. */
  foot: 16,
  footThickness: 1.2,
};

export interface TrayBins {
  /** The tray's inside, across and front to back. */
  width: Mm;
  depth: Mm;
  /** How many bins across and how many front to back. */
  columns: number;
  rows: number;
  /** How high the bins are: under the tray's walls. */
  height: Mm;
  wall: Mm;
}

/** One bin, outside. */
export function trayBinSize(b: TrayBins): { x: Mm; y: Mm; z: Mm } {
  return { x: b.width / Math.max(1, b.columns) - 2 * TRAY_BIN.play, y: b.depth / Math.max(1, b.rows) - 2 * TRAY_BIN.play, z: b.height };
}

export function trayBinProblems(b: TrayBins): string[] {
  if (!(b.width > 0 && b.depth > 0 && b.height > 0)) return ["Measure the tray's inside, across and front to back, and say how high the bins are."];
  const found: string[] = [];
  if (!(b.columns >= 1 && b.rows >= 1)) found.push('Ask for at least one bin each way.');
  const size = trayBinSize(b);
  if (Math.min(size.x, size.y) < TRAY_BIN.least) found.push(`The bins would be ${Math.round(Math.min(size.x, size.y))} mm across: ask for fewer.`);
  if (Math.max(size.x, size.y) > TRAY_BIN.most) found.push(`A bin would be ${Math.round(Math.max(size.x, size.y))} mm long, more than most printers' beds (${TRAY_BIN.most} mm): ask for more of them.`);
  if (!(b.wall >= 0.8 && b.wall <= 4)) found.push('The walls are between 0.8 and 4 mm thick.');
  if (b.height < 10 || b.height > 200) found.push('The bins are between 10 and 200 mm high.');
  return found;
}

/** One bin: an open box, its walls and floor of one piece. */
export async function buildTrayBin(b: TrayBins, wasmUrl?: string): Promise<SolidMesh> {
  const { Manifold } = await loadManifold(wasmUrl);
  const size = trayBinSize(b);
  const outer = Manifold.cube([size.x, size.y, size.z]);
  const hollow = Manifold.cube([size.x - 2 * b.wall, size.y - 2 * b.wall, size.z]);
  const moved = hollow.translate(b.wall, b.wall, TRAY_BIN.floor);
  const body = outer.subtract(moved);
  const mesh = meshOf(body);
  for (const s of [outer, hollow, moved, body]) s.delete();
  return mesh;
}

/** `quantity` bins on the bed, in rows. */
export async function buildTrayBinObjects(b: TrayBins, quantity: number, wasmUrl?: string): Promise<PrintObject[]> {
  const size = trayBinSize(b);
  const perRow = Math.max(1, Math.floor(TRAY_BIN.most / (size.x + 5)));
  const placements = Array.from({ length: Math.max(1, quantity) }, (_, i) => ({ x: (i % perRow) * (size.x + 5), y: Math.floor(i / perRow) * (size.y + 5) }));
  return [{ name: 'Tray bin', mesh: await buildTrayBin(b, wasmUrl), placements }];
}

export interface TrayDivider {
  /** As long as the tray is wide inside, or deep. */
  length: Mm;
  height: Mm;
  thickness: Mm;
}

export function trayDividerProblems(d: TrayDivider): string[] {
  if (!(d.length > 0 && d.height > 0 && d.thickness > 0)) return ["Say how long the divider is (the tray's inside, across or front to back), how high and how thick."];
  const found: string[] = [];
  if (d.length > TRAY_BIN.most) found.push(`It is ${Math.round(d.length)} mm long, more than most printers' beds (${TRAY_BIN.most} mm): print it in two halves of ${Math.round(d.length / 2)} mm.`);
  if (d.thickness < 1.2 || d.thickness > 6) found.push('It is between 1.2 and 6 mm thick.');
  if (d.height < 10 || d.height > 200) found.push('It is between 10 and 200 mm high.');
  return found;
}

/** A divider: a thin wall standing on a foot, a hair shorter than the tray so it drops in. */
export async function buildTrayDivider(d: TrayDivider, wasmUrl?: string): Promise<SolidMesh> {
  const { Manifold } = await loadManifold(wasmUrl);
  const length = d.length - 2 * TRAY_BIN.play;
  const foot = Manifold.cube([length, TRAY_DIVIDER.foot, TRAY_DIVIDER.footThickness]);
  const wall = Manifold.cube([length, d.thickness, d.height]);
  const moved = wall.translate(0, (TRAY_DIVIDER.foot - d.thickness) / 2, 0);
  const body = Manifold.union([foot, moved]);
  const mesh = meshOf(body);
  for (const s of [foot, wall, moved, body]) s.delete();
  return mesh;
}
