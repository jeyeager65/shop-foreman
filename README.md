# Shop Foreman

*From your design to your shop floor.*

> [!WARNING]
> **Shop Foreman is not ready for use.** It is an early, experimental project, published so its progress can be followed. Do not build from it yet.
>
> - **Nothing it makes has been proven.** No G-code from this app has cut wood, and no cabinet has been built from its cut lists. Dimensions, joinery and hardware positions may be wrong.
> - **Feeds, depths and many sizes are placeholders**, marked "tune me". They are not recommendations for your machine.
> - **Significant changes are still being made.** Features, screens and the way a piece is designed change often, and things that work today may be removed or reworked.
> - **Your saved work will be lost.** There is no backward compatibility yet: when the app's stored format changes, projects and shop profiles saved by an earlier version are refused and cannot be opened. Exported project files stop working the same way.
> - **A CNC router can injure you and wreck your machine and stock.** If you run a file from this app anyway, read it first, preview it, and air-cut above the stock. You do so entirely at your own risk; the software comes with no warranty.

Design cabinets, doors and shop furniture in your browser, then let Shop Foreman plan the job around the tools you actually have. It works out every part, decides what goes on the CNC and what goes on the saw, and gives you a buying list, cut lists, G-code, printable jigs and a build checklist.

It runs at **[shopforeman.yeager.dev](https://shopforeman.yeager.dev)**, built from `main`. There is no server and no account. Your projects stay in your browser, under that address, and can be exported as files.

The version is shown at the foot of every page. It is 0.x until the app has been proven on a machine and saved work is kept from one version to the next.

## What it does

A project goes through five steps.

- **Setup** holds what the project's pieces share: the construction style, joints, fronts, hardware, materials and finish. It starts from a preset.
- **Design** is what each piece looks like and how it is joined. A 3D view builds every part as a real solid, with sliders to open the doors, pull out the drawers and explode the assembly.
- **Plan** is how it gets made. It nests the CNC parts onto blanks, picks a method and bits for every cut, and sends the rest to the saw. Plan never changes a Design value.
- **Cut** is the output for the machines: one G-code file per blank and setup with a preview, the saw cut list, and the 3D-printable jigs.
- **Build** is the buying list, the hardware and finish lists, and an assembly checklist.

What you can design:

- **Cabinets**: base, wall and tall; face frame, frameless or inset; doors, drawers or both, in up to six bays; blind, diagonal and L-shaped corner cabinets; runs along a wall and islands.
- **Rooms**: a rectangular room with cabinets placed on its walls, appliances standing in their gaps, and countertops made here, bought, or measured for stone.
- **New fronts for cabinets that are already there**, sized from measured openings.
- **Furniture**: bookcases, dressers, night stands, desks, closet towers, TV stands, and tables on legs and aprons.
- **Shop furniture**: cabinets on casters, and a torsion-box table with an optional folding leaf.
- **Jigs with no project**: drilling jigs, a pocket-hole guide, drawer inserts and handles.

Joints include pocket screws, dados, screws through the sides and tab-and-slot. Fronts can be shaker or slab, with patterns cut into them. Lengths are stored in millimetres and can be typed as `3/4`, `1-1/2"`, `2' 6"` or `19mm`.

The Samples page in the app opens a gallery of finished examples, each as a fresh copy to explore.

## Machines

The app starts with one machine profile: a generic CNC router that takes a full 49" × 97" sheet, with a Makita trim router, running FluidNC. Every machine-specific value lives in the profile. Edit it to describe your own machine, or copy it for a second one, on the Shop profile page, along with the bits, their feeds and speeds, the saws and the hardware.

## The G-code

The post writes FluidNC G-code in millimetres, as `.gcode` files.

- The router is switched by hand, so there is no `M3` or `M5`. Pauses are `M0 (MSG, ...)` lines that tell you what to do.
- Each file zeroes X and Y at the stock's front-left corner and probes Z with a touch plate at the start and after every bit change.
- A blank with work on both faces is flipped onto 1/4" steel pins, whose holes the first setup drills.
- Cutouts leave holding tabs by default, placed by the app away from corners.

Every generated file is parsed by [cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) in the tests, and the files for one reference job are checked against reviewed golden copies.

## Running it

You need [Node.js](https://nodejs.org/) 24 or later.

```sh
npm install
npm run dev
```

Open the address Vite prints. Adding `?sample` to it creates a small door project; `?sample=cabinet` opens a frameless cabinet and `?sample=kitchen` a kitchen.

| Command | What it does |
| --- | --- |
| `npm test` | Runs the tests (Vitest) |
| `npm run typecheck` | Type-checks the code |
| `npm run build` | Type-checks and builds to `dist/` |

On Windows, run the tests from PowerShell: Vitest started from Git Bash reports "no tests".

## Built with

- Vue 3, TypeScript and Vite, with Vuetify for the interface
- Three.js for the 3D views
- [manifold-3d](https://github.com/elalish/manifold) (WebAssembly) for solids and 2D outlines
- Web Workers for toolpaths and solid building
- [cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) (MIT) for the G-code preview, copied in unmodified under `src/lib/cnc-gcode-tools/`

## Where things are

| Path | What is there |
| --- | --- |
| `src/model/` | The stored structures: projects, the shop profile, parts |
| `src/design/` | Parts and their features, derived from the design |
| `src/plan/` | Methods, bits, blanks, nesting and setups |
| `src/cam/` | Toolpaths and the FluidNC post |
| `src/job/` | The whole job: files, checklist and lists |
| `src/jigs/` | The printed jigs and the things made with no project |
| `src/libraries/` | The starter shop profile: machines, bits, materials, hardware, saws |
| `src/samples/` | The starters, presets and sample projects |
| `src/views/`, `src/components/` | The screens |
| `tests/` | Tests, with golden G-code in `tests/golden/` |

`CLAUDE.md` holds the project's rules: the core design rules, the G-code conventions and how it is tested.

## What is not done

- Nothing has been run on a machine, and many of the jigs have not been printed.
- The hardware library is small: a few hinges, two drawer slides, two shelf pins and some casters.
- Rail-and-stile doors are not built, and FluidNC is the only controller the G-code is written for.
- Saved projects from an earlier build may not open in a later one until version 1.0.

## How it was made

The code was written by [Claude Code](https://claude.com/claude-code) under Jason Yeager's direction.

## License

[MIT](LICENSE). The copied cnc-gcode-tools files keep their own MIT license. The name "Shop Foreman" and its icon are not covered by the license: a fork should use its own.
