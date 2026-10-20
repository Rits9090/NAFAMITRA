import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { ReceiptBody, shareReceipt } from '@/components/Receipt';
import { Store, Share2, Loader2 } from 'lucide-react';

/** Public, view-only receipt: /receipt/:token — no session, no sensitive data. */
export default function PublicReceipt() {
  const { token } = useParams();
  const { t } = useI18n();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/sales/public/receipt/${token}`)
      .then(({ data }) => setBill(data))
      .catch((e) => setError(errMsg(e, t('receipt.invalid'))))
      .finally(() => setLoading(false));
  }, [token, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xs w-full" role="alert">
          <Store className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700 mt-3">{t('receipt.invalid')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('receipt.invalidSub')}</p>
          <Link to="/auth" className="inline-block mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">
            {t('receipt.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  const doShare = async () => {
    const text = shareReceipt({ bill, shopName: bill.shop?.name, t });
    if (navigator.share) {
      try { await navigator.share({ title: bill.invoice_number, text }); } catch { /* dismissed */ }
    } else {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <p className="text-lg font-extrabold text-slate-800">NafaMitra</p>
          <p className="text-xs text-emerald-700 font-semibold">ग्राहक वाढवा, नफा वाढवा!</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeInUp">
          <div className="bg-emerald-600 px-4 py-3 text-white text-center">
            <p className="text-sm font-bold">{bill.shop?.name}</p>
            <p className="text-xs text-emerald-100">{t('receipt.title')} · {bill.invoice_number}</p>
          </div>
          <ReceiptBody bill={bill} shopName={bill.shop?.name} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={doShare}
            className="py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Share2 className="w-4 h-4" /> {t('receipt.share')}
          </button>
          <Link to="/auth"
            className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">
            {t('receipt.backHome')}
          </Link>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-4">{t('receipt.thanks')}</p>
      </div>
    </div>
  );
}
