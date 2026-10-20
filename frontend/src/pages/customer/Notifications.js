import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Loader, ShoppingBag, Gift, Clock, ClipboardList, Store, Megaphone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { dateTime } from '@/lib/dates';

const CATS = [
  { id: 'transaction', icon: ShoppingBag, labelKey: 'notif.sectionTransaction', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'benefit', icon: Gift, labelKey: 'notif.sectionBenefit', color: 'text-amber-600 bg-amber-50' },
  { id: 'reminder', icon: Clock, labelKey: 'notif.sectionReminder', color: 'text-blue-600 bg-blue-50' },
  { id: 'requirement', icon: ClipboardList, labelKey: 'notif.sectionRequirement', color: 'text-violet-600 bg-violet-50' },
  { id: 'shop', icon: Store, labelKey: 'notif.sectionShop', color: 'text-teal-600 bg-teal-50' },
  { id: 'marketing', icon: Megaphone, labelKey: 'notif.sectionMarketing', color: 'text-rose-600 bg-rose-50' },
];

const PREF_CATS = CATS.filter((c) => c.id !== 'marketing');

export default function CustomerNotifications() {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [prefs, setPrefs] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [n, p] = await Promise.all([
        api.get('/notifications', { params: filter ? { category: filter } : {} }),
        api.get('/notifications/prefs'),
      ]);
      setItems(n.data.notifications || []);
      setPrefs(p.data.prefs || {});
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read_at: new Date().toISOString() } : x)));
    try { await api.post(`/notifications/${id}/read`); } catch { /* already optimistic */ }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    try {
      await api.post('/notifications/read-all');
      toast.success(t('notif.markAllRead'));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const togglePref = async (key, value) => {
    const prev = prefs;
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      const { data } = await api.put('/notifications/prefs', { [key]: value });
      setPrefs(data.prefs);
      if (key === 'marketing_consent') toast.success(t('notif.prefsSaved'));
    } catch (e) {
      setPrefs(prev);
      toast.error(errMsg(e));
    }
  };

  const renderTitle = (n) => {
    if (n.title_key && t(n.title_key) !== n.title_key) return t(n.title_key, n.params || {});
    return n.title || t(n.title_key || 'notif.empty');
  };

  return (
    <div className="space-y-4 animate-fadeInUp" data-testid="notifications-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">{t('notifPage.title')}</h1>
          <p className="text-xs text-slate-500">{t('notifPage.sub')}</p>
        </div>
        <button onClick={markAll} className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
          <CheckCheck className="w-3.5 h-3.5" />{t('notif.markAllRead')}
        </button>
      </div>

      {/* Category filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setFilter('')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border ${!filter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>
          {t('notifPage.all')}
        </button>
        {CATS.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border ${filter === c.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-10 text-slate-400" aria-busy="true"><Loader className="w-5 h-5 animate-spin" /></div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={load} className="ml-3 font-semibold underline">{t('common.retry')}</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 text-center" data-testid="notif-empty">
          <Bell className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 mt-2">{t('notif.empty')}</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((n) => {
            const meta = CATS.find((c) => c.id === n.category) || CATS[0];
            const Icon = meta.icon;
            return (
              <button key={n.id} onClick={() => !n.read_at && markRead(n.id)}
                className={`w-full text-left bg-white rounded-xl border shadow-sm p-3.5 flex gap-3 items-start ${n.read_at ? 'border-slate-100 opacity-70' : 'border-slate-200'}`}
                data-testid="notif-item">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{renderTitle(n)}</p>
                  <p className="text-[11px] text-slate-400">
                    {t(meta.labelKey)}{n.shop_name ? ` · ${n.shop_name}` : ''} · {dateTime(n.created_at, lang)}
                  </p>
                </div>
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-emerald-500 mt-2 flex-shrink-0" aria-label={t('notif.unread', { n: '1' })} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Preferences incl. separate marketing consent */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid="notif-prefs">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">{t('notifPage.prefsTitle')}</h2>
        </div>
        <div className="space-y-2.5">
          {PREF_CATS.map((c) => (
            <label key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">{t(c.labelKey)}</span>
              <input type="checkbox" checked={prefs ? prefs[c.id] !== false : true}
                onChange={(e) => togglePref(c.id, e.target.checked)}
                className="w-4.5 h-4.5 accent-emerald-600" style={{ width: 18, height: 18 }} />
            </label>
          ))}
          <div className="border-t border-slate-100 pt-2.5">
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-700 font-bold">{t('notif.sectionMarketing')}</span>
              <input type="checkbox" checked={prefs ? !!prefs.marketing : false}
                onChange={(e) => togglePref('marketing_consent', e.target.checked)}
                className="w-4.5 h-4.5 accent-rose-500" style={{ width: 18, height: 18 }} data-testid="marketing-consent" />
            </label>
            <p className="text-[11px] text-slate-400 mt-1">{t('notif.consentNote')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
