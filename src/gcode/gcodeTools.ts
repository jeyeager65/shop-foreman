/**
 * Loads the vendored cnc-gcode-tools scripts. They are plain scripts that define
 * globals, not ES modules, and must stay unmodified, so they are evaluated together
 * in one function scope and the classes handed back.
 */
import animatorSource from '@/lib/cnc-gcode-tools/animator.js?raw';
import expanderSource from '@/lib/cnc-gcode-tools/gcode-expander.js?raw';
import parserSource from '@/lib/cnc-gcode-tools/parser.js?raw';
import stockSimSource from '@/lib/cnc-gcode-tools/stock-sim.js?raw';

export interface GCodeSegment {
  type: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  feedRate: number;
  tool: number;
  toolNumber: number;
  lineNum: number;
}

export interface GCodeEvent {
  index: number;
  lineNum: number;
  kind: 'msg' | 'print' | 'debug' | 'probe' | 'alarm' | 'pause' | 'end' | string;
  text: string;
}

export interface SimTool {
  shape: string;
  diameter: number;
  angle: number | null;
  name: string | null;
}

export interface GCodeParserInstance {
  parseString(gcode: string, onProgress?: (percent: number) => void): Promise<GCodeSegment[]>;
  segments: GCodeSegment[];
  events: GCodeEvent[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  simMeta: {
    units: string | null;
    stock: { xmin: number; xmax: number; ymin: number; ymax: number; zmin: number; zmax: number } | null;
    tools: Map<number, SimTool>;
  };
}

export type StockBox = NonNullable<GCodeParserInstance['simMeta']['stock']>;

/** A tool as the simulator compiled it; only passed back to the renderer. */
export type CompiledTool = object;

export interface StockSimulatorInstance {
  tools: Map<number, CompiledTool>;
  defaultTool: CompiledTool | null;
  gouges: Set<number>;
  setSegments(segments: GCodeSegment[]): void;
  /** Carves moves [0, target). Returns true once the stock is up to date. */
  advanceTo(target: number, budgetMs?: number): boolean;
}

export interface OrbitBasis {
  getBasis(): Record<'back' | 'up' | 'right', { x: number; y: number; z: number }>;
}

export interface StockMeshRendererInstance {
  setSimulator(sim: StockSimulatorInstance | null): void;
  update(): void;
  draw(mvp: Float32Array, camera: OrbitBasis, theme: 'dark' | 'light'): void;
  drawTool(mvp: Float32Array, camera: OrbitBasis, tip: { x: number; y: number; z: number }, tool: CompiledTool, color: number[]): void;
  destroy(): void;
}

export interface GCodeTools {
  GCodeParser: new () => GCodeParserInstance;
  StockSimulator: new (stock: StockBox, tools: Map<number, SimTool>, options?: { maxCells?: number; snapshots?: boolean }) => StockSimulatorInstance;
  StockMeshRenderer: new (gl: WebGLRenderingContext) => StockMeshRendererInstance;
  /** One line of G-code as HTML with a class per token; the text is escaped. */
  highlightParametricGCodeLine: (line: string) => string;
  GCodeExpander: unknown;
  Animator: unknown;
  StockProbe: unknown;
  /** A parsed ToolDef as the shape the simulator carves with; null when it cannot cut. */
  compileStockTool: (def: SimTool) => { radius: number; flat: boolean; profile: (d: number) => number; flutes: number; fluteLength: number | null; overallLength: number | null } | null;
  /** Every SHAPE a ToolDef may name. */
  STOCK_TOOL_SHAPES: string[];
}

let cached: GCodeTools | undefined;

export function loadGCodeTools(): GCodeTools {
  cached ??= new Function(
    `${expanderSource}\n${stockSimSource}\n${parserSource}\n${animatorSource}\n` +
      'return { GCodeParser, GCodeExpander, Animator, StockSimulator, StockProbe, StockMeshRenderer, highlightParametricGCodeLine, compileStockTool, STOCK_TOOL_SHAPES };',
  )() as GCodeTools;
  return cached;
}
