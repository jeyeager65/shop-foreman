// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chooseSlide, drawerSlide, isDrawer, isSlide, slideFit, slideFor, cabinetsOf, designsOf } from '@/design';
import { GENERIC_SLIDE_ID, createStarterShop } from '@/libraries';
import type { DrawerDesign, Project, Slide } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { exportProject } from '@/storage/projectFile';
import { formatLength, len } from '@/units';

const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const shop = createStarterShop();
const drawerOf = (project: Project) => designsOf(project).find(isDrawer)!;
const generic = shop.hardware.filter(isSlide).find((s) => s.id === GENERIC_SLIDE_ID)!;

describe('slide library', () => {
  it('has the generic side-mount slide: 1/2" each side, no hole data', () => {
    expect(shop.hardware.filter(isSlide).map((s) => s.id)).toEqual([GENERIC_SLIDE_ID, 'euro-bottom-mount-self-closing']);
    expect(generic.generic).toBe(true);
    expect(generic.mount).toBe('side');
    expect(frac(generic.sideClearance.mm)).toBe('1/2"');
    expect(generic.lengths.map((l) => frac(l.mm))).toEqual(['10"', '12"', '14"', '16"', '18"', '20"', '22"', '24"', '26"', '28"']);
    expect(generic.holes).toBeUndefined();
  });
});

describe("a drawer's slide on the reference cabinet", () => {
  it('frameless: the longest that fits in front of the nailer is 20"', () => {
    const p = createBaseCabinetProject('frameless');
    const fit = drawerSlide(drawerOf(p), p, shop);
    expect(fit.slide.id).toBe(GENERIC_SLIDE_ID);
    // 22-1/2" less the 7/32" back in its rabbet and the 23/32" nailer.
    expect(frac(fit.room)).toBe('21-9/16"');
    expect([frac(fit.length.mm), fit.from, fit.fits]).toEqual(['20"', 'longest', true]);
    expect(fit.options.filter((o) => o.fits).map((o) => frac(o.length.mm))).toEqual(['10"', '12"', '14"', '16"', '18"', '20"']);
  });

  it('face frame: the slide starts at the front of the frame, so 22" fits', () => {
    const p = createBaseCabinetProject('faceFrame');
    const fit = drawerSlide(drawerOf(p), p, shop);
    expect(frac(fit.room)).toBe('22-5/16"');
    expect([frac(fit.length.mm), fit.fits]).toEqual(['22"', true]);
  });

  it('a flat back stretcher or a groove changes the room', () => {
    const p = createBaseCabinetProject('frameless');
    const cabinet = p.context.kind === 'designedCabinet' ? cabinetsOf(p)[0]! : undefined;
    cabinet!.joinery.backStretcherForm = 'flat';
    expect(frac(drawerSlide(drawerOf(p), p, shop).room)).toBe('22-9/32"');
    expect(frac(drawerSlide(drawerOf(p), p, shop).length.mm)).toBe('22"');
    cabinet!.joinery.back = 'groove';
    expect(frac(drawerSlide(drawerOf(p), p, shop).room)).toBe('21-25/32"');
    expect(frac(drawerSlide(drawerOf(p), p, shop).length.mm)).toBe('20"');
  });

  it('keeps a chosen length, and says when it does not fit', () => {
    const p = createBaseCabinetProject('frameless');
    drawerOf(p).slide.length = len('16"');
    expect([frac(drawerSlide(drawerOf(p), p, shop).length.mm), drawerSlide(drawerOf(p), p, shop).from]).toEqual(['16"', 'chosen']);
    drawerOf(p).slide.length = len('24"');
    const long = drawerSlide(drawerOf(p), p, shop);
    expect([frac(long.length.mm), long.from, long.fits]).toEqual(['24"', 'chosen', false]);
    // A length the slide does not come in is ignored.
    drawerOf(p).slide.length = len('15"');
    expect([frac(drawerSlide(drawerOf(p), p, shop).length.mm), drawerSlide(drawerOf(p), p, shop).from]).toEqual(['20"', 'longest']);
  });

  it('a cabinet too shallow for any length reports the shortest as not fitting', () => {
    const fit = slideFit(drawerOf(createBaseCabinetProject()), generic, 200);
    expect([frac(fit.length.mm), fit.fits]).toEqual(['10"', false]);
  });

  it('falls back to the generic slide when the chosen one is gone, and changing slide keeps a length both have', () => {
    const drawer = JSON.parse(JSON.stringify(drawerOf(createBaseCabinetProject()))) as DrawerDesign;
    drawer.slide = { slideId: 'missing', length: len('18"'), faceFrameMount: 'rearBrackets' };
    expect(slideFor(drawer, shop.hardware).id).toBe(GENERIC_SLIDE_ID);
    expect(() => slideFor(drawer, shop.hardware.filter((h) => !isSlide(h)))).toThrow(/no drawer slide/);
    const short: Slide = { ...structuredClone(generic), id: 'test-short', generic: false, lengths: [len('12"'), len('18"')] };
    chooseSlide(drawer, short);
    expect(drawer.slide).toEqual({ slideId: 'test-short', length: len('18"'), faceFrameMount: 'rearBrackets' });
    drawer.slide.length = len('20"');
    chooseSlide(drawer, short);
    expect(drawer.slide).toEqual({ slideId: 'test-short', faceFrameMount: 'rearBrackets' });
  });
});

describe('saved and exported projects', () => {

  it("exports the drawer's slide with the project", () => {
    const other: Slide = { ...structuredClone(generic), id: 'test-slide', generic: false };
    const unused: Slide = { ...structuredClone(generic), id: 'test-unused', generic: false };
    const p = createBaseCabinetProject();
    drawerOf(p).slide.slideId = other.id;
    const ids = exportProject(p, { ...shop, hardware: [...shop.hardware, other, unused] }).library.hardware.map((h) => h.id);
    expect(ids).toContain(other.id);
    expect(ids).toContain(GENERIC_SLIDE_ID);
    expect(ids).not.toContain(unused.id);
  });
});
