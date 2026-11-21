/**
 * Derived from the design and libraries; never stored or edited.
 *
 * One coordinate frame per part: origin at the bottom-left corner looking at
 * face A (the front), X right, Y up. Face B features use the same frame; the
 * planner mirrors for a flip. Depths are measured from the feature's own face.
 */
import type { Id } from './project';
import type { Mm } from './units';

/** A = front/show face, B = back. */
export type Face = 'A' | 'B' | 'edge';
export interface Point {
  x: Mm;
  y: Mm;
}
/** Closed, counter-clockwise. */
export type Polygon = Point[];

/**
 * How a part's pocket holes are drawn in the 3D view: as the Kreg jig drills them, as the CNC cuts a 15
 * degree pocket, or as it cuts a low-angle one.
 * Display only, put on a copy of the part for the view (`withPocketLooks`): how they are made is Plan's.
 */
export type PocketLook = ({ kind: 'kreg' } | { kind: 'cnc' } | { kind: 'low'; angleDeg: number; seat: Mm }) & {
  /** The pocket holes with a ledge round them for a printed cover, by feature id, and the radius of the bit that cut it (its corners). */
  ledges?: { featureIds: Id[]; r: Mm };
};

/**
 * How a sink is drawn, on the part that stands for it (`sinkShapes`): display only, never stored or planned from. In
 * the part's own frame: X across from the sink's left edge, Y back from its front edge, Z up from the part's back face.
 * Each bowl is a shell from its opening (`top`) down to its floor, its sides drawing in; a drop-in has a rim lying on
 * the top round them; a vessel is a bowl standing on the top, seen from outside too; a farmhouse sink has its apron in
 * front. `faucet`: where its foot stands and how tall and far it reaches.
 */
export interface SinkLook {
  colour: 'steel' | 'white';
  shape: 'rectangle' | 'oval';
  bowls: { cx: Mm; cy: Mm; width: Mm; depth: Mm; top: Mm; floor: Mm }[];
  rim?: { width: Mm; depth: Mm; z: Mm };
  vessel?: true;
  apron?: { width: Mm; height: Mm; z: Mm };
  faucet?: { x: Mm; y: Mm; z: Mm; height: Mm; reach: Mm };
}

/**
 * How a part moves with the 3D view's Doors slider when it is not an ordinary hinged door. Display
 * only, never stored or planned from. `tilt`: a false front on tilt-out hinges and its tray, which tip forward
 * about a level line across the cabinet through `axis` (y, z), the bottom edge of the front's back face. `turn`: about a vertical line through `axis` (x, z in its cabinet), as a
 * lazy susan with its doors on it does. `follow`: the second door of a bi-fold pair, hinged to the door `partId`:
 * it goes where that door goes, unfolding from it as the pair opens. `fold`: a table's leaf, which
 * swings down about a level line across the cabinet through `axis` (y, z), with the view's Leaf slider. `first`: a
 * leg under the leaf, which folds flat against it before the leaf goes down: a quarter turn about a level line
 * from front to back through `at` (x, y), `sign` 1 when its foot goes toward +X.
 * `across`: the leaf is on an end, 1 the right and -1 the left. Its hinge line then
 * runs from front to back through `axis` (x, y), and a leg's `first` is about a level line across the cabinet
 * through `at` (y, z), `sign` 1 when its foot goes toward the front.
 * `front`: the leaf is along the front (a table with a leaf on each long side): it swings down the other way round.
 * `swingIn`: a bracket under a drop leaf, which swings in flat under the part that stays before the leaf
 * goes down: a quarter turn about an upright line through `axis` (x, z), in the first of the Leaf slider's travel.
 */
export type PartMoves = { kind: 'tilt'; axis: [Mm, Mm] } | { kind: 'turn'; axis: [Mm, Mm] } | { kind: 'follow'; partId: Id } | { kind: 'fold'; axis: [Mm, Mm]; across?: 1 | -1; front?: true; first?: { at: [Mm, Mm]; sign: 1 | -1 } } | { kind: 'swingIn'; axis: [Mm, Mm]; sign: 1 | -1 };

export interface Part {
  moves?: PartMoves;
  /** Set on the part that stands for a sink: it is drawn as the sink, not as its block. Never stored, never planned from. */
  sinkLook?: SinkLook;
  /** How its pocket holes are drawn. Left out: as the Kreg jig drills them. Never stored, never planned from. */
  pocketLook?: PocketLook;
  /** Stable, e.g. `${designObjectId}/door-left`. */
  id: Id;
  /** The door set, drawer or cabinet the part comes from. */
  designObjectId: Id;
  name: string;
  /**
   * Its cabinet's letter (A, B ...) when the project has several cabinets: it goes in
   * front of the name wherever parts of different cabinets are named together.
   */
  tag?: string;
  /**
   * Which copy of its cabinet the part is for (1, 2 ...), when the cabinet is made more
   * than once. The copies of a part are alike but for their ids: `cabinet-1/bottom`,
   * `cabinet-1~2/bottom`. They share `designObjectId`.
   */
  copy?: number;
  /** On a wooden handle (role `handle`): the handle in the hardware library it is. */
  handleId?: Id;
  materialId: Id;
  /** Thickness is the material's measured thickness. */
  size: { width: Mm; height: Mm; thickness: Mm };
  features: Feature[];
  /** What the part is in a cabinet. Unset for fronts. */
  role?: CabinetPartRole;
  /** Its outline is not a rectangle (a corner cabinet's five-sided or L-shaped bottom): only the CNC cuts it. */
  shaped?: boolean;
  /** Its outline has a joint's tabs (`src/design/tabs.ts`): only the CNC cuts it out. Derived, like the rest. */
  tabbed?: true;
  /** Where it sits in its cabinet. Unset until the part belongs to one. */
  placement?: PartPlacement;
  /**
   * Edges that are banded after cutting. The size and outline are the cut size,
   * already smaller by the band's thickness on those edges.
   */
  banding?: { edges: PartEdge[]; thickness: Mm; /** A solid wood strip, a part of its own (role `caseEdge`), not banding. */ strip?: true };
  /**
   * Which way the grain runs, set by what the part is. Unset when the material has
   * no grain (MDF). Nesting must not turn a grained part across the sheet's grain.
   */
  grain?: GrainDirection;
  /**
   * A part of a case that is already there (an existing cabinet): only drawn, as a plain shell. It is never
   * among the parts a job cuts, lists or buys (`existingShellParts`).
   */
  existing?: boolean;
}

/** Along the part's X (its width) or its Y (its height). */
export type GrainDirection = 'width' | 'height';

/** An edge of the part's rectangle in its own frame: at x = 0, x = width, y = 0 or y = height. */
export type PartEdge = 'x0' | 'x1' | 'y0' | 'y1';

export type CabinetPartRole =
  | 'side'
  /** Between two bays of a frameless or shop-style cabinet (milestone 10): laid like the left side, face A looking right. */
  | 'partition'
  | 'bottom'
  | 'stretcher'
  | 'back'
  | 'toeKick'
  | 'shelf'
  | 'frameStile'
  | 'frameRail'
  /** The four walls and the bottom of a drawer box. The applied front has no role, like a door. */
  | 'boxSide'
  | 'boxFront'
  | 'boxBack'
  | 'boxBottom'
  /** A strip on a case side that carries a drawer slide behind a face frame. */
  | 'buildOut'
  /** A wooden strip on a case side that a drawer without slides runs on, or that keeps it from tipping. */
  | 'runner'
  /** A strip behind a wall cabinet's back: a French cleat's two halves and the spacer under them. */
  | 'cleat'
  /** A strip that closes the gap between the end of a run and the wall it stands against, or beside a blind corner cabinet's door. */
  | 'filler'
  /** A blind corner cabinet's face beside its door (milestone 6): the blind panel the other run covers, and the filler strip. */
  | 'blindPanel'
  /** A countertop and what goes with it (milestone 7): its layers and backsplash. */
  | 'top'
  /** A solid wood strip glued to a countertop's front or open end (milestone 7). */
  | 'topEdge'
  /** A solid wood strip glued to a front edge of a plywood case with no face frame (`FramelessDesign.edgeStrip`). */
  | 'caseEdge'
  /** A rib of a torsion table's core (milestone 8). */
  | 'rib'
  /** A wooden handle cut on the CNC, for a door or a drawer front. It has no place in the cabinet of its own: it goes where its front's holes are. */
  | 'handle'
  /** A tray under a sink: its walls, its bottom and the standards its slides hang on. */
  | 'pullOut'
  /**
   * A leg: square stock, as wide as it is thick, its height its length. Cut to length on
   * the miter saw and never on the CNC; all four of its long faces show.
   */
  | 'leg'
  /** An apron of a table: a rail between two legs under the top, its face A outward. */
  | 'apron';

export type Vec3 = [Mm, Mm, Mm];

/**
 * The part's frame in the cabinet's frame: a point at part (x, y) on face A is at
 * `origin + x * xAxis + y * yAxis`. The axes are unit vectors; face A looks along
 * xAxis × yAxis and the thickness runs the other way.
 */
export interface PartPlacement {
  origin: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
}

interface FeatureBase {
  id: Id;
  face: Face;
}

export type Feature =
  /** `dogBones`: every inside corner of the outline gets a dog-bone in the toolpath, so a square part seats in it (an egg-crate rib's slots). */
  /**
   * `inside`: an opening cut through the part inside its outline (a sink's cut-out in a top), a
   * rectangle: the bit runs inside the line and leaves its radius in the corners. The part's own
   * outline is its first cutout, never an inside one.
   */
  | (FeatureBase & { kind: 'cutout'; outline: Polygon; dogBones?: boolean; inside?: boolean })
  | (FeatureBase & { kind: 'pocket'; outline: Polygon; depth: Mm; floorCornerRadius: Mm })
  | (FeatureBase & { kind: 'bevel'; path: Polygon; angleDeg: number; depth: Mm })
  | (FeatureBase & { kind: 'cup'; center: Point; diameter: Mm; depth: Mm; hardwareId: Id })
  /** Press-in dowel holes. */
  | (FeatureBase & { kind: 'hole'; center: Point; diameter: Mm; depth: Mm; /** The hardware it is for, where the picture draws that (a handle). */ hardwareId?: Id })
  | (FeatureBase & { kind: 'edgeProfile'; path: Polygon; treatment: ResolvedEdge; arris: 'A' | 'B' })
  /**
   * A pocket-screw hole, drilled at an angle into `face` so the screw leaves through
   * `edge` into the part it joins. `at` is the position along that edge: y for the
   * x0 and x1 edges, x for y0 and y1. How it is made (Kreg jig or CNC-assisted) is Plan.
   */
  | (FeatureBase & { kind: 'pocketHole'; face: 'A' | 'B'; edge: PartEdge; at: Mm; /** The screw leaves the part this far in from `edge`: through the front of a side's toe-kick notch. Left out: through the edge itself. */ inset?: Mm })
  /**
   * A square-bottomed recess that houses the end or edge of another part: a rectangle
   * in `face`, `depth` deep. It may run out through the part's edges (a through dado,
   * the open-topped housing of a stretcher, the rabbet or groove for the back). The
   * id says which: `dado-...`, `rabbet-back`, `groove-back`.
   */
  | (FeatureBase & { kind: 'dado'; face: 'A' | 'B'; outline: Polygon; depth: Mm })
  /**
   * A square-bottomed groove that follows a line: `width` wide about `path`, an open run of points
   * that may curve, `depth` deep. The groove round a lazy susan's shelf for its rim, and the slots across a rim
   * strip that let it bend. An end of the path on the part's edge runs out through it.
   */
  /**
   * `profile` (a front's pattern): the cut is a shaped bit's, run once along the line: a V of an angle, or a round
   * bottom of a ball's diameter; `width` is then how wide it comes at the surface. `top`: the cut starts this far
   * below the face, from the floor of a panel that is cut first; `depth` is still from the face.
   */
  | (FeatureBase & { kind: 'slot'; face: 'A' | 'B'; path: Point[]; width: Mm; depth: Mm; profile?: { kind: 'v'; angleDeg: number } | { kind: 'round'; diameter: Mm } | /** A bull nose's: flat, its inside corners rounded. */ { kind: 'bull'; diameter: Mm; /** The radius of each corner; the floor between them is flat. */ cornerRadius: Mm }; top?: Mm; /** With a `profile`: the depth at each point of `path`, from the face, where it is not `depth` all along (which is then the deepest). */ depths?: Mm[] });

export type FeatureKind = Feature['kind'];

export type ResolvedEdge = { kind: 'roundover'; radius: Mm } | { kind: 'chamfer'; size: Mm };

/** Reverse mode and sizing results shown on the Design screen. */
export interface OverlayReport {
  /** From the existing doors, when measured. */
  current?: { side: Mm; top: Mm; bottom: Mm };
  suggestedHingeIds: Id[];
  doorSize: { width: Mm; height: Mm };
}
