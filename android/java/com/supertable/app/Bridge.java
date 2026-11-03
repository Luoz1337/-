package com.supertable.app;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class Bridge {

    private final MainActivity activity;

    Bridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void syncReminders(final String json) {
        try {
            ReminderScheduler.sync(activity, json);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.requestNotificationPermission();
            }
        });
    }

    @JavascriptInterface
    public void openWebImport(final String baseUrl) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent intent = new Intent(activity, WebLoginActivity.class);
                    intent.putExtra("url",
                            baseUrl == null || baseUrl.isEmpty() ? "http://jw.whcibe.com" : baseUrl);
                    activity.startActivityForResult(intent, MainActivity.REQUEST_WEB_IMPORT);
                } catch (Exception e) {
                    activity.toast("无法打开教务系统：" + e.getMessage());
                }
            }
        });
    }

    @JavascriptInterface
    public void saveFile(final String name, final String mime, final String base64) {
        try {
            final byte[] data = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = activity.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("无法创建下载文件");
                OutputStream output = activity.getContentResolver().openOutputStream(uri);
                if (output == null) throw new IllegalStateException("无法写入下载文件");
                output.write(data);
                output.close();
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                activity.getContentResolver().update(uri, values, null, null);
                activity.toast("已保存到“下载”：" + name);
            } else {
                File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File file = new File(dir, name);
                FileOutputStream output = new FileOutputStream(file);
                output.write(data);
                output.close();
                activity.toast("已保存：" + file.getAbsolutePath());
            }
        } catch (Exception e) {
            activity.toast("保存失败：" + e.getMessage());
        }
    }
}
