import { writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = 9333;
const OUT = process.env.OUT_DIR || 'shots';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const LAST = `document.querySelectorAll('.sheet')[document.querySelectorAll('.sheet').length - 1]`;
async function click(sel) {
  const ok = await evalJS(`(() => { const all = document.querySelectorAll(${JSON.stringify(sel)}); const el = all[all.length - 1]; if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`找不到 ${sel}`);
  await sleep(400);
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('shot', name);
}
async function setField(field, value) {
  const ok = await evalJS(`(() => { const el = ${LAST}?.querySelector('[data-field="${field}"]'); if (!el) return false; el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  if (!ok) throw new Error(`字段 ${field} 不存在`);
  await sleep(120);
}

await send('Page.reload', { ignoreCache: true });
await sleep(2200);
await click('[data-action="import"]');
await click('[data-source="system"]');
await sleep(300);
await shot('school-import');

const info = await evalJS(`({
  baseUrl: ${LAST}.querySelector('[data-field="baseUrl"]')?.value,
  school: ${LAST}.querySelector('[data-school]')?.value,
  adapter: ${LAST}.querySelector('[data-field="adapter"]')?.value,
  hasNotice: ${LAST}.innerText.includes('无需校园网'),
  title: ${LAST}.querySelector('h2')?.textContent
})`);
console.log('form:', JSON.stringify(info));

await setField('username', '99999999');
await setField('password', 'Test@1234');
await setField('year', '2026');
await click('[data-run]');
await sleep(7000);
const result = await evalJS(`({ text: ${LAST}.innerText, busy: !!${LAST}.querySelector('.spinner') })`);
console.log('after import:', result.text.replace(/\s+/g, ' ').slice(0, 500));
await shot('school-result');
console.log('ERRORS:', errors.length ? errors : 'none');
ws.close();
