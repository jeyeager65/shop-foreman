// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DOOR_STANDOFF,
  cabinetsOf,
  constructionRules,
  deriveCabinetOpenings,
  deriveCabinetParts,
  deriveDrawerBoxParts,
  deriveParts,
  doorSetOf,
  hingeFor,
  hungDesigns,
  isDoorSet,
} from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { BLUM_INSET_HINGE_ID, GENERIC_INSET_HINGE_ID, MDF_ID, PLYWOOD_1_2_ID, PLYWOOD_3_4_ID, createStarterShop } from '@/libraries';
import type { Feature, Part, PlanWarning } from '@/model';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 3: the shop style, a frameless case with inset slab doors. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const BLOCKING: PlanWarning['code'][] = ['noCapableTool', 'blankTooSmall', 'outsideCuttingArea', 'stockTooSmall', 'unsupported', 'deeperThanCuttingLength', 'deeperThanVMax'];
const t = shop.materials.find((m) => m.id === PLYWOOD_3_4_ID)!.measuredThickness.mm;
const named = (parts: Part[], name: string) => parts.find((p) => p.name === name)!;
type Hole = Extract<Feature, { kind: 'hole' }>;
const plateHoles = (part: Part) => part.features.filter((f): f is Hole => f.kind === 'hole' && f.id.startsWith('hinge-plate'));

describe('the shop style', () => {
  const project = createShopCabinetProject();
  const cabinet = cabinetsOf(project)[0]!;
  const gap = cabinet.shop.gap.mm;

  it('is the frameless case with inset fronts and bare edges', () => {
    const rules = constructionRules(cabinet, shop.materials);
    expect(rules).toMatchObject({ hasFaceFrame: false, hingeMount: 'sidePlate', fullOverlay: null, inset: { gap }, frontEdgeBand: 0, divider: 0, frontPlane: 0 });
    expect(gap).toBeCloseTo(3.175, 5);
    const frameless = structuredClone(project);
    cabinetsOf(frameless)[0]!.construction = 'frameless';
    const caseOf = (p: typeof project) => deriveCabinetParts(p, shop).filter((part) => part.role !== 'shelf').map((part) => [part.name, part.size, part.features.filter((f) => !f.id.startsWith('hinge-plate') && !f.id.startsWith('shelf-pin') && !f.id.startsWith('slide-screw'))]);
    expect(caseOf(project)).toEqual(caseOf(frameless));
  });

  it('gives each opening the gap all round, and neighbours one gap between them', () => {
    const [drawer, doors] = deriveCabinetOpenings(cabinet, shop.materials);
    expect(drawer!.fixedOverlay).toEqual({ side: -gap, top: -gap, bottom: -gap / 2 });
    expect(doors!.fixedOverlay).toEqual({ side: -gap, top: -gap / 2, bottom: -gap });
    expect(doors!.inset).toEqual({ gap, frontMaterialId: PLYWOOD_3_4_ID });
  });

  it('hangs the doors inset: slab, from the case material, on the generic inset hinge', () => {
    const hung = hungDesigns(project, shop).find(isDoorSet)!;
    expect(hung.mounting.type).toBe('inset');
    expect(hung.style).toEqual({ kind: 'slab' });
    expect(hung.outsideEdge).toEqual({ kind: 'square' });
    expect(hung.materialId).toBe(PLYWOOD_3_4_ID);
    // What the doors are in the other styles is kept.
    expect(doorSetOf(project).style.kind).toBe('shaker');
    expect(doorSetOf(project).materialId).toBe(MDF_ID);
    // The reference cabinet names Blum's inset hinge; without a choice it is the generic one.
    expect(hingeFor(hung.mounting, 'shop', shop.hardware).id).toBe(BLUM_INSET_HINGE_ID);
    expect(hingeFor({ ...hung.mounting, shopHingeId: undefined }, 'shop', shop.hardware).id).toBe(GENERIC_INSET_HINGE_ID);
  });

  it('sizes the doors to the opening less the gaps and sets them flush with the case front', () => {
    const fronts = deriveParts(project, shop);
    const opening = deriveCabinetOpenings(cabinet, shop.materials)[1]!;
    const left = named(fronts, 'Left door');
    const right = named(fronts, 'Right door');
    const pairGap = doorSetOf(project).mounting.gap.mm;
    expect(left.size.width).toBeCloseTo((opening.width - 2 * gap - pairGap) / 2, 5);
    expect(left.size.height).toBeCloseTo(opening.height - gap - gap / 2, 5);
    expect(left.size.thickness).toBeCloseTo(t, 5);
    expect(left.grain).toBe('height');
    // In the opening: the gap from the left side and from the bottom; the face at the case front.
    expect(left.placement!.origin[0]).toBeCloseTo(opening.origin.x + gap, 5);
    expect(left.placement!.origin[1]).toBeCloseTo(opening.origin.y + gap, 5);
    expect(left.placement!.origin[2]).toBeCloseTo(0, 5);
    expect(right.placement!.origin[0] + right.size.width).toBeCloseTo(opening.origin.x + opening.width - gap, 5);
    // No panel, no edge profile: cups and the cutout only.
    expect([...new Set(left.features.map((f) => f.kind))].sort()).toEqual(['cup', 'cutout']);
    // The drawer front above leaves one gap.
    const drawer = deriveDrawerBoxParts(project, shop).find((p) => p.role === 'boxFront')!;
    expect(drawer.placement!.origin[1] - (left.placement!.origin[1] + left.size.height)).toBeCloseTo(gap, 5);
  });

  it('drills the plate holes behind the back of the doors, at the height of the cups', () => {
    const parts = deriveCabinetParts(project, shop);
    const hinge = hingeFor(doorSetOf(project).mounting, 'shop', shop.hardware);
    const door = named(deriveParts(project, shop), 'Left door');
    const cups = door.features.filter((f) => f.kind === 'cup');
    const left = named(parts, 'Left side');
    const holes = plateHoles(left);
    expect(holes).toHaveLength(2 * cups.length);
    for (const hole of holes) expect(hole.center.x).toBeCloseTo(hinge.plate!.setback + t, 5);
    const heights = [...new Set(holes.map((h) => +h.center.y.toFixed(3)))];
    cups.forEach((cup, i) => {
      if (cup.kind !== 'cup') return;
      const y = door.placement!.origin[1] + cup.center.y;
      expect((heights[2 * i]! + heights[2 * i + 1]!) / 2).toBeCloseTo(y, 2);
    });
    expect(plateHoles(named(parts, 'Right side'))).toHaveLength(holes.length);
  });

  it('stops the shelf behind the doors', () => {
    const shelf = named(deriveCabinetParts(project, shop), 'Shelf');
    expect(-shelf.placement!.origin[2]).toBeCloseTo(t + DOOR_STANDOFF, 5);
    const frameless = structuredClone(project);
    cabinetsOf(frameless)[0]!.construction = 'frameless';
    expect(shelf.size.height).toBeLessThan(named(deriveCabinetParts(frameless, shop), 'Shelf').size.height);
  });

  it('takes its own doors once they are edited, and follows their thickness', () => {
    const p = structuredClone(project);
    doorSetOf(p).shop = { style: { kind: 'slab' }, outsideEdge: { kind: 'roundover', radius: len('1/8"') }, materialId: PLYWOOD_1_2_ID };
    const thin = shop.materials.find((m) => m.id === PLYWOOD_1_2_ID)!.measuredThickness.mm;
    const door = named(deriveParts(p, shop), 'Left door');
    expect(door.size.thickness).toBeCloseTo(thin, 5);
    expect(door.placement!.origin[2]).toBeCloseTo(0, 5);
    expect(door.features.some((f) => f.kind === 'edgeProfile')).toBe(true);
    const parts = deriveCabinetParts(p, shop);
    const hinge = hingeFor(doorSetOf(p).mounting, 'shop', shop.hardware);
    expect(plateHoles(named(parts, 'Left side'))[0]!.center.x).toBeCloseTo(hinge.plate!.setback + thin, 5);
    expect(-named(parts, 'Shelf').placement!.origin[2]).toBeCloseTo(thin + DOOR_STANDOFF, 5);
  });

  it('switches to and from the other styles with nothing re-entered', () => {
    const p = createBaseCabinetProject('frameless');
    const before = JSON.stringify([deriveParts(p, shop), deriveCabinetParts(p, shop)]);
    cabinetsOf(p)[0]!.construction = 'shop';
    expect(named(deriveParts(p, shop), 'Left door').materialId).toBe(PLYWOOD_3_4_ID);
    cabinetsOf(p)[0]!.construction = 'frameless';
    expect(JSON.stringify([deriveParts(p, shop), deriveCabinetParts(p, shop)])).toBe(before);
  });

  it('refuses inset doors that have no cabinet gap to size them', () => {
    const p = createBaseCabinetProject('faceFrame');
    doorSetOf(p).mounting.type = 'inset';
    expect(() => deriveParts(p, shop)).toThrow(/shop style/);
  });
});

describe('the shop cabinet as a job', () => {
  const project = createShopCabinetProject();
  const job = buildJob(project, shop);
  const lists = buildLists(job, project, shop, L);
  const all = [...job.parts, ...job.cabinetParts];

  it('plans with nothing in the way, every part cut once', () => {
    expect(job.plan.warnings.filter((w) => BLOCKING.includes(w.code))).toEqual([]);
    const cut = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.names));
    for (const part of all) {
      const onBlank = job.plan.blanks.filter((b) => b.partIds.includes(part.id)).length;
      expect(onBlank + cut.filter((n) => n === part.name).length, part.name).toBe(1);
    }
    // The plywood doors lie with their grain along the sheet's.
    const doorBlank = job.plan.blanks.find((b) => b.partIds.includes('doors-1/door-left'))!;
    expect(doorBlank.materialId).toBe(PLYWOOD_3_4_ID);
  });

  it('lists the inset hinges and their plates', () => {
    const items = lists.hardware.map((h) => `${h.quantity ?? ''} ${h.item}`).join('\n');
    expect(items).toMatch(/4 Blum CLIP top BLUMOTION 110°, inset/);
    expect(items).toMatch(/4 Hinge mounting plates/);
    expect(items).not.toMatch(/Edge banding|pocket screws/);
  });

  it('writes files that parse', async () => {
    expect(job.files.length).toBeGreaterThan(0);
    for (const file of job.files) {
      const parser = new (loadGCodeTools().GCodeParser)();
      await parser.parseString(file.text);
      expect(parser.events.filter((e) => e.kind === 'alarm'), file.name).toEqual([]);
      expect(file.text.split('\n').every((l) => new TextEncoder().encode(l).length <= 127)).toBe(true);
    }
  });
});

describe('the Blum inset hinge (71B3750)', () => {
  const project = createShopCabinetProject();
  const hinge = hingeFor(doorSetOf(project).mounting, 'shop', shop.hardware);

  it('carries the numbers from Blum\'s sheets', () => {
    expect(hinge.id).toBe(BLUM_INSET_HINGE_ID);
    expect(hinge.cup).toEqual({ diameter: 35, depth: 13, boreDistance: 4 });
    // On a 0 mm plate the reveal is 7 less the boring distance; the side adjustment reaches the cabinet's 1/8" gap.
    expect(-hinge.overlay.mm).toBe(7 - hinge.cup.boreDistance);
    expect(Math.abs(3.175 + hinge.overlay.mm)).toBeLessThanOrEqual(hinge.sideAdjust!);
    expect(hinge.plate).toMatchObject({ setback: 38.5, spacing: 32 });
    expect([hinge.openingAngleDeg, hinge.close, hinge.attachment]).toEqual([110, 'soft', 'screwOn']);
  });

  it('puts the cups 4 mm from the door\'s edge and the plate holes the door\'s thickness + 38.5 behind the front edge', () => {
    const door = named(deriveParts(project, shop), 'Left door');
    const cup = door.features.find((f) => f.kind === 'cup')!;
    expect(cup.kind === 'cup' && cup.center.x).toBeCloseTo(4 + 35 / 2, 5);
    expect(cup.kind === 'cup' && cup.depth).toBe(13);
    const holes = plateHoles(named(deriveCabinetParts(project, shop), 'Left side'));
    for (const hole of holes) expect(hole.center.x).toBeCloseTo(t + 38.5, 5);
    expect(Math.abs(holes[0]!.center.y - holes[1]!.center.y)).toBeCloseTo(32, 5);
  });
});
