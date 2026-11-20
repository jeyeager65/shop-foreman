/**
 * Tables: a frame piece added to a project, with what it is made of copied into the
 * project's materials.
 */
import { createFrame } from '@/design/frame';
import { addMaterialFromCatalog } from '@/design/materials';
import { topSettingsOf } from '@/design/tops';
import { SOLID_WOOD_3_4_ID } from '@/libraries';
import { SQUARE_2X2_ID } from '@/libraries/materials';
import type { Hardware, Id, Material, Project, StoredFrame } from '@/model';

type Shop = { hardware: Hardware[]; materialCatalog: Material[] };

/** The usual tables, each at a usual size (tune me): the top's length, the height to its surface, its width. */
export const TABLE_SIZES = {
  endTable: { width: '22"', height: '24"', depth: '22"' },
  coffeeTable: { width: '48"', height: '18"', depth: '24"' },
  sofaTable: { width: '54"', height: '30"', depth: '12"' },
  // A writing desk: a table at a desk's height, deep enough to work at.
  desk: { width: '48"', height: '30"', depth: '24"' },
  // A drop-leaf table: narrow with its leaves down, a leaf along each long side to open it out.
  dropLeaf: { width: '36"', height: '30"', depth: '20"' },
  // An assembly table: a torsion box on legs, at a bench's height.
  assembly: { width: '60"', height: '34"', depth: '30"' },
} as const;

/**
 * Adds a table to a project of pieces, after the others: legs of the square stock named (a 2x2 when none is),
 * aprons of the project's case material and a top of Setup's top material with a solid wood edge, each copied
 * into the project's materials when it lacks it.
 */
export function addTable(project: Project, shop: Shop, own: { name: string; size: { width: string; height: string; depth: string }; legMaterialId?: Id }): StoredFrame {
  if (project.context.kind !== 'designedCabinet') throw new Error('Not a project of pieces.');
  const context = project.context;
  // The legs' stock and the top: what the table says, else what Setup says a new one starts with, else a 2x2.
  const legMaterialId = own.legMaterialId ?? context.furniture?.legMaterialId ?? SQUARE_2X2_ID;
  for (const id of [legMaterialId, context.settings.materials.caseId, topSettingsOf(context).materialId, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, shop.materialCatalog, id);
  let n = 1;
  while (context.pieces.some((p) => p.id === `table-${n}`)) n++;
  const frame = createFrame(`table-${n}`, own.name, own.size, legMaterialId);
  if (context.furniture?.top) frame.top = JSON.parse(JSON.stringify(context.furniture.top)) as StoredFrame['top'];
  context.pieces.push(frame);
  // The stored one: the project may be Vue's reactive proxy.
  return context.pieces.find((p): p is StoredFrame => p.id === frame.id && p.kind === 'frame')!;
}
