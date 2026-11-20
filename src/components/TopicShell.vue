<script setup lang="ts">
/**
 * Three panes (lifted out of Setup): a rail of topics on the left, each with its
 * answer in a line, in groups, with a second level under the one in hand; the topic in hand in the middle under a
 * head that stays, with Back and Next at its foot; a picture on the right. Under 1280 px the rail is a select and
 * the panes stack. Which topic is in hand, and the address, are `useTopics` (`topics.ts`).
 *
 * Slots: the default one is the topic's fields; `notice` is over them (under the head); `last` is in Next's
 * place on the last topic; `picture` is the third pane (left out, the fields take its room).
 */
import { mdiCheck } from '@mdi/js';
import { computed, useSlots } from 'vue';
import { useDisplay } from 'vuetify';
import PanelTitle, { type PanelIcon } from '@/components/PanelTitle.vue';
import type { TopicNav } from '@/components/topics';

const props = withDefaults(
  defineProps<{
    nav: TopicNav;
    /** Starts every `data-test` here: `setup` gives `setup-topics`, `setup-topic-<id>`, `setup-next`. */
    name: string;
    icon?: PanelIcon;
    /** What the rail lists, as the select's label when narrow. */
    listLabel?: string;
    /** What a topic's dot means, as its tooltip. */
    dotTitle?: string;
    /** The picture stays in view while the fields scroll: off for one longer than the window (a table). */
    stick?: boolean;
    /** The three panes' widths in twelfths, at 1280 px and from 1920 px. */
    lg?: [number, number, number];
    xl?: [number, number, number];
  }>(),
  { stick: true, icon: 'checklist', listLabel: 'Topic', dotTitle: 'Differs', lg: () => [3, 5, 4], xl: () => [2, 5, 5] },
);

const slots = useSlots();
/** Wide enough for three panes: under it the topics are a select over the topic, and the picture comes after. */
const { lgAndUp } = useDisplay();
const items = computed(() => props.nav.topics.map((t) => ({ title: `${t.title}${t.done ? ' ✓' : ''}${t.warn ? ' (!)' : ''}${t.dot ? ' •' : ''}`, value: t.id, props: { subtitle: t.summary } })));
/** Without a picture the fields have its room too. */
const middle = computed(() => (slots.picture ? { lg: props.lg[1], xl: props.xl[1] } : { lg: props.lg[1] + props.lg[2], xl: props.xl[1] + props.xl[2] }));
</script>

<template>
  <v-row>
    <!-- The topics: each with its answer in a line, so the whole page reads at a glance. -->
    <v-col cols="12" :lg="lg[0]" :xl="xl[0]" class="topic-rail-col">
      <v-select v-if="!lgAndUp" :model-value="nav.current.id" :items="items" :label="listLabel" hide-details :data-test="`${name}-topic-select`" @update:model-value="nav.open" />
      <v-card v-else class="topic-rail" :data-test="`${name}-topics`">
        <v-list density="compact" nav :selected="[nav.current.id]" mandatory @update:selected="nav.open(($event as unknown[])[0])">
          <template v-for="(t, i) in nav.topics" :key="t.id">
            <v-list-subheader v-if="t.group && t.group !== nav.topics[i - 1]?.group" class="topic-group">{{ t.group }}</v-list-subheader>
            <v-list-item :value="t.id" :data-test="`${name}-topic-${t.id}`" lines="two">
              <v-list-item-title class="font-weight-bold">
                {{ t.title }}<v-icon v-if="t.done" :icon="mdiCheck" size="16" color="success" class="ml-1" :data-test="`${name}-done-${t.id}`" title="Done" /><span v-if="t.dot" class="topic-dot" :data-test="`${name}-differs-${t.id}`" :title="dotTitle" />
                <span v-if="t.warn" class="topic-warn" :data-test="`${name}-warns-${t.id}`" title="Something here needs a look">!</span>
              </v-list-item-title>
              <v-list-item-subtitle>{{ t.summary }}</v-list-item-subtitle>
            </v-list-item>
            <!-- The second level, under the topic in hand only. -->
            <div v-if="t.id === nav.current.id && nav.subs.length" :key="`${t.id}-subs`" class="topic-subs" :data-test="`${name}-subs`">
              <button v-for="x in nav.subs" :key="x.id" type="button" class="topic-sub" :class="{ on: x.id === nav.currentSub?.id }" :data-test="`${name}-sub-${x.id}`" @click="nav.open(t.id, x.id)">
                <span class="name">{{ x.title }}<span v-if="x.dot" class="topic-dot" /></span>
                <span class="answer">{{ x.summary }}</span>
              </button>
            </div>
          </template>
        </v-list>
      </v-card>
    </v-col>

    <!-- The topic in hand. -->
    <v-col cols="12" :lg="middle.lg" :xl="middle.xl" class="topic-body-col">
      <v-card class="pa-5 mb-4 topic-body" :data-test="`${name}-questions`">
        <!-- The topic's name and its line of explanation stay in view while its answers scroll. -->
        <div class="topic-head">
          <PanelTitle :icon="icon">{{ nav.current.title }}<template v-if="nav.currentSub"> · {{ nav.currentSub.title }}</template></PanelTitle>
          <div class="text-body-2 text-medium-emphasis pb-3" :data-test="`${name}-topic-words`">{{ nav.currentSub?.words ?? nav.current.words }}</div>
        </div>
        <!-- Narrow: the second level as a row of choices over the answers. -->
        <v-chip-group v-if="nav.subs.length && !lgAndUp" column :model-value="nav.currentSub?.id" mandatory selected-class="text-primary" class="mb-3" @update:model-value="nav.open(nav.current.id, $event)">
          <v-chip v-for="x in nav.subs" :key="x.id" :value="x.id" size="small" variant="outlined" :data-test="`${name}-sub-chip-${x.id}`">{{ x.title }}</v-chip>
        </v-chip-group>
        <slot name="notice" />

        <slot />

        <v-divider class="my-4" />
        <div class="d-flex flex-wrap ga-2">
          <v-btn v-if="nav.before" variant="text" :data-test="`${name}-back`" @click="nav.open(nav.before.topic, nav.before.sub)">Back: {{ nav.before.title }}</v-btn>
          <v-spacer />
          <v-btn v-if="nav.after" color="primary" variant="tonal" :data-test="`${name}-next`" @click="nav.open(nav.after.topic, nav.after.sub)">Next: {{ nav.after.title }}</v-btn>
          <slot v-else name="last" />
        </div>
      </v-card>
    </v-col>

    <v-col v-if="$slots.picture" cols="12" :lg="lg[2]" :xl="xl[2]" class="topic-picture-col">
      <div :class="{ 'topic-picture': stick }"><slot name="picture" /></div>
    </v-col>
  </v-row>
</template>

<style scoped>
/* The picture and the topics stay in view while the answers scroll. */
@media (min-width: 1280px) {
  .topic-picture,
  .topic-rail {
    position: sticky;
    top: 80px;
  }
  /* A rail longer than the window (a job of many blanks) scrolls in its own place. */
  .topic-rail {
    max-height: calc(100vh - 96px);
    overflow-y: auto;
  }
}
.topic-group {
  min-height: 28px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.topic-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
}
.topic-warn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 6px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
  color: rgb(var(--v-theme-on-warning));
  font-size: 0.7rem;
  font-weight: 800;
}
/* The second level: under its topic, set in from it. */
.topic-subs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 6px 14px;
  padding-left: 8px;
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.16);
}
.topic-sub {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.86);
  text-align: left;
  cursor: pointer;
}
.topic-sub:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.topic-sub.on {
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgb(var(--v-theme-primary));
}
.topic-sub .name {
  font-size: 0.8rem;
  font-weight: 600;
}
.topic-sub .answer {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
/* The topic's head stays under the app's bar while its answers scroll: the card must not clip it. */
.topic-body {
  overflow: visible;
}
.topic-head {
  position: sticky;
  top: 64px;
  z-index: 2;
  margin: -20px -20px 4px;
  padding: 20px 20px 0;
  border-radius: 8px 8px 0 0;
  background: rgb(var(--v-theme-surface));
}
.topic-head :deep(.panel-title) {
  margin-bottom: 12px;
}
.topic-rail :deep(.v-list-item-subtitle) {
  white-space: normal;
}
</style>
