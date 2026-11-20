/**
 * The Samples page's list (`samplePages.json`) and its search: the groups that are shown, and the samples of a
 * group that have every word asked for. The starters link to their examples through it.
 */
import pages from './samplePages.json';

export interface Sample { id: string; under?: string; title: string; what: string; href: string }
export interface SampleGroup { id: string; title: string; words: string; hidden?: boolean; samples: Sample[] }

/** The groups the page shows: Screens and the starters' pictures are for building the app. */
export const sampleGroups = (): SampleGroup[] => (pages as SampleGroup[]).filter((g) => !g.hidden);

/** What is typed, as the words to look for. */
export const searchWords = (search: string): string[] => search.toLowerCase().split(/\s+/).filter(Boolean);

/** The samples of a group that have every word, in its title, what it says or its sub-heading. */
export const matching = (group: SampleGroup, words: string[]): Sample[] =>
  group.samples.filter((s) => words.every((w) => `${s.title} ${s.what} ${s.under ?? ''}`.toLowerCase().includes(w)));
