// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HOLE_WEB, SHELF_PIN_END_MARGIN, SLIDE_PILOT_DIAMETER, STRETCHER_WIDTH, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, drawerBox, insideDepth, isDrawer, isShelfPin, shelfPinFor, shelfPinLevels, shelfSpace, designsOf } from '@/design';
import { GENERIC_SHELF_PIN_ID, SHELF_PIN_1_4_ID, createStarterShop } from '@/libraries';
import type { CabinetDesign, ConstructionStyle, Feature, Part, Project, Shop, Slide } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject, parseProjectFile, serializeProjectFile } from '@/storage/projectFile';
import { len } from '@/units';

type Hole = Extract<Feature, { kind: 'hole' }>;
const shop = createStarterShop();
const cabinetOf = (p: Project): CabinetDesign => cabinetsOf(p)[0]!;
const pin = shop.hardware.filter(isShelfPin).find((p) => p.generic)!;

function build(style: ConstructionStyle, change?: (cabinet: CabinetDesign, project: Project) => void, withShop: Shop = shop) {
  const project = createBaseCabinetProject(style);
  change?.(cabinetOf(project), project);
  const parts = deriveCabinetParts(project, withShop);
  const side = (which: 'left' | 'right') => parts.find((p) => p.id === `cabinet-1/side-${which}`)!;
  return { project, parts, left: side('left'), right: side('right') };
}
const holes = (part: Part, prefix: string) => part.features.filter((f): f is Hole => f.kind === 'hole' && f.id.startsWith(prefix));
const ys = (list: Hole[]) => list.map((h) => +h.center.y.toFixed(3));
const xs = (list: Hole[]) => [...new Set(list.map((h) => +h.center.x.toFixed(3)))];

describe('the shelf pins and the hinge plate in the library', () => {
  it('has a generic 5 mm pin and a 1/4" pin, rows on the 32 mm system', () => {
    const pins = shop.hardware.filter(isShelfPin);
    expect(pins.map((p) => [p.id, p.generic, p.hole.diameter])).toEqual([
      [GENERIC_SHELF_PIN_ID, true, 5],
      [SHELF_PIN_1_4_ID, false, 6.35],
    ]);
    expect(pin.rows).toEqual({ frontSetback: 37, rearSetback: 37, spacing: 32 });
    expect(pin.hole.depth).toBe(10);
  });

  it('a project file carries the pin its cabinet uses', () => {
    const p = createBaseCabinetProject();
    cabinetOf(p).shelfPinId = SHELF_PIN_1_4_ID;
    const file = parseProjectFile(serializeProjectFile(exportProject(p, shop)));
    expect(file.library.hardware.filter(isShelfPin).map((h) => h.id)).toEqual([GENERIC_SHELF_PIN_ID, SHELF_PIN_1_4_ID]);
  });

  it('falls back to the generic pin when the library no longer has the cabinet\'s', () => {
    const p = createBaseCabinetProject();
    cabinetOf(p).shelfPinId = 'gone';
    expect(shelfPinFor(cabinetOf(p), shop.hardware).id).toBe(GENERIC_SHELF_PIN_ID);
  });
});

describe('hinge plate holes', () => {
  it('frameless: two 5 mm holes per hinge, 37 mm behind the front edge, 32 mm apart, centred on the hinge', () => {
    const { left, right } = build('frameless');
    const l = holes(left, 'hinge-plate');
    expect(l.map((h) => h.id)).toEqual(['hinge-plate-doors-1-1-1', 'hinge-plate-doors-1-1-2', 'hinge-plate-doors-1-2-1', 'hinge-plate-doors-1-2-2']);
    expect(l.every((h) => h.face === 'A' && h.diameter === 5 && h.depth === 13)).toBe(true);
    // The doors hang from 4-9/16" off the floor and are 23-5/32" tall; hinges 3-1/2" from each end.
    const bottom = len('4-9/16"').mm;
    const tall = len('23-5/32"').mm;
    const low = bottom + len('3-1/2"').mm;
    const high = bottom + tall - len('3-1/2"').mm;
    ys(l).forEach((y, i) => expect(y).toBeCloseTo([low - 16, low + 16, high - 16, high + 16][i]!, 0));
    expect(ys(l)[1]! - ys(l)[0]!).toBeCloseTo(32, 6);
    expect(xs(l)).toEqual([37]);
    // The right side is the mirror image: its front edge is at x = its width.
    const r = holes(right, 'hinge-plate');
    expect(xs(r)).toEqual([+(right.size.width - 37).toFixed(3)]);
    expect(ys(r)).toEqual(ys(l));
  });

  it('a single door puts them on its hinge side only', () => {
    const { left, right } = build('frameless', (_, p) => {
      const doors = designsOf(p).find((d) => d.template === 'doorSet')!;
      if (doors.template === 'doorSet') Object.assign(doors.mounting, { doors: 1, hingeSide: 'right' });
    });
    expect(holes(left, 'hinge-plate')).toHaveLength(0);
    expect(holes(right, 'hinge-plate')).toHaveLength(4);
  });

  it('face frame: none, the hinges screw to the edge of the frame', () => {
    const { parts } = build('faceFrame');
    expect(parts.flatMap((p) => holes(p, 'hinge-plate'))).toHaveLength(0);
  });

  it('measures from the finished front edge when it is banded', () => {
    const { left, right } = build('frameless', (c) => (c.frameless.edgeBanding = true));
    expect(xs(holes(left, 'hinge-plate'))).toEqual([36.5]);
    expect(xs(holes(right, 'hinge-plate'))).toEqual([+(right.size.width - 36.5).toFixed(3)]);
  });

  it('refuses a case side too thin for them', () => {
    const thin = structuredClone(shop);
    thin.materials.find((m) => m.id === 'plywood-3-4')!.measuredThickness = len('1/2"');
    expect(() => build('frameless', undefined, thin)).toThrow(/too thin for the hinge plate holes/);
    // Without doors it is the shelf pins: 10 mm deep holes leave less than 3 mm of a 1/2" side.
    expect(() => build('frameless', (_, p) => (p.designObjects = []), thin)).toThrow(/too thin for the shelf-pin holes/);
    expect(() => build('frameless', (c, p) => ((p.designObjects = []), (c.adjustableShelves = 0)), thin)).not.toThrow();
  });
});

describe('shelf-pin rows', () => {
  it('run up the space behind the doors, 3" short of each end, 32 mm apart', () => {
    const { project } = build('frameless');
    const cabinet = cabinetOf(project);
    const space = shelfSpace(cabinet, shop.materials)!;
    const levels = shelfPinLevels(cabinet, shop.materials, pin);
    expect(levels).toHaveLength(14);
    levels.slice(1).forEach((y, i) => expect(y - levels[i]!).toBeCloseTo(32, 6));
    // Centred in the space, so the margins are equal and at least 3".
    expect(levels[0]! - space.bottom).toBeCloseTo(space.top - levels.at(-1)!, 6);
    expect(levels[0]! - space.bottom).toBeGreaterThanOrEqual(SHELF_PIN_END_MARGIN);
    expect(levels[0]! - space.bottom).toBeLessThan(SHELF_PIN_END_MARGIN + 32);
  });

  it('frameless: a front and a rear row in each side, mirrored, the same levels on both', () => {
    const { project, left, right } = build('frameless');
    const front = holes(left, 'shelf-pin-front');
    const rear = holes(left, 'shelf-pin-rear');
    expect(front.every((h) => h.face === 'A' && h.diameter === 5 && h.depth === 10)).toBe(true);
    expect(front.map((h) => h.id)).toEqual(front.map((_, i) => `shelf-pin-front-${i + 1}`));
    expect(xs(front)).toEqual([37]);
    // The rear row is 37 mm in front of the back's front face.
    expect(xs(rear)).toEqual([+(insideDepth(cabinetOf(project), shop.materials) - 37).toFixed(3)]);
    expect(ys(rear)).toEqual(ys(front));
    expect(xs(holes(right, 'shelf-pin-front'))).toEqual([+(right.size.width - 37).toFixed(3)]);
    expect(xs(holes(right, 'shelf-pin-rear'))).toEqual([+(right.size.width - xs(rear)[0]!).toFixed(3)]);
    expect(ys(holes(right, 'shelf-pin-front'))).toEqual(ys(front));
    expect(ys(holes(right, 'shelf-pin-rear'))).toEqual(ys(front));
  });

  it('frameless: the levels under a hinge plate are left out, in both rows and both sides', () => {
    const { left } = build('frameless');
    const front = holes(left, 'shelf-pin-front');
    // 14 levels less one at the lower hinge and two at the upper one.
    expect(front).toHaveLength(11);
    expect(holes(left, 'shelf-pin-rear')).toHaveLength(11);
    const plate = ys(holes(left, 'hinge-plate'));
    for (const y of ys(front)) {
      for (const [from, to] of [plate.slice(0, 2), plate.slice(2)]) expect(y < from! - 10 || y > to! + 10, `${y}`).toBe(true);
    }
    // Without doors nothing is in the way.
    expect(holes(build('frameless', (_, p) => (p.designObjects = p.designObjects.filter((d) => d.template === 'drawer'))).left, 'shelf-pin-front')).toHaveLength(14);
  });

  it('face frame: the levels at a pocket hole that attaches the frame are left out', () => {
    const { left, right } = build('faceFrame');
    const pockets = left.features.flatMap((f) => (f.kind === 'pocketHole' && f.face === 'A' ? [f.at] : []));
    expect(pockets.length).toBeGreaterThan(0);
    const front = holes(left, 'shelf-pin-front');
    for (const y of ys(front)) for (const at of pockets) expect(Math.abs(y - at)).toBeGreaterThanOrEqual(5 + 2.5 + HOLE_WEB);
    expect(ys(holes(right, 'shelf-pin-rear'))).toEqual(ys(front));
    // Both sides hidden: their pockets are on the outside faces, and every level is drilled.
    const hidden = build('faceFrame', (c) => (c.sides = { left: 'hidden', right: 'hidden' }));
    const all = shelfPinLevels(cabinetOf(hidden.project), shop.materials, pin).length;
    expect(front.length).toBeLessThan(all);
    expect(holes(hidden.left, 'shelf-pin-front')).toHaveLength(all);
  });

  it('follows the cabinet\'s pin', () => {
    const { left } = build('frameless', (c) => (c.shelfPinId = SHELF_PIN_1_4_ID));
    const front = holes(left, 'shelf-pin-front');
    expect(front.length).toBeGreaterThan(0);
    expect(front.every((h) => Math.abs(h.diameter - 6.35) < 1e-9 && Math.abs(h.depth - 9.525) < 1e-9)).toBe(true);
  });

  it('none without adjustable shelves', () => {
    const { parts } = build('frameless', (c) => (c.adjustableShelves = 0));
    expect(parts.flatMap((p) => holes(p, 'shelf-pin'))).toHaveLength(0);
  });

  it('only the sides get holes', () => {
    const { parts } = build('frameless');
    expect(parts.filter((p) => p.features.some((f) => f.kind === 'hole')).map((p) => p.id)).toEqual(['cabinet-1/side-left', 'cabinet-1/side-right']);
  });

  it('stop below a nailer when the doors reach up to it', () => {
    const doorsOnly = (c: CabinetDesign, p: Project) => {
      c.layout.rows = [{ id: 'doors', use: 'doors' }];
      p.designObjects = [];
    };
    const { project, left } = build('frameless', doorsOnly);
    const under = cabinetOf(project).size.height.mm - STRETCHER_WIDTH;
    expect(Math.max(...ys(holes(left, 'shelf-pin-rear')))).toBeLessThanOrEqual(under - SHELF_PIN_END_MARGIN);
    const flat = build('frameless', (c, p) => (doorsOnly(c, p), (c.joinery.backStretcherForm = 'flat')));
    expect(holes(flat.left, 'shelf-pin-rear').length).toBeGreaterThan(holes(left, 'shelf-pin-rear').length);
  });
});

describe('slide screw holes', () => {
  /** A slide with hole data for its 20" and 22" lengths: three screws along the cabinet member. */
  const withHoles = (): Shop => {
    const s = structuredClone(shop);
    const slide: Slide = { ...(s.hardware.find((h) => h.kind === 'slide') as Slide), id: 'test-slide', generic: false, name: 'Test slide' };
    slide.holes = [
      { length: len('20"'), fromFront: [10, 35, 227, 451] },
      { length: len('22"'), fromFront: [10, 35, 259, 483] },
    ];
    s.hardware.push(slide);
    return s;
  };
  const onTestSlide = (_: CabinetDesign, p: Project) => designsOf(p).filter(isDrawer).forEach((d) => (d.slide.slideId = 'test-slide'));

  it('the generic slide has no hole data, so nothing is drilled for it', () => {
    for (const style of ['frameless', 'faceFrame'] as const) {
      const { project, parts } = build(style);
      expect([...parts, ...deriveDrawerBoxParts(project, shop)].flatMap((p) => holes(p, 'slide-screw'))).toHaveLength(0);
    }
  });

  it('frameless: 1/16" pilot holes in both sides, along the slide\'s centre line', () => {
    const s = withHoles();
    const { project, left, right } = build('frameless', onTestSlide, s);
    const box = drawerBox(designsOf(project).find(isDrawer)!, project, s)!;
    const l = holes(left, 'slide-screw');
    expect(l.map((h) => h.id)).toEqual([1, 2, 3, 4].map((n) => `slide-screw-drawer-1-${n}`));
    expect(l.map((h) => h.center.x)).toEqual([10, 35, 227, 451]);
    expect(xs(holes(right, 'slide-screw')).sort((a, b) => a - b)).toEqual([451, 227, 35, 10].map((x) => +(right.size.width - x).toFixed(3)));
    expect(l.every((h) => h.diameter === SLIDE_PILOT_DIAMETER && h.depth === 10 && Math.abs(h.center.y - box.slideAt.y) < 1e-9)).toBe(true);
    // The centre line is the middle of the box side.
    expect(box.slideAt.y).toBeCloseTo(len('28-1/32"').mm + len('2-1/2"').mm, 0);
  });

  it('face frame, strips: the holes are in the strips, behind the frame, with a shim under each', () => {
    const s = withHoles();
    const { project, parts } = build('faceFrame', onTestSlide, s);
    expect(parts.flatMap((p) => holes(p, 'slide-screw'))).toHaveLength(0);
    const box = drawerBox(designsOf(project).find(isDrawer)!, project, s)!;
    const strip = (which: string) => box.parts.find((p) => p.id === `drawer-1/strip-${which}`)!;
    const frame = box.slideAt.front;
    expect(frame).toBeCloseTo(19.05, 6);
    // The screw 10 mm from the slide's front end is in the frame's thickness: by hand, into the stile.
    const l = holes(strip('left'), 'slide-screw');
    expect(l.map((h) => h.id)).toEqual(['slide-screw-2', 'slide-screw-3', 'slide-screw-4']);
    l.forEach((h, i) => expect(h.center.x).toBeCloseTo([35, 259, 483][i]! - frame, 6));
    expect(l.every((h) => h.center.y === strip('left').size.height / 2 && h.face === 'A')).toBe(true);
    const r = holes(strip('right'), 'slide-screw');
    r.forEach((h, i) => expect(h.center.x).toBeCloseTo(strip('right').size.width - ([35, 259, 483][i]! - frame), 6));
    expect(box.shim!.perStrip).toBe(3);
  });

  it('face frame, rear brackets: none', () => {
    const s = withHoles();
    const { project, parts } = build('faceFrame', (c, p) => (onTestSlide(c, p), designsOf(p).filter(isDrawer).forEach((d) => (d.slide.faceFrameMount = 'rearBrackets'))), s);
    expect([...parts, ...deriveDrawerBoxParts(project, s)].flatMap((p) => holes(p, 'slide-screw'))).toHaveLength(0);
  });

  it('a length the slide has no hole data for is mounted by hand', () => {
    const s = withHoles();
    const { parts } = build('frameless', (c, p) => (onTestSlide(c, p), designsOf(p).filter(isDrawer).forEach((d) => (d.slide.length = len('18"')))), s);
    expect(parts.flatMap((p) => holes(p, 'slide-screw'))).toHaveLength(0);
  });
});
