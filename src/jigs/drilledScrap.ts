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
import type { PocketSection } from './pocketSection';
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

export async function buildDrilledScrap(stock: { x: Mm; y: Mm }, thickness: Mm, pockets: DrilledPocket[], wasmUrl?: string): Promise<PrintObject[]> {
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
  if (pilots.length) {
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
