# Shop Foreman

The app's name is **Shop Foreman**, tagline "From your design to your shop floor." The package is
`shop-foreman`; the project file's `format` is `shop-foreman-project` and its extension `.foreman.json`.
The icon is `public/favicon.svg` (a carpenter's square with a check in its corner), in the tab and the
header. Descriptions do not lead with kitchens: "cabinets, doors and shop furniture".

Browser-only woodworking app: design a piece (cabinets, doors, drawers, furniture, kitchens), plan how every
part gets made with the tools in the user's shop, and output G-code, printable jigs and build checklists.

Ask before making product decisions.

## Stack

- Vue 3 + TypeScript + Vite; Vuetify with a dark theme (may be swapped later)
- Three.js for the 3D view
- manifold-3d (WebAssembly) for solids and its 2D (Clipper2-based) side for outlines
- Web Workers for toolpath generation and solid building
- cnc-gcode-tools (MIT) for G-code preview, copied in unmodified under `src/lib/cnc-gcode-tools/`
- IndexedDB for storage; projects export/import as files
- No server, no .NET, no FluidNC WASM simulation (that lives in lr4-sandbox, GPL)

## Core rules

1. Design is what it looks like and how it's joined; Plan is how it gets made.
   Plan never changes a Design value. Joinery is Design.
2. Every length is stored in mm, with the unit its field shows it in (`Length` is `{ mm, unit }`, `unit`
   `in` or `mm`; a plain number of mm keeps its unit in `shownIn` on the thing that owns it). Every length
   field is a number with a unit toggle that converts (`LengthField`, `MmField`): inches as fractions to
   1/32" with an "about" mark when not exact, a bare number in the unit shown, a typed unit (`19mm`,
   `2' 6"`) or a fraction switching the toggle. Where there is no field the unit goes by kind of thing,
   not by screen, set on the Shop profile (`UnitPreferences`: sizes and saw lists in inches, CNC and
   tooling in mm to start). Feeds are stored in mm/min and shown in mm/s, mm/min or in/min, chip loads in
   mm or inches a tooth: each one choice for the shop. A bit sold by a diameter has a nominal one that
   names it and a measured one that cuts.
3. Part sizes, feature positions and toolpaths are derived from the design and
   libraries, never stored as edited values.
4. Every feature/operation belongs to a face: A, B or edge. Planner avoids flips
   first, then uses a pin-registered sheet flip.
5. Plan only offers methods and bits that can make the feature as designed.
6. Tools are generic (type, offset, settings); milestone 1 supports router bits only.
7. Hardware (hinges) is described by specs; a generic entry must always exist.
8. Materials have nominal and measured thickness; Design uses measured.
9. Units in G-code are mm (G21). Files use the `.gcode` extension.

## FluidNC post

- No M3/M5: router is switched by hand. Pauses are `M0 (MSG, ...)` on one line.
- Each operation starts with a status line for pendants: `(MSG, 3/5 T2 Panel pocket - ~6 min)`.
- The machine is homed before a job, and Z homes to the top. The sheet is
  not necessarily at machine 0,0: the bit is jogged to the stock's front-left corner
  and the first setup starts with `G10 L20 P0 X0 Y0`. Later setups keep X0 Y0.
- At each setup start and every bit change: `G4 P0` then a bare `$HZ` (FluidNC 4.1
  rejects `$HZ` while moves are queued; `$` lines carry no comment), move to the
  probe spot, one pause "Router OFF. Fit/Change to ... and attach the probe",
  `G38.2 Z-80 F180 P0.5` (0.5 mm plate; FluidNC sets work Z from the P word, so no
  `G10 L20` for Z), an optional second slower touch (off when the profile's slow
  feed is 0), lift, one pause "Remove probe. Router ON, dial N". Z homes again at
  the end. Probe travel is the machine profile's (80 mm to start).
- The router belongs to the machine; bits carry an RPM. The dial setting in the
  messages is the nearest half step on that router's dial.
- Every line stays within FluidNC's 127 bytes.
- Optional settings block (machine profile, off by default): FluidNC parameters
  such as `#<t1_feed>`, `#<clear_z>`, `#<plate>` defined once at the top and used
  throughout.
- A hole barely bigger than the bit (the flip pin holes with a 1/4" bit) is peck
  drilled; a smaller bit helixes it. The Plan row offers both.
- Probe spot: near the stock's front-left corner on a 20 mm square of uncut top
  surface; never over removed material.
- Flip pins: 1/4" steel dowels, holes +0.1 mm, through the blank and 6 mm into
  the spoilboard, never deeper than the bit's cutting length (the rest is drilled
  by hand, and the plan says how much). The holes land wherever the job was zeroed,
  so they add up over jobs: fill them or resurface. Fixed pin sockets with a jig to
  set the stock's zero are a later idea, not built.
- Write `(Stock: ...)` and `(ToolDef ...)` comments in cnc-gcode-tools' format.
- Tabs on by default for cutouts with up-cut bits, as high as a share of the stock's thickness (`tabs.heightPercent`,
  40%, 30 to 50% being usual; `holdingTabHeight`). **Holding tabs are placed by the app, never by hand, and never near a corner**
  (all of it is `tabCenters`, `src/cam/cuts.ts`): a loop is split at its corners into runs (a
  straight side, or a curve of short flats: a round shelf, a rounded leaf), and a tab stands on a run only where the
  whole tab is the machine's `tabs.fromCorner` (25 mm) clear of both ends. `tabs.method`: `spread`, shown as "Smart" (the default: the part as a whole, a tab near each corner and one a corner, straight sides before curves
  and long before short; two on a side up to twice "Spacing" (`tabs.maxSpacing`, 400 mm) apart; a side left with
  none gets one only when longer than "Spacing"; a narrow part's two long sides are staggered; an edge with a
  joint's tabs is one side and is held on the end of a joint tab, `jointedSides`; the stock's thickness does not
  come into it) or `perSide` (evenly along every run). `scripts/print-tabs.ts` prints the examples' tabs. A part with no run long enough is held in the middle of its two longest. A part with a
  joint's tabs (`Part.tabbed`) takes none on the shoulders beside them; by either method an edge with them is held on a joint tab's end. The Machines card shows both methods on the
  same seven example parts (`TabMethodExamples.vue`, `src/cam/tabExamples.ts`: the rule itself, drawn). A joint's slot
  through a part gets none: it is cleared whole, like a pocket.
- A cut through the stock (a cutout, a hole through a part) goes past its bottom into the spoilboard by the
  machine's `throughExtra` (0.5 mm to start, Shop profile, Machines, "Heights and speeds";
  `throughDepth`, `src/plan/tools.ts`): on the last pass only, never deeper than the bit's cutting length, the tabs
  as high above the stock's bottom as before.
- Tiling (milestone 4): a blank longer than the cutting area along Y, on a machine whose
  profile has `tiling.maxLength`, is cut in two setups on one face. Setup 1 drills two
  pairs of pin holes, a slide's length apart, and ends with a pause to slide the sheet
  forward onto pins; setup 2 keeps X0 Y0 and cuts the rest. X is a hard limit.

## Testing

- `npm test` runs Vitest: unit parsing, overlay/door math, hinge placement,
  setup planning, toolpaths, post output.
- Every generated G-code file must parse in cnc-gcode-tools.
- Golden files for the vanity job live in `tests/golden/`; a diff fails the test
  until reviewed. Never update golden files without saying so.
- The app starts with one machine, a generic CNC (`GENERIC_CNC`, `src/libraries/machines.ts`). The tests written
  round a small machine that tiles a long part, and the golden files, run on machines of the tests' own
  (`tests/lowRider.ts`: `lowRiderShop`, `lowRiderJobShop`, `useLowRider`), which the app does not come with.
- Post rules check: no M3/M5, probe routine after each bit change, no Z below
  stock bottom except pin holes and a through cut's `throughExtra`.

## Conventions

- Commit in small steps with clear messages. `main` is what is deployed.
- Keep machine-specific values in the machine profile, never hard-coded.
- Mark placeholder values (feeds, thickness, safe height) as "tune me" in data
  and UI.
- Comments say what the code does and why. No names, dates, quotes from conversations or pointers to
  planning notes in the code, the tests or commit messages.
- No backwards compatibility before 1.0, and one version number: the app's, in `package.json`. Saved projects
  and shop profiles carry its first two numbers (`SAVE_VERSION`, `src/model/versions.ts`) and one of another is
  refused with a plain message; there is no upgrade code. **A change to a stored structure bumps the middle
  number, and nothing else does**; the last number is for everything else. G-code and project files say which
  version wrote them.
- Every length is typed and shown through `LengthField` or `MmField`; never name a component's prop `style`
  or `class`.
- Related projects (don't merge code across them without asking):
  cnc-gcode-tools (viewer), lr4-sandbox (machine build + FluidNC sim, GPL),
  FluidTouch (pendant).
