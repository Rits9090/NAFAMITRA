import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import api, { errMsg, fetchConfig } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { QrCode, Copy, Link2, LogOut, Languages, Store, UserCircle2, Repeat2, Loader2 } from 'lucide-react';
import { LanguageSwitcher } from '@/pages/Login';

export function CustomerProfile() {
  const { t } = useI18n();
  const { user, customerProfiles, kind, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [qr, setQr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, q] = await Promise.all([
        api.get('/customer/me'),
        api.get('/customer/qr'),
      ]);
      setProfile(me.data.profiles?.[0] || null);
      setQr(q.data);
      setName(me.data.profiles?.[0]?.name || '');
    } catch (e) { toast.error(errMsg(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.put('/customer/profile', { name: name.trim() });
      toast.success(t('app.profileSaved'));
      setEditing(false);
      await refresh();
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSaving(false); }
  };

  const makeMagicLink = async () => {
    setMagicBusy(true);
    try {
      const { data } = await api.post('/customer/magic-link', { ttl_minutes: 30 });
      const url = `${window.location.origin}${data.url}`;
      if (navigator.share) {
        try { await navigator.share({ title: 'NafaMitra passbook', text: url }); } catch { /* dismissed */ }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t('app.passbookLinkMade', { minutes: data.ttl_minutes }));
      }
    } catch (e) { toast.error(errMsg(e)); }
    finally { setMagicBusy(false); }
  };

  return (
    <div className="space-y-4 animate-fadeInUp">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <span className="text-2xl font-extrabold text-emerald-700">{(profile?.name || user?.name || '?')[0].toUpperCase()}</span>
        </div>
        {!editing ? (
          <>
            <h1 className="text-lg font-extrabold text-slate-800 mt-3">{profile?.name || user?.name}</h1>
            <p className="text-xs text-slate-400 font-mono">{profile?.nm_id}</p>
            <button onClick={() => setEditing(true)}
              className="mt-2 text-xs font-semibold text-emerald-700 hover:underline">{t('app.editProfile')}</button>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditing(false)} className="py-2 rounded-xl border border-slate-200 text-sm font-semibold">{t('common.cancel')}</button>
              <button onClick={saveProfile} disabled={saving} className="py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
                {saving ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QR */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center">
        <h2 className="text-sm font-bold text-slate-700 flex items-center justify-center gap-1.5">
          <QrCode className="w-4 h-4 text-emerald-600" /> {t('app.myQr')}
        </h2>
        {qr && (
          <img src={`${api.defaults.baseURL}/customer/qr.png?token=${qr.qr_token}`} alt={t('app.myQr')}
            className="w-48 h-48 mx-auto my-3 rounded-xl border border-slate-100" />
        )}
        <p className="text-[11px] text-slate-400 leading-snug px-2">{t('app.qrHint')}</p>
      </div>

      {/* Passbook magic link */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <button onClick={makeMagicLink} disabled={magicBusy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-sm font-bold disabled:opacity-50">
          {magicBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {t('app.sharePassbookLink')}
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-2">{t('app.verifyFail')} → {t('app.loginInstead')}</p>
      </div>

      {/* Quick links — Account is the hub for everything not in the 5 tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
        {[
          { to: '/c/notifications', labelKey: 'nav.notifications', icon: '🔔' },
          { to: '/c/credit', labelKey: 'nav.credit', icon: '₹' },
          { to: '/c/loyalty', labelKey: 'nav.loyalty', icon: '🪙' },
          { to: '/c/search', labelKey: 'search.tabShops', icon: '⭐' },
        ].map(({ to, labelKey, icon }) => (
          <button key={to} onClick={() => navigate(to)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <span className="flex items-center gap-2"><span aria-hidden>{icon}</span>{t(labelKey)}</span>
            <span className="text-slate-300">›</span>
          </button>
        ))}
      </div>

      {/* language */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <Languages className="w-4 h-4 text-slate-400" /> {t('common.language')}
        </span>
        <LanguageSwitcher />
      </div>

      {kind === 'both' && (
        <button onClick={() => navigate('/')}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold">
          <Repeat2 className="w-4 h-4" /> {t('nav.myShop')}
        </button>
      )}

      <button onClick={() => { logout(); navigate('/auth'); }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-red-100 text-red-600 text-sm font-semibold">
        <LogOut className="w-4 h-4" /> {t('common.logout')}
      </button>
    </div>
  );
}

/** Magic-link entry: /c/passbook?token=… → one-time exchange for a session. */
export function PassbookEntry() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState('working');
  const token = params.get('token');

  useEffect(() => {
    if (!token) { setState('fail'); return; }
    api.post('/customer/exchange', { token })
      .then(({ data }) => {
        localStorage.setItem('nafamitra_token', data.token);
        localStorage.removeItem('nafamitra_shop');
        setState('ok');
        setTimeout(() => navigate('/c', { replace: true }), 600);
      })
      .catch(() => setState('fail'));
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
      <div>
        {state === 'working' && (
          <>
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-sm text-slate-600 mt-3">{t('app.verifyTitle')}</p>
          </>
        )}
        {state === 'ok' && <p className="text-sm font-semibold text-emerald-700">✓</p>}
        {state === 'fail' && (
          <>
            <p className="text-sm font-semibold text-slate-700">{t('app.verifyFail')}</p>
            <button onClick={() => navigate('/auth')}
              className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              {t('app.loginInstead')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
