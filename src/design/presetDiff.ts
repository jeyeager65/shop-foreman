/**
 * What a project's shared values differ in from the preset it started from. What differs is marked: a dot on the
 * field and on its topic, with "Back to the preset's" a topic. A difference is a path to one value:
 * `settings.toeKick.height`, `fronts.doors.style.kind`,
 * `finish.caseId`, `sizes.base.depth`. A preset holds settings, fronts, finish and start sizes only: the room, the
 * tops, the machine and the materials have nothing to differ from.
 */
import type { CabinetSettings, FrontSettings, Preset, Project, ProjectFinish, StartSizes } from '@/model';
import { shopDoorDefaults } from './style';

/** Setup's topics that hold a preset's values. */
export type PresetTopic = 'construction' | 'case' | 'joints' | 'fronts' | 'bottom' | 'finish' | 'sizes';

type Values = { settings: CabinetSettings; fronts: FrontSettings; finish: ProjectFinish; sizes: StartSizes };
const valuesOf = (project: Project): Values => ({ settings: project.context.settings, fronts: project.context.fronts, finish: project.settings.finish ?? {}, sizes: project.context.sizes });
/**
 * A preset's values, as a project built `construction` has them: a preset that says nothing of the shop style's
 * slab doors gives a project in that style the usual ones (as Setup does when it first shows them).
 */
function presetValues(preset: Preset, construction: CabinetSettings['construction']): Values {
  return { settings: preset.settings, fronts: withShopDoors(preset.fronts, preset, construction), finish: preset.finish ?? {}, sizes: preset.sizes };
}
const withShopDoors = (fronts: FrontSettings, preset: Preset, construction: CabinetSettings['construction']): FrontSettings =>
  construction === 'shop' && !fronts.doors.shop ? { ...fronts, doors: { ...fronts.doors, shop: shopDoorDefaults(preset.settings.materials.caseId) } } : fronts;

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A length: the same when it is the same size, whatever unit it is shown in. */
const isLength = (v: unknown): v is { mm: number } => isObject(v) && typeof v.mm === 'number' && 'unit' in v;
const same = (a: unknown, b: unknown): boolean => {
  if (isLength(a) && isLength(b)) return Math.abs(a.mm - b.mm) < 0.005;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};

function walk(a: unknown, b: unknown, path: string, out: string[]): void {
  if (isObject(a) && isObject(b) && !isLength(a) && !isLength(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path ? `${path}.${key}` : key, out);
    return;
  }
  // `false` and left out are the same answer: a switch turned on and off again.
  if (!same(a === false ? undefined : a, b === false ? undefined : b)) out.push(path);
}

/**
 * The values of another way of building than the project's: kept, never used, and shown nowhere, so not a
 * difference (a shop cabinet's gap in a frameless project; the slab doors a project was given while it was
 * tried in the shop style).
 */
function unused(path: string, settings: CabinetSettings): boolean {
  const c = settings.construction;
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}.`);
  if (c !== 'faceFrame' && (under('settings.faceFrame') || under('fronts.doors.hingeId') || under('fronts.drawers.faceFrameMount'))) return true;
  if (c !== 'frameless' && (under('settings.frameless') || under('fronts.doors.framelessHingeId'))) return true;
  if (c !== 'shop' && (under('settings.shop') || under('fronts.doors.shop') || under('fronts.doors.shopHingeId') || under('fronts.doors.shopPull') || under('fronts.drawers.shop'))) return true;
  return false;
}

/** Every value of the project's that is not the preset's, as paths. `preset`: as `resolvePreset` gives it for this shop. */
export function presetDiffs(project: Project, preset: Preset): string[] {
  const out: string[] = [];
  const construction = project.context.settings.construction;
  // (A project that has not been shown its slab doors yet has the usual ones too.)
  walk({ ...valuesOf(project), fronts: withShopDoors(project.context.fronts, preset, construction) }, presetValues(preset, construction), '', out);
  return out.filter((path) => !unused(path, project.context.settings));
}

/** The topic of Setup a value is answered under. */
export function presetTopic(path: string): PresetTopic {
  // How things are joined is one topic, whatever is joined: the cases, their backs, the drawer boxes, the toe kick board.
  if (/^settings\.joinery\.(case|back|tabs)\b/.test(path) || /^settings\.toeKick\.joint\b/.test(path) || /^fronts\.drawers\.(cornerJoint|fingers)\b/.test(path)) return 'joints';
  if (path.startsWith('fronts.')) return 'fronts';
  if (path.startsWith('finish.')) return 'finish';
  if (path.startsWith('sizes.')) return 'sizes';
  if (/^settings\.toeKick\.(off|casters)\b/.test(path)) return 'bottom';
  if (/^settings\.(materials|shelfPinId|joinery|hanging)\b/.test(path)) return 'case';
  return 'construction';
}

/** Whether `path`, anything under it, or something it is part of, is among the differences. */
export const differsAt = (diffs: Iterable<string>, path: string): boolean => {
  for (const d of diffs) if (d === path || d.startsWith(`${path}.`) || path.startsWith(`${d}.`)) return true;
  return false;
};

/**
 * Gives a topic of the project the preset's values back, in place: every value under it that differs. A material
 * the preset names and the project no longer has is added again.
 */
export function backToPreset(project: Project, preset: Preset, topic: PresetTopic): void {
  const from = presetValues(preset, project.context.settings.construction);
  for (const path of presetDiffs(project, preset).filter((p) => presetTopic(p) === topic)) {
    if (topic === 'finish') {
      if (preset.finish) project.settings.finish = plain(preset.finish);
      else delete project.settings.finish;
      break;
    }
    const keys = path.split('.');
    let [mine, theirs]: [Record<string, unknown>, Record<string, unknown>] = [valuesOf(project) as unknown as Record<string, unknown>, from as unknown as Record<string, unknown>];
    // Down to where the two part: the value itself, or the first thing only one of them has.
    for (const [i, key] of keys.entries()) {
      const [a, b] = [mine[key], theirs[key]];
      if (i < keys.length - 1 && isObject(a) && isObject(b)) {
        [mine, theirs] = [a, b];
        continue;
      }
      if (b === undefined) delete mine[key];
      else mine[key] = plain(b);
      break;
    }
  }
  for (const m of preset.materials) if (!project.materials.some((o) => o.id === m.id)) project.materials.push(plain(m));
}
