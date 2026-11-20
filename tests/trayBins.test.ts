import { describe, expect, it } from 'vitest';
import { cabinetsOf, createUnderSink, deriveUnderSink } from '@/design';
import { jigItems } from '@/jigs/catalog';
import { write3mf } from '@/jigs/threemf';
import { TRAY_BIN, TRAY_DIVIDER, buildTrayBin, buildTrayBinObjects, buildTrayDivider, trayBinProblems, trayBinSize, trayDividerProblems } from '@/jigs/trayBins';
import { createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: 3D printed bins and dividers sized to a tray. */
const bins = { width: 480, depth: 480, columns: 3, rows: 2, height: 60, wall: 1.6 };
const extent = (positions: Float32Array) => [0, 1, 2].map((k) => {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = k; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]!);
    hi = Math.max(hi, positions[i]!);
  }
  return hi - lo;
});

describe('printed bins for a tray', () => {
  it("share out the tray's inside in a grid, with play round each", () => {
    const size = trayBinSize(bins);
    expect(size.x).toBeCloseTo(480 / 3 - 2 * TRAY_BIN.play, 6);
    expect(size.y).toBeCloseTo(480 / 2 - 2 * TRAY_BIN.play, 6);
    expect(size.z).toBe(60);
    // Side by side they are no wider than the tray.
    expect(3 * (size.x + 2 * TRAY_BIN.play)).toBeLessThanOrEqual(480 + 1e-6);
  });

  it('a bin is an open box: its floor and four walls of one piece', async () => {
    const mesh = await buildTrayBin(bins);
    const size = trayBinSize(bins);
    const [x, y, z] = extent(mesh.positions);
    expect([x, y, z].map((v) => Math.round(v! * 100) / 100)).toEqual([size.x, size.y, size.z].map((v) => Math.round(v * 100) / 100));
    // What is left of the block: its floor, and its walls round the hollow.
    const solid = size.x * size.y * size.z;
    const hollow = (size.x - 2 * bins.wall) * (size.y - 2 * bins.wall) * (size.z - TRAY_BIN.floor);
    expect(mesh.volume).toBeCloseTo(solid - hollow, 0);
    const [object] = await buildTrayBinObjects(bins, 6);
    expect(object!.placements).toHaveLength(6);
    expect(write3mf([object!]).length).toBeGreaterThan(500);
  });

  it('say what cannot be printed', () => {
    expect(trayBinProblems(bins)).toEqual([]);
    expect(trayBinProblems({ ...bins, columns: 30 })[0]).toMatch(/bins would be \d+ mm across: ask for fewer/);
    expect(trayBinProblems({ ...bins, columns: 1 })[0]).toMatch(/more than most printers' beds.*ask for more of them/);
    expect(trayBinProblems({ ...bins, wall: 0.2 })).toContain('The walls are between 0.8 and 4 mm thick.');
    expect(trayBinProblems({ ...bins, width: 0 })[0]).toMatch(/Measure the tray's inside/);
  });

  it("Design says each tray's inside, which is what the bins are sized to", () => {
    const shop = createStarterShop();
    const project = createBaseCabinetProject('frameless', 'doors');
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.size.width = len('30"');
    stored.adjustableShelves = 0;
    stored.inside = { ...createUnderSink({ bottomTray: true }), obstacles: [] };
    const tray = deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!.trays[0]!;
    expect(tray.inside.width).toBeGreaterThan(0);
    expect(tray.width - tray.inside.width).toBeCloseTo(tray.length - tray.inside.length, 6);
    expect(tray.width - tray.inside.width).toBeGreaterThan(20);
  });
});

describe('a printed divider for a tray', () => {
  const d = { length: 240, height: 60, thickness: 2 };

  it('is a thin wall on a foot, a hair shorter than the tray', async () => {
    const mesh = await buildTrayDivider(d);
    const [x, y, z] = extent(mesh.positions);
    expect(x).toBeCloseTo(240 - 2 * TRAY_BIN.play, 4);
    expect(y).toBeCloseTo(TRAY_DIVIDER.foot, 4);
    expect(z).toBeCloseTo(60, 4);
    expect(mesh.volume).toBeGreaterThan(x! * d.thickness * d.height);
  });

  it('says what cannot be printed', () => {
    expect(trayDividerProblems(d)).toEqual([]);
    expect(trayDividerProblems({ ...d, length: 480 })[0]).toMatch(/print it in two halves of 240 mm/);
    expect(trayDividerProblems({ ...d, thickness: 0.5 })).toContain('It is between 1.2 and 6 mm thick.');
  });
});

describe('on the jigs page', () => {
  it('both are things to print, with defaults that can be made and a picture', async () => {
    const items = jigItems(createStarterShopProfile()).filter((i) => i.id === 'tray-bins' || i.id === 'tray-divider');
    expect(items.map((i) => [i.id, i.made, i.group])).toEqual([
      ['tray-bins', 'print', 'Drawer inserts'],
      ['tray-divider', 'print', 'Drawer inserts'],
    ]);
    for (const item of items) {
      expect(item.problems(item.defaults), item.id).toEqual([]);
      const objects = await item.build(item.defaults);
      expect(objects[0]!.mesh.triangles.length, item.id).toBeGreaterThan(30);
      expect(item.notes!(item.defaults).length).toBeGreaterThan(0);
    }
  });
});
