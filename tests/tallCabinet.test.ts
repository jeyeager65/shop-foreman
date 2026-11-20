// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, designsOf, fixedShelfTops, isDoorSet, layoutPresetOf, layoutsOf, partBox, shelfSpaces } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, Part, Project } from '@/model';
import { NEW_TALL_CABINET, addTallCabinet, applyCabinetLayout, createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Milestone 4: the tall cabinet, doors over doors and the fixed shelf. */
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const shop = createStarterShop();
const t = shop.materials.find((m) => m.id === 'plywood-3-4')!.measuredThickness.mm;

/** A project with the reference cabinet (A) and a tall cabinet (B), set up by `edit`. */
function withTall(style: 'frameless' | 'faceFrame' | 'shop', edit: (tall: CabinetDesign, project: Project) => void = () => {}) {
  const project = style === 'shop' ? createShopCabinetProject() : createBaseCabinetProject(style);
  const tall = addTallCabinet(project, { name: 'Tall' });
  edit(tall, project);
  const parts = [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop), ...deriveParts(project, shop)].filter((p) => p.tag === 'B');
  const part = (key: string) => parts.find((p) => p.id.endsWith(`/${key}`));
  const ids = (p: Part | undefined, prefix: string) => (p?.features ?? []).filter((f) => f.id.startsWith(prefix)).map((f) => f.id);
  return { project, tall, parts, part, ids, openings: deriveCabinetOpenings(tall, shop.materials) };
}

describe('a tall cabinet', () => {
  it('starts at the starter size as doors over doors, on the project\'s toe kick', () => {
    const { tall, project } = withTall('frameless');
    expect([tall.form, L(tall.size.width.mm), L(tall.size.height.mm), L(tall.size.depth.mm)]).toEqual(['tall', '24"', '84"', '24"']);
    expect(layoutPresetOf(tall.layout)).toEqual({ preset: 'doorsOverDoors', drawers: 0 });
    expect(tall.layout.rows).toEqual([{ id: 'doors-upper', use: 'doors', shelves: NEW_TALL_CABINET.upperShelves }, { id: 'doors', use: 'doors' }]);
    expect([tall.adjustableShelves, tall.toeKick.height, tall.overrides]).toEqual([NEW_TALL_CABINET.shelves, len('4-1/2"'), undefined]);
    // Its two door sets say which they are.
    expect(designsOf(project).filter(isDoorSet).filter((d) => d.mounting.openingId.startsWith(`${tall.id}/`)).map((d) => [d.mounting.openingId, d.name])).toEqual([
      ['cabinet-2/doors-upper', 'Upper doors'],
      ['cabinet-2/doors', 'Lower doors'],
    ]);
    // Doors over doors is the tall cabinet's alone.
    expect([layoutsOf('base'), layoutsOf('wall'), layoutsOf('tall')]).toEqual([['drawerOverDoors', 'doors', 'drawers'], ['doors'], ['doorsOverDoors', 'doors', 'drawerOverDoors', 'drawers']]);
    expect(() => applyCabinetLayout(project, cabinetsOf(project)[0]!, 'doorsOverDoors')).toThrow(/tall cabinet/);
  });

  it('has a full top like a wall cabinet and a toe kick like a base cabinet, and no stretchers or rails', () => {
    const { parts, part } = withTall('frameless');
    expect(parts.filter((p) => p.role).map((p) => p.name)).toEqual(['Left side', 'Right side', 'Bottom', 'Fixed shelf', 'Top', 'Back', 'Toe kick', 'Shelf 1', 'Shelf 2', 'Upper shelf']);
    expect(partBox(part('top')!).max[1]).toBeCloseTo(84 * 25.4, 6);
    const outline = part('side-left')!.features.find((f) => f.kind === 'cutout');
    expect(outline?.kind === 'cutout' && outline.outline).toHaveLength(6);
    expect(part('top')!.size).toEqual(part('bottom')!.size);
    // With a flat bottom its sides are plain, as a base cabinet's are.
    const flat = withTall('shop');
    const plain = flat.part('side-left')!.features.find((f) => f.kind === 'cutout');
    expect(plain?.kind === 'cutout' && plain.outline).toHaveLength(4);
    expect(flat.parts.some((p) => p.role === 'toeKick')).toBe(false);
  });
});

describe('doors over doors', () => {
  it('has two equal door openings with a fixed shelf between them, its top the floor of the upper one', () => {
    for (const style of ['frameless', 'shop', 'faceFrame'] as const) {
      const { openings, part, tall } = withTall(style);
      expect(openings.map((o) => [o.name, o.use])).toEqual([
        ['Door opening 1', 'doors'],
        ['Door opening 2', 'doors'],
      ]);
      const [upper, lower] = openings;
      expect(upper!.height).toBeCloseTo(lower!.height, 6);
      const shelf = partBox(part('fixed-shelf')!);
      expect(shelf.max[1]).toBeCloseTo(upper!.origin.y, 6);
      expect(shelf.max[1] - shelf.min[1]).toBeCloseTo(t, 6);
      expect(fixedShelfTops(tall, shop.materials)).toEqual([upper!.origin.y]);
      // Between the openings: the shelf's thickness, or behind a face frame the rail in front of it.
      const between = upper!.origin.y - (lower!.origin.y + lower!.height);
      expect(between).toBeCloseTo(style === 'faceFrame' ? 38.1 : t, 6);
      // It is the size of the bottom and lies over it.
      expect(part('fixed-shelf')!.size).toEqual(part('bottom')!.size);
      expect([shelf.min[0], shelf.min[2]]).toEqual([partBox(part('bottom')!).min[0], partBox(part('bottom')!).min[2]]);
    }
  });

  it('joins the fixed shelf to the sides the way the bottom is joined', () => {
    const screwed = withTall('frameless');
    const pockets = (p: Part) => p.features.filter((f) => f.kind === 'pocketHole').map((f) => [f.id, f.face]);
    expect(pockets(screwed.part('fixed-shelf')!)).toEqual(pockets(screwed.part('bottom')!));
    const dado = withTall('frameless', (tall) => (tall.joinery.case = 'dado'));
    expect(dado.ids(dado.part('side-left'), 'dado-')).toEqual(['dado-bottom', 'dado-fixed-shelf', 'dado-top']);
    expect(dado.part('fixed-shelf')!.size.width).toBeCloseTo(screwed.part('fixed-shelf')!.size.width + 12.7, 6);
    const through = withTall('shop');
    expect([...new Set(through.ids(through.part('side-right'), 'case-screw').map((id) => id.replace(/-\d+$/, '')))]).toEqual(['case-screw-bottom', 'case-screw-fixed-shelf', 'case-screw-top']);
    // Behind a face frame the fixed shelf is screwed to the middle rail, as the bottom is to the bottom rail.
    const framed = withTall('faceFrame');
    expect(framed.ids(framed.part('fixed-shelf'), 'frame-pocket').length).toBe(framed.ids(framed.part('bottom'), 'frame-pocket').length);
    expect(framed.parts.filter((p) => p.role === 'frameRail').map((p) => p.name)).toEqual(['Top rail', 'Middle rail', 'Bottom rail']);
  });

  it('hangs a pair of doors on each row, named upper and lower, that meet over the fixed shelf', () => {
    const { parts, openings } = withTall('frameless');
    const doors = parts.filter((p) => !p.role);
    expect(doors.map((p) => p.name)).toEqual(['Upper left door', 'Upper right door', 'Lower left door', 'Lower right door']);
    expect(new Set(doors.map((p) => p.id)).size).toBe(4);
    // Full overlay: the two rows of doors are the front gap apart, centred on the shelf.
    const upper = partBox(doors[0]!);
    const lower = partBox(doors[2]!);
    expect(upper.min[1] - lower.max[1]).toBeCloseTo(len('1/8"').mm, 6);
    expect((upper.min[1] + lower.max[1]) / 2).toBeCloseTo(openings[0]!.origin.y - t / 2, 6);
    // Inset, each door stands the cabinet's gap off the shelf, like off the case.
    const inset = withTall('shop');
    const [above, below] = [partBox(inset.parts.find((p) => p.name === 'Upper left door')!), partBox(inset.parts.find((p) => p.name === 'Lower left door')!)];
    expect(above.min[1] - inset.openings[0]!.origin.y).toBeCloseTo(len('1/8"').mm, 6);
    expect(inset.openings[1]!.origin.y + inset.openings[1]!.height - below.max[1]).toBeCloseTo(len('1/8"').mm, 6);
  });

  it('gives each door row its own adjustable shelves and shelf-pin holes', () => {
    const { tall, parts, part } = withTall('frameless');
    expect(shelfSpaces(tall, shop.materials).map((s) => [s.rowId, s.count])).toEqual([
      ['doors-upper', 1],
      ['doors', 2],
    ]);
    const shelf = partBox(part('fixed-shelf')!);
    const tops = (names: RegExp) => parts.filter((p) => names.test(p.name)).map((p) => partBox(p).max[1]);
    expect(tops(/^Shelf/).every((y) => y < shelf.min[1])).toBe(true);
    expect(tops(/^Upper shelf/).every((y) => y > shelf.max[1])).toBe(true);
    expect(parts.filter((p) => p.role === 'shelf').map((p) => p.id.split('/')[1])).toEqual(['shelf-1', 'shelf-2', 'shelf-doors-upper-1']);
    // Pin holes behind both rows, none through the fixed shelf's joint.
    const pins = part('side-left')!.features.flatMap((f) => (f.kind === 'hole' && f.id.startsWith('shelf-pin-front') ? [f.center.y] : []));
    expect(pins.some((y) => y > shelf.max[1])).toBe(true);
    expect(pins.some((y) => y < shelf.min[1])).toBe(true);
    expect(pins.some((y) => y > shelf.min[1] - 50 && y < shelf.max[1] + 50)).toBe(false);
    // No shelves behind the upper doors: no holes there, and none of its shelves.
    const none = withTall('frameless', (c) => (c.layout.rows[0]!.shelves = 0));
    expect(none.parts.some((p) => /^Upper shelf/.test(p.name))).toBe(false);
    const fewer = none.part('side-left')!.features.flatMap((f) => (f.kind === 'hole' && f.id.startsWith('shelf-pin-front') ? [f.center.y] : []));
    expect(fewer.every((y) => y < shelf.min[1])).toBe(true);
    // Three behind the upper doors, none behind the lower.
    const swapped = withTall('frameless', (c) => ((c.layout.rows[0]!.shelves = 3), (c.adjustableShelves = 0)));
    expect(swapped.parts.filter((p) => p.role === 'shelf').map((p) => p.name)).toEqual(['Upper shelf 1', 'Upper shelf 2', 'Upper shelf 3']);
  });

  it('takes a third hinge on doors over 1 m tall, and a fourth on a single tall pair', () => {
    const cups = (p: Part) => p.features.filter((f) => f.kind === 'cup').length;
    const two = withTall('frameless');
    expect(two.parts.filter((p) => !p.role).map((p) => [Math.round(p.size.height), cups(p)])).toEqual(Array(4).fill([1006, 3]));
    // Each side has the plates of its three hinges on each row: two holes a plate.
    expect(two.ids(two.part('side-left'), 'hinge-plate')).toHaveLength(12);
    const one = withTall('frameless', (tall, project) => applyCabinetLayout(project, tall, 'doors'));
    expect(one.parts.filter((p) => !p.role).map((p) => [p.name, cups(p)])).toEqual([
      ['Left door', 4],
      ['Right door', 4],
    ]);
    expect(one.part('fixed-shelf')).toBeUndefined();
  });

  it('keeps the doors and the upper row\'s shelves through a change of layout and back', () => {
    const { project, tall } = withTall('frameless');
    tall.layout.rows[0]!.shelves = 3;
    const before = JSON.stringify(project.designObjects);
    applyCabinetLayout(project, tall, 'drawerOverDoors');
    expect(designsOf(project).filter(isDoorSet).find((d) => d.mounting.openingId === 'cabinet-2/doors')!.name).toBe('Doors');
    applyCabinetLayout(project, tall, 'doorsOverDoors');
    expect(JSON.stringify(project.designObjects.filter((d) => d.template === 'doorSet'))).toBe(JSON.stringify((JSON.parse(before) as { template: string }[]).filter((d) => d.template === 'doorSet')));
    // The upper row comes back with the shelves it had.
    expect(tall.layout.rows[0]).toEqual({ id: 'doors-upper', use: 'doors', shelves: 3 });
    expect(tall.layout.kept).toEqual({ drawerHeight: len('6"') });
  });
});

describe('a job with a tall cabinet', () => {
  it('derives every part once and lists them', () => {
    const { project } = withTall('shop');
    // On a machine that cannot tile, so the long sides go to the saw and the default stock will do.
    const shop = createStarterShop();
    for (const machine of shop.machines) delete machine.tiling;
    const job = buildJob(project, shop);
    const all = [...job.cabinetParts, ...job.parts];
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    const lists = buildLists(job, project, shop, L);
    expect(new Set(lists.parts.map((p) => p.label)).size).toBe(all.length);
    expect(lists.cutList.flatMap((g) => g.rows).some((r) => r.names.includes('Fixed shelf'))).toBe(true);
    // Twelve hinges on the tall cabinet's four doors, four on the shop cabinet's two.
    expect(lists.hardware.find((h) => /Blum CLIP top|inset/i.test(h.item) && h.group === 'Doors')!.quantity).toBe(16);
    // The sides are too long for the machine: they are cut on a saw (tests/longParts.test.ts).
    expect(job.plan.warnings.some((w) => w.code === 'outsideCuttingArea' || w.code === 'stockTooSmall')).toBe(false);
    expect(parseProjectFile(serializeProjectFile(exportProject(project, shop))).project).toEqual(project);
  });
});
