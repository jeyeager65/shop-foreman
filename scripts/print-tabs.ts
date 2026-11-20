/** Prints where each holding-tab example's tabs are, by either method: `npx vite-node scripts/print-tabs.ts [spacing]`. */
import { alongLoop, exampleTabs, tabExamples } from '@/cam/tabExamples';
import { createStarterShopProfile } from '@/libraries';

const tabs = { ...createStarterShopProfile().machines[0]!.tabs };
if (process.argv[2]) tabs.maxSpacing = Number(process.argv[2]);
for (const method of ['spread', 'perSide'] as const) {
  console.log(`\n${method} (spacing ${tabs.maxSpacing})`);
  for (const ex of tabExamples()) {
    const { centers } = exampleTabs(ex, tabs, method);
    const at = centers.map((c) => alongLoop(ex.outline, c, c + 1)[0]!).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);
    console.log(`  ${ex.id.padEnd(7)} ${String(centers.length).padStart(2)}  ${at.join('  ')}`);
  }
}
