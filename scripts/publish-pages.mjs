import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'dist');
const targetDir = path.join(rootDir, 'docs');

async function copyDirectory(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

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

function normalizeInternalHref(href) {
  if (!href || !href.startsWith('/')) return null;
  if (href.startsWith('//')) return null;
  if (href.startsWith('/assets/')) return null;

  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  if (clean.endsWith('.jpg') || clean.endsWith('.png') || clean.endsWith('.svg') || clean.endsWith('.webp')) return null;

  return clean;
}

async function routeExists(route) {
  if (route === '/') {
    try {
      const stat = await fs.stat(path.join(targetDir, 'index.html'));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  const normalized = route.replace(/^\//, '');
  const indexPath = path.join(targetDir, normalized, 'index.html');
  const directPath = path.join(targetDir, normalized);

  try {
    const stat = await fs.stat(indexPath);
    if (stat.isFile()) return true;
  } catch {}

  try {
    const stat = await fs.stat(directPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function findAliasTarget(route) {
  if (/^\/areas\/[^/]+\/(drainage|plumbing|emergency-drainage)$/.test(route)) {
    return route.replace(/\/(drainage|plumbing|emergency-drainage)$/, '');
  }

  if (/^\/industries\/[^/]+$/.test(route)) {
    return '/industries';
  }

  if (route === '/services/blocked-toilet') {
    return '/services/plumbing';
  }

  const parts = route.split('/').filter(Boolean);
  while (parts.length > 0) {
    parts.pop();
    const candidate = `/${parts.join('/')}` || '/';
    if (candidate === route) {
      continue;
    }

    if (await routeExists(candidate)) {
      return candidate;
    }
  }

  return '/';
}

function redirectHtml(targetRoute) {
  const safeTarget = targetRoute || '/';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting...</title>
  <link rel="canonical" href="${safeTarget}">
  <meta http-equiv="refresh" content="0; url=${safeTarget}">
  <script>window.location.replace(${JSON.stringify(safeTarget)});</script>
</head>
<body>
  <p>Redirecting to <a href="${safeTarget}">${safeTarget}</a>...</p>
</body>
</html>
`;
}

async function createAliasPages() {
  const pages = await getIndexFiles(targetDir);
  const missing = new Set();

  for (const page of pages) {
    const html = await fs.readFile(page, 'utf8');
    for (const match of html.matchAll(/href=\"([^\"]+)\"/g)) {
      const route = normalizeInternalHref(match[1]);
      if (!route) continue;
      if (await routeExists(route)) continue;
      missing.add(route);
    }
  }

  let created = 0;
  for (const route of missing) {
    const target = await findAliasTarget(route);
    if (!target || target === route) continue;

    const aliasDir = path.join(targetDir, route.replace(/^\//, ''));
    await fs.mkdir(aliasDir, { recursive: true });
    await fs.writeFile(path.join(aliasDir, 'index.html'), redirectHtml(target), 'utf8');
    created += 1;
  }

  return created;
}

async function main() {
  try {
    await fs.access(sourceDir);
  } catch {
    throw new Error('dist/ not found. Run "npm run vanilla" first.');
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await copyDirectory(sourceDir, targetDir);

  const aliasCount = await createAliasPages();

  const noJekyllPath = path.join(targetDir, '.nojekyll');
  await fs.writeFile(noJekyllPath, '\n');

  console.log(`Published static site to docs/ for GitHub Pages. Added ${aliasCount} alias pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
