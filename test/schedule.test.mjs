import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentWeek, dateOfWeekDay, expandWeeks, formatWeeks, findConflicts, layoutDay,
  normalizeRecord, parsePeriodSpec, parseWeekday, periodTime, termProgress, coursesForWeek,
  timeToRow, defaultTermStart, DEFAULT_PERIODS,
} from '../js/schedule.js';
import { toISODate } from '../js/util.js';

test('expandWeeks 支持区间、单双周与逗号分段', () => {
  assert.deepEqual(expandWeeks('1-4周'), [1, 2, 3, 4]);
  assert.deepEqual(expandWeeks('1-8周(单)'), [1, 3, 5, 7]);
  assert.deepEqual(expandWeeks('2-10周(双)'), [2, 4, 6, 8, 10]);
  assert.deepEqual(expandWeeks('1-3,6,8-9周'), [1, 2, 3, 6, 8, 9]);
  assert.deepEqual(expandWeeks('第1-2周'), [1, 2]);
  assert.deepEqual(expandWeeks([3, 1, 3, 99]), [1, 3]);
  assert.deepEqual(expandWeeks(''), []);
  assert.deepEqual(expandWeeks('1-4周', 3), [1, 2, 3]);
});

test('formatWeeks 反向格式化', () => {
  assert.equal(formatWeeks([1, 2, 3, 4]), '1-4周');
  assert.equal(formatWeeks([1, 3, 5, 7]), '1-7周(单)');
  assert.equal(formatWeeks([2, 4, 6]), '2-6周(双)');
  assert.equal(formatWeeks([1, 3, 5, 9]), '1-5周(单),9周');
  assert.equal(formatWeeks([]), '未设置');
});

test('节次与星期解析', () => {
  assert.deepEqual(parsePeriodSpec('1-2节'), { start: 1, end: 2 });
  assert.deepEqual(parsePeriodSpec('第3-4节'), { start: 3, end: 4 });
  assert.deepEqual(parsePeriodSpec('5'), { start: 5, end: 5 });
  assert.deepEqual(parsePeriodSpec('1,2,3'), { start: 1, end: 3 });
  assert.equal(parseWeekday('周一'), 1);
  assert.equal(parseWeekday('星期三'), 3);
  assert.equal(parseWeekday('日'), 7);
  assert.equal(parseWeekday('5'), 5);
  assert.equal(parseWeekday('Mon'), 1);
  assert.equal(parseWeekday('foo'), null);
});

test('周次与日期换算', () => {
  const termStart = '2025-09-01'; // 周一
  assert.equal(toISODate(dateOfWeekDay(1, 1, termStart)), '2025-09-01');
  assert.equal(toISODate(dateOfWeekDay(1, 7, termStart)), '2025-09-07');
  assert.equal(toISODate(dateOfWeekDay(2, 3, termStart)), '2025-09-10');
  assert.equal(currentWeek(termStart, 20, new Date(2025, 8, 1)), 1);
  assert.equal(currentWeek(termStart, 20, new Date(2025, 8, 7)), 1);
  assert.equal(currentWeek(termStart, 20, new Date(2025, 8, 8)), 2);
  assert.equal(currentWeek(termStart, 20, new Date(2025, 0, 1)), 1);
  assert.equal(currentWeek(termStart, 20, new Date(2026, 5, 1)), 20);
});

test('节次时间回退', () => {
  const periods = [
    { no: 1, start: '08:00', end: '08:45' },
    { no: 2, start: '08:55', end: '09:40' },
  ];
  assert.deepEqual(periodTime(periods, 2), { start: '08:55', end: '09:40' });
  const extra = periodTime(periods, 3);
  assert.match(extra.start, /^\d{2}:\d{2}$/);
});

test('冲突检测同时考虑周次与节次', () => {
  const a = { id: 'a', name: '高数', day: 1, start: 1, end: 2, weeks: [1, 2, 3] };
  const b = { id: 'b', name: '英语', day: 1, start: 2, end: 3, weeks: [3, 4] };
  const c = { id: 'c', name: '物理', day: 1, start: 2, end: 3, weeks: [5, 6] };
  const hits = findConflicts(b, [a, c]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'a');
  assert.equal(findConflicts(b, [a, c], { ignoreId: 'a' }).length, 0);
});

test('同一天重叠课程分车道布局', () => {
  const items = [
    { id: 'a', start: 1, end: 2 },
    { id: 'b', start: 1, end: 2 },
    { id: 'c', start: 3, end: 4 },
  ];
  const laid = layoutDay(items);
  const byId = Object.fromEntries(laid.map((x) => [x.course.id, x]));
  assert.equal(byId.a.lanes, 2);
  assert.equal(byId.b.lanes, 2);
  assert.notEqual(byId.a.lane, byId.b.lane);
  assert.equal(byId.c.lanes, 1);
});

test('normalizeRecord 校验必填字段', () => {
  const ok = normalizeRecord({ name: '高等数学', day: '周一', periods: '1-2节', weeks: '1-8周(单)' });
  assert.equal(ok.ok, true);
  assert.equal(ok.course.day, 1);
  assert.deepEqual(ok.course.weeks, [1, 3, 5, 7]);

  assert.equal(normalizeRecord({ day: 1, periods: '1-2', weeks: '1-8' }).ok, false);
  assert.equal(normalizeRecord({ name: 'x', day: '周日', periods: '1-2', weeks: '1-8' }).ok, true);
  assert.equal(normalizeRecord({ name: 'x', day: '一', periods: '1-2', weeks: '' }).ok, false);
});

test('某周课程过滤与排序', () => {
  const courses = [
    { id: '1', name: 'B', day: 2, start: 3, end: 4, weeks: [1] },
    { id: '2', name: 'A', day: 1, start: 5, end: 6, weeks: [1] },
    { id: '3', name: 'C', day: 1, start: 1, end: 2, weeks: [2] },
  ];
  const list = coursesForWeek(courses, 1);
  assert.deepEqual(list.map((c) => c.id), ['2', '1']);
});

test('学期进度', () => {
  const p = termProgress('2025-09-01', 20, new Date(2025, 8, 10));
  assert.equal(p.week, 2);
  assert.equal(p.total, 20);
  assert.ok(p.pct > 0 && p.pct < 100);
});

test('武汉纺织大学外经贸学院：10 月 21 日（周三）为第 7 周', () => {
  assert.equal(defaultTermStart(), '2026-09-07');
  // 2026-09-10 进校（周四），2026-10-21（周三）应为第 7 周
  assert.equal(currentWeek('2026-09-07', 20, new Date(2026, 9, 21)), 7);
  assert.equal(currentWeek('2026-09-07', 20, new Date(2026, 9, 19)), 7); // 周一
  assert.equal(currentWeek('2026-09-07', 20, new Date(2026, 8, 7)), 1);  // 第 1 周周一
  assert.equal(toISODate(dateOfWeekDay(7, 3, '2026-09-07')), '2026-10-21');
});

test('默认作息时间为上午 4 节 + 下午/晚间 6 节', () => {
  assert.equal(DEFAULT_PERIODS.length, 10);
  assert.deepEqual(DEFAULT_PERIODS[0], { no: 1, start: '08:15', end: '09:00' });
  assert.deepEqual(DEFAULT_PERIODS[3], { no: 4, start: '11:00', end: '11:45' });
  assert.deepEqual(DEFAULT_PERIODS[9], { no: 10, start: '18:35', end: '19:20' });
});

test('timeToRow 把时钟时间映射到网格行坐标', () => {
  assert.equal(timeToRow('08:15', DEFAULT_PERIODS, 10), 0);       // 第 1 节开始
  assert.equal(timeToRow('09:00', DEFAULT_PERIODS, 10), 1);       // 第 1 节结束
  assert.equal(timeToRow('09:05', DEFAULT_PERIODS, 10), 1);       // 课间
  assert.equal(timeToRow('18:35', DEFAULT_PERIODS, 10), 9);       // 第 10 节开始
  assert.equal(timeToRow('19:20', DEFAULT_PERIODS, 10), 10);      // 第 10 节结束
  // 超过最后一节后按 45 分钟一行延伸：19:30 距 19:20 有 10 分钟
  const row1930 = timeToRow('19:30', DEFAULT_PERIODS, 10);
  const row2130 = timeToRow('21:30', DEFAULT_PERIODS, 10);
  assert.ok(row1930 > 10 && row1930 < 11);
  assert.ok(row2130 > 12 && row2130 < 14);
  assert.ok(row2130 > row1930);
});
