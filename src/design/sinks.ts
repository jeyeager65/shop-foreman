/**
 * A sink over a base cabinet (`CabinetSink`): its sizes, the opening it needs in the top over the cabinet, and where it
 * sits. It is the cabinet's, not the room's: a vanity on its own has one as a kitchen's sink base does, and the top
 * over the cabinet takes its opening wherever that top comes from (a run's, the cabinet's own, an island's).
 *
 * In the sink's own frame X runs across it to the right and Z toward the front, its centre at 0, 0.
 */
import type { CabinetDesign, CabinetSink, Mm, SinkMount } from '@/model';
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
 * The opening a sink needs through its top, in its own frame: inside its rim or its flange, or a vessel's drain. An
 * integrated sink needs none (its top is the sink's). Empty: none.
 */
export function sinkOpening(sink: CabinetSink): [Mm, Mm][] {
  if (sink.mount === 'integrated') return [];
  if (sink.mount === 'vessel') return roundedOutline(SINK.drain, SINK.drain, 'oval');
  const inset = sinkInset(sink);
  return roundedOutline(sink.width.mm - 2 * inset, sink.depth.mm - 2 * inset, sink.shape, SINK.corner - inset);
}

/**
 * Where a sink's centre is in its cabinet's frame: across, the cabinet's middle moved by its offset; front to back, the
 * middle of what lies between the cabinet's back and the front edge of the top over it (`front`, in the cabinet's
 * frame; left out, a guess at it).
 */
export function sinkCentre(cabinet: Pick<CabinetDesign, 'size' | 'sink'>, front: Mm = SINK.frontGuess): [Mm, Mm] {
  return [cabinet.size.width.mm / 2 + (cabinet.sink?.offset?.mm ?? 0), (front - cabinet.size.depth.mm) / 2];
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
  // The rim of a drop-in or an integrated top lies on the top; an undermount or a farmhouse sink hangs under it.
  const rimAt = cabinet.size.height.mm + (sink.mount === 'dropIn' || sink.mount === 'integrated' ? SINK.topGuess : 0);
  const bottom = rimAt - sink.bowlDepth.mm;
  return { min: [cx - w / 2, bottom, cz - d / 2], max: [cx + w / 2, cabinet.size.height.mm, Math.min(0, cz + d / 2)] };
}

/** The sink in a few words: "Drop-in sink, 33" × 22", two bowls". */
export function sinkWords(sink: CabinetSink, length: (mm: Mm) => string): string {
  const kind = { dropIn: 'Drop-in sink', undermount: 'Undermount sink', vessel: 'Vessel sink', integrated: 'Top with its sink', farmhouse: 'Farmhouse sink' }[sink.mount];
  return `${kind}, ${length(sink.width.mm)} × ${length(sink.depth.mm)}${sink.double ? ', two bowls' : ''}`;
}
