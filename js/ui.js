
import { escapeHtml } from './util.js';

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

let toastTimer = null;
export function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function shade(hex, percent) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const target = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  r = Math.round((target - r) * p + r);
  g = Math.round((target - g) * p + g);
  b = Math.round((target - b) * p + b);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexAlpha(hex, alpha) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function openSheet({
  title = '',
  sub = '',
  body = '',
  foot = '',
  tall = false,
  closable = true,
  onMount,
  onClose,
  sheetClass = '',
} = {}) {
  const layers = document.getElementById('layers');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.style.position = 'absolute';
  wrap.style.inset = '0';
  wrap.innerHTML = `
    <div class="backdrop" data-close></div>
    <div class="sheet ${tall ? 'tall' : ''} ${sheetClass}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="sheet-head">
        <div class="handle"></div>
        <div class="row">
          <h2>${escapeHtml(title)}</h2>
          ${closable ? `<button class="icon-btn plain" data-close aria-label="关闭">${icon('close')}</button>` : ''}
        </div>
        ${sub ? `<div class="sub">${sub}</div>` : ''}
      </div>
      <div class="sheet-body">${body}</div>
      ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
    </div>`;
  layers.appendChild(wrap);
  layers.classList.add('active');

  const backdrop = wrap.querySelector('.backdrop');
  const panel = wrap.querySelector('.sheet');
  const bodyEl = wrap.querySelector('.sheet-body');
  const headEl = wrap.querySelector('.sheet-head');

  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    panel.classList.add('show');
  });

  let closed = false;
  const api = {
    wrap,
    panel,
    body: bodyEl,
    head: headEl,
    close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('show');
      panel.classList.remove('show');
      setTimeout(() => {
        wrap.remove();
        if (!layers.children.length) layers.classList.remove('active');
      }, 300);
      onClose?.(result);
    },
    setTitle(text) {
      panel.querySelector('h2').textContent = text;
    },
    query(sel) {
      return panel.querySelector(sel);
    },
    queryAll(sel) {
      return [...panel.querySelectorAll(sel)];
    },
  };

  const onKey = (e) => {
    if (e.key === 'Escape') api.close();
  };
  document.addEventListener('keydown', onKey);

  wrap.querySelectorAll('[data-close]').forEach((node) => {
    node.addEventListener('click', () => api.close());
  });

  onMount?.(api);
  return api;
}

export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const sheet = openSheet({
      title,
      body: `<div style="font-size:13px;line-height:1.8;color:var(--text-2);padding:2px 0 4px">${message}</div>`,
      foot: `
        <button class="btn btn-ghost" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${escapeHtml(confirmText)}</button>`,
      onMount(api) {
        api.query('[data-cancel]').addEventListener('click', () => api.close(false));
        api.query('[data-ok]').addEventListener('click', () => api.close(true));
      },
      onClose(result) {
        if (decided) return;
        decided = true;
        resolve(Boolean(result));
      },
    });
    return sheet;
  });
}

export function emptyState(iconName, title, desc, actionHtml = '') {
  return `
    <div class="empty">
      <div class="glyph">${icon(iconName)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${desc}</p>
      ${actionHtml}
    </div>`;
}

export function relativeDayLabel(dateStr) {
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return dateStr;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff < 7) return `${diff} 天后`;
  if (diff < -1 && diff > -7) return `${-diff} 天前`;
  return dateStr;
}

export function skeletonRows(count = 4) {
  return Array.from({ length: count }, () => `
    <div style="height:46px;border-radius:11px;background:var(--surface-3);margin-bottom:8px;opacity:.7"></div>`).join('');
}
