/**
 * /auth — NafaMitra authentication.
 *
 * Real production flow = Supabase Auth: email/password sign-in & signup,
 * Continue with Google (real OAuth), forgot/reset password, pending-email
 * confirmation with resend. The mobile number is an OPTIONAL profile field
 * ("no OTP") captured at signup and edited later in settings — it is never
 * an authentication method and never verified.
 *
 * Journey cards + demo explorer only render in demo-enabled (test/local)
 * builds (DEMO_ENABLED); production builds ship the focused auth card only.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2, Mail, Lock, Store, User, Sparkles, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import { fetchConfig } from '@/lib/api';
import { DEMO_ENABLED } from '@/lib/demoFlag';
import { supabaseConfigured } from '@/lib/supabase';
import {
  signupWithEmail, signinWithEmail, signinWithGoogle, resendConfirmation,
  sendRecovery, updatePassword, normalizePhoneInput,
} from '@/lib/authActions';

const JOURNEYS = [
  {
    key: 'merchant', testid: 'role-merchant', icon: Store,
    titleKey: 'auth.jOwnerTitle', subKey: 'auth.jOwnerSub',
    loginKey: 'auth.loginAsOwner', signupKey: 'auth.createOwner',
    loginTestid: 'journey-merchant-login', signupTestid: 'journey-merchant-signup',
    tone: 'emerald',
  },
  {
    key: 'customer', testid: 'role-customer', icon: User,
    titleKey: 'auth.jCustTitle', subKey: 'auth.jCustSub',
    loginKey: 'auth.loginAsCustomer', signupKey: 'auth.createCustomer',
    loginTestid: 'journey-customer-login', signupTestid: 'journey-customer-signup',
    tone: 'slate',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasSessionish = () => {
  try { return Boolean(localStorage.getItem('nafamitra_token')); } catch { return false; }
};

/** Field helpers — MODULE level so React keeps input identity (and focus)
 *  across re-renders. */
  function Field({ id, label, type = 'text', value, onChange, placeholder, testid, autoComplete, icon: Icon, errorKey }) {
  const { t } = useI18n();
  return (    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <div className="relative">
        {Icon && <Icon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />}
        <input
          id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
          autoComplete={autoComplete} data-testid={testid}
          aria-invalid={!!errorKey} aria-describedby={errorKey ? `${id}-err` : undefined}
          className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 rounded-xl border text-sm bg-white
            ${errorKey ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-100'}
            focus:outline-none focus:ring-2`}
        />
      </div>
      {errorKey && (
        <p id={`${id}-err`} role="alert" className="text-xs text-red-600 mt-1">{t(errorKey)}</p>
      )}
    </div>
  );
}

function SubmitBtn({ label, testid, busy }) {
  const { t } = useI18n();
  return (
    <button type="submit" disabled={busy} data-testid={testid}
      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60
        text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
      {!busy && <ArrowRight className="w-4 h-4" />}
    </button>
  );
}

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { token, loading: authLoading, enterDemo, bootError } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const intentParam = params.get('as') === 'customer' ? 'customer' : null;
  const recoveryParam = params.get('recovery') === '1';
  const [view, setView] = useState(
    !DEMO_ENABLED || intentParam ? 'auth' : 'journey'
  ); // journey | auth
  const [mode, setMode] = useState('signin'); // signin | signup | forgot | reset | pending
  const [demoView, setDemoView] = useState(null); // null | 'picker' | 'transition'
  const [demoRole, setDemoRole] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [fieldError, setFieldError] = useState(null); // {field, key}
  const [error, setError] = useState(null);           // i18n key
  const [info, setInfo] = useState(null);             // success/info i18n key
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);
  const emailRef = useRef(null);

  useEffect(() => { fetchConfig().then(setConfig).catch(() => setConfig({})); }, []);

  // Recovery links land on /auth/callback → routed here with a session.
  useEffect(() => {
    if (recoveryParam) {
      setView('auth');
      setMode(hasSessionish() || token ? 'reset' : 'expired');
    }
  }, [recoveryParam, token]);

  // Authenticated already → leave (never show a login form to a session).
  useEffect(() => {
    if (token && !authLoading && mode !== 'reset') navigate('/', { replace: true });
  }, [token, authLoading, mode, navigate]);

  // Demo transition (test builds only)
  useEffect(() => {
    if (!DEMO_ENABLED || demoView !== 'transition' || !demoRole) return undefined;
    const id = setTimeout(() => {
      enterDemo(demoRole);
      navigate(demoRole === 'merchant' ? '/dashboard' : '/c', { replace: true });
    }, 900);
    return () => clearTimeout(id);
  }, [demoView, demoRole, enterDemo, navigate]);

  const openAuth = (nextMode) => {
    setView('auth');
    setMode(nextMode);
    setError(null); setInfo(null); setFieldError(null);
    setTimeout(() => { if (emailRef.current) emailRef.current.focus(); }, 50);
  };

  const validateEmail = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError({ field: 'email', key: 'auth.invalidEmail' });
      return false;
    }
    return true;
  };

  const submitSignin = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setFieldError(null);
    if (!validateEmail()) return;
    if (!password) { setFieldError({ field: 'password', key: 'auth.required' }); return; }
    setBusy(true);
    const { error: err } = await signinWithEmail({ email, password });
    setBusy(false);
    if (err) setError(err.key || 'auth.errGeneric');
    // success → AuthContext SIGNED_IN flips `token` → redirect effect runs
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setFieldError(null);
    if (!validateEmail()) return;
    if (password.length < 6) { setFieldError({ field: 'password', key: 'auth.errWeakPassword' }); return; }
    if (password !== confirm) { setFieldError({ field: 'confirm', key: 'auth.passwordMismatch' }); return; }
    let norm = '';
    if (phone.trim()) {
      norm = normalizePhoneInput(phone);
      if (!norm) { setFieldError({ field: 'phone', key: 'auth.invalidPhone' }); return; }
    }
    setBusy(true);
    const { data, error: err } = await signupWithEmail({ email, password, phone: norm });
    setBusy(false);
    if (err) { setError(err.key || 'auth.errGeneric'); return; }
    if (data?.needsConfirmation) {
      setPendingEmail(email.trim());
      setMode('pending');
    }
    // session returned (confirmations off) → redirect effect handles entry
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setFieldError(null);
    if (!validateEmail()) return;
    setBusy(true);
    const { error: err } = await sendRecovery(email);
    setBusy(false);
    if (err) { setError(err.key || 'auth.errGeneric'); return; }
    // Only confirm what the server acknowledged — nothing before that.
    setInfo('auth.recoverySent');
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setError(null); setFieldError(null);
    if (password.length < 6) { setFieldError({ field: 'password', key: 'auth.errWeakPassword' }); return; }
    if (password !== confirm) { setFieldError({ field: 'confirm', key: 'auth.passwordMismatch' }); return; }
    setBusy(true);
    const { data, error: err } = await updatePassword({ password });
    setBusy(false);
    if (err) { setError(err.key || 'auth.errGeneric'); return; }
    if (data?.updated) navigate('/', { replace: true });
  };

  const doResend = async () => {
    setError(null); setInfo(null);
    setBusy(true);
    const { error: err } = await resendConfirmation(pendingEmail || email);
    setBusy(false);
    if (err) setError(err.key || 'auth.errGeneric');
    else setInfo('auth.resendSent');
  };

  const doGoogle = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await signinWithGoogle();
    setBusy(false); // on success the browser navigates away
    if (err) setError(err.key || 'auth.errGeneric');
  };

  const errText = error ? t(error) : null;



  // ── demo journey landing (demo-enabled builds only) ─────────────────────
  if (view === 'journey' && DEMO_ENABLED) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 flex flex-col">
        <div className="flex justify-end p-3 gap-2">
          {['mr', 'en', 'hi'].map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${lang === l ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {l === 'mr' ? 'मराठी' : l === 'en' ? 'English' : 'हिंदी'}
            </button>
          ))}
        </div>
        <main className="flex-1 flex items-center justify-center px-4 pb-10">
          <div className="w-full max-w-md">
            <div className="text-center mb-6" data-testid="auth-brand-block">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-2">न</div>
              <h1 className="text-xl font-extrabold text-slate-900">NafaMitra</h1>
              <p className="text-xs text-slate-500">{t('brand.tagline')}</p>
            </div>

            <div className="space-y-3" data-testid="journey-landing">
              {JOURNEYS.map((j) => (
                <div key={j.key} data-testid={j.testid}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${j.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      <j.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm">{t(j.titleKey)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t(j.subKey)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button type="button" data-testid={j.loginTestid}
                      onClick={() => openAuth('signin')}
                      className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      {t(j.loginKey)}
                    </button>
                    <button type="button" data-testid={j.signupTestid}
                      onClick={() => openAuth('signup')}
                      className="py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                      {t(j.signupKey)}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 text-center">{t('auth.journeyNote')}</p>
            </div>

            {demoView === null && (
              <div className="pt-4 text-center" data-testid="demo-cta">
                <div className="text-xs text-slate-400 mb-2">{t('auth.demoOr')}</div>
                <button type="button" data-testid="explore-demo"
                  onClick={() => setDemoView('picker')}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 text-amber-800 text-sm font-bold hover:bg-amber-50">
                  <Sparkles className="w-4 h-4 inline -mt-0.5 mr-1" />
                  {t('auth.exploreDemo')}
                </button>
                <p className="text-[11px] text-slate-400 mt-1">{t('auth.exploreDemoSub')}</p>
              </div>
            )}

            {demoView === 'picker' && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-4 space-y-2.5 mt-4" data-testid="demo-picker">
                <p className="text-sm font-extrabold text-slate-800 text-center">{t('auth.demoChooserTitle')}</p>
                <p className="text-[11px] text-slate-500 text-center -mt-1">{t('auth.demoChooserSub')}</p>
                <button type="button" data-testid="demo-retailer" onClick={() => { setDemoRole('merchant'); setDemoView('transition'); }}
                  className="w-full text-left rounded-xl bg-white border border-amber-200 p-3 hover:border-amber-400">
                  <p className="text-sm font-bold text-emerald-800">{t('auth.demoRetailer')}</p>
                  <p className="text-[11px] text-slate-500">{t('auth.demoRetailerSub')}</p>
                </button>
                <button type="button" data-testid="demo-customer" onClick={() => { setDemoRole('customer'); setDemoView('transition'); }}
                  className="w-full text-left rounded-xl bg-white border border-amber-200 p-3 hover:border-amber-400">
                  <p className="text-sm font-bold text-emerald-800">{t('auth.demoCustomer')}</p>
                  <p className="text-[11px] text-slate-500">{t('auth.demoCustomerSub')}</p>
                </button>
                <button type="button" data-testid="demo-cancel" onClick={() => setDemoView(null)}
                  className="w-full text-xs font-semibold text-slate-500 py-1">
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {demoView === 'transition' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center space-y-2 mt-4" data-testid="demo-transition">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                <p className="text-sm font-bold text-emerald-900">{t('auth.demoTransitionTitle')}</p>
                <p className="text-xs text-emerald-700">{t('auth.demoTransitionSub')}</p>
                <button type="button" data-testid="enter-demo"
                  onClick={() => { enterDemo(demoRole); navigate(demoRole === 'merchant' ? '/dashboard' : '/c', { replace: true }); }}
                  className="mt-1 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
                  {t('auth.enterDemo')}
                </button>
              </div>
            )}
          </div>
        </main>
        <footer className="text-center pb-6 text-[11px] text-slate-400">
          {config?.support?.enabled && config.support.email
            ? <a href={`mailto:${config.support.email}`} className="underline">{t('auth.needHelp')}</a>
            : t('auth.footerNote')}
        </footer>
      </div>
    );
  }

  // ── auth card ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 flex flex-col">
      <div className="flex justify-end p-3 gap-2">
        {['mr', 'en', 'hi'].map((l) => (
          <button key={l} onClick={() => setLang(l)}
            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${lang === l ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {l === 'mr' ? 'मराठी' : l === 'en' ? 'English' : 'हिंदी'}
          </button>
        ))}
      </div>

      <main className="flex-1 flex items-start md:items-center justify-center px-4 pb-12 pt-2">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-2">न</div>
            <h1 className="text-xl font-extrabold text-slate-900">
              {mode === 'forgot' ? t('auth.forgotTitle')
                : mode === 'reset' ? t('auth.resetTitle')
                : mode === 'pending' ? t('auth.pendingTitle')
                : mode === 'expired' ? t('auth.linkExpiredTitle')
                : t('auth.welcome')}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {mode === 'forgot' ? t('auth.forgotSub')
                : mode === 'reset' ? t('auth.resetSub')
                : mode === 'pending' ? ''
                : mode === 'expired' ? t('auth.linkExpiredBody')
                : t('brand.tagline')}
            </p>
          </div>

          {!supabaseConfigured() && (
            <div role="alert" data-testid="supabase-missing"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {t('auth.errConfigMissing')}
            </div>
          )}

          {errText && (
            <div role="alert" data-testid="auth-error"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-medium">
              {errText}
            </div>
          )}
          {info && (
            <div role="status" data-testid="auth-info"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 font-medium">
              {t(info)}
            </div>
          )}

          {mode === 'signin' && (
            <form onSubmit={submitSignin} data-testid="auth-signin-form" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
              <Field id="si-email" label={t('auth.email')} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPh')}
                autoComplete="email" testid="auth-email-input" icon={Mail}
                errorKey={fieldError?.field === 'email' ? fieldError.key : null} />
              <Field id="si-pass" label={t('auth.password')} type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPh')}
                autoComplete="current-password" testid="auth-password-input" icon={Lock}
                errorKey={fieldError?.field === 'password' ? fieldError.key : null} />
              <div className="flex justify-end -mt-1">
                <button type="button" data-testid="auth-forgot-link"
                  onClick={() => openAuth('forgot')}
                  className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" /> {t('auth.forgotPassword')}
                </button>
              </div>
              <SubmitBtn label={t('auth.signIn')} testid="auth-signin-submit" busy={busy} />
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="flex-1 h-px bg-slate-200" /> {t('auth.orContinue')} <span className="flex-1 h-px bg-slate-200" />
              </div>
              <button type="button" data-testid="auth-google-btn" onClick={doGoogle} disabled={busy}
                className="w-full py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50
                  text-sm font-bold text-slate-700 flex items-center justify-center gap-2 disabled:opacity-60">
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                {t('auth.continueGoogle')}
              </button>
              <p className="text-center text-xs text-slate-500">
                {t('auth.noAccount')}{' '}
                <button type="button" data-testid="auth-switch-signup" onClick={() => openAuth('signup')}
                  className="font-bold text-emerald-700 hover:underline">{t('auth.signUp')}</button>
              </p>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={submitSignup} data-testid="auth-signup-form" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
              <Field id="su-email" label={t('auth.email')} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPh')}
                autoComplete="email" testid="auth-email-input" icon={Mail}
                errorKey={fieldError?.field === 'email' ? fieldError.key : null} />
              <Field id="su-pass" label={t('auth.password')} type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPh')}
                autoComplete="new-password" testid="auth-password-input" icon={Lock}
                errorKey={fieldError?.field === 'password' ? fieldError.key : null} />
              <Field id="su-confirm" label={t('auth.confirmPassword')} type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder={t('auth.passwordPh')}
                autoComplete="new-password" testid="auth-confirm-input" icon={Lock}
                errorKey={fieldError?.field === 'confirm' ? fieldError.key : null} />
              <div>
                <Field id="su-phone" label={t('auth.phoneOptional')} type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)} placeholder={t('auth.phonePh')}
                  autoComplete="tel-national" testid="auth-phone-input"
                  errorKey={fieldError?.field === 'phone' ? fieldError.key : null} />
                <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-px" />
                  {t('auth.phoneNoOtp')}
                </p>
              </div>
              <SubmitBtn label={t('auth.createAccount')} testid="auth-signup-submit" busy={busy} />
              <p className="text-center text-xs text-slate-500">
                {t('auth.haveAccount')}{' '}
                <button type="button" data-testid="auth-switch-signin" onClick={() => openAuth('signin')}
                  className="font-bold text-emerald-700 hover:underline">{t('auth.signIn')}</button>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={submitForgot} data-testid="auth-forgot-form" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
              <p className="text-xs text-slate-500">{t('auth.forgotSub')}</p>
              <Field id="fg-email" label={t('auth.email')} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPh')}
                autoComplete="email" testid="auth-email-input" icon={Mail}
                errorKey={fieldError?.field === 'email' ? fieldError.key : null} />
              <SubmitBtn label={t('auth.sendRecovery')} testid="auth-forgot-submit" busy={busy} />
              <button type="button" data-testid="auth-back-signin" onClick={() => openAuth('signin')}
                className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 py-1">
                {t('auth.backToSignIn')}
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={submitReset} data-testid="auth-reset-form" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
              <Field id="rs-pass" label={t('auth.newPassword')} type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPh')}
                autoComplete="new-password" testid="auth-password-input" icon={Lock}
                errorKey={fieldError?.field === 'password' ? fieldError.key : null} />
              <Field id="rs-confirm" label={t('auth.confirmPassword')} type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder={t('auth.passwordPh')}
                autoComplete="new-password" testid="auth-confirm-input" icon={Lock}
                errorKey={fieldError?.field === 'confirm' ? fieldError.key : null} />
              <SubmitBtn label={t('auth.setNewPassword')} testid="auth-reset-submit" busy={busy} />
            </form>
          )}

          {mode === 'pending' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center space-y-3" data-testid="auth-confirmation-pending">
              <Mail className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm text-slate-700 font-medium">
                {t('auth.pendingBody', { email: pendingEmail })}
              </p>
              <p className="text-xs text-slate-400">{t('auth.pendingHint')}</p>
              <button type="button" data-testid="auth-resend-btn" onClick={doResend} disabled={busy}
                className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <RefreshCw className="w-4 h-4" /> {t('auth.resend')}
              </button>
              <button type="button" data-testid="auth-change-email" onClick={() => openAuth('signup')}
                className="w-full text-xs font-semibold text-emerald-700 hover:underline py-1">
                {t('auth.changeEmail')}
              </button>
            </div>
          )}

          {mode === 'expired' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center space-y-3" data-testid="auth-link-expired">
              <Lock className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-600">{t('auth.linkExpiredBody')}</p>
              <button type="button" data-testid="auth-back-signin" onClick={() => openAuth('signin')}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
                {t('auth.backToSignIn')}
              </button>
            </div>
          )}

          {bootError && (
            <p className="text-[11px] text-center text-slate-400" data-testid="auth-boot-note">
              {t('auth.errNetwork')}
            </p>
          )}

          <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> {t('auth.privacyNote')}
          </p>

        </div>
      </main>
    </div>
  );
}
