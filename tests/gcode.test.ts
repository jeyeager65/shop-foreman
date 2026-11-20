import { beforeAll, describe, expect, it } from 'vitest';
import { type GCodeParserInstance, loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { LOWRIDER_3 } from './lowRider';
import { ROUTERS, dialRpm, routerDial, routerRangeNote } from '@/libraries';
import { throughDepth } from '@/plan';
import { MAX_LINE, fitLine } from '@/post/fluidnc';
import { createVanityProject } from '@/samples/vanity';
import { lowRiderJobShop } from './lowRider';

/** A cut through the stock goes this far past its bottom (the machine's `throughExtra`). */
const THROUGH_EXTRA = LOWRIDER_3.throughExtra;

const shop = lowRiderJobShop();
const machine = shop.machines[0]!;
const job = buildJob(createVanityProject(), shop);
const THICKNESS = 19;

interface Line {
  text: string;
  /** The operation the line belongs to, from its `(MSG, 2/4 T1 Name - ~5 min)` status line. */
  op: string;
}

function linesOf(text: string): Line[] {
  let op = '';
  return text
    .trimEnd()
    .split('\n')
    .map((line) => {
      const m = /^\(MSG, \d+\/\d+ T\d+ (.*) - (?:<1|~\d+) min\)$/.exec(line);
      if (m) op = m[1]!;
      if (/^M0 \(MSG, Router OFF/.test(line) || line === '$HZ') op = '';
      return { text: line, op };
    });
}

const word = (line: string, letter: string): number | undefined => {
  if (line.startsWith('(')) return undefined;
  const m = new RegExp(`${letter}(-?\\d+\\.?\\d*)`).exec(line);
  return m ? Number(m[1]) : undefined;
};

/** What follows the pause that fits the bit and attaches the probe. */
const PROBE_ROUTINE = [
  /^G91$/,
  /^G38\.2 Z-80 F180 P0\.5$/,
  /^G0 Z2$/,
  /^G38\.2 Z-5 F60 P0\.5$/,
  /^G90$/,
  /^G0 Z5$/,
  /^M0 \(MSG, Remove probe\. Router ON, dial \d(\.5)?\.\)$/,
];
const HOME_Z = ['(Finish queued moves, then home Z: all the way up)', 'G4 P0', '$HZ'];
/** Home Z (all the way up on a LowRider), select the bit, go to the probe spot. */
const TO_PROBE_SPOT = [...HOME_Z, /^T\d+$/, 'G0 X12 Y12'];
const expectLines = (texts: string[], at: number, want: (string | RegExp)[]) =>
  want.forEach((w, i) => (typeof w === 'string' ? expect(texts[at + i]).toBe(w) : expect(texts[at + i]).toMatch(w)));

describe('vanity job output', () => {
  it('produces the two setup files', () => {
    expect(job.files.map((f) => f.name)).toEqual(['vanity-setup-1-back.gcode', 'vanity-setup-2-front.gcode']);
  });

  it('shows machine time and tool changes in the plan', () => {
    const { summary, operations } = job.plan;
    expect(summary.toolChanges).toBe(3);
    const cutting = operations.reduce((sum, op) => sum + op.machineSeconds, 0);
    expect(summary.machineSeconds).toBeCloseTo(cutting + 3 * machine.toolChangeSeconds, 6);
    for (const op of operations) {
      if (op.method === 'cnc') expect(op.machineSeconds).toBeGreaterThan(0);
      else expect(op.machineSeconds).toBe(0);
    }
    // Sanity range, not a promise: placeholder feeds
    expect(summary.machineSeconds / 60).toBeGreaterThan(30);
    expect(summary.machineSeconds / 60).toBeLessThan(180);
  });

  it('matches the golden files', async () => {
    for (const file of job.files) {
      // Each file says which version of the app wrote it; the golden copies leave the number out.
      expect(file.text).toMatch(/^\(Shop Foreman \d+\.\d+\.\d+[^)]*\)$/m);
      await expect(file.text.replace(/^\(Shop Foreman [^)]*\)$/m, '(Shop Foreman)')).toMatchFileSnapshot(`./golden/${file.name}`);
    }
  });
});

describe.each(job.files)('post rules: $name', (file) => {
  const lines = linesOf(file.text);
  const texts = lines.map((l) => l.text);

  it('is ASCII, mm, absolute, with one flat comment per line', () => {
    expect(file.text).toMatch(/^[\x20-\x7e\n]*$/);
    expect(texts).toContain('G21 G90 G17 G94');
    expect(file.name.endsWith('.gcode')).toBe(true);
    for (const t of texts) {
      // A comment is a whole line, or the message of a pause
      if (t.includes('(')) expect(t).toMatch(/^(M0 )?\([^()]*\)$/);
    }
    expect(texts.some((t) => /\bG20\b/.test(t))).toBe(false);
  });

  it("keeps every line within FluidNC's 127 bytes, with no message cut short and bare $ commands", () => {
    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(127);
      expect(t.endsWith('...)')).toBe(false);
      if (t.startsWith('$')) expect(t).toMatch(/^\$[A-Z]+$/);
    }
  });

  it('never switches the router with M3/M4/M5', () => {
    for (const t of texts) if (!t.startsWith('(')) expect(t).not.toMatch(/M0*[345]\b/);
  });

  it('writes Stock and ToolDef comments before any motion', () => {
    const firstMove = texts.findIndex((t) => /^G[0-3]\b/.test(t));
    const stock = texts.indexOf('(Stock: XMIN=0 XMAX=606.425 YMIN=0 YMAX=698.5 ZMIN=-19 ZMAX=0)');
    expect(stock).toBeGreaterThan(-1);
    expect(stock).toBeLessThan(firstMove);
    const defs = texts.filter((t) => t.startsWith('(ToolDef '));
    expect(defs[0]).toBe('(ToolDef 1: SHAPE=flat D=6.35 FLUTES=1 NAME=1/4" end mill)');
    for (const def of defs) expect(texts.indexOf(def)).toBeLessThan(firstMove);
  });

  it('starts by setting X0 Y0 (first setup only), homing Z, and one pause before the probe', () => {
    const start = texts.findIndex((t) => t.startsWith('M0 (MSG, Setup '));
    if (file.name.includes('back')) {
      // The bit was jogged to the corner: that becomes X0 Y0, then Z goes to the top
      expectLines(texts, start - 7, [
        '(Start: 1/4" end mill in the router, bit jogged to the front-left corner of the stock, router off)',
        'T1',
        'G10 L20 P0 X0 Y0',
        ...HOME_Z,
        'G0 X12 Y12',
      ]);
      expect(texts[start]).toBe('M0 (MSG, Setup 1 of 2: back face up. X0 Y0 set here. Attach the probe.)');
    } else {
      expectLines(texts, start - TO_PROBE_SPOT.length, TO_PROBE_SPOT);
      expect(texts[start]).toBe('M0 (MSG, Setup 2 of 2: front face up. Router OFF. Fit the 1/4" end mill and attach the probe. X0 Y0 kept.)');
    }
    // X and Y are zeroed once, in the first setup, and Z never is: it comes from the probe's P word
    expect(texts.filter((t) => t.startsWith('G10'))).toEqual(file.name.includes('back') ? ['G10 L20 P0 X0 Y0'] : []);
    expectLines(texts, start + 1, PROBE_ROUTINE);
    const firstCut = texts.findIndex((t) => /^G[123]\b/.test(t));
    expect(firstCut).toBeGreaterThan(start + PROBE_ROUTINE.length);
    // No Z word before Z has been homed and probed
    for (const t of texts.slice(0, start + 2)) expect(word(t, 'Z')).toBeUndefined();
  });

  it('follows every bit change with the probe routine', () => {
    const changes = texts.flatMap((t, i) => (t.startsWith('M0 (MSG, Router OFF. Change to ') ? [i] : []));
    expect(changes).toHaveLength(file.name.includes('front') ? 3 : 0);
    for (const i of changes) {
      // Z homes to the top before the move to the probe spot and the bit change
      expectLines(texts, i - TO_PROBE_SPOT.length, TO_PROBE_SPOT);
      expect(texts[i]).toMatch(/ and attach the probe\.\)$/);
      expectLines(texts, i + 1, PROBE_ROUTINE);
    }
    // Z is homed once per bit load and once at the end, each after the planner is drained
    const homes = texts.flatMap((t, i) => (t === '$HZ' ? [i] : []));
    expect(homes).toHaveLength(changes.length + 2);
    for (const i of homes) expect(texts[i - 1]).toBe('G4 P0');
    // Every probe belongs to a routine: one per bit load
    const probes = texts.filter((t) => t.startsWith('G38.2')).length;
    expect(probes).toBe(2 * (changes.length + 1));
  });

  it('ends with router off and the next step', () => {
    expect(texts.slice(-5)).toEqual([
      ...HOME_Z,
      file.name.includes('back')
        ? 'M0 (MSG, Router OFF. Setup 1 done. Flip the sheet left to right onto the pins.)'
        : 'M0 (MSG, Router OFF. Job done.)',
      'M30',
    ]);
  });

  it('never cuts below the stock bottom except for the pin holes, and the cutout by the machine\'s extra for a through cut', () => {
    let pinDepth = 0;
    for (const { text, op } of lines) {
      const z = word(text, 'Z');
      if (z === undefined || !/^G[0-3]\b/.test(text)) continue;
      if (op === 'Registration holes') pinDepth = Math.min(pinDepth, z);
      else expect(z).toBeGreaterThanOrEqual(-THICKNESS - (op === 'Cutout' ? THROUGH_EXTRA : 0) - 1e-9);
    }
    if (file.name.includes('back')) expect(pinDepth).toBeCloseTo(-(THICKNESS + 6), 6);
    else expect(pinDepth).toBe(0);
  });

  it('enters end mill cuts on a helix or ramp, not a straight plunge', () => {
    for (const { text, op } of lines) {
      if (!['Hinge cups', 'Cutout'].includes(op)) continue;
      if (/^G1 Z/.test(text)) expect(text).toMatch(/^G1 Z0\b/);
    }
  });

  it('peck drills the pin holes: a pass down, a lift clear, back to just above, the next pass', () => {
    const pins = lines.filter((l) => l.op === 'Registration holes').map((l) => l.text);
    if (file.name.includes('front')) return expect(pins).toEqual([]);
    const lifts = pins.filter((t) => t === 'G0 Z1');
    // 25 mm in 3.2 mm passes is 8 passes per hole, with a lift between each
    expect(lifts).toHaveLength(2 * 7);
    const depths = pins.filter((t) => /^G1 Z-[\d.]+ F360$|^G1 Z-[\d.]+$/.test(t)).map((t) => word(t, 'Z')!);
    expect(Math.min(...depths)).toBeCloseTo(-25, 6);
    for (const [i, t] of pins.entries()) {
      if (t !== 'G0 Z1') continue;
      // After a lift the bit returns to 0.5 mm above the depth it had reached, then cuts on
      const before = word(pins[i - 1]!, 'Z')!;
      expect(word(pins[i + 1]!, 'Z')).toBeCloseTo(before + 0.5, 6);
      expect(word(pins[i + 2]!, 'Z')).toBeLessThan(before);
    }
    // The hole is then opened to the pin's size at the bottom
    expect(pins.filter((t) => /^G3 .* I-?0\.05 /.test(t)).length).toBe(4);
  });

  it('rapids only at or above the stock top', () => {
    for (const t of texts) {
      if (t.startsWith('G0') && word(t, 'Z') !== undefined) expect(word(t, 'Z')).toBeGreaterThan(0);
    }
  });
});

describe('setup contents', () => {
  const [back, front] = job.files.map((f) => linesOf(f.text));
  const ops = (lines: Line[]) => [...new Set(lines.map((l) => l.op).filter(Boolean))];

  it('back setup: cups then pin holes with the 1/4" end mill', () => {
    expect(ops(back!)).toEqual(['Hinge cups', 'Registration holes']);
    const cupDepth = Math.min(...back!.filter((l) => l.op === 'Hinge cups').map((l) => word(l.text, 'Z') ?? 0));
    expect(cupDepth).toBeCloseTo(-13, 6);
  });

  it('front setup: pocket, corner clean-up, bevel, then the cutout last', () => {
    expect(ops(front!)).toEqual(['Panel pocket', 'Panel pocket corner clean-up', 'Inside bevel', 'Cutout']);
    const depth = (op: string) => Math.min(...front!.filter((l) => l.op === op).map((l) => word(l.text, 'Z') ?? 0));
    expect(depth('Panel pocket')).toBeCloseTo(-6.35, 6);
    expect(depth('Panel pocket corner clean-up')).toBeCloseTo(-6.35, 6);
    expect(depth('Inside bevel')).toBeCloseTo(-6.35, 6);
    expect(depth('Cutout')).toBeCloseTo(-19 - THROUGH_EXTRA, 6);
  });

  it('leaves tabs on the cutout: 4 per door, near the corners on its two long sides, 40% of the stock high, on every lap that goes below them', () => {
    const cutout = front!.filter((l) => l.op === 'Cutout' && /^G1\b/.test(l.text));
    // A tab top is a level move at the tab height between two sloped moves
    const tabTops = cutout.filter((l, i) => {
      const z = word(l.text, 'Z');
      const before = word(cutout[i - 1]?.text ?? '', 'Z');
      // 19 mm stock: 7.6 mm high, so their tops are 11.4 mm down.
      return z === -11.4 && before === -11.4;
    });
    // Two doors of 4 tabs (near the ends of each long side, none on the short ones), on each lap below the tabs' tops: the three roughing laps that reach there, and the finishing lap.
    expect(tabTops.length).toBe(2 * 4 * 4);
  });

  it('bevel reaches the frame corners at the surface for sharp corners', () => {
    const bevel = front!.filter((l) => l.op === 'Inside bevel' && /^G1\b/.test(l.text) && word(l.text, 'Z') === 0);
    // 4 corner lifts per door (the first Z0 move per door is the approach, with no X/Y)
    expect(bevel.filter((l) => word(l.text, 'X') !== undefined)).toHaveLength(8);
  });
});

describe.each(job.files)('cnc-gcode-tools parses $name', (file) => {
  let parser: GCodeParserInstance;
  beforeAll(async () => {
    parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(file.text);
  });

  it('reads the stock and a ToolDef for every bit that cuts', () => {
    expect(parser.simMeta.units).toBe('mm');
    expect(parser.simMeta.stock).toEqual({ xmin: 0, xmax: 606.425, ymin: 0, ymax: 698.5, zmin: -19, zmax: 0 });
    const cutting = new Set(parser.segments.filter((s) => s.type === 'cut').map((s) => s.toolNumber));
    expect(cutting.size).toBe(file.name.includes('front') ? 3 : 1);
    for (const n of cutting) expect(parser.simMeta.tools.has(n)).toBe(true);
    if (file.name.includes('front')) {
      expect(parser.simMeta.tools.get(2)).toMatchObject({ shape: 'flat', diameter: 3.175 });
      expect(parser.simMeta.tools.get(3)).toMatchObject({ shape: 'vbit', diameter: 12.7, angle: 60 });
    }
  });

  it('has moves, no alarms, and stays on the blank', () => {
    expect(parser.segments.length).toBeGreaterThan(100);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    // The probe's P word puts the preview's Z0 on the stock top, so depths read true
    const deepest = Math.min(...parser.segments.filter((s) => s.type === 'cut').map((s) => s.end.z));
    expect(deepest).toBeCloseTo(file.name.includes('back') ? -25 : -19 - THROUGH_EXTRA, 6);
    for (const s of parser.segments.filter((x) => x.type === 'cut')) {
      for (const p of [s.start, s.end]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(606.425);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(698.5);
      }
    }
  });

  it('shows the operator messages in order', () => {
    const messages = parser.events.filter((e) => e.kind === 'msg').map((e) => e.text);
    expect(messages[0]).toMatch(/^Setup \d of 2: (back|front) face up\./);
    expect(messages[1]).toBe('Remove probe. Router ON, dial 2.');
    // Then a status line as each operation starts
    expect(messages[2]).toMatch(file.name.includes('back') ? /^1\/2 T1 Hinge cups - ~\d+ min$/ : /^1\/4 T1 Panel pocket - ~\d+ min$/);
    const status = messages.filter((m) => /^\d\/\d T\d /.test(m));
    expect(status.map((m) => m.split(' ')[0])).toEqual(file.name.includes('back') ? ['1/2', '2/2'] : ['1/4', '2/4', '3/4', '4/4']);
    expect(messages.at(-1)).toMatch(/^Router OFF\./);
  });

  it('keeps every cut clear of the probe square', () => {
    const { clearSquare, edgeInset } = machine.probe;
    const reach = edgeInset + clearSquare + 6.35; // square plus the widest bit's radius, with margin
    for (const s of parser.segments.filter((x) => x.type === 'cut')) {
      for (const p of [s.start, s.end]) expect(p.x > reach || p.y > reach).toBe(true);
    }
  });
});

describe('line length', () => {
  it('wraps a long comment, cuts a long message, and refuses long code', () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const wrapped = fitLine(`(${words})`);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE);
      expect(line).toMatch(/^\([^()]*\)$/);
    }
    expect(wrapped.map((l) => l.slice(1, -1)).join(' ')).toBe(words);

    const [message, ...rest] = fitLine(`(MSG, ${words})`);
    expect(rest).toEqual([]);
    expect(message!.length).toBeLessThanOrEqual(MAX_LINE);
    expect(message).toMatch(/^\(MSG, word0 .*\.\.\.\)$/);

    expect(fitLine('G1 X1 Y2')).toEqual(['G1 X1 Y2']);
    expect(() => fitLine(`G1 ${'X1 '.repeat(60)}`)).toThrow(/127/);
  });
});

describe('machine without a Z home', () => {
  const plainShop = lowRiderJobShop();
  plainShop.machines[0]!.homeZForBitChange = false;
  const files = buildJob(createVanityProject(), plainShop).files;

  it('lifts to the safe height for bit changes and asks for room before the first probe', () => {
    for (const file of files) {
      const texts = file.text.trimEnd().split('\n');
      expect(texts.some((t) => t.startsWith('$'))).toBe(false);
      const start = texts.findIndex((t) => t.startsWith('M0 (MSG, Setup '));
      const back = file.name.includes('back');
      expect(texts[start]).toMatch(back ? /X0 Y0 set here\. Raise the bit clear of the stock\.\)$/ : /Fit the 1\/4" end mill and raise it clear of the stock\. X0 Y0 kept\.\)$/);
      expect(texts.slice(start + 1, start + (back ? 3 : 4))).toEqual([
        ...(back ? [] : ['T1']),
        'G0 X12 Y12',
        'M0 (MSG, Attach probe and place the plate under the bit.)',
      ]);
      for (const [i, t] of texts.entries()) {
        if (t.startsWith('M0 (MSG, Router OFF. Change to ')) expect(texts[i - 1]).toBe('G0 Z5');
      }
      expect(texts.at(-3)).toBe('G0 Z5');
    }
  });
});

describe('single-touch probing', () => {
  it('probes once when the profile has no slow feed', () => {
    const single = lowRiderJobShop();
    single.machines[0]!.probe.slowFeed = 0;
    const text = buildJob(createVanityProject(), single).files[0]!.text;
    const lines = text.split('\n');
    const at = lines.indexOf('G91');
    expect(lines.slice(at, at + 4)).toEqual(['G91', 'G38.2 Z-80 F180 P0.5', 'G90', 'G0 Z5']);
    expect(lines.filter((l) => l.startsWith('G38.2'))).toHaveLength(1);
  });
});

describe('router dial', () => {
  const makita = ROUTERS.find((r) => r.id === 'makita-rt0701c')!;
  const dewalt = ROUTERS.find((r) => r.id === 'dewalt-dwp611')!;

  it('gives the nearest half step for an RPM, held at the ends of the dial', () => {
    expect(routerDial(makita, 22000)).toBe(4);
    const kobalt = ROUTERS.find((r) => r.id === 'kobalt-k7tr-03')!;
    expect(lowRiderJobShop().machines[0]!.router?.id).toBe('kobalt-k7tr-03');
    expect(routerDial(kobalt, 22000)).toBe(4);
    expect(routerDial(kobalt, 16000)).toBe(2.5);
    expect(routerDial(kobalt, 30000)).toBe(5.5);
    expect(routerDial(makita, 19500)).toBe(3.5);
    expect(routerDial(makita, 18000)).toBe(3);
    expect(routerDial(makita, 5000)).toBe(1);
    expect(routerDial(makita, 40000)).toBe(6);
    expect(routerDial(dewalt, 22000)).toBe(3.5);
    expect(dialRpm(makita, 3.5)).toBe(19500);
    expect(routerRangeNote(makita, 22000)).toBe('');
    expect(routerRangeNote(makita, 8000)).toMatch(/can't go below about 10000 RPM/);
    expect(routerRangeNote(makita, 35000)).toMatch(/30000 RPM maximum/);
  });

  it('comes from the machine, so changing the router changes the messages, not the bits', () => {
    const other = lowRiderJobShop();
    other.machines[0]!.router = structuredClone(dewalt);
    const text = buildJob(createVanityProject(), other).files[0]!.text;
    // The starter bits ask for 14000 RPM: dial 2 on the Kobalt, the DeWalt's lowest (16000) on its dial 1.
    expect(text).toContain('M0 (MSG, Remove probe. Router ON, dial 1.)');
    expect(job.files[0]!.text).toContain('M0 (MSG, Remove probe. Router ON, dial 2.)');
  });
});

describe('settings block (FluidNC parameters)', () => {
  const paramShop = lowRiderJobShop();
  paramShop.machines[0]!.postOptions = { parameters: true };
  const paramJob = buildJob(createVanityProject(), paramShop);

  it('is off unless asked for', () => {
    for (const file of job.files) expect(file.text).not.toContain('#<');
  });

  it('defines each value once at the top and uses it in the body', () => {
    const text = paramJob.files[1]!.text;
    const lines = text.trimEnd().split('\n');
    const end = lines.indexOf('(===== End of settings =====)');
    const block = lines.slice(lines.indexOf('(===== Settings - edit here =====)'), end);
    const defined = block.flatMap((l) => /^#<(\w+)>=/.exec(l)?.[1] ?? []);
    expect(defined).toEqual([
      't1_feed', 't1_plunge', 't2_feed', 't2_plunge', 't3_feed', 't3_plunge',
      'clear_z', 'plate', 'probe_fast', 'probe_slow', 'probe_depth', 'probe_lift', 'probe_x', 'probe_y',
    ]);
    expect(block).toContain('#<t1_feed>=2400 (T1 1/4" end mill - cutting: 2400 mm/min = 40 mm/s)');
    expect(block).toContain('#<probe_depth>=80 (the probe goes down this far at most, mm)');
    const body = lines.slice(end + 1);
    // Every parameter is used, and nothing is defined after the block
    for (const name of defined) expect(body.some((l) => l.includes(`#<${name}>`))).toBe(true);
    expect(body.some((l) => /^#</.test(l))).toBe(false);
    expect(body).toContain('G38.2 Z[-#<probe_depth>] F#<probe_fast> P#<plate>');
    expect(body).toContain('G38.2 Z[-[#<probe_lift>+3]] F#<probe_slow> P#<plate>');
    expect(body).toContain('G0 X#<probe_x> Y#<probe_y>');
    expect(body).toContain('G0 Z#<clear_z>');
    // No bare feed is left on a cutting move
    for (const l of body) if (/^G[123] /.test(l) && / F/.test(l)) expect(l).toMatch(/ F#<t\d_(feed|plunge)>$/);
    // The status lines and pauses are untouched by the parameters
    expect(body).toContain('M0 (MSG, Remove probe. Router ON, dial 2.)');
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(127);
  });

  it('previews exactly like the plain file in cnc-gcode-tools', async () => {
    for (const [i, file] of paramJob.files.entries()) {
      const withParams = new (loadGCodeTools().GCodeParser)();
      await withParams.parseString(file.text);
      const plainParser = new (loadGCodeTools().GCodeParser)();
      await plainParser.parseString(job.files[i]!.text);
      expect(withParams.events.filter((e) => e.kind === 'alarm')).toEqual([]);
      const key = (segments: GCodeParserInstance['segments']) =>
        segments.map((s) => [s.type, s.end.x, s.end.y, s.end.z, s.feedRate, s.toolNumber].map((v) => (typeof v === 'number' ? +v.toFixed(3) : v)).join(' '));
      expect(key(withParams.segments)).toEqual(key(plainParser.segments));
    }
  });
});

describe('syntax highlighting', () => {
  const highlight = loadGCodeTools().highlightParametricGCodeLine;

  it('marks the words of a move with cnc-gcode-tools classes', () => {
    expect(highlight('G1 X12.5 Y-3 Z-2.6 F2540')).toBe(
      '<span class="gcode-g-code">G1</span> <span class="gcode-x-axis">X12.5</span> <span class="gcode-y-axis">Y-3</span> ' +
        '<span class="gcode-z-axis">Z-2.6</span> <span class="gcode-f-code">F2540</span>',
    );
    expect(highlight('M0')).toBe('<span class="gcode-m-code">M0</span>');
    expect(highlight('T2')).toBe('<span class="gcode-t-code">T2</span>');
  });

  it('keeps operator messages whole and escapes them', () => {
    expect(highlight('(MSG, Router ON, dial 4.)')).toBe('<span class="gcode-comment">(MSG, Router ON, dial 4.)</span>');
    expect(highlight('(a <b> & c)')).toBe('<span class="gcode-comment">(a &lt;b&gt; &amp; c)</span>');
  });

  it('highlights every line of the vanity files without losing text', () => {
    for (const file of job.files) {
      for (const line of file.text.split('\n')) {
        const text = highlight(line).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        expect(text).toBe(line);
      }
    }
  });
});

/** The machine's extra depth on a through cut. */
describe('a through cut goes past the bottom of the stock', () => {
  const cutoutOf = (extra: number) => {
    const s = lowRiderJobShop();
    s.machines[0]!.throughExtra = extra;
    const front = buildJob(createVanityProject(), s).files.find((f) => f.name.includes('front'))!;
    const cutout = linesOf(front.text).filter((l) => l.op === 'Cutout');
    const zs = cutout.map((l) => word(l.text, 'Z')).filter((z): z is number => z !== undefined && z < 0);
    return { deepest: Math.min(...zs), levels: new Set(zs.filter((z) => z !== -16)).size, lines: cutout.length, tabTops: zs.filter((z) => z === -16).length };
  };

  it('by the machine\'s setting, 0.5 mm to start with, on the last pass only: no pass more, the tabs as high as before', () => {
    expect(LOWRIDER_3.throughExtra).toBe(0.5);
    const [none, half, one] = [cutoutOf(0), cutoutOf(0.5), cutoutOf(1)];
    expect([none.deepest, half.deepest, one.deepest]).toEqual([-19, -19.5, -20]);
    expect([half.lines, one.lines]).toEqual([none.lines, none.lines]);
    expect([half.tabTops, one.tabTops]).toEqual([none.tabTops, none.tabTops]);
  });

  it('never deeper than the bit\'s cutting length, though still through', () => {
    // A bit whose cutting length is measured: 22 mm. (An unmeasured one takes the whole extra.)
    const starter = shop.tools.find((t) => t.shape.kind === 'endMill')!;
    const length = 22;
    const tool = { ...starter, shape: { ...starter.shape, cuttingLength: { mm: length, unit: 'mm' } } } as typeof starter;
    expect(throughDepth({ throughExtra: 5 }, { ...starter, shape: { ...starter.shape, cuttingLength: null } } as typeof starter, 19)).toBe(24);
    expect(throughDepth({ throughExtra: 0.5 }, tool, 19)).toBe(19.5);
    expect(throughDepth({ throughExtra: 0 }, tool, 19)).toBe(19);
    expect(throughDepth({ throughExtra: 5 }, tool, length - 1)).toBe(length);
    expect(throughDepth({ throughExtra: 5 }, tool, length + 2)).toBe(length + 2);
  });
});
