/**
 * Prints a job's lists: parts with labels, the saw cut list, hardware and Kreg holes.
 *   npx vite-node scripts/print-lists.ts [frameless|faceFrame|shop|shopwall|shopref|framerun|vanity] [cncAssisted] [pocketBox] [dado|throughScrews] [doors|drawers] [flatBottom]
 */
import { cabinetsOf, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { CabinetDesign, DrawerDesign } from '@/model';
import { createBaseCabinetProject, createFaceFrameRunProject, createShopCabinetProject, createShopReferenceProject, createShopWallProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

const args = process.argv.slice(2);
const LAYOUT = args.includes('doors') ? 'doors' : args.includes('drawers') ? 'drawers' : 'drawerOverDoors';
const shop = createStarterShop();
const project = args.includes('vanity') ? createVanityProject() : args.includes('shopwall') ? createShopWallProject() : args.includes('shopref') ? createShopReferenceProject() : args.includes('framerun') ? createFaceFrameRunProject() : (args.includes('shop') ? createShopCabinetProject(LAYOUT) : createBaseCabinetProject(args.includes('faceFrame') ? 'faceFrame' : 'frameless', LAYOUT));
if (args.includes('flatBottom') && project.context.kind === 'designedCabinet') cabinetsOf(project)[0]!.toeKick.off = true;
if (args.includes('cncAssisted')) project.plan.pocketHoles = 'cncAssisted';
if (args.includes('pocketBox')) for (const d of designsOf(project)) if (d.template === 'drawer') (d as DrawerDesign).box.cornerJoint = 'pocketScrews';
if (args.includes('dado') && project.context.kind === 'designedCabinet') (cabinetsOf(project)[0] as CabinetDesign).joinery.case = 'dado';
if (args.includes('throughScrews') && project.context.kind === 'designedCabinet') (cabinetsOf(project)[0] as CabinetDesign).joinery.case = 'throughScrews';

const L = (mm: number) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes);
const lists = buildLists(buildJob(project, shop), project, shop, L);

console.log('TO BUY');
for (const b of lists.buying) console.log(`  ${`${b.quantity} ${b.unit}`.padEnd(16)} ${b.material.padEnd(16)} ${b.size ? `${L(b.size.width)} x ${L(b.size.height)}`.padEnd(14) : ''.padEnd(14)} ${b.note}`);
console.log('\nPARTS');
for (const p of lists.parts) {
  console.log(
    `  ${p.label.padEnd(4)} ${p.name.padEnd(24)} ${`${L(p.size.width)} x ${L(p.size.height)}`.padEnd(22)} ${p.material.padEnd(16)} ${(p.grain ?? '-').padEnd(7)} ${p.cutOut}${p.blank ? ` blank ${p.blank}` : ''}  ${p.steps.map((s) => `${s.label} (${s.by})`).join('; ')}`,
  );
}
console.log('\nCUT LIST');
for (const g of lists.cutList) {
  console.log(`  ${g.material} (${L(g.thickness)})${g.board ? ', boards' : ''}`);
  for (const r of g.rows) console.log(`    ${r.quantity} x ${L(r.length)} x ${L(r.width)}  ${r.labels.join(', ')}  ${r.names.join(', ')}  ${r.saw}${r.grain ? ', grain along the length' : ''}  ${r.steps.join('; ')}`);
}
console.log('\nHARDWARE');
for (const h of lists.hardware) console.log(`  [${h.group}] ${h.quantity ?? ''}${h.unit ? ` ${h.unit}` : ''} ${h.item}  ${h.note ?? ''}`);
console.log('\nKREG JIG');
for (const k of lists.kreg) console.log(`  ${k.label} ${k.part}, ${k.face.toLowerCase()}, ${k.edge} into ${k.into}: ${k.at.map(L).join(', ')} from the ${k.from}; ${k.screw} screws, jig at ${L(k.thickness)}`);
if (lists.shims) console.log(`\nSHIMS ${lists.shims.quantity} x ${L(lists.shims.thickness)}`);
