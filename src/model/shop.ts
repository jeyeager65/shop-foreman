/**
 * Shop profile and libraries: stored outside any project.
 * `tuneMe` lists the field names that still hold placeholder values.
 */
import type { CabinetType, Id, Preset } from './project';
import type { Length, Mm, ShownIn, UnitPreferences } from './units';

export interface ShopProfile {
  /** The app's version when it was saved, to its second number (`SAVE_VERSION`): a profile of another is not read, and the shop starts again from the starter one. */
  schemaVersion: string;
  machines: MachineProfile[];
  activeMachineId: Id;
  tools: Tool[];
  /**
   * Kinds of material a project could buy, to copy into a project rather than retype.
   * Having one here says nothing about owning it: what a job is made of is the
   * project's (`Project.materials`), and nothing derived reads this.
   */
  materialCatalog: Material[];
  /** The catalog's groups (MDF, plywood ...), each material in one. Whether it has grain is the group's. */
  materialGroups: MaterialGroup[];
  hardware: Hardware[];
  /** The saws in the shop: Plan only offers a saw the shop has. */
  saws: Saws;
  /** Paints and stains a project may be finished in. */
  finishes: Finish[];
  /** The user's own presets (milestone 5). The built-in ones come with the app and are not stored. */
  presets: Preset[];
  units: UnitPreferences;
  /** The metal sleeve the pocket-hole drill guide is printed for. Left out: `POCKET_SLEEVE` (`src/geometry/pocketHole.ts`). */
  pocketSleeve?: PocketSleeve;
}

/**
 * A metal sleeve that steers the pilot bit in the printed pocket-hole drill guide (a
 * stainless spacer, a bronze bushing, whatever can be bought: its size is set within limits, since what can be
 * had differs). One, or two in line. Two short ones may be bearings.
 */
export interface PocketSleeve {
  /** Its hole, which the bit turns in. */
  bore: Mm;
  outside: Mm;
  /** Over all, a flange's thickness too. */
  length: Mm;
  count: 1 | 2;
  /**
   * A flanged sleeve: the flange's diameter and thickness. It goes in until its flange is seated in a recess, flush:
   * one from the boss's back; a second from the fence side, shut in by the board's edge.
   */
  flange?: { diameter: Mm; thickness: Mm };
  shownIn?: ShownIn;
}

/**
 * The shop as a job sees it: the shop profile with the project's materials in place of
 * the catalog (`shopFor`). Everything derived takes this, never the stored profile.
 */
export type Shop = Omit<ShopProfile, 'materialCatalog' | 'materialGroups'> & { materials: Material[] };

/**
 * A paint or a stain, for the picture and the lists: nothing that is cut depends on
 * it. Paint covers the wood; stain colours it and leaves the grain showing.
 */
export interface Finish {
  id: Id;
  name: string;
  /**
   * A paint or a stain is chosen for a group of parts. A clear coat goes over a stain and on insides that are
   * clear coated; a primer goes under a paint. Neither has a colour.
   */
  kind: FinishKind;
  /** As `#rrggbb`: near enough to choose between, not a maker's colour. Empty for a clear coat and a primer. */
  color: string;
  /** Coats of this product itself: of paint, of stain, of the clear coat where it is the whole finish (an inside). */
  coats: number;
  /** A paint: coats of primer under it. 0: none. */
  primerCoats?: number;
  /** A stain: coats of the clear coat over it. 0: none. */
  clearCoats?: number;
  /** The area one coat of a litre covers, in m². Shown as square feet a quart where sizes are in inches. Tune me. */
  coverage: number;
  /** The fields still holding placeholder values (`coverage`). */
  tuneMe?: string[];
}
export type FinishKind = 'paint' | 'stain' | 'clear' | 'primer';

/**
 * Saws that cut parts out. A jig saw is not here: it is only the hand step for the
 * toe-kick notch of a side that was cut out on a saw.
 */
export interface Saws {
  /** `ripCapacity`: fence to blade. A part wider than this both ways is too big for it. */
  tableSaw: { owned: boolean; ripCapacity: Length };
  /** Run along a straightedge: breaks a sheet down, and takes what the table saw cannot. */
  circularSaw: { owned: boolean };
  /** Cuts solid-wood parts (the face frame, build-out strips) to length. */
  miterSaw: { owned: boolean };
}

/** A hand-set router: what each mark on its speed dial gives. */
export interface Router {
  id: Id;
  name: string;
  /** In dial order; settings between the marks are interpolated. */
  speeds: { dial: number; rpm: number }[];
  /** Where the table came from. */
  source?: string;
}

export interface MachineProfile {
  id: Id;
  name: string;
  /** The unit each of its plain mm values is shown in (`ShownIn`); mm where it does not say. */
  shownIn?: ShownIn;
  /** The router on this machine. Bits carry an RPM; this turns it into a dial setting. */
  router?: Router;
  cuttingArea: { x: Length; y: Length };
  /**
   * Set when Y is a soft limit: a sheet longer than the cutting area may hang over the
   * ends of the table, up to this length, and is cut in two set-ups, slid along Y
   * between them onto pins. X stays a hard limit. Left out: no tiling.
   */
  tiling?: { maxLength: Length };
  defaultSheet: { x: Length; y: Length };
  /** manual: MSG + M0 pauses, no M3/M5. */
  routerControl: 'manual' | 'spindle';
  workZero: 'stockFrontLeft';
  probe: {
    plateThickness: Mm;
    /** Side of the square of uncut top surface the plate needs. */
    clearSquare: Mm;
    /** mm/min */
    fastFeed: number;
    slowFeed: number;
    maxTravel: Mm;
    retract: Mm;
    /** Gap between the stock edge and the probe square. */
    edgeInset: Mm;
  };
  flipPins: { diameter: Length; holeClearance: Mm; spoilboardDepth: Mm };
  /** Above the stock top. */
  safeHeight: Mm;
  /**
   * Home Z before each bit change and at the end of a file: on a machine whose Z homes
   * to the top, that makes room to change the bit.
   */
  homeZForBitChange?: boolean;
  postOptions?: {
    /** Write a settings block of FluidNC parameters (#<t1_feed>, #<clear_z>, ...) and use them. */
    parameters?: boolean;
  };
  /** mm/min */
  maxPlungeFeed: number;
  /** mm/min, used for time estimates only. */
  rapidFeed: number;
  toolChangeSeconds: number;
  nesting: {
    /** Between parts on the blank. */
    partSpacing: Mm;
    /** Pin centre from the blank's front and back edges. */
    pinInset: Mm;
    /** Waste kept between the parts and the blank's edges: room for the cut and for holding the blank down. */
    edgeMargin?: Mm;
    /**
     * How much shorter than nominal the default sheet really is in each direction,
     * e.g. a 24 x 48 cut from a 48 x 96 loses a saw kerf.
     */
    sheetTrim?: Mm;
  };
  /** `fromCorner`: how far a holding tab keeps from a corner of the cut (left out: 25 mm). A side too short for a tab that far from both its ends gets none. */
  /**
   * `heightPercent`: how high a holding tab stands, as a share of the stock's thickness (30 to 50 is
   * usual; left out: 40), so a thin back's tab is thin and a thick side's strong.
   * `method`: how they are placed (`tabCenters`, `src/cam/cuts.ts`). Left out, `spread`, which is shown as "Smart":
   * the part as a whole, a tab near each corner on its long sides and one more only on a side left with none.
   * `perSide`: evenly along every side.
   * `maxSpacing` ("Spacing"): evenly, the most between two tabs; smart, a side longer than this with no tab gets one,
   * and two tabs on one side may be twice this apart.
   */
  tabs: { width: Mm; heightPercent?: number; maxSpacing: Mm; fromCorner?: Mm; method?: 'spread' | 'perSide' };
  /**
   * How far past the bottom of the stock a cut that goes through it is taken (a cutout, a hole through a part),
   * into the spoilboard, so that a table that is not quite flat still cuts the part free.
   * 0 stops at the bottom. Never deeper than the bit's cutting length. Tabs keep their height from the bottom.
   */
  throughExtra: Mm;
  /**
   * How much wider and longer a tab's slot is cut than the tab (tab-and-slot joints), in
   * all, and how much deeper a blind one, so the joint goes together and closes. Left out: 0.15 mm
   * (`DEFAULT_TAB_FIT`). Tune me: it goes by the machine, the bit and the sheet.
   */
  tabFit?: Mm;
  postId: 'fluidnc';
  /**
   * The feeds and speeds of the shop's bits on this machine, by bit then by material type, while it is
   * not the machine in use (the bits are the shop's, their feeds a machine's). The
   * machine in use has none here: its feeds are on the bits (`RouterBit.settings`), which is what a job
   * reads. `useMachine` swaps them. `tuneMe`: the bit's feeds here are still placeholders.
   */
  feeds?: Record<Id, { settings: Record<Id, BitSettings>; tuneMe: boolean }>;
  tuneMe: string[];
}

/** Union grows: laser, drag knife, pen. */
export type Tool = RouterBit;

export interface ToolBase {
  id: Id;
  /** e.g. `1/4" end mill` */
  name: string;
  /** From the router centre; 0,0 for bits. */
  offset: { x: Mm; y: Mm };
  tuneMe: string[];
}

export interface RouterBit extends ToolBase {
  type: 'routerBit';
  /** The unit each of its plain mm values is shown in (`ShownIn`); mm where it does not say. */
  shownIn?: ShownIn;
  shank: Length;
  shape: BitShape;
  /** The whole bit, shank and all. Only used to draw it in the G-code preview. */
  overallLength?: Length;
  /** Keyed by material id. On the machine in use: another machine keeps its own (`MachineProfile.feeds`). */
  settings: Record<Id, BitSettings>;
}

/**
 * A bit sold by a diameter (an end mill, a ball nose, a bull nose, a tapered bit's ball) is like plywood:
 * `nominal` is what it is bought as and names it, `diameter` (`ballDiameter`) is
 * what it measures, and is what every toolpath, offset and `ToolDef` uses. Until it is measured the two
 * are the same and the measured one is marked "tune me".
 */
export type BitShape =
  | {
      kind: 'endMill';
      /** The diameter it is sold as, which names it; unset while it is the measured one. */
      nominal?: Length;
      diameter: Length;
      /** null until measured. */
      cuttingLength: Length | null;
      flutes: number;
      cut: 'up' | 'down' | 'compression';
    }
  /** Round-ended: cuts the ramped floor of a CNC-assisted pocket hole. */
  | { kind: 'ballNose'; /** The diameter it is sold as, which names it; unset while it is the measured one. */ nominal?: Length; diameter: Length; /** null until measured. */ cuttingLength: Length | null; flutes: number }
  /** An end mill with rounded corners: a flat floor that turns up into the wall on a radius. */
  | { kind: 'bullNose'; /** The diameter it is sold as, which names it; unset while it is the measured one. */ nominal?: Length; diameter: Length; cornerRadius: Length; /** null until measured. */ cuttingLength: Length | null; flutes: number }
  /** `angleDeg` is the included angle. `tipDiameter`: a flat on the point; none is a sharp point. */
  | { kind: 'vBit'; angleDeg: number; maxDiameter: Length; maxDepth: Mm; tipDiameter?: Length; /** For its chip load; unset until counted. */ flutes?: number }
  /** The same profile as a V-bit, sold for edges: an included angle and a flat tip. */
  | { kind: 'chamfer'; angleDeg: number; maxDiameter: Length; tipDiameter: Length; maxDepth: Mm; flutes?: number }
  /** A ball tip that widens up a cone of included angle `angleDeg` to `maxDiameter`: for carving. */
  | { kind: 'taperBall'; angleDeg: number; /** The diameter it is sold as, which names it; unset while it is the measured one. */ nominal?: Length; ballDiameter: Length; maxDiameter: Length; /** null until measured. */ cuttingLength: Length | null; flutes: number }
  /** Point-cutting roundover, no bearing. */
  | { kind: 'roundover'; radius: Length; tipDiameter: Length; diameter: Length; flutes?: number };

export interface BitSettings {
  /** mm/min */
  feed: number;
  plungeFeed: number;
  depthPerPass: Mm;
  stepover: Mm;
  /** Spindle speed the bit wants. The dial setting comes from the machine's router. */
  rpm: number;
  /**
   * Left on walls by the roughing passes for one full-depth finishing pass. Unset:
   * a share of the bit's cutting width (10%). 0 turns finishing off.
   */
  finishAllowance?: Mm;
}

/**
 * A material type: plywood, MDF, hardboard, OSB, solid wood. The types come
 * with the app (`MATERIAL_TYPES`); a catalog entry is a thickness of one. The type says what its
 * thicknesses share: whether it has grain, the sheets it is sold in, how it looks in the 3D view,
 * and the bits' feeds and speeds (`RouterBit.settings`, by the type's id). Named a group in the
 * code, from when the catalog was first sorted into them.
 */
export interface MaterialGroup {
  id: Id;
  name: string;
  /** Plywood and solid wood: parts keep a grain direction. MDF has none and may be turned freely. Copied to each of its materials. */
  hasGrain: boolean;
  /** The sheets it is sold in, what a new thickness of it starts with. Left out: sold as boards (solid wood). */
  sheets?: { x: Length; y: Length }[];
  /** How it looks in the 3D view's realistic look: its bare colour, and what is drawn on it. Left out: the type's own from the app. */
  look?: MaterialLook;
}

/** A material's bare look: its colour (0xRRGGBB), and wood grain, OSB's strands or nothing drawn on it. */
export interface MaterialLook {
  color: number;
  texture: 'wood' | 'strands' | 'smooth';
  /**
   * What its cut edges show, where that is not what its faces do: plywood's
   * plies, OSB's strands seen end on, pressed and darker. Left out: its edges look like its faces.
   */
  edge?: 'plies' | 'pressed';
}

/**
 * What a material is usually used for: the pickers in Setup and Design offer only the materials
 * tagged for what they pick. A material with no tags is offered everywhere.
 */
export type MaterialUse = 'cases' | 'backs' | 'fronts' | 'frames' | 'drawers' | 'tops' | 'skins' | 'legs';

export interface Material {
  id: Id;
  name: string;
  /** Its group in the catalog (`ShopProfile.materialGroups`). */
  groupId: Id;
  nominalThickness: Length;
  /** Design uses this one. */
  measuredThickness: Length;
  /**
   * Plywood and solid wood: parts keep a grain direction. MDF has none and may be turned freely.
   * Its group's, copied here so a project's own copy carries it; the catalog sets it from the group.
   */
  hasGrain: boolean;
  /** The sheet sizes it is sold in (x across, y along the grain), for the buying list. Left out: the machine's default sheet. */
  sheets?: { x: Length; y: Length }[];
  /** What it is usually used for. Left out: offered for everything. */
  uses?: MaterialUse[];
  /**
   * Square stock (a 2x2 and a 3x3): sold square, as wide as it is
   * thick, by the length. The nominal thickness names it (2") and the measured one is what it is (1-1/2"), as
   * for a sheet. A part of it is a leg: cut to length on the miter saw, never on the CNC, bought by the length.
   */
  section?: 'square';
  /** The lengths square stock is sold in. Left out: 8'. */
  lengths?: Length[];
  tuneMe: string[];
}

/** Told apart by `kind`. */
export type Hardware = Hinge | Slide | ShelfPin | Handle | BoughtTop | Caster;

/**
 * A plate caster (milestone 9): screwed to a cabinet's bottom by four screws through its
 * plate. A generic entry always exists.
 */
export interface Caster {
  id: Id;
  kind: 'caster';
  name: string;
  generic: boolean;
  /** Floor to the top of its plate: what it raises the cabinet by. */
  overallHeight: Length;
  plate: { width: Mm; length: Mm };
  /** The four screw holes: their centres `x` apart across the plate and `y` along it, and the hole a screw takes. */
  holes: { x: Mm; y: Mm; diameter: Mm };
  screw: string;
  /** With a brake that holds it still. */
  locking: boolean;
  /** A furniture foot: it stands where a caster would, on the same plate, and neither rolls nor locks. */
  foot?: boolean;
  /** What one caster carries, in kg. */
  load: number;
  tuneMe: string[];
}

/**
 * A post-formed laminate countertop sold in stock lengths (milestone 7), with or without a
 * backsplash formed on: cut to length here, nothing on the CNC.
 */
export interface BoughtTop {
  id: Id;
  kind: 'boughtTop';
  name: string;
  generic: boolean;
  /** Front to back, its edge included. */
  depth: Length;
  thickness: Length;
  /** Its formed backsplash's height; null for a flat top. */
  backsplash: Length | null;
  /** The lengths it is sold in, shortest first. */
  lengths: Length[];
  tuneMe: string[];
}

/**
 * A knob or a pull, described by the holes it needs: one screw hole or two, of one
 * size, a known distance apart, through the front. Where they go on a front is the
 * design's (`design/handles.ts`).
 */
export interface Handle {
  id: Id;
  kind: 'handle';
  name: string;
  /** The unit each of its plain mm values is shown in (`ShownIn`); mm where it does not say. */
  shownIn?: ShownIn;
  /** A generic knob and a generic pull always exist. */
  generic: boolean;
  /** One: a knob. Two: a pull. None: a pull cut into the front itself (`routed`). */
  holes: 0 | 1 | 2;
  /** Between the two holes' centres; 0 for a knob. */
  spacing: Mm;
  /** The hole each screw passes through. */
  hole: { diameter: Mm };
  /** For the picture: a pull's length over all (a knob's diameter), how far it stands off the front, and how thick its bar or stem is. */
  look: { length: Mm; projection: Mm; thickness: Mm };
  /**
   * Set: the handle is printed here, to these sizes (`design/printedHandle.ts`), and the
   * job has a file to print it from. `spacing` and `look` are then what it is made to:
   * `look.projection` is the room for fingers under a pull's bar (a knob's height to its
   * head), `look.thickness` the bar's (the head's), `look.length` a bar's length over all
   * (a knob's diameter; an arch spans its feet whatever this says).
   */
  printed?: PrintedHandle;
  /**
   * Set: the handle is cut out of wood on the CNC, an extra part in the job for every
   * front that has it. Its side profile is the part's outline, so it is as wide as its
   * stock is thick; `spacing` and `look` are what it is made to, as for a printed one.
   */
  cnc?: CncHandle;
  /**
   * Set: nothing is fitted. The CNC cuts a hold into the front itself: a finger hole
   * through it, or a notch in the edge it opens at (a drawer front's top edge).
   */
  routed?: RoutedPull;
  note?: string;
  tuneMe: string[];
}

export interface RoutedPull {
  /** Hole: round, through the front. Scoop: a half-round notch in its edge. Notch: a square one. */
  shape: 'hole' | 'scoop' | 'notch';
  /** A hole's diameter; a notch's length along the edge. */
  width: Mm;
  /** How far a notch reaches in from the edge. A hole has none. */
  depth: Mm;
}

export interface CncHandle {
  /** Bar: a straight bar on two legs. Arch: one curve from foot to foot. */
  design: 'bar' | 'arch';
  /** What it is cut from, whatever the fronts are made of. */
  materialId: Id;
  /** The wood screw from the back of the front, for the lists. */
  screw: string;
  /** The pilot hole for it in each foot: in an edge of the part, so drilled by hand. */
  pilot: { diameter: Mm; depth: Mm };
}

export interface PrintedHandle {
  /** Bar: a straight bar on two legs. Arch: one curve from foot to foot. Knob: round, on one screw. */
  design: 'bar' | 'arch' | 'knob';
  /** A pull's width, across its length as you look at the front. A knob is round and has none. */
  width: Mm;
  /**
   * What the screw from the back of the front goes into: a heat-set insert melted into
   * each foot (a metal thread; recommended), or the plastic itself.
   */
  fastening: 'heatSetInsert' | 'screw';
  /** The screw: its thread, for the lists. */
  screw: string;
  /** The hole an insert is melted into. */
  insert: { diameter: Mm; depth: Mm };
  /** The hole a screw taps for itself in the plastic. */
  pilot: { diameter: Mm; depth: Mm };
}

/**
 * A shelf pin (shelf support), described by the holes it needs: two rows up the
 * inside of each case side for the adjustable shelves to sit on.
 */
export interface ShelfPin {
  id: Id;
  kind: 'shelfPin';
  name: string;
  /** A generic entry always exists. */
  generic: boolean;
  /** The hole the pin's stem sits in. */
  hole: { diameter: Mm; depth: Mm };
  rows: {
    /** Front row: hole centres behind the front edge of the case side. */
    frontSetback: Mm;
    /** Rear row: hole centres in front of the back's front face. */
    rearSetback: Mm;
    /** Between holes up a row. */
    spacing: Mm;
  };
  note?: string;
  tuneMe: string[];
}

/**
 * A drawer slide, described by its spec. Side mount: one member on the cabinet side
 * and one on the box side, and the box is as long as the slide.
 */
export interface Slide {
  id: Id;
  kind: 'slide';
  name: string;
  /** A generic entry always exists. */
  generic: boolean;
  /**
   * `side`: a member on the cabinet side and one on the face of the box side, on the box's centre line.
   * `bottom`: a roller slide of the kind sold as "bottom mount" (a Euro slide): its cabinet
   * member is on the cabinet side all the same, but its drawer member is an angle the box side stands on, screwed
   * up into its bottom edge, so the slide is level with the box's bottom edge. Union grows: undermount.
   */
  mount: 'side' | 'bottom';
  /** Between the box and the cabinet (or its build-out strip), each side. */
  sideClearance: Length;
  /** The lengths it comes in, shortest first. */
  lengths: Length[];
  /** Clear depth the cabinet needs beyond the slide's length. */
  rearClearance: Mm;
  /** Height of the cabinet member. */
  memberHeight: Mm;
  /**
   * The cabinet member's screw holes for each length, measured from its front end.
   * With them the CNC drills pilot holes in the case side; left out (no data for
   * this slide), the slide is positioned and screwed on by hand.
   */
  holes?: { length: Length; fromFront: Mm[] }[];
  extension: 'full' | 'threeQuarter' | null;
  close: 'soft' | 'self' | null;
  note?: string;
  tuneMe: string[];
}

export interface Hinge {
  id: Id;
  kind: 'hinge';
  name: string;
  /** A generic entry always exists. */
  generic: boolean;
  cabinetType: CabinetType;
  /**
   * The side overlay it gives; nominal when `sideAdjust` is set. Negative for an inset
   * hinge: the gap it leaves between the door and the case side.
   */
  overlay: Length;
  /** How far the side overlay can be adjusted either way from nominal (clip hinges on a plate). */
  sideAdjust?: Mm;
  /**
   * Mounting plate on the case side: its hole line's setback from the front edge, the
   * spacing of its two holes (centred on the hinge) and the hole each screw takes.
   * For an inset hinge the setback is measured from the back face of the closed door.
   */
  plate?: { setback: Mm; spacing: Mm; hole: { diameter: Mm; depth: Mm } };
  openingAngleDeg: number | null;
  close: 'soft' | 'self' | 'free' | null;
  attachment: 'screwOn' | 'pressIn' | null;
  /** Bore distance = door edge to cup edge. */
  cup: { diameter: Mm; depth: Mm; boreDistance: Mm };
  dowels: { diameter: Mm; depth: Mm; spacing: Mm; setback: Mm } | null;
  placement: {
    /** Cup centre from the door's top and bottom. */
    fromEnd: Length;
    /** First entry whose maxDoorHeight fits the door wins. */
    perDoor: { maxDoorHeight: Mm; count: number }[];
  };
  fits: { frameThickness: Length; doorThickness: Length } | null;
  /**
   * Where the door ends up when fully open, for the 3D view's hinge (`design/hingeModel.ts`):
   * left out, the model's defaults. For overlay hinges: `edgeOut`, how far the open door's
   * front edge stands outside the line of its closed edge, and `clear`, how far in front of
   * the case its nearest corner stands.
   */
  motion?: { edgeOut?: Mm; clear?: Mm };
  /**
   * The hinge's real linkage, when its maker's drawing is to hand: the two pivots in the
   * cup (in the door's frame: along its width from the hinged edge, into its thickness from
   * the back face) and the two in the arm's head (in the hinge's plane: into the opening
   * from the case side's inner face, out from the front the door closes against). Left
   * out, the model works a plausible one out.
   */
  linkage?: { doorPivots: [[Mm, Mm], [Mm, Mm]]; fixedPivots: [[Mm, Mm], [Mm, Mm]] };
  note?: string;
  tuneMe: string[];
}
