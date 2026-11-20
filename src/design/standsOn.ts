/**
 * One piece standing on another: a hutch, a wall-form case, on a desk's top.
 */
import type { CabinetDesign, DesignedCabinetContext, Hardware, Id, Material, Mm, Project, StoredPiece } from '@/model';
import { boxOffFloor } from './casters';
import { cabinetsOf, piecesOf, storedCases } from './settings';
import { thicknessOf } from './style';
import { ownTopThickness, topSettingsOf } from './tops';

/** How high a piece's top surface is off the floor: a table's height; a case's box, what it stands on and the top over it. */
export function topHeightOf(project: Project, piece: StoredPiece, materials: Material[], hardware: Hardware[]): Mm {
  if (piece.kind === 'frame') return piece.size.height.mm;
  const cabinet = cabinetsOf(project).find((c) => c.id === piece.id);
  if (!cabinet || project.context.kind !== 'designedCabinet') return piece.size.height.mm;
  const settings = topSettingsOf(project.context);
  const over = cabinet.top?.own
    ? ownTopThickness(cabinet.top.own, settings, materials)
    : cabinet.top || (cabinet.runId && project.context.runs.find((r) => r.id === cabinet.runId)?.top)
      ? thicknessOf(materials, settings.materialId) * settings.layers
      : 0;
  return (boxOffFloor(cabinet, materials, hardware) ?? 0) + cabinet.size.height.mm + over;
}

/** The pieces a wall-form case may stand on: every piece that stands on the floor. */
export function standablePieces(project: Project, hutchId: Id): StoredPiece[] {
  return piecesOf(project).filter((p) => p.id !== hutchId && (p.kind === 'frame' || (p.form !== 'wall' && !p.existing)));
}

/**
 * Stands a wall-form case on another piece's top, or hangs it on the wall again (`underId` left out). Standing,
 * its bottom is at that top's height as it is now.
 */
export function standOn(project: Project, hutchId: Id, underId: Id | undefined, materials: Material[], hardware: Hardware[]): void {
  if (project.context.kind !== 'designedCabinet') return;
  const hutch = storedCases(project.context).find((c) => c.id === hutchId);
  if (!hutch || hutch.form !== 'wall') throw new Error('Only a wall cabinet can stand on another piece.');
  const under = underId ? standablePieces(project, hutchId).find((p) => p.id === underId) : undefined;
  if (!under) return void delete hutch.onTop;
  hutch.onTop = { of: under.id };
  hutch.offFloor = { mm: topHeightOf(project, under, materials, hardware), unit: 'in' };
}

/** Where a piece that stands on another is, in the under piece's frame: its left end in line, its back at the back. */
export function onTopOffset(hutch: Pick<CabinetDesign, 'size'>, under: Pick<StoredPiece, 'size'>): [Mm, Mm, Mm] {
  return [0, 0, -(under.size.depth.mm - hutch.size.depth.mm)];
}

/** The piece a case stands on, when it does and that piece is still in the project. */
export function underOf(context: Pick<DesignedCabinetContext, 'pieces'>, cabinet: Pick<CabinetDesign, 'onTop' | 'form'>): StoredPiece | undefined {
  return cabinet.form === 'wall' && cabinet.onTop ? context.pieces.find((p) => p.id === cabinet.onTop!.of) : undefined;
}
