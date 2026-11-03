
import { PALETTE, colorForName, findConflicts, formatWeeks, periodTime } from '../schedule.js';
import { store } from '../store.js';
import { icon, openSheet, toast, confirmDialog } from '../ui.js';
import { escapeHtml, dayCN, WEEK_CN, parseTimeToMinutes } from '../util.js';

export function openEditor({ course = null, defaults = {}, onSaved } = {}) {
  const state = store.get();
  const totalWeeks = Math.max(1, Number(state.settings.totalWeeks) || 20);
  const maxPeriod = Math.max(12, state.settings.periods.length);
  const isEdit = Boolean(course?.id);

  const draft = {
    name: course?.name || '',
    teacher: course?.teacher || '',
    room: course?.room || '',
    day: Number(course?.day || defaults.day || 1),
    start: Number(course?.start || defaults.start || 1),
    end: Number(course?.end || defaults.end || defaults.start || 1),
    weeks: new Set(course?.weeks?.length ? course.weeks : defaults.weeks || []),
    color: course?.color || colorForName(defaults.name || '') || PALETTE[0],
    note: course?.note || '',
  };

  const dayChips = Array.from({ length: 7 }, (_, i) => i + 1)
    .map((d) => `<button class="chip ${draft.day === d ? 'active' : ''}" data-day="${d}">周${WEEK_CN[d - 1]}</button>`)
    .join('');

  const periodOptions = Array.from({ length: maxPeriod }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${draft.start === n ? 'selected' : ''}>第 ${n} 节</option>`)
    .join('');
  const endOptions = Array.from({ length: maxPeriod }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${draft.end === n ? 'selected' : ''}>第 ${n} 节</option>`)
    .join('');

  const weekChips = Array.from({ length: totalWeeks }, (_, i) => i + 1)
    .map((w) => `<button class="chip ${draft.weeks.has(w) ? 'active' : ''}" data-week="${w}">${w}</button>`)
    .join('');

  const swatches = PALETTE.map((color) => `
    <button class="swatch ${draft.color.toLowerCase() === color.toLowerCase() ? 'active' : ''}" data-color="${color}"
            style="background:${color}" aria-label="颜色 ${color}"></button>`).join('');

  const sheet = openSheet({
    title: isEdit ? '编辑课程' : '添加课程',
    sub: isEdit ? '修改后仅影响该时间段的这次课' : '点击空白格时已自动带入星期与节次',
    tall: true,
    body: `
      <div class="field">
        <label>课程名称 <span class="aux">必填</span></label>
        <input class="input" data-field="name" maxlength="30" placeholder="例如：高等数学 A" value="${escapeHtml(draft.name)}" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label>任课教师</label>
          <input class="input" data-field="teacher" maxlength="20" placeholder="选填" value="${escapeHtml(draft.teacher)}" autocomplete="off">
        </div>
        <div class="field">
          <label>上课地点</label>
          <input class="input" data-field="room" maxlength="30" placeholder="选填" value="${escapeHtml(draft.room)}" autocomplete="off">
        </div>
      </div>

      <div class="field">
        <div class="field-label">上课星期</div>
        <div class="chip-row" data-days>${dayChips}</div>
      </div>

      <div class="field">
        <div class="field-label">上课节次 <span class="aux" data-time-hint></span></div>
        <div class="field-row">
          <select class="select" data-field="start" aria-label="开始节次">${periodOptions}</select>
          <select class="select" data-field="end" aria-label="结束节次">${endOptions}</select>
        </div>
      </div>

      <div class="field">
        <div class="field-label">上课周次 <span class="aux" data-week-label></span></div>
        <div class="week-quick" data-quick>
          <button data-preset="all">全选</button>
          <button data-preset="none">清空</button>
          <button data-preset="odd">单周</button>
          <button data-preset="even">双周</button>
          <button data-preset="first16">1-16 周</button>
          <button data-preset="first8">1-8 周</button>
        </div>
        <div class="week-chips" data-weeks>${weekChips}</div>
      </div>

      <div class="field">
        <div class="field-label">课程颜色</div>
        <div class="colors" data-colors>${swatches}</div>
      </div>

      <div class="field">
        <label>备注</label>
        <textarea class="textarea" data-field="note" maxlength="100" placeholder="考试范围、作业要求…">${escapeHtml(draft.note)}</textarea>
      </div>
      <div class="hint-text" data-conflict style="color:var(--danger);display:none"></div>`,
    foot: `
      ${isEdit ? `<button class="btn btn-danger" data-del style="flex:0 0 auto">${icon('trash')}</button>` : ''}
      <button class="btn btn-ghost" data-cancel>取消</button>
      <button class="btn btn-primary" data-save>保存</button>`,
    onMount(api) {
      const nameInput = api.query('[data-field="name"]');
      const startSel = api.query('[data-field="start"]');
      const endSel = api.query('[data-field="end"]');
      const timeHint = api.query('[data-time-hint]');
      const weekLabel = api.query('[data-week-label]');
      const conflictEl = api.query('[data-conflict]');

      const readForm = () => {
        draft.name = nameInput.value.trim();
        draft.teacher = api.query('[data-field="teacher"]').value.trim();
        draft.room = api.query('[data-field="room"]').value.trim();
        draft.note = api.query('[data-field="note"]').value.trim();
        draft.start = Number(startSel.value);
        draft.end = Number(endSel.value);
      };

      const updateHint = () => {
        const t1 = periodTime(state.settings.periods, Number(startSel.value));
        const t2 = periodTime(state.settings.periods, Number(endSel.value));
        timeHint.textContent = t1.start ? `${t1.start} - ${t2.end}` : '';
      };

      const updateWeekLabel = () => {
        const arr = [...draft.weeks].sort((a, b) => a - b);
        weekLabel.textContent = arr.length ? `${arr.length} 周 · ${formatWeeks(arr)}` : '未选择周次';
        weekLabel.style.color = arr.length ? '' : 'var(--danger)';
      };

      const updateConflict = () => {
        readForm();
        if (!draft.weeks.size) {
          conflictEl.style.display = 'none';
          return;
        }
        const hits = findConflicts(
          { id: course?.id, day: draft.day, start: draft.start, end: draft.end, weeks: [...draft.weeks] },
          state.courses.filter((c) => c.id !== course?.id),
        );
        if (!hits.length) {
          conflictEl.style.display = 'none';
          return;
        }
        const names = [...new Set(hits.map((c) => c.name))].slice(0, 3).join('、');
        conflictEl.style.display = 'block';
        conflictEl.textContent = `时间冲突：与「${names}」在相同星期、节次与周次重叠，仍可保存。`;
      };

      updateHint();
      updateWeekLabel();
      updateConflict();

      api.query('[data-days]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-day]');
        if (!btn) return;
        draft.day = Number(btn.dataset.day);
        api.queryAll('[data-day]').forEach((b) => b.classList.toggle('active', b === btn));
        updateConflict();
      });

      startSel.addEventListener('change', () => {
        if (Number(startSel.value) > Number(endSel.value)) endSel.value = startSel.value;
        draft.start = Number(startSel.value);
        draft.end = Number(endSel.value);
        updateHint();
        updateConflict();
      });
      endSel.addEventListener('change', () => {
        if (Number(endSel.value) < Number(startSel.value)) startSel.value = endSel.value;
        updateHint();
        updateConflict();
      });

      api.query('[data-weeks]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-week]');
        if (!btn) return;
        const w = Number(btn.dataset.week);
        if (draft.weeks.has(w)) draft.weeks.delete(w);
        else draft.weeks.add(w);
        btn.classList.toggle('active', draft.weeks.has(w));
        updateWeekLabel();
        updateConflict();
      });

      api.query('[data-quick]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-preset]');
        if (!btn) return;
        const preset = btn.dataset.preset;
        draft.weeks = new Set();
        const all = Array.from({ length: totalWeeks }, (_, i) => i + 1);
        if (preset === 'all') all.forEach((w) => draft.weeks.add(w));
        if (preset === 'odd') all.filter((w) => w % 2 === 1).forEach((w) => draft.weeks.add(w));
        if (preset === 'even') all.filter((w) => w % 2 === 0).forEach((w) => draft.weeks.add(w));
        if (preset === 'first16') all.slice(0, Math.min(16, totalWeeks)).forEach((w) => draft.weeks.add(w));
        if (preset === 'first8') all.slice(0, Math.min(8, totalWeeks)).forEach((w) => draft.weeks.add(w));
        api.queryAll('[data-week]').forEach((b) => b.classList.toggle('active', draft.weeks.has(Number(b.dataset.week))));
        updateWeekLabel();
        updateConflict();
      });

      api.query('[data-colors]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-color]');
        if (!btn) return;
        draft.color = btn.dataset.color;
        api.queryAll('[data-color]').forEach((b) => b.classList.toggle('active', b === btn));
      });

      nameInput.addEventListener('input', () => {
        if (draft.color && course) return;
        if (!isEdit && nameInput.value.trim()) {
          draft.color = colorForName(nameInput.value.trim());
          api.queryAll('[data-color]').forEach((b) => {
            b.classList.toggle('active', b.dataset.color.toLowerCase() === draft.color.toLowerCase());
          });
        }
      });

      api.query('[data-cancel]').addEventListener('click', () => api.close());

      api.query('[data-save]').addEventListener('click', () => {
        readForm();
        if (!draft.name) {
          toast('请填写课程名称');
          nameInput.focus();
          return;
        }
        if (!draft.weeks.size) {
          toast('请至少选择一个上课周次');
          return;
        }
        if (draft.end < draft.start) draft.end = draft.start;
        const payload = {
          id: course?.id,
          name: draft.name,
          teacher: draft.teacher,
          room: draft.room,
          day: draft.day,
          start: draft.start,
          end: draft.end,
          weeks: [...draft.weeks].sort((a, b) => a - b),
          color: draft.color,
          note: draft.note,
          source: course?.source || 'manual',
        };
        if (isEdit) {
          store.updateCourse(course.id, payload);
          toast('已保存修改');
        } else {
          store.addCourse(payload);
          toast('已添加课程');
        }
        api.close();
        onSaved?.();
      });

      const delBtn = api.query('[data-del]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: '删除课程',
            message: `确认删除「${escapeHtml(draft.name || course.name)}」吗？`,
            confirmText: '删除',
            danger: true,
          });
          if (!ok) return;
          store.removeCourse(course.id);
          api.close();
          toast('已删除课程');
          onSaved?.();
        });
      }

      if (!isEdit) setTimeout(() => nameInput.focus(), 260);
    },
  });

  return sheet;
}
