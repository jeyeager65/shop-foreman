import type { Slide } from '@/model';
import { len } from '@/units';

export const GENERIC_SLIDE_ID = 'generic-side-mount-ball-bearing';

/** A bottom-mount roller slide (a Euro slide), self-closing, 3/4 extension. */
export const EURO_SLIDE_ID = 'euro-bottom-mount-self-closing';

export const STARTER_SLIDES: Slide[] = [
  {
    // Placeholder values: typical of full-extension ball-bearing slides. It has no
    // hole data, so it is mounted by hand; a real product's entry can carry its holes.
    id: GENERIC_SLIDE_ID,
    kind: 'slide',
    name: 'Generic side-mount ball-bearing slide',
    generic: true,
    mount: 'side',
    sideClearance: len('1/2"'),
    lengths: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28].map((inches) => len(`${inches}"`)),
    rearClearance: 6,
    memberHeight: 45,
    extension: null,
    close: null,
    tuneMe: ['rearClearance', 'memberHeight'],
  },
  {
    // Liberty's European bottom-mount drawer slide, the D688 series (one of them: the
    // D68816C-W-TS, the 16" one, white epoxy, a roller at the front of each member). From its instruction sheet
    // (CP3253028, rev. 7/18/2025): 1/2" (12.7 mm) each side; at least 1/4" under the drawer and 5/8" over it, which
    // the box's own clearances (1/4" and 3/4") already leave; 50 lb a pair; 12" to 24" by 2"; the cabinet member
    // 5/64" (2 mm) back from the cabinet's front; for a frameless cabinet, and behind a face frame with the D688
    // socket set. The sheet's drawing gives 1-5/8" (41.3 mm) up the cabinet member's front end: taken as the member's
    // height. It does not say how far the slide extends (3/4 is usual for the kind), what it needs behind it, or
    // where its screw holes are: no hole data, so it goes on by hand, to the sheet's steps.
    id: EURO_SLIDE_ID,
    kind: 'slide',
    name: 'Liberty D688 bottom-mount roller slide (Euro), self-closing',
    generic: false,
    mount: 'bottom',
    sideClearance: len('1/2"'),
    lengths: [12, 14, 16, 18, 20, 22, 24].map((inches) => len(`${inches}"`)),
    rearClearance: 6,
    memberHeight: 41.3,
    extension: 'threeQuarter',
    close: 'self',
    note: 'The box side stands on the drawer member, which is screwed up into its bottom edge; the drawer lifts out past the rollers. 50 lb a pair. Behind a face frame it needs the D688 socket set.',
    tuneMe: ['rearClearance'],
  },
];
