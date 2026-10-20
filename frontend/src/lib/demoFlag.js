/**
 * Build-time demo switch.
 *
 * Demo exploration (local fixtures, no session) only exists when the build
 * defines REACT_APP_ENABLE_DEMO=1 — local/test builds set it in .env.local;
 * production (Vercel) does not, so the demo entry, guard bypass and fixture
 * adapter are dead-code-eliminated from production bundles entirely.
 */
export const DEMO_ENABLED = process.env.REACT_APP_ENABLE_DEMO === '1';
export default DEMO_ENABLED;
