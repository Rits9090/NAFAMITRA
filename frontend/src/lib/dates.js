/** Locale-aware date helpers — never render English month names when the
 * user picked Marathi/Hindi (spec §48). All display dates flow through here. */
import { LANG_LOCALES } from '@/i18n';

const DEFAULT = 'en-IN';

function localeFor(lang) {
  return LANG_LOCALES[lang] || DEFAULT;
}

/** 4 Oct 2026 (or locale month name) */
export function shortDate(iso, lang = DEFAULT) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 4 Oct (no year) */
export function dayMonth(iso, lang = DEFAULT) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short' });
}

/** Saturday, 4 October 2026 */
export function longDate(date, lang = DEFAULT) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(localeFor(lang), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** 4 Oct 2026, 14:05 */
export function dateTime(iso, lang = DEFAULT) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return d.toLocaleString(localeFor(lang), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
