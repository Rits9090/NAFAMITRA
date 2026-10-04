import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { track, ACTIVATION } from '@/lib/analytics';
import { errMsg, API_BASE } from '@/lib/api';
import { LanguageSwitcher } from '@/pages/Login';
import { toast } from 'sonner';
import {
  Store, User, ArrowRight, MapPin, Crosshair, Sparkles, Package, PartyPopper,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'agriculture', emoji: '🌾', mr: 'कृषी सेवा / बियाणे / खते', en: 'Agriculture / Seeds / Fertilizer' },
  { value: 'kirana', emoji: '🛒', mr: 'किराणा / जनरल स्टोअर', en: 'Grocery / General Store' },
  { value: 'apparel', emoji: '👕', mr: 'कपडे / टेक्सटाईल', en: 'Clothing / Textile' },
  { value: 'electronics', emoji: '📱', mr: 'मोबाईल / इलेक्ट्रॉनिक्स', en: 'Mobile / Electronics' },
  { value: 'hardware', emoji: '🔩', mr: 'हार्डवेअर / इलेक्ट्रिकल', en: 'Hardware / Electrical' },
  { value: 'other', emoji: '📦', mr: 'इतर व्यवसाय', en: 'Other Business' },
];

function detectLocation(setLocation, setStatus) {
  if (!navigator.geolocation) {
    setStatus('unsupported');
    return;
  }
  setStatus('detecting');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        // reverse geocode when a provider is configured; otherwise keep coordinates only
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&accept-language=mr`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = await res.json();
        const addr = data.address || {};
        const place = [addr.city || addr.town || addr.village || addr.county,
          addr.state].filter(Boolean).join(', ');
        if (place) {
          setLocation(place);
          setStatus('found');
          return;
        }
      } catch { /* network/geo provider unavailable */ }
      // coordinates obtained but no readable place — manual entry stays available
      setStatus('coords_only');
    },
    () => setStatus('denied'),
    { timeout: 8000, enableHighAccuracy: false }
  );
}

export default function Onboarding() {
  const { t, lang } = useI18n();
  const { kind, identities, onboardShop, onboardCustomer, user, activeShop } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intent = params.get('intent') || 'merchant';

  const [step, setStep] = useState('choice'); // choice | shop | customer | done-shop | done-customer
  const [ownerName, setOwnerName] = useState(user?.name || '');
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [geoStatus, setGeoStatus] = useState(null);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [createdNmId, setCreatedNmId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [createdShop, setCreatedShop] = useState(null);

  // already has an identity → straight into the app
  useEffect(() => {
    if (identities && identities.kind !== 'new') {
      if (identities.shops?.length) navigate('/', { replace: true });
      else if (identities.customer_profiles?.length) navigate('/c', { replace: true });
    }
  }, [identities, navigate]);

  useEffect(() => {
    if (params.get('intent') === 'shop') setStep('shop');
    if (params.get('intent') === 'customer') setStep('customer');
  }, [params]);

  const submitShop = async (e) => {
    e.preventDefault();
    if (!ownerName.trim() || ownerName.trim().length < 2) return setError(t('customers.nameRequired'));
    if (!shopName.trim()) return setError(t('customers.nameRequired'));
    if (!category) return setError(t('onboarding.shopCategory'));
    setLoading(true);
    setError(null);
    try {
      const data = await onboardShop({
        owner_name: ownerName.trim(),
        shop_name: shopName.trim(),
        category,
        address: address.trim() || null,
        location: location.trim() || null,
      });
      setCreatedShop(data.shop);
      track(ACTIVATION.ONBOARDING_SHOP, { category });
      setStep('done-shop');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCustomer = async (e) => {
    e.preventDefault();
    if (!customerName.trim()) return setError(t('customers.nameRequired'));
    setLoading(true);
    setError(null);
    try {
      const res = await onboardCustomer({ name: customerName.trim() });
      setCreatedNmId(res?.customer?.nm_id || null);
      track(ACTIVATION.ONBOARDING_CUSTOMER, {});
      setStep('done-customer');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const catLabel = (c) => (lang === 'en' ? c.en : c.mr);

  // ---- choice ------------------------------------------------------------
  if (step === 'choice') {
    return (
      <Shell>
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-800">{t('onboarding.whatWouldYou')}</h1>
        </div>
        <div className="space-y-3">
          <button
            data-testid="choose-shop"
            onClick={() => setStep('shop')}
            className="w-full text-left rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{t('onboarding.startShop')}</p>
                <p className="text-sm text-slate-500">{t('auth.iAmShopSub')}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-emerald-600 ml-auto" />
            </div>
          </button>
          <button
            data-testid="choose-customer"
            onClick={() => setStep('customer')}
            className="w-full text-left rounded-2xl border-2 border-slate-200 bg-white p-5 active:scale-[0.99] transition-transform hover:border-emerald-300"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{t('onboarding.viewBills')}</p>
                <p className="text-sm text-slate-500">{t('auth.iAmCustomerSub')}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 ml-auto" />
            </div>
          </button>
        </div>
      </Shell>
    );
  }

  // ---- shop form ---------------------------------------------------------
  if (step === 'shop') {
    return (
      <Shell>
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-slate-800">{t('onboarding.shopFormTitle')}</h1>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">1 / 1</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('onboarding.shopFormSub')}</p>
        </div>

        <form onSubmit={submitShop} className="space-y-4" data-testid="shop-form">
          <Field label={t('onboarding.ownerName')}>
            <input
              data-testid="owner-name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder={t('onboarding.ownerNamePh')}
              autoComplete="name"
              className={inputCls}
            />
          </Field>

          <Field label={t('onboarding.shopName')}>
            <input
              data-testid="shop-name"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder={t('onboarding.shopNamePh')}
              className={inputCls}
            />
          </Field>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {t('onboarding.shopCategory')}
            </legend>
            <div className="grid grid-cols-2 gap-2" data-testid="category-grid">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  data-testid={`category-${c.value}`}
                  aria-pressed={category === c.value}
                  onClick={() => setCategory(c.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    category === c.value
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <span className="text-xl" aria-hidden="true">{c.emoji}</span>
                  <p className="text-[13px] font-semibold text-slate-700 leading-tight mt-1">{catLabel(c)}</p>
                </button>
              ))}
            </div>
          </fieldset>

          <Field label={t('onboarding.address')}>
            <input
              data-testid="address-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('onboarding.addressPh')}
              autoComplete="address-line1"
              className={inputCls}
            />
          </Field>

          <Field label={t('onboarding.location')}>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                data-testid="location-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('onboarding.locationPh')}
                className={`${inputCls} pl-10 pr-10`}
              />
            </div>
            <button
              type="button"
              onClick={() => detectLocation(setLocation, setGeoStatus)}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
            >
              <Crosshair className="w-4 h-4" />
              {geoStatus === 'detecting' ? t('onboarding.detecting') : t('onboarding.detectLocation')}
            </button>
            {geoStatus === 'denied' && (
              <p className="text-xs text-amber-600 mt-1">{t('onboarding.locationDenied')}</p>
            )}
          </Field>

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            data-testid="start-shop"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
          >
            {loading ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('onboarding.startMyShop')}
          </button>
        </form>
      </Shell>
    );
  }

  // ---- customer form -----------------------------------------------------
  if (step === 'customer') {
    return (
      <Shell>
        <div className="mb-5">
          <h1 className="text-lg font-bold text-slate-800">{t('onboarding.customerName')}</h1>
        </div>
        <form onSubmit={submitCustomer} className="space-y-4" data-testid="customer-form">
          <Field label={t('onboarding.customerName')}>
            <input
              data-testid="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t('onboarding.customerNamePh')}
              autoComplete="name"
              className={inputCls}
            />
          </Field>
          {error && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            data-testid="customer-continue"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('onboarding.continueBtn')}
          </button>
        </form>
      </Shell>
    );
  }

  // ---- success screens ---------------------------------------------------
  if (step === 'done-shop') {
    return (
      <Shell>
        <div className="text-center animate-fadeInUp" data-testid="shop-success">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <PartyPopper className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-800 mt-4">
            {t('onboarding.congrats', { name: ownerName.split(' ')[0] })}
          </h1>
          <p className="text-sm text-slate-600 mt-2 px-4">
            {t('onboarding.shopReady', { shop: shopName })}
          </p>
          <div className="mt-6 space-y-2.5">
            <button
              data-testid="first-bill"
              onClick={() => navigate('/billing')}
              className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2"
            >
              🧾 {t('onboarding.firstBill')}
            </button>
            <button
              onClick={() => navigate('/products')}
              className="w-full py-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" /> {t('onboarding.addProduct')}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center animate-fadeInUp" data-testid="customer-success">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-800 mt-4">{t('onboarding.profileReady')}</h1>
        <p className="text-sm text-slate-600 mt-2">{t('onboarding.congrats', { name: customerName.split(' ')[0] })}</p>
        {createdNmId && (
          <div className="mt-4 mx-auto max-w-xs bg-white rounded-xl border border-emerald-200 px-4 py-3" data-testid="customer-id-card">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{t('onboarding.customerId')}</p>
            <p className="text-lg font-extrabold font-mono text-emerald-700 mt-0.5">{createdNmId}</p>
            <p className="text-[10px] text-slate-400 mt-1">{t('onboarding.customerIdHint')}</p>
          </div>
        )}
        <button
          data-testid="customer-home"
          onClick={() => navigate('/c')}
          className="mt-6 w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          {t('nav.home')}
        </button>
      </div>
    </Shell>
  );
}

const inputCls = 'w-full px-4 py-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50/40">
      <header className="px-4 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-slate-800">NafaMitra</p>
            <p className="text-[10px] text-emerald-700 font-semibold">ग्राहक वाढवा, नफा वाढवा!</p>
          </div>
        </div>
        <LanguageSwitcher compact />
      </header>
      <main className="max-w-md mx-auto px-4 py-6 pb-10">{children}</main>
    </div>
  );
}
