
import { defaultPeriods, defaultTermStart, makeCourse } from './schedule.js';
import { dedupe } from './importers.js';

const KEY = 'supertable.state.v1';
const VERSION = 1;

export function defaultSettings() {
  return {
    termStart: defaultTermStart(),
    totalWeeks: 20,
    periods: defaultPeriods(),
    school: '武汉纺织大学外经贸学院',
    loginUrl: 'http://jw.whcibe.com',
    nickname: '同学',
    theme: 'light',
    remind: false,
    remindBefore: 15,
    showWeekend: true,
    firstRunDone: false,
    selfStudy: {
      enabled: true,
      days: [1, 2, 3, 4], // 周一至周四
      start: '19:30',
      end: '21:30',
      text: '晚自习',
      note: '',
      color: '#5c6bc0',
    },
  };
}

function initialState() {
  return {
    version: VERSION,
    settings: defaultSettings(),
    courses: [],
    todos: [],
    meta: {
      lastImportAt: null,
      lastImportSource: null,
      onboarded: false,
      emptyStateMigrated: true,
    },
  };
}

function sanitizeCourse(raw) {
  if (!raw || !raw.name) return null;
  const c = makeCourse({
    ...raw,
    weeks: Array.isArray(raw.weeks) ? raw.weeks : [],
    start: Number(raw.start) || 1,
    end: Number(raw.end) || Number(raw.start) || 1,
    day: Number(raw.day) || 1,
  });
  if (!c.weeks.length) return null;
  return c;
}

export function loadState() {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return initialState();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') return initialState();
    const settings = { ...defaultSettings(), ...(data.settings || {}) };
    settings.selfStudy = {
      ...defaultSettings().selfStudy,
      ...(data.settings && data.settings.selfStudy ? data.settings.selfStudy : {}),
    };
    if (!Array.isArray(settings.selfStudy.days)) {
      settings.selfStudy.days = [1, 2, 3, 4];
    }
    if (!Array.isArray(settings.periods) || !settings.periods.length) settings.periods = defaultPeriods();

    let courses = Array.isArray(data.courses) ? data.courses.map(sanitizeCourse).filter(Boolean) : [];
    let todos = Array.isArray(data.todos) ? data.todos : [];
    const meta = { ...initialState().meta, ...(data.meta || {}) };
    if (!meta.emptyStateMigrated) {
      meta.emptyStateMigrated = true;
      if (meta.demo) {
        courses = [];
        todos = [];
      }
      delete meta.demo;
    }
    return {
      version: VERSION,
      settings,
      courses,
      todos,
      meta,
    };
  } catch {
    return initialState();
  }
}

class Store {
  constructor() {
    this.state = loadState();
    this.listeners = new Set();
    this.saveTimer = null;
  }

  get() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch (err) {
        console.error('[store listener]', err);
      }
    }
  }

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('保存失败：localStorage 可能已满', err);
    }
  }

  commit(mutator, { silent = false } = {}) {
    mutator(this.state);
    this.persist();
    if (!silent) this.emit();
  }

  setSettings(patch) {
    this.commit((s) => {
      s.settings = { ...s.settings, ...patch };
    });
  }

  addCourse(course) {
    const c = sanitizeCourse(course);
    if (!c) return null;
    this.commit((s) => {
      s.courses.push(c);
    });
    return c;
  }

  updateCourse(id, patch) {
    this.commit((s) => {
      const idx = s.courses.findIndex((c) => c.id === id);
      if (idx >= 0) s.courses[idx] = sanitizeCourse({ ...s.courses[idx], ...patch, id }) || s.courses[idx];
    });
  }

  removeCourse(id) {
    this.commit((s) => {
      s.courses = s.courses.filter((c) => c.id !== id);
    });
  }

  mergeCourses(list) {
    const count = { added: 0, merged: 0 };
    this.commit((s) => {
      const existing = new Map(s.courses.map((c) => [courseKey(c), c]));
      for (const c of list) {
        const key = courseKey(c);
        if (existing.has(key)) {
          const target = existing.get(key);
          const before = target.weeks.length;
          target.weeks = [...new Set([...target.weeks, ...c.weeks])].sort((a, b) => a - b);
          if (target.weeks.length !== before) count.merged += 1;
        } else {
          const added = sanitizeCourse({ ...c, id: undefined });
          if (added) {
            s.courses.push(added);
            existing.set(key, added);
            count.added += 1;
          }
        }
      }
      s.courses = dedupe(s.courses);
    });
    return count;
  }

  replaceCourses(list) {
    const clean = list.map((c) => sanitizeCourse(c)).filter(Boolean);
    this.commit((s) => {
      s.courses = dedupe(clean);
    });
    return clean.length;
  }

  addTodo(todo) {
    this.commit((s) => {
      s.todos.push({
        id: `td_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        title: todo.title,
        date: todo.date,
        tag: todo.tag || '',
        done: false,
      });
    });
  }

  toggleTodo(id) {
    this.commit((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (t) t.done = !t.done;
    });
  }

  removeTodo(id) {
    this.commit((s) => {
      s.todos = s.todos.filter((t) => t.id !== id);
    });
  }

  setMeta(patch) {
    this.commit((s) => {
      s.meta = { ...s.meta, ...patch };
    });
  }

  clearCourses() {
    this.commit((s) => {
      s.courses = [];
    });
  }

  resetAll() {
    this.state = initialState();
    this.commit(() => {});
  }

  exportJSON() {
    return JSON.stringify({
      app: 'SuperTable',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      settings: this.state.settings,
      courses: this.state.courses,
      todos: this.state.todos,
    }, null, 2);
  }

  importJSON(text) {
    const data = JSON.parse(text);
    const courses = (data.courses || []).map(sanitizeCourse).filter(Boolean);
    if (!courses.length) throw new Error('备份文件中没有课程');
    this.commit((s) => {
      if (data.settings) s.settings = { ...s.settings, ...data.settings };
      s.courses = dedupe(courses);
      if (Array.isArray(data.todos)) s.todos = data.todos;
    });
    return courses.length;
  }
}

export function courseKey(c) {
  return [c.name, c.teacher || '', c.room || '', c.day, c.start, c.end].join('|');
}

export const store = new Store();
