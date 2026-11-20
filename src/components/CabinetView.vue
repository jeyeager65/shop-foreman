<script setup lang="ts">
/**
 * 3D view of the doors on the cabinet: face frame, doors built as real solids,
 * schematic hinges, a slider to swing the doors, and the install kit either in
 * place on the cabinet or laid out on the print bed.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ASSEMBLY, type Assembly, type Box, buildAssembly } from '@/design/assembly';
import type { SolidMesh } from '@/geometry/solids';
import type { DoorMounting, JigInstance, Opening, Part } from '@/model';
import type { SolidRequest, SolidResponse } from '@/workers/solid.worker';

const props = withDefaults(
  defineProps<{
    parts: Part[];
    opening: Opening;
    mounting: DoorMounting;
    kit?: JigInstance[];
    /** 'cabinet': doors on the face frame. 'bed': the kit as it prints. */
    mode?: 'cabinet' | 'bed';
    /** Whether the kit starts out shown on the cabinet. */
    kitShown?: boolean;
    /** Starting door angle in degrees. */
    startOpen?: number;
  }>(),
  { kit: () => [], mode: 'cabinet', kitShown: false, startOpen: 0 },
);

const host = ref<HTMLDivElement | null>(null);
const status = ref('Building solids…');
const openDeg = ref(props.startOpen);
const showKit = ref(props.kitShown);
const hasKit = computed(() => props.kit.length > 0);

let worker: Worker | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let observer: ResizeObserver | undefined;
let requestId = 0;
let built: SolidResponse | undefined;
let swings: { group: THREE.Group; sign: number }[] = [];
let kitGroup: THREE.Group | undefined;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
const content = new THREE.Group();
const materials = {
  door: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.85, flatShading: true }),
  frame: new THREE.MeshStandardMaterial({ color: 0x8e96a3, roughness: 0.9 }),
  carcass: new THREE.MeshStandardMaterial({ color: 0x4a505b, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.4, metalness: 0.25 }),
  jig: new THREE.MeshStandardMaterial({ color: 0xf0a45d, roughness: 0.7, flatShading: true }),
  bed: new THREE.MeshStandardMaterial({ color: 0x3a3f49, roughness: 1 }),
};

function render() {
  renderer?.render(scene, camera);
}

function geometryOf(mesh: SolidMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  return geometry;
}

function boxMesh(b: Box, material: THREE.Material): THREE.Mesh {
  const size = b.max.map((v, i) => v - b.min[i]!) as [number, number, number];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(b.min[0] + size[0] / 2, b.min[1] + size[1] / 2, b.min[2] + size[2] / 2);
  return mesh;
}

function clear() {
  content.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
  content.clear();
  swings = [];
  kitGroup = undefined;
}

function buildCabinet(assembly: Assembly, response: SolidResponse) {
  for (const b of assembly.frame) content.add(boxMesh(b, materials.frame));
  for (const b of assembly.carcass) content.add(boxMesh(b, materials.carcass));

  for (const door of assembly.doors) {
    // Everything that swings hangs off a group at the pivot.
    const swing = new THREE.Group();
    swing.position.set(door.pivot.x, 0, door.pivot.z);
    const local = (mesh: THREE.Object3D) => {
      mesh.position.x -= door.pivot.x;
      mesh.position.z -= door.pivot.z;
      swing.add(mesh);
    };
    const solid = response.meshes?.find((m) => m.partId === door.partId);
    if (solid) {
      const mesh = new THREE.Mesh(geometryOf(solid.mesh), materials.door);
      mesh.position.set(...door.origin);
      local(mesh);
    }
    for (const hinge of door.hinges) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(hinge.cup.diameter / 2 - 0.3, hinge.cup.diameter / 2 - 0.3, hinge.cup.depth - 0.3, 48),
        materials.metal,
      );
      cup.rotation.x = Math.PI / 2; // axis along Z
      cup.position.set(hinge.cup.x, hinge.cup.y, door.origin[2] + hinge.cup.depth / 2 - 0.3);
      local(cup);
      local(boxMesh(hinge.flange, materials.metal));
      for (const b of hinge.fixed) content.add(boxMesh(b, materials.metal));
    }
    content.add(swing);
    swings.push({ group: swing, sign: door.hingeSide === 'left' ? -1 : 1 });
  }

  kitGroup = new THREE.Group();
  const counts = new Map<string, number>();
  for (const jig of assembly.jigs) {
    const object = response.kit?.find((k) => k.template === jig.template);
    if (!object) continue;
    counts.set(jig.template, (counts.get(jig.template) ?? 0) + 1);
    const mesh = new THREE.Mesh(geometryOf(object.mesh), materials.jig);
    mesh.matrixAutoUpdate = false;
    mesh.matrix
      .makeBasis(new THREE.Vector3(...jig.axes[0]), new THREE.Vector3(...jig.axes[1]), new THREE.Vector3(...jig.axes[2]))
      .setPosition(...jig.offset);
    kitGroup.add(mesh);
  }
  content.add(kitGroup);
}

function buildBed(response: SolidResponse) {
  // The bed lies flat: the print's Z is up.
  const bed = new THREE.Group();
  bed.rotation.x = -Math.PI / 2;
  for (const object of response.kit ?? []) {
    const geometry = geometryOf(object.mesh);
    for (const p of object.placements) {
      const mesh = new THREE.Mesh(geometry, materials.jig);
      mesh.position.set(p.x, p.y, 0);
      bed.add(mesh);
    }
  }
  const box = new THREE.Box3().setFromObject(bed);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.bed);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  plate.scale.set(size.x + 40, 1, size.z + 40);
  plate.position.set(centre.x, box.min.y - 0.5, centre.z);
  content.add(bed, plate);
}

function apply() {
  for (const s of swings) s.group.rotation.y = s.sign * THREE.MathUtils.degToRad(openDeg.value);
  if (kitGroup) kitGroup.visible = showKit.value;
  render();
}

function show(response: SolidResponse) {
  built = response;
  clear();
  content.position.set(0, 0, 0);
  if (props.mode === 'bed') buildBed(response);
  else buildCabinet(buildAssembly(props.opening, props.mounting, props.parts, props.kit), response);
  apply();

  // Centre on the origin so orbiting turns the piece in place. Framed with the doors
  // closed so the view doesn't jump as they open.
  const box = new THREE.Box3().setFromObject(content);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  if (props.mode === 'cabinet') centre.z = 0; // turn about the face frame, not the middle of the box
  content.position.sub(centre);
  const reach = Math.max(size.x, size.y, props.mode === 'bed' ? size.z : 0) * (props.mode === 'bed' ? 1.5 : 2.4);
  if (props.mode === 'bed') camera.position.set(reach * 0.35, reach * 0.7, reach * 0.75);
  // With the kit on, look from below the doors so the ledges under them show.
  else if (showKit.value) camera.position.set(reach * 0.45, -reach * 0.3, reach * 0.8);
  else camera.position.set(reach * 0.5, reach * 0.3, reach);
  controls?.target.set(0, 0, 0);
  controls?.update();
  status.value = '';
  render();
}

function build() {
  if (!worker) return;
  if (props.mode === 'cabinet' && props.parts.length === 0) return;
  status.value = 'Building solids…';
  // Plain copies: Vue's reactive proxies can't be posted to a worker.
  const plain = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
  const request: SolidRequest = {
    id: ++requestId,
    parts: props.mode === 'bed' ? [] : plain(props.parts),
    kit: plain(props.kit),
  };
  worker.postMessage(request);
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
  scene.add(content, new THREE.HemisphereLight(0xffffff, 0x30343c, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-400, 600, 900);
  scene.add(sun);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', render);
  observer = new ResizeObserver(() => {
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;
    renderer?.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  observer.observe(el);

  worker = new Worker(new URL('../workers/solid.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<SolidResponse>) => {
    if (event.data.id !== requestId) return; // a newer build is on its way
    if (event.data.meshes) show(event.data);
    else status.value = `The solid could not be built: ${event.data.error ?? 'unknown error'}`;
  };
  worker.onerror = (event) => {
    status.value = `The solid could not be built: ${event.message}`;
  };
  build();
});

watch(() => [props.parts, props.kit, props.opening, props.mounting], build, { deep: true });
watch(
  () => props.mode,
  () => (built && (props.mode === 'bed' || built.meshes?.length) ? show(built) : build()),
);
watch([openDeg, showKit], apply);

onBeforeUnmount(() => {
  worker?.terminate();
  observer?.disconnect();
  controls?.dispose();
  clear();
  for (const material of Object.values(materials)) material.dispose();
  renderer?.dispose();
});
</script>

<template>
  <div>
    <div class="wrap">
      <div ref="host" class="view" />
      <div v-if="status" class="status text-body-2 text-medium-emphasis">{{ status }}</div>
    </div>
    <div v-if="mode === 'cabinet'" class="d-flex align-center mt-2 ga-4">
      <span class="text-body-2 text-medium-emphasis">Doors</span>
      <v-slider v-model="openDeg" :min="0" :max="ASSEMBLY.maxOpenDeg" :step="1" density="compact" hide-details class="flex-grow-1" />
      <span class="text-body-2 angle">{{ openDeg === 0 ? 'Closed' : `${openDeg}°` }}</span>
      <v-switch v-if="hasKit" v-model="showKit" label="Install kit" color="primary" density="compact" hide-details class="flex-grow-0" />
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  background: #2a2e37;
  border-radius: 8px;
}
.view {
  width: 100%;
  height: 520px;
}
.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.angle {
  width: 52px;
}
</style>
