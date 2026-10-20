/**
 * Centralised money helpers — all amounts cross the API in integer paise.
 * Never do floating-point arithmetic on money outside this module.
 */

export const SYMBOL = '₹';

/** Rupees (string|int|float from user input or product catalog) → integer paise. */
export function toPaise(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[₹,\s]/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === '' || cleaned === '-') {
    throw new Error('invalid money');
  }
  const negative = cleaned.startsWith('-');
  const [whole, frac = ''] = cleaned.replace('-', '').split('.');
  const cents = (frac + '00').slice(0, 2);
  const paise = (parseInt(whole || '0', 10) * 100) + parseInt(cents, 10);
  return negative ? -paise : paise;
}

/** Parse user input leniently → paise (0 when empty/invalid instead of throwing). */
export function parseMoney(value) {
  try { return toPaise(value); } catch { return 0; }
}

/** Paise → number of rupees (display / form prefill only). */
export function toRupees(paise) {
  return Math.round(Number(paise) || 0) / 100;
}

/** Format paise as Indian-grouped rupees: 12345678 → ₹1,23,456.78 */
export function fmt(paise, opts = {}) {
  const { symbol = true, decimals = true } = opts;
  let p = Math.trunc(Number(paise) || 0);
  const negative = p < 0;
  p = Math.abs(p);
  const rupees = Math.floor(p / 100);
  const cents = p % 100;
  let s = String(rupees);
  if (s.length > 3) {
    const last3 = s.slice(-3);
    let head = s.slice(0, -3);
    const parts = [];
    while (head.length > 2) {
      parts.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) parts.unshift(head);
    s = `${parts.join(',')},${last3}`;
  }
  const body = decimals ? `${s}.${String(cents).padStart(2, '0')}` : s;
  return `${negative ? '-' : ''}${symbol ? SYMBOL : ''}${body}`;
}

/** Compact display for stat cards: ₹1.2L / ₹45.5k (Indian units). */
export function fmtCompact(paise) {
  const rupees = (Number(paise) || 0) / 100;
  const abs = Math.abs(rupees);
  if (abs >= 1e7) return `${SYMBOL}${(rupees / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${SYMBOL}${(rupees / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${SYMBOL}${(rupees / 1e3).toFixed(1)}k`;
  return `${SYMBOL}${Math.round(rupees)}`;
}

/** Estimated gross margin on paise values. */
export function grossMargin(sellPaise, costPaise) {
  return (Number(sellPaise) || 0) - (Number(costPaise) || 0);
}

/** Generate an idempotency key for bill submission. */
export function newIdempotencyKey() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
