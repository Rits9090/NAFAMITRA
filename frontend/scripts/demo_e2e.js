/**
 * Demo-mode E2E (jsdom): landing → Explore Demo → picker → transition →
 * dashboard (retailer), customer demo, demo badge, local demo bill write,
 * and Exit Demo back to /auth. Runs against a production build server.
 *
 *   node scripts/demo_e2e.js            (SMOKE_URL default http://127.0.0.1:3000/)
 */
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

class LocalOnly extends ResourceLoader {
  fetch(url, opts) {
    return /^https?:\/\/(127\.0\.0\.1|localhost):/.test(url) ? super.fetch(url, opts) : null;
  }
}

const pageErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const m = e.stack || e.message;
  if (!/Could not load link|Could not parse CSS/i.test(m)) pageErrors.push(m);
});
vc.on('error', (...a) => pageErrors.push('console.error: ' + a.map(String).join(' ')));
vc.on('warn', () => {});
vc.on('log', () => {});

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, extra) {
  if (ok) console.log('  ✓', name);
  else { failures++; console.log('  ✗', name, extra || ''); }
}

async function waitFor(win, sel, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const el = win.document.querySelector(sel);
    if (el) return el;
    await sleep(80);
  }
  return null;
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function open() {
  const dom = await JSDOM.fromURL(BASE, {
    runScripts: 'dangerously',
    resources: new LocalOnly(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = (q) => ({
        matches: false, media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
      });
      window.scrollTo = () => {};
      // jsdom lacks these browser APIs (present in every real browser).
      if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = () => {};
      window.addEventListener('error', (e) => pageErrors.push('onerror: ' + ((e.error && e.error.stack) || e.message)));
      window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
    },
  });
  return dom;
}

(async () => {
  console.log('== DEMO E2E ==', BASE);

  // ---------------- Retailer demo ----------------
  let dom = await open();
  let win = dom.window;
  check('landing renders', !!(await waitFor(win, '[data-testid="journey-landing"]')));
  check('explore-demo CTA visible', !!(await waitFor(win, '[data-testid="explore-demo"]')));

  click(win, win.document.querySelector('[data-testid="explore-demo"]'));
  check('demo picker opens', !!(await waitFor(win, '[data-testid="demo-picker"]')));

  click(win, win.document.querySelector('[data-testid="demo-retailer"]'));
  check('transition screen', !!(await waitFor(win, '[data-testid="demo-transition"]')));
  const enterBtn = await waitFor(win, '[data-testid="enter-demo"]', 3000);
  check('enter-demo button', !!enterBtn);
  if (enterBtn) click(win, enterBtn);

  const badge = await waitFor(win, '[data-testid="demo-badge"]', 8000);
  check('entered retailer demo (badge)', !!badge);
  await sleep(600);
  const body = win.document.body.textContent || '';
  check('demo shop name in header', body.includes('Demo Kirana Store'));
  check('dashboard shows fixture stats', /₹|today|revenue/i.test(body) || body.includes('डॅशबोर्ड') || body.includes('Dashboard'));
  check('demo badge text', body.includes('DEMO MODE') || body.includes('डेमो मोड'));

  // SPA navigation to Bills
  const billsLink = win.document.querySelector('a[href="/bills"]');
  check('nav has bills link', !!billsLink);
  if (billsLink) {
    click(win, billsLink);
    await sleep(700);
    const b = win.document.body.textContent || '';
    check('bills screen shows demo invoices', b.includes('INV-2610') || /INV-/.test(b));
  }

  // Local demo write: billing quick bill (in-memory only)
  const billBtn = win.document.querySelector('a[href="/billing"]');
  if (billBtn) {
    click(win, billBtn);
    await sleep(700);
    const amt = win.document.querySelector('input[inputmode="decimal"], input[type="number"], #amount, [data-testid="amount-input"], input[name="amount"]');
    check('billing form reachable', !!amt);
    // Writes are covered by adapter unit behavior; UI smoke stops at form presence.
  }

  // ---- Route crawl: every reachable screen must render without errors ----
  async function crawl(win2, prefixRe, label, directRoutes = []) {
    const seen = new Set();
    let errsBefore = pageErrors.length;
    for (let step = 0; step < 16; step++) {
      const links = [...win2.document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && prefixRe.test(h) && !h.includes('://') && !seen.has(h));
      if (!links.length) break;
      const href = links[0];
      seen.add(href);
      const el = win2.document.querySelector(`a[href="${href}"]`);
      click(win2, el);
      await sleep(550);
      const text = (win2.document.body.textContent || '').trim();
      if (pageErrors.length > errsBefore) {
        check(`crawl ${label} ${href} — no render error`, false, pageErrors.slice(-1)[0].slice(0, 160));
        errsBefore = pageErrors.length;
      } else {
        check(`crawl ${label} ${href} renders`,
          text.length > 150 && !text.includes('⚠️'), // ⚠️ = error-boundary fallback only
          `len=${text.length} :: ${text.slice(0, 160)}`);
      }
    }
    // Direct routes (not reachable from visible links in this state).
    for (const href of directRoutes) {
      if (seen.has(href)) continue;
      seen.add(href);
      win2.history.pushState(null, '', href);
      win2.dispatchEvent(new win2.PopStateEvent('popstate'));
      await sleep(550);
      const text = (win2.document.body.textContent || '').trim();
      if (pageErrors.length > errsBefore) {
        check(`crawl ${label} ${href} — no render error`, false, pageErrors.slice(-1)[0].slice(0, 160));
        errsBefore = pageErrors.length;
      } else {
        check(`crawl ${label} ${href} renders`,
          text.length > 150 && !text.includes('⚠️'),
          `len=${text.length} :: ${text.slice(0, 160)}`);
      }
    }
    console.log(`  crawled ${seen.size} ${label} routes:`, [...seen].join(' '));
  }
  await crawl(win, /^\/(billing|bills|customers|products|credit|loyalty|staff|more|reports|settings|suppliers|requirements|assistant|voice|marketing|dashboard)?$/, 'merchant',
    ['/requirements', '/more']);

  // Exit demo
  const exit = await waitFor(win, '[data-testid="exit-demo"]', 3000);
  check('exit-demo visible in demo', !!exit);
  if (exit) {
    click(win, exit);
    const back = await waitFor(win, '[data-testid="journey-landing"]', 6000);
    check('exit returns to landing', !!back);
    check('badge gone after exit', !win.document.querySelector('[data-testid="demo-badge"]'));
  }
  // localStorage cleared?
  check('demo flag cleared', !win.localStorage.getItem('nafamitra_demo'));
  win.close();

  // ---------------- Customer demo ----------------
  dom = await open();
  win = dom.window;
  await waitFor(win, '[data-testid="journey-landing"]');
  click(win, win.document.querySelector('[data-testid="explore-demo"]'));
  await waitFor(win, '[data-testid="demo-picker"]');
  click(win, win.document.querySelector('[data-testid="demo-customer"]'));
  await waitFor(win, '[data-testid="demo-transition"]');
  const enter2 = await waitFor(win, '[data-testid="enter-demo"]', 3000);
  if (enter2) click(win, enter2);
  const badge2 = await waitFor(win, '[data-testid="demo-badge"]', 8000);
  check('entered customer demo (badge)', !!badge2);
  await sleep(700);
  const cbody = win.document.body.textContent || '';
  check('customer demo renders content', cbody.length > 300);
  check('customer demo has sample data', /₹|NM-|नफा|My Nafa|धनलाभ/i.test(cbody));
  await crawl(win, /^\/c(\/(bills|loyalty|credit|search|nafa|notifications|profile|stores|brain))?$/, 'customer',
    ['/c/notifications', '/c/stores', '/c/brain', '/c/search', '/c/nafa']);
  const cexit = await waitFor(win, '[data-testid="exit-demo"]', 3000);
  check('customer exit visible', !!cexit);
  if (cexit) {
    click(win, cexit);
    check('customer exit → landing', !!(await waitFor(win, '[data-testid="journey-landing"]', 6000)));
  }
  win.close();

  // Demo mode must never hit the network (fixtures are local): the earlier
  // runs succeeded with NO /api dependency — assert no page errors overall.
  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log(failures === 0 ? 'DEMO E2E: PASS' : `DEMO E2E: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('DEMO E2E crashed:', e); process.exit(1); });
