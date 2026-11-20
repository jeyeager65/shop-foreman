/**
 * G-code for wooden handles on their own, with no project: so many of one
 * handle, on a machine of the shop.
 *
 * A job cuts a wooden handle as an extra part for every front that has it, on a blank of the handle's
 * own. So the handles alone are planned as the smallest job that asks for them: one cabinet with one
 * drawer front that has the handle, made as many times as handles are wanted. Only the files of the
 * handles' blanks are kept. They are posted as any job's are: the same probe and bit-change routine,
 * the bit the planner chooses for the cutout or one chosen on the page from those Plan would offer.
 */
import { addMaterialFromCatalog, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { filesByBlank } from '@/job/files';
import type { Handle, Id, ShopProfile } from '@/model';
import { createShopCabinetProject } from '@/samples/cabinet';
import type { JigFile } from './catalog';
import { storedCases } from '@/design/settings';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The Plan row that cuts the handles out of their blank. */
const HANDLE_CUTOUT = 'handles:cutout';

/** The smallest job that makes `quantity` of a wooden handle, on a machine of the shop, its cutout with `bitId` when given. */
function handleJob(handle: Handle, quantity: number, shop: ShopProfile, machineId: Id, bitId?: Id) {
  if (!handle.cnc) throw new Error(`${handle.name} is not cut on the CNC.`);
  const count = Math.max(1, Math.floor(quantity) || 1);
  const project = createShopCabinetProject('drawers', 1);
  project.slug = slug(handle.name);
  project.machineId = machineId;
  if (!addMaterialFromCatalog(project, shop.materialCatalog, handle.cnc.materialId) && !project.materials.some((m) => m.id === handle.cnc!.materialId)) {
    throw new Error(`${handle.name} is cut from a material the shop's catalog does not have.`);
  }
  if (project.context.kind === 'designedCabinet') storedCases(project.context)[0]!.quantity = count;
  for (const d of designsOf(project)) if (d.template === 'drawer') d.handle = { handleId: handle.id };
  // The bit chosen on the page, as a choice on Plan's row would be; one the row cannot use is left to the planner.
  if (bitId) project.plan.operations[HANDLE_CUTOUT] = { clearToolId: bitId };
  // The handle as the page has it, in place of the shop's own entry.
  const profile: ShopProfile = { ...shop, hardware: [...shop.hardware.filter((h) => h.id !== handle.id), handle] };
  return buildJob(project, profile);
}

/**
 * The bits that can cut a wooden handle out on a machine of the shop (what Plan's row would offer:
 * bits of the right kind with feeds for the handle's material), and the one the planner picks.
 */
export function woodHandleBits(handle: Handle, shop: ShopProfile, machineId: Id): { chosen?: Id; offered: { id: Id; name: string }[] } {
  const row = handleJob(handle, 1, shop, machineId).plan.operations.find((op) => op.key === HANDLE_CUTOUT);
  if (!row) return { offered: [] };
  return { chosen: row.clearToolId, offered: row.options.clearToolIds.map((id) => ({ id, name: shop.tools.find((t) => t.id === id)?.name ?? id })) };
}

/** The files that cut `quantity` of a wooden handle on a machine of the shop, one per blank and set-up; `bitId` cuts them out, the planner's choice without it. */
export function woodHandleFiles(handle: Handle, quantity: number, shop: ShopProfile, machineId: Id, bitId?: Id): JigFile[] {
  const job = handleJob(handle, quantity, shop, machineId, bitId);
  const blanks = filesByBlank(job).filter((b) => b.blank.partIds.length > 0 && b.blank.partIds.every((id) => id.endsWith('-handle')));
  if (blanks.length === 0) throw new Error(`No file was made for the ${handle.name}.`);
  return blanks.flatMap((b) =>
    b.files.map((f) => ({
      name: f.name,
      text: f.text,
      note: `${b.blank.label}: ${b.blank.partIds.length} of them on a blank ${Math.round(b.blank.size.width)} × ${Math.round(b.blank.size.height)} mm`,
    })),
  );
}
