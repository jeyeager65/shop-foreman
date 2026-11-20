// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSlideShimObjects, buildSlideShims3mf } from '@/jigs/slideShims';
import { cabinetsOf, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { KREG_SEAT, buildLists, pocketScrewLength } from '@/job/lists';
import { listsFileName, listsHtml } from '@/job/listsHtml';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, ConstructionStyle, DrawerDesign, Project } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { DEFAULT_UNIT_PREFERENCES, MM_PER_INCH, formatLength } from '@/units';

const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const inch = MM_PER_INCH;
const cabinetOf = (project: Project) => cabinetsOf(project)[0]!;
const drawerOf = (project: Project) => designsOf(project).find((d) => d.template === 'drawer') as DrawerDesign;

function listsFor(style: ConstructionStyle, change?: (cabinet: CabinetDesign, project: Project) => void) {
  const shop = createStarterShop();
  const project = createBaseCabinetProject(style);
  change?.(cabinetOf(project), project);
  const job = buildJob(project, shop);
  return { lists: buildLists(job, project, shop, L), job, project };
}
const item = (lists: ReturnType<typeof listsFor>['lists'], text: string) => lists.hardware.find((h) => h.item.includes(text));

describe('face frame cabinet, Kreg jig', () => {
  const { lists, job } = listsFor('faceFrame');

  it('labels every part by group, the case first and the fronts last', () => {
    expect(lists.parts).toHaveLength(job.parts.length + job.cabinetParts.length);
    expect(lists.parts.map((p) => p.label)).toEqual([
      ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
      ...['F1', 'F2', 'F3', 'F4', 'F5'],
      ...['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
      ...['DR1', 'DR2', 'DF1'],
    ]);
    const side = lists.parts[0]!;
    expect(side).toMatchObject({ name: 'Left side', material: '3/4" Plywood', grain: 'height', cutOut: 'cnc', blank: 2 });
    expect(lists.parts.find((p) => p.label === 'F3')).toMatchObject({ name: 'Top rail', cutOut: 'tableSaw' });
    expect(lists.parts.find((p) => p.label === 'F3')!.blank).toBeUndefined();
  });

  it('groups the saw-cut parts by material, alike parts on one row, the length along the grain', () => {
    expect(lists.cutList.map((g) => [g.material, L(g.thickness), g.board])).toEqual([
      ['3/4" Plywood', '23/32"', false],
      ['1/4" Plywood', '7/32"', false],
      ['3/4" Solid wood', '3/4"', true],
    ]);
    const ply = lists.cutList[0]!.rows.map((r) => [r.quantity, L(r.length), L(r.width), r.labels.join(' ')]);
    expect(ply).toEqual([
      [1, '22-9/16"', '22-9/32"', 'C3'],
      [1, '22-9/16"', '5-9/32"', 'C7'],
      [2, '22-9/16"', '4"', 'C4 C5'],
      [1, '22-7/16"', '22-1/32"', 'C8'],
    ]);
    // The back's grain runs up its height, so its length is the taller side.
    expect(lists.cutList[1]!.rows[0]).toMatchObject({ labels: ['C6'], length: expect.closeTo(29.21875 * inch, 1), grain: true });
    const boards = lists.cutList[2]!.rows;
    expect(boards.map((r) => [r.quantity, L(r.length), L(r.width)])).toEqual([
      [2, '30"', '1-1/2"'],
      [2, '21-1/4"', '2"'],
      [3, '21"', '1-1/2"'],
    ]);
    expect(boards.every((r) => r.steps.join() === 'Cut to length, miter saw')).toBe(true);
    // Every saw-cut part is on the cut list once, and no CNC part is.
    const listed = lists.cutList.flatMap((g) => g.rows.flatMap((r) => r.labels)).sort();
    expect(listed).toEqual(lists.parts.filter((p) => p.cutOut !== 'cnc').map((p) => p.label).sort());
  });

  it('gives each row of Kreg holes its face, edge, positions and what they are measured from', () => {
    expect(lists.kreg.reduce((n, k) => n + k.at.length, 0)).toBe(job.plan.pocketHoles!.count);
    const row = (label: string, edge: string) => lists.kreg.find((k) => k.label === label && k.edge === edge)!;
    expect(row('C1', 'front edge')).toMatchObject({ part: 'Left side', face: 'Inside', into: 'Left stile', from: 'bottom edge', screw: '1-1/4"' });
    expect(row('C3', 'front edge')).toMatchObject({ face: 'Underside', into: 'Bottom rail', from: 'left edge' });
    expect(row('C3', 'left edge')).toMatchObject({ into: 'Left side', from: 'front edge' });
    expect(row('C3', 'left edge').at.map(L)).toEqual(['4"', '9-7/16"', '14-27/32"', '20-9/32"']);
    expect(row('C5', 'right edge')).toMatchObject({ part: 'Back stretcher', face: 'Back', into: 'Right side', from: 'bottom edge' });
    expect(row('F4', 'left edge')).toMatchObject({ face: 'Back', into: 'Left stile' });
  });

  it('counts the hardware', () => {
    expect(item(lists, 'Blum Compact')).toMatchObject({ group: 'Doors', quantity: 4 });
    expect(item(lists, 'mounting plates')).toBeUndefined();
    expect(item(lists, 'shelf pin')).toMatchObject({ quantity: 4 });
    expect(item(lists, 'slide')).toMatchObject({ group: 'Drawer', quantity: 1, unit: 'pair' });
    expect(item(lists, 'slide')!.item).toContain('22"');
    expect(item(lists, 'slide')!.note).toContain('build-out strips');
    expect(item(lists, 'wood screws')).toMatchObject({ item: '#8 × 1-1/4" wood screws', quantity: 6 });
    // A front screw near the recessed panel must stop short of its face: 15/32" box front + (19 mm - recess).
    expect(item(lists, 'washer-head')).toMatchObject({ item: '#8 × 3/4" washer-head screws', quantity: 4 });
    expect(item(lists, 'pocket screws')).toMatchObject({ item: '1-1/4" pocket screws, coarse thread', quantity: 44 });
    expect(item(lists, 'pocket screws')!.note).toContain('Fine thread where they go into hardwood');
    expect(lists.hardware.filter((h) => h.group === 'Pocket-hole prep')).toEqual([]);
  });

  it('lists brads or staples for a back in a rabbet, uncounted and without glue', () => {
    const back = item(lists, 'brads or staples')!;
    expect(back.quantity).toBeUndefined();
    expect(back.note).toContain('rabbets');
    expect(back.note).toContain('No glue');
    expect(item(listsFor('faceFrame', (c) => (c.joinery.back = 'applied')).lists, 'brads or staples')!.note).toContain('rear edges of the sides');
    expect(item(listsFor('faceFrame', (c) => (c.joinery.back = 'groove')).lists, 'brads or staples')).toBeUndefined();
  });

  it('prints six thin shims for the two strips', () => {
    expect(lists.shims).toMatchObject({ quantity: 6, length: 1.5 * inch, height: 2 * inch });
    expect(L(lists.shims!.thickness)).toBe('1/32"');
    expect(item(lists, 'Slide shims')).toMatchObject({ group: '3D prints', quantity: 6 });
    const [object] = buildSlideShimObjects(lists.shims!);
    expect(object!.placements).toHaveLength(6);
    expect(object!.mesh.triangles).toHaveLength(36);
    expect(object!.mesh.volume).toBeCloseTo(1.5 * inch * 2 * inch * lists.shims!.thickness, 3);
    // No two pads overlap on the bed.
    const spots = new Set(object!.placements.map((p) => `${p.x}/${p.y}`));
    expect(spots.size).toBe(6);
    expect([...buildSlideShims3mf(lists.shims!).subarray(0, 2)]).toEqual([80, 75]);
  });

  it('writes one page with every list, safe to print', () => {
    const html = listsHtml('Base cabinet <test>', lists, L);
    expect(listsFileName('base-cabinet')).toBe('base-cabinet-lists.html');
    expect(html).toContain('<h1>Base cabinet &lt;test&gt;</h1>');
    for (const heading of ['Cut list: parts cut on a saw', 'Parts', 'Pocket holes with the Kreg jig', 'Hardware']) expect(html).toContain(`<h2>${heading}</h2>`);
    expect(html).toContain('<td><b>C1</b></td><td class="w">Left side</td><td>22-1/2&quot; × 34-1/2&quot;</td><td>3/4&quot; Plywood</td><td>along the 34-1/2&quot;</td><td>CNC, blank 2</td>');
    expect(html).toContain('<td class="w">Cut to length, miter saw; 4 pocket holes, Kreg jig</td>');
    expect((html.match(/class="box"/g) ?? []).length).toBeGreaterThan(lists.parts.length);
    expect(html).not.toContain('undefined');
  });
});

describe('other choices', () => {
  it('rear brackets: a pair of brackets, no strips, strip screws or shims', () => {
    const { lists } = listsFor('faceFrame', (_c, p) => (drawerOf(p).slide.faceFrameMount = 'rearBrackets'));
    expect(item(lists, 'Rear mounting brackets')).toMatchObject({ quantity: 1, unit: 'pair' });
    expect(item(lists, 'Rear mounting brackets')!.note).toContain('back stretcher');
    expect(item(lists, 'wood screws')).toBeUndefined();
    expect(lists.shims).toBeUndefined();
    expect(lists.parts.some((p) => p.name.startsWith('Build-out'))).toBe(false);
  });

  it('a pocket-screwed drawer box takes 1" screws, by Kreg jig set to the box stock', () => {
    const { lists } = listsFor('faceFrame', (_c, p) => (drawerOf(p).box.cornerJoint = 'pocketScrews'));
    expect(item(lists, '1" pocket screws')).toMatchObject({ quantity: 8 });
    expect(item(lists, '1" pocket screws')!.note).toBe('Box front 4, Box back 4.');
    const row = lists.kreg.find((k) => k.label === 'D3' && k.edge === 'left edge')!;
    expect(row).toMatchObject({ face: 'Outside', into: 'Box side, left', from: 'bottom edge', screw: '1"' });
    expect(L(row.thickness)).toBe('15/32"');
  });

  it('dados are glued: no pocket screws and no Kreg rows for the case', () => {
    const { lists } = listsFor('frameless', (c) => (c.joinery.case = 'dado'));
    expect(lists.kreg).toEqual([]);
    expect(lists.hardware.filter((h) => h.group === 'Pocket screws')).toEqual([]);
  });

  it('frameless: plates and their screws, slides on the case sides, no shims', () => {
    const { lists } = listsFor('frameless');
    expect(item(lists, 'frameless clip hinge')).toMatchObject({ quantity: 4 });
    expect(item(lists, 'Hinge mounting plates')).toMatchObject({ quantity: 4 });
    expect(item(lists, 'Mounting plate screws')).toMatchObject({ quantity: 8 });
    expect(item(lists, 'slide')!.note).toContain('On the case sides');
    expect(item(lists, 'pocket screws')).toMatchObject({ item: '1-1/4" pocket screws, coarse thread', quantity: 16 });
    expect(lists.shims).toBeUndefined();
    expect(lists.cutList.map((g) => g.material)).toEqual(['3/4" Plywood', '1/4" Plywood']);
  });

  it('edge banding on: its run is listed', () => {
    const { lists } = listsFor('frameless', (c) => (c.frameless.edgeBanding = true));
    expect(item(lists, 'Edge banding')).toBeDefined();
    expect(item(listsFor('frameless').lists, 'Edge banding')).toBeUndefined();
  });

  it('CNC-assisted: only the saw-cut parts keep Kreg rows, and the guide and its bearings are listed', () => {
    const { lists, job } = listsFor('faceFrame', (_c, p) => (p.plan.pocketHoles = 'cncAssisted'));
    const pockets = job.plan.pocketHoles!;
    expect(lists.kreg.reduce((n, k) => n + k.at.length, 0)).toBe(pockets.count - pockets.cncAssisted);
    expect(new Set(lists.kreg.map((k) => k.label))).toEqual(new Set(['F3', 'F4', 'F5']));
    expect(lists.hardware.filter((h) => h.group === 'Pocket-hole prep').map((h) => [h.quantity, h.item])).toEqual([
      [1, 'Printed drill guide'],
      [1, 'Metal sleeve, 4.1 × 7 × 20 mm'],
      [1, '4 mm or 5/32" drill bit'],
    ]);
    // The CNC pocket seats the screw nearer the edge than a Kreg jig, so the case screws drop to 1".
    expect(item(lists, '1" pocket screws')).toMatchObject({ quantity: pockets.cncAssisted });
    expect(item(lists, '1" pocket screws')!.note).toContain('Shorter than the Kreg chart');
    expect(item(lists, '1-1/4" pocket screws')).toMatchObject({ quantity: 12 });
    // With the bottom and stretchers on the CNC the cut list is shorter.
    expect(lists.cutList[0]!.rows.flatMap((r) => r.names)).toEqual(['Toe kick', 'Shelf']);
  });
});

describe('the pocket screw rule', () => {
  it('follows the Kreg chart by the drilled part', () => {
    expect(pocketScrewLength(0.75 * inch, KREG_SEAT, undefined)).toEqual({ length: 1.25 * inch, shortened: false });
    expect(pocketScrewLength((23 / 32) * inch, KREG_SEAT, undefined).length).toBeCloseTo(1.25 * inch);
    expect(pocketScrewLength(0.5 * inch, KREG_SEAT, undefined).length).toBeCloseTo(inch);
    expect(pocketScrewLength(1.5 * inch, KREG_SEAT, undefined).length).toBeCloseTo(2.5 * inch);
  });

  it('drops to a shorter screw when the tip would come too near the far face', () => {
    expect(pocketScrewLength(0.75 * inch, KREG_SEAT, 0.75 * inch)).toEqual({ length: 1.25 * inch, shortened: false });
    expect(pocketScrewLength(0.75 * inch, KREG_SEAT, 0.5 * inch)).toEqual({ length: inch, shortened: true });
    expect(pocketScrewLength(0.5 * inch, 0.375 * inch, 0.5 * inch)).toEqual({ length: 0.75 * inch, shortened: true });
    // Never shorter than the shortest screw there is.
    expect(pocketScrewLength(0.5 * inch, 0, 2).length).toBeCloseTo(0.75 * inch);
  });
});

describe('the vanity job', () => {
  const shop = createStarterShop();
  const project = createVanityProject();
  const lists = buildLists(buildJob(project, shop), project, shop, L);

  it('has two doors, their hinges and the install kit, and nothing for a saw', () => {
    expect(lists.parts.map((p) => [p.label, p.name, p.cutOut, p.blank])).toEqual([
      ['DR1', 'Left door', 'cnc', 1],
      ['DR2', 'Right door', 'cnc', 1],
    ]);
    expect(lists.cutList).toEqual([]);
    expect(lists.kreg).toEqual([]);
    expect(lists.hardware.map((h) => h.group)).toEqual(['Doors', '3D prints', '3D prints']);
    expect(lists.hardware[0]!.quantity).toBe(4);
  });
});
