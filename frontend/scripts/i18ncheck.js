#!/usr/bin/env node
/* i18n completeness gate: mr/en/hi must expose identical key sets. */
const path = require('path');

function loadDict(lang) {
  const file = path.join(__dirname, '..', 'src', 'i18n', `${lang}.js`);
  let code = require('fs').readFileSync(file, 'utf8');
  code = code.replace(/export\s+default\s+/, '').trim().replace(/;$/, '');
  // Files are pure object literals (comments allowed) — evaluate directly.
  // eslint-disable-next-line no-new-func
  return new Function(`return (${code})`)();
}

function flatten(obj, prefix = '', into = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, into);
    else into.add(key);
  }
  return into;
}

const langs = ['mr', 'en', 'hi'];
const dicts = {};
let failed = false;
for (const lang of langs) {
  try {
    dicts[lang] = flatten(loadDict(lang));
  } catch (e) {
    console.error(`FAIL ${lang}: ${e.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);

const base = dicts.mr;
const missing = (lang) => [...base].filter((k) => !dicts[lang].has(k));
const extra = (lang) => [...dicts[lang]].filter((k) => !base.has(k));

let checks = 0;
const report = (name, ok, detail) => {
  checks += 1;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

report('key counts equal', langs.every((l) => dicts[l].size === base.size),
  langs.map((l) => `${l}=${dicts[l].size}`).join(' '));
for (const lang of ['en', 'hi']) {
  report(`${lang} has no missing keys vs mr`, missing(lang).length === 0,
    missing(lang).slice(0, 5).join(', '));
  report(`${lang} has no extra keys vs mr`, extra(lang).length === 0,
    extra(lang).slice(0, 5).join(', '));
}
// placeholder consistency for a few high-traffic keys
const PLACEHOLDER_KEYS = ['mkt.audienceCount', 'mkt.chars', 'mkt.audienceSample'];
for (const key of PLACEHOLDER_KEYS) {
  const ph = (lang) => {
    const v = [...dicts[lang]].includes(key);
    if (!v) return null;
    const dict = loadDict(lang);
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), dict);
    return typeof val === 'string' ? (val.match(/\{\w+\}/g) || []).sort().join(',') : null;
  };
  const p = ph('mr');
  report(`placeholders match for ${key}`, p !== null && ['en', 'hi'].every((l) => ph(l) === p), `mr=[${p}]`);
}

console.log(`\n${checks - (failed ? 1 : 0)}/${checks} i18n checks passed — ${base.size} keys per language`);
process.exit(failed ? 1 : 0);
