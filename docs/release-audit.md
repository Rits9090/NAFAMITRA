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

---

# PART 31 — FINAL RELEASE REPORT (verified results)

## Repository

| Item | Value |
|---|---|
| GitHub repository | `https://github.com/Rits9090/NAFAMITRA` |
| Production-intent branch | `arena/01a100e8-nafamitra` (session branch; PR #1 opens it into `main` for the default-branch ZIP) |
| Final code commit SHA | `37917b3ef45ed4b005e191e2a183fa3bb7e8a96c` — `fix(deploy): make NafaMitra production build Vercel-compatible` |
| Previous feature commit | `805a1f290e22a9c5b3d3282246c9e8bec8d1c7ec` (customer upgrade Phase-2; verified already pushed before this release work) |
| Working tree status | clean; local HEAD == remote SHA (re-fetched and compared) |
| Pull request | #1 `arena/01a100e8-nafamitra` → `main`, state OPEN, mergeable |
| Secrets in commits | none (scan + full git history for `.env`/`.pem`/`.key`: empty) |

## Deployment

| Item | Value |
|---|---|
| Framework | Create React App (react-scripts) via CRACO — static SPA, **not Vite, not Next.js, not Supabase** |
| Package manager | yarn v1 (`frontend/yarn.lock` is the only lockfile) |
| Build command (Vercel) | `cd frontend && yarn build` (from root `vercel.json`) |
| Output directory | `frontend/build` |
| Root directory | repository root (root `vercel.json` points into `frontend/`) |
| Routing strategy | client-side `BrowserRouter`; SPA rewrite `/(.*) → /index.html` in `vercel.json` |
| PWA strategy | `sw.js` offline shell: navigations network-first, API never cached, content-hashed assets cache-first; manifest + icons present in build |
| Required env (frontend, build-time) | `REACT_APP_BACKEND_URL` (recommended in production — points the static bundle at a hosted FastAPI instance; optional at build, defaults to same-origin `/api`) |
| Backend | FastAPI + MongoDB, hosted separately (NOT part of the static Vercel deploy) |

## Root cause of the blank screen (concrete, verified)

1. **The ZIP being deployed is the wrong artifact.** GitHub's "Download ZIP" uses the
   default branch = `main` @ `e955077` — a pre-feature snapshot. All feature work
   (and the deployment fixes) live only on `arena/01a100e8-nafamitra`.
2. **No deployable configuration for the monorepo layout.** The repo root has no
   `package.json`/`index.html` and no `vercel.json`; a deployment pointed at the
   repository root cannot be detected or built, and static serving of the root has
   no `index.html` → blank/404. Demonstrated live: nested route without SPA
   fallback returns **404** (`/c/brain` on a fallback-less static server) while the
   configured deployment returns **200** with the app shell.
3. **Vercel's default `CI=true` failed the build.** Reproduced exactly:
   `CI=true yarn build` → `Treating warnings as errors because process.env.CI = true.` →
   **exit 1** on 4 `react-hooks/exhaustive-deps` warnings (AuthContext/Products/Reports).
   A failed build leaves nothing (or a stale deployment) to serve.

Non-causes verified (tested, not assumed): runtime JS crash of the built bundle
(render smoke: 0 page errors), missing service-worker/manifest assets (present,
valid), wrong asset base paths (root-absolute `/static/...`, correct at domain
root), backend-down blanking the shell (render smoke against a build with **no**
API still renders brand + full login UI, 0 errors), case-sensitive imports
(full Linux build resolves), stale service-worker chunks (network-first
navigations + hashed assets; old caches purged on activate).

## Fixes (all in commit `37917b3`)

1. **`vercel.json` (repo root)** — `installCommand`/`buildCommand` scoped into
   `frontend/`, `outputDirectory: frontend/build`, SPA rewrite. A GitHub ZIP now
   deploys from the repository root with zero dashboard configuration.
2. **CI=true build passes** — resolved all 4 lint warnings with truthful
   `useCallback`/dependency fixes (verified zero behavior change: memoized
   identities are stable or equivalent to existing effect deps). Final build:
   `Compiled successfully`, **0 warnings, exit 0 under CI=true**.
3. **Global `ErrorBoundary`** (`src/components/ErrorBoundary.js`, mounted in
   `App.js` inside `I18nProvider`) — localized recovery screen using new
   `common.errorMsg` key (mr/en/hi parity, i18ncheck 8/8 @ **829 keys ×3**);
   catches render crashes and stale lazy chunks instead of white-screening;
   full error still logged to console for developers.
4. **`login_e2e.js` `SMOKE_URL` override** — smoke tests can target any
   deployment preview, not just :3000.

## Verification record (the exact artifact Vercel would serve)

| Check | Result |
|---|---|
| Clean install (`yarn install --frozen-lockfile`) | exit 0 (37.8s) |
| Production build (`CI=true yarn build`) | **exit 0**, "Compiled successfully", 0 warnings |
| Artifact inspection | `index.html` references `/static/js/main.*.js` + CSS; 34 JS chunks; manifest/icons/sw present; no `/src/` dev refs |
| Render smoke (prod build + API) | **PASS**, brand ✓, 0 page errors |
| Render smoke (prod build, backend down) | **PASS**, 0 page errors — no blank screen |
| Login e2e (full OTP flow, prod build) | **PASS**, `/auth/request-otp → verify → /auth/me` all 200, 0 page errors |
| Root `/` direct load | 200 + app shell |
| Nested routes direct load (`/auth`, `/c/brain`, `/c/stores`, `/billing`, `/receipt/:t`) | 200 + app shell (SPA rewrite); **404 without fallback** (control test) |
| Static assets | `main.js` 200, `text/javascript` |
| API health via preview proxy | `{"status":"ok",...}` |
| i18ncheck | **8/8**, 829 keys × 3 languages |
| journey_smoke (full stack) | **136/136** |
| pytest | **22/22** |
| Bundle | main 553 KB raw / **150 KB gzip**; 34 lazy chunks (6.6 MB raw total, route-split) |
| Git push | success; local HEAD == `origin/arena/01a100e8-nafamitra` == `37917b3` re-fetched |
| Secrets scan (tree + full history) | clean |

## Blockers (not verified — access unavailable)

- **Real Vercel preview/production deployment**: `vercel whoami` → *Logged out*;
  `vercel deploy --temporary` → *"Temporary deployments aren't available for this
  attempt. Log in to continue."* No `VERCEL_TOKEN` in the environment. Creating a
  deployment requires your Vercel login/token — not attempted (credentials must
  never be requested in chat). **Everything above was verified against the
  locally reproduced production artifact instead.**
- **`main` update**: this session may only push to
  `arena/01a100e8-nafamitra`. PR **#1** (arena → main) is OPEN and MERGEABLE —
  merging it (or pointing the Vercel project at the arena branch) is the switch
  that completes `GITHUB → VERCEL` for the default-branch ZIP workflow.
