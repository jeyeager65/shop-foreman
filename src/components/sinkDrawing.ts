/**
 * A sink drawn as a sink (`SinkLook`): each bowl a thin shell from its opening down to its floor, the sides drawing in a
 * little, a drain in the floor; a drop-in's rim on the top round its bowls; a vessel standing on the top; a farmhouse
 * sink's apron; a faucet. Built in the frame of the part that stands for the sink: X across, Y back from its front
 * edge, Z up.
 */
import * as THREE from 'three';
import type { SinkLook } from '@/model';
import { roundedOutline } from '@/design/sinks';

/**
 * How much a bowl's flat floor is smaller than its opening, each way: a square-cornered sink's floor is most of it, a
 * round bowl's (a vanity's) much less, its sides curving down to it; a vessel's least.
 */
const FLOOR_SCALE = { rectangle: 0.8, oval: 0.45, vessel: 0.4 };
const CORNER = { opening: 30, floor: 45 };

export interface SinkMaterials {
  steel: THREE.Material;
  white: THREE.Material;
  dark: THREE.Material;
}

/** A loop of points at a height, in the part's frame: `outline` centred on (cx, cy), its Y back as the frame's. */
function loopAt(outline: [number, number][], cx: number, cy: number, z: number): THREE.Vector3[] {
  return outline.map(([x, f]) => new THREE.Vector3(cx + x, cy - f, z));
}

/** How many rings the curve from a bowl's wall into its floor is drawn in. */
const CURVE_RINGS = 10;

/**
 * A bowl between two loops of as many points each, the opening (`top`) and the floor's edge (`bottom`): its wall goes
 * down from the opening nearly straight, then rounds into the floor, a quarter of an ellipse in section; then the floor.
 */
function bowlGeometry(top: THREE.Vector3[], bottom: THREE.Vector3[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const n = top.length;
  const push = (...v: THREE.Vector3[]) => v.forEach((p) => positions.push(p.x, p.y, p.z));
  // Ring k at angle θ = k/K · 90°: across, from the opening (cos θ = 1) to the floor's edge; down, sin θ of the way.
  const rings = Array.from({ length: CURVE_RINGS + 1 }, (_, k) => {
    const theta = ((Math.PI / 2) * k) / CURVE_RINGS;
    const [across, down] = [Math.cos(theta), Math.sin(theta)];
    return top.map((t, i) => {
      const b = bottom[i]!;
      return new THREE.Vector3(b.x + (t.x - b.x) * across, b.y + (t.y - b.y) * across, t.z + (b.z - t.z) * down);
    });
  });
  for (let k = 0; k < CURVE_RINGS; k++) {
    const [upper, lower] = [rings[k]!, rings[k + 1]!];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(upper[i]!, lower[i]!, lower[j]!, upper[i]!, lower[j]!, upper[j]!);
    }
  }
  // The floor: a fan from its middle.
  const middle = bottom.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
  for (let i = 0; i < n; i++) push(middle, bottom[(i + 1) % n]!, bottom[i]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A flat ring between an outer and an inner outline (or several inner ones), as a shape with holes. */
function ringGeometry(outer: [number, number][], holes: [number, number][][]): THREE.ShapeGeometry {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ShapeGeometry(shape);
}

/** The sink, as a group in the part's frame. */
export function sinkObject(look: SinkLook, materials: SinkMaterials): THREE.Group {
  const group = new THREE.Group();
  const body = look.colour === 'white' ? materials.white : materials.steel;
  const twoSided = (m: THREE.Material) => {
    const copy = m.clone();
    copy.side = THREE.DoubleSide;
    return copy;
  };
  const shell = twoSided(body);
  for (const b of look.bowls) {
    const scale = look.vessel ? FLOOR_SCALE.vessel : FLOOR_SCALE[look.shape];
    const opening = roundedOutline(b.width, b.depth, look.shape, CORNER.opening);
    const floor = roundedOutline(b.width * scale, b.depth * scale, look.shape, CORNER.floor);
    group.add(new THREE.Mesh(bowlGeometry(loopAt(opening, b.cx, b.cy, b.top), loopAt(floor, b.cx, b.cy, b.floor)), shell));
    // The drain: a dark disc just over the floor's middle, with a ring round it.
    const drain = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 2, 32), materials.dark);
    drain.rotation.x = Math.PI / 2;
    drain.position.set(b.cx, b.cy, b.floor + 1.5);
    group.add(drain);
    // A vessel's rim: a lip round its opening, so the bowl reads as having a wall.
    if (look.vessel) {
      // A thin round tube along its opening's edge.
      const curve = new THREE.CatmullRomCurve3(loopAt(opening, b.cx, b.cy, b.top), true);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, opening.length * 2, 4, 8, true), body));
    }
  }
  // A drop-in's rim: on the top, round its bowls (each bowl's opening a hole in it).
  if (look.rim) {
    const { width, depth, z } = look.rim;
    const outer = roundedOutline(width, depth, look.shape, 25).map(([x, f]): [number, number] => [width / 2 + x, depth / 2 - f]);
    const holes = look.bowls.map((b) => roundedOutline(b.width, b.depth, look.shape, CORNER.opening).map(([x, f]): [number, number] => [b.cx + x, b.cy - f]));
    const deck = new THREE.Mesh(ringGeometry(outer, holes), shell);
    deck.position.z = z + 1.5;
    group.add(deck);
  }
  // A farmhouse sink's apron: a slab across its front, standing down from the top.
  if (look.apron) {
    const { width, height, z } = look.apron;
    const apron = new THREE.Mesh(new THREE.BoxGeometry(width, 20, height), body);
    apron.position.set(width / 2, 10, z - height / 2);
    group.add(apron);
  }
  if (look.faucet) group.add(faucetObject(look.faucet, materials.steel));
  return group;
}

/** A faucet: a round foot, a column, a spout bending forward over the sink, and a lever. */
function faucetObject(f: NonNullable<SinkLook['faucet']>, metal: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const bar = (length: number, radius: number) => new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), metal);
  const foot = bar(12, 26);
  foot.rotation.x = Math.PI / 2;
  foot.position.set(f.x, f.y, f.z + 6);
  const column = bar(f.height, 13);
  column.rotation.x = Math.PI / 2;
  column.position.set(f.x, f.y, f.z + f.height / 2);
  // The spout: forward (toward -Y) from the top of the column, then a short drop.
  const spout = bar(f.reach, 11);
  spout.position.set(f.x, f.y - f.reach / 2, f.z + f.height);
  const tip = bar(40, 11);
  tip.rotation.x = Math.PI / 2;
  tip.position.set(f.x, f.y - f.reach, f.z + f.height - 20);
  const lever = bar(70, 7);
  lever.rotation.z = Math.PI / 2;
  lever.position.set(f.x + 45, f.y, f.z + f.height * 0.45);
  group.add(foot, column, spout, tip, lever);
  return group;
}
