import type {
  DesignObject,
  Feature,
  Id,
  JigInstance,
  MachineProfile,
  Method,
  Mm,
  Operation,
  OperationChoice,
  OperationKind,
  Part,
  PlanWarning,
  Project,
  Tool,
} from '@/model';
import { designsOf, isDoorSet, projectShows } from '@/design';
import { POCKET, arcShape, lowCoverFits, pocketShape } from '@/geometry/pocketHole';
import { openSides, widestBit } from '@/geometry/recess';
import { mustBeRect } from '@/geometry/rect';
import { isTabSlot } from '@/design/tabs';
import { HOLE_NAMES, isGroove, isRabbet, cncCutsPockets, lowAngleOf, lowPocketsFit, pocketCovered, pocketCoversOf, pocketHoleMethod, pocketSeatOf } from './parts';
import {
  CHAMFER_TIP_OFFSET,
  EPS,
  cutDiameter,
  findTool,
  cutsEdgeChamfer,
  cuttingLengthOf,
  hasFeedsFor,
  isBallNose,
  isBullNose,
  isTaperBall,
  isConeBit,
  tipRadius,
  isEndMill,
  isRoundover,
  isVBit,
  pinHoleDiameter,
} from './tools';

type Ref = { partId: Id; featureId: Id };
type Found<K extends Feature['kind']> = { ref: Ref; feature: Extract<Feature, { kind: K }> };

function collect<K extends Feature['kind']>(parts: Part[], kinds: K[]): Found<K>[] {
  return parts.flatMap((part) =>
    part.features
      .filter((f): f is Extract<Feature, { kind: K }> => (kinds as string[]).includes(f.kind))
      .map((feature) => ({ ref: { partId: part.id, featureId: feature.id }, feature })),
  );
}

/** A draft operation: what could make it, before a bit is picked. */
interface Draft {
  key: string;
  kind: OperationKind;
  label: string;
  face: Operation['face'];
  source: Operation['source'];
  methods: Method[];
  defaultMethod: Method;
  /** Bits that can do the CNC version. */
  clearToolIds: Id[];
  /** Deepest cut below the top face, for cutting-length warnings. */
  depth: Mm;
  /** Pocket only: the largest floor corner radius the design allows. */
  floorCornerRadius?: Mm;
  /** Counts toward "one bit for everything". */
  endMillWork: boolean;
  /** The materials of the parts the row works on: a bit is offered only when it has feeds for each. */
  materialIds?: Id[];
  /** The bit the row starts on when nothing is chosen, where that is not the widest offered. */
  usualToolId?: Id;
}

const ids = (tools: Tool[]) => tools.map((t) => t.id);

/**
 * What the job's rows are grouped and keyed by: the doors, the drawer fronts, the
 * cases (face frames with them) and the drawer boxes of every cabinet together.
 */
export type RowGroup = 'doors' | 'drawerFronts' | 'case' | 'boxes' | 'handles';

/**
 * Work that differs in what can make it is split into rows of its own: holes by
 * their diameter, a bevel by its angle, an edge by its profile. `sig` says which, and
 * is part of the row's key; `text` goes behind the label when the group has more than
 * one such row.
 */
function variants<T>(found: T[], of: (item: T) => { sig: string; text: string }): { sig: string; text: string; items: T[] }[] {
  const rows: { sig: string; text: string; items: T[] }[] = [];
  for (const item of found) {
    const { sig, text } = of(item);
    const row = rows.find((r) => r.sig === sig);
    if (row) row.items.push(item);
    else rows.push({ sig, text, items: [item] });
  }
  return rows;
}
/** A number as it goes into a key and a label: 5, 6.35, 1.59. */
const num = (v: number) => String(Number(v.toFixed(2)));

/**
 * The rows for the doors, or for the drawer fronts, of the whole job. `name` goes in
 * front of each label when the job has more than one kind of thing to tell apart
 * (the doors and the drawer front).
 */
function draftsForFronts(group: RowGroup, name: string | undefined, own: Part[], tools: Tool[]): Draft[] {
  const label = (text: string) => (name ? `${name}: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);
  const thickness = Math.max(...own.map((p) => p.size.thickness));
  const endMills = tools.filter(isEndMill);
  const key = (kind: OperationKind) => `${group}:${kind}`;
  const drafts: Draft[] = [];

  // A finger hole is bored from the back with the cups, but it is its own row with its own bit.
  const isPull = (id: Id) => id.startsWith('finger-pull');
  const pulls = collect(own, ['hole']).filter((h) => isPull(h.feature.id));
  // So are a handle's screw holes: through the front, and small.
  const isHandleHole = (id: Id) => id.startsWith('handle');
  const handleHoles = collect(own, ['hole']).filter((h) => isHandleHole(h.feature.id));
  const bores = collect(own, ['cup', 'hole']).filter((b) => !isPull(b.feature.id) && !isHandleHole(b.feature.id));
  if (bores.length > 0) {
    const smallest = Math.min(...bores.map((b) => b.feature.diameter));
    drafts.push({
      key: key('hingeCup'),
      kind: 'hingeCup',
      label: label('Hinge cups'),
      face: 'B',
      source: { kind: 'features', refs: bores.map((b) => b.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(endMills.filter((t) => t.shape.diameter.mm < smallest - EPS)),
      depth: Math.max(...bores.map((b) => b.feature.depth)),
      endMillWork: true,
    });
  }

  // A wide drawer front with a style of its own (inset): the dados for the box sides and the bottom's groove, in its back.
  drafts.push(...recessDrafts(group, label, own, endMills, { groove: "Groove for the box's bottom", dado: 'Dados for the box sides', rabbet: 'Rabbets' }));

  if (pulls.length > 0) {
    const smallest = Math.min(...pulls.map((h) => h.feature.diameter));
    drafts.push({
      key: `${group}:holes:finger-pull`,
      kind: 'holes',
      label: label('Finger holes'),
      face: 'B',
      source: { kind: 'features', refs: pulls.map((h) => h.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(endMills.filter((t) => t.shape.diameter.mm < smallest - EPS)),
      depth: Math.max(...pulls.map((h) => h.feature.depth)),
      endMillWork: true,
    });
  }

  if (handleHoles.length > 0) {
    const smallest = Math.min(...handleHoles.map((h) => h.feature.diameter));
    drafts.push({
      key: `${group}:holes:handle`,
      kind: 'holes',
      label: label('Handle holes'),
      face: handleHoles[0]!.feature.face,
      source: { kind: 'features', refs: handleHoles.map((h) => h.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      // A hole the bit's own size is peck drilled; a smaller bit helixes it.
      clearToolIds: ids(endMills.filter((t) => t.shape.diameter.mm <= smallest + EPS)),
      depth: Math.max(...handleHoles.map((h) => h.feature.depth)),
      endMillWork: true,
    });
  }

  const pockets = collect(own, ['pocket']);
  if (pockets.length > 0) {
    const narrowest = Math.min(
      ...pockets.map((p) => {
        const xs = p.feature.outline.map((q) => q.x);
        const ys = p.feature.outline.map((q) => q.y);
        return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      }),
    );
    const radius = Math.min(...pockets.map((p) => p.feature.floorCornerRadius));
    const small = endMills.filter((t) => t.shape.diameter.mm / 2 <= radius + EPS);
    drafts.push({
      key: key('pocketClear'),
      kind: 'pocketClear',
      label: label('Panel pocket'),
      face: 'A',
      source: { kind: 'features', refs: pockets.map((p) => p.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      // A bit too big for the corners is still offered when a smaller one can clean up after it.
      clearToolIds: ids(
        endMills.filter(
          (t) =>
            t.shape.diameter.mm <= narrowest + EPS &&
            (t.shape.diameter.mm / 2 <= radius + EPS || small.length > 0),
        ),
      ),
      depth: Math.max(...pockets.map((p) => p.feature.depth)),
      floorCornerRadius: radius,
      endMillWork: true,
    });
  }

  const bevelRows = variants(collect(own, ['bevel']), (b) => ({ sig: num(b.feature.angleDeg), text: `${num(b.feature.angleDeg)}°` }));
  for (const { sig, text, items: bevels } of bevelRows) {
    const { angleDeg } = bevels[0]!.feature;
    const depth = Math.max(...bevels.map((b) => b.feature.depth));
    drafts.push({
      key: `${key('vBevel')}@${sig}`,
      kind: 'vBevel',
      label: label(bevelRows.length > 1 ? `Inside bevel, ${text}` : 'Inside bevel'),
      face: 'A',
      source: { kind: 'features', refs: bevels.map((b) => b.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(
        tools
          .filter(isVBit)
          // A flat on the point would leave a flat at the foot of the bevel
          .filter((t) => tipRadius(t) < EPS && Math.abs(t.shape.angleDeg - angleDeg) < EPS && t.shape.maxDepth >= depth - EPS),
      ),
      depth,
      endMillWork: false,
    });
  }

  // A pattern: V-grooves take a pointed V-bit of their angle, flutes a ball nose of their width.
  const patterned = collect(own, ['slot']).filter((x) => x.feature.profile);
  const cutDepth = (f: { depth: Mm; top?: Mm }) => f.depth - (f.top ?? 0);
  const vRows = variants(patterned.filter((x) => x.feature.profile!.kind === 'v'), (x) => {
    const angle = (x.feature.profile as { angleDeg: number }).angleDeg;
    return { sig: num(angle), text: `${num(angle)}°` };
  });
  for (const { sig, text, items } of vRows) {
    const angleDeg = (items[0]!.feature.profile as { angleDeg: number }).angleDeg;
    const deepest = Math.max(...items.map((x) => cutDepth(x.feature)));
    drafts.push({
      key: `${key('slot')}:v@${sig}`,
      kind: 'slot',
      label: label(vRows.length > 1 ? `Pattern grooves, ${text}` : 'Pattern grooves'),
      face: 'A',
      source: { kind: 'features', refs: items.map((x) => x.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(tools.filter(isVBit).filter((t) => tipRadius(t) < EPS && Math.abs(t.shape.angleDeg - angleDeg) < EPS && t.shape.maxDepth >= deepest - EPS)),
      depth: Math.max(...items.map((x) => x.feature.depth)),
      endMillWork: false,
    });
  }
  const roundRows = variants(patterned.filter((x) => x.feature.profile!.kind === 'round'), (x) => {
    const d = (x.feature.profile as { diameter: Mm }).diameter;
    return { sig: num(d), text: `${num(d)} mm` };
  });
  for (const { sig, text, items } of roundRows) {
    const diameter = (items[0]!.feature.profile as { diameter: Mm }).diameter;
    const roundDeepest = Math.max(...items.map((x) => cutDepth(x.feature)));
    drafts.push({
      key: `${key('slot')}:round@${sig}`,
      kind: 'slot',
      label: label(roundRows.length > 1 ? `Flutes and dimples, ${text}` : items.every((x) => Math.hypot(x.feature.path[0]!.x - x.feature.path.at(-1)!.x, x.feature.path[0]!.y - x.feature.path.at(-1)!.y) < 1) ? 'Dimples' : 'Flutes'),
      face: 'A',
      source: { kind: 'features', refs: items.map((x) => x.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      // A ball nose that wide; or a taper ball with a tip that wide, while the cut is no deeper than the ball is round (deeper, its taper would widen it).
      clearToolIds: ids(tools.filter((t) => (isBallNose(t) && Math.abs(t.shape.diameter.mm - diameter) < 0.05) || (isTaperBall(t) && Math.abs(t.shape.ballDiameter.mm - diameter) < 0.05 && roundDeepest <= diameter / 2 + EPS))),
      depth: Math.max(...items.map((x) => x.feature.depth)),
      endMillWork: false,
    });
  }

  // Channels: soft-cornered ones in one pass with a bull nose their width; plain ones with an end mill no wider.
  const bullOf = (x: (typeof patterned)[number]) => x.feature.profile as { diameter: Mm; cornerRadius: Mm };
  const bullRows = variants(patterned.filter((x) => x.feature.profile!.kind === 'bull'), (x) => ({ sig: `${num(bullOf(x).diameter)}r${num(bullOf(x).cornerRadius)}`, text: `${num(bullOf(x).diameter)} mm` }));
  for (const { sig, text, items } of bullRows) {
    const { diameter: wide, cornerRadius } = bullOf(items[0]!);
    drafts.push({
      key: `${key('slot')}:bull@${sig}`,
      kind: 'slot',
      label: label(bullRows.length > 1 ? `Bull nose cuts, ${text}` : 'Bull nose cuts'),
      face: 'A',
      source: { kind: 'features', refs: items.map((x) => x.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      // The bull nose it was designed for: that wide, with corners of that radius.
      clearToolIds: ids(tools.filter(isBullNose).filter((t) => Math.abs(t.shape.diameter.mm - wide) < 0.05 && Math.abs(t.shape.cornerRadius.mm - cornerRadius) < 0.05)),
      depth: Math.max(...items.map((x) => x.feature.depth)),
      endMillWork: false,
    });
  }
  const plain = collect(own, ['slot']).filter((x) => !x.feature.profile);
  if (plain.length > 0) {
    const narrowest = Math.min(...plain.map((x) => x.feature.width));
    drafts.push({
      key: `${key('slot')}:flat`,
      kind: 'slot',
      label: label('Channels'),
      face: 'A',
      source: { kind: 'features', refs: plain.map((x) => x.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(endMills.filter((t) => t.shape.diameter.mm <= narrowest + EPS)),
      depth: Math.max(...plain.map((x) => x.feature.depth)),
      endMillWork: true,
    });
  }

  const edgeRows = variants(collect(own, ['edgeProfile']), (e) => {
    const t = e.feature.treatment;
    const size = t.kind === 'roundover' ? t.radius : t.size;
    return { sig: `${t.kind}-${num(size)}`, text: `${num(size)} mm ${t.kind}` };
  });
  for (const { sig, text, items: edges } of edgeRows) {
    const t = edges[0]!.feature.treatment;
    const capable =
      t.kind === 'roundover'
        ? tools.filter(isRoundover).filter((b) => Math.abs(b.shape.radius.mm - t.radius) < EPS)
        : // A V-bit or a chamfer bit, matched by its angle
          tools.filter(isConeBit).filter((b) => cutsEdgeChamfer(b, t.size));
    drafts.push({
      key: `${key('edgeProfile')}@${sig}`,
      kind: 'edgeProfile',
      label: label(edgeRows.length > 1 ? `Outside edges, ${text}` : 'Outside edges'),
      face: 'edge',
      source: { kind: 'features', refs: edges.map((e) => e.ref) },
      methods: capable.length > 0 ? ['handheldRouter', 'cnc', 'byHand'] : ['handheldRouter', 'byHand'],
      defaultMethod: 'handheldRouter',
      clearToolIds: ids(capable),
      depth: t.kind === 'roundover' ? t.radius : t.size + CHAMFER_TIP_OFFSET,
      endMillWork: false,
    });
  }

  const cutouts = collect(own, ['cutout']);
  if (cutouts.length > 0) {
    drafts.push({
      key: key('cutout'),
      kind: 'cutout',
      label: label('Cutout'),
      face: 'A',
      source: { kind: 'features', refs: cutouts.map((c) => c.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(fitSlots(own, endMills)),
      depth: thickness,
      endMillWork: true,
    });
  }
  return drafts;
}

/**
 * The end mills that can cut these parts out: all of them, unless a part has a joint's slot through it (cut with
 * the outline's bit), which only a bit no wider than the slot can cut. None then: Plan says no bit can make it.
 */
function fitSlots(own: Part[], endMills: Tool[]): Tool[] {
  const widths = own.flatMap((p) => p.features.flatMap((f) => (f.kind === 'cutout' && f.inside && isTabSlot(f) ? [mustBeRect(f.outline)] : []))).map((r) => Math.min(r.x1 - r.x0, r.y1 - r.y0));
  if (!widths.length) return endMills;
  const narrowest = Math.min(...widths);
  return endMills.filter((t) => isEndMill(t) && t.shape.diameter.mm <= narrowest + EPS);
}

/**
 * The rows for the recesses cut into a group of parts: the groove, the dados and the rabbets, each a row with the
 * widest bit that fits between the walls of every one of them.
 */
function recessDrafts(owner: string, label: (text: string) => string, own: Part[], endMills: Tool[], names: { groove: string; dado: string; rabbet: string }): Draft[] {
  const drafts: Draft[] = [];
  const recesses = collect(own, ['dado']);
  // (A joint's blind slots are dados with a row of their own: `tabSlot`.)
  const kinds: [kind: OperationKind, label: string, test: (f: Feature) => boolean, key?: string][] = [
    ['groove', names.groove, isGroove],
    ['dado', names.dado, (f) => !isRabbet(f) && !isGroove(f) && !isTabSlot(f)],
    ['dado', 'Slots for tabs', isTabSlot, 'tabSlot'],
    ['rabbet', names.rabbet, isRabbet],
  ];
  for (const [kind, text, test, named] of kinds) {
    const found = recesses.filter((r) => test(r.feature));
    if (found.length === 0) continue;
    // The widest bit that fits between the walls of every one of them.
    const widestFit = Math.min(
      ...found.map(({ ref, feature }) => {
        const part = own.find((p) => p.id === ref.partId)!;
        const bounds = { x0: 0, y0: 0, x1: part.size.width, y1: part.size.height };
        const neighbours = part.features.flatMap((f) =>
          f.kind === 'dado' && f.id !== feature.id && f.face === feature.face ? [{ rect: mustBeRect(f.outline), depth: f.depth }] : [],
        );
        const rect = mustBeRect(feature.outline);
        return widestBit(rect, openSides(rect, bounds, neighbours, feature.depth));
      }),
    );
    drafts.push({
      key: `${owner}:${named ?? kind}`,
      kind,
      label: label(text),
      face: found[0]!.feature.face,
      source: { kind: 'features', refs: found.map((r) => r.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(endMills.filter(isEndMill).filter((t) => t.shape.diameter.mm <= widestFit + EPS)),
      depth: Math.max(...found.map((r) => r.feature.depth)),
      endMillWork: true,
    });
  }
  return drafts;
}

/** A drawer box's walls; everything else with a role belongs to the case. */
const isBoxPart = (part: Part) => part.role?.startsWith('box') ?? false;

/**
 * The rows for the job's case parts, or for its drawer boxes: the parts cut out on the
 * CNC. One row per kind of cut, so each has its own bit: a narrow groove takes the
 * small bit without putting it on the dados. `pockets`: the job's pocket holes are
 * CNC-assisted, so these parts' pocket holes get a row too.
 */
function draftsForCabinetParts(owner: RowGroup, name: string, own: Part[], tools: Tool[], box: boolean, pockets: { low?: number; seat: Mm; covered?: (partId: Id, face: 'A' | 'B') => boolean } | false): Draft[] {
  const label = (text: string) => `${name}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  const endMills = tools.filter(isEndMill);
  const drafts: Draft[] = [];

  const holes = collect(own, ['hole']);
  const purposes: [suffix: string, label: string, test: (id: Id) => boolean][] = [
    ...HOLE_NAMES.map(([prefix, , many]): [string, string, (id: Id) => boolean] => [prefix, many, (id) => id.startsWith(prefix)]),
    ['other', 'Holes', (id) => !HOLE_NAMES.some(([prefix]) => id.startsWith(prefix))],
  ];
  for (const [suffix, text, test] of purposes) {
    // Holes of one purpose and one size are a row: another cabinet's bigger shelf pin gets its own, with its own bit.
    const sizes = variants(holes.filter((h) => test(h.feature.id)), (h) => ({ sig: num(h.feature.diameter), text: `${num(h.feature.diameter)} mm` }));
    for (const { sig, text: size, items: found } of sizes) {
    const smallest = Math.min(...found.map((h) => h.feature.diameter));
    drafts.push({
      key: `${owner}:holes:${suffix}@${sig}`,
      kind: 'holes',
      label: label(sizes.length > 1 ? `${text}, ${size}` : text),
      face: found[0]!.feature.face,
      source: { kind: 'features', refs: found.map((h) => h.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      // A hole the bit's own size is peck drilled; a smaller bit helixes it.
      clearToolIds: ids(endMills.filter((t) => t.shape.diameter.mm <= smallest + EPS)),
      depth: Math.max(...found.map((h) => h.feature.depth)),
      endMillWork: true,
    });
    }
  }

  // Grooves that follow a line (a lazy susan's rim groove, the slots that let its rim bend): one row, cut with a bit no wider than the narrowest.
  const slots = collect(own, ['slot']);
  if (slots.length > 0) {
    const narrowest = Math.min(...slots.map((x) => x.feature.width));
    drafts.push({
      key: `${owner}:slot`,
      kind: 'slot',
      label: label('Slots'),
      face: slots[0]!.feature.face,
      source: { kind: 'features', refs: slots.map((x) => x.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(endMills.filter((t) => t.shape.diameter.mm <= narrowest + EPS)),
      depth: Math.max(...slots.map((x) => x.feature.depth)),
      endMillWork: true,
    });
  }

  drafts.push(...recessDrafts(owner, label, own, endMills, { groove: box ? 'Bottom groove' : 'Back groove', dado: 'Dados', rabbet: box ? 'Corner rabbets' : 'Back rabbet' }));

  // A low-angle pocket only in the parts that have room for one: the others' pocket holes are the Kreg jig's (`cncPocketsFit`).
  const pocketHoles = pockets ? collect(pockets.low ? own.filter((p) => lowPocketsFit(p, pockets.low!, pockets.seat)) : own, ['pocketHole']) : [];
  if (pocketHoles.length > 0 && pockets && pockets.low) {
    // A low-angle pocket (untested): a flat end mill no wider than the bore. It is end mill work, so the bit that cuts the parts out can cut it too.
    const flat = endMills.filter((t) => t.shape.diameter.mm >= 3 - EPS && t.shape.diameter.mm <= POCKET.bore + EPS);
    const width = Math.max(0, ...flat.map((t) => t.shape.diameter.mm)) || POCKET.bore / 2;
    const thickness = (ref: Ref) => own.find((p) => p.id === ref.partId)!.size.thickness;
    drafts.push({
      key: `${owner}:pocketHole`,
      kind: 'pocketHole',
      label: label('Pocket holes'),
      face: pocketHoles[0]!.feature.face,
      source: { kind: 'features', refs: pocketHoles.map((h) => h.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(flat),
      depth: Math.max(...pocketHoles.map((h) => arcShape(thickness(h.ref), width, pockets.low!, pockets.seat).depth)),
      endMillWork: true,
    });
  } else if (pocketHoles.length > 0) {
    // A ball nose that fits inside the 3/8" bore. Untested: an experiment.
    const balls = tools.filter(isBallNose).filter((t) => t.shape.diameter.mm < POCKET.bore - EPS);
    // Any of them cuts a pocket; the row starts on the narrowest, which the pocket was worked out with (a 1/8" ball
    // in the starter shop). A wider one, kept for flutes, is offered too.
    const narrowest = [...balls].sort((a, b) => a.shape.diameter.mm - b.shape.diameter.mm)[0];
    const ball = narrowest?.shape.diameter.mm ?? POCKET.bore / 3;
    const thickness = (ref: Ref) => own.find((p) => p.id === ref.partId)!.size.thickness;
    drafts.push({
      key: `${owner}:pocketHole`,
      kind: 'pocketHole',
      label: label('Pocket holes'),
      // The row may have holes on both faces; each is cut with its own face up.
      face: pocketHoles[0]!.feature.face,
      source: { kind: 'features', refs: pocketHoles.map((h) => h.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(balls),
      ...(narrowest ? { usualToolId: narrowest.id } : {}),
      depth: Math.max(...pocketHoles.map((h) => pocketShape(thickness(h.ref), ball).depth)),
      endMillWork: false,
    });
  }

  // A ledge round each pocket that gets a printed cover: a flat end mill's work, after the pocket is cut (by the ball
  // nose at 15°, or by an end mill at a low angle).
  // A low-angle pocket in stock too thin for a cover over its screw's head (1/2" stock) gets none.
  const coverFits = (h: (typeof pocketHoles)[number]) => !pockets || !pockets.low || lowCoverFits(own.find((p) => p.id === h.ref.partId)!.size.thickness, pockets.low, pockets.seat);
  const ledges = pockets && pockets.covered ? pocketHoles.filter((h) => pockets.covered!(h.ref.partId, h.feature.face) && coverFits(h)) : [];
  if (ledges.length > 0) {
    // Either flat end mill no wider than the bore: a 1/8" one or a 1/4" one in the starter shop. The ledge is the
    // same size whichever cuts it (the pocket's opening does not go by the bit); only its corners differ, so the
    // printed cover is one of two plates. The row starts on the widest, which is usually the bit that cuts the
    // parts out: no bit change for the ledges.
    const flat = endMills.filter((t) => t.shape.diameter.mm >= 3 - EPS && t.shape.diameter.mm <= POCKET.bore + EPS);
    drafts.push({
      key: `${owner}:pocketLedge`,
      kind: 'pocketLedge',
      label: label('Pocket-hole cover ledges'),
      face: ledges[0]!.feature.face,
      source: { kind: 'features', refs: ledges.map((h) => h.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(flat),
      depth: POCKET.ledge.depth,
      endMillWork: true,
    });
  }

  const cutouts = collect(own, ['cutout']);
  if (cutouts.length > 0) {
    drafts.push({
      key: `${owner}:cutout`,
      kind: 'cutout',
      label: label('Cutout'),
      face: 'A',
      source: { kind: 'features', refs: cutouts.map((c) => c.ref) },
      methods: ['cnc'],
      defaultMethod: 'cnc',
      clearToolIds: ids(fitSlots(own, endMills)),
      depth: Math.max(...own.map((p) => p.size.thickness)),
      endMillWork: true,
    });
  }
  return drafts;
}

/** The rows for the cabinet parts the CNC cuts out: the cases', then the drawer boxes'. */
function cabinetDrafts(project: Project, others: Part[], tools: Tool[]): Draft[][] {
  // Wooden handles are cut apart from the cabinet's parts, so their rows are their own: a bit chosen for them is theirs.
  const handles = others.filter((p) => p.role === 'handle');
  const cases = others.filter((p) => !isBoxPart(p) && p.role !== 'handle');
  const boxes = others.filter(isBoxPart);
  // One drawer's box is named after it ("Drawer box"); several are "Drawer boxes".
  const drawers = [...new Set(boxes.map((p) => p.designObjectId))];
  const only = drawers.length === 1 ? designsOf(project).find((d) => d.id === drawers[0]) : undefined;
  const method = pocketHoleMethod(project.plan);
  // The pockets that get a cover: by how the face each is in is seen once the piece is built.
  const where = pocketCoversOf(project.plan);
  const shows = where.length ? projectShows(project, others) : undefined;
  const drawer = new Set(boxes.map((p) => p.id));
  const covered = (partId: Id, face: 'A' | 'B') => pocketCovered(where, shows?.get(partId)?.[face] ?? 'hidden', drawer.has(partId));
  const pockets = cncCutsPockets(method) ? { low: lowAngleOf(method), seat: pocketSeatOf(project.plan), ...(where.length ? { covered } : {}) } : false;
  return [
    ...(cases.length ? [draftsForCabinetParts('case', 'Case', cases, tools, false, pockets)] : []),
    ...(boxes.length ? [draftsForCabinetParts('boxes', drawers.length === 1 ? `${only?.name ?? 'Drawer'} box` : 'Drawer boxes', boxes, tools, true, pockets)] : []),
    ...(handles.length ? [draftsForCabinetParts('handles', 'Handles', handles, tools, false, false)] : []),
  ];
}

function pinHoleDraft(machine: MachineProfile, tools: Tool[], thickness: Mm): Draft {
  const hole = pinHoleDiameter(machine);
  return {
    key: 'job:pinHole',
    kind: 'pinHole',
    label: 'Registration holes',
    face: 'B',
    source: { kind: 'registration' },
    methods: ['cnc'],
    defaultMethod: 'cnc',
    clearToolIds: ids(tools.filter(isEndMill).filter((t) => t.shape.diameter.mm <= hole + EPS)),
    depth: thickness + machine.flipPins.spoilboardDepth,
    endMillWork: true,
  };
}

const widest = (toolIds: Id[], tools: Tool[]): Id | undefined =>
  [...toolIds].sort((a, b) => cutDiameter(findTool(tools, b)) - cutDiameter(findTool(tools, a)))[0];

/** For "fewest bit changes": the one end mill that can do all the end mill work, if any. */
function oneBitForAll(drafts: Draft[], tools: Tool[]): Id | undefined {
  const work = drafts.filter((d) => d.endMillWork);
  if (work.length === 0) return undefined;
  const shared = work[0]!.clearToolIds.filter((id) => work.every((d) => d.clearToolIds.includes(id)));
  const radius = Math.min(...work.map((d) => d.floorCornerRadius ?? Infinity));
  const noCleanup = shared.filter((id) => cutDiameter(findTool(tools, id)) / 2 <= radius + EPS);
  return widest(noCleanup.length > 0 ? noCleanup : shared, tools);
}

function depthWarnings(tool: Tool, depth: Mm, label: string): PlanWarning[] {
  const deep = `${label} cuts ${depth.toFixed(2)} mm deep`;
  const length = cuttingLengthOf(tool);
  if (length !== undefined) {
    if (!length) {
      return [{ code: 'cuttingLengthUnknown', message: `${deep}; the cutting length of the ${tool.name} isn't measured yet.` }];
    }
    if (length.mm < depth - EPS) {
      return [{ code: 'deeperThanCuttingLength', message: `${deep}, more than the ${length.mm} mm cutting length of the ${tool.name}.` }];
    }
  }
  if (isConeBit(tool) && tool.shape.maxDepth < depth - EPS) {
    return [{ code: 'deeperThanVMax', message: `${deep}, more than the ${tool.shape.maxDepth} mm the ${tool.name} can cut.` }];
  }
  return [];
}

/**
 * The flip pin holes go no deeper than the bit's flutes. When that falls short of
 * the depth the pins want, the rest is drilled by hand; the warning says how much.
 */
function pinHoleReach(tool: Tool, wanted: Mm, thickness: Mm): { depth: Mm; warning?: PlanWarning } {
  const length = tool.shape.kind === 'endMill' ? tool.shape.cuttingLength?.mm : undefined;
  if (length === undefined || length >= wanted - EPS) return { depth: wanted };
  const mm = (v: Mm) => `${Number(v.toFixed(1))} mm`;
  const seat = wanted - thickness;
  const message =
    length >= thickness - EPS
      ? `The ${tool.name} cuts ${mm(length)} deep, so the pin holes stop ${mm(length - thickness)} into the spoilboard instead of ${mm(seat)}. ` +
        `Drill them ${mm(wanted - length)} deeper by hand before the flip.`
      : `The ${tool.name} cuts ${mm(length)} deep, so the pin holes stop ${mm(thickness - length)} short of going through the blank. ` +
        `Drill them through and ${mm(seat)} into the spoilboard by hand before the flip.`;
  return { depth: length, warning: { code: 'pinHolesShallow', message } };
}

function finish(
  draft: Draft,
  choice: OperationChoice | undefined,
  preferred: Id | undefined,
  tools: Tool[],
  blankThickness: Mm,
): Operation {
  const method = choice?.method && draft.methods.includes(choice.method) ? choice.method : draft.defaultMethod;
  const warnings: PlanWarning[] = [];
  let clearToolId: Id | undefined;
  let cleanupToolId: Id | undefined;
  let cleanupToolIds: Id[] = [];
  let cleanupRequired = false;
  let depth = draft.depth;

  if (method === 'cnc') {
    const offered = draft.clearToolIds;
    clearToolId =
      choice?.clearToolId && offered.includes(choice.clearToolId)
        ? choice.clearToolId
        : preferred && offered.includes(preferred)
          ? preferred
          : draft.usualToolId && offered.includes(draft.usualToolId)
            ? draft.usualToolId
            : widest(offered, tools);
    // A bit that was chosen and has since been removed from the shop profile: say so, and go on with another.
    const gone = (id: Id | null | undefined) => !!id && !tools.some((t) => t.id === id);
    if (gone(choice?.clearToolId) && clearToolId) {
      warnings.push({ code: 'chosenToolGone', message: `${draft.label}: the bit chosen for it is no longer in the shop profile, so the ${findTool(tools, clearToolId).name} is used.` });
    }
    if (!clearToolId) {
      warnings.push({ code: 'noCapableTool', message: `No bit in the shop profile can make: ${draft.label}.` });
    } else {
      const clear = findTool(tools, clearToolId);
      if (draft.kind === 'pinHole') {
        const reach = pinHoleReach(clear, draft.depth, blankThickness);
        depth = reach.depth;
        if (reach.warning) warnings.push(reach.warning);
      }
      warnings.push(...depthWarnings(clear, depth, draft.label));
      if (draft.floorCornerRadius !== undefined) {
        const radius = draft.floorCornerRadius;
        cleanupRequired = cutDiameter(clear) / 2 > radius + EPS;
        cleanupToolIds = ids(
          tools
            .filter(isEndMill)
            .filter((t) => hasFeedsFor(t, draft.materialIds ?? []))
            .filter((t) => t.shape.diameter.mm / 2 <= radius + EPS && t.shape.diameter.mm < cutDiameter(clear) - EPS),
        );
        const asked = choice?.cleanupToolId;
        if (asked && cleanupToolIds.includes(asked)) cleanupToolId = asked;
        else if (cleanupRequired) cleanupToolId = widest(cleanupToolIds, tools);
        if (gone(asked)) {
          warnings.push({
            code: 'chosenToolGone',
            message: `${draft.label}: the bit chosen for its clean-up is no longer in the shop profile${cleanupToolId ? `, so the ${findTool(tools, cleanupToolId).name} is used` : ''}.`,
          });
        }
        if (cleanupToolId) {
          warnings.push(...depthWarnings(findTool(tools, cleanupToolId), draft.depth, `${draft.label} clean-up`));
        }
      }
    }
  }

  return {
    key: draft.key,
    kind: draft.kind,
    label: draft.label,
    face: draft.face,
    source: draft.source,
    method,
    clearToolId,
    cleanupToolId,
    options: { methods: draft.methods, clearToolIds: draft.clearToolIds, cleanupToolIds, cleanupRequired },
    depth,
    machineSeconds: 0,
    warnings,
  };
}

/**
 * Support blocks set the bottom overlay while hanging; the shim sets the gap between a pair.
 * Inset doors stand in their opening instead: on two shims as thick as the gap under
 * them, with a shim between a pair. Shims of one thickness are one entry.
 * The kit is tools, not parts: the doors of several cabinets are hung with one set,
 * so alike pieces are printed once, as many as the door set that needs most.
 * Takes the project as hung (`hungProject`), as `resolveOperations` does.
 */
export function installKit(project: Project): JigInstance[] {
  // Doors only: a drawer front is fastened to its box, not hung.
  const kits = designsOf(project).filter(isDoorSet).map((design): JigInstance[] => {
    const m = design.mounting;
    if (m.type === 'inset') {
      const under = -m.overlayBottom.mm;
      const shims: JigInstance[] = under > 0.05 ? [{ template: 'gapShim', params: { thickness: under }, quantity: 2 * m.doors, output: '3mf' }] : [];
      if (m.doors === 2) {
        const same = shims.find((s) => Math.abs(s.params.thickness! - m.gap.mm) < 0.01);
        if (same) same.quantity += 1;
        else shims.push({ template: 'gapShim', params: { thickness: m.gap.mm }, quantity: 1, output: '3mf' });
      }
      return shims;
    }
    const kit: JigInstance[] = [{ template: 'supportBlock', params: { height: m.overlayBottom.mm }, quantity: 2, output: '3mf' }];
    if (m.doors === 2) {
      kit.push({ template: 'gapShim', params: { thickness: m.gap.mm }, quantity: 1, output: '3mf' });
    }
    return kit;
  });
  const alike = (a: JigInstance, b: JigInstance) =>
    a.template === b.template && Object.keys({ ...a.params, ...b.params }).every((k) => Math.abs((a.params[k] ?? NaN) - (b.params[k] ?? NaN)) < 0.01);
  const kit: JigInstance[] = [];
  for (const jig of kits.flat()) {
    const same = kit.find((j) => alike(j, jig));
    if (same) same.quantity = Math.max(same.quantity, jig.quantity);
    else kit.push({ ...jig });
  }
  return kit;
}

/**
 * Every operation with its method and bits chosen. `needsFlip` is asked once the
 * methods are known, because only CNC work decides whether the sheet is flipped.
 */
export function resolveOperations(
  project: Project,
  parts: Part[],
  tools: Tool[],
  machine: MachineProfile,
  needsFlip: (ops: Operation[]) => boolean,
  /** The cabinet's case and drawer box parts that are cut out on the CNC; their rows follow the fronts'. */
  others: Part[] = [],
): Operation[] {
  const hung = designsOf(project);
  // The doors of every door set are one group of rows and the drawer fronts another. They are named
  // when the job has more than one design object to tell apart, as before there were several cabinets.
  const named = hung.length > 1;
  const of = (template: DesignObject['template']) => {
    const designs = hung.filter((d) => d.template === template);
    const own = parts.filter((p) => designs.some((d) => d.id === p.designObjectId));
    const withParts = designs.filter((d) => own.some((p) => p.designObjectId === d.id));
    return { own, name: template === 'doorSet' ? 'Doors' : withParts.length === 1 ? withParts[0]!.name || 'Drawer' : 'Drawer fronts' };
  };
  const doors = of('doorSet');
  const fronts = of('drawer');
  const frontDrafts = [
    ...(doors.own.length ? draftsForFronts('doors', named ? doors.name : undefined, doors.own, tools) : []),
    ...(fronts.own.length ? draftsForFronts('drawerFronts', named ? fronts.name : undefined, fronts.own, tools) : []),
  ];
  // The pin holes go through the thickest blank that may be flipped: a front's, or a case part's.
  const thickness = Math.max(0, ...[...parts, ...others].map((p) => p.size.thickness));
  // A bit is offered only for materials it has feeds and speeds for. A row that other methods can
  // make loses the CNC when no bit is left; one that only the CNC makes keeps it, with its warning.
  const materialOf = new Map([...parts, ...others].map((p) => [p.id, p.materialId]));
  const everyMaterial = [...new Set(materialOf.values())];
  const fed = (d: Draft): Draft => {
    const materialIds = d.source.kind === 'features' ? [...new Set(d.source.refs.flatMap((r) => materialOf.get(r.partId) ?? []))] : everyMaterial;
    const clearToolIds = d.clearToolIds.filter((id) => hasFeedsFor(findTool(tools, id), materialIds));
    const methods = clearToolIds.length === 0 && d.methods.length > 1 ? d.methods.filter((m) => m !== 'cnc') : d.methods;
    return { ...d, materialIds, clearToolIds, methods, defaultMethod: methods.includes(d.defaultMethod) ? d.defaultMethod : methods[0]! };
  };
  const drafts = [...frontDrafts.map(fed)];
  const cabinet = cabinetDrafts(project, others, tools).map((group) => group.map(fed));
  const pins = fed(pinHoleDraft(machine, tools, thickness));
  const choices = project.plan.operations;

  // "One bit for everything" is worked out for the fronts, the cases and the drawer
  // boxes apart: they are cut from different blanks, each with its own bit changes.
  // A choice stored without the part of the key behind "@" (one carried over from before
  // the rows were job-wide) applies to every row of that kind that has none of its own.
  const tags = new Map([...parts, ...others].map((p) => [p.id, p.tag]));
  const build = (all: Draft[]) => {
    const preferred = project.plan.strategy === 'fewestBitChanges' ? oneBitForAll(all, tools) : undefined;
    return all.map((d) => {
      const op = finish(d, choices[d.key] ?? choices[d.key.split('@')[0]!], preferred, tools, thickness);
      // The cabinets the row covers, by their tags, when the project has tags.
      const covers = d.source.kind === 'features' ? [...new Set(d.source.refs.flatMap((r) => tags.get(r.partId) ?? []))].sort((a, b) => a.length - b.length || a.localeCompare(b)) : [];
      return covers.length ? { ...op, covers } : op;
    });
  };
  const buildAll = (withPins: boolean) => {
    const fronts = build(withPins ? [...drafts, pins] : drafts);
    return [...fronts.filter((o) => o.kind !== 'pinHole'), ...cabinet.flatMap(build), ...fronts.filter((o) => o.kind === 'pinHole')];
  };

  let ops = buildAll(false);
  if (needsFlip(ops)) ops = buildAll(true);

  const kit = installKit(project);
  if (kit.length > 0) {
    ops.push({
      key: 'job:install',
      kind: 'install',
      label: 'Hang doors',
      face: 'install',
      source: { kind: 'install', jigs: kit },
      method: 'byHand',
      options: { methods: ['byHand'], clearToolIds: [], cleanupToolIds: [], cleanupRequired: false },
      depth: 0,
      machineSeconds: 0,
      warnings: [],
    });
  }
  return ops;
}
