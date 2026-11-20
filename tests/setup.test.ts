import { IDBFactory } from 'fake-indexeddb';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import App from '@/App.vue';
import { cabinetsOf, setOwnFrontSettings } from '@/design';
import { createAppRouter } from '@/router';
import { addCabinet } from '@/samples/cabinet';
import { SHOP_PRESET_ID, presetsOf } from '@/samples/presets';
import { useAppStore } from '@/stores/app';
import { len } from '@/units';
import { useLowRider } from './lowRider';

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
};

/** Smoke test: every screen renders the vanity job without errors. */
describe('app screens', () => {
  it('walks Projects, Design, hinge picker, Plan, Make and Shop profile', async () => {
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createAppRouter();
    const app = createApp(App).use(createPinia()).use(router).use(createVuetify());
    app.config.errorHandler = (e) => errors.push(e);
    app.config.warnHandler = (msg) => errors.push(msg);
    const store = useAppStore();
    await store.load(new IDBFactory());
    // On the LowRider 3, the small machine this walk's blanks and sizes were written for.
    useLowRider(store.shop);
    app.mount(host);
    const go = async (path: string) => {
      await router.push(path);
      await settle();
      return host.textContent ?? '';
    };

    expect(await go('/')).toContain('No projects yet');
    store.newExistingProject();

    const design = await go('/design');
    // The vanity is a cabinet that is already there, with new doors: the cabinets' Design screen shows it.
    expect(design).toContain('Only its door opening is measured: enough for new doors.');
    expect(design).toContain('Left door3/4" MDF10-29/32" × 24-7/8"');
    expect(design).toContain('7/16" side overlay');
    expect(design).toContain('Blum Compact 38N');
    expect(design).toContain('Back: 2 hinge cups');

    const hinge = await go('/design/hinge');
    expect(hinge).toContain('Generic face-frame compact hinge');
    expect(hinge).toContain('Nearest overlay');

    const plan = await go('/plan');
    expect(plan).toContain('Flip needed');
    expect(plan).toContain('Registration holes');
    expect(plan).toContain('1/4" end mill (6.35 mm)');
    // Hanging the doors is not a Plan row: the kit is on Build's Install tab.
    expect(plan).not.toContain('Hang doors');

    const make = await go('/make');
    expect(make).toContain('doors-setup-1-back.gcode');
    expect(make).toContain('doors-setup-2-front.gcode');
    expect(make).toContain('Flip the sheet left to right onto the pins');
    await go('/plan');
    expect(await go('/make?kit=cabinet')).toContain('Support blocks, 11/16"');

    const shop = await go('/shop');
    expect(shop).toContain('LowRider 3');
    expect(shop).toContain('tune me');

    // Setup: a new project from a preset opens with the preset's answers.
    store.newProjectFrom(presetsOf(store.shop).find((p) => p.id === SHOP_PRESET_ID)!);
    const setup = await go('/setup');
    expect(setup).toContain('Shop cabinets: inset slab');
    expect(setup).toContain('Inset, 3/4" Plywood, slab doors, flat bottom');
    // Setup is a list of topics, one open at a time: the machine's line is under "Machine and sheet".
    expect(await go('/setup?topic=stock')).toContain('the largest part it cuts in one set-up is 72" × 34"');
    // Every joint is asked under Joints, with how the pocket holes are made; the box corners are no longer under Fronts.
    const joints = await go('/setup?topic=joints');
    for (const words of ['Case joints', 'Box corners', 'Pocket holes are made', 'a part cut out on a saw gets its pocket holes with the Kreg jig']) expect(joints).toContain(words);
    expect(await go('/setup?topic=fronts&sub=drawers')).not.toContain('Box corners');
    expect(await go('/')).toContain('New project');
    // Every page says which version of the app it is.
    expect(host.querySelector('[data-test="app-version"]')!.textContent).toMatch(/^Shop Foreman \d+\.\d+\.\d+/);

    // A designed cabinet: its own Design screen; Plan and Make cover the case and the drawer box too.
    store.newCabinetProject();
    const cabinet = await go('/design');
    expect(cabinet).toContain('24" wide × 34-1/2" tall × 22-1/2" deep · 8 cabinet parts');
    expect(cabinet).toContain('Left side');
    expect(cabinet).toContain('22-1/2" × 34-1/2" × 18.26 mm');
    expect(cabinet).toContain('Inside: rabbet for the back along the rear edge, 7/32" wide × 3/8" deep');
    expect(cabinet).toContain('Back stretcher3/4" Plywood22-9/16" × 4" × 18.26 mmBack: 4 pocket holes into the sides');
    expect(cabinet).toContain('Toe kick notch 3" × 4-1/2"');
    // Plan gives every part a cut-out method, lays the CNC parts out on blanks and has a row for each kind of cut.
    const cabinetPlan = await go('/plan');
    expect(cabinetPlan).not.toContain('not built yet');
    // The blanks are one list, a row each, with the setups behind the row; the rows of cuts are grouped by what they are cut into.
    expect(cabinetPlan).toContain('Blanks: 5 pieces of stock');
    expect(cabinetPlan).toContain('· 3/4" Plywood, 1 of 2Left sideInside face up');
    expect(cabinetPlan).toContain('Setup 1 · Inside face up · case: shelf-pin holes, case: hinge plate holes, case: back rabbet, case: cutout');
    expect(cabinetPlan).toContain('Case · 4 operations');
    expect(cabinetPlan).toContain('Back rabbet InsideCNCCut withCut with1/4" end mill (6.35 mm)');
    expect(cabinetPlan).toContain('Bottom groove InsideCNCCut withCut with1/8" end mill (3.175 mm)');
    expect(cabinetPlan).toContain('16 parts: 9 on the CNC, 7 on the table saw.');
    expect(cabinetPlan).toContain('Shelf A plain rectangle: nothing for the CNC to do.22-7/16" × 22-1/32"3/4" Plywood');
    expect(cabinetPlan).toContain('Pocket holes (16)');
    expect(shop).toContain('Rip capacity (fence to blade)');
    // Cut has the lists of what is cut: the saw cut list, every part with its label, the Kreg jig's holes.
    await go('/make');
    await go('/plan');
    const lists = await go('/make?lists=1');
    expect(lists).toContain('Cut list: parts cut on a saw');
    expect(lists).toContain('3/4" Plywood, 23/32" thick · table saw');
    expect(lists).toContain('122-9/16"22-9/32"C3Bottom');
    expect(lists).toContain('C1Left side22-1/2" × 34-1/2"3/4" Plywoodalong the 34-1/2"CNC, blank 3');
    expect(lists).toContain('DR1Left door');
    expect(lists).toContain('C3BottomUndersideleft edgeLeft side2", 8-3/32", 14-3/16", 20-9/32"its front edge1-1/4"');
    // The hardware and what to buy are Build's lists.
    expect(lists).not.toContain('Hinge mounting plates');
    await go('/plan');
    const buildLists = await go('/build?lists=1');
    expect(buildLists).toContain('161-1/4" pocket screws, coarse threadBottom 8, Front stretcher 4, Back stretcher 4.');
    expect(buildLists).toContain('Hinge mounting plates');
    expect(buildLists).toContain('To buy');
    // Old Make links open where their tab went: the checklist's assembly steps are Build's.
    await go('/plan');
    const build = await go('/build');
    expect(build).toContain('Build checklist');
    expect(build).not.toContain('Run cabinet');
    expect(await go('/')).toContain('1 cabinet, frameless');

    // Frameless fronts are full overlay on the generic frameless hinge; on a face frame the
    // same door set hangs on the door opening with its own hinge and overlays.
    const frameless = await go('/design');
    expect(frameless).toContain('Door opening22-9/16" wide × 22-9/16" tall');
    expect(frameless).toContain('8 cabinet parts, 5 drawer box parts, 3 fronts');
    expect(frameless).toContain('Grain runs the 34-1/2" way');
    // No frame to attach; pocket screws, the default case joint, hold the bottom and the stretchers to the sides.
    expect(frameless).not.toContain('into the face frame');
    expect(frameless).toContain('Bottom3/4" Plywood22-9/16" × 22-9/32" × 18.26 mmUnderside: 8 pocket holes into the sides');
    expect(frameless).toContain('Follows Setup: Frameless, 3/4" Plywood, shaker doors, toe kick.');
    expect(frameless).toContain('Setup: Frameless, 3/4" Plywood, shaker doors, toe kick · Change in Setup');
    // With dados the sides are cut and the parts between them are 1/2" longer.
    const joinery = cabinetsOf(store.project!)[0]!.joinery;
    joinery.case = 'dado';
    const dadoed = await go('/design?joint=dado');
    expect(dadoed).toContain('Inside: 1/4" deep dados for the bottom, front stretcher, back stretcher');
    expect(dadoed).toContain('Bottom3/4" Plywood23-1/16" × 22-9/32" × 18.26 mmEnds sit 1/4" into dados in the sides: glued, no screws');
    expect(dadoed).not.toContain('pocket hole');
    joinery.case = 'pocketScrews';
    expect(frameless).toContain('Generic frameless clip hinge, full overlay');
    expect(frameless).toContain('Left door3/4" MDF11-7/8" × 23-5/32" × 19 mm');
    expect(frameless).toContain('One front, 23-7/8" × 6-19/32". Full overlay');
    expect(frameless).toContain('Edges are bare and parts are cut to full size');
    expect(await go('/design/hinge')).toContain('Frameless cabinet');
    cabinetsOf(store.project!)[0]!.construction = 'faceFrame';
    const framed = await go('/design?style=faceFrame');
    // The frame's two stiles and three rails join the parts; pocket screws join and attach it.
    expect(framed).toContain('13 cabinet parts, 7 drawer box parts, 3 fronts');
    expect(framed).toContain('Left stile3/4" Solid wood1-1/2" × 30" × 19.05 mm');
    expect(framed).toContain('Middle rail3/4" Solid wood21" × 1-1/2" × 19.05 mmBack: 4 pocket holes into the stiles');
    expect(framed).toContain('Inside: 4 pocket holes into the face frame');
    expect(framed).toContain('Underside: 4 pocket holes into the face frame');
    expect(framed).toContain('the inside face of the left side');
    expect(framed).toContain('One front, 22" × 7"');
    expect(framed).toContain('Drawer front3/4" MDF22" × 7" × 19 mm');
    expect(framed).toContain('Door opening21" wide × 19-1/2" tall');
    expect(framed).toContain('Blum Compact 38N');
    expect(framed).toContain('Left door');
    expect(framed).toContain('10-15/16" × 20-1/2" × 19 mm');
    expect(await go('/design/hinge')).toContain('Face frame cabinet');
    expect(await go('/plan')).toContain('Shelf-pin holes InsideCNCCut withCut with1/8" end mill (3.175 mm)');
    const cabinetMake = await go('/make');
    // The fronts are blank 1 of the job's four; the sides and the box walls are cut from the others.
    expect(cabinetMake).toContain('cabinet-blank-1-setup-1-back.gcode');
    expect(cabinetMake).toContain('Load blank 1 of 4 (3/4" MDF) back face up.');
    // The files are listed under their blanks; a blank cut in one setup has its number for a name.
    expect(cabinetMake).toContain('Load blank 2 of 4 (3/4" Plywood, 1 of 2) inside face up.');
    expect(cabinetMake).toContain('Run cabinet-blank-2.gcode');
    // The screen opens on the tab the link asks for, so leave it and come back.
    await go('/plan');
    const files = await go('/make?file=2');
    expect(files).toContain('Download all (.zip)');
    expect(files).toContain('Left sidecabinet-blank-2.gcodeinside face upFluidNC');
    expect(files).toContain('cabinet-blank-1-setup-1-back.gcodeSetup 1 · back face upFluidNC');
    expect(cabinetMake).not.toContain('not built yet');
    expect(files).toContain('cabinet-slide-shims.3mf6 slide shims, 1/32" thick3D print');

    // Several cabinets: the list on the Design screen selects the one the cards and the parts are about.
    addCabinet(store.project!, { name: 'Pantry drawers', width: len('18"'), layout: 'drawers', drawers: 2 });
    const first = await go('/design');
    // (One line names the cabinet in hand and its place among them; the others are in its menu.)
    expect(first).toMatch(/A · Base cabinet\s*1 of 2\s*Add/);
    expect(first).toContain('24" wide × 34-1/2" tall × 22-1/2" deep · 13 cabinet parts, 7 drawer box parts, 3 fronts');
    const second = await go('/design?cabinet=2');
    expect(second).toContain('18" wide × 34-1/2" tall × 22-1/2" deep · 12 cabinet parts, 14 drawer box parts, 2 fronts');
    expect(second).toMatch(/B · Pantry drawers\s*2 of 2\s*Add/);
    expect(second).toContain('Drawer opening 1');
    expect(second).not.toContain('Left door');
    // The pickers come back to the cabinet they were opened from. A drawer that follows Setup
    // has no picker: its slide is Setup's until it is made different.
    expect(second).toContain('Make this drawer different');
    setOwnFrontSettings(store.project!, 'drawer-2', true);
    await go('/design?cabinet=2&own=1');
    const picker = host.querySelector<HTMLAnchorElement>('a[href*="/design/slide"]')!;
    expect(picker.getAttribute('href')).toMatch(/drawer=drawer-2&cabinet=2/);
    expect(await go('/')).toContain('2 cabinets, face frame: Base cabinet, Pantry drawers');

    expect(errors).toEqual([]);
    app.unmount();
    // Every screen of three projects, each building its job: more than the default 5 s on a slow run.
  }, 45000);
});
