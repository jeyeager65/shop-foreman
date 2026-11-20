// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applianceFootprint, applianceShapes, appliancesOf, inRoom, partBox, isApplianceShape, backAgainstWall, cabinetBack, cabinetIdOf, cabinetPlaces, cabinetsOf, deriveCabinetParts, shownTopParts, stainedWithoutGrain, topPieces } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import type { PlanWarning } from '@/model';
import { createHomeKitchenProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';

/** `?sample=home`: a home kitchen. */
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const inch = (mm: number) => Math.round((mm / 25.4) * 100) / 100;

describe('the home kitchen sample', () => {
  const project = createHomeKitchenProject();
  const job = buildJob(project, shop);
  const places = cabinetPlaces(project)!;
  const at = (name: string) => places.get(cabinetsOf(project).find((c) => c.name === name)!.id)!;

  it('plans as one job with nothing in the way', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.files.length).toBeGreaterThan(0);
  });

  it('has the fridge wall at the back, ending in a blind corner behind the window wall on the right', () => {
    const corner = at('Corner, fridge wall');
    expect([inch(corner.at[0]), corner.turn]).toEqual([54, 0]);
    expect(cabinetsOf(project).find((c) => c.name === 'Corner, fridge wall')!.corner).toMatchObject({ kind: 'blind', side: 'right' });
    // The window wall's run starts at the corner drawers, on the right wall facing into the room.
    for (const n of ['Drawers in the corner', 'Sink base', 'By the range']) expect(at(n).turn, n).toBe(270);
    // The upper corner is a diagonal cabinet, turned into the corner.
    expect(cabinetsOf(project).find((c) => c.name === 'Corner, upper')!.corner).toMatchObject({ kind: 'diagonal' });
    const over = cabinetsOf(project).find((c) => c.name === 'Over the fridge')!;
    expect(inch(over.offFloor!.mm + over.size.height.mm)).toBe(84);
  });

  it('runs the peninsula off the window wall beside the range: its corner box facing the dining side, the rest the kitchen', () => {
    expect(at('Peninsula corner (dining side)').turn).toBe(0);
    for (const n of ['Peninsula by the range', 'Peninsula end']) expect(at(n).turn % 360, n).toBe(180);
  });

  it('stands the peninsula cabinets in one line in the 3D view: a top or the finished back does not count as a cabinet\'s depth', () => {
    // What the whole-project view draws: the cut parts and the slabs of the bought tops.
    const drawn = [...deriveCabinetParts(project, { ...shop, materials: project.materials }), ...shownTopParts(project, project.materials, shop.hardware)];
    const of = cabinetIdOf(project);
    const backOf = (name: string) => {
      const id = cabinetsOf(project).find((c) => c.name === name)!.id;
      return cabinetBack(drawn.filter((p) => of(p.id) === id));
    };
    // The first carries the peninsula's top slab and finished back; its depth is its case's all the same.
    expect(backOf('Peninsula by the range')).toBeCloseTo(backOf('Peninsula end'), 6);
    const first = cabinetsOf(project).find((c) => c.name === 'Peninsula by the range')!;
    expect(drawn.some((p) => of(p.id) === first.id && p.id.endsWith('-shown'))).toBe(true);
    expect(drawn.some((p) => p.id === `${first.id}/island-back`)).toBe(true);
  });

  it('has its appliances: drawn as blocks where they stand, never made', () => {
    expect(appliancesOf(project).map((a) => a.kind)).toEqual(['refrigerator', 'dishwasher', 'range', 'microwave', 'sink']);
    const blocks = applianceShapes(project, project.materials[0]!.id);
    expect(blocks).toHaveLength(4);
    // The fridge against the fridge wall: its front 31" out, facing the room.
    expect(blocks[0]!.at.map(inch)).toEqual([18, 0, 31]);
    expect(blocks[0]!.turn).toBe(0);
    // The microwave hangs over the range, on the window wall.
    expect(inch(blocks[3]!.at[1])).toBe(55.5);
    expect(blocks[3]!.turn).toBe(270);
    expect([...job.cabinetParts, ...job.parts].some((p) => isApplianceShape(p.id))).toBe(false);
    expect(job.plan.blanks.some((b) => b.partIds.some(isApplianceShape))).toBe(false);
  });

  it('keeps its appliances through export and import', () => {
    const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
    expect(file.project).toEqual(project);
    expect(appliancesOf(file.project)).toHaveLength(5);
  });

  it('runs the window wall\'s top over the dishwasher to a joint, and stops tops at the range and the fridge', () => {
    const pieces = topPieces(project, project.materials);
    const of = (name: string) => pieces.find((p) => p.cabinetIds.includes(cabinetsOf(project).find((c) => c.name === name)!.id))!;
    const sink = of('Sink base');
    const byRange = of('By the range');
    // Over the dishwasher: the sink's top is its cabinets (18" + 36") and the dishwasher's 24" long past its start, to a joint.
    expect(sink.ends.right).toBe('joint');
    expect(inch(sink.x1)).toBe(78);
    expect(byRange.ends.left).toBe('joint');
    expect(byRange.x0).toBe(0);
    // At the range the top ends at its cabinet's side, with no overhang.
    expect(byRange.ends.right).toBe('tall');
    expect(inch(byRange.x1)).toBe(12);
    // And so does the fridge wall's, beside the fridge.
    const corner = of('Corner, fridge wall');
    expect(corner.ends.left).toBe('tall');
    expect(corner.x0).toBe(0);
  });

  it('has wood fronts, so their stain is a stain on wood', () => {
    expect(stainedWithoutGrain(project, shop)).toEqual([]);
    const mdf = createHomeKitchenProject();
    (mdf.context as { fronts: { doors: { materialId: string } } }).fronts.doors.materialId = 'mdf-3-4';
    expect(stainedWithoutGrain(mdf, shop)).toEqual(['fronts']);
  });

  it('puts one top over the peninsula and its corner box, stopping at the wall', () => {
    const pieces = topPieces(project, project.materials);
    const island = pieces.filter((p) => p.island);
    expect(island).toHaveLength(1);
    const corner = cabinetsOf(project).find((c) => c.name === 'Peninsula corner (dining side)')!;
    expect(island[0]!.island!.alsoOver).toContain(corner.id);
    // Its end at the window wall meets the wall, with no overhang into it.
    expect(Object.values(island[0]!.ends)).toContain('wall');
    // The corner box has no top of its own.
    expect(pieces.some((p) => p.cabinetIds.includes(corner.id))).toBe(false);
  });

  it('stands the peninsula off the range by its top\'s reach, with a filler board in the space', () => {
    // On the window wall, a z in the room is a distance from the fridge wall.
    const range = appliancesOf(project).find((a) => a.kind === 'range')!;
    const rangeSide = Math.max(...applianceFootprint(project, range)!.map(([, z]) => z));
    // The peninsula's top ends at the range's side: not over it, and no gap.
    const top = topPieces(project, project.materials).find((p) => p.island)!;
    const home = places.get(top.cabinetId)!;
    const edges = [inRoom(home.at, home.turn, [top.x0, 0, top.zBack])[2], inRoom(home.at, home.turn, [top.x1, 0, top.zFront])[2]];
    expect(Math.min(...edges)).toBeCloseTo(rangeSide, 3);
    // The board: the corner box's part, from the range's side to the box's back, floor to the box's top.
    const corner = cabinetsOf(project).find((c) => c.name === 'Peninsula corner (dining side)')!;
    const board = job.cabinetParts.find((p) => p.id === `${corner.id}/back-filler`)!;
    const box = partBox(board);
    const where = places.get(corner.id)!;
    const zs = [inRoom(where.at, where.turn, box.min)[2], inRoom(where.at, where.turn, box.max)[2]];
    expect(Math.min(...zs)).toBeCloseTo(rangeSide, 3);
    expect(Math.max(...zs)).toBeCloseTo(inRoom(where.at, where.turn, [0, 0, -corner.size.depth.mm])[2], 3);
    expect(board.size.height).toBe(corner.size.height.mm);
    expect(inch(board.size.width)).toBeGreaterThan(1.5);
    // It does not count as the box's depth, so the box is drawn where it stands.
    expect(cabinetBack(job.cabinetParts.filter((p) => p.id.startsWith(`${corner.id}/`)))).toBeCloseTo(corner.size.depth.mm, 3);
  });

  it('draws its bought laminate tops: a slab on each piece, a formed backsplash along the walls only', () => {
    const pieces = topPieces(project, project.materials);
    const shown = shownTopParts(project, project.materials, shop.hardware);
    expect(shown.filter((p) => p.id.endsWith('-shown'))).toHaveLength(pieces.length);
    // The fridge wall's corner, the window wall's run and the base by the range; not the peninsula.
    expect(pieces.filter((p) => backAgainstWall(project, p))).toHaveLength(3);
    expect(shown.filter((p) => p.id.endsWith('-shown-splash'))).toHaveLength(3);
    // Drawn only: never on the job's parts.
    expect([...job.cabinetParts, ...job.parts].some((p) => p.id.includes('-shown'))).toBe(false);
  });
});
