/**
 * Production-safety E2E — runs against a build WITHOUT REACT_APP_ENABLE_DEMO
 * (what Vercel ships). Verifies demo authentication is really gone and the
 * right Supabase project is wired in:
 *
 *   REACT_APP_ENABLE_DEMO= CI=true yarn build
 *   python3 -m http.server 3112 --bind 127.0.0.1 -d build &
 *   node scripts/prod_safety_e2e.js        (SMOKE_URL=http://127.0.0.1:3112/)
 *
 * 1. No demo entry UI on /auth (journey/demo testids absent).
 * 2. Bundle contains no demo-entry code (grep static JS for 'explore-demo').
 * 3. A poisoned nafamitra_demo localStorage flag cannot unlock /dashboard.
 * 4. Bundle targets the intended Supabase project URL.
 * 5. Session-less protected routes redirect to /auth.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

class LocalOnly extends ResourceLoader {
  fetch(url, opts) { return /^https?:\/\/(127\.0\.0\.1|localhost):/.test(url) ? super.fetch(url, opts) : null; }
}

const SUPABASE_HOST = 'izfcjxabnahcsmzhosuo.supabase.co';
const pageErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { const m = e.stack || e.message; if (!/Could not load link|Could not parse CSS/i.test(m)) pageErrors.push(m); });
vc.on('error', (...a) => pageErrors.push('console.error: ' + a.map(String).join(' ')));
vc.on('warn', () => {});
vc.on('log', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) {
  if (ok) console.log('  ✓', name);
  else { failures++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
}

async function open(url, seedDemo) {
  return JSDOM.fromURL(url, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
      window.scrollTo = () => {};
      window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = () => {};
      if (seedDemo) { try { window.localStorage.setItem('nafamitra_demo', seedDemo); } catch { /* */ } }
      window.addEventListener('error', (e) => pageErrors.push('onerror: ' + ((e.error && e.error.stack) || e.message)));
      window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
    },
  });
}

(async () => {
  const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:3112/';
  console.log('== PROD SAFETY E2E (demo-disabled build) ==', BASE);

  // 2. bundle-level check first (cheap, no DOM)
  const jsDir = path.resolve(__dirname, '..', 'build', 'static', 'js');
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
  const bundle = files.map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
  check('bundle has NO demo-entry code (explore-demo)', !bundle.includes('explore-demo'));
  check('bundle has NO demo chooser testid', !bundle.includes('demo-picker'));
  check('bundle targets intended Supabase project', bundle.includes(SUPABASE_HOST));
  check('bundle has publishable-key config name', bundle.includes('REACT_APP_SUPABASE_URL') || bundle.includes(SUPABASE_HOST));

  // 1. /auth renders the real sign-in UI, no demo surfaces
  let dom = await open(BASE);
  let win = dom.window;
  const wait = async (sel, t = 8000) => {
    const end = Date.now() + t;
    while (Date.now() < end) { const el = win.document.querySelector(sel); if (el) return el; await sleep(80); }
    return null;
  };
  const signin = await wait('[data-testid="auth-signin-form"]', 10000);
  check('sign-in form renders without demo build', !!signin);
  check('NO journey landing in production', !win.document.querySelector('[data-testid="journey-landing"]'));
  check('NO demo entry anywhere on page', !win.document.querySelector('[data-testid="explore-demo"]')
    && !win.document.querySelector('[data-testid="demo-cta"]'));
  check('Google sign-in control present', !!(await wait('[data-testid="auth-google-btn"]')));
  win.close();

  // 3. poisoned localStorage flag cannot unlock a protected shell
  dom = await open(`${BASE}dashboard`, 'merchant');
  win = dom.window;
  const landed = await (async () => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      if (win.location.pathname === '/auth') return true;
      if (win.document.querySelector('[data-testid="dashboard-page"]')) return false;
      await sleep(100);
    }
    return false;
  })();
  check('nafamitra_demo flag IGNORED → /dashboard redirects to /auth', landed, win.location.pathname);
  check('stale flag purged from storage', (() => {
    try { return win.localStorage.getItem('nafamitra_demo') === null; } catch { return true; }
  })());
  win.close();

  // 5. second protected route, no seed at all
  dom = await open(`${BASE}billing`);
  win = dom.window;
  await sleep(1200);
  check('unauthenticated /billing lands on /auth', win.location.pathname === '/auth', win.location.pathname);
  win.close();

  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3));
  console.log(failures === 0 ? 'PROD SAFETY E2E: PASS' : `PROD SAFETY E2E: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('crashed:', e); process.exit(1); });
