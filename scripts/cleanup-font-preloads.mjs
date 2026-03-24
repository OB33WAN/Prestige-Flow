#!/usr/bin/env node
/**
 * Removes unused Google Fonts preload lines that trigger browser warnings.
 * These fonts are still loaded through the Google Fonts stylesheet below.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'dist']);

const PRELOAD_BLOCK = /\s*<!-- Preload critical fonts to reduce CLS -->\r?\n\s*<link rel="preload" href="https:\/\/fonts\.gstatic\.com\/s\/inter\/v20\/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw\.woff2" as="font" type="font\/woff2" crossorigin="">\r?\n\s*<link rel="preload" href="https:\/\/fonts\.gstatic\.com\/s\/poppins\/v24\/pxiByp8kv8JHgFVrLCz7Z1xlFd2JQEk\.woff2" as="font" type="font\/woff2" crossorigin="">\r?\n/g;

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
  const html = readFileSync(file, 'utf8');
  const next = html.replace(PRELOAD_BLOCK, '\n');

  if (next === html) {
    skipped++;
    continue;
  }

  writeFileSync(file, next, 'utf8');
  updated++;
  console.log(`  updated: ${relative(ROOT, file)}`);
}

console.log(`\nDone: ${updated} files updated, ${skipped} files already clean.`);