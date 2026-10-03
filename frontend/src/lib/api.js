/**
 * API client: one axios instance for the whole app.
 * - attaches the session token and the active shop header
 * - normalises server errors into { code, message, message_mr }
 * - logs the user out once on 401 (session expiry) without redirect loops
 */
import axios from 'axios';

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

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = store.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const shopId = store.getShopId();
  if (shopId) config.headers['X-Shop-Id'] = shopId;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const payload = err.response?.data;
    const friendly = payload?.error || {};
    const lang = store.getLang();
    const normalized = {
      status,
      code: friendly.code || 'network',
      message: (lang === 'mr' && friendly.message_mr) ? friendly.message_mr
        : (friendly.message || (status ? 'Request failed. Please try again.' : 'Network error. Please check your connection.')),
      messageMr: friendly.message_mr || null,
      messageEn: friendly.message || null,
      requestId: friendly.request_id || null,
      raw: err,
    };
    // session expired — notify once, keep in-progress state handling to pages
    if (status === 401 && !err.config?.url?.includes('/auth/')) {
      if (onUnauthorized) onUnauthorized(normalized);
    }
    err.friendly = normalized;
    return Promise.reject(err);
  }
);

/** Extract the friendly message from any thrown axios error. */
export function errMsg(err, fallback = 'Something went wrong. Please try again.') {
  return err?.friendly?.message || fallback;
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
