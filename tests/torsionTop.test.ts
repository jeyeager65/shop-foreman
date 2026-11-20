// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TORSION_STARTS, benchTopTable, deriveCabinetParts, torsionMaterialIds, torsionStartOf, torsionTile, lightTopTable, shownTopParts, starterTopSettings, topPieces, topSettingsFor, torsionOf } from '@/design';
import { createStarterShop } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createIslandProject, createFoldingShopTableProject } from '@/samples/cabinet';
import { len } from '@/units';

/** The torsion box is a kind of top, Setup's or one top's own. */
const shop = createStarterShop();
const skins = shop.materials.filter((m) => m.id === 'mdf-1-4');
const contextOf = (project: Project) => project.context as CasesContext;
const made = (project: Project) => deriveCabinetParts(project, shop).filter((p) => p.role === 'top' || p.role === 'rib' || p.role === 'topEdge');
const shape = (project: Project) => made(project).map((p) => [p.name, p.materialId, p.size, p.placement]);

function island(change: (context: CasesContext) => void): Project {
  const project = createIslandProject();
  project.materials.push(...skins);
  change(contextOf(project));
  return project;
}

describe('a top by its own settings', () => {
  it("is Setup's, with what the top says differs in its place", () => {
    const setup = starterTopSettings();
    expect(topSettingsFor(setup, {})).toBe(setup);
    const own = topSettingsFor(setup, { settings: { kind: 'torsion', torsion: benchTopTable() } });
    expect(own.kind).toBe('torsion');
    expect(own.materialId).toBe(setup.materialId);
    expect(torsionOf(setup, {})).toBeUndefined();
    // The box's values are the settings'; its typed size is the top's. (Its leaf is given to it once its edges are known.)
    const table = torsionOf(own, { size: { length: len('96"'), width: len('60"') }, leaf: { edge: 'back', length: len('20"') } })!;
    expect(table.skins).toEqual(benchTopTable().skins);
    expect(table.size!.width.mm).toBeCloseTo(len('60"').mm, 6);
    expect(table.leaf).toBeUndefined();
    // With no values of its own, a torsion top is the light top.
    expect(torsionOf({ ...setup, kind: 'torsion' })).toEqual(lightTopTable());
  });
});

describe("Setup's tops as torsion boxes", () => {
  it('makes the island the same table as the island saying so of its own top', () => {
    const byTop = island((c) => (c.islands![0]!.top = { settings: { kind: 'torsion', torsion: lightTopTable() } }));
    const bySetup = island((c) => {
      c.tops = { ...starterTopSettings(), kind: 'torsion', torsion: lightTopTable() };
      c.islands![0]!.top = {};
    });
    expect(shape(bySetup)).toEqual(shape(byTop));
    expect(made(bySetup).some((p) => p.role === 'rib')).toBe(true);
    expect(made(bySetup).some((p) => p.name.startsWith('Countertop'))).toBe(false);
  });

  it('one top may still be a slab made here', () => {
    const project = island((c) => {
      c.tops = { ...starterTopSettings(), kind: 'torsion', torsion: lightTopTable() };
      c.islands![0]!.top = { settings: { kind: 'made' } };
    });
    const [piece] = topPieces(project, shop.materials);
    expect(piece!.torsion).toBeUndefined();
    expect(piece!.settings.kind).toBe('made');
    expect(made(project).some((p) => p.role === 'rib')).toBe(false);
    expect(made(project).some((p) => p.name === 'Countertop')).toBe(true);
  });
});

describe("one top that differs from Setup's", () => {
  it('a bought top on an island in a project of tops made here is drawn, not cut', () => {
    const project = island((c) => (c.islands![0]!.top = { settings: { kind: 'bought' } }));
    expect(made(project)).toEqual([]);
    expect(shownTopParts(project, shop.materials, shop.hardware).some((p) => p.name.startsWith('Countertop ('))).toBe(true);
  });

  it("the shop table says its kind and its box on the island's top, its size and leaf beside them", () => {
    const top = contextOf(createFoldingShopTableProject()).islands![0]!.top!;
    expect(top.settings).toEqual({ kind: 'torsion', torsion: lightTopTable() });
    expect(top.size).toBeDefined();
    expect(top.leaf!.length.mm).toBeCloseTo(len('28"').mm, 6);
  });
});

describe("Setup's two starting points", () => {
  it('only fill the values in: a box is one of them until its skins are changed', () => {
    expect(TORSION_STARTS.map((x) => x.value)).toEqual(['light', 'bench']);
    expect(torsionStartOf(lightTopTable())).toBe('light');
    expect(torsionStartOf(benchTopTable())).toBe('bench');
    expect(torsionStartOf({ ...lightTopTable(), skins: { topId: 'mdf-3-4', bottomId: 'mdf-1-4' } })).toBe('');
    // The ribs' height and spacing are the user's to change without leaving the starting point.
    expect(torsionStartOf({ ...benchTopTable(), ribs: { ...benchTopTable().ribs, height: len('5"') } })).toBe('bench');
  });

  it("names the box's materials once each, and every one is one of the shop's", () => {
    for (const start of TORSION_STARTS) {
      const ids = torsionMaterialIds(start.make());
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(shop.materials.some((m) => m.id === id)).toBe(true);
    }
  });

  it('each has a tile: the box cut through, its skins as thick as they are, both at one scale', () => {
    const [thin, thick] = [torsionTile(0.25), torsionTile(0.75)];
    expect(thin.shapes).toHaveLength(5);
    expect([thin.w, thin.h]).toEqual([thick.w, thick.h]);
    expect(JSON.stringify(thin.shapes)).not.toBe(JSON.stringify(thick.shapes));
  });
});
