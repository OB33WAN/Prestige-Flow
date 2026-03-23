import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = path.resolve(process.cwd());
const siteUrl = process.env.SITE_URL || 'https://prestigeflow.co.uk';

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'docs']);

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function shouldSkip(relativePath) {
  const parts = toPosixPath(relativePath).split('/');
  return parts.some((part) => skipDirs.has(part));
}

function formatDate(input) {
  const value = new Date(input);
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function routeFromIndex(root, filePath) {
  const relative = toPosixPath(path.relative(root, filePath));
  const route = relative.replace(/\/index\.html$/u, '').replace(/index\.html$/u, '');

  if (!route || route === '') {
    return '/';
  }

  return `/${route}`;
}

function computePriority(route) {
  if (route === '/') return '1.0';
  if (route === '/services' || route === '/areas' || route === '/booking' || route === '/quote' || route === '/contact') return '0.9';
  if (route.startsWith('/services/')) return '0.85';
  if (route.startsWith('/areas/') && route.split('/').length <= 3) return '0.8';
  if (route.startsWith('/areas/') && route.split('/').length >= 4) return '0.75';
  if (route.startsWith('/blog/')) return '0.7';
  return '0.65';
}

function computeChangeFreq(route) {
  if (route === '/') return 'weekly';
  if (route.startsWith('/blog/')) return 'monthly';
  if (route === '/blog') return 'weekly';
  return 'monthly';
}

async function collectIndexFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(rootDir, fullPath);

    if (shouldSkip(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await collectIndexFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === 'index.html') {
      files.push(fullPath);
    }
  }

  return files;
}

function buildXml(urls) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const item of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${item.loc}</loc>`);
    lines.push(`    <lastmod>${item.lastmod}</lastmod>`);
    lines.push(`    <changefreq>${item.changefreq}</changefreq>`);
    lines.push(`    <priority>${item.priority}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const indexFiles = await collectIndexFiles(rootDir);
  const records = [];

  for (const indexFile of indexFiles) {
    const stat = await fs.stat(indexFile);
    const route = routeFromIndex(rootDir, indexFile);
    const loc = route === '/' ? `${siteUrl}/` : `${siteUrl}${route}`;

    records.push({
      route,
      loc,
      lastmod: formatDate(stat.mtime),
      changefreq: computeChangeFreq(route),
      priority: computePriority(route)
    });
  }

  const deduped = [...new Map(records.map((item) => [item.route, item])).values()]
    .sort((a, b) => a.route.localeCompare(b.route));

  const xml = buildXml(deduped);
  const sitemapPath = path.join(rootDir, 'sitemap.xml');
  await fs.writeFile(sitemapPath, xml, 'utf8');

  console.log(`Generated sitemap.xml with ${deduped.length} URLs.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
