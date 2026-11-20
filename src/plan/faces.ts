import { partFaces } from '@/design/faces';
import { partTitle } from '@/design/tags';
import type { Part, Setup, SetupFaces } from '@/model';

/** "inside face up", "underside up". */
const phrase = (face: string) => (face === 'Underside' ? 'underside up' : `${face.toLowerCase()} face up`);

/**
 * Which face of each part is up in a setup, in the parts' own words: a side lies
 * inside face up, a door back face up. On a blank that is not flipped a part may lie
 * the other way up than its neighbours; then the faces differ and each is listed.
 */
export function setupFaces(setup: Setup, parts: Part[]): SetupFaces {
  const groups: SetupFaces['groups'] = [];
  for (const placed of setup.placements) {
    const part = parts.find((p) => p.id === placed.partId);
    if (!part) continue;
    const face = partFaces(part)[placed.mirrored ? 'B' : 'A'];
    const group = groups.find((g) => g.face === face);
    if (group) group.parts.push(partTitle(part));
    else groups.push({ face, up: phrase(face), parts: [partTitle(part)] });
  }
  // Nothing placed (the scrap test): the setup's own face.
  if (groups.length === 0) return { summary: phrase(setup.faceUp === 'B' ? 'Back' : 'Front'), mixed: false, groups };
  if (groups.length === 1) return { summary: groups[0]!.up, mixed: false, groups };
  return {
    summary: 'faces differ',
    mixed: true,
    groups,
    detail: groups.map((g) => `${g.parts.join(', ')} ${g.up}`).join('; '),
  };
}
