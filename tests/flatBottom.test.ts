// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveParts } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { ConstructionStyle, Part } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** Milestone 3: a cabinet with a flat bottom and no toe kick. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);

function flat(style: ConstructionStyle) {
  const project = createBaseCabinetProject(style);
  cabinetsOf(project)[0]!.toeKick.off = true;
  return project;
}
const byName = (parts: Part[], name: string) => parts.find((p) => p.name === name)!;
const cutout = (part: Part) => part.features.find((f) => f.kind === 'cutout')!;

describe.each(['frameless', 'faceFrame'] as ConstructionStyle[])('a %s cabinet with a flat bottom', (style) => {
  const project = flat(style);
  const cabinet = cabinetsOf(project)[0]!;
  const parts = deriveCabinetParts(project, shop);
  const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
  const H = cabinet.size.height.mm;

  it('has plain rectangular sides and no toe kick board', () => {
    expect(parts.map((p) => p.name)).not.toContain('Toe kick');
    for (const name of ['Left side', 'Right side']) {
      const side = byName(parts, name);
      const outline = cutout(side);
      expect(outline.kind === 'cutout' && outline.outline).toHaveLength(4);
      expect(side.size.height).toBeCloseTo(H, 5);
    }
  });

  it('puts the underside of the bottom at the floor line, and the back down to it', () => {
    const bottom = byName(parts, 'Bottom');
    // Face A of the bottom is its top; the placement's origin is on that face.
    expect(bottom.placement!.origin[1]).toBeCloseTo(t, 5);
    const back = byName(parts, 'Back');
    expect(back.placement!.origin[1]).toBeCloseTo(0, 5);
    expect(back.size.height).toBeCloseTo(H, 5);
  });

  it('keeps the toe kick sizes in the project and gives the same cabinet back', () => {
    expect(cabinet.toeKick.height.mm).toBeGreaterThan(0);
    const again = structuredClone(project);
    delete cabinetsOf(again)[0]!.toeKick.off;
    expect(deriveCabinetParts(again, shop)).toEqual(deriveCabinetParts(createBaseCabinetProject(style), shop));
  });

  it('starts the openings and the fronts at the bottom of the case', () => {
    const openings = deriveCabinetOpenings(cabinet, shop.materials);
    const lowest = openings.at(-1)!;
    if (style === 'frameless') {
      expect(lowest.origin.y).toBeCloseTo(t, 5);
      const door = byName(deriveParts(project, shop), 'Left door');
      expect(door.placement!.origin[1]).toBeCloseTo(cabinet.frameless.reveal.mm, 5);
    } else {
      // The frame runs to the floor line; its bottom rail stands above the bottom as a lip.
      expect(lowest.origin.y).toBeCloseTo(cabinet.faceFrame.railWidth.mm, 5);
      expect(byName(parts, 'Left stile').size.height).toBeCloseTo(H, 5);
      expect(byName(parts, 'Bottom rail').placement!.origin[1]).toBeCloseTo(0, 5);
    }
  });

  it('plans and writes files like the cabinet with a toe kick', async () => {
    const job = buildJob(project, shop);
    const with_ = buildJob(createBaseCabinetProject(style), shop);
    expect(job.plan.blanks).toHaveLength(with_.plan.blanks.length);
    expect(job.files).toHaveLength(with_.files.length);
    expect(job.plan.warnings.map((w) => w.code).sort()).toEqual(with_.plan.warnings.map((w) => w.code).sort());
    // Every part is cut once: on a blank or on the saw.
    const lists = buildLists(job, project, shop, L);
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    for (const part of [...job.parts, ...job.cabinetParts]) {
      const onBlank = job.plan.blanks.filter((b) => b.partIds.includes(part.id)).length;
      expect(onBlank + cut.filter((n) => n === part.name).length, part.name).toBe(1);
    }
    // The probe spot of each setup is where it was: on the blank's front-left corner waste.
    expect(job.programs[0]!.setup.probeSpot.at).toBeDefined();
    expect(job.programs.map((p) => p.setup.probeSpot)).toEqual(with_.programs.map((p) => p.setup.probeSpot));
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      expect(file.text.split('\n').every((l) => new TextEncoder().encode(l).length <= 127)).toBe(true);
    }
    // Two whole jobs are built here: allow for a busy machine.
  }, 30000);
});
