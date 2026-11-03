
import { dayCN, formatPeriodsRange, formatWeeks, periodTime } from '../schedule.js';
import { store } from '../store.js';
import { icon, openSheet, confirmDialog, toast, shade } from '../ui.js';
import { escapeHtml } from '../util.js';
import { openEditor } from './editor.js';

export function openCourseDetail(courseId, { onChange } = {}) {
  const state = store.get();
  const course = state.courses.find((c) => c.id === courseId);
  if (!course) return;

  const t1 = periodTime(state.settings.periods, course.start);
  const t2 = periodTime(state.settings.periods, course.end);
  const timeText = `${dayCN(course.day)} ${formatPeriodsRange(course.start, course.end)}${t1.start ? `  ${t1.start}-${t2.end}` : ''}`;

  const sheet = openSheet({
    title: '课程详情',
    body: `
      <div class="detail-hero" style="background:linear-gradient(150deg, ${course.color}, ${shade(course.color, -22)})">
        <h3>${escapeHtml(course.name)}</h3>
        <p>${escapeHtml([course.teacher, course.room].filter(Boolean).join(' · ') || '未填写教师与地点')}</p>
      </div>
      <div class="detail-list">
        <div class="detail-line"><span class="ic">${icon('clock')}</span><span class="k">时间</span><span class="v">${escapeHtml(timeText)}</span></div>
        <div class="detail-line"><span class="ic">${icon('calendar')}</span><span class="k">周次</span><span class="v">${escapeHtml(formatWeeks(course.weeks))}</span></div>
        ${course.room ? `<div class="detail-line"><span class="ic">${icon('pin')}</span><span class="k">地点</span><span class="v">${escapeHtml(course.room)}</span></div>` : ''}
        ${course.teacher ? `<div class="detail-line"><span class="ic">${icon('teacher')}</span><span class="k">教师</span><span class="v">${escapeHtml(course.teacher)}</span></div>` : ''}
        ${course.note ? `<div class="detail-line"><span class="ic">${icon('info')}</span><span class="k">备注</span><span class="v">${escapeHtml(course.note)}</span></div>` : ''}
      </div>
      <div class="detail-actions">
        <button class="btn btn-ghost" data-edit>${icon('edit')}编辑课程</button>
        <button class="btn btn-danger" data-del>${icon('trash')}删除</button>
      </div>`,
    onMount(api) {
      api.query('[data-edit]').addEventListener('click', () => {
        api.close();
        setTimeout(() => {
          openEditor({ course, onSaved: onChange });
        }, 180);
      });
      api.query('[data-del]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '删除课程',
          message: `确认删除「${escapeHtml(course.name)}」吗？该时间段的这节课将被移除，且无法恢复。`,
          confirmText: '删除',
          danger: true,
        });
        if (!ok) return;
        store.removeCourse(course.id);
        api.close();
        toast('已删除课程');
        onChange?.();
      });
    },
  });

  return sheet;
}
