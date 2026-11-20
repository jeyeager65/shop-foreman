/** Prints where the tile is on the common kitchen's walls, in inches: `npx vite-node scripts/print-wall-tile.ts`. */
import { shopFor, wallTileRects } from '@/design';
import { type ProjectScene, projectScene } from '@/design/scene';
import { createStarterShopProfile } from '@/libraries';
import type { DesignedCabinetContext } from '@/model';
import { createCommonKitchenProject } from '@/samples/cabinet';

const profile = createStarterShopProfile();
const project = createCommonKitchenProject();
const context = project.context as DesignedCabinetContext;
const scene = projectScene(project, shopFor(project, profile), profile.materialGroups) as ProjectScene;
const inches = (mm: number) => (mm / 25.4).toFixed(2).padStart(7);
console.log('wall    along     to     up     to');
for (const t of wallTileRects(context.room!, scene.parts, scene.cabinets)) console.log(`${t.wall.padEnd(6)}${inches(t.along)}${inches(t.along + t.width)}${inches(t.up)}${inches(t.up + t.height)}`);
for (const w of context.room!.windows ?? []) console.log(`window on ${w.wall}: ${inches(w.along.mm)} to ${inches(w.along.mm + w.width.mm)}, ${inches(w.sill.mm)} to ${inches(w.sill.mm + w.height.mm)}`);
