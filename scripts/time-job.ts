/**
 * Times the job of a project with several cabinets: the shop wall's three, or N
 * cabinets (the same three repeated). Run with: npx vite-node scripts/time-job.ts [N]
 */
import { deriveCabinetParts, deriveDrawerBoxParts, deriveParts } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import { activeMachine, resolvePlan } from '@/plan';
import { addCabinet, createShopWallProject } from '@/samples/cabinet';
import { len } from '@/units';

const count = Number(process.argv[2]) || 3;
const shop = createStarterShop();
const project = createShopWallProject();
for (let n = 4; n <= count; n++) {
  if (n % 3 === 2) addCabinet(project, { name: `Cabinet ${n}`, width: len('30"'), layout: 'drawerOverDoors' });
  else addCabinet(project, { name: `Cabinet ${n}`, width: len('24"'), layout: 'drawers', drawers: 3 });
}
const timed = <T>(work: () => T): [T, number] => {
  const started = performance.now();
  const result = work();
  return [result, Math.round(performance.now() - started)];
};
// Once to warm up, then the run that counts.
buildJob(project, shop);
activeMachine(shop);
const [parts, partsMs] = timed(() => ({ fronts: deriveParts(project, shop), others: [...deriveCabinetParts(project, shop), ...deriveDrawerBoxParts(project, shop)] }));
const [, planMs] = timed(() => resolvePlan(project, shop, parts.fronts, parts.others));
const [job, jobMs] = timed(() => buildJob(project, shop));
console.log(`${count} cabinets: ${parts.fronts.length + parts.others.length} parts, ${job.plan.blanks.length} blanks, ${job.files.length} files`);
console.log(`  parts ${partsMs} ms, plan ${planMs} ms, whole job ${jobMs} ms (toolpaths and G-code ${jobMs - partsMs - planMs} ms)`);
