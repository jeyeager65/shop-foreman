import type { Appliance, CabinetSettings, Island, OwnTop, Room, Run, StartSizes, StoredCabinet, StoredPiece, TopSettings } from './cabinet';
import type { FrontSettings, StoredDesignObject } from './design';
import type { PlanChoices } from './plan';
import type { Finish, Hardware, MachineProfile, Material, Tool } from './shop';
import type { Length, UnitPreferences } from './units';

export type Id = string;

export interface Project {
  /** The app's version when it was saved, to its second number (`SAVE_VERSION`): a project of another is not opened. */
  schemaVersion: string;
  id: Id;
  name: string;
  /** Used in file names, e.g. `vanity` in `vanity-setup-1-back.gcode`. */
  slug: string;
  /** ISO date-time. */
  createdAt: string;
  updatedAt: string;
  context: Context;
  /** Read them through `designsOf`, which resolves the settings of the fronts on designed cabinets. */
  designObjects: StoredDesignObject[];
  plan: PlanChoices;
  /**
   * The machine the project is planned and cut on: a new project takes the shop's
   * machine in use, and keeps it when the shop's changes. One a project. A project that names none, or one
   * that is no longer in the shop, is planned on the shop's machine in use (`projectMachineId`).
   */
  machineId?: Id;
  /** The starter the project was started as (`src/samples/starters.ts`): what is being made, which Setup follows. Left out: cabinets. */
  starter?: string;
  /** The name of the preset the project started from: for the Projects list only. A project copies a preset's values; it does not follow it. */
  preset?: string;
  /**
   * What this project is made of: copies taken from the shop's material catalog (or typed
   * new), with the measured thickness of what was bought for it. Every derivation reads
   * these, never the catalog; a copy keeps its catalog entry's id, which the bits' settings
   * are keyed by.
   */
  materials: Material[];
  /** Overrides the shop profile. */
  settings: { units?: Partial<UnitPreferences>; finish?: ProjectFinish };
}

/** What the project is finished in: a paint or a stain from the shop profile for each group of parts. Left out: unfinished. */
export interface ProjectFinish {
  /** The case, its face frame, shelves and back. */
  caseId?: Id;
  /** Doors and drawer fronts. */
  frontsId?: Id;
  /** Wooden handles cut on the CNC. */
  handlesId?: Id;
  /** Countertops made here (milestone 7). */
  topsId?: Id;
  /**
   * What the insides of the cases get: the faces seen with a door or a drawer open.
   * Left out: bare. A cabinet may have its own (`CabinetOwn.insideFinish`).
   */
  inside?: InsideFinish;
  /** What the drawer boxes get, all over. Left out: bare. */
  boxes?: InsideFinish;
  /**
   * The project's one clear coat: over a stain, and on insides
   * that are clear coated. Left out: the first clear coat in the shop profile.
   */
  clearId?: Id;
}

/**
 * A finish for what is seen only with a door or a drawer open: nothing (`bare`), nothing because the sheet was
 * bought finished (`prefinished`), the project's clear coat (`clear`), or the case's own paint or stain (`case`).
 */
export type InsideFinish = 'bare' | 'prefinished' | 'clear' | 'case';

/**
 * A named, complete set of a project's shared values (milestone 5): how its cabinets are
 * built, how its fronts are made, its finish and the size new cabinets start at, with
 * copies of the materials they name. A project copies one; it does not follow it.
 * Built-in presets come with the app; the user's own are kept in the shop profile.
 */
export interface Preset {
  id: Id;
  name: string;
  /** Comes with the app: not stored, cannot be changed or deleted. */
  builtIn?: boolean;
  /**
   * Set: a project started from it begins with a cabinet that is already there, to be measured, with new
   * doors made for it (what a refacing project was). Left out: with a cabinet made here.
   */
  start?: 'existing';
  settings: CabinetSettings;
  fronts: FrontSettings;
  finish?: ProjectFinish;
  sizes: StartSizes;
  /** Copies of every material the values name, so a preset works whatever the catalog holds. */
  materials: Material[];
}

/**
 * What the fronts hang on: the project's cabinets, made here or already there and measured, which produce
 * their openings. There was a second kind, a refacing project of measured openings with no cabinet; now
 * that is a cabinet that is already there with new doors (`StoredCabinet.existing`).
 */
export type Context = DesignedCabinetContext;

export interface DesignedCabinetContext {
  kind: 'designedCabinet';
  /** How the project's cabinets are built, unless one says otherwise. */
  settings: CabinetSettings;
  /** How the project's doors and drawers are made, unless one says otherwise. */
  fronts: FrontSettings;
  /**
   * The project's pieces, each of a kind: today every one is a case, a cabinet. Read the
   * cases through `cabinetsOf`, which resolves their settings; `piecesOf` is every piece, of any kind.
   */
  pieces: StoredPiece[];
  /** Cabinets that stand side by side as one piece (`design/runs.ts`). */
  runs: Run[];
  /** The size a new cabinet of each form starts at. */
  sizes: StartSizes;
  /** The room the cabinets stand in (milestone 6). Left out: no room; the whole-project view stands them in a row. */
  room?: Room;
  /** How the project's tops are made (milestone 7). Left out: the starter values (`topSettingsOf`). */
  tops?: TopSettings;
  /** Islands of cabinets standing free in the room (milestone 8). */
  islands?: Island[];
  /**
   * What a new table and a new top of a piece's own start with: Setup's answers for what a
   * kitchen's style does not say, the legs' stock and a furniture top's overhang and edge. Only where a new one
   * starts, as the start sizes are: changing them changes no piece that is already there. Left out: a 2x2, and
   * the starter top (`starterOwnTop`).
   */
  furniture?: { legMaterialId?: Id; top?: OwnTop };
  /** Appliances standing in the room: drawn, and met by the tops beside them; nothing is made for them. */
  appliances?: Appliance[];
}

/**
 * A project's context when every piece of it is known to be a case: what the samples and the tests make. A
 * `DesignedCabinetContext` may hold other kinds too (a table), so its `pieces` must be told apart first
 * (`storedCases`, `framesOf`).
 */
export type CasesContext = Omit<DesignedCabinetContext, 'pieces'> & { pieces: StoredCabinet[] };

/** An opening as the door rules see it: made from a cabinet's (`asOpening`), never stored. */
export interface Opening {
  id: Id;
  name: string;
  cabinetType: CabinetType;
  width: Length;
  height: Length;
  frameThickness: Length;
  /** Reverse mode: derive the current overlay and suggest hinges. */
  existingDoors?: ExistingDoors;
}

/**
 * Shop: a frameless case whose doors and drawers sit inside the box, flush with its
 * front edges (inset). Measured openings are never `shop`.
 */
export type ConstructionStyle = 'faceFrame' | 'frameless' | 'shop';
/** The older name, on openings and hinges. */
export type CabinetType = ConstructionStyle;

export interface ExistingDoors {
  count: 1 | 2;
  /** Across all doors, gap included. */
  widthAcross: Length;
  height: Length;
  gap: Length;
}

/**
 * The exported project file. Carries a copy of the library entries the project
 * uses, so it opens in another browser and gives the same G-code.
 */
export interface ProjectFile {
  format: 'shop-foreman-project';
  schemaVersion: 1;
  /** The version of the app that wrote the file. */
  app?: string;
  project: Project;
  library: { machine: MachineProfile; tools: Tool[]; hardware: Hardware[]; /** The paints and stains the project is finished in. */ finishes?: Finish[] };
}
