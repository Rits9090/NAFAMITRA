import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search as SearchIcon, Plus, Trash2, Heart, Store, Mic, Loader, ClipboardList, CheckCircle2, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { dictate, isDictationSupported } from '@/lib/voiceInput';

const STATUS_META = {
  open: { labelKey: 'search.stOpen', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  matched: { labelKey: 'search.stMatched', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  fulfilled: { labelKey: 'search.stFulfilled', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { labelKey: 'search.stCancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function CustomerSearch() {
  const { t } = useI18n();
  const [tab, setTab] = useState('want'); // want | requirements | shops
  const [reqs, setReqs] = useState([]);
  const [shops, setShops] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dictating, setDictating] = useState(false);

  const [title, setTitle] = useState('');
  const [items, setItems] = useState([{ name: '', qty: 1 }]);
  const [budget, setBudget] = useState('');
  const [targetShop, setTargetShop] = useState('');
  const titleRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, o, f] = await Promise.all([
        api.get('/requirements'),
        api.get('/customer/overview').catch(() => ({ data: { shops: [] } })),
        api.get('/favorites').catch(() => ({ data: { favorites: [] } })),
      ]);
      setReqs(r.data.requirements || []);
      setShops(o.data.shops || []);
      setFavorites((f.data.favorites || []).map((x) => x.shop_id));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setItem = (i, patch) => setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    const cleanItems = items.filter((x) => x.name.trim());
    if (!title.trim() && cleanItems.length === 0) {
      toast.error(t('search.needTitle'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim() || cleanItems[0].name.trim(),
        items: cleanItems.map((x) => ({ name: x.name.trim(), qty: Math.max(1, parseInt(x.qty, 10) || 1), unit: 'unit' })),
        source: 'manual',
      };
      if (budget && Number(budget) > 0) payload.budget_paise = Math.round(Number(budget) * 100);
      if (targetShop) payload.shop_id = targetShop;
      await api.post('/requirements', payload);
      toast.success(t('search.created'));
      setTitle('');
      setItems([{ name: '', qty: 1 }]);
      setBudget('');
      setTargetShop('');
      setTab('requirements');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReq = async (id) => {
    try {
      await api.patch(`/requirements/${id}`, { status: 'cancelled' });
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const toggleFavorite = async (shopId) => {
    const isFav = favorites.includes(shopId);
    setFavorites((prev) => (isFav ? prev.filter((s) => s !== shopId) : [...prev, shopId]));
    try {
      if (isFav) await api.delete(`/favorites/${shopId}`);
      else await api.post('/favorites', { shop_id: shopId });
    } catch (e) {
      toast.error(errMsg(e));
      setFavorites((prev) => (isFav ? [...prev, shopId] : prev.filter((s) => s !== shopId)));
    }
  };

  const handleDictate = async () => {
    if (!isDictationSupported()) {
      toast(t('search.voiceUnsupported'));
      return;
    }
    setDictating(true);
    try {
      const text = await dictate({ lang: 'mr-IN' });
      if (text) setTitle((prev) => (prev ? `${prev} ${text}` : text));
    } catch {
      toast(t('search.voiceFailed'));
    } finally {
      setDictating(false);
    }
  };

  const tabs = [
    { id: 'want', label: t('search.tabWant'), icon: SearchIcon },
    { id: 'requirements', label: t('search.tabReqs'), icon: ClipboardList },
    { id: 'shops', label: t('search.tabShops'), icon: Store },
  ];

  return (
    <div className="space-y-4 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">{t('search.title')}</h1>
        <p className="text-xs text-slate-500">{t('search.sub')}</p>
      </div>

      <div className="flex gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition ${tab === id ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-slate-400" aria-busy="true">
          <Loader className="w-5 h-5 animate-spin" />
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={load} className="ml-3 font-semibold underline">{t('common.retry')}</button>
        </div>
      )}

      {!loading && !error && tab === 'want' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3" data-testid="req-composer">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">{t('search.composerTitle')}</h2>
            <button onClick={handleDictate} disabled={dictating}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-violet-50 text-violet-600 border border-violet-200 disabled:opacity-60"
              title={t('search.voiceHint')}>
              {dictating ? <Loader className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
              {dictating ? t('search.voiceListening') : t('search.voiceDictation')}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">{t('search.voiceNote')}</p>

          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="req-title">{t('search.whatLabel')}</label>
            <input id="req-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t('search.whatPlaceholder')} maxLength={160}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500">{t('search.itemsLabel')}</label>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })}
                  placeholder={t('search.itemPlaceholder')} maxLength={120}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                <input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })}
                  className="w-16 px-2 py-2 rounded-xl border border-slate-200 text-sm text-center" aria-label={t('search.qtyLabel')} />
                {items.length > 1 && (
                  <button onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-500" aria-label={t('common.delete')}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setItems((prev) => [...prev, { name: '', qty: 1 }])}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <Plus className="w-3.5 h-3.5" />{t('search.addItem')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500" htmlFor="req-budget">{t('search.budgetLabel')}</label>
              <input id="req-budget" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)}
                placeholder="₹" className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500" htmlFor="req-shop">{t('search.targetLabel')}</label>
              <select id="req-shop" value={targetShop} onChange={(e) => setTargetShop(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                <option value="">{t('search.allLinkedShops')}</option>
                {shops.map((s) => <option key={s.shop_id} value={s.shop_id}>{s.shop_name || s.name}</option>)}
              </select>
            </div>
          </div>

          <button onClick={submit} disabled={submitting} data-testid="req-submit"
            className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60">
            {submitting ? t('common.loading') : t('search.submit')}
          </button>
          <p className="text-[11px] text-slate-400 text-center">{t('search.privacyNote')}</p>
        </div>
      )}

      {!loading && !error && tab === 'requirements' && (
        <div className="space-y-3">
          {reqs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 text-center" data-testid="req-empty">
              <PackageOpen className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600 mt-2">{t('search.emptyTitle')}</p>
              <p className="text-xs text-slate-400 px-8">{t('search.emptySub')}</p>
            </div>
          ) : reqs.map((r) => {
            const meta = STATUS_META[r.status] || STATUS_META.open;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid="req-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{r.title}</p>
                    <p className="text-[11px] text-slate-400">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>{t(meta.labelKey)}</span>
                </div>
                {r.items?.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {r.items.map((it, i) => (
                      <li key={i} className="text-xs text-slate-600">• {it.name} × {it.qty}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-emerald-700">
                    {r.budget_paise ? `${t('search.budgetLabel')} ${fmt(r.budget_paise)}` : ''}
                    {r.shop_name ? ` · ${r.shop_name}` : ''}
                  </p>
                  {r.status === 'open' && (
                    <button onClick={() => cancelReq(r.id)} className="text-xs font-semibold text-slate-400 hover:text-red-500">
                      {t('search.cancel')}
                    </button>
                  )}
                </div>
                {r.status === 'matched' && (
                  <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
                    <p className="text-[11px] text-amber-800">{t('search.matchedNote')}{r.retailer_notes ? ` — ${r.retailer_notes}` : ''}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && tab === 'shops' && (
        <div className="space-y-3">
          {shops.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 text-center">
              <Store className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600 mt-2">{t('search.noShopsTitle')}</p>
            </div>
          ) : shops.map((s) => {
            const isFav = favorites.includes(s.shop_id);
            return (
              <div key={s.shop_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between"
                data-testid="shop-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Store className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{s.shop_name || s.name}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{[s.category, s.city || s.location].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <button onClick={() => toggleFavorite(s.shop_id)} aria-pressed={isFav}
                  aria-label={isFav ? t('search.unfavorite') : t('search.favorite')}
                  className={`p-2.5 rounded-xl border transition ${isFav ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                  <Heart className={`w-4.5 h-4.5 ${isFav ? 'text-rose-500 fill-rose-500' : 'text-slate-400'}`} style={{ width: 18, height: 18 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
