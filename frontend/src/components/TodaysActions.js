import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, ChevronRight, Loader, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { useI18n } from '@/i18n';

const PRIORITY_STYLE = {
  1: 'bg-red-50 border-red-200 text-red-700',
  2: 'bg-amber-50 border-amber-200 text-amber-700',
  3: 'bg-blue-50 border-blue-200 text-blue-700',
  4: 'bg-slate-50 border-slate-200 text-slate-600',
};

/**
 * Today's Actions — real-data rules from GET /retailer/actions.
 * Reasons render via i18n reason_key + params; buttons only navigate
 * (never claim a message was sent).
 */
export default function TodaysActions({ compact = false }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [actions, setActions] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/retailer/actions')
      .then(({ data }) => { if (alive) setActions(data.actions || []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null; // card hides itself — dashboard stays truthful

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid="todays-actions">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-700">{t('action.todaysActions')}</h2>
        </div>
        {actions && actions.length > 0 && (
          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{actions.length}</span>
        )}
      </div>

      {actions === null && (
        <div className="flex justify-center py-4 text-slate-300" aria-busy="true">
          <Loader className="w-4 h-4 animate-spin" />
        </div>
      )}

      {actions !== null && actions.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <p className="text-xs font-semibold text-emerald-700">{t('action.noActions')}</p>
        </div>
      )}

      {actions !== null && actions.length > 0 && (
        <div className={`space-y-2 ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
          {actions.map((a) => (
            <button key={a.id} onClick={() => navigate(a.target)}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition hover:shadow-sm ${PRIORITY_STYLE[a.priority] || PRIORITY_STYLE[4]}`}
              data-testid={`action-${a.type}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-snug">{t(a.reason_key, a.params || {})}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-70">
                  {a.priority === 1 ? t('action.priorityHigh') : a.priority === 2 ? t('action.priorityMedium') : t('action.priorityLow')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
