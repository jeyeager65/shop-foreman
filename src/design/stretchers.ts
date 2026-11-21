/**
 * How deep a base case's two top stretchers are, front to back, where they lie flat: the case's (`case.ts`) and what a
 * sink's bowl must hang between (`sinks.ts`).
 */
import type { CabinetDesign, Mm } from '@/model';
import { MM_PER_INCH } from '@/units';

/** Front-to-back width of the two top stretchers. Tune me. */
export const STRETCHER_WIDTH: Mm = 4 * MM_PER_INCH;
/** The same over a sink whose bowl hangs between them: narrower, still enough to screw a top to. Tune me. */
export const SINK_STRETCHER_WIDTH: Mm = 2.5 * MM_PER_INCH;

/**
 * How deep a cabinet's top stretchers are where they lie flat, as its joinery says (or the defaults): narrower under a
 * sink whose bowl hangs under the top (not a vessel).
 */
export function topStretcherWidth(cabinet: Pick<CabinetDesign, 'sink' | 'form' | 'joinery'>): Mm {
  const own = cabinet.joinery.stretchers;
  const sink = cabinet.form === 'base' && cabinet.sink && cabinet.sink.mount !== 'vessel';
  return sink ? (own?.underSink?.mm ?? SINK_STRETCHER_WIDTH) : (own?.width?.mm ?? STRETCHER_WIDTH);
}
