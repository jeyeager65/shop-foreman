// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetIdOf, shopFor } from '@/design';
import { LEFT_BATCH_ID, addBatch, batchChoices, batchInHand, batchKindOf, batchSlug, batchWants, batchWords, cutChanges, cutCount, forgetCut, markCut, removeBatch, wholeProject } from '@/job/batch';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { Batch, CasesContext, Project } from '@/model';
import { len } from '@/units';
import { createBaseCabinetProject, createFaceFrameRunProject, createShopWallProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';

/** Batches: cutting a project in parts. */
const profile = createStarterShopProfile();
const ids = (job: ReturnType<typeof buildJob>) => [...job.parts, ...job.cabinetParts].map((p) => p.id).sort();
const withBatch = (project: Project, batch: Omit<Batch, 'id' | 'name'>, name = 'Part of it') => {
  Object.assign(addBatch(project, name), batch);
  return project;
};

describe('a batch', () => {
  it('with none in hand the job is everything, as it always was', () => {
    const project = createBaseCabinetProject('faceFrame');
    const job = buildJob(project, profile);
    expect(job.batch).toBeUndefined();
    expect(job.projectParts.map((p) => p.id).sort()).toEqual(ids(job));
    // A batch that chooses nothing is everything too, under its own file names.
    const all = buildJob(withBatch(createBaseCabinetProject('faceFrame'), {}), profile);
    expect(ids(all)).toEqual(ids(job));
    expect(all.batch).toEqual({ id: 'batch-1', name: 'Part of it' });
    expect(all.files.map((f) => f.name)).toEqual(job.files.map((f) => f.name.replace(/^base-cabinet/, 'base-cabinet-part-of-it')));
    expect(all.files.map((f) => f.text.split('\n').filter((l) => !l.startsWith('(')).join('\n'))).toEqual(job.files.map((f) => f.text.split('\n').filter((l) => !l.startsWith('(')).join('\n')));
  });

  it('every part is of one kind: cases, face frames, drawer boxes, fronts', () => {
    const job = buildJob(createBaseCabinetProject('faceFrame'), profile);
    const kinds = new Map<string, string[]>();
    for (const p of job.projectParts) kinds.set(batchKindOf(p), [...(kinds.get(batchKindOf(p)) ?? []), p.name]);
    expect([...kinds.keys()].sort()).toEqual(['cases', 'drawerBoxes', 'faceFrames', 'fronts']);
    expect(kinds.get('fronts')).toEqual(expect.arrayContaining(['Left door', 'Right door']));
    expect(kinds.get('faceFrames')!.every((n) => /stile|rail/i.test(n))).toBe(true);
    expect(kinds.get('cases')).toEqual(expect.arrayContaining(['Left side', 'Bottom', 'Back']));
    expect(kinds.get('drawerBoxes')!.some((n) => /box/i.test(n))).toBe(true);
  });

  it('by kind: the cases now, the doors and drawer fronts later', () => {
    const whole = buildJob(createBaseCabinetProject('faceFrame'), profile);
    const cases = buildJob(withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['cases', 'faceFrames'] }, 'Cases'), profile);
    const fronts = buildJob(withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['fronts'] }, 'Fronts'), profile);
    expect(cases.parts).toEqual([]);
    expect(cases.cabinetParts.every((p) => ['cases', 'faceFrames'].includes(batchKindOf(p)))).toBe(true);
    expect(fronts.cabinetParts).toEqual([]);
    expect(fronts.parts.map((p) => p.id).sort()).toEqual(whole.parts.map((p) => p.id).sort());
    // Nothing is in both, and the plan of each has only its own parts.
    expect(ids(cases).filter((id) => ids(fronts).includes(id))).toEqual([]);
    expect(cases.plan.parts.map((p) => p.partId).sort()).toEqual(ids(cases));
    expect(fronts.files.every((f) => f.name.startsWith('base-cabinet-fronts'))).toBe(true);
    expect(cases.projectParts).toHaveLength(whole.projectParts.length);
  });

  it('by cabinet and by material, and the three combine', () => {
    const project = createShopWallProject();
    const whole = buildJob(project, profile);
    const cabinetOf = cabinetIdOf(project);
    const second = [...new Set(whole.projectParts.map((p) => cabinetOf(p.id)!))][1]!;
    const one = buildJob(withBatch(createShopWallProject(), { cabinetIds: [second] }), profile);
    expect(ids(one).length).toBeGreaterThan(0);
    expect([...one.parts, ...one.cabinetParts].every((p) => cabinetOf(p.id) === second)).toBe(true);
    const material = whole.cabinetParts.find((p) => p.role === 'back')!.materialId;
    const thin = buildJob(withBatch(createShopWallProject(), { materialIds: [material] }), profile);
    expect([...thin.parts, ...thin.cabinetParts].every((p) => p.materialId === material)).toBe(true);
    expect(thin.plan.blanks.every((b) => b.materialId === material)).toBe(true);
    const both = buildJob(withBatch(createShopWallProject(), { cabinetIds: [second], materialIds: [material] }), profile);
    expect(ids(both)).toEqual(ids(one).filter((id) => ids(thin).includes(id)));
  });

  it('one that chooses nothing that exists says so in words', () => {
    const project = withBatch(createVanityProject(), { kinds: ['tops'] }, 'Tops');
    expect(() => buildJob(project, profile)).toThrow(/The batch "Tops" has no parts/);
  });

  it('is kept by name in the project; deleting the one in hand makes the job everything again', () => {
    const project = createBaseCabinetProject();
    const first = addBatch(project);
    const second = addBatch(project, ' Doors ');
    expect([first.name, second.name, project.plan.batchId]).toEqual(['Batch 1', 'Doors', 'batch-2']);
    expect(batchInHand(project)).toBe(second);
    expect(batchSlug(second)).toBe('doors');
    expect(batchSlug({ id: 'batch-9', name: '  ' })).toBe('batch-9');
    removeBatch(project, second.id);
    expect(batchInHand(project)).toBeUndefined();
    expect(project.plan.batches).toEqual([first]);
    removeBatch(project, first.id);
    expect(project.plan.batches).toBeUndefined();
  });

  it('chooses from what the project has, and says what it makes in a line', () => {
    const project = createBaseCabinetProject('faceFrame');
    const job = buildJob(project, profile);
    const choices = batchChoices(project, job.projectParts, project.materials);
    expect(choices.cabinets.map((c) => c.title)).toEqual(['Base cabinet']);
    expect(choices.kinds.map((k) => k.value)).toEqual(['cases', 'faceFrames', 'drawerBoxes', 'fronts']);
    expect(choices.materials.length).toBeGreaterThan(2);
    expect(batchWords({ id: 'b', name: 'B' }, project, project.materials)).toBe('every part of the project');
    expect(batchWords({ id: 'b', name: 'B', cabinetIds: [choices.cabinets[0]!.value], kinds: ['fronts'], materialIds: ['mdf-3-4'] }, project, project.materials)).toBe('Base cabinet · doors and drawer fronts · MDF');
  });
});

describe('the lists and the checklist of a batch', () => {
  const lists = (project: Project) => {
    const shop = shopFor(project, profile);
    return buildLists(buildJob(project, profile), project, shop, (mm) => `${Math.round(mm)} mm`);
  };
  const items = (project: Project, group: string) => lists(project).hardware.filter((h) => h.group === group).map((h) => h.item);

  it('a batch of the fronts lists hinges and no brads for a back; a batch of the cases the other way', () => {
    const whole = createBaseCabinetProject('faceFrame');
    expect(items(whole, 'Case').some((i) => /brads/.test(i))).toBe(true);
    expect(items(whole, 'Doors').length).toBeGreaterThan(0);
    const fronts = withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['fronts'] }, 'Fronts');
    expect(items(fronts, 'Case')).toEqual([]);
    expect(items(fronts, 'Doors')).toEqual(items(whole, 'Doors'));
    expect(items(fronts, 'Pocket screws')).toEqual([]);
    const cases = withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['cases', 'faceFrames'] }, 'Cases');
    expect(items(cases, 'Case').some((i) => /brads/.test(i))).toBe(true);
    expect(items(cases, 'Doors')).toEqual([]);
    expect(items(cases, 'Drawer')).toEqual([]);
    // Only the finish of what the batch makes.
    const painted = (p: Project) => {
      p.settings.finish = { caseId: profile.finishes[0]!.id, frontsId: profile.finishes[1]!.id };
      return p;
    };
    // Two paints and the primer under them.
    expect(items(painted(createBaseCabinetProject('faceFrame')), 'Finish')).toEqual([profile.finishes[0]!.name, profile.finishes[1]!.name, 'Primer']);
    expect(items(painted(withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['fronts'] })), 'Finish')).toEqual([profile.finishes[1]!.name, 'Primer']);
  });

  it('what joins a run is listed once the batch makes both its cabinets', () => {
    const run = createFaceFrameRunProject();
    const joins = items(run, 'Runs').length;
    expect(joins).toBeGreaterThan(0);
    const first = (run.context as { pieces: { id: string }[] }).pieces[0]!.id;
    expect(items(withBatch(createFaceFrameRunProject(), { cabinetIds: [first] }), 'Runs')).toEqual([]);
    expect(items(withBatch(createFaceFrameRunProject(), { kinds: ['cases'] }), 'Runs')).toHaveLength(joins);
  });

  it('batchWants: a cabinet and a kind, each left out for all; materials say nothing', () => {
    expect(batchWants(undefined)('a', 'cases')).toBe(true);
    const wants = batchWants({ id: 'b', name: 'B', cabinetIds: ['a'], kinds: ['fronts'], materialIds: ['x'] });
    expect([wants('a', 'fronts'), wants('a', 'cases'), wants('z', 'fronts'), wants(undefined, 'fronts')]).toEqual([true, false, false, false]);
    expect(batchWants({ id: 'b', name: 'B', materialIds: ['x'] })('z', 'tops')).toBe(true);
  });

  it("Build's checklist has a section only for the cabinets the batch makes, and sets a run only when it makes it all", () => {
    const sections = (project: Project) => {
      const job = buildJob(project, profile);
      const shop = shopFor(project, profile);
      return buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware);
    };
    const whole = sections(createFaceFrameRunProject());
    const run = createFaceFrameRunProject();
    const [first, second] = (run.context as { pieces: { id: string; name: string }[] }).pieces;
    const one = sections(withBatch(run, { cabinetIds: [first!.id] }));
    const titles = (s: typeof whole) => s.map((x) => x.title);
    expect(titles(whole).some((t) => t.includes(second!.name))).toBe(true);
    expect(titles(one).some((t) => t.includes(first!.name))).toBe(true);
    expect(titles(one).filter((t) => t.includes(second!.name) && !t.includes(first!.name))).toEqual([]);
    const text = (s: typeof whole) => s.flatMap((x) => x.steps.map((y) => y.text)).join(' ');
    expect(text(whole)).toMatch(/Clamp each pair together/);
    expect(text(one)).not.toMatch(/Clamp each pair together/);
  });

  it('the whole project is still there to buy for: the job of everything, whatever batch is in hand', () => {
    const batched = withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['fronts'] });
    const whole = wholeProject(batched);
    expect(batchInHand(whole)).toBeUndefined();
    expect(batched.plan.batchId).toBe('batch-1');
    expect(lists(whole).buying).toEqual(lists(createBaseCabinetProject('faceFrame')).buying);
    expect(lists(batched).buying.length).toBeLessThan(lists(whole).buying.length);
  });
});

describe('what is cut', () => {
  const AT = '2026-11-15T12:00:00.000Z';
  const L = (mm: number) => `${Math.round(mm)} mm`;
  /** Cuts the cases and face frames of a face frame cabinet as a batch, and marks them. */
  const casesCut = () => {
    const project = withBatch(createBaseCabinetProject('faceFrame'), { kinds: ['cases', 'faceFrames'] }, 'Cases');
    const job = buildJob(project, profile);
    markCut(project, [...job.parts, ...job.cabinetParts], job.batch!.name, AT);
    return { project, job };
  };

  it('marking a job remembers each of its parts as it was: its batch, its size, its material and what is cut into it', () => {
    const { project, job } = casesCut();
    const cut = project.plan.cut!;
    expect(Object.keys(cut).sort()).toEqual(job.cabinetParts.map((p) => p.id).sort());
    const side = job.cabinetParts.find((p) => p.name === 'Left side')!;
    expect(cut[side.id]).toMatchObject({ name: 'Left side', batch: 'Cases', at: AT, materialId: side.materialId });
    expect(cut[side.id]!.size.width).toBeCloseTo(side.size.width, 2);
    expect(cut[side.id]!.features).toMatch(/^[0-9a-f]+$/);
    expect(cutCount(project, job.projectParts)).toEqual({ cut: job.cabinetParts.length, all: job.projectParts.length });
    // It stores a record, never a part.
    expect(JSON.stringify(cut)).not.toContain('outline');
  });

  it('"What is left" is a batch of its own: every part not yet cut, under its own file names', () => {
    const { project, job } = casesCut();
    project.plan.batchId = LEFT_BATCH_ID;
    expect(batchInHand(project)).toMatchObject({ id: LEFT_BATCH_ID, name: 'What is left' });
    const left = buildJob(project, profile);
    const cutIds = new Set(job.cabinetParts.map((p) => p.id));
    expect(ids(left)).toEqual(job.projectParts.map((p) => p.id).filter((id) => !cutIds.has(id)).sort());
    expect(left.files.every((f) => f.name.startsWith('base-cabinet-what-is-left'))).toBe(true);
    expect(batchWords(batchInHand(project)!, project, project.materials)).toBe('every part not yet marked as cut');
    // Its lists are of all it makes: it chooses by what is cut, not by cabinet or kind.
    expect(batchWants(batchInHand(project))('any', 'fronts')).toBe(true);
    // With everything cut nothing is left, and the job says so.
    markCut(project, [...left.parts, ...left.cabinetParts], 'What is left', AT);
    expect(() => buildJob(project, profile)).toThrow(/Nothing is left: every part of the project is marked as cut/);
    expect(cutCount(project, job.projectParts)).toEqual({ cut: job.projectParts.length, all: job.projectParts.length });
  });

  it('forgetting a part puts it back in what is left; forgetting everything makes the job everything again', () => {
    const { project, job } = casesCut();
    project.plan.batchId = LEFT_BATCH_ID;
    const before = ids(buildJob(project, profile)).length;
    forgetCut(project, [job.cabinetParts[0]!.id]);
    expect(ids(buildJob(project, profile))).toHaveLength(before + 1);
    forgetCut(project);
    expect(project.plan.cut).toBeUndefined();
    expect(project.plan.batchId).toBeUndefined();
  });

  it('nothing is said of parts that are still what was cut', () => {
    const { project, job } = casesCut();
    expect(cutChanges(project, job.projectParts, L)).toEqual([]);
    // Worked out again, the same design gives the same parts.
    expect(cutChanges(project, buildJob(wholeProject(project), profile).projectParts, L)).toEqual([]);
  });

  it('a part whose design changed since it was cut is named, with what changed', () => {
    const { project } = casesCut();
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.size.width = len('30"');
    const now = buildJob(wholeProject(project), profile).projectParts;
    const changes = cutChanges(project, now, L, (id) => `<${id}>`);
    const byName = new Map(changes.map((c) => [c.name, c]));
    // Wider: the bottom, the back and the rails are another size; the sides are not, and are not named.
    expect(byName.get('Bottom')!.changes.join(' ')).toMatch(/Its size: it was cut \d+ mm × \d+ mm × \d+ mm and is now \d+ mm × \d+ mm × \d+ mm\./);
    expect(byName.get('Bottom')).toMatchObject({ batch: 'Cases', at: AT });
    expect(byName.has('Left side')).toBe(false);
    expect(byName.has('Left door')).toBe(false);
    // Another joint: the same size, but what is cut into the side is not what was cut.
    stored.size.width = len('24"');
    project.plan.cut = undefined;
    const again = buildJob(project, profile);
    markCut(project, [...again.parts, ...again.cabinetParts], 'Cases', AT);
    (project.context as CasesContext).settings.joinery.case = 'dado';
    const dado = cutChanges(project, buildJob(wholeProject(project), profile).projectParts, L);
    expect(dado.find((c) => c.name === 'Left side')!.changes).toEqual(['What is cut into it: its outline, its joints or its holes are not what was cut.']);
  });

  it('a part that was cut and is no longer in the design is named too, and another material is said', () => {
    const { project } = casesCut();
    const context = project.context as CasesContext;
    const was = context.settings.materials.caseId;
    const other = project.materials.find((m) => m.id !== was && Math.abs(m.measuredThickness.mm - project.materials.find((x) => x.id === was)!.measuredThickness.mm) < 1);
    context.pieces[0]!.adjustableShelves = 0;
    const now = buildJob(wholeProject(project), profile).projectParts;
    const gone = cutChanges(project, now, L).filter((c) => c.changes.includes('It is no longer in the design.'));
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.every((c) => /shelf/i.test(c.name))).toBe(true);
    if (other) {
      context.settings.materials.caseId = other.id;
      const swapped = cutChanges(project, buildJob(wholeProject(project), profile).projectParts, L, (id) => `<${id}>`);
      expect(swapped.find((c) => c.name === 'Left side')!.changes.join(' ')).toContain(`Its material: it was cut from <${was}> and is now <${other.id}>.`);
    }
  });
});
