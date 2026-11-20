<script setup lang="ts">
/**
 * The samples, as a gallery: the groups down the left with a count each, the
 * group in hand's samples on the right under its sub-headings, and a box that searches every group. How a user
 * explores what the app can do, in the deployed app as well as on the dev server.
 *
 * A sample is made by `src/main.ts` on a full page load, so these are plain links, not router links, written
 * from the site's root; `linked` puts the app's base path in front, and asks for a fresh copy named after the
 * sample (`&copy=1&name=`), so opening one never changes a project that is already there.
 *
 * The list is `src/samples/samplePages.json`, which `scripts/sample-shots.mjs` reads too: it makes each
 * sample's picture, `public/samples/<id>.webp`. Run it again after adding or changing a sample. A group marked
 * `hidden` (Screens: links for building the app) is not shown here.
 */
import { mdiMagnify } from '@mdi/js';
import { computed, ref } from 'vue';
import TopicShell from '@/components/TopicShell.vue';
import { useTopics } from '@/components/topics';
import { useRoute } from 'vue-router';
import { type Sample, type SampleGroup as Group, matching, sampleGroups, searchWords } from '@/samples/sampleList';

const groups = sampleGroups();
const linked = (s: Sample) => {
  const [path, hash = ''] = s.href.slice(1).split('#');
  return `${import.meta.env.BASE_URL}${path}${path!.includes('?') ? '&' : '?'}copy=1&name=${encodeURIComponent(s.title)}${hash && `#${hash}`}`;
};
const picture = (id: string) => `${import.meta.env.BASE_URL}samples/${id}.webp`;

/** What is typed in the search box, and the samples of a group that have every word of it. */
// `#/samples?q=vanity` opens with that searched for: a starter's link to its examples.
const search = ref(String(useRoute().query.q ?? ''));
const words = computed(() => searchWords(search.value));
const found = (g: Group) => matching(g, words.value);
const count = (n: number) => (n === 1 ? '1 sample' : `${n} samples`);

const nav = useTopics(() => groups.map((g) => ({ id: g.id, title: g.title, summary: words.value.length ? `${found(g).length} of ${g.samples.length}` : count(g.samples.length), words: g.words })));

/** A group's samples under their sub-headings, in the list's order. */
function sections(g: Group) {
  const out: { title: string; samples: Sample[] }[] = [];
  for (const s of found(g)) {
    const title = s.under ?? '';
    const last = out[out.length - 1];
    if (last && last.title === title) last.samples.push(s);
    else out.push({ title, samples: [s] });
  }
  return out;
}
/** What the right pane shows: the group in hand, or while searching every group that has a match. */
const shown = computed(() => (words.value.length ? groups.filter((g) => found(g).length) : groups.filter((g) => g.id === nav.current.id)));
</script>

<template>
  <h1 class="text-h4 mb-2">Samples</h1>
  <p class="text-body-2 text-medium-emphasis mb-4">
    Finished examples of what the app makes, to look round and to start from: each opens as a new project of its own, to change as
    you like. Most of what is shown here has not yet been cut on a
    real machine: check a job before running it.
  </p>
  <TopicShell :nav="nav" name="samples" icon="view" list-label="Group">
    <template #notice>
      <v-text-field v-model="search" label="Search the samples" :prepend-inner-icon="mdiMagnify" clearable hide-details density="compact" class="mb-4" data-test="samples-search" @click:clear="search = ''" />
      <div v-if="words.length && !shown.length" class="text-body-2 text-medium-emphasis" data-test="samples-none">No sample has that.</div>
    </template>

    <template v-for="g in shown" :key="g.id">
      <div v-if="words.length" class="text-subtitle-1 font-weight-bold mb-1">{{ g.title }}</div>
      <template v-for="section in sections(g)" :key="section.title">
        <div class="section" :data-test="`samples-under-${g.id}`">{{ section.title }}</div>
        <v-row class="mb-3" density="compact">
          <v-col v-for="s in section.samples" :key="s.id" cols="12" sm="6" xl="4">
            <v-card :href="linked(s)" class="h-100" variant="outlined" data-test="sample">
              <img :src="picture(s.id)" :alt="s.title" class="picture" loading="lazy" width="640" height="400" />
              <div class="pa-4">
                <div class="text-subtitle-1">{{ s.title }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ s.what }}</div>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </template>
    </template>
  </TopicShell>
</template>

<style scoped>
.picture {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  object-position: center;
}
.section {
  margin: 4px 0 8px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}
</style>
