/**
 * Draws the starter hinges' linkages from above, at several door angles, as an HTML
 * page of SVGs: for checking the hinge model by eye.
 *   npx vite-node scripts/hinge-diagram.ts <absolute-out.html> [doorThickness mm]
 * then look at it with scripts/shot.mjs (file:///...).
 */
import { writeFileSync } from 'node:fs';
import { type HingeMount, doorPose, hingeFamily, hingeLinkage, hingeShapes } from '@/design/hingeModel';
import { STARTER_HINGES } from '@/libraries/hinges';

const out = process.argv[2];
if (!out) throw new Error('Give the output file, an absolute path.');
const T = Number(process.argv[3]) || 19;
const SIDE = 18.3;
const svgs: string[] = [];
for (const hinge of STARTER_HINGES) {
  const family = hingeFamily(hinge);
  // Closed: an overlay door laps the side (or the stile) with a 2 mm bumper gap; an inset door stands its gap inside.
  const mount: HingeMount = { family, closed: family === 'inset' ? [-hinge.overlay.mm, -T] : [-hinge.overlay.mm, 2], doorThickness: T, mountThickness: family === 'frame' ? 19 : SIDE };
  const linkage = hingeLinkage(hinge, mount);
  if (!linkage) {
    svgs.push(`<h3>${hinge.name}: no linkage</h3>`);
    continue;
  }
  const shapes = hingeShapes(hinge, mount, linkage);
  // SVG: x right, y down; the hinge's Z (out of the cabinet) is drawn upward.
  const p = ([x, z]: [number, number]) => `${x.toFixed(2)},${(-z).toFixed(2)}`;
  const angles = [0, 20, 45, 70, 90, linkage.openDeg];
  const cells = angles.map((deg) => {
    const pose = doorPose(linkage, deg);
    const a = (pose.deg * Math.PI) / 180;
    const w: [number, number] = [Math.cos(a), Math.sin(a)];
    const n: [number, number] = [-Math.sin(a), Math.cos(a)];
    const at = (u: number, v: number): [number, number] => [pose.corner[0] + u * w[0] + v * n[0], pose.corner[1] + u * w[1] + v * n[1]];
    const door = [at(0, 0), at(70, 0), at(70, T), at(0, T)].map(p).join(' ');
    const cup = [at(shapes.cup.centre - shapes.cup.diameter / 2, 0), at(shapes.cup.centre - shapes.cup.diameter / 2, shapes.cup.depth), at(shapes.cup.centre + shapes.cup.diameter / 2, shapes.cup.depth), at(shapes.cup.centre + shapes.cup.diameter / 2, 0)].map(p).join(' ');
    const fixed = shapes.fixed.map((b) => `<line x1="${b.from[0]}" y1="${-b.from[1]}" x2="${b.to[0]}" y2="${-b.to[1]}" stroke="${b.what === 'pin' ? '#222' : '#5d7fb3'}" stroke-width="${b.thickness}" stroke-linecap="butt" opacity="0.85"/>`).join('');
    const links = shapes.links.map((l, i) => `<line x1="${l.fixed[0]}" y1="${-l.fixed[1]}" x2="${pose.pivots[i]![0]}" y2="${-pose.pivots[i]![1]}" stroke="#d2542a" stroke-width="2"/>`).join('');
    const mountOn = family === 'frame' ? `<rect x="-40" y="0" width="40" height="${mount.mountThickness}" fill="#c9a56c"/>` : `<rect x="${-SIDE}" y="0" width="${SIDE}" height="80" fill="#d9bf94"/>`;
    return `<svg viewBox="-60 -90 150 175" width="230" height="270" style="background:#f4f1ea;border:1px solid #bbb">
      ${mountOn}<line x1="-60" y1="0" x2="90" y2="0" stroke="#999" stroke-dasharray="3 3" stroke-width="0.5"/>
      <polygon points="${door}" fill="#c9ced6" stroke="#555" stroke-width="0.6" opacity="0.9"/>
      <polygon points="${cup}" fill="#fff" stroke="#888" stroke-width="0.5"/>
      ${fixed}${links}
      <text x="-56" y="-78" font-size="9" font-family="sans-serif">${pose.deg}°</text></svg>`;
  });
  svgs.push(`<h3 style="font:14px sans-serif;margin:10px 0 4px">${hinge.name} (${family}; links ${linkage.linkLengths.map((l) => l.toFixed(1)).join(' / ')} mm)</h3><div style="display:flex;gap:6px">${cells.join('')}</div>`);
}
writeFileSync(out, `<!doctype html><html><body style="margin:12px;background:#fff">${svgs.join('')}</body></html>`);
console.log(`Wrote ${out}`);
