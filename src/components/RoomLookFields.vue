<script setup lang="ts">
/**
 * How a room looks: its floor's kind and colour, one paint colour for its walls, and tile
 * on the walls between the countertops and the wall cabinets, which the app places (`src/design/roomLook.ts`).
 * Only drawn. Used by Setup's Room and Design's Room.
 */
import { computed } from 'vue';
import ColourSwatches from '@/components/ColourSwatches.vue';
import { FLOOR_COLOURS, FLOOR_KINDS, GROUT_COLOURS, TILE_COLOURS, TILE_LOOKS, WALL_COLOURS, starterWallTile } from '@/design/roomLook';
import type { Room, RoomLook } from '@/model';

const props = defineProps<{ room: Room }>();
const look = computed<RoomLook>(() => props.room.look ?? {});
/** Writes the look back, and takes it off the room when nothing of it is left. */
function set(next: RoomLook) {
  if (next.floor || next.wall || next.tile) props.room.look = next;
  else delete props.room.look;
}
const without = <K extends keyof RoomLook>(key: K): RoomLook => {
  const rest = { ...look.value };
  delete rest[key];
  return rest;
};

const FLOORS = [{ title: 'As drawn: wood planks', value: 'default' }, ...FLOOR_KINDS.map((k) => ({ title: k.title, value: k.value as string }))];
const floorKind = computed(() => look.value.floor?.kind ?? 'default');
function setFloorKind(kind: string) {
  const found = FLOOR_KINDS.find((k) => k.value === kind);
  set(found ? { ...look.value, floor: { kind: found.value, color: found.color } } : without('floor'));
}
const TILES = [{ title: 'None', value: 'none' }, ...TILE_LOOKS.map((t) => ({ title: t.title, value: t.value as string }))];
function setTile(value: string) {
  const found = TILE_LOOKS.find((t) => t.value === value);
  set(found ? { ...look.value, tile: look.value.tile ? { ...look.value.tile, look: found.value } : starterWallTile(found.value) } : without('tile'));
}
</script>

<template>
  <div data-test="room-look">
    <div class="text-subtitle-2 mt-4 mb-2">How it looks</div>
    <v-row density="compact">
      <v-col cols="12" sm="5">
        <v-select :model-value="floorKind" :items="FLOORS" label="Floor" density="compact" hide-details data-test="room-floor" @update:model-value="setFloorKind" />
      </v-col>
      <v-col v-if="look.floor" cols="12" sm="7">
        <ColourSwatches :model-value="look.floor.color" label="Floor colour" :colours="FLOOR_COLOURS" @update:model-value="set({ ...look, floor: { ...look.floor!, color: $event } })" />
      </v-col>
      <v-col cols="12">
        <ColourSwatches :model-value="look.wall" label="Wall colour" :colours="WALL_COLOURS" @update:model-value="set({ ...look, wall: $event })" />
        <v-btn v-if="look.wall" variant="text" size="x-small" class="mt-1" data-test="room-wall-default" @click="set(without('wall'))">As drawn</v-btn>
      </v-col>
      <v-col cols="12" sm="5">
        <v-select :model-value="look.tile?.look ?? 'none'" :items="TILES" label="Tile on the walls" density="compact" hide-details data-test="room-tile" @update:model-value="setTile" />
      </v-col>
      <template v-if="look.tile">
        <v-col cols="12" sm="7">
          <ColourSwatches :model-value="look.tile.color" label="Tile colour" :colours="TILE_COLOURS" @update:model-value="set({ ...look, tile: { ...look.tile!, color: $event } })" />
        </v-col>
        <v-col v-if="look.tile.look !== 'slab'" cols="12">
          <ColourSwatches :model-value="look.tile.grout" label="Grout" :colours="GROUT_COLOURS" @update:model-value="set({ ...look, tile: { ...look.tile!, grout: $event } })" />
        </v-col>
      </template>
    </v-row>
    <div class="text-caption text-medium-emphasis mt-2">
      Only for the picture: nothing here is cut, bought or listed. Tile goes on by itself wherever floor cabinets stand against a wall, from the countertop up to the
      wall cabinets (or to the height they hang at, where there is none above), round a window, and not behind a tall cabinet or a refrigerator.
    </div>
  </div>
</template>
