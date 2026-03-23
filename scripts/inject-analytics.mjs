#!/usr/bin/env node
/**
 * inject-analytics.mjs
 *
 * Injects Google Tag Manager (GTM-TL8TG8CW) and the direct Google Tag
 * (gtag.js, G-ZN2XZLEJ3J) into every HTML file in the project.
 * Idempotent — each snippet is only injected if its marker is absent.
 *
 * Injects into <head> (in order, right after opening <head> tag):
 *   1. <link rel="preconnect"> for googletagmanager.com
 *   2. GTM loader <script>
 *   3. gtag.js <script async> + gtag('config') initialisation
 *
 * Injects into <body>:
 *   4. GTM <noscript> iframe — immediately after opening <body> tag
 *
 * Usage:
 *   node scripts/inject-analytics.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const GTM_ID  = 'GTM-TL8TG8CW';
const GA4_ID  = 'G-ZN2XZLEJ3J';

// Official GTM head snippet
const GTM_HEAD =
  `<!-- Google Tag Manager -->\n` +
  `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
  `})(window,document,'script','dataLayer','${GTM_ID}');</script>\n` +
  `<!-- End Google Tag Manager -->`;

// Direct Google Tag (gtag.js) — ensures data stream fires even if GTM consent
// is delayed or blocked, and satisfies GA4 "connected site tag" requirement
const GTAG_HEAD =
  `<!-- Google tag (gtag.js) -->\n` +
  `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>\n` +
  `<script>\n` +
  `  window.dataLayer = window.dataLayer || [];\n` +
  `  function gtag(){dataLayer.push(arguments);}\n` +
  `  gtag('js', new Date());\n` +
  `  gtag('config', '${GA4_ID}');\n` +
  `</script>\n` +
  `<!-- End Google tag -->`;

// Preconnect hint
const PRECONNECT =
  `<link rel="preconnect" href="https://www.googletagmanager.com">`;

// GTM noscript body snippet
const GTM_BODY =
  `<!-- Google Tag Manager (noscript) -->\n` +
  `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"\n` +
  `height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n` +
  `<!-- End Google Tag Manager (noscript) -->`;

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

  const needsGTM  = !html.includes(GTM_ID);
  const needsGtag = !html.includes(GA4_ID);

  if (!needsGTM && !needsGtag) {
    skipped++;
    continue;
  }

  // Build the combined head block to inject once (avoids double regex on <head>)
  const headParts = [];
  if (needsGTM || needsGtag) {
    headParts.push(PRECONNECT);
  }
  if (needsGTM)  headParts.push(GTM_HEAD);
  if (needsGtag) headParts.push(GTAG_HEAD);

  if (headParts.length) {
    html = html.replace(/(<head[^>]*>)/, `$1\n${headParts.join('\n')}`);
  }

  // GTM noscript body — only if GTM wasn't already present
  if (needsGTM) {
    html = html.replace(/(<body[^>]*>)/, `$1\n${GTM_BODY}`);
  }

  writeFileSync(file, html, 'utf8');
  updated++;
  console.log(`  updated: ${relative(ROOT, file)}`);
}

console.log(`\nDone: ${updated} files updated, ${skipped} already had GTM (${GTM_ID}).`);
