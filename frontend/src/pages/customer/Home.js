import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { dayMonth } from '@/lib/dates';
import {
  Wallet, Store, QrCode, ChevronRight, Inbox, Receipt, Gift, ZoomIn, ZoomOut,
} from 'lucide-react';
import Modal from '@/components/Modal';

const LOCALE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

/** Date + time for bill rows — locale aware, no hard-coded format. */
function billDateTime(iso, lang) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(LOCALE[lang] || 'en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return dayMonth(iso, lang);
  }
}

/**
 * Customer home — three-block hierarchy per spec:
 *   1. Identity + QR + DhanLabh (truthful reward messaging)
 *   2. My Udhaari — the largest functional card, shop-wise, ledger-derived
 *   3. Recent digital bills — compact, openable
 * My Stores / offers sit below the priorities (or via the bottom nav).
 */
export default function CustomerHome() {
  const { t, lang } = useI18n();
  const { user, customerProfiles } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [qrZoom, setQrZoom] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, q] = await Promise.all([
        api.get('/customer/overview'),
        api.get('/customer/qr').catch(() => ({ data: null })),
      ]);
      setData(ov.data);
      setQr(q.data);
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
        <div className="h-40 bg-slate-200 rounded-2xl" />
        <div className="h-32 bg-slate-200 rounded-2xl" />
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
  const nmId = customerProfiles[0]?.nm_id || qr?.nm_id;
  const dhanlabh = data?.dhanlabh || [];
  const credit = data?.credit || [];
  const shops = data?.shops || [];
  const recent = data?.recent_bills || [];
  const totalPoints = data?.totals?.dhanlabh_points || 0;
  const totalCredit = data?.totals?.credit_paise || 0;

  // Truthful DhanLabh benefit: value from the configured conversion rule —
  // never promise a discount the balance does not support.
  const totalValue = dhanlabh.reduce((s, d) => s + (d.estimated_value_paise || 0), 0);
  const rvPaise = dhanlabh[0]?.redemption_value_paise || 0;
  const ptsPerRupee = rvPaise > 0 ? Math.round(100 / rvPaise) : 0;
  let rewardLine;
  if (totalPoints <= 0) rewardLine = t('home.rewardEmpty');
  else if (totalValue >= 100) rewardLine = t('home.rewardReady', { amount: fmt(totalValue) });
  else if (ptsPerRupee > 0) {
    const needed = ptsPerRupee - (totalPoints % ptsPerRupee);
    rewardLine = t('home.rewardProgress', { points: String(totalPoints), needed: String(needed) });
  } else rewardLine = t('home.rewardProgress', { points: String(totalPoints), needed: '10' });

  return (
    <div className="space-y-4 animate-fadeInUp">
      <h1 className="sr-only">{t('nafa.homeTitle')}</h1>

      {/* ── BLOCK 1 — Identity & DhanLabh ─────────────────────────── */}
      <section data-testid="home-identity"
        className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-lg shadow-emerald-600/20">
        <p className="text-sm text-emerald-100">{t('app.greeting', { name })}</p>
        {nmId && <p className="text-[11px] font-mono text-emerald-200 mt-0.5">{nmId}</p>}

        <div className="flex items-start justify-between mt-3 gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">🪙 {t('app.dhanlabh')}</p>
            <p className="text-4xl font-extrabold font-mono leading-none mt-1">{totalPoints}</p>
            <p className="text-[12px] text-white font-semibold mt-1.5 leading-snug" data-testid="reward-line">
              {rewardLine}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => { setQrZoom(false); setShowQr(true); }}
              data-testid="open-qr"
              className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center active:scale-95 transition-transform"
              aria-label={t('app.myQr')}
            >
              <QrCode className="w-7 h-7" />
            </button>
            <span className="text-[9px] text-emerald-200 font-semibold">{t('app.myQr')}</span>
          </div>
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

        <button onClick={() => navigate('/c/nafa')} data-testid="link-dhanlabh-history"
          className="mt-3 w-full text-center text-[11px] font-bold text-emerald-100 underline underline-offset-2">
          {t('home.dhanlabhAll')} ›
        </button>
      </section>

      {/* ── BLOCK 2 — My Udhaari (largest functional card) ─────────── */}
      <section data-testid="home-udhaar"
        className="bg-white rounded-2xl border-2 border-red-100 shadow-md p-5"
      >
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">{t('home.myUdhaar')}</h2>
            <p className="text-[10px] text-slate-400">{t('home.udhaarSub')}</p>
          </div>
        </div>

        {totalCredit > 0 ? (
          <>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('home.udhaarTotal')}</p>
                <p className="text-4xl font-extrabold font-mono text-red-600 leading-none mt-1" data-testid="udhaar-total">
                  {fmt(totalCredit)}
                </p>
              </div>
              <Link to="/c/credit" data-testid="udhaar-details"
                className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-0.5">
                {t('home.seeUdhaar')} <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <ul className="mt-3 divide-y divide-slate-50 rounded-xl border border-slate-100 overflow-hidden">
              {credit.map((c) => (
                <li key={c.shop_id} data-testid="udhaar-shop-row"
                  className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{c.shop_name}</p>
                    {c.last_activity_at && (
                      <p className="text-[10px] text-slate-400">
                        {t('home.lastEntry')}: {billDateTime(c.last_activity_at, lang)}
                      </p>
                    )}
                  </div>
                  <span className="text-lg font-extrabold font-mono text-red-600 flex-shrink-0 ml-3">
                    {fmt(c.outstanding_paise || 0)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-400 mt-2 leading-snug">{t('home.udhaarNote')}</p>
          </>
        ) : (
          <div className="mt-3 text-center py-4" data-testid="udhaar-empty">
            <p className="text-lg font-extrabold text-emerald-600">{t('home.noUdhaar')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('home.noUdhaarSub')}</p>
            <Link to="/c/credit" className="inline-block mt-3 text-xs font-bold text-emerald-700 underline">
              {t('home.seeUdhaar')} ›
            </Link>
          </div>
        )}
      </section>

      {/* ── BLOCK 3 — Recent digital bills ─────────────────────────── */}
      <section data-testid="home-bills">
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
            {recent.slice(0, 4).map((b) => (
              <li key={`${b.shop_id}-${b.id}`} data-testid="home-bill-row">
                <Link to={`/c/bills/${b.id}`}
                  className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{b.shop_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {b.invoice_number} · {billDateTime(b.created_at, lang)}
                    </p>
                    <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize ${
                      b.payment_mode === 'credit' ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                      {t(`billing.${b.payment_mode}`)}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className={`text-sm font-bold font-mono ${b.status === 'VOIDED' ? 'text-red-500 line-through' : 'text-slate-800'}`}>
                      {fmt(b.total_paise || 0)}
                    </p>
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

      {/* My Stores — below the primary priorities */}
      <section data-testid="home-stores">
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
            {shops.slice(0, 4).map((s) => (
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

      {/* QR sheet — portalled, enlarge interaction, no sensitive payload */}
      <Modal open={showQr} onClose={() => setShowQr(false)} size="xs"
        label={t('app.myQr')} panelTestId="customer-qr-modal">
        <div className="p-6 text-center">
          <p className="text-sm font-extrabold text-slate-800">NafaMitra</p>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">{customerProfiles[0]?.name || name}</p>
          <p className="text-xs font-mono text-emerald-700 font-bold">{nmId}</p>
          {qr ? (
            <button type="button" onClick={() => setQrZoom((z) => !z)}
              data-testid="qr-zoom" aria-pressed={qrZoom}
              aria-label={qrZoom ? t('home.qrShrink') : t('home.qrEnlarge')}
              className="block mx-auto my-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <img src={`${api.defaults.baseURL}/customer/qr.png?token=${qr.qr_token}`}
                alt={t('app.myQr')}
                className={`${qrZoom ? 'w-64 h-64 max-w-full' : 'w-52 h-52'} mx-auto rounded-xl border border-slate-100`} />
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                {qrZoom ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                {qrZoom ? t('home.qrShrink') : t('home.qrEnlarge')}
              </span>
            </button>
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
      </Modal>
    </div>
  );
}
