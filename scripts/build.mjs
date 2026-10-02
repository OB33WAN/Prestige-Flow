import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publicDirectories } from './site-files.mjs';

// Package the local source, never scrape production over locally edited files.
const root = process.cwd();
const output = path.join(root, '.public-site');
if (path.resolve(output) !== path.resolve(root, '.public-site')) throw new Error('Invalid build directory');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const dir of publicDirectories) await fs.cp(path.join(root, dir), path.join(output, dir), { recursive: true });
for (const file of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'manifest.json', 'favicon.jpg', 'logo.jpg', 'share-image.jpg', 'llms.txt', 'local-business-schema.jsonld', 'CNAME', '.nojekyll']) {
  await fs.copyFile(path.join(root, file), path.join(output, file));
}
try { await fs.cp(path.join(root, '.cms-generated-pages'), output, { recursive: true, force: true }); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

// Cloudflare may keep CSS and JavaScript at the same URL for the full asset
// cache lifetime after a fresh HTML deploy. Give each local CSS/JS file a
// content-fingerprinted filename so new deploys bypass old edge cache entries.
const assetVersions = new Map();
const assetsDir = path.join(output, 'assets');
for (const entry of await fs.readdir(assetsDir, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:css|js)$/iu.test(entry.name)) continue;
  const relative = `assets/${entry.name}`;
  const bytes = await fs.readFile(path.join(assetsDir, entry.name));
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const versionedRelative = relative.replace(/(\.[^.]+)$/u, `.${version}$1`);
  assetVersions.set(`/${relative}`, `/${versionedRelative}`);
  await fs.copyFile(path.join(assetsDir, entry.name), path.join(assetsDir, path.basename(versionedRelative)));
}

async function addAssetFingerprints(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await addAssetFingerprints(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    let html = await fs.readFile(fullPath, 'utf8');
    html = html.replace(/(\b(?:src|href)=["'])(\/assets\/[^"']+)(["'])/giu, (match, before, assetUrl, after) => {
      const [assetPath] = assetUrl.split('?');
      const versionedPath = assetVersions.get(assetPath);
      return versionedPath ? `${before}${versionedPath}${after}` : match;
    });
    await fs.writeFile(fullPath, html, 'utf8');
  }
}

await addAssetFingerprints(output);
console.log('Packaged public site in .public-site.');
