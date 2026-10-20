/**
 * Savings calculation layer — the ONLY place customer-facing savings
 * numbers are computed. Mirrors backend SavingsService definitions
 * (docs/nafamitra-product-architecture.md §3).
 *
 * Rules:
 *  - everything is integer paise; no float money math.
 *  - components never overlap: discount received comes from bills,
 *    loyalty earned from the loyalty ledger (EARN), redeemed from REDEEM,
 *    धनलाभ value from the CURRENT points balance (never added to
 *    "earned" in the same total — shown as eligibility, not cash).
 *  - "not enough data": billCount < MIN_BILLS ⇒ analytics compare blocked.
 */

export const MIN_BILLS_FOR_ANALYTICS = 3;

/** Sum of per-bill discounts actually given (paid, non-void). Bills: [{discount_paise|discount, is_void, status}] */
export function discountReceivedPaise(bills) {
  return (bills || []).reduce((sum, b) => {
    if (b.is_void || b.status === 'VOID') return sum;
    const d = b.discount_paise != null ? b.discount_paise : 0;
    return sum + Math.max(0, Math.round(d));
  }, 0);
}

/**
 * Loyalty value earned/redeemed over a period.
 * ledgers: [{type: 'EARN'|'REDEEM'|'REVERSAL'|'ADJUSTMENT', points, value_paise?}]
 * REVERSAL points are subtracted from earned (they cancel an EARN).
 */
export function loyaltyLedgerTotals(txs) {
  let earned = 0;
  let redeemed = 0;
  for (const tx of txs || []) {
    const pts = Math.round(tx.points || 0);
    if (tx.type === 'EARN') earned += pts;
    else if (tx.type === 'REVERSAL') earned -= pts;
    else if (tx.type === 'REDEEM') redeemed += pts;
  }
  return { earnedPoints: Math.max(0, earned), redeemedPoints: Math.max(0, redeemed) };
}

/**
 * धनलाभ → ₹ eligibility from a points balance.
 * rate: rupees-per-10-points configured by the shop (default 10 → ₹1).
 * Returns 0 when the shop has not configured it — never invents value.
 */
export function dhanlabhValuePaise(pointsBalance, per10Rupees) {
  const per = Math.max(1, Math.round(per10Rupees || 10));
  const pts = Math.max(0, Math.round(pointsBalance || 0));
  return Math.floor(pts / per) * 100;
}

/**
 * Headline savings for the Home/My Nafa cards.
 * total = discountReceived + loyaltyEarnedRupees (ledger value).
 * धनलाभ value is reported separately as "eligible", NOT inside total.
 */
export function computeSavings({ bills, loyaltyTxs, redemptionValuePaise, pointsBalance, dhanlabhPer10 }) {
  const billCount = (bills || []).filter((b) => !b.is_void && b.status !== 'VOID').length;
  const discount = discountReceivedPaise(bills);
  const { earnedPoints } = loyaltyLedgerTotals(loyaltyTxs);
  const loyaltyEarnedValue = earnedPoints * Math.max(0, Math.round(redemptionValuePaise || 0));
  return {
    billCount,
    discountReceivedPaise: discount,
    loyaltyEarnedValuePaise: loyaltyEarnedValue,
    totalSavingsPaise: discount + loyaltyEarnedValue,
    dhanlabhEligiblePaise: dhanlabhValuePaise(pointsBalance, dhanlabhPer10),
    hasEnoughData: billCount >= MIN_BILLS_FOR_ANALYTICS,
    minBills: MIN_BILLS_FOR_ANALYTICS,
  };
}

/** Sum of bill totals in paise for a set (active only). */
export function totalSpentPaise(bills) {
  return (bills || []).reduce((sum, b) => {
    if (b.is_void || b.status === 'VOID') return sum;
    const v = b.total_paise != null ? b.total_paise : 0;
    return sum + Math.max(0, Math.round(v));
  }, 0);
}

/** Period comparison: current vs previous window by ISO date prefix. */
export function comparePeriods(bills, now = Date.now()) {
  const day = 86400000;
  const currentStart = now - 30 * day;
  const previousStart = now - 60 * day;
  const current = [];
  const previous = [];
  for (const b of bills || []) {
    if (b.is_void || b.status === 'VOID') continue;
    const ts = Date.parse(b.created_at || b.date || '');
    if (Number.isNaN(ts)) continue;
    if (ts >= currentStart) current.push(b);
    else if (ts >= previousStart) previous.push(b);
  }
  const enough = current.length >= MIN_BILLS_FOR_ANALYTICS
    && previous.length >= MIN_BILLS_FOR_ANALYTICS;
  const cur = totalSpentPaise(current);
  const prev = totalSpentPaise(previous);
  const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  return {
    currentPaise: cur,
    previousPaise: prev,
    currentCount: current.length,
    previousCount: previous.length,
    deltaPct,
    enoughData: enough,
    minBills: MIN_BILLS_FOR_ANALYTICS,
  };
}
