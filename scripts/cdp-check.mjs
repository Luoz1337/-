const PORT = process.env.CDP_PORT || 9222;

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:5178')) || targets.find((t) => t.type === 'page');
if (!page) {
  console.error('没有找到页面目标');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const logs = [];

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
    const d = msg.params.exceptionDetails;
    logs.push(`EXCEPTION: ${d.text} ${d.exception?.description || ''}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`CONSOLE ${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push(`LOG ${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 2500));

const result = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    htmlLength: document.body.innerHTML.length,
    text: document.body.innerText.slice(0, 300),
    hasApp: !!document.querySelector('.tt-wrap'),
    scripts: [...document.scripts].map(s => s.src),
    styles: [...document.styleSheets].length
  })`,
  returnByValue: true,
});

console.log('STATE:', result.result.value);
console.log('LOGS:');
for (const line of logs) console.log(' -', line);
ws.close();
