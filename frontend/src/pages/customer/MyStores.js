import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Store, Plus, Trash2, Loader, ShieldCheck, UserCheck, ChevronLeft,
  Phone, Receipt, Gift, CalendarDays, Link2, PartyPopper, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { shortDate } from '@/lib/dates';

const CATEGORIES = [
  { value: 'grocery', emoji: '🛒' },
  { value: 'clothing', emoji: '👕' },
  { value: 'food', emoji: '🍽️' },
  { value: 'medical', emoji: '💊' },
  { value: 'agriculture', emoji: '🌾' },
  { value: 'other', emoji: '📦' },
];
const CAT_LABEL = {
  grocery: 'search.catGrocery', clothing: 'search.catClothing',
  food: 'search.catFood', medical: 'search.catMedical',
  agriculture: 'search.catAgri', other: 'search.catOther',
};

function useStores() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/mystores');
      setData(r.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

function ActivationBanner({ activation, t }) {
  if (!activation) return null;
  const { count, target, qualified, claimed, entitlements = [] } = activation;
  const active = entitlements.find((e) => e.code === 'premium_stores5_30d');
  if (active) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3" data-testid="premium-active">
        <PartyPopper className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-extrabold text-amber-800">{t('stores.premiumActive')}</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {t('stores.premiumUntil', { date: shortDate(active.expires_at) })}
          </p>
          <p className="text-[10px] text-amber-600 mt-1">{t('stores.premiumSource')}</p>
        </div>
      </div>
    );
  }
  if (claimed) return null;
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4" data-testid="activation-progress">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-emerald-800">{t('stores.activationTitle')}</p>
        <span className="text-xs font-extrabold font-mono text-emerald-700">{Math.min(count, target)}/{target}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-emerald-100 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all"
          style={{ width: `${Math.min(100, (count / target) * 100)}%` }} />
      </div>
      {qualified ? (
        <p className="text-xs font-bold text-amber-700 mt-1.5">{t('stores.qualifiedClaiming')}</p>
      ) : (
        <p className="text-[11px] text-emerald-700 mt-1.5">{t('stores.activationSub', { n: String(target - count) })}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- detail view */
function StoreDetail({ storeId, onBack, onChanged, t }) {
  const { data, loading, error, reload } = useStores();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  if (loading) {
    return <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }
  if (error) {
    return (
      <div className="text-center py-16" role="alert">
        <p className="text-sm text-slate-600">{error}</p>
        <button onClick={reload} className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">{t('common.retry')}</button>
      </div>
    );
  }
  const store = (data?.stores || []).find((s) => s.id === storeId);
  if (!store) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-slate-500">{t('stores.notFound')}</p>
        <button onClick={onBack} className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">{t('common.back')}</button>
      </div>
    );
  }
  const v = store.verified;
  const connected = store.state === 'connected' && v;

  const remove = async () => {
    try {
      await api.delete(`/mystores/${store.id}`);
      toast.success(t('stores.removed'));
      onChanged();
      onBack();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-4 animate-fadeInUp" data-testid="store-detail">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="w-4 h-4" /> {t('stores.title')}
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">{store.name}</h1>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              {store.category && <span>{t(CAT_LABEL[store.category] || 'search.catOther')}</span>}
              {store.phone && <><span>·</span><Phone className="w-3 h-3" /> <span className="font-mono">{store.phone}</span></>}
            </p>
          </div>
          <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${
            connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            {connected ? t('stores.stateConnected') : t('stores.stateAdded')}
          </span>
        </div>

        {connected ? (
          <div className="mt-4 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3.5" data-testid="verified-block">
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('stores.verifiedHead')}
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <div>
                <p className="text-[10px] text-slate-500 font-semibold">{t('stores.totalPurchase')}</p>
                <p className="text-base font-extrabold font-mono text-slate-800">{fmt(v.total_spend_paise || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold">{t('stores.bills')}</p>
                <p className="text-base font-extrabold font-mono text-slate-800">{v.purchase_count || 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold">{t('stores.discountReceived')}</p>
                <p className="text-base font-extrabold font-mono text-slate-800">{fmt(v.discount_paise || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold">🪙 {t('stores.dhanlabhBalance')}</p>
                <p className="text-base font-extrabold font-mono text-amber-600">{v.dhanlabh_points || 0}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {t('stores.lastPurchase')}: {v.last_purchase_at ? shortDate(v.last_purchase_at) : '—'}
            </p>
            <p className="text-[10px] text-emerald-600 mt-1">{t('stores.sourceVerified')}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> {t('stores.manualHead')}
            </p>
            {store.purchase_amount_paise > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-slate-500 font-semibold">{t('stores.recentPurchase')}</p>
                <p className="text-base font-extrabold font-mono text-slate-800">{fmt(store.purchase_amount_paise)}</p>
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-1.5">{t('stores.sourceAdded')}</p>
          </div>
        )}
        {store.notes && <p className="text-xs text-slate-500 mt-2">“{store.notes}”</p>}
      </div>

      {connected && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-bold text-slate-700 mb-1">{t('stores.thisStoreData')}</p>
          <p className="text-[11px] text-slate-400 leading-snug">{t('stores.thisStoreDataSub')}</p>
        </div>
      )}

      <button
        onClick={() => { if (confirmDisconnect) remove(); else setConfirmDisconnect(true); }}
        data-testid="delete-store"
        className={`w-full py-3 rounded-xl border text-sm font-semibold transition-colors ${
          confirmDisconnect ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-red-100 text-red-600'
        }`}
      >
        <Trash2 className="w-4 h-4 inline mr-1.5" />
        {confirmDisconnect ? t('stores.confirmRemove') : t('stores.removeStore')}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- list view */
export default function MyStores() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const { data, loading, error, reload } = useStores();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', category: '', amount: '', date: '', notes: '' });
  const [formErr, setFormErr] = useState(null);
  const [connecting, setConnecting] = useState(null); // store id pending confirm

  if (params.storeId) {
    return <StoreDetail storeId={params.storeId} onBack={() => navigate('/c/stores')}
      onChanged={reload} t={t} />;
  }

  const stores = data?.stores || [];

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setFormErr(t('stores.nameRequired'));
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      const payload = { name: form.name.trim() };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.category) payload.category = form.category;
      if (form.amount && Number(form.amount) >= 0) payload.purchase_amount_paise = Math.round(Number(form.amount) * 100);
      if (form.date) payload.purchase_date = form.date;
      if (form.notes.trim()) payload.notes = form.notes.trim();
      await api.post('/mystores', payload);
      toast.success(t('stores.added'));
      setForm({ name: '', phone: '', category: '', amount: '', date: '', notes: '' });
      setShowAdd(false);
      reload();
    } catch (err) {
      setFormErr(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const connect = async (store, shopId) => {
    try {
      await api.post(`/mystores/${store.id}/connect`, { shop_id: shopId, confirm: true });
      toast.success(t('stores.connected', { name: store.name }));
      setConnecting(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const input = 'w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

  return (
    <div className="space-y-4 animate-fadeInUp" data-testid="my-stores">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">{t('stores.title')}</h1>
          <p className="text-xs text-slate-500">{t('stores.sub')}</p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          data-testid="add-store-btn"
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
        >
          <Plus className="w-4 h-4" /> {t('stores.add')}
        </button>
      </div>

      <ActivationBanner activation={data?.activation} t={t} />

      {showAdd && (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 space-y-3" data-testid="add-store-form">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="store-name">{t('stores.fieldName')}</label>
            <input id="store-name" data-testid="store-name" className={input} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('stores.fieldNamePh')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="store-phone">{t('stores.fieldPhone')}</label>
              <input id="store-phone" data-testid="store-phone" className={`${input} font-mono`} type="tel" inputMode="tel"
                maxLength={10} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                placeholder={t('stores.fieldPhonePh')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="store-category">{t('stores.fieldCategory')}</label>
              <select id="store-category" className={input} value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">{t('stores.chooseOptional')}</option>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {t(CAT_LABEL[c.value])}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="store-amount">{t('stores.fieldAmount')}</label>
              <input id="store-amount" data-testid="store-amount" className={input} type="number" min="0" step="0.01"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="₹" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="store-date">{t('stores.fieldDate')}</label>
              <input id="store-date" className={`${input} font-mono`} type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="store-notes">{t('stores.fieldNotes')}</label>
            <input id="store-notes" className={input} value={form.notes} maxLength={200}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t('stores.fieldNotesPh')} />
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">{t('stores.manualNotice')}</p>
          {formErr && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formErr}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShowAdd(false)}
              className="py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">{t('common.cancel')}</button>
            <button type="submit" data-testid="store-save" disabled={saving}
              className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12" aria-busy="true"><Loader className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : error ? (
        <div className="text-center py-12" role="alert">
          <p className="text-sm text-slate-600">{error}</p>
          <button onClick={reload} className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">{t('common.retry')}</button>
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 text-center" data-testid="stores-empty">
          <Store className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-600 mt-3">{t('stores.emptyTitle')}</p>
          <p className="text-xs text-slate-400 px-8 mt-1 leading-snug">{t('stores.emptySub')}</p>
          <button onClick={() => setShowAdd(true)}
            className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">{t('stores.addFirst')}</button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="stores-list">
          {stores.map((s) => {
            const conn = s.state === 'connected' && s.verified;
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid={`store-${s.id}`}>
                <button onClick={() => navigate(`/c/stores/${s.id}`)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-800 truncate flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-emerald-600 flex-shrink-0" /> {s.name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {t(CAT_LABEL[s.category] || 'search.catOther')}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                      conn ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                           : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {conn ? t('stores.stateConnected') : t('stores.stateAdded')}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {conn ? (
                      <>
                        <div>
                          <p className="text-[9px] text-slate-400 font-semibold uppercase">{t('stores.totalPurchase')}</p>
                          <p className="text-[13px] font-extrabold font-mono text-slate-800">{fmt(s.verified.total_spend_paise || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-semibold uppercase">{t('stores.bills')}</p>
                          <p className="text-[13px] font-extrabold font-mono text-slate-800">{s.verified.purchase_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-semibold uppercase">🪙 {t('stores.dhanlabhShort')}</p>
                          <p className="text-[13px] font-extrabold font-mono text-amber-600">{s.verified.dhanlabh_points || 0}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-2">
                          <p className="text-[9px] text-slate-400 font-semibold uppercase">{t('stores.recentPurchase')}</p>
                          <p className="text-[13px] font-extrabold font-mono text-slate-800">{fmt(s.purchase_amount_paise || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-semibold uppercase">{t('stores.sourceShort')}</p>
                          <p className="text-[10px] font-semibold text-slate-500">{t('stores.addedByYou')}</p>
                        </div>
                      </>
                    )}
                  </div>
                </button>

                {s.suggested_shop_id && !conn && (
                  <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 flex items-center justify-between gap-2" data-testid="partner-suggestion">
                    <p className="text-[11px] text-emerald-800 font-semibold leading-tight">
                      <Link2 className="w-3 h-3 inline" /> {t('stores.partnerFound', { name: s.suggested_shop_name })}
                    </p>
                    {connecting === s.id ? (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => connect(s, s.suggested_shop_id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                          data-testid="confirm-connect">{t('stores.connectYes')}</button>
                        <button onClick={() => setConnecting(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold">
                          {t('common.no')}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConnecting(s.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex-shrink-0"
                        data-testid="connect-store">
                        {t('stores.connect')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400 leading-relaxed">{t('stores.privacyNote')}</p>
      </div>
    </div>
  );
}
