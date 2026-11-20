// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PULLOUT_SETBACK, RACK_CLEAR, RACK_HEIGHT, RACK_HINGE_INSET, cabinetsOf, createDoorRacks, createUnderSink, deriveCabinetOpenings, deriveCabinetParts, deriveUnderSink, partBox } from '@/design';
import { batchKindOf } from '@/job/batch';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CasesContext, DoorRacks, Part, StoredCabinet } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { len } from '@/units';

/** Organizers: racks on the inside of the doors, and what is behind them made to clear. */
const shop = createStarterShop();
const cabinet = (racks: Partial<DoorRacks> | undefined, construction: 'faceFrame' | 'frameless' = 'faceFrame', change?: (c: StoredCabinet) => void) => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('30"');
  stored.adjustableShelves = 0;
  stored.inside = { ...createUnderSink({ bottomTray: true }), obstacles: [], ...(racks ? { doorRacks: { ...createDoorRacks(), ...racks } } : {}) };
  change?.(stored);
  return project;
};
const built = (project: ReturnType<typeof cabinet>) => deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
const racksOf = (parts: Part[]) => parts.filter((p) => p.id.includes('/sink-rack-'));
const box = (parts: Part[]) => {
  const boxes = parts.map(partBox);
  return { min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))), max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!))) };
};

describe('door racks', () => {
  it('a cabinet has none until it is asked; then one on each door of a pair, five parts each', () => {
    expect(built(cabinet(undefined)).doorRacks).toBeUndefined();
    const build = built(cabinet({}));
    expect(build.doorRacks!.racks.map((r) => r.name)).toEqual(['Left door rack', 'Right door rack']);
    const parts = racksOf(build.parts);
    expect(parts.map((p) => p.name).filter((n) => n.startsWith('Left'))).toEqual(['Left door rack, bottom', 'Left door rack, left end', 'Left door rack, right end', 'Left door rack, back', 'Left door rack, rail']);
    expect(parts).toHaveLength(10);
    expect(parts.every((p) => batchKindOf(p) === 'inside')).toBe(true);
  });

  for (const construction of ['faceFrame', 'frameless'] as const) {
    it(`${construction}: each stands on the back of its shut door, inside its half of the opening, clear of the hinges and of the other door's`, () => {
      const project = cabinet({}, construction);
      const build = built(project);
      const opening = deriveCabinetOpenings(cabinetsOf(project)[0]!, shop.materials).at(-1)!;
      const parts = racksOf(build.parts);
      const left = box(parts.filter((p) => p.name.startsWith('Left')));
      const right = box(parts.filter((p) => p.name.startsWith('Right')));
      const middle = opening.origin.x + opening.width / 2;
      expect(left.min[0]! - opening.origin.x).toBeCloseTo(RACK_HINGE_INSET, 6);
      expect(opening.origin.x + opening.width - right.max[0]!).toBeCloseTo(RACK_HINGE_INSET, 6);
      expect(left.max[0]!).toBeLessThan(middle - RACK_CLEAR + 1e-6);
      expect(right.min[0]!).toBeGreaterThan(middle + RACK_CLEAR - 1e-6);
      // As deep as asked, and as high as a rack is; the far corner swings out inside its half.
      const depth = len('3.5"').mm;
      expect(left.max[2]! - left.min[2]!).toBeCloseTo(depth, 6);
      expect(left.max[1]! - left.min[1]!).toBeCloseTo(RACK_HEIGHT, 6);
      const reach = Math.hypot(left.max[0]! - opening.origin.x, depth);
      expect(reach).toBeLessThanOrEqual(opening.width / 2 + 1e-6);
      // Inside the door opening's height.
      expect(left.min[1]!).toBeGreaterThan(opening.origin.y);
      expect(left.max[1]!).toBeLessThan(opening.origin.y + opening.height);
      // No two parts of a rack in one place.
      for (const a of parts) for (const b of parts) {
        if (a === b) continue;
        const [x, y] = [partBox(a), partBox(b)];
        const lap = Math.min(...[0, 1, 2].map((k) => Math.min(x.max[k]!, y.max[k]!) - Math.max(x.min[k]!, y.min[k]!)));
        expect(lap, `${a.name} and ${b.name}`).toBeLessThanOrEqual(0.01);
      }
    });
  }

  it('the tray behind them starts further back, and is shorter for it when it must be', () => {
    const without = built(cabinet(undefined));
    const withRacks = built(cabinet({ depth: len('5"') }));
    const front = (b: typeof without) => Math.max(...b.parts.filter((p) => p.name.startsWith('Bottom tray')).map((p) => partBox(p).max[2]!));
    expect(front(without)).toBeCloseTo(-PULLOUT_SETBACK, 6);
    expect(front(withRacks)).toBeCloseTo(-withRacks.doorRacks!.reach, 6);
    expect(withRacks.doorRacks!.reach).toBeGreaterThan(len('4"').mm);
    expect(withRacks.trays[0]!.length).toBeLessThan(without.trays[0]!.length);
    // Nothing of the tray is where a rack is.
    const rackBack = Math.min(...racksOf(withRacks.parts).map((p) => partBox(p).min[2]!));
    expect(front(withRacks)).toBeLessThanOrEqual(rackBack - RACK_CLEAR + 1e-6);
  });

  it('several racks are spread up the door; one door takes a wider rack on the side it is hinged', () => {
    const three = built(cabinet({ count: 3 }));
    expect(three.doorRacks!.racks.map((r) => r.name)).toEqual(['Left door rack 1', 'Left door rack 2', 'Left door rack 3', 'Right door rack 1', 'Right door rack 2', 'Right door rack 3']);
    const ys = [1, 2, 3].map((n) => partBox(three.parts.find((p) => p.name === `Left door rack ${n}, bottom`)!).min[1]!);
    expect(ys[1]! - ys[0]!).toBeCloseTo(ys[2]! - ys[1]!, 6);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(RACK_HEIGHT);
    const one = built(cabinet({ doors: 'right' }));
    expect(one.doorRacks!.racks.map((r) => r.name)).toEqual(['Right door rack']);
    expect(one.doorRacks!.racks[0]!.width).toBeGreaterThan(built(cabinet({})).doorRacks!.racks[0]!.width * 1.8);
  });

  it('says what the doors are asked to carry, and when it is too much for two hinges', () => {
    const light = built(cabinet({})).doorRacks!.weight;
    expect(light.heavy).toBe(false);
    expect(light.words).toMatch(/Each door carries a rack: about \d+ lb of wood, and about \d+ lb when it is full\. Two cup hinges carry about \d+ lb besides the door/);
    const heavy = built(cabinet({ count: 3, doors: 'left', depth: len('5"') })).doorRacks!.weight;
    expect(heavy.heavy).toBe(true);
    expect(heavy.words).toMatch(/more than a door on two cup hinges carries.*fit a third hinge/);
  });

  it('says what cannot be made', () => {
    expect(() => deriveCabinetParts(cabinet({ depth: len('8"') }), shop)).toThrow(/between 2" and 6" deep/);
    expect(() => deriveCabinetParts(cabinet({}, 'faceFrame', (c) => (c.size.width = len('15"'))), shop)).toThrow(/no room for a door rack/);
    expect(() => deriveCabinetParts(cabinet({ count: 3 }, 'faceFrame', (c) => (c.size.height = len('20"'))), shop)).toThrow(/not tall enough for 3 racks/);
    // The trap of a sink comes forward to where the racks stand.
    const trap = cabinet({}, 'faceFrame', (c) => (c.inside!.obstacles = [{ id: 'trap-1', kind: 'trap', width: len('6"'), depth: len('20"'), clearUnder: len('12"') }]));
    expect(() => deriveCabinetParts(trap, shop)).toThrow(/The trap comes too far forward for racks on the doors/);
  });

  it('is cut with the job; its screws are on the hardware list and its steps in the checklist', () => {
    const project = cabinet({});
    const job = buildJob(project, shop);
    expect(racksOf(job.cabinetParts)).toHaveLength(10);
    const lists = buildLists(job, project, shop, (mm) => `${Math.round(mm)} mm`);
    expect(lists.hardware.find((h) => /Door racks/.test(h.note ?? ''))).toMatchObject({ quantity: 8 });
    expect(buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ')).toContain('The door racks: glue and brad each one');
  });
});
