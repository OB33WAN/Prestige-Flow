import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { load } from 'cheerio';

const rootDir = path.resolve(process.cwd());
const siteUrl = process.env.SITE_URL || 'https://prestigeflow.co.uk';

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'docs', '.public-site', 'admin']);

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
    const $ = load(await fs.readFile(indexFile, 'utf8'));
    if ($('meta[http-equiv="refresh"]').length || /noindex/i.test($('meta[name="robots"]').attr('content') || '')) continue;
    const stat = await fs.stat(indexFile);
    const route = routeFromIndex(rootDir, indexFile);
    const expectedLoc = route === '/' ? `${siteUrl}/` : `${siteUrl}${route}/`;
    const loc = $('link[rel="canonical"]').attr('href');
    const rel = toPosixPath(path.relative(rootDir, indexFile));
    const cmsRoute = rel.match(/^\.cms-generated-pages\/(services|industries|areas)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.html$/u);
    const acceptedCmsLoc = cmsRoute ? `${siteUrl}/${cmsRoute[1]}/${cmsRoute[2]}/` : expectedLoc;
    if (!loc || loc !== acceptedCmsLoc) throw new Error(`Missing or unexpected canonical in ${indexFile}: ${loc || '(missing)'}`);

    records.push({
      route,
      loc,
      lastmod: formatDate(stat.mtime)
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
