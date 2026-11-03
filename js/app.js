/* Built by Luoz1337 */

import { coursesOnDay, currentWeek, periodTime } from './schedule.js';
import { store } from './store.js';
import { icon, toast } from './ui.js';
import { clamp, parseTimeToMinutes, toISODate, weekdayOf } from './util.js';
import * as timetable from './views/timetable.js';
import * as agenda from './views/agenda.js';
import * as tools from './views/tools.js';
import * as me from './views/me.js';
import { openCourseDetail } from './views/detail.js';
import { openEditor } from './views/editor.js';
import { openImportWizard } from './views/import.js';
import { isNativeApp } from './install.js';

const topbar = document.getElementById('topbar');
const content = document.getElementById('content');
const tabbar = document.getElementById('tabbar');
const views = {
  timetable: document.getElementById('view-timetable'),
  agenda: document.getElementById('view-agenda'),
  tools: document.getElementById('view-tools'),
  me: document.getElementById('view-me'),
};

const ui = {
  tab: 'agenda',
  week: currentWeek(store.get().settings.termStart, store.get().settings.totalWeeks),
};

const TABS = [
  { id: 'agenda', label: '日程', icon: 'agenda' },
  { id: 'timetable', label: '课表', icon: 'calendar' },
  { id: 'tools', label: '工具', icon: 'grid' },
  { id: 'me', label: '我的', icon: 'user' },
];

const ctx = {
  getState: () => store.get(),
  getUi: () => ui,
  setWeek(week) {
    const total = Number(store.get().settings.totalWeeks) || 20;
    ui.week = clamp(Number(week) || 1, 1, total);
    render();
    centerActiveWeek();
  },
  openCourse(id) {
    openCourseDetail(id, { onChange: render });
  },
  openEditor(defaults = {}) {
    openEditor({ defaults, onSaved: render });
  },
  openImport() {
    openImportWizard();
  },
  openAgenda() {
    switchTab('agenda');
  },
  openSettings() {
    me.openSettingsSheet({
      onSettingsChanged: () => {
        const state = store.get();
        ui.week = currentWeek(state.settings.termStart, state.settings.totalWeeks);
        render();
      },
      startReminderLoop,
    });
  },
  startReminderLoop,
};

const tabbarHtml = `
  ${TABS.slice(0, 2).map((t) => tabHtml(t)).join('')}
  <button class="tab-add" data-action="add-course" aria-label="添加课程"><span class="circle">${icon('plus')}</span></button>
  ${TABS.slice(2).map((t) => tabHtml(t)).join('')}`;

function tabHtml(t) {
  return `<button class="tab" data-tab="${t.id}" aria-label="${t.label}">${icon(t.icon)}<span>${t.label}</span></button>`;
}

function applyTheme(theme) {
  let effective = theme;
  if (theme === 'auto') {
    effective = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = effective === 'dark' ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#101725' : '#3b6cff');
}

function renderTopbar(state) {
  if (ui.tab === 'timetable') topbar.innerHTML = timetable.topbarHtml(state, ui);
  else if (ui.tab === 'agenda') topbar.innerHTML = agenda.topbarHtml(state);
  else if (ui.tab === 'tools') topbar.innerHTML = tools.topbarHtml(state);
  else topbar.innerHTML = me.topbarHtml(state);
}

function renderTabbar() {
  tabbar.innerHTML = tabbarHtml;
  tabbar.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === ui.tab);
    btn.setAttribute('aria-current', btn.dataset.tab === ui.tab ? 'page' : 'false');
  });
}

function render() {
  const state = store.get();
  const total = Math.max(1, Number(state.settings.totalWeeks) || 20);
  ui.week = clamp(Number(ui.week) || 1, 1, total);
  applyTheme(state.settings.theme);
  document.body.dataset.tab = ui.tab;

  renderTopbar(state);
  renderTabbar();

  for (const [name, node] of Object.entries(views)) node.hidden = name !== ui.tab;
  const root = views[ui.tab];

  if (ui.tab === 'timetable') {
    root.innerHTML = timetable.renderTimetable(state, ui);
    timetable.bindTimetable(root, ctx);
  } else if (ui.tab === 'agenda') {
    root.innerHTML = agenda.renderAgenda(state);
    agenda.bindAgenda(root, ctx);
  } else if (ui.tab === 'tools') {
    root.innerHTML = tools.renderTools(state);
    tools.bindTools(root, ctx);
  } else {
    root.innerHTML = me.renderMe(state);
    me.bindMe(root, ctx);
  }
  centerActiveWeek();
}

function centerActiveWeek() {
  const strip = topbar.querySelector('#weekStrip');
  const active = strip?.querySelector('.week-pill.is-active');
  if (!strip || !active) return;
  strip.scrollLeft = Math.max(0, active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2);
}

function switchTab(tab) {
  if (!views[tab] || ui.tab === tab) return;
  ui.tab = tab;
  content.scrollTop = 0;
  render();
}


topbar.addEventListener('click', (e) => {
  const weekBtn = e.target.closest('[data-week]');
  if (weekBtn) {
    ctx.setWeek(Number(weekBtn.dataset.week));
    return;
  }
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  const action = actionBtn.dataset.action;
  if (action === 'today') {
    const current = currentWeek(store.get().settings.termStart, store.get().settings.totalWeeks);
    if (ui.week === current) {
      toast('已经是本周');
      content.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      ctx.setWeek(current);
      toast(`已回到第 ${current} 周`);
    }
  } else if (action === 'import') {
    openImportWizard();
  } else if (action === 'settings') {
    ctx.openSettings();
  } else if (action === 'add-todo') {
    agenda.openTodoSheet();
  }
});


tabbar.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab[data-tab]');
  if (tab) {
    switchTab(tab.dataset.tab);
    return;
  }
  const add = e.target.closest('[data-action="add-course"]');
  if (add) {
    const now = new Date();
    ctx.openEditor({
      day: weekdayOf(now),
      start: 1,
      end: 2,
      weeks: Array.from({ length: Math.min(16, store.get().settings.totalWeeks) }, (_, i) => i + 1),
    });
  }
});


document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (document.getElementById('layers').children.length) return;
  if (ui.tab !== 'timetable') return;
  if (e.key === 'ArrowLeft') ctx.setWeek(ui.week - 1);
  if (e.key === 'ArrowRight') ctx.setWeek(ui.week + 1);
});


let reminderTimer = null;

function startReminderLoop() {
  clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminders, 60_000);
  checkReminders();
}

function checkReminders() {
  const state = store.get();
  if (!state.settings.remind) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const now = new Date();
  const week = currentWeek(state.settings.termStart, state.settings.totalWeeks, now);
  const todays = coursesOnDay(state.courses, week, weekdayOf(now));
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const course of todays) {
    const t = periodTime(state.settings.periods, course.start);
    const startMin = parseTimeToMinutes(t.start);
    if (startMin == null) continue;
    const diff = startMin - minutes;
    if (diff <= 0 || diff > state.settings.remindBefore) continue;
    const key = `supertable.remind.${toISODate(now)}.${course.id}`;
    try {
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, '1');
    } catch {
    }
    new Notification('上课提醒', {
      body: `${course.name} · ${t.start}${course.room ? ` · ${course.room}` : ''}`,
      tag: key,
    });
  }
}


function syncNativeReminders() {
  const bridge = window.SuperTableAndroid;
  if (!bridge || typeof bridge.syncReminders !== 'function') return;
  const state = store.get();
  try {
    bridge.syncReminders(JSON.stringify({
      enabled: !!state.settings.remind,
      before: Number(state.settings.remindBefore) || 15,
      termStart: state.settings.termStart,
      periods: state.settings.periods,
      courses: state.courses.map((c) => ({
        name: c.name,
        room: c.room,
        teacher: c.teacher,
        day: c.day,
        start: c.start,
        end: c.end,
        weeks: c.weeks,
      })),
    }));
  } catch (err) {
    console.warn('提醒同步失败', err);
  }
}

store.subscribe(() => {
  render();
  syncNativeReminders();
});
render();
syncNativeReminders();
startReminderLoop();

if (!isNativeApp() && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW 注册失败', err));
  });
}

window.__SUPERTABLE__ = { store, ui, ctx };

window.__ST_HANDLE_BACK__ = () => {
  const layers = document.getElementById('layers');
  if (layers && layers.children.length) {
    const wrap = layers.lastElementChild;
    const close = wrap?.querySelector('.sheet-head [data-close]') || wrap?.querySelector('[data-close]');
    if (close) {
      close.click();
      return true;
    }
  }
  if (ui.tab !== 'timetable') {
    switchTab('timetable');
    return true;
  }
  return false;
};
