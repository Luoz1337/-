
export const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];
export const WEEK_CN_FULL = ['一', '二', '三', '四', '五', '六', '日'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function uid(prefix = 'c') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function parseISODate(value) {
  if (value instanceof Date) return startOfDay(value);
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toISODate(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return startOfDay(x);
}

export function diffDays(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86400000);
}

export function mondayOf(d) {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  return addDays(startOfDay(d), -(day - 1));
}

export function fmtMD(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtCN(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtCNFull(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtCNRange(a, b) {
  if (!a || !b) return '';
  if (a.getMonth() === b.getMonth()) return `${a.getMonth() + 1}月${a.getDate()}日 - ${b.getDate()}日`;
  return `${fmtCN(a)} - ${fmtCN(b)}`;
}

export function weekdayOf(d) {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

export function dayCN(day) {
  return `周${WEEK_CN[clamp(Number(day) || 1, 1, 7) - 1]}`;
}

export function parseTimeToMinutes(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHHMM(min) {
  const m = clamp(Math.round(min), 0, 24 * 60 - 1);
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(str, len = 12) {
  const s = String(str ?? '');
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const bridge = typeof window !== 'undefined' ? window.SuperTableAndroid : null;
  if (bridge && typeof bridge.saveFile === 'function') {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      try {
        bridge.saveFile(filename, mime.split(';')[0], comma >= 0 ? result.slice(comma + 1) : '');
      } catch {
      }
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
  }
}
