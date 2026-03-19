import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd(), process.argv[2] || 'docs');

async function getIndexFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getIndexFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === 'index.html') {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeHref(href) {
  if (!href || !href.startsWith('/')) return null;
  if (href.startsWith('//')) return null;
  if (href.startsWith('/assets/')) return null;
  if (href.startsWith('/mailto:')) return null;
  if (href.startsWith('/tel:')) return null;
  return href.split('#')[0].split('?')[0];
}

async function existsAsRoute(cleanHref) {
  if (cleanHref === '/') {
    return true;
  }

  const routePath = cleanHref.replace(/^\//, '');
  const htmlPath = path.join(root, routePath, 'index.html');
  const directPath = path.join(root, routePath);

  try {
    const stat = await fs.stat(htmlPath);
    if (stat.isFile()) return true;
  } catch {}

  try {
    const stat = await fs.stat(directPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function main() {
  const pages = await getIndexFiles(root);
  const missing = new Map();

  for (const page of pages) {
    const html = await fs.readFile(page, 'utf8');
    for (const match of html.matchAll(/href=\"([^\"]+)\"/g)) {
      const href = match[1];
      const clean = normalizeHref(href);
      if (!clean) continue;

      const exists = await existsAsRoute(clean);
      if (!exists) {
        missing.set(clean, (missing.get(clean) || 0) + 1);
      }
    }
  }

  const sorted = [...missing.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    console.log('No missing internal routes found.');
    return;
  }

  console.log('Missing internal routes:');
  for (const [route, count] of sorted) {
    console.log(`${route} :: ${count}`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
