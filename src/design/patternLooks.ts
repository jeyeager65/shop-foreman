/**
 * A pattern's looks, shown as a grid of tiles in place of a kind and then a layout: every look a front's pattern can
 * be chosen as, each a kind of pattern with a layout or a switch already set. A look is not stored: `lookOf` reads it from the pattern and `withLook` makes the pattern.
 */
import type { FrontPattern, Mm } from '@/model';
import { flutesFor, starterPattern } from './pattern';

type Grooves = Extract<FrontPattern, { kind: 'grooves' }>;
type Flutes = Extract<FrontPattern, { kind: 'flutes' }>;

export type PatternLook = 'none' | `grooves-${Grooves['layout']}` | 'flutes' | 'reeds' | 'wavyFlutes' | 'dimples' | 'channels' | 'ripples' | 'frame';

export const PATTERN_LOOKS: { value: PatternLook; title: string; note: string }[] = [
  { value: 'none', title: 'None', note: 'A plain face' },
  { value: 'grooves-vertical', title: 'Planks', note: 'V-grooves, upright' },
  { value: 'grooves-horizontal', title: 'Planks, level', note: 'V-grooves' },
  { value: 'grooves-diagonal', title: 'Diagonal', note: 'V-grooves' },
  { value: 'grooves-grid', title: 'Grid', note: 'V-grooves' },
  { value: 'grooves-diamond', title: 'Diamonds', note: 'V-grooves' },
  { value: 'grooves-chevron', title: 'Chevrons', note: 'V-grooves' },
  { value: 'grooves-sunburst', title: 'Sunburst', note: 'V-grooves, from the bottom' },
  { value: 'grooves-rectangles', title: 'Rectangles', note: 'V-grooves, one inside another' },
  { value: 'grooves-waves', title: 'Waves', note: 'V-grooves, upright' },
  { value: 'flutes', title: 'Flutes', note: 'A ball nose' },
  { value: 'reeds', title: 'Reeds', note: 'Flutes that overlap' },
  { value: 'wavyFlutes', title: 'Wavy flutes', note: 'A ball nose' },
  { value: 'dimples', title: 'Dimples', note: 'A ball nose' },
  { value: 'channels', title: 'Channels', note: 'An end mill or a bull nose' },
  { value: 'ripples', title: 'Ripples', note: 'Lines that rise and fall' },
  { value: 'frame', title: 'Frame look', note: 'V-grooves, on a slab' },
];

/** The look a pattern is. */
export function lookOf(pattern: FrontPattern | undefined): PatternLook {
  if (!pattern) return 'none';
  if (pattern.kind === 'grooves') return `grooves-${pattern.layout}`;
  if (pattern.kind === 'flutes') return pattern.reeded ? 'reeds' : pattern.wavy && pattern.direction === 'vertical' ? 'wavyFlutes' : 'flutes';
  return pattern.kind;
}

/**
 * The pattern of a look. A pattern of the same kind keeps its own sizes (grooves keep their spacing and depth and
 * take the layout); another kind starts as `starterPattern` makes it. `ball`: the ball nose flutes and dimples
 * start sized for. Nothing for `none`.
 */
export function withLook(pattern: FrontPattern | undefined, look: PatternLook, ball?: Mm): FrontPattern | undefined {
  if (look === 'none') return undefined;
  if (look.startsWith('grooves-')) {
    const layout = look.slice('grooves-'.length) as Grooves['layout'];
    const from = pattern?.kind === 'grooves' ? pattern : (starterPattern('grooves', ball) as Grooves);
    return { ...from, layout };
  }
  if (look === 'flutes' || look === 'reeds' || look === 'wavyFlutes') {
    const from = pattern?.kind === 'flutes' ? pattern : (starterPattern('flutes', ball) as Flutes);
    const { reeded: _reeded, wavy: _wavy, ...plain } = from;
    // Reeded or not, the spacing goes to what suits: they overlap, or stand apart.
    if (look === 'reeds') return flutesFor(plain.width.mm, { ...plain, reeded: true });
    const apart = from.reeded ? flutesFor(plain.width.mm, plain) : plain;
    return look === 'wavyFlutes' ? { ...apart, direction: 'vertical', wavy: true } : apart;
  }
  const kind = look as 'dimples' | 'channels' | 'ripples' | 'frame';
  return pattern?.kind === kind ? pattern : starterPattern(kind, ball);
}
