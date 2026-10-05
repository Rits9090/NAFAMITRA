import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { dayMonth } from '@/lib/dates';
import {
  Gift, Wallet, Store, Receipt, QrCode, ChevronRight, Sparkles, Inbox, Copy,
  ShoppingBasket, Coins, Lightbulb, BrainCircuit,
} from 'lucide-react';

export default function CustomerHome() {
  const { t, lang } = useI18n();
  const { user, customerProfiles, refresh } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, q, sm] = await Promise.all([
        api.get('/customer/overview'),
        api.get('/customer/qr').catch(() => ({ data: null })),
        api.get('/customer/nafa-summary').catch(() => ({ data: null })),
      ]);
      setData(ov.data);
      setQr(q.data);
      setSummary(sm.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-busy="true">
        <div className="h-24 bg-slate-200 rounded-2xl" />
        <div className="h-32 bg-slate-200 rounded-2xl" />
        <div className="h-40 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16" role="alert">
        <p className="text-sm text-slate-600">{error}</p>
        <button onClick={load} className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">{t('common.retry')}</button>
      </div>
    );
  }

  const name = customerProfiles[0]?.name || user?.name || '';
  const dhanlabh = data?.dhanlabh || [];
  const credit = data?.credit || [];
  const shops = data?.shops || [];
  const recent = data?.recent_bills || [];
  const totalPoints = data?.totals?.dhanlabh_points || 0;
  const totalCredit = data?.totals?.credit_paise || 0;

  return (
    <div className="space-y-4 animate-fadeInUp">
      <h1 className="sr-only">{t('nafa.homeTitle')}</h1>
      {/* Greeting + dhanlabh hero */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20">
        <p className="text-sm text-emerald-100">{t('app.greeting', { name })}</p>
        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">🪙 {t('app.dhanlabh')}</p>
            <p className="text-4xl font-extrabold font-mono">{totalPoints}</p>
            <p className="text-[11px] text-emerald-200 mt-0.5">{t('app.dhanlabhSub')}</p>
          </div>
          <button
            onClick={() => setShowQr(true)}
            data-testid="open-qr"
            className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center active:scale-95 transition-transform"
            aria-label={t('app.myQr')}
          >
            <QrCode className="w-7 h-7" />
          </button>
        </div>
        {dhanlabh.length > 0 && (
          <div className="mt-3 space-y-1">
            {dhanlabh.slice(0, 3).map((d) => (
              <div key={d.shop_id} className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium truncate">{d.shop_name}</span>
                <span className="text-xs font-bold font-mono">{d.points} 🪙</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Nafa quick summary — known data, honest labels (§41) */}
      <div className="grid grid-cols-3 gap-2" data-testid="nafa-strip">
        <button onClick={() => navigate('/c/nafa')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 text-left">
          <ShoppingBasket className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-extrabold font-mono text-slate-800 mt-1">{fmt(summary?.known_spending?.total_paise || 0)}</p>
          <p className="text-[10px] text-slate-400 font-semibold leading-tight">{t('home.mySpending')}</p>
        </button>
        <button onClick={() => navigate('/c/nafa')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 text-left">
          <Coins className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-extrabold font-mono text-slate-800 mt-1">{fmt(summary?.saving_progress_paise || 0)}</p>
          <p className="text-[10px] text-slate-400 font-semibold leading-tight">{t('home.mySaving')}</p>
        </button>
        <button onClick={() => navigate('/c/nafa')} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 text-left">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-extrabold font-mono text-slate-800 mt-1">
            {summary?.goals?.length ? `${summary.goals[0].percent}%` : '—'}
          </p>
          <p className="text-[10px] text-slate-400 font-semibold leading-tight">
            {summary?.goals?.length ? summary.goals[0].name : t('home.noGoal')}
          </p>
        </button>
      </div>

      {/* Nafa Insight — only when the data supports it */}
      {summary?.insight && !['no_data'].includes(summary.insight.key) && (
        <button onClick={() => navigate('/c/nafa')}
          className="w-full bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-left"
          data-testid="home-insight">
          <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-800 leading-snug">
            {summary.insight.key === 'first_period' && t('nafa.insightFirst')}
            {summary.insight.key === 'top_category' && t('nafa.insightTop', {
              cat: summary.insight.category,
              amount: fmt(summary.insight.paise || 0),
            })}
            {summary.insight.key === 'category_trend' && t(summary.insight.delta_paise >= 0 ? 'nafa.insightUp' : 'nafa.insightDown', {
              cat: summary.insight.category,
              amount: fmt(Math.abs(summary.insight.delta_paise || 0)),
            })}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-amber-400 ml-auto flex-shrink-0" />
        </button>
      )}

      {/* Ask Nafa Brain */}
      <button onClick={() => navigate('/c/brain')}
        className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3.5 flex items-center justify-between shadow-md shadow-emerald-600/20"
        data-testid="home-brain-cta">
        <span className="flex items-center gap-2 text-sm font-bold">
          <BrainCircuit className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} /> {t('brain.askTitle')}
        </span>
        <ChevronRight className="w-4 h-4 text-emerald-100" />
      </button>

      {/* Credit strip */}
      <Link to="/c/credit" className="block bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between hover:border-red-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
            <Wallet className="w-4.5 h-4.5 text-red-500" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">{t('app.myCredit')}</p>
            <p className="text-[11px] text-slate-400">{t('app.creditSub')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-base font-extrabold font-mono ${totalCredit > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(totalCredit)}</p>
          <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
        </div>
      </Link>

      {/* My shops */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700">{t('app.myShops')}</h2>
          <button onClick={() => navigate('/c/stores')} data-testid="link-my-stores"
            className="text-xs font-semibold text-emerald-700 hover:underline">{t('stores.title')} ›</button>
        </div>
        {shops.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 py-6 text-center">
            <Store className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-600 mt-2">{t('app.noShops')}</p>
            <p className="text-xs text-slate-400 px-6">{t('app.noShopsSub')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {shops.map((s) => (
              <div key={s.shop_id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-1.5">
                  <Store className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-sm font-bold text-slate-700 truncate">{s.shop_name}</p>
                <p className="text-[11px] text-slate-400">{t('app.shopsBills', { count: s.purchase_count })}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent bills */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700">{t('app.recentBills')}</h2>
          <Link to="/c/bills" className="text-xs font-semibold text-emerald-700 hover:underline">{t('common.viewAll')}</Link>
        </div>
        {recent.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 py-6 text-center">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-600 mt-2">{t('app.noBills')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((b) => (
              <li key={`${b.shop_id}-${b.id}`}>
                <Link to={`/c/bills/${b.id}`}
                  className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{b.shop_name}</p>
                    <p className="text-[11px] text-slate-400">{b.invoice_number} · {b.created_at ? dayMonth(b.created_at, lang) : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono text-slate-800">{fmt(b.total_paise || 0)}</p>
                    {b.loyalty_earned_points > 0 && (
                      <p className="text-[11px] text-amber-600 font-semibold">+{b.loyalty_earned_points} 🪙</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* QR sheet */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowQr(false)} aria-hidden="true" />
          <div className="relative bg-white w-full sm:max-w-xs rounded-t-2xl sm:rounded-2xl p-6 text-center animate-fadeInUp" role="dialog" aria-label={t('app.myQr')}>
            <p className="text-sm font-extrabold text-slate-800">NafaMitra</p>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">{customerProfiles[0]?.name || name}</p>
            <p className="text-xs font-mono text-emerald-700 font-bold">{customerProfiles[0]?.nm_id || qr?.nm_id}</p>
            {qr ? (
              <img src={`${api.defaults.baseURL}/customer/qr.png?token=${qr.qr_token}`}
                alt={t('app.myQr')} className="w-52 h-52 mx-auto my-3 rounded-xl border border-slate-100" />
            ) : (
              <div className="w-52 h-52 mx-auto my-3 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                <QrCode className="w-10 h-10" />
              </div>
            )}
            <p className="text-[11px] text-slate-400 leading-snug px-2">{t('app.qrHint')}</p>
            <button onClick={() => setShowQr(false)}
              className="mt-4 w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
