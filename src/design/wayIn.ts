/**
 * Through the opening: what is made for the inside of a cabinet has to go in through
 * its door opening, and in a cabinet that is already there, round what is in the way. Each tray, the tray
 * frame and the shelf is checked, and the answer is a sentence for Design and for Build's checklist:
 *
 * - a tray goes in assembled, straight, when it is no wider and no higher than the opening;
 * - the frame goes in assembled when it passes the opening and nothing stands in the path of its standards,
 *   rails and tie as it is slid back on the floor; else without its tie, or screwed together inside;
 * - the shelf goes in flat when it is no wider than the opening. Wider (behind a face frame), it is tilted,
 *   one end low, as far as the opening asks; round a block its notch must still pass tilted that far.
 *
 * Derived; never stored. Loose boards (strips, cleats, standards on the shelf) always pass and are not listed.
 */
import type { CabinetDesign, Hardware, Material, Mm, Part, Vec3 } from '@/model';
import { partBox } from './cabinetAssembly';
import { deriveCabinetOpenings } from './openings';
import { PLUMBING_CLEAR, deriveUnderSink, isTrayPart, trayOf, type ObstacleBlock } from './underSink';

export interface WayIn {
  /** "Bottom tray", "The tray frame", "The shelf". */
  what: string;
  /** Assembled and straight in; flat; tilted; in pieces, put together inside; or not at all. */
  how: 'assembled' | 'flat' | 'tilted' | 'inside' | 'no';
  /** The whole sentence. */
  words: string;
}

type Box = { min: Vec3; max: Vec3 };
const union = (boxes: Box[]): Box => ({
  min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))) as Vec3,
  max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!))) as Vec3,
});
const names = (blocks: ObstacleBlock[]) => {
  const all = [...new Set(blocks.map((b) => b.name))];
  return all.length < 2 ? (all[0] ?? '') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
};

/**
 * How far a board `w` wide and `t` thick must be tilted, one end low, to pass an opening `W` wide and `H`
 * high: the least angle in degrees, 0 when it passes flat, undefined when it never does.
 */
export function tiltToPass(w: Mm, t: Mm, W: Mm, H: Mm): number | undefined {
  for (let deg = 0; deg < 90; deg += 0.5) {
    const a = (deg * Math.PI) / 180;
    if (w * Math.cos(a) + t * Math.sin(a) <= W + 1e-6) return w * Math.sin(a) + t * Math.cos(a) <= H + 1e-6 ? deg : undefined;
  }
  return undefined;
}

/** How each thing made for the inside of a cabinet goes in. Nothing for a cabinet with nothing inside. */
export function deriveWayIn(cabinet: CabinetDesign, materials: Material[], hardware: Hardware[], length: (mm: Mm) => string): WayIn[] {
  const build = deriveUnderSink(cabinet, materials, hardware);
  if (!build?.parts.length) return [];
  const opening = deriveCabinetOpenings(cabinet, materials)
    .filter((o) => o.use === 'doors')
    .at(-1)!;
  const [W, H] = [opening.width, opening.height];
  const through = `the door opening (${length(W)} × ${length(H)})`;
  // Only in a cabinet that is already there is anything in the way when things go in.
  const blocks = cabinet.existing ? build.obstacles : [];
  /** The blocks in the path of a box slid straight back to its place from the front. */
  const inPath = (box: Box) => blocks.filter((b) => b.max[0] > box.min[0] + 0.01 && b.min[0] < box.max[0] - 0.01 && b.max[1] > box.min[1] + 0.01 && b.min[1] < box.max[1] - 0.01 && b.max[2] > box.min[2] + 0.01);
  const size = (box: Box) => ({ width: box.max[0] - box.min[0], height: box.max[1] - box.min[1] });
  const passes = (box: Box) => size(box).width <= W + 1e-6 && size(box).height <= H + 1e-6;
  const sized = (box: Box) => `${length(size(box).width)} wide × ${length(size(box).height)} high`;
  const out: WayIn[] = [];

  // The trays: a tray is cut round what is in its way, so its own path is clear.
  const trays = new Map<string, Part[]>();
  for (const p of build.parts) if (isTrayPart(p)) trays.set(trayOf(p), [...(trays.get(trayOf(p)) ?? []), p]);
  for (const parts of trays.values()) {
    const what = parts[0]!.name.split(',')[0]!;
    const box = union(parts.map(partBox));
    if (passes(box)) out.push({ what, how: 'assembled', words: `${what}: goes in assembled, ${sized(box)} through ${through}.` });
    else out.push({ what, how: 'no', words: `${what}: does not go in. Assembled it is ${sized(box)}, more than ${through}, and a tray cannot be put together inside.` });
  }

  // The frames: the one under the trays from side to side, and a pull-out's own.
  const frames = new Map<string, Part[]>();
  for (const p of build.parts) {
    const key = /\/sink-((?:[^/]+-)?frame)\//.exec(p.id)?.[1];
    if (key) frames.set(key, [...(frames.get(key) ?? []), p]);
  }
  for (const [key, frame] of frames) {
    const what = key === 'frame' ? 'The tray frame' : `The ${frame[0]!.name.split(',')[0]!.toLowerCase()}`;
    if (key.startsWith('blind')) {
      // It stands across the cabinet in the blind half: in on edge, then turned and laid down.
      const dims = [0, 1, 2].map((k) => union(frame.map(partBox)).max[k]! - union(frame.map(partBox)).min[k]!).sort((a, b) => a - b);
      const fits = dims[0]! <= Math.min(W, H) + 1e-6 && dims[1]! <= Math.max(W, H) + 1e-6;
      out.push(fits ? { what, how: 'tilted', words: `${what}: goes in assembled on its edge, ${length(dims[0]!)} × ${length(dims[1]!)} through ${through}, and is laid down in the blind half.` } : { what, how: 'inside', words: `${what}: does not pass ${through} assembled. Put its parts in one at a time and screw it together inside the cabinet.` });
      continue;
    }
    const tie = frame.find((p) => p.id.endsWith('/tie'));
    const rest = frame.filter((p) => p !== tie);
    const box = union(frame.map(partBox));
    const blockedRest = rest.flatMap((p) => inPath(partBox(p)));
    const blockedTie = tie ? inPath(partBox(tie)) : [];
    if (!passes(box)) out.push({ what, how: 'inside', words: `${what}: does not pass ${through} assembled (it is ${sized(box)}). Put its parts in one at a time and screw it together inside the cabinet, squared against the cabinet's front.` });
    else if (blockedRest.length) out.push({ what, how: 'inside', words: `${what}: cannot be slid in assembled, ${names(blockedRest)} is in its way. Put its parts in one at a time and screw it together inside the cabinet, squared against the cabinet's front.` });
    else if (blockedTie.length) out.push({ what, how: 'inside', words: `${what}: goes in assembled without its tie (${names(blockedTie)} is in the tie's way), ${sized(union(rest.map(partBox)))} through ${through}. Screw the tie on once the frame is in its place.` });
    else out.push({ what, how: 'assembled', words: `${what}: goes in assembled, ${sized(box)} through ${through}, and is slid back on the cabinet's floor.` });
  }

  // The blind corner tray and its frame: in on edge, the long way first, and laid down inside.
  const turned = new Map<string, Part[]>();
  for (const p of build.parts) {
    const key = /\/sink-(blind[^/]*)\//.exec(p.id)?.[1];
    if (key && !key.endsWith('-frame')) turned.set(key, [...(turned.get(key) ?? []), p]);
  }
  for (const parts of turned.values()) {
    const what = parts[0]!.name.split(',')[0]!;
    const box = union(parts.map(partBox));
    const dims = [0, 1, 2].map((k) => box.max[k]! - box.min[k]!).sort((a, b) => a - b);
    const fits = dims[0]! <= Math.min(W, H) + 1e-6 && dims[1]! <= Math.max(W, H) + 1e-6;
    if (fits) out.push({ what, how: 'tilted', words: `${what}: goes in assembled on its edge, ${length(dims[0]!)} × ${length(dims[1]!)} through ${through}, and is laid flat inside and hung on its slides.` });
    else out.push({ what, how: 'no', words: `${what}: does not go in. On its edge it is ${length(dims[0]!)} × ${length(dims[1]!)}, more than ${through}.` });
  }

  // The fixed shelves.
  for (const shelf of build.parts.filter((p) => p.role === 'shelf')) {
    const what = shelf.name === 'Fixed shelf' ? 'The shelf' : shelf.name;
    const box = partBox(shelf);
    const [w, t] = [shelf.size.width, shelf.size.thickness];
    const tilt = tiltToPass(w, t, W, H);
    // What passes through the board: its notches go round them as it is slid back.
    const round = blocks.filter((b) => b.min[1] < box.max[1] && b.max[1] > box.min[1] && b.max[0] > box.min[0] && b.min[0] < box.max[0] && b.max[2] > box.min[2]);
    const back = round.length ? `, and slide it back round ${names(round)}` : '';
    if (tilt === 0) out.push({ what, how: 'flat', words: `${what}: goes in flat, ${length(w)} wide through ${through}${back}.` });
    else if (tilt === undefined) out.push({ what, how: 'no', words: `${what}: does not go in. It is ${length(w)} wide and ${through} is too small for it even tilted. Cut it in two from front to back and join the halves inside on a strip screwed under them.` });
    else {
      // Tilted, a notch is narrower round an upright block by the cosine, and the board's thickness takes more.
      const a = (tilt * Math.PI) / 180;
      const caught = round.filter((b) => {
        const across = b.max[0] - b.min[0];
        return (across + 2 * PLUMBING_CLEAR) * Math.cos(a) - t * Math.sin(a) < across;
      });
      if (caught.length) out.push({ what, how: 'no', words: `${what}: does not go in in one piece. It is ${length(w)} wide and has to be tilted ${Math.ceil(tilt)}° to pass ${through}, and tilted that far its notch does not go round ${names(caught)}. Cut it in two from front to back through the notch and join the halves inside on a strip screwed under them.` });
      else out.push({ what, how: 'tilted', words: `${what}: is ${length(w)} wide, more than ${through}. Tilt it ${Math.ceil(tilt)}°, one end low, to pass it in, level it inside${back}.` });
    }
  }
  return out;
}
