package com.supertable.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.Debug;

import java.io.BufferedReader;
import java.io.FileReader;
import java.security.MessageDigest;
import java.util.Locale;

final class SecurityCheck {

    private static final String CERT_SHA256 =
            "1f3fd4f4d180e72e99b286b21c1001cc350f85b39eb778efb532ab1bf8a70289";

    static boolean verify(Context context) {
        try {
            if (Debug.isDebuggerConnected()) return false;
            if ((context.getApplicationInfo().flags
                    & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) return false;
            if (isTraced()) return false;
            if (isHooked()) return false;
            return CERT_SHA256.equals(certHash(context));
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isTraced() {
        try {
            BufferedReader reader = new BufferedReader(new FileReader("/proc/self/status"));
            try {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("TracerPid:")) {
                        return Integer.parseInt(line.substring(10).trim()) != 0;
                    }
                }
            } finally {
                reader.close();
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private static boolean isHooked() {
        try {
            BufferedReader reader = new BufferedReader(new FileReader("/proc/self/maps"));
            try {
                String line;
                while ((line = reader.readLine()) != null) {
                    String lower = line.toLowerCase(Locale.US);
                    if (lower.contains("frida") || lower.contains("xposed")
                            || lower.contains("substrate") || lower.contains("libgadget")
                            || lower.contains("libhook")) {
                        return true;
                    }
                }
            } finally {
                reader.close();
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private static String certHash(Context context) throws Exception {
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        byte[] cert;
        if (Build.VERSION.SDK_INT >= 28) {
            SigningInfo info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo;
            if (info == null) return "";
            cert = info.hasMultipleSigners()
                    ? info.getApkContentsSigners()[0].toByteArray()
                    : info.getSigningCertificateHistory()[0].toByteArray();
        } else {
            PackageInfo info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
            cert = info.signatures[0].toByteArray();
        }
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(cert);
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
