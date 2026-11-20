/**
 * A drawer's front: a one-piece front sized like a door, the opening plus its
 * overlays. Its slide is `slides.ts` and its box `drawerBox.ts`.
 */
import type { DesignObject, DoorSetDesign, DrawerDesign, Hardware, Material, Mm, Opening, Part, Project } from '@/model';
import { bevelWidth, frontFeatures, isHinge } from './doors';
import { designsOf } from './frontSettings';
import { drawerHandleHoles, handleFor, routedDrawerPull } from './handles';
import { frontBorder } from './pattern';

/** Side overlay of a drawer front when it has none of its own and no doors to follow: 1/2". */
export const DEFAULT_FRONT_OVERLAY: Mm = 12.7;

export const isDoorSet = (d: DesignObject): d is DoorSetDesign => d.template === 'doorSet';
export const isDrawer = (d: DesignObject): d is DrawerDesign => d.template === 'drawer';

/** The project's first door set: the one the refacing screen, the hinge picker and the install view work on. */
export function doorSetOf(project: Project): DoorSetDesign {
  const doors = designsOf(project).find(isDoorSet);
  if (!doors) throw new Error('The project has no doors.');
  return doors;
}

/** `cabinet-1` from `cabinet-1/drawer`; the id itself for a measured opening. */
const cabinetIdOf = (openingId: string) => openingId.split('/')[0]!;

/** The door set on the same cabinet as the drawer, if there is one. */
export function doorsBeside(design: DrawerDesign, designs: DesignObject[]): DoorSetDesign | undefined {
  const cabinet = cabinetIdOf(design.mounting.openingId);
  return designs.filter(isDoorSet).find((d) => d.mounting.openingId !== design.mounting.openingId && cabinetIdOf(d.mounting.openingId) === cabinet);
}

/**
 * The front's side overlay and where it comes from: its own value, else the overlay
 * of the hinge on the cabinet's doors so the edges line up, else 1/2".
 */
export function drawerSideOverlay(design: DrawerDesign, designs: DesignObject[], hardware: Hardware[]): { overlay: Mm; from: 'own' | 'doors' | 'default'; doors?: Mm } {
  const beside = doorsBeside(design, designs);
  const hinge = hardware.filter(isHinge).find((h) => h.id === beside?.mounting.hingeId);
  const doors = beside?.mounting.overlaySide?.mm ?? hinge?.overlay.mm;
  const own = design.mounting.overlaySide?.mm;
  if (own !== undefined) return { overlay: own, from: 'own', doors };
  return doors !== undefined ? { overlay: doors, from: 'doors', doors } : { overlay: DEFAULT_FRONT_OVERLAY, from: 'default' };
}

export function drawerFrontSize(design: DrawerDesign, opening: Opening, sideOverlay: Mm): { width: Mm; height: Mm } {
  const m = design.mounting;
  return { width: opening.width.mm + 2 * sideOverlay, height: opening.height.mm + m.overlayTop.mm + m.overlayBottom.mm };
}

/** The drawer's parts: its front, with every feature placed. Derived; never stored. */
export function deriveDrawerParts(design: DrawerDesign, opening: Opening, sideOverlay: Mm, materials: Material[], hardware: Hardware[] = []): Part[] {
  const material = materials.find((m) => m.id === design.front.materialId);
  if (!material) throw new Error(`Material not found: ${design.front.materialId}`);
  const size = drawerFrontSize(design, opening, sideOverlay);
  if (size.width <= 0 || size.height <= 0) throw new Error('The drawer front has no size: check its overlays.');
  const style = design.front.style;
  if (style.kind === 'shaker') {
    const border = style.frameWidth.mm + (style.insideEdge.kind === 'vBevel' ? bevelWidth(style.insideEdge.angleDeg, style.recessDepth.mm) : 0);
    if (Math.min(size.width, size.height) - 2 * border <= 0) {
      throw new Error('The drawer front is too small for its frame width: there is no panel left. Narrow the frame or make the front a slab.');
    }
  }
  const thick = { ...size, thickness: material.measuredThickness.mm };
  const handle = design.handle ? handleFor(design.handle, hardware) : undefined;
  // The pull cut into the front itself, where its handle is one.
  const routed = handle && design.handle ? routedDrawerPull(handle, design.handle, thick, 'A', style.kind === 'shaker' ? style.frameWidth.mm : undefined, frontBorder(style)) : { bores: [] };
  return [
    {
      id: `${design.id}/front`,
      designObjectId: design.id,
      // One of several drawers says which it is: "Drawer 2 front".
      name: `${design.name || 'Drawer'} front`,
      materialId: material.id,
      size: { ...size, thickness: material.measuredThickness.mm },
      // Its handle's holes are bored from the front with the rest of its work: nothing else is on its back, and they alone would turn the sheet over.
      features: frontFeatures(design.front, size, [...(handle && design.handle ? drawerHandleHoles(handle, design.handle, thick, 'A', frontBorder(style)) : []), ...routed.bores], routed.outline),
    },
  ];
}
