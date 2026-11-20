// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { jigItems } from '@/jigs/catalog';
import { INSERT_PLAY, INSERT_UNDER, SLOT_PLAY, SPICE, dividerParts, dividerProblems, insertCopies, insertFiles, knifeParts, knifeProblems, knifeSlots, spiceLayout, spiceParts, spiceProblems } from '@/jigs/drawerInserts';
import { createStarterShopProfile } from '@/libraries';
import type { Part } from '@/model';

/** Organizers: inserts cut to a measured drawer that is already there, with no cabinet. */
const shop = createStarterShopProfile();
const thin = shop.materialCatalog.find((m) => m.measuredThickness.mm <= 7)!;
const thick = shop.materialCatalog.find((m) => m.groupId === 'plywood' && m.measuredThickness.mm > 15)!;
const machineId = shop.activeMachineId;
const outline = (p: Part) => (p.features.find((f) => f.kind === 'cutout') as { outline: { x: number; y: number }[] }).outline;
const drawer = { width: 400, depth: 500, height: 90 };
/** How many moves a file has: one that cuts something has many. */
const moves = (text: string) => text.split(/\r?\n/).filter((l) => /^G[0123]\b/.test(l)).length;

describe('drawer dividers', () => {
  const t = thin.measuredThickness.mm;
  const parts = dividerParts({ ...drawer, rows: 1, columns: 2 }, thin.id, t);

  it('are strips a little smaller than the drawer, standing under its top edge', () => {
    expect(parts.map((p) => p.name)).toEqual(['Divider, side to side', 'Divider, front to back 1', 'Divider, front to back 2']);
    const [row, column] = parts;
    expect(row!.size).toEqual({ width: drawer.width - INSERT_PLAY, height: drawer.height - INSERT_UNDER, thickness: t });
    expect(column!.size.width).toBe(drawer.depth - INSERT_PLAY);
    expect(parts.every((p) => p.materialId === thin.id && p.role === 'pullOut')).toBe(true);
  });

  it('cross in half-lap slots: as wide as the stock and a hair over half the height, where the other strips stand', () => {
    const [row, column] = parts;
    // The row has a slot for each column: four points a slot besides the strip's four corners.
    expect(outline(row!)).toHaveLength(4 + 4 * 2);
    expect(outline(column!)).toHaveLength(4 + 4 * 1);
    const pts = outline(row!);
    const low = Math.min(...pts.filter((p) => p.y > 0 && p.y < row!.size.height).map((p) => p.y));
    expect(row!.size.height - low).toBeCloseTo(row!.size.height / 2 + 0.25, 6);
    const xs = [...new Set(pts.filter((p) => p.y === low).map((p) => p.x))].sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(t + SLOT_PLAY, 6);
    // The slots are at a third and two thirds of the drawer's width.
    expect((xs[0]! + xs[1]!) / 2 + INSERT_PLAY / 2).toBeCloseTo(drawer.width / 3, 6);
    // The two slots of a crossing add up to more than the height: the tops come level.
    const cLow = Math.min(...outline(column!).filter((p) => p.y > 0 && p.y < column!.size.height).map((p) => p.y));
    expect(row!.size.height - low + (column!.size.height - cLow)).toBeGreaterThan(row!.size.height);
    // Strips one way only have no slots.
    expect(dividerParts({ ...drawer, rows: 0, columns: 3 }, thin.id, t).every((p) => outline(p).length === 4 && !p.shaped)).toBe(true);
  });

  it('say what cannot be made', () => {
    expect(dividerProblems({ ...drawer, rows: 1, columns: 2 }, t)).toEqual([]);
    expect(dividerProblems({ ...drawer, rows: 0, columns: 0 }, t)).toEqual(['Ask for at least one divider.']);
    expect(dividerProblems({ ...drawer, rows: 1, columns: 30 }, t)[0]).toMatch(/compartments would be \d+ mm across/);
    expect(dividerProblems({ ...drawer, height: 15, rows: 1, columns: 1 }, t)[0]).toMatch(/too shallow/);
    expect(dividerProblems({ width: 0, depth: 0, height: 0, rows: 1, columns: 1 }, t)[0]).toMatch(/Measure the drawer/);
  });

  it('are cut on the CNC with no project: files that parse, named for them', () => {
    const files = insertFiles(parts, 'drawer-dividers', shop, machineId);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.name.startsWith('drawer-dividers') && f.name.endsWith('.gcode'))).toBe(true);
    for (const f of files) {
      expect(f.text).not.toMatch(/^M0?[35]\b/m);
      expect(moves(f.text!)).toBeGreaterThan(20);
    }
    // Two of them: every part twice.
    expect(insertCopies(parts, 2).map((p) => p.id)).toHaveLength(6);
    expect(new Set(insertCopies(parts, 2).map((p) => p.id)).size).toBe(6);
  });
});

describe('a knife insert', () => {
  const k = { width: 400, length: 420, blade: 230, slot: 3.2, slotDepth: 10, spacing: 30 };
  const t = thick.measuredThickness.mm;

  it('is one board with a row of blind slots from its back end, an inch in from each edge', () => {
    expect(knifeSlots(k)).toBe(12);
    const [board] = knifeParts(k, thick.id, t);
    expect(board!.size).toEqual({ width: k.width - INSERT_PLAY, height: k.length, thickness: t });
    const slots = board!.features.filter((f) => f.kind === 'dado');
    expect(slots).toHaveLength(12);
    for (const s of slots) {
      const xs = s.outline.map((p) => p.x);
      const ys = s.outline.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(k.slot, 6);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(k.blade, 6);
      expect(Math.max(...ys)).toBeCloseTo(k.length - 15, 6);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(25 - k.slot);
      expect(s.kind === 'dado' && s.depth).toBe(k.slotDepth);
    }
  });

  it('says what cannot be made', () => {
    expect(knifeProblems(k, t)).toEqual([]);
    expect(knifeProblems({ ...k, slotDepth: t - 2 }, t)[0]).toMatch(/within 4 mm of the board's underside/);
    expect(knifeProblems({ ...k, blade: 410 }, t)[0]).toMatch(/too short for slots that long/);
    expect(knifeProblems({ ...k, spacing: 8 }, t)).toContain('The slots are too close together: at least 10 mm of wood between two.');
    expect(knifeProblems({ ...k, width: 40 }, t)[0]).toMatch(/too narrow/);
  });

  it('is cut on the CNC: its slots with a bit no wider than they are', () => {
    const files = insertFiles(knifeParts(k, thick.id, t), 'knife-insert', shop, machineId);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(moves(f.text!)).toBeGreaterThan(20);
    expect(files.map((f) => f.text).join('\n')).toMatch(/1\/8" end mill/);
  });
});

describe('a spice insert', () => {
  const s = { width: 400, depth: 500, height: 110, jar: 48, jarHeight: 110 };
  const [tSupport, tSlat] = [thick.measuredThickness.mm, thin.measuredThickness.mm];
  const layout = spiceLayout(s, tSlat);

  it('has as many tiers as the drawer is deep for, each a slope a jar long, and fits under the drawer with a jar on it', () => {
    expect(layout.tiers).toBe(4);
    expect(layout.slope).toBe(s.jarHeight + 5);
    expect(layout.rise / layout.run).toBeCloseTo(Math.tan((SPICE.angleDeg * Math.PI) / 180), 6);
    expect(layout.length).toBeLessThanOrEqual(s.depth - INSERT_PLAY);
    expect(layout.needs).toBeLessThanOrEqual(s.height);
    expect(layout.supports).toBe(3);
  });

  it('is saw-tooth supports and a slat for each slope', () => {
    const parts = spiceParts(s, thick.id, tSupport, thin.id, tSlat);
    const supports = parts.filter((p) => p.name.includes('support'));
    const slats = parts.filter((p) => p.name.includes('slat'));
    expect([supports.length, slats.length]).toEqual([3, 4]);
    expect(supports.every((p) => p.materialId === thick.id && p.shaped)).toBe(true);
    expect(slats.every((p) => p.materialId === thin.id && p.size.width === s.width - INSERT_PLAY && p.size.height === layout.slope - 1)).toBe(true);
    const pts = outline(supports[0]!);
    // Flat underneath, as long as the tiers and the lip; each slope climbs from the low height to the high one.
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(layout.length, 6);
    expect(Math.min(...pts.map((p) => p.y))).toBe(0);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(layout.high, 6);
    expect(pts.filter((p) => Math.abs(p.y - SPICE.low) < 1e-6)).toHaveLength(layout.tiers);
    // The stop in front of the first tier stands over its low end.
    expect(pts.some((p) => p.x === 0 && Math.abs(p.y - (SPICE.low + SPICE.lipOver)) < 1e-6)).toBe(true);
  });

  it('says what cannot be made', () => {
    expect(spiceProblems(s, tSlat)).toEqual([]);
    expect(spiceProblems({ ...s, height: 70 }, tSlat)[0]).toMatch(/jars would stand \d+ mm high.*catch on the way in/);
    expect(spiceProblems({ ...s, depth: 90 }, tSlat)[0]).toMatch(/not deep enough for one tier/);
    expect(spiceProblems({ ...s, width: 80 }, tSlat)).toContain('The drawer is too narrow for two supports.');
  });

  it('has its shaped supports cut on the CNC; the plain slats may go to the saw, and are in the notes with their size', () => {
    const files = insertFiles(spiceParts(s, thick.id, tSupport, thin.id, tSlat), 'spice-insert', shop, machineId);
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) expect(moves(f.text!)).toBeGreaterThan(20);
  });
});

describe('the inserts on the jigs page', () => {
  const items = jigItems(shop).filter((i) => i.group === 'Drawer inserts' && i.made === 'cnc');

  it('are four things cut on the CNC, the caddy with them, each with defaults that can be made, notes that list its parts, and G-code', () => {
    expect(items.map((i) => [i.id, i.made])).toEqual([
      ['drawer-dividers', 'cnc'],
      ['knife-insert', 'cnc'],
      ['spice-insert', 'cnc'],
      ['caddy', 'cnc'],
    ]);
    for (const item of items) {
      expect(item.problems(item.defaults), item.id).toEqual([]);
      expect(item.notes!(item.defaults)[0], item.id).toMatch(/\d+(\.\d)? × \d+(\.\d)? mm, /);
      const files = item.gcode!(item.defaults, 1, machineId);
      expect(files.length, item.id).toBeGreaterThan(0);
    }
  });

  it('are drawn as closed solids that face outward (inside out, the view shows only their far walls)', async () => {
    for (const item of items) {
      for (const o of await item.build(item.defaults)) {
        // The volume inside the triangles as they are wound: positive when they face outward.
        const { positions: q, triangles: t } = o.mesh;
        const at = (i: number) => [q[3 * i]!, q[3 * i + 1]!, q[3 * i + 2]!] as const;
        let six = 0;
        for (let i = 0; i < t.length; i += 3) {
          const [a, b, c] = [at(t[i]!), at(t[i + 1]!), at(t[i + 2]!)];
          six += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
        }
        expect(six / 6, `${item.id}: ${o.name}`).toBeCloseTo(o.mesh.volume, -2);
        expect(six, `${item.id}: ${o.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('say so when the drawer is not measured', () => {
    const dividers = items[0]!;
    expect(dividers.problems({ ...dividers.defaults, width: 0 })).toEqual(["Measure the drawer's inside: its width, its depth and its height."]);
    expect(dividers.problems({ ...dividers.defaults, materialId: 'nothing' })).toEqual(["Choose the dividers' material."]);
  });
});
