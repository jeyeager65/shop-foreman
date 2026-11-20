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
  /** The tray inside the opening: narrower than it, shorter than it, and how deep it may be. */
  trayNarrower: MM_PER_INCH,
  trayShorter: MM_PER_INCH / 2,
  trayDepth: { min: 1.5 * MM_PER_INCH, max: 4 * MM_PER_INCH, start: 2.5 * MM_PER_INCH },
  /** The tray's lip, at its back: no taller than this. */
  lip: 2 * MM_PER_INCH,
  /** How far it tips forward with the Doors slider all the way open. */
  tiltDeg: 20,
};

/** Whether a drawer is a false front: it asks to be, on an opening that can take one. */
export function isFalseFront(design: Pick<DrawerDesign, 'falseFront'>, opening: Pick<CabinetOpening, 'overDoors'> | undefined): boolean {
  return !!design.falseFront && !!opening?.overDoors;
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
 * What a cabinet's false fronts bring: a fixed one's two blocks, or a tilt-out one's tray. A tray that would run into
 * something in the way under the sink (its bowl, its trap) throws.
 */
export function falseFrontParts(project: Project, cabinet: CabinetDesign, materials: Material[]): Part[] {
  const fronts = falseFrontsOf(project, cabinet, materials);
  if (!fronts.length) return [];
  const rules = constructionRules(cabinet, materials);
  const blocks = cabinet.inside ? obstacleBlocks(cabinet, materials) : [];
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
    const width = opening.width - FALSE_FRONT.trayNarrower;
    const height = opening.height - FALSE_FRONT.trayShorter;
    const deep = tilt.depth.mm;
    if (!(width >= 6 * MM_PER_INCH) || !(height >= 2 * MM_PER_INCH) || !(deep >= FALSE_FRONT.trayDepth.min - 1e-6) || deep > FALSE_FRONT.trayDepth.max + 1e-6) {
      throw new Error('A tilt-out tray needs a false front at least 7" wide and 2-1/2" high, and is 1-1/2" to 4" from front to back.');
    }
    const [x0, y0, z0] = [opening.origin.x + (opening.width - width) / 2, opening.origin.y + FALSE_FRONT.trayShorter / 2, back.z];
    const hit = blocks.filter((b) => b.max[0] > x0 && b.min[0] < x0 + width && b.max[1] > y0 && b.max[2] > z0 - deep);
    if (hit.length) throw new Error(`${hit[0]!.name.charAt(0).toUpperCase()}${hit[0]!.name.slice(1)} comes too far forward for the tilt-out tray behind the false front: make the tray shallower.`);
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
