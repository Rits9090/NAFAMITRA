import api from './api';

/**
 * First-party activation analytics. Fire-and-forget: never throws, never
 * blocks UI, never sends PII beyond the authenticated session itself.
 * Events land in the shop's own /analytics/events log (owners can view them)
 * so pilot metrics are real, not a vanity counter.
 */
export function track(event, props = {}) {
  try {
    api.post('/analytics/events', { event, props }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

export const ACTIVATION = {
  LOGIN: 'login',
  ONBOARDING_SHOP: 'onboarding_shop_created',
  ONBOARDING_CUSTOMER: 'onboarding_customer_created',
  FIRST_BILL: 'bill_created',
  CUSTOMER_CREATED: 'customer_created',
  LANGUAGE_CHANGED: 'language_changed',
  QR_SCANNED: 'customer_qr_scanned',
  RECEIPT_SHARED: 'receipt_shared',
};
