import React from 'react';
import { useI18n } from '@/i18n';
import { track, ACTIVATION } from '@/lib/analytics';

/** Shared language switcher (was exported from the old auth page). */
export default function LanguageSwitcher({ compact = false }) {
  const { lang, setLang, languages } = useI18n();
  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`} role="group" aria-label="Language">
      {languages.map((l, i) => (
        <React.Fragment key={l.code}>
          {i > 0 && <span className="text-slate-300 text-xs">|</span>}
          <button
            type="button"
            onClick={() => { if (l.code !== lang) track(ACTIVATION.LANGUAGE_CHANGED, { lang: l.code }); setLang(l.code); }}
            aria-pressed={lang === l.code}
            className={`text-xs font-semibold px-1.5 py-1 rounded transition-colors ${
              lang === l.code ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {l.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
