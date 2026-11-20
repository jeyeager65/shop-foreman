// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, framesOf, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import { deriveTopParts, topPieces } from '@/design/tops';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { DesignedCabinetContext, Project } from '@/model';
import { FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, builtInPresets } from '@/samples/presets';
import { PEDESTAL_DESK, starterById, startProject } from '@/samples/starters';

/** Furniture: a desk: a table at a desk's height, or one top over a bank of drawers each side. */
const preset = (id: string) => builtInPresets().find((p) => p.id === id)!;
const started = (id: string, style = FACE_FRAME_PRESET_ID) => {
  const profile = createStarterShopProfile();
  return { profile, project: startProject(starterById(id)!, preset(style), profile).project };
};
const inches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const contextOf = (p: Project) => p.context as DesignedCabinetContext;

describe('a desk', () => {
  it('a writing desk is a table at a desk\'s height', () => {
    const { project, profile } = started('writingdesk');
    const [desk] = framesOf(project);
    expect([inches(desk!.size.width.mm), inches(desk!.size.depth.mm), inches(desk!.size.height.mm)]).toEqual([48, 24, 30]);
    expect(cabinetsOf(project)).toEqual([]);
    expect(buildJob({ ...project, slug: 'desk' }, profile).cabinetParts.filter((p) => p.role === 'leg').length).toBe(4);
  });

  it('a pedestal desk is two banks of drawers with knee space between them, under one top', () => {
    for (const style of [FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID]) {
      const { project, profile } = started('desk', style);
      const materials = shopFor(project, profile).materials;
      const pedestals = cabinetsOf(project);
      expect(pedestals.map((c) => [c.name, inches(c.size.width.mm), inches(c.size.height.mm), inches(c.size.depth.mm), c.layout.rows.length]), style).toEqual([
        ['Left pedestal', 16, 29.25, 22, 3],
        ['Right pedestal', 16, 29.25, 22, 3],
      ]);
      // One top, the left pedestal's, over both: as long as the two and the knee space and Setup's overhang at each end.
      const pieces = topPieces(project, materials);
      expect(pieces.length, style).toBe(1);
      const [top] = pieces;
      const over = contextOf(project).tops?.overhang.openEnd.mm ?? 25.4;
      expect(inches(top!.x1 - top!.x0), style).toBeCloseTo(inches((2 * PEDESTAL_DESK.width + PEDESTAL_DESK.knees) * 25.4 + 2 * over), 1);
      expect(top!.island?.alsoOver, style).toEqual([pedestals[1]!.id]);
      // Its surface is 30" off the floor with a 3/4" top.
      const panel = deriveTopParts(project, materials).find((p) => p.id.endsWith('/top-1'))!;
      expect(inches(top!.y + panel.size.thickness), style).toBeCloseTo(30, 0);
      // The pedestals stand 28" apart in the room, facing the same way.
      const scene = projectScene(project, shopFor(project, profile), profile.materialGroups);
      if ('error' in scene) throw new Error(scene.error);
      const [a, b] = pedestals.map((c) => scene.cabinets.find((x) => x.id === c.id)!);
      expect([a!.turn, b!.turn], style).toEqual([0, 0]);
      expect(inches(Math.abs(b!.at[0] - a!.at[0])), style).toBeCloseTo(PEDESTAL_DESK.width + PEDESTAL_DESK.knees, 1);
      expect(inches(Math.abs(b!.at[2] - a!.at[2])), style).toBeCloseTo(0, 1);
      const job = buildJob({ ...project, slug: 'desk' }, profile);
      expect(job.parts.length, style).toBe(6);
      expect(job.files.length, style).toBeGreaterThan(0);
    }
  });
});
