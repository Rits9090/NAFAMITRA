# NafaMitra — Feature Gap Audit

_Built from a full code inspection of this repository (backend routes, models, frontend pages, i18n, tests) against the 101-section product upgrade specification. Status vocabulary:_

| Status | Meaning |
|---|---|
| ✅ **EXISTING** | Working feature found in code with real data flow |
| 🔧 **EXISTING_NEEDS_POLISH** | Works but UX, copy, i18n, or edge-case gaps |
| ⚠️ **PARTIAL** | Some sub-capabilities exist, others missing |
| ❌ **BROKEN** | Implemented incorrectly or fakes behavior |
| ➕ **MISSING** | Not present anywhere |
| ♻️ **DUPLICATE** | Overlapping surface found — must consolidate, not add |
| 🧠 **FUTURE** | Deferred to a later phase (honest dependency) |

**Legend for locations:** backend router names are modules under `backend/routes/`; frontend pages under `frontend/src/pages/`; translations in `frontend/src/i18n/{mr,en,hi}.js` (357 keys ×3, gated by `i18ncheck`).

---

## 1. Platform & Identity (spec §1–20)

| # | Requirement | Status | Location / evidence | Action |
|---|---|---|---|---|
| 1 | Production-quality MVP via audit→stabilize→refactor→improve→test→polish | ✅ | This doc + `docs/nafamitra-product-architecture.md`; gates: pytest 22, journey_smoke 69, login_e2e, render_smoke, babel i18n | Continue; status doc at end |
| 2 | NafaMitra branding, tagline mr/en/hi | ✅ | `src/App.js` title, `LoginPage` hero, i18n `brand_tagline*` keys | — |
| 3 | Marathi-first i18n mr/en/hi, persisted, centralized | ⚠️ | `src/i18n/{mr,en,hi}.js` + `LanguageContext`; **primary surfaces translated; ~10 secondary pages (Products, Suppliers, Staff, Marketing, Loyalty, VoiceAssistant, Reports settings…) contain hardcoded English literals** | P1: key sweep + i18ncheck extension |
| 4 | Single-entry phone→OTP login, role discovery, shop/customer switcher | ✅ | `auth_routes.py::send_otp/verify_otp`; `LoginPage` + `SwitchMode` (🏪/👤); token triple-channel fix `d57cc13` | — |
| 5 | Dual-identity: same phone = one user, merchant + customer roles | ✅ | `models.User` roles[]; verify returns `merchant/customer/both`; `onboarding` per role | — |
| 6 | Global customer identity, UUID PK, normalized phone, NM-XXXXXX | ✅ | `models.CustomerModel` UUID PK, `normalized_phone`, `NM-` code; phone never PK (spec violation fixed earlier) | — |
| 7 | Role-based app shell (merchant vs customer routes) | ✅ | `src/App.js` role-gated routes; `require_business`/`require_portal` | — |
| 8 | Opaque customer QR | ✅ | `qr.png` static QR from `customer_id`; `CustomerQR.jsx` | — |
| 9 | No fake features (OTP, WhatsApp, payments, analytics) | ❌→🔧 | **`Marketing.js:30` shows "Campaign sent! (Demo mode)" — fake send**; `voice_routes.py::understand` fallback returns fabricated intents (hardcoded "Ramesh ₹500 bill") when `EMERGENT_LLM_KEY` absent (no `.env` present) | P0: replace Marketing demo with honest compose+copy flow; voice fallback must state it didn't execute |
| 10 | PWA + mobile-first viewport matrix 360×800→1440×900 | ⚠️ | `manifest.json`, `service-worker.js` registered; layouts are responsive but **no documented viewport test matrix** | P2: document matrix in status doc; verify key breakpoints |
| 11 | Login as value card (trust, what-you-get) | 🔧 | LoginPage lists benefits | Polish with pilot numbers |
| 12 | Minimal merchant onboarding | ✅ | `Onboarding.js`, `POST /auth/onboarding` (shop name/city only) | — |
| 13 | No hardcoded support numbers / universal loyalty rule | ✅ | No support numbers; loyalty rate per-shop (`loyalty_rewards.py`) | — |

## 2. Auth & Security (§21–35)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 14 | Token transport survives hosting proxy (401 bug) | ✅ | `auth.py::_extract_token` (Bearer / `X-Auth-Token` / cookie) + `lib/api.js` interceptor + `syncTokenCookie`; commit `d57cc13` | Regression-guarded by journey_smoke |
| 15 | Strict multi-tenancy, server-enforced shop isolation | ✅ | `resolve_shop_id` scopes every query by `shop_id` (`ownership.py`); journey_smoke cross-shop 403 checks | P2: audit remaining routes for ownership leak |
| 16 | OTP security (rate limits, expiry, generic errors) | ✅ | `auth_routes.py::check_rate_limit`, 6-digit OTP, generic error messages, OTP only in dev log | — |
| 17 | No service-role keys / JWT secrets exposed | ✅ | Server-side `.env` only; `.env.example` has placeholder; tests use env overrides | — |
| 18 | IDOR / role-escalation protection | ⚠️ | `require_business` + `resolve_shop_id` pattern; **not yet formally tested per-route** | P2: security test suite (unauthorized→403) |
| 19 | Audit log for sensitive operations | ➕ | None | P2: `audit_log` collection on password/role/delete/void ops |
| 20 | Never logout on language switch | ✅ | LanguageContext only sets `localStorage.nafamitra_lang` | Guarded by i18n test |

## 3. Money & Ledger Integrity (§36–50)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 21 | Integer minor-unit money everywhere | ✅ | All models `int` rupees + `Math.round` client-side; `_clean` in routes | — |
| 22 | Atomic + idempotent bill creation (client_uuid) | ✅ | `sales_routes.py::create_invoice` — unique index `shop_id+client_uuid`, `try/except DuplicateKeyError → return existing` | P0: atomicity already OK; add bill-level `$set` in tx |
| 23 | Concurrency-safe invoice numbering (no count+1) | ✅ | `counters` collection + `find_one_and_update $inc` + fallback scan with 401/409 | — |
| 24 | Void ≠ return; void creates reversals (stock+loyalty+udhaar) | ✅ | `sales_routes.py::void_invoice`, `void_ref_no` idempotency | — |
| 25 | Credit ledger (CREDIT/PAYMENT/REVERSAL/ADJUSTMENT), no hard delete | ✅ | `udhaar_routes.py` ledger ops + `add_ledger_entry` | — |
| 26 | Loyalty ledger (EARN/REDEEM/REVERSAL/ADJUSTMENT), no hard delete | ✅ | `loyalty_routes.py` ledger ops | — |
| 27 | No hard deletes on financial records | ✅ | Soft-delete (`is_active`, `is_void`); tests cover | — |
| 28 | No float/JS money math | ✅ | Integer-only; `Math.round` at boundaries | Keep in review checklist |
| 29 | Profit floor (min_selling_price) enforcement | ✅ | `ProductCreate.min_selling_price`; billing blocks below-cost unless override | — |
| 30 | Floor-price warning ≠ block (configurable) | 🔧 | Warning exists; no per-shop config toggle | P2: `shop_settings.profit_guard` |
| 31 | Bill idempotency across retries/offline | ✅ | `client_uuid` unique index; `InvoiceRetry` test | P2: offline queue retry (client) |

## 4. Merchant App — Billing & Sales (§51–70)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 32 | Quick + itemized billing | ✅ | `Billing.js` (chip grid, itemized, udhaar toggle) | — |
| 33 | Billing customer-context panel (history/credit/loyalty at point of sale) | ➕ | Billing.js has customer picker only | **P1: context panel component** |
| 34 | Dashboard with today's sales/margin/customers/credit | ✅ | `dashboard_routes.py::summary`, `Dashboard.js` (₹ summary, udhaar, low stock) | P1: rename profit→"Estimated Gross Margin" + धनलाभ card |
| 35 | Digital bills (auto, print, no fake WhatsApp) | ✅ | `PublicReceipt.js` public URL + print CSS; no WhatsApp send anywhere else | — |
| 36 | Reports: sales/profit reports with drill actions | ⚠️ | `Reports.js` has hourly/7-day/30-day/ABC + inventory + collection | P2: add "View bills" action links + margin wording |
| 37 | MoM comparison | ➕ | `analytics_routes.py` has simple deltas (`pct`) for KPIs only | P2: month-over-month in Reports |
| 38 | Dead stock (अडकलेला पैसा) | ➕ | None (inventory has `days_to_sellout` only) | P1: dead-stock card = stock×cost, no-sale 30d |
| 39 | Discount leakage tracking | ⚠️ | `discount_amount` on invoice; `discount_leakage` seeded test only | P2: report line (discount ₹, % bills, ΔPvD) |
| 40 | Returns (separate from void) | ⚠️ | `RETURN` entry type exists in sales model; **no route/UI** | P3 (future-ready, needs per-item return workflow) |
| 41 | Void via UI | ⚠️ | `void_invoice` route exists; **UI only in test** | P1: RecentBills void action + confirm |
| 42 | Server-side search + debounce for products/customers | ⚠️ | Backend `q` params exist; frontend uses local `useMemo` filter | P2: switch heavy lists to server search w/ 250ms debounce |

## 5. Customers & CRM (§71–85)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 43 | Customer directory w/ search & filters | ✅ | `Customers.js`, `GET /customers` (`q`, segment filter) | — |
| 44 | Customer-360 derived-not-duplicated | ✅ | `customer_routes.py::get_customer` aggregates bills/credit/loyalty/purchases | — |
| 45 | Segments with transparent deterministic rules | ⚠️ | `customer_routes.py:25` `SEGMENTS`: new/repeat/high_value/credit_due/inactive (rules in `segments()` fn) — **"Requirement" segment missing; UI filter shows only 3** | P1: add `has_requirement` rule after requirements entity; show all segments in UI |
| 46 | Win-back flow with copy-template (no fake send) | ➕ | None (Marketing.js is the fake) | P1: win-back action card w/ copyable message |
| 47 | CRM: notes/tags/next follow-up | ➕ | `notes` exists on customer model (billing use); no timeline/follow-up | P2: customer notes timeline + follow_up fields |
| 48 | Requirements (माझ्या गरजा) customer entity | ➕ | **No `requirements` collection/route/UI anywhere** | **P1: full model+routes+customer UI+retailer view** |
| 49 | Problem/CRM workflow (माझ्या समस्या) | ➕ | None | P2 |
| 50 | Favorite shops per customer | ➕ | None (customer sees one shop via portal) | P1: `favorites` collection + heart toggle |
| 51 | Notification center (6 categories, marketing separately toggleable) | ➕ | None (`notifications` collection absent) | P1: collection + per-customer prefs + in-app center |
| 52 | Marketing consent separate from account | ➕ | No consent fields | P1 with notifications |
| 53 | Referrals (anti-abuse) | ➕ | None | P3 |
| 54 | Purchase history + Reorder → shopping list (no fake orders) | ⚠️ | Purchases derived per bill; no reorder | P1: Reorder adds items to a requirements/shopping-list draft |

## 6. Customer App (§86–105)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 55 | Customer app routes + role gating | ✅ | `App.js` `/app/*` → `CustomerApp.js` wrapper (`Home, Bills, Loyalty, Credit, Profile`) | — |
| 56 | Home = "माझा Nafa" with real DB values (earned/redeemed/bills/savings) | ⚠️ | `CustomerHome.js`: greetings + "इथे तुमचा Nafa मागडी दिसेल" placeholder — **no wallet numbers from API** | **P1: wire `/portal/profile` aggregates** |
| 57 | My Nafa value dashboard (value earned/redeemed, contribution) | ➕ | Loyalty tab shows points only | P1: My Nafa tab (or section on Home) |
| 58 | Spending analytics + period comparison + not-enough-data guard | ➕ | None | P1 |
| 59 | Savings calculation layer (every number defined, no double-count) | ➕ | — | P1: `lib/savings.js` (loyalty earned + per-bill discount + धनलाभ) documented in architecture doc |
| 60 | धनलाभ 10=₹1 central config | ⚠️ | `LOYALTY_TO_CASH = 10` duplicated in `CustomerHome.js:6`, `CustomerApp.js:19,104` | P1: single `lib/nafa.js` + backend shop setting |
| 61 | Bottom nav ≤5: Home / Search / Purchases / My Nafa / Account | ⚠️ | Current: Home, बिले, लॉयल्टी, क्रेडिट, प्रोफाइल (5 tabs but wrong set) | **P1: restructure — Credit moves into Account/My Nafa** |
| 62 | "मला हवे आहे" requirement-based search | ➕ | — | P1 |
| 63 | Nearby shops (location optional) | ➕ | Shops have `city` only | P2 (city-level) / P3 (geo) |
| 64 | For-You offers with displayed reasons | ➕ | — | P2 (needs offers engine) |
| 65 | Benefits wallet (no fake balances) | ➕ | Loyalty + credit exist | P1: benefits view = loyalty+discount facts only |
| 66 | Orders/returns/warranty/reminders/purchase-protection | 🧠 | — | P3 — models only where useful, **no fake checkout** |
| 67 | Customer privacy & data controls | ➕ | — | P2: view/export/delete-my-data |
| 68 | Customer AI assistant over controlled tools only | ⚠️ | `assistant_routes` is **merchant** chat; customer AI none; merchant chat reads **legacy `sales/business_id` collections** (stale vs `invoices/shop_id`) | P2: fix context to new schema; customer AI later |
| 69 | Voice requirements creation (service interface, browser STT ≠ AI) | ➕ | Merchant voice exists (`VoiceAssistant.js` + `voice_routes`) | P1: `VoiceRequirementService` interface stub → P3 STT |

## 7. Retailer Intelligence (§106–135)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 70 | Retailer dashboard today's sales/margin/customers/credit/धनलाभ | ⚠️ | `dashboard_routes.summary` gives sales/invoices/new customers/udhaar; margin computed from `total_cost`; **no धनलाभ card, wording says "Estimated Profit"** | P1: rename to "Estimated Gross Margin", add धनलाभ config+card |
| 71 | Today's Actions center (real-data reasons/priority/buttons) | ➕ | Dashboard has static low-stock/udhaar reminder cards | **P1: `/retailer/actions` endpoint + Today's Actions card** |
| 72 | Segments UI (Regular/Win-back/New/High-value/Credit/Requirement) | ⚠️ | Server supports 6 (no `has_requirement`); Customers page shows 3 | P1 |
| 73 | Requirements→stock→notify loop (demand-driven restock) | ➕ | — | P1 with requirements |
| 74 | Products: supplier link, expiry, batch, location, last-sold, return-rate | ⚠️ | Product model has sku/barcode/brand/unit/threshold; **no supplier_id/expiry/batch/location** | P1: add `supplier_id`, `expiry_date` fields (non-breaking) |
| 75 | Smart reorder (explained basis or "not enough history") | ➕ | `low_stock` boolean only | P2 |
| 76 | Dead stock (अडकलेला पैसा) | ➕ | — | P1 |
| 77 | Smart Deal decision-support (configurable, no auto-approval) | ➕ | — | P2 |
| 78 | Offers/campaigns merchant-confirmed, no fake WhatsApp | ❌ | `Marketing.js` = fake demo | P1: rebuild as compose→copy/confirm flow backed by real segments; P3 delivery integration via abstraction |
| 79 | WhatsApp abstraction only (never fake delivery) | ❌→➕ | Fake toast today | P1: `MessageChannel` interface, UI = "copy message" |
| 80 | Udhaari action menu (remind/record/adjust) | ⚠️ | Payment recording ✅, reminder=WhatsApp link only, no reminder log | P1: honest "copy reminder" + ledger actions exist |
| 81 | Cash flow (recorded ≠ gateway-verified) | ⚠️ | P&L/collection reports are recorded-only | P2: label "recorded" in UI |
| 82 | Suppliers + price-change detection from purchase records | ⚠️ | `suppliers_routes` CRUD+purchases ✅; **no price-change surfacing, no linked-to-product rollups** | P2 |
| 83 | Purchase planner (list→PO draft→mark received→auto cost update) | ➕ | Purchase recording exists on supplier (manual) | P2 |
| 84 | Retail health score (internal, documented formulas) | ➕ | — | P2 (documented in architecture doc) |
| 85 | Staff permissions enforced server-side | ⚠️ | `require_role` exists; **dashboard/staff UI has no granular toggles; coverage unverified per-route** | P2: permission matrix + tests |
| 86 | Owner mode (secure) | ➕ | — | P3 |
| 87 | Retailer AI via controlled tools (no unrestricted DB) | ❌ | `assistant_routes`/`voice_execute` run **against DB directly from model output**; voice fallback fabricates data | P2: tool whitelist + confirm-before-execute |
| 88 | Consolidated settings (profile/loyalty/credit/lang/notifications/staff/export) | ⚠️ | `Settings.js` has language + loyalty reward + password; staff/products elsewhere | P2: settings sections |
| 89 | Merchant notifications (login, ledger, export events) | ➕ | — | P2 |

## 8. Localization, UX, Quality (§136–160)

| # | Requirement | Status | Location | Action |
|---|---|---|---|---|
| 90 | 4 states (loading/empty/error/success) everywhere | ⚠️ | Loading+empty+error patterns exist; **not universal (e.g. SupplierProductRollup no error state; Marketing no loading)** | P1 sweep per touched page |
| 91 | Centralized i18n keys, no scattered literals | ⚠️ | ~357 keys; secondary pages have literals (grep: Marketing/Products/Suppliers/Staff/Loyalty/Reports) | **P1: sweep + `i18ncheck` covers strings** |
| 92 | Emerald+amber design language, info hierarchy | ✅ | Tailwind theme, shared `Stat`/`Card` components | P1: keep on new UI |
| 93 | No duplicate navigation | ⚠️ | Merchant `Udhaar.js` exists but `/udhaar` redirects → `/credit` ✅; Marketing duplicates nothing yet (it's the only campaign surface) | Keep redirect; rebuild Marketing in place |
| 94 | No duplicate pages/tables — enhance existing | ✅ | (rule) Rewards=धनलाभ etc. honored in this plan | Enforce in P1 review |
| 95 | Accessibility (labels, contrast, tap targets) | ⚠️ | Buttons have labels; **no a11y audit** | P2 |
| 96 | Performance (aggregations, pagination, indexes) | ⚠️ | Aggregation pipelines ✅; **customers list unpaged; indexes only on legacy collections + invoices** | P2: pagination + new indexes |
| 97 | Real data only (no "42 customers" placeholders) | ⚠️ | Most numbers real; **Marketing demo + voice fallback fabrications** | P0 (see #9) |
| 98 | 30-shop pilot readiness | ⚠️ | Seed script `scripts/seed_demo.py`; seeding wired but journey doesn't seed pilot shops | P2 |
| 99 | Acceptance tests §122–125 + §86 suite | ⚠️ | journey_smoke 69 checks incl. security negatives; **spec's §86 groups not fully mapped** | P2: extend journey_smoke for new endpoints incl. negative auth |
| 100 | Documented migrations, preserve prod data | ✅ | `scripts/migrate.py` + `MIGRATION_LEDGER.md`; new fields non-breaking | Continue ledger entries |
| 101 | No over-building (no ERP/GST/payroll) | ✅ | Scope discipline enforced by this audit | Status doc lists deferred |

---

## Critical P0 fixes (correctness / honesty)

1. **Marketing fake "Campaign sent"** → rebuild honestly (compose → copy message / confirm; no delivery claim).
2. **Voice fallback fabricates customer names & amounts** → fallback must clearly say it did not execute anything and needs the configured AI key.
3. **Assistant business context reads legacy `sales`/`udhaar`/`business_id` collections** → rewire to `invoices`/`shop_id` (silent wrong data = broken).

## P1 high-value build (customer + retailer)

4. `requirements` + `notifications` + `favorites` collections & routes (+ shop isolation tests).
5. Retailer `/retailer/actions` (Today's Actions) derived from real data.
6. Customer app restructure: 5-tab nav (Home/Search/Purchases/My Nafa/Account), real wallet numbers, savings layer (`lib/savings.js`), धनलाभ centralization.
7. Billing customer-context panel; RecentBills void UI; dead-stock card; "Estimated Gross Margin" wording.
8. Products: `supplier_id` + `expiry_date` (non-breaking); segments: `has_requirement` + full UI list.
9. i18n literal sweep on secondary pages + `i18ncheck` extension.

## Deferred with honesty (P2/P3 → status doc)

Returns workflow, referrals, warranty/reminders/purchase-protection, geo-proximity, purchase planner UI, health score, owner mode, customer AI, chat delivery integrations — each shipped as **model/foundation or hidden**, never as fake UI.
