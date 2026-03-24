#!/usr/bin/env node
/**
 * cleanup-preconnect.mjs
 *
 * One-time cleanup: removes duplicate <link rel="preconnect"> hints for
 * googletagmanager.com that were added when gtag.js was injected separately
 * after GTM had already been injected (each injection round added a new preconnect).
 *
 * Safe to run multiple times (idempotent after first run).
 * Usage: node scripts/cleanup-preconnect.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const NEEDLE = '<link rel="preconnect" href="https://www.googletagmanager.com">';
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs']);

function* walkHtml(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkHtml(full);
    } else if (entry.endsWith('.html')) {
      yield full;
    }
  }
}

let fixed = 0;
let clean = 0;

for (const file of walkHtml(ROOT)) {
  const html = readFileSync(file, 'utf8');
  const count = html.split(NEEDLE).length - 1;

  if (count <= 1) {
    clean++;
    continue;
  }

  // Keep only the first occurrence; remove subsequent ones
  let firstSeen = false;
  const cleaned = html.replace(/<link rel="preconnect" href="https:\/\/www\.googletagmanager\.com">/g, (match) => {
    if (!firstSeen) {
      firstSeen = true;
      return match;
    }
    return '';
  });

  writeFileSync(file, cleaned, 'utf8');
  fixed++;
  console.log('  fixed: ' + relative(ROOT, file));
}

console.log('\nDone: ' + fixed + ' files cleaned up, ' + clean + ' already clean.');
