import type { Part, PlanWarning, Project, ResolvedPlan, Shop } from '@/model';
import { hungProject } from '@/design';
import { planBlanks } from './blanks';
import { resolveOperations } from './operations';
import { hasTabJoint, needsTiling, planParts, planPocketHoles } from './parts';
import { DEFAULT_EDGE_MARGIN, DEFAULT_SHEET_TRIM, needsFlip } from './setups';
import { activeMachine, cutDiameter, findTool } from './tools';

export { installKit } from './operations';
export { operationsFor, planBlanks } from './blanks';
export { DEFAULT_EDGE_MARGIN, DEFAULT_SHEET_TRIM, TILE_OVERLAP, TILE_PIN_FROM_FRONT, TILE_REACH_MARGIN, TILE_SIDE_MARGIN, chooseLayout, isTiled, needsFlip, workFace } from './setups';
export { setupFaces } from './faces';
export * from './parts';
export * from './tools';
export * from './limits';

/**
 * Operations with methods and bits, the blanks, and each blank's setups and flip.
 * Machine time is 0 here; the job builder fills it in from the toolpaths.
 *
 * `parts` are the fronts. `others` are a cabinet's case, frame and drawer box parts:
 * each gets a cut-out method, and those cut out on the CNC are nested onto blanks with
 * the fronts and get operations of their own (dados, rabbets, grooves, holes, cutout).
 */
export function resolvePlan(project: Project, shop: Shop, parts: Part[], others: Part[] = []): ResolvedPlan {
  const machine = activeMachine(shop);
  const all = [...parts, ...others];
  // A part bigger than the machine's cutting area is cut on a saw and worked by hand.
  const area = { width: machine.cuttingArea.x.mm, height: machine.cuttingArea.y.mm, tileLength: machine.tiling?.maxLength.mm };
  // The largest piece on hand: the project's own as entered, or the machine profile's
  // usual sheet less its trim (a nominal sheet cut from a bigger one is a kerf short).
  const chosen = project.plan.blank.stock;
  const trim = machine.nesting.sheetTrim ?? DEFAULT_SHEET_TRIM;
  const stock = chosen
    ? { width: chosen.width.mm, height: chosen.height.mm }
    : { width: machine.defaultSheet.x.mm - trim, height: machine.defaultSheet.y.mm - trim };

  // A shaped part goes to the CNC only when it fits on the stock with the waste kept round it.
  const margin = 2 * (machine.nesting.edgeMargin ?? DEFAULT_EDGE_MARGIN);
  const partPlans = planParts(all, project.plan, shop, { ...area, stock: { width: stock.width - margin, height: stock.height - margin } });
  const onCnc = all.filter((part) => partPlans.find((p) => p.partId === part.id)?.cutOut === 'cnc');

  const resolved = resolveOperations(
    hungProject(project, shop),
    parts,
    shop.tools,
    machine,
    // The pins are for a flip, or for sliding a tiled blank along.
    (ops) => needsFlip(ops, onCnc) || onCnc.some((part) => needsTiling(part, area)),
    onCnc.filter((part) => part.role !== undefined),
  );
  const blanks = planBlanks(project, shop, machine, resolved, onCnc, stock);
  // Pin holes are planned when the job has work on both faces; they stay only if some blank is flipped.
  // (A setup that still names the pin holes keeps them: a tiled blank that does not fit the stock is planned all the same, with its warning.)
  const named = new Set(blanks.flatMap((b) => b.setups.flatMap((s) => s.operationKeys)));
  const pinned = blanks.some((b) => b.setups.some((s) => s.pinHoles.length > 0)) || resolved.some((o) => o.kind === 'pinHole' && named.has(o.key));
  const operations = pinned ? resolved : resolved.filter((o) => o.kind !== 'pinHole');

  // A joint's tabs and slots are cut on the CNC or not at all: a part that has them and goes to a saw (it is too big
  // for the machine) is named, once for the part whatever its copies.
  const sawnTabs = [...new Set(all.filter((part) => hasTabJoint(part) && partPlans.find((p) => p.partId === part.id)?.cutOut !== 'cnc').map((part) => part.name))];
  const tabWarnings: PlanWarning[] = sawnTabs.map((name) => ({
    code: 'unsupported',
    message: `${name} is too big for the machine and is cut on a saw, but it has tab-and-slot joints, which only the CNC cuts: give its joints another kind, or use a machine that takes it.`,
  }));
  const several = blanks.length > 1;
  const warnings = blanks.flatMap((b) => b.warnings.map((w) => (several ? { ...w, message: `${b.label}: ${w.message}` } : w)));
  const cncTools = blanks.flatMap((b) =>
    b.setups.flatMap((s) =>
      s.operationKeys.flatMap((key) => {
        const op = operations.find((o) => o.key === key)!;
        return [op.clearToolId, op.cleanupToolId].filter((id): id is string => !!id);
      }),
    ),
  );
  // The pilots' length depends on the ball the pockets are cut with.
  const ball = operations.find((o) => o.kind === 'pocketHole' && o.clearToolId)?.clearToolId;
  const ballDiameter = ball ? cutDiameter(findTool(shop.tools, ball)) : undefined;
  return {
    blanks,
    stock,
    operations,
    parts: partPlans,
    pocketHoles: planPocketHoles(all, project.plan, partPlans, ballDiameter, shop.pocketSleeve),
    summary: {
      machineSeconds: 0,
      toolChanges: 0,
      toolIds: [...new Set(cncTools)],
      byHand: operations.filter((o) => o.method !== 'cnc' && o.kind !== 'install').map((o) => o.label),
    },
    installKit: operations.flatMap((o) => (o.source.kind === 'install' ? o.source.jigs : [])),
    warnings: [...warnings, ...operations.flatMap((o) => o.warnings), ...tabWarnings],
  };
}
