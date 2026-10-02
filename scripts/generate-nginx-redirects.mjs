import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pageFiles } from './site-files.mjs';

const root = path.resolve(process.argv[2] || process.cwd());
const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
const indexable = new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/gu)].map((match) => match[1]));
const redirects = [];

function routeFor(file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const route = relative.replace(/(?:^|\/)index\.html$/u, '');
  return route ? `/${route}/` : '/';
}

for (const file of await pageFiles(root)) {
  const source = await fs.readFile(file, 'utf8');
  if (!/<meta\s+http-equiv=["']refresh["']/iu.test(source)) continue;

  const route = routeFor(file);
  const canonical = source.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/iu)?.[1];
  const refresh = source.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][^"']*?url=([^"']+)["']/iu)?.[1];
  const target = canonical || (refresh ? new URL(refresh, `https://prestigeflow.co.uk${route}`).href : null);

  if (!target || !target.startsWith('https://prestigeflow.co.uk/') || !indexable.has(target)) {
    throw new Error(`Redirect must target an indexable canonical URL: ${file} -> ${target || '(missing)'}`);
  }
  if (target === `https://prestigeflow.co.uk${route}`) throw new Error(`Self-redirect found: ${file}`);

  const targetPath = new URL(target).pathname;
  const noSlashRoute = route.slice(0, -1);
  const sourcePaths = [...new Set([route, noSlashRoute, `${route}index.html`])];
  for (const sourcePath of sourcePaths) redirects.push({ sourcePath, targetPath });
}

const lines = [
  '# Generated from the noindex legacy HTML redirects. Do not edit by hand.',
  ...redirects.map(({ sourcePath, targetPath }) => `location = ${sourcePath} { return 301 ${targetPath}; }`),
  ''
];
const output = path.join(root, 'deploy', 'easypanel', 'legacy-redirects.conf');
await fs.writeFile(output, lines.join('\n'), 'utf8');
console.log(`Generated ${redirects.length / 3} canonical redirects (${redirects.length} request paths) in ${path.relative(root, output)}.`);
