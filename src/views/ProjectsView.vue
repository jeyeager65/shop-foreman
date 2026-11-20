<script setup lang="ts">
import { mdiCubeOutline } from '@mdi/js';
import PanelTitle from '@/components/PanelTitle.vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { cabinetsOf, framesOf } from '@/design/settings';
import { existingMakesFronts } from '@/design/existing';
import StarterGrid from '@/components/StarterGrid.vue';
import type { Project } from '@/model';
import type { Starter } from '@/samples/starters';
import { useAppStore } from '@/stores/app';
import { PROJECT_FILE_EXTENSION } from '@/storage/projectFile';

const store = useAppStore();
const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const importError = ref('');
const machine = computed(() => store.shop.machines.find((m) => m.id === store.shop.activeMachineId));

function openProject(id: string) {
  store.open(id);
  void router.push('/design');
}
/** The project Delete was pressed on, until the question is answered. */
const deleting = ref<Project | null>(null);
function removeProject() {
  if (deleting.value) store.remove(deleting.value.id);
  deleting.value = null;
}
/**
 * New project: what is being made, then in what style, on a page of its own
 * (`#/new`). With no projects yet this page asks the first question itself.
 */
function pick(starter: Starter) {
  if (starter.to) return void router.push(starter.to);
  void router.push({ path: '/new', query: { starter: starter.id } });
}
/** What the project is, for its line in the list. */
function summary(p: Project): string {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const cabinets = cabinetsOf(p);
  // Tables are pieces of their own kind: named, after the cabinets.
  const tables = framesOf(p);
  const tableWords = tables.length ? (tables.length === 1 ? tables[0]!.name : `${tables.length} tables`) : '';
  if (!cabinets.length) return tableWords || 'Nothing in it yet';
  // Every cabinet already there: what is made for them says more than how they are built.
  if (cabinets.length && cabinets.every((c) => c.existing)) {
    const doors = cabinets.filter((c) => c.existing && existingMakesFronts(c.existing)).length;
    const fitted = cabinets.filter((c) => c.inside).length;
    const made = [doors ? `new fronts for ${doors}` : '', fitted ? `${fitted} fitted out` : ''].filter(Boolean).join(', ');
    return `${count(cabinets.length, 'cabinet')} already there${made ? `: ${made}` : ''}`;
  }
  const STYLE = { faceFrame: 'face frame', frameless: 'frameless', shop: 'inset' };
  const styles = [...new Set(cabinets.map((c) => STYLE[c.construction]))].join(' and ');
  // One cabinet is named by the project; several are listed, the first few by name.
  const names = cabinets.length > 1 ? `: ${cabinets.slice(0, 4).map((c) => c.name).join(', ')}${cabinets.length > 4 ? ', ...' : ''}` : '';
  return `${count(cabinets.length, 'cabinet')}, ${styles}${names}${tableWords ? `; ${tableWords}` : ''}`;
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    store.importText(await file.text());
    importError.value = '';
    void router.push('/design');
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  }
}
const day = (iso: string) => new Date(iso).toLocaleDateString();
</script>

<template>
  <h1 class="text-h4 mb-6">Projects</h1>
  <v-row>
    <v-col cols="12" md="8">
      <div class="d-flex flex-wrap ga-3 mb-4">
        <v-btn color="primary" variant="flat" data-test="new-project" to="/new">New project</v-btn>
        <v-btn variant="outlined" @click="fileInput?.click()">Import a project file</v-btn>
        <v-btn variant="text" to="/jigs" data-test="jigs">Jigs and handles</v-btn>
        <v-btn variant="text" to="/samples" data-test="samples">Samples</v-btn>
        <input ref="fileInput" type="file" :accept="`${PROJECT_FILE_EXTENSION},.json`" hidden @change="importFile" />
      </div>
      <v-alert v-if="importError" type="error" variant="tonal" class="mb-4" closable @click:close="importError = ''">
        {{ importError }}
      </v-alert>
      <!-- With no projects yet, the page is the first question of a new one. -->
      <template v-if="store.projects.length === 0">
        <div class="text-h6 mb-1" data-test="no-projects">No projects yet. What are you making?</div>
        <div class="text-body-2 text-medium-emphasis mb-4">Pick the thing; its style is asked next, then Setup asks what its parts share.</div>
        <StarterGrid @pick="pick" />
      </template>
      <v-card v-for="p in store.unreadable" :key="p.id" class="pa-4 mb-3 d-flex align-center ga-3" data-test="unreadable-project">
        <div class="flex-grow-1">
          <div class="text-h6">{{ p.name }}</div>
          <div class="text-body-2 text-warning">{{ p.problem }}</div>
        </div>
        <v-btn variant="text" color="error" @click="store.remove(p.id)">Delete</v-btn>
      </v-card>
      <v-card v-for="p in store.projects" :key="p.id" class="pa-4 mb-3 d-flex flex-wrap align-center ga-3" :data-test="`project-${p.id}`">
        <!-- A small picture of its 3D view, once it has been looked at in 3D (Setup or Design). -->
        <img v-if="store.thumbnails[p.id]" :src="store.thumbnails[p.id]" alt="" class="thumb" :data-test="`thumb-${p.id}`" />
        <div v-else class="thumb empty" title="No picture yet: it is taken when the project is opened in Setup or Design"><v-icon :icon="mdiCubeOutline" size="28" /></div>
        <div class="words">
          <div class="text-h6 d-flex align-center flex-wrap ga-2">
            {{ p.name }}
            <!-- The project that is open is the one the steps in the header work on: it is marked. -->
            <v-chip v-if="p.id === store.currentId" size="small" color="primary" variant="tonal" data-test="current-project">Current</v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis">{{ summary(p) }} · changed {{ day(p.updatedAt) }}</div>
        </div>
        <!-- What is done with it: beside its words on a wide screen, on a line of their own under them on a phone. The project that is open is the one the steps in the header work on: it is exported from here. -->
        <div class="actions d-flex align-center ga-2">
        <v-btn v-if="p.id === store.currentId" variant="text" size="small" title="Save it as a file, to keep or to open on another computer" data-test="export-project" @click="store.exportCurrent()">Export</v-btn>
        <v-btn :variant="p.id === store.currentId ? 'flat' : 'tonal'" :color="p.id === store.currentId ? 'primary' : undefined" @click="openProject(p.id)">
          {{ p.id === store.currentId ? 'Continue' : 'Open' }}
        </v-btn>
        <v-spacer class="d-sm-none" />
        <v-btn variant="text" color="error" size="small" class="ml-sm-4" :data-test="`delete-${p.id}`" @click="deleting = p">Delete</v-btn>
        </div>
      </v-card>
    </v-col>
    <v-dialog :model-value="!!deleting" max-width="460" @update:model-value="deleting = null">
      <v-card v-if="deleting" class="pa-5" data-test="confirm-delete">
        <div class="text-h6 mb-1">Delete "{{ deleting.name }}"?</div>
        <div class="text-body-2 text-medium-emphasis mb-4">
          The project is removed from this browser and cannot be brought back. Export it first to keep a copy as a file.
        </div>
        <div class="d-flex justify-end ga-2">
          <v-btn variant="text" @click="deleting = null">Keep it</v-btn>
          <v-btn color="error" variant="flat" data-test="confirm-delete-yes" @click="removeProject()">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>
    <v-col cols="12" md="4">
      <v-card class="pa-5">
        <PanelTitle icon="shop">Shop profile</PanelTitle>
        <div v-if="machine" class="mb-2">{{ machine.name }} · router switched by hand</div>
        <div class="text-body-2 text-medium-emphasis mb-1">{{ store.shop.tools.length }} bits: {{ store.shop.tools.map((t) => t.name).join(', ') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-1">Material catalog: {{ [...new Set(store.shop.materialCatalog.map((m) => m.name))].join(', ') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ store.shop.hardware.filter((h) => h.kind === 'hinge').length }} hinges, {{ store.shop.hardware.filter((h) => h.kind === 'slide').length }} drawer slides, {{ store.shop.hardware.filter((h) => h.kind === 'shelfPin').length }} shelf pins</div>
        <v-btn to="/shop" variant="tonal">Open shop profile</v-btn>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
.thumb {
  flex: none;
  width: 112px;
  height: 70px;
  border-radius: 6px;
  /* The whole picture, whatever the shape of the view it was taken from. */
  object-fit: contain;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
/* The name and what it is: all the room the picture leaves, and never squeezed by the buttons. */
.words {
  flex: 1 1 200px;
  min-width: 0;
}
.actions {
  flex: none;
}
@media (max-width: 599px) {
  .thumb {
    width: 84px;
    height: 56px;
  }
  .words {
    flex-basis: 120px;
  }
  .actions {
    flex: 1 1 100%;
  }
}
.thumb.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.3);
}
</style>
