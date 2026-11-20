// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveUnderSink, partBox, shopFor } from '@/design';
import { createStarterShopProfile } from '@/libraries';
import type { CasesContext, Organizer, Part } from '@/model';
import { createBaseCabinetProject, makeBlind, makeExisting } from '@/samples/cabinet';
import { len } from '@/units';

/**
 * Where a blind corner cabinet's blind trays stand: the first as low as possible, since it is reached only with
 * the tray in front of the doors pulled out; the second higher, so that it pulls out without that tray moving.
 */
const profile = createStarterShopProfile();
const build = (organizers: Organizer[]) => {
  const project = createBaseCabinetProject('frameless', 'doors');
  const stored = (project.context as CasesContext).pieces[0]!;
  stored.adjustableShelves = 0;
  stored.size.width = len('48"');
  stored.size.depth = len('24"');
  makeBlind(project, stored.id, 'left');
  if (stored.corner?.kind === 'blind') stored.corner.blind = len('24"');
  stored.inside = { obstacles: [], organizers };
  makeExisting(project, stored.id);
  const shop = shopFor(project, profile);
  return deriveUnderSink(cabinetsOf(project)[0]!, shop.materials, shop.hardware)!;
};
const boxOf = (parts: Part[]) => {
  const boxes = parts.map(partBox);
  return { min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))), max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!))) };
};
const tray = (b: ReturnType<typeof build>, test: RegExp) => boxOf(b.parts.filter((p) => test.test(p.id)));
const front: Organizer = { id: 'tray-bottom', kind: 'tray' };
const blind1: Organizer = { id: 'blind', kind: 'blindTray' };
const blind2: Organizer = { id: 'blind-2', kind: 'blindTray' };

describe('where the blind trays stand', () => {
  it('the first is as low as it can be: just over what stays in front of the door when its tray is out', () => {
    // Over a frame: just over its standards, inside the height of the tray in front of the door.
    const framed = build([front, blind1]);
    const standards = tray(framed, /\/sink-frame\/standard-/);
    const [f, b] = [tray(framed, /\/sink-tray-bottom\/tray-/), tray(framed, /\/sink-blind\/[^/]+$/)];
    expect(b.min[1]!).toBeGreaterThan(standards.max[1]!);
    expect(b.min[1]! - standards.max[1]!).toBeLessThan(25);
    expect(b.min[1]!).toBeLessThan(f.max[1]!);
    // Over bottom-mount slides: just off the floor.
    const slid = build([{ ...front, slides: 'bottom' }, blind1]);
    expect(tray(slid, /\/sink-blind\/[^/]+$/).min[1]!).toBeLessThan(b.min[1]! - 50);
    // With nothing in front of the door: on its own frame's rails.
    const alone = build([blind1]);
    expect(tray(alone, /\/sink-blind\/[^/]+$/).min[1]!).toBeLessThan(b.min[1]! - 50);
    const rails = tray(alone, /\/sink-blind-frame\/rail-/);
    expect(tray(alone, /\/sink-blind\/[^/]+$/).min[1]!).toBeGreaterThan(rails.max[1]!);
  });

  it('the second is over the first and over the tray in front of the door, an inch clear: it comes across without that tray moving', () => {
    const b = build([front, blind1, blind2]);
    const [f, lower, upper] = [tray(b, /\/sink-tray-bottom\/tray-/), tray(b, /\/sink-blind\/[^/]+$/), tray(b, /\/sink-blind-2\/[^/]+$/)];
    expect(upper.min[1]! - lower.max[1]!).toBeGreaterThanOrEqual(25);
    expect(upper.min[1]! - f.max[1]!).toBeGreaterThanOrEqual(25);
    // A tall tray in front of the door pushes it up, not the first blind tray.
    const tall = build([{ ...front, wall: len('8"') }, blind1, blind2]);
    const [tf, tl, tu] = [tray(tall, /\/sink-tray-bottom\/tray-/), tray(tall, /\/sink-blind\/[^/]+$/), tray(tall, /\/sink-blind-2\/[^/]+$/)];
    expect(tu.min[1]! - tf.max[1]!).toBeGreaterThanOrEqual(25);
    expect(tu.min[1]! - tf.max[1]!).toBeLessThan(45);
    expect(tu.min[1]!).toBeGreaterThan(upper.min[1]! + 20);
    expect(tl.min[1]!).toBeLessThan(tf.max[1]!);
  });

  it('set by hand too low, each says so', () => {
    expect(() => build([front, { ...blind1, up: len('2"') }])).toThrow(/would run into what stays in front of the door/);
    // The second, put where the first one stands, would be in it.
    expect(() => build([front, blind1, { ...blind2, up: len('5"') }])).toThrow(/no room|same place/);
  });
});
