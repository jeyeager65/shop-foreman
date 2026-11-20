// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  cabinetOpeningsOf,
  constructionRules,
  deriveCabinetParts,
  deriveParts,
  doorSetOf,
  hingeFor,
  hingeOverlayMiss,
  hungDesigns,
  hungProject,
  isDoorSet,
  isDrawer,
  partBox,
  cabinetsOf,
  designsOf,
} from '@/design';
import { buildJob } from '@/job/buildJob';
import { GENERIC_FRAMELESS_HINGE_ID, createStarterShop } from '@/libraries';
import type { Part, Project } from '@/model';
import { CABINET_HINGE_ID, createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject } from '@/storage/projectFile';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const frameless = createBaseCabinetProject('frameless');
const framed = createBaseCabinetProject('faceFrame');
const cabinetOf = (project: Project) => cabinetsOf(project)[0]!;
const sizeOf = (p: Part) => `${frac(p.size.width)} x ${frac(p.size.height)}`;

describe('the construction-style layer', () => {
  it('face frame: a frame in front, openings between stiles and rails, each front with its own overlays', () => {
    const rules = constructionRules(cabinetOf(framed), shop.materials);
    expect(rules).toMatchObject({ hasFaceFrame: true, hingeMount: 'frameEdge', fullOverlay: null, frontEdgeBand: 0 });
    expect([rules.openingSide, rules.openingsBottom, rules.openingsTop, rules.divider, rules.frontPlane, rules.mountThickness].map(frac)).toEqual([
      '1-1/2"',
      '6"',
      '33"',
      '1-1/2"',
      '3/4"',
      '3/4"',
    ]);
    // The bottom is raised so its top is level with the top of the bottom rail.
    expect(frac(rules.bottomLift)).toBe('25/32"');
  });

  it('frameless: no frame, openings inside the case, hinges on plates on the sides, full overlay', () => {
    const rules = constructionRules(cabinetOf(frameless), shop.materials);
    expect(rules).toMatchObject({ hasFaceFrame: false, hingeMount: 'sidePlate', divider: 0, frontPlane: 0, bottomLift: 0, frontEdgeBand: 0 });
    expect([rules.openingSide, rules.openingsBottom, rules.openingsTop, rules.mountThickness].map(frac)).toEqual(['23/32"', '5-7/32"', '33-25/32"', '23/32"']);
    // The fronts run from 1/16" above the underside of the bottom to 1/16" below the case top.
    expect([rules.fullOverlay!.reveal, rules.fullOverlay!.gap, rules.fullOverlay!.bottom, rules.fullOverlay!.top].map(frac)).toEqual(['1/16"', '1/8"', '4-9/16"', '34-7/16"']);
  });

  it('gives each frameless opening its overlays: to the reveal outside, half the gap between fronts', () => {
    const [drawer, doors] = cabinetOpeningsOf(frameless, shop.materials);
    const show = (o: { side: number; top: number; bottom: number }) => [o.side, o.top, o.bottom].map(frac);
    expect(show(drawer!.fixedOverlay!)).toEqual(['21/32"', '21/32"', '-1/16"']);
    expect(show(doors!.fixedOverlay!)).toEqual(['21/32"', '-1/16"', '21/32"']);
    expect(cabinetOpeningsOf(framed, shop.materials).every((o) => o.fixedOverlay === undefined)).toBe(true);
  });
});

describe('fronts on the frameless cabinet', () => {
  const parts = deriveParts(frameless, shop);
  const doors = parts.filter((p) => p.designObjectId === 'doors-1');
  const front = parts.find((p) => p.id === 'drawer-1/front')!;

  it('sizes them from the case, the reveal and the front gap', () => {
    // 24" less a 1/16" reveal each side: 23-7/8" across. The pair shares it less its 1/8" gap.
    expect(doors.map(sizeOf)).toEqual(['11-7/8" x 23-5/32"', '11-7/8" x 23-5/32"']);
    expect(sizeOf(front)).toBe('23-7/8" x 6-19/32"');
  });

  it('covers the case front: a reveal all round and the gap between the drawer front and the doors', () => {
    const [left, right] = doors.map(partBox);
    const drawer = partBox(front);
    expect([left!.min[0], drawer.min[0]].map(frac)).toEqual(['1/16"', '1/16"']);
    expect([right!.max[0], drawer.max[0]].map(frac)).toEqual(['23-15/16"', '23-15/16"']);
    expect(frac(left!.min[1])).toBe('4-9/16"');
    expect(frac(drawer.max[1])).toBe('34-7/16"');
    expect(frac(drawer.min[1] - left!.max[1])).toBe('1/8"');
    expect(frac(right!.min[0] - left!.max[0])).toBe('1/8"');
    // Closed against the case front: a 2 mm standoff, then the 19 mm front.
    expect(left!.min[2]).toBeCloseTo(2, 6);
    expect(drawer.max[2]).toBeCloseTo(21, 6);
  });

  it('follows the reveal and the front gap', () => {
    const p = structuredClone(frameless);
    cabinetOf(p).frameless.reveal = len('1/8"');
    cabinetOf(p).frameless.frontGap = len('1/4"');
    const made = deriveParts(p, shop);
    expect(made.map(sizeOf)).toEqual(['11-13/16" x 23-1/32"', '11-13/16" x 23-1/32"', '23-3/4" x 6-15/32"']);
    cabinetOf(p).frameless.reveal = len('1"');
    expect(() => deriveParts(p, shop)).toThrow(/reveal/);
  });

  it('hangs the doors on the generic frameless hinge and keeps the face frame one', () => {
    const doorSet = doorSetOf(frameless);
    expect(doorSet.mounting.hingeId).toBe(CABINET_HINGE_ID);
    const hinge = hingeFor(doorSet.mounting, 'frameless', shop.hardware);
    expect(hinge.id).toBe(GENERIC_FRAMELESS_HINGE_ID);
    expect(hinge).toMatchObject({ generic: true, cabinetType: 'frameless', plate: { setback: 37, spacing: 32 } });
    expect(hingeFor(doorSet.mounting, 'faceFrame', shop.hardware).id).toBe(CABINET_HINGE_ID);
    expect(doors[0]!.features.filter((f) => f.kind === 'cup').map((f) => (f.kind === 'cup' ? f.hardwareId : ''))).toEqual([hinge.id, hinge.id]);

    // A frameless hinge of its own is used once chosen.
    const other = { ...structuredClone(hinge), id: 'test-frameless', generic: false };
    const picked = { ...doorSet.mounting, framelessHingeId: other.id };
    expect(hingeFor(picked, 'frameless', [...shop.hardware, other]).id).toBe(other.id);
    expect(hingeFor(picked, 'frameless', shop.hardware).id).toBe(GENERIC_FRAMELESS_HINGE_ID);
  });

  it('says when the side overlay is beyond what the hinge adjusts to', () => {
    const hinge = hingeFor(doorSetOf(frameless).mounting, 'frameless', shop.hardware);
    const hung = hungDesigns(frameless, shop).find(isDoorSet)!;
    // 21/32" (16.67 mm) against a 16 mm hinge that adjusts 2 mm.
    expect(hingeOverlayMiss(hung.mounting, hinge)).toBe(0);
    expect(hingeOverlayMiss({ ...hung.mounting, overlaySide: len('1/2"') }, hinge)).toBeCloseTo(16 - 12.7 - 2, 6);
  });

  it('hangs the designs without changing what is stored', () => {
    const before = JSON.stringify(frameless.designObjects);
    const hung = hungDesigns(frameless, shop);
    expect(JSON.stringify(frameless.designObjects)).toBe(before);
    expect(frac(hung.find(isDrawer)!.mounting.overlayTop.mm)).toBe('21/32"');
    expect(frac(doorSetOf(frameless).mounting.overlayTop.mm)).toBe('1/2"');
    // Hanging what is already hung changes nothing.
    expect(hungDesigns(hungProject(frameless, shop), shop)).toEqual(hung);
    // A face frame cabinet's designs hang as they are stored.
    expect(hungDesigns(framed, shop)).toEqual(designsOf(framed));
  });

  it('switching the style changes the fronts and switching back restores them, with nothing re-entered', () => {
    const p = structuredClone(framed);
    const was = deriveParts(p, shop).map(sizeOf);
    cabinetOf(p).construction = 'frameless';
    expect(deriveParts(p, shop).map(sizeOf)).toEqual(parts.map(sizeOf));
    cabinetOf(p).construction = 'faceFrame';
    expect(deriveParts(p, shop).map(sizeOf)).toEqual(was);
  });

  it('plans and posts them, with an install kit set to the frameless bottom overlay', () => {
    const job = buildJob(frameless, shop);
    expect(job.parts.map((p) => p.id)).toEqual(['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']);
    expect(job.files.length).toBeGreaterThan(0);
    const block = job.plan.installKit.find((j) => j.template === 'supportBlock')!;
    expect(frac(block.params.height!)).toBe('21/32"');
  });
});

describe('edge banding', () => {
  const banded = structuredClone(frameless);
  cabinetOf(banded).frameless.edgeBanding = true;
  const bare = deriveCabinetParts(frameless, shop);
  const parts = deriveCabinetParts(banded, shop);
  const of = (list: Part[], key: string) => list.find((p) => p.id === `cabinet-1/${key}`)!;

  it('is off to start: bare edges, parts at full size', () => {
    expect(bare.every((p) => p.banding === undefined)).toBe(true);
  });

  it('bands the front edges of the sides, bottom, front stretcher and shelves', () => {
    expect(parts.filter((p) => p.banding).map((p) => `${p.id.replace('cabinet-1/', '')} ${p.banding!.edges.join()}`)).toEqual([
      'side-left x0',
      'side-right x1',
      'bottom y0',
      'stretcher-front y0',
      'shelf-1 y0',
    ]);
    expect(parts.filter((p) => p.banding).every((p) => p.banding!.thickness === 0.5)).toBe(true);
  });

  it('cuts those parts smaller by the band, and leaves the finished case the same', () => {
    expect(of(parts, 'side-left').size.width).toBeCloseTo(of(bare, 'side-left').size.width - 0.5, 6);
    expect(of(parts, 'bottom').size.height).toBeCloseTo(of(bare, 'bottom').size.height - 0.5, 6);
    expect(of(parts, 'stretcher-front').size.height).toBeCloseTo(of(bare, 'stretcher-front').size.height - 0.5, 6);
    expect(of(parts, 'shelf-1').size.height).toBeCloseTo(of(bare, 'shelf-1').size.height - 0.5, 6);
    expect(of(parts, 'stretcher-back').size).toEqual(of(bare, 'stretcher-back').size);
    for (const key of ['side-left', 'side-right', 'bottom', 'stretcher-front', 'shelf-1']) {
      const a = partBox(of(parts, key));
      const b = partBox(of(bare, key));
      // The cut edge stands the band's thickness behind where the bare edge was; the rear stays put.
      expect(a.max[2], key).toBeCloseTo(b.max[2] - 0.5, 6);
      expect(a.min[2], key).toBeCloseTo(b.min[2], 6);
    }
    // The notch still ends at the toe kick's face once the band is on.
    const outline = (list: Part[], key: string) => {
      const f = of(list, key).features[0]!;
      return f.kind === 'cutout' ? f.outline : [];
    };
    expect(outline(parts, 'side-left')[0]!.x).toBeCloseTo(outline(bare, 'side-left')[0]!.x - 0.5, 6);
    expect(outline(parts, 'side-right')[1]!.x).toBeCloseTo(outline(bare, 'side-right')[1]!.x, 6);
  });

  it('is not used behind a face frame', () => {
    const p = structuredClone(banded);
    cabinetOf(p).construction = 'faceFrame';
    expect(deriveCabinetParts(p, shop).every((x) => x.banding === undefined)).toBe(true);
  });
});

describe('saved data from before the style layer', () => {

  it('exports the frameless hinge with the project', () => {
    const other = { ...structuredClone(shop.hardware.find((h) => h.id === GENERIC_FRAMELESS_HINGE_ID)!), id: 'test-frameless', generic: false };
    const p = structuredClone(frameless);
    doorSetOf(p).mounting.framelessHingeId = other.id;
    const ids = exportProject(p, { ...shop, hardware: [...shop.hardware, other] }).library.hardware.map((h) => h.id);
    expect(ids).toContain(other.id);
    expect(ids).toContain(CABINET_HINGE_ID);
  });
});
