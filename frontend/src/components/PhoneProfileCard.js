/**
 * Mobile-number card — optional PROFILE information for the signed-in user.
 *
 * No OTP, no verification claim: the number is stored on the existing app
 * profile (`phone` / `phone_normalized`, canonical 10-digit Indian form) via
 * the ownership-checked PUT /auth/profile endpoint. Users may set, change or
 * remove it at any time.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import api, { errMsg } from '@/lib/api';
import { normalizePhoneInput } from '@/lib/authActions';

export default function PhoneProfileCard() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const current = user?.phone || '';
  useEffect(() => { setValue(current ? current.replace(/(\d{5})(\d{5})/, '$1 $2') : ''); }, [current]);

  const save = async (next) => {
    setError(null); setInfo(null);
    const trimmed = String(next || '').trim();
    let payload;
    if (!trimmed) payload = { phone_number: '' };
    else {
      const norm = normalizePhoneInput(trimmed);
      if (!norm) { setError(t('auth.invalidPhone')); return; }
      payload = { phone_number: norm };
    }
    setBusy(true);
    try {
      await api.put('/auth/profile', payload);
      await refresh();
      setInfo(payload.phone_number ? 'auth.mobileSaved' : 'auth.mobileRemoved');
    } catch (e) {
      const key = errMsg(e);
      setError(typeof key === 'string' && key.startsWith('err.') ? t(key) : errMsg(e, t('auth.errGeneric')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3"
      data-testid="mobile-profile-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            {t('auth.mobileCardTitle')}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{t('auth.mobileCardSub')}</p>
        </div>
        {current && (
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg flex-shrink-0">
            {current.replace(/(\d{5})(\d{5})/, '$1 $2')}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="tel" inputMode="tel" value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); setInfo(null); }}
          placeholder={t('auth.phonePh')} data-testid="mobile-profile-input"
          aria-label={t('auth.mobileCardTitle')} disabled={busy}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 text-sm
            focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
        />
        <button
          type="button" data-testid="mobile-profile-save" disabled={busy}
          onClick={() => save(value)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold
            hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('auth.saveMobile')}
        </button>
        {current && (
          <button
            type="button" data-testid="mobile-profile-remove" disabled={busy}
            onClick={() => save('')}
            aria-label={t('auth.removeMobile')} title={t('auth.removeMobile')}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-500
              hover:text-red-600 hover:border-red-200 disabled:opacity-60">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && <p role="alert" data-testid="mobile-profile-error" className="text-xs text-red-600">{error}</p>}
      {info && (
        <p role="status" data-testid="mobile-profile-info" className="text-xs text-emerald-700 font-semibold">
          {t(info)}
        </p>
      )}
      <p className="text-[11px] text-slate-400 flex items-start gap-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-px" />
        {t('auth.phoneNoOtp')}
      </p>
    </div>
  );
}
