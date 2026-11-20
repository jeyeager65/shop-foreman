// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boxOffFloor, cabinetsOf, casterGroups, casterLoadProblems, partTitle, setBottomKind } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, PlanWarning, Project } from '@/model';
import { activeMachine } from '@/plan';
import { createShopTableProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/**
 * Milestone 9's acceptance: the shop table (`?sample=shoptable&bottom=casters`), its
 * cabinets on casters, comes out complete as one job: every cabinet a doubled bottom, a set of
 * casters under the front row and under each of the two back cabinets (the
 * table stands on cabinets at its two ends, the middle open: three groups, not one island), every
 * pilot hole made on the CNC, the files parsing and following the post rules, the lists
 * and the checklist putting the casters on, the casters carrying the table, and the project
 * surviving export and import.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();

function onCasters(): Project {
  const project = createShopTableProject();
  const context = project.context as CasesContext;
  // The front row's bottom is its run's; the two back cabinets, in no run, follow the project's.
  for (const run of context.runs) setBottomKind(run.shared.toeKick, 'casters', shop.hardware);
  setBottomKind(context.settings.toeKick, 'casters', shop.hardware);
  // A heavy table: a second layer under every cabinet, the two on their own too (left to itself, a cabinet on its own has pads).
  context.settings.toeKick.casters!.under = 'layer';
  return project;
}

describe('The shop table on casters: complete', () => {
  const project = onCasters();
  const job = buildJob(project, shop);
  const all = [...job.cabinetParts, ...job.parts];
  const lists = buildLists(job, project, shop, L);
  const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';

  it('plans with nothing in the way', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });

  it('gives every cabinet a doubled bottom, and puts a set of casters under the front row and under each back cabinet', () => {
    const cabinets = cabinetsOf(project);
    const layers = all.filter((p) => p.id.endsWith('/bottom-under'));
    expect(layers.map((p) => p.designObjectId).sort()).toEqual(cabinets.map((c) => c.id).sort());
    const groups = casterGroups(project, shop.hardware);
    // The front row of two 24" cabinets: a line at each end and at the join (48" is more than 36" between lines). Each back cabinet: four.
    expect(groups.map((g) => g.places.length).sort()).toEqual([4, 4, 6]);
    const holes = layers.reduce((n, p) => n + p.features.filter((f) => f.kind === 'hole' && f.id.startsWith('caster-screw')).length, 0);
    expect(holes).toBe(4 * 14);
  });

  it('cuts every part once and makes every feature, the pilot holes on the CNC', () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    const planned = new Set(job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])));
    const kregLabels = new Set(lists.kreg.map((k) => k.label));
    const missing: string[] = [];
    for (const part of all) {
      const label = lists.parts.find((p) => p.partId === part.id)!.label;
      expect(job.plan.blanks.filter((b) => b.partIds.includes(part.id)), partTitle(part)).toHaveLength(onCnc(part.id) ? 1 : 0);
      for (const feature of part.features) {
        if (planned.has(`${part.id}:${feature.id}`)) continue;
        if (feature.kind === 'cutout' && !onCnc(part.id)) continue;
        if (feature.kind === 'pocketHole' && kregLabels.has(label)) continue;
        missing.push(`${partTitle(part)}: ${feature.id}`);
      }
    }
    expect(missing).toEqual([]);
    expect(all.filter((p) => p.id.endsWith('/bottom-under')).every((p) => onCnc(p.id))).toBe(true);
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

  it('lists the casters and builds them on; they carry the table', () => {
    const rows = lists.hardware.filter((h) => h.group === 'Casters');
    // A row for each group: six under the front row, four under each back cabinet.
    const casters = rows.filter((r) => r.item === 'Generic 3" swivel plate caster, with brake');
    expect(casters.reduce((n, r) => n + (r.quantity ?? 0), 0)).toBe(14);
    const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop), shop.hardware);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('Casters: the island "Shop table"');
    // The casters go on before the table.
    expect(titles.indexOf('Casters: the island "Shop table"')).toBeLessThan(titles.indexOf('Tops'));
    expect(casterLoadProblems(casterGroups(project, shop.hardware), all, project.materials)).toEqual([]);
  });

  it('stands the boxes the layer and the casters off the floor', () => {
    expect(L(boxOffFloor(cabinetsOf(project)[0]!, project.materials, shop.hardware)!)).toBe('4-23/32"');
  });

  it('survives export and import, and gives the same job again', () => {
    const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
    expect(file.project).toEqual(project);
    expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
  });
});
