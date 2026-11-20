import { describe, expect, it } from 'vitest';
import { cabinetsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import type { ConstructionStyle, PartPlan, Project, Shop } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { len } from '@/units';
import { lowRiderJobShop } from './lowRider';

/** The reference cabinet's part plans by part id, after optional changes to the project and the shop. */
function plansFor(style: ConstructionStyle, change?: (project: Project, shop: Shop) => void) {
  const shop = lowRiderJobShop();
  const project = createBaseCabinetProject(style);
  change?.(project, shop);
  const job = buildJob(project, shop);
  const byId = new Map(job.plan.parts.map((p) => [p.partId, p]));
  const get = (id: string): PartPlan => {
    const found = byId.get(id);
    if (!found) throw new Error(`No part plan: ${id}`);
    return found;
  };
  return { job, get };
}
const stepsOf = (p: PartPlan) => p.steps.map((s) => `${s.label}: ${s.by}`);

describe('the shop profile says which saws the shop has', () => {
  it('starts with a table saw of 30" rip, a circular saw and a miter saw', () => {
    const { saws } = lowRiderJobShop();
    expect(saws.tableSaw).toEqual({ owned: true, ripCapacity: len('30"') });
    expect(saws.circularSaw.owned).toBe(true);
    expect(saws.miterSaw.owned).toBe(true);
  });
});

describe('a cut-out method per part: the face frame reference cabinet', () => {
  const { job, get } = plansFor('faceFrame');

  it('plans every part of the job once: fronts, case, frame and drawer box', () => {
    const ids = [...job.parts, ...job.cabinetParts].map((p) => p.id);
    expect(job.plan.parts.map((p) => p.partId)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(23);
  });

  it('keeps the fronts on the CNC with nothing else offered', () => {
    for (const id of ['doors-1/door-left', 'doors-1/door-right', 'drawer-1/front']) {
      expect(get(id)).toMatchObject({ cutOut: 'cnc', options: ['cnc'], steps: [] });
    }
  });

  it('cuts out on the CNC what the CNC works on anyway: the sides and the box walls', () => {
    // No saw is offered for them: their dados, rabbets, grooves and holes are cut in the blank.
    for (const id of ['cabinet-1/side-left', 'cabinet-1/side-right', 'drawer-1/box-side-left', 'drawer-1/box-front', 'drawer-1/box-back']) {
      expect(get(id)).toMatchObject({ cutOut: 'cnc', suggested: 'cnc', options: ['cnc'] });
    }
    expect(get('cabinet-1/side-left').reason).toBe('The CNC cuts the toe-kick notch, a rabbet and holes, so it cuts the part out too.');
    expect(get('drawer-1/box-side-left').reason).toBe('The CNC cuts rabbets and a groove, so it cuts the part out too.');
  });

  it('sends plain rectangles to the table saw', () => {
    for (const id of ['cabinet-1/bottom', 'cabinet-1/stretcher-front', 'cabinet-1/stretcher-back', 'cabinet-1/back', 'cabinet-1/toe-kick', 'cabinet-1/shelf-1', 'drawer-1/box-bottom']) {
      expect(get(id)).toMatchObject({ cutOut: 'tableSaw', suggested: 'tableSaw', reason: 'A plain rectangle: nothing for the CNC to do.' });
    }
  });

  it('rips solid wood on the table saw and cuts it to length on the miter saw, never on the CNC', () => {
    for (const id of ['cabinet-1/frame-stile-left', 'cabinet-1/frame-rail-top', 'cabinet-1/frame-rail-mid-1', 'drawer-1/strip-left']) {
      const p = get(id);
      expect(p).toMatchObject({ cutOut: 'tableSaw', options: ['tableSaw', 'circularSaw'] });
      expect(p.reason).toBe('Solid wood: ripped to width on the table saw and cut to length on the miter saw.');
      expect(p.steps[0]).toEqual({ label: 'Cut to length', by: 'miterSaw' });
    }
  });

  it('lists the rest of the work on each part', () => {
    expect(stepsOf(get('cabinet-1/side-left'))).toEqual(['1 rabbet: cnc', '20 shelf-pin holes: cnc', '4 pocket holes: kregJig']);
    expect(stepsOf(get('cabinet-1/bottom'))).toEqual(['12 pocket holes: kregJig']);
    expect(stepsOf(get('cabinet-1/frame-rail-top'))).toEqual(['Cut to length: miterSaw', '4 pocket holes: kregJig']);
    expect(stepsOf(get('drawer-1/box-front'))).toEqual(['1 groove: cnc', '4 front screw holes: cnc']);
    expect(stepsOf(get('drawer-1/box-side-left'))).toEqual(['2 rabbets: cnc', '1 groove: cnc']);
    expect(stepsOf(get('cabinet-1/shelf-1'))).toEqual([]);
  });

  it('makes the pocket holes with the Kreg jig unless told otherwise', () => {
    expect(job.plan.pocketHoles).toEqual({ method: 'kregJig', count: 44, cncAssisted: 0 });
  });

  it('changes no part, and the fronts are cut as before', () => {
    const before = buildJob(createBaseCabinetProject('faceFrame'), lowRiderJobShop());
    const { job: moved } = plansFor('faceFrame', (project) => {
      project.plan.parts = { 'cabinet-1/shelf-1': { cutOut: 'cnc' } };
      project.plan.pocketHoles = 'cncAssisted';
    });
    // More parts on the CNC means more blanks and files; the fronts' cuts are the same.
    expect(moved.plan.blanks.length).toBeGreaterThan(before.plan.blanks.length);
    const fronts = (programs: typeof moved.programs) => programs.filter((p) => p.blank.index === 1).map((p) => p.steps);
    expect(fronts(moved.programs)).toHaveLength(2);
    expect(fronts(moved.programs)).toEqual(fronts(before.programs));
    expect(moved.cabinetParts).toEqual(before.cabinetParts);
  });
});

describe('the frameless reference cabinet', () => {
  const { get, job } = plansFor('frameless');

  it('has no solid wood, and hinge plate holes in the sides', () => {
    expect(job.plan.parts).toHaveLength(16);
    expect(stepsOf(get('cabinet-1/side-left'))).toEqual(['1 rabbet: cnc', '22 shelf-pin holes: cnc', '4 hinge plate holes: cnc']);
    expect(job.plan.pocketHoles).toEqual({ method: 'kregJig', count: 16, cncAssisted: 0 });
  });

  it('names the dados of a dado-jointed case', () => {
    const { get: dado } = plansFor('frameless', (project) => {
      if (project.context.kind === 'designedCabinet') cabinetsOf(project)[0]!.joinery.case = 'dado';
    });
    expect(stepsOf(dado('cabinet-1/side-left'))).toEqual(['3 dados: cnc', '1 rabbet: cnc', '22 shelf-pin holes: cnc', '4 hinge plate holes: cnc']);
    expect(dado('cabinet-1/side-left').reason).toBe('The CNC cuts the toe-kick notch, dados, a rabbet and holes, so it cuts the part out too.');
    // Glued dados: no pocket holes left in the bottom, so it is a plain rectangle.
    expect(dado('cabinet-1/bottom')).toMatchObject({ cutOut: 'tableSaw', steps: [] });
  });
});

describe('the user changes a part', () => {
  it('uses the chosen method and remembers the suggestion', () => {
    const { get } = plansFor('faceFrame', (project) => {
      project.plan.parts = { 'cabinet-1/shelf-1': { cutOut: 'cnc' }, 'cabinet-1/back': { cutOut: 'circularSaw' } };
    });
    expect(get('cabinet-1/shelf-1')).toMatchObject({ cutOut: 'cnc', suggested: 'tableSaw' });
    expect(get('cabinet-1/back')).toMatchObject({ cutOut: 'circularSaw', suggested: 'tableSaw' });
  });

  it('keeps a part with CNC work on the CNC whatever was chosen', () => {
    const { get } = plansFor('faceFrame', (project) => {
      project.plan.parts = { 'cabinet-1/side-left': { cutOut: 'tableSaw' }, 'drawer-1/box-front': { cutOut: 'circularSaw' } };
    });
    expect(get('cabinet-1/side-left').cutOut).toBe('cnc');
    expect(get('drawer-1/box-front').cutOut).toBe('cnc');
  });

  it('gives a side with nothing but its notch the saws, and its notch by jig saw there', () => {
    // No shelves, an applied back, hidden sides: no holes, no rabbet, pocket holes only.
    const bare = (project: Project) => {
      if (project.context.kind !== 'designedCabinet') return;
      const cabinet = cabinetsOf(project)[0]!;
      cabinet.adjustableShelves = 0;
      cabinet.joinery.back = 'applied';
    };
    const { get: suggested } = plansFor('faceFrame', bare);
    expect(suggested('cabinet-1/side-left')).toMatchObject({ cutOut: 'cnc', options: ['cnc', 'tableSaw', 'circularSaw'] });
    expect(suggested('cabinet-1/side-left').reason).toBe('The CNC cuts the toe-kick notch anyway, so it cuts the part out too.');
    const { get } = plansFor('faceFrame', (project) => {
      bare(project);
      project.plan.parts = { 'cabinet-1/side-left': { cutOut: 'tableSaw' } };
    });
    expect(get('cabinet-1/side-left').cutOut).toBe('tableSaw');
    expect(stepsOf(get('cabinet-1/side-left'))).toEqual(['Toe-kick notch: jigSaw', '4 pocket holes: kregJig']);
  });

  it('ignores a choice the part cannot have', () => {
    const { get } = plansFor('faceFrame', (project) => {
      project.plan.parts = { 'cabinet-1/frame-stile-left': { cutOut: 'cnc' }, 'doors-1/door-left': { cutOut: 'tableSaw' } };
    });
    expect(get('cabinet-1/frame-stile-left').cutOut).toBe('tableSaw');
    expect(get('doors-1/door-left').cutOut).toBe('cnc');
  });
});

describe('CNC-assisted pocket holes', () => {
  const { get, job } = plansFor('faceFrame', (project) => {
    project.plan.pocketHoles = 'cncAssisted';
  });

  it('is one choice for the whole job, applied to the parts cut out on the CNC', () => {
    // 8 in the sides, 12 in the bottom, 8 and 4 in the stretchers; the 12 in the rails are Kreg.
    expect(job.plan.pocketHoles).toMatchObject({ method: 'cncAssisted', count: 44, cncAssisted: 32 });
  });

  it('brings a sheet part with pocket holes onto the CNC', () => {
    expect(get('cabinet-1/bottom')).toMatchObject({ cutOut: 'cnc', suggested: 'cnc' });
    expect(get('cabinet-1/bottom').reason).toBe('The CNC cuts CNC-assisted pocket holes anyway, so it cuts the part out too.');
    expect(stepsOf(get('cabinet-1/bottom'))).toEqual(['12 pocket holes: cnc', 'Drill 12 pilots from the edge with the guide: byHand']);
    // No pocket holes in the shelf: still the table saw.
    expect(get('cabinet-1/shelf-1').cutOut).toBe('tableSaw');
  });

  it('leaves the solid-wood rails on the saws, so their pocket holes are by Kreg jig', () => {
    expect(get('cabinet-1/frame-rail-top').cutOut).toBe('tableSaw');
    expect(stepsOf(get('cabinet-1/frame-rail-top'))).toEqual(['Cut to length: miterSaw', '4 pocket holes: kregJig']);
  });

  it('uses the Kreg jig on a sheet part the user moves to a saw', () => {
    const moved = plansFor('faceFrame', (project) => {
      project.plan.pocketHoles = 'cncAssisted';
      project.plan.parts = { 'cabinet-1/bottom': { cutOut: 'tableSaw' } };
    });
    expect(moved.get('cabinet-1/bottom')).toMatchObject({ cutOut: 'tableSaw', suggested: 'cnc' });
    expect(stepsOf(moved.get('cabinet-1/bottom'))).toEqual(['12 pocket holes: kregJig']);
    expect(moved.job.plan.pocketHoles).toMatchObject({ method: 'cncAssisted', count: 44, cncAssisted: 20 });
  });
});

describe('only saws the shop has, and only parts they can take', () => {
  it('uses the circular saw for a panel wider than the rip capacity both ways', () => {
    const { get } = plansFor('faceFrame', (_project, shop) => {
      shop.saws.tableSaw.ripCapacity = len('20"');
    });
    // The back is 23-5/16" x 29-7/32"; the toe kick is 5-9/32" wide.
    expect(get('cabinet-1/back')).toMatchObject({ cutOut: 'circularSaw', options: ['cnc', 'circularSaw'] });
    expect(get('cabinet-1/back').reason).toBe("A plain rectangle, wider than the table saw's rip capacity both ways.");
    expect(get('cabinet-1/toe-kick').cutOut).toBe('tableSaw');
  });

  it('uses the circular saw when there is no table saw', () => {
    const { get } = plansFor('faceFrame', (_project, shop) => {
      shop.saws.tableSaw.owned = false;
    });
    expect(get('cabinet-1/shelf-1')).toMatchObject({ cutOut: 'circularSaw', options: ['cnc', 'circularSaw'] });
    expect(get('cabinet-1/frame-stile-left')).toMatchObject({ cutOut: 'circularSaw', options: ['circularSaw'] });
    expect(get('cabinet-1/frame-stile-left').reason).toBe('Solid wood: ripped to width on the circular/track saw and cut to length on the miter saw.');
  });

  it('cuts solid wood to length on the same saw when there is no miter saw', () => {
    const { get } = plansFor('faceFrame', (_project, shop) => {
      shop.saws.miterSaw.owned = false;
    });
    expect(get('cabinet-1/frame-stile-left').reason).toBe('Solid wood: ripped to width and cut to length on the table saw.');
    expect(stepsOf(get('cabinet-1/frame-stile-left'))).toEqual([]);
  });

  it('cuts everything on the CNC in a shop with no saw', () => {
    const { job, get } = plansFor('faceFrame', (project, shop) => {
      shop.saws.tableSaw.owned = false;
      shop.saws.circularSaw.owned = false;
      // A saw chosen before the saws went.
      project.plan.parts = { 'cabinet-1/shelf-1': { cutOut: 'tableSaw' } };
    });
    expect(job.plan.parts.every((p) => p.cutOut === 'cnc' && p.options.length === 1)).toBe(true);
    expect(get('cabinet-1/frame-stile-left').reason).toBe('Solid wood, but the shop profile has no saw: cut out on the CNC.');
    expect(get('cabinet-1/shelf-1').reason).toBe('A plain rectangle, but the shop profile has no saw that takes it.');
  });
});

describe('other jobs', () => {
  it('plans a cabinet with no fronts', () => {
    const { job } = plansFor('frameless', (project) => {
      project.designObjects = [];
    });
    // The two sides are cut on the CNC: a file each.
    expect(job.files.map((f) => f.name)).toEqual(['base-cabinet-blank-1.gcode', 'base-cabinet-blank-2.gcode']);
    expect(job.plan.parts.map((p) => p.cutOut)).toEqual(['cnc', 'cnc', 'tableSaw', 'tableSaw', 'tableSaw', 'tableSaw', 'tableSaw', 'tableSaw']);
  });

  it('plans the vanity doors on the CNC, with no pocket holes', () => {
    const job = buildJob(createVanityProject(), lowRiderJobShop());
    expect(job.cabinetParts).toEqual([]);
    expect(job.plan.parts.map((p) => [p.cutOut, p.options])).toEqual([
      ['cnc', ['cnc']],
      ['cnc', ['cnc']],
    ]);
    expect(job.plan.pocketHoles).toBeUndefined();
  });
});
