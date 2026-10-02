import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
const output = path.join(root, '.public-site');
for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt', 'local-business-schema.jsonld']) {
  assert.equal(await fs.readFile(path.join(output, file), 'utf8'), await fs.readFile(path.join(root, file), 'utf8'), `Packaged public file: ${file}`);
}
await assert.rejects(fs.access(path.join(output, 'ai.txt')), { code: 'ENOENT' });
const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.[a-f0-9]{12}\.(?:css|js))["']/gu)];
assert.ok(assets.length, 'Packaged homepage must reference fingerprinted assets.');
for (const [, asset] of assets) await fs.access(path.join(output, asset.slice(1)));
console.log('PASS: Site packages without deleted ai.txt and retains public files and fingerprinted assets.');
