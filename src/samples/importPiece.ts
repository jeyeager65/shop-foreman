/**
 * A piece from another project. Single pieces: a cabinet with its fronts, or a table. It is a copy:
 * nothing links the two projects afterwards.
 *
 * It comes **in this project's style**, where only its shape comes across (its size, its rows and bays, what
 * stands inside it) and it follows this project's Setup like any piece made here; or **as it was**, where
 * everything that it was made of and how it was built comes with it as its own differences. Materials it names
 * that this project lacks are copied in.
 */
import { frameMaterials } from '@/design/frame';
import { cabinetsOf, storedCases } from '@/design/settings';
import type { CabinetSettings, DesignedCabinetContext, Id, Material, Project, StoredCabinet, StoredDesignObject, StoredFrame, StoredPiece } from '@/model';

export type ImportHow = 'style' | 'asWas';

/** A plain copy: either project may be Vue's reactive proxy, which structuredClone refuses. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const contextOf = (project: Project): DesignedCabinetContext => {
  if (project.context.kind !== 'designedCabinet') throw new Error('Not a project of pieces.');
  return project.context;
};

/** The pieces of a project that can be brought into another: every one, named, with its kind and its size. */
export function importablePieces(from: Project): { id: Id; name: string; kind: StoredPiece['kind']; size: StoredPiece['size'] }[] {
  if (from.context.kind !== 'designedCabinet') return [];
  const resolved = new Map(cabinetsOf(from).map((c) => [c.id, c.size]));
  return from.context.pieces.map((p) => ({ id: p.id, name: p.name || (p.kind === 'frame' ? 'Table' : 'Cabinet'), kind: p.kind, size: resolved.get(p.id) ?? p.size }));
}

/** Brings a material into the project when it lacks it, from the project the piece came from. */
function bring(into: Project, from: Project, ids: (Id | undefined)[]) {
  for (const id of ids) {
    if (!id || into.materials.some((m) => m.id === id)) continue;
    const material = from.materials.find((m: Material) => m.id === id);
    if (material) into.materials.push(plain(material));
  }
}

const freeId = (pieces: { id: Id }[], stem: string) => {
  for (let n = 1; ; n++) if (!pieces.some((p) => p.id === `${stem}-${n}`)) return `${stem}-${n}`;
};
const freeName = (pieces: { name: string }[], name: string) => {
  if (!pieces.some((p) => p.name === name)) return name;
  for (let n = 2; ; n++) if (!pieces.some((p) => p.name === `${name} ${n}`)) return `${name} ${n}`;
};

/**
 * Copies a piece of `from` into `into`, after its pieces, and returns the copy's id. A cabinet comes with every
 * front it has, under new ids; it stands on its own (not in a run, with no place in a room and on no other
 * piece: those were the other project's).
 */
export function importPiece(into: Project, from: Project, pieceId: Id, how: ImportHow): { id: Id } {
  const target = contextOf(into);
  const source = contextOf(from);
  const piece = source.pieces.find((p) => p.id === pieceId);
  if (!piece) throw new Error(`Piece not found: ${pieceId}`);
  const name = freeName(target.pieces, piece.name);

  if (piece.kind === 'frame') {
    const made = frameMaterials(piece, source);
    const copy: StoredFrame = { ...plain(piece), id: freeId(target.pieces, 'table'), name };
    delete copy.placement;
    if (how === 'style') {
      // Only its shape: its aprons and its top are this project's materials. Its legs' stock is its shape's.
      delete copy.aprons.materialId;
      delete copy.top.materialId;
      bring(into, from, [copy.legs.materialId, copy.shelf?.materialId]);
    } else {
      // As it was: what it was made of becomes its own.
      copy.aprons.materialId = made.apronId;
      copy.top.materialId = made.topId;
      bring(into, from, [made.legId, made.apronId, made.topId, made.shelfId]);
    }
    target.pieces.push(copy);
    return { id: copy.id };
  }

  const resolved = cabinetsOf(from).find((c) => c.id === piece.id)!;
  const id = freeId(target.pieces, 'cabinet');
  const copy: StoredCabinet = { ...plain(piece), id, name };
  // Where it stood was the other project's: its run (whose depth, height and bottom it had), its room, what it stood on.
  copy.size = plain(resolved.size);
  copy.sides = { left: 'exposed', right: 'exposed' };
  copy.quantity = Math.max(1, Math.floor(Number(piece.quantity)) || 1);
  delete copy.placement;
  delete copy.onTop;
  if (how === 'style') delete copy.overrides;
  else {
    // As it was: its whole construction comes with it, as its own; where it is the same as this project's it differs in nothing.
    const settings: CabinetSettings = { ...plain(source.settings), ...plain(piece.overrides ?? {}), toeKick: plain(resolved.toeKick) };
    copy.overrides = settings;
    const m = settings.materials;
    bring(into, from, [m.caseId, m.backId, settings.faceFrame.materialId, settings.toeKick.legs?.materialId]);
  }
  bring(into, from, [copy.top?.own?.materialId]);
  target.pieces.push(copy);

  // Its fronts, the ones waiting for a row its layout no longer has as well.
  for (const front of from.designObjects.filter((d) => d.mounting.openingId.startsWith(`${piece.id}/`))) {
    const stem = front.template === 'doorSet' ? 'doors' : 'drawer';
    const made = plain(front) as StoredDesignObject;
    made.id = freeId(into.designObjects, stem);
    made.mounting = { ...made.mounting, openingId: `${id}/${front.mounting.openingId.slice(piece.id.length + 1)}` } as typeof made.mounting;
    const stored = made as { overrides?: unknown };
    if (how === 'style') delete stored.overrides;
    else if (!stored.overrides) stored.overrides = plain(front.template === 'doorSet' ? source.fronts.doors : source.fronts.drawers);
    const own = stored.overrides as { materialId?: Id; front?: { materialId?: Id }; materials?: { boxId?: Id; bottomId?: Id }; shop?: { materialId?: Id } } | undefined;
    bring(into, from, [own?.materialId, own?.front?.materialId, own?.materials?.boxId, own?.materials?.bottomId, own?.shop?.materialId]);
    into.designObjects.push(made);
  }
  // What the fronts and the boxes are made of in this project's style is already in it.
  void storedCases;
  return { id };
}
