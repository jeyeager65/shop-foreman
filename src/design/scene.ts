import { materialLook } from '@/libraries';
import type { ApplianceKind, Caster, DesignedCabinetContext, Finish, Hardware, Material, MaterialGroup, Part, Project, Shop, Vec3 } from '@/model';
import { applianceShapes } from './appliances';
import { type SlideMount, cabinetBack } from './cabinetAssembly';
import { boxOffFloor, casterGroups, casterShares } from './casters';
import { slideMountsOf } from './drawerBox';
import { type FinishGroup, finishesOf } from './finish';
import { deriveCabinetParts, deriveDrawerBoxParts, deriveParts } from './index';
import { cabinetGroupKey, inRoom, layOutCabinets, layoutProblems, pastCeiling, placeGroups, runPlacementsOf } from './room';
import { runFit } from './runs';
import { existingShellParts } from './existingShell';
import { traySlideMounts } from './underSink';
import { susanShapes } from './susan';
import { hubShapes } from './hub';
import { cabinetsOf, framesOf } from './settings';
import { cabinetIdOf, cabinetTags, tagged } from './tags';
import { frameLeafShapes } from './frame';
import { shownTopParts, sinkShapes, stoolShapes } from './tops';
import { rodShapes } from './closet';
import { onTopOffset, topHeightOf, underOf } from './standsOn';

/**
 * A whole project of cabinets as the 3D view draws it (`CabinetAssemblyView`'s props): every cabinet
 * once, where it stands (in its room when the project has one), with its tops, appliances, casters,
 * slides, finish and the look of its materials. For a picture of a project away from Design: beside
 * Setup's answers, and on the Projects page. Design's own whole-project view is built the same way
 * (`CabinetDesignView.vue`), cabinet by cabinet as they are edited.
 */
import { type PartFinishes, faceFinishes } from './finishFaces';
import { type ShownRoom, shownRoom } from './roomLook';

export interface ProjectScene {
  parts: Part[];
  cabinets: { id: string; at: Vec3; turn?: number; partIds: string[] }[];
  room?: ShownRoom;
  hardware: Hardware[];
  finish: Partial<Record<FinishGroup, Finish>>;
  /** What each face of each part is finished in (`faceFinishes`). */
  faces: Record<string, PartFinishes>;
  slides: SlideMount[];
  casters: { cabinetId: string; x: number; behind: number; locking: boolean; caster: Caster }[];
  appliances: { partId: string; kind: ApplianceKind; kick?: { height: number; face: number } }[];
  looks: Record<string, NonNullable<MaterialGroup['look']>>;
}

/**
 * The scene of a project of cabinets, or why it cannot be drawn. `shop` is the shop as the project's
 * job sees it (`shopFor`); `groups` the shop's material types, for how each material looks.
 */
export function projectScene(project: Project, shop: Shop, groups?: MaterialGroup[]): ProjectScene | { error: string } {
  if (project.context.kind !== 'designedCabinet') return { error: 'Not a project of cabinets.' };
  const context: DesignedCabinetContext = project.context;
  const materials = shop.materials;
  const hardware = shop.hardware;
  try {
    let boxes: Part[] = [];
    try {
      boxes = deriveDrawerBoxParts(project, shop);
    } catch {
      // A box that cannot be made is left out of the picture.
    }
    const blocks = materials[0] ? applianceShapes(project, materials[0].id) : [];
    const basins = sinkShapes(project, materials, hardware);
    // A cabinet made several times is drawn once; bought and measured tops are slabs for the picture only, as is the shell of an existing case.
    const parts = [...deriveCabinetParts(project, shop), ...existingShellParts(project, shop), ...boxes, ...deriveParts(project, shop), ...shownTopParts(project, materials, hardware), ...framesOf(project).flatMap((f) => frameLeafShapes(f, context, materials)), ...rodShapes(project, materials), ...stoolShapes(project, materials), ...basins, ...blocks.map((a) => a.part), ...susanShapes(cabinetsOf(project), materials), ...cabinetsOf(project).flatMap((c) => hubShapes(c, materials))].filter(
      (p) => (p.copy ?? 1) === 1,
    );

    const cabinets = cabinetsOf(project);
    const cabinetOf = cabinetIdOf(project);
    const partsOf = (id: string) => parts.filter((p) => cabinetOf(p.id) === id);
    const filler = (id: string, end: 'left' | 'right') => parts.find((p) => p.id === `${id}/filler-${end}`)?.size.width;
    const laid = cabinets.map((c) => ({
      id: c.id,
      width: c.size.width.mm,
      // How far behind its front its rearmost case part is: what touches the wall.
      back: cabinetBack(partsOf(c.id)),
      form: c.form,
      offFloor: boxOffFloor(c, materials, hardware),
      runId: c.runId,
      fillerLeft: filler(c.id, 'left'),
      fillerRight: filler(c.id, 'right'),
      ...(c.placement ? { placement: c.placement } : {}),
      ...(c.corner?.kind === 'diagonal' ? { diagonal: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
      ...(c.corner?.kind === 'lShaped' ? { lShaped: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
    }));
    // A table stands like a cabinet in no run: its front edge is its top's.
    const frames = framesOf(project);
    laid.push(...frames.map((f) => ({ id: f.id, width: f.size.width.mm, back: f.size.depth.mm, form: 'base' as const, offFloor: 0, runId: undefined, fillerLeft: undefined, fillerRight: undefined, ...(f.placement ? { placement: f.placement } : {}) })));
    const { placements, aligned } = runPlacementsOf(context.runs, context);
    const places = layOutCabinets(context.room, laid, placements, aligned);

    // A piece that stands on another: on its top, as high as that is now, their backs and left ends in line.
    for (const c of cabinets) {
      const under = underOf(context, c);
      const below = under && places.get(under.id);
      if (!under || !below) continue;
      const at = inRoom(below.at, below.turn, onTopOffset(c, under));
      places.set(c.id, { at: [at[0], topHeightOf(project, under, materials, hardware), at[2]], turn: below.turn });
    }
    const r = context.room;
    const kindOf = new Map((context.appliances ?? []).map((a) => [a.id, a.kind]));
    let casters: ProjectScene['casters'] = [];
    try {
      casters = [...casterShares(casterGroups(project, hardware), materials).entries()].flatMap(([cabinetId, share]) => share.casters.map((c) => ({ cabinetId, ...c })));
    } catch {
      // Casters that cannot be placed are left out of the picture.
    }
    const placed = [
      ...cabinets.map((c) => ({ id: c.id, ...places.get(c.id)!, partIds: partsOf(c.id).map((p) => p.id) })),
      ...frames.map((f) => ({ id: f.id, ...places.get(f.id)!, partIds: partsOf(f.id).map((p) => p.id) })),
      ...blocks.map((a) => ({ id: a.id, at: a.at, turn: a.turn, partIds: [a.part.id] })),
    ];
    return {
      parts,
      cabinets: placed,
      // (No tile behind a table or a desk.)
      ...(r ? { room: shownRoom(r, parts, placed, new Set(frames.map((f) => f.id))) } : {}),
      hardware,
      finish: finishesOf(project, shop),
      faces: faceFinishes(project, parts),
      slides: [...slideMountsOf(project, shop), ...traySlideMounts(cabinetsOf(project), shop)],
      casters,
      appliances: [
        ...blocks.map((a) => ({ partId: a.part.id, kind: kindOf.get(a.id)!, ...(a.kick ? { kick: a.kick } : {}) })),
        ...parts.filter((p) => p.id.includes('/appliance-') && p.id.endsWith('/shape')).map((p) => ({ partId: p.id, kind: 'sink' as const })),
      ],
      looks: Object.fromEntries(
        materials.flatMap((m) => {
          const look = materialLook(m, groups);
          return look ? [[m.id, look]] : [];
        }),
      ),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What is wrong with where a project's cabinets stand in its room: overlaps, a run past a wall's end, a
 * tall cabinet up into a wall run. Nothing without a room. Design shows them on its Room card, and the
 * header marks the Design step with them.
 */
export function projectLayoutWarnings(project: Project, materials: Material[], hardware: Hardware[]): string[] {
  if (project.context.kind !== 'designedCabinet' || !project.context.room) return [];
  const context = project.context;
  const cabinets = cabinetsOf(project);
  const tags = cabinetTags(project);
  const nameOf = (id: string) => {
    const c = cabinets.find((x) => x.id === id);
    return c ? tagged(c.name || 'Cabinet', tags.get(c.id)) : id;
  };
  // The cabinets as the room's plan sees them: their case depth for `back`, the runs' fillers.
  const fillers = context.runs.flatMap((r) => runFit(context, r)?.fillers ?? []);
  const filler = (id: string, end: 'left' | 'right') => fillers.find((f) => f.cabinetId === id && f.end === end)?.width;
  const laid = cabinets.map((c) => ({
    id: c.id,
    width: c.size.width.mm,
    back: c.size.depth.mm,
    form: c.form,
    offFloor: boxOffFloor(c, materials, hardware),
    runId: c.runId,
    fillerLeft: filler(c.id, 'left'),
    fillerRight: filler(c.id, 'right'),
    ...(c.placement ? { placement: c.placement } : {}),
    ...(c.corner?.kind === 'diagonal' ? { diagonal: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
    ...(c.corner?.kind === 'lShaped' ? { lShaped: { side: c.corner.side, depth: c.size.depth.mm } } : {}),
  }));
  const { placements, aligned } = runPlacementsOf(context.runs, context);
  const groups = placeGroups(laid, placements, aligned);
  const groupName = (key: string) => {
    const r = context.runs.find((x) => x.id === key);
    if (r) return `The run "${r.name}"`;
    const c = cabinets.find((x) => cabinetGroupKey(x.id) === key);
    return c ? nameOf(c.id) : key;
  };
  const reach = laid.map((l) => {
    const c = cabinets.find((x) => x.id === l.id)!;
    const bottom = boxOffFloor(c, materials, hardware) ?? 0;
    return { ...l, name: nameOf(c.id), form: c.form, bottom, top: bottom + c.size.height.mm };
  });
  return layoutProblems(context.room!, groups, reach, groupName);
}

/** How many of a project's cabinets reach past its room's ceiling. */
export function cabinetsPastCeiling(project: Project, hardware: Hardware[]): number {
  return project.context.kind === 'designedCabinet' ? pastCeiling(project, cabinetsOf(project), hardware).length : 0;
}
