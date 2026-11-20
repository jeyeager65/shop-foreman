/**
 * The topics of a three-pane page (`TopicShell.vue`; lifted out of Setup): which
 * topic is in hand, its second level, Back and Next, and the address that keeps them (`?topic=fronts&sub=pattern`).
 */
import { computed, reactive, ref, watch } from 'vue';
import { type LocationQuery, useRoute, useRouter } from 'vue-router';

/** One of a topic's second level: listed under it while it is the topic in hand. */
export interface SubTopic {
  id: string;
  title: string;
  /** Its answer, in a line. */
  summary: string;
  /** What it is about, under the head. */
  words: string;
  /** How many of its values are marked (on Setup: differ from the preset). */
  dot?: number;
}

export interface Topic extends SubTopic {
  /** The heading it is listed under: said once, over the first topic of each group. */
  group?: string;
  /** How many things here need a look: a badge. */
  warn?: number;
  /** Finished: a tick (a blank whose steps are all ticked, on Cut). */
  done?: boolean;
  subs?: SubTopic[];
}

/** A stop of Back and Next: a topic, or one of its second level. */
export interface TopicStop {
  topic: string;
  sub?: string;
  title: string;
}

export interface TopicOptions {
  /** The topic to open when the address names none. */
  first?: string;
  /**
   * The topic an address without `topic=` names in the page's older way (the Shop profile's `tab=`): read when the
   * page opens and whenever the address changes.
   */
  from?: (query: LocationQuery) => string | undefined;
  /** Of its second level, the one to open when the address names none. */
  firstSub?: string;
  /**
   * The parts of the address that are the page's own, kept when a topic is opened; `all` keeps everything but
   * the topic's own and the old ways of naming one (`fold`, `more`): Design, whose address has the cabinet and the view.
   */
  keep?: string[] | 'all';
}

export function useTopics(topics: () => Topic[], options: TopicOptions = {}) {
  const route = useRoute();
  const router = useRouter();
  const list = computed(topics);
  const asked = () => route.query.topic ?? options.from?.(route.query);
  const topic = ref(String(asked() ?? options.first ?? ''));
  const sub = ref(String(route.query.sub ?? options.firstSub ?? ''));
  /** The topic in hand: the first one when the one asked for is not a topic of this page as it stands. */
  const current = computed(() => list.value.find((t) => t.id === topic.value) ?? list.value[0]!);
  /** The second level of the topic in hand. */
  const subs = computed(() => current.value?.subs ?? []);
  const currentSub = computed((): SubTopic | undefined => subs.value.find((x) => x.id === sub.value) ?? subs.value[0]);

  /** Opens a topic (and one of its second level), and keeps it in the address so the page comes back to it. */
  function open(id: unknown, subId?: string) {
    const found = list.value.find((t) => t.id === id);
    if (!found) return;
    topic.value = found.id;
    if (subId) sub.value = subId;
    const own = ['topic', 'sub', 'fold', 'more', 'tab'];
    const names = options.keep === 'all' ? Object.keys(route.query).filter((k) => !own.includes(k)) : (options.keep ?? []);
    const kept = Object.fromEntries(names.filter((k) => route.query[k] !== undefined).map((k) => [k, route.query[k]]));
    const subNow = found.subs?.length ? (found.subs.find((x) => x.id === sub.value) ?? found.subs[0]!).id : undefined;
    void router.replace({ query: { ...kept, topic: found.id, ...(subNow ? { sub: subNow } : {}) } });
  }
  // A link to another topic while the page is open (`#/setup?topic=stock`) opens it.
  watch(
    () => [asked(), route.query.sub],
    ([id, subId]) => {
      if (list.value.some((t) => t.id === id)) topic.value = String(id);
      if (typeof subId === 'string' && subId) sub.value = subId;
    },
  );

  /** Back and Next walk every topic, and each of a topic's second level. */
  const stops = computed(() =>
    list.value.flatMap((t): TopicStop[] => (t.subs?.length ? t.subs.map((x) => ({ topic: t.id, sub: x.id, title: `${t.title}: ${x.title}` })) : [{ topic: t.id, title: t.title }])),
  );
  const at = computed(() => stops.value.findIndex((x) => x.topic === current.value?.id && (!x.sub || x.sub === currentSub.value?.id)));
  const before = computed(() => stops.value[at.value - 1]);
  const after = computed(() => stops.value[at.value + 1]);

  return reactive({ topics: list, current, subs, currentSub, before, after, open });
}

export type TopicNav = ReturnType<typeof useTopics>;
