// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BOX_GROOVE_DEPTH, FRAME_PLAY, HINGE_CLEAR, PLUMBING_CLEAR, PULLOUT_SETBACK, TRAY_FRONT, TRAY_WALL, buildCabinetAssembly, cabinetsOf, createObstacle, createUnderSink, type SinkStorage, deriveCabinetOpenings, deriveCabinetParts, deriveUnderSink, obstacleShapes, partBox, takesSink, trayMounting } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Part, StoredCabinet } from '@/model';
import { createBaseCabinetProject, makeExisting } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Storage under a sink: trays on slides, a shelf round the plumbing, a tray each side of it. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const vanity = (storage: SinkStorage, construction: 'faceFrame' | 'frameless' = 'faceFrame', change?: (c: StoredCabinet) => void) => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('30"');
  stored.adjustableShelves = 0;
  stored.inside = createUnderSink(storage);
  change?.(stored);
  return project;
};
/** A small vanity: 24" wide, 21" deep, the trap well forward of the back. */
const smallVanity = (storage: SinkStorage) =>
  vanity(storage, 'faceFrame', (c) => {
    c.size.width = len('24"');
    c.size.depth = len('21"');
    Object.assign(c.inside!.obstacles[0]!, { width: len('5"'), depth: len('12"'), clearUnder: len('12"') });
  });
const under = (project: ReturnType<typeof vanity>) => deriveCabinetParts(project, shop).filter((p) => p.id.includes('/sink-'));
const built = (project: ReturnType<typeof vanity>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
const named = (parts: Part[], name: string) => {
  const part = parts.find((p) => p.name === name);
  if (!part) throw new Error(`No part named ${name}: ${parts.map((p) => p.name).join('; ')}`);
  return part;
};
const outline = (p: Part) => (p.features.find((f) => f.kind === 'cutout') as { outline: { x: number; y: number }[] }).outline;
/** How far two parts' boxes reach into each other: more than a groove or a rabbet is two parts in one place. */
const lap = (a: Part, b: Part) => {
  const [x, y] = [partBox(a), partBox(b)];
  return Math.min(...[0, 1, 2].map((k) => Math.min(x.max[k]!, y.max[k]!) - Math.max(x.min[k]!, y.min[k]!)));
};
const noTwoInOnePlace = (parts: Part[]) => {
  for (const a of parts) for (const b of parts) if (a !== b) expect(lap(a, b), `${a.name} and ${b.name}`).toBeLessThanOrEqual(BOX_GROOVE_DEPTH + 0.01);
};

describe('under a sink', () => {
  it('nothing stands there until something is asked for, and only a base cabinet with doors at the bottom takes a sink', () => {
    expect(under(vanity({}))).toEqual([]);
    expect(takesSink(cabinetsOf(createBaseCabinetProject('frameless', 'drawers'))[0]!)).toBe(false);
    expect(takesSink(cabinetsOf(vanity({}))[0]!)).toBe(true);
    const wall = vanity({ bottomTray: true }, 'frameless', (c) => {
      c.form = 'wall';
    });
    expect(under(wall)).toEqual([]);
  });

  for (const construction of ['faceFrame', 'frameless'] as const) {
    it(`${construction}: a roll-out tray is a drawer box with no front, on build-out strips on the case sides, clear of the hinges`, () => {
      const project = vanity({ bottomTray: true }, construction);
      const cabinet = cabinetsOf(project)[0]!;
      const all = deriveCabinetParts(project, shop);
      const parts = under(project);
      const build = built(project);
      const layers = construction === 'faceFrame' ? 2 : 1;
      expect(build.buildOutLayers).toBe(layers);
      expect(parts.filter((p) => p.role === 'buildOut')).toHaveLength(2 * layers);
      const box = parts.filter((p) => p.role?.startsWith('box'));
      expect(box.map((p) => p.name)).toEqual(['Bottom tray, left side', 'Bottom tray, right side', 'Bottom tray, front', 'Bottom tray, back', 'Bottom tray, bottom']);
      // 1/2" walls round a 1/4" bottom in a groove, rabbeted corners; the front wall is lower.
      const side = named(parts, 'Bottom tray, left side');
      expect(L(side.size.thickness)).toMatch(/1\/2"|15\/32"/);
      expect(side.features.map((f) => f.id)).toEqual(['cutout', 'box-groove', 'box-rabbet-front', 'box-rabbet-back']);
      expect([named(parts, 'Bottom tray, front').size.height, named(parts, 'Bottom tray, back').size.height]).toEqual([TRAY_FRONT, TRAY_WALL]);
      // The tray and its two slides fill the space between the build-outs, which stand against the case sides.
      const [left, right] = [named(all, 'Left side'), named(all, 'Right side')].map(partBox);
      const strips = parts.filter((p) => p.role === 'buildOut').map(partBox);
      const inner = { left: Math.max(...strips.filter((s) => s.max[0]! < cabinet.size.width.mm / 2).map((s) => s.max[0]!)), right: Math.min(...strips.filter((s) => s.min[0]! > cabinet.size.width.mm / 2).map((s) => s.min[0]!)) };
      expect(Math.min(...strips.map((s) => s.min[0]!))).toBeCloseTo(left!.max[0]!, 6);
      expect(Math.max(...strips.map((s) => s.max[0]!))).toBeCloseTo(right!.min[0]!, 6);
      const tray = { min: Math.min(...box.map((p) => partBox(p).min[0]!)), max: Math.max(...box.map((p) => partBox(p).max[0]!)) };
      const clearance = build.slides!.slide.sideClearance.mm;
      expect(tray.min - inner.left).toBeCloseTo(clearance, 6);
      expect(inner.right - tray.max).toBeCloseTo(clearance, 6);
      // The slides stand in from the door opening's edges by at least the hinges' room, each side.
      const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
      expect(inner.left - opening.origin.x).toBeGreaterThanOrEqual(HINGE_CLEAR - 1e-6);
      expect(opening.origin.x + opening.width - inner.right).toBeGreaterThanOrEqual(HINGE_CLEAR - 1e-6);
      // Over the cabinet's floor, behind the doors, in front of the back, and under the plumbing: a plain tray.
      for (const p of box) {
        const b = partBox(p);
        expect(b.min[1]).toBeGreaterThan(partBox(named(all, 'Bottom')).max[1]!);
        expect(b.max[2]).toBeLessThanOrEqual(-PULLOUT_SETBACK + 1e-6);
        expect(b.min[2]).toBeGreaterThan(partBox(named(all, 'Back')).max[2]!);
        expect(b.max[1]).toBeLessThan(build.obstacles[0]!.min[1]);
      }
      expect(build.trays).toEqual([expect.objectContaining({ name: 'Bottom tray', cutRound: false, length: build.slides!.lengths[0]!.length.mm })]);
      noTwoInOnePlace(parts);
    });
  }

  it('a face frame vanity loses less of its width to the tray than the case sides and the frame take', () => {
    // 30" wide, a 27" door opening: the tray is 24" or more outside.
    const tray = built(vanity({ bottomTray: true })).trays[0]!;
    expect(tray.width).toBeGreaterThan(len('24"').mm);
  });

  it('an upper tray is cut round the plumbing: a notched bottom, the back in two and three walls round the notch', () => {
    const project = vanity({ bottomTray: true, upper: 'tray' });
    const parts = under(project);
    const build = built(project);
    expect(build.slides!.lengths.map((u) => u.pairs)).toEqual([2]);
    expect(build.trays.map((t) => [t.name, t.cutRound])).toEqual([
      ['Bottom tray', false],
      ['Upper tray', true],
    ]);
    const upper = parts.filter((p) => p.name.startsWith('Upper tray') && p.role?.startsWith('box'));
    expect(upper.map((p) => p.name)).toEqual([
      'Upper tray, left side',
      'Upper tray, right side',
      'Upper tray, front',
      'Upper tray, back, left',
      'Upper tray, back, right',
      'Upper tray, notch, left',
      'Upper tray, notch, right',
      'Upper tray, notch, front',
      'Upper tray, bottom',
    ]);
    const bottom = named(parts, 'Upper tray, bottom');
    expect(outline(bottom)).toHaveLength(8);
    expect(bottom.shaped).toBe(true);
    // No wall of the tray is where the plumbing is, or nearer to it than the gap.
    const pipe = build.obstacles[0]!;
    for (const p of upper.filter((p) => p !== bottom)) {
      const box = partBox(p);
      const near = box.max[0]! > pipe.min[0] - PLUMBING_CLEAR + 0.01 && box.min[0]! < pipe.max[0] + PLUMBING_CLEAR - 0.01 && box.min[2]! < pipe.max[2] + PLUMBING_CLEAR - 0.01;
      expect(near, p.name).toBe(false);
    }
    // The three walls stand round the notch, and the bottom reaches into each.
    const front = partBox(named(parts, 'Upper tray, notch, front'));
    expect(front.min[2]).toBeCloseTo(pipe.max[2] + PLUMBING_CLEAR, 6);
    expect(partBox(named(parts, 'Upper tray, notch, left')).max[0]).toBeCloseTo(pipe.min[0] - PLUMBING_CLEAR, 6);
    expect(partBox(named(parts, 'Upper tray, notch, right')).min[0]).toBeCloseTo(pipe.max[0] + PLUMBING_CLEAR, 6);
    noTwoInOnePlace(parts);
  });

  it("a shelf goes from side to side on a cleat at each end, cut round the plumbing only where it reaches it", () => {
    // Under the trap: a plain shelf.
    const low = under(vanity({ upper: 'shelf' }));
    expect(low.map((p) => p.name)).toEqual(['Fixed shelf', 'Shelf cleat, left', 'Shelf cleat, right']);
    expect(outline(named(low, 'Fixed shelf'))).toHaveLength(4);
    // A trap that hangs lower than the shelf: cut round it.
    const cut = under(
      vanity({ upper: 'shelf' }, 'faceFrame', (c) => {
        c.inside!.obstacles[0]!.clearUnder = len('6"');
      }),
    );
    expect(outline(named(cut, 'Fixed shelf'))).toHaveLength(8);
    for (const side of ['left', 'right']) expect(partBox(named(cut, `Shelf cleat, ${side}`)).max[1]).toBeCloseTo(partBox(named(cut, 'Fixed shelf')).min[1]!, 6);
    noTwoInOnePlace(cut);
  });

  it("a small vanity, 24\" × 21\" with the trap well forward: a tray each side of it over a shelf; one tray round it while enough is left in front", () => {
    // 12" forward: one tray still goes round it, a strip in front of the notch and a wing each side.
    expect(built(smallVanity({ bottomTray: true, upper: 'tray' })).trays[1]).toMatchObject({ name: 'Upper tray', cutRound: true });
    // 16" forward: too little is left, and the message says what to use.
    const further = smallVanity({ bottomTray: true, upper: 'tray' });
    (further.context as CasesContext).pieces[0]!.inside!.obstacles[0]!.depth = len('16"');
    expect(() => deriveCabinetParts(further, shop)).toThrow(/cannot go round the trap.*a shelf with a tray each side/);
    const project = smallVanity({ bottomTray: true, upper: 'sideTrays' });
    const parts = under(project);
    const build = built(project);
    expect(build.trays.map((t) => [t.name, t.cutRound])).toEqual([
      ['Bottom tray', false],
      ['Left tray', false],
      ['Right tray', false],
    ]);
    expect(build.slides!.lengths.map((u) => u.pairs)).toEqual([3]);
    // The two side trays are the same, one each side of the plumbing, over the shelf; their inner slides on standards on it.
    const [l, r] = [build.trays[1]!, build.trays[2]!];
    expect(l.width).toBeCloseTo(r.width, 6);
    expect(l.width).toBeGreaterThan(len('4"').mm);
    const shelf = partBox(named(parts, 'Fixed shelf'));
    for (const side of ['Left', 'Right']) {
      expect(partBox(named(parts, `${side} tray, standard`)).min[1]).toBeCloseTo(shelf.max[1]!, 6);
      expect(partBox(named(parts, `${side} tray, bottom`)).min[1]).toBeGreaterThan(shelf.max[1]!);
    }
    expect(partBox(named(parts, 'Left tray, right side')).max[0]).toBeLessThan(build.obstacles[0]!.min[0]);
    expect(partBox(named(parts, 'Right tray, left side')).min[0]).toBeGreaterThan(build.obstacles[0]!.max[0]);
    // The bottom tray rolls under the shelf and its cleats.
    expect(partBox(named(parts, 'Bottom tray, back')).max[1]).toBeLessThan(partBox(named(parts, 'Shelf cleat, left')).min[1]!);
    noTwoInOnePlace(parts);
  });

  it('says in words what does not fit', () => {
    const narrow = vanity({ upper: 'sideTrays' }, 'faceFrame', (c) => {
      c.size.width = len('18"');
    });
    expect(() => deriveCabinetParts(narrow, shop)).toThrow(/no room for the left tray/);
    const forward = vanity({ upper: 'shelf' }, 'faceFrame', (c) => {
      Object.assign(c.inside!.obstacles[0]!, { width: len('6"'), depth: len('19"'), clearUnder: len('6"') });
    });
    expect(() => deriveCabinetParts(forward, shop)).toThrow(/too far forward for a shelf/);
  });

  describe('what is in the way is a list of blocks', () => {
    const valve = (c: StoredCabinet, fromLeft: string, more: object = {}) => c.inside!.obstacles.push({ ...createObstacle('valve', c.inside!.obstacles), fromLeft: len(fromLeft), ...more });

    it('a block is placed from the left side, the back and the floor, or centred against the back up to the top; each is drawn, none cut', () => {
      const project = vanity({ bottomTray: true }, 'frameless', (c) => valve(c, '2"', { clearUnder: len('14"'), height: len('4"') }));
      const cabinet = cabinetsOf(project)[0]!;
      const build = built(project);
      const all = deriveCabinetParts(project, shop);
      const [left, bottom, back] = ['Left side', 'Bottom', 'Back'].map((n) => partBox(named(all, n)));
      expect(build.obstacles.map((o) => o.name)).toEqual(['the trap', 'the supply valve']);
      const [trap, v] = build.obstacles;
      expect((trap!.min[0] + trap!.max[0]) / 2).toBeCloseTo(cabinet.size.width.mm / 2, 6);
      expect(v!.min[0] - left!.max[0]!).toBeCloseTo(len('2"').mm, 6);
      expect(v!.min[1] - bottom!.max[1]!).toBeCloseTo(len('14"').mm, 6);
      expect(v!.max[1] - v!.min[1]).toBeCloseTo(len('4"').mm, 6);
      expect(v!.min[2]).toBeCloseTo(back!.max[2]!, 6);
      const shapes = obstacleShapes(cabinet, shop.materials);
      expect(shapes.map((s) => s.name)).toEqual(['The trap', 'The supply valve']);
      expect(shapes.every((s) => s.id.includes('appliance-') && s.id.endsWith('/shape'))).toBe(true);
      expect(all.some((p) => p.id.includes('obstacle'))).toBe(false);
    });

    it('a tray is cut round the trap and a valve beside it in one notch', () => {
      const project = vanity({ upper: 'tray' }, 'faceFrame', (c) => valve(c, '8"', { clearUnder: len('9"'), height: len('6"'), depth: len('12"') }));
      const build = built(project);
      expect(build.trays[0]).toMatchObject({ cutRound: true, round: 'the trap and the supply valve' });
      const parts = under(project);
      const [trap, v] = build.obstacles;
      expect(partBox(named(parts, 'Upper tray, notch, left')).max[0]).toBeCloseTo(v!.min[0] - PLUMBING_CLEAR, 6);
      expect(partBox(named(parts, 'Upper tray, notch, right')).min[0]).toBeCloseTo(trap!.max[0] + PLUMBING_CLEAR, 6);
      expect(partBox(named(parts, 'Upper tray, notch, front')).min[2]).toBeCloseTo(v!.max[2] + PLUMBING_CLEAR, 6);
      noTwoInOnePlace(parts);
    });

    it('a tray that cannot go round a block at its side is made shorter, on a shorter slide, and says so', () => {
      // A valve on the floor in the back left corner: no wing of the tray would be left beside it.
      const plain = built(vanity({ bottomTray: true }));
      const project = vanity({ bottomTray: true }, 'faceFrame', (c) => valve(c, '1"', { clearUnder: undefined, height: len('6"') }));
      const build = built(project);
      const tray = build.trays[0]!;
      expect(tray).toMatchObject({ cutRound: false, stopsAt: 'the supply valve' });
      expect(tray.length).toBeLessThan(plain.trays[0]!.length);
      expect(build.slides!.lengths).toEqual([{ length: expect.objectContaining({ mm: tray.length }), pairs: 1 }]);
      const parts = under(project);
      const v = build.obstacles[1]!;
      for (const p of parts) expect(partBox(p).min[2], p.name).toBeGreaterThanOrEqual(v.max[2] + PLUMBING_CLEAR - 1e-6);
      // Its strips are as long as it is.
      expect(parts.filter((p) => p.role === 'buildOut').every((p) => Math.abs(p.size.width - tray.length) < 1e-6)).toBe(true);
      // Two trays of two lengths: two lines of slides.
      const two = built(vanity({ bottomTray: true, upper: 'tray' }, 'faceFrame', (c) => valve(c, '1"', { clearUnder: undefined, height: len('6"') })));
      expect(two.slides!.lengths.map((u) => u.pairs)).toEqual([1, 1]);
      expect(two.slides!.lengths[0]!.length.mm).toBeGreaterThan(two.slides!.lengths[1]!.length.mm);
    });

    it('a shelf is notched from the back for each block through it, a step where two notches meet, and a cleat stops in front of one', () => {
      const project = vanity({ upper: 'shelf' }, 'faceFrame', (c) => {
        c.inside!.obstacles[0]!.clearUnder = len('6"');
        // On the floor against the left side, up through the shelf.
        valve(c, '0"', { clearUnder: undefined, height: len('14"'), depth: len('5"') });
      });
      const parts = under(project);
      const build = built(project);
      const shelf = named(parts, 'Fixed shelf');
      // A corner notch at the left (2 more points than the plain edge) and the trap's notch in the middle (4 more).
      const pts = outline(shelf);
      expect(pts).toHaveLength(10);
      const ys = new Set(pts.map((p) => Math.round(p.y * 100)));
      expect(ys.size).toBe(4);
      const [, v] = build.obstacles;
      const [cleatL, cleatR] = ['left', 'right'].map((s) => partBox(named(parts, `Shelf cleat, ${s}`)));
      expect(cleatL!.min[2]).toBeCloseTo(v!.max[2] + PLUMBING_CLEAR, 6);
      expect(cleatR!.min[2]).toBeLessThan(cleatL!.min[2]!);
      noTwoInOnePlace(parts);
    });

    it('with nothing in the way the trays and the shelf are plain; the bowl over them changes nothing', () => {
      const none = vanity({ bottomTray: true, upper: 'tray' }, 'faceFrame', (c) => {
        c.inside!.obstacles = [];
      });
      expect(built(none).trays.map((t) => t.cutRound)).toEqual([false, false]);
      const bowl = vanity({ bottomTray: true, upper: 'shelf' }, 'faceFrame', (c) => {
        c.inside!.obstacles = [createObstacle('bowl')];
      });
      expect(outline(named(under(bowl), 'Fixed shelf'))).toHaveLength(4);
      expect(() => deriveCabinetParts(vanity({ upper: 'sideTrays' }, 'faceFrame', (c) => (c.inside!.obstacles = [])), shop)).toThrow(/Nothing is in the way/);
    });
  });

  describe('the self-standing frame', () => {
    it('is what an existing cabinet starts with, and strips what a made one does; either can be chosen', () => {
      const made = vanity({ bottomTray: true });
      expect(trayMounting(cabinetsOf(made)[0]!)).toBe('strips');
      const there = vanity({ bottomTray: true });
      makeExisting(there, cabinetsOf(there)[0]!.id);
      expect(trayMounting(cabinetsOf(there)[0]!)).toBe('frame');
      expect(under(there).some((p) => p.role === 'buildOut')).toBe(false);
      expect(under(there).map((p) => p.name)).toEqual(expect.arrayContaining(['Tray frame, left standard', 'Tray frame, right standard', 'Tray frame, front rail', 'Tray frame, back rail']));
      (there.context as CasesContext).pieces[0]!.inside!.mounting = 'strips';
      expect(under(there).some((p) => p.role === 'buildOut')).toBe(true);
    });

    for (const construction of ['faceFrame', 'frameless'] as const) {
      it(`${construction}: two standards on two rails on the cabinet's floor, inside the door opening, touching no side; the tray rolls over the rails`, () => {
        const project = vanity({ bottomTray: true, mounting: 'frame' }, construction);
        const cabinet = cabinetsOf(project)[0]!;
        const all = deriveCabinetParts(project, shop);
        const parts = under(project);
        const build = built(project);
        expect(build.mounting).toBe('frame');
        expect(parts.filter((p) => p.id.includes('/sink-frame/')).map((p) => p.name)).toEqual(['Tray frame, left standard', 'Tray frame, right standard', 'Tray frame, front rail', 'Tray frame, back rail']);
        const box = (name: string) => partBox(named(parts, name));
        const [sl, sr, rf, rb] = ['left standard', 'right standard', 'front rail', 'back rail'].map((n) => box(`Tray frame, ${n}`));
        const floor = partBox(named(all, 'Bottom')).max[1]!;
        // The rails lie on the floor, the standards stand on them, flush with their ends.
        for (const r of [rf!, rb!]) {
          expect(r.min[1]).toBeCloseTo(floor, 6);
          expect(r.min[0]).toBeCloseTo(sl!.min[0]!, 6);
          expect(r.max[0]).toBeCloseTo(sr!.max[0]!, 6);
        }
        for (const st of [sl!, sr!]) expect(st.min[1]).toBeCloseTo(rf!.max[1]!, 6);
        expect(rf!.max[2]).toBeCloseTo(sl!.max[2]!, 6);
        expect(rb!.min[2]).toBeCloseTo(sl!.min[2]!, 6);
        // It goes in through the door opening with play each side, and stands clear of the case sides.
        const opening = deriveCabinetOpenings(cabinet, shop.materials).at(-1)!;
        const edge = Math.max(opening.origin.x, partBox(named(all, 'Left side')).max[0]!);
        expect(sl!.min[0]! - edge).toBeGreaterThanOrEqual(FRAME_PLAY - 1e-6);
        expect(build.frame!.width).toBeLessThanOrEqual(opening.width - 2 * FRAME_PLAY + 1e-6);
        // The slides clear the hinges, and the tray with its slides fills the frame.
        expect(sl!.max[0]! - opening.origin.x).toBeGreaterThanOrEqual(HINGE_CLEAR - 1e-6);
        const tray = parts.filter((p) => p.role?.startsWith('box')).map(partBox);
        const clearance = build.slides!.slide.sideClearance.mm;
        expect(Math.min(...tray.map((b) => b.min[0]!)) - sl!.max[0]!).toBeCloseTo(clearance, 6);
        expect(sr!.min[0]! - Math.max(...tray.map((b) => b.max[0]!))).toBeCloseTo(clearance, 6);
        expect(Math.min(...tray.map((b) => b.min[1]!))).toBeGreaterThan(rf!.max[1]!);
        noTwoInOnePlace(parts);
      });
    }

    it('with two trays the standards reach the upper slide and a tie at the back keeps them upright, under the trap', () => {
      const project = vanity({ bottomTray: true, upper: 'tray', mounting: 'frame' });
      const parts = under(project);
      const build = built(project);
      expect(build.frame!.tie).toBe(true);
      const tie = partBox(named(parts, 'Tray frame, tie'));
      const upper = partBox(named(parts, 'Upper tray, left side'));
      const lower = partBox(named(parts, 'Bottom tray, left side'));
      expect(tie.max[1]).toBeLessThan(upper.min[1]!);
      expect(tie.min[1]).toBeGreaterThan(lower.max[1]!);
      expect(tie.max[1]).toBeLessThanOrEqual(build.obstacles[0]!.min[1] - PLUMBING_CLEAR + 1e-6);
      expect(partBox(named(parts, 'Tray frame, left standard')).max[1]).toBeGreaterThan(upper.min[1]! + TRAY_WALL / 2);
      noTwoInOnePlace(parts);
      // A trap that hangs low leaves the tie no room: it is left out, and the build says so.
      const low = built(vanity({ bottomTray: true, upper: 'tray', mounting: 'frame' }, 'faceFrame', (c) => (c.inside!.obstacles[0]!.clearUnder = len('5.5"'))));
      expect(low.frame!.tie).toBe(false);
    });

    it('side trays hang on standards on the shelf at both edges, with nothing but the cleats on the sides', () => {
      const project = smallVanity({ bottomTray: true, upper: 'sideTrays', mounting: 'frame' });
      const parts = under(project);
      expect(parts.some((p) => p.role === 'buildOut')).toBe(false);
      const shelf = partBox(named(parts, 'Fixed shelf'));
      for (const side of ['Left', 'Right']) expect(partBox(named(parts, `${side} tray, outer standard`)).min[1]).toBeCloseTo(shelf.max[1]!, 6);
      expect(partBox(named(parts, 'Left tray, outer standard')).max[0]).toBeLessThan(partBox(named(parts, 'Left tray, left side')).min[0]!);
      noTwoInOnePlace(parts);
      const text = buildChecklist(project, buildJob(project, shop).plan, buildJob(project, shop).programs, shop.tools).join(' ');
      expect(text).toContain("screw down through its rails into the floor");
      expect(text).toContain('outer standards');
      expect(text).not.toContain('build-out strips');
    });

    it('says so when a block stands where the frame would', () => {
      const project = vanity({ bottomTray: true, upper: 'tray', mounting: 'frame' }, 'faceFrame', (c) => {
        c.inside!.obstacles.push({ ...createObstacle('other', c.inside!.obstacles), fromLeft: len('0"'), fromBack: len('14"'), width: len('3"'), depth: len('4"'), clearUnder: len('7"'), height: len('2"') });
      });
      expect(() => deriveCabinetParts(project, shop)).toThrow(/frame for the trays.*build-out strips/);
    });
  });

  it('each tray rolls out on its own in the 3D view, with the drawers', () => {
    const project = vanity({ bottomTray: true, upper: 'tray' });
    const placed = buildCabinetAssembly(deriveCabinetParts(project, shop)).parts;
    const of = (text: string) => placed.filter((p) => p.partId.includes(text));
    expect(of('/sink-tray-bottom/tray-').every((p) => (p.slide ?? 0) > 0)).toBe(true);
    expect(of('/sink-tray-upper/tray-').every((p) => (p.slide ?? 0) > 0)).toBe(true);
    // The upper one comes out less far than the lower, as drawers do; the strips and the case stay put.
    expect(of('/sink-tray-upper/tray-side-left')[0]!.pullShare).toBeLessThan(of('/sink-tray-bottom/tray-side-left')[0]!.pullShare!);
    expect(of('/strip-').every((p) => p.slide === undefined)).toBe(true);
    expect(placed.filter((p) => p.role === 'side').every((p) => p.slide === undefined)).toBe(true);
  });

  it('is cut with the job; its slides are on the hardware list and its steps in the build checklist', () => {
    const project = smallVanity({ bottomTray: true, upper: 'sideTrays' });
    const job = buildJob(project, shop);
    expect(job.cabinetParts.filter((p) => p.id.includes('/sink-')).length).toBeGreaterThan(20);
    // The plumbing is drawn, never cut.
    expect(job.cabinetParts.some((p) => p.id.includes('obstacle'))).toBe(false);
    const lists = buildLists(job, project, shop, L);
    const rows = lists.hardware.filter((h) => h.group === 'Under the sink' && !h.item.startsWith('Slide jigs'));
    expect(rows.map((h) => h.quantity)).toEqual([3]);
    expect(rows[0]!.item).toMatch(/slide/i);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools).join('\n');
    expect(text).toContain('Under the sink');
    expect(text).toContain('build-out strips');
    expect(text).toContain('a standard to the shelf each side of the plumbing');
  });
});
