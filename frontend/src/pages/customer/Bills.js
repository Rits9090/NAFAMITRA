import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { ReceiptBody, shareReceipt } from '@/components/Receipt';
import { Inbox, ChevronLeft, Share2, Link2, Gift, Wallet, ScrollText, Repeat2, Loader } from 'lucide-react';
import { shortDate } from '@/lib/dates';

/**
 * Reorder → creates a REQUIREMENT (shopping list) from a past bill.
 * Never fakes an order: copy says a requirement was posted, not purchased.
 */
export function useReorder() {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(null);
  const reorder = async (bill) => {
    setBusy(bill.id);
    try {
      let items = bill.items || [];
      if (!items.length) {
        const { data } = await api.get(`/customer/bills/${bill.id}`);
        items = data.items || [];
      }
      const clean = items.filter((i) => i.name).map((i) => ({
        name: i.name, qty: Math.max(1, i.quantity || 1), unit: i.unit || 'unit',
      }));
      if (!clean.length) { toast.error(t('app.reorderNoItems')); return; }
      await api.post('/requirements', {
        title: t('app.reorderTitle', { inv: bill.invoice_number || '' }),
        items: clean,
        source: 'reorder',
        ...(bill.shop_id ? { shop_id: bill.shop_id } : {}),
      });
      toast.success(t('app.reorderCreated'));
    } catch (e) {
      toast.error(errMsg(e));
    } finally { setBusy(null); }
  };
  return { reorder, busy };
}

export function CustomerBills() {
  const { t, lang } = useI18n();
  const { reorder, busy } = useReorder();
  const [bills, setBills] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/customer/bills');
      setBills(data.bills || []);
    } catch (e) { setError(errMsg(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-center text-sm text-slate-500 py-10" role="alert">{error}</p>;
  if (!bills) return <div className="space-y-2 animate-pulse" aria-busy="true">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}</div>;

  if (bills.length === 0) {
    return (
      <div className="text-center py-16" data-testid="customer-bills-empty">
        <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-sm font-semibold text-slate-600 mt-3">{t('app.noBills')}</p>
        <p className="text-xs text-slate-400">{t('app.billsSub')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">{t('nav.bills')}</h1>
        <p className="text-xs text-slate-500">{t('app.billsSub')}</p>
      </div>
      <ul className="space-y-2">
        {bills.map((b) => (
          <li key={`${b.shop_id}-${b.id}`}>
            <Link to={`/c/bills/${b.id}`}
              className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{b.shop_name}</p>
                <p className="text-[11px] text-slate-400">
                  {b.invoice_number} · {b.created_at ? shortDate(b.created_at, lang) : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <p className={`text-sm font-bold font-mono ${b.status === 'VOIDED' ? 'text-red-500 line-through' : 'text-slate-800'}`}>{fmt(b.total_paise || 0)}</p>
                  <p className="text-[11px] capitalize text-slate-400">{b.payment_mode}</p>
                </div>
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); reorder(b); }}
                  disabled={busy === b.id} title={t('app.reorder')}
                  aria-label={t('app.reorder')}
                  className="p-2 rounded-lg border border-emerald-200 text-emerald-600 bg-emerald-50 disabled:opacity-50"
                  data-testid={`reorder-${b.id}`}>
                  <Repeat2 className="w-4 h-4" />
                </button>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomerBillDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState(null);
  const { reorder, busy } = useReorder();

  useEffect(() => {
    api.get(`/customer/bills/${id}`)
      .then(({ data }) => setBill(data))
      .catch((e) => setError(errMsg(e, t('receipt.invalid'))));
  }, [id, t]);

  if (error) {
    return (
      <div className="text-center py-16" role="alert">
        <p className="text-sm font-semibold text-slate-600">{error}</p>
        <button onClick={() => navigate('/c/bills')} className="mt-3 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold">← {t('nav.bills')}</button>
      </div>
    );
  }
  if (!bill) return <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" aria-busy="true" />;

  const doShare = async () => {
    const text = shareReceipt({ bill, shopName: bill.shop?.name, t });
    if (navigator.share) {
      try { await navigator.share({ title: bill.invoice_number, text }); } catch { /* dismissed */ }
    } else {
      try { await navigator.clipboard.writeText(text); toast.success(t('billsList.sharedLinkCopied')); }
      catch { toast.error(t('common.errorTitle')); }
    }
  };

  return (
    <div className="space-y-4 animate-fadeInUp">
      <button onClick={() => navigate('/c/bills')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="w-4 h-4" /> {t('nav.bills')}
      </button>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <ReceiptBody bill={bill} shopName={bill.shop?.name || bill.shop_name} />
      </div>
      <button onClick={() => reorder(bill)} disabled={busy === bill.id}
        data-testid="reorder-btn"
        className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
        {busy === bill.id ? <Loader className="w-4 h-4 animate-spin" /> : <Repeat2 className="w-4 h-4" />}
        {t('app.reorder')}
      </button>
      <p className="text-[11px] text-slate-400 text-center -mt-2">{t('app.reorderNote')}</p>
      <button onClick={doShare} className="w-full py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center justify-center gap-1.5">
        <Share2 className="w-4 h-4" /> {t('receipt.share')}
      </button>
      {bill.share_token && (
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${window.location.origin}/receipt/${bill.share_token}`);
              toast.success(t('billsList.sharedLinkCopied'));
            } catch { toast.error(t('common.errorTitle')); }
          }}
          className="w-full py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Link2 className="w-4 h-4" /> {t('receipt.title')}
        </button>
      )}
    </div>
  );
}

export function CustomerLoyalty() {
  const { t, lang } = useI18n();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [openShop, setOpenShop] = useState(null);

  useEffect(() => {
    api.get('/customer/loyalty')
      .then(({ data }) => setAccounts(data.accounts || []))
      .catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <p className="text-center text-sm text-slate-500 py-10" role="alert">{error}</p>;
  if (!accounts) return <div className="h-48 bg-slate-200 rounded-2xl animate-pulse" aria-busy="true" />;

  if (accounts.length === 0) {
    return (
      <div className="text-center py-16" data-testid="customer-loyalty-empty">
        <Gift className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-sm font-semibold text-slate-600 mt-3">{t('loyalty.empty')}</p>
        <p className="text-xs text-slate-400">{t('loyalty.emptySub')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">🪙 {t('app.dhanlabh')}</h1>
        <p className="text-xs text-slate-500">{t('app.dhanlabhSub')}</p>
      </div>
      {accounts.map((a) => (
        <div key={a.shop_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button onClick={() => setOpenShop(openShop === a.shop_id ? null : a.shop_id)}
            className="w-full flex items-center justify-between px-4 py-4 text-left">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-700 truncate">{a.shop_name}</p>
              <p className="text-[11px] text-slate-400">{t('app.estimatedValue', { value: Math.round((a.estimated_value_paise || 0) / 100) })}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold font-mono text-violet-700">{a.points}</p>
              <p className="text-[10px] text-slate-400 font-semibold">{t('app.dhanlabh')}</p>
            </div>
          </button>
          {openShop === a.shop_id && (
            <div className="border-t border-slate-50 px-4 py-3 space-y-1.5 max-h-64 overflow-y-auto animate-fadeInUp">
              {(a.transactions || []).length === 0 && <p className="text-xs text-slate-400 text-center py-2">{t('loyalty.empty')}</p>}
              {(a.transactions || []).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase text-slate-400">{tx.type}</p>
                    <p className="text-xs text-slate-500 truncate">{tx.note || (tx.created_at ? shortDate(tx.created_at, lang) : '')}</p>
                  </div>
                  <span className={`font-mono font-bold ${(tx.delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {(tx.delta ?? 0) >= 0 ? '+' : ''}{tx.delta ?? tx.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CustomerCredit() {
  const { t, lang } = useI18n();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [openShop, setOpenShop] = useState(null);

  useEffect(() => {
    api.get('/customer/credit')
      .then(({ data }) => setAccounts(data.accounts || []))
      .catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <p className="text-center text-sm text-slate-500 py-10" role="alert">{error}</p>;
  if (!accounts) return <div className="h-48 bg-slate-200 rounded-2xl animate-pulse" aria-busy="true" />;

  const withDue = accounts.filter((a) => a.outstanding_paise > 0);

  if (withDue.length === 0) {
    return (
      <div className="text-center py-16" data-testid="customer-credit-empty">
        <Wallet className="w-10 h-10 text-emerald-300 mx-auto" />
        <p className="text-sm font-semibold text-slate-600 mt-3">{t('app.noCredit')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fadeInUp">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">{t('app.myCredit')}</h1>
        <p className="text-xs text-slate-500">{t('app.creditSub')}</p>
      </div>
      {withDue.map((a) => (
        <div key={a.shop_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button onClick={() => setOpenShop(openShop === a.shop_id ? null : a.shop_id)}
            className="w-full flex items-center justify-between px-4 py-4 text-left">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-700 truncate">{a.shop_name}</p>
              <p className="text-[11px] text-slate-400">{t('app.creditFor', { shop: a.shop_name })}</p>
            </div>
            <p className="text-xl font-extrabold font-mono text-red-600">{fmt(a.outstanding_paise)}</p>
          </button>
          {openShop === a.shop_id && (
            <div className="border-t border-slate-50 px-4 py-3 space-y-1.5 max-h-64 overflow-y-auto">
              {(a.transactions || []).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-400">{tx.type}</p>
                    <p className="text-xs text-slate-500">{tx.note || (tx.created_at ? shortDate(tx.created_at, lang) : '')}</p>
                  </div>
                  <span className={`font-mono font-bold ${tx.delta_paise > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {tx.delta_paise > 0 ? '+' : ''}{fmt(tx.delta_paise || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
