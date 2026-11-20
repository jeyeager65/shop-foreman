<script setup lang="ts">
/**
 * A colour chosen from a few named ones, or any other: a row of swatches and a custom colour beside them
 * (for a room's floor, walls and tile). The value is `#rrggbb`.
 */
const props = defineProps<{ modelValue: string | undefined; label: string; colours: { name: string; value: string }[]; /** Shown as chosen when nothing is: what is drawn then. */ fallback?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isCustom = () => !!props.modelValue && !props.colours.some((c) => same(c.value, props.modelValue));
</script>

<template>
  <div class="swatches" :data-test="`swatches-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`">
    <div class="text-caption text-medium-emphasis mb-1">{{ label }}</div>
    <div class="d-flex flex-wrap align-center ga-1">
      <button
        v-for="c in colours"
        :key="c.value"
        type="button"
        class="swatch"
        :class="{ chosen: same(c.value, modelValue ?? fallback) }"
        :style="{ background: c.value }"
        :title="c.name"
        :aria-label="c.name"
        :aria-pressed="same(c.value, modelValue ?? fallback)"
        @click="emit('update:modelValue', c.value)"
      />
      <label class="swatch custom" :class="{ chosen: isCustom() }" title="Another colour">
        <input type="color" :value="modelValue ?? fallback ?? '#ffffff'" aria-label="Another colour" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.swatch {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-border-color), 0.4);
  cursor: pointer;
  padding: 0;
}
.swatch.chosen {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
.swatch.custom {
  display: inline-block;
  overflow: hidden;
  background: conic-gradient(#e66, #ee6, #6e6, #6ee, #66e, #e6e, #e66);
}
.swatch.custom input {
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
</style>
