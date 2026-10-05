import React, { useCallback, useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend } from 'recharts';
import { BarChart2, TrendingUp, Users, Package, Download, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { useI18n } from '@/i18n';

const TABS = [
  { id: 'Sales', labelKey: 'rep.tabSales' },
  { id: 'Products', labelKey: 'rep.tabProducts' },
  { id: 'Customers', labelKey: 'rep.tabCustomers' },
  { id: 'Outstanding', labelKey: 'rep.tabOutstanding' },
  { id: 'Inventory', labelKey: 'rep.tabInventory' },
];
const PERIOD_OPTIONS = [
  { value: 'today', labelKey: 'rep.periodToday' },
  { value: 'week', labelKey: 'rep.periodWeek' },
  { value: 'month', labelKey: 'rep.periodMonth' },
  { value: 'year', labelKey: 'rep.periodYear' },
];
const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Reports() {
  const { t } = useI18n();
  const [tab, setTab] = useState('Sales');
  const [period, setPeriod] = useState('month');
  const [salesData, setSalesData] = useState(null);
  const [productsData, setProductsData] = useState([]);
  const [customersData, setCustomersData] = useState(null);
  const [outstandingData, setOutstandingData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'Sales') {
        const { data } = await api.get(`/reports/sales?period=${period}`);
        setSalesData(data);
      } else if (tab === 'Products') {
        const { data } = await api.get(`/reports/products?period=${period}`);
        setProductsData(data || []);
      } else if (tab === 'Customers') {
        const { data } = await api.get(`/reports/customers`);
        setCustomersData(data);
      } else if (tab === 'Outstanding') {
        const { data } = await api.get(`/reports/outstanding`);
        setOutstandingData(data);
      } else if (tab === 'Inventory') {
        const { data } = await api.get(`/reports/inventory`);
        setInventoryData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, period]);

  // Declared before use (dep arrays evaluate at render time — TDZ otherwise).
  useEffect(() => { loadReport(); }, [loadReport]);

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>{t('nav.reports')}</h1>
          <p className="text-slate-500 text-sm">{t('rep.sub')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
            {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
          </select>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
            <Download className="w-4 h-4" />CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} className={`flex-1 min-w-max py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${tab === tb.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className={`${i === 0 ? 'h-48' : 'h-24'} bg-slate-200 rounded-xl animate-pulse` }/>)}</div>
      ) : (
        <>
          {/* Sales Tab */}
          {tab === 'Sales' && salesData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'rev', labelKey: 'reports.revenue', value: fmt(salesData.total_revenue), color: 'emerald' },
{ id: 'profit', labelKey: 'reports.profit', value: fmt(salesData.total_profit), color: 'blue' },
{ id: 'orders', labelKey: 'reports.orders', value: salesData.total_orders, color: 'purple' },
{ id: 'avg', labelKey: 'reports.avgOrder', value: fmt(salesData.avg_order_value), color: 'amber' },
].map(s => (
<div key={s.id} className={`bg-${s.color}-50 border border-${s.color}-100 rounded-xl p-4 text-center`}>
<p className={`text-2xl font-bold font-mono text-${s.color}-700`}>{s.value}</p>
<p className={`text-xs text-${s.color}-500 font-semibold mt-1`}>{t(s.labelKey)}</p>
                  </div>
                ))}
              </div>
              {salesData.daily?.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <h3 className="font-bold text-slate-700 mb-4" style={{fontFamily:'Outfit,sans-serif'}}>{t('rep.dailyTrend')}</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={salesData.daily} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={Math.floor(salesData.daily.length / 6)} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip formatter={v => [`₹${v.toLocaleString('en-IN')}`, t('reports.revenue')]} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} fill="url(#rev)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h3 className="font-bold text-slate-700 mb-3" style={{fontFamily:'Outfit,sans-serif'}}>{t('rep.paymentBreakdown')}</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(salesData.payment_breakdown || {}).map(([mode, amount]) => (
                    <div key={mode} className="flex-1 min-w-24 bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-base font-bold font-mono text-slate-700">{fmt(amount)}</p>
                      <p className="text-xs text-slate-500 font-semibold capitalize">{mode}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {tab === 'Products' && productsData.length > 0 && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-50">
                  <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>{t('rep.topProducts')}</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {productsData.slice(0, 10).map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="h-1.5 bg-emerald-100 rounded-full flex-1 max-w-32">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((p.revenue / (productsData[0]?.revenue || 1)) * 100, 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{t('rep.sold', { n: String(p.qty) })}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-slate-700">{fmt(p.revenue)}</p>
                        <p className="text-xs text-emerald-600 font-semibold">{t('rep.marginPct', { n: String(p.margin_pct ?? 0) })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Customers Tab */}
          {tab === 'Customers' && customersData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-emerald-600">{customersData.total}</p>
                  <p className="text-xs text-emerald-500 font-semibold">{t('common.total')}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-red-600">{customersData.inactive_count}</p>
                  <p className="text-xs text-red-500 font-semibold">{t('rep.inactive30')}</p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-purple-600">{customersData.by_membership?.vip || 0}</p>
                  <p className="text-xs text-purple-500 font-semibold">{t('rep.vip')}</p>
                </div>
              </div>
              {customersData.top_customers?.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-50">
                    <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>{t('rep.topCustomers')}</h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {customersData.top_customers.slice(0, 8).map((c, i) => (
                      <div key={c.id || i} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-6 h-6 text-xs font-bold flex items-center justify-center text-slate-400">{i+1}</span>
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{c.name?.[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400">{t('rep.visits', { n: String(c.total_visits || 0) })}</p>
                        </div>
                        <p className="text-sm font-bold font-mono text-slate-700">{fmt(c.total_purchases)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Outstanding Tab */}
          {tab === 'Outstanding' && outstandingData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-red-600">{fmt(outstandingData.total_outstanding)}</p>
                  <p className="text-xs text-red-500 font-semibold">{t('reports.outstanding')}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-amber-600">{outstandingData.customer_count}</p>
                  <p className="text-xs text-amber-500 font-semibold">{t('rep.customersDues')}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-50">
                  <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>{t('rep.pendingPayments')}</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {outstandingData.details?.map((u, i) => (
                    <div key={u.id || i} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center font-bold text-red-600 flex-shrink-0">{u.customer_name?.[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">{u.customer_name}</p>
                        <p className="text-xs text-slate-400">{u.customer_phone}</p>
                      </div>
                      <p className="text-sm font-bold font-mono text-red-600">{fmt(u.outstanding)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Inventory Tab */}
          {tab === 'Inventory' && inventoryData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-blue-600">{inventoryData.total_products}</p>
                  <p className="text-xs text-blue-500 font-semibold">{t('rep.totalProducts')}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-amber-600">{inventoryData.low_stock?.length || 0}</p>
                  <p className="text-xs text-amber-500 font-semibold">{t('rep.lowStock')}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold font-mono text-red-600">{inventoryData.out_of_stock?.length || 0}</p>
                  <p className="text-xs text-red-500 font-semibold">{t('rep.outStock')}</p>
                </div>
              </div>
              {inventoryData.dead_stock_amount > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" data-testid="dead-stock">
                  <div className="px-4 py-3 border-b border-slate-50 bg-rose-50 flex items-center justify-between">
                    <h3 className="font-bold text-rose-700">{t('rep.deadStock')}</h3>
                    <span className="text-sm font-bold font-mono text-rose-600">₹{Number(inventoryData.dead_stock_amount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="px-4 py-2 border-b border-slate-50">
                    <p className="text-[11px] text-slate-400">{t('rep.deadStockSub')}</p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {(inventoryData.dead_stock || []).slice(0, 6).map(p => (
                      <div key={p.id || p.name} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{p.name}</p>
                          <p className="text-xs text-slate-400">{t('rep.stuck', { n: String(p.stock_quantity) })}</p>
                        </div>
                        <span className="text-sm font-bold font-mono text-rose-600">₹{Number(p.stuck_amount).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {inventoryData.low_stock?.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-50 bg-amber-50">
                    <h3 className="font-bold text-amber-700">{t('rep.lowStockAction')}</h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {inventoryData.low_stock.map((p, i) => (
                      <div key={p.id || i} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.category}</p>
                        </div>
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-2 py-0.5 rounded-full">{t('rep.onlyLeft', { n: String(p.stock_quantity) })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
