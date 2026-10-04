import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import ReceiptModal, { ReceiptBody, shareReceipt } from '@/components/Receipt';
import { BILLING } from '@/constants/testIds';
import {
  Receipt, ChevronLeft, Share2, Link2, Trash2, Search, Inbox,
} from 'lucide-react';

const STATUS_TABS = ['', 'ACTIVE', 'VOIDED'];

export function BillsList() {
  const { t, lang } = useI18n();
  const { activeShop, role } = useAuth();
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (status) params.status = status;
      const { data } = await api.get('/sales', { params });
      let list = data.bills || [];
      if (q) {
        const needle = q.toLowerCase();
        list = list.filter((b) =>
          (b.invoice_number || '').toLowerCase().includes(needle) ||
          (b.customer?.name || b.customer_name || '').toLowerCase().includes(needle) ||
          (b.customer?.phone || '').includes(needle));
      }
      setBills(list);
      setPages(data.pages || 1);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('billsList.title')}</h1>
        <p className="text-xs text-slate-500">{t('billsList.sub')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('billsList.invoice')}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl" role="tablist">
        {STATUS_TABS.map((s) => (
          <button
            key={s || 'all'}
            role="tab"
            aria-selected={status === s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${
              status === s ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            {s === '' ? t('common.all') : s === 'ACTIVE' ? t('billsList.active') : t('billsList.voided')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : bills.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 py-12 text-center" data-testid="bills-empty">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 mt-3">{t('billsList.empty')}</p>
          <p className="text-xs text-slate-400">{t('billsList.emptySub')}</p>
          <Link to="/billing" className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            {t('nav.newBill')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2" data-testid={BILLING.page ? 'bills-list' : 'bills-list'}>
          {bills.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => navigate(`/bills/${b.id}`)}
                className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-emerald-200 text-left shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">
                    {b.customer?.name || b.customer_name || t('billing.walkin')}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {b.invoice_number} · {b.created_at ? dayMonth(b.created_at, lang) : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold font-mono text-slate-800">{fmt(b.total_paise || 0)}</p>
                  <span className={`text-[11px] font-semibold capitalize ${
                    b.status === 'VOIDED' ? 'text-red-500'
                      : b.payment_status === 'credit' || b.payment_status === 'pending' ? 'text-amber-600'
                      : 'text-emerald-600'}`}>
                    {b.status === 'VOIDED' ? t('billsList.voided')
                      : b.payment_status === 'partial' ? t('billsList.partial')
                      : b.payment_status === 'credit' || b.payment_status === 'pending' ? t('billsList.pending')
                      : t('billsList.paid')}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold disabled:opacity-40 bg-white">
            ←
          </button>
          <span className="px-3 py-2 text-sm text-slate-500">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold disabled:opacity-40 bg-white">
            →
          </button>
        </div>
      )}
    </div>
  );
}

export function BillDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { activeShop, role } = useAuth();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/sales/${id}`);
      setBill(data);
    } catch (e) {
      setError(errMsg(e, t('billsList.empty')));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  const doVoid = async () => {
    try {
      const { data } = await api.post(`/sales/${bill.id}/void`, { reason: 'voided from UI' });
      setBill(data);
      toast.success(t('billsList.voided'));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setConfirmVoid(false);
    }
  };

  const copyShare = async () => {
    if (!bill?.share_token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/receipt/${bill.share_token}`);
      toast.success(t('billsList.sharedLinkCopied'));
    } catch { toast.error(t('common.errorTitle')); }
  };

  const canVoid = ['owner', 'manager'].includes(role);

  if (loading) {
    return <div className="max-w-md mx-auto space-y-3"><div className="h-64 bg-slate-200 rounded-2xl animate-pulse" /></div>;
  }
  if (error || !bill) {
    return (
      <div className="max-w-md mx-auto text-center py-16" role="alert">
        <p className="text-sm text-slate-600 font-semibold">{error}</p>
        <button onClick={() => navigate('/bills')} className="mt-4 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold bg-white">
          ← {t('billsList.title')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4 animate-fadeInUp">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/bills')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> {t('billsList.title')}
        </button>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
          bill.status === 'VOIDED' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {bill.status === 'VOIDED' ? t('billsList.voided') : t('billsList.active')}
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-testid="bill-detail">
        <ReceiptBody bill={bill} shopName={activeShop?.name} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={copyShare}
          disabled={!bill.share_token}
          className="py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Link2 className="w-4 h-4" /> {t('billsList.sharedLinkCopied')}
        </button>
        <button
          onClick={() => navigator.share
            ? navigator.share({ title: bill.invoice_number, text: shareReceipt({ bill, shopName: activeShop?.name, t }) }).catch(() => {})
            : copyShare()}
          className="py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Share2 className="w-4 h-4" /> {t('receipt.share')}
        </button>
      </div>

      {canVoid && bill.status !== 'VOIDED' && !bill.legacy && (
        <button
          onClick={() => setConfirmVoid(true)}
          className="w-full py-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-4 h-4" /> {t('billsList.void')}
        </button>
      )}

      {confirmVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmVoid(false)} aria-hidden="true" />
          <div className="relative bg-white rounded-2xl p-5 max-w-xs w-full animate-fadeInUp" role="alertdialog" aria-label={t('billsList.void')}>
            <p className="text-sm font-semibold text-slate-800">{t('billsList.voidConfirm')}</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => setConfirmVoid(false)} className="py-2.5 rounded-xl border border-slate-200 text-sm font-semibold">
                {t('common.cancel')}
              </button>
              <button onClick={doVoid} className="py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">
                {t('billsList.void')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillsList;
