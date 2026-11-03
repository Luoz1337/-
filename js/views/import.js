
import { dayCN, formatPeriodsRange, formatWeeks } from '../schedule.js';
import { store, courseKey } from '../store.js';
import { openSheet, toast, icon, emptyState } from '../ui.js';
import { escapeHtml, readFileText, toISODate } from '../util.js';
import { ADAPTERS, detectAndParse } from '../importers.js';
import { parseHtmlTable } from '../zf-html.js';

const SCHOOL_PRESETS = [
  {
    id: 'whcibe',
    name: '武汉纺织大学外经贸学院',
    baseUrl: 'http://jw.whcibe.com',
    adapter: 'zfsoft',
    note: '正方 V9 教务系统 · 公网可访问，无需校园网 · 学号密码登录',
  },
  {
    id: 'custom',
    name: '其他学校 / 自定义教务地址',
    baseUrl: '',
    adapter: 'zfsoft',
    note: '填写学校教务系统首页地址，支持正方新版 / 旧版、自定义 JSON 接口',
  },
];

export function openImportWizard({ initialSource = '', initialCourses = null, skipped = [], source = '' } = {}) {
  const now = new Date();
  const currentYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultSchool = SCHOOL_PRESETS[0];

  const w = {
    step: 'source',
    adapter: defaultSchool.adapter,
    schoolId: defaultSchool.id,
    courses: [],
    skipped: [],
    selected: new Set(),
    mode: 'merge',
    source: '',
    busy: false,
    error: '',
    sessionId: null,
    needCaptcha: false,
    captchaImage: '',
    parsedFrom: '',
    form: {
      baseUrl: defaultSchool.baseUrl,
      username: '',
      password: '',
      year: currentYear,
      term: now.getMonth() >= 1 && now.getMonth() <= 6 ? '2' : '1',
      cookie: '',
      captcha: '',
    },
  };

  const api = openSheet({
    title: '导入课表',
    sub: '从教务系统、文件或分享码导入',
    tall: true,
    body: '',
    foot: '<span></span>',
  });

  if (Array.isArray(initialCourses) && initialCourses.length) {
    w.courses = initialCourses;
    w.skipped = Array.isArray(skipped) ? skipped : [];
    w.selected = new Set(initialCourses.map((_, i) => i));
    w.parsedFrom = source || '网页登录导入';
    w.step = 'preview';
  }

  const bodyEl = api.body;
  const footEl = api.wrap.querySelector('.sheet-foot');
  paint();

  function setSub(text) {
    const sub = api.head.querySelector('.sub');
    if (sub) sub.textContent = text;
  }

  function paint() {
    bodyEl.innerHTML = stepHtml();
    footEl.innerHTML = footHtml();
    bind();
    bodyEl.scrollTop = 0;
    if (w.error) {
      requestAnimationFrame(() => {
        bodyEl.scrollTop = bodyEl.scrollHeight;
      });
    }
    setSub(subForStep());
  }

  function subForStep() {
    if (w.step === 'source') return '选择一种导入方式';
    if (w.step === 'system') return '凭据仅用于本次导入，不会保存';
    if (w.step === 'paste') return '支持课表网页源码、JSON、CSV';
    if (w.step === 'share') return '粘贴同学发来的分享码';
    if (w.step === 'preview') return `识别到 ${w.courses.length} 条课程安排，请确认`;
    if (w.step === 'done') return '导入完成';
    return '';
  }


  function stepHtml() {
    if (w.step === 'source') return sourceHtml();
    if (w.step === 'system') return systemHtml();
    if (w.step === 'paste') return pasteHtml();
    if (w.step === 'share') return shareHtml();
    if (w.step === 'preview') return previewHtml();
    if (w.step === 'done') return doneHtml();
    return '';
  }

  function sourceHtml() {
    const preset = SCHOOL_PRESETS.find((s) => s.id === w.schoolId) || defaultSchool;
    return `
      <div class="notice">${icon('info')}<span>课表数据只保存在本机。选择教务系统导入时，账号密码仅通过本机服务转发到学校系统，不写入磁盘。</span></div>
      <div class="import-source">
        <button class="source-card recommend" data-source="weblogin">
          <span class="ic">${icon('book')}</span>
          <span class="tx"><b>网页登录导入 <span class="tag">推荐</span></b><span>App 内登录教务系统，打开课表后一键导入</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
        <button class="source-card" data-source="system">
          <span class="ic">${icon('user')}</span>
          <span class="tx"><b>账号导入</b><span>${escapeHtml(preset.name)} · 正方 V9 自动登录</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
        <button class="source-card" data-source="paste">
          <span class="ic">${icon('code')}</span>
          <span class="tx"><b>粘贴课表网页 / JSON / CSV</b><span>已登录教务系统？复制课表页面源码即可解析</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
        <button class="source-card" data-source="file">
          <span class="ic">${icon('grid')}</span>
          <span class="tx"><b>从文件导入</b><span>CSV 表格、ICS 日历、JSON 课表</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
        <button class="source-card" data-source="share">
          <span class="ic">${icon('share')}</span>
          <span class="tx"><b>分享码导入</b><span>粘贴 ST1. 开头的课表分享码</span></span>
          <span class="chev">${icon('right')}</span>
        </button>
      </div>
      <input type="file" accept=".csv,.ics,.json,.txt,.html,.htm" data-file hidden>
      <div class="hint-text" style="margin-top:14px">导入时会预览全部课程，可选择“合并”保留现有课程，或“覆盖”替换整个课表。</div>`;
  }

  function systemHtml() {
    const adapter = ADAPTERS.find((a) => a.id === w.adapter) || ADAPTERS[0];
    const preset = SCHOOL_PRESETS.find((s) => s.id === w.schoolId) || defaultSchool;
    let fields = '';
    if (w.adapter === 'zfsoft' || w.adapter === 'zfsoft-old') {
      fields = `
        <div class="field">
          <label>教务系统地址 <span class="aux">需含 http(s)</span></label>
          <input class="input" data-field="baseUrl" placeholder="https://jwxt.example.edu.cn" value="${escapeHtml(w.form.baseUrl)}" autocomplete="off" inputmode="url">
        </div>
        <div class="field-row">
          <div class="field">
            <label>学号</label>
            <input class="input" data-field="username" placeholder="学号 / 工号" value="${escapeHtml(w.form.username)}" autocomplete="username">
          </div>
          <div class="field">
            <label>密码</label>
            <input class="input" type="password" data-field="password" placeholder="教务系统密码" value="${escapeHtml(w.form.password)}" autocomplete="current-password">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>学年</label>
            <input class="input" type="number" data-field="year" min="2015" max="2035" value="${w.form.year}">
          </div>
          <div class="field">
            <label>学期</label>
            <select class="select" data-field="term">
              <option value="1" ${w.form.term === '1' ? 'selected' : ''}>第一学期</option>
              <option value="2" ${w.form.term === '2' ? 'selected' : ''}>第二学期</option>
            </select>
          </div>
        </div>
        ${w.needCaptcha ? `
        <div class="field">
          <label>验证码 <span class="aux">点击图片刷新</span></label>
          <div style="display:flex;gap:10px;align-items:center">
            <input class="input" data-field="captcha" placeholder="输入验证码" value="${escapeHtml(w.form.captcha)}" style="flex:1" autocomplete="off">
            ${w.captchaImage
              ? `<img src="${w.captchaImage}" alt="验证码" data-captcha-img style="height:40px;border-radius:8px;border:1px solid var(--line);cursor:pointer">`
              : `<button class="btn btn-sm btn-ghost" data-refresh-captcha>获取验证码</button>`}
          </div>
        </div>` : ''}`;
    } else if (w.adapter === 'custom') {
      fields = `
        <div class="field">
          <label>课表 JSON 地址</label>
          <input class="input" data-field="baseUrl" placeholder="https://example.com/api/timetable" value="${escapeHtml(w.form.baseUrl)}" autocomplete="off" inputmode="url">
        </div>
        <div class="field">
          <label>Cookie（可选）</label>
          <input class="input" data-field="cookie" placeholder="如学校接口需要登录态" value="${escapeHtml(w.form.cookie)}" autocomplete="off">
        </div>
        <div class="hint-text">返回 JSON 需包含课表数组，支持正方 <code>kbList</code>、强智 <code>data</code> 或通用字段（课程名/教师/教室/星期/节次/周次）。</div>`;
    }

    return `
      <div class="field">
        <label>学校</label>
        <select class="select" data-school>
          ${SCHOOL_PRESETS.map((s) => `<option value="${s.id}" ${w.schoolId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <div class="hint-text">${escapeHtml(preset.note)}</div>
      </div>
      ${w.schoolId === 'whcibe' ? `<div class="notice ok">${icon('check')}<span>已内置 <b>武汉纺织大学外经贸学院</b> 教务系统（${escapeHtml(preset.baseUrl)}）。该地址在公网可直接访问，无需校园网，填写学号与密码即可导入。</span></div>` : ''}
      <div class="field">
        <label>教务系统类型</label>
        <select class="select" data-field="adapter">
          ${ADAPTERS.map((a) => `<option value="${a.id}" ${w.adapter === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
        </select>
        <div class="hint-text">${escapeHtml(adapter.desc)}</div>
      </div>
      ${fields}
      ${w.error ? `<div class="notice warn">${icon('info')}<span>${escapeHtml(w.error)}</span></div>` : ''}
      ${w.error ? `<button class="btn btn-block btn-ghost btn-sm" data-go-paste style="margin-top:-4px">改用“粘贴课表网页”导入</button>` : ''}
      <div class="notice warn" style="margin-top:14px">${icon('info')}<span>各校教务系统版本差异较大，若自动导入失败，通常是因为学校关闭了接口、需要验证码或校园网限制。可先用“粘贴网页”导入。</span></div>`;
  }

  function pasteHtml() {
    return `
      <div class="notice">${icon('info')}<span>在已登录的教务系统课表页面按 <b>Ctrl+U</b> 查看源码，全选复制后粘贴到这里；也可以粘贴 JSON 或 CSV 文本。</span></div>
      <div class="field">
        <label>课表内容 <span class="aux">支持 HTML / JSON / CSV</span></label>
        <textarea class="textarea" data-paste rows="9" placeholder="粘贴课表网页源码、JSON 或 CSV…" style="min-height:180px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px">${escapeHtml(w.pasteText || '')}</textarea>
      </div>
      ${w.error ? `<div class="notice warn">${icon('info')}<span>${escapeHtml(w.error)}</span></div>` : ''}
      <div class="field-row">
        <button class="btn btn-ghost" data-pick-file>${icon('grid')}读取文件</button>
        <button class="btn btn-primary" data-parse>${icon('search')}解析课表</button>
      </div>
      <input type="file" accept=".csv,.ics,.json,.txt,.html,.htm" data-file hidden>`;
  }

  function shareHtml() {
    return `
      <div class="notice">${icon('info')}<span>分享码以 <b>ST1.</b> 开头，包含课程名称、教师、地点、时间与周次，不包含账号信息。</span></div>
      <div class="field">
        <label>分享码</label>
        <textarea class="textarea" data-paste rows="5" placeholder="ST1.eyJ2IjoxLCJuIjoi…" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px">${escapeHtml(w.pasteText || '')}</textarea>
      </div>
      ${w.error ? `<div class="notice warn">${icon('info')}<span>${escapeHtml(w.error)}</span></div>` : ''}
      <button class="btn btn-primary btn-block" data-parse>${icon('download')}解析分享码</button>`;
  }

  function previewHtml() {
    const rows = w.courses.map((c, i) => {
      const on = w.selected.has(i);
      return `
        <label class="import-row ${on ? '' : 'off'}" data-row="${i}">
          <span class="dot" style="background:${c.color}"></span>
          <span class="tx">
            <b>${escapeHtml(c.name)}</b>
            <span>${dayCN(c.day)} ${formatPeriodsRange(c.start, c.end)} · ${escapeHtml(formatWeeks(c.weeks))}${c.room ? ` · ${escapeHtml(c.room)}` : ''}</span>
          </span>
          <span class="cbx">${on ? icon('check') : ''}</span>
        </label>`;
    }).join('');

    const existing = new Set(store.get().courses.map(courseKey));
    const duplicates = w.courses.filter((c) => existing.has(courseKey(c))).length;

    return `
      <div class="import-preview-head">
        <span>共 ${w.courses.length} 条 · 已选 <b data-count>${w.selected.size}</b> 条</span>
        <span>
          <button class="mini-chip" data-select-all>全选</button>
          <button class="mini-chip" data-select-none>全不选</button>
        </span>
      </div>
      ${duplicates ? `<div class="notice warn">${icon('info')}<span>其中 ${duplicates} 条与现有课程重复，合并模式会自动合并周次。</span></div>` : ''}
      <div class="import-list">${rows || emptyState('calendar', '没有可导入的课程', '请返回上一步重新解析。')}</div>
      ${w.skipped.length ? `<div class="notice warn" style="margin-top:12px">${icon('info')}<span>${w.skipped.length} 条记录无法识别（${escapeHtml(w.skipped.slice(0, 2).map((s) => s.error).join('；'))}），已跳过。</span></div>` : ''}

      <div class="field-label" style="margin-top:16px">导入方式</div>
      <div class="radio-group">
        <label class="radio-card ${w.mode === 'merge' ? 'active' : ''}" data-mode="merge">
          <span class="mark"></span>
          <span><b>合并到现有课表</b><span>保留现有课程，重复课程合并周次（推荐）</span></span>
        </label>
        <label class="radio-card ${w.mode === 'replace' ? 'active' : ''}" data-mode="replace">
          <span class="mark"></span>
          <span><b>覆盖现有课表</b><span>清空当前课程后导入，待办与设置保留</span></span>
        </label>
      </div>`;
  }

  function doneHtml() {
    return `
      <div style="text-align:center;padding:26px 10px 10px">
        <div style="width:64px;height:64px;margin:0 auto 14px;border-radius:50%;background:rgba(23,166,115,.12);color:var(--ok);display:flex;align-items:center;justify-content:center">
          ${icon('check')}
        </div>
        <b style="font-size:16px">导入成功</b>
        <p class="hint-text" style="margin-top:6px">已写入 <b>${w.importedCount || 0}</b> 条课程安排${w.mode === 'merge' ? '（合并模式）' : '（覆盖模式）'}。</p>
      </div>
      <div class="notice">${icon('info')}<span>课表已按“今天”所在周自动定位。你可以在“我的 → 学期设置”里调整开学日期与总周数。</span></div>`;
  }


  function footHtml() {
    if (w.step === 'source') {
      return `<button class="btn btn-ghost" data-cancel>取消</button>`;
    }
    if (w.step === 'system' || w.step === 'paste' || w.step === 'share') {
      return `<button class="btn btn-ghost" data-back>上一步</button>
              <button class="btn btn-primary" data-run ${w.busy ? 'disabled' : ''}>${w.busy ? '<span class="spinner"></span> 正在导入' : '开始导入'}</button>`;
    }
    if (w.step === 'preview') {
      return `<button class="btn btn-ghost" data-back>上一步</button>
              <button class="btn btn-primary" data-import ${w.selected.size ? '' : 'disabled'}>导入 ${w.selected.size} 条</button>`;
    }
    return `<button class="btn btn-primary" data-finish>完成</button>`;
  }


  function bind() {
    const fileInput = bodyEl.querySelector('[data-file]');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await handleFile(file);
      });
    }

    bodyEl.querySelectorAll('[data-source]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const source = btn.dataset.source;
        w.source = source;
        w.error = '';
        if (source === 'weblogin') {
          if (window.SuperTableAndroid && typeof window.SuperTableAndroid.openWebImport === 'function') {
            api.close();
            openWebImportUrlSheet();
          } else {
            showWebImportHelp();
          }
          return;
        }
        if (source === 'system') {
          w.step = 'system';
          paint();
        } else if (source === 'paste') {
          w.step = 'paste';
          paint();
        } else if (source === 'share') {
          w.step = 'share';
          paint();
        } else if (source === 'file') {
          bodyEl.querySelector('[data-file]')?.click();
        }
      });
    });

    const adapterSelect = bodyEl.querySelector('[data-field="adapter"]');
    if (adapterSelect) {
      adapterSelect.addEventListener('change', () => {
        w.adapter = adapterSelect.value;
        w.error = '';
        w.sessionId = null;
        w.needCaptcha = false;
        w.captchaImage = '';
        paint();
      });
    }

    const schoolSelect = bodyEl.querySelector('[data-school]');
    if (schoolSelect) {
      schoolSelect.addEventListener('change', () => {
        const preset = SCHOOL_PRESETS.find((s) => s.id === schoolSelect.value) || defaultSchool;
        w.schoolId = preset.id;
        if (preset.baseUrl) w.form.baseUrl = preset.baseUrl;
        if (preset.adapter) w.adapter = preset.adapter;
        w.error = '';
        w.sessionId = null;
        w.needCaptcha = false;
        w.captchaImage = '';
        paint();
      });
    }

    bodyEl.querySelectorAll('[data-field]').forEach((input) => {
      const key = input.dataset.field;
      if (!key || key === 'adapter') return;
      input.addEventListener('input', () => {
        w.form[key] = input.value;
      });
    });

    bodyEl.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        w.mode = el.dataset.mode;
        paint();
      });
    });

    bodyEl.querySelectorAll('[data-row]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(el.dataset.row);
        if (w.selected.has(idx)) w.selected.delete(idx);
        else w.selected.add(idx);
        paint();
      });
    });

    const selectAll = bodyEl.querySelector('[data-select-all]');
    if (selectAll) {
      selectAll.addEventListener('click', () => {
        w.courses.forEach((_, i) => w.selected.add(i));
        paint();
      });
    }
    const selectNone = bodyEl.querySelector('[data-select-none]');
    if (selectNone) {
      selectNone.addEventListener('click', () => {
        w.selected.clear();
        paint();
      });
    }

    bodyEl.querySelector('[data-parse]')?.addEventListener('click', () => {
      const ta = bodyEl.querySelector('[data-paste]');
      w.pasteText = ta?.value || '';
      parsePasted(w.pasteText);
    });

    bodyEl.querySelector('[data-pick-file]')?.addEventListener('click', () => {
      bodyEl.querySelector('[data-file]')?.click();
    });

    bodyEl.querySelector('[data-refresh-captcha]')?.addEventListener('click', () => {
      w.sessionId = null;
      startSystemImport();
    });
    bodyEl.querySelector('[data-captcha-img]')?.addEventListener('click', () => {
      w.sessionId = null;
      w.needCaptcha = false;
      startSystemImport();
    });

    bodyEl.querySelector('[data-go-paste]')?.addEventListener('click', () => {
      w.step = 'paste';
      w.error = '';
      paint();
    });

    footEl.querySelector('[data-cancel]')?.addEventListener('click', () => api.close());
    footEl.querySelector('[data-back]')?.addEventListener('click', () => {
      w.error = '';
      if (w.step === 'preview') {
        w.step = ['paste', 'share', 'system'].includes(w.source) ? w.source : 'source';
      } else {
        w.step = 'source';
      }
      paint();
    });
    footEl.querySelector('[data-run]')?.addEventListener('click', () => {
      if (w.busy) return;
      if (w.step === 'paste' || w.step === 'share') {
        parsePasted(bodyEl.querySelector('[data-paste]')?.value || '');
        return;
      }
      startSystemImport();
    });
    footEl.querySelector('[data-import]')?.addEventListener('click', doImport);
    footEl.querySelector('[data-finish]')?.addEventListener('click', () => api.close());
  }


  async function handleFile(file) {
    try {
      const text = await readFileText(file);
      w.pasteText = text;
      w.source = 'file';
      if (/<table|<html/i.test(text)) {
        const res = parseHtmlTable(text);
        applyParse(res, file.name);
      } else {
        const res = detectAndParse(text);
        applyParse(res, file.name);
      }
    } catch (err) {
      w.error = `读取文件失败：${err.message}`;
      w.step = 'paste';
      paint();
    }
  }

  function parsePasted(text) {
    if (!String(text || '').trim()) {
      w.error = '请先粘贴课表内容';
      paint();
      return;
    }
    w.error = '';
    try {
      const res = /<table|<html/i.test(text) && !/^ST1\./.test(text.trim())
        ? parseHtmlTable(text)
        : detectAndParse(text);
      applyParse(res, '粘贴内容');
    } catch (err) {
      w.error = `解析失败：${err.message}`;
      paint();
    }
  }

  function applyParse(res, from) {
    if (!res || !res.courses?.length) {
      w.error = res?.error || '没有解析到课程，请检查内容是否完整';
      paint();
      return;
    }
    w.courses = res.courses;
    w.skipped = res.skipped || [];
    w.selected = new Set(res.courses.map((_, i) => i));
    w.parsedFrom = from;
    w.step = 'preview';
    paint();
    toast(`识别到 ${res.courses.length} 条课程`);
  }


  async function startSystemImport() {
    if (w.busy) return;
    w.error = '';

    if (location.protocol === 'file:') {
      w.error = '直接打开 HTML 时无法访问导入接口，请先运行 `node server/index.js`，再通过 http://127.0.0.1:5178 打开。';
      paint();
      return;
    }
    const baseUrl = String(w.form.baseUrl || '').trim();

    if (w.adapter === 'zfsoft' || w.adapter === 'zfsoft-old') {
      if (!/^https?:\/\//i.test(baseUrl)) {
        w.error = '请填写以 http:// 或 https:// 开头的教务系统地址';
        paint();
        return;
      }
      if (!w.form.username.trim() || !w.form.password) {
        w.error = '请填写学号与密码';
        paint();
        return;
      }
    }
    if (w.adapter === 'custom' && !/^https?:\/\//i.test(baseUrl)) {
      w.error = '请填写课表 JSON 地址';
      paint();
      return;
    }

    w.busy = true;
    paint();

    try {
      if (!w.sessionId) {
        const start = await postJSON('/api/import/start', {
          adapter: w.adapter,
          baseUrl,
          cookie: w.form.cookie,
        });
        if (!start.ok) throw new Error(start.message || '无法连接教务系统');
        w.sessionId = start.sessionId;
        if (start.needCaptcha) {
          w.needCaptcha = true;
          w.captchaImage = start.captchaDataUrl || '';
          w.busy = false;
          paint();
          toast('该教务系统需要验证码');
          return;
        }
      }

      const data = await postJSON('/api/import/run', {
        sessionId: w.sessionId,
        username: w.form.username.trim(),
        password: w.form.password,
        year: Number(w.form.year),
        term: w.form.term,
        captcha: w.form.captcha,
        baseUrl,
        cookie: w.form.cookie,
      });

      if (!data.ok) {
        if (data.needCaptcha) {
          w.needCaptcha = true;
          w.captchaImage = data.captchaDataUrl || '';
          w.error = data.message || '验证码错误，请重试';
          w.busy = false;
          paint();
          return;
        }
        throw new Error(data.message || '导入失败');
      }

      let courses = data.courses || [];
      let skipped = data.skipped || [];
      if (!courses.length && data.raw) {
        const rawText = typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw);
        const parsed = detectAndParse(rawText);
        courses = parsed.courses || [];
        skipped = parsed.skipped || [];
        if (!courses.length && parsed.error) throw new Error(parsed.error);
      }
      if (!courses.length && data.html) {
        const parsed = parseHtmlTable(data.html);
        courses = parsed.courses;
        skipped = parsed.skipped || [];
      }
      if (!courses.length) throw new Error('登录成功，但没有解析到课程。请确认学期选择是否正确。');

      w.busy = false;
      w.courses = courses;
      w.skipped = skipped;
      w.selected = new Set(courses.map((_, i) => i));
      w.parsedFrom = '教务系统';
      w.schoolName = data.school || '';
      w.step = 'preview';
      paint();
      toast(`成功抓取 ${courses.length} 条课程`);
    } catch (err) {
      w.busy = false;
      w.error = friendlyError(err);
      paint();
    }
  }

  function friendlyError(err) {
    const msg = String(err?.message || err);
    if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
      return '无法连接本机导入服务。请用 `node server/index.js` 启动服务后，通过 http://127.0.0.1:5178 打开本应用。';
    }
    return msg;
  }


  function doImport() {
    const picked = [...w.selected].sort((a, b) => a - b).map((i) => w.courses[i]).filter(Boolean);
    if (!picked.length) {
      toast('请至少选择一条课程');
      return;
    }
    if (w.mode === 'replace') {
      store.replaceCourses(picked);
    } else {
      store.mergeCourses(picked);
    }
    if (w.schoolName) store.setSettings({ school: w.schoolName });
    store.setMeta({
      lastImportAt: new Date().toISOString(),
      lastImportSource: w.parsedFrom || w.source,
    });
    w.importedCount = picked.length;
    w.step = 'done';
    paint();
    toast(`已导入 ${picked.length} 条课程`);
  }

  function openWebImportUrlSheet() {
    const preset = SCHOOL_PRESETS[0];
    const saved = store.get().settings.loginUrl || preset.baseUrl;
    openSheet({
      title: '网页登录导入',
      sub: '填写学校教务系统登录页网址',
      body: `
        <div class="field">
          <label>教务系统网址</label>
          <input class="input" data-login-url value="${escapeHtml(saved)}" placeholder="http://jw.example.edu.cn" inputmode="url" autocomplete="off">
          <div class="hint-text">填写登录页地址，例如 http://jw.whcibe.com；也可以填其他学校的正方/教务地址。</div>
        </div>`,
      foot: `<button class="btn btn-ghost" data-cancel>取消</button><button class="btn btn-primary" data-open>打开并登录</button>`,
      onMount(sheet) {
        sheet.query('[data-cancel]').addEventListener('click', () => sheet.close());
        sheet.query('[data-open]').addEventListener('click', () => {
          let url = sheet.query('[data-login-url]').value.trim();
          if (!url) {
            toast('请填写教务系统网址');
            return;
          }
          if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
          if (!/^https?:\/\/[^\s/]+/i.test(url)) {
            toast('请输入有效的网址');
            return;
          }
          store.setSettings({ loginUrl: url });
          sheet.close();
          window.SuperTableAndroid.openWebImport(url);
        });
      },
    });
  }

  function showWebImportHelp() {
    openSheet({
      title: '网页登录导入',
      body: `
        <div class="notice">${icon('info')}<span>“网页登录导入”在 Android App 内使用：App 会打开教务系统，你自己登录并打开课表后，点页面下方的「导入当前课表」即可，App 不保存你的密码。</span></div>
        <div class="hint-text">电脑/网页版请使用「账号导入」，或登录教务系统后复制课表网页源码，用「粘贴课表网页」导入。</div>`,
      foot: `<button class="btn btn-primary" data-ok>知道了</button>`,
      onMount(sheet) {
        sheet.query('[data-ok]').addEventListener('click', () => sheet.close());
      },
    });
  }

  return api;
}

if (typeof window !== 'undefined') {
  window.__ST_IMPORT_PAYLOAD__ = (payload) => {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload || {};
      let courses = [];
      let skipped = [];
      if (data.raw) {
        const parsed = detectAndParse(typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw));
        courses = parsed.courses || [];
        skipped = parsed.skipped || [];
      }
      if (!courses.length && data.html) {
        const parsed = parseHtmlTable(data.html);
        courses = parsed.courses || [];
        skipped = parsed.skipped || [];
      }
      if (!courses.length) {
        toast(data.error || '没有从当前页面识别到课表，请确认已打开课表页面');
        return;
      }
      openImportWizard({ initialCourses: courses, skipped, source: '网页登录导入' });
    } catch (err) {
      toast(`网页导入失败：${err.message}`);
    }
  };
}

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`服务端返回异常（HTTP ${res.status}）`);
  }
}

export { toISODate };
