/**
 * Paper templates: the notch of a tray or a shelf drawn at its real size, to print,
 * cut out with scissors and hold against the plumbing before any plywood is cut. One page that stands on
 * its own, black on white. A template wider or taller than a sheet is printed in tiles that are taped
 * together on their dashed edges.
 */
import type { PaperTemplate } from '@/design';
import type { Mm } from '@/model';

export const templatesFileName = (slug: string) => `${slug}-templates.html`;

/** What of a sheet is drawn on, in mm: it fits Letter and A4 with the printer's own margins. */
export const TILE = { width: 180, height: 240 };

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (value: number) => String(Number(value.toFixed(2)));

/** How many tiles a template takes, across and down. */
export const tilesOf = (template: Pick<PaperTemplate, 'width' | 'height'>) => ({ across: Math.max(1, Math.ceil(template.width / TILE.width - 1e-6)), down: Math.max(1, Math.ceil(template.height / TILE.height - 1e-6)) });

/** The templates as a page to print at 100%. `length` writes a size in the shop's unit. */
export function templatesHtml(title: string, templates: PaperTemplate[], length: (mm: Mm) => string): string {
  const pages: string[] = [];
  for (const t of templates) {
    const { across, down } = tilesOf(t);
    const points = t.outline.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
    for (let row = 0; row < down; row++) {
      for (let col = 0; col < across; col++) {
        const [x, y] = [col * TILE.width, row * TILE.height];
        const tile = across * down > 1 ? `Sheet ${row * across + col + 1} of ${across * down} (row ${row + 1}, column ${col + 1}): tape the sheets together on the dashed lines.` : '';
        pages.push(
          [
            '<section>',
            `<h1>${esc(t.name)}</h1>`,
            `<p>${esc(t.words)} ${esc(tile)}</p>`,
            `<p class="dim">Print at 100% ("actual size"), not "fit to page": the bar must measure ${esc(length(100))} (100 mm). The grey is the board; the white notch is cut away. The top edge is the back of the cabinet.</p>`,
            `<svg width="${TILE.width}mm" height="${TILE.height}mm" viewBox="${x} ${y} ${TILE.width} ${TILE.height}">`,
            `<polygon points="${points}" fill="#ddd" stroke="#000" stroke-width="0.4"/>`,
            `<rect x="${x}" y="${y}" width="${TILE.width}" height="${TILE.height}" fill="none" stroke="#000" stroke-width="0.3" stroke-dasharray="3 2"/>`,
            // The scale bar, on every sheet, inside the board where there is room below the notch.
            `<g transform="translate(${x + 10} ${y + TILE.height - 12})"><line x1="0" y1="0" x2="100" y2="0" stroke="#000" stroke-width="0.5"/><line x1="0" y1="-3" x2="0" y2="3" stroke="#000" stroke-width="0.5"/><line x1="100" y1="-3" x2="100" y2="3" stroke="#000" stroke-width="0.5"/><text x="50" y="-2" font-size="4" text-anchor="middle">100 mm</text></g>`,
            '</svg>',
            '</section>',
          ].join('\n'),
        );
      }
    }
  }
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(title)}: paper templates</title>`,
    '<style>',
    '@page { margin: 10mm; }',
    'body { font: 10pt/1.3 system-ui, sans-serif; color: #000; background: #fff; margin: 0; }',
    'section { break-after: page; }',
    'section:last-child { break-after: auto; }',
    'h1 { font-size: 13pt; margin: 0 0 1mm; }',
    'p { margin: 0 0 1.5mm; }',
    '.dim { color: #444; font-size: 9pt; }',
    'svg { display: block; }',
    '</style></head><body>',
    pages.length ? pages.join('\n') : '<p>Nothing in this project is cut round anything: there is no template to print.</p>',
    '</body></html>',
  ].join('\n');
}
