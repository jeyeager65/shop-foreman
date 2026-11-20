/**
 * The slide a drawer runs on: which one, and at what length. The slide is a spec in
 * the hardware library; the drawer stores which slide and, when the user picks one,
 * a length. Left alone it takes the longest length the cabinet has room for.
 *
 * Room is measured from the front the slide starts at (the case front, or the front
 * of a face frame, where the slide sits on build-out strips) back to the back, or to
 * the nailer when the drawer opening reaches up to it. The box that hangs on the
 * slide is `drawerBox.ts`; the slide's pilot holes in the case sides are `hardwareHoles.ts`.
 */
import type { CabinetDesign, CabinetOpening, DoorStyle, DrawerDesign, EdgeTreatment, Hardware, Length, Material, Mm, Project, Shop, ShopDrawerDesign, Slide } from '@/model';
import { MM_PER_INCH } from '@/units';
import { clearDepth } from './case';
import { cabinetOpeningsOf } from './openings';
import { cabinetsOf } from './settings';
import { thicknessOf } from './style';

export const isSlide = (h: Hardware): h is Slide => h.kind === 'slide';

/** The drawer's slide: the one it names, or the generic one when the library no longer has it. */
export function slideFor(design: DrawerDesign, hardware: Hardware[]): Slide {
  const slides = hardware.filter(isSlide);
  const slide = slides.find((s) => s.id === design.slide.slideId) ?? slides.find((s) => s.generic);
  if (!slide) throw new Error('The shop profile has no drawer slide.');
  return slide;
}

/**
 * How a drawer's front is made. Applied: a separate front fastened to the box (face
 * frame and frameless). In a shop-style cabinet the box's own front wall is the
 * front: wide, the plain box, or a box on wooden runners with no slides at all.
 */
export function drawerFrontKind(design: DrawerDesign, opening: CabinetOpening): 'applied' | 'wide' | 'plain' | 'runners' {
  // A false front has no box: on an inset case it is a front of its own, as an applied one is.
  if (!opening.inset || (design.falseFront && opening.overDoors)) return 'applied';
  // Inset, a front of its own is a choice beside the three where the box's front wall is the front.
  return design.shop?.front === 'plain' || design.shop?.front === 'runners' || design.shop?.front === 'applied' ? design.shop.front : 'wide';
}

/** What a shop drawer's wide front is made of: its own material, else the cabinet's case material. */
export function wideFrontMaterialId(design: DrawerDesign, opening: CabinetOpening): string {
  return design.shop?.frontMaterialId ?? opening.inset?.frontMaterialId ?? design.box.materials.boxId;
}

/** A wide front's style and outside edge: its own, else a flat slab with square edges. */
export function wideFrontFace(shop: ShopDrawerDesign | undefined): { style: DoorStyle; outsideEdge: EdgeTreatment } {
  return { style: shop?.style ?? { kind: 'slab' }, outsideEdge: shop?.outsideEdge ?? { kind: 'square' } };
}

/**
 * Whether a wide front has work on its outside face: a shaker frame, a pattern or an eased edge. It is then cut as a
 * front (its show face is its face A, the dados for the box on its back) and the sheet is flipped for it; a plain
 * one is a part of the box, cut from its inside face alone.
 */
export function wideFrontDecorated(shop: ShopDrawerDesign | undefined): boolean {
  const { style, outsideEdge } = wideFrontFace(shop);
  return style.kind === 'shaker' || !!style.pattern || outsideEdge.kind !== 'square';
}

/**
 * How far behind the case front a drawer's slides start: nothing where the box
 * comes to the case front; behind a wide front, or an applied front that is inset, that front's thickness.
 */
export function insetFrontDepth(design: DrawerDesign, opening: CabinetOpening, materials: Material[]): Mm {
  // Between corner posts the front is inside the frame, its face flush with it: the box starts behind the front.
  if (opening.inFrame) return thicknessOf(materials, design.front.materialId);
  const kind = drawerFrontKind(design, opening);
  // An applied front inset in a case's opening: the box starts behind it, as between posts.
  if (kind === 'applied') return opening.inset ? thicknessOf(materials, design.front.materialId) : 0;
  return kind === 'wide' ? thicknessOf(materials, wideFrontMaterialId(design, opening)) : 0;
}

/** Clear depth for a slide on this drawer opening, from where the slide starts (`behind` the case front when inset) to what stops it. */
export function slideRoom(cabinet: CabinetDesign, opening: CabinetOpening, materials: Material[], behind: Mm = 0): Mm {
  return opening.frontPlane - behind + clearDepth(cabinet, materials, opening.origin.y + opening.height);
}

/** How a slide mounts, in words, for a line about it: "Side mount", "Bottom mount (the box stands on its drawer members)". */
export const slideMountWords = (slide: Slide): string => (slide.mount === 'bottom' ? 'Bottom mount (the box stands on its drawer members)' : 'Side mount');

/**
 * The centre line of a slide's cabinet member, up from the underside of a box `height` tall: half way up the box
 * for a side-mount slide; for a bottom-mount one the member's lower edge is level with the box's (tune me).
 */
export const slideCentreUp = (slide: Slide, height: Mm): Mm => (slide.mount === 'bottom' ? Math.min(slide.memberHeight, height) / 2 : height / 2);

export interface SlideFit {
  slide: Slide;
  /** Clear depth the cabinet has for it. */
  room: Mm;
  /** The length in use: the drawer's own when the slide comes in it, else the longest that fits. */
  length: Length;
  from: 'chosen' | 'longest';
  /** False when the length in use needs more depth than the cabinet has. */
  fits: boolean;
  /** Every length the slide comes in, and whether the cabinet has room for it. */
  options: { length: Length; fits: boolean }[];
}

const same = (a: Length, b: Length) => Math.abs(a.mm - b.mm) < 0.01;

/** Pilot hole for a slide's mounting screws: a 1/16" bit. Tune me. */
export const SLIDE_PILOT_DIAMETER: Mm = MM_PER_INCH / 16;
/** How deep the pilot holes go. Tune me. */
export const SLIDE_PILOT_DEPTH: Mm = 10;

/**
 * The cabinet member's screw holes at the length in use, measured from the slide's
 * front end. Nothing when the slide has no hole data for that length: it is then
 * positioned and screwed on by hand.
 */
export function slideHoles(fit: SlideFit): Mm[] | undefined {
  const holes = fit.slide.holes?.find((h) => same(h.length, fit.length))?.fromFront;
  return holes?.length ? holes : undefined;
}

export function slideFit(design: DrawerDesign, slide: Slide, room: Mm): SlideFit {
  if (!slide.lengths.length) throw new Error(`The slide has no lengths: ${slide.name}`);
  const options = slide.lengths.map((length) => ({ length, fits: length.mm + slide.rearClearance <= room + 1e-6 }));
  const own = design.slide.length;
  const chosen = own && options.find((o) => same(o.length, own));
  // Nothing fits: the shortest is the nearest miss, and `fits` says so.
  const pick = chosen ?? options.filter((o) => o.fits).at(-1) ?? options[0]!;
  return { slide, room, length: pick.length, from: chosen ? 'chosen' : 'longest', fits: pick.fits, options };
}

/** The slide of a drawer on a designed cabinet, at its length. */
export function drawerSlide(design: DrawerDesign, project: Project, shop: Pick<Shop, 'materials' | 'hardware'>): SlideFit {
  const opening = cabinetOpeningsOf(project, shop.materials).find((o) => o.id === design.mounting.openingId);
  const cabinet = cabinetsOf(project).find((c) => c.id === opening?.cabinetId);
  if (!opening || !cabinet) throw new Error(`The drawer is not on a designed cabinet: ${design.mounting.openingId}`);
  return slideFit(design, slideFor(design, shop.hardware), slideRoom(cabinet, opening, shop.materials, insetFrontDepth(design, opening, shop.materials)));
}

/** Puts the drawer on a slide. A length the new slide does not come in goes back to "longest that fits". */
export function chooseSlide(design: DrawerDesign, slide: Slide): void {
  const own = design.slide.length;
  design.slide.slideId = slide.id;
  if (!own || !slide.lengths.some((l) => same(l, own))) delete design.slide.length;
}
