/**
 * Render smoke: loads the production build in jsdom and asserts the login
 * screen actually mounts with zero page errors. Run:
 *   npx craco build && (python3 -m http.server 3100 -d build --bind 127.0.0.1 &) && node scripts/render_smoke.js
 */
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

class LocalOnlyLoader extends ResourceLoader {
  fetch(url, options) {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost):/.test(url)) return null;
    return super.fetch(url, options);
  }
}

const pageErrors = [];
const consoleErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const msg = e.stack || e.message;
  if (/Could not load link|Could not parse CSS/i.test(msg)) return;
  pageErrors.push('jsdomError: ' + msg);
});
vc.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));
vc.on('warn', () => {});
vc.on('log', () => {});

const TARGET = process.env.SMOKE_URL || 'http://127.0.0.1:3100/';

(async () => {
  const dom = await JSDOM.fromURL(TARGET, {
    runScripts: 'dangerously',
    resources: new LocalOnlyLoader(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = function (q) {
        return { matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
      };
      window.scrollTo = () => {};
      window.addEventListener('error', (e) => pageErrors.push('window.onerror: ' + ((e.error && e.error.stack) || e.message)));
      window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandledrejection: ' + ((e.reason && e.reason.stack) || e.reason)));
    },
  });

  await new Promise((r) => setTimeout(r, 6000));
  const doc = dom.window.document;
  const body = doc.body.textContent || '';
  const rootHtml = doc.getElementById('root') ? doc.getElementById('root').innerHTML : '';
  const results = {
    brand: body.includes('NafaMitra'),
    language: body.includes('मराठी') || body.includes('English'),
    controls: doc.querySelectorAll('input, button').length,
    rootRendered: rootHtml.length > 500,
    pageErrors: pageErrors.length,
  };
  console.log(results);
  console.log('body sample:', JSON.stringify(body.slice(0, 250)));
  pageErrors.slice(0, 8).forEach((e) => console.log('  ERR:', e.split('\n').slice(0, 5).join(' | ')));
  consoleErrors.filter((e) => !/React DevTools|fonts\.googleapis/i.test(e))
    .slice(0, 8).forEach((e) => console.log('  CON:', e.slice(0, 400)));
  const ok = results.brand && results.language && results.rootRendered && results.pageErrors === 0;
  console.log(ok ? 'RENDER SMOKE: PASS' : 'RENDER SMOKE: FAIL');
  dom.window.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
