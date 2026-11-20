// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetTags, cabinetsOf, deriveFrameParts, frameDowelJig, frameFasteners, frameLayout, framesOf, piecesOf, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile, PLYWOOD_3_4_ID } from '@/libraries';
import { SQUARE_2X2_ID, SQUARE_3X3_ID } from '@/libraries/materials';
import type { DesignedCabinetContext, Part, Project } from '@/model';
import { createBaseCabinetProject, deleteCabinet } from '@/samples/cabinet';
import { TABLE_SIZES, addTable } from '@/samples/tables';
import { len } from '@/units';

/** Furniture: a table is a piece of its own kind, a frame: legs, aprons and a top. */
const profile = createStarterShopProfile();
const contextOf = (p: Project) => p.context as DesignedCabinetContext;
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
/** A project that is one end table, in the face frame style. */
const endTable = () => {
  const project = createBaseCabinetProject('faceFrame');
  const frame = addTable(project, profile, { name: 'End table', size: TABLE_SIZES.endTable });
  deleteCabinet(project, cabinetsOf(project)[0]!.id);
  return { project, frame };
};
const partsOf = (project: Project) => deriveFrameParts(framesOf(project)[0]!, contextOf(project), shopFor(project, profile).materials);
const named = (parts: Part[], key: string) => parts.find((p) => p.id.endsWith(`/${key}`))!;
/** Where a part is in the piece: the least and the greatest of its eight corners, in inches. */
const box = (p: Part) => {
  const { origin, xAxis, yAxis } = p.placement!;
  const n = [xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1], xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2], xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0]];
  const corners = [0, 1].flatMap((u) => [0, 1].flatMap((v) => [0, 1].map((w) => [0, 1, 2].map((i) => origin[i]! + u * p.size.width * xAxis[i]! + v * p.size.height * yAxis[i]! - w * p.size.thickness * n[i]!))));
  return { min: [0, 1, 2].map((i) => inches(Math.min(...corners.map((c) => c[i]!)))), max: [0, 1, 2].map((i) => inches(Math.max(...corners.map((c) => c[i]!)))) };
};

describe('a table', () => {
  it('is a piece of its own kind in the project, with none of a cabinet in it', () => {
    const { project, frame } = endTable();
    expect(piecesOf(project).map((p) => [p.id, p.kind])).toEqual([['table-1', 'frame']]);
    expect(cabinetsOf(project)).toEqual([]);
    expect(Object.keys(frame).sort()).toEqual(['aprons', 'id', 'kind', 'legs', 'name', 'quantity', 'size', 'top']);
    // What it is made of is in the project: the legs' square stock, the case material, the top's and its edge's.
    expect(project.materials.map((m) => m.id)).toEqual(expect.arrayContaining([SQUARE_2X2_ID, PLYWOOD_3_4_ID, 'solid-wood-3-4']));
  });

  it('is four legs, four aprons and a top with its edge', () => {
    const { project } = endTable();
    const parts = partsOf(project);
    expect(parts.map((p) => `${p.id.split('/')[1]}:${p.role}`)).toEqual([
      'leg-front-left:leg', 'leg-front-right:leg', 'leg-back-left:leg', 'leg-back-right:leg',
      'apron-front:apron', 'apron-back:apron', 'apron-left:apron', 'apron-right:apron',
      'top:top', 'top-edge-front:topEdge', 'top-edge-back:topEdge', 'top-edge-left:topEdge', 'top-edge-right:topEdge',
    ]);
    const top = named(parts, 'top');
    const topThick = top.size.thickness;
    // The legs: 1-1/2" square as measured, from the floor to the underside of the top, 1" in from the top's edges.
    const leg = named(parts, 'leg-front-left');
    expect([inches(leg.size.width), inches(leg.size.thickness), leg.materialId, leg.grain]).toEqual([1.5, 1.5, SQUARE_2X2_ID, 'height']);
    expect(leg.size.height).toBeCloseTo(24 * 25.4 - topThick, 3);
    expect(box(leg)).toEqual({ min: [1, 0, -2.5], max: [2.5, inches(leg.size.height), -1] });
    expect(box(named(parts, 'leg-back-right'))).toEqual({ min: [19.5, 0, -21], max: [21, inches(leg.size.height), -19.5] });
    // The aprons: 4" tall under the top, between the legs, 1/4" in from their outside faces.
    const front = named(parts, 'apron-front');
    expect([inches(front.size.width), inches(front.size.height), front.materialId]).toEqual([17, 4, PLYWOOD_3_4_ID]);
    const t = inches(front.size.thickness);
    expect(box(front).max[2]).toBe(-1.25);
    expect(box(front).min[0]).toBe(2.5);
    expect(box(front).max[1]).toBeCloseTo(inches(leg.size.height), 3);
    expect(box(named(parts, 'apron-back')).min[2]).toBe(-20.75);
    expect(box(named(parts, 'apron-left')).min[0]).toBe(1.25);
    expect(box(named(parts, 'apron-left')).max[0]).toBeCloseTo(1.25 + t, 3);
    expect(box(named(parts, 'apron-right')).max[0]).toBe(20.75);
    expect([box(named(parts, 'apron-left')).min[2], box(named(parts, 'apron-left')).max[2]]).toEqual([-19.5, -2.5]);
    // Two pocket screws through each end of each apron, from its inside face into the leg.
    for (const key of ['apron-front', 'apron-back', 'apron-left', 'apron-right']) {
      const holes = named(parts, key).features.filter((x) => x.kind === 'pocketHole');
      expect(holes.map((h) => (h.kind === 'pocketHole' ? `${h.face}${h.edge}` : '')), key).toEqual(['Bx0', 'Bx0', 'Bx1', 'Bx1']);
    }
    // The top: 22" x 22" over all with its strips, its surface 24" off the floor.
    expect(box(top).max[1]).toBe(24);
    expect([inches(top.size.width), inches(top.size.height)]).toEqual([20.5, 20.5]);
    expect(box(named(parts, 'top-edge-front'))).toEqual({ min: [0, inches(leg.size.height), -0.75], max: [22, 24, 0] });
    expect(box(named(parts, 'top-edge-back')).min[2]).toBe(-22);
    expect([box(named(parts, 'top-edge-left')).min[0], box(named(parts, 'top-edge-right')).max[0]]).toEqual([0, 22]);
    expect(frameFasteners(framesOf(project)[0]!, contextOf(project), shopFor(project, profile).materials)).toBe(6);
  });

  it('gives a job that cuts, and a scene that can be drawn', () => {
    const { project } = endTable();
    const job = buildJob({ ...project, slug: 'table' }, profile);
    expect(job.cabinetParts.length).toBe(13);
    expect(job.parts).toEqual([]);
    // Plain rectangles are the saws' unless Plan says otherwise, so a table with a glued-on edge has nothing for the
    // CNC: the legs are cut to length on the miter saw and are never offered the CNC; the aprons' pocket holes are Kreg.
    const planned = (key: string) => job.plan.parts.find((p) => p.partId.endsWith(`/${key}`))!;
    expect([planned('leg-front-left').cutOut, planned('leg-front-left').options, planned('leg-front-left').steps.map((x) => `${x.label}: ${x.by}`)]).toEqual(['tableSaw', ['tableSaw', 'circularSaw'], ['Cut to length: miterSaw']]);
    expect(planned('apron-front').steps.map((x) => `${x.label}: ${x.by}`)).toEqual(['4 pocket holes: kregJig']);
    expect(planned('top').options).toContain('cnc');
    expect(job.files).toEqual([]);
    // A top whose own edge is rounded over has no strips: the edge is a step by hand with a router, as a door's is.
    framesOf(project)[0]!.top.edge = { kind: 'roundover', size: len('1/8"') };
    const rounded = buildJob({ ...project, slug: 'table' }, profile);
    expect(rounded.cabinetParts.length).toBe(9);
    expect(rounded.plan.parts.find((p) => p.partId.endsWith('/top'))!.steps.map((x) => `${x.label}: ${x.by}`)).toEqual(['Round over its top edge all round, 3.2 mm radius, with a router: byHand']);
    framesOf(project)[0]!.top.edge = { kind: 'strip', thickness: len('3/4"') };
    const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
    if ('error' in scene) throw new Error(scene.error);
    expect(scene.cabinets.map((c) => [c.id, c.partIds.length])).toEqual([['table-1', 13]]);
  });

  it('stands beside cabinets in one project: each piece has its tag, and a table made twice has its parts twice', () => {
    const project = createBaseCabinetProject('faceFrame');
    const frame = addTable(project, profile, { name: 'Coffee table', size: TABLE_SIZES.coffeeTable, legMaterialId: SQUARE_3X3_ID });
    expect([...cabinetTags(project).entries()]).toEqual([['cabinet-1', 'A'], ['table-1', 'B']]);
    frame.quantity = 2;
    const job = buildJob({ ...project, slug: 'both' }, profile);
    const legs = job.cabinetParts.filter((p) => p.role === 'leg');
    expect(legs.length).toBe(8);
    expect(new Set(legs.map((p) => `${p.tag}${p.copy}`))).toEqual(new Set(['B1', 'B2']));
    expect(inches(legs[0]!.size.width)).toBe(2.5);
    const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
    if ('error' in scene) throw new Error(scene.error);
    expect(scene.cabinets.map((c) => c.id)).toEqual(['cabinet-1', 'table-1']);
    // Side by side, not one in the other.
    expect(scene.cabinets[1]!.at[0]).toBeGreaterThan(scene.cabinets[0]!.at[0] + 24 * 25.4 - 1);
  });

  it('may have a lower shelf, cut round each leg, and legs glued up from layers', () => {
    const { project, frame } = endTable();
    frame.shelf = { up: len('6"') };
    let parts = partsOf(project);
    const shelf = named(parts, 'shelf');
    // From the legs' outside faces less the aprons' setback: 20" less 1/4" each side, its top 6" off the floor.
    expect([inches(shelf.size.width), inches(shelf.size.height), shelf.role, shelf.materialId]).toEqual([19.5, 19.5, 'shelf', PLYWOOD_3_4_ID]);
    expect(box(shelf).max[1]).toBe(6);
    expect([box(shelf).min[0], box(shelf).max[0], box(shelf).min[2], box(shelf).max[2]]).toEqual([1.25, 20.75, -20.75, -1.25]);
    // A notch in each corner, as deep as the leg reaches into it and a hair more, with dog-bones.
    const cutout = shelf.features.find((x) => x.kind === 'cutout');
    expect(cutout?.kind === 'cutout' && [cutout.outline.length, cutout.dogBones]).toEqual([12, true]);
    const notch = cutout?.kind === 'cutout' ? cutout.outline[0]!.x : 0;
    expect(notch).toBeCloseTo(1.25 * 25.4 + 0.5, 3);
    // It is the CNC's: the table now has a file to run.
    const job = buildJob({ ...project, slug: 'shelf' }, profile);
    expect(job.plan.parts.find((p) => p.partId.endsWith('/shelf'))!.cutOut).toBe('cnc');
    expect(job.files.length).toBeGreaterThan(0);
    // Too high, into the aprons: said plainly.
    frame.shelf.up = len('22"');
    expect(() => partsOf(project)).toThrow('not between the floor and the aprons');
    delete frame.shelf;

    // Legs glued up: two layers of the 3/4" case material, a strip a layer, the leg as wide as the stack is thick.
    frame.legs = { materialId: PLYWOOD_3_4_ID, layers: 2 };
    parts = partsOf(project);
    const strips = parts.filter((p) => p.role === 'leg');
    expect(strips.length).toBe(8);
    expect(strips.slice(0, 2).map((p) => p.name)).toEqual(['Leg, front left, layer 1', 'Leg, front left, layer 2']);
    const t = strips[0]!.size.thickness;
    expect(strips[0]!.size.width).toBeCloseTo(2 * t, 3);
    // The two layers of a leg lie one behind the other, and the aprons start where the stack ends.
    expect(box(strips[1]!).max[2]).toBeCloseTo(box(strips[0]!).min[2]!, 3);
    expect(box(named(parts, 'apron-front')).min[0]).toBeCloseTo(1 + inches(2 * t), 3);
    // A sheet with no layers is not a leg.
    frame.legs = { materialId: PLYWOOD_3_4_ID };
    expect(() => partsOf(project)).toThrow('The legs want square stock');
  });

  it('says why it cannot be made: too small for its legs, too low for its aprons', () => {
    const { project, frame } = endTable();
    frame.size.width = len('5"');
    expect(() => partsOf(project)).toThrow('too small for its legs');
    frame.size.width = len('22"');
    frame.size.height = len('4"');
    expect(() => partsOf(project)).toThrow('too low for its aprons');
    frame.size.height = len('24"');
    frame.joint = 'braces';
    expect(partsOf(project).flatMap((p) => p.features.filter((x) => x.kind === 'pocketHole'))).toEqual([]);
  });

  it('dowels: no pocket holes, sixteen dowel pins on the list, the jig\'s sizes from the table, and the steps', () => {
    const { project, frame } = endTable();
    frame.joint = 'dowels';
    expect(partsOf(project).flatMap((p) => p.features.filter((x) => x.kind === 'pocketHole'))).toEqual([]);
    const layout = frameLayout(frame, project.context as DesignedCabinetContext, shopFor(project, profile).materials);
    const jig = frameDowelJig(frame, project.context as DesignedCabinetContext, shopFor(project, profile).materials);
    expect([jig.dowels, Math.round(jig.diameter * 1000) / 1000, jig.thickness, jig.setback]).toEqual([2, 9.525, layout.apron, layout.setback]);
    // The two dowels are an inch in from the apron's top and bottom edges.
    expect(jig.fromTop + jig.spacing).toBeCloseTo(layout.apronHeight - 25.4, 6);
    const job = buildJob({ ...project, slug: 'dowels' }, profile);
    const shop = shopFor(project, profile);
    const pins = buildLists(job, project, shop, (mm) => `${Math.round(mm)} mm`).hardware.filter((h) => h.item.includes('dowel pins'));
    expect(pins.map((h) => h.quantity)).toEqual([16]);
    const steps = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).flatMap((s) => s.steps.map((x) => x.text)).filter((t) => /dowel|spacer/.test(t));
    expect(steps.length).toBe(3);
    expect(steps[0]).toMatch(/Print the dowel jig/);
  });
});
