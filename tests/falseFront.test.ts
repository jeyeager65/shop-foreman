// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FALSE_FRONT, buildCabinetAssembly, cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, isDrawer, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { ConstructionStyle, Project, StoredDrawer } from '@/model';
import { createBaseCabinetProject, setBays } from '@/samples/cabinet';
import { len } from '@/units';

/** A false front: the drawer over a sink's doors made a front only, fixed or tipping out with a tray. */
const shop = createStarterShop();
const project = (construction: ConstructionStyle, tilt = false, bays = 1): Project => {
  const p = createBaseCabinetProject(construction, 'drawerOverDoors');
  if (bays > 1) setBays(p, cabinetsOf(p)[0]!, bays);
  for (const d of p.designObjects.filter((d): d is StoredDrawer => d.template === 'drawer')) d.falseFront = tilt ? { tiltOut: { depth: len('2.5"') } } : {};
  return p;
};
const lists = (p: Project) => buildLists(buildJob(p, shop), p, shop, (mm) => `${Math.round(mm)} mm`);
const drawerIds = (p: Project) => designsOf(p).filter(isDrawer).map((d) => d.id);

describe('a false front', () => {
  it('is offered on the top drawer row over doors only', () => {
    const over = deriveCabinetOpenings(cabinetsOf(createBaseCabinetProject('frameless', 'drawerOverDoors'))[0]!, shop.materials);
    expect(over.filter((o) => o.overDoors).map((o) => o.use)).toEqual(['drawer']);
    const drawers = deriveCabinetOpenings(cabinetsOf(createBaseCabinetProject('frameless', 'drawers', 3))[0]!, shop.materials);
    expect(drawers.some((o) => o.overDoors)).toBe(false);
  });

  for (const construction of ['frameless', 'faceFrame', 'shop'] as const) {
    it(`${construction}: has its front and no box or slides`, () => {
      const p = project(construction);
      const ids = drawerIds(p);
      expect(deriveDrawerBoxParts(p, shop).filter((part) => ids.includes(part.designObjectId))).toEqual([]);
      const fronts = deriveParts(p, shop).filter((part) => ids.includes(part.designObjectId));
      expect(fronts).toHaveLength(1);
      expect(fronts[0]!.moves).toBeUndefined();
      expect(lists(p).hardware.some((h) => /slide/i.test(h.item) && !/tray/i.test(h.item))).toBe(false);
    });
  }

  it('fixed, is screwed to a block on each side on a frameless case, and through the stiles behind a face frame', () => {
    const blocks = (p: Project) => deriveCabinetParts(p, shop).filter((part) => part.name.startsWith('False front block'));
    expect(blocks(project('frameless')).map((b) => b.name)).toEqual(['False front block, left', 'False front block, right']);
    expect(blocks(project('faceFrame'))).toEqual([]);
    const screws = lists(project('faceFrame')).hardware.find((h) => h.group === 'False fronts');
    expect(screws).toMatchObject({ quantity: 4 });
  });

  it('tipping out, has a tray behind it that tips with it, and its hinges are on the list', () => {
    const p = project('faceFrame', true);
    const opening = deriveCabinetOpenings(cabinetsOf(p)[0]!, shop.materials).find((o) => o.overDoors)!;
    const tray = deriveCabinetParts(p, shop).filter((part) => part.name.startsWith('Tilt-out tray'));
    expect(tray.map((t) => t.name).sort()).toEqual(['Tilt-out tray, bottom', 'Tilt-out tray, left end', 'Tilt-out tray, lip', 'Tilt-out tray, right end']);
    const front = deriveParts(p, shop).find((part) => drawerIds(p).includes(part.designObjectId))!;
    expect(front.moves?.kind).toBe('tilt');
    for (const t of tray) expect(t.moves).toEqual(front.moves);
    // Inside the opening, less the clearances.
    const bottom = tray.find((t) => t.name === 'Tilt-out tray, bottom')!;
    const end = tray.find((t) => t.name === 'Tilt-out tray, left end')!;
    expect(bottom.size.width + 2 * end.size.thickness).toBeCloseTo(opening.width - FALSE_FRONT.trayNarrower, 6);
    const hinges = lists(p).hardware.find((h) => h.group === 'False fronts');
    expect(hinges).toMatchObject({ item: 'Tilt-out tray hinges', quantity: 1, unit: 'pair' });
    // The 3D view tips them about the front's bottom edge.
    const assembly = buildCabinetAssembly([...deriveCabinetParts(p, shop), ...deriveParts(p, shop)], shop.hardware);
    expect(assembly.parts.filter((part) => part.tiltsAbout).length).toBe(5);
  });

  it('two bays: each has its own, and its own tray', () => {
    const p = project('frameless', true, 2);
    const trays = deriveCabinetParts(p, shop).filter((part) => part.name.startsWith('Tilt-out tray, bottom'));
    expect(trays.map((t) => t.name)).toEqual(['Tilt-out tray, bottom, bay 1', 'Tilt-out tray, bottom, bay 2']);
    expect(lists(p).hardware.find((h) => h.group === 'False fronts')).toMatchObject({ quantity: 2 });
  });

  it('too deep a tray is refused', () => {
    const p = project('frameless', true);
    (p.designObjects.find((d) => d.template === 'drawer') as StoredDrawer).falseFront = { tiltOut: { depth: len('6"') } };
    expect(() => deriveCabinetParts(p, shop)).toThrow(/1-1\/2" to 4"/);
  });
});
