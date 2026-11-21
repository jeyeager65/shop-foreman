import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { layoutPresetOf } from './design/layout';
import { designsOf } from './design/frontSettings';
import { doorHandleChoice } from './design/handles';
import { parseRoom } from './design/room';
import { FLOOR_KINDS, TILE_LOOKS, starterWallTile } from './design/roomLook';
import { starterTopSettings } from './design/tops';
import { TORSION_STARTS, torsionMaterialIds } from './design/torsion';
import { addMaterialFromCatalog } from './design/materials';
import { SUSAN_RIM_HARDBOARD_ID } from './design/susan';
import { flutesFor, ripplesFor, starterPattern } from './design/pattern';
import type { CabinetSink, FrontPattern } from './model';
import { SINK_MOUNTS, sinkOfKind } from './design/sinks';
import { createRun } from './design/runs';
import { setPosts, setBottomKind } from './design/casters';
import { cabinetsOf } from './design/settings';
import { createObstacle, createOrganizer, createUnderSink } from './design/underSink';
import { existingInsideWidth } from './design/existing';
import { EURO_SLIDE_ID, GENERIC_SLIDE_ID, GENERIC_KNOB_ID, GENERIC_PULL_ID, GENERIC_SHELF_PIN_ID, PLYWOOD_3_4_ID, SHELF_PIN_1_4_ID, SOLID_WOOD_3_4_ID } from './libraries';
import { vuetify } from './plugins/vuetify';
import { createAppRouter } from './router';
import { addTallCabinet, addWallCabinet, applyCabinetLayout, createFaceFrameRunProject, createHomeKitchenProject, createIslandProject, createFoldingShopTableProject, createShopTableProject, createCommonKitchenProject, createKitchenProject, makeLShaped, createShopReferenceProject, createShopWallProject, makeBlind, makeExisting, makeMade, setBays } from './samples/cabinet';
import { presetsOf } from './samples/presets';
import { starterById } from './samples/starters';
import { useAppStore } from './stores/app';
import { len } from './units';
import { storedCases } from './design/settings';

const app = createApp(App).use(createPinia()).use(createAppRouter()).use(vuetify);
const store = useAppStore();
void store.load().then(async () => {
  // ?sample opens a project without clicking through Projects, in the deployed app too: the samples
  // are how a user explores what the app can do; the Samples page lists them.
  // ?sample=cabinet opens a frameless designed cabinet, ?sample=faceframe a face
  // frame one with its doors and ?sample=shop a shop-style one, creating the project if there is none.
  const sample = new URLSearchParams(location.search).get('sample');
  // &copy=1 makes the sample as a new project every time, whatever is saved (the Samples page's links: a sample is
  // never changed in place and can be opened twice); &name=... names it. Without it a sample's saved project is opened.
  const copy = sample !== null && new URLSearchParams(location.search).has('copy');
  // &fresh=1 throws away the saved copy of a sample that is a whole project of its own, so it is made again as the code now makes it.
  const SAMPLE_SLUGS: Record<string, string> = { shoptable: 'shop-table', shoptablefold: 'shop-leaf-table', island: 'island', home: 'home-kitchen', kitchen: 'common-kitchen', kitchenref: 'kitchen', shopwall: 'shop-wall', shopref: createShopReferenceProject().slug, framerun: createFaceFrameRunProject().slug };
  if (sample !== null && SAMPLE_SLUGS[sample] && new URLSearchParams(location.search).has('fresh')) {
    for (const saved of store.projects.filter((p) => p.slug === SAMPLE_SLUGS[sample])) await store.remove(saved.id);
  }
  if (sample === 'cabinet' || sample === 'faceframe' || sample === 'shop') {
    const style = sample === 'cabinet' ? 'frameless' : sample === 'shop' ? 'shop' : 'faceFrame';
    // A project of one cabinet: the ones with several are samples of their own.
    const cabinet = !copy && store.projects.find((p) => cabinetsOf(p).length === 1 && cabinetsOf(p)[0]?.construction === style && p.designObjects.some((d) => d.template === 'drawer'));
    if (cabinet) store.open(cabinet.id);
    else store.newCabinetProject(style);
    // &joint=dado, pocketScrews or throughScrews sets that cabinet's case joint.
    const joint = new URLSearchParams(location.search).get('joint');
    const opened = store.project ? cabinetsOf(store.project)[0] : undefined;
    if (opened && (joint === 'dado' || joint === 'pocketScrews' || joint === 'throughScrews')) opened.joinery.case = joint;
    // &joint=tabs: tabs through the sides; &joint=blindtabs: into blind slots; &proud=0.03125: through tabs stand that many inches proud.
    if (opened && (joint === 'tabs' || joint === 'blindtabs')) {
      opened.joinery.case = 'tabs';
      const proud = Number(new URLSearchParams(location.search).get('proud'));
      opened.joinery.tabs = joint === 'blindtabs' ? { blind: true } : proud > 0 ? { proud: { mm: proud * 25.4, unit: 'in' } } : undefined;
      if (!opened.joinery.tabs) delete opened.joinery.tabs;
    }
    // &back=rabbet, groove or applied sets its back joint; &stretcher=flat or nailer its back stretcher.
    const back = new URLSearchParams(location.search).get('back');
    if (opened && (back === 'rabbet' || back === 'groove' || back === 'applied')) opened.joinery.back = back;
    // &back=tabs: a back of the case material (thick enough for tabs) with tabs into the sides; &backtabs=blind with no other tabs chosen.
    if (opened && back === 'tabs') {
      opened.joinery.back = 'tabs';
      opened.materials.backId = opened.materials.caseId;
      if (new URLSearchParams(location.search).get('backtabs') === 'blind') opened.joinery.tabs = { blind: true };
    }
    const form = new URLSearchParams(location.search).get('stretcher');
    if (opened && (form === 'flat' || form === 'nailer')) opened.joinery.backStretcherForm = form;
    // &support=blocks, cross or both: corner blocks and cross stretchers (20" apart) under its top.
    const support = new URLSearchParams(location.search).get('support');
    if (opened && (support === 'blocks' || support === 'cross' || support === 'both')) {
      opened.topSupport = { ...(support !== 'cross' ? { cornerBlocks: true } : {}), ...(support !== 'blocks' ? { crossStretchers: { apart: { mm: 20 * 25.4, unit: 'in' } } } : {}) };
    }
    // &sink=tray with upper, shelf or sides: a sink over it and that storage under it; &trap=6x10x12 its trap in
    // inches (across, forward from the back, clear under it). More in the way: &bowl=16x14x18 the bowl (across, front
    // to back, clear under it; 2" out from the back), &valves=14 a supply valve in each back corner that far above the
    // floor, &disposal=8x8x8 a disposal 4" from the left side (across, front to back, clear under it).
    const sink = new URLSearchParams(location.search).get('sink');
    if (opened && sink && sink !== 'none') {
      const has = (word: string) => sink.split(',').includes(word);
      const trap = (new URLSearchParams(location.search).get('trap') ?? '').split('x').map(Number).filter((n) => n > 0);
      const made = createUnderSink();
      const inches = (n: number) => ({ mm: n * 25.4, unit: 'in' as const });
      if (trap.length === 3) Object.assign(made.obstacles[0]!, { width: inches(trap[0]!), depth: inches(trap[1]!), clearUnder: inches(trap[2]!) });
      const sized = (name: string) => (new URLSearchParams(location.search).get(name) ?? '').split('x').map(Number).filter((n) => n > 0);
      const bowl = sized('bowl');
      if (bowl.length === 3) made.obstacles.push({ ...createObstacle('bowl', made.obstacles), width: inches(bowl[0]!), depth: inches(bowl[1]!), clearUnder: inches(bowl[2]!) });
      const valves = sized('valves');
      if (valves.length === 1) {
        // 3" across and 4" out from the back, 2" in from each side: the right one's place needs the inside width.
        const insideWidth = (opened.existing ? existingInsideWidth(opened.existing) : opened.size.width.mm - 2 * 19.05) / 25.4;
        for (const fromLeft of [2, insideWidth - 5]) made.obstacles.push({ ...createObstacle('valve', made.obstacles), fromLeft: inches(fromLeft), clearUnder: inches(valves[0]!) });
      }
      const disposal = sized('disposal');
      if (disposal.length === 3) made.obstacles.push({ ...createObstacle('disposal', made.obstacles), fromLeft: inches(4), width: inches(disposal[0]!), depth: inches(disposal[1]!), clearUnder: inches(disposal[2]!) });
      const upper = has('upper') ? 'tray' : has('sides') ? 'sideTrays' : has('shelf') ? 'shelf' : undefined;
      // &trays=frame or strips: what carries the trays' slides (left out: a frame in an existing cabinet, strips in a made one).
      const trays = new URLSearchParams(location.search).get('trays');
      const stored = createUnderSink({ ...(has('tray') ? { bottomTray: true } : {}), ...(upper ? { upper } : {}), ...(trays === 'frame' || trays === 'strips' ? { mounting: trays } : {}) });
      opened.inside = { ...stored, obstacles: made.obstacles };
      opened.adjustableShelves = 0;
    }
    if (opened && support === 'none') opened.topSupport = undefined;
    if (opened && sink === 'none') opened.inside = undefined;
    // &organizers=tray,tray:8,shelf:16,sides:24 sets what stands inside it, from the floor up: a tray, a shelf or a shelf
    // with side trays (`sides`), each with its height above the cabinet's floor in inches (a tray with none: on the
    // floor). With no &sink the cabinet has nothing in the way.
    const organizersAsked = new URLSearchParams(location.search).get('organizers');
    if (opened && organizersAsked) {
      const inside = (opened.inside ??= { obstacles: [], organizers: [] });
      inside.organizers = [];
      for (const word of organizersAsked.split(',')) {
        // `tall`: a tray with 8" walls; `trash` or `trash2`: a pull-out for one or two bins, its number its place from the left side.
        const [kind, up] = word.split(':');
        // `narrow`: a narrow pull-out with tall walls, `dividers` (or `dividers6`: so many boards) vertical dividers; their number, too, is their place from the left side.
        // `blind`: a tray in the blind half of a blind corner cabinet, on sideways slides (with &corner=1:blind-left).
        const organizer = createOrganizer(kind === 'sides' ? 'sideTrays' : kind === 'shelf' ? 'shelf' : kind?.startsWith('trash') ? 'pullOut' : kind === 'narrow' ? 'narrow' : kind === 'blind' || kind === 'blindout' ? 'blindTray' : kind?.startsWith('dividers') ? 'dividers' : 'tray', inside.organizers);
        if (kind === 'tall') organizer.wall = { mm: 8 * 25.4, unit: 'in' };
        // `under`: a tray on the floor on bottom-mount slides.
        if (kind === 'under') organizer.slides = 'bottom';
        // `blindout`: a blind corner tray that also comes forward out of the door opening, on a platform.
        if (kind === 'blindout') organizer.forward = true;
        if (organizer.kind === 'dividers' && Number(kind!.slice('dividers'.length)) > 1) organizer.count = Number(kind!.slice('dividers'.length));
        if (organizer.kind === 'pullOut' || organizer.kind === 'narrow' || organizer.kind === 'dividers') {
          if (kind === 'trash2') organizer.bins!.count = 2;
          const [from, wide] = (up ?? '').split('w');
          if (from !== undefined && from !== '') organizer.fromLeft = { mm: Number(from) * 25.4, unit: 'in' };
          // `dividers:20w12`: 20" from the left side, 12" wide.
          if (Number(wide) > 0) organizer.width = { mm: Number(wide) * 25.4, unit: 'in' };
        } else if (Number(up) > 0) organizer.up = { mm: Number(up) * 25.4, unit: 'in' };
        inside.organizers.push(organizer);
      }
      opened.adjustableShelves = 0;
    }
    // &racks=2 (or 2x4: how many on each door, and how deep in inches) puts racks on the inside of its doors.
    const racksAsked = (new URLSearchParams(location.search).get('racks') ?? '').split('x').map(Number).filter((n) => n > 0);
    if (opened && racksAsked.length) {
      const inside = (opened.inside ??= { obstacles: [], organizers: [] });
      inside.doorRacks = { doors: 'pair', count: Math.min(3, Math.floor(racksAsked[0]!)), depth: { mm: (racksAsked[1] ?? 3.5) * 25.4, unit: 'in' } };
    }
    // &tilt=20x4 a tilt-out tray behind the false front: the opening behind it, wide and high in inches.
    const tiltAsked = (new URLSearchParams(location.search).get('tilt') ?? '').split('x').map(Number).filter((n) => n > 0);
    if (opened && tiltAsked.length === 2) {
      const inside = (opened.inside ??= { obstacles: [], organizers: [] });
      inside.tiltOut = { width: { mm: tiltAsked[0]! * 25.4, unit: 'in' }, height: { mm: tiltAsked[1]! * 25.4, unit: 'in' }, depth: { mm: 2.5 * 25.4, unit: 'in' } };
    }
    // &pin=5mm or quarter sets its shelf pin.
    const pin = new URLSearchParams(location.search).get('pin');
    if (opened && (pin === '5mm' || pin === 'quarter')) opened.shelfPinId = pin === '5mm' ? GENERIC_SHELF_PIN_ID : SHELF_PIN_1_4_ID;
    // &box=rabbet or pocketScrews sets its drawers' corner joint; &mount=strips or rearBrackets how a face frame carries the slides.
    const box = new URLSearchParams(location.search).get('box');
    const mount = new URLSearchParams(location.search).get('mount');
    const slideAsked = new URLSearchParams(location.search).get('slide');
    // &fingers=0.75x0.75 sizes its drawers' finger joints, in inches: each finger's width, and the most between two.
    const fingers = (new URLSearchParams(location.search).get('fingers') ?? '').split('x').map(Number);
    // &falsefront=1 (or `tilt`, `tilt:3` with its tray's depth in inches) makes the drawer over the doors a false front.
    const falseAsked = new URLSearchParams(location.search).get('falsefront');
    for (const d of store.project ? designsOf(store.project) : []) {
      if (d.template !== 'drawer') continue;
      if (falseAsked === 'none') delete d.falseFront;
      else if (falseAsked) d.falseFront = falseAsked.startsWith('tilt') ? { tiltOut: { depth: { mm: (Number(falseAsked.split(':')[1]) || 2.5) * 25.4, unit: 'in' } } } : {};
      if (box === 'rabbet' || box === 'pocketScrews' || box === 'tabs') d.box.cornerJoint = box;
      if (fingers.length === 2 && fingers.every((v) => v > 0)) d.box.fingers = { length: { mm: fingers[0]! * 25.4, unit: 'in' }, between: { mm: fingers[1]! * 25.4, unit: 'in' } };
      if (mount === 'strips' || mount === 'rearBrackets') d.slide.faceFrameMount = mount;
      // &slide=euro: its drawers on bottom-mount roller slides (`generic`: on the generic side-mount one).
      if (slideAsked === 'euro' || slideAsked === 'generic') {
        d.slide.slideId = slideAsked === 'euro' ? EURO_SLIDE_ID : GENERIC_SLIDE_ID;
        delete d.slide.length;
      }
    }
    // &layout=doors, drawers or drawerOverDoors sets its layout; &drawers=N how many drawers a drawers-only one has.
    const layout = new URLSearchParams(location.search).get('layout');
    if (store.project && opened && (layout === 'doors' || layout === 'drawers' || layout === 'drawerOverDoors')) {
      const now = layoutPresetOf(opened.layout);
      const count = Number(new URLSearchParams(location.search).get('drawers')) || (now?.preset === 'drawers' ? now.drawers : undefined);
      if (now?.preset !== layout || (layout === 'drawers' && count !== now.drawers)) applyCabinetLayout(store.project, opened, layout, count);
    }
    // &front=wide, plain, runners or applied sets how every drawer's front is made in the shop (inset) style.
    const front = new URLSearchParams(location.search).get('front');
    if (front === 'wide' || front === 'plain' || front === 'runners' || front === 'applied') {
      for (const d of store.project ? designsOf(store.project) : []) if (d.template === 'drawer') d.shop = { ...d.shop, front };
    }
    // &widestyle=shaker or slab and &wideedge=roundover, chamfer or square give every inset drawer's wide front a style of its own.
    const wideStyle = new URLSearchParams(location.search).get('widestyle');
    const wideEdge = new URLSearchParams(location.search).get('wideedge');
    for (const d of store.project ? designsOf(store.project) : []) {
      if (d.template !== 'drawer') continue;
      if (wideStyle === 'shaker') d.shop = { ...d.shop, style: { kind: 'shaker', frameWidth: len('2-1/4"'), recessDepth: len('1/4"'), insideEdge: { kind: 'vBevel', angleDeg: 60 }, floorCornerRadius: len('1/16"') } };
      if (wideStyle === 'slab') d.shop = { ...d.shop, style: { kind: 'slab' } };
      if (wideEdge === 'roundover') d.shop = { ...d.shop, outsideEdge: { kind: 'roundover', radius: len('1/8"') } };
      if (wideEdge === 'chamfer') d.shop = { ...d.shop, outsideEdge: { kind: 'chamfer', size: len('1/8"') } };
      if (wideEdge === 'square') d.shop = { ...d.shop, outsideEdge: { kind: 'square' } };
    }
    // &pull=finger gives every front of a shop-style cabinet a CNC-cut finger pull; &pull=hand takes them away.
    const pull = new URLSearchParams(location.search).get('pull');
    if (pull === 'finger' || pull === 'hand') {
      for (const d of store.project ? designsOf(store.project) : []) {
        if (d.template === 'drawer') d.shop = { ...d.shop, pull: pull === 'finger' ? 'fingerPull' : 'byHand' };
        else d.shopPull = pull === 'finger' ? 'fingerPull' : 'byHand';
      }
    }
    // &bays=2 (to 6) gives it that many bays side by side, a partition or a mullion between (milestone 10).
    // &width=48 sets its width in inches.
    const widthAsked = Number(new URLSearchParams(location.search).get('width'));
    if (opened && widthAsked > 0) opened.size.width = len(`${widthAsked}"`);
    // &depth=21 its depth in inches.
    const depthAsked = Number(new URLSearchParams(location.search).get('depth'));
    if (opened && depthAsked > 0) opened.size.depth = len(`${depthAsked}"`);
    // &basin=dropIn (or undermount, vessel, integrated, farmhouse; `:double`, `:6040` two bowls; `:oval`; `:faucet3`; none) a sink
    // over it, set in the top over it, sized to suit the cabinet (after its width and depth are set).
    const basin = new URLSearchParams(location.search).get('basin');
    if (opened && basin) {
      const [mount, ...more] = basin.split(':');
      if (mount === 'none') delete opened.sink;
      else if (mount && SINK_MOUNTS.some((m) => m.value === mount)) {
        const made = sinkOfKind(opened, mount as CabinetSink['mount']);
        if (more.includes('oval')) made.shape = 'oval';
        if (more.includes('rectangle')) made.shape = 'rectangle';
        if (more.includes('double') || more.includes('6040')) made.double = { leftShare: more.includes('6040') ? 0.6 : 0.5 };
        // `:faucet1`, `:faucet3`: a faucet for one hole or three.
        if (more.includes('faucet1') || more.includes('faucet3')) made.faucet = { holes: more.includes('faucet3') ? 3 : 1 };
        opened.sink = made;
      }
    }
    // &hub=left|right|none a power hub in the open space at its top (a shop table's), its outlets in that side.
    const hubAsked = new URLSearchParams(location.search).get('hub');
    if (opened && (hubAsked === 'left' || hubAsked === 'right')) opened.hub = { side: hubAsked };
    else if (opened && hubAsked === 'none') delete opened.hub;
    const bayCountAsked = Number(new URLSearchParams(location.search).get('bays'));
    if (store.project && opened && bayCountAsked >= 1) setBays(store.project, opened, bayCountAsked);
    // &existing=1 makes its case an existing one, measured as the cabinet the other parameters made, its doors kept
    // (&existing=new: with new doors made here); without it the case is made here.
    const existingAsked = new URLSearchParams(location.search).get('existing');
    if (store.project && opened) {
      if (existingAsked === null) makeMade(store.project, opened.id);
      else makeExisting(store.project, opened.id, existingAsked === 'new' ? 'new' : 'kept');
    }
    // &kick=off gives it a flat bottom with no toe kick; &kick=on puts the toe kick back.
    const kick = new URLSearchParams(location.search).get('kick');
    if (opened && kick === 'off') opened.toeKick.off = true;
    if (opened && kick === 'on') delete opened.toeKick.off;
    // &edge=strip, banding or none: what covers the front edges of the project's cases with no face frame, frameless
    // or inset, whichever it is (a 3/4" solid wood strip, banding, nothing).
    const edge = new URLSearchParams(location.search).get('edge');
    const edged = store.project?.context;
    if (edged?.kind === 'designedCabinet' && (edge === 'strip' || edge === 'banding' || edge === 'none')) {
      const style = edged.settings.construction === 'shop' ? edged.settings.shop : edged.settings.frameless;
      style.edgeBanding = edge === 'banding';
      if (edge === 'strip') style.edgeStrip = { mm: 19.05, unit: 'in' };
      else delete style.edgeStrip;
    }
    // &overhang=0.25 stands the project's face frames that far (inches) past each side of their boxes; 0 puts them flush again.
    const overhang = new URLSearchParams(location.search).get('overhang');
    const framedIn = store.project?.context;
    if (overhang !== null && framedIn?.kind === 'designedCabinet') {
      if (Number(overhang) > 0) framedIn.settings.faceFrame.overhang = len(`${Number(overhang)}"`);
      else delete framedIn.settings.faceFrame.overhang;
    }
    // &kickjoint=pocket fastens the toe kick board with pocket screws (into the sides and up into the bottom); `hand` puts it back.
    const kickJoint = new URLSearchParams(location.search).get('kickjoint');
    if (opened && kickJoint === 'pocket') opened.toeKick.joint = 'pocketScrews';
    if (opened && kickJoint === 'hand') delete opened.toeKick.joint;
    // &kickboard=front (one board a cabinet) or run (one across a run) stands it in front of the sides; `between` puts it back.
    const kickBoard = new URLSearchParams(location.search).get('kickboard');
    if (opened && (kickBoard === 'front' || kickBoard === 'run')) opened.toeKick.board = kickBoard === 'run' ? 'acrossRun' : 'inFront';
    if (opened && kickBoard === 'between') delete opened.toeKick.board;
    // &wall=rails or cleat adds a wall cabinet to the project if it has none, and hangs the project's wall cabinets that way.
    const wall = new URLSearchParams(location.search).get('wall');
    if (store.project && opened && (wall === 'rails' || wall === 'cleat')) {
      if (!cabinetsOf(store.project).some((c) => c.form === 'wall')) addWallCabinet(store.project, { name: 'Wall cabinet' });
      opened.hanging = wall;
    }
    // &wallthere=new (or 1: its doors kept) makes the project's wall cabinets ones that are already there, adding one if it has none.
    const wallThere = new URLSearchParams(location.search).get('wallthere');
    if (store.project && wallThere !== null) {
      if (!cabinetsOf(store.project).some((c) => c.form === 'wall')) addWallCabinet(store.project, { name: 'Wall cabinet' });
      for (const c of cabinetsOf(store.project).filter((x) => x.form === 'wall')) makeExisting(store.project, c.id, wallThere === 'new' ? 'new' : 'kept');
    }
    // &tall=1 adds a tall cabinet to the project if it has none.
    if (store.project && new URLSearchParams(location.search).has('tall') && !cabinetsOf(store.project).some((c) => c.form === 'tall')) {
      addTallCabinet(store.project, { name: 'Tall cabinet' });
    }
    // &sheet=48x96 says the stock on hand is that big, in inches (a tiled blank needs a full-length sheet).
    const sheet = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(new URLSearchParams(location.search).get('sheet') ?? '');
    if (store.project && sheet) store.project.plan.blank.stock = { width: len(`${sheet[1]}"`), height: len(`${sheet[2]}"`) };
    // &qty=N makes that many of the cabinet.
    const qty = Math.floor(Number(new URLSearchParams(location.search).get('qty')));
    if (opened && qty >= 1) opened.quantity = qty;
    // &pockets=cnc or kreg sets how the job's pocket holes are made.
    const pockets = new URLSearchParams(location.search).get('pockets');
    if (store.project && pockets === 'cnc') store.project.plan.pocketHoles = 'cncAssisted';
    // (&pockets=low3 or low6: low-angle pockets cut on the CNC, the screw at 3 or 6 degrees.)
    if (store.project && (pockets === 'low3' || pockets === 'low6')) store.project.plan.pocketHoles = pockets === 'low3' ? 'lowAngle3' : 'lowAngle6';
    if (store.project && pockets === 'kreg') delete store.project.plan.pocketHoles;
  } else if (sample === 'shoptable') {
    // ?sample=shoptable opens milestone 8's reference job: a torsion table over cabinets at its two ends.
    const found = !copy && store.projects.find((p) => p.slug === 'shop-table');
    if (found) store.open(found.id);
    else store.addProject(createShopTableProject());
  } else if (sample === 'shoptablefold') {
    // ?sample=shoptablefold: the same table at 62" × 112" for full sheets, its back 28" a leaf that folds down.
    const found = !copy && store.projects.find((p) => p.slug === 'shop-leaf-table');
    if (found) store.open(found.id);
    else store.addProject(createFoldingShopTableProject());
  } else if (sample === 'island') {
    // ?sample=island opens milestone 8's island: two rows of shop cabinets back to back.
    const found = !copy && store.projects.find((p) => p.slug === 'island');
    if (found) store.open(found.id);
    else store.addProject(createIslandProject());
  } else if (sample === 'home') {
    // ?sample=home opens an L-shaped kitchen with a peninsula: the window wall, a peninsula, face frame in a dark stain.
    // &fresh=1 throws away the saved copy and makes it again.
    const found = !copy && store.projects.find((p) => p.slug === 'home-kitchen');
    if (found) store.open(found.id);
    else store.addProject(createHomeKitchenProject());
  } else if (sample === 'kitchen') {
    // ?sample=kitchen opens a common kitchen: an L of two walls with a fridge, a range under a microwave, a sink under
    // a window and a dishwasher, and an island. &fresh=1 makes it again.
    const found = !copy && store.projects.find((p) => p.slug === 'common-kitchen');
    if (found) store.open(found.id);
    else store.addProject(createCommonKitchenProject());
  } else if (sample === 'kitchenref') {
    // ?sample=kitchenref opens milestone 6's kitchen: an L of base runs with a blind corner, wall runs over them.
    const found = !copy && store.projects.find((p) => p.slug === 'kitchen');
    if (found) store.open(found.id);
    else store.addProject(createKitchenProject());
  } else if (sample === 'shopwall') {
    // ?sample=shopwall opens three shop cabinets in one project, creating it if there is none.
    const wall = !copy && store.projects.find((p) => p.slug === 'shop-wall' && cabinetsOf(p).length === 3);
    if (wall) store.open(wall.id);
    else store.addProject(createShopWallProject());
  } else if (sample === 'shopref' || sample === 'framerun') {
    // ?sample=shopref opens milestone 4's reference job (seven cabinets, two runs); ?sample=framerun its face frame run.
    const make = sample === 'shopref' ? createShopReferenceProject : createFaceFrameRunProject;
    const found = !copy && store.projects.find((p) => p.slug === make().slug && p.context.kind === 'designedCabinet' && p.context.runs?.length > 0);
    if (found) store.open(found.id);
    else store.addProject(make());
  } else if (sample !== null && (copy || !store.project)) store.newExistingProject();
  // ?starter=vanity (and &preset=<a preset's id>; left out, the starter's usual one) makes a new project of that starter
  // every time (the address loses it at the end, below): for looking at one from a link, and for its picture.
  const starterAsked = starterById(new URLSearchParams(location.search).get('starter') ?? undefined);
  if (starterAsked && !starterAsked.to) {
    const presets = presetsOf(store.shop);
    const usual = presets.filter((p) => (p.start === 'existing') === !!starterAsked.existing);
    const preset = presets.find((p) => p.id === new URLSearchParams(location.search).get('preset')) ?? usual.find((p) => p.id === starterAsked.prefers) ?? usual[0]!;
    store.newProjectFrom(preset, starterAsked);
    // &front=applied (or wide, plain, runners) on a starter's link: how its inset drawers' fronts are made.
    const frontAsked = new URLSearchParams(location.search).get('front');
    const made = store.project?.context;
    if (made?.kind === 'designedCabinet' && (frontAsked === 'wide' || frontAsked === 'plain' || frontAsked === 'runners' || frontAsked === 'applied')) {
      made.fronts.drawers.shop = { ...made.fronts.drawers.shop, front: frontAsked };
    }
    // &joint=tabs or blindtabs on a starter's link: its cases on tab-and-slot joints; &box=tabs: its drawer boxes on finger joints.
    const jointAsked = new URLSearchParams(location.search).get('joint');
    if (made?.kind === 'designedCabinet' && (jointAsked === 'tabs' || jointAsked === 'blindtabs')) {
      made.settings.joinery.case = 'tabs';
      if (jointAsked === 'blindtabs') made.settings.joinery.tabs = { blind: true };
      else delete made.settings.joinery.tabs;
    }
    if (made?.kind === 'designedCabinet' && new URLSearchParams(location.search).get('box') === 'tabs') {
      made.fronts.drawers.cornerJoint = 'tabs';
      for (const d of store.project ? designsOf(store.project) : []) if (d.template === 'drawer') d.box.cornerJoint = 'tabs';
    }
  }
  // &handle=knob or &handle=pull gives every door and drawer the generic knob or pull, whose holes the CNC drills; &handle=bar, arch or
  // printedknob one of the printed ones; &handle=none takes them away.
  const handle = new URLSearchParams(location.search).get('handle');
  const HANDLES: Record<string, string> = { knob: GENERIC_KNOB_ID, pull: GENERIC_PULL_ID, bar: 'printed-bar-96', arch: 'printed-arch-96', printedknob: 'printed-knob', woodbar: 'wood-bar-96', woodarch: 'wood-arch-96', fingerhole: 'routed-hole', scoop: 'routed-scoop', notch: 'routed-notch', none: '' };
  if (sample !== null && handle !== null && handle in HANDLES) {
    const handleId = HANDLES[handle]!;
    for (const d of store.project ? designsOf(store.project) : []) {
      if (handle === 'none') delete d.handle;
      else if (d.template === 'drawer') d.handle = { handleId };
      else d.handle = doorHandleChoice(handleId);
    }
  }
  // &finish=paint-navy finishes the case and the fronts in that paint or stain (a finish's id); &finish=paint-white,stain-walnut the
  // case in the first and the fronts in the second; &finish=none takes it off.
  const finish = new URLSearchParams(location.search).get('finish');
  if (sample !== null && store.project && finish !== null) {
    const [caseId, frontsId = caseId] = finish.split(',');
    if (finish === 'none') delete store.project.settings.finish;
    else store.project.settings.finish = { ...(caseId ? { caseId } : {}), ...(frontsId ? { frontsId, handlesId: frontsId } : {}) };
  }
  // &case=osb-3-4 makes the project's cases of that material (a catalog entry's id), copying it into the project.
  const caseMaterial = new URLSearchParams(location.search).get('case');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && caseMaterial) {
    const copy = addMaterialFromCatalog(store.project, store.shop.materialCatalog, caseMaterial);
    if (copy) store.project.context.settings.materials.caseId = copy.id;
  }
  // &bottom=casters (or flat, kick) stands the project's floor cabinets, and every run, on casters (milestone 9);
  // &caster=<id> picks the caster; &under=pads|layer what the casters are screwed to (left out: pads under a lone cabinet, a layer under a run).
  const bottom = new URLSearchParams(location.search).get('bottom');
  const bottomContext = store.project?.context;
  if (bottomContext?.kind === 'designedCabinet' && (bottom === 'casters' || bottom === 'flat' || bottom === 'kick' || bottom === 'plinth' || bottom === 'feet' || bottom === 'legs' || bottom === 'posts')) {
    const casterId = new URLSearchParams(location.search).get('caster');
    for (const k of [bottomContext.settings.toeKick, ...bottomContext.runs.map((r) => r.shared.toeKick)]) {
      // (`posts`: on legs that run up the corners of the case.)
      setBottomKind(k, bottom === 'kick' ? 'toeKick' : bottom === 'posts' ? 'legs' : bottom, store.shop.hardware);
      if (k.legs) setPosts(bottomContext.settings, bottom === 'posts');
      if (k.casters && casterId) k.casters.casterId = casterId;
      // A leg frame's square stock is one of the project's materials.
      if (k.legs && store.project) addMaterialFromCatalog(store.project, store.shop.materialCatalog, k.legs.materialId);
      const under = new URLSearchParams(location.search).get('under');
      if (k.casters && (under === 'pads' || under === 'layer')) k.casters.under = under;
    }
  }
  // &room=144x120x96 gives the opened project of cabinets a room that size, in inches (length, width, ceiling); &room=none takes it away.
  const roomAsked = new URLSearchParams(location.search).get('room');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && roomAsked !== null) {
    const parsed = parseRoom(roomAsked);
    if (parsed) store.project.context.room = parsed;
    else if (roomAsked === 'none') delete store.project.context.room;
  }
  // &seat=back:12 (or left, right; `none`) gives every island's top a side for stools that far past the cabinets, in inches.
  const seatAsked = new URLSearchParams(location.search).get('seat');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && seatAsked) {
    const [edge, inches] = seatAsked.split(':');
    for (const island of (store.project.context.islands ?? []).filter((i) => i.top)) {
      if (edge === 'back' || edge === 'left' || edge === 'right') island.top!.seating = { edge, overhang: len(`${Number(inches) > 0 ? Number(inches) : 10}"`) };
      else if (edge === 'none') delete island.top!.seating;
    }
  }
  // &tile=subway|square|slab|none tiles the room's walls between the countertops and the wall cabinets; &floor=planks|tile|concrete|plain
  // (`tile:5b6066` with a colour) is its floor; &walls=b9cad6 its walls' paint (a colour's six hex digits; `none` as drawn).
  const params = new URLSearchParams(location.search);
  const sampleRoom = sample !== null && store.project?.context.kind === 'designedCabinet' ? store.project.context.room : undefined;
  if (sampleRoom && (params.get('tile') !== null || params.get('floor') !== null || params.get('walls') !== null)) {
    const next = { ...sampleRoom.look };
    const hex = (v: string | undefined) => (v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined);
    const tile = TILE_LOOKS.find((t) => t.value === params.get('tile'));
    if (tile) next.tile = next.tile ? { ...next.tile, look: tile.value } : starterWallTile(tile.value);
    else if (params.get('tile') === 'none') delete next.tile;
    const [kind, colour] = (params.get('floor') ?? '').split(':');
    const floor = FLOOR_KINDS.find((k) => k.value === kind);
    if (floor) next.floor = { kind: floor.value, color: hex(colour) ?? floor.color };
    else if (kind === 'none') delete next.floor;
    const walls = params.get('walls');
    if (hex(walls ?? undefined)) next.wall = hex(walls!)!;
    else if (walls === 'none') delete next.wall;
    if (next.floor || next.wall || next.tile) sampleRoom.look = next;
    else delete sampleRoom.look;
  }
  // &corner=1:diagonal-left makes the 1st cabinet a corner cabinet: blind-left|right, diagonal-left|right, lshaped-left|right
  // (a diagonal or L-shaped one 36" along each wall, 24" on a wall cabinet); `none` makes it an ordinary one.
  const cornerAsked = new URLSearchParams(location.search).get('corner');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && cornerAsked) {
    const [n, what] = cornerAsked.split(':');
    const stored = storedCases(store.project.context)[Number(n) - 1];
    const [kind, side] = (what ?? '').split('-') as [string, 'left' | 'right'];
    if (stored && what === 'none') delete stored.corner;
    else if (stored && (side === 'left' || side === 'right')) {
      if (kind === 'blind') {
        // A cabinet that is already there is measured again as the blind corner cabinet it becomes.
        const fronts = stored.existing?.fronts;
        if (fronts) makeMade(store.project, stored.id);
        makeBlind(store.project, stored.id, side);
        // &corner=1:blind-left:24: its blind part that wide, in inches, from the outside of the case.
        const blindAsked = Number(cornerAsked.split(':')[2]);
        if (blindAsked > 0 && stored.corner?.kind === 'blind') stored.corner.blind = len(`${blindAsked}"`);
        if (fronts) makeExisting(store.project, stored.id, fronts);
      }
      if (kind === 'diagonal') {
        stored.size.width = len(stored.form === 'wall' ? '24"' : '36"');
        const cabinet = cabinetsOf(store.project).find((c) => c.id === stored.id)!;
        applyCabinetLayout(store.project, cabinet, 'doors');
        stored.corner = { kind: 'diagonal', side };
      }
      if (kind === 'lshaped') makeLShaped(store.project, stored.id, side);
    }
  }
  // &pattern=planks|level|diagonal|grid|diamond|chevron|sunburst|rectangles|waves|flutes|reeds|wavyflutes|dimples|channels|softchannels|ripples|ballripples|bullripples|frame
  // (and `none`) cuts that pattern into the project's doors and drawer fronts; &frontstyle=slab|shaker sets their style first.
  const patternAsked = new URLSearchParams(location.search).get('pattern');
  const frontStyle = new URLSearchParams(location.search).get('frontstyle');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && (patternAsked !== null || frontStyle !== null)) {
    const fronts = store.project.context.fronts;
    const layouts = { planks: 'vertical', level: 'horizontal', diagonal: 'diagonal', grid: 'grid', diamond: 'diamond', chevron: 'chevron', sunburst: 'sunburst', rectangles: 'rectangles', waves: 'waves' } as const;
    const ball = Math.max(0, ...store.shop.tools.flatMap((t) => (t.shape.kind === 'ballNose' && t.shape.diameter.mm <= 12.8 ? [t.shape.diameter.mm] : []))) || undefined;
    for (const front of [fronts.doors, fronts.doors.shop, fronts.drawers.front]) {
      if (!front) continue;
      if (frontStyle === 'slab') front.style = { kind: 'slab' };
      if (frontStyle === 'shaker' && front.style.kind !== 'shaker') front.style = { kind: 'shaker', frameWidth: len('2-1/4"'), recessDepth: len('1/4"'), insideEdge: { kind: 'vBevel', angleDeg: 60 }, floorCornerRadius: len('1/16"') };
      if (patternAsked === null) continue;
      if (patternAsked === 'none') delete front.style.pattern;
      else if (patternAsked in layouts) front.style.pattern = { ...starterPattern('grooves'), layout: layouts[patternAsked as keyof typeof layouts] } as typeof front.style.pattern;
      // (Flutes and dimples as wide as the widest ball nose in the shop up to 1/2".)
      else if (patternAsked === 'flutes' || patternAsked === 'reeds' || patternAsked === 'wavyflutes') {
        const flutes = starterPattern('flutes', ball) as Extract<FrontPattern, { kind: 'flutes' }>;
        front.style.pattern = patternAsked === 'reeds' ? flutesFor(flutes.width.mm, { ...flutes, reeded: true }) : patternAsked === 'wavyflutes' ? { ...flutes, wavy: true } : flutes;
      } else if (patternAsked === 'dimples') front.style.pattern = starterPattern('dimples', ball);
      // `ripples`: with the V-bit; `ballripples`: with the ball nose.
      else if (patternAsked === 'ripples') front.style.pattern = starterPattern('ripples');
      else if (patternAsked === 'ballripples') front.style.pattern = ripplesFor({ ...(starterPattern('ripples', ball) as Extract<FrontPattern, { kind: 'ripples' }>), bit: 'round' });
      else if (patternAsked === 'channels') front.style.pattern = starterPattern('channels');
      // `softchannels`, `bullripples`: sized for the shop's first bull nose.
      else if (patternAsked === 'softchannels' || patternAsked === 'bullripples') {
        const bull = store.shop.tools.flatMap((t) => (t.shape.kind === 'bullNose' ? [t.shape] : []))[0];
        const sized = bull ? { width: bull.diameter, corner: bull.cornerRadius } : {};
        front.style.pattern =
          patternAsked === 'softchannels'
            ? { ...(starterPattern('channels') as Extract<FrontPattern, { kind: 'channels' }>), soft: true, ...sized, ...(bull ? { spacing: { mm: bull.diameter.mm * 2, unit: 'in' as const } } : {}) }
            : ripplesFor({ ...(starterPattern('ripples') as Extract<FrontPattern, { kind: 'ripples' }>), bit: 'bull', ...sized });
      }
      // &border=1 carves the rectangle the pattern stops at as well.
      if (front.style.pattern && front.style.pattern.kind !== 'frame' && new URLSearchParams(location.search).get('border')) front.style.pattern.border = true;
      if (patternAsked === 'frame' && front.style.kind === 'slab') front.style.pattern = starterPattern('frame');
    }
  }
  // &susan=bearings|pole makes the lazy susan of every diagonal or L-shaped corner cabinet here; &rim=kerfed|laminated|none its rim;
  // &susandoors=1 fixes an L-shaped cabinet's doors to a susan on a pole.
  const susanAsked = new URLSearchParams(location.search).get('susan');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && (susanAsked === 'bearings' || susanAsked === 'pole')) {
    const rim = new URLSearchParams(location.search).get('rim');
    for (const stored of storedCases(store.project.context)) {
      if (stored.corner?.kind === 'diagonal' || stored.corner?.kind === 'lShaped') stored.corner.susan = { turns: susanAsked, rim: rim === 'laminated' || rim === 'none' ? rim : 'kerfed' };
      if (stored.corner?.kind === 'lShaped' && stored.corner.susan && susanAsked === 'pole' && new URLSearchParams(location.search).get('susandoors')) stored.corner.susan.doors = 'onSusan';
    }
    if (rim === 'laminated') addMaterialFromCatalog(store.project, store.shop.materialCatalog, SUSAN_RIM_HARDBOARD_ID);
  }
  // &top=1 puts a countertop on every floor run and every base cabinet in no run (&top=mitre: they meet at a mitre;
  // &top=bought: bought laminate tops; &top=torsion, &top=bench: torsion boxes, the light top's or the bench top's);
  // &top=none takes them off.
  const topAsked = new URLSearchParams(location.search).get('top');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && topAsked) {
    const context = store.project.context;
    const on = topAsked !== 'none';
    for (const run of context.runs) {
      const floor = storedCases(context).find((c) => run.cabinetIds.includes(c.id))?.form !== 'wall';
      if (!floor) continue;
      if (on) run.top = topAsked === 'mitre' ? { cornerJoint: 'mitre' } : {};
      else delete run.top;
    }
    for (const c of storedCases(context)) {
      if (context.runs.some((r) => r.cabinetIds.includes(c.id)) || c.form !== 'base') continue;
      if (on) c.top = {};
      else delete c.top;
    }
    for (const island of context.islands ?? []) {
      if (on) island.top = {};
      else delete island.top;
    }
    if (topAsked === 'bought') context.tops = { ...starterTopSettings(), kind: 'bought' };
    const box = TORSION_STARTS.find((x) => x.value === (topAsked === 'torsion' ? 'light' : topAsked))?.make();
    if (box) {
      context.tops = { ...starterTopSettings(), kind: 'torsion', torsion: box };
      for (const id of torsionMaterialIds(box)) addMaterialFromCatalog(store.project, store.shop.materialCatalog, id);
    }
    for (const id of [PLYWOOD_3_4_ID, SOLID_WOOD_3_4_ID]) addMaterialFromCatalog(store.project, store.shop.materialCatalog, id);
  }
  // &leaf=right:24 gives every top a leaf on that edge (back, left or right) that many inches long; &leaf=none takes them off.
  const leafAsked = new URLSearchParams(location.search).get('leaf');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && leafAsked) {
    const context = store.project.context;
    const [edge, inches] = leafAsked.split(':');
    const tops = [...context.runs, ...storedCases(context), ...(context.islands ?? [])].flatMap((x) => (x.top ? [x.top] : []));
    for (const top of tops) {
      if (edge === 'back' || edge === 'left' || edge === 'right') top.leaf = { edge, length: len(`${Number(inches) || 12}"`) };
      else delete top.leaf;
    }
  }
  // &place=7:left:12 places the project's 7th cabinet (its run, when it is in one) against the left wall, 12" from its left end;
  // several are comma-separated, and `free` takes x and y in inches and a turn: &place=2:free:60:48:180.
  const placeAsked = new URLSearchParams(location.search).get('place');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && placeAsked) {
    const context = store.project.context;
    for (const item of placeAsked.split(',')) {
      const [n, wall, a, b, turn] = item.split(':');
      const stored = storedCases(context)[Number(n) - 1];
      if (!stored || !wall) continue;
      const placement =
        wall === 'free'
          ? { wall: 'free' as const, x: len(`${a ?? 0}"`), y: len(`${b ?? 0}"`), turn: (Number(turn) || 0) as 0 | 90 | 180 | 270 }
          : ['back', 'left', 'right', 'front'].includes(wall)
            ? { wall: wall as 'back' | 'left' | 'right' | 'front', along: len(`${a ?? 0}"`) }
            : undefined;
      if (!placement) continue;
      const run = context.runs.find((r) => r.cabinetIds.includes(stored.id));
      if (run) run.placement = placement;
      else stored.placement = placement;
    }
  }
  // &run=1 puts the opened project's floor-standing cabinets in one run, if it has no run yet; &run=wall also puts its left end against a wall.
  const inRun = new URLSearchParams(location.search).get('run');
  if (sample !== null && store.project?.context.kind === 'designedCabinet' && inRun !== null && store.project.context.runs.length === 0) {
    const made = createRun(store.project, cabinetsOf(store.project).filter((c) => c.form !== 'wall').map((c) => c.id));
    if (inRun === 'wall') made.ends.left = 'wall';
    // &fill=108 gives that run a length to fill, in inches.
    const fill = Number(new URLSearchParams(location.search).get('fill'));
    if (fill > 0) made.length = len(`${fill}"`);
  }
  // A fresh copy is named after its sample, and the address loses what made it: a reload opens the copy, not one more.
  if (copy && store.project) {
    const name = new URLSearchParams(location.search).get('name');
    if (name) store.project.name = name;
  }
  // A copy of a sample, or a project of a starter, was made by this address: once every switch in it has been read it
  // goes, so that a reload opens the project and does not make one more.
  if ((copy || (starterAsked && !starterAsked.to)) && store.project) history.replaceState(history.state, '', location.pathname + location.hash);
});
app.mount('#app');
