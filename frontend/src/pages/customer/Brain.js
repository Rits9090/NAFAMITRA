import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader, Info, Sparkles, Mic, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';
import { dictate, isDictationSupported } from '@/lib/voiceInput';

const CAT_LABEL = {
  grocery: 'brain.catGrocery', clothing: 'brain.catClothing',
  food: 'brain.catFood', medical: 'brain.catMedical',
  agriculture: 'brain.catAgriculture', other: 'brain.catOther',
  rent: 'brain.catRent', electricity: 'brain.catElectricity',
  school: 'brain.catSchool',
};

function catLabel(cat, t) {
  if (!cat) return t('brain.catOther');
  return CAT_LABEL[cat] ? t(CAT_LABEL[cat]) : cat;
}

/** Structured detail lines per intent — numbers formatted here, wording keyed. */
function detailLines(intent, d, t) {
  const lines = [];
  if (intent === 'spending') {
    lines.push([t('brain.lblBills'), String(d.bills_count || 0)]);
    if (d.top_category) {
      lines.push([t('brain.lblTopCategory'),
        `${catLabel(d.top_category, t)} · ${fmt(d.top_category_paise || 0)}`]);
    }
    (d.by_shop || []).slice(0, 3).forEach((s) => {
      lines.push([s.shop_name || '—', fmt(s.paise || 0)]);
    });
  }
  if (intent === 'saving') {
    lines.push([t('brain.lblDiscount'), fmt(d.discount_paise || 0)]);
    lines.push([t('brain.lblLoyaltyValue'), fmt(d.loyalty_value_paise || 0)]);
    lines.push([t('brain.lblDhanlabhEarned'), String(d.dhanlabh_earned_points || 0)]);
    if (d.saving_target_paise > 0) {
      lines.push([t('brain.lblSavingTarget'), fmt(d.saving_target_paise)]);
    }
  }
  if (intent === 'goals') {
    (d.goals || []).forEach((g) => {
      lines.push([`${g.emoji || '🎯'} ${g.name}`,
        `${fmt(g.progress_paise)} / ${fmt(g.target_paise)} · ${g.percent}%`]);
    });
  }
  if (intent === 'loyalty') {
    (d.accounts || []).forEach((a) => {
      lines.push([a.shop_name || '—', `🪙 ${a.points} · ${fmt(a.value_paise || 0)}`]);
    });
  }
  if (intent === 'stores') {
    lines.push([t('brain.lblAdded'), String(d.my_count || 0)]);
    lines.push([t('brain.lblConnected'), String(d.connected_count || 0)]);
    (d.stores || []).slice(0, 5).forEach((s) => {
      lines.push([s.shop_name || '—', t(s.state === 'connected' ? 'stores.stateConnected' : 'stores.stateAdded')]);
    });
  }
  if (intent === 'bills') {
    (d.bills || []).slice(0, 3).forEach((b) => {
      lines.push([`${b.shop_name || ''} · ${b.invoice_number || ''}`, fmt(b.total_paise || 0)]);
    });
  }
  if (intent === 'reorder') {
    lines.push([t('brain.lblOpenReqs'), String(d.count || 0)]);
    (d.requirements || []).slice(0, 3).forEach((r) => {
      lines.push([r.title, t(`search.st${r.status[0].toUpperCase()}${r.status.slice(1)}`)]);
    });
  }
  if (intent === 'help') {
    ['spending', 'saving', 'goals', 'loyalty', 'stores', 'bills'].forEach((k) => {
      lines.push([t(`brain.cap_${k}`), '']);
    });
  }
  return lines;
}

function BrainBubble({ msg, t }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 text-white px-4 py-2.5 text-sm" data-testid="brain-user-msg">
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.role === 'error') {
    return (
      <div className="flex" role="alert">
        <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-red-50 border border-red-100 text-red-700 px-4 py-2.5 text-sm" data-testid="brain-error">
          {msg.text}
        </div>
      </div>
    );
  }
  const { intent, data, reply_key: replyKey, partial, actions = [] } = msg;
  const d = data || {};
  const params = {
    amount: fmt(d.total_paise || d.total_recorded_paise || 0),
    count: String(d.bills_count ?? d.count ?? 0),
    top: d.top_category ? catLabel(d.top_category, t) : '',
    topAmount: fmt(d.top_category_paise || 0),
    points: String(d.dhanlabh_earned_points || 0),
    stores: String(d.my_count || 0),
  };
  const lines = detailLines(intent, d, t);
  return (
    <div className="flex">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white border border-slate-100 shadow-sm px-4 py-3" data-testid="brain-reply">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Nafa Brain</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed">{t(replyKey, params)}</p>
        {lines.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-slate-50 pt-2">
            {lines.map(([label, val], i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold font-mono text-slate-700 text-right">{val}</span>
              </div>
            ))}
          </div>
        )}
        {partial && (
          <p className="text-[10px] text-amber-600 mt-2 flex items-start gap-1" data-testid="brain-disclaimer">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            {t('brain.disclaimer')}
          </p>
        )}
        {actions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid="brain-actions">
            {actions.map((a) => (
              <button key={a.key + a.to} onClick={() => msg.navigate(a.to)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">
                {t(a.key)} <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SUGGESTIONS = ['brain.q1', 'brain.q2', 'brain.q3', 'brain.q4', 'brain.q5', 'brain.q6'];

export default function NafaBrain() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dictating, setDictating] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const send = useCallback(async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setLoading(true);
    try {
      const r = await api.post('/customer/brain/chat', { message });
      const j = r.data;
      setMessages((m) => [...m, {
        role: 'brain', intent: j.intent, data: j.data,
        reply_key: j.reply_key, partial: j.partial,
        actions: j.actions || [], navigate,
      }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: errMsg(e, t('brain.failed')) }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, navigate, t]);

  const onDictate = async () => {
    if (dictating) return;
    if (!isDictationSupported()) {
      toast(t('search.voiceUnsupported'));
      return;
    }
    setDictating(true);
    try {
      const text = await dictate({ lang: `${lang}-IN` });
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
    } catch {
      toast(t('search.voiceFailed'));
    } finally {
      setDictating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)] animate-fadeInUp" data-testid="brain-page">
      <div className="mb-3">
        <h1 className="text-xl font-extrabold text-slate-800">{t('brain.title')}</h1>
        <p className="text-xs text-slate-500">{t('brain.sub')}</p>
      </div>

      {messages.length === 0 && (
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white" data-testid="brain-welcome">
          <Sparkles className="w-6 h-6 text-emerald-100" />
          <p className="text-sm font-bold mt-2">{t('brain.welcomeTitle')}</p>
          <p className="text-xs text-emerald-100 mt-1 leading-snug">{t('brain.welcomeSub')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((k) => (
              <button key={k} onClick={() => send(t(k))}
                className="px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-[11px] font-semibold text-white"
                data-testid={`brain-suggest-${k}`}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 py-3" role="log" aria-live="polite">
        {messages.map((m, i) => <BrainBubble key={i} msg={m} t={t} />)}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs" aria-busy="true">
            <Loader className="w-4 h-4 animate-spin" /> {t('brain.thinking')}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="sticky bottom-16 bg-slate-50 pt-2 pb-1 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          data-testid="brain-input"
          placeholder={t('brain.placeholder')}
          aria-label={t('brain.placeholder')}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        {isDictationSupported() && (
          <button
            type="button"
            onClick={onDictate}
            disabled={dictating}
            title={t('search.voiceDictation')}
            className={`p-3 rounded-xl border ${dictating ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-200 text-slate-500'}`}
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !input.trim()}
          data-testid="brain-send"
          className="p-3 rounded-xl bg-emerald-600 text-white disabled:opacity-40"
          aria-label={t('brain.send')}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
