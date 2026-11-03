
import { coursesForWeek, defaultPeriods, defaultTermStart, semesterLabel, termProgress } from '../schedule.js';
import { store, defaultSettings } from '../store.js';
import { icon, openSheet, confirmDialog, toast } from '../ui.js';
import { escapeHtml, fmtCNFull, parseISODate, toISODate, WEEK_CN } from '../util.js';
import { openExportSheet } from './tools.js';
import { canInstall, isNativeApp, isStandalone, promptInstall } from '../install.js';

export function topbarHtml(state) {
  const p = termProgress(state.settings.termStart, state.settings.totalWeeks);
  return `
    <div class="tb-row">
      <div class="tb-title">
        <h1>我的</h1>
        <div class="tb-sub">${escapeHtml(semesterLabel(state.settings.termStart))} · 第 ${p.week} 周</div>
      </div>
      <div class="tb-actions">
        <button class="icon-btn" data-action="settings" title="学期设置">${icon('settings')}</button>
      </div>
    </div>`;
}

export function renderMe(state) {
  const p = termProgress(state.settings.termStart, state.settings.totalWeeks);
  const thisWeek = coursesForWeek(state.courses, p.week);
  const weeklyPeriods = thisWeek.reduce((sum, c) => sum + (c.end - c.start + 1), 0);
  const nickname = state.settings.nickname || '同学';
  const initial = nickname.slice(0, 1).toUpperCase();
  const dark = state.settings.theme === 'dark';

  return `
    <div class="profile">
      <div class="avatar">${escapeHtml(initial)}</div>
      <div class="who">
        <b>${escapeHtml(nickname)}</b>
        <span>${escapeHtml(state.settings.school || '未设置学校')} · ${escapeHtml(semesterLabel(state.settings.termStart))}</span>
      </div>
      <button class="icon-btn edit-profile" data-action="profile" aria-label="编辑资料">${icon('edit')}</button>
    </div>

    <div class="stat-row">
      <div class="stat"><b>${thisWeek.length}</b><span>本周课程</span></div>
      <div class="stat"><b>${weeklyPeriods}</b><span>周课时</span></div>
      <div class="stat"><b>${state.courses.length}</b><span>课程安排</span></div>
    </div>

    <div class="list-card">
      <button class="list-row" data-action="settings">
        <span class="ic">${icon('calendar')}</span>
        <span class="label">学期设置</span>
        <span class="value">${escapeHtml(state.settings.termStart)} · ${state.settings.totalWeeks} 周</span>
        <span class="chev">${icon('right')}</span>
      </button>
      <div class="list-row" role="button" tabindex="0" data-action="remind">
        <span class="ic">${icon('bell')}</span>
        <span class="label">上课提醒</span>
        <span class="value">${state.settings.remind ? `课前 ${state.settings.remindBefore} 分钟` : '未开启'}</span>
        <button class="switch" role="switch" aria-checked="${state.settings.remind}" data-toggle="remind" aria-label="上课提醒"></button>
      </div>
      <div class="list-row" role="button" tabindex="0" data-action="theme">
        <span class="ic">${icon(dark ? 'moon' : 'sun')}</span>
        <span class="label">深色模式</span>
        <span class="value">${dark ? '已开启' : '已关闭'}</span>
        <button class="switch" role="switch" aria-checked="${dark}" data-toggle="theme" aria-label="深色模式"></button>
      </div>
      <button class="list-row" data-action="import">
        <span class="ic">${icon('upload')}</span>
        <span class="label">导入课表</span>
        <span class="value">教务系统 / 文件 / 分享码</span>
        <span class="chev">${icon('right')}</span>
      </button>
    </div>

    <div class="list-card">
      ${isNativeApp() ? '' : `<div class="list-row" role="button" tabindex="0" data-action="install">
        <span class="ic">${icon('download')}</span>
        <span class="label">安装到桌面 / 手机</span>
        <span class="value">${isStandalone() ? '已安装' : canInstall() ? '可安装' : '查看安装方法'}</span>
        <span class="chev">${icon('right')}</span>
      </div>`}
      <button class="list-row" data-action="export">
        <span class="ic">${icon('download')}</span>
        <span class="label">导出与备份</span>
        <span class="value">CSV / ICS / JSON</span>
        <span class="chev">${icon('right')}</span>
      </button>
      <button class="list-row" data-action="clear">
        <span class="ic">${icon('trash')}</span>
        <span class="label">清空课表</span>
        <span class="value">保留设置与待办</span>
        <span class="chev">${icon('right')}</span>
      </button>
    </div>

    <div class="list-card">
      <button class="list-row" data-action="about">
        <span class="ic">${icon('info')}</span>
        <span class="label">关于课表</span>
        <span class="value">版本 3.2.3</span>
        <span class="chev">${icon('right')}</span>
      </button>
    </div>

    <div class="hint-text" style="text-align:center;padding:6px 0 4px">
      数据保存在本机浏览器（localStorage），不上传服务器。
    </div>
    <div style="text-align:center;font-size:10px;color:var(--muted);opacity:.55;padding:2px 0 6px">Built by Luoz1337</div>`;
}

export function bindMe(root, ctx) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-toggle="remind"]') || e.target.closest('[data-action="remind"]')) {
      e.stopPropagation();
      await toggleRemind(ctx);
      return;
    }
    if (e.target.closest('[data-toggle="theme"]') || e.target.closest('[data-action="theme"]')) {
      e.stopPropagation();
      const next = store.get().settings.theme === 'dark' ? 'light' : 'dark';
      store.setSettings({ theme: next });
      toast(next === 'dark' ? '已切换深色模式' : '已切换浅色模式');
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'profile') openProfileSheet();
    else if (action === 'settings') ctx.openSettings();
    else if (action === 'import') ctx.openImport();
    else if (action === 'install') await handleInstall();
    else if (action === 'export') openExportSheet(store.get());
    else if (action === 'clear') {
      const ok = await confirmDialog({
        title: '清空课表',
        message: `将删除全部 ${store.get().courses.length} 条课程安排，学期设置与待办会保留。建议先导出备份。`,
        confirmText: '清空',
        danger: true,
      });
      if (!ok) return;
      store.clearCourses();
      toast('课表已清空');
    } else if (action === 'about') {
      openAboutSheet();
    }
  });
}

async function toggleRemind(ctx) {
  const enabled = store.get().settings.remind;
  if (isNativeApp() && window.SuperTableAndroid && window.SuperTableAndroid.syncReminders) {
    store.setSettings({ remind: !enabled });
    if (!enabled) window.SuperTableAndroid.requestNotificationPermission?.();
    toast(enabled ? '已关闭上课提醒' : '已开启上课提醒（系统通知）');
    return;
  }
  if (enabled) {
    store.setSettings({ remind: false });
    toast('已关闭上课提醒');
    return;
  }
  if (!('Notification' in window)) {
    toast('当前浏览器不支持系统通知');
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('未获得通知权限，可在浏览器设置中开启');
    return;
  }
  store.setSettings({ remind: true });
  toast('已开启上课提醒（页面打开时生效）');
  ctx.startReminderLoop?.();
}

async function handleInstall() {
  if (isNativeApp()) {
    toast('当前已经是手机 App');
    return;
  }
  if (isStandalone()) {
    toast('当前已经作为应用运行');
    return;
  }
  if (canInstall()) {
    const accepted = await promptInstall();
    if (accepted) {
      toast('正在安装课表应用');
      return;
    }
  }
  openInstallHelp();
}

function openInstallHelp() {
  openSheet({
    title: '安装课表',
    sub: '安装后从桌面 / 主屏幕直接打开，像原生 App 一样',
    body: `
      <div class="notice">${icon('info')}<span>安装的是 PWA 应用外壳，课表数据仍保存在本机浏览器；电脑端导入课表时需要保持本地服务运行。</span></div>
      <div class="card" style="box-shadow:none;background:var(--surface-2);font-size:12px;line-height:1.9;color:var(--text-2)">
        <p style="margin:0 0 8px"><b>Android（Chrome / Edge）</b><br>打开本应用 → 右上角菜单 → 「安装应用」或「添加到主屏幕」。</p>
        <p style="margin:0 0 8px"><b>iPhone / iPad（Safari）</b><br>底部分享按钮 → 「添加到主屏幕」→ 添加。</p>
        <p style="margin:0 0 8px"><b>Windows / macOS（Edge / Chrome）</b><br>地址栏右侧的安装图标，或菜单 → 应用 → 「安装此站点」。</p>
        <p style="margin:0"><b>桌面一键启动</b><br>Windows 用户可直接双击应用目录下的 <code>desktop\\课表SuperTable.exe</code>，会自动启动本地服务并以独立窗口打开。</p>
      </div>`,
    foot: `<button class="btn btn-primary" data-ok>知道了</button>`,
    onMount(api) {
      api.query('[data-ok]').addEventListener('click', () => api.close());
    },
  });
}

function openProfileSheet() {
  const state = store.get();
  const sheet = openSheet({
    title: '编辑资料',
    body: `
      <div class="field">
        <label>昵称</label>
        <input class="input" data-field="nickname" maxlength="12" value="${escapeHtml(state.settings.nickname || '')}" placeholder="例如：小林">
      </div>
      <div class="field">
        <label>学校</label>
        <input class="input" data-field="school" maxlength="20" value="${escapeHtml(state.settings.school || '')}" placeholder="例如：示例大学">
      </div>`,
    foot: `<button class="btn btn-ghost" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`,
    onMount(api) {
      api.query('[data-cancel]').addEventListener('click', () => api.close());
      api.query('[data-save]').addEventListener('click', () => {
        store.setSettings({
          nickname: api.query('[data-field="nickname"]').value.trim() || '同学',
          school: api.query('[data-field="school"]').value.trim(),
        });
        api.close();
        toast('资料已更新');
      });
    },
  });
  return sheet;
}

export function openSettingsSheet(ctx) {
  const state = store.get();
  const settings = state.settings;
  const defaults = defaultPeriods();

  function rowHtml(p) {
    return `
    <div style="display:grid;grid-template-columns:44px 1fr 1fr;gap:8px;align-items:center;margin-bottom:7px" data-period-row data-no="${p.no}">
      <span style="font-size:12px;color:var(--muted)">第 ${p.no} 节</span>
      <input class="input" type="time" value="${p.start}" data-start style="padding:8px 10px">
      <input class="input" type="time" value="${p.end}" data-end style="padding:8px 10px">
    </div>`;
  }

  function addMinutes(time, minutes) {
    const parts = String(time || '08:00').split(':').map(Number);
    let total = (parts[0] || 0) * 60 + (parts[1] || 0) + minutes;
    total = Math.max(0, Math.min(23 * 60 + 59, total));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function makePeriod(index, previous) {
    if (index < defaults.length) {
      return { no: index + 1, start: defaults[index].start, end: defaults[index].end };
    }
    const start = addMinutes(previous ? previous.end : '08:00', 10);
    return { no: index + 1, start, end: addMinutes(start, 45) };
  }

  const initialPeriods = (settings.periods.length ? settings.periods : defaults)
    .map((p, i) => ({ no: i + 1, start: p.start || '', end: p.end || '' }));
  const rows = initialPeriods.map(rowHtml).join('');

  const sheet = openSheet({
    title: '学期设置',
    sub: '开学日期决定每一周的起止与“今天”的位置',
    tall: true,
    body: `
      <div class="field">
        <label>学校名称</label>
        <input class="input" data-field="school" maxlength="20" value="${escapeHtml(settings.school || '')}" placeholder="例如：示例大学">
      </div>
      <div class="field-row">
        <div class="field">
          <label>开学第一周周一</label>
          <input class="input" type="date" data-field="termStart" value="${settings.termStart}">
        </div>
        <div class="field">
          <label>学期总周数</label>
          <select class="select" data-field="totalWeeks">
            ${[16, 17, 18, 19, 20, 21, 22, 23, 24].map((n) => `<option value="${n}" ${Number(settings.totalWeeks) === n ? 'selected' : ''}>${n} 周</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="hint-text" style="margin-top:-6px;margin-bottom:14px" data-term-hint>${settings.termStart ? `${escapeHtml(semesterLabel(settings.termStart))} · ${escapeHtml(fmtCNFull(parseISODate(settings.termStart) || new Date()))} 开学` : ''}</div>

      <div class="field-label">每日节数与上下课时间 <span class="aux" data-period-label>每日 ${initialPeriods.length} 节可自定义</span></div>
      <div class="field-row" style="align-items:end;margin-bottom:8px">
        <div class="field">
          <label>每日课数</label>
          <input class="input" type="number" min="1" max="20" step="1" data-period-count value="${initialPeriods.length}">
        </div>
        <div class="field">
          <label>快捷调整</label>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" type="button" data-period-minus>− 1 节</button>
            <button class="btn btn-ghost" type="button" data-period-plus>+ 1 节</button>
          </div>
        </div>
      </div>
      <div style="max-height:260px;overflow:auto;padding-right:2px" data-period-rows>${rows}</div>
      <div class="hint-text">减少节数不会删除已排到更高节次的课程，课表会保留这些课程行。</div>

      <div class="field-label" style="margin-top:16px">晚自习 <span class="aux">周一至周四 · 与上课冲突时显示课程</span></div>
      <div class="card" style="box-shadow:none;background:var(--surface-2);padding:12px;margin-bottom:2px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:12.5px;font-weight:600;color:var(--text)">开启晚自习</span>
          <button class="switch" role="switch" aria-checked="${settings.selfStudy.enabled}" data-ss-enabled aria-label="开启晚自习"></button>
        </div>
        <div data-ss-fields style="${settings.selfStudy.enabled ? '' : 'display:none'}">
          <div class="field">
            <label>晚自习日期 <span class="aux">可多选</span></label>
            <div class="chip-row" data-ss-days>
              ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" class="chip ${settings.selfStudy.days.includes(d) ? 'active' : ''}" data-ss-day="${d}">周${WEEK_CN[d - 1]}</button>`).join('')}
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>晚自习名称</label>
              <input class="input" data-ss-text maxlength="20" value="${escapeHtml(settings.selfStudy.text || '')}" placeholder="晚自习">
            </div>
            <div class="field">
              <label>显示信息</label>
              <input class="input" data-ss-note maxlength="30" value="${escapeHtml(settings.selfStudy.note || '')}" placeholder="例如：地点 / 要求">
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>开始时间</label>
              <input class="input" type="time" data-ss-start value="${settings.selfStudy.start}">
            </div>
            <div class="field">
              <label>结束时间</label>
              <input class="input" type="time" data-ss-end value="${settings.selfStudy.end}">
            </div>
          </div>
          <div class="field">
            <label>颜色</label>
            <input class="input" type="color" data-ss-color value="${settings.selfStudy.color || '#5c6bc0'}" style="height:38px;padding:4px">
          </div>
        </div>
      </div>

      <div class="notice warn" style="margin-top:14px">${icon('info')}<span>修改总周数会裁剪超出范围的课程周次；节次时间只影响显示与提醒，不改变课程数据。</span></div>`,
    foot: `<button class="btn btn-ghost" data-reset>恢复默认</button><button class="btn btn-primary" data-save>保存</button>`,
    onMount(api) {
      api.query('[data-field="termStart"]').addEventListener('change', (e) => {
        const d = parseISODate(e.target.value);
        api.query('[data-term-hint]').textContent = d ? `${semesterLabel(e.target.value)} · 开学 ${fmtCNFull(d)}` : '';
      });

      const countInput = api.query('[data-period-count]');
      const rowsBox = api.query('[data-period-rows]');
      const periodLabel = api.query('[data-period-label]');

      function readPeriods() {
        return api.queryAll('[data-period-row]').map((row) => ({
          no: Number(row.dataset.no),
          start: row.querySelector('[data-start]').value,
          end: row.querySelector('[data-end]').value,
        }));
      }

      function applyCount(raw) {
        const count = Math.max(1, Math.min(20, Number(raw) || 1));
        const current = readPeriods();
        const next = [];
        for (let i = 0; i < count; i += 1) {
          next.push(current[i] ? { ...current[i], no: i + 1 } : makePeriod(i, next[i - 1]));
        }
        rowsBox.innerHTML = next.map(rowHtml).join('');
        countInput.value = String(count);
        if (periodLabel) periodLabel.textContent = `每日 ${count} 节可自定义`;
      }

      countInput.addEventListener('change', () => applyCount(countInput.value));
      api.query('[data-period-minus]').addEventListener('click', () => applyCount(Number(countInput.value) - 1));
      api.query('[data-period-plus]').addEventListener('click', () => applyCount(Number(countInput.value) + 1));

      api.query('[data-ss-enabled]').addEventListener('click', () => {
        const btn = api.query('[data-ss-enabled]');
        const on = btn.getAttribute('aria-checked') === 'true';
        btn.setAttribute('aria-checked', String(!on));
        const fields = api.query('[data-ss-fields]');
        if (fields) fields.style.display = on ? 'none' : '';
      });

      api.query('[data-ss-days]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ss-day]');
        if (btn) btn.classList.toggle('active');
      });

      api.query('[data-save]').addEventListener('click', () => {
        const termStart = api.query('[data-field="termStart"]').value;
        if (!parseISODate(termStart)) {
          toast('请选择有效的开学日期');
          return;
        }
        const totalWeeks = Number(api.query('[data-field="totalWeeks"]').value) || 20;
        if (Number(countInput.value) !== api.queryAll('[data-period-row]').length) {
          applyCount(countInput.value);
        }
        const periods = readPeriods();
        if (!periods.length) {
          toast('每日课数至少为 1 节');
          return;
        }
        for (const p of periods) {
          if (!p.start || !p.end) {
            toast(`请填写第 ${p.no} 节的开始和结束时间`);
            return;
          }
          if (p.end <= p.start) {
            toast(`第 ${p.no} 节结束时间需晚于开始时间`);
            return;
          }
        }

        const ssEnabled = api.query('[data-ss-enabled]').getAttribute('aria-checked') === 'true';
        const ssDays = api.queryAll('[data-ss-day].active')
          .map((btn) => Number(btn.dataset.ssDay))
          .sort((a, b) => a - b);
        const ssStart = api.query('[data-ss-start]').value || '19:30';
        const ssEnd = api.query('[data-ss-end]').value || '21:30';
        if (ssEnabled && !ssDays.length) {
          toast('请至少选择一个晚自习日期');
          return;
        }
        if (ssEnabled && ssEnd <= ssStart) {
          toast('晚自习结束时间需晚于开始时间');
          return;
        }
        const selfStudy = {
          enabled: ssEnabled,
          days: ssDays,
          start: ssStart,
          end: ssEnd,
          text: api.query('[data-ss-text]').value.trim() || '晚自习',
          note: api.query('[data-ss-note]').value.trim(),
          color: api.query('[data-ss-color]').value || '#5c6bc0',
        };

        const courses = store.get().courses.map((c) => ({
          ...c,
          weeks: c.weeks.filter((w) => w <= totalWeeks),
        })).filter((c) => c.weeks.length);
        store.commit((s) => {
          s.settings = {
            ...s.settings,
            school: api.query('[data-field="school"]').value.trim(),
            termStart,
            totalWeeks,
            periods,
            selfStudy,
          };
          s.courses = courses;
        });
        api.close();
        toast('学期设置已保存');
        ctx.onSettingsChanged?.();
      });

      api.query('[data-reset]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '恢复默认设置',
          message: '将开学日期恢复为 2026-09-07（第 1 周）、周数 20 周，节次时间与晚自习恢复默认。课程不会删除。',
          confirmText: '恢复',
        });
        if (!ok) return;
        const defaults = defaultSettings();
        store.setSettings({
          termStart: defaults.termStart,
          totalWeeks: 20,
          periods: defaults.periods,
          selfStudy: defaults.selfStudy,
        });
        api.close();
        toast('已恢复默认设置');
        ctx.onSettingsChanged?.();
      });
    },
  });
  return sheet;
}

function openAboutSheet() {
  const sheet = openSheet({
    title: '关于课表 SuperTable',
    body: `
      <div style="text-align:center;padding:8px 0 16px">
        <div style="width:64px;height:64px;margin:0 auto 10px;border-radius:18px;background:linear-gradient(140deg,#3b6cff,#6aa6ff);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:700;box-shadow:0 12px 26px -12px rgba(49,94,220,.9)">课</div>
        <b style="font-size:16px">课表 SuperTable</b>
        <div class="hint-text">版本 3.2.3 · 本地离线优先</div>
      </div>
      <div class="card" style="box-shadow:none;background:var(--surface-2);font-size:12px;line-height:1.9;color:var(--text-2)">
        <p style="margin:0 0 8px">一款移动端优先的课程表应用：周课表、日程待办、教务系统导入、空教室与校历。</p>
        <p style="margin:0 0 8px">课程数据保存在浏览器本地，导入教务系统时凭据只经由本机服务转发，不写入磁盘、不上传第三方。</p>
        <p style="margin:0">教务系统接口由各校部署决定，若自动导入失败，可使用“粘贴网页 / CSV / 分享码”导入。</p>
      </div>
      <div style="text-align:center;font-size:10px;color:var(--muted);opacity:.5;margin-top:14px">Built by Luoz1337</div>`,
    foot: `<button class="btn btn-primary" data-close-foot>知道了</button>`,
    onMount(api) {
      api.query('[data-close-foot]').addEventListener('click', () => api.close());
    },
  });
  return sheet;
}

export { toISODate };
