import { describe, expect, it } from 'vitest';
import { cabinetsOf, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import { createStarterShopProfile } from '@/libraries';
import { createBaseCabinetProject, createKitchenProject, createShopWallProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';

/** The whole project as the 3D view draws it away from Design: beside Setup's answers and on Projects. */
describe('a project\'s scene', () => {
  const profile = createStarterShopProfile();
  const scene = (project: ReturnType<typeof createBaseCabinetProject>) => {
    const s = projectScene(project, shopFor(project, profile), profile.materialGroups);
    if ('error' in s) throw new Error(s.error);
    return s;
  };

  it('has every cabinet once, with its own parts, where it stands', () => {
    const project = createShopWallProject();
    const s = scene(project);
    expect(s.cabinets.map((c) => c.id)).toEqual(cabinetsOf(project).map((c) => c.id));
    expect(s.room).toBeUndefined();
    for (const c of s.cabinets) expect(c.partIds.length).toBeGreaterThan(4);
    // Every part belongs to one cabinet, and none is a second copy.
    const owned = s.cabinets.flatMap((c) => c.partIds);
    expect(new Set(owned).size).toBe(owned.length);
    expect(s.parts.every((p) => (p.copy ?? 1) === 1)).toBe(true);
    // Side by side, not on top of each other.
    expect(new Set(s.cabinets.map((c) => c.at[0])).size).toBe(s.cabinets.length);
    expect(Object.keys(s.looks).length).toBeGreaterThan(0);
  });

  it('stands a kitchen in its room', () => {
    const project = createKitchenProject();
    const s = scene(project);
    expect(s.room).toMatchObject({ length: 144 * 25.4, width: 120 * 25.4 });
    expect(s.cabinets.length).toBeGreaterThanOrEqual(cabinetsOf(project).length);
    expect(s.cabinets.some((c) => (c.turn ?? 0) !== 0)).toBe(true);
  });

  it('follows the answers: a flat bottom has no toe kick board', () => {
    const project = createBaseCabinetProject('frameless');
    const kick = (p: typeof project) => scene(p).parts.some((x) => x.id.endsWith('/toe-kick'));
    expect(kick(project)).toBe(true);
    if (project.context.kind === 'designedCabinet') project.context.settings.toeKick.off = true;
    expect(kick(project)).toBe(false);
  });

  it('draws a cabinet that is already there as a shell, with the new doors made for it', () => {
    const vanity = createVanityProject();
    const scene = projectScene(vanity, shopFor(vanity, profile));
    if ('error' in scene) throw new Error(scene.error);
    expect(scene.parts.filter((p) => p.existing).length).toBeGreaterThan(4);
    expect(scene.parts.filter((p) => p.id.startsWith('doors-1/')).map((p) => p.name)).toEqual(['Left door', 'Right door']);
  });
});
