<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Length } from '@/model';
import UnitButton from '@/components/UnitButton.vue';
import { lengthText, parseLength, toUnit } from '@/units';

/**
 * A length: a number with a unit toggle (in / mm) that shows which is selected. Changing the toggle
 * converts the value; the field keeps its unit with the value until it is toggled again. Inches show
 * as fractions to 1/32, with an "about" mark when the value is not an exact 32nd. A bare number is in
 * the unit shown; a typed unit (`19mm`, `2' 6"`) or a fraction (inches) switches the toggle.
 */
const props = withDefaults(
  defineProps<{
    modelValue: Length | null;
    label: string;
    /** The unit an empty field starts in: the one usual for its kind. A value brings its own. */
    defaultUnit?: 'in' | 'mm';
    /** Allow the field to be left empty (value null). */
    optional?: boolean;
    tuneMe?: boolean;
    /** Words under the field, after "Placeholder: tune me" when it is one. */
    hint?: string;
    disabled?: boolean;
    /** A bare box with no label, for a cell of a table. */
    plain?: boolean;
    /** What an empty field stands for, in mm: shown faintly in the unit of the field. */
    placeholderMm?: number;
    /** What an empty field stands for, in words ("in the middle"): shown faintly in it, in place of a hint under it. */
    emptyText?: string;
  }>(),
  { defaultUnit: 'in' },
);
const emit = defineEmits<{ 'update:modelValue': [value: Length | null]; /** The toggle changed, also on a field that is empty or only shows a value. */ 'update:unit': [unit: 'in' | 'mm'] }>();

/** The unit shown. It follows the value's; a field that only shows a derived value keeps its own toggle. */
const unit = ref<'in' | 'mm'>(props.modelValue?.unit ?? props.defaultUnit);
const shown = computed(() => (props.modelValue ? lengthText(props.modelValue.mm, unit.value) : { text: '', about: false }));
const text = ref(shown.value.text);
const error = ref('');
watch(
  () => props.modelValue?.unit ?? (props.modelValue ? undefined : props.defaultUnit),
  (u) => {
    if (u) unit.value = u;
  },
);
const hintText = computed(() => [props.tuneMe ? 'Placeholder: tune me' : '', props.hint ?? ''].filter(Boolean).join(' · '));
const placeholder = computed(() => (props.placeholderMm !== undefined ? lengthText(props.placeholderMm, unit.value).text : props.emptyText));
watch(shown, (s) => {
  text.value = s.text;
  error.value = '';
});

/** Whether what is in the box is still what was put there: only then does the "about" mark hold. */
const about = computed(() => shown.value.about && text.value === shown.value.text);
const other = computed(() => (unit.value === 'in' ? 'mm' : 'in'));
const exact = computed(() => {
  const v = props.modelValue;
  if (!v) return '';
  return unit.value === 'in' ? `About: exactly ${Number((v.mm / 25.4).toFixed(4))} in (${Number(v.mm.toFixed(3))} mm)` : `About: exactly ${Number(v.mm.toFixed(5))} mm`;
});

function commit() {
  const typed = text.value.trim();
  if (typed === '' && props.optional) {
    error.value = '';
    if (props.modelValue !== null) emit('update:modelValue', null);
    return;
  }
  // Left as it was shown: the value behind a rounded fraction is not replaced by the fraction.
  if (props.modelValue && typed === shown.value.text) {
    error.value = '';
    return;
  }
  const parsed = parseLength(typed, unit.value);
  if (!parsed) {
    error.value = 'Enter a number such as 24, 3/4, 1-1/2 or 19mm';
    return;
  }
  error.value = '';
  if (parsed.unit !== unit.value) emit('update:unit', parsed.unit);
  unit.value = parsed.unit;
  if (parsed.mm !== props.modelValue?.mm || parsed.unit !== props.modelValue?.unit) emit('update:modelValue', parsed);
  else text.value = shown.value.text;
}

/** The toggle: the same length in the other unit. What is being typed is taken first. */
function setUnit(next: 'in' | 'mm') {
  if (next === unit.value) return;
  if (!props.disabled && text.value.trim() !== shown.value.text) {
    commit();
    if (error.value) return;
  }
  unit.value = next;
  emit('update:unit', next);
  if (!props.disabled && props.modelValue) emit('update:modelValue', toUnit(props.modelValue, next));
}
</script>

<template>
  <span v-if="plain" class="plain-length">
    <span v-if="about" class="about" :title="exact" data-test="about">≈</span>
    <input v-model="text" class="plain-input" :class="{ bad: !!error }" :disabled="disabled" :placeholder="placeholder" :aria-label="label" :title="error || undefined" @blur="commit" @keydown.enter="commit" />
    <UnitButton :unit="unit" :title="`Shown in ${unit === 'in' ? 'inches' : 'mm'}. Click for ${other === 'in' ? 'inches' : 'mm'}: converts the value.`" :aria-label="`Unit: ${unit}. Change to ${other}`" data-test="unit" @click.stop="setUnit(other)" />
  </span>
  <v-text-field
    v-else
    v-model="text"
    :label="label"
    :disabled="disabled"
    :placeholder="placeholder"
    :persistent-placeholder="placeholder !== undefined"
    :error-messages="error"
    :hint="hintText || undefined"
    :persistent-hint="!!hintText"
    class="length-field"
    @blur="commit"
    @keydown.enter="commit"
  >
    <template v-if="about" #prepend-inner>
      <span class="about" :title="exact" data-test="about">≈</span>
    </template>
    <template #append-inner>
      <!-- One small button: it says the unit shown, and a click shows (and keeps) the other. -->
      <UnitButton :unit="unit" :title="`Shown in ${unit === 'in' ? 'inches' : 'mm'}. Click for ${other === 'in' ? 'inches' : 'mm'}: converts the value.`" :aria-label="`Unit: ${unit}. Change to ${other}`" data-test="unit" @click.stop="setUnit(other)" />
    </template>
  </v-text-field>
</template>

<style scoped>
.about {
  opacity: 0.7;
  cursor: help;
  padding-right: 2px;
}
/* Room for the number: the field's own padding beside the toggle is not needed. */
.length-field :deep(.v-field) {
  --v-field-padding-end: 6px;
}
.length-field :deep(.v-field__append-inner) {
  padding-inline-start: 2px;
}
.plain-length {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.plain-input {
  width: 4.1rem;
  padding: 4px 5px;
  color: inherit;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 4px;
  font: inherit;
}
.plain-input:focus {
  outline: none;
  border-color: rgb(var(--v-theme-primary));
}
.plain-input.bad {
  border-color: rgb(var(--v-theme-error));
}
</style>
