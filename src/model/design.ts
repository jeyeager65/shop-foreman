import type { Id } from './project';
import type { Length } from './units';
import type { TabSize } from './cabinet';

/**
 * Everything that mounts on an opening, with every value in place. Told apart by
 * `template`. A refacing project stores them like this; a project of designed
 * cabinets stores `StoredDoorSet` and `StoredDrawer`, and `designsOf`
 * (`design/frontSettings.ts`) resolves those to this shape.
 */
export type DesignObject = DoorSetDesign | DrawerDesign;

/** What a project keeps in `designObjects`. Read them through `designsOf`. */
export type StoredDesignObject = DesignObject | StoredDoorSet | StoredDrawer;

/** The fields of a door set's mounting that are settings: which hinge, per construction style. */
export type DoorHingeKey = 'hingeId' | 'framelessHingeId' | 'shopHingeId';

/**
 * Stored once for a project of designed cabinets: how its doors look and what they
 * hang on. A door set follows these unless it has its own under `overrides`.
 */
export interface DoorSettings extends DrawerFrontDesign, Pick<DoorMounting, DoorHingeKey> {
  shop?: DrawerFrontDesign;
  shopPull?: PullChoice;
  handle?: DoorHandleChoice;
}

/**
 * The handle on a door: a knob or a pull from the hardware library, upright near the
 * edge the door opens at. `fromEdge`: its line in from that edge; left out, the middle
 * of a shaker door's stile, and 1-1/2" on a slab door. `fromEnd`: its
 * nearest hole from the door's end, the top on a base or tall cabinet and the bottom
 * on a wall cabinet (and on the upper doors of a tall one).
 */
export interface DoorHandleChoice {
  handleId: Id;
  fromEdge?: Length;
  fromEnd: Length;
  /**
   * Set: the handle's line is in the middle of the front's border, whatever `fromEdge` says, as suits a
   * patterned door: the margin a slab's pattern
   * stops at, a shaker door's stile. A plain slab has no border and goes by `fromEdge`.
   */
  inMargin?: boolean;
}

/** The handle on a drawer front: level, centred across it. `fromTop`: its line below the front's top; left out, half-way up. */
export interface DrawerHandleChoice {
  handleId: Id;
  fromTop?: Length;
  /** Set: the handle is in the middle of the front's top border, whatever `fromTop` says: a slab's pattern's margin, a shaker front's top rail. */
  inMargin?: boolean;
  /** Two knobs on a wide drawer: a front at least `TWO_KNOBS_FROM` wide gets two, a quarter in from each end. A pull, and a narrower front, is one as ever. */
  two?: boolean;
}

/** The same for drawers: the front, the slide, and how the box is made. */
export interface DrawerSettings {
  front: DrawerFrontDesign;
  shop?: ShopDrawerDesign;
  handle?: DrawerHandleChoice;
  slideId: Id;
  faceFrameMount: FaceFrameSlideMount;
  cornerJoint: BoxCornerJoint;
  /** With `tabs` corners: the fingers' size. Left out: as a case's tabs. */
  fingers?: TabSize;
  materials: DrawerBoxDesign['materials'];
}

export interface FrontSettings {
  doors: DoorSettings;
  drawers: DrawerSettings;
}

/**
 * A door set on a designed cabinet as the project keeps it: what is its own (its
 * opening, a pair or a single door, hinge side, gap, overlays) and, under
 * `overrides`, its own copy of all the settings when it does not follow the project.
 */
export interface StoredDoorSet {
  id: Id;
  template: 'doorSet';
  name: string;
  mounting: Omit<DoorMounting, DoorHingeKey>;
  overrides?: DoorSettings;
}

/** A drawer on a designed cabinet as the project keeps it: its opening and overlays, slide length and box height. */
export interface StoredDrawer {
  id: Id;
  template: 'drawer';
  name: string;
  mounting: DrawerMounting;
  slide: Pick<DrawerSlideChoice, 'length'>;
  box: Pick<DrawerBoxDesign, 'height'>;
  overrides?: DrawerSettings;
}

/** A drawer on a drawer opening: its front, the slide it runs on and its box. */
export interface DrawerDesign {
  id: Id;
  template: 'drawer';
  name: string;
  mounting: DrawerMounting;
  front: DrawerFrontDesign;
  slide: DrawerSlideChoice;
  box: DrawerBoxDesign;
  /**
   * The drawer while the cabinet is the shop style, where the front of the box is
   * the drawer's front. Left out: a wide front from the cabinet's case material.
   */
  shop?: ShopDrawerDesign;
  /** Its knob or pull, whose holes the CNC drills. Left out: none, or one fitted by hand. A finger pull takes its place. */
  handle?: DrawerHandleChoice;
  /** On a designed cabinet: the stored settings this drawer has made its own. Read only. */
  readonly overrides?: DrawerSettings;
}

/**
 * How a front of a shop-style cabinet is opened. By hand: a pull is fitted
 * afterwards and nothing is cut. Finger pull: the CNC cuts a hand-hold notch in the
 * top edge of a drawer front, or a finger hole through a door.
 */
export type PullChoice = 'byHand' | 'fingerPull';

export interface ShopDrawerDesign {
  front?: ShopDrawerFront;
  /** Left out: fitted by hand. */
  pull?: PullChoice;
  /** What a wide front is made of. Left out: the cabinet's case material. */
  frontMaterialId?: Id;
  /**
   * A wide front's own style and outside edge (one front piece that can look like the doors):
   * a shaker frame, a pattern, an eased edge, cut into its outside face. Left out: a flat slab with square edges,
   * as a shop cabinet's is. (Not `DrawerDesign.front`, which a wide front has never followed: a shop cabinet's
   * stays what it was.)
   */
  style?: DoorStyle;
  outsideEdge?: EdgeTreatment;
}

/**
 * Wide: the box's front wall is wider and taller than the box, fills the opening
 * less the gap and hides the slides; the box sides sit in dados in its back face.
 * Plain: the box is as wide as the slides allow and the gaps beside it show.
 * Runners: no slides; the box fills the opening and slides on the case bottom or on
 * a wooden strip screwed to each side.
 * Applied: a front of its own (`DrawerDesign.front`: its style, edge and material), inset in
 * the opening and screwed to a plain box on slides from inside it, as in the other styles: the doubled front, fitted
 * to its opening after the box is hung.
 */
export type ShopDrawerFront = 'wide' | 'plain' | 'runners' | 'applied';

export interface DrawerSlideChoice {
  /** A slide in the hardware library. */
  slideId: Id;
  /** One of the slide's lengths. Left out: the longest that fits the cabinet. */
  length?: Length;
  /**
   * How a face frame cabinet carries the slides, whose stiles stand inside the case
   * sides. Kept while the cabinet is frameless, where the slides sit on the sides.
   */
  faceFrameMount: FaceFrameSlideMount;
}

/**
 * Strips: a wood strip on each case side brings the slide flush with the opening.
 * Rear brackets: the slide fixes to the back of the face frame at the front and to
 * a bracket on the nailer or the cabinet back at the rear.
 */
export type FaceFrameSlideMount = 'strips' | 'rearBrackets';

/**
 * The box behind the front. Its width and length come from the opening and the
 * slide; its parts, grooves, rabbets and screw holes are derived.
 */
export interface DrawerBoxDesign {
  cornerJoint: BoxCornerJoint;
  /** With `tabs` corners: the fingers' size. Left out: as a case's tabs. */
  fingers?: TabSize;
  /** Height of the box sides. Left out: the opening height less 1". */
  height?: Length;
  materials: { boxId: Id; bottomId: Id };
}

/**
 * Rabbet: a rabbet at each end of the sides takes the box front and back, glued and
 * nailed or screwed. Pocket screws: butt joints, screwed through the box front and
 * back into the sides. Tabs: finger joints cut on the CNC, the front's
 * and the back's ends with tabs through slots at the ends of the sides, glued.
 */
export type BoxCornerJoint = 'rabbet' | 'pocketScrews' | 'tabs';

export interface DrawerMounting {
  openingId: Id;
  type: 'overlay';
  /**
   * Its own side overlay. Left out, the front follows the doors on the same
   * cabinet (their hinge's overlay), or 1/2" when the cabinet has none.
   */
  overlaySide?: Length;
  overlayTop: Length;
  overlayBottom: Length;
}

/** Its own values; a new drawer copies them from the cabinet's doors. */
export interface DrawerFrontDesign {
  style: DoorStyle;
  outsideEdge: EdgeTreatment;
  materialId: Id;
}

export interface DoorSetDesign {
  id: Id;
  template: 'doorSet';
  name: string;
  mounting: DoorMounting;
  style: DoorStyle;
  outsideEdge: EdgeTreatment;
  materialId: Id;
  /**
   * The doors while the cabinet is the shop style. Left out: slab doors with square
   * edges from the cabinet's case material. `style`, `outsideEdge` and `materialId`
   * are kept beside it, so switching the cabinet's style re-enters nothing.
   */
  shop?: DrawerFrontDesign;
  /** The doors' pull while the cabinet is the shop style. Left out: fitted by hand. */
  shopPull?: PullChoice;
  /** The doors' knob or pull, whose holes the CNC drills. Left out: none, or one fitted by hand. A finger pull takes its place. */
  handle?: DoorHandleChoice;
  /** On a designed cabinet: the stored settings this door set has made its own. Read only. */
  readonly overrides?: DoorSettings;
}

export interface DoorMounting {
  openingId: Id;
  type: 'overlay' | 'inset';
  doors: 1 | 2;
  /** Between a pair. */
  gap: Length;
  /** On a face frame or a measured opening. The side overlay comes from the hinge spec. */
  hingeId: Id;
  /**
   * The hinge when the opening is frameless. Left out: the generic frameless hinge.
   * `hingeId` is kept beside it, so switching the cabinet's style re-enters nothing.
   */
  framelessHingeId?: Id;
  /** The hinge when the doors are inset in a shop-style cabinet. Left out: the generic inset hinge. */
  shopHingeId?: Id;
  /**
   * Left out: the hinge's overlay. Not edited: a frameless cabinet's full overlay
   * sets it when the doors are hung (see `hang` in `design/style.ts`).
   */
  overlaySide?: Length;
  /** Single door only. */
  hingeSide?: 'left' | 'right';
  /** Hinges don't set these; defaulted from the existing doors. */
  overlayTop: Length;
  overlayBottom: Length;
}

/**
 * A pattern cut into a front's face (`src/design/pattern.ts`). `grooves`: V-grooves `depth` deep with
 * a V-bit of `angleDeg`, laid out as planks, a grid, diamonds or chevrons about `spacing` apart, `margin` in from
 * the edges (0: they run out through them). `flutes`: round channels `width` across (the ball nose's diameter)
 * and `depth` deep, `spacing` from one's middle to the next's. `frame`: a V-groove rectangle `inset` from the
 * edges, or `panels` of them one over another, on a slab. Also: a sunburst, rectangles one
 * inside another and waves as groove layouts; wavy and reeded flutes; `dimples`; `channels`. `border`: on a slab, with a
 * margin, the rectangle the pattern stops at is carved too, with the pattern's own bit to its depth.
 */
export type FrontPattern =
  | {
      kind: 'grooves';
      layout: 'vertical' | 'horizontal' | 'diagonal' | 'grid' | 'diamond' | 'chevron' | 'sunburst' | 'rectangles' | 'waves';
      spacing: Length;
      depth: Length;
      angleDeg: number;
      margin: Length;
      border?: boolean;
    }
  /** `wavy`: upright flutes that wave from side to side. `reeded`: they overlap (`spacing` less than `width`) and leave a ridge between each two. */
  | { kind: 'flutes'; direction: 'vertical' | 'horizontal'; width: Length; spacing: Length; depth: Length; margin: Length; wavy?: boolean; reeded?: boolean; border?: boolean }
  /** A grid of round dents, each a plunge of a ball nose `width` across to `depth`, `spacing` apart, every other row shifted by half of that. */
  | { kind: 'dimples'; width: Length; spacing: Length; depth: Length; margin: Length; border?: boolean }
  /** Flat-bottomed channels `width` wide, `spacing` from one's middle to the next's: cut with an end mill, or (`soft`) in one pass with a bull nose that wide, which rounds their inside corners. */
  | { kind: 'channels'; direction: 'vertical' | 'horizontal'; width: Length; spacing: Length; depth: Length; margin: Length; soft?: boolean; /** Soft: the bull nose's corner radius. */ corner?: Length; border?: boolean }
  /**
   * Lines whose depth rises and falls along them, each line half a wave on from the one beside it (a woven look):
   * `depth` at their deepest, nothing at their shallowest, a rise and a fall every `wave`, the lines `spacing`
   * apart. `bit`: a V-bit of `angleDeg`, or a ball nose or a bull nose `width` across.
   */
  | { kind: 'ripples'; direction: 'vertical' | 'horizontal'; bit: 'v' | 'round' | 'bull'; angleDeg: number; width: Length; spacing: Length; wave: Length; depth: Length; margin: Length; /** A bull nose's corner radius. */ corner?: Length; border?: boolean }
  | { kind: 'frame'; inset: Length; depth: Length; angleDeg: number; panels?: number };

export type DoorStyle =
  | { kind: 'slab'; /** A pattern over its face. */ pattern?: FrontPattern }
  | {
      kind: 'shaker';
      frameWidth: Length;
      recessDepth: Length;
      insideEdge: { kind: 'square' } | { kind: 'vBevel'; angleDeg: number };
      /** Largest radius allowed in the panel floor corners. */
      floorCornerRadius: Length;
      /** A pattern over the floor of its panel (grooves or flutes). */
      pattern?: FrontPattern;
    };

export type EdgeTreatment =
  | { kind: 'square' }
  | { kind: 'roundover'; radius: Length }
  | { kind: 'chamfer'; size: Length };
