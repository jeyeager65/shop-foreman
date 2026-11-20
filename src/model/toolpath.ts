/** Derived. CAM writes a machine-neutral program; a post turns it into G-code. */
import type { Setup, SetupFaces } from './plan';
import type { Id } from './project';
import type { MachineProfile, Tool } from './shop';
import type { Mm } from './units';

export type ToolpathStep =
  | { kind: 'rapid'; x?: Mm; y?: Mm; z?: Mm }
  | { kind: 'cut'; x?: Mm; y?: Mm; z?: Mm; feed: number }
  | { kind: 'arc'; dir: 'cw' | 'ccw'; x: Mm; y: Mm; z?: Mm; i: Mm; j: Mm; feed: number }
  /** The post adds the router-off pause and the probe routine. */
  | { kind: 'toolChange'; toolId: Id }
  | { kind: 'pause'; message: string }
  /** The start of an operation's cuts; the post turns it into a status message. */
  | { kind: 'operation'; label: string; seconds: number }
  | { kind: 'comment'; text: string };

export interface SetupProgram {
  setup: Setup;
  /** The blank this setup is on, and how many blanks and setups there are, for the file's title. */
  blank: { id: string; index: number; count: number; label: string; setupCount: number };
  /** The blank's material: the bits' feeds come from their settings for it. */
  materialId: Id;
  /** Which face of each part is up: the title, the messages and the file name say it. */
  faces: SetupFaces;
  /**
   * e.g. `vanity-setup-1-back.gcode`. With several blanks: `base-cabinet-blank-2.gcode`
   * for a blank cut in one setup, `base-cabinet-blank-1-setup-1-back.gcode` for a flipped one.
   */
  fileName: string;
  stock: { x: Mm; y: Mm; z: Mm };
  toolIds: Id[];
  steps: ToolpathStep[];
  /** e.g. "Flip the sheet left to right onto the pins." */
  endMessage: string;
}

export interface Post {
  id: string;
  extension: 'gcode';
  write(program: SetupProgram, machine: MachineProfile, tools: Tool[]): string;
}
