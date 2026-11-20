/**
 * Dev helper: prints the reference cabinet's parts list.
 * `npx vite-node scripts/print-cabinet.ts [frameless|faceFrame|shop] [dado|throughScrews|tabs|blindTabs] [rabbet|groove|applied|tabBack] [flat|nailer] [pocketBox|tabBox] [rearBrackets] [doors|drawers] [flatBottom]`
 * `doors` and `drawers` make the layout doors only or three drawers.
 * `pocketBox` joins the drawer box with pocket screws; `rearBrackets` carries the slides on brackets.
 * Holes are printed one per line by id: hinge plate, shelf-pin and slide screw holes in the sides.
 * The words after the style can come in any order.
 */
import { cabinetsOf, deriveCabinetParts, deriveDrawerBoxParts, isDrawer, designsOf } from '@/design';
import { createStarterShop } from '@/libraries';
import { createBaseCabinetProject, createShopCabinetProject } from '@/samples/cabinet';
import type { ConstructionStyle } from '@/model';
import { formatLength } from '@/units';

const args = process.argv.slice(3);
const shop = createStarterShop();
const frac = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const LAYOUT = args.includes('doors') ? 'doors' : args.includes('drawers') ? 'drawers' : 'drawerOverDoors';
const project = process.argv[2] === 'shop' ? createShopCabinetProject(LAYOUT) : createBaseCabinetProject((process.argv[2] as ConstructionStyle) ?? 'frameless', args.includes('doors') ? 'doors' : args.includes('drawers') ? 'drawers' : 'drawerOverDoors');
const joinery = cabinetsOf(project)[0]!.joinery;
if (args.includes('flatBottom')) cabinetsOf(project)[0]!.toeKick.off = true;
for (const word of process.argv.slice(3)) {
  // `dado` joins the case with dados instead of pocket screws.
  if (word === 'dado') joinery.case = 'dado';
  if (word === 'throughScrews') joinery.case = 'throughScrews';
  if (word === 'tabs' || word === 'blindTabs') {
    joinery.case = 'tabs';
    if (word === 'blindTabs') joinery.tabs = { blind: true };
  }
  if (word === 'rabbet' || word === 'groove' || word === 'applied') joinery.back = word;
  if (word === 'tabBack') joinery.back = 'tabs';
  if (word === 'flat' || word === 'nailer') joinery.backStretcherForm = word;
  for (const drawer of designsOf(project).filter(isDrawer)) {
    if (word === 'pocketBox') drawer.box.cornerJoint = 'pocketScrews';
    if (word === 'tabBox') drawer.box.cornerJoint = 'tabs';
    if (word === 'rearBrackets') drawer.slide.faceFrameMount = 'rearBrackets';
  }
}
for (const part of [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop)]) {
  const material = shop.materials.find((m) => m.id === part.materialId)!;
  const stock = `${frac(material.nominalThickness.mm)} ${material.name}`;
  const at = part.placement!.origin.map((v) => frac(v)).join(', ');
  const pockets = part.features.flatMap((f) => (f.kind === 'pocketHole' ? [`${f.face}/${f.edge} ${frac(f.at)}`] : []));
  console.log(`${part.name.padEnd(22)} ${`${frac(part.size.width)} x ${frac(part.size.height)}`.padEnd(24)} ${stock.padEnd(16)} grain ${(part.grain ?? '-').padEnd(7)} at ${at}`);
  if (pockets.length) console.log(`${''.padEnd(16)} pocket holes: ${pockets.join(', ')}`);
  for (const f of part.features) {
    if (f.kind === 'hole') console.log(`${''.padEnd(16)} ${f.id}: ${frac(f.center.x)},${frac(f.center.y)}, ${frac(f.diameter)} dia`);
    if (f.kind === 'dado') console.log(`${''.padEnd(16)} ${f.id}: ${f.outline.map((p) => `${frac(p.x)},${frac(p.y)}`).join(' ')}, ${frac(f.depth)} deep`);
  }
}
