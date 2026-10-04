# NafaMitra — Customer Upgrade Gap Audit

_Audited 2026-10-04 against the “Customer Personal Nafa Brain + My Stores + Customer Journey + Separate Role Entry” upgrade spec. All locations verified in-repo on `arena/01a100e8-nafamitra` @ `fc53875`. Status values: **Existing** (works as specced), **Partial** (present but incomplete), **Missing**, **Broken**. Action: KEEP / IMPROVE / EXTEND / REFACTOR / ADD / DEFER._

## A. Authentication & identity (spec §2–8, §45–46, §83)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| OTP single-entry auth, role discovery, dual identity (one phone → one auth user → customer profile + shop membership) | Existing | `backend/routes/auth_routes.py` (`verify-otp`, `identity_resolution`), `backend/identity.py`, `frontend/src/context/AuthContext.js` | KEEP |
| 🏪/👤 context switcher without logout | Existing | `CustomerApp.js` header, `Profile.js` “My Shop” | KEEP |
| Immutable Customer ID `NM-XXXXXX`, UUID PK, phone never PK | Existing | `backend/identity.py::_new_nm_id` (ULID-ish), `customers.id` UUID | KEEP |
| **Separate entry journeys** — “Welcome to NafaMitra” + two visually distinct cards, each with Login **and** Create-Account actions | Broken vs spec | `Login.js` — two tiny radio cards only switch intent of one shared phone form; no per-journey Login/Create actions, no “Welcome” landing | **REFACTOR** Login into journey landing → per-journey login (merchant copy vs “Welcome back to your Nafa”) → shared OTP engine |
| Per-journey routing after login (customer entry → `/c` even if merchant role exists; owner → `/` or shop selector) | Partial | `Login.js::routeByIdentities` honors intent for `both`, but landing UX doesn’t make journeys intentional | IMPROVE |
| Merchant onboarding only (name, shop, category, address/village, optional location) | Partial | `Onboarding.js` step `shop` (name/shop/category/location+geo); no separate address/village field | IMPROVE (add optional address/village line) |
| Customer onboarding only (name → Customer ID) | Partial | `Onboarding.js` step `customer` (name only); success screen doesn’t show generated `NM-…` ID | IMPROVE (show permanent Customer ID on success) |
| No customer questions in owner signup, no owner questions in customer signup | Existing | `Onboarding.js` — forms already separated by `intent` | KEEP |
| Same-phone dual role = one identity, no duplicate person | Existing | `identity_resolution` (`kind: both`), `ensure_global_customer` keyed by normalized phone | KEEP |
| Auth edge cases (wrong/expired/resend OTP, multi-shop, new/existing both roles) | Existing | OTP service `backend/otp_service.py`; journey §2; `login_e2e.js` | KEEP + extend tests |

## B. My Stores foundation (spec §10–16, §43–44, §72)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Verified shop relationships (connected stores w/ purchase history) | Existing | `shop_customers` links; `customer_portal_routes.overview → shops[]` (purchase_count, totals) | KEEP — becomes the “Connected/Partner” side |
| Favorites | Existing | `backend/routes/favorites_routes.py`; Search→Shops tab | KEEP (stays a preference, not the store map) |
| **Customer-added manual stores** (name, phone, category, recent purchase, date, notes) | Missing | — | **ADD** collection `my_stores` + `/mystores` CRUD |
| Store connection states: Added / Invited / Partner / Connected / Disconnected | Missing | — | **ADD** (`state` derived: `added` vs `connected` when matched to partner) |
| Source labeling: Verified vs Added by You vs Estimated | Missing (frontend shows linked-shop totals unlabeled) | `customer_portal_routes.overview` | **ADD** source tags on every metric in store UI |
| Store profile page (customer-facing: totals, bills, discounts, धनलाभ, last purchase, history) | Partial | Per-shop rows exist in `overview.dhanlabh` / `overview.shops`; no dedicated page | **ADD** `/c/stores/:id` combining verified + manual data with labels |
| Manual ≠ partner distinction (never mix) | Missing | — | **ADD** (separate sections + `source` field on records) |
| 5-store activation → Premium entitlement | Missing | — | **ADD** `entitlements` collection, server-side grant, idempotent (§13, §49) |
| Demand signal (aggregate interest per store) | Missing | — | **ADD** aggregate-only endpoint; no customer PII (§37–38, §59–60) |

## C. My Nafa, spending, savings (spec §19–21, §26, §53, §58)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Savings dashboard (discount + loyalty value, documented formula, no double count) | Existing | `frontend/src/lib/savings.js`, `MyNafa.js` savings card + `formulaNote` | KEEP |
| Period comparison with ≥3-bills guard | Existing | `savings.js::comparePeriods`, `MyNafa.js` `spend-compare` | KEEP |
| Per-shop loyalty balances (never merged across shops) | Existing | `MyNafa.js` per-shop rows; `loyalty` portal route | KEEP |
| **Known NafaMitra spending** (this month, by shop + category) with honest wording | Missing | — | **ADD** `/customer/nafa-summary` server aggregation + Home/MyNafa cards |
| Benefit-this-month, bills count, stores count, discounts tiles (§19) | Missing | — | **ADD** in `nafa-summary` |
| Nafa Insight (deterministic, data-backed, “not enough data” guard) | Missing | — | **ADD** computed server-side (top category MoM / first-period guard) |
| Trust wording (“NafaMitra recorded…”, never total-expense invention) | Existing (pattern) | `nafa.*` keys use recorded/known labels | KEEP + extend to new cards |
| Source labels everywhere (Verified / Added by You / Estimated / Suggested) | Partial | `nafa.redeemableValue`, `formulaNote` | EXTEND |

## D. Goals, saving target, budgets, expenses (spec §9, §22–25, §69–70, §73)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Customer goals (target/progress/%) with tracking-not-holding wording | Missing | — | **ADD** `customer_goals` + portal CRUD + My Nafa section |
| Monthly saving target + progress | Missing | — | **ADD** (`customer_settings.saving_target_paise`) |
| Budgets (optional categories) | Missing | — | **ADD** minimal (per-category monthly caps, optional) |
| Customer-added expenses (rent, etc.) with `source_type` | Missing | — | **ADD** `customer_expenses` (integer paise, source `customer_added`) |
| First-run / empty states (add first store, first goal; 0-store works) | Partial | Empty states exist on Home/MyNafa/Bills | EXTEND to new sections |

## E. Personal Nafa Brain (spec §27–32, §51–52, §74–77)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Merchant AI assistant over deterministic business context | Existing | `backend/routes/assistant_routes.py` (`require_business`, `build_business_context`) | KEEP |
| Browser voice dictation for customer input | Existing | `frontend/src/lib/voiceInput.js` (Search tab) | KEEP (text-first, typing fallback) |
| **Customer Brain chat** with controlled tools, no arbitrary IDs | Missing | — | **ADD** `POST /customer/brain/chat`: intent → whitelisted tools (spending/savings/goals/loyalty/stores/bills/benefits/requirements) → structured result → localized explanation; profiles from token only |
| Mandatory data-limitation disclosure on money answers | Missing | — | **ADD** (built into tool results: `partial: true` + disclaimer key) |
| Deterministic math (backend returns target/progress/%; LLM explains) | Pattern exists | `assistant_routes` context builder | REUSE pattern |
| Localized suggested prompts (§74) + actions (§77 navigate-only) | Missing | — | **ADD** (chat page `/c/brain`; actions = view last purchase / add requirement / reminders UI) |
| Works without AI key (no fake answers) | Missing | — | **ADD** template answers from the same tool results when unconfigured |

## F. Requirements & matching (spec §35–36)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Structured requirements w/ budget, need_by, category, target shop, status | Existing | `requirements_routes.py` `RequirementIn`; Search→Requirements UI | KEEP |
| Reorder → requirement (no fake orders) | Existing | `Bills.js::useReorder` | KEEP |
| Retailer match display to customer | Existing | status `matched` + notification | KEEP |
| Color/size/qty/intended-user fields | Partial (qty yes; color/size/intended user no) | `ItemIn` | EXTEND (optional `color`, `size`, `notes`) |
| Stock-match without exposing private stock | Existing | retailer match is manual/keyword (TodaysActions) — no stock data leaked | KEEP |

## G. Notifications & consent (spec §56, §55)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| 6 categories, unread counts, read/read-all, prefs | Existing | `notify_routes.py`, `Notifications.js` | KEEP |
| Marketing consent separate, default OFF | Existing | `notification_prefs.marketing` default false | KEEP |
| Bill → in-app transaction notification | Existing | `sales_routes` on payment | KEEP |

## H. Privacy & security (spec §38–40, §50–51, §81–82)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Customer-private vs shop data boundary | Existing (implicit) | portal resolves profiles from token (`_resolve_profile_ids`); no client-supplied customer_id trusted | KEEP + document |
| Retailer sees only own-shop relationship data | Existing | `require_business` + shop-scoped queries; journey cross-shop checks | KEEP |
| Goals/expenses/private Brain never retailer-visible | Missing (nothing exists to leak yet) | new collections scoped by `customer_id` only | **ADD** server-side scoping + journey isolation tests |
| AI cannot request other customers | Existing pattern (merchant context builder) | extend to customer tools | EXTEND |
| Same-phone dual-role no-leak test | Partial | journey §2 covers role discovery | EXTEND (customer endpoints must 401/403 correctly for merchant-only session and vice-versa) |

## I. Localization (spec §47–48, §84)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| mr/en/hi centralized keys, persisted, switch ≠ logout | Existing | `frontend/src/i18n/{mr,en,hi}.js` (651 keys), `i18ncheck.js` 8 checks | KEEP |
| New surfaces keyed from day one | Pending | this upgrade’s pages/forms/errors/status | ADD keys ×3 in same commits |
| Hardcoded English sweep of customer screens | Partial | date renders use `toLocaleDateString('en-IN')` → English month names in mr/hi (`Home.js`, `Bills.js`); audit remaining literals | IMPROVE (lang-aware date helper + sweep) |

## J. Platform (spec §65–68, §80, §86–87, §90)

| Feature | E/P/M/B | Existing location | Action |
|---|---|---|---|
| Invoice = source of truth (no duplicate transaction system) | Existing | `invoices` + ledgers; portal reads them | KEEP — expenses/goals live in their own small collections, never re-storing bills |
| Integer paise money | Existing | `backend/money.py`, `frontend/src/lib/money.js` | KEEP |
| Idempotent index-based migrations | Existing | `database.py::ensure_indexes` (runs at boot) | REUSE for new collections |
| Aggregation server-side (perf) | Existing pattern | `compute_metrics`, portal overview | EXTEND (`nafa-summary`) |
| Data definitions doc | Missing | — | **ADD** `docs/nafamitra-customer-data-definitions.md` |
| Premium/entitlement architecture (backend decides) | Missing | — | **ADD** `entitlements` + rule config, no frontend-only state |

## Implementation order (mapped to spec §88)

1. **Audit** → this document.
2. **Auth UX** — Login journey landing + per-journey screens; Onboarding address line + Customer ID display.
3. **Identity** — verify NM-ID immutability (already), surface ID in Account.
4. **My Stores** — `my_stores` backend + `/c/stores` UI + states.
5. **Connect verified transactions** — store detail page joins `overview` per-shop verified data, source-labeled.
6. **My Nafa extension** — `nafa-summary` (known spending, tiles, insight).
7. **Goals + saving target + budgets + customer-added expenses.**
8. **Nafa Brain** — `/c/brain` + controlled-tools endpoint + disclosure.
9. **Requirements EXTEND** (color/size/notes) + matching surfaced in My Stores.
10. **Demand signals** — aggregate-only endpoint + retailer widget (counts, no PII).
11. **Premium entitlement** — 5 stores → 30-day grant, idempotent, backend-checked.
12. **Localization** — keys ×3 + English-sweep (dates, literals).
13. **Security tests** — journey: cross-customer isolation (goals/expenses/stores), portal 401s, dual-role routing.
14. **Mobile QA** — render smoke additions + viewport pass.
15. **Build + final gates** — pytest / journey / login_e2e / render_smoke / i18ncheck / build.
