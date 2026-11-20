import { hubBackSplit } from './hub';
import type { CabinetDesign, CabinetOpening, DesignObject, Material, Mm, Opening, Part, Project, Shop, ShopProfile } from '@/model';
import { withMaterialSettings, projectMachineId, toolsOnMachine } from '@/libraries';
import { deriveCaseParts, kickBoardHeight, kickBoardOutline } from './case';
import { deriveUnderSink } from './underSink';
import { falseFrontParts, falseFrontTilt } from './falseFront';
import { deriveSusan } from './susan';
import { boxOf, shiftedParts } from './style';
import { edgeStripParts } from './edgeStrips';
import { deriveDiagonalCaseParts } from './diagonal';
import { deriveTopParts } from './tops';
import { deriveLShapedCaseParts, doorsOnSusan } from './lShaped';
import { susanAxis } from './susan';
import { deriveDoorParts } from './doors';
import { drawerBox } from './drawerBox';
import { deriveDrawerParts, drawerSideOverlay, isDoorSet, isDrawer } from './drawers';
import { existingRowFronts } from './existing';
import { deriveFaceFrameParts } from './faceFrame';
import { designsOf } from './frontSettings';
import { withGrain } from './grain';
import { HANDLE_HOLE, doorHandleEnd, isHandle } from './handles';
import { handleHeight, handleLook, printedHandleProblems, pullProfile } from './printedHandle';
import { withHardwareHoles } from './hardwareHoles';
import { DOOR_STANDOFF, asOpening, cabinetOpeningsOf, placeFronts } from './openings';
import { cabinetsOf, framesOf } from './settings';
import { deriveFrameParts, legFrameParts, postParts, postsBack } from './frame';
import { spanParts } from './closet';
import { runFit } from './runs';
import { constructionRules, hang, kickBoardOf, thicknessOf, toeKickOf } from './style';
import { drawerFrontKind, wideFrontDecorated } from './slides';
import { clearOfTabSlots } from './tabs';
import { casterGroups, casterLayerParts, casterShares, onLegs } from './casters';
import { withPartitionHoles, withPartitions } from './partitions';
import { withTags } from './tags';

export * from './cabinetAssembly';
export * from './diagonal';
export * from './bays';
export * from './case';
export * from './casters';
export * from './doors';
export * from './drawerBox';
export * from './drawers';
export * from './existing';
export * from './existingShell';
export * from './faceFrame';
export * from './faces';
export * from './finish';
export * from './finishFaces';
export * from './finishAreas';
export * from './frontSettings';
export * from './grain';
export * from './handles';
export * from './hardwareHoles';
export * from './hingeModel';
export * from './joints';
export * from './layout';
export * from './lShaped';
export * from './materials';
export * from './openings';
export * from './partitions';
export * from './pocketHoles';
export * from './presets';
export * from './presetDiff';
export { fasteningHole, footWidth, handleHeight, handleLook, knobProfile, madeHandle, printedHandleProblems, pullProfile, PRINT_WALL, WOOD_WALL } from './printedHandle';
export * from './pulls';
export * from './room';
export * from './roomLook';
export * from './runs';
export * from './settings';
export * from './sizes';
export * from './slides';
export * from './style';
export * from './edgeStrips';
export * from './tabs';
export * from './tags';
export * from './tops';
export * from './frame';
export * from './shelves';
export * from './closet';
export * from './standsOn';
export * from './doorRacks';
export * from './underSink';
export * from './falseFront';
export * from './sinks';
export * from './pattern';
export * from './patternLooks';
export * from './tileDrawings';
export * from './susan';
export * from './wayIn';
export * from './appliances';
export * from './torsion';
export * from './dropLeaf';
export * from './hub';

/**
 * The shop as the project's job sees it: the shop profile with the project's own
 * materials in place of the catalog, and the project's machine as the one in use. Given a shop that is already one, its materials
 * are replaced by the project's all the same.
 */
export function shopFor(project: Pick<Project, 'materials'> & Partial<Pick<Project, 'machineId'>>, shop: Shop | ShopProfile): Shop {
  const { materialCatalog: _catalog, materials: _materials, materialGroups: _groups, ...rest } = shop as Partial<ShopProfile> & Partial<Shop> & Omit<Shop, 'materials'>;
  // The machine is the project's: the job sees it as the machine in use, with the
  // bits on that machine's feeds, whichever machine the shop itself has in use.
  const machineId = projectMachineId(project, rest);
  const tools = toolsOnMachine(rest, machineId);
  // The bits' settings are kept by material type: each of the project's materials cuts on its type's.
  return { ...rest, activeMachineId: machineId, tools: withMaterialSettings(tools, project.materials), materials: project.materials };
}

/**
 * The openings the fronts mount on: the ones the project's cabinets produce. One on a cabinet that is
 * already there carries the doors measured on it (reverse mode: the overlay they have, and hinges for it).
 */
export function openingsOf(project: Project, materials: Material[]): Opening[] {
  const cabinets = cabinetsOf(project);
  // The doors measured on it are those of its door opening, never of a drawer opening.
  return cabinetOpeningsOf(project, materials).map((o) => asOpening(o, o.use === 'doors' ? cabinets.find((c) => c.id === o.cabinetId)?.existing?.doors : undefined));
}

/**
 * The design objects as they hang on their openings: where a cabinet's construction
 * style fixes the overlays (frameless), those replace each design's own. Parts,
 * Plan and Make work from this list, never from the stored designs.
 */
export function hungDesigns(project: Project, shop: Pick<Shop, 'materials'>): DesignObject[] {
  const derived = cabinetOpeningsOf(project, shop.materials);
  return mountedDesigns(project, shop.materials).map((d) => hang(d, derived.find((o) => o.id === d.mounting.openingId)));
}

/**
 * The design objects that have an opening to hang on. A designed cabinet keeps the
 * doors and drawers of rows its layout no longer has, so switching the layout back
 * re-enters nothing; those are in the project and nowhere else.
 */
export function mountedDesigns(project: Project, materials: Material[]): DesignObject[] {
  if (project.context.kind !== 'designedCabinet') return designsOf(project);
  // An existing case that keeps a front has none made for it: the door set or the drawer on that opening is kept, unmounted.
  const cabinets = cabinetsOf(project);
  const kept = (o: CabinetOpening) => {
    const cabinet = cabinets.find((c) => c.id === o.cabinetId);
    return !!cabinet?.existing && existingRowFronts(cabinet.existing, cabinet.layout.rows.findIndex((r) => r.id === o.rowId)) === 'kept';
  };
  // An open row has nothing hung on it: its door set is kept the same way, to come back with the doors.
  const ids = new Set(cabinetOpeningsOf(project, materials).filter((o) => !kept(o) && !o.open).map((o) => o.id));
  return designsOf(project).filter((d) => ids.has(d.mounting.openingId));
}

/** The project with its design objects as they hang. Applying it twice changes nothing. */
export function hungProject(project: Project, shop: Pick<Shop, 'materials'>): Project {
  return { ...project, designObjects: hungDesigns(project, shop) };
}

/**
 * Every part of every design object in the project: the fronts. Plan works from
 * these. Cabinet parts stay separate until Plan can take several blanks,
 * materials and outlines that are not rectangles.
 */
export function deriveParts(project: Project, shop: Shop): Part[] {
  const derived = cabinetOpeningsOf(project, shop.materials);
  const openings = openingsOf(project, shop.materials);
  const hung = hungDesigns(project, shop);
  const cabinets = cabinetsOf(project);
  const handleEnd = (design: DesignObject, cabinetId: string | undefined) => doorHandleEnd(cabinets.find((c) => c.id === cabinetId)?.form, design.name);
  const fronts = hung.flatMap((design) => {
    const opening = openings.find((o) => o.id === design.mounting.openingId);
    if (!opening) throw new Error(`Opening not found: ${design.mounting.openingId}`);
    const inCabinet = derived.find((o) => o.id === opening.id);
    // A shop-style drawer has no front of its own: the front of its box is the front. A wide front with a style of
    // its own is cut as a front, though, and is given here, with the doors (`DrawerBox.frontPart`).
    // One with an applied front has that front, made and placed like any other, inset in its opening.
    if (!isDoorSet(design) && inCabinet?.inset && drawerFrontKind(design, inCabinet) !== 'applied') {
      if (drawerFrontKind(design, inCabinet) !== 'wide' || !wideFrontDecorated(design.shop)) return [];
      const front = drawerBox(design, project, shop)?.frontPart;
      return front ? [front] : [];
    }
    // Doors between corner posts are inset in the frame: their hinges are fitted by hand, so no cups are bored.
    const noCups = (made: Part[]) => (isDoorSet(design) && inCabinet?.inFrame ? made.map((part) => ({ ...part, features: part.features.filter((f) => f.kind !== 'cup') })) : made);
    const parts = (
      isDoorSet(design)
        ? deriveDoorParts(design, opening, shop.hardware, shop.materials, handleEnd(design, inCabinet?.cabinetId))
        : deriveDrawerParts(design, opening, drawerSideOverlay(design, hung, shop.hardware).overlay, shop.materials, shop.hardware)
    ).map((part) => withGrain(part, isDoorSet(design) ? 'door' : 'drawerFront', shop.materials));
    const gap = isDoorSet(design) && design.mounting.doors === 2 ? design.mounting.gap.mm : 0;
    const placedFronts = inCabinet ? placeFronts(noCups(parts), inCabinet, design.mounting.overlayBottom.mm, gap) : parts;
    // A false front on tilt-out hinges tips forward with the Doors slider.
    const tilt = !isDoorSet(design) && inCabinet ? falseFrontTilt(design, inCabinet, shop.materials) : undefined;
    const placed = tilt ? placedFronts.map((part) => ({ ...part, moves: tilt })) : placedFronts;
    const cabinet = cabinets.find((c) => c.id === inCabinet?.cabinetId);
    if (!isDoorSet(design) || cabinet?.corner?.kind !== 'lShaped') return placed;
    // An L-shaped corner cabinet's two doors. Fixed to a lazy susan they have no hinges and turn with it; else they
    // are a bi-fold pair: the door on the second face is hinged to the first and follows it.
    if (doorsOnSusan(cabinet)) {
      const axis = susanAxis(cabinet);
      return placed.map((part) => ({ ...part, features: part.features.filter((f) => f.kind !== 'cup'), moves: { kind: 'turn' as const, axis } }));
    }
    if (!opening.id.endsWith('-2')) return placed;
    const lead = hung.find((d) => d.mounting.openingId === opening.id.slice(0, -2));
    return lead ? placed.map((part) => ({ ...part, moves: { kind: 'follow' as const, partId: part.id.replace(design.id, lead.id) } })) : placed;
  });
  return withTags(project, fronts);
}

/**
 * The box of every drawer on a designed cabinet, and its build-out strips where a
 * face frame cabinet carries the slides on them. Kept apart from `deriveParts` for
 * the same reason as the cabinet parts.
 */
export function deriveDrawerBoxParts(project: Project, shop: Shop): Part[] {
  return withTags(project, designsOf(project).filter(isDrawer).flatMap((drawer) => drawerBox(drawer, project, shop)?.parts ?? []));
}

/**
 * The filler strips beside a cabinet at the end of a run that is against a wall and
 * shorter than the length it fills: a plain strip as tall as the cabinet's front, flush
 * with it, in the case material (the face frame's behind a frame). It is cut on the saw
 * and scribed to the wall by hand; the part is the space it has to fill.
 */
function fillerParts(project: Project, cabinet: CabinetDesign, materials: Material[]): Part[] {
  const context = project.context;
  const run = context.kind === 'designedCabinet' && cabinet.runId ? context.runs.find((r) => r.id === cabinet.runId) : undefined;
  const fit = context.kind === 'designedCabinet' && run ? runFit(context, run) : undefined;
  const rules = constructionRules(cabinet, materials);
  const materialId = rules.hasFaceFrame ? cabinet.faceFrame.materialId : cabinet.materials.caseId;
  const thickness = thicknessOf(materials, materialId);
  const bottom = toeKickOf(cabinet).height;
  return (fit?.fillers ?? [])
    .filter((f) => f.cabinetId === cabinet.id)
    .map((f) =>
      withGrain(
        {
          id: `${cabinet.id}/filler-${f.end}`,
          designObjectId: cabinet.id,
          name: `Filler, ${f.end}`,
          materialId,
          size: { width: f.width, height: cabinet.size.height.mm - bottom, thickness },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: f.width, y: 0 }, { x: f.width, y: cabinet.size.height.mm - bottom }, { x: 0, y: cabinet.size.height.mm - bottom }] }],
          role: 'filler',
          // Face A is its front, flush with the front of the frame or of the case.
          placement: { origin: [f.end === 'left' ? -f.width : cabinet.size.width.mm, bottom, rules.frontPlane], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
        },
        'filler',
        materials,
      ),
    );
}

/**
 * A cabinet's back filler (`backFiller`): a board standing behind its back at one side, floor to
 * the cabinet's top, as wide as the space it closes, its face A in line with that side of the
 * case and looking out from it. In the face frame's material behind a frame, else the case's;
 * cut on the saw.
 */
export function backFillerParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const filler = cabinet.backFiller;
  if (!filler || filler.width.mm <= 0.5) return [];
  const rules = constructionRules(cabinet, materials);
  const materialId = rules.hasFaceFrame ? cabinet.faceFrame.materialId : cabinet.materials.caseId;
  const [width, height, depth] = [filler.width.mm, cabinet.size.height.mm, cabinet.size.depth.mm];
  return [
    withGrain(
      {
        id: `${cabinet.id}/back-filler`,
        designObjectId: cabinet.id,
        name: 'Back filler',
        materialId,
        size: { width, height, thickness: thicknessOf(materials, materialId) },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] }],
        role: 'filler',
        // Across the gap behind the back, face A outward at the side's outside face.
        placement:
          filler.side === 'left'
            ? { origin: [0, 0, -depth - width], xAxis: [0, 0, 1], yAxis: [0, 1, 0] }
            : { origin: [cabinet.size.width.mm, 0, -depth], xAxis: [0, 0, -1], yAxis: [0, 1, 0] },
      },
      'filler',
      materials,
    ),
  ];
}

/**
 * A blind corner cabinet's face on its blind side (milestone 6), frameless or in the shop
 * style: the blind panel the other run covers, from the case's outside edge (less the
 * reveal; inside the case when inset), and the filler strip beside the door, both in the
 * doors' material and in their plane. Behind a face frame the wide stile is the blind and
 * these are not made.
 */
export function blindCornerParts(project: Project, cabinet: CabinetDesign, materials: Material[]): Part[] {
  const corner = cabinet.corner;
  if (corner?.kind !== 'blind' || project.context.kind !== 'designedCabinet') return [];
  const rules = constructionRules(cabinet, materials);
  if (rules.hasFaceFrame) return [];
  const fronts = project.context.fronts;
  const t = rules.openingSide;
  const materialId = rules.inset ? (fronts.doors.shop?.materialId ?? cabinet.materials.caseId) : fronts.doors.materialId;
  const thickness = thicknessOf(materials, materialId);
  const W = cabinet.size.width.mm;
  const blind = Math.max(t, corner.blind.mm);
  // Across from the outside edge on the blind side: where the blind starts, and where it meets the door (a front gap short of its edge).
  const full = rules.fullOverlay;
  const [start, end] = rules.inset ? [t + rules.inset.gap, blind - rules.inset.gap] : [full!.reveal, blind - (t - full!.reveal) - full!.gap];
  const [bottom, top] = rules.inset ? [rules.openingsBottom + rules.inset.gap, rules.openingsTop - rules.inset.gap] : [full!.bottom, full!.top];
  const fillerWidth = Math.min(corner.filler.mm, Math.max(0, end - start));
  const panelWidth = end - start - fillerWidth;
  const face = rules.inset ? 0 : rules.frontPlane + DOOR_STANDOFF + thickness;
  // From the blind side's outside edge inward: x measured that way, then turned into the cabinet's own x.
  const x = (from: Mm, width: Mm) => (corner.side === 'left' ? from : W - from - width);
  // Both are the face of the cabinet in the doors' material: one role, so they are drawn and finished as the fronts are.
  const piece = (key: string, name: string, from: Mm, width: Mm, role: 'blindPanel' = 'blindPanel'): Part =>
    withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId,
        size: { width, height: top - bottom, thickness },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: top - bottom }, { x: 0, y: top - bottom }] }],
        role,
        placement: { origin: [x(from, width), bottom, face], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
      },
      role,
      materials,
    );
  return [
    ...(panelWidth > 0.5 ? [piece('blind-panel', 'Blind panel', start, panelWidth)] : []),
    ...(fillerWidth > 0.5 ? [piece('blind-filler', 'Corner filler', start + panelWidth, fillerWidth)] : []),
  ];
}

/**
 * The finished back of each one-row island (milestone 8): a panel of the case material
 * over the row's cabinets' backs, as long as the row and down to the floor (the toe kick is
 * on the other face), the part of the row's first cabinet. On casters
 * it stops where the boxes do, clear of the casters.
 */
export function islandBackParts(project: Project, materials: Material[]): Part[] {
  const context = project.context;
  if (context.kind !== 'designedCabinet') return [];
  const cabinets = cabinetsOf(project);
  return (context.islands ?? []).flatMap((island) => {
    if (island.rows.length !== 1 || island.finishedBack === false) return [];
    const members = cabinets.filter((c) => c.runId === island.rows[0]);
    const first = members[0];
    if (!first) return [];
    const bottom = first.toeKick.casters ? toeKickOf(first).height : 0;
    const height = Math.max(...members.map((c) => c.size.height.mm)) - bottom;
    const depth = Math.max(...members.map((c) => c.size.depth.mm));
    const t = thicknessOf(materials, first.materials.caseId);
    // Behind a power hub it stops where that cabinet's own back is split, so the hub's access panel is not covered:
    // the finished back is then in pieces, each a rectangle, side by side.
    const pieces: { x0: Mm; x1: Mm; height: Mm }[] = [];
    let x = 0;
    for (const c of members) {
      const split = hubBackSplit(c, materials);
      const h = split === undefined ? height : split - bottom;
      const last = pieces.at(-1);
      if (last && Math.abs(last.height - h) < 1e-6) last.x1 = x + c.size.width.mm;
      else pieces.push({ x0: x, x1: x + c.size.width.mm, height: h });
      x += c.size.width.mm;
    }
    return pieces.map((piece, i) => {
      const width = piece.x1 - piece.x0;
      return withGrain(
        {
          id: `${first.id}/island-back${i === 0 ? '' : `-${i + 1}`}`,
          designObjectId: first.id,
          name: pieces.length > 1 ? `Finished back ${i + 1}` : 'Finished back',
          materialId: first.materials.caseId,
          size: { width, height: piece.height, thickness: t },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: piece.height }, { x: 0, y: piece.height }] }],
          role: 'filler',
          // Face A out, behind the backs: X runs leftward as seen from behind.
          placement: { origin: [piece.x1, bottom, -depth - t], xAxis: [-1, 0, 0], yAxis: [0, 1, 0] },
        },
        'filler',
        materials,
      );
    });
  });
}

/** The longest toe kick board when the project says nothing of its stock: a sheet's 8'. */
const KICK_BOARD_MAX: Mm = 2438.4;

/**
 * The toe kick boards that run across the cabinets of a run, in front of their sides (`toeKick.board`
 * `acrossRun`): one board from the outside of the first side to the outside of the last,
 * so no side's edge and no join shows in the toe space. Where the run is longer than the stock on hand it is
 * split at a join between two cabinets. Where a filler strip stands between the run's end and a wall, the
 * board runs on under it to the wall, so the toe space is closed as far as the fronts are (cut to the space;
 * scribed to the wall by hand as the strip is). Each board is the part of the first cabinet it covers, in that
 * cabinet's frame, its face where the toe space ends. It goes on from the front once the run is set (glue and
 * brads: nothing can be reached behind it by then), so nothing is cut in it.
 */
export function runKickBoards(project: Project, materials: Material[]): Part[] {
  const context = project.context;
  if (context.kind !== 'designedCabinet') return [];
  const longest = Math.max(project.plan.blank.stock?.height.mm ?? 0, project.plan.blank.stock?.width.mm ?? 0) || KICK_BOARD_MAX;
  const cabinets = cabinetsOf(project);
  const boards: Part[] = [];
  for (const run of context.runs) {
    const members = cabinets.filter((c) => c.runId === run.id);
    // A filler strip between the run's end and a wall: the board goes on under it.
    const fillers = runFit(context, run)?.fillers ?? [];
    const filler = (c: CabinetDesign, end: 'left' | 'right') => fillers.find((f) => f.cabinetId === c.id && f.end === end)?.width ?? 0;
    const span = (c: CabinetDesign) => filler(c, 'left') + c.size.width.mm + filler(c, 'right');
    // Stretches of neighbours that share the board, each no longer than the stock.
    let stretch: CabinetDesign[] = [];
    const close = () => {
      const first = stretch[0];
      if (!first) return;
      const width = stretch.reduce((sum, c) => sum + span(c), 0);
      const height = kickBoardHeight(first, materials);
      const t = thicknessOf(materials, first.materials.caseId);
      const n = boards.filter((b) => b.designObjectId === first.id).length;
      // Where the bottoms are raised (behind a face frame) the board is taller than the sides' notches: it is
      // notched round every side it crosses, the two at a join as one notch, with dog-bones.
      const sides: [number, number][] = [];
      let at = 0;
      for (const c of stretch) {
        const { box, shift } = boxOf(c, materials);
        const side = thicknessOf(materials, c.materials.caseId);
        const x0 = at + filler(c, 'left') + shift;
        sides.push([x0, x0 + side], [x0 + box.size.width.mm - side, x0 + box.size.width.mm]);
        at += span(c);
      }
      const outline = kickBoardOutline(width, height, toeKickOf(first).height, sides);
      boards.push(
        withGrain(
          {
            id: `${first.id}/toe-kick-run${n ? `-${n + 1}` : ''}`,
            designObjectId: first.id,
            name: stretch.length > 1 ? 'Toe kick, across the run' : 'Toe kick',
            materialId: first.materials.caseId,
            size: { width, height, thickness: t },
            features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline, ...(outline.length > 4 ? { dogBones: true } : {}) }],
            role: 'toeKick',
            placement: { origin: [-filler(first, 'left'), 0, -toeKickOf(first).depth], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
          },
          'toeKick',
          materials,
        ),
      );
      stretch = [];
    };
    for (const cabinet of members) {
      if (kickBoardOf(cabinet) !== 'acrossRun') {
        close();
        continue;
      }
      if (stretch.length && stretch.reduce((sum, c) => sum + span(c), 0) + span(cabinet) > longest + 1e-6) close();
      stretch.push(cabinet);
    }
    close();
  }
  return boards;
}

/**
 * The case parts of every designed cabinet in the project, with the holes its
 * hardware needs in the sides, and the parts of its face frame when it has one.
 */
export function deriveCabinetParts(project: Project, shop: Shop): Part[] {
  const hung = hungDesigns(project, shop);
  // The thickest door inset in the cabinet: its shelves stop behind it.
  const doorDepth = (cabinet: CabinetDesign) => {
    const doors = hung.filter(isDoorSet).filter((d) => d.mounting.type === 'inset' && d.mounting.openingId.startsWith(`${cabinet.id}/`));
    const thick = doors.map((d) => shop.materials.find((m) => m.id === d.materialId)?.measuredThickness.mm ?? 0);
    return thick.length ? Math.max(...thick) : undefined;
  };
  // Casters (milestone 9): each cabinet's share of its group's, as pilot holes in its doubled bottom.
  const casters = casterShares(casterGroups(project, shop.hardware), shop.materials);
  const parts = cabinetsOf(project).flatMap((cabinet) => [
    // An existing case: nothing of it is made, only what goes inside it.
    ...(cabinet.existing ? [] : madeCase(cabinet)),
    ...(deriveUnderSink(cabinet, shop.materials, shop.hardware)?.parts ?? []),
    // A false front's blocks, or the tray behind one that tips out.
    ...falseFrontParts(project, cabinet, shop.materials),
  ]);
  /** The case of a cabinet made here: its box, its face frame, and what stands under and beside it. */
  function madeCase(cabinet: CabinetDesign): Part[] {
    // Behind a face frame that overhangs its sides the box is narrower than the cabinet: derived as a cabinet of
    // its own, then stood where it is. The casters' holes are given from the cabinet's edge: from the box's here.
    const { box, shift } = boxOf(cabinet, shop.materials);
    const share = casters.get(cabinet.id);
    const boxShare = share && shift ? { ...share, holes: share.holes.map((h) => (h.kind === 'hole' ? { ...h, center: { ...h.center, x: h.center.x - shift } } : h)) } : share;
    return [
    // (Between corner posts the box's back members run on to the posts' rear faces, and the back stands between the posts.)
    ...postsBack([...shiftedParts(boxCase(box, boxShare), shift), ...deriveFaceFrameParts(cabinet, shop.materials)], cabinet, shop.materials),
    // Posts at its corners, from the floor to its top.
    ...(onLegs(cabinet) ? postParts(cabinet, shop.materials) : []),
    ...fillerParts(project, cabinet, shop.materials),
    ...backFillerParts(cabinet, shop.materials),
    ...blindCornerParts(project, cabinet, shop.materials),
    // A lazy susan made here, in a diagonal or an L-shaped corner cabinet.
    ...(deriveSusan(cabinet, shop.materials)?.parts ?? []),
    // A shelf from a closet tower to the wall, or to the next tower, each side.
    ...spanParts(cabinet, shop.materials),
    ];
  }
  /** The box itself, in its own frame: the case with its holes, and what is under it for casters. */
  function boxCase(cabinet: CabinetDesign, share: ReturnType<typeof casters.get>): Part[] {
    const made = [
    // A diagonal corner cabinet's case is its own; its hinge plates and shelf pins are drilled by hand (the plan says so).
    ...(cabinet.corner?.kind === 'diagonal'
      ? deriveDiagonalCaseParts(cabinet, shop.materials)
      : cabinet.corner?.kind === 'lShaped'
        ? deriveLShapedCaseParts(cabinet, shop.materials)
        : withPartitionHoles(withHardwareHoles(clearOfTabSlots(withPartitions(deriveCaseParts(cabinet, shop.materials, doorDepth(cabinet)), cabinet, shop.materials)), cabinet, project, shop), cabinet, project, shop)),
    ...casterLayerParts(cabinet, shop.materials, share),
    // A leg frame under it.
    ...(onLegs(cabinet) ? legFrameParts(cabinet, shop.materials) : []),
    ];
    // A solid wood strip on each front edge of a plywood case with no face frame.
    return [...made, ...edgeStripParts(made, cabinet, shop.materials)];
  }
  // The tops (milestone 7): each is the part of the first cabinet it covers.
  parts.push(...deriveTopParts(project, shop.materials));
  // The tables: pieces of their own kind, with their own parts.
  if (project.context.kind === 'designedCabinet') for (const frame of framesOf(project)) parts.push(...deriveFrameParts(frame, project.context, shop.materials));
  // One toe kick board across the cabinets of a run, in front of their sides.
  parts.push(...runKickBoards(project, shop.materials));
  // A one-row island's back shows (milestone 8): a finished panel over its cabinets' backs.
  parts.push(...islandBackParts(project, shop.materials));
  return [...withTags(project, parts), ...deriveHandleParts(project, shop)];
}

/**
 * The wooden handles the CNC cuts: one for every front whose handle is one (its holes
 * say which), every copy of a cabinet counted. The handle's side profile is the part's
 * outline, so the part is as thick as the handle is wide; it lies on the sheet with its
 * grain along its length.
 */
export function deriveHandleParts(project: Project, shop: Shop): Part[] {
  const wooden = shop.hardware.filter(isHandle).filter((h) => h.cnc);
  if (!wooden.length || !designsOf(project).some((d) => wooden.some((h) => h.id === d.handle?.handleId))) return [];
  return [...deriveParts(project, shop), ...deriveDrawerBoxParts(project, shop)].flatMap((front): Part[] => {
    const hole = front.features.find((f) => f.kind === 'hole' && f.id.startsWith(HANDLE_HOLE) && f.hardwareId);
    const handle = wooden.find((h) => hole?.kind === 'hole' && h.id === hole.hardwareId);
    if (!handle?.cnc) return [];
    const problems = printedHandleProblems(handle, shop.materials);
    if (problems.length) throw new Error(`${handle.name} cannot be made. ${problems.join(' ')}`);
    const material = shop.materials.find((m) => m.id === handle.cnc!.materialId);
    if (!material) throw new Error(`Material not found: ${handle.cnc.materialId}`);
    const half = handleLook(handle).length / 2;
    const outline = pullProfile(handle).map(([x, y]) => ({ x: x + half, y }));
    return [
      withGrain(
        {
          id: `${front.id}-handle`,
          designObjectId: front.designObjectId,
          name: `${front.name} handle`,
          materialId: material.id,
          size: { width: 2 * half, height: handleHeight(handle), thickness: material.measuredThickness.mm },
          features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline }],
          role: 'handle',
          handleId: handle.id,
          ...(front.tag !== undefined ? { tag: front.tag } : {}),
          ...(front.copy !== undefined ? { copy: front.copy } : {}),
        },
        'handle',
        shop.materials,
      ),
    ];
  });
}
