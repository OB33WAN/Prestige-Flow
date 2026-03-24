#!/usr/bin/env node
/**
 * inject-analytics.mjs
 *
 * Injects the direct Google Tag (gtag.js, G-ZN2XZLEJ3J) into every HTML file
 * in the project.
 *
 * It also removes any previously injected GTM noscript iframe and normalizes
 * the direct Google tag block so it remains HTML/JS only, with no iframe.
 *
 * Injects into <head> (right after opening <head> tag):
 *   1. <link rel="preconnect"> for googletagmanager.com
 *   2. Google Tag Manager loader <script>
 *   3. gtag.js <script async> + direct gtag('config') initialisation
 *
 * Usage:
 *   node scripts/inject-analytics.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const GTM_ID = 'GTM-TL8TG8CW';
const GA4_ID = 'G-ZN2XZLEJ3J';
const GT1_ID = 'GT-TNFNVQQZ';
const AW_ID = 'AW-17754305332';
const GT2_ID = 'GT-NGKVLSZN';

const GTM_HEAD =
  `<!-- Google Tag Manager -->\n` +
  `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
  `})(window,document,'script','dataLayer','${GTM_ID}');</script>\n` +
  `<!-- End Google Tag Manager -->`;

// Direct Google Tag (gtag.js) — HTML/JS only, no iframe.
const GTAG_HEAD =
  `<!-- Google tag (gtag.js) -->\n` +
  `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>\n` +
  `<script>\n` +
  `  window.dataLayer = window.dataLayer || [];\n` +
  `  function gtag(){dataLayer.push(arguments);}\n` +
  `  gtag('js', new Date());\n` +
  `  gtag('config', '${GA4_ID}');\n` +
  `  gtag('config', '${GT1_ID}');\n` +
  `  gtag('config', '${AW_ID}');\n` +
  `  gtag('config', '${GT2_ID}');\n` +
  `</script>\n` +
  `<!-- End Google tag -->`;

// Preconnect hint
const PRECONNECT =
  `<link rel="preconnect" href="https://www.googletagmanager.com">`;

const GTM_BODY_RE = /<!-- Google Tag Manager \(noscript\) -->\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=[^"]+"\s*height="0" width="0" style="display:none;visibility:hidden"><\/iframe><\/noscript>\s*<!-- End Google Tag Manager \(noscript\) -->\s*/g;
const GOOGLE_TAG_RE = /<!-- Google tag \(gtag\.js\) -->\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-ZN2XZLEJ3J"><\/script>\s*<script>[\s\S]*?<\/script>\s*<!-- End Google tag -->/g;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs']);

function* walkHtml(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkHtml(full);
    } else if (entry.endsWith('.html')) {
      yield full;
    }
  }
}

let updated = 0;
let skipped = 0;

for (const file of walkHtml(ROOT)) {
  let html = readFileSync(file, 'utf8');

  const original = html;

  // Remove any previously injected GTM noscript iframe and existing gtag
  // block so we can reinsert the exact normalized snippet once.
  html = html.replace(GTM_BODY_RE, '');
  html = html.replace(GOOGLE_TAG_RE, '');

  const needsPreconnect = !html.includes('preconnect" href="https://www.googletagmanager.com"');
  const needsGtmHead = !html.includes(GTM_ID);
  const headParts = [];
  if (needsPreconnect) headParts.push(PRECONNECT);
  if (needsGtmHead) headParts.push(GTM_HEAD);
  headParts.push(GTAG_HEAD);

  if (!html.includes(GA4_ID)) {
    html = html.replace(/(<head[^>]*>)/, `$1\n${headParts.join('\n')}`);
  }

  if (html === original) {
    skipped++;
    continue;
  }

  writeFileSync(file, html, 'utf8');
  updated++;
  console.log(`  updated: ${relative(ROOT, file)}`);
}

console.log(`\nDone: ${updated} files updated, ${skipped} already normalized.`);
