#!/usr/bin/env node
/**
 * inject-gbp.mjs
 *
 * Adds the Google Business Profile (Maps) URL to every sameAs array found
 * inside JSON-LD <script> blocks in all HTML files. Idempotent — skips files
 * that already contain the Maps URL.
 *
 * Also updates local-business-schema.jsonld.
 *
 * Usage:
 *   node scripts/inject-gbp.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const MAPS_URL = 'https://maps.app.goo.gl/5yFzWuK9G7n6xAp48';
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

/**
 * Finds all "sameAs":[...] occurrences in the string and appends MAPS_URL
 * to any array that doesn't already contain it.
 */
function injectIntoSameAs(html) {
  return html.replace(/"sameAs":\[([^\]]*)\]/g, (match, inner) => {
    if (inner.includes(MAPS_URL)) return match; // already present
    // Append the new URL to the existing array entries
    const separator = inner.trim().length > 0 ? ',' : '';
    return `"sameAs":[${inner}${separator}"${MAPS_URL}"]`;
  });
}

let updated = 0;
let skipped = 0;

// --- Update HTML files ---
for (const file of walkHtml(ROOT)) {
  let html = readFileSync(file, 'utf8');

  if (html.includes(MAPS_URL)) {
    skipped++;
    continue;
  }

  const next = injectIntoSameAs(html);
  if (next === html) {
    skipped++; // no sameAs array found in this file
    continue;
  }

  writeFileSync(file, next, 'utf8');
  updated++;
  console.log(`  updated: ${relative(ROOT, file)}`);
}

// --- Update local-business-schema.jsonld ---
const schemaPath = join(ROOT, 'local-business-schema.jsonld');
let schema = readFileSync(schemaPath, 'utf8');
if (!schema.includes(MAPS_URL)) {
  // Insert before the closing ] of the sameAs array
  schema = schema.replace(
    /("sameAs"\s*:\s*\[[\s\S]*?)(])/,
    (match, before, closing) => {
      const trimmed = before.trimEnd();
      const needsComma = !trimmed.endsWith('[');
      return `${trimmed}${needsComma ? ',' : ''}\n    "${MAPS_URL}"\n  ${closing}`;
    }
  );
  writeFileSync(schemaPath, schema, 'utf8');
  console.log(`  updated: local-business-schema.jsonld`);
  updated++;
} else {
  console.log(`  skipped: local-business-schema.jsonld (already present)`);
  skipped++;
}

console.log(`\nDone: ${updated} files updated, ${skipped} files skipped.`);
