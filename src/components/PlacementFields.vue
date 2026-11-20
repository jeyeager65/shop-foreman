<script setup lang="ts">
/**
 * Where a run, or a cabinet in no run, stands in the room (milestone 6): against a wall
 * at a distance along it, or free (an island). "Automatically" leaves it to the layout:
 * on the back wall after what is already there, which `auto` shows.
 */
import { computed } from 'vue';
import LengthField from '@/components/LengthField.vue';
import type { Length, Placement, RoomWall } from '@/model';
import { useAppStore } from '@/stores/app';

const props = defineProps<{ placement?: Placement; auto?: Placement }>();
const emit = defineEmits<{ 'update:placement': [Placement | undefined] }>();
const store = useAppStore();
const L = computed(() => store.sizeLength);
const AUTO = 'auto';
const WALLS = [
  { title: 'Automatically (the back wall, after what is there)', value: AUTO },
  { title: 'Against the back wall', value: 'back' },
  { title: 'Against the left wall', value: 'left' },
  { title: 'Against the right wall', value: 'right' },
  { title: 'Against the front wall', value: 'front' },
  { title: 'Free standing (an island)', value: 'free' },
];
const TURNS = [
  { title: 'Facing the front wall', value: 0 },
  { title: 'Facing the right wall', value: 90 },
  { title: 'Facing the back wall', value: 180 },
  { title: 'Facing the left wall', value: 270 },
];
const zero = (): Length => ({ mm: 0, unit: 'in' });
const wall = computed({
  get: () => props.placement?.wall ?? AUTO,
  set: (value: string) => {
    if (value === AUTO) return emit('update:placement', undefined);
    const from = props.placement ?? props.auto;
    if (value === 'free') return emit('update:placement', { wall: 'free', x: zero(), y: zero(), turn: 0 });
    const along = from && from.wall !== 'free' ? { ...from.along } : zero();
    emit('update:placement', { wall: value as RoomWall, along });
  },
});
const along = computed(() => (props.placement && props.placement.wall !== 'free' ? props.placement.along : null));
const free = computed(() => (props.placement?.wall === 'free' ? props.placement : undefined));
const set = (key: 'along' | 'x' | 'y', value: Length | null) => {
  if (!value || !props.placement) return;
  emit('update:placement', { ...props.placement, [key]: value } as Placement);
};
const setTurn = (turn: 0 | 90 | 180 | 270) => free.value && emit('update:placement', { ...free.value, turn });
const autoWords = computed(() => (props.auto && props.auto.wall !== 'free' ? `${props.auto.wall} wall, ${L.value(props.auto.along.mm)} from its left end` : ''));
</script>

<template>
  <v-row density="compact" data-test="placement">
    <v-col cols="12"><v-select v-model="wall" label="Stands in the room" :items="WALLS" hide-details data-test="placement-wall" /></v-col>
    <v-col v-if="along" cols="6">
      <LengthField :model-value="along" label="From the wall's left end" data-test="placement-along" @update:model-value="set('along', $event)" />
    </v-col>
    <template v-if="free">
      <v-col cols="6"><LengthField :model-value="free.x" label="Along the back wall" @update:model-value="set('x', $event)" /></v-col>
      <v-col cols="6"><LengthField :model-value="free.y" label="Out from the back wall" @update:model-value="set('y', $event)" /></v-col>
      <v-col cols="6"><v-select :model-value="free.turn" label="Turned" :items="TURNS" hide-details @update:model-value="setTurn" /></v-col>
    </template>
  </v-row>
  <div v-if="!placement && autoWords" class="text-caption text-medium-emphasis mt-1">Now: the {{ autoWords }}.</div>
  <div v-else-if="free" class="text-caption text-medium-emphasis mt-1">Its back-left corner, from the room's back-left corner.</div>
  <div v-else class="text-caption text-medium-emphasis mt-1">Its left end, as you face the wall. Its back is against the wall.</div>
</template>
