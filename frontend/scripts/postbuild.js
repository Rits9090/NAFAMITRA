/**
 * Post-build step: GitHub Pages (and similar static hosts) have no SPA
 * rewrite — deep links like /auth or /auth/callback would 404 on refresh.
 * The host automatically serves `404.html` for missing paths; copying
 * index.html there makes any URL fall back to the SPA.
 */
const fs = require('fs');
const path = require('path');

const buildDir = path.resolve(__dirname, '..', 'build');
const index = path.join(buildDir, 'index.html');
const notFound = path.join(buildDir, '404.html');

if (!fs.existsSync(index)) {
  console.error('postbuild: build/index.html missing — run craco build first');
  process.exit(1);
}
fs.copyFileSync(index, notFound);
console.log('postbuild: wrote build/404.html (SPA fallback for static hosts)');
