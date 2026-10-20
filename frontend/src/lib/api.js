/**
 * API client: one axios instance for the whole app.
 * - attaches the session token and the active shop header
 * - normalises server errors into { code, message, message_mr }
 * - logs the user out once on 401 (session expiry) without redirect loops
 */
import axios from 'axios';
import { tStatic } from '@/i18n';
import { getDemo } from '@/demo/demoMode';
import { demoHandle, resetDemoStore } from '@/demo/demoHandle';

// Same-origin by default ('/api' → dev server proxies to the backend, and a
// production host can proxy too). Set REACT_APP_BACKEND_URL only when the API
// truly lives on another origin.
const RAW_BASE = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
export const API_BASE = `${RAW_BASE}/api`;

const store = {
  getToken: () => localStorage.getItem('nafamitra_token'),
  getShopId: () => localStorage.getItem('nafamitra_shop') || null,
  getLang: () => localStorage.getItem('nafamitra_lang') || 'mr',
};

/**
 * The session token travels on THREE channels so no proxy in front of the
 * app can break login: Authorization header, X-Auth-Token header, and a
 * same-site cookie.  The server accepts any of them.
 */
function syncTokenCookie(token) {
  try {
    if (token) {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `nafamitra_token=${token}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
    } else {
      document.cookie = 'nafamitra_token=; Path=/; Max-Age=0; SameSite=Lax';
    }
  } catch { /* cookies may be blocked — headers still carry the token */ }
}
export function setSessionToken(token) {
  localStorage.setItem('nafamitra_token', token);
  syncTokenCookie(token);
}
export function clearSessionToken() {
  localStorage.removeItem('nafamitra_token');
  syncTokenCookie(null);
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

// ---------------------------------------------------------------------
// Demo-mode adapter: while Demo Mode is on, requests NEVER leave the
// browser — they are fulfilled from local fixtures (or rejected with an
// explicit demo_readonly error for writes). Real auth/data is untouched.
// ---------------------------------------------------------------------
const networkAdapter = axios.getAdapter(api.defaults.adapter);
api.defaults.adapter = async (config) => {
  const demoRole = getDemo();
  if (demoRole) {
    config.demoRole = demoRole;
    const res = demoHandle(config);
    return {
      data: res.data,
      status: res.status,
      statusText: res.status >= 400 ? 'Error' : 'OK',
      headers: { 'content-type': 'application/json' },
      config,
      request: null,
    };
  }
  return networkAdapter(config);
};

/** Enter demo mode with a fresh synthetic dataset. */
export function beginDemo(role) {
  resetDemoStore();
  return role;
}

api.interceptors.request.use((config) => {
  const token = store.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Auth-Token'] = token;
    syncTokenCookie(token); // keep the cookie channel warm even on old sessions
  }
  const shopId = store.getShopId();
  if (shopId) config.headers['X-Shop-Id'] = shopId;
  return config;
});

/**
 * Error classification — the single place an HTTP failure becomes a
 * user- understandable message. Known code → i18n key (mr/en/hi); responses
 * that are NOT NafaMitra API shaped (HTML from a static host, gateway pages,
 * missing backend) are classified as `unavailable` instead of leaking the
 * generic "Request failed. Please try again." mask.
 */
const CODE_MSG_KEYS = {
  network: 'err.network',
  timeout: 'err.timeout',
  unavailable: 'err.unavailable',
  rate_limited: 'err.rateLimited',
  cooldown: 'err.rateLimited',
  invalid_phone: 'auth.invalidPhone',
  otp_invalid: 'err.otpInvalid',
  otp_expired: 'err.otpInvalid',
  unauthorized: 'err.sessionExpired',
  forbidden: 'err.forbidden',
  demo_readonly: 'demo.blocked',
};

function classifyError(status, payload, err) {
  const isOurs = payload && typeof payload === 'object' && (payload.error?.code || payload.detail);
  const isHtml = typeof payload === 'string' && /^\s*</.test(payload);
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) return 'timeout';
  if (!status) return 'network';
  if (payload?.error?.code) return payload.error.code;
  // Server answered but not with our error envelope: static host / gateway /
  // wrong backend URL — never surface raw HTML or a bare status to the user.
  if (isHtml || (!isOurs && [404, 405, 415, 422, 500, 502, 503, 504].includes(status))) return 'unavailable';
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'bad_request';
  return 'http_error';
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const payload = err.response?.data;
    const friendly = payload?.error || {};
    const lang = store.getLang();
    const code = classifyError(status, payload, err);
    // Preferred message: localized key when known, else server's (mr/en),
    // else the localized classification — NEVER a bare "Request failed".
    const msgKey = friendly.msgKey || CODE_MSG_KEYS[code] || null;
    let message = null;
    if (lang === 'mr' && friendly.message_mr) message = friendly.message_mr;
    else if (friendly.message) message = friendly.message;
    if (msgKey) {
      const localized = tStatic(msgKey);
      if (localized) message = localized;
    }
    if (!message) {
      message = tStatic('err.generic') || 'Something went wrong. Please try again.';
    }
    const normalized = {
      status,
      code,
      msgKey,
      message,
      messageMr: friendly.message_mr || null,
      messageEn: friendly.message || null,
      requestId: friendly.request_id || null,
      raw: err,
    };
    // Structured diagnostics — status/code/path/request id only. Never tokens,
    // OTPs, phone numbers or request bodies.
    try {
      const path = String(err.config?.url || '').split('?')[0];
      console.warn('[api-error]', JSON.stringify({
        code, status: status || 0, path, request_id: normalized.requestId, ts: Date.now(),
      }));
    } catch { /* diagnostics must never break error handling */ }
    // session expired — notify once, keep in-progress state handling to pages
    if (status === 401 && !err.config?.url?.includes('/auth/')) {
      if (onUnauthorized) onUnauthorized(normalized);
    }
    err.friendly = normalized;
    return Promise.reject(err);
  }
);

/** Extract the friendly, localized message from any thrown axios error. */
export function errMsg(err, fallback = null) {
  const f = err?.friendly;
  if (!f) return fallback != null ? fallback : (tStatic('err.generic') || 'Something went wrong.');
  if (f.msgKey) {
    const localized = tStatic(f.msgKey);
    if (localized) return localized;
  }
  return f.message || fallback || (tStatic('err.generic') || 'Something went wrong.');
}

/** The i18n key for an error (tests + structured handling). */
export function errKey(err) {
  return err?.friendly?.msgKey || null;
}

export function errCode(err) {
  return err?.friendly?.code || 'unknown';
}

/** Is this a duplicate/idempotent replay we should treat as success? */
export function isConflict(err) {
  return err?.friendly?.status === 409;
}

// ---------------------------------------------------------------------------
// public configuration (brand, support, otp mode, features)
// ---------------------------------------------------------------------------
let configPromise = null;
export function fetchConfig(force = false) {
  if (!configPromise || force) {
    configPromise = api.get('/config')
      .then((r) => r.data)
      .catch(() => ({
        brand: { name: 'NafaMitra', tagline: 'ग्राहक वाढवा, नफा वाढवा!' },
        support: { enabled: false, whatsapp_number: '', email: '' },
        otp: { dev_mode: true, length: 5, ttl_seconds: 300, resend_cooldown_seconds: 30 },
        features: {},
        languages: [],
      }));
  }
  return configPromise;
}

export default api;
