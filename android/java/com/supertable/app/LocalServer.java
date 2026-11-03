package com.supertable.app;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocalServer {

    private final Context context;
    private final File wwwDir;
    private ServerSocket serverSocket;
    private ExecutorService pool;
    private volatile boolean running;
    private final Map<String, Session> sessions = new ConcurrentHashMap<String, Session>();

    private static final long SESSION_TTL = 10 * 60 * 1000L;

    private static final int BASE_PORT = 47821;

    static class Session {
        String id;
        String adapter;
        String baseUrl;
        String cookie;
        ZfClient client;
        long createdAt;
    }

    LocalServer(Context context, File wwwDir) {
        this.context = context;
        this.wwwDir = wwwDir;
    }

    int start() throws IOException {
        IOException last = null;
        for (int port = BASE_PORT; port < BASE_PORT + 20; port++) {
            try {
                serverSocket = new ServerSocket(port, 20, InetAddress.getByName("127.0.0.1"));
                break;
            } catch (IOException e) {
                last = e;
            }
        }
        if (serverSocket == null) {
            throw last != null ? last : new IOException("无法绑定本地端口");
        }
        pool = Executors.newFixedThreadPool(4);
        running = true;
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                while (running) {
                    try {
                        final Socket socket = serverSocket.accept();
                        pool.execute(new Runnable() {
                            @Override
                            public void run() {
                                handle(socket);
                            }
                        });
                    } catch (IOException e) {
                        if (running) e.printStackTrace();
                    }
                }
            }
        }, "supertable-local-server");
        thread.setDaemon(true);
        thread.start();
        return serverSocket.getLocalPort();
    }

    void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {
        }
        if (pool != null) pool.shutdownNow();
    }

    private void handle(Socket socket) {
        try {
            socket.setSoTimeout(30000);
            InputStream input = socket.getInputStream();
            ByteArrayOutputStream headBuffer = new ByteArrayOutputStream();
            int value;
            while ((value = input.read()) != -1) {
                headBuffer.write(value);
                byte[] bytes = headBuffer.toByteArray();
                int n = bytes.length;
                if (n >= 4
                        && bytes[n - 4] == '\r' && bytes[n - 3] == '\n'
                        && bytes[n - 2] == '\r' && bytes[n - 1] == '\n') {
                    break;
                }
                if (n >= 2 && bytes[n - 2] == '\n' && bytes[n - 1] == '\n') {
                    break;
                }
                if (n > 65536) break;
            }

            String head = new String(headBuffer.toByteArray(), StandardCharsets.UTF_8);
            String[] lines = head.split("\\r?\\n");
            if (lines.length == 0) return;
            String[] first = lines[0].split(" ");
            if (first.length < 2) return;

            String method = first[0];
            String target = first[1];
            String path = target.split("\\?")[0];

            Map<String, String> headers = new HashMap<String, String>();
            for (int i = 1; i < lines.length; i++) {
                int idx = lines[i].indexOf(':');
                if (idx > 0) {
                    headers.put(lines[i].substring(0, idx).trim().toLowerCase(Locale.US),
                            lines[i].substring(idx + 1).trim());
                }
            }

            int contentLength = 0;
            try {
                contentLength = Integer.parseInt(headers.containsKey("content-length")
                        ? headers.get("content-length") : "0");
            } catch (NumberFormatException ignored) {
            }
            if (contentLength < 0) contentLength = 0;
            if (contentLength > 1024 * 1024) contentLength = 0;

            byte[] body = new byte[contentLength];
            int read = 0;
            while (read < contentLength) {
                int count = input.read(body, read, contentLength - read);
                if (count < 0) break;
                read += count;
            }

            if ("/api/health".equals(path)) {
                sendJson(socket, 200, "{\"ok\":true,\"app\":\"supertable\"}");
                return;
            }

            if (path.startsWith("/api/")) {
                if (!"POST".equals(method)) {
                    sendJson(socket, 405, "{\"ok\":false,\"message\":\"Method Not Allowed\"}");
                    return;
                }
                String text = new String(body, 0, read, StandardCharsets.UTF_8);
                JSONObject request;
                try {
                    request = text.isEmpty() ? new JSONObject() : new JSONObject(text);
                } catch (Exception e) {
                    sendJson(socket, 200, error("请求格式错误").toString());
                    return;
                }
                JSONObject response;
                try {
                    if ("/api/import/start".equals(path)) {
                        response = startImport(request);
                    } else if ("/api/import/run".equals(path)) {
                        response = runImport(request);
                    } else {
                        response = error("接口不存在");
                    }
                } catch (Exception e) {
                    response = error(friendly(e));
                }
                sendJson(socket, 200, response.toString());
                return;
            }

            serveAsset(socket, path);
        } catch (Exception e) {
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    private void serveAsset(Socket socket, String path) throws IOException {
        String rel = "/".equals(path) ? "index.html" : path.substring(1);
        try {
            rel = URLDecoder.decode(rel, "UTF-8");
        } catch (Exception ignored) {
        }
        if (rel.contains("..")) {
            send(socket, 404, "text/plain; charset=utf-8", "404".getBytes(StandardCharsets.UTF_8), "no-store");
            return;
        }
        if (rel.endsWith("/")) rel = rel + "index.html";

        File file = new File(wwwDir, rel);
        if (!file.isFile()) {
            send(socket, 404, "text/plain; charset=utf-8", "404 Not Found".getBytes(StandardCharsets.UTF_8), "no-store");
            return;
        }
        InputStream stream = null;
        try {
            stream = new FileInputStream(file);
            byte[] data = readAll(stream);
            send(socket, 200, mimeOf(rel), data, "no-cache");
        } catch (IOException e) {
            send(socket, 404, "text/plain; charset=utf-8", "404 Not Found".getBytes(StandardCharsets.UTF_8), "no-store");
        } finally {
            if (stream != null) {
                try {
                    stream.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private JSONObject startImport(JSONObject request) throws Exception {
        cleanupSessions();
        String adapter = request.optString("adapter", "zfsoft");
        Session session = new Session();
        session.id = UUID.randomUUID().toString();
        session.adapter = adapter;
        session.createdAt = System.currentTimeMillis();

        if ("zfsoft".equals(adapter)) {
            String baseUrl = normalizeBase(request.optString("baseUrl", ""));
            session.baseUrl = baseUrl;
            session.cookie = request.optString("cookie", "");
            session.client = new ZfClient(baseUrl, session.cookie);
            JSONObject probe;
            try {
                probe = session.client.probe();
            } catch (Exception e) {
                return error(friendly(e));
            }
            sessions.put(session.id, session);
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("sessionId", session.id);
            out.put("needCaptcha", probe.optBoolean("needCaptcha"));
            out.put("captchaDataUrl", probe.optString("captchaDataUrl", ""));
            return out;
        }

        if ("custom".equals(adapter)) {
            session.baseUrl = normalizeBase(request.optString("baseUrl", ""));
            session.cookie = request.optString("cookie", "");
            sessions.put(session.id, session);
            return new JSONObject().put("ok", true).put("sessionId", session.id);
        }

        if ("demo".equals(adapter)) {
            sessions.put(session.id, session);
            return new JSONObject().put("ok", true).put("sessionId", session.id);
        }

        return error("不支持的导入方式");
    }

    private JSONObject runImport(JSONObject request) throws Exception {
        cleanupSessions();
        String id = request.optString("sessionId", "");
        Session session = sessions.get(id);
        if (session == null || System.currentTimeMillis() - session.createdAt > SESSION_TTL) {
            if (session != null) sessions.remove(id);
            return error("导入会话已过期，请重新开始导入");
        }

        if ("zfsoft".equals(session.adapter)) {
            JSONObject result = session.client.loginAndFetch(
                    request.optString("username", ""),
                    request.optString("password", ""),
                    request.optInt("year", 2026),
                    request.optString("term", "1"),
                    request.optString("captcha", ""));
            if (result.optBoolean("ok")) sessions.remove(id);
            return result;
        }

        if ("custom".equals(session.adapter)) {
            JSONObject result = ZfClient.fetchCustom(session.baseUrl,
                    request.optString("cookie", session.cookie));
            if (result.optBoolean("ok")) sessions.remove(id);
            return result;
        }

        return error("演示数据由客户端本地生成");
    }

    private void cleanupSessions() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Session> entry : sessions.entrySet()) {
            if (now - entry.getValue().createdAt > SESSION_TTL) sessions.remove(entry.getKey());
        }
    }

    private static String normalizeBase(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (!value.matches("(?i)^https?://.+")) {
            throw new IllegalArgumentException("教务系统地址必须以 http:// 或 https:// 开头");
        }
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private static String friendly(Exception e) {
        String message = e.getMessage();
        if (message == null || message.isEmpty()) message = e.toString();
        String lower = message.toLowerCase(Locale.US);
        if (lower.contains("failed to connect")
                || lower.contains("connection refused")
                || lower.contains("timeout")
                || lower.contains("timed out")
                || lower.contains("unable to resolve host")
                || lower.contains("network is unreachable")) {
            return "无法连接教务系统，请检查网络或系统是否可访问";
        }
        if (lower.contains("certificate") || lower.contains("ssl")) {
            return "教务系统证书异常，暂时无法建立安全连接";
        }
        return message;
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

    private static String mimeOf(String name) {
        String lower = name.toLowerCase(Locale.US);
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".ics")) return "text/calendar; charset=utf-8";
        return "application/octet-stream";
    }

    private static void sendJson(Socket socket, int status, String json) throws IOException {
        send(socket, status, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8), "no-store");
    }

    private static void send(Socket socket, int status, String contentType, byte[] body, String cache)
            throws IOException {
        OutputStream output = socket.getOutputStream();
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: " + cache + "\r\n"
                + "Connection: close\r\n\r\n";
        output.write(head.getBytes(StandardCharsets.UTF_8));
        output.write(body);
        output.flush();
    }

    private static String reason(int status) {
        if (status == 200) return "OK";
        if (status == 404) return "Not Found";
        if (status == 405) return "Method Not Allowed";
        return "OK";
    }
}
