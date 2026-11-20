<script setup lang="ts">
/**
 * A G-code file with line numbers and syntax colours. The tokens come from
 * cnc-gcode-tools' own highlighter (which escapes the text), and the colours are
 * its dark theme's, so a file reads the same here as it does there.
 */
import { computed } from 'vue';
import { loadGCodeTools } from '@/gcode/gcodeTools';

const props = defineProps<{ gcode: string }>();

const html = computed(() => {
  const highlight = loadGCodeTools().highlightParametricGCodeLine;
  const lines = props.gcode.replace(/\n$/, '').split('\n');
  return lines.map((line) => `<div class="gcode-line">${highlight(line) || '&nbsp;'}</div>`).join('');
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="listing" v-html="html" />
</template>

<style scoped>
.listing {
  max-height: 380px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 12px 12px 12px 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: #14161b;
  color: #e0e0e0;
  white-space: pre;
  counter-reset: line;
}
.listing :deep(.gcode-line) {
  counter-increment: line;
}
.listing :deep(.gcode-line)::before {
  content: counter(line);
  display: inline-block;
  width: 5ch;
  margin-right: 12px;
  text-align: right;
  color: #6b7280;
  user-select: none;
}
/* cnc-gcode-tools' dark theme */
.listing :deep(.gcode-comment) { color: #999999; }
.listing :deep(.gcode-g-code) { color: #4fc3ff; font-weight: bold; }
.listing :deep(.gcode-m-code) { color: #e1aaff; font-weight: bold; }
.listing :deep(.gcode-t-code) { color: #ffd180; font-weight: bold; }
.listing :deep(.gcode-s-code) { color: #80cbc4; }
.listing :deep(.gcode-f-code) { color: #ffab91; }
.listing :deep(.gcode-coordinate) { color: #8fd6a3; }
.listing :deep(.gcode-system) { color: #ffb84d; font-weight: bold; }
.listing :deep(.gcode-x-axis) { color: #42a5f5; font-weight: 500; }
.listing :deep(.gcode-y-axis) { color: #66bb6a; font-weight: 500; }
.listing :deep(.gcode-z-axis) { color: #ba68c8; font-weight: 500; }
.listing :deep(.gcode-variable) { color: #ffb74d; font-style: italic; }
.listing :deep(.gcode-keyword) { color: #90caf9; font-weight: bold; }
.listing :deep(.gcode-oword) { color: #90caf9; font-weight: bold; }
.listing :deep(.gcode-function) { color: #ce93d8; font-weight: bold; }
.listing :deep(.gcode-operator) { color: #ef9a9a; }
.listing :deep(.gcode-bracket) { color: #ffcc80; font-weight: bold; }
.listing :deep(.gcode-number) { color: #bcaaa4; }
</style>
