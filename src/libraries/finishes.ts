import type { Finish, FinishKind } from '@/model';

/** Square feet a quart, as m² a litre: what a can's label says, as a coverage is stored. */
export const SQ_FT_A_QUART = 0.09290304 / 0.946352946;

/**
 * What a finish of each kind starts at (painted: one coat of primer and two of paint; stained: a coat of stain
 * and two or three of a clear finish), with the area a
 * quart covers in one coat. Tune me: the coverage is the usual figure on a can, not a maker's.
 */
export const FINISH_STARTS: Record<FinishKind, Pick<Finish, 'coats' | 'primerCoats' | 'clearCoats' | 'coverage'> & { name: string; color: string }> = {
  paint: { name: 'New paint', color: '#8899aa', coats: 2, primerCoats: 1, coverage: 100 * SQ_FT_A_QUART },
  stain: { name: 'New stain', color: '#7a5a3c', coats: 1, clearCoats: 3, coverage: 125 * SQ_FT_A_QUART },
  clear: { name: 'New clear coat', color: '', coats: 2, coverage: 125 * SQ_FT_A_QUART },
  primer: { name: 'New primer', color: '', coats: 1, coverage: 75 * SQ_FT_A_QUART },
};

/** A finish of a kind at its starting coats and coverage, the coverage marked "tune me". */
export function newFinish(kind: FinishKind, id: string, name?: string, color?: string): Finish {
  const { name: usual, color: usualColor, ...start } = FINISH_STARTS[kind];
  return { id, name: name ?? usual, kind, color: color ?? usualColor, ...start, tuneMe: ['coverage'] };
}

const paint = (id: string, name: string, color: string): Finish => newFinish('paint', id, name, color);
const stain = (id: string, name: string, color: string): Finish => newFinish('stain', id, name, color);

/**
 * Paints and stains to try a project in. The colours are for the picture: near enough
 * to choose between, not a maker's colour (tune me: change them, or add your own, in
 * the shop profile). After them, the clear coat that goes over a stain and on insides, and the
 * primer that goes under a paint.
 */
export const STARTER_FINISHES: Finish[] = [
  paint('paint-white', 'White paint', '#f2f1ec'),
  paint('paint-cream', 'Cream paint', '#e9e1cd'),
  paint('paint-light-grey', 'Light grey paint', '#c3c6c8'),
  paint('paint-charcoal', 'Charcoal paint', '#3c4146'),
  paint('paint-navy', 'Navy paint', '#27364e'),
  paint('paint-sage', 'Sage green paint', '#8a9a84'),
  paint('paint-black', 'Black paint', '#1d1e20'),
  stain('stain-golden-oak', 'Golden oak stain', '#b98342'),
  stain('stain-cherry', 'Cherry stain', '#8e4a2e'),
  stain('stain-walnut', 'Walnut stain', '#5e4130'),
  stain('stain-espresso', 'Espresso stain', '#33251e'),
  stain('stain-grey-wash', 'Grey wash stain', '#8f8a82'),
  newFinish('clear', 'clear-polyurethane', 'Polyurethane'),
  newFinish('primer', 'primer', 'Primer'),
];
