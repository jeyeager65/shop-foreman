# cnc-gcode-tools (vendored)

Unmodified copies of `src/js/parser.js`, `gcode-expander.js`, `animator.js` and `stock-sim.js` from
[cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools), MIT (see LICENSE). `SOURCE.json` pins the
version, the commit they were copied from and each file's SHA-256. Same set of files lr4-sandbox vendors.

Don't edit them here. Fix bugs in cnc-gcode-tools, commit there, then copy that commit's files again and
update `SOURCE.json`. `tests/vendored.test.ts` fails if a file's hash doesn't match.

The files are plain scripts that define globals (`GCodeParser`, `GCodeExpander`, `StockSimulator`, ...),
not ES modules. `src/gcode/gcodeTools.ts` loads them.
