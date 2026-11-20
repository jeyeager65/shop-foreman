// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCabinetAssembly, cabinetsOf, createOrganizer, deriveCabinetOpenings, deriveCabinetParts, existingShellParts, partBox, shopFor } from '@/design';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { createBaseCabinetProject, makeBlind, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * A blind corner cabinet as the 3D view shows it: the example is half door opening and half blind, and both
 * trays slide out.
 */
const profile = createStarterShopProfile();
const halfAndHalf = (side: 'left' | 'right', construction: 'frameless' | 'faceFrame' = 'frameless') => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  stored.size.width = len('48"');
  stored.size.depth = len('24"');
  makeBlind(project, stored.id, side);
  if (stored.corner?.kind === 'blind') stored.corner.blind = len('24"');
  stored.inside = { obstacles: [], organizers: [{ id: 'tray-bottom', kind: 'tray' }, createOrganizer('blindTray')] };
  makeExisting(project, stored.id);
  const shop = shopFor(project, profile);
  return { project, shop, stored, cabinet: cabinetsOf(project)[0]! };
};

describe('a blind corner cabinet in the 3D view', () => {
  for (const side of ['left', 'right'] as const) {
    it(`blind on the ${side}: half its front is closed, drawn as a board from its outside edge to the door opening`, () => {
      const { project, shop, cabinet } = halfAndHalf(side);
      const W = cabinet.size.width.mm;
      expect(W).toBeCloseTo(len('48"').mm, 0);
      const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
      const shell = existingShellParts(project, shop);
      const front = shell.find((p) => p.id.endsWith('/blind-front'))!;
      expect(front.existing).toBe(true);
      const box = partBox(front);
      if (side === 'left') {
        expect(box.min[0]).toBeCloseTo(0, 4);
        expect(box.max[0]).toBeCloseTo(opening.origin.x, 4);
      } else {
        expect(box.min[0]).toBeCloseTo(opening.origin.x + opening.width, 4);
        expect(box.max[0]).toBeCloseTo(W, 4);
      }
      // About half the front is closed and half is the door opening.
      expect((box.max[0]! - box.min[0]!) / W).toBeGreaterThan(0.4);
      expect((box.max[0]! - box.min[0]!) / W).toBeLessThan(0.6);
      expect(opening.width / W).toBeGreaterThan(0.4);
      // It stands in front of the case, as a door does, and is never among the parts that are made.
      expect(box.min[2]).toBeGreaterThanOrEqual(-1e-6);
      expect(deriveCabinetParts(project, shop).some((p) => p.id.endsWith('/blind-front'))).toBe(false);
    });

    it(`blind on the ${side}: the drawer slider plays the two trays one after the other`, () => {
      const { project, shop, cabinet } = halfAndHalf(side);
      const parts = [...deriveCabinetParts(project, shop), ...existingShellParts(project, shop)];
      const placed = buildCabinetAssembly(parts).parts;
      const of = (test: (id: string) => boolean) => placed.filter((p) => test(p.partId));
      // The tray in front of the door: first, forward, right out.
      const frontTray = of((id) => id.includes('/sink-tray-bottom/') && !id.includes('strip') && !id.includes('frame'));
      expect(frontTray.length).toBeGreaterThanOrEqual(5);
      expect(frontTray.every((p) => p.pullStage === 1 && (p.slide ?? 0) > 300)).toBe(true);
      // The blind corner tray: second, across the cabinet by its own length, toward the door opening.
      const blind = of((id) => /\/sink-blind\/[^/]+$/.test(id));
      expect(blind.length).toBe(5);
      expect(blind.every((p) => p.pullStage === 2)).toBe(true);
      const travel = blind[0]!.across!;
      expect(blind.every((p) => p.across === travel)).toBe(true);
      expect(Math.sign(travel)).toBe(side === 'left' ? 1 : -1);
      const boxes = parts.filter((p) => /\/sink-blind\/[^/]+$/.test(p.id)).map(partBox);
      const [x0, x1] = [Math.min(...boxes.map((b) => b.min[0]!)), Math.max(...boxes.map((b) => b.max[0]!))];
      expect(Math.abs(travel)).toBeCloseTo(x1 - x0, 4);
      // Pulled across, it is inside the cabinet, behind the door opening.
      const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
      expect(x0 + travel).toBeGreaterThan(opening.origin.x - 40);
      expect(x1 + travel).toBeLessThan(opening.origin.x + opening.width + 40);
      // Its frame stays where it stands.
      expect(of((id) => id.includes('/sink-blind-frame/')).every((p) => p.pullStage === undefined && p.across === undefined)).toBe(true);
    });
  }

  it('behind a face frame the wide stile is the closed front: no board is drawn over it', () => {
    const { project, shop } = halfAndHalf('left', 'faceFrame');
    expect(existingShellParts(project, shop).some((p) => p.id.endsWith('/blind-front'))).toBe(false);
  });

  it('a cabinet with no blind half opens its drawers and trays as before', () => {
    const project = createBaseCabinetProject('frameless', 'drawerOverDoors');
    const shop = shopFor(project, profile);
    const placed = buildCabinetAssembly(deriveCabinetParts(project, shop)).parts;
    expect(placed.some((p) => p.pullStage !== undefined || p.across !== undefined)).toBe(false);
  });
});
