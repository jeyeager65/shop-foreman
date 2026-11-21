/**
 * The scrap test as it is once its pilots are drilled with the guide: the scrap, every pocket the CNC cut in it (its
 * ledge too), and the pilot drilled from the edge along each screw to its seat, or the channel cut open in its place.
 * The scrap is drawn see-through and what the drill takes out solid inside it, in a colour of its own. Display only: the pockets
 * are drawn from their sections (`pocketSection`), not from the G-code, which the "As cut" picture carves.
 *
 * In the scrap's frame: x along the edge the pockets are cut at, y in from that edge, z up from its underside (the
 * face the pockets are cut in at z = thickness).
 */
import { POCKET, arcLedge, slotLedge, slotShape } from '@/geometry/pocketHole';
import { loadManifold, meshOf } from '@/geometry/solids';
import type { Mm } from '@/model';
import { POCKET_SCREW, type PocketSection } from './pocketSection';
import type { PrintObject } from './threemf';

export interface DrilledPocket {
  /** Its centre along the edge. */
  x: Mm;
  section: PocketSection;
  /** The ledge round its opening, when it has one: from the edge, its ends; across, its half width. */
  ledge?: { u0: Mm; u1: Mm; half: Mm };
}

/**
 * The ledge a pocket of the test has, in its section's terms: a low-angle pocket's (its seat `seatFromEdge` from the
 * edge), or a 15° one's cut with a bit this wide.
 */
export function testLedge(section: PocketSection, bitWidth: Mm, seatFromEdge?: Mm): DrilledPocket['ledge'] {
  const open = section.screwKind === 'castle' ? arcLedge(section.thickness, section.angleDeg, seatFromEdge) : slotLedge(slotShape(section.thickness, bitWidth));
  return { u0: open.u0, u1: open.u1, half: open.half };
}

/** How far past a face a cutter reaches, so no skin is left. */
const OVER = 0.5;

/**
 * A screw as a solid of revolution, its profile (radius, along its axis from the tip): the point tapering in, a ring
 * for each turn of thread (each crest leaning toward the head), the smooth shank, and its head on the seat.
 */
export function screwProfile(section: PocketSection): [number, number][] {
  const k = POCKET_SCREW[section.screwKind];
  const pitch = section.fine ? POCKET_SCREW.pitch.fine : POCKET_SCREW.pitch.coarse;
  const threads = section.screw * k.threads;
  const [root, crest] = [(k.shank / 2) * 0.82, k.thread / 2];
  const taper = (z: number) => Math.min(1, Math.max(0.08, z / POCKET_SCREW.point));
  const pts: [number, number][] = [[0, 0]];
  for (let z = 0; z + pitch * 0.62 < threads; z += pitch) {
    if (z > 0) pts.push([root * taper(z), z]);
    pts.push([crest * taper(z + pitch * 0.62), z + pitch * 0.62]);
  }
  pts.push([root, threads], [k.shank / 2, threads + 0.6], [k.shank / 2, section.screw]);
  const { diameter: d, height: h } = k.head;
  const top = section.screw + h;
  if (section.screwKind === 'castle') pts.push([d / 2, section.screw], [d / 2, top - 0.6], [d / 2 - 0.6, top]);
  else pts.push([d / 2, section.screw], [d / 2, section.screw + h * 0.3], [d / 3, top - 0.3], [d / 6, top]);
  pts.push([0, top]);
  return pts;
}

/** What the picture shows: the pilots drilled, or a screw in each pocket driven into another board against the edge. */
export type ScrapView = 'drilled' | 'screwed';

export async function buildDrilledScrap(stock: { x: Mm; y: Mm }, thickness: Mm, pockets: DrilledPocket[], wasmUrl?: string, view: ScrapView = 'drilled'): Promise<PrintObject[]> {
  const { Manifold } = await loadManifold(wasmUrl);
  type Solid = ReturnType<typeof Manifold.cube>;
  const made: Solid[] = [];
  const keep = <T extends Solid>(s: T): T => {
    made.push(s);
    return s;
  };
  const t = thickness;
  /** A section's outline (u in from the edge, z up from the face), counter-clockwise, `width` across and centred on x. */
  const slab = (outline: [Mm, Mm][], width: Mm, x: Mm): Solid => {
    const pts = outline.map(([u, z]): [number, number] => [u, z > -1e-6 ? OVER : z]);
    const area = pts.reduce((a, [u, z], i) => {
      const [u1, z1] = pts[(i + 1) % pts.length]!;
      return a + u * z1 - u1 * z;
    }, 0);
    if (area < 0) pts.reverse();
    // Extruded along Z, then (u, z, across) turned to (x, y, z): a turn, not a mirror.
    return keep(keep(Manifold.extrude([pts], width)).warp((v) => {
      const [u, z, w] = [v[0]!, v[1]!, v[2]!];
      v[0] = x - width / 2 + w;
      v[1] = u;
      v[2] = t + z;
    }));
  };
  const cutters: Solid[] = [];
  const pilots: Solid[] = [];
  for (const p of pockets) {
    const s = p.section;
    const a = (s.angleDeg * Math.PI) / 180;
    const [sin, cos] = [Math.sin(a), Math.cos(a)];
    cutters.push(slab(s.pocket, POCKET.bore, p.x));
    if (p.ledge) {
      const box = keep(Manifold.cube([2 * p.ledge.half, p.ledge.u1 - p.ledge.u0, POCKET.ledge.depth + OVER]));
      cutters.push(keep(box.translate(p.x - p.ledge.half, p.ledge.u0, t - POCKET.ledge.depth)));
    }
    if (s.channel) {
      // Cut open from the face: from outside the edge to the seat, its floor along the screw's underside.
      const floor = (u: Mm) => -t / 2 + u * Math.tan(a) - POCKET.drill / 2;
      const seatU = s.seat * cos;
      cutters.push(slab([[-1, 0], [-1, floor(-1)], [seatU, floor(seatU)], [seatU, 0]], POCKET.drill, p.x));
    } else {
      // The pilot: from outside the edge along the screw, a little past its seat into the pocket.
      const length = s.seat + 2;
      const bore = keep(Manifold.cylinder(length, POCKET.drill / 2, POCKET.drill / 2, 32));
      pilots.push(
        keep(
          bore.warp((v) => {
            const [X, Y, Z] = [v[0]!, v[1]!, v[2]!];
            const along = Z - 1;
            v[0] = p.x + X;
            v[1] = along * cos + Y * sin;
            v[2] = t / 2 + along * sin - Y * cos;
          }),
        ),
      );
    }
  }
  const block = keep(Manifold.cube([stock.x, stock.y, t]));
  const holes = keep(Manifold.union(cutters));
  const scrap = keep(block.subtract(holes));
  const objects: PrintObject[] = [{ name: 'Scrap', mesh: meshOf(scrap), placements: [{ x: 0, y: 0 }], look: { color: SCRAP_COLOR, opacity: 0.35 } }];
  if (view === 'screwed') {
    // The other board, as thick as the scrap, standing against its edge and a little past both faces, as in the sections.
    const other = keep(keep(Manifold.cube([stock.x, t, t + 16])).translate(0, -t, -8));
    objects.push({ name: 'Other board', mesh: meshOf(other), placements: [{ x: 0, y: 0 }], look: { color: OTHER_COLOR, opacity: 0.3 } });
    // A screw in each pocket, its head on the seat, along the pilot's line (out of the edge at mid-thickness).
    for (const kind of ['kreg', 'castle'] as const) {
      const screws = pockets
        .filter((p) => p.section.screwKind === kind)
        .map((p) => {
          const s = p.section;
          const a = (s.angleDeg * Math.PI) / 180;
          const [sin, cos] = [Math.sin(a), Math.cos(a)];
          const tip = s.seat - s.screw;
          return keep(
            keep(Manifold.revolve([screwProfile(s)], 32)).warp((v) => {
              const [X, Y, Z] = [v[0]!, v[1]!, v[2]!];
              const along = Z + tip;
              v[0] = p.x + X;
              v[1] = along * cos + Y * sin;
              v[2] = t / 2 + along * sin - Y * cos;
            }),
          );
        });
      if (screws.length) objects.push({ name: 'Screws', mesh: meshOf(keep(Manifold.union(screws))), placements: [{ x: 0, y: 0 }], look: { color: kind === 'kreg' ? KREG_COLOR : CASTLE_COLOR } });
    }
  } else if (pilots.length) {
    // Only what the drill takes out: the pilots where they run through wood, from the edge to the pocket.
    const drilled = keep(keep(Manifold.union(pilots)).intersect(scrap));
    objects.push({ name: 'Pilots', mesh: meshOf(drilled), placements: [{ x: 0, y: 0 }], look: { color: PILOT_COLOR } });
  }
  for (const s of made) s.delete();
  return objects;
}

/** The scrap, see-through, and the drilled holes inside it, in a colour that stands out from the wood. */
const SCRAP_COLOR = 0xd8a868;
const PILOT_COLOR = 0x4f9dff;
/** The board screwed to, a darker wood; the screws' zinc (Kreg) and bronze (Castle), as in the sections. */
const OTHER_COLOR = 0xa8875c;
const KREG_COLOR = 0xc8ced6;
const CASTLE_COLOR = 0xb89a68;
