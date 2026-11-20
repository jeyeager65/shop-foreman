/**
 * How a room looks: its floor's kind and colour, its walls' colour, and tile on the walls
 * between the countertops and the wall cabinets. Only drawn: nothing is cut, bought or listed for any of it.
 *
 * The wall tile is placed by the app. On each wall, wherever a floor cabinet (or a range, a dishwasher) stands
 * against it, tile runs from the top of what stands there (the countertop, or its backsplash strip) up to the
 * underside of the wall cabinet above, or, with none above, to the height the wall cabinets hang at, so the band
 * stays level. It stops at a tall cabinet or a refrigerator and at the ends of the run (in line with the end
 * cabinet's side, not with the countertop's overhang past it), and it goes round a
 * window: the window and its trim are cut out of it. Nothing stands behind an island, so it has none.
 */
import type { Mm, Part, Room, RoomLook, RoomWall, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { partBox } from './cabinetAssembly';
import { groupFrame, inCabinet, inRoom } from './room';

export const FLOOR_KINDS: { value: NonNullable<RoomLook['floor']>['kind']; title: string; color: string }[] = [
  { value: 'planks', title: 'Wood planks', color: '#966e48' },
  { value: 'tile', title: 'Tile', color: '#c9c4b8' },
  { value: 'concrete', title: 'Concrete', color: '#9c9b96' },
  { value: 'plain', title: 'Plain', color: '#8a8378' },
];

export const FLOOR_COLOURS = [
  { name: 'Oak', value: '#966e48' },
  { name: 'Maple', value: '#c9a878' },
  { name: 'Walnut', value: '#5e4330' },
  { name: 'Grey wash', value: '#8f8a82' },
  { name: 'Stone', value: '#c9c4b8' },
  { name: 'Slate', value: '#5b6066' },
  { name: 'Concrete', value: '#9c9b96' },
  { name: 'Terracotta', value: '#a8644a' },
];

export const WALL_COLOURS = [
  { name: 'Warm white', value: '#e9e4d8' },
  { name: 'White', value: '#f2f1ec' },
  { name: 'Greige', value: '#cfc7b8' },
  { name: 'Light grey', value: '#c8cbcc' },
  { name: 'Sage', value: '#aab5a0' },
  { name: 'Pale blue', value: '#b9cad6' },
  { name: 'Butter', value: '#ead9a8' },
  { name: 'Navy', value: '#34425a' },
];

export const TILE_LOOKS: { value: NonNullable<RoomLook['tile']>['look']; title: string }[] = [
  { value: 'subway', title: 'Subway, 3" × 6"' },
  { value: 'square', title: 'Square, 4"' },
  { value: 'slab', title: 'A plain slab' },
];

export const TILE_COLOURS = [
  { name: 'White', value: '#f3f2ee' },
  { name: 'Cream', value: '#e8dfc9' },
  { name: 'Grey', value: '#b4b8ba' },
  { name: 'Sage', value: '#9fb09a' },
  { name: 'Blue', value: '#7f9db5' },
  { name: 'Navy', value: '#2f3e55' },
  { name: 'Charcoal', value: '#3c3f43' },
  { name: 'Terracotta', value: '#b56f52' },
];

export const GROUT_COLOURS = [
  { name: 'White', value: '#e6e4de' },
  { name: 'Light grey', value: '#b9b9b5' },
  { name: 'Grey', value: '#8a8b89' },
  { name: 'Charcoal', value: '#4a4c4e' },
];

/** The tile a room's walls start with when it is turned on. */
export const starterWallTile = (look: NonNullable<RoomLook['tile']>['look'] = 'subway'): NonNullable<RoomLook['tile']> => ({ look, color: TILE_COLOURS[0]!.value, grout: GROUT_COLOURS[1]!.value });

/** A room's look in a few words. */
export function roomLookWords(look: RoomLook | undefined): string {
  if (!look || (!look.floor && !look.wall && !look.tile)) return '';
  return [look.floor ? `${FLOOR_KINDS.find((k) => k.value === look.floor!.kind)?.title.toLowerCase()} floor` : '', look.wall ? 'painted walls' : '', look.tile ? `${look.tile.look} tile` : ''].filter(Boolean).join(', ');
}

/** Numbers the placing of wall tile goes by. Tune me. */
export const WALL_TILE = {
  /** A thing counts as against a wall when its back is no further from it than this. */
  touch: 60,
  /** What stands on the floor: its bottom no higher than this. */
  onFloor: 320,
  /** A floor-standing thing taller than this is a tall cabinet or a refrigerator: no tile behind it. */
  tall: 1300,
  /** What hangs: its bottom at least this high. */
  hangs: 1000,
  /** With no wall cabinet anywhere, the band is this high over the countertop: 18". */
  band: 18 * MM_PER_INCH,
  /** The trim round a window, cut out of the tile with it. */
  trim: 70,
  /** A piece of tile smaller than this either way is left out. */
  least: 40,
  /** A top's end no further than this past the cabinet under it is its overhang: the tile stops at the cabinet. */
  overhang: 2 * MM_PER_INCH,
};

/** A rectangle of tile on a wall: its left edge `along` from the wall's left end, its bottom `up` off the floor. */
export interface WallTileRect {
  wall: RoomWall;
  along: Mm;
  up: Mm;
  width: Mm;
  height: Mm;
}

/** A cabinet or an appliance as it stands in the room: where, and which of the parts are its own. */
export interface PlacedThing {
  id: string;
  at: Vec3;
  turn?: number;
  partIds: string[];
}

const WALLS: RoomWall[] = ['back', 'right', 'front', 'left'];
const wallLength = (room: Room, wall: RoomWall): Mm => (wall === 'back' || wall === 'front' ? room.length.mm : room.width.mm);

/**
 * Where the tile is on a room's walls. `placed`: everything that stands in the room; `ignore`: the ids of what
 * takes no tile behind it (a table, a desk). Empty unless the room's look has a tile.
 */
export function wallTileRects(room: Room, parts: Part[], placed: PlacedThing[], ignore: ReadonlySet<string> = new Set()): WallTileRect[] {
  if (!room.look?.tile) return [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  // Each thing's boxes in the room: its case as one box, and each piece of a top as its own (a run's top is its
  // first cabinet's parts but lies over the whole run).
  type Box = { min: Vec3; max: Vec3 };
  const boxes: { box: Box; top: boolean }[] = [];
  for (const thing of placed) {
    if (ignore.has(thing.id)) continue;
    const corners = (p: Part): Vec3[] => {
      const { min, max } = partBox(p);
      return [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z) => inRoom(thing.at, thing.turn ?? 0, [x, y, z]))));
    };
    const around = (points: Vec3[]): Box => ({ min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]!))) as Vec3, max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]!))) as Vec3 });
    // (Stools at an island's seating side are its first cabinet's parts: they are not the cabinet.)
    const own = thing.partIds.map((id) => byId.get(id)).filter((p): p is Part => !!p?.placement && !p.id.includes('/stool-'));
    const isTop = (p: Part) => p.role === 'top' || p.role === 'topEdge';
    const body = own.filter((p) => !isTop(p)).flatMap(corners);
    if (body.length) boxes.push({ box: around(body), top: false });
    for (const p of own.filter(isTop)) boxes.push({ box: around(corners(p)), top: true });
  }

  const out: WallTileRect[] = [];
  /** Everything against each wall, in that wall's frame: along it, up, and out from it. */
  const against = WALLS.filter((wall) => !room.open?.includes(wall)).map((wall) => {
    const { origin, turn } = groupFrame(room, { wall, along: { mm: 0, unit: 'mm' } });
    const items = boxes.flatMap(({ box, top }) => {
      const pts = [box.min[0], box.max[0]].flatMap((x) => [box.min[2], box.max[2]].map((z) => inCabinet({ at: origin, turn }, [x, 0, z])));
      const [a0, a1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
      const out0 = Math.min(...pts.map((p) => p[2]));
      return out0 <= WALL_TILE.touch ? [{ a0, a1, y0: box.min[1], y1: box.max[1], top }] : [];
    });
    return { wall, items };
  });
  // The height the wall cabinets hang at: the lowest underside among them, on any wall.
  const hung = against.flatMap((w) => w.items.filter((i) => !i.top && i.y0 >= WALL_TILE.hangs).map((i) => i.y0));
  const hangAt = hung.length ? Math.min(...hung) : undefined;

  for (const { wall, items: found } of against) {
    const length = wallLength(room, wall);
    // The tile ends in line with the cabinets, not with the countertop's overhang past them (it looks wrong
    // past a wall cabinet that lines up with the base cabinet): a top's end that is an overhang's
    // width past the side of what stands under it counts as ending at that side.
    const stands = found.filter((i) => !i.top && i.y0 <= WALL_TILE.onFloor);
    const items = found.map((i) => {
      if (!i.top) return i;
      const a0 = stands.map((s) => s.a0).filter((e) => e > i.a0 + 0.01 && e <= i.a0 + WALL_TILE.overhang).sort((p, q) => p - q)[0] ?? i.a0;
      const a1 = stands.map((s) => s.a1).filter((e) => e < i.a1 - 0.01 && e >= i.a1 - WALL_TILE.overhang).sort((p, q) => q - p)[0] ?? i.a1;
      return { ...i, a0, a1 };
    });
    const bases = items.filter((i) => i.top || (i.y0 <= WALL_TILE.onFloor && i.y1 < WALL_TILE.tall));
    const talls = items.filter((i) => !i.top && i.y0 <= WALL_TILE.onFloor && i.y1 >= WALL_TILE.tall);
    const uppers = items.filter((i) => !i.top && i.y0 >= WALL_TILE.hangs);
    const clip = (v: Mm) => Math.min(length, Math.max(0, v));
    const breaks = [...new Set(items.flatMap((i) => [clip(i.a0), clip(i.a1)]).map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
    const bands: { a0: Mm; a1: Mm; y0: Mm; y1: Mm }[] = [];
    for (let k = 0; k + 1 < breaks.length; k++) {
      const [a0, a1] = [breaks[k]!, breaks[k + 1]!];
      const mid = (a0 + a1) / 2;
      const over = <T extends { a0: Mm; a1: Mm }>(list: T[]) => list.filter((i) => i.a0 < mid && i.a1 > mid);
      if (a1 - a0 < 1 || over(talls).length || !over(bases).length) continue;
      const y0 = Math.max(...over(bases).map((i) => i.y1));
      const above = over(uppers).filter((i) => i.y0 > y0);
      const y1 = above.length ? Math.min(...above.map((i) => i.y0)) : (hangAt !== undefined && hangAt > y0 ? hangAt : y0 + WALL_TILE.band);
      const last = bands[bands.length - 1];
      if (last && Math.abs(last.a1 - a0) < 0.5 && Math.abs(last.y0 - y0) < 0.5 && Math.abs(last.y1 - y1) < 0.5) last.a1 = a1;
      else bands.push({ a0, a1, y0, y1 });
    }
    // Round the windows: each band less every window's opening and trim.
    let pieces = bands;
    for (const w of (room.windows ?? []).filter((x) => x.wall === wall)) {
      const hole = { a0: w.along.mm - WALL_TILE.trim, a1: w.along.mm + w.width.mm + WALL_TILE.trim, y0: w.sill.mm - WALL_TILE.trim / 2, y1: w.sill.mm + w.height.mm + WALL_TILE.trim };
      pieces = pieces.flatMap((b) => {
        if (hole.a1 <= b.a0 || hole.a0 >= b.a1 || hole.y1 <= b.y0 || hole.y0 >= b.y1) return [b];
        const [l, r] = [Math.max(b.a0, hole.a0), Math.min(b.a1, hole.a1)];
        return [
          { ...b, a1: l },
          { ...b, a0: r },
          { a0: l, a1: r, y0: b.y0, y1: Math.min(b.y1, hole.y0) },
          { a0: l, a1: r, y0: Math.max(b.y0, hole.y1), y1: b.y1 },
        ];
      });
    }
    for (const b of pieces) {
      if (b.a1 - b.a0 < WALL_TILE.least || b.y1 - b.y0 < WALL_TILE.least) continue;
      out.push({ wall, along: b.a0, up: b.y0, width: b.a1 - b.a0, height: b.y1 - b.y0 });
    }
  }
  return out;
}

/** A room as the 3D view draws it, in mm (`CabinetAssemblyView`'s `room`). */
export interface ShownRoom {
  length: number;
  width: number;
  ceiling: number;
  open?: string[];
  /** Each window's bottom-left corner on its wall, in the room, and the turn that faces it into the room. */
  windows?: { at: Vec3; turn: number; width: number; height: number }[];
  look?: RoomLook;
  /** The pieces of tile on its walls, each placed as a window is. */
  tiles?: { at: Vec3; turn: number; width: number; height: number }[];
}

/** A project's room for the 3D view: its size, its windows, how it looks, and where the tile is on its walls. */
export function shownRoom(room: Room, parts: Part[] = [], placed: PlacedThing[] = [], ignore?: ReadonlySet<string>): ShownRoom {
  const onWall = (wall: RoomWall, along: Mm, up: Mm) => {
    const { origin, turn } = groupFrame(room, { wall, along: { mm: along, unit: 'mm' } });
    return { at: inRoom(origin, turn, [0, up, 0]), turn };
  };
  const windows = (room.windows ?? []).map((w) => ({ ...onWall(w.wall, w.along.mm, w.sill.mm), width: w.width.mm, height: w.height.mm }));
  let tiles: ShownRoom['tiles'] = [];
  try {
    tiles = wallTileRects(room, parts, placed, ignore).map((t) => ({ ...onWall(t.wall, t.along, t.up), width: t.width, height: t.height }));
  } catch {
    // Tile that cannot be placed is left out of the picture.
  }
  return {
    length: room.length.mm,
    width: room.width.mm,
    ceiling: room.ceiling.mm,
    ...(room.open?.length ? { open: room.open } : {}),
    ...(windows.length ? { windows } : {}),
    ...(room.look ? { look: room.look } : {}),
    ...(tiles.length ? { tiles } : {}),
  };
}
