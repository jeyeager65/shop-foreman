<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { type GCodeParserInstance, loadGCodeTools } from '@/gcode/gcodeTools';

const props = defineProps<{ gcode: string }>();
const emit = defineEmits<{ parsed: [parser: GCodeParserInstance] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const problem = ref('');
const toolNumbers = ref<number[]>([]);
const names = ref<Record<number, string>>({});
const COLORS = ['#7fb0ff', '#f0a45d', '#7ddc9a', '#d59cff', '#ffd866'];
const colorOf = (n: number) => COLORS[(n - 1 + COLORS.length) % COLORS.length]!;

/** Top view of the moves as cnc-gcode-tools parsed them, coloured by bit. */
async function draw() {
  problem.value = '';
  try {
    const parser = new (loadGCodeTools().GCodeParser)();
    const segments = await parser.parseString(props.gcode);
    emit('parsed', parser);
    const stock = parser.simMeta.stock;
    toolNumbers.value = [...new Set(segments.filter((s) => s.type === 'cut').map((s) => s.toolNumber))].sort();
    names.value = Object.fromEntries([...parser.simMeta.tools].map(([n, t]) => [n, t.name ?? `Bit ${n}`]));

    const el = canvas.value;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !stock) return;
    const w = stock.xmax - stock.xmin;
    const h = stock.ymax - stock.ymin;
    const scale = Math.min(el.width / w, el.height / h) * 0.94;
    const ox = (el.width - w * scale) / 2;
    const oy = (el.height - h * scale) / 2;
    const X = (x: number) => ox + (x - stock.xmin) * scale;
    const Y = (y: number) => el.height - oy - (y - stock.ymin) * scale;

    ctx.clearRect(0, 0, el.width, el.height);
    ctx.fillStyle = '#2e323b';
    ctx.fillRect(X(stock.xmin), Y(stock.ymax), w * scale, h * scale);
    for (const pass of ['rapid', 'cut'] as const) {
      for (const s of segments) {
        if (s.type !== pass) continue;
        ctx.beginPath();
        ctx.setLineDash(pass === 'rapid' ? [4, 4] : []);
        ctx.strokeStyle = pass === 'rapid' ? '#5d6573' : colorOf(s.toolNumber);
        ctx.lineWidth = 1;
        ctx.moveTo(X(s.start.x), Y(s.start.y));
        ctx.lineTo(X(s.end.x), Y(s.end.y));
        ctx.stroke();
      }
    }
  } catch (e) {
    problem.value = `cnc-gcode-tools could not read this file: ${e instanceof Error ? e.message : String(e)}`;
  }
}

onMounted(draw);
watch(() => props.gcode, draw);
</script>

<template>
  <div>
    <v-alert v-if="problem" type="error" variant="tonal" density="compact">{{ problem }}</v-alert>
    <canvas ref="canvas" width="700" height="700" class="preview" />
    <div class="legend text-caption text-medium-emphasis">
      <span v-for="n in toolNumbers" :key="n"><i :style="{ background: colorOf(n) }" />{{ names[n] ?? `Bit ${n}` }}</span>
      <span><i class="rapid" />Rapid</span>
    </div>
  </div>
</template>

<style scoped>
.preview {
  width: 100%;
  max-width: 560px;
  display: block;
  margin: 0 auto;
}
.legend {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.legend i {
  display: inline-block;
  width: 18px;
  height: 2px;
  margin-right: 6px;
  vertical-align: middle;
}
.legend i.rapid {
  background: repeating-linear-gradient(90deg, #5d6573 0 4px, transparent 4px 8px);
}
</style>
