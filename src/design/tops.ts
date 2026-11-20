/**
 * Tops (milestone 7): a countertop over a floor run, or over a floor cabinet in no run.
 * Its outline follows the cabinets it covers: their fronts plus the front overhang, back to
 * the wall, over a filler at a wall end, past an open end by the open-end overhang. A tall
 * cabinet stops it: the top on either side of one butts its side. Corner cabinets that are
 * not boxes (diagonal, L-shaped) are not covered yet.
 *
 * A top is drawn in the frame of the first cabinet it covers (they stand in a line), and is
 * that cabinet's part, like a filler.
 */
import type { BoughtTop, CabinetDesign, DesignedCabinetContext, Hardware, LeafEdge, Material, Mm, OwnTop, TopLeaf, Part, Point, Project, Run, TopDesign, TopSettings, TorsionSettings, TorsionTable, Vec3 } from '@/model';
import { applianceFootprint, appliancePlace, applianceShapeId, appliancesOf, inTop, underCounter } from './appliances';
import { LEAF, deriveTorsionParts, leafHardwareShapes, lightTopTable, torsionRibProblem, torsionThickness } from './torsion';
import { DROP_LEAF, dropLeafShapes } from './dropLeaf';
import { pocketRow } from './pocketHoles';
import { PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID } from '@/libraries';
import { INCH_DISPLAY, MM_PER_INCH, formatLength, len } from '@/units';
import { withGrain } from './grain';
import { DOOR_STANDOFF } from './openings';
import { runEnds, runFit } from './runs';
import { cabinetsOf } from './settings';
import { cabinetPlaces, inCabinet, inRoom } from './room';
import { EDGE_BAND_THICKNESS, constructionRules, thicknessOf } from './style';
import { storedCases } from './settings';

/** The starter tops: 3/4" plywood with a 3/4" hardwood strip on its front and open ends, 1" over the front and an open end, a 4" backsplash. Tune me. */
export function starterTopSettings(): TopSettings {
  return {
    kind: 'made',
    materialId: PLYWOOD_3_4_ID,
    layers: 1,
    overhang: { front: len('1"'), openEnd: len('1"') },
    edge: { kind: 'strip', thickness: len('3/4"') },
    backsplash: { on: true, height: len('4"') },
  };
}

/** The project's top values: its own, or the starter ones. */
export function topSettingsOf(context: Pick<DesignedCabinetContext, 'tops'>): TopSettings {
  return context.tops ?? starterTopSettings();
}

/** One top's settings: Setup's, with what that top says differs from them (`TopDesign.settings`). */
export function topSettingsFor(settings: TopSettings, top?: TopDesign): TopSettings {
  return top?.settings ? { ...settings, ...top.settings } : settings;
}

/** The torsion box's values a top of that kind is made by: its settings', or the light top's. */
export function torsionSettingsOf(settings: TopSettings): TorsionSettings {
  return settings.torsion ?? lightTopTable();
}

/**
 * The torsion box one top is, when its settings (already its own: `topSettingsFor`) say it is one: the box's values
 * with the top's typed size. Its leaf is given to it by `topPieces`, once the top's edges are known.
 */
export function torsionOf(settings: TopSettings, top?: TopDesign): TorsionTable | undefined {
  if (settings.kind !== 'torsion') return undefined;
  return { ...torsionSettingsOf(settings), ...(top?.size ? { size: top.size } : {}) };
}

/**
 * One top piece: a run of covered cabinets between two ends. In the frame of `cabinetId`
 * (the first it covers): from `x0` to `x1` along it, from `zBack` (the wall) to `zFront`,
 * standing on the cabinets at `y`. Each end says what it meets.
 */
export interface TopPiece {
  id: string;
  cabinetId: string;
  /** The cabinets under it, left to right. */
  cabinetIds: string[];
  x0: Mm;
  x1: Mm;
  zBack: Mm;
  zFront: Mm;
  y: Mm;
  ends: { left: TopEnd; right: TopEnd };
  /** The run it is on, if any. */
  runId?: string;
  /**
   * An end mitred where it meets another top at a corner: the mitre's line across the piece
   * in its frame, from the corner of the walls to the corner of the two fronts. What of the
   * piece is beyond the line, toward that end, is cut off.
   */
  mitre?: { end: 'left' | 'right'; from: [Mm, Mm]; to: [Mm, Mm] };
  /** The joint ends whose edge takes the pocket screws into the piece beside it (a split, or a butt joint at a corner). */
  pockets?: ('left' | 'right')[];
  /**
   * On an island (milestone 8): it covers every row and overhangs all round, its back edge
   * open too: no backsplash, an edge strip at the back as at the front. `alsoOver`: the
   * cabinets of its second row.
   */
  island?: { alsoOver: string[] };
  /** What this piece is made by: Setup's values, with what its top says differs, or a piece's own top's (`pieceSettings`). */
  settings: TopSettings;
  /** Set when its kind is a torsion box (milestone 8): the box it is, with its typed size and its leaf. */
  torsion?: TorsionTable;
  /**
   * The ends where it stops at another top's front edge with nothing joining the two: a torsion box does not join
   * another top at a corner.
   */
  stops?: ('left' | 'right')[];
  /**
   * The leaf it has: the piece reaches `length` beyond its fixed part on that edge,
   * and that much of it folds down. `refused`: it was asked for one it cannot have, and why; it has none.
   */
  leaf?: { edge: LeafEdge; length: Mm };
  leafRefused?: string;
  /** Its side for stools: that edge is `overhang` past the cabinets. `seatingRefused`: it was asked for one it cannot have, and why. */
  seating?: { edge: LeafEdge; overhang: Mm };
  seatingRefused?: string;
  /** A piece's own top: made here as it says, whatever Setup's kind. Its back edge is open, as an island's. */
  own?: OwnTop;
}

/**
 * What an end of a top meets: a wall (no overhang; a side splash), nothing (the open-end
 * overhang), a tall cabinet's side, or the next piece of the same top (a joint over a
 * cabinet join, where a top longer than its material comes is split).
 */
export type TopEnd = 'wall' | 'open' | 'tall' | 'joint';

/** Whether a top can stand on the cabinet: a base cabinet, a box (not a diagonal or L-shaped corner); a tall one too under a top of its own (a bookcase's). */
const coverable = (c: CabinetDesign) => (c.form === 'base' || (c.form === 'tall' && !!c.top?.own && !c.runId)) && c.corner?.kind !== 'diagonal' && c.corner?.kind !== 'lShaped';

/** The settings a piece is made by: Setup's, or for a piece's own top what it says, made here in one layer with no backsplash. */
export function pieceSettings(settings: TopSettings, piece: Pick<TopPiece, 'own'>): TopSettings {
  const own = piece.own;
  if (!own) return settings;
  // A torsion box of its own.
  if (own.torsion) return { ...settings, kind: 'torsion', torsion: own.torsion, backsplash: { ...settings.backsplash, on: false } };
  const glued = own.edge.kind === 'strip' || own.edge.kind === 'banding' ? own.edge.kind : 'none';
  return { ...settings, kind: 'made', materialId: own.materialId ?? settings.materialId, layers: 1, edge: { kind: glued, thickness: own.edge.thickness ?? settings.edge.thickness }, backsplash: { ...settings.backsplash, on: false } };
}

/** How thick a top of a piece's own, or a table's, is: its slab, or its torsion box. */
export function ownTopThickness(own: OwnTop, settings: TopSettings, materials: Material[]): Mm {
  return own.torsion ? torsionThickness(own.torsion, materials) : thicknessOf(materials, own.materialId ?? settings.materialId);
}

/** The top a new piece's own top, or a new table's, starts as: the project's answer (Setup), else the starter one. A copy. */
export function newOwnTop(context: Pick<DesignedCabinetContext, 'furniture'>): OwnTop {
  return JSON.parse(JSON.stringify(context.furniture?.top ?? starterOwnTop())) as OwnTop;
}

/** A top of its own to start from: 3/4" over the front and the ends, flush at the back, a solid wood strip all round. Tune me. */
export function starterOwnTop(): OwnTop {
  return { overhang: { front: len('3/4"'), ends: len('3/4"'), back: len('0"') }, edge: { kind: 'strip', thickness: len('3/4"'), size: len('1/8"') } };
}

/** Where the fronts' faces are, forward of the case front: the face frame, the bumpers and a door. Flush (0) when inset. */
export function frontOf(cabinet: CabinetDesign, materials: Material[], context: DesignedCabinetContext): Mm {
  const rules = constructionRules(cabinet, materials);
  if (rules.inset) return 0;
  // Between corner posts the fronts are flush with the frame's face.
  if (rules.inFrame) return rules.frontPlane;
  return rules.frontPlane + DOOR_STANDOFF + thicknessOf(materials, context.fronts.doors.materialId);
}

/** A bought top's library entry, when the project's tops are bought. */
export function boughtTopOf(settings: TopSettings, hardware: Hardware[]): BoughtTop | undefined {
  if (settings.kind !== 'bought') return undefined;
  return hardware.find((h): h is BoughtTop => h.kind === 'boughtTop' && h.id === settings.boughtTopId) ?? hardware.find((h): h is BoughtTop => h.kind === 'boughtTop');
}

/** The shortest stock length a bought top piece comes in that covers it, or the longest when none does. */
export function boughtLength(top: BoughtTop, length: Mm): Mm {
  return (top.lengths.find((l) => l.mm >= length - 0.5) ?? top.lengths.at(-1)!).mm;
}

/** Every top piece in the project: on the covered runs, split at tall cabinets, and on covered lone floor cabinets. */
export function topPieces(project: Project, materials: Material[]): TopPiece[] {
  const context = project.context;
  if (context.kind !== 'designedCabinet') return [];
  const settings = topSettingsOf(context);
  const cabinets = cabinetsOf(project);
  const pieces: TopPiece[] = [];
  /** The top each piece was made for: what its leaf is asked of. */
  const asked = new Map<TopPiece, TopDesign>();
  const piece = (members: CabinetDesign[], at: Map<string, Mm>, ends: { left: TopEnd; right: TopEnd }, fill: { left: Mm; right: Mm }, runId: string | undefined, top: TopDesign) => {
    const own = topSettingsFor(settings, top);
    const torsion = torsionOf(own, top);
    const first = members[0]!;
    const last = members.at(-1)!;
    const over = (end: TopEnd, filler: Mm) => (end === 'open' ? own.overhang.openEnd.mm : end === 'wall' ? filler : 0);
    const base = at.get(first.id)!;
    const box = {
      x0: -over(ends.left, fill.left),
      x1: at.get(last.id)! - base + last.size.width.mm + over(ends.right, fill.right),
      zBack: -Math.max(...members.map((c) => c.size.depth.mm)),
      zFront: Math.max(...members.map((c) => frontOf(c, materials, context))) + own.overhang.front.mm,
    };
    if (torsion) {
      // A torsion box is over its front, its open ends and an open back by its own overhang; at a wall
      // and at a tall cabinet's side it stops, as a slab does.
      const o = torsion.overhang.mm;
      const stopped = { left: ends.left !== 'open', right: ends.right !== 'open' };
      const backOpen = !backAgainstWall(project, { cabinetId: first.id });
      // What is under it, with a wall end's filler: where a typed size is measured from, or centred on.
      const foot = { x0: stopped.left ? box.x0 : 0, x1: stopped.right ? box.x1 : at.get(last.id)! - base + last.size.width.mm, zBack: box.zBack, zFront: box.zFront - own.overhang.front.mm };
      [box.x0, box.x1, box.zBack, box.zFront] = [foot.x0 - (stopped.left ? 0 : o), foot.x1 + (stopped.right ? 0 : o), foot.zBack - (backOpen ? o : 0), foot.zFront + o];
      if (torsion.size) {
        // Typed: from the wall (or the tall cabinet) at an end that meets one, else centred on what is under it;
        // between two the length is theirs. Across, from the wall at its back, else centred.
        const [long, wide] = [torsion.size.length.mm, torsion.size.width.mm];
        const middle = (foot.x0 + foot.x1) / 2;
        if (stopped.left && !stopped.right) box.x1 = foot.x0 + long;
        else if (stopped.right && !stopped.left) box.x0 = foot.x1 - long;
        else if (!stopped.left && !stopped.right) [box.x0, box.x1] = [middle - long / 2, middle + long / 2];
        if (backOpen) [box.zBack, box.zFront] = [(foot.zBack + foot.zFront) / 2 - wide / 2, (foot.zBack + foot.zFront) / 2 + wide / 2];
        else box.zFront = foot.zBack + wide;
      }
    }
    pieces.push({
      id: `${first.id}/top-${pieces.filter((p) => p.cabinetId === first.id).length + 1}`,
      cabinetId: first.id,
      cabinetIds: members.map((c) => c.id),
      ...box,
      y: Math.max(...members.map((c) => c.size.height.mm)),
      ends,
      ...(runId ? { runId } : {}),
      settings: own,
      ...(torsion ? { torsion } : {}),
    });
    asked.set(pieces.at(-1)!, top);
  };
  // An island's top covers its rows; their own tops, if any, give way to it.
  const islandRows = new Set((context.islands ?? []).filter((i) => i.top).flatMap((i) => i.rows));
  for (const island of (context.islands ?? []).filter((i) => i.top)) {
    const rows = island.rows.map((id) => cabinets.filter((c) => c.runId === id && coverable(c)));
    const [one, two = []] = rows;
    if (!one?.length) continue;
    const length = (list: CabinetDesign[]) => list.reduce((sum, c) => sum + c.size.width.mm, 0);
    const [l1, l2] = [length(one), length(two)];
    const depth = (list: CabinetDesign[]) => Math.max(0, ...list.map((c) => c.size.depth.mm));
    const front = (list: CabinetDesign[]) => Math.max(0, ...list.map((c) => frontOf(c, materials, context)));
    // The second row stands back to back, centred, its fronts facing the other way.
    const behind = two.length ? depth(one) + depth(two) + front(two) : depth(one) + thicknessOf(materials, one[0]!.materials.caseId);
    // A torsion table overhangs by its own amount all round, or is the size typed, centred on the cabinets.
    const own = topSettingsFor(settings, island.top);
    const torsion = torsionOf(own, island.top);
    const over = torsion ? torsion.overhang.mm : own.overhang.openEnd.mm;
    const overFront = torsion ? torsion.overhang.mm : own.overhang.front.mm;
    const typed = torsion?.size;
    const middle = { x: (Math.min(0, (l1 - l2) / 2) + Math.max(l1, (l1 + l2) / 2)) / 2, z: (front(one) - behind) / 2 };
    const box = {
      x0: typed ? middle.x - typed.length.mm / 2 : Math.min(0, (l1 - l2) / 2) - over,
      x1: typed ? middle.x + typed.length.mm / 2 : Math.max(l1, (l1 + l2) / 2) + over,
      zBack: typed ? middle.z - typed.width.mm / 2 : -behind - overFront,
      zFront: typed ? middle.z + typed.width.mm / 2 : front(one) + overFront,
    };
    // The lone cabinets it covers too (a peninsula's corner box): their footprint and the overhang, then cut back to the room's walls.
    const covered = cabinets.filter((c) => island.covers?.includes(c.id) && !c.runId && coverable(c));
    const ends: { left: TopEnd; right: TopEnd } = { left: 'open', right: 'open' };
    if (!typed && covered.length) {
      const places = cabinetPlaces(project);
      const home = places?.get(one[0]!.id);
      if (places && home && context.room) {
        const toLocal = (p: Vec3): [Mm, Mm] => {
          const l = inCabinet(home, p);
          return [l[0], l[2]];
        };
        for (const c of covered) {
          const at = places.get(c.id);
          if (!at) continue;
          for (const [x, z] of [[0, -c.size.depth.mm], [c.size.width.mm, -c.size.depth.mm], [0, frontOf(c, materials, context)], [c.size.width.mm, frontOf(c, materials, context)]] as [Mm, Mm][]) {
            const [lx, lz] = toLocal(inRoom(at.at, at.turn, [x, 0, z]));
            box.x0 = Math.min(box.x0, lx - over);
            box.x1 = Math.max(box.x1, lx + over);
            box.zBack = Math.min(box.zBack, lz - over);
            box.zFront = Math.max(box.zFront, lz + over);
          }
        }
        // Cut back to the walls: the turns are square, so the piece is square to the room.
        const a = inRoom(home.at, home.turn, [box.x0, 0, box.zBack]);
        const b = inRoom(home.at, home.turn, [box.x1, 0, box.zFront]);
        const clamp = (v: Mm, hi: Mm) => Math.min(hi, Math.max(0, v));
        const ca = toLocal([clamp(a[0], context.room.length.mm), 0, clamp(a[2], context.room.width.mm)]);
        const cb = toLocal([clamp(b[0], context.room.length.mm), 0, clamp(b[2], context.room.width.mm)]);
        if (Math.abs(ca[0] - box.x0) > 0.01) ends.left = 'wall';
        if (Math.abs(cb[0] - box.x1) > 0.01) ends.right = 'wall';
        [box.x0, box.zBack, box.x1, box.zFront] = [ca[0], ca[1], cb[0], cb[1]];
      }
    }
    // A typed size is centred on everything it covers: the rows and the lone cabinets (a table over cabinets at its two ends).
    if (typed && covered.length) {
      const places = cabinetPlaces(project);
      const home = places?.get(one[0]!.id);
      if (places && home) {
        const foot = { x0: Math.min(0, (l1 - l2) / 2), x1: Math.max(l1, (l1 + l2) / 2), z0: -behind, z1: front(one) };
        for (const c of covered) {
          const at = places.get(c.id);
          if (!at) continue;
          for (const [x, z] of [[0, -c.size.depth.mm], [c.size.width.mm, -c.size.depth.mm], [0, frontOf(c, materials, context)], [c.size.width.mm, frontOf(c, materials, context)]] as [Mm, Mm][]) {
            const l = inCabinet(home, inRoom(at.at, at.turn, [x, 0, z]));
            foot.x0 = Math.min(foot.x0, l[0]);
            foot.x1 = Math.max(foot.x1, l[0]);
            foot.z0 = Math.min(foot.z0, l[2]);
            foot.z1 = Math.max(foot.z1, l[2]);
          }
        }
        const [cx, cz] = [(foot.x0 + foot.x1) / 2, (foot.z0 + foot.z1) / 2];
        [box.x0, box.x1, box.zBack, box.zFront] = [cx - typed.length.mm / 2, cx + typed.length.mm / 2, cz - typed.width.mm / 2, cz + typed.width.mm / 2];
      }
    }
    // (A table with a leaf: this is the part that stays, centred on the cabinets; the leaf is added beyond it below.)
    pieces.push({
      id: `${one[0]!.id}/top-1`,
      cabinetId: one[0]!.id,
      cabinetIds: one.map((c) => c.id),
      ...box,
      y: Math.max(...[...one, ...two, ...covered].map((c) => c.size.height.mm)),
      ends,
      island: { alsoOver: [...two, ...covered].map((c) => c.id) },
      settings: own,
      ...(torsion ? { torsion } : {}),
    });
    asked.set(pieces.at(-1)!, island.top!);
  }
  /** Lone cabinets an island's top covers have none of their own. */
  const coveredByIsland = new Set((context.islands ?? []).filter((i) => i.top).flatMap((i) => i.covers ?? []));
  for (const run of context.runs.filter((r) => r.top && !islandRows.has(r.id))) {
    const members = cabinets.filter((c) => c.runId === run.id);
    if (!members.length || members[0]!.form === 'wall') continue;
    runPieces(context, run, members, (group, at, ends, fill) => piece(group, at, ends, fill, run.id, run.top!));
  }
  for (const cabinet of cabinets.filter((c) => !c.runId && c.top && coverable(c) && !coveredByIsland.has(c.id))) {
    // A piece's own top: over the case by its own amounts on every side, its back edge open like an island's.
    const own = cabinet.top!.own;
    if (own && topSettingsFor(settings, cabinet.top).kind !== 'torsion') {
      pieces.push({
        id: `${cabinet.id}/top-1`,
        cabinetId: cabinet.id,
        cabinetIds: [cabinet.id],
        x0: -own.overhang.ends.mm,
        x1: cabinet.size.width.mm + own.overhang.ends.mm,
        zBack: -cabinet.size.depth.mm - own.overhang.back.mm,
        zFront: frontOf(cabinet, materials, context) + own.overhang.front.mm,
        y: cabinet.size.height.mm,
        ends: { left: 'open', right: 'open' },
        island: { alsoOver: [] },
        settings: pieceSettings(settings, { own }),
        own,
        ...(own.torsion ? { torsion: { ...own.torsion } } : {}),
      });
      // Its leaf is its own top's.
      asked.set(pieces.at(-1)!, own.leaf ? { leaf: own.leaf } : {});
      continue;
    }
    const end = (side: 'left' | 'right'): TopEnd => (cabinet.sides[side] === 'hidden' ? 'wall' : 'open');
    piece([cabinet], new Map([[cabinet.id, 0]]), { left: end('left'), right: end('right') }, { left: 0, right: 0 }, undefined, cabinet.top!);
  }
  // Beside an appliance a top runs over it (a dishwasher) or butts its side (a range, a refrigerator).
  meetAppliances(project, pieces);
  // Where two runs meet at a corner, one top runs into the other: a butt joint or a mitre.
  meetAtCorners(project, pieces);
  // A leaf: on an edge that is open, the piece reaches that much farther; one it cannot have is refused.
  for (const [p, top] of asked) {
    if (!top.leaf) continue;
    const why = leafRefusal(project, p, top.leaf);
    if (why) {
      p.leafRefused = why;
      continue;
    }
    const length = top.leaf.length.mm;
    if (top.leaf.edge === 'back') p.zBack -= length;
    else if (top.leaf.edge === 'left') p.x0 -= length;
    else p.x1 += length;
    p.leaf = { edge: top.leaf.edge, length };
    if (p.torsion) p.torsion = { ...p.torsion, leaf: top.leaf };
  }
  // A side for stools: that edge reaches its own amount past the cabinets, in place of the usual overhang there.
  for (const [p, top] of asked) {
    if (!top.seating) continue;
    const why = seatingRefusal(project, p, top.seating);
    if (why) {
      p.seatingRefused = why;
      continue;
    }
    const more = top.seating.overhang.mm - usualOverhang(p, top.seating.edge);
    if (top.seating.edge === 'back') p.zBack -= more;
    else if (top.seating.edge === 'left') p.x0 -= more;
    else p.x1 += more;
    p.seating = { edge: top.seating.edge, overhang: top.seating.overhang.mm };
  }
  // A piece longer than its material comes is split at the cabinet join nearest its middle, until each fits.
  // (A torsion table is not split: its skins come in pieces of their own.)
  const longest = (p: TopPiece) => (p.settings.kind === 'made' ? Math.max(0, ...(materials.find((m) => m.id === p.settings.materialId)?.sheets ?? []).map((s) => Math.max(s.x.mm, s.y.mm))) : 0);
  return pieces.flatMap((p) => (longest(p) > 0 ? split(p, longest(p), cabinets) : [p]));
}

const LEAF_EDGE_WORDS: Record<LeafEdge, string> = { left: 'left end', right: 'right end', back: 'back' };
/** An edge of a top in words: "left end", "right end", "back". */
export const leafEdgeWords = (edge: LeafEdge): string => LEAF_EDGE_WORDS[edge];
/** Where a leaf is, or a pair of them on opposite edges (`TopLeaf.both`): "back", "front and back", "two ends". */
export const leafSidesWords = (edge: LeafEdge, both?: boolean): string => (!both ? leafEdgeWords(edge) : edge === 'back' ? 'front and back' : 'two ends');

/** Numbers a seating side goes by (US kitchen practice; tune me). */
export const SEATING = {
  /** What a new one starts at (10": as far as needs no bracket), and what is comfortable at counter height. */
  start: 10 * MM_PER_INCH,
  comfortable: 15 * MM_PER_INCH,
  /** No less: under this it is an overhang, not a place to sit. */
  least: 8 * MM_PER_INCH,
  /** Past this a top made here or a laminate one wants brackets under it. */
  unsupported: 10 * MM_PER_INCH,
  /** A bracket, and a stool, about every this much of the edge. */
  every: 24 * MM_PER_INCH,
};

/** How far an island's top is past its cabinets on an edge with no seating: Setup's overhang there. */
const usualOverhang = (p: Pick<TopPiece, 'settings'>, edge: LeafEdge): Mm => (edge === 'back' ? p.settings.overhang.front.mm : p.settings.overhang.openEnd.mm);

/** Why an edge of an island's top takes no stools; nothing when it can. */
export function seatingEdgeClosed(project: Project, piece: Pick<TopPiece, 'cabinetId' | 'island' | 'ends' | 'own'>, edge: LeafEdge): string | undefined {
  if (edge !== 'back') return leafEdgeClosed(project, piece, edge);
  if (project.context.kind !== 'designedCabinet') return undefined;
  const context = project.context;
  const island = (context.islands ?? []).find((i) => context.runs.find((r) => r.id === i.rows[0])?.cabinetIds.includes(piece.cabinetId));
  return island && island.rows.length > 1 ? "The island's second row faces that way: stools would stand in front of its doors and drawers." : undefined;
}

/** Why a top piece cannot have the seating side asked of it; nothing when it can. `piece` is the top before it is added. */
export function seatingRefusal(project: Project, piece: TopPiece, seating: NonNullable<TopDesign['seating']>, length: (mm: Mm) => string = (mm) => formatLength(mm, INCH_DISPLAY)): string | undefined {
  if (!piece.island || piece.own) return 'Only an island or a peninsula has a side for stools.';
  if (piece.torsion) return 'A torsion top has no side for stools: type its size instead.';
  if (piece.leaf?.edge === seating.edge) return `No stools at the ${leafEdgeWords(seating.edge)}: the leaf is there.`;
  const closed = seatingEdgeClosed(project, piece, seating.edge);
  if (closed) return `No stools at the ${leafEdgeWords(seating.edge)}: ${closed.charAt(0).toLowerCase()}${closed.slice(1)}`;
  if (seating.overhang.mm < SEATING.least - 1e-6) return `A side for stools is at least ${length(SEATING.least)} past the cabinets.`;
  return undefined;
}

/** How long a piece's seating edge is. */
export const seatingEdgeLength = (p: Pick<TopPiece, 'seating' | 'x0' | 'x1' | 'zBack' | 'zFront'>): Mm => (!p.seating ? 0 : p.seating.edge === 'back' ? p.x1 - p.x0 : p.zFront - p.zBack);

/** The brackets under a seating side: none up to 10", then one about every 24" of the edge, two at the least. */
export function seatingBrackets(p: Pick<TopPiece, 'seating' | 'x0' | 'x1' | 'zBack' | 'zFront'>): number {
  if (!p.seating || p.seating.overhang <= SEATING.unsupported + 1e-6) return 0;
  return Math.max(2, Math.round(seatingEdgeLength(p) / SEATING.every));
}

/** How many stools stand at a seating side: one for about every 24" of it. */
export const seatingStools = (p: Pick<TopPiece, 'seating' | 'x0' | 'x1' | 'zBack' | 'zFront'>): number => (p.seating ? Math.max(1, Math.floor((seatingEdgeLength(p) + 1) / SEATING.every)) : 0);

/** A stool as it is drawn: a seat on four legs, for a counter's height. Tune me. */
/** `tucked`: its middle this far under the top's edge, where there is room; `clear`: its seat this far from the cabinets, whose finished back is in the overhang. */
const STOOL = { seat: 13 * MM_PER_INCH, seatThick: 1.5 * MM_PER_INCH, leg: 1.5 * MM_PER_INCH, underTop: 11 * MM_PER_INCH, tucked: 4 * MM_PER_INCH, clear: 2 * MM_PER_INCH };

/**
 * The stools at each seating side, for the picture only (never cut, listed or planned; they are in no job's parts,
 * only in the scene's): each a seat and four legs, drawn as the top is,
 * tucked a little under the overhang, evenly along the edge. Parts of the top's first cabinet, in its frame.
 */
export function stoolShapes(project: Project, materials: Material[]): Part[] {
  if (project.context.kind !== 'designedCabinet') return [];
  const cabinets = cabinetsOf(project);
  const seen = new Set<string>();
  return topPieces(project, materials).flatMap((p): Part[] => {
    const cabinet = cabinets.find((c) => c.id === p.cabinetId);
    // (A top split at a join is several pieces of one seating side: the stools are drawn once, along the first.)
    if (!p.seating || !cabinet || seen.has(p.cabinetId)) return [];
    seen.add(p.cabinetId);
    const n = seatingStools(p);
    const { seat, seatThick, leg, underTop } = STOOL;
    // Under the top as far as it can go and still stand clear of the cabinets and the finished back over them
    // (or the stool goes through the back panel).
    const tucked = Math.min(STOOL.tucked, p.seating.overhang - STOOL.clear - seat / 2);
    const top = p.y - underTop;
    const box = (id: string, name: string, x0: Mm, z0: Mm, w: Mm, d: Mm, y0: Mm, h: Mm, flat: boolean): Part => ({
      id: `${cabinet.id}/${id}/shape`,
      designObjectId: cabinet.id,
      name,
      // In the top's own material and finish, so they go with it.
      materialId: p.settings.materialId,
      size: flat ? { width: w, height: d, thickness: h } : { width: w, height: h, thickness: d },
      features: [],
      role: 'top',
      // Flat: face up, its thickness down from `y0 + h`. Upright: its thickness back from `z0 + d`.
      placement: flat ? { origin: [x0, y0 + h, z0 + d], xAxis: [1, 0, 0], yAxis: [0, 0, -1] } : { origin: [x0, y0, z0 + d], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
    });
    const out: Part[] = [];
    for (let i = 0; i < n; i++) {
      const along = ((i + 0.5) * seatingEdgeLength(p)) / n;
      // The seat's middle: along the edge, and a little under the top from it.
      const [cx, cz] = p.seating.edge === 'back' ? [p.x0 + along, p.zBack + tucked] : p.seating.edge === 'left' ? [p.x0 + tucked, p.zBack + along] : [p.x1 - tucked, p.zBack + along];
      const [x0, z0] = [cx - seat / 2, cz - seat / 2];
      out.push(box(`stool-${i + 1}-seat`, 'Stool (bought)', x0, z0, seat, seat, top - seatThick, seatThick, true));
      [[0, 0], [seat - leg, 0], [0, seat - leg], [seat - leg, seat - leg]].forEach(([dx, dz], k) => out.push(box(`stool-${i + 1}-leg-${k + 1}`, 'Stool (bought)', x0 + dx!, z0 + dz!, leg, leg, 0, top - seatThick, false)));
    }
    return out;
  });
}

/**
 * Why an edge of a top piece is not open, so that no leaf may hang from it: an end against a wall, at a
 * tall cabinet or an appliance, or meeting another top; a back against a wall, or over an island's second row,
 * whose doors and drawers a leaf would hang in front of. Nothing when it is open.
 */
export function leafEdgeClosed(project: Project, piece: Pick<TopPiece, 'cabinetId' | 'island' | 'ends' | 'own'>, edge: LeafEdge): string | undefined {
  if (edge !== 'back') {
    const end = piece.ends[edge];
    if (end === 'wall') return `Its ${leafEdgeWords(edge)} is against a wall.`;
    if (end === 'tall') return `Its ${leafEdgeWords(edge)} stops at a tall cabinet or an appliance.`;
    if (end === 'joint') return `Its ${leafEdgeWords(edge)} meets another top.`;
    return undefined;
  }
  if (project.context.kind !== 'designedCabinet') return undefined;
  if (piece.island && !piece.own) {
    const island = (project.context.islands ?? []).find((i) => project.context.kind === 'designedCabinet' && project.context.runs.find((r) => r.id === i.rows[0])?.cabinetIds.includes(piece.cabinetId));
    return island && island.rows.length > 1 ? "The island's second row faces that way: a leaf would hang in front of its doors and drawers." : undefined;
  }
  // (A piece's own top is open at both ends; its back is as the piece's: against a wall unless it stands free.)
  return backAgainstWall(project, { cabinetId: piece.cabinetId }) ? 'Its back is against a wall.' : undefined;
}

/**
 * Why a top piece cannot have the leaf asked of it; nothing when it can. A bought or a measured top takes none;
 * the edge must be open; and the leaf and the part that stays must each be long enough to make.
 * `piece` is the top before the leaf is added to it.
 */
export function leafRefusal(project: Project, piece: TopPiece, leaf: TopLeaf, length: (mm: Mm) => string = (mm) => formatLength(mm, INCH_DISPLAY)): string | undefined {
  const kind = piece.settings.kind;
  if (kind === 'bought') return 'A bought laminate top takes no leaf.';
  if (kind === 'measured') return 'A top that is measured for and bought takes no leaf.';
  const closed = leafEdgeClosed(project, piece, leaf.edge);
  if (closed) return `No leaf at the ${leafEdgeWords(leaf.edge)}: ${closed.charAt(0).toLowerCase()}${closed.slice(1)}`;
  const stays = leaf.edge === 'back' ? piece.zFront - piece.zBack : piece.x1 - piece.x0;
  if (kind === 'made') {
    // A slab's drop leaf: a panel of its own, so the top is one layer.
    if (piece.settings.layers !== 1) return 'A leaf wants a top of one layer: this one has two.';
    if (leaf.length.mm < DROP_LEAF.least - 1e-6) return `A leaf must be at least ${length(DROP_LEAF.least)} long.`;
    if (stays < DROP_LEAF.staysLeast - 1e-6) return `The part of the top that stays must be at least ${length(DROP_LEAF.staysLeast)}.`;
    return undefined;
  }
  if (leaf.length.mm < LEAF.least - 1e-6 || stays < LEAF.least - 1e-6) return `The leaf and the part that stays must each be at least ${length(LEAF.least)}: the top is made in one piece.`;
  return undefined;
}

/** How far a top is past an open end: Setup's amount, or a torsion box's own overhang. */
const endOver = (p: TopPiece): Mm => (p.torsion ? p.torsion.overhang.mm : p.settings.overhang.openEnd.mm);

/** How near a top's end and an appliance's side must be to count as standing side by side. */
const BESIDE: Mm = 25.4;

/**
 * Tops beside appliances. An appliance standing on the floor in line with a top's
 * cabinets, its side within an inch of the top's end cabinet:
 *  - a dishwasher is under the counter: the top runs on over it. With a top on its other side
 *    too, the first runs to the far side and the two meet there at a joint; with none, the top
 *    ends past it by the open-end overhang.
 *  - a range or a refrigerator stops it: the top ends at its cabinet's side with no overhang,
 *    as against a tall cabinet.
 * An island's top is left as it is.
 */
function meetAppliances(project: Project, pieces: TopPiece[]): void {
  const appliances = appliancesOf(project).filter((a) => !a.offFloor && !inTop(a));
  const places = appliances.length ? cabinetPlaces(project) : undefined;
  if (!places) return;
  const cabinets = cabinetsOf(project);
  const width = (p: TopPiece) => p.cabinetIds.reduce((sum, id) => sum + cabinets.find((c) => c.id === id)!.size.width.mm, 0);
  for (const appliance of appliances) {
    const foot = applianceFootprint(project, appliance);
    const stands = appliancePlace(project, appliance);
    if (!foot || !stands) continue;
    /** The appliance in a piece's own frame, when it stands in line with it: its sides along the piece, else nothing. */
    const along = (p: TopPiece): [Mm, Mm] | undefined => {
      const home = places.get(p.cabinetId);
      if (p.island || !home || (((home.turn - stands.turn) % 360) + 360) % 360 !== 0) return undefined;
      const local = foot.map(([x, z]) => inCabinet(home, [x, 0, z]));
      const zs = local.map((l) => l[2]);
      // In line: its depth overlaps the cabinets'.
      if (Math.min(...zs) > -1 || Math.max(...zs) < p.zBack + 1) return undefined;
      const xs = local.map((l) => l[0]);
      return [Math.min(...xs), Math.max(...xs)];
    };
    // The piece whose right end is at its left side, and the one whose left end is at its right side.
    const before = pieces.find((p) => (p.ends.right === 'open' || p.ends.right === 'wall') && Math.abs((along(p)?.[0] ?? Infinity) - width(p)) < BESIDE);
    const after = pieces.find((p) => p !== before && (p.ends.left === 'open' || p.ends.left === 'wall') && Math.abs(along(p)?.[1] ?? Infinity) < BESIDE);
    if (!underCounter(appliance)) {
      if (before) [before.x1, before.ends.right] = [width(before), 'tall'];
      if (after) [after.x0, after.ends.left] = [0, 'tall'];
      continue;
    }
    if (before && after) {
      [before.x1, before.ends.right] = [along(before)![1], 'joint'];
      [after.x0, after.ends.left] = [0, 'joint'];
    } else if (before) before.x1 = along(before)![1] + endOver(before);
    else if (after) after.x0 = along(after)![0] - endOver(after);
  }
}

/**
 * Tops meeting at a corner (milestone 7). Where the back corner of one top's end
 * (at its cabinet's side, before any overhang) stands on another top in the room, the two
 * meet: at a butt joint the first stops at the other's front edge; at a mitre both run to
 * the corner of the walls and are cut on the line from there to the corner of their fronts.
 * The joint is the first top's run's choice, else a mitre on a bought top and a butt joint on
 * one made here. Both ends become joints: no overhang, edge strip or side splash there.
 * A torsion box joins nothing: where either top is one, the first stops at the other's front edge as at a
 * butt joint, with no pocket screws, and the piece says so (`stops`).
 */
function meetAtCorners(project: Project, pieces: TopPiece[]): void {
  const places = cabinetPlaces(project);
  const context = project.context;
  if (!places || context.kind !== 'designedCabinet') return;
  const cabinets = cabinetsOf(project);
  const room = (p: TopPiece, x: Mm, z: Mm): [Mm, Mm] => {
    const at = places.get(p.cabinetId)!;
    const r = inRoom(at.at, at.turn, [x, 0, z]);
    return [r[0], r[2]];
  };
  const local = (p: TopPiece, point: [Mm, Mm]): [Mm, Mm] => {
    const l = inCabinet(places.get(p.cabinetId)!, [point[0], 0, point[1]]);
    return [l[0], l[2]];
  };
  const width = (p: TopPiece) => p.cabinetIds.reduce((sum, id) => sum + cabinets.find((c) => c.id === id)!.size.width.mm, 0);
  for (const p of pieces) {
    for (const end of ['left', 'right'] as const) {
      if (p.island || (p.ends[end] !== 'open' && p.ends[end] !== 'wall')) continue;
      const edge = end === 'left' ? 0 : width(p);
      const back = room(p, edge, p.zBack + 1);
      const q = pieces.find((o) => {
        if (o === p || o.island) return false;
        const [x, z] = local(o, back);
        return x > o.x0 - 1 && x < o.x1 + 1 && z > o.zBack - 1 && z < o.zFront + 1;
      });
      if (!q) continue;
      const run = context.runs.find((r) => r.id === p.runId);
      const loose = !!p.torsion || !!q.torsion;
      const joint = loose ? 'butt' : (run?.top?.cornerJoint ?? (p.settings.kind === 'bought' ? 'mitre' : 'butt'));
      // q's front edge and back edge, as lines across p's length: their x in p's frame.
      const atQ = (z: Mm) => local(p, room(q, (q.x0 + q.x1) / 2, z))[0];
      p.ends[end] = 'joint';
      if (joint === 'butt') {
        if (end === 'left') p.x0 = atQ(q.zFront);
        else p.x1 = atQ(q.zFront);
        if (loose) p.stops = [...(p.stops ?? []), end];
        else p.pockets = [...(p.pockets ?? []), end];
        continue;
      }
      // A mitre: p runs to q's back edge; q's end nearest p runs to p's back edge.
      if (end === 'left') p.x0 = atQ(q.zBack);
      else p.x1 = atQ(q.zBack);
      const outer = room(p, end === 'left' ? p.x0 : p.x1, p.zBack);
      const inner = room(p, atQ(q.zFront), p.zFront);
      const qEnd = local(q, outer)[0] < (q.x0 + q.x1) / 2 ? 'left' : 'right';
      const toP = local(q, room(p, (p.x0 + p.x1) / 2, p.zBack))[0];
      if (qEnd === 'left') q.x0 = toP;
      else q.x1 = toP;
      q.ends[qEnd] = 'joint';
      p.mitre = { end, from: local(p, outer), to: local(p, inner) };
      q.mitre = { end: qEnd, from: local(q, outer), to: local(q, inner) };
    }
  }
}

/** A piece in two at the join between its cabinets nearest its middle (each part in its own first cabinet's frame), again until each fits. */
function split(p: TopPiece, longest: Mm, cabinets: CabinetDesign[]): TopPiece[] {
  // (A leaf on an end is a panel of its own: it is the part that stays that must fit the sheet.)
  const fixed = { x0: p.x0 + (p.leaf?.edge === 'left' ? p.leaf.length : 0), x1: p.x1 - (p.leaf?.edge === 'right' ? p.leaf.length : 0) };
  if (fixed.x1 - fixed.x0 <= longest + 0.5 || p.cabinetIds.length < 2) return [p];
  // Where each cabinet starts along the piece.
  const starts: Mm[] = [];
  let x = 0;
  for (const id of p.cabinetIds) {
    starts.push(x);
    x += cabinets.find((c) => c.id === id)!.size.width.mm;
  }
  const middle = (fixed.x0 + fixed.x1) / 2;
  const at = starts.slice(1).reduce((best, s, i) => (Math.abs(s - middle) < Math.abs(starts[best + 1]! - middle) ? i : best), 0) + 1;
  const join = starts[at]!;
  const second = p.cabinetIds[at]!;
  // A mitre stays with the piece whose end it is on, moved into the second piece's frame there.
  const mitreLeft = p.mitre?.end === 'left' ? { mitre: p.mitre } : {};
  const mitreRight = p.mitre?.end === 'right' ? { mitre: { ...p.mitre, from: [p.mitre.from[0] - join, p.mitre.from[1]] as [Mm, Mm], to: [p.mitre.to[0] - join, p.mitre.to[1]] as [Mm, Mm] } } : {};
  // A leaf stays with the piece whose end it is on; one at the back is in two, a piece each.
  const { mitre: _mitre, pockets: own, leaf, ...rest } = p;
  const left: TopPiece = { ...rest, ...mitreLeft, ...(leaf && leaf.edge !== 'right' ? { leaf } : {}), ...(own?.includes('left') ? { pockets: ['left'] } : {}), cabinetIds: p.cabinetIds.slice(0, at), x1: join, ends: { ...p.ends, right: 'joint' } };
  const right: TopPiece = {
    ...rest,
    ...mitreRight,
    ...(leaf && leaf.edge !== 'left' ? { leaf } : {}),
    // The second piece's left edge takes the split's pocket screws.
    pockets: ['left', ...(own?.includes('right') ? (['right'] as const) : [])],
    id: `${second}/top-1`,
    cabinetId: second,
    cabinetIds: p.cabinetIds.slice(at),
    x0: 0,
    x1: p.x1 - join,
    ends: { ...p.ends, left: 'joint' },
  };
  return [...split(left, longest, cabinets), ...split(right, longest, cabinets)];
}

/** A covered run's pieces: its coverable cabinets between its ends and its tall cabinets. */
function runPieces(
  context: DesignedCabinetContext,
  run: Run,
  members: CabinetDesign[],
  piece: (members: CabinetDesign[], at: Map<string, Mm>, ends: { left: TopEnd; right: TopEnd }, fill: { left: Mm; right: Mm }) => void,
): void {
  const ends = runEnds(context, run);
  const fillers = runFit(context, run)?.fillers ?? [];
  const fill = (end: 'left' | 'right') => fillers.find((f) => f.end === end)?.width ?? 0;
  // Along the run from its first cabinet's left end.
  const at = new Map<string, Mm>();
  let x = 0;
  for (const c of members) {
    at.set(c.id, x);
    x += c.size.width.mm;
  }
  let group: CabinetDesign[] = [];
  let left: TopEnd = ends.left;
  const close = (right: TopEnd) => {
    if (!group.length) return;
    // In the frame of the group's first cabinet: shift the run's positions to it.
    const shift = at.get(group[0]!.id)!;
    const local = new Map(group.map((c) => [c.id, at.get(c.id)! - shift]));
    piece(group, local, { left, right }, { left: left === 'wall' ? fill('left') : 0, right: right === 'wall' ? fill('right') : 0 });
    group = [];
  };
  for (const c of members) {
    if (coverable(c)) group.push(c);
    else {
      close('tall');
      left = 'tall';
    }
  }
  close(ends.right);
}

/** Pocket screws along a top's joint: about every 6", at least three, 2" in from each edge. Tune me. */
export function jointPockets(depth: Mm): Mm[] {
  const inset = 2 * 25.4;
  const n = Math.max(3, Math.round((depth - 2 * inset) / (6 * 25.4)) + 1);
  return Array.from({ length: n }, (_, i) => inset + ((depth - 2 * inset) * i) / (n - 1));
}

/** A convex outline cut by the line through `a` and `b`, keeping the side `keep` is on. */
function clipOutline(outline: Point[], a: Point, b: Point, keep: Point): Point[] {
  const side = (p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const sign = Math.sign(side(keep));
  const out: Point[] = [];
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    const [sp, sq] = [side(p) * sign, side(q) * sign];
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  });
  // A line through a corner gives that corner twice.
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length]!;
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
  });
}

/** A build-up strip's width under a two-layer top, and the most a strip's run across it is apart. Tune me. */
export const BUILD_UP_STRIP: Mm = 3 * 25.4;
export const BUILD_UP_SPACING: Mm = 24 * 25.4;

/** Whether a top piece's back is against a wall, so it has a backsplash: not on an island, nor over a run or a cabinet standing free. */
export function backAgainstWall(project: Project, piece: Pick<TopPiece, 'cabinetId' | 'island'>): boolean {
  if (piece.island || project.context.kind !== 'designedCabinet') return false;
  const context = project.context;
  const cabinet = storedCases(context).find((c) => c.id === piece.cabinetId);
  const run = context.runs.find((r) => r.cabinetIds.includes(piece.cabinetId));
  const placement = run ? run.placement : cabinet?.placement;
  return placement?.wall !== 'free';
}

/** How far a drop-in sink's rim laps the top round its opening: the opening is this much smaller than the rim, each side. Tune me. */
export const SINK_RIM: Mm = 8;

/** A sink's opening in a top piece, in the piece's own frame (X along it, Z as the piece's `zBack` and `zFront`). */
export interface SinkCut {
  applianceId: string;
  name: string;
  piece: TopPiece;
  x0: Mm;
  x1: Mm;
  zBack: Mm;
  zFront: Mm;
}

/**
 * The opening each sink needs, and the top piece it is cut through: the
 * piece that lies over where the sink stands along its wall. The opening is the sink's rim less
 * `SINK_RIM` each side, where the sink is along the piece, and centred front to back on the
 * piece. A sink with no top under it has none.
 */
export function sinkCuts(project: Project, pieces: TopPiece[], torsionToo = false): SinkCut[] {
  const sinks = appliancesOf(project).filter(inTop);
  const places = sinks.length ? cabinetPlaces(project) : undefined;
  if (!places) return [];
  return sinks.flatMap((sink): SinkCut[] => {
    const foot = applianceFootprint(project, sink);
    if (!foot) return [];
    for (const piece of pieces) {
      const home = places.get(piece.cabinetId);
      if (!home || (piece.torsion && !torsionToo)) continue;
      const local = foot.map(([x, z]) => inCabinet(home, [x, 0, z]));
      const xs = local.map((l) => l[0]);
      const zs = local.map((l) => l[2]);
      const [a0, a1] = [Math.min(...xs), Math.max(...xs)];
      // Under it: the sink is within the piece's length, and they overlap front to back.
      if (a0 < piece.x0 - 0.5 || a1 > piece.x1 + 0.5 || Math.min(...zs) > piece.zFront || Math.max(...zs) < piece.zBack) continue;
      const middle = (piece.zBack + piece.zFront) / 2;
      const half = (Math.max(...zs) - Math.min(...zs)) / 2 - SINK_RIM;
      return [{ applianceId: sink.id, name: sink.name, piece, x0: a0 + SINK_RIM, x1: a1 - SINK_RIM, zBack: middle - half, zFront: middle + half }];
    }
    return [];
  });
}

/** A sink's opening as a feature of a top's panel whose front-left corner (seen from above) is at `x0`, `zFront` in the piece's frame. */
function sinkFeature(cut: SinkCut, x0: Mm, zFront: Mm): Part['features'][number] {
  const [a, b, c, d] = [cut.x0 - x0, cut.x1 - x0, zFront - cut.zFront, zFront - cut.zBack];
  return { id: `sink-${cut.applianceId}`, kind: 'cutout', face: 'A', inside: true, outline: [{ x: a, y: c }, { x: b, y: c }, { x: b, y: d }, { x: a, y: d }] };
}

/** How thick the project's tops are: made here, bought, or measured. */
function topThickness(settings: TopSettings, materials: Material[], hardware: Hardware[]): Mm {
  if (settings.kind === 'made') return thicknessOf(materials, settings.materialId) * settings.layers;
  if (settings.kind === 'torsion') return torsionThickness(torsionSettingsOf(settings), materials);
  return boughtTopOf(settings, hardware)?.thickness.mm ?? MEASURED_TOP_THICKNESS;
}

/**
 * The sinks as the 3D view draws them: a basin in each opening, its rim just under the top's
 * surface, as deep as the sink's bowl. Its top's first cabinet's part, like the top; for the
 * picture only.
 */
export function sinkShapes(project: Project, materials: Material[], hardware: Hardware[]): Part[] {
  if (project.context.kind !== 'designedCabinet') return [];
  const sinks = appliancesOf(project);
  // No sink, nothing to work out: a project whose only top is a torsion table has no top material to measure.
  if (!sinks.some(inTop)) return [];
  const cuts = sinkCuts(project, topPieces(project, materials));
  if (!cuts.length) return [];
  return cuts.map((cut): Part => {
    const thick = topThickness(cut.piece.settings, materials, hardware);
    const bowl = sinks.find((s) => s.id === cut.applianceId)!.size.height.mm;
    // The bowl is drawn no further forward than what the doors close against: in a shallow case a sink's rim reaches
    // past the case front, and its bowl showed through the doors.
    const under = cabinetsOf(project).find((c) => c.id === cut.piece.cabinetId);
    const zFront = Math.min(cut.zFront, (under ? constructionRules(under, materials).frontPlane : 0) - 1);
    const [width, depth] = [cut.x1 - cut.x0, zFront - cut.zBack];
    return {
      id: `${cut.piece.id}/${applianceShapeId(cut.applianceId)}`,
      designObjectId: cut.piece.cabinetId,
      name: cut.name,
      materialId: cut.piece.settings.materialId,
      size: { width, height: depth, thickness: bowl },
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }] }],
      role: 'top',
      placement: { origin: [cut.x0, cut.piece.y + thick - 6, zFront], xAxis: [1, 0, 0], yAxis: [0, 0, -1] },
    };
  });
}

/** Tune me: how thick a measured (stone) top is drawn. */
export const MEASURED_TOP_THICKNESS: Mm = 30;

/**
 * Bought and measured tops as the 3D view draws them: a slab for each piece, the bought top's
 * thickness (a measured one 30 mm), and a bought top's formed backsplash along the wall. They
 * are for the picture only: never cut, planned or listed as parts. A torsion table is made here
 * and drawn from its own parts.
 */
export function shownTopParts(project: Project, materials: Material[], hardware: Hardware[]): Part[] {
  if (project.context.kind !== 'designedCabinet') return [];
  const pieces = topPieces(project, materials);
  // A table's leaf: its hinge, latches, pins and legs, whatever Setup's tops are.
  const leafShapes = pieces.flatMap((p) =>
    p.torsion
      ? leafHardwareShapes(p.torsion, p.x1 - p.x0, p.zFront - p.zBack, [p.x0, p.y, p.zFront], p.id, p.cabinetId, materials)
      : p.leaf && p.settings.kind === 'made'
        ? dropLeafShapes(p.leaf.edge, p.leaf.length, p.x1 - p.x0, p.zFront - p.zBack, [p.x0, p.y, p.zFront], p.id, p.cabinetId, p.settings.materialId)
        : [],
  );
  // Each piece by its own settings: one top may be bought where the rest are made here.
  const slabs = pieces.filter((p) => p.settings.kind === 'bought' || p.settings.kind === 'measured');
  if (!slabs.length) return leafShapes;
  const rect = (w: Mm, h: Mm) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const slab = (p: TopPiece, key: string, name: string, width: Mm, height: Mm, thickness: Mm, origin: [Mm, Mm, Mm], flat: boolean): Part => ({
    id: `${p.id}${key}`,
    designObjectId: p.cabinetId,
    name,
    materialId: p.settings.materialId,
    size: { width, height, thickness },
    features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(width, height) }],
    role: 'top',
    placement: { origin, xAxis: [1, 0, 0], yAxis: flat ? [0, 0, -1] : [0, 1, 0] },
  });
  const cuts = sinkCuts(project, pieces);
  const withSinks = (p: TopPiece, part: Part): Part => {
    part.features.push(...cuts.filter((c) => c.piece === p).map((c) => sinkFeature(c, p.x0, p.zFront)));
    return part;
  };
  return [...leafShapes, ...slabs
    .flatMap((p) => {
      const bought = boughtTopOf(p.settings, hardware);
      const thick = bought ? bought.thickness.mm : MEASURED_TOP_THICKNESS;
      const splash = bought?.backsplash?.mm ?? 0;
      return [
      withSinks(p, slab(p, '-shown', bought ? `Countertop (${bought.name})` : 'Countertop (measured)', p.x1 - p.x0, p.zFront - p.zBack, thick, [p.x0, p.y + thick, p.zFront], true)),
      ...(splash > 0 && backAgainstWall(project, p) ? [slab(p, '-shown-splash', 'Backsplash', p.x1 - p.x0, splash, 12, [p.x0, p.y + thick, p.zBack + 12], false)] : []),
      ];
    })];
}

/**
 * The parts of the tops made here (`kind: 'made'`), each piece's:
 *  - the top panel, its grain along the run, cut smaller by a solid wood edge strip on its
 *    front and open ends (or banded there);
 *  - the edge strips, solid wood, as tall as the top is thick: the front one its whole
 *    length, an open end's behind it;
 *  - on a two-layer top, the second layer: strips under the front, the back and each end,
 *    and across it at most 24" apart, the panel standing on them;
 *  - the backsplash along the wall edge, standing on the top, and a side splash at a wall end.
 * Bought and measured tops are not cut.
 */
export function deriveTopParts(project: Project, materials: Material[]): Part[] {
  if (project.context.kind !== 'designedCabinet') return [];
  const all = topPieces(project, materials);
  // A torsion table is made here, whatever Setup's tops are.
  const tables = all.filter((p) => p.torsion).flatMap((p) => deriveTorsionParts(p.torsion!, p.x1 - p.x0, p.zFront - p.zBack, [p.x0, p.y, p.zFront], p.id, p.cabinetId, materials));
  // A piece's own top is made here too, whatever Setup's tops are.
  const pieces = all.filter((p) => p.settings.kind === 'made');
  if (!pieces.length) return tables;
  const sinks = sinkCuts(project, all);
  const stripMaterial = SOLID_WOOD_3_4_ID;
  const parts: Part[] = [];
  const rect = (w: Mm, h: Mm) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  /** A part of the top: `flat` lies face A up, its Y back from `origin`; otherwise it stands, face A toward +Z (or along `xAxis`). */
  /** What a leaf's parts are named with, and how they move: set while a leaf is being made. */
  let asLeaf: { prefix: string; moves: NonNullable<Part['moves']> } | undefined;
  const part = (p: TopPiece, key: string, name: string, width: Mm, height: Mm, thickness: Mm, origin: [Mm, Mm, Mm], flat: boolean, materialId = p.settings.materialId, xAxis: [Mm, Mm, Mm] = [1, 0, 0], banding?: Part['banding']): Part => {
    const role = key.startsWith('-edge') ? 'topEdge' : 'top';
    return withGrain(
      {
        id: `${p.id}${key}`,
        designObjectId: p.cabinetId,
        name: `${asLeaf?.prefix ?? ''}${name}`,
        ...(asLeaf ? { moves: asLeaf.moves } : {}),
        materialId,
        size: { width, height, thickness },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(width, height) }],
        role,
        placement: { origin, xAxis, yAxis: flat ? [0, 0, -1] : [0, 1, 0] },
        ...(banding ? { banding } : {}),
      },
      role,
      materials,
    );
  };
  type Edges = { front: boolean; back: boolean; left: boolean; right: boolean };
  /**
   * A piece as the slabs it is cut as, each with the edges of it that are finished (a strip or banding, and the
   * panel cut smaller for it): the front, an island's back and the open ends. A piece with a drop leaf
   * is two: the part that stays and the leaf, which meet square at the joint with nothing on that edge of either.
   */
  const slabsOf = (p: TopPiece): { p: TopPiece; edges: Edges; leaf?: NonNullable<Part['moves']> }[] => {
    const edges: Edges = { front: true, back: !!p.island, left: p.ends.left === 'open', right: p.ends.right === 'open' };
    if (!p.leaf) return [{ p, edges }];
    const { mitre: _mitre, pockets: _pockets, ...plain } = p;
    const id = `${p.id}-leaf`;
    if (p.leaf.edge === 'back') {
      const joint = p.zBack + p.leaf.length;
      return [
        { p: { ...p, zBack: joint }, edges: { ...edges, back: false } },
        { p: { ...plain, id, zFront: joint }, edges: { ...edges, front: false, back: true }, leaf: { kind: 'fold', axis: [p.y, joint] } },
      ];
    }
    if (p.leaf.edge === 'left') {
      const joint = p.x0 + p.leaf.length;
      return [
        { p: { ...p, x0: joint }, edges: { ...edges, left: false } },
        { p: { ...plain, id, x1: joint }, edges: { ...edges, left: true, right: false }, leaf: { kind: 'fold', axis: [joint, p.y], across: -1 } },
      ];
    }
    const joint = p.x1 - p.leaf.length;
    return [
      { p: { ...p, x1: joint }, edges: { ...edges, right: false } },
      { p: { ...plain, id, x0: joint }, edges: { ...edges, left: false, right: true }, leaf: { kind: 'fold', axis: [joint, p.y], across: 1 } },
    ];
  };
  for (const { p, edges, leaf } of pieces.flatMap(slabsOf)) {
    asLeaf = leaf ? { prefix: 'Leaf: ', moves: leaf } : undefined;
    // Each piece by its own settings: Setup's, or its own top's.
    const settings = p.settings;
    const t = thicknessOf(materials, settings.materialId);
    const strip = settings.edge.kind === 'strip' ? settings.edge.thickness.mm : 0;
    const band = settings.edge.kind === 'banding' ? EDGE_BAND_THICKNESS : 0;
    const layers = settings.layers;
    const thick = t * layers;
    const open = { left: edges.left, right: edges.right };
    // The panel, inside its edge strips; banded edges are cut smaller by the band.
    const cut = strip + band;
    const x0 = p.x0 + (open.left ? cut : 0);
    const x1 = p.x1 - (open.right ? cut : 0);
    const zFront = p.zFront - (edges.front ? cut : 0);
    // An island's back edge is open: its strip there, and the panel cut for it.
    const zBack = edges.back ? p.zBack + cut : p.zBack;
    const top = p.y + thick;
    // (A top of a piece's own, and a top with a leaf, are banded at the back where that edge is finished.)
    const bandEdges: NonNullable<Part['banding']>['edges'] = band
      ? [...(edges.front ? (['y0'] as const) : []), ...(edges.back && (p.own || p.leaf) ? (['y1'] as const) : []), ...(open.left ? (['x0'] as const) : []), ...(open.right ? (['x1'] as const) : [])]
      : [];
    const panel = part(p, '', p.own ? 'Top' : 'Countertop', x1 - x0, zFront - zBack, t, [x0, top, zFront], true, settings.materialId, [1, 0, 0], bandEdges.length ? { edges: bandEdges, thickness: band } : undefined);
    // A mitred end: the panel's outline cut on the mitre's line, keeping the side toward its other end.
    if (p.mitre) {
      const toPanel = ([x, z]: [Mm, Mm]) => ({ x: x - x0, y: zFront - z });
      const cutout = panel.features.find((f) => f.kind === 'cutout');
      if (cutout?.kind === 'cutout') cutout.outline = clipOutline(cutout.outline, toPanel(p.mitre.from), toPanel(p.mitre.to), { x: p.mitre.end === 'left' ? x1 - x0 : 0, y: (zFront - zBack) / 2 });
      panel.shaped = true;
    }
    // A top of its own with a rounded or a chamfered edge: the panel's own top arris, all round.
    const profile = p.own?.edge.kind === 'roundover' || p.own?.edge.kind === 'chamfer' ? p.own.edge : undefined;
    if (profile) {
      const size = profile.size?.mm ?? 3;
      panel.features.push({ id: 'edge', kind: 'edgeProfile', face: 'A', path: rect(x1 - x0, zFront - zBack), treatment: profile.kind === 'roundover' ? { kind: 'roundover', radius: size } : { kind: 'chamfer', size }, arris: 'A' });
    }
    // A sink's opening, cut through the panel inside its outline.
    panel.features.push(...sinks.filter((c) => c.piece.id === p.id).map((c) => sinkFeature(c, x0, zFront)));
    // Pocket screws from underneath along a joint's edge, into the piece beside it.
    for (const end of p.pockets ?? []) panel.features.push(...pocketRow(`joint-${end}`, 'B', end === 'left' ? 'x0' : 'x1', jointPockets(zFront - zBack)));
    parts.push(panel);
    if (strip) {
      // The front strip runs the whole length; an open end's runs behind it to the wall.
      // At a mitre the front strip stops at the corner of the two fronts.
      const [f0, f1] = [p.mitre?.end === 'left' ? p.mitre.to[0] : p.x0, p.mitre?.end === 'right' ? p.mitre.to[0] : p.x1];
      if (edges.front) parts.push(part(p, '-edge-front', 'Countertop edge, front', f1 - f0, thick, strip, [f0, p.y, p.zFront], false, stripMaterial));
      if (edges.back) parts.push(part(p, '-edge-back', 'Countertop edge, back', p.x1 - p.x0, thick, strip, [p.x1, p.y, p.zBack], false, stripMaterial, [-1, 0, 0]));
      if (open.left) parts.push(part(p, '-edge-left', 'Countertop edge, left end', zFront - zBack, thick, strip, [p.x0, p.y, zBack], false, stripMaterial, [0, 0, 1]));
      if (open.right) parts.push(part(p, '-edge-right', 'Countertop edge, right end', zFront - zBack, thick, strip, [p.x1, p.y, zFront], false, stripMaterial, [0, 0, -1]));
    }
    if (layers === 2) {
      // The second layer: strips under the panel's edges and across it, the panel's material.
      const w = BUILD_UP_STRIP;
      const length = x1 - x0;
      const depth = zFront - zBack;
      const under = p.y + t;
      parts.push(part(p, '-layer-front', 'Build-up strip, front', length, w, t, [x0, under, zFront], true));
      parts.push(part(p, '-layer-back', 'Build-up strip, back', length, w, t, [x0, under, zBack + w], true));
      const across = Math.max(1, Math.ceil(length / BUILD_UP_SPACING));
      for (let i = 0; i <= across; i++) {
        const x = Math.min(x1 - w, x0 + ((length - w) * i) / across);
        const name = i === 0 ? 'Build-up strip, left end' : i === across ? 'Build-up strip, right end' : `Build-up strip, across ${i}`;
        parts.push(part(p, `-layer-${i + 1}`, name, w, depth - 2 * w, t, [x, under, zFront - w], true, settings.materialId, [1, 0, 0]));
      }
    }
    if (settings.backsplash.on && !leaf && backAgainstWall(project, p)) {
      const h = settings.backsplash.height.mm;
      // Along the wall, on the top; at a wall end a side splash in front of it, to the top's front edge.
      parts.push(part(p, '-splash', 'Backsplash', p.x1 - p.x0, h, t, [p.x0, top, p.zBack + t], false));
      const side = p.zFront - (p.zBack + t);
      if (p.ends.left === 'wall') parts.push(part(p, '-splash-left', 'Side splash, left', side, h, t, [p.x0, top, p.zBack + t], false, settings.materialId, [0, 0, 1]));
      if (p.ends.right === 'wall') parts.push(part(p, '-splash-right', 'Side splash, right', side, h, t, [p.x1, top, p.zFront], false, settings.materialId, [0, 0, -1]));
    }
  }
  asLeaf = undefined;
  return [...parts, ...tables];
}

/**
 * What is wrong with a project's tops, each with the piece it is about: a torsion
 * top that stops at another at a corner, a sink over one, ribs longer than the sheet they are cut from. Design
 * shows them under the top's choice, and the header marks the Design step with them.
 */
export function topWarnings(project: Project, materials: Material[], length: (mm: Mm) => string = (mm) => formatLength(mm, INCH_DISPLAY)): { pieceId: string; cabinetIds: string[]; text: string }[] {
  if (project.context.kind !== 'designedCabinet') return [];
  const pieces = topPieces(project, materials);
  const out: { pieceId: string; cabinetIds: string[]; text: string }[] = [];
  const say = (p: TopPiece, text: string) => out.push({ pieceId: p.id, cabinetIds: [...p.cabinetIds, ...(p.island?.alsoOver ?? [])], text });
  for (const p of pieces) {
    if (p.leafRefused) say(p, p.leafRefused);
    if (p.seatingRefused) say(p, p.seatingRefused);
    // A deep overhang wants holding up: said of a top made here or a laminate one (a stone supplier sets their own limit).
    if (p.seating && seatingBrackets(p) > 0 && (p.settings.kind === 'made' || p.settings.kind === 'bought'))
      say(p, `The side for stools is ${length(p.seating.overhang)} past the cabinets: past ${length(SEATING.unsupported)} the top wants support. ${seatingBrackets(p)} bought brackets are on the hardware list, one about every ${length(SEATING.every)}, fastened by hand.`);
    for (const w of leafRoomProblems(project, p, length)) say(p, w);
    for (const end of p.stops ?? []) say(p, `At its ${end} end this top stops at the front edge of the top it meets at the corner: a torsion top does not join another top, so nothing fastens the two.`);
    if (!p.torsion) continue;
    const problem = torsionRibProblem(p.torsion, p.x1 - p.x0, p.zFront - p.zBack, materials, length);
    if (problem) say(p, problem);
  }
  for (const cut of sinkCuts(project, pieces, true).filter((c) => c.piece.torsion)) say(cut.piece, `The ${cut.name.toLowerCase()} stands over a torsion top, which takes no sink: no opening is cut for it. Give that run a slab of its own, or move the sink.`);
  return out;
}

/** How far off the floor a hanging leaf's lower edge must be. Tune me. */
export const LEAF_FLOOR_CLEARANCE: Mm = LEAF.floorClearance;

/**
 * Whether there is room for a piece's leaf: warnings, not refusals. Down, it must clear the floor and
 * whatever stands under the top at that edge (the cabinets stop short of the joint); up, it must not reach past
 * the room's walls.
 */
export function leafRoomProblems(project: Project, p: TopPiece, length: (mm: Mm) => string): string[] {
  if (!p.leaf || project.context.kind !== 'designedCabinet') return [];
  const out: string[] = [];
  const { edge, length: leaf } = p.leaf;
  const most = p.y - LEAF_FLOOR_CLEARANCE;
  if (leaf > most + 1e-6) out.push(`The leaf is ${length(leaf)} long but the top's underside is ${length(p.y)} off the floor: folded down it would reach the floor. Make it ${length(most)} or less.`);
  // What stands under the top, in the piece's own frame.
  const cabinets = cabinetsOf(project);
  const under = [...p.cabinetIds, ...(p.island?.alsoOver ?? [])].flatMap((id) => cabinets.find((c) => c.id === id) ?? []);
  const places = cabinetPlaces(project);
  const home = places?.get(p.cabinetId);
  const foot = { x0: Infinity, x1: -Infinity, z0: Infinity };
  let x = 0;
  for (const c of under) {
    const at = places?.get(c.id);
    const inLine = p.cabinetIds.includes(c.id);
    const corners: [Mm, Mm][] = [[0, -c.size.depth.mm], [c.size.width.mm, -c.size.depth.mm], [0, 0], [c.size.width.mm, 0]];
    for (const [cx, cz] of corners) {
      // In the room when it has one; else the cabinets in line, one after another.
      const l = home && at ? inCabinet(home, inRoom(at.at, at.turn, [cx, 0, cz])) : inLine ? [x + cx, 0, cz] : undefined;
      if (!l) continue;
      foot.x0 = Math.min(foot.x0, l[0]!);
      foot.x1 = Math.max(foot.x1, l[0]!);
      foot.z0 = Math.min(foot.z0, l[2]!);
    }
    if (inLine) x += c.size.width.mm;
  }
  const past = edge === 'back' ? p.zBack + leaf - foot.z0 : edge === 'left' ? p.x0 + leaf - foot.x0 : foot.x1 - (p.x1 - leaf);
  if (past > 1) out.push(`What stands under the top reaches ${length(past)} past the leaf's joint at its ${leafEdgeWords(edge)}: the leaf cannot hang down there. Make the part that stays larger, or move what is under it.`);
  // Up: inside the room's walls.
  const room = project.context.room;
  if (room && home) {
    const corners = ([[p.x0, p.zBack], [p.x1, p.zFront]] as [Mm, Mm][]).map(([cx, cz]) => inRoom(home.at, home.turn, [cx, 0, cz]));
    const outside = corners.some((c) => c[0] < -1 || c[0] > room.length.mm + 1 || c[2] < -1 || c[2] > room.width.mm + 1);
    if (outside) out.push("With its leaf up the top reaches past the room's walls.");
  }
  return out;
}
