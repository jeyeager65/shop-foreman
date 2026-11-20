// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetPlaces, cabinetsOf, deriveCabinetParts, inRoom, partBox } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CasesContext } from '@/model';
import { createIslandProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Milestone 8: islands. */
const shop = createStarterShop();

describe('an island', () => {
  it('stands its two rows back to back, the second turned round, centred on the first', () => {
    const project = createIslandProject();
    const places = cabinetPlaces(project)!;
    const cabinets = cabinetsOf(project);
    const front = cabinets.filter((c) => c.name.startsWith('Drawer'));
    const back = cabinets.filter((c) => c.name.startsWith('Doors'));
    expect(front.every((c) => places.get(c.id)!.turn === 0)).toBe(true);
    expect(back.every((c) => places.get(c.id)!.turn === 180)).toBe(true);
    // Every cabinet's back is on the island's middle line, 72" out from the back wall.
    for (const c of [...front, ...back]) {
      const p = places.get(c.id)!;
      const backLeft = inRoom(p.at, p.turn, [0, 0, -c.size.depth.mm]);
      expect(backLeft[2]).toBeCloseTo(len('72"').mm, 6);
    }
    // The back row spans the same 78" as the front row.
    const xs = (list: typeof front) => list.flatMap((c) => [0, c.size.width.mm].map((x) => inRoom(places.get(c.id)!.at, places.get(c.id)!.turn, [x, 0, 0])[0]));
    expect(Math.min(...xs(back))).toBeCloseTo(Math.min(...xs(front)), 6);
    expect(Math.max(...xs(back))).toBeCloseTo(Math.max(...xs(front)), 6);
  });

  it("every cabinet side at an island's ends shows", () => {
    const cabinets = cabinetsOf(createIslandProject());
    expect(cabinets[0]!.sides.left).toBe('exposed');
    expect(cabinets[2]!.sides.right).toBe('exposed');
    expect(cabinets[1]!.sides).toEqual({ left: 'hidden', right: 'hidden' });
  });

  it('a one-row island gets a finished back over its cabinets, as long as the row', () => {
    const project = createIslandProject();
    const context = project.context as CasesContext;
    expect(deriveCabinetParts(project, shop).some((p) => p.name === 'Finished back')).toBe(false);
    context.islands![0]!.rows = [context.islands![0]!.rows[0]!];
    const back = deriveCabinetParts(project, shop).find((p) => p.name === 'Finished back')!;
    expect(back.size.width).toBeCloseTo(len('78"').mm, 6);
    // Behind the case.
    expect(partBox(back).max[2]).toBeCloseTo(-len('22-1/2"').mm, 6);
  });
});

/** Milestone 8: a slab top on an island. */
describe("an island's top", () => {
  it('covers both rows and overhangs all round, its back edge stripped like its front, no backsplash', async () => {
    const { topPieces, topSettingsOf } = await import('@/design');
    const project = createIslandProject();
    const context = project.context as CasesContext;
    context.islands![0]!.top = {};
    const [piece, ...more] = topPieces(project, shop.materials);
    expect(more).toEqual([]);
    const over = topSettingsOf(context).overhang;
    expect(piece!.x1 - piece!.x0).toBeCloseTo(len('78"').mm + 2 * over.openEnd.mm, 6);
    // Inset fronts: the fronts are the cases' fronts; 22-1/2" a row, and the overhang at front and back.
    expect(piece!.zFront - piece!.zBack).toBeCloseTo(2 * len('22-1/2"').mm + 2 * over.front.mm, 6);
    const names = deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'topEdge').map((p) => p.name);
    expect(names).toEqual(['Countertop', 'Countertop edge, front', 'Countertop edge, back', 'Countertop edge, left end', 'Countertop edge, right end']);
  });
});
