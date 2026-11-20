// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bottomKindOf, cabinetsOf, casterGroups, isFoot, setBottomKind } from '@/design';
import { insideDepth } from '@/design/case';
import { shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile, GENERIC_CASTER_ID } from '@/libraries';
import { GENERIC_FOOT_ID } from '@/libraries/casters';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';

/** Furniture: a case with no back; a plinth flush with the front; bought feet where casters would stand. */
const contextOf = (p: Project) => p.context as CasesContext;
const stored = (p: Project) => contextOf(p).pieces[0]!;
const ids = (p: Project, profile = createStarterShopProfile()) => buildJob({ ...p, slug: 'a3' }, profile).cabinetParts.map((x) => x.id.split('/').pop()!);

describe('a case with no back', () => {
  it('has no back part and nothing cut for one, and runs the full depth, whatever its back joint', () => {
    const profile = createStarterShopProfile();
    for (const construction of ['faceFrame', 'frameless', 'shop'] as const) {
      for (const joint of ['rabbet', 'groove', 'applied'] as const) {
        const project = createBaseCabinetProject(construction);
        contextOf(project).settings.joinery.back = joint;
        const where = `${construction}, ${joint}`;
        expect(ids(project), where).toContain('back');
        stored(project).noBack = true;
        const cabinet = cabinetsOf(project)[0]!;
        const job = buildJob({ ...project, slug: 'a3' }, profile);
        expect(job.cabinetParts.some((p) => p.role === 'back'), where).toBe(false);
        const side = job.cabinetParts.find((p) => p.id.endsWith('/side-left'))!;
        expect(side.features.filter((f) => /back/.test(f.id)), where).toEqual([]);
        // The sides are the whole depth of the case, and so is its inside.
        expect(side.size.width, where).toBeCloseTo(cabinet.size.depth.mm, 3);
        expect(insideDepth(cabinet, shopFor(project, profile).materials), where).toBeCloseTo(cabinet.size.depth.mm, 3);
        expect(job.files.length, where).toBeGreaterThan(0);
      }
    }
  });
});

describe('what a case stands on', () => {
  it('a plinth is the toe kick with no toe space: the sides run square to the floor', () => {
    const profile = createStarterShopProfile();
    for (const construction of ['faceFrame', 'frameless'] as const) {
      const project = createBaseCabinetProject(construction);
      const kick = contextOf(project).settings.toeKick;
      expect(bottomKindOf(kick)).toBe('toeKick');
      const notched = buildJob({ ...project, slug: 'a3' }, profile).cabinetParts.find((p) => p.id.endsWith('/side-left'))!;
      const corners = (part: typeof notched) => {
        const cutout = part.features.find((f) => f.kind === 'cutout');
        return cutout?.kind === 'cutout' ? cutout.outline.length : 0;
      };
      expect(corners(notched), construction).toBeGreaterThan(4);
      setBottomKind(kick, 'plinth', profile.hardware);
      expect([bottomKindOf(kick), kick.plinth, kick.off], construction).toEqual(['plinth', true, undefined]);
      const job = buildJob({ ...project, slug: 'a3' }, profile);
      // No notch in the sides; the board that was the toe kick's is still there, at the front.
      expect(corners(job.cabinetParts.find((p) => p.id.endsWith('/side-left'))!), construction).toBe(4);
      expect(job.cabinetParts.some((p) => p.id.endsWith('/toe-kick')), construction).toBe(true);
      expect(job.files.length, construction).toBeGreaterThan(0);
      // Back to a toe kick: its depth was kept.
      setBottomKind(kick, 'toeKick', profile.hardware);
      expect([bottomKindOf(kick), kick.plinth, kick.depth.mm > 0]).toEqual(['toeKick', undefined, true]);
    }
  });

  it('bought feet stand where casters would: pads, pilot holes, four feet on the list and no brakes', () => {
    const profile = createStarterShopProfile();
    const project = createBaseCabinetProject('faceFrame');
    const kick = contextOf(project).settings.toeKick;
    // The shop has no foot until one is asked for.
    expect(profile.hardware.some(isFoot)).toBe(false);
    setBottomKind(kick, 'feet', profile.hardware);
    expect(profile.hardware.filter(isFoot).map((h) => h.id)).toEqual([GENERIC_FOOT_ID]);
    expect([bottomKindOf(kick), kick.off, kick.casters]).toEqual(['feet', true, { casterId: GENERIC_FOOT_ID, feet: true }]);
    const [group] = casterGroups(project, profile.hardware);
    expect([group!.caster.id, group!.places.length, group!.under]).toEqual([GENERIC_FOOT_ID, 4, 'pads']);
    const job = buildJob({ ...project, slug: 'a3' }, profile);
    expect(job.cabinetParts.filter((p) => /caster-pad/.test(p.id)).length).toBe(4);
    const lists = buildLists(job, project, shopFor(project, profile), (mm) => `${Math.round(mm)} mm`);
    const feet = lists.hardware.filter((h) => h.group === 'Feet');
    expect(feet.find((h) => /foot/i.test(h.item))?.quantity).toBe(4);
    expect(lists.hardware.some((h) => h.group === 'Casters')).toBe(false);
    expect(feet.some((h) => /brake/.test(h.note ?? ''))).toBe(false);
    // Casters again: a caster, never the foot.
    setBottomKind(kick, 'casters', profile.hardware);
    expect([bottomKindOf(kick), kick.casters?.casterId, kick.casters?.feet]).toEqual(['casters', GENERIC_CASTER_ID, undefined]);
    setBottomKind(kick, 'flat', profile.hardware);
    expect([bottomKindOf(kick), kick.casters]).toEqual(['flat', undefined]);
  });
});
