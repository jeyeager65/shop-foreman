/**
 * Partitions (milestone 10): between two bays of a frameless or shop-style cabinet stands a
 * full partition, the case's depth and the height between the bottom and the top (or the
 * stretchers), in the case material, joined to them the way the sides are joined to the
 * bottom: in dados, with pocket screws from its faces, or with screws up through the bottom
 * and down through the stretchers. It stops in front of a nailer or hanging rails.
 *
 * It is laid like the left side: face A looks right, into the bay after it; face B left,
 * into the bay before it. A fixed shelf is split per bay and joined to the partition as to a
 * side, and the adjustable shelves are made per bay.
 *
 * Its holes: the hinge plates and the slides of the bays either side, each on the face that
 * looks into its bay; where the two faces would meet, every blind hole in it is at most half
 * of what is left of it deep. Its shelf-pin holes go through, so one hole serves both bays.
 */
import type { CabinetDesign, CabinetOpening, Feature, Material, Mm, Part, Project, Shop } from '@/model';
import { rect } from './doors';
import { bayCount, bayDivider } from './bays';
import { SHELF_SIDE_CLEARANCE, fixedShelfTops, hasHangingRails, hasTopPanel, insideDepth } from './case';
import { doorSize, hingeFor, hingeHeights } from './doors';
import { designsOf } from './frontSettings';
import { isDoorSet, isDrawer } from './drawers';
import { withGrain } from './grain';
import { HOLE_WEB, PLATE_COVERS, shelfPinFor, shelfPinLevels } from './hardwareHoles';
import { onTabSlot, type TabSpan, tabReach, tabSizeOf, tabSlot, tabSpans, tabSpansBetween, tabbedOutline, tabsOf } from './tabs';
import { CASE_DADO_DEPTH, CASE_SCREW_HOLE, caseJointOf, jointReach } from './joints';
import { asOpening, deriveCabinetOpenings, wholeOpenings } from './openings';
import { jointPositions, pocketRow } from './pocketHoles';
import { SLIDE_PILOT_DEPTH, SLIDE_PILOT_DIAMETER, slideHoles } from './slides';
import { constructionRules, hang, thicknessOf } from './style';
import { drawerBox } from './drawerBox';

/** The least left under a blind hole in a case part. */
const MIN_UNDER: Mm = 3;

/**
 * Whether the cabinet has partitions: more than one bay. Behind a face frame's mullions too, unless they were
 * turned off (`layout.partitions: false`: bays open into each other would be odd to start with).
 */
export function hasPartitions(cabinet: CabinetDesign): boolean {
  // Between corner posts three uprights stand in a partition's place (`deriveFaceFrameParts`).
  const posts = !!cabinet.toeKick.legs?.posts && cabinet.form !== 'wall' && !cabinet.existing && !cabinet.corner;
  return bayCount(cabinet) > 1 && !posts && (cabinet.construction !== 'faceFrame' || cabinet.layout.partitions !== false);
}

/** Where each partition stands: its left face, `x` from the cabinet's left; behind a mullion, centred on it. One fewer than the bays. */
export function partitionPlaces(cabinet: CabinetDesign, materials: Material[]): Mm[] {
  if (!hasPartitions(cabinet)) return [];
  const openings = wholeOpenings(deriveCabinetOpenings(cabinet, materials)).filter((o) => o.rowId === cabinet.layout.rows[0]!.id);
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const behind = cabinet.construction === 'faceFrame' ? (bayDivider(cabinet, materials) - t) / 2 : 0;
  return openings.slice(0, -1).map((o) => o.origin.x + o.width + behind);
}

/** Each bay's room inside the case: between a side and a partition, or two partitions. */
function caseSpans(cabinet: CabinetDesign, places: Mm[], t: Mm): { origin: { x: Mm }; width: Mm }[] {
  const edges = [t, ...places.flatMap((x) => [x, x + t]), cabinet.size.width.mm - t];
  return Array.from({ length: places.length + 1 }, (_, i) => ({ origin: { x: edges[2 * i]! }, width: edges[2 * i + 1]! - edges[2 * i]! }));
}

/** The partitions' id, by their number from the left. */
export const partitionId = (cabinetId: string, k: number) => `${cabinetId}/partition-${k}`;

/**
 * The case parts with the partitions in them: the partitions themselves, their joints in the
 * bottom and the top or stretchers, the fixed shelves split per bay and the shelves per bay.
 */
export function withPartitions(parts: Part[], cabinet: CabinetDesign, materials: Material[]): Part[] {
  const places = partitionPlaces(cabinet, materials);
  if (!places.length) return parts;
  const t = thicknessOf(materials, cabinet.materials.caseId);
  const rules = constructionRules(cabinet, materials);
  const band = rules.frontEdgeBand;
  const depth = insideDepth(cabinet, materials);
  const H = cabinet.size.height.mm;
  // What a partition stands on: the bottom, or the stretchers a case with no bottom has in its place.
  const under = parts.filter((p) => p.id === `${cabinet.id}/bottom` || p.id === `${cabinet.id}/bottom-stretcher-front` || p.id === `${cabinet.id}/bottom-stretcher-back`);
  const floorTop = under[0]!.placement!.origin[1];
  const ceiling = H - t;
  const nailer = cabinet.joinery.backStretcherForm === 'nailer' && !hasTopPanel(cabinet);
  // In front of what stands against the back at its top: a nailer, or hanging rails.
  const rear = depth - (nailer || hasHangingRails(cabinet) ? t : 0);
  const below = caseJointOf(cabinet, 'bottom');
  const above = hasTopPanel(cabinet) ? below : caseJointOf(cabinet, 'frontStretcher');
  // On tabs: into what it meets above and below (through it, where its far face is an outside one), or blind.
  const tabOut = tabReach(cabinet, t);
  const tabIn = tabReach(cabinet, t, false);
  const slotDepth = tabsOf(cabinet).blind ? tabOut : undefined;
  const [reachB, reachT] = [jointReach(below, tabOut), jointReach(above, tabOut)];
  const extra = new Map<string, Feature[]>();
  const add = (id: string, features: Feature[]) => extra.set(id, [...(extra.get(id) ?? []), ...features]);

  /** A spanning part's own point for a cabinet x and a depth behind the case front. */
  const on = (part: Part, x: Mm, behind: Mm) => ({ x: x - part.placement!.origin[0], y: behind + part.placement!.origin[2] });
  /** The spanning parts a partition's top end meets: the top panel, or the stretchers (a nailer it stops short of). */
  const overhead = parts.filter((p) => p.id === `${cabinet.id}/top` || p.id === `${cabinet.id}/stretcher-front` || (p.id === `${cabinet.id}/stretcher-back` && !nailer));
  /** From where to where behind the case front a spanning part runs. */
  const spanOf = (part: Part) => ({ from: -part.placement!.origin[2], to: -part.placement!.origin[2] + part.size.height });

  const out: Part[] = [];
  places.forEach((x, i) => {
    const k = i + 1;
    const key = `p${k}`;
    const height = ceiling - floorTop + reachB + reachT;
    const width = rear - band;
    const origin0 = floorTop - reachB;
    const features: Feature[] = [{ id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, width, height) }];
    // Its ends: into the bottom below and what spans the top above.
    const ends = [
      ...under.map((p) => ({ part: p, joint: below, edge: 'y0' as const, face: 'A' as const, span: { from: Math.max(band, spanOf(p).from), to: Math.min(rear, spanOf(p).to) } })),
      ...overhead.map((p) => ({ part: p, joint: above, edge: 'y1' as const, face: 'B' as const, span: { from: Math.max(band, spanOf(p).from), to: Math.min(rear, spanOf(p).to) } })),
    ].filter((e) => e.span.to - e.span.from > 1);
    const tabsOn: { y0: TabSpan[]; y1: TabSpan[] } = { y0: [], y1: [] };
    ends.forEach((e, j) => {
      const along = jointPositions(0, e.span.to - e.span.from).map((p) => e.span.from + p);
      if (e.joint === 'tabs') {
        // A tab down into the bottom, up into the top or a stretcher, and a slot there for each.
        tabSpans(e.span.to - e.span.from, tabSizeOf(cabinet.joinery.tabs)).forEach((s, n) => {
          const a = on(e.part, x, e.span.from + s.from);
          const b = on(e.part, x + t, e.span.from + s.to);
          add(e.part.id, [tabSlot(`${key}-${j + 1}-${n + 1}`, e.face, a.x, a.y, b.x, b.y, slotDepth)]);
          tabsOn[e.edge].push({ from: e.span.from + s.from - band, to: e.span.from + s.to - band });
        });
      } else if (e.joint === 'dado') {
        const a = on(e.part, x, e.span.from);
        const b = on(e.part, x + t, e.span.to);
        add(e.part.id, [{ id: `dado-${key}`, kind: 'dado', face: e.face, outline: rect(a.x, Math.max(0, a.y), b.x, Math.min(e.part.size.height, b.y)), depth: CASE_DADO_DEPTH }]);
      } else if (e.joint === 'pocketScrews') {
        // From the partition's face A, out through its end into the part.
        features.push(...pocketRow(`end-pocket-${j + 1}`, 'A', e.edge, along.map((b) => b - band)));
      } else {
        // Screws up through the bottom, down through the stretchers or the top: drilled from its face A, with its other work.
        add(
          e.part.id,
          along.map((b, n) => ({ id: `case-screw-${key}-${n + 1}`, kind: 'hole', face: 'A', center: on(e.part, x + t / 2, b), diameter: CASE_SCREW_HOLE, depth: t })),
        );
      }
    });
    if (tabsOn.y0.length || tabsOn.y1.length) {
      features[0] = {
        id: 'cutout',
        kind: 'cutout',
        face: 'A',
        outline: tabbedOutline(width, height, { ...(tabsOn.y0.length ? { y0: { reach: reachB, spans: tabsOn.y0 } } : {}), ...(tabsOn.y1.length ? { y1: { reach: reachT, spans: tabsOn.y1 } } : {}) }),
        dogBones: true,
      };
    }
    const part: Part = {
      id: partitionId(cabinet.id, k),
      designObjectId: cabinet.id,
      name: places.length > 1 ? `Partition ${k}` : 'Partition',
      materialId: cabinet.materials.caseId,
      size: { width, height, thickness: t },
      features,
      role: 'partition',
      ...(tabsOn.y0.length || tabsOn.y1.length ? { tabbed: true as const } : {}),
      // Laid like the left side: face A looks right, the thickness runs left from x + t.
      placement: { origin: [x + t, origin0, -band], xAxis: [0, 0, -1], yAxis: [0, 1, 0] },
      ...(band > 0 ? { banding: { edges: ['x0'], thickness: band, ...(rules.frontEdgeStrip ? { strip: true as const } : {}) } } : {}),
    };
    out.push(withGrain(part, 'partition', materials));
  });

  // The fixed shelves, per bay, joined to the partitions as to the sides.
  const bays = caseSpans(cabinet, places, t);
  const shelfJoint = below;
  const reach = jointReach(shelfJoint, tabOut);
  const tabbed = shelfJoint === 'tabs';
  const tops = fixedShelfTops(cabinet, materials);
  const fixed = parts.filter((p) => tops.length && p.role === 'bottom' && p.id.startsWith(`${cabinet.id}/fixed-shelf`));
  for (const shelf of fixed) {
    const top = shelf.placement!.origin[1];
    bays.forEach((bay, b) => {
      const length = shelf.size.height;
      // On tabs an end at a side reaches as the case's parts do; one at a partition goes through it and no further.
      const [atLeftSide, atRightSide] = [b === 0, b === bays.length - 1];
      const [reachL, reachR] = tabbed ? [atLeftSide ? tabOut : tabIn, atRightSide ? tabOut : tabIn] : [reach, reach];
      // Two shelves at one height either side of a partition: the right-hand end's tabs are between the left-hand end's.
      const rightTabs = atRightSide ? tabSpans(length, tabSizeOf(cabinet.joinery.tabs)) : tabSpansBetween(length, tabSizeOf(cabinet.joinery.tabs));
      if (tabbed && !rightTabs.length) throw new Error('The case is too shallow for fixed shelves on tabs in two bays at one height: their tabs would meet in the partition.');
      const width = bay.width + reachL + reachR;
      const x0 = bay.origin.x - reachL;
      const pocket = (edge: 'x0' | 'x1', name: string) => (shelfJoint === 'pocketScrews' ? pocketRow(name, 'B', edge, jointPositions(0, length)) : []);
      out.push({
        ...shelf,
        id: b === 0 ? shelf.id : `${shelf.id}-b${b + 1}`,
        name: `${shelf.name}, bay ${b + 1}`,
        size: { ...shelf.size, width },
        ...(tabbed ? { tabbed: true as const } : {}),
        placement: { ...shelf.placement!, origin: [x0, top, shelf.placement!.origin[2]] },
        features: [
          tabbed
            ? { id: 'cutout', kind: 'cutout', face: 'A', outline: tabbedOutline(width, length, { x0: { reach: reachL, spans: tabSpans(length, tabSizeOf(cabinet.joinery.tabs)) }, x1: { reach: reachR, spans: rightTabs } }), dogBones: true }
            : { id: 'cutout', kind: 'cutout', face: 'A', outline: rect(0, 0, width, length) },
          ...pocket('x0', 'side-pocket-left'), ...pocket('x1', 'side-pocket-right'),
        ],
      });
      // Its dado or screws in the partitions either side.
      for (const [k, faceOf] of [
        [b, 'A'],
        [b + 1, 'B'],
      ] as const) {
        if (k < 1 || k > places.length) continue;
        const front = -shelf.placement!.origin[2];
        if (tabbed) {
          // The shelf to the partition's right (its face A) has its usual tabs; the one to its left, the ones between.
          const [y0, y1] = [top - t - floorTop + reachB, top - floorTop + reachB];
          const spans = faceOf === 'A' ? tabSpans(length, tabSizeOf(cabinet.joinery.tabs)) : rightTabs;
          add(partitionId(cabinet.id, k), spans.map((s, n) => tabSlot(`fixed-${b + 1}-${shelf.id.split('/').pop()}-${n + 1}`, faceOf, front - band + s.from, y0, front - band + s.to, y1, slotDepth === undefined ? undefined : tabIn)));
        }
        if (shelfJoint === 'dado') add(partitionId(cabinet.id, k), [{ id: `dado-fixed-${b + 1}-${shelf.id.split('/').pop()}`, kind: 'dado', face: faceOf, outline: rect(front - band, top - t - floorTop + reachB, front - band + length, top - floorTop + reachB), depth: CASE_DADO_DEPTH }]);
        if (shelfJoint === 'throughScrews') {
          // The bay on the left's shelf takes its screws at the joint's places, the one on the right's between them.
          const at = jointPositions(0, length);
          const mids = faceOf === 'B' ? at : at.slice(1).map((p, n) => (p + at[n]!) / 2);
          add(
            partitionId(cabinet.id, k),
            mids.map((p, n) => ({ id: `case-screw-fixed-${b + 1}-${n + 1}`, kind: 'hole', face: 'A', center: { x: front + p - band, y: top - t / 2 - floorTop + reachB }, diameter: CASE_SCREW_HOLE, depth: t })),
          );
        }
      }
    });
  }

  // The adjustable shelves, per bay.
  const shelves = parts.filter((p) => p.role === 'shelf');
  for (const shelf of shelves) {
    bays.forEach((bay, b) => {
      const w = bay.width - 2 * SHELF_SIDE_CLEARANCE;
      out.push({
        ...shelf,
        id: b === 0 ? shelf.id : `${shelf.id}-b${b + 1}`,
        name: `${shelf.name}, bay ${b + 1}`,
        size: { ...shelf.size, width: w },
        placement: { ...shelf.placement!, origin: [bay.origin.x + SHELF_SIDE_CLEARANCE, shelf.placement!.origin[1], shelf.placement!.origin[2]] },
        features: shelf.features.map((f) => (f.kind === 'cutout' ? { ...f, outline: rect(0, 0, w, shelf.size.height) } : f)),
      });
    });
  }

  const replaced = new Set([...fixed, ...shelves].map((p) => p.id));
  const kept = parts.filter((p) => !replaced.has(p.id)).map((p) => (extra.has(p.id) ? { ...p, features: [...p.features, ...extra.get(p.id)!] } : p));
  return [...kept, ...out.map((p) => (extra.has(p.id) ? { ...p, features: [...p.features, ...extra.get(p.id)!] } : p))];
}

/**
 * The partitions' hardware holes: the hinge plates of the doors hinged on them and the
 * slides of the drawers beside them, on the face that looks into each bay, and the shelf-pin
 * holes through them at the sides' levels, clear of the plates.
 */
export function withPartitionHoles(parts: Part[], cabinet: CabinetDesign, project: Project, shop: Pick<Shop, 'materials' | 'hardware'>): Part[] {
  const places = partitionPlaces(cabinet, shop.materials);
  if (!places.length) return parts;
  const t = thicknessOf(shop.materials, cabinet.materials.caseId);
  const blind = (depth: Mm) => Math.min(depth, (t - MIN_UNDER) / 2);
  const openings = deriveCabinetOpenings(cabinet, shop.materials);
  const added = new Map<number, Feature[]>();
  const plates = new Map<number, { behind: Mm; from: Mm; to: Mm }[]>();
  const partOf = (k: number) => parts.find((p) => p.id === partitionId(cabinet.id, k))!;
  /** A point on a partition: `behind` the case front, `y` off the floor. */
  const at = (k: number, behind: Mm, y: Mm) => {
    const p = partOf(k);
    return { x: behind - (p.banding?.thickness ?? 0), y: y - p.placement!.origin[1] };
  };
  const hole = (k: number, face: 'A' | 'B', id: string, behind: Mm, y: Mm, diameter: Mm, depth: Mm) => {
    // Not on a slot for a tab (a fixed shelf's, in a case on tab-and-slot joints): a hinge plate cannot do without its hole.
    if (onTabSlot(partOf(k).features, at(k, behind, y), diameter / 2, HOLE_WEB)) {
      if (id.startsWith('hinge-plate')) throw new Error(`A hinge plate's hole would land on a slot for a tab in partition ${k}, ${Math.round(y)} mm off the floor: move the hinge, or give the fixed shelf another joint.`);
      return;
    }
    added.set(k, [...(added.get(k) ?? []), { id, kind: 'hole', face, center: at(k, behind, y), diameter, depth }]);
  };
  /** The partition at an opening's edge, and the face of it that looks into the opening; none at a case side. */
  const edgeOf = (o: CabinetOpening, which: 'left' | 'right'): { k: number; face: 'A' | 'B' } | undefined => {
    const bay = o.bay ?? 1;
    if (which === 'left') return bay > 1 ? { k: bay - 1, face: 'A' } : undefined;
    return bay <= places.length ? { k: bay, face: 'B' } : undefined;
  };

  // Hinge plates of the doors hinged on a partition.
  if (constructionRules(cabinet, shop.materials).hingeMount === 'sidePlate') {
    for (const opening of openings) {
      for (const stored of designsOf(project).filter(isDoorSet).filter((d) => d.mounting.openingId === opening.id)) {
        const doors = hang(stored, opening);
        const hinge = hingeFor(doors.mounting, opening.construction, shop.hardware);
        if (!hinge.plate) continue;
        const plate = opening.inset ? { ...hinge.plate, setback: hinge.plate.setback + thicknessOf(shop.materials, doors.materialId) } : hinge.plate;
        const heights = hingeHeights(hinge, doorSize(doors, asOpening(opening), hinge).height);
        const doorBottom = opening.origin.y - doors.mounting.overlayBottom.mm;
        for (const which of doors.mounting.doors === 2 ? (['left', 'right'] as const) : [doors.mounting.hingeSide ?? 'left']) {
          const edge = edgeOf(opening, which);
          if (!edge) continue;
          heights.forEach((h, i) => {
            const y = doorBottom + h;
            [-1, 1].forEach((sign, j) => hole(edge.k, edge.face, `hinge-plate-${doors.id}-${i + 1}-${j + 1}`, plate.setback, y + (sign * plate.spacing) / 2, plate.hole.diameter, blind(plate.hole.depth)));
            const reach = plate.spacing / 2 + PLATE_COVERS.beyondHoles;
            plates.set(edge.k, [...(plates.get(edge.k) ?? []), { behind: plate.setback, from: y - reach, to: y + reach }]);
          });
        }
      }
    }
  }

  // Slide screws of the drawers beside a partition.
  for (const drawer of designsOf(project).filter(isDrawer)) {
    const opening = openings.find((o) => o.id === drawer.mounting.openingId);
    if (!opening) continue;
    let box: ReturnType<typeof drawerBox>;
    try {
      box = drawerBox(drawer, project, shop);
    } catch {
      continue;
    }
    const screws = box?.mount === 'case' && box.slide ? slideHoles(box.slide) : undefined;
    if (!box || !screws) continue;
    for (const which of ['left', 'right'] as const) {
      const edge = edgeOf(opening, which);
      if (!edge) continue;
      screws.forEach((fromFront, i) => {
        const behind = fromFront - box.slideAt.front;
        // Not in the partition's edge strip, nor at the cut edge behind it (the sides leave the same ones out).
        const band = partOf(edge.k).banding?.thickness ?? 0;
        if (behind >= SLIDE_PILOT_DIAMETER / 2 && !(band > 0 && behind - band - SLIDE_PILOT_DIAMETER / 2 < HOLE_WEB - 1e-6)) hole(edge.k, edge.face, `slide-screw-${drawer.id}-${i + 1}`, behind, box.slideAt.y, SLIDE_PILOT_DIAMETER, blind(SLIDE_PILOT_DEPTH));
      });
    }
  }

  // Shelf pins: through, at the sides' levels, clear of the plates on either face.
  const pin = shelfPinFor(cabinet, shop.hardware);
  const levels = shelfPinLevels(cabinet, shop.materials, pin);
  if (levels.length) {
    const rows = [
      { key: 'front', behind: pin.rows.frontSetback },
      { key: 'rear', behind: insideDepth(cabinet, shop.materials) - pin.rows.rearSetback },
    ];
    const r = pin.hole.diameter / 2;
    places.forEach((_, i) => {
      const k = i + 1;
      const own = added.get(k) ?? [];
      const clear = (y: Mm) =>
        rows.every(
          (row) =>
            !onTabSlot(partOf(k).features, at(k, row.behind, y), r, HOLE_WEB) &&
            !(plates.get(k) ?? []).some((p) => Math.abs(p.behind - row.behind) < PLATE_COVERS.eitherSide && y > p.from - r && y < p.to + r) &&
            !own.some((f) => f.kind === 'hole' && Math.hypot(f.center.x - at(k, row.behind, y).x, f.center.y - at(k, row.behind, y).y) < r + f.diameter / 2 + HOLE_WEB),
        );
      levels.filter(clear).forEach((y, n) => {
        for (const row of rows) hole(k, 'A', `shelf-pin-${row.key}-${n + 1}`, row.behind, y, pin.hole.diameter, t);
      });
    });
  }
  return parts.map((p) => {
    const k = places.findIndex((_, i) => p.id === partitionId(cabinet.id, i + 1)) + 1;
    return k > 0 && added.has(k) ? { ...p, features: [...p.features, ...added.get(k)!] } : p;
  });
}

/** What stands between two bays, for the words on screen. */
export function dividerWords(cabinet: CabinetDesign, materials: Material[], length: (mm: Mm) => string): string {
  return cabinet.construction === 'faceFrame' ? `a mullion ${length(bayDivider(cabinet, materials))} wide` : `a partition ${length(bayDivider(cabinet, materials))} thick`;
}
