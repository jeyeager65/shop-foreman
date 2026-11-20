/**
 * Case joinery: how the parts that span the cabinet (the bottom and the two
 * stretchers) meet the sides. A joint is a Design choice that changes both parts:
 * pocket screws put holes in the spanning part and change no size; a dado puts a
 * recess in each side and makes the spanning part longer by twice its depth; through
 * screws put a hole through each side at each screw (`case-screw-...`) and change no
 * size; tabs put slots in each side and tabs on the spanning part's ends, which is longer
 * by twice their reach (`src/design/tabs.ts`).
 *
 * The cabinet stores one joint for the case and, optionally, a different one for a
 * part. How pocket holes are made (Kreg jig or CNC-assisted) is Plan.
 */
import type { BackJoint, CabinetDesign, CabinetJoinery, CaseJoint, Mm } from '@/model';
import { MM_PER_INCH } from '@/units';

/** How deep a case dado is cut into a side. Tune me. */
export const CASE_DADO_DEPTH: Mm = MM_PER_INCH / 4;

/** The hole through a side for a through screw: clear for a #8 screw, so it pulls the joint tight. Tune me. */
export const CASE_SCREW_HOLE: Mm = (3 * MM_PER_INCH) / 16;
/** The screw a through-screwed case joint takes. Tune me. */
export const CASE_SCREW = '#8 × 2" wood screws';

/** The case parts that have a joint with the sides. */
export type JoinedPart = keyof NonNullable<CabinetJoinery['overrides']>;
export const JOINED_PARTS: { key: JoinedPart; name: string }[] = [
  { key: 'bottom', name: 'Bottom' },
  { key: 'frontStretcher', name: 'Front stretcher' },
  { key: 'backStretcher', name: 'Back stretcher' },
];

/** How deep the back's rabbet is cut into a side. Tune me. */
export const BACK_RABBET_DEPTH: Mm = (3 * MM_PER_INCH) / 8;
/** How deep the back's groove is cut into a side. Tune me. */
export const BACK_GROOVE_DEPTH: Mm = MM_PER_INCH / 4;
/** From the rear edge of a side to the rear wall of the back's groove. Tune me. */
export const BACK_GROOVE_INSET: Mm = MM_PER_INCH / 2;

/** The thinnest back that takes tabs: 1/2" plywood as measured. Tune me. */
export const TAB_BACK_MIN: Mm = 11;

/** The joinery a cabinet starts with: pocket screws throughout, the back in a rabbet, a nailer at the top back. */
export function createJoineryDefaults(): CabinetJoinery {
  return { case: 'pocketScrews', back: 'rabbet', backStretcherForm: 'nailer' };
}

/** What cabinets were built as before the back's joint was a choice: an applied back and a flat back stretcher. */
export const JOINERY_BEFORE_BACK = { back: 'applied', backStretcherForm: 'flat' } as const;

/**
 * Where the back sits for a joint: how far the sides run behind the back's front
 * face (`behind`: the sides' depth is the back's front face plus this), and how far
 * the back reaches into each side (`reach`; an applied back covers the sides).
 */
export function backFit(joint: BackJoint, backThickness: Mm, sideThickness: Mm, tabs: Mm = 0): { behind: Mm; reach: Mm } {
  // On tabs it stands where a grooved back does, so its slots are closed all round; `tabs`: how far a tab reaches.
  if (joint === 'tabs') return { behind: backThickness + BACK_GROOVE_INSET, reach: tabs };
  if (joint === 'rabbet') return { behind: backThickness, reach: BACK_RABBET_DEPTH };
  if (joint === 'groove') return { behind: backThickness + BACK_GROOVE_INSET, reach: BACK_GROOVE_DEPTH };
  return { behind: 0, reach: sideThickness };
}

/** The joint a part uses: its own when it has an override, else the cabinet's. */
export function caseJointOf(cabinet: CabinetDesign, part: JoinedPart): CaseJoint {
  return cabinet.joinery.overrides?.[part] ?? cabinet.joinery.case;
}

/** How far a part with this joint reaches into each side. `tabs`: how far a tab does (`tabReach`). */
export function jointReach(joint: CaseJoint, tabs: Mm = 0): Mm {
  return joint === 'dado' ? CASE_DADO_DEPTH : joint === 'tabs' ? tabs : 0;
}
