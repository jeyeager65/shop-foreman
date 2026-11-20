/**
 * Prints what a job's finish takes: each finish's line in Build's lists, and the checklist's finishing steps.
 * `npx vite-node scripts/print-finish.ts [frameless|faceFrame|shop] [caseId] [frontsId] [inside] [boxes]`
 */
import { setFinish, setInsideFinish } from '@/design';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildLists } from '@/job/lists';
import { createStarterShop } from '@/libraries';
import type { InsideFinish } from '@/model';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

const [style = 'frameless', caseId = 'paint-navy', frontsId = caseId, inside = 'bare', boxes = 'bare'] = process.argv.slice(2);
const shop = createStarterShop();
const project = createBaseCabinetProject(style as 'frameless' | 'faceFrame' | 'shop');
if (caseId !== 'none') setFinish(project, 'case', caseId);
if (frontsId !== 'none') setFinish(project, 'fronts', frontsId);
setInsideFinish(project, 'inside', inside as InsideFinish);
setInsideFinish(project, 'boxes', boxes as InsideFinish);
const job = buildJob(project, shop);
const lists = buildLists(job, project, shop, (mm) => formatLength(mm, DEFAULT_UNIT_PREFERENCES.sizes));
for (const h of lists.hardware.filter((x) => x.group === 'Finish')) console.log(`${h.quantity ?? ''} ${h.unit ?? ''} | ${h.item} | ${h.note}`);
console.log();
for (const step of buildChecklist(project, job.plan, job.programs, shop.tools, undefined, shop.hardware, shop.finishes).filter((s) => /finish|bare|Seal|inside of the case/i.test(s))) console.log(`- ${step}`);
