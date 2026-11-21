<script setup lang="ts">
/**
 * 3D view of a designed cabinet: every part built as a real solid and set in its
 * place, with sliders that open the doors, pull the drawers out and pull the parts
 * apart into an exploded view. The button in its corner (or `start-full`) makes the
 * view take over the whole page; Esc or the button brings it back.
 *
 * With `hardware` the doors hang on their hinges: each hinge is drawn (its cup in the
 * door, its plate and arm on the case, the two links between) and the door moves as
 * the hinge's linkage carries it (`design/hingeModel.ts`), not about a plain pivot.
 *
 * With `cabinets` it shows several: each one's parts set down where it stands, and a
 * click on a cabinet (not a drag, which turns the view) emits `pick` with its id.
 *
 * Looks (see `viewLook.ts`; the realistic one, with lighting and textures, is done as lr4-sandbox does it).
 * The plain one is a drawing: flat colours,
 * every part outlined, its grain as streaks. The Realistic switch lights the scene from a studio
 * environment and one soft shadow-casting light (in a room, a lamp on the ceiling in its middle), tone-maps it, puts a wood texture on the wood (in the
 * part's grain direction) and a plank floor in a room, and drops the outlines. The view starts
 * realistic; the choice is kept in the browser, and `start-look` sets it from a link.
 */
import { mdiFullscreen, mdiFullscreenExit, mdiRestore } from '@mdi/js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import ViewLookSelect from './ViewLookSelect.vue';
import { type ViewLook, viewLook } from './viewLook';
import { FLOOR_TILE, WALL_TILE_REPEAT, floorKindTexture, floorTexture, wallTileTexture, pliesTexture, pressedTexture, skyTexture, strandsTexture, withTextureCoordinates, woodTexture } from './viewTextures';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isApplianceShape } from '@/design/appliances';
import { hubShapeColour } from '@/design/hub';
import type { ApplianceKind } from '@/model';
import { FALSE_FRONT } from '@/design/falseFront';
import { SINK_TOP_COLOUR, isSinkTop } from '@/design/sinks';
import { sinkObject } from './sinkDrawing';
import { BIFOLD_UNFOLD_DEG, type CabinetAssembly, MAX_DOOR_OPEN_DEG, type PlacedPart, type SlideMount, buildCabinetAssembly, placedDoorPose, grainStreaks, insetSwingShift } from '@/design/cabinetAssembly';
import type { SolidMesh } from '@/geometry/solids';
import { finishedColor, showsGrain } from '@/design/finish';
import type { FaceFinish } from '@/design/finishFaces';
import { surfaceBelowFace } from '@/design/handles';
import { knobProfile, madeHandle, pullProfile } from '@/design/printedHandle';
import type { Caster, Finish, Hardware, Part, RoomLook, Vec3 } from '@/model';
import type { SolidRequest, SolidResponse } from '@/workers/solid.worker';

const props = withDefaults(
  defineProps<{
    parts: Part[];
    /** Several cabinets: where each stands and which of the parts are its own. Left out: the parts are one cabinet's. */
    cabinets?: { id: string; at: Vec3; /** Degrees about Y: 0 faces the front wall. */ turn?: number; partIds: string[] }[];
    /** The room the cabinets stand in, in mm: drawn solid round them, the view starting inside it. Left out: no room. */
    room?: {
      length: number;
      width: number;
      ceiling: number;
      /** The walls that are not there: 'back', 'left', 'right', 'front'. */
      open?: string[];
      /** Its windows: each one's bottom-left corner on its wall, in the room, and the turn that faces it into the room. */
      windows?: { at: Vec3; turn: number; width: number; height: number }[];
      /** How it looks: its floor, its walls' colour, the tile on its walls (`src/design/roomLook.ts`). */
      look?: RoomLook;
      /** The pieces of tile on its walls, each placed as a window is. */
      tiles?: { at: Vec3; turn: number; width: number; height: number }[];
    };
    /** The view is framed again when this changes: another cabinet, or all of them. */
    frameKey?: string;
    /** The shop's hardware: with it the doors are drawn on their hinges and move as the hinges carry them. */
    hardware?: Hardware[];
    /** The slide each drawer runs on: with them the slides are drawn beside the boxes, and open with them. */
    slides?: SlideMount[];
    /**
     * Casters (milestone 9): each under its cabinet's doubled bottom, `x` from the cabinet's left and
     * `behind` its front, drawn with it (they come apart with the layer in the exploded view).
     */
    casters?: { cabinetId: string; x: number; behind: number; locking: boolean; caster: Caster }[];
    /** What each appliance's block is, by its part: its doors, handles, burners and the like are drawn on it. */
    appliances?: { partId: string; kind: ApplianceKind; /** A dishwasher's toe kick under its block: how high, and its face's distance from the wall. */ kick?: { height: number; face: number } }[];
    /**
     * How each material looks bare, by its id: its type's colour, and wood grain, OSB's strands or nothing on
     * it. The realistic look draws a part as its material; the plain one keeps its colours by what the part is.
     */
    looks?: Record<string, { color: number; texture: 'wood' | 'strands' | 'smooth'; /** What its cut edges show instead: plywood's plies, OSB's pressed strands. */ edge?: 'plies' | 'pressed' }>;
    /**
     * What each face of each part is finished in, by the part's id (`faceFinishes`): its group's finish where it
     * shows, the case's or a clear coat inside, nothing where it is hidden. Left out, or a part left out: the
     * group's finish all over.
     */
    faces?: Record<string, { A: FaceFinish; B: FaceFinish; edges: FaceFinish }>;
    /** The paint or stain each group of parts is drawn in. Left out, or a group left out: as its material. */
    finish?: { case?: Finish; fronts?: Finish; handles?: Finish; tops?: Finish };
    /**
     * Where the view looks from, and how far apart the parts are, set from outside: Setup turns its example to
     * suit the topic in hand (fronts face on, the toe kick from low down, the case exploded). `from` is the way
     * to the eye from the middle of what is shown (x to the right, y up, z out of the front); its length does not
     * matter. Each change moves the view there; between changes the view is the user's to turn. Not for a room.
     */
    pose?: { from?: [number, number, number]; explode?: number; open?: number; drawer?: number };
    /** How far down a table's leaf starts, 0 (up) to 100 (hanging). */
    startLeaf?: number;
    /** Starting explode amount, 0 to 100. */
    startExplode?: number;
    /** Starting door angle, degrees. */
    startOpen?: number;
    /** How far out the drawers start, 0 to 100. */
    startDrawer?: number;
    /** Start with the view filling the page. */
    startFull?: boolean;
    /** Start in this look, whatever was last chosen. Left out: the look last chosen, realistic to begin with. */
    startLook?: ViewLook;
    /** The look is chosen somewhere else (the header of the card this is in): no selector under the view, but when it fills the page. */
    lookElsewhere?: boolean;
    /** The part picked out (its id): drawn in a strong colour, the rest seen through. */
    selectedPart?: string;
    /** With several cabinets: the one in hand. A click on a part of it picks the part; on another cabinet, that cabinet. */
    selectedCabinet?: string;
    /** Each material's name, by its id: what the "By material" look colours the parts by, and its legend's words. */
    materialNames?: Record<string, string>;
    /** Where each part is cut, by its id, in words ("CNC", "Table saw", "Already cut"): the "By how it is cut" look's colours and legend. */
    cutBy?: Record<string, string>;
  }>(),
  { startExplode: 0, startOpen: 0, startDrawer: 0, startLeaf: 0, startFull: false },
);

const emit = defineEmits<{
  pick: [cabinetId: string];
  /** A part was clicked (its id), or the background or the part already picked (undefined): what is picked out now. */
  part: [partId: string | undefined];
  /** A small picture of the view (a WebP data URL), each time its solids have been built and drawn: for a project's thumbnail. */
  picture: [dataUrl: string];
}>();

/** The picture's width in pixels; its height follows the view's shape. */
const PICTURE_WIDTH = 320;
/** Draws the view and copies it, small, in the same turn: the drawing buffer is not kept past it. */
function takePicture() {
  const from = renderer?.domElement;
  if (!from || !from.width || !from.height) return;
  try {
    render();
    const small = document.createElement('canvas');
    small.width = PICTURE_WIDTH;
    small.height = Math.max(1, Math.round((PICTURE_WIDTH * from.height) / from.width));
    const pen = small.getContext('2d');
    if (!pen) return;
    pen.drawImage(from, 0, 0, small.width, small.height);
    const url = small.toDataURL('image/webp', 0.8);
    if (url.length > 200) emit('picture', url);
  } catch {
    // No picture, then: the view itself is what matters.
  }
}

const host = ref<HTMLDivElement | null>(null);
const status = ref('Building solids…');
/** How far along the solids are, 0 to 100, while the first picture is being built; undefined when not building. */
const building = ref<number | undefined>(0);
const explode = ref(Math.min(100, Math.max(0, props.pose?.explode ?? props.startExplode)));
const openDeg = ref(Math.min(MAX_DOOR_OPEN_DEG, Math.max(0, props.pose?.open ?? props.startOpen)));
const drawerOut = ref(Math.min(100, Math.max(0, props.pose?.drawer ?? props.startDrawer)));
/** Whether the cabinet on show has doors to open and drawers to pull out. */
/** The share of the Leaf slider's travel in which the legs fold; the leaf goes down in the rest. */
const LEAF_LEGS_UNTIL = 35;
/** What the Leaf slider says. */
const leafWords = computed(() =>
  leafDown.value === 0 ? 'Up' : leafDown.value === 100 ? 'Down' : leafDown.value <= LEAF_LEGS_UNTIL ? 'Legs' : `${Math.round(((leafDown.value - LEAF_LEGS_UNTIL) / (100 - LEAF_LEGS_UNTIL)) * 90)}°`,
);
/** A table's leaf: 0 up on its legs, 100 hanging down with its legs folded. */
const leafDown = ref(Math.min(100, Math.max(0, props.startLeaf)));
const hasLeaf = ref(false);
/** The tops are drawn (with one on, what is under it is hard to see). Off: every top, its edges, a torsion box's ribs and a leaf's hardware are hidden. */
const showTop = ref(true);
const hasTop = ref(false);
/** The doors and the drawers are drawn. Off: every door, drawer front and drawer box is hidden, with the hinges and the slides' moving members, to see the case; the slides' cabinet members stay on it. */
const showFronts = ref(true);
const hasFronts = ref(false);
/** A door, a drawer front, or a part of a drawer's box. (A tray inside a cabinet is not one: it stays.) */
const isFrontPart = (part: { role?: string }) => !part.role || part.role.startsWith('box');
/** A part of a top: its panels and edge strips, a torsion box's skins and ribs, and what a leaf hangs on. */
const isTopPart = (part: { role?: string; partId: string }) => part.role === 'top' || part.role === 'topEdge' || part.role === 'rib' || part.partId.includes('-appliance-leaf-');
const hasDoors = ref(false);
const hasDrawers = ref(false);
/**
 * The look (`viewLook`, one for every view, kept in the browser). Realistic: lighting, shadows and textures. The
 * others are all the outlined drawing, lit flat: basic as it is, see-through, a line drawing, or the parts coloured
 * by their material or by where they are cut.
 */
if (props.startLook) viewLook.value = props.startLook;
const realistic = computed(() => viewLook.value === 'realistic');
/** What the colours of a look that colours the parts stand for. */
const legend = ref<{ name: string; colour: string }[]>([]);
/**
 * Whether the paint and stain are drawn, or the bare wood under them. Shown when the project has a finish; on to
 * begin with, not kept.
 */
const showFinish = ref(true);
const hasFinish = computed(() => Object.values(props.finish ?? {}).some(Boolean));
/** The finish as it is drawn: none while the bare wood is asked for. */
const drawnFinish = computed(() => (showFinish.value ? props.finish : undefined));
/** The view fills the page, over everything else. */
const full = ref(props.startFull);
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && full.value) full.value = false;
}

let worker: Worker | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let observer: ResizeObserver | undefined;
let requestId = 0;
let assembly: CabinetAssembly | undefined;
let placed: { object: THREE.Group; part: PlacedPart }[] = [];
/** What of each hinge is fixed to the case (it moves with the side in the exploded view), and its two links (they follow the door). */
let hingeFixed: { mesh: THREE.Mesh; at: THREE.Vector3; explode: Vec3 }[] = [];
let hingeLinks: { mesh: THREE.Mesh; part: PlacedPart; height: number; link: 0 | 1 }[] = [];
/** The members of each slide: where each is with the drawer shut, and how much of the drawer's travel it comes out by. */
let slideMembers: { object: THREE.Object3D; at: THREE.Vector3; share: number; part: PlacedPart }[] = [];
/** How many steps the drawer slider plays a blind corner cabinet's trays in: 2, or 3 when one also comes forward. */
let framed = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
const content = new THREE.Group();
/** Where the part being drawn goes: its cabinet's group (set down and turned where the cabinet stands), or the content itself. */
let target: THREE.Object3D = content;
/** The room's floor, walls and ceiling line, when there is a room. */
const roomLayer = new THREE.Group();
/** What the realistic look is lit and dressed with: made the first time it is switched on. */
let look: { environment: THREE.Texture; wood: THREE.Texture; strands: THREE.Texture; plies: THREE.Texture; pressed: THREE.Texture; floor: THREE.Texture } | undefined;
/**
 * Every surface material, with what it is in each look: its colour in the plain one, and in the realistic one its
 * colour (when its material's type gives one) and what is drawn on it. Those of wood take the wood texture.
 */
type Dress = { plain: number; real?: number; texture: 'wood' | 'strands' | 'smooth' | 'plies' | 'pressed' };
const surfaces = new Map<THREE.MeshStandardMaterial, Dress>();
const woods = { has: (made: THREE.MeshStandardMaterial) => surfaces.get(made)?.texture === 'wood' };
/** Puts a surface in the look that is on. */
function dress(made: THREE.MeshStandardMaterial) {
  const d = surfaces.get(made);
  if (!d) return;
  const real = realistic.value && !!look;
  made.color.set(real && d.real !== undefined ? d.real : d.plain);
  made.map = !real || d.texture === 'smooth' ? null : look![d.texture];
}
// polygonOffset keeps the outlines from fighting with the faces they lie on.
function surface(color: number, wood = false, real?: number, texture?: Dress['texture']): THREE.MeshStandardMaterial {
  const made = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  surfaces.set(made, { plain: color, ...(real !== undefined ? { real } : {}), texture: texture ?? (wood ? 'wood' : 'smooth') });
  dress(made);
  return made;
}
/** A part's surface as its material: the plain look's colour for what the part is, the realistic look's from its material's type. */
const typedSurfaces = new Map<string, THREE.MeshStandardMaterial>();
/** The surface a material's cut edges take, where they do not look like its faces (plywood's plies, OSB's pressed strands). */
const edgeSurfaces = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
function typed(base: THREE.MeshStandardMaterial, as: { color: number; texture: Dress['texture']; edge?: 'plies' | 'pressed' }): THREE.MeshStandardMaterial {
  const key = `${base.uuid}:${as.color}:${as.texture}:${as.edge ?? ''}`;
  let made = typedSurfaces.get(key);
  if (!made) {
    // A front of a material with no grain is its material's colour in the basic look too: unpainted MDF should look
    // like unpainted MDF (it was a pale grey that read as paint).
    const plain = base === materials.front ? as.color : surfaces.get(base)!.plain;
    typedSurfaces.set(key, (made = surface(plain, false, as.color, as.texture)));
    if (as.edge) edgeSurfaces.set(made, surface(plain, false, as.color, as.edge));
  }
  return made;
}
/**
 * A wood surface for a part whose material has no grain (MDF, hardboard): the same
 * colour, never the wood texture. Kept, so such parts share one.
 */
const grainless = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
function withoutGrain(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if (!woods.has(base)) return base;
  let made = grainless.get(base);
  if (!made) grainless.set(base, (made = surface(base.color.getHex())));
  return made;
}
/** A material in a finish: the same surface in the finish's colour. Kept, so parts in one finish share one. */
const finishedMaterials = new Map<string, THREE.MeshStandardMaterial>();
function finished(base: THREE.MeshStandardMaterial, finish: Finish | undefined): THREE.MeshStandardMaterial {
  if (!finish) return base;
  const key = `${base.uuid}:${finish.kind}:${finish.color}`;
  let made = finishedMaterials.get(key);
  if (!made) {
    // A stain lets the wood (or the strands) show; paint covers it. The finish goes over the material's own colour in each look.
    const under = surfaces.get(base)!;
    made = surface(finishedColor(under.plain, finish), false, under.real !== undefined ? finishedColor(under.real, finish) : undefined, showsGrain(finish) ? under.texture : 'smooth');
    // Paint is smoother than bare wood.
    if (finish.kind === 'paint') made.roughness = 0.6;
    finishedMaterials.set(key, made);
    // Its edges are finished too: a stain leaves the plies showing, paint covers them.
    const edge = edgeSurfaces.get(base);
    if (edge) edgeSurfaces.set(made, finished(edge, finish));
  }
  return made;
}
/** A material under a clear coat: the same surface a little deeper and warmer, and smoother. Kept, as the finished ones are. */
const clearedMaterials = new Map<string, THREE.MeshStandardMaterial>();
/** A power hub's bought pieces, each in its own plain colour. */
const tintedMaterials = new Map<number, THREE.MeshStandardMaterial>();
function tinted(colour: number): THREE.MeshStandardMaterial {
  let made = tintedMaterials.get(colour);
  if (!made) tintedMaterials.set(colour, (made = new THREE.MeshStandardMaterial({ color: colour, metalness: 0.1, roughness: 0.5 })));
  return made;
}
const coated = (c: number) => (Math.round(((c >> 16) & 255) * 0.93) << 16) | (Math.round(((c >> 8) & 255) * 0.87) << 8) | Math.round((c & 255) * 0.78);
function cleared(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let made = clearedMaterials.get(base.uuid);
  if (!made) {
    const under = surfaces.get(base)!;
    made = surface(coated(under.plain), false, under.real !== undefined ? coated(under.real) : undefined, under.texture);
    made.roughness = 0.5;
    clearedMaterials.set(base.uuid, made);
    const edge = edgeSurfaces.get(base);
    if (edge) edgeSurfaces.set(made, cleared(edge));
  }
  return made;
}
/** Each part's own solid, with the surfaces it is dressed in and what the colouring looks go by. */
let skins: { mesh: THREE.Mesh; dressed: THREE.Material[]; materialId?: string; partId: string; own: boolean }[] = [];
/** A surface seen through: the same colour, mostly clear. Kept, one a surface. */
const glass = new Map<THREE.Material, THREE.MeshStandardMaterial>();
function glassOf(base: THREE.Material): THREE.MeshStandardMaterial {
  let made = glass.get(base);
  if (!made) glass.set(base, (made = new THREE.MeshStandardMaterial({ color: (base as THREE.MeshStandardMaterial).color, roughness: 0.85, flatShading: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })));
  made.color.copy((base as THREE.MeshStandardMaterial).color);
  return made;
}
/** A flat colour, for the looks that colour the parts. Kept, one a colour. */
const flats = new Map<number, THREE.MeshStandardMaterial>();
function flatOf(colour: number): THREE.MeshStandardMaterial {
  let made = flats.get(colour);
  if (!made) flats.set(colour, (made = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
  return made;
}
/** The line drawing's paper. */
const PAPER = 0xdcdad3;
/** The colours parts are told apart by (tune me): far apart in hue, light enough for a dark outline. */
const PALETTE = [0x6ea8e0, 0xe0a04e, 0x74c08a, 0xd9788a, 0xa98bd6, 0xd9cc5f, 0x5fc4c4, 0xc98a5f, 0x9aa7b8, 0xb5d36a];
/** The part picked out. */
const PICKED = 0xffa726;
/** What is not among them: grey. */
const OTHER = 0x8a8f98;
/** Puts each part's solid in the surfaces of the look that is on, and says what its colours stand for. */
function colourParts() {
  const mode = viewLook.value;
  const keys = new Map<string, number>();
  const keyed = (name: string | undefined) => {
    if (!name) return OTHER;
    if (!keys.has(name)) keys.set(name, PALETTE[keys.size % PALETTE.length]!);
    return keys.get(name)!;
  };
  const coloured = mode === 'material' || mode === 'cut';
  let others = false;
  // A part picked out: it alone is solid, in a colour nothing else has; the rest are seen through, whatever the look.
  const picked = props.selectedPart !== undefined && skins.some((s) => s.partId === props.selectedPart) ? props.selectedPart : undefined;
  for (const s of skins) {
    if (picked !== undefined) s.mesh.material = s.partId === picked ? flatOf(PICKED) : s.dressed.map(glassOf);
    else if (mode === 'seeThrough') s.mesh.material = s.dressed.map(glassOf);
    else if (!s.own || mode === 'realistic' || mode === 'basic') s.mesh.material = s.dressed;
    else if (mode === 'lines') s.mesh.material = flatOf(PAPER);
    else {
      const name = mode === 'material' ? (s.materialId ? props.materialNames?.[s.materialId] : undefined) : props.cutBy?.[s.partId];
      others ||= !name;
      s.mesh.material = flatOf(keyed(name));
    }
  }
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  legend.value = coloured ? [...[...keys].map(([name, c]) => ({ name, colour: hex(c) })), ...(others ? [{ name: mode === 'cut' ? 'Not cut in this job' : 'Other', colour: hex(OTHER) }] : [])] : [];
}
const materials = {
  case: surface(0xd9bf94, true),
  back: surface(0xb9a07a, true),
  frame: surface(0xc9a56c, true),
  /** A front of a material with no grain: MDF's colour, until the view is told its material's. */
  front: surface(0xc2a67e),
  /** A case that is already there (an existing cabinet): a plain shell, in no material or finish of the project's. */
  existing: surface(0xcfc9bd),
  outline: new THREE.LineBasicMaterial({ color: 0x4b3f2c }),
  grain: new THREE.LineBasicMaterial({ color: 0x6b5636, transparent: true, opacity: 0.22 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb4bac2, metalness: 0.55, roughness: 0.4 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x7c828b, metalness: 0.55, roughness: 0.45 }),
  /** An appliance's block: brushed stainless, near enough. */
  appliance: new THREE.MeshStandardMaterial({ color: 0xc2c7ce, metalness: 0.5, roughness: 0.42 }),
  /** An appliance's dark trim (a control strip, a seam, a grille), its glass, and a range's black top. */
  applianceDark: new THREE.MeshStandardMaterial({ color: 0x34383f, metalness: 0.2, roughness: 0.6 }),
  applianceGlass: new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.6, roughness: 0.15 }),
  cooktop: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.3, roughness: 0.5 }),
  /** A sink of white china or fireclay, and a top with its sink in it (cultured marble). */
  porcelain: new THREE.MeshStandardMaterial({ color: 0xf1f0ea, metalness: 0, roughness: 0.25 }),
  hole: new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.2, roughness: 0.8 }),
  printed: new THREE.MeshStandardMaterial({ color: 0x3d4350, metalness: 0.05, roughness: 0.75 }),
  // A caster's wheel, light enough to read against the view's dark background, and its brake pedal.
  wheel: new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.05, roughness: 0.7 }),
  brake: new THREE.MeshStandardMaterial({ color: 0xc0523e, metalness: 0.1, roughness: 0.6 }),
  frontOutline: new THREE.LineBasicMaterial({ color: 0x5d646f }),
  // The room is solid: a floor and painted walls. A wall is drawn on its room side only, so one the camera
  // is outside of is cut away and the inside shows, and from inside the room every wall is there.
  floor: new THREE.MeshStandardMaterial({ color: 0x7d766b, roughness: 0.95, side: THREE.DoubleSide }),
  wall: new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 1, side: THREE.FrontSide }),
  /** Tile on a wall: glazed, so a little shine. Its texture has its own colours (`dressRoom`). */
  wallTile: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, side: THREE.FrontSide }),
  // The ceiling faces down, away from every light: it keeps its own flat colour.
  ceiling: new THREE.MeshBasicMaterial({ color: 0xb4b1aa, side: THREE.FrontSide }),
  // In the realistic look the environment lights it.
  ceilingReal: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 1, side: THREE.FrontSide }),
  lampGlass: new THREE.MeshBasicMaterial({ color: 0xfffaf0, toneMapped: false }),
  /** A window: its painted trim, and what shows through it (the sky, once its picture is made; daylight, so never dimmed). */
  trim: new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.6 }),
  windowGlass: new THREE.MeshBasicMaterial({ color: 0xcfe3f2, toneMapped: false }),
  /** Under a cabinet that stands in no room, in the realistic look: nothing but the shadow it casts. */
  shadow: new THREE.ShadowMaterial({ opacity: 0.2 }),
  roomLine: new THREE.LineBasicMaterial({ color: 0x6d7480 }),
};

function render() {
  renderer?.render(scene, camera);
}

// The lights. Plain: a bright sky, a sun and a fill from the other side. Realistic: the studio environment does
// most of it, and one light casts the shadows: a lamp in the middle of a room's ceiling, or with no room the sun, from above and in front.
// The realistic look is lit warm, like a room in the evening (a cooler light was harsh): its lamp
// and sun about 3000 K, a soft warm light from above with the floor's colour coming back up, and less of the studio
// environment, which is a cool white.
const WARM = 0xffd9ae;
const hemi = new THREE.HemisphereLight(0xffffff, 0x30343c, 1.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
const fill = new THREE.DirectionalLight(0xffffff, 0.7);
fill.position.set(700, 200, 500);
const PLAIN_SUN = new THREE.Vector3(-400, 600, 900);
const REAL_SUN = new THREE.Vector3(-0.42, 0.78, 0.62).normalize();
/** Half the diagonal of what is shown, mm: the shadows are worked out over a box that size. */
let shownRadius = 1000;
/** How far off the view was framed (no room), for `pose` to keep its distance. */
let shownReach = 0;
/** The usual way to the eye: from the front, to the right and a little above. */
const USUAL_FROM: [number, number, number] = [0.55, 0.3, 0.8];
/** Where the eye is, `reach` off: along the pose's way, as far as the usual view stands. */
function eyeAt(reach: number): [number, number, number] {
  const from = props.pose?.from ?? USUAL_FROM;
  const k = (reach * Math.hypot(...USUAL_FROM)) / (Math.hypot(...from) || 1);
  return [from[0] * k, from[1] * k, from[2] * k];
}
/** Half the size of what is shown, each way, mm: what the view is fitted to. */
let shownHalf: [number, number, number] = [500, 500, 500];
/** How much room is left round what is shown when the view is fitted to it. Tune me. */
const FIT_MARGIN = 1.12;
/**
 * How far off the eye stands for what is shown to fill the view, as `eyeAt`
 * takes it: the box of what is shown, wider by how far its parts start pulled apart, seen along the way to the eye,
 * every corner inside the picture with a little room round it.
 */
function fittedReach(): number {
  const from = new THREE.Vector3(...(props.pose?.from ?? USUAL_FROM)).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(from).normalize();
  const up = from.clone().cross(right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * (camera.aspect || 1);
  const apart = ((assembly?.explodeDistance ?? 0) * explode.value) / 100;
  let far = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const p = new THREE.Vector3(sx * (shownHalf[0] + apart), sy * (shownHalf[1] + apart), sz * (shownHalf[2] + apart));
        far = Math.max(far, p.dot(from) + Math.abs(p.dot(right)) / tanH, p.dot(from) + Math.abs(p.dot(up)) / tanV);
      }
  return (far * FIT_MARGIN) / Math.hypot(...USUAL_FROM);
}
/** The ceilings: the room's, and the next room's past each open side. */
let ceilings: THREE.Mesh[] = [];
let catcher: THREE.Mesh | undefined;
/** In a room, the realistic look's light is a lamp on the ceiling in the middle of the room, drawn as a fixture. */
const lamp = new THREE.PointLight(WARM, 0, 0, 0);
let fixture: THREE.Mesh | undefined;
let shownRoom: Shown['room'];
/** How far the lamp hangs under the ceiling, mm. */
const LAMP_DROP = 140;

/** Puts the sun where the look has it, its shadow box round what is shown (which is centred on the origin). */
function placeSun() {
  const real = realistic.value;
  const room = real ? shownRoom : undefined;
  // Soft: the environment does most of the lighting, the one direct light only gives the shadows their direction.
  hemi.intensity = real ? 0.75 : 1.6;
  hemi.color.set(real ? 0xffecd6 : 0xffffff);
  hemi.groundColor.set(real ? 0xa98c6a : 0x30343c);
  sun.color.set(real ? WARM : 0xffffff);
  fill.intensity = real ? 0 : 0.7;
  sun.intensity = !real ? 2.2 : room ? 0 : 1.2;
  sun.castShadow = real && !room;
  lamp.intensity = room ? 0.85 : 0;
  lamp.castShadow = !!room;
  if (fixture) fixture.visible = !!room;
  if (!real) return void sun.position.copy(PLAIN_SUN);
  const r = shownRadius;
  if (room) {
    // The middle of the room, just under the ceiling; the room stands where the content does.
    lamp.position.set(room.length / 2, room.ceiling - LAMP_DROP, room.width / 2).add(content.position);
    lamp.shadow.camera.near = 40;
    lamp.shadow.camera.far = 3 * r + NEXT_ROOM.deep;
    lamp.shadow.camera.updateProjectionMatrix();
    return;
  }
  sun.position.copy(REAL_SUN).multiplyScalar(2 * r);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5 * r, far: 3.5 * r });
  sun.shadow.camera.updateProjectionMatrix();
}

/** Switches everything that differs between the two looks, and draws. */
function applyLook() {
  if (!renderer) return;
  const real = realistic.value;
  if (real && !look) look = { environment: new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture, wood: woodTexture(), strands: strandsTexture(), plies: pliesTexture(), pressed: pressedTexture(), floor: floorTexture() };
  // AgX: a gentle curve, whites rolling off without the hard contrast of a filmic one.
  renderer.toneMapping = real ? THREE.AgXToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = real ? 1.25 : 1;
  renderer.shadowMap.enabled = real;
  scene.environment = real ? look!.environment : null;
  scene.environmentIntensity = 0.4;
  for (const lines of [materials.outline, materials.frontOutline, materials.roomLine]) lines.visible = !real;
  // The grain's streaks are the basic look's: the others have no wood to show.
  materials.grain.visible = viewLook.value === 'basic';
  for (const made of surfaces.keys()) dress(made);
  colourParts();
  dressRoom(shownRoom);
  for (const ceiling of ceilings) ceiling.material = real ? materials.ceilingReal : materials.ceiling;
  if (catcher) catcher.visible = real;
  placeSun();
  // A material is compiled for the lights, shadows and maps it had: all are made again.
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) for (const m of [child.material].flat() as THREE.Material[]) m.needsUpdate = true;
  });
  render();
}

/** The floor textures of a chosen kind, made when first shown, and the wall tile's, made again when its look or colours change. */
const floorKinds = new Map<string, THREE.Texture>();
let wallTileKey = '';

/**
 * A room's floor and walls as its look has them: the floor's kind and colour, the walls'
 * paint, the tile's texture. With no look, the plank floor and the walls the view has always drawn.
 */
function dressRoom(room: Shown['room']) {
  const real = realistic.value;
  const chosen = room?.look;
  const floor = chosen?.floor;
  if (!floor) {
    materials.floor.map = real ? (look?.floor ?? null) : null;
    materials.floor.color.set(real ? 0xffffff : 0x7d766b);
  } else {
    let map: THREE.Texture | null = null;
    if (real && floor.kind !== 'plain') {
      try {
        if (!floorKinds.has(floor.kind)) floorKinds.set(floor.kind, floorKindTexture(floor.kind));
        map = floorKinds.get(floor.kind)!;
      } catch {
        // No canvas to draw it on: the floor keeps its plain colour.
      }
    }
    materials.floor.map = map;
    materials.floor.color.set(floor.color);
  }
  materials.wall.color.set(chosen?.wall ?? (real ? 0xd3cab8 : 0xa9a59c));
  const tile = chosen?.tile;
  const key = tile ? `${tile.look}|${tile.color}|${tile.grout}` : '';
  if (key !== wallTileKey) {
    materials.wallTile.map?.dispose();
    materials.wallTile.map = null;
    materials.wallTile.color.set(tile?.color ?? 0xffffff);
    if (tile) {
      try {
        materials.wallTile.map = wallTileTexture(tile.look, tile.color, tile.grout);
        materials.wallTile.color.set(0xffffff);
      } catch {
        // No canvas: the tile is its plain colour.
      }
    }
    wallTileKey = key;
  }
  materials.floor.needsUpdate = materials.wallTile.needsUpdate = true;
}

/** A floor or a ceiling: a flat rectangle `across` by `deep` (along X and Z), laid out so the plank floor's boards are their real size. */
function flat(across: number, deep: number, x: number, y: number, z: number, material: THREE.Material, faceUp: boolean): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(across, deep);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * across) / FLOOR_TILE, (uv.getY(i) * deep) / FLOOR_TILE);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = faceUp ? -Math.PI / 2 : Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

/** Every solid thing casts a shadow and takes them; the room's floor and walls only take them. */
function shadowed(root: THREE.Object3D, cast: boolean) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = cast;
    child.receiveShadow = true;
  });
}

function geometryOf(mesh: SolidMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  return geometry;
}

function clear() {
  content.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose();
  });
  content.clear();
  placed = [];
  skins = [];
  hingeFixed = [];
  hingeLinks = [];
  slideMembers = [];
}

const turn = new THREE.Matrix4();
const move = new THREE.Matrix4();

function apply() {
  const reach = ((assembly?.explodeDistance ?? 0) * explode.value) / 100;
  const angle = THREE.MathUtils.degToRad(openDeg.value);
  for (const { object, part } of placed) {
    object.visible = (showTop.value || !isTopPart(part)) && (showFronts.value || !isFrontPart(part));
    object.matrix
      .makeBasis(new THREE.Vector3(...part.axes[0]), new THREE.Vector3(...part.axes[1]), new THREE.Vector3(...part.axes[2]))
      .setPosition(part.offset[0], part.offset[1], part.offset[2]);
    if (part.follows) continue;
    if (part.swingsIn) {
      // A bracket under a drop leaf swings in under the top while a leaf's legs fold, before the leaf goes down.
      const [x, z] = part.swingsIn.at;
      object.matrix
        .premultiply(move.makeTranslation(-x, 0, -z))
        .premultiply(turn.makeRotationY(part.swingsIn.sign * Math.min(1, leafDown.value / LEAF_LEGS_UNTIL) * (Math.PI / 2)))
        .premultiply(move.makeTranslation(x, 0, z));
      continue;
    }
    if (part.foldsAbout) {
      // A table's leaf, in two steps over the slider's travel: its legs fold flat against it, then it swings a quarter
      // turn down about the joint's lower edge.
      const legs = Math.min(1, leafDown.value / LEAF_LEGS_UNTIL);
      const down = Math.max(0, (leafDown.value - LEAF_LEGS_UNTIL) / (100 - LEAF_LEGS_UNTIL));
      if (part.foldsAcross) {
        // A leaf on an end: its legs fold about a line across the cabinet, and it swings down about one from front to back.
        if (part.foldsFirst) {
          const [y, z] = part.foldsFirst.at;
          object.matrix
            .premultiply(move.makeTranslation(0, -y, -z))
            .premultiply(turn.makeRotationX(part.foldsFirst.sign * legs * (Math.PI / 2)))
            .premultiply(move.makeTranslation(0, y, z));
        }
        const [x, y] = part.foldsAbout;
        object.matrix
          .premultiply(move.makeTranslation(-x, -y, 0))
          .premultiply(turn.makeRotationZ(-part.foldsAcross * down * (Math.PI / 2)))
          .premultiply(move.makeTranslation(x, y, 0));
        continue;
      }
      if (part.foldsFirst) {
        const [x, y] = part.foldsFirst.at;
        object.matrix
          .premultiply(move.makeTranslation(-x, -y, 0))
          .premultiply(turn.makeRotationZ(part.foldsFirst.sign * legs * (Math.PI / 2)))
          .premultiply(move.makeTranslation(x, y, 0));
      }
      const [y, z] = part.foldsAbout;
      object.matrix
        .premultiply(move.makeTranslation(0, -y, -z))
        .premultiply(turn.makeRotationX((part.foldsFront ? 1 : -1) * down * (Math.PI / 2)))
        .premultiply(move.makeTranslation(0, y, z));
    }
    if (part.tiltsAbout) {
      // A tilt-out false front and its tray: forward about the front's bottom edge, a few degrees over the slider's travel.
      const [y, z] = part.tiltsAbout;
      object.matrix
        .premultiply(move.makeTranslation(0, -y, -z))
        .premultiply(turn.makeRotationX(THREE.MathUtils.degToRad((openDeg.value / MAX_DOOR_OPEN_DEG) * FALSE_FRONT.tiltDeg)))
        .premultiply(move.makeTranslation(0, y, z));
    } else if (part.turnsAbout) {
      // With a lazy susan: half a turn over the slider's travel, about its pole.
      const [x, z] = part.turnsAbout;
      object.matrix
        .premultiply(move.makeTranslation(-x, 0, -z))
        .premultiply(turn.makeRotationY((openDeg.value / MAX_DOOR_OPEN_DEG) * Math.PI))
        .premultiply(move.makeTranslation(x, 0, z));
    } else if (part.hinges) {
      // On its hinges: turned by the door's angle, and carried to where the linkage has its hinged corner.
      const h = part.hinges;
      const pose = placedDoorPose(part, openDeg.value);
      const [x, z] = [h.origin.x + h.dir * h.mount.closed[0], h.origin.z + h.mount.closed[1]];
      object.matrix
        .premultiply(move.makeTranslation(-x, 0, -z))
        .premultiply(turn.makeRotationY(-h.dir * THREE.MathUtils.degToRad(pose.deg)))
        .premultiply(move.makeTranslation(x + h.dir * (pose.corner[0] - h.mount.closed[0]), 0, z + pose.corner[1] - h.mount.closed[1]));
    } else if (part.swing && angle) {
      // About the vertical line through the pivot.
      const [x, , z] = part.swing.pivot;
      object.matrix
        .premultiply(move.makeTranslation(-x, 0, -z))
        .premultiply(turn.makeRotationY(part.swing.sign * angle))
        .premultiply(move.makeTranslation(x, 0, z));
      // An inset door comes across into its opening as it opens, clear of the case side.
      const clear = part.swing.clear;
      if (clear) object.matrix.premultiply(move.makeTranslation(clear.toward * insetSwingShift(clear, angle), 0, 0));
    }
    const out = pulled(part);
    object.matrix.premultiply(move.makeTranslation(part.explode[0] * reach + out.x, part.explode[1] * reach, part.explode[2] * reach + out.z));
  }
  // A bi-fold pair's second door: unfolded from the first about their knuckle, then carried wherever the first has gone.
  for (const { object, part } of placed) {
    const f = part.follows;
    if (!f) continue;
    const lead = placed.find((p) => p.part.partId === f.partId);
    const [x, , z] = f.knuckle;
    object.matrix
      .premultiply(move.makeTranslation(-x, 0, -z))
      .premultiply(turn.makeRotationY(f.sign * THREE.MathUtils.degToRad(Math.min(openDeg.value, BIFOLD_UNFOLD_DEG))))
      .premultiply(move.makeTranslation(x, 0, z));
    if (lead) {
      const closed = new THREE.Matrix4()
        .makeBasis(new THREE.Vector3(...lead.part.axes[0]), new THREE.Vector3(...lead.part.axes[1]), new THREE.Vector3(...lead.part.axes[2]))
        .setPosition(lead.part.offset[0], lead.part.offset[1], lead.part.offset[2]);
      object.matrix.premultiply(closed.invert()).premultiply(lead.object.matrix);
    }
  }
  // The hinges: what is on the case goes with the case in the exploded view; a link runs from
  // its pivot in the arm to its pivot in the cup, wherever the door has taken that.
  for (const hinge of [...hingeFixed, ...hingeLinks]) hinge.mesh.visible = showFronts.value;
  for (const fixed of hingeFixed) fixed.mesh.position.set(fixed.at.x + fixed.explode[0] * reach, fixed.at.y + fixed.explode[1] * reach, fixed.at.z + fixed.explode[2] * reach);
  for (const { mesh, part, height, link } of hingeLinks) {
    const h = part.hinges!;
    mesh.visible = reach === 0 && showFronts.value;
    if (reach !== 0) continue;
    const from = h.shapes.links[link]!.fixed;
    const to = placedDoorPose(part, openDeg.value).pivots[link];
    layBar(mesh, h.origin.x + h.dir * from[0], h.origin.z + from[1], h.origin.x + h.dir * to[0], h.origin.z + to[1], height);
  }
  // The slides: the cabinet member stays, the drawer member goes with the drawer and the middle one half as far.
  // Hidden in the exploded view, where the box and the case side part company.
  for (const m of slideMembers) {
    // (With the drawers hidden, only the member on the cabinet is left.)
    m.object.visible = reach === 0 && (showFronts.value || m.share === 0 || !isFrontPart(m.part));
    const out = pulled(m.part);
    // The slides of a tray that comes forward on a platform go across with the platform, whole, and open forward by their share.
    const sideways = m.part.forwardStage ? 1 : m.share;
    m.object.position.set(m.at.x + out.x * sideways, m.at.y, m.at.z + out.z * m.share);
  }
  render();
}

/**
 * How far a part has come out for where the drawer slider is: forward (+Z), as a drawer or a tray does, or
 * across the cabinet (X), as a blind corner tray does. A blind corner cabinet's trays go one after another, in
 * the order they are used (`PlacedPart.pullStage`): the slider is in as many equal steps as the cabinet has.
 */
function pulled(part: PlacedPart): { x: number; z: number } {
  const p = drawerOut.value / 100;
  if (!part.pullStage) return { x: 0, z: (part.slide ?? 0) * (part.pullShare ?? 1) * p };
  const n = part.pullStages ?? part.pullStage;
  const step = (k: number) => Math.min(1, Math.max(0, p * n - (k - 1)));
  if (part.across === undefined) return { x: 0, z: (part.slide ?? 0) * step(part.pullStage) };
  return { x: part.across * step(part.pullStage), z: part.forwardStage ? (part.slide ?? 0) * step(part.forwardStage) : 0 };
}

/**
 * A drawer slide beside a box side, as its three members seen in section: the cabinet
 * member, a channel screwed to the case side (or its strip); the middle member, a
 * smaller channel inside it on the ball races; and the drawer member, a flat bar on
 * the box side. Each runs the slide's length from its front end.
 */
function addSlide(part: PlacedPart) {
  const s = part.runsOn!;
  const t = 1.2; // the steel's thickness, near enough
  const c = s.clearance;
  /** A channel, or a bar with no flanges: `from` and `to` across the clearance from the outer face, its height, and which way its flanges open. */
  const member = (from: number, to: number, height: number, flanges: boolean, material: THREE.Material) => {
    const group = new THREE.Group();
    const piece = (u0: number, u1: number, y0: number, y1: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, Math.abs(u1 - u0)), y1 - y0, s.length), material);
      // (Turned across the cabinet, this X becomes Z the other way round for a slide that faces +X.)
      mesh.position.set(((s.turn === 1 ? -s.dir : s.dir) * (u0 + u1)) / 2, (y0 + y1) / 2, -s.length / 2);
      group.add(mesh);
    };
    piece(from, from + t, -height / 2, height / 2);
    if (flanges) {
      piece(from, to, height / 2 - t, height / 2);
      piece(from, to, -height / 2, -height / 2 + t);
    }
    return group;
  };
  /** A bottom-mount roller slide's drawer member: an angle, its upright on the box side and its flange under the side's bottom edge. */
  const angle = () => {
    const group = member(c - t, c, s.height * 0.6, false, materials.metal);
    group.children[0]!.position.y = -s.height * 0.2;
    const flange = new THREE.Mesh(new THREE.BoxGeometry(12, t, s.length), materials.metal);
    flange.position.set((s.turn === 1 ? -s.dir : s.dir) * (c + 6 - t), -s.height / 2 - t / 2, -s.length / 2);
    group.add(flange);
    return group;
  };
  const members: [THREE.Object3D, number][] = s.bottom
    ? [
        [member(0, c * 0.7, s.height, true, materials.metal), 0],
        [angle(), 1],
      ]
    : [
    [member(0, c * 0.55, s.height, true, materials.metal), 0],
    [member(c * 0.3, c * 0.8, s.height * 0.72, true, materials.metalDark), s.extension === 'threeQuarter' ? 0.4 : 0.5],
    [member(c - t, c, s.height * 0.5, false, materials.metal), 1],
  ];
  for (const [object, share] of members) {
    // A slide across the cabinet is the same slide turned a quarter: its length along X, its front end toward the door opening.
    if (s.turn) object.rotation.y = (s.turn * Math.PI) / 2;
    const at = s.turn ? new THREE.Vector3(s.front, s.y, s.outer) : new THREE.Vector3(s.outer, s.y, s.front);
    object.position.copy(at);
    target.add(object);
    slideMembers.push({ object, at, share, part });
  }
}

/**
 * The pair of bottom-mount slides under a tray on the cabinet's floor: for each, the cabinet member screwed
 * to the floor, a middle member over it and the drawer member under the tray's bottom, which comes out with it.
 */
function addUnderSlides(part: PlacedPart) {
  const s = part.runsUnder!;
  const layer = (x: number, from: number, to: number, width: number, material: THREE.Material, share: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, s.height * (to - from), s.length), material);
    mesh.position.set(0, 0, -s.length / 2);
    const group = new THREE.Group();
    group.add(mesh);
    const at = new THREE.Vector3(x, s.top - s.height * (1 - (from + to) / 2), s.front);
    group.position.copy(at);
    target.add(group);
    slideMembers.push({ object: group, at, share, part });
  };
  for (const x of s.xs) {
    layer(x, 0, 0.4, s.width, materials.metal, 0);
    layer(x, 0.4, 0.75, s.width * 0.8, materials.metalDark, 0.5);
    layer(x, 0.75, 1, s.width * 0.6, materials.metal, 1);
  }
}

/**
 * A front's handle, on the holes drilled for it: a knob on one, a pull across two. It is
 * the front's, so it goes with it. The front's solid has its show face at Z = its
 * thickness; where the front of a drawer box is the front, the show face is the other
 * one (its work is on the inside).
 */
function addHandle(front: THREE.Group, part: PlacedPart, source: Part) {
  const holes = source.features.flatMap((f) => (f.kind === 'hole' && f.id.startsWith('handle') ? [f] : []));
  const handle = props.hardware?.find((h) => h.kind === 'handle' && h.id === holes[0]?.hardwareId);
  if (!holes.length || handle?.kind !== 'handle') return;
  const { length, projection, thickness } = handle.look;
  // A handle's projection is how far its outside stands off the front: its head or its bar is the last of that, on a stem that much shorter.
  const stand = Math.max(2, projection - thickness);
  const [flat, out] = part.role === 'boxFront' ? [0, -1] : [source.size.thickness, 1];
  // The handle stands on the surface its holes are in: on a shaker front that is the recessed panel, not the frame's face.
  // Where its feet are at different levels it sits on the higher one, and the other post reaches down.
  const sinks = holes.map((hole) => (part.role ? 0 : surfaceBelowFace(source, hole.center)));
  const face = flat - out * Math.min(...sinks);
  const post = (x: number, y: number, i: number) => {
    const reach = stand + sinks[i]! - Math.min(...sinks);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness / 2, thickness / 2, reach, 20), materials.metal);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, face + out * (stand - reach / 2));
    return mesh;
  };
  const [a, b] = [holes[0]!.center, holes[holes.length - 1]!.center];
  const made = madeHandle(handle);
  if (made) {
    // A handle made here is drawn from the profile it is made from: along its holes, standing off the show face.
    // A wooden one is as wide as its part is thick.
    const width = props.parts.find((p) => p.id === `${source.id}-handle`)?.size.thickness ?? made.width;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const along = span > 0 ? new THREE.Vector3((b.x - a.x) / span, (b.y - a.y) / span, 0) : new THREE.Vector3(1, 0, 0);
    const off = new THREE.Vector3(0, 0, out);
    const across = new THREE.Vector3().crossVectors(along, off);
    const at = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, face);
    let geometry: THREE.BufferGeometry;
    if (made.design === 'knob') {
      geometry = new THREE.LatheGeometry(knobProfile(handle).map(([r, z]) => new THREE.Vector2(r, z)), 32);
    } else {
      const shape = new THREE.Shape(pullProfile(handle).map(([x, y]) => new THREE.Vector2(x, y)));
      geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
      at.addScaledVector(across, -width / 2);
    }
    const mesh = new THREE.Mesh(geometry, made.how === 'cnc' ? finished(materials.frame, drawnFinish.value?.handles) : materials.printed);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(along, off, across).setPosition(at);
    front.add(mesh, edgesOf(mesh, geometry));
  } else if (holes.length === 1 || handle.holes === 1) {
    // A knob: a round head on its stem; two of them on a wide drawer that asks for two.
    holes.forEach((hole, i) => {
      front.add(post(hole.center.x, hole.center.y, i));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(length / 2, length / 2.6, thickness, 28), materials.metal);
      head.rotation.x = (out * Math.PI) / 2;
      head.position.set(hole.center.x, hole.center.y, face + out * (stand + thickness / 2));
      front.add(head);
    });
  } else {
    // A pull: a bar across its two posts, a little longer than they are apart.
    holes.forEach((hole, i) => front.add(post(hole.center.x, hole.center.y, i)));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, thickness), materials.metal);
    bar.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    bar.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, face + out * (stand + thickness / 2));
    front.add(bar);
  }
  // Its screws, from the back.
  for (const hole of holes) {
    for (const piece of screwPieces(7)) {
      piece.mesh.rotation.x = Math.PI / 2;
      piece.mesh.position.set(hole.center.x, hole.center.y, source.size.thickness - flat - out * piece.out);
      front.add(piece.mesh);
    }
  }
}

/** The edges of a mesh, drawn where it is. */
function edgesOf(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): THREE.LineSegments {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), materials.outline);
  lines.matrixAutoUpdate = false;
  lines.matrix.copy(mesh.matrix);
  return lines;
}

/**
 * A screw in its hole, as three discs along one axis (Y, until it is turned): the dark
 * ring of the hole round the head, the head, and the dark recess for the driver. `out`
 * is how far each one's middle stands off the face it is screwed into.
 */
function screwPieces(head: number): { mesh: THREE.Mesh; out: number }[] {
  const disc = (diameter: number, tall: number, material: THREE.Material, out: number) => ({ mesh: new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, tall, 20), material), out });
  return [disc(head + 1.6, 0.3, materials.hole, 0.15), disc(head, 1.2, materials.metal, 0.6), disc(head * 0.4, 0.3, materials.hole, 1.35)];
}

/** Lays a bar (a box as long as it is, along its own X) from one point to another, seen from above, at a height. */
function layBar(mesh: THREE.Mesh, x0: number, z0: number, x1: number, z1: number, y: number) {
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
}

type Shown = { parts: Part[]; cabinets?: { id: string; at: Vec3; turn?: number; partIds: string[] }[]; room?: { length: number; width: number; ceiling: number; open?: string[]; windows?: { at: Vec3; turn: number; width: number; height: number }[]; look?: RoomLook; tiles?: { at: Vec3; turn: number; width: number; height: number }[] } };

function show(response: SolidResponse, { parts, cabinets, room }: Shown) {
  clear();
  // Each cabinet is assembled in its own frame, then its group is set down where it stands and turned to face the room.
  const groups = (cabinets ?? [{ id: '', at: [0, 0, 0] as Vec3, turn: 0, partIds: parts.map((p) => p.id) }]).map((c) => ({
    ...c,
    assembly: buildCabinetAssembly(
      parts.filter((p) => c.partIds.includes(p.id)),
      props.hardware,
      props.slides,
    ),
  }));
  const all = groups.flatMap((g) => g.assembly.parts);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  assembly = { parts: all, min, max, explodeDistance: Math.max(0, ...groups.map((g) => g.assembly.explodeDistance)) };
  hasDoors.value = all.some((p) => p.swing || p.turnsAbout || p.tiltsAbout || p.follows);
  hasDrawers.value = all.some((p) => p.slide);
  hasLeaf.value = all.some((p) => p.foldsAbout);
  hasTop.value = all.some(isTopPart) && all.some((p) => !isTopPart(p));
  hasFronts.value = all.some(isFrontPart) && all.some((p) => !isFrontPart(p));
  for (const g of groups) {
    const group = new THREE.Group();
    group.position.set(...g.at);
    group.rotation.y = THREE.MathUtils.degToRad(g.turn ?? 0);
    group.updateMatrix();
    content.add(group);
    target = group;
    // The box it fills, where it stands: what the camera frames.
    if (g.assembly.parts.length) {
      for (const x of [g.assembly.min[0], g.assembly.max[0]])
        for (const y of [g.assembly.min[1], g.assembly.max[1]])
          for (const z of [g.assembly.min[2], g.assembly.max[2]]) {
            const v = new THREE.Vector3(x, y, z).applyMatrix4(group.matrix);
            [v.x, v.y, v.z].forEach((c, i) => {
              min[i] = Math.min(min[i]!, c);
              max[i] = Math.max(max[i]!, c);
            });
          }
    }
    for (const part of g.assembly.parts.map((p) => (cabinets ? { ...p, cabinetId: g.id } : p))) {
      const solid = response.meshes?.find((m) => m.partId === part.partId);
      if (!solid) continue;
      const geometry = geometryOf(solid.mesh);
      const source = parts.find((p) => p.id === part.partId);
      // Laid out for a texture along its grain, the pattern shifted by a number made from its id.
      let shift = 0;
      for (const ch of part.partId) shift = (shift * 31 + ch.charCodeAt(0)) % 997;

      // A front of a wood (one with grain) is drawn as wood; an MDF one in MDF's grey.
      const front = source?.grain ? materials.frame : materials.front;
      // An appliance is a plain block of metal, with no finish of the project's.
      const appliance = isApplianceShape(part.partId);
      // A hub's bought pieces have their own colours; a bought top with its sink in it is white.
      const tint = hubShapeColour(part.partId) ?? (isSinkTop(part.partId) ? SINK_TOP_COLOUR : undefined);
      const bare = tint !== undefined ? tinted(tint) : appliance ? materials.appliance : source?.existing ? materials.existing : part.role === 'top' || part.role === 'topEdge' ? materials.frame : !part.role || part.role === 'blindPanel' ? front : part.role === 'back' ? materials.back : part.role === 'frameStile' || part.role === 'frameRail' || part.role === 'buildOut' ? materials.frame : materials.case;
      // Its finish: the fronts' for a door or a drawer front (the front of the box, where that is the drawer's front),
      // none for the rest of a drawer box, the case's for everything else.
      const showFront = !part.role || part.role === 'blindPanel' || (part.role === 'boxFront' && !parts.some((p) => !p.role && p.designObjectId === source?.designObjectId));
      const top = part.role === 'top' || part.role === 'topEdge';
      const finish = appliance || tint !== undefined || source?.existing ? undefined : top ? drawnFinish.value?.tops : showFront ? drawnFinish.value?.fronts : part.role?.startsWith('box') ? undefined : drawnFinish.value?.case;
      // Only a material with grain (a plywood, a solid wood) is drawn as wood; an appliance's block has none to speak of.
      // Its material's look, when the view was told it; else wood only where the material has grain.
      const as = !appliance && tint === undefined && source && !source.existing ? props.looks?.[source.materialId] : undefined;
      const wood = as ? typed(bare, as) : appliance || source?.grain ? bare : withoutGrain(bare);
      // Each face as it is finished: a side painted outside and bare inside, a back bare against the wall.
      const faces = appliance || source?.existing ? undefined : props.faces?.[part.partId];
      const finishOf = (face: FaceFinish | undefined): Finish | undefined => (face === undefined || face === 'shown' ? finish : face === 'case' ? drawnFinish.value?.case : undefined);
      const dressed = (face: FaceFinish | undefined) => (face === 'clear' && showFinish.value ? cleared(wood) : finished(wood, finishOf(face)));
      const rim = dressed(faces?.edges);
      const object = new THREE.Group();
      object.matrixAutoUpdate = false;
      // Its faces and its edges, which may have a look of their own, laid out once across the part's thickness.
      const edge = edgeSurfaces.get(rim);
      const skin = withTextureCoordinates(geometry, source?.grain, shift / 997, edge ? source?.size.thickness : undefined);
      // A sink is drawn as itself, not as the block that stands for it.
      if (source?.sinkLook) object.add(sinkObject(source.sinkLook, { steel: materials.appliance, white: materials.porcelain, dark: materials.applianceDark }));
      else {
        const solidMesh = new THREE.Mesh(skin, [dressed(faces?.A), dressed(faces?.B), edge ?? rim]);
        skins.push({ mesh: solidMesh, dressed: solidMesh.material as THREE.Material[], materialId: source?.materialId, partId: part.partId, own: !!source && !appliance && tint === undefined && !source.existing });
        object.add(solidMesh);
        // A torsion table's inner ribs get no outline: they are shut in between its skins, and at a shallow angle their
        // outlines would draw through a thin skin (every surface is set back a little in depth for its own outline's sake,
        // by more the shallower it is seen). The ribs round its edge, which show, keep theirs.
        const innerRib = part.role === 'rib' && /^(Long|Short) rib\b/.test(source?.name ?? '');
        if (!innerRib) object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), part.role ? materials.outline : materials.frontOutline));
      }
      // The grain: faint streaks on both faces. The solid's Z runs from the back face (0) up to face A (the thickness).
      const lift = 0.15;
      const streaked = source ? [...(showsGrain(finishOf(faces?.A)) ? [source.size.thickness + lift] : []), ...(showsGrain(finishOf(faces?.B)) ? [-lift] : [])] : [];
      const lines = source && streaked.length ? grainStreaks(source) : [];
      if (source && lines.length) {
        const points = streaked.flatMap((z) => lines.flatMap(([x0, y0, x1, y1]) => [x0, y0, z, x1, y1, z]));
        const drawn = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), materials.grain);
        object.add(drawn);
      }
      target.add(object);
      placed.push({ object, part });
      if (part.hinges && source) addHinges(object, part, source);
      if (source) addHandle(object, part, source);
      if (part.runsOn) addSlide(part);
      if (part.runsUnder) addUnderSlides(part);
      if (part.partId.endsWith('/bottom-under')) addCasters(object, part.partId.slice(0, -'/bottom-under'.length));
      // On pads, the cabinet's casters are drawn with its first pad, each where its own pad is (the pad's corner is its origin).
      if (part.partId.endsWith('/caster-pad-1') && source?.placement) addCasters(object, part.partId.slice(0, -'/caster-pad-1'.length), source.placement.origin[0], -source.placement.origin[2]);
      // Bought feet screwed straight to the bottom (no pad, no layer): drawn with the bottom, whose underside is the case's.
      if (part.partId.endsWith('/bottom') && source?.placement && !parts.some((p) => p.id === `${source.designObjectId}/caster-pad-1` || p.id === `${source.designObjectId}/bottom-under`))
        addCasters(object, part.partId.slice(0, -'/bottom'.length), source.placement.origin[0], -source.placement.origin[2]);
      const look = props.appliances?.find((a) => a.partId === part.partId);
      if (look && source) addApplianceLook(object, look.kind, source.size, look.kick);
    }
  }
  target = content;
  if (!all.length) [0, 1, 2].forEach((i) => ((min[i] = 0), (max[i] = 0)));
  // The middle of what stands in the room, before the room widens the box: where the view looks.
  const middle: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  drawRoom(room, min[1]);
  colourParts();
  shadowed(content, true);
  // A room is framed whole; otherwise what is shown.
  if (room) {
    min[0] = Math.min(min[0], 0);
    min[2] = Math.min(min[2], 0);
    max[0] = Math.max(max[0], room.length);
    max[2] = Math.max(max[2], room.width);
    min[1] = Math.min(min[1], 0);
    max[1] = Math.max(max[1], room.ceiling);
  }

  // Centre the assembled cabinet on the origin so orbiting turns it in place.
  content.position.set(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -(min[2] + max[2]) / 2);
  roomLayer.position.copy(content.position);
  shownRadius = Math.max(500, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  shownRoom = room;
  placeSun();
  if (!framed) {
    // In a room: far enough for its depth range. Otherwise the view is fitted to what is shown (and kept while sizes are edited).
    shownHalf = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
    camera.fov = room ? 58 : 35;
    const reach = room ? Math.max((max[0] - min[0]) * 1.5, (max[1] - min[1]) * 2, (max[2] - min[2]) * 1.5) : fittedReach();
    if (room) {
      // In a room the view starts inside it, as if standing there: at eye height in the corner farthest from the
      // cabinets (a step in from the walls), looking at them about counter height, through a wider lens.
      const at = content.position;
      const corners = [0.14, 0.86].flatMap((u) => [0.14, 0.86].map((v): [number, number] => [room.length * u, room.width * v]));
      const far = corners.reduce((best, c) => (Math.hypot(c[0] - middle[0], c[1] - middle[2]) > Math.hypot(best[0] - middle[0], best[1] - middle[2]) ? c : best));
      camera.fov = 58;
      camera.position.set(far[0] + at.x, Math.min(EYE_HEIGHT, room.ceiling * 0.8) + at.y, far[1] + at.z);
      // At the middle of what stands there: about counter height in a kitchen with uppers, lower at a table.
      controls?.target.set(middle[0] + at.x, Math.min(LOOK_HEIGHT, middle[1]) + at.y, middle[2] + at.z);
      // Not under the floor.
      if (controls) controls.maxPolarAngle = Math.PI / 2 - 0.02;
      camera.near = 20;
    } else {
      camera.fov = 35;
      shownReach = reach;
      const eye = eyeAt(reach);
      camera.position.set(eye[0], eye[1], eye[2]);
      controls?.target.set(0, 0, 0);
      if (controls) controls.maxPolarAngle = Math.PI;
      // The depth range follows the size of what is shown: a whole project seen from far off keeps its depth precision,
      // so lines on the backs of the doors do not show through their faces.
      camera.near = Math.max(1, reach / 100);
    }
    camera.far = reach * 20;
    camera.updateProjectionMatrix();
    controls?.update();
    framed = true;
  }
  status.value = '';
  apply();
}

/** The next room, past a side of the room that is open: how far it goes on, and how much wider it is at each end, mm. Tune me. */
const NEXT_ROOM = { deep: 3900, wider: 1500 };
/** Where the view stands and looks in a room, off the floor, mm: a standing eye, and about counter height. */
const EYE_HEIGHT = 1600;
const LOOK_HEIGHT = 1050;

/**
 * The room, solid: the floor and the four walls, the ceiling as a line round its edge.
 * A wall faces into the room and is drawn on that side only: from inside the room every
 * wall is there, and from outside the wall between the camera and the cabinets is cut
 * away so the inside shows.
 */
function drawRoom(room: Shown['room'], ground = 0) {
  roomLayer.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.LineLoop) child.geometry.dispose();
  });
  roomLayer.clear();
  catcher = fixture = undefined;
  ceilings = [];
  if (!room) {
    // No room: in the realistic look the cabinet still stands on something, which shows only its shadow.
    catcher = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), materials.shadow);
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = Number.isFinite(ground) ? ground - 0.5 : 0;
    catcher.receiveShadow = true;
    catcher.visible = realistic.value;
    roomLayer.add(catcher);
    return render();
  }
  const { length: L, width: W, ceiling: H } = room;
  const open = (wall: string) => !!room.open?.includes(wall);
  const ceilingNow = realistic.value ? materials.ceilingReal : materials.ceiling;
  roomLayer.add(flat(L, W, L / 2, 0, W / 2, materials.floor, true));
  // The ceiling faces down: there from inside, cut away when the room is looked down into.
  const ceiling = flat(L, W, L / 2, H, W / 2, ceilingNow, false);
  ceilings.push(ceiling);
  // The lamp's fixture: a flat round light on the ceiling, in the middle of the room. Shown in the realistic look.
  fixture = new THREE.Mesh(new THREE.CylinderGeometry(190, 190, 60, 40), materials.lampGlass);
  fixture.position.set(L / 2, H - 30, W / 2);
  fixture.visible = false;
  roomLayer.add(fixture);
  roomLayer.add(ceiling);
  /** A wall `span` long, its middle at x, z, facing the way (fx, fz): drawn on that side only. */
  const wallAt = (span: number, x: number, z: number, fx: number, fz: number) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, H), materials.wall);
    wall.rotation.y = Math.atan2(fx, fz);
    wall.position.set(x, H / 2, z);
    roomLayer.add(wall);
  };
  // Each wall: its middle, and the turn that faces it into the room.
  const walls: [string, number, number, number, number][] = [
    ['back', L, L / 2, 0, 0],
    ['front', L, L / 2, W, Math.PI],
    ['left', W, 0, W / 2, Math.PI / 2],
    ['right', W, L, W / 2, -Math.PI / 2],
  ];
  for (const [name, span, x, z, turn] of walls) {
    // Into the room: the way the wall faces. Out of it: the other way; along it: square to that.
    const [ix, iz] = [Math.round(Math.sin(turn)), Math.round(Math.cos(turn))];
    if (!open(name)) {
      wallAt(span, x, z, ix, iz);
      continue;
    }
    // No wall: the next room stands there (not an empty backdrop). It is wider than the opening
    // by `wider` at each end and `deep` across: its floor and ceiling, its far wall, its two side walls, and the two
    // short walls beside the opening.
    const [ox, oz] = [-ix, -iz];
    const [ax, az] = [oz, -ox];
    const { deep, wider } = NEXT_ROOM;
    const full = span + 2 * wider;
    const [mx, mz] = [x + (ox * deep) / 2, z + (oz * deep) / 2];
    const [across, along] = ax ? [full, deep] : [deep, full];
    roomLayer.add(flat(across, along, mx, 0, mz, materials.floor, true));
    const over = flat(across, along, mx, H, mz, ceilingNow, false);
    ceilings.push(over);
    roomLayer.add(over);
    wallAt(full, x + ox * deep, z + oz * deep, ix, iz);
    for (const end of [-1, 1]) {
      wallAt(deep, mx + end * ax * (full / 2), mz + end * az * (full / 2), -end * ax, -end * az);
      wallAt(wider, x + end * ax * (span / 2 + wider / 2), z + end * az * (span / 2 + wider / 2), ox, oz);
    }
  }
  // The windows: on the wall's face, a pane with the sky in it, trim round it, a rail across the middle and a sill.
  if (room.windows?.length && !materials.windowGlass.map) {
    try {
      materials.windowGlass.map = skyTexture();
      materials.windowGlass.color.set(0xffffff);
    } catch {
      // No canvas to draw the sky on: the pane keeps its plain blue.
    }
  }
  for (const w of room.windows ?? []) {
    const frame = new THREE.Group();
    frame.position.set(...w.at);
    frame.rotation.y = THREE.MathUtils.degToRad(w.turn);
    const piece = (bw: number, bh: number, bd: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), material);
      mesh.position.set(x, y, z);
      frame.add(mesh);
    };
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), materials.windowGlass);
    pane.position.set(w.width / 2, w.height / 2, 3);
    frame.add(pane);
    const T = 70;
    piece(w.width + 2 * T, T, 20, materials.trim, w.width / 2, w.height + T / 2, 10);
    for (const x of [-T / 2, w.width + T / 2]) piece(T, w.height, 20, materials.trim, x, w.height / 2, 10);
    piece(w.width, 36, 16, materials.trim, w.width / 2, w.height / 2, 8);
    piece(w.width + 2 * T + 40, 30, 70, materials.trim, w.width / 2, -15, 35);
    roomLayer.add(frame);
  }
  // The tile on the walls: each piece just off the wall's face, its tiles their real size, counted from the piece's
  // bottom-left corner in the wall so that pieces beside a window line up with the ones under it.
  dressRoom(room);
  for (const t of room.tiles ?? []) {
    const repeat = WALL_TILE_REPEAT[room.look?.tile?.look ?? 'subway'];
    const geometry = new THREE.PlaneGeometry(t.width, t.height);
    const uv = geometry.getAttribute('uv');
    // Where the piece starts along its wall, and off the floor: its place turned back into the wall's own frame.
    const turn = THREE.MathUtils.degToRad(t.turn);
    const along = t.at[0] * Math.cos(turn) - t.at[2] * Math.sin(turn);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (along + uv.getX(i) * t.width) / repeat[0], (t.at[1] + uv.getY(i) * t.height) / repeat[1]);
    const piece = new THREE.Mesh(geometry, materials.wallTile);
    piece.position.set(t.width / 2, t.height / 2, 2);
    const held = new THREE.Group();
    held.position.set(...t.at);
    held.rotation.y = turn;
    held.add(piece);
    roomLayer.add(held);
  }
  const edge = (y: number) => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(L, y, 0), new THREE.Vector3(L, y, W), new THREE.Vector3(0, y, W)]), materials.roomLine);
  roomLayer.add(edge(0), edge(H));
  for (const [x, z] of [[0, 0], [L, 0], [L, W], [0, W]] as const) {
    roomLayer.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, H, z)]), materials.roomLine));
  }
  shadowed(roomLayer, false);
  if (fixture) fixture.receiveShadow = false;
}

/**
 * A door's hinges. The cup and its flange are the door's, so they go with it; the
 * plate, the arm and its head stand on the case; the two links are laid afresh
 * whenever the door moves.
 */
function addHinges(door: THREE.Group, part: PlacedPart, source: Part) {
  const h = part.hinges!;
  const { cup, flange } = h.shapes;
  // The door's solid: X across its width from its left edge, Y up, Z from its back face (0) to its front.
  const across = (u: number) => (h.dir === 1 ? u : source.size.width - u);
  const doorY = (y: number) => y - part.offset[1];
  for (const y of h.heights) {
    const inCup = new THREE.Mesh(new THREE.CylinderGeometry(cup.diameter / 2 - 0.4, cup.diameter / 2 - 0.4, cup.depth, 28), materials.metalDark);
    inCup.rotation.x = Math.PI / 2;
    inCup.position.set(across(cup.centre), doorY(y), cup.depth / 2 - 0.6);
    const onBack = new THREE.Mesh(new THREE.BoxGeometry(flange.to - flange.from, flange.height, flange.thickness), materials.metal);
    onBack.position.set(across((flange.from + flange.to) / 2), doorY(y), -flange.thickness / 2);
    door.add(inCup, onBack);
    // The flange's screws, heads proud of it: behind the door's back face, which is at Z = 0.
    for (const screw of h.shapes.screws.door) {
      for (const piece of screwPieces(h.shapes.screws.head)) {
        piece.mesh.rotation.x = Math.PI / 2;
        piece.mesh.position.set(across(screw.along), doorY(y) + screw.up, -flange.thickness - piece.out);
        door.add(piece.mesh);
      }
    }
    // The screws through the plate (or the bracket): on its face, looking into the opening.
    for (const screw of h.shapes.screws.fixed) {
      for (const piece of screwPieces(h.shapes.screws.head)) {
        piece.mesh.rotation.z = Math.PI / 2;
        piece.mesh.position.set(h.origin.x + h.dir * (screw.at[0] + piece.out), y + screw.up, h.origin.z + screw.at[1]);
        target.add(piece.mesh);
        hingeFixed.push({ mesh: piece.mesh, at: piece.mesh.position.clone(), explode: h.explode });
      }
    }

    for (const bar of h.shapes.fixed) {
      const [x0, z0, x1, z1] = [h.origin.x + h.dir * bar.from[0], h.origin.z + bar.from[1], h.origin.x + h.dir * bar.to[0], h.origin.z + bar.to[1]];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0), bar.height, bar.thickness), bar.what === 'pin' || bar.what === 'head' ? materials.metalDark : materials.metal);
      layBar(mesh, x0, z0, x1, z1, y);
      target.add(mesh);
      hingeFixed.push({ mesh, at: mesh.position.clone(), explode: h.explode });
    }
    h.shapes.links.forEach((link, i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(h.linkage.linkLengths[i]!, link.height, link.thickness), materials.metal);
      target.add(mesh);
      hingeLinks.push({ mesh, part, height: y, link: i as 0 | 1 });
    });
  }
}

/**
 * What makes an appliance's block read as the appliance: plain boxes and bars on its faces, nothing
 * measured from a real one. The block's solid has X across its front, Y up from its underside and Z
 * from its back (0) to its front (its depth). (A sink is drawn as itself: `sinkDrawing.ts`.)
 */
function addApplianceLook(block: THREE.Group, kind: ApplianceKind, size: { width: number; height: number; thickness: number }, kick?: { height: number; face: number }) {
  const { width: w, height: h, thickness: d } = size;
  const box = (bw: number, bh: number, bd: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), material);
    mesh.position.set(x, y, z);
    block.add(mesh);
  };
  /** A round bar or disc, its length along `axis`. */
  const bar = (length: number, radius: number, material: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z') => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    block.add(mesh);
  };
  const { appliance: steel, applianceDark: dark, applianceGlass: glass, cooktop, metal } = materials;
  // On a standing appliance: just proud of its front face.
  const f = d + 1;
  if (kind === 'refrigerator') {
    // Side by side: a narrow freezer door with a dispenser, the wider door, a handle each side of the seam, a grille at the floor.
    const seam = w * 0.42;
    box(w, 90, 4, dark, w / 2, 45, f);
    box(6, h - 100, 3, dark, seam, 95 + (h - 100) / 2, f);
    box(seam * 0.52, h * 0.15, 3, dark, seam / 2, h * 0.62, f);
    for (const side of [-1, 1]) {
      bar(h * 0.52, 11, metal, seam + side * 48, h * 0.56, d + 46, 'y');
      for (const end of [-1, 1]) bar(46, 7, metal, seam + side * 48, h * 0.56 + end * h * 0.24, d + 23, 'z');
    }
  } else if (kind === 'dishwasher') {
    // A control strip across the top of the door, a bar handle under it, a dark kick at the floor.
    box(w - 12, 70, 3, dark, w / 2, h - 42, f);
    bar(w * 0.76, 10, metal, w / 2, h - 112, d + 40, 'x');
    for (const end of [-1, 1]) bar(40, 7, metal, w / 2 + end * w * 0.34, h - 112, d + 20, 'z');
    // Its toe kick, under the block and set back in line with the cabinets'; without one, a dark strip at the floor.
    if (kick) box(w, kick.height, kick.face, dark, w / 2, -kick.height / 2, kick.face / 2);
    else box(w, 100, 4, dark, w / 2, 50, f);
  } else if (kind === 'range') {
    // A black top with four burners, a backguard behind, knobs along the front, an oven door with its window and handle, a drawer under it.
    box(w - 6, 6, d - 30, cooktop, w / 2, h + 3, d / 2 + 10);
    for (const x of [0.27, 0.73]) for (const z of [0.3, 0.7]) {
      bar(10, w * 0.115, dark, w * x, h + 11, d * z, 'y');
      bar(12, w * 0.05, cooktop, w * x, h + 12, d * z, 'y');
    }
    box(w, 130, 45, steel, w / 2, h + 65, 22.5);
    for (let i = 0; i < 5; i++) bar(26, 17, metal, w * (0.14 + i * 0.18), h - 45, d + 13, 'z');
    box(w * 0.64, h * 0.27, 3, glass, w / 2, h * 0.5, f);
    bar(w * 0.84, 11, metal, w / 2, h - 118, d + 42, 'x');
    for (const end of [-1, 1]) bar(42, 7, metal, w / 2 + end * w * 0.38, h - 118, d + 21, 'z');
    box(w - 10, 5, 3, dark, w / 2, 155, f);
  } else if (kind === 'microwave') {
    // A door with its window on the left, a handle, the controls on the right, a vent along the top.
    box(w * 0.6, h * 0.6, 3, glass, w * 0.36, h * 0.47, f);
    box(w * 0.2, h * 0.76, 3, dark, w * 0.87, h * 0.47, f);
    bar(h * 0.66, 9, metal, w * 0.72, h * 0.47, d + 34, 'y');
    for (const end of [-1, 1]) bar(34, 6, metal, w * 0.72, h * 0.47 + end * h * 0.28, d + 17, 'z');
    box(w - 12, 14, 3, dark, w / 2, h - 12, f);
  }
}

/**
 * A cabinet's casters, under its doubled bottom or its pads. The layer's solid has X across it, Y back from
 * its front and Z up from its underside (0), so a caster hangs down -Z: its plate, the swivel, the
 * fork and the wheel (its axle across, set back of the swivel), and a brake pedal on a locking one.
 * `x0`, `y0`: where the solid's corner is in the cabinet, for a pad (a layer's is the cabinet's own).
 */
function addCasters(layer: THREE.Group, cabinetId: string, x0 = 0, y0 = 0) {
  for (const c of props.casters?.filter((k) => k.cabinetId === cabinetId) ?? []) {
    const { plate, overallHeight } = c.caster;
    const h = overallHeight.mm;
    const wheel = h * 0.75;
    const plateT = 4;
    const swivel = Math.min(plate.width, plate.length) * 0.32;
    const offset = wheel * 0.22;
    const piece = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, turn?: 'x' | 'z') => {
      const mesh = new THREE.Mesh(geometry, material);
      if (turn === 'x') mesh.rotation.x = Math.PI / 2;
      if (turn === 'z') mesh.rotation.z = Math.PI / 2;
      mesh.position.set(c.x - x0 + x, c.behind - y0 + y, z);
      layer.add(mesh);
    };
    piece(new THREE.BoxGeometry(plate.width, plate.length, plateT), materials.metal, 0, 0, -plateT / 2);
    // A furniture foot: a tapered leg under its plate, nothing that rolls.
    if (c.caster.foot) {
      const r = Math.min(plate.width, plate.length) / 2;
      piece(new THREE.CylinderGeometry(r * 0.5, r * 0.85, h - plateT, 28), materials.metalDark, 0, 0, -plateT - (h - plateT) / 2, 'x');
      continue;
    }
    const swivelH = Math.max(4, h - wheel - plateT);
    piece(new THREE.CylinderGeometry(swivel, swivel, swivelH, 24), materials.metalDark, 0, 0, -plateT - swivelH / 2, 'x');
    // The fork's two legs down to the axle, either side of the wheel.
    const width = Math.max(18, wheel * 0.32);
    for (const side of [-1, 1]) piece(new THREE.BoxGeometry(3, wheel * 0.5, wheel * 0.62), materials.metal, side * (width / 2 + 2.5), offset / 2, -(h - wheel / 2) + wheel * 0.18);
    piece(new THREE.CylinderGeometry(wheel / 2, wheel / 2, width, 28), materials.wheel, 0, offset, -(h - wheel / 2), 'z');
    if (c.locking) piece(new THREE.BoxGeometry(width * 1.4, 16, 5), materials.brake, 0, offset - wheel / 2 - 4, -(h - wheel * 0.95));
  }
}

/** What each request was built from, so a reply is drawn with the same parts in the same places. */
const sent = new Map<number, Shown>();

/** A click on a cabinet picks it; a drag turns the view and picks nothing. */
const raycaster = new THREE.Raycaster();
let pressed: { x: number; y: number } | undefined;
function onDown(event: PointerEvent) {
  pressed = { x: event.clientX, y: event.clientY };
}
function onUp(event: PointerEvent) {
  const from = pressed;
  pressed = undefined;
  if (!from || !renderer || Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) return;
  const box = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), camera);
  const hit = raycaster.intersectObjects(content.children, true).find((h) => h.object instanceof THREE.Mesh);
  const picked = hit && placed.find((p) => p.object === hit.object.parent);
  // The background (or a hinge, a slide): nothing is picked out any more.
  if (!picked) return void emit('part', undefined);
  // First the piece, then the part: a click on a cabinet that is not the one in hand takes it
  // in hand; on the one in hand, or where one piece is shown, it picks the part out, and a second click lets it go.
  if (picked.part.cabinetId && picked.part.cabinetId !== props.selectedCabinet) return void emit('pick', picked.part.cabinetId);
  emit('part', picked.part.partId === props.selectedPart ? undefined : picked.part.partId);
}

function build() {
  if (!worker) return;
  if (props.parts.length === 0) {
    clear();
    render();
    building.value = undefined;
    return;
  }
  status.value = placed.length ? '' : 'Building solids…';
  building.value = placed.length ? undefined : 0;
  // Plain copies: Vue's reactive proxies can't be posted to a worker.
  const parts = JSON.parse(JSON.stringify(props.parts)) as Part[];
  const cabinets = props.cabinets ? (JSON.parse(JSON.stringify(props.cabinets)) as NonNullable<Shown['cabinets']>) : undefined;
  const room = props.room ? (JSON.parse(JSON.stringify(props.room)) as NonNullable<Shown['room']>) : undefined;
  const request: SolidRequest = { id: ++requestId, parts, progress: true };
  sent.clear();
  sent.set(request.id, { parts, cabinets, ...(room ? { room } : {}) });
  worker.postMessage(request);
}

onMounted(() => {
  const el = host.value!;
  window.addEventListener('keydown', onKey);
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    building.value = undefined;
    status.value = "This browser can't show 3D (WebGL is not available).";
    return;
  }
  renderer.setPixelRatio(window.devicePixelRatio);
  el.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  // The sun, and a weaker light from the other side, so the faces turned away from the sun still read.
  scene.add(content, roomLayer, hemi, sun, fill, lamp);
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0015;
  lamp.shadow.normalBias = 2.5;
  lamp.shadow.radius = 6;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 2.5;
  sun.shadow.radius = 5;
  applyLook();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', render);
  observer = new ResizeObserver(() => {
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;
    renderer?.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  observer.observe(el);

  worker = new Worker(new URL('../workers/solid.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<SolidResponse>) => {
    const shown = sent.get(event.data.id);
    if (!shown) return; // a newer build is on its way
    if (event.data.progress) {
      if (building.value !== undefined) building.value = Math.round((100 * event.data.progress.done) / Math.max(1, event.data.progress.total));
      return;
    }
    building.value = undefined;
    if (event.data.meshes) {
      show(event.data, shown);
      takePicture();
    } else status.value = `The solids could not be built: ${event.data.error ?? 'unknown error'}`;
  };
  worker.onerror = (event) => {
    building.value = undefined;
    status.value = `The solids could not be built: ${event.message}`;
  };
  build();
});

watch(
  () => props.frameKey,
  () => (framed = false),
);
/**
 * The view as it started, for when it has gone wrong after moving around in it a while: everything shut and
 * together, the camera where it first stood, the solids built again.
 */
function resetView() {
  explode.value = Math.min(100, Math.max(0, props.pose?.explode ?? props.startExplode));
  openDeg.value = Math.min(MAX_DOOR_OPEN_DEG, Math.max(0, props.pose?.open ?? props.startOpen));
  drawerOut.value = Math.min(100, Math.max(0, props.pose?.drawer ?? props.startDrawer));
  leafDown.value = Math.min(100, Math.max(0, props.startLeaf));
  camera.zoom = 1;
  camera.up.set(0, 1, 0);
  framed = false;
  build();
}
watch(
  () => props.pose,
  (pose) => {
    if (!pose) return;
    // A pose that says how far the doors are open or the drawers out sets them (Design, following its topic); one that
    // says where it is seen from (Setup's example) also puts the parts back together unless it pulls them apart.
    if (pose.open !== undefined) openDeg.value = Math.min(MAX_DOOR_OPEN_DEG, Math.max(0, pose.open));
    if (pose.drawer !== undefined) drawerOut.value = Math.min(100, Math.max(0, pose.drawer));
    if (pose.from || pose.explode !== undefined) explode.value = Math.min(100, Math.max(0, pose.explode ?? 0));
    if (!pose.from || !shownReach || shownRoom) return;
    shownReach = fittedReach();
    const eye = eyeAt(shownReach);
    camera.position.set(eye[0], eye[1], eye[2]);
    controls?.target.set(0, 0, 0);
    controls?.update();
    render();
  },
  { deep: true },
);
watch(() => [props.parts, props.cabinets, props.room, props.hardware, props.finish, props.faces, props.slides, props.casters, props.appliances, props.looks], build, { deep: true });
watch(showFinish, build);
watch([explode, openDeg, drawerOut, leafDown, showTop, showFronts], apply);
watch(viewLook, applyLook);
watch(() => props.selectedPart, applyLook);
watch(() => [props.materialNames, props.cutBy], () => {
  colourParts();
  render();
}, { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  renderer?.domElement.removeEventListener('pointerdown', onDown);
  renderer?.domElement.removeEventListener('pointerup', onUp);
  worker?.terminate();
  observer?.disconnect();
  controls?.dispose();
  clear();
  for (const material of Object.values(materials)) material.dispose();
  for (const texture of Object.values(look ?? {})) texture.dispose();
  renderer?.dispose();
});
</script>

<template>
  <!-- Full page: moved to the top of the app, so it lies over the app bar too. -->
  <Teleport to=".v-application" :disabled="!full">
  <div :class="{ full }">
    <div class="wrap">
      <div ref="host" class="view" />
      <v-btn
        class="grow"
        :icon="full ? mdiFullscreenExit : mdiFullscreen"
        :title="full ? 'Back to the page (Esc)' : 'Fill the page'"
        :aria-label="full ? 'Back to the page' : 'Fill the page'"
        variant="tonal"
        size="small"
        data-test="view-full"
        @click="full = !full"
      />
      <v-btn class="grow again" :icon="mdiRestore" title="Reset the view" aria-label="Reset the view" variant="tonal" size="small" data-test="view-reset" @click="resetView" />
      <div v-if="legend.length" class="legend text-caption" data-test="view-legend">
        <span v-for="entry in legend" :key="entry.name" class="entry"><span class="chip" :style="{ background: entry.colour }" />{{ entry.name }}</span>
      </div>
      <div v-if="status" class="status text-body-2 text-medium-emphasis">
        <div>{{ status }}</div>
        <v-progress-linear v-if="building !== undefined" :model-value="building" color="primary" height="6" rounded class="progress" data-test="building" />
      </div>
    </div>
    <div class="controls mt-2">
      <label v-if="hasDoors" class="control">
        <span class="text-body-2 text-medium-emphasis">Doors</span>
        <v-slider v-model="openDeg" :min="0" :max="MAX_DOOR_OPEN_DEG" :step="1" density="compact" hide-details thumb-size="14" track-size="3" class="slider" />
        <span class="text-body-2 amount">{{ openDeg === 0 ? 'Closed' : `${openDeg}°` }}</span>
      </label>
      <label v-if="hasDrawers" class="control">
        <span class="text-body-2 text-medium-emphasis">Drawers</span>
        <v-slider v-model="drawerOut" :min="0" :max="100" :step="1" density="compact" hide-details thumb-size="14" track-size="3" class="slider" />
        <span class="text-body-2 amount">{{ drawerOut === 0 ? 'Closed' : `${drawerOut}%` }}</span>
      </label>
      <label v-if="hasLeaf" class="control" data-test="leaf-slider">
        <span class="text-body-2 text-medium-emphasis">Leaf</span>
        <v-slider v-model="leafDown" :min="0" :max="100" :step="1" density="compact" hide-details thumb-size="14" track-size="3" class="slider" />
        <span class="text-body-2 amount">{{ leafWords }}</span>
      </label>
      <ViewLookSelect v-if="!lookElsewhere || full" class="align-self-center" />
      <v-switch v-if="hasFronts" v-model="showFronts" label="Fronts" color="primary" density="compact" hide-details class="grain" title="Off: the doors and the drawers are hidden, to see the case" data-test="show-fronts" />
      <v-switch v-if="hasTop" v-model="showTop" label="Top" color="primary" density="compact" hide-details class="grain" title="Off: the top is hidden, to see what is under it" data-test="show-top" />
      <v-switch v-if="hasFinish" v-model="showFinish" label="Finish" color="primary" density="compact" hide-details class="grain" title="Off: the bare wood, without its paint or stain" data-test="show-finish" />
      <label class="control">
        <span class="text-body-2 text-medium-emphasis">Explode</span>
        <v-slider v-model="explode" :min="0" :max="100" :step="1" density="compact" hide-details thumb-size="14" track-size="3" class="slider" />
        <span class="text-body-2 amount">{{ explode === 0 ? 'Off' : `${explode}%` }}</span>
      </label>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.wrap {
  position: relative;
  background: #2a2e37;
  border-radius: 8px;
}
/* Every look has the same dark backdrop, not a white one. */
/* What a look's colours stand for: along the bottom of the view. */
.legend {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  pointer-events: none;
  color: #e6e8ec;
}
.legend .entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend .chip {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.view {
  width: 100%;
  height: 520px;
}
.grow {
  position: absolute;
  top: 10px;
  right: 10px;
}
/* The reset button, under it. */
.grow.again {
  top: 58px;
}
/* Over the whole page, the app bar too; the controls stay under the view. */
.full {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 12px;
  background: rgb(var(--v-theme-background));
}
.full .wrap {
  flex: 1;
  min-height: 0;
}
.full .view {
  height: 100%;
}
.status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.progress {
  width: min(320px, 60%);
}
/* The three controls share one line under the view; they wrap on a narrow screen. */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 28px;
}
.control {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grain {
  flex: none;
}
.slider {
  width: 130px;
  flex: none;
}
.amount {
  width: 48px;
  white-space: nowrap;
}
</style>
