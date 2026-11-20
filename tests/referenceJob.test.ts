// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { cabinetsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import type { ConstructionStyle, PlanWarning, PocketHoleMethod } from '@/model';
import { activeMachine } from '@/plan';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/**
 * Milestone 2's acceptance: the reference cabinet (a base cabinet, a drawer over a
 * pair of doors) comes out complete in both construction styles, with pocket holes
 * by Kreg jig and CNC-assisted. Complete means every part and every feature of the
 * design is made by something the job says: a file, the cut list, or a hand step.
 */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);

/** Warnings that mean the job cannot be made as planned. The others are things to check. */
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];

function referenceJob(style: ConstructionStyle, pockets: PocketHoleMethod) {
  const shop = lowRiderJobShop();
  const project = createBaseCabinetProject(style);
  if (pockets === 'cncAssisted') project.plan.pocketHoles = pockets;
  const job = buildJob(project, shop);
  return { shop, project, job, all: [...job.parts, ...job.cabinetParts], lists: buildLists(job, project, shop, L) };
}

const variants: [ConstructionStyle, PocketHoleMethod, { parts: number; blanks: number; files: number }][] = [
  ['frameless', 'kregJig', { parts: 16, blanks: 5, files: 7 }],
  ['frameless', 'cncAssisted', { parts: 16, blanks: 6, files: 8 }],
  ['faceFrame', 'kregJig', { parts: 23, blanks: 4, files: 5 }],
  ['faceFrame', 'cncAssisted', { parts: 23, blanks: 5, files: 6 }],
];

describe.each(variants)('the reference cabinet, %s with pocket holes by %s', (style, pockets, counts) => {
  const { shop, project, job, all, lists } = referenceJob(style, pockets);
  const planOf = (partId: string) => job.plan.parts.find((p) => p.partId === partId);
  /** Fronts have no part plan: they are always cut out on the CNC. */
  const onCnc = (partId: string) => (planOf(partId)?.cutOut ?? 'cnc') === 'cnc';

  it('plans with nothing in the way', () => {
    expect(all).toHaveLength(counts.parts);
    expect(job.plan.blanks).toHaveLength(counts.blanks);
    expect(job.files).toHaveLength(counts.files);
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    expect(job.plan.operations.flatMap((o) => o.warnings).filter((w) => BLOCKING.includes(w.code))).toEqual([]);
  });

  it('cuts every part out once: on one blank, or on the saw cut list', () => {
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    for (const part of all) {
      const blanks = job.plan.blanks.filter((b) => b.partIds.includes(part.id));
      expect(blanks, part.name).toHaveLength(onCnc(part.id) ? 1 : 0);
      expect(cut.filter((name) => name === part.name), part.name).toHaveLength(onCnc(part.id) ? 0 : 1);
    }
    // A blank fits the stock and the machine.
    const machine = activeMachine(shop);
    const { stock } = job.plan;
    for (const blank of job.plan.blanks) {
      // A sheet without grain may lie either way round on the machine.
      expect(Math.min(blank.size.width, blank.size.height)).toBeLessThanOrEqual(Math.min(stock.width, stock.height) + 0.01);
      expect(Math.max(blank.size.width, blank.size.height)).toBeLessThanOrEqual(Math.max(stock.width, stock.height) + 0.01);
      expect(blank.size.width).toBeLessThanOrEqual(machine.cuttingArea.x.mm + 0.01);
      expect(blank.size.height).toBeLessThanOrEqual(machine.cuttingArea.y.mm + 0.01);
    }
  });

  it('makes every feature: in a row of the plan, with the Kreg jig, or on the saw', () => {
    const planned = new Set(
      job.plan.operations.flatMap((o) => (o.source.kind === 'features' ? o.source.refs.map((r) => `${r.partId}:${r.featureId}`) : [])),
    );
    const kregParts = new Set(lists.kreg.map((k) => k.part));
    const missing: string[] = [];
    for (const part of all) {
      for (const feature of part.features) {
        if (planned.has(`${part.id}:${feature.id}`)) continue;
        // A saw cuts the part's outline; the Kreg jig drills what the CNC does not prep.
        if (feature.kind === 'cutout' && !onCnc(part.id)) continue;
        if (feature.kind === 'pocketHole' && kregParts.has(part.name)) continue;
        missing.push(`${part.name}: ${feature.id}`);
      }
    }
    expect(missing).toEqual([]);
    // Every row has a method, and every CNC row a bit.
    for (const op of job.plan.operations.filter((o) => o.kind !== 'install')) {
      if (op.method === 'cnc') expect(op.clearToolId, op.label).toBeTruthy();
    }
  });

  it('counts every pocket hole once: prepped on the CNC or drilled with the Kreg jig', () => {
    const holes = all.reduce((n, p) => n + p.features.filter((f) => f.kind === 'pocketHole').length, 0);
    const kreg = lists.kreg.reduce((n, k) => n + k.at.length, 0);
    const prepped = pockets === 'cncAssisted' ? (job.plan.pocketHoles?.cncAssisted ?? 0) : 0;
    expect(job.plan.pocketHoles?.count).toBe(holes);
    expect(kreg + prepped).toBe(holes);
    const screws = lists.hardware.filter((h) => /pocket screws/.test(h.item)).reduce((n, h) => n + (h.quantity ?? 0), 0);
    expect(screws).toBe(holes);
  });

  it('writes a file for every setup that cuts, and each one parses and follows the post rules', async () => {
    const cutting = job.plan.blanks.flatMap((b) => b.setups.filter((s) => s.operationKeys.length > 0));
    expect(job.programs).toHaveLength(cutting.length);
    expect(new Set(job.files.map((f) => f.name)).size).toBe(job.files.length);
    for (const [i, file] of job.files.entries()) {
      const lines = file.text.split('\n');
      expect(file.name.endsWith('.gcode')).toBe(true);
      expect(lines.every((l) => new TextEncoder().encode(l).length <= 127), file.name).toBe(true);
      expect(lines.some((l) => /^M0?[345]\b/.test(l)), file.name).toBe(false);
      expect(lines).toContain('G21 G90 G17 G94');
      // Z is probed at the start and after every bit change: a pause to attach the probe, the touch, a pause to take it off.
      const attach = lines.filter((l) => /^M0 \(MSG, .*[Aa]ttach the probe/.test(l)).length;
      const changes = lines.filter((l) => l.startsWith('M0 (MSG, Router OFF. Change to ')).length;
      const probes = lines.filter((l) => l.startsWith('G38.2 Z-80 F180')).length;
      expect(changes, file.name).toBeGreaterThanOrEqual(job.programs[i]!.toolIds.length - 1);
      expect(attach, file.name).toBe(changes + 1);
      expect(probes, file.name).toBe(attach);
      expect(lines.filter((l) => l.startsWith('M0 (MSG, Remove probe. Router ON')).length, file.name).toBe(attach);
      // Nothing cuts below the blank except the pin holes, which stop in the spoilboard.
      const program = job.programs[i]!;
      const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      const pins = program.setup.pinHoles.length > 0;
      expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + (pins ? activeMachine(shop).flipPins.spoilboardDepth : 0) + THROUGH_EXTRA + 0.011);
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
  });

  it('lists every part with a label, and the hardware the design calls for', () => {
    expect(lists.parts).toHaveLength(all.length);
    expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
    const items = lists.hardware.map((h) => h.item).join('\n');
    expect(items).toMatch(style === 'frameless' ? /frameless clip hinge/ : /Blum Compact 38N/);
    expect(items).toMatch(/shelf pin/);
    expect(items).toMatch(/slide/);
    expect(items).toMatch(/pocket screws/);
    if (style === 'frameless') expect(items).toMatch(/Hinge mounting plates/);
    else expect(lists.shims?.quantity).toBeGreaterThan(0);
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop)).filter((s) => s.startsWith('Run '))).toHaveLength(job.files.length);
  });
});

describe('switching the construction style', () => {
  it('changes the parts, the overlays and the hardware with nothing re-entered', () => {
    const shop = lowRiderJobShop();
    const project = createBaseCabinetProject('frameless');
    const before = buildJob(project, shop);
    const cabinet = cabinetsOf(project)[0]!;
    cabinet.construction = 'faceFrame';
    const after = buildJob(project, shop);
    const names = (job: typeof before) => job.cabinetParts.map((p) => p.name);
    expect(names(before)).not.toContain('Left stile');
    expect(names(after)).toEqual(expect.arrayContaining(['Left stile', 'Right stile', 'Top rail', 'Middle rail', 'Bottom rail']));
    const door = (job: typeof before) => job.parts.find((p) => p.name === 'Left door')!.size;
    expect(door(after).width).toBeLessThan(door(before).width);
    const hinge = (job: typeof before) => buildLists(job, project, shop, L).hardware.find((h) => /clip hinge|Blum Compact/.test(h.item))!.item;
    expect(hinge(before)).toMatch(/frameless/i);
    expect(hinge(after)).toMatch(/Blum Compact/);
    // And back again: the same job as before.
    cabinet.construction = 'frameless';
    expect(buildJob(project, shop).files.map((f) => f.text)).toEqual(before.files.map((f) => f.text));
  });
});
