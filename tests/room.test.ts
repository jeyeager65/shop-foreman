// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, inRoom, layOutCabinets, layoutProblems, parseRoom, pastCeiling, placeGroups, starterRoom } from '@/design';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { addTallCabinet, addWallCabinet, createBaseCabinetProject } from '@/samples/cabinet';
import { FRAMELESS_PRESET_ID, builtInPresets, newProjectFromPreset } from '@/samples/presets';
import { len } from '@/units';

/** Milestone 6: the room. */
describe('the room', () => {
  it('a new project from Setup stands in a 12\' × 10\' room with an 8\' ceiling', () => {
    const { project } = newProjectFromPreset(builtInPresets().find((p) => p.id === FRAMELESS_PRESET_ID)!, createStarterShopProfile());
    expect((project.context as CasesContext).room).toEqual(starterRoom());
    expect(starterRoom()).toEqual({ length: len('144"'), width: len('120"'), ceiling: len('96"') });
    // The samples have none: their jobs and views are as they were.
    expect((createBaseCabinetProject().context as CasesContext).room).toBeUndefined();
  });

  it('reads a room from the URL in inches', () => {
    expect(parseRoom('144x120x96')).toEqual(starterRoom());
    expect(parseRoom('144x120')).toBeUndefined();
    expect(parseRoom(null)).toBeUndefined();
  });

  it('without a room the cabinets stand in a row; in one, against the back wall', () => {
    const cabinets = [
      { id: 'a', width: 600, back: 572 },
      { id: 'b', width: 400, back: 330, offFloor: 1372 },
    ];
    const row = layOutCabinets(undefined, cabinets);
    expect(row.get('a')).toEqual({ at: [0, 0, 0], turn: 0 });
    const room = layOutCabinets(starterRoom(), cabinets);
    // Each one's back touches the wall: its front-left corner is as far out as its back is behind it.
    expect(room.get('a')).toEqual({ at: [0, 0, 572], turn: 0 });
    // Not placed: on the back wall after the one before it.
    expect(room.get('b')!.at).toEqual([600, 1372, 330]);
  });

  it('warns of a cabinet past the ceiling, never refusing it', () => {
    const project = createBaseCabinetProject();
    const context = project.context as CasesContext;
    context.room = { ...starterRoom(), ceiling: len('84"') };
    addTallCabinet(project, { name: 'Tall', height: len('90"') });
    const wall = addWallCabinet(project, { name: 'Wall' });
    wall.offFloor = len('60"');
    const over = pastCeiling(project, cabinetsOf(project)).map((c) => [c.cabinet.name, Math.round(c.top)]);
    expect(over).toEqual([['Tall', 2286], ['Wall', 2286]]);
  });
});

/** Milestone 6: placement. */
describe('placing runs and cabinets', () => {
  const room = starterRoom(); // 3657.6 × 3048
  const L = room.length.mm;
  const W = room.width.mm;
  const one = (placement: import('@/model').Placement) => layOutCabinets(room, [{ id: 'a', width: 600, back: 560, placement }]).get('a')!;
  const near = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i]!, 6));

  it('against each wall: its back on the wall, its left end along it as you face it, turned to face the room', () => {
    const along = len('10"');
    let p = one({ wall: 'back', along });
    near(p.at, [along.mm, 0, 560]);
    expect(p.turn).toBe(0);
    p = one({ wall: 'left', along });
    near(p.at, [560, 0, W - along.mm]);
    expect(p.turn).toBe(90);
    p = one({ wall: 'right', along });
    near(p.at, [L - 560, 0, along.mm]);
    expect(p.turn).toBe(270);
    p = one({ wall: 'front', along });
    near(p.at, [L - along.mm, 0, W - 560]);
    expect(p.turn).toBe(180);
  });

  it("turned, a cabinet's back-left corner lands on the wall at its left end", () => {
    for (const wall of ['back', 'left', 'right', 'front'] as const) {
      const p = one({ wall, along: len('10"') });
      const backLeft = inRoom(p.at, p.turn, [0, 0, -560]);
      const onWall = wall === 'back' ? backLeft[2] : wall === 'front' ? W - backLeft[2] : wall === 'left' ? backLeft[0] : L - backLeft[0];
      expect(onWall).toBeCloseTo(0, 6);
    }
  });

  it('free standing: its back-left corner where it is put, turned as asked', () => {
    const p = one({ wall: 'free', x: len('60"'), y: len('48"'), turn: 180 });
    expect(p.turn).toBe(180);
    near(inRoom(p.at, p.turn, [0, 0, -560]), [len('60"').mm, 0, len('48"').mm]);
  });

  it('a run stands its cabinets side by side from its left end; what is not placed goes on the back wall after the rest', () => {
    const places = layOutCabinets(
      room,
      [
        { id: 'a', width: 600, back: 560, runId: 'r' },
        { id: 'b', width: 400, back: 560, runId: 'r' },
        { id: 'c', width: 500, back: 560 },
        { id: 'w', width: 760, back: 300, form: 'wall', offFloor: 1372 },
      ],
      new Map([['r', { wall: 'right', along: len('20"') } as const]]),
    );
    near(places.get('a')!.at, [L - 560, 0, len('20"').mm]);
    near(places.get('b')!.at, [L - 560, 0, len('20"').mm + 600]);
    // The lone cabinet is placed automatically on the back wall, from its left end; the wall cabinet over it.
    near(places.get('c')!.at, [0, 0, 560]);
    near(places.get('w')!.at, [0, 1372, 300]);
  });

  it("a run placed against a wall has the room's walls for ends", async () => {
    const { runEnds, createRun } = await import('@/design');
    const project = createBaseCabinetProject();
    const context = project.context as CasesContext;
    const run = createRun(project, ['cabinet-1']);
    expect(runEnds(context, run)).toEqual({ left: 'open', right: 'open' });
    run.placement = { wall: 'back', along: len('0"') };
    // Without a room, the stored ends.
    expect(runEnds(context, run)).toEqual({ left: 'open', right: 'open' });
    context.room = starterRoom();
    expect(runEnds(context, run)).toEqual({ left: 'wall', right: 'open' });
    run.placement = { wall: 'left', along: { mm: W - 609.6, unit: 'in' } };
    expect(runEnds(context, run)).toEqual({ left: 'open', right: 'wall' });
    // Its cabinet's side against the wall is hidden.
    expect(cabinetsOf(project)[0]!.sides).toEqual({ left: 'exposed', right: 'hidden' });
  });
});

/** Milestone 6: wall over base. */
describe('wall cabinets over base cabinets', () => {
  const room = starterRoom();
  const base = (id: string, runId?: string) => ({ id, width: 600, back: 560, runId, name: id, form: 'base' as const, bottom: 0, top: 876 });

  it('a wall run lined up with a floor run stands over it, and moves with it', () => {
    const cabinets = [base('a', 'floor'), base('b', 'floor'), { id: 'w', width: 760, back: 300, runId: 'up', form: 'wall' as const, offFloor: 1372 }];
    const placements = new Map([['floor', { wall: 'left', along: len('30"') } as const]]);
    const places = layOutCabinets(room, cabinets, placements, new Map([['up', 'floor']]));
    expect(places.get('w')!.turn).toBe(90);
    expect(places.get('w')!.at[2]).toBeCloseTo(places.get('a')!.at[2], 6);
    expect(places.get('w')!.at[1]).toBe(1372);
  });

  it('warns of runs in the same place, past a wall, and a tall cabinet up into a wall run', () => {
    const tall = { ...base('t'), form: 'tall' as const, top: 2134 };
    const cabinets = [base('a'), tall, { id: 'w', width: 1500, back: 300, form: 'wall' as const, offFloor: 1372, name: 'w', bottom: 1372, top: 2134 }, { ...base('z'), width: 2600 }];
    const groups = placeGroups(cabinets, new Map());
    expect(layoutProblems(room, groups, cabinets, (k) => k)).toEqual(['cabinet:z runs past the end of the back wall: it reaches 3800 mm along a wall 3658 mm long.', 't reaches up into cabinet:w on the back wall.']);
    // Two floor groups in the same place.
    const both = placeGroups([{ ...base('a'), placement: { wall: 'left' as const, along: len('0"') } }, { ...base('b'), placement: { wall: 'left' as const, along: len('10"') } }], new Map());
    expect(layoutProblems(room, both, [base('a'), base('b')], (k) => k)).toEqual(['cabinet:a and cabinet:b stand in the same place on the left wall.']);
  });
});
