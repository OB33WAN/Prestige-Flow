import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { pageFiles } from './site-files.mjs';

const titles = new Set();
const descriptions = new Set();
let content = 0, redirects = 0;
const sitemap = await fs.readFile('sitemap.xml', 'utf8');
const businessData = JSON.parse(await fs.readFile('data/business.json', 'utf8'));
const businessSchema = JSON.parse(await fs.readFile('local-business-schema.jsonld', 'utf8'));
assert.deepEqual(businessSchema.sameAs, businessData.sameAs, 'Business profile links must match verified source data.');
assert.deepEqual(businessSchema.areaServed, businessData.areaServed, 'Business coverage must match verified source data.');
assert.equal(businessSchema.openingHoursSpecification[0].opens, '08:00', 'Schema must show published office hours, not emergency availability.');
assert.equal(businessSchema.openingHoursSpecification[0].closes, '18:00');
assert.ok(!('aggregateRating' in businessSchema) && !('review' in businessSchema), 'Do not publish unverified review markup.');
for (const file of await pageFiles()) {
  const $ = load(await fs.readFile(file, 'utf8'));
  const canonical = $('link[rel="canonical"]').attr('href');
  assert.equal($('link[rel="canonical"]').length, 1, file);
  assert.ok(canonical.startsWith('https://prestigeflow.co.uk/'), file);
  if ($('meta[http-equiv="refresh"]').length) {
    redirects++;
    assert.match($('meta[name="robots"]').attr('content') || '', /noindex/i, `Legacy redirect must be noindex: ${file}`);
    continue;
  }
  content++;
  assert.equal($('html').attr('lang'), 'en-GB', `Language declaration: ${file}`);
  assert.equal($('h1').length, 1, `One visible H1: ${file}`);
  $('a[href^="tel:"]').each((_, element) => {
    const link = $(element);
    const accessibleName = [link.text().trim(), link.attr('aria-label'), link.attr('title'), link.find('img[alt]').attr('alt'), link.find('svg[aria-label]').attr('aria-label')].filter(Boolean).join(' ').trim();
    assert.ok(accessibleName, `Telephone links need an accessible name: ${file}`);
  });
  assert.ok(!titles.has($('title').text()), `Duplicate title: ${file}`);
  titles.add($('title').text());
  assert.ok($('title').text().trim().length > 0 && $('title').text().length <= 70, `Useful title length: ${file}`);
  const description = $('meta[name="description"]').attr('content') || '';
  assert.ok(description.length >= 70 && description.length <= 180, `Description length: ${file}`);
  assert.ok(!descriptions.has(description), `Duplicate description: ${file}`);
  descriptions.add(description);
  assert.equal($('meta[property="og:url"]').attr('content'), canonical, `Open Graph URL must match canonical: ${file}`);
  assert.equal($('meta[property="og:title"]').attr('content'), $('title').text(), `Open Graph title must match page title: ${file}`);
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `Sitemap: ${file}`);
  assert.equal($('#seo-fallback').length, 0, file);
  let hasBusiness = false;
  $('script[type="application/ld+json"]').each((_, e) => {
    const schema = JSON.parse($(e).text());
    for (const entity of (schema['@graph'] || [schema])) {
      if (entity['@id'] !== 'https://prestigeflow.co.uk/#business') continue;
      hasBusiness = true;
      assert.deepEqual(entity.sameAs, businessData.sameAs, `Business profiles must match verified source data: ${file}`);
      assert.deepEqual(entity.areaServed, businessData.areaServed, `Business coverage must match verified source data: ${file}`);
      assert.equal(entity.openingHoursSpecification[0].opens, '08:00', `Office hours must be accurate: ${file}`);
      assert.equal(entity.openingHoursSpecification[0].closes, '18:00', `Office hours must be accurate: ${file}`);
      assert.ok(!('aggregateRating' in entity) && !('review' in entity), `Unverified review markup: ${file}`);
    }
  });
  assert.ok(hasBusiness, `Business entity: ${file}`);
}
assert.equal((sitemap.match(/<loc>/g) || []).length, content);
const products = JSON.parse(await fs.readFile('data/stripe-product-map.json', 'utf8')).mapping;
const links = JSON.parse(await fs.readFile('data/stripe-payment-link-map.json', 'utf8')).payment_links;
for (const product of products) {
  assert.equal(product.checkout_ready, false, `Only verified 10% deposit checkout links may be enabled: ${product.sku}`);
  const link = links.find(x => x.sku === product.sku);
  assert.ok(link, product.sku);
  assert.equal(link.price_id, product.price_id, product.sku);
  assert.equal(link.payment_link_url, product.payment_link_url, product.sku);
  assert.match(link.payment_link_url, /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/);
}
console.log(`PASS: ${content} content pages, ${redirects} redirects, ${products.length} Stripe mappings; metadata, sitemap, headings and JSON-LD.`);
