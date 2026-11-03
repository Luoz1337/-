
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startImport, runImport, sessionCount } from './api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5178;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJson(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error(`请求体不是合法 JSON：${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.resolve(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 页面不存在');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, app: 'supertable', sessions: sessionCount(), uptime: process.uptime() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/import/start') {
        const body = await readJson(req);
        sendJson(res, 200, await startImport(body));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/import/run') {
        const body = await readJson(req);
        sendJson(res, 200, await runImport(body));
        return;
      }
      sendJson(res, 404, { ok: false, message: '接口不存在' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }
    await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) sendJson(res, 200, { ok: false, message: err.message || '服务端异常' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  课表 SuperTable 已启动\n  → http://${HOST}:${PORT}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，可用 PORT=其他端口 npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
