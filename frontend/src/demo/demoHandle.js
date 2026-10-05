/**
 * Demo request handler — fulfils API calls from local fixtures while demo
 * mode is active, so the REAL screens render with sample business data and
 * no network/backend is required (works even if the API is down).
 *
 * Rules:
 * - GETs are served from fixtures (exact production shapes).
 * - A small allowlist of creates (bill/product/customer/goal) mutates only
 *   the in-memory demo store — a deliberate local UI demonstration; it can
 *   never reach production data.
 * - Every other write returns 403 `demo_readonly` so the UI shows
 *   "Demo mode — this action is available in a real account."
 */
import { DEMO_MERCHANT, DEMO_CUSTOMER } from './fixtures';

let store = null; // { merchant: {...}, customer: {...} } — fresh clone per entry

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function resetDemoStore() {
  store = { merchant: clone(DEMO_MERCHANT), customer: clone(DEMO_CUSTOMER) };
  store.seq = 42;
  return store;
}

function ensureStore() {
  if (!store) resetDemoStore();
  return store;
}

function pathOf(config) {
  return (config.url || '').split('?')[0];
}

function tableFor(config) {
  const { demoRole } = config; // injected by api.js adapter
  const s = ensureStore();
  return demoRole === 'customer' ? s.customer : s.merchant;
}

/** Resolve a GET to a fixture body (exact key first, then path-only). */
function readFixture(config) {
  const table = tableFor(config);
  const full = config.url || '';
  const path = pathOf(config);
  if (Object.prototype.hasOwnProperty.call(table, full)) return table[full];
  if (Object.prototype.hasOwnProperty.call(table, path)) return table[path];
  // harvested keys include queries — find any key with same path
  const alias = Object.keys(table).find((k) => k.split('?')[0] === path);
  if (alias) return table[alias];
  return undefined;
}

const readOnly = (config) => ({
  status: 403,
  data: {
    error: {
      code: 'demo_readonly',
      message: 'Demo mode — this action is available in a real account.',
      message_mr: 'डेमो मोड — ही कृती खरेदी खात्यात उपलब्ध आहे.',
      msgKey: 'demo.blocked',
    },
  },
});

// ---------------------------------------------------------------------
// Deliberate local UI demonstrations (in-memory only).
// Each returns {status, data} mimicking the real create response.
// ---------------------------------------------------------------------
function nextId(prefix) {
  const s = ensureStore();
  s.seq += 1;
  return `${prefix}-demo-${s.seq}`;
}

function localWrites(config, body) {
  const role = config.demoRole;
  const path = pathOf(config);
  const s = ensureStore();

  if (role === 'merchant' && path === '/sales' && config.method === 'post') {
    const table = s.merchant;
    const amount = body?.mode === 'items'
      ? (body.items || []).reduce((a, it) => a + Number(it.unit_price || 0) * Number(it.quantity || 0), 0) - Number(body.discount || 0)
      : Number(body?.amount || 0);
    const paise = Math.round(amount * 100);
    const id = nextId('inv');
    const num = `INV-2610-${String(4000 + s.seq).slice(-4)}`;
    const bill = {
      id,
      shop_id: 'demo-shop-001',
      invoice_number: num,
      status: 'ACTIVE',
      mode: body?.mode || 'quick',
      customer_id: body?.customer_id || null,
      customer_name: null,
      items: body?.items || [],
      total_paise: paise,
      payment_mode: body?.payment_mode || 'cash',
      created_at: new Date().toISOString(),
      demo: true,
    };
    const list = Array.isArray(table['/sales?page=1&limit=10']) ? table['/sales?page=1&limit=10'] : { bills: [], pages: 1 };
    list.bills = [bill, ...(list.bills || [])];
    list.pages = list.pages || 1;
    table['/sales?page=1&limit=10'] = list;
    const recent = Array.isArray(table['/dashboard/recent-bills']) ? table['/dashboard/recent-bills'] : [];
    table['/dashboard/recent-bills'] = [bill, ...recent].slice(0, 10);
    const stats = table['/dashboard/stats'] || {};
    if (stats.today) {
      stats.today.revenue = (stats.today.revenue || 0) + amount;
      stats.today.sales_paise = (stats.today.sales_paise || 0) + paise;
      stats.today.orders = (stats.today.orders || 0) + 1;
      stats.today.bills = (stats.today.bills || 0) + 1;
    }
    return {
      status: 200,
      data: {
        id, invoice_number: num, total_paise: paise,
        loyalty_earned_points: Math.max(1, Math.floor(paise / 10000)),
        demo: true,
      },
    };
  }

  if (role === 'merchant' && path === '/products' && config.method === 'post') {
    const table = s.merchant;
    const product = {
      id: nextId('prod'),
      name: body?.name || 'Demo Product',
      category: body?.category || 'grocery',
      selling_price: Number(body?.selling_price || 0),
      purchase_price: Number(body?.purchase_price || 0),
      stock_quantity: Number(body?.stock_quantity || 0),
      is_active: true,
      created_at: new Date().toISOString(),
      demo: true,
    };
    const list = table['/products?limit=100']?.products ? table['/products?limit=100'] : { products: [], total: 0 };
    list.products = [product, ...(list.products || [])];
    list.total = (list.total || 0) + 1;
    table['/products?limit=100'] = list;
    return { status: 200, data: product };
  }

  if (role === 'merchant' && path === '/customers' && config.method === 'post') {
    const table = s.merchant;
    const customer = {
      id: nextId('cust'),
      nm_id: `NM-DEMO${s.seq}`,
      name: body?.name || 'Demo Customer',
      phone: body?.phone || '9876543210',
      notes: body?.notes || '',
      created_at: new Date().toISOString(),
      demo: true,
    };
    const list = table['/customers?segment=all&limit=20']?.customers
      ? table['/customers?segment=all&limit=20'] : { customers: [], total: 0 };
    list.customers = [customer, ...(list.customers || [])];
    list.total = (list.total || 0) + 1;
    table['/customers?segment=all&limit=20'] = list;
    return { status: 200, data: customer };
  }

  if (role === 'customer' && path === '/customer/goals' && config.method === 'post') {
    const table = s.customer;
    const goal = {
      id: nextId('goal'),
      name: body?.name || 'Demo Goal',
      target_paise: Number(body?.target_paise || 0),
      progress_paise: Number(body?.progress_paise || 0),
      percent: 0,
      created_at: new Date().toISOString(),
      demo: true,
    };
    goal.percent = goal.target_paise
      ? Math.min(1000, Math.round((goal.progress_paise / goal.target_paise) * 1000) / 10) : 0;
    const list = table['/customer/goals']?.goals ? table['/customer/goals'] : { goals: [] };
    list.goals = [...(list.goals || []), goal];
    table['/customer/goals'] = list;
    return { status: 200, data: { goal }, demo: true };
  }

  return readOnly(config);
}

/**
 * Main entry (called by the axios adapter while demo mode is on).
 * @returns {{status:number, data:any}|null} null ⇒ not handled (shouldn't happen)
 */
export function demoHandle(config) {
  const method = (config.method || 'get').toLowerCase();
  let data = config.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  config.demoRole = config.demoRole || undefined;

  if (method === 'get' || method === 'head') {
    const body = readFixture(config);
    if (body !== undefined) return { status: 200, data: clone(body) };
    // Unknown read → benign empty object; screens render their empty states.
    // eslint-disable-next-line no-console
    console.info('[demo] unmatched endpoint:', method.toUpperCase(), config.url);
    return { status: 200, data: {} };
  }
  return localWrites(config, data || {});
}
