// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addMaterialFromCatalog, partTitle, starterTopSettings, topPieces } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID, createStarterShop, createStarterShopProfile } from '@/libraries';
import type { CasesContext, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createKitchenProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/**
 * Milestone 7's acceptance: the kitchen (milestone 6) with a countertop on both its base
 * runs comes out complete, as one job: tops made here meeting at a butt joint, the same at
 * a mitre, and bought laminate tops. Complete: every part (the tops' too) is cut once, on a
 * blank or the saw cut list, every feature is made, every file parses, the lists have the
 * tops' fasteners and the buying list what is bought, the build checklist puts the tops
 * on, and the project survives export and import.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();
const catalog = createStarterShopProfile().materialCatalog;

function kitchen(kind: 'made' | 'bought', joint?: 'mitre'): Project {
  const project = createKitchenProject();
  const context = project.context as CasesContext;
  context.runs[0]!.top = {};
  context.runs[1]!.top = joint ? { cornerJoint: joint } : {};
  context.tops = { ...starterTopSettings(), kind };
  for (const id of [PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(project, catalog, id);
  return project;
}

function complete(name: string, make: () => Project) {
  describe(`${name}: complete`, () => {
    const project = make();
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    const lists = buildLists(job, project, shop, L);
    const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';

    it('plans with nothing in the way', () => {
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    });

    it("cuts every part once, the tops' too", () => {
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
      const sawn = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.labels));
      for (const part of all) {
        const label = lists.parts.find((p) => p.partId === part.id)!.label;
        expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), partTitle(part)).toHaveLength(onCnc(part.id) ? 1 : 0);
        expect(sawn.filter((l) => l === label), partTitle(part)).toHaveLength(onCnc(part.id) ? 0 : 1);
      }
    });

    it('makes every feature, its joints\' pocket holes with the Kreg jig', () => {
      const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
      const kregLabels = new Set(lists.kreg.map((k) => k.label));
      const missing: string[] = [];
      for (const part of all) {
        const label = lists.parts.find((p) => p.partId === part.id)!.label;
        for (const feature of part.features) {
          if (planned.has(`${part.id}:${feature.id}`)) continue;
          if (feature.kind === 'cutout' && !onCnc(part.id)) continue;
          if (feature.kind === 'pocketHole' && kregLabels.has(label)) continue;
          missing.push(`${partTitle(part)}: ${feature.id}`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('writes files that parse and follow the post rules', async () => {
      for (const file of job.files) {
        const lines = file.text.split('\n');
        expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
        expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
        const parser = new (loadGCodeTools().GCodeParser)();
        await parser.parseString(file.text);
        expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      }
    });

    it('lists the tops and puts them on in the build checklist', () => {
      expect(lists.hardware.some((h) => h.group === 'Tops' && h.item.includes('wood screws'))).toBe(true);
      const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop));
      expect(sections.at(-1)!.title).toBe('Tops');
    });

    it('survives export and import, and gives the same job again', () => {
      const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
      expect(file.project).toEqual(project);
      expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
    });
  });
}

complete('The kitchen with tops made here, a butt joint at the corner', () => kitchen('made'));
complete('The kitchen with tops made here, a mitre at the corner', () => kitchen('made', 'mitre'));
complete('The kitchen with bought laminate tops', () => kitchen('bought'));

describe('the kitchen with tops', () => {
  it('made here: two pieces on the back run (split at a cabinet join), one on the left run, every top part on the job', () => {
    const project = kitchen('made');
    const pieces = topPieces(project, project.materials);
    expect(pieces.map((p) => [p.cabinetIds.length, p.ends.left, p.ends.right])).toEqual([
      [1, 'wall', 'joint'],
      [2, 'joint', 'open'],
      [2, 'open', 'joint'],
    ]);
    const job = buildJob(project, shop);
    const names = job.cabinetParts.filter((p) => p.role === 'top' || p.role === 'topEdge').map((p) => p.name);
    expect(names.filter((n) => n === 'Countertop')).toHaveLength(3);
    expect(names.filter((n) => n === 'Backsplash')).toHaveLength(3);
    expect(names).toContain('Side splash, left');
  });

  it('bought: nothing of the tops is cut; the lengths to buy are on the buying list', () => {
    const project = kitchen('bought');
    const job = buildJob(project, shop);
    expect(job.cabinetParts.some((p) => p.role === 'top' || p.role === 'topEdge')).toBe(false);
    expect(buildLists(job, project, shop, L).buying.filter((b) => b.material.startsWith('Laminate countertop'))).toHaveLength(2);
  });
});
