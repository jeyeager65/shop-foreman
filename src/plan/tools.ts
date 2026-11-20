import { DEFAULT_ROUTER, routerDial } from '@/libraries';
import type { BitSettings, BitShape, Id, MachineProfile, Mm, Router, RouterBit, Shop, Tool } from '@/model';

export const EPS = 1e-6;

export type EndMill = RouterBit & { shape: Extract<BitShape, { kind: 'endMill' }> };
export type BallNose = RouterBit & { shape: Extract<BitShape, { kind: 'ballNose' }> };
export type VBit = RouterBit & { shape: Extract<BitShape, { kind: 'vBit' }> };
export type RoundoverBit = RouterBit & { shape: Extract<BitShape, { kind: 'roundover' }> };

export const isEndMill = (t: Tool): t is EndMill => t.shape.kind === 'endMill';
export const isBallNose = (t: Tool): t is BallNose => t.shape.kind === 'ballNose';
export const isVBit = (t: Tool): t is VBit => t.shape.kind === 'vBit';
export const isRoundover = (t: Tool): t is RoundoverBit => t.shape.kind === 'roundover';
export type BullNose = RouterBit & { shape: Extract<BitShape, { kind: 'bullNose' }> };
export type ChamferBit = RouterBit & { shape: Extract<BitShape, { kind: 'chamfer' }> };
export type TaperBall = RouterBit & { shape: Extract<BitShape, { kind: 'taperBall' }> };
export const isBullNose = (t: Tool): t is BullNose => t.shape.kind === 'bullNose';
export const isChamferBit = (t: Tool): t is ChamferBit => t.shape.kind === 'chamfer';
export const isTaperBall = (t: Tool): t is TaperBall => t.shape.kind === 'taperBall';

/** Widest cutting diameter. */
export function cutDiameter(tool: Tool): Mm {
  switch (tool.shape.kind) {
    case 'endMill':
    case 'ballNose':
    case 'bullNose':
    case 'roundover':
      return tool.shape.diameter.mm;
    case 'vBit':
    case 'chamfer':
    case 'taperBall':
      return tool.shape.maxDiameter.mm;
  }
}

export function findTool(tools: Tool[], id: Id): Tool {
  const tool = tools.find((t) => t.id === id);
  if (!tool) throw new Error(`Tool not found: ${id}`);
  return tool;
}

export function toolSettings(tool: Tool, materialId: Id): BitSettings {
  const settings = tool.settings[materialId];
  if (!settings) throw new Error(`${tool.name} has no settings for material ${materialId}.`);
  return settings;
}

/** Whether a bit has feeds and speeds for each of these materials. Plan offers it only for those. */
export function hasFeedsFor(tool: Tool, materialIds: Id[]): boolean {
  return materialIds.every((id) => !!tool.settings[id]);
}

/** Share of a bit's cutting width left for the finishing pass when the bit has no value of its own. Tune me. */
export const FINISH_ALLOWANCE_FRACTION = 0.1;

/** What roughing leaves on a wall for the finishing pass: the bit's own setting, else 10% of its cutting width. */
export function finishAllowance(tool: Tool, materialId: Id): Mm {
  return toolSettings(tool, materialId).finishAllowance ?? cutDiameter(tool) * FINISH_ALLOWANCE_FRACTION;
}

/** The router on a machine; a profile saved before routers existed gets the default one. */
export function machineRouter(machine: MachineProfile): Router {
  return machine.router ?? DEFAULT_ROUTER;
}

/** The dial setting for a bit in a material on this machine's router, to the nearest half step. */
export function dialFor(machine: MachineProfile, tool: Tool, materialId: Id): number {
  return routerDial(machineRouter(machine), toolSettings(tool, materialId).rpm);
}

export function activeMachine(shop: Pick<Shop, 'machines' | 'activeMachineId'>): MachineProfile {
  const machine = shop.machines.find((m) => m.id === shop.activeMachineId);
  if (!machine) throw new Error(`Machine not found: ${shop.activeMachineId}`);
  return machine;
}

/** Diameter of a flip pin hole: pin plus fit. */
export function pinHoleDiameter(machine: MachineProfile): Mm {
  return machine.flipPins.diameter.mm + machine.flipPins.holeClearance;
}

/**
 * How far outside the part edge a V-bit's tip runs when it cuts a chamfer,
 * so the tip (which has no cutting speed) stays off the finished edge.
 */
export const CHAMFER_TIP_OFFSET: Mm = 1;

/** A V-bit or a chamfer bit: a cone of an included angle, with or without a flat on its point. */
export type ConeBit = VBit | ChamferBit;
export const isConeBit = (t: Tool): t is ConeBit => t.shape.kind === 'vBit' || t.shape.kind === 'chamfer';
/** Half the flat on a cone bit's point; 0 for a sharp one. */
export const tipRadius = (t: ConeBit): Mm => (t.shape.tipDiameter?.mm ?? 0) / 2;

/** How far outside the part's edge a cone bit's axis runs when it cuts a chamfer: its flat tip and the tip offset. */
export const edgeChamferOffset = (t: ConeBit): Mm => tipRadius(t) + CHAMFER_TIP_OFFSET;

/**
 * Whether a cone bit can cut a chamfer of this size along an edge: a 90 degree cone (as wide as it is
 * deep), deep enough to reach the chamfer's foot with its tip below it and wide enough to reach its top.
 */
export function cutsEdgeChamfer(t: ConeBit, size: Mm): boolean {
  return (
    Math.abs(t.shape.angleDeg - 90) < EPS &&
    t.shape.maxDepth >= size + CHAMFER_TIP_OFFSET - EPS &&
    t.shape.maxDiameter.mm / 2 >= edgeChamferOffset(t) + size - EPS
  );
}

/** The cutting length of the kinds that have one (null: not measured yet); undefined for the others. */
/** How high a holding tab stands, as a share of the stock, when the machine does not say. Tune me. */
export const DEFAULT_TAB_HEIGHT_PERCENT = 40;
/** How high a holding tab stands in stock of a thickness: the machine's share of it, between a twentieth and nine tenths. */
export const holdingTabHeight = (machine: { tabs: { heightPercent?: number } }, thickness: Mm): Mm =>
  (thickness * Math.min(90, Math.max(5, machine.tabs.heightPercent ?? DEFAULT_TAB_HEIGHT_PERCENT))) / 100;

/** How much bigger a tab's slot is cut than its tab when the machine does not say. Tune me. */
export const DEFAULT_TAB_FIT: Mm = 0.15;
/** How much wider and longer (and, blind, deeper) a tab's slot is cut than the tab: the machine's `tabFit`. */
export const tabFitOf = (machine: Pick<MachineProfile, 'tabFit'>): Mm => Math.max(0, machine.tabFit ?? DEFAULT_TAB_FIT);

/**
 * How deep a cut through stock of a thickness goes: past its bottom by the machine's `throughExtra`, into the
 * spoilboard, but never deeper than the bit's cutting length reaches (it still goes through).
 */
export function throughDepth(machine: Pick<MachineProfile, 'throughExtra'>, tool: Tool, thickness: Mm): Mm {
  const extra = Math.max(0, machine.throughExtra ?? 0);
  const length = cuttingLengthOf(tool)?.mm;
  return length ? Math.max(thickness, Math.min(thickness + extra, length)) : thickness + extra;
}

export function cuttingLengthOf(tool: Tool): { mm: Mm } | null | undefined {
  const s = tool.shape;
  return s.kind === 'endMill' || s.kind === 'ballNose' || s.kind === 'bullNose' || s.kind === 'taperBall' ? s.cuttingLength : undefined;
}
