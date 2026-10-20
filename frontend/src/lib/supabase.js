/**
 * Single Supabase client for the SPA.
 *
 * Configuration comes from CRA env (build-time, PUBLIC values only — never
 * secrets):
 *   REACT_APP_SUPABASE_URL          e.g. https://izfcjxabnahcsmzhosuo.supabase.co
 *   REACT_APP_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…   (anon/publishable key)
 *
 * - Fails CLEARLY (typed Error with `code: 'supabase_config'`) when the env
 *   is missing instead of creating a client against a wrong/blank project.
 * - One client instance for the whole app (single session store, single
 *   auto-refresh loop) — never createClient() anywhere else.
 * - PKCE flow with detectSessionInUrl for email confirmation / recovery /
 *   OAuth callbacks; session persists in localStorage across refreshes.
 */
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_STORAGE_KEY = 'nafamitra_supabase_auth';

/** Runtime override file (public/env.js) — fills gaps when the build had no
 *  .env (ZIP downloads, static hosts). Build-time env still wins. */
function runtimeEnv() {
  try {
    return (typeof window !== 'undefined' && window.__NAFAMITRA_ENV__) || {};
  } catch { return {}; }
}

/** Pure env reader — exported for tests. Pass an object to test in isolation;
 *  no argument ⇒ build-time process.env with runtime env.js fallback. */
export function readSupabaseConfig(env) {
  let source = env;
  if (!source) {
    const built = (typeof process !== 'undefined' && process.env) || {};
    const runtime = runtimeEnv();
    source = {
      REACT_APP_SUPABASE_URL: built.REACT_APP_SUPABASE_URL || runtime.REACT_APP_SUPABASE_URL || '',
      REACT_APP_SUPABASE_PUBLISHABLE_KEY: built.REACT_APP_SUPABASE_PUBLISHABLE_KEY
        || runtime.REACT_APP_SUPABASE_PUBLISHABLE_KEY || '',
      REACT_APP_SUPABASE_ANON_KEY: built.REACT_APP_SUPABASE_ANON_KEY
        || runtime.REACT_APP_SUPABASE_ANON_KEY || '',
    };
  }
  const url = String(source.REACT_APP_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(
    source.REACT_APP_SUPABASE_PUBLISHABLE_KEY || source.REACT_APP_SUPABASE_ANON_KEY || ''
  ).trim();
  const missing = [];
  if (!url) missing.push('REACT_APP_SUPABASE_URL');
  if (!key) missing.push('REACT_APP_SUPABASE_PUBLISHABLE_KEY');
  if (missing.length) return { ok: false, missing, url, key };
  if (!/^https?:\/\//.test(url)) {
    return { ok: false, missing: ['REACT_APP_SUPABASE_URL (must be http(s) URL)'], url, key };
  }
  return { ok: true, missing: [], url, key };
}

let client = null;
let configError = null;

export function supabaseConfigured() {
  return readSupabaseConfig().ok;
}

/** Lazy singleton. Throws the same typed config error every call. */
export function getSupabase() {
  if (client) return client;
  const cfg = readSupabaseConfig();
  if (!cfg.ok) {
    if (!configError) {
      configError = new Error(
        `Supabase is not configured — missing/invalid: ${cfg.missing.join(', ')}. ` +
        'Set them in the deployment environment (see frontend/.env.example).'
      );
      configError.code = 'supabase_config';
    }
    throw configError;
  }
  client = createClient(cfg.url, cfg.key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: SUPABASE_STORAGE_KEY,
      // Session lives in localStorage (SPA); Supabase refreshes tokens.
    },
  });
  return client;
}

/** Safe null-returning accessor for code paths that must not throw. */
export function tryGetSupabase() {
  try { return getSupabase(); } catch { return null; }
}

/**
 * Friendly, localized (via i18n keys) mapping of supabase-js AuthError codes.
 * Returns an i18n key under `auth.err…`; null when the error is a plain
 * network failure (`code: 'network'` expected by the UI layer instead).
 */
export function supabaseAuthErrorKey(err) {
  if (!err) return null;
  if (err.code === 'supabase_config') return 'auth.errConfigMissing';
  const code = String(err.code || err.name || '');
  const msg = `${err.message || ''} ${err.error_description || err.error_code || ''}`;
  if (/invalid_credentials/i.test(code) || /invalid login credentials/i.test(msg)) {
    return 'auth.errInvalidCredentials';
  }
  if (/email_not_confirmed/i.test(code) || /email not confirmed/i.test(msg)) {
    return 'auth.errEmailNotConfirmed';
  }
  if (/user_already_exists/i.test(code) || /already registered/i.test(msg)) {
    return 'auth.errEmailTaken';
  }
  if (/weak_password/i.test(code) || /password should be/i.test(msg)) {
    return 'auth.errWeakPassword';
  }
  if (/over_request_rate_limit|rate limit/i.test(msg)) {
    return 'auth.errRateLimited';
  }
  if (/user_not_found|identity_not_found/i.test(code)) {
    return 'auth.errNoAccount';
  }
  if (/provider.*not.*enabled|unsupported|not enabled|redirect_uri|invalid request.*redirect|not authorized to perform/i.test(msg)
      || /provider.*disabled/i.test(msg)) {
    return 'auth.errProviderMissing';
  }
  if (/access_denied|cancelled|cancel/i.test(msg)) {
    return 'auth.errCancelled';
  }
  if (/failed to fetch|networkerror|network|load failed|socket/i.test(msg)
      || code === 'AuthRetryableFetchError' || err.name === 'TypeError') {
    return 'auth.errNetwork';
  }
  if (/otp|token.*invalid|invalid.*token|link/i.test(msg)) {
    return 'auth.errLinkInvalid';
  }
  if (/expired/i.test(msg)) {
    return 'auth.errLinkExpired';
  }
  return 'auth.errGeneric';
}
