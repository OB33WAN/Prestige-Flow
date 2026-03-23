#!/usr/bin/env node
/**
 * inject-analytics.mjs
 *
 * Injects Google Tag Manager (GTM-TL8TG8CW) into every HTML file in the
 * project. Idempotent — skips files that already contain the container ID.
 *
 * Injects:
 *   1. GTM <script> snippet  → immediately after the opening <head> tag
 *   2. GTM <noscript> iframe → immediately after the opening <body> tag
 *   3. <link rel="preconnect"> for googletagmanager.com (alongside step 1)
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

// Official GTM head snippet — placed as high in <head> as possible
const HEAD_SNIPPET =
  `<!-- Google Tag Manager -->\n` +
  `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
  `})(window,document,'script','dataLayer','${GTM_ID}');</script>\n` +
  `<!-- End Google Tag Manager -->`;

// Preconnect hint for GTM — reduces DNS + TLS negotiation latency
const PRECONNECT_SNIPPET =
  `<link rel="preconnect" href="https://www.googletagmanager.com">`;

// Official GTM body noscript snippet — placed as high in <body> as possible
const BODY_SNIPPET =
  `<!-- Google Tag Manager (noscript) -->\n` +
  `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"\n` +
  `height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n` +
  `<!-- End Google Tag Manager (noscript) -->`;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'docs']);

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

  // Idempotency check — skip if container ID already present
  if (html.includes(GTM_ID)) {
    skipped++;
    continue;
  }

  // 1. Inject preconnect + GTM head snippet immediately after <head> tag
  html = html.replace(
    /(<head[^>]*>)/,
    `$1\n${PRECONNECT_SNIPPET}\n${HEAD_SNIPPET}`
  );

  // 2. Inject GTM noscript immediately after opening <body> tag
  html = html.replace(
    /(<body[^>]*>)/,
    `$1\n${BODY_SNIPPET}`
  );

  writeFileSync(file, html, 'utf8');
  updated++;
  console.log(`  updated: ${relative(ROOT, file)}`);
}

console.log(`\nDone: ${updated} files updated, ${skipped} already had GTM (${GTM_ID}).`);
