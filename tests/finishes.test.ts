// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FINISH_GROUPS, cabinetsOf, clearCoatOf, coatsWords, colorNumber, coverageShown, coverageStored, coverageUnit, designsOf, doorHandleChoice, finishedColor, finishesOf, finishesUsed, isColour, primerOf, setClearCoat, setFinish, setInsideFinish, showsGrain } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { SQ_FT_A_QUART, STARTER_FINISHES, createStarterShop, newFinish } from '@/libraries';
import type { Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject, mergeLibrary } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Paint and stain: what a project is finished in, for the picture and the lists. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();

describe('the paints and stains in the shop profile', () => {
  it('has paints and stains, each a name and a colour', () => {
    expect(shop.finishes).toEqual(STARTER_FINISHES);
    expect(new Set(shop.finishes.map((f) => f.kind))).toEqual(new Set(['paint', 'stain', 'clear', 'primer']));
    expect(shop.finishes.every((f) => (colorNumber(f.color) !== undefined) === isColour(f) && f.name.length > 0)).toBe(true);
    expect(new Set(shop.finishes.map((f) => f.id)).size).toBe(shop.finishes.length);
    // The profile's own copy: changing a colour there does not change the starters.
    expect(shop.finishes).not.toBe(STARTER_FINISHES);
  });
});

describe('coats and coverage', () => {
  const by = (id: string) => shop.finishes.find((f) => f.id === id)!;

  it('a paint starts at a coat of primer and two of paint, a stain at a coat of stain and three of the clear coat', () => {
    for (const f of shop.finishes) {
      const want = { paint: [2, 1, undefined], stain: [1, undefined, 3], clear: [2, undefined, undefined], primer: [1, undefined, undefined] }[f.kind];
      expect([f.coats, f.primerCoats, f.clearCoats], f.id).toEqual(want);
      // The coverage is the usual figure on a can: a placeholder until it is typed.
      expect(f.coverage, f.id).toBeGreaterThan(0);
      expect(f.tuneMe, f.id).toEqual(['coverage']);
    }
    expect(coatsWords(by('paint-navy'))).toBe('1 coat of primer, 2 of paint');
    expect(coatsWords(by('stain-walnut'), by('clear-polyurethane'))).toBe('1 coat of stain, 3 of Polyurethane');
    expect(coatsWords({ ...by('paint-navy'), primerCoats: 0 })).toBe('2 coats of paint');
    expect(newFinish('stain', 'mine')).toMatchObject({ id: 'mine', name: 'New stain', kind: 'stain', coats: 1, clearCoats: 3 });
  });

  it('a coverage is stored in m² a litre and shown as the can says it: square feet a quart, or m² a litre', () => {
    const paint = by('paint-white');
    expect(coverageShown(paint.coverage, 'in')).toBe(100);
    expect(coverageShown(paint.coverage, 'mm')).toBeCloseTo(9.8, 5);
    expect(coverageShown(by('primer').coverage, 'in')).toBe(75);
    expect(coverageStored(100, 'in')).toBeCloseTo(100 * SQ_FT_A_QUART, 9);
    expect(coverageStored(12, 'mm')).toBe(12);
    expect([coverageUnit('in'), coverageUnit('mm')]).toEqual(['sq ft a quart', 'm² a litre']);
  });

  it('a clear coat and a primer are not chosen for a group of parts', () => {
    const project = createBaseCabinetProject('frameless');
    setFinish(project, 'case', 'clear-polyurethane');
    expect(finishesOf(project, shop)).toEqual({});
  });

  it('the project has one clear coat: the shop\'s first unless it names another', () => {
    const two = createStarterShop();
    two.finishes.push(newFinish('clear', 'clear-lacquer', 'Lacquer'));
    const project = createBaseCabinetProject('frameless');
    expect(clearCoatOf(project, two)?.id).toBe('clear-polyurethane');
    setClearCoat(project, two, 'clear-lacquer');
    expect(project.settings.finish).toEqual({ clearId: 'clear-lacquer' });
    expect(clearCoatOf(project, two)?.name).toBe('Lacquer');
    // One the shop no longer has: its first again. The first is the value left out.
    expect(clearCoatOf(project, shop)?.id).toBe('clear-polyurethane');
    setClearCoat(project, two, 'clear-polyurethane');
    expect(project.settings.finish).toBeUndefined();
    expect(primerOf(shop)?.id).toBe('primer');
  });

  it('what the finish takes: a primer under a paint, the clear coat over a stain or on a clear coated inside', () => {
    const ids = (project: Project) => finishesUsed(project, shop).map((f) => f.id);
    const project = createBaseCabinetProject('frameless');
    expect(ids(project)).toEqual([]);
    setFinish(project, 'case', 'paint-white');
    setFinish(project, 'fronts', 'paint-white');
    expect(ids(project)).toEqual(['paint-white', 'primer']);
    setFinish(project, 'fronts', 'stain-walnut');
    expect(ids(project)).toEqual(['paint-white', 'stain-walnut', 'clear-polyurethane', 'primer']);
    setFinish(project, 'fronts', undefined);
    setInsideFinish(project, 'boxes', 'clear');
    expect(ids(project)).toEqual(['paint-white', 'clear-polyurethane', 'primer']);
    setInsideFinish(project, 'boxes', 'bare');
    cabinetsOf(project)[0]!.insideFinish = 'clear';
    expect(ids(project)).toEqual(['paint-white', 'clear-polyurethane', 'primer']);
  });
});

describe('a project\'s finish', () => {
  it('is none to start with; one is chosen for the case, the fronts and wooden handles apart', () => {
    const project = createBaseCabinetProject('frameless');
    expect(project.settings.finish).toBeUndefined();
    expect(finishesOf(project, shop)).toEqual({});
    setFinish(project, 'case', 'paint-white');
    setFinish(project, 'fronts', 'stain-walnut');
    expect(project.settings.finish).toEqual({ caseId: 'paint-white', frontsId: 'stain-walnut' });
    const chosen = finishesOf(project, shop);
    expect([chosen.case?.name, chosen.fronts?.name, chosen.handles]).toEqual(['White paint', 'Walnut stain', undefined]);
    // Taking the last one off leaves nothing stored.
    setFinish(project, 'case', undefined);
    setFinish(project, 'fronts', undefined);
    expect(project.settings.finish).toBeUndefined();
    expect(FINISH_GROUPS.map((g) => g.group)).toEqual(['case', 'fronts', 'handles', 'tops']);
  });

  it('a finish the shop profile no longer has is as none', () => {
    const project = createBaseCabinetProject('frameless');
    setFinish(project, 'case', 'paint-gone');
    expect(finishesOf(project, shop)).toEqual({});
  });

  it('changes nothing that is cut', () => {
    const plain = buildJob(createBaseCabinetProject('frameless'), shop);
    const project = createBaseCabinetProject('frameless');
    setFinish(project, 'case', 'paint-navy');
    setFinish(project, 'fronts', 'stain-cherry');
    const job = buildJob(project, shop);
    expect(job.files.map((f) => f.text.replace(/New cabinet|Base cabinet/g, ''))).toEqual(plain.files.map((f) => f.text.replace(/New cabinet|Base cabinet/g, '')));
    expect([...job.parts, ...job.cabinetParts]).toEqual([...plain.parts, ...plain.cabinetParts]);
  });
});

describe('the colour a part is drawn in', () => {
  const wood = 0xd9bf94;
  const [white, walnut] = [shop.finishes.find((f) => f.id === 'paint-white')!, shop.finishes.find((f) => f.id === 'stain-walnut')!];

  it('is its material\'s with no finish, and the paint\'s under paint, which hides the grain', () => {
    expect(finishedColor(wood, undefined)).toBe(wood);
    expect(finishedColor(wood, white)).toBe(0xf2f1ec);
    expect(finishedColor(0x333333, white)).toBe(0xf2f1ec);
    expect([showsGrain(undefined), showsGrain(white), showsGrain(walnut)]).toEqual([true, false, true]);
  });

  it('under stain is the wood taken most of the way to the stain: a paler wood stays a little paler', () => {
    const stained = finishedColor(wood, walnut);
    const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const [w, s, t] = [channels(wood), channels(colorNumber(walnut.color)!), channels(stained)];
    for (let i = 0; i < 3; i++) {
      // Between the two, nearer the stain.
      expect(t[i]).toBeGreaterThanOrEqual(Math.min(w[i]!, s[i]!));
      expect(t[i]).toBeLessThanOrEqual(Math.max(w[i]!, s[i]!));
      expect(Math.abs(t[i]! - s[i]!)).toBeLessThan(Math.abs(t[i]! - w[i]!));
    }
    expect(finishedColor(0x8a6a40, walnut)).not.toBe(stained);
    // A colour that is not one changes nothing.
    expect(finishedColor(wood, { ...walnut, color: 'brown' })).toBe(wood);
  });
});

describe('the finish in the lists and the project file', () => {
  const finishedProject = (): Project => {
    const project = createBaseCabinetProject('frameless');
    setFinish(project, 'case', 'paint-white');
    setFinish(project, 'fronts', 'paint-navy');
    setFinish(project, 'handles', 'stain-walnut');
    return project;
  };

  it('the lists name each finish and what it is for; wooden handles only where the job has some', () => {
    const rows = (project: Project) => buildLists(buildJob(project, shop), project, shop, L).hardware.filter((h) => h.group === 'Finish');
    expect(rows(finishedProject()).map((h) => [h.item, h.note?.split(':')[0]])).toEqual([
      ['White paint', 'Case'],
      ['Navy paint', 'Doors and drawer fronts'],
      ['Primer', 'Under White paint'],
    ]);
    const handled = finishedProject();
    for (const d of designsOf(handled)) {
      if (d.template === 'drawer') d.handle = { handleId: 'wood-bar-96' };
      else d.handle = doorHandleChoice('wood-bar-96');
    }
    expect(rows(handled).map((h) => h.item)).toEqual(['White paint', 'Navy paint', 'Walnut stain', 'Polyurethane', 'Primer']);
    expect(rows(createBaseCabinetProject('frameless'))).toEqual([]);
  });

  it('a project file carries the finishes it uses, and a shop that has not got them gains them', () => {
    const file = exportProject(finishedProject(), shop);
    // With the clear coat over the stain and the primer under the paints.
    expect(file.library.finishes?.map((f) => f.id)).toEqual(['paint-white', 'paint-navy', 'stain-walnut', 'clear-polyurethane', 'primer']);
    expect(exportProject(createBaseCabinetProject('frameless'), shop).library.finishes).toBeUndefined();
    const other = createStarterShop();
    other.finishes = other.finishes.filter((f) => f.id !== 'paint-navy');
    const merged = mergeLibrary(other, file);
    expect(merged.finishes.some((f) => f.id === 'paint-navy')).toBe(true);
    expect(merged.finishes).toHaveLength(shop.finishes.length);
  });
});
