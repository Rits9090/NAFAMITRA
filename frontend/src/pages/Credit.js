import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt, toPaise, parseMoney } from '@/lib/money';
import { UDHAAR } from '@/constants/testIds';
import {
  CreditCard, Plus, Wallet, X, Search, ChevronRight, TrendingUp, Users,
} from 'lucide-react';

function useDebounced(v, d = 300) {
  const [val, setVal] = useState(v);
  useEffect(() => { const id = setTimeout(() => setVal(v), d); return () => clearTimeout(id); }, [v, d]);
  return val;
}

function CustomerSearch({ onPick }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q);

  useEffect(() => {
    if (debounced.length < 2) { setResults([]); return; }
    api.get('/customers/search', { params: { q: debounced } })
      .then(({ data }) => setResults(Array.isArray(data) ? data : []))
      .catch(() => setResults([]));
  }, [debounced]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={t('billing.searchCustomer')}
        className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          {results.map((c) => (
            <button key={c.id} onClick={() => { onPick(c); setOpen(false); setQ(''); }}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left">
              <div>
                <p className="text-sm font-medium text-slate-700">{c.name}</p>
                <p className="text-[11px] text-slate-400">{c.phone}</p>
              </div>
              <span className="text-xs font-bold font-mono text-red-500">{fmt(c.credit_due_paise || 0)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Credit() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {type:'give'|'pay', customer}
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState('cash');
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/udhaar');
      setRows(data.accounts || data.udhaars || []);
      setTotal(data.total_outstanding_paise ?? 0);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openGive = () => { setModal('give'); setPicked(null); setAmount(''); setNotes(''); };
  const openPay = (customer) => { setModal('pay'); setPicked(customer); setAmount(''); setNotes(''); };

  const submit = async (e) => {
    e.preventDefault();
    const paise = parseMoney(amount);
    if (paise <= 0) return toast.error(t('billing.amountRequired'));
    if (!picked) return toast.error(t('credit.customerRequired'));
    setSaving(true);
    try {
      if (modal === 'give') {
        await api.post('/udhaar', {
          customer_id: picked.id,
          amount: paise / 100,
          description: notes || 'Udhaar given',
        });
      } else {
        await api.post(`/udhaar/${picked.customer_id || picked.id}/payment`, {
          amount: paise / 100,
          payment_mode: mode,
          notes: notes || null,
          idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }
      toast.success(t('credit.saved'));
      setModal(null);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp" data-testid={UDHAAR.page}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('credit.title')}</h1>
          <p className="text-xs text-slate-500">{t('credit.sub')}</p>
        </div>
        <button
          data-testid={UDHAAR.addBtn}
          onClick={openGive}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> {t('credit.giveCredit')}
        </button>
      </div>

      <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between" data-testid={UDHAAR.totalOutstanding}>
        <div>
          <p className="text-xs font-bold text-red-500 uppercase tracking-wider">{t('credit.totalDue')}</p>
          <p className="text-2xl font-extrabold font-mono text-slate-800 mt-0.5">{fmt(total)}</p>
          <p className="text-[11px] text-slate-500">{rows.length} {t('nav.customers')}</p>
        </div>
        <Wallet className="w-8 h-8 text-red-300" />
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 py-12 text-center" data-testid="credit-empty">
          <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 mt-3">{t('credit.empty')}</p>
          <p className="text-xs text-slate-400 px-6">{t('credit.emptySub')}</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid={UDHAAR.list}>
          {rows.map((r) => (
            <li key={r.customer_id}>
              <div className="bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{r.name}</p>
                    <p className="text-[11px] text-slate-400">{r.phone} {r.nm_id ? `· ${r.nm_id}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-extrabold font-mono text-red-600">{fmt(r.outstanding_paise)}</p>
                    <p className="text-[10px] text-slate-400">{t('credit.given')}: {fmt(r.total_credit_paise || 0)}</p>
                  </div>
                  <button
                    data-testid={UDHAAR.paymentBtn}
                    onClick={() => openPay(r)}
                    className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-100 flex-shrink-0"
                  >
                    {t('credit.recordPayment')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} aria-hidden="true" />
          <form onSubmit={submit} className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 animate-fadeInUp" role="dialog" aria-label={modal === 'give' ? t('credit.giveCredit') : t('credit.recordPayment')}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">{modal === 'give' ? t('credit.giveCredit') : t('credit.recordPayment')}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label={t('common.close')}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {modal === 'give' ? (
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('billing.customer')}</label>
                <CustomerSearch onPick={setPicked} />
                {picked && (
                  <p className="text-xs text-emerald-700 font-semibold mt-1.5">✓ {picked.name} — {picked.phone}</p>
                )}
              </div>
            ) : (
              picked && (
                <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{picked.name}</p>
                    <p className="text-[11px] text-slate-400">{t('credit.outstanding')}</p>
                  </div>
                  <span className="text-base font-extrabold font-mono text-red-600">{fmt(picked.outstanding_paise || 0)}</span>
                </div>
              )
            )}

            <label htmlFor="credit-amount" className="block text-xs font-semibold text-slate-500 mb-1">{t('common.amount')}</label>
            <input
              id="credit-amount"
              inputMode="decimal"
              data-testid="credit-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              autoFocus
              className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 text-xl font-bold font-mono focus:outline-none focus:border-emerald-500 mb-3"
            />

            {modal === 'pay' && (
              <div className="mb-3">
                <span className="block text-xs font-semibold text-slate-500 mb-1.5">{t('credit.paymentMode')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'upi', 'card'].map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)}
                      className={`py-2 rounded-lg text-sm font-semibold border capitalize ${
                        mode === m ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600'}`}>
                      {t(`billing.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label htmlFor="credit-notes" className="block text-xs font-semibold text-slate-500 mb-1">{t('credit.notesOptional')}</label>
            <input id="credit-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-4" />

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setModal(null)} className="py-3 rounded-xl border border-slate-200 text-sm font-semibold">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving} data-testid={UDHAAR.recordPayment || 'credit-submit'}
                className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
                {saving ? t('common.loading') : t('credit.recordBtn')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
