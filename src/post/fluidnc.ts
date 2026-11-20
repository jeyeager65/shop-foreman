/**
 * FluidNC post for machines whose router is switched by hand.
 *
 * - No M3/M5. Operator pauses are `M0 (MSG, ...)` on one line. Each operation starts
 *   with a status message, `(MSG, 3/5 T2 Panel pocket - ~6 min)`, for pendants.
 * - The first setup starts with `G10 L20 P0 X0 Y0`: the bit is jogged to the stock's
 *   front-left corner and that becomes X0 Y0. Later setups keep it.
 * - Each bit load (setup start and every bit change): home Z, which is
 *   all the way up, go to the probe spot, one pause to fit the bit and attach the
 *   probe, probe with `P<plate thickness>` (which sets Z; a second, slower touch
 *   follows unless the profile's slow feed is 0), lift, one pause to remove the
 *   probe and switch the router on. Z is homed again at the end.
 *   `G4 P0` goes before each `$HZ`: FluidNC 4.1 rejects `$HZ` while moves are still
 *   queued, and a `$` line must be bare (no comment).
 * - `(Stock: ...)` and `(ToolDef N: ...)` header comments in cnc-gcode-tools' format.
 *   Each bit load carries a bare `T<N>` (no M6), which only sets the tool number, so
 *   previews know which ToolDef is cutting.
 * - Optional settings block: FluidNC local parameters (`#<t1_feed>`, `#<clear_z>`,
 *   `#<plate>`, ...) at the top of the file, used throughout, so a hand edit of one
 *   number changes every line that uses it.
 * - Every line is within FluidNC's 127-byte limit; output is plain ASCII, mm (G21),
 *   absolute (G90).
 */
import type { Id, MachineProfile, Mm, Post, Project, SetupProgram, Tool } from '@/model';
import { bitType } from '@/libraries';
import { dialFor, findTool, toolSettings } from '@/plan';
import { versionWords } from '@/version';

/** FluidNC rejects a longer line, comments included ("Line too long", and the job stops). */
export const MAX_LINE = 127;
/** How much further than the lift the slow probe may travel. */
const SLOW_PROBE_EXTRA: Mm = 3;

/** Up to 3 decimals, no trailing zeros, never "-0". */
export function num(value: number): string {
  const text = String(Number(value.toFixed(3)));
  return text === '-0' ? '0' : text;
}

/** Text safe inside a ( ) comment: ASCII, no parentheses. */
export function plain(text: string): string {
  return text
    .replace(/°/g, ' deg')
    .replace(/[()]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/**
 * One output line as the lines to write, each within MAX_LINE. A message is cut
 * short (it must stay one message); another comment wraps onto more comment lines;
 * code that is too long is an error, never cut.
 */
export function fitLine(line: string): string[] {
  if (line.length <= MAX_LINE) return [line];
  const open = line.indexOf('(');
  if (open < 0 || !line.endsWith(')')) throw new Error(`G-code line over FluidNC's ${MAX_LINE} bytes: ${line}`);
  const code = line.slice(0, open);
  const inner = line.slice(open + 1, -1);
  const room = MAX_LINE - 2 - code.length;
  if (code && !inner.startsWith('MSG')) throw new Error(`G-code line over FluidNC's ${MAX_LINE} bytes: ${line}`);
  if (inner.startsWith('MSG')) {
    let cut = '';
    for (const word of inner.split(' ')) {
      const next = cut ? `${cut} ${word}` : word;
      if (next.length + 3 > room) break;
      cut = next;
    }
    return [`${code}(${cut || inner.slice(0, room - 3)}...)`];
  }
  const pieces: string[] = [];
  let current = '';
  for (let word of inner.split(' ')) {
    while (word.length > room) {
      if (current) pieces.push(current);
      current = '';
      pieces.push(word.slice(0, room));
      word = word.slice(room);
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > room && current) {
      pieces.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces.map((p) => `(${p})`);
}

/**
 * A bit as cnc-gcode-tools reads it, to draw it and carve the stock with its shape: one line for
 * each of the seven kinds. NAME comes last and is cut short when the line would pass 127 bytes.
 */
export function toolDef(n: number, tool: Tool): string {
  const s = tool.shape;
  const len = (length: { mm: number } | null) => (length ? ` LEN=${num(length.mm)}` : '');
  let fields: string;
  switch (s.kind) {
    case 'endMill':
    case 'ballNose':
      fields = `D=${num(s.diameter.mm)} FLUTES=${s.flutes}${len(s.cuttingLength)}`;
      break;
    case 'bullNose':
      fields = `D=${num(s.diameter.mm)} CR=${num(s.cornerRadius.mm)} FLUTES=${s.flutes}${len(s.cuttingLength)}`;
      break;
    case 'vBit':
    case 'chamfer':
      fields = `D=${num(s.maxDiameter.mm)} ANGLE=${num(s.angleDeg)} TIP=${num(s.tipDiameter?.mm ?? 0)}${s.flutes ? ` FLUTES=${s.flutes}` : ''} LEN=${num(s.maxDepth)}`;
      break;
    case 'taperBall':
      fields = `D=${num(s.maxDiameter.mm)} ANGLE=${num(s.angleDeg)} TIP=${num(s.ballDiameter.mm)} FLUTES=${s.flutes}${len(s.cuttingLength)}`;
      break;
    case 'roundover':
      fields = `D=${num(s.diameter.mm)} CR=${num(s.radius.mm)} TIP=${num(s.tipDiameter.mm)}${s.flutes ? ` FLUTES=${s.flutes}` : ''}`;
      break;
  }
  if (tool.overallLength) fields += ` OAL=${num(tool.overallLength.mm)}`;
  const head = `(ToolDef ${n}: SHAPE=${bitType(s.kind).toolDefShape} ${fields} NAME=`;
  return `${head}${plain(tool.name).slice(0, MAX_LINE - head.length - 1).trimEnd()})`;
}

export interface PostContext {
  /** Only its name is written, in the file's title. */
  project: Pick<Project, 'name'>;
}

export function writeFluidNC(program: SetupProgram, machine: MachineProfile, tools: Tool[], ctx: PostContext): string {
  if (machine.routerControl !== 'manual') throw new Error('This post only supports a hand-switched router.');
  const { setup, stock } = program;
  const materialId = program.materialId;
  const number = (id: Id) => program.toolIds.indexOf(id) + 1;
  const settings = (tool: Tool) => toolSettings(tool, materialId);
  /** A pause with its message on the same line, as pendants expect. */
  const pause = (message: string) => `M0 (MSG, ${message})`;
  const minutes = (seconds: number) => (seconds < 60 ? '<1 min' : `~${Math.round(seconds / 60)} min`);
  const opCount = program.steps.filter((s) => s.kind === 'operation').length;
  let opIndex = 0;
  const { blank } = program;
  const title = `${blank.count > 1 ? `Blank ${blank.index} of ${blank.count}, setup` : 'Setup'} ${setup.index} of ${blank.setupCount}: ${program.faces.summary}`;
  const homeZ = machine.homeZForBitChange ?? false;
  const params = machine.postOptions?.parameters ?? false;
  const p = machine.probe;
  const spot = setup.probeSpot.at;
  const twoTouch = p.slowFeed > 0;

  // With the settings block on, these are parameter names; otherwise plain numbers.
  const v = (name: string, value: number) => (params ? `#<${name}>` : num(value));
  const clearZ = v('clear_z', machine.safeHeight);
  /** F word for a feed: the bit's parameter when the value is its cutting or plunge feed. */
  const feeds = new Map<Id, { feed: number; plunge: number }>();
  for (const id of program.toolIds) {
    const s = settings(findTool(tools, id));
    feeds.set(id, { feed: s.feed, plunge: Math.min(s.plungeFeed, machine.maxPlungeFeed) });
  }
  const feedWord = (toolId: Id | undefined, feed: number) => {
    const f = toolId ? feeds.get(toolId) : undefined;
    if (params && f && feed === f.feed) return `#<t${number(toolId!)}_feed>`;
    if (params && f && feed === f.plunge) return `#<t${number(toolId!)}_plunge>`;
    return num(feed);
  };

  const out: string[] = [
    `(${plain(program.fileName)})`,
    `(${plain(ctx.project.name)} - ${title})`,
    // Parts lying different ways up: one line for each face.
    ...(program.faces.mixed ? program.faces.groups.map((g) => `(${plain(`${g.up}: ${g.parts.join(', ')}`).slice(0, 120)})`) : []),
    // Which version of the app wrote the file.
    `(Shop Foreman ${versionWords()})`,
    `(${plain(machine.name)} - X0 Y0 at the front-left corner of the stock, Z0 at the top of the stock)`,
    '(CNCSIM 1 UNITS=mm)',
    `(Stock: XMIN=0 XMAX=${num(stock.x)} YMIN=0 YMAX=${num(stock.y)} ZMIN=${num(-stock.z)} ZMAX=0)`,
    ...program.toolIds.map((id, i) => toolDef(i + 1, findTool(tools, id))),
    'G21 G90 G17 G94',
  ];

  if (params) {
    // FluidNC local parameters: plain values only, so the body reads F#<t1_feed>, G0 Z#<clear_z>.
    const rate = (mmPerMin: number) => `${num(mmPerMin)} mm/min = ${num(mmPerMin / 60)} mm/s`;
    out.push('(===== Settings - edit here =====)', '(Feeds, mm/min)');
    program.toolIds.forEach((id, i) => {
      const tool = findTool(tools, id);
      const f = feeds.get(id)!;
      out.push(`#<t${i + 1}_feed>=${num(f.feed)} (T${i + 1} ${plain(tool.name)} - cutting: ${rate(f.feed)})`);
      if (f.plunge !== f.feed) out.push(`#<t${i + 1}_plunge>=${num(f.plunge)} (T${i + 1} ${plain(tool.name)} - plunging: ${rate(f.plunge)})`);
    });
    out.push(
      '(Heights above the stock top, mm)',
      `#<clear_z>=${num(machine.safeHeight)} (rapids between cuts)`,
      '(Touch plate)',
      `#<plate>=${num(p.plateThickness)} (plate thickness, mm)`,
      `#<probe_fast>=${num(p.fastFeed)} (${twoTouch ? 'first touch' : 'probe'}: ${rate(p.fastFeed)})`,
      ...(twoTouch ? [`#<probe_slow>=${num(p.slowFeed)} (second touch: ${rate(p.slowFeed)})`] : []),
      `#<probe_depth>=${num(p.maxTravel)} (the probe goes down this far at most, mm)`,
      ...(twoTouch ? [`#<probe_lift>=${num(p.retract)} (lift between the two touches, mm)`] : []),
      `#<probe_x>=${num(spot.x)} (probe spot X)`,
      `#<probe_y>=${num(spot.y)} (probe spot Y)`,
      '(===== End of settings =====)',
    );
  }

  /** All the way up: FluidNC homes Z to the top on this machine. */
  const toTop = (): string[] =>
    homeZ ? ['(Finish queued moves, then home Z: all the way up)', 'G4 P0', '$HZ'] : [`G0 Z${clearZ}`];

  // FluidNC can't negate a parameter in place (Z-#<x> is a format error): Z[-#<x>] it is.
  const probeLines = (): string[] => [
    'G91',
    // P is the plate thickness: FluidNC sets work Z to it at the contact point.
    `G38.2 Z${params ? '[-#<probe_depth>]' : num(-p.maxTravel)} F${v('probe_fast', p.fastFeed)} P${v('plate', p.plateThickness)}`,
    ...(twoTouch
      ? [
          `G0 Z${v('probe_lift', p.retract)}`,
          `G38.2 Z${params ? `[-[#<probe_lift>+${num(SLOW_PROBE_EXTRA)}]]` : num(-(p.retract + SLOW_PROBE_EXTRA))} F${v('probe_slow', p.slowFeed)} P${v('plate', p.plateThickness)}`,
        ]
      : []),
    'G90',
    `G0 Z${clearZ}`,
  ];
  const toSpot = `G0 X${v('probe_x', spot.x)} Y${v('probe_y', spot.y)}`;
  const spotNote = setup.probeSpot.note ? ` Probe at X${num(spot.x)} Y${num(spot.y)}.` : '';

  let started = false;
  let current: Id | undefined;
  let feed: number | undefined;
  for (const step of program.steps) {
    switch (step.kind) {
      case 'toolChange': {
        const tool = findTool(tools, step.toolId);
        const name = plain(tool.name);
        const select = `T${number(tool.id)}`;
        const first = !started;
        // The first setup takes X0 Y0 from where the bit was jogged; later setups keep it.
        const setsOrigin = first && setup.index === 1;
        if (setsOrigin) {
          out.push(`(Start: ${name} in the router, bit jogged to the front-left corner of the stock, router off)`, select, 'G10 L20 P0 X0 Y0');
        }
        if (homeZ) {
          // Z goes to the top first, so the move to the probe spot and the bit change have room.
          out.push(...toTop());
          if (!setsOrigin) out.push(select);
          out.push(toSpot);
          const what = setsOrigin
            ? `${title}. X0 Y0 set here. Attach the probe.`
            : first
              ? `${title}. Router OFF. Fit the ${name} and attach the probe. X0 Y0 kept.`
              : `Router OFF. Change to ${name} and attach the probe.`;
          out.push(pause(what + spotNote));
        } else {
          // No Z home: the operator makes room, and Z isn't known before the first probe.
          if (started) out.push(`G0 Z${clearZ}`);
          const what = setsOrigin
            ? `${title}. X0 Y0 set here. Raise the bit clear of the stock.`
            : first
              ? `${title}. Router OFF. Fit the ${name} and raise it clear of the stock. X0 Y0 kept.`
              : `Router OFF. Change to ${name}.`;
          out.push(pause(what));
          if (!setsOrigin) out.push(select);
          out.push(toSpot, pause(`Attach probe and place the plate under the bit.${spotNote}`));
        }
        out.push(...probeLines());
        out.push(pause(`Remove probe. Router ON, dial ${num(dialFor(machine, tool, materialId))}.`));
        started = true;
        current = tool.id;
        feed = undefined;
        break;
      }
      case 'operation':
        // A status line for pendants and viewers: step, bit, what, how long.
        opIndex++;
        out.push(`(MSG, ${opIndex}/${opCount} T${current ? number(current) : 0} ${plain(step.label)} - ${minutes(step.seconds)})`);
        break;
      case 'comment':
        out.push(`(${plain(step.text)})`);
        break;
      case 'pause':
        out.push(pause(plain(step.message)));
        break;
      case 'rapid':
      case 'cut':
      case 'arc': {
        const words = [step.kind === 'rapid' ? 'G0' : step.kind === 'cut' ? 'G1' : step.dir === 'cw' ? 'G2' : 'G3'];
        if (step.x !== undefined) words.push(`X${num(step.x)}`);
        if (step.y !== undefined) words.push(`Y${num(step.y)}`);
        if (step.z !== undefined) {
          const clear = step.kind === 'rapid' && Math.abs(step.z - machine.safeHeight) < 1e-9;
          words.push(`Z${clear ? clearZ : num(step.z)}`);
        }
        if (step.kind === 'arc') words.push(`I${num(step.i)}`, `J${num(step.j)}`);
        if (step.kind !== 'rapid' && step.feed !== feed) {
          words.push(`F${feedWord(current, step.feed)}`);
          feed = step.feed;
        }
        out.push(words.join(' '));
        break;
      }
    }
  }

  out.push(...toTop(), pause(`Router OFF. ${plain(program.endMessage)}`), 'M30');
  return out.flatMap(fitLine).join('\n') + '\n';
}

export function fluidncPost(ctx: PostContext): Post {
  return {
    id: 'fluidnc',
    extension: 'gcode',
    write: (program, machine, tools) => writeFluidNC(program, machine, tools, ctx),
  };
}
