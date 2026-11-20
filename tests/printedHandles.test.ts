// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PRINT_WALL, designsOf, doorHandleChoice, fasteningHole, footWidth, handleHeight, handleLook, isHandle, knobProfile, printedHandleProblems, pullProfile } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { buildPrintedHandle, buildPrintedHandleObjects, printedHandlesFileName, printedHandlesOf } from '@/jigs/printedHandles';
import { modelXml } from '@/jigs/threemf';
import { STARTER_PRINTED_HANDLES, createStarterShop } from '@/libraries';
import type { Handle, Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Handles printed here: parametric, held by heat-set inserts or by screws into the plastic. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();
const printed = (id: string): Handle => structuredClone(shop.hardware.filter(isHandle).find((h) => h.id === id)!);
const [bar, arch, knob] = [printed('printed-bar-96'), printed('printed-arch-96'), printed('printed-knob')];
const withHandle = (project: Project, handleId: string): Project => {
  for (const d of designsOf(project)) {
    if (d.template === 'drawer') d.handle = { handleId };
    else d.handle = doorHandleChoice(handleId);
  }
  return project;
};
/** Twice the signed area: positive for a counter-clockwise polygon. */
const turn = (points: [number, number][]) => points.reduce((sum, [x, y], i) => sum + x * points[(i + 1) % points.length]![1] - points[(i + 1) % points.length]![0] * y, 0);
const bounds = (positions: Float32Array) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return { min, max };
};

describe('the printed handles in the library', () => {
  it('are a bar pull, an arch pull and a knob, on the same holes as a bought one, held by heat-set inserts', () => {
    expect(STARTER_PRINTED_HANDLES.map((h) => [h.printed!.design, h.holes, h.spacing, h.hole.diameter, h.printed!.fastening, h.generic])).toEqual([
      ['bar', 2, 96, 5, 'heatSetInsert', false],
      ['arch', 2, 96, 5, 'heatSetInsert', false],
      ['knob', 1, 0, 5, 'heatSetInsert', false],
    ]);
    // Placeholders, and makeable as they come.
    expect(STARTER_PRINTED_HANDLES.every((h) => h.tuneMe.includes('printed') && printedHandleProblems(h).length === 0)).toBe(true);
    // Each has its own sizes: changing one does not change another.
    expect(STARTER_PRINTED_HANDLES[0]!.printed!.insert).not.toBe(STARTER_PRINTED_HANDLES[1]!.printed!.insert);
  });
});

describe('a printed handle\'s shape', () => {
  it('a bar is a bar on two legs over the holes, each leg wide enough for its insert', () => {
    const profile = pullProfile(bar);
    expect(turn(profile)).toBeGreaterThan(0);
    const xs = profile.map(([x]) => x);
    const ys = profile.map(([, y]) => y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-64, 64]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, handleHeight(bar)]);
    const foot = footWidth(bar);
    expect(foot).toBeCloseTo(fasteningHole(bar.printed!).diameter + 2 * PRINT_WALL.round, 6);
    // On the front (y = 0) it stands only on its feet, centred on the holes.
    const onFront = profile.filter(([, y]) => y === 0).map(([x]) => x).sort((a, b) => a - b);
    expect(onFront).toEqual([-48 - foot / 2, -48 + foot / 2, 48 - foot / 2, 48 + foot / 2]);
  });

  it('follows its sizes: another spacing, a longer bar, a plain screw', () => {
    const wide: Handle = { ...bar, spacing: 128, look: { ...bar.look, length: 100 } };
    // A bar is never shorter than its feet stand.
    expect(handleLook(wide).length).toBeCloseTo(128 + footWidth(wide), 6);
    expect(Math.max(...pullProfile(wide).map(([x]) => x))).toBeCloseTo(64 + footWidth(wide) / 2, 6);
    const screwed: Handle = { ...bar, printed: { ...bar.printed!, fastening: 'screw' } };
    expect(fasteningHole(screwed.printed!)).toEqual(bar.printed!.pilot);
    // The screw's hole is smaller than the insert's, so the foot is as wide as the bar is thick.
    expect(footWidth(screwed)).toBe(bar.look.thickness);
  });

  it('an arch is one curve from foot to foot, and spans them whatever length it is given', () => {
    const profile = pullProfile(arch);
    expect(turn(profile)).toBeGreaterThan(0);
    const half = handleLook(arch).length / 2;
    expect(half).toBeCloseTo(48 + footWidth(arch), 6);
    expect(Math.max(...profile.map(([x]) => x))).toBeCloseTo(half, 6);
    expect(Math.max(...profile.map(([, y]) => y))).toBeCloseTo(handleHeight(arch), 6);
    expect(handleLook({ ...arch, look: { ...arch.look, length: 500 } }).length).toBeCloseTo(2 * half, 6);
  });

  it('a knob flares to its head no steeper than 45 degrees, so it prints head down without supports', () => {
    const profile = knobProfile(knob);
    expect(profile[0]).toEqual([0, 0]);
    expect(profile.at(-1)).toEqual([0, handleHeight(knob)]);
    expect(Math.max(...profile.map(([r]) => r))).toBe(knob.look.length / 2);
    for (let i = 1; i < profile.length; i++) {
      const [dr, dz] = [profile[i]![0] - profile[i - 1]![0], profile[i]![1] - profile[i - 1]![1]];
      // Going out, it rises at least as far (the foot's flat underside sits on the front).
      if (dr > 0 && profile[i - 1]![1] > 0) expect(dz).toBeGreaterThanOrEqual(dr - 1e-9);
    }
  });

  it('says what is wrong with sizes that cannot be made', () => {
    expect(printedHandleProblems({ ...bar, look: { ...bar.look, projection: 2, thickness: 4 } }).join(' ')).toMatch(/not tall enough for its insert/);
    expect(printedHandleProblems({ ...bar, printed: { ...bar.printed!, width: 6 } }).join(' ')).toMatch(/too narrow for its insert/);
    expect(printedHandleProblems({ ...bar, spacing: 20 }).join(' ')).toMatch(/too close together/);
    expect(printedHandleProblems({ ...knob, look: { ...knob.look, projection: 2, thickness: 3 } }).join(' ')).toMatch(/not tall enough/);
    // A bought handle has nothing to check.
    expect(printedHandleProblems(shop.hardware.filter(isHandle)[0]!)).toEqual([]);
  });
});

describe('the printed handles as solids', () => {
  it('a pull lies on its side, as long as it is and as high as it is wide, with a hole in each foot', async () => {
    for (const handle of [bar, arch]) {
      const { mesh, size } = await buildPrintedHandle(handle);
      const { min, max } = bounds(mesh.positions);
      expect(min.map((v) => +v.toFixed(3))).toEqual([0, 0, 0]);
      expect(max[0]).toBeCloseTo(handleLook(handle).length, 3);
      expect(max[1]).toBeCloseTo(handleHeight(handle), 3);
      expect(max[2]).toBeCloseTo(handle.printed!.width, 3);
      expect(size).toEqual({ x: handleLook(handle).length, y: handleHeight(handle) });
      // The solid less its two holes: an insert's hole takes more than a screw's.
      const screwed = await buildPrintedHandle({ ...handle, printed: { ...handle.printed!, fastening: 'screw' } });
      const hole = fasteningHole(handle.printed!);
      const drilled = 2 * Math.PI * (hole.diameter / 2) ** 2 * hole.depth;
      const solid = Math.abs(turn(pullProfile(handle)) / 2) * handle.printed!.width;
      expect(mesh.volume).toBeGreaterThan(solid - drilled * 1.02);
      expect(mesh.volume).toBeLessThan(solid - drilled * 0.9);
      expect(screwed.mesh.volume).toBeGreaterThan(0);
    }
  });

  it('a knob stands head down, its hole on top', async () => {
    const { mesh, size } = await buildPrintedHandle(knob);
    const { min, max } = bounds(mesh.positions);
    expect(min.map((v) => +v.toFixed(2))).toEqual([0, 0, 0]);
    expect(max.map((v) => +v.toFixed(2))).toEqual([knob.look.length, knob.look.length, handleHeight(knob)]);
    expect(size).toEqual({ x: 32, y: 32 });
    // The head is on the bed: the widest part is at the bottom.
    const p = mesh.positions;
    let widestZ = Infinity;
    for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i]! - 16, p[i + 1]! - 16) > 15.5) widestZ = Math.min(widestZ, p[i + 2]!);
    expect(widestZ).toBeLessThan(2);
  });

  it('sizes that cannot be made are refused, by name', async () => {
    await expect(buildPrintedHandle({ ...bar, printed: { ...bar.printed!, width: 6 } })).rejects.toThrow(/Printed bar pull.*too narrow/);
    await expect(buildPrintedHandle(shop.hardware.filter(isHandle)[0]!)).rejects.toThrow(/not a printed handle/);
  });
});

describe('the job\'s printed handles', () => {
  it('one for every front that has it, every copy counted; bought handles and no handles give none', () => {
    const count = (project: Project) => {
      const job = buildJob(project, shop);
      return printedHandlesOf([...job.parts, ...job.cabinetParts], shop.hardware).map((h) => [h.handle.id, h.quantity]);
    };
    expect(count(withHandle(createBaseCabinetProject('frameless'), 'printed-bar-96'))).toEqual([['printed-bar-96', 3]]);
    expect(count(withHandle(createShopCabinetProject(), 'printed-knob'))).toEqual([['printed-knob', 3]]);
    expect(count(withHandle(createBaseCabinetProject('frameless'), 'generic-pull-96'))).toEqual([]);
    expect(count(createBaseCabinetProject('frameless'))).toEqual([]);
    const twice = withHandle(createShopCabinetProject(), 'printed-arch-96');
    (twice.context as { pieces: { quantity: number }[] }).pieces[0]!.quantity = 2;
    expect(count(twice)).toEqual([['printed-arch-96', 6]]);
  });

  it('go in one 3MF file, each copy on the bed and none on another', async () => {
    const objects = await buildPrintedHandleObjects([
      { handle: bar, quantity: 6 },
      { handle: knob, quantity: 2 },
    ]);
    expect(objects.map((o) => [o.name, o.placements.length])).toEqual([
      ['Printed bar pull, 96 mm centres', 6],
      ['Printed knob', 2],
    ]);
    // Four to a row; the knobs start under the bars' second row.
    expect(objects[0]!.placements[4]).toEqual({ x: 0, y: handleHeight(bar) + 8 });
    expect(objects[1]!.placements[0]!.y).toBe(2 * (handleHeight(bar) + 8));
    const xml = modelXml(objects);
    expect(xml.match(/<item /g)).toHaveLength(8);
    expect(xml).toContain('unit="millimeter"');
    expect(printedHandlesFileName('kitchen')).toBe('kitchen-handles.3mf');
  });

  it('the hardware list has their inserts and screws', () => {
    const hardware = (project: Project, edit?: (h: Handle) => void) => {
      const own = createStarterShop();
      if (edit) own.hardware.filter(isHandle).forEach(edit);
      return buildLists(buildJob(project, own), project, own, L).hardware.filter((h) => h.group === 'Printed handles');
    };
    const rows = hardware(withHandle(createBaseCabinetProject('frameless'), 'printed-bar-96'));
    expect(rows.map((h) => [h.item, h.quantity])).toEqual([
      ['M4 heat-set inserts', 6],
      ['M4 machine screws', 6],
    ]);
    const screwed = hardware(withHandle(createBaseCabinetProject('frameless'), 'printed-bar-96'), (h) => {
      if (h.printed) h.printed.fastening = 'screw';
    });
    expect(screwed.map((h) => [h.item, h.quantity])).toEqual([['M4 screws', 6]]);
    expect(hardware(withHandle(createBaseCabinetProject('frameless'), 'generic-pull-96'))).toEqual([]);
  });
});
