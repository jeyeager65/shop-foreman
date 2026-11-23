import { describe, expect, it } from 'vitest';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { handleWith, jigItems, withCopies } from '@/jigs/catalog';
import { write3mf } from '@/jigs/threemf';
import { BLUM_INSET_HINGE_ID, createStarterShopProfile } from '@/libraries';
import type { Handle } from '@/model';
import { lowRiderShop } from './lowRider';

/** The page for jigs and handles without a project. */
describe('the catalog of things that are not cabinet parts', () => {
  // With the tests' two LowRiders beside the starter machine, the LowRider 3 in use.
  const shop = lowRiderShop();
  const items = jigItems(shop);
  const item = (id: string) => items.find((i) => i.id === id)!;

  it('lists the made handles from the shop profile, the jigs and the install kit', () => {
    expect(items.map((i) => [i.group, i.id, i.made])).toEqual([
      ['Handles', 'handle-printed-bar-96', 'print'],
      ['Handles', 'handle-printed-arch-96', 'print'],
      ['Handles', 'handle-printed-knob', 'print'],
      ['Handles', 'handle-wood-bar-96', 'cnc'],
      ['Handles', 'handle-wood-arch-96', 'cnc'],
      ['Drawer inserts', 'drawer-dividers', 'cnc'],
      ['Drawer inserts', 'knife-insert', 'cnc'],
      ['Drawer inserts', 'spice-insert', 'cnc'],
      ['Drawer inserts', 'caddy', 'cnc'],
      ['Drawer inserts', 'tray-bins', 'print'],
      ['Drawer inserts', 'tray-divider', 'print'],
      ['Jigs', 'pocket-guide', 'print'],
      ['Jigs', 'pocket-test', 'cnc'],
      ['Jigs', 'pocket-cover', 'print'],
      ['Jigs', 'tab-test', 'cnc'],
      ['Jigs', 'slide-shims', 'print'],
      ['Jigs', 'slide-jig', 'print'],
      ['Jigs', 'hold-down', 'print'],
      ['Jigs', 'shelf-pin-jig', 'print'],
      ['Jigs', 'hinge-cup-jig', 'print'],
      ['Jigs', 'pull-template', 'print'],
      ['Jigs', 'dowel-jig', 'print'],
      ['Install kit', 'support-block', 'print'],
      ['Install kit', 'gap-shim', 'print'],
    ]);
    for (const i of items) {
      expect(i.about.length).toBeGreaterThan(20);
      expect(i.problems(i.defaults)).toEqual([]);
      // Every field starts with a value.
      for (const f of i.fields) if (!f.key.startsWith('printed.pilot') && !f.key.startsWith('printed.insert')) expect([i.id, f.key, i.defaults[f.key] !== undefined]).toEqual([i.id, f.key, true]);
    }
  });

  it('a handle starts from its entry in the shop profile, and the page\'s values go into a copy of it', () => {
    const bar = item('handle-printed-bar-96');
    const entry = shop.hardware.find((h): h is Handle => h.kind === 'handle' && h.id === 'printed-bar-96')!;
    expect(bar.handleId).toBe('printed-bar-96');
    expect([bar.defaults.spacing, bar.defaults['look.length'], bar.defaults['printed.width'], bar.defaults['printed.fastening']]).toEqual([entry.spacing, entry.look.length, entry.printed!.width, entry.printed!.fastening]);
    const changed = handleWith(entry, { ...bar.defaults, spacing: 128, 'look.length': 160, 'printed.width': 16 });
    expect([changed.spacing, changed.look.length, changed.printed!.width, entry.spacing]).toEqual([128, 160, 16, 96]);
    expect(bar.problems({ ...bar.defaults, 'look.thickness': 0 })).toContain('Bar thickness must be more than 0.');
  });

  it('builds each print as a closed solid that follows its sizes, and a 3MF of as many as asked for', async () => {
    for (const i of items.filter((x) => x.made === 'print')) {
      const objects = await i.build(i.defaults);
      expect([i.id, objects.length > 0]).toEqual([i.id, true]);
      for (const o of objects) expect(o.mesh.volume).toBeGreaterThan(0);
      const five = withCopies(objects, 5);
      expect(five.every((o) => o.placements.length === 5)).toBe(true);
      // Five copies do not lie on each other.
      expect(new Set(five[0]!.placements.map((p) => `${p.x},${p.y}`)).size).toBe(5);
      expect(write3mf(five).length).toBeGreaterThan(500);
    }
    const shims = item('slide-shims');
    const [thin] = await shims.build({ thickness: 1, length: 40, height: 25 });
    const [thick] = await shims.build({ thickness: 3, length: 40, height: 25 });
    expect(thick!.mesh.volume).toBeCloseTo(3 * thin!.mesh.volume, 3);
    const bar = item('handle-printed-bar-96');
    const [short] = await bar.build(bar.defaults);
    const [long] = await bar.build({ ...bar.defaults, 'look.length': 200 });
    expect(long!.mesh.volume).toBeGreaterThan(short!.mesh.volume);
  });

  it('a wooden pull is cut out with a bit chosen from those Plan would offer, or left to the planner', () => {
    const wood = item('handle-wood-bar-96');
    const bits = wood.bits!(wood.defaults, 'lowrider-3');
    expect(bits.chosen).toBe('endmill-1-4');
    expect(bits.offered).toEqual([
      { id: 'endmill-1-4', name: '1/4" end mill' },
      { id: 'endmill-1-8', name: '1/8" end mill' },
      { id: 'endmill-1-16', name: '1/16" end mill' },
    ]);
    const text = (bitId?: string) => wood.gcode!(wood.defaults, 2, 'lowrider-3', bitId).map((f) => f.text).join('\n');
    // Left to the planner, and its own choice named: the same files.
    expect(text('endmill-1-4')).toBe(text());
    expect(text()).toContain('1/4" end mill');
    expect(text()).not.toContain('1/8" end mill');
    // Another bit cuts it, and no other.
    expect(text('endmill-1-8')).toContain('1/8" end mill');
    expect(text('endmill-1-8')).not.toContain('1/4" end mill');
    // A bit that cannot cut it out is left to the planner, as on Plan.
    expect(text('vbit-60')).toBe(text());
    // A print has no bits to choose.
    expect(item('handle-printed-bar-96').bits).toBeUndefined();
  });

  it('a wooden pull is drawn as thick as its stock, and its G-code is posted for a machine with no project', async () => {
    const wood = item('handle-wood-bar-96');
    const [solid] = await wood.build(wood.defaults);
    expect(solid!.mesh.volume).toBeGreaterThan(0);
    const three = wood.gcode!(wood.defaults, 3, 'lowrider-3');
    expect(three.length).toBeGreaterThan(0);
    for (const f of three) {
      expect(f.name).toMatch(/^wooden-.*\.gcode$/);
      expect(f.text).toContain('G21');
      expect(f.text).not.toMatch(/\bM[35]\b/);
      expect(f.text).toContain('G38.2 Z-80');
      // Every generated G-code file must parse in cnc-gcode-tools.
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(f.text!);
      expect(parser.simMeta.units).toBe('mm');
      expect(parser.segments.some((s) => s.type === 'cut')).toBe(true);
    }
    expect(three[0]!.note).toMatch(/handles: 3 of them/);
    // More of them: more to cut. On the LowRider 4: its probe travel.
    const text = (files: { text?: string }[]) => files.map((f) => f.text).join('\n');
    expect(text(wood.gcode!(wood.defaults, 6, 'lowrider-3')).length).toBeGreaterThan(text(three).length);
    expect(text(wood.gcode!(wood.defaults, 3, 'lowrider-4'))).toContain('G38.2 Z-110');
    // The page's sizes are what is cut, not the shop's entry.
    expect(text(wood.gcode!({ ...wood.defaults, 'look.length': 180 }, 3, 'lowrider-3'))).not.toBe(text(three));
  });

  it('the pocket-hole scrap test is posted for a material and a machine', () => {
    const test = item('pocket-test');
    const [file] = test.gcode!(test.defaults, 1, 'lowrider-3');
    expect(file!.name).toBe('pocket-hole-test.gcode');
    expect(file!.text).toContain('G21');
    expect(file!.note).toBe('stock at least 200 mm (7-7/8") × 140 mm (≈5-1/2"), the board cut out of it 160 mm (≈6-5/16") × 100 mm (3-15/16"); 2 pockets; cut with 1/8" ball nose then 1/4" end mill; the pilot bit 38.7 mm (≈1-1/2") out of the chuck');
    // Under its sizes: how long it takes, then each bit in the order it goes in, with how long it cuts and its feeds.
    const said = test.notes!(test.defaults);
    expect(said[0]).toMatch(/^About \d+ min to cut, and a bit change\.$/);
    expect(said[1]).toMatch(/^1\/8" ball nose: (under a minute|about \d+ min)\. Feed [\d.]+ mm\/s, plunge [\d.]+ mm\/s, [\d.]+ mm .* a pass, \d+ RPM\.$/);
    expect(said[2]).toMatch(/^1\/4" end mill \(cuts the board out\): about \d+ min\. Feed /);
    // Four pockets with the ball nose, two with a ledge: the end mill cuts the ledges first, then the ball nose the pockets.
    const four = { ...test.defaults, pockets: JSON.stringify([{ ledge: 'no' }, { ledge: 'no' }, { ledge: 'yes' }, { ledge: 'yes' }]) };
    const [every] = test.gcode!(four, 1, 'lowrider-3');
    expect(every!.note).toMatch(/^stock at least 280 mm .* the board cut out of it 240 mm \(≈9-7\/16"\) × 100 mm \(3-15\/16"\); 4 pockets; cut with 1\/8" end mill then 1\/8" ball nose then 1\/8" end mill/);
    // Each kind once under How this works: the two plain pockets, then the two with a ledge.
    expect(test.help!(four).slice(0, 2).map((n) => n.slice(0, 18))).toEqual(['Pockets 1 and 2. T', 'Pockets 3 and 4. T']);
    // A pocket's ledge is a tick; on a ball nose's scrap with a ledge ticked, the end mill that cuts the ledges is chosen once.
    const ledge = test.fields.find((f) => f.key === 'pockets')!.columns!.find((c) => c.key === 'ledge')!;
    expect(ledge.check).toBe(true);
    const ledgeBit = test.fields.find((f) => f.key === 'ledgeBit')!;
    expect(ledgeBit.choices!.map((c) => c.value)).toEqual(['endmill-1-8', 'endmill-1-4']);
    expect(ledgeBit.when!(four)).toBe(true);
    expect(ledgeBit.when!(test.defaults)).toBe(false);
    expect(ledgeBit.when!({ ...four, bit: 'endmill-1-8' })).toBe(false);
    // It has no solid: the page carves its G-code.
    expect(test.carved).toBe(true);
    const guide = item('pocket-guide');
    expect(guide.problems(guide.defaults)).toEqual([]);
    expect(guide.fields.map((f) => f.key)).toEqual(['stock', 'thickness', 'drill', 'sleeveBore', 'sleeveOutside', 'sleeveLength', 'sleeveCount', 'sleeveFlanged', 'sleeveFlange', 'sleeveFlangeThickness', 'angle', 'seat']);
    // It starts as the guide for 3/4" stock; a thickness is only typed for stock that is none of the usual ones.
    expect(guide.defaults.stock).toBe('3/4');
    const typed = guide.fields.find((f) => f.key === 'thickness')!;
    expect(typed.when!(guide.defaults)).toBe(false);
    expect(typed.when!({ ...guide.defaults, stock: 'other' })).toBe(true);
    expect(guide.inUse!(guide.defaults).thickness).toBe(18.65);
    expect(guide.inUse!({ ...guide.defaults, stock: '1/2' }).thickness).toBe(12.3);
    expect(guide.inUse!({ ...guide.defaults, stock: 'other', thickness: 22 }).thickness).toBe(22);
    expect(guide.notes!(guide.defaults).join(' ')).toMatch(/made for 3\/4" stock/);
    expect(guide.notes!(guide.defaults)[0]).toMatch(/^Chuck the bit so it stands 39.0 mm out of the chuck.*A regular 4 mm or 5\/32" bit is long enough/);
    expect(guide.problems({ ...guide.defaults, stock: 'other', thickness: 9 })).toEqual(['That stock is too thin for a pocket hole.']);
    // One of each: a guide for every angle with the same sizes, side by side in one file named for them all.
    expect(guide.single).toBe(true);
    const each = { ...guide.defaults, angle: 'all' };
    expect(guide.problems(each)).toEqual([]);
    expect(guide.fileNameFor!(guide.defaults)).toBe('pocket-hole-guide-3-4in-15deg.3mf');
    expect(guide.fileNameFor!(each)).toBe('pocket-hole-guide-3-4in-15-3-6deg.3mf');
    expect(guide.notes!(each)[0]).toMatch(/^Chuck the bit so it stands this far out of the chuck: 15°, [\d.]+ mm; 3°, [\d.]+ mm; 6°, [\d.]+ mm\./);
    expect(test.problems({ ...test.defaults, materialId: 'nope' })).toEqual(["Choose the scrap's material."]);
    expect(test.problems({ ...test.defaults, pockets: '[]' })).toEqual(['Add a pocket to try.']);
  });
});

describe('the three drilling jigs', () => {
  const shop = createStarterShopProfile();
  const item = (id: string) => jigItems(shop).find((i) => i.id === id)!;
  const volume = async (id: string, values = {}) => {
    const i = item(id);
    const [o] = await i.build({ ...i.defaults, ...values });
    return o!.mesh.volume;
  };
  const size = async (id: string, values = {}) => {
    const i = item(id);
    const [o] = await i.build({ ...i.defaults, ...values });
    const p = o!.mesh.positions;
    const max = [0, 0, 0];
    for (let n = 0; n < p.length; n += 3) for (let a = 0; a < 3; a++) max[a] = Math.max(max[a]!, p[n + a]!);
    return max.map((v) => Math.round(v * 100) / 100);
  };

  it('are on the page, each marked as not yet made, with sizes that start from the shop\'s hardware', () => {
    for (const id of ['shelf-pin-jig', 'hinge-cup-jig', 'pull-template', 'dowel-jig']) {
      const i = item(id);
      expect([i.group, i.made, i.untested, i.problems(i.defaults)]).toEqual(['Jigs', 'print', true, []]);
    }
    expect(item('shelf-pin-jig').defaults).toMatchObject({ pinId: 'generic-shelf-pin-5mm', diameter: 5, spacing: 32, setback: 37 });
    expect(item('hinge-cup-jig').defaults).toMatchObject({ cupDiameter: 35, boreDistance: 3, pilotSpacing: 45, pilotSetback: 9.5 });
    expect(item('hinge-cup-jig').defaults.fromEnd).toBeCloseTo(88.9, 6);
    expect(item('pull-template').defaults).toMatchObject({ handleId: 'generic-pull-96', spacing: 96, diameter: 5, use: 'door', hand: 'left' });
  });

  it('choosing a pin, a hinge or a handle fills in what comes from it', () => {
    expect(item('shelf-pin-jig').follow!('pinId', 'shelf-pin-1-4')).toEqual({ diameter: 6.35, spacing: 32, setback: 37 });
    expect(item('shelf-pin-jig').follow!('holes', 8)).toEqual({});
    // A press-in hinge brings its dowels; the inset Blum its 4 mm bore distance.
    expect(item('hinge-cup-jig').follow!('hingeId', 'blum-compact-38n-1-2-soft-press')).toMatchObject({ cupDiameter: 35, pilotSpacing: 45, pilotSetback: 9.5, pilotDiameter: 8 });
    expect(item('hinge-cup-jig').follow!('hingeId', BLUM_INSET_HINGE_ID)).toMatchObject({ cupDiameter: 35, boreDistance: 4, pilotDiameter: 2 });
    expect(item('pull-template').follow!('handleId', 'generic-knob')).toEqual({ spacing: 0, diameter: 5 });
  });

  it('the shelf-pin jig is a strip with a fence: longer with more holes, its row at the setback behind the fence', async () => {
    // 6 holes 32 apart, 12 + 2.5 of plate past each end hole; 6 of fence, 37 to the row, 14.5 beyond it; 10 of plate and 10 of fence.
    expect(await size('shelf-pin-jig')).toEqual([189, 57.5, 20]);
    expect(await size('shelf-pin-jig', { holes: 10 })).toEqual([317, 57.5, 20]);
    const solid = 189 * 57.5 * 10 + 189 * 6 * 10;
    const holes = 6 * Math.PI * 2.6 ** 2 * 10;
    expect(await volume('shelf-pin-jig')).toBeCloseTo(solid - holes, -1);
    expect(item('shelf-pin-jig').problems({ ...item('shelf-pin-jig').defaults, holes: 1 })).toEqual(['It needs 2 to 40 holes: two at least, to step it up the side on a pin.']);
    expect(item('shelf-pin-jig').problems({ ...item('shelf-pin-jig').defaults, spacing: 6 })[0]).toMatch(/too close together/);
  });

  it('the hinge-cup jig has the cup\'s hole at the bore distance from its fence and its distance from the stop', async () => {
    // The stop's 6, 88.9 to the cup's centre, 22.5 + 1 of pilot + 12; the fence's 6, 3 + 35 to the cup's far edge, 12.
    expect(await size('hinge-cup-jig')).toEqual([130.4, 56, 18]);
    // A bigger bore distance moves the cup, and the plate's far edge, away from the fence.
    expect((await size('hinge-cup-jig', { boreDistance: 6 }))[1]).toBe(59);
    // The cup's hole and the two pilots are cut through the plate: less than the plate and its two fences whole.
    const whole = 130.4 * 56 * 8 + 130.4 * 6 * 10 + 6 * (56 - 6) * 10;
    const cup = Math.PI * 17.6 ** 2 * 8;
    expect(await volume('hinge-cup-jig')).toBeLessThan(whole - cup);
    expect(await volume('hinge-cup-jig')).toBeGreaterThan(whole - cup - 2 * Math.PI * 1.1 ** 2 * 8 - 1);
    expect(item('hinge-cup-jig').problems({ ...item('hinge-cup-jig').defaults, fromEnd: 10 })[0]).toMatch(/too close to the door's end/);
  });

  it('the pull template: two holes up a door from its corner, either hand; one or two across a drawer front on a centre line', async () => {
    // A door: the fence's 6, 38.1 in from the edge, 14.5 beyond; the fence's 6, 76.2 to the first hole, 96 to the second, 14.5 beyond.
    expect(await size('pull-template')).toEqual([58.6, 192.7, 16]);
    expect(await size('pull-template', { hand: 'right' })).toEqual([58.6, 192.7, 16]);
    // The two hands are mirror images: the same volume, not the same solid.
    const [left] = await item('pull-template').build(item('pull-template').defaults);
    const [right] = await item('pull-template').build({ ...item('pull-template').defaults, hand: 'right' });
    expect(right!.mesh.volume).toBeCloseTo(left!.mesh.volume, 3);
    expect(right!.name).toBe('Pull template, door, right hand');
    expect(Array.from(right!.mesh.positions)).not.toEqual(Array.from(left!.mesh.positions));
    // A knob: one hole, a shorter plate.
    expect((await size('pull-template', { spacing: 0 }))[1]).toBe(96.7);
    // A drawer front: 96 between the holes, 14.5 and 12 beyond each; the fence's 6, 76.2 below the top, 14.5 beyond.
    expect(await size('pull-template', { use: 'drawer' })).toEqual([149, 96.7, 16]);
    expect(item('pull-template').problems({ ...item('pull-template').defaults, fromEdge: 2 })[0]).toMatch(/too close to the edge/);
  });

  it('the dowel jig: a fence and an end stop, its holes in the middle of the apron as it stands in from the leg, and a spacer', async () => {
    // The stop's 6, 25.4 to the first dowel, 50.8 to the second, 12 + half the dowel beyond; the fence's 6, the 6.35
    // setback and half of 19.05 to the holes, 12 + half the dowel beyond; 12 of plate and 10 of fence.
    expect(await size('dowel-jig')).toEqual([98.96, 38.64, 22]);
    const made = await item('dowel-jig').build(item('dowel-jig').defaults);
    expect(made.map((o) => o.name)).toEqual(['Dowel jig', 'Dowel jig spacer']);
    // The spacer is as thick as the setback, and stands clear of the jig on the bed.
    const z = Array.from(made[1]!.mesh.positions).filter((_, n) => n % 3 === 2);
    expect(Math.max(...z)).toBeCloseTo(6.35, 3);
    expect(made[1]!.placements[0]!.y).toBeGreaterThan(38.64);
    // Flush aprons: no spacer, and the holes nearer the fence.
    const flush = await item('dowel-jig').build({ ...item('dowel-jig').defaults, setback: 0 });
    expect(flush.map((o) => o.name)).toEqual(['Dowel jig']);
    expect((await size('dowel-jig', { setback: 0 }))[1]).toBe(32.29);
    expect((await size('dowel-jig', { dowels: 3 }))[0]).toBe(149.76);
    expect(item('dowel-jig').problems({ ...item('dowel-jig').defaults, diameter: 16 })[0]).toMatch(/too thick for the apron/);
    expect(item('dowel-jig').problems({ ...item('dowel-jig').defaults, spacing: 10 })[0]).toMatch(/too close together/);
  });
});
