package com.supertable.app;

// Built by Luoz1337

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;

public class MainActivity extends Activity {

    public static final int REQUEST_WEB_IMPORT = 1002;
    private static final int REQUEST_FILE = 1001;

    private WebView webView;
    private LocalServer server;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (!SecurityCheck.verify(this)) {
            Toast.makeText(this, "应用校验失败，请从官方渠道重新安装", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#3B6CFF"));
        window.setNavigationBarColor(Color.parseColor("#0F131C"));

        File www;
        try {
            www = AssetStore.ensure(this);
        } catch (Exception e) {
            Toast.makeText(this, "资源加载失败，请重新安装应用", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        server = new LocalServer(this, www);
        int port = 0;
        try {
            port = server.start();
        } catch (Exception ignored) {
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F2F4F8"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SuperTableApp/3.2.3");
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new Bridge(this), "SuperTableAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && (host.equals("127.0.0.1") || host.equals("localhost"))) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    startActivityForResult(Intent.createChooser(intent, "选择课表文件"), REQUEST_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        setContentView(webView);

        if (port > 0) {
            webView.loadUrl("http://127.0.0.1:" + port + "/");
        } else {
            webView.loadData("<h3 style='padding:24px;font-family:sans-serif'>本地服务启动失败，请重启 App</h3>",
                    "text/html; charset=utf-8", "UTF-8");
        }
    }

    void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    public void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 2002);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_WEB_IMPORT) {
            if (resultCode == RESULT_OK && data != null) {
                final String payload = data.getStringExtra("payload");
                if (payload != null && webView != null) {
                    webView.evaluateJavascript(
                            "window.__ST_IMPORT_PAYLOAD__ && window.__ST_IMPORT_PAYLOAD__("
                                    + JSONObject.quote(payload) + ")",
                            null);
                }
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                handleBack();
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(
                "(window.__ST_HANDLE_BACK__ && window.__ST_HANDLE_BACK__()) === true",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if ("true".equals(value)) return;
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            finish();
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.removeJavascriptInterface("SuperTableAndroid");
            webView.destroy();
            webView = null;
        }
        if (server != null) {
            server.stop();
            server = null;
        }
        super.onDestroy();
    }
}
