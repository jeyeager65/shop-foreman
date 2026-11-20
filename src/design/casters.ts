/**
 * Casters (milestone 9). A floor cabinet on casters has a flat bottom and more of the case material
 * screwed under it, so the caster screws bite into more than one sheet: a second layer under the whole
 * case (the doubled bottom), or only a pad under each caster (`casterUnder`). The
 * casters' plates are screwed to its underside, their pilot holes drilled from its face B. A run or an
 * island stands on one set of casters under the whole group (`casterGroups`). The case itself is the same
 * as with a flat bottom: the layer or the pads lie under it, below the cabinet's floor line (y < 0 in
 * the cabinet's frame), and the cabinet stands their thickness and the caster's height off the floor.
 */
import type { CabinetDesign, CabinetSettings, Caster, Feature, Hardware, Id, Material, Mm, Part, Project } from '@/model';
import { runFit } from './runs';
import { cabinetsOf } from './settings';
import { STARTER_FOOT } from '@/libraries/casters';
import { SQUARE_2X2_ID } from '@/libraries/materials';
import { MM_PER_INCH } from '@/units';
import { rect } from './doors';
import { withGrain } from './grain';
import { thicknessOf } from './style';

/** From the cabinet's (or group's) outside edges to a caster plate's edges. Tune me. */
export const CASTER_INSET: Mm = 1.5 * MM_PER_INCH;
/** The plate screws' pilot holes: 1/8" (for #12 and #14 screws), this deep in the layer. Tune me. */
export const CASTER_PILOT = { diameter: MM_PER_INCH / 8, depth: 12 };

export const isCaster = (h: Hardware): h is Caster => h.kind === 'caster';
/** A furniture foot: hardware of the casters' kind that does not roll. */
export const isFoot = (h: Hardware): h is Caster => h.kind === 'caster' && !!h.foot;

/** The caster a cabinet names, or the generic one when the library no longer has it. */
export function casterFor(id: Id | undefined, hardware: Hardware[]): Caster {
  const casters = hardware.filter(isCaster);
  // The one named, a foot or a caster; else the generic caster (never a foot in a caster's place).
  const caster = casters.find((c) => c.id === id) ?? casters.find((c) => c.generic && !c.foot);
  if (!caster) throw new Error('The shop profile has no caster.');
  return caster;
}

/** What a cabinet's bottom stands on: a toe kick, a plinth flush with the front, nothing (a flat bottom), casters, or bought feet. */
export type BottomKind = 'toeKick' | 'plinth' | 'flat' | 'casters' | 'feet' | 'legs';
export const BOTTOM_KINDS: { title: string; value: BottomKind }[] = [
  { title: 'Toe kick', value: 'toeKick' },
  { title: 'Plinth (flush with the front, no toe space)', value: 'plinth' },
  { title: 'Flat bottom (on a bench or a base)', value: 'flat' },
  { title: 'On casters (a flat bottom, on pads or doubled)', value: 'casters' },
  { title: 'On feet (bought, under a flat bottom)', value: 'feet' },
  { title: 'On legs (a frame of legs and aprons under a flat bottom)', value: 'legs' },
];
export function bottomKindOf(kick: CabinetSettings['toeKick']): BottomKind {
  return kick.legs ? 'legs' : kick.casters ? (kick.casters.feet ? 'feet' : 'casters') : kick.off ? 'flat' : kick.plinth ? 'plinth' : 'toeKick';
}
/** Sets the bottom's kind in place; casters start at the generic caster, or keep the one named. */
export function setBottomKind(kick: CabinetSettings['toeKick'], kind: BottomKind, hardware: Hardware[]): void {
  // A leg frame is its own answer: gone with any other, kept (its sizes too) while it is the one.
  if (kind !== 'legs') delete kick.legs;
  if (kind === 'legs') {
    kick.off = true;
    delete kick.casters;
    delete kick.plinth;
    kick.legs = kick.legs ?? { height: { mm: 6 * MM_PER_INCH, unit: 'in' }, materialId: SQUARE_2X2_ID, apron: { mm: 3 * MM_PER_INCH, unit: 'in' } };
    return;
  }
  if (kind === 'toeKick' || kind === 'plinth') {
    delete kick.off;
    delete kick.casters;
    if (kind === 'plinth') kick.plinth = true;
    else delete kick.plinth;
  } else {
    kick.off = true;
    delete kick.plinth;
    if (kind === 'flat') delete kick.casters;
    else if (kind === 'feet') {
      // Feet stand where casters would. The shop gets the generic foot the first time one is asked for.
      let foot = hardware.find(isFoot);
      if (!foot) hardware.push((foot = JSON.parse(JSON.stringify(STARTER_FOOT)) as Caster));
      const named = hardware.find((h) => h.id === kick.casters?.casterId);
      kick.casters = { casterId: named && isFoot(named) ? named.id : foot.id, feet: true };
    } else {
      const named = hardware.find((h) => h.id === kick.casters?.casterId);
      kick.casters = { casterId: named && isCaster(named) && !named.foot ? named.id : casterFor(undefined, hardware).id, ...(kick.casters?.under ? { under: kick.casters.under } : {}) };
    }
  }
}

/**
 * Corner posts: the legs run up the corners of the case, on or off. On, the project's cabinets
 * are face frame ones, since the posts are the frame's stiles (a cabinet resolves so whatever is stored: `resolveCabinet`).
 */
export function setPosts(settings: Pick<CabinetSettings, 'toeKick' | 'construction'>, on: boolean): void {
  const legs = settings.toeKick.legs;
  if (!legs) return;
  if (on) {
    legs.posts = true;
    settings.construction = 'faceFrame';
  } else delete legs.posts;
}

/** What the casters are screwed to: a pad under each, or a second layer under the whole case. */
export type CasterUnder = 'pads' | 'layer';
export const CASTER_UNDERS: { title: string; value: CasterUnder }[] = [
  { title: 'A pad under each caster', value: 'pads' },
  { title: 'A second layer under the whole case', value: 'layer' },
];
/**
 * What a group's casters are screwed to: what its bottom says, or, when it says nothing, pads under a
 * cabinet on its own (a caster loads the bottom only at its corner, beside the sides) and a second layer
 * under each cabinet of a run or an island (it stiffens the bottoms between the lines of casters and at the
 * joins, where a plate is on two cabinets).
 */
export const casterUnder = (kick: CabinetSettings['toeKick'], cabinets: number): CasterUnder => kick.casters?.under ?? (cabinets > 1 ? 'layer' : 'pads');

/**
 * What a group's plates are screwed to: more of the case material, or (bought feet only) the bottom itself.
 */
export type PlatesOn = CasterUnder | 'bottom';
/** A bottom at least this thick takes a foot's plate screws on its own (3/4" plywood as measured). Tune me. */
export const FOOT_BOTTOM_MIN: Mm = 17;
/**
 * Whether a cabinet's bought feet are screwed straight to its bottom, with no pad (a pad is
 * for a caster's rolling load; under a foot it is only something to see, most of all under a case with no face
 * frame's rail in front of it). So: feet, nothing chosen for what is under them, a cabinet on its own (under a run
 * a foot at a join wants the second layer), a bottom panel `FOOT_BOTTOM_MIN` thick or more, and no face frame
 * (behind one the bottom is raised off the sides' lower edges, and the rail hides a pad). The plates go on by
 * hand: pilot holes in the bottom's underside would turn the sheet over for them.
 */
export function feetOnBottom(cabinet: CabinetDesign, materials: Material[]): boolean {
  const casters = cabinet.toeKick.casters;
  if (!casters?.feet || casters.under || cabinet.runId || cabinet.noBottom || cabinet.construction === 'faceFrame' || !onCasters(cabinet)) return false;
  const bottom = materials.find((m) => m.id === cabinet.materials.caseId);
  return !!bottom && bottom.measuredThickness.mm >= FOOT_BOTTOM_MIN - 1e-6;
}

/** The choice as a select shows it: `auto` is the field left out. */
export const CASTER_UNDER_CHOICES: { title: string; value: CasterUnder | 'auto' }[] = [
  { title: 'As usual: pads under a cabinet on its own (none under bought feet on a 3/4" bottom), a second layer under a run or an island', value: 'auto' },
  ...CASTER_UNDERS,
];
export const casterUnderChoice = (kick: CabinetSettings['toeKick']): CasterUnder | 'auto' => kick.casters?.under ?? 'auto';
export function setCasterUnderChoice(kick: CabinetSettings['toeKick'], choice: CasterUnder | 'auto'): void {
  if (!kick.casters) return;
  if (choice === 'auto') delete kick.casters.under;
  else kick.casters.under = choice;
}

/** Whether the cabinet stands on a leg frame: a floor cabinet with a rectangular case, made here. */
export function onLegs(cabinet: CabinetDesign): boolean {
  return !!cabinet.toeKick.legs && cabinet.form !== 'wall' && !cabinet.existing && cabinet.corner?.kind !== 'diagonal' && cabinet.corner?.kind !== 'lShaped';
}

/** Whether the cabinet stands on casters: a floor cabinet with a rectangular case (a diagonal or L-shaped corner cabinet does not, yet). */
export function onCasters(cabinet: CabinetDesign): boolean {
  return !!cabinet.toeKick.casters && cabinet.form !== 'wall' && cabinet.corner?.kind !== 'diagonal' && cabinet.corner?.kind !== 'lShaped';
}

/**
 * How far the bottom of the cabinet's box stands off the floor: a wall cabinet's own height,
 * the doubled bottom and the caster's height for one on casters, else nothing (undefined).
 */
export function boxOffFloor(cabinet: CabinetDesign, materials: Material[], hardware: Hardware[]): Mm | undefined {
  if (cabinet.form === 'wall') return cabinet.offFloor?.mm;
  // On a leg frame: the legs' length.
  if (onLegs(cabinet)) return cabinet.toeKick.legs!.height.mm;
  if (!onCasters(cabinet)) return undefined;
  // Bought feet screwed straight to the bottom: only their own height.
  if (feetOnBottom(cabinet, materials)) return casterFor(cabinet.toeKick.casters!.casterId, hardware).overallHeight.mm;
  return thicknessOf(materials, cabinet.materials.caseId) + casterFor(cabinet.toeKick.casters!.casterId, hardware).overallHeight.mm;
}

/** No more than this between two lines of casters, along a group or across it. Tune me. */
export const CASTER_SPACING: Mm = 36 * MM_PER_INCH;
/** What a hole keeps clear of a layer's edge to be drilled in it. */
const HOLE_EDGE: Mm = 3;

/** Where a caster stands, in a cabinet's frame or a group's: its plate's centre, `x` from the left and `behind` the front; and whether it locks. */
export interface CasterPlace {
  x: Mm;
  behind: Mm;
  locking: boolean;
}

/** A cabinet of a group on casters, in the group's frame: from `x` along, from `behind` back, and whether it faces the other way (an island's second row). */
interface Member {
  cabinet: CabinetDesign;
  x: Mm;
  behind: Mm;
  width: Mm;
  depth: Mm;
  turned: boolean;
}

/** A run, an island (its rows together) or a lone cabinet, on casters: what stands on one set of casters. */
export interface CasterGroup {
  /** A run's or an island's id, or the lone cabinet's. */
  key: string;
  name: string;
  caster: Caster;
  members: Member[];
  /** In the group's frame. */
  places: CasterPlace[];
  /** What the plates are screwed to, the same under every cabinet of the group. */
  under: PlatesOn;
}

/** Lines of casters from `a` to `b`, at its ends and at the joins between, no more than `CASTER_SPACING` apart where a join allows. */
function lines(a: Mm, b: Mm, joins: Mm[]): { at: Mm; end: 'start' | 'end' | 'join' }[] {
  const between = [...new Set(joins.map((j) => Math.round(j * 1000) / 1000))].filter((j) => j > a + 1 && j < b - 1).sort((p, q) => p - q);
  const out: { at: Mm; end: 'start' | 'end' | 'join' }[] = [{ at: a, end: 'start' }];
  let last = a;
  between.forEach((j, i) => {
    const next = between[i + 1] ?? b;
    if (next - last > CASTER_SPACING + 0.5) {
      out.push({ at: j, end: 'join' });
      last = j;
    }
  });
  out.push({ at: b, end: 'end' });
  return out;
}

/** The casters under a group's members: lines across at its ends and joins, and along at its front, back and between back-to-back rows. The front line's end casters lock. */
export function groupCasters(members: Member[], caster: Caster, name: string): CasterPlace[] {
  const cx = CASTER_INSET + caster.plate.width / 2;
  const cz = CASTER_INSET + caster.plate.length / 2;
  const depth = Math.max(...members.map((m) => m.behind + m.depth));
  const zJoins = members.flatMap((m) => [m.behind, m.behind + m.depth]);
  const out: CasterPlace[] = [];
  for (const z of lines(0, depth, zJoins)) {
    const behind = z.end === 'start' ? cz : z.end === 'end' ? depth - cz : z.at;
    // The cabinets this line runs under: at the front or the back, only those whose edge is there.
    const under = members.filter((m) => m.behind - 0.5 <= z.at && z.at <= m.behind + m.depth + 0.5);
    const a = Math.min(...under.map((m) => m.x));
    const b = Math.max(...under.map((m) => m.x + m.width));
    if (b - a < 2 * cx + caster.plate.width || depth < 2 * cz + caster.plate.length) throw new Error(`${name} is too small for four ${caster.name} casters.`);
    const xs = lines(a, b, under.flatMap((m) => [m.x, m.x + m.width]));
    xs.forEach((x, i) => out.push({ x: x.end === 'start' ? a + cx : x.end === 'end' ? b - cx : x.at, behind, locking: z.end === 'start' && (i === 0 || i === xs.length - 1) }));
  }
  return out;
}

/** A point of the group's frame in a member's own: from its left, behind its front. */
function inMember(m: Member, x: Mm, behind: Mm): { x: Mm; y: Mm } {
  return m.turned ? { x: m.x + m.width - x, y: m.behind + m.depth - behind } : { x: x - m.x, y: behind - m.behind };
}

/**
 * Every group of the project on casters (milestone 9): a run whose toe kick is on casters,
 * an island whose first row is (its rows together), a lone cabinet that is. A diagonal or
 * L-shaped corner cabinet is left out of its run's group: it has no layer to take a caster.
 */
export function casterGroups(project: Project, hardware: Hardware[]): CasterGroup[] {
  const context = project.context;
  if (context.kind !== 'designedCabinet') return [];
  const cabinets = cabinetsOf(project);
  const groups: CasterGroup[] = [];
  const rowMembers = (runId: Id, behind: Mm, turned: boolean, start: Mm): Member[] => {
    const run = context.runs.find((r) => r.id === runId);
    if (!run) return [];
    const fillers = runFit(context, run)?.fillers ?? [];
    const filler = (id: Id, end: 'left' | 'right') => fillers.find((f) => f.cabinetId === id && f.end === end)?.width ?? 0;
    let at = 0;
    const length = cabinets.filter((c) => c.runId === runId).reduce((sum, c) => sum + filler(c.id, 'left') + c.size.width.mm + filler(c.id, 'right'), 0);
    return cabinets
      .filter((c) => c.runId === runId)
      .flatMap((c) => {
        at += filler(c.id, 'left');
        const x = turned ? start + length - at - c.size.width.mm : start + at;
        at += c.size.width.mm + filler(c.id, 'right');
        return onCasters(c) ? [{ cabinet: c, x, behind, width: c.size.width.mm, depth: c.size.depth.mm, turned }] : [];
      });
  };
  const inIsland = new Set<string>();
  for (const island of context.islands ?? []) {
    const [one, two] = island.rows;
    if (!one) continue;
    island.rows.forEach((r) => inIsland.add(r));
    const first = rowMembers(one, 0, false, 0);
    if (!first.length) continue;
    const l1 = first.reduce((s, m) => Math.max(s, m.x + m.width), 0);
    const d1 = Math.max(...first.map((m) => m.depth));
    const len2 = two ? cabinets.filter((c) => c.runId === two).reduce((sum, c) => sum + c.size.width.mm, 0) : 0;
    const second = two ? rowMembers(two, d1, true, (l1 - len2) / 2) : [];
    const members = [...first, ...second];
    const caster = casterFor(first[0]!.cabinet.toeKick.casters!.casterId, hardware);
    groups.push({ key: island.id, name: `The island "${island.name}"`, caster, members, places: groupCasters(members, caster, `The island "${island.name}"`), under: casterUnder(first[0]!.cabinet.toeKick, Math.max(2, members.length)) });
  }
  for (const run of context.runs) {
    if (inIsland.has(run.id)) continue;
    const members = rowMembers(run.id, 0, false, 0);
    if (!members.length) continue;
    const caster = casterFor(members[0]!.cabinet.toeKick.casters!.casterId, hardware);
    groups.push({ key: run.id, name: `The run "${run.name}"`, caster, members, places: groupCasters(members, caster, `The run "${run.name}"`), under: casterUnder(members[0]!.cabinet.toeKick, members.length) });
  }
  for (const c of cabinets.filter((x) => !x.runId && onCasters(x))) {
    const caster = casterFor(c.toeKick.casters!.casterId, hardware);
    const members = [{ cabinet: c, x: 0, behind: 0, width: c.size.width.mm, depth: c.size.depth.mm, turned: false }];
    groups.push({ key: c.id, name: c.name || 'The cabinet', caster, members, places: groupCasters(members, caster, c.name || 'The cabinet'), under: feetOnBottom(c, project.materials) ? 'bottom' : casterUnder(c.toeKick, 1) });
  }
  return groups;
}

/** A cabinet's share of its group's casters: see `casterShares`. `caster`, `under`: the group's. */
export interface CasterShare {
  holes: Feature[];
  casters: (CasterPlace & { caster: Caster })[];
  caster: Caster;
  under: PlatesOn;
}

/**
 * Each cabinet's share of its group's casters: the pilot holes that land in its layer (a
 * caster over a join is screwed to both cabinets' layers, two holes in each), and the
 * casters it carries for the drawing (the one whose layer holds the plate's centre).
 */
export function casterShares(groups: CasterGroup[], materials: Material[]): Map<Id, CasterShare> {
  const out = new Map<Id, CasterShare>();
  for (const g of groups) {
    for (const m of g.members) out.set(m.cabinet.id, { holes: [], casters: [], caster: g.caster, under: g.under });
    const inside = (m: Member, x: Mm, behind: Mm, margin: Mm) => x >= m.x + margin && x <= m.x + m.width - margin && behind >= m.behind + margin && behind <= m.behind + m.depth - margin;
    g.places.forEach((p, i) => {
      const owner = g.members.find((m) => inside(m, p.x, p.behind, -0.5));
      if (owner) {
        const local = inMember(owner, p.x, p.behind);
        out.get(owner.cabinet.id)!.casters.push({ x: local.x, behind: local.y, locking: p.locking, caster: g.caster });
      }
      // Feet on the bottom itself go on by hand: no pilot holes.
      if (g.under === 'bottom') return;
      [-1, 1].forEach((sx, a) =>
        [-1, 1].forEach((sz, b) => {
          const x = p.x + (sx * g.caster.holes.x) / 2;
          const behind = p.behind + (sz * g.caster.holes.y) / 2;
          const m = g.members.find((k) => inside(k, x, behind, HOLE_EDGE));
          if (!m) return;
          const t = thicknessOf(materials, m.cabinet.materials.caseId);
          out.get(m.cabinet.id)!.holes.push({
            id: `caster-screw-${i + 1}-${2 * a + b + 1}`,
            kind: 'hole',
            face: 'B',
            center: inMember(m, x, behind),
            diameter: CASTER_PILOT.diameter,
            depth: Math.min(CASTER_PILOT.depth, t - 3),
            hardwareId: g.caster.id,
          });
        }),
      );
    });
  }
  return out;
}

/**
 * What is under a cabinet on casters for their plates: the layer under its whole case (the doubled bottom), or
 * a pad under each caster, with the pilot holes its share of the casters needs. None when it is not on casters.
 * A pad reaches `CASTER_INSET` beyond the plate, and stops at the cabinet's edges: in a corner it is flush with
 * the case's two outside faces, under the side's lower edge; at a join under a run each cabinet has its own
 * half, with two of the plate's four screws.
 */
export function casterLayerParts(cabinet: CabinetDesign, materials: Material[], share: CasterShare | undefined): Part[] {
  if (!onCasters(cabinet) || share?.under === 'bottom') return [];
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const W = cabinet.size.width.mm;
  const D = cabinet.size.depth.mm;
  const holes = share?.holes ?? [];
  // Face A up against the bottom and the sides' lower edges; part Y runs to the back.
  const under = (key: string, name: string, x0: Mm, y0: Mm, width: Mm, depth: Mm, drilled: Feature[]): Part =>
    withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId: cabinet.materials.caseId,
        size: { width, height: depth, thickness: t },
        placement: { origin: [x0, 0, -y0], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, width, depth) }, ...drilled],
        role: 'bottom',
      },
      'bottom',
      materials,
    );
  if (!share || share.under === 'layer') return [under('bottom-under', 'Bottom, second layer', 0, 0, W, D, holes)];
  // A pad for each caster with screws in this cabinet: its holes are named for the caster (`caster-screw-<n>-<k>`).
  const { plate, holes: spacing } = share.caster;
  const [ex, ey] = [(plate.width - spacing.x) / 2 + CASTER_INSET, (plate.length - spacing.y) / 2 + CASTER_INSET];
  const byCaster = new Map<string, (Feature & { kind: 'hole' })[]>();
  for (const h of holes) if (h.kind === 'hole') byCaster.set(h.id.split('-')[2]!, [...(byCaster.get(h.id.split('-')[2]!) ?? []), h]);
  return [...byCaster.values()].map((mine, i) => {
    const [x0, x1] = [Math.max(0, Math.min(...mine.map((h) => h.center.x)) - ex), Math.min(W, Math.max(...mine.map((h) => h.center.x)) + ex)];
    const [y0, y1] = [Math.max(0, Math.min(...mine.map((h) => h.center.y)) - ey), Math.min(D, Math.max(...mine.map((h) => h.center.y)) + ey)];
    return under(`caster-pad-${i + 1}`, 'Caster pad', x0, y0, x1 - x0, y1 - y0, mine.map((h) => ({ ...h, center: { x: h.center.x - x0, y: h.center.y - y0 } })));
  });
}

/** Rough weights, kg per cubic metre, for the load check: plywood and solid wood, and MDF (no grain). Tune me. */
export const DENSITY = { grain: 600, noGrain: 750 };

/** A rough weight of parts, in kg: their volume (outer size) times a density by material. */
export function partsWeight(parts: Part[], materials: Material[]): number {
  return parts.reduce((sum, p) => {
    const m = materials.find((x) => x.id === p.materialId);
    const density = m?.hasGrain === false ? DENSITY.noGrain : DENSITY.grain;
    return sum + ((p.size.width * p.size.height * p.size.thickness) / 1e9) * density;
  }, 0);
}

/** Groups whose casters carry less than the parts above them weigh (a rough estimate): the casters, the weight and what they carry. */
export function casterLoadProblems(groups: CasterGroup[], parts: Part[], materials: Material[]): string[] {
  return groups.flatMap((g) => {
    const ids = new Set(g.members.map((m) => m.cabinet.id));
    const weight = partsWeight(parts.filter((p) => ids.has(p.designObjectId) && (p.copy ?? 1) === 1), materials);
    const carries = g.places.length * g.caster.load;
    return weight > carries
      ? [`${g.name} weighs about ${Math.round(weight)} kg before what goes in it; its ${g.places.length} casters carry ${carries} kg. Choose bigger casters.`]
      : [];
  });
}
