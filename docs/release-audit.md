# NafaMitra — Release Audit & Deployment Recovery

_Status: AUDIT PHASE (live document — final results appended in Part 31)_
_Date: 2026-10-05 (Asia/Calcutta)_

## 1. Repository state (verified from Git, not assumptions)

| Item | Value | How verified |
|---|---|---|
| Repository | `https://github.com/Rits9090/NAFAMITRA.git` | `git remote -v` |
| Current branch | `arena/01a100e8-nafamitra` | `git branch --show-current` |
| Local HEAD SHA | `805a1f290e22a9c5b3d3282246c9e8bec8d1c7ec` | `git rev-parse HEAD` |
| Remote SHA (same branch) | `805a1f290e22a9c5b3d3282246c9e8bec8d1c7ec` — **identical** | `git ls-remote origin` |
| Default branch | `main` @ `e95507768513feefe184287bf41a2daeed6d60fe` | `gh repo view`, `git ls-remote` |
| Working tree | **clean** (`nothing to commit`) | `git status` |
| Staged changes | none | `git diff --cached` |
| Detached HEAD | no | `git status` |
| Merge conflicts | none | `git status` |
| Auth for GitHub | `gh` logged in as `Rits9090`; push verified working | `gh auth status`, successful `git push` earlier this session |

### What happened to the workspace (important)

The coding workspace's `.git` was **re-cloned** (fresh depth-1 clone of `main`
only) while the working-tree files were preserved. Audit sequence run:

1. `git status` showed the entire feature set as 35 modified + ~50 untracked files
   on top of a single grafted commit `e955077` — looked like "all previous work uncommitted".
2. `git ls-remote origin` proved GitHub still holds branch
   `arena/01a100e8-nafamitra` = `805a1f2` (the previous push had survived).
3. `git fetch` + `git add -A` + `git diff --cached FETCH_HEAD` → **0 lines** —
   the dirty tree was byte-identical to `805a1f2`.
4. `git reset --hard FETCH_HEAD` → local branch restored to `805a1f2`, clean tree.

**Conclusion:** previous work WAS already committed (`805a1f2` and its ancestors
`fc53875`, `9669f6d`, …) and WAS already pushed (remote branch tip matches).
No duplicate commit was created. HEAD now equals remote tip.

## 2. Deployment architecture (as verified in the repo)

| Aspect | Finding |
|---|---|
| Frontend framework | **Create React App (react-scripts) via CRACO** — NOT Vite, NOT Next.js. `frontend/package.json` scripts: `start = craco start`, `build = craco build`. |
| Routing | `react-router-dom` `BrowserRouter`, **client-side SPA**, no `basename`. Routes: `/auth`, `/onboarding`, `/receipt/:token`, `/c/passbook`, `/` → merchant routes (`dashboard`, `billing`, `bills`, `customers`, `products`, `credit`, `loyalty`, `staff`, `more`, `suppliers`, `reports`, `voice`, `assistant`, `settings`, `marketing`, `requirements`), `/c/*` customer routes (`bills`, `loyalty`, `credit`, `search`, `nafa`, `notifications`, `profile`, `stores`, `stores/:storeId`, `brain`). |
| Backend | **FastAPI** (`backend/server.py`) + MongoDB (`MONGO_URL`) with in-memory `mongomock_motor` fallback for dev. Runs separately (uvicorn). **Not** part of a Vercel ZIP deployment. |
| Supabase | **NOT USED.** Zero matches for `supabase` repo-wide (code, config, docs). Auth is a custom FastAPI phone+OTP system (`backend/routes/auth_routes.py`, `backend/otp_service.py`, `backend/identity.py`) with JWT sessions. The Supabase sections of the brief do not apply to this repository; recorded here so the record is honest. |
| Repository layout | Monorepo-ish: app lives in `frontend/`; **no `package.json` or `index.html` at repo root**; `backend/` separate; `docs/` documentation. |
| Lockfile | `frontend/yarn.lock` only (single lockfile; no `package-lock.json`, no `pnpm-lock.yaml`). Package manager: **yarn (v1)**. |
| PWA | Yes — `frontend/public/sw.js` (offline shell; navigations network-first; API never cached; hash-safe cache-first static assets; old caches deleted on activate), `manifest.json`, icons 192/512, registered unconditionally in `src/index.js`. |
| vercel.json | **Does not exist anywhere in the repo** (root or frontend). |
| vite.config / tsconfig | none (not a Vite/TS project). |
| Homepage field | absent → CRA emits root-absolute asset URLs (`/static/...`) — correct for domain-root hosting. |

## 3. Suspected blank-screen causes (to be proven by test)

1. **GitHub ZIP = `main` = `e955077`** — a stale, pre-feature snapshot. All
   feature work lives only on `arena/01a100e8-nafamitra`. *(verified: `git ls-remote`)*
2. **Repo root has no `package.json`/`index.html`** — a ZIP deployed with Vercel
   root = repository root cannot be detected or built as a web app, and static
   serving of the root yields no `index.html` → blank/404. *(verified: root tree listing)*
3. **`CI=true` × CRA warnings-as-errors** — Vercel sets `CI=true`, which makes
   `react-scripts`/`craco build` fail on ESLint warnings (this codebase has
   warnings, e.g. `react-hooks/exhaustive-deps`). *(build reproduction in progress)*
4. Runtime crash of the built bundle — to be falsified with a headless render
   smoke test against the **production build** (not the dev server).
5. Service-worker staleness — code review says low risk (network-first
   navigations, content-hashed assets); will note but not “fix” what isn't broken.

## 4. Environment variables (full table populated in final report)

Frontend (`process.env.REACT_APP_*`, build-time):

| Variable | Used by | Required at build? | Required at runtime? | Safe to expose? | Vercel scope |
|---|---|---|---|---|---|
| `REACT_APP_BACKEND_URL` | `src/lib/api.js` → `API_BASE` | No (defaults to same-origin `/api`) | Yes in production (else `/api` 404s — app still renders) | Yes (public URL) | Project (both build + runtime baked at build) |
| `REACT_APP_VERSION` | `src/lib/config.js` | No (defaults `1.0.0`) | No | Yes | optional |
| `REACT_APP_SUPPORT_WHATSAPP` | `src/lib/config.js` | No (empty = action hidden) | No | Yes (public number) | optional |

Backend (`os.environ`, server-side — none belong in Vercel frontend deploy):

`MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `JWT_SECRET`, `ALLOW_INSECURE_JWT`,
`OTP_PROVIDER`, `OTP_DEV_MODE`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`,
`OTP_RESEND_COOLDOWN`, `OTP_MAX_SENDS`, `OTP_HASH_SALT`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
`SUPPORT_WHATSAPP_NUMBER`, `SUPPORT_EMAIL`, `ADMIN_PHONES`,
`SESSION_TOKEN_DAYS`, `PORTAL_TOKEN_MINUTES`, `BUSINESS_TIMEZONE`,
`DEFAULT_LANGUAGE`, `FEATURE_*`, `BASE…`, `BACKEND_PROXY_TARGET` (dev only).

Secrets handling verified: no `.env` ever committed (`git log --all --diff-filter=A -- "*.env"` empty); repo-wide scan for `service_role`/`sk_live`/`AIza…`/`ghp_…`/JWT keys: **no hits**. `JWT_SECRET` falls back to an **ephemeral random secret** (never a hardcoded default unless `ALLOW_INSECURE_JWT=true`).

## 5. Blocked actions (access-dependent)

- **Vercel CLI / token**: `vercel` binary not installed, no `VERCEL_TOKEN` in
  environment → cannot create or inspect a real Vercel deployment from this
  sandbox. All verification therefore done against the locally reproduced
  production artifact (`frontend/build` served statically with SPA fallback,
  matching Vercel's static hosting semantics).
- **Merging to `main`**: this session is bound to
  `arena/01a100e8-nafamitra` and may not push to any other branch. A pull
  request from the arena branch to `main` is opened instead; merging it (or
  pointing Vercel at the arena branch) is the remaining user-side switch.
