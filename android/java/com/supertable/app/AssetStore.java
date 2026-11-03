package com.supertable.app;

import android.content.Context;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class AssetStore {

    private static final String VERSION = "3.2.3";
    private static final String AAD = "SuperTable-3.2.3";
    private static final String KEY_HEX =
            "7d3f9a2c5e8b1f4a6c9d0e3b7a5f2c8d1e4b6a9f0c3d5e7a2b4c6d8e0f1a3b5c";

    static File ensure(Context context) throws Exception {
        File base = context.getFilesDir();
        File dir = new File(base, "www");
        File marker = new File(dir, ".v");

        byte[] packed = readAll(context.getAssets().open("www.enc"));
        if (packed.length < 32) throw new IOException("资源包不完整");
        String signature = sha256Hex(packed);
        if (marker.isFile() && signature.equals(readText(marker).trim())) {
            return dir;
        }

        byte[] iv = Arrays.copyOfRange(packed, 0, 12);
        byte[] tag = Arrays.copyOfRange(packed, packed.length - 16, packed.length);
        byte[] body = Arrays.copyOfRange(packed, 12, packed.length - 16);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,
                new SecretKeySpec(hex(KEY_HEX), "AES"),
                new GCMParameterSpec(128, iv));
        cipher.updateAAD(AAD.getBytes(StandardCharsets.UTF_8));
        byte[] sealed = new byte[body.length + tag.length];
        System.arraycopy(body, 0, sealed, 0, body.length);
        System.arraycopy(tag, 0, sealed, body.length, tag.length);
        byte[] zip = cipher.doFinal(sealed);

        File tmp = new File(base, "www.new");
        delete(tmp);
        if (!tmp.mkdirs() && !tmp.isDirectory()) throw new IOException("无法创建资源目录");
        unzip(new ByteArrayInputStream(zip), tmp);
        writeText(new File(tmp, ".v"), signature);

        delete(dir);
        if (!tmp.renameTo(dir)) throw new IOException("无法写入资源目录");
        return dir;
    }

    private static void unzip(InputStream input, File dest) throws IOException {
        String root = dest.getCanonicalPath();
        ZipInputStream zip = new ZipInputStream(input);
        try {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (name == null || name.contains("..")) continue;
                File out = new File(dest, name);
                String path = out.getCanonicalPath();
                if (!path.equals(root) && !path.startsWith(root + File.separator)) continue;
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory()) parent.mkdirs();
                FileOutputStream output = new FileOutputStream(out);
                try {
                    int read;
                    while ((read = zip.read(buffer)) > 0) output.write(buffer, 0, read);
                } finally {
                    output.close();
                }
            }
        } finally {
            zip.close();
        }
    }

    private static void delete(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) delete(child);
        }
        file.delete();
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
        input.close();
        return output.toByteArray();
    }

    private static String readText(File file) throws IOException {
        return new String(readAll(new FileInputStream(file)), StandardCharsets.UTF_8);
    }

    private static void writeText(File file, String text) throws IOException {
        FileOutputStream output = new FileOutputStream(file);
        output.write(text.getBytes(StandardCharsets.UTF_8));
        output.close();
    }

    private static byte[] hex(String value) {
        int len = value.length();
        byte[] out = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            out[i / 2] = (byte) ((Character.digit(value.charAt(i), 16) << 4)
                    + Character.digit(value.charAt(i + 1), 16));
        }
        return out;
    }

    private static String sha256Hex(byte[] data) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(data);
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
