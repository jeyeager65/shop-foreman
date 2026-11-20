<script setup lang="ts">
/**
 * 3D preview of a G-code file: cnc-gcode-tools parses it, carves the stock with each
 * bit's shape and draws the result. Three.js only supplies the orbit camera here; the
 * drawing is cnc-gcode-tools' own WebGL renderer.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  type GCodeParserInstance,
  type GCodeSegment,
  type StockMeshRendererInstance,
  type StockSimulatorInstance,
  loadGCodeTools,
} from '@/gcode/gcodeTools';

const props = defineProps<{ gcode: string }>();
const emit = defineEmits<{ parsed: [parser: GCodeParserInstance] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const status = ref('Carving…');
const problem = ref('');
const gouges = ref(0);
/** How many moves are carved; the slider scrubs it. */
const position = ref(0);
const total = ref(0);

const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
camera.up.set(0, 0, 1);
const basis = {
  getBasis() {
    const e = camera.matrixWorld.elements;
    return {
      right: { x: e[0]!, y: e[1]!, z: e[2]! },
      up: { x: e[4]!, y: e[5]!, z: e[6]! },
      back: { x: e[8]!, y: e[9]!, z: e[10]! },
    };
  },
};
const mvp = new THREE.Matrix4();
const TOOL_COLOR = [0.5, 0.69, 1];

let gl: WebGLRenderingContext | null = null;
let renderer: StockMeshRendererInstance | undefined;
let sim: StockSimulatorInstance | undefined;
let segments: GCodeSegment[] = [];
let controls: OrbitControls | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let run = 0;

function draw() {
  if (!gl || !renderer || !sim) return;
  camera.updateMatrixWorld();
  mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const matrix = new Float32Array(mvp.elements);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.165, 0.18, 0.216, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  renderer.update();
  renderer.draw(matrix, basis, 'dark');
  // The bit, while scrubbing part way through the file
  const at = segments[position.value - 1];
  if (at && position.value < segments.length) {
    const tool = sim.tools.get(at.toolNumber) ?? sim.defaultTool;
    if (tool) renderer.drawTool(matrix, basis, at.end, tool, TOOL_COLOR);
  }
}

/** Carves toward the slider position a slice at a time so the page stays responsive. */
function step() {
  frame = 0;
  if (!sim) return;
  const done = sim.advanceTo(position.value, 25);
  draw();
  if (done) {
    status.value = '';
    gouges.value = sim.gouges.size;
  } else {
    schedule();
  }
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(step);
}

function frameStock(stock: { xmin: number; xmax: number; ymin: number; ymax: number; zmin: number; zmax: number }) {
  const centre = new THREE.Vector3((stock.xmin + stock.xmax) / 2, (stock.ymin + stock.ymax) / 2, stock.zmax);
  const reach = Math.max(stock.xmax - stock.xmin, stock.ymax - stock.ymin) * 2.2;
  // From the operator's side: front of the machine toward the viewer
  camera.position.set(centre.x - reach * 0.2, centre.y - reach * 0.75, centre.z + reach * 0.65);
  controls?.target.copy(centre);
  controls?.update();
}

async function load() {
  const mine = ++run;
  problem.value = '';
  status.value = 'Carving…';
  if (!gl || !renderer) return;
  try {
    const tools = loadGCodeTools();
    const parser = new tools.GCodeParser();
    const parsed = await parser.parseString(props.gcode);
    if (mine !== run) return; // a newer file is loading
    emit('parsed', parser);
    const stock = parser.simMeta.stock;
    if (!stock) throw new Error('the file has no (Stock: ...) comment');
    segments = parsed;
    sim = new tools.StockSimulator(stock, parser.simMeta.tools, { maxCells: 600000 });
    sim.setSegments(segments);
    renderer.setSimulator(sim);
    total.value = segments.length;
    position.value = segments.length;
    frameStock(stock);
    schedule();
  } catch (e) {
    status.value = '';
    problem.value = `cnc-gcode-tools could not preview this file: ${e instanceof Error ? e.message : String(e)}`;
  }
}

onMounted(() => {
  const el = canvas.value!;
  gl = el.getContext('webgl', { antialias: true });
  if (!gl) {
    status.value = "This browser can't show 3D (WebGL is not available).";
    return;
  }
  renderer = new (loadGCodeTools().StockMeshRenderer)(gl);
  controls = new OrbitControls(camera, el);
  controls.addEventListener('change', draw);
  observer = new ResizeObserver(() => {
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;
    el.width = Math.round(width * window.devicePixelRatio);
    el.height = Math.round(height * window.devicePixelRatio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  });
  observer.observe(el);
  void load();
});

watch(() => props.gcode, load);
watch(position, schedule);

onBeforeUnmount(() => {
  run++;
  if (frame) cancelAnimationFrame(frame);
  observer?.disconnect();
  controls?.dispose();
  renderer?.destroy();
});
</script>

<template>
  <div>
    <v-alert v-if="problem" type="error" variant="tonal" density="compact" class="mb-2">{{ problem }}</v-alert>
    <div class="wrap">
      <canvas ref="canvas" class="view" />
      <div v-if="status" class="status text-body-2 text-medium-emphasis">{{ status }}</div>
    </div>
    <v-slider v-model="position" :min="0" :max="total" :step="1" :disabled="!total" density="compact" hide-details class="mt-1" />
    <div class="text-caption text-medium-emphasis">
      Move {{ position }} of {{ total }}. Drag to orbit, scroll to zoom, right-drag to pan.
    </div>
    <v-alert v-if="gouges" type="error" variant="tonal" density="compact" class="mt-2">
      {{ gouges }} rapid move(s) cut into the stock.
    </v-alert>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  background: #2a2e37;
  border-radius: 8px;
  overflow: hidden;
}
.view {
  display: block;
  width: 100%;
  height: 460px;
}
.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>
