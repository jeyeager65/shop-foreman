// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, framesOf, piecesOf, shopFor, standOn, standablePieces, topHeightOf } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { Project } from '@/model';
import { addWallCabinet, createBaseCabinetProject } from '@/samples/cabinet';
import { FACE_FRAME_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Furniture: a hutch: a wall-form case that stands on another piece's top. */
const profile = createStarterShopProfile();
const inches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const started = () => startProject(starterById('deskhutch')!, builtInPresets().find((p) => p.id === FACE_FRAME_PRESET_ID)!, profile).project;
const materials = (p: Project) => shopFor(p, profile).materials;

describe('a hutch on a desk', () => {
  it('is a wall-form case standing on the desk: its bottom at the top\'s height, and nothing made to hang it', () => {
    const project = started();
    expect(piecesOf(project).map((p) => [p.name, p.kind])).toEqual([['Writing desk', 'frame'], ['Hutch', 'case']]);
    const [hutch] = cabinetsOf(project);
    const [desk] = framesOf(project);
    expect([hutch!.form, hutch!.onTop, inches(hutch!.offFloor!.mm), inches(hutch!.size.width.mm), inches(hutch!.size.depth.mm)]).toEqual(['wall', { of: desk!.id }, 30, 48, 10]);
    expect(hutch!.layout.rows.map((r) => r.open)).toEqual([true]);
    const job = buildJob({ ...project, slug: 'hutch' }, profile);
    const mine = job.cabinetParts.filter((p) => p.designObjectId === hutch!.id).map((p) => p.id.split('/')[1]!);
    expect(mine.some((id) => /hanging-rail|cleat/.test(id))).toBe(false);
    expect(mine).toEqual(expect.arrayContaining(['side-left', 'side-right', 'bottom', 'top', 'back']));
    // Screwed to the desk from underneath; no screws into the wall.
    const lists = buildLists(job, project, shopFor(project, profile), (mm) => `${inches(mm)}"`);
    const hanging = lists.hardware.filter((h) => h.group === 'Hanging');
    expect(hanging.map((h) => [h.quantity, /up through the top it stands on/.test(h.note ?? '')])).toEqual([[6, true]]);
  });

  it('stands on the desk in the picture of the whole project: at its back, their left ends in line, and follows it', () => {
    const project = started();
    const at = () => {
      const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
      if ('error' in scene) throw new Error(scene.error);
      const [desk, hutch] = ['table-1', cabinetsOf(project)[0]!.id].map((id) => scene.cabinets.find((c) => c.id === id)!);
      return { desk: desk!, hutch: hutch! };
    };
    const { desk, hutch } = at();
    expect(hutch.turn).toBe(desk.turn);
    expect(inches(hutch.at[0] - desk.at[0])).toBe(0);
    expect(inches(hutch.at[1])).toBe(30);
    // The desk is 24" deep and the hutch 10": its front is 14" behind the desk's front edge.
    expect(inches(hutch.at[2] - desk.at[2])).toBe(-14);
    // A taller desk: the hutch goes up with it in the picture.
    framesOf(project)[0]!.size.height = len('32"');
    expect(inches(at().hutch.at[1])).toBe(32);
  });

  it('may stand on a case too, and hangs on the wall again when asked', () => {
    const project = createBaseCabinetProject('frameless');
    const wall = addWallCabinet(project, { name: 'Wall cabinet' });
    const base = cabinetsOf(project)[0]!;
    expect(standablePieces(project, wall.id).map((p) => p.id)).toEqual([base.id]);
    const stored = piecesOf(project).find((p) => p.id === base.id)!;
    expect(inches(topHeightOf(project, stored, materials(project), profile.hardware))).toBe(34.5);
    standOn(project, wall.id, base.id, materials(project), profile.hardware);
    const stood = cabinetsOf(project).find((c) => c.id === wall.id)!;
    expect([stood.onTop, inches(stood.offFloor!.mm)]).toEqual([{ of: base.id }, 34.5]);
    expect(buildJob({ ...project, slug: 'on' }, profile).cabinetParts.some((p) => p.designObjectId === wall.id && /hanging-rail|cleat/.test(p.id))).toBe(false);
    standOn(project, wall.id, undefined, materials(project), profile.hardware);
    expect(cabinetsOf(project).find((c) => c.id === wall.id)!.onTop).toBeUndefined();
    expect(buildJob({ ...project, slug: 'on' }, profile).cabinetParts.some((p) => p.designObjectId === wall.id && /hanging-rail|cleat/.test(p.id))).toBe(true);
    // Only a wall cabinet stands on another piece.
    expect(() => standOn(project, base.id, wall.id, materials(project), profile.hardware)).toThrow('Only a wall cabinet');
  });
});
