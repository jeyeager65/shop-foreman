// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, deriveDrawerBoxParts, deriveUnderSink, existingProblems, existingShellParts, mountedDesigns, shopFor, takesExisting, takesSink } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { addWallCabinet, createBaseCabinetProject, makeExisting, setExistingOpenings } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: drawer openings in a cabinet that is already there, each with its front kept or made new. */
const profile = createStarterShopProfile();
const cabinet = (construction: 'faceFrame' | 'frameless', layout: 'doors' | 'drawerOverDoors' | 'drawers', drawers?: number) => {
  const project = createBaseCabinetProject(construction, layout, drawers);
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  return { project, shop: shopFor(project, profile), stored, resolved: () => cabinetsOf(project)[0]! };
};
const openingsOf = (c: ReturnType<typeof cabinet>) => deriveCabinetOpenings(c.resolved(), c.shop.materials);

describe('a cabinet that is already there, with drawers', () => {
  for (const construction of ['faceFrame', 'frameless'] as const) {
    for (const [layout, drawers] of [['drawerOverDoors', undefined], ['drawers', 3]] as const) {
      it(`${construction}, ${layout}: starts as the cabinet it was, every opening where it was`, () => {
        const c = cabinet(construction, layout, drawers);
        expect(takesExisting(c.resolved())).toBe(true);
        const was = { height: c.resolved().size.height.mm, width: c.resolved().size.width.mm, openings: openingsOf(c).map((o) => ({ id: o.id, y: o.origin.y, height: o.height, width: o.width })) };
        makeExisting(c.project, c.stored.id, 'new');
        const e = c.stored.existing!;
        expect(e.drawers?.length).toBe(was.openings.length - 1);
        expect(e.lowest).toBe(layout === 'drawers' ? 'drawer' : undefined);
        expect(e.drawers!.every((d) => d.fronts === 'new')).toBe(true);
        expect(c.resolved().size.height.mm).toBeCloseTo(was.height, 4);
        expect(c.resolved().size.width.mm).toBeCloseTo(was.width, 4);
        const now = openingsOf(c);
        expect(now.map((o) => o.id)).toEqual(was.openings.map((o) => o.id));
        now.forEach((o, i) => {
          expect(o.origin.y, o.id).toBeCloseTo(was.openings[i]!.y, 4);
          expect(o.height, o.id).toBeCloseTo(was.openings[i]!.height, 4);
          expect(o.width, o.id).toBeCloseTo(was.openings[i]!.width, 4);
        });
        expect(existingProblems(e)).toEqual([]);
      });
    }
  }

  it('its openings come out as measured: each drawer opening, the rail under it, and the door opening', () => {
    const c = cabinet('faceFrame', 'doors');
    makeExisting(c.project, c.stored.id);
    const before = c.resolved().size.height.mm;
    setExistingOpenings(c.project, c.stored.id, 2);
    const e = c.stored.existing!;
    e.opening = { width: len('18"'), height: len('20"') };
    e.drawers = [
      { height: len('4"'), rail: len('1-1/2"'), fronts: 'new' },
      { height: len('6"'), rail: len('2"'), fronts: 'kept' },
    ];
    const [top, middle, doors] = openingsOf(c);
    expect(top!.use).toBe('drawer');
    expect(doors!.use).toBe('doors');
    expect(top!.height).toBeCloseTo(len('4"').mm, 4);
    expect(middle!.height).toBeCloseTo(len('6"').mm, 4);
    expect(doors!.height).toBeCloseTo(len('20"').mm, 4);
    for (const o of [top!, middle!, doors!]) expect(o.width).toBeCloseTo(len('18"').mm, 4);
    expect(top!.origin.y - (middle!.origin.y + middle!.height)).toBeCloseTo(len('1-1/2"').mm, 4);
    expect(middle!.origin.y - (doors!.origin.y + doors!.height)).toBeCloseTo(len('2"').mm, 4);
    // The box is taller by what the drawer openings take.
    expect(c.resolved().size.height.mm).toBeGreaterThan(before);
    // Frameless there are no rails: the openings stand on each other.
    e.frame = 'frameless';
    const [a, b] = openingsOf(c);
    expect(a!.origin.y - (b!.origin.y + b!.height)).toBeCloseTo(0, 4);
    // The shell is drawn, and nothing of the case is made.
    expect(deriveCabinetParts(c.project, c.shop)).toEqual([]);
    expect(existingShellParts(c.project, c.shop).length).toBeGreaterThan(4);
  });

  it('a new drawer front is a front only: no box, no slides; a kept front is not made', () => {
    const c = cabinet('faceFrame', 'doors');
    makeExisting(c.project, c.stored.id);
    setExistingOpenings(c.project, c.stored.id, 2);
    const e = c.stored.existing!;
    e.drawers![0]!.fronts = 'new';
    const mounted = mountedDesigns(c.project, c.shop.materials);
    expect(mounted.map((d) => d.template)).toEqual(['drawer']);
    expect(deriveDrawerBoxParts(c.project, c.shop)).toEqual([]);
    const job = buildJob(c.project, c.shop);
    expect(job.parts.map((p) => p.id)).toEqual([`${mounted[0]!.id}/front`]);
    expect(job.cabinetParts).toEqual([]);
    // As wide as the opening and its overlays, as a drawer front of a cabinet made here.
    expect(job.parts[0]!.size.width).toBeGreaterThan(e.opening.width.mm);
    const lists = buildLists(job, c.project, c.shop, (mm) => `${mm}`);
    const drawerRows = lists.hardware.filter((h) => h.group === 'Drawer');
    expect(drawerRows.some((h) => /slide/i.test(h.item))).toBe(false);
    expect(drawerRows.some((h) => /washer-head screws/.test(h.item) && /the drawer box that is there/.test(h.note ?? ''))).toBe(true);
    const text = buildChecklist(c.project, job.plan, job.programs, c.shop.tools, undefined, c.shop.hardware).join(' ');
    expect(text).toContain('The new drawer fronts: take each old front off its box');
    expect(text).not.toMatch(/Fit the slides|Assemble each drawer box/);
    // Its doors new as well: a pair of doors and the front.
    e.fronts = 'new';
    expect(buildJob(c.project, c.shop).parts.length).toBe(3);
  });

  it('a bank of drawers: the lowest opening holds a drawer, and nothing is fitted inside', () => {
    const c = cabinet('frameless', 'doors');
    makeExisting(c.project, c.stored.id, 'new');
    setExistingOpenings(c.project, c.stored.id, 2, 'drawer');
    const e = c.stored.existing!;
    expect(e.lowest).toBe('drawer');
    expect(openingsOf(c).map((o) => o.use)).toEqual(['drawer', 'drawer', 'drawer']);
    expect(takesSink(c.resolved())).toBe(false);
    const job = buildJob(c.project, c.shop);
    expect(job.parts.length).toBe(3);
    expect(job.parts.every((p) => p.id.endsWith('/front'))).toBe(true);
    expect(job.cabinetParts).toEqual([]);
    // Back to doors, with no drawer openings: the cabinet it was.
    setExistingOpenings(c.project, c.stored.id, 0, 'doors');
    expect(e.drawers).toBeUndefined();
    expect(e.lowest).toBeUndefined();
    expect(openingsOf(c).map((o) => o.use)).toEqual(['doors']);
  });

  it('under a drawer the cabinet is still fitted out behind its doors', () => {
    const c = cabinet('faceFrame', 'drawerOverDoors');
    makeExisting(c.project, c.stored.id);
    c.stored.inside = { obstacles: [], organizers: [{ id: 'tray-bottom', kind: 'tray' }] };
    expect(takesSink(c.resolved())).toBe(true);
    const built = deriveUnderSink(c.resolved(), c.shop.materials, c.shop.hardware)!;
    expect(built.trays.map((t) => t.name)).toEqual(['Bottom tray']);
    const doors = openingsOf(c).at(-1)!;
    expect(built.trays[0]!.width).toBeLessThan(doors.width);
  });

  it('a wall cabinet has doors only, and a wrong measurement is said', () => {
    const c = cabinet('frameless', 'doors');
    const wall = addWallCabinet(c.project, { name: 'Wall cabinet' });
    makeExisting(c.project, wall.id, 'new');
    expect(() => setExistingOpenings(c.project, wall.id, 1)).toThrow(/doors only/);
    makeExisting(c.project, c.stored.id);
    setExistingOpenings(c.project, c.stored.id, 1);
    c.stored.existing!.drawers![0]!.height = len('0"');
    expect(existingProblems(c.stored.existing!)).toContain('Drawer opening 1 must have a height.');
  });
});
