# NafaMitra — Product Architecture

_Services, data model, calculation rules, and service-layer contracts for the 101-section upgrade. This document defines what every number means, where every entity lives, and which layers are allowed to talk to each other. It is the contract the implementation status doc (`nafamitra-implementation-status.md`) reports against._

---

## 1. Systems map

```
┌─────────────────────────────── Browser (PWA) ────────────────────────────────┐
│  Merchant SPA (src/pages/MerchantApp/*)      Customer SPA (customer/*)       │
│  Dashboard·Billing·Customers·Credit·Products  Home(माझा Nafa)·Search·Purchases│
│  Suppliers·Loyalty·Reports·Marketing·Staff    My Nafa·Account·Bills·Loyalty  │
│  Settings·VoiceAssistant·AIAssistant          (≤5 bottom tabs)               │
│           │ lib/api.js  (triple-channel: Authorization + X-Auth-Token        │
│           │              + nafamitra_token cookie, auto-refresh)             │
└───────────┼──────────────────────────────────────────────────────────────────┘
            ▼  same-origin proxy (scripts/serve.js / hosting) — never CORS
┌────────────────────────── FastAPI (backend/) ───────────────────────────────┐
│ auth_routes ── OTP (6-digit, rate-limited, generic errors) ── JWT HS256     │
│ deps: require_business · require_portal · require_role · resolve_shop_id    │
│ routes/: dashboard customer portal product sales udhaar supplier            │
│          loyalty voice assistant reports analytics admin                    │
│          + (new) requirements · notifications · favorites · actions         │
├────────────────────────── Service layer (growing) ──────────────────────────┤
│ SavingsService      — every customer-facing savings number, one definition  │
│ SegmentService      — deterministic segment rules (single source)           │
│ ActionsService      — Today's Actions: real-data rules + priority           │
│ MessageChannel      — compose/copy abstraction; NO delivery simulation      │
│ VoiceRequirementService — requirement capture interface (STT pluggable)     │
│ AiToolRegistry      — whitelisted, authenticated tools for AI (P2)          │
├──────────────────────── MongoDB (motor) ────────────────────────────────────┤
│ users · shops · shop_counters · customers(global) · invoices · invoice_items│
│ udhaar_accounts · udhaar_ledger · loyalty_accounts · loyalty_ledger         │
│ + NEW: requirements · customer_notifications · notification_prefs ·         │
│        favorites · shop_settings(व्यवस्था) · audit_log · offer_campaigns    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Rules:** all shop-scoped collections carry `shop_id` + mandatory `resolve_shop_id` guard; `customers` is global (UUID PK, never phone); ledgers are append-only; money is integer rupees end-to-end.

## 2. Data model — new & extended (non-breaking)

| Collection | Purpose | Key fields |
|---|---|---|
| `requirements` | Customer needs (माझ्या गरजा) + retailer view | `_id` uuid, `customer_id` (global), `customer_phone_norm`, `shop_id` (nullable = any-shop), `title`, `items[{name, qty, unit, approx_price}]`, `budget_paise→int ₹`, `need_by`, `category`, `voice_meta`, `status: open/matched/fulfilled/cancelled`, `retailer_notes`, `created_at/updated_at` |
| `customer_notifications` | In-app notification center | `customer_id`, `shop_id`, `category: transaction/benefit/reminder/requirement/shop/marketing`, `title_key`+`params` (i18n, not baked strings), `read_at`, `created_at` |
| `notification_prefs` | Per-customer consent | `customer_id`, `shop_id`, per-category `bool`, `marketing_consent: bool` (**default false**, separate from account) |
| `favorites` | Customer favorite shops | `customer_id`, `shop_id`, `created_at`, unique(`customer_id`,`shop_id`) |
| `offer_campaigns` | Merchant offers (P2) | `shop_id`, `segment`, `message_tpl`, `status: draft/confirmed`, confirmation audit |
| `audit_log` | Sensitive ops (P2) | `shop_id`, `actor_user_id`, `action`, `target`, `at` |
| `invoices` (ext) | — | + `return_of` / `RETURN` lines later (P3) |
| `products` (ext) | — | + `supplier_id`, `expiry_date` (both optional, P1) |
| `shop_settings` (ext) | — | + `dhanlabh_per_10` (default 10), `profit_guard`, `health_score_cfg` |

**Migration stance:** additive optional fields only; no destructive changes; ledger & invoice history never rewritten; entries logged in `MIGRATION_LEDGER.md`.

## 3. Savings calculation layer (single source of truth)

Implemented as `SavingsService` (backend) + `frontend/src/lib/savings.js` (display). Every UI number maps to exactly one of these; **no aggregation may sum overlapping categories**:

| Name | Definition | Source | Where allowed |
|---|---|---|---|
| **Loyalty earned** | `EARN` entries in loyalty ledger (1 ₹-value per `points_per_rupee` rule, per shop) | `loyalty_ledger` | Customer My Nafa, retailer धनलाभ card |
| **Loyalty redeemed** | `REDEEM` entries (negated) | `loyalty_ledger` | My Nafa |
| **Discount received** | `Σ bill.discount_amount` for customer's paid bills | `invoices` | My Nafa, bill history |
| **धनलाभ (Nafa value)** | `floor(loyalty_points_balance / dhanlabh_per_10)` ₹ — **only if shop enabled it** | `shop_settings.dhanlabh_per_10` | My Nafa (labeled "योग्यते अनुसार") |
| **Total savings shown** | `discount_received + loyalty_earned_value + (redeemed_value only if redeemed)` — each component displayed separately with label; **never** double-counts loyalty balance and earned | above | Home "माझा Nafa" summary |
| **Estimated Gross Margin** | `Σ(invoice.total_amount − invoice.total_cost)` for period, `is_void=false` | `invoices` | **Retailer only**; never the word "profit" unqualified |
| **Recorded cash flow** | Σ payments recorded in app — labeled "recorded", never "verified" | invoices + udhaar ledger | Reports |

"Not enough data" guard: analytics/comparison views render the empty state unless `bill_count ≥ 3` (or ≥ 2 periods each with ≥ 2 bills for comparisons).

## 4. Today's Actions — rule engine (ActionsService)

Each action: `{id, type, priority(1..4), reason_key, reason_params, target_url}` — reasons are i18n keys rendered in the merchant's language, evidence always from live collections:

| Rule | Trigger (real data) | Priority |
|---|---|---|
| `overdue_udhaar` | any udhaar `outstanding > 0 && due_date < today` | 1 |
| `low_stock` | `stock_quantity ≤ low_stock_threshold` (active products) | 2 |
| `winback` | customer `last_purchase_at < now−30d` AND historically ≥2 bills (never ghosts new customers) | 3 |
| `matching_requirement` | open `requirements` whose items match shop's product names/categories (token overlap, deterministic) | 2 |
| `expiring_stock` | `expiry_date` within 15 days | 1 |
| `no_sales_today` | zero invoices after 18:00 local | 4 |

No time-based heuristics without data; no action claims delivery — buttons navigate or copy.

## 5. Segment rules (SegmentService — mirrors `customer_routes.py:25`)

| Segment | Rule |
|---|---|
| `new` | exactly 1 lifetime bill |
| `repeat` | ≥2 bills |
| `high_value` | spend in top 15% of shop's customers (P90), min 3 bills |
| `credit_due` | any udhaar `outstanding > 0` |
| `inactive` | ≥1 old bill, none in last 30 days (win-back candidate) |
| `has_requirement` (new) | ≥1 `requirements` with `status=open` for this customer |

Rules are deterministic, server-computed, and shown to the retailer as text next to the filter.

## 6. Customer app information architecture (≤5 tabs)

```
Home (माझा Nafa)   → wallet numbers (SavingsService), recent bills, offers slot (P2)
Search (मला हवे)    → requirement composer (text/voice-service) + shop results
Purchases           → bill history + Reorder→requirements draft (no fake orders)
My Nafa             → loyalty ledger, धनलाभ value, benefits facts, savings breakdown
Account             → profile, credit balance+history, notifications, favorites,
                      language, marketing consent, privacy controls, logout
```

Merchant nav unchanged (no duplicates): Credit keeps `/credit`; old `/udhaar` stays a redirect.

## 7. AI & voice boundaries

- **Merchant assistant** (`assistant_routes`): chat over a server-built context; context builder must read **current** collections (`invoices`, `shop_id`). P2: answers execute nothing — write actions go through `AiToolRegistry` (whitelist: read summaries, list low stock, list due udhaar) with user confirmation; never raw query generation.
- **Voice** (`voice_routes`): `transcribe` (browser STT upload) → `understand` (LLM intent or honest fallback that **states no AI key configured and executes nothing**) → `execute` (validated intents only, same permissions as the caller). Demo intents with fabricated names/amounts are removed.
- **Voice requirements (customer)**: `VoiceRequirementService.transcribe() → RequirementDraft` interface; browser `SpeechRecognition` is labeled as dictation, not AI.
- **Never**: simulated WhatsApp/email/SMS delivery, fabricated numbers, model-generated SQL.

## 8. MessageChannel (WhatsApp-ready, honest now)

```
compose(template, params, shop, customer) → {text}        # deterministic
UI: "संदेश कॉपी करा" + shows intended recipient             # no send claim
send() — NOT implemented; P3 slot behind same interface    # integration point
```

## 9. Retail health score (P2, internal, documented)

0–100 weighted: sales trend (30) + margin stability (25) + credit collected % (20) + stock freshness (15) + repeat-customer rate (10). Displayed as a gauge with formula tooltip; never sold as a guarantee.

## 10. Quality gates (run after every phase)

| Gate | Command | Baseline |
|---|---|---|
| Backend unit/API | `pytest -q` (venv) | 22 passed |
| E2E journey | `node scripts/journey_smoke.js` (backend+preview up) | 69/69 |
| Login E2E | `node scripts/login_e2e.js` | PASS |
| Render smoke | `SMOKE_URL=… node scripts/render_smoke.js` | PASS |
| i18n completeness | `node scripts/i18ncheck.js` (babel) | 43/43, 357 keys ×3 |
| Build | `yarn build` | exit 0 |

## 11. Explicit non-goals (anti-overbuild)

GST suite, payroll, accounting ERP, ecommerce checkout, insurance claims, delivery logistics, payment gateway settlement — all out of MVP. Deferred capabilities (returns UI, referrals, warranty, purchase planner, geo-neighborhood, owner mode) ship as foundations or not at all, and are listed with rationale in the implementation status doc.
