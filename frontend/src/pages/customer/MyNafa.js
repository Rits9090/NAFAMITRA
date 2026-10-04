import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Coins, Gift, Receipt, TrendingUp, TrendingDown, Minus, Wallet, Info, Loader,
  Target, Plus, Trash2, ShoppingBasket, Store, Lightbulb, Pencil, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { computeSavings, comparePeriods, loyaltyLedgerTotals } from '@/lib/savings';
import { shortDate } from '@/lib/dates';

const EXP_CATS = [
  { value: 'rent', key: 'brain.catRent' },
  { value: 'electricity', key: 'brain.catElectricity' },
  { value: 'school', key: 'brain.catSchool' },
  { value: 'food', key: 'brain.catFood' },
  { value: 'other', key: 'brain.catOther' },
];
const CAT_KEY = {
  grocery: 'brain.catGrocery', clothing: 'brain.catClothing',
  food: 'brain.catFood', medical: 'brain.catMedical',
  agriculture: 'brain.catAgriculture', other: 'brain.catOther',
  rent: 'brain.catRent', electricity: 'brain.catElectricity', school: 'brain.catSchool',
};

function Section({ title, action, children, testid }) {
  return (
    <section data-testid={testid}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- goals */
function GoalsSection({ goals, onChanged, t }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', target: '', progress: '' });
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !Number(form.target)) {
      setErr(t('goal.formErr'));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/customer/goals', {
        name: form.name.trim(),
        target_paise: Math.round(Number(form.target) * 100),
        progress_paise: Math.round(Number(form.progress || 0) * 100),
      });
      toast.success(t('goal.added'));
      setForm({ name: '', target: '', progress: '' });
      setAdding(false);
      onChanged();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setSaving(false);
    }
  };

  const bump = async (g, deltaPaise) => {
    try {
      await api.put(`/customer/goals/${g.id}`, {
        progress_paise: Math.max(0, (g.progress_paise || 0) + deltaPaise),
      });
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const input = 'w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

  return (
    <Section title={t('goal.title')} testid="goals-section"
      action={
        <button onClick={() => setAdding((a) => !a)} data-testid="add-goal-btn"
          className="flex items-center gap-1 text-xs font-bold text-emerald-700">
          <Plus className="w-3.5 h-3.5" /> {t('goal.add')}
        </button>
      }>
      {adding && (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-3 mb-2" data-testid="goal-form">
          <input className={input} placeholder={t('goal.namePh')} value={form.name}
            aria-label={t('goal.namePh')}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className={input} type="number" min="1" placeholder={t('goal.targetPh')}
              aria-label={t('goal.targetPh')} value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })} />
            <input className={input} type="number" min="0" placeholder={t('goal.progressPh')}
              aria-label={t('goal.progressPh')} value={form.progress}
              onChange={(e) => setForm({ ...form, progress: e.target.value })} />
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">{t('goal.trackingNote')}</p>
          {err && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 && !adding ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-7 text-center">
          <Target className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 mt-2">{t('goal.empty')}</p>
          <p className="text-xs text-slate-400 px-6 mt-0.5">{t('goal.emptySub')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid={`goal-${g.id}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-800">{g.emoji || '🎯'} {g.name}</p>
                <span className="text-xs font-extrabold font-mono text-emerald-600">{g.percent}%</span>
              </div>
              <p className="text-xs font-mono text-slate-500 mt-0.5">{fmt(g.progress_paise)} / {fmt(g.target_paise)}</p>
              <div className="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, g.percent)}%` }} />
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <p className="text-[10px] text-slate-400">{t('goal.trackingShort')}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => bump(g, 100000)}
                    className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100"
                    aria-label={t('goal.add100')}>
                    +₹100
                  </button>
                  <button onClick={async () => {
                    try {
                      await api.delete(`/customer/goals/${g.id}`);
                      onChanged();
                    } catch (e) { toast.error(errMsg(e)); }
                  }}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500"
                    aria-label={t('common.delete')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ expenses */
function ExpensesSection({ expenses, onChanged, lang, t }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', category: 'other' });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const input = 'w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !Number(form.amount)) {
      setErr(t('exp.formErr'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/customer/expenses', {
        title: form.title.trim(),
        amount_paise: Math.round(Number(form.amount) * 100),
        category: form.category,
      });
      toast.success(t('exp.added'));
      setForm({ title: '', amount: '', category: 'other' });
      setAdding(false);
      setErr(null);
      onChanged();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title={t('exp.title')} testid="expenses-section"
      action={
        <button onClick={() => setAdding((a) => !a)} data-testid="add-expense-btn"
          className="flex items-center gap-1 text-xs font-bold text-emerald-700">
          <Plus className="w-3.5 h-3.5" /> {t('exp.add')}
        </button>
      }>
      <p className="text-[10px] text-slate-400 -mt-1 mb-2">{t('exp.sub')}</p>
      {adding && (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-3 mb-2" data-testid="expense-form">
          <input className={input} placeholder={t('exp.titlePh')} aria-label={t('exp.titlePh')}
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className={input} type="number" min="1" placeholder="₹" aria-label={t('exp.amountPh')}
              value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <select className={input} value={form.category} aria-label={t('exp.categoryPh')}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXP_CATS.map((c) => <option key={c.value} value={c.value}>{t(c.key)}</option>)}
            </select>
          </div>
          <p className="text-[10px] text-amber-600 flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5" /> {t('exp.sourceNote')}
          </p>
          {err && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}
      {expenses.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
          {expenses.slice(0, 6).map((x) => (
            <div key={x.id} className="flex items-center justify-between px-4 py-2.5" data-testid={`expense-${x.id}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{x.title}</p>
                <p className="text-[10px] text-slate-400">
                  {shortDate(x.date, lang)} · <span className="text-amber-600 font-semibold">{t('exp.addedByYou')}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-slate-700">{fmt(x.amount_paise)}</span>
                <button onClick={async () => {
                  try { await api.delete(`/customer/expenses/${x.id}`); onChanged(); }
                  catch (e) { toast.error(errMsg(e)); }
                }} className="p-1 text-slate-300 hover:text-red-500" aria-label={t('common.delete')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------- my nafa */
export default function MyNafa() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loyalty, setLoyalty] = useState({ accounts: [] });
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [settings, setSettings] = useState({ saving_target_paise: 0, budgets: [] });
  const [goals, setGoals] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [editTarget, setEditTarget] = useState(false);
  const [targetVal, setTargetVal] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, lo, bi, sm, st, go, ex] = await Promise.all([
        api.get('/customer/overview'),
        api.get('/customer/loyalty').catch(() => ({ data: { accounts: [] } })),
        api.get('/customer/bills?limit=100').catch(() => ({ data: { bills: [] } })),
        api.get('/customer/nafa-summary'),
        api.get('/customer/settings').catch(() => ({ data: { saving_target_paise: 0, budgets: [] } })),
        api.get('/customer/goals').catch(() => ({ data: { goals: [] } })),
        api.get('/customer/expenses').catch(() => ({ data: { expenses: [] } })),
      ]);
      setOverview(ov.data);
      setLoyalty(lo.data);
      setBills(bi.data.bills || bi.data.invoices || []);
      setSummary(sm.data);
      setSettings(st.data);
      setGoals(go.data.goals || []);
      setExpenses(ex.data.expenses || []);
      setTargetVal(String(((st.data.saving_target_paise || 0) / 100)));
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

  const spend = summary?.known_spending || { total_paise: 0, bills_count: 0, by_category: [], partial: true };
  const target = settings.saving_target_paise || 0;
  const progress = summary?.saving_progress_paise || 0;
  const targetPct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;
  const insight = summary?.insight || { key: 'no_data' };

  const saveTarget = async () => {
    try {
      const r = await api.put('/customer/saving-target', {
        target_paise: Math.max(0, Math.round(Number(targetVal || 0) * 100)),
      });
      setSettings(r.data);
      setEditTarget(false);
      toast.success(t('goal.targetSaved'));
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-4 animate-fadeInUp" data-testid="my-nafa">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">{t('nafa.title')}</h1>
        <p className="text-xs text-slate-500">{t('nafa.sub')}</p>
      </div>

      {/* 1. My Spending — known NafaMitra data, honestly labelled */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid="known-spending">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingBasket className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">{t('nafa.mySpending')}</h2>
          <span className="ml-auto text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
            {t('nafa.sourceRecorded')}
          </span>
        </div>
        <p className="text-2xl font-extrabold font-mono text-slate-800">{fmt(spend.total_paise)}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{t('nafa.knownSpendingSub', { count: String(spend.bills_count) })}</p>
        {spend.by_category.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {spend.by_category.slice(0, 5).map((c) => (
              <span key={c.category}
                className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600">
                <b className="font-mono">{fmt(c.paise)}</b> {CAT_KEY[c.category] ? t(CAT_KEY[c.category]) : c.category}
              </span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-amber-600 mt-2 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('nafa.knownSpendingNote')}
        </p>
      </div>

      {/* 2. Savings dashboard — every number labelled with its source */}
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

        {/* saving target progress */}
        <div className="mt-3 bg-white/10 rounded-xl px-3 py-2" data-testid="saving-target">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-emerald-100 font-semibold">{t('goal.monthlyTarget')}</p>
            <button onClick={() => setEditTarget((v) => !v)}
              className="text-[10px] font-bold text-white underline flex items-center gap-0.5">
              <Pencil className="w-2.5 h-2.5" /> {editTarget ? t('common.close') : (target > 0 ? t('common.edit') : t('goal.setTarget'))}
            </button>
          </div>
          {editTarget ? (
            <div className="flex items-center gap-2 mt-1.5">
              <input type="number" min="0" value={targetVal} data-testid="target-input"
                onChange={(e) => setTargetVal(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-white text-slate-800 text-sm font-mono"
                aria-label={t('goal.monthlyTarget')} />
              <button onClick={saveTarget}
                className="px-3 py-1.5 rounded-lg bg-white text-emerald-700 text-xs font-bold">{t('common.save')}</button>
            </div>
          ) : target > 0 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm font-bold font-mono">{fmt(progress)} / {fmt(target)}</p>
                <p className="text-xs font-extrabold font-mono">{targetPct}%</p>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${targetPct}%` }} />
              </div>
              <p className="text-[10px] text-emerald-100 mt-1">{t('goal.progressNote')}</p>
            </>
          ) : (
            <p className="text-[11px] text-emerald-100 mt-1">{t('goal.noTarget')}</p>
          )}
        </div>
      </div>

      {/* Nafa Insight — deterministic, data-backed only */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-start gap-3" data-testid="nafa-insight">
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-4.5 h-4.5 text-amber-500" style={{ width: 18, height: 18 }} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700">{t('nafa.insightTitle')}</p>
          {insight.key === 'no_data' && <p className="text-xs text-slate-400 mt-0.5">{t('nafa.insightNoData')}</p>}
          {insight.key === 'first_period' && <p className="text-xs text-slate-500 mt-0.5">{t('nafa.insightFirst')}</p>}
          {insight.key === 'top_category' && (
            <p className="text-xs text-slate-600 mt-0.5">
              {t('nafa.insightTop', {
                cat: CAT_KEY[insight.category] ? t(CAT_KEY[insight.category]) : insight.category,
                amount: fmt(insight.paise || 0),
              })}
            </p>
          )}
          {insight.key === 'category_trend' && (
            <p className="text-xs text-slate-600 mt-0.5">
              {t(insight.delta_paise >= 0 ? 'nafa.insightUp' : 'nafa.insightDown', {
                cat: CAT_KEY[insight.category] ? t(CAT_KEY[insight.category]) : insight.category,
                amount: fmt(Math.abs(insight.delta_paise || 0)),
              })}
            </p>
          )}
        </div>
      </div>

      {/* Tiles: bills / stores / discounts / धनलाभ earned */}
      <div className="grid grid-cols-2 gap-2.5" data-testid="nafa-tiles">
        <Link to="/c/bills" className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
          <Receipt className="w-4 h-4 text-emerald-600" />
          <p className="text-lg font-extrabold font-mono text-slate-800 mt-1">{summary?.bills_count ?? bills.length}</p>
          <p className="text-[10px] text-slate-400 font-semibold">{t('nafa.tileBills')}</p>
        </Link>
        <button onClick={() => navigate('/c/stores')} data-testid="tile-stores"
          className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 text-left">
          <Store className="w-4 h-4 text-emerald-600" />
          <p className="text-lg font-extrabold font-mono text-slate-800 mt-1">{summary?.stores?.my_count ?? 0}</p>
          <p className="text-[10px] text-slate-400 font-semibold">{t('nafa.tileStores')}</p>
        </button>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
          <Gift className="w-4 h-4 text-amber-500" />
          <p className="text-lg font-extrabold font-mono text-slate-800 mt-1">{fmt(summary?.discount_paise || 0)}</p>
          <p className="text-[10px] text-slate-400 font-semibold">{t('nafa.tileDiscounts')}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
          <Coins className="w-4 h-4 text-amber-500" />
          <p className="text-lg font-extrabold font-mono text-slate-800 mt-1">{summary?.dhanlabh_earned_points ?? 0}</p>
          <p className="text-[10px] text-slate-400 font-semibold">{t('nafa.tileEarned')}</p>
        </div>
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

      {/* Goals */}
      <GoalsSection goals={goals} onChanged={load} t={t} />

      {/* Customer-added expenses */}
      <ExpensesSection expenses={expenses} onChanged={load} lang={lang} t={t} />

      {/* Per-shop balances */}
      <Section title={t('nafa.perShop')} testid="per-shop">
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
      </Section>

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

      {/* Ask Nafa Brain entry */}
      <button onClick={() => navigate('/c/brain')}
        className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5 flex items-center justify-between"
        data-testid="brain-entry">
        <span className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <Sparkles className="w-4 h-4" /> {t('brain.askTitle')}
        </span>
        <span className="text-emerald-600 text-lg">›</span>
      </button>

      <p className="text-[11px] text-slate-400 flex items-start gap-1">
        <Receipt className="w-3 h-3 mt-0.5 flex-shrink-0" />
        {t('nafa.formulaNote')}
      </p>
    </div>
  );
}
