import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { toast } from 'sonner';
import { Check, Share2, Link2, X, Printer, MessageCircle } from 'lucide-react';
import { track, ACTIVATION } from '@/lib/analytics';

/**
 * Digital receipt — works for merchant bills, customer bills and the
 * public share view (bill passed in already-normalised shape).
 */
export function ReceiptBody({ bill, shopName, compact = false }) {
  const { t, lang } = useI18n();
  const items = bill.items || [];
  const total = bill.total_paise ?? (bill.total || 0);
  const isVoid = bill.status === 'VOIDED';

  return (
    <div className="divide-y divide-dashed divide-slate-200">
      {isVoid && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold text-center uppercase tracking-wider">
          {t('receipt.voided')}
        </div>
      )}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 truncate">{shopName || bill.shop_name || 'NafaMitra'}</p>
          <p className="text-xs text-slate-400">{bill.invoice_number}</p>
        </div>
        <div className="text-right text-xs text-slate-400 flex-shrink-0">
          {bill.created_at && dateTime(bill.created_at, lang)}
        </div>
      </div>

      {bill.customer_name || bill.customer?.name ? (
        <div className="px-4 py-2 flex justify-between text-sm">
          <span className="text-slate-400">{t('receipt.billTo')}</span>
          <span className="font-semibold text-slate-700">{bill.customer_name || bill.customer?.name}</span>
        </div>
      ) : null}

      {!compact && items.length > 0 && (
        <div className="px-4 py-3 space-y-1.5">
          {items.map((it, idx) => (
            <div key={idx} className="flex justify-between text-sm gap-3">
              <span className="text-slate-600 truncate">
                {it.name || it.product_name}
                {it.quantity > 1 && <span className="text-slate-400"> × {it.quantity}</span>}
              </span>
              <span className="font-mono text-slate-700 flex-shrink-0">
                {fmt(it.total_paise ?? (it.total || 0))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 space-y-1.5 text-sm">
        <Row label={t('billing.subtotal')} value={fmt(bill.subtotal_paise ?? (bill.subtotal || 0))} />
        {(bill.discount_paise || bill.discount) ? (
          <Row label={t('billing.discount')} value={`-${fmt(bill.discount_paise ?? bill.discount)}`} accent="amber" />
        ) : null}
        {bill.loyalty_redeemed_points > 0 && (
          <Row label={t('receipt.pointsUsed', { points: bill.loyalty_redeemed_points })}
               value={`-${fmt(bill.loyalty_redeemed_value_paise || 0)}`} accent="violet" />
        )}
        <div className="flex justify-between pt-1.5 border-t border-slate-100">
          <span className="font-bold text-slate-800">{t('billing.total')}</span>
          <span className="font-extrabold font-mono text-emerald-700 text-base">{fmt(total)}</span>
        </div>
      </div>

      <div className="px-4 py-2.5 flex justify-between text-sm">
        <span className="text-slate-400">{t('billing.payment')}</span>
        <span className="font-semibold text-slate-700 capitalize">{bill.payment_mode}</span>
      </div>

      {bill.loyalty_earned_points > 0 && (
        <div className="px-4 py-3 bg-amber-50 flex items-center justify-between">
          <span className="text-sm font-semibold text-amber-800">🪙 {t('app.dhanlabh')}</span>
          <span className="text-sm font-bold text-amber-700">
            {t('receipt.pointsEarned', { points: bill.loyalty_earned_points })}
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }) {
  const colors = { amber: 'text-amber-600', violet: 'text-violet-600' };
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${colors[accent] || 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

export function shareReceipt({ bill, shopName, t }) {
  track(ACTIVATION.RECEIPT_SHARED, { invoice: bill?.invoice_number });
  const text = [
    `${shopName || 'NafaMitra'} — ${bill.invoice_number}`,
    `${t('billing.total')}: ${fmt((bill.total_paise ?? bill.total) || 0)}`,
    bill.share_token ? `${window.location.origin}/receipt/${bill.share_token}` : '',
  ].filter(Boolean).join('\n');
  return text;
}

export default function ReceiptModal({ bill, shopName, onClose, onNewBill }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!bill) return null;

  const customerPhone = (bill.customer?.phone || '').replace(/\D/g, '');
  const shareUrl = bill.share_token ? `${window.location.origin}/receipt/${bill.share_token}` : null;

  const doShare = async () => {
    setBusy(true);
    try {
      const text = shareReceipt({ bill, shopName, t });
      if (navigator.share) {
        await navigator.share({ title: `NafaMitra ${bill.invoice_number}`, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success(t('billsList.sharedLinkCopied'));
      } else {
        toast.info(text);
      }
    } catch {
      /* user dismissed the share sheet */
    } finally {
      setBusy(false);
    }
  };

  const doWhatsApp = () => {
    const text = encodeURIComponent(shareReceipt({ bill, shopName, t }));
    const url = customerPhone
      ? `https://wa.me/91${customerPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener');
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('billsList.sharedLinkCopied'));
    } catch {
      toast.error(t('common.errorTitle'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" data-testid="receipt-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden animate-fadeInUp shadow-2xl" role="dialog" aria-label={t('receipt.title')}>
        <div className="bg-emerald-600 px-5 py-5 text-white text-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <Check className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('billing.billCreated')}</h2>
          <p className="text-3xl font-extrabold font-mono mt-1">{fmt((bill.total_paise ?? bill.total) || 0)}</p>
          <p className="text-emerald-100 text-xs mt-1">
            {bill.customer_name || bill.customer?.name || t('billing.walkin')} · {bill.invoice_number}
          </p>
          {bill.loyalty_earned_points > 0 && (
            <p className="text-amber-200 text-sm font-semibold mt-1.5">
              +{bill.loyalty_earned_points} {t('app.dhanlabh')} 🪙
            </p>
          )}
        </div>

        <ReceiptBody bill={bill} shopName={shopName} />

        <div className="p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { onClose(); navigate(`/bills/${bill.id}`); }}
              className="py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> {t('billing.viewReceipt')}
            </button>
            <button
              onClick={doShare}
              disabled={busy}
              className="py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" /> {t('billing.shareReceipt')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {customerPhone ? (
              <button
                onClick={doWhatsApp}
                className="py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" /> {t('receipt.shareWhatsapp')}
              </button>
            ) : (
              <button
                onClick={copyLink}
                disabled={!shareUrl}
                className="py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Link2 className="w-4 h-4" /> {t('billsList.sharedLinkCopied')}
              </button>
            )}
            <button
              onClick={() => { onClose(); if (onNewBill) onNewBill(); else navigate('/billing'); }}
              className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
            >
              {t('billing.anotherBill')}
            </button>
          </div>
          <button onClick={onClose} className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1">
            <X className="w-4 h-4" /> {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
