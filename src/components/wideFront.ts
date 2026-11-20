import type { DoorStyle, DrawerFrontDesign, EdgeTreatment, ShopDrawerDesign } from '@/model';

/**
 * An inset drawer's wide front as the style fields edit a front (`FrontStyleFields`): its style, outside edge and
 * material, read from and written to the drawer's `shop` (`ShopDrawerDesign.style`, `outsideEdge`,
 * `frontMaterialId`). Left out, the style is a flat slab and the edge square, and nothing is stored until one is
 * chosen: a shop cabinet's settings stay as they are while they are only looked at. `holder`: Setup's drawer
 * settings, or a drawer; `fallbackMaterialId`: what the front is made of while it has no material of its own.
 */
export function wideFrontFields(holder: () => { shop?: ShopDrawerDesign }, fallbackMaterialId: () => string): DrawerFrontDesign {
  const write = (change: Partial<ShopDrawerDesign>) => {
    const next = { ...holder().shop, ...change };
    // A finger notch would cut a shaker front's top rail: the pull goes back to one fitted by hand, or a handle.
    if (next.style?.kind === 'shaker' && next.pull === 'fingerPull') delete next.pull;
    holder().shop = next;
  };
  /** The slab a wide front is while it has no style: a pattern given to it is its first stored style. */
  const plainSlab = (): DoorStyle => {
    const slab = { kind: 'slab' } as DoorStyle;
    Object.defineProperty(slab, 'pattern', {
      get: () => undefined,
      set: (pattern) => write({ style: pattern ? { kind: 'slab', pattern } : { kind: 'slab' } }),
      enumerable: false,
      configurable: true,
    });
    return slab;
  };
  return {
    get style(): DoorStyle {
      return holder().shop?.style ?? plainSlab();
    },
    set style(style: DoorStyle) {
      write({ style });
    },
    get outsideEdge(): EdgeTreatment {
      return holder().shop?.outsideEdge ?? { kind: 'square' };
    },
    set outsideEdge(outsideEdge: EdgeTreatment) {
      write({ outsideEdge });
    },
    get materialId(): string {
      return holder().shop?.frontMaterialId ?? fallbackMaterialId();
    },
    set materialId(frontMaterialId: string) {
      write({ frontMaterialId });
    },
  };
}
