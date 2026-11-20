<script setup lang="ts">
import { mdiChevronRight, mdiClipboardListOutline, mdiDotsVertical, mdiFolderOutline, mdiHammerScrewdriver, mdiPencilOutline, mdiPencilRulerOutline, mdiPrinter3dNozzleOutline, mdiRobotIndustrialOutline, mdiToolboxOutline, mdiTuneVariant } from '@mdi/js';
import { useRoute } from 'vue-router';
import { useAppStore } from './stores/app';
import { versionWords } from '@/version';

const store = useAppStore();
const route = useRoute();
const blur = (event: Event) => (event.target as HTMLElement).blur();
/** The app's icon, from `public/`: the same file the browser tab shows. */
const logo = `${import.meta.env.BASE_URL}favicon.svg`;

/**
 * The bar reads left to right: app, project, step. The steps can be visited in any order. On a phone
 * they are a bar along the bottom, each an icon and its name, and the top bar keeps
 * the project's name and a menu for the rest.
 */
const steps = [
  { key: 'setup', to: '/setup', title: 'Setup', icon: mdiTuneVariant },
  { key: 'design', to: '/design', title: 'Design', icon: mdiPencilRulerOutline },
  { key: 'plan', to: '/plan', title: 'Plan', icon: mdiClipboardListOutline },
  { key: 'cut', to: '/cut', title: 'Cut', icon: mdiRobotIndustrialOutline },
  { key: 'build', to: '/build', title: 'Build', icon: mdiHammerScrewdriver },
] as const;
/** What is beside the steps: on a phone, the top bar's menu. */
const places = [
  { to: '/', title: 'Projects', icon: mdiFolderOutline },
  { to: '/jigs', title: 'Jigs and handles', icon: mdiPrinter3dNozzleOutline },
  { to: '/shop', title: 'Shop profile', icon: mdiToolboxOutline },
];
const isCurrent = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
</script>

<template>
  <v-app>
    <v-app-bar flat border="b" color="background" height="64">
      <div class="bar">
        <div class="left">
          <router-link to="/" class="app-name" title="Shop Foreman: projects"><img :src="logo" alt="Shop Foreman" class="app-logo" /><span class="wordmark">Shop Foreman</span></router-link>
          <router-link to="/" class="crumb" :class="{ current: route.path === '/' }" title="Projects">
            <v-icon :icon="mdiFolderOutline" size="18" />
            <span>Projects</span>
          </router-link>
          <template v-if="store.project">
            <v-icon :icon="mdiChevronRight" size="18" class="separator" />
            <!-- The open project is the context for the steps to its right. -->
            <label class="name">
              <input
                v-model="store.project.name"
                :title="store.project.name"
                :style="{ width: `calc(${Math.max(6, store.project.name.length) * 0.88}ch + 10px)` }"
                aria-label="Project name"
                spellcheck="false"
                @keydown.enter="blur"
              />
              <v-icon :icon="mdiPencilOutline" size="16" class="pencil" />
            </label>
          </template>
        </div>

        <nav class="steps" aria-label="Workflow">
          <template v-for="(step, i) in steps" :key="step.to">
            <span v-if="i > 0" class="line" />
            <component
              :is="store.project ? 'router-link' : 'span'"
              :to="store.project ? step.to : undefined"
              class="step"
              :class="{ current: isCurrent(step.to), disabled: !store.project }"
              :aria-current="isCurrent(step.to) ? 'step' : undefined"
            >
              <span class="number">
                {{ i + 1 }}
                <!-- Something on this step wants a look: a dot, with what it is on hover. -->
                <span v-if="store.stepWarnings[step.key]" class="dot" role="img" :title="store.stepWarnings[step.key]" :aria-label="`${step.title} has something to check`" :data-test="`step-dot-${step.key}`" />
              </span>
              <span class="label">{{ step.title }}</span>
            </component>
          </template>
        </nav>

        <div class="right">
          <router-link to="/jigs" class="crumb" :class="{ current: route.path === '/jigs' }" title="Jigs and handles, to print or cut with no project" data-test="header-jigs">
            <v-icon :icon="mdiPrinter3dNozzleOutline" size="18" />
            <span>Jigs</span>
          </router-link>
          <router-link to="/shop" class="crumb" :class="{ current: route.path === '/shop' }" title="Shop profile">
            <v-icon :icon="mdiToolboxOutline" size="18" />
            <span>Shop profile</span>
          </router-link>
          <!-- On a phone: Projects, Jigs and the Shop profile in a menu. -->
          <v-menu location="bottom end">
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" :icon="mdiDotsVertical" variant="text" size="small" class="more" aria-label="Projects, jigs and the shop profile" data-test="header-menu" />
            </template>
            <v-list density="comfortable">
              <v-list-item v-for="p in places" :key="p.to" :to="p.to" :prepend-icon="p.icon" :title="p.title" />
            </v-list>
          </v-menu>
        </div>
      </div>
    </v-app-bar>

    <v-main>
      <v-container fluid class="page">
        <v-alert v-if="store.storageError" type="error" variant="tonal" class="mb-4">{{ store.storageError }}</v-alert>
        <v-alert v-if="store.shopReset" type="warning" variant="tonal" class="mb-4" closable data-test="shop-reset" @click:close="store.shopReset = ''">{{ store.shopReset }}</v-alert>
        <router-view v-if="store.ready" />
        <div class="app-version text-caption text-medium-emphasis" data-test="app-version">Shop Foreman {{ versionWords() }} · early and experimental: not ready for use</div>
      </v-container>
    </v-main>

    <!-- A phone's steps: along the bottom, each an icon and its name. -->
    <nav v-if="store.project" class="bottom-steps" aria-label="Workflow" data-test="bottom-steps">
      <router-link v-for="step in steps" :key="step.to" :to="step.to" class="bottom-step" :class="{ current: isCurrent(step.to) }" :aria-current="isCurrent(step.to) ? 'step' : undefined">
        <span class="bottom-icon">
          <v-icon :icon="step.icon" size="22" />
          <span v-if="store.stepWarnings[step.key]" class="dot" role="img" :title="store.stepWarnings[step.key]" :aria-label="`${step.title} has something to check`" />
        </span>
        <span>{{ step.title }}</span>
      </router-link>
    </nav>
  </v-app>
</template>

<style scoped>
.app-version {
  margin-top: 32px;
  text-align: center;
}
.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 0 20px;
}
.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 0;
  min-width: 0;
}
/* The steps sit right of the project, not centred: the project's name gets the room. */
.right {
  justify-content: flex-end;
  flex: 0 0 auto;
}
a {
  color: inherit;
  text-decoration: none;
}
.app-name {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 12px;
  font-size: 1.15rem;
  font-weight: 700;
  white-space: nowrap;
}
.app-logo {
  width: 28px;
  height: 28px;
}
.crumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-weight: 500;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-background), 0.75);
}
.crumb:hover {
  background: rgba(var(--v-theme-on-background), 0.08);
  color: rgb(var(--v-theme-on-background));
}
.crumb.current {
  color: rgb(var(--v-theme-primary));
}
.separator {
  flex: none;
  opacity: 0.5;
}
.name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: text;
}
.name:hover {
  border-color: rgba(var(--v-theme-on-background), 0.2);
}
.name:focus-within {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}
.name input {
  min-width: 0;
  max-width: 100%;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 700;
  color: inherit;
  background: none;
  border: 0;
  outline: 0;
  text-overflow: ellipsis;
}
.pencil {
  flex: none;
  opacity: 0.35;
}
.name:hover .pencil,
.name:focus-within .pencil {
  opacity: 0.8;
}

.steps {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.line {
  width: 24px;
  height: 2px;
  border-radius: 1px;
  background: rgba(var(--v-theme-on-background), 0.22);
}
.step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 6px;
  border-radius: 999px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-background), 0.8);
}
a.step:hover {
  background: rgba(var(--v-theme-on-background), 0.08);
}
.number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 0.8rem;
  font-weight: 700;
  border: 1.5px solid rgba(var(--v-theme-on-background), 0.45);
  position: relative;
}
/* Something to look at on that step. */
.dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
  border: 2px solid rgb(var(--v-theme-background));
}
/* The current step: filled number, accent label and pill. */
.step.current {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.14);
}
.step.current .number {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.step.disabled {
  opacity: 0.4;
}

.more,
.bottom-steps {
  display: none;
}
.page {
  padding: 24px;
}

/*
 * A laptop, half a wide screen (from about 900 px): the wordmark gives way to the icon, Projects, Jigs
 * and the Shop profile to their icons, the project's name is cut short with dots; the steps keep
 * their names.
 */
@media (max-width: 1320px) {
  .wordmark,
  .crumb span {
    display: none;
  }
  .app-name {
    margin-right: 4px;
  }
  .bar {
    gap: 10px;
    padding: 0 14px;
  }
  .steps {
    gap: 6px;
  }
  .line {
    width: 14px;
  }
}
@media (max-width: 1100px) {
  .line {
    width: 8px;
  }
  .steps {
    gap: 2px;
  }
  .step {
    padding-right: 9px;
    gap: 6px;
  }
  .bar {
    gap: 6px;
  }
  .crumb {
    padding: 6px;
  }
}
/* Narrower than a laptop: the steps keep their numbers, and only the current one its name. */
@media (max-width: 820px) {
  .step:not(.current) .label {
    display: none;
  }
  .step:not(.current) {
    padding-right: 6px;
  }
}
/* A phone: the steps are a bar along the bottom; the top bar keeps the project's name and a menu. */
@media (max-width: 600px) {
  .steps,
  .crumb,
  .separator {
    display: none;
  }
  .more {
    display: inline-flex;
  }
  .bar {
    padding: 0 8px 0 12px;
  }
  .page {
    padding: 16px 16px 84px;
  }
  .bottom-steps {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1005;
    display: flex;
    background: rgb(var(--v-theme-background));
    border-top: 1px solid rgba(var(--v-theme-on-background), 0.14);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bottom-step {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 0 7px;
    font-size: 0.72rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-background), 0.7);
  }
  .bottom-step.current {
    color: rgb(var(--v-theme-primary));
  }
  .bottom-icon {
    position: relative;
    display: inline-flex;
    padding: 2px 14px;
    border-radius: 999px;
  }
  .bottom-step.current .bottom-icon {
    background: rgba(var(--v-theme-primary), 0.16);
  }
  .bottom-icon .dot {
    top: -1px;
    right: 8px;
  }
}
</style>

<style>
/* A field of Setup whose value is not the preset's (`presetMarks.ts`): a dot at its corner. */
.differs-from-preset {
  position: relative;
}
.differs-from-preset::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
  pointer-events: none;
}

/*
 * A phone, on every screen: never more than two fields in a row. A third of a row
 * becomes a half, and two thirds (a name beside a number) the whole row.
 */
@media (max-width: 600px) {
  .v-row > .v-col--cols-4,
  .v-row > .v-col--cols-3 {
    flex: 0 0 calc(50% - var(--v-col-gap-x, 8px) / 2) !important;
  }
  .v-row > .v-col--cols-8,
  .v-row > .v-col--cols-5,
  .v-row > .v-col--cols-7 {
    flex: 0 0 100% !important;
  }
  /* A card's padding gives its room back to what is in it. */
  .v-card.pa-5 {
    padding: 14px !important;
  }
  /*
   * A table with `phone-cards` (the lists of Cut and Build, the Shop profile's): a row is a card, each
   * cell on a line of its own with what it is before it (`data-label`), as Plan's tables are.
   */
  .phone-cards thead {
    display: none;
  }
  .phone-cards tbody tr {
    display: block;
    padding: 8px 0;
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }
  .phone-cards tbody td {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: auto !important;
    height: auto !important;
    padding: 1px 0 !important;
    border: 0 !important;
    text-align: left !important;
    white-space: normal !important;
  }
  .phone-cards tbody td.lead {
    font-weight: 600;
  }
  .phone-cards tbody td:empty {
    display: none;
  }
  .phone-cards tbody td[data-label]::before {
    content: attr(data-label);
    flex: 0 0 5.6rem;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  /* A row of a file or a list's buttons (`phone-wrap`): its first thing has a line to itself. */
  .phone-wrap {
    flex-wrap: wrap;
  }
  .phone-wrap > :first-child {
    flex: 1 1 100%;
    overflow-wrap: anywhere;
  }
  .phone-wrap > .ml-3 {
    margin-left: 0 !important;
  }
}
</style>
