# NafaMitra — Implementation Status

_Built 2026-10-03 on branch `arena/01a100e8-nafamitra`. Reports against the 101-section product upgrade specification and the gap audit (`nafamitra-feature-gap-audit.md`). Every claim below was verified by the automated gates listed in §8._

---

## 1. Completed (was working — verified, kept, hardened)

| Area | Evidence |
|---|---|
| Phone→OTP single-entry auth + role discovery + 🏪/👤 switcher without logout | `auth_routes.py`; login_e2e PASS; journey §2 |
| Triple-channel token transport (Authorization / `X-Auth-Token` / cookie) fixing the preview-edge 401 bug | `auth.py::_extract_token`, `lib/api.js`; journey §19 transport checks |
| Dual-identity (same phone = merchant + customer, UUID PKs, `NM-XXXXXX`, phone never a PK) | `identity.py`; journey §2 |
| Strict per-shop isolation (`resolve_shop_id` + scoped queries) | journey cross-shop 403 + new requirements-isolation checks |
| Atomic idempotent billing (client_uuid unique index, counter-based invoice numbers, void-with-reversals) | `billing.py`, `sales_routes.py`; e2e_flows |
| Credit + loyalty append-only ledgers (CREDIT/PAYMENT/REVERSAL/ADJUSTMENT · EARN/REDEEM/REVERSAL/ADJUSTMENT), no hard deletes | `udhaar_routes.py`, `loyalty_routes.py` |
| Integer-rupee money at API boundaries; profit floor (`min_selling_price`) billing guard | `money.py`, billing block |
| Customer portal (overview/bills/loyalty/credit/QR/magic link) + public receipt | journey §16–17 |
| Dashboard, Billing (quick+itemized+udhaar), Customers CRUD, Products, Credit, Loyalty, Staff, Suppliers CRUD+purchases, Reports, Settings | journey §5–15 |
| Marathi-first i18n shell (mr/en/hi, persisted `nafamitra_lang`, language switch never logs out) | i18ncheck 8/8; render_smoke |
| PWA manifest + service worker, mobile-first layouts | `public/manifest.json`, `sw.js` |

## 2. Improved (existed but was wrong, fake, or rough)

| Change | Detail |
|---|---|
| **P0 honesty: voice no longer fabricates** | `voice_routes.py` — transcribe fallback returns empty + notice (was fake "Ramesh ₹500" transcript); understand classifies read-only intents locally but **requires clarification** for bill/payment intents with no invented names/amounts; execute reads current schema (`invoices`/`credit_accounts`) instead of dead legacy `sales`/`udhaar`; unknown intents return `success:false` "Nothing was executed". VoiceAssistant UI: guards empty transcription, hides Confirm on clarification, paise-based result rendering |
| **P0 honesty: AI assistant** | `assistant_routes.build_business_context` rewired to current collections (was reading legacy `business_id` data → silently stale numbers); no-key response states AI is unconfigured (was fake "your margins look healthy"); system prompt bans unqualified "profit" and action claims |
| **Marketing rebuilt honestly** | Was a demo with fake "Campaign sent! (Demo mode)". Now: real backend segments, **real audience counts/names** from `/customers`, compose + preview + **copy-message** — no delivery claim anywhere; delivery integration remains a future slot behind MessageChannel |
| **Profit wording** | Retailer surfaces now say "अंदाजित / Est. gross margin" (dashboard card, reports label, voice, AI prompt) — never unqualified "profit" |
| **Dashboard metrics** | `compute_metrics` returns `margin_paise` (recorded sales − estimated cost); 6 real cards: today's sales, bills, **est. gross margin**, **dhanlabh given today** (real EARN points), customers, credit due |
| **Billing customer-context** | Selected-customer strip now shows this-shop history line (bills · total · avg) + History button to customer-360, on top of existing loyalty/credit/last-purchase |
| **Onboard customer links own shop** | Owner's customer profile now gets a `shop_customers` link so their own shop's CRM (segments, requirements visibility) sees them |
| **Inventory report fixed** | UI read `low_stock`/`out_of_stock` arrays the endpoint never returned (showed zeros) — endpoint now returns both, **plus dead stock** |
| Secondary-page i18n | Products, Suppliers, Reports, VoiceAssistant, AIAssistant fully converted to keys (see §7) |

## 3. Added (new capability)

| Feature | Where |
|---|---|
| **Requirements (माझ्या गरजा / retailer demand loop)** | `routes/requirements_routes.py` — customer create/list/status-transition; retailer list/notes/"matched" → in-app customer notification; privacy model: targeted shop **or** shops already linked (no stranger broadcast); `source: manual/voice/reorder` |
| **Reorder → requirement** | Customer Purchases list + bill detail button builds a requirement from bill items; copy explicitly says **no order is placed** |
| **Notifications centre + consent** | `routes/notify_routes.py` — 6 categories (transaction/benefit/reminder/requirement/shop/marketing), unread counts, read/read-all, per-category prefs; **marketing consent separate & default OFF**; bill creation emits a transaction notification (in-app only) |
| **Favorite shops** | `routes/favorites_routes.py` + heart toggle in customer Search → Shops tab |
| **Today's Actions** | `routes/retailer_actions.py` — overdue/due udhaar (15-day rule), low stock, win-back (≥2 bills, 30d quiet), matching requirements (deterministic token overlap), no-sales-evening; i18n `reason_key`+params; dashboard card `TodaysActions` (navigate-only buttons, self-hides on failure) |
| **Customer app restructured to spec's 5 tabs** | Home / Search (मला हवे आहे) / Purchases / **My Nafa** / Account; loyalty+credit reachable as deep links (no duplicate navigation) |
| **My Nafa value dashboard** | `customer/MyNafa.js` + `lib/savings.js` — savings = per-bill discounts + loyalty value (documented, no double-count), धनलाभ eligibility shown **separately**, 30-day vs previous-30 comparison with ≥3-bills "not enough data" guard, per-shop balances |
| **मला हवे आहे search tab** | Requirement composer (title/items/budget/target shop), status list, shops + favorites; **browser dictation** behind `lib/voiceInput.js` — labelled speech-to-text, explicitly not AI |
| **Merchant Requirements page** | `/requirements` (More menu + action targets) — filters, notes, match flow |
| **Segment `requirement`** | Server-side `SEGMENTS` + deterministic rule (open visible requirement) alongside existing new/repeat/high_value/credit_due/inactive |
| **Products: supplier + expiry fields** | Optional `supplier_id`, `expiry_date` on create/update (additive) |
| **Dead stock (अडकलेला पैसा)** | Inventory report: stuck value = stock × cost for items with **zero sales in 30 days** (new-since invoices + legacy sales), with per-item list in Reports |
| **i18ncheck gate** | `frontend/scripts/i18ncheck.js` — identical key sets across mr/en/hi + placeholder consistency (8 assertions) |
| **Journey honesty suite** | +15 voice/AI checks, +19 requirements/favorites/notifications/actions checks incl. cross-shop isolation and 401s |

## 4. Deferred (honest — foundations only, no fake UI)

| Capability | Status | Why |
|---|---|---|
| WhatsApp/SMS delivery | `MessageChannel` interface documented; UI = copy-message only | Needs a real provider; faking delivery is banned |
| Orders/checkout, returns workflow, warranty, purchase-protection | Not built | Spec: future-ready only, no fake checkout; invoice `RETURN` model hook exists |
| Referrals, geo-proximity nearby shops, purchase planner, health score, owner mode, customer AI chat | Not built (P2/P3) | Listed in architecture doc; each needs a real data source first |
| Offers engine (For-You with reasons) | Templates + segments exist; engine not built | P2 — requires campaign persistence + per-shop offer rules |
| Smart Deal decision support, smart reorder basis, price-change alerts, MoM reports | Partial: dead stock + segment + margin metrics done; the rest P2 | Deterministic rules need purchase-history depth |
| Audit-log UI | Backend `audit_logs` writes exist for sensitive ops (`log_action`) | Viewer is P2 |
| Staff granular permission matrix | `require_role` enforced server-side for loyalty rules/staff | Full matrix + tests P2 |
| Returns vs void distinction in UI | Void-with-reversals works; per-item returns not built | P3 |

## 5. Database & migrations

- **Additive only**: new collections `requirements`, `customer_notifications`, `notification_prefs` (unique `customer_id`), `favorites` (unique pair), all indexed in `database.py::ensure_indexes()`; products += optional `supplier_id`, `expiry_date`; no destructive changes, no rewrites of ledgers/invoices.
- **Preserved production data**: no schema-breaking change shipped; invoice/credit/loyalty history untouched; legacy `sales`/`udhaar` reads still merged where they were before (dashboard, voice, dead-stock).
- Known data-quality note: seeded demo shops contain intentionally old-dated legacy sales (for chart demos); dead-stock/win-back correctly treat them as "no recent sales".

## 6. Security

- All new endpoints require `require_business` or `require_portal`; journey asserts 401 for unauthenticated `/requirements`, `/favorites`, `/notifications`, `/retailer/actions` and **cross-shop invisibility** of another shop's requirements/actions.
- Requirements privacy: never broadcast — visible only to a targeted shop or shops with an existing customer link; notifications scoped by `customer_id` from the session (never client-supplied).
- Marketing consent stored separately from any shop-level link consent, default **false**; suppressed notifications are not inserted (no silent opt-out bypass).
- AI/voice: write intents cannot execute without configured AI; fallback path has no DB write capability for bills/payments; assistant context is read-only and tenant-scoped.
- Carried rules: no secrets in repo, no phone PKs, no cross-shop reads, ledger append-only, no fake OTP/WhatsApp/payment anywhere.

## 7. i18n

- **651 keys × 3 languages (mr/en/hi)**, identical sets + placeholder parity enforced by `node scripts/i18ncheck.js` (8/8).
- Fully keyed this round: new surfaces (search/nafa/notifPage/reqm/action/notif/mkt/billing.ctx/reports labels/dashboard margin cards/app.reorder) **and** previously literal-heavy pages: Products (`prod.*`), Suppliers (`sup.*`), Reports (`rep.*`), VoiceAssistant (`voice.*`), AIAssistant (`ai.*`).
- Marketing templates localized; voice sample commands localized **and** matched by the backend Marathi fallback keywords.
- Remaining known literals: non-UI technical tokens (SKU, CSV, payment modes, units) intentionally untranslated; any stragglers found by review should become keys, not edits to pages.

## 8. Tests & verification (all run after the final change)

| Gate | Command | Result |
|---|---|---|
| Backend API suite | `REACT_APP_BACKEND_URL=http://localhost:8001 pytest -q` | **22 passed** |
| Full journey + honesty + isolation | `python tests/journey_smoke.py` (through :3000 proxy) | **103/103** |
| Login E2E (jsdom, real OTP round-trip) | `node frontend/scripts/login_e2e.js` | **PASS** (0 page errors) |
| Render smoke (Marathi mount) | `SMOKE_URL=… node frontend/scripts/render_smoke.js` | **PASS** |
| i18n completeness | `node frontend/scripts/i18ncheck.js` | **8/8 — 651×3 keys** |
| Production build | `yarn build` | **exit 0** (pre-existing hook-deps warnings only) |

Preview: `https://sbx-5pwjpkk7zdj5mnob.arena.site/` → :3000 (serve.js, prod build) → uvicorn :8001.

## 9. Limitations

1. **No message delivery** — campaigns/notifications are in-app + copy-to-clipboard by design until a provider exists.
2. **Product prices are floats in the legacy product model** (API rounds at boundaries); ledgers/invoices are integer rupees. Migrating product prices to minor units is a P2 data migration.
3. Win-back/matching rules are deterministic heuristics (30d/15d thresholds, token overlap) — documented in the architecture doc, configurable thresholds not yet exposed in Settings.
4. Customer profile resolution for a session with multiple profiles uses the first profile (single-profile is the norm today).
5. Analytics "not enough data" guards use ≥3 bills; comparisons need ≥3 bills per period — stricter than needed for very new shops (intentional).
6. Voice STT/transcription requires the server AI key; without it the UI honestly says dictation/assistant is unavailable (browser dictation still works on the customer Search tab where supported).
7. Accessibility: labels/tap targets present on new UI; no formal audit yet (P2).

## 10. Next steps (priority order)

1. **P2 intelligence**: smart reorder with explained basis, Smart Deal decision-support, discount-leakage + MoM report lines, offers engine over `offer_campaigns`, win-back copy-send confirmation (still copy-only), customer problems (माझ्या समस्या) workflow, purchase planner, price-change alerts from purchase records.
2. **P2 platform**: staff permission matrix with server-side tests, audit-log viewer, notification prefs sync for shop-level links, dead-stock/winnback threshold config in Settings, pagination for large customer/product lists, accessibility pass.
3. **P2/P3 AI**: tool-whitelisted assistant actions with confirm-before-execute; voice execute intent validation suite.
4. **P3 future-ready**: returns (per-item, distinct from void), referrals with anti-abuse, warranty/reminders models, purchase-protection labels (no insurance claims), owner mode, real WhatsApp/SMS provider behind MessageChannel.
5. Keep gates green per milestone; every new user-visible string lands in `i18ncheck` coverage.
