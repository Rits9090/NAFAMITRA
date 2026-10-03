/**
 * Production preview server — zero dependencies.
 *
 * Serves the CRA build with content-hashed assets (stale bundles are
 * impossible: old hashes simply 404 → index.html refreshes), SPA fallback
 * for client routes, strict no-cache on index.html, and a transparent
 * /api reverse-proxy to the backend so the browser never needs localhost.
 *
 *   node scripts/serve.js   (PORT=3000, BACKEND=http://127.0.0.1:8001)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const BACKEND = process.env.BACKEND || 'http://127.0.0.1:8001';
const ROOT = path.resolve(__dirname, '..', 'build');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function sendFile(res, filePath, immutable) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
  };
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return false;
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
    return true;
  });
  return true;
}

function proxyApi(req, res) {
  const target = new URL(BACKEND);
  const opts = {
    hostname: target.hostname,
    port: target.port || 80,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  };
  const upstream = http.request(opts, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: { code: 'backend_unavailable', message: 'Backend is starting up. Please retry.' } }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, build: fs.existsSync(path.join(ROOT, 'index.html')) }));
  }

  if (url === '/api' || url.startsWith('/api/')) return proxyApi(req, res);

  // never cache the document shell
  if (url === '/' || url === '/index.html' || !path.extname(url)) {
    const idx = path.join(ROOT, 'index.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(idx).pipe(res);
    }
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    return res.end('Build not found. Run: npx craco build');
  }

  const candidate = path.join(ROOT, url);
  if (candidate.startsWith(ROOT) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    // hashed assets under /static/ are immutable; everything else no-cache
    return sendFile(res, candidate, url.startsWith('/static/'));
  }

  // unknown asset → SPA fallback (so a stale hashed URL never bricks the app)
  const idx = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(idx).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NafaMitra preview on :${PORT} → build ${ROOT}, api → ${BACKEND}`);
});
