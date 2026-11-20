// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bottomKindOf, cabinetsOf, closetRod, hangingWords, rodShapes, shopFor, takesRod } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { FRAMELESS_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Furniture: a closet tower, and a hanging rod inside a case. */
const profile = createStarterShopProfile();
const contextOf = (p: Project) => p.context as CasesContext;
const inches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const tower = () => startProject(starterById('closettower')!, builtInPresets().find((p) => p.id === FRAMELESS_PRESET_ID)!, profile).project;
const materials = (p: Project) => shopFor(p, profile).materials;

describe('a closet tower', () => {
  it('is tall, open and shallow, on a plinth: shelves above its fixed shelf, a rod below', () => {
    const project = tower();
    const [c] = cabinetsOf(project);
    expect([c!.form, inches(c!.size.width.mm), inches(c!.size.height.mm), inches(c!.size.depth.mm)]).toEqual(['tall', 24, 84, 16]);
    expect(c!.layout.rows.map((r) => [r.open, r.shelves ?? 0])).toEqual([[true, 3], [true, 0]]);
    expect([bottomKindOf(contextOf(project).settings.toeKick), c!.adjustableShelves, !!c!.rod]).toEqual(['plinth', 0, true]);
    const job = buildJob({ ...project, slug: 'tower' }, profile);
    expect(job.parts).toEqual([]);
    // Three loose shelves above, and the fixed one between the two rows.
    expect(job.cabinetParts.filter((p) => p.role === 'shelf').length).toBe(3);
    expect(job.cabinetParts.filter((p) => p.id.endsWith('/fixed-shelf')).length).toBe(1);
    // Nothing is made for the rod: it is not a part of the job.
    expect(job.cabinetParts.some((p) => p.id.includes('/rod'))).toBe(false);
    expect(job.files.length).toBeGreaterThan(0);
  });

  it('has a bought rod across its lower row, between the sides, with room under it for shirts', () => {
    const project = tower();
    const [c] = cabinetsOf(project);
    const rod = closetRod(c!, materials(project))!;
    expect(rod.opening.name).toBe('Open shelves 2');
    // Between the sides; in the middle of a 16" deep case; 2-1/2" below the top of its opening.
    const t = materials(project).find((m) => m.id === c!.materials.caseId)!.measuredThickness.mm;
    expect(rod.length).toBeCloseTo(24 * 25.4 - 2 * t, 3);
    expect(inches(rod.behind)).toBe(8);
    expect(rod.clearUnder).toBeCloseTo(rod.opening.height - 2.5 * 25.4, 3);
    expect(inches(rod.clearUnder)).toBeGreaterThan(40);
    expect(hangingWords(rod.clearUnder)).toContain('shirts');
    expect(hangingWords(66 * 25.4)).toContain('long coats and dresses');
    expect(hangingWords(30 * 25.4)).toContain('less than shirts');
    // On the hardware list: the rod, cut to length, and its flanges.
    const lists = buildLists(buildJob({ ...project, slug: 'tower' }, profile), project, shopFor(project, profile), (mm) => `${inches(mm)}"`);
    const rodRow = lists.hardware.find((h) => /^Closet rod, /.test(h.item))!;
    expect([rodRow.quantity, rodRow.group]).toEqual([1, 'Case']);
    expect(rodRow.note).toContain(`cut to ${inches(rod.length - 3)}"`);
    expect(lists.hardware.find((h) => /flanges/.test(h.item))?.quantity).toBe(1);
    // In the picture: one stick, drawn and never cut.
    const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
    if ('error' in scene) throw new Error(scene.error);
    const drawn = scene.parts.filter((p) => p.id.endsWith('/rod/shape'));
    expect(drawn.map((p) => [p.existing, inches(p.size.height)])).toEqual([[true, 1.31]]);
    // Lower down when asked.
    contextOf(project).pieces[0]!.rod = { down: len('6"') };
    expect(closetRod(cabinetsOf(project)[0]!, materials(project))!.clearUnder).toBeCloseTo(rod.opening.height - 6 * 25.4, 3);
  });

  it('a rod hangs only in a row that is open', () => {
    const project = createBaseCabinetProject('frameless');
    contextOf(project).pieces[0]!.rod = {};
    expect(takesRod(cabinetsOf(project)[0]!)).toBe(false);
    expect(closetRod(cabinetsOf(project)[0]!, materials(project))).toBeUndefined();
    expect(rodShapes(project, materials(project))).toEqual([]);
  });
});
