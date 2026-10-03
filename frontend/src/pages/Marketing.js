import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, MessageSquare, Users, Star, Gift, ShoppingBag, Cake, Copy, Check, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import api, { errMsg } from '@/lib/api';

// Message drafts only — nothing is ever "sent" from this screen. The merchant
// copies the composed text and shares it from their own phone. (Delivery
// integration is a future slot behind the MessageChannel interface.)
const TEMPLATES = [
  { id: 'festival', icon: Star, color: 'amber', titleKey: 'mkt.tplFestivalTitle', descKey: 'mkt.tplFestivalDesc', textKey: 'mkt.tplFestivalText' },
  { id: 'new_product', icon: ShoppingBag, color: 'blue', titleKey: 'mkt.tplNewTitle', descKey: 'mkt.tplNewDesc', textKey: 'mkt.tplNewText' },
  { id: 'loyalty', icon: Gift, color: 'purple', titleKey: 'mkt.tplLoyaltyTitle', descKey: 'mkt.tplLoyaltyDesc', textKey: 'mkt.tplLoyaltyText' },
  { id: 'winback', icon: Users, color: 'red', titleKey: 'mkt.tplWinbackTitle', descKey: 'mkt.tplWinbackDesc', textKey: 'mkt.tplWinbackText' },
  { id: 'birthday', icon: Cake, color: 'pink', titleKey: 'mkt.tplBirthdayTitle', descKey: 'mkt.tplBirthdayDesc', textKey: 'mkt.tplBirthdayText' },
  { id: 'clearance', icon: Megaphone, color: 'emerald', titleKey: 'mkt.tplClearanceTitle', descKey: 'mkt.tplClearanceDesc', textKey: 'mkt.tplClearanceText' },
];

// Real backend segments (customer_routes SEGMENTS) — no invented categories.
const SEGMENTS = [
  { key: 'all', labelKey: 'customers.segmentAll' },
  { key: 'new', labelKey: 'customers.segmentNew' },
  { key: 'repeat', labelKey: 'customers.segmentRepeat' },
  { key: 'high_value', labelKey: 'customers.segmentHighValue' },
  { key: 'credit_due', labelKey: 'customers.segmentCreditDue' },
  { key: 'inactive', labelKey: 'customers.segmentInactive' },
];

const COLORS = { amber: 'bg-amber-50 border-amber-200 text-amber-700', blue: 'bg-blue-50 border-blue-200 text-blue-700', purple: 'bg-purple-50 border-purple-200 text-purple-700', red: 'bg-red-50 border-red-200 text-red-700', pink: 'bg-pink-50 border-pink-200 text-pink-700', emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
const ICON_BG = { amber: 'bg-amber-100', blue: 'bg-blue-100', purple: 'bg-purple-100', red: 'bg-red-100', pink: 'bg-pink-100', emerald: 'bg-emerald-100' };

export default function Marketing() {
  const { t } = useI18n();
  const { activeShop } = useAuth();
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState('all');
  const [audience, setAudience] = useState(null); // { count, sample: [names] }
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [copied, setCopied] = useState(false);
  const msgRef = useRef(null);

  const shopName = activeShop?.name || '';
  const withShopName = (text) => shopName ? text.replaceAll('{business_name}', shopName) : text;

  useEffect(() => {
    if (!selected) return undefined;
    let cancelled = false;
    setLoadingAudience(true);
    setAudience(null);
    api.get('/customers', { params: { segment, limit: 100 } })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data?.customers || [];
        setAudience({
          count: rows.length,
          sample: rows.slice(0, 5).map((c) => c.name || c.phone || '—'),
        });
      })
      .catch((e) => { if (!cancelled) toast.error(errMsg(e)); })
      .finally(() => { if (!cancelled) setLoadingAudience(false); });
    return () => { cancelled = true; };
  }, [selected, segment]);

  const pickTemplate = (tpl) => {
    setSelected(tpl);
    setMessage(withShopName(t(tpl.textKey)));
    setCopied(false);
  };

  const handleCopy = async () => {
    const text = withShopName(message);
    if (!text.trim()) { toast.error(t('mkt.writeFirst')); return; }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('mkt.copiedToast'));
    } catch {
      // Fallback: select the text so the merchant can copy manually.
      msgRef.current?.focus?.();
      msgRef.current?.select?.();
      toast.error(t('mkt.copyFailed'));
    }
  };

  const shownCount = audience ? (audience.count >= 100 ? '100+' : String(audience.count)) : '—';

  return (
    <div className="space-y-5 animate-fadeInUp">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('mkt.title')}</h1>
        <p className="text-slate-500 text-sm">{t('mkt.subtitle')}</p>
      </div>

      {/* Honest capability banner — no fake delivery */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <MessageSquare className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700 font-medium">{t('mkt.honestBanner')}</p>
      </div>

      {/* Campaign templates */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('mkt.chooseType')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            const isSelected = selected?.id === tpl.id;
            return (
              <button key={tpl.id} onClick={() => pickTemplate(tpl)}
                className={`p-3 rounded-xl border text-left transition-all card-hover ${isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/30' : COLORS[tpl.color] + ' border'}`}>
                <div className={`w-8 h-8 rounded-lg ${ICON_BG[tpl.color]} flex items-center justify-center mb-2`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="font-bold text-sm text-slate-700">{t(tpl.titleKey)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t(tpl.descKey)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      {selected && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 animate-fadeInUp">
          <h3 className="font-bold text-slate-700" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('mkt.composeTitle')}</h3>

          {/* Audience — real customers from the selected segment */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('mkt.audienceLabel')}</label>
            <select value={segment} onChange={(e) => setSegment(e.target.value)}
              className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white">
              {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
            </select>
            <div className="mt-2 flex items-start gap-2 text-xs text-slate-500" data-testid="mkt-audience">
              {loadingAudience
                ? <span className="flex items-center gap-1"><Loader className="w-3 h-3 animate-spin" /> {t('mkt.audienceLoading')}</span>
                : <>
                    <span className="font-semibold text-slate-600">{t('mkt.audienceCount').replace('{n}', shownCount)}</span>
                    {audience?.sample?.length > 0 && <span className="text-slate-400">· {t('mkt.audienceSample').replace('{names}', audience.sample.join(', '))}</span>}
                  </>}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('mkt.messageLabel')}</label>
            <textarea ref={msgRef} value={message} onChange={(e) => { setMessage(e.target.value); setCopied(false); }} rows={4}
              className="w-full mt-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
              placeholder={t('mkt.messagePlaceholder')} />
            <p className="text-xs text-slate-400 mt-1 text-right">{t('mkt.chars').replace('{c}', String(message.length)).replace('{s}', String(Math.ceil(message.length / 160) || 1))}</p>
          </div>

          {/* Preview — explicitly not sent */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('mkt.previewLabel')}</p>
            <p className="text-[11px] text-slate-400 mb-2">{t('mkt.previewNote')}</p>
            <div className="bg-slate-100 rounded-xl p-4">
              <div className="bg-white rounded-xl p-3 shadow-sm max-w-64 ml-auto border border-slate-200">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{withShopName(message) || t('mkt.messagePlaceholder')}</p>
                <p className="text-xs text-slate-400 text-right mt-1">{t('mkt.previewTime')}</p>
              </div>
            </div>
          </div>

          <button onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity"
            data-testid="mkt-copy">
            {copied ? <><Check className="w-4 h-4" /><span>{t('mkt.copied')}</span></> : <><Copy className="w-4 h-4" /><span>{t('mkt.copyMessage')}</span></>}
          </button>
          <p className="text-xs text-slate-400 text-center">{t('mkt.copyHint')}</p>
        </div>
      )}
    </div>
  );
}
