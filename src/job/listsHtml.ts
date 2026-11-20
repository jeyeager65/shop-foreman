/**
 * The job's lists as one page that stands on its own: printed from the Make screen
 * and put in the job's zip. Black on white, a tick box on every row.
 */
import { cutMethodLabel, stepToolLabel } from '@/ui/format';
import type { Mm } from '@/model';
import type { BuyRow, JobLists } from './lists';

export const listsFileName = (slug: string) => `${slug}-lists.html`;

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
body { font: 11pt/1.35 system-ui, sans-serif; color: #000; background: #fff; margin: 12mm; }
h1 { font-size: 16pt; margin: 0 0 2mm; }
h2 { font-size: 13pt; margin: 7mm 0 2mm; border-bottom: 1px solid #000; }
h3 { font-size: 11pt; margin: 4mm 0 1mm; }
p { margin: 0 0 2mm; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; padding: 1mm 2mm; border-bottom: 1px solid #bbb; white-space: nowrap; }
td.w { white-space: normal; }
th { font-size: 9pt; text-transform: uppercase; }
td.box { width: 5mm; }
td.box::before { content: ""; display: inline-block; width: 3.2mm; height: 3.2mm; border: 1px solid #000; }
td.n, th.n { text-align: right; white-space: nowrap; }
.dim { color: #444; font-size: 10pt; }
tr { break-inside: avoid; }
h2, h3 { break-after: avoid; }
`;

/** `numeric`: columns set to the right. `wrap`: columns whose text may run onto a second line; sizes never do. */
function table(head: string[], rows: string[][], numeric: number[], wrap: number[]): string {
  const cls = (i: number) => (numeric.includes(i) ? ' class="n"' : wrap.includes(i) ? ' class="w"' : '');
  return [
    '<table>',
    `<tr><th></th>${head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('')}</tr>`,
    ...rows.map((r) => `<tr><td class="box"></td>${r.map((c, i) => `<td${cls(i)}>${c}</td>`).join('')}</tr>`),
    '</table>',
  ].join('\n');
}

/** What a grained part's grain runs along, in words. */
export const grainWords = (grain: 'width' | 'height' | undefined, size: { width: Mm; height: Mm }, length: (mm: Mm) => string): string =>
  grain ? `along the ${length(grain === 'width' ? size.width : size.height)}` : 'none';

/** A buying row's amount in words: "2 sheets", "3.4 board feet". */
export const buyQuantity = (b: BuyRow): string => `${b.quantity} ${b.unit === 'board feet' ? 'board feet' : `${b.unit}${b.quantity === 1 ? '' : 's'}`}`;

/** The whole page. `length` writes a length as the Design screen does. */
export function listsHtml(title: string, lists: JobLists, length: (mm: Mm) => string): string {
  const out: string[] = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(title)}: lists</title>`,
    `<style>${STYLE}</style></head><body>`,
    `<h1>${esc(title)}</h1>`,
    '<p class="dim">Sizes are finished sizes. Write each part\'s label on it as it is cut.</p>',
  ];

  if (lists.buying.length > 0) {
    out.push('<h2>To buy</h2>');
    out.push(
      table(
        ['Qty', 'Material', 'Size', 'Note'],
        lists.buying.map((b) => [esc(buyQuantity(b)), esc(b.material), esc(b.size ? `${length(b.size.width)} × ${length(b.size.height)}` : ''), esc(b.note)]),
        [0],
        [3],
      ),
    );
    out.push('<p class="dim">And the hardware, listed at the end.</p>');
  }

  if (lists.cutList.length > 0) {
    out.push('<h2>Cut list: parts cut on a saw</h2>');
    for (const group of lists.cutList) {
      out.push(`<h3>${esc(group.material)}, ${esc(length(group.thickness))} thick${group.board ? ' (boards: rip to width, then cut to length)' : ''}</h3>`);
      out.push(
        table(
          ['Qty', 'Length', 'Width', 'Label', 'Part', 'Saw', 'Then'],
          group.rows.map((r) => [
            String(r.quantity),
            esc(length(r.length)),
            esc(length(r.width)),
            esc(r.labels.join(', ')),
            esc(r.names.join(', ')),
            esc(cutMethodLabel(r.saw)),
            esc(r.steps.join('; ')),
          ]),
          [0, 1, 2],
          [4, 6],
        ),
      );
      if (group.rows.some((r) => r.grain)) out.push('<p class="dim">The grain runs along the length.</p>');
    }
  }

  out.push('<h2>Parts</h2>');
  out.push(
    table(
      ['Label', 'Part', 'Width × height', 'Material', 'Grain', 'Cut out', 'Then'],
      lists.parts.map((p) => [
        `<b>${esc(p.label)}</b>`,
        esc(p.name),
        esc(`${length(p.size.width)} × ${length(p.size.height)}`),
        esc(p.material),
        esc(grainWords(p.grain, p.size, length)),
        esc(p.cutOut === 'cnc' && p.blank ? `CNC, blank ${p.blank}` : cutMethodLabel(p.cutOut)),
        esc(p.steps.filter((s) => s.by !== 'cnc').map((s) => `${s.label}, ${stepToolLabel(s.by)}`).join('; ')),
      ]),
      [],
      [1, 6],
    ),
  );

  if (lists.byHand.length > 0) {
    out.push('<h2>By hand: joints and holes of parts cut on a saw</h2>');
    out.push('<p>Too long for the machine: cut on a saw, the joints made with a router and a straightedge, the holes with a drill. Measured from the part\'s own edges.</p>');
    out.push(
      table(
        ['Label', 'Part', 'What', 'Face', 'Size', 'Where'],
        lists.byHand.map((h) => [`<b>${esc(h.label)}</b>`, esc(h.part), esc(h.count > 1 ? `${h.count} ${h.what.toLowerCase()}` : h.what), esc(h.face), esc(h.size), esc(h.where)]),
        [],
        [5],
      ),
    );
  }

  if (lists.kreg.length > 0) {
    out.push('<h2>Pocket holes with the Kreg jig</h2>');
    out.push(
      table(
        ['Label', 'Part', 'Face', 'Through its', 'Into', 'Holes at', 'Measured from', 'Screw'],
        lists.kreg.map((k) => [
          `<b>${esc(k.label)}</b>`,
          esc(k.part),
          esc(k.face),
          esc(k.edge),
          esc(k.into),
          esc(k.at.map(length).join(', ')),
          esc(`its ${k.from}`),
          esc(k.screw),
        ]),
        [],
        [1, 4, 5],
      ),
    );
    out.push('<p class="dim">Set the jig and the drill collar to the thickness of the part being drilled.</p>');
  }

  out.push('<h2>Hardware</h2>');
  const groups = [...new Set(lists.hardware.map((h) => h.group))];
  for (const group of groups) {
    out.push(`<h3>${esc(group)}</h3>`);
    out.push(
      table(
        ['Qty', 'Item', 'Where'],
        lists.hardware.filter((h) => h.group === group).map((h) => [h.quantity === undefined ? '' : esc(`${h.quantity}${h.unit ? ` ${h.unit}` : ''}`), esc(h.item), esc(h.note ?? '')]),
        [0],
        [1, 2],
      ),
    );
  }
  out.push('</body></html>', '');
  return out.join('\n');
}
