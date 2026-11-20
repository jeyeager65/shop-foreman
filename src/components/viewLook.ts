/**
 * How the 3D view draws what it shows (more looks than realistic and not, chosen in the card's
 * header). One choice for every 3D view in the app, kept in the browser; a link may set it (`&look=lines`, or the
 * older `&real=0|1`).
 */
import { computed, ref, watch } from 'vue';
import { baseId } from '@/design';
import { useAppStore } from '@/stores/app';
import { cutMethodLabel } from '@/ui/format';

export type ViewLook = 'realistic' | 'basic' | 'seeThrough' | 'lines' | 'material' | 'cut';

export const VIEW_LOOKS: { id: ViewLook; title: string; what: string }[] = [
  { id: 'realistic', title: 'Realistic', what: 'Lit, with shadows, wood and finishes' },
  { id: 'basic', title: 'Basic', what: 'Flat colours, every part outlined' },
  { id: 'seeThrough', title: 'See-through', what: 'What is inside shows through the parts' },
  { id: 'lines', title: 'Line drawing', what: 'White parts and dark edges, as on paper' },
  { id: 'material', title: 'By material', what: 'Each part in the colour of what it is cut from' },
  { id: 'cut', title: 'By how it is cut', what: 'Each part in the colour of where Plan sends it' },
];

const KEY = 'shop-foreman:viewLook';
const isLook = (id: unknown): id is ViewLook => VIEW_LOOKS.some((l) => l.id === id);

/** The look last chosen; realistic until another is. */
function remembered(): ViewLook {
  try {
    const kept = localStorage.getItem(KEY);
    return isLook(kept) ? kept : 'realistic';
  } catch {
    return 'realistic';
  }
}

/** The look every 3D view is drawn in. */
export const viewLook = ref<ViewLook>(remembered());
watch(viewLook, (look) => {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // Not kept, then.
  }
});

/** The look a link asks for: `look=basic|seethrough|lines|material|cut|realistic`, or `real=0` (basic) and `real=1`. */
export function lookFromQuery(query: Record<string, unknown>): ViewLook | undefined {
  const asked = typeof query.look === 'string' ? VIEW_LOOKS.find((l) => l.id.toLowerCase() === (query.look as string).toLowerCase())?.id : undefined;
  if (asked) return asked;
  return query.real === undefined ? undefined : query.real === '0' ? 'basic' : 'realistic';
}

/** What the looks that colour parts go by: each material's name, and where Plan sends each part of the job in hand. */
export function useViewLookData() {
  const store = useAppStore();
  const materialNames = computed(() => Object.fromEntries(store.materials.map((m) => [m.id, m.name])));
  const cutBy = computed(() => {
    const cut = store.project?.plan.cut ?? {};
    return Object.fromEntries((store.job.job?.plan.parts ?? []).map((p) => [p.partId, cut[baseId(p.partId)] ? 'Already cut' : cutMethodLabel(p.cutOut)]));
  });
  return { materialNames, cutBy };
}
