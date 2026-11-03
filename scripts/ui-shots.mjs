import { writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9333);
const OUT = process.env.OUT_DIR || 'shots';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('没有找到页面');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(`EXCEPTION ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(`CONSOLE ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
await send('Page.enable');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result.value;
}

async function click(selector) {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`找不到元素：${selector}`);
  await sleep(450);
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('shot', name);
}

await send('Page.reload', { ignoreCache: true });
await sleep(1500);
await evaluate('localStorage.clear()');
await send('Page.reload', { ignoreCache: true });
await sleep(2200);

await shot('01-timetable');

await click('[data-tab="agenda"]');
await shot('02-agenda');

await click('[data-tab="tools"]');
await shot('03-tools');

await click('[data-tab="me"]');
await shot('04-me');

await click('[data-tab="timetable"]');
await evaluate(`window.__SUPERTABLE__.ctx.openEditor({ day: 2, start: 5, end: 6, weeks: Array.from({length:16},(_,i)=>i+1) })`);
await sleep(600);
await shot('05-editor');
await evaluate(`document.querySelector('.sheet [data-cancel]').click()`);
await sleep(400);

await evaluate(`window.__SUPERTABLE__.ctx.openCourse(document.querySelector('[data-course]').dataset.course)`);
await sleep(600);
await shot('06-detail');
await evaluate(`document.querySelector('.sheet [data-close]').click()`);
await sleep(400);

await click('[data-action="import"]');
await shot('07-import-source');
await click('[data-source="system"]');
await shot('08-import-system');
await evaluate(`(() => { const s = document.querySelector('[data-field="adapter"]'); s.value = 'demo'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await sleep(400);
await shot('09-import-demo');
await click('[data-run]');
await sleep(1400);
await shot('10-import-preview');
const previewInfo = await evaluate(`({ rows: document.querySelectorAll('.import-row').length, text: document.querySelector('.import-preview-head')?.innerText })`);
console.log('preview:', JSON.stringify(previewInfo));
await click('[data-import]');
await sleep(600);
await shot('11-import-done');

console.log('ERRORS:', errors.length ? errors : 'none');
ws.close();
