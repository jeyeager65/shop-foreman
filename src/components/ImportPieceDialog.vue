<script setup lang="ts">
/**
 * "From another project": pick one of the other projects, then one of its pieces, and how it
 * comes: in this project's style, or as it was. The piece is copied in (`importPiece`); nothing links the two
 * projects afterwards.
 */
import { mdiCubeOutline } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { type ImportHow, importPiece, importablePieces } from '@/samples/importPiece';
import { useAppStore } from '@/stores/app';

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ added: [id: string] }>();
const store = useAppStore();
const L = computed(() => store.sizeLength);

/** The other projects that have a piece to give. */
const others = computed(() => store.projects.filter((p) => p.id !== store.currentId && importablePieces(p).length > 0));
const fromId = ref<string | null>(null);
const pieceId = ref<string | null>(null);
const how = ref<ImportHow>('style');
const problem = ref('');
const from = computed(() => others.value.find((p) => p.id === fromId.value));
const pieces = computed(() => (from.value ? importablePieces(from.value) : []));
// Opened afresh each time; a project with one piece has it chosen.
watch(open, (now) => {
  if (!now) return;
  fromId.value = others.value.length === 1 ? others.value[0]!.id : null;
  pieceId.value = null;
  problem.value = '';
});
watch(pieces, (list) => (pieceId.value = list.length === 1 ? list[0]!.id : null));

function add() {
  if (!store.project || !from.value || !pieceId.value) return;
  try {
    const { id } = importPiece(store.project, from.value, pieceId.value, how.value);
    open.value = false;
    emit('added', id);
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="620">
    <v-card class="pa-5" data-test="import-piece">
      <div class="text-h6 mb-1">A piece from another project</div>
      <div class="text-body-2 text-medium-emphasis mb-3">A copy is added to this project. Nothing links the two afterwards: changing one changes nothing in the other.</div>
      <div v-if="!others.length" class="text-body-2" data-test="import-none">There is no other project with a piece in it yet.</div>
      <template v-else>
        <div class="text-caption text-medium-emphasis mb-1">From</div>
        <v-list density="compact" class="pa-0 mb-3 choices" :selected="fromId ? [fromId] : []" @update:selected="fromId = ($event as string[]).at(-1) ?? fromId">
          <v-list-item v-for="p in others" :key="p.id" :value="p.id" :title="p.name" :subtitle="`${importablePieces(p).length} ${importablePieces(p).length === 1 ? 'piece' : 'pieces'}`" :data-test="`import-from-${p.id}`">
            <template #prepend>
              <img v-if="store.thumbnails[p.id]" :src="store.thumbnails[p.id]" alt="" class="thumb" />
              <div v-else class="thumb empty"><v-icon :icon="mdiCubeOutline" size="20" /></div>
            </template>
          </v-list-item>
        </v-list>
        <template v-if="from">
          <div class="text-caption text-medium-emphasis mb-1">The piece</div>
          <v-list density="compact" class="pa-0 mb-3 choices" :selected="pieceId ? [pieceId] : []" @update:selected="pieceId = ($event as string[]).at(-1) ?? pieceId">
            <v-list-item
              v-for="p in pieces"
              :key="p.id"
              :value="p.id"
              :title="p.name"
              :subtitle="`${p.kind === 'frame' ? 'A table' : 'A case'}, ${L(p.size.width.mm)} × ${L(p.size.height.mm)} × ${L(p.size.depth.mm)}`"
              :data-test="`import-piece-${p.id}`"
            />
          </v-list>
          <v-radio-group v-model="how" density="compact" hide-details class="mb-2" data-test="import-how">
            <v-radio value="style" label="In this project's style: only its shape comes across (its size, its rows and bays, what stands inside it)" />
            <v-radio value="asWas" label="As it was: what it was made of and how it was built come with it, as its own differences" />
          </v-radio-group>
          <div class="text-caption text-medium-emphasis">A cabinet comes with its doors and drawers. It stands on its own here: its run and its place in a room were the other project's.</div>
        </template>
      </template>
      <v-alert v-if="problem" type="warning" variant="tonal" density="compact" class="mt-3">{{ problem }}</v-alert>
      <div class="d-flex justify-end ga-2 mt-4">
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!from || !pieceId" data-test="import-add" @click="add">Add it</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.choices {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 6px;
}
.thumb {
  flex: none;
  width: 56px;
  height: 36px;
  margin-right: 12px;
  border-radius: 4px;
  object-fit: contain;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.thumb.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.3);
}
</style>
