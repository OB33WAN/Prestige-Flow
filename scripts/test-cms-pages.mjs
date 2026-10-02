import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'content', 'cms', 'services', '.cms-ci-test.md');
const generated = path.join(root, '.cms-generated-pages', 'services', 'cms-ci-test', 'index.html');
const paragraph = 'A careful on-site assessment records the symptoms, access conditions, pipe layout and any previous repair history. This context helps the engineer explain suitable next steps and identify when a specialist inspection may be useful. Clear communication supports owners, occupants and property managers while keeping decisions tied to the condition found at the property. We explain access needs and discuss additional work before it proceeds. These notes can also help organise future maintenance and provide a useful record for anyone responsible for the building. These practical observations help explain clear options without assuming what the inspection will find. Example input <script>window.cmsXss=1</script> stays as text.';
const fields = [
  '---',
  'title: Drainage advice in Maidenhead | Prestige Flow',
  'slug: cms-ci-test',
  "description: Practical drainage advice for Maidenhead properties, including symptoms, investigation options and how to prepare for an engineer's visit.",
  'heading: Drainage advice in Maidenhead',
  'intro: Prestige Flow helps property owners understand drainage symptoms and plan a useful next step. We discuss the site, access and service needs before arranging a visit.',
  "hero_image: ''",
  "hero_image_alt: ''",
  'sections:',
  '  - heading: Understand the symptoms',
  '    body: >-',
  `      ${paragraph}`,
  '  - heading: Choose an appropriate investigation',
  '    body: >-',
  `      ${paragraph}`,
  '  - heading: Prepare for a site visit',
  '    body: >-',
  `      ${paragraph}`,
  'internal_links:',
  '  - label: Drainage services',
  '    url: /services/drainage/',
  '---',
  ''
].join('\n');

try {
  await fs.writeFile(source, fields, 'utf8');
  execFileSync(process.execPath, ['scripts/build-cms-pages.mjs'], { cwd: root, stdio: 'pipe' });
  const html = await fs.readFile(generated, 'utf8');
  assert.match(html, /<title>Drainage advice in Maidenhead \| Prestige Flow<\/title>/u);
  assert.match(html, /<link rel="canonical" href="https:\/\/prestigeflow\.co\.uk\/services\/cms-ci-test\/">/u);
  assert.match(html, /<h1>Drainage advice in Maidenhead<\/h1>/u);
  assert.match(html, /href="\/services\/drainage\/"/u);
  assert.doesNotMatch(html, /<script>window\.cmsXss/u, 'Raw editor HTML must not be emitted as executable markup.');

  await fs.writeFile(source, fields.replace(paragraph, `£120/hr ${paragraph}`), 'utf8');
  let rejected = false;
  try { execFileSync(process.execPath, ['scripts/build-cms-pages.mjs'], { cwd: root, stdio: 'pipe' }); }
  catch (error) { rejected = /Pricing and payment terms are centrally managed/u.test(String(error.stderr)); }
  assert.ok(rejected, 'Build must reject CMS content that introduces rates or payment promises.');
  console.log('PASS: CMS page generation, SEO metadata, internal links, safe Markdown and pricing controls.');
} finally {
  await fs.rm(source, { force: true });
  execFileSync(process.execPath, ['scripts/build-cms-pages.mjs'], { cwd: root, stdio: 'pipe' });
}
