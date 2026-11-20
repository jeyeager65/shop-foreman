// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { areaWords, cabinetsOf, cansOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, finishAmounts, finishSteps, setFinish, setInsideFinish, usesWords } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Areas and amounts of finish, and what the checklist says of finishing. */
const shop = createStarterShop();
const partsOf = (project: Project) => [...deriveCabinetParts(project, shop), ...deriveParts(project, shop), ...deriveDrawerBoxParts(project, shop)];
const amounts = (project: Project) => finishAmounts(project, shop, partsOf(project));
const use = (project: Project, finish: string, what: string) => amounts(project).find((a) => a.finish.id === finish)?.uses.find((u) => u.what === what);
const painted = (style: 'frameless' | 'faceFrame' = 'frameless', caseId = 'paint-navy', frontsId = caseId) => {
  const project = createBaseCabinetProject(style);
  setFinish(project, 'case', caseId);
  setFinish(project, 'fronts', frontsId);
  return project;
};

describe('the area a finish covers', () => {
  it('nothing with no finish', () => {
    expect(amounts(createBaseCabinetProject('frameless'))).toEqual([]);
  });

  it('a front is finished on both faces and all round its edges', () => {
    const project = painted();
    const fronts = partsOf(project).filter((p) => !p.role);
    const want = fronts.reduce((n, p) => n + (2 * p.size.width * p.size.height + 2 * (p.size.width + p.size.height) * p.size.thickness) / 1e6, 0);
    expect(fronts.length).toBeGreaterThan(0);
    expect(use(project, 'paint-navy', 'Doors and drawer fronts')?.area).toBeCloseTo(want, 9);
  });

  it('a case is finished where it shows: a side against a neighbour takes its outside off', () => {
    const project = painted();
    const all = use(project, 'paint-navy', 'Case')!.area;
    const side = partsOf(project).find((p) => p.id === 'cabinet-1/side-left')!;
    cabinetsOf(project)[0]!.sides.left = 'hidden';
    expect(all - use(project, 'paint-navy', 'Case')!.area).toBeCloseTo((side.size.width * side.size.height) / 1e6, 9);
    // Bare inside: none of the inside is in it, so the case is much less than its parts' faces.
    const faces = partsOf(project).filter((p) => p.role === 'side' || p.role === 'bottom' || p.role === 'back').reduce((n, p) => n + (2 * p.size.width * p.size.height) / 1e6, 0);
    expect(all).toBeLessThan(faces / 2);
  });

  it('the insides and the drawer boxes are areas of their own, in the case\'s finish or the clear coat', () => {
    const project = painted();
    expect(amounts(project).map((a) => a.finish.id)).toEqual(['paint-navy', 'primer']);
    setInsideFinish(project, 'inside', 'case');
    setInsideFinish(project, 'boxes', 'clear');
    const [paint, clear, primer] = amounts(project);
    expect(paint!.uses.map((u) => u.what)).toEqual(['Case', 'Doors and drawer fronts', 'Insides of the cases']);
    expect(clear!.finish.id).toBe('clear-polyurethane');
    expect(clear!.uses.map((u) => [u.what, u.coats])).toEqual([['Drawer boxes', 2]]);
    // A drawer box is finished all over: its faces, and one long edge of each part.
    const boxes = partsOf(project).filter((p) => p.role?.startsWith('box'));
    expect(clear!.uses[0]!.area).toBeCloseTo(boxes.reduce((n, p) => n + (2 * p.size.width * p.size.height + Math.max(p.size.width, p.size.height) * p.size.thickness) / 1e6, 0), 9);
    // The primer goes under all the paint covers, the inside too.
    expect(primer!.uses).toEqual([{ what: 'Under Navy paint', area: paint!.uses.reduce((n, u) => n + u.area, 0), coats: 1 }]);
    // Prefinished and bare: nothing.
    setInsideFinish(project, 'inside', 'prefinished');
    setInsideFinish(project, 'boxes', 'bare');
    expect(amounts(project).map((a) => a.finish.id)).toEqual(['paint-navy', 'primer']);
    expect(use(project, 'paint-navy', 'Insides of the cases')).toBeUndefined();
  });

  it('a stain has the clear coat over it; the amount is area × coats ÷ coverage', () => {
    const project = painted('faceFrame', 'stain-walnut');
    const [stain, clear, none] = amounts(project);
    expect(none).toBeUndefined();
    const area = stain!.uses.reduce((n, u) => n + u.area, 0);
    expect(stain!.litres).toBeCloseTo((area * 1) / stain!.finish.coverage, 9);
    expect(clear!.uses).toEqual([{ what: 'Over Walnut stain', area, coats: 3 }]);
    expect(clear!.litres).toBeCloseTo((area * 3) / clear!.finish.coverage, 9);
    // A stain with no clear coat over it, and a paint with no primer under it: no line for either.
    const bare = createStarterShop();
    bare.finishes.find((f) => f.id === 'stain-walnut')!.clearCoats = 0;
    expect(finishAmounts(project, bare, partsOf(project)).map((a) => a.finish.id)).toEqual(['stain-walnut']);
  });

  it('a cabinet made twice takes twice the finish', () => {
    const once = amounts(painted())[0]!.litres;
    const project = painted();
    cabinetsOf(project)[0]!.quantity = 2;
    expect(amounts(project)[0]!.litres).toBeCloseTo(2 * once, 9);
  });

  it('is said in square feet and quarts, or m² and litres, rounded up to a can', () => {
    expect([areaWords(2, 'in'), areaWords(2, 'mm'), areaWords(0.01, 'in')]).toEqual(['22 sq ft', '2 m²', '1 sq ft']);
    expect(cansOf(0.5, 'in')).toEqual({ quantity: 1, unit: 'quart' });
    expect(cansOf(1, 'in')).toEqual({ quantity: 2, unit: 'quarts' });
    expect(cansOf(1, 'mm')).toEqual({ quantity: 1, unit: 'litre' });
    expect(cansOf(2.2, 'mm')).toEqual({ quantity: 3, unit: 'litres' });
    expect(usesWords({ finish: shop.finishes[0]!, litres: 1, uses: [{ what: 'Case', area: 2, coats: 2 }, { what: 'Drawer boxes', area: 1, coats: 1 }] }, 'in')).toBe('Case: 22 sq ft, 2 coats; Drawer boxes: 11 sq ft, 1 coat');
  });
});

describe('the finish in Build', () => {
  const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
  const rows = (project: Project) => buildLists(buildJob(project, shop), project, shop, L).hardware.filter((h) => h.group === 'Finish');
  const steps = (project: Project) => {
    const job = buildJob(project, shop);
    return buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware, shop.finishes);
  };

  it('the lists give each finish its areas, its coats and the cans to buy', () => {
    const project = painted('frameless', 'paint-white', 'stain-walnut');
    setInsideFinish(project, 'inside', 'clear');
    const got = rows(project);
    expect(got.map((h) => [h.item, h.quantity, h.unit])).toEqual([
      ['White paint', 1, 'quart'],
      ['Walnut stain', 1, 'quart'],
      ['Polyurethane', 1, 'quart'],
      ['Primer', 1, 'quart'],
    ]);
    expect(got[0]!.note).toMatch(/^Case: \d+ sq ft, 2 coats\. A rough area, at 100 sq ft a quart \(tune me\)\./);
    expect(got[2]!.note).toMatch(/^Over Walnut stain: \d+ sq ft, 3 coats; Insides of the cases: \d+ sq ft, 2 coats\./);
    // Prefinished insides are said, with nothing to buy.
    setInsideFinish(project, 'inside', 'prefinished');
    const last = rows(project).at(-1)!;
    expect([last.item, last.quantity, last.note]).toEqual(['Prefinished sheet', undefined, 'Nothing to put on the insides of the cases.']);
  });

  it('the checklist says what to finish, what the inside gets and what to leave', () => {
    // No finish: as it always was.
    expect(steps(createBaseCabinetProject('frameless'))).toContain('Seal and paint.');
    const project = painted('frameless', 'paint-white', 'stain-walnut');
    setInsideFinish(project, 'inside', 'clear');
    const said = steps(project);
    expect(said).not.toContain('Seal and paint.');
    expect(said).toContain('Finish the case where it shows with the doors shut: White paint, 1 coat of primer, 2 of paint.');
    expect(said).toContain('Finish the doors and drawer fronts: Walnut stain, 1 coat of stain, 3 of Polyurethane.');
    expect(said).toContain('The inside of the case: Polyurethane, 2 coats. The drawer boxes stay bare.');
    expect(said.some((s) => s.startsWith('Leave bare what is never seen'))).toBe(true);
    // One finish on both is one sentence; a cabinet's own inside is its own answer.
    const navy = painted();
    expect(finishSteps(navy, shop, { insideFinish: 'case' })).toEqual([
      'Finish the case where it shows with the doors shut and the doors and drawer fronts: Navy paint, 1 coat of primer, 2 of paint.',
      'The inside of the case: Navy paint too.',
      expect.stringMatching(/^Leave bare/),
    ]);
    // Only the insides answered: still said.
    const inside = createBaseCabinetProject('frameless');
    setInsideFinish(inside, 'inside', 'prefinished');
    expect(finishSteps(inside, shop)[0]).toBe('The inside of the case is prefinished: nothing to do, but keep the finish off it.');
  });
});
