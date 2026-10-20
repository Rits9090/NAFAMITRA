/**
 * Brand / support configuration helpers.
 * Support contact comes from the server (SUPPORT_WHATSAPP_NUMBER / SUPPORT_EMAIL)
 * and is hidden entirely when not configured — never show a fake number.
 */
import { fetchConfig } from './api';

export const BRAND = {
  name: 'NafaMitra',
  tagline: 'ग्राहक वाढवा, नफा वाढवा!',
  taglineEn: 'Grow Customers. Grow Profit.',
  meaning: 'Nafa = profit · Mitra = trusted business companion',
};

export const APP_VERSION = process.env.REACT_APP_VERSION || '1.0.0';

// Optional deployment-injected support number. Empty ⇒ the support action is
// hidden entirely (never show a fake number). The server config is the source
// of truth and is preferred via whatsappSupportHref(getConfig()).
export const SUPPORT_WHATSAPP = (process.env.REACT_APP_SUPPORT_WHATSAPP || '').trim();

let cached = null;

export async function getConfig() {
  if (!cached) cached = await fetchConfig();
  return cached;
}

export function whatsappSupportHref(config) {
  const support = config?.support;
  if (!support?.enabled || !support.whatsapp_number) return null;
  const digits = String(support.whatsapp_number).replace(/\D/g, '');
  const withCode = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${withCode}`;
}
