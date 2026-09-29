import fs from 'node:fs/promises';
import path from 'node:path';
import { publicDirectories } from './site-files.mjs';

// Package the local source, never scrape production over locally edited files.
const root = process.cwd();
const output = path.join(root, '.public-site');
if (path.resolve(output) !== path.resolve(root, '.public-site')) throw new Error('Invalid build directory');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const dir of publicDirectories) await fs.cp(path.join(root, dir), path.join(output, dir), { recursive: true });
for (const file of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'manifest.json', 'favicon.jpg', 'logo.jpg', 'share-image.jpg', 'llms.txt', 'ai.txt', 'local-business-schema.jsonld', 'CNAME', '.nojekyll']) {
  await fs.copyFile(path.join(root, file), path.join(output, file));
}
await fs.mkdir(path.join(output, 'data'), { recursive: true });
for (const file of ['stripe-product-map.json', 'stripe-payment-link-map.json']) await fs.copyFile(path.join(root, 'data', file), path.join(output, 'data', file));
console.log('Packaged public site in .public-site.');
