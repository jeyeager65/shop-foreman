<script setup lang="ts">
/**
 * The pocket-hole drill guide going onto a board and the bit going through it, round and round, with its
 * metal sleeve in place.
 *
 * A piece of board with the pocket the CNC cuts, and the guide with its sleeve in it, both drawn so
 * they can be seen through; the guide coming down onto the face with its key into the pocket and sliding in until its leg is
 * against the edge; then the bit going in along the bore until the chuck stops against the guide's back.
 * Where each is at a moment is `guideInUseAt`. The picture can be turned, and stopped.
 */
import manifoldUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { POCKET } from '@/geometry/pocketHole';
import type { SolidMesh } from '@/geometry/solids';
import { type PocketGuide, buildPocketGuideInUse, guideBitOut, guideInUseAt, guideSleeve, guideSleeves } from '@/jigs/pocketGuide';

const props = defineProps<{ guide: PocketGuide }>();
/** Where the browser fetches Manifold's WebAssembly from. Under test it is loaded from the package itself. */
const wasmUrl = import.meta.env.MODE === 'test' ? undefined : manifoldUrl;

const host = ref<HTMLDivElement | null>(null);
const status = ref('Building…');
const playing = ref(true);

let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let run = 0;
/** Seconds into the picture, and when it was last drawn. */
let clock = 0;
let last = 0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1.6, 1, 2000);
// Everything is placed in the board's frame (X in from its edge, Y across, Z up): turned up for three.js.
const world = new THREE.Group();
world.rotation.x = -Math.PI / 2;
scene.add(world);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4f58, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-120, 220, 160);
scene.add(sun);

const materials = {
  board: new THREE.MeshStandardMaterial({ color: 0xd8a868, roughness: 0.8, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }),
  // Seen through too, so the bearings in it and the bit going through it show.
  guide: new THREE.MeshStandardMaterial({ color: 0x4f86d6, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  bearing: new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.3, metalness: 0.7 }),
  bit: new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.35, metalness: 0.8 }),
  chuck: new THREE.MeshStandardMaterial({ color: 0x2f333a, roughness: 0.5, metalness: 0.4 }),
};
let made: THREE.BufferGeometry[] = [];
let jig: THREE.Group | undefined;
let drill: THREE.Group | undefined;

function geometryOf(mesh: SolidMesh): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  indexed.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  // Flat faces: every triangle its own normal, so edges read.
  const flat = indexed.toNonIndexed();
  flat.computeVertexNormals();
  indexed.dispose();
  made.push(flat);
  return flat;
}
/** A geometry made along three's Y, laid along X: the bore's own direction. */
const along = <T extends THREE.BufferGeometry>(geometry: T): T => {
  geometry.rotateZ(-Math.PI / 2);
  made.push(geometry);
  return geometry;
};
/** A group in the bore's frame: X along the bore from the board's edge, tilted up into the board. */
function bore(): THREE.Group {
  const group = new THREE.Group();
  group.rotation.y = THREE.MathUtils.degToRad(-(props.guide.low?.angleDeg ?? POCKET.angleDeg));
  group.position.set(0, 0, -props.guide.thickness / 2);
  return group;
}

function place() {
  if (!jig || !drill) return;
  const at = guideInUseAt(props.guide, clock);
  jig.position.set(-at.guide.out, 0, at.guide.up);
  drill.position.x = at.tip;
  // The bit turns while it is in the work.
  if (at.drilling) drill.rotation.x = clock * 40;
}
const render = () => renderer?.render(scene, camera);

async function build() {
  const mine = ++run;
  status.value = 'Building…';
  let meshes: Awaited<ReturnType<typeof buildPocketGuideInUse>>;
  try {
    meshes = await buildPocketGuideInUse({ ...props.guide }, wasmUrl);
  } catch (e) {
    if (mine === run) status.value = e instanceof Error ? e.message : String(e);
    return;
  }
  if (mine !== run) return;
  world.clear();
  made.forEach((g) => g.dispose());
  made = [];

  const board = new THREE.Mesh(geometryOf(meshes.board), materials.board);
  // Drawn after what stands in it, so the key and the bit show through it.
  board.renderOrder = 1;
  world.add(board);

  jig = new THREE.Group();
  const body = new THREE.Mesh(geometryOf(meshes.guide), materials.guide);
  body.renderOrder = 2;
  jig.add(body);
  // The metal sleeve (or two) in its seat: a tube round the bore.
  const { outside, bore: inner, length: width, flange } = guideSleeve(props.guide);
  const seats = bore();
  for (const s of guideSleeves(props.guide)) {
    // Its section, turned round the bore: a tube, with its flange at one end where it has one.
    const [r0, r1, rf, tf] = [inner / 2, outside / 2, (flange?.diameter ?? outside) / 2, flange?.thickness ?? 0];
    const section =
      s.flange === 'from'
        ? [[r0, 0], [rf, 0], [rf, tf], [r1, tf], [r1, width], [r0, width], [r0, 0]]
        : s.flange === 'to'
          ? [[r0, 0], [r1, 0], [r1, width - tf], [rf, width - tf], [rf, width], [r0, width], [r0, 0]]
          : [[r0, 0], [r1, 0], [r1, width], [r0, width], [r0, 0]];
    const bearing = new THREE.Mesh(along(new THREE.LatheGeometry(section.map(([x, y]) => new THREE.Vector2(x!, y!)), 40)), materials.bearing);
    bearing.position.x = s.from;
    seats.add(bearing);
  }
  jig.add(seats);
  world.add(jig);

  // The bit, its tip at the group's origin, and the chuck it stands out of.
  const out = guideBitOut(props.guide);
  const radius = props.guide.drill / 2;
  const point = radius * 0.6;
  drill = new THREE.Group();
  const shank = new THREE.Mesh(along(new THREE.CylinderGeometry(radius, radius, out - point, 24)), materials.bit);
  shank.position.x = -point - (out - point) / 2;
  const tip = new THREE.Mesh(along(new THREE.ConeGeometry(radius, point, 24)), materials.bit);
  tip.position.x = -point / 2;
  // A flat along the bit, so its turning shows.
  const flute = new THREE.Mesh(along(new THREE.BoxGeometry(radius * 0.5, out * 0.55, radius * 2.04)), materials.chuck);
  flute.position.x = -point - out * 0.275;
  const nose = new THREE.Mesh(along(new THREE.CylinderGeometry(POCKET.guideOutside * 0.22, 12.5, 14, 32)), materials.chuck);
  nose.position.x = -out - 7;
  const sleeve = new THREE.Mesh(along(new THREE.CylinderGeometry(12.5, 12.5, 26, 32)), materials.chuck);
  sleeve.position.x = -out - 27;
  drill.add(shank, tip, flute, nose, sleeve);
  const axis = bore();
  axis.add(drill);
  world.add(axis);

  status.value = '';
  place();
  render();
}

function tick(now: number) {
  frame = requestAnimationFrame(tick);
  const passed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!playing.value || !jig) return;
  clock += passed;
  place();
  render();
}

onMounted(() => {
  const el = host.value!;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    status.value = "This browser can't show 3D (WebGL is not available).";
    return;
  }
  renderer.setPixelRatio(window.devicePixelRatio);
  el.appendChild(renderer.domElement);
  // From outside the board's edge, above and to one side: the edge, the pocket and the drill all show.
  camera.position.set(-185, 120, 175);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-12, -8, 0);
  controls.update();
  controls.addEventListener('change', render);
  observer = new ResizeObserver(() => {
    const [width, height] = [el.clientWidth, el.clientHeight];
    if (!width || !height) return;
    renderer?.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  observer.observe(el);
  // For taking pictures of it frame by frame (a GIF): stops it and shows the moment asked for.
  (el as HTMLDivElement & { showAt?: (seconds: number) => void }).showAt = (seconds) => {
    playing.value = false;
    clock = seconds;
    place();
    render();
  };
  void build();
  last = performance.now();
  frame = requestAnimationFrame(tick);
});
watch(() => [props.guide.thickness, props.guide.drill], () => renderer && void build());
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  run++;
  observer?.disconnect();
  controls?.dispose();
  made.forEach((g) => g.dispose());
  Object.values(materials).forEach((m) => m.dispose());
  renderer?.dispose();
  renderer?.domElement.remove();
});
</script>

<template>
  <div>
    <div ref="host" class="in-use" data-test="guide-in-use">
      <div v-if="status" class="status text-body-2">{{ status }}</div>
    </div>
    <div class="d-flex align-center ga-3 mt-2">
      <v-btn size="small" variant="tonal" data-test="guide-in-use-play" @click="playing = !playing">{{ playing ? 'Stop' : 'Play' }}</v-btn>
      <span class="text-caption text-medium-emphasis">
        The guide comes down onto the face with its key in the pocket and slides in until its leg is against the edge; then the bit
        goes in until the chuck stops against the guide. The board and the guide are drawn so they can be seen through: the metal tube in the guide is its sleeve. Drag to turn, scroll to zoom.
      </span>
    </div>
  </div>
</template>

<style scoped>
.in-use {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(#f1ede6, #cfc8bc);
}
.in-use :deep(canvas) {
  display: block;
}
.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  text-align: center;
  color: #444;
}
</style>
