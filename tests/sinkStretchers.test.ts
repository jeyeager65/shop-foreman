// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SINK_STRETCHER_WIDTH, STRETCHER_WIDTH, cabinetsOf, deriveCabinetParts, obstacleBlocks, sinkBowlBlock, sinkProblems, stretcherRoom } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { kitchenSink } from '@/samples/cabinet';
import { starterById } from '@/samples/starters';
import { len } from '@/units';

/** Over a sink the top stretchers are narrower, and the sink's bowl hangs between them; their widths are settings. */
const shop = createStarterShop();
const words = (mm: number) => `${Math.round((mm / 25.4) * 100) / 100}"`;
const vanity = (): Project => {
  const project = createBaseCabinetProject();
  starterById('vanity')!.shape!(project, cabinetsOf(project)[0]!, shop as never);
  return project;
};
const frontStretcher = (p: Project) => deriveCabinetParts(p, shop).find((part) => part.id.endsWith('/stretcher-front'))!;

describe('the top stretchers over a sink', () => {
  it('are 2-1/2" where there is a sink, 4" where there is none', () => {
    expect(frontStretcher(vanity()).size.height).toBeCloseTo(SINK_STRETCHER_WIDTH, 0);
    expect(frontStretcher(createBaseCabinetProject()).size.height).toBeCloseTo(STRETCHER_WIDTH, 0);
  });

  it('have the vanity\'s bowl between them, and its trap under the bowl', () => {
    const p = vanity();
    const cabinet = cabinetsOf(p)[0]!;
    const room = stretcherRoom(cabinet)!;
    const bowl = sinkBowlBlock(cabinet)!;
    expect(bowl.max[2]).toBeLessThanOrEqual(room.front + 0.01);
    expect(bowl.min[2]).toBeGreaterThanOrEqual(room.back - 0.01);
    expect(sinkProblems(p, cabinet, shop.materials, words)).toEqual([]);
    const trap = obstacleBlocks(cabinet, shop.materials).find((b) => b.kind === 'trap')!;
    expect(trap.max[1]).toBeLessThanOrEqual(bowl.min[1] + 0.01);
  });

  it('take a kitchen\'s drop-in in a 24" cabinet', () => {
    const p = createBaseCabinetProject('frameless', 'doors');
    const stored = (p.context as CasesContext).pieces[0]!;
    stored.size.width = len('36"');
    stored.size.depth = len('24"');
    stored.top = {};
    stored.sink = kitchenSink();
    expect(sinkProblems(p, cabinetsOf(p)[0]!, shop.materials, words).filter((w) => /stretchers/.test(w))).toEqual([]);
  });

  it('are as wide as the joinery says, and a bowl too deep for them is warned of', () => {
    const p = vanity();
    const context = p.context as CasesContext;
    // (This case's back stretcher stands on edge: 7" at the front leaves the bowl too little room.)
    context.settings.joinery.stretchers = { underSink: len('7"') };
    expect(frontStretcher(p).size.height).toBeCloseTo(len('7"').mm, 0);
    expect(sinkProblems(p, cabinetsOf(p)[0]!, shop.materials, words).some((w) => /between the top stretchers/.test(w))).toBe(true);
  });
});
