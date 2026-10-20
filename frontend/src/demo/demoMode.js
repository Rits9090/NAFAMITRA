/**
 * Demo mode flag — the ONLY unauthenticated path into NafaMitra shells.
 *
 * - Value: null | 'merchant' | 'customer' (localStorage `nafamitra_demo`).
 * - Never produces a token, never contacts the network, never grants access
 *   to real data: the API adapter short-circuits to local fixtures while this
 *   flag is on (see lib/api.js), and server-side authorization is untouched.
 */

import { DEMO_ENABLED } from '@/lib/demoFlag';

const KEY = 'nafamitra_demo';
let current = null;
const listeners = new Set();

try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'merchant' || saved === 'customer') current = saved;
} catch { /* private mode — start clean */ }
// Production builds compile demo support out entirely: any stale flag from
// an older/local build is ignored AND purged, so editing localStorage can
// never unlock a shell (§4.2).
if (!DEMO_ENABLED && current !== null) {
  current = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function getDemo() {
  return DEMO_ENABLED ? current : null;
}

export function isDemo(role) {
  return role ? current === role : current !== null;
}

export function setDemo(role) {
  if (!DEMO_ENABLED) role = null;
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
