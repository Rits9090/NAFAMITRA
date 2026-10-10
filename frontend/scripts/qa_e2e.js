/**
 * QA E2E (jsdom) — the 12 acceptance scenarios against the production build.
 *
 *   node scripts/qa_e2e.js          (SMOKE_URL default http://127.0.0.1:3000/)
 *
 *  1. Customer demo entry            7. Retailer adds a product to a bill
 *  2. Shop Owner demo entry          8. Retailer completes a demo invoice
 *  3. Customer home: identity +      9. Add/edit dialog is a body-level portal
 *     DhanLabh + Udhaari + bills    10. Form validation + error recovery
 *  4. Removed features stay gone     11. Repeated clicks → one invoice only
 *  5. Four-tab customer navigation   12. Refresh/direct boot on internal routes
 *  6. Customer opens a bill detail
 *
 * Plus unit checks of the fast-billing voice parser (lib/fastBilling.js).
 */
const fs = require('fs');
const path = require('path');
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

async function open(url, opts = {}) {
  return JSDOM.fromURL(url, {
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
      if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = () => {};
      if (opts.beforeParse) opts.beforeParse(window);
      window.addEventListener('error', (e) => pageErrors.push('onerror: ' + ((e.error && e.error.stack) || e.message)));
      window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
    },
  });
}

async function enterDemo(win, role) {
  const landing = await waitFor(win, '[data-testid="journey-landing"]', 12000);
  if (!landing) { check(`[${role}] landing rendered`, false); return null; }
  const explore = await waitFor(win, '[data-testid="explore-demo"]', 6000);
  if (!explore) { check(`[${role}] explore CTA`, false); return null; }
  click(win, explore);
  const picker = await waitFor(win, '[data-testid="demo-picker"]', 6000);
  if (!picker) { check(`[${role}] demo picker`, false); return null; }
  click(win, win.document.querySelector(`[data-testid="demo-${role}"]`));
  await waitFor(win, '[data-testid="demo-transition"]', 6000);
  const enter = await waitFor(win, '[data-testid="enter-demo"]', 4000);
  if (enter) click(win, enter);
  return waitFor(win, '[data-testid="demo-badge"]', 8000);
}

function go(win, href) {
  win.history.pushState(null, '', href);
  win.dispatchEvent(new win.PopStateEvent('popstate'));
}

(async () => {
  console.log('== QA E2E (12 scenarios) ==', BASE);

  // ── 0. Voice parser unit checks ────────────────────────────────────────
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'fastBilling.js'), 'utf8');
    const mod = new Function(
      `${src.replace(/export /g, '')}\nreturn { parseVoiceAdd, matchProducts };`
    )();
    const a = mod.parseVoiceAdd('add two kilos of sugar');
    check('voice parser: "add two kilos of sugar" → qty 2 + sugar', a.qty === 2 && /sugar/i.test(a.nameQuery), JSON.stringify(a));
    const b = mod.parseVoiceAdd('दोन किलो साखर');
    check('voice parser: "दोन किलो साखर" → qty 2 + साखर', b.qty === 2 && b.nameQuery.includes('साखर'), JSON.stringify(b));
    const c = mod.parseVoiceAdd('one litre oil');
    check('voice parser: "one litre oil" → qty 1 + oil', c.qty === 1 && /oil/i.test(c.nameQuery), JSON.stringify(c));
    const m = mod.matchProducts([{ name: 'Sunflower Oil 1L' }, { name: 'Sugar 1kg' }], 'oil');
    check('voice matcher: single catalog match', m.length === 1 && /Oil/.test(m[0].name), JSON.stringify(m.map((x) => x.name)));
    const amb = mod.matchProducts([{ name: 'Amul Butter 100g' }, { name: 'Amul Butter 500g' }], 'butter');
    check('voice matcher: ambiguous stays for user confirmation', amb.length === 2);
  }

  // ── Customer demo: scenarios 1, 3, 4, 5, 6 ────────────────────────────
  let dom = await open(BASE);
  let win = dom.window;
  check('[1] customer demo entry', !!(await enterDemo(win, 'customer')));
  await sleep(800);

  // 3. Home blocks
  const identity = await waitFor(win, '[data-testid="home-identity"]');
  check('[3] home identity block', !!identity);
  const idText = (identity && identity.textContent) || '';
  check('[3] identity shows stable NM id', idText.includes('NM-594596'), idText.slice(0, 120));
  const reward = (win.document.querySelector('[data-testid="reward-line"]') || {}).textContent || '';
  check('[3] truthful reward line (points, no ₹10 promise)',
    /8/.test(reward) && !/₹\s*10(?!\d)/.test(reward) && /पॉइंट|point/i.test(reward), reward);
  const udhaar = await waitFor(win, '[data-testid="home-udhaar"]');
  check('[3] Udhaari block present', !!udhaar);
  const uText = (udhaar && udhaar.textContent) || '';
  check('[3] Udhaari shows ₹520 shop-wise', uText.includes('₹520') && uText.includes('Demo Kirana Store'), uText.slice(0, 160));
  check('[3] shop-wise Udhaari rows', win.document.querySelectorAll('[data-testid="udhaar-shop-row"]').length >= 1);
  const billsBlock = win.document.querySelector('[data-testid="home-bills"]');
  check('[3] recent bills block', !!billsBlock && win.document.querySelectorAll('[data-testid="home-bill-row"]').length >= 1);
  check('[3] bill rows show invoice + amount',
    /INV-2610/.test((billsBlock && billsBlock.textContent) || '') && /₹/.test((billsBlock && billsBlock.textContent) || ''));

  // Customer-facing tagline (not the retailer one)
  const header = win.document.querySelector('header');
  const hText = (header && header.textContent) || '';
  check('[3] customer tagline in header', /तुमची बचत, तुमचा हिशोब|Your savings, your account/.test(hText), hText.slice(0, 160));
  check('[3] retailer tagline NOT in customer header', !/ग्राहक वाढवा, नफा वाढवा/.test(hText));

  // 4. Removed features
  check('[4] no goals section on home', !win.document.querySelector('[data-testid="goals-section"]'));
  check('[4] no expenses section on home', !win.document.querySelector('[data-testid="expenses-section"]'));
  check('[4] no old nafa strip on home', !win.document.querySelector('[data-testid="nafa-strip"]'));
  go(win, '/c/nafa');
  await sleep(700);
  let body = win.document.body.textContent || '';
  check('[4] My Nafa has no goals section', !win.document.querySelector('[data-testid="goals-section"]'));
  check('[4] My Nafa has no expenses section', !win.document.querySelector('[data-testid="expenses-section"]'));
  check('[4] no ₹1,50,000 phone goal anywhere', !body.includes('1,50,000') && !body.includes('New Phone'), body.slice(0, 200));
  go(win, '/c');
  await sleep(700);

  // 5. Four-tab bottom navigation
  const bottomNav = [...win.document.querySelectorAll('nav')].pop();
  const navLinks = bottomNav ? [...bottomNav.querySelectorAll('a')] : [];
  const hrefs = navLinks.map((a) => a.getAttribute('href'));
  check('[5] bottom nav has exactly 4 tabs', navLinks.length === 4, JSON.stringify(hrefs));
  check('[5] tabs = Home/Bills/My Stores/Profile',
    JSON.stringify(hrefs) === JSON.stringify(['/c', '/c/bills', '/c/stores', '/c/profile']), JSON.stringify(hrefs));
  check('[5] active tab highlighted', navLinks.some((a) => (a.className || '').includes('active')));
  const navText = (bottomNav && bottomNav.textContent) || '';
  check('[5] tab labels localized', /होम|Home/.test(navText) && /बिल|Bills/.test(navText), navText);

  // 6. Open a bill detail (items + total must agree with the ledger)
  go(win, '/c');
  await sleep(700);
  const billRow = await waitFor(win, '[data-testid="home-bill-row"] a');
  check('[6] bill row is a link', !!billRow);
  if (billRow) {
    click(win, billRow);
    await sleep(800);
    body = win.document.body.textContent || '';
    check('[6] bill detail renders', /INV-2610-0004/.test(body), body.slice(0, 200));
    check('[6] bill detail shows line items', body.includes('Basmati Rice 5kg'), body.slice(0, 300));
    check('[6] bill detail shows reorder/share actions', !!(win.document.querySelector('[data-testid="reorder-btn"]')));
  }
  check('[6] zero page errors (customer part)', pageErrors.length === 0, pageErrors.slice(0, 2));
  win.close();

  // ── Retailer demo: scenarios 2, 7, 8, 9, 10, 11 ──────────────────────
  dom = await open(BASE);
  win = dom.window;
  check('[2] shop owner demo entry', !!(await enterDemo(win, 'retailer')));
  await sleep(800);

  // 9. Add Product dialog = body-level portal (the old transformed-ancestor bug)
  go(win, '/products');
  await sleep(700);
  const addBtn = await waitFor(win, '[data-testid="add-product-btn"]');
  check('[9] products page add button', !!addBtn);
  if (addBtn) {
    click(win, addBtn);
    const overlay = await waitFor(win, '[data-testid="nm-overlay"]', 4000);
    check('[9] add-product opens shared overlay', !!overlay);
    if (overlay) {
      check('[9] overlay portalled to document.body', overlay.parentElement === win.document.body);
      check('[9] overlay outside transformed page wrapper', !overlay.closest('.animate-fadeInUp'));
      const panel = overlay.querySelector('.nm-panel');
      check('[9] panel is a labelled dialog', !!panel && panel.getAttribute('role') === 'dialog' && !!panel.getAttribute('aria-label'));
      check('[9] background scroll locked', win.document.body.classList.contains('nm-scroll-lock'));
      // 10. validation: empty name must NOT close or fake success
      const submit = panel.querySelector('button[type="submit"]');
      if (submit) {
        click(win, submit);
        await sleep(400);
        check('[10] invalid submit keeps dialog open (no fake success)',
          !!win.document.querySelector('[data-testid="nm-overlay"]'));
      }
      // Escape closes + unlock
      win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(300);
      check('[10] Escape closes dialog', !win.document.querySelector('[data-testid="nm-overlay"]'));
      check('[10] scroll lock released', !win.document.body.classList.contains('nm-scroll-lock'));
    }
  }

  // Add Customer dialog also portalled
  go(win, '/customers');
  await sleep(700);
  const addCust = await waitFor(win, '[data-testid="add-customer-btn"]');
  if (addCust) {
    click(win, addCust);
    const ov = await waitFor(win, '[data-testid="nm-overlay"]', 4000);
    check('[9] add-customer portalled too', !!ov && ov.parentElement === win.document.body);
    if (ov) {
      win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(250);
    }
  }

  // 7 + 8 + 11: fast billing → 3 products → double click → ONE invoice
  go(win, '/billing');
  await sleep(700);
  check('[7] billing page', !!(await waitFor(win, '[data-testid="billing-page"]')));

  // BEFORE invoice count on the bills list
  go(win, '/bills');
  await sleep(800);
  const countInvoices = () => ((win.document.body.textContent || '').match(/INV-\d{4}-\d+/g) || []).length;
  const before = countInvoices();
  check('[8] bills list has invoices before', before >= 2, String(before));

  const t0 = Date.now();
  go(win, '/billing');
  await sleep(600);
  const modeItems = await waitFor(win, '[data-testid="mode-items"]');
  click(win, modeItems);
  const fastPanel = await waitFor(win, '[data-testid="fast-add-panel"]', 4000);
  check('[7] one-tap quick-add panel', !!fastPanel);
  const chips = [...win.document.querySelectorAll('[data-testid="quick-add-chip"]')].filter((c) => !c.disabled).slice(0, 3);
  check('[7] at least 3 quick-add chips', chips.length >= 3, String(chips.length));
  chips.forEach((c) => click(win, c));
  await sleep(300);
  check('[7] 3 products added to cart', win.document.querySelectorAll('[data-testid="cart-line"]').length === 3,
    String(win.document.querySelectorAll('[data-testid="cart-line"]').length));

  const createBtn = await waitFor(win, '[data-testid="create-bill-btn"]');
  check('[7] create-bill button enabled', createBtn && !createBtn.disabled);
  if (createBtn) {
    click(win, createBtn);
    click(win, createBtn); // double click — must not duplicate
    const receipt = await waitFor(win, '[data-testid="receipt-modal"]', 6000);
    check('[8] invoice completed → receipt', !!receipt);
    const rText = (receipt && receipt.textContent) || '';
    check('[8] receipt shows invoice number + total', /INV-2610-\d+/.test(rText) && /₹/.test(rText), rText.slice(0, 160));
    const elapsed = Date.now() - t0;
    console.log(`  ⏱  scripted routine bill (page→3 items→invoice): ${elapsed}ms`);
    // close receipt (last button in panel = Close)
    const btns = receipt ? [...receipt.querySelectorAll('button')] : [];
    if (btns.length) { click(win, btns[btns.length - 1]); await sleep(300); }
  }
  go(win, '/bills');
  await sleep(800);
  const after = countInvoices();
  check('[11] double click created EXACTLY one invoice', after === before + 1, `before=${before} after=${after}`);
  check('[11] invoice visible on list', (win.document.body.textContent || '').includes('INV-2610-40'));

  // Scenario 12: refresh / direct boot on internal routes (demo flag persists)
  win.close();
  dom = await open(`${BASE}c/bills`, {
    beforeParse(w) { try { w.localStorage.setItem('nafamitra_demo', 'customer'); } catch (e) { /* ignore */ } },
  });
  win = dom.window;
  const cBills = await waitFor(win, '[data-testid="demo-badge"]', 8000);
  check('[12] customer demo survives refresh on /c/bills', !!cBills);
  await sleep(600);
  body = win.document.body.textContent || '';
  check('[12] direct boot renders bills list', /INV-2610/.test(body), body.slice(0, 160));
  win.close();

  dom = await open(`${BASE}billing`, {
    beforeParse(w) { try { w.localStorage.setItem('nafamitra_demo', 'merchant'); } catch (e) { /* ignore */ } },
  });
  win = dom.window;
  const mBadge = await waitFor(win, '[data-testid="demo-badge"]', 8000);
  check('[12] merchant demo survives refresh on /billing', !!mBadge);
  check('[12] direct boot renders billing form', !!(await waitFor(win, '[data-testid="billing-page"]', 6000)));
  win.close();

  check('zero page errors overall', pageErrors.length === 0, pageErrors.slice(0, 3));
  console.log(failures === 0 ? 'QA E2E: PASS (12/12 scenarios)' : `QA E2E: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('QA E2E crashed:', e); process.exit(1); });
