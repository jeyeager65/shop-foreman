<script setup lang="ts">
import { partTitle } from '@/design/tags';
import { computed } from 'vue';
import { POCKET, arcLedge, arcSeatAt, arcShape, pocketAxis, pocketShape, slotLedge, slotShape } from '@/geometry/pocketHole';
import type { MachineProfile, Part, PlannedBlank, Setup } from '@/model';

const props = defineProps<{ setup: Setup; blank: PlannedBlank; parts: Part[]; machine: MachineProfile }>();

const W = computed(() => props.blank.size.width);
const H = computed(() => props.blank.size.height);
/** Machine Y is up; the drawing's Y is down. */
const fy = (y: number) => H.value - y;

/** Pocket holes are drawn only on a blank the CNC cuts them on. */
const cutsPockets = computed(() => props.blank.setups.some((s) => s.operationKeys.some((k) => k.endsWith(':pocketHole'))));

const placed = computed(() =>
  props.setup.placements.flatMap((p) => {
    const part = props.parts.find((x) => x.id === p.partId);
    if (!part) return [];
    // A turned part lies a quarter turn anticlockwise: its width runs along the blank's Y.
    const width = p.turned ? part.size.height : part.size.width;
    const height = p.turned ? part.size.width : part.size.height;
    const at = (q: { x: number; y: number }) =>
      p.turned
        ? { x: p.origin.x + (p.mirrored ? q.y : part.size.height - q.y), y: p.origin.y + q.x }
        : { x: p.origin.x + (p.mirrored ? part.size.width - q.x : q.x), y: p.origin.y + q.y };
    // A part may lie other face up than the rest of its blank.
    const up = p.mirrored ? 'B' : 'A';
    const cutsHere = props.setup.operationKeys.length > 0;
    const points = (outline: { x: number; y: number }[]) =>
      outline
        .map(at)
        .map((q) => `${q.x},${fy(q.y)}`)
        .join(' ');
    const outline = part.features.find((f) => f.kind === 'cutout');
    return [
      {
        id: part.id,
        name: partTitle(part),
        // The part's real outline: a case side has its toe-kick notch.
        outline: outline?.kind === 'cutout' ? points(outline.outline) : undefined,
        // Dados, rabbets and grooves show filled in the setup that has their face up.
        recesses: part.features.flatMap((f) => (f.kind === 'dado' ? [{ id: f.id, points: points(f.outline), now: f.face === up && cutsHere }] : [])),
        // The open part of each pocket hole the CNC cuts: from its seat to where it runs out at the face.
        pockets: cutsPockets.value
          ? part.features.flatMap((f) => {
              if (f.kind !== 'pocketHole') return [];
              const shape = pocketShape(part.size.thickness, POCKET.bore / 3);
              // A low-angle pocket (`pocketLook`) opens further from the edge and runs further in.
              const low = part.pocketLook?.kind === 'low' ? arcShape(part.size.thickness, POCKET.bore, part.pocketLook.angleDeg, part.pocketLook.seat) : undefined;
              const [from, to] = low ? [arcSeatAt(low, 0), low.end] : [shape.seat, shape.length];
              const { exit, inward } = pocketAxis(part.size, f.edge, f.at, f.inset);
              const corner = (u: number, v: number) => ({ x: exit.x + inward.x * u - inward.y * v, y: exit.y + inward.y * u + inward.x * v });
              const w = POCKET.bore / 2;
              const now = f.face === up && cutsHere;
              const pocket = { id: f.id, points: points([corner(from, -w), corner(to, -w), corner(to, w), corner(from, w)]), now, ledge: false };
              // With a ledge round it for a printed cover: drawn under the pocket, as far out as the CNC cuts it.
              const look = part.pocketLook;
              if (!look?.ledges?.featureIds.includes(f.id)) return [pocket];
              const open = look.kind === 'low' ? arcLedge(part.size.thickness, look.angleDeg, look.seat) : slotLedge(slotShape(part.size.thickness, 2 * look.ledges.r));
              const ledge = { id: `${f.id}/ledge`, points: points([corner(open.u0, -open.half), corner(open.u1, -open.half), corner(open.u1, open.half), corner(open.u0, open.half)]), now, ledge: true };
              return [ledge, pocket];
            })
          : [],
        x: p.origin.x,
        y: fy(p.origin.y + height),
        width,
        height,
        // A name too long for a narrow, tall part is written up it.
        tall: height > width && width < partTitle(part).length * 13,
        // Cups and holes show solid in the setup that has their face up.
        cups: part.features.flatMap((f) => {
          if (f.kind !== 'cup' && f.kind !== 'hole') return [];
          const c = at(f.center);
          return [{ id: f.id, cx: c.x, cy: fy(c.y), r: f.diameter / 2, now: f.face === up && cutsHere }];
        }),
      },
    ];
  }),
);
const probe = computed(() => {
  const s = props.machine.probe.clearSquare;
  const { at } = props.setup.probeSpot;
  // On a tiled blank that has been slid, the spot is where the machine finds it: further up the sheet.
  const y = at.y + (props.setup.tile?.shift ?? 0);
  return { x: at.x - s / 2, y: fy(y + s / 2), width: s, height: s };
});
/**
 * A tiled blank: the part of it this setup does not cut (the other setup's band), the
 * join between the two, and the pins of the first setup, which the second sits on.
 */
const tile = computed(() => {
  const t = props.setup.tile;
  if (!t) return undefined;
  const join = t.from > 0 ? t.from : t.to;
  const other = t.from > 0 ? { y: fy(join), height: join } : { y: 0, height: H.value - join };
  return { join: fy(join), other, pins: props.blank.setups[0]?.pinHoles ?? [] };
});
const cutsOutline = computed(() => props.setup.operationKeys.some((k) => k.endsWith(':cutout')));
</script>

<template>
  <svg :viewBox="`-20 -20 ${W + 40} ${H + 40}`" class="setup-view" role="img" :aria-label="`Setup ${setup.index} layout`">
    <rect x="0" y="0" :width="W" :height="H" class="blank" />
    <line v-if="setup.pinHoles.length && !tile" :x1="W / 2" y1="-12" :x2="W / 2" :y2="H + 12" class="axis" />
    <g v-for="p in placed" :key="p.id">
      <polygon v-if="p.outline" :points="p.outline" :class="cutsOutline ? 'part now' : 'part'" />
      <rect v-else :x="p.x" :y="p.y" :width="p.width" :height="p.height" :class="cutsOutline ? 'part now' : 'part'" />
      <polygon v-for="r in p.recesses" :key="r.id" :points="r.points" :class="r.now ? 'recess now' : 'recess'" />
      <polygon v-for="r in p.pockets" :key="r.id" :points="r.points" :class="['recess', { now: r.now, ledge: r.ledge }]" />
      <circle v-for="c in p.cups" :key="c.id" :cx="c.cx" :cy="c.cy" :r="c.r" :class="c.now ? 'cup now' : 'cup'" />
      <text
        :x="p.x + p.width / 2"
        :y="p.y + p.height / 2"
        class="name"
        :transform="p.tall ? `rotate(-90 ${p.x + p.width / 2} ${p.y + p.height / 2})` : undefined"
      >{{ p.name }}</text>
    </g>
    <template v-if="tile">
      <rect x="0" :y="tile.other.y" :width="W" :height="tile.other.height" class="other-band" />
      <line x1="-12" :y1="tile.join" :x2="W + 12" :y2="tile.join" class="axis" />
      <circle v-for="(pin, i) in tile.pins" :key="`t${i}`" :cx="pin.x" :cy="fy(pin.y)" r="9" class="pin" />
    </template>
    <circle v-for="(pin, i) in tile ? [] : setup.pinHoles" :key="i" :cx="pin.x" :cy="fy(pin.y)" r="9" class="pin" />
    <rect v-bind="probe" class="probe" />
  </svg>
</template>

<style scoped>
.setup-view {
  width: 100%;
  max-height: 460px;
}
.blank {
  fill: #2e323b;
}
.part {
  fill: none;
  stroke: #8b93a1;
  stroke-width: 1.5;
  stroke-dasharray: 6 5;
}
.part.now {
  stroke: #7fb0ff;
  stroke-dasharray: none;
}
.cup {
  fill: none;
  stroke: #8b93a1;
  stroke-dasharray: 4 4;
  stroke-width: 1.5;
}
.cup.now {
  fill: #7fb0ff;
  stroke: #7fb0ff;
  stroke-dasharray: none;
}
.recess {
  fill: none;
  stroke: #8b93a1;
  stroke-dasharray: 4 4;
  stroke-width: 1;
}
.recess.now {
  fill: rgba(127, 176, 255, 0.35);
  stroke: #7fb0ff;
  stroke-dasharray: none;
}
/* A ledge round a pocket for a printed cover: shallow, so a fainter fill under the pocket's. */
.recess.ledge.now {
  fill: rgba(127, 176, 255, 0.15);
}
.pin {
  fill: #f0a45d;
}
/* The band of a tiled blank that the other setup cuts. */
.other-band {
  fill: rgba(10, 12, 16, 0.55);
}
.axis {
  stroke: #f0a45d;
  stroke-width: 1.5;
  stroke-dasharray: 8 6;
}
.probe {
  fill: none;
  stroke: #7ddc9a;
  stroke-width: 2;
}
.name {
  fill: #9aa3b2;
  font-size: 22px;
  text-anchor: middle;
}
</style>
