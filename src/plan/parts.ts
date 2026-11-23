/**
 * How each part is cut out of its stock, and what else is done to it: the CNC, the
 * table saw, or a circular saw along a straightedge. The planner suggests one from
 * the shop profile and the user can change it. Nothing here changes a part. A part
 * the CNC works on (dados, a rabbet, a groove, holes) is cut out on the CNC and is
 * offered nothing else; a saw-cut part gains the hand steps the CNC would have done.
 *
 * A part longer than the machine's cutting area (a tall cabinet's side) cannot be cut
 * there at all: it is cut on a saw, and its joints and holes are made by hand, with a
 * router and a drill. The job's lists say where each goes.
 */
import type { PocketCoverWhere, CutMethod, Feature, Id, JigInstance, Operation, Part, PartPlan, PlanChoices, PocketDrilling, PocketHoleMethod, PocketSleeve, ResolvedPlan, Shop, PocketLook, Tool } from '@/model';
import { baseId } from '@/design/tags';
import { LOW_POCKET, type LowAngle, POCKET, arcShape, bitOutOfChuck, boreOutside, guideThickness, pocketShape, sleeveParams } from '@/geometry/pocketHole';
import { asRect } from '@/geometry/rect';

const EPS = 1e-6;
/** The ball the pockets are taken to be cut with until the plan has picked a bit: 1/8". */
const DEFAULT_BALL = 3.175;

/** Solid-wood parts: cut from boards, so ripped to width and cut to length, never nested on a sheet. */
const BOARD_ROLES = new Set<Part['role']>(['frameStile', 'frameRail', 'buildOut', 'topEdge', 'caseEdge', 'leg']);

export const isBoardPart = (part: Part): boolean => BOARD_ROLES.has(part.role);
/** Doors and drawer fronts: no role. Their work is the plan's operations, all on the CNC. */
const isFront = (part: Part): boolean => part.role === undefined;

export const pocketHoleMethod = (choices: Pick<PlanChoices, 'pocketHoles'>): PocketHoleMethod => choices.pocketHoles ?? 'kregJig';
/** The angle of a low-angle method's pockets; nothing for the others. */
export const lowAngleOf = (method: PocketHoleMethod): LowAngle | undefined => (method === 'lowAngle3' ? 3 : method === 'lowAngle6' ? 6 : undefined);
/** Where the project asks for covers over its pocket holes; none where the CNC does not cut the pockets (the Kreg jig). */
export const pocketCoversOf = (choices: Pick<PlanChoices, 'pocketHoles' | 'pocketCovers'>): PocketCoverWhere[] =>
  cncCutsPockets(pocketHoleMethod(choices)) ? (choices.pocketCovers ?? []) : [];
/**
 * Whether a pocket hole in a face gets a cover: every one, or by how the face is seen and whether the part is a
 * drawer box's. A face that is hidden once the piece is built gets none unless every pocket does.
 */
export function pocketCovered(where: PocketCoverWhere[], seen: 'shows' | 'inside' | 'hidden', inDrawer: boolean): boolean {
  if (where.includes('all')) return true;
  if (seen === 'shows') return where.includes('outside');
  if (seen === 'inside') return where.includes(inDrawer ? 'inDrawer' : 'behindDoor');
  return false;
}
/** Whether the CNC cuts the pockets of the parts it cuts out: every method but the Kreg jig. */
export const cncCutsPockets = (method: PocketHoleMethod): boolean => method !== 'kregJig';
/** How much longer than its pocket a part has to be, from the edge the screw leaves by. */
const LOW_POCKET_BEYOND = 3;
/**
 * Whether every pocket hole of the part can be a low-angle pocket: the stock thick enough to leave a floor under
 * it, and the part long enough from the edge for the pocket's arc to come up to the face. Worked out for the
 * widest bit that cuts one (the bore's width), so the answer does not wait for the bit the plan picks: a
 * narrower bit's pocket is a little shorter and fits wherever this one does.
 */
export function lowPocketsFit(part: Part, low: number, seat: number): boolean {
  const shape = arcShape(part.size.thickness, POCKET.bore, low, seat);
  if (!shape.fits) return false;
  return part.features.every((f) => f.kind !== 'pocketHole' || (f.edge === 'x0' || f.edge === 'x1' ? part.size.width : part.size.height) - (f.inset ?? 0) >= shape.end + LOW_POCKET_BEYOND);
}
/**
 * Whether the CNC cuts the pocket holes of a part it cuts out, in a job with these choices. Not with the Kreg
 * jig as the job's method; and not, with a low-angle method, in a part too thin or too short for that pocket:
 * all of that part's pocket holes go to the Kreg jig (its steps, the Kreg list and its screws say so), as a
 * part cut out on a saw has them.
 */
export function cncPocketsFit(part: Part, choices: Pick<PlanChoices, 'pocketHoles' | 'pocketSeat'>): boolean {
  const method = pocketHoleMethod(choices);
  if (!cncCutsPockets(method)) return false;
  const low = lowAngleOf(method);
  return !low || lowPocketsFit(part, low, pocketSeatOf(choices));
}

/**
 * The parts with how their pocket holes are to be drawn (`Part.pocketLook`), on copies: a part the CNC cuts
 * out has the job's kind of pocket, a part cut out on a saw the Kreg jig's, whatever the job's kind is.
 * `plans`: the job's part plans; before the job is planned every part is taken as cut out on the CNC.
 * `ledges`: the job's pockets with a ledge for a printed cover (`pocketLedgesOf`), drawn cut round them.
 */
export function withPocketLooks(parts: Part[], choices: Pick<PlanChoices, 'pocketHoles' | 'pocketSeat'>, plans?: Pick<PartPlan, 'partId' | 'cutOut'>[], ledges?: PocketLedgeLook[]): Part[] {
  const method = pocketHoleMethod(choices);
  if (!cncCutsPockets(method)) return parts;
  const low = lowAngleOf(method);
  const look: PocketLook = low ? { kind: 'low', angleDeg: low, seat: pocketSeatOf(choices) } : { kind: 'cnc' };
  return parts.map((part) => {
    if (!part.features.some((f) => f.kind === 'pocketHole')) return part;
    const planned = plans?.find((p) => p.partId === part.id);
    if ((planned && planned.cutOut !== 'cnc') || !cncPocketsFit(part, choices)) return part;
    const mine = ledges?.filter((l) => l.partId === part.id) ?? [];
    return { ...part, pocketLook: mine.length ? { ...look, ledges: { featureIds: mine.map((l) => l.featureId), r: mine[0]!.r } } : look };
  });
}

/** A pocket hole with a ledge round it, and the radius of the bit that cuts the ledge. */
export type PocketLedgeLook = { partId: Id; featureId: Id; r: number };

/** The pockets a job cuts a ledge round (its `pocketLedge` rows), for the 3D view and the blanks' pictures. */
export function pocketLedgesOf(operations: Pick<Operation, 'kind' | 'source' | 'clearToolId'>[], tools: Pick<Tool, 'id' | 'shape'>[]): PocketLedgeLook[] {
  return operations.flatMap((o) => {
    if (o.kind !== 'pocketLedge' || o.source.kind !== 'features') return [];
    const bit = tools.find((t) => t.id === o.clearToolId);
    // (A ledge is a flat end mill's, which has a diameter; 1/4" until the row has a bit.)
    const r = (bit && 'diameter' in bit.shape ? bit.shape.diameter.mm : 6.35) / 2;
    return o.source.refs.map((ref) => ({ ...ref, r }));
  });
}

/** A low-angle pocket's seat from the edge in this job: the plan's, kept within what a pocket can have. */
export const pocketSeatOf = (choices: Pick<PlanChoices, 'pocketSeat'>): number =>
  Math.min(LOW_POCKET.seatRange.max, Math.max(LOW_POCKET.seatRange.min, choices.pocketSeat?.mm ?? LOW_POCKET.seat));

const count = (part: Part, test: (f: Feature) => boolean) => part.features.filter(test).length;
const isRecess = (f: Feature) => f.kind === 'dado';
export const isRabbet = (f: Feature) => isRecess(f) && f.id.includes('rabbet');
export const isGroove =(f: Feature) => isRecess(f) && f.id.includes('groove');
const isBore = (f: Feature) => f.kind === 'hole' || f.kind === 'cup';
/** A joint's slot for a tab (`src/design/tabs.ts`): a recess, or an opening through the part. */
const isTabSlot = (f: Feature) => f.id.startsWith('tab-slot-');
/** Whether a joint's tabs or slots are cut in the part: only the CNC makes them. */
export const hasTabJoint = (part: Part): boolean => !!part.tabbed || part.features.some(isTabSlot);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** True when the part's outline is not a plain rectangle: a case side with its toe-kick notch, a drawer front with its finger pull. A corner cabinet's shaped part is not notched: its whole outline is its shape. */
export function isNotched(part: Part): boolean {
  return !part.shaped && part.features.some((f) => f.kind === 'cutout' && !asRect(f.outline));
}

/** What the CNC has to do on the part's faces, as words for a sentence. Empty for a plain rectangle. */
function cncWork(part: Part, pockets: PocketHoleMethod): string[] {
  const work: string[] = [];
  const dados = count(part, (f) => isRecess(f) && !isRabbet(f) && !isGroove(f) && !isTabSlot(f));
  if (dados) work.push(plural(dados, 'a dado', 'dados'));
  if (part.tabbed) work.push('its tabs');
  const tabSlots = count(part, isTabSlot);
  if (tabSlots) work.push(plural(tabSlots, 'a slot for a tab', 'slots for tabs'));
  const rabbets = count(part, isRabbet);
  if (rabbets) work.push(plural(rabbets, 'a rabbet', 'rabbets'));
  const grooves = count(part, isGroove);
  if (grooves) work.push(plural(grooves, 'a groove', 'grooves'));
  const slots = count(part, (f) => f.kind === 'slot');
  if (slots) work.push(plural(slots, 'a slot', 'slots'));
  if (count(part, isBore)) work.push('holes');
  if (count(part, (f) => f.kind === 'pocket' || f.kind === 'bevel')) work.push('a panel pocket');
  if (cncCutsPockets(pockets) && count(part, (f) => f.kind === 'pocketHole')) work.push(lowAngleOf(pockets) ? 'low-angle pocket holes' : 'CNC-assisted pocket holes');
  // An opening through it (a sink's in a top).
  const openings = count(part, (f) => f.kind === 'cutout' && !!f.inside && !isTabSlot(f));
  if (openings) work.push(plural(openings, 'an opening', 'openings'));
  return work;
}

const list = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** The hole rows on a part, named by what they are for (the feature ids say). */
export const HOLE_NAMES: [prefix: string, one: string, many: string][] = [
  ['shelf-pin', 'Shelf-pin hole', 'Shelf-pin holes'],
  ['hinge-plate', 'Hinge plate hole', 'Hinge plate holes'],
  ['slide-screw', 'Slide screw pilot hole', 'Slide screw pilot holes'],
  ['front-screw', 'Front screw hole', 'Front screw holes'],
  ['case-screw', 'Case screw hole', 'Case screw holes'],
  ['handle', 'Handle hole', 'Handle holes'],
  ['finger-pull', 'Finger hole', 'Finger holes'],
  ['caster-screw', 'Caster screw pilot hole', 'Caster screw pilot holes'],
];

/** The size of what the machine can cut: across X and along Y. `tileLength`: how long a sheet may be when Y is a soft limit and long blanks are tiled. */
export type CuttingArea = { width: number; height: number; tileLength?: number; /** The largest piece of stock on hand, when known: a shaped part bigger than it goes to the saw. */ stock?: { width: number; height: number } };

/**
 * Whether the part is too long for the cutting area but can be cut in two set-ups
 * along Y: it fits across X, and a sheet as long as it may hang over the table's ends.
 */
export function needsTiling(part: Part, area: CuttingArea | undefined): boolean {
  if (!area?.tileLength || !tooBigToCut(part, area)) return false;
  const [short, long] = [Math.min(part.size.width, part.size.height), Math.max(part.size.width, part.size.height)];
  return short <= area.width + EPS && long <= area.tileLength + EPS;
}

/** Whether the part is bigger than the machine can cut, whichever way round it lies. */
export function tooBigToCut(part: Part, area: CuttingArea | undefined): boolean {
  if (!area) return false;
  const [short, long] = [Math.min(part.size.width, part.size.height), Math.max(part.size.width, part.size.height)];
  return short > Math.min(area.width, area.height) + EPS || long > Math.max(area.width, area.height) + EPS;
}

/** The steps of a saw-cut part that the CNC would have done: marked so the lists can say where each goes. */
export const BY_ROUTER = ' (router and straightedge)';
export const BY_DRILL = ' (drilled by hand)';

function steps(part: Part, cutOut: CutMethod, choices: Pick<PlanChoices, 'pocketHoles' | 'pocketSeat'>, shop: Pick<Shop, 'saws'>): PartPlan['steps'] {
  // A front's work is the plan's operations. One with a finger notch in its edge names that, so it is not missed.
  if (isFront(part)) return isNotched(part) ? [{ label: 'Finger pull notch, cut with the outline', by: 'cnc' }] : [];
  const out: PartPlan['steps'] = [];
  // A shaped part on a saw: its angles, then its inside corner, to the outline marked from the drawing.
  if (part.shaped && cutOut !== 'cnc') {
    out.push({ label: 'Angles cut to the outline', by: 'tableSaw' });
    const cut = part.features.find((f) => f.kind === 'cutout');
    if (cut?.kind === 'cutout' && cut.outline.length > 5) out.push({ label: 'Inside corner notch', by: 'jigSaw' });
  }
  // An opening through a part cut on a saw (a sink's in a top) is cut by hand, to the sink's own template.
  if (cutOut !== 'cnc' && part.features.some((f) => f.kind === 'cutout' && f.inside && !isTabSlot(f))) out.push({ label: part.role === 'top' ? 'Opening for the sink, cut to its template' : 'Openings through it, cut to the drawing', by: 'jigSaw' });
  // A wooden handle: its shape is the CNC's; the rest is hand work.
  if (part.role === 'handle') {
    return [
      { label: 'Handle shape, cut with the outline', by: 'cnc' },
      { label: 'Round over its edges and sand it', by: 'byHand' },
      { label: 'Drill a pilot hole in each foot, square to it', by: 'byHand' },
    ];
  }
  const sawn = cutOut !== 'cnc';
  // On a saw-cut part the joints are routed and the holes drilled by hand.
  const routed = sawn ? ({ how: BY_ROUTER, by: 'byHand' } as const) : ({ how: '', by: 'cnc' } as const);
  const drilled = sawn ? ({ how: BY_DRILL, by: 'byHand' } as const) : ({ how: '', by: 'cnc' } as const);
  if (sawn && isBoardPart(part) && shop.saws.miterSaw.owned) out.push({ label: 'Cut to length', by: 'miterSaw' });
  // A joint's tabs and slots are the CNC's alone: on a saw-cut part (one too big for the machine) they are not made.
  if (hasTabJoint(part)) out.push({ label: part.tabbed ? 'Tabs on its ends, cut with the outline' : `${count(part, isTabSlot)} ${plural(count(part, isTabSlot), 'slot')} for tabs`, by: sawn ? 'byHand' : 'cnc' });
  if (sawn && isNotched(part) && !part.tabbed) out.push({ label: part.role === 'boxFront' ? 'Finger pull notch' : part.role === 'frameStile' ? 'Notch round the rail' : 'Toe-kick notch', by: 'jigSaw' });
  // A top of a piece's own with a rounded or a chamfered edge: its top arris, all round,
  // with a router by hand once the top is cut out, as a door's outside edges are unless Plan gives them to the CNC.
  for (const f of part.features) {
    if (f.kind !== 'edgeProfile') continue;
    const t = f.treatment;
    out.push({ label: t.kind === 'roundover' ? `Round over its top edge all round, ${Math.round(t.radius * 10) / 10} mm radius, with a router` : `Chamfer its top edge all round, ${Math.round(t.size * 10) / 10} mm, with a router`, by: 'byHand' });
  }
  // The two halves of a French cleat: the strip is ripped down its length with the blade at 45 degrees.
  if (part.role === 'cleat' && !part.id.endsWith('/cleat-spacer') && !part.id.includes('/hub-cleat-')) out.push({ label: '45° bevel along one edge', by: 'tableSaw' });
  // On the CNC a drawer front's finger pull is cut with its outline: named so it is not missed.
  if (!sawn && isNotched(part) && part.role === 'boxFront') out.push({ label: 'Finger pull notch, cut with the outline', by: 'cnc' });

  const dados = count(part, (f) => isRecess(f) && !isRabbet(f) && !isGroove(f) && !isTabSlot(f));
  if (dados) out.push({ label: `${dados} ${plural(dados, 'dado')}${routed.how}`, by: routed.by });
  const rabbets = count(part, isRabbet);
  if (rabbets) out.push({ label: `${rabbets} ${plural(rabbets, 'rabbet')}${routed.how}`, by: routed.by });
  const grooves = count(part, isGroove);
  if (grooves) out.push({ label: `${grooves} ${plural(grooves, 'groove')}${routed.how}`, by: routed.by });

  const slots = count(part, (f) => f.kind === 'slot');
  if (slots) out.push({ label: `${slots} ${plural(slots, 'slot')}${routed.how}`, by: routed.by });

  let named = 0;
  for (const [prefix, one, many] of HOLE_NAMES) {
    const n = count(part, (f) => f.kind === 'hole' && f.id.startsWith(prefix));
    named += n;
    if (n) out.push({ label: `${n} ${plural(n, one, many).toLowerCase()}${drilled.how}`, by: drilled.by });
  }
  const other = count(part, isBore) - named;
  if (other > 0) out.push({ label: `${other} ${plural(other, 'hole')}${drilled.how}`, by: drilled.by });

  const pocketHoles = count(part, (f) => f.kind === 'pocketHole');
  if (pocketHoles) {
    // CNC-assisted only on a part the CNC cuts out: a saw-cut part gets the Kreg jig whatever the job says.
    // And a low-angle pocket only where it fits: a part too thin or too short for one gets the Kreg jig too.
    const prepped = cncPocketsFit(part, choices) && !sawn;
    const noRoom = !sawn && !prepped && !!lowAngleOf(pocketHoleMethod(choices));
    out.push({ label: `${pocketHoles} pocket ${plural(pocketHoles, 'hole')}${noRoom ? ' (too thin or too short for a low-angle pocket)' : ''}`, by: prepped ? 'cnc' : 'kregJig' });
    // The CNC cuts the open part of each pocket; the pilot is drilled from the edge with the printed guide.
    if (prepped) out.push({ label: `Drill ${pocketHoles} ${plural(pocketHoles, 'pilot')} from the edge with the guide`, by: 'byHand' });
  }
  if (part.banding?.edges.length) {
    const n = part.banding.edges.length;
    out.push({ label: part.banding.strip ? `Solid wood strip glued to ${n === 1 ? 'its front edge' : `${n} edges`}` : `Edge banding, ${n} ${plural(n, 'edge')}`, by: 'byHand' });
  }
  return out;
}

/** One part's cut-out method, the reason for the suggestion, what may be chosen, and its other steps. */
export function planPart(part: Part, choices: Pick<PlanChoices, 'parts' | 'pocketHoles' | 'pocketSeat'>, shop: Pick<Shop, 'saws'>, area?: CuttingArea): PartPlan {
  const { tableSaw, circularSaw } = shop.saws;
  // Its pocket holes are the CNC's work only where the CNC can cut them.
  const pockets = cncPocketsFit(part, choices) ? pocketHoleMethod(choices) : 'kregJig';
  // A wooden handle is a shape: only the CNC cuts it.
  if (part.role === 'handle') {
    return { partId: part.id, cutOut: 'cnc', suggested: 'cnc', reason: 'A handle: the CNC cuts its shape out.', options: ['cnc'], steps: steps(part, 'cnc', choices, shop) };
  }
  // So does a corner cabinet's shaped part, a pentagon or an L, when the machine takes it. One bigger than that is cut on
  // a saw to its outline: its angles on the table saw, its inside corner with a jig saw (`steps`).
  if (part.shaped) {
    const sawFor = tableSaw.owned ? 'tableSaw' : circularSaw.owned ? 'circularSaw' : undefined;
    const [short, long] = [Math.min(part.size.width, part.size.height), Math.max(part.size.width, part.size.height)];
    const onStock = !area?.stock || (short <= Math.min(area.stock.width, area.stock.height) + EPS && long <= Math.max(area.stock.width, area.stock.height) + EPS);
    if ((!tooBigToCut(part, area) && onStock) || !sawFor) {
      return { partId: part.id, cutOut: 'cnc', suggested: 'cnc', reason: 'Its outline is not a rectangle: the CNC cuts its shape out.', options: ['cnc'], steps: steps(part, 'cnc', choices, shop) };
    }
    return {
      partId: part.id,
      cutOut: sawFor,
      suggested: sawFor,
      reason: `Its outline is not a rectangle, and it is bigger than ${onStock ? "the machine's cutting area" : 'a sheet'}: cut on the saw to its outline, laid out on the sheet from the drawing.`,
      options: [sawFor],
      steps: steps(part, sawFor, choices, shop),
    };
  }
  // The table saw takes a part whose narrower side fits between the fence and the blade.
  const fitsTableSaw = Math.min(part.size.width, part.size.height) <= tableSaw.ripCapacity.mm + EPS;
  const board = isBoardPart(part);

  // Dados, rabbets, grooves and holes are cut with the part still in its blank, so such
  // a part stays on the CNC. Pocket holes do not hold it there: on a saw they are Kreg.
  // A part too long for the cutting area is tiled where the machine can do that: cut in
  // two set-ups, the sheet slid along Y on pins. A saw, with the work by hand, stays on offer.
  const tiled = !board && !isFront(part) && needsTiling(part, area);
  // A part bigger than the machine can cut at all cannot be cut there, whatever is on it.
  const oversize = !board && !isFront(part) && !tiled && tooBigToCut(part, area);
  const cncOnly = !board && !oversize && !tiled && cncWork(part, 'kregJig').length > 0;

  const options: CutMethod[] = [];
  if (!board && !oversize) options.push('cnc');
  // An egg-crate rib's slots are cut with its outline: only the CNC (a sawn table's ribs are plain).
  // And so are a joint's tabs.
  const slotted = (part.role === 'rib' && isNotched(part)) || !!part.tabbed;
  if (!isFront(part) && !cncOnly && !slotted) {
    if (tableSaw.owned && fitsTableSaw) options.push('tableSaw');
    if (circularSaw.owned) options.push('circularSaw');
  }
  // A shop with no saw at all cuts everything on the CNC.
  if (options.length === 0) options.push('cnc');

  const saw = options.find((m) => m !== 'cnc');
  const tooBig = saw === 'circularSaw' && tableSaw.owned && !fitsTableSaw;
  const sawName = saw === 'tableSaw' ? 'table saw' : 'circular/track saw';
  const work = cncWork(part, pockets);
  let suggested: CutMethod = 'cnc';
  let reason: string;
  if (isFront(part)) {
    reason = 'Fronts are cut out on the CNC with the rest of their work.';
  } else if (board) {
    suggested = saw ?? 'cnc';
    reason = !saw
      ? 'Solid wood, but the shop profile has no saw: cut out on the CNC.'
      : shop.saws.miterSaw.owned
        ? `Solid wood: ripped to width on the ${sawName} and cut to length on the miter saw.`
        : `Solid wood: ripped to width and cut to length on the ${sawName}.`;
  } else if (tiled && (isNotched(part) || work.length > 0 || !saw)) {
    reason = saw
      ? `Longer than the machine's cutting area: cut on the CNC in two set-ups, the sheet slid along on pins between them. Or cut it on the ${sawName} and make its joints and holes by hand.`
      : "Longer than the machine's cutting area: cut on the CNC in two set-ups, the sheet slid along on pins between them.";
  } else if (oversize) {
    // By hand on a saw-cut part the pocket holes are the Kreg jig's, not the CNC's.
    const byHand = cncWork(part, 'kregJig');
    suggested = saw ?? 'cnc';
    reason = !saw
      ? "Longer than the machine's cutting area, and the shop profile has no saw that takes it."
      : byHand.length > 0
        ? `Longer than the machine's cutting area: cut on the ${sawName}. By hand: ${list(byHand)}; the Lists tab on Cut says where each goes.`
        : `Longer than the machine's cutting area: cut on the ${sawName}.`;
    if (hasTabJoint(part)) reason += " Its tab-and-slot joints are the CNC's work: give this part's joints another kind, or cut it on a machine that takes it.";
  } else if (isNotched(part) || work.length > 0) {
    const has = [...(isNotched(part) && !part.tabbed ? [part.role === 'boxFront' ? 'the finger pull notch' : part.role === 'rib' ? 'the slots of the egg-crate' : 'the toe-kick notch'] : []), ...work];
    reason = cncOnly
      ? `The CNC cuts ${list(has)}, so it cuts the part out too.`
      : `The CNC cuts ${list(has)} anyway, so it cuts the part out too.`;
  } else if (saw) {
    suggested = saw;
    reason = tooBig
      ? "A plain rectangle, wider than the table saw's rip capacity both ways."
      : 'A plain rectangle: nothing for the CNC to do.';
  } else {
    reason = 'A plain rectangle, but the shop profile has no saw that takes it.';
  }

  // A choice is stored under the part's id without its copy, so it is for every copy.
  const chosen = choices.parts?.[baseId(part.id)]?.cutOut;
  const cutOut = chosen && options.includes(chosen) ? chosen : suggested;
  return { partId: part.id, cutOut, suggested, reason, options, steps: steps(part, cutOut, choices, shop) };
}

/** Every part's plan, in the order given. */
export function planParts(parts: Part[], choices: Pick<PlanChoices, 'parts' | 'pocketHoles'>, shop: Pick<Shop, 'saws'>, area?: CuttingArea): PartPlan[] {
  return parts.map((part) => planPart(part, choices, shop, area));
}

/**
 * How the job's pocket holes are made, how many there are, and how many of them the
 * CNC really preps: with CNC-assisted, only those in parts cut out on the CNC.
 * Undefined when the job has none. `ballDiameter`: the bit the pockets are cut with,
 * when the plan has picked one (a low-angle pocket's flat end mill, too).
 */
export function planPocketHoles(
  parts: Part[],
  choices: Pick<PlanChoices, 'pocketHoles' | 'pocketSeat'>,
  plans: PartPlan[],
  ballDiameter: number = DEFAULT_BALL,
  sleeve?: PocketSleeve,
): ResolvedPlan['pocketHoles'] {
  const holes = (part: Part) => count(part, (f) => f.kind === 'pocketHole');
  const n = parts.reduce((sum, part) => sum + holes(part), 0);
  if (n === 0) return undefined;
  const method = pocketHoleMethod(choices);
  const onCnc = (part: Part) => plans.find((p) => p.partId === part.id)?.cutOut === 'cnc';
  const prepped = parts.filter(onCnc).filter((part) => holes(part) > 0 && cncPocketsFit(part, choices));
  const low = lowAngleOf(method);
  const seat = pocketSeatOf(choices);
  const cncAssisted = prepped.reduce((sum, part) => sum + holes(part), 0);
  if (cncAssisted === 0) return { method, count: n, cncAssisted };

  // One drilling step per stock thickness: the pilot's length follows the seat, which follows the thickness.
  const drilling: PocketDrilling[] = [];
  for (const part of prepped) {
    const thickness = part.size.thickness;
    let step = drilling.find((d) => Math.abs(d.thickness - thickness) < 0.01);
    if (!step) {
      // A low-angle pocket's seat is the same in every stock.
      step = { thickness, count: 0, drill: POCKET.drill, bitOutOfChuck: low ? boreOutside(sleeve) + seat + POCKET.through : bitOutOfChuck(pocketShape(thickness, ballDiameter), sleeve) };
      drilling.push(step);
    }
    step.count += holes(part);
  }
  drilling.sort((a, b) => b.thickness - a.thickness);
  // The guide is made for one nominal thickness of stock: the bore meets the edge at half of it, and a little either way does not matter.
  const made = [...new Set(drilling.map((d) => guideThickness(d.thickness)))];
  const guides: JigInstance[] = made.map((thickness) => ({ template: 'pocketGuide', params: { thickness, drill: POCKET.drill, ...(low ? { angleDeg: low, bit: ballDiameter, seat } : {}), ...(sleeve ? sleeveParams(sleeve) : {}) }, quantity: 1, output: '3mf' }));
  return { method, count: n, cncAssisted, prep: { guides, drilling } };
}
