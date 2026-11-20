// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bottomKindOf, boxOffFloor, cabinetsOf, legFrameMiddles, onLegs, partitionPlaces, setBottomKind, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import { SQUARE_2X2_ID } from '@/libraries/materials';
import type { CasesContext, Part, Project } from '@/model';
import { FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Furniture: a case on a leg frame. */
const preset = (id: string) => builtInPresets().find((p) => p.id === id)!;
const started = (id: string, style = FACE_FRAME_PRESET_ID) => {
  const profile = createStarterShopProfile();
  return { profile, project: startProject(starterById(id)!, preset(style), profile).project };
};
const contextOf = (p: Project) => p.context as CasesContext;
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
const named = (parts: Part[], key: string) => parts.find((p) => p.id.endsWith(`/${key}`))!;

describe('a case on a leg frame', () => {
  it('is a bottom of its own: a flat bottom, four legs of square stock and four aprons under it', () => {
    const { project, profile } = started('dresser-legs');
    const kick = contextOf(project).settings.toeKick;
    expect([bottomKindOf(kick), kick.off, kick.casters, inches(kick.legs!.height.mm), inches(kick.legs!.apron.mm), kick.legs!.materialId]).toEqual(['legs', true, undefined, 6, 3, SQUARE_2X2_ID]);
    expect(project.materials.some((m) => m.id === SQUARE_2X2_ID)).toBe(true);
    const [dresser] = cabinetsOf(project);
    expect(onLegs(dresser!)).toBe(true);
    // The case stands the legs' length off the floor; its own height is still the box's.
    expect(inches(boxOffFloor(dresser!, shopFor(project, profile).materials, profile.hardware)!)).toBe(6);
    expect(inches(dresser!.size.height.mm)).toBe(34);

    const job = buildJob({ ...project, slug: 'legs' }, profile);
    const frame = job.cabinetParts.filter((p) => p.role === 'leg' || p.role === 'apron');
    expect(frame.map((p) => `${p.id.split('/')[1]}:${p.role}`)).toEqual([
      'leg-front-left:leg', 'leg-front-right:leg', 'leg-back-left:leg', 'leg-back-right:leg',
      'leg-apron-front:apron', 'leg-apron-back:apron', 'leg-apron-left:apron', 'leg-apron-right:apron',
    ]);
    // The legs: 1-1/2" square, 6" long, under the case's floor line, at its corners.
    const leg = named(frame, 'leg-front-left');
    expect([inches(leg.size.width), inches(leg.size.height), inches(leg.size.thickness), leg.placement!.origin.map(inches)]).toEqual([1.5, 6, 1.5, [0, -6, 0]]);
    expect(named(frame, 'leg-back-right').placement!.origin.map(inches)).toEqual([34.5, -6, -16.5]);
    // The aprons: between the legs, 3" tall, their tops at the case's underside, 1/4" in from the legs' faces.
    const front = named(frame, 'leg-apron-front');
    expect([inches(front.size.width), inches(front.size.height), front.placement!.origin.map(inches)]).toEqual([33, 3, [1.5, -3, -0.25]]);
    // Pocket screws into the legs at each end, and up into the case's bottom along the top edge.
    const holes = front.features.filter((f) => f.kind === 'pocketHole').map((f) => (f.kind === 'pocketHole' ? f.edge : ''));
    expect(holes.filter((e) => e === 'x0').length + holes.filter((e) => e === 'x1').length).toBe(4);
    expect(holes.filter((e) => e === 'y1').length).toBeGreaterThanOrEqual(2);
    // No toe kick, no pads, no casters.
    expect(job.cabinetParts.some((p) => p.id.endsWith('/toe-kick') || /caster-pad/.test(p.id))).toBe(false);
    expect(job.files.length).toBeGreaterThan(0);
    const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
    if ('error' in scene) throw new Error(scene.error);
    expect(scene.casters).toEqual([]);
  });

  it('has legs in the middle of a long case only when asked for: under its partitions, the long aprons in lengths, an apron across', () => {
    const { project, profile } = started('tvstand');
    const kick = contextOf(project).settings.toeKick;
    const legs = () => buildJob({ ...project, slug: 'legs' }, profile).cabinetParts.filter((p) => p.role === 'leg' || p.role === 'apron');
    // The TV stand as it starts: 60" on four legs.
    expect(legs().map((p) => p.id.split('/')[1])).toEqual([
      'leg-front-left', 'leg-front-right', 'leg-back-left', 'leg-back-right', 'leg-apron-front', 'leg-apron-back', 'leg-apron-left', 'leg-apron-right',
    ]);
    kick.legs!.middle = true;
    const [stand] = cabinetsOf(project);
    const frame = legs();
    // Its two partitions are 20" or so apart: one alone would leave a span over 36", so both get legs.
    const middles = legFrameMiddles(stand!, shopFor(project, profile).materials);
    expect(middles.length).toBe(2);
    expect(middles[0]! + middles[1]!).toBeCloseTo(stand!.size.width.mm, 3);
    const partitions = buildJob({ ...project, slug: 'legs' }, profile).cabinetParts.filter((p) => /partition/i.test(p.id));
    expect(partitions.length).toBe(2);
    const t = partitions[0]!.size.thickness;
    expect(middles).toEqual(partitionPlaces(stand!, shopFor(project, profile).materials).map((x) => x + t / 2));
    expect(frame.filter((p) => p.role === 'leg').length).toBe(8);
    expect(frame.filter((p) => p.role === 'apron').map((p) => p.id.split('/')[1]).sort()).toEqual([
      'leg-apron-back-1', 'leg-apron-back-2', 'leg-apron-back-3', 'leg-apron-cross-1', 'leg-apron-cross-2',
      'leg-apron-front-1', 'leg-apron-front-2', 'leg-apron-front-3', 'leg-apron-left', 'leg-apron-right',
    ]);
    // The front aprons and the legs between them fill the case's width, with nothing over anything.
    const leg = named(frame, 'leg-front-left').size.width;
    const fronts = frame.filter((p) => /leg-apron-front-/.test(p.id));
    expect(fronts.reduce((sum, p) => sum + p.size.width, 0) + 4 * leg).toBeCloseTo(stand!.size.width.mm, 3);
    // A middle leg is centred under its partition; the apron across is centred on the legs and runs between them.
    const middle = named(frame, 'leg-front-middle-1');
    expect(middle.placement!.origin[0] + leg / 2).toBeCloseTo(middles[0]!, 6);
    const cross = named(frame, 'leg-apron-cross-1');
    expect(cross.placement!.origin[0] + cross.size.thickness / 2).toBeCloseTo(middles[0]!, 6);
    expect(cross.size.width).toBeCloseTo(stand!.size.depth.mm - 2 * leg, 6);
    // A short case has none, asked for or not.
    const short = started('dresser-legs');
    contextOf(short.project).settings.toeKick.legs!.middle = true;
    expect(buildJob({ ...short.project, slug: 'legs' }, short.profile).cabinetParts.filter((p) => p.role === 'leg').length).toBe(4);
  });

  it('goes when the bottom is something else, and says why it cannot be made', () => {
    const { project, profile } = started('nightstand-legs', FRAMELESS_PRESET_ID);
    const kick = contextOf(project).settings.toeKick;
    kick.legs!.height = len('2"');
    expect(() => buildJob({ ...project, slug: 'legs' }, profile)).toThrow('The legs are too short for their aprons');
    kick.legs!.height = len('8"');
    expect(buildJob({ ...project, slug: 'legs' }, profile).cabinetParts.filter((p) => p.role === 'leg').length).toBe(4);
    setBottomKind(kick, 'toeKick', profile.hardware);
    expect([bottomKindOf(kick), kick.legs, kick.off]).toEqual(['toeKick', undefined, undefined]);
    expect(buildJob({ ...project, slug: 'legs' }, profile).cabinetParts.some((p) => p.role === 'leg')).toBe(false);
    // Back on legs: a 6" frame of 2x2 again.
    setBottomKind(kick, 'legs', profile.hardware);
    expect([bottomKindOf(kick), inches(kick.legs!.height.mm)]).toEqual(['legs', 6]);
    // Casters take its place, and it theirs.
    setBottomKind(kick, 'casters', profile.hardware);
    expect([bottomKindOf(kick), kick.legs]).toEqual(['casters', undefined]);
    setBottomKind(kick, 'legs', profile.hardware);
    expect([bottomKindOf(kick), kick.casters]).toEqual(['legs', undefined]);
  });
});
