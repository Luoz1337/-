
import { parseGenericJson } from '../../js/importers.js';
import { request } from '../lib/http.js';

export async function probe(session) {
  if (!/^https?:\/\//i.test(session.baseUrl || '')) {
    throw new Error('请填写课表 JSON 地址');
  }
  return { needCaptcha: false, captchaDataUrl: '' };
}

export async function run(session) {
  const headers = { Accept: 'application/json, text/plain, */*' };
  if (session.cookie) headers.Cookie = session.cookie;
  const res = await request(session, session.baseUrl, { headers });
  if (!res.ok) {
    return { ok: false, message: `接口返回 HTTP ${res.status}` };
  }
  const text = await res.text();
  const parsed = parseGenericJson(text);
  if (!parsed.courses.length) {
    return { ok: false, message: parsed.error || '接口没有返回可识别的课程' };
  }
  return { ok: true, courses: parsed.courses, skipped: parsed.skipped };
}
