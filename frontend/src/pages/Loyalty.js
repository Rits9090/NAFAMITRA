import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { Gift, Save, Users, ScrollText, Lock } from 'lucide-react';

export default function Loyalty() {
  const { t, lang } = useI18n();
  const { role } = useAuth();
  const [rules, setRules] = useState(null);
  const [balances, setBalances] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, l, tx] = await Promise.all([
        api.get('/loyalty/rules'),
        api.get('/loyalty/leaderboard'),
        api.get('/loyalty/transactions'),
      ]);
      setRules(r.data);
      setBalances(Array.isArray(l.data) ? l.data : []);
      setLedger(Array.isArray(tx.data) ? tx.data : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRules = async (e) => {
    e.preventDefault();
    if (!isOwner) return toast.error(t('loyalty.ownerOnly'));
    setSaving(true);
    try {
      await api.put('/loyalty/rules', {
        points_per_100: parseInt(rules.points_per_100, 10) || 0,
        redemption_value: parseFloat(rules.redemption_value) || 0,
        loyalty_enabled: rules.loyalty_enabled !== false,
      });
      toast.success(t('loyalty.rulesSaved'));
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto space-y-3"><div className="h-40 bg-slate-200 rounded-2xl animate-pulse" /><div className="h-64 bg-slate-200 rounded-2xl animate-pulse" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>🪙 {t('loyalty.title')}</h1>
        <p className="text-xs text-slate-500">{t('loyalty.sub')}</p>
      </div>

      {/* Rules */}
      <form onSubmit={saveRules} className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-violet-800 flex items-center gap-1.5"><Gift className="w-4 h-4" /> {t('loyalty.rules')}</h2>
          {!isOwner && <span className="text-[10px] font-semibold text-violet-500 flex items-center gap-1"><Lock className="w-3 h-3" /> {t('loyalty.ownerOnly')}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="points-per-100" className="block text-xs font-semibold text-violet-700 mb-1">{t('loyalty.pointsPer100')}</label>
            <input
              id="points-per-100"
              disabled={!isOwner}
              inputMode="numeric"
              value={rules?.points_per_100 ?? 1}
              onChange={(e) => setRules({ ...rules, points_per_100: e.target.value.replace(/\D/g, '') })}
              className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400/40 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="redemption-value" className="block text-xs font-semibold text-violet-700 mb-1">{t('loyalty.redemptionValue')}</label>
            <input
              id="redemption-value"
              disabled={!isOwner}
              inputMode="decimal"
              value={rules?.redemption_value ?? 0.1}
              onChange={(e) => setRules({ ...rules, redemption_value: e.target.value.replace(/[^\d.]/g, '') })}
              className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400/40 disabled:opacity-60"
            />
          </div>
        </div>
        <p className="text-xs text-violet-600 font-medium">
          {t('loyalty.earnRule', { points: rules?.points_per_100 ?? 1 })}
        </p>
        <button type="submit" disabled={!isOwner || saving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? t('common.loading') : t('loyalty.saveRules')}
        </button>
      </form>

      {/* Balances */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-bold text-slate-700 border-b border-slate-50 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-slate-400" /> {t('loyalty.balances')}
        </h2>
        {balances.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">{t('loyalty.empty')}</p>
            <p className="text-xs text-slate-400">{t('loyalty.emptySub')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {balances.map((b) => (
              <li key={b.customer_id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{b.name}</p>
                  <p className="text-[11px] text-slate-400">{b.nm_id} · {b.total_purchases || 0} {t('customers.purchases')}</p>
                </div>
                <span className="text-base font-extrabold font-mono text-violet-700">{b.loyalty_points} 🪙</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ledger */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-bold text-slate-700 border-b border-slate-50 flex items-center gap-1.5">
          <ScrollText className="w-4 h-4 text-slate-400" /> {t('loyalty.ledger')}
        </h2>
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t('loyalty.recent')}</p>
        ) : (
          <ul className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
            {ledger.map((tx) => (
              <li key={tx.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {tx.customer?.name || '—'}
                    <span className="ml-2 text-[10px] font-bold uppercase text-slate-400">{tx.type}</span>
                  </p>
                  <p className="text-[11px] text-slate-400">{tx.note || (tx.created_at ? dateTime(tx.created_at, lang) : '')}</p>
                </div>
                <span className={`text-sm font-bold font-mono flex-shrink-0 ${(tx.delta ?? tx.points) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {(tx.delta ?? tx.points) >= 0 ? '+' : ''}{tx.delta ?? tx.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
