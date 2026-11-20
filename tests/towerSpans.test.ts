// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, shopFor, takesSpans, towerSpans } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { FRAMELESS_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Furniture: a shelf and a rod from a closet tower to the wall, or to the next tower, each side. */
const profile = createStarterShopProfile();
const contextOf = (p: Project) => p.context as CasesContext;
const inches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const closet = () => startProject(starterById('closet')!, builtInPresets().find((p) => p.id === FRAMELESS_PRESET_ID)!, profile).project;
const materials = (p: Project) => shopFor(p, profile).materials;
/** A part's box in the tower's frame, in inches. */
const box = (p: Part) => {
  const { origin, xAxis, yAxis } = p.placement!;
  const n = [xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1], xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2], xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0]];
  const corners = [0, 1].flatMap((u) => [0, 1].flatMap((v) => [0, 1].map((w) => [0, 1, 2].map((i) => origin[i]! + u * p.size.width * xAxis[i]! + v * p.size.height * yAxis[i]! - w * p.size.thickness * n[i]!))));
  return { min: [0, 1, 2].map((i) => inches(Math.min(...corners.map((c) => c[i]!)))), max: [0, 1, 2].map((i) => inches(Math.max(...corners.map((c) => c[i]!)))) };
};

describe('a closet: a tower with a shelf and a rod to the wall each side', () => {
  it('makes the tower, a shelf each side and a cleat under each of its ends; the rods are bought', () => {
    const project = closet();
    const [tower] = cabinetsOf(project);
    expect([tower!.form, !!tower!.rod, tower!.adjustableShelves, Object.keys(tower!.spans ?? {})]).toEqual(['tall', false, 3, ['left', 'right']]);
    const job = buildJob({ ...project, slug: 'closet' }, profile);
    const span = job.cabinetParts.filter((p) => p.id.includes('/span-'));
    expect(span.map((p) => `${p.id.split('/')[1]}:${p.role}`)).toEqual([
      'span-left-shelf:shelf', 'span-left-cleat-tower:stretcher', 'span-left-cleat-far:stretcher',
      'span-right-shelf:shelf', 'span-right-cleat-tower:stretcher', 'span-right-cleat-far:stretcher',
    ]);
    const named = (key: string) => span.find((p) => p.id.endsWith(`/${key}`))!;
    const t = inches(named('span-left-shelf').size.thickness);
    // The left shelf: 30" from the tower's side to the wall, as deep as the tower, its top 68" off the floor.
    expect(box(named('span-left-shelf'))).toEqual({ min: [-30, 68 - t, -16], max: [0, 68, 0] });
    expect(box(named('span-right-shelf'))).toEqual({ min: [24, 68 - t, -16], max: [54, 68, 0] });
    // Its cleats: under its two ends, against the tower's side and against the wall, 2" tall.
    const towerCleat = box(named('span-left-cleat-tower'));
    const wallCleat = box(named('span-left-cleat-far'));
    expect([towerCleat.min[0], towerCleat.max[0], wallCleat.min[0], wallCleat.max[0]]).toEqual([-t, 0, -30, -30 + t]);
    expect([towerCleat.max[1], inches((towerCleat.max[1]! - towerCleat.min[1]!) * 25.4)]).toEqual([68 - t, 2]);
    expect([box(named('span-right-cleat-tower')).min[0], box(named('span-right-cleat-far')).max[0]]).toEqual([24, 54]);
    expect(named('span-left-cleat-far').name).toBe('Shelf cleat, left, on the wall');
    expect(job.files.length).toBeGreaterThan(0);

    // The rods: one each side, under the shelf, on the hardware list with their flanges; drawn, never made.
    const built = towerSpans(tower!, materials(project));
    expect(built.map((s) => [s.side, inches(s.rod!.clearUnder), s.brackets])).toEqual([['left', 68 - t - 2.5, 0], ['right', 68 - t - 2.5, 0]]);
    const lists = buildLists(job, project, shopFor(project, profile), (mm) => `${inches(mm)}"`);
    expect(lists.hardware.filter((h) => /^Closet rod, /.test(h.item)).map((h) => h.quantity)).toEqual([1, 1]);
    expect(lists.hardware.filter((h) => /flanges/.test(h.item)).length).toBe(2);
    expect(lists.hardware.some((h) => /brackets/i.test(h.item))).toBe(false);
    const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
    if ('error' in scene) throw new Error(scene.error);
    expect(scene.parts.filter((p) => p.id.endsWith('-rod/shape')).map((p) => [p.existing, inches(p.size.width)])).toEqual([[true, 30], [true, 30]]);
  });

  it('wants a bracket under a shelf too long to carry clothes between its ends, and reaches to a next tower as to a wall', () => {
    const project = closet();
    const stored = contextOf(project).pieces[0]!;
    stored.spans!.left!.length = len('60"');
    stored.spans!.left!.to = 'tower';
    const [left] = towerSpans(cabinetsOf(project)[0]!, materials(project));
    expect([left!.brackets, inches(left!.x0)]).toEqual([1, -60]);
    const job = buildJob({ ...project, slug: 'closet' }, profile);
    expect(job.cabinetParts.find((p) => p.id.endsWith('/span-left-cleat-far'))!.name).toBe('Shelf cleat, left, on the next tower');
    const lists = buildLists(job, project, shopFor(project, profile), (mm) => `${inches(mm)}"`);
    expect(lists.hardware.find((h) => /brackets/i.test(h.item))?.quantity).toBe(1);
    // The rod alone, with no shelf: at the height given, and nothing made.
    stored.spans = { right: { length: len('36"'), to: 'wall', up: len('66"'), noShelf: true } };
    expect(buildJob({ ...project, slug: 'closet' }, profile).cabinetParts.some((p) => p.id.includes('/span-'))).toBe(false);
    expect(towerSpans(cabinetsOf(project)[0]!, materials(project)).map((s) => inches(s.rod!.y))).toEqual([66]);
  });

  it('is a tall case\'s, on its own: a base cabinet has nothing beside it', () => {
    const project = createBaseCabinetProject('frameless');
    contextOf(project).pieces[0]!.spans = { left: { length: len('30"'), to: 'wall', up: len('30"'), rod: true } };
    expect(takesSpans(cabinetsOf(project)[0]!)).toBe(false);
    expect(towerSpans(cabinetsOf(project)[0]!, materials(project))).toEqual([]);
    expect(buildJob({ ...project, slug: 'base' }, profile).cabinetParts.some((p) => p.id.includes('/span-'))).toBe(false);
  });
});
