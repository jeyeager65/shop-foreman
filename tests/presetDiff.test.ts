import { describe, expect, it } from 'vitest';
import { mark, presetMarks } from '@/components/presetMarks';
import { backToPreset, presetDiffs, presetTopic, resolvePreset, setBottomKind, setFinish, shopDoorDefaults, withLook } from '@/design';
import { createStarterShopProfile } from '@/libraries';
import { builtInPresets, newProjectFromPreset } from '@/samples/presets';
import { len } from '@/units';

/** What differs from the preset. */
describe('what differs from the preset', () => {
  const shop = createStarterShopProfile();
  const start = (id: string) => {
    const preset = resolvePreset(builtInPresets().find((p) => p.id === id)!, shop).preset;
    return { preset, project: newProjectFromPreset(preset, shop).project };
  };

  it('is nothing in a new project from any built-in preset', () => {
    for (const p of builtInPresets()) {
      const { preset, project } = start(p.id);
      expect(presetDiffs(project, preset), p.name).toEqual([]);
    }
  });

  it('names each value changed, under its topic', () => {
    const { preset, project } = start('builtin-shop-inset-slab');
    const { settings, fronts, sizes } = project.context;
    // Setup gives a shop-style project its slab doors when it first shows them: not a difference.
    fronts.doors.shop = shopDoorDefaults(settings.materials.caseId);
    expect(presetDiffs(project, preset)).toEqual([]);

    fronts.doors.shop.style.pattern = withLook(undefined, 'grooves-grid');
    setBottomKind(settings.toeKick, 'casters', shop.hardware);
    settings.joinery.case = settings.joinery.case === 'dado' ? 'pocketScrews' : 'dado';
    sizes.base.depth = len('20"');
    setFinish(project, 'case', 'paint-navy');
    // A length shown in another unit is the same answer; so is a switch turned off again.
    settings.shop.gap = { ...settings.shop.gap, unit: 'mm' };
    settings.frameless.edgeBanding = !settings.frameless.edgeBanding;

    const diffs = presetDiffs(project, preset);
    expect(diffs).toContain('fronts.doors.shop.style.pattern');
    expect(diffs).toContain('settings.joinery.case');
    expect(diffs).toContain('sizes.base.depth');
    expect(diffs).toContain('finish.caseId');
    expect(diffs.some((d) => d.startsWith('settings.toeKick.casters'))).toBe(true);
    // Another construction's values are shown nowhere: not a difference.
    expect(diffs.some((d) => d.startsWith('settings.frameless'))).toBe(false);
    expect(diffs).not.toContain('settings.shop.gap');
    // How the cases are joined is under Joints, with the drawer boxes' corners and the toe kick board's joint.
    expect(new Set(diffs.map(presetTopic))).toEqual(new Set(['fronts', 'bottom', 'joints', 'sizes', 'finish']));
    expect(['settings.joinery.back', 'settings.joinery.tabs.proud', 'settings.toeKick.joint', 'fronts.drawers.cornerJoint', 'settings.joinery.overrides.bottom', 'settings.toeKick.height'].map(presetTopic)).toEqual(['joints', 'joints', 'joints', 'joints', 'case', 'construction']);

    // The marks on the fields.
    presetMarks.value = diffs;
    expect(mark('fronts.doors.shop', 'style.pattern')).toBe('differs-from-preset');
    expect(mark('settings', 'toeKick.off', 'toeKick.casters')).toBe('differs-from-preset');
    expect(mark('settings', 'joinery.back')).toBeUndefined();
    expect(mark(undefined, 'joinery.case')).toBeUndefined();
    presetMarks.value = [];
  });

  it("gives a topic the preset's values back, and leaves the others", () => {
    const { preset, project } = start('builtin-shop-inset-slab');
    const { settings, fronts } = project.context;
    fronts.doors.shop = shopDoorDefaults(settings.materials.caseId);
    fronts.doors.shop.style.pattern = withLook(undefined, 'grooves-grid');
    delete fronts.drawers.handle;
    fronts.doors.handle = { handleId: 'made-up', fromEnd: len('3"') };
    setBottomKind(settings.toeKick, 'casters', shop.hardware);
    project.materials = project.materials.filter((m) => m.id !== fronts.drawers.materials.boxId);

    backToPreset(project, preset, 'fronts');
    const left = presetDiffs(project, preset);
    expect(left.length).toBeGreaterThan(0);
    expect(new Set(left.map(presetTopic))).toEqual(new Set(['bottom']));
    expect(project.context.fronts.doors.shop?.style.pattern).toBeUndefined();
    // A material the preset names is in the project again.
    expect(project.materials.some((m) => m.id === fronts.drawers.materials.boxId)).toBe(true);

    backToPreset(project, preset, 'bottom');
    expect(presetDiffs(project, preset)).toEqual([]);
    expect(project.context.settings.toeKick.casters).toBeUndefined();
  });
});
