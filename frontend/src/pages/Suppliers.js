import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Truck, Plus, X, ChevronRight, Package, IndianRupee } from 'lucide-react';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { shortDate } from '@/lib/dates';


export default function Suppliers() {
  const { t, lang } = useI18n();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', gst_number: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadSuppliers(); }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/suppliers`);
      setSuppliers(data || []);
    } finally {
      setLoading(false);
    }
  };

  const openSupplier = async (s) => {
    setSelected(s);
    try {
      const { data } = await api.get(`/suppliers/${s.id}`);
      setSupplierDetail(data);
    } catch {}
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error(t('sup.nameRequired'));
    setSubmitting(true);
    try {
      await api.post(`/suppliers`, form);
      toast.success(t('sup.added'));
      setShowAdd(false);
      setForm({ name: '', phone: '', email: '', address: '', gst_number: '' });
      loadSuppliers();
    } catch (err) {
      toast.error(errMsg(err, t('sup.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>{t('nav.suppliers')}</h1>
          <p className="text-slate-500 text-sm">{t('sup.count', { n: String(suppliers.length) })}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 shadow-sm">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('sup.add')}</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => (
            <div key={s.id} onClick={() => openSupplier(s)} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center font-bold text-blue-600 text-lg flex-shrink-0">
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.phone || t('sup.noPhone')} {s.gst_number ? `· GST: ${s.gst_number}` : ''}</p>
                  <div className="flex gap-3 mt-1.5 text-xs">
                    <span className="text-blue-600 font-semibold">{t('sup.purchased', { amount: fmt(s.total_purchases) })}</span>
                    {s.outstanding > 0 && <span className="text-red-600 font-semibold">{t('sup.owed', { amount: fmt(s.outstanding) })}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fadeInUp max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-800">{selected.name}</p>
                <p className="text-xs text-slate-400">{selected.phone}</p>
              </div>
              <button onClick={() => { setSelected(null); setSupplierDetail(null); }} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bought', labelKey: 'sup.totalBought', value: fmt(selected.total_purchases), color: 'blue' },
                  { id: 'paid', labelKey: 'sup.totalPaid', value: fmt(selected.total_paid), color: 'emerald' },
                  { id: 'out', labelKey: 'sup.outstanding', value: fmt(selected.outstanding), color: 'red' },
                ].map(s => (
                  <div key={s.id} className={`bg-${s.color}-50 rounded-xl p-3 text-center`}>
                    <p className={`text-base font-bold font-mono text-${s.color}-600`}>{s.value}</p>
                    <p className={`text-xs text-${s.color}-500 font-semibold`}>{t(s.labelKey)}</p>
                  </div>
                ))}
              </div>
              {supplierDetail?.purchases?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sup.recentPurchases')}</p>
                  <div className="space-y-2">
                    {supplierDetail.purchases.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{t('sup.items', { n: String(p.items?.length || 0) })}</p>
                          <p className="text-xs text-slate-400">{shortDate(p.created_at, lang)} · {p.payment_mode}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono text-slate-700">{fmt(p.total_amount)}</p>
                          {p.outstanding > 0 && <p className="text-xs text-red-500">{t('sup.due', { amount: fmt(p.outstanding) })}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fadeInUp">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{t('sup.addTitle')}</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-3">
              {[
                { key: 'name', labelKey: 'sup.fName', phKey: 'sup.phName', required: true },
                { key: 'phone', labelKey: 'common.phone', phKey: 'sup.phPhone' },
                { key: 'address', labelKey: 'sup.fAddress', phKey: 'sup.phAddress' },
                { key: 'gst_number', labelKey: 'sup.fGst', phKey: 'sup.phGst' },
              ].map(({ key, labelKey, phKey, required }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t(labelKey)}</label>
                  <input value={form[key]} onChange={e => setForm(p => ({...p, [key]: e.target.value}))} placeholder={t(phKey)} required={required} className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold">{t('common.cancel')}</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : t('sup.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
