
import { randomUUID } from 'node:crypto';
import { CookieJar, normalizeBase } from './lib/http.js';
import * as zfsoft from './adapters/zfsoft.js';
import * as zfsoftOld from './adapters/zfsoft-old.js';
import * as custom from './adapters/custom.js';

const SESSION_TTL = 10 * 60 * 1000;
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) sessions.delete(id);
  }
}, 60 * 1000).unref();

function friendlyError(err) {
  const msg = String(err?.message || err || '未知错误');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|timed out|TimeoutError|network/i.test(msg)) {
    return '无法连接教务系统：请确认地址正确、校园网可访问，或该系统未对校外开放。';
  }
  if (/certificate|CERT_|self signed/i.test(msg)) {
    return '教务系统证书无效（自签名），服务端已拒绝连接。可改用“粘贴课表网页”导入。';
  }
  return msg;
}

export async function startImport(payload = {}) {
  const adapter = String(payload.adapter || '');
  if (!['zfsoft', 'zfsoft-old', 'custom'].includes(adapter)) {
    return { ok: false, message: '不支持的导入方式' };
  }

  const session = {
    id: randomUUID(),
    adapter,
    baseUrl: '',
    cookie: String(payload.cookie || ''),
    jar: new CookieJar(),
    createdAt: Date.now(),
  };

  try {
    session.baseUrl = normalizeBase(payload.baseUrl);
  } catch (err) {
    return { ok: false, message: err.message };
  }

  sessions.set(session.id, session);

  try {
    let probe = { needCaptcha: false, captchaDataUrl: '' };
    if (adapter === 'zfsoft') probe = await zfsoft.probe(session);
    else if (adapter === 'zfsoft-old') probe = await zfsoftOld.probe(session);
    else probe = await custom.probe(session);

    return { ok: true, sessionId: session.id, ...probe };
  } catch (err) {
    sessions.delete(session.id);
    return { ok: false, message: friendlyError(err) };
  }
}

export async function runImport(payload = {}) {
  const session = sessions.get(String(payload.sessionId || ''));
  if (!session) {
    return { ok: false, message: '导入会话已过期，请关闭后重新开始导入' };
  }
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(session.id);
    return { ok: false, message: '导入会话已过期，请重新开始导入' };
  }

  const credentials = {
    username: String(payload.username || '').trim(),
    password: String(payload.password || ''),
    year: Number(payload.year) || new Date().getFullYear(),
    term: String(payload.term || '1'),
    captcha: String(payload.captcha || ''),
  };

  try {
    let result;
    if (session.adapter === 'custom') {
      if (payload.cookie) session.cookie = String(payload.cookie);
      result = await custom.run(session);
    } else if (session.adapter === 'zfsoft') {
      result = await zfsoft.run(session, credentials);
    } else {
      result = await zfsoftOld.run(session, credentials);
    }

    if (result.ok) sessions.delete(session.id);
    return result;
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export function sessionCount() {
  return sessions.size;
}
