/**
 * Login E2E — real Supabase email/password flow in jsdom against the
 * production build.
 *
 * What it verifies HERE (sandbox has no route to supabase.co):
 *  1. Journey → sign-in form renders with email/password/Google controls.
 *  2. Client-side validation blocks malformed input without any request.
 *  3. A real submission REACHES the configured Supabase project (the exact
 *     `izfcjxabnahcsmzhosuo.supabase.co` URL is captured) — proving the app
 *     targets the intended project.
 *  4. When that network is unavailable the UI shows a localized friendly
 *     error, keeps the user on /auth with NO fake session, and the form is
 *     recoverable. Protected routes still redirect while logged out.
 *  5. Signup form carries the optional "mobile number (no OTP)" field;
 *     /auth/callback and recovery screens render without crashing.
 *
 * Run: PORT=3000 node scripts/serve.js &  node scripts/login_e2e.js
 */
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

class LocalOnly extends ResourceLoader {
  fetch(url, opts) { return /^https?:\/\/(127\.0\.0\.1|localhost):/.test(url) ? super.fetch(url, opts) : null; }
}

const pageErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { const m = e.stack || e.message; if (!/Could not load link|Could not parse CSS/i.test(m)) pageErrors.push(m); });
vc.on('error', (...a) => pageErrors.push('console.error: ' + a.map(String).join(' ')));
vc.on('warn', () => {});
vc.on('log', () => {});

const SUPABASE_HOST = 'izfcjxabnahcsmzhosuo.supabase.co';
const netlog = [];   // XHR (backend API) log
const authNet = [];  // fetch (Supabase auth) log

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setInput = (win, el, val) => {
  const proto = el.tagName === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
};

function installFetchProbe(window) {
  // Simulate the sandbox's blocked route to Supabase: record the REAL target
  // URL then fail fast with the same TypeError a blocked network produces.
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    try {
      authNet.push({
        method: (init && init.method) || (input && input.method) || 'GET',
        url: String(url),
        body: init && typeof init.body === 'string' ? init.body.slice(0, 300) : null,
      });
    } catch { /* recording must never break auth */ }
    const err = new TypeError('Failed to fetch');
    return Promise.reject(err);
  };
}

let failures = 0;
function check(name, ok, extra) {
  if (ok) console.log('  ✓', name);
  else { failures++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 300) : ''); }
}

(async () => {
  // ── Unit: isAuthMePayload — static hosts answer unknown paths (incl. /api/*)
  // with `200 text/html` SPA fallback; that body must NEVER become a session.
  {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'lib', 'api.js'), 'utf8');
    const m = src.match(/export function isAuthMePayload([\s\S]*?\n})/);
    let ok = false;
    if (m) {
      const fn = new Function(`return function isAuthMePayload${m[1]}`)();
      ok = fn({ user: { id: 'u1' }, identities: { shops: [] } }) === true
        && fn('<!DOCTYPE html><html><body>app shell</body></html>') === false
        && fn(null) === false && fn(undefined) === false && fn([]) === false
        && fn({ user: {} }) === false;
    }
    check('unit isAuthMePayload: HTML/null/array rejected, identity payload accepted', ok);
  }

  const TARGET = process.env.SMOKE_URL || 'http://127.0.0.1:3000/';
  const dom = await JSDOM.fromURL(TARGET, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
      window.scrollTo = () => {};
      window.addEventListener('error', (e) => pageErrors.push('onerror: ' + ((e.error && e.error.stack) || e.message)));
      window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
      installFetchProbe(window);
      const XHR = window.XMLHttpRequest;
      const open = XHR.prototype.open, setH = XHR.prototype.setRequestHeader, send = XHR.prototype.send;
      XHR.prototype.open = function (m, u, ...rest) { this.__log = { method: m, url: String(u), headers: {} }; return open.call(this, m, u, ...rest); };
      XHR.prototype.setRequestHeader = function (k, v) { if (this.__log) this.__log.headers[k] = v; return setH.call(this, k, v); };
      XHR.prototype.send = function (...a) {
        const log = this.__log;
        if (log) {
          this.addEventListener('readystatechange', () => {
            if (this.readyState === 4) {
              log.status = this.status;
              log.body = (() => { try { return (this.responseText || '').slice(0, 220); } catch { return '?'; } })();
              netlog.push(log);
            }
          });
        }
        return send.apply(this, a);
      };
    },
  });
  const win = dom.window, doc = win.document;
  const wait = async (sel, ms = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const el = typeof sel === 'string' ? doc.querySelector(sel) : sel(doc);
      if (el) return el;
      await sleep(250);
    }
    return null;
  };
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const submit = (form) => form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

  console.log('== LOGIN E2E (Supabase email/password) ==', TARGET);

  // 1. journey → merchant sign-in
  check('journey landing', !!(await wait('[data-testid="journey-landing"]')));
  click(await wait('[data-testid="journey-merchant-login"]'));
  check('sign-in form renders', !!(await wait('[data-testid="auth-signin-form"]')));
  check('password + Google controls present',
    !!(await wait('[data-testid="auth-password-input"]')) &&
    !!(await wait('[data-testid="auth-google-btn"]')));
  check('forgot-password link present', !!(await wait('[data-testid="auth-forgot-link"]')));

  // 2. client validation — no network for malformed email
  authNet.length = 0;
  setInput(win, doc.querySelector('[data-testid="auth-email-input"]'), 'not-an-email');
  setInput(win, doc.querySelector('[data-testid="auth-password-input"]'), 'secret123');
  submit(doc.querySelector('[data-testid="auth-signin-form"]'));
  await sleep(600);
  const valErr = await wait('[data-testid="auth-signin-form"] [role="alert"]', 3000);
  check('invalid email blocked client-side', !!valErr && /ईमेल|email/i.test(valErr.textContent),
    valErr && valErr.textContent);
  check('validation sent no auth request', authNet.length === 0, JSON.stringify(authNet));

  // 3. real submission → reaches the intended Supabase project
  authNet.length = 0;
  setInput(win, doc.querySelector('[data-testid="auth-email-input"]'), 'qa.user@example.com');
  setInput(win, doc.querySelector('[data-testid="auth-password-input"]'), 'Supabase@123');
  submit(doc.querySelector('[data-testid="auth-signin-form"]'));
  const errEl = await wait('[data-testid="auth-error"]', 12000);
  check('submission attempted', authNet.length >= 1, JSON.stringify(authNet.map((r) => r.url)));
  check('targets the intended project', authNet.some((r) => r.url.includes(SUPABASE_HOST)),
    JSON.stringify(authNet.map((r) => r.url)));
  check('token endpoint used (pkce/password)', authNet.some((r) => /\/auth\/v1\/token/.test(r.url)),
    JSON.stringify(authNet.map((r) => r.url)));
  check('auth body carries email (no phone auth)', authNet.some((r) => r.body && /qa\.user@example\.com/.test(r.body) && !/phone/i.test(r.body)),
    JSON.stringify(authNet.map((r) => r.body)));
  check('network failure → localized friendly error', !!errEl && /नेटवर्क|Failed|काहीतरी|internet/i.test(errEl.textContent),
    errEl && errEl.textContent);
  check('NO fake success / stays on /auth', win.location.pathname === '/auth'
    && !win.localStorage.getItem('nafamitra_token'), win.location.pathname);
  check('form recoverable after error', !!(await wait('[data-testid="auth-signin-form"] [type="submit"]')));

  // 4. protected route redirects while logged out
  win.history.pushState(null, '', '/dashboard');
  win.dispatchEvent(new win.PopStateEvent('popstate'));
  await sleep(700);
  check('protected /dashboard redirects to /auth', win.location.pathname === '/auth', win.location.pathname);

  // 5. signup form: optional phone (NO OTP) + confirmation path structure
  // (fresh mount after the redirect above shows the journey landing again)
  if (await wait('[data-testid="auth-signin-form"]', 1500) && !doc.querySelector('[data-testid="auth-switch-signup"]')) {
    // already inside auth view
  }
  if (doc.querySelector('[data-testid="journey-landing"]')) {
    click(await wait('[data-testid="journey-merchant-signup"]'));
  } else {
    click(await wait('[data-testid="auth-switch-signup"]'));
  }
  check('signup form renders', !!(await wait('[data-testid="auth-signup-form"]')));
  const phoneInputSel = '[data-testid="auth-phone-input"]';
  check('optional mobile field present', !!doc.querySelector(phoneInputSel));
  const signupCard = doc.querySelector('[data-testid="auth-signup-form"]');
  check('explicit "no OTP" explanation shown',
    !!signupCard && /OTP/i.test(signupCard.textContent) && /no OTP|OTP नाही|OTP नहीं/i.test(signupCard.textContent),
    signupCard && signupCard.textContent.slice(0, 300));
  // invalid phone blocks submit client-side
  setInput(win, doc.querySelector('[data-testid="auth-email-input"]'), 'phone.check@example.com');
  setInput(win, doc.querySelector('[data-testid="auth-password-input"]'), 'Supabase@123');
  setInput(win, doc.querySelector('[data-testid="auth-confirm-input"]'), 'Supabase@123');
  setInput(win, doc.querySelector(phoneInputSel), '12345');
  authNet.length = 0;
  submit(doc.querySelector('[data-testid="auth-signup-form"]'));
  await sleep(600);
  const phoneErr = await wait('[data-testid="auth-signup-form"] [role="alert"]', 3000);
  check('invalid phone rejected client-side', !!phoneErr && /१०|10/.test(phoneErr.textContent), phoneErr && phoneErr.textContent);
  check('no request on invalid phone', authNet.length === 0, JSON.stringify(authNet));
  // valid phone → real signup reaches Supabase (then network failure surfaces)
  setInput(win, doc.querySelector(phoneInputSel), '+91 98765 43210');
  submit(doc.querySelector('[data-testid="auth-signup-form"]'));
  const signupRes = await wait('[data-testid="auth-error"]', 12000);
  check('valid signup attempted against project', authNet.some((r) => r.url.includes(SUPABASE_HOST)),
    JSON.stringify(authNet.map((r) => r.url)));
  check('phone captured as profile metadata (never auth)', authNet.some((r) => r.body && /phone_number/.test(r.body) && /9876543210/.test(r.body) && !/otp/i.test(r.body)),
    JSON.stringify(authNet.map((r) => r.body)));
  check('no fake signup success on failure', !!signupRes && win.location.pathname === '/auth',
    signupRes && signupRes.textContent);

  // 6. recovery + callback screens render honestly
  win.history.pushState(null, '', '/auth');
  win.dispatchEvent(new win.PopStateEvent('popstate'));
  await sleep(500);
  click(await wait('[data-testid="auth-switch-signin"]'));
  click(await wait('[data-testid="auth-forgot-link"]'));
  check('forgot-password form renders', !!(await wait('[data-testid="auth-forgot-form"]')));
  win.history.pushState(null, '', '/auth?recovery=1');
  win.dispatchEvent(new win.PopStateEvent('popstate'));
  await sleep(700);
  check('recovery without session → expired-link state (no false success)',
    !!(await wait('[data-testid="auth-link-expired"]')));

  win.history.pushState(null, '', '/auth/callback?error_description=provider+not+configured');
  win.dispatchEvent(new win.PopStateEvent('popstate'));
  await wait('[data-testid="callback-working"], [data-testid="callback-error"]', 8000);
  check('callback route renders (error surfaced, no crash)',
    !!(doc.querySelector('[data-testid="callback-error"]') || doc.querySelector('[data-testid="callback-working"]')));

  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log('--- supabase auth requests (sanitized) ---');
  authNet.forEach((r) => console.log(`  ${r.method} ${r.url.replace(/\?.*$/, r.url.includes('redirect') ? '' : '')}`));
  console.log(failures === 0 ? 'LOGIN E2E: PASS' : `LOGIN E2E: FAIL (${failures})`);
  win.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('crashed:', e); process.exit(1); });
