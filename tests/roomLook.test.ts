// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { WALL_TILE, roomLookWords, shopFor, starterWallTile, wallTileRects } from '@/design';
import { type ProjectScene, projectScene } from '@/design/scene';
import { createStarterShopProfile } from '@/libraries';
import type { DesignedCabinetContext } from '@/model';
import { createCommonKitchenProject } from '@/samples/cabinet';

/** How a room looks: its floor, its walls' colour, tile on the walls placed by the app. Only drawn. */
describe("a room's look", () => {
  const profile = createStarterShopProfile();
  const sceneOf = (change?: (context: DesignedCabinetContext) => void) => {
    const project = createCommonKitchenProject();
    const context = project.context as DesignedCabinetContext;
    change?.(context);
    const scene = projectScene(project, shopFor(project, profile), profile.materialGroups) as ProjectScene;
    return { project, context, scene, tiles: wallTileRects(context.room!, scene.parts, scene.cabinets) };
  };
  const IN = 25.4;

  it('the common kitchen has pale blue walls and white subway tile', () => {
    const { context, scene } = sceneOf();
    expect(context.room!.look).toEqual({ wall: '#b9cad6', tile: starterWallTile('subway') });
    expect(scene.room!.look).toEqual(context.room!.look);
    expect(scene.room!.tiles!.length).toBeGreaterThan(3);
    expect(roomLookWords(context.room!.look)).toBe('painted walls, subway tile');
    expect(roomLookWords(undefined)).toBe('');
  });

  it('tile runs from the countertop up to the wall cabinets, on the two walls the cabinets stand against', () => {
    const { tiles } = sceneOf();
    expect([...new Set(tiles.map((t) => t.wall))].sort()).toEqual(['back', 'right']);
    // Over a countertop the band starts on its formed backsplash, 4" over the 36" top, and ends at the uppers' underside, 54".
    const band = tiles.filter((t) => Math.abs(t.up - 40 * IN) < 1);
    expect(band.length).toBeGreaterThan(0);
    for (const t of band) expect(t.up + t.height).toBeLessThanOrEqual(54 * IN + 1);
    expect(band.some((t) => Math.abs(t.up + t.height - 54 * IN) < 1)).toBe(true);
    // Nothing starts below a countertop, and nothing reaches the ceiling.
    for (const t of tiles) {
      expect(t.up).toBeGreaterThanOrEqual(36 * IN - 1);
      expect(t.up + t.height).toBeLessThan(60 * IN);
      expect(t.width).toBeGreaterThanOrEqual(WALL_TILE.least);
      expect(t.height).toBeGreaterThanOrEqual(WALL_TILE.least);
    }
  });

  it('it goes round the window, stops at the refrigerator, and runs behind the range up to the microwave', () => {
    // (The sample's sill is just over the backsplash: raised, there is room for tile under it.)
    const { context, tiles } = sceneOf((c) => {
      c.room!.windows![0]!.sill = { mm: 46 * 25.4, unit: 'in' };
      c.room!.windows![0]!.height = { mm: 30 * 25.4, unit: 'in' };
    });
    const w = context.room!.windows![0]!;
    const hole = { a0: w.along.mm - WALL_TILE.trim, a1: w.along.mm + w.width.mm + WALL_TILE.trim, y0: w.sill.mm - WALL_TILE.trim / 2, y1: w.sill.mm + w.height.mm + WALL_TILE.trim };
    const onWindowWall = tiles.filter((t) => t.wall === w.wall);
    for (const t of onWindowWall) {
      const apart = t.along + t.width <= hole.a0 + 0.01 || t.along >= hole.a1 - 0.01 || t.up + t.height <= hole.y0 + 0.01 || t.up >= hole.y1 - 0.01;
      expect(apart).toBe(true);
    }
    // Tile under the sill, between the countertop and the window, and beside it each way.
    expect(onWindowWall.some((t) => t.along >= hole.a0 - 0.01 && t.along + t.width <= hole.a1 + 0.01 && t.up + t.height <= hole.y0 + 0.01)).toBe(true);
    expect(onWindowWall.some((t) => t.along + t.width <= hole.a0 + 0.01)).toBe(true);
    expect(onWindowWall.some((t) => t.along >= hole.a1 - 0.01)).toBe(true);
    // The refrigerator: no tile behind it.
    const at = (kind: string) => context.appliances!.find((a) => a.kind === kind)!;
    const span = (kind: string) => {
      const a = at(kind);
      const along = (a.placement as { along: { mm: number } }).along.mm;
      return [along, along + a.size.width.mm] as const;
    };
    const [f0, f1] = span('refrigerator');
    for (const t of tiles.filter((x) => x.wall === 'back')) expect(t.along + t.width <= f0 + 60 || t.along >= f1 - 60).toBe(true);
    // The range: tile from its top to the microwave's underside.
    const [r0, r1] = span('range');
    const behind = tiles.filter((t) => t.wall === 'back' && t.along < r1 - 10 && t.along + t.width > r0 + 10);
    expect(behind.length).toBeGreaterThan(0);
    const microwave = at('microwave');
    for (const t of behind) expect(t.up + t.height).toBeLessThanOrEqual((microwave.offFloor?.mm ?? 0) + 1);
  });

  it("at an open end it stops in line with the end cabinet's side, not with the countertop's overhang past it", () => {
    const { scene, tiles } = sceneOf();
    // The sink wall's run ends in the room: its last base cabinet and the wall cabinet over it end in one line, and the top is 1" past them.
    const end = Math.max(...tiles.filter((t) => t.wall === 'right').map((t) => t.along + t.width));
    expect(end / IN).toBeCloseTo(102.83, 1);
    const top = scene.parts.filter((p) => p.role === 'top' && p.id.includes('-shown'));
    expect(top.length).toBeGreaterThan(0);
    // (As first built it ran on to 103.83", the end of the top.)
    expect(WALL_TILE.overhang).toBeGreaterThan(1 * IN);
  });

  it('none without a tile, none on an open side, and none behind an island', () => {
    expect(sceneOf((c) => delete c.room!.look!.tile).tiles).toEqual([]);
    expect(sceneOf((c) => delete c.room!.look!.tile).scene.room!.tiles).toBeUndefined();
    expect(sceneOf((c) => (c.room!.open = ['back'])).tiles.every((t) => t.wall === 'right')).toBe(true);
    // The island stands free: with its two walls' cabinets gone there would be no tile at all. Its top is well clear of every wall.
    const { tiles } = sceneOf();
    expect(tiles.some((t) => t.wall === 'front' || t.wall === 'left')).toBe(false);
  });

  it('with no wall cabinet above, the band is level with where the wall cabinets hang; with none anywhere, 18" high', () => {
    // Without its window the sink wall's band runs straight through at the uppers' height, under them and between them.
    const { tiles } = sceneOf((c) => delete c.room!.windows);
    const right = tiles.filter((t) => t.wall === 'right');
    expect(right).toHaveLength(1);
    expect(right[0]!.up).toBeCloseTo(40 * IN, 0);
    expect(right[0]!.up + right[0]!.height).toBeCloseTo(54 * IN, 0);
    expect(right[0]!.width).toBeGreaterThan(100 * IN);
    // As the sample is, the sill is too close over the backsplash for a strip of tile under it: none there.
    const asIs = sceneOf();
    const win = asIs.context.room!.windows![0]!;
    expect(asIs.tiles.some((t) => t.wall === 'right' && t.along > win.along.mm - 1 && t.along + t.width < win.along.mm + win.width.mm + 1)).toBe(false);
    // With no wall cabinet in the room, 18" over what stands there.
    const none = sceneOf((c) => {
      c.pieces = c.pieces.filter((p) => !('form' in p) || p.form !== 'wall');
      c.runs = c.runs.filter((r) => c.pieces.some((p) => 'runId' in p && p.runId === r.id));
      c.appliances = c.appliances!.filter((a) => a.kind !== 'microwave');
      delete c.room!.windows;
    });
    for (const t of none.tiles) expect(t.height).toBeCloseTo(WALL_TILE.band, 0);
    expect(none.tiles.length).toBeGreaterThan(0);
  });
});
