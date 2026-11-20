import { describe, expect, it } from 'vitest';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';

/** Every X and Y word of the cutting and rapid moves. */
function reach(gcode: string) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const line of gcode.split('\n')) {
    if (!/^G[0123] /.test(line)) continue;
    const x = /X(-?[\d.]+)/.exec(line);
    const y = /Y(-?[\d.]+)/.exec(line);
    if (x) xs.push(Number(x[1]));
    if (y) ys.push(Number(y[1]));
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('doors one behind the other', () => {
  const project = createVanityProject();
  project.plan.blank.stock = { width: len('14"'), height: len('60"') };
  const job = buildJob(project, createStarterShop());

  it('still makes both setups, with every move on the blank', () => {
    const [blank] = job.plan.blanks;
    expect(job.plan.blanks).toHaveLength(1);
    expect(blank!.arrangement).toBe('column');
    expect(job.files).toHaveLength(2);
    for (const file of job.files) {
      const r = reach(file.text);
      expect(r.minX).toBeGreaterThanOrEqual(0);
      expect(r.minY).toBeGreaterThanOrEqual(0);
      expect(r.maxX).toBeLessThanOrEqual(blank!.size.width);
      expect(r.maxY).toBeLessThanOrEqual(blank!.size.height);
      // Both doors are cut: the moves span most of the blank's depth
      expect(r.maxY - r.minY).toBeGreaterThan(2 * 600);
    }
  });

  it('takes the same machine time as side by side, give or take the travel', () => {
    const row = buildJob(createVanityProject(), createStarterShop());
    expect(job.plan.summary.machineSeconds / row.plan.summary.machineSeconds).toBeCloseTo(1, 1);
    expect(job.plan.summary.toolChanges).toBe(row.plan.summary.toolChanges);
  });
});
