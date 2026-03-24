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

const GTM_ID   = 'GTM-TL8TG8CW';
const GA4_ID   = 'G-ZN2XZLEJ3J';   // GA4 Measurement ID
const GT1_ID   = 'GT-TNFNVQQZ';     // Google Tag
const AW_ID    = 'AW-17754305332';  // Google Ads
const GT2_ID   = 'GT-NGKVLSZN';     // Google Tag

// All additional tag IDs that must appear in the gtag config block
const EXTRA_IDS = [GT1_ID, AW_ID, GT2_ID];

// Official GTM head snippet
const GTM_HEAD =
  `<!-- Google Tag Manager -->\n` +
  `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
  `})(window,document,'script','dataLayer','${GTM_ID}');</script>\n` +
  `<!-- End Google Tag Manager -->`;

// Direct Google Tag (gtag.js) — fires GA4 + all GTM container tags directly,
// satisfies GA4 "connected site tag" requirement and Google Ads conversion tracking.
// All four IDs from the GTM-TL8TG8CW container are configured here.
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

// The single-config snippet that exists in already-injected files (to be upgraded)
const OLD_GTAG_SINGLE =
  `  gtag('config', '${GA4_ID}');\n` +
  `</script>\n` +
  `<!-- End Google tag -->`;

const NEW_GTAG_MULTI =
  `  gtag('config', '${GA4_ID}');\n` +
  `  gtag('config', '${GT1_ID}');\n` +
  `  gtag('config', '${AW_ID}');\n` +
  `  gtag('config', '${GT2_ID}');\n` +
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

  const needsGTM       = !html.includes(GTM_ID);
  const needsGtag      = !html.includes(GA4_ID);
  const needsExtraIds  = EXTRA_IDS.some((id) => !html.includes(id));

  // Upgrade existing single-config gtag snippet to multi-config (migration)
  if (!needsGtag && needsExtraIds && html.includes(OLD_GTAG_SINGLE)) {
    html = html.replace(OLD_GTAG_SINGLE, NEW_GTAG_MULTI);
    writeFileSync(file, html, 'utf8');
    updated++;
    console.log(`  upgraded: ${relative(ROOT, file)}`);
    continue;
  }

  if (!needsGTM && !needsGtag && !needsExtraIds) {
    skipped++;
    continue;
  }

  // Build the combined head block to inject once (avoids double regex on <head>)
  const needsPreconnect = !html.includes('preconnect" href="https://www.googletagmanager.com"');
  const headParts = [];
  if (needsPreconnect) headParts.push(PRECONNECT);
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

console.log(`\nDone: ${updated} files updated/upgraded, ${skipped} already fully tagged.`);
