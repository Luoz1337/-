package com.supertable.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.net.URLDecoder;
import java.util.Calendar;

public class WebLoginActivity extends Activity {

    private static final int BG = Color.parseColor("#3B6CFF");
    private static final int BG_LIGHT = Color.parseColor("#EEF3FF");

    private WebView webView;
    private Button importButton;
    private EditText urlEdit;
    private String baseUrl = "";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static final String EXTRACT_JS =
            "(function(){"
            + "function ok(t){var x=(t.innerText||t.textContent||'');"
            + "return /星期[一二三四五六日天]|周一|星期一/.test(x)&&/节/.test(x);}"
            + "function find(d){var a=d.querySelectorAll('table');"
            + "for(var i=0;i<a.length;i++){if(ok(a[i]))return a[i];}return null;}"
            + "var table=find(document);"
            + "if(!table){var fs=document.querySelectorAll('iframe');"
            + "for(var i=0;i<fs.length;i++){try{var d=fs[i].contentDocument;"
            + "if(d){var t=find(d);if(t){table=t;break;}}}catch(e){}}}"
            + "var html=table?table.outerHTML:'';"
            + "var body=document.body?(document.body.innerText||''):'';"
            + "var m=body.match(/(?:学号|用户名|账号)[：:]\\s*([0-9A-Za-z]+)/);"
            + "var el=document.querySelector('#xh_id, input[name=\"xh\"], #yhm, input[name=\"yhm\"]');"
            + "var user=(el&&el.value)||(m&&m[1])||'';"
            + "if(!user){var src=document.documentElement?(document.documentElement.innerHTML||''):'';"
            + "var m2=src.match(/(?:xh_id|yhm|xh)\\s*[\"']?\\s*[:=]\\s*[\"']?(\\d{6,})/);"
            + "if(m2)user=m2[1];}"
            + "return {html:html,url:location.href,user:user,hasTable:!!table};"
            + "})()";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(BG);
        window.setNavigationBarColor(Color.parseColor("#0F131C"));

        String initialUrl = getIntent().getStringExtra("url");
        initialUrl = initialUrl == null ? "" : initialUrl.trim();
        if (!initialUrl.isEmpty()
                && !initialUrl.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) {
            initialUrl = "http://" + initialUrl;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BG);
        bar.setPadding(dp(8), dp(8), dp(12), dp(8));

        TextView close = new TextView(this);
        close.setText("‹ 关闭");
        close.setTextColor(Color.WHITE);
        close.setTextSize(14);
        close.setPadding(dp(8), dp(8), dp(8), dp(8));
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        bar.addView(close);

        TextView title = new TextView(this);
        title.setText("登录教务系统");
        title.setTextColor(Color.WHITE);
        title.setTextSize(16);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        TextView spacer = new TextView(this);
        spacer.setText("  ");
        spacer.setTextSize(14);
        bar.addView(spacer);

        root.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout addressBar = new LinearLayout(this);
        addressBar.setOrientation(LinearLayout.HORIZONTAL);
        addressBar.setGravity(Gravity.CENTER_VERTICAL);
        addressBar.setBackgroundColor(Color.WHITE);
        addressBar.setPadding(dp(10), dp(6), dp(10), dp(6));

        urlEdit = new EditText(this);
        urlEdit.setSingleLine(true);
        urlEdit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        urlEdit.setTextSize(13);
        urlEdit.setHint("输入教务系统网址，例如 http://jw.example.edu.cn");
        urlEdit.setText(initialUrl);
        urlEdit.setPadding(dp(6), dp(6), dp(6), dp(6));
        addressBar.addView(urlEdit, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button go = new Button(this);
        go.setText("打开");
        go.setAllCaps(false);
        go.setTextSize(13);
        go.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openUrl(urlEdit.getText().toString());
            }
        });
        addressBar.addView(go, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(addressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView hint = new TextView(this);
        hint.setText("请登录并打开「课表查询」，再点下方按钮导入");
        hint.setTextColor(Color.parseColor("#3B5BA5"));
        hint.setTextSize(12);
        hint.setBackgroundColor(BG_LIGHT);
        hint.setPadding(dp(14), dp(8), dp(14), dp(8));
        root.addView(hint, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout frame = new FrameLayout(this);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " SuperTableApp/3.2.3");
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(view);
                resultMsg.sendToTarget();
                return true;
            }
        });

        frame.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        importButton = new Button(this);
        importButton.setText("导入当前课表");
        importButton.setAllCaps(false);
        importButton.setTextSize(15);
        importButton.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(BG);
        bg.setCornerRadius(dp(24));
        importButton.setBackground(bg);
        importButton.setPadding(dp(28), dp(12), dp(28), dp(12));
        importButton.setElevation(dp(6));
        importButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startImport();
            }
        });
        FrameLayout.LayoutParams btnLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        btnLp.bottomMargin = dp(22);
        frame.addView(importButton, btnLp);

        root.addView(frame, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        urlEdit.setText(initialUrl);
        if (!initialUrl.isEmpty()) openUrl(initialUrl);
    }

    private void openUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            Toast.makeText(this, "请输入教务系统网址", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!value.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) {
            value = "http://" + value;
        }
        if (!value.matches("(?i)^https?://.*")) {
            Toast.makeText(this, "只支持 http/https 网址", Toast.LENGTH_SHORT).show();
            return;
        }
        baseUrl = originOf(value);
        urlEdit.setText(value);
        webView.loadUrl(value);
    }

    private static String originOf(String url) {
        try {
            java.net.URI uri = java.net.URI.create(url);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) return url;
            int port = uri.getPort();
            return scheme + "://" + host + (port > 0 ? ":" + port : "");
        } catch (Exception e) {
            return url;
        }
    }

    private void startImport() {
        importButton.setEnabled(false);
        importButton.setText("正在读取页面…");
        webView.evaluateJavascript(EXTRACT_JS, new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                final JSONObject page = parsePage(value);
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        doImport(page);
                    }
                }).start();
            }
        });
    }

    private void doImport(JSONObject page) {
        JSONObject payload = new JSONObject();
        try {
            String html = page.optString("html", "");
            String user = page.optString("user", "");
            if (user.isEmpty() && !html.isEmpty()) {
                java.util.regex.Matcher um = java.util.regex.Pattern
                        .compile("(?:xh_id|yhm|xh)\\s*[\"']?\\s*[:=]\\s*[\"']?(\\d{6,})")
                        .matcher(html);
                if (um.find()) user = um.group(1);
            }
            String cookie = CookieManager.getInstance().getCookie(baseUrl);

            if (user.isEmpty() && cookie != null) {
                user = cookieValue(cookie, "yhm");
                if (user.isEmpty()) user = cookieValue(cookie, "xh");
            }
            if (!html.isEmpty()) payload.put("html", html);

            if (cookie == null || cookie.isEmpty()) {
                payload.put("error", "还没有登录教务系统，请先登录并打开课表页面");
            } else {
                try {
                    ZfClient client = new ZfClient(baseUrl, cookie);
                    Calendar now = Calendar.getInstance();
                    int year = now.get(Calendar.MONTH) >= 7
                            ? now.get(Calendar.YEAR) : now.get(Calendar.YEAR) - 1;
                    String term = (now.get(Calendar.MONTH) >= 1 && now.get(Calendar.MONTH) <= 6)
                            ? "2" : "1";
                    JSONObject result = client.fetchWithCookie(user, year, term);
                    if (result.optBoolean("ok")) {
                        String raw = result.optString("raw", "");
                        String apiHtml = result.optString("html", "");
                        if (!raw.isEmpty()) payload.put("raw", raw);
                        if (!apiHtml.isEmpty()) payload.put("html", apiHtml);
                    } else {
                        payload.put("error", result.optString("message", "使用登录状态读取课表失败"));
                    }
                } catch (Exception e) {
                    payload.put("error", "读取课表失败：" + e.getMessage());
                }
            }
        } catch (Exception e) {
            try {
                payload.put("error", "读取页面失败：" + e.getMessage());
            } catch (Exception ignored) {
            }
        }
        finishWithPayload(payload);
    }

    private void finishWithPayload(final JSONObject payload) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (isFinishing()) return;
                Intent data = new Intent();
                data.putExtra("payload", payload.toString());
                setResult(RESULT_OK, data);
                finish();
            }
        });
    }

    private static JSONObject parsePage(String value) {
        JSONObject empty = new JSONObject();
        if (value == null) return empty;
        String text = value.trim();
        if (text.isEmpty() || "null".equals(text)) return empty;
        try {
            if (text.startsWith("\"")) {
                text = new JSONObject("{\"v\":" + text + "}").optString("v", "");
            }
            if (text.startsWith("{")) return new JSONObject(text);
        } catch (Exception ignored) {
        }
        return empty;
    }

    private static String cookieValue(String cookie, String key) {
        if (cookie == null) return "";
        for (String part : cookie.split(";")) {
            int idx = part.indexOf('=');
            if (idx > 0 && part.substring(0, idx).trim().equals(key)) {
                String value = part.substring(idx + 1).trim();
                try {
                    return URLDecoder.decode(value, "UTF-8");
                } catch (Exception e) {
                    return value;
                }
            }
        }
        return "";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
