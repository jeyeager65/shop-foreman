// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bottomKindOf, cabinetsOf, needsAntiTip, shelfSpan, shelfWarnings, shopFor } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject, createKitchenProject } from '@/samples/cabinet';
import { FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Furniture: the bookcase, the dresser and the night stand; a shelf too long; the anti-tip strap. */
const contextOf = (p: Project) => p.context as CasesContext;
const preset = (id: string) => builtInPresets().find((p) => p.id === id)!;
const started = (id: string, style = FACE_FRAME_PRESET_ID, profile = createStarterShopProfile()) => ({ profile, project: startProject(starterById(id)!, preset(style), profile).project });
const inches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const lists = (project: Project, profile: ReturnType<typeof createStarterShopProfile>) => buildLists(buildJob({ ...project, slug: 'f' }, profile), project, shopFor(project, profile), (mm) => `${inches(mm)}"`);

describe('the furniture that is a case', () => {
  it('a bookcase: tall, open, a fixed shelf, on a plinth, under a top of its own', () => {
    const { project, profile } = started('bookcase');
    const [c] = cabinetsOf(project);
    expect([c!.form, inches(c!.size.width.mm), inches(c!.size.height.mm), inches(c!.size.depth.mm)]).toEqual(['tall', 32, 72, 12]);
    expect(c!.layout.rows.map((r) => [r.use, r.open])).toEqual([['doors', true], ['doors', true]]);
    expect([bottomKindOf(contextOf(project).settings.toeKick), !!c!.top?.own, c!.construction]).toEqual(['plinth', true, 'faceFrame']);
    const job = buildJob({ ...project, slug: 'bookcase' }, profile);
    // No doors; a fixed shelf and four loose ones; its top and the four strips round it.
    expect(job.parts).toEqual([]);
    expect(job.cabinetParts.filter((p) => p.id.endsWith('/fixed-shelf')).length).toBe(1);
    expect(job.cabinetParts.filter((p) => p.role === 'shelf' && !p.id.includes('fixed')).length).toBe(4);
    expect(job.cabinetParts.filter((p) => p.role === 'top' || p.role === 'topEdge').length).toBe(5);
    expect(job.files.length).toBeGreaterThan(0);
  });

  it('a dresser and a night stand: drawers, a top panel under a top of their own, on feet', () => {
    const dresser = started('dresser');
    const [d] = cabinetsOf(dresser.project);
    expect([inches(d!.size.width.mm), inches(d!.size.height.mm), inches(d!.size.depth.mm), d!.layout.rows.length, d!.caseTop, !!d!.top?.own]).toEqual([36, 34, 18, 4, 'panel', true]);
    expect(bottomKindOf(contextOf(dresser.project).settings.toeKick)).toBe('feet');
    const night = started('nightstand', FRAMELESS_PRESET_ID);
    const [n] = cabinetsOf(night.project);
    expect([inches(n!.size.width.mm), inches(n!.size.height.mm), n!.layout.rows.map((r) => (r.use === 'drawer' ? 'drawer' : r.open ? 'open' : 'doors'))]).toEqual([20, 26, ['drawer', 'open']]);
    for (const { project, profile } of [dresser, night]) {
      const job = buildJob({ ...project, slug: 'f' }, profile);
      expect(job.cabinetParts.some((p) => p.id.endsWith('/top'))).toBe(true);
      // A pad under each foot behind a face frame; the frameless one's feet are screwed straight to its 3/4" bottom.
      expect(job.cabinetParts.filter((p) => /caster-pad/.test(p.id)).length).toBe(project === dresser.project ? 4 : 0);
      expect(job.files.length).toBeGreaterThan(0);
    }
  });

  it('want an anti-tip strap on the hardware list; cabinets in a kitchen do not', () => {
    for (const id of ['bookcase', 'dresser']) {
      const { project, profile } = started(id);
      expect(needsAntiTip(cabinetsOf(project)[0]!), id).toBe(true);
      const strap = lists(project, profile).hardware.find((h) => /Anti-tip/.test(h.item));
      expect([strap?.quantity, strap?.group], id).toEqual([1, 'Case']);
    }
    // A night stand has one drawer: no strap. A plain base cabinet, a bank of drawers under a countertop, and a kitchen: none.
    expect(needsAntiTip(cabinetsOf(started('nightstand').project)[0]!)).toBe(false);
    expect(needsAntiTip(cabinetsOf(started('drawers').project)[0]!)).toBe(false);
    const kitchen = createKitchenProject();
    expect(cabinetsOf(kitchen).filter(needsAntiTip)).toEqual([]);
    expect(lists(kitchen, createStarterShopProfile()).hardware.some((h) => /Anti-tip/.test(h.item))).toBe(false);
  });
});

describe('a shelf too long for its thickness', () => {
  it('is warned of past about 32" in 3/4" plywood, less in MDF, and never where there is no shelf', () => {
    const profile = createStarterShopProfile();
    const { project } = started('bookcase', FACE_FRAME_PRESET_ID, profile);
    const materials = () => shopFor(project, profile).materials;
    const L = (mm: number) => `${inches(mm)}"`;
    const stored = contextOf(project).pieces[0]!;
    // 32" wide: the shelves span about 30-1/2" between sides of 3/4" plywood as it measures. No warning.
    expect(inches(shelfSpan(cabinetsOf(project)[0]!, materials()).span)).toBeCloseTo(30.5, 0);
    expect(shelfWarnings(cabinetsOf(project)[0]!, materials(), L)).toEqual([]);
    stored.size.width = len('40"');
    const [warning] = shelfWarnings(cabinetsOf(project)[0]!, materials(), L);
    expect(warning).toMatch(/^Its shelves span 38\.\d+": more than about 3\d/);
    // Two bays halve the span: a partition stands behind the face frame's mullion.
    stored.layout = { ...stored.layout, bays: [{}, {}] };
    expect(shelfWarnings(cabinetsOf(project)[0]!, materials(), L)).toEqual([]);
    // With the partition turned off the mullion has nothing behind it, and the shelves run the full width again.
    stored.layout = { ...stored.layout, partitions: false };
    expect(shelfWarnings(cabinetsOf(project)[0]!, materials(), L)[0]).toMatch(/^Its shelves span 38\.\d+".*Put a partition behind each mullion/);
    // Drawers only: nothing to sag, however wide.
    const drawers = createBaseCabinetProject('frameless', 'drawers', 3);
    contextOf(drawers).pieces[0]!.size.width = len('48"');
    expect(shelfWarnings(cabinetsOf(drawers)[0]!, shopFor(drawers, profile).materials, L)).toEqual([]);
  });
});
