// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, piecesOf, shopFor } from '@/design';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Project } from '@/model';
import { createBaseCabinetProject, setupExample } from '@/samples/cabinet';
import { EXISTING_PRESET_ID, FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, FURNITURE_INSET_PRESET_ID, FURNITURE_PRESET_ID, FURNITURE_SOLID_PRESET_ID, SHOP_PRESET_ID, builtInPresets } from '@/samples/presets';
import { STARTERS, STARTER_GROUPS, addableStarters, shapeExample, starterById, startProject } from '@/samples/starters';
import pages from '@/samples/samplePages.json';
import { matching, sampleGroups, searchWords } from '@/samples/sampleList';

/** The starters: one list of what can be made, to start a project from and to add to one. */
const profile = createStarterShopProfile();
const preset = (id: string) => builtInPresets().find((p) => p.id === id)!;
const contextOf = (p: Project) => p.context as CasesContext;
/** The project as the 3D view draws it: an error here is a starter that cannot be made in that style. */
const scene = (project: Project) => {
  const s = projectScene(project, shopFor(project, profile), profile.materialGroups);
  if ('error' in s) throw new Error(s.error);
  return s;
};

describe('the starters', () => {
  it('are one list in the groups the Samples page has, each with a title and what it makes', () => {
    expect(STARTER_GROUPS.map((g) => g.id)).toEqual(['cabinets', 'room', 'furniture', 'existing', 'shop', 'small']);
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length);
    for (const s of STARTERS) {
      expect(STARTER_GROUPS.some((g) => g.id === s.group), s.id).toBe(true);
      expect(s.title.length && s.what.length, s.id).toBeGreaterThan(0);
    }
    // A group's finished examples are a group of the Samples page.
    const sampleGroups = (pages as { id: string }[]).map((g) => g.id);
    for (const g of STARTER_GROUPS) if (g.samples) expect(sampleGroups).toContain(g.samples);
    // Jigs need no project: the tile goes to their page.
    expect(starterById('jigs')!.to).toBe('/jigs');
    expect(() => startProject(starterById('jigs')!, preset(FRAMELESS_PRESET_ID), profile)).toThrow('needs no project');
  });

  it('each start a project in every style it is offered in, which can be drawn', () => {
    for (const starter of STARTERS.filter((s) => !s.to)) {
      const styles = starter.existing ? [EXISTING_PRESET_ID] : [FRAMELESS_PRESET_ID, FACE_FRAME_PRESET_ID, SHOP_PRESET_ID, FURNITURE_PRESET_ID, FURNITURE_SOLID_PRESET_ID, FURNITURE_INSET_PRESET_ID];
      for (const id of styles) {
        const { project } = startProject(starter, preset(id), profile);
        const where = `${starter.id} in ${id}`;
        expect(project.starter, where).toBe(starter.id);
        expect(project.name, where).toBe(starter.name);
        // One that comes as it is (the shop table) keeps its own style whatever is asked.
        // A case with corner posts is a face frame's in any style: the posts are the frame's stiles.
        const posts = !!contextOf(project).settings.toeKick.legs?.posts;
        if (!starter.fixed) expect([project.preset, contextOf(project).settings.construction], where).toEqual([preset(id).name, posts ? 'faceFrame' : preset(id).settings.construction]);
        else expect(contextOf(project).settings.construction, where).toBe('shop');
        expect(scene(project).parts.length, where).toBeGreaterThan(0);
      }
    }
  });

  it('make the thing: its size, its layout and what is in it', () => {
    const made = (id: string, style = FRAMELESS_PRESET_ID) => startProject(starterById(id)!, preset(style), profile).project;
    // One cabinet stands in no room; a room of cabinets brings its room.
    const base = made('base');
    expect(cabinetsOf(base).map((c) => [c.form, Math.round(c.size.width.mm / 25.4), c.layout.rows.length])).toEqual([['base', 24, 2]]);
    expect(contextOf(base).room).toBeUndefined();
    expect(cabinetsOf(made('drawers')).map((c) => [Math.round(c.size.width.mm / 25.4), c.layout.rows.length])).toEqual([[18, 3]]);
    expect(cabinetsOf(made('wall')).map((c) => c.form)).toEqual(['wall']);
    expect(cabinetsOf(made('tall')).map((c) => c.form)).toEqual(['tall']);
    const vanity = cabinetsOf(made('vanity', FACE_FRAME_PRESET_ID))[0]!;
    expect([Math.round(vanity.size.width.mm / 25.4), Math.round(vanity.size.depth.mm / 25.4), vanity.inside?.organizers.length, vanity.inside?.obstacles.length, !!vanity.topSupport?.cornerBlocks]).toEqual([30, 21, 1, 1, true]);
    expect(cabinetsOf(made('corner'))[0]!.corner).toEqual({ kind: 'diagonal', side: 'left' });
    const run = made('run');
    expect(contextOf(run).runs.map((r) => [r.cabinetIds.length, r.ends.left, !!r.top])).toEqual([[3, 'wall', true]]);
    expect(contextOf(run).room).toBeDefined();
    expect(cabinetsOf(made('kitchen', FACE_FRAME_PRESET_ID)).length).toBeGreaterThan(5);
    expect(contextOf(made('island')).islands?.length).toBe(1);
    // Cabinets already there: measured, nothing of the case made.
    expect(cabinetsOf(made('newfronts', EXISTING_PRESET_ID)).every((c) => c.existing?.fronts === 'new')).toBe(true);
    const trays = cabinetsOf(made('organizers', EXISTING_PRESET_ID))[0]!;
    expect([trays.existing?.fronts, trays.inside?.organizers.length]).toEqual(['kept', 2]);
    expect(cabinetsOf(made('undersink', EXISTING_PRESET_ID))[0]!.inside?.obstacles.length).toBe(1);
    expect(contextOf(made('casters', SHOP_PRESET_ID)).settings.toeKick.casters).toBeDefined();
  });

  it('a started vanity and a started bank of drawers each give a job that cuts', () => {
    for (const id of ['vanity', 'drawers']) {
      const { project } = startProject(starterById(id)!, preset(FRAMELESS_PRESET_ID), profile);
      const job = buildJob({ ...project, slug: id }, profile);
      expect(job.files.length, id).toBeGreaterThan(0);
    }
  });

  it('furniture is offered its own style first, and a new table and top start as Setup says', () => {
    for (const id of ['bookcase', 'dresser', 'nightstand', 'tvstand', 'endtable', 'writingdesk', 'desk']) expect(starterById(id)!.prefers, id).toBe(FURNITURE_PRESET_ID);
    // In the furniture style a dresser is face frame with slab fronts of plywood, stained; its job cuts.
    const { project } = startProject(starterById('dresser')!, preset(FURNITURE_PRESET_ID), profile);
    expect([contextOf(project).fronts.doors.style.kind, project.settings.finish?.frontsId]).toEqual(['slab', 'stain-golden-oak']);
    expect(buildJob({ ...project, slug: 'dresser' }, profile).files.length).toBeGreaterThan(0);
    // Setup's answers for new tables and tops: a 3x3 and a chamfered edge 2" over the front.
    contextOf(project).furniture = { legMaterialId: 'square-3x3', top: { overhang: { front: { mm: 50.8, unit: 'in' }, ends: { mm: 25.4, unit: 'in' }, back: { mm: 0, unit: 'in' } }, edge: { kind: 'chamfer', size: { mm: 3, unit: 'mm' } } } };
    const table = starterById('endtable')!.add!(project, 'Table', undefined, profile) as unknown as { legs: { materialId: string }; top: { edge: { kind: string }; overhang: { front: { mm: number } } } };
    expect([table.legs.materialId, table.top.edge.kind, table.top.overhang.front.mm]).toEqual(['square-3x3', 'chamfer', 50.8]);
    // A copy: changing the table's top does not change Setup's answer.
    table.top.overhang.front.mm = 10;
    expect(contextOf(project).furniture!.top!.overhang.front.mm).toBe(50.8);
  });

  it("give Setup its example: the thing started, when that is one cabinet", () => {
    const example = (id: string) => {
      const { project } = startProject(starterById(id)!, preset(FACE_FRAME_PRESET_ID), profile);
      return cabinetsOf(shapeExample(setupExample(project), project.starter, profile));
    };
    expect(example('vanity').map((c) => [Math.round(c.size.width.mm / 25.4), !!c.inside, c.construction])).toEqual([[30, true, 'faceFrame']]);
    expect(example('drawers').map((c) => c.layout.rows.length)).toEqual([3]);
    expect(example('wall').map((c) => c.form)).toEqual(['wall']);
    // A table's example is the table: no cabinet in it.
    expect(example('endtable')).toEqual([]);
    // A kitchen, a run and a cabinet on casters keep the usual example: a 24" base cabinet as Setup's answers stand.
    for (const id of ['kitchen', 'run', 'casters', 'base']) expect(example(id).map((c) => [c.form, Math.round(c.size.width.mm / 25.4)]), id).toEqual([['base', 24]]);
    // A project with no starter (an older one) too.
    expect(cabinetsOf(shapeExample(setupExample(createBaseCabinetProject('frameless')), undefined, profile)).length).toBe(1);
  });

  it('each link to finished examples: its words find at least one sample', () => {
    for (const s of STARTERS.filter((x) => !x.to)) {
      expect(s.examples, s.id).toBeTruthy();
      const found = sampleGroups().flatMap((g) => matching(g, searchWords(s.examples!)));
      expect(found.length, `${s.id}: "${s.examples}"`).toBeGreaterThan(0);
    }
    // The hidden groups (Screens, the starters' own pictures) are never among them.
    expect(sampleGroups().some((g) => g.id === 'starters' || g.id === 'screens')).toBe(false);
  });

  it("are what Design's Add offers: the ones that are one cabinet, added to a project under a name", () => {
    expect(addableStarters().map((s) => s.id)).toEqual(['base', 'drawers', 'wall', 'tall', 'vanity', 'corner', 'bookcase', 'dresser', 'nightstand', 'tvstand', 'closettower', 'endtable', 'coffeetable', 'writingdesk', 'assemblytable', 'dropleaftable', 'sofatable']);
    const project = createBaseCabinetProject('frameless');
    // The shop is handed over: a furniture top's materials are copied from its catalog.
    for (const s of addableStarters()) s.add!(project, `${s.stem} added`, cabinetsOf(project)[0]!.id, profile);
    expect(cabinetsOf(project).map((c) => c.name).slice(1)).toEqual(['Cabinet added', 'Drawers added', 'Wall cabinet added', 'Tall cabinet added', 'Vanity added', 'Corner cabinet added', 'Bookcase added', 'Dresser added', 'Night stand added', 'TV stand added', 'Closet tower added']);
    expect(cabinetsOf(project).map((c) => c.form).slice(1)).toEqual(['base', 'base', 'wall', 'tall', 'base', 'base', 'tall', 'base', 'base', 'base', 'tall']);
    // The tables are pieces of another kind: after the cabinets, each under its name.
    expect(piecesOf(project).filter((p) => p.kind === 'frame').map((p) => p.name)).toEqual(['End table added', 'Coffee table added', 'Writing desk added', 'Assembly table added', 'Drop-leaf table added', 'Sofa table added']);
    expect(cabinetsOf(project)[5]!.inside?.organizers.length).toBe(1);
    // A piece added takes the project's style as it is: its bottom is the project's, here a toe kick.
    expect(contextOf(project).settings.toeKick.casters).toBeUndefined();
    expect(scene(project).cabinets.length).toBe(18);
  });
});
