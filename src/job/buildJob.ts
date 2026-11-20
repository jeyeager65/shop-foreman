import { buildSetupProgram } from '@/cam/program';
import { deriveCabinetParts, deriveDrawerBoxParts, deriveParts, shopFor } from '@/design';
import type { Part, Project, ResolvedPlan, SetupProgram, Shop, ShopProfile } from '@/model';
import { activeMachine, resolvePlan } from '@/plan';
import { fluidncPost } from '@/post/fluidnc';
import { LEFT_BATCH_ID, batchInHand, batchSlug, inBatch } from './batch';

export interface Job {
  /** The fronts. */
  parts: Part[];
  /**
   * A cabinet's case, frame and drawer box parts: each has a cut-out method, and those
   * cut out on the CNC are laid out on blanks and cut there.
   */
  cabinetParts: Part[];
  /** With machine time and tool changes filled in from the toolpaths. */
  plan: ResolvedPlan;
  /** One per blank and setup that has something to cut, in blank order. */
  programs: SetupProgram[];
  files: { name: string; text: string }[];
  /** The batch in hand, when the job is not everything: its parts are a selection of `projectParts`. */
  batch?: { id: string; name: string };
  /** Every part of the project, whatever the batch: what a batch chooses from. The same parts as the job's when it is everything. */
  projectParts: Part[];
}

/**
 * The whole pipeline: design -> parts -> plan -> toolpaths -> G-code. Nothing here is
 * stored. It works from the project's materials whatever the shop holds (`shopFor`).
 */
export function buildJob(whole: Project, profile: Shop | ShopProfile): Job {
  const shop = shopFor(whole, profile);
  const everyFront = deriveParts(whole, shop);
  const everyOther = [...deriveCabinetParts(whole, shop), ...deriveDrawerBoxParts(whole, shop)];
  // A batch in hand (`batch.ts`): only its parts go to the planner, and its files carry its name.
  const batch = batchInHand(whole);
  const keep = batch ? inBatch(batch, whole) : () => true;
  const parts = everyFront.filter(keep);
  const cabinetParts = everyOther.filter(keep);
  if (batch && parts.length + cabinetParts.length === 0) {
    throw new Error(batch.id === LEFT_BATCH_ID ? 'Nothing is left: every part of the project is marked as cut. Choose another batch on Plan.' : `The batch "${batch.name}" has no parts: nothing in the project is all of what it chooses. Change it on Plan.`);
  }
  const project = batch ? { ...whole, slug: `${whole.slug}-${batchSlug(batch)}` } : whole;
  return {
    ...(batch ? { batch: { id: batch.id, name: batch.name } } : {}),
    projectParts: [...everyFront, ...everyOther],
    ...planAndPost(project, shop, parts, cabinetParts),
  };
}

/**
 * A job of parts that come from no design (a drawer insert on the jigs page): planned, nested and posted
 * as a project's are. `project` gives the slug of the files, the materials and Plan's choices; none of
 * its own cabinets or fronts is made.
 */
export function buildPartsJob(project: Project, profile: Shop | ShopProfile, parts: Part[]): Job {
  return { projectParts: parts, ...planAndPost(project, shopFor(project, profile), [], parts) };
}

/** Plan, toolpaths and G-code for the parts given: the fronts, and everything else. */
function planAndPost(project: Project, shop: Shop, parts: Part[], cabinetParts: Part[]): Omit<Job, 'batch' | 'projectParts'> {
  const machine = activeMachine(shop);
  const plan = resolvePlan(project, shop, parts, cabinetParts);
  const post = fluidncPost({ project });

  const all = [...parts, ...cabinetParts];
  const results = plan.blanks.flatMap((blank) =>
    blank.setups
      .filter((setup) => setup.operationKeys.length > 0)
      .map((setup) => buildSetupProgram(project, plan, blank, setup, all, shop.tools, machine)),
  );
  const seconds = (key: string) => results.reduce((sum, r) => sum + (r.opSeconds[key] ?? 0), 0);
  const operations = plan.operations.map((op) => ({ ...op, machineSeconds: seconds(op.key) }));
  const toolChanges = results.reduce((sum, r) => sum + r.toolChanges, 0);

  return {
    parts,
    cabinetParts,
    plan: {
      ...plan,
      operations,
      summary: {
        ...plan.summary,
        toolChanges,
        machineSeconds:
          operations.reduce((sum, op) => sum + op.machineSeconds, 0) + toolChanges * machine.toolChangeSeconds,
      },
      warnings: [...plan.warnings, ...results.flatMap((r) => r.warnings)],
    },
    programs: results.map((r) => r.program),
    files: results.map((r) => ({ name: r.program.fileName, text: post.write(r.program, machine, shop.tools) })),
  };
}
