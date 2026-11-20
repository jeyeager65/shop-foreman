// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, piecesOf, storedCases } from '@/design';
import type { CasesContext } from '@/model';
import { addWallCabinet, copyCabinet, createBaseCabinetProject, createKitchenProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';

/** Furniture: the project holds pieces, each of a kind; a cabinet is the piece that is a case. */
describe('pieces', () => {
  it('are what a project holds; every one made today is a case', () => {
    for (const project of [createBaseCabinetProject('faceFrame'), createKitchenProject(), createVanityProject()]) {
      const context = project.context as CasesContext;
      expect('cabinets' in context).toBe(false);
      expect(context.pieces.length).toBeGreaterThan(0);
      expect(context.pieces.every((p) => p.kind === 'case')).toBe(true);
      // Every piece, of any kind, and the cases among them: the same list while a case is the only kind.
      expect(piecesOf(project)).toBe(context.pieces);
      expect(storedCases(context).map((p) => p.id)).toEqual(context.pieces.map((p) => p.id));
      // A cabinet is a case with its settings resolved, and says so.
      expect(cabinetsOf(project).map((c) => [c.id, c.kind])).toEqual(context.pieces.map((p) => [p.id, 'case']));
    }
  });

  it('keep their kind when one is added or copied', () => {
    const project = createBaseCabinetProject('frameless');
    addWallCabinet(project, { name: 'Wall' });
    copyCabinet(project, cabinetsOf(project)[0]!.id);
    expect(piecesOf(project).map((p) => p.kind)).toEqual(['case', 'case', 'case']);
    // The kind is the piece's, not a setting: it is not among what a resolved cabinet lists.
    expect(Object.keys(cabinetsOf(project)[0]!)).not.toContain('kind');
  });
});
