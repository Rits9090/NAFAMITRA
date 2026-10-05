# NafaMitra — Authentication Production Audit & Demo Mode Release

_Date: 2026-10-05 (Asia/Calcutta). Live document — final results appended at the end._

## 0. Scope note: there is NO Supabase in this repository

The brief references `supabase.auth`, `signInWithOtp`, `verifyOtp`, RLS
policies and `VITE_SUPABASE_*` variables. **None of that exists in NafaMitra.**
Verified: repo-wide search for `supabase` matches only the prose of
`docs/release-audit.md`. The actual stack:

| Layer | Implementation |
|---|---|
| Frontend | CRA (react-scripts via CRACO), React Router SPA, axios |
| Auth | **Custom FastAPI phone-OTP** (`backend/routes/auth_routes.py`, `otp_service.py`, `identity.py`) + JWT session token (HS256, `JWT_SECRET` env, ephemeral random fallback — no hardcoded default) |
| Database | MongoDB (`MONGO_URL` env; in-memory mongomock fallback for dev) |
| OTP delivery | Pluggable `OTP_PROVIDER` (twilio/whatsapp). No provider configured ⇒ **dev mode**: hashed, expiring, attempt-limited OTP returned to the client so the pilot flow completes honestly. `OTP_DEV_MODE=false` disables even that. |

All Supabase-specific checks in the brief are therefore N/A; the equivalent
checks were performed against the real implementation (below).

## 1. Current Auth Flow (as implemented, not assumed)

Landing `/auth` (journey view) → four entry cards:

**Retailer:** `journey-merchant-login` / `journey-merchant-signup`
**Customer:** `journey-customer-login` / `journey-customer-signup`

1. Card → shared phone form (`+91`, client-side `^[6-9]\d{9}$` validation,
   normalized: strips `91`/`0` prefixes — same rule as server `phones.normalize_phone`,
   which accepts `+91…`, `0091…`, `0…`, spaced, and returns the canonical
   10-digit form. Phone is NEVER a primary key — UUIDs are).
2. `POST /api/auth/request-otp` → server stores salted hash + TTL; dev mode
   returns `dev_otp` (shown in a labelled amber box).
3. OTP screen (`otp-input`, auto-submit at length, paste support, resend
   cooldown `OTP_RESEND_COOLDOWN`, rate limits `429 cooldown` /
   `429 rate_limited`).
4. `POST /api/auth/verify-otp` → `{ token, identities }`.
5. **Server-side identity resolution** decides routing (never a client role
   claim): `new` → `/onboarding?intent=…`; `both` → contextual entry
   intent; `shops` → `/`; else → `/c`.
6. Guards (`MerchantGuard`/`CustomerGuard`) require the session token; all
   authorization (X-Shop-Id + membership) is validated server-side.
7. Dual role: one person may hold shop membership(s) + customer profile(s)
   under one identity — entry context is honoured, switcher available later.

## 2. Failure Point — exact mechanism of "Request failed. Please try again"

**Where the string comes from:** `frontend/src/lib/api.js`, response
interceptor. Original logic:

```
message = friendly.message || (status ? 'Request failed. Please try again.' : 'Network error…')
```

`friendly` = `response.data.error` (the NafaMitra error envelope). The mask
appeared whenever **the server answered with an HTTP error status whose body
was NOT the NafaMitra envelope**.

**Why production hits that path (verified from code + deploy architecture):**

- The deployed site is the **static frontend on Vercel** (root `vercel.json`
  from the previous release). Its API base defaults to same-origin `/api`
  unless `REACT_APP_BACKEND_URL` was baked at build time.
- There is **no backend in that deployment**. `POST /api/auth/request-otp`
  therefore hits Vercel's static host: SPA-rewrite HTML or a 404/405 page —
  a status **without** `{error:{message}}`.
- Interceptor: `status` present, `friendly = {}` → generic mask shown.

**Exact classification of the original failure:**
frontend error-handling bug masking a missing/misconfigured backend route
(not an OTP provider error, not Supabase, not a phone-format error — those
paths return the envelope and were already specific).

_Limits of verification:_ the live URL is not discoverable from this
environment (GitHub has no homepage/deployments/commit-statuses; Vercel CLI
is logged out and `--temporary` deploys require login), so the deployed
Vercel env vars could not be read directly. The failure reproduces exactly
against a stub static host (see §6, `auth_error_e2e html404`).

## 3. Fixes applied (Track B — real auth path, no masking)

1. **Error classification in `lib/api.js`** (`classifyError`): network /
   timeout / **`unavailable`** (HTML body or 404/405/415/422/5xx without our
   envelope) / 429 rate-limit / 401 session / 403 forbidden / envelope codes
   (`invalid_phone`, `otp_invalid`, `cooldown`, …) → i18n key.
2. **Localized messages** (new `err.*` section, mr/en/hi — exact wording from
   the brief): network, timeout, unavailable, rate-limited, invalid OTP,
   session expired, forbidden, generic. `errMsg()` resolves via the new
   module-level `tStatic()` so **every existing call site** gets the mapped
   message without per-page edits.
3. **No secrets in messages or logs**: `console.warn('[api-error]', {code,
   status, path, request_id, ts})` only — path has query stripped; never
   bodies, phones, tokens or OTPs.
4. **Nothing else in the app** produced the literal mask (single source),
   but the interceptor fix upgrades error text app-wide (§20 search: only
   `lib/api.js` + a voice-specific hardcoded English string, noted below).

## 4. Environment variables (real names used by the code)

| Variable | Used by | Build? | Runtime? | Safe to expose? | Vercel scope |
|---|---|---:|---:|---:|---|
| `REACT_APP_BACKEND_URL` | `frontend/src/lib/api.js` (axios base) | **Yes — baked at build** | n/a (baked) | Yes (public URL) | Project → build. **This is the production-critical variable.** Without it the app calls same-origin `/api` which does not exist on Vercel ⇒ every request fails (the observed bug). |
| `REACT_APP_VERSION` | `lib/config.js` | No (default `1.0.0`) | No | Yes | optional |
| `REACT_APP_SUPPORT_WHATSAPP` | `lib/config.js` | No | No | Yes (public number) | optional |
| `JWT_SECRET`, `MONGO_URL`, `CORS_ORIGINS`, `OTP_*`, `TWILIO_*`, `SUPPORT_*`, `ADMIN_PHONES`, `SESSION_TOKEN_DAYS`, `PORTAL_TOKEN_MINUTES`, `FEATURE_*` | backend only | — | backend host | **Secrets stay server-side** | NOT Vercel (backend is separate) |

Env-var changes require a **new deployment** to take effect (build-time bake).
No `.env` is or ever was committed (history scan clean).

## 5. Phone normalization, OTP provider, rate limits

- **Normalization**: single rule client+server (`^[6-9]\d{9}$`, 10-digit
  canonical form; `+91`/`0091`/`0` prefixes folded). One identity per person;
  UUID is the internal key — phone is never a primary key. ✔
- **SMS provider**: none configured in this environment. `OTP_PROVIDER` empty
  ⇒ dev mode returns the OTP to the client (labelled in UI). A real SMS/WhatsApp
  provider requires `OTP_PROVIDER` + Twilio env on the **backend host** —
  cannot be claimed working without it. `cooldown` (resend) and `rate_limited`
  (6/10min per phone) return 429 with localized messages — now mapped in UI.
- **Rate-limit testing**: covered at the UX level via stub (below); backend
  cooldown logic exists in `otp_service.py` and returns `429 cooldown`.

## 6. Testing (all on the production build, `CI=true yarn build` exit 0)

| Test | Result |
|---|---|
| `render_smoke` (prod build + API) | PASS, 0 page errors |
| `login_e2e` (full OTP UI → session → dashboard, real API) | PASS, 0 page errors |
| `auth_error_e2e html404` (static-host 404 = production failure) | PASS — shows mr "सेवा सध्या उपलब्ध…" not the mask |
| `auth_error_e2e rate429` (429 without envelope) | PASS — shows rate-limit message |
| `auth_error_e2e badphone` (real envelope, invalid_phone) | PASS — shows invalid-phone message |
| `demo_e2e` (retailer+customer demo, badge, exit, local write path, 16+9 route crawl, 0 errors) | PASS |
| `demo_e2e` **against a server with NO /api at all** | PASS (demo needs no backend) |
| i18ncheck | 8/8, **852 keys × mr/en/hi**; demo CTA spot-checked in all 3 languages |
| journey_smoke (backend E2E incl. auth/isolation/401s) | 136/136 |
| pytest | 22/22 |
| Localization of error messages | mr/en/hi via `tStatic`; server `message_mr` honored for envelope errors |

### Bugs found and fixed during this release (real, previously shipped)

1. `Dashboard.js` used `longDate` **without import** since Phase-2 →
   merchant dashboard crashed to the error boundary for every real user.
2. **9 more pages** with missing `@/lib/dates` imports (Receipt, Bills,
   Customers, Loyalty, Requirements, Suppliers, customer/Bills,
   customer/Notifications, customer/Search) — same crash class; a static
   scan for used-but-unimported lib helpers now reports 0.
3. `Products.js` / `Reports.js`: dep arrays referenced `const` callbacks
   declared *after* the effect (TDZ `Cannot access before initialization`) —
   introduced by the previous lint pass; hoisted declarations.
4. Original fixtures generator stored `{status, body}` wrappers (demo
   dashboard crash) — regenerated to raw bodies.

## 7. Demo Mode (Track A)

- **Entry**: journey landing → dashed amber **"Explore Demo"** secondary CTA
  (`explore-demo`) → "Choose a Demo" picker (`demo-retailer` / `demo-customer`)
  → short "You're entering Demo Mode" transition → **Enter Demo**
  (`enter-demo`, also auto-enters at 900 ms) → **directly to the dashboard**.
  Subtitle states plainly: *"Explore NafaMitra without creating an account."*
- **Architecture**: `demoMode` flag (localStorage `nafamitra_demo`) +
  a custom axios **adapter** in `lib/api.js` that short-circuits ALL requests
  to `demo/demoHandle` + `demo/fixtures.js`. No token, no network, no JWT,
  works with the backend down. Guards accept the demo flag only when no real
  session exists (real token always wins; authorization stays server-side).
- **Data**: fixtures **harvested from the real API seeded with synthetic
  "Demo *" records** (Demo Kirana Store, Demo Owner, masked phones
  98765432xx) — byte-compatible shapes, zero real customer data.
- **Read-only by default**: every write returns `403 demo_readonly` → UI
  shows *"Demo mode — this action is available in a real account."*
  Deliberate local UI demonstrations (in-memory only): bill create, product
  add, customer add, goal add — they mutate the demo store and never reach
  the network.
- **Indicator**: amber **DEMO MODE** badge + **Exit Demo** in merchant header
  and customer header (`demo-badge`, `exit-demo`) → returns to `/auth` and
  clears the flag.

## 8. Mobile / viewport QA — LIMITATION

No browser engine is obtainable in this sandbox (Playwright and Puppeteer
binary downloads both fail — CDN blocked). jsdom provides no layout engine,
so **horizontal-overflow checks at 360/375/390/412/1440 viewports could NOT
be executed here.** What was verified: every screen renders without errors
at DOM level (route crawl), existing responsive classes intact, no new fixed
widths introduced by this release. Viewport QA must be repeated in a real
browser (dev tools device mode against the preview URL).

## 9. Other runtime errors found (§31)

- The 10 crash bugs in §6 — all fixed, all would have been silent production
  failures (now also caught by the global ErrorBoundary with a localized
  recovery screen).
- Route crawl across **25 screens** (16 merchant + 9 customer) in demo mode:
  **zero** uncaught errors after fixes.
- No failed chunks/CSS/asset 404s in the built artifact; API health OK via
  preview proxy.

## 10. Git & deployment (final numbers appended after push)

| Item | Value |
|---|---|
| Branch | `arena/01a100e8-nafamitra` |
| Final commit | `b0b5dbc3bd8c3b105cac83db2abc69b56f81d2a8` — `fix(auth): add demo mode and harden production authentication` |
| Remote SHA (re-fetched) | `b0b5dbc3bd8c3b105cac83db2abc69b56f81d2a8` (identical to local HEAD) |
| Working tree | clean, no secrets (tree + history scans) |
| Vercel | CLI logged out; temporary deploys require login → **deployment NOT verifiable from this environment**. GitHub→Vercel chain: push succeeded; Vercel must be re-deployed (or reconnected) from this commit with `REACT_APP_BACKEND_URL` set to a hosted backend instance. |
| PR to `main` | #1 remains the path for the default-branch ZIP workflow (session may only push to the arena branch). |
