// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOWRIDER_3 } from './lowRider';
import { CASE_SCREW_HOLE, cabinetsOf, deriveCabinetParts } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, ConstructionStyle, Feature, Part, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

/** Milestone 3: screws through the sides as a case joint. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
type Hole = Extract<Feature, { kind: 'hole' }>;

function build(style: ConstructionStyle, change: (c: CabinetDesign, p: Project) => void = (c) => (c.joinery.case = 'throughScrews')) {
  const project = createBaseCabinetProject(style);
  change(cabinetsOf(project)[0]!, project);
  return { project, cabinet: cabinetsOf(project)[0]!, parts: deriveCabinetParts(project, shop) };
}
const named = (parts: Part[], name: string) => parts.find((p) => p.name === name)!;
const screwHoles = (part: Part, key = '') => part.features.filter((f): f is Hole => f.kind === 'hole' && f.id.startsWith(`case-screw-${key}`));
const pocketHoles = (part: Part, prefix: string) => part.features.filter((f) => f.kind === 'pocketHole' && f.id.startsWith(prefix));

/** A point of a part's face A in the cabinet. */
function inCabinet(part: Part, x: number, y: number): [number, number, number] {
  const p = part.placement!;
  return [0, 1, 2].map((i) => p.origin[i]! + p.xAxis[i]! * x + p.yAxis[i]! * y) as [number, number, number];
}
/** The part's box in the cabinet: min and max on each axis. */
function boxOf(part: Part) {
  const p = part.placement!;
  const n = [p.xAxis[1]! * p.yAxis[2]! - p.xAxis[2]! * p.yAxis[1]!, p.xAxis[2]! * p.yAxis[0]! - p.xAxis[0]! * p.yAxis[2]!, p.xAxis[0]! * p.yAxis[1]! - p.xAxis[1]! * p.yAxis[0]!];
  const corners = [0, part.size.width].flatMap((x) => [0, part.size.height].flatMap((y) => [0, part.size.thickness].map((z) => inCabinet(part, x, y).map((v, i) => v - n[i]! * z))));
  return [0, 1, 2].map((i) => ({ min: Math.min(...corners.map((c) => c[i]!)), max: Math.max(...corners.map((c) => c[i]!)) }));
}

describe.each(['frameless', 'faceFrame'] as ConstructionStyle[])('through screws in a %s cabinet', (style) => {
  const { parts, cabinet } = build(style);
  const plain = deriveCabinetParts(createBaseCabinetProject(style), shop);
  const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;

  it('changes no size and takes the pocket holes out of the spanning parts', () => {
    expect(parts.map((p) => [p.name, p.size])).toEqual(plain.map((p) => [p.name, p.size]));
    for (const name of ['Bottom', 'Front stretcher', 'Back stretcher']) {
      expect(pocketHoles(named(parts, name), 'side-pocket'), name).toHaveLength(0);
      expect(pocketHoles(named(plain, name), 'side-pocket').length, name).toBeGreaterThan(0);
    }
    // The pocket holes that attach a face frame stay.
    expect(pocketHoles(named(parts, 'Bottom'), 'frame-pocket')).toHaveLength(style === 'faceFrame' ? 4 : 0);
  });

  it('puts a hole through each side for every screw, as many as the pocket holes it replaces', () => {
    for (const side of ['Left side', 'Right side']) {
      const part = named(parts, side);
      const end = side === 'Left side' ? 'left' : 'right';
      for (const [key, name] of [['bottom', 'Bottom'], ['stretcher-front', 'Front stretcher'], ['stretcher-back', 'Back stretcher']] as const) {
        const holes = screwHoles(part, key);
        expect(holes.length, `${side} ${key}`).toBe(pocketHoles(named(plain, name), `side-pocket-${end}`).length);
        for (const hole of holes) {
          // From the inside face, right through, clear for the screw.
          expect(hole.face).toBe('A');
          expect(hole.depth).toBeCloseTo(t, 5);
          expect(hole.diameter).toBe(CASE_SCREW_HOLE);
          // It comes out in the middle of the thickness of the part it holds, inside its end.
          const at = inCabinet(part, hole.center.x, hole.center.y);
          const box = boxOf(named(parts, name));
          const thin = box.findIndex((b, i) => i !== 0 && Math.abs(b.max - b.min - t) < 0.01);
          expect(at[thin], `${hole.id} centred`).toBeCloseTo((box[thin]!.min + box[thin]!.max) / 2, 3);
          for (const i of [1, 2]) {
            expect(at[i]!, hole.id).toBeGreaterThan(box[i]!.min + hole.diameter);
            expect(at[i]!, hole.id).toBeLessThan(box[i]!.max - hole.diameter);
          }
        }
      }
    }
  });

  it('mirrors the two sides', () => {
    const left = named(parts, 'Left side');
    const right = named(parts, 'Right side');
    expect(screwHoles(right).map((h) => [h.id, +(right.size.width - h.center.x).toFixed(3), +h.center.y.toFixed(3)])).toEqual(
      screwHoles(left).map((h) => [h.id, +h.center.x.toFixed(3), +h.center.y.toFixed(3)]),
    );
  });

  it('keeps the shelf-pin holes clear of the screw holes', () => {
    const side = named(parts, 'Left side');
    const pins = side.features.filter((f): f is Hole => f.kind === 'hole' && f.id.startsWith('shelf-pin'));
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) for (const screw of screwHoles(side)) expect(Math.hypot(pin.center.x - screw.center.x, pin.center.y - screw.center.y)).toBeGreaterThan(pin.diameter / 2 + screw.diameter / 2 + 2.9);
  });

  it('drills them in one row of the plan with the side unflipped, and lists the screws', async () => {
    const { project } = build(style);
    const job = buildJob(project, shop);
    const row = job.plan.operations.find((o) => o.key === 'case:holes:case-screw@4.76')!;
    expect(row.label).toBe('Case: case screw holes');
    expect(row.method).toBe('cnc');
    expect(row.clearToolId).toBeTruthy();
    expect(row.face).toBe('A');
    expect(row.source.kind === 'features' && row.source.refs.length).toBe(2 * screwHoles(named(parts, 'Left side')).length);
    // The sides are cut in one setup each: nothing on their outside face.
    const sideBlanks = job.plan.blanks.filter((b) => b.partIds.some((id) => id.endsWith('/side-left') || id.endsWith('/side-right')));
    expect(sideBlanks.length).toBeGreaterThan(0);
    for (const blank of sideBlanks) expect(blank.setups.filter((s) => s.operationKeys.length > 0).length).toBe(1);
    const lists = buildLists(job, project, shop, L);
    const screws = lists.hardware.find((h) => /#8 × 2" wood screws/.test(h.item))!;
    expect(screws.quantity).toBe(2 * screwHoles(named(parts, 'Left side')).length);
    expect(lists.parts.find((p) => p.name === 'Left side')!.steps.map((s) => s.label)).toContain(`${screws.quantity! / 2} case screw holes`);
    // No pocket screws are left for the case joints.
    const pocketScrews = lists.hardware.filter((h) => /pocket screws/.test(h.item)).reduce((n, h) => n + (h.quantity ?? 0), 0);
    const pockets = [...job.parts, ...job.cabinetParts].reduce((n, p) => n + p.features.filter((f) => f.kind === 'pocketHole').length, 0);
    expect(pocketScrews).toBe(pockets);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
    }
    // The holes go through the side and no deeper than the blank.
    for (const [i, file] of job.files.entries()) {
      const program = job.programs[i]!;
      const blank = job.plan.blanks.find((b) => b.id === program.blank.id)!;
      const deepest = -Math.min(0, ...[...file.text.matchAll(/^G[123] .*?Z(-?[\d.]+)/gm)].map((m) => Number(m[1])));
      if (program.setup.pinHoles.length === 0) expect(deepest, file.name).toBeLessThanOrEqual(blank.size.thickness + THROUGH_EXTRA + 0.011);
    }
  });
});

describe('through screws for one part', () => {
  it('is a per-part override like the other joints', () => {
    const { parts } = build('frameless', (c) => (c.joinery.overrides = { bottom: 'throughScrews' }));
    const side = named(parts, 'Left side');
    expect(screwHoles(side, 'bottom').length).toBeGreaterThan(0);
    expect(screwHoles(side, 'stretcher')).toHaveLength(0);
    expect(pocketHoles(named(parts, 'Bottom'), 'side-pocket')).toHaveLength(0);
    expect(pocketHoles(named(parts, 'Front stretcher'), 'side-pocket').length).toBeGreaterThan(0);
  });

  it('follows a flat back stretcher and a flat bottom', () => {
    const { parts, cabinet } = build('frameless', (c) => {
      c.joinery.case = 'throughScrews';
      c.joinery.backStretcherForm = 'flat';
      c.toeKick.off = true;
    });
    const t = shop.materials.find((m) => m.id === cabinet.materials.caseId)!.measuredThickness.mm;
    const side = named(parts, 'Left side');
    expect(screwHoles(side, 'bottom').every((h) => Math.abs(h.center.y - t / 2) < 0.01)).toBe(true);
    expect(screwHoles(side, 'stretcher-back').every((h) => Math.abs(h.center.y - (cabinet.size.height.mm - t / 2)) < 0.01)).toBe(true);
    expect(screwHoles(side, 'stretcher-back')).toHaveLength(2);
  });
});
