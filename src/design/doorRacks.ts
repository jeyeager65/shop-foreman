/**
 * Door racks: shallow open boxes screwed to the inside of a base cabinet's doors,
 * for the things that are reached for most. A rack is a bottom, two ends, a back strip that takes the
 * screws into the door and a low rail in front that keeps things in. When the door is shut the racks
 * stand inside the cabinet, so whatever is behind them (the trays, the shelves) starts further back.
 *
 * A rack is narrower than its door: an inch and a half in from the hinge side, clear of the hinges, and at
 * the other end as far in as lets its far corner swing out past the edge of the opening (or the other
 * door's rack). A door carries only so much on two cup hinges: the weight is worked out roughly and said.
 *
 * Derived; never stored. `deriveUnderSink` calls this and adds the parts to what stands inside.
 */
import type { CabinetDesign, DoorRacks, Material, Mm, Part, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { partsWeight } from './casters';
import { rect } from './doors';
import { withGrain } from './grain';
import { deriveCabinetOpenings } from './openings';
import { constructionRules, thicknessOf } from './style';

/** How far a rack stands in from the hinge edge of its door's share of the opening. Tune me. */
export const RACK_HINGE_INSET: Mm = 1.5 * MM_PER_INCH;
/** How high a rack's ends and back are, and its front rail. Tune me. */
export const RACK_HEIGHT: Mm = 3 * MM_PER_INCH;
export const RACK_RAIL: Mm = 1.5 * MM_PER_INCH;
/** The lowest rack's underside above the bottom of the door opening, and the highest rack's top under its top. Tune me. */
export const RACK_MARGIN: Mm = 2 * MM_PER_INCH;
/** What a door on two cup hinges carries besides itself before it sags, kg: racks and what is in them. Tune me. */
export const RACK_DOOR_LOAD = 4.5;
/** What a rack is taken to hold, kg for each 100 mm of its width. Tune me. */
export const RACK_LOAD_PER_100 = 0.6;
/** Between the racks and whatever stands behind them. */
export const RACK_CLEAR: Mm = MM_PER_INCH / 2;
const BOX_ID = 'plywood-1-2';
const BOTTOM_ID = 'plywood-1-4';

export const RACK_DOORS: { title: string; value: DoorRacks['doors'] }[] = [
  { title: 'A pair of doors: racks on both', value: 'pair' },
  { title: 'One door, hinged on the left', value: 'left' },
  { title: 'One door, hinged on the right', value: 'right' },
];

/** The racks a cabinet starts with: one on each door of a pair, 3-1/2" deep. */
export const createDoorRacks = (): DoorRacks => ({ doors: 'pair', count: 1, depth: { mm: 3.5 * MM_PER_INCH, unit: 'in' } });

export interface DoorRackBuild {
  parts: Part[];
  /** How far behind the case front the racks reach when the doors are shut: what is behind them starts further back. */
  reach: Mm;
  /** Each rack, outside, for the words on Design. */
  racks: { name: string; width: Mm; depth: Mm; height: Mm }[];
  /** What the doors are asked to carry, in words; `heavy` when it is more than two cup hinges take. */
  weight: { words: string; heavy: boolean };
}

const UP: Vec3 = [0, 1, 0];
const RIGHT: Vec3 = [1, 0, 0];
const BACK: Vec3 = [0, 0, -1];
const FRONT: Vec3 = [0, 0, 1];

/** The racks on the doors of a cabinet that has some. */
export function deriveDoorRacks(cabinet: CabinetDesign, materials: Material[]): DoorRackBuild | undefined {
  const racks = cabinet.inside?.doorRacks;
  if (!racks || racks.count < 1) return undefined;
  const has = (id: string) => materials.some((m) => m.id === id);
  const boxId = has(BOX_ID) ? BOX_ID : cabinet.materials.caseId;
  const railId = has(BOTTOM_ID) ? BOTTOM_ID : cabinet.materials.backId;
  const [t, tRail] = [thicknessOf(materials, boxId), thicknessOf(materials, railId)];
  const rules = constructionRules(cabinet, materials);
  const opening = deriveCabinetOpenings(cabinet, materials)
    .filter((o) => o.use === 'doors')
    .at(-1);
  if (!opening) return undefined;
  const depth = racks.depth.mm;
  if (!(depth >= 2 * MM_PER_INCH) || depth > 6 * MM_PER_INCH) throw new Error('A door rack is between 2" and 6" deep.');
  // The back of a shut door: on the face of the frame, on the case front, or inside the case when the doors are inset.
  const doorBack = rules.inset ? -MM_PER_INCH : rules.frontPlane;
  // Each door's share of the opening, from its hinge edge.
  const share = racks.doors === 'pair' ? opening.width / 2 : opening.width;
  // The far corner swings out on a circle about the hinge edge: it must pass inside the share's other edge.
  const latchInset = share - Math.sqrt(Math.max(0, share * share - depth * depth)) + RACK_CLEAR;
  const width = share - RACK_HINGE_INSET - latchInset;
  if (width < 6 * MM_PER_INCH) throw new Error(`There is no room for a door rack: it would be ${Math.round(width)} mm wide. Make it shallower, or leave the racks out.`);
  const room = opening.height - 2 * RACK_MARGIN;
  if (room < racks.count * (RACK_HEIGHT + 2 * MM_PER_INCH)) throw new Error(`The door is not tall enough for ${racks.count} racks: ask for fewer.`);

  const parts: Part[] = [];
  const out: DoorRackBuild['racks'] = [];
  const add = (key: string, name: string, materialId: string, size: Part['size'], placement: NonNullable<Part['placement']>) => {
    const part: Part = {
      id: `${cabinet.id}/sink-rack-${key}`,
      designObjectId: cabinet.id,
      name,
      materialId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, size.width, size.height) }],
      role: 'pullOut',
      placement,
    };
    parts.push(withGrain(part, 'pullOut', materials));
  };
  const sides = racks.doors === 'pair' ? (['left', 'right'] as const) : [racks.doors];
  for (const side of sides) {
    // Hinged at the opening's edge on its own side.
    const x0 = side === 'left' ? opening.origin.x + RACK_HINGE_INSET : opening.origin.x + opening.width - RACK_HINGE_INSET - width;
    const x1 = x0 + width;
    for (let k = 0; k < racks.count; k++) {
      // One rack: at the bottom. Several: spread evenly up the door.
      const y = opening.origin.y + RACK_MARGIN + (racks.count > 1 ? (k * (room - RACK_HEIGHT)) / (racks.count - 1) : 0);
      const n = racks.count > 1 ? ` ${k + 1}` : '';
      const name = `${side === 'left' ? 'Left' : 'Right'} door rack${n}`;
      const key = `${side}-${k + 1}`;
      out.push({ name, width, depth, height: RACK_HEIGHT });
      const inner = doorBack - depth;
      // The bottom lies between the two ends, from the back strip to the rail.
      add(`${key}/bottom`, `${name}, bottom`, boxId, { width: width - 2 * t, height: depth - t - tRail, thickness: t }, { origin: [x0 + t, y + t, doorBack - t], xAxis: RIGHT, yAxis: BACK });
      add(`${key}/end-left`, `${name}, left end`, boxId, { width: depth, height: RACK_HEIGHT, thickness: t }, { origin: [x0 + t, y, doorBack], xAxis: BACK, yAxis: UP });
      add(`${key}/end-right`, `${name}, right end`, boxId, { width: depth, height: RACK_HEIGHT, thickness: t }, { origin: [x1 - t, y, inner], xAxis: FRONT, yAxis: UP });
      // The back strip lies against the door and takes the screws; the rail closes the front, lower, to see over.
      add(`${key}/back`, `${name}, back`, boxId, { width: width - 2 * t, height: RACK_HEIGHT - t, thickness: t }, { origin: [x1 - t, y + t, doorBack - t], xAxis: [-1, 0, 0], yAxis: UP });
      add(`${key}/rail`, `${name}, rail`, railId, { width: width - 2 * t, height: RACK_RAIL, thickness: tRail }, { origin: [x0 + t, y + t, inner + tRail], xAxis: RIGHT, yAxis: UP });
    }
  }
  // What one door is asked to carry: its racks, and what they are taken to hold.
  const perDoor = parts.filter((p) => p.id.includes(`/sink-rack-${sides[0]}-`));
  const wood = partsWeight(perDoor, materials);
  const load = (racks.count * width * RACK_LOAD_PER_100) / 100;
  const total = wood + load;
  const lb = (kg: number) => Math.round(kg * 2.2046);
  const heavy = total > RACK_DOOR_LOAD;
  const words =
    `Each door carries ${racks.count === 1 ? 'a rack' : `${racks.count} racks`}: about ${lb(wood) || 1} lb of wood, and about ${lb(load) || 1} lb when ${racks.count === 1 ? 'it is' : 'they are'} full. ` +
    (heavy
      ? `That is more than a door on two cup hinges carries without sagging (about ${lb(RACK_DOOR_LOAD)} lb, tune me): fit a third hinge, ask for fewer or shallower racks, or keep the heavy things on the trays.`
      : `Two cup hinges carry about ${lb(RACK_DOOR_LOAD)} lb besides the door (tune me): keep heavy bottles on the trays.`);
  return { parts, reach: -(doorBack - depth - RACK_CLEAR), racks: out, weight: { words, heavy } };
}
