// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CROSS_STRETCHER_WIDTH, STRETCHER_WIDTH, TOP_CORNER_BLOCK, cabinetsOf, deriveCabinetParts, partBox } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { createStarterShop } from '@/libraries';
import type { CasesContext, StoredCabinet } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** More under a base cabinet's top (for a vanity top): corner blocks and cross stretchers. */
const shop = createStarterShop();
const vanity = (support: StoredCabinet['topSupport'], change?: (c: StoredCabinet) => void) => {
  const project = createBaseCabinetProject('faceFrame', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.topSupport = support;
  change?.(stored);
  return project;
};
const added = (project: ReturnType<typeof vanity>) => deriveCabinetParts(project, shop).filter((p) => /\/(corner-block|cross-stretcher)-/.test(p.id));

describe('more under the top of a base cabinet', () => {
  it('has none until it is asked for', () => {
    expect(added(vanity(undefined))).toEqual([]);
  });

  it('corner blocks: a triangle in each top corner, flush with the top, inside the case and clear of the stretchers', () => {
    const project = vanity({ cornerBlocks: true });
    const cabinet = cabinetsOf(project)[0]!;
    const parts = deriveCabinetParts(project, shop);
    const blocks = added(project);
    expect(blocks.map((p) => p.name)).toEqual(['Corner block, front left', 'Corner block, front right', 'Corner block, back left', 'Corner block, back right']);
    const sides = ['Left side', 'Right side'].map((name) => partBox(parts.find((p) => p.name === name)!));
    const [front, back] = ['Front stretcher', 'Back stretcher'].map((name) => partBox(parts.find((p) => p.name === name)!));
    for (const p of blocks) {
      const outline = (p.features.find((f) => f.kind === 'cutout') as { outline: { x: number; y: number }[] }).outline;
      expect(outline).toHaveLength(3);
      // Counter-clockwise, as every outline is.
      expect(outline.reduce((sum, a, i) => sum + a.x * outline[(i + 1) % 3]!.y - outline[(i + 1) % 3]!.x * a.y, 0)).toBeCloseTo(TOP_CORNER_BLOCK ** 2, 6);
      expect(p.shaped).toBe(true);
      const box = partBox(p);
      expect(box.max[1]).toBeCloseTo(cabinet.size.height.mm, 6);
      expect(box.min[0]).toBeGreaterThanOrEqual(sides[0]!.max[0]! - 1e-6);
      expect(box.max[0]).toBeLessThanOrEqual(sides[1]!.min[0]! + 1e-6);
      // Behind the front stretcher and in front of the back one.
      expect(box.max[2]).toBeLessThanOrEqual(front!.min[2]! + 1e-6);
      expect(box.min[2]).toBeGreaterThanOrEqual(back!.max[2]! - 1e-6);
    }
    // Two touch the left side and two the right; two the front stretcher and two the back one.
    expect(blocks.filter((p) => Math.abs(partBox(p).min[0]! - sides[0]!.max[0]!) < 1e-6)).toHaveLength(2);
    expect(blocks.filter((p) => Math.abs(partBox(p).max[2]! - front!.min[2]!) < 1e-6)).toHaveLength(2);
    expect(blocks.filter((p) => Math.abs(partBox(p).min[2]! - back!.max[2]!) < 1e-6)).toHaveLength(2);
  });

  it('cross stretchers: two strips from the front stretcher to the back one, the asked width clear between them, centred', () => {
    for (const form of ['flat', 'nailer'] as const) {
      const project = vanity({ crossStretchers: { apart: len('20"') } }, (c) => {
        c.size.width = len('36"');
      });
      const cabinet = cabinetsOf(project)[0]!;
      cabinet.joinery.backStretcherForm = form;
      const parts = deriveCabinetParts(project, shop);
      const [left, right] = added(project).map(partBox);
      expect(added(project).map((p) => p.name)).toEqual(['Cross stretcher, left', 'Cross stretcher, right']);
      expect(right!.min[0]! - left!.max[0]!).toBeCloseTo(len('20"').mm, 6);
      expect((left!.max[0]! + right!.min[0]!) / 2).toBeCloseTo(cabinet.size.width.mm / 2, 6);
      expect(left!.max[0]! - left!.min[0]!).toBeCloseTo(CROSS_STRETCHER_WIDTH, 6);
      expect(left!.max[2]).toBeCloseTo(-STRETCHER_WIDTH, 6);
      expect(left!.min[2]).toBeCloseTo(partBox(parts.find((p) => p.name === 'Back stretcher')!).max[2]!, 6);
      expect(left!.max[1]).toBeCloseTo(cabinet.size.height.mm, 6);
    }
  });

  it('says so when the cross stretchers are too far apart for the case, or run into the corner blocks', () => {
    const wide = vanity({ crossStretchers: { apart: len('40"') } });
    expect(() => deriveCabinetParts(wide, shop)).toThrow(/no room for the cross stretchers/);
    const both = vanity({ cornerBlocks: true, crossStretchers: { apart: len('14"') } }, (c) => {
      c.size.width = len('30"');
    });
    expect(added(both)).toHaveLength(6);
    const tight = vanity({ cornerBlocks: true, crossStretchers: { apart: len('20"') } }, (c) => {
      c.size.width = len('30"');
    });
    expect(() => deriveCabinetParts(tight, shop)).toThrow(/no room for the cross stretchers/);
  });

  it('a wall cabinet, with its top panel, takes none', () => {
    const project = vanity({ cornerBlocks: true, crossStretchers: { apart: len('10"') } }, (c) => {
      c.form = 'wall';
    });
    expect(added(project)).toEqual([]);
  });

  it('are cut with the job and named in the build checklist', () => {
    const project = vanity({ cornerBlocks: true, crossStretchers: { apart: len('14"') } }, (c) => {
      c.size.width = len('30"');
    });
    const job = buildJob(project, shop);
    expect(job.cabinetParts.filter((p) => /corner-block|cross-stretcher/.test(p.id))).toHaveLength(6);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools).join('\n');
    expect(text).toContain('a corner block in each top corner');
    expect(text).toContain('the two cross stretchers');
  });
});
