
import { coursesOnDay, periodTime, termProgress } from '../schedule.js';
import { store } from '../store.js';
import { icon, openSheet, toast, emptyState } from '../ui.js';
import {
  addDays, dayCN, diffDays, escapeHtml, fmtCN, fmtMD, parseISODate, startOfDay, toISODate, weekdayOf, WEEK_CN,
} from '../util.js';

export function topbarHtml(state) {
  const now = new Date();
  return `
    <div class="tb-row">
      <div class="tb-title">
        <h1>日程</h1>
        <div class="tb-sub">${fmtCN(now)} ${dayCN(weekdayOf(now))} · 今天的课与待办</div>
      </div>
      <div class="tb-actions">
        <button class="icon-btn" data-action="add-todo" title="新建待办">${icon('plus')}</button>
      </div>
    </div>`;
}

export function renderAgenda(state) {
  const now = new Date();
  const progress = termProgress(state.settings.termStart, state.settings.totalWeeks, now);
  const todayCourses = coursesOnDay(state.courses, progress.week, weekdayOf(now));

  const ss = state.settings.selfStudy || {};
  const ssDays = Array.isArray(ss.days) ? ss.days.map(Number) : [1, 2, 3, 4];
  function selfStudyFor(day) {
    if (!ss.enabled || !ss.start || !ss.end || ss.end <= ss.start) return null;
    return ssDays.includes(Number(day)) ? ss : null;
  }
  function courseTime(c) {
    const start = periodTime(state.settings.periods, c.start).start;
    const end = periodTime(state.settings.periods, c.end).end;
    return { start, end };
  }
  function overlaps(courses, cfg) {
    return courses.some((c) => {
      const t = courseTime(c);
      return t.start && t.end && t.start < cfg.end && cfg.start < t.end;
    });
  }
  function courseItem(c) {
    const t = courseTime(c);
    return `
      <div class="agenda-item" style="border-left-color:${c.color}" data-course="${c.id}">
        <div class="time">${escapeHtml(t.start)}<small>${escapeHtml(t.end)}</small></div>
        <div class="body">
          <b>${escapeHtml(c.name)}</b>
          <span>${escapeHtml([c.room, c.teacher].filter(Boolean).join(' · ') || '未填写地点')}</span>
        </div>
      </div>`;
  }
  function selfStudyItem(cfg) {
    return `
      <div class="agenda-item" style="border-left-color:${cfg.color || '#5c6bc0'}">
        <div class="time">${escapeHtml(cfg.start)}<small>${escapeHtml(cfg.end)}</small></div>
        <div class="body">
          <b>${escapeHtml(cfg.text || '晚自习')}</b>
          ${cfg.note ? `<span>${escapeHtml(cfg.note)}</span>` : ''}
        </div>
      </div>`;
  }

  const todos = [...state.todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return String(a.date).localeCompare(String(b.date));
  });
  const openTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);

  const todaySelfStudy = selfStudyFor(weekdayOf(now));
  const showTodaySelfStudy = todaySelfStudy && !overlaps(todayCourses, todaySelfStudy);
  const todayEntries = todayCourses.map((c) => ({
    key: courseTime(c).start || '99:99',
    html: courseItem(c),
  }));
  if (showTodaySelfStudy) {
    todayEntries.push({ key: todaySelfStudy.start, html: selfStudyItem(todaySelfStudy) });
  }
  todayEntries.sort((a, b) => a.key.localeCompare(b.key));
  const timeline = todayEntries.length
    ? todayEntries.map((e) => e.html).join('')
    : emptyState('calendar', '今天没有课', '好好休息，或者去日程里添加一个待办。');

  const todoHtml = todos.length
    ? todos.map((t) => `
      <div class="todo ${t.done ? 'done' : ''}" data-todo="${t.id}">
        <div class="checkbox">${icon('check')}</div>
        <div class="body">
          <b>${escapeHtml(t.title)}</b>
          <span>${escapeHtml(t.date)}${t.tag ? ` · ${escapeHtml(t.tag)}` : ''} · ${labelForDate(t.date)}</span>
        </div>
        <button class="del" data-del-todo="${t.id}" aria-label="删除待办">${icon('close')}</button>
      </div>`).join('')
    : `<div class="empty" style="padding:22px 10px">
        <p style="margin:0 0 10px">还没有待办，记下作业和考试吧</p>
        <button class="btn btn-sm btn-primary" data-action="add-todo">${icon('plus')}新建待办</button>
      </div>`;

  const upcoming = [];
  for (let i = 1; i <= 6; i += 1) {
    const d = addDays(now, i);
    const week = weekNumber(d, state.settings.termStart);
    if (week < 1 || week > state.settings.totalWeeks) continue;
    const list = coursesOnDay(state.courses, week, weekdayOf(d));
    const cfg = selfStudyFor(weekdayOf(d));
    const showSelfStudy = cfg && !overlaps(list, cfg);
    if (!list.length && !showSelfStudy) continue;

    const entries = list.map((c) => ({
      key: courseTime(c).start || '99:99',
      html: courseItem(c),
    }));
    if (showSelfStudy) entries.push({ key: cfg.start, html: selfStudyItem(cfg) });
    entries.sort((a, b) => a.key.localeCompare(b.key));

    const summary = [list.length ? `${list.length} 节课` : '', showSelfStudy ? '晚自习' : '']
      .filter(Boolean)
      .join(' + ');

    upcoming.push(`
      <div class="agenda-day">
        <div class="agenda-head"><b>${i === 1 ? '明天' : dayCN(weekdayOf(d))}</b><span>${fmtMD(d)} · 第 ${week} 周 · ${summary}</span></div>
        <div class="timeline">${entries.map((e) => e.html).join('')}</div>
      </div>`);
  }

  return `
    <div class="card" style="padding:14px 14px 6px">
      <div class="card-title">
        <span>今天 · 周${WEEK_CN[weekdayOf(now) - 1]}</span>
        <span class="hint">第 ${progress.week} 周 · 共 ${todayCourses.length} 节课${showTodaySelfStudy ? ' + 晚自习' : ''}</span>
      </div>
      <div class="timeline">${timeline}</div>
    </div>

    <div class="section-title">
      <span>待办事项</span>
      <span class="link" data-action="add-todo">+ 新建</span>
    </div>
    <div>${todoHtml}</div>
    ${openTodos.length + doneTodos.length ? `<div class="hint-text" style="margin:2px 4px 0">共 ${openTodos.length} 项待完成${doneTodos.length ? `，${doneTodos.length} 项已完成` : ''}</div>` : ''}

    ${upcoming.length ? `<div class="section-title"><span>接下来几天</span><span class="hint" style="font-weight:500;color:var(--muted);font-size:11.5px">未来 6 天</span></div>${upcoming.join('')}` : ''}`;
}

function weekNumber(date, termStart) {
  const start = parseISODate(termStart);
  if (!start) return 1;
  return Math.floor(diffDays(startOfDay(date), start) / 7) + 1;
}

function labelForDate(dateStr) {
  const target = parseISODate(dateStr);
  if (!target) return dateStr;
  const now = new Date();
  const diff = diffDays(startOfDay(target), startOfDay(now));
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 0) return `${diff} 天后`;
  return `${-diff} 天前`;
}

export function bindAgenda(root, ctx) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-action="add-todo"]');
    if (add) {
      openTodoSheet();
      return;
    }
    const del = e.target.closest('[data-del-todo]');
    if (del) {
      e.stopPropagation();
      store.removeTodo(del.dataset.delTodo);
      toast('已删除待办');
      return;
    }
    const todo = e.target.closest('[data-todo]');
    if (todo) {
      store.toggleTodo(todo.dataset.todo);
      return;
    }
    const course = e.target.closest('[data-course]');
    if (course) ctx.openCourse(course.dataset.course);
  });
}

export function openTodoSheet() {
  const today = toISODate(new Date());
  const sheet = openSheet({
    title: '新建待办',
    body: `
      <div class="field">
        <label>内容</label>
        <input class="input" data-field="title" placeholder="例如：提交数据结构实验报告" maxlength="60" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label>截止日期</label>
          <input class="input" type="date" data-field="date" value="${today}">
        </div>
        <div class="field">
          <label>标签</label>
          <input class="input" data-field="tag" placeholder="作业 / 考试" maxlength="8" list="todo-tags" autocomplete="off">
          <datalist id="todo-tags"><option value="作业"><option value="考试"><option value="实验"><option value="学习"><option value="其他"></datalist>
        </div>
      </div>`,
    foot: `<button class="btn btn-ghost" data-cancel>取消</button><button class="btn btn-primary" data-save>添加</button>`,
    onMount(api) {
      const title = api.query('[data-field="title"]');
      api.query('[data-cancel]').addEventListener('click', () => api.close());
      api.query('[data-save]').addEventListener('click', () => {
        const value = title.value.trim();
        if (!value) {
          toast('请填写待办内容');
          title.focus();
          return;
        }
        store.addTodo({
          title: value,
          date: api.query('[data-field="date"]').value || today,
          tag: api.query('[data-field="tag"]').value.trim(),
        });
        api.close();
        toast('已添加待办');
      });
      setTimeout(() => title.focus(), 260);
    },
  });
  return sheet;
}
