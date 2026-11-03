
import { coursesForWeek, layoutDay, termProgress, timeToRow, weekDates } from '../schedule.js';
import { escapeHtml, fmtCNRange, fmtMD, parseTimeToMinutes, weekdayOf, clamp, WEEK_CN } from '../util.js';
import { icon, toast, shade, hexAlpha } from '../ui.js';

const ROW_H = 56;

export function topbarHtml(state, ui) {
  const { settings } = state;
  const total = Math.max(1, Number(settings.totalWeeks) || 20);
  const progress = termProgress(settings.termStart, total);
  const sub = settings.school || '我的大学';

  const pills = Array.from({ length: total }, (_, i) => {
    const w = i + 1;
    const cls = [
      'week-pill',
      w === ui.week ? 'is-active' : '',
      w === progress.week ? 'is-today' : '',
    ].filter(Boolean).join(' ');
    return `<button class="${cls}" data-week="${w}" aria-label="第${w}周" aria-pressed="${w === ui.week}"><b>${w}</b>周</button>`;
  }).join('');

  return `
    <div class="tb-row">
      <div class="tb-title">
        <h1>课表 <span style="font-size:10.5px;font-weight:500;opacity:.72;letter-spacing:.6px">SUPERTABLE</span></h1>
        <div class="tb-sub">${escapeHtml(sub)}</div>
      </div>
      <div class="tb-actions">
        <button class="pill-btn" data-action="today" title="回到本周">${icon('calendar')}今天</button>
        <button class="icon-btn" data-action="import" title="导入课表">${icon('upload')}</button>
      </div>
    </div>
    <div class="week-strip" id="weekStrip">${pills}</div>`;
}

export function renderTimetable(state, ui) {
  const { settings, courses } = state;
  const total = Math.max(1, Number(settings.totalWeeks) || 20);
  const week = clamp(ui.week, 1, total);
  const progress = termProgress(settings.termStart, total);
  const dates = weekDates(week, settings.termStart);
  const list = coursesForWeek(courses, week);
  const todayDay = weekdayOf(new Date());
  const isTodayWeek = week === progress.week;

  const basePeriods = Math.max(1, Number(settings.periods.length) || 10);
  const maxPeriod = Math.max(basePeriods, ...courses.map((c) => Number(c.end) || 0));

  const periods = settings.periods.length
    ? settings.periods
    : Array.from({ length: maxPeriod }, (_, i) => ({ no: i + 1, start: '', end: '' }));

  const selfStudy = courses.length ? buildSelfStudy(settings, periods, maxPeriod) : null;
  const totalRows = selfStudy ? Math.max(maxPeriod, Math.ceil(selfStudy.endRow)) : maxPeriod;

  const headCells = dates.map((d, i) => {
    const day = i + 1;
    const cls = ['tt-day', isTodayWeek && day === todayDay ? 'is-today' : '', day >= 6 ? 'is-weekend' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}"><b>${WEEK_CN[i]}</b><span>${d ? fmtMD(d) : ''}</span></div>`;
  }).join('');

  const timeCells = Array.from({ length: totalRows }, (_, i) => {
    const no = i + 1;
    const p = periods.find((x) => Number(x.no) === no);
    if (p) return `<div class="tt-time"><b>${no}</b><span class="start">${escapeHtml(p.start || '')}</span><span class="end">${escapeHtml(p.end || '')}</span></div>`;
    return `<div class="tt-time tt-time-extra"><b></b><span></span><span></span></div>`;
  }).join('');

  let cells = '';
  for (let p = 1; p <= totalRows; p += 1) {
    for (let d = 1; d <= 7; d += 1) {
      const cls = ['tt-cell', d >= 6 ? 'weekend' : '', isTodayWeek && d === todayDay ? 'is-today' : ''].filter(Boolean).join(' ');
      cells += `<div class="${cls}" data-cell="1" data-day="${d}" data-period="${p}"></div>`;
    }
  }

  let selfStudyBlocks = '';
  if (selfStudy) {
    const colW = 100 / 7;
    for (const d of selfStudy.days) {
      const left = (d - 1) * colW + 1.2;
      const width = colW - 2.4;
      const top = selfStudy.startRow;
      const height = selfStudy.endRow - selfStudy.startRow;
      selfStudyBlocks += `
        <div class="selfstudy"
             style="top:calc(var(--row-h) * ${top} + 3px);height:calc(var(--row-h) * ${height} - 6px);left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:${hexAlpha(selfStudy.color, 0.08)};border-color:${hexAlpha(selfStudy.color, 0.5)}">
          <b>${escapeHtml(selfStudy.text)}</b>
          <span>${escapeHtml(selfStudy.note || selfStudy.timeLabel)}</span>
        </div>`;
    }
  }

  let blocks = '';
  for (let d = 1; d <= 7; d += 1) {
    const dayCourses = list.filter((c) => c.day === d);
    if (!dayCourses.length) continue;
    for (const item of layoutDay(dayCourses)) {
      const c = item.course;
      const span = Math.max(1, c.end - c.start + 1);
      const colW = 100 / 7;
      const laneW = colW / item.lanes;
      const left = (d - 1) * colW + item.lane * laneW + 1.2;
      const width = laneW - 2.4;
      const classes = [
        'course',
        span === 1 ? 'short' : '',
        span === 1 && item.lanes > 1 ? 'tiny' : '',
      ].filter(Boolean).join(' ');
      blocks += `
        <div class="${classes}" data-course="${c.id}" role="button" tabindex="0"
             aria-label="${escapeHtml(c.name)} ${c.start}-${c.end}节"
             style="top:calc(var(--row-h) * ${c.start - 1} + 3px);height:calc(var(--row-h) * ${span} - 6px);left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:linear-gradient(160deg, ${c.color}, ${shade(c.color, -16)})">
          <b>${escapeHtml(c.name)}</b>
          ${c.room ? `<div class="meta">${escapeHtml(c.room)}</div>` : ''}
          ${c.teacher && span >= 3 ? `<div class="meta teacher">${escapeHtml(c.teacher)}</div>` : ''}
        </div>`;
    }
  }

  const nowLine = isTodayWeek ? renderNowLine(periods) : '';

  const count = list.length;
  const courseNames = new Set(list.map((c) => c.name)).size;
  const emptyBanner = !courses.length
    ? `<div class="demo-banner empty-banner">${icon('info')}<span>还没有课表，导入本学期课表后开始使用。</span><button data-action="import">导入课表</button></div>`
    : '';

  return `
    ${emptyBanner}
    <div class="tt-summary">
      <span class="range">第 ${week} 周 · ${dates[0] ? fmtCNRange(dates[0], dates[6]) : '未设置学期'}</span>
      <div class="chips">
        <button class="mini-chip" data-action="today-list">${icon('agenda')}本周 ${count} 节 · ${courseNames} 门</button>
        <button class="mini-chip primary" data-action="add">${icon('plus')}添加</button>
      </div>
    </div>

    <div class="tt-wrap" id="ttWrap">
      <div class="tt-head">
        <div class="corner"></div>
        ${headCells}
      </div>
      <div class="tt-body">
        <div class="tt-times">${timeCells}</div>
        <div class="tt-grid" id="ttGrid">${cells}${selfStudyBlocks}${blocks}${nowLine}</div>
      </div>
    </div>

    <div class="tt-empty-hint">${count ? `本周共 ${count} 节课 · 点击课程查看详情，点击空白格快速添加` : '本周没有课程 · 点击任意空白格添加，或从教务系统导入'}</div>`;
}

function renderNowLine(periods) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  let top = null;
  let lastEnded = 0;
  for (const p of periods) {
    const s = parseTimeToMinutes(p.start);
    const e = parseTimeToMinutes(p.end);
    if (s == null || e == null) continue;
    if (minutes >= s && minutes <= e) {
      top = (Number(p.no) - 1 + (minutes - s) / Math.max(1, e - s)) * ROW_H;
      break;
    }
    if (minutes > e) lastEnded = Number(p.no);
  }
  if (top == null && lastEnded) top = lastEnded * ROW_H;
  if (top == null) return '';
  return `<div class="tt-now" style="top:calc(var(--row-h) * ${(top / ROW_H).toFixed(3)})"></div>`;
}

function buildSelfStudy(settings, periods, maxPeriod) {
  const ss = settings.selfStudy;
  if (!ss || !ss.enabled || !ss.start || !ss.end) return null;
  const days = Array.isArray(ss.days)
    ? ss.days.filter((d) => Number(d) >= 1 && Number(d) <= 7)
    : [1, 2, 3, 4];
  if (!days.length) return null;
  const startRow = timeToRow(ss.start, periods, maxPeriod);
  const endRow = timeToRow(ss.end, periods, maxPeriod);
  if (endRow <= startRow) return null;
  return {
    days,
    startRow,
    endRow,
    text: ss.text || '晚自习',
    note: ss.note || '',
    timeLabel: `${ss.start}-${ss.end}`,
    color: ss.color || '#5c6bc0',
  };
}

export function bindWeekStrip(topbar, ctx) {
  const strip = topbar.querySelector('#weekStrip');
  if (!strip) return;
  const active = strip.querySelector('.week-pill.is-active');
  if (active) {
    const left = active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2;
    strip.scrollLeft = Math.max(0, left);
  }
  strip.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-week]');
    if (!btn) return;
    ctx.setWeek(Number(btn.dataset.week));
  });
}

export function bindTimetable(root, ctx) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  root.addEventListener('click', (e) => {
    const course = e.target.closest('[data-course]');
    if (course) {
      ctx.openCourse(course.dataset.course);
      return;
    }
    if (e.target.closest('[data-action="add"]')) {
      ctx.openEditor({
        day: weekdayOf(new Date()),
        start: 1,
        end: 2,
        weeks: defaultWeeks(ctx.getState()),
      });
      return;
    }
    if (e.target.closest('[data-action="today-list"]')) {
      ctx.openAgenda?.();
      return;
    }
    if (e.target.closest('[data-action="import"]')) {
      ctx.openImport?.();
      return;
    }
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      ctx.openEditor({
        day: Number(cell.dataset.day),
        start: Number(cell.dataset.period),
        end: Number(cell.dataset.period),
        weeks: defaultWeeks(ctx.getState()),
      });
    }
  });

  let startX = 0;
  let startY = 0;
  let tracking = false;
  root.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !e.target.closest('#ttWrap')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const total = Number(ctx.getState().settings.totalWeeks) || 20;
    const next = clamp(ctx.getUi().week + (dx < 0 ? 1 : -1), 1, total);
    if (next !== ctx.getUi().week) {
      ctx.setWeek(next);
      toast(`第 ${next} 周`);
    }
  }, { passive: true });
}

function defaultWeeks(state) {
  const total = Number(state.settings.totalWeeks) || 20;
  const end = Math.min(16, total);
  return Array.from({ length: end }, (_, i) => i + 1);
}
