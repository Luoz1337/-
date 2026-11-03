
import {
  addDays, clamp, diffDays, mondayOf, minutesToHHMM, parseISODate, parseTimeToMinutes, startOfDay, toISODate, uid, WEEK_CN, dayCN,
} from './util.js';

export const PALETTE = [
  '#4a86e8', '#ff8a65', '#7e57c2', '#26a69a',
  '#ef5350', '#42a5f5', '#ffa726', '#66bb6a',
  '#ec407a', '#5c6bc0', '#8d6e63', '#29b6f6',
];

export const DEFAULT_PERIODS = [
  { no: 1, start: '08:15', end: '09:00' },
  { no: 2, start: '09:05', end: '09:50' },
  { no: 3, start: '10:10', end: '10:55' },
  { no: 4, start: '11:00', end: '11:45' },
  { no: 5, start: '13:30', end: '14:15' },
  { no: 6, start: '14:20', end: '15:05' },
  { no: 7, start: '15:25', end: '16:10' },
  { no: 8, start: '16:15', end: '17:00' },
  { no: 9, start: '17:45', end: '18:30' },
  { no: 10, start: '18:35', end: '19:20' },
];

export const MAX_WEEK = 30;

export function defaultPeriods() {
  return DEFAULT_PERIODS.map((p) => ({ ...p }));
}

export function periodTime(periods, no) {
  const list = Array.isArray(periods) && periods.length ? periods : DEFAULT_PERIODS;
  const hit = list.find((p) => Number(p.no) === Number(no));
  if (hit) return { start: hit.start, end: hit.end };
  const last = list[list.length - 1] || DEFAULT_PERIODS[0];
  const base = Math.max(1, Number(no) - Number(last.no));
  const startMin = parseTimeToMinutes(last.start);
  if (startMin == null) return { start: '', end: '' };
  const start = startMin + base * 55;
  return { start: minutesToHHMM(start), end: minutesToHHMM(start + 45) };
}

export function timeToRow(timeStr, periods, lastPeriodNo) {
  const m = parseTimeToMinutes(timeStr);
  if (m == null) return lastPeriodNo;
  const list = Array.isArray(periods) && periods.length ? periods : DEFAULT_PERIODS;
  const last = Math.max(1, Number(lastPeriodNo) || list.length);
  let lastEnd = null;
  for (let i = 1; i <= last; i += 1) {
    const p = list.find((x) => Number(x.no) === i);
    if (!p) continue;
    const s = parseTimeToMinutes(p.start);
    const e = parseTimeToMinutes(p.end);
    if (s == null || e == null) continue;
    if (m <= s) return i - 1;
    if (m <= e) return (i - 1) + (m - s) / Math.max(1, e - s);
    lastEnd = e;
  }
  const endMin = lastEnd == null ? 0 : lastEnd;
  if (m > endMin) return last + (m - endMin) / 45;
  return last;
}

export function currentWeek(termStart, totalWeeks = 20, today = new Date()) {
  const start = parseISODate(termStart);
  if (!start) return 1;
  const raw = Math.floor(diffDays(startOfDay(today), start) / 7) + 1;
  return clamp(raw, 1, Math.max(1, Number(totalWeeks) || 20));
}

export function dateOfWeekDay(week, day, termStart) {
  const start = parseISODate(termStart);
  if (!start) return null;
  return addDays(start, (Number(week) - 1) * 7 + (Number(day) - 1));
}

export function weekRange(week, termStart) {
  return {
    start: dateOfWeekDay(week, 1, termStart),
    end: dateOfWeekDay(week, 7, termStart),
  };
}

export function weekDates(week, termStart) {
  return Array.from({ length: 7 }, (_, i) => dateOfWeekDay(week, i + 1, termStart));
}

export function expandWeeks(spec, maxWeek = MAX_WEEK) {
  if (spec == null || spec === '') return [];
  if (Array.isArray(spec)) {
    return [...new Set(spec.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= maxWeek))]
      .sort((a, b) => a - b);
  }
  if (typeof spec === 'number') {
    return spec >= 1 && spec <= maxWeek ? [spec] : [];
  }
  let s = String(spec).trim();
  if (!s) return [];
  if (/每周|全周|全学期/.test(s)) return Array.from({ length: maxWeek }, (_, i) => i + 1);

  let parity = 0;
  if (/单周|[（(]单[）)]|单/.test(s)) parity = 1;
  if (/双周|[（(]双[）)]|双/.test(s)) parity = 2;

  s = s
    .replace(/第/g, '')
    .replace(/周/g, '')
    .replace(/[（）()\[\]【】]/g, '')
    .replace(/[单双]/g, '')
    .replace(/\s+/g, '');

  const tokens = s.split(/[,，、;；/]+/).filter(Boolean);
  const set = new Set();
  for (const token of tokens) {
    const range = token.match(/^(\d{1,2})\s*[-~—–至]\s*(\d{1,2})$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let w = a; w <= b; w += 1) if (w >= 1 && w <= maxWeek) set.add(w);
      continue;
    }
    const single = token.match(/^(\d{1,2})$/);
    if (single) {
      const w = Number(single[1]);
      if (w >= 1 && w <= maxWeek) set.add(w);
    }
  }
  let weeks = [...set].sort((a, b) => a - b);
  if (parity === 1) weeks = weeks.filter((w) => w % 2 === 1);
  if (parity === 2) weeks = weeks.filter((w) => w % 2 === 0);
  return weeks;
}

export function formatWeeks(weeks) {
  const arr = [...new Set((weeks || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
  if (!arr.length) return '未设置';
  const parts = [];
  let i = 0;
  while (i < arr.length) {
    let j = i;
    while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j += 1;
    if (j > i) {
      parts.push(`${arr[i]}-${arr[j]}周`);
      i = j + 1;
      continue;
    }
    let k = i;
    while (k + 1 < arr.length && arr[k + 1] === arr[k] + 2) k += 1;
    if (k - i >= 2) {
      parts.push(`${arr[i]}-${arr[k]}周(${arr[i] % 2 ? '单' : '双'})`);
      i = k + 1;
      continue;
    }
    parts.push(`${arr[i]}周`);
    i += 1;
  }
  return parts.join(',');
}

export function weekParity(weeks) {
  const arr = weeks || [];
  if (!arr.length) return 'all';
  if (arr.every((w) => w % 2 === 1)) return 'odd';
  if (arr.every((w) => w % 2 === 0)) return 'even';
  return 'all';
}

export function parsePeriodSpec(spec) {
  if (spec == null || spec === '') return null;
  if (typeof spec === 'number') return { start: spec, end: spec };
  if (Array.isArray(spec)) {
    const nums = spec.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!nums.length) return null;
    return { start: Math.min(...nums), end: Math.max(...nums) };
  }
  const s = String(spec)
    .replace(/第/g, '')
    .replace(/节/g, '')
    .replace(/[（）()\[\]【】]/g, '')
    .replace(/\s+/g, '');
  if (!s) return null;
  const range = s.match(/^(\d{1,2})\s*[-~—–至]\s*(\d{1,2})$/);
  if (range) {
    let a = Number(range[1]);
    let b = Number(range[2]);
    if (a > b) [a, b] = [b, a];
    return { start: clamp(a, 1, 20), end: clamp(b, 1, 20) };
  }
  const nums = s.split(/[,，、;；]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length) return { start: Math.min(...nums), end: Math.max(...nums) };
  const single = s.match(/^(\d{1,2})$/);
  if (single) return { start: Number(single[1]), end: Number(single[1]) };
  return null;
}

export function formatPeriodsRange(start, end) {
  const a = Number(start);
  const b = Number(end ?? start);
  if (!Number.isFinite(a)) return '未设置';
  return a === b ? `第${a}节` : `第${a}-${b}节`;
}

export function periodSpan(start, end) {
  return Math.max(0, Number(end ?? start) - Number(start ?? 1) + 1);
}

const CN_DAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

export function parseWeekday(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const n = Number(value);
    return n >= 1 && n <= 7 ? n : null;
  }
  const s = String(value).trim();
  const cn = s.replace(/[周星期]/g, '');
  if (CN_DAY[cn]) return CN_DAY[cn];
  const map = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  const key = s.slice(0, 3).toLowerCase();
  if (map[key]) return map[key];
  const n = Number(s);
  return n >= 1 && n <= 7 ? n : null;
}

export function colorForName(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) % 100000;
  return PALETTE[hash % PALETTE.length];
}

export function makeCourse(partial = {}) {
  return {
    id: partial.id || uid('course'),
    name: partial.name || '未命名课程',
    teacher: partial.teacher || '',
    room: partial.room || '',
    day: Number(partial.day) || 1,
    start: Number(partial.start) || 1,
    end: Number(partial.end ?? partial.start) || 1,
    weeks: expandWeeks(partial.weeks ?? []),
    color: partial.color || colorForName(partial.name),
    note: partial.note || '',
    source: partial.source || 'manual',
    createdAt: partial.createdAt || Date.now(),
  };
}

export function normalizeRecord(raw = {}) {
  const name = String(raw.name ?? raw.kcmc ?? raw.courseName ?? raw.title ?? '').trim();
  if (!name) return { ok: false, error: '缺少课程名称', raw };

  const day = parseWeekday(raw.day ?? raw.xqj ?? raw.weekday ?? raw.dayOfWeek);
  if (!day) return { ok: false, error: `无法识别星期：${raw.day ?? raw.xqj ?? ''}`, raw };

  const periodSpec = raw.periods ?? raw.jcs ?? raw.jc ?? raw.classTime ?? raw.period;
  let period = null;
  if (raw.start != null && raw.end != null) {
    period = { start: Number(raw.start), end: Number(raw.end) };
  } else if (periodSpec && typeof periodSpec === 'object' && periodSpec.start != null) {
    period = {
      start: Number(periodSpec.start),
      end: Number(periodSpec.end ?? periodSpec.start),
    };
  } else {
    period = parsePeriodSpec(periodSpec);
  }
  if (!period || !Number.isFinite(period.start) || !Number.isFinite(period.end)) {
    return { ok: false, error: `无法识别节次：${periodSpec ?? ''}`, raw };
  }

  const weeksSpec = raw.weeks ?? raw.zcd ?? raw.weekDescription ?? raw.week;
  const weeks = expandWeeks(weeksSpec);
  if (!weeks.length) return { ok: false, error: `无法识别周次：${weeksSpec ?? ''}`, raw };

  return {
    ok: true,
    course: makeCourse({
      name,
      teacher: raw.teacher ?? raw.xm ?? raw.teacherName ?? '',
      room: raw.room ?? raw.cdmc ?? raw.classroomName ?? raw.location ?? '',
      day,
      start: clamp(period.start, 1, 20),
      end: clamp(period.end, 1, 20),
      weeks,
      color: raw.color,
      note: raw.note ?? raw.remark ?? '',
      source: raw.source || 'import',
    }),
  };
}

export function coursesForWeek(courses, week) {
  return (courses || [])
    .filter((c) => Array.isArray(c.weeks) && c.weeks.includes(Number(week)))
    .slice()
    .sort((a, b) => a.day - b.day || a.start - b.start || a.name.localeCompare(b.name));
}

export function coursesOnDay(courses, week, day) {
  return coursesForWeek(courses, week).filter((c) => c.day === Number(day));
}

export function findConflicts(candidate, courses, { ignoreId = null } = {}) {
  if (!candidate) return [];
  const weeks = new Set(candidate.weeks || []);
  return (courses || []).filter((c) => {
    if (c.id === candidate.id || c.id === ignoreId) return false;
    if (c.day !== Number(candidate.day)) return false;
    if (!(c.weeks || []).some((w) => weeks.has(w))) return false;
    return Number(c.start) <= Number(candidate.end) && Number(candidate.start) <= Number(c.end);
  });
}

export function layoutDay(records) {
  const sorted = [...(records || [])].sort((a, b) => a.start - b.start || a.end - b.end);
  const result = [];
  let group = [];
  let groupEnd = -1;

  const flush = () => {
    if (!group.length) return;
    const laneEnds = [];
    const placed = [];
    for (const rec of group) {
      let lane = laneEnds.findIndex((end) => end < rec.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(rec.end);
      } else {
        laneEnds[lane] = rec.end;
      }
      placed.push({ course: rec, lane });
    }
    const lanes = Math.max(1, laneEnds.length);
    for (const item of placed) result.push({ ...item, lanes });
    group = [];
    groupEnd = -1;
  };

  for (const rec of sorted) {
    if (group.length && rec.start > groupEnd) flush();
    group.push(rec);
    groupEnd = Math.max(groupEnd, rec.end);
  }
  flush();
  return result;
}

export function termProgress(termStart, totalWeeks, today = new Date()) {
  const total = Math.max(1, Number(totalWeeks) || 20);
  const week = currentWeek(termStart, total, today);
  const start = parseISODate(termStart);
  const dayIndex = start ? diffDays(startOfDay(today), start) : 0;
  const pct = clamp(Math.round(((dayIndex + 1) / (total * 7)) * 100), 0, 100);
  return { week, total, pct, started: dayIndex >= 0, finished: dayIndex >= total * 7 };
}

export function semesterLabel(termStart) {
  const d = parseISODate(termStart);
  if (!d) return '';
  const year = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  const term = d.getMonth() >= 7 ? '秋' : '春';
  return `${year}-${year + 1} 学年 · ${term}季学期`;
}

export function defaultTermStart(today = new Date()) {
  return '2026-09-07';
}

export function makeWeeksAll(totalWeeks = 20) {
  return Array.from({ length: totalWeeks }, (_, i) => i + 1);
}

export { WEEK_CN, dayCN };
