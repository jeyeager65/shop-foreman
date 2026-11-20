// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCabinetAssembly, cabinetsOf, createOrganizer, deriveCabinetParts, existingShellParts, partBox, shopFor, traySlideMounts, trayOf } from '@/design';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { createBaseCabinetProject, makeBlind, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/** The slides of the trays inside a cabinet, drawn in the 3D view. */
const profile = createStarterShopProfile();
const blindCorner = () => {
  const project = createBaseCabinetProject('frameless', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  stored.size.width = len('48"');
  stored.size.depth = len('24"');
  makeBlind(project, stored.id, 'left');
  if (stored.corner?.kind === 'blind') stored.corner.blind = len('24"');
  stored.inside = { obstacles: [], organizers: [{ id: 'tray-bottom', kind: 'tray' }, createOrganizer('blindTray')] };
  makeExisting(project, stored.id);
  const shop = shopFor(project, profile);
  const parts = [...deriveCabinetParts(project, shop), ...existingShellParts(project, shop)];
  const mounts = traySlideMounts(cabinetsOf(project), shop);
  return { project, shop, parts, mounts, placed: buildCabinetAssembly(parts, [], mounts).parts };
};

describe('the slides of the trays in the 3D view', () => {
  it('every tray has a slide mount, as long as the tray is', () => {
    const { parts, mounts } = blindCorner();
    expect(mounts.map((m) => m.drawerId).sort()).toEqual(['cabinet-1/sink-blind', 'cabinet-1/sink-tray-bottom']);
    for (const m of mounts) {
      const side = parts.find((p) => trayOf(p) === m.drawerId && /side/.test(p.id))!;
      expect(m.length).toBeCloseTo(side.size.width, 6);
      expect(m.slide.sideClearance.mm).toBeGreaterThan(0);
    }
    // A cabinet with nothing inside it has none.
    const plain = createBaseCabinetProject('frameless', 'doors');
    expect(traySlideMounts(cabinetsOf(plain), shopFor(plain, profile))).toEqual([]);
  });

  it('a roll-out tray: a slide beside each of its two sides, running front to back', () => {
    const { parts, placed } = blindCorner();
    const sides = placed.filter((p) => p.partId.includes('/sink-tray-bottom/') && p.role === 'boxSide');
    expect(sides.length).toBe(2);
    for (const s of sides) {
      const box = partBox(parts.find((p) => p.id === s.partId)!);
      expect(s.runsOn).toBeDefined();
      expect(s.runsOn!.turn).toBeUndefined();
      // In the clearance beside the tray's side, its front end at the tray's front.
      expect(s.runsOn!.front).toBeCloseTo(box.max[2]!, 6);
      const beside = s.runsOn!.dir > 0 ? box.min[0]! - s.runsOn!.outer : s.runsOn!.outer - box.max[0]!;
      expect(beside).toBeCloseTo(s.runsOn!.clearance, 6);
    }
    expect(sides.map((s) => s.runsOn!.dir).sort()).toEqual([-1, 1]);
  });

  it('the blind corner tray: a slide before it and one behind it, running across the cabinet toward the door opening', () => {
    const { parts, placed } = blindCorner();
    const sides = placed.filter((p) => /\/sink-blind\/side-[12]$/.test(p.partId));
    expect(sides.length).toBe(2);
    const tray = parts.filter((p) => /\/sink-blind\/[^/]+$/.test(p.id)).map(partBox);
    const mid = (Math.min(...tray.map((b) => b.min[2]!)) + Math.max(...tray.map((b) => b.max[2]!))) / 2;
    for (const s of sides) {
      const box = partBox(parts.find((p) => p.id === s.partId)!);
      const slide = s.runsOn!;
      expect(slide).toBeDefined();
      // Blind on the left: its front end is toward the door opening, at +X.
      expect(slide.turn).toBe(1);
      expect(slide.front).toBeCloseTo(box.max[0]!, 6);
      expect(slide.length).toBeCloseTo(box.max[0]! - box.min[0]!, 6);
      // Outside the tray: before its front side, behind its back side, by the side clearance.
      const here = (box.min[2]! + box.max[2]!) / 2;
      if (here > mid) {
        expect(slide.dir).toBe(-1);
        expect(slide.outer - box.max[2]!).toBeCloseTo(slide.clearance, 6);
      } else {
        expect(slide.dir).toBe(1);
        expect(box.min[2]! - slide.outer).toBeCloseTo(slide.clearance, 6);
      }
      // It goes with the tray across the cabinet.
      expect(s.pullStage).toBe(2);
    }
    expect(sides.map((s) => s.runsOn!.dir).sort()).toEqual([-1, 1]);
  });
});
