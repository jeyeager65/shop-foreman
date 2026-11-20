import { bevelWidth } from '@/design';
import { isTabSlot } from '@/design/tabs';
import { arcLedge, arcShape, pocketAxis, pocketShape, slotLedge, slotShape } from '@/geometry/pocketHole';
import { lowAngleOf, pocketHoleMethod, pocketSeatOf } from '@/plan/parts';
import { floorToClear, insideCorners, openSides } from '@/geometry/recess';
import { type Rect, asRect, insetRect, mustBeRect } from '@/geometry/rect';
import type {
  Feature,
  Id,
  MachineProfile,
  Mm,
  Operation,
  Part,
  PlannedBlank,
  PlanWarning,
  Point,
  Polygon,
  Project,
  ResolvedPlan,
  Setup,
  SetupFaces,
  SetupProgram,
  Tool,
  ToolpathStep,
} from '@/model';
import { CHAMFER_TIP_OFFSET, cutDiameter, edgeChamferOffset, findTool, isConeBit, finishAllowance, pinHoleDiameter, holdingTabHeight, tabFitOf, throughDepth, toolSettings, workFace } from '@/plan';

/** How the holding tabs are placed when the machine does not say. */
export const DEFAULT_TAB_METHOD: TabMethod = 'spread';
/** How far a holding tab keeps from a corner when the machine does not say. Tune me. */
export const DEFAULT_TAB_FROM_CORNER: Mm = 25;

/** A rectangle bigger by `d` on every side. */
const grown = (r: Rect, d: Mm): Rect => (d > 0 ? insetRect(r, -d) : r);
import { setupFaces } from '@/plan/faces';
import { TILE_OVERLAP } from '@/plan/setups';
import { clipToBand, cutsSomething, shiftY } from './tile';
import { type TabMethod, bore, cleanupCorners, contour, dogBone, outlineInsideCorners, outsideLoop, outsidePath, pocket, pocketArc, pocketChannel, pocketLedge, slot, tabCenters, vBevel } from './cuts';
import { type Feeds, Path, runTime } from './path';

export interface SetupResult {
  program: SetupProgram;
  /** Cutting time per operation key, without bit changes. */
  opSeconds: Record<string, number>;
  toolChanges: number;
  warnings: PlanWarning[];
}

/** One bit's work for one operation. */
interface Pass {
  op: Operation;
  toolId: Id;
  label: string;
  steps: ToolpathStep[];
}

interface Context {
  project: Project;
  plan: ResolvedPlan;
  blank: PlannedBlank;
  setup: Setup;
  parts: Part[];
  tools: Tool[];
  machine: MachineProfile;
  warnings: PlanWarning[];
}

/** Part coordinates (seen from the front) to machine coordinates for this setup. */
function placer(ctx: Context, part: Part) {
  const placement = ctx.setup.placements.find((p) => p.partId === part.id);
  if (!placement) throw new Error(`Part is not placed in setup ${ctx.setup.index}: ${part.id}`);
  // A turned part lies a quarter turn anticlockwise: its X runs along the blank's Y.
  const point = (p: Point): Point =>
    placement.turned
      ? { x: placement.origin.x + (placement.mirrored ? p.y : part.size.height - p.y), y: placement.origin.y + p.x }
      : { x: placement.origin.x + (placement.mirrored ? part.size.width - p.x : p.x), y: placement.origin.y + p.y };
  const polygon = (outline: Polygon): Point[] => outline.map(point);
  const rect = (outline: Polygon): Rect => mustBeRect(polygon(outline));
  /** The rectangle the part takes up on the blank. */
  const bounds = rect([
    { x: 0, y: 0 },
    { x: part.size.width, y: 0 },
    { x: part.size.width, y: part.size.height },
    { x: 0, y: part.size.height },
  ]);
  return { point, polygon, rect, bounds };
}

/**
 * `finishDepth`: give the depth of a wall worth a full-depth finishing pass. The pass
 * is planned for end mills unless the bit's cutting length is known to be shorter.
 */
function feeds(ctx: Context, tool: Tool, materialId: Id, finishDepth?: Mm): Feeds {
  const s = toolSettings(tool, materialId);
  const shape = tool.shape;
  const reaches =
    finishDepth !== undefined && shape.kind === 'endMill' && (!shape.cuttingLength || shape.cuttingLength.mm >= finishDepth - 1e-6);
  return {
    feed: s.feed,
    plunge: Math.min(s.plungeFeed, ctx.machine.maxPlungeFeed),
    depthPerPass: s.depthPerPass,
    stepover: s.stepover,
    finish: reaches ? finishAllowance(tool, materialId) : 0,
  };
}

type Target<K extends Feature['kind']> = { part: Part; feature: Extract<Feature, { kind: K }> };

function targets<K extends Feature['kind']>(ctx: Context, op: Operation, kinds: K[]): Target<K>[] {
  if (op.source.kind !== 'features') return [];
  // An operation covers its design's parts on every blank; this setup cuts the ones placed
  // in it, and of their features those whose face is up here.
  const here = new Map(ctx.setup.placements.map((p) => [p.partId, p.mirrored ? 'B' : 'A']));
  return op.source.refs.flatMap((ref) => {
    const part = here.has(ref.partId) ? ctx.parts.find((p) => p.id === ref.partId) : undefined;
    const feature = part?.features.find((f) => f.id === ref.featureId);
    const face = feature && workFace(op, feature);
    return part && feature && (kinds as string[]).includes(feature.kind) && (!face || face === here.get(part.id))
      ? [{ part, feature: feature as Extract<Feature, { kind: K }> }]
      : [];
  });
}

function passesFor(ctx: Context, op: Operation): Pass[] {
  if (!op.clearToolId) return [];
  const { machine, setup } = ctx;
  const tool = findTool(ctx.tools, op.clearToolId);
  const diameter = cutDiameter(tool);
  const path = new Path(machine.safeHeight);
  const main: Pass = { op, toolId: tool.id, label: op.label, steps: path.steps };
  const skip = (what: string) =>
    ctx.warnings.push({ code: 'unsupported', message: `${op.label}: ${what}; this cut was left out.` });

  switch (op.kind) {
    case 'hingeCup': {
      for (const { part, feature } of targets(ctx, op, ['cup', 'hole'])) {
        const f = feeds(ctx, tool, part.materialId, feature.depth);
        bore(path, placer(ctx, part).point(feature.center), feature.diameter, diameter, feature.depth, f);
      }
      return [main];
    }
    case 'pinHole': {
      const f = feeds(ctx, tool, ctx.blank.materialId);
      // The plan has already limited the depth to what the bit's flutes can reach.
      // No deeper than this blank needs: a thinner blank than the job's thickest front.
      const depth = Math.min(op.depth, ctx.blank.size.thickness + machine.flipPins.spoilboardDepth);
      for (const pin of setup.pinHoles) bore(path, pin, pinHoleDiameter(machine), diameter, depth, f);
      return [main];
    }
    case 'holes': {
      for (const { part, feature } of targets(ctx, op, ['hole'])) {
        if (diameter > feature.diameter + 1e-6) {
          skip(`the ${tool.name} is wider than a ${feature.diameter.toFixed(2)} mm hole`);
          continue;
        }
        // A hole through the part goes a little past its bottom, as a cutout does.
        const past = feature.depth >= part.size.thickness - 1e-6 ? throughDepth(machine, tool, part.size.thickness) - part.size.thickness : 0;
        const f = feeds(ctx, tool, part.materialId, feature.depth);
        bore(path, placer(ctx, part).point(feature.center), feature.diameter, diameter, feature.depth, f, past);
      }
      return [main];
    }
    case 'dado':
    case 'rabbet':
    case 'groove': {
      for (const { part, feature } of targets(ctx, op, ['dado'])) {
        const place = placer(ctx, part);
        // A tab's blind slot is cut a little bigger than the tab, and deeper, so the joint goes together and closes.
        const fit = isTabSlot(feature) ? tabFitOf(machine) : 0;
        const rect = grown(place.rect(feature.outline), fit / 2);
        const neighbours = part.features.flatMap((other) =>
          other.kind === 'dado' && other.id !== feature.id && other.face === feature.face
            ? [{ rect: place.rect(other.outline), depth: other.depth }]
            : [],
        );
        // The cut runs out past the part's edge, or into a deeper recess, wherever there is no wall.
        const open = openSides(rect, place.bounds, neighbours, feature.depth);
        const deep = feature.depth + fit;
        const f = feeds(ctx, tool, part.materialId, deep);
        if (!pocket(path, floorToClear(rect, open, diameter), diameter, deep, f)) {
          skip(`the ${tool.name} doesn't fit the ${op.kind}`);
          continue;
        }
        // A housing's inside corner is relieved so the square end of the part it houses seats.
        if (op.kind === 'dado') {
          for (const { corner, inward } of insideCorners(rect, open)) dogBone(path, corner, inward, diameter, deep, f);
        }
      }
      return [main];
    }
    case 'slot': {
      for (const { part, feature } of targets(ctx, op, ['slot'])) {
        const place = placer(ctx, part);
        // An end on the part's edge runs out through it, past the edge by the bit's radius.
        const onEdge = (p: Point) => p.x < 0.01 || p.y < 0.01 || p.x > part.size.width - 0.01 || p.y > part.size.height - 0.01;
        const beyond = (end: Point, before: Point): Point => {
          const len = Math.hypot(end.x - before.x, end.y - before.y) || 1;
          // (A shaped bit cuts only as wide as the cut is at the surface: it runs out by half of that.)
          const by = (feature.profile ? feature.width : diameter) / 2 + 0.5;
          return { x: end.x + ((end.x - before.x) / len) * by, y: end.y + ((end.y - before.y) / len) * by };
        };
        // A pattern's cut is the bit's own shape, run once along the line: the right kind of bit, or nothing.
        const shaped = feature.profile;
        const fits = !shaped || (shaped.kind === 'v' ? tool.shape.kind === 'vBit' : shaped.kind === 'bull' ? tool.shape.kind === 'bullNose' : tool.shape.kind === 'ballNose' || tool.shape.kind === 'taperBall');
        if (!fits) {
          skip(`the ${tool.name} is not ${shaped!.kind === 'v' ? 'a V-bit' : shaped!.kind === 'bull' ? 'a bull nose' : 'a ball nose'}`);
          continue;
        }
        const line = [...feature.path];
        if (onEdge(line[0]!)) line[0] = beyond(line[0]!, line[1]!);
        if (onEdge(line.at(-1)!)) line[line.length - 1] = beyond(line.at(-1)!, line.at(-2)!);
        if (!slot(path, line.map(place.point), shaped ? diameter : feature.width, diameter, feature.depth, feeds(ctx, tool, part.materialId, feature.depth), feature.top ?? 0, shaped ? feature.depths : undefined)) {
          skip(`the ${tool.name} is wider than the slot`);
        }
      }
      return [main];
    }
    case 'pocketLedge': {
      // Untested: the ledge round a pocket's opening for a printed cover, cut with a flat end mill once the ball nose
      // has cut the pocket. The end of the ledge the pocket leaves standing is cleared level too.
      if (tool.shape.kind !== 'endMill') {
        skip(`the ${tool.name} is not a flat end mill`);
        return [main];
      }
      // Round a low-angle pocket too, cut once its pocket is.
      const lowLedge = lowAngleOf(pocketHoleMethod(ctx.project.plan));
      for (const { part, feature } of targets(ctx, op, ['pocketHole'])) {
        // The opening is the pocket's, whatever cuts the ledge: only the corners' radius is this bit's.
        const open = lowLedge ? arcLedge(part.size.thickness, lowLedge, pocketSeatOf(ctx.project.plan)) : slotLedge(slotShape(part.size.thickness, diameter));
        const place = placer(ctx, part);
        const { exit, inward } = pocketAxis(part.size, feature.edge, feature.at, feature.inset);
        const from = place.point(exit);
        const toward = place.point({ x: exit.x + inward.x, y: exit.y + inward.y });
        pocketLedge(path, from, { x: toward.x - from.x, y: toward.y - from.y }, open, diameter / 2, feeds(ctx, tool, part.materialId), true);
      }
      return [main];
    }
    case 'pocketHole': {
      // Untested: the open part of each pocket; the pilot is drilled by hand from the part's edge, through the printed guide.
      const low = lowAngleOf(pocketHoleMethod(ctx.project.plan));
      if (low) {
        // A low-angle pocket: a slot with an arced floor, cut with a flat end mill.
        if (tool.shape.kind !== 'endMill') {
          skip(`the ${tool.name} is not a flat end mill`);
          return [main];
        }
        for (const { part, feature } of targets(ctx, op, ['pocketHole'])) {
          const shape = arcShape(part.size.thickness, diameter, low, pocketSeatOf(ctx.project.plan));
          if (!shape.fits) {
            skip(`${part.name} is too thin for a low-angle pocket ${shape.depth.toFixed(1)} mm deep: drill its pocket holes with the Kreg jig`);
            continue;
          }
          // It runs further in from the edge than a 15 degree pocket: the part has to be that long that way.
          const along = (feature.edge === 'x0' || feature.edge === 'x1' ? part.size.width : part.size.height) - (feature.inset ?? 0);
          if (along < shape.end + 3) {
            skip(`${part.name} is ${along.toFixed(0)} mm that way and a low-angle pocket runs ${shape.end.toFixed(0)} mm in from the edge: drill its pocket holes with the Kreg jig`);
            continue;
          }
          const place = placer(ctx, part);
          const { exit, inward } = pocketAxis(part.size, feature.edge, feature.at, feature.inset);
          const from = place.point(exit);
          const toward = place.point({ x: exit.x + inward.x, y: exit.y + inward.y });
          pocketArc(path, from, { x: toward.x - from.x, y: toward.y - from.y }, shape, feeds(ctx, tool, part.materialId));
        }
        return [main];
      }
      if (tool.shape.kind !== 'ballNose') {
        skip(`the ${tool.name} is not a ball nose`);
        return [main];
      }
      for (const { part, feature } of targets(ctx, op, ['pocketHole'])) {
        const shape = pocketShape(part.size.thickness, diameter);
        if (!shape.fits) {
          skip(`${part.name} is too thin for a pocket ${shape.depth.toFixed(1)} mm deep`);
          continue;
        }
        const place = placer(ctx, part);
        const { exit, inward } = pocketAxis(part.size, feature.edge, feature.at, feature.inset);
        const from = place.point(exit);
        const toward = place.point({ x: exit.x + inward.x, y: exit.y + inward.y });
        pocketChannel(path, from, { x: toward.x - from.x, y: toward.y - from.y }, shape, feeds(ctx, tool, part.materialId));
      }
      return [main];
    }
    case 'pocketClear': {
      const pockets = targets(ctx, op, ['pocket']);
      for (const { part, feature } of pockets) {
        const floor = placer(ctx, part).rect(feature.outline);
        // A bevel cuts this wall away afterwards, so finishing it would be wasted.
        const bevelled = part.features.some((b) => b.kind === 'bevel' && b.face === feature.face);
        if (!pocket(path, floor, diameter, feature.depth, feeds(ctx, tool, part.materialId, bevelled ? undefined : feature.depth))) {
          skip(`the ${tool.name} doesn't fit the pocket`);
        }
      }
      if (!op.cleanupToolId) return [main];
      const small = findTool(ctx.tools, op.cleanupToolId);
      const cleanPath = new Path(machine.safeHeight);
      for (const { part, feature } of pockets) {
        const floor = placer(ctx, part).rect(feature.outline);
        const f = feeds(ctx, small, part.materialId);
        if (!cleanupCorners(cleanPath, floor, diameter, cutDiameter(small), feature.depth, f)) {
          skip('the pocket is too small for corner clean-up');
        }
      }
      return [main, { op, toolId: small.id, label: `${op.label} corner clean-up`, steps: cleanPath.steps }];
    }
    case 'vBevel': {
      for (const { part, feature } of targets(ctx, op, ['bevel'])) {
        const frameEdge = placer(ctx, part).rect(feature.path);
        const floorEdge = insetRect(frameEdge, bevelWidth(feature.angleDeg, feature.depth));
        vBevel(path, floorEdge, frameEdge, feature.depth, feeds(ctx, tool, part.materialId));
      }
      return [main];
    }
    case 'edgeProfile': {
      for (const { part, feature } of targets(ctx, op, ['edgeProfile'])) {
        const outline = placer(ctx, part).rect(feature.path);
        const t = feature.treatment;
        let offset: Mm;
        let depth: Mm;
        if (t.kind === 'chamfer' && isConeBit(tool)) {
          // 90 degree bit (a V-bit or a chamfer bit): the cone is as wide as it is deep, so with its axis
          // a flat tip's radius further out it still crosses the edge at the chamfer size.
          offset = edgeChamferOffset(tool);
          depth = t.size + CHAMFER_TIP_OFFSET;
        } else if (t.kind === 'roundover' && tool.shape.kind === 'roundover') {
          offset = tool.shape.tipDiameter.mm / 2;
          depth = t.radius;
        } else {
          skip(`the ${tool.name} can't cut this edge`);
          continue;
        }
        contour(path, outsideLoop(outline, offset), depth, feeds(ctx, tool, part.materialId));
      }
      return [main];
    }
    case 'cutout': {
      const upCut = tool.shape.kind === 'endMill' && tool.shape.cut === 'up';
      const useTabs = ctx.project.plan.tabs?.enabled ?? upCut;
      // An opening inside a part (a sink's) is cut before any part is cut free, while the sheet still holds it.
      const cuts = targets(ctx, op, ['cutout']);
      for (const { part, feature } of [...cuts.filter((c) => c.feature.inside), ...cuts.filter((c) => !c.feature.inside)]) {
        // A plain rectangle, or an outline with a notch (a case side's toe kick).
        const place = placer(ctx, part);
        // (A tab's slot through the part is cut a little bigger than the tab: the machine's `tabFit`.)
        const whole = asRect(feature.outline) ? place.rect(feature.outline) : undefined;
        const plain = whole && feature.inside && isTabSlot(feature) ? grown(whole, tabFitOf(machine) / 2) : whole;
        // Inside an opening the bit runs inside the line and the other way round, so it still climb cuts.
        const around = (offset: Mm) =>
          feature.inside && plain
            ? outsideLoop(plain, -offset).reverse()
            : plain
              ? outsideLoop(plain, offset)
              : // An opening that is not a rectangle (a round cable hole, an air slot): inside its line too, the other way round.
                feature.inside
                ? outsidePath(place.polygon(feature.outline), -offset).reverse()
                : outsidePath(place.polygon(feature.outline), offset);
        // Through the part and, on the last pass, a little past its bottom (the machine's `throughExtra`); the tabs
        // stand from the bottom.
        const depth = part.size.thickness;
        const past = throughDepth(machine, tool, depth) - depth;
        const f = feeds(ctx, tool, part.materialId, depth);
        const tabsFor = (loop: Point[]) =>
          useTabs
            ? {
                // On the long straight sides only, clear of every corner: the whole tab, its ramps too, and the machine's clearance.
                centers: tabCenters(loop, machine.tabs.maxSpacing, machine.tabs.width + 3 * diameter, machine.tabs.fromCorner ?? DEFAULT_TAB_FROM_CORNER, machine.tabs.method ?? DEFAULT_TAB_METHOD, !feature.inside && !!part.tabbed),
                // The bit removes its own width, so the path is held up for the tab plus one diameter.
                flat: machine.tabs.width + diameter,
                ramp: diameter,
                topZ: -(depth - holdingTabHeight(machine, depth)),
                // The slopes at a tab's ends come up from the bottom of the cut, which is past the stock's.
                height: holdingTabHeight(machine, depth) + past,
              }
            : undefined;
        // A joint's slot through the part is cleared whole, like a pocket: it is too small for holding tabs, and
        // the strip a lap round it would leave has nothing to hold it. Then a dog-bone in each corner, below.
        const slotCleared = !!plain && !!feature.inside && isTabSlot(feature) && pocket(path, plain, diameter, depth + past, f);
        // Rough a little outside the line, then one lap on the line at full depth.
        const loop = around(diameter / 2 + f.finish);
        const final = around(diameter / 2);
        // (A slot too narrow to clear as a pocket is still cut round, with no holding tabs.)
        const slot = !!feature.inside && isTabSlot(feature);
        if (!slotCleared) contour(path, loop, depth, f, slot ? undefined : tabsFor(loop), f.finish > 0 ? { loop: final, tabs: slot ? undefined : tabsFor(final) } : undefined, past);
        // An egg-crate rib's slots: a dog-bone in each inside corner, the bit's own size, once the outline is cut round them.
        if (feature.dogBones && !plain) {
          for (const { corner, inward } of outlineInsideCorners(place.polygon(feature.outline))) dogBone(path, corner, inward, diameter, depth, f, past);
        }
        // A tab's slot through a part: a dog-bone in each of its four corners, for the tab's square edges.
        if (feature.dogBones && feature.inside && plain) {
          for (const [x, sx] of [[plain.x0, 1], [plain.x1, -1]] as const) for (const [y, sy] of [[plain.y0, 1], [plain.y1, -1]] as const) dogBone(path, { x, y }, { x: sx, y: sy }, diameter, depth, f, past);
        }
      }
      return [main];
    }
    case 'install':
      return [];
  }
}

/**
 * A job with one blank keeps milestone 1's names. With several, the blank's number is
 * in the name, and a blank cut in one setup is named by its number alone. A flipped
 * blank's files say the setup and the face that is up, in the parts' own words
 * (`-back`, `-inside`), or the setup alone when its parts lie different ways.
 */
export function programFileName(
  project: Project,
  setup: Setup,
  faces: SetupFaces,
  blank?: { index: number; count: number; setupCount: number },
): string {
  const which = blank && blank.count > 1 ? `-blank-${blank.index}` : '';
  if (which && blank!.setupCount === 1) return `${project.slug}${which}.gcode`;
  const face = faces.mixed ? '' : `-${(faces.groups[0]?.face ?? (setup.faceUp === 'B' ? 'Back' : 'Front')).toLowerCase()}`;
  return `${project.slug}${which}-setup-${setup.index}${face}.gcode`;
}

/** What is done to a tiled blank between its two setups, in words. */
export function slideMessage(next: Setup): string {
  return `Put pins in the front pair of holes in the spoilboard, slide the sheet ${slideDistance(next)} mm toward the front and drop its rear pair of holes onto them.`;
}
const slideDistance = (next: Setup) => Math.round(next.flipBefore !== 'none' && next.flipBefore.kind === 'slideOnPins' ? next.flipBefore.distance : 0);

/** The machine-neutral program for one setup, with the time each operation takes. */
export function buildSetupProgram(
  project: Project,
  plan: ResolvedPlan,
  blank: PlannedBlank,
  setup: Setup,
  parts: Part[],
  tools: Tool[],
  machine: MachineProfile,
): SetupResult {
  const ctx: Context = { project, plan, blank, setup, parts, tools, machine, warnings: [] };
  // A tiled blank: the toolpaths are made for the whole blank, then cut down to the band
  // this setup reaches and moved by how far the sheet has been slid. The pin holes are
  // drilled whole, in the first setup.
  const tile = setup.tile;
  const inTile = (pass: Pass): Pass => {
    if (!tile) return pass;
    const plunge = Math.min(toolSettings(findTool(tools, pass.toolId), blank.materialId).plungeFeed, machine.maxPlungeFeed);
    const from = tile.from > 0 ? tile.from - TILE_OVERLAP : -Infinity;
    const to = tile.to < blank.size.height ? tile.to + TILE_OVERLAP : Infinity;
    const kept = pass.op.kind === 'pinHole' ? pass.steps : clipToBand(pass.steps, from, to, machine.safeHeight, plunge);
    return { ...pass, steps: cutsSomething(kept) ? shiftY(kept, -tile.shift) : [] };
  };
  const perOp = setup.operationKeys.flatMap((key) => {
    const op = plan.operations.find((o) => o.key === key);
    return op ? [{ kind: op.kind, passes: passesFor(ctx, op).map(inTile) }] : [];
  });
  // Operations of one kind that follow each other (the doors' pocket, the drawer
  // front's pocket) run their first passes together, then their clean-up passes,
  // so the bit is changed once for the group and not once per operation.
  const passes: Pass[] = [];
  for (let i = 0; i < perOp.length; ) {
    let j = i;
    while (j < perOp.length && perOp[j]!.kind === perOp[i]!.kind) j++;
    const group = perOp.slice(i, j);
    const depth = Math.max(...group.map((g) => g.passes.length));
    for (let n = 0; n < depth; n++) passes.push(...group.flatMap((g) => g.passes.slice(n, n + 1)));
    i = j;
  }

  const steps: ToolpathStep[] = [];
  const toolIds: Id[] = [];
  const opSeconds: Record<string, number> = {};
  let current: Id | undefined;
  let toolChanges = 0;
  let position: { x?: Mm; y?: Mm; z?: Mm } = {};
  for (const pass of passes.filter((p) => p.steps.length > 0)) {
    if (pass.toolId !== current) {
      if (current !== undefined) toolChanges++;
      current = pass.toolId;
      if (!toolIds.includes(current)) toolIds.push(current);
      steps.push({ kind: 'toolChange', toolId: current });
      // After a bit change the post leaves the bit at safe height over the probe spot.
      position = { ...setup.probeSpot.at, z: machine.safeHeight };
    }
    const run = runTime(pass.steps, machine.rapidFeed, position);
    steps.push({ kind: 'operation', label: pass.label, seconds: run.seconds });
    steps.push(...pass.steps);
    opSeconds[pass.op.key] = (opSeconds[pass.op.key] ?? 0) + run.seconds;
    position = run.end;
  }

  const lastSetup = setup.index === blank.setups.length;
  const count = plan.blanks.length;
  const faces = setupFaces(setup, parts);
  return {
    program: {
      setup,
      blank: { id: blank.id, index: blank.index, count, label: blank.label, setupCount: blank.setups.length },
      materialId: blank.materialId,
      faces,
      fileName: programFileName(project, setup, faces, { index: blank.index, count, setupCount: blank.setups.length }),
      stock: { x: blank.size.width, y: blank.size.height, z: blank.size.thickness },
      toolIds,
      steps,
      endMessage: lastSetup
        ? count > 1
          ? `Blank ${blank.index} of ${count} done.`
          : 'Job done.'
        : tile
          ? // Short enough for one line of G-code; the checklist has it in full.
            `Setup 1 done. ${plan.warnings.some((w) => w.code === 'pinHolesShallow') ? 'Drill the pin holes deeper, then slide' : 'Slide'} the sheet ${slideDistance(blank.setups[1]!)} mm forward onto pins in the front holes.`
          : plan.warnings.some((w) => w.code === 'pinHolesShallow') && setup.index === 1
            ? 'Setup 1 done. Drill the pin holes deeper by hand, then flip the sheet left to right onto the pins.'
            : `Setup ${setup.index} done. Flip the sheet left to right onto the pins.`,
    },
    opSeconds,
    toolChanges,
    warnings: ctx.warnings,
  };
}
