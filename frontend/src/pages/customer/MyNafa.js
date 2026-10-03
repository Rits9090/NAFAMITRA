import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Gift, Receipt, TrendingUp, TrendingDown, Minus, Wallet, Info, Loader } from 'lucide-react';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { computeSavings, comparePeriods, loyaltyLedgerTotals } from '@/lib/savings';

export default function MyNafa() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loyalty, setLoyalty] = useState({ accounts: [] });
  const [bills, setBills] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, lo, bi] = await Promise.all([
        api.get('/customer/overview'),
        api.get('/customer/loyalty').catch(() => ({ data: { accounts: [] } })),
        api.get('/customer/bills?limit=100').catch(() => ({ data: { bills: [] } })),
      ]);
      setOverview(ov.data);
      setLoyalty(lo.data);
      setBills(bi.data.bills || bi.data.invoices || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400" aria-busy="true">
        <Loader className="w-6 h-6 animate-spin" />
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

  const dhanlabh = overview?.dhanlabh || [];
  const credit = overview?.credit || [];
  const accounts = loyalty?.accounts || [];
  const pointsBalance = dhanlabh.reduce((s, d) => s + (d.points || 0), 0);
  const redemptionPaise = dhanlabh.length
    ? Math.round(dhanlabh.reduce((s, d) => s + (d.redemption_value_paise || 0), 0) / dhanlabh.length)
    : (accounts[0]?.redemption_value_paise ?? 0);

  // loyalty txs may live on accounts or a transactions list — collect what we have
  const loyaltyTxs = accounts.flatMap((a) => a.transactions || a.recent || []);
  const savings = computeSavings({
    bills,
    loyaltyTxs: loyaltyTxs.length ? loyaltyTxs : [],
    redemptionValuePaise: redemptionPaise,
    pointsBalance,
    dhanlabhPer10: 10,
  });
  const ledgerTotals = loyaltyLedgerTotals(loyaltyTxs);
  const compare = comparePeriods(bills);
  const creditOutstanding = credit.reduce((s, c) => s + (c.outstanding_paise || 0), 0);

  return (
    <div className="space-y-4 animate-fadeInUp" data-testid="my-nafa">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">{t('nafa.title')}</h1>
        <p className="text-xs text-slate-500">{t('nafa.sub')}</p>
      </div>

      {/* Savings dashboard — every number labelled with its source */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20" data-testid="savings-card">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-emerald-100" />
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-100">{t('nafa.savingsTitle')}</p>
        </div>
        <p className="text-3xl font-extrabold font-mono mt-1">{fmt(savings.totalSavingsPaise)}</p>
        <p className="text-[11px] text-emerald-200 mt-0.5">{t('nafa.savingsSub')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-[10px] text-emerald-100 font-semibold">{t('nafa.discountReceived')}</p>
            <p className="text-sm font-bold font-mono">{fmt(savings.discountReceivedPaise)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-[10px] text-emerald-100 font-semibold">{t('nafa.loyaltyEarned')}</p>
            <p className="text-sm font-bold font-mono">{fmt(savings.loyaltyEarnedValuePaise)}</p>
          </div>
        </div>
        <div className="mt-2 bg-white/10 rounded-xl px-3 py-2 flex items-center justify-between">
          <p className="text-[10px] text-emerald-100 font-semibold">🪙 {t('nafa.dhanlabhEligible')}</p>
          <p className="text-sm font-bold font-mono">{fmt(savings.dhanlabhEligiblePaise)}</p>
        </div>
        {!savings.hasEnoughData && (
          <p className="text-[11px] text-emerald-100 mt-2 flex items-center gap-1">
            <Info className="w-3 h-3" />
            {t('nafa.notEnoughData', { n: String(savings.minBills) })}
          </p>
        )}
      </div>

      {/* Period comparison — guarded */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid="spend-compare">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">{t('nafa.spendTitle')}</h2>
        </div>
        {!compare.enoughData ? (
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500 font-semibold">{t('nafa.notEnoughCompare', { n: String(compare.minBills) })}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-emerald-600 uppercase">{t('nafa.last30')}</p>
              <p className="text-lg font-extrabold font-mono text-emerald-700">{fmt(compare.currentPaise)}</p>
              <p className="text-[10px] text-emerald-600">{t('nafa.billsCount', { n: String(compare.currentCount) })}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase">{t('nafa.prev30')}</p>
              <p className="text-lg font-extrabold font-mono text-slate-600">{fmt(compare.previousPaise)}</p>
              <p className="text-[10px] text-slate-400">{t('nafa.billsCount', { n: String(compare.previousCount) })}</p>
            </div>
            <div className="col-span-2 flex items-center justify-center gap-1.5 text-xs font-bold">
              {compare.deltaPct === null ? <Minus className="w-3.5 h-3.5 text-slate-400" />
                : compare.deltaPct >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              <span className={compare.deltaPct === null ? 'text-slate-500' : compare.deltaPct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                {compare.deltaPct === null ? t('nafa.firstPeriod') : `${compare.deltaPct >= 0 ? '+' : ''}${compare.deltaPct}%`}
              </span>
              <span className="text-slate-400 font-medium">{t('nafa.vsPrev')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Per-shop balances */}
      <section>
        <h2 className="text-sm font-bold text-slate-700 mb-2">{t('nafa.perShop')}</h2>
        {dhanlabh.length === 0 && accounts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-8 text-center">
            <Gift className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-600 mt-2">{t('nafa.noPoints')}</p>
            <p className="text-xs text-slate-400 px-8">{t('nafa.noPointsSub')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(dhanlabh.length ? dhanlabh : accounts.map((a) => ({
              shop_id: a.shop_id, shop_name: a.shop_name, points: a.balance || 0,
              estimated_value_paise: (a.balance || 0) * (a.redemption_value_paise || 0),
            }))).map((d) => (
              <div key={d.shop_id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3.5 flex items-center justify-between"
                data-testid="nafa-shop-row">
                <div>
                  <p className="text-sm font-bold text-slate-800">{d.shop_name}</p>
                  <p className="text-[11px] text-slate-400">{t('nafa.pointsBalance', { n: String(d.points) })}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold font-mono text-emerald-600">{fmt(d.estimated_value_paise || 0)}</p>
                  <p className="text-[10px] text-slate-400">{t('nafa.redeemableValue')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {loyaltyTxs.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-1.5">
            {t('nafa.ledgerSummary', { earned: String(ledgerTotals.earnedPoints), redeemed: String(ledgerTotals.redeemedPoints) })}
          </p>
        )}
      </section>

      {/* Credit strip */}
      <Link to="/c/credit" className="block bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Wallet className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-slate-700">{t('app.myCredit')}</span>
        </div>
        <span className={`text-sm font-extrabold font-mono ${creditOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {fmt(creditOutstanding)}
        </span>
      </Link>

      <p className="text-[11px] text-slate-400 flex items-start gap-1">
        <Receipt className="w-3 h-3 mt-0.5 flex-shrink-0" />
        {t('nafa.formulaNote')}
      </p>
    </div>
  );
}
