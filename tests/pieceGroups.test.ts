// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf } from '@/design';
import { pieceGroups } from '@/design/pieceGroups';
import type { CasesContext } from '@/model';
import { createBaseCabinetProject, createCommonKitchenProject, createShopReferenceProject } from '@/samples/cabinet';

/** Design's picker: the cabinets grouped by where they stand. */
describe('the cabinets by where they stand', () => {
  it('in a room: each wall, base then uppers, in the order they stand; then the island', () => {
    const project = createCommonKitchenProject();
    const name = new Map(cabinetsOf(project).map((c) => [c.id, c.name]));
    const groups = pieceGroups(project).map((g) => [g.name, g.ids.map((id) => name.get(id))]);
    expect(groups.map((g) => g[0])).toEqual(['Back wall, base', 'Back wall, uppers', 'Right wall, base', 'Right wall, uppers', 'Island']);
    // Every cabinet once.
    expect(groups.flatMap((g) => g[1] as string[]).sort()).toEqual([...name.values()].sort());
    // Along the back wall from its left end: by the fridge, by the range, then the corner.
    expect(groups[0]![1]).toEqual(['Drawers by the fridge', 'Drawers by the range', 'Blind corner']);
    expect((groups[1]![1] as string[])[0]).toBe('Over the fridge');
    expect(groups[4]![1]).toEqual(['Island drawers', 'Island doors']);
  });

  it('without a room: the runs in the order of the list, then the cabinets in none', () => {
    const project = createShopReferenceProject();
    delete (project.context as CasesContext).room;
    const groups = pieceGroups(project);
    expect(groups.map((g) => g.name)).toEqual(['Bench run', 'Wall run', 'On their own']);
    expect(groups.flatMap((g) => g.ids)).toHaveLength(cabinetsOf(project).length);
  });

  it('one cabinet, or several with no run and no room: one group with no name', () => {
    const project = createBaseCabinetProject('frameless');
    expect(pieceGroups(project)).toEqual([{ key: 'all', ids: [cabinetsOf(project)[0]!.id] }]);
  });
});
