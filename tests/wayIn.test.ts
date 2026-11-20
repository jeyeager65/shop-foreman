// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, createObstacle, createUnderSink, type SinkStorage, deriveWayIn, tiltToPass } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { createStarterShop } from '@/libraries';
import type { CasesContext, StoredCabinet } from '@/model';
import { createBaseCabinetProject, makeExisting } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength, len } from '@/units';

/** Through the opening: what is made for the inside goes in through the door opening, round what is in the way. */
const shop = createStarterShop();
const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const vanity = (storage: SinkStorage, construction: 'faceFrame' | 'frameless', existing: boolean, change?: (c: StoredCabinet) => void) => {
  const project = createBaseCabinetProject(construction, 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.size.width = len('30"');
  stored.adjustableShelves = 0;
  stored.inside = createUnderSink(storage);
  if (existing) makeExisting(project, stored.id);
  change?.(stored);
  return project;
};
const ways = (project: ReturnType<typeof vanity>) => deriveWayIn(cabinetsOf(project)[0]!, shop.materials, shop.hardware, L);
const way = (project: ReturnType<typeof vanity>, what: string) => {
  const found = ways(project).find((w) => w.what === what);
  if (!found) throw new Error(`Nothing called ${what}: ${ways(project).map((w) => w.what).join('; ')}`);
  return found;
};

describe('through the opening', () => {
  it('a board passes flat when it is no wider than the opening, tilted when it is a little wider, and not at all when the opening is too low for the tilt', () => {
    expect(tiltToPass(600, 19, 610, 600)).toBe(0);
    const tilt = tiltToPass(720, 19, 690, 600)!;
    expect(tilt).toBeGreaterThan(10);
    expect(tilt).toBeLessThan(25);
    expect(720 * Math.cos((tilt * Math.PI) / 180) + 19 * Math.sin((tilt * Math.PI) / 180)).toBeLessThanOrEqual(690);
    expect(tiltToPass(720, 19, 690, 100)).toBeUndefined();
  });

  it('nothing is said of a cabinet with nothing inside it', () => {
    expect(ways(vanity({}, 'faceFrame', true))).toEqual([]);
  });

  it('trays and the frame go in assembled; the frame is slid back on the floor', () => {
    const project = vanity({ bottomTray: true, upper: 'tray' }, 'faceFrame', true);
    expect(ways(project).map((w) => [w.what, w.how])).toEqual([
      ['Bottom tray', 'assembled'],
      ['Upper tray', 'assembled'],
      ['The tray frame', 'assembled'],
    ]);
    expect(way(project, 'The tray frame').words).toMatch(/goes in assembled, .* wide × .* high through the door opening \(.*\), and is slid back/);
  });

  it('a block in the path of the tie: the frame goes in without it', () => {
    // A disposal well forward of the trap, hanging low: the tie cannot pass under it on the way to the back.
    const project = vanity({ bottomTray: true, upper: 'tray' }, 'faceFrame', true, (c) => {
      c.inside!.obstacles[0]!.clearUnder = len('12"');
      c.inside!.obstacles.push({ ...createObstacle('disposal', c.inside!.obstacles), fromBack: len('15"'), depth: len('3"'), width: len('3"'), clearUnder: len('7"'), height: len('2"') });
    });
    const frame = way(project, 'The tray frame');
    expect(frame.how).toBe('inside');
    expect(frame.words).toMatch(/without its tie \(the disposal is in the tie's way\).*Screw the tie on once the frame is in its place/);
  });

  it('in a cabinet made here nothing is in the way yet', () => {
    const project = vanity({ bottomTray: true, upper: 'tray', mounting: 'frame' }, 'faceFrame', false, (c) => {
      c.inside!.obstacles.push({ ...createObstacle('disposal', c.inside!.obstacles), fromBack: len('15"'), depth: len('3"'), width: len('3"'), clearUnder: len('7"'), height: len('2"') });
    });
    expect(way(project, 'The tray frame').how).toBe('assembled');
  });

  it('a shelf goes in flat in a frameless cabinet and tilted behind a face frame, then back round the trap', () => {
    const low = (c: StoredCabinet) => (c.inside!.obstacles[0]!.clearUnder = len('6"'));
    const flat = way(vanity({ upper: 'shelf' }, 'frameless', true, low), 'The shelf');
    expect(flat.how).toBe('flat');
    expect(flat.words).toMatch(/goes in flat.*slide it back round the trap/);
    const tilted = way(vanity({ upper: 'shelf' }, 'faceFrame', true, low), 'The shelf');
    expect(tilted.how).toBe('tilted');
    expect(tilted.words).toMatch(/Tilt it \d+°, one end low, to pass it in, level it inside, and slide it back round the trap/);
    // Made here, the trap is not there yet.
    expect(way(vanity({ upper: 'shelf' }, 'faceFrame', false, low), 'The shelf').words).not.toMatch(/round the trap/);
  });

  it('a shelf that must be tilted too far for its notch to go round the trap is said not to go in in one piece', () => {
    // Wide stiles: the inside is far wider than the door opening.
    const project = vanity({ upper: 'shelf' }, 'faceFrame', true, (c) => {
      c.inside!.obstacles[0]!.clearUnder = len('6"');
      c.existing!.opening.width = len('22"');
    });
    const shelf = way(project, 'The shelf');
    expect(shelf.how).toBe('no');
    expect(shelf.words).toMatch(/does not go in in one piece.*its notch does not go round the trap.*Cut it in two/);
  });

  it("Build's checklist says how each goes in, and no longer speaks of setting a cabinet that is already there", () => {
    const project = vanity({ bottomTray: true, upper: 'shelf', mounting: 'strips' }, 'faceFrame', true, (c) => (c.inside!.obstacles[0]!.clearUnder = len('6"')));
    const job = buildJob(project, shop);
    const text = buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware).join(' ');
    expect(text).toContain('Through the door opening. Bottom tray: goes in assembled');
    expect(text).toContain('Through the door opening. The shelf: is');
    expect(text).toContain("build-out strips to the cabinet's sides");
    expect(text).not.toContain('before the cabinet is set');
  });
});
