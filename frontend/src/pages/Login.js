import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { track, ACTIVATION } from '@/lib/analytics';
import { fetchConfig, errMsg } from '@/lib/api';
import { whatsappSupportHref } from '@/lib/config';
import { toast } from 'sonner';
import {
  Store, User, ArrowRight, Smartphone, ShieldCheck, Zap, WifiOff,
  ChevronLeft, HelpCircle, Sparkles,
} from 'lucide-react';

export function LanguageSwitcher({ compact = false }) {
  const { lang, setLang, languages } = useI18n();
  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`} role="group" aria-label="Language">
      {languages.map((l, i) => (
        <React.Fragment key={l.code}>
          {i > 0 && <span className="text-slate-300 text-xs">|</span>}
          <button
            type="button"
            onClick={() => { if (l.code !== lang) track(ACTIVATION.LANGUAGE_CHANGED, { lang: l.code }); setLang(l.code); }}
            aria-pressed={lang === l.code}
            className={`text-xs font-semibold px-1.5 py-1 rounded transition-colors ${
              lang === l.code ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {l.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function OtpScreen({ phone, config, devOtpInitial, onBack, onSuccess }) {
  const { t } = useI18n();
  const { verifyOtp, requestOtp } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState(devOtpInitial || null);
  const [countdown, setCountdown] = useState(config?.otp?.resend_cooldown_seconds || 30);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) return undefined;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const submit = useCallback(async (value) => {
    const finalCode = (value ?? code).trim();
    if (!finalCode) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, finalCode);
      onSuccess(result);
    } catch (e) {
      setError(errMsg(e, t('auth.invalidPhone')));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }, [code, phone, verifyOtp, onSuccess, t]);

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, config?.otp?.length || 5);
    setError(null);
    setCode(digits);
    if (digits.length === (config?.otp?.length || 5)) submit(digits);
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (text) {
      e.preventDefault();
      const digits = text.slice(0, config?.otp?.length || 5);
      setCode(digits);
      if (digits.length === (config?.otp?.length || 5)) submit(digits);
    }
  };

  const resend = async () => {
    if (countdown > 0 || loading) return;
    try {
      const data = await requestOtp(phone);
      setDevOtp(data?.dev_otp || null);
      setCountdown(data?.resend_cooldown_seconds || 30);
      setError(null);
      setCode('');
      inputRef.current?.focus();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const masked = phone ? `${phone.slice(0, 5)} ${phone.slice(5)}` : '';

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="w-4 h-4" /> {t('auth.changeNumber')}
      </button>

      <div>
        <h2 className="text-lg font-bold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>
          {t('auth.otpTitle')}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t('auth.otpSentTo', { phone: masked })}
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="otp-input" className="sr-only">{t('auth.otpTitle')}</label>
        <input
          id="otp-input"
          ref={inputRef}
          data-testid="otp-input"
          value={code}
          onChange={handleChange}
          onPaste={handlePaste}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={config?.otp?.length || 5}
          placeholder={t('auth.otpPlaceholder')}
          aria-describedby="otp-help"
          className="w-full text-center tracking-[0.5em] text-2xl font-bold px-4 py-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400"
        />
        <p id="otp-help" className="text-xs text-slate-400 text-center mt-2">{t('auth.otpHint')}</p>

        {error && (
          <div role="alert" data-testid="otp-error" className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {devOtp && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>{t('auth.devOtp')}: <b className="font-mono">{devOtp}</b></span>
          </div>
        )}

        <button
          type="submit"
          data-testid="otp-submit"
          disabled={loading || code.length < (config?.otp?.length || 5)}
          className="mt-4 w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>{t('auth.verifyOtp')} <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </form>

      <div className="text-center text-sm text-slate-500">
        {countdown > 0 ? (
          <span data-testid="otp-countdown">{t('auth.resendIn', { seconds: countdown })}</span>
        ) : (
          <button type="button" data-testid="otp-resend" onClick={resend} className="text-emerald-700 font-semibold hover:underline">
            {t('auth.resendOtp')}
          </button>
        )}
      </div>
    </div>
  );
}

/* Two journeys, ONE application & auth infrastructure. The landing makes the
   choice intentional; the shared OTP engine + identity resolution stay
   exactly the same (one underlying person, authorized contexts). */
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

export default function Login() {
  const { t } = useI18n();
  const { verifyOtp, requestOtp, token, loading: authLoading, kind, identities, enterDemo } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [config, setConfig] = useState(null);
  const intentParam = params.get('as') === 'customer' ? 'customer' : null;
  const [view, setView] = useState(intentParam ? 'form' : 'journey'); // journey | form
  const [intent, setIntent] = useState(intentParam || 'merchant');
  const [mode, setMode] = useState('login'); // login | signup
  const [step, setStep] = useState('phone'); // phone | otp
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [devOtp, setDevOtp] = useState(null);
  const [demoView, setDemoView] = useState(null); // null | 'picker' | 'transition'
  const [demoRole, setDemoRole] = useState(null); // 'merchant' | 'customer'
  const phoneRef = useRef(null);

  // Demo transition: short info screen, then straight into the dashboard.
  useEffect(() => {
    if (demoView !== 'transition' || !demoRole) return undefined;
    const id = setTimeout(() => {
      enterDemo(demoRole);
      navigate(demoRole === 'merchant' ? '/dashboard' : '/c', { replace: true });
    }, 900);
    return () => clearTimeout(id);
  }, [demoView, demoRole, enterDemo, navigate]);

  useEffect(() => { fetchConfig().then(setConfig); }, []);

  // already signed in → route by identity
  useEffect(() => {
    if (!authLoading && token && identities) {
      routeByIdentities(identities, intent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token, identities]);

  const routeByIdentities = (idt, chosenIntent) => {
    const shops = idt?.shops || [];
    const profiles = idt?.customer_profiles || [];
    if (idt.kind === 'new' || (!shops.length && !profiles.length)) {
      // signup lands in the matching onboarding — never the other journey's form
      navigate(`/onboarding?intent=${chosenIntent}`, { replace: true });
    } else if (idt.kind === 'both') {
      // dual identity: honour the contextual entry card, switcher available later
      navigate(chosenIntent === 'customer' ? '/c' : '/', { replace: true });
    } else if (shops.length) {
      navigate('/', { replace: true });
    } else {
      navigate('/c', { replace: true });
    }
  };

  const startJourney = (journeyKey, journeyMode) => {
    setIntent(journeyKey);
    setMode(journeyMode);
    setView('form');
    setStep('phone');
    setError(null);
    setTimeout(() => phoneRef.current?.focus(), 50);
  };

  const sendOtp = async (e) => {
    e?.preventDefault();
    const digits = (phone || '').replace(/\D/g, '');
    const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
    if (!/^[6-9]\d{9}$/.test(ten)) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await requestOtp(ten);
      setDevOtp(data?.dev_otp || null);
      setCode('');
      setStep('otp');
      setPhone(ten);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const onSuccess = (result) => {
    track(ACTIVATION.LOGIN, { intent, mode });
    routeByIdentities(result.identities, intent);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50/50">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const supportHref = whatsappSupportHref(config);
  const highlights = intent === 'merchant'
    ? [
        { icon: Zap, title: t('auth.v1Title'), sub: t('auth.v1Sub') },
        { icon: ShieldCheck, title: t('auth.v2Title'), sub: t('auth.v2Sub') },
        { icon: Store, title: t('auth.v3Title'), sub: t('auth.v3Sub') },
      ]
    : [
        { icon: Sparkles, title: t('auth.c1Title'), sub: t('auth.c1Sub') },
        { icon: Smartphone, title: t('auth.c2Title'), sub: t('auth.c2Sub') },
        { icon: ShieldCheck, title: t('auth.c3Title'), sub: t('auth.c3Sub') },
      ];

  const formTitle = view === 'form'
    ? (intent === 'customer'
        ? (mode === 'signup' ? t('auth.createCustomer') : t('auth.customerWelcomeBack'))
        : t('auth.loginAsOwner'))
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50/40 flex flex-col">
      <header className="px-4 pt-4 flex justify-center">
        <LanguageSwitcher />
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 pb-8 pt-4 flex flex-col">
        {/* Brand */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
            <Store className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-slate-800 tracking-tight" style={{ fontFamily: 'Outfit,sans-serif' }}>
            {view === 'journey' ? t('auth.welcome') : 'NafaMitra'}
          </h1>
          <p className="text-sm font-semibold text-emerald-700 mt-1">{t('brand.tagline')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{t('brand.meaning')}</p>
        </div>

        {view === 'journey' ? (
          /* ---- Landing: two visually distinct journeys ---- */
          <div className="space-y-3" data-testid="journey-landing">
            {JOURNEYS.map((j) => {
              const Icon = j.icon;
              const isOwner = j.key === 'merchant';
              return (
                <div
                  key={j.key}
                  data-testid={j.testid}
                  className={`rounded-2xl border-2 p-4 shadow-sm ${
                    isOwner
                      ? 'border-emerald-500 bg-emerald-50/70'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isOwner ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}>
                      <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-extrabold text-slate-800">{t(j.titleKey)}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{t(j.subKey)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      type="button"
                      data-testid={j.loginTestid}
                      onClick={() => startJourney(j.key, 'login')}
                      className={`py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
                        isOwner
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-800 hover:bg-slate-900 text-white'
                      }`}
                    >
                      {t(j.loginKey)}
                    </button>
                    <button
                      type="button"
                      data-testid={j.signupTestid}
                      onClick={() => startJourney(j.key, 'signup')}
                      className={`py-2.5 rounded-xl text-[13px] font-bold border-2 transition-colors ${
                        isOwner
                          ? 'border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                          : 'border-slate-400 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {t(j.signupKey)}
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-slate-400 text-center px-2 leading-snug">
              {t('auth.journeyNote')}
            </p>

            {/* ---- Demo mode: labeled secondary entry, no OTP required ---- */}
            {demoView === null && (
              <div className="pt-1" data-testid="demo-cta">
                <div className="flex items-center gap-3 my-1" aria-hidden="true">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] text-slate-400 font-medium">{t('auth.demoOr')}</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  data-testid="explore-demo"
                  onClick={() => setDemoView('picker')}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 text-amber-800 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  {t('auth.exploreDemo')}
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-1.5 leading-snug">
                  {t('auth.exploreDemoSub')}
                </p>
              </div>
            )}

            {demoView === 'picker' && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-4 space-y-2.5" data-testid="demo-picker">
                <p className="text-sm font-extrabold text-slate-800 text-center">{t('auth.demoChooserTitle')}</p>
                <p className="text-[11px] text-slate-500 text-center -mt-1">{t('auth.demoChooserSub')}</p>
                <button
                  type="button"
                  data-testid="demo-retailer"
                  onClick={() => { setDemoRole('merchant'); setDemoView('transition'); }}
                  className="w-full text-left rounded-xl bg-white border border-emerald-300 hover:border-emerald-500 p-3 transition-colors"
                >
                  <p className="text-sm font-bold text-emerald-800">{t('auth.demoRetailer')}</p>
                  <p className="text-[11px] text-slate-500">{t('auth.demoRetailerSub')}</p>
                </button>
                <button
                  type="button"
                  data-testid="demo-customer"
                  onClick={() => { setDemoRole('customer'); setDemoView('transition'); }}
                  className="w-full text-left rounded-xl bg-white border border-slate-300 hover:border-slate-500 p-3 transition-colors"
                >
                  <p className="text-sm font-bold text-slate-800">{t('auth.demoCustomer')}</p>
                  <p className="text-[11px] text-slate-500">{t('auth.demoCustomerSub')}</p>
                </button>
                <button
                  type="button"
                  data-testid="demo-cancel"
                  onClick={() => { setDemoView(null); setDemoRole(null); }}
                  className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 py-1"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {demoView === 'transition' && (
              <div className="rounded-2xl border-2 border-amber-300 bg-white p-5 text-center space-y-2" data-testid="demo-transition">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-amber-600" aria-hidden="true" />
                </div>
                <p className="text-base font-extrabold text-slate-800">{t('auth.demoTransitionTitle')}</p>
                <p className="text-xs text-slate-500 leading-snug">{t('auth.demoTransitionSub')}</p>
                <button
                  type="button"
                  data-testid="enter-demo"
                  onClick={() => {
                    enterDemo(demoRole);
                    navigate(demoRole === 'merchant' ? '/dashboard' : '/c', { replace: true });
                  }}
                  className="w-full mt-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-colors"
                >
                  {t('auth.enterDemo')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ---- Selected journey: shared OTP engine ---- */}
            <button
              type="button"
              onClick={() => { setView('journey'); setStep('phone'); setError(null); }}
              className="self-start flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
              data-testid="back-to-journey"
            >
              <ChevronLeft className="w-4 h-4" /> {t('auth.changeJourney')}
            </button>

            <p className="text-lg font-extrabold text-slate-800 mb-3" data-testid="journey-title">
              {formTitle}
            </p>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="login-card">
              {step === 'phone' ? (
                <form onSubmit={sendOtp} data-testid="phone-form" className="space-y-3">
                  <label htmlFor="phone-input" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('auth.enterPhone')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm select-none">+91</span>
                    <input
                      id="phone-input"
                      ref={phoneRef}
                      data-testid="phone-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      maxLength={12}
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setError(null); }}
                      placeholder={t('auth.phonePlaceholder')}
                      aria-invalid={!!error}
                      className="w-full pl-14 pr-4 py-4 text-lg font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400"
                    />
                  </div>
                  {error && (
                    <div role="alert" data-testid="phone-error" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    data-testid="send-otp"
                    disabled={loading}
                    className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-base transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>{t('auth.sendOtp')} <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">{t('auth.alreadyHaveAccount')}</p>
                </form>
              ) : (
                <OtpScreen
                  phone={phone}
                  config={config}
                  devOtpInitial={devOtp}
                  onBack={() => { setStep('phone'); setError(null); }}
                  onSuccess={onSuccess}
                />
              )}
            </div>
          </>
        )}

        {/* Value highlights (compact) */}
        <div className="mt-4 space-y-2" data-testid="value-highlights">
          {highlights.map(({ icon: Icon, title, sub }) => (
            <div key={title} className="flex items-start gap-2.5 px-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-700 leading-tight">{title}</p>
                <p className="text-xs text-slate-500 leading-snug">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Support */}
        {supportHref && (
          <a
            href={supportHref}
            target="_blank"
            rel="noreferrer"
            data-testid="support-link"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-700"
          >
            <HelpCircle className="w-4 h-4" />
            {t('auth.needHelp')} WhatsApp {t('common.help')}
          </a>
        )}

        {/* Trust strip */}
        <div className="mt-auto pt-6">
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {t('auth.trust1')}</span>
            <span className="flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {t('auth.trust2')}</span>
            <span className="flex items-center gap-1"><WifiOff className="w-3.5 h-3.5" /> {t('auth.trust3')}</span>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-2 leading-relaxed">{t('auth.trustNote')}</p>
        </div>
      </main>
    </div>
  );
}
