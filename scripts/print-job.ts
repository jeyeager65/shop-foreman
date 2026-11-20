/** Dev helper: `npx vite-node scripts/print-job.ts [outDir]` prints the vanity plan and writes its G-code. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import { createVanityProject } from '@/samples/vanity';

const job = buildJob(createVanityProject(), createStarterShop());
for (const op of job.plan.operations) {
  console.log(`${op.label.padEnd(20)} ${String(op.face).padEnd(8)} ${op.method.padEnd(15)} ${(op.machineSeconds / 60).toFixed(1)} min`);
}
console.log('summary', { ...job.plan.summary, minutes: +(job.plan.summary.machineSeconds / 60).toFixed(1) });
for (const w of job.plan.warnings) console.log('warning:', w.code, '-', w.message);
const outDir = process.argv[2];
for (const file of job.files) {
  console.log(file.name, file.text.split('\n').length, 'lines');
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, file.name), file.text);
  }
}
