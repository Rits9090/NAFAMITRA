import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { SUPPORT_WHATSAPP, APP_VERSION } from '@/lib/config';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Settings as SettingsIcon, Store, Save, Heart, Languages, Info, MessageCircle } from 'lucide-react';
import { LanguageSwitcher } from '@/pages/Login';

export default function Settings() {
  const { t } = useI18n();
  const { activeShop, refresh } = useAuth();
  const [form, setForm] = useState({ name: '', category: '', address: '', phone: '' });
  const [rules, setRules] = useState({ points_per_100: 1, redemption_value: 0.1 });
  const [saving, setSaving] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [preventBelowMin, setPreventBelowMin] = useState(false);

  useEffect(() => {
    if (activeShop) {
      setForm({
        name: activeShop.name || '',
        category: activeShop.category || '',
        address: activeShop.address || activeShop.location_address || '',
        phone: activeShop.phone || activeShop.owner_phone || '',
      });
      const s = activeShop.settings;
      if (s) {
        setRules({
          points_per_100: s.loyalty_points_per_100 ?? 1,
          redemption_value: (s.redemption_value_paise ?? 10) / 100,
        });
        setPreventBelowMin(!!s.prevent_below_min);
      }
    }
  }, [activeShop]);

  const saveShop = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/auth/business', form);
      await refresh();
      toast.success(t('settings.shopSaved'));
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async (e) => {
    e.preventDefault();
    setSavingRules(true);
    try {
      await api.put('/loyalty/rules', {
        points_per_100: parseInt(rules.points_per_100, 10) || 0,
        redemption_value: parseFloat(rules.redemption_value) || 0,
      });
      await refresh();
      toast.success(t('loyalty.rulesSaved'));
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingRules(false);
    }
  };

  const toggleProfitProtection = async () => {
    setSavingSwitch(true);
    const next = !preventBelowMin;
    try {
      await api.put('/auth/shop/settings', { prevent_below_min: next });
      setPreventBelowMin(next);
      await refresh();
      toast.success(t('settings.shopSaved'));
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingSwitch(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeInUp max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('nav.settings')}</h1>
        <p className="text-slate-500 text-sm">{t('settings.sub')}</p>
      </div>

      {/* Shop profile */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50 bg-slate-50">
          <Store className="text-emerald-600" style={{ width: 18, height: 18 }} />
          <h3 className="font-bold text-slate-700" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('settings.shopProfile')}</h3>
        </div>
        <form onSubmit={saveShop} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="set-shop-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('onboarding.shopName')} *</label>
              <input id="set-shop-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label htmlFor="set-cat" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('onboarding.shopCategory')}</label>
              <input id="set-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label htmlFor="set-phone" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('common.phone')}</label>
              <input id="set-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="set-addr" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('common.address')}</label>
              <input id="set-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save')}
          </button>
        </form>
      </div>

      {/* Loyalty rules (short form; full management on Loyalty page) */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50 bg-violet-50">
          <Heart className="text-violet-600" style={{ width: 18, height: 18 }} />
          <h3 className="font-bold text-slate-700" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('loyalty.title')}</h3>
        </div>
        <form onSubmit={saveRules} className="p-5 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-pp100" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('loyalty.pointsPer100')}</label>
            <input id="set-pp100" inputMode="numeric" value={rules.points_per_100}
              onChange={(e) => setRules({ ...rules, points_per_100: e.target.value.replace(/\D/g, '') })}
              className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div>
            <label htmlFor="set-rv" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('loyalty.redemptionValue')}</label>
            <input id="set-rv" inputMode="decimal" value={rules.redemption_value}
              onChange={(e) => setRules({ ...rules, redemption_value: e.target.value.replace(/[^\d.]/g, '') })}
              className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <button type="submit" disabled={savingRules}
            className="col-span-2 flex items-center justify-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-60">
            {savingRules ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {t('loyalty.saveRules')}
          </button>
        </form>
      </div>

      {/* Language */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <Languages className="text-slate-400" style={{ width: 18, height: 18 }} /> {t('common.language')}
        </span>
        <LanguageSwitcher />
      </div>

      {/* Profit protection */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">{t('settings.profitProtect')}</p>
          <p className="text-xs text-slate-400 leading-snug">{t('settings.profitProtectSub')}</p>
        </div>
        <button
          role="switch"
          aria-checked={preventBelowMin}
          aria-label={t('settings.profitProtect')}
          data-testid="profit-protection-toggle"
          disabled={savingSwitch}
          onClick={toggleProfitProtection}
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${
            preventBelowMin ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
            preventBelowMin ? 'left-5.5' : 'left-0.5'}`}
            style={{ left: preventBelowMin ? '22px' : '2px' }} />
        </button>
      </div>

      {/* App info — honest, no fake plans */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-5">
        <p className="font-bold text-emerald-800 flex items-center gap-1.5" style={{ fontFamily: 'Outfit,sans-serif' }}>
          <Info style={{ width: 16, height: 16 }} /> NafaMitra · {APP_VERSION}
        </p>
        <p className="text-sm text-emerald-700 mt-0.5">{t('brand.tagline')}</p>
        <p className="text-xs text-emerald-600 mt-2">{t('settings.honest')}</p>
        {SUPPORT_WHATSAPP && (
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-emerald-800 bg-white/70 px-3 py-1.5 rounded-lg border border-emerald-200">
            <MessageCircle style={{ width: 14, height: 14 }} /> {t('settings.contactSupport')}
          </a>
        )}
      </div>
    </div>
  );
}
