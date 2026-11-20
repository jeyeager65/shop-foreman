// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { setupSummary } from '@/design';
import { STARTER_HANDLES } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { activeMachine, largestParts, limitWords, partLimit, stockOnHand, stockSmallerThanMachine } from '@/plan';
import { addCabinet, addTallCabinet, addWallCabinet, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { FURNITURE_PRESET_ID, FURNITURE_SOLID_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { createVanityProject } from '@/samples/vanity';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';
import { lowRiderShop } from './lowRider';

/** Milestone 5: what Setup asks and shows. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const sizesOf = (p: Project) => (p.context as CasesContext).sizes;
const machine = activeMachine(lowRiderShop());

describe('start sizes', () => {
  it('a new cabinet of each form starts at the project size', () => {
    const project = createBaseCabinetProject();
    sizesOf(project).base = { height: len('31"'), depth: len('21"') };
    sizesOf(project).wall = { height: len('42"'), depth: len('15"') };
    sizesOf(project).tall = { height: len('90"'), depth: len('12"') };
    const base = addCabinet(project, { name: 'B', width: len('18"'), layout: 'doors' });
    const wall = addWallCabinet(project, { name: 'W' });
    const tall = addTallCabinet(project, { name: 'T' });
    expect([base.size.height, base.size.depth]).toEqual([len('31"'), len('21"')]);
    expect([wall.size.height, wall.size.depth]).toEqual([len('42"'), len('15"')]);
    expect([tall.size.height, tall.size.depth]).toEqual([len('90"'), len('12"')]);
  });

  it('changing them changes no cabinet already there', () => {
    const project = createBaseCabinetProject();
    const before = structuredClone((project.context as CasesContext).pieces[0]!.size);
    sizesOf(project).base.height = len('31"');
    expect((project.context as CasesContext).pieces[0]!.size).toEqual(before);
  });

  it('a shop project adds base cabinets 30" tall, as its first one is', () => {
    const project = createShopCabinetProject();
    expect(addCabinet(project, { name: 'B', width: len('24"'), layout: 'doors' }).size.height).toEqual(len('30"'));
  });
});

describe('the CNC and the stock on hand', () => {
  it('the LowRider 3 cuts 72" × 34" in one set-up and 96" with tiling', () => {
    const largest = largestParts(machine);
    expect([L(largest.oneSetup.long), L(largest.oneSetup.short)]).toEqual(['72"', '34"']);
    expect([L(largest.tiled!.long), L(largest.tiled!.short)]).toEqual(['96"', '34"']);
  });

  it('says what becomes of a cabinet side, by Plan\'s rules', () => {
    const plan = createBaseCabinetProject().plan;
    const sheet = { width: len('48"').mm, height: len('96"').mm };
    const side = (height: string, depth = '22-1/2"') => partLimit({ width: len(depth).mm, height: len(height).mm }, machine, sheet);
    expect(side('34-1/2"')).toBe('fits');
    expect(side('84"')).toBe('tiled');
    // Wider than the machine reaches across: cut on the saw.
    expect(partLimit({ width: len('36"').mm, height: len('84"').mm }, machine, sheet)).toBe('saw');
    // The default stock is the machine's 24" × 48" sheet: a tall side is longer than any on hand.
    expect(partLimit({ width: len('24"').mm, height: len('84"').mm }, machine, stockOnHand(plan, machine))).toBe('noStock');
    expect(limitWords('tiled', 'sides')).toBe('the sides are tiled in two set-ups on the CNC');
    expect(limitWords('noStock', 'sides')).toBe('no sheet on hand is big enough for the sides');
    // The LowRider 3 cuts 34" x 72" in one set-up: a quarter or a half sheet is smaller, a full one is not.
    const pieceOf = (w: string, h: string) => ({ width: len(w).mm, height: len(h).mm });
    expect([pieceOf('24"', '48"'), pieceOf('48"', '48"'), pieceOf('48"', '96"'), pieceOf('96"', '48"'), pieceOf('34"', '72"')].map((s) => stockSmallerThanMachine(machine, s))).toEqual([true, true, false, false, false]);
  });
});

describe('the Setup line', () => {
  it('names the style, the case, the doors and the bottom', () => {
    expect(setupSummary(createBaseCabinetProject(), STARTER_HANDLES, L)).toBe('Frameless, 3/4" Plywood, shaker doors, toe kick');
    expect(setupSummary(createShopCabinetProject(), STARTER_HANDLES, L)).toBe('Inset, 3/4" Plywood, slab doors, flat bottom');
    expect(setupSummary(createVanityProject(), STARTER_HANDLES, L)).toBe('Cabinets already there, shaker doors, 3/4" MDF');
  });

  it('says only what the project has: no doors on a dresser or a bookcase, no style or toe kick on a table', () => {
    const profile = lowRiderShop();
    const line = (id: string, preset: string) => setupSummary(startProject(starterById(id)!, builtInPresets().find((p) => p.id === preset)!, profile).project, profile.hardware, L);
    expect(line('dresser-posts', FURNITURE_SOLID_PRESET_ID)).toBe('Face frame, 3/4" Plywood, slab drawer fronts, generic knob, corner posts');
    expect(line('bookcase', FURNITURE_PRESET_ID)).toBe('Face frame, 3/4" Plywood, plinth');
    expect(line('endtable', FURNITURE_SOLID_PRESET_ID)).toBe('Tables, 3/4" Solid wood, legs of square stock (a 2×2)');
  });
});

describe('what differs from Setup', () => {
  it('a cabinet names only the settings its own copy changes', async () => {
    const { cabinetDifferences, setOwnSettings, cabinetsOf } = await import('@/design');
    const project = createBaseCabinetProject();
    setOwnSettings(project, 'cabinet-1', 'caseAndJoinery', true);
    expect(cabinetDifferences(project, 'cabinet-1')).toEqual([]);
    cabinetsOf(project)[0]!.joinery.case = 'dado';
    expect(cabinetDifferences(project, 'cabinet-1')).toEqual(['joinery']);
    setOwnSettings(project, 'cabinet-1', 'construction', true);
    cabinetsOf(project)[0]!.construction = 'faceFrame';
    // The face frame's numbers are Setup's own until changed: only the style differs.
    expect(cabinetDifferences(project, 'cabinet-1')).toEqual(['construction style', 'joinery']);
  });

  it('a door set names what its copy changes', async () => {
    const { frontDifferences, setOwnFrontSettings, designsOf } = await import('@/design');
    const project = createBaseCabinetProject();
    const doors = designsOf(project).find((d) => d.template === 'doorSet')!;
    expect(frontDifferences(project, doors.id)).toEqual([]);
    setOwnFrontSettings(project, doors.id, true);
    expect(frontDifferences(project, doors.id)).toEqual([]);
    const own = designsOf(project).find((d) => d.id === doors.id)!;
    if (own.template === 'doorSet') own.style = { kind: 'slab' };
    expect(frontDifferences(project, doors.id)).toEqual(['style']);
  });
});
