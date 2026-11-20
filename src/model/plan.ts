import type { Face, Point } from './parts';
import type { Id } from './project';
import type { Length, Mm } from './units';

export type Method = 'cnc' | 'handheldRouter' | 'byHand';

/** Stored: only what the user chose. Everything else is resolved from the design. */
export interface PlanChoices {
  strategy: 'fastest' | 'fewestBitChanges';
  /**
   * The piece on the machine. Width and height are only stored when the user enters
   * their own piece; without them the planner uses the smallest blank that works.
   * They apply only to a job that comes out as one blank; with several, each is the
   * smallest that works.
   */
  blank: {
    width?: Length;
    height?: Length;
    materialId: Id;
    /** The largest piece of stock on hand. Default: the machine profile's sheet. */
    stock?: { width: Length; height: Length };
  };
  /** Keyed by OperationKey. A missing key means the planner picks. */
  operations: Record<OperationKey, OperationChoice>;
  /** Default: on for up-cut bits. */
  tabs?: { enabled: boolean };
  /** Keyed by part id. A missing key, or a missing value, means the planner picks. */
  parts?: Record<Id, PartChoice>;
  /** How the job's pocket holes are made, in parts cut out on the CNC; saw-cut parts always get the Kreg jig. Missing: the Kreg jig. */
  pocketHoles?: PocketHoleMethod;
  /** A low-angle pocket's seat, from the edge along the screw, when it is not the usual 7/8": set as on a pocket-hole machine. */
  pocketSeat?: Length;
  /**
   * The pocket holes that get a ledge for a printed cover. Left out or empty: none. Only a pocket the CNC cuts
   * takes one, at 15° or a low angle: the ledge is cut with a flat end mill, as an operation of its own.
   */
  pocketCovers?: PocketCoverWhere[];
  /** The project's batches: each a selection of its parts, cut as a job of its own. Left out: none. */
  batches?: Batch[];
  /** The batch in hand: Plan, Cut and Build work from it. Left out: everything, the whole project as one job. `left`: what is not yet cut. */
  batchId?: Id;
  /** What has been cut, by part (a copy's parts under its first copy's id): what each was when its batch was marked cut. Left out: nothing. */
  cut?: Record<Id, CutRecord>;
}

/** A part as it was when it was cut: enough to say later whether the design has changed under it. Never read back as a part. */
export interface CutRecord {
  /** Its name then, for when the part is no longer in the design. */
  name: string;
  /** The batch it was cut in: its name, or "Everything". */
  batch: string;
  /** ISO date-time. */
  at: string;
  materialId: Id;
  size: { width: Mm; height: Mm; thickness: Mm };
  /** A digest of what is cut into it: its outline, pockets, holes and edges. */
  features: string;
}

/** A kind of part a batch can choose: by what it is in the work, not by its role in a cabinet. */
export type BatchKind = 'cases' | 'faceFrames' | 'drawerBoxes' | 'fronts' | 'tops' | 'inside' | 'handles';

/**
 * A batch: which of the project's parts one job makes, by three things that combine. Each left out (or
 * empty) means all of it. It stores a selection, never a part.
 */
export interface Batch {
  id: Id;
  name: string;
  /** The cabinets whose parts it makes (a top is its cabinet's). */
  cabinetIds?: Id[];
  kinds?: BatchKind[];
  materialIds?: Id[];
}

/** How a part is cut out of its stock. */
export type CutMethod = 'cnc' | 'tableSaw' | 'circularSaw';

/** Kreg jig: drilled by hand. CNC-assisted: the CNC cuts the pocket, and a printed guide on the part's edge takes the drill (untested). */
/**
 * `cncAssisted`: the CNC cuts a 15 degree pocket with a ball nose. `lowAngle3`, `lowAngle6`: it
 * cuts a low-angle pocket with a flat end mill, as a routed pocket-hole machine does. In all three the pilot is
 * drilled by hand from the edge, through a printed guide.
 */
export type PocketHoleMethod = 'kregJig' | 'cncAssisted' | 'lowAngle3' | 'lowAngle6';
/**
 * Which pocket holes get a ledge round the opening for a printed cover, by where the face they are in is seen:
 * from outside the piece, inside a case (behind a door, or in an open case), inside a drawer box; or every one.
 */
export type PocketCoverWhere = 'outside' | 'behindDoor' | 'inDrawer' | 'all';

export interface PartChoice {
  cutOut?: CutMethod;
}

/** What does a step on a part after, or besides, its cut-out. */
export type StepTool = 'cnc' | 'miterSaw' | 'jigSaw' | 'tableSaw' | 'kregJig' | 'byHand';

/** Derived: how one part gets made. */
export interface PartPlan {
  partId: Id;
  cutOut: CutMethod;
  /** What the planner picks when the user has not chosen. */
  suggested: CutMethod;
  /** Why it was suggested, as a sentence. */
  reason: string;
  /**
   * What Plan may offer: saws the shop has and the part fits on; the CNC for sheet parts.
   * A part with CNC work (dados, a rabbet, a groove, holes) is offered the CNC only.
   */
  options: CutMethod[];
  /**
   * The rest of the work on the part, in order. A saw-cut part gains the hand steps the
   * CNC would have done (the toe-kick notch). Fronts have none here: their work is the
   * plan's operations.
   */
  steps: { label: string; by: StepTool }[];
}

export interface OperationChoice {
  method?: Method;
  clearToolId?: Id;
  /** null = the user turned clean-up off. */
  cleanupToolId?: Id | null;
}

/**
 * One row on the Plan screen: one kind of work for the whole job, whatever cabinet or
 * front its parts belong to. `${group}:${kind}`, the group being `doors`,
 * `drawerFronts`, `case` or `boxes`: `doors:hingeCup`, `boxes:groove`. A hole row
 * says what the holes are for, `case:holes:shelf-pin@5`. Behind "@" is what splits
 * work of one kind into rows that need different bits: a hole's diameter, a bevel's
 * angle, an edge's profile. A stored choice may leave that part out and then applies
 * to every such row. The flip pin holes are `job:pinHole`.
 */
export type OperationKey = string;

export type OperationKind =
  /** Clean-up with a second, smaller bit is part of this operation. */
  | 'pocketClear'
  | 'vBevel'
  | 'hingeCup'
  | 'pinHole'
  | 'edgeProfile'
  /** Dados and housings for the end or edge of another part; an inside corner gets a dog-bone. */
  | 'dado'
  /** A recess open along one long side: the back's rabbet, a drawer box's corner rabbets. */
  | 'rabbet'
  | 'groove'
  /** Grooves that follow a line, straight or curved (`Feature` `slot`): cut with a bit no wider than they are. */
  | 'slot'
  /** A row of drilled holes of one purpose: shelf pins, hinge plates, slide screws, front screws. */
  | 'holes'
  /**
   * CNC-assisted pocket holes: a ball nose bit cuts the open part of each pocket and
   * is cut by the CNC; the pilot is drilled by hand from the part's edge, through a printed guide.
   * Untested. One row may have holes on both faces of its parts.
   */
  | 'pocketHole'
  /** The ledge round a pocket hole the CNC cuts (15° or low angle) for a printed cover, where the project asks for one: a flat end mill's. Untested. */
  | 'pocketLedge'
  | 'cutout'
  | 'install';

/** Derived. */
export interface Operation {
  key: OperationKey;
  kind: OperationKind;
  label: string;
  face: Face | 'install';
  source:
    | { kind: 'features'; refs: { partId: Id; featureId: Id }[] }
    /** Flip pin holes: in the blank's waste, so Plan, not Design. */
    | { kind: 'registration' }
    | { kind: 'install'; jigs: JigInstance[] };
  method: Method;
  clearToolId?: Id;
  cleanupToolId?: Id;
  /** What Plan may offer: only methods and bits that can make the feature as designed. */
  options: {
    methods: Method[];
    clearToolIds: Id[];
    cleanupToolIds: Id[];
    cleanupRequired: boolean;
  };
  /** Deepest cut below the top face, mm. The pin holes go through the blank into the spoilboard. */
  depth: Mm;
  /** 0 when not on the CNC. */
  machineSeconds: number;
  warnings: PlanWarning[];
  /** The tags of the cabinets whose parts the row works on, when the project has tags. */
  covers?: string[];
}

export interface PlanWarning {
  code:
    | 'deeperThanCuttingLength'
    | 'cuttingLengthUnknown'
    | 'deeperThanVMax'
    | 'noCapableTool'
    /** The bit chosen for a row is no longer in the shop profile; another is used. */
    | 'chosenToolGone'
    | 'blankTooSmall'
    | 'tightMargins'
    | 'pinHolesShallow'
    | 'stockTooSmall'
    | 'outsideCuttingArea'
    | 'probeSpotMoved'
    | 'unsupported';
  message: string;
}

/** Derived. */
export interface Setup {
  index: 1 | 2;
  /**
   * The face the blank's parts show. On a blank that is not flipped, a part whose CNC
   * work is all on the other face lies that face up instead: its placement says so.
   */
  faceUp: 'A' | 'B';
  /** What is done to the sheet before this setup: nothing, a flip onto the pins, or (a tiled blank) a slide along Y onto them. */
  flipBefore: 'none' | { kind: 'sheetOnPins'; direction: 'leftToRight' } | { kind: 'slideOnPins'; distance: Mm };
  /**
   * A tiled blank, longer than the cutting area: this setup cuts the band of it from
   * `from` to `to` along Y, in the blank's own coordinates, with the sheet slid
   * `shift` toward the front, so a point of the blank at `y` is at `y - shift` on the machine.
   */
  tile?: { from: Mm; to: Mm; shift: Mm };
  /** In cutting order. */
  operationKeys: OperationKey[];
  /**
   * Part positions on the blank with this face up: the front-left corner of the space
   * the part takes up. `mirrored`: the part lies face B up, so its X runs right to left.
   * `turned`: the part lies a quarter turn round, its width along the blank's Y (only a
   * part with no grain, or one whose grain then runs with the sheet's).
   */
  placements: { partId: Id; origin: Point; mirrored: boolean; turned: boolean }[];
  pinHoles: Point[];
  /** `note` is set when the spot is not the front-left corner. */
  probeSpot: { at: Point; note?: string };
}

/**
 * Derived: which face of each part is up in a setup, named by what the part is (a
 * side's inside, the bottom's underside, a door's back).
 */
export interface SetupFaces {
  /** "inside face up" when every part lies the same way; "faces differ" when not. */
  summary: string;
  mixed: boolean;
  /** The parts by the face they have up, in placement order. `up` is e.g. "underside up". */
  groups: { face: string; up: string; parts: string[] }[];
  /** Only when mixed: "Bottom, Back stretcher underside up; Front stretcher top face up". */
  detail?: string;
}

/** Derived: one piece of stock on the machine, with the parts cut from it and its own setups. */
export interface PlannedBlank {
  /** `blank-1`, `blank-2`, ... in job order. */
  id: string;
  /** 1-based position in the job. */
  index: number;
  /** e.g. `3/4" Plywood, 1 of 2`. */
  label: string;
  materialId: Id;
  /** The blank as it lies on the machine: X, Y and measured thickness. */
  size: { width: Mm; height: Mm; thickness: Mm };
  /** The smallest blank its parts, flip pins and probe spot fit on, within the stock on hand. */
  minimum: { width: Mm; height: Mm };
  /** How the parts are arranged, and the waste actually left at the blank's edges. */
  arrangement: 'row' | 'column' | number[];
  edgeMargin: Mm;
  /**
   * Set for a material with grain: the machine axis the sheet's grain runs along on
   * this blank. Every part on it lies with its own grain the same way.
   */
  grainAxis?: 'x' | 'y';
  partIds: Id[];
  /** One, or two with a flip. */
  setups: Setup[];
  warnings: PlanWarning[];
}

/** Derived. */
export interface ResolvedPlan {
  /**
   * Every piece of stock the CNC parts are cut from, grouped by material: as many as
   * the parts need within the stock size. Milestone 1's doors come out as one.
   */
  blanks: PlannedBlank[];
  /** The largest piece of stock on hand: every blank is cut from one. */
  stock: { width: Mm; height: Mm };
  operations: Operation[];
  /** One per part of the job: the fronts first, then case, frame and drawer box parts. */
  parts: PartPlan[];
  /**
   * Set when the job has pocket holes. `method` is the job's choice; `cncAssisted` is
   * how many holes it really applies to: those in parts cut out on the CNC. A part
   * cut out on a saw gets its pocket holes by Kreg jig whatever the choice.
   */
  pocketHoles?: {
    method: PocketHoleMethod;
    count: number;
    cncAssisted: number;
    /** Set when the CNC preps any: the printed guides, one for each stock thickness, and how the pilots are drilled in each. */
    prep?: { guides: JigInstance[]; drilling: PocketDrilling[] };
  };
  summary: { machineSeconds: number; toolChanges: number; toolIds: Id[]; byHand: string[] };
  installKit: JigInstance[];
  warnings: PlanWarning[];
}

/** The hand step after the CNC has cut the pockets in stock of one thickness. */
export interface PocketDrilling {
  thickness: Mm;
  /** How many CNC-cut pockets are in stock this thick. */
  count: number;
  /** The drill bit's diameter. */
  drill: Mm;
  /** How far the bit stands out of the drill's chuck, which stops against the guide's back: it sets the pilot's length. */
  bitOutOfChuck: Mm;
}

export interface JigInstance {
  /** `pocketGuide`: the drill guide for CNC-assisted pocket holes; `params` are the stock's `thickness` and the `drill`, and for a low-angle pocket its `angleDeg`, the `bit` it is cut with and its `seat`; `sleeveBore`, `sleeveOutside`, `sleeveLength`, `sleeveCount` (and `sleeveFlange`, `sleeveFlangeThickness`: `sleeveParams`) when the shop has a sleeve of its own. */
  template: 'supportBlock' | 'gapShim' | 'pocketGuide';
  params: Record<string, Mm>;
  quantity: number;
  output: '3mf' | 'stl' | 'cnc';
}
