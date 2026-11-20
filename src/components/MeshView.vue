<script setup lang="ts">
/**
 * A picture of a few printable solids that can be turned: a jig or a handle on the page that lists
 * them. It follows the solids it is given.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PrintObject } from '@/jigs/threemf';
import { buildMeshScene, frameCamera } from '@/ui/meshScene';

const props = defineProps<{ objects: PrintObject[] }>();
const host = ref<HTMLDivElement | null>(null);
const status = ref('');

let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let observer: ResizeObserver | undefined;
let built: ReturnType<typeof buildMeshScene> | undefined;
const camera = new THREE.PerspectiveCamera(35, 1.6, 1, 1000);

const render = () => built && renderer?.render(built.scene, camera);
function show() {
  built?.dispose();
  built = buildMeshScene(props.objects);
  frameCamera(camera, built.size, built.centre);
  controls?.target.copy(built.centre);
  controls?.update();
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
  controls = new OrbitControls(camera, renderer.domElement);
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
  show();
});
watch(() => props.objects, show);
onBeforeUnmount(() => {
  observer?.disconnect();
  controls?.dispose();
  built?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
});
</script>

<template>
  <div ref="host" class="mesh-view" data-test="mesh-view">
    <div v-if="status" class="status text-body-2 text-medium-emphasis">{{ status }}</div>
  </div>
</template>

<style scoped>
.mesh-view {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(#f1ede6, #cfc8bc);
}
.mesh-view :deep(canvas) {
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
