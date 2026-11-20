// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BACK_UPRIGHT_OVER, POST_SETBACK, boxOf, cabinetOpeningsOf, cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, deriveParts, drawerBox, designsOf, isDrawer, partBox, postsOf, shopFor, tipWarnings } from '@/design';
import { setPosts } from '@/design/casters';
import { projectScene } from '@/design/scene';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { EURO_SLIDE_ID, GENERIC_SLIDE_ID, createStarterShopProfile } from '@/libraries';
import { SQUARE_2X2_ID } from '@/libraries/materials';
import type { DesignedCabinetContext, Part, Project } from '@/model';
import { FACE_FRAME_PRESET_ID, FRAMELESS_PRESET_ID, FURNITURE_SOLID_PRESET_ID, builtInPresets } from '@/samples/presets';
import { starterById, startProject } from '@/samples/starters';
import { len } from '@/units';

/** Corner posts: a dresser whose corners are square stock from the floor to its top. */
const FACE_FRAME = FACE_FRAME_PRESET_ID;
const FRAMELESS = FRAMELESS_PRESET_ID;
const inches = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000;
function started(preset = FACE_FRAME) {
  const profile = createStarterShopProfile();
  const project = startProject(starterById('dresser-posts')!, builtInPresets().find((p) => p.id === preset)!, profile).project;
  return { project, profile, shop: shopFor(project, profile) };
}
const contextOf = (p: Project) => p.context as DesignedCabinetContext;
const named = (parts: Part[], name: string) => parts.find((p) => p.name === name)!;

describe('a dresser with corner posts', () => {
  const { project, profile, shop } = started();
  const cabinet = cabinetsOf(project)[0]!;
  const posts = postsOf(cabinet, shop.materials)!;
  const parts = deriveCabinetParts(project, shop);
  const [W, D, H34] = [len('60"').mm, len('18"').mm, len('34"').mm];

  it('is a starter: legs of 2×2 stock that run up the corners, 4" under the case, a face frame case', () => {
    const kick = contextOf(project).settings.toeKick;
    expect([kick.legs!.posts, inches(kick.legs!.height.mm), kick.legs!.materialId, kick.off]).toEqual([true, 4, SQUARE_2X2_ID, true]);
    expect(cabinet.construction).toBe('faceFrame');
    expect([inches(posts.leg), inches(posts.under), inches(posts.rail)]).toEqual([1.5, 4, 0.75]);
  });

  it('has four posts from the floor to the top of the case, at its outside corners, and no aprons or stiles', () => {
    const legs = parts.filter((p) => p.role === 'leg' && p.name.startsWith('Post'));
    expect(legs.map((p) => p.name).sort()).toEqual(['Post, back left', 'Post, back right', 'Post, front left', 'Post, front right']);
    for (const p of legs) {
      const b = partBox(p);
      expect([b.min[1], b.max[1]].map(inches)).toEqual([-4, 34]);
      expect([b.max[0] - b.min[0], b.max[2] - b.min[2]].map(inches)).toEqual([1.5, 1.5]);
    }
    const front = partBox(named(parts, 'Post, front left'));
    const back = partBox(named(parts, 'Post, back right'));
    // The front posts are in the plane of the frame, in front of the box; the back ones behind it.
    expect([front.min[0], front.min[2], front.max[2]].map(inches)).toEqual([0, 0, 1.5]);
    expect([back.max[0], back.min[2], back.max[2]].map(inches)).toEqual([60, -18, -16.5]);
    expect(parts.some((p) => p.role === 'apron')).toBe(false);
    expect(parts.some((p) => /stile/i.test(p.name))).toBe(false);
  });

  it('its sides stand between the front and the back posts, a quarter inch in from their faces', () => {
    const { box, shift } = boxOf(cabinet, shop.materials);
    expect([shift, box.size.width.mm, box.size.depth.mm].map(inches)).toEqual([0.25, 59.5, 16.5]);
    const side = partBox(parts.find((p) => p.role === 'side' && p.id.endsWith('side-left'))!);
    expect(side.min[0]).toBeCloseTo(POST_SETBACK, 6);
    expect(side.max[2]).toBeCloseTo(0, 6);
    expect(side.min[2]).toBeGreaterThanOrEqual(-(D - posts.leg) - 1e-6);
    const right = partBox(parts.find((p) => p.role === 'side' && p.id.endsWith('side-right'))!);
    expect(right.max[0]).toBeCloseTo(W - POST_SETBACK, 6);
  });

  it('its top and bottom rails stand upright at the posts\' faces; a rail between two rows lies flat, as deep as a post; the mullion stands on edge', () => {
    // (The front's: the two between the back posts are told apart by their name.)
    const rails = parts.filter((p) => p.role === 'frameRail' && !p.id.includes('rail-back'));
    // A top rail, a bottom rail, and two between the three rows in each of the two bays.
    expect(rails).toHaveLength(6);
    const wide = cabinet.faceFrame.railWidth.mm;
    for (const r of rails) {
      const b = partBox(r);
      const upright = r.name === 'Top rail' || r.name.startsWith('Bottom rail');
      expect(b.max[1] - b.min[1]).toBeCloseTo(upright ? wide : posts.rail, 6);
      expect([b.min[2], b.max[2]].map(inches)).toEqual(upright ? [0.75, 1.5] : [0, 1.5]);
      expect(r.size.thickness).toBeCloseTo(posts.rail, 6);
      expect(r.features.filter((f) => f.kind === 'pocketHole').length).toBeGreaterThanOrEqual(2);
    }
    const top = partBox(named(parts, 'Top rail'));
    expect([top.min[0], top.max[0], top.max[1]].map(inches)).toEqual([1.5, 58.5, 34]);
    expect(inches(partBox(named(parts, 'Bottom rail')).min[1])).toBe(0);
    // Nothing of the box is screwed into them: the posts hold them.
    expect(parts.filter((p) => p.role !== 'side').some((p) => p.features.some((f) => f.id.startsWith('frame-pocket')))).toBe(false);
    const mullion = partBox(named(parts, 'Mullion'));
    expect(inches(mullion.max[0] - mullion.min[0])).toBe(0.75);
    expect([mullion.min[2], mullion.max[2]].map(inches)).toEqual([0, 1.5]);
    expect((mullion.min[0] + mullion.max[0]) / 2).toBeCloseTo(W / 2, 6);
    expect(mullion.min[1]).toBeCloseTo(cabinet.faceFrame.railWidth.mm, 6);
    // Behind it stand two more uprights like it, half-way back and in the back itself, tied along their tops: no panel.
    // The middle one runs down to the floor as the narrow leg.
    expect(parts.some((p) => p.role === 'partition')).toBe(false);
    const leg = partBox(named(parts, 'Leg, middle'));
    const back = partBox(named(parts, 'Divider upright, back'));
    const tie = partBox(named(parts, 'Divider tie'));
    expect(inches(leg.min[1])).toBe(-4);
    expect(leg.max[1]).toBeCloseTo(tie.min[1], 6);
    // The back one is in the back itself, behind the panel: the tie's end against its front face, and it rises behind
    // the tie to the tie's top: all of it ties to the back.
    expect(back.max[1]).toBeCloseTo(tie.max[1], 6);
    expect([leg.min[0], leg.max[0], inches(leg.max[2] - leg.min[2])]).toEqual([mullion.min[0], mullion.max[0], 1.5]);
    expect([back.min[0], back.max[0]]).toEqual([mullion.min[0], mullion.max[0]]);
    expect((leg.min[2] + leg.max[2]) / 2).toBeCloseTo((tie.min[2] + tie.max[2]) / 2, 6);
    const panel = partBox(parts.find((p) => p.role === 'back')!);
    expect(back.min[2]).toBeCloseTo(panel.max[2], 6);
    expect(back.max[2]).toBeCloseTo(tie.min[2], 6);
    expect(tie.max[2]).toBeCloseTo(0, 6);
  });

  it('has no bottom and no top panel: stretchers under its top, and one at the bottom at the back', () => {
    const ids = parts.map((p) => p.id.split('/')[1]);
    expect(ids).not.toContain('bottom');
    expect(ids).not.toContain('top');
    expect(ids).toEqual(expect.arrayContaining(['stretcher-front', 'stretcher-back', 'bottom-stretcher-back']));
    // The frame's bottom rail is the front one.
    expect(ids).not.toContain('bottom-stretcher-front');
    const back = partBox(parts.find((p) => p.id.endsWith('/bottom-stretcher-back'))!);
    expect(back.min[1]).toBeCloseTo(0, 6);
    expect(back.min[2]).toBeLessThan(-len('12"').mm);
  });

  it('its drawer fronts are inset: in their openings with a gap all round, flush with the posts', () => {
    const openings = cabinetOpeningsOf(project, shop.materials);
    // Two rows of two, and a top row of two small ones in each bay.
    expect(openings).toHaveLength(8);
    expect(openings.filter((o) => o.part).map((o) => [o.bay, o.part!.n, inches(o.height)])).toEqual([[1, 1, 6], [1, 2, 6], [2, 1, 6], [2, 2, 6]]);
    expect(openings.every((o) => o.inFrame && o.frontPlane === posts.leg)).toBe(true);
    const fronts = deriveParts(project, shop);
    expect(fronts).toHaveLength(8);
    // One solid board on edge between the two small drawers of each bay, from the frame's face to the back, risen behind the top rail.
    const boards = parts.filter((p) => p.name.startsWith('Drawer divider'));
    expect(boards).toHaveLength(2);
    for (const board of boards) {
      const b = partBox(board);
      expect(inches(b.max[0] - b.min[0])).toBe(0.75);
      expect(inches(b.max[2])).toBe(1.5);
      expect(b.min[2]).toBeLessThan(-len('14"').mm);
      expect(b.max[1]).toBeGreaterThan(H34 - len('1"').mm);
      const cut = board.features[0]!;
      expect(cut.kind === 'cutout' && cut.outline.length).toBe(6);
    }
    expect(parts.some((p) => p.name.startsWith('Short mullion') || p.name.startsWith('Slide upright'))).toBe(false);
    for (const front of fronts) {
      const o = openings.find((x) => front.id.startsWith(designsOf(project).find((d) => d.mounting.openingId === x.id)!.id))!;
      const b = partBox(front);
      expect(b.max[2]).toBeCloseTo(posts.leg, 6);
      expect(b.min[0]).toBeCloseTo(o.origin.x + posts.gap, 4);
      expect(b.max[0]).toBeCloseTo(o.origin.x + o.width - posts.gap, 4);
      expect(b.min[1]).toBeCloseTo(o.origin.y + posts.gap, 4);
      expect(b.max[1]).toBeCloseTo(o.origin.y + o.height - posts.gap, 4);
    }
  });

  it('a drawer box starts behind its front and stays inside the case', () => {
    const drawer = designsOf(project).filter(isDrawer)[0]!;
    const box = drawerBox(drawer, project, shop)!;
    const front = partBox(deriveParts(project, shop).find((p) => p.designObjectId === drawer.id)!);
    const boxes = deriveDrawerBoxParts(project, shop).filter((p) => p.designObjectId === drawer.id && p.role?.startsWith('box')).map(partBox);
    expect(Math.max(...boxes.map((b) => b.max[2]))).toBeCloseTo(front.min[2], 4);
    expect(Math.min(...boxes.map((b) => b.min[2]))).toBeGreaterThan(-(D - posts.leg));
    expect(box.slideAt.front).toBeCloseTo(front.min[2], 4);
    expect(box.slide!.fits).toBe(true);
  });

  it('is drawn and builds, with steps for the posts in place of a leg frame', () => {
    expect('error' in projectScene(project, shop)).toBe(false);
    const job = buildJob({ ...project, slug: 'posts' }, profile);
    expect(job.cabinetParts.filter((p) => p.role === 'leg')).toHaveLength(5);
    const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, undefined, shop.hardware);
    const steps = sections.find((s) => s.title === 'Corner posts: Dresser with posts')!.steps.map((s) => s.text);
    expect(steps.some((s) => s.includes('Each side stands between a front post and a back post'))).toBe(true);
    expect(sections.some((s) => s.title.startsWith('Leg frame'))).toBe(false);
    // What the lists say of it: no bottom to join, since it has none; every
    // drawer a name of its own, the two of a split row "left" and "right"; the divider's notch is not a toe kick's.
    const all = sections.flatMap((s) => s.steps.map((x) => x.text));
    expect(all.some((s) => s.startsWith('Assemble the case: join the stretchers to the sides'))).toBe(true);
    expect(all.some((s) => s.includes("the tops' front and open ends"))).toBe(false);
    const names = designsOf(project).filter(isDrawer).map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Drawer 1, bay 2, right');
    const divider = job.plan.parts.find((p) => p.partId === job.cabinetParts.find((x) => x.name === 'Drawer divider 1')!.id)!;
    expect(divider.steps.map((s) => s.label)).toContain('Notch round the rail');
  });

  it('is of solid wood by choice, and its drawers are on bottom-mount roller slides that open three quarters', () => {
    expect([starterById('dresser-posts')!.prefers, starterById('chest-posts')!.prefers]).toEqual([FURNITURE_SOLID_PRESET_ID, FURNITURE_SOLID_PRESET_ID]);
    const drawers = designsOf(project).filter(isDrawer);
    // Each comes with a knob, its hole drilled on the CNC.
    expect(drawers.every((d) => d.handle?.handleId === 'generic-knob')).toBe(true);
    // Two on a front 24" wide or more, a quarter in from each end; one in the middle of a small one.
    const knobs = (p: Part) => p.features.filter((f) => f.kind === 'hole' && f.id.startsWith('handle'));
    for (const front of deriveParts(project, shop)) {
      const holes = knobs(front);
      expect(holes).toHaveLength(front.size.width >= len('24"').mm ? 2 : 1);
      if (holes.length === 2) expect(holes.map((h) => (h.kind === 'hole' ? h.center.x / front.size.width : 0))).toEqual([0.25, 0.75]);
    }
    expect(deriveParts(project, shop).filter((p) => knobs(p).length === 2)).toHaveLength(4);
    expect(drawers.every((d) => d.slide.slideId === EURO_SLIDE_ID)).toBe(true);
    // It stands on its own with drawers under a top: it wants its strap, but its slides are not what tips it.
    expect(tipWarnings(cabinet, designsOf(project), shop.hardware)).toEqual([]);
    const full = started();
    (full.project.context as DesignedCabinetContext).fronts.drawers.slideId = GENERIC_SLIDE_ID;
    const said = tipWarnings(cabinetsOf(full.project)[0]!, designsOf(full.project), full.shop.hardware);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('Its drawers come right out on full-extension slides');
    // In a solid wood project it is drawn and builds.
    const solid = started(FURNITURE_SOLID_PRESET_ID);
    expect('error' in projectScene(solid.project, solid.shop)).toBe(false);
    expect(buildJob({ ...solid.project, slug: 'solid' }, solid.profile).cabinetParts.filter((p) => p.role === 'leg')).toHaveLength(5);
  });

  it('the slides of a drawer beside a divider or the uprights are screwed to them', () => {
    const drawers = designsOf(project).filter(isDrawer);
    expect(drawers.map((d) => drawerBox(d, project, shop)!.mount).every((m) => m === 'uprights')).toBe(true);
  });

  it('the tall chest is the same build: two small drawers over four wide ones, four rails between the rows', () => {
    const profile = createStarterShopProfile();
    const tall = startProject(starterById('chest-posts')!, builtInPresets().find((p) => p.id === FACE_FRAME)!, profile).project;
    const made = deriveCabinetParts(tall, shopFor(tall, profile));
    expect(made.filter((p) => p.role === 'leg').map((p) => inches(p.size.height))).toEqual([54, 54, 54, 54]);
    expect(made.filter((p) => p.role === 'frameRail' && !p.id.includes('rail-back'))).toHaveLength(6);
    expect(deriveParts(tall, shopFor(tall, profile))).toHaveLength(6);
    expect(made.filter((p) => p.name === 'Drawer divider')).toHaveLength(1);
    expect('error' in projectScene(tall, shopFor(tall, profile))).toBe(false);
  });

  it("the tall chest's sides have nothing cut into them, so they are the saw's, from a full sheet", () => {
    // (While the box had a back of its own the sides had a rabbet for it and were cut on the CNC, on a piece bigger than the usual one.)
    const profile = createStarterShopProfile();
    const tall = startProject(starterById('chest-posts')!, builtInPresets().find((p) => p.id === FURNITURE_SOLID_PRESET_ID)!, profile).project;
    const job = buildJob({ ...tall, slug: 'chest' }, profile);
    const sides = job.projectParts.filter((p) => p.role === 'side');
    expect(sides).toHaveLength(2);
    for (const side of sides) {
      expect(side.size.height).toBeGreaterThan(len('48"').mm);
      expect(side.features.some((f) => f.id === 'rabbet-back' || f.id === 'groove-back')).toBe(false);
      expect(job.plan.parts.find((x) => x.partId === side.id)!.cutOut).not.toBe('cnc');
    }
    // The sides are plywood: one line for it on the buying list, by the sheet.
    expect(tall.materials.find((m) => m.id === sides[0]!.materialId)!.name).toBe('Plywood');
    const buying = buildLists(job, tall, shopFor(tall, profile), (mm) => `${inches(mm)}"`).buying;
    expect(buying.filter((r) => r.material.includes('3/4" Plywood')).map((r) => r.unit)).toEqual(['sheet']);
  });

  it("the back panel is on the very back, between the back posts and in line with them; the box's own members stand behind it", () => {
    const [W, D, H] = [cabinet.size.width.mm, cabinet.size.depth.mm, cabinet.size.height.mm];
    const posts = postsOf(cabinet, shop.materials)!;
    const key = (k: string) => parts.find((p) => p.id === `${cabinet.id}/${k}`)!;
    // One panel over the whole back: between the posts, floor of the case to its top, its rear face in line with the posts'.
    const panels = parts.filter((p) => p.role === 'back');
    expect(panels).toHaveLength(1);
    const back = partBox(panels[0]!);
    const tBack = panels[0]!.size.thickness;
    expect([back.min[0], back.max[0]]).toEqual([expect.closeTo(posts.leg, 6), expect.closeTo(W - posts.leg, 6)]);
    expect([back.min[1], back.max[1]]).toEqual([expect.closeTo(0, 6), expect.closeTo(H, 6)]);
    expect(back.min[2]).toBeCloseTo(-D, 6);
    for (const post of parts.filter((p) => p.id.includes('/leg-back-'))) expect(partBox(post).min[2]).toBeCloseTo(back.min[2], 6);
    // No rail of its own at the back: the box's back stretcher stands on edge between the back posts, right behind the panel.
    expect(parts.some((p) => p.id.includes('rail-back'))).toBe(false);
    const top = partBox(key('stretcher-back'));
    expect([top.min[0], top.max[0]]).toEqual([expect.closeTo(posts.leg, 6), expect.closeTo(W - posts.leg, 6)]);
    expect(top.min[2]).toBeCloseTo(-D + tBack, 6);
    expect(top.max[1]).toBeCloseTo(H, 6);
    // Its pocket holes are on its inside face: the back lies on the other.
    const holes = key('stretcher-back').features.filter((f) => f.kind === 'pocketHole');
    expect(holes.length).toBeGreaterThan(0);
    for (const f of holes) expect(f.face).toBe('A');
    // The bottom one lies flat and runs on to the panel, notched round the two posts: it still reaches the sides in front of them.
    const low = key('bottom-stretcher-back');
    const lowBox = partBox(low);
    expect(lowBox.min[2]).toBeCloseTo(-D + tBack, 6);
    expect(lowBox.min[0]).toBeLessThan(posts.leg);
    const outline = low.features.find((f) => f.id === 'cutout')!;
    expect(outline.kind === 'cutout' && outline.outline).toHaveLength(8);
    expect(outline.kind === 'cutout' && outline.dogBones).toBe(true);
    const notch = posts.leg - lowBox.min[0];
    if (outline.kind === 'cutout') {
      // The notch at each rear corner: as wide as the post reaches past the side, and as deep as the post less the panel.
      const rear = outline.outline.filter((q) => Math.abs(q.y - low.size.height) < 1e-6).map((q) => q.x).sort((m, n) => m - n);
      expect(rear).toEqual([expect.closeTo(notch, 6), expect.closeTo(low.size.width - notch, 6)]);
      expect(low.size.height - Math.max(...outline.outline.filter((q) => q.x === 0).map((q) => q.y))).toBeCloseTo(posts.leg - tBack, 6);
    }
    // The upright behind the bay division is behind the panel too, notched round the stretcher on edge.
    const upright = partBox(named(parts, 'Divider upright, back'));
    expect(upright.min[2]).toBeCloseTo(-D + tBack, 6);
    expect(upright.min[1]).toBeCloseTo(lowBox.max[1], 6);
    const cut = named(parts, 'Divider upright, back').features.find((f) => f.id === 'cutout')!;
    expect(cut.kind === 'cutout' && cut.outline).toHaveLength(6);
    // The board between the two small drawers of the top row runs to the back stretcher, which is screwed through into its end.
    const board = partBox(parts.find((p) => p.name.startsWith('Drawer divider'))!);
    expect(board.min[2]).toBeCloseTo(top.max[2], 6);
    expect(board.max[2]).toBeCloseTo(posts.leg, 6);
    // The sides have no rabbet for a back.
    for (const side of parts.filter((p) => p.role === 'side')) expect(side.features.some((f) => f.id === 'rabbet-back')).toBe(false);
    // A piece with no back has the same members, set in the same, and no panel.
    const open = started().project;
    (contextOf(open).pieces[0] as { noBack?: boolean }).noBack = true;
    const without = deriveCabinetParts(open, shopFor(open, profile));
    expect(without.some((p) => p.role === 'back')).toBe(false);
    expect(partBox(without.find((p) => p.id.endsWith('/stretcher-back'))!).min[2]).toBeCloseTo(-D + tBack, 6);
    // And it builds: the notched stretcher is the CNC's.
    const job = buildJob({ ...project, slug: 'dresser' }, profile);
    expect(job.plan.parts.find((x) => x.partId === low.id)!.cutOut).toBe('cnc');
  });

  it('with one bay, a back wider than 36" between its posts has an upright in its middle; a narrower one has none', () => {
    const profile = createStarterShopProfile();
    const tall = startProject(starterById('chest-posts')!, builtInPresets().find((p) => p.id === FACE_FRAME)!, profile).project;
    const chest = cabinetsOf(tall)[0]!;
    const made = deriveCabinetParts(tall, shopFor(tall, profile));
    const posts = postsOf(chest, shopFor(tall, profile).materials)!;
    expect(chest.size.width.mm - 2 * posts.leg).toBeGreaterThan(BACK_UPRIGHT_OVER);
    const middle = partBox(named(made, 'Back upright'));
    expect((middle.min[0] + middle.max[0]) / 2).toBeCloseTo(chest.size.width.mm / 2, 6);
    // Behind the one panel, which is fastened down it.
    const sheet = made.filter((p) => p.role === 'back');
    expect(sheet).toHaveLength(1);
    expect(middle.min[2]).toBeCloseTo(-chest.size.depth.mm + sheet[0]!.size.thickness, 6);
    // Narrower: no upright, one panel.
    contextOf(tall).pieces[0]!.size.width = len('30"');
    const narrow = deriveCabinetParts(tall, shopFor(tall, profile));
    expect(narrow.some((p) => p.name === 'Back upright')).toBe(false);
    expect(narrow.filter((p) => p.role === 'back')).toHaveLength(1);
  });

  it('is a face frame case whatever the project started as; without posts it is a leg frame again', () => {
    const other = started(FRAMELESS);
    expect(cabinetsOf(other.project)[0]!.construction).toBe('faceFrame');
    expect(deriveCabinetParts(other.project, other.shop).filter((p) => p.role === 'leg')).toHaveLength(5);
    setPosts(contextOf(other.project).settings, false);
    const plain = deriveCabinetParts(other.project, other.shop);
    expect(plain.filter((p) => p.role === 'apron').length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...plain.filter((p) => p.role === 'leg').map((p) => partBox(p).max[1]))).toBeCloseTo(0, 6);
  });
});
