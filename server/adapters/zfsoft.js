
import { dedupe, parseZfkb } from '../../js/importers.js';
import { buildUrl, request, toDataUrl } from '../lib/http.js';
import { encryptPassword } from '../lib/rsa.js';

const enc = (data) => new URLSearchParams(data).toString();

async function fetchCaptcha(session) {
  const paths = ['xtgl/login_captcha.html', 'kaptcha'];
  for (const path of paths) {
    try {
      const res = await request(session, `${buildUrl(session.baseUrl, path)}?time=${Date.now()}`, {
        headers: { Accept: 'image/*' },
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 80) return toDataUrl(buf, res.headers.get('content-type') || 'image/png');
    } catch {
    }
  }
  return '';
}

export async function probe(session) {
  const res = await request(session, `${buildUrl(session.baseUrl, 'xtgl/login_slogin.html')}?time=${Date.now()}`);
  const html = await res.text();
  if (!/登录|login|用户名|密码/i.test(html)) {
    throw new Error('该地址不像是正方教务系统登录页，请检查地址是否正确');
  }
  const hasCaptchaImg = /id=["']captchaImg["']|id=["']yzmDiv["']|login_captcha\.html/i.test(html) && !/id=["']yzmDiv["'][^>]*display:\s*none/i.test(html);
  return {
    needCaptcha: hasCaptchaImg,
    captchaDataUrl: hasCaptchaImg ? await fetchCaptcha(session) : '',
  };
}

function hiddenValue(html, name) {
  const tag = html.match(new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, 'i'))?.[0];
  if (!tag) return '';
  return tag.match(/value=["']([^"']*)["']/i)?.[1] || '';
}

function extractTips(html) {
  const m = html.match(/id=["']tips["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function isLoginPage(text) {
  return /login_slogin/i.test(text) && /id=["']yhm["']/i.test(text);
}

async function queryTerm(session, { username, year, xqm }) {
  const base = session.baseUrl;
  const su = encodeURIComponent(username);
  const body = enc({ xnm: String(year), xqm, kzlx: 'ck', xsdm: '' });
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Referer: buildUrl(base, 'xtgl/index_initMenu.html'),
  };

  const attempts = [
    { method: 'POST', url: `${buildUrl(base, 'kbcx/xskbcx_cxXsgrkb.html')}?gnmkdm=N2151&su=${su}`, headers, body },
    { method: 'GET', url: `${buildUrl(base, 'kbcx/xskbcx_cxXsgrkb.html')}?gnmkdm=N2151&su=${su}&xnm=${year}&xqm=${xqm}`, headers },
    {
      method: 'POST',
      url: `${buildUrl(base, 'kbcx/xskbcx_cxXsgrkb.html')}?doType=query&gnmkdm=N2151&su=${su}`,
      headers,
      body,
    },
  ];

  let empty = null;
  for (const attempt of attempts) {
    let res;
    try {
      res = await request(session, attempt.url, attempt);
    } catch {
      continue;
    }
    const text = await res.text();
    if (!text.trim()) continue;
    if (isLoginPage(text)) {
      return { ok: false, authError: true, message: '登录状态失效，请重新导入' };
    }
    if (/^\s*[{[]/.test(text)) {
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      const parsed = parseZfkb(payload);
      let courses = parsed.courses;
      if (Array.isArray(payload?.sjkList) && payload.sjkList.length) {
        const practical = parseZfkb(payload.sjkList);
        if (practical.courses.length) courses = dedupe([...courses, ...practical.courses]);
      }
      if (courses.length) {
        return { ok: true, courses, skipped: parsed.skipped };
      }
      empty = { ok: true, empty: true, term: xqm };
    }
    if (/<table|<html/i.test(text) && /课表|节次|星期一/.test(text)) {
      return { ok: true, html: text, note: '已获取课表网页，正在解析' };
    }
  }
  return empty || { ok: true, empty: true, term: xqm };
}

async function fetchKb(session, { username, year, term }) {
  const primary = String(term) === '2' ? '12' : '3';
  const order = [primary, primary === '3' ? '12' : '3'];
  let last = null;
  for (const xqm of order) {
    const result = await queryTerm(session, { username, year, xqm });
    if (result?.authError) return result;
    if (result?.ok && (result.courses?.length || result.html)) return result;
    last = result;
  }
  return {
    ok: false,
    message: '登录成功，但没有获取到课表。请确认学年与学期选择正确，或先在教务系统中完成教学评价后再试。',
    detail: last,
  };
}

export async function run(session, { username, password, year, term, captcha }) {
  const base = session.baseUrl;
  if (!username || !password) return { ok: false, message: '请填写学号与密码' };

  if (!session.loggedIn) {
    const loginUrl = `${buildUrl(base, 'xtgl/login_slogin.html')}?time=${Date.now()}`;
    const page = await request(session, loginUrl);
    const html = await page.text();
    const csrf = hiddenValue(html, 'csrftoken');

    const keyRes = await request(session, `${buildUrl(base, 'xtgl/login_getPublicKey.html')}?time=${Date.now()}`);
    const keyText = await keyRes.text();
    let keyData;
    try {
      keyData = JSON.parse(keyText);
    } catch {
      return { ok: false, message: '未获取到登录公钥，该学校可能不是正方新版系统，建议改用“粘贴课表网页”导入' };
    }
    const modulus = keyData.modulus || keyData.modulusStr || keyData.publicKey;
    const exponent = keyData.exponent || keyData.exponentStr || 'AQAB';
    if (!modulus) {
      return { ok: false, message: '教务系统未返回登录公钥，建议改用“粘贴课表网页”导入' };
    }

    let mm;
    try {
      mm = encryptPassword(modulus, exponent, password);
    } catch (err) {
      return { ok: false, message: `密码加密失败：${err.message}` };
    }

    const params = {
      csrftoken: csrf,
      yhm: username,
      mm,
      language: 'zh_CN',
      ydType: '',
    };
    if (captcha) params.yzm = captcha;

    const res = await request(session, `${buildUrl(base, 'xtgl/login_slogin.html')}?time=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: loginUrl,
        Origin: base,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: enc(params),
      redirect: 'manual',
    });

    const status = res.status;
    const text = await res.text();
    const tips = extractTips(text);

    if (status >= 300 && status < 400) {
      const location = res.headers.get('location') || '';
      if (/login/i.test(location) && !/index/i.test(location)) {
        return { ok: false, message: '登录未成功，请检查学号与密码' };
      }
      session.loggedIn = true;
    } else if (/验证码/.test(tips)) {
      return {
        ok: false,
        needCaptcha: true,
        captchaDataUrl: await fetchCaptcha(session),
        message: tips || '需要验证码，请输入后重试',
      };
    } else if (tips && /(密码|用户名|用户|账号|锁定|冻结|错误|不正确)/.test(tips)) {
      return { ok: false, message: tips };
    } else if (isLoginPage(text)) {
      return { ok: false, message: '登录失败，请检查学号、密码或教务系统地址是否正确' };
    } else {
      session.loggedIn = true;
    }

    if (session.loggedIn) {
      try {
        const indexRes = await request(session, buildUrl(base, 'xtgl/index_initMenu.html'), {
          headers: { Referer: loginUrl },
        });
        const indexText = await indexRes.text();
        if (isLoginPage(indexText)) {
          session.loggedIn = false;
          return { ok: false, message: '登录未成功，请检查学号、密码或该账号是否被限制登录' };
        }
      } catch {
      }
    }
  }

  return fetchKb(session, { username, year, term });
}
