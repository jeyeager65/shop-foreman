// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LEAF, LEAF_LOOK, buildCabinetAssembly, buildProjectAssembly, cabinetBack, cabinetsOf, shownTopParts, leafLength, leafPinPlaces, leafRestPlaces, ribLines, leafProblems, lightTopTable, partBox, topPieces } from '@/design';
import { isApplianceShape } from '@/design/appliances';
import { cabinetPlaces, inCabinet, inRoom } from '@/design/room';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, PlanWarning } from '@/model';
import { activeMachine } from '@/plan';
import { createFoldingShopTableProject, createShopTableProject } from '@/samples/cabinet';
import { len } from '@/units';

/** A torsion table with a leaf that folds down: `?sample=shoptablefold`. */
const shop = createStarterShop();
const L = (mm: number) => `${Math.round((mm / 25.4) * 100) / 100}"`;
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];

describe('the folding table', () => {
  const project = createFoldingShopTableProject();
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  const table = all.filter((p) => p.role === 'rib' || /skin/i.test(p.name));
  const leaf = table.filter((p) => p.name.startsWith('Leaf: '));
  const fixed = table.filter((p) => !p.name.startsWith('Leaf: '));
  const piece = topPieces(project, shop.materials).find((p) => p.torsion)!;

  it('is 62" × 112", its back 28" a box of its own', () => {
    expect([L(piece.x1 - piece.x0), L(piece.zFront - piece.zBack)]).toEqual(['62"', '112"']);
    expect(L(leafLength(piece.torsion!, piece.zFront - piece.zBack))).toBe('28"');
    expect(leaf.length).toBeGreaterThan(10);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    // Each box is whole: its own frame, front and back, and its own skins.
    for (const box of [fixed, leaf]) {
      const names = box.map((p) => p.name.replace('Leaf: ', ''));
      expect(names).toContain('Rib, front');
      expect(names).toContain('Rib, back');
      expect(names.some((n) => n.startsWith('Top skin'))).toBe(true);
      expect(names.some((n) => n.startsWith('Bottom skin'))).toBe(true);
    }
    // The two meet at the joint with nothing between: the part that stays is 84" from the front, the leaf the rest.
    const depth = (parts: typeof table) => {
      const boxes = parts.map((p) => partBox(p));
      return [Math.min(...boxes.map((b) => b.min[2]!)), Math.max(...boxes.map((b) => b.max[2]!))];
    };
    const [fixedBack, fixedFront] = depth(fixed);
    const [leafBack, leafFront] = depth(leaf);
    expect(L(fixedFront! - fixedBack!)).toBe('84"');
    expect(L(leafFront! - leafBack!)).toBe('28"');
    expect(leafFront).toBeCloseTo(fixedBack!, 6);
  });

  it('drills matching holes for the alignment pins in the two ribs that meet, and nowhere else', () => {
    const holes = (name: string) => table.find((p) => p.name === name)!.features.filter((f) => f.kind === 'hole');
    const [socket, pin] = [holes('Rib, back'), holes('Leaf: Rib, front')];
    expect(pin).toHaveLength(LEAF.pin.count);
    expect(socket.map((f) => f.kind === 'hole' && [f.center.x, f.center.y, f.diameter])).toEqual(pin.map((f) => f.kind === 'hole' && [f.center.x, f.center.y, f.diameter]));
    expect(pin.every((f) => f.kind === 'hole' && Math.abs(f.diameter - (LEAF.pin.diameter + LEAF.pin.fit)) < 1e-9)).toBe(true);
    // The only other holes are the two for the rest feet, in the leaf's far rib.
    expect(table.filter((p) => p.features.some((f) => f.kind === 'hole')).map((p) => p.name).sort()).toEqual(['Leaf: Rib, back', 'Leaf: Rib, front', 'Rib, back']);
    // Each is in the middle of a cell, clear of the slots.
    const places = leafPinPlaces(len('62"').mm, 18, len('6"').mm);
    expect(places).toHaveLength(3);
    expect(places[0]!).toBeLessThan(len('8"').mm);
    expect(places[2]!).toBeGreaterThan(len('54"').mm);
    // The CNC drills them with the ribs.
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    for (const rib of table.filter((p) => p.features.some((f) => f.kind === 'hole'))) {
      for (const f of rib.features.filter((x) => x.kind === 'hole')) expect(planned.has(`${rib.id}:${f.id}`), `${rib.name} ${f.id}`).toBe(true);
    }
  });

  it('plans with nothing in the way, and its cabinets are all under the part that stays', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.files.length).toBeGreaterThan(0);
  });

  it('lists the hinge, the pins, the latches and the legs, and says how the joint is made', () => {
    const lists = buildLists(job, project, shop, L);
    const items = lists.hardware.filter((h) => h.group === 'Torsion table').map((h) => [h.item.split(',')[0], h.quantity]);
    expect(items).toEqual([
      ['Wood glue', undefined],
      ['Continuous (piano) hinge', undefined],
      ['1/4"-20 machine screws', 20],
      ['#10 wood screws', 20],
      ['Levelling feet on a 3/8"-16 stud', 2],
      ['Brass table-leaf alignment pins and sockets', 3],
      ['Draw latches', 2],
      ['Locking folding leg brackets', 2],
      ['Legs for the leaf', 2],
      ['18 ga brad nails', undefined],
    ]);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop)).find((s) => s.title === 'Tops')!.steps.map((s) => s.text);
    expect(steps.filter((s) => /leaf|across the joint/.test(s)).length).toBe(8);
    expect(steps.some((s) => /T-nut/.test(s) && /Before the top skins go on/.test(s))).toBe(true);
    expect(steps.some((s) => s.startsWith('The table is two boxes: the part that stays (84") and its leaf (28")'))).toBe(true);
  });

  it('backs the hinge in every cell along the joint, in both boxes, and gives the leaf two feet to stand on when it is down', () => {
    const backers = table.filter((p) => p.name.replace('Leaf: ', '').startsWith('Hinge backer'));
    const [mine, leafs] = [backers.filter((p) => !p.name.startsWith('Leaf: ')), backers.filter((p) => p.name.startsWith('Leaf: '))];
    expect([mine.length, leafs.length]).toEqual([10, 10]);
    const joint = piece.zBack + len('28"').mm;
    const rib = partBox(table.find((p) => p.name === 'Rib, back')!);
    const skin = partBox(table.find((p) => p.name.startsWith('Bottom skin'))!);
    for (const b of backers) {
      const at = partBox(b);
      // Flat on the bottom skin, as thick as a rib, a plain rectangle the saw cuts.
      expect(at.min[1]).toBeCloseTo(skin.max[1], 6);
      expect(at.max[1] - at.min[1]).toBeCloseTo(rib.max[2] - rib.min[2], 6);
      expect(b.features.length).toBe(1);
      expect(job.plan.parts.find((x) => x.partId === b.id)!.cutOut).not.toBe('cnc');
      // Against its box's joint rib: the fixed box's in front of the joint, the leaf's behind it.
      const leafs = b.name.startsWith('Leaf: ');
      expect(leafs ? at.max[2] : at.min[2]).toBeCloseTo(leafs ? joint - (rib.max[2] - rib.min[2]) : joint + (rib.max[2] - rib.min[2]), 3);
      expect(at.max[2] - at.min[2]).toBeCloseTo(LEAF.backer.width, 6);
    }
    // No backer lies over a short rib: each is within one cell.
    const lines = ribLines(len('62"').mm, rib.max[2] - rib.min[2], len('6"').mm);
    for (const [k, b] of mine.entries()) {
      const at = partBox(b);
      expect(at.min[0] - piece.x0).toBeGreaterThan(lines[k]! + (rib.max[2] - rib.min[2]));
      expect(at.max[0] - piece.x0).toBeLessThan(lines[k + 1]!);
    }
    // The leaf's backers swing with it; the fixed box's do not.
    expect(leafs.every((p) => p.moves?.kind === 'fold') && mine.every((p) => !p.moves)).toBe(true);
    // The rest feet: two holes in the leaf's far rib, a quarter of its height up, each in the middle of a cell.
    const far = table.find((p) => p.name === 'Leaf: Rib, back')!;
    const holes = far.features.filter((f) => f.kind === 'hole');
    expect(holes.map((f) => f.id)).toEqual(['leaf-rest-1', 'leaf-rest-2']);
    const places = leafRestPlaces(len('62"').mm, rib.max[2] - rib.min[2], len('6"').mm);
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    expect(holes.map((f) => f.kind === 'hole' && [r3(f.center.x), r3(f.center.y), f.diameter])).toEqual(places.map((x) => [r3(x), r3(far.size.height / 4), LEAF.rest.hole]));
    expect(places[0]!).toBeCloseTo(len('62"').mm - places[1]!, 3);
    // Drawn, they reach as far out of the leaf's far end as the hanging leaf is off the floor.
    const feet = shownTopParts(project, shop.materials, shop.hardware).filter((p) => p.name === 'Rest foot');
    expect(feet.length).toBe(2);
    expect(piece.zBack - partBox(feet[0]!).min[2]).toBeCloseTo(piece.y - len('28"').mm, 3);
    expect(feet.every((p) => p.moves?.kind === 'fold')).toBe(true);
  });

  it('says when the leaf would reach the floor, or leaves too little', () => {
    const t = { ...lightTopTable(), leaf: { edge: 'back' as const, length: len('28"') } };
    const width = len('112"').mm;
    expect(leafProblems(t, width, len('30"').mm, L)).toEqual([]);
    expect(leafProblems({ ...t, leaf: { edge: 'back', length: len('32"') } }, width, len('30"').mm, L)[0]).toMatch(/folded down it would reach the floor. Make it 29.02" or less/);
    expect(leafProblems({ ...t, leaf: { edge: 'back', length: len('3"') } }, width, len('30"').mm, L)[0]).toMatch(/must each be at least/);
    // Too short a leaf is not made: the table stays one box.
    expect(leafLength({ ...t, leaf: { edge: 'back', length: len('3"') } }, width)).toBe(0);
    expect(leafProblems(lightTopTable(), width, len('30"').mm, L)).toEqual([]);
    // In the sample it clears the floor.
    expect(leafProblems(piece.torsion!, piece.zFront - piece.zBack, piece.y, L)).toEqual([]);
  });

  it('folds in the 3D view: every part of the leaf swings about the lower edge of the joint, and nothing else does', () => {
    const joint = piece.zFront - (piece.zFront - piece.zBack - len('28"').mm);
    expect(leaf.every((p) => p.moves?.kind === 'fold' && Math.abs(p.moves.axis[0] - piece.y) < 1e-6 && Math.abs(p.moves.axis[1] - joint) < 1e-6)).toBe(true);
    expect(all.filter((p) => p.moves?.kind === 'fold').length).toBe(leaf.length);
    const placed = buildCabinetAssembly(table).parts;
    expect(placed.filter((p) => p.foldsAbout).map((p) => p.partId).sort()).toEqual(leaf.map((p) => p.id).sort());
    // Set down in a room with the other cabinets, its line goes with it.
    const moved = buildProjectAssembly([{ id: 'a', at: [100, 20, 300], parts: table }]).parts.find((p) => p.foldsAbout)!;
    expect(moved.foldsAbout).toEqual([piece.y + 20, joint + 300]);
  });

  it('centres the part that stays on its cabinets: the leaf hangs beyond them', () => {
    // The front row's cabinets, in the same frame as the table: inside the part that stays, the table's overhang in from its front end.
    const row = job.cabinetParts.filter((p) => p.designObjectId === piece.cabinetId && !table.includes(p) && p.role === 'side');
    const z = row.map((p) => partBox(p)).flatMap((b) => [b.min[2]!, b.max[2]!]);
    const joint = piece.zBack + len('28"').mm;
    expect(Math.min(...z)).toBeGreaterThan(joint);
    expect(piece.zFront - Math.max(...z)).toBeLessThan(len('4"').mm);
    // The table with no leaf is centred whole, as before.
    const whole = topPieces(createShopTableProject(), shop.materials).find((p) => p.torsion)!;
    expect(L(whole.zFront - whole.zBack)).toBe('84"');
    expect(piece.zFront).toBeCloseTo(whole.zFront, 3);
  });

  it('draws the leaf\'s hardware, for the picture only: what is on the leaf goes down with it, and its legs fold flat first', () => {
    const shapes = shownTopParts(project, shop.materials, shop.hardware);
    expect(shapes.map((p) => p.name).sort()).toEqual(
      ['Alignment pin', 'Alignment pin', 'Alignment pin', 'Draw latch', 'Draw latch', 'Folding leg bracket', 'Folding leg bracket', 'Hinge', 'Latch catch', 'Latch catch', 'Leg', 'Leg', 'Levelling foot', 'Levelling foot', 'Rest foot', 'Rest foot', 'Rest foot stud', 'Rest foot stud'],
    );
    // Never cut, planned or listed: they are not among the job's parts, and are drawn as metal.
    expect(shapes.every((p) => isApplianceShape(p.id) && !all.some((q) => q.id === p.id))).toBe(true);
    // The hinge and the latches' bodies stay; the rest swings about the joint.
    const stays = shapes.filter((p) => !p.moves).map((p) => p.name).sort();
    expect(stays).toEqual(['Draw latch', 'Draw latch', 'Hinge']);
    // The legs reach the floor on their feet, under the leaf's far end, and fold toward each other, one behind the other.
    const legs = shapes.filter((p) => p.name === 'Leg');
    const feet = shapes.filter((p) => p.name === 'Levelling foot');
    expect(feet.every((f) => Math.abs(partBox(f).min[1]!) < 1e-6)).toBe(true);
    expect(legs.every((l) => Math.abs(partBox(l).max[1]! - (piece.y - LEAF_LOOK.bracket.thick)) < 1e-6 && partBox(l).min[2]! < piece.zBack + len('6"').mm)).toBe(true);
    const firsts = legs.map((l) => (l.moves?.kind === 'fold' ? l.moves.first! : undefined)!);
    expect(firsts.map((f) => f.sign).sort()).toEqual([-1, 1]);
    const [a, b] = legs.map((l) => partBox(l));
    expect(Math.min(a!.max[2]!, b!.max[2]!)).toBeLessThan(Math.max(a!.min[2]!, b!.min[2]!));
    // Folded, each lies within the leaf's width.
    const long = partBox(legs[0]!).max[1]! - partBox(legs[0]!).min[1]! + LEAF_LOOK.foot.height;
    expect(LEAF_LOOK.leg.inset + long).toBeLessThan(piece.x1 - piece.x0);
    // They do not say where the cabinet's back is: the row stands where it did.
    const row = job.cabinetParts.filter((p) => p.designObjectId === piece.cabinetId);
    expect(cabinetBack([...row, ...shapes])).toBeCloseTo(cabinetBack(row), 6);
    // The first table has none.
    expect(shownTopParts(createShopTableProject(), shop.materials, shop.hardware)).toEqual([]);
    const placed = buildCabinetAssembly([...table, ...shapes]).parts;
    expect(placed.filter((p) => p.foldsFirst).length).toBe(4);
  });

  it('stands the two back cabinets apart, each with its front the overhang in from a long edge', () => {
    const places = cabinetPlaces(project)!;
    const home = places.get(piece.cabinetId)!;
    const across = cabinetsOf(project)
      .filter((c) => c.name.startsWith('Back'))
      .map((c) => {
        const at = places.get(c.id)!;
        const xs = [inCabinet(home, inRoom(at.at, at.turn, [0, 0, -c.size.depth.mm]))[0], inCabinet(home, inRoom(at.at, at.turn, [c.size.width.mm, 0, 0]))[0]];
        return [Math.min(...xs), Math.max(...xs)];
      })
      .sort((p, q) => p[0]! - q[0]!);
    expect(across[0]![0]! - piece.x0).toBeCloseTo(len('2"').mm, 3);
    expect(piece.x1 - across[1]![1]!).toBeCloseTo(len('2"').mm, 3);
    expect(across[1]![0]! - across[0]![1]!).toBeCloseTo(len('13"').mm, 3);
  });

  it('leaves the first table as it was: one box, no leaf, no holes in its ribs', () => {
    const first = createShopTableProject();
    expect((first.context as CasesContext).islands![0]!.top!.leaf).toBeUndefined();
    const parts = buildJob(first, shop).cabinetParts.filter((p) => p.role === 'rib');
    expect(parts.some((p) => p.name.startsWith('Leaf'))).toBe(false);
    expect(parts.some((p) => p.features.some((f) => f.kind === 'hole'))).toBe(false);
  });
});
