import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeShare, dedupe, encodeShare, parseCsv, parseGenericJson, parseIcs, parseQzkb, parseZfkb,
  toCsv, toIcs,
} from '../js/importers.js';
import { defaultPeriods, makeCourse } from '../js/schedule.js';

const sample = [
  makeCourse({ name: '高等数学 A', teacher: '张伟', room: '教一101', day: 1, start: 1, end: 2, weeks: '1-16周', color: '#4a86e8' }),
  makeCourse({ name: '体育', teacher: '陈晨', room: '东操场', day: 3, start: 7, end: 8, weeks: '1-15周(单)', color: '#ef5350' }),
  makeCourse({ name: '数据结构', teacher: '王强', room: '计算机楼B302', day: 2, start: 3, end: 4, weeks: '3-12周', color: '#7e57c2' }),
];

test('解析正方 kbList', () => {
  const payload = {
    kbList: [
      { kcmc: '高等数学 A', xm: '张伟', cdmc: '教一101', xqj: '1', jcs: '1-2节', zcd: '1-16周' },
      { kcmc: '体育', xm: '陈晨', cdmc: '东操场', xqj: '三', jcs: '7-8节', zcd: '1-15周(单)' },
      { kcmc: '', xm: '', xqj: '1', jcs: '1-2节', zcd: '1-16周' },
    ],
  };
  const res = parseZfkb(payload);
  assert.equal(res.courses.length, 2);
  assert.equal(res.skipped.length, 1);
  assert.equal(res.courses[0].name, '高等数学 A');
  assert.equal(res.courses[1].day, 3);
  assert.deepEqual(res.courses[1].weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
});

test('解析强智 data 数组', () => {
  const payload = {
    data: [
      { courseName: '大学物理', teacherName: '刘洋', classroomName: '理科楼401', dayOfWeek: 2, classTime: '5-6节', weekDescription: '1-14周' },
    ],
  };
  const res = parseQzkb(payload);
  assert.equal(res.courses.length, 1);
  assert.equal(res.courses[0].room, '理科楼401');
  assert.equal(res.courses[0].start, 5);
});

test('通用 JSON 自动识别', () => {
  const res = parseGenericJson(JSON.stringify({ rows: [
    { 课程名称: '线性代数', 教师: '孙丽', 地点: '教三108', 星期: '周四', 节次: '3-4节', 周次: '1-8周' },
  ] }));
  assert.equal(res.courses.length, 1);
  assert.equal(res.courses[0].day, 4);
  assert.equal(parseGenericJson('not json').error.length > 0, true);
});

test('CSV 往返', () => {
  const csv = toCsv(sample);
  const res = parseCsv(csv);
  assert.equal(res.courses.length, 3);
  assert.equal(res.courses.find((c) => c.name === '数据结构').weeks.length, 10);
  assert.equal(res.courses.find((c) => c.name === '体育').room, '东操场');
});

test('CSV 支持无表头与引号', () => {
  const csv = '高等数学,张伟,教一101,周一,1-2节,1-16周\n"英语,听说",李娜,外语楼203,周二,3-4节,1-8周';
  const res = parseCsv(csv);
  assert.equal(res.courses.length, 2);
  assert.equal(res.courses[1].name, '英语,听说');
});

test('ICS 导出后可回读', () => {
  const ics = toIcs(sample, { termStart: '2025-09-01', periods: defaultPeriods() });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 16 + 8 + 10);
  const res = parseIcs(ics);
  assert.equal(res.courses.length, 3);
  const math = res.courses.find((c) => c.name.startsWith('高等数学'));
  assert.deepEqual(math.weeks, Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(math.day, 1);
  assert.equal(math.start, 1);
  assert.equal(math.teacher, '张伟');
});

test('分享码往返', () => {
  const code = encodeShare({ name: '我的课表', termStart: '2025-09-01', courses: sample });
  assert.match(code, /^ST1\./);
  const res = decodeShare(code);
  assert.equal(res.courses.length, 3);
  assert.deepEqual(res.courses[0].weeks, Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(decodeShare('bad').error.length > 0, true);
});

test('dedupe 合并周次', () => {
  const a = makeCourse({ name: '课', day: 1, start: 1, end: 2, weeks: [1, 2] });
  const b = { ...a, id: 'other', weeks: [2, 3] };
  const merged = dedupe([a, b]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].weeks, [1, 2, 3]);
});
