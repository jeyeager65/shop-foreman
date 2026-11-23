// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOW_POCKET, POCKET } from '@/geometry/pocketHole';
import { jigItems } from '@/jigs/catalog';
import { POCKET_SCREW, bothUnits, cutTimeWords, farthestSeat, inchesBy16, pocketSection } from '@/jigs/pocketSection';
import { buildPocketTest } from '@/job/pocketTest';
import { PLYWOOD_3_4_ID, createStarterShop, createStarterShopProfile } from '@/libraries';
import { MM_PER_INCH } from '@/units';

/** A pocket hole in section: the screw leaves the edge at mid-thickness, and the seat says how much of it goes into the other part. */
describe('a pocket in section', () => {
  const t = 18.26;

  it('has a low-angle pocket\'s Castle screw, coarse, 1-1/2" in 3/4" stock, and moves with its seat', () => {
    const near = pocketSection(t, 3, 12, 3.175, false);
    const far = pocketSection(t, 3, LOW_POCKET.seat, 3.175, false);
    expect(near).toMatchObject({ screwKind: 'castle', fine: false });
    expect(near.screw).toBeCloseTo(1.5 * MM_PER_INCH, 6);
    expect(near.into - far.into).toBeCloseTo(LOW_POCKET.seat - 12, 6);
    // The pocket starts further in with the seat further in.
    expect(Math.min(...far.pocket.map((p) => p[0]))).toBeGreaterThan(Math.min(...near.pocket.map((p) => p[0])) + 9);
    expect(far.short).toBe(false);
  });

  it('has a 15° pocket\'s screw, fine thread in hardwood, 1-1/4" in 3/4" stock', () => {
    const s = pocketSection(t, POCKET.angleDeg, undefined, 3.175, true, true);
    expect(s).toMatchObject({ screwKind: 'kreg', fine: true, channel: true });
    expect(s.screw).toBeCloseTo(1.25 * MM_PER_INCH, 6);
    expect(s.seat).toBeCloseTo(POCKET.seatShare * t, 6);
  });

  it('says when too little of the screw is in the other part', () => {
    expect(pocketSection(t, 3, 30, 3.175, false).short).toBe(true);
  });

  it('only offers seats that leave 5/8" of screw in the other part', () => {
    expect(farthestSeat(t)).toBeCloseTo(1.5 * MM_PER_INCH - POCKET_SCREW.leastInto, 6);
    const profile = createStarterShopProfile();
    const test = jigItems(profile).find((i) => i.id === 'pocket-test')!;
    // A seat typed further out than that is warned of, in sight.
    const far = { ...test.defaults, bit: 'endmill-1-8', pockets: JSON.stringify([{ angle: '3', seat: '30' }]) };
    expect(test.notes!(far).some((n) => /^Pocket 1: that seat leaves less than 15.9 mm/.test(n))).toBe(true);
    expect(test.notes!({ ...far, pockets: JSON.stringify([{ angle: '3', seat: String(LOW_POCKET.seat) }]) }).some((n) => /that seat leaves less/.test(n))).toBe(false);
    // And the page draws each kind once.
    const values = { ...test.defaults, bit: 'endmill-1-8', pockets: JSON.stringify([{ angle: '3' }, { angle: '15' }, { angle: '15' }]) };
    expect(test.sections!(values).map((s) => s.title)).toEqual(['Pocket 1', 'Pockets 2 and 3']);
    // Under each, how long one such pocket takes to cut.
    expect(test.sections!(values).map((s) => s.time)).toEqual([expect.stringMatching(/^(\d+ min)?( ?\d+ s)?$/), expect.stringMatching(/ each$/)]);
    // A slot for the screw adds to its pocket's time.
    const seconds = (way: string) => buildPocketTest(createStarterShop(), PLYWOOD_3_4_ID, [{ bit: 'flat', ledge: false, channel: way === 'channel' }], 'endmill-1-8').pockets[0]!.seconds;
    expect(seconds('channel')).toBeGreaterThan(seconds('drilled'));
    expect(cutTimeWords(83)).toBe('1 min 25 s');
    expect(cutTimeWords(42)).toBe('40 s');
  });
});

describe('a length in both units', () => {
  it('gives inches to the 1/32" under 1/2", to the 1/16" from there, marked when not exact', () => {
    expect(inchesBy16(4)).toBe('≈5/32"');
    expect(inchesBy16(15.875)).toBe('5/8"');
    expect(inchesBy16(13.69)).toBe('≈9/16"');
    expect(bothUnits(22.225, { kind: 'mm', places: 2 })).toBe('22.2 mm (7/8")');
    expect(bothUnits(38.1, { kind: 'fractionalInch', denominator: 32 })).toBe('1-1/2" (38.1 mm)');
  });
});
