import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, Users, CreditCard, AlertTriangle, ShoppingCart, Plus, Package, IndianRupee, ArrowUpRight, ArrowDownRight, Mic, Sparkles, ChevronRight } from 'lucide-react';
import { DASHBOARD } from '@/constants/testIds';
import { useAuth } from '@/context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [s, c, a, tp, rs] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/dashboard/chart`),
        axios.get(`${API}/dashboard/alerts`),
        axios.get(`${API}/dashboard/top-products`),
        axios.get(`${API}/dashboard/recent-sales`)
      ]);
      setStats(s.data);
      setChart(c.data);
      setAlerts(a.data);
      setTopProducts(tp.data);
      setRecentSales(rs.data);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
    </div>
  );

  const alertConfig = { low_stock: { color: 'amber', icon: Package }, udhaar: { color: 'red', icon: CreditCard }, inactive: { color: 'blue', icon: Users } };

  return (
    <div data-testid={DASHBOARD.page} className="space-y-5 animate-fadeInUp">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}!
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => navigate('/voice')} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-sm hover:opacity-90">
          <Mic className="w-3.5 h-3.5" />
          Voice
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Today's Sales", value: fmt(stats?.today?.revenue), sub: `${stats?.today?.orders || 0} orders`, icon: ShoppingCart, color: 'emerald', trend: '+12%', testId: DASHBOARD.todaySales },
          { label: "Monthly Revenue", value: fmt(stats?.month?.revenue), sub: `${stats?.month?.orders || 0} orders`, icon: TrendingUp, color: 'blue', trend: '+8%', testId: DASHBOARD.monthlySales },
          { label: "Total Customers", value: stats?.customers?.total || 0, sub: `+${stats?.customers?.new_today || 0} today`, icon: Users, color: 'purple', testId: DASHBOARD.totalCustomers },
          { label: "Outstanding", value: fmt(stats?.outstanding), sub: 'Udhaar due', icon: CreditCard, color: 'red', testId: DASHBOARD.outstanding },
        ].map(({ label, value, sub, icon: Icon, color, trend, testId }) => (
          <div key={label} data-testid={testId} className="stat-card card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-${color}-50`}>
                <Icon className={`w-4.5 h-4.5 text-${color}-600`} style={{width:'18px',height:'18px'}} />
              </div>
              {trend && <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" />{trend}</span>}
            </div>
            <p className="text-2xl font-bold font-mono text-slate-800">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">{label}</p>
            <p className="text-xs text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'New Bill', icon: ShoppingCart, color: 'bg-emerald-500', to: '/billing', testId: DASHBOARD.newBillBtn },
            { label: 'Add Customer', icon: Users, color: 'bg-blue-500', to: '/customers', testId: DASHBOARD.addCustomerBtn },
            { label: 'Add Product', icon: Package, color: 'bg-amber-500', to: '/products' },
            { label: 'AI Assistant', icon: Sparkles, color: 'bg-purple-500', to: '/assistant' },
          ].map(({ label, icon: Icon, color, to, testId }) => (
            <button key={label} data-testid={testId} onClick={() => navigate(to)} className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-white ${color} hover:opacity-90 transition-opacity`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sales Chart */}
      <div data-testid={DASHBOARD.salesChart} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Sales Trend</h3>
            <p className="text-xs text-slate-400">Last 30 days</p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            {fmt(stats?.month?.revenue)} this month
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chart} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
            <Tooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} labelStyle={{ color: '#334155' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
            <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} fill="url(#salesGradient)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div data-testid={DASHBOARD.alertsSection} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <h3 className="font-bold text-slate-700 mb-3" style={{fontFamily:'Outfit,sans-serif'}}>Action Required</h3>
            <div className="space-y-2">
              {alerts.map((alert, i) => {
                const conf = alertConfig[alert.type] || alertConfig.inactive;
                const Icon = conf.icon;
                const c = conf.color;
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl bg-${c === 'amber' ? 'amber' : c === 'red' ? 'red' : 'blue'}-50 border border-${c === 'amber' ? 'amber' : c === 'red' ? 'red' : 'blue'}-100`}>
                    <div className={`w-8 h-8 rounded-lg bg-${c === 'amber' ? 'amber' : c === 'red' ? 'red' : 'blue'}-100 flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 text-${c === 'amber' ? 'amber' : c === 'red' ? 'red' : 'blue'}-600`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700">{alert.title}</p>
                      <p className="text-xs text-slate-500">{alert.message}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Products */}
        {topProducts.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <h3 className="font-bold text-slate-700 mb-3" style={{fontFamily:'Outfit,sans-serif'}}>Top Products (This Month)</h3>
            <div className="space-y-2">
              {topProducts.slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 bg-emerald-100 rounded-full flex-1">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((p.revenue / topProducts[0].revenue) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-semibold text-slate-700 text-right">{fmt(p.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Sales */}
      {recentSales.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-50">
            <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Recent Sales</h3>
            <button onClick={() => navigate('/billing')} className="text-xs text-emerald-600 font-semibold hover:underline">View All</button>
          </div>
          <div className="divide-y divide-slate-50">
            {recentSales.slice(0, 5).map((sale) => (
              <div key={sale.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{sale.customer_name || 'Walk-in Customer'}</p>
                  <p className="text-xs text-slate-400">{sale.invoice_number} · {new Date(sale.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono text-slate-700">{fmt(sale.total_amount)}</p>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${sale.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : sale.payment_status === 'pending' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                    {sale.payment_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
