import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { type Job, buildJob } from '@/job/buildJob';
import { shopFor, topWarnings } from '@/design';
import { cabinetsPastCeiling, projectLayoutWarnings } from '@/design/scene';
import { createStarterShopProfile, projectMachineGone } from '@/libraries';
import { SHOP_PROFILE_VERSION } from '@/model';
import type { ConstructionStyle, LengthDisplay, Material, Preset, Project, ShopProfile } from '@/model';
import { newProjectFromPreset } from '@/samples/presets';
import { type Starter, startProject } from '@/samples/starters';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { type Store, openStore } from '@/storage/db';
import {
  PROJECT_FILE_EXTENSION,
  exportProject,
  mergeLibrary,
  parseProjectFile,
  projectProblem,
  serializeProjectFile,
} from '@/storage/projectFile';
import { download } from '@/ui/format';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';
import type { JobRequest, JobResponse } from '@/workers/job.worker';

const LAST_PROJECT = 'shop-foreman:lastProject';
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const useAppStore = defineStore('app', () => {
  const shop = ref<ShopProfile>(createStarterShopProfile());
  const projects = ref<Project[]>([]);
  const currentId = ref<string | null>(null);
  const ready = ref(false);
  const storageError = ref<string | null>(null);
  let store: Store | undefined;

  /** Projects saved by an earlier build that this one cannot open: listed on Projects to be deleted. */
  const unreadable = ref<{ id: string; name: string; problem: string }[]>([]);
  /** Set when the saved shop profile was of another version and the shop started again: said once, at the top of the page. */
  const shopReset = ref('');

  const project = computed(() => projects.value.find((p) => p.id === currentId.value) ?? null);
  /**
   * A small picture of each project, by its id, for the Projects page: taken from the
   * 3D view whenever it draws the whole of the open project (`setThumbnail`). A project that has not
   * been looked at in 3D has none yet.
   */
  const thumbnails = ref<Record<string, string>>({});
  let thumbnailTimer: ReturnType<typeof setTimeout> | undefined;
  function setThumbnail(dataUrl: string) {
    const id = currentId.value;
    if (!id || thumbnails.value[id] === dataUrl) return;
    thumbnails.value = { ...thumbnails.value, [id]: dataUrl };
    clearTimeout(thumbnailTimer);
    thumbnailTimer = setTimeout(() => void guarded(async () => store?.saveThumbnails(thumbnails.value)), 400);
  }
  /** What the open project is made of: its own copies of catalog materials. */
  const materials = computed<Material[]>(() => project.value?.materials ?? []);
  /** The shop as the open project's job sees it: the profile with the project's materials (`shopFor`). */
  const jobShop = computed(() => shopFor({ materials: materials.value, machineId: project.value?.machineId }, shop.value));
  /** The machine the open project is planned and cut on: its own, or the shop's machine in use (`projectMachineId`). */
  const machine = computed(() => jobShop.value.machines.find((m) => m.id === jobShop.value.activeMachineId));
  /** The open project names a machine that is no longer in the shop: it is planned on the one in use, and Setup says so. */
  const machineGone = computed(() => projectMachineGone(project.value, shop.value));

  /**
   * Everything derived from the project: parts, plan, toolpaths, G-code. Built in a
   * Web Worker; the last result stays up while a newer one is on its way. Where
   * workers aren't available it is built on the spot.
   */
  const job = shallowRef<{ job?: Job; error?: string }>({});
  const jobBusy = ref(false);
  let jobWorker: Worker | undefined;
  let jobRequest = 0;
  let workerFailed = typeof Worker === 'undefined';

  function buildHere(p: Project, s: ShopProfile) {
    try {
      job.value = { job: buildJob(p, s) };
    } catch (e) {
      job.value = { error: e instanceof Error ? e.message : String(e) };
    }
    jobBusy.value = false;
  }

  function rebuildJob() {
    const p = project.value;
    const id = ++jobRequest;
    if (!p) {
      job.value = {};
      jobBusy.value = false;
      return;
    }
    if (!workerFailed && !jobWorker) {
      try {
        jobWorker = new Worker(new URL('../workers/job.worker.ts', import.meta.url), { type: 'module' });
        jobWorker.onmessage = (event: MessageEvent<JobResponse>) => {
          if (event.data.id !== jobRequest) return; // a newer build is on its way
          job.value = event.data.job ? { job: event.data.job } : { error: event.data.error ?? 'unknown error' };
          jobBusy.value = false;
        };
        jobWorker.onerror = () => {
          // The worker itself couldn't run: build on the main thread from here on.
          workerFailed = true;
          jobWorker?.terminate();
          jobWorker = undefined;
          rebuildJob();
        };
      } catch {
        workerFailed = true;
      }
    }
    if (workerFailed || !jobWorker) return buildHere(p, shop.value);
    jobBusy.value = true;
    // Plain copies: Vue's reactive proxies can't be posted to a worker.
    const request: JobRequest = { id, project: JSON.parse(JSON.stringify(p)) as Project, shop: JSON.parse(JSON.stringify(shop.value)) as ShopProfile };
    jobWorker.postMessage(request);
  }
  watch([project, shop], rebuildJob, { deep: true, immediate: true });

  /**
   * What each step has to look at, as a line of words; a step with nothing is left out. The header puts
   * a dot on its circle: Setup when the project's machine is gone, Design for a job that
   * cannot be built and for where the cabinets stand, Plan for its warnings, Cut for a blank that does
   * not fit. A bit's cutting length not yet measured is the shop's to do, on every project: it is not one.
   */
  const stepWarnings = computed<Partial<Record<'setup' | 'design' | 'plan' | 'cut' | 'build', string>>>(() => {
    const p = project.value;
    if (!p) return {};
    const say = (list: string[]) => (list.length === 0 ? undefined : list.length === 1 ? list[0]! : `${list.length} things to check. First: ${list[0]!}`);
    const design: string[] = [];
    if (job.value.error) design.push(`The job cannot be built: ${job.value.error}`);
    try {
      design.push(...projectLayoutWarnings(p, materials.value, shop.value.hardware));
      design.push(...topWarnings(p, materials.value, sizeLength.value).map((w) => w.text));
      const tall = cabinetsPastCeiling(p, shop.value.hardware);
      if (tall) design.push(tall === 1 ? 'A cabinet reaches past the ceiling.' : `${tall} cabinets reach past the ceiling.`);
    } catch {
      // A design that cannot be laid out says so on Design itself.
    }
    const warnings = (job.value.job?.plan.warnings ?? []).filter((w) => w.code !== 'cuttingLengthUnknown');
    const fit = warnings.filter((w) => w.code === 'blankTooSmall' || w.code === 'stockTooSmall' || w.code === 'outsideCuttingArea');
    const out = {
      setup: machineGone.value ? 'The machine this project was planned for is no longer in the shop.' : undefined,
      design: say(design),
      plan: say(warnings.map((w) => w.message)),
      cut: say(fit.map((w) => w.message)),
    };
    return Object.fromEntries(Object.entries(out).filter(([, text]) => text));
  });

  const units = computed(() => ({ ...DEFAULT_UNIT_PREFERENCES, ...shop.value.units, ...project.value?.settings.units }));
  const show = (display: LengthDisplay) => (mm: number) => formatLength(mm, display);
  const sizeLength = computed(() => show(units.value.sizes));
  const cncLength = computed(() => show(units.value.cnc));
  const sawLength = computed(() => show(units.value.sawLists));

  async function guarded(work: () => Promise<void>) {
    try {
      await work();
      storageError.value = null;
    } catch (e) {
      storageError.value = `Browser storage failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function load(factory?: IDBFactory) {
    await guarded(async () => {
      store = await openStore(factory);
      // A profile of another version is not read (no upgrades before 1.0): the shop starts again from the starter one.
      const saved = await store.getShopProfile();
      if (saved && saved.schemaVersion !== SHOP_PROFILE_VERSION) {
        shopReset.value = 'The shop profile saved in this browser is from another version of Shop Foreman and could not be read. The shop starts again from the starter profile: your machines, bits, materials and hardware need entering again.';
        shop.value = createStarterShopProfile();
        await store.saveShopProfile(shop.value);
      } else shop.value = saved ?? createStarterShopProfile();
      const listed = await store.listProjects();
      unreadable.value = [];
      const readable: Project[] = [];
      for (const p of listed) {
        const problem = projectProblem(p);
        if (problem) unreadable.value.push({ id: p.id, name: p.name ?? p.id, problem });
        else readable.push(p);
      }
      projects.value = readable;
      // Pictures of projects that are still here.
      const pictures = await store.getThumbnails();
      thumbnails.value = Object.fromEntries(Object.entries(pictures).filter(([id]) => readable.some((p) => p.id === id)));
      const last = globalThis.localStorage?.getItem(LAST_PROJECT);
      currentId.value = projects.value.find((p) => p.id === last)?.id ?? projects.value[0]?.id ?? null;
    });
    ready.value = true;
  }

  function open(id: string) {
    currentId.value = id;
    globalThis.localStorage?.setItem(LAST_PROJECT, id);
  }

  /** New doors for a cabinet that is already there: starts from the vanity job's values; every one can be changed in Design. */
  function newExistingProject(): Project {
    const now = new Date().toISOString();
    const fresh: Project = { ...createVanityProject(), id: newId(), name: 'New doors', slug: 'doors', createdAt: now, updatedAt: now, machineId: shop.value.activeMachineId };
    projects.value.unshift(fresh);
    open(fresh.id);
    return fresh;
  }

  /** Starts from the reference base cabinet (the reference shop cabinet for the shop style); every value can be changed in Design. */
  function newCabinetProject(construction: ConstructionStyle = 'frameless'): Project {
    const now = new Date().toISOString();
    const start = construction === 'shop' ? createShopCabinetProject() : createBaseCabinetProject(construction);
    const fresh: Project = { ...start, id: newId(), name: construction === 'shop' ? 'New shop cabinet' : 'New cabinet', slug: construction === 'shop' ? 'shop-cabinet' : 'cabinet', createdAt: now, updatedAt: now, machineId: shop.value.activeMachineId };
    projects.value.unshift(fresh);
    open(fresh.id);
    return fresh;
  }

  /**
   * A new project from a preset (milestone 5): one base cabinet at the preset's start
   * size, or one cabinet that is already there, to be measured. Opened, to be set up in Setup. Returns
   * what fell back (hardware the shop no longer has).
   */
  function newProjectFrom(preset: Preset, starter?: Starter): { project: Project; fellBack: string[] } {
    const now = new Date().toISOString();
    // What is being made, then in what style: a starter in a preset's style. With no starter, as before.
    const { project: start, fellBack } = starter ? startProject(starter, preset, shop.value) : newProjectFromPreset(preset, shop.value);
    const made = preset.start !== 'existing' && !starter?.existing;
    const fresh: Project = { ...start, id: newId(), name: starter?.name ?? (made ? 'New project' : 'Cabinets already there'), slug: starter ? starter.id : made ? 'cabinets' : 'doors', createdAt: now, updatedAt: now, machineId: shop.value.activeMachineId };
    projects.value.unshift(fresh);
    open(fresh.id);
    return { project: projects.value[0]!, fellBack };
  }

  /** Adds a ready-made project (a sample) under a new id and opens it. */
  function addProject(start: Project): Project {
    const now = new Date().toISOString();
    // A new project takes the shop's machine in use, and keeps it.
    const fresh: Project = { ...start, id: newId(), createdAt: now, updatedAt: now, machineId: start.machineId ?? shop.value.activeMachineId };
    projects.value.unshift(fresh);
    open(fresh.id);
    return fresh;
  }

  async function remove(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id);
    unreadable.value = unreadable.value.filter((p) => p.id !== id);
    if (currentId.value === id) currentId.value = projects.value[0]?.id ?? null;
    const { [id]: _gone, ...kept } = thumbnails.value;
    thumbnails.value = kept;
    await guarded(async () => {
      await store?.deleteProject(id);
      await store?.saveThumbnails(kept);
    });
  }

  function exportCurrent() {
    if (!project.value) return;
    const text = serializeProjectFile(exportProject(project.value, shop.value));
    download(`${project.value.slug}${PROJECT_FILE_EXTENSION}`, text, 'application/json');
  }

  /** Throws with a readable message when the file isn't a project file. */
  function importText(text: string): Project {
    const file = parseProjectFile(text);
    shop.value = mergeLibrary(shop.value, file);
    // The project stays on the machine it came with (the file's), which `mergeLibrary` has put in the shop if it was not there.
    const imported = { ...file.project, machineId: file.project.machineId ?? file.library.machine?.id };
    if (projects.value.some((p) => p.id === imported.id)) imported.id = newId();
    projects.value.unshift(imported);
    open(imported.id);
    return imported;
  }

  // Save on every change, shortly after the last edit.
  let projectTimer: ReturnType<typeof setTimeout> | undefined;
  /** The project whose save is waiting. Another project opened before it is saved is saved at once, not lost. */
  let waiting: Project | undefined;
  const saveNow = (p: Project) => void guarded(async () => store?.saveProject({ ...p, updatedAt: new Date().toISOString() }));
  watch(
    project,
    (p) => {
      if (!ready.value || !p) return;
      clearTimeout(projectTimer);
      if (waiting && waiting.id !== p.id && projects.value.some((x) => x.id === waiting!.id)) saveNow(waiting);
      waiting = p;
      projectTimer = setTimeout(() => {
        waiting = undefined;
        saveNow(p);
      }, 400);
    },
    { deep: true },
  );
  let shopTimer: ReturnType<typeof setTimeout> | undefined;
  watch(
    shop,
    (s) => {
      if (!ready.value) return;
      clearTimeout(shopTimer);
      shopTimer = setTimeout(() => void guarded(async () => store?.saveShopProfile(s)), 400);
    },
    { deep: true },
  );

  return {
    shop,
    projects,
    currentId,
    project,
    materials,
    jobShop,
    machine,
    machineGone,
    stepWarnings,
    thumbnails,
    setThumbnail,
    unreadable,
    shopReset,
    job,
    jobBusy,
    ready,
    storageError,
    units,
    sizeLength,
    cncLength,
    sawLength,
    load,
    open,
    newExistingProject,
    newCabinetProject,
    newProjectFrom,
    addProject,
    remove,
    exportCurrent,
    importText,
  };
});
