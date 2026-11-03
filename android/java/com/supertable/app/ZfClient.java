package com.supertable.app;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;

public class ZfClient {

    private static final String UA = "Mozilla/5.0 (Linux; Android 14; V2329A) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

    private final String base;
    private final Map<String, String> cookies = new LinkedHashMap<String, String>();

    static class Resp {
        int status;
        String location;
        String text;
        byte[] bytes;
        String contentType;
    }

    ZfClient(String base, String cookie) {
        this.base = base;
        if (cookie != null && !cookie.isEmpty()) {
            for (String part : cookie.split(";")) {
                int idx = part.indexOf('=');
                if (idx > 0) {
                    cookies.put(part.substring(0, idx).trim(), part.substring(idx + 1).trim());
                }
            }
        }
    }

    JSONObject probe() throws Exception {
        String ts = String.valueOf(System.currentTimeMillis());
        Resp page = request("GET", "/xtgl/login_slogin.html?time=" + ts, null, false,
                base + "/xtgl/login_slogin.html");
        String html = page.text == null ? "" : page.text;
        if (!html.contains("登录") && !html.toLowerCase(Locale.US).contains("login")) {
            throw new IOException("该地址不像是正方教务系统登录页，请检查地址");
        }
        boolean needCaptcha = html.contains("captchaImg") || html.contains("login_captcha.html");
        if (html.contains("id=\"yzmDiv\"")) {
            needCaptcha = true;
            Matcher matcher = Pattern.compile("id=\"yzmDiv\"[^>]*style=\"([^\"]*)\"", Pattern.CASE_INSENSITIVE)
                    .matcher(html);
            if (matcher.find() && matcher.group(1).toLowerCase(Locale.US).contains("display:none")) {
                needCaptcha = false;
            }
        }
        JSONObject out = new JSONObject();
        out.put("needCaptcha", needCaptcha);
        out.put("captchaDataUrl", needCaptcha ? fetchCaptcha() : "");
        return out;
    }

    JSONObject fetchWithCookie(String username, int year, String term) throws Exception {
        return fetchKb(username == null ? "" : username, year, term);
    }

    JSONObject loginAndFetch(String username, String password, int year, String term, String captcha)
            throws Exception {
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            return error("请填写学号与密码");
        }
        username = username.trim();
        String ts = String.valueOf(System.currentTimeMillis());

        Resp page = request("GET", "/xtgl/login_slogin.html?time=" + ts, null, false,
                base + "/xtgl/login_slogin.html");
        String csrf = match(page.text, "name=\"csrftoken\"[^>]*value=\"([^\"]*)\"");

        Resp keyResp = request("GET", "/xtgl/login_getPublicKey.html?time=" + ts, null, false,
                base + "/xtgl/login_slogin.html");
        JSONObject key;
        try {
            key = new JSONObject(keyResp.text);
        } catch (Exception e) {
            return error("未获取到登录公钥，该学校可能不是正方新版系统，建议改用粘贴课表网页");
        }
        String modulus = key.optString("modulus", key.optString("modulusStr", ""));
        String exponent = key.optString("exponent", key.optString("exponentStr", "AQAB"));
        if (modulus.isEmpty()) {
            return error("教务系统未返回登录公钥，建议改用粘贴课表网页");
        }

        String encrypted;
        try {
            encrypted = rsaEncrypt(modulus, exponent, password);
        } catch (Exception e) {
            return error("密码加密失败：" + e.getMessage());
        }

        StringBuilder form = new StringBuilder();
        form.append("csrftoken=").append(enc(csrf));
        form.append("&yhm=").append(enc(username));
        form.append("&mm=").append(enc(encrypted));
        form.append("&language=zh_CN&ydType=");
        if (captcha != null && !captcha.isEmpty()) {
            form.append("&yzm=").append(enc(captcha));
        }

        Resp login = request("POST", "/xtgl/login_slogin.html?time=" + ts, form.toString(), true,
                base + "/xtgl/login_slogin.html");
        if (login.status >= 300 && login.status < 400) {
        } else {
            String tips = tips(login.text);
            if (tips.contains("验证码")) {
                JSONObject out = error(tips.isEmpty() ? "需要验证码，请输入后重试" : tips);
                out.put("needCaptcha", true);
                out.put("captchaDataUrl", fetchCaptcha());
                return out;
            }
            if (!tips.isEmpty() && Pattern.compile("(密码|用户名|用户|账号|锁定|错误|不正确)")
                    .matcher(tips).find()) {
                return error(tips);
            }
            if (isLoginPage(login.text)) {
                return error("登录失败，请检查学号、密码或教务系统地址是否正确");
            }
        }

        Resp index = request("GET", "/xtgl/index_initMenu.html", null, false,
                base + "/xtgl/login_slogin.html");
        if (isLoginPage(index.text)) {
            return error("登录未成功，请检查学号、密码或账号是否被限制登录");
        }

        return fetchKb(username, year, term);
    }

    private JSONObject fetchKb(String username, int year, String term) throws Exception {
        String primary = "2".equals(term) ? "12" : "3";
        String[] terms = new String[]{primary, "3".equals(primary) ? "12" : "3"};
        boolean sawEmpty = false;
        for (String xqm : terms) {
            JSONObject result = queryTerm(username, year, xqm);
            if (result.optBoolean("authError")) {
                return error("登录状态失效，请重新导入");
            }
            if (result.optBoolean("ok")) {
                if (result.optBoolean("empty")) {
                    sawEmpty = true;
                    continue;
                }
                return result;
            }
        }
        if (sawEmpty) {
            return error("登录成功，但这个学期的课表为空。请确认学年和学期是否选择正确。");
        }
        return error("登录成功，但没有获取到课表。请确认学年学期，或先在教务系统中完成教学评价后再试。");
    }

    private JSONObject queryTerm(String username, int year, String xqm) throws Exception {
        String su = enc(username);
        String body = "xnm=" + year + "&xqm=" + xqm + "&kzlx=ck&xsdm=";
        String kbPath = "/kbcx/xskbcx_cxXsgrkb.html";

        String[][] attempts = new String[][]{
                {"POST", kbPath + "?gnmkdm=N2151&su=" + su, body},
                {"GET", kbPath + "?gnmkdm=N2151&su=" + su + "&xnm=" + year + "&xqm=" + xqm, null},
                {"POST", kbPath + "?doType=query&gnmkdm=N2151&su=" + su, body}
        };

        for (String[] attempt : attempts) {
            Resp response;
            try {
                response = request(attempt[0], attempt[1], attempt[2], false,
                        base + "/xtgl/index_initMenu.html");
            } catch (IOException e) {
                continue;
            }
            String text = response.text == null ? "" : response.text.trim();
            if (text.isEmpty()) continue;
            if (isLoginPage(text)) {
                JSONObject out = error("登录状态失效，请重新导入");
                out.put("authError", true);
                return out;
            }
            if (text.startsWith("{") || text.startsWith("[")) {
                boolean empty = false;
                try {
                    JSONObject json = new JSONObject(text);
                    JSONArray list = json.optJSONArray("kbList");
                    empty = list == null || list.length() == 0;
                } catch (Exception ignored) {
                }
                JSONObject out = ok();
                out.put("raw", text);
                out.put("empty", empty);
                return out;
            }
            if (text.contains("<table") && (text.contains("课表") || text.contains("星期一") || text.contains("节次"))) {
                JSONObject out = ok();
                out.put("html", text);
                return out;
            }
        }

        JSONObject out = ok();
        out.put("empty", true);
        return out;
    }

    private String fetchCaptcha() {
        String ts = String.valueOf(System.currentTimeMillis());
        String[] paths = new String[]{"/xtgl/login_captcha.html?time=" + ts, "/kaptcha?time=" + ts};
        for (String path : paths) {
            try {
                Resp response = request("GET", path, null, false, base + "/xtgl/login_slogin.html");
                if (response.bytes != null && response.bytes.length > 80) {
                    String type = response.contentType == null ? "image/png" : response.contentType;
                    if (type.contains(";")) type = type.substring(0, type.indexOf(';'));
                    return "data:" + type + ";base64,"
                            + Base64.encodeToString(response.bytes, Base64.NO_WRAP);
                }
            } catch (Exception ignored) {
            }
        }
        return "";
    }

    private Resp request(String method, String path, String body, boolean manual, String referer)
            throws IOException {
        URL url = new URL(base + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(25000);
        conn.setInstanceFollowRedirects(!manual);
        conn.setRequestMethod(method);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.6");
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
        conn.setRequestProperty("X-Requested-With", "XMLHttpRequest");
        if (referer != null) conn.setRequestProperty("Referer", referer);
        String cookieHeader = cookieHeader();
        if (!cookieHeader.isEmpty()) conn.setRequestProperty("Cookie", cookieHeader);

        if (body != null) {
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setFixedLengthStreamingMode(data.length);
            OutputStream output = conn.getOutputStream();
            output.write(data);
            output.close();
        }

        int status = conn.getResponseCode();
        absorbCookies(conn.getHeaderFields());

        Resp response = new Resp();
        response.status = status;
        response.location = conn.getHeaderField("Location");
        response.contentType = conn.getContentType();

        InputStream input = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        byte[] data = readAll(input);
        response.bytes = data;

        String charset = "UTF-8";
        if (response.contentType != null) {
            Matcher matcher = Pattern.compile("charset=([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE)
                    .matcher(response.contentType);
            if (matcher.find()) {
                String value = matcher.group(1).toLowerCase(Locale.US);
                if (value.contains("gbk") || value.contains("gb2312")) charset = "GBK";
            }
        }
        response.text = new String(data, charset);
        conn.disconnect();
        return response;
    }

    private void absorbCookies(Map<String, List<String>> headers) {
        if (headers == null) return;
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            String key = entry.getKey();
            if (key == null || !key.equalsIgnoreCase("Set-Cookie")) continue;
            for (String raw : entry.getValue()) {
                if (raw == null) continue;
                int semi = raw.indexOf(';');
                String pair = semi >= 0 ? raw.substring(0, semi) : raw;
                int eq = pair.indexOf('=');
                if (eq > 0) {
                    cookies.put(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
                }
            }
        }
    }

    private String cookieHeader() {
        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, String> entry : cookies.entrySet()) {
            if (builder.length() > 0) builder.append("; ");
            builder.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return builder.toString();
    }

    private static boolean isLoginPage(String html) {
        return html != null && html.contains("login_slogin") && html.contains("id=\"yhm\"");
    }

    private static String tips(String html) {
        if (html == null) return "";
        Matcher matcher = Pattern.compile("id=\"tips\"[^>]*>(.*?)</(?:p|div)>", Pattern.DOTALL).matcher(html);
        if (matcher.find()) {
            return matcher.group(1).replaceAll("<[^>]+>", "").replaceAll("\\s+", " ").trim();
        }
        return "";
    }

    private static String match(String text, String regex) {
        if (text == null) return "";
        Matcher matcher = Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text);
        return matcher.find() ? matcher.group(1) : "";
    }

    private static String enc(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private static String rsaEncrypt(String modulusValue, String exponentValue, String password)
            throws Exception {
        BigInteger modulus = new BigInteger(1, decodeKey(modulusValue));
        BigInteger exponent = new BigInteger(1, decodeKey(exponentValue));
        PublicKey publicKey = KeyFactory.getInstance("RSA")
                .generatePublic(new RSAPublicKeySpec(modulus, exponent));
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, publicKey);
        byte[] encrypted = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private static byte[] decodeKey(String value) {
        String text = value == null ? "" : value.trim().replace("\\/", "/");
        if (text.matches("[0-9a-fA-F]+") && text.length() % 2 == 0) {
            byte[] result = new byte[text.length() / 2];
            for (int i = 0; i < result.length; i++) {
                result[i] = (byte) Integer.parseInt(text.substring(i * 2, i * 2 + 2), 16);
            }
            return result;
        }
        try {
            return Base64.decode(text, Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            return Base64.decode(text, Base64.URL_SAFE | Base64.NO_WRAP);
        }
    }

    static JSONObject fetchCustom(String url, String cookie) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(25000);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
        if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        int status = conn.getResponseCode();
        InputStream input = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        String text = new String(readAll(input), StandardCharsets.UTF_8);
        conn.disconnect();
        if (status >= 400) return error("接口返回 HTTP " + status);
        return ok().put("raw", text);
    }

    private static JSONObject ok() {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
        } catch (Exception ignored) {
        }
        return out;
    }

    private static JSONObject error(String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", false);
            out.put("message", message);
        } catch (Exception ignored) {
        }
        return out;
    }

    private static byte[] readAll(InputStream input) throws IOException {
        if (input == null) return new byte[0];
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
