/**
 * A sink over a base cabinet (`CabinetSink`): its sizes, the opening it needs in the top over the cabinet, and where it
 * sits. It is the cabinet's, not the room's: a vanity on its own has one as a kitchen's sink base does, and the top
 * over the cabinet takes its opening wherever that top comes from (a run's, the cabinet's own, an island's).
 *
 * In the sink's own frame X runs across it to the right and Z toward the front, its centre at 0, 0.
 */
import type { CabinetDesign, CabinetSink, Mm, SinkLook, SinkMount } from '@/model';
import { MM_PER_INCH, len } from '@/units';

const IN = MM_PER_INCH;

/** Tune me: the sizes a sink is worked out from. */
export const SINK = {
  /** A drop-in's rim laps the top round its opening by this much each side. */
  rim: 8,
  /** An undermount's (or a farmhouse sink's) flange: its opening in the top is this much inside its outside each side. */
  flange: 0.75 * IN,
  /** A square-cornered sink's corner radius, outside. */
  corner: 1 * IN,
  /** The drain, through a vessel's top: its hole across. */
  drain: 1.75 * IN,
  /** A faucet's hole across, and how far behind the sink's opening the holes' centres stand. */
  faucetHole: 1.375 * IN,
  faucetBehind: 1.75 * IN,
  /** A top's thickness where it is not known (a bowl's lowest point under the sink): an ordinary countertop's. */
  topGuess: 1.25 * IN,
  /** How far a top stands in front of the case where it is not known: a face frame and an inch over it. */
  frontGuess: 1.75 * IN,
  /** Segments in a round outline. */
  segments: 48,
  /** Between the two bowls of a double undermount or farmhouse sink: the top over the divider, its width. */
  divider: 2 * IN,
  /** A bought top with its bowl in it: how thick it is drawn, and its bowl's share of the top's width and depth. */
  integratedThick: 0.75 * IN,
  integratedBowl: { width: 0.6, depth: 0.6 },
  /** A bought vanity top's overhang past the case each side and at the front. */
  integratedOver: { side: 0.5 * IN, front: 1 * IN },
};

/** The kinds, in words, in the order Design offers them. */
export const SINK_MOUNTS: { value: SinkMount; title: string }[] = [
  { value: 'dropIn', title: 'Drop-in: its rim on the top, the bowl through it' },
  { value: 'undermount', title: 'Undermount: fixed under the top' },
  { value: 'vessel', title: 'Vessel: a bowl standing on the top' },
  { value: 'integrated', title: 'A bought top with the sink in it' },
  { value: 'farmhouse', title: 'Farmhouse: an apron front' },
];

/**
 * A new sink for a cabinet: a vanity's (an oval undermount bowl 19" × 16", 6" deep) on a cabinet less than 22" deep,
 * else a kitchen's (a drop-in 33" × 22", 9" deep, as wide as the cabinet allows less 3"). Tune me.
 */
export function newSink(cabinet: Pick<CabinetDesign, 'size'>): CabinetSink {
  if (cabinet.size.depth.mm < 22 * IN) return { mount: 'undermount', width: len('19"'), depth: len('16"'), bowlDepth: len('6"'), shape: 'oval' };
  const width = Math.min(33 * IN, cabinet.size.width.mm - 3 * IN);
  return { mount: 'dropIn', width: { mm: width, unit: 'in' }, depth: len('22"'), bowlDepth: len('9"'), shape: 'rectangle' };
}

/** Tune me: a farmhouse sink's apron to start: as tall as the sink is, its face this far in front of the doors' faces. */
export const FARMHOUSE = { height: 10 * IN, proud: 0.25 * IN, depth: 20 * IN, bowl: 9 * IN };

/**
 * A sink of a kind for a cabinet, as Design starts it when the kind is chosen: a vessel a 16" round bowl 5" deep; a
 * bought top with its sink as big as the case and its overhang; a farmhouse sink 20" front to back, 10" tall at its
 * apron, 9" deep inside, as wide as the cabinet less 3" (33" at most); the others as `newSink`, of that kind. Tune me.
 */
export function sinkOfKind(cabinet: Pick<CabinetDesign, 'size'>, mount: SinkMount, front: Mm = SINK.frontGuess - SINK.integratedOver.front): CabinetSink {
  if (mount === 'vessel') return { mount, width: len('16"'), depth: len('16"'), bowlDepth: len('5"'), shape: 'oval' };
  if (mount === 'farmhouse') {
    const width = Math.min(33 * IN, cabinet.size.width.mm - 3 * IN);
    return { mount, width: { mm: width, unit: 'in' }, depth: { mm: FARMHOUSE.depth, unit: 'in' }, bowlDepth: { mm: FARMHOUSE.bowl, unit: 'in' }, shape: 'rectangle', apron: { height: { mm: FARMHOUSE.height, unit: 'in' }, proud: { mm: FARMHOUSE.proud, unit: 'in' } } };
  }
  if (mount === 'integrated') {
    const width = cabinet.size.width.mm + 2 * SINK.integratedOver.side;
    const depth = cabinet.size.depth.mm + front + SINK.integratedOver.front;
    return { mount, width: { mm: width, unit: 'in' }, depth: { mm: depth, unit: 'in' }, bowlDepth: len('6"'), shape: 'oval' };
  }
  return { ...newSink(cabinet), mount };
}

/** A rectangle with rounded corners (radius `r`), or an ellipse, `w` × `d`, centred: its outline as points, counter-clockwise seen from above. */
export function roundedOutline(w: Mm, d: Mm, shape: CabinetSink['shape'], r: Mm = SINK.corner): [Mm, Mm][] {
  const n = SINK.segments;
  if (shape === 'oval') return Array.from({ length: n }, (_, i) => [(w / 2) * Math.cos((2 * Math.PI * i) / n), (d / 2) * Math.sin((2 * Math.PI * i) / n)]);
  const rr = Math.max(0, Math.min(r, w / 2, d / 2));
  const quarter = n / 4;
  const corners: [Mm, Mm, number][] = [
    [w / 2 - rr, d / 2 - rr, 0],
    [-w / 2 + rr, d / 2 - rr, Math.PI / 2],
    [-w / 2 + rr, -d / 2 + rr, Math.PI],
    [w / 2 - rr, -d / 2 + rr, (3 * Math.PI) / 2],
  ];
  return corners.flatMap(([cx, cz, a0]) => Array.from({ length: quarter / 3 + 1 }, (_, k): [Mm, Mm] => {
    const a = a0 + ((Math.PI / 2) * k) / (quarter / 3);
    return [cx + rr * Math.cos(a), cz + rr * Math.sin(a)];
  }));
}

/** How far a sink's opening is inside its outside, each side: a drop-in's rim, an undermount's flange. */
export function sinkInset(sink: Pick<CabinetSink, 'mount'>): Mm {
  return sink.mount === 'dropIn' ? SINK.rim : SINK.flange;
}

/**
 * The bowls of a sink, in its own frame: each one's centre across, and its width (the outside, less the divider
 * between two). One bowl is the whole sink.
 */
export function sinkBowls(sink: Pick<CabinetSink, 'width' | 'double'>, divider: Mm = SINK.divider): { x: Mm; width: Mm }[] {
  const w = sink.width.mm;
  if (!sink.double) return [{ x: 0, width: w }];
  const share = Math.min(0.8, Math.max(0.2, sink.double.leftShare));
  const left = (w - divider) * share;
  const right = w - divider - left;
  return [
    { x: -w / 2 + left / 2, width: left },
    { x: w / 2 - right / 2, width: right },
  ];
}

/**
 * The openings a sink needs through its top, in its own frame, each a loop: inside a drop-in's rim (one opening, two
 * bowls or one), inside an undermount's or a farmhouse sink's flange (one for each bowl, the top running over the
 * divider), or a vessel's drain. An integrated sink needs none (its top is the sink's).
 */
export function sinkOpenings(sink: CabinetSink): [Mm, Mm][][] {
  if (sink.mount === 'integrated') return [];
  if (sink.mount === 'vessel') return [roundedOutline(SINK.drain, SINK.drain, 'oval')];
  const inset = sinkInset(sink);
  const depth = sink.depth.mm - 2 * inset;
  if (sink.mount === 'dropIn' || !sink.double) return [roundedOutline(sink.width.mm - 2 * inset, depth, sink.shape, SINK.corner - inset)];
  // Two bowls under the top: the outer edges inside the flange, the inner ones at the divider's sides.
  return sinkBowls(sink).map((b, i) => {
    const w = b.width - inset;
    const x = b.x + (i === 0 ? inset / 2 : -inset / 2);
    return roundedOutline(w, depth, sink.shape, SINK.corner - inset).map(([px, pz]): [Mm, Mm] => [px + x, pz]);
  });
}

/** A faucet's three holes are this far apart, the outer two's centres: a vanity's centreset, a kitchen's widespread. Tune me. */
export const FAUCET_SPREAD = { vanity: 4 * IN, kitchen: 8 * IN };

/** How far apart a sink's three faucet holes are: its own, else by its size (a vanity's under 18" deep). */
export function faucetSpread(sink: Pick<CabinetSink, 'faucet' | 'depth'>): Mm {
  return sink.faucet?.spread?.mm ?? (sink.depth.mm < 18 * IN ? FAUCET_SPREAD.vanity : FAUCET_SPREAD.kitchen);
}

/**
 * Whether its faucet holes are cut through the top: behind an undermount, a vessel or a farmhouse sink. A drop-in has
 * its holes in its own deck, and a top with its sink in it comes with them.
 */
export const holesInTop = (sink: Pick<CabinetSink, 'mount' | 'faucet'>): boolean => !!sink.faucet && (sink.mount === 'undermount' || sink.mount === 'vessel' || sink.mount === 'farmhouse');

/**
 * The faucet holes through the top, in the sink's own frame, each a loop: one hole, or three across, centred behind
 * the sink (a vessel's 2" behind it, the others `SINK.faucetBehind`). None where `holesInTop` says not.
 */
export function faucetHoles(sink: CabinetSink): [Mm, Mm][][] {
  if (!holesInTop(sink)) return [];
  const behind = sink.depth.mm / 2 + (sink.mount === 'vessel' ? 2 * IN : SINK.faucetBehind);
  const spread = faucetSpread(sink);
  const xs = sink.faucet!.holes === 3 ? [-spread / 2, 0, spread / 2] : [0];
  const hole = roundedOutline(SINK.faucetHole, SINK.faucetHole, 'oval');
  return xs.map((x) => hole.map(([px, pz]): [Mm, Mm] => [x + px, pz - behind]));
}

/** The faucet in words: "a faucet for one hole", "a widespread faucet for three holes, 8" apart". */
export function faucetWords(sink: Pick<CabinetSink, 'faucet' | 'depth'>, length: (mm: Mm) => string): string {
  if (!sink.faucet) return '';
  if (sink.faucet.holes === 1) return 'a faucet for one hole';
  const spread = faucetSpread(sink);
  return `a ${spread <= FAUCET_SPREAD.vanity + 1 ? 'centreset' : 'widespread'} faucet for three holes, ${length(spread)} apart`;
}

/**
 * Where a sink's centre is in its cabinet's frame: across, the cabinet's middle moved by its offset; front to back, the
 * middle of what lies between the cabinet's back and the front edge of the top over it (`front`, in the cabinet's
 * frame; left out, a guess at it), or further forward where its faucet's holes need the room behind it, an inch of
 * top behind them.
 */
export function sinkCentre(cabinet: Pick<CabinetDesign, 'size' | 'sink'>, front: Mm = SINK.frontGuess): [Mm, Mm] {
  const sink = cabinet.sink;
  // A farmhouse sink stands with its apron in front: `front` is then where its apron's face is.
  if (sink?.mount === 'farmhouse') return [cabinet.size.width.mm / 2 + (sink.offset?.mm ?? 0), front - sink.depth.mm / 2];
  const centred = (front - cabinet.size.depth.mm) / 2;
  const behind = sink && holesInTop(sink) ? (sink.mount === 'vessel' ? 2 * IN : SINK.faucetBehind) + SINK.faucetHole / 2 + IN : 0;
  const least = sink ? -cabinet.size.depth.mm + behind + sink.depth.mm / 2 : centred;
  return [cabinet.size.width.mm / 2 + (sink?.offset?.mm ?? 0), Math.max(centred, least)];
}

/**
 * Where a sink's bowl hangs under its cabinet's top, in the cabinet's frame: a block from its lowest point up, as wide
 * and as deep as the bowl's outside. Nothing for a vessel or a cabinet with no sink. For what is cut round it inside
 * (`obstacleBlocks`); the top's thickness is a guess.
 */
export function sinkBowlBlock(cabinet: Pick<CabinetDesign, 'size' | 'sink'>): { min: [Mm, Mm, Mm]; max: [Mm, Mm, Mm] } | undefined {
  const sink = cabinet.sink;
  if (!sink || sink.mount === 'vessel') return undefined;
  const [cx, cz] = sinkCentre(cabinet);
  const inset = sink.mount === 'dropIn' || sink.mount === 'integrated' ? sinkInset({ mount: 'dropIn' }) : 0;
  const [w, d] = [sink.width.mm - 2 * inset, sink.depth.mm - 2 * inset];
  // The rim of a drop-in or an integrated top lies on the top; an undermount hangs under it; a farmhouse sink stands
  // on its platform, its body from there up.
  const rimAt = cabinet.size.height.mm + (sink.mount === 'dropIn' || sink.mount === 'integrated' ? SINK.topGuess : 0);
  const bottom = sink.mount === 'farmhouse' ? farmhouseFloor(cabinet) : rimAt - sink.bowlDepth.mm;
  return { min: [cx - w / 2, bottom, cz - d / 2], max: [cx + w / 2, cabinet.size.height.mm, Math.min(0, cz + d / 2)] };
}

/** Tune me: how a sink is drawn. A drop-in's rim round its bowls, and the deck behind them its faucet stands on. */
export const SINK_DRAWN = { lip: 1.25 * IN, deck: 2.5 * IN, divider: 1.5 * IN };

/**
 * A sink as the 3D view draws it (`SinkLook`), in the frame of the part that stands for it: its outside, `width` × `depth`,
 * Z up from `bowlDepth` below the top's surface (a vessel: from the top's surface). `topThick`: the top's thickness,
 * which an undermount sink hangs under. White for a vessel, a top with its sink, a farmhouse sink and a vanity's (under
 * 18" deep); steel for the rest.
 */
export function sinkLook(sink: CabinetSink, topThick: Mm): SinkLook {
  const [W, D, T] = [sink.width.mm, sink.depth.mm, sink.bowlDepth.mm];
  const vanity = D < 18 * IN;
  const colour = sink.mount === 'vessel' || sink.mount === 'integrated' || sink.mount === 'farmhouse' || vanity ? 'white' : 'steel';
  const faucet = (y: Mm, z: Mm) => ({ x: W / 2, y, z, height: vanity || sink.mount === 'integrated' ? 6 * IN : sink.mount === 'vessel' ? 12 * IN : 14 * IN, reach: vanity || sink.mount === 'integrated' ? 4.5 * IN : 8 * IN });
  if (sink.mount === 'vessel') {
    return { colour, shape: sink.shape, vessel: true, bowls: [{ cx: W / 2, cy: D / 2, width: W, depth: D, top: T, floor: 0 }], faucet: faucet(D + 2 * IN, 0) };
  }
  if (sink.mount === 'dropIn') {
    // Inside the rim: a lip at the sides and the front, the deck behind.
    const inner = { width: W - 2 * SINK_DRAWN.lip, depth: D - SINK_DRAWN.lip - SINK_DRAWN.deck };
    const split = sinkBowls({ width: { mm: inner.width, unit: 'mm' }, double: sink.double }, SINK_DRAWN.divider);
    const bowls = split.map((b) => ({ cx: W / 2 + b.x, cy: SINK_DRAWN.lip + inner.depth / 2, width: b.width, depth: inner.depth, top: T, floor: 0 }));
    return { colour, shape: sink.shape, bowls, rim: { width: W, depth: D, z: T }, faucet: faucet(D - SINK_DRAWN.deck / 2, T) };
  }
  if (sink.mount === 'integrated') return { colour, shape: sink.shape, bowls: [{ cx: W / 2, cy: D / 2, width: W, depth: D, top: T, floor: 0 }] };
  // Under the top: each bowl as its opening, its walls from the top's underside.
  const loops = sinkOpenings(sink);
  const bowls = loops.map((loop) => {
    const xs = loop.map((p) => p[0]);
    const zs = loop.map((p) => p[1]);
    return { cx: W / 2 + (Math.min(...xs) + Math.max(...xs)) / 2, cy: D / 2 - (Math.min(...zs) + Math.max(...zs)) / 2, width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), top: sink.mount === 'farmhouse' ? T : T - topThick, floor: 0 };
  });
  // A farmhouse sink's apron: its front, from its top edge down the whole sink's height.
  const apron = sink.mount === 'farmhouse' ? { apron: { width: W, height: apronOf(sink).height, z: T } } : {};
  return { colour, shape: sink.shape, bowls, ...apron, faucet: faucet(D + SINK.faucetBehind, T) };
}

/** A farmhouse sink's apron: its own, else the start's. */
export function apronOf(sink: Pick<CabinetSink, 'apron'>): { height: Mm; proud: Mm } {
  return { height: sink.apron?.height.mm ?? FARMHOUSE.height, proud: sink.apron?.proud.mm ?? FARMHOUSE.proud };
}

/** Whether a cabinet's top row is a farmhouse sink's apron: the sink is one, over a drawer row over doors, on a case made here. */
export function farmhouseRow(cabinet: Pick<CabinetDesign, 'sink' | 'form' | 'existing' | 'layout'>): boolean {
  const rows = cabinet.layout.rows;
  return cabinet.sink?.mount === 'farmhouse' && cabinet.form === 'base' && !cabinet.existing && rows[0]?.use === 'drawer' && rows[1]?.use === 'doors' && !(rows[0].split && rows[0].split > 1);
}

/**
 * How tall the top row is under a farmhouse sink's apron: from where the sink stands (the top's surface, a guess at its
 * thickness over the case, less the sink's height) up to the top of the openings (`openingsTop`). 2" at the least.
 */
export function apronRowHeight(cabinet: Pick<CabinetDesign, 'size' | 'sink'>, openingsTop: Mm): Mm {
  const { height } = apronOf(cabinet.sink ?? {});
  return Math.max(2 * IN, height - SINK.topGuess - (cabinet.size.height.mm - openingsTop));
}

/** Where a farmhouse sink stands in its cabinet: the top of the platform it sits on, above the floor (the top's thickness a guess). */
export function farmhouseFloor(cabinet: Pick<CabinetDesign, 'size' | 'sink'>): Mm {
  return cabinet.size.height.mm + SINK.topGuess - apronOf(cabinet.sink ?? {}).height;
}

/** A bought top with its sink in it is drawn white (cultured marble): its part's id, and its colour. */
export const isSinkTop = (partId: string): boolean => partId.endsWith('/sink-top-shown');
export const SINK_TOP_COLOUR = 0xf1f0ea;

/** The sink in a few words: "Drop-in sink, 33" × 22", two bowls". */
export function sinkWords(sink: CabinetSink, length: (mm: Mm) => string): string {
  const kind = { dropIn: 'Drop-in sink', undermount: 'Undermount sink', vessel: 'Vessel sink', integrated: 'Top with its sink', farmhouse: 'Farmhouse sink' }[sink.mount];
  return `${kind}, ${length(sink.width.mm)} × ${length(sink.depth.mm)}${sink.double ? ', two bowls' : ''}`;
}
