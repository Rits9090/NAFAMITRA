/**
 * Fast billing helpers — local, honest, no fake state.
 *
 * - Recent products + last basket: localStorage only (this device), used for
 *   one-tap repeat billing. Never claims a basket is "frequent" across devices.
 * - parseVoiceAdd(): turns a dictation transcript into { qty, nameQuery }.
 *   DICTATION only — the transcript is always visible and the user confirms
 *   by tapping; we never submit a bill from speech alone.
 */

const RECENT_KEY = 'nm_fast_recent_products'; // [id, ...] most-recent-first
const BASKET_KEY = 'nm_fast_last_basket';     // [{ product_id, quantity }]

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export function recentProductIds() {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(RECENT_KEY), []);
}

/** Remember a product id as recently used (max 12 kept). */
export function rememberProduct(productId) {
  if (typeof window === 'undefined' || !productId) return;
  const list = recentProductIds().filter((id) => id !== productId);
  list.unshift(productId);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}

export function saveLastBasket(cart) {
  if (typeof window === 'undefined') return;
  const basket = (cart || [])
    .filter((i) => i.product_id)
    .map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
  if (basket.length) window.localStorage.setItem(BASKET_KEY, JSON.stringify(basket));
}

export function getLastBasket() {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(BASKET_KEY), []);
}

// ── voice transcript parsing ────────────────────────────────────────────

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, dozen: 12,
  // मराठी / हिन्दी
  'एक': 1, 'दोन': 2, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाच': 5, 'पाँच': 5,
  'पांच': 5, 'सहा': 6, 'छह': 6, 'सात': 7, 'आठ': 8, 'नऊ': 9, 'नौ': 9, 'दहा': 10, 'दस': 10,
};

const UNITS = [
  'kilograms', 'kilogram', 'kilos', 'kilo', 'kg',
  'litres', 'litre', 'liters', 'liter', 'ltr', 'l',
  'grams', 'gram', 'g', 'ml',
  'packets', 'packet', 'pack', 'pcs', 'pc', 'pieces', 'piece',
  'boxes', 'box', 'bottles', 'bottle', 'bags', 'bag', 'dozen',
  'किलो', 'किलोग्रॅम', 'किलोग्राम', 'लीटर', 'लीटर', 'ग्रॅम', 'ग्राम',
  'पॅकेट', 'पैकेट', 'नग', 'डझन', 'बाटली', 'बोतल', 'थैली', 'पेढी',
];

// Words that carry no product meaning (fillers across en/hi/mr).
const FILLERS = new Set([
  'add', 'please', 'put', 'me', 'my', 'and', 'of', 'the', 'a', 'an', 'to',
  'bill', 'items', 'item', 'qty', 'quantity', 'total',
  'जोडा', 'जोड', 'द्या', 'दे', 'दे.', 'करा', 'मला', 'हे', 'आणि', 'चा', 'ची', 'चे',
  'जोड़', 'जोड़ो', 'दो', 'मुझे', 'मेरा', 'का', 'की', 'के', 'लिए', 'और', 'से',
  'wala', 'wale', 'vala', 'vale',
]);

function wordToNumber(token) {
  if (!token) return null;
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  // Devanagari digits
  if (/^[०-९]+$/.test(token)) {
    const dev = '०१२३४५६७८९';
    return parseInt(token.split('').map((c) => dev.indexOf(c)).join(''), 10);
  }
  const n = NUM_WORDS[token.toLowerCase()];
  return n || null;
}

/**
 * Parse a dictation transcript into a quantity + product query.
 * Returns { qty, nameQuery } — qty defaults to 1; nameQuery is the cleaned
 * remainder (may be empty when the transcript is too noisy to interpret).
 */
export function parseVoiceAdd(text) {
  const raw = (text || '').trim();
  if (!raw) return { qty: 1, nameQuery: '' };

  const tokens = raw.split(/\s+/);
  let qty = 1;
  let qtyFound = false;
  const rest = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const bare = tok.replace(/[.,!?।,]/g, '');
    if (!qtyFound) {
      const n = wordToNumber(bare);
      if (n && n > 0 && n <= 999) {
        // "2 kgs sugar" — number immediately followed by a unit or name
        qty = n;
        qtyFound = true;
        continue;
      }
    }
    const lower = bare.toLowerCase();
    if (qtyFound && UNITS.includes(lower)) {
      // unit consumed (quantity already captured)
      continue;
    }
    if (FILLERS.has(lower) || FILLERS.has(bare)) continue;
    rest.push(bare);
  }

  // Second pass: unit appearing BEFORE the product name but after fillers
  let nameQuery = rest.join(' ').trim();
  // Strip a leading unit if the transcript was like "किलो साखर"
  const firstWord = nameQuery.split(/\s+/)[0] || '';
  if (UNITS.includes(firstWord.toLowerCase())) {
    nameQuery = nameQuery.slice(firstWord.length).trim();
  }

  return { qty: Math.max(1, qty), nameQuery };
}

/** Case/accent-insensitive catalog match for a parsed voice query. */
export function matchProducts(products, query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  return (products || []).filter((p) => {
    const name = (p.name || '').toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    return name.includes(q) || q.includes(name) || sku.includes(q);
  });
}
