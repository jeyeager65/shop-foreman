// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, designsOf, isDoorSet, setOwnFrontSettings, setOwnSettings } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklistSections } from '@/job/checklist';
import { SHELF_PIN_1_4_ID } from '@/libraries';
import type { Project } from '@/model';
import { activeMachine } from '@/plan';
import { addCabinet, copyCabinet, createBaseCabinetProject, createShopCabinetProject, createShopWallProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/**
 * Milestone 4: the Plan has one row per kind of work for the whole job,
 * whatever cabinet or front the parts belong to.
 */
const shop = lowRiderJobShop();
const rows = (project: Project) => buildJob(project, shop).plan.operations;

describe('job-wide Plan rows', () => {
  it('the shop wall has one row per kind of work, with the cabinets it covers', () => {
    const ops = rows(createShopWallProject());
    expect(ops.map((o) => [o.key, o.label, o.covers?.join('')])).toEqual([
      ['doors:hingeCup', 'Doors: hinge cups', 'B'],
      ['doors:cutout', 'Doors: cutout', 'B'],
      ['case:holes:shelf-pin@5', 'Case: shelf-pin holes', 'B'],
      ['case:holes:hinge-plate@5', 'Case: hinge plate holes', 'B'],
      ['case:holes:case-screw@4.76', 'Case: case screw holes', 'ABC'],
      ['case:cutout', 'Case: cutout', 'ABC'],
      ['boxes:groove', 'Drawer boxes: bottom groove', 'ABC'],
      ['boxes:dado', 'Drawer boxes: dados', 'ABC'],
      ['boxes:rabbet', 'Drawer boxes: corner rabbets', 'ABC'],
      ['boxes:cutout', 'Drawer boxes: cutout', 'ABC'],
      ['job:install', 'Hang doors', undefined],
    ]);
    // The case screw row has the holes of all six sides.
    const screws = ops.find((o) => o.key === 'case:holes:case-screw@4.76')!;
    expect(screws.source.kind === 'features' && new Set(screws.source.refs.map((r) => r.partId)).size).toBe(6);
  });

  it('one cabinet has the same rows under the same labels as before, without a list of cabinets', () => {
    expect(rows(createShopCabinetProject()).map((o) => o.label)).toEqual([
      'Doors: hinge cups',
      'Doors: cutout',
      'Case: shelf-pin holes',
      'Case: hinge plate holes',
      'Case: case screw holes',
      'Case: cutout',
      'Drawer box: bottom groove',
      'Drawer box: dados',
      'Drawer box: corner rabbets',
      'Drawer box: cutout',
      'Hang doors',
    ]);
    expect(rows(createShopCabinetProject()).every((o) => o.covers === undefined)).toBe(true);
    expect(rows(createVanityProject()).map((o) => o.key)).toEqual(['doors:hingeCup', 'doors:pocketClear', 'doors:vBevel@60', 'doors:edgeProfile@roundover-3.17', 'doors:cutout', 'job:pinHole', 'job:install']);
  });

  it('several drawers are one set of rows: the fronts together, the boxes together', () => {
    const labels = rows(createBaseCabinetProject('frameless', 'drawers', 3)).map((o) => o.label);
    expect(labels.filter((l) => l.startsWith('Drawer'))).toEqual([
      'Drawer fronts: panel pocket',
      'Drawer fronts: inside bevel',
      'Drawer fronts: outside edges',
      'Drawer fronts: cutout',
      'Drawer boxes: front screw holes',
      'Drawer boxes: bottom groove',
      'Drawer boxes: corner rabbets',
      'Drawer boxes: cutout',
    ]);
  });

  it('a choice made on a row applies to every cabinet it covers', () => {
    const project = createShopWallProject();
    project.plan.operations['boxes:groove'] = { clearToolId: 'endmill-1-16' };
    const job = buildJob(project, shop);
    expect(job.plan.operations.find((o) => o.key === 'boxes:groove')!.clearToolId).toBe('endmill-1-16');
    // Every blank with a drawer box part on it cuts its groove with that bit.
    const grooved = job.programs.filter((p) => p.setup.operationKeys.includes('boxes:groove'));
    expect(grooved.length).toBeGreaterThan(3);
    expect(grooved.every((p) => p.toolIds.includes('endmill-1-16'))).toBe(true);
  });
});

describe('work that needs another bit gets a row of its own', () => {
  it('holes of another size: a second cabinet on 1/4" shelf pins', () => {
    const project = createBaseCabinetProject('frameless');
    copyCabinet(project, 'cabinet-1');
    setOwnSettings(project, 'cabinet-2', 'caseAndJoinery', true);
    cabinetsOf(project)[1]!.shelfPinId = SHELF_PIN_1_4_ID;
    const pins = rows(project).filter((o) => o.key.startsWith('case:holes:shelf-pin'));
    expect(pins.map((o) => [o.key, o.label, o.covers?.join(''), o.clearToolId])).toEqual([
      ['case:holes:shelf-pin@5', 'Case: shelf-pin holes, 5 mm', 'A', 'endmill-1-8'],
      ['case:holes:shelf-pin@6.35', 'Case: shelf-pin holes, 6.35 mm', 'B', 'endmill-1-4'],
    ]);
    // A choice for one size leaves the other alone; one without a size is for both.
    project.plan.operations['case:holes:shelf-pin@6.35'] = { clearToolId: 'endmill-1-8' };
    expect(rows(project).filter((o) => o.key.startsWith('case:holes:shelf-pin')).map((o) => o.clearToolId)).toEqual(['endmill-1-8', 'endmill-1-8']);
    project.plan.operations = { 'case:holes:shelf-pin': { clearToolId: 'endmill-1-16' } };
    expect(rows(project).filter((o) => o.key.startsWith('case:holes:shelf-pin')).map((o) => o.clearToolId)).toEqual(['endmill-1-16', 'endmill-1-16']);
  });

  it('another door style: slab doors with a chamfer beside shaker doors with a roundover', () => {
    const project = createBaseCabinetProject('faceFrame', 'doors');
    addCabinet(project, { name: 'Slab', width: len('18"'), layout: 'doors' });
    setOwnFrontSettings(project, 'doors-2', true);
    const slab = designsOf(project).filter(isDoorSet)[1]!;
    slab.style = { kind: 'slab' };
    slab.outsideEdge = { kind: 'chamfer', size: len('1/16"') };
    const ops = rows(project).filter((o) => o.key.startsWith('doors:'));
    expect(ops.map((o) => [o.key, o.label, o.covers?.join('')])).toEqual([
      ['doors:hingeCup', 'Doors: hinge cups', 'AB'],
      ['doors:pocketClear', 'Doors: panel pocket', 'A'],
      ['doors:vBevel@60', 'Doors: inside bevel', 'A'],
      ['doors:edgeProfile@roundover-3.17', 'Doors: outside edges, 3.17 mm roundover', 'A'],
      ['doors:edgeProfile@chamfer-1.59', 'Doors: outside edges, 1.59 mm chamfer', 'B'],
      ['doors:cutout', 'Doors: cutout', 'AB'],
    ]);
    // Each edge row offers the bits that can cut its own profile.
    const edge = (key: string) => ops.find((o) => o.key === key)!.options.clearToolIds;
    expect(edge('doors:edgeProfile@chamfer-1.59')).toEqual(['vbit-90']);
    expect(edge('doors:edgeProfile@roundover-3.17')).not.toContain('vbit-90');
  });

  it('the checklist still finds the steps a cabinet\'s parts call for', () => {
    const project = createShopWallProject();
    const job = buildJob(project, shop);
    const sections = buildChecklistSections(project, job.plan, job.programs, shop.tools, activeMachine(shop));
    expect(sections.find((s) => s.title === 'A · Drawers, left')!.steps.map((s) => s.text.slice(0, 22))).toEqual(['Countersink the case s', 'Assemble the case: sta', 'Fasten the back over t', 'Glue the drawer box si', 'Fit the slides: their ', 'Seal and paint.']);
  });
});
