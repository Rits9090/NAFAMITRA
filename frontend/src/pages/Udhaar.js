import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CreditCard, Plus, IndianRupee, X, TrendingDown, ChevronRight, Phone, AlertTriangle } from 'lucide-react';
import { UDHAAR } from '@/constants/testIds';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Udhaar() {
  const [udhaars, setUdhaars] = useState([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState('');
  const [addForm, setAddForm] = useState({ customer_id: '', amount: '', description: 'Udhaar given' });
  const [payForm, setPayForm] = useState({ amount: '', payment_mode: 'cash', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadUdhaar(); }, []);

  const loadUdhaar = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/udhaar`);
      setUdhaars(data.udhaars || []);
      setTotalOutstanding(data.total_outstanding || 0);
    } finally {
      setLoading(false);
    }
  };

  const searchCustomers = async (q) => {
    setCustSearch(q);
    if (q.length < 2) { setCustomers([]); return; }
    const { data } = await axios.get(`${API}/customers/search?q=${q}`);
    setCustomers(data);
  };

  const handleAddUdhaar = async (e) => {
    e.preventDefault();
    if (!addForm.customer_id || !addForm.amount) return toast.error('Select customer and enter amount');
    setSubmitting(true);
    try {
      await axios.post(`${API}/udhaar`, addForm);
      toast.success('Udhaar entry added!');
      setShowAddModal(false);
      setAddForm({ customer_id: '', amount: '', description: 'Udhaar given' });
      loadUdhaar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payForm.amount) return toast.error('Enter payment amount');
    setSubmitting(true);
    try {
      await axios.post(`${API}/udhaar/${selected.id}/payment`, payForm);
      toast.success(`Payment of ₹${payForm.amount} recorded!`);
      setShowPayModal(false);
      setPayForm({ amount: '', payment_mode: 'cash', notes: '' });
      loadUdhaar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div data-testid={UDHAAR.page} className="space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Udhaar Ledger</h1>
          <p className="text-slate-500 text-sm">Credit given to customers</p>
        </div>
        <button data-testid={UDHAAR.addBtn} onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-red-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 shadow-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Udhaar</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <p data-testid={UDHAAR.totalOutstanding} className="text-2xl font-bold font-mono text-red-600">{fmt(totalOutstanding)}</p>
          <p className="text-xs text-red-500 font-semibold mt-1">Total Outstanding</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold font-mono text-amber-600">{udhaars.filter(u => u.outstanding > 0).length}</p>
          <p className="text-xs text-amber-500 font-semibold mt-1">Customers Owe</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold font-mono text-emerald-600">{fmt(udhaars.reduce((s, u) => s + (u.total_paid || 0), 0))}</p>
          <p className="text-xs text-emerald-500 font-semibold mt-1">Total Received</p>
        </div>
      </div>

      {/* Udhaar List */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div data-testid={UDHAAR.list} className="space-y-2">
          {udhaars.filter(u => u.outstanding > 0).map(u => (
            <div key={u.id} onClick={() => setSelected(u)} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:border-red-200 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center font-bold text-red-600 flex-shrink-0">
                  {u.customer_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{u.customer_name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{u.customer_phone || 'No phone'} · Last: {new Date(u.last_transaction_at || u.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold font-mono text-red-600">{fmt(u.outstanding)}</p>
                  <p className="text-xs text-slate-400">of {fmt(u.total_credit)} given</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          ))}
          {udhaars.filter(u => u.outstanding <= 0).length > 0 && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 text-center">
              <p className="text-sm text-emerald-600 font-semibold">{udhaars.filter(u => u.outstanding <= 0).length} customers have cleared their dues ✓</p>
            </div>
          )}
        </div>
      )}

      {/* Customer Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fadeInUp max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-800">{selected.customer_name}</p>
                <p className="text-xs text-slate-400">{selected.customer_phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <button data-testid={UDHAAR.paymentBtn} onClick={() => setShowPayModal(true)} className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-emerald-600">Record Payment</button>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
              </div>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold font-mono text-red-600">{fmt(selected.outstanding)}</p>
                  <p className="text-xs text-red-500 font-semibold">Outstanding</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold font-mono text-amber-600">{fmt(selected.total_credit)}</p>
                  <p className="text-xs text-amber-500 font-semibold">Total Given</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold font-mono text-emerald-600">{fmt(selected.total_paid)}</p>
                  <p className="text-xs text-emerald-500 font-semibold">Total Paid</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transaction History</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(selected.entries || []).slice().reverse().map((entry, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${entry.type === 'given' ? 'bg-red-50 border border-red-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${entry.type === 'given' ? 'bg-red-100' : 'bg-emerald-100'}`}>
                        <TrendingDown className={`w-3.5 h-3.5 ${entry.type === 'given' ? 'text-red-600' : 'text-emerald-600 rotate-180'}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-700">{entry.description}</p>
                        <p className="text-xs text-slate-400">{new Date(entry.date).toLocaleDateString('en-IN')}</p>
                      </div>
                      <span className={`text-sm font-bold font-mono ${entry.type === 'given' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {entry.type === 'given' ? '-' : '+'}{fmt(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Udhaar Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fadeInUp">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Add Udhaar Entry</h3>
              <button onClick={() => setShowAddModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddUdhaar} className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer *</label>
                <input value={custSearch} onChange={e => searchCustomers(e.target.value)} placeholder="Search customer..." className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
                {customers.length > 0 && !addForm.customer_id && (
                  <div className="mt-1 bg-white rounded-xl border border-slate-100 shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                    {customers.map(c => (
                      <button key={c.id} type="button" onClick={() => { setAddForm(p => ({...p, customer_id: c.id})); setCustSearch(c.name); setCustomers([]); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
                        {c.name} · {c.phone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount (₹) *</label>
                <input type="number" value={addForm.amount} onChange={e => setAddForm(p => ({...p, amount: e.target.value}))} placeholder="Enter amount" required min="1" className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                <input value={addForm.description} onChange={e => setAddForm(p => ({...p, description: e.target.value}))} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Add Udhaar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayModal && selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fadeInUp">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Record Payment</h3>
                <p className="text-xs text-slate-400">Outstanding: {fmt(selected.outstanding)}</p>
              </div>
              <button onClick={() => setShowPayModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount Received (₹) *</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({...p, amount: e.target.value}))} placeholder={`Max: ${selected.outstanding}`} required max={selected.outstanding} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Mode</label>
                <div className="flex gap-2 mt-1">
                  {['cash', 'upi', 'card'].map(m => (
                    <button key={m} type="button" onClick={() => setPayForm(p => ({...p, payment_mode: m}))} className={`flex-1 py-2 rounded-xl text-sm font-semibold capitalize border transition-colors ${payForm.payment_mode === m ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPayModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
