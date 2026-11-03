
import { coursesOnDay, formatWeeks, periodTime, termProgress, weekDates } from '../schedule.js';
import { store } from '../store.js';
import { icon, openSheet, toast, emptyState } from '../ui.js';
import {
  addDays, dayCN, diffDays, downloadText, escapeHtml, fmtCN, fmtMD, mondayOf, parseISODate, startOfDay,
  toISODate, weekdayOf, WEEK_CN,
} from '../util.js';
import { encodeShare, toCsv, toIcs } from '../importers.js';

export function topbarHtml(state) {
  const p = termProgress(state.settings.termStart, state.settings.totalWeeks);
  return `
    <div class="tb-row">
      <div class="tb-title">
        <h1>工具</h1>
        <div class="tb-sub">第 ${p.week} 周 · 学期进度 ${p.pct}%</div>
      </div>
      <div class="tb-actions">
        <button class="icon-btn" data-action="import" title="导入课表">${icon('upload')}</button>
        <button class="icon-btn" data-action="settings" title="学期设置">${icon('settings')}</button>
      </div>
    </div>`;
}

export function renderTools(state) {
  const p = termProgress(state.settings.termStart, state.settings.totalWeeks);
  const lessons = state.courses.length;
  const rooms = new Set(state.courses.map((c) => c.room).filter(Boolean));
  return `
    <div class="card">
      <div class="card-title"><span>学期进度</span><span class="hint">${escapeHtml(state.settings.school || '')}</span></div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
        <b style="font-size:26px;font-weight:700;color:var(--brand-ink)">${p.pct}%</b>
        <span style="font-size:12px;color:var(--muted)">第 ${p.week} / ${p.total} 周</span>
      </div>
      <div style="height:7px;border-radius:99px;background:var(--surface-3);overflow:hidden">
        <div style="height:100%;width:${p.pct}%;border-radius:99px;background:linear-gradient(90deg,#3b6cff,#6aa6ff)"></div>
      </div>
      <div class="hint-text" style="display:flex;justify-content:space-between">
        <span>${escapeHtml(state.settings.termStart)} 开学</span>
        <span>${lessons} 条课程安排 · ${rooms.size} 个教室</span>
      </div>
    </div>

    <div class="section-title">常用工具</div>
    <div class="tool-grid">
      <button class="tool" data-action="import">
        <span class="ic">${icon('upload')}</span>
        <b>导入课表</b>
        <span>教务系统 / CSV / ICS / 分享码</span>
      </button>
      <button class="tool accent" data-action="empty-room">
        <span class="ic">${icon('door')}</span>
        <b>空教室</b>
        <span>按课表推算某个时段空闲教室</span>
      </button>
      <button class="tool warm" data-action="calendar">
        <span class="ic">${icon('calendar')}</span>
        <b>校历</b>
        <span>月份视图，标注教学周</span>
      </button>
      <button class="tool" data-action="share">
        <span class="ic">${icon('share')}</span>
        <b>分享课表</b>
        <span>生成分享码，同学一键导入</span>
      </button>
      <button class="tool" data-action="export">
        <span class="ic">${icon('download')}</span>
        <b>导出课表</b>
        <span>CSV / ICS 日历 / JSON 备份</span>
      </button>
      <button class="tool" data-action="settings">
        <span class="ic">${icon('settings')}</span>
        <b>学期设置</b>
        <span>开学日期、周数、节次时间</span>
      </button>
    </div>

    <div class="section-title">小贴士</div>
    <div class="card" style="font-size:12px;line-height:1.9;color:var(--text-2)">
      <p style="margin:0 0 6px">· 课表支持左右滑动切换周次，点击空白格快速添加课程。</p>
      <p style="margin:0 0 6px">· 导入时选择“合并”可保留现有课程，并自动合并重复课程的周次。</p>
      <p style="margin:0">· 空教室结果只依据已录入课程推算，不代表学校全部教室的实时占用情况。</p>
    </div>`;
}

export function bindTools(root, ctx) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'import') ctx.openImport();
    else if (action === 'empty-room') openEmptyRoomSheet(store.get());
    else if (action === 'calendar') openCalendarSheet(store.get());
    else if (action === 'share') openShareSheet(store.get());
    else if (action === 'export') openExportSheet(store.get());
    else if (action === 'settings') ctx.openSettings();
  });
}


export function openEmptyRoomSheet(state) {
  const p = termProgress(state.settings.termStart, state.settings.totalWeeks);
  const rooms = [...new Set(state.courses.map((c) => c.room).filter(Boolean))];
  const maxPeriod = Math.max(12, state.settings.periods.length);

  const sheet = openSheet({
    title: '空教室',
    sub: `第 ${p.week} 周 · 基于已导入课表推算`,
    body: `
      <div class="notice warn">${icon('info')}<span>仅统计课表中出现过的教室，未包含学校全部教室，请以教务系统为准。</span></div>
      <div class="field-row">
        <div class="field">
          <label>星期</label>
          <select class="select" data-day>
            ${Array.from({ length: 7 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${d === weekdayOf(new Date()) ? 'selected' : ''}>周${WEEK_CN[d - 1]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>节次</label>
          <select class="select" data-period>
            ${Array.from({ length: maxPeriod }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>第 ${n} 节</option>`).join('')}
          </select>
        </div>
      </div>
      <div data-result></div>`,
    onMount(api) {
      const daySel = api.query('[data-day]');
      const periodSel = api.query('[data-period]');
      const result = api.query('[data-result]');

      const refresh = () => {
        const day = Number(daySel.value);
        const period = Number(periodSel.value);
        const busy = coursesOnDay(state.courses, p.week, day).filter((c) => c.start <= period && c.end >= period);
        const used = new Set(busy.map((c) => c.room).filter(Boolean));
        const free = rooms.filter((r) => !used.has(r));
        if (!rooms.length) {
          result.innerHTML = emptyState('door', '还没有教室数据', '导入课表后，这里会按课程地点推算空闲教室。');
          return;
        }
        result.innerHTML = `
          <div class="field-label" style="margin-top:6px">空闲（${free.length}）</div>
          ${free.length
            ? `<div class="room-result">${free.map((r) => `<div class="room-chip">${escapeHtml(r)}<small>空闲</small></div>`).join('')}</div>`
            : `<div class="hint-text">该时段课表中的教室都在使用中。</div>`}
          <div class="field-label" style="margin-top:16px">占用（${busy.length}）</div>
          ${busy.length
            ? `<div class="room-result">${busy.map((c) => `<div class="room-chip" style="opacity:.72">${escapeHtml(c.room || '未填地点')}<small>${escapeHtml(c.name)}</small></div>`).join('')}</div>`
            : `<div class="hint-text">该时段没有课程占用。</div>`}`;
      };

      daySel.addEventListener('change', refresh);
      periodSel.addEventListener('change', refresh);
      refresh();
    },
  });
  return sheet;
}


export function openCalendarSheet(state) {
  let cursor = new Date();
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  const sheet = openSheet({
    title: '校历',
    body: `<div data-cal></div>`,
    onMount(api) {
      const box = api.query('[data-cal]');
      const render = () => {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const first = new Date(year, month, 1);
        const startOffset = weekdayOf(first) - 1;
        const gridStart = addDays(first, -startOffset);
        const todayStr = toISODate(new Date());
        const cells = [];
        for (let i = 0; i < 42; i += 1) {
          const d = addDays(gridStart, i);
          const inMonth = d.getMonth() === month;
          const week = weekNumber(d, state.settings.termStart);
          const list = week >= 1 && week <= state.settings.totalWeeks ? coursesOnDay(state.courses, week, weekdayOf(d)) : [];
          cells.push(`
            <div class="cal-day ${inMonth ? '' : 'dim'} ${toISODate(d) === todayStr ? 'today' : ''}">
              <span>${d.getDate()}</span>
              <span class="wn">${week >= 1 && week <= state.settings.totalWeeks ? `${week}周` : ''}</span>
              ${list.length ? '<span class="dot"></span>' : ''}
            </div>`);
        }
        box.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <button class="icon-btn plain" data-prev aria-label="上个月">${icon('left')}</button>
            <b style="font-size:15px">${year} 年 ${month + 1} 月</b>
            <button class="icon-btn plain" data-next aria-label="下个月">${icon('right')}</button>
          </div>
          <div class="calendar-month">
            ${WEEK_CN.map((w) => `<div class="wd">${w}</div>`).join('')}
            ${cells.join('')}
          </div>
          <div class="hint-text" style="margin-top:10px">小字为教学周次，圆点表示当天有课。</div>`;
        box.querySelector('[data-prev]').addEventListener('click', () => {
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
          render();
        });
        box.querySelector('[data-next]').addEventListener('click', () => {
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
          render();
        });
      };
      render();
    },
  });
  return sheet;
}

function weekNumber(date, termStart) {
  const start = parseISODate(termStart);
  if (!start) return 1;
  return Math.floor(diffDays(startOfDay(date), start) / 7) + 1;
}


export function openShareSheet(state) {
  const code = encodeShare({
    name: `${state.settings.school || '我的'}课表`,
    termStart: state.settings.termStart,
    courses: state.courses,
  });
  const sheet = openSheet({
    title: '分享课表',
    sub: `共 ${state.courses.length} 条课程安排`,
    body: `
      <div class="notice">${icon('info')}<span>把分享码发给同学，对方在“导入 → 分享码”中粘贴即可导入，无需登录。</span></div>
      <div class="field">
        <label>分享码</label>
        <textarea class="textarea code-block" data-code readonly style="min-height:110px">${escapeHtml(code)}</textarea>
      </div>
      <div class="hint-text">分享码包含课程名称、教师、地点、时间与周次，不包含账号等个人信息。</div>`,
    foot: `<button class="btn btn-primary" data-copy>${icon('share')}复制分享码</button>`,
    onMount(api) {
      api.query('[data-copy]').addEventListener('click', async () => {
        const ok = await copy(api.query('[data-code]').value);
        toast(ok ? '分享码已复制' : '复制失败，请手动选择复制');
      });
    },
  });
  return sheet;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.querySelector('[data-code]');
    if (ta) {
      ta.select();
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    }
    return false;
  }
}


export function openExportSheet(state) {
  const sheet = openSheet({
    title: '导出课表',
    sub: `${state.courses.length} 条课程安排 · 学期 ${state.settings.termStart}`,
    body: `
      <div class="import-source">
        <button class="source-card" data-export="csv">
          <span class="ic">${icon('grid')}</span>
          <span class="tx"><b>CSV 表格</b><span>可用 Excel / WPS 打开，便于打印</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
        <button class="source-card" data-export="ics">
          <span class="ic">${icon('calendar')}</span>
          <span class="tx"><b>ICS 日历</b><span>导入系统日历，按周生成上课提醒</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
        <button class="source-card" data-export="json">
          <span class="ic">${icon('download')}</span>
          <span class="tx"><b>JSON 备份</b><span>完整备份课程、待办与设置，可换机恢复</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
      </div>
      <div class="field" style="margin-top:16px">
        <label>从备份恢复</label>
        <input class="input" type="file" accept=".json,application/json" data-import-file>
        <div class="hint-text">恢复会覆盖当前课程与待办，请先导出备份。</div>
      </div>`,
    onMount(api) {
      api.queryAll('[data-export]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.export;
          try {
            if (type === 'csv') {
              downloadText(`课表_${state.settings.termStart}.csv`, toCsv(state.courses), 'text/csv;charset=utf-8');
            } else if (type === 'ics') {
              downloadText(`课表_${state.settings.termStart}.ics`, toIcs(state.courses, state.settings), 'text/calendar;charset=utf-8');
            } else {
              downloadText(`课表备份_${toISODate(new Date())}.json`, store.exportJSON(), 'application/json;charset=utf-8');
            }
            toast('已开始下载');
          } catch (err) {
            toast(`导出失败：${err.message}`);
          }
        });
      });

      api.query('[data-import-file]').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const count = store.importJSON(text);
          api.close();
          toast(`已恢复 ${count} 条课程`);
        } catch (err) {
          toast(`恢复失败：${err.message}`);
        }
      });
    },
  });
  return sheet;
}

export { weekNumber };
