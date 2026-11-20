// Usage: node scripts/sample-shots.mjs [only-id ...] [--base=http://localhost:5173] [--wait=8000]
// Makes the pictures on the Samples page: public/samples/<id>.webp for every entry of
// src/samples/samplePages.json (or only the ids named), from the running dev server in headless Edge.
// A Design link is opened in its 3D view filling the page and the picture is the 3D canvas; any other
// link is a picture of the screen. The browser's saved projects are cleared before each one, so a
// variation is shot on a fresh sample, not on what the one before it left behind.
// It also makes public/jigs/<id>.webp for the test cuts on the Jigs page, which have no solid to draw in the
// list: the picture is the scrap carved from the G-code, as the item's own page shows it. `jigs` as an id
// makes only those.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const base = flag('base', 'http://localhost:5173');
const wait = Number(flag('wait', '8000'));
const only = args.filter((a) => !a.startsWith('--'));
const WIDTH = 1200, HEIGHT = 750; // the window the page is laid out in
const OUT_WIDTH = 640; // the picture's width

const groups = JSON.parse(readFileSync(join(root, 'src/samples/samplePages.json'), 'utf8'));
const outDir = join(root, 'public/samples');
const jigDir = join(root, 'public/jigs');
mkdirSync(outDir, { recursive: true });
mkdirSync(jigDir, { recursive: true });
/** The test cuts of the Jigs page: their ids in `src/jigs/catalog.ts` (the items marked `carved`). */
const CARVED_JIGS = ['pocket-test', 'tab-test'];
const samples = [
  ...groups.flatMap((g) => g.samples).map((s) => ({ ...s, dir: outDir, canvas: s.href.includes('#/design') })),
  ...CARVED_JIGS.map((id) => ({ id, href: `/#/jigs?item=${id}`, dir: jigDir, canvas: true, jig: true })),
].filter((s) => !only.length || only.includes(s.id) || (s.jig && only.includes('jigs')));

/** The link to shoot: a Design link gets its 3D view, filling the page. */
function shotUrl(href) {
  const [page, hash = ''] = href.split('#');
  if (!hash.startsWith('/design')) return base + href;
  const [path, query = ''] = hash.split('?');
  const q = new URLSearchParams(query);
  if (!q.has('all') && !q.has('view')) q.set('view', '3d');
  q.set('full', '1');
  return `${base}${page}#${path}?${q}`;
}

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9334;
const child = spawn(edge, [
  '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sample-shots-'))}`, `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result ?? msg.error);
  if (msg.method === 'Runtime.exceptionThrown') problems.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
await send('Page.enable');

let failed = 0;
for (const s of samples) {
  problems.length = 0;
  await send('Page.navigate', { url: 'about:blank' });
  await send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'all' });
  await send('Page.navigate', { url: shotUrl(s.href) });
  await sleep(wait);
  // The view's own buttons (fill the page, reset) are not part of the picture.
  await send('Runtime.evaluate', { expression: `document.querySelectorAll('[data-test="view-full"], [data-test="view-reset"]').forEach((e) => (e.style.display = 'none'))` });
  // The biggest canvas on the page is the 3D view.
  const found = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const c = [...document.querySelectorAll('canvas')].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return c && c.width > 200 ? { x: c.x + scrollX, y: c.y + scrollY, width: c.width, height: c.height } : null; })()`,
  });
  const design = s.canvas;
  // Any other screen: what the window shows, from where the page scrolled itself to (the Shop page's bits).
  const scrolled = await send('Runtime.evaluate', { returnByValue: true, expression: '({ x: scrollX, y: scrollY })' });
  const box = (design && found.result?.value) || { x: scrolled.result?.value?.x ?? 0, y: scrolled.result?.value?.y ?? 0, width: WIDTH, height: HEIGHT };
  if (design && !found.result?.value) problems.push('no 3D canvas on the page');
  const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 82, captureBeyondViewport: true, clip: { ...box, scale: OUT_WIDTH / box.width } });
  writeFileSync(join(s.dir, `${s.id}.webp`), Buffer.from(shot.data, 'base64'));
  console.log(`${problems.length ? 'PROBLEM' : 'ok     '} ${s.id}${problems.length ? ': ' + problems.join(' | ') : ''}`);
  if (problems.length) failed++;
}
ws.close();
child.kill();
process.exit(failed ? 1 : 0);
