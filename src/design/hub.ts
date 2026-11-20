/**
 * A power hub in the open space at the top of a base cabinet (the open space in the front corner of a shop
 * table is for one), after the table hub of the lr4-sandbox project: there a panel under
 * the table's left end with a dust port, a power inlet, a router / vac outlet and an accessory outlet set into
 * it, meeting a switch panel on the table's front (a magnetic paddle switch, a power lamp, the router and vac
 * toggles) in a square corner. Here the cabinet is that corner: the outlets and the port are set into one of
 * its sides, and a switch panel closes the space at its front: screwed on, not hinged, so the cable to it is fixed
 * wiring, and it comes off for service. The upper part of the back is a panel of its own that comes off too, for
 * access from the back, with a second dust port
 * in it: a short hose inside joins the two ports, and the vac's hose plugs in at the back. Everything is as high in
 * the space as it goes, so the space can be low and the doors under it taller.
 *
 * What is made: the openings through the side (three device boxes and the port), the switch panel with its two
 * openings (the paddle switch's body, the three-gang box), the back, which stops at the shelf under the space,
 * the access panel over it (of the case material: it carries a port and is screwed on and off; set in between the
 * sides so its face is level with the thin back below) with the second port's hole, and
 * four cleats on the insides of the sides for the two panels to be screwed to. The back stretcher lies flat under the top whatever the project says, so it does not stand in
 * the opening the upper panel leaves. Everything
 * bought is on the hardware list and drawn, never cut. Every size here is a guess from lr4-sandbox's drawing
 * and from common US boxes and plates: tune me, and check each opening against the part in hand.
 *
 * The hub is 120 V house wiring. This is one way to build it, not an electrical design.
 */
import type { CabinetDesign, Feature, Material, Mm, Part, Polygon } from '@/model';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';
import { rect } from './doors';
import { deriveCabinetOpenings } from './openings';
import { thicknessOf } from './style';

/** The hub's sizes. Tune me: every one. */
export const HUB = {
  /** A device box: the opening cut for it (the box's front comes through, flush with the face), and how far it reaches behind. */
  box: { width: 57, height: 95, deep: 76 },
  /** A three-gang box's opening is this wide. */
  box3: 149,
  /** A single cover plate, and how wide a three-gang one is. */
  plate: { width: 70, height: 114, thick: 3 },
  plate3: 162,
  /** The magnetic paddle switch: the opening for its body, its paddle, and how far the paddle stands proud. */
  paddle: { cut: { width: 42, height: 75 }, face: { width: 82, height: 121 }, proud: 36 },
  /** The dust port, a 2-1/2" bulkhead fitting: the hole for it, its tube, how far it stands out and in, its flange. */
  port: { hole: 64, tube: 60, out: 40, in: 40, flange: 88 },
  /** Along the side, behind the case front: the first device's centre, from one to the next, from the inlet to the port. */
  side: { first: 170, pitch: 85, port: 95 },
  /** Across the switch panel, from the middle of the opening: the paddle switch's centre toward the hub's side, the three-gang plate's away from it. The two are centred as a pair. */
  front: { paddle: 90, plate: 50 },
  /** What is left round an opening, at the least. */
  margin: 25,
  /** The second port, in the removable back, from the hub's side to its centre. */
  backPort: 150,
  /** How wide a cleat is: the strips on the insides of the sides that the switch panel and the access panel are screwed to. */
  cleat: 38.1,
  /** How much smaller than its opening the access panel is, each way, so it comes out. */
  fit: 1,
} as const;

/** Where a hub's pieces are, in its cabinet's frame. */
export interface HubLayout {
  side: 'left' | 'right';
  /** The opening it is in: between these across the cabinet and off the floor. */
  x0: Mm;
  x1: Mm;
  y0: Mm;
  y1: Mm;
  /** The height of every device's centre: as high in the opening as a plate goes, with its margin over it. */
  mid: Mm;
  /** The case material's thickness: the side's and the switch panel's. */
  t: Mm;
  /** The side's devices, each centre behind the case front: the accessory outlet, the router / vac outlet, the inlet, the dust port. */
  behind: { accessory: Mm; outlet: Mm; inlet: Mm; port: Mm };
  /** The switch panel's, each centre across the cabinet, and the back port's. */
  across: { paddle: Mm; plate: Mm; backPort: Mm };
  /** Where the back is split, off the floor: the top of the shelf under the space. The back below covers the shelf's edge; the access panel stands on the shelf. */
  split: Mm;
}

const show = (mm: Mm) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);

function measure(cabinet: CabinetDesign, materials: Material[]): { layout?: HubLayout; problems: string[] } {
  const hub = cabinet.hub;
  if (!hub) return { problems: [] };
  let openings;
  try {
    openings = deriveCabinetOpenings(cabinet, materials);
  } catch {
    return { problems: [] };
  }
  const top = openings[0];
  if (!top) return { problems: [] };
  // The top opening at the hub's side: the first bay's, or the last's.
  const row = openings.filter((o) => o.rowId === top.rowId).sort((a, b) => a.origin.x - b.origin.x);
  const o = hub.side === 'left' ? row[0]! : row.at(-1)!;
  const problems: string[] = [];
  if (cabinet.form !== 'base') problems.push('A power hub goes in a base cabinet.');
  if (o.use !== 'doors') problems.push('A power hub goes in an open space at the top of the cabinet: make its top row an opening with no doors, not a drawer.');
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const s = HUB.side;
  const port = s.first + 2 * s.pitch + s.port;
  const deep = port + HUB.port.flange / 2 + HUB.margin;
  const high = Math.max(HUB.plate.height, HUB.paddle.face.height) + 2 * HUB.margin;
  // The pair, from the paddle's edge to the plate's, with room each side for the hinge cups and a finger notch.
  const wide = HUB.front.paddle + HUB.paddle.face.width / 2 + HUB.front.plate + HUB.plate3 / 2 + 4 * HUB.margin;
  if (cabinet.size.depth.mm - HUB.margin < deep) problems.push(`The cabinet is too shallow for the hub's outlets and port along its side: they need ${show(deep + HUB.margin)} of depth.`);
  if (o.height < high) problems.push(`The open space is too low for the hub: it needs ${show(high)}, and has ${show(o.height)}.`);
  if (o.width < wide) problems.push(`The open space is too narrow for the hub's switches: it needs ${show(wide)}, and has ${show(o.width)}.`);
  if (cabinet.joinery.back === 'groove') problems.push("The hub's upper back comes off, which a back in a groove cannot: give the cabinet a back in a rabbet or an applied one.");
  if (problems.length) return { problems };
  const from = (d: Mm) => (hub.side === 'left' ? o.origin.x + d : o.origin.x + o.width - d);
  return {
    problems,
    layout: {
      side: hub.side,
      x0: o.origin.x,
      x1: o.origin.x + o.width,
      y0: o.origin.y,
      y1: o.origin.y + o.height,
      mid: o.origin.y + o.height - HUB.margin - Math.max(HUB.plate.height, HUB.box.height) / 2,
      t,
      behind: { accessory: s.first, outlet: s.first + s.pitch, inlet: s.first + 2 * s.pitch, port },
      across: { paddle: from(o.width / 2 - HUB.front.paddle), plate: from(o.width / 2 + HUB.front.plate), backPort: from(HUB.backPort) },
      split: o.origin.y,
    },
  };
}

/** The cabinet's hub, laid out; nothing when it has none or it cannot be made (`hubProblems` says why). */
export const hubOf = (cabinet: CabinetDesign, materials: Material[]): HubLayout | undefined => measure(cabinet, materials).layout;

/** Why the cabinet's hub cannot be made, in words. */
export const hubProblems = (cabinet: CabinetDesign, materials: Material[]): string[] => measure(cabinet, materials).problems;

const round = (cx: Mm, cy: Mm, r: Mm, n = 48): Polygon => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
const box = (cx: Mm, cy: Mm, w: Mm, h: Mm): Polygon => rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
const opening = (id: string, outline: Polygon): Feature => ({ id, kind: 'cutout', face: 'A', inside: true, outline });

/**
 * The openings through the side the hub is on, in the side's own coordinates: `at` gives the side's x for a
 * distance behind the case front. Three device boxes and the dust port, on one line.
 */
export function hubSideCuts(cabinet: CabinetDesign, materials: Material[], side: 'left' | 'right', at: (behind: Mm) => Mm): Feature[] {
  const hub = hubOf(cabinet, materials);
  if (!hub || hub.side !== side) return [];
  const b = hub.behind;
  return [
    opening('hub-accessory', box(at(b.accessory), hub.mid, HUB.box.width, HUB.box.height)),
    opening('hub-outlet', box(at(b.outlet), hub.mid, HUB.box.width, HUB.box.height)),
    opening('hub-inlet', box(at(b.inlet), hub.mid, HUB.box.width, HUB.box.height)),
    opening('hub-port', round(at(b.port), hub.mid, HUB.port.hole / 2)),
  ];
}

/** The switch panel's size, where its corner is in the cabinet, and its two openings (the paddle switch's body, the three-gang box). */
export function hubPanel(cabinet: CabinetDesign, materials: Material[]): { size: { width: Mm; height: Mm; thickness: Mm }; origin: [Mm, Mm, Mm]; cuts: Feature[] } | undefined {
  const hub = hubOf(cabinet, materials);
  if (!hub) return undefined;
  const y = hub.mid - hub.y0;
  return {
    size: { width: hub.x1 - hub.x0, height: hub.y1 - hub.y0, thickness: hub.t },
    origin: [hub.x0, hub.y0, 0],
    cuts: [
      opening('hub-paddle', box(hub.across.paddle - hub.x0, y, HUB.paddle.cut.width, HUB.paddle.cut.height)),
      opening('hub-switches', box(hub.across.plate - hub.x0, y, HUB.box3, HUB.box.height)),
    ],
  };
}

/** Where the cabinet's back is split for the hub, off the floor: the upper panel comes off. Nothing with no hub. */
export const hubBackSplit = (cabinet: CabinetDesign, materials: Material[]): Mm | undefined => hubOf(cabinet, materials)?.split;

/**
 * The second port's hole through the access panel: `x` gives the panel's x for a place across the cabinet, `y0`
 * is how far off the floor the panel starts.
 */
export function hubBackCut(cabinet: CabinetDesign, materials: Material[], x: (across: Mm) => Mm, y0: Mm): Feature[] {
  const hub = hubOf(cabinet, materials);
  return hub ? [opening('hub-back-port', round(x(hub.across.backPort), hub.mid - y0, HUB.port.hole / 2))] : [];
}

/** The colours the hub's bought pieces are drawn in. */
export const HUB_COLOURS = { ivory: 0xe6e0d1, dark: 0x141416, red: 0xc7100d, blue: 0x2152b8, steel: 0xb8bdc2, green: 0x2fae4a } as const;
type HubColour = keyof typeof HUB_COLOURS;

/** The colour one of the hub's drawn pieces has, from its id; nothing for any other part. */
export function hubShapeColour(partId: string): number | undefined {
  const colour = /\/hub-appliance-([a-z]+)-/.exec(partId)?.[1];
  return colour && colour in HUB_COLOURS ? HUB_COLOURS[colour as HubColour] : undefined;
}

/**
 * The hub's bought pieces, for the picture only (never cut, planned or listed as parts: `isApplianceShape`): on
 * the side the plates, the outlets' faces, the inlet, the dust port and the ground post, with a box behind
 * each device; on the switch panel the paddle switch, the plate with its lamp and two toggles, and their boxes; on the
 * removable back the second port.
 */
export function hubShapes(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const hub = hubOf(cabinet, materials);
  if (!hub) return [];
  const W = cabinet.size.width.mm;
  const out: Part[] = [];
  const add = (colour: HubColour, key: string, name: string, drawn: Polygon, thickness: Mm, placed: NonNullable<Part['placement']>, role: Part['role'] = 'back') => {
    // A part's outline starts at its own corner: the shape's is moved there, and its place with it.
    const [x0, y0] = [Math.min(...drawn.map((p) => p.x)), Math.min(...drawn.map((p) => p.y))];
    const outline = drawn.map((p) => ({ x: p.x - x0, y: p.y - y0 }));
    const origin = placed.origin.map((o, i) => o + x0 * placed.xAxis[i]! + y0 * placed.yAxis[i]!) as [Mm, Mm, Mm];
    out.push({
      id: `${cabinet.id}/hub-appliance-${colour}-${key}/shape`,
      designObjectId: cabinet.id,
      name,
      materialId: cabinet.materials.caseId,
      size: { width: Math.max(...outline.map((p) => p.x)), height: Math.max(...outline.map((p) => p.y)), thickness },
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline }],
      // (Inside the case's depth, it does not move where the cabinet's back is. What stands out behind the back is
      // given the role of a top, which is not counted there.)
      role,
      placement: { ...placed, origin },
    });
  };
  /** On the side: from `u0` to `u1` out from its outside face (inward is negative), its outline by distance behind the case front and height. */
  const onSide = (colour: HubColour, key: string, name: string, u0: Mm, u1: Mm, outline: Polygon) =>
    add(colour, key, name, outline, u1 - u0, { origin: [hub.side === 'left' ? -u0 : W + u1, 0, 0], xAxis: [0, 0, -1], yAxis: [0, 1, 0] });
  /** On the switch panel or the back: from `z0` to `z1` forward of the case front (behind is negative), its outline across the cabinet and by height. */
  const onFront = (colour: HubColour, key: string, name: string, z0: Mm, z1: Mm, outline: Polygon, role?: Part['role']) => add(colour, key, name, outline, z1 - z0, { origin: [0, 0, z1], xAxis: [1, 0, 0], yAxis: [0, 1, 0] }, role);

  const { mid, t, behind: b } = hub;
  const P = HUB.plate;
  for (const [key, name, at] of [['accessory', 'Accessory outlet', b.accessory], ['outlet', 'Router and vac outlet', b.outlet], ['inlet', 'Power inlet', b.inlet]] as const) {
    onSide('ivory', `plate-${key}`, `${name}: cover plate`, 0, P.thick, box(at, mid, P.width, P.height));
    onSide('blue', `box-${key}`, `${name}: box`, -(t + HUB.box.deep), -t, box(at, mid, HUB.box.width + 3, HUB.box.height + 3));
    if (key === 'inlet') onSide('dark', 'inlet', 'Power inlet', P.thick, P.thick + 12, round(at, mid, 21, 32));
    else for (const [n, dy] of [['top', 19], ['bottom', -19]] as const) onSide('dark', `socket-${key}-${n}`, `${name}: socket`, P.thick, P.thick + 4, box(at, mid + dy, 34, 30));
  }
  const port = HUB.port;
  onSide('dark', 'port', 'Dust port', 4, port.out, round(b.port, mid, port.tube / 2));
  onSide('dark', 'port-flange', 'Dust port flange', 0, 4, round(b.port, mid, port.flange / 2));
  onSide('dark', 'port-stub', 'Dust port, inside', -(t + port.in), -t, round(b.port, mid, port.tube / 2));
  onSide('green', 'ground', 'Ground binding post', 0, 28, round(b.port - 60, mid - 54, 7, 24));

  const { paddle, plate } = hub.across;
  // Toward the middle of the cabinet from the hub's side.
  const inward = hub.side === 'left' ? 1 : -1;
  const F = HUB.paddle.face;
  onFront('dark', 'paddle-body', 'Paddle switch', 0, 9, box(paddle, mid, 50, 92));
  onFront('red', 'paddle', 'STOP paddle', 9, HUB.paddle.proud, box(paddle, mid - 10.5, F.width, F.height));
  onFront('blue', 'box-paddle', 'Paddle switch: box', -(t + HUB.box.deep), -t, box(paddle, mid, HUB.box.width + 3, HUB.box.height + 3));
  onFront('steel', 'plate-switches', 'Combination plate', 0, P.thick, box(plate, mid, HUB.plate3, P.height));
  onFront('blue', 'box-switches', 'Switches: box', -(t + HUB.box.deep), -t, box(plate, mid, HUB.box3 + 3, HUB.box.height + 3));
  onFront('green', 'lamp', 'Power lamp', P.thick, P.thick + 9, round(plate - 46 * inward, mid, 9, 24));
  onFront('red', 'toggle-router', 'Router switch', P.thick, P.thick + 12, box(plate, mid, 11, 25));
  onFront('red', 'toggle-vac', 'Vac switch', P.thick, P.thick + 12, box(plate + 46 * inward, mid, 11, 25));
  // The second port, through the removable back: its flange and tube behind the cabinet, its stub inside.
  // (The access panel is of the case material, set in between the sides: its outside face is level with the back's.)
  const rear = -cabinet.size.depth.mm;
  const inner = rear + t;
  onFront('dark', 'back-port-flange', 'Back dust port flange', rear - 4, rear, round(hub.across.backPort, mid, port.flange / 2), 'top');
  onFront('dark', 'back-port', 'Back dust port', rear - port.out, rear - 4, round(hub.across.backPort, mid, port.tube / 2), 'top');
  onFront('dark', 'back-port-stub', 'Back dust port, inside', inner, inner + port.in, round(hub.across.backPort, mid, port.tube / 2));
  return out;
}
