#!/usr/bin/env node
/**
 * inject-analytics.mjs
 *
 * Normalizes analytics markup across every HTML file so GTM owns measurement.
 *
 * It removes any previously injected direct Google Tag (gtag.js) block and the
 * legacy GTM noscript iframe, then ensures the GTM head loader exists exactly
 * once.
 *
 * Injects into <head> (right after opening <head> tag):
 *   1. <link rel="preconnect"> for googletagmanager.com
 *   2. Google Tag Manager loader <script>
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
const GTM_HEAD =
  `<!-- Google Tag Manager -->\n` +
  `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
  `})(window,document,'script','dataLayer','${GTM_ID}');</script>\n` +
  `<!-- End Google Tag Manager -->`;

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

  // Remove legacy noscript iframe and any previously hardcoded direct gtag
  // block so GTM remains the single analytics owner in page source.
  html = html.replace(GTM_BODY_RE, '');
  html = html.replace(GOOGLE_TAG_RE, '');

  const needsPreconnect = !html.includes('preconnect" href="https://www.googletagmanager.com"');
  const needsGtmHead = !html.includes(GTM_ID);
  const headParts = [];
  if (needsPreconnect) headParts.push(PRECONNECT);
  if (needsGtmHead) headParts.push(GTM_HEAD);

  if (headParts.length > 0) {
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
