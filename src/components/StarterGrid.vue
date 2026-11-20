<script setup lang="ts">
/**
 * "What are you making?": the starters as a grid of pictures in their groups. A
 * starter is a thing with a usual size and shape, not a style; the style is asked next. The pictures are made
 * the way the samples' are (`public/samples/starter-<id>.webp`).
 */
import { mdiHammerWrench } from '@mdi/js';
import { STARTERS, STARTER_GROUPS, type Starter } from '@/samples/starters';

defineEmits<{ pick: [starter: Starter] }>();
const groups = STARTER_GROUPS.map((g) => ({ ...g, starters: STARTERS.filter((s) => s.group === g.id) }));
const picture = (s: Starter) => `${import.meta.env.BASE_URL}samples/starter-${s.id}.webp`;
</script>

<template>
  <div data-test="starters">
    <template v-for="g in groups" :key="g.id">
      <div class="group">
        <span>{{ g.title }}</span>
        <!-- Each group's finished examples are a group of the Samples page. -->
        <router-link v-if="g.samples" :to="{ path: '/samples', query: { topic: g.samples } }" class="examples" :data-test="`starter-samples-${g.id}`">See examples</router-link>
      </div>
      <div class="tiles">
        <button v-for="s in g.starters" :key="s.id" type="button" class="tile" :data-test="`starter-${s.id}`" @click="$emit('pick', s)">
          <span v-if="s.to" class="picture icon"><v-icon :icon="mdiHammerWrench" size="44" /></span>
          <img v-else :src="picture(s)" :alt="s.title" class="picture" loading="lazy" width="640" height="332" />
          <span class="title">{{ s.title }}</span>
          <span class="what">{{ s.what }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.group {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 18px 0 8px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}
.group:first-child {
  margin-top: 0;
}
.examples {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
}
.tile {
  display: flex;
  flex-direction: column;
  padding: 0 0 10px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.tile:hover,
.tile:focus-visible {
  border-color: rgb(var(--v-theme-primary));
}
.picture {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  object-fit: cover;
}
.picture.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.title {
  padding: 8px 12px 0;
  font-weight: 600;
}
.what {
  padding: 2px 12px 0;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.65);
}
</style>
