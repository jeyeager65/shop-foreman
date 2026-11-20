/**
 * Where everything sits on the cabinet, for the 3D view: face frame, doors, hinges
 * and the install kit in use. Display only; nothing here feeds Plan or Make.
 *
 * World frame: origin at the opening's bottom-left corner on the front of the face
 * frame, X right, Y up, Z out toward the viewer.
 */
import { GAP_SHIM, SUPPORT_BLOCK } from '@/jigs/installKit';
import type { DoorMounting, JigInstance, Mm, Opening, Part } from '@/model';

/** Sizes the project doesn't hold. Tune me: schematic values for the picture only. */
export const ASSEMBLY = {
  /** Stile and rail width of the face frame (not measured in the project). */
  frameMemberWidth: 38.1,
  /** Gap between the back of a closed door and the frame (bumpers). */
  doorStandoff: 2,
  /** How far behind the frame the cabinet box is drawn. */
  carcassDepth: 300,
  carcassWall: 12,
  /** Wall left between the pivot and the bottom of the cup. */
  pivotCover: 2,
  maxOpenDeg: 105,
  hingeMetal: 1.5,
};

export type Vec3 = [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface HingePlacement {
  /** Cup centre on the door's back face, in the world, door closed. */
  cup: { x: Mm; y: Mm; diameter: Mm; depth: Mm };
  /** Moves with the door: the plate around the cup on the door's back. */
  flange: Box;
  /** Fixed to the frame: the wing on the opening's edge and the arm out to the pivot. */
  fixed: Box[];
}

export interface DoorPlacement {
  partId: string;
  /** World position of the door's own origin (bottom-left of its back face). */
  origin: Vec3;
  size: { width: Mm; height: Mm; thickness: Mm };
  hingeSide: 'left' | 'right';
  /** The vertical axis the door swings about. */
  pivot: { x: Mm; z: Mm };
  hinges: HingePlacement[];
}

/** Places a mesh built in its own frame: world = offset + x*axes[0] + y*axes[1] + z*axes[2]. */
export interface JigPlacement {
  template: JigInstance['template'];
  axes: [Vec3, Vec3, Vec3];
  offset: Vec3;
}

export interface Assembly {
  opening: { width: Mm; height: Mm };
  frame: Box[];
  carcass: Box[];
  doors: DoorPlacement[];
  jigs: JigPlacement[];
}

const box = (x0: Mm, y0: Mm, z0: Mm, x1: Mm, y1: Mm, z1: Mm): Box => ({
  min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
  max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
});

/**
 * How far the door's hinge-side back corner swings back past the door's closed back
 * face as it opens. The door clears the frame while this is within the standoff.
 */
export function swingClearance(door: DoorPlacement): Mm {
  const edgeX = door.hingeSide === 'left' ? door.origin[0] : door.origin[0] + door.size.width;
  const a = Math.abs(door.pivot.x - edgeX);
  const b = door.pivot.z - door.origin[2];
  return Math.hypot(a, b) - b;
}

export function buildAssembly(opening: Opening, mounting: DoorMounting, parts: Part[], kit: JigInstance[]): Assembly {
  const A = ASSEMBLY;
  const W = opening.width.mm;
  const H = opening.height.mm;
  const t = opening.frameThickness.mm;
  // Frameless, what surrounds the opening is the case itself: its sides' front edges.
  const m = opening.cabinetType === 'frameless' ? t : A.frameMemberWidth;

  const frame = [
    box(-m, -m, -t, 0, H + m, 0), // left stile
    box(W, -m, -t, W + m, H + m, 0), // right stile
    box(0, -m, -t, W, 0, 0), // bottom rail
    box(0, H, -t, W, H + m, 0), // top rail
  ];
  const back = -t - A.carcassDepth;
  const c = A.carcassWall;
  const carcass = [
    box(-m, -m, back, -m + c, H + m, -t),
    box(W + m - c, -m, back, W + m, H + m, -t),
    box(-m + c, -m, back, W + m - c, -m + c, -t),
    box(-m + c, H + m - c, back, W + m - c, H + m, -t),
    box(-m, -m, back - c, W + m, H + m, back),
  ];

  // Doors are centred across the opening and hang the bottom overlay below it.
  const gap = parts.length > 1 ? mounting.gap.mm : 0;
  const across = parts.reduce((sum, p) => sum + p.size.width, 0) + gap * (parts.length - 1);
  let x = (W - across) / 2;
  const doors = parts.map((part): DoorPlacement => {
    const { width, height, thickness } = part.size;
    const origin: Vec3 = [x, -mounting.overlayBottom.mm, A.doorStandoff];
    x += width + gap;
    const cups = part.features.filter((f) => f.kind === 'cup');
    const first = cups[0];
    const hingeSide = first && first.center.x > width / 2 ? 'right' : 'left';
    const out = hingeSide === 'left' ? -1 : 1; // toward the outside of the cabinet
    const doorEdge = hingeSide === 'left' ? origin[0] : origin[0] + width;
    const openingEdge = hingeSide === 'left' ? 0 : W;
    // The pivot sits at the cup's outer rim, near the bottom of the cup.
    const rim = first ? Math.max(2, Math.abs(first.center.x - (hingeSide === 'left' ? 0 : width)) - first.diameter / 2) : 5;
    const depth = first ? first.depth - A.pivotCover : thickness / 2;
    const pivot = { x: doorEdge - out * rim, z: origin[2] + depth };

    const hinges = cups.map((cup): HingePlacement => {
      const cx = origin[0] + cup.center.x;
      const cy = origin[1] + cup.center.y;
      const r = cup.diameter / 2;
      return {
        cup: { x: cx, y: cy, diameter: cup.diameter, depth: cup.depth },
        flange: box(cx - r - 3, cy - r - 6, origin[2] - 1, cx + r + 3, cy + r + 6, origin[2]),
        fixed: [
          box(openingEdge, cy - 22, -t, openingEdge - out * A.hingeMetal, cy + 22, 0),
          box(pivot.x + out * 2, cy - 6, 0, openingEdge - out * A.hingeMetal, cy + 6, pivot.z + 2),
        ],
      };
    });
    return { partId: part.id, origin, size: { width, height, thickness }, hingeSide, pivot, hinges };
  });

  const jigs: JigPlacement[] = [];
  for (const jig of kit) {
    if (jig.template === 'supportBlock') {
      // One under each door: hook on the opening's bottom edge, ledge under the door.
      const b = SUPPORT_BLOCK;
      doors.slice(0, jig.quantity).forEach((door) => {
        const centre = door.origin[0] + door.size.width / 2;
        jigs.push({
          template: jig.template,
          axes: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
          offset: [centre + b.width / 2, -(jig.params.height! + b.ledgeThickness), -b.hookDepth],
        });
      });
    } else if (doors.length > 1) {
      // The shim stands in the gap between the doors, on edge, poking out the front.
      const left = doors[0]!;
      jigs.push({
        template: jig.template,
        axes: [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
        offset: [left.origin[0] + left.size.width, H * 0.6 - GAP_SHIM.length / 2, A.doorStandoff],
      });
    }
  }

  return { opening: { width: W, height: H }, frame, carcass, doors, jigs };
}
