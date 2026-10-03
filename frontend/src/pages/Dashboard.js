import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { fmt, fmtCompact } from '@/lib/money';
import {
  Plus, Users, CreditCard, Receipt, UserPlus, Package, IndianRupee,
  ArrowRight, Wallet, Repeat2, ChevronRight, Activity,
} from 'lucide-react';
import { DASHBOARD } from '@/constants/testIds';
import TodaysActions from '@/components/TodaysActions';

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.greetingMorning';
  if (h < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

function timeAgo(iso, t) {
  if (!iso) return t('customers.never');
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return t('billing.agoToday');
  if (days === 1) return t('billing.agoDays', { n: 1 });
  return t('billing.agoDays', { n: days });
}

export default function Dashboard() {
  const { user, activeShop } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r, a] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/recent-bills'),
        api.get('/dashboard/recent-customers'),
      ]);
      setStats(s.data);
      setRecent(r.data);
      setActivity(a.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse" aria-busy="true" aria-label={t('common.loading')}>
        <div className="h-16 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
        </div>
        <div className="h-48 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center" role="alert">
        <p className="text-sm text-slate-600 font-semibold">{error}</p>
        <button onClick={load} className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const firstName = (user?.name || '').split(' ')[0] || '';
  const metrics = [
    {
      key: 'sales', label: t('dashboard.todaysSales'),
      value: fmt(stats?.today?.sales_paise || 0),
      sub: `${stats?.today?.bills || 0} ${t('dashboard.bills')}`,
      testId: DASHBOARD.todaySales, accent: 'emerald', icon: IndianRupee,
    },
    {
      key: 'bills', label: t('dashboard.bills'),
      value: String(stats?.today?.bills || 0),
      sub: `${stats?.today?.customers || 0} ${t('dashboard.customersToday')}`,
      testId: DASHBOARD.monthlySales, accent: 'blue', icon: Receipt,
    },
    {
      key: 'customers', label: t('dashboard.totalCustomers'),
      value: String(stats?.customers?.total || 0),
      sub: `+${stats?.customers?.new_today || 0} · ${t('dashboard.repeatCustomers')}: ${stats?.customers?.repeat || 0}`,
      testId: DASHBOARD.totalCustomers, accent: 'violet', icon: Users,
    },
    {
      key: 'credit', label: t('dashboard.creditDue'),
      value: fmt(stats?.outstanding_paise || 0),
      sub: `${stats?.credit_accounts || 0} ${t('nav.customers')}`,
      testId: DASHBOARD.outstanding, accent: 'amber', icon: CreditCard,
    },
  ];

  const accentMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div data-testid={DASHBOARD.page} className="space-y-5 animate-fadeInUp">
      {/* Greeting */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 truncate" style={{ fontFamily: 'Outfit,sans-serif' }}>
            {t(greetingKey(), { name: firstName })}
          </h1>
          <p className="text-sm text-slate-500 truncate">{activeShop?.name}</p>
        </div>
        <div className="text-right text-xs text-slate-400 hidden sm:block">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* Primary action */}
      <button
        data-testid={DASHBOARD.newBillBtn}
        onClick={() => navigate('/billing')}
        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-base shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-transform"
      >
        <Plus className="w-5 h-5" /> {t('nav.newBill')}
      </button>

      {/* Secondary actions */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: t('dashboard.addCustomer'), icon: UserPlus, to: '/customers?add=1' },
          { label: t('dashboard.addProduct'), icon: Package, to: '/products?add=1' },
          { label: t('dashboard.collectCredit'), icon: Wallet, to: '/credit' },
        ].map(({ label, icon: Icon, to }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="flex flex-col items-center gap-1.5 bg-white border border-slate-200 rounded-xl py-3 px-2 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
          >
            <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Today's Actions — real-data priorities */}
      <TodaysActions />

      {/* Primary metrics */}
      <div className="grid grid-cols-2 gap-3" data-testid={DASHBOARD.alertsSection ? undefined : undefined}>
        {metrics.map(({ key, label, value, sub, testId, accent, icon: Icon }) => (
          <div key={key} data-testid={testId} className="stat-card card-hover">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-extrabold font-mono text-slate-800 mt-1.5 tracking-tight">{value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Quick month summary strip */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between text-sm">
        <div>
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{t('dashboard.monthSales')}</p>
          <p className="font-bold font-mono text-slate-800">{fmt(stats?.month?.sales_paise || 0)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{t('dashboard.avgBill')}</p>
          <p className="font-bold font-mono text-slate-800">{fmt(stats?.month?.avg_bill_paise || 0)}</p>
        </div>
        <button onClick={() => navigate('/reports')} className="text-emerald-700 font-semibold text-xs flex items-center gap-0.5">
          {t('dashboard.viewReports')} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent bills */}
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <h2 className="text-sm font-bold text-slate-700">{t('dashboard.recentBills')}</h2>
            <button onClick={() => navigate('/bills')} className="text-xs font-semibold text-emerald-700 hover:underline">
              {t('common.viewAll')}
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600 mt-2">{t('dashboard.noBills')}</p>
              <p className="text-xs text-slate-400">{t('dashboard.noBillsSub')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recent.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => navigate(b.legacy ? '/bills' : `/bills/${b.id}`)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {b.customer?.name || b.customer_name || t('billing.walkin')}
                      </p>
                      <p className="text-[11px] text-slate-400">{b.invoice_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold font-mono text-slate-800">{fmt(b.total_paise || 0)}</p>
                      <p className={`text-[11px] font-semibold capitalize ${
                        b.status === 'VOIDED' ? 'text-red-500'
                          : b.payment_status === 'credit' || b.payment_status === 'pending' ? 'text-amber-600'
                          : 'text-emerald-600'}`}>
                        {b.status === 'VOIDED' ? t('billsList.voided')
                          : b.payment_status === 'partial' ? t('billsList.partial')
                          : b.payment_status === 'credit' || b.payment_status === 'pending' ? t('billsList.pending')
                          : t('billsList.paid')}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Credit due + activity */}
        <div className="space-y-4">
          <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" data-testid={DASHBOARD.outstanding}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
              <h2 className="text-sm font-bold text-slate-700">{t('dashboard.creditDueList')}</h2>
              <button onClick={() => navigate('/credit')} className="text-xs font-semibold text-emerald-700 hover:underline">
                {t('common.viewAll')}
              </button>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-2xl font-extrabold font-mono text-slate-800">{fmt(stats?.outstanding_paise || 0)}</p>
                <p className="text-[11px] text-slate-400">{stats?.credit_accounts || 0} {t('nav.customers')}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-red-500" />
              </div>
            </div>
            {(stats?.outstanding_paise || 0) === 0 && (
              <p className="px-4 pb-4 text-xs text-emerald-600 font-medium">{t('dashboard.noCredit')}</p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
              <h2 className="text-sm font-bold text-slate-700">{t('dashboard.customerActivity')}</h2>
              <Activity className="w-4 h-4 text-slate-400" />
            </div>
            {activity.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-slate-400">{t('dashboard.noActivity')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {activity.slice(0, 5).map((c) => (
                  <li key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {c.purchase_count > 0
                          ? `${c.purchase_count} × ${t('customers.purchases')} · ${fmt(c.total_spend_paise || 0)}`
                          : t('customers.never')}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">{timeAgo(c.last_purchase_at || c.created_at, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
