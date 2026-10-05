import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import mr from './mr';
import en from './en';
import hi from './hi';

const DICTS = { mr, en, hi };
const STORAGE_KEY = 'nafamitra_lang';
const DEFAULT_LANG = 'mr';

// For date/number rendering — keeps month names in the chosen language.
export const LANG_LOCALES = { mr: 'mr-IN', en: 'en-IN', hi: 'hi-IN' };

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

// Module-level current language — lets NON-React code (error mapping in
// lib/api.js) resolve the same localized keys without a React context.
let currentLang = DEFAULT_LANG;
export function getCurrentLang() { return currentLang; }

/** Localized lookup for non-React modules (returns null when missing). */
export function tStatic(key, vars) {
  const dict = DICTS[currentLang] || DICTS[DEFAULT_LANG];
  return resolve(dict, key, vars) ?? resolve(DICTS.en, key, vars) ?? null;
}

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
      if (saved && DICTS[saved]) { currentLang = saved; return saved; }
    } catch { /* ignore */ }
    currentLang = DEFAULT_LANG;
    return DEFAULT_LANG;
  });

  useEffect(() => {
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
    document.body.classList.remove('lang-mr', 'lang-en', 'lang-hi');
    document.body.classList.add(`lang-${lang}`);
  }, [lang]);

  const setLang = useCallback((next) => {
    if (DICTS[next]) { currentLang = next; setLangState(next); }
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
