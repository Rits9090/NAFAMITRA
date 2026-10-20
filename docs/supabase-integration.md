# NafaMitra — Supabase Integration & External Configuration

_Status: 2026-10-20 · Branch `arena/01a100e8-nafamitra`_

This document records exactly what was configured in code, what remains as
external configuration, and how to verify each part. Nothing here is claimed
as "live-verified" unless the Verification column says so.

## 1. Project values (as instructed)

| Item | Value | Where it lives |
|---|---|---|
| Supabase URL | `https://izfcjxabnahcsmzhosuo.supabase.co` | `REACT_APP_SUPABASE_URL` (client), `SUPABASE_URL` (backend) |
| Publishable key | `sb_publishable_bjd8MRJ4BjkzpzixFe_SCQ_og0wGq-c` | `REACT_APP_SUPABASE_PUBLISHABLE_KEY` (client, public by design) |
| Local env file | `frontend/.env.local` (gitignored) | also contains `REACT_APP_ENABLE_DEMO=1` for test builds only |
| Template | `frontend/.env.example` (committed, placeholders) | documents both names |

**Never** place here: DB passwords, `service_role`/secret keys, SMTP credentials,
`SUPABASE_JWT_SECRET` (backend-only). Verified: the production bundle contains
the URL + publishable key only; no `sb_secret_*`, no JWT secrets (grep of
`build/static/js`).

## 2. Architecture (what changed in code)

- **Identity = Supabase Auth** (email/password + Google OAuth, PKCE, callbacks
  at `/auth/callback`). Single client: `frontend/src/lib/supabase.js`;
  reusable actions: `frontend/src/lib/authActions.js`; session context:
  `frontend/src/context/AuthContext.js` (restores session, subscribes to
  auth-state, sends the access token to the existing API on all three
  transport channels).
- **Data API = existing FastAPI backend (unchanged data model).**
  `backend/supabase_auth.py` verifies Supabase access tokens:
  HS256 with `SUPABASE_JWT_SECRET` when set, else RS256 via
  `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (cached 1 h).
  Tokens with this project's `iss` that fail verification are rejected
  outright — they never fall back to legacy verification.
- **Profile:** app profile id **is** the auth UUID (`sub`). First `/auth/me`
  creates the row idempotently (`created_via: 'supabase'`); later logins only
  fill blank fields. Accounts sharing an email are **never** merged silently
  (the Supabase profile records `supabase_email` instead of claiming the
  unique `email` column).
- **Mobile number:** optional profile data only — captured at signup as
  `user_metadata.phone_number` (no session needed pre-confirmation), edited
  later via `PUT /api/auth/profile`, stored in the existing profile columns
  `phone`/`phone_normalized` (canonical 10-digit Indian form, validated).
  No OTP, no verification flags, never used for auth or identity.

## 3. Backend environment (production)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | enables Supabase token verification (JWKS mode) |
| `SUPABASE_JWT_SECRET` | optional* | *Set it if the backend host cannot reach `supabase.co` (JWKS needs egress). Server-side secret — dashboard → Settings → API. |
| `ALLOW_PHONE_OTP` | **leave unset** | default OFF → `/auth/request-otp`, `/auth/verify-otp` return 403 |
| `ALLOW_LEGACY_PASSWORD_AUTH` | **leave unset** | default OFF → `/auth/login`, `/auth/register` return 403 |
| `ALLOW_SEED` | **leave unset** | default OFF → `/api/seed` returns 404 |
| `JWT_SECRET` | recommended | legacy portal/magic-link tokens; ephemeral when unset |

Verified locally (no `ALLOW_*` env): request-otp **403**, seed **404**,
password login **403** — with localized messages, no bypass. Test runs enable
the three flags explicitly and are never how production is launched.

## 4. Vercel (deployment)

Project settings → Environment Variables → add for Production/Preview:

```
REACT_APP_SUPABASE_URL=https://izfcjxabnahcsmzhosuo.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_bjd8MRJ4BjkzpzixFe_SCQ_og0wGq-c
```

- Do **not** define `REACT_APP_ENABLE_DEMO` in Vercel — demo entry/flag-bypass
  is compiled out of builds without it (verified: bundle grep + poisoned-flag
  test in `scripts/prod_safety_e2e.js`).
- Do **not** add DB passwords or service-role keys (frontend vars are public).
- **Blocked here:** no Vercel CLI/token in this environment, so these variables
  could not be set and no redeploy was performed. Live URL still serves the
  previous deployment until someone with access adds the vars and redeploys.

## 5. Supabase dashboard — Auth URL Configuration

Site URL: `https://nafamitra-arena-01a100e8-nafamitra.vercel.app`

Redirect URLs (allow exactly what's needed):

```
https://nafamitra-arena-01a100e8-nafamitra.vercel.app/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
https://*-e2b.app/auth/callback        (preview environments, if used)
```

## 6. Google OAuth (external — Blocked by external configuration)

Application code is complete (`signInWithOAuth({provider:'google'})` →
`/auth/callback`, cancellation/error mapping, no profile duplication on
repeat logins). To go live:

1. Google Cloud → OAuth consent screen (External) → publish or add test users.
2. Credentials → OAuth client ID → **Web application**.
3. Authorized JavaScript origins: your Site URL origin.
4. Authorized redirect URI: the **Google** callback URL shown in Supabase
   Auth → Sign In / Providers → Google (it has the form
   `https://<ref>.supabase.co/auth/v1/callback`).
5. Copy client ID + secret into Supabase provider config (secret stays in
   Supabase — never in this repo).
6. Add the app redirect (`…/auth/callback`) to Supabase redirect allow-list.
7. Test the round trip. Status here: **not live-tested** (no dashboard access
   from this environment; provider button shows a mapped configuration error
   if Google is not enabled — verified mapping exists, not the success path).

Docs: https://supabase.com/docs/guides/auth/social-login/auth-google

## 7. Email delivery

- Confirmation & recovery emails use GoTrue's default SMTP (rate-limited on
  free projects; deliverability fine for pilots). For production volume set
  **Auth → SMTP Settings** (custom provider) — external step, not done here.
- UI states implemented: pending-confirmation + resend, recovery-sent (only
  after server acknowledgement), expired/invalid link, reset-password success
  only after `updateUser` confirms.

## 8. Database / RLS (remote inspection — Blocked by external configuration)

This application **does not expose any table through the Supabase Data API**
(all reads/writes go through the authorized FastAPI layer: memberships,
`X-Shop-Id` verification, portal scope — the existing authorization layer for
Mongo, exercised by 35 pytest + 136 journey checks). No new Supabase tables
were required, so no migration was written — creating unused tables would
violate the "no duplicate schema" rule.

The remote project could not be inspected (no CLI token, network blocked).
Run these **read-only** statements in the SQL editor to audit leftovers:

```sql
select schemaname, tablename from pg_tables
 where schemaname not in ('pg_catalog','information_schema');
select schemaname, tablename, rowsecurity
  from pg_tables where schemaname = 'public';
```

If any `public` tables exist that are not part of this app, either drop them
after review or secure them:

```sql
alter table public.<name> enable row level security;
-- deny-by-default: add only the policies you can name owners for
```

`supabase/config.toml` (standard CLI init) is committed; migrations directory
is intentionally empty (nothing to apply).

**Password rotation:** a DB password previously shared in chat is treated as
exposed. This work used **no direct PostgreSQL connection**; before any future
local `psql`/Studio use, rotate the password in the dashboard and pass it only
through a secure secret mechanism (never chat, argv, or logs).

## 9. Supabase CLI

- Installed: `supabase` **2.121.0** (`npm i -g supabase`), `supabase init`
  done (`supabase/config.toml`).
- `supabase login` / `link --project-ref izfcjxabnahcsmzhosuo`: **blocked** —
  requires a real `sbp_…` access token (`SUPABASE_ACCESS_TOKEN`) and network
  reachability to Supabase, neither available in this environment. Exact
  remaining step: run `supabase login` in a trusted TTY (or export the token
  from a secret store) and then `supabase link --project-ref izfcjxabnahcsmzhosuo`.
- Never run `db reset`/destructive commands against this project.

## 10. Verification performed (this environment)

| Check | Result |
|---|---|
| Live reachability `izfcjxabnahcsmzhosuo.supabase.co` (curl) | blocked (SSL_ERROR_SYSCALL/http=000) → live signup/OAuth/RLS **not** testable here |
| Minted HS256 Supabase-shaped token → `GET /api/auth/me` | **200**, profile id = `sub`, `created_via: supabase` |
| Repeat `GET /api/auth/me` | same single profile (idempotent) |
| `PUT /api/auth/profile` (+91 format) | 200 → normalized `9876511111` |
| Invalid phone | 400 `invalid_phone` localized |
| Forged signature | 401 |
| pytest (`test_supabase_auth.py` added) | **35/35** |
| journey_smoke | **136/136** |
| Auth gates default-off (fresh env) | 403/404/403 verified |
| `login_e2e` (jsdom) | **PASS** — submission URL proves project `izfcjxabnahcsmzhosuo.supabase.co`, pkce token endpoint, phone in `user_metadata` only, honest network error, no fake session |
| `auth_error_e2e` html404/rate429/badphone | **PASS ×3** |
| `prod_safety_e2e` (demo-disabled build, 19 checks) | **PASS** — no demo code/UI, poisoned flag ignored+purged, correct project, **ZIP simulation (no `.env.local`) also PASS**: runtime `env.js` config → no "not configured" banner, sign-in reaches project, Google initiates OAuth, `404.html` SPA fallback present |
| `render_smoke` / `demo_e2e` / `qa_e2e` (12/12) / `i18ncheck` **939 keys** | **PASS** |
| `login_e2e` incl. `isAuthMePayload` unit (HTML/null/array rejected) | **PASS (27 checks)** |
| `CI=true yarn build` | **PASS** (warnings-as-errors) |


## 11. Self-hosted static builds (GitHub ZIP / GitHub Pages / any static host)

A build made from a plain GitHub ZIP has **no `.env.local`** (it is gitignored),
so the old bundle shipped with empty Supabase config — users saw
"Sign-in is not configured, please contact administrator" and Google showed a
generic error. Fixed with runtime configuration:

| Piece | File | Purpose |
|---|---|---|
| Runtime public config | `frontend/public/env.js` (`window.__NAFAMITRA_ENV__`) | Publishable Supabase URL + key + backend URL. Ships inside `build/`; **editable after download — no rebuild needed**. Build-time env still wins when present. |
| Loader | `frontend/public/index.html` | Loads `env.js` before the app bundle. |
| Prod defaults | `frontend/.env.production` (committed) | Demo flag defined-as-empty for production builds so demo code is dead-code-eliminated even with no other env file. `.env.local` outranks it for local dev builds. |
| SPA fallback | `build/404.html` (written by `scripts/postbuild.js`) | Static hosts (GitHub Pages) 404 on deep links (`/auth/callback`) without a rewrite rule; the host serves `404.html` → the SPA boots on any URL. |
| API identity guard | `isAuthMePayload` in `src/lib/api.js` + `AuthContext.loadMe` | Static hosts answer unknown paths — including `/api/*` — with `200 text/html`; that body is rejected (never a fake session) and the UI shows an honest localized `auth.errBackendUnavailable` boot note. |

**Backend**: a static host has no `/api`. Either deploy the FastAPI backend and
set `REACT_APP_BACKEND_URL` (in `env.js`, without the `/api` suffix) — e.g.
`https://your-api.onrender.com` — or put the API on the same origin under
`/api` via a proxy. Without one, dashboards cannot load data (clearly reported,
never silently broken).

**Supabase dashboard for YOUR origin** (external, per-user):
1. Authentication → URL Configuration → add your exact origin: Site URL
   `https://<your-host>` and Redirect URLs `https://<your-host>/auth/callback`
   (plus `http://localhost:3000/auth/callback` for local dev).
2. Authentication → Providers → enable **Google** (client secret stays in
   Supabase) and add the same redirect URLs.
3. Passwords: never commit them. If a database password or connection string
   was ever pasted into a chat/ticket, treat it as exposed and rotate it in
   Supabase (Settings → Database) before any direct DB use — the app itself
   never needs it (only the publishable URL/key go in `env.js`).

**Never** put `sb_secret_*`, JWT secrets, DB passwords or SMTP credentials in
`env.js` (it is public by definition) or anywhere in the frontend bundle.
