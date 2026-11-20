/**
 * The marks on Setup's fields that differ from the preset. Setup puts the differences
 * here (`presetDiffs`); a field's column takes `:class="mark(marks, 'toeKick.height')"`, where `marks` is the
 * path its component's values are under (`settings`, `fronts.doors`), a prop only Setup gives. Without it, as in
 * Design, nothing is marked. The dot is drawn by `.differs-from-preset` in `src/styles/preset-marks.css`.
 */
import { shallowRef } from 'vue';
import { differsAt } from '@/design/presetDiff';

/** The paths that differ, set by Setup while it is open. */
export const presetMarks = shallowRef<string[]>([]);

/** The class of a field whose value at `base.key` (or any of `keys`) is not the preset's. */
export function mark(base: string | undefined, ...keys: string[]): string | undefined {
  if (!base || !presetMarks.value.length) return undefined;
  return keys.some((key) => differsAt(presetMarks.value, key ? `${base}.${key}` : base)) ? 'differs-from-preset' : undefined;
}
