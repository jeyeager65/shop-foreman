// Prints the pocket-hole scrap test's operations and their times, and with `gcode` the screw channels' G-code.
// Run with: npx vite-node scripts/print-pocket-test.ts [gcode]
import { buildPocketTest, type PocketKind } from '@/job/pocketTest';
import { PLYWOOD_3_4_ID, createStarterShop } from '@/libraries';

const shop = createStarterShop();
const kinds: PocketKind[] = [
  { bit: 'ball', ledge: false, channel: true },
  { bit: 'flat', ledge: false, channel: true },
  { bit: 'arc', angleDeg: 3, ledge: false, channel: true },
];
const test = buildPocketTest(shop, PLYWOOD_3_4_ID, kinds);
const lines = test.text.split('\n');
for (const line of lines) if (/^\(MSG, \d+\/\d+/.test(line)) console.log(line);
if (process.argv.includes('gcode')) {
  const from = lines.findIndex((l) => /screw channel/.test(l) && /^\(MSG/.test(l));
  const to = lines.findIndex((l, i) => i > from && /cut the board out/.test(l));
  console.log(lines.slice(from, to).join('\n'));
}
