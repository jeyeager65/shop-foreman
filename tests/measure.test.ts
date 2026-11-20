// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ASSUMED_DEPTH, cabinetsOf, deriveCabinetOpenings, deriveCabinetParts, existingProblems, existingShellParts, measuredInside, openingsOf, shopFor, takesSink } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext } from '@/model';
import { EXISTING_PRESET_ID, builtInPresets, newProjectFromPreset } from '@/samples/presets';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';

/** Organizers: a cabinet that is already there with only its door opening measured is what a refacing project was. */
const profile = createStarterShopProfile();

describe('a cabinet measured for new doors only', () => {
  const project = createVanityProject();
  const shop = shopFor(project, profile);
  const cabinet = () => cabinetsOf(project)[0]!;

  it('is the vanity: one cabinet already there, its inside not measured, its opening as measured', () => {
    expect(project.context.kind).toBe('designedCabinet');
    expect(cabinet().existing).toMatchObject({ frame: 'faceFrame', fronts: 'new' });
    expect(cabinet().existing!.inside).toBeUndefined();
    const opening = deriveCabinetOpenings(cabinet(), shop.materials).at(-1)!;
    expect(opening.width).toBeCloseTo(len('20-15/16"').mm, 6);
    expect(opening.height).toBeCloseTo(len('23-1/2"').mm, 6);
    expect(existingProblems(cabinet().existing!)).toEqual([]);
  });

  it('makes its two doors and nothing else; the doors it has now ride on its opening for the overlay they have', () => {
    const job = buildJob(project, profile);
    expect(job.parts.map((p) => p.name)).toEqual(['Left door', 'Right door']);
    expect(job.cabinetParts).toEqual([]);
    expect(deriveCabinetParts(project, shop)).toEqual([]);
    expect(openingsOf(project, shop.materials)[0]!.existingDoors).toMatchObject({ count: 2, widthAcross: len('21-13/16"') });
  });

  it('is drawn at a size taken from its opening, and takes nothing inside until its inside is measured', () => {
    expect(existingShellParts(project, shop).length).toBeGreaterThan(4);
    expect(cabinet().size.depth.mm).toBeGreaterThan(ASSUMED_DEPTH);
    expect(takesSink(cabinet())).toBe(false);
    const stored = (project.context as CasesContext).pieces[0]!;
    // Measuring the inside starts from the size it is drawn at, and moves nothing.
    const before = { ...cabinet().size };
    stored.existing!.inside = measuredInside(cabinet(), shop.materials);
    expect(cabinet().size.width.mm).toBeCloseTo(before.width.mm, 6);
    expect(cabinet().size.depth.mm).toBeCloseTo(before.depth.mm, 6);
    expect(takesSink(cabinet())).toBe(true);
    delete stored.existing!.inside;
  });

  it('a frameless one with no inside measured is asked its opening', () => {
    const frameless = createVanityProject();
    const stored = (frameless.context as CasesContext).pieces[0]!;
    stored.existing!.frame = 'frameless';
    const opening = deriveCabinetOpenings(cabinetsOf(frameless)[0]!, shopFor(frameless, profile).materials).at(-1)!;
    expect(opening.width).toBeCloseTo(len('20-15/16"').mm, 6);
    stored.existing!.opening.width = len('0"');
    expect(existingProblems(stored.existing!)).toEqual(['The door opening must have a width and a height.']);
  });

  it('is how a project of cabinets that are already there starts: from a preset that says so', () => {
    const preset = builtInPresets().find((p) => p.id === EXISTING_PRESET_ID)!;
    expect(preset.start).toBe('existing');
    const started = newProjectFromPreset(preset, profile).project;
    expect(cabinetsOf(started).map((c) => !!c.existing)).toEqual([true]);
    expect((started.context as CasesContext).room).toBeUndefined();
  });
});
