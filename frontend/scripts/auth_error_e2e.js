/**
 * Auth error-path E2E: serves the REAL production build behind a stub API
 * that reproduces the production failure modes, then drives the login form
 * and asserts the user sees a SPECIFIC localized message — never the old
 * "Request failed. Please try again." mask.
 *
 *   node scripts/auth_error_e2e.js   [mode=html404|rate429|badphone]
 *
 * - html404 : static host / missing backend (HTML 404/rewrite response)
 * - rate429 : HTTP 429 without the NafaMitra error envelope
 * - badphone: real API envelope, code=invalid_phone
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

const MODE = process.argv[2] || process.env.STUB_MODE || 'html404';
const PORT = parseInt(process.env.STUB_PORT || '3210', 10);
const BUILD = path.resolve(__dirname, '..', 'build');

const STUBS = {
  html404: {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body>404 Not Found</body></html>',
    expect: 'सेवा सध्या उपलब्ध नाही', // err.unavailable (mr, default lang)
    expectKey: 'unavailable',
  },
  rate429: {
    status: 429,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Too many requests' }),
    expect: 'खूप वेळांनी OTP विनंती केली', // err.rateLimited (mr)
    expectKey: 'rateLimited',
  },
  badphone: {
    status: 400,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      error: { code: 'invalid_phone', message: 'Please enter a valid 10-digit mobile number.',
               message_mr: 'कृपया वैध 10 अंकी मोबाइल क्रमांक टाका.' },
    }),
    expect: 'वैध 10 अंकी', // auth.invalidPhone (mr)
    expectKey: 'invalidPhone',
  },
};
const stub = STUBS[MODE];
if (!stub) { console.error('unknown mode', MODE); process.exit(2); }

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };

let apiHits = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    apiHits++;
    res.writeHead(stub.status, stub.headers);
    res.end(stub.body);
    return;
  }
  let file = path.join(BUILD, url.pathname);
  if (!file.startsWith(BUILD)) { res.writeHead(403); res.end(); return; }
  let ok = false;
  try { ok = fs.statSync(file).isFile(); } catch { ok = false; }
  if (!ok) file = path.join(BUILD, 'index.html');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

class LocalOnly extends ResourceLoader {
  fetch(url, opts) {
    return /^https?:\/\/(127\.0\.0\.1|localhost):/.test(url) ? super.fetch(url, opts) : null;
  }
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  console.log(`== AUTH ERROR E2E [${MODE}] on :${PORT} ==`);

  const consoleErrors = [];
  const diagLogs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', (...a) => consoleErrors.push(a.map(String).join(' ')));
  vc.on('warn', (...a) => { const s = a.map(String).join(' '); if (s.includes('[api-error]')) diagLogs.push(s); });
  vc.on('log', () => {});

  const dom = await JSDOM.fromURL(`http://127.0.0.1:${PORT}/`, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
      window.scrollTo = () => {};
    },
  });
  const win = dom.window;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (sel, t = 8000) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const el = win.document.querySelector(sel); if (el) return el; await sleep(60); }
    return null;
  };
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const type = (el, val) => {
    const proto = win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };

  let failures = 0;
  const check = (name, ok, extra) => {
    if (ok) console.log('  ✓', name);
    else { failures++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
  };

  // journey → merchant login → phone → send OTP → error shown
  check('landing', !!(await waitFor('[data-testid="journey-landing"]')));
  click(await waitFor('[data-testid="journey-merchant-login"]'));
  check('phone form', !!(await waitFor('[data-testid="phone-form"]')));
  const phone = await waitFor('[data-testid="phone-input"]');
  type(phone, '9876543210');
  const form = win.document.querySelector('[data-testid="phone-form"]');
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

  const errEl = await waitFor('[data-testid="phone-error"]', 8000);
  check('error region appears', !!errEl);
  const shown = errEl ? errEl.textContent : '';
  console.log('  message:', JSON.stringify(shown));
  check('NO generic "Request failed" mask', !shown.includes('Request failed'), shown);
  check('localized expected message', shown.includes(stub.expect), `${shown} vs ${stub.expect}`);
  check('API was actually called', apiHits >= 1, apiHits);
  check('diagnostic logged (no secrets)', diagLogs.some((l) => {
    try { const d = JSON.parse(l.slice(l.indexOf('{'))); return d.code && d.path && !/otp|token/i.test(l); } catch { return false; }
  }), diagLogs);
  check('message does not leak internals', !/Traceback|SQL|stack|html/i.test(shown), shown);
  check('no crash (page errors)', consoleErrors.length === 0, consoleErrors.slice(0, 2));
  check('recoverable UI (form still there)', !!win.document.querySelector('[data-testid="phone-form"]'));

  console.log(failures === 0 ? `AUTH ERROR E2E [${MODE}]: PASS` : `AUTH ERROR E2E [${MODE}]: FAIL (${failures})`);
  win.close();
  server.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('crashed:', e); server.close(); process.exit(1); });
