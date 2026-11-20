<script setup lang="ts">
/**
 * A length that the model keeps as a plain number of mm (a probe's travel, a tab's width, a handle's
 * hole spacing), in the same field as any other length: a number with a unit toggle. The planner and
 * the CAM go on reading the number; the unit it is shown in is kept beside it, in `shownIn` on the
 * thing that owns it (`shownUnit`, `setShownUnit`), under `field`.
 */
import { computed } from 'vue';
import LengthField from '@/components/LengthField.vue';
import type { Length, LengthUnit, ShownIn } from '@/model';
import { setShownUnit, shownUnit } from '@/units';

const props = defineProps<{
  modelValue: number | null | undefined;
  /** What holds the value: its `shownIn` remembers the unit. */
  owner: { shownIn?: ShownIn };
  /** The value's key in `shownIn`: its path in the owner. */
  field: string;
  label: string;
  optional?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const unit = computed(() => shownUnit(props.owner, props.field));
const length = computed<Length | null>(() => (typeof props.modelValue === 'number' && Number.isFinite(props.modelValue) ? { mm: props.modelValue, unit: unit.value } : null));

function set(value: Length | null) {
  if ((value?.mm ?? null) !== (length.value?.mm ?? null)) emit('update:modelValue', value ? value.mm : null);
}
const remember = (u: LengthUnit) => setShownUnit(props.owner, props.field, u);
</script>

<template>
  <LengthField :model-value="length" :label="label" :default-unit="unit" :optional="optional" @update:model-value="set" @update:unit="remember" />
</template>
