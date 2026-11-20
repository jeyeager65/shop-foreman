<script setup lang="ts">
/**
 * One compact strip for everything on a screen that needs a look. Collapsed, it
 * names each item; opened, it shows the detail. A single item is shown in full.
 */
import { mdiAlertCircleOutline, mdiChevronDown, mdiInformationOutline } from '@mdi/js';
import { computed, ref } from 'vue';

export interface Check {
  title: string;
  text: string;
  /** 'warning' needs attention; 'info' is worth knowing. */
  tone: 'warning' | 'info';
  link?: { to: string; label: string };
}

const props = defineProps<{ checks: Check[] }>();
const open = ref(false);
const warnings = computed(() => props.checks.filter((c) => c.tone === 'warning').length);
const tone = computed(() => (warnings.value > 0 ? 'warning' : 'info'));
const single = computed(() => props.checks.length === 1);
const heading = computed(() => {
  const n = props.checks.length;
  return warnings.value > 0 ? `${n} things to check` : `${n} things to know`;
});
</script>

<template>
  <div v-if="checks.length" class="strip" :class="tone">
    <component
      :is="single ? 'div' : 'button'"
      class="summary"
      :type="single ? undefined : 'button'"
      :aria-expanded="single ? undefined : open"
      @click="open = !open"
    >
      <v-icon :icon="tone === 'warning' ? mdiAlertCircleOutline : mdiInformationOutline" size="20" class="lead" />
      <template v-if="single">
        <span class="name">{{ checks[0]!.title }}</span>
        <span class="detail">
          {{ checks[0]!.text }}
          <router-link v-if="checks[0]!.link" :to="checks[0]!.link.to">{{ checks[0]!.link.label }}</router-link>
        </span>
      </template>
      <template v-else>
        <span class="name">{{ heading }}</span>
        <span class="detail names">{{ checks.map((c) => c.title).join(' · ') }}</span>
        <v-icon :icon="mdiChevronDown" size="20" class="chevron" :class="{ turned: open }" />
      </template>
    </component>
    <ul v-if="!single && open" class="list">
      <li v-for="check in checks" :key="check.title + check.text" :class="check.tone">
        <span class="name">{{ check.title }}</span>
        <span class="detail">
          {{ check.text }}
          <router-link v-if="check.link" :to="check.link.to">{{ check.link.label }}</router-link>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.strip {
  margin-bottom: 20px;
  border-radius: 8px;
  border: 1px solid rgba(var(--tone), 0.35);
  background: rgba(var(--tone), 0.1);
}
.strip.warning,
li.warning {
  --tone: var(--v-theme-warning);
}
.strip.info,
li.info {
  --tone: var(--v-theme-primary);
}
.summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  font: inherit;
}
button.summary {
  cursor: pointer;
}
.lead {
  align-self: center;
  flex: none;
  color: rgb(var(--tone));
}
.name {
  flex: none;
  font-weight: 600;
  color: rgb(var(--tone));
}
.detail {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.82);
}
.names {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron {
  align-self: center;
  flex: none;
  transition: transform 0.15s;
}
.chevron.turned {
  transform: rotate(180deg);
}
.list {
  margin: 0;
  padding: 2px 14px 10px 44px;
  list-style: none;
}
.list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.list .name {
  width: 190px;
}
/* A phone: what a check says goes under its name, the width of the strip. */
@media (max-width: 600px) {
  div.summary {
    flex-wrap: wrap;
  }
  div.summary .detail {
    flex: 1 1 100%;
  }
  .list {
    padding-left: 14px;
  }
  .list li {
    flex-direction: column;
    gap: 2px;
  }
  .list .name {
    width: auto;
  }
}
</style>
