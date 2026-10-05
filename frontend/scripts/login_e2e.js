/**
 * Login E2E: drives the real OTP login UI in jsdom against the preview
 * server and logs every XHR's auth headers + status.
 * Run:  npx craco build && PORT=3000 node scripts/serve.js &
 *       node scripts/login_e2e.js
 */
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

class LocalOnly extends ResourceLoader {
  fetch(url, opts) { return /^https?:\/\/(127\.0\.0\.1|localhost):/.test(url) ? super.fetch(url, opts) : null; }
}

const pageErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { const m = e.stack || e.message; if (!/Could not load link|Could not parse CSS/i.test(m)) pageErrors.push(m); });
vc.on('error', (...a) => pageErrors.push('console.error: ' + a.map(String).join(' ')));
vc.on('warn', () => {}); vc.on('log', () => {});

const netlog = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setInput = (win, el, val) => {
  const proto = el.tagName === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
};

(async () => {
  const TARGET = process.env.SMOKE_URL || 'http://127.0.0.1:3000/';
  const dom = await JSDOM.fromURL(TARGET, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
      window.scrollTo = () => {};
      window.addEventListener('error', (e) => pageErrors.push('onerror: ' + ((e.error && e.error.stack) || e.message)));
      window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
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

  console.log('step1: waiting journey landing...');
  const journeyBtn = await wait('[data-testid="journey-merchant-login"]');
  if (!journeyBtn) { console.log('FAIL: no journey landing'); console.log(doc.body.textContent.slice(0, 300)); process.exit(1); }
  journeyBtn.click();
  console.log('step1b: entered Shop Owner journey');
  const phone = await wait('[data-testid="phone-input"]');
  if (!phone) { console.log('FAIL: no phone input'); console.log(doc.body.textContent.slice(0, 300)); process.exit(1); }

  const phoneVal = '9' + String(Date.now()).slice(-9);
  setInput(win, phone, phoneVal);
  await sleep(200);
  const phoneForm = doc.querySelector('[data-testid="phone-form"]');
  const sendBtn = phoneForm.querySelector('button[type="submit"]');
  console.log('step2: send OTP, phone =', phoneVal, 'btn =', JSON.stringify(sendBtn.textContent.trim()));
  sendBtn.click();

  const otpInput = await wait('[data-testid="otp-input"]', 12000);
  if (!otpInput) { console.log('FAIL: no OTP screen'); console.log('netlog:', JSON.stringify(netlog, null, 1)); process.exit(1); }
  await sleep(500);
  const devBox = doc.querySelector('.bg-amber-50 b') || doc.querySelector('[class*="amber"] b');
  const devCode = devBox ? devBox.textContent.trim() : null;
  console.log('step3: OTP screen shown, dev code =', devCode);

  if (!devCode || !/^\d{5}$/.test(devCode)) { console.log('FAIL: dev OTP not visible'); process.exit(1); }

  setInput(win, otpInput, devCode);
  await sleep(600);
  // may auto-submit on 5th digit (screen unmounts) — click only if still there
  const otpSubmit = doc.querySelector('[data-testid="otp-submit"]');
  if (otpSubmit) {
    console.log('step4: submit disabled =', otpSubmit.disabled);
    if (otpSubmit.disabled) { console.log('FAIL: OTP submit disabled after typing'); process.exit(1); }
    otpSubmit.click();
  } else {
    console.log('step4: auto-submitted (OTP screen already unmounted)');
  }

  // wait for post-login navigation
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    if (win.location.pathname !== '/auth' && win.location.pathname !== '/') break;
    if (doc.querySelector('[data-testid="onboarding-choice"], [data-testid="dashboard-page"], nav')) break;
  }
  const token = win.localStorage.getItem('nafamitra_token');
  console.log('step5: pathname =', win.localStorage.getItem('nafamitra_shop') ? '(shopped)' : '', win.location.pathname);
  console.log('token stored:', token ? token.slice(0, 24) + '…' : 'NONE');

  console.log('--- network log (auth-relevant) ---');
  netlog.filter((l) => /auth|config/.test(l.url)).forEach((l) => {
    console.log(`${l.method} ${l.url} → ${l.status} | authHeader: ${l.headers.Authorization ? l.headers.Authorization.slice(0, 22) + '…' : 'MISSING'} | body: ${(l.body || '').replace(/\s+/g, ' ').slice(0, 140)}`);
  });
  const me = netlog.filter((l) => /auth\/me/.test(l.url));
  const meOk = me.some((l) => l.status === 200);
  const atDashboard = /onboarding|dashboard|billing|\/$/.test(win.location.pathname) && !/auth/.test(win.location.pathname);
  console.log('page errors:', pageErrors.length); pageErrors.slice(0, 5).forEach((e) => console.log('  ERR:', e.split('\n').slice(0, 3).join(' | ')));
  const ok = !!token && meOk && atDashboard;
  console.log(ok ? 'LOGIN E2E: PASS' : 'LOGIN E2E: FAIL');
  win.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
