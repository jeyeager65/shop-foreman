// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetShows, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, faceFinishes, insideFinishOf, projectShows, setInsideFinish, starterRoom } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { addWallCabinet, createBaseCabinetProject, createIslandProject, createKitchenProject, createShopCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Which faces of a part are finished. */
const shop = createStarterShop();
const shows = (project: Project) => {
  const parts = [...deriveCabinetParts(project, shop), ...deriveParts(project, shop), ...deriveDrawerBoxParts(project, shop)];
  const map = projectShows(project, parts);
  expect(map.size).toBe(parts.length);
  return (id: string) => {
    const found = map.get(id);
    if (!found) throw new Error(`No part ${id}: ${[...map.keys()].join(', ')}`);
    return found;
  };
};

describe('which faces show', () => {
  it('a face frame cabinet against a wall: its front and its exposed sides show, its inside is inside, the rest is hidden', () => {
    const project = createBaseCabinetProject('faceFrame');
    addWallCabinet(project, { name: 'Wall' });
    const of = shows(project);
    // A side: inside in, showing out (it is exposed), its front edge behind the frame.
    expect(of('cabinet-1/side-left')).toEqual({ A: 'inside', B: 'shows', edges: 'hidden' });
    // The back's rear face is against the wall.
    expect(of('cabinet-1/back')).toEqual({ A: 'inside', B: 'hidden', edges: 'hidden' });
    // The face frame: its front and its edges, not its back.
    expect(of('cabinet-1/frame-stile-left')).toEqual({ A: 'shows', B: 'hidden', edges: 'shows' });
    expect(of('cabinet-1/frame-rail-top')).toEqual({ A: 'shows', B: 'hidden', edges: 'shows' });
    for (const id of ['cabinet-1/stretcher-back', 'drawer-1/strip-left', 'cabinet-2/hanging-rail-top']) expect(of(id), id).toEqual({ A: 'hidden', B: 'hidden', edges: 'hidden' });
    // The front stretcher: its underside is seen with the drawer out; behind a face frame its edge is covered.
    expect(of('cabinet-1/stretcher-front')).toEqual({ A: 'hidden', B: 'inside', edges: 'hidden' });
    // A base cabinet's bottom is seen from above only; a wall cabinet's from below too.
    expect(of('cabinet-1/bottom')).toMatchObject({ A: 'inside', B: 'hidden' });
    expect(of('cabinet-2/bottom')).toMatchObject({ A: 'inside', B: 'shows' });
    // A wall cabinet's top: its underside is its inside.
    expect(of('cabinet-2/top')).toMatchObject({ A: 'hidden', B: 'inside' });
    expect(of('cabinet-1/toe-kick')).toMatchObject({ A: 'shows', B: 'hidden' });
    expect(of('cabinet-1/shelf-1')).toEqual({ A: 'inside', B: 'inside', edges: 'inside' });
    // Doors and drawer fronts all round; a drawer box behind its front is inside.
    expect(of('doors-1/door-left')).toEqual({ A: 'shows', B: 'shows', edges: 'shows' });
    expect(of('drawer-1/front')).toEqual({ A: 'shows', B: 'shows', edges: 'shows' });
    for (const id of ['drawer-1/box-side-left', 'drawer-1/box-front', 'drawer-1/box-bottom']) expect(of(id), id).toEqual({ A: 'inside', B: 'inside', edges: 'inside' });
  });

  it("without a face frame the case's front edges show, and a shop drawer's box front is its front", () => {
    expect(shows(createBaseCabinetProject('frameless'))('cabinet-1/side-left').edges).toBe('shows');
    // The front stretcher's front edge is in the case's front, over the top drawer.
    expect(shows(createBaseCabinetProject('frameless'))('cabinet-1/stretcher-front')).toEqual({ A: 'hidden', B: 'inside', edges: 'shows' });
    const shopStyle = createShopCabinetProject();
    const front = shows(shopStyle)('drawer-1/box-front');
    expect(front).toEqual({ A: 'inside', B: 'shows', edges: 'shows' });
  });

  it('a side against a neighbour or a wall is hidden', () => {
    const kitchen = createKitchenProject();
    const of = shows(kitchen);
    const cabinets = cabinetsOf(kitchen);
    const hidden = cabinets.filter((c) => !c.existing && (c.sides.left === 'hidden' || c.sides.right === 'hidden'));
    expect(hidden.length).toBeGreaterThan(2);
    for (const c of hidden) {
      const standing = cabinetShows(kitchen, c);
      expect(standing.sides).toEqual({ left: c.sides.left === 'exposed', right: c.sides.right === 'exposed' });
      if (c.corner) continue;
      expect(of(`${c.id}/side-left`).B, c.name).toBe(c.sides.left === 'exposed' ? 'shows' : 'hidden');
      expect(of(`${c.id}/side-right`).B, c.name).toBe(c.sides.right === 'exposed' ? 'shows' : 'hidden');
      // Against a wall, every back is hidden.
      expect(of(`${c.id}/back`).B, c.name).toBe('hidden');
    }
  });

  it('a back shows where the cabinet stands free, and not where two rows of an island stand back to back', () => {
    const project = createBaseCabinetProject('frameless');
    project.context.room = starterRoom();
    expect(shows(project)('cabinet-1/back').B).toBe('hidden');
    project.context.pieces[0]!.placement = { wall: 'free', x: len('60"'), y: len('48"'), turn: 180 };
    expect(cabinetShows(project, cabinetsOf(project)[0]!).backShows).toBe(true);
    expect(shows(project)('cabinet-1/back')).toEqual({ A: 'inside', B: 'shows', edges: 'hidden' });

    const island = createIslandProject();
    expect(island.context.islands?.[0]?.rows.length).toBe(2);
    const of = shows(island);
    for (const c of cabinetsOf(island)) expect(of(`${c.id}/back`).B, c.name).toBe('hidden');
    // One row alone: its back is to the room.
    island.context.islands![0]!.rows = [island.context.islands![0]!.rows[0]!];
    const row = island.context.runs.find((r) => r.id === island.context.islands![0]!.rows[0])!;
    const again = shows(island);
    for (const id of row.cabinetIds) expect(again(`${id}/back`).B, id).toBe('shows');
  });

  it('a cabinet with nothing hung on it is open: its inside shows', () => {
    const project = createBaseCabinetProject('frameless');
    project.designObjects = [];
    expect(cabinetShows(project, cabinetsOf(project)[0]!).open).toBe(true);
    const of = shows(project);
    expect(of('cabinet-1/side-left').A).toBe('shows');
    expect(of('cabinet-1/shelf-1')).toEqual({ A: 'shows', B: 'shows', edges: 'shows' });
    expect(of('cabinet-1/back').A).toBe('shows');
    // What is never seen is still hidden.
    expect(of('cabinet-1/stretcher-back').A).toBe('hidden');
  });
});

/** What each face is finished in: the inside's answer, the drawer boxes', a cabinet's own. */
describe('what each face is finished in', () => {
  const finishes = (project: Project) => faceFinishes(project, [...deriveCabinetParts(project, shop), ...deriveParts(project, shop), ...deriveDrawerBoxParts(project, shop)]);

  it('with nothing said, only what shows is finished', () => {
    const project = createBaseCabinetProject('frameless');
    const f = finishes(project);
    expect(f['cabinet-1/side-left']).toEqual({ A: 'none', B: 'shown', edges: 'shown' });
    expect(f['cabinet-1/back']).toEqual({ A: 'none', B: 'none', edges: 'none' });
    expect(f['cabinet-1/shelf-1']).toEqual({ A: 'none', B: 'none', edges: 'none' });
    expect(f['drawer-1/box-side-left']).toEqual({ A: 'none', B: 'none', edges: 'none' });
    expect(f['doors-1/door-left']).toEqual({ A: 'shown', B: 'shown', edges: 'shown' });
  });

  it("the inside takes the project's answer, the drawer boxes theirs, and a cabinet its own", () => {
    const project = createBaseCabinetProject('frameless');
    addWallCabinet(project, { name: 'Wall' });
    setInsideFinish(project, 'inside', 'clear');
    setInsideFinish(project, 'boxes', 'case');
    expect(project.settings.finish).toEqual({ inside: 'clear', boxes: 'case' });
    let f = finishes(project);
    expect(f['cabinet-1/side-left']).toEqual({ A: 'clear', B: 'shown', edges: 'shown' });
    expect(f['cabinet-1/shelf-1']).toEqual({ A: 'clear', B: 'clear', edges: 'clear' });
    // The rear of the back and the stretchers are never seen, whatever the inside gets.
    expect(f['cabinet-1/back']).toEqual({ A: 'clear', B: 'none', edges: 'none' });
    expect(f['cabinet-1/stretcher-back']).toEqual({ A: 'none', B: 'none', edges: 'none' });
    expect(f['drawer-1/box-side-left']).toEqual({ A: 'case', B: 'case', edges: 'case' });

    // The wall cabinet alone is painted inside; prefinished is nothing to do.
    (project.context as CasesContext).pieces[1]!.insideFinish = 'case';
    setInsideFinish(project, 'inside', 'prefinished');
    expect(insideFinishOf(project, cabinetsOf(project)[1])).toBe('case');
    expect(insideFinishOf(project, cabinetsOf(project)[0])).toBe('prefinished');
    f = finishes(project);
    expect(f['cabinet-2/side-left']!.A).toBe('case');
    expect(f['cabinet-1/side-left']!.A).toBe('none');

    // Bare is the answer left out.
    setInsideFinish(project, 'inside', 'bare');
    setInsideFinish(project, 'boxes', 'bare');
    expect(project.settings.finish).toBeUndefined();
  });
});
