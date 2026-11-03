
import { dateOfWeekDay, expandWeeks, makeCourse, normalizeRecord, parsePeriodSpec, parseWeekday } from './schedule.js';
import { dayCN, pad2, parseISODate, parseTimeToMinutes, toISODate } from './util.js';

export const ADAPTERS = [
  {
    id: 'zfsoft',
    name: '正方教务系统（新版）',
    desc: '正方 jwglxt / V9，自动获取公钥加密密码并抓取课表',
    tag: '推荐',
  },
  {
    id: 'zfsoft-old',
    name: '正方教务系统（旧版）',
    desc: 'ASP.NET 旧版页面，支持验证码，返回页面解析',
  },
  {
    id: 'custom',
    name: '自定义课表接口',
    desc: '学校开放接口 / 自建代理，返回 JSON 课表',
  },
];

const pick = (...values) => values.find((v) => v !== undefined && v !== null && v !== '');

function pickRecord(item) {
  if (!item || typeof item !== 'object') return null;
  const jcRange = item.qsjs && item.jsjs ? `${item.qsjs}-${item.jsjs}` : undefined;
  return {
    name: pick(item.kcmc, item.courseName, item.name, item.title, item['课程名称'], item['课程名'], item['课程']),
    teacher: pick(item.xm, item.teacherName, item.teacher, item.jsxm, item['教师'], item['老师']),
    room: pick(item.cdmc, item.classroomName, item.room, item.jxdd, item.location, item['上课地点'], item['教室'], item['地点']),
    day: pick(item.xqj, item.dayOfWeek, item.weekday, item.day, item['星期'], item['周几']),
    periods: pick(item.jcs, item.classTime, item.jc, jcRange, item.period, item['节次'], item['上课节次']),
    weeks: pick(item.zcd, item.weekDescription, item.weeks, item.zcmc, item['周次'], item['上课周次']),
    note: pick(item.kcbz, item.note, item.remark, item['备注'], ''),
  };
}

function normalizeAll(records, source) {
  const courses = [];
  const skipped = [];
  for (const rec of records) {
    if (!rec) continue;
    const res = normalizeRecord({ ...rec, source });
    if (res.ok) courses.push(res.course);
    else skipped.push({ raw: rec, error: res.error });
  }
  return { courses: dedupe(courses), skipped };
}

export function dedupe(courses) {
  const map = new Map();
  for (const c of courses) {
    const key = [c.name, c.teacher, c.room, c.day, c.start, c.end].join('|');
    if (!map.has(key)) {
      map.set(key, { ...c, weeks: [...c.weeks] });
    } else {
      const exist = map.get(key);
      exist.weeks = [...new Set([...exist.weeks, ...c.weeks])].sort((a, b) => a - b);
    }
  }
  return [...map.values()];
}

export function parseZfkb(payload) {
  const list = Array.isArray(payload)
    ? payload
    : pick(payload?.kbList, payload?.data?.kbList, payload?.data, payload?.rows, payload?.items, []);
  if (!Array.isArray(list)) return { courses: [], skipped: [], error: '返回数据不是课表数组' };
  const records = list.map(pickRecord).filter(Boolean);
  return normalizeAll(records, 'zfsoft');
}

export function parseQzkb(payload) {
  const list = Array.isArray(payload)
    ? payload
    : pick(payload?.data, payload?.items, payload?.rows, payload?.kbList, []);
  if (!Array.isArray(list)) return { courses: [], skipped: [], error: '返回数据不是课表数组' };
  return normalizeAll(list.map(pickRecord).filter(Boolean), 'qzsoft');
}

export function parseGenericJson(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch (err) {
    return { courses: [], skipped: [], error: `JSON 解析失败：${err.message}` };
  }
  const asZf = parseZfkb(data);
  if (asZf.courses.length) return asZf;
  const asQz = parseQzkb(data);
  if (asQz.courses.length) return asQz;
  return { courses: [], skipped: asQz.skipped || [], error: '未在 JSON 中找到课表数据（支持 kbList / data / rows 等字段）' };
}


export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

const CSV_ALIASES = {
  name: ['课程名', '课程名称', '课程', '名称', 'name', 'course', 'kcmc'],
  teacher: ['教师', '老师', '任课教师', '授课教师', 'teacher', 'xm'],
  room: ['教室', '上课地点', '地点', '教室名称', 'room', 'location', 'cdmc'],
  day: ['星期', '周几', '上课星期', '星期几', 'day', 'weekday'],
  periods: ['节次', '上课节次', '时间', '课节', 'period', 'periods'],
  weeks: ['周次', '上课周次', '周数', 'weeks', 'zcd'],
  note: ['备注', 'note', 'remark'],
};

function mapHeader(header) {
  const index = {};
  header.forEach((cell, i) => {
    const text = String(cell).toLowerCase().replace(/\s/g, '');
    for (const [key, aliases] of Object.entries(CSV_ALIASES)) {
      if (index[key] !== undefined) continue;
      if (aliases.some((a) => text === a.toLowerCase() || text.includes(a.toLowerCase()))) index[key] = i;
    }
  });
  return index;
}

export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { courses: [], skipped: [], error: '文件是空的' };
  const header = rows[0];
  const index = mapHeader(header);
  const hasHeader = index.name !== undefined && (index.day !== undefined || index.periods !== undefined || index.weeks !== undefined);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const map = hasHeader
    ? index
    : { name: 0, teacher: 1, room: 2, day: 3, periods: 4, weeks: 5, note: 6 };

  const records = dataRows.map((r) => ({
    name: r[map.name],
    teacher: map.teacher != null ? r[map.teacher] : '',
    room: map.room != null ? r[map.room] : '',
    day: r[map.day],
    periods: r[map.periods],
    weeks: r[map.weeks],
    note: map.note != null ? r[map.note] : '',
  })).filter((r) => r.name && String(r.name).trim());

  if (!records.length) {
    return { courses: [], skipped: [], error: '没有解析到课程行。表头需包含“课程名/星期/节次/周次”。' };
  }
  return normalizeAll(records, 'csv');
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(courses) {
  const header = ['课程名', '教师', '教室', '星期', '节次', '周次', '备注'];
  const lines = [header.join(',')];
  for (const c of courses || []) {
    lines.push([
      c.name,
      c.teacher,
      c.room,
      dayCN(c.day),
      c.start === c.end ? `第${c.start}节` : `第${c.start}-${c.end}节`,
      formatWeeksPlain(c.weeks),
      c.note,
    ].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

function formatWeeksPlain(weeks) {
  const arr = [...new Set(weeks || [])].sort((a, b) => a - b);
  if (!arr.length) return '';
  return `${arr[0]}-${arr[arr.length - 1]}周`;
}


function icsUnescape(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseIcs(text) {
  const unfolded = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const records = [];
  for (const block of blocks) {
    const get = (key) => {
      const m = block.match(new RegExp(`^${key}[^:\\n]*:(.*)$`, 'mi'));
      return m ? icsUnescape(m[1]).trim() : '';
    };
    const summary = get('SUMMARY');
    const location = get('LOCATION');
    const description = get('DESCRIPTION');
    const dtstart = get('DTSTART');
    if (!summary) continue;

    let day = null;
    const dm = dtstart.match(/(\d{4})(\d{2})(\d{2})/);
    if (dm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
      day = d.getDay() === 0 ? 7 : d.getDay();
    }

    let weeks = null;
    let periods = null;
    let teacher = '';
    for (const line of description.split('\n')) {
      const m = line.match(/^\s*([^:：]+)[:：]\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const value = m[2].trim();
      if (/周次|weeks?/i.test(key)) weeks = value;
      else if (/节次|period/i.test(key)) periods = value;
      else if (/教师|老师|teacher/i.test(key)) teacher = value;
    }
    if (!weeks) weeks = get('X-SUPERTABLE-WEEKS') || '1-20周';
    if (!periods) periods = get('X-SUPERTABLE-PERIODS') || '1-2节';

    records.push({
      name: summary,
      teacher,
      room: location,
      day,
      periods,
      weeks,
    });
  }
  if (!records.length) return { courses: [], skipped: [], error: '没有找到 VEVENT 事件' };
  return normalizeAll(records, 'ics');
}

export function toIcs(courses, { termStart, periods = [] } = {}) {
  const start = parseISODate(termStart);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SuperTable//Course Schedule//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:课表 SuperTable',
  ];
  if (!start) return `${lines.join('\r\n')}\r\nEND:VCALENDAR`;

  const timeOf = (no) => {
    const hit = periods.find((p) => Number(p.no) === Number(no));
    return hit ? hit : { start: '08:00', end: '08:45' };
  };

  for (const c of courses || []) {
    for (const week of [...new Set(c.weeks || [])].sort((a, b) => a - b)) {
      const date = dateOfWeekDay(week, c.day, start);
      if (!date) continue;
      const t1 = timeOf(c.start);
      const t2 = timeOf(c.end);
      const ds = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${String(t1.start).replace(':', '')}00`;
      const de = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${String(t2.end).replace(':', '')}00`;
      const desc = [
        c.teacher ? `教师: ${c.teacher}` : '',
        `节次: ${c.start === c.end ? `第${c.start}节` : `第${c.start}-${c.end}节`}`,
        `周次: ${formatWeeksPlain(c.weeks)}`,
        c.note ? `备注: ${c.note}` : '',
      ].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${c.id}-w${week}@supertable`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${ds}`,
        `DTEND:${de}`,
        `SUMMARY:${escapeIcs(c.name)}`,
        c.room ? `LOCATION:${escapeIcs(c.room)}` : '',
        `DESCRIPTION:${escapeIcs(desc)}`,
        `X-SUPERTABLE-WEEKS:${formatWeeksPlain(c.weeks)}`,
        `X-SUPERTABLE-PERIODS:${c.start === c.end ? `第${c.start}节` : `第${c.start}-${c.end}节`}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.filter((l) => l !== '').join('\r\n');
}

function escapeIcs(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}


function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare({ name = '我的课表', termStart = '', courses = [] }) {
  const payload = {
    v: 1,
    n: name,
    t: termStart,
    c: courses.map((c) => ({
      n: c.name, t: c.teacher, r: c.room, d: c.day, s: c.start, e: c.end, w: c.weeks, k: c.color,
    })),
  };
  return `ST1.${b64encodeUtf8(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeShare(code) {
  const text = String(code || '').trim();
  if (!text.startsWith('ST1.')) {
    return { courses: [], skipped: [], error: '分享码格式不正确（应以 ST1. 开头）' };
  }
  try {
    let b64 = text.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(b64decodeUtf8(b64));
    if (!Array.isArray(payload.c)) throw new Error('缺少课程数据');
    const courses = payload.c.map((x) => makeCourse({
      name: x.n, teacher: x.t, room: x.r, day: x.d, start: x.s, end: x.e,
      weeks: expandWeeks(x.w), color: x.k, source: 'share',
    })).filter((c) => c.weeks.length && c.name);
    return { courses, skipped: [], meta: { name: payload.n, termStart: payload.t } };
  } catch (err) {
    return { courses: [], skipped: [], error: `分享码解析失败：${err.message}` };
  }
}


export function detectAndParse(text) {
  const raw = String(text || '').trim();
  if (!raw) return { courses: [], skipped: [], error: '内容为空' };
  if (raw.startsWith('ST1.')) return decodeShare(raw);
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const res = parseGenericJson(raw);
    return { ...res, format: 'json' };
  }
  if (/BEGIN:VCALENDAR/i.test(raw)) return { ...parseIcs(raw), format: 'ics' };
  if (/<table|<html|<tr/i.test(raw)) {
    return { courses: [], skipped: [], error: '这是网页内容，请在导入向导中使用“粘贴课表网页”解析', format: 'html' };
  }
  return { ...parseCsv(raw), format: 'csv' };
}


export function describeCourse(course, periods = []) {
  const span = course.start === course.end
    ? `第${course.start}节`
    : `第${course.start}-${course.end}节`;
  const first = periods.find((p) => Number(p.no) === Number(course.start));
  const last = periods.find((p) => Number(p.no) === Number(course.end));
  const time = first && last ? `${first.start}-${last.end}` : '';
  return { span, time, weeks: formatWeeksPlain(course.weeks) };
}

export function weekOverlap(a, b) {
  const set = new Set(a || []);
  return (b || []).some((w) => set.has(w));
}

export { parseTimeToMinutes, toISODate };
