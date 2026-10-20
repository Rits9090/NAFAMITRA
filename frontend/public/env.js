/**
 * PUBLIC runtime configuration — this file ships to every browser.
 * Publishable values ONLY: never put database passwords, service-role/secret
 * keys, SMTP credentials, or SUPABASE_JWT_SECRET here.
 *
 * Why it exists: CRA bakes REACT_APP_* env vars in at `yarn build`, so a
 * build made from a plain GitHub ZIP (no .env.local) had no Supabase config
 * and showed "Sign-in is not configured". Editing THIS file after
 * downloading/hosting applies without rebuilding. Build-time env (.env /
 * Vercel project settings) still wins when present.
 */
window.__NAFAMITRA_ENV__ = {
  // Supabase project (Settings → API)
  REACT_APP_SUPABASE_URL: 'https://izfcjxabnahcsmzhosuo.supabase.co',
  REACT_APP_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_bjd8MRJ4BjkzpzixFe_SCQ_og0wGq-c',

  // Your FastAPI backend base URL WITHOUT the /api suffix, e.g.
  // 'https://nafamitra-api.onrender.com'. Leave '' only when the backend is
  // served on the SAME origin under /api. Static hosts (GitHub Pages, plain
  // S3, etc.) have no /api — set this or data screens cannot load.
  REACT_APP_BACKEND_URL: '',
};
