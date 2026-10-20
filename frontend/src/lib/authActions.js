/**
 * Authentication actions — reusable, framework-agnostic wrappers over the
 * single Supabase client (email/password, Google OAuth, recovery, profile
 * phone capture). Every function returns `{ error }` shaped results and maps
 * failures through supabaseAuthErrorKey so UIs never leak raw provider text.
 *
 * The mobile number is PROFILE DATA only (stored via user_metadata at
 * signup, then owned by the app profile). No OTP, no phone login, no
 * verification claim — see `signupWithEmail`.
 */
import { getSupabase, supabaseAuthErrorKey } from './supabase';

export function callbackUrl(path = '/auth/callback') {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}`;
}

/** Normalize Indian mobile input for profile storage (10-digit canonical). */
export function normalizePhoneInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

function fail(err) {
  return { error: { raw: err, key: supabaseAuthErrorKey(err) } };
}

/**
 * Email + password signup. `phone` is OPTIONAL profile information:
 * sent as user_metadata (never authenticated with, never verified, never
 * required) and copied into the app profile on first session.
 */
export async function signupWithEmail({ email, password, phone }) {
  try {
    const supabase = getSupabase();
    const data = {};
    const norm = phone ? normalizePhoneInput(phone) : '';
    if (phone && !norm) return { error: { key: 'auth.invalidPhone', field: 'phone' } };
    if (norm) data.phone_number = norm;
    const { data: out, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data, emailRedirectTo: callbackUrl() },
    });
    if (error) return fail(error);
    const needsConfirm = !out.session;
    return { data: { needsConfirmation: needsConfirm, user: out.user || null } };
  } catch (e) {
    return fail(e);
  }
}

export async function signinWithEmail({ email, password }) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return fail(error);
    return { data: { session: data.session } };
  } catch (e) {
    return fail(e);
  }
}

/** Real Google OAuth through Supabase — redirects to /auth/callback. */
export async function signinWithGoogle() {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    if (error) return fail(error);
    return { data: { redirecting: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function resendConfirmation(email) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resendConfirmationEmail({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) return fail(error);
    return { data: { sent: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function sendRecovery(email) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl(),
    });
    if (error) return fail(error);
    return { data: { sent: true } };
  } catch (e) {
    return fail(e);
  }
}

/** Set a new password for the CURRENT recovery session. Success is only
 * reported after the server confirms updateUser. */
export async function updatePassword({ password }) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return fail(error);
    return { data: { updated: true } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Best-effort global sign-out (server invalidation) with a guaranteed local
 * clear — the app session state is cleared by AuthContext regardless.
 */
export async function signOutEverywhere() {
  const supabase = getSupabase();
  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) await supabase.auth.signOut({ scope: 'local' });
  } catch {
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* local clear below */ }
  }
}
