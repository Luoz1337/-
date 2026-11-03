
import { buildUrl, request, toDataUrl } from '../lib/http.js';

const enc = (data) => new URLSearchParams(data).toString();

function hiddenValue(html, name) {
  const tag = html.match(new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, 'i'))?.[0];
  if (!tag) return '';
  return tag.match(/value=["']([^"']*)["']/i)?.[1] || '';
}

async function captchaImage(session) {
  for (const path of ['CheckCode.aspx', 'CheckCode.aspx?time=' + Date.now()]) {
    try {
      const res = await request(session, buildUrl(session.baseUrl, path), { headers: { Accept: 'image/*' } });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 80) return toDataUrl(buf, res.headers.get('content-type') || 'image/gif');
    } catch {
    }
  }
  return '';
}

export async function probe(session) {
  const res = await request(session, buildUrl(session.baseUrl, 'default2.aspx'), { redirect: 'follow' });
  const html = await res.text();
  if (!/登录|default2|用户名|密码/.test(html)) {
    throw new Error('该地址不像是正方旧版教务系统，请检查地址是否正确');
  }
  const needCaptcha = /txtSecretCode|CheckCode\.aspx/i.test(html);
  return {
    needCaptcha,
    captchaDataUrl: needCaptcha ? await captchaImage(session) : '',
  };
}

export async function run(session, { username, password, captcha }) {
  if (!username || !password) return { ok: false, message: '请填写学号与密码' };
  const base = session.baseUrl;
  const loginUrl = buildUrl(base, 'default2.aspx');

  const page = await request(session, loginUrl);
  const html = await page.text();
  const viewstate = hiddenValue(html, '__VIEWSTATE');
  const eventvalidation = hiddenValue(html, '__EVENTVALIDATION');
  if (!viewstate) return { ok: false, message: '登录页结构异常，建议改用“粘贴课表网页”导入' };

  const params = {
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: viewstate,
    __EVENTVALIDATION: eventvalidation,
    txtUserName: username,
    TextBox2: password,
    txtSecretCode: captcha || '',
    RadioButtonList1: '学生',
    Button1: '',
    lbLanguage: '',
    hidPdrs: '',
    hidsc: '',
  };

  const res = await request(session, loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: loginUrl, Origin: base },
    body: enc(params),
  });
  const text = await res.text();

  if (/验证码/.test(text) && /(错误|不正确|为空|失效)/.test(text)) {
    return { ok: false, needCaptcha: true, captchaDataUrl: await captchaImage(session), message: '验证码错误，请重试' };
  }
  if (/用户名或密码|密码不正确|用户不存在|账号不存在/.test(text)) {
    return { ok: false, message: '学号或密码不正确' };
  }

  const nameMatch = text.match(/var\s+xhxm\s*=\s*["']([^"']+)["']/i) || text.match(/欢迎您[：:]\s*([^<（(\n]+)/);
  let name = nameMatch ? nameMatch[1].replace(username, '').trim() : '';
  if (!name) {
    try {
      const cookieName = session.jar.map.get('xhxm');
      if (cookieName) name = decodeURIComponent(cookieName).replace(username, '').trim();
    } catch {
    }
  }
  if (/txtUserName/.test(text) && !/xhxm|xs_main/i.test(text)) {
    return { ok: false, message: '登录失败，请检查账号密码、地址，或该学校是否需要验证码' };
  }

  const kbUrl = `${buildUrl(base, 'xskbcx.aspx')}?xh=${encodeURIComponent(username)}&xm=${encodeURIComponent(name)}&gnmkdm=N121603`;
  const kb = await request(session, kbUrl, {
    headers: { Referer: `${buildUrl(base, 'xs_main.aspx')}?xh=${encodeURIComponent(username)}` },
  });
  const kbHtml = await kb.text();
  if (/请重新登录|登录超时|default2\.aspx/.test(kbHtml) && /<form/i.test(kbHtml) && !/课表/.test(kbHtml)) {
    return { ok: false, message: '登录状态失效，请重新导入' };
  }
  if (!/课表|节次|星期一/.test(kbHtml)) {
    return { ok: false, message: '未获取到课表页面，可能需要先在教务系统中完成选课或评价' };
  }
  return { ok: true, html: kbHtml };
}
