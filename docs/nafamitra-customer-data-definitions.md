# NafaMitra — Customer Data Definitions

_Canonical definitions for every customer-facing metric introduced by the customer-upgrade spec. Prevents different developers (and different screens) from interpreting the same number differently. All money is **integer paise** computed server-side; UI formats with `fmt()`._

## Identity

| Term | Definition | Source |
|---|---|---|
| **Authenticated identity** | One `users` row (UUID `id`, `phone_normalized`). Same phone = same person, always. | `backend/identity.py`, `auth_routes.verify_otp` |
| **Customer ID (`NM-XXXXXX`)** | Human-readable, **immutable** secondary identifier on the `customers` row. Never a primary key; phone is never a primary key. Survives profile edits, role changes, language switches. | `customers.nm_id`, unique sparse index |
| **Dual role** | One identity holding a customer profile **and** shop membership(s). Entry journey (owner vs customer card) decides the first destination; the switcher moves between contexts without logout. No second account is ever created. | `identity_resolution` → `kind: both` |

## Transactions & spending

| Term | Definition | Source label |
|---|---|---|
| **Verified transaction** | An `invoices` document with `status: 'ACTIVE'` created by a NafaMitra partner shop for this customer. Voided invoices are excluded everywhere. | _Verified NafaMitra data_ |
| **Known NafaMitra spending** | Sum of `total_paise` over the customer's ACTIVE invoices **in the current calendar month**, across shops linked via `shop_customers`. Returned as `known_spending` with `partial: true` always. **Never** presented as "total spending". | _NafaMitra recorded_ |
| **Category of a bill line** | `products.category` of the line's `product_id` (merchant-defined). Quick-sale lines (no product) fall into `other`. | — |
| **Customer-added expense** | A `customer_expenses` row entered by the customer (`source: 'customer_added'`, `verification: 'customer_entered'`). Soft-deleted (`deleted_at`), never hard-deleted, never mixed into verified totals. | _Added by you_ |
| **Manual store purchase** | `my_stores.purchase_amount_paise` + `purchase_date` — the customer's own record of an off-platform purchase. Shown only in the "Your own record" block. | _Added by you_ |

## Savings & benefits

| Term | Definition |
|---|---|
| **Discount received** | Σ `discount_paise` on the customer's ACTIVE invoices in the period. |
| **धनलाभ earned value** | Σ (points earned per shop in period) × (that shop's `redemption_value_paise`). Per-shop conversion only — never a universal rate, never merged across shops for redemption. |
| **Recorded savings (total)** | `discountReceived + loyaltyEarnedValue` (`frontend/src/lib/savings.js`). Components shown separately; no double-counting; "eligible but unredeemed" value shown as a separate line, not added in. |
| **Saving progress (month)** | `discounts this month + loyalty value earned this month` — a measure of **recorded benefits**, compared against the customer's `saving_target_paise`. Wording: "Recorded … toward your target", never "you have saved". |
| **Benefit (generic)** | Any measurable, recorded reduction in what the customer paid (discount) or recorded value they can redeem at its own shop (धनलाभ). No speculative benefits. |

## Goals & targets

| Term | Definition |
|---|---|
| **Goal** | Customer-entered tracking record: `name`, `target_paise`, `progress_paise`, optional `monthly_target_paise`. Progress % = `min(progress, target×10) / target × 100`. **NafaMitra does not hold money** — UI always says "Tracking record — not held by NafaMitra". |
| **Monthly saving target** | `customer_settings.saving_target_paise` — customer-defined. System reports `recorded / target` and the gap; it never gives financial advice or infers bank balances. |

## My Stores

| Term | Definition |
|---|---|
| **My Store** | A `my_stores` row: customer's personal shopping-map entry (`customer_id`, name, optional phone/category/recent purchase/notes). Private to the customer. |
| **State: Added** | `matched_shop_id = null` — customer-entered only. Not a partner. |
| **State: Connected** | `matched_shop_id` set **by explicit customer confirmation** of a suggestion (phone match or already-linked shop). Name similarity alone never connects. |
| **Verified store metrics** | From this customer's `shop_customers` link + ACTIVE invoices + `loyalty_accounts` for that shop: `total_spend_paise`, `purchase_count`, `discount_paise`, `dhanlabh_points`, `last_purchase_at`. Shown only in the verified block. |
| **Partner store** | A `businesses` row (NafaMitra merchant). "NafaMitra partner found" = deterministic candidate (phone or linked-shop name), always requires tap-to-confirm. |
| **Customer demand signal** | Aggregate count only: distinct customers with a `my_stores` row matching a shop (by `matched_shop_id` or owner phone). `scope: 'aggregate_only'` — no names, phones, spending, goals, or history ever leave the aggregate. |

## Entitlements

| Term | Definition |
|---|---|
| **Entitlement** | Row in `entitlements`: `customer_id`, `code`, `feature`, `source`, `starts_at`, `expires_at`, `status`. Backend decides active state on every read; frontend never gates on local state. |
| **Rule `stores5_30d_free`** | ≥5 non-deleted My Stores → one-time grant of `premium_stores5_30d` (30 days). Idempotent via unique `(customer_id, code)` — a claim can never fire twice. No payment implied. |

## Nafa Brain

| Term | Definition |
|---|---|
| **Nafa Insight** | Deterministic observation computed from recorded data with an explicit reason: `top_category` (this month), `category_trend` (vs previous month, needs data in both), `first_period` (no comparison yet), `no_data`. Never generated when unsupported. |
| **Nafa Brain answer** | `intent → whitelisted tool → structured result → localized template`. Profiles come from the token only; the message can never address another customer. Money answers carry `partial: true` + the disclosure line whenever data is incomplete (always, for spending). |
| **Nafa Action** | A suggested **navigation** target (view bills, add goal, add requirement). Never auto-executes purchases, orders, or payments. |
| **Reminder (recurring purchase)** | _Deferred:_ purchase-frequency suggestions are not shipped yet; when they are, language must express uncertainty ("you may be due"), never certainty. |

## Privacy classes

| Class | Contains | Visible to retailer? |
|---|---|---|
| **Customer-private** | goals, saving target, budgets, customer-added expenses, Brain chat, My Stores list, cross-shop spending | **Never** |
| **Shop-relationship** | that shop's bills, धनलाभ, credit, requirements shared with them, marketing consent | Only that shop, server-enforced |
| **Public/discoverable** | shop name, category, address/location | Yes |

## Label set (used verbatim in UI)

1. **Verified NafaMitra data** — invoice/link-derived.
2. **Added by you** — customer-entered (expenses, manual stores).
3. **NafaMitra recorded** — aggregate known spending (implies partial coverage).
4. **Tracking record** — goals/targets (no money held).
5. **Suggested** — system proposals (partner match, insight) requiring customer confirmation.
