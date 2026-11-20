/**
 * The face frame of a designed cabinet as parts: two stiles the full height of the
 * frame and the rails between them, one above the openings, one below, and one
 * between each two rows. The frame covers the case front from the top of the toe
 * kick to the top of the case, flush at the sides.
 *
 * It is joined with pocket screws and glue: the holes are in the back of the rails,
 * into the stiles. The holes that attach it to the case are in the case parts
 * (`case.ts`). A frameless cabinet has no frame and gets no parts from here.
 */
import type { CabinetDesign, Material, Mm, Part } from '@/model';
import { rect } from './doors';
import { withGrain } from './grain';
import { frontWidth } from './diagonal';
import { openingSides, deriveCabinetOpenings, wholeOpenings } from './openings';
import { pocketRow, railEndPositions } from './pocketHoles';
import { boxOf, constructionRules, postsOf, thicknessOf, toeKickOf } from './style';
import { insideDepth } from './case';

export function deriveFaceFrameParts(cabinet: CabinetDesign, materials: Material[]): Part[] {
  const rules = constructionRules(cabinet, materials);
  if (!rules.hasFaceFrame) return [];

  // A diagonal corner cabinet's frame is on its diagonal front.
  const W = frontWidth(cabinet);
  const H = cabinet.size.height.mm;
  const bottom = toeKickOf(cabinet).height;
  // Between corner posts (`postsOf`) the posts are the stiles. The top and the bottom rails stand upright as ever, flush with
  // the posts' faces; a rail between two rows lies flat: as deep as a post, showing its thickness (`mid`).
  const posts = postsOf(cabinet, materials);
  const stile = posts ? posts.leg : cabinet.faceFrame.stileWidth.mm;
  const rail = cabinet.faceFrame.railWidth.mm;
  const mid = posts ? posts.rail : rail;
  const materialId = cabinet.faceFrame.materialId;
  const t = posts ? posts.leg : thicknessOf(materials, materialId);
  // The rails run the frame's width: one bay's rows place them (the mullions come between bays).
  const every = deriveCabinetOpenings(cabinet, materials);
  const openings = wholeOpenings(every).filter((o) => (o.bay ?? 1) === 1);
  // A blind corner cabinet's stile on its blind side is as wide as the blind.
  const sides = openingSides(cabinet, stile, true);
  const between = W - sides.left - sides.right;

  // Face A is the front; the frame stands on the case front, its back against it.
  const part = (key: string, name: string, role: 'frameStile' | 'frameRail', x: Mm, y: Mm, width: Mm, height: Mm): Part =>
    posts && !/-rail-(top|bottom)(-b\d+)?$/.test(key) ? flat(key, name, role, x, y, width, height) : upright(key, name, role, x, y, width, height);
  /** How thick an upright part is: the frame's material. (`t` is how deep the frame is: a post, between posts.) */
  const tUp = posts ? posts.rail : t;
  /** Between posts: a rail lying flat, its face A up; a mullion on edge, its face A to the right. Pocket screws from under a rail, and from a mullion's left face. */
  const flat = (key: string, name: string, role: 'frameStile' | 'frameRail', x: Mm, y: Mm, width: Mm, height: Mm): Part => {
    const rails = role === 'frameRail';
    const size = rails ? { width, height: t, thickness: height } : { width: t, height, thickness: width };
    return withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId,
        size,
        features: [
          { id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, size.width, size.height) },
          ...(rails ? [...pocketRow('pocket-left', 'B', 'x0', railEndPositions(t)), ...pocketRow('pocket-right', 'B', 'x1', railEndPositions(t))] : []),
        ],
        role,
        placement: rails ? { origin: [x, y + height, t], xAxis: [1, 0, 0], yAxis: [0, 0, -1] } : { origin: [x + width, y, t], xAxis: [0, 0, -1], yAxis: [0, 1, 0] },
      },
      role,
      materials,
    );
  };
  const upright = (key: string, name: string, role: 'frameStile' | 'frameRail', x: Mm, y: Mm, width: Mm, height: Mm): Part =>
    withGrain(
      {
        id: `${cabinet.id}/${key}`,
        designObjectId: cabinet.id,
        name,
        materialId,
        size: { width, height, thickness: tUp },
        features: [
          { id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, width, height) },
          // Pocket screws through the back of each rail end into the stile beside it.
          ...(role === 'frameRail' ? [...pocketRow('pocket-left', 'B', 'x0', railEndPositions(height)), ...pocketRow('pocket-right', 'B', 'x1', railEndPositions(height))] : []),
        ],
        role,
        placement: { origin: [x, y, t], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
      },
      role,
      materials,
    );

  // A rail sits on top of every opening but the highest, under the opening above it.
  const middles = openings.slice(1).map((o) => o.origin.y + o.height);
  // (Between posts a mullion on edge meets the upright rails only at their thickness: one screw there, at each end.)
  const mullionScrews = posts ? [posts.rail / 2] : undefined;
  // Bays (milestone 10): a mullion between two, from the bottom rail to the top rail; the middle
  // rails run between the stiles and mullions, one per bay.
  const bays = wholeOpenings(every).filter((o) => o.rowId === cabinet.layout.rows[0]!.id);
  // A split row (`OpeningRow.split`): a short mullion between two of its drawers, from the rail under them to the rail over them.
  const shorts = every.filter((o) => o.part && o.part.n < o.part.of).map((o) => ({ key: `frame-mullion-${o.rowId}${o.bay && o.bay > 1 ? `-b${o.bay}` : ''}-${o.part!.n}`, x: o.origin.x + o.width, y: o.origin.y, height: o.height }));
  const shortWidth = shorts.length ? (every.find((o) => o.part && o.part.n === 2)!.origin.x - every.find((o) => o.part && o.part.n === 1)!.origin.x - every.find((o) => o.part)!.width) : 0;
  const spans = bays.length > 1 ? bays.map((o) => ({ x: o.origin.x, width: o.width })) : [{ x: sides.left, width: between }];
  const mullions = bays.slice(0, -1).map((o, i) => ({ x: o.origin.x + o.width, width: bays[i + 1]!.origin.x - o.origin.x - o.width }));
  const tCase = thicknessOf(materials, cabinet.materials.caseId);
  /** From the case front to the front face of its back: the box's, which may be shallower than the cabinet. */
  const inside = shorts.length || (posts && mullions.length) ? insideDepth(boxOf(cabinet, materials).box, materials) : 0;
  const name = (base: string, i: number, b: number) => `${middles.length > 1 ? `${base} ${i + 1}` : base}${spans.length > 1 ? `, bay ${b + 1}` : ''}`;
  return [
    // (Between corner posts the posts are the stiles: `postParts`.)
    ...(posts ? [] : [part('frame-stile-left', 'Left stile', 'frameStile', 0, bottom, sides.left, H - bottom), part('frame-stile-right', 'Right stile', 'frameStile', W - sides.right, bottom, sides.right, H - bottom)]),
    part('frame-rail-top', 'Top rail', 'frameRail', sides.left, H - rail, between, rail),
    ...middles.flatMap((y, i) => spans.map((s, b) => part(b === 0 ? `frame-rail-mid-${i + 1}` : `frame-rail-mid-${i + 1}-b${b + 1}`, name('Middle rail', i, b), 'frameRail', s.x, y, s.width, mid))),
    part('frame-rail-bottom', 'Bottom rail', 'frameRail', sides.left, bottom, between, rail),
    ...mullions.map((m, i) => mullion(`frame-mullion-${i + 1}`, mullions.length > 1 ? `Mullion ${i + 1}` : 'Mullion', m.x, bottom + rail, m.width, H - rail - (bottom + rail))),
    // A split row's drawers. Between corner posts one solid board stands between two of them, from the frame's face to
    // the back, as on a wide dresser. Elsewhere a short mullion, and behind it at the back a bare board
    // like it for the slides' back ends, from the case's floor to its top.
    ...(posts
      ? shorts.map((m, i) => divider(m, i))
      : [
          ...shorts.map((m, i) => mullion(m.key, shorts.length > 1 ? `Short mullion ${i + 1}` : 'Short mullion', m.x, m.y, shortWidth, m.height)),
          ...shorts.map((m, i): Part => {
            const made = part(m.key.replace('frame-mullion', 'slide-upright'), shorts.length > 1 ? `Slide upright, back ${i + 1}` : 'Slide upright, back', 'frameStile', m.x, tCase, shortWidth, H - 2 * tCase);
            return { ...made, role: 'buildOut', placement: { ...made.placement!, origin: [made.placement!.origin[0], made.placement!.origin[1], -inside + tUp] } };
          }),
        ]),
    // Between corner posts no panel stands behind a mullion: two more uprights like it do, half-way back and at the
    // back, tied along their tops; the slides are screwed to the three. The middle one runs down to the floor as a
    // narrow leg where the project asks for legs in the middle.
    ...(posts ? mullions.flatMap((m, i) => bayUprights(m, i)) : []),
  ];

  /** The solid board between two drawers of a split row, between posts: on edge, from the frame's face to the back (the panel between the back posts); in the top row it rises behind the top rail to the front stretcher, notched round the rail. */
  function divider(m: { key: string; x: Mm; y: Mm; height: Mm }, i: number): Part {
    const topRow = Math.abs(m.y + m.height - (H - rail)) < 1e-6;
    const full = topRow ? H - tCase - m.y : m.height;
    // To the back itself, so the board between the drawers is fastened to something: in
    // the top row to the back stretcher's inside face, screwed into its end through the stretcher before the back
    // goes on; in a lower row to the back panel.
    // The back panel is on the very back (`postsBack`); in the top row the back stretcher stands on edge in front of it.
    const onEdge = cabinet.caseTop !== 'panel' && cabinet.joinery.backStretcherForm === 'nailer';
    const toBack = cabinet.size.depth.mm - thicknessOf(materials, cabinet.materials.backId) - (topRow && onEdge ? tCase : 0);
    const length = t + toBack;
    const outline = topRow
      ? [{ x: 0, y: 0 }, { x: length, y: 0 }, { x: length, y: full }, { x: posts!.rail, y: full }, { x: posts!.rail, y: m.height }, { x: 0, y: m.height }]
      : rect(0, 0, length, full);
    return withGrain(
      {
        id: `${cabinet.id}/${m.key.replace('frame-mullion', 'drawer-divider')}`,
        designObjectId: cabinet.id,
        name: shorts.length > 1 ? `Drawer divider ${i + 1}` : 'Drawer divider',
        materialId,
        size: { width: length, height: full, thickness: shortWidth },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline }],
        role: 'frameStile',
        // On edge, its face A to the right: from the frame's face back.
        placement: { origin: [m.x + shortWidth, m.y, t], xAxis: [0, 0, -1], yAxis: [0, 1, 0] },
      },
      'frameStile',
      materials,
    );
  }

  /** Behind a bay's mullion, between posts: an upright half-way back and one at the back, and the tie along their tops, under the stretchers. */
  function bayUprights(m: { x: Mm; width: Mm }, i: number): Part[] {
    const nth = mullions.length > 1 ? ` ${i + 1}` : '';
    const top = H - tCase - posts!.rail;
    const upright = (key: string, name: string, role: 'leg' | 'buildOut', from: Mm, zFront: Mm): Part => {
      const made = flat(key, name, 'frameStile', m.x, from, m.width, top - from);
      return { ...made, role, placement: { ...made.placement!, origin: [made.placement!.origin[0], from, zFront] } };
    };
    const toFloor = !!cabinet.toeKick.legs?.middle;
    const tie = withGrain(
      {
        id: `${cabinet.id}/divider-tie-${i + 1}`,
        designObjectId: cabinet.id,
        name: `Divider tie${nth}`,
        materialId,
        size: { width: inside, height: t, thickness: posts!.rail },
        features: [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, inside, t) }],
        role: 'buildOut' as const,
        // Lying flat under the stretchers, its length from the back to the case front.
        placement: { origin: [m.x + m.width / 2 - t / 2, H - tCase, -inside], xAxis: [0, 0, 1], yAxis: [1, 0, 0] },
      },
      'buildOut',
      materials,
    );
    return [
      upright(`divider-upright-middle-${i + 1}`, toFloor ? `Leg, middle${nth}` : `Divider upright, middle${nth}`, toFloor ? 'leg' : 'buildOut', toFloor ? -posts!.under : cabinet.noBottom ? 0 : tCase, -inside / 2 + t / 2),
      upright(`divider-upright-back-${i + 1}`, `Divider upright, back${nth}`, 'buildOut', tCase, -inside + t),
      tie,
    ];
  }

  /** A mullion: a stile between the rails, pocket screwed through its back at each end into them. */
  function mullion(key: string, name: string, x: Mm, y: Mm, width: Mm, height: Mm): Part {
    const made = part(key, name, 'frameStile', x, y, width, height);
    return { ...made, features: [...made.features, ...pocketRow('pocket-bottom', 'B', 'y0', mullionScrews ?? railEndPositions(width)), ...pocketRow('pocket-top', 'B', 'y1', mullionScrews ?? railEndPositions(width))] };
  }
}
