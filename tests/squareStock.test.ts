// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addMaterialFromCatalog, materialTitle } from '@/design/materials';
import { partShows } from '@/design/finishFaces';
import { partFaces } from '@/design/faces';
import { withGrain } from '@/design/grain';
import { stockLengths, STOCK_KERF } from '@/job/lists';
import { createStarterShopProfile, STARTER_MATERIALS } from '@/libraries';
import { SQUARE_2X2_ID, SQUARE_3X3_ID } from '@/libraries/materials';
import type { Part } from '@/model';
import { isBoardPart } from '@/plan/parts';
import { createBaseCabinetProject } from '@/samples/cabinet';

/** Furniture: square stock in the catalog, and the `leg` role wherever a part's role is asked. */
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
const leg = (long = 16 * 25.4): Part => ({
  id: 'table-1/leg-front-left',
  designObjectId: 'table-1',
  name: 'Leg, front left',
  materialId: SQUARE_2X2_ID,
  size: { width: 38.1, height: long, thickness: 38.1 },
  features: [],
  role: 'leg',
});

describe('square stock', () => {
  it('is in the catalog as a home centre stocks it: a 2x2 and a 3x3, named by one size and measured at another', () => {
    const profile = createStarterShopProfile();
    const squares = profile.materialCatalog.filter((m) => m.section === 'square');
    expect(squares.map((m) => [m.id, inches(m.nominalThickness.mm), inches(m.measuredThickness.mm), m.groupId, m.hasGrain, m.uses])).toEqual([
      [SQUARE_2X2_ID, 2, 1.5, 'solid-wood', true, ['legs']],
      [SQUARE_3X3_ID, 3, 2.5, 'solid-wood', true, ['legs']],
    ]);
    expect(squares.map((m) => inches(m.lengths![0]!.mm))).toEqual([96, 96]);
    expect(materialTitle(squares[0]!)).toBe('2" Square stock (a 2×2)');
    // Nothing else is square.
    expect(STARTER_MATERIALS.filter((m) => m.section).length).toBe(2);
  });

  it('is copied into a project from the catalog, and from what comes with the app when a saved shop profile lacks it', () => {
    const project = createBaseCabinetProject('faceFrame');
    const old = createStarterShopProfile().materialCatalog.filter((m) => !m.section);
    const copy = addMaterialFromCatalog(project, old, SQUARE_3X3_ID);
    expect(copy?.id).toBe(SQUARE_3X3_ID);
    expect(project.materials.some((m) => m.id === SQUARE_3X3_ID)).toBe(true);
    // A copy: the project's own, to be measured for it.
    copy!.measuredThickness = { mm: 63, unit: 'mm' };
    expect(STARTER_MATERIALS.find((m) => m.id === SQUARE_3X3_ID)!.measuredThickness.mm).toBeCloseTo(63.5, 3);
    expect(addMaterialFromCatalog(project, old, 'no-such-material')).toBeUndefined();
  });
});

describe('a leg', () => {
  it('is a board part: cut on the saws, never on the CNC; all of it shows; its grain runs its length', () => {
    expect(isBoardPart(leg())).toBe(true);
    expect(partShows(leg())).toEqual({ A: 'shows', B: 'shows', edges: 'shows' });
    expect(partFaces(leg())).toEqual({ A: 'Face', B: 'Opposite face' });
    expect(withGrain(leg(), 'leg', STARTER_MATERIALS).grain).toBe('height');
  });

  it('is bought by the length: as many lengths as the parts, the longest first, fit in', () => {
    const stock = 96 * 25.4;
    // Four 16" legs come out of one 8' length; four 29" ones need two.
    expect(stockLengths([16, 16, 16, 16].map((n) => n * 25.4), stock)).toBe(1);
    expect(stockLengths([29, 29, 29, 29].map((n) => n * 25.4), stock)).toBe(2);
    // A saw cut is lost between two parts: three 32" parts are 96" and do not fit in 96".
    expect(3 * 32 * 25.4 + 2 * STOCK_KERF).toBeGreaterThan(stock);
    expect(stockLengths([32, 32, 32].map((n) => n * 25.4), stock)).toBe(2);
    // One longer than the stock still counts as a length (to be bought longer).
    expect(stockLengths([120 * 25.4], stock)).toBe(1);
    expect(stockLengths([], stock)).toBe(0);
  });
});
