import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, Plus, Search, Phone, Crown, Star, Award, X, ChevronRight, ShoppingBag, CreditCard, Gift } from 'lucide-react';
import { CUSTOMERS } from '@/constants/testIds';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MEMBERSHIP_CONFIG = {
  bronze: { color: 'amber', icon: Award, label: 'Bronze' },
  silver: { color: 'slate', icon: Star, label: 'Silver' },
  gold: { color: 'yellow', icon: Crown, label: 'Gold' },
  vip: { color: 'purple', icon: Crown, label: 'VIP' },
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { loadCustomers(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/customers?search=${search}&limit=50`);
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  const openCustomer = async (c) => {
    setSelectedCustomer(c);
    setLoadingDetail(true);
    try {
      const { data } = await axios.get(`${API}/customers/${c.id}`);
      setCustomerDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error('Name is required');
    setSubmitting(true);
    try {
      await axios.post(`${API}/customers`, form);
      toast.success(`${form.name} added successfully!`);
      setShowAdd(false);
      setForm({ name: '', phone: '', email: '', birthday: '', notes: '' });
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add customer');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div data-testid={CUSTOMERS.page} className="space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Customers</h1>
          <p className="text-slate-500 text-sm">{total} total customers</p>
        </div>
        <button data-testid={CUSTOMERS.addBtn} onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Customer</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input data-testid={CUSTOMERS.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm" />
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div data-testid={CUSTOMERS.list} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {customers.map(c => {
            const mc = MEMBERSHIP_CONFIG[c.membership_level] || MEMBERSHIP_CONFIG.bronze;
            const MIcon = mc.icon;
            return (
              <div key={c.id} data-testid={CUSTOMERS.card} onClick={() => openCustomer(c)} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:border-emerald-200 hover:shadow-md transition-all card-hover">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold bg-${mc.color === 'yellow' ? 'yellow' : mc.color === 'purple' ? 'purple' : mc.color === 'slate' ? 'slate' : 'amber'}-50 text-${mc.color === 'yellow' ? 'yellow' : mc.color === 'purple' ? 'purple' : mc.color === 'slate' ? 'slate' : 'amber'}-600`}>
                        {mc.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{c.phone} · {c.customer_id}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="text-emerald-600 font-mono font-semibold">{fmt(c.total_purchases)}</span>
                      <span className="text-slate-400">{c.total_visits} visits</span>
                      <span className="text-purple-600 font-semibold">{c.loyalty_points?.toFixed(0)} pts</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 mt-1" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Customer Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-fadeInUp">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Add New Customer</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name *</label>
                <input data-testid={CUSTOMERS.nameInput} value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Customer name" required className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</label>
                <input data-testid={CUSTOMERS.phoneInput} value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="10-digit mobile number" className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                  <input value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="Email" className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Birthday</label>
                  <input type="date" value={form.birthday} onChange={e => setForm(p => ({...p, birthday: e.target.value}))} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} placeholder="Any notes..." rows={2} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
                <button data-testid={CUSTOMERS.saveBtn} type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 flex items-center justify-center gap-1">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fadeInUp max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                  {selectedCustomer.name[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{selectedCustomer.name}</p>
                  <p className="text-xs text-slate-400">{selectedCustomer.customer_id} · {selectedCustomer.phone}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedCustomer(null); setCustomerDetail(null); }} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Spent', value: fmt(selectedCustomer.total_purchases), icon: ShoppingBag, color: 'emerald' },
                  { label: 'Loyalty Pts', value: selectedCustomer.loyalty_points?.toFixed(0), icon: Gift, color: 'purple' },
                  { label: 'Udhaar', value: fmt(customerDetail?.udhaar?.outstanding || 0), icon: CreditCard, color: 'red' }
                ].map(s => (
                  <div key={s.label} className={`bg-${s.color}-50 rounded-xl p-3 text-center`}>
                    <p className={`text-lg font-bold font-mono text-${s.color}-700`}>{s.value}</p>
                    <p className={`text-xs text-${s.color}-600 font-semibold mt-0.5`}>{s.label}</p>
                  </div>
                ))}
              </div>
              {loadingDetail ? (
                <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : customerDetail?.recent_sales?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Purchases</p>
                  <div className="space-y-2">
                    {customerDetail.recent_sales.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{s.invoice_number}</p>
                          <p className="text-xs text-slate-400">{new Date(s.created_at).toLocaleDateString('en-IN')} · {s.payment_mode}</p>
                        </div>
                        <span className="text-sm font-bold font-mono text-slate-700">₹{s.total_amount?.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
