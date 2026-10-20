/**
 * Auth error-path E2E: serves the REAL production build, then simulates the
 * failure modes a user can hit at sign-in and asserts a SPECIFIC localized
 * message — never a raw provider error, never a generic "Request failed"
 * mask, never a fake success.
 *
 *   node scripts/auth_error_e2e.js   [mode=html404|rate429|badphone]
 *
 * - html404 : Supabase auth endpoint answers with an HTML 404 page
 * - rate429 : HTTP 429 with the GoTrue rate-limit envelope
 * - badphone: client-side validation of the optional signup phone (no OTP)
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
    kind: 'response',
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body>404 Not Found</body></html>',
    expectAny: ['नेटवर्क', 'काहीतरी चूक'], // errNetwork / errGeneric (mr)
  },
  rate429: {
    kind: 'response',
    status: 429,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ error: 'over_request_rate_limit', error_description: 'Request rate limit exceeded' }),
    expectAny: ['खूप वेळांनी'], // errRateLimited (mr)
  },
  badphone: {
    kind: 'client',
    expectAny: ['वैध 10 अंकी'], // auth.invalidPhone (mr)
  },
};
const stub = STUBS[MODE];
if (!stub) { console.error('unknown mode', MODE); process.exit(2); }

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
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
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', (...a) => consoleErrors.push(a.map(String).join(' ')));
  vc.on('warn', () => {});
  vc.on('log', () => {});

  const supabaseHits = [];
  const dom = await JSDOM.fromURL(`http://127.0.0.1:${PORT}/`, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
      window.scrollTo = () => {};
      // Route every Supabase auth call through this mode's stub response.
      const NodeResponse = global.Response;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input);
        supabaseHits.push({ url: String(url), method: (init && init.method) || 'GET' });
        if (MODE === 'badphone') {
          // Client-side validation must prevent this — if we get here the
          // test still fails below; answer with a plausible network error.
          const err = new TypeError('Failed to fetch');
          throw err;
        }
        return new NodeResponse(stub.body, { status: stub.status, headers: stub.headers });
      };
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

  if (MODE === 'badphone') {
    // journey → signup → invalid phone → inline localized error, NO request
    check('landing', !!(await waitFor('[data-testid="journey-landing"]')));
    click(await waitFor('[data-testid="journey-merchant-signup"]'));
    check('signup form', !!(await waitFor('[data-testid="auth-signup-form"]')));
    type(await waitFor('[data-testid="auth-email-input"]'), 'phone.err@example.com');
    type(await waitFor('[data-testid="auth-password-input"]'), 'Supabase@123');
    type(await waitFor('[data-testid="auth-confirm-input"]'), 'Supabase@123');
    type(await waitFor('[data-testid="auth-phone-input"]'), '12345');
    win.document.querySelector('[data-testid="auth-signup-form"]')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    const phoneErr = await waitFor('[data-testid="auth-signup-form"] [role="alert"]', 6000);
    check('error region appears', !!phoneErr);
    const shown = phoneErr ? phoneErr.textContent : '';
    console.log('  message:', JSON.stringify(shown));
    check('localized expected message', stub.expectAny.some((x) => shown.includes(x)), shown);
    check('NO request was made (client validation)', supabaseHits.length === 0, JSON.stringify(supabaseHits));
    check('no crash (page errors)', consoleErrors.length === 0, consoleErrors.slice(0, 2));
    check('recoverable UI (form still there)', !!(await waitFor('[data-testid="auth-signup-form"]')));
  } else {
    // journey → sign-in → stubbed provider failure → localized message
    check('landing', !!(await waitFor('[data-testid="journey-landing"]')));
    click(await waitFor('[data-testid="journey-merchant-login"]'));
    check('sign-in form', !!(await waitFor('[data-testid="auth-signin-form"]')));
    type(await waitFor('[data-testid="auth-email-input"]'), 'err.path@example.com');
    type(await waitFor('[data-testid="auth-password-input"]'), 'Supabase@123');
    win.document.querySelector('[data-testid="auth-signin-form"]')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

    const errEl = await waitFor('[data-testid="auth-error"]', 10000);
    check('error region appears', !!errEl);
    const shown = errEl ? errEl.textContent : '';
    console.log('  message:', JSON.stringify(shown));
    check('NO generic "Request failed" mask', !shown.includes('Request failed'), shown);
    check('localized expected message', stub.expectAny.some((x) => shown.includes(x)),
      `${shown} vs ${JSON.stringify(stub.expectAny)}`);
    check('provider was actually called', supabaseHits.some((h) => h.url.includes('izfcjxabnahcsmzhosuo.supabase.co')),
      JSON.stringify(supabaseHits.map((h) => h.url)));
    check('no raw provider/stack leak', !/Traceback|SQL|stack|gotrue|AuthApiError|sb_publishable/i.test(shown), shown);
    check('no session created', !win.localStorage.getItem('nafamitra_token'));
    check('no crash (page errors)', consoleErrors.length === 0, consoleErrors.slice(0, 2));
    check('recoverable UI (form still there)', !!(await waitFor('[data-testid="auth-signin-form"]')));
  }

  console.log(failures === 0 ? `AUTH ERROR E2E [${MODE}]: PASS` : `AUTH ERROR E2E [${MODE}]: FAIL (${failures})`);
  win.close();
  server.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('crashed:', e); server.close(); process.exit(1); });
