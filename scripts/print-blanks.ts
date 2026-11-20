/**
 * Prints the blanks of the reference cabinet's job: what is on each, how it lies, and
 * how long the plan took. Run with: npx vite-node scripts/print-blanks.ts [frameless|faceFrame|shop|shopwall|shopref|framerun|vanity] [cncAssisted] [doors|drawers] [flatBottom]
 */
import { cabinetsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import { createBaseCabinetProject, createFaceFrameRunProject, createShopCabinetProject, createShopReferenceProject, createShopWallProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { formatLength } from '@/units';

const args = process.argv.slice(2);
const LAYOUT = args.includes('doors') ? 'doors' : args.includes('drawers') ? 'drawers' : 'drawerOverDoors';
const shop = createStarterShop();
const project = args.includes('vanity') ? createVanityProject() : args.includes('shopwall') ? createShopWallProject() : args.includes('shopref') ? createShopReferenceProject() : args.includes('framerun') ? createFaceFrameRunProject() : (args.includes('shop') ? createShopCabinetProject(LAYOUT) : createBaseCabinetProject(args.includes('faceFrame') ? 'faceFrame' : 'frameless', LAYOUT));
if (args.includes('flatBottom') && project.context.kind === 'designedCabinet') cabinetsOf(project)[0]!.toeKick.off = true;
if (args.includes('cncAssisted')) project.plan.pocketHoles = 'cncAssisted';

const started = performance.now();
const job = buildJob(project, shop);
const ms = Math.round(performance.now() - started);
const inch = (mm: number) => formatLength(mm, { kind: 'fractionalInch', denominator: 32 });
const all = [...job.parts, ...job.cabinetParts];

console.log(`${project.name}: ${job.plan.blanks.length} blanks, ${job.files.length} files, planned in ${ms} ms`);
for (const blank of job.plan.blanks) {
  const grain = blank.grainAxis ? `, grain along ${blank.grainAxis.toUpperCase()}` : '';
  console.log(`\n${blank.index}. ${blank.label}: ${inch(blank.size.width)} x ${inch(blank.size.height)}, ${JSON.stringify(blank.arrangement)}, ${blank.edgeMargin} mm edge waste${grain}`);
  for (const setup of blank.setups) {
    console.log(`   setup ${setup.index}, face ${setup.faceUp} up: ${setup.operationKeys.join(', ') || '(nothing to cut yet)'}`);
    for (const p of setup.placements) {
      const part = all.find((x) => x.id === p.partId)!;
      console.log(`      ${part.name.padEnd(18)} at ${inch(p.origin.x)}, ${inch(p.origin.y)}${p.turned ? '  turned' : ''}${p.mirrored ? '  mirrored' : ''}`);
    }
  }
  for (const w of blank.warnings) console.log(`   ! ${w.code}: ${w.message}`);
}
console.log(`\nFiles: ${job.files.map((f) => f.name).join(', ') || 'none'}`);
