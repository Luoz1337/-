import { writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9333);
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
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
}

async function reload() {
  await send('Page.reload', { ignoreCache: true });
  await sleep(2000);
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('   shot:', name);
}

const LAST = `document.querySelectorAll('.sheet')[document.querySelectorAll('.sheet').length - 1]`;

async function click(selector) {
  const ok = await evaluate(`(() => { const all = document.querySelectorAll(${JSON.stringify(selector)}); const el = all[all.length - 1]; if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`找不到元素：${selector}`);
  await sleep(400);
}

async function clickLast(selector) {
  const ok = await evaluate(`(() => { const el = ${LAST}?.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`弹层内找不到元素：${selector}`);
  await sleep(400);
}

async function setField(field, value) {
  const ok = await evaluate(`(() => {
    const el = ${LAST}?.querySelector('[data-field="${field}"]');
    if (!el) return false;
    el.focus();
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  })()`);
  if (!ok) throw new Error(`表单字段不存在：${field}`);
  await sleep(120);
}

async function clickInLast(selector) {
  const ok = await evaluate(`(() => { const el = ${LAST}?.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`弹层内找不到：${selector}`);
  await sleep(350);
}

function check(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log('✓', message);
}

async function storageCourses() {
  return evaluate(`(() => { try { return JSON.parse(localStorage.getItem('supertable.state.v1')).courses; } catch { return []; } })()`);
}

// ---------- 1. 初始状态 ----------
await evaluate('localStorage.clear()');
await reload();
errors.length = 0;
await click('[data-tab="timetable"]');
check(await evaluate(`document.querySelectorAll('.course').length === 0`), '首次为空课表');
check(await evaluate(`document.querySelectorAll('.week-pill').length === 20`), '周次条 20 周');
check(await evaluate(`!!document.querySelector('.empty-banner')`), '显示空课表提示');
await shot('12-light-timetable');

// ---------- 2. 添加课程 ----------
await click('[data-action="add-course"]');
check(await evaluate(`${LAST}.querySelector('h2').textContent.includes('添加课程')`), '打开添加课程表单');
await setField('name', '量子力学导论');
await setField('teacher', '周瑜');
await setField('room', '理科楼 502');
await clickInLast('[data-day="4"]');
await setField('start', '11');
await setField('end', '12');
await clickInLast('[data-preset="first8"]');
await clickLast('[data-save]');
await sleep(600);
const afterAdd = await storageCourses();
check(afterAdd.some((c) => c.name === '量子力学导论'), '新课程已写入存储');
check(await evaluate(`document.body.innerText.includes('量子力学导论')`), '课表上出现新课程');
await shot('13-course-added');

// ---------- 3. 编辑课程 ----------
await evaluate(`(() => { const el = [...document.querySelectorAll('.course')].find(e => e.textContent.includes('量子力学导论')); el.click(); })()`);
await sleep(500);
check(await evaluate(`${LAST}.innerText.includes('量子力学导论')`), '打开课程详情');
await clickLast('[data-edit]');
await sleep(600);
check(await evaluate(`${LAST}.querySelector('h2').textContent.includes('编辑课程')`), '打开编辑表单');
await setField('name', '量子力学（实验）');
await clickLast('[data-save]');
await sleep(600);
check(await evaluate(`document.body.innerText.includes('量子力学（实验）')`), '编辑后名称已更新');

// ---------- 4. 删除课程 ----------
await evaluate(`(() => { const el = [...document.querySelectorAll('.course')].find(e => e.textContent.includes('量子力学（实验）')); el.click(); })()`);
await sleep(500);
await clickLast('[data-del]');
await sleep(400);
check(await evaluate(`${LAST}.innerText.includes('删除课程')`), '弹出删除确认');
await clickLast('[data-ok]');
await sleep(700);
check(await evaluate(`!document.body.innerText.includes('量子力学（实验）')`), '删除后课程消失');

// ---------- 5. 学期设置 ----------
await click('[data-tab="me"]');
await click('[data-action="settings"]');
check(await evaluate(`${LAST}.innerText.includes('学期设置')`), '打开学期设置');
await setField('totalWeeks', '18');
await clickLast('[data-save]');
await sleep(600);
const totalWeeks = await evaluate(`JSON.parse(localStorage.getItem('supertable.state.v1')).settings.totalWeeks`);
check(totalWeeks === 18, '总周数保存为 18');
await click('[data-tab="timetable"]');
check(await evaluate(`document.querySelectorAll('.week-pill').length === 18`), '周次条随设置更新为 18 周');

// ---------- 6. 深色模式 ----------
await click('[data-tab="me"]');
await click('[data-action="theme"]');
await sleep(500);
check(await evaluate(`document.documentElement.dataset.theme === 'dark'`), '切换到深色模式');
await click('[data-tab="timetable"]');
await shot('14-dark');
await click('[data-tab="me"]');
await click('[data-action="theme"]');
await sleep(300);

// ---------- 7. 工具弹层 ----------
await click('[data-tab="tools"]');
await click('[data-action="empty-room"]');
check(await evaluate(`document.querySelectorAll('.room-chip').length > 0`), '空教室给出结果');
await shot('15-empty-room');
await clickLast('[data-close]');
await sleep(300);
await click('[data-action="calendar"]');
check(await evaluate(`document.querySelectorAll('.cal-day').length === 42`), '校历渲染 42 格');
await shot('16-calendar');
await clickLast('[data-close]');
await sleep(300);
await click('[data-action="share"]');
const shareCode = await evaluate(`${LAST}.querySelector('[data-code]').value`);
check(shareCode.startsWith('ST1.'), '生成分享码');
await clickLast('[data-close]');
await sleep(300);
await click('[data-action="export"]');
check(await evaluate(`${LAST}.innerText.includes('JSON 备份')`), '导出面板可用');
await shot('17-export');
await clickLast('[data-close]');
await sleep(300);

// ---------- 8. 粘贴 CSV 导入 ----------
await click('[data-tab="timetable"]');
await click('[data-action="import"]');
await click('[data-source="paste"]');
const csv = '课程名,教师,教室,星期,节次,周次\n学术英语,李娜,外语楼203,周五,9-10节,1-8周\n量子力学导论,周瑜,理科楼502,周四,11-12节,1-8周';
await evaluate(`(() => { const ta = ${LAST}.querySelector('[data-paste]'); ta.value = ${JSON.stringify(csv)}; ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await clickLast('[data-parse]');
await sleep(600);
check(await evaluate(`document.querySelectorAll('.import-row').length === 2`), 'CSV 解析出 2 条课程');
await shot('18-csv-preview');
await clickLast('[data-import]');
await sleep(500);
check(await evaluate(`${LAST}.innerText.includes('导入成功')`), 'CSV 导入成功');
await clickLast('[data-finish]');
await sleep(400);
check(await evaluate(`document.body.innerText.includes('学术英语')`), '导入的课程出现在课表');

// ---------- 9. 周次切换 ----------
await click('[data-week="8"]');
check(await evaluate(`document.querySelector('.tt-summary .range').innerText.includes('第 8 周')`), '切换到第 8 周');
await click('[data-action="today"]');
await sleep(400);
check(await evaluate(`document.querySelector('.tt-summary .range').innerText.includes('第 7 周')`), '“今天”回到当前周');
const finalCount = (await storageCourses()).length;
console.log('课程条数:', finalCount);
await shot('19-final');

console.log('\nERRORS:', errors.length ? errors : 'none');
ws.close();
if (errors.length) process.exit(2);
