
import { expandWeeks, normalizeRecord, parsePeriodSpec, parseWeekday } from './schedule.js';

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };

function cnToNumber(text) {
  const s = String(text || '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (CN_NUM[s]) return CN_NUM[s];
  if (s.startsWith('十')) return 10 + (CN_NUM[s.slice(1)] || 0);
  return null;
}

function cellText(doc, cell) {
  const div = doc.createElement('div');
  div.innerHTML = String(cell.innerHTML || '').replace(/<br\s*\/?>/gi, '\n');
  return div.textContent || '';
}

function extractWeeks(text) {
  const m = text.match(
    /(\d{1,2}(?:\s*[-~—–至]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~—–至]\s*\d{1,2})?)*)\s*周(?:[（(]\s*([单双])\s*[）)])?/,
  );
  if (!m) return [];
  const spec = `${m[1].replace(/\s/g, '')}周${m[2] ? `(${m[2]})` : ''}`;
  return expandWeeks(spec);
}

function extractPeriods(text) {
  const range = text.match(/第?\s*(\d{1,2})\s*[-~—–至,，]\s*(\d{1,2})\s*节/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }
  const single = text.match(/第?\s*(\d{1,2})\s*节/);
  if (single) return { start: Number(single[1]), end: Number(single[1]) };
  return null;
}

function parseBlock(doc, block, fallbackDay, fallbackPeriods) {
  const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return null;
  const name = lines[0].replace(/^\d+[-、.]\s*/, '').slice(0, 40);
  if (!name || /^(节次|时间|星期|备注)$/.test(name)) return null;

  const joined = lines.join(' ');
  const weeks = extractWeeks(joined);
  const dayMatch = joined.match(/周([一二三四五六日天])/);
  const day = (dayMatch && parseWeekday(`周${dayMatch[1]}`)) || fallbackDay;
  const periods = extractPeriods(joined) || fallbackPeriods;

  const rest = lines.slice(1).filter((line) => !/周|节/.test(line) || /教|楼|室/.test(line));
  let teacher = '';
  let room = '';
  for (const line of rest) {
    if (!room && /[楼室馆场]|机房|实验|校区|教\d|---/.test(line)) room = line;
    else if (!teacher && line.length <= 12) teacher = line;
  }
  if (!room) room = rest.find((line) => line !== teacher) || '';

  if (!weeks.length || !day || !periods) return null;

  const res = normalizeRecord({
    name,
    teacher,
    room,
    day,
    start: periods.start,
    end: periods.end,
    weeks,
    source: 'zf-html',
  });
  return res.ok ? res.course : null;
}

function parseGridTable(doc) {
  const courses = [];
  const tables = [...doc.querySelectorAll('table')];
  for (const table of tables) {
    const rows = [...table.rows];
    if (rows.length < 3) continue;

    let headRow = null;
    const dayByCol = {};
    for (const row of rows) {
      const map = {};
      [...row.cells].forEach((cell, i) => {
        const text = (cell.textContent || '').replace(/\s/g, '');
        const m = text.match(/^(?:星期|周)([一二三四五六日天])$/);
        if (m) map[i] = parseWeekday(`周${m[1]}`);
      });
      if (Object.keys(map).length >= 5) {
        headRow = row;
        Object.assign(dayByCol, map);
        break;
      }
    }
    if (!headRow) continue;

    for (const row of rows.slice(rows.indexOf(headRow) + 1)) {
      const header = (row.cells[0]?.textContent || '').replace(/\s/g, '');
      let rowPeriods = parsePeriodSpec(header);
      if (!rowPeriods) {
        const nums = header.match(/[一二三四五六七八九十]+|\d+/g) || [];
        const values = nums.map(cnToNumber).filter((n) => n != null);
        if (values.length) rowPeriods = { start: Math.min(...values), end: Math.max(...values) };
      }
      if (!rowPeriods) continue;

      for (const [colText, day] of Object.entries(dayByCol)) {
        const cell = row.cells[Number(colText)];
        if (!cell) continue;
        const text = cellText(doc, cell).trim();
        if (!text || /^(无|空|—|-)$/.test(text)) continue;
        const blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
        for (const block of blocks) {
          const course = parseBlock(doc, block, day, rowPeriods);
          if (course) courses.push(course);
        }
      }
    }
    if (courses.length) break;
  }
  return { courses, skipped: [] };
}

function parseListTable(doc) {
  const courses = [];
  const skipped = [];
  for (const table of doc.querySelectorAll('table')) {
    const rows = [...table.rows];
    if (rows.length < 2) continue;
    const header = [...rows[0].cells].map((c) => (c.textContent || '').trim());
    const find = (re) => header.findIndex((h) => re.test(h));
    const idx = {
      name: find(/课程|名称/),
      teacher: find(/教师|老师/),
      room: find(/地点|教室|上课地点/),
      day: find(/星期|周几/),
      periods: find(/节次|课节/),
      weeks: find(/周次|周数/),
      time: find(/时间/),
    };
    if (idx.name < 0) continue;

    for (const row of rows.slice(1)) {
      const cells = [...row.cells].map((c) => (c.textContent || '').trim());
      const name = cells[idx.name];
      if (!name) continue;
      let day = idx.day >= 0 ? cells[idx.day] : '';
      let periods = idx.periods >= 0 ? cells[idx.periods] : '';
      let weeks = idx.weeks >= 0 ? cells[idx.weeks] : '';
      if (idx.time >= 0 && cells[idx.time]) {
        const t = cells[idx.time];
        const dm = t.match(/周([一二三四五六日天])/);
        if (!day && dm) day = `周${dm[1]}`;
        if (!periods) {
          const p = t.match(/第?\s*(\d{1,2})\s*[-~,，]\s*(\d{1,2})\s*节/);
          if (p) periods = `${p[1]}-${p[2]}节`;
        }
        if (!weeks) {
          const w = t.match(/[\d,\-，]+周(?:[（(][单双][）)])?/);
          if (w) weeks = w[0];
        }
      }
      const res = normalizeRecord({
        name,
        teacher: idx.teacher >= 0 ? cells[idx.teacher] : '',
        room: idx.room >= 0 ? cells[idx.room] : '',
        day,
        periods,
        weeks,
        source: 'html-table',
      });
      if (res.ok) courses.push(res.course);
      else skipped.push({ raw: { name, day, periods, weeks }, error: res.error });
    }
    if (courses.length) break;
  }
  return { courses, skipped };
}

export function parseHtmlTable(html) {
  if (!/课程|课表|星期|周次/.test(html)) {
    return { courses: [], skipped: [], error: '网页内容不像课表页面，请复制完整的课表源码（含 <table> 标签）' };
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const grid = parseGridTable(doc);
  const list = parseListTable(doc);
  const best = grid.courses.length >= list.courses.length ? grid : list;
  if (!best.courses.length) {
    return {
      courses: [],
      skipped: best.skipped || [],
      error: '没能识别出课程。请确认复制的是已登录的课表页面，或改用 CSV / 分享码导入。',
    };
  }
  const map = new Map();
  for (const c of best.courses) {
    const key = [c.name, c.teacher, c.room, c.day, c.start, c.end].join('|');
    if (!map.has(key)) map.set(key, c);
    else {
      const exist = map.get(key);
      exist.weeks = [...new Set([...exist.weeks, ...c.weeks])].sort((a, b) => a - b);
    }
  }
  return { courses: [...map.values()], skipped: best.skipped || [] };
}
