import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import mr from './mr';
import en from './en';
import hi from './hi';

const DICTS = { mr, en, hi };
const STORAGE_KEY = 'nafamitra_lang';
const DEFAULT_LANG = 'mr';

const I18nContext = createContext({
  // Safe default: if the provider is missing, render the key instead of
  // crashing with "t is not a function".
  t: (key) => key,
  lang: DEFAULT_LANG,
  setLang: () => {},
  languages: [
    { code: 'mr', label: 'मराठी' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
  ],
});

function resolve(dict, key, vars) {
  const parts = key.split('.');
  let value = dict;
  for (const p of parts) {
    value = value && value[p];
    if (value === undefined || value === null) return null;
  }
  if (typeof value !== 'string') return null;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) =>
    vars[name] !== undefined ? String(vars[name]) : m);
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DICTS[saved]) return saved;
    } catch { /* ignore */ }
    return DEFAULT_LANG;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
    document.body.classList.remove('lang-mr', 'lang-en', 'lang-hi');
    document.body.classList.add(`lang-${lang}`);
  }, [lang]);

  const setLang = useCallback((next) => {
    if (DICTS[next]) setLangState(next);
  }, []);

  const t = useCallback((key, vars) => {
    const dict = DICTS[lang] || DICTS[DEFAULT_LANG];
    return resolve(dict, key, vars) ?? resolve(DICTS.en, key, vars) ?? key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, languages: [
    { code: 'mr', label: 'मराठी' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
  ] }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export default I18nContext;
