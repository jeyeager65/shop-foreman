/**
 * A false front: a drawer row's front with no box and no slides, as over a sink's doors (`DrawerDesign.falseFront`).
 * Only the top row of a case made here, a drawer row whole across its bay with doors under it (`CabinetOpening.overDoors`),
 * takes one; each bay has its own.
 *
 * Fixed, it is screwed from behind: to two blocks screwed to the case sides (frameless, inset), or through the face
 * frame's stiles (face frame, where the frame is what it closes against). Tipping out, it hangs on a pair of tilt-out
 * hinges and a shallow tray is screwed to its back, inside the opening; the tray tips with it, on the Doors slider.
 */
import type { CabinetDesign, CabinetOpening, DrawerDesign, Material, Mm, Part, PartMoves, Project, Vec3 } from '@/model';
import { MM_PER_INCH } from '@/units';
import { rect } from './doors';
import { isDrawer } from './drawers';
import { designsOf } from './frontSettings';
import { withGrain } from './grain';
import { DOOR_STANDOFF, deriveCabinetOpenings } from './openings';
import { obstacleBlocks } from './underSink';
import { constructionRules, thicknessOf } from './style';

/** Tune me: the sizes of a false front's blocks and tray. */
export const FALSE_FRONT = {
  /** A fixed front's blocks: how far back from the front they run, and how much shorter than the opening they are. */
  blockDepth: 1.5 * MM_PER_INCH,
  blockShort: MM_PER_INCH,
  /** The tray inside the opening: narrower than it, shorter than it, at most this tall, how deep it may be, and how far clear of what is behind it. */
  trayNarrower: MM_PER_INCH,
  trayTall: 3 * MM_PER_INCH,
  clear: MM_PER_INCH / 4,
  trayShorter: MM_PER_INCH / 2,
  trayDepth: { min: 1.5 * MM_PER_INCH, max: 4 * MM_PER_INCH, start: 2.5 * MM_PER_INCH },
  /** The tray's lip, at its back: no taller than this. */
  lip: 2 * MM_PER_INCH,
  /** How far it tips forward with the Doors slider all the way open. */
  tiltDeg: 20,
};

/** Whether a drawer is a false front: it asks to be, on an opening that can take one. */
export function isFalseFront(design: Pick<DrawerDesign, 'falseFront'>, opening: Pick<CabinetOpening, 'overDoors' | 'apron'> | undefined): boolean {
  return !!design.falseFront && !!opening?.overDoors && !opening.apron;
}

/** Where a false front's back face is, front to back, and its bottom edge, in the cabinet's frame. */
function frontBack(design: DrawerDesign, opening: CabinetOpening, materials: Material[]): { z: Mm; bottom: Mm } {
  const thick = thicknessOf(materials, design.front.materialId);
  // As `placeFronts` puts it: flush with the case front when inset, else standing off what it closes against.
  const face = opening.inFrame ? opening.frontPlane : opening.inset || opening.flush ? 0 : opening.frontPlane + DOOR_STANDOFF + thick;
  return { z: face - thick, bottom: opening.origin.y - design.mounting.overlayBottom.mm };
}

/** How a false front that tips out moves: about the line across its bottom edge, at its back face. */
export function falseFrontTilt(design: DrawerDesign, opening: CabinetOpening, materials: Material[]): PartMoves | undefined {
  if (!isFalseFront(design, opening) || !design.falseFront?.tiltOut) return undefined;
  const { z, bottom } = frontBack(design, opening, materials);
  return { kind: 'tilt', axis: [bottom, z] };
}

/** The false fronts on a cabinet, each with its opening. */
export function falseFrontsOf(project: Project, cabinet: CabinetDesign, materials: Material[]): { design: DrawerDesign; opening: CabinetOpening }[] {
  const openings = deriveCabinetOpenings(cabinet, materials);
  return designsOf(project)
    .filter(isDrawer)
    .flatMap((design) => {
      const opening = openings.find((o) => o.id === design.mounting.openingId);
      return opening && isFalseFront(design, opening) ? [{ design, opening }] : [];
    });
}

/**
 * What a cabinet's false fronts bring: a fixed one's two blocks, or a tilt-out one's tray, made shallower to clear what is
 * in the way behind it (the sink's bowl, the trap), or left out where it cannot (`falseFrontProblems` says why).
 */
export function falseFrontParts(project: Project, cabinet: CabinetDesign, materials: Material[]): Part[] {
  const fronts = falseFrontsOf(project, cabinet, materials);
  if (!fronts.length) return [];
  const rules = constructionRules(cabinet, materials);
  const blocks = cabinet.inside || cabinet.sink ? obstacleBlocks(cabinet, materials) : [];
  const parts: Part[] = [];
  const add = (id: string, name: string, materialId: string, size: Part['size'], origin: Vec3, xAxis: Vec3, yAxis: Vec3, moves?: PartMoves) => {
    const part: Part = {
      id: `${cabinet.id}/${id}`,
      designObjectId: cabinet.id,
      name,
      materialId,
      size,
      features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, size.width, size.height) }],
      role: 'pullOut',
      placement: { origin, xAxis, yAxis },
      ...(moves ? { moves } : {}),
    };
    parts.push(withGrain(part, 'pullOut', materials));
  };
  const [UP, RIGHT, BACK, FRONT]: [Vec3, Vec3, Vec3, Vec3] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];
  for (const { design, opening } of fronts) {
    const key = `false-front${opening.bay ? `-${opening.bay}` : ''}`;
    const named = (what: string) => (opening.bay ? `${what}, bay ${opening.bay}` : what);
    const back = frontBack(design, opening, materials);
    const tilt = design.falseFront?.tiltOut;
    if (!tilt) {
      // Behind a face frame it is screwed through the stiles: nothing to make.
      if (rules.hasFaceFrame) continue;
      const caseId = cabinet.materials.caseId;
      const t = thicknessOf(materials, caseId);
      const size = { width: FALSE_FRONT.blockDepth, height: opening.height - FALSE_FRONT.blockShort, thickness: t };
      const y = opening.origin.y + FALSE_FRONT.blockShort / 2;
      // On edge against each side inside the opening, from behind the front back; face A toward the middle.
      add(`${key}/block-left`, named('False front block, left'), caseId, size, [opening.origin.x + t, y, back.z], BACK, UP);
      add(`${key}/block-right`, named('False front block, right'), caseId, size, [opening.origin.x + opening.width - t, y, back.z - FALSE_FRONT.blockDepth], FRONT, UP);
      continue;
    }
    const [boxId, bottomId] = [design.box.materials.boxId, design.box.materials.bottomId];
    const [t, tB] = [thicknessOf(materials, boxId), thicknessOf(materials, bottomId)];
    const fit = tiltTrayFit(design, opening, back.z, blocks);
    if ('problem' in fit) continue;
    const { width, height, depth: deep, x0, y0, z0 } = fit;
    const moves = falseFrontTilt(design, opening, materials);
    const lip = Math.min(height, FALSE_FRONT.lip);
    add(`${key}/tray-bottom`, named('Tilt-out tray, bottom'), bottomId, { width: width - 2 * t, height: deep - tB, thickness: tB }, [x0 + t, y0 + tB, z0], RIGHT, BACK, moves);
    add(`${key}/tray-lip`, named('Tilt-out tray, lip'), bottomId, { width: width - 2 * t, height: lip, thickness: tB }, [x0 + t, y0, z0 - deep + tB], RIGHT, UP, moves);
    const end = { width: deep, height, thickness: t };
    add(`${key}/tray-end-left`, named('Tilt-out tray, left end'), boxId, end, [x0 + t, y0, z0], BACK, UP, moves);
    add(`${key}/tray-end-right`, named('Tilt-out tray, right end'), boxId, end, [x0 + width - t, y0, z0 - deep], FRONT, UP, moves);
  }
  return parts;
}

/** Where a false front's tilt-out tray goes, or why it cannot: its size and its corner (left, bottom, front), in the cabinet's frame. */
type TrayFit = { width: Mm; height: Mm; depth: Mm; x0: Mm; y0: Mm; z0: Mm; shallower?: true } | { problem: string };

/**
 * A tilt-out tray behind a false front, sized to it: 1" narrower and 1/2" shorter than its opening, at most 3" tall
 * (it is a trough, however tall the front), as deep as asked but no deeper than what is in the way behind it (the
 * sink's bowl, the trap) leaves, 1/4" clear. Too small a front, or too little room, and there is none: why, in words.
 */
function tiltTrayFit(design: DrawerDesign, opening: CabinetOpening, frontBackZ: Mm, blocks: { name: string; min: Vec3; max: Vec3 }[]): TrayFit {
  const asked = design.falseFront?.tiltOut?.depth.mm ?? FALSE_FRONT.trayDepth.start;
  const width = opening.width - FALSE_FRONT.trayNarrower;
  const height = Math.min(FALSE_FRONT.trayTall, opening.height - FALSE_FRONT.trayShorter);
  if (!(width >= 6 * MM_PER_INCH) || !(height >= 2 * MM_PER_INCH)) return { problem: 'This false front is too small for a tilt-out tray: it needs one at least 7" wide and 2-1/2" high.' };
  const [x0, y0, z0] = [opening.origin.x + (opening.width - width) / 2, opening.origin.y + FALSE_FRONT.trayShorter / 2, frontBackZ];
  // What stands behind it, across it and as high as it: the tray stops in front of the nearest.
  const behind = blocks.filter((b) => b.max[0] > x0 && b.min[0] < x0 + width && b.max[1] > y0 && b.min[1] < y0 + height && b.max[2] < z0);
  const room = behind.length ? z0 - Math.max(...behind.map((b) => b.max[2])) - FALSE_FRONT.clear : Infinity;
  const depth = Math.min(Math.max(FALSE_FRONT.trayDepth.min, Math.min(asked, FALSE_FRONT.trayDepth.max)), room);
  if (depth < FALSE_FRONT.trayDepth.min - 1e-6) {
    const near = behind.reduce((a, b) => (b.max[2] > a.max[2] ? b : a));
    return { problem: `There is no room for the tilt-out tray: ${near.name} stands ${Math.max(0, Math.round((z0 - near.max[2]) / MM_PER_INCH * 8) / 8)}" behind the false front, and a tray needs 1-1/2". Make the false front shorter, so the tray sits higher, or turn the tray off.` };
  }
  return { width, height, depth, x0, y0, z0, ...(depth < asked - 0.5 ? { shallower: true as const } : {}) };
}

/** What a cabinet's false fronts' trays cannot do, in sentences: none fits, or one is made shallower than asked to clear what is behind it. */
export function falseFrontProblems(project: Project, cabinet: CabinetDesign, materials: Material[], length: (mm: Mm) => string): { drawerId: string; words: string }[] {
  const blocks = cabinet.inside || cabinet.sink ? obstacleBlocks(cabinet, materials) : [];
  return falseFrontsOf(project, cabinet, materials).flatMap(({ design, opening }) => {
    if (!design.falseFront?.tiltOut) return [];
    const fit = tiltTrayFit(design, opening, frontBack(design, opening, materials).z, blocks);
    if ('problem' in fit) return [{ drawerId: design.id, words: fit.problem }];
    return fit.shallower ? [{ drawerId: design.id, words: `The tilt-out tray is made ${length(fit.depth)} deep, not ${length(design.falseFront.tiltOut.depth.mm)}: that is all the room in front of what stands behind it.` }] : [];
  });
}