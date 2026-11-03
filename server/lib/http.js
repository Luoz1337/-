
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class CookieJar {
  constructor() {
    this.map = new Map();
  }

  get size() {
    return this.map.size;
  }

  absorb(response) {
    const cookies = response.headers.getSetCookie?.() || [];
    for (const raw of cookies) {
      const pair = raw.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) this.map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  clear() {
    this.map.clear();
  }
}

export async function request(session, url, options = {}) {
  const headers = {
    'User-Agent': UA,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
    ...(options.headers || {}),
  };
  if (session?.jar?.size) headers.Cookie = session.jar.header();

  const res = await fetch(url, {
    ...options,
    headers,
    redirect: options.redirect || 'follow',
    signal: AbortSignal.timeout(options.timeout || 15000),
  });
  session?.jar?.absorb(res);
  return res;
}

export function normalizeBase(baseUrl) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) throw new Error('教务系统地址必须以 http:// 或 https:// 开头');
  const url = new URL(raw);
  if (!url.hostname) throw new Error('教务系统地址无效');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function buildUrl(base, path) {
  return `${base.replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

export function formBody(params) {
  return new URLSearchParams(params).toString();
}

export function toDataUrl(buffer, contentType = 'image/png') {
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

export function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
