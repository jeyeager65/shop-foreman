/**
 * A designed cabinet: what the user chose (stored), and the openings it produces
 * (derived). Its case and face frame parts are ordinary `Part`s with a role and a
 * placement.
 *
 * Cabinet frame: origin at the front-left corner of the case on the floor, X right,
 * Y up, Z out toward the viewer. The case runs back along -Z; a face frame and the
 * fronts sit in front of it at +Z. Same directions as the door assembly view.
 */
import type { ExistingDoors, InsideFinish } from './project';
import type { ConstructionStyle, Id } from './project';
import type { Vec3 } from './parts';
import type { Length, Mm } from './units';

/**
 * Stored once for the project: how its cabinets are built. A cabinet follows these
 * unless it has its own under `overrides`.
 */
export interface CabinetSettings {
  construction: ConstructionStyle;
  materials: { caseId: Id; backId: Id };
  /** Kept while the style is frameless, so switching back re-enters nothing. */
  faceFrame: FaceFrameDesign;
  /** Kept while the style is face frame, for the same reason. */
  frameless: FramelessDesign;
  /** Kept while the style is another one, for the same reason. */
  shop: ShopStyleDesign;
  /** How the case parts join each other. */
  joinery: CabinetJoinery;
  /**
   * `off`: a flat bottom with no toe kick; the cabinet stands on a bench, a separate
   * base or casters. The height and depth are kept, so switching back re-enters nothing.
   */
  toeKick: {
    height: Length;
    depth: Length;
    off?: boolean;
    /**
     * Milestone 9: the bottom's third state, on casters (a hardware library id). Casters need a
     * flat bottom, so `off` is set with it; every reader of `off` stays right.
     */
    /**
     * `under`: what the casters' plates are screwed to. `pads`: a pad of the case material under
     * each caster, at the corners (and each side of a join under a run). `layer`: a second layer under the whole
     * case. Left out: pads under a cabinet on its own, a layer under each cabinet of a run or an island.
     */
    casters?: { casterId: Id; under?: 'pads' | 'layer'; /** Bought feet in the casters' places: the same pads and pilot holes, nothing that rolls or locks. */ feet?: boolean };
    /**
     * A leg frame: the case has a flat bottom (`off` is set with it) and stands on four legs of
     * square stock with an apron between each two, a table's frame with no top. `height`: from the floor to the
     * case's underside, which is how long the legs are. `apron`: how tall the aprons are. `middle`: a long case
     * gets legs in the middle too, under its partitions, with an apron across between each pair
     * (`legFrameMiddles`). Left out: four legs whatever the length.
     */
    /**
     * `posts`: the four legs run up the corners of the case to its top.
     * The case is then a face frame's whose stiles are the posts: its sides stand between the front and the back
     * posts, set in from their faces; rails of the frame's material lie flat between the front posts, over, under
     * and between the openings; and the fronts are inset, flush with the posts (`postsOf`). No aprons.
     */
    legs?: { height: Length; materialId: Id; apron: Length; middle?: boolean; posts?: boolean };
    /**
     * A plinth: the toe kick's board flush with the front of the case, no toe space. The
     * height is the toe kick's; its depth is kept, unused, for when it is a toe kick again.
     */
    plinth?: boolean;
    /**
     * How the toe kick board is fastened. `pocketScrews`: pocket holes in its back,
     * into the sides at its two ends and up into the bottom along its top edge. Left out: by hand, with
     * glue and brads; nothing is cut or listed for it.
     */
    joint?: 'pocketScrews';
    /**
     * Where the toe kick board stands. Left out: between the sides, whose front edges
     * show in the toe space. `inFront`: across the front of the sides, hiding their edges, one board a
     * cabinet. `acrossRun`: the same, one board across the cabinets of a run (a cabinet in no run gets its
     * own). In front, the sides' notches are deeper by the board's thickness, so the toe space is as deep
     * as `depth` says either way.
     */
    board?: 'inFront' | 'acrossRun';
  };
  /** The shelf pin the shelves sit on: it sets the holes in the sides. A hardware library id. */
  shelfPinId: Id;
  /** How the project's wall cabinets hang. Kept while it has none. */
  hanging: WallHanging;
}

/**
 * Rails: a rail inside at the top and at the bottom, against the back, that the
 * mounting screws go through into the wall. Cleat: a French cleat, a strip with a 45
 * degree bevel fastened to the cabinet's back at the top and its mate on the wall,
 * with a spacer strip at the bottom of the back so the cabinet hangs plumb; the
 * cabinet stands off the wall by the cleat's thickness.
 */
export type WallHanging = 'rails' | 'cleat';

/**
 * Base: stands on the floor, stretchers at the top (a countertop covers it). Wall:
 * hangs on the wall; a full top panel, no toe kick, doors only. Tall: stands on the
 * floor like a base cabinet, with a full top panel; it may have doors over doors,
 * with a fixed shelf between the two rows.
 */
export type CabinetForm = 'base' | 'wall' | 'tall';

/**
 * Cabinets that stand side by side as one piece: floor-standing ones (base and tall),
 * or wall cabinets. They stand left to right in the order of the project's list.
 */
export interface Run {
  id: Id;
  name: string;
  /** Kept in the order of the project's cabinet list. A cabinet is in one run or in none. */
  cabinetIds: Id[];
  /** What each end of the run meets: a wall, or nothing. It decides whether the end cabinet's outer side shows. */
  ends: { left: RunEnd; right: RunEnd };
  /** The space the run is to fill, wall to wall or wall to a mark. Left out: as long as its cabinets. */
  length?: Length;
  /**
   * Where the run's left end stands in the project's room (milestone 6). Left out: placed
   * automatically, on the back wall after what is already there. Placed against a wall,
   * its ends that meet the room's walls are wall ends, whatever `ends` says.
   */
  placement?: Placement;
  /** A top over the run's floor-standing cabinets (milestone 7). A wall run has none. */
  top?: TopDesign;
  /**
   * A wall run lined up with a floor run (milestone 6): it stands on that run's wall from
   * that run's left end, and moves with it. Its own `placement` is then not used.
   */
  alignedWith?: Id;
  /**
   * What the run's cabinets have in common, whatever each has of its own: the depth,
   * the toe kick (it starts as the project's) and a height for each form in the run.
   */
  shared: {
    depth: Length;
    toeKick: CabinetSettings['toeKick'];
    heights: Partial<Record<CabinetForm, Length>>;
  };
}

export type RunEnd = 'wall' | 'open';

/**
 * An island (milestone 8): a group of floor cabinets standing free in the room under one
 * top. Its rows are runs: one, or two back to back, the second turned 180° with its back
 * against the first's, the two centred on each other. `placement` is where the first
 * row's back-left corner stands and how the island is turned; the rows' own placements are
 * not used.
 */
export interface Island {
  id: Id;
  name: string;
  rows: Id[];
  placement: { x: Length; y: Length; turn: 0 | 90 | 180 | 270 };
  top?: TopDesign;
  /**
   * Floor cabinets in no run, standing beside its rows, that its one top covers too: a
   * peninsula's corner box facing the other way. Where the top meets a
   * wall it stops there, with no overhang.
   */
  covers?: Id[];
  /**
   * `false`: a one-row island gets no finished back over its cabinets' backs (a shop table,
   * whose back faces the space under it). Left out: it gets one, as a kitchen island wants.
   */
  finishedBack?: boolean;
}

/**
 * How the project's tops are made (milestone 7): Setup's values, shared by every top.
 * `made`: cut here from a project material, in one or two layers; `bought`: a post-formed
 * laminate top from the library cut to length (`boughtTopId`); `measured`: a top bought
 * elsewhere (stone), only measured for its order.
 */
export interface TopSettings {
  /** `torsion`: a torsion box made here, as `torsion` says. */
  kind: 'made' | 'bought' | 'measured' | 'torsion';
  materialId: Id;
  /** Two: a second layer of strips under the first, round its edges and across it. */
  layers: 1 | 2;
  overhang: { front: Length; openEnd: Length };
  /** On the front and open ends: nothing, edge banding, or a solid wood strip this thick glued on. */
  edge: { kind: 'none' | 'banding' | 'strip'; thickness: Length };
  backsplash: { on: boolean; height: Length };
  /** A bought top's library entry. */
  boughtTopId?: Id;
  /** A torsion top's values. Left out: the light top's (`lightTopTable`). */
  torsion?: TorsionSettings;
}

/** The edges of a top a leaf may hang from: its two ends and its back. Never its front, which shuts in what opens under it. */
export type LeafEdge = 'left' | 'right' | 'back';
/** A leaf on one edge of a top: how far it reaches beyond that edge when it is up. */
export interface TopLeaf {
  edge: LeafEdge;
  length: Length;
  /**
   * A second leaf like it on the opposite edge (a classic drop-leaf table): with `back`, one
   * along the front too; with an end, one at the other end. On a table's slab top only: a countertop's front shuts
   * in what opens under it, and a torsion box takes one leaf.
   */
  both?: boolean;
}

/** A top on a run or on a cabinet in no run (milestone 7): it is covered. How tops meet at a corner is the corner's own. */
export interface TopDesign {
  /** Where this run's top meets another's over a corner cabinet. Left out: a mitre on a bought top, a butt joint on one made here. */
  cornerJoint?: 'butt' | 'mitre';
  /**
   * What of this one top differs from Setup's: its kind and any other value, each
   * in place of Setup's. A torsion box's values (`torsion`) are replaced whole. Left out: as Setup makes them.
   */
  settings?: Partial<TopSettings>;
  /** A torsion top's typed size: its length (along the run) and width. Left out: the cabinets' footprint and its overhang all round. */
  size?: { length: Length; width: Length };
  /**
   * A leaf that folds down (for a table that takes a full sheet in a small shop; on any open
   * edge): `length` more of the top beyond its `edge`, hinged under the joint to
   * the rest, which stays. The top's size, derived or typed, is the part that stays. An edge takes a leaf only when
   * it is open (`leafRefusal`). On a torsion top the leaf is a box of its own, and the two ribs that meet at the
   * joint get matching holes for alignment pins, drilled on the CNC.
   */
  leaf?: TopLeaf;
  /**
   * A side for stools: on an island's or a peninsula's top, one open edge reaches `overhang`
   * past the cabinets, in place of the usual overhang there, for knees under it. The back of a one-row island, or
   * an open end; never an edge with doors and drawers under it. Past 10" it rests on bought brackets (`SEATING`).
   */
  seating?: { edge: LeafEdge; overhang: Length };
  /** Set on a piece in no run: its top is its own, made as this says, in place of Setup's. */
  own?: OwnTop;
}

/**
 * A piece's own top: a dresser's or a bookcase's, laid on the case and overhanging it at the
 * front, at both ends and at the back, with one edge all round. Always made here, of one layer, with no
 * backsplash, whatever Setup says of the project's countertops.
 */
export interface OwnTop {
  /** Left out: the project's top material. */
  materialId?: Id;
  overhang: { front: Length; ends: Length; back: Length };
  /**
   * Its edge, all round: left square, banded, a solid wood strip glued on, or the panel's own edge rounded over
   * or chamfered on its top arris (`size`: the radius or the chamfer; `thickness`: the strip's).
   */
  edge: { kind: 'none' | 'banding' | 'strip' | 'roundover' | 'chamfer'; thickness?: Length; size?: Length };
  /**
   * Set: it is a torsion box of these values in place of a slab, on a case or on a
   * table's legs and aprons. Its overhangs stay the ones above (the box's own overhang is not used); its edge is its
   * outer ribs, and `materialId` and `edge` are not used.
   */
  torsion?: TorsionSettings;
  /**
   * A table's top only. Set: a slab whatever Setup says. With neither this nor `torsion`, a table's top is made
   * as Setup's tops are: a torsion box of Setup's values where Setup's are torsion boxes, else a slab (`frameTop`).
   * A case's own top is a slab unless it has `torsion`.
   */
  slab?: true;
  /**
   * A leaf that folds down on one of its edges, as a countertop's (`TopDesign.leaf`):
   * `length` more of the top beyond that edge. On a table the size is the part that stays, over the legs.
   */
  leaf?: TopLeaf;
}

/**
 * A torsion table (milestone 8): two skins glued to a grid of ribs. Every value is an input;
 * the materials are the project's. A CNC's spoilboard is not part of it (it
 * will not cover the whole surface; not drawn or listed for now).
 */
export interface TorsionSettings {
  /** How far it is over what is under it, all round, when its size is not typed. */
  overhang: Length;
  skins: { topId: Id; bottomId: Id };
  /** The ribs: their material, their height (the core), and about how far apart, each way; the cells come out equal. */
  ribs: { materialId: Id; height: Length; spacing: Length };
  /** How the ribs are made: slotted together on the CNC, or ripped on the saw and butted. Left out: the CNC. */
  ribsBy?: 'cnc' | 'saw';
}

/**
 * One torsion top as it is made: the box's values (Setup's, or the top's own) with that top's typed size and
 * leaf (`TopDesign.size`, `TopDesign.leaf`). Derived (`torsionOf`, `topPieces`), never stored.
 */
export interface TorsionTable extends TorsionSettings {
  size?: { length: Length; width: Length };
  /** The leaf it has: one its top asked for and may have. The box's length and width are then with the leaf. */
  leaf?: TopLeaf;
}

/**
 * A blind corner cabinet: an ordinary box set into the corner, one end hidden behind the
 * end cabinet of the run on the other wall. On that side (`side`) its face is blind for
 * `blind` from the case's outside edge: a blind panel the other run covers, then a filler
 * strip `filler` wide so the doors and handles clear the other run. Behind a face frame
 * the stile on that side is `blind` wide instead.
 */
export interface BlindCorner {
  kind: 'blind';
  side: 'left' | 'right';
  blind: Length;
  filler: Length;
}

/**
 * A diagonal corner cabinet: in plan five-sided, two backs along the walls, two short sides
 * square to them and a diagonal front. Its `size.width` is how far it runs along each wall,
 * its `size.depth` its short sides. `side`: which end of its run the room's corner is at.
 */
export interface DiagonalCorner {
  kind: 'diagonal';
  side: 'left' | 'right';
  /** A lazy susan made here, in place of its shelves: two whole round shelves. Left out: its shelves on pins. */
  susan?: LazySusan;
}

/**
 * A lazy susan made here (`src/design/susan.ts`): how its two shelves turn (each on a bought
 * bearing ring, or both on a bought pole), and the rim round each (a slotted strip of the back's material,
 * two strips of 1/8" hardboard, or none).
 */
export interface LazySusan {
  turns: 'bearings' | 'pole';
  rim: 'kerfed' | 'laminated' | 'none';
  /**
   * `onSusan`: an L-shaped cabinet's two doors are fixed to the shelves of a susan on a pole and turn with it, with
   * no hinges: they stand inside the opening, narrow enough to pass the end sides. Left out: a bi-fold pair on hinges.
   */
  doors?: 'onSusan';
}

/**
 * An L-shaped corner cabinet, for a lazy susan: square in plan from outside, `size.width`
 * along each wall, the inside corner cut out `size.depth` deep, its front two faces at 90°
 * with a door on each, hinged together (bi-fold). `side`: which end of its run the room's
 * corner is at.
 */
export interface LShapedCorner {
  kind: 'lShaped';
  side: 'left' | 'right';
  /** A lazy susan made here: two pie-cut shelves. Left out: a bought one, on the hardware list. */
  susan?: LazySusan;
}

export type CornerCabinet = BlindCorner | DiagonalCorner | LShapedCorner;

/**
 * A rectangular room (milestone 6). Its walls are named as seen from the middle of the
 * room looking at the back wall: back, left, right, front. `length` runs along the back
 * wall, `width` along the side walls.
 */
export interface Room {
  length: Length;
  width: Length;
  ceiling: Length;
  /**
   * The walls that are not there: the room is open to the next one on that side (a kitchen
   * past its peninsula). Only how the room is drawn: no wall there, the floor
   * and ceiling going on past it, a broken line on the plan.
   */
  open?: RoomWall[];
  /** Windows in its walls (the one over a sink). Only drawn: nothing is made or checked for one. */
  windows?: RoomWindow[];
  /** How it looks: its floor, its walls' colour, tile on its walls. Only drawn (`src/design/roomLook.ts`). */
  look?: RoomLook;
}

/**
 * How a room looks. Colours are `#rrggbb`. `floor`: its kind and colour (left out: wood
 * planks as the view has always drawn them). `wall`: one paint colour for the room. `tile`: tile on the walls
 * between the countertops and the wall cabinets, placed by the app (`wallTileRects`), round the windows.
 */
/**
 * The size of a joint's tabs, adjustable mostly for drawers: how long each is along
 * the joint, and the most between two. Left out: 2" tabs no more than 6" apart (`TAB`, `src/design/tabs.ts`).
 */
export interface TabSize {
  length?: Length;
  between?: Length;
}

export interface RoomLook {
  floor?: { kind: 'planks' | 'tile' | 'concrete' | 'plain'; color: string };
  wall?: string;
  tile?: { look: 'subway' | 'square' | 'slab'; color: string; grout: string };
}

/** A window in a wall of the room: its left edge `along` from the wall's left end as you face the wall, its sill off the floor. */
export interface RoomWindow {
  wall: RoomWall;
  along: Length;
  width: Length;
  height: Length;
  sill: Length;
}

export type RoomWall = 'back' | 'left' | 'right' | 'front';

/**
 * Where a run, or a cabinet in no run, stands in the room: against a wall, its left end
 * `along` from the wall's left end as you face the wall; or free (an island), its
 * back-left corner at `x` along the back wall and `y` out from it, turned by `turn`
 * degrees (0 faces the front wall).
 */
/** The kinds of appliance a room can hold. Generic: a size and a place, nothing made for them. */
export type ApplianceKind = 'refrigerator' | 'dishwasher' | 'range' | 'microwave';

/**
 * An appliance standing in the room: a generic box with a size, placed
 * against a wall or free like a cabinet in no run. Nothing is cut for it. It is drawn, and a
 * top beside it runs over it (a dishwasher) or butts its side (a range, a refrigerator).
 * A sink is not one: it is its cabinet's (`CabinetSink`).
 */
export interface Appliance {
  id: Id;
  kind: ApplianceKind;
  name: string;
  /** Width across its front, height, and depth from the wall to its front, handles and doors included. */
  size: { width: Length; height: Length; depth: Length };
  /** Its underside off the floor: a microwave hung over a range. Left out: it stands on the floor. */
  offFloor?: Length;
  /** Where its left end stands, as a cabinet's. */
  placement: Placement;
}

export type Placement ={ wall: RoomWall; along: Length } | { wall: 'free'; x: Length; y: Length; turn: 0 | 90 | 180 | 270 };

/**
 * The size a new cabinet of each form starts at (milestone 5): a project value, asked in
 * Setup. Height is from the floor, toe kick included; depth is the case alone, as a
 * cabinet's own size is. Only where a new cabinet starts: changing these changes no
 * cabinet that is already there.
 */
export interface StartSizes {
  base: { height: Length; depth: Length };
  wall: { height: Length; depth: Length };
  tall: { height: Length; depth: Length };
  /** The standard widths Design offers as quick picks beside the width input. */
  widths: Record<CabinetForm, Length[]>;
}

/**
 * How a sink is set in its top. `dropIn`: its rim lies on the top, its bowl down through an opening a little smaller
 * than the rim. `undermount`: fixed under the top, the opening its bowl's, the top's cut edge showing. `vessel`: a bowl
 * standing on the top, only its drain through it. `integrated`: a bought top with its bowl in it (cultured marble,
 * ceramic): no top is made over the cabinet. `farmhouse`: an apron-front sink standing on a frame inside the
 * cabinet, its apron the front of the cabinet's top row, the top notched round it.
 */
export type SinkMount = 'dropIn' | 'undermount' | 'vessel' | 'integrated' | 'farmhouse';

/**
 * A sink over a base cabinet. Its sizes are the maker's: `width` across and `depth` front to back are its outside
 * (the rim of a drop-in, the bowl's outside of an undermount, a vessel or a farmhouse sink, the whole top of an
 * integrated one), `bowlDepth` how deep its bowl is.
 */
export interface CabinetSink {
  mount: SinkMount;
  width: Length;
  depth: Length;
  bowlDepth: Length;
  /** Square-cornered (rounded a little) or round: an oval, a circle when as wide as deep. */
  shape: 'rectangle' | 'oval';
  /** Two bowls side by side, the left one this share of the width (0.5 equal, 0.6 a 60/40). Left out: one bowl. */
  double?: { leftShare: number };
  /** Its centre's distance right of the cabinet's middle (negative: left). Left out: centred. */
  offset?: Length;
  /** Faucet holes cut through the top behind it: one, or three that far apart from the outer holes' centres. Left out: none. */
  faucet?: { holes: 1 | 3; spread?: Length };
  /** A farmhouse sink's apron: how tall it is, and how far its face stands in front of the doors' faces. */
  apron?: { height: Length; proud: Length };
}

/** What a block under a sink is: it names it and gives a new one its starting size. */
export type ObstacleKind = 'trap' | 'bowl' | 'valve' | 'disposal' | 'other';

/**
 * Something in the way inside a cabinet: a measured block, drawn grey, never cut. A tray
 * or a shelf is cut round it, or the design says what does not fit.
 */
export interface Obstacle {
  id: Id;
  kind: ObstacleKind;
  /** Its own name, when the kind's is not enough ("Filter"). */
  name?: string;
  /** Across the cabinet. */
  width: Length;
  /** Front to back. */
  depth: Length;
  /** Its left edge from the inside of the cabinet's left side. Left out: centred across the cabinet. */
  fromLeft?: Length;
  /** Its back from the cabinet's back. Left out: against the back. */
  fromBack?: Length;
  /** Its lowest point above the cabinet's floor: a tray rolls under it. Left out: it stands on the floor. */
  clearUnder?: Length;
  /** How tall it is from its lowest point. Left out: it goes up to the top of the cabinet. */
  height?: Length;
}

/**
 * Something made to stand inside a cabinet, behind its doors: a roll-out tray, a fixed
 * shelf, or a shelf with a narrow tray on it each side of what is in the way. `up` is how high it stands
 * above the cabinet's floor: the underside of a tray's walls, the top of a shelf. A tray with none stands
 * on the floor.
 */
export interface Organizer {
  /** Its parts carry it: `tray-bottom`, `tray-upper`, `shelf`, `pullout`. */
  id: Id;
  /**
   * A tray, a shelf, a shelf with side trays, or a pull-out for bins: a narrow tray on a frame of
   * its own on the cabinet's floor, as wide as the bins it carries, for trash and recycling. Or a
   * narrow pull-out (the same tray and frame, as wide as asked, with tall walls: for bottles beside a range),
   * and vertical dividers (thin boards on edge between a base and a top, for trays and baking sheets).
   * In a blind corner cabinet, a tray in the blind half on slides that run sideways: it is pulled
   * across into the reachable half, over the frame of the pull-out in front of the doors, once that is out.
   */
  kind: 'tray' | 'shelf' | 'sideTrays' | 'pullOut' | 'narrow' | 'dividers' | 'blindTray';
  up?: Length;
  /**
   * A tray on the cabinet's floor only: `bottom` puts it on bottom-mount slides screwed
   * to the floor under it, with nothing standing beside it (no frame, no strips). Left out: on slides at its
   * sides, as every other tray.
   */
  slides?: 'bottom';
  /**
   * A blind corner tray only: once it has come across the cabinet it also comes forward,
   * out of the door opening. It rides on a platform: the platform on the sideways slides, the tray on a second
   * pair on the platform. For a tray up in the blind half, where nothing stands high in front of the door.
   */
  forward?: boolean;
  /** A tray's walls: how high. Left out: 3-1/2". A tall tray (8") holds bottles upright. */
  wall?: Length;
  /** A pull-out's bins, measured: across, front to back and high, and how many stand one behind another. */
  bins?: { width: Length; depth: Length; height: Length; count: number };
  /** A pull-out's or the dividers' place: the left edge from the inside of the cabinet's left side. Left out: as far left as the door opening lets it. */
  fromLeft?: Length;
  /** A narrow pull-out's tray, outside; or how wide the dividers' rack is (left out: the cabinet's inside width). */
  width?: Length;
  /** The dividers: how many boards (the two at the ends counted), and how tall the rack is. */
  count?: number;
  height?: Length;
}

/**
 * What a base cabinet is fitted out with inside (`design/underSink.ts`): what is in the way, as a list of
 * measured blocks (under a sink: the trap and the drain, the bowl, the supply valves, a disposal), and the
 * organizers made to go round them. A cabinet with no sink has no blocks and takes the same organizers.
 */
export interface CabinetInside {
  obstacles: Obstacle[];
  organizers: Organizer[];
  /**
   * What carries the trays' slides. Strips: build-out strips glued and screwed to the
   * cabinet's sides. Frame: a frame of two standards on two rails, squared on the bench and screwed to the
   * cabinet's floor, touching no side. Left out: the frame in an existing cabinet, strips in one made here.
   */
  mounting?: 'strips' | 'frame';
  /** Racks on the inside of its doors. Left out: none. */
  doorRacks?: DoorRacks;
  /**
   * A tilt-out tray behind the false front over the doors of a sink cabinet: a shallow trough for
   * sponges, as wide and as high as the opening behind the false front, `depth` from front to back. Only
   * the tray is made; the false front is the cabinet's own, hung on tilt-out hinges that are bought.
   */
  tiltOut?: { width: Length; height: Length; depth: Length };
}

/**
 * Racks screwed to the inside of a base cabinet's doors (`design/doorRacks.ts`): which doors (a pair, each
 * with racks; or its one door, by the side it is hinged on), how many on each, one over another, and how
 * far they stand into the cabinet. What is behind them starts that much further back.
 */
export interface DoorRacks {
  doors: 'pair' | 'left' | 'right';
  count: number;
  depth: Length;
}

/**
 * A drawer opening of a case that is already there, above its lowest opening: its
 * clear height, the rail under it (behind a face frame; frameless there is none and it is not used), and
 * its front, kept as it is or made new here. A new front is a front only: the box and its slides stay.
 */
export interface ExistingDrawer {
  height: Length;
  rail: Length;
  fronts: 'kept' | 'new';
}

/**
 * A case that is already there: measured, never designed. None of it is cut, listed or
 * bought; what stands inside it is derived as in a cabinet made here. The cabinet's size, its style and its
 * face frame's widths are then worked out from these (`design/existing.ts`), never typed.
 */
export interface ExistingCase {
  /** Face frame or frameless. */
  frame: 'faceFrame' | 'frameless';
  /** The door opening (the lowest one, when it has drawer openings too), clear. Frameless, the opening is the inside of the case and this is not used. */
  opening: { width: Length; height: Length };
  /**
   * The inside of the box: between the sides at the front and at the back (the smaller is used), from the
   * front edge of the sides to the back, and from its floor up to what is over it. Left out: not
   * measured. Only new doors can be made for it then (refacing); nothing is fitted inside, and it is drawn
   * at a size taken from its opening.
   */
  inside?: { widthFront: Length; widthBack: Length; depth: Length; height: Length };
  /** How far the hinges stand in from the edge of the door opening: what goes in must clear them. */
  hingeStandIn: Length;
  /** The fronts on its lowest opening, its doors: kept as they are (nothing is made), or new ones made here on its opening (refacing). */
  fronts: 'kept' | 'new';
  /** The doors it has now, measured: the overlay they have is worked out and hinges are suggested for it. */
  doors?: ExistingDoors;
  /**
   * It is a blind corner cabinet: its box runs on past its door opening on one side,
   * behind the cabinets of the other wall. `reach`: from the inside of its far side, on that side, to the
   * nearer edge of the door opening.
   */
  blind?: { side: 'left' | 'right'; reach: Length };
  /**
   * The drawer openings above its lowest opening, top to bottom, each as wide as `opening`. The
   * cabinet's layout has a drawer row for each, in the same order, and then the lowest opening's row.
   * Left out: none.
   */
  drawers?: ExistingDrawer[];
  /** What the lowest opening (`opening`, with `fronts`) holds when it is not doors: a drawer, in a bank of drawers. */
  lowest?: 'drawer';
}

/** What is a cabinet's own, never the project's. */
export interface CabinetOwn {
  /** This cabinet's inside is finished differently from the project's (`ProjectFinish.inside`). Left out: as the project's. */
  insideFinish?: InsideFinish;
  /**
   * This cabinet's own face frame overhang at one side or both, where it differs from the project's
   * (`FaceFrameDesign.overhang`): none at an end that shows, more at a wall to scribe.
   */
  frameOverhang?: { left?: Length; right?: Length };
  /**
   * Derived, never stored: set on the copy of a cabinet that stands for its box alone (`boxOf`), which is narrower
   * than the frame. How much less of each stile that box has in front of it than the frame's stile is wide.
   */
  boxInset?: { left: Mm; right: Mm };
  id: Id;
  name: string;
  /** Union grows: vanity. */
  form: CabinetForm;
  /** A wall cabinet's bottom, off the floor. Only places it in the picture of the whole project. */
  offFloor?: Length;
  /** Where its left end stands in the room when it is in no run (milestone 6). Left out: placed automatically. */
  placement?: Placement;
  /** A corner cabinet (milestone 6): it turns a room's corner where two runs meet. Left out: an ordinary cabinet. */
  corner?: CornerCabinet;
  /** A top over it when it is a floor cabinet in no run (milestone 7). In a run, the run's top. */
  top?: TopDesign;
  /**
   * A wall-form case that stands on another piece's top: a hutch on a desk. `of`: the piece
   * under it. It is not hung: no hanging rails and no cleat are made for it, it stands at the back of that piece's
   * top, its left ends in line, and is screwed to it. Its `offFloor` is that top's height when it was stood there;
   * the picture of the whole project stands it on the piece as that is now.
   */
  onTop?: { of: Id };
  /**
   * What reaches from a closet tower to the wall, or to the next tower, each side: a
   * stretch with no case. Left out: nothing beside it.
   */
  spans?: { left?: TowerSpan; right?: TowerSpan };
  /**
   * A hanging rod: a bought closet rod across an open row, between the sides, on a pair of
   * flanges. `rowId`: the row it hangs in (left out: the lowest open one). `down`: its centre below the top of
   * that row's opening (left out: 2-1/2"). Nothing is made for it; it is on the hardware list and drawn.
   */
  rod?: { rowId?: Id; down?: Length };
  /**
   * Holes through the back for cables: one behind each opening that is open, `up` above
   * the opening's floor (left out: 3"), cut on the CNC with the back. `air`: a slot for air too, high in the
   * opening, behind equipment that runs warm. Left out: none.
   */
  cables?: { diameter: Length; up?: Length; air?: boolean };
  /**
   * A power hub in the open space at the top of a base cabinet (the table hub of
   * lr4-sandbox): a dust port, a power inlet and two outlets set into the side it names, a switch panel
   * screwed on at the front of that space, and the upper back a panel that comes off, with a second port
   * (`src/design/hub.ts`). Left out: none.
   */
  hub?: { side: 'left' | 'right' };
  /**
   * No back: an open case, as a closet tower or a room divider. Nothing is cut in the sides
   * for one and the bottom, the shelves and the top run the full depth. Left out: the back the joinery says.
   */
  noBack?: boolean;
  /**
   * No bottom panel, as some dressers have none: a case of drawers with a flat bottom has a
   * stretcher at the bottom at the front and one at the back in its place, as under a countertop at the top;
   * between corner posts only the back one, the frame's bottom rail being the front one. Not read where the case
   * has a toe kick, which stands on its bottom.
   */
  noBottom?: boolean;
  /**
   * What closes the top of a floor-standing case. Left out: a base cabinet's two stretchers,
   * for a countertop to lie on. `panel`: a full top panel between the sides, joined to them like the bottom, as
   * a wall or a tall cabinet always has: a bookcase's or a dresser's top, or what a laid-on top is fastened to.
   */
  caseTop?: 'panel';
  /**
   * A filler board behind its back at one side (the board between a range
   * and a peninsula): floor to the cabinet's top, `width` wide from the back to what stands
   * behind it (an appliance's side), its face in line with that side of the case. It closes the
   * space a top's overhang needs between the cabinet and the appliance.
   */
  backFiller?: { side: 'left' | 'right'; width: Length };
  /**
   * More under a base cabinet's top than its two stretchers (for a vanity top). Corner
   * blocks: a triangle in each top corner, between a side and a stretcher. Cross stretchers: two strips
   * from the front stretcher to the back one, `apart` clear between them, centred (either side of a
   * sink's bowl). All flush with the top of the case. Left out: the stretchers alone.
   */
  topSupport?: { cornerBlocks?: boolean; crossStretchers?: { apart: Length } };
  /** What it is fitted out with inside, behind its doors (organizers): what is in the way, and the trays and shelves made to go round it. */
  inside?: CabinetInside;
  /** A sink over it, set in the top that lies over it (`src/design/sinks.ts`). Left out: none. A base cabinet's only. */
  sink?: CabinetSink;
  /** Set: its case is already there, measured. Left out: the case is made here. */
  existing?: ExistingCase;
  /**
   * Outside of the case. Height is from the floor, toe kick included. Depth is the
   * case alone, front edge of the sides to the back: a face frame and the fronts
   * add to it, so the sides are the same in both construction styles.
   */
  size: { width: Length; height: Length; depth: Length };
  /**
   * Whether each side of the cabinet shows. It decides which face of a side takes
   * the pocket holes that attach the face frame: the inside face of an exposed
   * side, the outside face of a hidden one.
   */
  sides: { left: SideExposure; right: SideExposure };
  /** Adjustable shelves on pins, spaced evenly in the door opening. */
  adjustableShelves: number;
  layout: OpeningLayout;
  /**
   * How many of it are made: it is designed once, and every part of it, its fronts'
   * and its drawer boxes' included, is cut this many times. 1 or more.
   */
  quantity: number;
}

/**
 * Stored: a cabinet as the project keeps it. A setting under `overrides` is this
 * cabinet's own, whole (all of `joinery`, not one field of it); every other setting
 * is the project's.
 */
export interface StoredCabinet extends CabinetOwn {
  /** The kind of piece it is (`StoredPiece`): a case, which is what a cabinet is. */
  kind: 'case';
  overrides?: Partial<CabinetSettings>;
}

/**
 * A stretch beside a closet tower with no case (a tall centre tower with rods for hanging
 * clothes going to the wall on each side): a shelf on a cleat at each end, and a bought
 * rod under it. `length`: from the tower's side to the wall, or to the side of the next tower. `up`: the
 * shelf's top off the floor.
 */
export interface TowerSpan {
  length: Length;
  to: 'wall' | 'tower';
  up: Length;
  /** A rod under the shelf. */
  rod?: boolean;
  /** No shelf: the rod alone, from flange to flange. */
  noShelf?: boolean;
}

/**
 * What every piece has, whatever its kind (a table is not stored as a
 * cabinet): an id, a name, a size, how many are made and where it stands. What works on
 * any piece (tags, copies, batches, the scene, the room, the lists) needs no more than this.
 */
export type PieceOwn = Pick<CabinetOwn, 'id' | 'name' | 'size' | 'quantity' | 'placement'>;

/**
 * A piece as the project stores it (`context.pieces`): what every piece has, and then its kind. **A case** is a
 * cabinet with everything a cabinet has: sides, openings, fronts, a toe kick, runs, corners. **A frame** is legs
 * and aprons under a top, a table, and carries none of a case's fields. What is about a
 * case asks for a case (`cabinetsOf`, `storedCases`) and is never handed another kind; `framesOf` is the tables.
 */
export type StoredPiece = StoredCabinet | StoredFrame;

/**
 * A table: four legs of square stock, four aprons between them set in from the legs'
 * faces, and a top over all. Its size is the whole of it: the top's length (`width`) and width (`depth`), and
 * the height from the floor to the top's surface. The legs stand in from the top's edges by its overhangs.
 * What its parts are made of and how it is finished is the project's style unless it says otherwise: the aprons
 * are the case material, the top Setup's top material.
 */
export interface StoredFrame extends PieceOwn {
  kind: 'frame';
  /**
   * Square stock: a material with `section: 'square'`. Or, with `layers`, a sheet or a
   * board: each leg is that many strips of it glued face to face, as wide as the stack is thick, then trimmed.
   */
  legs: { materialId: Id; layers?: 2 | 3 | 4 };
  /**
   * A lower shelf: a panel between the legs with its top `up` off the floor, cut round each leg on the
   * CNC (dog-bones in the notches' corners). Its edges stand `inset` in from the legs' outside faces (left out:
   * as far as the aprons). Left out: no shelf.
   */
  shelf?: { up: Length; inset?: Length; materialId?: Id };
  aprons: {
    /** How tall they are. */
    height: Length;
    /** How far their outside faces stand in from the legs' outside faces. */
    setback: Length;
    /** Left out: the project's case material. */
    materialId?: Id;
  };
  /** The top, laid on the legs and aprons: over the legs' outside faces by its overhangs, its edge all round. */
  top: OwnTop;
  /**
   * How the aprons meet the legs. Left out: pocket screws from the aprons' inside faces into the legs (nothing
   * is cut in a leg). `braces`: bought corner braces with a hanger bolt into each leg, which come apart.
   * `dowels`: two dowels a joint, their holes in the aprons' ends and in the legs drilled by hand
   * through a printed jig (the jigs page's dowel jig), glued.
   */
  joint?: 'braces' | 'dowels';
}
export type PieceKind = StoredPiece['kind'];

/**
 * A cabinet with its settings resolved: its own values, and each setting from its
 * overrides or else from the project. Everything derived works from this. It is made
 * by `cabinetsOf` (`design/settings.ts`) as a view of the stored project: writing a
 * field writes to where it is stored, so setting `joinery.case` on a cabinet that
 * follows the project changes the project.
 */
export interface CabinetDesign extends CabinetOwn, CabinetSettings {
  /** A cabinet is the piece that is a case. Read only. */
  readonly kind: 'case';
  /** The stored overrides, to tell which settings are this cabinet's own. Read only. */
  readonly overrides?: Partial<CabinetSettings>;
  /**
   * The run the cabinet stands in, if any. Its depth, height and toe kick are then the
   * run's (writing one writes the run's), its sides are derived and its quantity is 1.
   * Read only.
   */
  readonly runId?: Id;
}

/**
 * How a part that spans the cabinet meets the sides. Pocket screws: a butt joint,
 * screwed from the part into the sides; no size changes. Dado: the part's ends sit in
 * dados in the sides, glued only, and the part is longer by twice the dado's depth.
 * Through screws: a butt joint, screwed through the outside of the sides into the
 * part's ends; no size changes, a hole through each side at each screw, and the
 * heads show on the outside of the case. Tabs: the part's ends have
 * tabs in their outline and the sides a slot for each, cut on the CNC and glued, with no
 * screws; through the sides, where the tabs' ends show outside, or blind (`CabinetJoinery.tabs`).
 */
export type CaseJoint = 'pocketScrews' | 'dado' | 'throughScrews' | 'tabs';

export interface CabinetJoinery {
  /** The joint of every case part that has no override. */
  case: CaseJoint;
  /** A part listed here uses its own joint, the same at both of its ends. */
  overrides?: { bottom?: CaseJoint; frontStretcher?: CaseJoint; backStretcher?: CaseJoint };
  /**
   * How a tabbed joint's tabs are made. Left out: through the part they meet, their ends flush with its outside
   * face. `blind`: into a pocket in its inside face, so nothing shows outside. `proud`: how far a through tab
   * stands out of the outside face, to be sanded back.
   */
  tabs?: { blind?: boolean; proud?: Length } & TabSize;
  /** How the back meets the sides. */
  back: BackJoint;
  /** Whether the back stretcher lies flat like the front one or stands on edge against the back. */
  backStretcherForm: BackStretcherForm;
}

/**
 * Rabbet: the back sits in a rabbet along the rear inside edge of each side. Groove:
 * it sits in a groove in each side, set in from the rear edge. Applied: it is
 * fastened over the rear of the case, and the sides are shallower by its thickness.
 * Tabs: a back of 1/2" or more stands between
 * the sides, set in from the rear as for a groove, with tabs along its two edges in slots in
 * the sides, through or blind as the case's tabs are (`CabinetJoinery.tabs`).
 */
export type BackJoint = 'rabbet' | 'groove' | 'applied' | 'tabs';

/** Flat: laid flat at the top, like the front stretcher. Nailer: on edge, its rear face against the back. */
export type BackStretcherForm = 'flat' | 'nailer';

/** Exposed: the side is seen. Hidden: it is against a wall or another cabinet. */
export type SideExposure = 'exposed' | 'hidden';

/**
 * The frame is as wide as the cabinet and as tall as the case front. `overhang` (a face frame
 * usually hangs over the sides of the cabinet by about 1/4"): how far it stands past the outside of
 * each side of the box. The cabinet's width is the frame's; the box behind it is narrower by twice this. Left
 * out: flush at the sides.
 */
export interface FaceFrameDesign {
  stileWidth: Length;
  railWidth: Length;
  overhang?: Length;
  /** Its measured thickness is the frame's thickness. */
  materialId: Id;
}

/**
 * Frameless fronts are full overlay: they cover the case front, so their overlays
 * are derived from these two values and not typed per front.
 */
export interface FramelessDesign {
  /** Between the outside edges of the fronts and the outside of the case. */
  reveal: Length;
  /** Between two fronts, one above the other. The gap between a pair of doors is the door set's. */
  frontGap: Length;
  /** Off: bare edges, parts cut to full size. On: the front edges are banded and those parts are cut smaller by the band. */
  edgeBanding: boolean;
  /**
   * A solid wood strip this thick glued to the front edges, in place of banding: for a plywood
   * case, whose edge must not show from the front. Of the frame's material (`faceFrame.materialId`).
   */
  edgeStrip?: Length;
}

/** The shop style: inset fronts, flush with the front edges of the case. */
export interface ShopStyleDesign {
  /** The gap around every front: to the case all round, and between two fronts, one above the other. */
  gap: Length;
  /** The front edges of the case banded, as a frameless case's may be. Left out: bare, as a shop cabinet's are. */
  edgeBanding?: boolean;
  /**
   * A solid wood strip this thick glued to the front edges of the case (the inset style made fit
   * for a house), as `FramelessDesign.edgeStrip`. The inset fronts are then flush with the strips' faces.
   */
  edgeStrip?: Length;
}

/**
 * A stack of openings, top to bottom. Drawer over doors is two rows; doors only,
 * drawers only and a single door are the same list with other rows.
 */
export interface OpeningLayout {
  rows: OpeningRow[];
  /**
   * Milestone 10: bays side by side, left to right, each the full height of the case with every
   * row of the layout in it. Left out (or one): one bay, as before. A partition stands between two
   * bays (frameless, shop), or a mullion in the face frame.
   */
  bays?: Bay[];
  /**
   * A face frame cabinet with bays: `false` for no partition behind its mullions (the shelves then run the full
   * width). Left out: a partition behind each, as between any two bays.
   */
  partitions?: boolean;
  /** Kept while the layout has no use for it, so switching back re-enters nothing. */
  kept?: { drawerHeight?: Length; upperShelves?: number };
}

/** A bay of a cabinet (milestone 10): its openings' clear width; left out, the bays share what is left equally. */
export interface Bay {
  width?: Length;
  /**
   * Its rows of doors have their doors off: an open bay beside bays with doors, as a TV
   * stand's middle one. Its drawers, if the layout has any, stay. The door sets are kept, as an open row's are.
   */
  open?: boolean;
}

export interface OpeningRow {
  /** Stable within the cabinet; part of the opening's id. */
  id: Id;
  /** A pair or a single door is the door set's choice, not the row's. */
  use: 'drawer' | 'doors';
  /**
   * A door row with its doors off: open shelves, as a bookcase's. Everything else a door
   * row has stays (its shelves, their pin holes, a fixed shelf between two of them). The door set that was on
   * it is kept in the project, unmounted, and comes back when the doors are put back.
   */
  open?: boolean;
  /** Clear height of the opening. Rows without one share what is left equally. */
  height?: Length;
  /**
   * A drawer row split into this many drawers side by side in every bay (2 or 3, as the
   * small drawers across the top of a dresser), a short mullion between two. Behind a face frame only (corner
   * posts are one): elsewhere it is not read.
   */
  split?: number;
  /**
   * Adjustable shelves behind a door row that is not the cabinet's lowest (the upper
   * doors of doors over doors). The lowest door row's are the cabinet's `adjustableShelves`.
   */
  shelves?: number;
}

/**
 * Derived: one per row. A door set or drawer mounts on it by id, the same way a
 * door set mounts on a measured opening.
 */
export interface CabinetOpening {
  /** `${cabinetId}/${rowId}` */
  id: Id;
  cabinetId: Id;
  rowId: Id;
  name: string;
  use: OpeningRow['use'];
  /** A door row's opening with its doors off (`OpeningRow.open`): nothing hangs on it. */
  open?: boolean;
  construction: ConstructionStyle;
  width: Mm;
  height: Mm;
  /** Bottom-left corner, on the front plane of what the fronts close against. */
  origin: { x: Mm; y: Mm };
  /** What hinges mount on: the face frame's thickness, or the case side's when frameless. */
  frameThickness: Mm;
  /** The plane the fronts close against, forward of the case front: the frame's thickness, or 0. */
  frontPlane: Mm;
  /**
   * One of the openings a split row has in a bay (`OpeningRow.split`): which, from the left (1, 2, …), and the
   * whole opening they share, mullions and all. The first keeps the bay's id; the others end `~s2`, `~s3`.
   */
  part?: { n: number; of: number; x: Mm; width: Mm };
  /** Between corner posts: the fronts sit inside the opening, their faces flush with the frame's (`fixedOverlay` is then all negative). */
  inFrame?: true;
  /**
   * The top row, a drawer row whole across its bay, with doors under it, on a case made here: the one place a drawer
   * may be a false front (`DrawerDesign.falseFront`), as over a sink.
   */
  overDoors?: true;
  /** That top row over doors, where a farmhouse sink's apron stands in place of a front: nothing is hung on it. */
  apron?: true;
  /**
   * The overlays of a front on this opening when the construction style fixes them
   * (frameless: full overlay; shop: inset, all negative). Unset when each front
   * carries its own (face frame). Negative where the front stops short of the
   * opening's edge.
   */
  /** The front stands inside the opening, its face flush with the case front, whatever the construction style (doors fixed to a lazy susan). */
  flush?: boolean;
  fixedOverlay?: {
    side: Mm;
    top: Mm;
    bottom: Mm;
    /**
     * Milestone 10: where a bay's edge is a partition the overlays differ side to side (the fronts
     * cover half the partition, less half the gap): the overlay at each edge. `side` stays the outer
     * one, which the hinge is chosen for.
     */
    left?: Mm;
    right?: Mm;
  };
  /** Milestone 10: which bay, counted from 1 at the left, when the cabinet has more than one. */
  bay?: number;
  /**
   * Set when the fronts sit inside the opening, flush with the case front (the shop
   * style). `frontMaterialId` is what a front is made of until it is given its own.
   */
  inset?: { gap: Mm; frontMaterialId: Id };
  /**
   * Set when the opening does not face the cabinet's +Z (an L-shaped corner cabinet's second
   * face): where its front-left corner is on the case front's plane, and the direction across
   * it. `origin.x` is then across the face from that corner, as for any opening.
   */
  frame?: { origin: Vec3; xAxis: Vec3 };
}
