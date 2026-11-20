/**
 * The holes the hardware needs in the case sides, placed from each piece of
 * hardware's data: the mounting-plate holes of hinges that mount on the case side,
 * pilot holes for the screws of a drawer slide that has hole data, and the rows of
 * shelf-pin holes. All are `hole` features on the inside face (A) of a side; the
 * feature's id says which it is: `hinge-plate-...`, `slide-screw-...`,
 * `shelf-pin-front-N`, `shelf-pin-rear-N`.
 *
 * A slide on build-out strips gets its pilot holes in the strips (`drawerBox.ts`),
 * and one on rear brackets gets none. Hinges on a face frame screw to the edge of
 * the frame by hand.
 *
 * Shelf-pin rows run up the space behind the doors. A level (the four holes at one
 * height) is left out whole when any of its holes would come under a hinge plate, or
 * too close to another hole or to a pocket hole in the same face, so every level
 * that is drilled can carry a shelf.
 */
import type { CabinetDesign, CabinetOpening, Feature, Hardware, Material, Mm, Part, Point, Project, ShelfPin, Shop } from '@/model';
import { MM_PER_INCH } from '@/units';
import { insideDepth, rearClear, shelfSpaces } from './case';
import { doorSize, hingeFor, hingeHeights } from './doors';
import { drawerBox } from './drawerBox';
import { isDoorSet, isDrawer } from './drawers';
import { designsOf } from './frontSettings';
import { asOpening, deriveCabinetOpenings } from './openings';
import { SLIDE_PILOT_DEPTH, SLIDE_PILOT_DIAMETER, slideHoles } from './slides';
import { constructionRules, hang, thicknessOf } from './style';
import { bayCount } from './bays';
import { onTabSlot } from './tabs';

/** From the bottom and the top of the space behind the doors to the first and last shelf-pin hole. Tune me. */
export const SHELF_PIN_END_MARGIN: Mm = 3 * MM_PER_INCH;
/** The least wood left between two holes, and between a hole and a pocket hole. Tune me. */
export const HOLE_WEB: Mm = 3;
/**
 * What a hinge's mounting plate covers of the side: this far above and below its two
 * holes, and this far either side of their line. No shelf-pin hole goes under it. Tune me.
 */
export const PLATE_COVERS = { beyondHoles: 10, eitherSide: 25 };
/** The least left under a blind hole in a case side. */
const MIN_UNDER_HOLE: Mm = 3;
/**
 * What a pocket hole takes up of the face it is drilled in: how far it reaches in
 * from the edge the screw leaves through, and half its width. Roughly a Kreg pocket
 * in 3/4" stock; tune me.
 */
const POCKET_FOOTPRINT = { reach: 60, halfWidth: 5 };

type Side = 'left' | 'right';
const SIDES: Side[] = ['left', 'right'];

export const isShelfPin = (h: Hardware): h is ShelfPin => h.kind === 'shelfPin';

/** The cabinet's shelf pin: the one it names, or the generic one when the library no longer has it. */
export function shelfPinFor(cabinet: CabinetDesign, hardware: Hardware[]): ShelfPin {
  const pins = hardware.filter(isShelfPin);
  const pin = pins.find((p) => p.id === cabinet.shelfPinId) ?? pins.find((p) => p.generic);
  if (!pin) throw new Error('The shop profile has no shelf pin.');
  return pin;
}

/**
 * The heights off the floor of the shelf-pin holes, before any is left out: up the
 * space behind the doors, a margin short of its bottom and top, centred in it. They
 * stop below a nailer, which covers the rear of the sides. None without shelves.
 */
export function shelfPinLevels(cabinet: CabinetDesign, materials: Material[], pin: ShelfPin): Mm[] {
  // Behind every door row that has shelves, the lowest first.
  const spaces = shelfSpaces(cabinet, materials).filter((s) => s.count >= 1).reverse();
  if (spaces.length === 0) return [];
  if (!(pin.rows.spacing > 0)) throw new Error(`The shelf pin has no hole spacing: ${pin.name}`);
  // The rear row stops short of what stands against the back: a nailer, or a wall cabinet's hanging rails.
  const clear = rearClear(cabinet, thicknessOf(materials, cabinet.materials.caseId));
  return spaces.flatMap((space) => {
    const top = Math.min(space.top, clear.top);
    const from = Math.max(space.bottom, clear.bottom) + SHELF_PIN_END_MARGIN;
    const to = top - SHELF_PIN_END_MARGIN;
    if (to < from) return [];
    const count = Math.floor((to - from) / pin.rows.spacing + 1e-9) + 1;
    const first = (from + to - (count - 1) * pin.rows.spacing) / 2;
    return Array.from({ length: count }, (_, i) => first + i * pin.rows.spacing);
  });
}

/** Whether a hole of radius `r` at `at` on the part's face A comes too close to something already in that face. */
function crowded(part: Part, features: Feature[], at: Point, r: Mm): boolean {
  return features.some((f) => {
    if (f.face !== 'A') return false;
    if (f.kind === 'hole' || f.kind === 'cup') return Math.hypot(f.center.x - at.x, f.center.y - at.y) < r + f.diameter / 2 + HOLE_WEB;
    if (f.kind === 'pocketHole') {
      const fromEdge = { x0: at.x, x1: part.size.width - at.x, y0: at.y, y1: part.size.height - at.y }[f.edge];
      const along = f.edge === 'x0' || f.edge === 'x1' ? at.y : at.x;
      return fromEdge < POCKET_FOOTPRINT.reach + r && Math.abs(along - f.at) < POCKET_FOOTPRINT.halfWidth + r + HOLE_WEB;
    }
    return false;
  });
}

/**
 * The cabinet's case parts with the hardware's holes added to the two sides. `parts`
 * are the case parts of `cabinet`; the doors and drawers are the project's, as they
 * hang on the cabinet's openings.
 */
export function withHardwareHoles(parts: Part[], cabinet: CabinetDesign, project: Project, shop: Pick<Shop, 'materials' | 'hardware'>): Part[] {
  const side = { left: parts.find((p) => p.id === `${cabinet.id}/side-left`), right: parts.find((p) => p.id === `${cabinet.id}/side-right`) };
  if (!side.left || !side.right) return parts;
  const rules = constructionRules(cabinet, shop.materials);
  const openings = deriveCabinetOpenings(cabinet, shop.materials);
  const t = thicknessOf(shop.materials, cabinet.materials.caseId);
  const added: Record<Side, Feature[]> = { left: [], right: [] };
  /** What the hinge plates cover of each side: a line behind the case front, and a span off the floor. */
  const plates: Record<Side, { behind: Mm; from: Mm; to: Mm }[]> = { left: [], right: [] };

  /**
   * A point on a side's inside face, `behind` the case front and `y` off the floor.
   * Looking at the inside face, the left side's front edge is at x = 0 and the right
   * side's at x = its width; a banded front edge is cut back by the band.
   */
  const at = (which: Side, behind: Mm, y: Mm): Point => {
    const part = side[which]!;
    const x = behind - (part.banding?.thickness ?? 0);
    return { x: which === 'left' ? x : part.size.width - x, y };
  };
  const blind = (depth: Mm, what: string): Mm => {
    if (depth > t - MIN_UNDER_HOLE + 1e-6) throw new Error(`The case material is too thin for the ${what} holes.`);
    return depth;
  };
  /** How far a hole's rim is behind the side's own front edge, which a band or an edge strip stands in front of. */
  const band = side.left.banding?.thickness ?? 0;
  const inSide = (behind: Mm, diameter: Mm) => behind - band - diameter / 2;
  const hole = (which: Side, id: string, behind: Mm, y: Mm, diameter: Mm, depth: Mm, what?: string) => {
    // A hole may not land in an edge strip, or so close behind it that the side's cut edge breaks out.
    if (band > 0 && what && inSide(behind, diameter) < HOLE_WEB - 1e-6)
      throw new Error(`The edge strip is too thick for the ${what}: a hole ${Math.round(behind * 10) / 10} mm behind the case front would be in the strip or at the edge of the side behind it. Make the strip thinner.`);
    // Nor on a slot for a tab (a case on tab-and-slot joints): a hinge plate cannot do without its hole, a slide can.
    if (onTabSlot(side[which]!.features, at(which, behind, y), diameter / 2, HOLE_WEB)) {
      if (what === 'hinge plates') throw new Error(`A hinge plate's hole would land on a slot for a tab in the ${which} side, ${Math.round(y)} mm off the floor: move the hinge, or give the part whose tab it is another joint.`);
      return;
    }
    added[which].push({ id, kind: 'hole', face: 'A', center: at(which, behind, y), diameter, depth });
  };
  /** Which of an opening's edges is a case side (with bays, the others are partitions or mullions). */
  const bays = bayCount(cabinet);
  const onSide = (opening: CabinetOpening, which: Side) => (which === 'left' ? (opening.bay ?? 1) === 1 : (opening.bay ?? 1) === bays);

  // Hinge mounting plates: two holes per hinge, on a line set back from the front
  // edge, centred on the hinge. The hinge heights are the door's, from its cups.
  if (rules.hingeMount === 'sidePlate') {
    for (const opening of openings) {
      for (const stored of designsOf(project).filter(isDoorSet).filter((d) => d.mounting.openingId === opening.id)) {
        const doors = hang(stored, opening);
        const hinge = hingeFor(doors.mounting, opening.construction, shop.hardware);
        if (!hinge.plate) continue;
        // An inset hinge's plate line is measured from the back of the closed door.
        const plate = opening.inset ? { ...hinge.plate, setback: hinge.plate.setback + thicknessOf(shop.materials, doors.materialId) } : hinge.plate;
        const depth = blind(plate.hole.depth, 'hinge plate');
        const doorBottom = opening.origin.y - doors.mounting.overlayBottom.mm;
        const heights = hingeHeights(hinge, doorSize(doors, asOpening(opening), hinge).height);
        for (const which of (doors.mounting.doors === 2 ? SIDES : [doors.mounting.hingeSide ?? 'left']).filter((w) => onSide(opening, w))) {
          heights.forEach((h, i) => {
            const y = doorBottom + h;
            [-1, 1].forEach((sign, j) => hole(which, `hinge-plate-${doors.id}-${i + 1}-${j + 1}`, plate.setback, y + (sign * plate.spacing) / 2, plate.hole.diameter, depth, 'hinge plates'));
            const reach = plate.spacing / 2 + PLATE_COVERS.beyondHoles;
            plates[which].push({ behind: plate.setback, from: y - reach, to: y + reach });
          });
        }
      }
    }
  }

  // Slide screws: pilot holes along the slide's centre line where the slide sits on
  // the case sides and its entry has hole data. A box that cannot be made has no slide to place.
  for (const drawer of designsOf(project).filter(isDrawer).filter((d) => openings.some((o) => o.id === d.mounting.openingId))) {
    let box: ReturnType<typeof drawerBox>;
    try {
      box = drawerBox(drawer, project, shop);
    } catch {
      continue;
    }
    const screws = box?.mount === 'case' && box.slide ? slideHoles(box.slide) : undefined;
    if (!box || !screws) continue;
    const depth = Math.min(SLIDE_PILOT_DEPTH, t - MIN_UNDER_HOLE);
    const opening = openings.find((o) => o.id === drawer.mounting.openingId)!;
    screws.forEach((fromFront, i) => {
      const behind = fromFront - box.slideAt.front;
      // A screw hole of the slide that would be in the case's edge strip, or at the edge behind it, is left out.
      if (behind < SLIDE_PILOT_DIAMETER / 2 || (band > 0 && inSide(behind, SLIDE_PILOT_DIAMETER) < HOLE_WEB - 1e-6)) return;
      for (const which of SIDES.filter((w) => onSide(opening, w))) hole(which, `slide-screw-${drawer.id}-${i + 1}`, behind, box.slideAt.y, SLIDE_PILOT_DIAMETER, depth);
    });
  }

  // Shelf pins: a front and a rear row up each side, the same levels on both.
  if (shelfSpaces(cabinet, shop.materials).some((s) => s.count >= 1)) {
    const pin = shelfPinFor(cabinet, shop.hardware);
    const depth = blind(pin.hole.depth, 'shelf-pin');
    const rows = [
      { key: 'front', behind: pin.rows.frontSetback },
      { key: 'rear', behind: insideDepth(cabinet, shop.materials) - pin.rows.rearSetback },
    ];
    if (rows[1]!.behind - rows[0]!.behind < pin.hole.diameter + HOLE_WEB) throw new Error('The cabinet is too shallow for two rows of shelf-pin holes.');
    const r = pin.hole.diameter / 2;
    const covered = (which: Side, behind: Mm, y: Mm) => plates[which].some((p) => Math.abs(p.behind - behind) < PLATE_COVERS.eitherSide && y > p.from - r && y < p.to + r);
    const clear = (y: Mm) =>
      SIDES.every((which) =>
        rows.every((row) => !covered(which, row.behind, y) && !onTabSlot(side[which]!.features, at(which, row.behind, y), r, HOLE_WEB) && !crowded(side[which]!, [...side[which]!.features, ...added[which]], at(which, row.behind, y), r)),
      );
    shelfPinLevels(cabinet, shop.materials, pin)
      .filter(clear)
      .forEach((y, i) => {
        for (const which of SIDES) for (const row of rows) hole(which, `shelf-pin-${row.key}-${i + 1}`, row.behind, y, pin.hole.diameter, depth, 'shelf pins');
      });
  }

  return parts.map((p) => (p === side.left ? { ...p, features: [...p.features, ...added.left] } : p === side.right ? { ...p, features: [...p.features, ...added.right] } : p));
}
