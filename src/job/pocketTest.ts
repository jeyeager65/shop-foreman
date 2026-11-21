/**
 * A scrap test for CNC-assisted pocket holes (feature doc, "Shop test plan"): pockets along
 * the front edge of a piece of scrap, to drill from the edge with the printed guide and
 * screw to another piece.
 *
 * Two pockets alike, with the seat where a job puts it (three seat distances were cut side
 * by side before). Two, because a joint
 * with one screw turns.
 *
 * What cuts them is a choice, to compare: the 1/8" ball nose a job
 * uses, or a 1/8" flat end mill (`pocketSlot`); and either with a ledge round the opening for
 * a printed cover (`jigs/pocketCover.ts`). The ledge is always the flat end mill's, round the
 * ball nose's pocket too: a ball cannot cut a flat one. Or every kind side by side, one pocket
 * of each: the ball nose's and the end mill's, without the ledge and with it.
 *
 * And a low-angle pocket (after Castle's machines): the screw at 3 or at 6 degrees, the
 * pocket a slot with an arced floor (`pocketArc`), cut with the widest flat end mill the bore takes. Two
 * alike, or two of each angle side by side; either with a ledge for a printed cover, cut with the same bit.
 *
 * The scrap's own front edge is the edge the screws leave through, so nothing is cut
 * out: the bit is jogged to the scrap's front-left corner as for any job.
 */
import { pocketArc, pocketChannel, pocketLedge, pocketSlot, screwChannel } from '@/cam/cuts';
import { Path, runTime } from '@/cam/path';
import { LOW_POCKET, type LowAngle, POCKET, arcLedge, arcShape, lowCoverFits, pocketShape, slotLedge, slotShape } from '@/geometry/pocketHole';
import type { Id, Mm, SetupProgram, Shop, Tool, ToolpathStep } from '@/model';
import { activeMachine, cutDiameter, cuttingLengthOf, isBallNose, toolSettings } from '@/plan';
import { writeFluidNC } from '@/post/fluidnc';

/** Tune me. */
export const POCKET_TEST = {
  /** The least scrap the test needs, front to back; its length follows from the pockets. */
  stock: { y: 100 },
  /** Scrap left past the last pocket. */
  margin: 50,
  /** The first pocket's centre from the scrap's left end, and the gap to the next. */
  first: 70,
  spacing: 40,
  /** How many pockets a test starts with, alike; and the most it may have. */
  count: 2,
  most: 6,
  /** The smallest flat end mill worth cutting a pocket with. */
  smallestEndMill: 3,
};

export const POCKET_TEST_FILE = 'pocket-hole-test.gcode';

/** A pocket of the test: what cuts it, and whether it has the ledge for a cover. */
export interface PocketKind {
  /** `arc`: a low-angle pocket with an arced floor, at `angleDeg`. */
  bit: 'ball' | 'flat' | 'arc';
  ledge: boolean;
  /** A 15° pocket's ledge cut with this end mill (its corners the bit's radius; the cover drawn to suit). Left out: the flat end mill. */
  ledgeBitId?: Id;
  angleDeg?: LowAngle;
  /** A low-angle pocket's seat from the edge, when it is not the usual one. */
  seat?: Mm;
  /**
   * The screw's way cut open from the face, a channel as wide as the pilot along the screw from the seat out through
   * the edge (`screwChannel`), in place of the pilot drilled from the edge with the guide: nothing is drilled.
   */
  channel?: boolean;
}

/** The low-angle pockets side by side: two at each angle. */
export const LOW_KINDS: PocketKind[] = [
  { bit: 'arc', ledge: false, angleDeg: 3 },
  { bit: 'arc', ledge: false, angleDeg: 3 },
  { bit: 'arc', ledge: false, angleDeg: 6 },
  { bit: 'arc', ledge: false, angleDeg: 6 },
];

/** Every kind, in the order they are cut side by side. */
export const POCKET_KINDS: PocketKind[] = [
  { bit: 'ball', ledge: false },
  { bit: 'ball', ledge: true },
  { bit: 'flat', ledge: false },
  { bit: 'flat', ledge: true },
];

export interface PocketTest {
  name: string;
  text: string;
  /** The stock thickness the test is written for. */
  thickness: Mm;
  /** One per pocket, left to right: its centre along the edge, its kind, and how long it takes to cut (its ledge with it). */
  pockets: (PocketKind & { x: Mm; seconds: number })[];
  /** The bits it is cut with, in the order they are used. */
  tools: { toolId: Id; name: string }[];
  /** Every pocket's seat, from the edge along the screw, and the deepest any goes below the face. */
  seat: Mm;
  depth: Mm;
  /** The scrap the file is written for, at least. */
  stock: { x: Mm; y: Mm };
  /** How far the pilot bit stands out of the drill's chuck, which stops against the guide. */
  bitOutOfChuck: Mm;
}

/** A flat end mill that can cut a pocket: not too small to be worth it, and no wider than half the pocket (its corners would take the seat). */
const isPocketEndMill = (tool: Tool) => tool.shape.kind === 'endMill' && cutDiameter(tool) >= POCKET_TEST.smallestEndMill && cutDiameter(tool) <= POCKET.bore / 2;

/** The flat end mill a low-angle pocket is cut with: the widest the bore takes, as a pocket machine's bit fills its pocket. */
export function lowPocketBit(shop: Pick<Shop, 'tools'>, materialId?: Id): Tool | undefined {
  return shop.tools
    .filter((t) => t.shape.kind === 'endMill' && cutDiameter(t) >= POCKET_TEST.smallestEndMill && cutDiameter(t) <= POCKET.bore + 1e-9)
    .filter((t) => !materialId || t.settings[materialId])
    .sort((a, b) => cutDiameter(b) - cutDiameter(a))[0];
}

/** The flat end mill a screw channel is cut with: the widest no wider than the pilot (two passes of a 1/8" one, for a 4 mm pilot). */
export function channelBit(shop: Pick<Shop, 'tools'>, materialId?: Id): Tool | undefined {
  return shop.tools
    .filter((t) => t.shape.kind === 'endMill' && cutDiameter(t) <= POCKET.drill + 1e-9 && cutDiameter(t) >= 2)
    .filter((t) => !materialId || t.settings[materialId])
    .sort((a, b) => cutDiameter(b) - cutDiameter(a))[0];
}

/** The shop's bits that can cut the test's pockets: its ball noses first (a job's bit), then its flat end mills, smallest first. */
export function pocketTestBits(shop: Pick<Shop, 'tools'>): Tool[] {
  const ball = shop.tools.filter(isBallNose).filter((t) => cutDiameter(t) < POCKET.bore);
  const flat = shop.tools.filter(isPocketEndMill).sort((a, b) => cutDiameter(a) - cutDiameter(b));
  return [...ball, ...flat];
}

/** How long the scrap must be for a machine: the first pocket clear of the probe's corner, then every pocket and a margin. */
export function pocketTestStock(machine: { probe: { edgeInset: Mm; clearSquare: Mm } }, pockets: number = POCKET_TEST.count): { x: Mm; y: Mm; first: Mm } {
  const first = Math.max(POCKET_TEST.first, machine.probe.edgeInset + machine.probe.clearSquare + 20);
  return { x: first + (pockets - 1) * POCKET_TEST.spacing + POCKET_TEST.margin, y: POCKET_TEST.stock.y, first };
}

/**
 * The test file for one material. `kinds`: the pockets, left to right (left out: two as a job cuts them,
 * with the ball nose and no ledge).
 */
export function buildPocketTest(shop: Shop, materialId: Id, kinds: PocketKind[] = Array.from({ length: POCKET_TEST.count }, () => ({ bit: 'ball' as const, ledge: false })), bitId?: Id): PocketTest {
  const machine = activeMachine(shop);
  const material = shop.materials.find((m) => m.id === materialId);
  if (!material) throw new Error(`Material not found: ${materialId}`);
  if (!kinds.length) throw new Error('The test has no pockets.');
  const offered = pocketTestBits(shop).filter((t) => t.settings[materialId]);
  // The bit chosen for the scrap cuts its pockets: a ball nose, a narrow end mill, or (low angle) a wide one.
  const chosen = bitId ? shop.tools.find((t) => t.id === bitId && t.settings[materialId]) : undefined;
  const ball = chosen && isBallNose(chosen) ? chosen : offered.find(isBallNose);
  const flat = chosen && !isBallNose(chosen) && isPocketEndMill(chosen) ? chosen : offered.find((t) => !isBallNose(t));
  if (kinds.some((k) => k.bit === 'ball') && !ball) throw new Error(`No ball nose bit in the shop profile has settings for ${material.name}.`);
  const wide = kinds.some((k) => k.bit === 'arc') ? (chosen && chosen.shape.kind === 'endMill' && cutDiameter(chosen) <= POCKET.bore + 1e-9 ? chosen : lowPocketBit(shop, materialId)) : undefined;
  if (kinds.some((k) => k.bit === 'arc') && !wide) throw new Error(`No flat end mill in the shop profile can cut a low-angle pocket in ${material.name}: it takes one no wider than the pocket.`);
  for (const kind of kinds) if (kind.bit === 'arc' && kind.ledge && !lowCoverFits(material.measuredThickness.mm, kind.angleDeg ?? 3, kind.seat)) throw new Error(`${material.name} is too thin for a cover over a low-angle pocket: the screw's head comes up nearly to the face.`);
  // A 15° pocket's ledge is cut with its own end mill (the 1/8" or the 1/4", its corners the bit's radius), else the flat end mill;
  // a low-angle pocket's with the bit that cut the pocket.
  const ledgeTool = (k: PocketKind): Tool | undefined => (k.bit === 'arc' ? wide : (k.ledgeBitId ? shop.tools.find((t) => t.id === k.ledgeBitId && t.settings[materialId]) : undefined) ?? flat);
  const needsFlat = (k: PocketKind) => k.bit === 'flat' || (k.bit === 'ball' && k.ledge && !k.ledgeBitId);
  if (kinds.some(needsFlat) && !flat) throw new Error(`No flat end mill in the shop profile can cut a pocket or its ledge in ${material.name}: it takes one no wider than half the pocket.`);
  if (kinds.some((k) => k.ledge && k.bit !== 'arc' && !ledgeTool(k))) throw new Error(`The end mill chosen for a ledge has no settings for ${material.name}.`);
  // A channel is cut with the scrap's own bit where it is no wider than the pilot, else with the narrowest end mill that is.
  const narrow = kinds.some((k) => k.channel) ? (chosen && cutDiameter(chosen) <= POCKET.drill + 1e-9 ? chosen : channelBit(shop, materialId)) : undefined;
  if (kinds.some((k) => k.channel) && !narrow) throw new Error(`No flat end mill in the shop profile can cut a screw's channel in ${material.name}: it takes one no wider than the ${POCKET.drill} mm pilot.`);
  const thickness = material.measuredThickness.mm;
  const feedsOf = (tool: Tool) => {
    const s = toolSettings(tool, materialId);
    return { feed: s.feed, plunge: Math.min(s.plungeFeed, machine.maxPlungeFeed), depthPerPass: s.depthPerPass, stepover: s.stepover, finish: 0 };
  };
  // Only the shapes the test's pockets have: a low-angle test asks nothing of the ball nose.
  const round = ball && kinds.some((k) => k.bit === 'ball') ? pocketShape(thickness, cutDiameter(ball)) : undefined;
  const slot = flat && kinds.some(needsFlat) ? slotShape(thickness, cutDiameter(flat)) : undefined;
  /** A 15° pocket's ledge opening: the same whatever bit cuts it (only its corners are the bit's). */
  const ledgeOpening = slotLedge(slotShape(thickness, Math.min(POCKET.bore / 2, flat ? cutDiameter(flat) : 3.175)));
  if ((round && !round.fits) || (slot && !slot.fits)) throw new Error(`${material.name} is too thin for a pocket hole.`);
  const arcOf = (kind: PocketKind) => arcShape(thickness, cutDiameter(wide!), kind.angleDeg ?? 3, kind.seat);
  for (const kind of kinds.filter((k) => k.bit === 'arc')) {
    const arc = arcOf(kind);
    if (arc.seat < LOW_POCKET.seatRange.min || arc.seat > LOW_POCKET.seatRange.max) throw new Error(`A low-angle pocket's seat is ${LOW_POCKET.seatRange.min} to ${LOW_POCKET.seatRange.max} mm from the edge.`);
    if (!arc.fits) throw new Error(`${material.name} is too thin for a low-angle pocket: it goes ${arc.depth.toFixed(1)} mm deep.`);
    const reach = cuttingLengthOf(wide!)?.mm;
    if (reach !== undefined && reach < arc.depth - 1e-9) throw new Error(`The ${wide!.name} cuts ${reach.toFixed(1)} mm deep and a low-angle pocket in ${material.name} goes ${arc.depth.toFixed(1)} mm deep.`);
  }

  const stock = pocketTestStock(machine, kinds.length);
  const half = machine.probe.edgeInset + machine.probe.clearSquare / 2;
  const spot = { x: half, y: half };
  const pockets = kinds.map((kind, i) => ({ ...kind, x: stock.first + i * POCKET_TEST.spacing, seconds: 0 }));
  // Every 15 degree pocket has its seat in one place; a low-angle pocket has its own, the same in every stock.
  const seatOf = (kind: PocketKind) => (kind.bit === 'arc' ? arcOf(kind).seat : POCKET.seatShare * thickness);
  const seat = seatOf(kinds[0]!);
  const steps: ToolpathStep[] = [];
  const tools: Tool[] = [];
  /** One bit's work: for each pocket it has something to cut at, a comment and that cut. */
  const work = (tool: Tool | undefined, cut: (pocket: (typeof pockets)[number], path: Path) => boolean, what: (count: number) => string) => {
    if (!tool) return;
    const made: ToolpathStep[] = [];
    let seconds = 0;
    let count = 0;
    pockets.forEach((pocket, i) => {
      const path = new Path(machine.safeHeight);
      if (!cut(pocket, path)) return;
      const run = runTime(path.steps, machine.rapidFeed, { ...spot, z: machine.safeHeight }).seconds;
      pocket.seconds += run;
      seconds += run;
      count += 1;
      made.push({ kind: 'comment', text: `Pocket ${i + 1} of ${pockets.length}: seat ${seatOf(pocket).toFixed(1)} mm from the edge` }, ...path.steps);
    });
    if (!count) return;
    // The same bit straight after itself (a channel cut with the bit that cut the pockets): no change, no probing.
    if (tools.at(-1) !== tool) {
      tools.push(tool);
      steps.push({ kind: 'toolChange', toolId: tool.id });
    }
    steps.push({ kind: 'operation', label: `Pocket-hole test: ${what(count)}`, seconds }, ...made);
  };
  const exit = (pocket: { x: Mm }) => ({ x: pocket.x, y: 0 });
  const inward = { x: 0, y: 1 };
  const onlyBall = kinds.every((k) => k.bit === 'ball' && !k.ledge);
  /** A 15° pocket whose ledge is cut on its own, before the pocket: round a ball nose's, or round a slot cut with another bit. */
  const ledgeApart = (k: PocketKind) => k.ledge && k.bit !== 'arc' && !(k.bit === 'flat' && ledgeTool(k) === flat);
  // First the ledges cut with a bit of their own (the pockets are then cut down through them): each bit once.
  for (const tool of [...new Set(kinds.filter(ledgeApart).map(ledgeTool))].filter((t): t is Tool => !!t && t !== flat)) {
    work(
      tool,
      (pocket, path) => {
        if (!ledgeApart(pocket) || ledgeTool(pocket) !== tool) return false;
        pocketLedge(path, exit(pocket), inward, ledgeOpening, cutDiameter(tool) / 2, feedsOf(tool), true);
        return true;
      },
      (count) => `${count === 1 ? 'a ledge' : `${count} ledges`}, ${tool.name.replace(/"/g, ' in')}`,
    );
  }
  // The flat end mill: its own pockets (their ledges with them, where it cuts those too), and the ledges it cuts round others.
  work(
    flat,
    (pocket, path) => {
      if (pocket.bit === 'flat') pocketSlot(path, exit(pocket), inward, slot!, feedsOf(flat!), pocket.ledge && ledgeTool(pocket) === flat);
      else if (pocket.bit === 'ball' && pocket.ledge && ledgeTool(pocket) === flat) pocketLedge(path, exit(pocket), inward, ledgeOpening, cutDiameter(flat!) / 2, feedsOf(flat!), true);
      else return false;
      return true;
    },
    () => `${flat!.name.replace(/"/g, ' in')}`,
  );
  // The low-angle pockets, with the widest end mill the bore takes.
  work(
    wide,
    (pocket, path) => {
      if (pocket.bit !== 'arc') return false;
      pocketArc(path, exit(pocket), inward, arcOf(pocket), feedsOf(wide!));
      // Its ledge with the same bit, once the pocket is cut: the arc's end is shallower than the ledge, so it is filled.
      if (pocket.ledge) pocketLedge(path, exit(pocket), inward, arcLedge(thickness, pocket.angleDeg ?? 3, arcOf(pocket).seat), cutDiameter(wide!) / 2, feedsOf(wide!), true);
      return true;
    },
    (count) => (kinds.every((k) => k.bit === 'arc') ? `${count} low-angle pockets` : `low angle, ${wide!.name.replace(/"/g, ' in')}`),
  );
  work(
    ball,
    (pocket, path) => {
      if (pocket.bit !== 'ball') return false;
      pocketChannel(path, exit(pocket), inward, round!, feedsOf(ball!));
      return true;
    },
    (count) => (onlyBall ? `${count} pockets` : `${ball!.name.replace(/"/g, ' in')}`),
  );
  // Last, once each pocket is open: the screw's channel from its seat out through the edge, where it has one.
  work(
    narrow,
    (pocket, path) => {
      if (!pocket.channel) return false;
      screwChannel(path, exit(pocket), inward, { thickness, angleDeg: pocket.bit === 'arc' ? (pocket.angleDeg ?? 3) : POCKET.angleDeg, seat: seatOf(pocket) }, cutDiameter(narrow!) / 2, feedsOf(narrow!));
      return true;
    },
    (count) => `${count === 1 ? 'the screw channel' : `${count} screw channels`}, ${narrow!.name.replace(/"/g, ' in')}`,
  );

  const program: SetupProgram = {
    setup: { index: 1, faceUp: 'A', flipBefore: 'none', operationKeys: [], placements: [], pinHoles: [], probeSpot: { at: spot } },
    blank: { id: 'test', index: 1, count: 1, label: 'Scrap', setupCount: 1 },
    materialId,
    faces: { summary: 'front face up', mixed: false, groups: [] },
    fileName: POCKET_TEST_FILE,
    stock: { x: stock.x, y: stock.y, z: thickness },
    toolIds: tools.map((t) => t.id),
    steps,
    endMessage: kinds.every((k) => k.channel) ? 'Pocket-hole test done. Nothing to drill: screw them up.' : 'Pocket-hole test done. Drill each pilot from the edge with the guide.',
  };
  return {
    name: POCKET_TEST_FILE,
    text: writeFluidNC(program, machine, shop.tools, { project: { name: 'Pocket-hole test (untested experiment)' } }),
    thickness,
    pockets,
    tools: tools.map((t) => ({ toolId: t.id, name: t.name })),
    seat,
    // (A screw channel goes deepest at the edge: half the stock and half the pilot.)
    depth: Math.max(...pockets.map((p) => Math.max(p.bit === 'arc' ? arcOf(p).depth : p.bit === 'flat' ? slot!.depth : round!.depth, p.channel ? thickness / 2 + POCKET.drill / 2 : 0))),
    stock: { x: stock.x, y: stock.y },
    // How far the bit stands out follows the seat (the first pocket's, when the kinds are mixed).
    bitOutOfChuck: POCKET.guideOutside + seat + POCKET.through,
  };
}
