import { PROJECT_VERSION } from '@/model';
import type { DoorSettings, DrawerSettings, Project, ProjectFile, ShopProfile } from '@/model';
import { cabinetsOf, designsOf, finishesUsed, isDoorSet, isDrawer, splitFront } from '@/design';
import { projectMachineId, toolsOnMachine } from '@/libraries';
import { activeMachine } from '@/plan';
import { versionWords } from '@/version';

/** A plain copy, with what is undefined left out. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const PROJECT_FILE_EXTENSION = '.foreman.json';

/** What a project file takes from the shop, and gives to it. */
type Library = Pick<ShopProfile, 'machines' | 'activeMachineId' | 'tools' | 'hardware' | 'finishes'>;

/**
 * The project with a copy of the library entries it depends on, so it opens in
 * another browser and gives the same G-code. All bits go along because the
 * planner picks from every bit in the shop. Its materials are its own and go
 * with it.
 */
export function exportProject(project: Project, shop: Library): ProjectFile {
  // What the fronts name, and what the project's own front settings name while no front follows them.
  const shared = project.context.fronts;
  const doors: DoorSettings[] = [...designsOf(project).filter(isDoorSet).map((d) => splitFront(d).settings), shared.doors];
  const drawers: DrawerSettings[] = [...designsOf(project).filter(isDrawer).map((d) => splitFront(d).settings), shared.drawers];
  const hardwareIds = new Set<string | undefined>([
    ...doors.flatMap((d) => [d.hingeId, d.framelessHingeId, d.shopHingeId]),
    ...drawers.map((d) => d.slideId),
    ...cabinetsOf(project).flatMap((c) => [c.shelfPinId, c.toeKick.casters?.casterId]),
    ...(project.context.kind === 'designedCabinet' ? [project.context.settings.toeKick.casters?.casterId] : []),
  ]);
  // With the clear coat over its stains and the primer under its paints.
  const finishes = finishesUsed(project, shop);
  const machineId = projectMachineId(project, shop);
  return plain({
    format: 'shop-foreman-project' as const,
    schemaVersion: 1 as const,
    app: versionWords(),
    project,
    library: {
      // The machine the project is planned on, and the bits on that machine's feeds: what its G-code comes from.
      machine: { ...activeMachine({ machines: shop.machines, activeMachineId: machineId }), feeds: undefined },
      tools: toolsOnMachine(shop, machineId),
      hardware: shop.hardware.filter((h) => h.generic || hardwareIds.has(h.id)),
      // The paints and stains the project is finished in: left out when it has none.
      ...(finishes.length ? { finishes } : {}),
    },
  });
}

/**
 * Why a stored project cannot be opened by this build, or nothing when it can. There are no upgrade
 * steps before 1.0: a project of another version (`PROJECT_VERSION`) is refused, to be deleted.
 */
export function projectProblem(project: Partial<Project>): string | undefined {
  if (project.schemaVersion === PROJECT_VERSION && project.context && project.plan && Array.isArray(project.designObjects) && Array.isArray(project.materials)) return undefined;
  const other = project.schemaVersion === PROJECT_VERSION ? 'It is incomplete' : `It was saved by version ${String(project.schemaVersion ?? 'unknown')} and this is version ${PROJECT_VERSION}`;
  return `This project was saved by another version of Shop Foreman and cannot be opened. ${other}. Delete it and start again.`;
}

export function serializeProjectFile(file: ProjectFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

export function parseProjectFile(text: string): ProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a project file: it is not valid JSON.');
  }
  const file = data as Partial<ProjectFile>;
  if (file?.format !== 'shop-foreman-project') throw new Error('This is not a Shop Foreman project file.');
  if (file.schemaVersion !== 1) {
    throw new Error(`This project file is version ${String(file.schemaVersion)}; this app reads version 1.`);
  }
  if (!file.project?.id || !Array.isArray(file.project.designObjects) || !file.library) {
    throw new Error('This project file is incomplete.');
  }
  const problem = projectProblem(file.project);
  if (problem) throw new Error(problem);
  return file as ProjectFile;
}

/**
 * The shop profile with the file's library entries added. Entries the shop
 * already has (same id) are kept as they are, so your own settings win.
 */
export function mergeLibrary<S extends Library>(shop: S, file: ProjectFile): S {
  const add = <T extends { id: string }>(mine: T[], theirs: T[] = []): T[] => [
    ...mine,
    ...theirs.filter((t) => !mine.some((m) => m.id === t.id)),
  ];
  const lib = file.library;
  return {
    ...shop,
    // A machine the shop does not have comes with the file's feeds as its own: the bits here keep theirs.
    machines: add(shop.machines, lib.machine ? [{ ...lib.machine, feeds: Object.fromEntries((lib.tools ?? []).map((t) => [t.id, { settings: t.settings, tuneMe: t.tuneMe.includes('settings') }])) }] : []),
    tools: add(shop.tools, lib.tools),
    hardware: add(shop.hardware, lib.hardware),
    // A finish from a file written before finishes had coats is left out: there is nothing to work an amount from.
    finishes: add(shop.finishes ?? [], (lib.finishes ?? []).filter((f) => typeof f.coats === 'number' && typeof f.coverage === 'number')),
  };
}
