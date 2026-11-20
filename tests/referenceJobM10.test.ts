// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, designsOf, partTitle } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { ConstructionStyle, PlanWarning, Project } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject, setBays } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/**
 * Milestone 10's acceptance: a 42" base cabinet of two bays, a drawer over a pair of doors in
 * each, in every construction style (`?sample=cabinet|faceframe|shop&width=42&bays=2`), and
 * the face frame one with a partition behind its mullion, comes out complete as one job:
 * a front on every opening, every part cut once, every feature made, every file parsing and
 * following the post rules, and the project surviving export and import.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const shop = createStarterShop();

function twoBays(style: ConstructionStyle, partitions = false): Project {
  const project = style === 'shop' ? createShopCabinetProject('drawerOverDoors') : createBaseCabinetProject(style, 'drawerOverDoors');
  const cabinet = cabinetsOf(project)[0]!;
  cabinet.size.width = len('42"');
  setBays(project, cabinet, 2);
  if (!partitions && style === 'faceFrame') cabinet.layout = { ...cabinet.layout, partitions: false };
  return project;
}

function complete(name: string, style: ConstructionStyle, partitions = false) {
  describe(`${name}: complete`, () => {
    const project = twoBays(style, partitions);
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    const lists = buildLists(job, project, shop, L);
    const onCnc = (partId: string) => (job.plan.parts.find((p) => p.partId === partId)?.cutOut ?? 'cnc') === 'cnc';

    it('plans with nothing in the way', () => {
      expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    });

    it('has a front on every opening of both bays, and what stands between them', () => {
      const openings = deriveCabinetOpenings(cabinetsOf(project)[0]!, project.materials);
      expect(openings).toHaveLength(4);
      for (const o of openings) expect(designsOf(project).filter((d) => d.mounting.openingId === o.id), o.name).toHaveLength(1);
      if (style !== 'faceFrame' || partitions) expect(all.filter((p) => p.role === 'partition')).toHaveLength(1);
      if (style === 'faceFrame') expect(all.some((p) => p.id.endsWith('/frame-mullion-1'))).toBe(true);
    });

    it('cuts every part once and makes every feature', () => {
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

    it('survives export and import, and gives the same job again', () => {
      const file = parseProjectFile(serializeProjectFile(exportProject(project, shop)));
      expect(file.project).toEqual(project);
      expect(buildJob(file.project, shop).files.map((f) => f.text)).toEqual(job.files.map((f) => f.text));
    });
  });
}

complete('Frameless, two bays', 'frameless');
complete('Shop style, two bays', 'shop');
complete('Face frame, two bays, a mullion', 'faceFrame');
complete('Face frame, two bays, a partition behind the mullion', 'faceFrame', true);
