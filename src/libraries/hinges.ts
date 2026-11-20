import type { Hinge } from '@/model';
import { len } from '@/units';

/** Placeholder until confirmed: cup centre from the door's top and bottom. */
const placement: Hinge['placement'] = {
  fromEnd: len('3-1/2"'),
  perDoor: [
    { maxDoorHeight: 1000, count: 2 },
    { maxDoorHeight: 1500, count: 3 },
    { maxDoorHeight: 2100, count: 4 },
    { maxDoorHeight: 1e9, count: 5 },
  ],
};

const cup = { diameter: 35, depth: 13, boreDistance: 3 };
const blumNote = 'Check the Blum spec sheet before cutting.';

export const GENERIC_HINGE_ID = 'generic-face-frame-compact-1-2';

export const GENERIC_FRAMELESS_HINGE_ID = 'generic-frameless-clip-full-overlay';

export const GENERIC_INSET_HINGE_ID = 'generic-inset-clip';

/** Blum CLIP top BLUMOTION 110°, inset, frameless (full-cranked), screw-on: the shop cabinet's hinge. */
export const BLUM_INSET_HINGE_ID = 'blum-clip-top-blumotion-110-inset-71b3750';

/** Placeholder: the hole a mounting plate's system (Euro) screw takes. */
export const PLATE_HOLE = { diameter: 5, depth: 13 };

export const STARTER_HINGES: Hinge[] = [
  {
    id: GENERIC_HINGE_ID,
    kind: 'hinge',
    name: 'Generic face-frame compact hinge, 1/2" overlay',
    generic: true,
    cabinetType: 'faceFrame',
    overlay: len('1/2"'),
    openingAngleDeg: null,
    close: null,
    attachment: null,
    cup,
    dowels: null,
    placement,
    fits: null,
    tuneMe: ['placement'],
  },
  {
    id: 'blum-compact-38n-1-2-soft-screw',
    kind: 'hinge',
    name: 'Blum Compact 38N, 1/2" overlay, soft close, screw-on',
    generic: false,
    cabinetType: 'faceFrame',
    overlay: len('1/2"'),
    openingAngleDeg: 105,
    close: 'soft',
    attachment: 'screwOn',
    cup,
    dowels: null,
    placement,
    fits: { frameThickness: len('3/4"'), doorThickness: len('3/4"') },
    note: blumNote,
    tuneMe: ['placement'],
  },
  {
    id: 'blum-compact-38n-1-2-soft-press',
    kind: 'hinge',
    name: 'Blum Compact 38N, 1/2" overlay, soft close, press-in',
    generic: false,
    cabinetType: 'faceFrame',
    overlay: len('1/2"'),
    openingAngleDeg: 105,
    close: 'soft',
    attachment: 'pressIn',
    cup,
    // Placeholder pattern: 8 mm dowels, 45 mm apart, 9.5 mm behind the cup centre.
    dowels: { diameter: 8, depth: 11, spacing: 45, setback: 9.5 },
    placement,
    fits: { frameThickness: len('3/4"'), doorThickness: len('3/4"') },
    note: blumNote,
    tuneMe: ['placement', 'dowels'],
  },
  {
    // Placeholder values: a clip hinge on a mounting plate, 32 mm system.
    id: GENERIC_FRAMELESS_HINGE_ID,
    kind: 'hinge',
    name: 'Generic frameless clip hinge, full overlay',
    generic: true,
    cabinetType: 'frameless',
    overlay: len('16mm'),
    sideAdjust: 2,
    plate: { setback: 37, spacing: 32, hole: PLATE_HOLE },
    openingAngleDeg: null,
    close: null,
    attachment: null,
    cup,
    dowels: null,
    placement,
    fits: null,
    tuneMe: ['placement', 'overlay', 'sideAdjust', 'plate'],
  },
  {
    // Placeholder values, unchecked until a real hinge's sheet is used: an inset clip
    // hinge (full crank) on a plate. The plate line is 37 mm behind the back of the door.
    id: GENERIC_INSET_HINGE_ID,
    kind: 'hinge',
    name: 'Generic inset clip hinge',
    generic: true,
    cabinetType: 'shop',
    overlay: { mm: -3, unit: 'mm' },
    sideAdjust: 2,
    plate: { setback: 37, spacing: 32, hole: PLATE_HOLE },
    openingAngleDeg: null,
    close: null,
    attachment: null,
    cup,
    dowels: null,
    placement,
    fits: null,
    tuneMe: ['placement', 'overlay', 'sideAdjust', 'plate', 'cup'],
  },
  {
    // From Blum's sheets (Blum Inc. catalog 2021, p. 12, "Inset, frameless"; product
    // details for 71B3750): 35 mm cup 13 deep, boring distance 3 to 7, screw-on boss
    // (two screws 45 apart, 9.5 behind the cup's centre, by hand). On a 0 mm plate the
    // reveal is 7 minus the boring distance: 4 mm here gives 3 mm, and the side
    // adjustment (+/- 2) reaches from 1 to 5. The plate's holes are the door's
    // thickness + 38.5 behind the front edge of the side. Doors up to 26 thick; a
    // 19 mm door needs about 1 mm of reveal to open.
    id: BLUM_INSET_HINGE_ID,
    kind: 'hinge',
    name: 'Blum CLIP top BLUMOTION 110°, inset, soft close, screw-on (71B3750)',
    generic: false,
    cabinetType: 'shop',
    overlay: { mm: -3, unit: 'mm' },
    sideAdjust: 2,
    plate: { setback: 38.5, spacing: 32, hole: PLATE_HOLE },
    openingAngleDeg: 110,
    close: 'soft',
    attachment: 'screwOn',
    cup: { diameter: 35, depth: 13, boreDistance: 4 },
    dowels: null,
    placement,
    fits: { frameThickness: len('3/4"'), doorThickness: len('3/4"') },
    note: 'On a 0 mm CLIP mounting plate. The plate\'s part number and its screw holes are not checked against a Blum sheet yet.',
    tuneMe: ['placement', 'plate'],
  },
];
