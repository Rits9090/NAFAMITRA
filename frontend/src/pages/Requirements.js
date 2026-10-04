import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Loader, CheckCircle2, StickyNote, Users, Filter } from 'lucide-react';
import { toast } from 'sonner';
import api, { errMsg } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmt } from '@/lib/money';

const STATUS_META = {
  open: { labelKey: 'reqm.stOpen', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  matched: { labelKey: 'reqm.stMatched', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  fulfilled: { labelKey: 'reqm.stFulfilled', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { labelKey: 'reqm.stCancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/** Retailer view of customer requirements — demand signal, no fake ordering. */
export default function Requirements() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('open');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/requirements/shop/list', {
        params: filter === 'all' ? {} : { status: filter },
      });
      setRows(data.requirements || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markMatched = async (id) => {
    setBusy(id);
    try {
      await api.patch(`/requirements/shop/${id}`, {
        status: 'matched',
        retailer_notes: (notes[id] || '').trim() || undefined,
      });
      toast.success(t('reqm.matchedToast'));
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const saveNotes = async (id) => {
    setBusy(id);
    try {
      await api.patch(`/requirements/shop/${id}`, { retailer_notes: (notes[id] || '').trim() });
      toast.success(t('reqm.notesSaved'));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const filters = [
    { id: 'open', label: t('reqm.filterOpen') },
    { id: 'matched', label: t('reqm.filterMatched') },
    { id: 'all', label: t('reqm.filterAll') },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeInUp" data-testid="merchant-requirements">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800" style={{ fontFamily: 'Outfit,sans-serif' }}>{t('reqm.title')}</h1>
        <p className="text-sm text-slate-500">{t('reqm.sub')}</p>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filter === f.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12 text-slate-400" aria-busy="true"><Loader className="w-5 h-5 animate-spin" /></div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={load} className="ml-3 font-semibold underline">{t('common.retry')}</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-12 text-center" data-testid="reqm-empty">
          <ClipboardList className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 mt-2">{t('reqm.empty')}</p>
          <p className="text-xs text-slate-400 px-10">{t('reqm.emptySub')}</p>
        </div>
      )}

      {!loading && !error && rows.map((r) => {
        const meta = STATUS_META[r.status] || STATUS_META.open;
        return (
          <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2.5" data-testid="reqm-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{r.customer_name || r.customer_nm_id || t('reqm.customer')}</p>
                  <p className="text-[10px] text-slate-400">{r.customer_nm_id || ''} · {shortDate(r.created_at, lang)}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>{t(meta.labelKey)}</span>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700">{r.title}</p>
              {r.items?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {r.items.map((it, i) => (
                    <li key={i} className="text-xs text-slate-500">• {it.name} × {it.qty}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs font-semibold text-emerald-700 mt-1">
                {r.budget_paise ? `${t('reqm.budget')} ${fmt(r.budget_paise)}` : ''}
              </p>
            </div>

            <div className="flex gap-2">
              <input value={notes[r.id] ?? r.retailer_notes ?? ''}
                onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                placeholder={t('reqm.notesLabel')}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              <button onClick={() => saveNotes(r.id)} disabled={busy === r.id}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {t('common.save')}
              </button>
            </div>

            {r.status === 'open' && (
              <button onClick={() => markMatched(r.id)} disabled={busy === r.id}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60"
                data-testid="reqm-match">
                {busy === r.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {t('reqm.match')}
              </button>
            )}
            {r.status === 'matched' && r.retailer_notes && (
              <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <StickyNote className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
                <p className="text-[11px] text-amber-800">{r.retailer_notes}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
