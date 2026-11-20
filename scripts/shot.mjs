// Usage: node scripts/shot.mjs <url> <absolute-out.png> [waitMs] [width,height] [script]
// `script` is JavaScript run in the page before the picture is taken (to click or type); its value is printed.
// Dev helper: screenshots a page of the running dev server in headless Edge.
// Drives headless Edge over the DevTools protocol in real time, prints console output, saves a screenshot.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [url, out, wait = '7000', size = '1700,1000', script] = process.argv.slice(2);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9333;
const child = spawn(edge, [
  '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(dirname(out), 'profile-cdp')}`, `--window-size=${size}`, 'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result ?? msg.error);
  if (msg.method === 'Runtime.consoleAPICalled') console.log('console.' + msg.params.type, msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Log.entryAdded') console.log('log', msg.params.entry.level, msg.params.entry.text, msg.params.entry.url ?? '');
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
// Edge's window is never narrower than about 500 px: a phone's width is set on the page itself.
const [w, h] = size.split(',').map(Number);
if (w < 500) await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url });
await sleep(Number(wait));
if (script) {
  const ran = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
  console.log('script:', JSON.stringify(ran.result?.value ?? ran.exceptionDetails?.exception?.description ?? null));
  await sleep(800);
}
const text = await send('Runtime.evaluate', { expression: "document.querySelector('.status')?.textContent ?? '(no status text)'" });
console.log('status:', text.result?.value);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
ws.close();
child.kill();
process.exit(0);
