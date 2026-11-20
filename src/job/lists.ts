/**
 * The lists that go to the shop with the G-code: every part with a label, the cut
 * list for the parts cut out on a saw, the hardware to buy, and the pocket holes
 * drilled with the Kreg jig, each with its positions. All derived from the job;
 * nothing here is stored and nothing changes a part.
 */
import { DROP_LEAF, SEATING, seatingBrackets, seatingEdgeLength, FRAME_DOWELS, LEAF, frameLeafOf, frameTop, backAgainstWall, dropLeafHinges, dropLeafSupport, leafEdgeWords, leafSidesWords, towerSpans, closetRod, hangingWords, framesOf, frameFasteners, needsAntiTip, deriveUnderSink, falseFrontsOf, deriveSusan, susanOf, doorsOnSusan, CASE_SCREW, finishAmounts, cansOf, usesWords, coverageShown, coverageUnit, casterGroups, isCaster, boughtLength, boughtTopOf, lazySusanDiameter, topPieces, topSettingsOf, RUNNER_SCREW, RUNNER_SCREWS, fasteningHole, cabinetIdOf, cabinetsOf, copiesOf, partTag, designsOf, drawerBox, hungDesigns, isDoorSet, isDrawer, partFaces, shelfPinFor } from '@/design';
import { HUB, hubOf } from '@/design/hub';
import { POCKET, jigSleeve, lowPocketScrew, pocketAxis, pocketShape, sleeveWords } from '@/geometry/pocketHole';
import { cncPocketsFit, lowAngleOf, pocketHoleMethod, pocketSeatOf } from '@/plan/parts';
import { slideJigProblems } from '@/jigs/slideJig';
import { batchInHand, batchWants } from './batch';
import type { CabinetDesign, Caster, CutMethod, Hardware, Feature, GrainDirection, Handle, Mm, Part, PartEdge, PartPlan, Project, Shop, Vec3 } from '@/model';
import { printedHandlesOf } from '@/jigs/printedHandles';
import { HOLE_NAMES, isBoardPart } from '@/plan/parts';
import { BUTCHER_BLOCK_ID } from '@/libraries';
import { MM_PER_INCH, nominalText } from '@/units';
import type { Job } from './buildJob';

/** Tune me: the least a screw's tip stays inside the far face of the part it goes into. */
export const SCREW_TIP_MARGIN: Mm = 2;
/**
 * Tune me: where a Kreg jig's step drill seats the screw's head, along the hole from
 * the edge. Claude's estimate (a pilot of about 1/2" that stops 1/8" short of the
 * edge); measure a drilled pocket to check it.
 */
export const KREG_SEAT: Mm = 16;
/** Pocket screw lengths, shortest first. */
export const POCKET_SCREW_LENGTHS: Mm[] = [0.75, 1, 1.25, 1.5, 2, 2.5].map((i) => i * MM_PER_INCH);
/** Lengths a #8 wood screw comes in, shortest first. */
const WOOD_SCREW_LENGTHS: Mm[] = [0.5, 0.625, 0.75, 1, 1.25].map((i) => i * MM_PER_INCH);
/** Tune me: screws that hold a build-out strip to the case side (it is glued too). */
export const STRIP_SCREWS = 3;
/** The least a front screw's tip stays inside the face of the applied front. */
const FRONT_SCREW_MARGIN: Mm = 3;

export interface PartRow {
  partId: string;
  /** Written on the part: C1 (case), F1 (face frame), D1 (drawer box), DR1 (door), DF1 (drawer front). */
  label: string;
  name: string;
  material: string;
  size: { width: Mm; height: Mm; thickness: Mm };
  grain?: GrainDirection;
  cutOut: CutMethod;
  /** The blank a CNC part is cut from, 1-based. */
  blank?: number;
  /** What is done to it besides cutting it out, in order. */
  steps: PartPlan['steps'];
}

export interface CutRow {
  quantity: number;
  labels: string[];
  names: string[];
  /** Along the grain when the material has one, otherwise the longer side. */
  length: Mm;
  width: Mm;
  grain: boolean;
  saw: CutMethod;
  /** "Cut to length, miter saw" and the like. */
  steps: string[];
}

/**
 * One line of what to buy for the job: sheets of a sheet material, solid wood in board
 * feet. The hardware follows it in `hardware`.
 */
export interface BuyRow {
  material: string;
  /** Sheets or pieces; board feet for solid wood, to one decimal. */
  quantity: number;
  unit: 'sheet' | 'piece' | 'board feet';
  /** The sheet or piece, x by y, when it is one. */
  size?: { width: Mm; height: Mm };
  note: string;
}

/** Tune me: a torsion table's skin this thin or thinner is glued only, no brads. */
export const THIN_SKIN = 25.4 / 8;

/** Tune me: how many screws or fasteners hold a top down on each cabinet under it, and the screw. */
export const TOP_FASTENERS = 4;
export const TOP_SCREW = '#8 × 1-1/4" wood screws';

/** Tune me: what a saw-cut part's sheet area is taken up by, for kerfs and offcuts too small to use. */
export const SHEET_WASTE = 0.15;
/** Tune me: what is bought over the board feet of the solid-wood parts, for defects, ends and ripping. */
export const BOARD_WASTE = 0.2;

/** A saw cut between two parts cut from one length of stock. Tune me. */
export const STOCK_KERF: Mm = 3.2;
/**
 * How many lengths of stock `stock` long the parts need (their lengths in `longs`), each part whole in one
 * length: the longest first, each into the first length it fits in, a saw cut between two. A part longer than the
 * stock takes a length of its own (it must be bought longer).
 */
export function stockLengths(longs: Mm[], stock: Mm): number {
  const left: Mm[] = [];
  for (const long of [...longs].sort((a, b) => b - a)) {
    const at = left.findIndex((room) => room >= long - 1e-6);
    if (at >= 0) left[at] = left[at]! - long - STOCK_KERF;
    else left.push(stock - long - STOCK_KERF);
  }
  return left.length;
}

/** The saw-cut parts of one material, largest first. */
export interface CutGroup {
  material: string;
  thickness: Mm;
  /** Solid wood: ripped to width from boards, not cut from a sheet. */
  board: boolean;
  rows: CutRow[];
}

export interface HardwareRow {
  group: string;
  item: string;
  /** Left out for things bought by the box and not counted (brads, staples). */
  quantity?: number;
  unit?: string;
  note?: string;
}

/** One row of pocket holes drilled with the Kreg jig. */
export interface KregRow {
  label: string;
  part: string;
  /** The face the jig is clamped to: "Underside". */
  face: string;
  /** The edge the screws leave through: "left edge". */
  edge: string;
  /** What the screws go into. */
  into: string;
  /** The edge the positions are measured from. */
  from: string;
  at: Mm[];
  /** The jig's thickness setting. */
  thickness: Mm;
  /** e.g. `1-1/4"`. */
  screw: string;
}

/**
 * One joint, or one line of holes, made by hand in a part that is cut on a saw because
 * it is too long for the machine: a tall cabinet's side.
 */
export interface HandRow {
  label: string;
  part: string;
  /** "Shelf-pin holes", "Back rabbet", "Dado for the fixed shelf". */
  what: string;
  /** The face it is cut into: "Inside". */
  face: string;
  /** "5 mm across, 13 mm deep", "7/32" wide × 3/8" deep". */
  size: string;
  /** Where on the part, measured from its edges as they are named in the cabinet. */
  where: string;
  /** How many holes; 1 for a joint. */
  count: number;
}

export interface JobLists {
  /** What to buy: the project's materials the job uses. The hardware to buy is `hardware`. */
  buying: BuyRow[];
  parts: PartRow[];
  cutList: CutGroup[];
  hardware: HardwareRow[];
  kreg: KregRow[];
  /** What is routed and drilled by hand in parts too long for the machine. Empty in most jobs. */
  byHand: HandRow[];
  /** Printed stands that hold a tray's build-out strip level at its height: two a height, a 3MF of their own. */
  slideJigs?: { height: Mm; quantity: number }[];
  /** Printed shims that pack the build-out strips out to the opening: a 3MF of its own. */
  shims?: { thickness: Mm; length: Mm; height: Mm; quantity: number };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => add(a, b, -1);
const EPS = 0.05;

/** A direction in the cabinet as a word: X is right, Y up, Z toward the front. */
function sideWord(d: Vec3): string {
  const axis = [0, 1, 2].reduce((best, i) => (Math.abs(d[i]!) > Math.abs(d[best]!) ? i : best), 0);
  return [
    ['left', 'right'],
    ['bottom', 'top'],
    ['back', 'front'],
  ][axis]![d[axis]! > 0 ? 1 : 0]!;
}

/** The outward direction of a part's edge in its own frame. */
const EDGE_OUT: Record<PartEdge, [number, number]> = { x0: [-1, 0], x1: [1, 0], y0: [0, -1], y1: [0, 1] };

/** What an edge of a part is called from where the part sits in the cabinet: "front edge". */
function edgeName(part: Part, edge: PartEdge): string {
  const [x, y] = EDGE_OUT[edge];
  if (!part.placement) return { x0: 'left', x1: 'right', y0: 'bottom', y1: 'top' }[edge] + ' edge';
  return `${sideWord(add(add([0, 0, 0], part.placement.xAxis, x), part.placement.yAxis, y))} edge`;
}

/** A point of a part, `depth` below face A, in the cabinet. */
function inCabinet(part: Part, x: Mm, y: Mm, depth: Mm): Vec3 {
  const p = part.placement!;
  return add(add(add(p.origin, p.xAxis, x), p.yAxis, y), cross(p.xAxis, p.yAxis), -depth);
}

/** True when the point lies in the part's own box. */
function holds(part: Part, at: Vec3): boolean {
  const p = part.placement;
  if (!p) return false;
  const v = sub(at, p.origin);
  const x = dot(v, p.xAxis);
  const y = dot(v, p.yAxis);
  const z = -dot(v, cross(p.xAxis, p.yAxis));
  return x > -EPS && x < part.size.width + EPS && y > -EPS && y < part.size.height + EPS && z > -EPS && z < part.size.thickness + EPS;
}

/** How far the part reaches along `dir` beyond `from`. */
function reach(part: Part, from: Vec3, dir: Vec3): Mm {
  let far = -Infinity;
  for (const x of [0, part.size.width]) for (const y of [0, part.size.height]) for (const z of [0, part.size.thickness]) far = Math.max(far, dot(inCabinet(part, x, y, z), dir));
  return far - dot(from, dir);
}

type PocketHole = Extract<Feature, { kind: 'pocketHole' }>;
const isPocketHole = (f: Feature): f is PocketHole => f.kind === 'pocketHole';

/** The part a pocket screw goes into, and how much of it lies ahead of the screw. */
function receiver(part: Part, hole: PocketHole, all: Part[]): { part: Part; depth: Mm } | undefined {
  if (!part.placement) return undefined;
  const { exit, inward } = pocketAxis(part.size, hole.edge, hole.at, hole.inset);
  const from = inCabinet(part, exit.x, exit.y, part.size.thickness / 2);
  const out = add(add([0, 0, 0], part.placement.xAxis, -inward.x), part.placement.yAxis, -inward.y);
  const probe = add(from, out, 1);
  const other = all.find((p) => p !== part && holds(p, probe));
  return other ? { part: other, depth: reach(other, from, out) } : undefined;
}

const inches = (mm: Mm): string => {
  const sixteenths = Math.round((mm / MM_PER_INCH) * 16);
  const whole = Math.floor(sixteenths / 16);
  const rest = sixteenths % 16;
  if (!rest) return `${whole}"`;
  const d = [8, 4, 2, 1].find((k) => rest % k === 0)!;
  return `${whole ? `${whole}-` : ''}${rest / d}/${16 / d}"`;
};

/** The Kreg chart: the screw for stock of this thickness. */
function chartLength(thickness: Mm): Mm {
  const t = thickness / MM_PER_INCH;
  return (t <= 0.69 ? 1 : t <= 0.82 ? 1.25 : t <= 1.2 ? 1.5 : t <= 1.45 ? 2 : 2.5) * MM_PER_INCH;
}

/**
 * The pocket screw for one hole: the Kreg chart's length for the drilled part's
 * thickness, dropped to a shorter one while its tip would come within the margin of
 * the far face of the part it goes into. `seat`: where the head bears, from the edge.
 * `low`: the angle of a low-angle pocket, which has its own screws (1 1/2" in 3/4" stock, 1 1/4" in 1/2").
 */
export function pocketScrewLength(thickness: Mm, seat: Mm, room: Mm | undefined, low?: number): { length: Mm; shortened: boolean } {
  const cos = Math.cos(((low ?? POCKET.angleDeg) * Math.PI) / 180);
  // A low-angle pocket takes its own screws: longer, from a seat further in.
  const chart = (low ? lowPocketScrew(thickness) : undefined) ?? chartLength(thickness);
  if (room === undefined) return { length: chart, shortened: false };
  const fits = (length: Mm) => (length - seat) * cos <= room - SCREW_TIP_MARGIN + 1e-6;
  const length = [...POCKET_SCREW_LENGTHS].reverse().find((l) => l <= chart + 1e-6 && fits(l)) ?? POCKET_SCREW_LENGTHS[0]!;
  return { length, shortened: length < chart - 1e-6 };
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** What joins two cabinets of a run, and how many a join. Tune me. */
const SIDE_JOIN_SCREW = '#8 × 1-1/4" wood screws';
const FRAME_JOIN_SCREW = '#8 × 2-1/2" trim screws';
export const JOIN_SCREWS = 4;

/** What fastens a wall cabinet, or the wall's half of its cleat, to the studs. Tune me. */
const HANGING_SCREW = '#10 × 3" cabinet screws';
/** Through each hanging rail. Tune me. */
const RAIL_SCREWS = 2;
/** What holds a cleat's cabinet half and the spacer strip to the cabinet, and how many. Tune me. */
const CLEAT_SCREW = '#8 × 1-1/4" wood screws';
const CLEAT_SCREWS = 6;
const SPACER_SCREWS = 2;

/**
 * The label of every part: case, frame and drawer box parts by group, then doors and
 * drawer fronts. With several cabinets each cabinet counts its own, behind its tag
 * ("B-C1"), so alike cabinets have alike labels.
 */
function labelParts(parts: Part[], project: Project): Map<string, string> {
  const counts: Record<string, number> = {};
  const labels = new Map<string, string>();
  for (const part of parts) {
    const design = designsOf(project).find((d) => d.id === part.designObjectId);
    const group = !part.role
      ? design && isDrawer(design)
        ? 'DF'
        : 'DR'
      : part.role === 'frameStile' || part.role === 'frameRail'
        ? 'F'
        : part.role.startsWith('box') || part.role === 'buildOut' || part.role === 'runner'
          ? 'D'
          : part.role === 'handle'
            ? 'H'
            : 'C';
    const tag = partTag(part);
    const key = `${tag ?? ''}-${group}`;
    counts[key] = (counts[key] ?? 0) + 1;
    labels.set(part.id, `${tag ? `${tag}-` : ''}${group}${counts[key]}`);
  }
  return labels;
}

/**
 * The job's lists. `length` writes a length the way the screen shows it; it is used
 * only inside sentences (a slide's length, a shim's thickness).
 */
/** The doubled bottom's screws, up through the second layer into the bottom: how far apart round its edge, and how far in. Tune me. */
const LAYER_SCREW = '#8 × 1-1/4" flat-head wood screws';
const LAYER_SCREW_SPACING: Mm = 8 * MM_PER_INCH;
const LAYER_SCREW_IN: Mm = 1.5 * MM_PER_INCH;
/** A caster pad's own screws, up into the bottom. Tune me. */
const PAD_SCREWS = 4;

/** The front casters of a group lock: the caster with a brake that matches one without (the same plate and height), or the generic one with a brake. */
function brakedLike(caster: Caster, hardware: Hardware[]): Caster {
  const casters = hardware.filter(isCaster).filter((c) => c.locking);
  return (
    casters.find((c) => c.plate.width === caster.plate.width && c.plate.length === caster.plate.length && Math.abs(c.overallHeight.mm - caster.overallHeight.mm) < 1) ??
    casters.find((c) => c.generic) ??
    caster
  );
}

export function buildLists(job: Job, project: Project, shop: Shop, length: (mm: Mm) => string): JobLists {
  // Case, frame and drawer box first, as they are built; the fronts last.
  const all = [...job.cabinetParts, ...job.parts];
  const labels = labelParts(all, project);
  const materialName = (id: string) => {
    const material = shop.materials.find((m) => m.id === id);
    return material ? `${nominalText(material.nominalThickness)} ${material.name}` : id;
  };
  const planOf = (part: Part) => job.plan.parts.find((p) => p.partId === part.id);
  const cabinets: CabinetDesign[] = cabinetsOf(project);
  const cabinetOf = cabinetIdOf(project);

  const parts: PartRow[] = all.map((part) => {
    const blank = job.plan.blanks.find((b) => b.partIds.includes(part.id));
    return {
      partId: part.id,
      label: labels.get(part.id)!,
      name: part.name,
      material: materialName(part.materialId),
      size: part.size,
      ...(part.grain ? { grain: part.grain } : {}),
      cutOut: planOf(part)?.cutOut ?? 'cnc',
      ...(blank ? { blank: blank.index } : {}),
      steps: planOf(part)?.steps ?? [],
    };
  });

  // The cut list: saw-cut parts by material, alike parts on one row.
  const cutList: CutGroup[] = [];
  for (const part of all) {
    const plan = planOf(part);
    if (!plan || plan.cutOut === 'cnc') continue;
    const material = materialName(part.materialId);
    let group = cutList.find((g) => g.material === material && Math.abs(g.thickness - part.size.thickness) < 0.01);
    if (!group) {
      group = { material, thickness: part.size.thickness, board: isBoardPart(part), rows: [] };
      cutList.push(group);
    }
    const { width, height } = part.size;
    const long = part.grain ? (part.grain === 'width' ? width : height) : Math.max(width, height);
    const short = part.grain ? (part.grain === 'width' ? height : width) : Math.min(width, height);
    const steps = plan.steps.filter((s) => s.by === 'miterSaw' || s.by === 'jigSaw' || s.by === 'tableSaw').map((s) => `${s.label}, ${s.by === 'miterSaw' ? 'miter saw' : s.by === 'jigSaw' ? 'jig saw' : 'table saw'}`);
    const same = group.rows.find(
      (r) => Math.abs(r.length - long) < 0.01 && Math.abs(r.width - short) < 0.01 && r.saw === plan.cutOut && r.grain === !!part.grain && r.steps.join() === steps.join(),
    );
    if (same) {
      same.quantity += 1;
      same.labels.push(labels.get(part.id)!);
      // With tags the labels say whose each is, so a name is given once.
      if (!part.tag || !same.names.includes(part.name)) same.names.push(part.name);
    } else {
      group.rows.push({ quantity: 1, labels: [labels.get(part.id)!], names: [part.name], length: long, width: short, grain: !!part.grain, saw: plan.cutOut, steps });
    }
  }
  for (const group of cutList) group.rows.sort((a, b) => b.length - a.length || b.width - a.width);
  // Sheets first, thickest first; boards last.
  cutList.sort((a, b) => Number(a.board) - Number(b.board) || b.thickness - a.thickness);

  // Pocket holes: the screw for each, and the Kreg jig's rows with their positions.
  const kreg: KregRow[] = [];
  const screws = new Map<Mm, { count: number; by: Map<string, number>; shortened: boolean; hardwood: boolean }>();
  /** Some of the job's pockets are low-angle ones: their screws want a head a driver can turn off its axis. */
  let lowScrews = false;
  for (const part of all) {
    const holes = part.features.filter(isPocketHole);
    if (holes.length === 0) continue;
    const method = job.plan.pocketHoles?.method ?? pocketHoleMethod(project.plan);
    const prepped = planOf(part)?.cutOut === 'cnc' && cncPocketsFit(part, { ...project.plan, pocketHoles: method });
    const low = prepped ? lowAngleOf(method) : undefined;
    if (low) lowScrews = true;
    const seat = low ? pocketSeatOf(project.plan) : prepped ? pocketShape(part.size.thickness, MM_PER_INCH / 8).seat : KREG_SEAT;
    const rows = new Map<string, KregRow>();
    for (const hole of holes) {
      // Every cabinet's parts are in its own frame: only its own parts can take its screws.
      const into = receiver(part, hole, all.filter((p) => cabinetOf(p.designObjectId) === cabinetOf(part.designObjectId)));
      const screw = pocketScrewLength(part.size.thickness, seat, into?.depth, low);
      const entry = screws.get(screw.length) ?? { count: 0, by: new Map<string, number>(), shortened: false, hardwood: false };
      entry.count += 1;
      entry.by.set(part.name, (entry.by.get(part.name) ?? 0) + 1);
      entry.shortened ||= screw.shortened;
      entry.hardwood ||= !!into && isBoardPart(into.part);
      screws.set(screw.length, entry);
      if (prepped) continue;
      const key = `${hole.face}/${hole.edge}/${into?.part.id ?? ''}`;
      let row = rows.get(key);
      if (!row) {
        const along: PartEdge = hole.edge === 'x0' || hole.edge === 'x1' ? 'y0' : 'x0';
        row = {
          label: labels.get(part.id)!,
          part: part.name,
          face: partFaces(part)[hole.face],
          edge: edgeName(part, hole.edge),
          into: into?.part.name ?? 'the next part',
          from: edgeName(part, along),
          at: [],
          thickness: part.size.thickness,
          screw: inches(screw.length),
        };
        rows.set(key, row);
      }
      row.at.push(hole.at);
    }
    for (const row of rows.values()) {
      row.at.sort((a, b) => a - b);
      kreg.push(row);
    }
  }

  // Joints and holes made by hand: in parts the CNC would have worked but that are cut on a saw.
  const byHand: HandRow[] = [];
  const mm = (v: Mm) => `${Number(v.toFixed(2))} mm`;
  for (const part of all) {
    if (!part.role || (planOf(part)?.cutOut ?? 'cnc') === 'cnc') continue;
    const faces = partFaces(part);
    const { width, height, thickness } = part.size;
    // Across the part from its front edge where it has one, up it from its bottom edge.
    const acrossFrom: PartEdge = edgeName(part, 'x1') === 'front edge' ? 'x1' : 'x0';
    const across = (x: Mm) => (acrossFrom === 'x0' ? x : width - x);
    const row = (what: string, face: 'A' | 'B', size: string, where: string, count: number) => byHand.push({ label: labels.get(part.id)!, part: part.name, what, face: faces[face], size, where, count });
    for (const f of part.features) {
      if (f.kind !== 'dado') continue;
      const xs = f.outline.map((p) => p.x);
      const ys = f.outline.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const upright = y1 - y0 >= x1 - x0;
      const near = Math.min(across(x0), across(x1));
      const what = f.id === 'rabbet-back' ? 'Back rabbet' : f.id === 'groove-back' ? 'Back groove' : `Dado for the ${f.id.replace(/^dado-/, '').replace(/-/g, ' ')}`;
      const wide = upright ? x1 - x0 : y1 - y0;
      const where = upright
        ? `${length(near)} from its ${edgeName(part, acrossFrom)}, ${y0 < EPS && y1 > height - EPS ? 'the whole height' : `from ${length(y0)} to ${length(y1)} up from its ${edgeName(part, 'y0')}`}`
        : `its lower side ${length(y0)} up from its ${edgeName(part, 'y0')}, from ${length(near)} to ${length(near + (x1 - x0))} from its ${edgeName(part, acrossFrom)}`;
      row(what, f.face, `${length(wide)} wide × ${length(f.depth)} deep`, where, 1);
    }
    // Holes: one row for every line of holes of one purpose, the same distance from the edge.
    const lines = new Map<string, { what: string; face: 'A' | 'B'; diameter: Mm; depth: Mm; at: Mm; ys: Mm[] }>();
    for (const f of part.features) {
      if (f.kind !== 'hole' && f.kind !== 'cup') continue;
      const what = HOLE_NAMES.find(([prefix]) => f.id.startsWith(prefix))?.[2] ?? 'Holes';
      const at = across(f.center.x);
      const key = `${what}|${f.face}|${at.toFixed(2)}|${f.diameter.toFixed(2)}`;
      const line = lines.get(key) ?? { what, face: f.face as 'A' | 'B', diameter: f.diameter, depth: f.depth, at, ys: [] as Mm[] };
      line.ys.push(f.center.y);
      lines.set(key, line);
    }
    for (const line of lines.values()) {
      const ys = line.ys.sort((a, b) => a - b);
      row(
        line.what,
        line.face,
        `${mm(line.diameter)} across, ${line.depth >= thickness - EPS ? 'through' : `${mm(line.depth)} deep`}`,
        `${length(line.at)} from its ${edgeName(part, acrossFrom)}, at ${ys.map(length).join(', ')} up from its ${edgeName(part, 'y0')}`,
        ys.length,
      );
    }
  }

  const hardware: HardwareRow[] = [];
  const named = (id: string) => shop.hardware.find((h) => h.id === id)?.name ?? id;
  // A batch in hand (`batch.ts`): what is counted from a cabinet, not from its parts, is listed only when the
  // batch makes that cabinet's parts of that kind. A batch by material alone lists it all.
  const batch = job.batch ? batchInHand(project) : undefined;
  const wants = batchWants(batch);

  // Hinges: one for every cup bored in a door.
  const cups = new Map<string, number>();
  for (const part of job.parts) for (const f of part.features) if (f.kind === 'cup') cups.set(f.hardwareId, (cups.get(f.hardwareId) ?? 0) + 1);
  const plateHoles = job.cabinetParts.reduce((n, p) => n + p.features.filter((f) => f.kind === 'hole' && f.id.startsWith('hinge-plate')).length, 0);
  for (const [id, n] of cups) {
    const hinge = shop.hardware.find((h) => h.id === id);
    const onFrame = hinge?.kind === 'hinge' && hinge.cabinetType === 'faceFrame';
    hardware.push({
      group: 'Doors',
      item: named(id),
      quantity: n,
      note: plateHoles > 0 ? 'Clips onto a mounting plate on the case side.' : onFrame ? 'Screwed to the edge of the face frame by hand, with its own screws.' : 'With its own screws.',
    });
  }
  if (plateHoles > 0) {
    hardware.push({ group: 'Doors', item: 'Hinge mounting plates', quantity: plateHoles / 2, note: 'One per hinge, on the pilot holes the CNC drills in the case sides.' });
    hardware.push({ group: 'Doors', item: 'Mounting plate screws', quantity: plateHoles, note: 'Two per plate, to suit the plate and its holes.' });
    // Milestone 10: a full-overlay door hinged on a partition covers only half of it, so its plate gives half the overlay.
    const onPartition = job.cabinetParts
      .filter((p) => p.role === 'partition' && cabinets.find((c) => c.id === p.designObjectId)?.construction === 'frameless')
      .reduce((n, p) => n + p.features.filter((f) => f.kind === 'hole' && f.id.startsWith('hinge-plate')).length, 0);
    if (onPartition > 0) {
      hardware.push({ group: 'Doors', item: 'Half-overlay mounting plates (of those above)', quantity: onPartition / 2, note: 'For the hinges on a partition: the doors either side each cover half of it. Their screws are short: the holes are half the partition deep (tune me).' });
    }
  }
  const handleOf = (id: string) => shop.hardware.find((h): h is Handle => h.kind === 'handle' && h.id === id);
  const handleName = (id: string) => handleOf(id)?.name ?? 'Handle';
  const handleNote = (id: string) => {
    const holes = handleOf(id)?.holes ?? 1;
    const printed = handleOf(id)?.printed ? ' Printed: the file is with the job\'s 3D prints.' : handleOf(id)?.cnc ? ' Cut on the CNC with the job: it is in the parts list.' : '';
    return `In the ${holes === 2 ? 'two holes' : 'hole'} the CNC drills through the front, with ${holes === 2 ? 'its screws' : 'its screw'} from the back.${printed}`;
  };
  // Inset fronts (the shop style): what stops the doors, and the pulls that are fitted by hand.
  const insetDoors = hungDesigns(project, shop).filter(isDoorSet).filter((d) => d.mounting.type === 'inset' && wants(cabinetOf(d.id), 'fronts'));
  /** How many times a front is made: its cabinet's quantity. */
  const madeTimes = (design: { id: string }) => copiesOf(cabinets.find((c) => c.id === cabinetOf(design.id)) ?? { quantity: 1 });
  const doorCount = insetDoors.reduce((n, d) => n + d.mounting.doors * madeTimes(d), 0);
  if (doorCount > 0) {
    hardware.push({ group: 'Doors', item: 'Door stops or catches', quantity: doorCount, note: 'One a door: an inset door closes against nothing, so a stop or a catch sets it flush. Fitted by hand.' });
    const byHand = insetDoors.filter((d) => d.shopPull !== 'fingerPull' && !d.handle).reduce((n, d) => n + d.mounting.doors * madeTimes(d), 0);
    if (byHand > 0) hardware.push({ group: 'Doors', item: 'Knobs or pulls', quantity: byHand, note: 'Fitted by hand; nothing is cut for them.' });
  }
  // The doors' handles, by which: one a door, on the holes the CNC drills.
  const doorHandles = new Map<string, number>();
  for (const d of hungDesigns(project, shop).filter(isDoorSet)) {
    if (!d.handle || (d.mounting.type === 'inset' && d.shopPull === 'fingerPull') || !wants(cabinetOf(d.id), 'fronts')) continue;
    doorHandles.set(d.handle.handleId, (doorHandles.get(d.handle.handleId) ?? 0) + d.mounting.doors * madeTimes(d));
  }
  // A pull cut into the fronts is no hardware.
  for (const id of [...doorHandles.keys()]) if (handleOf(id)?.routed) doorHandles.delete(id);
  for (const [id, quantity] of doorHandles) hardware.push({ group: 'Doors', item: handleName(id), quantity, note: handleNote(id) });
  // Wooden handles cut on the CNC: their screws.
  const wooden = new Map<string, number>();
  for (const p of job.cabinetParts) {
    const id = p.role === 'handle' ? p.handleId : undefined;
    if (id) wooden.set(id, (wooden.get(id) ?? 0) + 1);
  }
  for (const [id, quantity] of wooden) {
    const handle = handleOf(id);
    if (!handle?.cnc) continue;
    hardware.push({
      group: 'Wooden handles',
      item: `${handle.cnc.screw} wood screws`,
      quantity: quantity * handle.holes,
      note: `For ${handle.name}: from the back of the front into a ${handle.cnc.pilot.diameter} mm pilot hole drilled ${handle.cnc.pilot.depth} mm into each foot by hand; as long as the front is thick plus about ${Math.round(handle.cnc.pilot.depth)} mm.`,
    });
  }
  // Printed handles: what holds them, for every one the job's parts have holes for.
  for (const { handle, quantity } of printedHandlesOf([...job.parts, ...job.cabinetParts], shop.hardware)) {
    const p = handle.printed!;
    const screws = quantity * handle.holes;
    const deep = fasteningHole(p).depth;
    if (p.fastening === 'heatSetInsert') {
      hardware.push({ group: 'Printed handles', item: `${p.screw} heat-set inserts`, quantity: screws, note: `For ${handle.name}: melted into the ${p.insert.diameter} mm holes in its feet with a soldering iron, flush, before it goes on.` });
    }
    hardware.push({
      group: 'Printed handles',
      item: p.fastening === 'heatSetInsert' ? `${p.screw} machine screws` : `${p.screw} screws`,
      quantity: screws,
      note: `For ${handle.name}: from the back of the front, as long as the front is thick plus about ${Math.round(deep - 2)} mm${p.fastening === 'screw' ? '; they tap the plastic, so do them up once and not hard' : ''}.`,
    });
  }

  // What the project is finished in.
  // What the project is finished in, with the area each finish covers and the amount to buy:
  // area × coats ÷ coverage, rounded up to a can. Only what the job makes counts (a batch: its parts;
  // wooden handles where there are some), and only the faces that are finished (`faceFinishes`).
  const sizes = shop.units.sizes.kind === 'mm' ? 'mm' : 'in';
  const ADVICE = {
    paint: 'MDF edges take an extra coat.',
    stain: 'Try it on an offcut of the same wood first.',
    clear: 'Sand lightly between coats.',
    primer: 'Seal MDF edges with it first.',
  };
  for (const amount of finishAmounts(project, shop, all)) {
    const { finish } = amount;
    const covers = `${coverageShown(finish.coverage, sizes)} ${coverageUnit(sizes)}${finish.tuneMe?.includes('coverage') ? ' (tune me)' : ''}`;
    hardware.push({ group: 'Finish', item: finish.name, ...cansOf(amount.litres, sizes), note: `${usesWords(amount, sizes)}. A rough area, at ${covers}. ${ADVICE[finish.kind]}` });
  }
  // Prefinished insides: said, so nobody wonders why they are not in the amounts.
  const prefinished = [project.settings.finish?.inside === 'prefinished' || cabinets.some((c) => c.insideFinish === 'prefinished') ? 'the insides of the cases' : '', project.settings.finish?.boxes === 'prefinished' ? 'the drawer boxes' : ''].filter(Boolean);
  if (prefinished.length) hardware.push({ group: 'Finish', item: 'Prefinished sheet', note: `Nothing to put on ${prefinished.join(' and ')}.` });

  // Shelf pins: the job's shelves by the pin they sit on. A cabinet with no door opening has no shelves, whatever number it keeps.
  const shelvesOn = new Map<string, number>();
  for (const cabinet of cabinets) {
    const shelves = job.cabinetParts.filter((p) => p.role === 'shelf' && p.designObjectId === cabinet.id).length;
    const pin = shelves > 0 ? shelfPinFor(cabinet, shop.hardware).name : undefined;
    if (pin) shelvesOn.set(pin, (shelvesOn.get(pin) ?? 0) + shelves);
  }
  for (const [pin, shelves] of shelvesOn) {
    hardware.push({ group: 'Case', item: pin, quantity: 4 * shelves, note: `Four per shelf, ${shelves} ${plural(shelves, 'shelf', 'shelves')}.` });
  }
  // A hanging rod: bought, cut to length by hand, on a pair of flanges screwed to the sides.
  for (const cabinet of cabinets.filter((c) => wants(c.id, 'cases'))) {
    const rod = closetRod(cabinet, shop.materials);
    if (!rod) continue;
    const made = copiesOf(cabinet);
    hardware.push({ group: 'Case', item: 'Closet rod, 1-5/16" across', quantity: made, note: `${cabinet.name}: cut to ${length(rod.length - 3)} (the inside width less 1/8" for its flanges), ${length(rod.clearUnder)} clear under it: ${hangingWords(rod.clearUnder)}.` });
    hardware.push({ group: 'Case', item: 'Closet rod flanges (a pair: one closed, one open at the top)', quantity: made, note: `${cabinet.name}: screwed to the insides of the sides, their centres ${length(rod.behind)} behind the case's front edge and ${length(rod.y)} above the floor.` });
  }
  // A power hub (lr4-sandbox's table hub): everything bought for it, and what it is wired with.
  for (const cabinet of cabinets.filter((c) => wants(c.id, 'cases'))) {
    const hub = hubOf(cabinet, shop.materials);
    if (!hub) continue;
    const group = 'Power hub';
    const at = (mm: Mm) => `${length(mm)} behind the case front`;
    hardware.push(
      { group, item: '120 V house wiring: read this first', note: `${cabinet.name}: these lines describe one way to build the hub, not an electrical design. Check it against your local code, or have an electrician look at it, and size every device for the circuit it is plugged into.` },
      { group, item: 'Power inlet, flanged, 20 A (NEMA 5-20P; 15 A to suit your circuit)', quantity: 1, note: `In the ${hub.side} side, ${at(hub.behind.inlet)}: the extension cord plugs in here.` },
      { group, item: 'Duplex receptacles, 20 A', quantity: 2, note: `In the ${hub.side} side. ${at(hub.behind.outlet)}: router (top) and vac (bottom), the tab between them broken, each on its own switch. ${at(hub.behind.accessory)}: the controller's supply (top) and an accessory (bottom), on while the paddle switch is.` },
      { group, item: 'Magnetic paddle switch (START / STOP, no restart after a power cut)', quantity: 1, note: 'On the switch panel: slap the paddle and everything is off, and stays off. Rated for the circuit: 20 A at 120 V; check its label.' },
      { group, item: 'Toggle switches, 20 A, lighted handle', quantity: 2, note: 'On the switch panel, under the combination plate: router and vac.' },
      { group, item: 'Pilot lamp, 22 mm, 120 V LED, green', quantity: 1, note: "In the combination plate's blank gang, drilled 22 mm: lit while the power is on." },
      { group, item: 'Device boxes, single-gang', quantity: 4, note: `One behind each of the three devices in the side and one behind the paddle switch. The CNC cuts an opening ${length(HUB.box.width)} × ${length(HUB.box.height)} for each of the side's three (tune me): check it against the box in hand before cutting.` },
      { group, item: 'Device box, three-gang', quantity: 1, note: `Behind the switch panel, for the lamp and the two toggles: its opening is ${length(HUB.box3)} × ${length(HUB.box.height)} (tune me).` },
      { group, item: 'Cover plates: two duplex, one for the inlet', quantity: 3, note: 'On the side.' },
      { group, item: 'Combination plate, three-gang: a blank and two toggles', quantity: 1, note: 'On the switch panel.' },
      { group, item: 'Dust ports: 2-1/2" bulkhead fittings', quantity: 2, note: `One through the ${hub.side} side, ${at(hub.behind.port)}, where the machine's hose plugs in; one through the access panel at the back, where the vac's hose plugs in. Each in a ${length(HUB.port.hole)} hole (tune me).` },
      { group, item: '2-1/2" hose, a short length, with a cuff at each end', quantity: 1, note: "Inside, from one port's stub round to the other's. A slip fit at the back port, so it pulls off when the access panel comes out." },
      { group, item: 'Hose ground: a green panel binding post (M5), 14 AWG green wire, two ring terminals, a 2-1/2" hose clamp', quantity: 1, note: "The post through the side below the port (drilled by hand): the hose's bared steel wire to it under the clamp, its back stud to the inlet box's ground." },
      { group, item: '12-3 and 12-2 NM-B cable, insulated staples, wire nuts', note: 'Inlet to the paddle switch and back switched (12-3), the toggles to the router and vac outlet (12-3), the inlet box to the accessory outlet (12-2): stapled to the inside of the case, within 12" of each box. Leave enough at the switch panel to draw it a hand\'s width forward for service; it is fixed wiring, and does not move in use.' },
      { group, item: 'Screws for the switch panel and the access panel', quantity: 8, note: 'Four through the switch panel into the two front cleats; four through the access panel into the two back cleats. No glue on either: both come off.' },
      { group, item: 'Cord clip: a 3/4" cable clamp and a wood screw', quantity: 1, note: "Under the table's edge by the port, for the router's cord and the controller supply's." },
    );
  }
  // Beside a closet tower: each stretch's rod and flanges, and brackets under a long shelf.
  for (const cabinet of cabinets.filter((c) => wants(c.id, 'cases'))) {
    for (const s of towerSpans(cabinet, shop.materials)) {
      const made = copiesOf(cabinet);
      const far = s.span.to === 'wall' ? 'the wall (into a stud, or a block screwed to two)' : 'the next tower\'s side';
      if (s.rod) {
        hardware.push({ group: 'Case', item: 'Closet rod, 1-5/16" across', quantity: made, note: `${cabinet.name}, to the ${s.side}: cut to ${length(s.x1 - s.x0 - 3)}, ${length(s.rod.clearUnder)} off the floor: ${hangingWords(s.rod.clearUnder)}.` });
        hardware.push({ group: 'Case', item: 'Closet rod flanges (a pair: one closed, one open at the top)', quantity: made, note: `${cabinet.name}, to the ${s.side}: one on the tower's side and one on ${far}, their centres ${length(s.rod.behind)} behind the tower's front edge and ${length(s.rod.y)} above the floor.` });
      }
      if (s.brackets > 0) {
        hardware.push({ group: 'Case', item: s.rod ? 'Shelf and rod brackets' : 'Shelf brackets', quantity: s.brackets * made, note: `${cabinet.name}, to the ${s.side}: the shelf is ${length(s.x1 - s.x0)} long, more than it carries between its ends: ${s.brackets === 1 ? 'one bracket in the middle' : `${s.brackets} brackets evenly along it`}, screwed to the wall into a stud.` });
      }
    }
  }
  // A piece that stands on its own and can tip: tall, or drawers under a top of its own.
  const tippy = cabinets.filter((c) => needsAntiTip(c) && wants(c.id, 'cases'));
  if (tippy.length) {
    const straps = tippy.reduce((n, c) => n + copiesOf(c), 0);
    hardware.push({ group: 'Case', item: 'Anti-tip strap (furniture restraint), with its screws', quantity: straps, note: `One for ${tippy.map((c) => c.name).join(', ')}: screwed to the top of its back and to a stud in the wall, so that it cannot tip forward with its drawers out or when climbed.` });
  }
  /**
   * A torsion top's folding leaf: what hinges it, lines it up, pulls it tight and holds it up. `across`: the joint's
   * length; `under`: the top's underside off the floor; `ownerId`: the piece its parts are of.
   */
  const torsionLeafRows = (leaf: Mm, across: Mm, under: Mm, ownerId: string) => {
    // A backer in every cell along the joint, in each box.
    const backers = job.cabinetParts.filter((q) => q.designObjectId === ownerId && q.name.startsWith('Hinge backer')).length;
    hardware.push(
      { group: 'Torsion table', item: 'Continuous (piano) hinge, 3" open, heavy (steel, 1/16" or more)', note: `${length(across)} of it, under the joint between the table and its leaf, its knuckle on the joint line and down. Its leaves are 1-1/2" wide, so its holes are over the hinge backers, not over the ribs' edges (tune me).` },
      { group: 'Torsion table', item: '1/4"-20 machine screws, 1-1/4", with T-nuts', quantity: 2 * backers, note: "For the hinge's half under the part that stays, two in each hinge backer: with the leaf down they carry it in tension, which a wood screw in a rib's edge would not. The T-nuts sit on top of the backers, inside the box: fit them before the top skin goes on." },
      { group: 'Torsion table', item: '#10 wood screws, 1"', quantity: 2 * backers, note: "For the hinge's half under the leaf, two into each of its backers through the bottom skin: they are loaded across, not pulled out." },
      { group: 'Torsion table', item: 'Levelling feet on a 3/8"-16 stud, with threaded inserts', quantity: LEAF.rest.count, note: `For the leaf to stand on when it is down, so its weight is on the floor and not on the hinge: the inserts in the holes the CNC drilled in the outside of the leaf's far rib, the feet wound out to reach the floor, about ${length(Math.max(0, under - leaf))} with the leaf hanging. Wind them in before the leaf comes up if they are in the way.` },
      { group: 'Torsion table', item: 'Brass table-leaf alignment pins and sockets, 5/16"', quantity: LEAF.pin.count, note: "The pins glued into the leaf's joint rib and the sockets into the table's, in the holes the CNC drilled: they line the two tops up as the leaf swings up." },
      { group: 'Torsion table', item: 'Draw latches', quantity: 2, note: 'One on each long edge across the joint, to pull it closed and hold it; adjust them so the two faces meet tight.' },
      { group: 'Torsion table', item: 'Locking folding leg brackets', quantity: 2, note: "Under the leaf's far end, one near each corner, screwed through its bottom skin into a rib." },
      { group: 'Torsion table', item: 'Legs for the leaf, 2×2, with a levelling foot each', quantity: 2, note: `About ${length(under - 40)} long with the foot wound in (the table's underside is ${length(under)} off the floor): cut them to suit the foot, and set the feet with a straightedge across the joint.` },
    );
  };
  /** A slab's drop leaf: its hinges, and the brackets or the legs it rests on. `hangs`: what a bracket is hinged to. */
  const dropLeafRows = (group: string, where: string, leaf: Mm, joint: Mm, under: Mm, hangs: string, leaves = 1) => {
    const one = dropLeafSupport(leaf, joint);
    // (Two leaves, one on each of two opposite edges: twice the hardware.)
    const support = { ...one, count: one.count * leaves };
    hardware.push({ group, item: 'Drop-leaf hinges, or 2-1/2" butt hinges', quantity: dropLeafHinges(joint) * leaves, note: `Under the ${length(joint)} joint of ${where}: their knuckles on the joint line and down, let in flush if the two edges do not close tight (tune me).` });
    if (support.kind === 'brackets') {
      hardware.push({ group, item: 'Swing-out drop-leaf brackets', quantity: support.count, note: `For ${where}, ${length(leaf)} long: under the part that stays, about ${length(Math.min(DROP_LEAF.bracket.inset, joint / 4))} in from each end of the joint, each hinged to ${hangs}. They swing out square under the leaf to hold it and in flat to let it down. A leaf on brackets is for light work: lean on it and it racks (tune me).` });
    } else {
      hardware.push(
        { group, item: 'Locking folding leg brackets', quantity: support.count, note: `For ${where}, ${length(leaf)} long: under its far edge, ${one.count === 2 ? 'one near each corner' : 'in the middle'}, screwed up into the leaf.` },
        { group, item: 'Legs for the leaf, 2×2, with a levelling foot each', quantity: support.count, note: `About ${length(under - 40)} long with the foot wound in (the top's underside is ${length(under)} off the floor): cut to suit the foot, and set with a straightedge across the joint.` },
      );
    }
  };
  // Tops (milestone 7): screwed up through each covered cabinet; a solid wood top on figure-8 fasteners, so it can move.
  const pieces = topPieces(project, shop.materials).filter((p) => p.cabinetIds.some((id) => wants(id, 'tops')));
  if (pieces.length && project.context.kind === 'designedCabinet') {
    const tops = topSettingsOf(project.context);
    const covered = new Set(pieces.flatMap((p) => [...p.cabinetIds, ...(p.island?.alsoOver ?? [])]));
    const solid = shop.materials.find((m) => m.id === tops.materialId)?.id === BUTCHER_BLOCK_ID;
    const fasteners = TOP_FASTENERS * covered.size;
    hardware.push(
      solid
        ? { group: 'Tops', item: 'Figure-8 desktop fasteners', quantity: fasteners, note: `${TOP_FASTENERS} a cabinet, let into the top edge of the sides and screwed up into the top (tune me).` }
        : { group: 'Tops', item: TOP_SCREW, quantity: fasteners, note: `${TOP_FASTENERS} a cabinet, up through the stretchers into the top (tune me).` },
    );
    // A bought top: the stock lengths to buy are on the buying list; its end caps and end splashes here.
    const boughtPieces = pieces.filter((p) => p.settings.kind === 'bought');
    const bought = boughtPieces.length ? boughtTopOf(boughtPieces[0]!.settings, shop.hardware) : undefined;
    if (bought) {
      const openEnds = boughtPieces.reduce((n, p) => n + (['left', 'right'] as const).filter((e) => p.ends[e] === 'open').length, 0);
      const wallEnds = boughtPieces.reduce((n, p) => n + (['left', 'right'] as const).filter((e) => p.ends[e] === 'wall').length, 0);
      if (openEnds) hardware.push({ group: 'Tops', item: `End caps for ${bought.name.toLowerCase()}`, quantity: openEnds, note: 'Ironed or glued on the open ends after cutting (tune me).' });
      if (wallEnds && bought.backsplash) hardware.push({ group: 'Tops', item: 'End splashes', quantity: wallEnds, note: 'At each end against a side wall, screwed to the top and caulked (tune me).' });
    }
    if (pieces.some((p) => p.settings.kind === 'made' && p.settings.backsplash.on && backAgainstWall(project, p))) hardware.push({ group: 'Tops', item: 'Construction adhesive and caulk', note: 'The backsplash is glued down to the top and caulked to it and to the wall.' });
    // A torsion table (milestone 8): glue for its skins, brads where a skin takes them.
    for (const p of pieces.filter((x) => x.torsion)) {
      const t = p.torsion!;
      const thin = (id: string) => (shop.materials.find((m) => m.id === id)?.nominalThickness.mm ?? 0) <= THIN_SKIN + 0.01;
      hardware.push({ group: 'Torsion table', item: 'Wood glue', note: 'On every rib edge under the skins, and in the egg-crate\'s slots.' });
      // A folding leaf: what hinges it, lines it up, pulls it tight and holds it up.
      if (p.leaf) torsionLeafRows(p.leaf.length, p.leaf.edge === 'back' ? p.x1 - p.x0 : p.zFront - p.zBack, p.y, p.cabinetId);
      if (!thin(t.skins.bottomId) || !thin(t.skins.topId)) hardware.push({ group: 'Torsion table', item: '18 ga brad nails, 1-1/4"', note: 'Through a skin into the ribs, where the skin is thicker than 1/8"; a thinner skin is glued and weighted only (tune me).' });
    }
    // A slab's drop leaf: its hinges, and the brackets or the legs it rests on.
    for (const p of pieces.filter((x) => x.leaf && x.settings.kind === 'made')) dropLeafRows('Tops', `the leaf at the top's ${leafEdgeWords(p.leaf!.edge)}`, p.leaf!.length, p.leaf!.edge === 'back' ? p.x1 - p.x0 : p.zFront - p.zBack, p.y, "the cabinet's side or to a block screwed under the top");
    // A side for stools past 10": bought brackets under the overhang, fastened by hand.
    for (const p of pieces.filter((x) => seatingBrackets(x) > 0))
      hardware.push({ group: 'Tops', item: 'Countertop support brackets', quantity: seatingBrackets(p), note: `Under the side for stools, ${length(p.seating!.overhang)} past the cabinets at the top's ${leafEdgeWords(p.seating!.edge)}: one about every ${length(SEATING.every)} of its ${length(seatingEdgeLength(p))}, screwed to the cabinets' backs or sides by hand, flush under the top. As long as about two thirds of the overhang (tune me).` });
    // A mitre is drawn tight with connector bolts from below: its edge is on the diagonal, where the pocket holes are not drilled.
    const mitres = pieces.filter((p) => p.mitre).length / 2;
    if (mitres > 0) hardware.push({ group: 'Tops', item: 'Countertop connector bolts', quantity: 3 * mitres, note: 'Three along each mitre, in pockets routed from underneath by hand (tune me).' });
    const joints = pieces.reduce((n, p) => n + (p.pockets?.length ?? 0), 0);
    if (joints > 0) hardware.push({ group: 'Tops', item: 'Wood glue', note: `In the ${joints} butt ${joints === 1 ? 'joint' : 'joints'} between top pieces, with the pocket screws.` });
  }
  // Tables: the figure-8 fasteners that hold each top down, and bought corner braces where the
  // aprons are not pocket-screwed to the legs.
  if (project.context.kind === 'designedCabinet') {
    for (const frame of framesOf(project).filter((f) => wants(f.id, 'cases'))) {
      const made = copiesOf(frame);
      let fasteners = 0;
      try {
        fasteners = frameFasteners(frame, project.context, shop.materials);
      } catch {
        // A table that cannot be made has no parts, and nothing to hold down.
        continue;
      }
      hardware.push({
        group: 'Tables',
        item: 'Figure-8 desktop fasteners',
        quantity: fasteners * made,
        note: `${frame.name}: ${fasteners} under its top, along the aprons. A small steel plate shaped like an 8: one loop is let flush into the top edge of an apron and screwed to it, the other is screwed up into the top; it swivels, so a solid top can move (tune me).`,
      });
      hardware.push({ group: 'Tables', item: '#8 × 5/8" pan-head wood screws', quantity: 2 * fasteners * made, note: `${frame.name}: two through each figure-8 fastener, one into the apron and one up into the top.` });
      // A torsion box for a top: its glue and brads, and adhesive under it.
      const box = frameTop(frame, project.context).torsion;
      if (box) {
        const thin = (id: string) => (shop.materials.find((m) => m.id === id)?.nominalThickness.mm ?? 0) <= THIN_SKIN + 0.01;
        hardware.push({ group: 'Torsion table', item: 'Wood glue', note: `${frame.name}: on every rib edge under the skins, and in the egg-crate's slots.` });
        if (!thin(box.skins.bottomId) || !thin(box.skins.topId)) hardware.push({ group: 'Torsion table', item: '18 ga brad nails, 1-1/4"', note: `${frame.name}: through a skin into the ribs, where the skin is thicker than 1/8"; a thinner skin is glued and weighted only (tune me).` });
        hardware.push({ group: 'Tables', item: 'Construction adhesive', note: `${frame.name}: a bead along the aprons' top edges under the torsion box, with the fasteners: their screws hold only in its bottom skin.` });
      }
      // Its leaf: a torsion box's, or a slab's on brackets hinged to the apron.
      const leaf = frameLeafOf(frame, project.context, shop.materials);
      if (leaf && box) torsionLeafRows(leaf.length, leaf.joint, leaf.under, frame.id);
      else if (leaf) dropLeafRows('Tables', leaf.both ? `${frame.name}: each of its two leaves (${leafSidesWords(leaf.edge, true)})` : `${frame.name}: the leaf at its ${leafEdgeWords(leaf.edge)}`, leaf.length, leaf.joint, leaf.under, 'the apron under the joint', leaf.both ? 2 : 1);
      if (frame.joint === 'dowels') {
        hardware.push({ group: 'Tables', item: '3/8" × 1-1/2" fluted dowel pins', quantity: 8 * FRAME_DOWELS.perJoint * made, note: `${frame.name}: ${FRAME_DOWELS.perJoint} at each end of each apron, into the leg, with glue. Their holes are drilled by hand through the printed dowel jig (the jigs page).` });
      }
      if (frame.joint === 'braces') {
        hardware.push({ group: 'Tables', item: 'Corner braces for table legs, with hanger bolts, washers and nuts', quantity: 4 * made, note: `${frame.name}: one in each corner, screwed to the two aprons; its hanger bolt is screwed into the leg's inside corner and drawn tight with the nut.` });
      }
    }
  }
  // Casters (milestone 9): each group's, the brake ones at the front, their screws, and the doubled bottom's screws.
  for (const g of casterGroups(project, shop.hardware)) {
    if (!g.members.some((m) => wants(m.cabinet.id, 'cases'))) continue;
    // A lone cabinet made more than once has a set under each.
    const made = g.members.length === 1 ? copiesOf(g.members[0]!.cabinet) : 1;
    const locking = g.places.filter((p) => p.locking).length;
    // Bought feet stand where casters would: listed as feet, and none has a brake.
    const feet = !!g.caster.foot;
    const group = feet ? 'Feet' : 'Casters';
    const braked = g.caster.locking || feet ? g.caster : brakedLike(g.caster, shop.hardware);
    const rest = g.places.length - (braked === g.caster ? g.places.length : locking);
    if (braked !== g.caster) hardware.push({ group, item: braked.name, quantity: locking * made, note: `${g.name}: the front end ones, so it stays put.` });
    hardware.push({ group, item: g.caster.name, quantity: (braked === g.caster ? g.places.length : rest) * made, note: `${g.name}: ${g.places.length} under it, screwed to ${g.under === 'layer' ? 'the doubled bottom on the pilot holes' : g.under === 'bottom' ? 'the bottom itself, by hand' : 'the pads under the bottom on the pilot holes'}${braked === g.caster && !feet ? '; all have a brake, lock the front ones' : ''}.` });
    if (g.under === 'bottom') {
      hardware.push({ group, item: g.caster.screw, quantity: 4 * g.places.length * made, note: "Four through each foot's plate into the bottom: no longer than the bottom is thick." });
      continue;
    }
    hardware.push({ group, item: g.caster.screw, quantity: 4 * g.places.length * made, note: g.under === 'layer' ? `Four through each ${feet ? 'foot' : 'caster'}'s plate into the doubled bottom.` : `Four through each ${feet ? 'foot' : 'caster'}'s plate into its pad (two into each of the two pads at a join).` });
    if (g.under === 'pads') {
      // A pad under each caster: four screws up through each, clear of the plate's own.
      const pads = all.filter((p) => /\/caster-pad-\d+$/.test(p.id) && (p.copy ?? 1) === 1 && g.members.some((m) => m.cabinet.id === p.designObjectId)).length;
      hardware.push({ group, item: LAYER_SCREW, quantity: PAD_SCREWS * pads * made, note: `${PAD_SCREWS} up through each caster pad into the bottom and the side's lower edge, clear of the plate's screws, with glue (tune me).` });
      continue;
    }
    const around = g.members.reduce((n, m) => n + Math.max(4, Math.ceil((2 * (m.width + m.depth)) / LAYER_SCREW_SPACING)), 0);
    hardware.push({ group, item: LAYER_SCREW, quantity: around * made, note: `The second layer up into the bottom and the sides' lower edges, every ${length(LAYER_SCREW_SPACING)} round its edge, ${length(LAYER_SCREW_IN)} in, with glue (tune me).` });
  }
  // Under a sink: the slides its trays run on, and a pair of printed stands for each height a strip is set at.
  const jigHeights = new Set<Mm>();
  for (const cabinet of cabinets) {
    if (!wants(cabinet.id, 'inside')) continue;
    const under = deriveUnderSink(cabinet, shop.materials, shop.hardware);
    for (const h of under?.jigHeights ?? []) if (slideJigProblems(h).length === 0) jigHeights.add(h);
    if (under?.tiltOut) hardware.push({ group: 'Under the sink', item: 'Tilt-out tray hinges', quantity: copiesOf(cabinet), unit: 'pair', note: 'The false front over the doors hangs on them and tips forward; the tray is screwed to its back (tune me: choose a pair that suits the front).' });
    // A false front made here: tilt-out hinges for one that tips, screws for one that is fixed.
    const falseFronts = falseFrontsOf(project, cabinet, shop.materials);
    const tilting = falseFronts.filter((f) => f.design.falseFront?.tiltOut).length;
    if (tilting) hardware.push({ group: 'False fronts', item: 'Tilt-out tray hinges', quantity: tilting * copiesOf(cabinet), unit: 'pair', note: 'The false front hangs on them and tips forward; its tray is screwed to its back (tune me: choose a pair that suits the front).' });
    if (falseFronts.length > tilting) hardware.push({ group: 'False fronts', item: '#8 × 1-1/4" wood screws', quantity: 4 * (falseFronts.length - tilting) * copiesOf(cabinet), note: 'Four through from behind each fixed false front: through its blocks, or through the face frame\'s stiles.' });
    const rackCount = under?.doorRacks?.racks.length ?? 0;
    if (rackCount) hardware.push({ group: 'Under the sink', item: '#6 × 1" flat-head wood screws', quantity: 4 * rackCount * copiesOf(cabinet), note: `Door racks: four through the back strip of each into the door. Shorter than the strip and the door together (tune me: a 3/4" door takes 1").` });
    for (const b of under?.bottomSlides ?? []) {
      hardware.push({ group: 'Under the sink', item: `${b.name}, ${length(b.length.mm)}`, quantity: copiesOf(cabinet), unit: 'pair', note: `Under the tray on the cabinet's floor: screwed down to the floor, the tray's bottom fastened to them from underneath with the slides pulled out. ${b.height} mm tall; bought (tune me: sized from one maker's sheet).` });
    }
    for (const used of under?.slides?.lengths ?? []) {
      hardware.push({ group: 'Under the sink', item: `${under!.slides!.slide.name}, ${length(used.length.mm)}`, quantity: used.pairs * copiesOf(cabinet), note: 'Pairs: one a tray, screwed to the standards each side of it and to the tray, by hand.' });
    }
  }
  // An L-shaped corner cabinet: a lazy susan in it, and its two doors hinged together (milestone 6).
  for (const cabinet of cabinets) {
    if (cabinet.corner?.kind !== 'lShaped' || !wants(cabinet.id, 'cases')) continue;
    const made = copiesOf(cabinet);
    if (!susanOf(cabinet)) hardware.push({ group: 'Corner cabinets', item: `Lazy susan, two pie-cut shelves on a pole, ${length(lazySusanDiameter(cabinet))} across`, quantity: made, note: 'Its pole stands on the bottom and is fixed to the top: fitted by hand (tune me: choose one that fits).' });
    if (doorsOnSusan(cabinet)) {
      hardware.push({ group: 'Corner cabinets', item: 'Angle brackets, about 1-1/2", with screws', quantity: 8 * made, note: "The doors of the lazy susan: two under each shelf behind each door, screwed to the shelf and to the door's back (tune me)." });
      hardware.push({ group: 'Corner cabinets', item: 'Stop for the pole that brings the doors back flush', quantity: made, note: "At the pole's bottom pivot: a detent or a spring catch that holds the susan where its doors close the cabinet (tune me: many pole pivots have one)." });
    } else hardware.push({ group: 'Corner cabinets', item: 'Bi-fold hinges', quantity: 2 * made, note: 'Two a cabinet, joining its two doors at the corner (tune me).' });
  }
  // A lazy susan made here: what it turns on is bought.
  for (const cabinet of cabinets) {
    if (!susanOf(cabinet) || !wants(cabinet.id, 'cases')) continue;
    let susan: ReturnType<typeof deriveSusan>;
    try {
      susan = deriveSusan(cabinet, shop.materials);
    } catch {
      continue;
    }
    if (!susan) continue;
    const made = copiesOf(cabinet);
    if (susan.turns === 'bearings') {
      hardware.push({ group: 'Corner cabinets', item: 'Lazy susan bearing ring, 12"', quantity: 2 * made, note: `One under each shelf of the lazy susan made here (${length(susan.diameter)} across): the lower on the cabinet's bottom, the upper on the fixed shelf, each centred under its shelf and screwed to both (tune me: any flat ring about 5/16" high; untested).` });
    } else {
      hardware.push({ group: 'Corner cabinets', item: `Pole, 1-1/4" round, ${length(susan.poleLength ?? 0)} long`, quantity: made, note: 'Through the centres of the two shelves of the lazy susan made here: a steel tube or a hardwood rod, cut to stand between its two pivots (tune me: measure them first; untested).' });
      hardware.push({ group: 'Corner cabinets', item: 'Pole pivots for a 1-1/4" pole, top and bottom', quantity: made, unit: 'pair', note: "One screwed to the cabinet's bottom and one under its top, in line: the pole turns in them (tune me)." });
      hardware.push({ group: 'Corner cabinets', item: 'Shelf flanges for a 1-1/4" pole, with a set screw', quantity: 2 * made, note: 'One under each shelf, screwed up into it and locked to the pole at its height (tune me).' });
    }
    if (susan.rim !== 'none') hardware.push({ group: 'Corner cabinets', item: 'Wood glue', note: `The lazy susan's rims: in the groove round each shelf${susan.rim === 'kerfed' ? ', and in the slots as they close' : ', and between the two strips'}.` });
  }
  for (const cabinet of cabinets) {
    // Through screws: one for every hole the CNC drills through the sides.
    const caseScrews = job.cabinetParts.filter((p) => p.designObjectId === cabinet.id).reduce((n, p) => n + p.features.filter((f) => f.kind === 'hole' && f.id.startsWith('case-screw')).length, 0);
    if (caseScrews > 0) {
      hardware.push({
        group: 'Case',
        item: CASE_SCREW,
        quantity: caseScrews,
        note: 'Through the sides from outside, in the holes the CNC drills. Countersink the holes and drill a pilot into the end of the part through each, by hand (tune me).',
      });
    }
    // An existing case has its back already; a batch fastens only the backs it makes.
    if (cabinet.joinery.back !== 'groove' && cabinet.joinery.back !== 'tabs' && !cabinet.existing && (!batch || job.cabinetParts.some((p) => p.role === 'back' && cabinetOf(p.id) === cabinet.id))) {
      hardware.push({
        group: 'Case',
        item: '18 ga brads or staples, about 5/8" long',
        note: `Back: every 4" to 6" into the ${cabinet.joinery.back === 'rabbet' ? 'rabbets' : 'rear edges of the sides'}, ${job.cabinetParts.some((p) => p.role === 'bottom' && cabinetOf(p.id) === cabinet.id) ? 'the bottom and the back stretcher' : 'the back stretchers'}. No glue.`,
      });
    }
  }

  // Wall cabinets: what holds each to the wall. Counted per cabinet and copy. Tune me.
  // One that is already there hangs already.
  for (const cabinet of cabinets.filter((c) => c.form === 'wall' && !c.existing && wants(c.id, 'cases'))) {
    const made = copiesOf(cabinet);
    // A hutch stands on another piece's top: screwed to it from underneath, not hung.
    if (cabinet.onTop) {
      hardware.push({ group: 'Hanging', item: '#8 × 1-1/4" wood screws', quantity: 6 * made, note: `${cabinet.name}: up through the top it stands on into its sides and bottom, two a side and two between (tune me).` });
      continue;
    }
    if (cabinet.hanging === 'rails') {
      hardware.push({ group: 'Hanging', item: HANGING_SCREW, quantity: 2 * RAIL_SCREWS * made, note: `Wall cabinets on hanging rails: ${RAIL_SCREWS} through each rail into the wall studs (tune me).` });
    } else {
      // One into every stud the wall's half of the cleat crosses, studs 16" apart; never fewer than two.
      const studs = Math.max(2, Math.floor(cabinet.size.width.mm / (16 * MM_PER_INCH)) + 1);
      hardware.push({ group: 'Hanging', item: HANGING_SCREW, quantity: studs * made, note: 'French cleat: the wall\'s half into every stud it crosses (tune me).' });
      hardware.push({ group: 'Hanging', item: CLEAT_SCREW, quantity: (CLEAT_SCREWS + SPACER_SCREWS) * made, note: `French cleat: the cabinet's half to the rear edges of the top and the sides (${CLEAT_SCREWS}) and the spacer strip (${SPACER_SCREWS}), with glue (tune me).` });
    }
  }

  // Runs: neighbours are screwed together through their sides, or through their stiles behind face frames.
  if (project.context.kind === 'designedCabinet') {
    for (const run of project.context.runs) {
      const members = cabinets.filter((c) => c.runId === run.id);
      for (let i = 0; i + 1 < members.length; i++) {
        // A join is made once both its cabinets are: in a batch, when it makes the cases of both.
        if (!wants(members[i]!.id, 'cases') || !wants(members[i + 1]!.id, 'cases')) continue;
        const framed = members[i]!.construction === 'faceFrame' || members[i + 1]!.construction === 'faceFrame';
        hardware.push({
          group: 'Runs',
          item: framed ? FRAME_JOIN_SCREW : SIDE_JOIN_SCREW,
          quantity: JOIN_SCREWS,
          note: framed
            ? `Cabinets joined side by side: ${JOIN_SCREWS} a join, through the edge of one stile into the next; drill and countersink by hand (tune me).`
            : `Cabinets joined side by side: ${JOIN_SCREWS} a join, through one side into the next, inside the case; drill and countersink by hand (tune me).`,
        });
      }
    }
  }

  // Drawers: the slides, what carries them, and the screws that hold the front.
  let shims: JobLists['shims'];
  for (const drawer of designsOf(project).filter(isDrawer)) {
    // A drawer's slides, strips and screws go with its box, its handle with its front: in a batch, with either.
    if (!wants(cabinetOf(drawer.id), 'drawerBoxes') && !wants(cabinetOf(drawer.id), 'fronts')) continue;
    const box = (() => {
      try {
        return drawerBox(drawer, project, shop);
      } catch {
        return undefined; // a box that cannot be made is reported on the Design screen
      }
    })();
    if (!box) {
      // On a cabinet that is already there only a front is made: its handle, and the screws that hold it to the box that is there.
      const there = cabinets.find((c) => drawer.mounting.openingId.startsWith(`${c.id}/`))?.existing;
      if (there && job.parts.some((p) => p.id === `${drawer.id}/front`)) {
        if (drawer.handle && !handleOf(drawer.handle.handleId)?.routed) hardware.push({ group: 'Drawer', item: handleName(drawer.handle.handleId), quantity: 1, note: handleNote(drawer.handle.handleId) });
        hardware.push({ group: 'Drawer', item: '#8 washer-head screws', quantity: 4, note: `${drawer.name}: the new front to the drawer box that is there, from inside the box; shorter than the box front and the new front are thick together.` });
      }
      continue;
    }
    // This drawer's pilot holes: in the case sides they carry its id, in its own strips they do not.
    // Counted for one copy of its cabinet; the rows below are for one drawer and multiplied at the end.
    const pilots = job.cabinetParts.filter((p) => (p.copy ?? 1) === 1).reduce(
      (n, p) => n + p.features.filter((f) => f.kind === 'hole' && f.id.startsWith(p.designObjectId === drawer.id ? 'slide-screw' : `slide-screw-${drawer.id}-`)).length,
      0,
    );
    const several = designsOf(project).filter(isDrawer).length > 1 && drawer.name !== 'Drawer';
    const from = hardware.length;
    if (box.slide) {
      hardware.push({
        group: 'Drawer',
        item: `${box.slide.slide.name}, ${length(box.slide.length.mm)}`,
        quantity: 1,
        unit: 'pair',
        note:
          (box.mount === 'case' ? 'On the case sides' : box.mount === 'strips' ? 'On the build-out strips' : box.mount === 'uprights' ? 'Screwed to what stands beside the drawer: the board between two small drawers, the uprights between two bays (or a short mullion and the board like it at the back); beside a post or a side, to the frame and a block at the back' : 'Fixed to the back of the face frame and to rear brackets') +
          (pilots > 0 ? `; the CNC drills ${pilots} pilot holes for its screws.` : '; placed and screwed on by hand, with its own screws.') +
          (box.slide.slide.mount === 'bottom' ? " Each box side stands on its drawer member, which is screwed up into the side's bottom edge; the cabinet members go on level with the bottom edge of the box." : ''),
      });
    }
    // Its handle, on the holes the CNC drills.
    if (drawer.handle && !box.fingerPull && !handleOf(drawer.handle.handleId)?.routed) {
      // Two knobs on a wide front that asks for two: counted from the holes bored for them.
      const bored = job.projectParts.find((p) => p.designObjectId === drawer.id && p.features.some((f) => f.kind === 'hole' && f.id.startsWith('handle')))?.features.filter((f) => f.kind === 'hole' && f.id.startsWith('handle')).length ?? 0;
      const each = handleOf(drawer.handle.handleId)?.holes || 1;
      hardware.push({ group: 'Drawer', item: handleName(drawer.handle.handleId), quantity: Math.max(1, Math.round(bored / each)), note: handleNote(drawer.handle.handleId) });
    }
    // A shop drawer whose pull is fitted by hand.
    if (box.front !== 'applied' && !box.fingerPull && !drawer.handle) hardware.push({ group: 'Drawer', item: 'Knob or pull', quantity: 1, note: 'Fitted by hand; nothing is cut for it.' });
    if (box.mount === 'runners') {
      // A drawer on runners: its strips are screwed to the case sides, and something at the back stops it flush.
      const strips = box.parts.filter((p) => p.role === 'runner').length;
      if (strips > 0) {
        hardware.push({
          group: 'Drawer',
          item: RUNNER_SCREW,
          quantity: strips * RUNNER_SCREWS,
          note: `Runner and kicker strips to the case sides, ${RUNNER_SCREWS} each, with glue; drill and countersink by hand (tune me).`,
        });
      }
      hardware.push({ group: 'Drawer', item: 'Drawer stops, cut from scrap', quantity: 2, note: 'Glued to the case at the back of the drawer on runners, set so its front closes flush. Wax the runners.' });
    }
    if (box.mount === 'rearBrackets') {
      hardware.push({ group: 'Drawer', item: box.slide?.slide.mount === 'bottom' ? 'Rear sockets for the slides (the maker\'s socket set)' : 'Rear mounting brackets for the slides', quantity: 1, unit: 'pair', note: `Screwed to the ${box.bracketOn === 'nailer' ? 'back stretcher' : 'back'}.` });
    }
    if (box.mount === 'strips') {
      // The strip and the side of the drawer's own cabinet behind it.
      const cabinet = cabinets.find((c) => drawer.mounting.openingId.startsWith(`${c.id}/`));
      const strip = (box.stripThickness ?? 0) + (cabinet ? (shop.materials.find((m) => m.id === cabinet.materials.caseId)?.measuredThickness.mm ?? 0) : 0);
      const fit = [...WOOD_SCREW_LENGTHS].reverse().find((l) => l <= strip - FRONT_SCREW_MARGIN) ?? WOOD_SCREW_LENGTHS[0]!;
      hardware.push({ group: 'Drawer', item: `#8 × ${inches(fit)} wood screws`, quantity: 2 * STRIP_SCREWS, note: `Build-out strips to the case sides, ${STRIP_SCREWS} each, with glue (tune me).` });
      if (box.shim) {
        shims = { thickness: box.shim.thickness, length: box.shim.length, height: box.shim.height, quantity: (shims?.quantity ?? 0) + 2 * box.shim.perStrip };
      }
    }
    // The front's screws: as long as the box front and the applied front allow, short of its face.
    const boxFront = job.cabinetParts.find((p) => p.id === `${drawer.id}/box-front`);
    const front = job.parts.find((p) => p.id === `${drawer.id}/front`);
    const holes = boxFront?.features.filter((f) => f.kind === 'hole' && f.id.startsWith('front-screw')) ?? [];
    if (boxFront && front && holes.length > 0) {
      const recess = front.features.find((f) => f.kind === 'pocket');
      // Over the recessed panel the front is thinner by the recess; the bevel round it counts as recess.
      const thin = holes.some((f) => {
        if (f.kind !== 'hole' || !recess || recess.kind !== 'pocket' || !front.placement || !boxFront.placement) return !!recess;
        const v = sub(inCabinet(boxFront, f.center.x, f.center.y, 0), front.placement.origin);
        const x = dot(v, front.placement.xAxis);
        const y = dot(v, front.placement.yAxis);
        const xs = recess.outline.map((p) => p.x);
        const ys = recess.outline.map((p) => p.y);
        const pad = recess.depth + 5;
        return x > Math.min(...xs) - pad && x < Math.max(...xs) + pad && y > Math.min(...ys) - pad && y < Math.max(...ys) + pad;
      });
      const grip = front.size.thickness - (thin && recess?.kind === 'pocket' ? recess.depth : 0);
      const room = boxFront.size.thickness + grip - FRONT_SCREW_MARGIN;
      const fit = [...WOOD_SCREW_LENGTHS].reverse().find((l) => l <= room) ?? WOOD_SCREW_LENGTHS[0]!;
      hardware.push({
        group: 'Drawer',
        item: `#8 × ${inches(fit)} washer-head screws`,
        quantity: holes.length,
        note: `Applied front, from inside the box${thin ? '; short enough for the recessed panel' : ''}.`,
      });
    }
    // A drawer of a cabinet that is made several times is made that often: so are its slides, screws and shims.
    const times = madeTimes(drawer);
    if (times > 1) {
      for (const row of hardware.slice(from)) if (row.quantity !== undefined) row.quantity *= times;
      if (box.shim && box.mount === 'strips' && shims) shims.quantity += (times - 1) * 2 * box.shim.perStrip;
    }
    // Several drawers: rows that are the same for each are counted on one line.
    if (several) {
      for (const row of hardware.splice(from)) {
        const same = hardware.find((r) => r.group === row.group && r.item === row.item && r.unit === row.unit && r.note === row.note && r.quantity !== undefined && row.quantity !== undefined);
        if (same) same.quantity! += row.quantity!;
        else hardware.push(row);
      }
    }
  }

  [...screws.entries()]
    .sort(([a], [b]) => b - a)
    .forEach(([len, entry]) => {
      const by = [...entry.by.entries()].map(([name, n]) => `${name} ${n}`).join(', ');
      hardware.push({
        group: 'Pocket screws',
        item: `${inches(len)} pocket screws, coarse thread`,
        quantity: entry.count,
        note: `${by}.${entry.shortened ? ` Shorter than the ${lowScrews ? '' : 'Kreg '}chart, so the tip stays inside the part it goes into.` : ''}${entry.hardwood ? ' Fine thread where they go into hardwood.' : ''}${lowScrews ? ' In a low-angle pocket: a head the driver can turn from off its axis (Torx or square drive; a pocket-hole machine\'s maker asks for cheese-head Torx).' : ''}`,
      });
    });

  // Edge banding, when the cabinet has it.
  const banded = all.filter((p) => p.banding?.edges.length && !p.banding.strip);
  if (banded.length > 0) {
    const run = banded.reduce((sum, p) => sum + p.banding!.edges.reduce((s, e) => s + (e === 'x0' || e === 'x1' ? p.size.height : p.size.width), 0), 0);
    hardware.push({ group: 'Case', item: `Edge banding, ${length(run)} in all`, note: `${banded.length} ${plural(banded.length, 'part')}; allow extra for trimming.` });
  }

  const prep = job.plan.pocketHoles?.prep;
  if (prep) {
    hardware.push({ group: 'Pocket-hole prep', item: 'Printed drill guide', quantity: prep.guides.length, note: `3MF on the Plan screen${prep.guides.length > 1 ? ': one for each thickness of stock' : ''}.` });
    const sleeve = jigSleeve(prep.guides[0]!);
    hardware.push({ group: 'Pocket-hole prep', item: `Metal sleeve, ${sleeveWords(sleeve)}`, quantity: sleeve.count * prep.guides.length, note: `Bore × outside × length: a stainless spacer or a bronze bushing, plain or flanged. ${sleeve.count === 2 ? 'Two' : 'One'} a guide; the size is the Shop profile's.` });
    hardware.push({ group: 'Pocket-hole prep', item: `${POCKET.drill} mm or 5/32" drill bit`, quantity: 1, note: `A regular one: ${Math.ceil(Math.max(...prep.drilling.map((d) => d.bitOutOfChuck)))} mm stands out of the chuck.` });
  }
  // A printed cover for each pocket hole that was given a ledge for one: a plate for each bit the ledges are cut with.
  const plates = new Map<string, number>();
  for (const o of job.plan.operations) if (o.kind === 'pocketLedge' && o.source.kind === 'features') plates.set(o.clearToolId ?? '', (plates.get(o.clearToolId ?? '') ?? 0) + o.source.refs.length);
  // Over a low-angle pocket the cover is another plate, for its angle and seat.
  const lowCover = lowAngleOf(pocketHoleMethod(project.plan));
  for (const [toolId, quantity] of plates) {
    const bit = shop.tools.find((t) => t.id === toolId)?.name;
    const kind = lowCover ? `, low angle ${lowCover}°` : '';
    hardware.push({ group: '3D prints', item: `Pocket-hole covers${kind}${bit ? `, for a ledge cut with the ${bit}` : ''}`, quantity, note: `One for each pocket hole with a ledge round it: print them from the Jigs page ("Pocket-hole cover", with that bit chosen${lowCover ? `, the pocket at ${lowCover}° and the job's seat` : ''}), and press each in after its screw is driven.` });
  }
  for (const jig of job.plan.installKit) {
    hardware.push({
      group: '3D prints',
      item: jig.template === 'supportBlock' ? 'Door support blocks' : jig.quantity > 1 ? `Door gap shims, ${length(jig.params.thickness ?? 0)} thick` : 'Door gap shim',
      quantity: jig.quantity,
      note: 'Install kit (3MF).',
    });
  }
  if (shims) {
    hardware.push({
      group: '3D prints',
      item: `Slide shims, ${length(shims.thickness)} thick`,
      quantity: shims.quantity,
      note: `${length(shims.length)} × ${length(shims.height)} pads on the face of the build-out strips, under the slide (3MF).`,
    });
  }

  // The list is the job's total: with several cabinets, rows that are the same for each are counted on one line.
  if (cabinets.length > 1 || hardware.some((h) => h.group === 'Runs')) {
    for (const row of hardware.splice(0)) {
      const same = hardware.find((r) => r.group === row.group && r.item === row.item && r.unit === row.unit && r.note === row.note && (r.quantity === undefined) === (row.quantity === undefined));
      if (!same) hardware.push(row);
      else if (same.quantity !== undefined) same.quantity += row.quantity!;
    }
  }

  const slideJigs = [...jigHeights].sort((a, b) => a - b).map((height) => ({ height, quantity: 2 }));
  for (const jig of slideJigs) hardware.push({ group: 'Under the sink', item: `Slide jigs, ${length(jig.height)} high`, quantity: jig.quantity, note: "Printed stands: a build-out strip rests on two of them, level at its height, while it is screwed to the cabinet's side (3MF)." });
  return { buying: [...buyingList(job, project, shop, all, planOf, materialName, length), ...topsToBuy(project, shop, length)], parts, cutList, hardware, kreg, byHand, ...(shims ? { shims } : {}), ...(slideJigs.length ? { slideJigs } : {}) };
}

/**
 * The tops not made here (milestone 7): a bought laminate top's stock lengths, one per
 * piece, the shortest that covers it, with the cuts to make on it; a measured top (stone)
 * as an order, its size from the piece.
 */
function topsToBuy(project: Project, shop: Shop, length: (mm: Mm) => string): BuyRow[] {
  if (project.context.kind !== 'designedCabinet') return [];
  // Each top by its own kind: a torsion box, a piece's own top and a slab made here are not bought.
  const pieces = topPieces(project, shop.materials).filter((p) => p.settings.kind === 'bought' || p.settings.kind === 'measured');
  return pieces.map((p) => {
    const bought = boughtTopOf(p.settings, shop.hardware);
    const long = p.x1 - p.x0;
    const deep = bought?.depth.mm ?? p.zFront - p.zBack;
    const mitres = p.mitre ? `, a mitre at its ${p.mitre.end} end` : '';
    if (!bought) return { material: 'Countertop, to order', quantity: 1, unit: 'piece' as const, size: { width: long, height: deep }, note: `Measured: ${length(long)} long × ${length(deep)} deep${mitres}. Order it; nothing is cut here.` };
    const stock = boughtLength(bought, long);
    return {
      material: bought.name,
      quantity: 1,
      unit: 'piece' as const,
      size: { width: stock, height: bought.depth.mm },
      note: long > stock + 0.5 ? `Longer than any length it comes in: ${length(long)} needed; join two.` : `Cut to ${length(long)}${mitres}.`,
    };
  });
}

/**
 * What to buy for the job's parts (milestone 5): each blank on the CNC is a sheet of its
 * material, or a piece of the stock on hand when the plan has one; saw-cut parts of a
 * sheet material take sheets by their area with a share for waste (tune me); solid wood
 * is bought by the board foot, on its nominal thickness, with a share for waste (tune me).
 */
function buyingList(job: Job, project: Project, shop: Shop, all: Part[], planOf: (part: Part) => PartPlan | undefined, materialName: (id: string) => string, length: (mm: Mm) => string): BuyRow[] {
  const rows: BuyRow[] = [];
  const machine = shop.machines.find((m) => m.id === shop.activeMachineId);
  const own = project.plan.blank.stock;
  const materialOf = (id: string) => shop.materials.find((m) => m.id === id);
  // A material sold in sheets says so; one that says nothing (solid wood) is bought as boards.
  const sheetOf = (id: string) => {
    const s = materialOf(id)?.sheets?.[0];
    return s ? { width: s.x.mm, height: s.y.mm } : undefined;
  };
  const isBoard = (part: Part) => isBoardPart(part) || !sheetOf(part.materialId);
  const ids = [...new Set(all.map((p) => p.materialId))];
  for (const id of ids) {
    const name = materialName(id);
    const parts = all.filter((p) => p.materialId === id);
    const everyBlank = job.plan.blanks.filter((b) => b.materialId === id);
    // A blank bigger than the sheet the parts are laid out on (a part too big for it gets one as big as it needs)
    // is bought at its own size, not as one more piece of the usual size.
    const usual = own ?? (machine ? { width: machine.defaultSheet.x, height: machine.defaultSheet.y } : undefined);
    const within = (b: { width: number; height: number }, s: { width: number; height: number }) => (b.width <= s.width + 1e-6 && b.height <= s.height + 1e-6) || (b.width <= s.height + 1e-6 && b.height <= s.width + 1e-6);
    const blanks = everyBlank.filter((b) => !usual || within(b.size, { width: usual.width.mm, height: usual.height.mm }));
    const bigger = everyBlank.filter((b) => !blanks.includes(b));
    const sawn =parts.filter((p) => planOf(p)?.cutOut !== 'cnc' && !isBoard(p));
    const boards = parts.filter((p) => planOf(p)?.cutOut !== 'cnc' && isBoard(p));
    const sheet = sheetOf(id);
    if (blanks.length) {
      // Each blank is cut from one piece of stock: the plan's stock on hand, or the
      // machine profile's sheet. Pieces that size come out of a bought sheet so many at a time.
      const stock = own ?? (machine ? { width: machine.defaultSheet.x, height: machine.defaultSheet.y } : undefined);
      const piece = stock ? { width: stock.width.mm, height: stock.height.mm } : undefined;
      const numbers = `blank${blanks.length === 1 ? '' : 's'} ${blanks.map((b) => b.index).join(', ')}`;
      const fit = (a: number, b: number) => Math.floor(a / b + 1e-6);
      const perSheet = sheet && piece ? Math.max(fit(sheet.width, piece.width) * fit(sheet.height, piece.height), fit(sheet.width, piece.height) * fit(sheet.height, piece.width)) : 0;
      const same = !!sheet && !!piece && perSheet === 1 && Math.abs(sheet.width * sheet.height - piece.width * piece.height) < 1;
      if (sheet && perSheet > 0) {
        rows.push({
          material: name,
          quantity: Math.ceil(blanks.length / perSheet),
          unit: 'sheet',
          size: sheet,
          note: same
            ? `For the CNC: one sheet for each blank (${numbers}).`
            : `For the CNC: one ${length(piece!.width)} × ${length(piece!.height)} piece for each blank (${numbers}), ${perSheet} to a sheet.`,
        });
      } else {
        rows.push({
          material: name,
          quantity: blanks.length,
          unit: 'piece',
          ...(piece ? { size: piece } : {}),
          note: `For the CNC: one piece${piece ? ' of this size' : ''} for each blank (${numbers})${sheet ? '' : ', glued up if need be'}.`,
        });
      }
    }
    // The bigger ones, a line for each size: a whole sheet where one holds it, else a piece that size.
    const sizes = new Map<string, typeof bigger>();
    for (const b of bigger) {
      const key = `${Math.round(b.size.width)}x${Math.round(b.size.height)}`;
      sizes.set(key, [...(sizes.get(key) ?? []), b]);
    }
    for (const group of sizes.values()) {
      const size = { width: group[0]!.size.width, height: group[0]!.size.height };
      const numbers = `blank${group.length === 1 ? '' : 's'} ${group.map((b) => b.index).join(', ')}`;
      const whole = !!sheet && within(size, sheet);
      const fit = (a: number, b: number) => Math.floor(a / b + 1e-6);
      const aSheet = whole ? Math.max(fit(sheet!.width, size.width) * fit(sheet!.height, size.height), fit(sheet!.width, size.height) * fit(sheet!.height, size.width)) : 1;
      rows.push({
        material: name,
        quantity: Math.ceil(group.length / aSheet),
        unit: whole ? 'sheet' : 'piece',
        size: whole ? sheet! : size,
        note: whole
          ? `For the CNC: one ${length(size.width)} × ${length(size.height)} piece for each blank (${numbers}), bigger than the usual piece, ${aSheet} to a sheet.`
          : `For the CNC: one piece of this size for each blank (${numbers}), bigger than the usual piece${sheet ? '' : ', glued up if need be'}.`,
      });
    }
    if (sawn.length && sheet) {
      const area = sawn.reduce((sum, p) => sum + p.size.width * p.size.height, 0);
      const quantity = Math.max(1, Math.ceil((area * (1 + SHEET_WASTE)) / (sheet.width * sheet.height)));
      const note = `For the ${sawn.length} part${sawn.length === 1 ? '' : 's'} cut on the saw: their area and ${Math.round(SHEET_WASTE * 100)}% for the saw cuts and offcuts (tune me). Lay them out on the sheets before buying.`;
      // One line a material: the sheets for the saw are added to those for the CNC, and the note says how many are for which.
      const cnc = rows.at(-1);
      if (cnc && cnc.material === name && cnc.unit === 'sheet' && cnc.size && Math.abs(cnc.size.width - sheet.width) < 1 && Math.abs(cnc.size.height - sheet.height) < 1) {
        cnc.note = `${cnc.quantity} f${cnc.note.slice(1)} ${quantity} f${note.slice(1)}`;
        cnc.quantity += quantity;
      } else {
        rows.push({ material: name, quantity, unit: 'sheet', size: sheet, note });
      }
    }
    // Square stock is bought by the length: so many lengths as its parts, the longest first, fit in.
    const square = materialOf(id)?.section === 'square';
    if (boards.length && square) {
      const stock = materialOf(id)?.lengths?.[0]?.mm ?? 96 * MM_PER_INCH;
      const longs = boards.map((p) => Math.max(p.size.width, p.size.height));
      const side = materialOf(id)!.measuredThickness.mm;
      rows.push({
        material: name,
        quantity: stockLengths(longs, stock),
        unit: 'piece',
        size: { width: side, height: stock },
        note: `For the ${boards.length} part${boards.length === 1 ? '' : 's'} cut from it (${length(longs.reduce((a, b) => a + b, 0))} in all): ${length(stock)} lengths, ${length(side)} square as measured, each part cut from one length with a saw cut between.`,
      });
    }
    if (boards.length && !square) {
      const thickness = materialOf(id)?.nominalThickness.mm ?? boards[0]!.size.thickness;
      const cubic = boards.reduce((sum, p) => sum + p.size.width * p.size.height, 0) * thickness;
      const feet = (cubic / MM_PER_INCH ** 3 / 144) * (1 + BOARD_WASTE);
      rows.push({
        material: name,
        quantity: Math.ceil(feet * 10) / 10,
        unit: 'board feet',
        note: `For the ${boards.length} solid-wood part${boards.length === 1 ? '' : 's'}, at ${length(thickness)} nominal, with ${Math.round(BOARD_WASTE * 100)}% more for defects and ends (tune me).`,
      });
    }
  }
  return rows;
}
