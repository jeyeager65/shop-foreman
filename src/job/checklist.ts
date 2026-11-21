import { batchInHand, batchWants } from './batch';
import { FRAME_DOWELS, SEATING, seatingBrackets, frameLeafOf, frameTop, backAgainstWall, dropLeafHinges, dropLeafSupport, leafEdgeWords, leafSidesWords, boxOf, postsOf, POST_SETBACK, legFrameMiddles, piecesOf, towerSpans, onLegs, framesOf, frameFasteners, frameLayout, clearCoatOf, coatsWords, finishSteps, finishesOf, casterGroups, CASTER_INSET, susanOf, sinkCuts, SINK, FARMHOUSE_FRAME, farmhouseWords, faucetSpread, topPieces, topSettingsOf, cabinetIdOf, cabinetTags, cabinetsOf, copiesOf, designsOf, runFit, tagged, deriveWayIn } from '@/design';
import { hubOf } from '@/design/hub';
import { JOIN_SCREWS } from './lists';
import { jigSleeve, sleeveGoesIn, sleeveWords } from '@/geometry/pocketHole';
import type { CabinetJoinery, Finish, Hardware, InsideFinish, MachineProfile, Mm, Project, ResolvedPlan, SetupProgram, Tool } from '@/model';
import { slideMessage } from '@/cam/program';
import { BY_DRILL, BY_ROUTER } from '@/plan/parts';
import { DEFAULT_UNIT_PREFERENCES, formatLength } from '@/units';

/** One step of the build. */
export interface ChecklistStep {
  /** The whole step in one sentence. */
  text: string;
  /** The step without its long list (the cuts a file makes), for a screen that shows `detail` apart. */
  short: string;
  detail?: string;
  /**
   * Where the step is done (milestone 5): on Cut, to have every part cut out with its holes
   * and joints made, or on Build, to put the parts together.
   */
  phase: 'cut' | 'build';
}

/** The steps that belong together: before the machine, one blank on it, after it. */
export interface ChecklistSection {
  title: string;
  /** The blank the section is about, when it is about one. */
  blankId?: string;
  steps: ChecklistStep[];
}

/** The build steps in order, derived from the plan. */
export function buildChecklist(project: Project, plan: ResolvedPlan, programs: SetupProgram[], tools: Tool[], machine?: MachineProfile, hardware: Hardware[] = [], finishes: Finish[] = []): string[] {
  return buildChecklistSections(project, plan, programs, tools, machine, hardware, undefined, finishes).flatMap((section) => section.steps.map((step) => step.text));
}

/** How drawer fronts that are inset in their openings and screwed to their boxes are fitted: between corner posts, and an inset case's applied fronts. */
export const insetFrontsStep = (gap: string, flushWith: string): string =>
  `The fronts are inset: each sits in its opening with ${gap} all round, its face flush with ${flushWith}. Fit each drawer front to its box in the opening, on spacers that thick, before screwing it from inside the box.`;

/** The build steps in order, in sections: before the machine, each blank, after the machine. */
export function buildChecklistSections(
  project: Project,
  plan: ResolvedPlan,
  programs: SetupProgram[],
  tools: Tool[],
  machine?: MachineProfile,
  /** The shop's hardware: with it, the casters' steps (milestone 9) and how what is made for the inside of a cabinet goes in. */
  hardware: Hardware[] = [],
  /** How a by-hand step says a size: the shop's unit for saw lists. Inches when it is not given. */
  show: (mm: number) => string = (v) => formatLength(v, DEFAULT_UNIT_PREFERENCES.sawLists),
  /** The shop's paints, stains and clear coats: with them, what to finish and what to leave. */
  finishes: Finish[] = [],
): ChecklistSection[] {
  const sections: ChecklistSection[] = [];
  let steps: ChecklistStep[] = [];
  const open = (title: string, blankId?: string) => {
    steps = [];
    sections.push({ title, blankId, steps });
  };
  // Everything up to the parts being cut out is Cut's; from finishing and assembling on, Build's.
  let phase: ChecklistStep['phase'] = 'cut';
  const say = (text: string) => steps.push({ text, short: text, phase });
  open('Before you start');
  if (machine?.homeZForBitChange && programs.length > 0) say('Home the machine.');
  const toolName = (id: string) => tools.find((t) => t.id === id)?.name ?? id;
  const label = (key: string) => plan.operations.find((o) => o.key === key)?.label ?? key;

  programs.forEach((program) => {
    const { setup, blank } = program;
    const { faces } = program;
    if (sections.at(-1)!.blankId !== blank.id) open(blank.count > 1 ? `Blank ${blank.index} of ${blank.count} · ${blank.label}` : 'On the machine', blank.id);
    // With several blanks each is named, so the right sheet goes on for the right file.
    const which = blank.count > 1 ? `blank ${blank.index} of ${blank.count} (${blank.label})` : 'the blank';
    say(
      setup.flipBefore === 'none'
        ? `Load ${which}${faces.mixed ? `. Its parts lie different faces up: ${faces.detail}` : ` ${faces.summary}`}. Fit the ${toolName(program.toolIds[0] ?? '')} and jog the bit to the blank's front-left corner; the file sets X0 Y0 there.`
        : setup.flipBefore.kind === 'slideOnPins'
          ? slideMessage(setup)
          : `Flip the sheet left to right onto the pins${faces.mixed ? `: ${faces.detail}` : `, ${faces.summary}`}.`,
    );
    const ops = setup.operationKeys.map(label).join(', ').toLowerCase();
    const bits = program.toolIds.map(toolName).join(', ');
    const after = `Bits: ${bits}. Probe Z after each bit is fitted.`;
    steps.push({ text: `Run ${program.fileName}: ${ops}. ${after}`, short: `Run ${program.fileName}. ${after}`, detail: ops, phase });
    // Pin holes the bit couldn't finish are drilled out before the sheet comes off.
    const shallow = plan.warnings.find((w) => w.code === 'pinHolesShallow');
    if (setup.index === 1 && shallow && setup.pinHoles.length > 0) say(shallow.message);
  });

  open('After the machine');
  // CNC-assisted pocket holes: the CNC cut the pockets; the pilots are drilled by hand.
  const prep = plan.pocketHoles?.prep;
  if (prep) {
    say(`Print the pocket-hole ${prep.guides.length > 1 ? 'guides, one for each thickness of stock,' : 'guide'} and push ${jigSleeve(prep.guides[0]!).count === 2 ? 'two metal sleeves' : 'a metal sleeve'} (${sleeveWords(jigSleeve(prep.guides[0]!))}) into ${prep.guides.length > 1 ? 'each' : 'it'}: ${sleeveGoesIn(jigSleeve(prep.guides[0]!))} (untested experiment).`);
    for (const d of prep.drilling) {
      say(
        `Drill ${d.count} pocket-hole pilots in the ${Number(d.thickness.toFixed(1))} mm parts from the edge: a ${d.drill} mm or 5/32" bit standing ` +
          `${Number(d.bitOutOfChuck.toFixed(1))} mm out of the chuck. Lay the guide's plate on the face with its key in the pocket, pull its leg tight against the edge, ` +
          `and drill until the chuck stops against the guide: the bit comes out through the seat. The part overhangs the bench for the drill.`,
      );
    }
  }

  // Parts too long for the machine are cut on a saw: their joints and holes are made by hand.
  if (plan.parts.some((p) => p.cutOut !== 'cnc' && p.steps.some((s) => s.by === 'byHand' && (s.label.endsWith(BY_ROUTER) || s.label.endsWith(BY_DRILL))))) {
    say('Rout the joints and drill the holes of the parts that were too long for the machine and are cut on a saw: Cut\'s Lists tab has each one, with its size and where it goes, under "By hand".');
  }

  const cutout = plan.operations.find((o) => o.kind === 'cutout');
  const tabsOn = project.plan.tabs?.enabled ?? true;
  if (cutout?.method === 'cnc' && tabsOn) say('Cut the tabs and sand them flush.');
  for (const op of plan.operations) {
    if (op.kind !== 'install' && op.method !== 'cnc') {
      say(`${op.label}: ${op.method === 'handheldRouter' ? 'with the handheld router' : 'by hand'}.`);
    }
  }
  phase = 'build';
  // Hand steps the parts call for, each named so nothing the design asks for is left unsaid.
  // One cabinet: they follow on here. Several: each cabinet has a section of its own
  // with the steps its parts call for, after what is done to the whole job.
  const tags = cabinetTags(project);
  const cabinetOf = cabinetIdOf(project);
  const HANG = {
    blocks: 'Fit the hinges, rest the doors on the support blocks, set the gap with the shim, screw to the frame and adjust.',
    // Frameless: the hinges clip onto plates on the case sides; there is no frame to screw to.
    plates: 'Screw the hinge plates to the holes in the case sides and fit the hinges in their cups. Rest the doors on the support blocks, set the gap with the shim, clip the hinges onto their plates and adjust.',
    // Inset doors have no blocks to stand on: they stand on shims inside their opening.
    inset: 'Screw the hinge plates to the holes in the case sides and fit the hinges in their cups. Stand each door in its opening on two shims, clip it on, then adjust the hinges until the gaps are even all round and the faces are flush with the case front.',
  };
  /** The assembly steps of the parts `mine` picks out, by their id. */
  const assemble = (mine: (partId: string) => boolean, joinery?: CabinetJoinery) => {
    const partIds = plan.parts.map((p) => p.partId).filter(mine);
    const has = (suffix: string) => partIds.some((id) => id.endsWith(suffix));
    const stepped = (label: RegExp) => plan.parts.some((p) => mine(p.partId) && p.steps.some((s) => label.test(s.label)));
    const cut = (key: RegExp) => plan.operations.some((o) => key.test(o.key) && o.source.kind === 'features' && o.source.refs.some((r) => mine(r.partId)));
    if (cut(/:holes:case-screw@/)) {
      say('Countersink the case screw holes on the outside of the sides. At assembly, drill a pilot through each into the end of the bottom or stretcher and drive the screws.');
    }
    if (cut(/:holes:finger-pull$/) || stepped(/^Finger pull notch/)) say('Ease the edges of the finger pulls with sandpaper or a small roundover.');
    if (cut(/:holes:handle(@|$)/)) {
      say(
        'Fit the handles in the holes the CNC drilled, their screws from the back.' +
          (cut(/^drawerFronts:holes:handle$/) && has('/front') ? ' Behind an applied drawer front, first drill on through the box front through the holes in the front.' : ''),
      );
    }
    // A solid wood strip on the front edges of a plywood case: on before the case goes together, while each part lies flat.
    if (partIds.some((id) => /-edge(-[xy][01])?$/.test(id)) && plan.parts.some((p) => mine(p.partId) && p.steps.some((s) => s.label.startsWith('Solid wood strip')))) {
      say('Glue a solid wood edge strip to the front edge of each case part that has one (the sides, the bottom, the top or front stretcher, the shelves, the partitions): the strip a hair proud of both faces, taped or clamped until dry, then planed or sanded flush. Each strip is named for its part.');
    }
    // Putting the case together, for any cabinet: its joint, its back, its toe kick, its face frame.
    if (joinery && has('/side-left')) {
      const square = 'fronts flush, and check the case is square (its diagonals equal)';
      // A case with no bottom panel (`noBottom`) has stretchers in its place.
      // (A top panel is in the stretchers' place on a wall or a tall cabinet and on a piece of furniture.)
      const over = has('/top') && !has('/stretcher-front') ? 'the top' : 'the stretchers';
      const spans = has('/bottom') ? `the bottom and ${over}` : over;
      const tabs = joinery.case === 'tabs' ? joinery.tabs : undefined;
      say(
        joinery.case === 'tabs'
          ? `Assemble the case: try it dry first. Lay one side down with its inside face up, glue the tabs of ${spans} into its slots, then lower the other side onto the tabs standing up. Clamp across the case at the tabs, ${square}.${tabs?.blind ? '' : tabs?.proud?.mm ? ' The ends of the tabs stand a little proud of the sides: sand them flush once the glue is dry.' : ' The ends of the tabs come flush with the outside of the sides: wipe the glue off them before it sets.'}`
          : joinery.case === 'dado'
          ? `Assemble the case: glue ${spans} into the dados in the sides and clamp, ${square}.`
          : joinery.case === 'throughScrews'
            ? `Assemble the case: stand ${spans} between the sides and drive the case screws, ${square}.`
            : `Assemble the case: join ${spans} to the sides with pocket screws, glue in the joints, ${square}.`,
      );
      if (has('/back')) {
        say(
          joinery.back === 'tabs'
            ? "The back's tabs go into the slots in the sides as the case goes together: glue them, and fit the back before the second side goes on. It holds the case square."
            : joinery.back === 'groove'
            ? 'The back slides into its grooves as the case goes together: fit it before the second side goes on.'
            : joinery.back === 'applied'
              ? 'Fasten the back over the rear of the case with brads or staples, flush all round: it holds the case square.'
              : 'Fasten the back into its rabbets with brads or staples: it holds the case square.',
        );
      }
      if (has('/toe-kick')) {
        const owner = cabinetsOf(project).find((c) => partIds.includes(`${c.id}/toe-kick`));
        const screwed = cabinetsOf(project).some((c) => c.toeKick.joint === 'pocketScrews' && partIds.includes(`${c.id}/toe-kick`));
        if (owner?.toeKick.board) {
          // In front of the sides: it covers their front edges in the toe space.
          say(
            screwed
              ? "Stand the toe kick board across the front of the sides' notches, its ends flush with their outside faces and its top against the underside of the bottom. Pocket-screw it from behind: through each side's inside face forward into its back, and from its back up into the bottom."
              : "Glue and brad the toe kick board across the front of the sides' notches, its ends flush with their outside faces and its top against the underside of the bottom.",
          );
        } else {
          say(
            screwed
              ? 'Stand the toe kick board between the sides, its face flush with the front of their notches and its top against the underside of the bottom, and pocket-screw it from its back: into each side, and up into the bottom.'
              : 'Fasten the toe kick board between the sides, its face flush with the front of their notches.',
          );
        }
      }
      if (has('/frame-stile-left')) say('Join the face frame flat on the bench, pocket screws in the back of its rails, then glue and clamp it to the front of the case, flush at the sides.');
    }
    if (has('/corner-block-front-left') || has('/cross-stretcher-left')) {
      const what = [has('/corner-block-front-left') ? 'a corner block in each top corner, against the side and the stretcher' : '', has('/cross-stretcher-left') ? 'the two cross stretchers between the front and back stretchers' : ''].filter(Boolean).join(', and ');
      say(`Glue and screw ${what}, flush with the top of the case: the top bears on them.${has('/cross-stretcher-left') ? " Check the sink's bowl clears the cross stretchers before they go in." : ''}`);
    }
    // What is made for the inside of a cabinet (organizers): whether the cabinet is already there, and how each thing goes in.
    const fitted = cabinetsOf(project).filter((c) => partIds.some((id) => id.startsWith(`${c.id}/sink-`)));
    const there = fitted.some((c) => c.existing);
    const goesIn = () => {
      for (const cabinet of fitted) {
        try {
          for (const way of deriveWayIn(cabinet, project.materials, hardware, show)) say(`Through the door opening. ${way.words}`);
        } catch {
          // Without the shop's slides the trays cannot be worked out: the steps above stand.
        }
      }
    };
    if (there && (has('/tray-notch-front') || partIds.some((id) => /\/sink-shelf(-\d+)?$/.test(id)))) say("Before cutting what is notched round the plumbing: print its paper template (Design, under the sink), cut it out and hold it in the cabinet against the plumbing, its left edge as far from the cabinet's side as the sheet says. Measure again if it does not go round.");
    if (partIds.some((id) => /\/sink-tray-(?!left|right)[^/]*\/strip-left$/.test(id))) say("Print the slide jigs (Cut, 3D prints): two for each height. A build-out strip rests on a pair of them, one near the front of the cabinet and one near the back, while it is screwed to the cabinet's side.");
    if (fitted.some((c) => c.inside?.organizers.some((o) => o.kind === 'tray' && o.slides === 'bottom' && !(o.up && o.up.mm > 0)))) {
      say("The tray on bottom-mount slides: screw the pair of slides down to the cabinet's floor, parallel and square to its front, their front ends where the tray's front comes. Pull both right out, set the tray on them level and square, and fasten it from underneath through the slides' holes into its bottom. Nothing stands beside it: no frame, no strips.");
    }
    if (has('/tray-side-left')) {
      say('Under the sink: glue and brad each tray, its sides round the front and the back in their rabbets and the bottom in its groove, and check it is square. A tray cut round the plumbing has three more walls round its notch, butted, glued and pinned.');
      if (has('/strip-left')) say(`Glue and screw the build-out strips to the ${there ? "cabinet's" : 'case'} sides, level and square to the front, one layer on another, and screw the slides to them and to the trays. Run each tray in and out past the plumbing${there ? '' : ' before the cabinet is set'}.`);
      if (has('/sink-frame/standard-left')) {
        say(`On the bench: lay the tray frame's two rails flat and parallel, stand a standard across their ends at each side, flush with the rails' ends, and screw up through the rails into the standards with glue. Check the frame is square (its diagonals equal) and the standards are parallel.${has('/sink-frame/tie') ? ' Screw the tie between the standards at the back, where the parts list puts it: it keeps them upright.' : ''}`);
        say("Screw the slides to the inner faces of the standards, level, and to the trays. Set the frame on the cabinet's floor, centred in the door opening and square to the cabinet's front, and screw down through its rails into the floor. Run each tray in and out past the plumbing.");
      }
    }
    if (partIds.some((id) => /\/sink-shelf(-\d+)?$/.test(id))) {
      say("Screw the shelf's cleats to the sides, level, and lay the shelf on them, screwed down from above.");
      if (has('/standard')) say(`Screw a standard to the shelf each side of the plumbing, square to the front: the inner slide of each side tray hangs on it.${has('/standard-outer') ? ' Screw the outer standards to the shelf the same way, parallel to them: the outer slides hang on those, and nothing is fastened to the cabinet\'s sides but the cleats.' : ''}`);
    }
    if (has('/bottom') && partIds.some((id) => /\/sink-rack-[^/]+\/bottom$/.test(id))) {
      say("The door racks: glue and brad each one, its bottom and its back strip between its two ends, the rail across the front. Screw each to the inside of its door through its back strip, level, the hinge end an inch and a half in from the door's hinge edge, with screws shorter than the door and the strip are thick together. Shut the door slowly the first time: nothing behind it may touch.");
    }
    if (partIds.some((id) => /\/sink-narrow[^/]*-frame\/standard-left$/.test(id))) {
      say("The narrow pull-out: glue and brad its tray as the others, and screw its frame together on the bench (two standards across the ends of two rails, square). Screw the slides to the standards and to the tray, set the frame on the cabinet's floor square to its front where the design puts it, and screw down through its rails.");
    }
    if (partIds.some((id) => /\/sink-blind[^/]*-frame\/standard-1$/.test(id))) {
      say("The blind corner tray: glue and brad it as the others. Its frame is two standards on two rails, as a pull-out's, but it stands across the cabinet in the blind half: one standard near the front, one near the back, the tray between them with its low wall toward the door opening. Screw the slides to the standards and to the tray on the bench. Put the frame in through the door opening on edge, lay it down in the blind half where the design puts it, square to the cabinet's front, and screw down through its rails.");
      if (partIds.some((id) => /\/sink-blind[^/]*-frame\/tie$/.test(id))) say("With two blind corner trays the standards are tall: screw the tie across their far ends, through it into each standard's end, on the bench, so they stay upright and parallel. The trays stop just short of it.");
      say('To reach the lowest blind corner tray: pull the tray in front of the doors right out, then pull the blind corner tray across into the space it left. Push it back before the other goes in. It stands as low as it can, inside the height of the tray in front of the doors, so it cannot come across while that tray is in. A blind corner tray above it stands clear over the tray in front of the doors and comes across without that tray moving, as long as nothing in it stands higher than its walls.');
    }
    if (partIds.some((id) => /\/sink-blind[^/]*-platform\/apron-front$/.test(id))) {
      say("The blind corner tray that also comes forward: screw its platform together on the bench, the two aprons along its travel with a wall across each end, square. Glue and brad its tray as the others, its sides round the front and the back in their rabbets and the bottom in its groove. Hang the platform on the sideways slides on the two standards, by its aprons, and the tray between the platform's two walls on its own pair of slides, its low wall toward the cabinet's front. Screw the landing cleat to the cabinet's back behind the door opening and the ledge on it, so the platform's back apron just rides onto the ledge as it comes across.");
      say('To use it: pull it across by the platform until it stops, then pull the tray out of the door opening. Push the tray right in before the platform goes back. Slides that hold themselves shut keep the tray on the platform while it goes sideways; if yours do not, fit a small catch behind the tray.');
    }
    if (partIds.some((id) => /\/sink-dividers[^/]*\/base$/.test(id))) {
      say('The dividers: on the bench, stand the boards in the dados of the base with glue, lay the top on them, its dados down, and clamp it square while the glue sets. Stand the rack in the cabinet where the design puts it and screw down through its base.');
    }
    if (partIds.some((id) => /\/sink-pullout[^/]*-frame\/standard-left$/.test(id))) {
      say("The trash pull-out: glue and brad its tray as the others, and screw its frame together on the bench (two standards across the ends of two rails, square). Screw the slides to the standards and to the tray, set the frame on the cabinet's floor square to its front where the design puts it, and screw down through its rails. Stand the bins in the tray and run it in and out under the sink.");
    }
    if (has('/sink-tilt/bottom')) {
      say('The tilt-out tray: glue and brad its bottom and its lip between its two ends. Take the false front off the cabinet, hang it on the tilt-out hinges as their maker says, and screw the tray to its back, its ends against the front, clear of the opening all round.');
    }
    if (fitted.length) goesIn();
    if (has('/sleeper-middle')) {
      say('Screw the sleepers under the bottom: one in from each wall, one under the middle. When the cabinet is set in its corner, shim under the sleepers and the sides until it is level and does not rock, then screw through the backs into the wall studs.');
    }
    if (has('/partition-1')) {
      say('Fit the partitions between the bottom and the stretchers (or the top) as the sides are joined, square to the front, before the back goes on; fasten the back to their rear edges as to the sides.');
    }
    if (has('/frame-mullion-1')) say('Join the mullions to the top and bottom rails with the frame, pocket screws in their backs, before the middle rails go in between them.');
    if (has('/bottom-under')) {
      say("Glue and screw the second layer under the case, flush all round: up into the bottom and the sides' lower edges, its pilot holes facing down.");
    }
    if (has('/susan-shelf-1')) {
      if (cabinetsOf(project).some((c) => susanOf(c)?.rim === 'kerfed')) say("The lazy susan's rims: bend each slotted strip with its slots inward, a little at a time, and work it into the groove round its shelf with glue in the groove and in the slots as they close; hold it with a band clamp or tape until it sets. A rim in more than one piece butts end to end in the groove. A pie-cut shelf has a plain straight piece along each of its two straight edges as well, in the same groove: cut them to meet each other at the corner and the bent rim at their far ends. Try one dry first: if the face veneer cracks at a slot, wet the outside of the strip and bend it more slowly.");
      if (cabinetsOf(project).some((c) => susanOf(c)?.rim === 'laminated')) say("The lazy susan's rims: glue the outer strip into the groove round each shelf, then the inner strip inside it with glue between the two, their ends, and the joints of a rim in pieces, a hand's width apart; a pie-cut shelf has two straight pieces along its straight edges as well, each of two strips, in the same groove; hold them with a band clamp or tape until they set.");
      if (has('/susan-fixed-shelf')) say("The lazy susan's fixed shelf: screw cleats of scrap to the two backs and the two end sides at its height, set it on them level, and screw it down to them. Nothing may stand under or over its inside corner: the shelves turn through there.");
      if (cabinetsOf(project).some((c) => susanOf(c)?.turns === 'pole')) {
        say("The lazy susan, on its pole: screw the bottom pivot to the middle of where the shelves turn, on the cabinet's bottom, and the top pivot under the top in line with it (a plumb line finds it). Slide the flanges and the shelves onto the pole, stand it in its pivots, set each shelf at its height and lock its flange. Do this before the top goes on: a shelf does not go in through the doors.");
      } else {
        say("The lazy susan, on its bearing rings: screw a ring to the middle of the underside of each shelf, then, through the hole in the ring's other plate, to what it turns on: the lower shelf on the cabinet's bottom, the upper on the fixed shelf. Do this before the top goes on: a shelf does not go in through the doors.");
      }
    }
    if (has('/susan-stile-1')) {
      say("The lazy susan's doors turn with it. Fix a stile to each end side, flush with the case's front, between the bottom and the top: it is thin so the doors' corners pass behind it, so glue it to a cleat of scrap screwed to the side's inside face, the cleat no wider than half the stile. With the susan on its pole and its notch square to the two faces, stand each door against the shelves' straight edges, an even gap from its stile, from the bottom and from the top, and screw it to both shelves with two angle brackets under each. Turn it right round by hand: nothing may touch the sides, the backs or the stiles. Set the stop at the pole so it rests with the doors flush.");
    }
    if (has('/caster-pad-1')) {
      const footed = cabinetsOf(project).some((c) => c.toeKick.casters?.feet && partIds.some((id) => id.startsWith(`${c.id}/`)));
      say(`Glue and screw a pad under the case for each ${footed ? 'foot' : 'caster'}, its pilot holes facing down: in a corner flush with the case's two outside faces, up into the bottom and the side's lower edge; at a join between two cabinets, one each side of it, flush with the join.`);
    }
    // (A wide front with a style of its own is cut with the fronts: its dados are in their rows.)
    const wideDados = cut(/^(boxes|drawerFronts):dado$/);
    if (wideDados) say(cut(/^boxes:dado$/) ? 'Glue the drawer box sides into the dados in the back of the wide front, square to it.' : "Glue the drawer box sides into the dados in the back of the one-piece front, square to it, the bottom in the groove between them; the box's back goes on as usual.");
    // A drawer box on its own corners (the wide front's dados are the line above).
    const fingered = designsOf(project).some((d) => d.template === 'drawer' && d.box.cornerJoint === 'tabs' && partIds.includes(`${d.id}/box-back`));
    if (fingered) say("Assemble each drawer box with finger joints: try it dry, then glue the tabs of its back (and of its front, where the front is a wall of the box) into the slots at the ends of the sides, the bottom in its groove as it goes together; clamp across the corners and check it is square.");
    if (has('/box-side-left') && !wideDados && !fingered) {
      say(
        cut(/^boxes:rabbet$/)
          ? 'Assemble each drawer box: glue and brad the sides into the rabbets of its front and back, the bottom in its groove, and check it is square.'
          : 'Assemble each drawer box: join its corners with pocket screws, the bottom in its groove, and check it is square.',
      );
    }
    const onRunners = has('/runner-left') || has('/kicker-left');
    if (onRunners) {
      say('Glue and screw the runner and kicker strips to the case sides, level and square to the front. Fit the drawers, glue stops at the back so each front closes flush, and wax the runners.');
    } else if (has('/box-side-left')) {
      say('Fit the slides: their cabinet members in the case (on the pilot holes, where the CNC drilled them; on the strips or brackets behind a face frame), their drawer members on the boxes, and hang the drawers.');
      if (designsOf(project).some((d) => d.template === 'drawer' && hardware.some((h) => h.kind === 'slide' && h.id === d.slide.slideId && h.mount === 'bottom'))) say('A bottom-mount roller slide: its drawer member is an angle, set under the bottom edge of the box side with its front end at the front of the box and screwed up into the edge; its cabinet member goes on level, 5/64" (2 mm) back from the front of the cabinet: hang a cabinet member on its drawer member, measure from the bottom of the drawer front up to the top edge of the cabinet member, and mark that height in the cabinet (as the sheet that comes with it says). The member marked R, on the right, holds the drawer in line. Behind a face frame the back end of each cabinet member goes in the sockets of the D688 socket set. Tip the front of the drawer up to hang it past the rollers, and to lift it out.');
    }
    // New fronts for drawers that are already there: the box and its slides stay.
    const standing = cabinetsOf(project).filter((c) => c.existing);
    if (designsOf(project).some((d) => d.template === 'drawer' && partIds.includes(`${d.id}/front`) && standing.some((c) => d.mounting.openingId.startsWith(`${c.id}/`)))) {
      say("The new drawer fronts: take each old front off its box, unscrewing it from inside the box. Hold the new front on the box with double-sided tape, the drawer shut and the gaps round the front even, then pull the drawer and screw the front on from inside, through the box front, with screws shorter than the two are thick together. A box whose front is part of it keeps it: the new front goes over it only when the drawer can sit that much further in.");
    }
    if (has('/front') && has('/box-front')) say('Fasten each drawer front to its box from inside, through the box front, with the gaps round it even.');
    // An inset case's applied drawer fronts: fitted in the opening, like those between corner posts.
    const insetApplied = designsOf(project).filter((d) => d.template === 'drawer' && d.shop?.front === 'applied' && partIds.includes(`${d.id}/front`));
    const insetCase = cabinetsOf(project).find((c) => c.construction === 'shop' && !postsOf(c, project.materials) && insetApplied.some((d) => d.mounting.openingId.startsWith(`${c.id}/`)));
    if (insetCase) say(insetFrontsStep(show(insetCase.shop.gap.mm), 'the front edges of the case'));
  };
  /** The shelves go in last, on their pins. */
  const shelves = (mine: (partId: string) => boolean) => {
    if (plan.parts.some((p) => mine(p.partId) && /\/shelf-\d+$/.test(p.partId))) say('Once the finish is dry, put the shelf pins in and set the shelves.');
  };
  /** Hanging a wall cabinet, once its doors are off or not yet on. */
  const hang = (cabinet: { form: string; hanging: string; existing?: unknown; onTop?: { of: string } }) => {
    // One that is already there hangs already.
    if (cabinet.form !== 'wall' || cabinet.existing) return;
    // A hutch stands on another piece's top: it is not hung.
    if (cabinet.onTop) {
      const under = piecesOf(project).find((p) => p.id === cabinet.onTop!.of);
      say(`Stand it on ${under ? under.name : 'the piece under it'}, at the back of the top with their left ends in line, and screw up through the top into the hutch's sides and bottom from underneath, two screws a side.`);
      return;
    }
    if (cabinet.hanging === 'rails') {
      say('Hang the cabinet: hold it level at its height and screw through the top and the bottom hanging rail into the wall studs.');
    } else {
      say('Rip the cleat strips with the blade at 45°. Glue and screw one to the top of the cabinet\'s back, its bevel down and toward the back, and the spacer strip to the bottom of the back.');
      say('Screw the other cleat to the wall studs, level, its bevel up and toward the wall, and lower the cabinet onto it.');
    }
  };
  // A batch in hand: only the cabinets it makes parts of have a section, and what is done to a whole case
  // (hanging it, setting its run) is said only when the batch makes that case.
  const batch = batchInHand(project);
  const wants = batchWants(batch);
  /** Finishing: what gets which finish and what is left bare, or the plain step when the project names no finish. */
  const finish = (mine: (partId: string) => boolean, cabinet?: { insideFinish?: InsideFinish }) => {
    const has = (pattern: RegExp) => plan.parts.some((p) => mine(p.partId) && pattern.test(p.partId));
    const said = finishSteps(project, { finishes }, cabinet, { boxes: has(/\/box-/), handles: has(/handle/) });
    if (said.length) said.forEach(say);
    else say('Seal and paint.');
  };
  const kit = plan.installKit.map((j) => `${j.quantity} ${j.template === 'supportBlock' ? 'support block' : 'gap shim'}${j.quantity > 1 ? 's' : ''}`).join(', ');
  if (tags.size === 0) {
    assemble(() => true, cabinetsOf(project)[0]?.joinery);
    finish(() => true, cabinetsOf(project)[0]);
    shelves(() => true);
    cabinetsOf(project).filter((c) => wants(c.id, 'cases')).forEach(hang);
    if (plan.installKit.length > 0) {
      say(`Print the install kit: ${kit}.`);
      say(plan.installKit.some((j) => j.template === 'supportBlock') ? (cabinetsOf(project)[0]?.construction === 'frameless' ? HANG.plates : HANG.blocks) : HANG.inset);
    }
  } else {
    // Several cabinets: each is put together, then finished, in its own section.
    if (plan.installKit.length > 0) say(`Print the install kit: ${kit}. One kit hangs the doors of every cabinet.`);
    const doors = designsOf(project).filter((d) => d.template === 'doorSet' && plan.parts.some((p) => p.partId.startsWith(`${d.id}/`)));
    const times = (n: number) => (n > 1 ? `, ${n} of them` : '');
    for (const cabinet of cabinetsOf(project)) {
      if (batch && !plan.parts.some((p) => cabinetOf(p.partId) === cabinet.id)) continue;
      open(`${tagged(cabinet.name || 'Cabinet', tags.get(cabinet.id))}${times(copiesOf(cabinet))}`);
      assemble((partId) => cabinetOf(partId) === cabinet.id, cabinet.joinery);
      finish((partId) => cabinetOf(partId) === cabinet.id, cabinet);
      shelves((partId) => cabinetOf(partId) === cabinet.id);
      if (wants(cabinet.id, 'cases')) hang(cabinet);
      if (doors.some((d) => cabinetOf(d.id) === cabinet.id)) say(cabinet.construction === 'shop' ? HANG.inset : cabinet.construction === 'frameless' ? HANG.plates : HANG.blocks);
    }
  }
  // Runs: the cabinets of each are set side by side, joined, filled out to the wall and fastened.
  if (project.context.kind === 'designedCabinet') {
    const context = project.context;
    const all = cabinetsOf(project);
    for (const run of context.runs) {
      const members = all.filter((c) => c.runId === run.id);
      // A run is set once its cases are made: in a batch, when it makes them all.
      if (!members.every((c) => wants(c.id, 'cases'))) continue;
      // Cabinets that are already there stand or hang where they are.
      if (members.length === 0 || members.every((c) => c.existing)) continue;
      const names = members.map((c) => tagged(c.name || 'Cabinet', tags.get(c.id)));
      const onWall = members[0]!.form === 'wall';
      const rolling = !onWall && !!members[0]!.toeKick.casters;
      const framed = members.some((c) => c.construction === 'faceFrame');
      open(`Run: ${run.name}`);
      say(
        onWall
          ? `Hang the cabinets left to right${names.length > 1 ? `: ${names.join(', ')}` : ''}. Level each to the one before it, tops and fronts in line.`
          : rolling
            ? `Stand the cabinets on their tops on a flat floor, left to right${names.length > 1 ? `: ${names.join(', ')}` : ''}, fronts and bottoms in line.`
            : `Set the cabinets in place left to right${names.length > 1 ? `: ${names.join(', ')}` : ''}. Level them, shimming under them, with their tops and fronts in line.`,
      );
      if (members.length > 1) {
        say(`Clamp each pair together, fronts flush, and screw them to each other through their ${framed ? 'stiles' : 'sides'}: ${JOIN_SCREWS} screws a join.`);
      }
      const fit = runFit(context, run);
      for (const filler of fit?.fillers ?? []) say(`Scribe the filler strip to the wall at the ${filler.end} end and fasten it to the end cabinet, its face flush with the front.`);
      if (!onWall && !rolling) say('Fasten the run to the wall through the back of each cabinet, near the top, into the studs.');
      // One toe kick board across the run goes on last, from the front.
      if (plan.parts.some((p) => members.some((c) => p.partId.startsWith(`${c.id}/toe-kick-run`)))) {
        say(`Fit the toe kick board across the front of the sides' notches, from the outside of the first cabinet to the outside of the last: glue and brad it to the front edge of every side. Where the run is longer than a board, two boards meet at a join between two cabinets.${fit?.fillers.length ? ' It runs on under the filler strip to the wall: scribe its end to the wall as the strip is, and put a block on the wall or the floor behind that end to brad it to.' : ''}`);
      }
    }
    // A back filler: the board between a cabinet's back and the appliance behind it.
    for (const c of all.filter((c) => c.backFiller)) {
      say(`Fasten the back filler behind ${c.name}, at its ${c.backFiller!.side} side: on edge between its back and what stands behind it, its face in line with the cabinet's side.`);
    }
    // Casters (milestone 9): on the joined group, so a caster over a join ties the cabinets together.
    for (const g of hardware.length ? casterGroups(project, hardware) : []) {
      // Bought feet stand where casters would, on the same plates: nothing rolls or locks.
      if (g.caster.foot) {
        open(`Feet: ${g.name.replace(/^The /, 'the ')}`);
        say(g.members.length > 1 ? 'With the cabinets joined, keep the group upside down on its tops.' : 'Lay the cabinet on its top on a blanket.');
        if (g.under === 'bottom') {
          const inset = show(CASTER_INSET);
          say(`Screw the ${g.places.length} feet on under the bottom, one in each corner, its plate ${inset} in from the case's two outside faces there: mark through the plate, drill pilot holes no deeper than 1/2", and use screws no longer than the bottom is thick.`);
        } else say(`Screw the ${g.places.length} feet on through their plates into the pilot holes; one over a join takes two screws in each cabinet.`);
        say('Turn it upright onto its feet with a helper and check it stands level and does not rock.');
        continue;
      }
      open(`Casters: ${g.name.replace(/^The /, 'the ')}`);
      if (g.members.length > 1) say(g.members.some((m) => m.turned) ? 'With both rows joined, screw the rows to each other back to back, through their backs into the sides behind.' : 'With the cabinets joined, keep the group upside down on its tops.');
      else say('Lay the cabinet on its top on a blanket.');
      const locking = g.places.filter((x) => x.locking).length;
      say(`Screw the ${g.places.length} casters on through their plates into the pilot holes, ${g.caster.locking ? `all with a brake` : `the ${locking} with a brake at the front ends`}; one over a join takes two screws in each cabinet.`);
      say('Turn it upright onto its casters with a helper, lock the front ones and check it stands level.');
    }
  }
  /** A torsion top's folding leaf: two boxes, built together so they come out one height, then hinged, pinned and latched. `on`: what the table stands on. */
  const torsionLeafSteps = (leaf: Mm, stays: Mm, on: string) => {
    say(`The table is two boxes: the part that stays (${show(stays)}) and its leaf (${show(leaf)}). Build both on the same flat surface, end to end with their joint ribs clamped face to face and the alignment pins dry in their holes, so the two come out one height and in line.`);
    say("Glue the brass alignment pins into the holes in the leaf's joint rib and their sockets into the table's, the bullet noses toward the table. Try the joint: the pins should enter without lifting the leaf.");
    say("Before the top skins go on: glue a hinge backer into every cell along the joint, in both boxes, flat on the bottom skin and tight against the joint rib. With the two boxes clamped joint to joint, bottoms up, lay the hinge across the joint, its knuckle on the joint line, and drill through its holes, the skin and the backers: 1/4\" under the part that stays, pilot holes under the leaf. Take the hinge off and drive a T-nut into each 1/4\" hole from inside, on top of its backer. Then glue the top skins on.");
    say("Turn both over again, joint closed and clamped, and fasten the hinge: machine screws into the T-nuts under the part that stays, wood screws into the backers under the leaf. With the leaf down the first are what it hangs from.");
    say("Screw the two threaded inserts into the holes in the outside of the leaf's far rib and wind a levelling foot into each. With the leaf down, wind the feet out until they stand on the floor and take its weight off the hinge. Lower the leaf by hand, never let it drop.");
    say(`Screw the two folding leg brackets and their legs under the leaf's far end. Set the table on ${on} and fasten the part that stays; swing the leaf up, lock its legs, and wind the levelling feet until a straightedge lies flat across the joint, both ways.`);
    say('Fit a draw latch across the joint on each long edge and adjust it until the joint is pulled tight. Fold the leaf down and up a few times and check the joint with the straightedge each time.');
    say('For a CNC: split the rail at the joint with a pin or a sleeve inside it, give the belts a second anchor at the end of the part that stays, and surface the spoilboard with the leaf up and latched.');
  };
  /** A slab's drop leaf: hinged face down under a square joint, then what it rests on fitted and levelled. `on`: what the top stands on; `hangs`: what a bracket is hinged to. */
  const dropLeafSteps = (where: string, leaf: Mm, joint: Mm, on: string, hangs: string, both = false) => {
    const support = dropLeafSupport(leaf, joint);
    const pair = support.count === 2;
    if (both) {
      // A leaf on each of two opposite edges (a classic drop-leaf table): the same, twice.
      say(`The two leaves at ${where} (${show(leaf)} each) are panels of their own. Finish their outside edges as the top's; leave the edges that meet at the two joints square, with nothing on them.`);
      say(`Lay the top and its leaves face down, edge to edge and tight, their ends in line. Fit ${dropLeafHinges(joint)} hinges across each joint, their knuckles on the joint line and standing up; let a hinge in flush where the two faces do not close tight. Lower a leaf by hand, never let it drop.`);
      if (support.kind === 'brackets') say(`With the top on ${on}, fit two swing-out brackets for each leaf under the part that stays, each hinged to ${hangs}, so that it swings out square under its leaf and in flat. Raise each leaf onto its brackets and check it with a straightedge across the joint: plane a bracket's top edge, or shim it, until the leaf lies level.`);
      else say(`Screw the folding leg ${pair ? 'brackets and their legs' : 'bracket and its leg'} under each leaf's far edge. With the top on ${on}, swing each leaf up, lock ${pair ? 'its legs' : 'its leg'}, and wind the ${pair ? 'levelling feet' : 'levelling foot'} until a straightedge lies flat across the joint.`);
      return;
    }
    say(`The leaf at ${where} (${show(leaf)}) is a panel of its own. Finish its outside edges as the top's; leave the two edges that meet at the joint square, with nothing on them.`);
    say(`Lay the top and its leaf face down, edge to edge and tight, their ends in line. Fit the ${dropLeafHinges(joint)} hinges across the joint, their knuckles on the joint line and standing up; let a hinge in flush where the two faces do not close tight. Lower the leaf by hand, never let it drop.`);
    if (support.kind === 'brackets') say(`With the top on ${on}, fit the two swing-out brackets under the part that stays, each hinged to ${hangs}, so that it swings out square under the leaf and in flat. Raise the leaf onto them and check it with a straightedge across the joint: plane a bracket's top edge, or shim it, until the leaf lies level.`);
    else say(`Screw the folding leg ${pair ? 'brackets and their legs' : 'bracket and its leg'} under the leaf's far edge. With the top on ${on}, swing the leaf up, lock ${pair ? 'its legs' : 'its leg'}, and wind the ${pair ? 'levelling feet' : 'levelling foot'} until a straightedge lies flat across the joint.`);
  };
  // Tables: the legs and aprons, then the top on its fasteners.
  if (project.context.kind === 'designedCabinet') {
    for (const frame of framesOf(project).filter((f) => wants(f.id, 'cases'))) {
      let layout: ReturnType<typeof frameLayout>;
      let fasteners = 0;
      try {
        layout = frameLayout(frame, project.context, project.materials);
        fasteners = frameFasteners(frame, project.context, project.materials);
      } catch {
        continue;
      }
      open(`Table: ${frame.name}`);
      if (layout.layers) say(`Glue up the four legs: ${layout.layers} strips each, face to face, the edges flush, clamped along their whole length. When dry, plane or saw each to ${show(layout.leg)} square and cut all four to length together.`);
      const inFrom = layout.setback > 0.5 ? `, ${show(layout.setback)} in from the legs' outside faces (a spacer that thick under the apron sets it)` : ', flush with the legs\' outside faces';
      if (frame.joint === 'dowels') {
        say(`Print the dowel jig for this table (the jigs page: the apron's thickness and its ${show(layout.setback)} setback). On each leg, on the two faces an apron meets: the jig's fence against the leg's outside face and its stop on the leg's top, drill through its holes ${show(FRAME_DOWELS.length / 2 + 2)} deep (a stop collar on the bit).`);
        say(`On each end of each apron: the same, with the jig's spacer between its fence and the apron's outside face and its stop on the apron's top edge.`);
        say('Glue the dowels into the aprons\' ends, then each end apron between a front leg and a back leg: two end frames, clamped across. Join them with the long aprons the same way on a flat surface, and rack it until its two diagonals are equal.');
      } else if (frame.joint === 'braces') {
        say('Screw a hanger bolt into the inside corner of each leg, square to the corner, at the height of the braces.');
        say(`Screw the corner braces to the ends of the aprons, stand each leg in its corner${inFrom}, the tops of the aprons flush with the tops of the legs, and draw each leg tight with its washer and nut.`);
      } else {
        say(`Glue and pocket-screw each end apron between a front leg and a back leg${inFrom}, its top flush with the tops of the legs: two end frames. Clamp across each joint while the screws go in, so that the apron does not creep.`);
        say('Join the two end frames with the front and the back aprons the same way, on a flat surface, with glue and pocket screws. Measure the two diagonals and rack it until they are equal before the glue sets.');
      }
      if (layout.shelf) say(`Fit the lower shelf between the legs before the last apron goes on, its top ${show(layout.shelf.up)} off the floor (a spacer under it sets it), each leg in its notch: glue, and a pocket screw up through its underside into each leg (Kreg jig, set for its thickness), or a screw through each leg into its edge, plugged.`);
      // A torsion box for a top is built first, flat; it has no edge to glue on.
      const box = frameTop(frame, project.context).torsion;
      if (box) {
        say(box.ribsBy === 'saw' ? 'The top is a torsion box. Lay out its long ribs on the bottom skin and cut the short ribs to fit between them, each in its cell.' : 'The top is a torsion box. Slot its ribs together into the egg-crate, the long ones slots up, the short ones slots down, and check it square.');
        say('On a flat surface: glue the rib grid to the bottom skin and the top skin to the grid, every rib edge glued. Brad a skin thicker than 1/8" to the ribs; glue a thinner one only. Weight it flat until the glue sets.');
      }
      const edge = box ? 'none' : frame.top.edge.kind;
      if (edge === 'strip') say('Glue the solid wood edge strips to the top, the front and the back ones first and the end ones between them, flush on top; plane or sand them flush when dry.');
      if (edge === 'banding') say('Band all four edges of the top.');
      say(`Let the ${fasteners} figure-8 fasteners into the top edges of the aprons, along each: a shallow recess with a Forstner bit, so that each lies flush, one loop over the apron and the other past its inside face. Screw each to its apron.`);
      say(`Lay the top face down on a blanket and the frame upside down on it, ${show(layout.over.ends)} in from its ends, ${show(layout.over.front)} from its front edge and ${show(layout.over.back)} from its back. Screw each fastener up into the top. ${box ? "Under a torsion box the screws hold only in its bottom skin: run a bead of construction adhesive along the aprons' top edges as well. The box does not move as a solid top does." : 'They swivel, so a solid top can swell and shrink without splitting.'}`);
      say('Turn it over onto its legs and check that it stands without rocking; plane a hair off the foot of a long leg if it does.');
      // Its leaf.
      const leaf = frameLeafOf(frame, project.context, project.materials);
      if (leaf && box) torsionLeafSteps(leaf.length, leaf.stays, 'its legs');
      else if (leaf) dropLeafSteps(`the table's ${leafSidesWords(leaf.edge, leaf.both)}`, leaf.length, leaf.joint, 'its legs', 'the apron under the joint', leaf.both);
    }
  }
  // A case on a leg frame: the frame is built like a table's, then the case is set on it.
  const legged = cabinetsOf(project).filter((c) => onLegs(c) && wants(c.id, 'cases'));
  for (const c of legged) {
    // Corner posts: the posts are part of the case, which is built round them.
    const posts = postsOf(c, project.materials);
    if (posts) {
      open(`Corner posts: ${c.name}`);
      say('Cut the four posts to length together, against one stop, so that they match. Mark each for its corner, and its two inside faces.');
      say(`Each side stands between a front post and a back post, ${show(POST_SETBACK)} in from their outside faces (a spacer that thick under the side sets it) and flush with their tops. Glue and pocket-screw its front end into the front post through the holes in its inside face. Fasten its back end to the back post with glue and screws through the post from behind, counterbored, about every 8": two ends, each a side between two posts. Check each is flat and square.`);
      say(`Join the two ends with ${c.noBottom ? "the case's stretchers" : c.caseTop === 'panel' ? "the case's bottom and its top" : "the case's bottom and its stretchers"} as for any case, then the rails. The top and the bottom ones stand upright between the front posts, flush with their faces and with the case's top and bottom, pocket-screwed into the posts from behind. Each rail between two drawers lies flat, its front edge flush with the posts' faces, pocket-screwed into them from underneath. ${show(posts.under)} of each post is left under the case as its leg.`);
      say(`Measure the two diagonals of the front and rack it until they are equal before the glue sets. At the back the case's own members run on between the back posts, as far as the back's thickness short of their rear faces: a back stretcher that stands on edge is between the posts, pocket-screwed into them from inside; what lies flat (the bottom, or the stretcher in its place) is notched round the two posts.${c.noBack ? '' : ' The back panel goes on last, from behind: between the back posts, its face in line with theirs, glued and bradded to every member behind it (the stretcher, the bottom, an upright).'}`);
      say(insetFrontsStep(show(posts.gap), 'the posts and the rails'));
      if ((c.layout.bays?.length ?? 1) > 1) say(`Between two bays three uprights stand in line, front to back: the mullion in the frame, one half-way back and one in the back itself, between the back stretcher and what is at the bottom, behind the back panel. Screw the tie under the front stretcher, from the case front to the back upright, and the middle upright up into it; fasten the back upright before the back goes on: through the back stretcher into it and on into the tie's end, and up into its foot from underneath. The back is bradded down it${c.toeKick.legs?.middle ? ', and the middle one runs down to the floor as a narrow leg, its foot level with the posts\'' : ''}. The slides beside them are screwed to the three. Neither is seen above the floor, and both are left bare.`);
      if (c.layout.rows.some((r) => (r.split ?? 1) > 1)) say('Between the two drawers of a split row stands one solid board on edge, from the face of the frame to the back, its front edge flush with the posts; in the top row it rises behind the top rail to the front stretcher, notched round the rail. Fasten it at both ends: at the front, glue and screw it to the rail under it and down into it through the front stretcher; at the back, in the top row, two screws into its end through the back stretcher, before the back goes on (in a lower row its end meets the back panel: two screws through the back). Square it to the front before the back screws go in. The slides beside it are screwed to it.');
      say('Stand it on its posts and check that it does not rock; plane a hair off the foot of a long one if it does.');
      continue;
    }
    open(`Leg frame: ${c.name}`);
    const middles = legFrameMiddles(boxOf(c, project.materials).box, project.materials).length;
    say(`Cut the ${middles ? 4 + 2 * middles : 'four'} legs to length together, against one stop, so that they match.`);
    say('Glue and pocket-screw each end apron between a front leg and a back leg, a quarter inch in from the legs\' outside faces and flush with their tops: two end frames.');
    if (middles) say(`The case is long, so it has legs in the middle too, where its weight comes down: make ${middles === 1 ? 'one more frame' : `${middles} more frames`} of a front leg, a back leg and the apron across between them, that apron centred on the legs.`);
    say(`Join ${middles ? 'the frames, in their order,' : 'them'} with the front and the back aprons the same way, on a flat surface${middles ? ', a straightedge along the legs\' fronts' : ''}, and rack the frame until its two diagonals are equal.`);
    say(`Lay ${c.name} on its top on a blanket and set the frame upside down on its bottom, the legs flush with the case's outside all round. Screw up through the pocket holes along the aprons' top edges into the bottom, with glue.`);
    say('Turn it over onto its legs with a helper and check that it stands without rocking.');
  }
  // Beside a closet tower: the cleats, the shelf on them, the rod under it.
  for (const c of cabinetsOf(project).filter((x) => wants(x.id, 'cases'))) {
    const spans = towerSpans(c, project.materials);
    if (!spans.length) continue;
    open(`Beside ${c.name}`);
    say(`Stand ${c.name} where it goes, plumb, and fasten it to the wall behind it.`);
    for (const s of spans) {
      const far = s.span.to === 'wall' ? 'the wall' : 'the next tower';
      if (!s.span.noShelf) {
        say(`To the ${s.side}: screw one cleat to the tower's side and one to ${far}, their tops level at ${show(s.span.up.mm - (project.materials.find((m) => m.id === c.materials.caseId)?.measuredThickness.mm ?? 0))} off the floor (the shelf's top will be ${show(s.span.up.mm)}); on a wall, into the studs. Lay the shelf on them and screw down into each.`);
        if (s.brackets) say(`To the ${s.side}: ${s.brackets === 1 ? 'a bracket' : `${s.brackets} brackets`} under the shelf, into a stud.`);
      }
      if (s.rod) say(`To the ${s.side}: screw the closed flange to the tower's side and the open one to ${far}, ${show(s.rod.y)} off the floor and ${show(s.rod.behind)} behind the tower's front edge; cut the rod to fit between them and drop it in.`);
    }
  }
  // A power hub: fitted once its cabinet stands, before the table goes on.
  for (const c of cabinetsOf(project).filter((x) => wants(x.id, 'cases'))) {
    const hub = hubOf(c, project.materials);
    if (!hub) continue;
    open(`Power hub: ${c.name}`);
    say('The hub is 120 V house wiring: this is one way to build it, not an electrical design. Check it against your local code or have an electrician look at it, and wire nothing with the cord plugged in.');
    say(`Before the ${hub.side} side, the switch panel and the access panel are cut, try each opening's size against the box, the paddle switch and the dust ports in hand, and change the sizes if they differ. The bit leaves its radius in the corners: ease them with a file where a box binds.`);
    say("The back of this cabinet stops at the shelf under the hub: fasten it as any back. Over it is the access panel, the only part that comes off: it goes in last, between the sides, standing on the shelf under the back stretcher (which lies flat under the top here), against the two back cleats, with screws only. Its face is level with the back below it.");
    say(`Fit the three boxes into the ${hub.side} side from inside, their fronts flush with its outside face, and the dust port through its hole with its lock nut inside. Drill for the ground post below the port and fit it.`);
    say("Glue and screw the four hub cleats to the insides of the sides, in the hub's space: two at the front, set back from the case front by the thickness of the switch panel, and two at the back, set forward so that the access panel, against them, is level with the back below: try it dry. Fit the paddle switch and the three-gang box to the switch panel.");
    say("Run the cables inside the space, stapled to the case: the inlet to the paddle switch and back, the toggles to the router and vac outlet, the inlet to the accessory outlet. Leave enough at the switch panel to draw it a hand's width forward. Wire the switches, the inlet and the two outlets, break the tab between the router and vac sockets, and fit the plates.");
    say('Screw the switch panel to the front cleats from the front, with no glue, so that it comes off again.');
    say("Fit the second dust port through the access panel. Join the two ports inside with the short hose, pushed onto the back port's stub last, and screw the access panel on. The vac's hose plugs into it from behind. Ground the machine's hose at the post, and clip the router's and the controller's cords under the table's edge by the port.");
  }
  // Tops (milestone 7): once the cabinets stand, the tops go on them.
  const pieces = (project.context.kind === 'designedCabinet' ? topPieces(project, project.materials) : []).filter((p) => p.cabinetIds.some((id) => wants(id, 'tops')));
  // A bought top with its sink in it is a top too, with no piece of its own.
  const integrated = cabinetsOf(project).filter((c) => c.sink?.mount === 'integrated' && c.form === 'base' && wants(c.id, 'tops'));
  if ((pieces.length || integrated.length) && project.context.kind === 'designedCabinet') {
    const tops = topSettingsOf(project.context);
    open('Tops');
    // The slabs made here, by their own settings (one top may differ from Setup's).
    const slab = pieces.find((p) => p.settings.kind === 'made' && !p.own)?.settings ?? tops;
    if (pieces.some((p) => p.settings.kind === 'made' && (!p.own || tops.kind === 'made'))) {
      // A piece's own top has its own edge step below: these two are for the tops over runs and cabinets.
      const slabs = pieces.some((p) => p.settings.kind === 'made' && !p.own);
      if (slabs && slab.edge.kind === 'strip') say('Glue the solid wood edge strips to the tops\' front and open ends, flush on top; plane or sand them flush when dry.');
      if (slabs && slab.edge.kind === 'banding') say('Band the tops\' front and open ends.');
      if (slab.layers === 2) say('Glue and screw the build-up strips under each top, round its edges and across it.');
      if (pieces.some((p) => p.ends.right === 'joint')) say('Join the top pieces over their cabinets: glue in the joint, pocket screws from underneath, faces flush.');
      const topFinish = finishesOf(project, { finishes }).tops;
      if (topFinish) say(`Finish the tops' top face and edges: ${topFinish.name}, ${coatsWords(topFinish, clearCoatOf(project, { finishes }))}. Their underside stays bare.`);
    }
    // A piece's own top is made here whatever Setup's tops are, with its own edge on all four sides.
    const ownEdges = new Set(pieces.filter((x) => x.own && !x.own.torsion).map((x) => x.own!.edge.kind));
    if (ownEdges.has('strip')) say("A top of a piece's own: glue its solid wood edge strip on all four sides, flush on top; plane or sand it flush when dry.");
    if (ownEdges.has('banding')) say("A top of a piece's own: band all four of its edges.");
    if (pieces.some((x) => x.own)) say("A top of a piece's own is fastened from inside its case, up through the top panel or the stretchers.");
    // A torsion table is built on a flat surface, before it goes on the cabinets.
    for (const p of pieces.filter((x) => x.torsion)) {
      const t = p.torsion!;
      say(t.ribsBy === 'saw' ? 'Lay out the long ribs on the bottom skin and cut the short ribs to fit between them, each in its cell.' : 'Slot the ribs together into the egg-crate, the long ones slots up, the short ones slots down, and check it square.');
      say('On a flat surface: glue the rib grid to the bottom skin and the top skin to the grid, every rib edge glued. Brad a skin thicker than 1/8" to the ribs; glue a thinner one only. Weight it flat until the glue sets.');
      // A folding leaf: two boxes, built together so they come out one height, then hinged, pinned and latched.
      if (p.leaf) torsionLeafSteps(p.leaf.length, (p.leaf.edge === 'back' ? p.zFront - p.zBack : p.x1 - p.x0) - p.leaf.length, 'its cabinets');
    }
    // A slab's drop leaf: hinged under a square joint, on brackets or on legs.
    for (const p of pieces.filter((x) => x.leaf && x.settings.kind === 'made')) dropLeafSteps(`a top's ${leafEdgeWords(p.leaf!.edge)}`, p.leaf!.length, p.leaf!.edge === 'back' ? p.x1 - p.x0 : p.zFront - p.zBack, 'its cabinets', "the cabinet's side or to a block screwed under the top");
    // A side for stools on brackets: they go on before the top does.
    for (const p of pieces.filter((x) => seatingBrackets(x) > 0))
      say(`Before the island's top goes on: screw the ${seatingBrackets(p)} support brackets to the cabinets at the ${leafEdgeWords(p.seating!.edge)}, their tops level with the cabinets' tops, one about every ${show(SEATING.every)}. The top's side for stools, ${show(p.seating!.overhang)} past the cabinets, rests on them.`);
    // A sink's opening: cut with the top on the CNC, or by hand in a top that is bought or sawn.
    for (const cut of sinkCuts(project, pieces).filter((c) => c.sink.mount !== 'integrated')) {
      const sink = cut.sink;
      const name = cut.name.toLowerCase();
      const size = `${show(cut.x1 - cut.x0)} × ${show(cut.zFront - cut.zBack)}`;
      const opening = sink.mount === 'vessel' ? `the drain hole for the ${name} (${show(SINK.drain)} across)` : `the opening${cut.outlines.length > 1 ? 's' : ''} for the ${name} (${size}${cut.outlines.length > 1 ? ', one for each bowl' : ''})`;
      const kind = cut.piece.settings.kind;
      const onCnc = kind === 'made' && (plan.parts.find((x) => x.partId === cut.piece.id)?.cutOut ?? 'cnc') === 'cnc';
      const farmhouse = cut.notch && cabinetsOf(project).find((c) => c.id === cut.cabinetId);
      if (farmhouse) {
        // Before the top: the sink stands on its platform, and the top is notched round it.
        const notch = `${show(cut.notch!.x1 - cut.notch!.x0)} wide and ${show(cut.piece.zFront - cut.notch!.zBack)} back from the front edge`;
        say(`Before the top goes on: glue and screw the sink platform's cleats to the sides, and the platform onto them (and its rails under it, where there are some). Set ${farmhouseWords(farmhouse, show)}, on the platform, level, its top edge level with where the top's surface will be: shim it there. Full of water it weighs about ${FARMHOUSE_FRAME.weight}.`);
        if (kind === 'measured') say(`Give the supplier the notch round the ${name}: ${notch}, its edge polished.`);
        else if (onCnc) say(`The CNC cuts the notch round the ${name} (${notch}) with the top's outline: check it against the sink as it stands before cutting.`);
        else say(`Cut the notch round the ${name} by hand: ${notch}, marked from the sink as it stands.`);
      } else if (kind === 'measured') say(`Give the supplier the ${name}'s own template for its opening (about ${size})${sink.mount === 'undermount' ? ', and say it is an undermount: the edge is polished' : ''}.`);
      else if (onCnc) say(`The CNC cuts ${opening} with its top: check that size against the sink's own template before cutting. Seal the opening's raw edges.`);
      else if (sink.mount === 'vessel') say(`Drill ${opening} by hand with a hole saw, where the vessel's drain stands.`);
      else say(`Cut the opening${cut.outlines.length > 1 ? 's' : ''} for the ${name} by hand: ${size}${cut.outlines.length > 1 ? ' over both, one for each bowl' : ''}, centred front to back, marked from the sink's own template. Drill the corners, cut between them with a jigsaw from the top face, and support the waste so it does not tear out as it drops.`);
      // Its faucet's holes through the top: with the opening on the CNC, else drilled by hand with a hole saw.
      if (cut.holes.length) {
        const holes = `${cut.holes.length === 1 ? 'the faucet hole' : `the ${cut.holes.length} faucet holes, the outer two ${show(faucetSpread(sink))} apart centre to centre, each`} ${show(SINK.faucetHole)} across, centred behind the ${name}`;
        if (kind === 'measured') say(`Give the supplier ${holes}, to be cut with the opening.`);
        else if (onCnc) say(`The CNC cuts ${holes}: check them against the faucet's own sheet before cutting.`);
        else say(`Drill ${holes}, with a hole saw from the top face, marked from the faucet's own sheet.`);
      }
      if (sink.mount === 'dropIn') say(`Set the ${name} in a bead of sealant and clamp it from below with its clips.`);
      else if (sink.mount === 'undermount') say(`Before the top goes on: turn it over, set the ${name} under its opening${cut.outlines.length > 1 ? 's' : ''} in a bead of silicone, centred on them, and fix it with its clips. Ease and seal the opening's edge, which shows.`);
      else if (sink.mount === 'vessel') say(`Set the ${name} on its drain over the hole, in a bead of silicone, and tighten the drain from below.`);
      else if (farmhouse) say(`Set the top round the ${name}, and seal the joint between them with silicone.`);
    }
    // A bought top with its sink in it: set on the cabinet in place of a top.
    for (const cabinet of integrated) {
      say(`Set the vanity top with its sink on ${cabinet.name || 'the cabinet'} in a bead of silicone on the case's top edges, its back against the wall, and seal it to the wall.`);
    }
    const kinds = new Set(pieces.map((p) => p.settings.kind));
    if (kinds.has('bought')) say('Cut each laminate top to length with a fine blade, the good face down on a circular/track saw; cut a mitre on a jig and draw it tight with the connector bolts. Fit the end caps.');
    if (kinds.has('measured')) say('Have the ordered tops set on the cabinets by their supplier, or set them as the supplier says.');
    if ([...kinds].some((k) => k !== 'measured')) say(`Set the tops on the cabinets${pieces.some((p) => p.settings.kind === 'made' && backAgainstWall(project, p)) ? ', their backs to the wall,' : ''} and fasten them from below: screws up through the stretchers, or figure-8 fasteners on a solid wood top.`);
    if (pieces.some((p) => p.settings.kind === 'made' && p.settings.backsplash.on && backAgainstWall(project, p))) say('Glue the backsplash down on each top against the wall, and the side splashes at the wall ends; caulk them to the top and to the wall.');
  }
  return sections.filter((section) => section.steps.length > 0);
}

/** The sections with only the steps of one phase, and only the sections that have any. */
export function checklistFor(sections: ChecklistSection[], phase: ChecklistStep['phase']): ChecklistSection[] {
  return sections.map((s) => ({ ...s, steps: s.steps.filter((step) => step.phase === phase) })).filter((s) => s.steps.length > 0);
}
