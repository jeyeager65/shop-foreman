// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { screwChannel } from '@/cam/cuts';
import { type Feeds, Path } from '@/cam/path';
import { POCKET } from '@/geometry/pocketHole';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { jigItems } from '@/jigs/catalog';
import { buildPocketTest, channelBit } from '@/job/pocketTest';
import { PLYWOOD_3_4_ID, createStarterShop, createStarterShopProfile } from '@/libraries';
import { cutDiameter } from '@/plan';

/** A pocket hole's screw channel: cut open from the face, as wide as the pilot, in place of drilling it. */
const shop = createStarterShop();
const feeds: Feeds = { feed: 1000, plunge: 300, depthPerPass: 3, stepover: 1, finish: 0 };
const t = 19.05;

/** Every point the bit cuts at, below the face, in the channel's frame (u in from the edge, y across). */
function cutPoints(r: number, angleDeg = POCKET.angleDeg, seat = POCKET.seatShare * t) {
  const path = new Path(10);
  screwChannel(path, { x: 0, y: 0 }, { x: 0, y: 1 }, { thickness: t, angleDeg, seat }, r, feeds);
  const at = { x: 0, y: 0, z: 10 };
  const points: { u: number; y: number; z: number }[] = [];
  for (const s of path.steps) {
    if (s.kind !== 'rapid' && s.kind !== 'cut') continue;
    if (s.x !== undefined) at.x = s.x;
    if (s.y !== undefined) at.y = s.y;
    if (s.z !== undefined) at.z = s.z;
    if (at.z < -0.01) points.push({ u: at.y, y: at.x, z: at.z });
  }
  return points;
}

describe('a screw channel', () => {
  it('is as wide as the pilot with a 1/8" bit, in two passes, its floor half the stock and half the pilot deep at the edge', () => {
    const r = 3.175 / 2;
    const points = cutPoints(r);
    const ys = [...new Set(points.map((p) => p.y.toFixed(3)))].map(Number);
    expect(ys).toHaveLength(2);
    expect(Math.max(...ys) - Math.min(...ys) + 2 * r).toBeCloseTo(POCKET.drill, 2);
    // At the edge (u 0 and outside it) the deepest cut is the screw's underside: mid-thickness less half the pilot.
    expect(Math.min(...points.map((p) => p.z))).toBeCloseTo(-(t / 2 + POCKET.drill / 2), 6);
    // It never goes below the floor's line, which rises toward the seat at the screw's angle.
    const tan = Math.tan((POCKET.angleDeg * Math.PI) / 180);
    for (const p of points) expect(p.z).toBeGreaterThanOrEqual(-(t / 2 - Math.max(0, p.u) * tan + POCKET.drill / 2) - 1e-6);
    // From outside the edge to past the seat.
    expect(Math.min(...points.map((p) => p.u))).toBeLessThan(0);
    expect(Math.max(...points.map((p) => p.u))).toBeGreaterThan(POCKET.seatShare * t * Math.cos((POCKET.angleDeg * Math.PI) / 180));
  });

  it('is cut with the 1/8" flat end mill, the widest no wider than the pilot', () => {
    const bit = channelBit(shop, PLYWOOD_3_4_ID)!;
    expect(cutDiameter(bit)).toBeCloseTo(3.175, 3);
  });

  it('is in the scrap test after the pockets, in a file that parses, with nothing to drill', async () => {
    const test = buildPocketTest(shop, PLYWOOD_3_4_ID, [
      { bit: 'ball', ledge: false, channel: true },
      { bit: 'ball', ledge: false, channel: true },
    ]);
    expect(test.tools.at(-1)!.name).toMatch(/1\/8/);
    expect(test.text).toContain('2 screw channels');
    expect(test.text).toContain('Nothing to drill');
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(test.text);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    expect(test.depth).toBeCloseTo(test.thickness / 2 + POCKET.drill / 2, 1);
  });

  it('is a choice on the jigs page', () => {
    const profile = createStarterShopProfile();
    const test = jigItems(profile).find((i) => i.id === 'pocket-test')!;
    expect(test.fields.find((f) => f.key === 'pilot')!.choices!.map((c) => c.value)).toEqual(['drilled', 'channel']);
    const values = { ...test.defaults, pilot: 'channel' };
    const [file] = test.gcode!(values, 1, profile.activeMachineId);
    expect(file!.text).toContain('screw channel');
    expect(file!.note).toContain('nothing to drill');
    expect(test.notes!(values).join(' ')).toMatch(/Each screw lies in a channel 4 mm wide/);
  });
});
