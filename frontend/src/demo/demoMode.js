/**
 * Demo mode flag — the ONLY unauthenticated path into NafaMitra shells.
 *
 * - Value: null | 'merchant' | 'customer' (localStorage `nafamitra_demo`).
 * - Never produces a token, never contacts the network, never grants access
 *   to real data: the API adapter short-circuits to local fixtures while this
 *   flag is on (see lib/api.js), and server-side authorization is untouched.
 */

const KEY = 'nafamitra_demo';
let current = null;
const listeners = new Set();

try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'merchant' || saved === 'customer') current = saved;
} catch { /* private mode — start clean */ }

export function getDemo() {
  return current;
}

export function isDemo(role) {
  return role ? current === role : current !== null;
}

export function setDemo(role) {
  current = role === 'merchant' || role === 'customer' ? role : null;
  try {
    if (current) localStorage.setItem(KEY, current);
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
  listeners.forEach((fn) => { try { fn(current); } catch { /* ignore */ } });
}

export function clearDemo() {
  setDemo(null);
}

export function subscribeDemo(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
